import { describe, expect, it } from "vitest"
import { createCommitment, parseEntries, runDraw } from "./engine/draw"
import { createPendingEnvelope, createStub } from "./engine/envelope"
import { classifyHash, resolveRoute, seededTab } from "./routes"

describe("classifyHash", () => {
  it("routes only envelope links, the empty hash, and the design-system page", () => {
    expect(classifyHash("")).toBe("app")
    expect(classifyHash("#design-system")).toBe("design")
    expect(classifyHash("#gp1=abc")).toBe("envelope")
    expect(classifyHash("#gpp1=abc")).toBe("envelope")
    expect(classifyHash("#gp9=abc")).toBe("envelope")
  })

  it("leaves in-page anchors alone", () => {
    expect(classifyHash("#main-content")).toBe("ignored")
    expect(classifyHash("#live-reveal")).toBe("ignored")
    expect(classifyHash("#anything")).toBe("ignored")
  })
})

describe("seededTab", () => {
  it("seeds the verify tab for proof links only", () => {
    expect(seededTab("#gp1=x")).toBe("verify")
    expect(seededTab("#gpp1=x")).toBe("draw")
    expect(seededTab("#gp9=x")).toBe("draw")
    expect(seededTab("")).toBe("draw")
    expect(seededTab("#design-system")).toBe("draw")
  })
})

describe("resolveRoute", () => {
  it("publishes a fresh object per resolution so route transitions reset the verify page", async () => {
    expect(await resolveRoute("")).not.toBe(await resolveRoute(""))
  })

  it("classifies non-envelope routes without decoding", async () => {
    await expect(resolveRoute("")).resolves.toEqual({ kind: "app" })
    await expect(resolveRoute("#design-system")).resolves.toEqual({ kind: "design" })
    await expect(resolveRoute("#main-content")).resolves.toEqual({ kind: "ignored" })
    await expect(resolveRoute("#live-reveal")).resolves.toEqual({ kind: "ignored" })
  })

  it("decodes a stub link once into a proof route", async () => {
    const commitment = await createCommitment({
      entries: parseEntries("alice,2\nbob,1\ncarol,1", true),
      winnerCount: 1,
      alternateCount: 1,
      nonce: "00112233445566778899aabbccddeeff",
      round: 99,
    })
    const record = await runDraw(commitment, "ab".repeat(32))
    await expect(resolveRoute(createStub(record))).resolves.toMatchObject({
      kind: "proof",
      envelope: { type: "stub", commitmentHash: record.commitmentHash },
    })
  })

  it("decodes a pending link into a reveal route", async () => {
    const commitment = await createCommitment({
      entries: parseEntries("alice,2\nbob,1", true),
      winnerCount: 1,
      alternateCount: 0,
      nonce: "00112233445566778899aabbccddeeff",
      round: 99,
    })
    const pending = { envelopeVersion: 1 as const, commitment }
    await expect(resolveRoute(await createPendingEnvelope(pending))).resolves.toMatchObject({
      kind: "reveal",
      pending: { commitment: { commitmentHash: commitment.commitmentHash } },
    })
  })

  it("turns decode failures into link-error routes", async () => {
    await expect(resolveRoute("#gp1=notavalidenvelope")).resolves.toEqual({
      kind: "link-error",
      message: "Invalid GlassPick link: the link is damaged or incomplete",
    })
    await expect(resolveRoute("#gp9=abc")).resolves.toEqual({
      kind: "link-error",
      message: "Unsupported GlassPick link version",
    })
  })
})
