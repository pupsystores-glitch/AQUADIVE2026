// Scene fit — keeps the whole idle scene on short canvases (Sprint 4 QA fix,
// 2026-11-14). Framework-free and pure.
//
// The frozen renderer (src/rendering) pins the anchor at 55 % of the canvas
// height and draws the surface ship a fixed 400 px above the anchor's camera
// point (camera.worldToScreenY(SHIP_WORLD_Y) = 0.55·h − 400 at the dive
// start), at a fixed pixel size. On a canvas shorter than about 800 px the
// ship is therefore above the top edge: every phone stage (427 px at
// 375×667, 604 px at 390×844, with the Dual Bet panel) and the portrait
// tablet stage (694 px at 768×1024) never showed it.
//
// The fix lives on the host side of the renderer contract, where the session
// already chooses what to pass to `resize(width, height, dpr)`: below
// MIN_SCENE_HEIGHT the renderer is given a logical viewport MIN_SCENE_HEIGHT
// tall (same aspect ratio as the canvas) and a proportionally smaller pixel
// ratio. The backing store keeps the canvas's native size, so the result is a
// uniform zoom-out with no distortion and no loss of sharpness. Taller canvases
// (desktop at ≥ 820 px) pass through unchanged.
//
// The zoom-out never goes below MIN_SCENE_SCALE (owner request, 2026-11-14:
// phones should look like the iPad, at the cost of showing less height). A
// phone stage is therefore given a logical height below MIN_SCENE_HEIGHT, and
// the renderer's pre-dive presentation shifts the ship into view on such
// short viewports (src/rendering/layers/presentation.ts).

import { MAX_DPR } from "@/rendering/constants";

/**
 * The shortest logical scene height the renderer is given. At 820 the idle
 * ship's mast top (0.55·820 − 400 − 36) sits 15 px below the top edge, and the
 * anchor (pinned at 451, sprite reaching about 77 px below the pin) clears the
 * bottom edge.
 */
export const MIN_SCENE_HEIGHT = 820;

/**
 * The smallest zoom factor (logical px → CSS px) the fit applies: about the
 * portrait iPad's (694 / 820 ≈ 0.846), so phones look like the iPad. Stages
 * from 689 px up are unaffected (they reach MIN_SCENE_HEIGHT first).
 */
export const MIN_SCENE_SCALE = 0.84;

/** The logical height the renderer is given for a short stage of `cssHeight` CSS px. */
export function sceneHeightFor(cssHeight: number): number {
  return Math.min(MIN_SCENE_HEIGHT, cssHeight / MIN_SCENE_SCALE);
}

/** What the session passes to `renderer.resize(width, height, dpr)`. */
export interface SceneViewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

const bits = new DataView(new ArrayBuffer(8));

/** The adjacent double to a positive finite `x`, upward (+1) or downward (−1). */
const adjacent = (x: number, step: 1n | -1n): number => {
  bits.setFloat64(0, x);
  bits.setBigUint64(0, bits.getBigUint64(0) + step);
  return bits.getFloat64(0);
};

/**
 * A logical length whose product with `dpr` is exactly the integer `backing`.
 * The renderer sizes the backing store as `length × dpr` and compares that
 * product with the canvas size every frame, so an inexact product would reset
 * the canvas on every frame. Returns null if no nearby double qualifies.
 */
const exactLength = (backing: number, dpr: number): number | null => {
  let up = backing / dpr;
  let down = up;
  for (let i = 0; i < 8; i++) {
    if (up * dpr === backing) return up;
    if (down * dpr === backing) return down;
    up = adjacent(up, 1n);
    down = adjacent(down, -1n);
  }
  return null;
};

/**
 * The renderer viewport for a canvas of `cssWidth × cssHeight` CSS pixels at
 * `devicePixelRatio`. Unchanged at or above MIN_SCENE_HEIGHT and for an
 * unmeasured canvas (zero size); otherwise scaled so the logical height is
 * `sceneHeightFor(cssHeight)`, with the backing store at the canvas's native
 * resolution (the CSS size × the renderer's capped pixel ratio, rounded).
 */
export function fitScene(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): SceneViewport {
  const unchanged = { width: cssWidth, height: cssHeight, dpr: devicePixelRatio };
  if (!(cssWidth > 0) || !(cssHeight > 0) || cssHeight >= MIN_SCENE_HEIGHT) return unchanged;
  const ratio = Math.min(devicePixelRatio, MAX_DPR);
  if (!(ratio > 0)) return unchanged;
  const nativeWidth = Math.round(cssWidth * ratio);
  const nativeHeight = Math.round(cssHeight * ratio);
  if (nativeWidth < 2 || nativeHeight < 2) return unchanged;
  const target = sceneHeightFor(cssHeight);
  // Floating-point products do not always round-trip, so a small search finds
  // an exact pair: the neighbouring effective ratios (a few ulps away,
  // visually identical) and, rarely (about 0.06 % of sizes), a backing store
  // one device pixel off native, an invisible stretch. Exhaustively checked
  // over 240–2600 × 150–819 px at dpr 1 to 3 (scene-fit.test.ts samples it).
  for (const [dw, dh] of BACKING_NUDGES) {
    const backingWidth = nativeWidth + dw;
    const backingHeight = nativeHeight + dh;
    // The effective pixel ratio: logical px → backing px. Below `ratio`
    // (the logical height exceeds cssHeight), so the renderer's MAX_DPR
    // clamp never alters it.
    const ideal = backingHeight / target;
    let above = ideal;
    let below = ideal;
    for (let i = 0; i < 32; i++) {
      for (const dpr of i === 0 ? [ideal] : [above, below]) {
        const width = exactLength(backingWidth, dpr);
        const height = width === null ? null : exactLength(backingHeight, dpr);
        if (width !== null && height !== null) return { width, height, dpr };
      }
      above = adjacent(above, 1n);
      below = adjacent(below, -1n);
    }
  }
  return unchanged;
}

/** Backing-store offsets (device px) tried in order: native first. */
const BACKING_NUDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];
