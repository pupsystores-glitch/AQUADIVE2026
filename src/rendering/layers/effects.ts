// Effects layer — ship-impact jackpot FX (Sprint 2, Commit R3;
// docs/05_RENDERING_ARCHITECTURE.md §5 layer 5, §12). Timing contract: the
// layer receives `shipImpact: { elapsed } | null` in RenderState and draws
// while `elapsed < SHIP_IMPACT_FX_SECONDS`; the performance.now()
// bookkeeping lives with the caller — this layer is clock-free. The FX
// position tracks the anchor as it lands, via the Actor layer's pure pose
// (§18 correction, R3). Per §12 this layer is exempt from the no-RNG rule
// (jitter inside drawShipImpact).
//
// Phase 7 step V3 (owner decisions Q10/V3): while diving — and only then —
// the layer first draws F3, the anchor wake, and F4, the release splash
// (draw/particles.ts). Both are pure functions of the dive depth and of the
// geometry the Actor and World layers already draw (the anchor pose, the
// ship's waterline and scale); no FX event, queue entry or session state is
// involved. They vanish on the first crashed, cashed or bonus frame, at the
// sea floor (shipImpact set) and under reduced motion. The jackpot block
// below is unchanged.
//
// Phase 7 step V4 (owner decisions D1–D4, 2026-11-17): on the jackpot
// sea-floor landing — and only there — F5, the silt plume (draw/landing-fx.ts),
// is drawn under the jackpot burst. Its clock starts when the drawn anchor
// touches the sand (the Actor layer's anchorTouchdown, the instant the
// floor-thud hit is timed on), not at shipImpact. It needs shipImpact, so a
// normal crash (including the snapped anchor landing on the sand), a cashout
// mid-dive, betting and diving never show it.
//
// Phase 7 step V5 (owner decisions D1–D5, 2026-11-18): on a crashed frame
// with the E-X7 chain-snap timing — and only there — F6, the crash accent
// (draw/crash-fx.ts), is drawn first: a brief dark-blue vignette pulse and a
// few steel fragments from the break point. Its clock is the chain-snap
// clock itself (RenderState.chainSnap.elapsed: 0 on the frame the chain is
// first drawn broken), the same timestamp the FX queue's crash entry reads,
// so there is no second crash clock. The break point is the E-X7 split
// itself: the upper chain's free end at elapsed 0 (crashBreakPoint below).
// No camera shake (D1): the camera is never touched here.
//
// Phase 7 step V6 (owner authorization F7, 2026-11-18): when betting reopens,
// F7, the round-reset fade, softens the cut to the surface scene. The FX
// queue's reset entry (stamped by `bettingOpened` on the first frame of the
// surface view) reaches this layer as FxSettings.reset — the queue's own
// object, so the queue is the only reset clock. The surface scene starts
// darkened under one translucent solid fill (RESET_FADE_COLOR at
// RESET_FADE_MAX_ALPHA) and eases out to nothing over the entry's 0.40 s
// lifetime: no fade-in, no second dip, no crossfade. Drawn last, so it covers
// the whole canvas and nothing else; the DOM controls above the canvas are
// not touched. Same at High and Low; reduced motion draws nothing.

import { SHIP_WORLD_Y } from "@/shared/world";
import { SHIP_CHAIN_ATTACH_DY, SHIP_IMPACT_FX_SECONDS } from "../constants";
import type { Camera } from "../camera";
import { FX_LIFETIME_SECONDS } from "../fx-queue";
import { crashFxActive, drawCrashFx } from "../draw/crash-fx";
import { drawShipImpact } from "../draw/impact-fx";
import { drawSiltPlume, SILT_PLUME_LIFE } from "../draw/landing-fx";
import {
  ANCHOR_WAKE_LAUNCH_START,
  DEFAULT_FX_SETTINGS,
  drawAnchorWake,
  drawReleaseSplash,
  releaseSplashProgress,
  shipWaterlineY,
} from "../draw/particles";
import { shipScale } from "../draw/ship";
import type { FxSettings, RenderLayer, RenderState, RenderTime } from "../render-state";
import { anchorPose, anchorTouchdown, landingSeconds } from "./actor";
import { chainSnapBreak, layoutUpperChain, upperChainPoints } from "./chain-snap";
import { launchProgress } from "./presentation";

/** V6 (F7): the reset fade's lifetime (seconds) — the FX queue's reset entry lifetime. */
export const RESET_FADE_LIFE = FX_LIFETIME_SECONDS.reset;
/** V6 (F7): the fade's colour, a deep-water navy. */
export const RESET_FADE_COLOR = "rgb(2, 12, 34)";
/** V6 (F7): the fade's opacity on the first reset frame. */
export const RESET_FADE_MAX_ALPHA = 0.14;

/**
 * V6 (F7): the fade's opacity `elapsed` seconds after betting reopened —
 * RESET_FADE_MAX_ALPHA at 0, easing out (quadratic) to exactly 0 at
 * RESET_FADE_LIFE and after. Continuous and strictly decreasing, with a
 * zero slope at the end, so there is no visible step after the first frame.
 */
export function resetFadeAlpha(elapsed: number): number {
  if (!(elapsed >= 0) || elapsed >= RESET_FADE_LIFE) return 0;
  const rest = 1 - elapsed / RESET_FADE_LIFE;
  return RESET_FADE_MAX_ALPHA * rest * rest;
}

