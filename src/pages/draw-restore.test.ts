import { describe, expect, it } from "vitest"
import { createCommitment, runDraw } from "../engine/draw"
import { PENDING_KEY } from "../engine/pending"
import { PROVENANCE_KEY, RECORD_KEY, restoreDrawState, type RestoreStorage } from "./draw-restore"

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => { map.delete(key) },
    setItem: (key: string, value: string) => { map.set(key, value) },
    keys: () => [...map.keys()],
  }
}

async function commitment() {
  return createCommitment({
    entries: [{ name: "alice", weight: 1 }, { name: "bob", weight: 1 }],
    winnerCount: 1,
    alternateCount: 0,
    nonce: "11".repeat(16),
    round: 42,
  })
}

async function completedRecord() {
  return runDraw(await commitment(), "22".repeat(32))
}

describe("draw state restoration", () => {
  it("restores a verified completed record and removes the pending value", async () => {
    const storage = memoryStorage({
      [RECORD_KEY]: JSON.stringify(await completedRecord()),
      [PENDING_KEY]: JSON.stringify({ envelopeVersion: 1, commitment: await commitment() }),
    })
    const restored = await restoreDrawState(storage, false, () => true)
    expect(restored?.record).not.toBeNull()
    expect(restored?.pending).toBeNull()
    expect(storage.keys()).toEqual([RECORD_KEY])
  })

  it("restores a pending commitment when no record exists", async () => {
    const storage = memoryStorage({ [PENDING_KEY]: JSON.stringify({ envelopeVersion: 1, commitment: await commitment() }) })
    const restored = await restoreDrawState(storage, false, () => true)
    expect(restored?.record).toBeNull()
    expect(restored?.pending).not.toBeNull()
    expect(restored?.pendingError).toBeNull()
  })

  it("does not let a malformed pending value block record restoration", async () => {
    const storage = memoryStorage({
      [RECORD_KEY]: JSON.stringify(await completedRecord()),
      [PENDING_KEY]: "not json",
    })
    const restored = await restoreDrawState(storage, false, () => true)
    expect(restored?.record).not.toBeNull()
    expect(restored?.pendingError).toBeNull()
    expect(storage.keys()).toEqual([RECORD_KEY])
  })

  it("reports malformed pending data when there is no record", async () => {
    const storage = memoryStorage({ [PENDING_KEY]: "not json" })
    const restored = await restoreDrawState(storage, false, () => true)
    expect(restored?.pendingError).toBeInstanceOf(Error)
    expect(storage.keys()).toEqual([])
  })

  it("removes a tampered record instead of restoring it", async () => {
    const record = await completedRecord()
    record.winners[0].name = "mallory"
    const storage = memoryStorage({ [RECORD_KEY]: JSON.stringify(record) })
    const restored = await restoreDrawState(storage, false, () => true)
    expect(restored?.record).toBeNull()
    expect(storage.keys()).toEqual([])
  })

  it("discards stored provenance when the importer flag is disabled", async () => {
    const storage = memoryStorage({
      [PENDING_KEY]: JSON.stringify({ envelopeVersion: 1, commitment: await commitment() }),
      [PROVENANCE_KEY]: JSON.stringify({ receiptVersion: 1 }),
    })
    const restored = await restoreDrawState(storage, false, () => true)
    expect(restored?.receipt).toBeNull()
    expect(storage.keys()).toEqual([PENDING_KEY])
  })

  it("publishes nothing and mutates nothing when the generation is stale", async () => {
    const storage = memoryStorage({ [PENDING_KEY]: "not json" })
    const restored = await restoreDrawState(storage, false, () => false)
    expect(restored).toBeNull()
    expect(storage.keys()).toEqual([PENDING_KEY])
  })

  it("retries from fresh snapshots when storage changes during validation", async () => {
    const stale = JSON.stringify({ envelopeVersion: 1, commitment: await commitment() })
    const replacement = await createCommitment({
      entries: [{ name: "carol", weight: 1 }, { name: "dave", weight: 1 }],
      winnerCount: 1,
      alternateCount: 0,
      nonce: "33".repeat(16),
      round: 43,
    })
    const storage = memoryStorage({ [PENDING_KEY]: stale })
    let reads = 0
    const racing: RestoreStorage = {
      getItem: (key) => {
        reads += 1
        if (key === PENDING_KEY && reads === 1) return stale
        return storage.getItem(key)
      },
      removeItem: (key) => storage.removeItem(key),
    }
    storage.setItem(PENDING_KEY, JSON.stringify({ envelopeVersion: 1, commitment: replacement }))
    const restored = await restoreDrawState(racing, false, () => true)
    expect(restored?.pending?.commitment.commitmentHash).toBe(replacement.commitmentHash)
    expect(storage.keys()).toEqual([PENDING_KEY])
  })

  it("does not clean storage when the generation goes stale before the lock section", async () => {
    const storage = memoryStorage({ [PENDING_KEY]: "not json" })
    let checks = 0
    const restored = await restoreDrawState(storage, false, () => {
      checks += 1
      return checks === 1
    })
    expect(restored).toBeNull()
    expect(storage.keys()).toEqual([PENDING_KEY])
  })

  it("does not delete a newer value written after an invalid snapshot", async () => {
    const fresh = JSON.stringify({ envelopeVersion: 1, commitment: await commitment() })
    const storage = memoryStorage()
    let reads = 0
    const racing: RestoreStorage = {
      getItem: (key) => {
        if (key !== PENDING_KEY) return storage.getItem(key)
        reads += 1
        if (reads === 1) return "not json"
        return fresh
      },
      removeItem: (key) => storage.removeItem(key),
    }
    storage.setItem(PENDING_KEY, fresh)
    const restored = await restoreDrawState(racing, false, () => true)
    expect(restored?.pending).not.toBeNull()
    expect(storage.keys()).toEqual([PENDING_KEY])
  })

  it("reports contention instead of empty state when storage never stabilizes", async () => {
    const valid = JSON.stringify({ envelopeVersion: 1, commitment: await commitment() })
    let reads = 0
    const churning: RestoreStorage = {
      getItem: (key) => {
        if (key !== PENDING_KEY) return null
        reads += 1
        return `${valid.slice(0, -1)}, "churn": ${reads}}`
      },
      removeItem: () => { throw new Error("must not delete under contention") },
    }
    const restored = await restoreDrawState(churning, false, () => true)
    expect(restored).toMatchObject({ contended: true, record: null, pending: null, receipt: null })
  })
})
