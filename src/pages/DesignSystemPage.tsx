import { useEffect, useState, type ReactNode } from "react"
import { colorTokens, controlTokens, elevationTokens, radiusTokens, spacingTokens, tokenGroups, typeTokens, type DesignToken } from "../tokens"

function useTokenValue(): (token: string) => string {
  const [root, setRoot] = useState<CSSStyleDeclaration>()
  useEffect(() => setRoot(getComputedStyle(document.documentElement)), [])
  return (token) => root?.getPropertyValue(token).trim() ?? ""
}

function TokenMeta({ read, token }: { read: (name: string) => string; token: DesignToken }) {
  return <div className="min-w-0"><strong className="block text-sm font-medium text-ink">{token.label}</strong><code className="mt-1 block break-all text-xs text-muted">{token.name}</code><span className="mt-1 block text-xs text-muted">{read(token.name) || "Loading..."}</span></div>
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return <section aria-labelledby={`design-system-${title.toLowerCase()}`} className="border-t border-line pt-6"><h2 id={`design-system-${title.toLowerCase()}`} className="text-base font-semibold">{title}</h2>{children}</section>
}

export function DesignSystemPage() {
  const read = useTokenValue()
  return <article className="space-y-10">
    <header><h1 className="text-xl font-semibold tracking-tight">Design system</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">The live token inventory and component reference for GlassPick. Values are read from the active theme, and the inventory is held in sync with the root stylesheet by a drift test.</p></header>
    <Section title="Colour"><div className="mt-4 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {colorTokens.map((token) => <div className="flex min-h-36 gap-4 bg-surface p-[var(--space-control-x)]" key={token.name}><span aria-hidden="true" className="size-12 shrink-0 rounded-[var(--radius-control)] border border-line" style={{ backgroundColor: `var(${token.name})` }} /><TokenMeta read={read} token={token} /></div>)}
    </div></Section>
    <Section title="Type"><div className="mt-4 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
      {typeTokens.map((token) => <div className="p-[var(--space-panel)]" key={token.name}><p style={{ fontSize: `var(${token.name})` }}>GlassPick makes the draw reproducible.</p><div className="mt-4"><TokenMeta read={read} token={token} /></div></div>)}
    </div></Section>
    <Section title="Spacing"><div className="mt-4 space-y-3 rounded-[var(--radius-panel)] border border-line bg-surface p-[var(--space-panel)]">
      {spacingTokens.map((token) => <div className="grid items-center gap-4 sm:grid-cols-[12rem_1fr]" key={token.name}><TokenMeta read={read} token={token} /><div className="flex min-h-10 items-center rounded-[var(--radius-control)] bg-surface-sunken p-1"><span aria-label={`${token.label} measurement`} className="block h-8 rounded-[var(--radius-control)] bg-primary" style={{ width: `var(${token.name})` }} /></div></div>)}
    </div></Section>
    <Section title="Shape and elevation"><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {radiusTokens.map((token) => <div className="border border-line bg-surface p-[var(--space-panel)]" key={token.name} style={{ borderRadius: `var(${token.name})` }}><div className="h-12 bg-primary-soft" style={{ borderRadius: `var(${token.name})` }} /><div className="mt-4"><TokenMeta read={read} token={token} /></div></div>)}
      {elevationTokens.map((token) => <div className="rounded-[var(--radius-panel)] bg-surface p-[var(--space-panel)]" key={token.name} style={{ boxShadow: `var(${token.name})` }}><div className="h-12 rounded-[var(--radius-control)] bg-surface-sunken" /><div className="mt-4"><TokenMeta read={read} token={token} /></div></div>)}
    </div></Section>
    <Section title="Components"><div className="mt-4 grid gap-5 lg:grid-cols-2">
      <div className="panel"><h3 className="text-sm font-semibold">Actions</h3><div className="mt-4 flex flex-wrap gap-3"><button className="button-primary" type="button">Create commitment</button><button className="button-secondary" type="button">Secondary action</button><button className="button-primary" disabled type="button">Disabled action</button></div></div>
      <div className="panel"><h3 className="text-sm font-semibold">Fields</h3><label className="label" htmlFor="design-system-input">Entrants</label><input className="control mt-1" id="design-system-input" placeholder="alice, bob, carol" /><label className="label" htmlFor="design-system-file">Draw record</label><input className="file-control" id="design-system-file" type="file" /></div>
      <div className="panel"><h3 className="text-sm font-semibold">Notices</h3><div className="mt-4 space-y-3"><div className="notice-info">The linked proof requires a matching JSON record.</div><div className="notice-warn">Public randomness is not available yet.</div><div className="notice-fail" role="alert">The record could not be verified.</div></div></div>
      <div className="panel"><h3 className="text-sm font-semibold">Status and navigation</h3><div className="mt-4 flex flex-wrap items-center gap-3"><span className="status-chip status-chip-ok">✓</span><span className="status-chip status-chip-warn">!</span><span className="status-chip status-chip-fail">×</span></div><nav aria-label="Navigation specimen" className="mt-5 flex gap-6"><span className="nav-tab nav-tab-active">Draw</span><span className="nav-tab">Verify</span></nav></div>
    </div></Section>
    <Section title="Inventory"><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {tokenGroups.map((group) => <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-[var(--space-control-x)]" key={group.title}><h3 className="text-sm font-semibold">{group.title}</h3><ul className="mt-3 space-y-2">{group.tokens.map((token) => <li className="text-sm text-muted" key={token.name}>{token.name} <span className="text-ink">{token.label}</span></li>)}</ul></div>)}
      {controlTokens.map((token) => <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-[var(--space-control-x)]" key={token.name}><TokenMeta read={read} token={token} /></div>)}
    </div></Section>
  </article>
}
