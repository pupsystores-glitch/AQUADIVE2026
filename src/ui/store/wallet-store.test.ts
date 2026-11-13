// Wallet store ledger tests (Sprint 4, Commit U2; docs/07_UI_ARCHITECTURE.md
// §10, §20 risk 1, §21 tier 1). The settlement layer driven headless by
// scripted engine event sequences: an EventBus (the engine facade's own
// event mechanism) is fed payloads exactly as the engine emits them, and
// the wallet's ledger is asserted. Golden values were computed
// independently from the pre-U2 component formulas; the float pins assert
// exact results INCLUDING toFixed(2) artifacts (e.g. 0.1 × 1.15 settles to
// 0.11, not 0.12) — the money math must be bit-identical, not "close".
import { beforeEach, describe, expect, it } from "vitest";
import { EventBus, type BonusChest, type EngineEventMap } from "@/engine";
import { HISTORY_LIMIT } from "@/game/config";
import { DEFAULT_BALANCE } from "@/game/constants";
import { createWalletStore, type FlashKind, type WalletStore } from "./wallet-store";

const CHESTS: [BonusChest, BonusChest, BonusChest] = [
  { id: 0, multiplier: 2, opened: false },
  { id: 1, multiplier: 6.5, opened: false },
  { id: 2, multiplier: 30, opened: false },
];

let bus: EventBus<EngineEventMap>;
let wallet: WalletStore;
let flashes: FlashKind[];
let roundId: number;

/** Emit one engine event and dispatch it, as the engine does post-tick. */
const emit = <K extends keyof EngineEventMap>(
  name: K,
  payload: Omit<EngineEventMap[K], "roundId">,
) => {
  bus.emit(name, { roundId, ...payload } as EngineEventMap[K]);
  bus.dispatchQueued();
};

// Scripted round fragments, in the engine's emission order (docs/06 §5).
const openBetting = () => {
  roundId++;
  emit("bettingOpened", {});
};
const bet = (amount: number) => emit("betPlaced", { amount });
const dive = () => emit("diveStarted", {});
const cashOut = (multiplier: number) => emit("cashedOut", { multiplier });
const crash = (multiplier: number) => emit("crashed", { multiplier });
const impact = (jackpotMultiplier: number) => emit("shipImpact", { jackpotMultiplier });
const reveal = () => emit("chestsRevealed", { chests: CHESTS });
const pick = (chestId: 0 | 1 | 2, chestMultiplier: number, finalMultiplier: number) =>
  emit("chestPicked", { chestId, chestMultiplier, finalMultiplier });

beforeEach(() => {
  bus = new EventBus<EngineEventMap>();
  wallet = createWalletStore(bus);
  flashes = [];
  wallet.onFlash((kind) => flashes.push(kind));
  roundId = 1; // the engine starts in round 1's betting window without an event
});

describe("wallet store — initial state", () => {
  it("starts at the default balance with no round state, no history, jackpot base 1", () => {
    expect(wallet.get()).toEqual({
      balance: DEFAULT_BALANCE,
      roundBet: 0,
      participating: false,
      hasCashed: false,
      settledBy: null,
      chestSettled: false,
      lastWin: null,
      history: [],
      jackpotMultiplier: 1,
    });
  });
});

