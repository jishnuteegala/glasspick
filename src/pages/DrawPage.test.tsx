import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DrawResults, LiveLinkDisclosure } from "./DrawPage"
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
