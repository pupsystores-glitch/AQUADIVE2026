// Pre-dive presentation — the surface view shown while betting is open, and the
// progress of the anchor's launch from under the ship. Pure functions of the
// render state and the viewport; nothing here feeds back into the engine, whose
// world coordinates, collision point and timing are untouched.
//
// 1. Betting view. The engine resets its world only when a dive starts, so
//    during the betting countdown it still reports the previous round's depth.
//    `presentState` shows the surface instead (depth 0, no creatures), which
//    is exactly the state the dive then starts from — no jump at dive start.
//
// 2. Anchor launch. At depth 0 the anchor hangs close under the hull on a
//    short chain (layers/actor.ts). `launchProgress` eases it to its pinned
//    pose as the dive depth grows, and reaches exactly 1 at the depth where
//    the ship is culled above the top edge — from there on the Actor layer
//    runs its previous formulas unchanged.
//
// 3. Ship in view. On a viewport shorter than 820 px (phones) the pinned
//    camera would put the ship above the top edge. `presentationOffsetY`
//    shifts the camera down so the ship rests at SHIP_REST_MIN_Y, and eases
//    that shift to 0 over the same launch — no jump, and 0 in normal diving.

import { ANCHOR_WORLD_OFFSET_PX, SHIP_WORLD_Y } from "@/shared/world";
import {
  ANCHOR_LAUNCH_MIN_RANGE_PX,
  ANCHOR_SCREEN_Y_FRAC,
  SHIP_CULL_MARGIN_TOP,
  SHIP_REST_MIN_Y,
} from "../constants";
import type { RenderCreature, RenderState } from "../render-state";

const NO_CREATURES: readonly RenderCreature[] = [];

/** The state the layers draw: the surface view while betting, the engine's state otherwise. */
export function presentState(state: RenderState): RenderState {
  if (state.phase !== "idle") return state;
  if (state.worldY === 0 && state.depthRatio === 0 && state.creatures.length === 0) return state;
  return { ...state, worldY: 0, depthRatio: 0, creatures: NO_CREATURES };
}

/** The ship's screen Y at depth 0 with no presentation offset (the pinned camera). */
export function shipRestScreenY(h: number): number {
  return h * ANCHOR_SCREEN_Y_FRAC + (SHIP_WORLD_Y - ANCHOR_WORLD_OFFSET_PX);
}

/** The ship's screen Y at depth 0 as presented: never above SHIP_REST_MIN_Y. */
export function presentedShipRestY(h: number): number {
  return Math.max(shipRestScreenY(h), SHIP_REST_MIN_Y);
}

/**
 * Launch progress for viewport height `h`: 0 (anchor at rest under the ship)
 * to 1 (normal diving pose), eased. It reaches 1 at the depth where the ship
 * is culled above the top edge.
 */
export function launchProgress(worldY: number, h: number): number {
  if (!(worldY > 0)) return 0;
  const range = Math.max(ANCHOR_LAUNCH_MIN_RANGE_PX, presentedShipRestY(h) + SHIP_CULL_MARGIN_TOP);
  const p = worldY / range;
  if (!(p < 1)) return 1;
  return p * p * (3 - 2 * p);
}

/** Camera presentation offset (px) at depth `worldY`: shifts the ship into view, eased out by the launch. */
export function presentationOffsetY(worldY: number, h: number): number {
  const shift = presentedShipRestY(h) - shipRestScreenY(h);
  if (!(shift > 0)) return 0;
  return shift * (1 - launchProgress(worldY, h));
}
