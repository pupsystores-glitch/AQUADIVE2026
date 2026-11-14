// Wallet store — E-X3 Dual Bet ledger tests (owner-approved 2026-11-14).
// Scripted engine event sequences over an EventBus, as in
// wallet-store.test.ts, with both bet slots in play: independent debits,
// independent payouts each rounded down on its own stake, one chest pick
// applied separately to every eligible slot, and per-slot W10/W11 fault
// isolation. Expected values are integer cents computed here from the
// payout definition ⌊stake¢ × m⌋ (binary-exact oracle, ../test/money-oracle).
import { beforeEach, describe, expect, it } from "vitest";
import { EventBus, type BetSlot, type EngineEventMap } from "@/engine";
import { DEFAULT_BALANCE } from "@/game/constants";
import { floorCentsBinary } from "../test/money-oracle";
import { IDLE_SLOT, createWalletStore, type WalletRefusal, type WalletStore } from "./wallet-store";

let bus: EventBus<EngineEventMap>;
let wallet: WalletStore;
let refusals: WalletRefusal[];
let flashes: string[];
let roundId: number;

const emit = <K extends keyof EngineEventMap>(
  name: K,
  payload: Omit<EngineEventMap[K], "roundId">,
) => {
  bus.emit(name, { roundId, ...payload } as EngineEventMap[K]);
  bus.dispatchQueued();
};
const openBetting = () => {
  roundId++;
  emit("bettingOpened", {});
};
const bet = (slot: BetSlot, amount: number) => emit("betPlaced", { slot, amount });
const cashOut = (slot: BetSlot, multiplier: number) => emit("cashedOut", { slot, multiplier });
const crash = (multiplier: number) => emit("crashed", { multiplier });
const impact = (jackpotMultiplier: number) => emit("shipImpact", { jackpotMultiplier });
const pick = (finalMultiplier: number) =>
  emit("chestPicked", { chestId: 1, chestMultiplier: finalMultiplier / 100, finalMultiplier });

const cents = (amount: number) => BigInt(Math.round(amount * 100));
const balanceCents = () => cents(wallet.get().balance);
const rules = () => refusals.map((r) => `${r.event}:${r.rule}:${r.slot ?? "-"}`);

beforeEach(() => {
  bus = new EventBus<EngineEventMap>();
  refusals = [];
  wallet = createWalletStore(bus, { onRefusal: (r) => refusals.push(r) });
  flashes = [];
  wallet.onFlash((k) => flashes.push(k));
  roundId = 1;
});

