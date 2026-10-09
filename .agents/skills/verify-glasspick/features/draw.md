# Create a draw

Create a draw takes a pasted entrant list, commits to a public drand beacon
round, and locks the commitment so a refresh or a shared live link reproduces
the same pending draw.

## Sub-features

- `draw-enter` accepts a pasted entrant list and shows parsed count/weight.
- `draw-commit` locks the draw to a named drand round and stores the pending
  state in `glasspick-pending-v2`.
- `draw-restore` restores the pending view after a reload.
- `draw-reset` clears pending state back to the entry form.

## How to get to it (user POV)

- Open the app root `http://127.0.0.1:4173/` (the draw page is home).

## Driving it with gp-verify

Preconditions:

- Baseline launch done; `gp-verify.mjs doctor` passes; fresh profile (no
  `glasspick-pending-v2` key).
- Network access to the drand relays (`api.drand.sh`,
  `drand.cloudflare.com`) - the browser fetches randomness directly.

- **Enter entrants.** `nav "http://127.0.0.1:4173/"`,
  `wait "document.querySelector('textarea') !== null"`, set the textarea value
  and dispatch an `input` event via `eval`, then `eval` the parsed-entry count
  shown in the UI.
- **Commit.** Click the commit button via `eval` (find by button text), then
  `wait` for the commitment view (round number + commitment hash rendered) and
  `eval "!!localStorage.getItem('glasspick-pending-v2')"` -> `true`.
  `shot` the committed view.
- **Restore.** `nav` to `/` again; `wait` for the commitment view to render
  from storage, `eval` the stored round and compare to the first capture.
- **Reset.** Click `Start over` / the reset control; assert the textarea view
  returns and the storage key is gone.

## Gotchas

- Without `--enable-features`/focus emulation, `navigator.clipboard` calls fail
  headless; that affects the share recipes, not commit.
- The pending view can announce itself through a live region; assert on the
  rendered round/hash, not on announcement text.
- Entrant parsing is strict about formats; use the documented plain list (one
  entry per line) from the README, not invented syntax.
- A reused profile showing `Commitment locked` is leftover
  `glasspick-pending-v2` state, not a bug - run `sw-clear` or use a fresh
  profile before calling entry broken.
