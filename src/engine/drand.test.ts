import { describe, expect, it, vi } from "vitest"
import { CHAIN_HASH } from "./draw"
import { createFutureCommitment, DrandMismatchError, DrandUnavailableError, estimateRoundTime, fetchChainInfo, fetchCommitmentTargetRound, fetchLatestRoundConsensus, fetchMatchingRound, fetchRound, QUICKNET_SCHEDULE, targetRound } from "./drand"
import { createCommitment } from "./draw"

const COMMITMENT_INPUTS = {
  entries: [{ name: "alice", weight: 1 }, { name: "bob", weight: 1 }],
  winnerCount: 1,
  alternateCount: 0,
  nonce: "00112233445566778899aabbccddeeff",
}

describe("quicknet client", () => {
  it("uses chain-specific paths and validates chain information", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hash: CHAIN_HASH,
      period: 3,
      genesis_time: 1692803367,
    })))
    const info = await fetchChainInfo(fetchMock)
    expect(info.hash).toBe(CHAIN_HASH)
    expect(fetchMock.mock.calls[0][0]).toContain(`/${CHAIN_HASH}/info`)
    expect(estimateRoundTime(info, 2)).toBe(1692803370000)
  })

  it("selects a future target using both the schedule and latest round", () => {
    const info = { hash: CHAIN_HASH, period: 3, genesis_time: 10 }

    expect(targetRound(info, 22_900, 4)).toBe(8)
    expect(targetRound(info, 22_900, 9)).toBe(12)
  })

  it("fails commitment targeting closed when latest round cannot be confirmed", async () => {
    const info = { hash: CHAIN_HASH, period: 3, genesis_time: 10 }
    await expect(fetchCommitmentTargetRound(22_900, async () => info, async () => {
      throw new TypeError("offline")
    })).rejects.toThrow("Check your connection and try creating the commitment again")
  })

  it("uses the newest latest round returned by every configured relay", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "ab".repeat(32) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 9, randomness: "cd".repeat(32) })))

    await expect(fetchLatestRoundConsensus(fetchMock)).resolves.toEqual({ round: 9, randomness: "cd".repeat(32) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("rejects same-round relay randomness contradictions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 9, randomness: "ab".repeat(32) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 9, randomness: "cd".repeat(32) })))

    await expect(fetchLatestRoundConsensus(fetchMock)).rejects.toBeInstanceOf(DrandMismatchError)
  })

  it("retries the entire commitment flow when creation latency consumes its safety margin", async () => {
    const fetchLatest = vi.fn()
      .mockResolvedValueOnce({ round: 100, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 101, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 103, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 104, randomness: "ab".repeat(32) })
    const round100 = 1_692_803_367_000 + 99 * 3_000
    const now = vi.fn()
      .mockReturnValueOnce(round100)
      .mockReturnValueOnce(round100 + 3 * 3_000)
      .mockReturnValueOnce(round100 + 3 * 3_000)
      .mockReturnValueOnce(round100 + 4 * 3_000)
    const create = vi.fn(createCommitment)

    const commitment = await createFutureCommitment(COMMITMENT_INPUTS, undefined, {
      now,
      fetchInfo: async () => QUICKNET_SCHEDULE,
      fetchLatest,
      create,
    })

    expect(create.mock.calls.map(([inputs]) => inputs.round)).toEqual([105, 108])
    expect(commitment.round).toBe(108)
    expect(fetchLatest).toHaveBeenCalledTimes(4)
    expect(now).toHaveBeenCalledTimes(4)
  })

  it("fails without publishing after the default three revalidations exhaust the safety margin", async () => {
    const fetchLatest = vi.fn()
      .mockResolvedValueOnce({ round: 100, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 103, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 103, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 106, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 106, randomness: "ab".repeat(32) })
      .mockResolvedValueOnce({ round: 109, randomness: "ab".repeat(32) })
    const create = vi.fn(createCommitment)

    await expect(createFutureCommitment(COMMITMENT_INPUTS, undefined, {
      now: () => 1_692_803_367_000,
      fetchInfo: async () => QUICKNET_SCHEDULE,
      fetchLatest,
      create,
    })).rejects.toThrow("Could not guarantee a future Quicknet round after 3 attempts")
    expect(create).toHaveBeenCalledTimes(3)
    expect(fetchLatest).toHaveBeenCalledTimes(6)
  })

  it("fails consensus when one configured relay is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 9, randomness: "cd".repeat(32) })))
      .mockRejectedValueOnce(new TypeError("offline"))

    await expect(fetchLatestRoundConsensus(fetchMock)).rejects.toBeInstanceOf(DrandUnavailableError)
  })

  it("ignores malformed chain information when another relay returns the canonical schedule", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: CHAIN_HASH, period: 0, genesis_time: 0 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        hash: CHAIN_HASH,
        period: 3,
        genesis_time: 1692803367,
      })))
    await expect(fetchChainInfo(fetchMock)).resolves.toEqual({
      hash: CHAIN_HASH,
      period: 3,
      genesis_time: 1692803367,
    })
  })

  it("rejects a relay response for another round", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      round: 8,
      randomness: "ab".repeat(32),
    })))
    await expect(fetchRound(7, fetchMock)).rejects.toBeInstanceOf(DrandMismatchError)
  })

  it("rejects contradicting exact-round randomness from otherwise valid relays", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "ab".repeat(32) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "cd".repeat(32) })))
    await expect(fetchRound(7, fetchMock)).rejects.toBeInstanceOf(DrandMismatchError)
  })

  it("accepts exact-round randomness only when both relays agree", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "cd".repeat(32) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "cd".repeat(32) })))
    await expect(fetchMatchingRound(7, "cd".repeat(32), fetchMock)).resolves.toEqual({
      round: 7, randomness: "cd".repeat(32),
    })
  })

  it("rejects matching and contradicting exact-round responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "ab".repeat(32) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "cd".repeat(32) })))
    await expect(fetchMatchingRound(7, "cd".repeat(32), fetchMock)).rejects.toBeInstanceOf(DrandMismatchError)
  })

  it("fails exact-round consensus when one relay is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ round: 7, randomness: "cd".repeat(32) })))
      .mockRejectedValueOnce(new TypeError("offline"))
    await expect(fetchRound(7, fetchMock)).rejects.toBeInstanceOf(DrandUnavailableError)
  })

  it("passes abort signals through normal and matching round requests", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal)
      return Promise.reject(new DOMException("aborted", "AbortError"))
    })
    const normal = fetchRound(7, fetchMock, controller.signal).catch(() => undefined)
    const matching = fetchMatchingRound(7, "cd".repeat(32), fetchMock, controller.signal).catch(() => undefined)
    controller.abort()
    await Promise.all([normal, matching])
    expect(fetchMock).toHaveBeenCalled()
  })

  it("passes abort signals through chain info and latest consensus requests", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal)
      return Promise.reject(new DOMException("aborted", "AbortError"))
    })
    const info = fetchChainInfo(fetchMock, controller.signal).catch(() => undefined)
    const latest = fetchLatestRoundConsensus(fetchMock, controller.signal).catch(() => undefined)
    controller.abort()
    await Promise.all([info, latest])
    expect(fetchMock).toHaveBeenCalled()
  })
})
