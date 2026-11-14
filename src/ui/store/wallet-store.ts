// Wallet store — the settlement layer (docs/07_UI_ARCHITECTURE.md §10;
// docs/06_ENGINE_ARCHITECTURE.md §3). Sprint 4, Commit U2 (delta V1).
//
// The single home of money math: every balance, win and delta in the UI is
// computed here and nowhere else (§6). The listener bodies moved verbatim
// from the component shell; the debit and the `+(balance ± x).toFixed(2)`
// balance update are still the U2 float arithmetic. Superseded for payouts
// (M1-D8, M1-D13, docs/07 §23.3): every win is the exact rounded-down payout
// of ./payout.ts, never `+(bet × m).toFixed(2)`. Superseded for credits by
// W11: every credit is applied through the exact-cent `exactCredit`
// (./payout.ts); only the debit keeps `+(balance − x).toFixed(2)`, exact
// below 2^44 (I4), which W11 keeps every balance under. Rules:
//
// - One writer (§9): engine settlement events. The store exposes a read-only
//   surface; nothing outside this module can write wallet state.
// - Session lifetime (V1): subscribed once when the game session is
//   constructed (src/ui/session.ts), never torn down by React — a component
//   remount can neither reset the wallet nor make it miss an event.
// - Bet-basis lock (Sprint 3 Commit 8): the round bet locks in `betPlaced`
//   from the event payload — the exact accepted amount the wallet is debited
//   with — and is never read from the bet input.
// - Synchronous reads replace the shell's state+ref mirrors: the snapshot
//   IS the current value each listener reads.
// - Phase 8 shape: every mutation is a response to an engine event carrying
//   the authoritative values; swapping to server wallet events replaces the
//   listener bodies, not the read surface.
// - Settlement exclusivity (U2 bug fix): one participation settles through
//   exactly one path. `settledBy` records which payout was actually applied;
//   a manual cashout excludes the jackpot and chest credits of that round,
//   and the chest delta is paid only on top of this wallet's own jackpot
//   auto-credit, at most once per round. Enforced here, in the settlement
//   layer, independent of the chest picker's visibility. Only an eligible,
//   jackpot-settled participation records a chest result: since E-X1 the
//   engine never emits chestPicked for spectators or cashed-out players,
//   and should one still arrive it is ignored entirely — no credit, no
//   history entry.
// - Integrity guards (M1, rules W1–W9, docs/07 §23.17). Local consistency
//   checks only — they do NOT authenticate events (M1-D11):
//   W1 a betPlaced amount must be a valid stake; W2 no second betPlaced while
//   participating; W3 no betPlaced above the balance; W4 a participation is bound to its betPlaced roundId and
//   settles only from events of that round; W5 only a bettingOpened of a
//   different round clears it, never diveStarted; W6 the chest delta is the
//   rounded-down total minus the jackpot payout recorded at its credit,
//   refused if negative; W7 settlement multipliers are finite numbers > 0
//   and every payout and resulting balance is finite and ≥ 0; W8 a refused
//   event writes nothing (no zero credit, history, lastWin or flash) and an
//   accepted one is one snapshot write; W9 every refusal is reported to the
//   optional onRefusal diagnostic.
//   W10 (Q9c, owner decision R2, 2026-11-14): a W6 or W7 refusal of a
//   settlement event of the participation's own round faults that
//   participation. The fault is a non-financial marker. No later event of
//   that round may credit the participation; each one is refused as W10,
//   and its report carries the original fault. The marker never moves
//   money: the stake is neither refunded nor forfeited (no automatic
//   resolution — R2 is a temporary local-demo policy). The fault is also
//   appended to an auditable, append-only list of unresolved claims
//   (`unresolvedClaims()`): round, stake, the fault and the amount already
//   credited to that participation. That list lives for the session and is
//   never cleared by a round reset. Only the round's active marker is
//   cleared, like the rest of the settlement record (W5), by a bettingOpened
//   of a different round or the next accepted betPlaced. A faulted
//   participation is not a loss: its round's `crashed` adds no loss entry.
//   W11 (owner, 2026-11-14; docs/07 §23.21): every credit is decided in exact
//   integer cents before any lossy conversion (`exactCredit`): the existing
//   balance, the payout (or chest delta) and the resulting balance must all
//   be below 2^44 units. A credit outside that envelope is a legitimate,
//   valid win that cannot be represented: it is not applied, rounded or
//   recorded as a loss — it faults the participation under W10 as an R2
//   unresolved claim with rule "W11" (distinct from the W6/W7 invalid-data
//   faults) and the exact `unpaidCents`. A jackpot withheld this way keeps
//   its round's chest result too: the first chestPicked of that round adds
//   ONE follow-up W11 claim for the chest delta (total − jackpot) and credits
//   nothing; the participation's unpaid total is the sum of its claims'
//   `unpaidCents`. Any further chestPicked of the round is refused as W10.
//
// Flash triggers (§10: "flash triggers delegate to the notification
// store"): the wallet decides WHEN a win flash is due — the jackpot flash
// depends on pre-credit settlement state — and announces it via onFlash.
// Durations and timers are not owned here. Mid-migration seam (U2): the
// component shell subscribes until the notification store (U4) takes over.

