// Transition-sequence + command tests for the round state machine
// (Sprint 3, Commits E4–E5; the §20 risk-1 mitigation: transition-sequence
// tests on a seeded engine). Driven through the GameEngine facade so the
// clock, command queue, machine, simulation and event dispatch are
// exercised together. Since E5 the diving pipeline is the real
// DiveSimulation on a deterministic world Rng (constant 0.5 → seahorses at
// x = 0.5, never a goldfish, so boost stays 0 and the multiplier is exactly
// multiplierAt(diveElapsed)); dive outcomes are forced through the scripted
// authority's crash point (1 → crash on the first diving tick; huge → ride
// to the sea floor). All durations are pinned in whole ticks (§8
// quantization): betting 5 s = 300, crash banner 2.4 s = 144,
// impact→chests 1.4 s = 84, chest result 2.2 s = 132.
import { describe, expect, it } from "vitest";
import { TICK_SECONDS } from "./clock";
import { multiplierAt } from "./domain/multiplier";
import type { BonusChest } from "./domain/outcomes";
import type { EngineEventMap } from "./events";
import { GameEngine } from "./game-engine";
import type { RoundAuthority } from "./round-authority";
import { BONUS_PICK_WINDOW_MS } from "./domain/tuning";
import { ENGINE_STATE_TO_PHASE } from "./state-machine";

const BETTING_TICKS = 300;
const CRASH_BANNER_TICKS = 144;
const IMPACT_TICKS = 84;
const CHEST_RESULT_TICKS = 132;

/** Crash point that can never be reached — forces the sea-floor path. */
const NEVER_CRASH = 1e9;

const CHESTS: [BonusChest, BonusChest, BonusChest] = [
  { id: 0, multiplier: 2, opened: false },
  { id: 1, multiplier: 6.5, opened: false },
  { id: 2, multiplier: 30, opened: false },
];

/** A seeded harness: scripted authority + constant-draw world Rng. */
function makeHarness(opts: { crashPoint?: number } = {}) {
  const calls = { crashPoint: 0, jackpot: 0, chests: 0 };
  const authority: RoundAuthority = {
    sampleCrashPoint: () => {
      calls.crashPoint++;
      return opts.crashPoint ?? 2.5;
    },
    sampleJackpot: () => {
      calls.jackpot++;
      return 120;
    },
    rollBonusChests: () => {
      calls.chests++;
      return CHESTS;
    },
  };
  const engine = new GameEngine({ authority, worldRng: { next: () => 0.5 } });
  const log: Array<{ name: keyof EngineEventMap; payload: unknown }> = [];
  const record = <K extends keyof EngineEventMap>(name: K) =>
    engine.events.on(name, (payload) => log.push({ name, payload }));
  record("bettingOpened");
  record("betPlaced");
  record("diveStarted");
  record("cashedOut");
  record("crashed");
  record("shipImpact");
  record("chestsRevealed");
  record("chestPicked");
  record("roundEnded");
  record("stateChanged");
  record("commandRejected");
  return { engine, calls, log };
}

const advanceTicks = (engine: GameEngine, n: number) => {
  for (let i = 0; i < n; i++) engine.advance(TICK_SECONDS);
};

/** Advance until the predicate holds; throws if `cap` ticks pass first. */
const advanceUntil = (engine: GameEngine, cap: number, done: () => boolean) => {
  for (let i = 0; i < cap; i++) {
    engine.advance(TICK_SECONDS);
    if (done()) return;
  }
  throw new Error(`condition not reached within ${cap} ticks`);
};

