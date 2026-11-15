// Pure presentation constants (docs/06_ENGINE_ARCHITECTURE.md §4 constants
// ownership: presentation values move under src/rendering). Byte-identical
// to their previous homes in src/game/config.ts and src/game/constants.ts
// (Sprint 3, Commit E2). Background palette colors moved to theme.ts, the
// white-label boundary, in the same commit.

/** Device pixel ratio cap for the canvas backing store. */
export const MAX_DPR = 2;

/** Anchor's fixed vertical position on screen (fraction of canvas height). */
export const ANCHOR_SCREEN_Y_FRAC = 0.55;

/** Drawn height of the anchor sprite on screen (px). */
export const ANCHOR_DRAW_H = 155;

/** Ring center vertical position within the anchor sprite (fraction of image height). */
export const ANCHOR_RING_Y_FRAC = 0.135;

/** Ship-impact jackpot FX lifetime (seconds); pairs with SHIP_IMPACT_TO_CHESTS_MS. */
export const SHIP_IMPACT_FX_SECONDS = 1.4;

// ----- Surface ship + pre-dive anchor presentation (layers/presentation.ts) -----

/**
 * Chain attachment (the hull's hawse hole) below the ship's screen origin (px).
 * Equal to the chain's previous top offset, so once the ship is off screen the
 * chain path is exactly what it was.
 */
export const SHIP_CHAIN_ATTACH_DY = 40;

/** Top culling margin of the surface ship (px): it is drawn until its origin is this far above the top edge. */
export const SHIP_CULL_MARGIN_TOP = 135;
// E-X6 S2 (was 120): with a presentation shift the ship is culled before its
// launch is complete, still bobbing. The rescue boat's lowest point lies
// attachDy + keel (40 + 78.3) below its origin, plus up to 6 px of heave and
// 9.5 px of roll at the bow — 134 px — so at 135 it is off screen when culled.

/**
 * Chain length (px) between the hull attachment and the anchor's ring while
 * the anchor rests under a full-size ship: the hull below the attachment
 * (ANCHOR_REST_CHAIN_HULL_PX, which shrinks with the ship's scale) plus a
 * fixed clearance under the keel. E-X6 S2: the rescue boat's keel lies
 * 78.26 px below its chain hole (SHIP_GEOMETRY.keelDepth), so the hull part
 * is 78 and the chain 92, keeping the previous 14 px clearance (was 44 / 58).
 */
export const ANCHOR_REST_CHAIN_PX = 92;
export const ANCHOR_REST_CHAIN_HULL_PX = 78;

/**
 * How far (px) the chain's end reaches below the top of the anchor's shackle
 * ring. The chain is drawn over the anchor, so its last link visibly hooks
 * over the ring's top bar.
 */
export const CHAIN_RING_GRIP_PX = 4;

/** Shortest dive depth (world px) over which the anchor eases from its rest pose to its pinned pose. */
export const ANCHOR_LAUNCH_MIN_RANGE_PX = 140;

/**
 * Pre-dive ship placement (E-X6 S2, layers/presentation.ts). The rescue boat
 * is far taller than the previous hull, so its rest position is computed from
 * its measured geometry (draw/ship.ts SHIP_GEOMETRY) instead of a fixed Y:
 *
 * - SHIP_REST_TOP_MARGIN: gap (px) kept between the top edge and the mast top
 *   at the highest point of its bob, wherever the resting anchor allows it.
 * - SHIP_REST_HUD_BOTTOM: bottom (logical px) of the multiplier readout in the
 *   top-left HUD lane on phone scenes. The bow rail, the highest part of the
 *   ship's left half, rests below it (the previous ship's phone test pinned
 *   the same 110–113 px clearance).
 */
export const SHIP_REST_TOP_MARGIN = 8;
export const SHIP_REST_HUD_BOTTOM = 113;

// ----- Goldfish collection flight (E-X6 S2.1, layers/presentation.ts) -----

/**
 * Vertical distance (world px) ahead of the anchor's collision point at which
 * the engine consumes a goldfish: a renderer-side mirror of the engine's
 * COLLISION_DY_PX (pinned equal by layers/pickup.test.ts; the renderer never
 * imports the engine). The collection flight starts here.
 */
export const PICKUP_START_DY_PX = 28;

/** Dive depth (world px) over which a consumed goldfish flies into the anchor and shrinks away. */
export const PICKUP_FLIGHT_PX = 56;

/** Anchor pendulum before the dive: main swing (rad) and its angular speed (rad/s). */
export const ANCHOR_REST_SWING = 0.15;
export const ANCHOR_REST_SWING_SPEED = 1.3;
/** A slower secondary swing (rad) so the pendulum never looks mechanical. */
export const ANCHOR_REST_SWING_2 = 0.05;
