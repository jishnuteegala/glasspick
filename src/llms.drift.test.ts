import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("llms.txt drift", () => {
  it("keeps the served copy identical to the repository copy", () => {
    const root = readFileSync(fileURLToPath(new URL("../llms.txt", import.meta.url)), "utf8")
    const served = readFileSync(fileURLToPath(new URL("../public/llms.txt", import.meta.url)), "utf8")
    expect(served).toBe(root)
  })
})
