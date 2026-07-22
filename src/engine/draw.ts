import { sha256Hex } from "./hash"

export const CHAIN_HASH =
  "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
export const ALGORITHM = "virtual-tickets-v1" as const
export const MAX_WEIGHT = 100_000
export const MAX_TOTAL_WEIGHT = 1_000_000

export interface WeightedEntry {
  name: string
  weight: number
}

export interface DrawInputs {
  entries: WeightedEntry[]
  winnerCount: number
  alternateCount: number
  nonce: string
  round: number
}

export interface DrawCommitment extends DrawInputs {
  version: 2
  chainHash: string
  algorithm: typeof ALGORITHM
  entrantCount: number
  totalWeight: number
  commitmentHash: string
}

export interface DrawRecord extends DrawCommitment {
  randomness: string
  seed: string
  winners: WeightedEntry[]
  alternates: WeightedEntry[]
}

export interface PendingDraw {
  envelopeVersion: 1
  commitment: DrawCommitment
}

export interface VerificationResult {
  ok: boolean
  checks: { label: string; status: "pass" | "fail" | "indeterminate"; detail: string }[]
}

const HEX_64 = /^[0-9a-f]{64}$/
const NONCE = /^[0-9a-f]{32}$/
const ASCII_EDGE_WHITESPACE = /^[ \t\r\n]+|[ \t\r\n]+$/g

function canonicalName(value: string): string {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) throw new Error("Entrant names cannot contain unpaired Unicode surrogates")
      index++
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("Entrant names cannot contain unpaired Unicode surrogates")
    }
  }
  const trimmed = value.replace(ASCII_EDGE_WHITESPACE, "").replace(/^@/, "").normalize("NFC")
  return trimmed.replace(/[A-Z]/g, (character) => character.toLowerCase())
}

function compareUtf8(a: string, b: string): number {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

export function parseEntries(raw: string, weighted: boolean): WeightedEntry[] {
  const chunks = weighted ? raw.split(/\r?\n/) : raw.split(/[\n,]+/)
  const entries: WeightedEntry[] = []
  const seen = new Set<string>()
  let totalWeight = 0
  for (const rawChunk of chunks) {
    if (!rawChunk.replace(ASCII_EDGE_WHITESPACE, "")) continue
    let name = rawChunk
    let weight = 1
    if (weighted) {
      const match = rawChunk.match(/^[ \t\r]*(.+?)[ \t\r]*,[ \t\r]*([0-9]+)[ \t\r]*$/)
      if (!match) throw new Error(`Invalid weighted entry: "${rawChunk.replace(ASCII_EDGE_WHITESPACE, "")}". Use name,weight.`)
      name = match[1]
      weight = Number(match[2])
    }
    const canonical = canonicalName(name)
    if (!canonical) throw new Error("Entrant names cannot be empty")
    if (/\p{Cc}/u.test(canonical)) throw new Error("Entrant names cannot contain control characters")
    if (/[|,\r\n]/.test(canonical)) throw new Error(`Entrant name contains a reserved delimiter: ${canonical}`)
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > MAX_WEIGHT) {
      throw new Error(`Weight for ${canonical} must be an integer from 1 to ${MAX_WEIGHT}`)
    }
    if (seen.has(canonical)) throw new Error(`Duplicate entrant: ${canonical}`)
    seen.add(canonical)
    totalWeight += weight
    if (totalWeight > MAX_TOTAL_WEIGHT) {
      throw new Error(`Total weight cannot exceed ${MAX_TOTAL_WEIGHT}`)
    }
    entries.push({ name: canonical, weight })
  }
  return entries.sort((a, b) => compareUtf8(a.name, b.name))
}

export function canonicalEntries(entries: WeightedEntry[]): string {
  return entries.map(({ name, weight }) => `${name},${weight}`).join("\n")
}

function assertCounts(entrantCount: number, winnerCount: number, alternateCount: number) {
  if (!Number.isSafeInteger(winnerCount) || winnerCount < 1) {
    throw new Error("Winner count must be a positive integer")
  }
  if (!Number.isSafeInteger(alternateCount) || alternateCount < 0 || alternateCount > 5) {
    throw new Error("Alternate count must be an integer from 0 to 5")
  }
  if (winnerCount + alternateCount > entrantCount) {
    throw new Error("Winners and alternates cannot exceed the entrant count")
  }
}

