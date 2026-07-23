import { parseXImportRequest, parseXPostUrl, type XImportResponse, type XSource, type XSourceResult } from "../../src/x-integration"

interface Env {
  X_BEARER_TOKEN?: string
  ALLOWED_ORIGIN?: string
  X_IMPORT_RATE_LIMITER?: RateLimiter
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

interface User {
  id: string
  username: string
}

interface ReplyPost {
  authorId: string
  conversationId: string
  references: unknown[]
}

interface Page {
  users: User[]
  nextToken?: string
  unavailable: number
  partial: boolean
}

interface ImportedSource {
  handles: string[]
  result: XSourceResult
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const API_ORIGIN = "https://api.x.com"
const MAX_BODY_BYTES = 2_048
const MAX_X_BODY_BYTES = 512_000
const MAX_PAGES = 10
const MAX_ACCOUNTS = 1_000
const MAX_SUBREQUESTS = 40
const REQUEST_TIMEOUT_MS = 8_000
const IMPORT_TIMEOUT_MS = 25_000
const RETRIES = 2

interface ImportContext {
  signal: AbortSignal
  subrequests: number
  conversationId?: string
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function corsOrigin(request: Request, allowed?: string) {
  const origin = request.headers.get("origin")
  const own = new URL(request.url).origin
  if (!origin) return own
  if (origin === own || (allowed && origin === allowed)) return origin
  return null
}

function headers(origin: string, extra?: Record<string, string>) {
  return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": origin, "vary": "Origin", ...extra }
}

function json(origin: string, status: number, body: unknown, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin, extra) })
}

function clientKey(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? "unknown"
}

async function delay(milliseconds: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const aborted = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve() }, milliseconds)
    signal.addEventListener("abort", aborted, { once: true })
  })
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, maximum: number, signal?: AbortSignal) {
  if (!stream) return ""
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ""
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return
    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })
  aborted.catch(() => undefined)
  try {
    while (true) {
      const part = signal ? await Promise.race([reader.read(), aborted]) : await reader.read()
      if (part.done) return text + decoder.decode()
      size += part.value.byteLength
      if (size > maximum) throw new Error("body-too-large")
      text += decoder.decode(part.value, { stream: true })
    }
  } catch (caught) {
    void reader.cancel().catch(() => undefined)
    throw caught
  }
}

function discard(body: ReadableStream<Uint8Array> | null) {
  void body?.cancel().catch(() => undefined)
}

async function xFetch(url: URL, token: string, fetcher: Fetcher, context: ImportContext): Promise<string> {
  if (url.origin !== API_ORIGIN) throw new Error("Invalid X API target")
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (context.signal.aborted) throw context.signal.reason
    if (context.subrequests >= MAX_SUBREQUESTS) throw new Error("subrequest-limit")
    context.subrequests += 1
    const controller = new AbortController()
    const signal = AbortSignal.any([context.signal, controller.signal])
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const attempted = fetcher(url, { headers: { authorization: `Bearer ${token}`, "user-agent": "GlassPick/1.0" }, redirect: "error", signal })
      attempted.catch(() => undefined)
      const response = await Promise.race([
        attempted,
        new Promise<never>((_, reject) => {
          if (signal.aborted) { reject(signal.reason ?? new Error("aborted")); return }
          signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true })
        }),
      ])
      if (response.status === 429) {
        const reset = Number(response.headers.get("x-rate-limit-reset")) * 1000
        const wait = Number.isFinite(reset) ? reset - Date.now() + 500 : 0
        discard(response.body)
        if (attempt < RETRIES && wait > 0 && wait <= 2_000) { await delay(wait, context.signal); continue }
        throw new Error("rate-limit")
      }
      if ((response.status >= 500 || response.status === 408) && attempt < RETRIES) { discard(response.body); await delay(250 * 2 ** attempt, context.signal); continue }
      if (!response.ok) { discard(response.body); throw new Error(`status-${response.status}`) }
      return await readBounded(response.body, MAX_X_BODY_BYTES, signal)
    } catch (caught) {
      if (context.signal.aborted) throw context.signal.reason
      if (attempt < RETRIES && !(caught instanceof Error && (caught.message === "rate-limit" || caught.message.startsWith("status-") || caught.message === "body-too-large"))) { await delay(250 * 2 ** attempt, context.signal); continue }
      throw caught
    } finally { clearTimeout(timer) }
  }
  throw new Error("upstream")
}

