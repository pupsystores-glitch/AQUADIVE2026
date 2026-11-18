// Outcome distributions of the SeededRoundAuthority (P8-3b; owner decisions D-B5, D-B6).
//
// 100,000 rounds of the fixed, public P8-3b development chain (test/dev-chain.ts), each with its
// own derivation, take the three outcome decisions; world uniformity uses 100,000 world draws.
// The reference distributions below were derived again from the engine source (read-only,
// src/engine/domain/outcomes.ts at 7124ec9), not copied from earlier analyses:
//
//   crash:   r < 0.03 → 1.00 (one draw); else m = 0.99 / (1 − u), clamped to [1.01, 200].
//            P(1.00) = 0.03; P(1.01) = 0.97 × (1 − 0.99 / 1.01) = 0.019208;
//            P(crash > x) = 0.97 × 0.99 / x = 0.9603 / x for 1.01 ≤ x < 200; P(200) = 0.0048015.
//   jackpot: bands 50 + 50u (p 0.5), 100 + 100u (0.35), 200 + 300u (0.15), rounded to cents;
//            band means 75, 150, 350; overall mean 142.5.
//   chests:  per chest 1 + 2u (p 0.6), 3 + 7u (0.32), 10 + 40u (0.08), rounded to cents;
//            band means 2, 6.5, 30; mean 5.68; three chests per round from one stream.
//
// These match docs/09 §34.2 (P(1.00), P(1.01), the 0.9603 / x tail and the 200 atom).
//
// Rounding to cents (+x.toFixed(2)) moves a value within half a cent of a band edge onto the
// edge itself (e.g. a small chest 1 + 2u ≥ 2.995 shows 3.00): an edge value cannot be assigned to
// a band. `bandModel` derives the exact expected mass of every band interior and every shared
// edge, and the mean of each band's interior, from the band table; nothing is fitted.
// Thresholds: 5 sigma (test/stats.ts). Probabilities are never adjusted to fit a test.
import { beforeAll, describe, expect, it } from "vitest";
import { PURPOSE_DRAW_LIMITS_V1 } from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { SeededRound } from "./index";
import { buildDevChain } from "./test/dev-chain";
import {
  Z_BOUND,
  chiSquare,
  chiSquareCritical,
  chiSquareIndependence,
  mean,
  pearson,
  variance,
  zMean,
  zProportion,
} from "./test/stats";

const N = 100_000;
const WORLD_ROUNDS = 1_000;
const WORLD_DRAWS_PER_ROUND = 100;

interface Sample {
  crash: number;
  crashDraws: number;
  jackpot: number;
  chests: [number, number, number];
}
const samples: Sample[] = [];
const world: number[] = [];
const worldFirst: number[] = [];

beforeAll(() => {
  const chain = buildDevChain(p, N);
  for (let j = 1; j <= N; j++) {
    const round = SeededRound.create(p, chain.input(j));
    const crash = round.authority.sampleCrashPoint();
    const jackpot = round.authority.sampleJackpot();
    const chests = round.authority.rollBonusChests().map((c) => c.multiplier) as Sample["chests"];
    if (j <= WORLD_ROUNDS) {
      for (let k = 0; k < WORLD_DRAWS_PER_ROUND; k++) world.push(round.worldRng.next());
    }
    worldFirst.push(
      j <= WORLD_ROUNDS ? world[(j - 1) * WORLD_DRAWS_PER_ROUND] : round.worldRng.next(),
    );
    samples.push({ crash, crashDraws: round.secretDrawCounts().crash, jackpot, chests });
    round.dispose();
  }
}, 300_000);

const isCents = (v: number) => Math.round(v * 100) / 100 === v;
const expectZ = (z: number, label: string) =>
  expect(Math.abs(z), `${label}: |z| = ${Math.abs(z).toFixed(2)}`).toBeLessThan(Z_BOUND);
/** Number of values violating `ok` (one assertion per test instead of one per value). */
const violations = <T>(values: readonly T[], ok: (v: T) => boolean) =>
  values.reduce((n, v) => (ok(v) ? n : n + 1), 0);

/** A band "start + width · u" taken with probability p, as in the engine's outcome tables. */
interface Band {
  p: number;
  start: number;
  width: number;
}
const HALF_CENT = 0.005;
/**
 * Exact observable model of contiguous bands rounded to cents: for band i, the probability of a
 * value strictly inside (start, start + width) after rounding, and that interior's uniform range;
 * for every shared edge between band i and i + 1, the probability of showing exactly that edge.
 */
