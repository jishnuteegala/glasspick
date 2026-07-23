import { useEffect, useRef, useState } from "react"
import {
  canonicalEntries,
  parseEntries,
  runDraw,
  type DrawRecord,
  type PendingDraw,
  type WeightedEntry,
} from "../engine/draw"
import { createFutureCommitment, estimateRoundTime, fetchRoundWithRetry, QUICKNET_SCHEDULE } from "../engine/drand"
import { createFullEnvelope, createPendingEnvelope, createStub } from "../engine/envelope"
import { createGenerationGuard } from "../engine/generation"
import { randomNonceHex, sha256Hex } from "../engine/hash"
import { PENDING_KEY } from "../engine/pending"
import { fetchXEntrants, parseXPostUrl, X_SOURCES, type XImportResponse, type XProvenanceReceipt, type XSource } from "../x-integration"
import { resetDisclosureAcknowledgements } from "./draw-page-state"
import { PROVENANCE_KEY, RECORD_KEY, restoreDrawState } from "./draw-restore"
import { withDrawStateLock } from "../engine/draw-state-lock"

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

function sourceLabel(source: XSource) {
  return source === "likes" ? "Likers" : source === "reposts" ? "Reposters" : "Direct replies"
}

export function XImportPreview({ acknowledged, disabled, preview, onAcknowledge, onLoad }: { acknowledged: boolean; disabled: boolean; preview: XImportResponse; onAcknowledge: (checked: boolean) => void; onLoad: () => void }) {
  return <section className="mt-4 text-sm" aria-label="X import preview">
    <h2 className="font-semibold">Import preview</h2>
    <p className="mt-1">{preview.entrants.length} unique entrants from {preview.fetchedTotal} fetched accounts; {preview.duplicatesRemoved} duplicates removed; {preview.unavailable} unavailable records reported by X.</p>
    <ul className="mt-2 space-y-1">{preview.sources.map((source) => <li key={source.source}><strong>{sourceLabel(source.source)}:</strong> {source.fetched} fetched across {source.pages} {source.pages === 1 ? "page" : "pages"}; {source.complete ? "API pagination completed" : "limited or incomplete"}{source.note ? ` - ${source.note}` : ""}</li>)}</ul>
    <p className="mt-2"><strong>Applied rules:</strong> {preview.rules.join(" ")}</p>
    <p className="mt-2 text-muted">GlassPick cannot prove that X returned every eligible account or that the giveaway rules were applied correctly. Review the final entrant list before committing it.</p>
    {preview.partial && <label className="touch-option mt-2 text-warn"><input type="checkbox" disabled={disabled} checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} />I understand this import is limited or incomplete and may omit eligible accounts.</label>}
    <button className="button-primary mt-3" type="button" disabled={disabled || preview.entrants.length === 0 || (preview.partial && !acknowledged)} onClick={onLoad}>Load into entrant list</button>
  </section>
}

