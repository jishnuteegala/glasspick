# Live reveal

Live reveal shows a pending draw's countdown to its committed drand round, then
the winner announcement; its skip link moves focus without destroying the
`#gpp1=` payload fragment.

## Sub-features

- `reveal-countdown` renders the round countdown on a `#gpp1=` link.
- `reveal-winners` announces winners when the round resolves.
- `reveal-skiplink` keeps `location.hash` intact and moves focus to
  `#live-reveal`.

## How to get to it (user POV)

- Follow a `#gpp1=<envelope>` live link (from the share flow).
- Reload the app with pending state stored (`glasspick-pending-v2`).

## Driving it with gp-verify

Preconditions:

- A real `#gpp1=` URL from the share recipe (the envelope is the only way in).

- **Countdown.** `nav` to the `#gpp1=` URL, `wait "!!document.getElementById('live-reveal')"`,
  `eval` the countdown element's text (monospace readout + round number),
  `shot` it.
- **Skip link.** `eval` a `.click()` on the skip link (`Skip to live reveal` /
  anchor targeting `live-reveal`), then assert
  `eval "location.hash"` still equals the `#gpp1=...` payload and
  `eval "document.activeElement.id"` is `live-reveal`; `shot` focus on the
  reveal.
- **Winners.** Fast-forward is not a user path; verify the resolved state only
  against a round that has actually passed, or rely on unit coverage for the
  transition.

## Gotchas

- The stale service-worker profile is the classic false failure here: an old
  bundle loses the fragment on skip. Fresh profile, or `sw-clear` first.
- The reveal target is `tabIndex={-1}`; `document.activeElement.id` is the
  proof - a `location.hash` assertion alone misses the old anchor-nav bug.
- Countdown asserts should compare text shape (digits/round), not exact
  seconds remaining, which races the capture.
