// TEST ONLY (P8-4a-1, owner decisions I5, I6). Generates the independent known-answer vectors.
// Never bundled, never imported by server/src or src/; it imports only node:crypto (through
// ./reference-round.mjs) and ./spec-impl.mjs.
//
//   node test/independent/generate-vectors.mjs > test/independent/vectors-v1.json
//   (then `npx prettier --write` that file; tests compare DATA, not bytes)
//
// Two public, non-secret chains:
// - "dev-v1": the P8-3a development vectors (FAIRNESS_DEV_VECTORS_V1, length 8, salts A and B),
//   all 16 rounds;
// - "kat-v1": a P8-4a-1 known-answer chain of 2,048 links from a fixed public phrase, with salts
//   A and B (the development salts) and C.
//
// Selection rule for "kat-v1" (fixed BEFORE looking at any result, so no example is chosen
// because the implementation passes it): for every salt and every category below, the FIRST
// chain index (1, 2, 3, …) whose independent reference round satisfies the category. A missing
// category is an error, never a silent skip. A round may satisfy several categories.
//
// recordDigest = SHA-256( "AQUADIVE-REFERENCE-RECORD\0v1\0" || sorted-key JSON of the reference
// record ), the record being the runner's output shape without profile, profileVersion, fv and
// chainIndex. The loader's known answers and the tests compare the production runner with it.

import { pathToFileURL } from "node:url";
import { PHRASES, CHAIN_LENGTH } from "./spec-impl.mjs";
import {
  hex,
  phraseChain,
  phraseSalt,
  referenceCrash,
  referenceRound,
  sha256,
} from "./reference-round.mjs";

export const KAT_CHAIN_V1 = Object.freeze({
  seedPhrase:
    "AQUADIVE fairness fv=1 P8-4a-1 known-answer chain v1. PUBLIC, NOT SECRET. Never use in production.",
  length: 2048,
  saltPhrases: Object.freeze({
    A: PHRASES.saltA,
    B: PHRASES.saltB,
    C: "AQUADIVE fairness fv=1 P8-4a-1 known-answer salt C. Fixed test value, not a public beacon value.",
  }),
});

/** Category predicates over a reference result `{ record, branches }`. Order is the report order. */
export const CATEGORIES = Object.freeze({
  "crash-exact-1x": ({ branches }) => branches.crash === "exact-1x",
  "crash-floor-1.01": ({ branches }) => branches.crash === "floor-1.01",
  "crash-over-100": ({ record, branches }) => branches.crash === "curve" && record.crashAt > 100,
  "crash-clamp-200": ({ branches }) => branches.crash === "clamp-200",
  "crash-during-boost": ({ record }) => record.outcome === "crash" && record.final.boost > 0,
  "floor-jackpot-tier-1": ({ record, branches }) =>
    record.outcome === "floor" && branches.jackpot === 1,
  "floor-jackpot-tier-2": ({ record, branches }) =>
    record.outcome === "floor" && branches.jackpot === 2,
  "floor-jackpot-tier-3": ({ record, branches }) =>
    record.outcome === "floor" && branches.jackpot === 3,
  "floor-chest-rare": ({ record, branches }) =>
    record.outcome === "floor" && branches.chests.includes("rare"),
  "goldfish-consumed": ({ branches }) => branches.goldfishConsumed >= 1,
  "goldfish-consumed-twice": ({ branches }) => branches.goldfishConsumed >= 2,
});
/** Categories decided by the crash stream alone (cheap to prove "first"). */
export const CRASH_ONLY = Object.freeze([
  "crash-exact-1x",
  "crash-floor-1.01",
  "crash-over-100",
  "crash-clamp-200",
]);

const DOMAIN = "AQUADIVE-REFERENCE-RECORD\u0000v1\u0000";

