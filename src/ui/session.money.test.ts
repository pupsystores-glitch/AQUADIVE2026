// M1 money-integrity integration tests (docs/07_UI_ARCHITECTURE.md §23.6
// I1–I12, §23.7 scenario and final-reconciliation blocks). Node env.
//
// Real GameEngine + LocalRoundAuthority over seeded Rngs (the production
// distributions, deterministic), driven only through session.submit by a
// seeded player strategy that bets, spectates, cashes out at random ticks,
// holds to the jackpot, picks chests or lets the pick time out (E-X1).
//
// The expected ledger is independent of the wallet: integer cents, kept from
// the ENGINE's events — stake cents from betPlaced, the cashout credit as
// ⌊cents × m⌋ on m's exact binary value (src/ui/test/money-oracle.ts), the
// jackpot and chest credits as ⌊cents × M / 100⌋ on the engine's two-decimal
// multipliers. No toFixed, no payout function under test.
import { describe, expect, it } from "vitest";
import { LocalRoundAuthority, type EngineEventMap, type RoundAuthority, type Rng } from "@/engine";
import { DEFAULT_BALANCE, DEFAULT_BET } from "@/game/constants";
import { actionStateFor } from "./components/action-state";
import { createGameSession, type GameSession } from "./session";
import type { WalletRefusal } from "./store/wallet-store";
import { adjacentDoubles, floorCentsBinary } from "./test/money-oracle";

const FRAME = 1 / 60;

