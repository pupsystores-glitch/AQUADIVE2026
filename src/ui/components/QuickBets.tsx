// Quick bets — the QUICK_BETS row (docs/07_UI_ARCHITECTURE.md §13.3).
// Sprint 4, Commit U6: markup verbatim from the component shell. Writes go
// through the bet-input store's sanitized `set` (U5, V4); disabled during
// the dive only.

import { QUICK_BETS } from "@/game/config";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";

const { round, betInput } = gameSession;

export function QuickBets() {
  const phase = useStore(round, (r) => r.phase);
  const bet = useStore(betInput, (b) => b);
  const inDive = phase === "diving";

  return (
    <div className="mb-3 grid grid-cols-5 gap-1.5 tab:gap-2">
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
