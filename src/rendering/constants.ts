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
export const SHIP_CULL_MARGIN_TOP = 120;

/** Chain length (px) between the hull attachment and the anchor's ring while the anchor rests under the ship. */
export const ANCHOR_REST_CHAIN_PX = 58;

/** Shortest dive depth (world px) over which the anchor eases from its rest pose to its pinned pose. */
export const ANCHOR_LAUNCH_MIN_RANGE_PX = 140;

/**
 * Highest screen Y (px) of the surface ship's origin before the dive. On a
 * viewport shorter than 820 px the camera's pinned anchor point would put the
 * ship higher (partly above the top edge), so the pre-dive view is shifted
 * down until the ship sits here — 0.55 · 820 − 400, its position on an
 * 820 px viewport. The shift eases out during the anchor's launch.
 */
export const SHIP_REST_MIN_Y = 51;

/** Anchor pendulum before the dive: main swing (rad) and its angular speed (rad/s). */
export const ANCHOR_REST_SWING = 0.15;
export const ANCHOR_REST_SWING_SPEED = 1.3;
/** A slower secondary swing (rad) so the pendulum never looks mechanical. */
export const ANCHOR_REST_SWING_2 = 0.05;
