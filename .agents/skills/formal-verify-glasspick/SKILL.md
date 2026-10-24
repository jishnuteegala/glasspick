---
name: formal-verify-glasspick
description: "Verify GlassPick's tamper-evidence guarantee (src/engine/draw.ts, envelope.ts) - every field of a draw record is commitment-bound, so any semantic mutation of a valid record must be rejected by the parse-to-verify pipeline. Run after any change to draw.ts, envelope.ts, hash.ts, or the record/stub shapes."
---

# Formal verify: draw-record tamper evidence

## What it proves

The product's claim is "provably fair - verifiable by anyone." A shared record (pasted JSON or a `#gp1=` link) must either reproduce the draw exactly or be rejected. If a mutated `nonce`, `seed`, `winners`, or `entries` ever verifies, someone can forge a raffle outcome and the "fair" claim is gone. No browser session exercises this systematically - the UI shows one green check or one alert, not the 15-field mutation matrix.

`check.test.ts` runs the **real** `createCommitment`/`runDraw`/`verifyDraw`/`parseRecord`/`decodeHash` against generated draws (seeded RNG, adversarial name pool with NFC/NFD pairs and casing/whitespace variants). G1: valid records always verify. G2: each of 15 per-field mutations must be rejected - `parseRecord` throws or `verifyDraw.ok === false`. G3: full/stub envelopes round-trip and corrupted links throw. G4: `pickTicket` is deterministic, bounded, and consumes the next attempt on a rejected digest (injected hash). G5: `deriveSeed` binds both inputs.

## Run

```bash
pnpm vitest run .agents/skills/formal-verify-glasspick/check.test.ts
```

Uses the repo's vitest (required - imports are extensionless, plain `node` cannot resolve them). <1s, exits nonzero with `case N field X: mutated record verified` lines.

## Coverage record

| Covered | Functions | Notes |
| --- | --- | --- |
| `src/engine/draw.ts` | `createCommitment`, `parseCommitment`, `parseRecord`, `runDraw`, `verifyDraw`, `pickTicket`, `pickEntries`, `deriveSeed`, `parseEntries`, `sameEntries` | full commitment + record pipeline |
| `src/engine/envelope.ts` | `createFullEnvelope`, `createStub`, `decodeHash` | both link shapes + corruption |
| `src/engine/hash.ts` | `sha256Hex` | exercised through every call above |

**Sync commit:** `ddbed3d` (2026-10-24). Move this forward only after re-running the check and confirming the mutation list covers the record shape at the new commit.

Not covered, on purpose: `verifyPublicDraw`/`drand.ts` (network boundary - live drive in `verify-glasspick` covers the beacon path), `x-integration.ts` import parsing, `#gpp1=` pending-envelope mutation coverage (commitment recompute is checked on decode; add mutations if the pending shape grows fields), and all React.

## Reading a failure

`case N field X: mutated record verified` means field X is not covered by the checks - map it to `verifyDraw`'s `checks` array or `parseRecord`'s key/shape guards in `src/engine/draw.ts`. A valid-record failure (`G1`) means the commitment construction and re-parse disagree - diff `createCommitment`'s output against `parseCommitment`'s canonicalization. If a mutation you *intended* the pipeline to accept is rejected, the mutation is not semantic (it changed nothing observable) or the record shape changed - update `MUTATIONS`.

## Updating the verification

When a change is intended (a new record field, a new envelope version, a different commitment formula - evidence in the change: vectors, tests, commit message), update all of: `MUTATIONS` (add a mutation per new field), `makeInputs`, and the stub-key expectation in G3. Then break the code the way the property guards against (force `commitmentOk`/`seedOk` true in `verifyDraw`, or drop `assertKeys`) and confirm a failure appears before restoring. Record the new sync commit above.
