import { describe, expect, it } from "vitest";
import {
  createCommitment,
  deriveSeed,
  parseRecord,
  pickTicket,
  runDraw,
  verifyDraw,
  type DrawInputs,
  type DrawRecord,
} from "../../../src/engine/draw";
import { createFullEnvelope, createStub, decodeHash } from "../../../src/engine/envelope";

// Tamper-evidence verifier for src/engine/draw.ts + envelope.ts.
// The product promise is "provably fair": every field of a draw record is
// covered by the commitment/seed recompute, so any semantic mutation of a
// valid record must be rejected by the parse -> verify pipeline.
// G1 round-trip, G2 per-field mutation rejection, G3 envelope,
// G4 pickTicket, G5 deriveSeed.

// Deterministic RNG so the check is reproducible run to run.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x9e3779b9);
const rand = (n: number) => Math.floor(rng() * n);

const NAME_POOL = [
  "@Alice", "BOB", "  carol  ", "déjà", "deja\u0301", "Eve", "fränk",
  "grâce", "Hank", "😀", "ivy2", "José", "k", "l-o-n-g-n-a-m-e",
  "Mallory", "nina", "0scar", "Pål", "queen", "rémy",
];
const hex = (len: number) =>
  Array.from({ length: len }, () => "0123456789abcdef"[rand(16)]).join("");

function makeInputs(): DrawInputs {
  const count = 2 + rand(7);
  const names = new Set<string>();
  while (names.size < count) names.add(NAME_POOL[rand(NAME_POOL.length)] + `_${rand(1000)}`);
  const entries = [...names].map((name) => ({ name, weight: 1 + rand(1e5) }));
  const winnerCount = 1 + rand(Math.min(3, count));
  return {
    entries,
    winnerCount,
    alternateCount: rand(Math.min(5, count - winnerCount) + 1),
    nonce: hex(32),
    round: 1 + rand(5000000),
  };
}

const CASES = 15;

// Every mutation must keep the record structurally plausible where the point
// is hash coverage; parseRecord throwing is also a valid rejection.
async function rejected(mutant: unknown): Promise<boolean> {
  let parsed: DrawRecord;
  try {
    parsed = parseRecord(mutant);
  } catch {
    return true;
  }
  const result = await verifyDraw(parsed);
  return !result.ok;
}

function clone(r: DrawRecord): DrawRecord {
  return structuredClone(r);
}

type Mutation = { field: string; apply: (r: DrawRecord) => unknown };

const MUTATIONS: Mutation[] = [
  { field: "nonce", apply: (r) => ({ ...r, nonce: hex(32) }) },
  { field: "round", apply: (r) => ({ ...r, round: r.round + 1 }) },
  { field: "entrantCount", apply: (r) => ({ ...r, entrantCount: r.entrantCount + 1 }) },
  { field: "totalWeight", apply: (r) => ({ ...r, totalWeight: r.totalWeight + 1 }) },
  { field: "commitmentHash", apply: (r) => ({ ...r, commitmentHash: hex(64) }) },
  { field: "randomness", apply: (r) => ({ ...r, randomness: hex(64) }) },
  { field: "seed", apply: (r) => ({ ...r, seed: hex(64) }) },
  {
    field: "winners-order",
    apply: (r) => {
      if (r.winners.length < 2) return null;
      const winners = [...r.winners];
      [winners[0], winners[1]] = [winners[1], winners[0]];
      return { ...r, winners };
    },
  },
  {
    field: "winners-swap-alternate",
    apply: (r) => {
      if (r.alternates.length < 1) return null;
      const winners = [...r.winners];
      const alternates = [...r.alternates];
      [winners[0], alternates[0]] = [alternates[0], winners[0]];
      return { ...r, winners, alternates };
    },
  },
  { field: "entries-permute", apply: (r) => ({ ...r, entries: [...r.entries].reverse() }) },
  {
    field: "entries-weight",
    apply: (r) => {
      const entries = r.entries.map((e) => ({ ...e }));
      entries[0].weight += 1;
      return { ...r, entries };
    },
  },
  { field: "unknown-key", apply: (r) => ({ ...r, injected: true }) },
  { field: "version", apply: (r) => ({ ...r, version: 3 }) },
  { field: "algorithm", apply: (r) => ({ ...r, algorithm: "fake-v1" }) },
  { field: "chainHash", apply: (r) => ({ ...r, chainHash: hex(64) }) },
  {
    // Count-consistent forgery: promote every alternate into winners and fix
    // both counts so the record stays self-consistent. Only the commitment
    // binding can reject this - the exact hole the matrix exists to cover.
    field: "counts-promote-alternates",
    apply: (r) => ({
      ...r,
      winnerCount: r.winnerCount + r.alternateCount,
      alternateCount: 0,
      winners: [...r.winners, ...r.alternates],
      alternates: [],
    }),
  },
  {
    field: "winners-name",
    apply: (r) => {
      if (r.winners.length < 1) return null;
      const winners = r.winners.map((w, i) => (i === 0 ? { ...w, name: w.name + "_x" } : w));
      return { ...r, winners };
    },
  },
  {
    field: "winners-weight",
    apply: (r) => {
      if (r.winners.length < 1) return null;
      const winners = r.winners.map((w, i) => (i === 0 ? { ...w, weight: w.weight + 1 } : w));
      return { ...r, winners };
    },
  },
  {
    field: "alternates-name",
    apply: (r) => {
      if (r.alternates.length < 1) return null;
      const alternates = r.alternates.map((a, i) => (i === 0 ? { ...a, name: a.name + "_x" } : a));
      return { ...r, alternates };
    },
  },
  {
    field: "entries-name",
    apply: (r) => {
      const entries = r.entries.map((e, i) => (i === 0 ? { ...e, name: e.name + "_x" } : e));
      return { ...r, entries };
    },
  },
  {
    field: "entry-injected-key",
    apply: (r) => {
      const entries = r.entries.map((e, i) => (i === 0 ? { ...e, injected: true } : e));
      return { ...r, entries };
    },
  },
];

