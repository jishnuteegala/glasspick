import { createCommitment, parsePending, type PendingDraw } from "./draw"

export const PENDING_KEY = "glasspick-pending-v2"

interface PendingStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
}

export async function restorePending(storage: PendingStorage): Promise<PendingDraw | null> {
  let raw: string | null = null
  try {
    raw = storage.getItem(PENDING_KEY)
    if (!raw) return null
    const pending = parsePending(JSON.parse(raw))
    const recomputed = await createCommitment(pending.commitment)
    if (recomputed.commitmentHash !== pending.commitment.commitmentHash) {
      throw new Error("Stored commitment does not match its inputs")
    }
    return pending
  } catch {
    if (raw !== null) {
      try { storage.removeItem(PENDING_KEY) } catch { /* The invalid value still must not be used. */ }
    }
    throw new Error("The saved commitment was invalid and has been discarded. Create a new commitment.")
  }
}
