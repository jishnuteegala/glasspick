import { CHAIN_HASH, createCommitment, type DrawCommitment, type DrawInputs } from "./draw"

export interface DrandRound {
  round: number
  randomness: string
}

export interface DrandChainInfo {
  hash: string
  period: number
  genesis_time: number
}

export const RELAYS = ["https://api.drand.sh", "https://drand.cloudflare.com"]
export const QUICKNET_SCHEDULE: DrandChainInfo = {
  hash: CHAIN_HASH,
  period: 3,
  genesis_time: 1692803367,
}
export const COMMITMENT_LEAD_ROUNDS = 5
export const COMMITMENT_SAFETY_ROUNDS = 3
export const COMMITMENT_ATTEMPTS = 3
const HEX_64 = /^[0-9a-f]{64}$/
export type FetchLike = typeof fetch

export class DrandMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DrandMismatchError"
  }
}

export class DrandUnavailableError extends Error {
  constructor() {
    super("All quicknet relays are unavailable")
    this.name = "DrandUnavailableError"
  }
}

function parseRound(value: unknown, expected?: number): DrandRound {
  if (typeof value !== "object" || value === null) throw new Error("Malformed drand response")
  const data = value as Record<string, unknown>
  if (!Number.isSafeInteger(data.round) || Number(data.round) < 1 || !HEX_64.test(String(data.randomness))) {
    throw new Error("Malformed drand round")
  }
  if (expected !== undefined && data.round !== expected) throw new DrandMismatchError("Drand returned the wrong round")
  return { round: Number(data.round), randomness: String(data.randomness) }
}

async function fetchRelay(relay: string, path: string, timeoutMs: number, fetcher: FetchLike, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener("abort", abort, { once: true })
  try {
    const response = await fetcher(`${relay}/${CHAIN_HASH}${path}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`${relay} responded ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener("abort", abort)
  }
}

export async function fetchFirst<T>(
  path: string,
  validate: (value: unknown) => T,
  timeoutMs = 5000,
  fetcher: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await Promise.any(RELAYS.map(async (relay, index) => {
      if (index) await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 120))
      return validate(await fetchRelay(relay, path, timeoutMs, fetcher, signal))
    }))
  } catch (error) {
    if (error instanceof AggregateError) {
      const mismatch = error.errors.find((failure: unknown) => failure instanceof DrandMismatchError)
      if (mismatch instanceof DrandMismatchError) throw mismatch
    }
    throw new DrandUnavailableError()
  }
}

export async function fetchChainInfo(fetcher?: FetchLike, signal?: AbortSignal): Promise<DrandChainInfo> {
  return fetchFirst("/info", (data) => {
    if (typeof data !== "object" || data === null) throw new Error("Malformed drand chain info")
    const info = data as Record<string, unknown>
    if (info.hash !== QUICKNET_SCHEDULE.hash || info.period !== QUICKNET_SCHEDULE.period ||
        info.genesis_time !== QUICKNET_SCHEDULE.genesis_time) {
      throw new DrandMismatchError("Drand chain information does not match quicknet")
    }
    return QUICKNET_SCHEDULE
  }, 5000, fetcher, signal)
}

export async function fetchLatestRound(fetcher?: FetchLike, signal?: AbortSignal): Promise<DrandRound> {
  return fetchFirst("/public/latest", (data) => parseRound(data), 5000, fetcher, signal)
}

export async function fetchLatestRoundConsensus(fetcher: FetchLike = fetch, signal?: AbortSignal): Promise<DrandRound> {
  let rounds: DrandRound[]
  try {
    rounds = await Promise.all(RELAYS.map(async (relay) => parseRound(
      await fetchRelay(relay, "/public/latest", 5000, fetcher, signal),
    )))
  } catch {
    if (signal?.aborted) throw signal.reason
    throw new DrandUnavailableError()
  }
  if (rounds[0].round === rounds[1].round && rounds[0].randomness !== rounds[1].randomness) {
    throw new DrandMismatchError(`Quicknet relays disagree on randomness for round ${rounds[0].round}`)
  }
  return rounds.reduce((latest, round) => round.round > latest.round ? round : latest)
}

async function fetchRoundConsensus(round: number, fetcher: FetchLike = fetch, signal?: AbortSignal): Promise<DrandRound> {
  const results = await Promise.allSettled(RELAYS.map(async (relay) => parseRound(
    await fetchRelay(relay, `/public/${round}`, 5000, fetcher, signal),
    round,
  )))
  if (signal?.aborted) throw signal.reason
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (failures.some(({ reason }) => !(reason instanceof DrandMismatchError))) {
    throw new DrandUnavailableError()
  }
  if (failures.length > 0) throw failures[0].reason
  const rounds = results.filter((result): result is PromiseFulfilledResult<DrandRound> => result.status === "fulfilled")
    .map(({ value }) => value)
  if (rounds[0].randomness !== rounds[1].randomness) {
    throw new DrandMismatchError(`Quicknet relays disagree on randomness for round ${round}`)
  }
  return rounds[0]
}

