// Quick bets — the QUICK_BETS row (docs/07_UI_ARCHITECTURE.md §13.3).
// Sprint 4, Commit U6; E-X3: one row per bet slot. Writes go through the
// slot's bet-input store's sanitized `set` (U5, V4); disabled during the
// dive only. Hidden on phones, where the half-width slot panels keep only
// the essential controls (stake field, steppers, action); shown from `tab`.

import type { BetSlot } from "@/engine";
import { QUICK_BETS } from "@/game/config";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";

const { round, betInputs } = gameSession;

export function QuickBets({ slot }: { slot: BetSlot }) {
  const betInput = betInputs[slot];
  const phase = useStore(round, (r) => r.phase);
  const bet = useStore(betInput, (b) => b);
  const inDive = phase === "diving";

  return (
    <div className="mb-3 hidden grid-cols-5 gap-1.5 tab:grid tab:gap-2">
      {QUICK_BETS.map((v) => (
        <button
          key={v}
          onClick={() => betInput.set(v)}
          disabled={inDive}
          className={`rounded-md border py-1.5 text-xs font-semibold tabular-nums transition tab:py-2 tab:text-sm ${
            bet === v
              ? "border-gold/60 bg-gold/15 text-gold"
              : "border-border bg-secondary text-muted-foreground"
          } disabled:opacity-50`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