describe("formal verify: draw-record tamper evidence", () => {
  it("G1 valid records always verify", async () => {
    const bad: string[] = [];
    for (let i = 0; i < CASES; i++) {
      const record = await runDraw(await createCommitment(makeInputs()), hex(64));
      const result = await verifyDraw(record);
      if (!result.ok) bad.push(`case ${i}: valid record rejected (${JSON.stringify(result.checks.filter(c => c.status !== "pass").map(c => c.label))})`);
    }
    expect(bad).toEqual([]);
  });

  it("G2 every semantic field mutation is rejected by the pipeline", async () => {
    const bad: string[] = [];
    const fired = new Set<string>();
    for (let i = 0; i < CASES; i++) {
      const record = await runDraw(await createCommitment(makeInputs()), hex(64));
      for (const m of MUTATIONS) {
        const mutant = m.apply(clone(record));
        if (mutant === null) continue;
        if (JSON.stringify(mutant) === JSON.stringify(record)) continue;
        fired.add(m.field);
        if (!(await rejected(mutant))) bad.push(`case ${i} field ${m.field}: mutated record verified`);
      }
    }
    for (const m of MUTATIONS)
      if (!fired.has(m.field)) bad.push(`mutation ${m.field} never produced a distinct record`);
    expect(bad).toEqual([]);
  });

  it("G3 envelopes round-trip; corrupted links throw or decode identically", async () => {
    const bad: string[] = [];
    for (let i = 0; i < 5; i++) {
      const record = await runDraw(await createCommitment(makeInputs()), hex(64));
      const link = await createFullEnvelope(record);
      const decoded = await decodeHash(link);
      try {
        expect(decoded).toEqual({ type: "full", record });
      } catch {
        bad.push(`case ${i}: full envelope did not round-trip`);
      }
      const stub = await decodeHash(createStub(record));
      try {
        expect(stub).toEqual({
          type: "stub", commitmentHash: record.commitmentHash, chainHash: record.chainHash,
          round: record.round, winnerCount: record.winnerCount, alternateCount: record.alternateCount,
        });
      } catch {
        bad.push(`case ${i}: stub decode mismatch`);
      }
      const pos = link.length - 1 - rand(link.length - 5);
      const corruptChar = link[pos] === "A" ? "B" : "A";
      const corrupted = link.slice(0, pos) + corruptChar + link.slice(pos + 1);
      try {
        const out = await decodeHash(corrupted);
        try {
          expect(out).toEqual(decoded);
        } catch {
          bad.push(`case ${i}: corrupted link decoded to a different envelope`);
        }
      } catch {
        // expected: damaged links must throw
      }
    }
    expect(bad).toEqual([]);
  });

  it("G4 pickTicket is deterministic, bounded, and retries on rejected digests", async () => {
    const bad: string[] = [];
    const seed = hex(64);
    for (const total of [2, 3, 7, 100, 100_000]) {
      const a = await pickTicket(total, seed, 0);
      const b = await pickTicket(total, seed, 0);
      if (a !== b || a < 0 || a >= total) bad.push(`total=${total}: ${a} vs ${b}`);
    }
    // Rejection sampling: first digest beyond the limit must consume attempt 1,
    // and the attempt counter must actually reach the hash preimage.
    const total = 100;
    const limit = (1n << 256n) - ((1n << 256n) % BigInt(total));
    let calls = 0;
    const seen: string[] = [];
    const ticket = await pickTicket(total, seed, 3, async (input) => {
      calls++;
      seen.push(input);
      return calls === 1 ? limit.toString(16).slice(-64) : "0".repeat(64);
    });
    if (calls !== 2 || ticket !== 0) bad.push(`rejection: ticket=${ticket} calls=${calls}`);
    if (seen[1] !== `${seed}|3|1`) bad.push(`rejection: call 2 preimage was ${seen[1]}`);
    expect(bad).toEqual([]);
  });

  it("G5 deriveSeed binds commitment hash and randomness exactly", async () => {
    const bad: string[] = [];
    const commitment = hex(64);
    const randomness = hex(64);
    const seed = await deriveSeed(commitment, randomness);
    if (seed === (await deriveSeed(hex(64), randomness))) bad.push("seed ignores commitmentHash");
    if (seed === (await deriveSeed(commitment, hex(64)))) bad.push("seed ignores randomness");
    if (seed !== (await deriveSeed(commitment, randomness))) bad.push("seed is not deterministic");
    expect(bad).toEqual([]);
  });
});
