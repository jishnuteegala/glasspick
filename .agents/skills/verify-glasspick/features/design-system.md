# Design system page

The design system page renders the live token inventory (colors, typography,
spacing, reveal styles) at `#design-system` - a hash route so it works on any
static host without SPA fallback.

## Sub-features

- `ds-route` renders the token inventory from `/#design-system`.
- `ds-footer` reaches it via the footer `Design system` link.
- `ds-themes` renders coherently in light and dark themes.

## How to get to it (user POV)

- Choose `Design system` in the site footer.
- Open `http://127.0.0.1:4173/#design-system` directly.

## Driving it with gp-verify

Preconditions:

- Baseline launch done; `gp-verify.mjs doctor` passes.

- **Direct route.** `nav "http://127.0.0.1:4173/#design-system"`,
  `wait` for the token grid/headings to mount, `eval` a marker (page title or a
  known token name present in the DOM), `shot` light and dark (emulate
  `prefers-color-scheme` via `Emulation.setEmulatedMedia` if the helper grows
  it, or flip the OS profile theme and re-shoot).
- **Footer link.** On `/`, find the footer `Design system` anchor via `eval`,
  click it, assert `location.hash === "#design-system"` and the inventory
  rendered.

## Gotchas

- A request for `/design-system` (no `#`) must NOT be asserted to work - the
  hash route is the product's contract for static hosts; the path 404s by
  design.
- The page lists runtime tokens; assert a token name from `src/tokens.ts`,
  not a hardcoded guess that can drift.
