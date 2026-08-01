import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { tokenInventory } from "./tokens"

function customProperties(block: string): string[] {
  return [...block.matchAll(/(--[\w-]+)\s*:/g)].map((property) => property[1])
}

function blockContents(css: string, selector: RegExp): string {
  const match = selector.exec(css)
  if (!match?.index) throw new Error(`Missing CSS block: ${selector}`)
  const blockStart = match.index + match[0].length
  const blockEnd = css.indexOf("}", blockStart)
  return css.slice(blockStart, blockEnd)
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
  const declared = customProperties(blockContents(css, /@theme\s*\{/))
  const darkOverrides = customProperties(
    blockContents(css, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/),
  )

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

  it("keeps dark overrides within the primary token set", () => {
    const declaredSet = new Set(declared)
    expect(duplicates(darkOverrides)).toEqual([])
    expect(darkOverrides.filter((name) => !declaredSet.has(name))).toEqual([])
  })
})
