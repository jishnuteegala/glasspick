import { createCommitment, parsePending, type PendingDraw } from "./draw"
import { withDrawStateLock } from "./draw-state-lock"

export const PENDING_KEY = "glasspick-pending-v2"

interface PendingStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
}

export async function restorePendingValue(raw: string | null): Promise<PendingDraw | null> {
  if (!raw) return null
  try {
    const pending = parsePending(JSON.parse(raw))
    const recomputed = await createCommitment(pending.commitment)
    if (recomputed.commitmentHash !== pending.commitment.commitmentHash) {
      throw new Error("Stored commitment does not match its inputs")
    }
    return pending
  } catch {
    throw new Error("The saved commitment was invalid and has been discarded. Create a new commitment.")
  }
}

export async function restorePending(storage: PendingStorage): Promise<PendingDraw | null> {
  let raw: string | null = null
  try {
    raw = storage.getItem(PENDING_KEY)
    return await restorePendingValue(raw)
  } catch (caught) {
    if (raw !== null) {
      const invalid = raw
      await withDrawStateLock(() => {
        try { if (storage.getItem(PENDING_KEY) === invalid) storage.removeItem(PENDING_KEY) } catch { /* The invalid value still must not be used. */ }
      })
    }
    throw caught
  }
}
