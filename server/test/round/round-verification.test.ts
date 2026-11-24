// Bounded RoundScript verification (P8-4b-1). Source-level tests:
//
// - the byte cap MAX_ROUND_SCRIPT_BYTES and the prescan bounds are PROVED from the validation
//   rules: a skeleton document with every field at its longest possible text (derived from
//   ECMA-262 Number::toString for each validated range) and every array at its longest length
//   is an upper bound of every acceptable script;
// - RoundScriptVerification: the same result for every budget, at most `budget` operations per
//   step, nothing exposed before the end, zeroed copies on failure and cancellation, redaction;
// - an oversized input is refused before any copy (no ArrayBuffer memory is allocated).
// The comparison with the exact P8-4b-0 parser is verify-differential.test.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { inspect } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import { CANONICAL_MAX_DEPTH, canonicalJson } from "../../src/round/canonical";
import { CREATURE_KINDS, EXPECTED_RUNNER_PROFILE as P } from "../../src/round/engine-types";
import {
  ANALYTIC_MAX_DIVE_TICKS,
  ANALYTIC_MAX_TERMINAL_TICK,
  DEFAULT_VERIFICATION_BUDGET,
  MAX_ROUND_SCRIPT_BYTES,
  ROUND_SCRIPT_SHAPE_LIMITS,
  ROUND_SCRIPT_STATUS,
  ROUND_SCRIPT_VERSION,
  RoundScriptVerification,
  buildRoundScript,
  parseRoundScript,
  validateRunnerOutput,
} from "../../src/round/round-script";
import { longestRunnerOutput, shortFloorOutput } from "../helpers/round-scripts";
import { parseRoundScript as headParse } from "./oracle/head-round-script";

const { hash } = createNodeFairnessCrypto();
const CHAIN_ID = "ab".repeat(32);

const scriptOf = (output: any, chainIndex: number, salt = "cd".repeat(16)) =>
  buildRoundScript(
    hash,
    { chainId: CHAIN_ID, chainIndex, salt },
    validateRunnerOutput(output, chainIndex),
  );

// ---- The proof of the byte cap -------------------------------------------------------------

/**
 * The longest String(v) of a finite double v with lo ≤ v ≤ hi (0 ≤ lo), from ECMA-262
 * Number::toString: with k ≤ 17 significant digits and decimal exponent n (10^(n−1) ≤ v < 10^n),
 *   1 ≤ n ≤ 21:  digits then zeros (k ≤ n: n chars) or with a point (k + 1 ≤ 18 chars);
 *  −5 ≤ n ≤ 0:  "0." + (−n zeros) + k digits (2 − n + 17 chars);
 *   otherwise:  d[.ddd]e±x (k + 1 + 2 + digits of |n − 1| chars).
 * Every exponent the range can reach is enumerated (widened by one each side against log10
 * rounding), so the result is an upper bound for every double in the range.
 */
function maxDoubleText(lo: number, hi: number): number {
  let max = lo === 0 ? 1 : 0; // "0"
  const nLo = lo === 0 ? -323 : Math.floor(Math.log10(lo)) + 1; // 5e-324 has n = −323
  const nHi = Math.floor(Math.log10(hi)) + 1;
  for (let n = nLo - 1; n <= nHi + 1; n++) {
    let len: number;
    if (n >= 1 && n <= 21) len = Math.max(n, 17 + 1);
    else if (n >= -5 && n <= 0) len = 2 - n + 17;
    else len = 17 + 1 + 2 + String(Math.abs(n - 1)).length;
    max = Math.max(max, len);
  }
  return max;
}
const maxIntText = (lo: number, hi: number) => Math.max(String(lo).length, String(hi).length);
/** A JSON value whose canonical text has exactly `len` characters (a string of x, or 1). */
const fill = (len: number): unknown => (len === 1 ? 1 : "x".repeat(len - 2));

const FLOOR_Y = 4200;
const MAX_CREATURES = Math.floor(2048 / 7); // drawCounts.world = 7 · creatures ≤ 2048
const MAX_EXIT_DIVE_TICK = P.bettingTicks + ANALYTIC_MAX_DIVE_TICKS;
const LONGEST_KIND = Math.max(...CREATURE_KINDS.map((k) => k.length));

