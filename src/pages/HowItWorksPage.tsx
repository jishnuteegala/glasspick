export function HowItWorksPage() {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h1 className="text-base font-semibold">How GlassPick works</h1>
      <div className="mt-4 space-y-5 text-sm leading-6">
        <p>
          Open-source code alone doesn't prove a draw was fair — you'd still
          have to trust that the host actually ran that code. GlassPick removes
          the trust requirement entirely with three ingredients:
        </p>
        <ol className="list-decimal space-y-4 pl-5">
          <li>
            <span className="font-medium">Commit before the randomness exists.</span>{" "}
            When you start a draw, GlassPick hashes the canonical participant
            list, winner count, a random nonce, and a{" "}
            <span className="font-mono">future</span> drand round number into a
            single commitment hash. Publishing that hash locks everything in —
            you can no longer swap participants or re-roll.
          </li>
          <li>
            <span className="font-medium">Public randomness nobody controls.</span>{" "}
            The seed comes from{" "}
            <a
              href="https://drand.love"
              className="text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              drand
            </a>
            , a randomness beacon run by the League of Entropy (Cloudflare,
            EPFL, Protocol Labs and others). The committed round hadn't been
            generated yet at commit time, so neither the host nor GlassPick
            could know or influence it.
          </li>
          <li>
            <span className="font-medium">Deterministic, reproducible selection.</span>{" "}
            Winners are derived as{" "}
            <span className="font-mono">
              SHA-256(seed | i) mod remaining
            </span>{" "}
            over the sorted participant list. Same inputs, same winners, every
            time, on any machine.
          </li>
        </ol>
        <p>
          The published draw record contains everything needed to re-run the
          draw: participants, nonce, drand round and randomness, commitment
          hash, seed, and winners. The Verify tab recomputes all of it locally
          in your browser and cross-checks the randomness against the public
          drand beacon.
        </p>
        <p className="text-muted">
          You don't even need GlassPick to verify: the algorithm is plain
          SHA-256 and modular arithmetic, documented in the repository, and
          reproducible in a few lines of any language.
        </p>
      </div>
    </div>
  )
}