/** V6 (F7): one translucent solid fill over the viewport while the reset entry is active. */
function drawResetFade(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  camera: Camera,
  fx: FxSettings | undefined,
) {
  const reset = fx?.reset;
  if (reset == null || fx?.reducedMotion || state.phase !== "idle") return;
  const alpha = resetFadeAlpha(reset.elapsed);
  if (!(alpha > 0)) return;
  const { w, h } = camera.viewport;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = RESET_FADE_COLOR;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** V5: the break point of the current chain snap, cached per break (reused object). */
const breakPoint = {
  valid: false,
  t: 0,
  attachX: 0,
  attachY: 0,
  anchorX: 0,
  anchorY: 0,
  links: 0,
  detached: 0,
  x: NaN,
  y: NaN,
};

/**
 * V5: where the chain broke, on screen — the E-X7 split point, i.e. the upper
 * chain's free end at elapsed 0, from the break record the Actor layer
 * prepared this frame (layers/chain-snap.ts). Recomputed only when that record
 * changes (a new break, a resize); NaN when there is no upper chain. Must run
 * after the Actor layer in the same frame: layoutUpperChain reuses the
 * chain-snap output buffers, which the Actor layer has already drawn from and
 * rebuilds on its next frame. The chain drawing is not changed.
 */
export function crashBreakPoint(): { readonly x: number; readonly y: number } {
  const b = chainSnapBreak();
  const k = breakPoint;
  if (
    !k.valid ||
    k.t !== b.t ||
    k.attachX !== b.attachX ||
    k.attachY !== b.attachY ||
    k.anchorX !== b.anchorX ||
    k.anchorY !== b.anchorY ||
    k.links !== b.links ||
    k.detached !== b.detached
  ) {
    k.valid = true;
    k.t = b.t;
    k.attachX = b.attachX;
    k.attachY = b.attachY;
    k.anchorX = b.anchorX;
    k.anchorY = b.anchorY;
    k.links = b.links;
    k.detached = b.detached;
    const n = b.links > 0 ? layoutUpperChain(0, b.attachX, b.attachY) : 0;
    if (n >= 2) {
      const { xs, ys } = upperChainPoints();
      k.x = xs[0];
      k.y = ys[0];
    } else {
      k.x = NaN;
      k.y = NaN;
    }
  }
  return k;
}

/** V3: F3 and F4 for one diving frame. Issues no call when neither is active. */
function drawDiveFx(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  camera: Camera,
  time: RenderTime,
  fx: FxSettings,
) {
  const worldY = state.worldY;
  if (fx.reducedMotion || !(worldY > 0)) return;
  const { w, h } = camera.viewport;
  const launch = launchProgress(worldY, w, h);
  const splash = releaseSplashProgress(worldY) > 0;
  const wake = launch > ANCHOR_WAKE_LAUNCH_START;
  if (!splash && !wake) return;
  // anchorPose reuses its result object: copy the numbers out at once.
  const p = anchorPose(worldY, camera, time.animTime);
  const startX = p.chainStartX;
  const startY = p.chainStartY;
  const endX = p.chainEndX;
  const endY = p.chainEndY;
  const fromHull = p.fromHull;
  const k = shipScale(w);
  const waterline = shipWaterlineY(camera.worldToScreenY(SHIP_WORLD_Y), SHIP_CHAIN_ATTACH_DY, k);
  if (wake) {
    const surface = fromHull ? waterline : -Infinity;
    drawAnchorWake(ctx, worldY, startX, startY, endX, endY, launch, surface, h, fx);
  }
  if (splash) {
    drawReleaseSplash(ctx, worldY, startX, startY, w / 2, waterline, time.animTime, k, fx);
  }
}

export const effectsLayer: RenderLayer = {
  name: "effects",
  render(ctx, state, camera, time, fx) {
    // V5 — crash accent at the chain break, on the E-X7 chain-snap clock.
    const snap = state.phase === "crashed" ? state.chainSnap : null;
    if (snap && crashFxActive(snap.elapsed)) {
      const bp = crashBreakPoint();
      const { w, h } = camera.viewport;
      drawCrashFx(ctx, snap.elapsed, bp.x, bp.y, w, h, fx ?? DEFAULT_FX_SETTINGS);
    }

    // V3 — anchor wake and release splash, while diving only.
    if (state.phase === "diving" && !state.crashed && state.shipImpact === null) {
      drawDiveFx(ctx, state, camera, time, fx ?? DEFAULT_FX_SETTINGS);
    }

    // V4 — the silt plume where the landed anchor touches the sand.
    const landing = state.crashed ? -1 : landingSeconds(state);
    if (landing >= 0) {
      const touch = anchorTouchdown(camera);
      const age = landing - touch.seconds;
      if (age >= 0 && age < SILT_PLUME_LIFE) {
        drawSiltPlume(ctx, age, touch.x, touch.y, fx ?? DEFAULT_FX_SETTINGS);
      }
    }

    // Ship impact burst — pink jackpot lightning for ~1.4s after hit
    drawJackpotBurst(ctx, state, camera, time);

    // V6 — the round-reset fade, last: it covers the whole canvas.
    drawResetFade(ctx, state, camera, fx);
  },
};

/** The ship-impact burst block, unchanged; a function since V6 so F7 can follow it. */
function drawJackpotBurst(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  camera: Camera,
  time: RenderTime,
) {
  if (state.shipImpact === null) return;
  const { elapsed } = state.shipImpact;
  if (elapsed >= SHIP_IMPACT_FX_SECONDS) return;
  const life = Math.min(1, elapsed / SHIP_IMPACT_FX_SECONDS);
  const { w, h } = camera.viewport;
  const p = anchorPose(state.worldY, camera, time.animTime, landingSeconds(state));
  drawShipImpact(ctx, p.x, p.y, w, h, elapsed, life);
}
