export interface DrandRound {
  round: number
  randomness: string
}

export interface DrandChainInfo {
  period: number
  genesis_time: number
}

const RELAYS = [
  "https://api.drand.sh",
  "https://drand.cloudflare.com",
]

async function fetchFirst(path: string): Promise<unknown> {
  let lastError: unknown
  for (const relay of RELAYS) {
    try {
      const res = await fetch(`${relay}${path}`)
      if (!res.ok) throw new Error(`${relay}${path} responded ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All drand relays failed")
}

export async function fetchChainInfo(): Promise<DrandChainInfo> {
  const data = (await fetchFirst("/info")) as DrandChainInfo
  return { period: data.period, genesis_time: data.genesis_time }
}

export async function fetchLatestRound(): Promise<DrandRound> {
  const data = (await fetchFirst("/public/latest")) as DrandRound
  return { round: data.round, randomness: data.randomness }
}

export async function fetchRound(round: number): Promise<DrandRound> {
  const data = (await fetchFirst(`/public/${round}`)) as DrandRound
  return { round: data.round, randomness: data.randomness }
}

export async function fetchRoundWithRetry(
  round: number,
  attempts = 5,
  delayMs = 2000,
): Promise<DrandRound> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchRound(round)
    } catch (err) {
      lastError = err
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Round ${round} not available yet`)
}

export function estimateRoundTime(
  info: DrandChainInfo,
  round: number,
): number {
  return (info.genesis_time + (round - 1) * info.period) * 1000
}