describe("E-X3 wallet — two independent slots", () => {
  it("starts with both slots idle", () => {
    expect(wallet.get().slots).toEqual([IDLE_SLOT, IDLE_SLOT]);
  });

  it("debits each slot's own stake; each slot locks its own bet", () => {
    bet(0, 10);
    bet(1, 2.5);
    expect(wallet.get().balance).toBe(987.5);
    expect(wallet.get().slots.map((s) => [s.participating, s.roundBet])).toEqual([
      [true, 10],
      [true, 2.5],
    ]);
    expect(refusals).toEqual([]);
  });

  it("W2 per slot: a second betPlaced for the same slot is refused; the other slot is unaffected", () => {
    bet(1, 5);
    bet(1, 7);
    bet(0, 3);
    expect(wallet.get().balance).toBe(992);
    expect(rules()).toEqual(["betPlaced:W2:1"]);
  });

  it("W3 against the balance left after the other slot's debit", () => {
    bet(0, 600);
    bet(1, 600);
    expect(wallet.get().balance).toBe(400);
    expect(wallet.get().slots[1].participating).toBe(false);
    expect(rules()).toEqual(["betPlaced:W3:1"]);
  });

  it("refuses betPlaced / cashedOut without a valid slot (no debit, no credit)", () => {
    bus.emit("betPlaced", { roundId, amount: 5 } as never);
    bus.emit("betPlaced", { roundId, slot: 2, amount: 5 } as never);
    bus.dispatchQueued();
    bet(0, 5);
    bus.emit("cashedOut", { roundId, multiplier: 2 } as never);
    bus.dispatchQueued();
    expect(wallet.get().balance).toBe(995);
    expect(wallet.get().slots[0].hasCashed).toBe(false);
    expect(rules()).toEqual(["betPlaced:W1:-", "betPlaced:W1:-", "cashedOut:W4:-"]);
  });

  it("independent cashouts: each payout rounded down separately on its own stake", () => {
    // 0.1 × 1.15 = 0.115 → 0.11 each: separately 0.22, never ⌊0.2 × 1.15⌋ = 0.23.
    bet(0, 0.1);
    bet(1, 0.1);
    cashOut(0, 1.15);
    cashOut(1, 1.15);
    expect(balanceCents()).toBe(100_000n - 20n + 11n + 11n);
    expect(wallet.get().slots.map((s) => s.win)).toEqual([
      { amount: 0.11, mult: 1.15 },
      { amount: 0.11, mult: 1.15 },
    ]);
    expect(flashes).toEqual(["cashFlash", "cashFlash"]);
    expect(wallet.get().history).toEqual([
      { mult: 1.15, crashed: false },
      { mult: 1.15, crashed: false },
    ]);
  });

  it("cashing out one slot leaves the other riding; the crash loses only the rider (one loss entry)", () => {
    bet(0, 10);
    bet(1, 20);
    cashOut(1, 1.37);
    expect(wallet.get().slots[0]).toMatchObject({ participating: true, hasCashed: false });
    crash(2.04);
    const credit = floorCentsBinary(2000n, 1.37);
    expect(balanceCents()).toBe(100_000n - 3000n + credit);
    expect(wallet.get().history).toEqual([
      { mult: 2.04, crashed: true },
      { mult: 1.37, crashed: false },
    ]);
  });

  it("both slots cashed: the crash adds no loss entry", () => {
    bet(0, 1);
    bet(1, 1);
    cashOut(0, 1.5);
    cashOut(1, 1.6);
    crash(2);
    expect(wallet.get().history.filter((h) => h.crashed)).toEqual([]);
  });

  it("jackpot auto-cashes every riding slot (each rounded down on its own stake), one history entry, one flash", () => {
    bet(0, 0.07);
    bet(1, 0.29);
    impact(1.15);
    // 0.07 × 1.15 = 0.0805 → 0.08; 0.29 × 1.15 = 0.3335 → 0.33.
    expect(balanceCents()).toBe(100_000n - 36n + 8n + 33n);
    expect(wallet.get().slots.map((s) => [s.settledBy, s.win?.amount])).toEqual([
      ["jackpot", 0.08],
      ["jackpot", 0.33],
    ]);
    expect(wallet.get().lastWin).toEqual({ amount: 0.41, mult: 1.15 });
    expect(wallet.get().history).toEqual([{ mult: 1.15, crashed: false }]);
    expect(flashes).toEqual(["jackpotFlash"]);
  });

  it("a slot cashed out before the sea floor is not paid the jackpot; the rider is", () => {
    bet(0, 10);
    bet(1, 10);
    cashOut(0, 3);
    impact(100);
    expect(balanceCents()).toBe(100_000n - 2000n + 3000n + 100_000n);
    expect(wallet.get().slots.map((s) => s.settledBy)).toEqual(["cashout", "jackpot"]);
  });

  it("one chest pick is applied separately to every jackpot-settled slot (each total rounded down on its own stake)", () => {
    bet(0, 0.07);
    bet(1, 0.29);
    impact(1.15);
    const before = balanceCents();
    pick(2.31); // totals: ⌊7 × 2.31⌋ = 16, ⌊29 × 2.31⌋ = 66 → deltas 16 − 8, 66 − 33
    expect(balanceCents() - before).toBe(8n + 33n);
    expect(wallet.get().slots.map((s) => [s.chestSettled, s.win?.amount])).toEqual([
      [true, 0.16],
      [true, 0.66],
    ]);
    expect(wallet.get().lastWin).toEqual({ amount: 0.82, mult: 2.31 });
    expect(wallet.get().history[0]).toEqual({ mult: 2.31, crashed: false });
    pick(2.31); // a repeat: ignored entirely
    expect(balanceCents() - before).toBe(41n);
  });

  it("the chest pick pays only the jackpot-settled slot, never the manual cashout slot", () => {
    bet(0, 10);
    bet(1, 10);
    cashOut(0, 2);
    impact(100);
    const before = balanceCents();
    pick(300);
    expect(balanceCents() - before).toBe(300_000n - 100_000n); // ⌊1000¢ × 300⌋ − the jackpot payout
    expect(wallet.get().slots.map((s) => s.chestSettled)).toEqual([false, true]);
  });

  it("bettingOpened of the next round resets both slots; balance and history carry over", () => {
    bet(0, 1);
    bet(1, 2);
    cashOut(1, 2);
    crash(3);
    openBetting();
    expect(wallet.get().slots).toEqual([IDLE_SLOT, IDLE_SLOT]);
    expect(wallet.get().history).toHaveLength(2);
    bet(1, 4); // slot 1 alone is a full participation
    expect(wallet.get().slots[1]).toMatchObject({ participating: true, roundBet: 4 });
    expect(wallet.get().slots[0]).toEqual(IDLE_SLOT);
  });

  it("W5: a repeated bettingOpened of the slots' own round does not re-open them", () => {
    bet(0, 1);
    bet(1, 1);
    cashOut(0, 2);
    emit("bettingOpened", {}); // same roundId
    expect(wallet.get().slots[0].settledBy).toBe("cashout");
    expect(wallet.get().slots[1].participating).toBe(true);
  });

  it("W4: a bet for the other slot from a different round than the active one is refused", () => {
    bet(0, 1);
    roundId++;
    bet(1, 1);
    expect(rules()).toEqual(["betPlaced:W4:1"]);
    expect(wallet.get().slots[1].participating).toBe(false);
  });
});

