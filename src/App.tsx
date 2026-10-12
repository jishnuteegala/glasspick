import { useEffect, useState } from "react"
import { pendingIdentity } from "./engine/reveal"
import { seededTab, useRoute } from "./routes"
import { DrawPage } from "./pages/DrawPage"
import { DesignSystemPage } from "./pages/DesignSystemPage"
import { HowItWorksPage } from "./pages/HowItWorksPage"
import { LiveRevealPage } from "./pages/LiveRevealPage"
import { VerifyPage } from "./pages/VerifyPage"

type Tab = "draw" | "verify" | "how"

function SkipLink({ target, label }: { target: string; label: string }) {
  return <a className="skip-link" href={`#${target}`} onClick={(event) => {
    const el = document.getElementById(target)
    if (!el) return
    event.preventDefault()
    el.scrollIntoView()
    el.focus({ preventScroll: true })
  }}>{label}</a>
}

function SiteFooter() {
  return <footer className="border-t border-line bg-surface"><div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-5 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6"><span>© {new Date().getFullYear()} Jishnu Teegala</span><nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2"><a className="inline-flex min-h-6 items-center hover:text-ink" href="#design-system">Design system</a><a className="inline-flex min-h-6 items-center hover:text-ink" href="https://jishnuteegala.com/privacy">Privacy</a><a className="inline-flex min-h-6 items-center hover:text-ink" href="https://github.com/jishnuteegala/glasspick">Source code</a></nav></div></footer>
}

export default function App() {
  const route = useRoute()
  const [tab, setTab] = useState<Tab>(() => seededTab(location.hash))
  useEffect(() => { if (route.kind === "proof" || route.kind === "link-error") setTab("verify") }, [route])

  if (route.kind === "design") return <div id="design-system" className="flex min-h-screen flex-col"><SkipLink target="main-content" label="Skip to main content" /><header className="border-b border-line bg-surface"><div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6"><div className="flex items-center gap-2.5"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white shadow-panel">G</span><strong>GlassPick</strong></div><a className="inline-flex min-h-6 items-center text-sm text-muted hover:text-ink" href="#">Back to app</a></div></header><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8"><DesignSystemPage /></main><SiteFooter /></div>

  if (route.kind === "reveal") {
    const pending = route.pending
    const clean = new URLSearchParams(location.search).has("clean")
    return <div className="flex min-h-screen flex-col"><SkipLink target="live-reveal" label="Skip to live reveal" /><LiveRevealPage key={pendingIdentity(pending)} pending={pending} />{!clean && <SiteFooter />}</div>
  }
  return <div className="flex min-h-screen flex-col"><SkipLink target="main-content" label="Skip to main content" /><header className="border-b border-line bg-surface">
    <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6"><div className="flex items-center gap-2.5"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-white shadow-panel">G</span><div className="leading-tight"><strong className="block">GlassPick</strong><span className="text-xs text-muted">provably fair winner picker</span></div></div><a className="inline-flex min-h-6 items-center text-sm text-muted hover:text-ink" href="https://github.com/jishnuteegala/glasspick">Source</a></div>
    <nav aria-label="Main" className="mx-auto flex max-w-3xl gap-6 px-4 sm:px-6">{([['draw','Draw'],['verify','Verify'],['how','How it works']] as const).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} className={`nav-tab ${tab === id ? "nav-tab-active" : ""}`} onClick={() => setTab(id)}>{label}</button>)}</nav>
  </header><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
    {route.kind === "link-error" && <div role="alert" className="notice-fail mb-6">{route.message}</div>}
    {tab === "draw" && <DrawPage />}{tab === "verify" && route.kind !== "loading" && <VerifyPage envelope={route.kind === "proof" ? route.envelope : null} resetToken={route} />}{tab === "how" && <HowItWorksPage />}
  </main><SiteFooter /></div>
}
