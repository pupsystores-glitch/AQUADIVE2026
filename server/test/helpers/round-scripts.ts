// TEST ONLY (P8-4b-1): synthetic runner outputs that the P8-4a validators accept, for the size
// bound, prescan, race and differential tests. They follow the validation rules, not the physics:
// real rounds come from the compiled engine (verify-probe.cjs).
import { ANALYTIC_MAX_DIVE_TICKS } from "../../src/round/round-script";

const BETTING = 300;
const IMPACT_TO_BONUS = 84;

/** A strictly increasing run of doubles whose shortest text is long: base + i·step. */
const series = (n: number, first: number, base: number, step: number): number[] =>
  Array.from({ length: n }, (_, i) => (i === 0 ? first : base + i * step));

/**
 * The longest runner output found by construction: the longest dive (1,290 ticks), the most
 * creatures the world draw limit allows (292), and every number near its longest text form —
 * 17 significant digits; values below 1 in [1e-6, 1e-5), whose text is "0.00000…" (24 chars).
 * An EXAMPLE (a lower bound of the maximum), not the proof: round-script.test.ts derives the
 * upper bound from the validation rules.
 */
export function longestRunnerOutput(chainIndex: number) {
  const n = ANALYTIC_MAX_DIVE_TICKS;
  const creatures = Math.floor(2048 / 7);
  const exitDiveTick = BETTING + n;
  return {
    profile: "aquadive-offline-round-runner",
    profileVersion: 1,
    fv: 1,
    chainIndex,
    outcome: "floor",
    crashAt: 199.99999999999997,
    diveStartTick: BETTING,
    exitDiveTick,
    impactTick: exitDiveTick,
    terminalTick: exitDiveTick + IMPACT_TO_BONUS,
    jackpot: 499.99,
    chests: [49.99, 49.99, 49.99],
    samples: {
      multiplier: series(n, 1, 123.45678901234568, 1.1e-12),
      boost: series(n, 0, 1.2345678901234567e-6, 3.3e-21),
      worldY: series(n, 0, 1.2345678901234567e-6, 3.3e-21),
    },
    creatures: Array.from({ length: creatures }, (_, i) => ({
      id: i + 1,
      kind: "anglerfish",
      x: 0.12345678901234568,
      worldY: 1.2345678901234567e-6 + i * 3.3e-21,
      size: 0.8234567890123456,
      phase: 1.2345678901234567e-6 + i * 3.3e-21,
      dir: -1,
      spawnTick: 1000 + i,
      consumedTick: null,
    })),
    final: {
      worldY: 4234.567890123457,
      boost: 1.2345678901234567e-6,
      multiplier: 499.99,
      nextSpawnAt: 1.2345678901234567e-6,
      nextCreatureId: creatures + 1,
    },
    drawCounts: { crash: 2, jackpot: 2, chests: 6, world: 7 * creatures },
  };
}

/** A short floor-shaped round (40 dive ticks, one consumed goldfish). */
export function shortFloorOutput(chainIndex: number) {
  const n = 40;
  return {
    profile: "aquadive-offline-round-runner",
    profileVersion: 1,
    fv: 1,
    chainIndex,
    outcome: "floor",
    crashAt: 28.5,
    diveStartTick: BETTING,
    exitDiveTick: BETTING + n,
    impactTick: BETTING + n,
    terminalTick: BETTING + n + IMPACT_TO_BONUS,
    jackpot: 51.71,
    chests: [1.88, 2.11, 8.74],
    samples: {
      multiplier: Array.from({ length: n }, (_, i) => 1 + i / 100),
      boost: Array.from({ length: n }, (_, i): number => (i === 10 ? 0.8 : 0)),
      worldY: Array.from({ length: n }, (_, i) => i * 100),
    },
    creatures: [
      {
        id: 1,
        kind: "goldfish",
        x: 0.5,
        worldY: 320,
        size: 1,
        phase: 1,
        dir: 1,
        spawnTick: 301,
        consumedTick: 310,
      },
    ],
    final: { worldY: 4210, boost: 0.5, multiplier: 51.71, nextSpawnAt: 4500, nextCreatureId: 2 },
    drawCounts: { crash: 2, jackpot: 2, chests: 6, world: 7 },
  };
}
