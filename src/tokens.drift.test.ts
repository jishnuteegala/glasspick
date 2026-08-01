import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { tokenInventory } from "./tokens"

function themeCustomProperties(css: string): string[][] {
  const blocks: string[][] = []
  for (const match of css.matchAll(/@theme\s*\{/g)) {
    const blockStart = match.index! + match[0].length
    const blockEnd = css.indexOf("}", blockStart)
    const block = css.slice(blockStart, blockEnd)
    blocks.push([...block.matchAll(/(--[\w-]+)\s*:/g)].map((property) => property[1]))
  }
  return blocks
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
  const [declared, ...overrides] = themeCustomProperties(css)

  it("declares no duplicate custom properties in the primary @theme block", () => {
    expect(duplicates(declared)).toEqual([])
  })

  it("lists no duplicate names in the token inventory", () => {
    expect(duplicates(tokenInventory)).toEqual([])
  })

  it("matches the token inventory exactly to the primary @theme custom properties", () => {
    const declaredSet = new Set(declared)
    const inventorySet = new Set(tokenInventory)
    const missing = [...declaredSet].filter((name) => !inventorySet.has(name))
    const extra = [...inventorySet].filter((name) => !declaredSet.has(name))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it("keeps @theme overrides within the primary token set", () => {
    const declaredSet = new Set(declared)
    expect(overrides.map((override) => override.filter((name) => !declaredSet.has(name)))).toEqual(
      overrides.map(() => []),
    )
  })
})
