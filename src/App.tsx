import { useEffect, useState } from "react"
import { decodeHash } from "./engine/envelope"
import type { PendingDraw } from "./engine/draw"
import { pendingIdentity } from "./engine/reveal"
import { DrawPage } from "./pages/DrawPage"
import { HowItWorksPage } from "./pages/HowItWorksPage"
import { LiveRevealPage } from "./pages/LiveRevealPage"
import { VerifyPage } from "./pages/VerifyPage"

type Tab = "draw" | "verify" | "how"

function SiteFooter() {
  return <footer className="border-t border-line bg-surface"><div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6"><span>© {new Date().getFullYear()} Jishnu Teegala</span><nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2"><a className="hover:text-ink" href="https://jishnuteegala.com/privacy">Privacy</a><a className="hover:text-ink" href="https://github.com/jishnuteegala/glasspick">Source code</a></nav></div></footer>
}

export default function App() {
  const [tab, setTab] = useState<Tab>(location.hash.startsWith("#gp1=") ? "verify" : "draw")
  const [hash, setHash] = useState(location.hash)
  const [pending, setPending] = useState<PendingDraw | null>(null)
  const [hashError, setHashError] = useState<string | null>(null)

  useEffect(() => {
    let generation = 0
    async function processHash() {
      const current = ++generation
      setHash(location.hash); setHashError(null); setPending(null)
      try {
        const envelope = await decodeHash(location.hash)
        if (current !== generation) return
        if (envelope?.type === "pending") setPending(envelope.pending)
        if (envelope?.type === "stub" || envelope?.type === "full") setTab("verify")
      } catch (caught) { if (current === generation) setHashError(caught instanceof Error ? caught.message : "Invalid link") }
    }
    void processHash(); addEventListener("hashchange", processHash)
    return () => removeEventListener("hashchange", processHash)
  }, [])

  if (pending) {
    const clean = new URLSearchParams(location.search).has("clean")
    return <div className="flex min-h-screen flex-col"><a className="skip-link" href="#live-reveal">Skip to live reveal</a><LiveRevealPage key={pendingIdentity(pending)} pending={pending} />{!clean && <SiteFooter />}</div>
  }
  return <div className="flex min-h-screen flex-col"><a className="skip-link" href="#main-content">Skip to main content</a><header className="border-b border-line bg-surface">
    <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6"><div><strong>GlassPick</strong><span className="ml-3 hidden text-sm text-muted sm:inline">provably fair winner picker</span></div><a className="text-sm text-muted hover:text-ink" href="https://github.com/jishnuteegala/glasspick">Source</a></div>
    <nav aria-label="Main" className="mx-auto flex max-w-3xl gap-6 px-4 sm:px-6">{([['draw','Draw'],['verify','Verify'],['how','How it works']] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} className={`nav-tab ${tab === id ? "nav-tab-active" : ""}`} onClick={() => setTab(id)}>{label}</button>)}</nav>
  </header><main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
    {hashError && <div role="alert" className="notice-fail mb-6">{hashError}</div>}
    {tab === "draw" && <DrawPage />}{tab === "verify" && <VerifyPage initialHash={hash} />}{tab === "how" && <HowItWorksPage />}
  </main><SiteFooter /></div>
}