export function XImportPanel({ disabled, onLoad }: { disabled: boolean; onLoad: (result: XImportResponse) => void }) {
  const [postUrl, setPostUrl] = useState("")
  const [sources, setSources] = useState<XSource[]>(["likes"])
  const [preview, setPreview] = useState<XImportResponse | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlInvalid, setUrlInvalid] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const requestGeneration = useRef(0)

  useEffect(() => () => abort.current?.abort(), [])

  function toggle(source: XSource, checked: boolean) {
    requestGeneration.current += 1; abort.current?.abort(); abort.current = null; setBusy(false); setError(null)
    setSources((current) => checked ? [...current, source] : current.filter((item) => item !== source))
    setPreview(null); setAcknowledged(false)
  }

  async function previewImport() {
    let controller: AbortController | null = null
    const current = ++requestGeneration.current
    try {
      try { parseXPostUrl(postUrl) } catch (caught) { setUrlInvalid(true); throw caught }
      if (sources.length === 0) throw new Error("Choose at least one source")
      abort.current?.abort()
      controller = new AbortController(); abort.current = controller
      setBusy(true); setError(null); setPreview(null); setAcknowledged(false)
      const result = await fetchXEntrants({ postUrl, sources }, controller.signal)
      if (current === requestGeneration.current) setPreview(result)
    } catch (caught) {
      if (current === requestGeneration.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        const message = caught instanceof Error ? caught.message : "Could not import entrants from X"
        if (message === "The X post URL handle does not match the post author" || message === "X could not find this post") setUrlInvalid(true)
        setError(message)
      }
    } finally { if (current === requestGeneration.current && abort.current === controller) { abort.current = null; setBusy(false) } }
  }

  return <details className="mt-5 border-y border-line py-4">
    <summary className="cursor-pointer text-sm font-medium">Import from an X post (optional)</summary>
    <div className="mt-4">
      <label className="text-sm font-medium" htmlFor="x-post-url">X post URL</label>
      <input id="x-post-url" className="control mt-1" disabled={disabled} type="url" value={postUrl} placeholder="https://x.com/handle/status/123" aria-invalid={urlInvalid || undefined} aria-describedby={error ? "x-import-error" : undefined} onChange={(event) => { requestGeneration.current += 1; abort.current?.abort(); abort.current = null; setBusy(false); setError(null); setUrlInvalid(false); setPostUrl(event.target.value); setPreview(null); setAcknowledged(false) }} />
      <fieldset className="mt-3"><legend className="text-sm font-medium">Include</legend><div className="mt-1 flex flex-wrap gap-x-5">
        {X_SOURCES.map((source) => <label className="touch-option text-sm" key={source}><input type="checkbox" disabled={disabled} checked={sources.includes(source)} onChange={(event) => toggle(source, event.target.checked)} />{sourceLabel(source)}</label>)}
      </div></fieldset>
      <p className="mt-2 text-sm text-muted">Selected sources are combined into one list with one entry per account; duplicates across sources are removed. Loading the preview replaces the entrants below.</p>
      <button className="button-secondary mt-2" type="button" disabled={disabled || busy || sources.length === 0} onClick={previewImport}>{busy ? "Fetching..." : "Fetch preview"}</button>
      {error && <div className="notice-fail mt-3" id="x-import-error" role="alert">{error}</div>}
      {preview && <XImportPreview acknowledged={acknowledged} disabled={disabled} preview={preview} onAcknowledge={setAcknowledged} onLoad={() => onLoad(preview)} />}
    </div>
  </details>
}