/**
 * The upper-bound skeleton: exactly the validators' key sets, every array at the longest length
 * they allow, every scalar replaced by a value at least as long as the longest text it may have
 * (null alternatives included). Any accepted script is at most as long, field by field.
 */
function upperBoundDocument() {
  const longest = (...lens: number[]) => fill(Math.max(...lens));
  const NULL = 4;
  const creature = {
    id: longest(maxIntText(1, MAX_CREATURES)),
    kind: "x".repeat(LONGEST_KIND),
    x: longest(maxDoubleText(0.1, 0.9)),
    worldY: longest(maxDoubleText(0, FLOOR_Y + 2000)),
    size: longest(maxDoubleText(0.8, 1.4)),
    phase: longest(maxDoubleText(0, 2 * Math.PI)),
    dir: longest(maxIntText(-1, 1)),
    spawnTick: longest(maxIntText(P.bettingTicks + 1, MAX_EXIT_DIVE_TICK)),
    consumedTick: longest(NULL, maxIntText(P.bettingTicks + 1, MAX_EXIT_DIVE_TICK)),
  };
  const ticks = ANALYTIC_MAX_DIVE_TICKS;
  return {
    public: {
      scriptVersion: ROUND_SCRIPT_VERSION,
      status: ROUND_SCRIPT_STATUS,
      profile: P.id,
      profileVersion: P.version,
      fv: P.fv,
      chainId: "x".repeat(64),
      chainIndex: longest(maxIntText(1, Number.MAX_SAFE_INTEGER)),
      salt: "x".repeat(128),
    },
    secret: {
      outcome: "x".repeat(Math.max("crash".length, "floor".length)),
      crashAt: longest(maxDoubleText(1, 200)),
      diveStartTick: P.bettingTicks,
      exitDiveTick: longest(maxIntText(P.bettingTicks + 1, MAX_EXIT_DIVE_TICK)),
      impactTick: longest(NULL, maxIntText(P.bettingTicks + 1, MAX_EXIT_DIVE_TICK)),
      terminalTick: longest(maxIntText(1, Math.min(ANALYTIC_MAX_TERMINAL_TICK, P.maxTotalTicks))),
      jackpot: longest(NULL, maxDoubleText(50, 500)),
      chests: Array.from({ length: 3 }, () => longest(maxDoubleText(1, 50))), // longer than null
      samples: {
        multiplier: Array.from({ length: ticks }, () => longest(maxDoubleText(1, 200))),
        boost: Array.from({ length: ticks }, () => longest(maxDoubleText(0, 1))),
        worldY: Array.from({ length: ticks }, () => longest(maxDoubleText(0, FLOOR_Y))),
      },
      creatures: Array.from({ length: MAX_CREATURES }, () => ({ ...creature })),
      final: {
        worldY: longest(maxDoubleText(0, FLOOR_Y * 2)),
        boost: longest(maxDoubleText(0, 1)),
        // equals the jackpot (floor) or the crash point (crash)
        multiplier: longest(maxDoubleText(50, 500), maxDoubleText(1, 200)),
        nextSpawnAt: longest(maxDoubleText(0, 1e7)),
        nextCreatureId: longest(maxIntText(1, MAX_CREATURES + 1)),
      },
      drawCounts: {
        crash: longest(maxIntText(1, 2)),
        jackpot: longest(maxIntText(0, 2)),
        chests: longest(maxIntText(0, 6)),
        world: longest(maxIntText(0, 2048)),
      },
    },
  };
}

/** Structure of a value: deepest bracket nesting, widest array / object, container count. */
function shapeOf(value: unknown) {
  const s = { nesting: 0, arrayElements: 0, objectMembers: 0, containers: 0 };
  const walk = (v: unknown, level: number) => {
    if (v === null || typeof v !== "object") return;
    s.containers += 1;
    s.nesting = Math.max(s.nesting, level);
    const children = Array.isArray(v) ? v : Object.values(v as object);
    if (Array.isArray(v)) s.arrayElements = Math.max(s.arrayElements, v.length);
    else s.objectMembers = Math.max(s.objectMembers, children.length);
    for (const c of children) walk(c, level + 1);
  };
  walk(value, 1);
  return s;
}

