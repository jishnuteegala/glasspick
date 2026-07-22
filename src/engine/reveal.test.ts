import { describe, expect, it } from "vitest"
import { DrandMismatchError, DrandUnavailableError } from "./drand"
import { chainNow, observeLatestRound, parseManualRound, pendingIdentity, relayFailureState, revealState, revealStatus, scheduleObservation, shouldAttemptRound } from "./reveal"

describe("live reveal state", () => {
  it("moves from countdown through grace to unavailable", () => {
    expect(revealState(0, 10_000, "waiting")).toEqual({ phase: "countdown", secondsLeft: 10 })
    expect(revealState(10_000, 10_000, "waiting").phase).toBe("grace")
    expect(revealState(40_000, 10_000, "waiting").phase).toBe("unavailable")
  })

  it("makes manual recovery available when initial synchronization times out", () => {
    expect(revealState(0, 100_000, "unavailable")).toEqual({ phase: "unavailable", secondsLeft: 0 })
  })

  it("keeps a due reveal in checking while its initial request is active", () => {
    expect(revealState(100_000, 10_000, "waiting", true).phase).toBe("checking")
    expect(revealState(0, 10_000, "waiting", true).phase).toBe("countdown")
  })

  it("treats an observed target round as due despite a slow client clock", () => {
    expect(revealState(0, 10_000, "waiting", false, true).phase).toBe("grace")
    expect(shouldAttemptRound(0, 10_000, false, "waiting", true)).toBe(true)
  })

  it("derives chain time from the latest round and monotonic elapsed time", () => {
    const observation = observeLatestRound(null, 4, 2_000)

    expect(chainNow(observation, { genesis_time: 10, period: 3 }, 7_500)).toBe(24_500)
  })

  it("anchors chain time from the validated schedule without a latest response", () => {
    const schedule = { genesis_time: 10, period: 3 }
    const observation = scheduleObservation(schedule, 22_900, 5_000)

    expect(observation).toEqual({ round: 5, observedAt: 4_100 })
    expect(chainNow(observation, schedule, 7_000)).toBe(24_900)
    expect(shouldAttemptRound(chainNow(observation, schedule, 7_000), 22_000, false, "waiting")).toBe(true)
  })

  it("never regresses the latest-round clock anchor", () => {
    const current = observeLatestRound(null, 8, 1_000)

    expect(observeLatestRound(current, 7, 5_000)).toBe(current)
    expect(observeLatestRound(current, 8, 5_000)).toBe(current)
    expect(observeLatestRound(current, 9, 5_000)).toEqual({ round: 9, observedAt: 5_000 })
  })

  it("uses synchronized chain time for countdown and grace instead of a skewed wall clock", () => {
    const schedule = { genesis_time: 10, period: 3 }
    const beforeTarget = observeLatestRound(null, 4, 1_000)
    const targetObserved = observeLatestRound(beforeTarget, 5, 4_000)

    expect(revealState(chainNow(beforeTarget, schedule, 1_000), 22_000, "waiting").phase).toBe("countdown")
    expect(revealState(chainNow(targetObserved, schedule, 4_000), 22_000, "waiting").phase).toBe("grace")
    expect(revealState(chainNow(targetObserved, schedule, 34_000), 22_000, "waiting").phase).toBe("unavailable")
  })

  it("uses the commitment hash as the live reveal identity", () => {
    expect(pendingIdentity({ commitment: { commitmentHash: "first" } })).toBe("first")
    expect(pendingIdentity({ commitment: { commitmentHash: "second" } })).not.toBe("first")
  })

  it("keeps manual randomness amber until a relay confirms it", () => {
    expect(revealState(20_000, 10_000, "manual").phase).toBe("manual")
    expect(revealState(20_000, 10_000, "verified").phase).toBe("verified")
    expect(revealState(20_000, 10_000, "mismatch").phase).toBe("mismatch")
  })

  it("classifies live relay contradictions, manual outages, and unavailable relays", () => {
    expect(relayFailureState("waiting", new DrandMismatchError("mismatch"), false)).toBe("mismatch")
    expect(relayFailureState("manual", new DrandUnavailableError(), true)).toBe("manual")
    expect(relayFailureState("waiting", new DrandUnavailableError(), false)).toBe("waiting")
    expect(relayFailureState("waiting", new DrandUnavailableError(), true)).toBe("unavailable")
  })

  it("attempts a late link once but limits automatic retries to the grace period", () => {
    expect(shouldAttemptRound(100_000, 10_000, false, "waiting")).toBe(true)
    expect(shouldAttemptRound(100_000, 10_000, true, "waiting")).toBe(false)
    expect(shouldAttemptRound(12_000, 10_000, true, "waiting")).toBe(true)
    expect(shouldAttemptRound(12_000, 10_000, false, "verified")).toBe(false)
  })

  it("reports invalid manual input without classifying it as a relay mismatch", () => {
    expect(() => parseManualRound("not json", 7)).toThrow("valid JSON")
    expect(() => parseManualRound('{"round":8,"randomness":"' + "ab".repeat(32) + '"}', 7)).toThrow("round 7")
    expect(() => parseManualRound('{"round":7,"randomness":"nope"}', 7)).toThrow("64 lowercase")
    expect(parseManualRound('{"round":7,"randomness":"' + "ab".repeat(32) + '"}', 7)).toEqual({
      round: 7,
      randomness: "ab".repeat(32),
    })
  })

  it("reports grace progress and stable accessible countdown milestones", () => {
    expect(revealState(12_000, 10_000, "waiting")).toEqual({ phase: "grace", secondsLeft: 28 })
    expect(revealStatus({ phase: "countdown", secondsLeft: 59 })).toContain("less than one minute")
    expect(revealStatus({ phase: "countdown", secondsLeft: 31 })).toBe(revealStatus({ phase: "countdown", secondsLeft: 45 }))
    expect(revealStatus({ phase: "grace", secondsLeft: 28 })).toContain("checking the relays")
  })
})
