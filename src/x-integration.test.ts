import { describe, expect, it, vi } from "vitest"
import { fetchXEntrants, parseXImportRequest, parseXImportResponse, parseXPostUrl, parseXProvenanceReceipt, validateXProvenanceReceipt, type XImportResponse } from "./x-integration"

const result: XImportResponse = {
  postId: "123", postUrl: "https://x.com/alice/status/123", fetchedAt: "2026-07-22T12:00:00.000Z", entrants: ["Alice"], fetchedTotal: 1,
  duplicatesRemoved: 0, unavailable: 0, partial: false, rules: ["one"],
  sources: [{ source: "reposts", fetched: 1, pages: 1, complete: true, limited: false, unavailable: 0 }],
}

describe("X integration contract", () => {
  it.each([
    ["https://x.com/alice/status/123", "123"],
    ["https://www.twitter.com/a_b/status/999", "999"],
  ])("accepts strict status URLs", (url, id) => expect(parseXPostUrl(url).postId).toBe(id))

  it.each(["http://x.com/a/status/1", "https://mobile.x.com/a/status/1", "https://x.com/a/status/1?s=20", "https://x.com/a/status/not-id", "https://x.com/a/status/1/photo/1", "https://evil.test/a/status/1"])("rejects %s", (url) => expect(() => parseXPostUrl(url)).toThrow())

  it("rejects duplicate and unknown sources", () => {
    expect(() => parseXImportRequest({ postUrl: "https://x.com/a/status/1", sources: ["likes", "likes"] })).toThrow()
    expect(() => parseXImportRequest({ postUrl: "https://x.com/a/status/1", sources: ["quotes"] })).toThrow()
  })

  it("posts to the same-origin endpoint and validates the response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }))
    await expect(fetchXEntrants({ postUrl: result.postUrl, sources: ["reposts"] }, undefined, fetcher)).resolves.toEqual(result)
    expect(fetcher).toHaveBeenCalledWith("/api/x/entrants", expect.objectContaining({ method: "POST" }))
  })

  it("rejects malformed success bodies and passes through sanitized errors", async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }))
    await expect(fetchXEntrants({ postUrl: result.postUrl, sources: ["likes"] }, undefined, malformed)).rejects.toThrow("invalid response")
    const failed = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":"X API access is not configured"}', { status: 503 }))
    await expect(fetchXEntrants({ postUrl: result.postUrl, sources: ["likes"] }, undefined, failed)).rejects.toThrow("not configured")
  })

  it("distinguishes transport interruption from invalid JSON on body-read failure", async () => {
    const interrupted = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
      pull(controller) { controller.error(new TypeError("network error")) },
    }), { status: 200 }))
    await expect(fetchXEntrants({ postUrl: result.postUrl, sources: ["likes"] }, undefined, interrupted)).rejects.toThrow("interrupted")
  })

  it("rejects inconsistent counts, duplicate sources, and mismatched post IDs", async () => {
    expect(() => parseXImportResponse({ ...result, fetchedTotal: 2 })).toThrow("invalid response")
    expect(() => parseXImportResponse({ ...result, sources: [...result.sources, result.sources[0]] })).toThrow("invalid response")
    expect(() => parseXImportResponse({ ...result, postId: "999" })).toThrow("invalid response")
  })

  it("rejects impossible source completeness claims", () => {
    const withSource = (source: Record<string, unknown>, partial: boolean) => ({ ...result, partial, sources: [source] })
    expect(() => parseXImportResponse(withSource({ source: "likes", fetched: 1, pages: 1, complete: true, limited: false, unavailable: 0 }, false))).toThrow("invalid response")
    expect(() => parseXImportResponse(withSource({ source: "likes", fetched: 1, pages: 2, complete: false, limited: true, unavailable: 0 }, true))).toThrow("invalid response")
    expect(() => parseXImportResponse(withSource({ source: "replies", fetched: 1, pages: 1, complete: true, limited: false, unavailable: 0 }, false))).toThrow("invalid response")
    expect(() => parseXImportResponse(withSource({ source: "reposts", fetched: 1, pages: 1, complete: false, limited: false, unavailable: 0 }, true))).toThrow("invalid response")
    expect(() => parseXImportResponse(withSource({ source: "reposts", fetched: 1, pages: 11, complete: false, limited: true, unavailable: 0 }, true))).toThrow("invalid response")
    expect(() => parseXImportResponse(withSource({ source: "reposts", fetched: 101, pages: 1, complete: true, limited: false, unavailable: 0 }, false))).toThrow("invalid response")
    expect(() => parseXImportResponse(withSource({ source: "reposts", fetched: 1, pages: 0, complete: true, limited: false, unavailable: 0 }, false))).toThrow("invalid response")
    expect(() => parseXImportResponse({ ...result, entrants: [], fetchedTotal: 0, duplicatesRemoved: 0, sources: [{ source: "reposts", fetched: 0, pages: 0, complete: true, limited: false, unavailable: 0 }] })).toThrow("invalid response")
  })

  it("validates source receipts independently of draw records", () => {
    const receipt = { ...result, receiptVersion: 1, fetchedAt: "2026-07-22T12:00:00.000Z", canonicalEntriesHash: "a".repeat(64), commitmentHash: "b".repeat(64) }
    expect(parseXProvenanceReceipt(receipt)).toEqual(receipt)
    expect(() => parseXProvenanceReceipt({ ...receipt, canonicalEntriesHash: "bad" })).toThrow("Invalid X source receipt")
  })

  it("rejects a receipt whose entrants do not match its canonical hash", async () => {
    const receipt = { ...result, receiptVersion: 1, fetchedAt: "2026-07-22T12:00:00.000Z", canonicalEntriesHash: "a".repeat(64) }
    await expect(validateXProvenanceReceipt(receipt)).rejects.toThrow("Invalid X source receipt")
  })
})
