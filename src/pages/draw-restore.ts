import { canonicalEntries, parseRecord, verifyDraw, type DrawRecord, type PendingDraw } from "../engine/draw"
import { sha256Hex } from "../engine/hash"
import { PENDING_KEY, restorePendingValue } from "../engine/pending"
import { validateXProvenanceReceipt, type XProvenanceReceipt } from "../x-integration"
import { withDrawStateLock } from "../engine/draw-state-lock"

export const RECORD_KEY = "glasspick-record-v1"
export const PROVENANCE_KEY = "glasspick-x-provenance-v1"

export interface RestoreStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
}

export interface RestoredDrawState {
  record: DrawRecord | null
  pending: PendingDraw | null
  receipt: XProvenanceReceipt | null
  pendingError: unknown
  contended?: boolean
}

export async function restoreDrawState(storage: RestoreStorage, xImportEnabled: boolean, isCurrent: () => boolean, attempt = 0): Promise<RestoredDrawState | null> {
  const snapshot = (key: string) => { try { return storage.getItem(key) } catch { return null } }
  const rawRecord = snapshot(RECORD_KEY)
  const rawPending = snapshot(PENDING_KEY)
  const rawProvenance = snapshot(PROVENANCE_KEY)
  const stale: Array<{ key: string; value: string | null }> = []
  const markStale = (key: string, value: string | null) => { if (value !== null) stale.push({ key, value }) }
  let record: DrawRecord | null = null
  try {
    record = parseRecord(JSON.parse(rawRecord ?? "null") as unknown)
    if (!(await verifyDraw(record)).ok) throw new Error("Stored record failed verification")
  } catch { record = null; markStale(RECORD_KEY, rawRecord) }
  let pending: PendingDraw | null = null
  let pendingError: unknown = null
  try { pending = await restorePendingValue(rawPending) }
  catch (caught) {
    markStale(PENDING_KEY, rawPending)
    if (!record) pendingError = caught
  }
  if (record) { markStale(PENDING_KEY, rawPending); pending = null }
  const current = record ?? pending?.commitment ?? null
  let receipt: XProvenanceReceipt | null = null
  if (!current || !xImportEnabled) markStale(PROVENANCE_KEY, rawProvenance)
  else {
    const entriesHash = await sha256Hex(canonicalEntries(current.entries))
    try {
      const candidate = await validateXProvenanceReceipt(JSON.parse(rawProvenance ?? "null") as unknown)
      if (candidate.commitmentHash === current.commitmentHash && candidate.canonicalEntriesHash === entriesHash) receipt = candidate
      else markStale(PROVENANCE_KEY, rawProvenance)
    } catch { markStale(PROVENANCE_KEY, rawProvenance) }
  }
  if (!isCurrent()) return null
  const settled = await withDrawStateLock((): "cancelled" | "changed" | "settled" => {
    if (!isCurrent()) return "cancelled"
    if (snapshot(RECORD_KEY) !== rawRecord || snapshot(PENDING_KEY) !== rawPending || snapshot(PROVENANCE_KEY) !== rawProvenance) return "changed"
    for (const entry of stale) {
      try { if (storage.getItem(entry.key) === entry.value) storage.removeItem(entry.key) } catch { /* best-effort cleanup */ }
    }
    return "settled"
  })
  if (settled === "cancelled" || !isCurrent()) return null
  if (settled === "changed") {
    if (attempt < 3) return restoreDrawState(storage, xImportEnabled, isCurrent, attempt + 1)
    return { record: null, pending: null, receipt: null, pendingError: null, contended: true }
  }
  return { record, pending, receipt, pendingError }
}
