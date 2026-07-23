import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DrawResults, LiveLinkDisclosure, XImportPanel, XImportPreview } from "./DrawPage"
import type { XImportResponse } from "../x-integration"
import { resetDisclosureAcknowledgements } from "./draw-page-state"

const record = {
  winners: [{ name: "alice", weight: 1 }],
  alternates: [],
}

describe("draw results", () => {
  it("uses logical headings and omits empty alternates", () => {
    const markup = renderToStaticMarkup(<DrawResults record={record} />)

    expect(markup).toContain("<h1")
    expect(markup).toContain("Draw complete")
    expect(markup).toContain("<h2")
    expect(markup).toContain("Winners")
    expect(markup).not.toContain("Alternates")
  })
})

describe("live reveal disclosure", () => {
  it("names the entrant disclosure and disables copy until confirmed", () => {
    const locked = renderToStaticMarkup(<LiveLinkDisclosure checked={false} onChange={() => undefined} onCopy={() => undefined} />)
    const unlocked = renderToStaticMarkup(<LiveLinkDisclosure checked onChange={() => undefined} onCopy={() => undefined} />)

    expect(locked).toContain("publishes entrant names and weights")
    expect(locked).toContain("Copy entrant-revealing live link")
    expect(locked).toContain("disabled")
    expect(unlocked).not.toContain("disabled")
  })

  it("clears both disclosure acknowledgements for a new draw", () => {
    expect(resetDisclosureAcknowledgements()).toEqual({ full: false, live: false })
  })
})

describe("X import disclosure", () => {
  const partial: XImportResponse = {
    postId: "123",
    postUrl: "https://x.com/host/status/123",
    fetchedAt: "2026-07-22T12:00:00.000Z",
    entrants: ["alice"],
    fetchedTotal: 1,
    duplicatesRemoved: 0,
    unavailable: 0,
    partial: true,
    rules: ["One entry per handle."],
    sources: [{ source: "likes", fetched: 1, pages: 1, complete: false, limited: true, unavailable: 0 }],
  }

  it("keeps importer controls disabled while parent work is active", () => {
    const markup = renderToStaticMarkup(<XImportPanel disabled onLoad={() => undefined} />)
    expect(markup.match(/disabled/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it("renders the proof-boundary warning in the importer", () => {
    const markup = renderToStaticMarkup(<XImportPreview acknowledged={false} disabled={false} preview={partial} onAcknowledge={() => undefined} onLoad={() => undefined} />)
    expect(markup).toContain("cannot prove that X returned every eligible account")
    expect(markup).toContain("I understand this import is limited or incomplete")
    expect(markup).toContain("disabled")
  })
})