describe("the byte cap is proved from the validation rules", () => {
  const bound = canonicalJson(upperBoundDocument()).length;

  it("maxDoubleText is an upper bound of String(v) in every validated range", () => {
    // Exhaustive by construction above; here a check against the engine of record: extremes,
    // decade boundaries and 200,000 pseudo-random doubles per range (deterministic LCG).
    let seed = 0x5eed;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const ranges: [number, number][] = [
      [0, 1],
      [0, FLOOR_Y],
      [0, FLOOR_Y + 2000],
      [0, FLOOR_Y * 2],
      [0, 2 * Math.PI],
      [0, 1e7],
      [0.1, 0.9],
      [0.8, 1.4],
      [1, 200],
      [1, 50],
      [50, 500],
    ];
    for (const [lo, hi] of ranges) {
      const bound = maxDoubleText(lo, hi);
      const probes = [
        lo,
        hi,
        5e-324,
        1e-7,
        1e-6 * (1 - Number.EPSILON),
        1e-6,
        1.2345678901234567e-6,
      ];
      for (let i = 0; i < 200_000; i++) {
        const r = next();
        // uniform, and log-uniform over the whole exponent range
        probes.push(lo + r * (hi - lo), Math.max(lo, Math.min(hi, hi * 2 ** (-1074 * next()))));
      }
      let longest = 0;
      let at = 0;
      for (const v of probes) {
        if (v < lo || v > hi) continue;
        const len = String(v).length;
        if (len > longest) [longest, at] = [len, v];
      }
      expect(longest, `[${lo}, ${hi}] at ${at}`).toBeLessThanOrEqual(bound);
    }
    expect(maxDoubleText(0, 1)).toBe(24); // "0.0000012345678901234567"
    // The true maximum is 18 ("199.99999999999997"); the widened exponent range adds n = 0.
    expect(maxDoubleText(1, 200)).toBe(19);
    expect(String(1.2345678901234567e-6)).toHaveLength(24);
  });

  it("every acceptable script is at most the bound, and the bound is below the cap", () => {
    expect(bound).toBeLessThanOrEqual(MAX_ROUND_SCRIPT_BYTES);
    expect(MAX_ROUND_SCRIPT_BYTES).toBe(196_608);
    // The P8-4b-1 review's generated example (143,162 bytes) is below the bound, and so is the
    // longest example constructed here — accepted by the parser.
    const longest = scriptOf(
      longestRunnerOutput(Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
      "ab".repeat(64),
    );
    const bytes = longest.secretCanonicalBytes();
    expect(parseRoundScript(hash, bytes).secretDigest()).toBe(longest.secretDigest());
    expect(bytes.length).toBeGreaterThan(143_162);
    expect(bytes.length).toBeLessThanOrEqual(bound);
  });

  it("the skeleton has exactly the validators' structure (it is a script once filled in)", () => {
    // Same key sets at every level and the same array lengths as an accepted script of the
    // longest dive and the most creatures.
    const real = JSON.parse(
      new TextDecoder().decode(scriptOf(longestRunnerOutput(1), 1).secretCanonicalBytes()),
    );
    const keysOf = (v: unknown): unknown =>
      v === null || typeof v !== "object"
        ? null
        : Array.isArray(v)
          ? [v.length, keysOf(v[0])]
          : Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, keysOf((v as any)[k])]),
            );
    expect(keysOf(upperBoundDocument())).toEqual(keysOf(real));
  });

  it("the prescan bounds are at least the most the validators accept", () => {
    const shape = shapeOf(upperBoundDocument());
    expect(shape).toEqual({ nesting: 4, arrayElements: 1290, objectMembers: 12, containers: 303 });
    const L = ROUND_SCRIPT_SHAPE_LIMITS;
    expect(shape.nesting).toBeLessThanOrEqual(L.maxNesting);
    expect(shape.arrayElements).toBeLessThanOrEqual(L.maxArrayElements);
    expect(shape.objectMembers).toBeLessThanOrEqual(L.maxObjectMembers);
    expect(shape.containers).toBeLessThanOrEqual(L.maxContainers);
    // The canonical depth rule alone (values at depth ≤ 8) allows 9 open brackets.
    expect(L.maxNesting).toBe(CANONICAL_MAX_DEPTH + 1);
    expect(L).toEqual({
      maxNesting: 9,
      maxArrayElements: 1290,
      maxObjectMembers: 16,
      maxContainers: 512,
    });
  });
});

