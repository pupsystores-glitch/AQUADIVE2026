// The SharedArrayBuffer validate-then-copy race (P8-4b-1, Priority 1). Source-level tests.
//
// P8-4b-0 `parseRoundScript` decoded (and so validated) the caller's bytes, and only at the end
// copied them for the RoundScript and its digest. A buffer that another agent changes between
// the two — a SharedArrayBuffer written by another thread — yielded a RoundScript whose content
// is one input and whose canonical bytes and digest are another (the review: 197 / 400).
//
// Deterministic adversary: the input is a SharedArrayBuffer view; a built-in the parser itself
// calls (Object.keys, Array.isArray, …) is wrapped so that its k-th call writes the buffer with
// Atomics.store — the write happens at an exactly reproducible point inside the parse. Run
// against the EXACT P8-4b-0 parser (oracle/, a verbatim copy) it reproduces the race at every
// trigger point; against the current parser it cannot be reproduced at any: the private copy is
// taken before anything else reads the input. A threaded race (a second thread toggling a digit
// with Atomics.store while the main thread parses) is the non-deterministic confirmation.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import { canonicalDigest, canonicalJson } from "../../src/round/canonical";
import {
  buildRoundScript,
  parseRoundScript,
  validateRunnerOutput,
  type RoundScript,
} from "../../src/round/round-script";
import { longestRunnerOutput, shortFloorOutput } from "../helpers/round-scripts";
import { parseRoundScript as headParseRoundScript } from "./oracle/head-round-script";

const { hash } = createNodeFairnessCrypto();
const ascii = (b: Uint8Array) => Buffer.from(b).toString("latin1");

const script = buildRoundScript(
  hash,
  { chainId: "ab".repeat(32), chainIndex: 3, salt: "cd".repeat(16) },
  validateRunnerOutput(shortFloorOutput(3), 3),
);
const original = script.secretCanonicalBytes();
const text = ascii(original);
/** A digit whose change keeps the script valid: the creature's x, 0.5 → 0.6. */
const AT = text.indexOf('"x":0.5') + 6;
const ALT = "6".charCodeAt(0);
const altered = Uint8Array.from(original);
altered[AT] = ALT;
const originalDigest = canonicalDigest(hash, original);
const alteredDigest = canonicalDigest(hash, altered);

/** Inconsistent = the kept bytes or digest are not those of the validated content. */
const inconsistent = (s: RoundScript): boolean => {
  const kept = s.secretCanonicalBytes();
  return (
    ascii(kept) !== canonicalJson({ public: s.public, secret: s.secretContent() }) ||
    s.secretDigest() !== canonicalDigest(hash, kept)
  );
};

type Parse = (provider: typeof hash, bytes: Uint8Array, digest?: string) => RoundScript;
const PARSERS: [string, Parse][] = [
  ["P8-4b-0 (oracle)", headParseRoundScript as unknown as Parse],
  ["current", parseRoundScript],
];

// Built-ins both parsers call between reading the input and finishing; each is a trigger.
const TRIGGERS: [object, string][] = [
  [Object, "keys"],
  [Array, "isArray"],
  [Object, "getPrototypeOf"],
  [Number, "isFinite"],
  [Number, "isSafeInteger"],
  [Object, "is"],
];
const saved = TRIGGERS.map(([o, k]) => (o as any)[k]);
afterEach(() => TRIGGERS.forEach(([o, k], i) => ((o as any)[k] = saved[i])));

/**
 * Parses a SharedArrayBuffer copy of the original, with `write(view)` run on the `k`-th call of
 * the trigger built-in (counted from the parse's start). Returns the outcome and whether the
 * write happened.
 */
function attack(
  parse: Parse,
  trigger: number,
  k: number,
  write: (v: Uint8Array) => void,
  digest?: string,
) {
  const view = new Uint8Array(new SharedArrayBuffer(original.length));
  view.set(original);
  const [owner, key] = TRIGGERS[trigger]!;
  const native = saved[trigger];
  let calls = 0;
  let fired = false;
  (owner as any)[key] = function (this: unknown, ...args: unknown[]) {
    calls += 1;
    if (calls === k && !fired) {
      fired = true;
      write(view);
    }
    return native.apply(this, args);
  };
  try {
    const s = parse(hash, view, digest);
    return {
      fired,
      calls,
      accepted: true,
      inconsistent: inconsistent(s),
      digest: s.secretDigest(),
      x: s.secretContent().creatures[0]!.x,
    };
  } catch (e: any) {
    return { fired, calls, accepted: false, code: e?.code as string };
  } finally {
    (owner as any)[key] = native;
  }
}
const toggleDigit = (v: Uint8Array) => Atomics.store(v, AT, ALT);
const zeroAll = (v: Uint8Array) => {
  for (let i = 0; i < v.length; i++) Atomics.store(v, i, 0);
};

