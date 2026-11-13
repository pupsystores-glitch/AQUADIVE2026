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

import type { EngineEventMap, EventBus } from "@/engine";
import { HISTORY_LIMIT } from "@/game/config";
import { DEFAULT_BALANCE } from "@/game/constants";
import type { HistoryEntry, LastWin } from "@/game/types";
import { centsToAmount, exactCredit, isSettlementMultiplier, payoutCents } from "./payout";
import { isValidStake } from "./stake";
import { createStore, type ReadableStore } from "./store";

export interface WalletState {
  /** Player balance — a canonical cent `number` below 2^44 units: debits rounded with toFixed(2), credits exact via W11 (minor-units migration is M2, §20). */
  readonly balance: number;
  /** This round's locked bet: the accepted betPlaced amount; 0 when not participating. */
  readonly roundBet: number;
  /** A bet was accepted for the current round. */
  readonly participating: boolean;
  /** The round's win is settled (manual cashout or jackpot auto-cash). */
  readonly hasCashed: boolean;
  /** Which payout settled this round's participation; null until one is applied (always null for spectators). */
  readonly settledBy: "cashout" | "jackpot" | null;
  /** This round's eligible (jackpot-settled) chest result has been applied — the per-round idempotency guard. Stays false for ineligible rounds. */
  readonly chestSettled: boolean;
  /** Most recent win (manual cashout, jackpot, or chest total). */
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
  /** The participation's locked stake. It stays debited: the fault applies no refund and no forfeiture. */
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

const INITIAL_WALLET: WalletState = {
  balance: DEFAULT_BALANCE,
  roundBet: 0,
  participating: false,
  hasCashed: false,
  settledBy: null,
  chestSettled: false,
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

/** W11 refusal reasons. */
const UNREPRESENTABLE = "credit outside the exact balance envelope (2^44)";
const WITHHELD_CHEST = "chest delta withheld: the round's jackpot is an unresolved claim";

const pushHistory = (
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
): readonly HistoryEntry[] => [entry, ...history].slice(0, HISTORY_LIMIT);

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

  // The participation's settlement record (W4–W6), private to the wallet:
  // the round the accepted bet belongs to, and the jackpot payout in exact
  // cents as it was credited (the chest delta's base — never re-derived
  // from a later, mutable jackpot multiplier, H2). Written only together
  // with the snapshot of the event that changes it.
  let participationRound: number | null = null;
  let jackpotCredited: bigint | null = null;
  // W10 (Q9c): the active participation's fault marker. Not part of the
  // snapshot — it touches no financial or displayed field (W8).
  let fault: SettlementFault | null = null;
  // W11: the active participation's withheld jackpot already has its chest
  // follow-up claim. Cleared with the marker.
  let chestWithheld = false;
  // W10 (R2): the session's unresolved claims, append-only. A round reset
  // clears only the active marker above, never this audit list.
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
    cause?: SettlementFault,
  ) => {
    options.onRefusal?.(
      cause ? { event, rule, reason, payload, fault: cause } : { event, rule, reason, payload },
    );
  };

  /** W10: refuse a settlement of the participation's own round AND fault it. Writes no snapshot. */
  const faultRound = (
    event: SettlementFault["event"],
    rule: SettlementFault["rule"],
    reason: string,
    payload: unknown,
    unpaidCents?: bigint,
  ) => {
    fault = Object.freeze({
      roundId: participationRound as number,
      stake: store.get().roundBet,
      // Only the jackpot path credits before a later settlement event of the
      // same participation (the chest); cashout and jackpot faults credit nothing.
      creditedCents: jackpotCredited ?? 0n,
      ...(unpaidCents === undefined ? {} : { unpaidCents }),
      event,
      rule,
      reason,
      payload,
    });
    claims.push(fault);
    refuse(event, rule, reason, payload, fault);
  };

  /** W10: a faulted participation's round credits nothing more. */
  const refuseFaulted = (event: SettlementFault["event"], payload: unknown) =>
    refuse(event, "W10", "participation faulted", payload, fault ?? undefined);