function bandModel(bands: readonly Band[]) {
  return bands.map((b, i) => {
    const lowerShared = i > 0;
    const upperShared = i < bands.length - 1;
    const cutLow = lowerShared ? HALF_CENT : 0;
    const cutHigh = upperShared ? HALF_CENT : 0;
    const next = bands[i + 1];
    return {
      interior: b.p * (1 - (cutLow + cutHigh) / b.width),
      lo: b.start + cutLow,
      hi: b.start + b.width - cutHigh,
      upperEdge: upperShared ? b.p * (HALF_CENT / b.width) + next.p * (HALF_CENT / next.width) : 0,
      edgeValue: b.start + b.width,
    };
  });
}
/** Checks band interiors, shared edges and interior means of `values` against `bands`. */
function expectBands(values: readonly number[], bands: readonly Band[], label: string) {
  const n = values.length;
  const model = bandModel(bands);
  model.forEach((m, i) => {
    const above = i === 0 ? -Infinity : bands[i].start; // a shared lower edge is excluded
    const below = m.upperEdge > 0 ? m.edgeValue : Infinity; // a shared upper edge is excluded
    const inside = values.filter((v) => v > above && v < below);
    expectZ(zProportion(inside.length, n, m.interior), `${label} band ${i} share`);
    expectZ(
      zMean(inside, (m.lo + m.hi) / 2, (m.hi - m.lo) / Math.sqrt(12)),
      `${label} band ${i} mean`,
    );
    if (m.upperEdge > 0) {
      const onEdge = values.filter((v) => v === m.edgeValue).length;
      expectZ(zProportion(onEdge, n, m.upperEdge), `${label} edge ${m.edgeValue.toFixed(2)}`);
    }
  });
}
const JACKPOT_BANDS: readonly Band[] = [
  { p: 0.5, start: 50, width: 50 },
  { p: 0.35, start: 100, width: 100 },
  { p: 0.15, start: 200, width: 300 },
];
const CHEST_BANDS: readonly Band[] = [
  { p: 0.6, start: 1, width: 2 },
  { p: 0.32, start: 3, width: 7 },
  { p: 0.08, start: 10, width: 40 },
];

describe(`crash point (${N.toLocaleString("en")} rounds)`, () => {
  it("range: exactly 1.00, or within [1.01, 200]", () => {
    expect(violations(samples, (s) => s.crash === 1 || (s.crash >= 1.01 && s.crash <= 200))).toBe(
      0,
    );
  });

  it("draw-count invariant: one draw iff the crash point is 1.00", () => {
    expect(violations(samples, (s) => s.crashDraws === (s.crash === 1 ? 1 : 2))).toBe(0);
  });

  it("the 1.00 atom (0.03), the 1.01 clamp atom (0.019208) and the 200 clamp atom (0.0048015)", () => {
    const count = (f: (x: number) => boolean) => samples.filter((s) => f(s.crash)).length;
    expectZ(
      zProportion(
        count((x) => x === 1),
        N,
        0.03,
      ),
      "P(1.00)",
    );
    expectZ(
      zProportion(
        count((x) => x === 1.01),
        N,
        0.97 * (1 - 0.99 / 1.01),
      ),
      "P(1.01)",
    );
    expectZ(
      zProportion(
        count((x) => x === 200),
        N,
        (0.97 * 0.99) / 200,
      ),
      "P(200)",
    );
  });

  it.each([1.25, 1.5, 2, 3, 5, 6.62, 10, 20, 50, 100, 199])(
    "tail P(crash > %s) = 0.9603 / x",
    (x) => {
      const count = samples.filter((s) => s.crash > x).length;
      expectZ(zProportion(count, N, 0.9603 / x), `P(> ${x})`);
    },
  );

  it("goodness of fit over 12 bins (chi-square, 11 df)", () => {
    const edges = [1.01, 1.1, 1.25, 1.5, 2, 3, 5, 10, 25, 50, 100, 200];
    const tail = (x: number) => (x >= 200 ? 0 : 0.9603 / x);
    // Bin 0: {1.00}; bins 1 … 11: [e_i, e_(i+1)), the last one closed with the 200 atom.
    const expected = [0.03 * N];
    for (let i = 0; i < edges.length - 1; i++) {
      const upper = i === edges.length - 2 ? 0 : tail(edges[i + 1]);
      const lower = i === 0 ? 0.97 : tail(edges[i]);
      expected.push((lower - upper) * N);
    }
    const observed = new Array(expected.length).fill(0);
    for (const { crash } of samples) {
      if (crash === 1) observed[0]++;
      else {
        let b = edges.length - 2;
        for (let i = 0; i < edges.length - 1; i++) {
          if (crash < edges[i + 1]) {
            b = i;
            break;
          }
        }
        observed[b + 1]++;
      }
    }
    expect(observed.reduce((a, b) => a + b, 0)).toBe(N);
    expect(chiSquare(observed, expected)).toBeLessThan(
      chiSquareCritical(expected.length - 1, Z_BOUND),
    );
  });
});

