import { describe, expect, it } from "vitest"
import { createCommitment, parseEntries, runDraw } from "./draw"
import { createFullEnvelope, createPendingEnvelope, createStub, decodeHash } from "./envelope"

async function compressedHash(value: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("deflate"))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `#gp1=${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`
}

function rawHash(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `#gp1=${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`
}

async function compressedBytesHash(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream("deflate"))
  return rawHash(new Uint8Array(await new Response(stream).arrayBuffer()))
}

async function fixture() {
  const commitment = await createCommitment({
    entries: parseEntries("álïce,2\nボブ,1\ncarol,1", true),
    winnerCount: 1,
    alternateCount: 1,
    nonce: "00112233445566778899aabbccddeeff",
    round: 99,
  })
  return { commitment, record: await runDraw(commitment, "ab".repeat(32)) }
}

describe("proof envelopes", () => {
  it("keeps the default stub free of names and outcomes", async () => {
    const { record } = await fixture()
    const hash = createStub(record)
    expect(hash).not.toContain("alice")
    expect(await decodeHash(hash)).toMatchObject({ type: "stub", commitmentHash: record.commitmentHash })
  })

  it("round trips a compressed Unicode record", async () => {
    const { record } = await fixture()
    expect(await decodeHash(await createFullEnvelope(record))).toEqual({ type: "full", record })
  })

  it("round trips a pending draw independently", async () => {
    const { commitment } = await fixture()
    const pending = { envelopeVersion: 1 as const, commitment }
    expect(await decodeHash(await createPendingEnvelope(pending))).toEqual({ type: "pending", pending })
  })

  it("rejects damage and oversized fragments", async () => {
    await expect(decodeHash("#gp1=%%%")) .rejects.toThrow("Invalid GlassPick link")
    await expect(decodeHash(`#gp1=${"a".repeat(16001)}`)).rejects.toThrow("safety limit")
  })

  it("ignores unrelated anchors but rejects unsupported GlassPick versions", async () => {
    await expect(decodeHash("#section-2")).resolves.toBeNull()
    await expect(decodeHash("#gp2=value")).rejects.toThrow("Unsupported GlassPick link version")
    await expect(decodeHash("#gpp2=value")).rejects.toThrow("Unsupported GlassPick link version")
  })

  it("requires a full wrapper containing exactly type and record", async () => {
    const { record } = await fixture()
    await expect(decodeHash(await compressedHash({ type: "full", record, extra: true })))
      .rejects.toThrow("exactly type and record")
    await expect(decodeHash(await compressedHash({ type: "full" })))
      .rejects.toThrow("exactly type and record")
  })

  it("rejects malformed UTF-8 in raw and compressed envelopes", async () => {
    await expect(decodeHash(rawHash(Uint8Array.of(0xc3, 0x28)))).rejects.toThrow("Invalid GlassPick link")
    await expect(decodeHash(await compressedBytesHash(Uint8Array.of(0xc3, 0x28)))).rejects.toThrow("Invalid GlassPick link")
  })

  it("rejects highly compressible JSON over 1 MB before creating links", async () => {
    const { record, commitment } = await fixture()
    const oversizedName = "a".repeat(1_000_001)
    const oversizedRecord = { ...record, entries: [{ name: oversizedName, weight: 1 }] }
    const oversizedPending = { envelopeVersion: 1 as const, commitment: { ...commitment, entries: [{ name: oversizedName, weight: 1 }] } }

    await expect(createFullEnvelope(oversizedRecord)).rejects.toThrow("1 MB")
    await expect(createPendingEnvelope(oversizedPending)).rejects.toThrow("1 MB")
  })
})
