// snapshot()/restore() tests (Sprint 3, Commit E6; docs/06 §14): the §14
// invariants — plain serializable data, no aliasing of live state,
// projections correct from the first restored frame, and determinism
// restated on snapshots: restore(s) + identical commands + identical RNG ⇒
// identical subsequent snapshots. The world Rng here is a constant stream,
// so stream *position* is irrelevant (§14's RNG-position field only exists
// in seeded mode, which lands with Phase 8).
import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "./clock";
import { GameEngine, SNAPSHOT_SCHEMA_VERSION } from "./game-engine";
import type { RoundAuthority } from "./round-authority";

const stubAuthority = (crashPoint: number): RoundAuthority => ({
  sampleCrashPoint: () => crashPoint,
  sampleJackpot: () => 120,
  rollBonusChests: () => [
    { id: 0, multiplier: 2, opened: false },
    { id: 1, multiplier: 6.5, opened: false },
    { id: 2, multiplier: 30, opened: false },
  ],
});

const makeEngine = (crashPoint = 1e9) =>
  new GameEngine({ authority: stubAuthority(crashPoint), worldRng: { next: () => 0.5 } });

const BETTING_TICKS = 300;

const advanceTicks = (engine: GameEngine, n: number) => {
  for (let i = 0; i < n; i++) engine.advance(TICK_SECONDS);
};

