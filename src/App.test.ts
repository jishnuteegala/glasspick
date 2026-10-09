import { describe, expect, it } from "vitest"
import { isRouteHash } from "./App"

describe("route hash guard", () => {
  it("routes only envelope links, the empty hash, and the design-system page", () => {
    expect(isRouteHash("")).toBe(true)
    expect(isRouteHash("#design-system")).toBe(true)
    expect(isRouteHash("#gp1=abc")).toBe(true)
    expect(isRouteHash("#gpp1=abc")).toBe(true)
    expect(isRouteHash("#gp9=abc")).toBe(true)
  })

  it("leaves in-page anchors alone", () => {
    expect(isRouteHash("#main-content")).toBe(false)
    expect(isRouteHash("#live-reveal")).toBe(false)
    expect(isRouteHash("#anything")).toBe(false)
  })
})
