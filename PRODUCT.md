# Product

## Register

product

## Platform

web

## Users

Giveaway and raffle organisers who need to pick winners from an entrant list and be able to prove the result was fair. They arrive with a list of names (often pasted from a spreadsheet or imported from an X post) and a prize to award, and they want a winner they can defend publicly. A second, larger audience is the entrants and onlookers who receive a share link after a draw and want to verify the outcome for themselves without trusting the organiser. Both groups use GlassPick in a browser, frequently under time pressure around a live announcement.

## Product Purpose

GlassPick picks weighted giveaway winners in a way anyone can reproduce. It commits every outcome-affecting input before the deciding drand randomness round exists, then derives winners from that public randomness, producing a record that any third party can re-run locally to confirm the same result. Success is an organiser who can post a result and a verification link, and a sceptic who can check that link and independently arrive at the same winners.

## Positioning

The winner picker whose every draw is provably fair: the outcome is fixed by a public randomness beacon that did not exist when the entrants were committed, so no one, including the organiser, could have steered it.

## Brand Personality

Precise, transparent, and trustworthy. The voice is that of an exacting engineer who states the contract plainly and never overclaims: it is explicit about what GlassPick proves and what it does not. The interface should feel calm and credible rather than playful or promotional, earning trust through clarity and restraint. The single moment of warmth is the winner reveal.

## Anti-references

Avoid the aesthetics of gambling, casino, and lottery products: no coin-gold accents, spinning wheels as decoration, slot-machine framing, or manufactured suspense. Avoid generic AI-tool and SaaS landing-page clichés: hero-metric templates, identical icon-heading-text card grids, gradient text, and glassmorphism. Nothing should imply a guarantee GlassPick does not make (eligibility, list completeness, or legal compliance).

## Design Principles

Practice what you preach: the interface is as verifiable as the algorithm, exposing hashes, rounds, and rules rather than hiding them behind a black box. Show the contract: state plainly what is proven and what is not, at the point of action. Restraint over spectacle: the tool disappears into the task, with familiar controls and a single celebratory moment reserved for the reveal. Trust through transparency: every claim on screen is one the underlying record can back.

## Accessibility & Inclusion

Meet WCAG 2.1 AA. Preserve visible focus outlines, honour `prefers-reduced-motion` (including suppressing the reveal confetti), maintain a full light and dark theme via `prefers-color-scheme`, keep interactive targets at a comfortable minimum size, and announce the winner through a live region for assistive technology.
