// Game screen — the layout frame that composes everything
// (docs/07_UI_ARCHITECTURE.md §13.1). Sprint 4, Commit U6: the U6
// decomposition of the component shell (src/components/AbyssAnchor.tsx),
// markup moved verbatim into the §13 components below; this file owns only
// the frame and composition order. Replaces the shell as the route
// component; the shell is deleted in the same step (§16).
//
// The screen subscribes to nothing (V3): each child reads exactly its own
// store slices via useStore, so only components whose slice changed
// re-render — identical pixels, per-slice granularity. The game session
// (§8) — engine, driver, stores, renderer attachment — lives at module
// scope in src/ui/session.ts, so remounting any of this resumes the world,
// the wallet, an active win flash, the round/bonus presentation (including
// the chest picker) and the typed bet instead of restarting them (docs/06
// §13; deltas V1, V2, V4; U4b, U5). CanvasStage owns the attach lifecycle.
//
// The dev rejection banner (§12, C3) is composed under an
// import.meta.env.DEV guard, so production builds compile it out.
//
// Responsive layout (§15, delta V5; Sprint 4, Commit U7). Three tiers, via
// the `tab` / `desk` custom variants in src/styles.css. Phones: the
// canonical max-w-md column; the mobile class tokens are unchanged and
// every other token is variant-prefixed. `tab` (≥ 768 px wide and ≥ 600 px
// tall, incl. portrait large iPads): the same column at full width, with the
// betting controls centered at a comfortable width. `desk` (≥ 1024 px,
// landscape): a full-viewport landscape grid (owner desktop correction,
// 2026-11-14, retiring the earlier 9:16 portrait stage): the canvas stage fills the whole left region, and a
// compact right rail stacks TopBar (brand + balance), HistoryStrip and the
// BettingPanel. Placement is done here by child position, so the components
// stay layout-agnostic and the DOM is identical at every width. CSS-only:
// the renderer reads the canvas's CSS size every frame at uniform 1:1 CSS
// pixels (no distortion), and every overlay is absolutely positioned inside
// the stage, so it stays aligned with the canvas. The stage is an inline-size
// container so overlays can size against its width (MultiplierOverlay's lane).
// At `tab` and up the betting controls step up one size (components carry
// those `tab:` tokens), filling the desktop rail and matching the wider
// tablet column, for about 10 px of extra panel height.

import { BettingPanel } from "./BettingPanel";
import { CanvasStage } from "./CanvasStage";
import { CrashBanner } from "./CrashBanner";
import { ChestPicker } from "./ChestPicker";
import { DevAudioDiagnostics } from "./DevAudioDiagnostics";
import { DevRejectionBanner } from "./DevRejectionBanner";
import { HistoryStrip } from "./HistoryStrip";
import { MultiplierOverlay } from "./MultiplierOverlay";
import { TopBar } from "./TopBar";
import { WinFlash } from "./WinFlash";

/**
 * Tablet frame: the phone column released to full width; the BettingPanel's
 * contents are centered at ≤ 38rem (padding resolves against the frame width,
 * so inside the narrow desktop rail it collapses back to the default 1rem).
 */
const TABLET_FRAME =
  " tab:max-w-none tab:[&>:nth-child(4)]:px-[max(1.5rem,calc((100%_-_38rem)/2))]";

/**
 * Desktop frame: full-viewport landscape grid — the stage (left, every row)
 * beside a compact rail (right): TopBar, HistoryStrip (flexible row),
 * BettingPanel anchored at the foot. Rail: 21rem floor, 25vw, 28rem cap,
 * so the stage takes ~67 % at 1024 px, ~73 % at 1280–1440 px, ~76 % at 1920 px.
 */
const DESKTOP_FRAME =
  " desk:grid desk:max-w-none desk:grid-cols-[minmax(0,1fr)_clamp(21rem,25vw,28rem)]" +
  " desk:grid-rows-[auto_minmax(0,1fr)_auto] desk:gap-x-4 desk:gap-y-3 desk:p-4" +
  // child 1 — TopBar heads the rail (brand + balance)
  " desk:[&>:nth-child(1)]:col-start-2 desk:[&>:nth-child(1)]:row-start-1" +
  " desk:[&>:nth-child(1)]:px-1 desk:[&>:nth-child(1)]:pt-1 desk:[&>:nth-child(1)]:pb-0" +
  // child 2 — HistoryStrip fills the rail's flexible middle with wrapping chips
  " desk:[&>:nth-child(2)]:col-start-2 desk:[&>:nth-child(2)]:row-start-2" +
  " desk:[&>:nth-child(2)]:flex-wrap desk:[&>:nth-child(2)]:content-start" +
  " desk:[&>:nth-child(2)]:overflow-x-hidden desk:[&>:nth-child(2)]:overflow-y-auto" +
  " desk:[&>:nth-child(2)]:px-1 desk:[&>:nth-child(2)]:pb-0" +
  // child 4 — BettingPanel at the rail's foot, as a card
  " desk:[&>:nth-child(4)]:col-start-2 desk:[&>:nth-child(4)]:row-start-3" +
  " desk:[&>:nth-child(4)]:rounded-xl desk:[&>:nth-child(4)]:border";

/** Desktop stage (child 3): the whole left region across every row; width and height follow the viewport. */
const DESKTOP_STAGE =
  " desk:col-start-1 desk:row-span-3 desk:row-start-1 desk:h-full desk:w-full desk:min-h-0" +
  " desk:rounded-xl desk:border desk:border-border";

export default function GameScreen() {
  return (
    <div
      className={
        "relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-background text-foreground" +
        TABLET_FRAME +
        DESKTOP_FRAME
      }
    >
      {/* TOP BAR */}
      <TopBar />

      {/* HISTORY STRIP */}
      <HistoryStrip />

      {/* CANVAS STAGE */}
      <div className={"@container relative flex-1 overflow-hidden" + DESKTOP_STAGE}>
        <CanvasStage />

        {/* Multiplier overlay */}
        <MultiplierOverlay />

        {/* Crash banner */}
        <CrashBanner />

        {/* Cashed banner */}
        <WinFlash />

        {/* Bonus chests */}
        <ChestPicker />

        {/* Dev-only command rejection banner (§12) — compiled out of production */}
        {import.meta.env.DEV && <DevRejectionBanner />}

        {/* IOS-AUDIO: temporary dev-only audio diagnostics (?audiodebug=1), portalled to <body> */}
        {import.meta.env.DEV && <DevAudioDiagnostics />}
      </div>

      {/* BOTTOM CONTROLS */}
      <BettingPanel />
    </div>
  );
}