describe("round state machine — §5 transition table on the simulation clock (D1)", () => {
  it("runs betting for exactly 300 ticks, then enters diving via the authority", () => {
    const h = makeHarness();
    expect(h.engine.state).toBe("betting");

    advanceTicks(h.engine, BETTING_TICKS - 1);
    expect(h.engine.state).toBe("betting");
    expect(h.engine.getPublicState().countdownSeconds).toBeCloseTo(TICK_SECONDS, 12);
    expect(h.engine.getRenderState().worldY).toBe(0); // pipeline never runs outside diving

    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("diving");
    expect(h.calls.crashPoint).toBe(1); // entry(diving) asked the authority once
    expect(h.log.filter((e) => e.name === "diveStarted")).toEqual([
      { name: "diveStarted", payload: { roundId: 1 } },
    ]);

    advanceTicks(h.engine, 2); // pipeline runs once per tick while diving
    expect(h.engine.getRenderState().worldY).toBeGreaterThan(0);
    expect(h.engine.getPublicState().multiplier).toBeCloseTo(multiplierAt(2 * TICK_SECONDS), 12);
  });

  it("crash path: pipeline outcome → crashed (144 ticks) → betting; world frozen outside diving (D3)", () => {
    // crashAt = 1: multiplierAt(1 tick) ≥ 1 → the first diving tick crashes,
    // before the descent step ran (D3 terminal exit) — worldY stays 0.
    const h = makeHarness({ crashPoint: 1 });
    advanceTicks(h.engine, BETTING_TICKS); // → diving
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("crashed");
    expect(h.engine.getRenderState().worldY).toBe(0);
    expect(h.engine.getPublicState().multiplier).toBe(1); // entry(crashed) clamps to crashAt
    expect(h.log.filter((e) => e.name === "crashed")).toEqual([
      { name: "crashed", payload: { roundId: 1, multiplier: 1 } },
    ]);

    advanceTicks(h.engine, CRASH_BANNER_TICKS - 1);
    expect(h.engine.state).toBe("crashed");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(h.engine.getRenderState().worldY).toBe(0); // no pipeline outside diving
    expect(h.engine.getPublicState().countdownSeconds).toBe(5);
    expect(h.log.filter((e) => e.name === "roundEnded")).toEqual([
      { name: "roundEnded", payload: { roundId: 1, outcome: "crashed" } },
    ]);
    expect(h.log.filter((e) => e.name === "bettingOpened")).toEqual([
      { name: "bettingOpened", payload: { roundId: 2 } }, // next round's id
    ]);
  });

  it("jackpot path: sea floor → impact (84 ticks) → bonus (E-X1 pick window) → pick → result → betting", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 10 }); // E-X1: only an auto-cashed participant may pick
    advanceTicks(h.engine, BETTING_TICKS); // bet applied; → diving

    advanceUntil(h.engine, 5000, () => h.engine.state !== "diving");
    expect(h.engine.state).toBe("impact");
    expect(h.engine.getRenderState().worldY).toBeGreaterThanOrEqual(4200); // CHAIN_MAX_DEPTH reached
    expect(h.calls.jackpot).toBe(1);
    expect(h.engine.getPublicState().multiplier).toBe(120); // jackpot locked at entry(impact)
    expect(h.log.filter((e) => e.name === "shipImpact")).toEqual([
      { name: "shipImpact", payload: { roundId: 1, jackpotMultiplier: 120 } },
    ]);

    advanceTicks(h.engine, IMPACT_TICKS - 1);
    expect(h.engine.state).toBe("impact");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("bonus");
    expect(h.calls.chests).toBe(1);
    expect(h.log.filter((e) => e.name === "chestsRevealed")).toEqual([
      { name: "chestsRevealed", payload: { roundId: 1, chests: CHESTS } },
    ]);

    advanceTicks(h.engine, 300); // inside the 360-tick pick window (E-X1): still waiting
    expect(h.engine.state).toBe("bonus");
    expect(h.log.filter((e) => e.name === "chestPicked")).toEqual([]);

    // D4: the pick is a queued command, applied at the next tick boundary.
    h.engine.submit({ type: "pickChest", chestId: 1 });
    expect(h.log.filter((e) => e.name === "chestPicked")).toEqual([]); // not yet applied
    advanceTicks(h.engine, 1);
    expect(h.log.filter((e) => e.name === "chestPicked")).toEqual([
      {
        name: "chestPicked",
        payload: { roundId: 1, chestId: 1, chestMultiplier: 6.5, finalMultiplier: 780 }, // +(120·6.5).toFixed(2)
      },
    ]);
    expect(h.engine.getPublicState().multiplier).toBe(780); // chest final locked
    expect(h.engine.state).toBe("bonus"); // result interval still showing

    // The result timer starts at the applying tick boundary and counts that
    // tick, so betting arrives 132 ticks after the submit was consumed.
    advanceTicks(h.engine, CHEST_RESULT_TICKS - 2);
    expect(h.engine.state).toBe("bonus");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(h.log.filter((e) => e.name === "roundEnded")).toEqual([
      { name: "roundEnded", payload: { roundId: 1, outcome: "jackpot" } },
    ]);
  });

  it("projects engine states onto the fixed renderer Phase strings (§5)", () => {
    expect(ENGINE_STATE_TO_PHASE).toEqual({
      betting: "idle",
      diving: "diving",
      crashed: "crashed",
      impact: "cashed",
      bonus: "bonus",
    });
  });
});

