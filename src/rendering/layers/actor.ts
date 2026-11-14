// Actor layer — chain + anchor + sway math (Sprint 2, Commit R3;
// docs/05_RENDERING_ARCHITECTURE.md §5 layer 4, §9). The whole sway block
// moved as one unit from the component's drawScene (§20 risk 4): pendulum X,
// sway angle, ring-position trig, chain endpoints — all formulas verbatim,
// derived only from the animation clock and the viewport. Draw order within
// the layer: chain → anchor.
//
// The pendulum X and pinned screen-Y are exported as pure helpers so the
// Effects layer can anchor impact FX to the swaying anchor without
// duplicating the formula (§18 correction, R3).
//
// Pre-dive presentation: at depth 0 the anchor hangs close under the ship on
// a short chain, swinging like a pendulum from the hawse hole and trailing the
// floating ship; it eases to the pinned pose as the dive starts
// (layers/presentation.ts). Once the ship has been culled the pose is the
// previous one, formula for formula.

import { SHIP_WORLD_Y } from "@/shared/world";
import {
  ANCHOR_DRAW_H,
  ANCHOR_REST_CHAIN_PX,
  ANCHOR_REST_SWING,
  ANCHOR_REST_SWING_2,
  ANCHOR_REST_SWING_SPEED,
  ANCHOR_RING_Y_FRAC,
  ANCHOR_SCREEN_Y_FRAC,
  SHIP_CHAIN_ATTACH_DY,
} from "../constants";
import { assets } from "../assets";
import type { Camera } from "../camera";
import { drawAnchor } from "../draw/anchor";
import { drawChain } from "../draw/chain";
import { shipChainAttach, type ShipOffset } from "../draw/ship";
import type { RenderLayer } from "../render-state";
import { launchProgress, presentedShipRestY } from "./presentation";

/** Anchor sway — faster & wider for a more natural pendulum swing. */
export function anchorSwayX(animTime: number, w: number): number {
  return w / 2 + Math.sin(animTime * 1.4) * 38 + Math.sin(animTime * 0.7) * 10;
}

/** World camera: anchor is fixed near 55% of screen. */
export function anchorPinY(h: number): number {
  return h * ANCHOR_SCREEN_Y_FRAC;
}

/** Radius of the anchor's shackle ring (px); the chain ends at the ring's top. */
const RING_R = 9;

/** How far (seconds) the hanging anchor trails the ship's movement. */
const ANCHOR_FOLLOW_LAG = 0.45;
/** How strongly the hanging anchor reacts to the hull's sideways movement. */
const ANCHOR_FOLLOW_GAIN = 1.5;

// Reused across frames.
const attachNow: ShipOffset = { x: 0, y: 0 };
const attachLagged: ShipOffset = { x: 0, y: 0 };

export interface AnchorPose {
  /** Anchor sprite centre. */
  x: number;
  y: number;
  swayAngle: number;
  /** Chain top: the hull's attachment point. */
  chainStartX: number;
  chainStartY: number;
  /** Chain bottom: the top of the anchor's shackle ring. */
  chainEndX: number;
  chainEndY: number;
  /** True while the anchor is launching and the chain starts at the hull's attachment point. */
  fromHull: boolean;
}

// Reused across frames — the pose is computed every frame.
const pose: AnchorPose = {
  x: 0,
  y: 0,
  swayAngle: 0,
  chainStartX: 0,
  chainStartY: 0,
  chainEndX: 0,
  chainEndY: 0,
  fromHull: false,
};

/**
 * Anchor and chain placement for one frame — presentation only, derived from
 * the depth, the viewport and the animation clock. The returned object is
 * reused by the next call.
 */
