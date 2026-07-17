import { sha256Hex } from "./hash"

export interface DrawCommitment {
  version: 1
  participantsHash: string
  participantCount: number
  winnerCount: number
  nonce: string
  drandRound: number
  commitmentHash: string
}

export interface DrawRecord {
  version: 1
  participants: string[]
  winnerCount: number
  nonce: string
  drandRound: number
  drandRandomness: string
  commitmentHash: string
  seed: string
  winners: string[]
}

export function canonicalizeParticipants(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const line of raw.split(/[\n,]+/)) {
    const name = line.trim().replace(/^@/, "")
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }
  result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), "en"))
  return result
}

export async function hashParticipants(participants: string[]): Promise<string> {
  return sha256Hex(participants.map((p) => p.toLowerCase()).join("\n"))
}

export async function createCommitment(
  participants: string[],
  winnerCount: number,
  nonce: string,
  drandRound: number,
): Promise<DrawCommitment> {
  const participantsHash = await hashParticipants(participants)
  const commitmentHash = await sha256Hex(
    `glasspick-v1|${participantsHash}|${participants.length}|${winnerCount}|${nonce}|${drandRound}`,
  )
  return {
    version: 1,
    participantsHash,
    participantCount: participants.length,
    winnerCount,
    nonce,
    drandRound,
    commitmentHash,
  }
}

export async function deriveSeed(
  commitmentHash: string,
  drandRandomness: string,
): Promise<string> {
  return sha256Hex(`glasspick-seed-v1|${commitmentHash}|${drandRandomness}`)
}

export async function pickWinners(
  participants: string[],
  winnerCount: number,
  seed: string,
): Promise<string[]> {
  const pool = [...participants]
  const winners: string[] = []
  const count = Math.min(winnerCount, pool.length)
  for (let i = 0; i < count; i++) {
    const digest = await sha256Hex(`${seed}|${i}`)
    const index = Number(BigInt(`0x${digest}`) % BigInt(pool.length))
    winners.push(pool[index])
    pool.splice(index, 1)
  }
  return winners
}

export async function runDraw(
  participants: string[],
  winnerCount: number,
  nonce: string,
  drandRound: number,
  drandRandomness: string,
): Promise<DrawRecord> {
  const commitment = await createCommitment(
    participants,
    winnerCount,
    nonce,
    drandRound,
  )
  const seed = await deriveSeed(commitment.commitmentHash, drandRandomness)
  const winners = await pickWinners(participants, winnerCount, seed)
  return {
    version: 1,
    participants,
    winnerCount,
    nonce,
    drandRound,
    drandRandomness,
    commitmentHash: commitment.commitmentHash,
    seed,
    winners,
  }
}

export interface VerificationResult {
  ok: boolean
  checks: { label: string; ok: boolean; detail: string }[]
}

export async function verifyDraw(record: DrawRecord): Promise<VerificationResult> {
  const checks: VerificationResult["checks"] = []

  const canonical = canonicalizeParticipants(record.participants.join("\n"))
  const canonicalOk =
    canonical.length === record.participants.length &&
    canonical.every((p, i) => p === record.participants[i])
  checks.push({
    label: "Participant list is canonical (deduped + sorted)",
    ok: canonicalOk,
    detail: canonicalOk
      ? `${record.participants.length} participants`
      : "List is not in canonical form; it may have been altered",
  })

  const commitment = await createCommitment(
    record.participants,
    record.winnerCount,
    record.nonce,
    record.drandRound,
  )
  const commitmentOk = commitment.commitmentHash === record.commitmentHash
  checks.push({
    label: "Commitment hash matches inputs",
    ok: commitmentOk,
    detail: commitmentOk
      ? record.commitmentHash
      : `Expected ${commitment.commitmentHash}, record says ${record.commitmentHash}`,
  })

  const seed = await deriveSeed(record.commitmentHash, record.drandRandomness)
  const seedOk = seed === record.seed
  checks.push({
    label: "Seed derived from commitment + drand randomness",
    ok: seedOk,
    detail: seedOk ? seed : `Expected ${seed}, record says ${record.seed}`,
  })

  const winners = await pickWinners(
    record.participants,
    record.winnerCount,
    seed,
  )
  const winnersOk =
    winners.length === record.winners.length &&
    winners.every((w, i) => w === record.winners[i])
  checks.push({
    label: "Winners reproduce exactly from the seed",
    ok: winnersOk,
    detail: winnersOk
      ? winners.join(", ")
      : `Recomputed: ${winners.join(", ")}`,
  })

  return { ok: checks.every((c) => c.ok), checks }
}