describe("command queue — §13 validation at the applying tick (D4, §18 ring 1)", () => {
  it("accepts one placeBet per round while betting; rejects the rest", () => {
    const h = makeHarness();
    h.engine.submit({ type: "placeBet", slot: 0, amount: 25 });
    advanceTicks(h.engine, 1);
    expect(h.log.filter((e) => e.name === "betPlaced")).toEqual([
      { name: "betPlaced", payload: { roundId: 1, slot: 0, amount: 25 } },
    ]);

    h.engine.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceTicks(h.engine, 1);
    expect(h.log.filter((e) => e.name === "commandRejected")).toEqual([
      {
        name: "commandRejected",
        payload: {
          roundId: 1,
          command: { type: "placeBet", slot: 0, amount: 10 },
          reason: "already-participating",
        },
      },
    ]);
  });

  it("rejects invalid bet amounts (E-X2: sub-cent, non-finite, zero) and bets outside the betting window", () => {
    const h = makeHarness();
    h.engine.submit({ type: "placeBet", slot: 0, amount: 0 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 0.005 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 0.123 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: NaN });
    h.engine.submit({ type: "placeBet", slot: 0, amount: Infinity });
    h.engine.submit({ type: "placeBet", slot: 0, amount: -1 });
    advanceTicks(h.engine, 1);
    advanceTicks(h.engine, BETTING_TICKS);
    expect(h.engine.state).toBe("diving");
    h.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceTicks(h.engine, 1);
    const rejections = h.log.filter((e) => e.name === "commandRejected").map((e) => e.payload);
    expect(rejections).toEqual([
      { roundId: 1, command: { type: "placeBet", slot: 0, amount: 0 }, reason: "invalid-amount" },
      {
        roundId: 1,
        command: { type: "placeBet", slot: 0, amount: 0.005 },
        reason: "invalid-amount",
      },
      {
        roundId: 1,
        command: { type: "placeBet", slot: 0, amount: 0.123 },
        reason: "invalid-amount",
      },
      { roundId: 1, command: { type: "placeBet", slot: 0, amount: NaN }, reason: "invalid-amount" },
      {
        roundId: 1,
        command: { type: "placeBet", slot: 0, amount: Infinity },
        reason: "invalid-amount",
      },
      { roundId: 1, command: { type: "placeBet", slot: 0, amount: -1 }, reason: "invalid-amount" },
      { roundId: 1, command: { type: "placeBet", slot: 0, amount: 5 }, reason: "not-in-betting" },
    ]);
    expect(h.log.filter((e) => e.name === "betPlaced")).toEqual([]);
  });

  it("cashOut uses the tick-authoritative multiplier from the last completed tick (D4)", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 25 });
    advanceTicks(h.engine, BETTING_TICKS); // consumes the bet tick + reaches diving
    expect(h.engine.state).toBe("diving");

    advanceTicks(h.engine, 10);
    const tickAuthoritative = multiplierAt(10 * TICK_SECONDS);
    expect(h.engine.getPublicState().multiplier).toBeCloseTo(tickAuthoritative, 12);

    h.engine.submit({ type: "cashOut", slot: 0 });
    advanceTicks(h.engine, 1);
    const cashedOut = h.log.filter((e) => e.name === "cashedOut");
    expect(cashedOut).toHaveLength(1);
    // Applied before the tick's pipeline ran: the payload carries the last
    // completed tick's multiplier, while the engine has already moved on.
    expect((cashedOut[0].payload as { multiplier: number }).multiplier).toBeCloseTo(
      tickAuthoritative,
      12,
    );
    expect(h.engine.getPublicState().multiplier).toBeCloseTo(multiplierAt(11 * TICK_SECONDS), 12);
    expect(h.engine.state).toBe("diving"); // §5: cashout is not a transition
  });

  it("rejects cashOut when not diving, not participating, or already cashed out", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "cashOut", slot: 0 }); // still betting
    advanceTicks(h.engine, 1);

    advanceTicks(h.engine, BETTING_TICKS - 1); // → diving, no bet placed
    h.engine.submit({ type: "cashOut", slot: 0 });
    advanceTicks(h.engine, 1);

    const reasons = () =>
      h.log
        .filter((e) => e.name === "commandRejected")
        .map((e) => (e.payload as { reason: string }).reason);
    expect(reasons()).toEqual(["not-diving", "not-participating"]);
    expect(h.log.filter((e) => e.name === "cashedOut")).toEqual([]);
  });

  it("applies queued commands in submit order within one boundary: second cashOut rejected", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 25 });
    advanceTicks(h.engine, BETTING_TICKS);
    advanceTicks(h.engine, 5);

    h.engine.submit({ type: "cashOut", slot: 0 });
    h.engine.submit({ type: "cashOut", slot: 0 }); // double-click inside one tick
    advanceTicks(h.engine, 1);
    expect(h.log.filter((e) => e.name === "cashedOut")).toHaveLength(1);
    expect(h.log.filter((e) => e.name === "commandRejected").map((e) => e.payload)).toEqual([
      { roundId: 1, command: { type: "cashOut", slot: 0 }, reason: "already-cashed-out" },
    ]);
  });

  it("rejects invalid pickChest commands and reports them without state change", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "pickChest", chestId: 0 }); // still in betting
    h.engine.submit({ type: "placeBet", slot: 0, amount: 10 }); // E-X1: participate so the bonus pick is eligible
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(h.log.filter((e) => e.name === "commandRejected")).toEqual([
      {
        name: "commandRejected",
        payload: {
          roundId: 1,
          command: { type: "pickChest", chestId: 0 },
          reason: "not-in-bonus",
        },
      },
    ]);

    // Reach bonus, then pick twice inside one tick: first stands, second rejected.
    advanceTicks(h.engine, BETTING_TICKS - 1);
    advanceUntil(h.engine, 5000, () => h.engine.state !== "diving");
    advanceTicks(h.engine, IMPACT_TICKS);
    expect(h.engine.state).toBe("bonus");
    h.engine.submit({ type: "pickChest", chestId: 0 });
    h.engine.submit({ type: "pickChest", chestId: 2 });
    advanceTicks(h.engine, 1);
    const rejections = h.log.filter((e) => e.name === "commandRejected");
    expect(rejections).toHaveLength(2);
    expect(rejections[1].payload).toEqual({
      roundId: 1,
      command: { type: "pickChest", chestId: 2 },
      reason: "chest-already-picked",
    });
    expect(h.log.filter((e) => e.name === "chestPicked")).toHaveLength(1); // first pick stood
  });

  it("bet basis lock (bug fix): the accepted amount is immutable for the round — later amounts are rejected", () => {
    // The exploit this pins against: debit at placeBet, but settlement
    // re-reading the (changeable) bet input at dive start. The engine locks
    // participant.betAmount at the accepting tick; every later attempt to
    // introduce a different amount is rejected, and the locked value rides
    // unchanged into the dive — the settlement layer's only valid basis.
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceTicks(h.engine, 1);
    expect(h.engine.getPublicState().participants[0]?.betAmount).toBe(5);

    h.engine.submit({ type: "placeBet", slot: 0, amount: 100 }); // "raised the input" while locked
    advanceTicks(h.engine, 1);
    advanceTicks(h.engine, BETTING_TICKS - 2); // → diving
    expect(h.engine.state).toBe("diving");
    h.engine.submit({ type: "placeBet", slot: 0, amount: 100 }); // and again mid-dive
    advanceTicks(h.engine, 1);

    expect(
      h.log
        .filter((e) => e.name === "commandRejected")
        .map((e) => (e.payload as { reason: string }).reason),
    ).toEqual(["already-participating", "not-in-betting"]);
    expect(h.engine.getPublicState().participants[0]?.betAmount).toBe(5); // still the debited amount
  });

  it("bet basis lock (bug fix): settlement is derivable from event payloads alone — debit and win share one basis", () => {
    // Replays the wallet exactly as the UI shell wires it after the fix
    // (§3): the round bet is the betPlaced amount. No other bet value
    // exists anywhere in the event stream, so the win basis cannot diverge
    // from the debited amount by construction.
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    let balance = 1000;
    let roundBet = 0;
    h.engine.events.on("betPlaced", ({ amount }) => {
      roundBet = amount; // locked at acceptance — the fix's contract
      balance = +(balance - amount).toFixed(2);
    });
    h.engine.events.on("cashedOut", ({ multiplier }) => {
      balance = +(balance + +(roundBet * multiplier).toFixed(2)).toFixed(2);
    });

    h.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceTicks(h.engine, BETTING_TICKS); // bet applied; → diving
    advanceTicks(h.engine, 10);
    const m = h.engine.getPublicState().multiplier; // tick-authoritative cashout value (D4)
    h.engine.submit({ type: "cashOut", slot: 0 });
    advanceTicks(h.engine, 1);

    const expected = +(+(1000 - 5).toFixed(2) + +(5 * m).toFixed(2)).toFixed(2);
    expect(balance).toBe(expected); // 5 in, 5 × m out — never 100 × m
  });

  it("clears the participant at entry(betting): a new bet is accepted next round", () => {
    const h = makeHarness({ crashPoint: 1 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 25 });
    advanceTicks(h.engine, BETTING_TICKS); // bet applied; → diving
    advanceTicks(h.engine, 1); // first diving tick crashes (crashAt = 1)
    advanceTicks(h.engine, CRASH_BANNER_TICKS); // → betting (round 2)
    expect(h.engine.state).toBe("betting");

    h.engine.submit({ type: "placeBet", slot: 0, amount: 50 });
    advanceTicks(h.engine, 1);
    expect(h.log.filter((e) => e.name === "betPlaced").map((e) => e.payload)).toEqual([
      { roundId: 1, slot: 0, amount: 25 },
      { roundId: 2, slot: 0, amount: 50 },
    ]);
  });
});