function parseUsers(value: unknown, reply?: { postId: string; conversationId: string }): Page {
  if (!object(value)) throw new Error("invalid-upstream")
  if (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length > 200)) throw new Error("invalid-upstream")
  const errorEntries = Array.isArray(value.errors) ? value.errors : []
  const errorKeys = new Set(errorEntries.map((entry) => {
    if (!object(entry) || typeof entry.resource_type !== "string" || !/^[a-z_]{1,50}$/.test(entry.resource_type) || typeof entry.resource_id !== "string" || !/^[0-9]{1,19}$/.test(entry.resource_id)) throw new Error("invalid-upstream")
    return `${entry.resource_type}:${entry.resource_id}`
  }))
  if (errorKeys.size !== errorEntries.length) throw new Error("invalid-upstream")
  const unavailable = errorKeys.size
  if (!object(value.meta) || (value.data !== undefined && !Array.isArray(value.data))) throw new Error("invalid-upstream")
  const meta = value.meta
  if (!Number.isSafeInteger(meta.result_count) || Number(meta.result_count) < 0 || Number(meta.result_count) > 100) throw new Error("invalid-upstream")
  const data = Array.isArray(value.data) ? value.data : []
  if (Number(meta.result_count) !== data.length) throw new Error("invalid-upstream")
  if (meta.next_token !== undefined && (typeof meta.next_token !== "string" || meta.next_token.length === 0 || meta.next_token.length > 512)) throw new Error("invalid-upstream")
  const nextToken = typeof meta.next_token === "string" ? meta.next_token : undefined
  if (reply) {
    if (!/^[0-9]{1,19}$/.test(reply.conversationId)) throw new Error("invalid-upstream")
    if (value.includes !== undefined && !object(value.includes)) throw new Error("invalid-upstream")
    const includes = object(value.includes) ? value.includes : {}
    if (includes.users !== undefined && !Array.isArray(includes.users)) throw new Error("invalid-upstream")
    const usersValue = Array.isArray(includes.users) ? includes.users : []
    const users = usersValue.map(parseUser)
    const duplicates = countIdentityDuplicates(users)
    const posts: ReplyPost[] = data.map((post) => {
      if (!object(post) || typeof post.author_id !== "string" || !/^[0-9]{1,19}$/.test(post.author_id) || typeof post.conversation_id !== "string" || !/^[0-9]{1,19}$/.test(post.conversation_id) || !Array.isArray(post.referenced_tweets) || post.referenced_tweets.length > 10) throw new Error("invalid-upstream")
      for (const reference of post.referenced_tweets) {
        if (!object(reference) || typeof reference.type !== "string" || !["replied_to", "quoted", "retweeted"].includes(reference.type) || typeof reference.id !== "string" || !/^[0-9]{1,19}$/.test(reference.id)) throw new Error("invalid-upstream")
      }
      return { authorId: post.author_id, conversationId: post.conversation_id, references: post.referenced_tweets }
    })
    const authorIds = new Set(posts.filter((post) => post.conversationId === reply.conversationId && post.references.some((reference) => object(reference) && reference.type === "replied_to" && reference.id === reply.postId)).map((post) => post.authorId))
    const selected = users.filter((user) => authorIds.has(user.id))
    return { users: selected, nextToken, unavailable, partial: unavailable > 0 || duplicates > 0 || authorIds.size !== new Set(selected.map((user) => user.id)).size }
  }
  const users = data.map(parseUser)
  const duplicates = countIdentityDuplicates(users)
  return { users, nextToken, unavailable, partial: unavailable > 0 || duplicates > 0 }
}

function parseUser(value: unknown): { id: string; username: string } {
  if (!object(value) || typeof value.id !== "string" || !/^[0-9]{1,19}$/.test(value.id) || typeof value.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(value.username)) throw new Error("invalid-upstream")
  return { id: value.id, username: value.username }
}

function countIdentityDuplicates(users: Array<{ id: string; username: string }>): number {
  const ids = new Map<string, string>()
  const names = new Map<string, string>()
  let duplicates = 0
  for (const user of users) {
    const name = user.username.toLowerCase()
    const existing = ids.get(user.id)
    const claimedBy = names.get(name)
    if (existing !== undefined) {
      if (existing !== user.username) throw new Error("identity-conflict")
      duplicates += 1
      continue
    }
    if (claimedBy !== undefined && claimedBy !== user.id) throw new Error("identity-conflict")
    ids.set(user.id, user.username)
    names.set(name, user.id)
  }
  return duplicates
}

function sourceUrl(source: XSource, postId: string) {
  if (source === "likes") return new URL(`/2/tweets/${postId}/liking_users?max_results=100`, API_ORIGIN)
  if (source === "reposts") return new URL(`/2/tweets/${postId}/retweeted_by?max_results=100`, API_ORIGIN)
  const url = new URL("/2/tweets/search/recent", API_ORIGIN)
  url.searchParams.set("query", `conversation_id:${postId} is:reply`)
  url.searchParams.set("max_results", "100")
  url.searchParams.set("expansions", "author_id")
  url.searchParams.set("tweet.fields", "author_id,conversation_id,referenced_tweets")
  url.searchParams.set("user.fields", "username")
  return url
}