describe(`jackpot (${N.toLocaleString("en")} rounds)`, () => {
  it("range [50, 500], whole cents", () => {
    expect(
      violations(samples, (s) => s.jackpot >= 50 && s.jackpot <= 500 && isCents(s.jackpot)),
    ).toBe(0);
  });

  it("bands 0.5 / 0.35 / 0.15, the 100.00 / 200.00 edges, uniform values inside each band", () => {
    expectBands(
      samples.map((s) => s.jackpot),
      JACKPOT_BANDS,
      "jackpot",
    );
  });

  it("overall mean 142.5", () => {
    // Var = E[X²] − 142.5², E[X²] = Σ p (a² + a w + w²/3) over the bands (a = start, w = width).
    const ex2 =
      0.5 * (50 ** 2 + 50 * 50 + 50 ** 2 / 3) +
      0.35 * (100 ** 2 + 100 * 100 + 100 ** 2 / 3) +
      0.15 * (200 ** 2 + 200 * 300 + 300 ** 2 / 3);
    expectZ(
      zMean(
        samples.map((s) => s.jackpot),
        142.5,
        Math.sqrt(ex2 - 142.5 ** 2),
      ),
      "mean",
    );
  });
});

describe(`bonus chests (${N.toLocaleString("en")} rounds, ${(3 * N).toLocaleString("en")} chests)`, () => {
  const all = () => samples.flatMap((s) => s.chests);

  it("range [1, 50], whole cents", () => {
    expect(violations(all(), (c) => c >= 1 && c <= 50 && isCents(c))).toBe(0);
  });

  it.each([0, 1, 2])(
    "chest %i: bands 0.6 / 0.32 / 0.08, the 3.00 / 10.00 edges, band means",
    (i) => {
      expectBands(
        samples.map((s) => s.chests[i]),
        CHEST_BANDS,
        `chest ${i}`,
      );
    },
  );

  it("overall chest mean 5.68", () => {
    const ex2 =
      0.6 * (1 + 1 * 2 + 4 / 3) + 0.32 * (9 + 3 * 7 + 49 / 3) + 0.08 * (100 + 10 * 40 + 1600 / 3);
    const values = all();
    // The three chests of a round are independent draws, so the 3N values are i.i.d.
    expectZ(zMean(values, 5.68, Math.sqrt(ex2 - 5.68 ** 2)), "mean");
  });

  it("the three chests of a round are independent of each other", () => {
    const band = (x: number) => (x < 3 ? 0 : x < 10 ? 1 : 2);
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [0, 2],
    ] as const) {
      const table = [0, 1, 2].map(() => [0, 0, 0]);
      for (const s of samples) table[band(s.chests[a])][band(s.chests[b])]++;
      const { stat, df } = chiSquareIndependence(table);
      expect(stat, `chests ${a}/${b}`).toBeLessThan(chiSquareCritical(df, Z_BOUND));
      expect(
        Math.abs(
          pearson(
            samples.map((s) => s.chests[a]),
            samples.map((s) => s.chests[b]),
          ),
        ),
      ).toBeLessThan(Z_BOUND / Math.sqrt(N));
    }
  });
});

