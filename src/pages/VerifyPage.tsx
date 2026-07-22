import { useEffect, useEffectEvent, useRef, useState } from "react"
import type { DrawRecord } from "../engine/draw"
import { decodeHash, type ProofStub } from "../engine/envelope"
import { createGenerationGuard } from "../engine/generation"
import { verifyPublicDraw, type PublicVerification } from "../engine/verification"
import { parseRecordJson, readJsonFile } from "./verify-input"

export function VerifyPage({ initialHash = location.hash }: { initialHash?: string }) {
  const [raw, setRaw] = useState("")
  const [stub, setStub] = useState<ProofStub | null>(null)
  const [result, setResult] = useState<PublicVerification | null>(null)
  const [verifiedRecord, setVerifiedRecord] = useState<DrawRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [linkReady, setLinkReady] = useState(false)
  const linkGeneration = useRef(createGenerationGuard())
  const verificationGeneration = useRef(createGenerationGuard())
  const stubRef = useRef<ProofStub | null>(null)
  const verifyAbort = useRef<AbortController | null>(null)

  async function verifyRecord(record: DrawRecord, current = verificationGeneration.current.next()) {
    verifyAbort.current?.abort()
    const controller = new AbortController()
    verifyAbort.current = controller
    setBusy(true); setError(null); setResult(null)
    try {
      if (stubRef.current && stubRef.current.commitmentHash !== record.commitmentHash) throw new Error("This record does not match the shared commitment")
      const nextResult = await verifyPublicDraw(record, undefined, controller.signal)
      if (!verificationGeneration.current.isCurrent(current)) return
      setResult(nextResult); setVerifiedRecord(record); setRaw(JSON.stringify(record, null, 2))
    } catch (caught) {
      if (verificationGeneration.current.isCurrent(current)) setError(caught instanceof Error ? caught.message : "Verification failed")
    } finally {
      if (verificationGeneration.current.isCurrent(current)) setBusy(false)
      if (verifyAbort.current === controller) verifyAbort.current = null
    }
  }

  const verifyLinkedRecord = useEffectEvent(verifyRecord)

  useEffect(() => {
    const guard = linkGeneration.current
    const verifyGuard = verificationGeneration.current
    const current = guard.next()
    verifyAbort.current?.abort(); verificationGeneration.current.cancel()
    stubRef.current = null
    setLinkReady(false); setStub(null); setResult(null); setVerifiedRecord(null); setError(null)
    void decodeHash(initialHash).then((envelope) => {
      if (!guard.isCurrent(current)) return
      if (envelope?.type === "stub") { stubRef.current = envelope; setStub(envelope) }
      if (envelope?.type === "full") void verifyLinkedRecord(envelope.record)
    }).catch((caught: unknown) => {
      if (guard.isCurrent(current)) setError(caught instanceof Error ? caught.message : "Invalid link")
    }).finally(() => {
      if (guard.isCurrent(current)) setLinkReady(true)
    })
    return () => { guard.cancel(); verifyGuard.cancel(); verifyAbort.current?.abort() }
  }, [initialHash])

  async function submit() {
    try { await verifyRecord(parseRecordJson(raw)) }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Invalid JSON") }
  }

  async function upload(file: File | undefined) {
    if (!file) return
    const current = verificationGeneration.current.next()
    verifyAbort.current?.abort()
    setBusy(true); setResult(null); setVerifiedRecord(null); setError(null)
    try {
      const text = await readJsonFile(file)
      if (verificationGeneration.current.isCurrent(current)) setRaw(text)
    } catch (caught) {
      if (verificationGeneration.current.isCurrent(current)) setError(caught instanceof Error ? caught.message : "Could not read the JSON file")
    } finally {
      if (verificationGeneration.current.isCurrent(current)) setBusy(false)
    }
  }

  const headline = result?.state === "verified" ? "Verified against the public beacon" : result?.state === "local" ? "Locally consistent, beacon unavailable" : "Verification failed"
  return <div className="space-y-6">
    <section className="panel"><h1 className="text-base font-semibold">Verify a draw</h1>
      <p className="mt-1 text-sm text-muted">Paste or upload a v2 record. GlassPick validates it before recomputing any result.</p>
      {stub && <div className="notice-info mt-4">Privacy-safe proof for round {stub.round}. Paste the matching JSON record to complete verification.</div>}
      <label className="label" htmlFor="record-file">Upload downloaded JSON</label>
      <input id="record-file" className="file-control" type="file" accept="application/json,.json" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = "" }} />
      <textarea aria-label="Draw record JSON" rows={11} value={raw} onChange={(event) => { verificationGeneration.current.cancel(); verifyAbort.current?.abort(); setBusy(false); setRaw(event.target.value); setResult(null); setVerifiedRecord(null) }} placeholder='{"version":2,...}' className="control mt-4 font-mono" />
      <button className="button-primary mt-4" disabled={!linkReady || busy || !raw.trim()} onClick={submit}>{busy ? "Verifying..." : "Verify"}</button>
    </section>
    {error && <div role="alert" className="notice-fail">{error}</div>}
    {result && verifiedRecord && <section className="panel">
      <h2 className={`text-base font-semibold ${result.state === "verified" ? "text-ok" : result.state === "local" ? "text-warn" : "text-fail"}`}>{headline}</h2>
      <ul className="mt-4 space-y-3">{result.checks.map((check) => {
        const presentation = check.status === "pass"
          ? { className: "text-ok", icon: "✓", label: "Pass" }
          : check.status === "fail"
            ? { className: "text-fail", icon: "×", label: "Fail" }
            : { className: "text-warn", icon: "?", label: "Not confirmed" }
        return <li className="flex gap-3 text-sm" key={check.label}>
          <span aria-hidden="true" className={presentation.className}>{presentation.icon}</span>
          <div><div className="font-medium"><span className={presentation.className}>{presentation.label}:</span> {check.label}</div><div className="break-all font-mono text-muted">{check.detail}</div></div>
        </li>
      })}</ul>
      <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><h3 className="text-sm font-semibold">Winners</h3><p className="mt-1 text-sm">{verifiedRecord.winners.map((entry) => `@${entry.name}`).join(", ")}</p></div>
        <div><h3 className="text-sm font-semibold">Alternates</h3><p className="mt-1 text-sm">{verifiedRecord.alternates.map((entry) => `@${entry.name}`).join(", ") || "None"}</p></div></div>
    </section>}
  </div>
}