const X_IMPORT_ENABLED = import.meta.env.VITE_X_IMPORT_ENABLED === "true"

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
  const [xProvenance, setXProvenance] = useState<XProvenanceReceipt | null>(null)
  const [loadingImport, setLoadingImport] = useState(false)
  const generation = useRef(createGenerationGuard())
  const importGeneration = useRef(0)
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
    const restoreGeneration = guard.next()
    async function restore(): Promise<boolean> {
      const restored = await restoreDrawState(localStorage, X_IMPORT_ENABLED, () => active && guard.isCurrent(restoreGeneration))
      if (!restored || !active || !guard.isCurrent(restoreGeneration)) return true
      if (restored.contended) {
        setError("Draw state kept changing in another tab. Reload this page to continue.")
        return false
      }
      if (restored.pendingError) throw restored.pendingError
      if (restored.record || restored.pending) { importGeneration.current += 1; setLoadingImport(false) }
      setRecord(restored.record)
      setPending(restored.record ? null : restored.pending)
      setXProvenance(restored.receipt)
      return true
    }
    void restore()
      .then((settled) => { if (active && settled) setRestoring(false) })
      .catch((caught: unknown) => {
        if (active) { setError(caught instanceof Error ? caught.message : "Could not restore the saved commitment"); setRestoring(false) }
      })
    return () => { active = false; guard.cancel(); commitAbort.current?.abort(); drawAbort.current?.abort() }
  }, [])

  useEffect(() => {
    if (!pending || record) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [pending, record])

  async function commit() {
    importGeneration.current += 1; setLoadingImport(false)
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
      let receipt: XProvenanceReceipt | null = null
      if (xProvenance) {
        const entriesHash = await sha256Hex(canonicalEntries(entries))
        if (!generation.current.isCurrent(current)) return
        if (xProvenance.canonicalEntriesHash === entriesHash) receipt = { ...xProvenance, commitmentHash: commitment.commitmentHash }
      }
      const next = { envelopeVersion: 1 as const, commitment }
      const persisted = await withDrawStateLock(() => {
        if (!generation.current.isCurrent(current)) return false
        localStorage.setItem(PENDING_KEY, JSON.stringify(next))
        if (receipt) {
          try { localStorage.setItem(PROVENANCE_KEY, JSON.stringify(receipt)) } catch { receipt = null; try { localStorage.removeItem(PROVENANCE_KEY) } catch { /* keep the pending commitment without provenance */ } }
        } else {
          try { localStorage.removeItem(PROVENANCE_KEY) } catch { /* non-fatal */ }
        }
        try { localStorage.removeItem(RECORD_KEY) } catch { /* best-effort; the new pending commitment is already durable */ }
        return true
      })
      if (!persisted || !generation.current.isCurrent(current)) return
      setXProvenance(receipt); setPending(next)
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
      const readPending = () => { try { return localStorage.getItem(PENDING_KEY) } catch { return null } }
      const rawPending = readPending()
      const matchesPending = (raw: string | null) => {
        if (raw === null) return false
        try {
          const stored = JSON.parse(raw) as { commitment?: { commitmentHash?: unknown } }
          return stored.commitment?.commitmentHash === pending.commitment.commitmentHash
        } catch { return false }
      }
      if (!matchesPending(rawPending)) throw new Error("The pending commitment changed in another tab. Reload to continue.")
      const beacon = await fetchRoundWithRetry(pending.commitment.round, 15, 2000, controller.signal)
      const result = await runDraw(pending.commitment, beacon.randomness)
      if (!generation.current.isCurrent(current)) return
      const persisted = await withDrawStateLock(() => {
        if (!generation.current.isCurrent(current)) return "cancelled" as const
        if (readPending() !== rawPending) return "conflict" as const
        localStorage.setItem(RECORD_KEY, JSON.stringify(result))
        try { localStorage.removeItem(PENDING_KEY) } catch { /* best-effort; the completed record is already durable */ }
        return "persisted" as const
      })
      if (persisted === "cancelled") return
      if (persisted === "conflict") throw new Error("The pending commitment changed in another tab. Reload to continue.")
      if (!generation.current.isCurrent(current)) return
      setRecord(result)
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

  function downloadProvenance() {
    if (!xProvenance) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(xProvenance, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url
    link.download = `glasspick-x-source-${xProvenance.canonicalEntriesHash.slice(0, 12)}.json`; link.click(); URL.revokeObjectURL(url)
  }

  async function loadXImport(result: XImportResponse) {
    const current = ++importGeneration.current
    setLoadingImport(true)
    try {
      const importedEntries = parseEntries(result.entrants.join("\n"), false)
      const canonicalEntriesHash = await sha256Hex(canonicalEntries(importedEntries))
      if (current !== importGeneration.current) return
      setRaw(result.entrants.join("\n")); setWeighted(false); setXProvenance({
        ...result,
        receiptVersion: 1,
        canonicalEntriesHash,
      })
    } catch (caught) {
      if (current === importGeneration.current) setError(caught instanceof Error ? caught.message : "Could not load the X import")
    } finally { if (current === importGeneration.current) setLoadingImport(false) }
  }

  function invalidateImport() {
    importGeneration.current += 1
    setLoadingImport(false)
    setXProvenance(null)
  }

  function reset() {
    const disclosure = resetDisclosureAcknowledgements()
    generation.current.cancel(); importGeneration.current += 1; commitAbort.current?.abort(); drawAbort.current?.abort()
    const owned = pending?.commitment.commitmentHash ?? record?.commitmentHash ?? null
    void withDrawStateLock(() => {
      const belongsHere = (raw: string | null) => {
        if (raw === null) return false
        if (owned === null) return true
        try {
          const stored = JSON.parse(raw) as { commitmentHash?: unknown; commitment?: { commitmentHash?: unknown } }
          const hash = stored?.commitment?.commitmentHash ?? stored?.commitmentHash
          if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return true
          return hash === owned
        } catch { return true }
      }
      for (const key of [PENDING_KEY, RECORD_KEY, PROVENANCE_KEY]) {
        try { if (belongsHere(localStorage.getItem(key))) localStorage.removeItem(key) } catch { /* best-effort; in-memory state still resets */ }
      }
    })
    setPending(null); setRecord(null); setError(null); setBusy(false); setLoadingImport(false); setXProvenance(null)
    setFullDisclosure(disclosure.full); setLiveDisclosure(disclosure.live)
  }

  const secondsLeft = pending ? Math.max(0, Math.ceil((estimateRoundTime(QUICKNET_SCHEDULE, pending.commitment.round) - now) / 1000)) : 0
  const countInvalid = winnerCount + alternateCount > entries.length
  return <div className="space-y-6">
    {!pending && !record && <section className="panel">
      <h1 className="text-base font-semibold">Run a draw</h1>
      <p className="mt-1 text-sm text-muted">Commit the exact entrant list, weights, and winner counts before the public randomness that decides the outcome exists.</p>
      <fieldset className="mt-5"><legend className="text-sm font-medium">Input format</legend>
        <div className="mt-2 flex flex-wrap gap-x-5 text-sm">
           <label className="touch-option"><input type="radio" disabled={busy} checked={!weighted} onChange={() => { invalidateImport(); setWeighted(false) }} /> Plain names</label>
           <label className="touch-option"><input type="radio" disabled={busy} checked={weighted} onChange={() => { invalidateImport(); setWeighted(true) }} /> Weighted, one name,weight per line</label>
        </div>
      </fieldset>
        {X_IMPORT_ENABLED && <XImportPanel disabled={restoring || busy || loadingImport} onLoad={(result) => { void loadXImport(result) }} />}
      <label className="label" htmlFor="entrants">Entrants</label>
        <textarea id="entrants" rows={5} disabled={busy} value={raw} onChange={(event) => { invalidateImport(); setRaw(event.target.value) }}
        placeholder={weighted ? "alice,3\nbob,1" : "alice\nbob\ncarol"} className="control font-mono sm:min-h-52" />
      {xProvenance && <p className="mt-1 text-sm text-info">Loaded from {xProvenance.postUrl}. Editing this list removes the import provenance.</p>}
      <p className="mt-1 text-sm text-muted">ASCII edge whitespace and one leading @ are removed. ASCII A-Z is folded to lowercase; Unicode remains case-sensitive.</p>
      <p className={`mt-1 text-sm ${inputError ? "text-fail" : "text-muted"}`}>{inputError ?? `${entries.length} entrants, ${entries.reduce((sum, entry) => sum + entry.weight, 0)} total weight`}</p>
      <div className="mt-4 flex flex-wrap gap-5">
         <label className="text-sm font-medium">Winners<input className="control mt-1 w-28 min-h-11" disabled={busy} type="number" min="1" value={winnerCount} onChange={(event) => setWinnerCount(Number(event.target.value))} /></label>
         <label className="text-sm font-medium">Alternates<input className="control mt-1 w-28 min-h-11" disabled={busy} type="number" min="0" max="5" value={alternateCount} onChange={(event) => setAlternateCount(Number(event.target.value))} /></label>
      </div>
      {countInvalid && <p className="mt-2 text-sm text-fail">Winners and alternates cannot exceed the entrant count.</p>}
       <button className="button-primary mt-6" disabled={restoring || busy || loadingImport || !!inputError || entries.length === 0 || countInvalid} onClick={commit}>{restoring ? "Restoring..." : loadingImport ? "Loading import..." : busy ? "Creating..." : "Create commitment"}</button>
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
           {xProvenance && <button className="button-secondary" onClick={downloadProvenance}>Download X source receipt</button>}
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