describe("deterministic shared-memory adversary (Atomics.store at the k-th built-in call)", () => {
  it("reproduces the P8-4b-0 race at every trigger point and never with the current parser", () => {
    const summary: Record<
      string,
      { attacks: number; fired: number; inconsistent: number; accepted: number }
    > = {};
    for (const [name, parse] of PARSERS) {
      const s = (summary[name] = { attacks: 0, fired: 0, inconsistent: 0, accepted: 0 });
      for (let t = 0; t < TRIGGERS.length; t++) {
        // How often the parse calls this built-in at all (no write).
        const total = attack(parse, t, Number.POSITIVE_INFINITY, () => {}).calls;
        const points = [
          ...new Set([1, 2, 3, Math.ceil(total / 2), total].filter((k) => k >= 1 && k <= total)),
        ];
        for (const k of points) {
          for (const [write, digest] of [
            [toggleDigit, undefined],
            [toggleDigit, alteredDigest], // the digest of what the attacker switches to
            [zeroAll, undefined],
          ] as const) {
            const r = attack(parse, t, k, write, digest);
            s.attacks += 1;
            if (r.fired) s.fired += 1;
            if (r.accepted) s.accepted += 1;
            if (r.accepted && r.inconsistent) s.inconsistent += 1;
            if (name === "current") {
              // The private copy was taken before any trigger: the original is what is
              // validated and kept, whatever the write.
              expect(r.fired, `${TRIGGERS[t]![1]} #${k}`).toBe(true);
              if (digest === alteredDigest) {
                expect(r).toMatchObject({ accepted: false, code: "script-digest-mismatch" });
              } else {
                expect(r).toMatchObject({
                  accepted: true,
                  inconsistent: false,
                  digest: originalDigest,
                  x: 0.5,
                });
              }
            }
          }
        }
      }
    }
    const head = summary["P8-4b-0 (oracle)"]!;
    const current = summary.current!;
    // The oracle: a write between its decode and its copy is accepted as an inconsistent script
    // (content 0.5, bytes and digest of 0.6 or of zeros). Some of its trigger calls come after
    // the copy (deepFreeze), where a write changes nothing — or never happen, when the digest
    // already failed — so not every attack is inconsistent, but most are.
    expect(head.inconsistent).toBeGreaterThan(head.attacks / 2);
    expect(current.fired).toBe(current.attacks);
    expect(current.inconsistent).toBe(0);
  });

  it("the oracle's race in the controller's shape: content of one input, bytes and digest of another", () => {
    // A worker-side attacker sends valid bytes B1 with the digest of valid bytes B2 and switches
    // the shared buffer from B1 to B2 after the decode: P8-4b-0 accepted it.
    const head = attack(PARSERS[0]![1], 0, 1, toggleDigit, alteredDigest);
    expect(head).toMatchObject({
      fired: true,
      accepted: true,
      inconsistent: true,
      digest: alteredDigest,
      x: 0.5,
    });
    const now = attack(PARSERS[1]![1], 0, 1, toggleDigit, alteredDigest);
    expect(now).toMatchObject({ fired: true, accepted: false, code: "script-digest-mismatch" });
    // Switched BEFORE the parse starts, both validate and keep B2 consistently.
    for (const [, parse] of PARSERS) {
      const view = new Uint8Array(new SharedArrayBuffer(altered.length));
      view.set(altered);
      const s = parse(hash, view, alteredDigest);
      expect(inconsistent(s)).toBe(false);
      expect(s.secretContent().creatures[0]!.x).toBe(0.6);
    }
  });
});

describe("threaded shared-memory race (a second thread toggles a digit with Atomics.store)", () => {
  // Non-deterministic by nature: the current parser must show NO inconsistency; the oracle's
  // count is reported (it depends on timing; the review measured 197 / 400).
  const FLIPPER = `
    const { workerData } = require("node:worker_threads");
    const { sab, at, a, b, flag } = workerData;
    const u = new Uint8Array(sab);
    const f = new Int32Array(flag);
    let k = 0;
    while (Atomics.load(f, 0) === 0) {
      Atomics.store(u, at, (k++ & 1) ? a : b);
      for (let s = 0; s < 500; s++) Atomics.load(f, 0);
    }`;

  async function race(parse: Parse, rounds: number) {
    const big = buildRoundScript(
      hash,
      { chainId: "ab".repeat(32), chainIndex: 9, salt: "cd".repeat(16) },
      validateRunnerOutput(longestRunnerOutput(9), 9),
    );
    const bytes = big.secretCanonicalBytes();
    // a digit inside a late sample: both values keep the script valid
    const at = ascii(bytes).indexOf('"worldY":[0,') + 40;
    const sab = new SharedArrayBuffer(bytes.length);
    const view = new Uint8Array(sab);
    view.set(bytes);
    const a = view[at]!;
    const b = a === 0x31 ? 0x32 : 0x31;
    const flag = new SharedArrayBuffer(4);
    const worker = new Worker(FLIPPER, { eval: true, workerData: { sab, at, a, b, flag } });
    await new Promise((r) => setTimeout(r, 100));
    const out = { rounds, accepted: 0, rejected: 0, inconsistent: 0 };
    try {
      for (let i = 0; i < rounds; i++) {
        try {
          const s = parse(hash, view);
          out.accepted += 1;
          if (inconsistent(s)) out.inconsistent += 1;
        } catch {
          out.rejected += 1;
        }
      }
    } finally {
      Atomics.store(new Int32Array(flag), 0, 1);
      await worker.terminate();
    }
    return out;
  }

  it("the current parser keeps every accepted script consistent", async () => {
    const now = await race(parseRoundScript, 200);
    expect(now.inconsistent).toBe(0);
    expect(now.accepted + now.rejected).toBe(200);
    const head = await race(headParseRoundScript as unknown as Parse, 200);
    expect(head.accepted + head.rejected).toBe(200);
    // Reported, not asserted (timing-dependent): head.inconsistent is typically > 0.
    expect(typeof head.inconsistent).toBe("number");
  }, 60_000);
});