describe("EngineSnapshot — §14 model", () => {
  it("round-trips: restore(snapshot()) reproduces the state, the projections and the re-snapshot", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 25 });
    advanceTicks(a, BETTING_TICKS + 100); // mid-dive, participant riding

    const s = a.snapshot();
    const b = makeEngine();
    b.restore(s);

    expect(b.tickCount).toBe(a.tickCount);
    expect(b.state).toBe("diving");
    expect(b.snapshot()).toEqual(s);
    // §14: projections are pure functions of (snapshot, simTime) — the
    // first restored frame is correct by construction.
    expect(b.getRenderState()).toEqual(a.getRenderState());
    expect(b.getPublicState()).toEqual(a.getPublicState());
  });

  it("is plain JSON-serializable data: a JSON round-trip is lossless", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceTicks(a, BETTING_TICKS + 200);
    const s = a.snapshot();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("never aliases live engine state: snapshot and restore both deep-copy", () => {
    const a = makeEngine();
    advanceTicks(a, BETTING_TICKS + 200); // creatures exist
    const s = a.snapshot();
    expect(s.world.creatures.length).toBeGreaterThan(0);

    // Mutating the snapshot must not reach the engine that produced it…
    const originalX = a.getRenderState().creatures[0].x;
    s.world.creatures[0].x = -1;
    expect(a.getRenderState().creatures[0].x).toBe(originalX);

    // …nor an engine that restored from it.
    const b = makeEngine();
    b.restore(s);
    s.world.creatures[0].x = -2;
    s.world.worldY = 0;
    expect(b.getRenderState().creatures[0].x).toBe(-1); // value at restore time
    expect(b.getRenderState().worldY).toBe(a.getRenderState().worldY);
  });

  it("continues the identical timeline: restore + identical commands + identical RNG (§14 determinism)", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceTicks(a, BETTING_TICKS + 50);

    const b = makeEngine();
    b.restore(a.snapshot());

    // Identical subsequent inputs on both engines: cash out, ride to the
    // sea floor, through impact and bonus, pick a chest, next round opens.
    a.submit({ type: "cashOut", slot: 0 });
    b.submit({ type: "cashOut", slot: 0 });
    for (let i = 0; i < 5000 && a.state === "diving"; i++) {
      a.advance(TICK_SECONDS);
      b.advance(TICK_SECONDS);
    }
    expect(a.state).toBe("impact");
    expect(b.snapshot()).toEqual(a.snapshot());

    advanceTicks(a, 84);
    advanceTicks(b, 84);
    expect(a.state).toBe("bonus");
    a.submit({ type: "pickChest", chestId: 1 });
    b.submit({ type: "pickChest", chestId: 1 });
    advanceTicks(a, 1 + 132);
    advanceTicks(b, 1 + 132);
    expect(a.state).toBe("betting");
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it("discards pending commands and accumulated wall time on restore", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceTicks(a, BETTING_TICKS + 10); // diving, participant riding
    const s = a.snapshot();

    const cashouts: unknown[] = [];
    a.events.on("cashedOut", (p) => cashouts.push(p));
    a.submit({ type: "cashOut", slot: 0 }); // queued on the abandoned timeline
    a.advance(0.9 * TICK_SECONDS); // sub-tick wall time accumulated
    a.restore(s);

    // Had the 0.9-tick remainder survived the restore, this half-tick
    // advance would cross a boundary and consume a phantom tick.
    a.advance(0.5 * TICK_SECONDS);
    expect(a.tickCount).toBe(s.tickCount);

    advanceTicks(a, 5);
    expect(cashouts).toEqual([]); // the queued command died with the timeline
    expect(a.getPublicState().participants[0]?.cashedOut).toBe(false);
  });

  // E-X1 (docs/06 §5): bonus eligibility rides the participant slice and the
  // pick window rides the single pending timer, so a restore mid-bonus
  // continues the identical deterministic completion.
  it("E-X1: restore mid pick-window continues to the identical auto-pick and round end", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 10 });
    for (let i = 0; i < 10000 && a.state !== "bonus"; i++) a.advance(TICK_SECONDS);
    expect(a.state).toBe("bonus");
    advanceTicks(a, 100);

    const s = a.snapshot();
    expect(s.round.participants[0]?.bonusEligible).toBe(true);
    expect(s.round.timerTicks).toBe(360 - 100);
    expect(s.round.chosenChestId).toBeNull();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);

    const b = makeEngine();
    b.restore(JSON.parse(JSON.stringify(s)));
    const picksA: unknown[] = [];
    const picksB: unknown[] = [];
    a.events.on("chestPicked", (p) => picksA.push(p));
    b.events.on("chestPicked", (p) => picksB.push(p));

    advanceTicks(a, 260);
    advanceTicks(b, 260);
    const expected = [{ roundId: 1, chestId: 0, chestMultiplier: 2, finalMultiplier: 240 }];
    expect(picksA).toEqual(expected);
    expect(picksB).toEqual(expected);
    expect(b.snapshot()).toEqual(a.snapshot());

    advanceTicks(a, 132);
    advanceTicks(b, 132);
    expect(a.state).toBe("betting");
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it("E-X1: restore mid-bonus for an ineligible participant completes without a chestPicked", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceTicks(a, BETTING_TICKS + 30);
    a.submit({ type: "cashOut", slot: 0 });
    for (let i = 0; i < 10000 && a.state !== "bonus"; i++) a.advance(TICK_SECONDS);
    advanceTicks(a, 50);

    const s = a.snapshot();
    expect(s.round.participants[0]?.bonusEligible).toBe(false);
    expect(s.round.timerTicks).toBe(132 - 50);

    const b = makeEngine();
    b.restore(s);
    const picks: unknown[] = [];
    b.events.on("chestPicked", (p) => picks.push(p));
    advanceTicks(b, 81);
    expect(b.state).toBe("bonus");
    advanceTicks(b, 1);
    expect(b.state).toBe("betting");
    expect(picks).toEqual([]);
  });

  it("E-X1: the participant shape change bumped the schema; a v1 snapshot is rejected", () => {
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(3);
    const a = makeEngine();
    const before = a.snapshot();
    const errors: unknown[] = [];
    a.events.on("engineError", (p) => errors.push(p));
    a.restore({ ...before, schemaVersion: 1 });
    advanceTicks(a, 1);
    expect(errors).toEqual([
      { roundId: 1, code: "snapshot-schema-mismatch", detail: { schemaVersion: 1 } },
    ]);
  });

  it("E-X3: the per-slot participants shape bumped the schema to 3; a v2 (single-participant) snapshot is rejected, state untouched", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 1, amount: 7 });
    advanceTicks(a, 10);
    const before = a.snapshot();
    expect(before.round.participants).toEqual([
      null,
      { betAmount: 7, cashedOut: false, cashedOutAt: null, bonusEligible: false },
    ]);
    const errors: unknown[] = [];
    a.events.on("engineError", (p) => errors.push(p));
    const { participants: _p, ...round } = before.round;
    const v2 = {
      ...before,
      schemaVersion: 2,
      round: { ...round, participant: before.round.participants[1] },
    } as unknown as typeof before;
    a.restore(v2);
    expect(a.snapshot()).toEqual(before);
    advanceTicks(a, 1);
    expect(errors).toEqual([
      { roundId: 1, code: "snapshot-schema-mismatch", detail: { schemaVersion: 2 } },
    ]);
  });

  it("E-X3: both slots round-trip through snapshot/restore without aliasing", () => {
    const a = makeEngine();
    a.submit({ type: "placeBet", slot: 0, amount: 3 });
    a.submit({ type: "placeBet", slot: 1, amount: 4 });
    advanceTicks(a, BETTING_TICKS + 10);
    a.submit({ type: "cashOut", slot: 1 });
    advanceTicks(a, 1);
    const s = a.snapshot();
    expect(s.round.participants[0]).toMatchObject({ betAmount: 3, cashedOut: false });
    expect(s.round.participants[1]).toMatchObject({ betAmount: 4, cashedOut: true });
    const b = makeEngine();
    b.restore(s);
    expect(b.snapshot()).toEqual(s);
    s.round.participants[0]!.betAmount = 999; // the restored engine holds its own copy
    expect(b.getPublicState().participants[0]?.betAmount).toBe(3);
  });

  it("rejects an unknown schema version: engineError reported, state untouched (§18 ring 1)", () => {
    const a = makeEngine();
    advanceTicks(a, 10);
    const before = a.snapshot();
    const errors: unknown[] = [];
    a.events.on("engineError", (p) => errors.push(p));

    a.restore({ ...before, schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 });
    expect(a.snapshot()).toEqual(before);

    advanceTicks(a, 1); // engineError rides the post-tick dispatch (§12)
    expect(errors).toEqual([
      {
        roundId: 1,
        code: "snapshot-schema-mismatch",
        detail: { schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 },
      },
    ]);
  });
});