// ---- RoundScriptVerification ----------------------------------------------------------------

const outcome = (run: () => any) => {
  try {
    const s = run();
    return {
      ok: true,
      digest: s.secretDigest(),
      json: canonicalJson({ p: s.public, s: s.secretContent() }),
    };
  } catch (e: any) {
    return { ok: false, name: e?.name, code: e?.code, reason: e?.reason, message: e?.message };
  }
};

/** Runs a verification with `budget`; returns the script and the number of steps it took. */
function sliced(bytes: Uint8Array, budget: number, digest?: string) {
  const v = RoundScriptVerification.begin(hash, bytes, digest);
  let steps = 0;
  for (;;) {
    steps += 1;
    const s = v.step(budget);
    if (s !== null) return { script: s, steps, v };
  }
}

describe("RoundScriptVerification", () => {
  const longest = scriptOf(longestRunnerOutput(7), 7);
  const bytes = longest.secretCanonicalBytes();
  const digest = longest.secretDigest();

  it("returns the same RoundScript for every budget, null before the last step", () => {
    const ref = outcome(() => parseRoundScript(hash, bytes, digest));
    expect(ref.ok).toBe(true);
    for (const budget of [1, 7, 64, 512, Number.POSITIVE_INFINITY]) {
      const { script, steps } = sliced(bytes, budget, digest);
      expect(
        outcome(() => script),
        String(budget),
      ).toEqual(ref);
      expect(script.secretCanonicalBytes()).toEqual(bytes);
      if (budget === Number.POSITIVE_INFINITY) expect(steps).toBe(1);
      else expect(steps, String(budget)).toBeGreaterThan(1);
    }
  });

  it("performs at most `budget` operations per step", () => {
    // With budget 1 every step is one operation: the number of steps is the operation count.
    const total = sliced(bytes, 1).steps;
    // canonical values + container ends, the document, ticks, creatures, tail, freezes, digest
    expect(total).toBeGreaterThan(3 * ANALYTIC_MAX_DIVE_TICKS + 292 * 10);
    for (const budget of [7, 64, 512]) {
      const { steps } = sliced(bytes, budget);
      // no step did more than `budget`, and none did fewer except the last of each phase
      expect(steps, String(budget)).toBeGreaterThanOrEqual(Math.ceil(total / budget));
      expect(steps, String(budget)).toBeLessThanOrEqual(Math.ceil(total / budget) + 7);
    }
    expect(DEFAULT_VERIFICATION_BUDGET).toBe(512);
  });

  it("reports the same errors as parseRoundScript at every budget, then ends", () => {
    const text = new TextDecoder().decode(bytes);
    const cases: [string, Uint8Array, string | undefined][] = [
      ["valid, wrong digest", bytes, "f".repeat(64)],
      [
        "a non-canonical number",
        new TextEncoder().encode(text.replace(":499.99,", ":499.990,")),
        undefined,
      ],
      [
        "an invalid value",
        new TextEncoder().encode(text.replace('"dir":-1', '"dir":-2')),
        undefined,
      ],
      ["a broken tail", bytes.subarray(0, bytes.length - 1), undefined],
    ];
    for (const [name, input, d] of cases) {
      const ref = outcome(() => parseRoundScript(hash, input, d));
      expect(ref.ok, name).toBe(false);
      for (const budget of [1, 7, 64, 512]) {
        let v: RoundScriptVerification | null = null;
        const got = outcome(() => {
          v = RoundScriptVerification.begin(hash, input, d);
          for (;;) {
            const s = v.step(budget);
            if (s !== null) return s;
          }
        });
        expect(got, `${name} @${budget}`).toEqual(ref);
        if (v !== null) {
          expect((v as RoundScriptVerification).state).toBe("failed");
          expect(() => (v as RoundScriptVerification).step()).toThrow(
            "invalid-request: verification-ended",
          );
        }
      }
    }
  });

  it("refuses an invalid budget and a step after completion; cannot be constructed directly", () => {
    const v = RoundScriptVerification.begin(hash, bytes);
    for (const b of [0, -1, Number.NaN, "5" as unknown as number]) {
      expect(() => v.step(b)).toThrow("invalid-request: invalid-budget");
    }
    expect(v.state).toBe("running");
    expect(v.step(Number.POSITIVE_INFINITY)).not.toBeNull();
    expect(v.state).toBe("verified");
    expect(() => v.step()).toThrow("invalid-request: verification-ended");
    const Ctor = RoundScriptVerification as unknown as new (...a: unknown[]) => unknown;
    expect(() => new Ctor(Symbol("x"), hash, bytes, null, undefined)).toThrow("script-invalid");
  });

  it("shows its state only (JSON, String, inspect)", () => {
    const v = RoundScriptVerification.begin(hash, bytes, digest);
    v.step(64);
    const views = [JSON.stringify(v), String(v), inspect(v, { depth: Infinity, showHidden: true })];
    for (const view of views) {
      for (const secret of ["499.99", "anglerfish", digest, "123.4567"]) {
        expect(view).not.toContain(secret);
      }
    }
    expect(JSON.parse(views[0]!)).toEqual({
      verification: "RoundScriptVerification",
      state: "running",
    });
    expect(views[1]).toBe("RoundScriptVerification(running) [redacted secret]");
    expect(Object.isFrozen(v)).toBe(true);
  });
});