// E-X3 (Dual Bet, owner-approved 2026-11-14): the player holds up to two
// independent bets per round, one per slot (0 | 1). Every per-round field
// and every rule above applies PER SLOT: each slot has its own locked bet,
// settlement record, W10 fault marker and W11 withheld-chest flag, so a
// fault in one slot never blocks or alters the other (per-slot fault
// isolation). Each slot's payout is rounded down separately (never on the
// combined stake). The balance, history, lastWin and the claims audit list
// are shared. W2 is per slot: no second betPlaced for a slot that already
// participates; W3 checks the balance left after the other slot's debit.
// A betPlaced or cashedOut without a valid slot is refused (W1 / W4).
// shipImpact auto-settles every payable slot of its round (one history
// entry, one flash); the round's single chestPicked applies to every
// jackpot-settled slot (one history entry). lastWin is the event's combined
// credit; each slot's own win is `slots[slot].win`.

import { BET_SLOTS, type BetSlot, type EngineEventMap, type EventBus } from "@/engine";
import { HISTORY_LIMIT } from "@/game/config";
import { DEFAULT_BALANCE } from "@/game/constants";
import type { HistoryEntry, LastWin } from "@/game/types";
import { centsToAmount, exactCredit, isSettlementMultiplier, payoutCents } from "./payout";
import { isValidStake } from "./stake";
import { createStore, type ReadableStore } from "./store";

/** One bet slot's round state (E-X3). */
export interface WalletSlotState {
  /** This slot's locked bet: the accepted betPlaced amount; 0 when not participating. */
  readonly roundBet: number;
  /** A bet was accepted for this slot in the current round. */
  readonly participating: boolean;
  /** This slot's win is settled (manual cashout or jackpot auto-cash). */
  readonly hasCashed: boolean;
  /** Which payout settled this slot; null until one is applied. */
  readonly settledBy: "cashout" | "jackpot" | null;
  /** This slot's eligible (jackpot-settled) chest result has been applied — the per-round idempotency guard. */
  readonly chestSettled: boolean;
  /** This slot's credited win this round (cashout or jackpot, then the chest total); null until settled. */
  readonly win: LastWin | null;
}

export type WalletSlots = readonly [WalletSlotState, WalletSlotState];

export interface WalletState {
  /** Player balance — a canonical cent `number` below 2^44 units: debits rounded with toFixed(2), credits exact via W11 (minor-units migration is M2, §20). */
  readonly balance: number;
  /** E-X3: per-slot round state, index = BetSlot. */
  readonly slots: WalletSlots;
  /** The most recent win event's combined credit (manual cashout, jackpot, or chest total). */
  readonly lastWin: LastWin | null;
  /** Round results, newest first, capped at HISTORY_LIMIT. */
  readonly history: readonly HistoryEntry[];
  /** Jackpot base from the last shipImpact (display/history value; since M1 the chest delta uses the recorded jackpot payout, W6). */
  readonly jackpotMultiplier: number;
}

