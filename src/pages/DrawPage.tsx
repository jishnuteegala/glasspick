import { useEffect, useRef, useState } from "react"
import {
  parseEntries,
  runDraw,
  type DrawRecord,
  type PendingDraw,
  type WeightedEntry,
} from "../engine/draw"
import { createFutureCommitment, estimateRoundTime, fetchRoundWithRetry, QUICKNET_SCHEDULE } from "../engine/drand"
import { createFullEnvelope, createPendingEnvelope, createStub } from "../engine/envelope"
import { createGenerationGuard } from "../engine/generation"
import { randomNonceHex } from "../engine/hash"
import { PENDING_KEY, restorePending } from "../engine/pending"
import { resetDisclosureAcknowledgements } from "./draw-page-state"

export function ResultList({ title, entries }: { title: string; entries: WeightedEntry[] }) {
  return <div><h2 className="text-sm font-semibold">{title}</h2><ol className="mt-2 divide-y divide-line border-y border-line">
    {entries.map((entry, index) => <li className="flex items-center gap-3 py-3" key={entry.name}>
      <span className="w-6 text-sm text-muted">{index + 1}.</span><strong>@{entry.name}</strong>
      {entry.weight > 1 && <span className="text-sm text-muted">weight {entry.weight}</span>}
    </li>)}
  </ol></div>
}

export function DrawResults({ record }: { record: Pick<DrawRecord, "winners" | "alternates"> }) {
  return <section className="panel space-y-6">
    <h1 className="text-base font-semibold">Draw complete</h1>
    <ResultList title="Winners" entries={record.winners} />
    {record.alternates.length > 0 && <ResultList title="Alternates" entries={record.alternates} />}
  </section>
}

export function LiveLinkDisclosure({
  checked,
  onChange,
  onCopy,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  onCopy: () => void
}) {
  return <>
    <label className="touch-option mt-3 max-w-xl text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      I understand the live reveal link publishes entrant names and weights to anyone who receives it.
    </label>
    <button className="button-secondary" disabled={!checked} onClick={onCopy}>Copy entrant-revealing live link</button>
  </>
}

