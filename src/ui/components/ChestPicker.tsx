// Chest picker — the bonus overlay + pick buttons
// (docs/07_UI_ARCHITECTURE.md §13.2). Sprint 4, Commit U6: markup verbatim
// from the component shell.
//
// E-X1 (docs/06 §5): only a bonus-eligible participant (auto-cashed at the
// jackpot) sees and can use the picker — E-X3: shown while any bet slot is
// eligible; the one pick applies to every eligible slot; manual-cashout players and
// spectators never do — the engine completes their bonus phase itself.
// Chests, the chosen chest and eligibility are engine state mirrored by the
// round store (not event history), so a remount during `bonus` restores the
// picker, picked or not (U4b).

import { useCallback } from "react";
import { formatMultiplier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";
import { ChestIcon } from "./icons";

const { round } = gameSession;

export function ChestPicker() {
  const phase = useStore(round, (r) => r.phase);
  const bonusEligible = useStore(round, (r) =>
    r.participants.some((p) => p !== null && p.bonusEligible),
  );
  const chests = useStore(round, (r) => r.chests);
  const chosenChestId = useStore(round, (r) => r.chosenChestId);
  const chosenChest = chests !== null && chosenChestId !== null ? chests[chosenChestId] : null;

  const pickChest = useCallback((id: 0 | 1 | 2) => {
    gameSession.submit({ type: "pickChest", chestId: id });
  }, []);

  if (!(phase === "bonus" && bonusEligible) || !chests) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-black/40 pb-8 backdrop-blur-sm">
      <div className="mb-3 text-xs uppercase tracking-[0.3em] text-gold">
        {STRINGS.chests.title}
      </div>
      <div className="flex gap-4 px-6">
        {chests.map((c) => (
          <button
            key={c.id}
            onClick={() => pickChest(c.id)}
            disabled={!!chosenChest}
            className="group flex h-24 w-20 flex-col items-center justify-end rounded-lg border border-gold/40 bg-gradient-to-b from-[#3a2410] to-[#1a0e06] p-2 transition-transform active:scale-95 disabled:opacity-50"
          >
            <ChestIcon className="h-10 w-10 text-gold transition-transform group-hover:-translate-y-1" />
            <div className="mt-1 text-[10px] text-gold/70">
              {chosenChest?.id === c.id
                ? STRINGS.chests.revealed(formatMultiplier(c.multiplier))
                : STRINGS.chests.hidden}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