// E-X1 (approved engine freeze exception, docs/06 §5): bonus eligibility and
// deterministic completion. Only a participant auto-cashed at the jackpot is
// bonus-eligible: it gets a 6 s = 360-tick pick window, and on expiry chest 0
// is applied through the normal pick path. Without an eligible local
// participant (spectator, manual cashout) the bonus phase runs only the
// result interval and no chestPicked is ever emitted. Local single-player
// rule — not the Phase 8 multiplayer rule.
describe("E-X1 — bonus eligibility and deterministic completion", () => {
  const PICK_WINDOW_TICKS = 360;

  type Harness = ReturnType<typeof makeHarness>;
  const picks = (h: Harness) => h.log.filter((e) => e.name === "chestPicked").map((e) => e.payload);
  const rejections = (h: Harness) =>
    h.log
      .filter((e) => e.name === "commandRejected")
      .map((e) => e.payload as EngineEventMap["commandRejected"]);

  /** Run one round from the betting window to entry(bonus). */
  function toBonus(h: Harness, opts: { bet?: number; cashOutAfterTicks?: number } = {}) {
    if (opts.bet !== undefined) h.engine.submit({ type: "placeBet", slot: 0, amount: opts.bet });
    advanceUntil(h.engine, 1000, () => h.engine.state === "diving");
    if (opts.cashOutAfterTicks !== undefined) {
      advanceTicks(h.engine, opts.cashOutAfterTicks);
      h.engine.submit({ type: "cashOut", slot: 0 });
    }
    advanceUntil(h.engine, 5000, () => h.engine.state === "impact");
    advanceTicks(h.engine, IMPACT_TICKS);
    expect(h.engine.state).toBe("bonus");
  }

  it("pins the pick window: 6 s = 360 ticks", () => {
    expect(Math.round(BONUS_PICK_WINDOW_MS / 1000 / TICK_SECONDS)).toBe(PICK_WINDOW_TICKS);
  });

  it("eligible: jackpot auto-cash marks the participant eligible; a manual pick in the window applies", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    toBonus(h, { bet: 10 });
    expect(h.engine.getPublicState().participants[0]).toEqual({
      betAmount: 10,
      cashedOut: true,
      cashedOutAt: 120,
      bonusEligible: true,
    });
    advanceTicks(h.engine, PICK_WINDOW_TICKS - 1); // the command lands on the window's final tick
    h.engine.submit({ type: "pickChest", chestId: 2 });
    advanceTicks(h.engine, 1);
    expect(picks(h)).toEqual([
      { roundId: 1, chestId: 2, chestMultiplier: 30, finalMultiplier: 3600 },
    ]); // the manual pick wins the boundary tick — no auto-pick
    expect(rejections(h)).toEqual([]);
    advanceTicks(h.engine, CHEST_RESULT_TICKS - 2);
    expect(h.engine.state).toBe("bonus");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(picks(h)).toHaveLength(1);
  });

  it("eligible: no pick within 360 ticks → chest 0 applied through the pick path, then the result interval", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    toBonus(h, { bet: 10 });
    advanceTicks(h.engine, PICK_WINDOW_TICKS - 1);
    expect(h.engine.state).toBe("bonus");
    expect(picks(h)).toEqual([]);

    advanceTicks(h.engine, 1); // window expires
    expect(picks(h)).toEqual([
      { roundId: 1, chestId: 0, chestMultiplier: 2, finalMultiplier: 240 }, // +(120·2).toFixed(2)
    ]);
    expect(h.engine.getPublicState().chosenChestId).toBe(0);
    expect(h.engine.getPublicState().multiplier).toBe(240);
    expect(h.engine.state).toBe("bonus");

    advanceTicks(h.engine, CHEST_RESULT_TICKS - 1);
    expect(h.engine.state).toBe("bonus");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(h.log.filter((e) => e.name === "roundEnded").map((e) => e.payload)).toEqual([
      { roundId: 1, outcome: "jackpot" },
    ]);
  });

  it("manual cashout → seabed: ineligible, pick rejected, no chestPicked, bonus completes after the result interval", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    toBonus(h, { bet: 10, cashOutAfterTicks: 30 });
    expect(h.log.filter((e) => e.name === "cashedOut")).toHaveLength(1);
    expect(h.engine.getPublicState().participants[0]?.bonusEligible).toBe(false);
    expect(h.log.filter((e) => e.name === "chestsRevealed")).toHaveLength(1); // round data still revealed

    h.engine.submit({ type: "pickChest", chestId: 2 });
    advanceTicks(h.engine, 1);
    expect(rejections(h)).toEqual([
      { roundId: 1, command: { type: "pickChest", chestId: 2 }, reason: "not-bonus-eligible" },
    ]);
    expect(h.engine.getPublicState().chosenChestId).toBeNull();
    expect(h.engine.getPublicState().multiplier).toBe(120); // jackpot stays locked, never multiplied

    advanceTicks(h.engine, CHEST_RESULT_TICKS - 2);
    expect(h.engine.state).toBe("bonus");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(picks(h)).toEqual([]);
    expect(h.log.filter((e) => e.name === "roundEnded").map((e) => e.payload)).toEqual([
      { roundId: 1, outcome: "jackpot" },
    ]);
  });

  it("spectator: no participant, pick rejected, no chestPicked, bonus completes after exactly 132 ticks", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    toBonus(h);
    expect(h.engine.getPublicState().participants[0]).toBeNull();
    h.engine.submit({ type: "pickChest", chestId: 0 });
    advanceTicks(h.engine, CHEST_RESULT_TICKS - 1);
    expect(h.engine.state).toBe("bonus");
    advanceTicks(h.engine, 1);
    expect(h.engine.state).toBe("betting");
    expect(picks(h)).toEqual([]);
    expect(rejections(h)).toEqual([
      { roundId: 1, command: { type: "pickChest", chestId: 0 }, reason: "not-bonus-eligible" },
    ]);
  });

  it("duplicate protection: picks after the auto-pick are rejected", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    toBonus(h, { bet: 10 });
    advanceTicks(h.engine, PICK_WINDOW_TICKS); // auto-pick chest 0
    h.engine.submit({ type: "pickChest", chestId: 1 });
    h.engine.submit({ type: "pickChest", chestId: 0 });
    advanceTicks(h.engine, 1);
    expect(picks(h)).toHaveLength(1);
    expect(rejections(h).map((r) => r.reason)).toEqual([
      "chest-already-picked",
      "chest-already-picked",
    ]);
    expect(h.engine.getPublicState().chosenChestId).toBe(0);
  });

  it("repeated rounds: eligibility is per round and never leaks between rounds", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    const finish = () => advanceUntil(h.engine, 1000, () => h.engine.state === "betting");

    toBonus(h, { bet: 10 }); // round 1: eligible, auto-pick
    advanceTicks(h.engine, PICK_WINDOW_TICKS);
    finish();
    toBonus(h); // round 2: spectator
    expect(h.engine.getPublicState().participants[0]).toBeNull();
    finish();
    toBonus(h, { bet: 10, cashOutAfterTicks: 30 }); // round 3: manual cashout
    expect(h.engine.getPublicState().participants[0]?.bonusEligible).toBe(false);
    finish();
    toBonus(h, { bet: 10 }); // round 4: eligible, manual pick
    expect(h.engine.getPublicState().chosenChestId).toBeNull(); // reset at entry(diving)
    h.engine.submit({ type: "pickChest", chestId: 1 });
    finish();

    expect(picks(h)).toEqual([
      { roundId: 1, chestId: 0, chestMultiplier: 2, finalMultiplier: 240 },
      { roundId: 4, chestId: 1, chestMultiplier: 6.5, finalMultiplier: 780 },
    ]);
    expect(h.log.filter((e) => e.name === "roundEnded").map((e) => e.payload)).toEqual([
      { roundId: 1, outcome: "jackpot" },
      { roundId: 2, outcome: "jackpot" },
      { roundId: 3, outcome: "jackpot" },
      { roundId: 4, outcome: "jackpot" },
    ]);
    expect(rejections(h)).toEqual([]);
  });
});

