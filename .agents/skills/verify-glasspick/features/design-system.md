# Design system page

The design system page renders the live token inventory at `#design-system` -
a hash route so it works on any static host without SPA fallback. Sections:
`Colour`, `Type`, `Spacing`, `Shape and elevation`, `Components`, `Inventory`.

## Sub-features

- `ds-route` renders the token inventory from `/#design-system`.
- `ds-footer` reaches it via the footer `Design system` link.
- `ds-themes` renders coherently in light and dark themes.

## How to get to it (user POV)

- Choose `Design system` in the site footer.
- Open `http://localhost:4173/#design-system` directly.

## Driving it with gp-verify

Preconditions:

- Baseline launch done; `gp-verify.mjs doctor` passes.

- **Direct route.** `nav "http://localhost:4173/#design-system"`,
  `wait` for `h1` text `Design system`, `eval` the `h2` section headings or a
  `code` token name from `src/tokens.ts` (e.g. `--color-primary`), `shot`
  light and dark. The helper has no media-emulation command - send
  `Emulation.setEmulatedMedia` (`media: ""` plus a
  `prefers-color-scheme` feature entry) to the page target over the same CDP
  port in a one-off script, and keep that script's WebSocket open across the
  `shot`: the override is session-scoped and dies the moment the setter's
  connection closes (observed on Chrome 157). Assert
  `--color-ink` via `getComputedStyle(document.documentElement)` -
  `#0f1729` (light) vs `#eef1f7` (dark). Do not read the on-page
  `TokenMeta` value spans for this; they are computed once at mount and stay
  stale across the flip.
- **Footer link.** On `/`, find the footer `Design system` anchor via `eval`,
  click it, assert `location.hash === "#design-system"` and the inventory
  rendered.

## Gotchas

- A request for `/design-system` (no `#`) does NOT 404 - `vite preview` (and
  the worker's SPA fallback) serves the app shell, which renders the normal
  app. Assert `h1` is absent or not `Design system`, never a 404 status.
- The page lists runtime tokens; assert a token name from `src/tokens.ts`,
  not a hardcoded guess that can drift.