/** A settlement event the wallet refused (W9). Diagnostic only: it never repairs state. */
export interface WalletRefusal {
  readonly event: "betPlaced" | "cashedOut" | "shipImpact" | "chestPicked";
  readonly rule: "W1" | "W2" | "W3" | "W4" | "W6" | "W7" | "W10" | "W11";
  readonly reason: string;
  readonly payload: unknown;
  /** E-X3: the slot the refusal concerns, when it concerns one. */
  readonly slot?: BetSlot;
  /** W10: the participation's fault — set when this refusal faulted it, or was refused because of it. */
  readonly fault?: SettlementFault;
}

/**
 * Q9c (R2): an unresolved claim — why a participation stopped being payable.
 * It never moves money and is never resolved automatically; it is kept, frozen,
 * in `unresolvedClaims()` for the session's lifetime.
 */
export interface SettlementFault {
  readonly roundId: number;
  /** E-X3: the faulted slot. The other slot's settlement is unaffected. */
  readonly slot: BetSlot;
  /** The slot's locked stake. It stays debited: the fault applies no refund and no forfeiture. */
  readonly stake: number;
  /** Exact cents already credited to this participation before the fault (the recorded jackpot payout for a chest fault; otherwise 0). */
  readonly creditedCents: bigint;
  /**
   * W11 claims only: the exact cents of the valid credit that was withheld
   * because it could not be represented (a cashout or jackpot payout, or a
   * chest delta). Absent on W6/W7 claims, whose settlement data was invalid.
   */
  readonly unpaidCents?: bigint;
  /** The settlement event and the rule whose refusal faulted the participation. */
  readonly event: "cashedOut" | "shipImpact" | "chestPicked";
  /** W6/W7: invalid settlement data. W11: a valid win outside the M1 envelope. */
  readonly rule: "W6" | "W7" | "W11";
  readonly reason: string;
  readonly payload: unknown;
}

export interface WalletOptions {
  /** W9 diagnostic sink, called after a refusal (the refusal itself wrote nothing). Default: none. */
  onRefusal?: (refusal: WalletRefusal) => void;
}

/** A win flash the settlement layer has triggered (the §12 notification kinds). */
export type FlashKind = "cashFlash" | "jackpotFlash";

export interface WalletStore extends ReadableStore<WalletState> {
  /** The affordability check (docs/06 §3) — the one bet validation that is a wallet question. */
  canAfford(amount: number): boolean;
  /** M1: valid stake ∧ affordable — the session's submit-edge bet check (`isPlaceableStake`). */
  canPlaceStake(amount: number): boolean;
  /** W10 (R2): every faulted participation of this session, oldest first. Append-only; never cleared by a round reset. */
  unresolvedClaims(): readonly SettlementFault[];
  /** Subscribe to flash triggers. Returns the unsubscribe function. */
  onFlash(listener: (kind: FlashKind) => void): () => void;
}

/** The only engine surface the wallet needs: event subscription. */
export type WalletEventSource = Pick<EventBus<EngineEventMap>, "on">;

/** A slot with no bet this round. */
export const IDLE_SLOT: WalletSlotState = Object.freeze({
  roundBet: 0,
  participating: false,
  hasCashed: false,
  settledBy: null,
  chestSettled: false,
  win: null,
});

const INITIAL_WALLET: WalletState = {
  balance: DEFAULT_BALANCE,
  slots: [IDLE_SLOT, IDLE_SLOT],
  lastWin: null,
  history: [],
  jackpotMultiplier: 1,
};

/**
 * The affordability predicate (docs/06 §3) — the one bet validation that is
 * a wallet question, and the single definition behind both `canAfford` (the
 * session's submit edge) and the betting panel's enable state (U5,
 * `actionStateFor`), so the button and the submit path can never disagree.
 *
 * For finite amounts it is the shell's original guard, verbatim
 * (`!(amount <= 0 || amount > balance)`: accepted iff 0 < amount ≤ balance).
 * U5 (D7) adds one restriction: a non-finite amount is never affordable.
 * Before U5, NaN slipped through the original guard (every comparison with
 * NaN is false) and was only rejected by the engine ("invalid-amount");
 * ±Infinity was already rejected. Pure: no settlement arithmetic here.
 */
export const isAffordable = (amount: number, balance: number): boolean =>
  Number.isFinite(amount) && !(amount <= 0 || amount > balance);

