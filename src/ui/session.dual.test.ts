// E-X3 Dual Bet — session integration tests (owner-approved 2026-11-14).
// Real GameEngine + LocalRoundAuthority over seeded Rngs, driven only
// through session.submit. Checks the submit edge's in-flight reservation and,
// over seeded multi-round runs with both slots in play, I8 PER SLOT after
// every tick and the balance against an independent integer-cent ledger
// kept from engine events only (each slot's payout rounded down on its own
// stake; the round's one chest pick applied to every jackpot slot).
import { describe, expect, it } from "vitest";
import { LocalRoundAuthority, type BetSlot, type EngineEventMap, type Rng } from "@/engine";
import { DEFAULT_BALANCE } from "@/game/constants";
import { createGameSession } from "./session";
import type { WalletRefusal } from "./store/wallet-store";
import { floorCentsBinary } from "./test/money-oracle";

const FRAME = 1 / 60;

/** mulberry32 — the same deterministic Rng as session.money.test.ts. */
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

const cents = (amount: number) => BigInt(Math.round(amount * 100));

const scripted = (crashPoint: number) => ({
  sampleCrashPoint: () => crashPoint,
  sampleJackpot: () => 100,
  rollBonusChests: () =>
    [
      { id: 0, multiplier: 2, opened: false },
      { id: 1, multiplier: 6.5, opened: false },
      { id: 2, multiplier: 30, opened: false },
    ] as [
      { id: 0; multiplier: number; opened: boolean },
      { id: 1; multiplier: number; opened: boolean },
      { id: 2; multiplier: number; opened: boolean },
    ],
});

describe("E-X3 session — the submit edge", () => {
  it("two bets submitted in one frame never together exceed the balance: the second is dropped before the engine", () => {
    const session = createGameSession({ authority: scripted(2), worldRng: seeded(1) });
    const placed: Array<EngineEventMap["betPlaced"]> = [];
    session.engine.events.on("betPlaced", (p) => placed.push(p));
    session.submit({ type: "placeBet", slot: 0, amount: 600 });
    session.submit({ type: "placeBet", slot: 1, amount: 600 }); // 1200 > 1000: dropped
    session.submit({ type: "placeBet", slot: 1, amount: 400 }); // 600 + 400 = 1000: forwarded
    session.engine.advance(FRAME);
    expect(placed.map((p) => [p.slot, p.amount])).toEqual([
      [0, 600],
      [1, 400],
    ]);
    const pub = session.engine.getPublicState();
    const w = session.wallet.get();
    expect(w.balance).toBe(0);
    for (const s of [0, 1] as const) {
      expect(pub.participants[s]?.betAmount).toBe(w.slots[s].roundBet); // I8 per slot
    }
  });

  it("a slot's own repeated submissions are not reserved against each other (single-bet behavior unchanged)", () => {
    const session = createGameSession({ authority: scripted(2), worldRng: seeded(1) });
    const forwarded: number[] = [];
    const submit = session.engine.submit.bind(session.engine);
    session.engine.submit = (c) => {
      if (c.type === "placeBet") forwarded.push(c.amount);
      submit(c);
    };
    for (const amount of [800, 900, 1000]) session.submit({ type: "placeBet", slot: 0, amount });
    expect(forwarded).toEqual([800, 900, 1000]);
    session.engine.advance(FRAME);
    expect(session.wallet.get().balance).toBe(200); // the engine took the first only
  });

  it("the reservation is released when the engine answers: rejected bets free their stake", () => {
    const session = createGameSession({ authority: scripted(2), worldRng: seeded(1) });
    session.submit({ type: "placeBet", slot: 0, amount: 900 });
    session.submit({ type: "placeBet", slot: 0, amount: 950 }); // rejected by the engine (slot taken)
    session.engine.advance(FRAME);
    // 900 debited; nothing of slot 0 in flight any more, so 100 fits slot 1.
    session.submit({ type: "placeBet", slot: 1, amount: 100 });
    session.engine.advance(FRAME);
    expect(session.wallet.get().balance).toBe(0);
    expect(session.wallet.get().slots[1].participating).toBe(true);
  });

  it("drops placeBet / cashOut without a valid slot", () => {
    const session = createGameSession({ authority: scripted(2), worldRng: seeded(1) });
    const seen: unknown[] = [];
    session.engine.events.on("commandRejected", (p) => seen.push(p));
    session.submit({ type: "placeBet", slot: 2, amount: 5 } as never);
    session.submit({ type: "placeBet", amount: 5 } as never);
    session.submit({ type: "cashOut", slot: -1 } as never);
    session.engine.advance(FRAME);
    expect(seen).toEqual([]); // never reached the engine
    expect(session.wallet.get().balance).toBe(DEFAULT_BALANCE);
  });
});

