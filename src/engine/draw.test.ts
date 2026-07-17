import { describe, expect, it } from "vitest"
import {
  canonicalizeParticipants,
  createCommitment,
  deriveSeed,
  pickWinners,
  runDraw,
  verifyDraw,
} from "./draw"

const RANDOMNESS =
  "a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1"

describe("canonicalizeParticipants", () => {
  it("dedupes case-insensitively, strips @, sorts", () => {
    const result = canonicalizeParticipants("@Bob\nalice\nBOB\n, carol ,\nAlice")
    expect(result).toEqual(["alice", "Bob", "carol"])
  })

  it("ignores empty lines", () => {
    expect(canonicalizeParticipants("\n\n a \n\n")).toEqual(["a"])
  })
})

describe("draw determinism", () => {
  it("same inputs always produce the same winners", async () => {
    const participants = canonicalizeParticipants(
      Array.from({ length: 50 }, (_, i) => `user${i}`).join("\n"),
    )
    const a = await runDraw(participants, 3, "fixed-nonce", 1000, RANDOMNESS)
    const b = await runDraw(participants, 3, "fixed-nonce", 1000, RANDOMNESS)
    expect(a.winners).toEqual(b.winners)
    expect(a.seed).toBe(b.seed)
    expect(a.commitmentHash).toBe(b.commitmentHash)
  })

  it("different nonce changes the outcome inputs", async () => {
    const participants = ["a", "b", "c"]
    const c1 = await createCommitment(participants, 1, "n1", 5)
    const c2 = await createCommitment(participants, 1, "n2", 5)
    expect(c1.commitmentHash).not.toBe(c2.commitmentHash)
  })

  it("picks distinct winners without replacement", async () => {
    const participants = canonicalizeParticipants("a\nb\nc\nd\ne")
    const seed = await deriveSeed("commit", RANDOMNESS)
    const winners = await pickWinners(participants, 5, seed)
    expect(new Set(winners).size).toBe(5)
  })

  it("caps winner count at participant count", async () => {
    const winners = await pickWinners(["a", "b"], 10, "seed")
    expect(winners).toHaveLength(2)
  })
})

describe("verifyDraw", () => {
  it("accepts an honest record", async () => {
    const participants = canonicalizeParticipants("alice\nbob\ncarol\ndave")
    const record = await runDraw(participants, 2, "nonce-1", 42, RANDOMNESS)
    const result = await verifyDraw(record)
    expect(result.ok).toBe(true)
    expect(result.checks.every((c) => c.ok)).toBe(true)
  })

  it("rejects a record with swapped winners", async () => {
    const participants = canonicalizeParticipants("alice\nbob\ncarol\ndave")
    const record = await runDraw(participants, 1, "nonce-1", 42, RANDOMNESS)
    const loser = participants.find((p) => p !== record.winners[0])!
    const tampered = { ...record, winners: [loser] }
    const result = await verifyDraw(tampered)
    expect(result.ok).toBe(false)
  })

  it("rejects a record with an altered participant list", async () => {
    const participants = canonicalizeParticipants("alice\nbob\ncarol")
    const record = await runDraw(participants, 1, "nonce-1", 42, RANDOMNESS)
    const tampered = {
      ...record,
      participants: canonicalizeParticipants("alice\nbob\nmallory"),
    }
    const result = await verifyDraw(tampered)
    expect(result.ok).toBe(false)
  })

  it("rejects a record with a different drand randomness", async () => {
    const participants = canonicalizeParticipants("alice\nbob\ncarol")
    const record = await runDraw(participants, 1, "nonce-1", 42, RANDOMNESS)
    const tampered = { ...record, drandRandomness: RANDOMNESS.replace("a", "b") }
    const result = await verifyDraw(tampered)
    expect(result.ok).toBe(false)
  })
})
