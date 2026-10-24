# Share links

Share links encode the draw so anyone can open the same record: a `#gpp1=` live
link while the reveal is pending, plus `#gp1=` stub and full record links after
the draw - each copy action confirms with a `Copied` state.

## Sub-features

- `share-live` copies the `#gpp1=` pending-reveal link (disclosure-gated: the
  entrant list travels inside the link); the button is
  `Copy entrant-revealing live link`.
- `share-stub` copies the minimal `#gp1=` proof stub; the button is
  `Copy privacy-safe link` and is not gated.
- `share-full` copies the full `#gp1=` record link; the button is
  `Copy full record link` and is disclosure-gated by its own checkbox.
- `share-feedback` shows `Copied` for ~2s on success and a clean error on
  clipboard failure.

## How to get to it (user POV)

- On the commitment view, tick the live-link disclosure checkbox, then choose
  `Copy entrant-revealing live link`.
- On the completed record view, choose `Copy privacy-safe link`, or tick the
  full-link disclosure checkbox and choose `Copy full record link`.

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
- **Link shape.** The produced link is never rendered in the DOM - clipboard
  only. Inject a stub before clicking:
  `eval "navigator.clipboard.writeText = t => (window.__copied = t, Promise.resolve())"`,
  then `eval "window.__copied"` and assert it starts `http://localhost:4173/#gpp1=`
  or `http://localhost:4173/#gp1=` and the whole URL is under 16000 chars. The stub dies on every
  `nav` - re-inject after each navigation.

## Gotchas

- The clipboard write itself can throw in headless Chrome (`Document is not
  focused`); the app normalizes that to `Could not copy the link to the
  clipboard`. Either grant clipboard/focus to prove success, or assert the
  normalized error to prove the failure path - do not mix the two.
- There is exactly one `[role=alert]` notice driven by a single error state; a
  failed copy overwrites whatever error text was already shown.
