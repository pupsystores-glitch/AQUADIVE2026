// Representative full-engine regression suite (P8-3b; owner decisions D-B3, D-B5, D-B6).
//
// 600 reference rounds of the fixed, public P8-3b development chain on a fresh real GameEngine
// each. Exact invariants are checked on every round; frequencies only coarsely (the 100,000- and
// 1,000,000-round full-engine analyses run separately as QA, qa/p8-3b-authority/, docs/15).
//
// Engine facts used here, re-derived from the source at 7124ec9 (read-only):
//   - betting lasts BETTING_WINDOW_SECONDS = 5 s = 300 ticks, so the dive starts on tick 300;
//   - a 1.00 crash ends on the first diving tick (m(1/60) ≈ 1.0014 ≥ 1.00);
//   - the chests are revealed SHIP_IMPACT_TO_CHESTS_MS = 1,400 ms = 84 ticks after impact;
//   - each creature costs exactly 7 world draws (6 attributes + 1 spawn jitter), none outside a dive;
//   - a goldfish is consumed iff the anchor tip (worldY + ANCHOR_WORLD_OFFSET_PX) comes within
//     COLLISION_DY_PX of it while |x − 0.5| < COLLISION_DX_FRAC; per tick the anchor moves less
//     than 2 × COLLISION_DY_PX, so it cannot skip a goldfish on its line;
//   - the highest multiplier a dive can reach is below 6.62 (docs/09 §34.2: 6.614321), so a
//     crash point ≥ 6.62 always reaches the floor.
import { beforeAll, describe, expect, it } from "vitest";
import {
  BETTING_WINDOW_SECONDS,
  COLLISION_DX_FRAC,
  COLLISION_DY_PX,
  SHIP_IMPACT_TO_CHESTS_MS,
} from "@/engine";
import { PURPOSE_DRAW_LIMITS_V1 } from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { ANCHOR_WORLD_OFFSET_PX, CHAIN_MAX_DEPTH } from "@/shared/world";
import { buildDevChain } from "./test/dev-chain";
import { runReferenceRoundFromInput, type ReferenceRoundResult } from "./test/reference-runner";
import { Z_BOUND, zProportion } from "./test/stats";

const ROUNDS = 600;
const TICKS_PER_SECOND = 60;
const results: ReferenceRoundResult[] = [];
const chain = buildDevChain(p, ROUNDS);

beforeAll(() => {
  for (let j = 1; j <= ROUNDS; j++) results.push(runReferenceRoundFromInput(p, chain.input(j)));
}, 120_000);

const records = () => results.map((r) => r.record);
const violations = <T>(values: readonly T[], ok: (v: T) => boolean) =>
  values.filter((v) => !ok(v)).length;

