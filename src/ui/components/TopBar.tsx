// Top bar — logo block + balance chip (docs/07_UI_ARCHITECTURE.md §13.1).
// Sprint 4, Commit U6: markup verbatim from the component shell; reads only
// the wallet's balance, so only balance changes re-render it (V3).
//
// LA1: the SOUND and MUSIC buttons sit directly under the balance chip,
// right-aligned with it (SoundToggles, which reads its own store slice).

import { formatMoney } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";
import { AnchorIcon } from "./icons";
import { SoundToggles } from "./SoundToggles";

const { wallet } = gameSession;

export function TopBar() {
  const balance = useStore(wallet, (w) => w.balance);

  return (
    <header className="z-20 flex items-center justify-between px-4 pt-3 pb-2">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-gold/40 bg-card text-gold">
          <AnchorIcon className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[10px] tracking-[0.2em] text-muted-foreground">
            {STRINGS.topBar.tagline}
          </div>
          <div className="-mt-0.5 text-sm font-bold tracking-[0.25em] text-gold">
            {STRINGS.topBar.title}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <div className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs">
          <span className="text-muted-foreground">{STRINGS.topBar.balanceLabel}</span>
          <span className="font-semibold text-gold">{formatMoney(balance)}</span>
        </div>
        <SoundToggles />
      </div>
    </header>
  );
}
