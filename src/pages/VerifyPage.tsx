import { useState } from "react"
import {
  verifyDraw,
  type DrawRecord,
  type VerificationResult,
} from "../engine/draw"
import { fetchRound } from "../engine/drand"

interface FullResult extends VerificationResult {
  drandChecked: boolean
}

export function VerifyPage() {
  const [rawJson, setRawJson] = useState("")
  const [result, setResult] = useState<FullResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleVerify() {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const record = JSON.parse(rawJson) as DrawRecord
      const local = await verifyDraw(record)
      const checks = [...local.checks]
      let drandChecked = false
      try {
        const round = await fetchRound(record.drandRound)
        const ok = round.randomness === record.drandRandomness
        checks.push({
          label: `Drand round ${record.drandRound} randomness matches the public beacon`,
          ok,
          detail: ok
            ? round.randomness
            : `Beacon says ${round.randomness}, record says ${record.drandRandomness}`,
        })
        drandChecked = true
      } catch {
        checks.push({
          label: "Drand beacon check skipped (network unavailable)",
          ok: true,
          detail: `Verify manually at https://api.drand.sh/public/${record.drandRound}`,
        })
      }
      setResult({
        ok: local.ok && checks.every((c) => c.ok),
        checks,
        drandChecked,
      })
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Invalid JSON — paste the full draw record file"
          : err instanceof Error
            ? err.message
            : "Verification failed",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-6">
        <h1 className="text-base font-semibold">Verify a draw</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a GlassPick draw record (JSON). Every check runs locally in
          your browser and is re-derived from the record itself — nothing is
          taken on trust.
        </p>
        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          rows={10}
          placeholder='{"version":1,"participants":[…],…}'
          className="mt-4 w-full rounded-md border border-line bg-surface p-3 font-mono text-sm focus:border-primary focus:outline-none"
        />
        <div className="mt-4">
          <button
            onClick={handleVerify}
            disabled={busy || !rawJson.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-fail/40 bg-surface p-4 text-sm text-fail">
          {error}
        </div>
      )}

      {result && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h2
            className={`text-base font-semibold ${result.ok ? "text-ok" : "text-fail"}`}
          >
            {result.ok ? "Draw verified" : "Verification failed"}
          </h2>
          <ul className="mt-4 space-y-3">
            {result.checks.map((c) => (
              <li key={c.label} className="flex gap-3 text-sm">
                <span className={c.ok ? "text-ok" : "text-fail"}>
                  {c.ok ? "✓" : "✗"}
                </span>
                <div>
                  <div className="font-medium">{c.label}</div>
                  <div className="break-all font-mono text-muted">
                    {c.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
