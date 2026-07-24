import { describe, expect, it, vi } from "vitest"
import { handleXEntrants } from "./index"

const env = { X_BEARER_TOKEN: "secret", X_IMPORT_RATE_LIMITER: { limit: async () => ({ success: true }) } }

function request(body: unknown, origin = "https://glasspick.test") {
  return new Request(`${origin}/api/x/entrants`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": String(Math.random()) }, body: JSON.stringify(body) })
}

function postLookup(conversationId = "123", username = "host") {
  return new Response(JSON.stringify({ data: { id: "123", author_id: "10", conversation_id: conversationId }, includes: { users: [{ id: "10", username }] } }), { status: 200 })
}

describe("X entrants Worker", () => {
  it("imports, paginates, deduplicates, and reports limitations without real X calls", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") return postLookup()
      if (url.pathname.endsWith("retweeted_by") && !url.searchParams.has("pagination_token")) return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], meta: { result_count: 1, next_token: "next" } }), { status: 200 })
      if (url.pathname.endsWith("retweeted_by")) return new Response(JSON.stringify({ data: [{ id: "4", username: "Carol" }, { id: "3", username: "Bob" }], meta: { result_count: 2 } }), { status: 200 })
      return new Response(JSON.stringify({ data: [{ author_id: "4", conversation_id: "123", referenced_tweets: [{ type: "replied_to", id: "123" }] }, { author_id: "5", conversation_id: "123", referenced_tweets: [{ type: "replied_to", id: "999" }] }], includes: { users: [{ id: "4", username: "Carol" }, { id: "5", username: "Nested" }] }, meta: { result_count: 2 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts", "replies"] }), env, fetcher)
    const body = await response.json() as { entrants: string[]; duplicatesRemoved: number; partial: boolean; sources: Array<{ pages: number }> }
    expect(response.status).toBe(200)
    expect(body.entrants).toEqual(["Alice", "Carol", "Bob"])
    expect(body.duplicatesRemoved).toBe(1)
    expect(body.partial).toBe(true)
    expect(body.sources[0].pages).toBe(2)
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("https://api.x.com/2/"))).toBe(true)
  })

  it("marks likes limited after one page", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], meta: { result_count: 1, next_token: "ignored" } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://twitter.com/host/status/123", sources: ["likes"] }), env, fetcher)
    const body = await response.json() as { partial: boolean; sources: Array<{ limited: boolean; complete: boolean }> }
    expect(body).toMatchObject({ partial: true, sources: [{ limited: true, complete: false }] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("rejects a URL whose handle does not match the post author", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup("123", "realauthor")
      throw new Error("unexpected call")
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/imposter/status/123", sources: ["likes"] }), env, fetcher)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: "The X post URL handle does not match the post author" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("fails closed when the post cannot be verified", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 404 }))
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["likes"] }), env, fetcher)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: "X could not find this post" })
  })

  it("rejects foreign origins, missing configuration, and malformed requests", async () => {
    const foreign = request({ postUrl: "https://x.com/a/status/1", sources: ["likes"] }, "https://glasspick.test")
    const withOrigin = new Request(foreign, { headers: { ...Object.fromEntries(foreign.headers), origin: "https://evil.test" } })
    expect((await handleXEntrants(withOrigin, env)).status).toBe(403)
    expect((await handleXEntrants(request({ postUrl: "https://x.com/a/status/1", sources: ["likes"] }), {})).status).toBe(503)
    expect((await handleXEntrants(request({ postUrl: "https://evil.test/a/status/1", sources: ["likes"] }), env)).status).toBe(400)
  })

  it("rejects oversized bodies before calling X", async () => {
    const fetcher = vi.fn<typeof fetch>()
    const oversized = new Request("https://glasspick.test/api/x/entrants", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": String(Math.random()) }, body: JSON.stringify({ postUrl: `https://x.com/a/status/1${"0".repeat(3_000)}`, sources: ["likes"] }) })
    expect((await handleXEntrants(oversized, env, fetcher)).status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("does not call a malformed or partial X response complete", async () => {
    const malformed = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname === "/2/tweets/123" ? postLookup() : new Response("{}", { status: 200 }))
    const malformedResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, malformed)
    await expect(malformedResponse.json()).resolves.toMatchObject({ partial: true, sources: [{ complete: false }] })

    const partial = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname === "/2/tweets/123" ? postLookup() : new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], errors: [{ resource_type: "user", resource_id: "2" }], meta: { result_count: 1 } }), { status: 200 }))
    const partialResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, partial)
    await expect(partialResponse.json()).resolves.toMatchObject({ partial: true, unavailable: 1, sources: [{ complete: false }] })
  })

  it("treats malformed or duplicate upstream error entries as invalid", async () => {
    const page = (errors: unknown[]) => JSON.stringify({ data: [{ id: "1", username: "Alice" }], errors, meta: { result_count: 1 } })
    for (const errors of [[{ resource_type: "user", resource_id: "2" }, {}], [{ resource_type: "user", resource_id: "2" }, { resource_type: "user", resource_id: "2" }], [{ resource_type: "", resource_id: "2" }], [{ resource_type: "  ", resource_id: "2" }]]) {
      const fetcher = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname === "/2/tweets/123" ? postLookup() : new Response(page(errors), { status: 200 }))
      const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
      await expect(response.json()).resolves.toMatchObject({ entrants: [], partial: true, sources: [{ complete: false }] })
    }
  })

  it("treats oversized upstream pages as incomplete", async () => {
    const oversizedPage = { data: Array.from({ length: 101 }, (_, index) => ({ id: String(index + 1), username: `user${index + 1}` })), meta: { result_count: 101 } }
    const fetcher = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname === "/2/tweets/123" ? postLookup() : new Response(JSON.stringify(oversizedPage), { status: 200 }))
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    await expect(response.json()).resolves.toMatchObject({ entrants: [], partial: true, sources: [{ complete: false }] })
  })

  it("excludes replies from a different conversation", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup("123")
      return new Response(JSON.stringify({ data: [{ author_id: "1", conversation_id: "123", referenced_tweets: [{ type: "replied_to", id: "123" }] }, { author_id: "2", conversation_id: "555", referenced_tweets: [{ type: "replied_to", id: "123" }] }], includes: { users: [{ id: "1", username: "Alice" }, { id: "2", username: "Mallory" }] }, meta: { result_count: 2 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["replies"] }), env, fetcher)
    await expect(response.json()).resolves.toMatchObject({ entrants: ["Alice"] })
  })

  it("rejects positive result counts without matching records", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname === "/2/tweets/123" ? postLookup() : new Response(JSON.stringify({ meta: { result_count: 1 } }), { status: 200 }))
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    await expect(response.json()).resolves.toMatchObject({ partial: true, sources: [{ complete: false }] })
  })

  it("reports source-specific token access failures as incomplete", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => new URL(String(input)).pathname === "/2/tweets/123" ? postLookup() : new Response("{}", { status: 403 }))
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["likes"] }), env, fetcher)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      partial: true,
      sources: [{ complete: false, note: "The configured X token cannot access this source." }],
    })
  })

  it("searches the parent conversation for direct replies to a non-root post", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") return postLookup("99")
      expect(url.searchParams.get("query")).toBe("conversation_id:99 is:reply")
      return new Response(JSON.stringify({ data: [{ author_id: "1", conversation_id: "99", referenced_tweets: [{ type: "replied_to", id: "123" }] }], includes: { users: [{ id: "1", username: "Alice" }] }, meta: { result_count: 1 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["replies"] }), env, fetcher)
    await expect(response.json()).resolves.toMatchObject({ entrants: ["Alice"] })
  })

  it("marks a page partial when it repeats a user ID and rejects conflicting usernames", async () => {
    const duplicate = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }, { id: "1", username: "Alice" }], meta: { result_count: 2 } }), { status: 200 })
    })
    const partialResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, duplicate)
    const partialBody = await partialResponse.json() as { entrants: string[]; sources: Array<{ complete: boolean }> }
    expect(partialBody.entrants).toEqual(["Alice"])
    expect(partialBody.sources[0].complete).toBe(false)

    const conflicting = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }, { id: "1", username: "Mallory" }], meta: { result_count: 2 } }), { status: 200 })
    })
    const conflictResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, conflicting)
    const conflictBody = await conflictResponse.json() as { sources: Array<{ complete: boolean; fetched: number }> }
    expect(conflictBody.sources[0]).toMatchObject({ complete: false, fetched: 0 })
  })

  it("rejects pages containing malformed account records", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }, {}], meta: { result_count: 2 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    const body = await response.json() as { entrants: string[]; sources: Array<{ complete: boolean; fetched: number }> }
    expect(body.entrants).toEqual([])
    expect(body.sources[0]).toMatchObject({ complete: false, fetched: 0 })
  })

  it("rejects reply pages with malformed expanded users or conversation ids", async () => {
    const malformedUser = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ author_id: "4", conversation_id: "123", referenced_tweets: [{ type: "replied_to", id: "123" }] }], includes: { users: [{ id: "4", username: "Carol" }, {}] }, meta: { result_count: 1 } }), { status: 200 })
    })
    const userResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["replies"] }), env, malformedUser)
    const userBody = await userResponse.json() as { sources: Array<{ complete: boolean; fetched: number }> }
    expect(userBody.sources[0]).toMatchObject({ complete: false, fetched: 0 })

    const malformedConversation = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ author_id: "4", conversation_id: "not-numeric", referenced_tweets: [{ type: "replied_to", id: "123" }] }], includes: { users: [{ id: "4", username: "Carol" }] }, meta: { result_count: 1 } }), { status: 200 })
    })
    const conversationResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["replies"] }), env, malformedConversation)
    const conversationBody = await conversationResponse.json() as { sources: Array<{ complete: boolean; fetched: number }> }
    expect(conversationBody.sources[0]).toMatchObject({ complete: false, fetched: 0 })
  })

  it("invalidates a source whose pages disagree about a user's handle", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") return postLookup()
      if (!url.searchParams.has("pagination_token")) return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], meta: { result_count: 1, next_token: "next" } }), { status: 200 })
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Mallory" }], meta: { result_count: 1 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    const body = await response.json() as { entrants: string[]; sources: Array<{ complete: boolean; fetched: number }> }
    expect(body.entrants).toEqual([])
    expect(body.sources[0]).toMatchObject({ complete: false, fetched: 0 })
  })

  it("discards a source when two IDs claim the same handle case-insensitively", async () => {
    const samePage = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }, { id: "2", username: "alice" }], meta: { result_count: 2 } }), { status: 200 })
    })
    const sameResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, samePage)
    const sameBody = await sameResponse.json() as { entrants: string[]; sources: Array<{ complete: boolean; fetched: number }> }
    expect(sameBody.entrants).toEqual([])
    expect(sameBody.sources[0]).toMatchObject({ complete: false, fetched: 0 })

    const crossPage = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") return postLookup()
      if (!url.searchParams.has("pagination_token")) return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], meta: { result_count: 1, next_token: "next" } }), { status: 200 })
      return new Response(JSON.stringify({ data: [{ id: "2", username: "ALICE" }], meta: { result_count: 1 } }), { status: 200 })
    })
    const crossResponse = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, crossPage)
    const crossBody = await crossResponse.json() as { entrants: string[]; sources: Array<{ complete: boolean; fetched: number }> }
    expect(crossBody.entrants).toEqual([])
    expect(crossBody.sources[0]).toMatchObject({ complete: false, fetched: 0 })
  })

  it("keeps only earlier valid-page counters when a conflicting page reports unavailable records", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") return postLookup()
      if (!url.searchParams.has("pagination_token")) return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], errors: [{ resource_type: "user", resource_id: "77" }], meta: { result_count: 1, next_token: "next" } }), { status: 200 })
      return new Response(JSON.stringify({ data: [{ id: "2", username: "alice" }], errors: [{ resource_type: "user", resource_id: "88" }, { resource_type: "user", resource_id: "99" }], meta: { result_count: 1 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    const body = await response.json() as { entrants: string[]; sources: Array<{ complete: boolean; fetched: number; pages: number; unavailable: number }> }
    expect(body.entrants).toEqual([])
    expect(body.sources[0]).toMatchObject({ complete: false, fetched: 0, pages: 1, unavailable: 1 })
  })

  it("discards a whole source when a later page conflicts within itself", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") return postLookup()
      if (!url.searchParams.has("pagination_token")) return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], meta: { result_count: 1, next_token: "next" } }), { status: 200 })
      return new Response(JSON.stringify({ data: [{ id: "2", username: "Bob" }, { id: "2", username: "Mallory" }], meta: { result_count: 2 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    const body = await response.json() as { entrants: string[]; sources: Array<{ complete: boolean; fetched: number; pages: number }> }
    expect(body.entrants).toEqual([])
    expect(body.sources[0]).toMatchObject({ complete: false, fetched: 0, pages: 1 })
  })

  it("retries a transient 408 before giving up", async () => {
    let calls = 0
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === "/2/tweets/123") {
        calls += 1
        if (calls === 1) return new Response("timeout", { status: 408 })
        return postLookup()
      }
      return new Response(JSON.stringify({ data: [{ id: "1", username: "Alice" }], meta: { result_count: 1 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    const body = await response.json() as { entrants: string[] }
    expect(response.status).toBe(200)
    expect(body.entrants).toEqual(["Alice"])
  })

  it("reports limiter infrastructure failures as 503, not a timeout", async () => {
    const failing = { X_BEARER_TOKEN: "secret", X_IMPORT_RATE_LIMITER: { limit: async () => { throw new Error("binding unavailable") } } }
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["likes"] }), failing, fetcher)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: "X import rate limiting is unavailable" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("rejects an already-aborted request without calling X", async () => {
    const abort = new AbortController()
    abort.abort(new Error("client-gone"))
    const aborted = new Request("https://glasspick.test/api/x/entrants", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1" }, body: JSON.stringify({ postUrl: "https://x.com/host/status/123", sources: ["likes"] }), signal: abort.signal })
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleXEntrants(aborted, env, fetcher)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("does not hang on an upstream fetch that never settles after abort", async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined))
      let settled: Response | undefined
      const pending = handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["likes"] }), env, fetcher).then((response) => { settled = response; return response })
      for (let elapsed = 0; elapsed < 30_000 && !settled; elapsed += 1_000) await vi.advanceTimersByTimeAsync(1_000)
      const response = await pending
      expect(response.status).toBe(502)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects a post lookup that reports errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { id: "123", author_id: "10", conversation_id: "123" }, includes: { users: [{ id: "10", username: "host" }] }, errors: [{ resource_type: "tweet", resource_id: "123" }] }), { status: 200 }))
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["likes"] }), env, fetcher)
    expect(response.status).toBe(502)
  })

  it("rejects reply pages with malformed referenced_tweets entries", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/2/tweets/123") return postLookup()
      return new Response(JSON.stringify({ data: [{ author_id: "4", conversation_id: "123", referenced_tweets: [{ type: "replied_to", id: "not-numeric" }] }], includes: { users: [{ id: "4", username: "Carol" }] }, meta: { result_count: 1 } }), { status: 200 })
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["replies"] }), env, fetcher)
    const body = await response.json() as { sources: Array<{ complete: boolean; fetched: number }> }
    expect(body.sources[0]).toMatchObject({ complete: false, fetched: 0 })
  })

  it("rejects upstream redirects without forwarding the token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(init?.redirect).toBe("error")
      throw new TypeError("redirect mode is set to error")
    })
    const response = await handleXEntrants(request({ postUrl: "https://x.com/host/status/123", sources: ["reposts"] }), env, fetcher)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: "X could not verify this post" })
  })
})
