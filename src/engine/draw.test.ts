import { describe, expect, it, vi } from "vitest"
import {
  CHAIN_HASH,
  createCommitment,
  parseEntries,
  parsePending,
  parseRecord,
  pickEntries,
  pickTicket,
  runDraw,
  verifyDraw,
} from "./draw"

const RANDOMNESS = "a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1"
const NONCE = "00000000000000000000000000000008"
const PICKS = [
  { total: 7, attempt: 0, digest: "3f42a2911d147d04bb66dea86ec9d3a41d6bcd803e0ea3f8ea8fbd617dcdc607", ticket: 4, selected: "carol" },
  { total: 5, attempt: 0, digest: "7355eba840dfd95d2f76b63cfc641d66231e5bde0c6e0477fed964e7415f6dea", ticket: 3, selected: "bob" },
  { total: 2, attempt: 0, digest: "b25f6e47d46d5cd3b9c3e2c7c4d7c64a52a5edae137b8d06a378610b1e35a27b", ticket: 1, selected: "dave" },
]

describe("weighted entries", () => {
  it("canonicalizes plain input and rejects duplicate identities", () => {
    expect(parseEntries("@Zoë, alice\nBob", false)).toEqual([
      { name: "alice", weight: 1 },
      { name: "bob", weight: 1 },
      { name: "zoë", weight: 1 },
    ])
    expect(() => parseEntries("Alice\nalice", false)).toThrow("Duplicate entrant")
  })

  it("strictly parses and caps weighted input", () => {
    expect(parseEntries("Alice,3\nBob,100000", true)).toEqual([
      { name: "alice", weight: 3 },
      { name: "bob", weight: 100000 },
    ])
    expect(() => parseEntries("Alice, 1.5", true)).toThrow("Invalid weighted entry")
    expect(() => parseEntries("Alice,100001", true)).toThrow("must be an integer")
    expect(() => parseEntries("bad|name,1", true)).toThrow("reserved delimiter")
  })

  it("normalizes Unicode to NFC and sorts by UTF-8 bytes", () => {
    expect(parseEntries("😀\n\n@Zoë\nÉLODIE", false)).toEqual([
      { name: "zoë", weight: 1 },
      { name: "Élodie", weight: 1 },
      { name: "", weight: 1 },
      { name: "😀", weight: 1 },
    ])
    expect(() => parseEntries("Élodie\nÉLODIE", false)).toThrow("Duplicate entrant")
  })

  it("uses the cross-language whitespace, case, and scalar contract", () => {
    expect(parseEntries(" \t@ALICE\r\n Alice \nélodie\nÉlodie", false)).toEqual([
      { name: "alice", weight: 1 },
      { name: " alice ", weight: 1 },
      { name: "Élodie", weight: 1 },
      { name: "élodie", weight: 1 },
    ])
    expect(() => parseEntries(`bad${String.fromCharCode(0xd800)}name`, false)).toThrow("unpaired Unicode surrogates")
    expect(() => parseEntries("bad\u0000name", false)).toThrow("control characters")
  })
})

