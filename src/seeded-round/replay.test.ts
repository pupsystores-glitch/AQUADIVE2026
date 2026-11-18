// Deterministic replay (P8-3b; owner decisions D-B3, D-B10): identical fixed inputs give
// identical records on a fresh GameEngine, in any order; the records agree with independently
// generated vectors; snapshot/restore is not an RNG rewind.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEngine } from "@/engine";
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  SecretBytes,
  hexToBytes,
  type RoundDerivationInput,
} from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { SeededRound } from "./index";
import { INDEPENDENT_OUTCOME_VECTORS } from "./test/independent-vectors";
import { runReferenceRoundFromInput, type ReferenceRoundRecord } from "./test/reference-runner";
import { REPLAY_RECORD_PINS } from "./test/replay-pins";

type Salt = "A" | "B";
const input = (salt: Salt, index: number): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: index,
  salt: hexToBytes(salt === "A" ? V.saltAHex : V.saltBHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[index])),
});
const run = (salt: Salt, index: number) => runReferenceRoundFromInput(p, input(salt, index));
const ALL: [Salt, number][] = REPLAY_RECORD_PINS.map(([s, j]) => [s, j]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fixed-seed replay", () => {
  it("every pinned round reproduces its canonical record hash", () => {
    for (const [salt, index, sha] of REPLAY_RECORD_PINS) {
      expect(run(salt, index).record.recordSha256, `${salt}${index}`).toBe(sha);
    }
  });

  it("identical inputs give identical complete records and final worlds", () => {
    for (const [salt, index] of ALL) {
      const a = run(salt, index);
      const b = run(salt, index);
      expect(b.record).toEqual(a.record);
      expect(b.finalWorld).toEqual(a.finalWorld);
    }
  });

  it("the order in which rounds are replayed changes nothing", () => {
    const key = (r: ReferenceRoundRecord, s: Salt) => `${s}${r.chainIndex}`;
    const forward = new Map(ALL.map(([s, j]) => [`${s}${j}`, run(s, j).record]));
    const reversed = [...ALL].reverse().map(([s, j]) => [key(run(s, j).record, s), s, j] as const);
    const interleaved = ALL.filter((_, i) => i % 2 === 1).concat(ALL.filter((_, i) => i % 2 === 0));
    for (const [k, s, j] of reversed) expect(run(s, j).record).toEqual(forward.get(k));
    for (const [s, j] of interleaved) expect(run(s, j).record).toEqual(forward.get(`${s}${j}`));
  });

  it("the record hash covers every field: changing one input changes it", () => {
    const a = run("A", 3).record.recordSha256;
    expect(run("B", 3).record.recordSha256).not.toBe(a);
    expect(run("A", 4).record.recordSha256).not.toBe(a);
  });

  it("the seeded execution path never calls Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    for (const [salt, index] of ALL) run(salt, index);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("agreement with independently generated vectors", () => {
  // INDEPENDENT_OUTCOME_VECTORS come from a spec-only implementation that imports nothing from
  // src/ (qa/p8-3b-authority/independent/gen-outcome-vectors.mjs).
  it.each(INDEPENDENT_OUTCOME_VECTORS.map((v) => [`${v.salt}${v.index}`, v] as const))(
    "%s: crash point and crash draw count",
    (_, v) => {
      const { record } = run(v.salt, v.index);
      expect(record.crashAt).toBe(v.crashAt);
      expect(record.drawCounts.crash).toBe(v.crashDraws);
    },
  );

  it("each decision of the authority equals the vector (all three, every round)", () => {
    for (const v of INDEPENDENT_OUTCOME_VECTORS) {
      const round = SeededRound.create(p, input(v.salt, v.index));
      expect(round.authority.sampleCrashPoint()).toBe(v.crashAt);
      expect(round.authority.sampleJackpot()).toBe(v.jackpot);
      expect(round.authority.rollBonusChests().map((c) => c.multiplier)).toEqual(v.chests);
      round.dispose();
    }
  });

  it("floor rounds of the real engine carry the vector's jackpot and chests; crash rounds none", () => {
    let floors = 0;
    for (const v of INDEPENDENT_OUTCOME_VECTORS) {
      const { record } = run(v.salt, v.index);
      if (record.outcome === "floor") {
        floors++;
        expect(record.jackpot).toBe(v.jackpot);
        expect(record.chests).toEqual(v.chests);
        expect(record.terminalMultiplier).toBe(v.jackpot);
      } else {
        expect(record.jackpot).toBeNull();
        expect(record.chests).toBeNull();
        expect(record.terminalMultiplier).toBe(v.crashAt);
      }
    }
    expect(floors).toBeGreaterThan(0);
  });

  it("the first two creatures of every dive match the vector (world draw order)", () => {
    for (const v of INDEPENDENT_OUTCOME_VECTORS) {
      const { finalWorld } = run(v.salt, v.index);
      const first = finalWorld.creatures.slice(0, 2).map(({ consumed: _consumed, ...c }) => c);
      expect(first).toEqual(v.world.creatures);
    }
  });
});

describe("snapshot / restore is not an RNG rewind", () => {
  it("restoring a snapshot leaves the world stream where it was, so the continuation differs", () => {
    const round = SeededRound.create(p, input("B", 3));
    const engine = new GameEngine(round.deps);
    while (engine.state !== "diving") engine.advance(1 / 60);
    for (let i = 0; i < 300; i++) engine.advance(1 / 60);
    const snap = engine.snapshot();
    const drawsAtSnapshot = round.secretDrawCounts().world;

    for (let i = 0; i < 300; i++) engine.advance(1 / 60);
    const first = engine.snapshot().world.creatures;
    const drawsAfterFirst = round.secretDrawCounts().world;

    engine.restore(snap);
    for (let i = 0; i < 300; i++) engine.advance(1 / 60);
    const second = engine.snapshot().world.creatures;

    expect(drawsAfterFirst).toBeGreaterThan(drawsAtSnapshot);
    expect(round.secretDrawCounts().world).toBeGreaterThan(drawsAfterFirst);
    expect(second).not.toEqual(first);
    round.dispose();
  });
});
