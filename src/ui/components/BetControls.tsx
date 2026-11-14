// Bet controls — −/+ steppers and the amount field with tier label
// (docs/07_UI_ARCHITECTURE.md §13.3). Sprint 4, Commit U6: markup verbatim
// from the component shell.
//
// The bet amount is the session's bet-input store (U5, V4): every write is
// sanitized there, and halve/double/quick-set arithmetic lives there —
// these handlers only forward. `double` takes the balance at click time
// (read from the store, not subscribed: the button's rendering does not
// depend on it). Controls are disabled during the dive only (D10).

import { chainTier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";

const { wallet, round, betInput } = gameSession;

export function BetControls() {
  const phase = useStore(round, (r) => r.phase);
  const bet = useStore(betInput, (b) => b);
  const inDive = phase === "diving";

  return (
    <div className="mb-3 flex items-center gap-2 tab:gap-3">
      <button
        onClick={() => betInput.halve()}
        className="h-10 w-10 rounded-md border border-border bg-secondary text-lg font-bold text-foreground active:scale-95 disabled:opacity-50 tab:h-12 tab:w-12 tab:text-xl"
        disabled={inDive}
      >
        {STRINGS.panel.decrease}
      </button>
      <div className="flex flex-1 flex-col items-center rounded-md border border-border bg-secondary py-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {STRINGS.panel.betLabelPrefix}
          {chainTier(bet)}
        </div>
        <input
          type="number"
          value={bet}
          onChange={(e) => betInput.input(e.target.value)}
          disabled={inDive}
          className="w-full bg-transparent text-center text-lg font-bold tabular-nums text-gold outline-none tab:text-xl"
        />
      </div>
      <button
        onClick={() => betInput.double(wallet.get().balance)}
        className="h-10 w-10 rounded-md border border-border bg-secondary text-lg font-bold text-foreground active:scale-95 disabled:opacity-50 tab:h-12 tab:w-12 tab:text-xl"
        disabled={inDive}
      >
        {STRINGS.panel.increase}
      </button>
    </div>
  );
}