async function resolvePost(postId: string, token: string, fetcher: Fetcher, context: ImportContext) {
  const url = new URL(`/2/tweets/${postId}`, API_ORIGIN)
  url.searchParams.set("tweet.fields", "author_id,conversation_id")
  url.searchParams.set("expansions", "author_id")
  url.searchParams.set("user.fields", "username")
  const value = JSON.parse(await xFetch(url, token, fetcher, context)) as unknown
  if (!object(value) || value.errors !== undefined || !object(value.data) || value.data.id !== postId || typeof value.data.conversation_id !== "string" || !/^[0-9]{1,19}$/.test(value.data.conversation_id) || typeof value.data.author_id !== "string" || !/^[0-9]{1,19}$/.test(value.data.author_id)) throw new Error("invalid-upstream")
  const authorId = value.data.author_id
  const users = object(value.includes) && Array.isArray(value.includes.users) ? value.includes.users : []
  const matching = users.filter(object).filter((user) => user.id === authorId)
  const author = matching[0]
  if (matching.length !== 1 || !author || typeof author.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(author.username)) throw new Error("invalid-upstream")
  return { conversationId: value.data.conversation_id, authorUsername: author.username }
}

async function importSource(source: XSource, postId: string, token: string, fetcher: Fetcher, context: ImportContext): Promise<ImportedSource> {
  const handles: string[] = []
  const seen = new Map<string, string>()
  const claimed = new Map<string, string>()
  let pages = 0
  let unavailable = 0
  let nextToken: string | undefined
  let complete = false
  let upstreamPartial = false
  let dropped = false
  let note: string | undefined
  try {
    do {
      const url = sourceUrl(source, postId)
      if (source === "replies") url.searchParams.set("query", `conversation_id:${context.conversationId ?? postId} is:reply`)
      if (nextToken) url.searchParams.set(source === "replies" ? "next_token" : "pagination_token", nextToken)
      const page = parseUsers(JSON.parse(await xFetch(url, token, fetcher, context)) as unknown, source === "replies" ? { postId, conversationId: context.conversationId ?? postId } : undefined)
      const pageSeen = new Map<string, string>()
      const pageClaimed = new Map<string, string>()
      for (const user of page.users) {
        const name = user.username.toLowerCase()
        const existing = seen.get(user.id) ?? pageSeen.get(user.id)
        if (existing !== undefined && existing !== user.username) throw new Error("identity-conflict")
        const claimedBy = claimed.get(name) ?? pageClaimed.get(name)
        if (claimedBy !== undefined && claimedBy !== user.id) throw new Error("identity-conflict")
        pageSeen.set(user.id, user.username); pageClaimed.set(name, user.id)
      }
      pages += 1; unavailable += page.unavailable
      for (const user of page.users) {
        if (seen.has(user.id)) { upstreamPartial = true; continue }
        if (handles.length >= MAX_ACCOUNTS) { dropped = true; continue }
        seen.set(user.id, user.username); claimed.set(user.username.toLowerCase(), user.id); handles.push(user.username)
      }
      nextToken = page.nextToken
      upstreamPartial ||= page.partial
      if (!nextToken) complete = !upstreamPartial && !dropped
    } while (source !== "likes" && nextToken && pages < MAX_PAGES && handles.length < MAX_ACCOUNTS)
    if (source === "likes") {
      complete = false
      note = "GlassPick imports only the first X API page, containing at most 100 liking users."
    } else if (!complete) note = upstreamPartial
      ? "X reported or omitted resources that could not be resolved."
      : dropped || handles.length >= MAX_ACCOUNTS
        ? `Stopped at the ${MAX_ACCOUNTS}-account safety limit.`
        : `Stopped at the ${MAX_PAGES}-page safety limit.`
  } catch (caught) {
    if (context.signal.aborted) throw context.signal.reason
    complete = false
    if (caught instanceof Error && caught.message === "identity-conflict") {
      handles.length = 0
      seen.clear()
      note = "X returned conflicting account identities, so this source was discarded."
      if (source === "replies") note += " Recent search covers only the previous seven days; only direct reply authors are included."
      return { handles, result: { source, fetched: 0, pages, complete: false, limited: true, unavailable, note } }
    }
    note = caught instanceof Error && caught.message === "rate-limit"
      ? "X rate limit reached before this source completed."
      : caught instanceof Error && caught.message === "subrequest-limit"
        ? "Stopped at the per-import X request safety limit."
      : caught instanceof Error && (caught.message === "status-401" || caught.message === "status-403")
        ? "The configured X token cannot access this source."
        : "X could not complete this source."
  }
  if (source === "replies") note = [note, "Recent search covers only the previous seven days; only direct reply authors are included."].filter(Boolean).join(" ")
  return { handles, result: { source, fetched: handles.length, pages, complete, limited: source === "likes" || source === "replies" || !complete, unavailable, ...(note ? { note } : {}) } }
}

