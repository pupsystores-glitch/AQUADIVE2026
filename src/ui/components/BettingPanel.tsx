// Betting panel — the bottom controls frame (docs/07_UI_ARCHITECTURE.md
// §13.3). Sprint 4, Commit U6: markup verbatim from the component shell.
// Pure composition: subscribes to nothing; its three children read their
// own slices (V3).

import { ActionButton } from "./ActionButton";
import { BetControls } from "./BetControls";
import { QuickBets } from "./QuickBets";

export function BettingPanel() {
  return (
    <div className="z-20 border-t border-border bg-card/80 px-4 pt-3 pb-4 backdrop-blur">
      <BetControls />
      <QuickBets />
      <ActionButton />
    </div>
  );
}