export async function createCommitment(inputs: DrawInputs): Promise<DrawCommitment> {
  const entries = parseEntries(canonicalEntries(inputs.entries), true)
  assertCounts(entries.length, inputs.winnerCount, inputs.alternateCount)
  if (!NONCE.test(inputs.nonce)) throw new Error("Nonce must be 16 bytes of lowercase hex")
  if (!Number.isSafeInteger(inputs.round) || inputs.round < 1) throw new Error("Round must be positive")
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0)
  const fields = [
    CHAIN_HASH,
    ALGORITHM,
    canonicalEntries(entries),
    entries.length,
    totalWeight,
    inputs.winnerCount,
    inputs.alternateCount,
    inputs.nonce,
    inputs.round,
  ]
  const commitmentHash = await sha256Hex(`glasspick-v2|${fields.join("|")}`)
  return {
    version: 2,
    chainHash: CHAIN_HASH,
    algorithm: ALGORITHM,
    entries,
    entrantCount: entries.length,
    totalWeight,
    winnerCount: inputs.winnerCount,
    alternateCount: inputs.alternateCount,
    nonce: inputs.nonce,
    round: inputs.round,
    commitmentHash,
  }
}

export async function deriveSeed(commitmentHash: string, randomness: string): Promise<string> {
  return sha256Hex(`glasspick-seed-v2|${commitmentHash}|${randomness}`)
}

export async function pickEntries(
  entries: WeightedEntry[],
  count: number,
  seed: string,
): Promise<WeightedEntry[]> {
  const pool = entries.map((entry) => ({ ...entry }))
  const selected: WeightedEntry[] = []
  for (let pickIndex = 0; pickIndex < count; pickIndex++) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    const ticket = await pickTicket(total, seed, pickIndex)
    let cursor = 0
    const selectedIndex = pool.findIndex((entry) => {
      cursor += entry.weight
      return ticket < cursor
    })
    selected.push(pool[selectedIndex])
    pool.splice(selectedIndex, 1)
  }
  return selected
}

export async function pickTicket(
  total: number,
  seed: string,
  pickIndex: number,
  hash: (input: string) => Promise<string> = sha256Hex,
): Promise<number> {
  const totalBig = BigInt(total)
  const range = 1n << 256n
  const limit = range - (range % totalBig)
  for (let attempt = 0; ; attempt++) {
    const digest = BigInt(`0x${await hash(`${seed}|${pickIndex}|${attempt}`)}`)
    if (digest < limit) return Number(digest % totalBig)
  }
}

export async function runDraw(commitment: DrawCommitment, randomness: string): Promise<DrawRecord> {
  if (!HEX_64.test(randomness)) throw new Error("Randomness must be 32 bytes of lowercase hex")
  const parsed = parseCommitment(commitment)
  const checked = await createCommitment(parsed)
  if (checked.commitmentHash !== parsed.commitmentHash) {
    throw new Error("Commitment does not match its inputs")
  }
  const seed = await deriveSeed(parsed.commitmentHash, randomness)
  const selections = await pickEntries(
    checked.entries,
    checked.winnerCount + checked.alternateCount,
    seed,
  )
  return {
    ...checked,
    randomness,
    seed,
    winners: selections.slice(0, checked.winnerCount),
    alternates: selections.slice(checked.winnerCount),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) throw new Error(`${label} contains unknown field: ${unknown[0]}`)
}

function parseEntry(value: unknown): WeightedEntry {
  if (!isObject(value) || typeof value.name !== "string" || typeof value.weight !== "number") {
    throw new Error("Every entry must contain a name and integer weight")
  }
  assertKeys(value, ["name", "weight"], "Entry")
  return { name: value.name, weight: value.weight }
}

export function parseCommitment(value: unknown): DrawCommitment {
  if (!isObject(value)) throw new Error("Commitment must be an object")
  if (value.version !== 2) throw new Error("Unsupported draw record version")
  if (value.algorithm !== ALGORITHM) throw new Error("Unsupported draw algorithm")
  if (value.chainHash !== CHAIN_HASH) throw new Error("Unsupported drand chain")
  if (!Array.isArray(value.entries)) throw new Error("Entries must be an array")
  if (typeof value.winnerCount !== "number" || typeof value.alternateCount !== "number" ||
      typeof value.nonce !== "string" || typeof value.round !== "number") {
    throw new Error("Commitment fields have invalid types")
  }
  const inputs: DrawInputs = {
    entries: value.entries.map(parseEntry),
    winnerCount: value.winnerCount,
    alternateCount: value.alternateCount,
    nonce: value.nonce,
    round: value.round,
  }
  if (!Number.isSafeInteger(value.entrantCount) || !Number.isSafeInteger(value.totalWeight)) {
    throw new Error("Entrant count and total weight must be integers")
  }
  if (!HEX_64.test(String(value.commitmentHash))) throw new Error("Invalid commitment hash")
  const canonical = parseEntries(canonicalEntries(inputs.entries), true)
  if (!sameEntries(canonical, inputs.entries)) throw new Error("Entries are not canonical")
  assertCounts(inputs.entries.length, inputs.winnerCount, inputs.alternateCount)
  if (!NONCE.test(inputs.nonce)) throw new Error("Invalid nonce")
  if (!Number.isSafeInteger(inputs.round) || inputs.round < 1) throw new Error("Invalid round")
  const totalWeight = inputs.entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (value.entrantCount !== inputs.entries.length || value.totalWeight !== totalWeight) {
    throw new Error("Entrant count or total weight does not match entries")
  }
  return {
    version: 2,
    chainHash: CHAIN_HASH,
    algorithm: ALGORITHM,
    ...inputs,
    entrantCount: Number(value.entrantCount),
    totalWeight: Number(value.totalWeight),
    commitmentHash: String(value.commitmentHash),
  }
}