describe("wallet store — settlement paths (golden ledger)", () => {
  it("betPlaced: debits the accepted amount and locks it as the round bet", () => {
    bet(0.1);
    expect(wallet.get()).toMatchObject({ balance: 999.9, roundBet: 0.1, participating: true });
  });

  it("cashedOut: credits roundBet × m with toFixed(2) artifacts preserved; records history and lastWin", () => {
    bet(0.1);
    dive();
    cashOut(1.15); // 0.1 * 1.15 = 0.11499999999999999 → 0.11
    expect(wallet.get()).toMatchObject({
      balance: 1000.01,
      hasCashed: true,
      lastWin: { amount: 0.11, mult: 1.15 },
      history: [{ mult: 1.15, crashed: false }],
    });
    expect(flashes).toEqual(["cashFlash"]);
  });

  it("cashedOut: 33.33 × 2.005 = 66.82664999999999 settles to 66.83", () => {
    bet(33.33);
    dive();
    cashOut(2.005);
    expect(wallet.get().balance).toBe(1033.5); // +(966.67 + 66.83).toFixed(2)
    expect(wallet.get().lastWin).toEqual({ amount: 66.83, mult: 2.005 });
  });

  it("crashed (loss): the stake stays debited and a crashed entry is recorded", () => {
    bet(25);
    dive();
    crash(1.37);
    expect(wallet.get()).toMatchObject({
      balance: 975,
      hasCashed: false,
      lastWin: null,
      history: [{ mult: 1.37, crashed: true }],
    });
    expect(flashes).toEqual([]);
  });

  it("crashed after a cashout: no loss entry (the cashout entry stands)", () => {
    bet(10);
    dive();
    cashOut(1.5);
    crash(3);
    expect(wallet.get().history).toEqual([{ mult: 1.5, crashed: false }]);
    expect(wallet.get().balance).toBe(1005);
  });

  it("shipImpact (participating, not cashed): jackpot auto-credit, jackpot flash, history", () => {
    bet(10);
    dive();
    impact(120);
    expect(wallet.get()).toMatchObject({
      balance: 2190,
      hasCashed: true,
      jackpotMultiplier: 120,
      lastWin: { amount: 1200, mult: 120 },
      history: [{ mult: 120, crashed: false }],
    });
    expect(flashes).toEqual(["jackpotFlash"]);
  });

  it("shipImpact after a manual cashout: no second credit, no flash; history still records the jackpot", () => {
    bet(10);
    dive();
    cashOut(2);
    impact(120);
    expect(wallet.get().balance).toBe(1010);
    expect(wallet.get().lastWin).toEqual({ amount: 20, mult: 2 });
    expect(wallet.get().jackpotMultiplier).toBe(120);
    expect(wallet.get().history).toEqual([
      { mult: 120, crashed: false },
      { mult: 2, crashed: false },
    ]);
    expect(flashes).toEqual(["cashFlash"]);
  });

  it("chestPicked (participating): credits only the delta over the already-credited jackpot win", () => {
    bet(10);
    dive();
    impact(120);
    reveal();
    pick(1, 6.5, 780); // final = +(120 * 6.5).toFixed(2), computed by the engine
    // prevWin 1200, totalWin 7800 → delta 6600
    expect(wallet.get()).toMatchObject({
      balance: 8790,
      lastWin: { amount: 7800, mult: 780 },
      history: [
        { mult: 780, crashed: false },
        { mult: 120, crashed: false },
      ],
    });
  });

  it("chestPicked delta with float artifacts: 0.3 at jackpot 1.15 × chest 3", () => {
    bet(0.3);
    dive();
    impact(1.15); // 0.3 * 1.15 = 0.345 (float 0.34499…) → 0.34
    reveal();
    pick(2, 3, 3.45); // total 0.3 * 3.45 = 1.035 (float 1.03499…) → 1.03; delta 0.69
    expect(wallet.get().balance).toBe(1000.73); // 999.7 + 0.34 + 0.69
    expect(wallet.get().lastWin).toEqual({ amount: 1.03, mult: 3.45 });
  });

  it("spectator round: no debit or credit on any path; history still records results", () => {
    dive();
    impact(77.7);
    reveal();
    pick(0, 2, 155.4);
    expect(wallet.get()).toMatchObject({
      balance: DEFAULT_BALANCE,
      roundBet: 0,
      participating: false,
      hasCashed: false,
      lastWin: null,
      history: [
        { mult: 155.4, crashed: false },
        { mult: 77.7, crashed: false },
      ],
    });
    expect(flashes).toEqual([]);
  });

  it("spectator crash: records a crashed entry", () => {
    dive();
    crash(4.2);
    expect(wallet.get().history).toEqual([{ mult: 4.2, crashed: true }]);
    expect(wallet.get().balance).toBe(DEFAULT_BALANCE);
  });
});

describe("wallet store — per-round resets", () => {
  it("bettingOpened clears participating, roundBet and hasCashed; balance, history, lastWin and jackpot base carry over", () => {
    bet(10);
    dive();
    impact(120);
    openBetting();
    expect(wallet.get()).toEqual({
      balance: 2190,
      roundBet: 0,
      participating: false,
      hasCashed: false,
      settledBy: null,
      chestSettled: false,
      lastWin: { amount: 1200, mult: 120 },
      history: [{ mult: 120, crashed: false }],
      jackpotMultiplier: 120,
    });
  });

  it("diveStarted clears hasCashed", () => {
    bet(5);
    dive();
    cashOut(2);
    expect(wallet.get().hasCashed).toBe(true);
    dive();
    expect(wallet.get().hasCashed).toBe(false);
  });

  it("history is newest-first and capped at HISTORY_LIMIT", () => {
    for (let i = 1; i <= HISTORY_LIMIT + 3; i++) {
      dive();
      crash(i);
      openBetting();
    }
    const history = wallet.get().history;
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]).toEqual({ mult: HISTORY_LIMIT + 3, crashed: true });
    expect(history[HISTORY_LIMIT - 1]).toEqual({ mult: 4, crashed: true });
  });
});

