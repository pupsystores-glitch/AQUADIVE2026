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

import { SHIP_WORLD_Y } from "@/shared/world";
import { SHIP_CHAIN_ATTACH_DY, SHIP_IMPACT_FX_SECONDS } from "../constants";
import type { Camera } from "../camera";
import { drawShipImpact } from "../draw/impact-fx";
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
import { anchorPose, landingSeconds } from "./actor";
import { launchProgress } from "./presentation";

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
    // V3 — anchor wake and release splash, while diving only.
    if (state.phase === "diving" && !state.crashed && state.shipImpact === null) {
      drawDiveFx(ctx, state, camera, time, fx ?? DEFAULT_FX_SETTINGS);
    }

    // Ship impact burst — pink jackpot lightning for ~1.4s after hit
    if (state.shipImpact === null) return;
    const { elapsed } = state.shipImpact;
    if (elapsed >= SHIP_IMPACT_FX_SECONDS) return;
    const life = Math.min(1, elapsed / SHIP_IMPACT_FX_SECONDS);
    const { w, h } = camera.viewport;
    const p = anchorPose(state.worldY, camera, time.animTime, landingSeconds(state));
    drawShipImpact(ctx, p.x, p.y, w, h, elapsed, life);
  },
};