/** Seeded dual-slot play through session.submit; asserts I8 per slot and the cent ledger after every tick. */
function playDual(seed: number, rounds: number) {
  const refusals: WalletRefusal[] = [];
  const session = createGameSession({
    authority: new LocalRoundAuthority(seeded(seed)),
    worldRng: seeded(seed + 1),
    diagnostics: true,
    walletDiagnosticsLog: (_m, r) => refusals.push(r),
  });
  const { engine, wallet } = session;
  const player = seeded(seed + 2);

  let ledger = cents(DEFAULT_BALANCE);
  const stake: [bigint | null, bigint | null] = [null, null];
  const settled: [string | null, string | null] = [null, null];
  const jackpotCents: [bigint, bigint] = [0n, 0n];
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  engine.events.on("bettingOpened", () => {
    stake[0] = stake[1] = null;
    settled[0] = settled[1] = null;
  });
  engine.events.on("betPlaced", ({ slot, amount }) => {
    stake[slot] = cents(amount);
    ledger -= stake[slot]!;
    count(`bet${slot}`);
  });
  engine.events.on("cashedOut", ({ slot, multiplier }) => {
    ledger += floorCentsBinary(stake[slot]!, multiplier);
    settled[slot] = "cashout";
    count(`cash${slot}`);
  });
  engine.events.on("shipImpact", ({ jackpotMultiplier }) => {
    for (const s of [0, 1] as const) {
      if (stake[s] === null || settled[s] !== null) continue;
      jackpotCents[s] = (stake[s]! * cents(jackpotMultiplier)) / 100n;
      ledger += jackpotCents[s];
      settled[s] = "jackpot";
      count(`jackpot${s}`);
    }
  });
  engine.events.on("chestPicked", ({ finalMultiplier }) => {
    for (const s of [0, 1] as const) {
      if (stake[s] === null || settled[s] !== "jackpot") continue;
      ledger += (stake[s]! * cents(finalMultiplier)) / 100n - jackpotCents[s];
      count(`chest${s}`);
    }
  });
  engine.events.on("roundEnded", () => count("rounds"));

  const STAKES = [0.01, 0.07, 0.29, 1, 1.15, 5, 8.2, 33.33];
  let last = engine.state;
  let ticks = 0;
  const cashAt: [number, number] = [-1, -1];
  let pickAt = -1;
  let decided = false;
  for (let guard = 0; (counts.rounds ?? 0) < rounds && guard < 5_000_000; guard++) {
    const state = engine.state;
    if (state !== last) {
      last = state;
      ticks = 0;
      if (state === "betting") decided = false;
      if (state === "diving") {
        for (const s of [0, 1] as const) {
          cashAt[s] = player.next() < 0.4 ? -1 : Math.floor(player.next() * 400);
        }
      }
      if (state === "bonus") pickAt = player.next() < 0.3 ? -1 : Math.floor(player.next() * 120);
    }
    if (state === "betting" && !decided && ticks >= 5) {
      decided = true;
      for (const s of [0, 1] as BetSlot[]) {
        if (player.next() < 0.75) {
          const amount = STAKES[Math.floor(player.next() * STAKES.length)];
          session.submit({ type: "placeBet", slot: s, amount });
        }
      }
    }
    for (const s of [0, 1] as const) {
      if (state === "diving" && ticks === cashAt[s]) session.submit({ type: "cashOut", slot: s });
    }
    if (state === "bonus" && ticks === pickAt) {
      session.submit({ type: "pickChest", chestId: Math.floor(player.next() * 3) as 0 | 1 | 2 });
    }
    engine.advance(FRAME);
    ticks++;
    const pub = engine.getPublicState();
    const w = wallet.get();
    for (const s of [0, 1] as const) {
      const p = pub.participants[s];
      expect(p !== null, `I8 slot ${s}`).toBe(w.slots[s].participating);
      if (p) expect(w.slots[s].roundBet).toBe(p.betAmount);
    }
    expect(w.balance).toBe(Number(ledger) / 100);
  }
  return { counts, refusals };
}

describe("E-X3 session — seeded dual-slot runs", () => {
  for (const seed of [11, 4242]) {
    it(`seed ${seed}, 400 rounds: I8 per slot and the per-slot cent ledger hold after every tick; no wallet refusal; both slots exercise every path`, () => {
      const { counts, refusals } = playDual(seed, 400);
      expect(refusals).toEqual([]);
      for (const k of ["bet0", "bet1", "cash0", "cash1", "jackpot0", "jackpot1"]) {
        expect(counts[k] ?? 0, k).toBeGreaterThan(0);
      }
      expect((counts.chest0 ?? 0) + (counts.chest1 ?? 0), "chest").toBeGreaterThan(0);
    }, 600_000);
  }
});
