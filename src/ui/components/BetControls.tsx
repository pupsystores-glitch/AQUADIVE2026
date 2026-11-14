// Bet controls — −/+ steppers and the amount field with tier label
// (docs/07_UI_ARCHITECTURE.md §13.3). Sprint 4, Commit U6; E-X3: one per
// bet slot, compact on phones (half-width panels).
//
// The bet amount is the slot's own bet-input store (U5, V4; E-X3
// `betInputs[slot]`): every write is sanitized there, and halve/double/
// quick-set arithmetic lives there — these handlers only forward. `double`
// takes the balance at click time (read from the store, not subscribed: the
// button's rendering does not depend on it). Controls are disabled during
// the dive only (D10).
//
// Accessibility (Sprint 4 QA fix): the amount field is named "BET n stake"
// (it had no accessible name), and since it hides the native outline its
// box shows a gold focus ring instead. The steppers keep their "−" / "+"
// names (the characterization pins look them up by those names); the slot
// panel's group name gives them their context.

import type { BetSlot } from "@/engine";
import { chainTier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";

const { wallet, round, betInputs } = gameSession;

export function BetControls({ slot }: { slot: BetSlot }) {
  const betInput = betInputs[slot];
  const phase = useStore(round, (r) => r.phase);
  const bet = useStore(betInput, (b) => b);
  const inDive = phase === "diving";

  return (
    <div className="mb-2 flex items-center gap-1.5 tab:mb-3 tab:gap-3">
      <button
        onClick={() => betInput.halve()}
        className="h-9 w-9 shrink-0 rounded-md border border-border bg-secondary text-lg font-bold text-foreground active:scale-95 disabled:opacity-50 tab:h-12 tab:w-12 tab:text-xl"
        disabled={inDive}
      >
        {STRINGS.panel.decrease}
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-center rounded-md border border-border bg-secondary py-0.5 focus-within:border-gold/70 focus-within:ring-2 focus-within:ring-gold/40 tab:py-1">
        <div className="max-w-full truncate text-[9px] uppercase tracking-widest text-muted-foreground tab:text-[10px]">
          {STRINGS.panel.betLabelPrefix}
          {chainTier(bet)}
        </div>
        <input
          type="number"
          aria-label={STRINGS.panel.stakeLabel(slot + 1)}
          value={bet}
          onChange={(e) => betInput.input(e.target.value)}
          disabled={inDive}
          className="w-full min-w-0 bg-transparent text-center text-base font-bold tabular-nums text-gold outline-none tab:text-xl"
        />
      </div>
      <button
        onClick={() => betInput.double(wallet.get().balance)}
        className="h-9 w-9 shrink-0 rounded-md border border-border bg-secondary text-lg font-bold text-foreground active:scale-95 disabled:opacity-50 tab:h-12 tab:w-12 tab:text-xl"
        disabled={inDive}
      >
        {STRINGS.panel.increase}
      </button>
    </div>
  );
}
