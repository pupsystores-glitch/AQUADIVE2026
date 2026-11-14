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
//
// Keyboard access (Sprint 4 QA fix): the picker is a named group and a
// focus-rescue scope. When it opens while focus is parked (on the page, on a
// slot panel, or on a control the round just disabled), focus moves to the
// first chest, so the timed pick is reachable without hunting for it; focus is
// never taken from a control the player is using, such as the other slot's
// amount field. After the pick disables the chests, focus stays on the
// picker; when the picker closes, focus returns to where it was. Each chest
// carries a "Chest n of 3" description; its accessible name stays the
// visible "???" / "+m×" text.

import { useCallback, useEffect, useRef } from "react";
import { formatMultiplier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { isFocusParked, useFocusRescue } from "@/ui/hooks/use-focus-rescue";
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
  const visible = phase === "bonus" && bonusEligible && chests !== null;

  const ref = useRef<HTMLDivElement | null>(null);
  useFocusRescue(ref, visible);

  useEffect(() => {
    const root = ref.current;
    if (!visible || !root) return;
    const doc = root.ownerDocument;
    if (!isFocusParked(doc)) return;
    const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const first = root.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (first ?? root).focus({ preventScroll: true });
    return () => {
      // The picker closed: if focus went down with it, return it.
      if (doc.activeElement !== null && doc.activeElement !== doc.body) return;
      if (previous && previous !== doc.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [visible]);

  const pickChest = useCallback((id: 0 | 1 | 2) => {
    gameSession.submit({ type: "pickChest", chestId: id });
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={STRINGS.chests.title}
      tabIndex={-1}
      data-focus-scope=""
      className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-black/40 pb-8 backdrop-blur-sm"
    >
      <div className="mb-3 text-xs uppercase tracking-[0.3em] text-gold">
        {STRINGS.chests.title}
      </div>
      <div className="flex gap-4 px-6">
        {chests.map((c) => (
          <button
            key={c.id}
            onClick={() => pickChest(c.id)}
            disabled={!!chosenChest}
            aria-description={STRINGS.chests.position(c.id + 1, chests.length)}
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
