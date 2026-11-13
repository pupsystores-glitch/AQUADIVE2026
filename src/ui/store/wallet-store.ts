// Wallet store — the settlement layer (docs/07_UI_ARCHITECTURE.md §10;
// docs/06_ENGINE_ARCHITECTURE.md §3). Sprint 4, Commit U2 (delta V1).
//
// The single home of money math: every balance, win and delta in the UI is
// computed here and nowhere else (§6). The listener bodies moved verbatim
// from the component shell, including the float arithmetic with its
// `toFixed(2)` rounding — results are bit-identical by construction and
// pinned by wallet-store.test.ts. Rules:
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
import { createStore, type ReadableStore } from "./store";

export interface WalletState {
  /** Player balance — floating point, rounded with toFixed(2) at every mutation (verbatim; minor-units migration is a separate task, §20). */
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
  /** Jackpot base from the last shipImpact — the chest delta credit's reference. */
  readonly jackpotMultiplier: number;
}

/** A win flash the settlement layer has triggered (the §12 notification kinds). */
export type FlashKind = "cashFlash" | "jackpotFlash";

export interface WalletStore extends ReadableStore<WalletState> {
  /** The affordability check (docs/06 §3) — the one bet validation that is a wallet question. */
  canAfford(amount: number): boolean;
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

const pushHistory = (
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
): readonly HistoryEntry[] => [entry, ...history].slice(0, HISTORY_LIMIT);

/**
 * Create the wallet and subscribe it to the engine's settlement events for
 * the lifetime of `events`. Called once per game session (§8).
 */
export function createWalletStore(events: WalletEventSource): WalletStore {
  const store = createStore<WalletState>(INITIAL_WALLET);
  const flashListeners = new Set<(kind: FlashKind) => void>();

  /** Apply one event's mutation as a single snapshot (one notification per event). */
  const update = (patch: Partial<WalletState>) => store.set({ ...store.get(), ...patch });

  // Announced after the snapshot is written, so a failing flash listener
  // can never interrupt settlement (and subscribers already see the win).
  const flash = (kind: FlashKind) => {
    for (const listener of flashListeners) listener(kind);
  };

  // Per-round reset: formerly the shell's `phase === "idle"` effect; now
  // event-driven (§10). Clears the per-round flags only — balance, history,
  // lastWin and the jackpot base carry over, exactly as before.
  events.on("bettingOpened", () => {
    update({
      participating: false,
      roundBet: 0,
      hasCashed: false,
      settledBy: null,
      chestSettled: false,
    });
  });

  events.on("betPlaced", ({ amount }) => {
    // Bet basis lock: fixed HERE, at the accepted amount the wallet is
    // debited with — the same value the engine locked into
    // participant.betAmount. Never re-read from the bet input.
    const w = store.get();
    update({
      roundBet: amount,
      balance: +(w.balance - amount).toFixed(2),
      participating: true,
    });
  });

  events.on("diveStarted", () => {
    update({ hasCashed: false, settledBy: null, chestSettled: false });
  });

  events.on("cashedOut", ({ multiplier: m }) => {
    const w = store.get();
    // Idempotent: only an unsettled participation can cash out. The engine
    // already rejects duplicate and spectator cashouts; this guard keeps the
    // ledger correct even if such an event reached the wallet.
    if (!w.participating || w.settledBy !== null) return;
    const win = +(w.roundBet * m).toFixed(2);
    update({
      balance: +(w.balance + win).toFixed(2),
      lastWin: { amount: win, mult: m },
      history: pushHistory(w.history, { mult: m, crashed: false }),
      hasCashed: true,
      settledBy: "cashout",
    });
    flash("cashFlash");
  });

  events.on("crashed", ({ multiplier: m }) => {
    const w = store.get();
    if (!w.hasCashed) {
      update({ history: pushHistory(w.history, { mult: m, crashed: true }) });
    }
  });

  events.on("shipImpact", ({ jackpotMultiplier: jackpot }) => {
    const w = store.get();
    if (w.participating && !w.hasCashed && w.settledBy === null) {
      const win = +(w.roundBet * jackpot).toFixed(2);
      update({
        jackpotMultiplier: jackpot,
        balance: +(w.balance + win).toFixed(2),
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

  events.on("chestPicked", ({ finalMultiplier }) => {
    const w = store.get();
    // Per-round guard: the round's first chest result is applied; a repeat
    // is ignored entirely (no second credit, no second history entry).
    if (w.chestSettled) return;
    // Eligible only when this wallet settled the participation through the
    // jackpot path. E-X1 safeguard: a manual cashout or a spectator gets
    // nothing — no credit and no synthetic chest history entry (the engine
    // no longer emits chestPicked for them; this guard keeps the ledger
    // correct even if such an event reached the wallet).
    if (!w.participating || w.settledBy !== "jackpot") return;
    // The previous jackpot win was already credited; add the delta from multiplying it.
    const jackpot = w.jackpotMultiplier;
    const prevWin = +(w.roundBet * jackpot).toFixed(2);
    const totalWin = +(w.roundBet * finalMultiplier).toFixed(2);
    const delta = +(totalWin - prevWin).toFixed(2);
    update({
      balance: +(w.balance + delta).toFixed(2),
      lastWin: { amount: totalWin, mult: finalMultiplier },
      history: pushHistory(w.history, { mult: finalMultiplier, crashed: false }),
      chestSettled: true,
    });
  });

  return {
    get: store.get,
    subscribe: store.subscribe,
    // Verbatim predicate from the shell's placeBet guard (`b <= 0 || b > balance`
    // → reject). A NaN amount passes it exactly as before and is rejected by
    // the engine ("invalid-amount"); input sanitation is delta V4 (U5).
    canAfford: (amount) => !(amount <= 0 || amount > store.get().balance),
    onFlash: (listener) => {
      flashListeners.add(listener);
      return () => {
        flashListeners.delete(listener);
      };
    },
  };
}
