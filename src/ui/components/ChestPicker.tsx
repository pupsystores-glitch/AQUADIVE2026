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
//
// CH1 (owner instruction 2026-11-17): premium chest presentation. Each chest
// has its own look (ruby, sapphire, emerald; the outer two in a three-quarter
// view turned toward the centre, TreasureChestArt). A pick opens exactly the
// chosen chest (the one whose id is the engine's `chosenChestId`) with a pop,
// a gold halo and a glint burst (F8, ChestBurst); the other two stay closed,
// dimmed and pushed back. The multiplier then appears large and centred in
// gold (ChestReveal), inside a polite status region so it is also announced.
// Presentation only: the pick path, the values and the timing are the engine's.

import { useCallback, useEffect, useRef } from "react";
import { formatMultiplier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { isFocusParked, useFocusRescue } from "@/ui/hooks/use-focus-rescue";
import { gameSession } from "@/ui/session";
import { STRINGS } from "@/ui/strings";
import { ChestBurst } from "./ChestBurst";
import { ChestReveal } from "./ChestReveal";
import { TreasureChestArt, type ChestVariant, type ChestView } from "./TreasureChestArt";

const { round } = gameSession;

/** Per-chest look: colour by chest, the outer two turned toward the centre. */
const CHEST_LOOKS: Record<0 | 1 | 2, { variant: ChestVariant; view: ChestView }> = {
  0: { variant: "ruby", view: "right" },
  1: { variant: "sapphire", view: "front" },
  2: { variant: "emerald", view: "left" },
};

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
      className={`absolute inset-0 z-30 flex flex-col items-center pb-5 backdrop-blur-sm transition-colors duration-500 tab:pb-8 ${
        chosenChest ? "bg-black/60" : "bg-black/40"
      }`}
    >
      {chosenChest && (
        <div
          aria-hidden="true"
          className="chest-focus-vignette pointer-events-none absolute inset-0"
        />
      )}
      {/* The centred multiplier: a polite status region, filled by the pick. */}
      <div
        role="status"
        className="relative flex min-h-0 w-full flex-1 items-center justify-center"
      >
        {chosenChest && <ChestReveal multiplier={chosenChest.multiplier} />}
      </div>
      <div className="relative mb-2 text-xs uppercase tracking-[0.3em] text-gold">
        {STRINGS.chests.title}
      </div>
      <div className="relative flex items-end gap-3 px-4 @lg:gap-6">
        {chests.map((c) => {
          const isChosen = chosenChest?.id === c.id;
          const isPassed = chosenChest !== null && !isChosen;
          const look = CHEST_LOOKS[c.id];
          return (
            <button
              key={c.id}
              onClick={() => pickChest(c.id)}
              disabled={!!chosenChest}
              aria-description={STRINGS.chests.position(c.id + 1, chests.length)}
              className={`group relative w-[6.5rem] rounded-2xl p-1 transition-[opacity,filter,scale,translate] duration-300 enabled:hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold enabled:active:scale-95 @lg:w-40 @3xl:w-48 ${
                isPassed ? "scale-90 opacity-40 grayscale-[0.5]" : ""
              } ${isChosen ? "z-10" : ""}`}
            >
              <div className={isChosen ? "chest-pick-pop relative" : "relative"}>
                {isChosen && (
                  <span
                    aria-hidden="true"
                    className="chest-halo pointer-events-none absolute left-1/2 top-[40%] aspect-square w-[180%] -translate-x-1/2 -translate-y-1/2"
                  />
                )}
                <div className="relative aspect-[5/4] w-full">
                  <TreasureChestArt
                    id={`bonus-chest-${c.id}`}
                    variant={look.variant}
                    view={look.view}
                    open={isChosen}
                    className="absolute inset-0 h-full w-full drop-shadow-[0_6px_8px_rgba(0,0,0,0.55)] transition-transform duration-300 group-enabled:group-hover:scale-[1.05]"
                  />
                  {isChosen && <ChestBurst />}
                </div>
                {/* The label plate: "???" until the pick, then this chest's multiplier. */}
                <div
                  className={`relative mx-auto mt-1 w-fit min-w-[4.25rem] rounded-full border px-2.5 py-0.5 text-center text-sm font-black leading-tight tabular-nums text-gold [text-shadow:0_1px_0_#1a0e06] @lg:text-base ${
                    isChosen
                      ? "border-gold bg-gradient-to-b from-[#4a2c0c] to-[#1a0e04] shadow-[0_0_14px_color-mix(in_oklab,var(--gold)_45%,transparent)]"
                      : "border-gold/45 bg-gradient-to-b from-[#2a1a0c]/95 to-[#0d0703]/95"
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
