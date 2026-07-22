import { describe, expect, it } from "vitest"
import { INVALID_JSON_MESSAGE, parseRecordJson, readJsonFile } from "./verify-input"

describe("verification input", () => {
  it("replaces native JSON parser errors with concise guidance", () => {
    expect(() => parseRecordJson('{"version":2')).toThrow(INVALID_JSON_MESSAGE)
  })

  it("preserves record validation errors after valid JSON", () => {
    expect(() => parseRecordJson('{"version":1}')).toThrow("Unsupported draw record version")
  })

  it("reads files and reports read failures", async () => {
    await expect(readJsonFile({ text: async () => "record" })).resolves.toBe("record")
    await expect(readJsonFile({ text: async () => { throw new Error("native read error") } }))
      .rejects.toThrow("Could not read the JSON file. Try another file.")
  })
})