describe("private copies: snapshot first, zeroed when not handed to a script", () => {
  const nativeFill = Uint8Array.prototype.fill;
  afterEach(() => {
    Uint8Array.prototype.fill = nativeFill;
  });
  /** Records every Uint8Array zeroed while `run` runs. */
  const zeroedDuring = (run: () => void): Uint8Array[] => {
    const zeroed: Uint8Array[] = [];
    Uint8Array.prototype.fill = function (this: Uint8Array, ...args: any[]) {
      const r = nativeFill.apply(this, args as [number]);
      if (args[0] === 0) zeroed.push(this);
      return r;
    } as typeof nativeFill;
    try {
      run();
    } catch {
      // expected for refusals
    } finally {
      Uint8Array.prototype.fill = nativeFill;
    }
    return zeroed;
  };
  const script = scriptOf(shortFloorOutput(3), 3);
  const bytes = script.secretCanonicalBytes();
  const isZeroCopyOf = (z: Uint8Array, of: Uint8Array) =>
    z !== of && z.length === of.length && z.every((b) => b === 0);

  it("a refused input's copy is zeroed: in the head, in a slice and at the digest", () => {
    const text = new TextDecoder().decode(bytes);
    const head = new TextEncoder().encode(text.replace('"public"', '"publiC"').slice(0, -1) + "]");
    const slice = new TextEncoder().encode(text.replace('"dir":1', '"dir":2'));
    for (const [input, d] of [
      [head, undefined],
      [slice, undefined],
      [bytes, "0".repeat(64)],
    ] as const) {
      const zeroed = zeroedDuring(() => {
        const v = RoundScriptVerification.begin(hash, input, d);
        while (v.step(16) === null);
      });
      expect(zeroed.filter((z) => isZeroCopyOf(z, input))).toHaveLength(1);
      expect(input.some((b) => b !== 0)).toBe(true); // the caller's bytes are not touched
    }
  });

  it("a cancelled verification's copy is zeroed; a completed one is kept by the script", () => {
    let v: RoundScriptVerification | null = null;
    const zeroed = zeroedDuring(() => {
      v = RoundScriptVerification.begin(hash, bytes, script.secretDigest());
      expect(v.step(4)).toBeNull();
      v.cancel();
    });
    expect(zeroed.filter((z) => isZeroCopyOf(z, bytes))).toHaveLength(1);
    expect(v!.state).toBe("cancelled");
    expect(() => v!.step()).toThrow("invalid-request: verification-ended");
    v!.cancel(); // idempotent
    const kept = zeroedDuring(() => {
      parseRoundScript(hash, bytes, script.secretDigest());
    });
    expect(kept).toEqual([]);
  });

  it("the copy reads the indexed bytes, never the input's iterator (no shared buffer needed)", () => {
    // P8-4b-0 validated the indexed bytes but kept `Uint8Array.from(bytes)`, which follows
    // the input's Symbol.iterator: a single-threaded input whose iterator yields other bytes was
    // accepted with kept bytes and a digest that differ from what was validated. The copy now
    // uses the intrinsic %TypedArray%.prototype.set (canonical.ts snapshotBytes).
    const other = scriptOf(shortFloorOutput(4), 4).secretCanonicalBytes();
    const cases: { name: string; input: Uint8Array; calls: { n: number } }[] = [];
    {
      const calls = { n: 0 };
      const input = Uint8Array.from(bytes);
      Object.defineProperty(input, Symbol.iterator, {
        value: function* () {
          calls.n += 1;
          yield* other;
        },
      });
      cases.push({ name: "own Symbol.iterator", input, calls });
    }
    {
      const calls = { n: 0 };
      class Lying extends Uint8Array {
        override [Symbol.iterator]() {
          calls.n += 1;
          return other[Symbol.iterator]();
        }
      }
      const input = new Lying(bytes.length);
      input.set(bytes);
      cases.push({ name: "subclass iterator", input, calls });
    }
    for (const { name, input, calls } of cases) {
      // the input's indexed content is exactly the valid script
      expect(Buffer.from(input.buffer, input.byteOffset, input.length).equals(bytes), name).toBe(
        true,
      );
      // HEAD (the oracle): accepts the indexed content, keeps the iterator's bytes
      calls.n = 0;
      const head = headParse(hash, input);
      expect(calls.n, name).toBe(1);
      expect(head.secretCanonicalBytes(), name).toEqual(other);
      expect(head.secretDigest(), name).not.toBe(script.secretDigest());
      expect(() => headParse(hash, input, script.secretDigest()), name).toThrow(
        "script-digest-mismatch",
      );
      // new: the kept bytes and the digest are the validated ones; the iterator is never read
      for (const budget of [1, 64, Number.POSITIVE_INFINITY]) {
        calls.n = 0;
        const { script: s } = sliced(input, budget, script.secretDigest());
        expect(calls.n, name).toBe(0);
        expect(s.secretCanonicalBytes(), name).toEqual(bytes);
        expect(s.secretDigest(), name).toBe(script.secretDigest());
        expect(outcome(() => s)).toEqual(outcome(() => script));
      }
      calls.n = 0;
      expect(parseRoundScript(hash, input).secretDigest(), name).toBe(script.secretDigest());
      expect(calls.n, name).toBe(0);
    }
  });

  it("an oversized input is refused before any copy or allocation", () => {
    // 64 MiB: a copy, a decode or a parse would show in ArrayBuffer memory or take seconds.
    const big = new Uint8Array(64 * 1024 * 1024).fill(0x5b);
    const before = process.memoryUsage().arrayBuffers;
    const t0 = performance.now();
    expect(outcome(() => parseRoundScript(hash, big))).toMatchObject({
      ok: false,
      code: "script-invalid",
    });
    const ms = performance.now() - t0;
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(1024 * 1024);
    expect(ms).toBeLessThan(50);
    for (const n of [MAX_ROUND_SCRIPT_BYTES + 1, MAX_ROUND_SCRIPT_BYTES]) {
      const at = new Uint8Array(n).fill(0x20); // spaces: never canonical
      expect(outcome(() => parseRoundScript(hash, at))).toMatchObject({
        ok: false,
        code: "script-invalid",
      });
    }
  });
});