/**
 * M1 (docs/07 §23.4, §23.5; M1-D3): the one composed bet check — a valid
 * stake (whole cents, ≥ 0.01) that is also affordable. Shared by
 * `canPlaceStake` (the session's submit edge) and the action state's enable
 * rule, so the button and the submit path can never disagree (I3).
 * `isAffordable` itself is unchanged (U5 D7 pins).
 */
export const isPlaceableStake = (amount: number, balance: number): boolean =>
  isValidStake(amount) && isAffordable(amount, balance);

const isBetSlot = (slot: unknown): slot is BetSlot => slot === 0 || slot === 1;

/** W11 refusal reasons. */
const UNREPRESENTABLE = "credit outside the exact balance envelope (2^44)";
const WITHHELD_CHEST = "chest delta withheld: the round's jackpot is an unresolved claim";

const pushHistory = (
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
): readonly HistoryEntry[] => [entry, ...history].slice(0, HISTORY_LIMIT);

/** Replace one slot's state, keeping the other's identity. */
const withSlot = (
  slots: WalletSlots,
  slot: BetSlot,
  patch: Partial<WalletSlotState>,
): WalletSlots =>
  slot === 0 ? [{ ...slots[0], ...patch }, slots[1]] : [slots[0], { ...slots[1], ...patch }];

/**
 * A slot's private settlement record (W4–W6, W10, W11): the round its
 * accepted bet belongs to, the jackpot payout in exact cents as it was
 * credited (the chest delta's base — never re-derived from a later, mutable
 * jackpot multiplier, H2), the slot's W10 fault marker (not part of the
 * snapshot — it touches no financial or displayed field, W8), and whether
 * its withheld jackpot already has its chest follow-up claim.
 */
interface SlotRecord {
  round: number | null;
  jackpotCredited: bigint | null;
  fault: SettlementFault | null;
  chestWithheld: boolean;
}

const freshRecord = (round: number | null = null): SlotRecord => ({
  round,
  jackpotCredited: null,
  fault: null,
  chestWithheld: false,
});

/**
 * Create the wallet and subscribe it to the engine's settlement events for
 * the lifetime of `events`. Called once per game session (§8).
 */
