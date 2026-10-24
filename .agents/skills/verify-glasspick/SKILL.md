---
name: verify-glasspick
description: "Drive the GlassPick web app end to end in an isolated headless Chrome and capture proof of user-facing behavior. Use before calling any GlassPick UI change done, when a claim about the app needs runtime evidence, or when reproducing a reported bug."
---

# Verify GlassPick

Drive the real app the way a user does: serve the production build, open it in a
throwaway Chrome profile over CDP, exercise a feature, and keep the evidence.
The feature map in [`features/`](features/README.md) lists the user-facing
surfaces and their recipes; read the feature file for the surface you are
verifying before driving.

## Launch

1. Build and serve the production bundle (background, never foreground):

   ```bash
   pnpm build          # tsc -b && vite build -> dist/
   pnpm preview        # vite preview, serves dist/ on http://localhost:4173
   ```

   Ready when the preview prints `Local:` with the 4173 URL. Use `localhost`,
   not `127.0.0.1` - on Windows vite preview binds `::1` and IPv4 loopback
   refuses. `pnpm preview` must stay running in a background shell for the
   whole run; plain static serving is enough because every route is a `#`
   fragment.

2. Start an isolated headless Chrome (background-safe: the helper spawns it
   detached and returns):

   ```bash
   node .agents/skills/verify-glasspick/gp-verify.mjs chrome-start \
     --cdp 9222 --profile .scratch/verify/profile-$RUN_ID
   ```

   Ready when it prints `chrome ready on 9222`. The profile directory must be
   fresh per run - a reused profile carries the PWA service worker and pending-
   draw localStorage, which can serve a stale bundle or a "Commitment locked"
   view. Pick a different `--cdp` port if 9222 is taken.

3. Export nothing; all helper flags carry their own defaults (`--app
   http://localhost:4173`, `--cdp 9222`).

## Doctor

Run first whenever anything looks off, and once at run start:

```bash
node .agents/skills/verify-glasspick/gp-verify.mjs doctor
```

Passes when the app answers 200 with a `GlassPick` marker AND the CDP endpoint
answers with its browser version. Fails non-zero otherwise - fix launch before
driving. Two extra checks this skill cannot automate: confirm the preview port
is the one this run started (another `vite preview` on the same port silently
wins), and confirm the Chrome profile dir is the run's own (never a personal
profile - see Cleanup).

## Drive

Every user route is a URL fragment; navigation is a page load:

```bash
node .agents/skills/verify-glasspick/gp-verify.mjs nav "http://localhost:4173/#design-system"
node .agents/skills/verify-glasspick/gp-verify.mjs nav "http://localhost:4173/#gp1=notavalidenvelope"
```

`nav`, `wait`, `eval`, and `shot` all attach to the same page target, so state
persists across invocations within a run. Drive with predicates over stable
handles, not pixel positions:

- `wait "document.querySelector('#entrants') !== null"` - draw form mounted
- `wait "!!document.querySelector('[role=alert]')"` - error/success notice shown
- `wait "!!document.getElementById('live-reveal')"` - reveal surface mounted
- `eval "document.activeElement.id"` / `eval "location.hash"` - focus and
  fragment state
- Buttons are found by text: `eval "[...document.querySelectorAll('button')].map(b => b.textContent.trim())"`,
  clicked via `eval "...button.click()"`.

A fresh profile starts each feature recipe; `sw-clear` clears storage and the
service worker for the app origin when you must reuse a profile mid-run.

## Evidence

Artifacts live under `.scratch/verify/<run-id>/` (gitignored). For each feature
verified, keep:

- `nav.log` - the literal `gp-verify.mjs` invocations in order
- `<name>.png` screenshots via `shot` - capture the user action AND the
  resulting state, not only the final screen
- `<name>.json` - `eval` output of the observable end state (alert text,
  activeElement, location.hash, localStorage keys)

Proof standard: exercise the real user path (form fill, checkbox, button
click), then assert the rendered result. A passing predicate without a
screenshot is a claim, not evidence; a screenshot without the driving command
is not reproducible. When a feature writes localStorage
(`glasspick-pending-v2`, `glasspick-record-v1`,
`glasspick-x-provenance-v1`), read the key back via `eval` as the side-effect
check.

## Cleanup

```bash
node .agents/skills/verify-glasspick/gp-verify.mjs chrome-stop   # Browser.close via CDP
# stop the background shell running pnpm preview
# remove .scratch/verify/profile-* (chrome profile dirs)
```

`chrome-stop` closes the browser over CDP - never kill Chrome by process name,
and never a profile you did not start. Cleanup removes the profile dirs and
stops the preview; it never touches `.scratch/verify/<run-id>/` evidence. After
cleanup, `ls .scratch/verify/<run-id>/` must still show every artifact.

## Helpers

One script, zero dependencies (Node's built-in WebSocket, needs Node >= 22.10):

```
node .agents/skills/verify-glasspick/gp-verify.mjs <command> [--app url] [--cdp port] [--timeout ms]
  doctor                                  app + CDP health check
  chrome-start [--profile dir] [--chrome path]   detached isolated headless Chrome
  chrome-stop                             Browser.close over CDP
  nav <url>                               navigate the run's page, wait for load
  wait <js-predicate>                     poll until true (default 15s)
  eval <js-expression>                    print JSON of the page-side result
  shot <outfile.png>                      full-viewport PNG, creates parent dirs
  sw-clear                                clear storage + service worker for --app origin
```

The helper resolves Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`
by default; override with `--chrome` or `GLASSPICK_VERIFY_CHROME` on other
installs. Exit codes are scriptable: 0 pass, non-zero on any failed predicate.
