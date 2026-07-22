import confetti from "canvas-confetti"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { estimateRoundTime, fetchChainInfo, fetchLatestRound, fetchMatchingRound, fetchRound, QUICKNET_SCHEDULE } from "../engine/drand"
import { runDraw, type DrawRecord, type PendingDraw, type WeightedEntry } from "../engine/draw"
import { createGenerationGuard } from "../engine/generation"
import { chainNow, observeLatestRound, parseManualRound, relayFailureState, revealState, revealStatus, scheduleObservation, shouldAttemptRound, type RelayState, type RoundObservation } from "../engine/reveal"

export function WinnerAnnouncement({ winners }: { winners: WeightedEntry[] }) {
  const label = winners.length === 1 ? "Winner" : "Winners"
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {winners.length > 0 ? `${label}: ${winners.map((entry) => `@${entry.name}`).join(", ")}` : ""}
  </p>
}

export function LiveRevealPage({ pending }: { pending: PendingDraw }) {
  const [monotonicNow, setMonotonicNow] = useState(() => performance.now())
  const [relay, setRelay] = useState<RelayState>("waiting")
  const [record, setRecord] = useState<DrawRecord | null>(null)
  const [manual, setManual] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)
  const [roundTime, setRoundTime] = useState(() => estimateRoundTime(QUICKNET_SCHEDULE, pending.commitment.round))
  const [checking, setChecking] = useState(false)
  const [clockAnchor, setClockAnchor] = useState<RoundObservation>(() => scheduleObservation(QUICKNET_SCHEDULE, Date.now(), performance.now()))
  const [synchronized, setSynchronized] = useState(false)
  const checkingRef = useRef(false)
  const celebrated = useRef(false)
  const attempted = useRef(false)
  const generation = useRef(createGenerationGuard())
  const relayAbort = useRef<AbortController | null>(null)
  const synchronizedNow = chainNow(clockAnchor, QUICKNET_SCHEDULE, monotonicNow)
  const state = revealState(synchronizedNow, roundTime, relay, checking || !attempted.current)

  useEffect(() => () => { generation.current.cancel(); relayAbort.current?.abort() }, [pending.commitment.commitmentHash])

  async function checkRound() {
    if (checkingRef.current || relay === "verified") return
    const current = generation.current.next()
    relayAbort.current?.abort()
    const controller = new AbortController()
    relayAbort.current = controller
    attempted.current = true
    checkingRef.current = true
    setChecking(true)
    try {
      const round = record && relay === "manual"
        ? await fetchMatchingRound(pending.commitment.round, record.randomness, undefined, controller.signal)
        : await fetchRound(pending.commitment.round, undefined, controller.signal)
      const result = await runDraw(pending.commitment, round.randomness)
      if (!generation.current.isCurrent(current)) return
      setRecord(result); setRelay("verified")
      if (!celebrated.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        celebrated.current = true
        void confetti({ particleCount: 72, spread: 54, origin: { y: 0.7 }, disableForReducedMotion: true })
      }
    } catch (error) {
      if (generation.current.isCurrent(current)) {
        const currentChainTime = chainNow(clockAnchor, QUICKNET_SCHEDULE, performance.now())
        setRelay((relayState) => relayFailureState(relayState, error, currentChainTime - roundTime >= 30_000))
      }
    }
    finally {
      if (generation.current.isCurrent(current)) {
        checkingRef.current = false
        setChecking(false)
        if (relayAbort.current === controller) relayAbort.current = null
      }
    }
  }

  const pollRound = useEffectEvent(checkRound)
  const pollIfDue = useEffectEvent(() => {
    if (shouldAttemptRound(
      chainNow(clockAnchor, QUICKNET_SCHEDULE, performance.now()),
      roundTime,
      attempted.current,
      relay,
    )) void pollRound()
  })
  const markSynchronizationFailure = useEffectEvent(() => {
    if (!synchronized) setRelay((current) => current === "waiting" ? "unavailable" : current)
  })
  const applySchedule = useEffectEvent((info: typeof QUICKNET_SCHEDULE) => {
    setRoundTime(estimateRoundTime(info, pending.commitment.round))
    setClockAnchor(scheduleObservation(info, Date.now(), performance.now()))
    setSynchronized(true)
  })

  useEffect(() => {
    let active = true
    const scheduleController = new AbortController()
    const synchronizationDeadline = setTimeout(markSynchronizationFailure, 10_000)
    const clock = setInterval(() => setMonotonicNow(performance.now()), 1000)
    const poll = setInterval(pollIfDue, 2000)
    const refreshSchedule = () => {
      void fetchChainInfo(undefined, scheduleController.signal)
        .then((info) => {
          if (!active) return
          applySchedule(info)
        })
        .catch(() => undefined)
      void fetchLatestRound(undefined, scheduleController.signal)
        .then((latest) => { if (active) { setClockAnchor((current) => observeLatestRound(current, latest.round, performance.now())); setSynchronized(true) } })
        .catch(() => undefined)
    }
    const schedule = setInterval(refreshSchedule, 30_000)
    refreshSchedule()
    pollIfDue()
    return () => { active = false; scheduleController.abort(); clearTimeout(synchronizationDeadline); clearInterval(clock); clearInterval(poll); clearInterval(schedule) }
  }, [pending.commitment.commitmentHash])

  async function useManual() {
    const current = generation.current.next()
    relayAbort.current?.abort()
    relayAbort.current = null
    checkingRef.current = false
    setChecking(false)
    setManualError(null)
    try {
      const data = parseManualRound(manual, pending.commitment.round)
      const result = await runDraw(pending.commitment, data.randomness)
      if (!generation.current.isCurrent(current)) return
      setRecord(result); setRelay("manual")
    } catch (caught) {
      if (generation.current.isCurrent(current)) {
        setManualError(caught instanceof Error ? caught.message : "Invalid manual beacon")
      }
    }
  }

  return <main id="live-reveal" className="reveal-shell flex-1">
    <p className="text-sm text-muted">GlassPick live reveal</p>
    <h1 className="mt-3 text-2xl font-semibold sm:text-4xl">Quicknet round {pending.commitment.round}</h1>
    <code className="hash mt-6 max-w-3xl">{pending.commitment.commitmentHash}</code>
    <WinnerAnnouncement winners={record?.winners ?? []} />
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{revealStatus(state)}</p>
    {state?.phase === "countdown" && <p className="mt-12 text-6xl font-semibold tabular-nums sm:text-8xl">{state.secondsLeft}</p>}
    {state?.phase === "checking" && <p className="mt-12 text-xl">Checking both quicknet relays...</p>}
    {state?.phase === "grace" && <p className="mt-12 text-xl">The round is due. Retrying both quicknet relays for up to 30 seconds ({state.secondsLeft}s remaining)...</p>}
    {(state?.phase === "verified" || state?.phase === "manual") && record && <section className="mt-10 w-full max-w-2xl">
      <p role="status" className={`text-sm font-medium ${state.phase === "verified" ? "text-ok" : "text-warn"}`}>{state.phase === "verified" ? "Confirmed against quicknet" : "Manual beacon is unverified until a relay confirms it"}</p>
      {state.phase === "manual" && <button className="button-secondary mt-4" onClick={checkRound}>Retry relays</button>}
      <h2 className="mt-4 text-xl font-semibold">Winner{record.winners.length === 1 ? "" : "s"}</h2>
      <ol className="mt-3 divide-y divide-line border-y border-line text-left">{record.winners.map((entry, index) => <li className="flex gap-4 py-4 text-lg" key={entry.name}><span className="text-muted">{index + 1}.</span><strong>@{entry.name}</strong></li>)}</ol>
    </section>}
    {(state?.phase === "unavailable" || state?.phase === "mismatch") && <section className="mt-10 w-full max-w-xl text-left">
      <div role={state.phase === "mismatch" ? "alert" : "status"} className={state.phase === "mismatch" ? "notice-fail" : "notice-warn"}>{state.phase === "mismatch" ? "The supplied beacon does not match this draw." : "Quicknet is unavailable after the 30-second grace period."}</div>
      <button className="button-primary mt-4" onClick={checkRound}>Retry relays</button>
      <label className="label" htmlFor="manual-beacon">Manual beacon JSON</label>
      <textarea id="manual-beacon" className="control font-mono" rows={4} value={manual} onChange={(event) => { setManual(event.target.value); setManualError(null) }} placeholder='{"round":123,"randomness":"..."}' />
      {manualError && <div role="alert" className="notice-fail mt-3">{manualError}</div>}
      <button className="button-secondary mt-3" onClick={useManual}>Use unverified beacon</button>
    </section>}
  </main>
}
