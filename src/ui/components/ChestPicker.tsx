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
import { TreasureChestArt } from "./icons";

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
      <div className="flex gap-3 px-4 sm:gap-5">
        {chests.map((c) => {
          const isChosen = chosenChest?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => pickChest(c.id)}
              disabled={!!chosenChest}
              aria-description={STRINGS.chests.position(c.id + 1, chests.length)}
              className={`group relative w-[6.5rem] rounded-xl border bg-gradient-to-b from-[#2a1a0c]/90 to-[#0d0703]/90 p-2 pt-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-200 enabled:hover:-translate-y-1 enabled:hover:border-gold/80 enabled:hover:shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_35%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold active:scale-95 sm:w-32 ${
                isChosen
                  ? "scale-105 border-gold shadow-[0_0_32px_color-mix(in_oklab,var(--gold)_50%,transparent)]"
                  : "border-gold/40 disabled:opacity-45 disabled:grayscale-[0.4]"
              }`}
            >
              <div className="relative aspect-[6/5] w-full">
                <TreasureChestArt
                  id={`bonus-chest-${c.id}`}
                  open={isChosen}
                  className="absolute inset-0 h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] transition-transform duration-300 group-enabled:group-hover:scale-[1.04]"
                />
                {/* The multiplier sits on the chest front, centred and in gold. */}
                <div
                  className={`absolute inset-x-0 top-[69%] -translate-y-1/2 text-center font-black leading-none tracking-tight text-gold tabular-nums [-webkit-text-stroke:1px_#2a1306] [paint-order:stroke_fill] [text-shadow:0_2px_0_#1a0e06,0_0_12px_rgba(0,0,0,0.85)] ${
                    isChosen ? "multiplier-glow text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
                  }`}
                >
                  {isChosen
                    ? STRINGS.chests.revealed(formatMultiplier(c.multiplier))
                    : STRINGS.chests.hidden}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
