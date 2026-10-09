# Share links

Share links encode the draw so anyone can open the same record: a `#gpp1=` live
link while the reveal is pending, plus `#gp1=` stub and full record links after
the draw - each copy action confirms with a `Copied` state.

## Sub-features

- `share-live` copies the `#gpp1=` pending-reveal link (disclosure-gated: the
  entrant list travels inside the link).
- `share-stub` copies the minimal `#gp1=` proof stub.
- `share-full` copies the full `#gp1=` record link.
- `share-feedback` shows `Copied` for ~2s on success and a clean error on
  clipboard failure.

## How to get to it (user POV)

- On the commitment view, tick the live-link disclosure checkbox, then choose
  `Copy live link`.
- On the completed record view, choose `Copy stub link` or `Copy full link`.

## Driving it with gp-verify

Preconditions:

- A committed draw exists (run the draw recipe first, or seed
  `glasspick-pending-v2` via the app UI - not by writing storage directly).
- For real clipboard reads, launch Chrome with clipboard permissions; the
  feedback assertion needs only the label change, not the OS clipboard.

- **Disclosure.** `eval` the live-link control: it must stay unavailable until
  the disclosure checkbox is checked; check it, then assert the button exists.
- **Copy + feedback.** Click the copy button, `wait` for a button whose text is
  `Copied`, `shot` the state. The `Copied` label reverts after ~2s - capture
  promptly.
- **Link shape.** `eval "window.__copied ?? ''"` only if the harness stubs
  clipboard; otherwise read the produced link from the record view and assert
  it starts `#gpp1=` or `#gp1=` and is under 16000 chars.

## Gotchas

- The clipboard write itself can throw in headless Chrome (`Document is not
  focused`); the app normalizes that to `Could not copy the link to the
  clipboard`. Either grant clipboard/focus to prove success, or assert the
  normalized error to prove the failure path - do not mix the two.
- A failed copy must not clear an existing record error; check both notices if
  asserting failure behavior.
