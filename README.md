# GlassPick

An open-source, provably fair giveaway winner picker. Nothing behind the glass: every draw can be independently verified by the creator, the winners, and everyone who didn't win.

## Why

Winner-picker tools ask you to trust them: a winner pops out and you have no way to check the pick wasn't rigged. Open-sourcing the code isn't enough — you'd still have to trust that the host actually ran that code.

GlassPick removes the trust requirement:

1. **Commit-reveal.** Before the draw, GlassPick hashes the canonical participant list, winner count, a random nonce, and a *future* [drand](https://drand.love) round number into a commitment hash. Publishing it locks the draw in — no swapping participants, no re-rolling.
2. **Public randomness.** The seed comes from drand, a randomness beacon run by the League of Entropy. The committed round didn't exist yet at commit time, so nobody could know or influence it.
3. **Deterministic selection.** `winner[i] = SHA-256(seed | i) mod remaining` over the sorted participant list. Same inputs, same winners, on any machine.

Every draw produces a JSON record containing all inputs and outputs. The **Verify** tab recomputes the entire draw locally in your browser and cross-checks the randomness against the public drand beacon. You can also verify with a few lines of any language — no GlassPick required.

## The algorithm

```
participants   = dedupe(strip '@', case-insensitive) then sort (case-insensitive)
participantsHash = SHA-256(join(lowercase(participants), "\n"))
commitmentHash = SHA-256("glasspick-v1|" + participantsHash + "|" + count + "|" + winnerCount + "|" + nonce + "|" + drandRound)
seed           = SHA-256("glasspick-seed-v1|" + commitmentHash + "|" + drandRandomness)
winner[i]      = pool[ SHA-256(seed + "|" + i) mod pool.length ]   (winner removed from pool each round)
```

All hashes are lowercase hex. The full implementation lives in [`src/engine/draw.ts`](src/engine/draw.ts) (~150 lines, no dependencies).

## Running locally

```sh
pnpm install
pnpm dev        # start the app
pnpm test       # engine tests
pnpm typecheck
pnpm lint
pnpm build      # static output in dist/
```

The app is a fully static SPA — no backend, no accounts, no tracking. All draw logic runs in your browser.

## Deployment

Any static host works — the build is just `dist/`. Recommended options:

- **Cloudflare Pages** (recommended): free, fast, no config. Connect the repo, set build command `pnpm build` and output directory `dist`.
- **Vercel**: import the repo, framework preset "Vite", done.
- **GitHub Pages**: add a workflow that runs `pnpm build` and deploys `dist/` (set `base` in `vite.config.ts` if serving from a subpath).

There is nothing server-side to configure: no environment variables, no database, no secrets. The only external dependency is the public drand HTTP relays, called directly from the visitor's browser.

## Getting the participant list

The hosted version is paste-based: paste participant handles from any source (one per line or comma-separated) and get a provably fair, verifiable pick. This keeps the hosted app free, static, and secret-free.

**Want direct X/Twitter integration?** Self-host GlassPick and plug in your own X API key. Because pulling likers/retweeters requires a paid X API bearer token, that can never ship in the shared hosted version — but a self-hosted copy can add a small fetch step (e.g. a Cloudflare Worker or serverless function that calls the X API with your token and returns the handle list) and paste the result into the draw. The core draw engine is source-agnostic, so the commitment/verification story is identical either way.

## License

MIT
