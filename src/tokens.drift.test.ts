import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { tokenInventory } from "./tokens"

function rootCustomProperties(css: string): string[] {
  const blockStart = css.indexOf("{", css.indexOf(":root {"))
  const blockEnd = css.indexOf("}", blockStart)
  const block = css.slice(blockStart + 1, blockEnd)
  return [...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])
}

function duplicates(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicateNames = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) duplicateNames.add(name)
    seen.add(name)
  }
  return [...duplicateNames]
}

describe("token inventory drift", () => {
  const css = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8")
  const declared = rootCustomProperties(css)

  it("declares no duplicate custom properties in :root", () => {
    expect(duplicates(declared)).toEqual([])
  })

  it("lists no duplicate names in the token inventory", () => {
    expect(duplicates(tokenInventory)).toEqual([])
  })

  it("matches the token inventory exactly to the :root custom properties", () => {
    const declaredSet = new Set(declared)
    const inventorySet = new Set(tokenInventory)
    const missing = [...declaredSet].filter((name) => !inventorySet.has(name))
    const extra = [...inventorySet].filter((name) => !declaredSet.has(name))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })
})
