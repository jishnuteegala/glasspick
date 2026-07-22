import { describe, expect, it } from "vitest"
import { createCommitment } from "./draw"
import { PENDING_KEY, restorePending } from "./pending"

async function savedPending() {
  const commitment = await createCommitment({
    entries: [{ name: "alice", weight: 1 }, { name: "bob", weight: 1 }],
    winnerCount: 1,
    alternateCount: 0,
    nonce: "11".repeat(16),
    round: 42,
  })
  return { envelopeVersion: 1 as const, commitment }
}

describe("pending storage", () => {
  it("restores only after recomputing the commitment hash", async () => {
    const pending = await savedPending()
    const storage = { getItem: () => JSON.stringify(pending), removeItem: () => undefined }
    await expect(restorePending(storage)).resolves.toEqual(pending)
  })

  it("discards a stored commitment whose inputs were changed", async () => {
    const pending = await savedPending()
    pending.commitment.entries[0].weight = 2
    const removed: string[] = []
    const storage = { getItem: () => JSON.stringify(pending), removeItem: (key: string) => { removed.push(key) } }
    await expect(restorePending(storage)).rejects.toThrow("invalid and has been discarded")
    expect(removed).toEqual([PENDING_KEY])
  })
})
