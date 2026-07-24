import { canonicalEntries, parseEntries } from "./engine/draw"
import { sha256Hex } from "./engine/hash"

export const X_SOURCES = ["likes", "reposts", "replies"] as const

export type XSource = typeof X_SOURCES[number]

export interface XImportRequest {
  postUrl: string
  sources: XSource[]
}

export interface XSourceResult {
  source: XSource
  fetched: number
  pages: number
  complete: boolean
  limited: boolean
  unavailable: number
  note?: string
}

export interface XImportResponse {
  postId: string
  postUrl: string
  fetchedAt: string
  entrants: string[]
  fetchedTotal: number
  duplicatesRemoved: number
  unavailable: number
  partial: boolean
  rules: string[]
  sources: XSourceResult[]
}

export interface XProvenanceReceipt extends XImportResponse {
  receiptVersion: 1
  canonicalEntriesHash: string
  commitmentHash?: string
}

const HEX_64 = /^[0-9a-f]{64}$/

const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const POST_ID = /^[0-9]{1,19}$/
const HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"])

export function parseXPostUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error("Enter a complete X post URL") }
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,19})$/)
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.search || url.hash || !match) {
    throw new Error("Use an exact https://x.com/handle/status/123 post URL")
  }
  return { postId: match[2], handle: match[1], postUrl: `https://x.com/${match[1]}/status/${match[2]}` }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value)
}

export function parseXImportRequest(value: unknown): XImportRequest {
  if (!isObject(value) || !exactKeys(value, ["postUrl", "sources"]) || typeof value.postUrl !== "string" || !Array.isArray(value.sources)) throw new Error("Invalid import request")
  parseXPostUrl(value.postUrl)
  if (value.sources.length === 0 || value.sources.length > X_SOURCES.length || !value.sources.every((source) => typeof source === "string" && X_SOURCES.includes(source as XSource)) || new Set(value.sources).size !== value.sources.length) throw new Error("Choose one or more valid X sources")
  return { postUrl: value.postUrl, sources: value.sources as XSource[] }
}

function isSourceResult(value: unknown): value is XSourceResult {
  if (!isObject(value)) return false
  const allowed = ["source", "fetched", "pages", "complete", "limited", "unavailable", "note"]
  if (!(Object.keys(value).every((key) => allowed.includes(key)) && X_SOURCES.includes(value.source as XSource) && Number.isSafeInteger(value.fetched) && Number(value.fetched) >= 0 && Number.isSafeInteger(value.pages) && Number(value.pages) >= 0 && typeof value.complete === "boolean" && typeof value.limited === "boolean" && Number.isSafeInteger(value.unavailable) && Number(value.unavailable) >= 0 && !(Number(value.unavailable) > 0 && value.complete === true) && (value.note === undefined || (typeof value.note === "string" && value.note.length <= 500)))) return false
  if (Number(value.pages) > 10 || Number(value.fetched) > Number(value.pages) * 100) return false
  if (value.complete === true && Number(value.pages) < 1) return false
  if (Number(value.unavailable) > Number(value.pages) * 200) return false
  if (value.source === "likes" && (value.limited !== true || value.complete !== false || Number(value.pages) > 1)) return false
  if (value.source === "replies" && value.limited !== true) return false
  if (value.source === "reposts" && value.limited !== !value.complete) return false
  return true
}

