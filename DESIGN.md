---
name: GlassPick
description: Provably fair winner picker
colors:
  bg: "#f7f8fa"
  surface: "#ffffff"
  surface-sunken: "#f2f4f7"
  primary: "#4f46e5"
  primary-hover: "#4338ca"
  primary-soft: "#eef2ff"
  on-primary: "#ffffff"
  ink: "#0f1729"
  muted: "#55607a"
  line: "#e2e6ec"
  line-strong: "#cdd3dd"
  ok: "#047857"
  warn: "#a25a07"
  fail: "#c62828"
  info: "#3730a3"
  ok-bg: "#ecfdf5"
  ok-line: "#a7f3d0"
  warn-bg: "#fefaf0"
  warn-line: "#fcd996"
  fail-bg: "#fef2f2"
  fail-line: "#fecaca"
  info-bg: "#eef2ff"
  info-line: "#c7d2fe"
typography:
  page-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  reveal-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.2
  countdown:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3.75rem, 12vw, 6rem)"
    fontWeight: 600
    lineHeight: 1
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "0.5rem"
  panel: "0.875rem"
  full: "9999px"
spacing:
  control-y: "0.625rem"
  control-x: "0.75rem"
  panel: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.9rem"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.9rem"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunken}"
  control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.75rem"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
---

# Design System: GlassPick

## 1. Overview

**Creative North Star: "The Verifiable Instrument"**

GlassPick looks like a precision instrument, not a game of chance. The system serves a task that lives or dies on trust, so the interface is quiet, legible, and deliberately unremarkable: a single indigo accent on a cool near-white field, one typeface family, panels with soft borders and the faintest lift. Nothing competes with the numbers, hashes, and rules that make a draw provable. The tool disappears into the task and lets the record do the talking.

It rejects every visual cue of gambling and lottery products, coin-gold accents, spinning wheels, slot-machine framing, manufactured suspense, and it rejects the generic AI-tool palette of hero metrics, identical card grids, gradient text, and glassmorphism. Restraint is the brand. The one place the system permits warmth is the winner reveal, where scale and a brief confetti burst mark the single moment that earns celebration.

The system ships a full light and dark theme driven by `prefers-color-scheme`; both are first-class, tuned separately, and every token below has a dark counterpart.

**Key Characteristics:**
- One accent (indigo), used only for actions, selection, and state, never decoration.
- One typeface family; a monospace face reserved for cryptographic data.
- Cool, tinted neutrals on a near-white field; a matching dark theme.
- Soft-bordered panels with a whisper of elevation; flat by default.
- Familiar, standard controls; density where the task needs it.

## 2. Colors

A restrained cool palette: tinted greys carrying a single indigo accent, with a conventional four-hue semantic set for state.

### Primary
- **Indigo** (`#4f46e5`, dark `#7c78ff`): the only accent. Primary buttons, focus outlines, the current nav tab, and the brand mark. Its hover is **Indigo Deep** (`#4338ca`, dark `#918dff`); **Indigo Soft** (`#eef2ff`, dark `#1c2033`) tints file-button hovers and soft fills.
- **On Indigo** (`#ffffff`, dark `#0b0f1a`): the text colour that sits on a primary-indigo fill. Light indigo takes white text; the lighter dark-mode indigo takes near-black text, so the primary button clears WCAG AA (5.5:1) instead of the 3.5:1 that white-on-light-indigo would give.

### Neutral
- **Ink** (`#0f1729`, dark `#eef1f7`): primary text.
- **Muted** (`#55607a`, dark `#9aa4bc`): secondary text, captions, weights, disabled affordances.
- **Background** (`#f7f8fa`, dark `#0b0f1a`): the page field.
- **Surface** (`#ffffff`, dark `#131a29`): panels, controls, header, footer.
- **Surface Sunken** (`#f2f4f7`, dark `#0f1522`): inset areas such as the hash block and secondary-button hover.
- **Line** (`#e2e6ec`, dark `#263145`) and **Line Strong** (`#cdd3dd`, dark `#35425c`): dividers and borders; the stronger stroke marks interactive controls.

