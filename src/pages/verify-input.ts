import { parseRecord, type DrawRecord } from "../engine/draw"

export const INVALID_JSON_MESSAGE = "Invalid JSON. Paste or upload a complete GlassPick record."

export function parseRecordJson(raw: string): DrawRecord {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error(INVALID_JSON_MESSAGE)
  }
  return parseRecord(value)
}

export async function readJsonFile(file: Pick<File, "text">): Promise<string> {
  try {
    return await file.text()
  } catch {
    throw new Error("Could not read the JSON file. Try another file.")
  }
}
