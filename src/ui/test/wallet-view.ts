// Single-slot wallet view for the pre-E-X3 suites (test-only).
//
// E-X3 (Dual Bet) moved the per-round wallet fields into `slots[0 | 1]`.
// The single-bet suites written before it keep their assertions unchanged
// by reading the wallet through this view: slot 0's fields flattened next
// to the shared ones — exactly the pre-E-X3 WalletState shape. It is strict,
// not a shortcut: it throws unless slot 1 is idle, so every single-bet test
// also proves that BET 2 was never touched. Memoized per snapshot object, so
// identity assertions keep their meaning: no wallet write ⇔ the same view.

import { IDLE_SLOT, type WalletState } from "@/ui/store/wallet-store";

export interface SingleSlotWalletView {
  readonly balance: number;
  readonly roundBet: number;
  readonly participating: boolean;
  readonly hasCashed: boolean;
  readonly settledBy: "cashout" | "jackpot" | null;
  readonly chestSettled: boolean;
  readonly lastWin: WalletState["lastWin"];
  readonly history: WalletState["history"];
  readonly jackpotMultiplier: number;
}

const views = new WeakMap<WalletState, SingleSlotWalletView>();

export function slot0View(w: WalletState): SingleSlotWalletView {
  const cached = views.get(w);
  if (cached) return cached;
  const idle = w.slots[1];
  if (
    idle.roundBet !== IDLE_SLOT.roundBet ||
    idle.participating ||
    idle.hasCashed ||
    idle.settledBy !== null ||
    idle.chestSettled ||
    idle.win !== null
  ) {
    throw new Error(`slot0View: slot 1 is not idle: ${JSON.stringify(idle)}`);
  }
  const s = w.slots[0];
  const view: SingleSlotWalletView = {
    balance: w.balance,
    roundBet: s.roundBet,
    participating: s.participating,
    hasCashed: s.hasCashed,
    settledBy: s.settledBy,
    chestSettled: s.chestSettled,
    lastWin: w.lastWin,
    history: w.history,
    jackpotMultiplier: w.jackpotMultiplier,
  };
  views.set(w, view);
  return view;
}
