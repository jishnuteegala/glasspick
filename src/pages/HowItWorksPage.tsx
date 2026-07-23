const X_IMPORT_ENABLED = import.meta.env.VITE_X_IMPORT_ENABLED === "true"

export function HowItWorksPage() {
  return <article className="panel text-sm leading-6">
    <h1 className="text-base font-semibold">How GlassPick works</h1>
    <ol className="mt-5 list-decimal space-y-4 pl-5">
      <li><strong>Commit first.</strong> GlassPick hashes the quicknet chain, algorithm, canonical weighted entries, entrant count, total weight, winner and alternate counts, nonce, and future round.</li>
      <li><strong>Wait for public randomness.</strong> Quicknet is drand's low-latency public randomness network. The pinned round did not exist when the commitment was made, so the host could not choose inputs after seeing it.</li>
      <li><strong>Reproduce every position.</strong> The virtual-ticket algorithm maps SHA-256 digests to the remaining integer ticket space with exact rejection sampling. A selected entrant and all of their tickets are removed.</li>
    </ol>
    <p className="mt-5">Alternates continue the same deterministic sequence after winners. The JSON record contains no mutable host notes.</p>
    <p className="mt-4 text-muted">Verification is green only when the record is internally consistent and a quicknet relay confirms its randomness. Local-only and manually supplied checks remain amber.</p>
    <section aria-labelledby="proof-boundary" className="mt-6 border-t border-line pt-5">
      <h2 id="proof-boundary" className="text-sm font-semibold">What the proof does not establish</h2>
      <p className="mt-2">GlassPick proves that winners follow from the committed participant list and recorded public randomness. It does not verify participant eligibility, source-list completeness, prize fulfilment, compliance with platform rules, or the legality of a giveaway.</p>
      <p className="mt-2 text-muted">Giveaway organisers remain responsible for those matters.{X_IMPORT_ENABLED && " X data can also be incomplete or unavailable because of API access, endpoint caps, deleted or protected accounts, rate limits, and platform behaviour."}</p>
    </section>
    <p className="mt-4">Read the <a className="text-primary underline underline-offset-2" href="https://github.com/jishnuteegala/glasspick#proof-contract">algorithm specification</a> or inspect the <a className="text-primary underline underline-offset-2" href="https://github.com/jishnuteegala/glasspick/blob/main/src/engine/draw.ts">draw source</a>.</p>
  </article>
}
