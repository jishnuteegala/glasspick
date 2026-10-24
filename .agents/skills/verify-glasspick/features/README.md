# GlassPick verification map

This directory is the maintained source for verifying the user-facing behavior
of GlassPick. Read this index before driving the app, then use the matching
feature file as the recipe.

## Baseline preconditions

- Production build served at `http://localhost:4173` via `pnpm preview` in a
  background shell (run `pnpm build` first if `dist/` is stale).
- Isolated headless Chrome up on CDP port 9222 with a fresh
  `.scratch/verify/profile-*` user-data dir - never the user's real browser.
- `node .agents/skills/verify-glasspick/gp-verify.mjs doctor` passes.
- Evidence goes to `.scratch/verify/<run-id>/` and survives cleanup.
- Never drive an instance this run did not start.

## Driving conventions

- Every user route is a URL fragment: `#gp1=` (proof record), `#gpp1=` (pending
  live reveal), `#design-system` (token inventory). Plain paths are not routes.
- `nav`, `wait`, `eval`, `shot` attach to the same page target; state persists
  across invocations within a run.
- Prefer stable handles: element ids, `role=alert`, button text content, input
  `name`/`type` - never coordinates or tab order.
- Capture the action and the resulting state. Record the feature file and entry
  point used with every artifact.

## Features

- [Create a draw](./draw.md) covers entrant entry, commitment to a drand round,
  and the pending state a fresh profile restores.
- [Share links](./share-links.md) covers the disclosure-gated live link, stub and
  full record links, and the `Copied` confirmation.
- [Verify a record](./verify.md) covers opening a proof link, manual record
  verification, and malformed-link error copy.
- [Live reveal](./live-reveal.md) covers the pending-reveal countdown, winner
  announcement, and skip links that preserve the payload fragment.
- [Design system page](./design-system.md) covers the footer link, the hash
  route, and token rendering in both themes.