export function parseRecord(value: unknown): DrawRecord {
  if (isObject(value)) assertKeys(value, [
    "version", "chainHash", "algorithm", "entries", "entrantCount", "totalWeight",
    "winnerCount", "alternateCount", "nonce", "round", "commitmentHash", "randomness",
    "seed", "winners", "alternates",
  ], "Record")
  const commitment = parseCommitment(value)
  if (!isObject(value) || !Array.isArray(value.winners) || !Array.isArray(value.alternates)) {
    throw new Error("Record must contain winner and alternate arrays")
  }
  const record = {
    ...commitment,
    randomness: String(value.randomness),
    seed: String(value.seed),
    winners: value.winners.map(parseEntry),
    alternates: value.alternates.map(parseEntry),
  }
  if (typeof value.randomness !== "string" || typeof value.seed !== "string") {
    throw new Error("Record randomness and seed must be strings")
  }
  if (!HEX_64.test(record.randomness) || !HEX_64.test(record.seed)) {
    throw new Error("Record randomness and seed must be 32-byte lowercase hex")
  }
  if (record.winners.length !== record.winnerCount || record.alternates.length !== record.alternateCount) {
    throw new Error("Record outcome counts do not match the commitment")
  }
  return record
}

export function parsePending(value: unknown): PendingDraw {
  if (!isObject(value) || value.envelopeVersion !== 1) {
    throw new Error("Unsupported or malformed pending draw")
  }
  assertKeys(value, ["envelopeVersion", "commitment"], "Pending draw")
  if (isObject(value.commitment)) assertKeys(value.commitment, [
    "version", "chainHash", "algorithm", "entries", "entrantCount", "totalWeight",
    "winnerCount", "alternateCount", "nonce", "round", "commitmentHash",
  ], "Commitment")
  return {
    envelopeVersion: 1,
    commitment: parseCommitment(value.commitment),
  }
}

function sameEntries(a: WeightedEntry[], b: WeightedEntry[]): boolean {
  return a.length === b.length && a.every((entry, index) =>
    entry.name === b[index]?.name && entry.weight === b[index]?.weight)
}

export async function verifyDraw(record: DrawRecord): Promise<VerificationResult> {
  const parsed = parseRecord(record)
  const checks: VerificationResult["checks"] = []
  const commitment = await createCommitment(parsed)
  const commitmentOk = commitment.commitmentHash === parsed.commitmentHash &&
    commitment.entrantCount === parsed.entrantCount && commitment.totalWeight === parsed.totalWeight
  checks.push({
    label: "Commitment covers the canonical weighted draw",
    status: commitmentOk ? "pass" : "fail",
    detail: commitmentOk ? parsed.commitmentHash : `Expected ${commitment.commitmentHash}`,
  })
  const seed = await deriveSeed(parsed.commitmentHash, parsed.randomness)
  const seedOk = seed === parsed.seed
  checks.push({ label: "Seed matches commitment and beacon randomness", status: seedOk ? "pass" : "fail", detail: seed })
  const selections = await pickEntries(
    parsed.entries,
    parsed.winnerCount + parsed.alternateCount,
    seed,
  )
  const winnersOk = sameEntries(selections.slice(0, parsed.winnerCount), parsed.winners)
  const alternatesOk = sameEntries(selections.slice(parsed.winnerCount), parsed.alternates)
  checks.push({
    label: "Winners reproduce exactly",
    status: winnersOk ? "pass" : "fail",
    detail: selections.slice(0, parsed.winnerCount).map((entry) => entry.name).join(", "),
  })
  checks.push({
    label: "Alternates continue the same sequence",
    status: alternatesOk ? "pass" : "fail",
    detail: selections.slice(parsed.winnerCount).map((entry) => entry.name).join(", ") || "None",
  })
  return { ok: checks.every((check) => check.status === "pass"), checks }
}
