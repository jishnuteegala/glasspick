import { useEffect, useState } from "react"
import type { PendingDraw } from "./engine/draw"
import { decodeHash, isEnvelopeHash, type ProofEnvelope } from "./engine/envelope"

export type Route =
  | { kind: "app" }
  | { kind: "design" }
  | { kind: "loading" }
  | { kind: "reveal"; pending: PendingDraw }
  | { kind: "proof"; envelope: ProofEnvelope }
  | { kind: "link-error"; message: string }
  | { kind: "ignored" }

export function classifyHash(hash: string): "app" | "design" | "envelope" | "ignored" {
  if (hash === "") return "app"
  if (hash === "#design-system") return "design"
  if (isEnvelopeHash(hash)) return "envelope"
  return "ignored"
}

export function seededTab(hash: string): "verify" | "draw" {
  return hash.startsWith("#gp1=") ? "verify" : "draw"
}

export function envelopeUrl(fragment: string): string {
  return `${location.origin}${location.pathname}${fragment}`
}

export async function resolveRoute(hash: string): Promise<Route> {
  const kind = classifyHash(hash)
  if (kind !== "envelope") return { kind }
  try {
    const envelope = await decodeHash(hash)
    if (envelope?.type === "pending") return { kind: "reveal", pending: envelope.pending }
    if (envelope?.type === "stub" || envelope?.type === "full") return { kind: "proof", envelope }
    // decodeHash never returns null for an envelope hash; this catches a future
    // envelope type rather than silently dropping to the app.
    return { kind: "link-error", message: "Unrecognized GlassPick link" }
  } catch (caught) {
    return { kind: "link-error", message: caught instanceof Error ? caught.message : "Invalid link" }
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => {
    const kind = classifyHash(location.hash)
    return kind === "envelope" ? { kind: "loading" } : { kind }
  })
  useEffect(() => {
    let generation = 0
    async function process() {
      const hash = location.hash
      // An ignored hash publishes nothing, so it must not invalidate an
      // in-flight decode either - that would strand the route at "loading".
      // If nothing is in flight (mount race: envelope hash became an anchor
      // before the effect ran), un-strand "loading" onto the app route.
      if (classifyHash(hash) === "ignored") {
        if (generation === 0) setRoute((prev) => (prev.kind === "loading" ? { kind: "app" } : prev))
        return
      }
      const current = ++generation
      const next = await resolveRoute(hash)
      if (current !== generation) return
      setRoute(next)
    }
    void process()
    addEventListener("hashchange", process)
    return () => {
      generation++
      removeEventListener("hashchange", process)
    }
  }, [])
  return route
}