export function DrawPage() {
  const [raw, setRaw] = useState("")
  const [weighted, setWeighted] = useState(false)
  const [winnerCount, setWinnerCount] = useState(1)
  const [alternateCount, setAlternateCount] = useState(0)
  const [pending, setPending] = useState<PendingDraw | null>(null)
  const [record, setRecord] = useState<DrawRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [fullDisclosure, setFullDisclosure] = useState(false)
  const [liveDisclosure, setLiveDisclosure] = useState(false)
  const generation = useRef(createGenerationGuard())
  const commitAbort = useRef<AbortController | null>(null)
  const drawAbort = useRef<AbortController | null>(null)
  let entries: WeightedEntry[] = []
  let inputError: string | null = null
  try { entries = parseEntries(raw, weighted) } catch (caught) {
    inputError = caught instanceof Error ? caught.message : "Invalid entrant list"
  }

  useEffect(() => {
    let active = true
    const guard = generation.current
    void restorePending(localStorage)
      .then((saved) => { if (active) setPending(saved) })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not restore the saved commitment")
      })
      .finally(() => { if (active) setRestoring(false) })
    return () => { active = false; guard.cancel(); commitAbort.current?.abort(); drawAbort.current?.abort() }
  }, [])

  useEffect(() => {
    if (!pending || record) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pending, record])

  async function commit() {
    const current = generation.current.next()
    commitAbort.current?.abort()
    const controller = new AbortController()
    commitAbort.current = controller
    setBusy(true); setError(null)
    try {
      if (inputError) throw new Error(inputError)
      const commitment = await createFutureCommitment({
        entries,
        winnerCount,
        alternateCount,
        nonce: randomNonceHex(),
      }, controller.signal)
      if (!generation.current.isCurrent(current)) return
      const next = { envelopeVersion: 1 as const, commitment }
      localStorage.setItem(PENDING_KEY, JSON.stringify(next)); setPending(next)
    } catch (caught) {
      if (generation.current.isCurrent(current)) setError(caught instanceof Error ? caught.message : "Could not create commitment")
    } finally {
      if (generation.current.isCurrent(current)) setBusy(false)
      if (commitAbort.current === controller) commitAbort.current = null
    }
  }

  async function draw() {
    if (!pending) return
    const current = generation.current.next()
    const controller = new AbortController()
    drawAbort.current?.abort()
    drawAbort.current = controller
    setBusy(true); setError(null)
    try {
      const beacon = await fetchRoundWithRetry(pending.commitment.round, 15, 2000, controller.signal)
      const result = await runDraw(pending.commitment, beacon.randomness)
      if (!generation.current.isCurrent(current)) return
      setRecord(result); localStorage.removeItem(PENDING_KEY)
    } catch (caught) {
      if (generation.current.isCurrent(current)) setError(caught instanceof Error ? caught.message : "Could not fetch the beacon")
    } finally {
      if (generation.current.isCurrent(current)) setBusy(false)
      if (drawAbort.current === controller) drawAbort.current = null
    }
  }

  async function copyLink(kind: "stub" | "full" | "live") {
    try {
      let hash = ""
      if (kind === "live" && pending) hash = await createPendingEnvelope(pending)
      if (kind === "stub" && record) hash = createStub(record)
      if (kind === "full" && record) hash = await createFullEnvelope(record)
      const url = `${location.origin}${location.pathname}${hash}`
      if (url.length > 16_000) throw new Error("Generated URL exceeds the 16,000-character safety limit")
      await navigator.clipboard.writeText(url)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create link") }
  }

  function download() {
    if (!record) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url
    link.download = `glasspick-${record.commitmentHash.slice(0, 12)}.json`; link.click(); URL.revokeObjectURL(url)
  }

  function reset() {
    const disclosure = resetDisclosureAcknowledgements()
    generation.current.cancel(); commitAbort.current?.abort(); drawAbort.current?.abort(); localStorage.removeItem(PENDING_KEY); setPending(null); setRecord(null); setError(null); setBusy(false)
    setFullDisclosure(disclosure.full); setLiveDisclosure(disclosure.live)
  }

  const secondsLeft = pending ? Math.max(0, Math.ceil((estimateRoundTime(QUICKNET_SCHEDULE, pending.commitment.round) - now) / 1000)) : 0
  const countInvalid = winnerCount + alternateCount > entries.length
  return <div className="space-y-6">
    {!pending && !record && <section className="panel">
      <h1 className="text-base font-semibold">Run a draw</h1>
      <p className="mt-1 text-sm text-muted">Commit the exact entrant weights and outcomes before public randomness exists.</p>
      <fieldset className="mt-5"><legend className="text-sm font-medium">Input format</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 text-sm">
          <label className="touch-option"><input type="radio" checked={!weighted} onChange={() => setWeighted(false)} /> Plain names</label>
          <label className="touch-option"><input type="radio" checked={weighted} onChange={() => setWeighted(true)} /> Weighted, one name,weight per line</label>
        </div>
      </fieldset>
      <label className="label" htmlFor="entrants">Entrants</label>
      <textarea id="entrants" rows={9} value={raw} onChange={(event) => setRaw(event.target.value)}
        placeholder={weighted ? "alice,3\nbob,1" : "alice\nbob\ncarol"} className="control font-mono" />
      <p className="mt-1 text-sm text-muted">ASCII edge whitespace and one leading @ are removed. ASCII A-Z is folded to lowercase; Unicode remains case-sensitive.</p>
      <p className={`mt-1 text-sm ${inputError ? "text-fail" : "text-muted"}`}>{inputError ?? `${entries.length} entrants, ${entries.reduce((sum, entry) => sum + entry.weight, 0)} total weight`}</p>
      <div className="mt-4 flex flex-wrap gap-5">
        <label className="text-sm font-medium">Winners<input className="control mt-1 w-24" type="number" min="1" value={winnerCount} onChange={(event) => setWinnerCount(Number(event.target.value))} /></label>
        <label className="text-sm font-medium">Alternates<input className="control mt-1 w-24" type="number" min="0" max="5" value={alternateCount} onChange={(event) => setAlternateCount(Number(event.target.value))} /></label>
      </div>
      {countInvalid && <p className="mt-2 text-sm text-fail">Winners and alternates cannot exceed the entrant count.</p>}
      <button className="button-primary mt-6" disabled={restoring || busy || !!inputError || entries.length === 0 || countInvalid} onClick={commit}>{restoring ? "Restoring..." : busy ? "Creating..." : "Create commitment"}</button>
    </section>}
    {pending && !record && <section className="panel">
      <h1 className="text-base font-semibold">Commitment locked</h1>
      <p className="mt-1 text-sm text-muted">Quicknet round {pending.commitment.round} fixes the public randomness for this draw.</p>
      <code className="hash">{pending.commitment.commitmentHash}</code>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{secondsLeft > 0 ? "Commitment locked. Waiting for the selected Quicknet round." : "The selected Quicknet round is ready. You can run the draw."}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <LiveLinkDisclosure checked={liveDisclosure} onChange={setLiveDisclosure} onCopy={() => copyLink("live")} />
        <button className="button-primary" disabled={busy || secondsLeft > 0} onClick={draw}>{secondsLeft ? `Available in ${secondsLeft}s` : busy ? "Checking..." : "Run draw"}</button>
        <button className="button-secondary" onClick={reset}>Cancel</button>
      </div>
    </section>}
    {record && <div className="space-y-6">
      <DrawResults record={record} />
      <section className="panel">
        <h2 className="text-sm font-semibold">Share and verify</h2>
        <p className="text-sm text-muted">The privacy-safe link is the default. It contains no names or outcomes and requires the record JSON to verify.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="button-primary" onClick={() => copyLink("stub")}>Copy privacy-safe link</button>
          <button className="button-secondary" onClick={download}>Download JSON</button>
          <button className="button-secondary" onClick={reset}>New draw</button>
        </div>
        <label className="touch-option mt-3 max-w-xl text-sm">
          <input type="checkbox" checked={fullDisclosure} onChange={(event) => setFullDisclosure(event.target.checked)} />
          I understand the full link publishes entrant names, weights, and outcomes to anyone who receives it.
        </label>
        <button className="button-secondary mt-3" disabled={!fullDisclosure} onClick={() => copyLink("full")}>Copy full record link</button>
      </section>
    </div>}
    {error && <div role="alert" className="notice-fail">{error}</div>}
  </div>
}
