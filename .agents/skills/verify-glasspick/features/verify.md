# Verify a record

Verify lets a user open a `#gp1=` proof link or paste a saved record and check
that the committed draw reproduces the recorded winners; malformed links get a
human-readable error instead of a browser exception.

## Sub-features

- `verify-open` renders a `#gp1=` link: a `full` envelope auto-verifies and
  shows the draw; a `stub` shows `Privacy-safe proof for round <n>` and waits
  for the matching pasted JSON record.
- `verify-manual` accepts a pasted record and reports a three-state verdict:
  `Verified against the public beacon`, `Locally consistent, beacon
  unavailable`, or `Verification failed`, with per-check Pass/Fail rows.
- `verify-badlink` shows one clean alert for a damaged or incomplete link.

## How to get to it (user POV)

- Follow a `#gp1=<envelope>` link shared after a draw.
- Choose the `Verify` nav button and paste a saved record into the
  `Draw record JSON` textarea (the footer has no Verify entry).

## Driving it with gp-verify

Preconditions:

- Baseline launch done; `gp-verify.mjs doctor` passes.

- **Bad link.** `nav "http://localhost:4173/#gp1=notavalidenvelope"`, then
  `wait "!!document.querySelector('[role=alert]')"`. Assert
  `eval "document.querySelector('[role=alert]').textContent"` equals
  `Invalid GlassPick link: the link is damaged or incomplete` - exactly one
  alert element (`eval "document.querySelectorAll('[role=alert]').length"` is
  `1`), and no raw `atob`/`JSON`/`DOMException` text appears.
  `shot .scratch/verify/<run>/verify-badlink.png`.
- **Manual verify.** `nav "http://localhost:4173/"` after clearing hash state
  (fresh profile or `sw-clear`), fill the `Draw record JSON` textarea, choose
  `Verify`; assert the verdict `<h2>` chip text and `shot` it.
- **Full link auto-verify.** `nav` a `#gp1=` full-record link; the verdict
  `h2` becomes `Verified against the public beacon` with no paste.

## Gotchas

- The router decodes the hash exactly once (`resolveRoute`) and hands the page
  the result; assert exactly one `[role=alert]`, not just that the text exists.
- Manual verify stays enabled after a link error - check the textarea/verify
  control is not disabled before calling the path broken.
- A fresh Chrome profile per run avoids the service worker serving an older
  bundle than `dist/` you just built.
