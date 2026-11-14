// History strip — round-result chips (docs/07_UI_ARCHITECTURE.md §13.1).
// Sprint 4, Commit U6: markup verbatim from the component shell; reads only
// the wallet's history (a new array reference per settled round), so only a
// new round result re-renders it (V3).

import { formatMultiplierValue } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";

const { wallet } = gameSession;

export function HistoryStrip() {
  const history = useStore(wallet, (w) => w.history);

  return (
    <div className="z-20 flex gap-1.5 overflow-x-auto px-4 pb-2">
      {history.length === 0 && (
        <span className="text-[11px] text-muted-foreground/70">{STRINGS.history.empty}</span>
      )}
      {history.map((h, i) => (
        <span
          key={i}
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
            h.crashed
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {formatMultiplierValue(h.mult)}
          {STRINGS.units.multiplierSign}
        </span>
      ))}
    </div>
  );
}