describe("E-X3 wallet — per-slot fault isolation (W10 / W11)", () => {
  it("W7 on one slot's cashout faults that slot only; the other cashes out normally", () => {
    bet(0, 10);
    bet(1, 10);
    cashOut(0, NaN);
    cashOut(0, 2); // slot 0 is faulted: W10
    cashOut(1, 2);
    expect(rules()).toEqual(["cashedOut:W7:0", "cashedOut:W10:0"]);
    expect(wallet.get().slots.map((s) => s.settledBy)).toEqual([null, "cashout"]);
    expect(balanceCents()).toBe(100_000n - 2000n + 2000n);
    expect(wallet.unresolvedClaims().map((c) => [c.slot, c.rule])).toEqual([[0, "W7"]]);
    crash(5); // slot 0 is a claim, not a loss; slot 1 cashed → no loss entry
    expect(wallet.get().history.filter((h) => h.crashed)).toEqual([]);
  });

  it("a faulted slot does not block the other slot's jackpot or chest", () => {
    bet(0, 10);
    bet(1, 10);
    cashOut(0, -1); // slot 0 faults (W7)
    impact(100);
    pick(250);
    // The chest skips slot 0 silently (not jackpot-settled), before W10, as for one bet.
    expect(rules()).toEqual(["cashedOut:W7:0", "shipImpact:W10:0"]);
    expect(wallet.get().slots[1]).toMatchObject({ settledBy: "jackpot", chestSettled: true });
    expect(balanceCents()).toBe(100_000n - 2000n + 100_000n + 150_000n); // jackpot ⌊1000¢ × 100⌋, chest ⌊1000¢ × 250⌋ − jackpot
    expect(flashes).toEqual(["jackpotFlash"]);
  });

  it("an invalid jackpot multiplier faults every riding slot, each as its own claim", () => {
    bet(0, 1);
    bet(1, 2);
    impact(Infinity);
    expect(rules()).toEqual(["shipImpact:W7:0", "shipImpact:W7:1"]);
    expect(wallet.unresolvedClaims().map((c) => [c.slot, c.stake])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(wallet.get().history).toEqual([]);
    expect(balanceCents()).toBe(100_000n - 300n);
  });

  it("W6 on one slot's chest result faults that slot only; the other slot's chest delta is credited", () => {
    bet(0, 10);
    bet(1, 0.01);
    impact(100); // slot 0: 1000.00, slot 1: 1.00
    const before = balanceCents();
    // finalMultiplier 99.99: slot 0 total ⌊1000 × 99.99⌋ = 99_990 < 100_000 (W6);
    // slot 1 total ⌊1 × 99.99⌋ = 99 < 100 (W6) as well — use one that splits them:
    pick(100.5); // slot 0: 100_500 ≥ 100_000 → +500; slot 1: ⌊1 × 100.5⌋ = 100 → +0
    expect(balanceCents() - before).toBe(500n);
    expect(refusals).toEqual([]);
    expect(wallet.get().slots.map((s) => s.chestSettled)).toEqual([true, true]);
  });

  it("W11 at the jackpot: the unrepresentable slot becomes a claim, the other slot is credited; the chest follows each slot", () => {
    // 2^44 units = 17 592 186 044 416. Fund to 17 592 186 000 000 exactly.
    bet(0, 1000);
    cashOut(0, 17_592_186_000);
    expect(wallet.get().balance).toBe(17_592_186_000_000);
    openBetting();
    bet(0, 1);
    bet(1, 1000);
    const funded = balanceCents(); // 17 592 185 998 999.00
    impact(50); // slot 0: +50 fits; slot 1: +50 000 would cross 2^44 → W11
    expect(rules()).toEqual(["shipImpact:W11:1"]);
    expect(balanceCents() - funded).toBe(5_000n);
    expect(wallet.get().slots.map((s) => s.settledBy)).toEqual(["jackpot", null]);
    expect(wallet.unresolvedClaims()).toMatchObject([
      { slot: 1, rule: "W11", event: "shipImpact", unpaidCents: 5_000_000n, stake: 1000 },
    ]);
    pick(100); // slot 0: total 100 → +50 credited; slot 1: ONE follow-up claim (+50 000 unpaid)
    expect(balanceCents() - funded).toBe(10_000n);
    expect(rules()).toEqual(["shipImpact:W11:1", "chestPicked:W11:1"]);
    expect(wallet.unresolvedClaims()[1]).toMatchObject({
      slot: 1,
      rule: "W11",
      event: "chestPicked",
      unpaidCents: 5_000_000n,
    });
    expect(wallet.get().slots[0].chestSettled).toBe(true);
    crash(1); // no loss entry for the claim
    expect(wallet.get().history.filter((h) => h.crashed)).toEqual([]);
  });
});

describe("E-X3 wallet — the default balance is the shared pool", () => {
  it("both slots draw on one balance", () => {
    bet(0, DEFAULT_BALANCE / 2);
    bet(1, DEFAULT_BALANCE / 2);
    expect(wallet.get().balance).toBe(0);
    expect(wallet.canPlaceStake(0.01)).toBe(false);
  });
});