describe(`world stream uniformity (${(WORLD_ROUNDS * WORLD_DRAWS_PER_ROUND).toLocaleString("en")} draws)`, () => {
  it("every value is an exact multiple of 2^-52 in [0, 1)", () => {
    expect(violations(world, (u) => u >= 0 && u < 1 && Number.isInteger(u * 2 ** 52))).toBe(0);
  });

  it("chi-square over 100 equal bins, mean 1/2 and variance 1/12", () => {
    const bins = new Array(100).fill(0);
    for (const u of world) bins[Math.floor(u * 100)]++;
    const expected = new Array(100).fill(world.length / 100);
    expect(chiSquare(bins, expected)).toBeLessThan(chiSquareCritical(99, Z_BOUND));
    expectZ(zMean(world, 0.5, Math.sqrt(1 / 12)), "mean");
    // Var of the sample variance of U(0,1): (1/80 − 1/144) / n.
    const sdVar = Math.sqrt((1 / 80 - 1 / 144) / world.length);
    expectZ((variance(world) - 1 / 12) / sdVar, "variance");
  });

  it("each of the four words of a block is uniform (draw index mod 4)", () => {
    for (let w = 0; w < 4; w++) {
      const lane = world.filter((_, i) => (i % WORLD_DRAWS_PER_ROUND) % 4 === w);
      expectZ(zMean(lane, 0.5, Math.sqrt(1 / 12)), `word ${w}`);
    }
  });

  it("consecutive draws are uncorrelated (lag 1 and lag 4)", () => {
    for (const lag of [1, 4]) {
      const a: number[] = [];
      const b: number[] = [];
      for (let r = 0; r < WORLD_ROUNDS; r++) {
        for (let k = 0; k + lag < WORLD_DRAWS_PER_ROUND; k++) {
          a.push(world[r * WORLD_DRAWS_PER_ROUND + k]);
          b.push(world[r * WORLD_DRAWS_PER_ROUND + k + lag]);
        }
      }
      expect(Math.abs(pearson(a, b)), `lag ${lag}`).toBeLessThan(Z_BOUND / Math.sqrt(a.length));
    }
  });

  it("the world limit stays the documented fv = 1 value", () => {
    expect(PURPOSE_DRAW_LIMITS_V1.world).toBe(2048);
  });
});

describe("purpose independence across rounds", () => {
  const crashHigh = () => samples.map((s) => (s.crash >= 2 ? 1 : 0));
  const jackpotBand = () => samples.map((s) => (s.jackpot < 100 ? 0 : s.jackpot < 200 ? 1 : 2));
  const chestBand = () => samples.map((s) => (s.chests[0] < 3 ? 0 : s.chests[0] < 10 ? 1 : 2));
  const worldHalf = () => worldFirst.map((u) => (u < 0.5 ? 0 : 1));
  const table = (a: number[], b: number[], ra: number, rb: number) => {
    const t = Array.from({ length: ra }, () => new Array(rb).fill(0));
    for (let i = 0; i < a.length; i++) t[a[i]][b[i]]++;
    return t;
  };

  it.each([
    ["crash ≥ 2 × jackpot band", () => table(crashHigh(), jackpotBand(), 2, 3)],
    ["crash ≥ 2 × chest band", () => table(crashHigh(), chestBand(), 2, 3)],
    ["jackpot band × chest band", () => table(jackpotBand(), chestBand(), 3, 3)],
    ["crash ≥ 2 × first world draw < 1/2", () => table(crashHigh(), worldHalf(), 2, 2)],
    ["jackpot band × first world draw < 1/2", () => table(jackpotBand(), worldHalf(), 3, 2)],
  ] as const)("%s (chi-square independence)", (_, make) => {
    const { stat, df } = chiSquareIndependence(make());
    expect(stat).toBeLessThan(chiSquareCritical(df, Z_BOUND));
  });

  it("a crash point's 1-or-2 draws never shift the jackpot (per-purpose counters)", () => {
    // Rounds whose crash used one draw have the same jackpot distribution as the others.
    const one = samples.filter((s) => s.crashDraws === 1).map((s) => s.jackpot);
    const two = samples.filter((s) => s.crashDraws === 2).map((s) => s.jackpot);
    expect(one.length).toBeGreaterThan(2_000);
    const sd = Math.sqrt(variance(samples.map((s) => s.jackpot)));
    const z = (mean(one) - mean(two)) / (sd * Math.sqrt(1 / one.length + 1 / two.length));
    expectZ(z, "jackpot mean, 1-draw vs 2-draw crash rounds");
  });
});
