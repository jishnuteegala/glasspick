import { DrandMismatchError, fetchMatchingRound, type DrandRound } from "./drand"
import { verifyDraw, type DrawRecord, type VerificationResult } from "./draw"

export type VerificationState = "verified" | "local" | "failed"

export interface PublicVerification extends VerificationResult {
  state: VerificationState
}

export async function verifyPublicDraw(
  record: DrawRecord,
  fetchBeacon: (round: number, randomness: string, fetcher?: typeof fetch, signal?: AbortSignal) => Promise<DrandRound> = fetchMatchingRound,
  signal?: AbortSignal,
): Promise<PublicVerification> {
  const local = await verifyDraw(record)
  if (!local.ok) return { ...local, state: "failed" }
  try {
    const beacon = await fetchBeacon(record.round, record.randomness, undefined, signal)
    const checks = [...local.checks, {
      label: `Quicknet round ${record.round} matches the public beacon`,
      status: "pass" as const,
      detail: beacon.randomness,
    }]
    return { ok: true, checks, state: "verified" }
  } catch (error) {
    if (error instanceof DrandMismatchError) {
      return {
        ok: false,
        state: "failed",
        checks: [...local.checks, {
          label: `Quicknet round ${record.round} matches the public beacon`,
          status: "fail" as const,
          detail: error.message,
        }],
      }
    }
    return {
      ok: true,
      state: "local",
      checks: [...local.checks, {
        label: "Public beacon is currently unavailable",
        status: "indeterminate" as const,
        detail: "The record is locally consistent, but it has not been confirmed against a relay.",
      }],
    }
  }
}