### Semantic
- **OK** (`#047857`, dark `#34d399`) on **OK BG** (`#ecfdf5`) with **OK Line** (`#a7f3d0`): verified results, success chips.
- **Warn** (`#a25a07`, dark `#fbbf24`) on **Warn BG** (`#fefaf0`) with **Warn Line** (`#fcd996`): local-only or unverified states.
- **Fail** (`#c62828`, dark `#f87171`) on **Fail BG** (`#fef2f2`) with **Fail Line** (`#fecaca`): validation errors, failed checks.
- **Info** (`#3730a3`, dark `#a5b4fc`) on **Info BG** (`#eef2ff`) with **Info Line** (`#c7d2fe`): provenance and neutral notices.

### Named Rules
**The One Accent Rule.** Indigo is the only non-semantic colour. It appears on primary actions, the active tab, focus rings, and the brand mark, nowhere else. State colours are the only other saturated hues, and they are reserved for state.

**The Both-Themes Rule.** Every colour is defined for light and dark. Never ship a token, component, or new surface that only works in one theme.

**The Legible-Fill Rule.** Text on a saturated fill uses the `on-primary` token, never a hard-coded `#fff`. When a fill is light enough that white text drops below 4.5:1 (as the dark-theme indigo does), the token flips to near-black. Verify any new coloured-fill component against WCAG AA in both themes before shipping.

## 3. Typography

**Body Font:** system UI sans (`ui-sans-serif, system-ui, sans-serif`)
**Mono Font:** system monospace (`ui-monospace, SFMono-Regular, Menlo, monospace`)

**Character:** No brand typeface. The interface uses the platform's own UI sans for everything and a monospace face only for machine data, so text renders natively and cryptographic values are unambiguous. Product UI does not need display/body pairing.

### Hierarchy
- **Countdown** (600, `clamp(3.75rem, 12vw, 6rem)`, tabular-nums): the live-reveal timer, the one intentionally large element in the system.
- **Reveal Title** (600, `clamp(1.5rem, 4vw, 2.25rem)`): the round heading on the live-reveal screen.
- **Page Title** (600, `1rem`): the `h1` on Draw, Verify, and How-it-works panels. Deliberately modest; the panel, not the heading, frames the task.
- **Section Heading** (600, `0.875rem`): `h2`/`h3` inside panels (Winners, Alternates, Share and verify).
- **Body** (400, `0.875rem`, line-height 1.5): default copy and controls (`--text-control`). Prose caps at ~65–75ch inside the `max-w-3xl` column.
- **Label** (500, `0.875rem`): form labels and control text.
- **Mono** (400, `0.75rem`): commitment hashes, randomness, record detail, and the entrant textarea.
- **Eyebrow** (600, `0.75rem`, uppercase, letter-spacing 0.18em): used once, above the live-reveal round title.

### Named Rules
**The Fixed-Scale Rule.** Type sizes are a fixed rem scale (0.75 / 0.875 / 1rem for UI), not fluid clamps. Fluid sizing is permitted only for the two reveal-screen headings, where scale is the point.

**The Mono-for-Proof Rule.** Monospace is reserved for cryptographic and record data (hashes, randomness, JSON). Never use it for prose or labels.

## 4. Elevation

