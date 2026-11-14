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
import {
  createWalletStore,
  isAffordable,
  type FlashKind,
  type SettlementFault,
  type WalletRefusal,
  type WalletStore,
} from "./wallet-store";
import { slot0View } from "@/ui/test/wallet-view";

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
const bet = (amount: number) => emit("betPlaced", { slot: 0, amount });
const dive = () => emit("diveStarted", {});
const cashOut = (multiplier: number) => emit("cashedOut", { slot: 0, multiplier });
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
    expect(slot0View(wallet.get())).toEqual({
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
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 999.9,
      roundBet: 0.1,
      participating: true,
    });
  });

  it("cashedOut: credits roundBet × m rounded down to the cent; records history and lastWin", () => {
    bet(0.1);
    dive();
    cashOut(1.15); // 0.1 * 1.15 = 0.11499999999999999 → 0.11
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 1000.01,
      hasCashed: true,
      lastWin: { amount: 0.11, mult: 1.15 },
      history: [{ mult: 1.15, crashed: false }],
    });
    expect(flashes).toEqual(["cashFlash"]);
  });

  // Sanctioned rewrite (M1-D8, docs/07 §23.3): was 66.83 / 1033.5 (round to nearest).
  it("cashedOut: 33.33 × 2.005 = 66.82665 exactly → rounded down to 66.82", () => {
    bet(33.33);
    dive();
    cashOut(2.005);
    expect(slot0View(wallet.get()).balance).toBe(1033.49); // 966.67 + 66.82
    expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 66.82, mult: 2.005 });
  });

  it("crashed (loss): the stake stays debited and a crashed entry is recorded", () => {
    bet(25);
    dive();
    crash(1.37);
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get()).history).toEqual([{ mult: 1.5, crashed: false }]);
    expect(slot0View(wallet.get()).balance).toBe(1005);
  });

  it("shipImpact (participating, not cashed): jackpot auto-credit, jackpot flash, history", () => {
    bet(10);
    dive();
    impact(120);
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get()).balance).toBe(1010);
    expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 20, mult: 2 });
    expect(slot0View(wallet.get()).jackpotMultiplier).toBe(120);
    expect(slot0View(wallet.get()).history).toEqual([
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
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get()).balance).toBe(1000.73); // 999.7 + 0.34 + 0.69
    expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 1.03, mult: 3.45 });
  });

  it("spectator round: no debit or credit on any path; history records the jackpot only (E-X1: no chest entry)", () => {
    dive();
    impact(77.7);
    reveal();
    pick(0, 2, 155.4);
    expect(slot0View(wallet.get())).toMatchObject({
      balance: DEFAULT_BALANCE,
      roundBet: 0,
      participating: false,
      hasCashed: false,
      lastWin: null,
      history: [{ mult: 77.7, crashed: false }],
    });
    expect(flashes).toEqual([]);
  });

  it("spectator crash: records a crashed entry", () => {
    dive();
    crash(4.2);
    expect(slot0View(wallet.get()).history).toEqual([{ mult: 4.2, crashed: true }]);
    expect(slot0View(wallet.get()).balance).toBe(DEFAULT_BALANCE);
  });
});

