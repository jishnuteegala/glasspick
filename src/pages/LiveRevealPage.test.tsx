import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { WinnerAnnouncement } from "./LiveRevealPage"

describe("winner announcement", () => {
  it("is mounted empty before the draw and populated when winners arrive", () => {
    const empty = renderToStaticMarkup(<WinnerAnnouncement winners={[]} />)
    const populated = renderToStaticMarkup(<WinnerAnnouncement winners={[{ name: "alice", weight: 1 }]} />)

    expect(empty).toContain('aria-live="polite"')
    expect(empty).not.toContain("Winner:")
    expect(populated).toContain("Winner: @alice")
  })
})