export function createWalletStore(
  events: WalletEventSource,
  options: WalletOptions = {},
): WalletStore {
  const store = createStore<WalletState>(INITIAL_WALLET);
  const flashListeners = new Set<(kind: FlashKind) => void>();

  // Written only together with the snapshot of the event that changes them.
  const records: [SlotRecord, SlotRecord] = [freshRecord(), freshRecord()];
  // W10 (R2): the session's unresolved claims, append-only. A round reset
  // clears only the slots' active markers, never this audit list.
  const claims: SettlementFault[] = [];

  /** Apply one event's mutation as a single snapshot (one notification per event). */
  const update = (patch: Partial<WalletState>) => store.set({ ...store.get(), ...patch });

  // Announced after the snapshot is written, so a failing flash listener
  // can never interrupt settlement (and subscribers already see the win).
  const flash = (kind: FlashKind) => {
    for (const listener of flashListeners) listener(kind);
  };

  // W8/W9: a refusal writes nothing; it is only reported.
  const refuse = (
    event: WalletRefusal["event"],
    rule: WalletRefusal["rule"],
    reason: string,
    payload: unknown,
    slot?: BetSlot,
    cause?: SettlementFault,
  ) => {
    options.onRefusal?.({
      event,
      rule,
      reason,
      payload,
      ...(slot === undefined ? {} : { slot }),
      ...(cause === undefined ? {} : { fault: cause }),
    });
  };

  /** W10: refuse a settlement of the slot's own round AND fault that slot only. Writes no snapshot. */
  const faultSlot = (
    slot: BetSlot,
    event: SettlementFault["event"],
    rule: SettlementFault["rule"],
    reason: string,
    payload: unknown,
    unpaidCents?: bigint,
  ) => {
    const rec = records[slot];
    const fault: SettlementFault = Object.freeze({
      roundId: rec.round as number,
      slot,
      stake: store.get().slots[slot].roundBet,
      // Only the jackpot path credits before a later settlement event of the
      // same participation (the chest); cashout and jackpot faults credit nothing.
      creditedCents: rec.jackpotCredited ?? 0n,
      ...(unpaidCents === undefined ? {} : { unpaidCents }),
      event,
      rule,
      reason,
      payload,
    });
    rec.fault = fault;
    claims.push(fault);
    refuse(event, rule, reason, payload, slot, fault);
  };

  /** W10: a faulted slot's round credits nothing more. */
  const refuseFaulted = (slot: BetSlot, event: SettlementFault["event"], payload: unknown) =>
    refuse(event, "W10", "participation faulted", payload, slot, records[slot].fault ?? undefined);

  /**
   * W11: the round's chest result after this slot's jackpot was withheld.
   * Credits nothing; records the chest delta once as a follow-up claim, so
   * the slot's full unpaid win (jackpot + delta) is kept. Invalid or
   * repeated chest data adds no claim: it is refused as W10 (the jackpot
   * claim stands).
   */
  const withholdChest = (
    slot: BetSlot,
    payload: EngineEventMap["chestPicked"],
    jackpot: bigint,
  ) => {
    const rec = records[slot];
    const total = payoutCents(store.get().slots[slot].roundBet, payload.finalMultiplier);
    if (rec.chestWithheld || total === null || total < jackpot) {
      return refuseFaulted(slot, "chestPicked", payload);
    }
    rec.chestWithheld = true;
    const claim: SettlementFault = Object.freeze({
      roundId: rec.round as number,
      slot,
      stake: store.get().slots[slot].roundBet,
      creditedCents: 0n,
      unpaidCents: total - jackpot,
      event: "chestPicked",
      rule: "W11",
      reason: WITHHELD_CHEST,
      payload,
    });
    claims.push(claim);
    refuse("chestPicked", "W11", WITHHELD_CHEST, payload, slot, claim);
  };

  // Per-round reset: formerly the shell's `phase === "idle"` effect; now
  // event-driven (§10). Clears the per-round slot state only — balance,
  // history, lastWin and the jackpot base carry over. W5: a repeated
  // bettingOpened of a participation's own round is ignored, so it cannot
  // re-open a settled participation (Q13: "a different round", so a
  // restore-rewound roundId still resets).
  events.on("bettingOpened", ({ roundId }) => {
    const w = store.get();
    if (BET_SLOTS.some((s) => w.slots[s].participating && roundId === records[s].round)) return;
    records[0] = freshRecord();
    records[1] = freshRecord();
    update({ slots: [IDLE_SLOT, IDLE_SLOT] });
  });

  events.on("betPlaced", (payload) => {
    const { roundId, slot, amount } = payload;
    const w = store.get();
    // E-X3: the slot is part of the debit's identity.
    if (!isBetSlot(slot)) return refuse("betPlaced", "W1", "invalid slot", payload);
    // W1: same predicate as the submit edge — no sub-cent, zero, negative
    // or non-finite debit (M1-D15, I6).
    if (!isValidStake(amount)) return refuse("betPlaced", "W1", "invalid stake", payload, slot);
    // W2: one debit per slot participation (H3).
    if (w.slots[slot].participating) {
      return refuse("betPlaced", "W2", "already participating", payload, slot);
    }
    // W4: both slots of a player belong to one round.
    const other: BetSlot = slot === 0 ? 1 : 0;
    if (w.slots[other].participating && records[other].round !== roundId) {
      return refuse("betPlaced", "W4", "foreign round", payload, slot);
    }
    // W3 (H4): no debit beyond the balance left after the other slot's
    // debit. Unreachable through session.submit (stakes are reserved until
    // their command applies, F2).
    if (amount > w.balance) return refuse("betPlaced", "W3", "exceeds balance", payload, slot);
    // Bet basis lock: fixed HERE, at the accepted amount the wallet is
    // debited with — the same value the engine locked into the slot's
    // participant.betAmount. Never re-read from the bet input.
    records[slot] = freshRecord(roundId);
    update({
      balance: +(w.balance - amount).toFixed(2),
      slots: withSlot(w.slots, slot, { ...IDLE_SLOT, roundBet: amount, participating: true }),
    });
  });

  // diveStarted no longer touches settlement state (W5, H1): a repeated
  // diveStarted must not re-open a settled participation. bettingOpened is
  // the only per-round reset.

  events.on("cashedOut", (payload) => {
    const { roundId, slot, multiplier: m } = payload;
    if (!isBetSlot(slot)) return refuse("cashedOut", "W4", "invalid slot", payload);
    const w = store.get();
    const s = w.slots[slot];
    const rec = records[slot];
    // Idempotent: only an unsettled slot can cash out. The engine already
    // rejects duplicate and spectator cashouts; this guard keeps the ledger
    // correct even if such an event reached the wallet.
    if (!s.participating || s.settledBy !== null) return;
    if (roundId !== rec.round) return refuse("cashedOut", "W4", "foreign round", payload, slot);
    if (rec.fault) return refuseFaulted(slot, "cashedOut", payload);
    // The slot's own payout, rounded down on its own stake.
    const cents = payoutCents(s.roundBet, m);
    if (cents === null) {
      return faultSlot(slot, "cashedOut", "W7", "invalid multiplier or payout", payload);
    }
    // W11: decided in exact cents; the conversions below are then exact.
    const balance = exactCredit(w.balance, cents);
    const win = balance === null ? null : centsToAmount(cents);
    if (balance === null || win === null) {
      return faultSlot(slot, "cashedOut", "W11", UNREPRESENTABLE, payload, cents);
    }
    const lastWin = { amount: win, mult: m };
    update({
      balance,
      lastWin,
      history: pushHistory(w.history, { mult: m, crashed: false }),
      slots: withSlot(w.slots, slot, { hasCashed: true, settledBy: "cashout", win: lastWin }),
    });
    flash("cashFlash");
  });

  events.on("crashed", ({ roundId, multiplier: m }) => {
    const w = store.get();
    const playing = BET_SLOTS.filter((s) => w.slots[s].participating);
    // A loss entry is due when the round had no participation (spectating)
    // or some slot lost its stake. R2: a faulted slot is an unresolved
    // claim, not a loss — it adds no loss entry (the claim is the record).
    const lost = playing.some((s) => {
      const f = records[s].fault;
      return !w.slots[s].hasCashed && !(f !== null && f.roundId === roundId);
    });
    if (playing.length === 0 || lost) {
      update({ history: pushHistory(w.history, { mult: m, crashed: true }) });
    }
  });

  events.on("shipImpact", (payload) => {
    const { roundId, jackpotMultiplier: jackpot } = payload;
    const w = store.get();
    // The unsettled slots this shipImpact would pay (W4: their own round
    // only). Only those slots can be faulted by it (W10), each on its own.
    const payable = BET_SLOTS.filter(
      (s) => w.slots[s].participating && !w.slots[s].hasCashed && w.slots[s].settledBy === null,
    );
    const ownRound = payable.filter((s) => roundId === records[s].round);
    if (!isSettlementMultiplier(jackpot)) {
      for (const s of ownRound) {
        if (records[s].fault) refuseFaulted(s, "shipImpact", payload);
        else faultSlot(s, "shipImpact", "W7", "invalid multiplier", payload);
      }
      if (ownRound.length === 0) refuse("shipImpact", "W7", "invalid multiplier", payload);
      return;
    }
    if (payable.length === 0) {
      // Spectating or every slot cashed out: the round's jackpot is history only.
      update({
        jackpotMultiplier: jackpot,
        history: pushHistory(w.history, { mult: jackpot, crashed: false }),
      });
      return;
    }
    let balance = w.balance;
    let slots = w.slots;
    let creditedCents = 0n;
    let credited = 0;
    for (const s of payable) {
      const rec = records[s];
      if (roundId !== rec.round) {
        refuse("shipImpact", "W4", "foreign round", payload, s);
        continue;
      }
      if (rec.fault) {
        refuseFaulted(s, "shipImpact", payload);
        continue;
      }
      // The slot's own payout, rounded down on its own stake.
      const cents = payoutCents(w.slots[s].roundBet, jackpot);
      if (cents === null) {
        faultSlot(s, "shipImpact", "W7", "invalid payout", payload);
        continue;
      }
      // W11: decided in exact cents, on the balance after the earlier slot's credit.
      const next = exactCredit(balance, cents);
      const win = next === null ? null : centsToAmount(cents);
      if (next === null || win === null) {
        faultSlot(s, "shipImpact", "W11", UNREPRESENTABLE, payload, cents);
        continue;
      }
      rec.jackpotCredited = cents;
      balance = next;
      creditedCents += cents;
      credited++;
      slots = withSlot(slots, s, {
        hasCashed: true,
        settledBy: "jackpot",
        win: { amount: win, mult: jackpot },
      });
    }
    // W8: a fully refused event writes nothing.
    if (credited === 0) return;
    update({
      jackpotMultiplier: jackpot,
      balance,
      // Exact: the combined credit is at most the resulting balance (W11).
      lastWin: { amount: centsToAmount(creditedCents) as number, mult: jackpot },
      slots,
      history: pushHistory(w.history, { mult: jackpot, crashed: false }),
    });
    flash("jackpotFlash");
  });

  events.on("chestPicked", (payload) => {
    const { roundId, finalMultiplier } = payload;
    const w = store.get();
    let balance = w.balance;
    let slots = w.slots;
    let totalCents = 0n;
    let credited = 0;
    for (const s of BET_SLOTS) {
      const slot = w.slots[s];
      const rec = records[s];
      // Per-round guard: the slot's first chest result is applied; a repeat
      // is ignored entirely (no second credit, no second history entry).
      if (slot.chestSettled) continue;
      // W11: this slot's jackpot was withheld as an unresolved claim (so it
      // is not jackpot-settled here, though the engine awarded it): keep the
      // chest result as a follow-up claim instead of dropping it.
      const f = rec.fault;
      if (
        f !== null &&
        f.rule === "W11" &&
        f.event === "shipImpact" &&
        f.unpaidCents !== undefined &&
        slot.participating &&
        roundId === rec.round
      ) {
        withholdChest(s, payload, f.unpaidCents);
        continue;
      }
      // Eligible only when this slot settled through the jackpot path. E-X1
      // safeguard: a manual cashout or an empty slot gets nothing — no
      // credit and no synthetic chest history entry.
      if (!slot.participating || slot.settledBy !== "jackpot") continue;
      if (roundId !== rec.round || rec.jackpotCredited === null) {
        refuse("chestPicked", "W4", "foreign round", payload, s);
        continue;
      }
      if (f) {
        refuseFaulted(s, "chestPicked", payload);
        continue;
      }
      // W6: the slot's total is rounded down once, on its own stake, from the
      // engine's finalMultiplier as emitted (never jackpot × chest recomputed
      // here); the credit is that total minus the jackpot payout already
      // credited to this slot.
      const total = payoutCents(slot.roundBet, finalMultiplier);
      if (total === null) {
        faultSlot(s, "chestPicked", "W7", "invalid multiplier", payload);
        continue;
      }
      if (total < rec.jackpotCredited) {
        faultSlot(s, "chestPicked", "W6", "final payout below the credited jackpot", payload);
        continue;
      }
      // W11: the delta is credited in exact cents. total = jackpot + delta ≤
      // the resulting balance, so its conversion for the win is exact too.
      const delta = total - rec.jackpotCredited;
      const next = exactCredit(balance, delta);
      const totalWin = next === null ? null : centsToAmount(total);
      if (next === null || totalWin === null) {
        faultSlot(s, "chestPicked", "W11", UNREPRESENTABLE, payload, delta);
        continue;
      }
      balance = next;
      totalCents += total;
      credited++;
      slots = withSlot(slots, s, {
        chestSettled: true,
        win: { amount: totalWin, mult: finalMultiplier },
      });
    }
    // W8: a fully refused event writes nothing.
    if (credited === 0) return;
    update({
      balance,
      lastWin: { amount: centsToAmount(totalCents) as number, mult: finalMultiplier },
      history: pushHistory(w.history, { mult: finalMultiplier, crashed: false }),
      slots,
    });
  });

  return {
    get: store.get,
    subscribe: store.subscribe,
    // The shared predicate above (U5, D7): the shell's guard for finite
    // amounts, plus non-finite → false.
    canAfford: (amount) => isAffordable(amount, store.get().balance),
    canPlaceStake: (amount) => isPlaceableStake(amount, store.get().balance),
    unresolvedClaims: () => Object.freeze([...claims]),
    onFlash: (listener) => {
      flashListeners.add(listener);
      return () => {
        flashListeners.delete(listener);
      };
    },
  };
}
