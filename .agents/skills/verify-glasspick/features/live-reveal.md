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

- Follow a `#gpp1=<envelope>` live link (from the share flow) - the envelope is
  the only way onto this route. Reloading `/` with `glasspick-pending-v2`
  stored restores the Draw tab's `Commitment locked` panel, not the reveal.

## Driving it with gp-verify

Preconditions:

- A real `#gpp1=` URL from the share recipe (the envelope is the only way in).

- **Countdown.** `nav` to the `#gpp1=` URL, `wait "!!document.getElementById('live-reveal')"`,
  `eval` `.countdown-number` (monospace digits matching
  `/^\d{1,2}(:\d{2}){0,2}$/` - the regex caps at 99h, which covers any
  app-minted link's ~15s window; hand-built far-future envelopes can exceed
  it) and `h1.reveal-round` (`Quicknet round <n>`),
  `shot` it.
- **Skip link.** `eval` a `.click()` on `a.skip-link` (`Skip to live reveal`),
  then assert `eval "location.hash"` still equals the `#gpp1=...` payload and
  `eval "document.activeElement.id"` is `live-reveal`; `shot` focus on the
  reveal.
- **Winners.** Just wait: the committed round sits ~5 quicknet rounds (~15s)
  out and the page polls every 2s. `wait "!!document.querySelector('.winner-reveal')"`
  with a generous timeout, then `eval` the `.winner-list` names and the
  `Winner: @name` live-region text; `shot` it.

## Gotchas

- The stale service-worker profile is the classic false failure here: an old
  bundle loses the fragment on skip. Fresh profile, or `sw-clear` first.
- The reveal target is `tabIndex={-1}`; `document.activeElement.id` is the
  proof - a `location.hash` assertion alone misses the old anchor-nav bug.
- Countdown asserts should compare text shape (digits/round), not exact
  seconds remaining, which races the capture.
- The countdown phase only lasts until the round is due (~15s after the link
  was minted). `main#live-reveal` mounts in every phase, so wait on
  `.countdown-readout` for countdown evidence and be ready to land straight on
  winners; mint a fresh link and nav immediately to catch the countdown.