export async function handleXEntrants(request: Request, env: Env, fetcher: Fetcher = fetch) {
  const origin = corsOrigin(request, env.ALLOWED_ORIGIN)
  if (!origin) return new Response(null, { status: 403 })
  if (new URL(request.url).pathname !== "/api/x/entrants") return json(origin, 404, { error: "Not found" })
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin, { "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" }) })
  if (request.method !== "POST") return json(origin, 405, { error: "Method not allowed" }, { allow: "POST, OPTIONS" })
  if (!env.X_BEARER_TOKEN) return json(origin, 503, { error: "X API access is not configured" })
  if (!env.X_IMPORT_RATE_LIMITER) return json(origin, 503, { error: "X import rate limiting is not configured" })
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json(origin, 415, { error: "Content-Type must be application/json" })
  const length = Number(request.headers.get("content-length"))
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return json(origin, 413, { error: "Request is too large" })
  const controller = new AbortController()
  const abortFromRequest = () => controller.abort(request.signal.reason)
  if (request.signal.aborted) abortFromRequest()
  else request.signal.addEventListener("abort", abortFromRequest, { once: true })
  const timer = setTimeout(() => controller.abort(new Error("import-timeout")), IMPORT_TIMEOUT_MS)
  const context: ImportContext = { signal: controller.signal, subrequests: 0 }
  let imported: ImportedSource[]
  let parsed: ReturnType<typeof parseXPostUrl>
  try {
    let input: ReturnType<typeof parseXImportRequest>
    try {
      const text = await readBounded(request.body, MAX_BODY_BYTES, controller.signal)
      input = parseXImportRequest(JSON.parse(text) as unknown)
    } catch (caught) {
      if (controller.signal.aborted) throw controller.signal.reason
      if (caught instanceof Error && caught.message === "body-too-large") return json(origin, 413, { error: "Request is too large" })
      return json(origin, 400, { error: "Invalid X import request" })
    }
    let limit: { success: boolean }
    try {
      limit = await Promise.race([
        env.X_IMPORT_RATE_LIMITER.limit({ key: clientKey(request) }),
        new Promise<never>((_, reject) => {
          if (controller.signal.aborted) { reject(controller.signal.reason); return }
          controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true })
        }),
      ])
    } catch (caught) {
      if (controller.signal.aborted) throw controller.signal.reason
      throw new Error("limiter-unavailable", { cause: caught })
    }
    if (!limit.success) return json(origin, 429, { error: "Too many import requests. Try again shortly." }, { "retry-after": "60" })
    parsed = parseXPostUrl(input.postUrl)
    let post: Awaited<ReturnType<typeof resolvePost>>
    try { post = await resolvePost(parsed.postId, env.X_BEARER_TOKEN, fetcher, context) }
    catch (caught) {
      if (controller.signal.aborted) throw controller.signal.reason
      return json(origin, 502, { error: caught instanceof Error && caught.message === "status-404" ? "X could not find this post" : "X could not verify this post" })
    }
    if (post.authorUsername.toLowerCase() !== parsed.handle.toLowerCase()) return json(origin, 400, { error: "The X post URL handle does not match the post author" })
    context.conversationId = post.conversationId
    imported = await Promise.all(input.sources.map((source) => importSource(source, parsed.postId, env.X_BEARER_TOKEN!, fetcher, context)))
  } catch (caught) {
    if (caught instanceof Error && caught.message === "limiter-unavailable") return json(origin, 503, { error: "X import rate limiting is unavailable" })
    if (request.signal.aborted) return json(origin, 400, { error: "The request was cancelled" })
    return json(origin, 504, { error: "The X import did not finish within the request time limit" })
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener("abort", abortFromRequest)
  }
  const all = imported.flatMap((item) => item.handles)
  const seen = new Set<string>()
  const entrants = all.filter((handle) => { const key = handle.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
  const sources = imported.map((item) => item.result)
  const unavailable = sources.reduce((sum, source) => sum + source.unavailable, 0)
  const response: XImportResponse = {
    postId: parsed.postId, postUrl: parsed.postUrl, fetchedAt: new Date().toISOString(), entrants, fetchedTotal: all.length,
    duplicatesRemoved: all.length - entrants.length, unavailable,
    partial: sources.some((source) => source.limited || !source.complete), sources,
    rules: ["One entry per X handle across all selected sources.", "Handles are deduplicated case-insensitively.", "Replies include direct reply authors only; quotes and nested replies are excluded."],
  }
  return json(origin, 200, response)
}

export default { fetch(request: Request, env: Env) { return handleXEntrants(request, env) } }
