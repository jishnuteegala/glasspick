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

`pnpm test` runs Vitest (including mocked X integration tests) and the dependency-free Python vector verifier. CI never contacts X.
The core app remains a static SPA. The optional X importer requires the included standalone Cloudflare Worker; it has no accounts, telemetry, or storage service.

### Proof vector script

Agents and independent implementations can check the frozen cross-language proof vectors directly:

```sh
python -X utf8 scripts/verify_vectors.py
```

## Deployment

Cloudflare Pages is recommended for the public static app: connect the repository, use `pnpm build`, and publish `dist/`.
Vercel and GitHub Pages also work for the static output.
Without the optional importer, the only runtime dependency is direct browser access to the chain-specific drand quicknet relays.

### Optional direct X integration

The browser accepts only exact HTTPS post URLs in the form `https://x.com/handle/status/123` or `https://twitter.com/handle/status/123`. It previews selected likers, reposters, and direct reply authors before loading handles into the existing plain entrant textarea. The proof schema and algorithm are unchanged; editing the loaded textarea invalidates the displayed import provenance.

Configure these deployment variables:

- `VITE_X_IMPORT_ENABLED=true` (required at build time): exposes the optional import controls. Leave it unset on the public hosted deployment to keep that build paste-only.
- `X_BEARER_TOKEN` (required on the Worker at runtime): a server-side access token accepted by the selected X API endpoints. Add it as an encrypted Worker secret. Never use a `VITE_` prefix or expose it to browser code. Official X documentation currently conflicts on whether liking-users accepts app-only authentication, so liker imports may require a user-context token for the operator's X app.
- `ALLOWED_ORIGIN` (optional): one additional exact origin, such as `https://preview.example.com`, allowed to call the function. Requests from the function's own origin are allowed by default. Do not include a path or trailing slash.

Create an X developer project whose approved use case covers giveaway entrant retrieval and enable the required read endpoints.
In the Cloudflare dashboard, create a Worker, connect the `jishnuteegala/glasspick` GitHub repository under **Settings > Builds**, set the root directory to `worker`, and let Cloudflare deploy it from Git pushes.
Set `X_BEARER_TOKEN` as an encrypted Worker secret, replace the checked-in rate-limit `namespace_id`, and configure a same-origin route on an organiser-only hostname.
Protect the entire organiser hostname with a deny-by-default Cloudflare Access self-hosted application before enabling the Worker route or `VITE_X_IMPORT_ENABLED`; this lets the browser establish its Access session normally and prevents a direct unprotected Worker origin.
This repository's GitHub Actions test the Worker but do not deploy it; no Cloudflare API token or deployment secret belongs in GitHub.
Self-hosters who prefer another deployment system can use `worker/src/index.ts` and `worker/wrangler.jsonc` with Cloudflare's supported tooling.

The optional adapter lives in `worker/` so ordinary Pages, Vercel, and GitHub Pages deployments remain static.
The Cloudflare dashboard Git build uses `worker/wrangler.jsonc`. After connecting the repository, add a same-origin custom route ending in `/api/x/entrants`, then build the organiser UI with `VITE_X_IMPORT_ENABLED=true`. The default `workers.dev` route is disabled to avoid a second public endpoint.
The Worker sends direct REST requests only to fixed `https://api.x.com` v2 endpoints. It rejects redirects, validates request and response shapes, caps request bodies at 2 KB, imports at most 10 pages and 1,000 accounts per source, times requests out after 8 seconds, retries transient failures twice with bounded backoff, honours short rate-limit resets, and requires the checked-in Cloudflare Rate Limiting binding at approximately 10 imports per IP per Cloudflare location per minute. Rate Limiting bindings are intentionally permissive and eventually consistent, so keep X spending caps enabled and add stricter Cloudflare Access or WAF controls before exposing a high-budget endpoint. Use an account-unique `namespace_id` if another Worker in the account already uses the checked-in value.

X API access and retrieved posts may be billable even when requests remain within rate limits. Review current endpoint availability, pricing, project usage, and caps in the X Developer Console before enabling the importer. GlassPick does not cache X responses, but each import can consume several paid API reads.

Known limitations:

- Liker imports are deliberately limited to the first API page, containing at most 100 accounts; they always require explicit acknowledgment.
- Reply imports use recent search, cover only the previous seven days, and include only posts directly replying to the supplied post. They always require explicit acknowledgment.
- Repost and reply pagination stops at 10 pages or 1,000 fetched accounts per source.
- Deleted, protected, suspended, withheld, or otherwise unavailable accounts may be omitted. The preview reports unavailable records only when X returns that information.
- Rate limits, access tier restrictions, API changes, safety bounds, and upstream errors can produce partial results. Partial imports cannot be loaded until explicitly acknowledged.
- A successful import proves neither eligibility nor completeness. It only fills the same editable entrant list that is committed by GlassPick.
- An unchanged import can be downloaded as a separate credential-free source receipt tied to the canonical entrant-list hash and commitment hash. The receipt records provenance but is not part of the v2 proof and does not make the X list complete or cryptographically verified.

Troubleshooting: a `503` means `X_BEARER_TOKEN` or the `X_IMPORT_RATE_LIMITER` binding is absent; a generic browser failure can mean the origin does not match the deployment or `ALLOWED_ORIGIN`; a `429` means the Worker's Cloudflare limiter fired, while X throttling appears in a partial preview. Check Worker logs and the X Developer Console without logging the bearer token or raw authorization headers.

X may change pricing, endpoint access, retention/display requirements, or policy without notice. Operators are responsible for maintaining an approved use case, a suitable privacy notice, platform-policy compliance, and legal giveaway rules. In particular, X's Developer Policy restricts credential sharing, redistribution and retention of X content, and pay-to-engage use cases; an incentive tied to likes, reposts, or replies may be prohibited. Review [the research notes](docs/x-api-research.md) and current official policy before deployment.

The recommended public home is `glasspick.jishnuteegala.com`.
It keeps the app under the existing domain and shared privacy notice while preserving GlassPick's identity.
At deployment time, add the subdomain to the coverage list at `jishnuteegala.com/privacy` and state that GlassPick uses functional local storage for pending and completed draws, makes direct requests to the drand Quicknet relays, and has no analytics, accounts, forms, payments, or advertising.

## Privacy and legal

GlassPick does not use analytics, cookies, accounts, payments, contact forms, or user-generated content hosting.
Entrant lists and draw records are processed in the visitor's browser and are not sent to GlassPick. When the optional X importer is used, the post URL and selected source types are sent to the same-origin function, which returns public handles to the browser without server-side storage.
Pending draws, the most recent completed draw record, and its X source receipt (when the importer is used) stay in the browser's local storage so a draw and its result survive a refresh; this is functional storage. Starting a new draw or pressing "New draw" removes all of it, and it never leaves the device.
Public randomness requests go directly from the browser to the drand Quicknet relays.

### What GlassPick proves

GlassPick verifies that winners were derived from the committed participant list using the recorded public randomness.
It does not verify participant eligibility, source-list completeness, prize fulfilment, compliance with platform rules, or the legality of a giveaway.
Giveaway organisers remain responsible for those matters.

X data may be incomplete or unavailable because of API access, endpoint caps, pagination limits, deleted or protected accounts, rate limits, and platform behaviour.
GlassPick can record the final participant list used for a draw, but it cannot prove that X returned every eligible account.

The deployed subdomain should link to the shared privacy notice at `https://jishnuteegala.com/privacy` rather than duplicate it, but only after that notice's coverage list is updated for GlassPick.
A separate privacy page and terms of service are not needed for the current product.

## Self-hosted releases

The hosted site deploys continuously from `main`, while self-hosters should use a tagged GitHub Release rather than an arbitrary commit.
Each release includes source archives from GitHub plus prebuilt `glasspick-<version>.zip` and `.tar.gz` static bundles with `SHA256SUMS`.
Extract a bundle and publish its contents on any static host.

Release Please maintains a reviewed release PR from Conventional Commits.
Merging that PR creates the version tag, generated changelog, GitHub Release, and static bundles; GlassPick is not published to npm.
Release Please uses the repository's built-in `GITHUB_TOKEN` to create and update the release PR.
You choose the release cutoff by merging that PR manually; it is never auto-merged.
GitHub suppresses ordinary workflow events created by `GITHUB_TOKEN`, so required CI on the generated release PR can be started through the CI workflow's manual-dispatch action before merge.

## License

MIT - see [LICENSE](LICENSE).
