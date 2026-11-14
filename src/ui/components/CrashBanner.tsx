// Crash banner — the "CHAIN SNAPPED" card (docs/07_UI_ARCHITECTURE.md
// §13.2). Sprint 4, Commit U6: markup verbatim from the component shell.
// A pure phase derived from the round store — state, not a notification
// (§12): no timers; visible exactly while the phase is `crashed`.

import { formatMultiplierValue } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";

const { round } = gameSession;

export function CrashBanner() {
  const phase = useStore(round, (r) => r.phase);
  const multiplier = useStore(round, (r) => r.multiplier);

  if (phase !== "crashed") return null;

  return (
    <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-6 text-center">
      <div className="mx-auto inline-block rounded-xl border border-danger/40 bg-danger/15 px-6 py-3 backdrop-blur-sm">
        <div className="text-xs tracking-[0.3em] text-danger/90">{STRINGS.crash.title}</div>
        <div className="mt-1 text-3xl font-black text-danger">
          {formatMultiplierValue(multiplier)}
          {STRINGS.units.multiplierSign}
        </div>
      </div>
    </div>
  );
}
