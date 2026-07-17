import { useEffect, useMemo, useState } from "react"
import {
  canonicalizeParticipants,
  createCommitment,
  runDraw,
  type DrawCommitment,
  type DrawRecord,
} from "../engine/draw"
import { randomNonceHex } from "../engine/hash"
import {
  estimateRoundTime,
  fetchChainInfo,
  fetchLatestRound,
  fetchRoundWithRetry,
} from "../engine/drand"

const COMMIT_LEAD_ROUNDS = 3
const PENDING_KEY = "glasspick-pending-draw"

interface PendingDraw {
  participants: string[]
  winnerCount: number
  nonce: string
  commitment: DrawCommitment
  roundTimeMs: number
}

function loadPending(): PendingDraw | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? (JSON.parse(raw) as PendingDraw) : null
  } catch {
    return null
  }
}

export function DrawPage() {
  const [pending, setPending] = useState<PendingDraw | null>(loadPending)
  const [rawList, setRawList] = useState(() =>
    pending ? pending.participants.join("\n") : "",
  )
  const [winnerCount, setWinnerCount] = useState(() =>
    pending ? pending.winnerCount : 1,
  )
  const [record, setRecord] = useState<DrawRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())

  const participants = useMemo(
    () => canonicalizeParticipants(rawList),
    [rawList],
  )

  useEffect(() => {
    if (!pending || record) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pending, record])

  const secondsLeft = pending
    ? Math.max(0, Math.ceil((pending.roundTimeMs - now) / 1000))
    : 0

  async function handleCommit() {
    setError(null)
    setBusy(true)
    try {
      const [info, latest] = await Promise.all([
        fetchChainInfo(),
        fetchLatestRound(),
      ])
      const targetRound = latest.round + COMMIT_LEAD_ROUNDS
      const nonce = randomNonceHex()
      const clampedWinners = Math.min(winnerCount, participants.length)
      const commitment = await createCommitment(
        participants,
        clampedWinners,
        nonce,
        targetRound,
      )
      const next: PendingDraw = {
        participants,
        winnerCount: clampedWinners,
        nonce,
        commitment,
        roundTimeMs: estimateRoundTime(info, targetRound),
      }
      setPending(next)
      localStorage.setItem(PENDING_KEY, JSON.stringify(next))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach drand")
    } finally {
      setBusy(false)
    }
  }

  async function handleDraw() {
    if (!pending) return
    setError(null)
    setBusy(true)
    try {
      const round = await fetchRoundWithRetry(pending.commitment.drandRound)
      const result = await runDraw(
        pending.participants,
        pending.winnerCount,
        pending.nonce,
        round.round,
        round.randomness,
      )
      setRecord(result)
      localStorage.removeItem(PENDING_KEY)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch drand round",
      )
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setPending(null)
    setRecord(null)
    setError(null)
    setCopied(false)
    localStorage.removeItem(PENDING_KEY)
  }

  async function copyCommitment() {
    if (!pending) return
    await navigator.clipboard.writeText(pending.commitment.commitmentHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadRecord() {
    if (!record) return
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `glasspick-draw-${record.commitmentHash.slice(0, 12)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-surface p-6">
        <h1 className="text-base font-semibold">Run a draw</h1>
        <p className="mt-1 text-sm text-muted">
          Paste participants (one per line or comma-separated). Duplicates are
          removed and the list is sorted so anyone can reproduce it.
        </p>
        <label className="mt-4 block text-sm font-medium" htmlFor="participants">
          Participants
        </label>
        <textarea
          id="participants"
          value={rawList}
          onChange={(e) => setRawList(e.target.value)}
          disabled={!!pending}
          rows={8}
          placeholder={"@alice\n@bob\n@carol"}
          className="mt-1 w-full rounded-md border border-line bg-surface p-3 font-mono text-sm focus:border-primary focus:outline-none disabled:opacity-60"
        />
        <div className="mt-1 text-sm text-muted">
          {participants.length} unique participant
          {participants.length === 1 ? "" : "s"}
        </div>

        <label className="mt-4 block text-sm font-medium" htmlFor="winners">
          Number of winners
        </label>
        <input
          id="winners"
          type="number"
          min={1}
          max={Math.max(1, participants.length)}
          value={winnerCount}
          onChange={(e) =>
            setWinnerCount(Math.max(1, Number(e.target.value) || 1))
          }
          disabled={!!pending}
          className="mt-1 w-24 rounded-md border border-line bg-surface p-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
        />

        {!pending && (
          <div className="mt-6">
            <button
              onClick={handleCommit}
              disabled={busy || participants.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating commitment…" : "Create commitment"}
            </button>
          </div>
        )}
      </section>

      {pending && !record && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-base font-semibold">Commitment published</h2>
          <p className="mt-1 text-sm text-muted">
            Share this hash with your audience now — it locks in the
            participant list and winner count before the randomness exists.
            The draw uses drand round{" "}
            <span className="font-mono">{pending.commitment.drandRound}</span>,
            public randomness nobody (including you) can influence.
          </p>
          <div className="mt-3 break-all rounded-md border border-line bg-bg p-3 font-mono text-sm">
            {pending.commitment.commitmentHash}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={copyCommitment}
              className="rounded-md border border-line px-4 py-2 text-sm hover:bg-bg"
            >
              {copied ? "Copied!" : "Copy hash"}
            </button>
            <button
              onClick={handleDraw}
              disabled={busy || secondsLeft > 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {secondsLeft > 0
                ? `Randomness available in ${secondsLeft}s`
                : busy
                  ? "Drawing…"
                  : "Run draw"}
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-line px-4 py-2 text-sm hover:bg-bg"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {record && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-base font-semibold">
            Winner{record.winners.length === 1 ? "" : "s"}
          </h2>
          <ul className="mt-3 space-y-2">
            {record.winners.map((w, i) => (
              <li
                key={w}
                className="flex items-center gap-3 rounded-md border border-line bg-bg p-3"
              >
                <span className="text-sm text-muted">#{i + 1}</span>
                <span className="font-medium">@{w}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Download the draw record and publish it. Anyone can verify it on
            the Verify tab — or with any SHA-256 tool, no GlassPick required.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={downloadRecord}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Download draw record
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-line px-4 py-2 text-sm hover:bg-bg"
            >
              New draw
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-md border border-fail/40 bg-surface p-4 text-sm text-fail">
          {error}
        </div>
      )}
    </div>
  )
}
