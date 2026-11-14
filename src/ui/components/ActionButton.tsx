// Action button — the five-state action (docs/07_UI_ARCHITECTURE.md §13.3).
// Sprint 4, Commit U6: markup verbatim from the component shell.
//
// The decision is the pure `actionStateFor` derivation (U5): phase and
// countdown from the round store, participation and balance from the
// wallet, the typed bet from the bet-input store. The engine validates
// every command against round state at the tick it applies (D4); the
// wallet question is answered on the session's submit path. No
// pending-submit guard (D8): a repeated click submits again and the engine
// rejects it. The CASH OUT amount is the wallet's rounded-down payout of
// the LOCKED bet at the live multiplier (M1-D8/D13) — display and payout
// agree.

import { useCallback, useMemo } from "react";
import { formatMoney } from "@/game/presentation";
import { actionStateFor } from "@/ui/components/action-state";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { payoutAmount } from "@/ui/store/payout";
import { STRINGS } from "@/ui/strings";

const { wallet, round, betInput } = gameSession;

export function ActionButton() {
  const phase = useStore(round, (r) => r.phase);
  const countdown = useStore(round, (r) => r.countdownSeconds);
  const multiplier = useStore(round, (r) => r.multiplier);
  const balance = useStore(wallet, (w) => w.balance);
  const participating = useStore(wallet, (w) => w.participating);
  const hasCashed = useStore(wallet, (w) => w.hasCashed);
  const roundBet = useStore(wallet, (w) => w.roundBet);
  const lastWin = useStore(wallet, (w) => w.lastWin);
  const bet = useStore(betInput, (b) => b);

  const placeBet = useCallback(() => {
    gameSession.submit({ type: "placeBet", amount: betInput.get() });
  }, []);

  const cashOut = useCallback(() => {
    gameSession.submit({ type: "cashOut" });
  }, []);

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
      className="w-full rounded-xl border border-success/40 bg-gradient-to-b from-success to-success/70 py-4 text-lg font-black tab:text-xl tracking-wider text-background shadow-[0_0_30px_-8px] shadow-success active:scale-[0.98]"
    >
      {STRINGS.actions.cashOut(formatMoney(potentialWin))}
    </button>
  ) : action.kind === "secured" ? (
    <button
      disabled
      className="w-full cursor-not-allowed rounded-xl border border-success/30 bg-success/10 py-4 text-sm font-bold tab:text-base tracking-widest text-success"
    >
      {STRINGS.actions.secured(lastWin ? formatMoney(lastWin.amount) : "")}
    </button>
  ) : action.kind === "spectating" ? (
    <button
      disabled
      className="w-full cursor-not-allowed rounded-xl border border-border bg-secondary py-4 text-sm font-bold tab:text-base tracking-widest text-muted-foreground"
    >
      {STRINGS.actions.spectating}
    </button>
  ) : action.kind === "betLocked" ? (
    <button
      disabled
      className="w-full cursor-not-allowed rounded-xl border border-gold/30 bg-gold/10 py-4 text-sm font-bold tab:text-base tracking-widest text-gold"
    >
      {STRINGS.actions.betLocked(countdown.toFixed(1))}
    </button>
  ) : (
    <button
      onClick={placeBet}
      disabled={action.kind !== "placeBet" || !action.enabled}
      className="w-full rounded-xl border border-gold/40 bg-gradient-to-b from-gold to-gold-deep py-4 text-lg font-black tab:text-xl tracking-wider text-background shadow-[0_0_30px_-8px] shadow-gold disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
    >
      {action.kind === "placeBet"
        ? STRINGS.actions.placeBet(countdown.toFixed(1))
        : STRINGS.actions.waiting}
    </button>
  );
}