// E-X2: engine-side valid-stake enforcement (docs/07 §23.4, §23.8; owner
// policy M1-D1, M1-D2, M1-D3; authorized scope: the placeBet branch only).
describe("E-X2 — valid-stake enforcement in applyPlaceBet", () => {
  it("accepts whole-cent stakes: 0.01, 0.07, 0.29, 1, 5, 100", () => {
    for (const amount of [0.01, 0.07, 0.29, 1, 5, 100]) {
      const h = makeHarness();
      h.engine.submit({ type: "placeBet", slot: 0, amount });
      advanceTicks(h.engine, 1);
      expect(
        h.log.filter((e) => e.name === "betPlaced"),
        `accepted ${amount}`,
      ).toEqual([{ name: "betPlaced", payload: { roundId: 1, slot: 0, amount } }]);
    }
  });

  it("rejects sub-cent amounts: 0.001, 0.004, 0.005, 0.009, 1.005, 0.123, 999.999", () => {
    for (const amount of [0.001, 0.004, 0.005, 0.009, 1.005, 0.123, 999.999]) {
      const h = makeHarness();
      h.engine.submit({ type: "placeBet", slot: 0, amount });
      advanceTicks(h.engine, 1);
      expect(
        h.log.filter((e) => e.name === "commandRejected").map((e) => e.payload),
        `rejected ${amount}`,
      ).toEqual([
        { roundId: 1, command: { type: "placeBet", slot: 0, amount }, reason: "invalid-amount" },
      ]);
      expect(
        h.log.filter((e) => e.name === "betPlaced"),
        `no bet for ${amount}`,
      ).toEqual([]);
    }
  });

  it("a rejected invalid stake consumes no RNG, leaves no participant, and a later valid bet works normally", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    for (const amount of [0.005, NaN, Infinity, -0.01]) {
      h.engine.submit({ type: "placeBet", slot: 0, amount });
    }
    advanceTicks(h.engine, 1);
    expect(h.engine.getPublicState().participants[0]).toBeNull();
    h.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceTicks(h.engine, 1);
    expect(h.engine.getPublicState().participants[0]?.betAmount).toBe(5);
    const snap = h.engine.snapshot();
    // Compare with a clean run where no invalid stakes were submitted.
    const clean = makeHarness({ crashPoint: NEVER_CRASH });
    advanceTicks(clean.engine, 1); // advance past the tick where invalid commands would have applied
    clean.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceTicks(clean.engine, 1);
    expect(clean.engine.snapshot()).toEqual(snap);
  });

  it("replay determinism: rejected stakes produce identical snapshots as if they never existed", () => {
    const run = (withInvalid: boolean) => {
      const h = makeHarness({ crashPoint: NEVER_CRASH });
      if (withInvalid) {
        h.engine.submit({ type: "placeBet", slot: 0, amount: 0.005 });
        h.engine.submit({ type: "placeBet", slot: 0, amount: 0.123 });
        h.engine.submit({ type: "placeBet", slot: 0, amount: NaN });
      }
      h.engine.submit({ type: "placeBet", slot: 0, amount: 10 });
      advanceTicks(h.engine, BETTING_TICKS);
      advanceTicks(h.engine, 100);
      return h.engine.snapshot();
    };
    expect(run(true)).toEqual(run(false));
  });

  it("same-tick ordering: an invalid bet then a valid bet in the same command batch — the valid one wins", () => {
    const h = makeHarness();
    h.engine.submit({ type: "placeBet", slot: 0, amount: 0.005 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceTicks(h.engine, 1);
    expect(h.log.filter((e) => e.name === "betPlaced")).toEqual([
      { name: "betPlaced", payload: { roundId: 1, slot: 0, amount: 10 } },
    ]);
    expect(h.log.filter((e) => e.name === "commandRejected").map((e) => e.payload)).toEqual([
      {
        roundId: 1,
        command: { type: "placeBet", slot: 0, amount: 0.005 },
        reason: "invalid-amount",
      },
    ]);
  });
});

// E-X3 (Dual Bet, owner-approved engine freeze exception 2026-11-14): two
// independent bet slots per round; mandatory slot on placeBet / cashOut; one
// chest pick per round, offered while any slot is eligible.
describe("E-X3 — dual bet slots", () => {
  type Harness = ReturnType<typeof makeHarness>;
  const named = <K extends keyof EngineEventMap>(h: Harness, name: K) =>
    h.log.filter((e) => e.name === name).map((e) => e.payload as EngineEventMap[K]);

  it("accepts one bet per slot in the same round; each slot is locked independently", () => {
    const h = makeHarness();
    h.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    h.engine.submit({ type: "placeBet", slot: 1, amount: 7.25 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 9 }); // slot 0 already placed
    h.engine.submit({ type: "placeBet", slot: 1, amount: 9 }); // slot 1 already placed
    advanceTicks(h.engine, 1);
    expect(named(h, "betPlaced")).toEqual([
      { roundId: 1, slot: 0, amount: 5 },
      { roundId: 1, slot: 1, amount: 7.25 },
    ]);
    expect(named(h, "commandRejected").map((r) => r.reason)).toEqual([
      "already-participating",
      "already-participating",
    ]);
    const [p0, p1] = h.engine.getPublicState().participants;
    expect(p0?.betAmount).toBe(5);
    expect(p1?.betAmount).toBe(7.25);
  });

  it("slot 1 alone is a full participation; slot 0 stays empty", () => {
    const h = makeHarness();
    h.engine.submit({ type: "placeBet", slot: 1, amount: 3 });
    advanceTicks(h.engine, 1);
    expect(h.engine.getPublicState().participants).toEqual([
      null,
      { betAmount: 3, cashedOut: false, cashedOutAt: null, bonusEligible: false },
    ]);
  });

  it("rejects a missing or invalid slot on placeBet and cashOut, consuming nothing", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    for (const slot of [undefined, 2, -1, 0.5, "0", null]) {
      h.engine.submit({ type: "placeBet", slot, amount: 5 } as never);
    }
    advanceTicks(h.engine, 1);
    expect(named(h, "betPlaced")).toEqual([]);
    expect(h.engine.getPublicState().participants).toEqual([null, null]);
    h.engine.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceUntil(h.engine, 1000, () => h.engine.state === "diving");
    h.engine.submit({ type: "cashOut", slot: 2 } as never);
    h.engine.submit({ type: "cashOut" } as never);
    advanceTicks(h.engine, 1);
    expect(named(h, "cashedOut")).toEqual([]);
    expect(
      named(h, "commandRejected")
        .map((r) => r.reason)
        .filter((r) => r === "invalid-slot"),
    ).toHaveLength(8);
    expect(h.engine.getPublicState().participants[0]?.cashedOut).toBe(false);
  });

  it("cashes out each slot independently at its own tick's multiplier; a slot without a bet is not participating", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 10 });
    h.engine.submit({ type: "placeBet", slot: 1, amount: 20 });
    advanceUntil(h.engine, 1000, () => h.engine.state === "diving");
    advanceTicks(h.engine, 30);
    h.engine.submit({ type: "cashOut", slot: 1 });
    advanceTicks(h.engine, 61);
    h.engine.submit({ type: "cashOut", slot: 0 });
    h.engine.submit({ type: "cashOut", slot: 1 }); // already cashed
    advanceTicks(h.engine, 1);
    const cashed = named(h, "cashedOut");
    expect(cashed.map((c) => c.slot)).toEqual([1, 0]);
    expect(cashed[0].multiplier).toBeLessThan(cashed[1].multiplier);
    expect(named(h, "commandRejected").map((r) => r.reason)).toEqual(["already-cashed-out"]);
    const [p0, p1] = h.engine.getPublicState().participants;
    expect(p0).toMatchObject({ cashedOut: true, cashedOutAt: cashed[1].multiplier });
    expect(p1).toMatchObject({ cashedOut: true, cashedOutAt: cashed[0].multiplier });

    const g = makeHarness({ crashPoint: NEVER_CRASH });
    g.engine.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntil(g.engine, 1000, () => g.engine.state === "diving");
    g.engine.submit({ type: "cashOut", slot: 1 });
    advanceTicks(g.engine, 1);
    expect(named(g, "commandRejected").map((r) => r.reason)).toEqual(["not-participating"]);
  });

  it("at the sea floor only the slots still riding are auto-cashed and bonus-eligible; ONE pick applies; both clear at betting", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 10 });
    h.engine.submit({ type: "placeBet", slot: 1, amount: 20 });
    advanceUntil(h.engine, 1000, () => h.engine.state === "diving");
    advanceTicks(h.engine, 10);
    h.engine.submit({ type: "cashOut", slot: 0 }); // slot 0 manual, slot 1 rides
    advanceUntil(h.engine, 5000, () => h.engine.state === "impact");
    const [p0, p1] = h.engine.getPublicState().participants;
    expect(p0?.bonusEligible).toBe(false);
    expect(p1).toMatchObject({ cashedOut: true, cashedOutAt: 120, bonusEligible: true });
    advanceTicks(h.engine, IMPACT_TICKS);
    expect(h.engine.state).toBe("bonus");
    h.engine.submit({ type: "pickChest", chestId: 1 });
    h.engine.submit({ type: "pickChest", chestId: 2 });
    advanceTicks(h.engine, 1);
    expect(named(h, "chestPicked")).toEqual([
      { roundId: 1, chestId: 1, chestMultiplier: 6.5, finalMultiplier: 780 },
    ]);
    expect(named(h, "commandRejected").map((r) => r.reason)).toEqual(["chest-already-picked"]);
    advanceTicks(h.engine, CHEST_RESULT_TICKS);
    expect(h.engine.state).toBe("betting");
    expect(h.engine.getPublicState().participants).toEqual([null, null]);
  });

  it("both slots riding to the sea floor are both eligible; with every slot cashed out no pick is offered", () => {
    const h = makeHarness({ crashPoint: NEVER_CRASH });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 1 });
    h.engine.submit({ type: "placeBet", slot: 1, amount: 2 });
    advanceUntil(h.engine, 5000, () => h.engine.state === "impact");
    expect(h.engine.getPublicState().participants.map((p) => p?.bonusEligible)).toEqual([
      true,
      true,
    ]);

    const g = makeHarness({ crashPoint: NEVER_CRASH });
    g.engine.submit({ type: "placeBet", slot: 0, amount: 1 });
    g.engine.submit({ type: "placeBet", slot: 1, amount: 2 });
    advanceUntil(g.engine, 1000, () => g.engine.state === "diving");
    g.engine.submit({ type: "cashOut", slot: 0 });
    g.engine.submit({ type: "cashOut", slot: 1 });
    advanceUntil(g.engine, 5000, () => g.engine.state === "impact");
    advanceTicks(g.engine, IMPACT_TICKS);
    g.engine.submit({ type: "pickChest", chestId: 0 });
    advanceTicks(g.engine, 1);
    expect(named(g, "chestPicked")).toEqual([]);
    expect(named(g, "commandRejected").map((r) => r.reason)).toEqual(["not-bonus-eligible"]);
  });

  it("a crash loses every slot still riding; a cashed slot keeps its cashout", () => {
    const h = makeHarness({ crashPoint: 2.5 });
    h.engine.submit({ type: "placeBet", slot: 0, amount: 1 });
    h.engine.submit({ type: "placeBet", slot: 1, amount: 2 });
    advanceUntil(h.engine, 1000, () => h.engine.state === "diving");
    advanceTicks(h.engine, 5);
    h.engine.submit({ type: "cashOut", slot: 1 });
    advanceUntil(h.engine, 5000, () => h.engine.state === "crashed");
    expect(named(h, "cashedOut").map((c) => c.slot)).toEqual([1]);
    const [p0, p1] = h.engine.getPublicState().participants;
    expect(p0?.cashedOut).toBe(false);
    expect(p1?.cashedOut).toBe(true);
  });
});