/** mulberry32 — a small deterministic Rng for seeded runs. */
const seeded = (seed: number): Rng => {
  let a = seed >>> 0;
  return {
    next: () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
};

const STAKES = [0.01, 0.02, 0.07, 0.1, 0.29, 0.57, 1, 1.15, 5, 8.2, 33.33, 100];

/** Whole-cent amount → integer cents (exact for canonical cent doubles in range). */
const cents = (amount: number) => BigInt(Math.round(amount * 100));

interface RunResult {
  trail: number[];
  events: string[];
  refusals: WalletRefusal[];
  rounds: number;
  session: GameSession;
}

/**
 * Play `rounds` rounds. After EVERY engine tick assert:
 *  - I8: engine participant ⇔ wallet participating, and the wallet's locked
 *    bet equals the engine's betAmount;
 *  - I4/I9/I10: the balance is a finite, nonnegative canonical cent value
 *    equal to the independent integer-cent ledger.
 */
function play(seed: number, rounds: number): RunResult {
  const refusals: WalletRefusal[] = [];
  const session = createGameSession({
    authority: new LocalRoundAuthority(seeded(seed)),
    worldRng: seeded(seed + 1),
    diagnostics: true,
    walletDiagnosticsLog: (_message, refusal) => refusals.push(refusal),
  });
  const { engine, wallet } = session;
  const player = seeded(seed + 2);

  // ----- independent ledger, from engine events only -----
  let ledger = cents(DEFAULT_BALANCE);
  let stake: bigint | null = null;
  let settled: "cashout" | "jackpot" | null = null;
  let jackpotCents = 0n;
  const events: string[] = [];
  const on = <K extends keyof EngineEventMap>(name: K, fn: (p: EngineEventMap[K]) => void) =>
    engine.events.on(name, (p) => {
      events.push(`${String(name)}:${JSON.stringify(p)}`);
      fn(p);
    });
  on("bettingOpened", () => {
    stake = null;
    settled = null;
  });
  on("betPlaced", ({ amount }) => {
    stake = cents(amount);
    ledger -= stake;
  });
  on("cashedOut", ({ multiplier }) => {
    if (stake === null) return;
    ledger += floorCentsBinary(stake, multiplier);
    settled = "cashout";
  });
  on("shipImpact", ({ jackpotMultiplier }) => {
    if (stake === null || settled !== null) return;
    jackpotCents = (stake * cents(jackpotMultiplier)) / 100n;
    ledger += jackpotCents;
    settled = "jackpot";
  });
  on("chestPicked", ({ finalMultiplier }) => {
    if (stake === null || settled !== "jackpot") return;
    ledger += (stake * cents(finalMultiplier)) / 100n - jackpotCents;
  });
  on("crashed", () => {}); // a loss credits nothing; logged for coverage and replay
  on("commandRejected", () => {});

  const trail: number[] = [];
  let roundsSeen = 0;
  engine.events.on("roundEnded", () => roundsSeen++);

  let cashAtTick = -1;
  let pickAtTick = -1;
  let ticksInState = 0;
  let lastState = engine.state;
  let decidedBet = false;

  const check = () => {
    const pub = engine.getPublicState();
    const w = wallet.get();
    // I8
    expect(pub.participant !== null).toBe(w.participating);
    if (pub.participant) expect(w.roundBet).toBe(pub.participant.betAmount);
    // I4 / I10 / ledger
    expect(Number.isFinite(w.balance) && w.balance >= 0).toBe(true);
    expect(w.balance).toBe(Number(ledger) / 100);
  };

  for (let guard = 0; roundsSeen < rounds && guard < 5_000_000; guard++) {
    const state = engine.state;
    if (state !== lastState) {
      lastState = state;
      ticksInState = 0;
      if (state === "betting") decidedBet = false;
      if (state === "diving")
        cashAtTick = player.next() < 0.3 ? -1 : Math.floor(player.next() * 600);
      if (state === "bonus")
        pickAtTick = player.next() < 0.3 ? -1 : Math.floor(player.next() * 120);
    }
    if (state === "betting" && !decidedBet && ticksInState >= 5) {
      decidedBet = true;
      if (player.next() >= 0.15) {
        const choice = STAKES[Math.floor(player.next() * STAKES.length)];
        // A few all-in bets exercise the balance boundary.
        const amount = player.next() < 0.05 ? wallet.get().balance : choice;
        session.submit({ type: "placeBet", amount });
      }
    }
    if (state === "diving" && ticksInState === cashAtTick) session.submit({ type: "cashOut" });
    if (state === "bonus" && ticksInState === pickAtTick) {
      session.submit({ type: "pickChest", chestId: Math.floor(player.next() * 3) as 0 | 1 | 2 });
    }
    engine.advance(FRAME);
    ticksInState++;
    check();
    if (trail.length === 0 || trail[trail.length - 1] !== wallet.get().balance) {
      trail.push(wallet.get().balance);
    }
  }
  expect(roundsSeen).toBe(rounds);
  return { trail, events, refusals, rounds: roundsSeen, session };
}

describe("M1 integration — repeated cycles through session.submit only", () => {
  it("every tick: I8 holds, the balance is a canonical cent value equal to the integer ledger, and no wallet guard fires", () => {
    const run = play(20261114, 150);
    expect(run.refusals).toEqual([]); // the guards are never stricter than the engine in the normal flow (K1)
    const history = run.events.join("\n");
    // Every settlement path was exercised.
    for (const name of ["cashedOut:", "crashed:", "shipImpact:", "chestPicked:"]) {
      expect(history.includes(name), name).toBe(true);
    }
  }, 120_000);

  it("deterministic replay: the same seeds give the same event log and the same ledger trail", () => {
    const a = play(7, 40);
    const b = play(7, 40);
    expect(b.events).toEqual(a.events);
    expect(b.trail).toEqual(a.trail);
    expect(b.session.wallet.get()).toEqual(a.session.wallet.get());
  }, 120_000);
});

// MT-06 (docs/07 §23.7 "Repeated cycles: thousands…", "I8 property… thousands",
// "Normal-flow non-interference… thousands"): 4 seeds × 500 = 2,000 rounds
// through the unchanged play() oracle — I8 and the integer-cent ledger after
// every tick, no wallet refusal, every settlement path exercised per seed.
// (Seed 505 replaced 404, whose 500 rounds contain no chest pick, so its
// path-coverage check could never pass; every invariant held on 404.)
describe("M1 integration — repeated cycles at scale (MT-06)", () => {
  for (const seed of [101, 202, 303, 505]) {
    it(`seed ${seed}, 500 rounds: I8 and the integer-cent ledger hold after every tick; no wallet guard fires; every settlement path is exercised`, () => {
      const run = play(seed, 500);
      expect(run.refusals).toEqual([]);
      const history = run.events.join("\n");
      for (const name of ["cashedOut:", "crashed:", "shipImpact:", "chestPicked:"]) {
        expect(history.includes(name), `seed ${seed}: ${name}`).toBe(true);
      }
    }, 600_000);
  }
});

describe("M1 integration — invalid stakes from every caller", () => {
  it("session.submit: invalid stakes never reach the engine, consume nothing, and a later valid bet behaves as if they never happened", () => {
    const run = (withInvalid: boolean) => {
      const session = createGameSession({
        authority: new LocalRoundAuthority(seeded(99)),
        worldRng: seeded(100),
      });
      const log: string[] = [];
      session.engine.events.on("betPlaced", (p) => log.push(JSON.stringify(p)));
      session.engine.events.on("commandRejected", (p) => log.push(JSON.stringify(p)));
      if (withInvalid) {
        for (const amount of [0, 0.004, 0.005, 1.005, NaN, Infinity, -1]) {
          session.submit({ type: "placeBet", amount });
        }
      }
      session.submit({ type: "placeBet", amount: 0.01 });
      for (let i = 0; i < 2000; i++) session.engine.advance(FRAME);
      return { log, snap: session.engine.snapshot(), wallet: session.wallet.get() };
    };
    const clean = run(false);
    const noisy = run(true);
    expect(noisy.log).toEqual(clean.log);
    expect(noisy.snap).toEqual(clean.snap); // no RNG draw, no state difference
    expect(noisy.wallet).toEqual(clean.wallet);
  });

  it("direct engine.submit (E-X2): a sub-cent stake is rejected by the engine — no betPlaced, no wallet refusal, no money moves", () => {
    // E-X2 closes the pre-E-X2 gap: the engine now rejects 0.005 as
    // invalid-amount, so betPlaced is never emitted and the wallet never
    // sees the invalid stake. I8 holds for non-UI callers.
    const refusals: WalletRefusal[] = [];
    const session = createGameSession({
      authority: {
        sampleCrashPoint: () => 1e9,
        sampleJackpot: () => 500,
        rollBonusChests: () => [
          { id: 0, multiplier: 50, opened: false },
          { id: 1, multiplier: 50, opened: false },
          { id: 2, multiplier: 50, opened: false },
        ],
      },
      worldRng: seeded(5),
      diagnostics: true,
      walletDiagnosticsLog: (_m, r) => refusals.push(r),
    });
    const rejections: unknown[] = [];
    session.engine.events.on("commandRejected", (p) => rejections.push(p));
    session.engine.submit({ type: "placeBet", amount: 0.005 });
    for (let i = 0; i < 3000 && session.engine.state !== "bonus"; i++)
      session.engine.advance(FRAME);
    session.engine.submit({ type: "pickChest", chestId: 0 });
    for (let i = 0; i < 3000 && session.engine.state !== "betting"; i++)
      session.engine.advance(FRAME);
    expect(session.wallet.get().balance).toBe(DEFAULT_BALANCE);
    expect(session.wallet.get().lastWin).toBeNull();
    expect(session.wallet.get().participating).toBe(false);
    expect(refusals).toEqual([]);
    expect(rejections[0]).toEqual(
      expect.objectContaining({
        command: { type: "placeBet", amount: 0.005 },
        reason: "invalid-amount",
      }),
    );
  });
});

describe("M1 integration — W11 at the 2^44 boundary with the real engine (owner 2026-11-14)", () => {
  it("a jackpot landing on 2^44 becomes unresolved claims: no credit, no duplicate settlement, no loss entry, I8 holds; later rounds settle exactly", () => {
    // Scripted authority: never crash; jackpots 1e10, then 2; chests ×1 in
    // round 1, ×1.5 afterwards. Every chest is picked by the E-X1 timeout
    // (chest 0), so the engine alone drives every settlement event.
    let round = 0;
    const refusals: WalletRefusal[] = [];
    const session = createGameSession({
      authority: {
        sampleCrashPoint: () => 1e9,
        sampleJackpot: () => (round === 1 ? 1e10 : 2),
        rollBonusChests: () => {
          const m = round === 1 ? 1 : 1.5;
          return [
            { id: 0, multiplier: m, opened: false },
            { id: 1, multiplier: m, opened: false },
            { id: 2, multiplier: m, opened: false },
          ];
        },
      },
      worldRng: seeded(11),
      diagnostics: true,
      walletDiagnosticsLog: (_m, r) => refusals.push(r),
    });
    const { engine, wallet } = session;
    const settlements: string[] = [];
    for (const name of [
      "betPlaced",
      "cashedOut",
      "shipImpact",
      "chestPicked",
      "crashed",
    ] as const) {
      engine.events.on(name, (p) => settlements.push(`${round}:${name}:${JSON.stringify(p)}`));
    }

    const check = () => {
      const pub = engine.getPublicState();
      const w = wallet.get();
      expect(pub.participant !== null).toBe(w.participating); // I8
      if (pub.participant) expect(w.roundBet).toBe(pub.participant.betAmount);
      expect(w.balance).toBeLessThan(2 ** 44); // the W11 invariant
    };
    const playRound = (stake: number) => {
      round++;
      session.submit({ type: "placeBet", amount: stake });
      for (let i = 0; i < 20_000 && engine.state !== "bonus"; i++) {
        engine.advance(FRAME);
        check();
      }
      for (let i = 0; i < 20_000 && engine.state !== "betting"; i++) {
        engine.advance(FRAME);
        check();
      }
      expect(engine.state).toBe("betting");
    };

    const S = 7592186044416; // 1e13 − S + 2S = 2^44 exactly
    playRound(1000); // jackpot 1e10 → balance 1e13; chest ×1 → delta 0
    expect(wallet.get().balance).toBe(10_000_000_000_000);
    playRound(S);
    expect(wallet.get().balance).toBe(10_000_000_000_000 - S);
    expect(wallet.get().hasCashed).toBe(false); // not settled: held as a claim
    expect(wallet.get().history).toEqual([
      { mult: 1e10, crashed: false },
      { mult: 1e10, crashed: false },
    ]); // no entry for round 2 (neither a win nor a loss)
    playRound(1); // jackpot 2 + chest ×1.5 → +3, inside the envelope

    // The engine settled each round exactly once; round 2's events credited nothing.
    expect(settlements.filter((e) => e.startsWith("2:"))).toEqual([
      `2:betPlaced:${JSON.stringify({ roundId: 2, amount: S })}`,
      `2:shipImpact:${JSON.stringify({ roundId: 2, jackpotMultiplier: 2 })}`,
      `2:chestPicked:${JSON.stringify({ roundId: 2, chestId: 0, chestMultiplier: 1.5, finalMultiplier: 3 })}`,
    ]);
    expect(refusals.map((r) => `${r.event}:${r.rule}`)).toEqual([
      "shipImpact:W11",
      "chestPicked:W11",
    ]);
    const s = 759218604441600n; // S in cents
    expect(wallet.unresolvedClaims()).toEqual([
      expect.objectContaining({
        roundId: 2,
        stake: S,
        event: "shipImpact",
        rule: "W11",
        creditedCents: 0n,
        unpaidCents: 2n * s,
      }),
      expect.objectContaining({
        roundId: 2,
        stake: S,
        event: "chestPicked",
        rule: "W11",
        creditedCents: 0n,
        unpaidCents: s,
      }),
    ]);
    // Exact integer-cent ledger: 1e15 − s − 100 + 200 (jackpot) + 100 (chest delta).
    expect(BigInt(Math.round(wallet.get().balance * 100))).toBe(1_000_000_000_000_000n - s + 200n);
    expect(wallet.get().balance).toBe(2407813955586);
    expect(wallet.get().history.slice(0, 2)).toEqual([
      { mult: 3, crashed: false },
      { mult: 2, crashed: false },
    ]);
  }, 120_000);
});

// ----- shared by MT-02 to MT-05 -----

/** A scripted authority: never crashes unless `crashPoint` says so; fixed jackpot; three equal chests. */
const scripted = (jackpot: number, chest: number, crashPoint = 1e9): RoundAuthority => ({
  sampleCrashPoint: () => crashPoint,
  sampleJackpot: () => jackpot,
  rollBonusChests: () => [
    { id: 0, multiplier: chest, opened: false },
    { id: 1, multiplier: chest, opened: false },
    { id: 2, multiplier: chest, opened: false },
  ],
});

/** A session over `authority` whose wallet refusals (W9) are recorded into `refusals`. */
const recordedSession = (authority: RoundAuthority, refusals: WalletRefusal[]): GameSession =>
  createGameSession({
    authority,
    worldRng: seeded(31),
    diagnostics: true,
    walletDiagnosticsLog: (_m, r) => refusals.push(r),
  });

/** I8 at this instant: engine participant ⇔ wallet participating; the locked bet is the engine's betAmount. */
const expectI8 = (session: GameSession, where = "") => {
  const participant = session.engine.getPublicState().participant;
  const w = session.wallet.get();
  expect(participant !== null, `I8 ${where}`).toBe(w.participating);
  if (participant) expect(w.roundBet, `I8 ${where}`).toBe(participant.betAmount);
};

/** Advance one tick at a time until `done()` holds (guarded), calling `each` after every tick. */
const runUntil = (session: GameSession, done: () => boolean, each: () => void = () => {}) => {
  for (let i = 0; i < 20_000 && !done(); i++) {
    session.engine.advance(FRAME);
    each();
  }
  expect(done()).toBe(true);
};

/** Count roundEnded events, so a wait can target "the round has completed" (the state starts in betting). */
const roundsEnded = (session: GameSession) => {
  let ended = 0;
  session.engine.events.on("roundEnded", () => ended++);
  return () => ended;
};

// ----- MT-02: statistical edge regression (owner D2; docs/07 §23.7, M1-D7, M1-D8, V2) -----
//
// Each round either wins at one fixed cashout multiplier M or loses, so the
// return per unit staked is (wins × C) / (N × stake), with C the wallet's
// credit per win. Both factors come from the real code:
//  1. M and C: one real session (an authority that never crashes) bets
//     through session.submit, waits for the first tick with multiplier ≥
//     target, cashes out, and reads cashedOut.multiplier and the credit.
//  2. Survival: N crash points from LocalRoundAuthority (the production
//     distribution, public engine surface); a round wins iff crash point > M.
//     This is exact: the crash fires on the first tick with m ≥ crash point
//     (simulation.ts), the cashout pays the last completed tick's multiplier
//     (D4), and every earlier tick is below the target ≤ M.
// A regression signal, not a proof (§23.7). Strict "below 1" in BigInt, no
// tolerance, no retry, no skip; changing SEED or N is a documented test
// change that needs review.
describe("M1 integration — statistical edge regression (MT-02)", () => {
  const SEED = 20261113;
  const N = 20_000;
  // stake, cashout target: the review's targets for 0.01 and 0.02, and 0.10 @ 1.5× (owner D2).
  const cases: Array<[number, number]> = [
    [0.01, 1.5],
    [0.01, 2.5],
    [0.02, 1.25],
    [0.1, 1.5],
  ];

  const measureCashout = (stake: number, target: number) => {
    const session = createGameSession({
      authority: scripted(100, 2),
      worldRng: seeded(SEED + 1),
    });
    const { engine, wallet } = session;
    const cashed: Array<{ multiplier: number; state: string }> = [];
    engine.events.on("cashedOut", ({ multiplier }) => {
      cashed.push({ multiplier, state: engine.state });
    });
    const reachedTarget = () => engine.getPublicState().multiplier >= target;
    session.submit({ type: "placeBet", amount: stake });
    runUntil(session, () => engine.state === "diving");
    runUntil(session, () => engine.state !== "diving" || reachedTarget());
    expect(engine.state).toBe("diving");
    const before = cents(wallet.get().balance);
    session.submit({ type: "cashOut" });
    engine.advance(FRAME);
    expect(cashed).toHaveLength(1);
    expect(cashed[0].state).toBe("diving"); // the engine was still diving when the cashout applied
    return { M: cashed[0].multiplier, C: cents(wallet.get().balance) - before };
  };

  for (const [stake, target] of cases) {
    it(`stake ${stake} at a ${target}× cashout target: return per unit staked is below 1 (seed ${SEED}, N = ${N})`, () => {
      const stakeCents = cents(stake);
      const { M, C } = measureCashout(stake, target);
      expect(M).toBeGreaterThanOrEqual(target);
      expect(C).toBe(floorCentsBinary(stakeCents, M));

      const authority = new LocalRoundAuthority(seeded(SEED));
      let wins = 0;
      for (let i = 0; i < N; i++) if (authority.sampleCrashPoint() > M) wins++;

      const ratio = (wins * Number(C)) / (N * Number(stakeCents));
      const detail = `stake=${stake} target=${target} M=${M} C=${C} wins=${wins} N=${N} seed=${SEED} return=${ratio}`;
      expect(BigInt(wins) * C < BigInt(N) * stakeCents, detail).toBe(true);
    }, 120_000);
  }
});

// ----- MT-03: every settlement path with boundary stakes (docs/07 §23.7; I2, I8, I9) -----

describe("M1 integration — every settlement path with boundary stakes (MT-03)", () => {
  type Path =
    | "manual cashout"
    | "crash (loss)"
    | "jackpot + chest pick"
    | "jackpot + chest timeout (E-X1)"
    | "spectator through bonus";
  const PATHS: Path[] = [
    "manual cashout",
    "crash (loss)",
    "jackpot + chest pick",
    "jackpot + chest timeout (E-X1)",
    "spectator through bonus",
  ];
  const cases: Array<[Path, number]> = [];
  for (const path of PATHS) for (const stake of [0.01, 1000]) cases.push([path, stake]);

  // Jackpot 50.01, chests ×1.01: the engine emits finalMultiplier
  // +(50.01 × 1.01).toFixed(2) = 50.51. Expected cents are integer literals,
  // checked against ⌊k · M / 100⌋ on the two-decimal multipliers.
  const JACKPOT = 50.01;
  const FINAL = 50.51;
  const CRASH_AT = 1.5;
  interface Expected {
    total: bigint;
    credits: bigint[];
    history: Array<{ mult: number; crashed: boolean }>;
    lastWin: { amount: number; mult: number } | null;
  }
  const CHEST_CENTS: Record<number, { jackpot: bigint; total: bigint }> = {
    0.01: { jackpot: 50n, total: 50n }, // 0.50, then a delta of 0.00
    1000: { jackpot: 5_001_000n, total: 5_051_000n }, // 50,010, then a delta of 500
  };

  it.each(cases)(
    "%s, stake %s: I8 every tick, no refusals, exact integer-cent ledger, credits sum to the rounded-down total",
    (path, stake) => {
      const refusals: WalletRefusal[] = [];
      const session = recordedSession(
        scripted(JACKPOT, 1.01, path === "crash (loss)" ? CRASH_AT : 1e9),
        refusals,
      );
      const { engine, wallet } = session;
      const participates = path !== "spectator through bonus";
      const stakeCents = participates ? cents(stake) : 0n;

      // Credits per participation: the balance change across each settlement event.
      let prev = cents(DEFAULT_BALANCE);
      const credits: bigint[] = [];
      const credit = () => {
        const now = cents(wallet.get().balance);
        credits.push(now - prev);
        prev = now;
      };
      const cashedAt: number[] = [];
      const picks: Array<EngineEventMap["chestPicked"]> = [];
      engine.events.on("betPlaced", () => {
        prev = cents(wallet.get().balance);
      });
      engine.events.on("cashedOut", ({ multiplier }) => {
        cashedAt.push(multiplier);
        credit();
      });
      engine.events.on("shipImpact", credit);
      engine.events.on("chestPicked", (p) => {
        picks.push(p);
        credit();
      });
      const ended = roundsEnded(session);
      const check = () => expectI8(session);

      if (participates) session.submit({ type: "placeBet", amount: stake });
      if (path === "manual cashout") {
        runUntil(session, () => engine.state === "diving", check);
        runUntil(session, () => engine.getPublicState().multiplier >= 1.5, check);
        session.submit({ type: "cashOut" });
      }
      if (path === "jackpot + chest pick") {
        runUntil(session, () => engine.state === "bonus", check);
        session.submit({ type: "pickChest", chestId: 1 });
      }
      runUntil(session, () => ended() === 1, check);

      const expectedFor = (): Expected => {
        switch (path) {
          case "manual cashout": {
            expect(cashedAt).toHaveLength(1);
            const m = cashedAt[0];
            const total = floorCentsBinary(stakeCents, m);
            if (stake === 0.01) expect(total).toBe(1n); // not the old round-to-nearest 0.02
            return {
              total,
              credits: [total, 0n], // the cashout; the round's jackpot then pays nothing more
              history: [
                { mult: JACKPOT, crashed: false },
                { mult: m, crashed: false },
              ],
              lastWin: { amount: Number(total) / 100, mult: m },
            };
          }
          case "crash (loss)":
            return {
              total: 0n,
              credits: [],
              history: [{ mult: CRASH_AT, crashed: true }],
              lastWin: null,
            };
          case "jackpot + chest pick":
          case "jackpot + chest timeout (E-X1)": {
            const { jackpot, total } = CHEST_CENTS[stake];
            expect(jackpot).toBe((stakeCents * 5001n) / 100n);
            expect(total).toBe((stakeCents * 5051n) / 100n);
            expect(picks).toEqual([
              {
                roundId: 1,
                chestId: path === "jackpot + chest pick" ? 1 : 0,
                chestMultiplier: 1.01,
                finalMultiplier: FINAL,
              },
            ]);
            return {
              total,
              credits: [jackpot, total - jackpot],
              history: [
                { mult: FINAL, crashed: false },
                { mult: JACKPOT, crashed: false },
              ],
              lastWin: { amount: Number(total) / 100, mult: FINAL },
            };
          }
          case "spectator through bonus":
            expect(picks).toEqual([]);
            return {
              total: 0n,
              credits: [0n],
              history: [{ mult: JACKPOT, crashed: false }],
              lastWin: null,
            };
        }
      };
      const expected = expectedFor();

      expect(refusals).toEqual([]);
      expect(credits).toEqual(expected.credits);
      expect(credits.reduce((a, b) => a + b, 0n)).toBe(expected.total);
      expect(cents(wallet.get().balance)).toBe(
        cents(DEFAULT_BALANCE) - stakeCents + expected.total,
      );
      expect(wallet.get().history).toEqual(expected.history);
      expect(wallet.get().lastWin).toEqual(expected.lastWin);
    },
    60_000,
  );
});

// ----- MT-04: consistency cases (docs/07 §23.7, §23.12 cases 4–8) -----
//
// MT-04a, 04b-i, 04c, 04d and 04e establish passing invariants (closure
// criterion 2). MT-04b-ii is a characterization of the recorded V4
// limitation (criterion 6 only): it pins a known violation and is not
// evidence of financial safety.

describe("M1 integration — consistency cases (MT-04)", () => {
  const ONE_CENT = adjacentDoubles(0.01);

  it('MT-04a: session.engine.submit with every invalid stake and the non-number "5" is rejected invalid-amount; a full jackpot + chest round then credits nothing (G11, case 8)', () => {
    const refusals: WalletRefusal[] = [];
    const session = recordedSession(scripted(500, 50), refusals);
    const { engine, wallet } = session;
    const invalid = [
      0,
      -0,
      -1,
      0.001,
      0.004,
      0.005,
      0.009,
      1.005,
      0.1 + 0.2,
      NaN,
      Infinity,
      -Infinity,
      ONE_CENT.below,
      ONE_CENT.above,
      1000.0000000000001,
      "5" as unknown as number, // E-X2 non-number payload
    ];
    const rejected: Array<EngineEventMap["commandRejected"]> = [];
    const placed: unknown[] = [];
    engine.events.on("commandRejected", (p) => rejected.push(p));
    engine.events.on("betPlaced", (p) => placed.push(p));
    const actionBefore = actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET);
    expect(actionBefore).toEqual({ kind: "placeBet", enabled: true });

    for (const amount of invalid) engine.submit({ type: "placeBet", amount });
    engine.advance(FRAME);
    expect(rejected.map((r) => r.reason)).toEqual(invalid.map(() => "invalid-amount"));
    expect(rejected.map((r) => r.command)).toEqual(
      invalid.map((amount) => ({ type: "placeBet", amount })),
    );
    expect(placed).toEqual([]);
    expect(engine.getPublicState().participant).toBeNull();
    expect(wallet.get()).toMatchObject({
      balance: DEFAULT_BALANCE,
      participating: false,
      roundBet: 0,
    });
    expect(actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET)).toEqual(
      actionBefore,
    );

    // A full round to jackpot + chest.
    const ended = roundsEnded(session);
    const check = () => {
      expect(engine.getPublicState().participant).toBeNull();
      expect(wallet.get().participating).toBe(false);
    };
    runUntil(session, () => engine.state === "bonus", check);
    engine.submit({ type: "pickChest", chestId: 0 });
    runUntil(session, () => ended() === 1, check);
    expect(rejected.slice(invalid.length).map((r) => r.reason)).toEqual(["not-bonus-eligible"]);
    expect(placed).toEqual([]);
    expect(wallet.get()).toMatchObject({ balance: DEFAULT_BALANCE, lastWin: null });
    expect(refusals).toEqual([]);
  });

  it("MT-04b-i: a forged betPlaced with an invalid amount is refused by W1 — nothing changes, and the round's real jackpot credits nothing (I6, I10, I11: a local tripwire, not event authentication — M1-D11)", () => {
    const refusals: WalletRefusal[] = [];
    const session = recordedSession(scripted(500, 50), refusals);
    const { engine, wallet } = session;
    const before = wallet.get();
    for (const amount of [0.004, 0, NaN, Infinity]) {
      engine.events.emit("betPlaced", { roundId: engine.getPublicState().roundId, amount });
      engine.events.dispatchQueued();
    }
    expect(wallet.get()).toBe(before); // no snapshot written
    expect(refusals.map((r) => `${r.event}:${r.rule}`)).toEqual([
      "betPlaced:W1",
      "betPlaced:W1",
      "betPlaced:W1",
      "betPlaced:W1",
    ]);
    expect(engine.getPublicState().participant).toBeNull();
    expect(wallet.get()).toMatchObject({ balance: DEFAULT_BALANCE, participating: false });

    const ended = roundsEnded(session);
    runUntil(
      session,
      () => ended() === 1,
      () => expectI8(session),
    );
    expect(wallet.get()).toMatchObject({ balance: DEFAULT_BALANCE, lastWin: null });
    expect(refusals).toHaveLength(4);
  });

  it("KNOWN LIMITATION V4 — expected violation, not a guarantee (§23.15 V4, §23.12 case 4): a forged valid betPlaced debits the wallet with no engine participant (I8 violated); the round's real shipImpact then credits 10 × J; recovery only at the next bettingOpened", () => {
    // MT-04b-ii, characterization (M1-D11): pins today's behavior exactly. It
    // is not evidence for I1–I10. When Phase 8 closes V4 this fails, and the
    // update is a sanctioned rewrite.
    const J = 2;
    const refusals: WalletRefusal[] = [];
    const session = recordedSession(scripted(J, 1.5), refusals);
    const { engine, wallet } = session;
    const picks: unknown[] = [];
    engine.events.on("chestPicked", (p) => picks.push(p));

    engine.events.emit("betPlaced", { roundId: 1, amount: 10 });
    engine.events.dispatchQueued();
    expect(engine.getPublicState().participant).toBeNull();
    expect(wallet.get()).toMatchObject({ balance: 990, participating: true, roundBet: 10 });
    expect(actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET).kind).toBe(
      "betLocked",
    );

    runUntil(session, () => engine.state === "diving");
    expect(engine.getPublicState().participant).toBeNull();
    expect(actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET).kind).toBe("cashOut");

    runUntil(session, () => engine.state === "impact");
    expect(engine.getPublicState().participant).toBeNull();
    expect(wallet.get()).toMatchObject({
      balance: 1010, // 990 + 10 × J: money moved for a participation the engine never had
      lastWin: { amount: 20, mult: J },
      settledBy: "jackpot",
    });

    const ended = roundsEnded(session);
    runUntil(session, () => ended() === 1);
    expect(picks).toEqual([]); // no eligible engine participant: no chest
    expect(wallet.get()).toMatchObject({ balance: 1010, participating: false, roundBet: 0 });
    expect(refusals).toEqual([]);
  });

  it("MT-04c: a forged duplicate betPlaced after a real bet is refused by W2 — one debit; roundBet equals betAmount; I8 holds (I12 idempotency, not authenticity)", () => {
    const refusals: WalletRefusal[] = [];
    const session = recordedSession(scripted(500, 50), refusals);
    const { engine, wallet } = session;
    session.submit({ type: "placeBet", amount: 10 });
    engine.advance(FRAME);
    const before = wallet.get();
    expect(before).toMatchObject({ balance: 990, roundBet: 10, participating: true });

    for (const amount of [10, 20]) {
      engine.events.emit("betPlaced", { roundId: 1, amount });
      engine.events.dispatchQueued();
    }
    expect(wallet.get()).toBe(before);
    expect(refusals.map((r) => `${r.event}:${r.rule}`)).toEqual(["betPlaced:W2", "betPlaced:W2"]);
    expect(wallet.get().roundBet).toBe(engine.getPublicState().participant?.betAmount);
    expectI8(session);
  });

  it("MT-04d: same-tick orderings — via engine.submit, invalid-then-valid accepts the valid bet and valid-then-invalid rejects the second as already-participating; via session.submit, invalid amounts never reach the engine", () => {
    const run = (submit: (session: GameSession, amount: number) => void, amounts: number[]) => {
      const refusals: WalletRefusal[] = [];
      const session = recordedSession(scripted(500, 50), refusals);
      const { engine, wallet } = session;
      const log: string[] = [];
      engine.events.on("betPlaced", (p) => log.push(`betPlaced:${p.amount}`));
      engine.events.on("commandRejected", (p) => log.push(`rejected:${p.reason}`));
      for (const amount of amounts) submit(session, amount);
      engine.advance(FRAME);
      expectI8(session);
      expect(engine.getPublicState().participant?.betAmount).toBe(10);
      expect(wallet.get()).toMatchObject({ balance: 990, roundBet: 10, participating: true });
      expect(actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET).kind).toBe(
        "betLocked",
      );
      expect(refusals).toEqual([]);
      return log;
    };
    const direct = (session: GameSession, amount: number) =>
      session.engine.submit({ type: "placeBet", amount });
    const viaSession = (session: GameSession, amount: number) =>
      session.submit({ type: "placeBet", amount });

    expect(run(direct, [0.005, 10])).toEqual(["rejected:invalid-amount", "betPlaced:10"]);
    // The engine checks participation before the amount (E-X2 order).
    expect(run(direct, [10, 0.005])).toEqual(["betPlaced:10", "rejected:already-participating"]);
    expect(run(viaSession, [0.005, 10])).toEqual(["betPlaced:10"]);
    expect(run(viaSession, [10, 0.005])).toEqual(["betPlaced:10"]);
  });

  it("MT-04e: a bet on the last betting tick is accepted; dispatch order betPlaced, stateChanged, diveStarted; debited before diveStarted; the next action state is CASH OUT", () => {
    // The last betting tick, measured on a probe session.
    const probe = recordedSession(scripted(500, 50), []);
    let lastBetting = -1;
    while (probe.engine.state === "betting") {
      probe.engine.advance(FRAME);
      lastBetting++;
    }

    const refusals: WalletRefusal[] = [];
    const session = recordedSession(scripted(500, 50), refusals);
    const { engine, wallet } = session;
    for (let i = 0; i < lastBetting; i++) engine.advance(FRAME);
    expect(engine.state).toBe("betting");

    const order: string[] = [];
    const balanceAtDive: number[] = [];
    engine.events.on("betPlaced", () => order.push("betPlaced"));
    engine.events.on("stateChanged", ({ from, to }) => order.push(`stateChanged:${from}→${to}`));
    engine.events.on("diveStarted", () => {
      order.push("diveStarted");
      balanceAtDive.push(wallet.get().balance);
    });
    session.submit({ type: "placeBet", amount: 10 });
    engine.advance(FRAME);

    expect(order).toEqual(["betPlaced", "stateChanged:betting→diving", "diveStarted"]);
    expect(balanceAtDive).toEqual([990]);
    expect(engine.state).toBe("diving");
    expectI8(session);
    expect(actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET)).toEqual({
      kind: "cashOut",
    });
    expect(refusals).toEqual([]);
  });
});