export function anchorPose(worldY: number, camera: Camera, animTime: number): AnchorPose {
  const { w, h } = camera.viewport;
  const shipScreenY = camera.worldToScreenY(SHIP_WORLD_Y);
  const launch = launchProgress(worldY, h);

  const pinY = anchorPinY(h);
  const fullX = anchorSwayX(animTime, w);
  const fullAngle = Math.sin(animTime * 1.8) * 0.22 + Math.sin(animTime * 0.9) * 0.05;
  // Ring above the sprite centre; its position accounts for rotation around that centre.
  const ringOffsetFromCenter = ANCHOR_DRAW_H * (0.5 - ANCHOR_RING_Y_FRAC);

  pose.chainStartX = w / 2;
  pose.fromHull = launch < 1;
  if (pose.fromHull) {
    // Chain from the hull's attachment point, which floats with the ship. The
    // ship's motion and the anchor's response fade out as the launch completes.
    const motion = 1 - launch;
    shipChainAttach(animTime, motion, SHIP_CHAIN_ATTACH_DY, attachNow);
    shipChainAttach(animTime - ANCHOR_FOLLOW_LAG, motion, SHIP_CHAIN_ATTACH_DY, attachLagged);
    pose.chainStartX = w / 2 + attachNow.x;
    pose.chainStartY = shipScreenY + attachNow.y;
    // Rest pose: a pendulum hanging from the hawse hole at depth 0. It swings
    // on its own and trails the hull's sideways movement (the lagged
    // attachment), so it repeats the ship's motion a moment later.
    const theta =
      (Math.sin(animTime * ANCHOR_REST_SWING_SPEED) * ANCHOR_REST_SWING +
        Math.sin(animTime * 0.71 + 1.1) * ANCHOR_REST_SWING_2 +
        ((attachLagged.x - attachNow.x) * ANCHOR_FOLLOW_GAIN) / ANCHOR_REST_CHAIN_PX) *
      motion;
    const reach = ANCHOR_REST_CHAIN_PX + RING_R + ringOffsetFromCenter; // pivot → sprite centre
    const pivotX = w / 2 + attachNow.x;
    const pivotY = presentedShipRestY(h) + attachNow.y;
    const restX = pivotX + Math.sin(theta) * reach;
    const restY = pivotY + Math.cos(theta) * reach;
    // Launch: ease from the rest pose to the pinned, swaying diving pose.
    pose.x = restX + (fullX - restX) * launch;
    pose.y = restY + (pinY - restY) * launch;
    pose.swayAngle = -theta + (fullAngle + theta) * launch; // the sprite hangs along the chain
  } else {
    // Normal diving — the ship is off screen. Previous formulas, verbatim.
    pose.chainStartY = Math.min(shipScreenY + SHIP_CHAIN_ATTACH_DY, 0);
    pose.x = fullX;
    pose.y = pinY;
    pose.swayAngle = fullAngle;
  }

  pose.chainEndX = pose.x + Math.sin(pose.swayAngle) * ringOffsetFromCenter;
  pose.chainEndY = pose.y - Math.cos(pose.swayAngle) * ringOffsetFromCenter - RING_R;
  return pose;
}

export const actorLayer: RenderLayer = {
  name: "actor",
  render(ctx, state, camera, time) {
    const p = anchorPose(state.worldY, camera, time.animTime);

    // Chain from the ship down to the anchor's shackle ring. While the ship is
    // on screen the chain is cut at the hull's hawse hole, so it visibly comes
    // out of the hole instead of overlapping the hull above it.
    if (p.fromHull) {
      const { w, h } = camera.viewport;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, p.chainStartY - 2, w, h - p.chainStartY + 2);
      ctx.clip();
      drawChain(ctx, p.chainStartX, p.chainStartY, p.chainEndX, p.chainEndY, time.animTime);
      ctx.restore();
    } else {
      drawChain(ctx, p.chainStartX, p.chainStartY, p.chainEndX, p.chainEndY, time.animTime);
    }

    // Anchor sprite (in front of shipwreck so it lands ON the ship)
    drawAnchor(
      ctx,
      p.x,
      p.y,
      p.swayAngle,
      state.crashed,
      state.boost,
      ANCHOR_DRAW_H,
      assets.get("anchor"),
    );
  },
};
