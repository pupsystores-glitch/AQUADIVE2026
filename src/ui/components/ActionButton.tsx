// Action button — the five-state action (docs/07_UI_ARCHITECTURE.md §13.3).
// Sprint 4, Commit U6; E-X3: one per bet slot.
//
// The decision is the pure `actionStateFor` derivation (U5): phase and
// countdown from the round store, the slot's participation and the balance
// from the wallet, the slot's typed bet from its bet-input store. The engine
// validates every command against round state at the tick it applies (D4);
// the wallet question is answered on the session's submit path. No
// pending-submit guard (D8): a repeated click submits again and the engine
// rejects it. The CASH OUT amount is the wallet's rounded-down payout of the
// slot's LOCKED bet at the live multiplier (M1-D8/D13) — display and payout
// agree. SECURED shows the slot's own credited win.

import { useCallback, useMemo } from "react";
import type { BetSlot } from "@/engine";
import { formatMoney } from "@/game/presentation";
import { actionStateFor } from "@/ui/components/action-state";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { payoutAmount } from "@/ui/store/payout";
import { STRINGS } from "@/ui/strings";

const { wallet, round, betInputs } = gameSession;

/** Phones: compact (half-width panel, wrapping labels); `tab` and up: the original size. */
const BASE = "w-full min-h-[3rem] rounded-xl px-1 py-2 leading-tight tab:min-h-0 tab:px-0 tab:py-4";

export function ActionButton({ slot }: { slot: BetSlot }) {
  const betInput = betInputs[slot];
  const phase = useStore(round, (r) => r.phase);
  const countdown = useStore(round, (r) => r.countdownSeconds);
  const multiplier = useStore(round, (r) => r.multiplier);
  const balance = useStore(wallet, (w) => w.balance);
  const participating = useStore(wallet, (w) => w.slots[slot].participating);
  const hasCashed = useStore(wallet, (w) => w.slots[slot].hasCashed);
  const roundBet = useStore(wallet, (w) => w.slots[slot].roundBet);
  const win = useStore(wallet, (w) => w.slots[slot].win);
  const bet = useStore(betInput, (b) => b);

  const placeBet = useCallback(() => {
    gameSession.submit({ type: "placeBet", slot, amount: betInput.get() });
  }, [slot, betInput]);

  const cashOut = useCallback(() => {
    gameSession.submit({ type: "cashOut", slot });
  }, [slot]);

  const action = actionStateFor(
    { phase, countdownSeconds: countdown },
    { balance, participating, hasCashed },
    bet,
  );

  const potentialWin = useMemo(
    () => payoutAmount(roundBet, multiplier) ?? 0,
    [roundBet, multiplier],
  );

  return action.kind === "cashOut" ? (
    <button
      onClick={cashOut}
      className={`${BASE} border border-success/40 bg-gradient-to-b from-success to-success/70 text-sm font-black tab:text-xl tracking-wider text-background shadow-[0_0_30px_-8px] shadow-success active:scale-[0.98]`}
    >
      {STRINGS.actions.cashOut(formatMoney(potentialWin))}
    </button>
  ) : action.kind === "secured" ? (
    <button
      disabled
      className={`${BASE} cursor-not-allowed border border-success/30 bg-success/10 text-[11px] font-bold tab:text-base tracking-wide tab:tracking-widest text-success`}
    >
      {STRINGS.actions.secured(win ? formatMoney(win.amount) : "")}
    </button>
  ) : action.kind === "spectating" ? (
    <button
      disabled
      className={`${BASE} cursor-not-allowed border border-border bg-secondary text-[11px] font-bold tab:text-base tracking-wide tab:tracking-widest text-muted-foreground`}
    >
      {STRINGS.actions.spectating}
    </button>
  ) : action.kind === "betLocked" ? (
    <button
      disabled
      className={`${BASE} cursor-not-allowed border border-gold/30 bg-gold/10 text-[11px] font-bold tab:text-base tracking-wide tab:tracking-widest text-gold`}
    >
      {STRINGS.actions.betLocked(countdown.toFixed(1))}
    </button>
  ) : (
    <button
      onClick={placeBet}
      disabled={action.kind !== "placeBet" || !action.enabled}
      className={`${BASE} border border-gold/40 bg-gradient-to-b from-gold to-gold-deep text-sm font-black tab:text-xl tracking-wider text-background shadow-[0_0_30px_-8px] shadow-gold disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]`}
    >
      {action.kind === "placeBet"
        ? STRINGS.actions.placeBet(countdown.toFixed(1))
        : STRINGS.actions.waiting}
    </button>
  );
}
