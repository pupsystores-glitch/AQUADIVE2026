// RNG draw-order detection (P8-3b; owner decision D-B5): the independent vectors are sensitive to
// every plausible wiring or ordering mistake. Each test builds a deliberately WRONG binding from
// the same fv streams and shows that it no longer reproduces the vectors, while the real binding
// does (replay.test.ts).
import { describe, expect, it } from "vitest";
import { GameEngine, LocalRoundAuthority, type Rng } from "@/engine";
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  RoundDerivation,
  SecretBytes,
  hexToBytes,
  type FairnessPurpose,
  type RoundDerivationInput,
} from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { SeededRound } from "./index";
import {
  INDEPENDENT_OUTCOME_VECTORS as VECTORS,
  type IndependentOutcomeVector,
} from "./test/independent-vectors";

const input = (v: IndependentOutcomeVector): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: v.index,
  salt: hexToBytes(v.salt === "A" ? V.saltAHex : V.saltBHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[v.index])),
});
const streamOf = (v: IndependentOutcomeVector, purpose: FairnessPurpose): Rng =>
  RoundDerivation.create(p, input(v)).openStream(purpose);

/** Draws a stream in blocks of four with the words of each block in reverse order. */
function reversedWords(rng: Rng): Rng {
  let buffer: number[] = [];
  return {
    next: () => {
      if (buffer.length === 0) buffer = [rng.next(), rng.next(), rng.next(), rng.next()].reverse();
      return buffer.shift() as number;
    },
  };
}
/** Skips the first `n` values. */
function offset(rng: Rng, n: number): Rng {
  for (let i = 0; i < n; i++) rng.next();
  return rng;
}

/** How many vectors a wrongly wired authority still matches (crash, jackpot, chests all equal). */
function matches(
  wrong: (v: IndependentOutcomeVector) => {
    crash: () => number;
    jackpot: () => number;
    chests: () => number[];
  },
): number {
  let n = 0;
  for (const v of VECTORS) {
    const w = wrong(v);
    let crash: number, jackpot: number, chests: number[];
    try {
      crash = w.crash();
      jackpot = w.jackpot();
      chests = w.chests();
    } catch {
      continue; // e.g. a shared stream exhausted early: certainly not a match
    }
    if (
      crash === v.crashAt &&
      jackpot === v.jackpot &&
      JSON.stringify(chests) === JSON.stringify(v.chests)
    ) {
      n++;
    }
  }
  return n;
}
const local = (rng: Rng) => new LocalRoundAuthority(rng);

describe("the real binding matches every vector", () => {
  it("control", () => {
    expect(
      matches((v) => {
        const r = SeededRound.create(p, input(v));
        return {
          crash: () => r.authority.sampleCrashPoint(),
          jackpot: () => r.authority.sampleJackpot(),
          chests: () => r.authority.rollBonusChests().map((c) => c.multiplier),
        };
      }),
    ).toBe(VECTORS.length);
  });
});

describe("negative: wrong wiring or ordering is detected", () => {
  const swaps: [string, FairnessPurpose, FairnessPurpose, FairnessPurpose][] = [
    ["crash ↔ jackpot", "jackpot", "crash", "chests"],
    ["jackpot ↔ chests", "crash", "chests", "jackpot"],
    ["crash ↔ chests", "chests", "jackpot", "crash"],
    ["crash from world", "world", "jackpot", "chests"],
  ];
  it.each(swaps)("purpose streams swapped: %s", (_, c, j, ch) => {
    expect(
      matches((v) => ({
        crash: () => local(streamOf(v, c)).sampleCrashPoint(),
        jackpot: () => local(streamOf(v, j)).sampleJackpot(),
        chests: () =>
          local(streamOf(v, ch))
            .rollBonusChests()
            .map((x) => x.multiplier),
      })),
    ).toBe(0);
  });

  it("one shared sequential outcome stream (the pre-P8-3a design) shifts jackpot and chests", () => {
    // Before per-purpose counters, crash's 1-or-2 draws moved every later outcome draw.
    expect(
      matches((v) => {
        const shared = local(streamOf(v, "world"));
        return {
          crash: () => shared.sampleCrashPoint(),
          jackpot: () => shared.sampleJackpot(),
          chests: () => shared.rollBonusChests().map((x) => x.multiplier),
        };
      }),
    ).toBe(0);
  });

  it("words of a block read in the wrong order", () => {
    expect(
      matches((v) => ({
        crash: () => local(reversedWords(streamOf(v, "crash"))).sampleCrashPoint(),
        jackpot: () => local(reversedWords(streamOf(v, "jackpot"))).sampleJackpot(),
        chests: () =>
          local(reversedWords(streamOf(v, "chests")))
            .rollBonusChests()
            .map((x) => x.multiplier),
      })),
    ).toBe(0);
  });

  it("a stream that starts one draw late", () => {
    expect(
      matches((v) => ({
        crash: () => local(streamOf(v, "crash")).sampleCrashPoint(),
        jackpot: () => local(offset(streamOf(v, "jackpot"), 1)).sampleJackpot(),
        chests: () =>
          local(streamOf(v, "chests"))
            .rollBonusChests()
            .map((x) => x.multiplier),
      })),
    ).toBe(0);
  });

  it("world draws in the wrong order change the first creatures of the dive", () => {
    const firstCreatures = (v: IndependentOutcomeVector, worldRng: Rng) => {
      const round = SeededRound.create(p, input(v));
      const engine = new GameEngine({ authority: round.authority, worldRng });
      while (engine.state !== "diving") engine.advance(1 / 60);
      engine.advance(1 / 60);
      return engine
        .snapshot()
        .world.creatures.slice(0, 2)
        .map(({ consumed: _consumed, ...c }) => c);
    };
    for (const v of VECTORS) {
      expect(firstCreatures(v, streamOf(v, "world"))).toEqual(v.world.creatures);
      expect(firstCreatures(v, offset(streamOf(v, "world"), 1))).not.toEqual(v.world.creatures);
      expect(firstCreatures(v, reversedWords(streamOf(v, "world")))).not.toEqual(v.world.creatures);
      // An outcome stream wired in as the world stream runs into its hard limit at once.
      expect(() => firstCreatures(v, streamOf(v, "chests"))).toThrowError(/draw-limit-exceeded/);
    }
  });
});
