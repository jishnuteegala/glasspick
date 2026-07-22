import { describe, expect, it } from "vitest"
import { DrandMismatchError, DrandUnavailableError } from "./drand"
import { createCommitment, parseEntries, runDraw } from "./draw"
import { verifyPublicDraw } from "./verification"

async function fixture() {
  const commitment = await createCommitment({
    entries: parseEntries("alice\nbob", false),
    winnerCount: 1,
    alternateCount: 0,
    nonce: "00112233445566778899aabbccddeeff",
    round: 42,
  })
  return runDraw(commitment, "ab".repeat(32))
}

describe("public verification", () => {
  it("fails a valid beacon contradiction", async () => {
    const result = await verifyPublicDraw(await fixture(), async () => {
      throw new DrandMismatchError("Relay randomness does not match")
    })
    expect(result.state).toBe("failed")
    expect(result.ok).toBe(false)
  })

  it("uses local-only status for unavailable relays", async () => {
    const result = await verifyPublicDraw(await fixture(), async () => {
      throw new DrandUnavailableError()
    })
    expect(result.state).toBe("local")
    expect(result.ok).toBe(true)
    expect(result.checks.at(-1)?.status).toBe("indeterminate")
    expect(result.checks.at(-1)?.status).not.toBe("pass")
  })

  it("passes the abort signal to public beacon verification", async () => {
    const controller = new AbortController()
    await verifyPublicDraw(await fixture(), async (_round, _randomness, _fetcher, signal) => {
      expect(signal).toBe(controller.signal)
      throw new DrandUnavailableError()
    }, controller.signal)
  })
})