describe("wallet store — per-round resets", () => {
  it("bettingOpened clears participating, roundBet and hasCashed; balance, history, lastWin and jackpot base carry over", () => {
    bet(10);
    dive();
    impact(120);
    openBetting();
    expect(slot0View(wallet.get())).toEqual({
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

  // Sanctioned rewrite (M1 rule W5, hole H1, docs/07 §23.17). The U2 pin was
  // "diveStarted clears hasCashed", which let a repeated diveStarted re-open a
  // settled participation so a second cashedOut credited again.
  it("W5/H1: a repeated diveStarted does not re-open a settled participation — one credit", () => {
    bet(5);
    dive();
    cashOut(2);
    expect(slot0View(wallet.get()).hasCashed).toBe(true);
    dive();
    expect(slot0View(wallet.get())).toMatchObject({ hasCashed: true, settledBy: "cashout" });
    cashOut(3);
    expect(slot0View(wallet.get()).balance).toBe(1005);
    expect(slot0View(wallet.get()).history).toHaveLength(1);
  });

  it("history is newest-first and capped at HISTORY_LIMIT", () => {
    for (let i = 1; i <= HISTORY_LIMIT + 3; i++) {
      dive();
      crash(i);
      openBetting();
    }
    const history = slot0View(wallet.get()).history;
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]).toEqual({ mult: HISTORY_LIMIT + 3, crashed: true });
    expect(history[HISTORY_LIMIT - 1]).toEqual({ mult: 4, crashed: true });
  });
});

describe("wallet store — multi-round golden ledger", () => {
  it("cashout → loss → jackpot + chest → spectator → cashout: balance after every settlement event", () => {
    const ledger: number[] = [];
    wallet.subscribe(() => ledger.push(slot0View(wallet.get()).balance));

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
    cashOut(2.005); // +66.82 → 8798.50 (M1-D8; was +66.83 → 8798.51)

    // One notification per state-changing event; dedupe to the balance trail.
    const trail = ledger.filter((b, i) => i === 0 || b !== ledger[i - 1]);
    expect(trail).toEqual([999.9, 1000.01, 975.01, 965.01, 2165.01, 8765.01, 8731.68, 8798.5]);
    expect(slot0View(wallet.get()).history.map((h) => [h.mult, h.crashed])).toEqual([
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
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 1010,
      lastWin: { amount: 20, mult: 2 },
      settledBy: "cashout",
      chestSettled: false, // E-X1 safeguard: an ineligible pick is ignored entirely
      history: [
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
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get()).settledBy).toBe("jackpot");
    reveal();
    pick(1, 6.5, 780);
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get())).toMatchObject({
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
    expect(slot0View(wallet.get())).toMatchObject({
      balance: DEFAULT_BALANCE,
      participating: false,
      hasCashed: false,
      settledBy: null,
      chestSettled: false,
      lastWin: null,
      history: [{ mult: 77.7, crashed: false }],
    });
    expect(flashes).toEqual([]);
  });

  it("settlement state resets per round: a cashout round does not block the next round's jackpot + chest", () => {
    bet(10); // 990
    dive();
    cashOut(2); // 1010
    impact(120);
    reveal();
    pick(1, 6.5, 780); // ineligible: ignored (E-X1 safeguard)
    openBetting();
    expect(slot0View(wallet.get())).toMatchObject({
      settledBy: null,
      chestSettled: false,
      hasCashed: false,
    });

    bet(10); // 1000
    dive();
    expect(slot0View(wallet.get())).toMatchObject({ settledBy: null, chestSettled: false });
    impact(120); // +1200 → 2200
    reveal();
    pick(1, 6.5, 780); // +6600 → 8800
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 8800,
      lastWin: { amount: 7800, mult: 780 },
      settledBy: "jackpot",
      chestSettled: true,
    });
    expect(flashes).toEqual(["cashFlash", "jackpotFlash"]);
  });
});

describe("wallet store — E-X1 chest history safeguard (only an eligible jackpot settlement records a chest result)", () => {
  it("spectator chestPicked: no credit, no history entry, no lastWin, no flash, chestSettled stays false", () => {
    dive();
    impact(120);
    reveal();
    const before = slot0View(wallet.get());
    pick(2, 30, 3600);
    expect(slot0View(wallet.get())).toBe(before); // no snapshot written at all
    expect(slot0View(wallet.get())).toMatchObject({
      balance: DEFAULT_BALANCE,
      lastWin: null,
      chestSettled: false,
      history: [{ mult: 120, crashed: false }],
    });
    expect(flashes).toEqual([]);
  });

  it("manual-cashout chestPicked: the cashout and jackpot history entries stand; no chest entry, no credit", () => {
    bet(10);
    dive();
    cashOut(2);
    impact(120);
    reveal();
    const before = slot0View(wallet.get());
    pick(0, 2, 240);
    pick(1, 6.5, 780);
    expect(slot0View(wallet.get())).toBe(before);
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 1010,
      lastWin: { amount: 20, mult: 2 },
      settledBy: "cashout",
      chestSettled: false,
      history: [
        { mult: 120, crashed: false },
        { mult: 2, crashed: false },
      ],
    });
    expect(flashes).toEqual(["cashFlash"]);
  });

  it("chestPicked before any settlement (participating, no jackpot yet): ignored", () => {
    bet(10);
    dive();
    pick(0, 2, 4);
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 990,
      settledBy: null,
      chestSettled: false,
      lastWin: null,
      history: [],
    });
  });

  it("eligible jackpot settlement still records exactly one chest entry, credited once", () => {
    bet(10);
    dive();
    impact(120);
    reveal();
    pick(0, 2, 240); // the E-X1 timeout path applies chest 0
    pick(0, 2, 240);
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 3390, // 990 + 1200 + (2400 - 1200)
      lastWin: { amount: 2400, mult: 240 },
      settledBy: "jackpot",
      chestSettled: true,
      history: [
        { mult: 240, crashed: false },
        { mult: 120, crashed: false },
      ],
    });
    expect(flashes).toEqual(["jackpotFlash"]);
  });

  it("an ignored ineligible pick does not leak into the next round's eligible settlement", () => {
    dive(); // spectating
    impact(50);
    reveal();
    pick(1, 6.5, 325); // ignored
    openBetting();
    bet(10); // 990
    dive();
    impact(120); // +1200 → 2190
    reveal();
    pick(1, 6.5, 780); // +6600 → 8790
    expect(slot0View(wallet.get()).balance).toBe(8790);
    expect(slot0View(wallet.get()).history.map((h) => h.mult)).toEqual([780, 120, 50]);
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
    expect(slot0View(wallet.get()).roundBet).toBe(5);
    expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 16.05, mult: 3.21 }); // 5 × m, never 100 × m
    expect(slot0View(wallet.get()).balance).toBe(1011.05);
  });

  it("the jackpot and chest credits use the same locked basis", () => {
    bet(5);
    dive();
    impact(50);
    reveal();
    pick(0, 2, 100);
    expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 500, mult: 100 });
    expect(slot0View(wallet.get()).balance).toBe(1495); // 995 + 250 + 250
  });
});