Flat by default. Depth is carried mainly by tinted layering, background → surface → sunken, with two very soft shadows used sparingly. Panels sit just above the page; the primary button carries the same panel shadow to read as raised. There is no deep or dramatic elevation anywhere.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px rgb(15 23 41 / .04), 0 1px 3px rgb(15 23 41 / .06)`; dark `0 1px 2px rgb(0 0 0 / .3), 0 1px 3px rgb(0 0 0 / .4)`): resting panels and the primary button.
- **Raised** (`box-shadow: 0 4px 12px rgb(15 23 41 / .08), 0 2px 4px rgb(15 23 41 / .05)`; dark `0 6px 20px rgb(0 0 0 / .5), 0 2px 6px rgb(0 0 0 / .4)`): reserved for genuinely lifted surfaces.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat and separated by tint and 1px lines. Shadows are a whisper of separation, not a design feature; never exceed the two defined values.

## 5. Components

### Buttons
- **Shape:** gently rounded (`--radius-control`, 0.5rem). Minimum touch target 2.75rem.
- **Primary:** indigo fill, white text, panel shadow, padding `0.55rem 0.9rem`. Hover deepens to Indigo Deep; active nudges down 0.5px.
- **Secondary:** surface fill, strong-line border, ink text. Hover fills to Surface Sunken.
- **Disabled:** opacity 0.5, shadow removed, `not-allowed` cursor.

### Inputs / Fields
- **Style:** `.control`, surface fill, strong-line border, control radius, padding `0.625rem 0.75rem`, 0.875rem text. Full-width by default. File inputs use `.file-control` with a sunken selector button.
- **Focus:** border shifts to indigo; a 2px indigo focus-visible outline at 2px offset applies to every interactive element.
- **Mono textareas:** entrant list and record JSON use the mono face.

### Panels / Containers
- **Corner Style:** `--radius-panel` (0.875rem).
- **Background:** surface, with a 1px line border and the Panel shadow.
- **Padding:** `--space-panel` (1.5rem).
- **Layout:** a single centred `max-w-3xl` column; no nested cards.

### Notices
- Full-width blocks (`.notice-fail` / `.notice-warn` / `.notice-info`), each a semantic background with a matching 1px border and semantic text. Never a coloured side-stripe.

### Status Chips
- Round pill (`--radius full`) in three flavours (ok / warn / fail): a small circular badge for per-check results, plus a headline pill (`✓` / `!` / `×`) summarising verification and reveal state.

### Navigation
- Top tabs (`.nav-tab`): muted text, transparent 2px bottom border; hover raises to ink; the active tab (`aria-current="page"`) shows an indigo underline and ink 600 weight. The header carries the brand mark lockup (indigo square with a white "G", name, tagline). One flat horizontal bar, no mobile drawer.

### Brand Mark / App Icon
- The favicon and PWA icons share one motif: an indigo (`#4f46e5`) rounded square holding a white ring with a centred dot, mirroring the header lockup. The in-app header uses the same indigo square with a white "G".

### Live Reveal (signature)
- A full-height centred column: eyebrow, round title, a large tabular-nums countdown, then the winner list. On confirmation a brief confetti burst fires once, suppressed under `prefers-reduced-motion`. This is the only choreographed moment in the product.

## 6. Do's and Don'ts

### Do:
- **Do** keep indigo (`#4f46e5`) as the sole accent: actions, selection, focus, brand mark.
- **Do** define every new colour and component for both light and dark themes.
- **Do** use the fixed rem type scale for UI; reserve fluid sizing for the two reveal headings.
- **Do** render hashes, randomness, and records in the monospace face.
- **Do** keep interactive targets at ≥2.75rem and preserve the 2px indigo focus outline.
- **Do** honour `prefers-reduced-motion`, including suppressing the reveal confetti.
- **Do** state plainly what a draw proves and what it does not, at the point of action.

### Don't:
- **Don't** introduce a second accent hue, or use saturated colour on inactive states.
- **Don't** use gambling or lottery cues: coin-gold, spinning wheels, slot-machine framing, or manufactured suspense.
- **Don't** reach for generic AI-tool patterns: hero-metric templates, identical icon-heading-text card grids, gradient text, or glassmorphism.
- **Don't** use coloured side-stripe borders on notices or cards; use full borders and semantic backgrounds.
- **Don't** nest cards, or exceed the two defined shadow values.
- **Don't** use the monospace face for prose or labels, or display-scale headings for ordinary UI.
- **Don't** imply guarantees GlassPick does not make (eligibility, list completeness, legal compliance).