describe("wallet store — multi-round golden ledger", () => {
  it("cashout → loss → jackpot + chest → spectator → cashout: balance after every settlement event", () => {
    const ledger: number[] = [];
    wallet.subscribe(() => ledger.push(wallet.get().balance));

    bet(0.1); // 999.9
    dive();
    cashOut(1.15); // +0.11 → 1000.01
    crash(1.8);
    openBetting();

    bet(25); // 975.01
    dive();
    crash(1.2);
    openBetting();

    bet(10); // 965.01
    dive();
    impact(120); // +1200 → 2165.01
    reveal();
    pick(1, 6.5, 780); // +6600 → 8765.01
    openBetting();

    dive(); // spectating
    crash(2.5);
    openBetting();

    bet(33.33); // 8731.68
    dive();
    cashOut(2.005); // +66.83 → 8798.51

    // One notification per state-changing event; dedupe to the balance trail.
    const trail = ledger.filter((b, i) => i === 0 || b !== ledger[i - 1]);
    expect(trail).toEqual([999.9, 1000.01, 975.01, 965.01, 2165.01, 8765.01, 8731.68, 8798.51]);
    expect(wallet.get().history.map((h) => [h.mult, h.crashed])).toEqual([
      [2.005, false],
      [2.5, true],
      [780, false],
      [120, false],
      [1.2, true],
      [1.15, false],
    ]);
  });
});

describe("wallet store — settlement exclusivity (U2 bug fix: cashout → seabed → chest)", () => {
  it("manual cashout, then seabed and a chest pick: the cashout stands alone — no jackpot or chest credit", () => {
    bet(10); // 990
    dive();
    cashOut(2); // +20 → 1010
    impact(120);
    reveal();
    pick(1, 6.5, 780);
    expect(wallet.get()).toMatchObject({
      balance: 1010,
      lastWin: { amount: 20, mult: 2 },
      settledBy: "cashout",
      chestSettled: true,
      history: [
        { mult: 780, crashed: false },
        { mult: 120, crashed: false },
        { mult: 2, crashed: false },
      ],
    });
    expect(flashes).toEqual(["cashFlash"]);
  });

  it("manual cashout, then seabed with no chest pick: balance and lastWin unchanged", () => {
    bet(10);
    dive();
    cashOut(2);
    impact(120);
    reveal();
    expect(wallet.get()).toMatchObject({
      balance: 1010,
      lastWin: { amount: 20, mult: 2 },
      settledBy: "cashout",
      chestSettled: false,
    });
    expect(flashes).toEqual(["cashFlash"]);
  });

  it("no manual cashout: jackpot auto-credit and chest delta are unchanged", () => {
    bet(10);
    dive();
    impact(120);
    expect(wallet.get().settledBy).toBe("jackpot");
    reveal();
    pick(1, 6.5, 780);
    expect(wallet.get()).toMatchObject({
      balance: 8790, // the existing golden pin: 990 + 1200 + 6600
      lastWin: { amount: 7800, mult: 780 },
      settledBy: "jackpot",
      chestSettled: true,
    });
    expect(flashes).toEqual(["jackpotFlash"]);
  });

  it("duplicate cashedOut events credit once", () => {
    bet(10);
    dive();
    cashOut(2);
    cashOut(2);
    cashOut(3);
    expect(wallet.get()).toMatchObject({
      balance: 1010,
      lastWin: { amount: 20, mult: 2 },
      settledBy: "cashout",
      history: [{ mult: 2, crashed: false }],
    });
    expect(flashes).toEqual(["cashFlash"]);
  });

  it("duplicate chestPicked events after a jackpot credit the delta once", () => {
    bet(10);
    dive();
    impact(120);
    reveal();
    pick(1, 6.5, 780);
    pick(1, 6.5, 780);
    pick(2, 30, 3600);
    expect(wallet.get()).toMatchObject({
      balance: 8790,
      lastWin: { amount: 7800, mult: 780 },
      history: [
        { mult: 780, crashed: false },
        { mult: 120, crashed: false },
      ],
    });
  });

  it("spectator: never settled, no credit on cashout/jackpot/chest events", () => {
    dive();
    cashOut(2); // never emitted for a spectator by the engine; must still not credit
    impact(77.7);
    reveal();
    pick(0, 2, 155.4);
    expect(wallet.get()).toMatchObject({
      balance: DEFAULT_BALANCE,
      participating: false,
      hasCashed: false,
      settledBy: null,
      lastWin: null,
      history: [
        { mult: 155.4, crashed: false },
        { mult: 77.7, crashed: false },
      ],
    });
    expect(flashes).toEqual([]);
  });

  it("settlement state resets per round: a cashout round does not block the next round's jackpot + chest", () => {
    bet(10); // 990
    dive();
    cashOut(2); // 1010
    impact(120);
    reveal();
    pick(1, 6.5, 780); // history only
    openBetting();
    expect(wallet.get()).toMatchObject({ settledBy: null, chestSettled: false, hasCashed: false });

    bet(10); // 1000
    dive();
    expect(wallet.get()).toMatchObject({ settledBy: null, chestSettled: false });
    impact(120); // +1200 → 2200
    reveal();
    pick(1, 6.5, 780); // +6600 → 8800
    expect(wallet.get()).toMatchObject({
      balance: 8800,
      lastWin: { amount: 7800, mult: 780 },
      settledBy: "jackpot",
      chestSettled: true,
    });
    expect(flashes).toEqual(["cashFlash", "jackpotFlash"]);
  });
});