describe(`${ROUNDS} reference rounds on the real engine: exact invariants`, () => {
  it("every round reaches exactly one terminal milestone", () => {
    expect(violations(records(), (r) => r.outcome === "crash" || r.outcome === "floor")).toBe(0);
  });

  it("the dive starts after the betting window, on tick 300", () => {
    const start = BETTING_WINDOW_SECONDS * TICKS_PER_SECOND;
    expect(violations(records(), (r) => r.diveStartTick === start)).toBe(0);
  });

  it("draw counts: crash 1 iff 1.00; jackpot 2 and chests 6 iff floor; world 7 per creature", () => {
    expect(
      violations(
        records(),
        (r) =>
          r.drawCounts.crash === (r.crashAt === 1 ? 1 : 2) &&
          r.drawCounts.jackpot === (r.outcome === "floor" ? 2 : 0) &&
          r.drawCounts.chests === (r.outcome === "floor" ? 6 : 0) &&
          r.drawCounts.world === 7 * r.creaturesSpawned &&
          r.drawCounts.world < PURPOSE_DRAW_LIMITS_V1.world,
      ),
    ).toBe(0);
  });

  it("crash rounds end at the crash point; a 1.00 crash ends on the first diving tick", () => {
    const crashes = records().filter((r) => r.outcome === "crash");
    expect(
      violations(
        crashes,
        (r) =>
          r.terminalMultiplier === r.crashAt &&
          r.impactTick === null &&
          r.jackpot === null &&
          r.chests === null &&
          r.terminalTick > r.diveStartTick &&
          r.world.worldY < CHAIN_MAX_DEPTH &&
          r.crashAt < 6.62,
      ),
    ).toBe(0);
    const ones = crashes.filter((r) => r.crashAt === 1);
    expect(ones.length).toBeGreaterThan(0);
    expect(violations(ones, (r) => r.terminalTick === r.diveStartTick + 1)).toBe(0);
  });

  it("floor rounds: the jackpot locks at impact; the chests follow 84 ticks later", () => {
    const delay = Math.round((SHIP_IMPACT_TO_CHESTS_MS / 1000) * TICKS_PER_SECOND);
    expect(delay).toBe(84);
    const floors = records().filter((r) => r.outcome === "floor");
    expect(
      violations(
        floors,
        (r) =>
          r.impactTick !== null &&
          r.terminalTick === r.impactTick + delay &&
          r.terminalMultiplier === r.jackpot &&
          r.chests !== null &&
          r.world.worldY >= CHAIN_MAX_DEPTH &&
          r.crashAt > 1.01,
      ),
    ).toBe(0);
  });

  it("a crash point of 6.62 or more always reaches the floor", () => {
    expect(violations(records(), (r) => r.crashAt < 6.62 || r.outcome === "floor")).toBe(0);
  });

  it("goldfish collisions: consumed only on the anchor line, and never skipped", () => {
    let consumed = 0;
    for (const { record: r } of results) {
      const anchorTip = r.world.worldY + ANCHOR_WORLD_OFFSET_PX;
      for (const g of r.goldfish) {
        const onLine = Math.abs(g.x - 0.5) < COLLISION_DX_FRAC;
        if (g.consumedTick !== null) {
          consumed++;
          expect(onLine).toBe(true);
          expect(g.consumedTick).toBeGreaterThan(r.diveStartTick);
          expect(g.consumedTick).toBeLessThanOrEqual(r.terminalTick);
        } else if (onLine) {
          // An unconsumed goldfish on the line must still be ahead of (or level with) the tip.
          expect(anchorTip).toBeLessThan(g.worldY + COLLISION_DY_PX);
        }
      }
    }
    expect(consumed).toBeGreaterThan(0);
  });

  it("the record's goldfish are exactly the goldfish of the final world", () => {
    for (const { record, finalWorld } of results) {
      const fromWorld = finalWorld.creatures
        .filter((c) => c.kind === "goldfish")
        .map((c) => [c.id, c.consumed === true]);
      expect(record.goldfish.map((g) => [g.id, g.consumedTick !== null])).toEqual(fromWorld);
    }
  });
});

describe(`${ROUNDS} reference rounds: coarse frequencies (5 sigma)`, () => {
  it("goldfish are 4 % of creatures, and 45 % of goldfish lie on the anchor line", () => {
    let creatures = 0;
    let goldfish = 0;
    let onLine = 0;
    for (const { finalWorld } of results) {
      creatures += finalWorld.creatures.length;
      for (const c of finalWorld.creatures) {
        if (c.kind !== "goldfish") continue;
        goldfish++;
        if (Math.abs(c.x - 0.5) < COLLISION_DX_FRAC) onLine++;
      }
    }
    expect(Math.abs(zProportion(goldfish, creatures, 0.04))).toBeLessThan(Z_BOUND);
    // x = 0.1 + 0.8u, so P(|x − 0.5| < 0.18) = 0.36 / 0.8 = 0.45.
    expect(Math.abs(zProportion(onLine, goldfish, 0.45))).toBeLessThan(Z_BOUND);
  });

  it("the floor is reached in about 16 % of rounds (reference 0.1612; QA measures it precisely)", () => {
    const floors = records().filter((r) => r.outcome === "floor").length;
    expect(Math.abs(zProportion(floors, ROUNDS, 0.161239))).toBeLessThan(Z_BOUND);
  });
});