  /**
   * W11: the round's chest result after its jackpot was withheld. Credits
   * nothing; records the chest delta once as a follow-up claim, so the
   * participation's full unpaid win (jackpot + delta) is kept. Invalid or
   * repeated chest data adds no claim: it is refused as W10 (the jackpot
   * claim stands).
   */
  const withholdChest = (payload: EngineEventMap["chestPicked"], jackpot: bigint) => {
    const total = payoutCents(store.get().roundBet, payload.finalMultiplier);
    if (chestWithheld || total === null || total < jackpot) {
      return refuseFaulted("chestPicked", payload);
    }
    chestWithheld = true;
    const claim: SettlementFault = Object.freeze({
      roundId: participationRound as number,
      stake: store.get().roundBet,
      creditedCents: 0n,
      unpaidCents: total - jackpot,
      event: "chestPicked",
      rule: "W11",
      reason: WITHHELD_CHEST,
      payload,
    });
    claims.push(claim);
    refuse("chestPicked", "W11", WITHHELD_CHEST, payload, claim);
  };

  // Per-round reset: formerly the shell's `phase === "idle"` effect; now
  // event-driven (§10). Clears the per-round flags only — balance, history,
  // lastWin and the jackpot base carry over, exactly as before. W5: a
  // repeated bettingOpened of the participation's own round is ignored, so
  // it cannot re-open a settled participation (Q13: "a different round", so
  // a restore-rewound roundId still resets).
  events.on("bettingOpened", ({ roundId }) => {
    const w = store.get();
    if (w.participating && roundId === participationRound) return;
    participationRound = null;
    jackpotCredited = null;
    fault = null;
    chestWithheld = false;
    update({
      participating: false,
      roundBet: 0,
      hasCashed: false,
      settledBy: null,
      chestSettled: false,
    });
  });

  events.on("betPlaced", (payload) => {
    const { roundId, amount } = payload;
    const w = store.get();
    // W1: same predicate as the submit edge — no sub-cent, zero, negative
    // or non-finite debit (M1-D15, I6).
    if (!isValidStake(amount)) return refuse("betPlaced", "W1", "invalid stake", payload);
    // W2: one debit per participation (H3).
    if (w.participating) return refuse("betPlaced", "W2", "already participating", payload);
    // W3 (H4): no debit beyond the balance. Unreachable through session.submit
    // (affordability holds until the command applies, F2).
    if (amount > w.balance) return refuse("betPlaced", "W3", "exceeds balance", payload);
    // Bet basis lock: fixed HERE, at the accepted amount the wallet is
    // debited with — the same value the engine locked into
    // participant.betAmount. Never re-read from the bet input.
    participationRound = roundId;
    jackpotCredited = null;
    fault = null;
    chestWithheld = false;
    update({
      roundBet: amount,
      balance: +(w.balance - amount).toFixed(2),
      participating: true,
    });
  });

  // diveStarted no longer touches settlement state (W5, H1): a repeated
  // diveStarted must not re-open a settled participation. bettingOpened is
  // the only per-round reset.

  events.on("cashedOut", (payload) => {
    const { roundId, multiplier: m } = payload;
    const w = store.get();
    // Idempotent: only an unsettled participation can cash out. The engine
    // already rejects duplicate and spectator cashouts; this guard keeps the
    // ledger correct even if such an event reached the wallet.
    if (!w.participating || w.settledBy !== null) return;
    if (roundId !== participationRound) return refuse("cashedOut", "W4", "foreign round", payload);
    if (fault) return refuseFaulted("cashedOut", payload);
    const cents = payoutCents(w.roundBet, m);
    if (cents === null) {
      return faultRound("cashedOut", "W7", "invalid multiplier or payout", payload);
    }
    // W11: decided in exact cents; the conversions below are then exact.
    const balance = exactCredit(w.balance, cents);
    const win = balance === null ? null : centsToAmount(cents);
    if (balance === null || win === null) {
      return faultRound("cashedOut", "W11", UNREPRESENTABLE, payload, cents);
    }
    update({
      balance,
      lastWin: { amount: win, mult: m },
      history: pushHistory(w.history, { mult: m, crashed: false }),
      hasCashed: true,
      settledBy: "cashout",
    });
    flash("cashFlash");
  });

  events.on("crashed", ({ roundId, multiplier: m }) => {
    const w = store.get();
    // R2: a faulted participation is an unresolved claim, not a loss — its
    // round's crash adds no loss entry (the claim is the record).
    if (fault && roundId === fault.roundId) return;
    if (!w.hasCashed) {
      update({ history: pushHistory(w.history, { mult: m, crashed: true }) });
    }
  });

