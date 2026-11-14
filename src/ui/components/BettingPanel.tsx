// Betting panel — the bottom controls frame (docs/07_UI_ARCHITECTURE.md
// §13.3). Sprint 4, Commit U6; E-X3 Dual Bet (owner-approved 2026-11-14).
//
// Two independent bet slots, BET 1 and BET 2, each a real engine slot with
// its own stake, PLACE BET and CASH OUT (no simulated second panel). Phones
// and tablets: side by side, both always visible (no collapsed BET 2), each
// compact. Desktop rail (`desk`): stacked, full controls. Pure composition:
// subscribes to nothing; each slot panel's children read their own slices
// (V3).
//
// Each slot panel is a focus-rescue scope (Sprint 4 QA fix): when the
// focused control disables itself as the round moves on (PLACE BET → BET
// LOCKED, CASH OUT → SECURED / WAITING…, the dive locking the stake field),
// focus moves to the panel instead of falling back to the page, so Tab
// continues inside the same slot. tabIndex={-1} keeps it out of the Tab order.

import { useRef } from "react";
import type { BetSlot } from "@/engine";
import { useFocusRescue } from "@/ui/hooks/use-focus-rescue";
import { STRINGS } from "@/ui/strings";
import { ActionButton } from "./ActionButton";
import { BetControls } from "./BetControls";
import { QuickBets } from "./QuickBets";

function BetSlotPanel({ slot }: { slot: BetSlot }) {
  const label = STRINGS.panel.slotLabel(slot + 1);
  const ref = useRef<HTMLElement | null>(null);
  useFocusRescue(ref);
  return (
    <section
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={-1}
      data-focus-scope=""
      className="flex min-w-0 flex-col rounded-lg border border-border/60 bg-background/30 p-2 tab:p-3"
    >
      <div
        aria-hidden="true"
        className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground"
      >
        {label}
      </div>
      <BetControls slot={slot} />
      <QuickBets slot={slot} />
      <div className="mt-auto">
        <ActionButton slot={slot} />
      </div>
    </section>
  );
}

export function BettingPanel() {
  return (
    <div className="z-20 border-t border-border bg-card/80 px-2 pt-2 pb-3 backdrop-blur tab:px-4 tab:pt-3 tab:pb-4">
      <div className="grid grid-cols-2 gap-2 tab:gap-3 desk:grid-cols-1">
        <BetSlotPanel slot={0} />
        <BetSlotPanel slot={1} />
      </div>
    </div>
  );
}
