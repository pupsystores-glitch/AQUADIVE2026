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
// 3. Ship in view. Where the pinned camera would put the ship (partly) above
//    the top edge, `presentationOffsetY` shifts the camera down so the ship
//    rests at `presentedShipRestY`, and eases that shift to 0 over the same
//    launch — no jump, and 0 in normal diving. E-X6 S2: the rest position is
//    computed from the rescue boat's measured geometry — the whole boat in
//    view at the top of its bob, its bow rail below the HUD readout, and the
//    resting anchor above its pinned diving position wherever the scene is
//    tall enough for all three (`shipClearRestY`).

import { ANCHOR_WORLD_OFFSET_PX, SHIP_WORLD_Y } from "@/shared/world";
import {
  ANCHOR_DRAW_H,
  ANCHOR_LAUNCH_MIN_RANGE_PX,
  ANCHOR_REST_CHAIN_HULL_PX,
  ANCHOR_REST_CHAIN_PX,
  ANCHOR_RING_Y_FRAC,
  ANCHOR_SCREEN_Y_FRAC,
  CHAIN_RING_GRIP_PX,
  PICKUP_FLIGHT_PX,
  PICKUP_START_DY_PX,
  SHIP_CHAIN_ATTACH_DY,
  SHIP_CULL_MARGIN_TOP,
  SHIP_REST_HUD_BOTTOM,
  SHIP_REST_TOP_MARGIN,
} from "../constants";
import { SHIP_GEOMETRY, SHIP_HEAVE_MAX, SHIP_ROLL_MAX, shipScale } from "../draw/ship";
import type { RenderCreature, RenderState } from "../render-state";

/** Radius of the anchor's shackle ring (px) — the Actor layer's RING_R. */
const ANCHOR_RING_R = 9;
/**
 * Resting anchor, attachment → sprite centre at full chain (px), less the
 * chain: the Actor layer's CHAIN_END_ABOVE_RING plus the ring's offset from
 * the sprite centre.
 */
const ANCHOR_HANG_BELOW_CHAIN =
  ANCHOR_RING_R - CHAIN_RING_GRIP_PX + ANCHOR_DRAW_H * (0.5 - ANCHOR_RING_Y_FRAC);

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

/** Highest rise (px) of a ship point `x` px beside the chain hole above its still position: heave plus roll. */
const bobRise = (x: number) => SHIP_HEAVE_MAX + Math.abs(x) * Math.sin(SHIP_ROLL_MAX);

/**
 * The ship's origin Y at rest for a `w` × `h` viewport, from the boat's
 * measured geometry (all of it scaled by shipScale around the chain hole,
 * which lies SHIP_CHAIN_ATTACH_DY below the origin):
 *
 * - `fullView`: lowest origin at which the mast top, at the top of its bob,
 *   is on screen; `hudClear`: at which the bow rail clears the HUD readout.
 *   Together they are the floor — the boat is never placed above it.
 * - `preferred`: the floor plus SHIP_REST_TOP_MARGIN of air above the mast.
 * - `anchorCap`: highest origin at which the resting anchor still hangs above
 *   its pinned diving position, so the launch only lowers it. The margin
 *   above the mast gives way to it, the floor does not: on a scene too short
 *   for both (375 × 667 phones) the whole boat stays in view and the anchor
 *   rests lower, rising to its pinned position during the launch.
 */
export function shipClearRestY(w: number, h: number): number {
  const k = shipScale(w);
  const g = SHIP_GEOMETRY;
  const a = SHIP_CHAIN_ATTACH_DY;
  const fullView = g.mastRise * k + bobRise(g.mastX * k) - a;
  const hudClear = SHIP_REST_HUD_BOTTOM + g.bowRailRise * k + bobRise(g.bowX * k) - a;
  const floor = Math.max(fullView, hudClear);
  const preferred = Math.max(floor, fullView + SHIP_REST_TOP_MARGIN);
  const restChain = ANCHOR_REST_CHAIN_PX - ANCHOR_REST_CHAIN_HULL_PX * (1 - k);
  const anchorCap =
    h * ANCHOR_SCREEN_Y_FRAC - 1 - (a + SHIP_HEAVE_MAX + restChain + ANCHOR_HANG_BELOW_CHAIN);
  return Math.max(floor, Math.min(preferred, anchorCap));
}

/** The ship's screen Y at depth 0 as presented: the pinned camera's, or lower where the boat needs it (`shipClearRestY`). */
export function presentedShipRestY(w: number, h: number): number {
  return Math.max(shipRestScreenY(h), shipClearRestY(w, h));
}

/**
 * Launch progress for a `w` × `h` viewport: 0 (anchor at rest under the
 * ship) to 1 (normal diving pose), eased. It reaches 1 at the depth where the
 * ship is culled above the top edge.
 */
export function launchProgress(worldY: number, w: number, h: number): number {
  if (!(worldY > 0)) return 0;
  const range = Math.max(
    ANCHOR_LAUNCH_MIN_RANGE_PX,
    presentedShipRestY(w, h) + SHIP_CULL_MARGIN_TOP,
  );
  const p = worldY / range;
  if (!(p < 1)) return 1;
  return p * p * (3 - 2 * p);
}

// ----- Goldfish collection flight (E-X6 S2.1) -----
//
// The engine marks a goldfish consumed on the first tick its distance ahead
// of the anchor's collision point drops below COLLISION_DY_PX
// (PICKUP_START_DY_PX here). The anchor only moves down, so from then on that
// distance keeps shrinking with the dive depth, and the flight is a pure
// function of the creature's world Y and the depth: progress 0 at the
// consumption point, 1 once the anchor has descended PICKUP_FLIGHT_PX further.
// Nothing here is timed, stored or fed back — boost, multiplier and the chime
// keep their engine timing. A frame that jumps more than PICKUP_FLIGHT_PX of
// depth past the consumption point (only possible on a 3-tick catch-up frame
// at full speed and boost) shows no flight at all, as before S2.1.

/**
 * Collection-flight progress of a consumed goldfish at world Y
 * `creatureWorldY` when the dive depth is `worldY`: 0 (at its own position,
 * where the engine consumed it) to 1 (inside the anchor, gone).
 */
export function pickupProgress(creatureWorldY: number, worldY: number): number {
  const ahead = creatureWorldY - (worldY + ANCHOR_WORLD_OFFSET_PX);
  const p = (PICKUP_START_DY_PX - ahead) / PICKUP_FLIGHT_PX;
  if (!(p > 0)) return 0;
  return p < 1 ? p : 1;
}

/**
 * Share (0..1) of the way from the fish's own position to the anchor at
 * flight progress `p` (smootherstep). The flight never starts at exactly 0 —
 * the consuming tick has already moved the anchor up to one tick past the
 * threshold — so the curve is flat to second order there, keeping the first
 * flight frame within a fraction of a pixel of the fish's own position at
 * normal speeds.
 */
export function pickupBlend(p: number): number {
  if (!(p > 0)) return 0;
  if (!(p < 1)) return 1;
  return p * p * p * (p * (6 * p - 15) + 10);
}

/** Size factor of the flying fish at flight progress `p`: 1 at the start, shrinking smoothly to 0. */
export function pickupScale(p: number): number {
  const e = pickupBlend(p);
  return 1 - e * e;
}

/** Camera presentation offset (px) at depth `worldY`: shifts the ship into view, eased out by the launch. */
export function presentationOffsetY(worldY: number, w: number, h: number): number {
  const shift = presentedShipRestY(w, h) - shipRestScreenY(h);
  if (!(shift > 0)) return 0;
  return shift * (1 - launchProgress(worldY, w, h));
}