// ----- MT-05: restore with a participant (docs/07 §23.7, §23.12 case 9, §23.15 V6, L3, Q4) -----
//
// Characterization only (closure criterion 6): these pin today's behavior of
// the recorded limitation, in both directions. They are not a guarantee and
// not evidence for I1–I10. No production behavior changes; a Phase 8 fix
// replaces them as a sanctioned rewrite.

describe("M1 integration — restore with a participant (MT-05)", () => {
  it("KNOWN LIMITATION V6/L3 — expected violation, not a guarantee (§23.15 V6, §23.12 case 9): a snapshot with a participant restored into a fresh session — the engine participates, the wallet does not; PLACE BET is offered and rejected; the round pays the wallet nothing; round 2 recovers", () => {
    // MT-05a, forward direction (M1-D11).
    const a = recordedSession(scripted(2, 1.5), []);
    a.submit({ type: "placeBet", amount: 10 });
    a.engine.advance(FRAME);
    const snapshot = a.engine.snapshot();
    expect(snapshot.round).toMatchObject({ state: "betting", participant: { betAmount: 10 } });

    const refusals: WalletRefusal[] = [];
    const b = recordedSession(scripted(2, 1.5), refusals);
    const { engine, wallet } = b;
    const rejected: string[] = [];
    const picks: Array<EngineEventMap["chestPicked"]> = [];
    engine.events.on("commandRejected", (p) => rejected.push(p.reason));
    engine.events.on("chestPicked", (p) => picks.push(p));
    const ended = roundsEnded(b);

    engine.restore(snapshot);
    expect(engine.getPublicState().participant).toMatchObject({ betAmount: 10, cashedOut: false });
    expect(wallet.get()).toMatchObject({ balance: 1000, participating: false, roundBet: 0 }); // I8 violated
    expect(actionStateFor(engine.getPublicState(), wallet.get(), 10)).toEqual({
      kind: "placeBet",
      enabled: true,
    });
    b.submit({ type: "placeBet", amount: 10 }); // offered by the button, so I3 is violated
    engine.advance(FRAME);
    expect(rejected).toEqual(["already-participating"]);
    expect(wallet.get().balance).toBe(1000);

    runUntil(b, () => engine.state === "diving");
    expect(actionStateFor(engine.getPublicState(), wallet.get(), DEFAULT_BET).kind).toBe(
      "spectating",
    );

    runUntil(b, () => engine.state === "impact");
    expect(engine.getPublicState().participant).toMatchObject({
      cashedOut: true,
      cashedOutAt: 2,
      bonusEligible: true,
    });
    expect(wallet.get()).toMatchObject({ balance: 1000, lastWin: null, participating: false });

    runUntil(b, () => engine.state === "bonus");
    b.submit({ type: "pickChest", chestId: 1 });
    engine.advance(FRAME);
    expect(picks).toEqual([{ roundId: 1, chestId: 1, chestMultiplier: 1.5, finalMultiplier: 3 }]);
    expect(wallet.get()).toMatchObject({ balance: 1000, lastWin: null });
    expect(refusals).toEqual([]);
    expect(wallet.unresolvedClaims()).toEqual([]);

    // Round 2 recovers: the bet debits and settles exactly (jackpot 2, then chest 0 by timeout).
    runUntil(b, () => ended() === 1);
    b.submit({ type: "placeBet", amount: 10 });
    runUntil(
      b,
      () => ended() === 2,
      () => expectI8(b, "round 2"),
    );
    expect(cents(wallet.get().balance)).toBe(100000n - 1000n + 2000n + 1000n); // −10, +20, +(30 − 20)
    expect(refusals).toEqual([]);
    expect(wallet.unresolvedClaims()).toEqual([]);
  });

  it("KNOWN LIMITATION V6/L3 — expected violation, not a guarantee (§23.15 V6, §23.12 case 9, Q4 correction): a pre-bet snapshot restored after a bet — the wallet participates, the engine does not; the round's real shipImpact credits 10 × 2; round 2 resets the wallet", () => {
    // MT-05b, reverse direction (M1-D11).
    const refusals: WalletRefusal[] = [];
    const session = recordedSession(scripted(2, 1.5), refusals);
    const { engine, wallet } = session;
    const picks: unknown[] = [];
    engine.events.on("chestPicked", (p) => picks.push(p));
    const ended = roundsEnded(session);

    const snapshot = engine.snapshot(); // round 1 betting, no participant
    session.submit({ type: "placeBet", amount: 10 });
    engine.advance(FRAME);
    expect(wallet.get()).toMatchObject({ balance: 990, participating: true, roundBet: 10 });

    engine.restore(snapshot);
    expect(engine.getPublicState().participant).toBeNull();
    expect(wallet.get()).toMatchObject({ balance: 990, participating: true, roundBet: 10 }); // I8 violated

    runUntil(session, () => engine.state === "impact");
    expect(wallet.get()).toMatchObject({
      balance: 1010, // 990 + 10 × 2: money moves (Q4 correction)
      lastWin: { amount: 20, mult: 2 },
    });

    runUntil(session, () => ended() === 1);
    expect(picks).toEqual([]);
    expect(refusals).toEqual([]);
    // bettingOpened of round 2 (a different roundId) resets the participation.
    expect(engine.getPublicState().roundId).toBe(2);
    expect(wallet.get()).toMatchObject({ balance: 1010, participating: false, roundBet: 0 });
  });
});