describe("wallet store — bet-basis lock (Sprint 3 Commit 8, generalized)", () => {
  it("the win basis is the betPlaced amount — nothing else in the event stream can move it", () => {
    // The exploit pinned against: debit 5 at acceptance, then settle on a
    // later, larger input value. The wallet has no input to read: the only
    // bet value it ever sees is the accepted payload.
    bet(5);
    dive();
    cashOut(3.21);
    expect(wallet.get().roundBet).toBe(5);
    expect(wallet.get().lastWin).toEqual({ amount: 16.05, mult: 3.21 }); // 5 × m, never 100 × m
    expect(wallet.get().balance).toBe(1011.05);
  });

  it("the jackpot and chest credits use the same locked basis", () => {
    bet(5);
    dive();
    impact(50);
    reveal();
    pick(0, 2, 100);
    expect(wallet.get().lastWin).toEqual({ amount: 500, mult: 100 });
    expect(wallet.get().balance).toBe(1495); // 995 + 250 + 250
  });
});

describe("wallet store — read surface and affordability", () => {
  it("each settlement event produces exactly one snapshot (atomic updates)", () => {
    let notifications = 0;
    wallet.subscribe(() => notifications++);
    bet(10);
    expect(notifications).toBe(1);
    dive();
    cashOut(2);
    expect(notifications).toBe(3);
  });

  it("snapshots are immutable: a held snapshot never changes under later events", () => {
    bet(10);
    const held = wallet.get();
    dive();
    cashOut(2);
    expect(held).toMatchObject({ balance: 990, hasCashed: false, history: [] });
    expect(wallet.get()).not.toBe(held);
  });

  it("exposes no writer: the read surface is get/subscribe/canAfford/onFlash only", () => {
    expect(Object.keys(wallet).sort()).toEqual(["canAfford", "get", "onFlash", "subscribe"]);
  });

  it("canAfford: verbatim pre-U2 predicate — (0, balance] accepted, NaN passes through (engine rejects it)", () => {
    expect(wallet.canAfford(5)).toBe(true);
    expect(wallet.canAfford(DEFAULT_BALANCE)).toBe(true);
    expect(wallet.canAfford(DEFAULT_BALANCE + 0.01)).toBe(false);
    expect(wallet.canAfford(0)).toBe(false);
    expect(wallet.canAfford(-1)).toBe(false);
    // Pinned pre-existing behavior: `NaN <= 0 || NaN > balance` is false, so
    // the old guard let NaN through to the engine ("invalid-amount"). Input
    // sanitation is delta V4 (U5), not this commit.
    expect(wallet.canAfford(Number.NaN)).toBe(true);
  });

  it("canAfford tracks the live balance", () => {
    bet(600);
    expect(wallet.canAfford(400)).toBe(true);
    expect(wallet.canAfford(400.01)).toBe(false);
  });

  it("onFlash unsubscribe stops delivery", () => {
    const received: FlashKind[] = [];
    const off = wallet.onFlash((kind) => received.push(kind));
    bet(1);
    dive();
    cashOut(2);
    off();
    openBetting();
    bet(1);
    dive();
    impact(10);
    expect(received).toEqual(["cashFlash"]);
  });

  it("a throwing flash listener cannot undo settlement (the credit is written first)", () => {
    wallet.onFlash(() => {
      throw new Error("broken display hook");
    });
    bet(10);
    dive();
    const errors = console.error;
    console.error = () => {}; // EventBus firewall logs the listener failure
    try {
      cashOut(2);
    } finally {
      console.error = errors;
    }
    expect(wallet.get().balance).toBe(1010);
    expect(wallet.get().hasCashed).toBe(true);
  });
});