describe("v2 draw", () => {
  it("matches the frozen commitment and weighted sequence", async () => {
    const commitment = await createCommitment({
      entries: parseEntries("alice,1\nbob,3\ncarol,2\ndave,1", true),
      winnerCount: 2,
      alternateCount: 1,
      nonce: NONCE,
      round: 123456,
    })
    expect(commitment.chainHash).toBe(CHAIN_HASH)
    expect(commitment.commitmentHash).toBe("f7d433426dad7bf85f258dac654b00236c99b3b7db40ebb14990fd57111c16b6")
    const record = await runDraw(commitment, RANDOMNESS)
    expect(record.seed).toBe("554489ec27b779e224622b09b09e68574a3672dcbd59d13f0ed939513b105d14")
    expect(record.winners.map((entry) => entry.name)).toEqual(["carol", "bob"])
    expect(record.alternates.map((entry) => entry.name)).toEqual(["dave"])
  })

  it("matches every accepted digest, ticket, changed range, and selection in the frozen vector", async () => {
    const entries = parseEntries("alice,1\nbob,3\ncarol,2\ndave,1", true)
    const seed = "554489ec27b779e224622b09b09e68574a3672dcbd59d13f0ed939513b105d14"
    const pool = entries.map((entry) => ({ ...entry }))
    const traces: typeof PICKS = []

    for (let pickIndex = 0; pickIndex < PICKS.length; pickIndex++) {
      const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
      let acceptedDigest = ""
      let attempt = -1
      const ticket = await pickTicket(total, seed, pickIndex, async (input) => {
        attempt++
        acceptedDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
          .then((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""))
        return acceptedDigest
      })
      let cursor = 0
      const selectedIndex = pool.findIndex((entry) => {
        cursor += entry.weight
        return ticket < cursor
      })
      const selected = pool.splice(selectedIndex, 1)[0].name
      traces.push({ total, attempt, digest: acceptedDigest, ticket, selected })
    }

    expect(traces).toEqual(PICKS)
    expect(new Set(traces.map((trace) => trace.total)).size).toBeGreaterThan(1)
    expect(traces.every((trace) => trace.ticket > 0)).toBe(true)
  })

  it("removes every ticket belonging to a selected entrant", async () => {
    const selected = await pickEntries(parseEntries("heavy,100000\nlight,1", true), 2, "seed")
    expect(new Set(selected.map((entry) => entry.name)).size).toBe(2)
  })

  it("retries a digest in the rejection range", async () => {
    const hash = async (input: string) => input.endsWith("|0") ? "f".repeat(64) : "0".repeat(64)
    await expect(pickTicket(3, "seed", 2, hash)).resolves.toBe(0)
  })

  it("implements the exact rejection boundary", async () => {
    const range = 1n << 256n
    const limit = range - (range % 3n)
    const digest = (value: bigint) => value.toString(16).padStart(64, "0")

    const accepted = vi.fn(async () => digest(limit - 1n))
    await expect(pickTicket(3, "seed", 0, accepted)).resolves.toBe(2)
    expect(accepted).toHaveBeenCalledTimes(1)
    let calls = 0
    const atLimit = vi.fn(async (_input: string) => digest(calls++ === 0 ? limit : 0n))
    await expect(pickTicket(3, "seed", 0, atLimit)).resolves.toBe(0)
    expect(atLimit.mock.calls.map(([input]) => input)).toEqual(["seed|0|0", "seed|0|1"])
    calls = 0
    const maxDigest = vi.fn(async (_input: string) => digest(calls++ === 0 ? range - 1n : 0n))
    await expect(pickTicket(3, "seed", 0, maxDigest)).resolves.toBe(0)
    expect(maxDigest.mock.calls.map(([input]) => input)).toEqual(["seed|0|0", "seed|0|1"])
  })

  it("exports, parses, and verifies an honest record", async () => {
    const commitment = await createCommitment({
      entries: parseEntries("alice,2\nbob,1\ncarol,1", true),
      winnerCount: 1,
      alternateCount: 1,
      nonce: NONCE,
      round: 42,
    })
    const record = parseRecord(JSON.parse(JSON.stringify(await runDraw(commitment, RANDOMNESS))))
    expect((await verifyDraw(record)).ok).toBe(true)
  })

  it("rejects reordered in-memory commitments before selecting", async () => {
    const commitment = await createCommitment({
      entries: parseEntries("alice,1\nbob,3\ncarol,2", true),
      winnerCount: 1,
      alternateCount: 1,
      nonce: NONCE,
      round: 42,
    })
    const reordered = { ...commitment, entries: [...commitment.entries].reverse() }

    await expect(runDraw(reordered, RANDOMNESS)).rejects.toThrow("Entries are not canonical")
    const honest = await runDraw(commitment, RANDOMNESS)
    await expect(verifyDraw({ ...honest, entries: [...honest.entries].reverse() })).rejects.toThrow("Entries are not canonical")
  })

  it("fails closed for unknown records and invalid pending state", () => {
    expect(() => parseRecord({ version: 1 })).toThrow("Unsupported draw record version")
    expect(() => parsePending({ envelopeVersion: 2 })).toThrow("Unsupported or malformed")
  })

  it("does not coerce record field types", async () => {
    const commitment = await createCommitment({
      entries: parseEntries("alice\nbob", false), winnerCount: 1, alternateCount: 0,
      nonce: NONCE, round: 42,
    })
    const record = await runDraw(commitment, RANDOMNESS)
    expect(() => parseRecord({ ...record, round: "42" })).toThrow("invalid types")
    expect(() => parseRecord({ ...record, note: "mutable" })).toThrow("unknown field")
  })
})