export function parseXImportResponse(value: unknown): XImportResponse {
  if (!isObject(value) || !exactKeys(value, ["postId", "postUrl", "fetchedAt", "entrants", "fetchedTotal", "duplicatesRemoved", "unavailable", "partial", "rules", "sources"])) throw new Error("The X import service returned an invalid response")
  if (typeof value.postId !== "string" || !POST_ID.test(value.postId) || typeof value.postUrl !== "string" || parseXPostUrl(value.postUrl).postId !== value.postId || typeof value.fetchedAt !== "string" || !Number.isFinite(Date.parse(value.fetchedAt)) || new Date(value.fetchedAt).toISOString() !== value.fetchedAt || !Array.isArray(value.entrants) || value.entrants.length > 3_000 || !value.entrants.every((name) => typeof name === "string" && HANDLE.test(name)) || new Set(value.entrants.map((name) => String(name).toLowerCase())).size !== value.entrants.length || !Number.isSafeInteger(value.fetchedTotal) || Number(value.fetchedTotal) < 0 || Number(value.fetchedTotal) > 3_000 || !Number.isSafeInteger(value.duplicatesRemoved) || Number(value.duplicatesRemoved) < 0 || Number(value.fetchedTotal) - Number(value.duplicatesRemoved) !== value.entrants.length || !Number.isSafeInteger(value.unavailable) || Number(value.unavailable) < 0 || typeof value.partial !== "boolean" || !Array.isArray(value.rules) || value.rules.length === 0 || value.rules.length > 10 || !value.rules.every((rule) => typeof rule === "string" && rule.length <= 500) || !Array.isArray(value.sources) || value.sources.length === 0 || !value.sources.every(isSourceResult)) throw new Error("The X import service returned an invalid response")
  const sources = value.sources as XSourceResult[]
  if (new Set(sources.map((source) => source.source)).size !== sources.length || value.partial !== sources.some((source) => source.limited || !source.complete) || Number(value.fetchedTotal) !== sources.reduce((sum, source) => sum + source.fetched, 0) || Number(value.unavailable) !== sources.reduce((sum, source) => sum + source.unavailable, 0)) throw new Error("The X import service returned an invalid response")
  return value as unknown as XImportResponse
}

export function parseXProvenanceReceipt(value: unknown): XProvenanceReceipt {
  if (!isObject(value) || value.receiptVersion !== 1 || typeof value.canonicalEntriesHash !== "string" || !HEX_64.test(value.canonicalEntriesHash) || (value.commitmentHash !== undefined && (typeof value.commitmentHash !== "string" || !HEX_64.test(value.commitmentHash)))) throw new Error("Invalid X source receipt")
  const base = Object.fromEntries(Object.entries(value).filter(([key]) => !["receiptVersion", "canonicalEntriesHash", "commitmentHash"].includes(key)))
  return { ...parseXImportResponse(base), receiptVersion: 1, canonicalEntriesHash: value.canonicalEntriesHash, ...(typeof value.commitmentHash === "string" ? { commitmentHash: value.commitmentHash } : {}) }
}

export async function validateXProvenanceReceipt(value: unknown): Promise<XProvenanceReceipt> {
  const receipt = parseXProvenanceReceipt(value)
  const hash = await sha256Hex(canonicalEntries(parseEntries(receipt.entrants.join("\n"), false)))
  if (hash !== receipt.canonicalEntriesHash) throw new Error("Invalid X source receipt")
  return receipt
}

export async function fetchXEntrants(request: XImportRequest, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  const timeout = AbortSignal.timeout(30_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetcher("/api/x/entrants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      redirect: "error",
      signal: combined,
    })
  } catch (caught) {
    if (timeout.aborted && !signal?.aborted) throw new Error("The X import service timed out")
    throw caught
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (caught) {
    if (timeout.aborted && !signal?.aborted) throw new Error("The X import service timed out")
    if (signal?.aborted) throw caught
    if (caught instanceof SyntaxError) throw new Error("The X import service returned an invalid response")
    throw new Error("The connection to the X import service was interrupted")
  }
  if (!response.ok) {
    const message = isObject(body) && typeof body.error === "string" ? body.error : "Could not import entrants from X"
    throw new Error(message)
  }
  const parsed = parseXImportResponse(body)
  const requestedPost = parseXPostUrl(request.postUrl)
  if (parsed.postId !== requestedPost.postId || parsed.postUrl !== requestedPost.postUrl || parsed.sources.length !== request.sources.length || !request.sources.every((source) => parsed.sources.some((result) => result.source === source))) throw new Error("The X import service returned an invalid response")
  return parsed
}
