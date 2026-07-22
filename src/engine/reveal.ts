import { DrandMismatchError } from "./drand"

export type RevealPhase = "countdown" | "checking" | "grace" | "unavailable" | "manual" | "verified" | "mismatch"
export type RelayState = "waiting" | "unavailable" | "verified" | "mismatch" | "manual"

export interface RevealState {
  phase: RevealPhase
  secondsLeft: number
}

export interface RoundObservation {
  round: number
  observedAt: number
}

export interface ChainSchedule {
  genesis_time: number
  period: number
}

export function scheduleObservation(
  schedule: ChainSchedule,
  wallNow: number,
  monotonicNow: number,
): RoundObservation {
  const round = Math.max(1, Math.floor((wallNow / 1000 - schedule.genesis_time) / schedule.period) + 1)
  const roundTime = (schedule.genesis_time + (round - 1) * schedule.period) * 1000
  return { round, observedAt: monotonicNow - (wallNow - roundTime) }
}

export function observeLatestRound(
  current: RoundObservation | null,
  round: number,
  observedAt: number,
): RoundObservation {
  return current && current.round >= round ? current : { round, observedAt }
}

export function chainNow(observation: RoundObservation, schedule: ChainSchedule, monotonicNow: number): number {
  const observedRoundTime = (schedule.genesis_time + (observation.round - 1) * schedule.period) * 1000
  return observedRoundTime + Math.max(0, monotonicNow - observation.observedAt)
}

export function pendingIdentity(pending: { commitment: { commitmentHash: string } }): string {
  return pending.commitment.commitmentHash
}

export function shouldAttemptRound(
  now: number,
  roundTime: number,
  attempted: boolean,
  relay: RelayState,
  roundObserved = false,
): boolean {
  const due = roundObserved || now >= roundTime
  return relay === "waiting" && due && (!attempted || now - roundTime < 30_000)
}

export function parseManualRound(value: string, expectedRound: number): { round: number; randomness: string } {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error("Manual beacon must be valid JSON") }
  if (typeof parsed !== "object" || parsed === null) throw new Error("Manual beacon must be a JSON object")
  const data = parsed as Record<string, unknown>
  if (data.round !== expectedRound) throw new Error(`Manual beacon must be for round ${expectedRound}`)
  if (typeof data.randomness !== "string" || !/^[0-9a-f]{64}$/.test(data.randomness)) {
    throw new Error("Manual beacon randomness must be 64 lowercase hexadecimal characters")
  }
  return { round: expectedRound, randomness: data.randomness }
}

export function revealState(
  now: number,
  roundTime: number,
  relay: RelayState,
  checking = false,
  roundObserved = false,
): RevealState {
  if (relay === "verified" || relay === "mismatch" || relay === "manual") {
    return { phase: relay, secondsLeft: 0 }
  }
  if (relay === "unavailable") return { phase: "unavailable", secondsLeft: 0 }
  const secondsLeft = roundObserved ? 0 : Math.max(0, Math.ceil((roundTime - now) / 1000))
  if (secondsLeft > 0) return { phase: "countdown", secondsLeft }
  if (checking) return { phase: "checking", secondsLeft: 0 }
  const graceSecondsLeft = Math.max(0, Math.ceil((roundTime + 30_000 - now) / 1000))
  if (graceSecondsLeft === 0) return { phase: "unavailable", secondsLeft: 0 }
  return { phase: "grace", secondsLeft: graceSecondsLeft }
}

export function revealStatus(state: RevealState | null): string {
  if (!state) return "Synchronising with quicknet."
  if (state.phase === "countdown") {
    if (state.secondsLeft > 60) return "The selected Quicknet round is more than one minute away."
    if (state.secondsLeft > 30) return "The selected Quicknet round is less than one minute away."
    if (state.secondsLeft > 10) return "The selected Quicknet round is less than 30 seconds away."
    return "The selected Quicknet round is less than 10 seconds away."
  }
  if (state.phase === "checking" || state.phase === "grace") return "The selected Quicknet round is due. GlassPick is checking the relays."
  if (state.phase === "unavailable") return "Quicknet is unavailable. Manual beacon entry is available."
  if (state.phase === "mismatch") return "The supplied beacon does not match this draw."
  if (state.phase === "manual") return "The result uses an unverified manual beacon."
  return "The result is confirmed against quicknet."
}

export function relayFailureState(current: RelayState, error: unknown, graceExpired: boolean): RelayState {
  if (error instanceof DrandMismatchError) return "mismatch"
  if (current === "manual" || current === "mismatch") return current
  return graceExpired ? "unavailable" : "waiting"
}