export async function fetchRound(round: number, fetcher?: FetchLike, signal?: AbortSignal): Promise<DrandRound> {
  return fetchRoundConsensus(round, fetcher, signal)
}

export async function fetchMatchingRound(round: number, randomness: string, fetcher?: FetchLike, signal?: AbortSignal): Promise<DrandRound> {
  const parsed = await fetchRoundConsensus(round, fetcher, signal)
  if (parsed.randomness !== randomness) throw new DrandMismatchError("Relay randomness does not match")
  return parsed
}

export function estimateRoundTime(info: DrandChainInfo, round: number): number {
  return (info.genesis_time + (round - 1) * info.period) * 1000
}

export function targetRound(info: DrandChainInfo, wallNow: number, latestRound: number, leadRounds = 3): number {
  const scheduledRound = Math.floor((wallNow / 1000 - info.genesis_time) / info.period) + 1
  return Math.max(latestRound, scheduledRound) + leadRounds
}

export async function fetchCommitmentTargetRound(
  wallNow: number | (() => number) = Date.now,
  fetchInfo: (signal?: AbortSignal) => Promise<DrandChainInfo> = (signal) => fetchChainInfo(undefined, signal),
  fetchLatest: (signal?: AbortSignal) => Promise<DrandRound> = (signal) => fetchLatestRoundConsensus(fetch, signal),
  signal?: AbortSignal,
): Promise<number> {
  const info = await fetchInfo(signal)
  let latest: DrandRound
  try {
    latest = await fetchLatest(signal)
  } catch {
    throw new Error("Could not confirm the latest Quicknet round. Check your connection and try creating the commitment again.")
  }
  return targetRound(info, typeof wallNow === "function" ? wallNow() : wallNow, latest.round)
}

type CommitmentInputs = Omit<DrawInputs, "round">

export interface FutureCommitmentDependencies {
  now?: () => number
  fetchInfo?: (signal?: AbortSignal) => Promise<DrandChainInfo>
  fetchLatest?: (signal?: AbortSignal) => Promise<DrandRound>
  create?: (inputs: DrawInputs) => Promise<DrawCommitment>
}

export async function createFutureCommitment(
  inputs: CommitmentInputs,
  signal?: AbortSignal,
  dependencies: FutureCommitmentDependencies = {},
): Promise<DrawCommitment> {
  const now = dependencies.now ?? Date.now
  const fetchInfo = dependencies.fetchInfo ?? ((requestSignal) => fetchChainInfo(undefined, requestSignal))
  const fetchLatest = dependencies.fetchLatest ?? ((requestSignal) => fetchLatestRoundConsensus(fetch, requestSignal))
  const create = dependencies.create ?? createCommitment

  for (let attempt = 0; attempt < COMMITMENT_ATTEMPTS; attempt++) {
    const [info, latestBefore] = await Promise.all([fetchInfo(signal), fetchLatest(signal)])
    const round = targetRound(info, now(), latestBefore.round, COMMITMENT_LEAD_ROUNDS)
    const commitment = await create({ ...inputs, round })
    const latestAfter = await fetchLatest(signal)
    const scheduledAfter = targetRound(info, now(), 0, 0)
    if (commitment.round >= Math.max(latestAfter.round, scheduledAfter) + COMMITMENT_SAFETY_ROUNDS) {
      return commitment
    }
  }
  throw new Error(`Could not guarantee a future Quicknet round after ${COMMITMENT_ATTEMPTS} attempts. Try creating the commitment again.`)
}

export async function fetchRoundWithRetry(round: number, attempts = 15, delayMs = 2000, signal?: AbortSignal) {
  let failure: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchRound(round, undefined, signal)
    } catch (error) {
      failure = error
      if (attempt < attempts - 1) await new Promise<void>((resolve, reject) => {
        const finish = () => {
          signal?.removeEventListener("abort", abort)
          resolve()
        }
        const timeout = setTimeout(finish, delayMs)
        const abort = () => {
          clearTimeout(timeout)
          reject(signal?.reason)
        }
        if (signal?.aborted) abort()
        else signal?.addEventListener("abort", abort, { once: true })
      })
    }
  }
  throw failure instanceof Error ? failure : new Error(`Round ${round} is unavailable`)
}
