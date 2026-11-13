// The betting panel's action matrix as a pure derivation
// (docs/07_UI_ARCHITECTURE.md §13.3, §21 tier 2). Sprint 4, Commit U5.
//
// Replaces the shell's five-branch JSX conditional and its inline `canBet`
// expression. The component maps the returned state to markup; the decision
// logic lives here, outside JSX, and is tested exhaustively against a
// verbatim transcription of the pre-U5 conditional (action-state.test.ts).
//
// Pure and store-independent (D6): it reads plain values the caller selects
// from the round store, the wallet store and the bet input, and subscribes to
// nothing — stores never subscribe to stores (§9). No money is computed here:
// the labels' amounts (potential win, secured win, countdown) stay display
// reads in the component.
//
// The cutoff is a UI-only restriction (D9): BET_CUTOFF_SECONDS disables the
// button; the session and the engine do not enforce it. The affordability
// term is the wallet's own predicate (D7), the same one the session's submit
// edge applies, so the button and the submit path never disagree.

import { BET_CUTOFF_SECONDS } from "@/game/config";
import type { RoundState } from "@/ui/store/round-store";
import { isAffordable, type WalletState } from "@/ui/store/wallet-store";

/** The round-store fields the matrix reads. */
export type ActionRoundInput = Pick<RoundState, "phase" | "countdownSeconds">;

/** The wallet-store fields the matrix reads. */
export type ActionWalletInput = Pick<WalletState, "balance" | "participating" | "hasCashed">;

/**
 * The six action states (§13.3). Only `placeBet` can be enabled or disabled;
 * `cashOut` is always enabled; the other four always render disabled.
 */
export type ActionState =
  /** Betting window, not participating: PLACE BET · countdown. */
  | { readonly kind: "placeBet"; readonly enabled: boolean }
  /** Betting window, bet accepted: BET LOCKED · DIVE IN countdown (disabled). */
  | { readonly kind: "betLocked" }
  /** Diving, participating, not settled: CASH OUT · potential (enabled). */
  | { readonly kind: "cashOut" }
  /** Diving, participating, settled: SECURED +win · WATCHING DIVE… (disabled). */
  | { readonly kind: "secured" }
  /** Diving without a bet: SPECTATING · NEXT ROUND SOON (disabled). */
  | { readonly kind: "spectating" }
  /** Crashed, impact (`cashed`) or bonus: WAITING… (disabled) — D10. */
  | { readonly kind: "waiting" };

export type ActionKind = ActionState["kind"];

/**
 * Whether PLACE BET is offered: betting window, not yet participating, the
 * bet affordable (the wallet's predicate), and the countdown strictly above
 * the UI cutoff. Identical to the shell's `canBet` for every finite bet; the
 * bet-input store keeps the bet finite.
 */
export function canPlaceBet(
  round: ActionRoundInput,
  wallet: ActionWalletInput,
  bet: number,
): boolean {
  return (
    round.phase === "idle" &&
    !wallet.participating &&
    isAffordable(bet, wallet.balance) &&
    round.countdownSeconds > BET_CUTOFF_SECONDS
  );
}

/** The action button's state — the pre-U5 JSX conditional, branch for branch. */
export function actionStateFor(
  round: ActionRoundInput,
  wallet: ActionWalletInput,
  bet: number,
): ActionState {
  const inDive = round.phase === "diving";
  const isIdle = round.phase === "idle";
  if (inDive && wallet.participating && !wallet.hasCashed) return { kind: "cashOut" };
  if (inDive && wallet.participating && wallet.hasCashed) return { kind: "secured" };
  if (inDive && !wallet.participating) return { kind: "spectating" };
  if (isIdle && wallet.participating) return { kind: "betLocked" };
  // The shell's fallthrough button: `disabled={!canBet || showBonus ||
  // showCrash}`, labelled PLACE BET while idle and WAITING… otherwise.
  // Outside the betting window canBet is false, so WAITING… is always
  // disabled; inside it, bonus and crash are false, so enabled === canBet.
  if (isIdle) return { kind: "placeBet", enabled: canPlaceBet(round, wallet, bet) };
  return { kind: "waiting" };
}