describe("wallet store — read surface and affordability", () => {
  it("each settlement event produces exactly one snapshot (atomic updates)", () => {
    let notifications = 0;
    wallet.subscribe(() => notifications++);
    bet(10);
    expect(notifications).toBe(1);
    dive(); // since M1 (W5) diveStarted writes nothing
    expect(notifications).toBe(1);
    cashOut(2);
    expect(notifications).toBe(2);
  });

  it("snapshots are immutable: a held snapshot never changes under later events", () => {
    bet(10);
    const held = slot0View(wallet.get());
    dive();
    cashOut(2);
    expect(held).toMatchObject({ balance: 990, hasCashed: false, history: [] });
    expect(slot0View(wallet.get())).not.toBe(held);
  });

  it("exposes no writer: the read surface is get/subscribe/canAfford/canPlaceStake/unresolvedClaims/onFlash only", () => {
    // M1 adds one read-only predicate, canPlaceStake (docs/07 §23.5), and
    // R2 one read-only audit list, unresolvedClaims (§23.17 W10).
    expect(Object.keys(wallet).sort()).toEqual([
      "canAfford",
      "canPlaceStake",
      "get",
      "onFlash",
      "subscribe",
      "unresolvedClaims",
    ]);
  });

  it("canPlaceStake (M1): valid stake ∧ affordable — sub-cent and zero rejected, isAffordable unchanged", () => {
    for (const v of [0.01, 5, 0.29, DEFAULT_BALANCE])
      expect(wallet.canPlaceStake(v), String(v)).toBe(true);
    for (const v of [
      0,
      -1,
      0.001,
      0.005,
      0.009,
      1.005,
      0.1 + 0.2,
      NaN,
      Infinity,
      DEFAULT_BALANCE + 0.01,
    ]) {
      expect(wallet.canPlaceStake(v), String(v)).toBe(false);
    }
    expect(wallet.canAfford(0.005)).toBe(true); // the U5 D7 predicate itself is unchanged
  });

  it("canAfford: the pre-U2 predicate for finite amounts — (0, balance] accepted", () => {
    expect(wallet.canAfford(5)).toBe(true);
    expect(wallet.canAfford(DEFAULT_BALANCE)).toBe(true);
    expect(wallet.canAfford(DEFAULT_BALANCE + 0.01)).toBe(false);
    expect(wallet.canAfford(0)).toBe(false);
    expect(wallet.canAfford(-1)).toBe(false);
  });

  it("canAfford (U5, D7): non-finite amounts are never affordable", () => {
    // Updated in U5, the sanctioned step: the U2 pin recorded that the old
    // guard let NaN through (`NaN <= 0 || NaN > balance` is false) to be
    // rejected by the engine ("invalid-amount"). ±Infinity was already false.
    expect(wallet.canAfford(Number.NaN)).toBe(false);
    expect(wallet.canAfford(Number.POSITIVE_INFINITY)).toBe(false);
    expect(wallet.canAfford(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("canAfford delegates to the shared isAffordable predicate with the live balance", () => {
    bet(600);
    for (const amount of [Number.NaN, -1, 0, 0.01, 399.99, 400, 400.01, Infinity]) {
      expect(wallet.canAfford(amount)).toBe(isAffordable(amount, 400));
    }
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
    expect(slot0View(wallet.get()).balance).toBe(1010);
    expect(slot0View(wallet.get()).hasCashed).toBe(true);
  });
});

// ----- U5 (D7): the shared affordability predicate -----

describe("isAffordable — one predicate for canAfford and the action state (U5, D7)", () => {
  /** The shell's original guard, transcribed verbatim (pre-U5 canAfford / canBet terms). */
  const original = (amount: number, balance: number) => !(amount <= 0 || amount > balance);

  it("matches the original guard on every finite amount, including float and boundary values", () => {
    const amounts = [
      -1000,
      -1,
      -0.01,
      -Number.MIN_VALUE,
      -0,
      0,
      Number.MIN_VALUE,
      0.01,
      0.1,
      0.3,
      1,
      2.5,
      1.25,
      5,
      99.99,
      100,
      100.01,
      999.99,
      1000,
      1000.0000000000001,
      1000.01,
      1e6,
      Number.MAX_VALUE,
      0.1 + 0.2,
    ];
    const balances = [0, 0.3, 1, 100, 999.99, 1000, 7490, 30990];
    for (const balance of balances) {
      for (const amount of amounts) {
        expect(isAffordable(amount, balance), `${amount} vs ${balance}`).toBe(
          original(amount, balance),
        );
      }
    }
  });

  it("rejects every non-finite amount — the one sanctioned difference (NaN was accepted before)", () => {
    for (const balance of [0, 5, 1000, Number.MAX_VALUE]) {
      expect(isAffordable(Number.NaN, balance)).toBe(false);
      expect(isAffordable(Number.POSITIVE_INFINITY, balance)).toBe(false);
      expect(isAffordable(Number.NEGATIVE_INFINITY, balance)).toBe(false);
    }
    expect(original(Number.NaN, 1000)).toBe(true); // the pre-U5 gap this closes
  });

  it("is pure: does not touch any wallet state", () => {
    const before = slot0View(wallet.get());
    isAffordable(5, 0);
    isAffordable(Number.NaN, 1000);
    expect(slot0View(wallet.get())).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// M1 settlement integrity (docs/07 §23.7 final-reconciliation block, §23.17
// rules W1–W9, holes H1–H6). Expected values are integer-cent literals
// computed by hand from ⌊k·M/100⌋ — never from the function under test.
// These are local consistency checks; they do not authenticate events
// (M1-D11).
// ---------------------------------------------------------------------------
describe("wallet store — M1 integrity guards (W1–W10)", () => {
  let refusals: WalletRefusal[];

  beforeEach(() => {
    refusals = [];
    wallet = createWalletStore(bus, { onRefusal: (r) => refusals.push(r) });
    wallet.onFlash((kind) => flashes.push(kind));
  });

  /** Emit with an explicit roundId (foreign or stale events). */
  const emitIn = <K extends keyof EngineEventMap>(
    round: number,
    name: K,
    payload: Omit<EngineEventMap[K], "roundId">,
  ) => {
    bus.emit(name, { roundId: round, ...payload } as EngineEventMap[K]);
    bus.dispatchQueued();
  };
  const rules = () => refusals.map((r) => `${r.event}:${r.rule}`);

  it("W1: an invalid betPlaced amount debits nothing and opens no participation; the round then pays nothing", () => {
    const before = slot0View(wallet.get());
    for (const amount of [
      0,
      -0,
      -1,
      0.001,
      0.005,
      0.009,
      1.005,
      0.1 + 0.2,
      NaN,
      Infinity,
      -Infinity,
    ]) {
      bet(amount);
    }
    emit("betPlaced", { slot: 0, amount: "5" as unknown as number });
    expect(slot0View(wallet.get())).toBe(before); // no snapshot written at all (W8)
    expect(refusals).toHaveLength(12);
    expect(new Set(rules())).toEqual(new Set(["betPlaced:W1"]));
    dive();
    impact(500);
    pick(2, 50, 25000);
    expect(slot0View(wallet.get()).balance).toBe(DEFAULT_BALANCE);
    expect(slot0View(wallet.get()).lastWin).toBeNull();
  });

  it("W2/H3: a duplicate betPlaced debits once", () => {
    bet(10);
    bet(10);
    expect(slot0View(wallet.get())).toMatchObject({ balance: 990, roundBet: 10 });
    expect(rules()).toEqual(["betPlaced:W2"]);
  });

  it("W3/H4: an over-balance betPlaced writes nothing and the round pays nothing", () => {
    const before = slot0View(wallet.get());
    bet(DEFAULT_BALANCE + 0.01);
    bet(5000);
    expect(slot0View(wallet.get())).toBe(before);
    expect(rules()).toEqual(["betPlaced:W3", "betPlaced:W3"]);
    dive();
    cashOut(2);
    impact(500);
    expect(slot0View(wallet.get()).balance).toBe(DEFAULT_BALANCE);
    expect(slot0View(wallet.get()).lastWin).toBeNull();
  });

  it("W3: an all-in bet of exactly the balance is accepted and leaves 0, never negative", () => {
    bet(DEFAULT_BALANCE);
    expect(slot0View(wallet.get())).toMatchObject({
      balance: 0,
      roundBet: DEFAULT_BALANCE,
      participating: true,
    });
    expect(refusals).toEqual([]);
  });

  it("W5/H1: a repeated bettingOpened of the participation's own round cannot re-open it", () => {
    bet(5);
    dive();
    cashOut(2);
    emitIn(roundId, "bettingOpened", {});
    expect(slot0View(wallet.get())).toMatchObject({ participating: true, settledBy: "cashout" });
    cashOut(3);
    expect(slot0View(wallet.get()).balance).toBe(1005);
    openBetting(); // the next round still resets as before
    expect(slot0View(wallet.get())).toMatchObject({
      participating: false,
      roundBet: 0,
      settledBy: null,
    });
  });

  it("W6/H2: a second shipImpact cannot lower the chest base — the delta uses the recorded jackpot payout", () => {
    bet(1);
    dive();
    impact(100); // credit 100.00, recorded
    impact(1); // duplicate/forged: history only, no credit
    reveal();
    pick(2, 5, 500); // total 500.00 − recorded 100.00 = 400.00 (the U2 code paid 499)
    expect(slot0View(wallet.get()).balance).toBe(1499);
    expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 500, mult: 500 });
  });

  it("W6/H5: a final multiplier below the jackpot is refused — a chest never debits", () => {
    bet(10);
    dive();
    impact(100);
    const before = slot0View(wallet.get());
    pick(0, 0.5, 50);
    expect(slot0View(wallet.get())).toBe(before);
    expect(rules()).toEqual(["chestPicked:W6"]);
  });

  it("W4/H6: settlement events of another round pay nothing", () => {
    bet(10);
    dive();
    const before = slot0View(wallet.get());
    emitIn(roundId + 1, "cashedOut", { slot: 0, multiplier: 2 });
    emitIn(roundId - 1, "shipImpact", { jackpotMultiplier: 100 });
    expect(slot0View(wallet.get())).toBe(before);
    impact(100);
    const afterJackpot = slot0View(wallet.get());
    emitIn(roundId + 1, "chestPicked", { chestId: 0, chestMultiplier: 2, finalMultiplier: 200 });
    expect(slot0View(wallet.get())).toBe(afterJackpot);
    expect(rules()).toEqual(["cashedOut:W4", "shipImpact:W4", "chestPicked:W4"]);
  });

  describe("W7/W8: invalid settlement multipliers never credit and change nothing (M1-D14, I10, I11)", () => {
    const INVALID: unknown[] = [NaN, Infinity, -Infinity, -1, -0, 0, "2"];

    it("cashedOut", () => {
      // One round per value: since W10 the first refusal faults the round.
      for (const m of INVALID) {
        openBetting();
        bet(10);
        dive();
        const before = slot0View(wallet.get());
        cashOut(m as number);
        expect(slot0View(wallet.get())).toBe(before);
      }
      expect(flashes).toEqual([]);
      expect(rules()).toEqual(INVALID.map(() => "cashedOut:W7"));
    });

    it("shipImpact (participant and spectator alike: no credit, no history, no flash)", () => {
      const spectatorBefore = slot0View(wallet.get());
      for (const m of INVALID) impact(m as number);
      expect(slot0View(wallet.get())).toBe(spectatorBefore);
      bet(10);
      dive();
      const before = slot0View(wallet.get());
      for (const m of INVALID) impact(m as number);
      expect(slot0View(wallet.get())).toBe(before);
      expect(flashes).toEqual([]);
    });

    it("chestPicked", () => {
      bet(10);
      dive();
      impact(100);
      const before = slot0View(wallet.get());
      for (const m of INVALID) pick(1, 2, m as number);
      expect(slot0View(wallet.get())).toBe(before);
      expect(
        Number.isFinite(slot0View(wallet.get()).balance) && slot0View(wallet.get()).balance >= 0,
      ).toBe(true);
    });
  });

  describe("W10: a faulted participation is never credited later in its round (Q9c)", () => {
    const faultOf = (i: number) => refusals[i]?.fault;

    it("an invalid cashout faults the round: a later valid cashout, jackpot and chest pay nothing", () => {
      bet(10);
      dive();
      const afterBet = slot0View(wallet.get());
      cashOut(NaN);
      cashOut(2);
      impact(100);
      reveal();
      pick(1, 6.5, 650);
      // Not one write: no credit, no history, no lastWin, no flash (W8).
      expect(slot0View(wallet.get())).toBe(afterBet);
      expect(flashes).toEqual([]);
      // The chest pick is not even eligible (no jackpot settlement): ignored
      // silently by the E-X1 guard before W10 is reached.
      expect(rules()).toEqual(["cashedOut:W7", "cashedOut:W10", "shipImpact:W10"]);
    });

    it("the fault preserves its diagnostics and is reported with every blocked event", () => {
      bet(10);
      dive();
      cashOut(-1);
      cashOut(2);
      const fault = faultOf(0);
      expect(fault).toEqual({
        roundId,
        slot: 0,
        stake: 10,
        creditedCents: 0n,
        event: "cashedOut",
        rule: "W7",
        reason: "invalid multiplier or payout",
        payload: { roundId, slot: 0, multiplier: -1 },
      });
      expect(faultOf(1)).toBe(fault);
    });

    it("neither refunds nor forfeits: the stake stays debited exactly as before the fault", () => {
      bet(10);
      dive();
      cashOut(Infinity);
      expect(slot0View(wallet.get())).toMatchObject({
        balance: 990,
        roundBet: 10,
        participating: true,
        hasCashed: false,
        settledBy: null,
      });
      crash(1.5); // the round ends: still no money movement
      expect(slot0View(wallet.get()).balance).toBe(990);
      // R2: a technical failure is not a player loss — no loss entry.
      expect(slot0View(wallet.get()).history).toEqual([]);
    });

    it("an invalid jackpot faults the round; a duplicate valid shipImpact then pays nothing", () => {
      bet(10);
      dive();
      const afterBet = slot0View(wallet.get());
      impact(0);
      impact(100);
      expect(slot0View(wallet.get())).toBe(afterBet);
      expect(rules()).toEqual(["shipImpact:W7", "shipImpact:W10"]);
    });

    it("an invalid chest after the jackpot credit blocks a later chest; the jackpot credit stands", () => {
      bet(10);
      dive();
      impact(100);
      const afterJackpot = slot0View(wallet.get());
      expect(afterJackpot.balance).toBe(1990);
      reveal();
      pick(0, 0.5, 50); // W6: below the credited jackpot
      pick(2, 30, 3000);
      expect(slot0View(wallet.get())).toBe(afterJackpot);
      expect(rules()).toEqual(["chestPicked:W6", "chestPicked:W10"]);
      expect(faultOf(0)).toMatchObject({ event: "chestPicked", rule: "W6", stake: 10 });
    });

    it("a foreign-round event never faults the participation (W4 stays a plain refusal)", () => {
      bet(10);
      dive();
      emitIn(roundId + 1, "cashedOut", { slot: 0, multiplier: NaN });
      emitIn(roundId + 1, "shipImpact", { jackpotMultiplier: NaN });
      cashOut(2);
      expect(slot0View(wallet.get()).balance).toBe(1010);
      expect(rules()).toEqual(["cashedOut:W4", "shipImpact:W7"]);
      expect(refusals.every((r) => r.fault === undefined)).toBe(true);
    });

    it("a spectator's invalid shipImpact faults nothing; settled participations are not faulted", () => {
      impact(NaN); // spectator
      bet(5);
      dive();
      cashOut(2);
      impact(NaN); // already settled by cashout
      expect(refusals.map((r) => r.fault)).toEqual([undefined, undefined]);
      expect(slot0View(wallet.get()).balance).toBe(1005);
    });

    it("the fault is per round: the same-round bettingOpened keeps it, the next round clears it", () => {
      bet(10);
      dive();
      cashOut(NaN);
      emitIn(roundId, "bettingOpened", {}); // W5: same round, ignored
      cashOut(2);
      expect(slot0View(wallet.get()).balance).toBe(990);
      openBetting();
      bet(10);
      dive();
      cashOut(2);
      expect(slot0View(wallet.get()).balance).toBe(1000);
      expect(rules()).toEqual(["cashedOut:W7", "cashedOut:W10"]);
    });
  });

  describe("R2: a faulted participation is an auditable unresolved claim (Q9c, owner 2026-11-14)", () => {
    it("starts empty; W4, spectator and already-settled refusals record no claim", () => {
      expect(wallet.unresolvedClaims()).toEqual([]);
      impact(NaN); // spectator
      bet(5);
      dive();
      emitIn(roundId + 1, "cashedOut", { slot: 0, multiplier: NaN }); // W4
      cashOut(2);
      impact(NaN); // already settled
      expect(refusals).toHaveLength(3);
      expect(wallet.unresolvedClaims()).toEqual([]);
    });

    it("records stake, round, fault and zero credited for a cashout fault", () => {
      bet(12.34);
      dive();
      cashOut(NaN);
      expect(wallet.unresolvedClaims()).toEqual([
        {
          roundId,
          slot: 0,
          stake: 12.34,
          creditedCents: 0n,
          event: "cashedOut",
          rule: "W7",
          reason: "invalid multiplier or payout",
          payload: { roundId, slot: 0, multiplier: NaN },
        },
      ]);
      expect(wallet.unresolvedClaims()[0]).toBe(refusals[0]?.fault);
    });

    it("records the jackpot payout already credited when the chest faults", () => {
      bet(0.29);
      dive();
      impact(100.57); // ⌊0.29 × 100.57 × 100⌋ = 2916 cents credited
      reveal();
      pick(0, 0.5, 50.28); // W6: below the credited jackpot
      expect(wallet.unresolvedClaims()).toHaveLength(1);
      expect(wallet.unresolvedClaims()[0]).toMatchObject({
        stake: 0.29,
        creditedCents: 2916n,
        event: "chestPicked",
        rule: "W6",
      });
      expect(slot0View(wallet.get()).balance).toBe(+(1000 - 0.29 + 29.16).toFixed(2));
    });

    it("survives the round reset and later rounds; late events of the faulted round credit nothing", () => {
      bet(10);
      dive();
      const faultedRound = roundId;
      cashOut(Infinity);
      crash(1.2);
      openBetting(); // the next round: the active marker clears, the claim stays
      // Late valid events of the faulted round, while not participating.
      emitIn(faultedRound, "cashedOut", { slot: 0, multiplier: 2 });
      emitIn(faultedRound, "chestPicked", { chestId: 0, chestMultiplier: 2, finalMultiplier: 200 });
      expect(slot0View(wallet.get()).balance).toBe(990);
      bet(10);
      dive();
      // ...and while participating in the next round (W4).
      emitIn(faultedRound, "cashedOut", { slot: 0, multiplier: 2 });
      emitIn(faultedRound, "shipImpact", { jackpotMultiplier: 100 });
      expect(slot0View(wallet.get()).balance).toBe(980);
      cashOut(2); // the new round itself settles normally
      expect(slot0View(wallet.get()).balance).toBe(1000);
      openBetting();
      expect(wallet.unresolvedClaims()).toHaveLength(1);
      expect(wallet.unresolvedClaims()[0]).toMatchObject({
        roundId: faultedRound,
        slot: 0,
        stake: 10,
      });
    });

    it("appends one claim per faulted participation, oldest first", () => {
      for (const m of [NaN, -1]) {
        openBetting();
        bet(10);
        dive();
        cashOut(m);
        cashOut(m); // a repeat in the same round is W10, not a second claim
      }
      expect(wallet.unresolvedClaims().map((c) => c.payload)).toEqual([
        { roundId: roundId - 1, slot: 0, multiplier: NaN },
        { roundId, slot: 0, multiplier: -1 },
      ]);
      expect(slot0View(wallet.get()).balance).toBe(980);
    });

    it("the audit list cannot be altered through its read surface", () => {
      bet(10);
      dive();
      cashOut(NaN);
      const list = wallet.unresolvedClaims();
      expect(Object.isFrozen(list)).toBe(true);
      expect(Object.isFrozen(list[0])).toBe(true);
      expect(() => (list as SettlementFault[]).pop()).toThrow(TypeError);
      expect(wallet.unresolvedClaims()).toHaveLength(1);
    });

    it("only the faulted round's crash is withheld from history; other losses are still recorded", () => {
      bet(10);
      dive();
      cashOut(NaN);
      crash(1.4);
      openBetting();
      bet(10);
      dive();
      crash(1.3); // an ordinary loss
      expect(slot0View(wallet.get()).history).toEqual([{ mult: 1.3, crashed: true }]);
    });
  });

  describe("W11: a credit outside the 2^44 envelope is an unresolved claim, never applied (owner 2026-11-14)", () => {
    // Integer-cent expectations only (BigInt literals), never toFixed.
    const LIMIT_UNITS = 17592186044416; // 2^44
    const F = 10_000_000_000_000; // funded balance: 1000 × 1e10 (1e15 cents)
    const centsOf = (amount: number) => BigInt(Math.round(amount * 100));

    /** Round 1: all-in 1000 cashed at 1e10 → balance 1e13 (exact). Leaves round 2 open for betting. */
    const fund = () => {
      bet(1000);
      dive();
      cashOut(1e10);
      expect(slot0View(wallet.get()).balance).toBe(F);
      crash(1e10);
      openBetting();
      flashes = [];
      refusals.length = 0;
    };

    // Stakes s with F − s + 2s = F + s landing just below, at and above 2^44.
    const BELOW = 7592186044415.99; // → 2^44 − 0.01
    const AT = 7592186044416; // → 2^44
    const ABOVE = 7592186044416.01; // → 2^44 + 0.01

    it("cashout immediately below 2^44: credited exactly, lands at 2^44 − 0.01", () => {
      fund();
      bet(BELOW);
      dive();
      cashOut(2);
      expect(refusals).toEqual([]);
      expect(slot0View(wallet.get()).balance).toBe(17592186044415.99);
      expect(centsOf(slot0View(wallet.get()).balance)).toBe(2n ** 44n * 100n - 1n);
      expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 15184372088831.98, mult: 2 });
      expect(slot0View(wallet.get()).settledBy).toBe("cashout");
      expect(wallet.unresolvedClaims()).toEqual([]);
    });

    for (const [label, stake] of [
      ["at", AT],
      ["above", ABOVE],
    ] as const) {
      it(`cashout ${label} 2^44: refused as W11, nothing applied, the exact unpaid payout kept as a claim`, () => {
        fund();
        bet(stake);
        dive();
        const before = slot0View(wallet.get());
        cashOut(2);
        // Not mutated, not rounded, no flash, no history, no settlement.
        expect(slot0View(wallet.get())).toBe(before);
        expect(flashes).toEqual([]);
        expect(rules()).toEqual(["cashedOut:W11"]);
        const unpaid = centsOf(stake) * 2n;
        expect(wallet.unresolvedClaims()).toEqual([
          {
            roundId,
            slot: 0,
            stake,
            creditedCents: 0n,
            unpaidCents: unpaid,
            event: "cashedOut",
            rule: "W11",
            reason: "credit outside the exact balance envelope (2^44)",
            payload: { roundId, slot: 0, multiplier: 2 },
          },
        ]);
        expect(refusals[0]?.fault).toBe(wallet.unresolvedClaims()[0]);
        // No repeated payment: later settlement events of the round are W10.
        cashOut(2);
        impact(3);
        expect(rules()).toEqual(["cashedOut:W11", "cashedOut:W10", "shipImpact:W10"]);
        expect(refusals[1]?.fault).toBe(wallet.unresolvedClaims()[0]);
        // Not a loss: the round's crash adds no loss entry.
        crash(2.5);
        expect(slot0View(wallet.get())).toBe(before);
        expect(wallet.unresolvedClaims()).toHaveLength(1);
        expect(slot0View(wallet.get()).balance).toBeLessThan(LIMIT_UNITS);
      });
    }

    it("jackpot at 2^44: refused as W11; the chest result is kept once as a follow-up claim, nothing credited", () => {
      fund();
      bet(AT);
      dive();
      const before = slot0View(wallet.get());
      impact(2);
      expect(slot0View(wallet.get())).toBe(before); // no jackpot multiplier, balance, history or flash write
      expect(flashes).toEqual([]);
      reveal();
      pick(2, 1.5, 3);
      pick(1, 1.5, 3); // a repeat: W10, no second chest claim
      emitIn(roundId, "shipImpact", { jackpotMultiplier: 2 }); // a repeated impact: W10
      expect(rules()).toEqual([
        "shipImpact:W11",
        "chestPicked:W11",
        "chestPicked:W10",
        "shipImpact:W10",
      ]);
      expect(slot0View(wallet.get())).toBe(before);
      const s = centsOf(AT);
      const claims = wallet.unresolvedClaims();
      expect(claims).toEqual([
        {
          roundId,
          slot: 0,
          stake: AT,
          creditedCents: 0n,
          unpaidCents: 2n * s,
          event: "shipImpact",
          rule: "W11",
          reason: "credit outside the exact balance envelope (2^44)",
          payload: { roundId, jackpotMultiplier: 2 },
        },
        {
          roundId,
          slot: 0,
          stake: AT,
          creditedCents: 0n,
          unpaidCents: s, // total 3s − jackpot 2s
          event: "chestPicked",
          rule: "W11",
          reason: "chest delta withheld: the round's jackpot is an unresolved claim",
          payload: { roundId, chestId: 2, chestMultiplier: 1.5, finalMultiplier: 3 },
        },
      ]);
      // The participation's full unpaid win is the sum of its claims: ⌊s × 3⌋.
      expect(claims.reduce((sum, c) => sum + (c.unpaidCents ?? 0n), 0n)).toBe(3n * s);
      expect(refusals[2]?.fault).toBe(claims[0]); // the W10 report carries the original fault
    });

    it("jackpot at 2^44 then an invalid chest result: no follow-up claim, refused as W10", () => {
      fund();
      bet(AT);
      dive();
      impact(2);
      reveal();
      pick(0, 0.5, 1); // below the withheld jackpot
      pick(0, 1, NaN);
      expect(rules()).toEqual(["shipImpact:W11", "chestPicked:W10", "chestPicked:W10"]);
      expect(wallet.unresolvedClaims()).toHaveLength(1);
    });

    describe("chest delta across the boundary after a credited jackpot (stake 5e12, jackpot ×2 → 1.5e13)", () => {
      const S = 5_000_000_000_000;
      const setUp = () => {
        fund();
        bet(S);
        dive();
        impact(2);
        expect(slot0View(wallet.get()).balance).toBe(15_000_000_000_000);
        reveal();
        flashes = [];
      };

      it("below: delta lands at 2^44 − 0.50, credited exactly", () => {
        setUp();
        pick(1, 1.25921860444155, 2.5184372088831);
        expect(refusals).toEqual([]);
        expect(slot0View(wallet.get()).balance).toBe(17592186044415.5);
        expect(slot0View(wallet.get()).lastWin).toEqual({
          amount: 12592186044415.5,
          mult: 2.5184372088831,
        });
        expect(slot0View(wallet.get()).chestSettled).toBe(true);
      });

      for (const [label, final] of [
        ["at", 2.5184372088832],
        ["above", 3],
      ] as const) {
        it(`${label}: refused as W11; the credited jackpot and the exact unpaid delta are both recorded`, () => {
          setUp();
          const before = slot0View(wallet.get());
          pick(1, final / 2, final);
          expect(slot0View(wallet.get())).toBe(before); // balance stays 1.5e13; lastWin is the jackpot
          expect(rules()).toEqual(["chestPicked:W11"]);
          const total = (centsOf(S) * BigInt(Math.round(final * 1e13))) / 10n ** 13n;
          expect(wallet.unresolvedClaims()).toEqual([
            expect.objectContaining({
              stake: S,
              creditedCents: 1_000_000_000_000_000n, // the jackpot 1e13 units, paid
              unpaidCents: total - 1_000_000_000_000_000n,
              event: "chestPicked",
              rule: "W11",
            }),
          ]);
          pick(1, final / 2, final); // a repeat: W10, not credited, no second claim
          expect(rules()).toEqual(["chestPicked:W11", "chestPicked:W10"]);
          expect(slot0View(wallet.get())).toBe(before);
          expect(wallet.unresolvedClaims()).toHaveLength(1);
        });
      }
    });

    it("a W11 claim stays distinguishable from invalid data (W7) and from a loss; later rounds settle normally", () => {
      fund();
      bet(AT);
      dive();
      cashOut(2); // W11: valid win, unrepresentable
      crash(3);
      openBetting();
      bet(10);
      dive();
      cashOut(NaN); // W7: invalid data
      crash(3);
      openBetting();
      bet(10);
      dive();
      crash(1.1); // an ordinary loss
      openBetting();
      bet(10);
      dive();
      cashOut(2); // an ordinary win, inside the envelope
      const [w11, w7] = wallet.unresolvedClaims();
      expect(w11).toMatchObject({ rule: "W11", unpaidCents: centsOf(AT) * 2n });
      expect(w7).toMatchObject({ rule: "W7" });
      expect(w7).not.toHaveProperty("unpaidCents");
      expect(slot0View(wallet.get()).history).toEqual([
        { mult: 2, crashed: false },
        { mult: 1.1, crashed: true },
        { mult: 1e10, crashed: false }, // the funding cashout
      ]);
      expect(slot0View(wallet.get()).balance).toBe(F - AT - 10 - 10 - 10 + 20);
    });
  });

  describe("payouts rounded down on every settlement path (M1-D8, M1-D13; I9)", () => {
    it("minimum stake 0.01 at 1.5014× pays 0.01 by cashout and by jackpot (V2: was 0.02)", () => {
      bet(0.01);
      dive();
      cashOut(1.5014);
      expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 0.01, mult: 1.5014 });
      expect(slot0View(wallet.get()).balance).toBe(1000);
      openBetting();
      bet(0.01);
      dive();
      impact(1.5014);
      expect(slot0View(wallet.get()).lastWin).toEqual({ amount: 0.01, mult: 1.5014 });
      expect(slot0View(wallet.get()).balance).toBe(1000);
    });

    it("jackpot: 0.29 × 100.57 → 29.16; 33.33 × 57.29 → 1909.47; 10 × 499.99 → 4999.90", () => {
      const cases: Array<[number, number, number]> = [
        [0.29, 100.57, 29.16],
        [33.33, 57.29, 1909.47],
        [10, 499.99, 4999.9],
      ];
      for (const [stake, jackpot, win] of cases) {
        openBetting();
        const start = slot0View(wallet.get()).balance;
        bet(stake);
        dive();
        impact(jackpot);
        expect(slot0View(wallet.get()).lastWin).toEqual({ amount: win, mult: jackpot });
        expect(Math.round(slot0View(wallet.get()).balance * 100)).toBe(
          Math.round(start * 100) - Math.round(stake * 100) + Math.round(win * 100),
        );
      }
    });

    const chestCases: Array<[number, number, number, number, number]> = [
      // stake, jackpot, final, total payout, delta
      [0.01, 50.01, 50.51, 0.5, 0], // round-to-nearest paid a 0.01 delta
      [0.01, 500, 25000, 250, 245],
      [0.29, 57.29, 65.88, 19.1, 2.49], // round-to-nearest paid 2.50
    ];
    for (const [stake, jackpot, final, total, delta] of chestCases) {
      it(`chest: stake ${stake}, jackpot ${jackpot} → final ${final}: total ${total}, delta ${delta}`, () => {
        bet(stake);
        dive();
        impact(jackpot);
        const afterJackpot = slot0View(wallet.get()).balance;
        reveal();
        pick(1, final / jackpot, final); // the engine's finalMultiplier as emitted
        expect(slot0View(wallet.get()).lastWin).toEqual({ amount: total, mult: final });
        expect(Math.round((slot0View(wallet.get()).balance - afterJackpot) * 100)).toBe(
          Math.round(delta * 100),
        );
        // Credits per participation sum to the rounded-down total.
        expect(
          Math.round((slot0View(wallet.get()).balance - (DEFAULT_BALANCE - stake)) * 100),
        ).toBe(Math.round(total * 100));
      });
    }

    // MT-07 (docs/07 §23.7 V2 block: "each case runs through all three
    // settlement paths"; I9). Expected cents are integer literals, checked
    // against the integer oracle ⌊k · N / 10^4⌋ (k = 1 cent, m = N / 10^4).
    const minimumStakeCases: Array<[number, bigint, bigint]> = [
      // multiplier, N = m · 10^4, expected cents
      [1.5, 15000n, 1n],
      [1.5014, 15014n, 1n], // V2: round-to-nearest paid 0.02
      [2.4999, 24999n, 2n],
    ];
    for (const [m, n, expected] of minimumStakeCases) {
      it(`MT-07: stake 0.01 at ${m}× pays ${expected} cent(s) by cashout, by jackpot, and as the chest total`, () => {
        const centsOf = (amount: number) => BigInt(Math.round(amount * 100));
        expect((1n * n) / 10000n).toBe(expected); // the literal is the integer oracle's value

        // Cashout at m.
        bet(0.01);
        dive();
        cashOut(m);
        expect(slot0View(wallet.get()).lastWin).toEqual({
          amount: Number(expected) / 100,
          mult: m,
        });
        expect(centsOf(slot0View(wallet.get()).balance)).toBe(100000n - 1n + expected);

        // Jackpot auto-cash at m.
        openBetting();
        const beforeJackpot = centsOf(slot0View(wallet.get()).balance);
        bet(0.01);
        dive();
        impact(m);
        expect(slot0View(wallet.get()).lastWin).toEqual({
          amount: Number(expected) / 100,
          mult: m,
        });
        expect(centsOf(slot0View(wallet.get()).balance)).toBe(beforeJackpot - 1n + expected);

        // Chest: jackpot 1.5 (1 cent), then final m — total ⌊1 · m⌋, delta total − 1.
        openBetting();
        const beforeChest = centsOf(slot0View(wallet.get()).balance);
        bet(0.01);
        dive();
        impact(1.5);
        const jackpotCredit = centsOf(slot0View(wallet.get()).balance) - (beforeChest - 1n);
        expect(jackpotCredit).toBe(1n);
        reveal();
        pick(1, m / 1.5, m); // the engine's finalMultiplier as emitted
        const delta = centsOf(slot0View(wallet.get()).balance) - (beforeChest - 1n) - jackpotCredit;
        expect(delta).toBe(expected - 1n);
        expect(slot0View(wallet.get()).lastWin).toEqual({
          amount: Number(expected) / 100,
          mult: m,
        });
        // Credits per participation sum to the rounded-down total.
        expect(jackpotCredit + delta).toBe(expected);

        expect(refusals).toEqual([]);
      });
    }
  });

  it("without onRefusal a refusal is silent and still writes nothing", () => {
    const silent = createWalletStore(bus);
    const before = silent.get();
    bet(0.005);
    expect(silent.get()).toBe(before);
  });
});
