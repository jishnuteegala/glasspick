# GlassPick

[![CI](https://github.com/jishnuteegala/glasspick/actions/workflows/ci.yml/badge.svg)](https://github.com/jishnuteegala/glasspick/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-111827.svg)](LICENSE)

GlassPick is an open-source, provably fair weighted giveaway picker.
It commits every outcome-affecting input before a future drand round exists, then produces a record anyone can reproduce locally.

## Proof Contract

GlassPick emits and accepts only draw record version 2 using `virtual-tickets-v1` and drand quicknet chain `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`.

Entrant names are trimmed only of ASCII space, tab, carriage return, and line feed at their edges, then one leading ASCII `@` is removed and the result is normalized to Unicode NFC. ASCII `A` through `Z` are folded to lowercase; all non-ASCII characters are case-sensitive. Control characters and unpaired UTF-16 surrogates are rejected. In particular, non-breaking space is accepted as part of a name and is not trimmed.
Canonical entries are sorted by unsigned lexicographic comparison of their UTF-8 bytes, then joined as `name,weight` with newline separators. This ordering is independent of locale and UTF-16 code-unit ordering.
Weights are 1 to 100000 per entrant and at most 1000000 total.
Duplicate canonical identities are rejected.

The exact commitment preimage is:

```text
glasspick-v2|chainHash|algorithm|canonicalEntries|entrantCount|totalWeight|winnerCount|alternateCount|nonce|round
```

The draw seed is `SHA-256("glasspick-seed-v2|" + commitmentHash + "|" + randomness)`.
For each pick index, GlassPick hashes ASCII `${seed}|${pickIndex}|${attempt}` and interprets the digest as an unsigned big-endian integer.
For remaining total weight `T`, `limit = 2^256 - (2^256 mod T)`. A digest is accepted if and only if `0 <= digest < limit`; otherwise it is rejected and retried with the next attempt.
The accepted digest modulo `T` selects a virtual ticket, then the selected entrant and every one of their tickets are removed.
Alternates are the next positions in this same sequence.

## Share Envelopes

Post-draw links use `#gp1=` independently of draw record versions.
The default stub is uncompressed base64url JSON containing only commitment hash, chain hash, round, winner count, and alternate count.
It contains no entrant names or outcomes.
Explicit full links contain a DEFLATE-compressed JSON record encoded as base64url.

Pending live links use `#gpp1=` and carry the complete versioned pending state in the same compressed transport.
Compression output is not specified as byte-canonical because browser implementations may differ; decoding and the proof record are deterministic.
Native `CompressionStream` and `DecompressionStream` are required for compressed links, with JSON download as the fallback.

Generated representative records were measured locally.
GlassPick caps encoded fragments at 16000 characters and decoded output at 1 MB, a conservative fit beneath common browser limits while leaving room for the origin URL.
We cannot guarantee every chat application accepts that length, so oversized full links fall back to JSON plus the privacy-safe stub.

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

`pnpm test` runs Vitest and the dependency-free Python vector verifier.
The app is a fully static SPA with no backend, accounts, telemetry, storage service, or secrets.

### Proof vector script

Agents and independent implementations can check the frozen cross-language proof vectors directly:

```sh
python -X utf8 scripts/verify_vectors.py
```

## Deployment

Cloudflare Pages is recommended: connect the repository, use `pnpm build`, and publish `dist/`.
Vercel and GitHub Pages also work for the static output.
The only runtime dependency is direct browser access to the chain-specific drand quicknet relays.

The hosted app accepts pasted entrant lists to remain free and secret-free.
For direct X integration, self-host GlassPick and keep your own paid X API bearer token in a server-side Worker or function, never in browser code.
Return a handle list from that service and feed it into the same proof engine.

The recommended public home is `glasspick.jishnuteegala.com`.
It keeps the app under the existing domain and shared privacy notice while preserving GlassPick's identity.
At deployment time, add the subdomain to the coverage list at `jishnuteegala.com/privacy` and state that GlassPick uses functional local storage for pending draws, makes direct requests to the drand Quicknet relays, and has no analytics, accounts, forms, payments, or advertising.

## Privacy and legal

GlassPick does not use analytics, cookies, accounts, payments, contact forms, or user-generated content hosting.
Entrant lists and draw records are processed in the visitor's browser and are not sent to GlassPick.
Pending draws use local storage so a draw can survive a refresh; this is functional storage.
Public randomness requests go directly from the browser to the drand Quicknet relays.

The deployed subdomain should link to the shared privacy notice at `https://jishnuteegala.com/privacy` rather than duplicate it, but only after that notice's coverage list is updated for GlassPick.
A separate privacy page and terms of service are not needed for the current product.

## Self-hosted releases

The hosted site deploys continuously from `main`, while self-hosters should use a tagged GitHub Release rather than an arbitrary commit.
Each release includes source archives from GitHub plus prebuilt `glasspick-<version>.zip` and `.tar.gz` static bundles with `SHA256SUMS`.
Extract a bundle and publish its contents on any static host.

Release Please maintains a reviewed release PR from Conventional Commits.
Merging that PR creates the version tag, generated changelog, GitHub Release, and static bundles; GlassPick is not published to npm.
GlassPick keeps the repository setting that prevents Actions from creating or approving pull requests.
To activate release PR automation, configure a fine-grained `RELEASE_PLEASE_TOKEN` Actions secret with read/write access to contents, issues, and pull requests.
Without that optional token, the release workflow exits successfully without changing releases or weakening repository permissions.

## License

MIT - see [LICENSE](LICENSE).