/** Sorted-key JSON (numbers in ECMAScript shortest round-trip form). */
export function sortedJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(",")}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${sortedJson(v[k])}`)
    .join(",")}}`;
}
export const recordDigest = (record) =>
  hex(sha256(Uint8Array.from(DOMAIN + sortedJson(record), (c) => c.charCodeAt(0))));

export function chains() {
  const dev = phraseChain(PHRASES.seed, CHAIN_LENGTH);
  const kat = phraseChain(KAT_CHAIN_V1.seedPhrase, KAT_CHAIN_V1.length);
  const salts = Object.fromEntries(
    Object.entries(KAT_CHAIN_V1.saltPhrases).map(([k, p]) => [k, phraseSalt(p)]),
  );
  return { dev, kat, salts };
}

const summary = (set, salt, index, categories, r) => ({
  set,
  salt,
  index,
  categories,
  outcome: r.record.outcome,
  crashAt: r.record.crashAt,
  crashBranch: r.branches.crash,
  crashDraws: r.record.drawCounts.crash,
  jackpot: r.record.jackpot,
  jackpotTier: r.branches.jackpot,
  chests: r.record.chests,
  chestTiers: r.branches.chests,
  terminalTick: r.record.terminalTick,
  worldDraws: r.record.drawCounts.world,
  creatures: r.record.creatures.length,
  goldfishConsumed: r.branches.goldfishConsumed,
  recordDigest: recordDigest(r.record),
});

export function generate() {
  const { dev, kat, salts } = chains();
  const vectors = [];
  for (const s of ["A", "B"]) {
    for (let i = 1; i <= CHAIN_LENGTH; i++) {
      vectors.push(summary("dev-v1", s, i, ["dev-vector"], referenceRound(dev, i, salts[s])));
    }
  }
  const names = Object.keys(CATEGORIES);
  for (const s of Object.keys(KAT_CHAIN_V1.saltPhrases)) {
    const found = new Map(); // index → { categories, result }
    const open = new Set(names);
    for (let i = 1; i <= KAT_CHAIN_V1.length && open.size > 0; i++) {
      // A crash-only category depends on the crash stream alone: once only such categories are
      // open, a full round is computed only for an index whose crash point satisfies one (the
      // selection is the same as computing every round, just faster).
      if ([...open].every((n) => CRASH_ONLY.includes(n))) {
        const c = referenceCrash(kat, i, salts[s]);
        if (![...open].some((n) => CATEGORIES[n](c))) continue;
      }
      const r = referenceRound(kat, i, salts[s]);
      for (const name of [...open]) {
        if (!CATEGORIES[name](r)) continue;
        open.delete(name);
        const entry = found.get(i) ?? { categories: [], r };
        entry.categories.push(name);
        found.set(i, entry);
      }
    }
    if (open.size > 0) throw new Error(`salt ${s}: no round for ${[...open].join(", ")}`);
    for (const [i, { categories, r }] of [...found].sort((a, b) => a[0] - b[0])) {
      vectors.push(summary("kat-v1", s, i, categories, r));
    }
  }
  return {
    schema: "aquadive.independent-vectors",
    schemaVersion: 1,
    generator: "server/test/independent/generate-vectors.mjs",
    chains: {
      "dev-v1": { length: CHAIN_LENGTH, chainId: hex(dev[0]), salts: ["A", "B"] },
      "kat-v1": {
        seedPhrase: KAT_CHAIN_V1.seedPhrase,
        length: KAT_CHAIN_V1.length,
        chainId: hex(kat[0]),
        salts: Object.fromEntries(
          Object.entries(KAT_CHAIN_V1.saltPhrases).map(([k, p]) => [
            k,
            { phrase: p, hex: hex(salts[k]) },
          ]),
        ),
      },
    },
    selection: "kat-v1: for every salt and category, the first chain index that satisfies it",
    categories: names,
    vectors,
  };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/").replace(/^\//, "")}`) {
  process.stdout.write(`${JSON.stringify(generate(), null, 2)}\n`);
}
