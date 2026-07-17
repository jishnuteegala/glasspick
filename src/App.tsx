import { useState } from "react"
import { DrawPage } from "./pages/DrawPage"
import { VerifyPage } from "./pages/VerifyPage"
import { HowItWorksPage } from "./pages/HowItWorksPage"

type Tab = "draw" | "verify" | "how"

const tabs: { id: Tab; label: string }[] = [
  { id: "draw", label: "Draw" },
  { id: "verify", label: "Verify" },
  { id: "how", label: "How it works" },
]

export default function App() {
  const [tab, setTab] = useState<Tab>("draw")

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold">GlassPick</span>
            <span className="text-sm text-muted">
              provably fair winner picker
            </span>
          </div>
          <a
            href="https://github.com/jishnuteegala/glasspick"
            className="text-sm text-muted hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-6 px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 pb-2 text-sm ${
                tab === t.id
                  ? "border-primary font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        {tab === "draw" && <DrawPage />}
        {tab === "verify" && <VerifyPage />}
        {tab === "how" && <HowItWorksPage />}
      </main>
    </div>
  )
}