  events.on("shipImpact", (payload) => {
    const { roundId, jackpotMultiplier: jackpot } = payload;
    const w = store.get();
    // The unsettled participation this shipImpact would pay (W4: its own
    // round only). Only that participation can be faulted by it (W10).
    const payable = w.participating && !w.hasCashed && w.settledBy === null;
    const ownRound = payable && roundId === participationRound;
    if (ownRound && fault) return refuseFaulted("shipImpact", payload);
    if (!isSettlementMultiplier(jackpot)) {
      return ownRound
        ? faultRound("shipImpact", "W7", "invalid multiplier", payload)
        : refuse("shipImpact", "W7", "invalid multiplier", payload);
    }
    if (payable) {
      if (roundId !== participationRound) {
        return refuse("shipImpact", "W4", "foreign round", payload);
      }
      const cents = payoutCents(w.roundBet, jackpot);
      if (cents === null) return faultRound("shipImpact", "W7", "invalid payout", payload);
      // W11: decided in exact cents; the conversions below are then exact.
      const balance = exactCredit(w.balance, cents);
      const win = balance === null ? null : centsToAmount(cents);
      if (balance === null || win === null) {
        return faultRound("shipImpact", "W11", UNREPRESENTABLE, payload, cents);
      }
      jackpotCredited = cents;
      update({
        jackpotMultiplier: jackpot,
        balance,
        lastWin: { amount: win, mult: jackpot },
        hasCashed: true,
        settledBy: "jackpot",
        history: pushHistory(w.history, { mult: jackpot, crashed: false }),
      });
      flash("jackpotFlash");
    } else {
      update({
        jackpotMultiplier: jackpot,
        history: pushHistory(w.history, { mult: jackpot, crashed: false }),
      });
    }
  });

  events.on("chestPicked", (payload) => {
    const { roundId, finalMultiplier } = payload;
    const w = store.get();
    // Per-round guard: the round's first chest result is applied; a repeat
    // is ignored entirely (no second credit, no second history entry).
    if (w.chestSettled) return;
    // W11: this participation's jackpot was withheld as an unresolved claim
    // (so it is not jackpot-settled here, though the engine awarded it):
    // keep the chest result as a follow-up claim instead of dropping it.
    if (
      fault !== null &&
      fault.rule === "W11" &&
      fault.event === "shipImpact" &&
      fault.unpaidCents !== undefined &&
      w.participating &&
      roundId === participationRound
    ) {
      return withholdChest(payload, fault.unpaidCents);
    }
    // Eligible only when this wallet settled the participation through the
    // jackpot path. E-X1 safeguard: a manual cashout or a spectator gets
    // nothing — no credit and no synthetic chest history entry (the engine
    // no longer emits chestPicked for them; this guard keeps the ledger
    // correct even if such an event reached the wallet).
    if (!w.participating || w.settledBy !== "jackpot") return;
    if (roundId !== participationRound || jackpotCredited === null) {
      return refuse("chestPicked", "W4", "foreign round", payload);
    }
    if (fault) return refuseFaulted("chestPicked", payload);
    // W6: the participation's total is rounded down once, from the engine's
    // finalMultiplier as emitted (never jackpot × chest recomputed here); the
    // credit is that total minus the jackpot payout already credited.
    const total = payoutCents(w.roundBet, finalMultiplier);
    if (total === null) return faultRound("chestPicked", "W7", "invalid multiplier", payload);
    if (total < jackpotCredited) {
      return faultRound("chestPicked", "W6", "final payout below the credited jackpot", payload);
    }
    // W11: the delta is credited in exact cents. total = jackpot + delta ≤
    // the resulting balance, so its conversion for lastWin is exact too.
    const delta = total - jackpotCredited;
    const balance = exactCredit(w.balance, delta);
    const totalWin = balance === null ? null : centsToAmount(total);
    if (balance === null || totalWin === null) {
      return faultRound("chestPicked", "W11", UNREPRESENTABLE, payload, delta);
    }
    update({
      balance,
      lastWin: { amount: totalWin, mult: finalMultiplier },
      history: pushHistory(w.history, { mult: finalMultiplier, crashed: false }),
      chestSettled: true,
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
