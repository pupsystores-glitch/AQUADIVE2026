// Anchor touchdown on the sea floor, for the audio host (A-OWN.1).
//
// When the ship reaches the floor the engine emits `shipImpact`, and from that
// moment `RenderState.shipImpact.elapsed` counts simulation time. The renderer
// (`src/rendering/layers/actor.ts`, `applyLanding`) then lets the anchor sink
// its last stretch before it stands on the sand: that drop takes
// clamp(0.28 + drop / 650, 0.3, 0.7) seconds, where `drop` is the screen
// distance from the anchor's pinned centre to its standing centre beside the
// wreck (`src/rendering/draw/sea-floor-art.ts`, `seaFloorRestPoint`).
//
// This module repeats that arithmetic so the audio host can time the
// `floor-thud` on the touchdown. It changes nothing in the renderer and,
// like `scene-fit.ts`, imports only renderer constants and the shared world
// constants (docs/07 §6). The renderer-private values are copied below;
// `anchor-touchdown.test.ts` checks the result against the renderer's own
// `anchorPose`, so a change to the landing breaks that test instead of
// silently desynchronizing the sound.

import { ANCHOR_DRAW_H, ANCHOR_SCREEN_Y_FRAC } from "@/rendering/constants";
import { CHAIN_MAX_DEPTH } from "@/shared/world";

// Copies of renderer-private values (pinned by anchor-touchdown.test.ts).
/** actor.ts LAND_LEAN: the lean (rad) the anchor touches down with. */
const LAND_LEAN = 0.08;
/** actor.ts TIP_BELOW_CENTER: the sprite's bottom tip below its centre. */
const TIP_BELOW_CENTER = ANCHOR_DRAW_H * 0.452;
/** sea-floor-art.ts: artwork rows, the anchor's rest row, the wreck's centre column, the minimum scale. */
const ART_ROWS = 726;
const ART_REST_Y = 668;
const ART_SHIP_X = 640;
const ART_MIN_SCALE = 0.7;
/** actor.ts applyLanding: drop time = clamp(BASE + drop / PX_PER_S, MIN, MAX). */
const DROP_BASE_S = 0.28;
const DROP_PX_PER_S = 650;
const DROP_MIN_S = 0.3;
const DROP_MAX_S = 0.7;

/**
 * Seconds after `shipImpact` at which the drawn anchor stands on the sand,
 * for a `w` × `h` scene (the size given to `SceneRenderer.resize`) at dive
 * depth `worldY`. Null for an unusable size or depth.
 */
export function anchorTouchdownSeconds(w: number, h: number, worldY: number): number | null {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(worldY)) return null;
  const pinY = h * ANCHOR_SCREEN_Y_FRAC;
  // camera.worldToScreenY(CHAIN_MAX_DEPTH + ANCHOR_WORLD_OFFSET_PX) with the
  // camera on `worldY`; the presentation offset is 0 once the dive is under way.
  const floorY = pinY + (CHAIN_MAX_DEPTH - worldY);
  const scale = Math.max(ART_MIN_SCALE, w / (2 * ART_SHIP_X));
  const artTop = floorY + (1 - ANCHOR_SCREEN_Y_FRAC) * h - ART_ROWS * scale;
  const restY = artTop + ART_REST_Y * scale;
  const standY = restY - Math.cos(LAND_LEAN) * TIP_BELOW_CENTER;
  const drop = Math.max(0, standY - pinY);
  return Math.min(DROP_MAX_S, Math.max(DROP_MIN_S, DROP_BASE_S + drop / DROP_PX_PER_S));
}
