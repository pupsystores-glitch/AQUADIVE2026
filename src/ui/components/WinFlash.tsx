// Win flash — the "CASHED OUT +X" card (docs/07_UI_ARCHITECTURE.md §13.2).
// Sprint 4, Commit U6: markup verbatim from the component shell.
//
// Visibility is the notification store's active flash (trigger, duration,
// supersede and round-transition clears all live there, V2); the amount is
// the wallet's `lastWin` — the flash carries no money payload (C1), so
// money keeps exactly one owner (§6).

import { formatMoney, formatMultiplierValue } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";

const { wallet, notifications } = gameSession;

export function WinFlash() {
  const cashFlash = useStore(notifications, (n) => n.flash !== null);
  const lastWin = useStore(wallet, (w) => w.lastWin);

  if (!cashFlash || !lastWin) return null;

  return (
    <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-6 text-center">
      <div className="mx-auto inline-block rounded-xl border border-success/40 bg-success/15 px-6 py-3 backdrop-blur-sm">
        <div className="text-xs tracking-[0.3em] text-success">{STRINGS.winFlash.title}</div>
        <div className="mt-1 text-3xl font-black text-success">
          {STRINGS.winFlash.amountPrefix}
          {formatMoney(lastWin.amount)}
        </div>
        <div className="text-xs text-white/70">
          {STRINGS.winFlash.atPrefix}
          {formatMultiplierValue(lastWin.mult)}
          {STRINGS.units.multiplierSign}
        </div>
      </div>
    </div>
  );
}
