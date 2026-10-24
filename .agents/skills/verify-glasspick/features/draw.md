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

- Open the app root `http://localhost:4173/` (the draw page is home).

## Driving it with gp-verify

Preconditions:

- Baseline launch done; `gp-verify.mjs doctor` passes; fresh profile (no
  `glasspick-pending-v2` key).
- Network access to the drand relays (`api.drand.sh`,
  `drand.cloudflare.com`) - the browser fetches randomness directly.

- **Enter entrants.** `nav "http://localhost:4173/"`,
  `wait "document.querySelector('#entrants') !== null"`, set the textarea value
  via the native setter and dispatch an `input` event via `eval`, then `eval`
  the status line `N entrants, M total weight`.
- **Commit.** Click `Create commitment` via `eval` (find by button text), then
  `wait` for `Commitment locked` (`Quicknet round <n>` + `code.hash` rendered)
  and `eval "!!localStorage.getItem('glasspick-pending-v2')"` -> `true`.
  `shot` the committed view.
- **Restore.** `nav` to `/` again; the entry form may flash `Restoring...`
  first - `wait` for `Commitment locked` to render from storage, `eval` the
  stored round and compare to the first capture.
- **Reset.** Click `Cancel` (pending view) or `New draw` (record view); assert
  the textarea view returns and `glasspick-pending-v2` is gone.

## Gotchas

- Without `--enable-features`/focus emulation, `navigator.clipboard` calls fail
  headless; that affects the share recipes, not commit.
- The pending view can announce itself through a live region; assert on the
  rendered round/hash, not on announcement text.
- Entrant parsing is strict about formats; use the documented plain list from
  the README, not invented syntax. Plain mode splits on newlines AND commas;
  strictness lives in weighted mode and name canonicalization.
- A reused profile showing `Commitment locked` is leftover
  `glasspick-pending-v2` state, not a bug - run `sw-clear` or use a fresh
  profile before calling entry broken.
- The committed round is picked ~5 quicknet rounds out (3s each), so `Run draw`
  unlocks roughly 15s after commit; assert `Available in Ns` disables the
  button rather than racing it.
