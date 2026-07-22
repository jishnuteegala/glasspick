import { CHAIN_HASH, createCommitment, parsePending, parseRecord, type DrawRecord, type PendingDraw } from "./draw"

export const MAX_ENCODED_LENGTH = 16_000
export const MAX_OUTPUT_BYTES = 1_000_000

export interface ProofStub {
  type: "stub"
  commitmentHash: string
  chainHash: string
  round: number
  winnerCount: number
  alternateCount: number
}

export type ProofEnvelope = { type: "full"; record: DrawRecord } | ProofStub

function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function requireCompression(): void {
  if (!("CompressionStream" in globalThis) || !("DecompressionStream" in globalThis)) {
    throw new Error("Compressed links are not supported by this browser. Download the JSON record instead.")
  }
}

async function compress(value: string): Promise<Uint8Array> {
  requireCompression()
  const bytes = new TextEncoder().encode(value)
  if (bytes.byteLength > MAX_OUTPUT_BYTES) throw new Error("Link JSON exceeds the 1 MB safety limit")
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function decompress(value: Uint8Array): Promise<string> {
  requireCompression()
  const bytes = new Uint8Array(value)
  const stream = new Blob([bytes.buffer]).stream().pipeThrough(new DecompressionStream("deflate"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value: chunk } = await reader.read()
    if (done) break
    size += chunk.byteLength
    if (size > MAX_OUTPUT_BYTES) {
      await reader.cancel()
      throw new Error("Decoded link exceeds the 1 MB safety limit")
    }
    chunks.push(chunk)
  }
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(output)
}

export function createStub(record: DrawRecord): string {
  const stub: ProofStub = {
    type: "stub",
    commitmentHash: record.commitmentHash,
    chainHash: record.chainHash,
    round: record.round,
    winnerCount: record.winnerCount,
    alternateCount: record.alternateCount,
  }
  return `#gp1=${encodeBase64(new TextEncoder().encode(JSON.stringify(stub)))}`
}

export async function createFullEnvelope(record: DrawRecord): Promise<string> {
  const encoded = encodeBase64(await compress(JSON.stringify({ type: "full", record })))
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error("Full link exceeds the 16,000-character safety limit")
  return `#gp1=${encoded}`
}

export async function createPendingEnvelope(pending: PendingDraw): Promise<string> {
  const encoded = encodeBase64(await compress(JSON.stringify(pending)))
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error("Live link exceeds the 16,000-character safety limit")
  return `#gpp1=${encoded}`
}

export async function decodeHash(hash: string): Promise<ProofEnvelope | { type: "pending"; pending: PendingDraw } | null> {
  if (!hash.startsWith("#gp1=") && !hash.startsWith("#gpp1=")) {
    if (/^#gpp?\d+=/.test(hash)) throw new Error("Unsupported GlassPick link version")
    return null
  }
  const value = hash.slice(hash.indexOf("=") + 1)
  if (!value || value.length > MAX_ENCODED_LENGTH) throw new Error("Link is empty or exceeds the safety limit")
  try {
    if (hash.startsWith("#gpp1=")) {
      const pending = parsePending(JSON.parse(await decompress(decodeBase64(value))))
      const commitment = await createCommitment(pending.commitment)
      if (commitment.commitmentHash !== pending.commitment.commitmentHash) {
        throw new Error("Pending commitment does not match its inputs")
      }
      return { type: "pending", pending }
    }
    const bytes = decodeBase64(value)
    let decoded: unknown
    try {
      decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown
    } catch {
      decoded = null
    }
    if (typeof decoded === "object" && decoded !== null && "type" in decoded && decoded.type === "stub") {
      const stub = decoded as Record<string, unknown>
      const stubKeys = ["type", "commitmentHash", "chainHash", "round", "winnerCount", "alternateCount"]
      if (Object.keys(stub).some((key) => !stubKeys.includes(key))) throw new Error("Proof stub contains unknown fields")
      if (![stub.commitmentHash, stub.chainHash].every((item) => typeof item === "string") ||
          ![stub.round, stub.winnerCount, stub.alternateCount].every(Number.isSafeInteger)) {
        throw new Error("Malformed proof stub")
      }
      if (!/^[0-9a-f]{64}$/.test(String(stub.commitmentHash)) || stub.chainHash !== CHAIN_HASH ||
          Number(stub.round) < 1 || Number(stub.winnerCount) < 1 || Number(stub.alternateCount) < 0 || Number(stub.alternateCount) > 5) {
        throw new Error("Proof stub contains invalid values")
      }
      return decoded as ProofStub
    }
    const full = JSON.parse(await decompress(bytes)) as Record<string, unknown>
    if (typeof full !== "object" || full === null || Array.isArray(full) ||
        Object.keys(full).length !== 2 || !Object.hasOwn(full, "type") || !Object.hasOwn(full, "record")) {
      throw new Error("Proof envelope must contain exactly type and record")
    }
    if (full.type !== "full") throw new Error("Unsupported proof envelope")
    return { type: "full", record: parseRecord(full.record) }
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid GlassPick link: ${error.message}` : "Invalid GlassPick link")
  }
}
