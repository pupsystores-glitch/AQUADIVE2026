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
import { LocalRoundAuthority, type EngineEventMap, type Rng } from "@/engine";
import { DEFAULT_BALANCE } from "@/game/constants";
import { createGameSession, type GameSession } from "./session";
import type { WalletRefusal } from "./store/wallet-store";
import { floorCentsBinary } from "./test/money-oracle";

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
