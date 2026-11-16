// Ambient depth FX — F1 marine snow and F2 depth vignette (Phase 7 step V2;
// docs/08 §4.3, owner decisions D-V2-1 … D-V2-6).
//
// Both effects are pure functions of their arguments: viewport size, the
// view's depth, the animation clock (RenderTime.animTime) and the renderer's
// read-only FX settings. There is no Math.random, no timer, no loop of their
// own and no state besides two caches that never change what is drawn:
//
// - the speck table, built once at module load from an integer hash and a
//   low-discrepancy sequence (so any prefix of it — the Low-quality half —
//   still covers the viewport evenly);
// - the layout buffer the specks are written into each frame (reused, so a
//   frame allocates nothing);
// - one vignette gradient per canvas context. The gradient lives in a unit
//   space (the viewport mapped to [-1, 1]²), so its geometry never depends
//   on the viewport size: it is created once per context and reused across
//   resizes; the ellipse comes from the transform at fill time.
//
// Both effects are exactly absent at depthRatio 0 (D-V2-4): no draw call is
// issued, so the surface and the betting view are unchanged.
//
// Every intensity and motion value here is provisional until the owner's
// visual review (D-V2-6). V2 refinement (2026-11-16): the first values were
// barely perceptible; F1 alpha, radius and fade depth and F2 strength, fade
// depth, clear centre, falloff and tone were raised to the owner's
// provisional "Balanced" set.

import type { FxSettings } from "../render-state";
import { DEPTH_FX_THEME } from "../theme";

/** SceneRenderer's defaults (V1): used only when a layer is rendered without an FX argument. Frozen. */
export const DEFAULT_FX_SETTINGS: FxSettings = Object.freeze({
  reducedMotion: false,
  quality: "high",
});

// ----- F1 marine snow -----

/** Speck cap at High quality (D-V2-5). */
export const MARINE_SNOW_MAX = 48;
/** Speck cap at Low quality (D-V2-5): the first half of the same table. */
export const MARINE_SNOW_MAX_LOW = 24;
/** Speck alpha range before the depth fade. */
export const MARINE_SNOW_ALPHA_MIN = 0.18;
export const MARINE_SNOW_ALPHA_MAX = 0.4;
/** Speck radius range, CSS px. */
export const MARINE_SNOW_RADIUS_MIN = 1.1;
export const MARINE_SNOW_RADIUS_MAX = 2.2;
/** Sinking speed range, CSS px per second of animation time. */
export const MARINE_SNOW_SINK_MIN = 3;
export const MARINE_SNOW_SINK_MAX = 6;
/** World-scroll parallax factor range at High quality (1 would move with the world). */
export const MARINE_SNOW_PARALLAX_MIN = 0.25;
export const MARINE_SNOW_PARALLAX_MAX = 0.5;
/** Parallax multiplier under reduced motion (D-V2-3: static composition, reduced parallax). */
export const MARINE_SNOW_REDUCED_PARALLAX = 0.5;
/** Horizontal sway: amplitude range (CSS px) and angular speed range (rad/s). */
export const MARINE_SNOW_SWAY_MIN = 2;
export const MARINE_SNOW_SWAY_MAX = 6;
export const MARINE_SNOW_SWAY_SPEED_MIN = 0.25;
export const MARINE_SNOW_SWAY_SPEED_MAX = 0.6;
/** depthRatio at which the snow reaches full visibility; it is exactly invisible at 0. */
export const MARINE_SNOW_FULL_DEPTH = 0.1;
/** Off-screen margin (CSS px) of the wrap area, so a speck never pops at an edge. */
export const MARINE_SNOW_WRAP_MARGIN = 4;

/** Layout buffer stride: x, y, radius, alpha (before the depth fade). */
export const MARINE_SNOW_STRIDE = 4;

// Speck table stride: u, v, alpha, radius, sink, parallax, sway amplitude, sway speed, sway phase.
const SPECK_STRIDE = 9;

/** Deterministic integer hash of (index, salt) to [0, 1). */
function hash01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (v: number) => v - Math.floor(v);

function buildSpecks(): Float32Array {
  const table = new Float32Array(MARINE_SNOW_MAX * SPECK_STRIDE);
  for (let i = 0; i < MARINE_SNOW_MAX; i++) {
    const o = i * SPECK_STRIDE;
    // R2 low-discrepancy sequence: every prefix covers the unit square evenly.
    table[o] = frac((i + 0.5) * 0.7548776662466927);
    table[o + 1] = frac((i + 0.5) * 0.5698402909980532);
    table[o + 2] = mix(MARINE_SNOW_ALPHA_MIN, MARINE_SNOW_ALPHA_MAX, hash01(i, 1));
    table[o + 3] = mix(MARINE_SNOW_RADIUS_MIN, MARINE_SNOW_RADIUS_MAX, hash01(i, 2));
    table[o + 4] = mix(MARINE_SNOW_SINK_MIN, MARINE_SNOW_SINK_MAX, hash01(i, 3));
    table[o + 5] = mix(MARINE_SNOW_PARALLAX_MIN, MARINE_SNOW_PARALLAX_MAX, hash01(i, 4));
    table[o + 6] = mix(MARINE_SNOW_SWAY_MIN, MARINE_SNOW_SWAY_MAX, hash01(i, 5));
    table[o + 7] = mix(MARINE_SNOW_SWAY_SPEED_MIN, MARINE_SNOW_SWAY_SPEED_MAX, hash01(i, 6));
    table[o + 8] = hash01(i, 7) * Math.PI * 2;
  }
  return table;
}

const SPECKS = buildSpecks();
const snowOut = new Float32Array(MARINE_SNOW_MAX * MARINE_SNOW_STRIDE);

const positiveMod = (v: number, span: number) => v - Math.floor(v / span) * span;

function smoothstep01(t: number): number {
  if (!(t > 0)) return 0; // also NaN
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Depth fade of the marine snow: exactly 0 at depthRatio 0, smooth, 1 from MARINE_SNOW_FULL_DEPTH on. */
export function marineSnowFade(depthRatio: number): number {
  return smoothstep01(depthRatio / MARINE_SNOW_FULL_DEPTH);
}

/** Number of specks drawn at a quality. */
export function marineSnowCount(fx: FxSettings): number {
  return fx.quality === "low" ? MARINE_SNOW_MAX_LOW : MARINE_SNOW_MAX;
}

/**
 * Lay the specks out for one frame into the reused buffer (marineSnowSpecks())
 * and return their count. Positions are fractions of the viewport, so the
 * composition scales with it; radii stay in CSS px.
 *
 * - High: sinking, sway and world-scroll parallax.
 * - Low: half the specks, no world-scroll parallax.
 * - Reduced motion: no time-driven term at all (the clock is ignored); the
 *   world-scroll parallax is kept at a reduced factor so depth still reads.
 */
export function layoutMarineSnow(
  w: number,
  h: number,
  worldY: number,
  animTime: number,
  fx: FxSettings,
): number {
  if (!(w > 0) || !(h > 0)) return 0;
  const t = fx.reducedMotion || !Number.isFinite(animTime) ? 0 : animTime;
  const scroll = Number.isFinite(worldY) ? worldY : 0;
  const parallaxScale =
    fx.quality === "low" ? 0 : fx.reducedMotion ? MARINE_SNOW_REDUCED_PARALLAX : 1;
  const spanX = w + 2 * MARINE_SNOW_WRAP_MARGIN;
  const spanY = h + 2 * MARINE_SNOW_WRAP_MARGIN;
  const count = marineSnowCount(fx);
  for (let i = 0; i < count; i++) {
    const s = i * SPECK_STRIDE;
    const o = i * MARINE_SNOW_STRIDE;
    const sway = Math.sin(t * SPECKS[s + 7] + SPECKS[s + 8]) * SPECKS[s + 6];
    // The world scrolls up as the anchor descends; the snow follows it more slowly.
    const dy = t * SPECKS[s + 4] - scroll * SPECKS[s + 5] * parallaxScale;
    snowOut[o] = positiveMod(SPECKS[s] * spanX + sway, spanX) - MARINE_SNOW_WRAP_MARGIN;
    snowOut[o + 1] = positiveMod(SPECKS[s + 1] * spanY + dy, spanY) - MARINE_SNOW_WRAP_MARGIN;
    snowOut[o + 2] = SPECKS[s + 3];
    snowOut[o + 3] = SPECKS[s + 2];
  }
  return count;
}

/** The layout buffer written by layoutMarineSnow (stride MARINE_SNOW_STRIDE). Reused every frame. */
export function marineSnowSpecks(): Float32Array {
  return snowOut;
}

/** F1: draw the marine snow. Issues no draw call at depthRatio 0. Leaves the context state as found. */
export function drawMarineSnow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  worldY: number,
  depthRatio: number,
  animTime: number,
  fx: FxSettings,
): void {
  const fade = marineSnowFade(depthRatio);
  if (fade <= 0) return;
  const count = layoutMarineSnow(w, h, worldY, animTime, fx);
  if (count === 0) return;
  ctx.save();
  ctx.fillStyle = DEPTH_FX_THEME.marineSnow;
  for (let i = 0; i < count; i++) {
    const o = i * MARINE_SNOW_STRIDE;
    ctx.globalAlpha = snowOut[o + 3] * fade;
    ctx.beginPath();
    ctx.arc(snowOut[o], snowOut[o + 1], snowOut[o + 2], 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ----- F2 depth vignette -----

/** Largest darkening, reached in the viewport corners at full depth. */
export const DEPTH_VIGNETTE_MAX = 0.6;
/** depthRatio at which the vignette reaches full strength; it is exactly absent at 0. */
export const DEPTH_VIGNETTE_FULL_DEPTH = 0.45;
/** Unit-space radius inside which nothing is darkened (1 = the middle of an edge). */
export const DEPTH_VIGNETTE_INNER = 0.3;
/** Unit-space radius of the corners. */
const VIGNETTE_OUTER = Math.SQRT2;
/** Colour stops between the inner radius and the corners; enough to hide the piecewise-linear steps. */
const VIGNETTE_STOPS = 12;

/** Vignette strength for a depth: exactly 0 at depthRatio 0, smooth, DEPTH_VIGNETTE_MAX when deep. */
export function depthVignetteIntensity(depthRatio: number): number {
  return DEPTH_VIGNETTE_MAX * smoothstep01(depthRatio / DEPTH_VIGNETTE_FULL_DEPTH);
}

/** Falloff exponent of the vignette profile (V2 refinement): p^1.6 — soft start, no ring. */
export const DEPTH_VIGNETTE_FALLOFF = 1.6;

/** Relative darkening at stop position p (0 = inner radius, 1 = corner): flat start, no ring. */
export function depthVignetteProfile(p: number): number {
  const t = p <= 0 ? 0 : p >= 1 ? 1 : p;
  return t ** DEPTH_VIGNETTE_FALLOFF;
}

const vignetteGradients = new WeakMap<object, CanvasGradient>();

function vignetteGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = vignetteGradients.get(ctx);
  if (g === undefined) {
    g = ctx.createRadialGradient(0, 0, DEPTH_VIGNETTE_INNER, 0, 0, VIGNETTE_OUTER);
    for (let i = 0; i <= VIGNETTE_STOPS; i++) {
      const p = i / VIGNETTE_STOPS;
      g.addColorStop(p, DEPTH_FX_THEME.vignette(depthVignetteProfile(p)));
    }
    vignetteGradients.set(ctx, g);
  }
  return g;
}

/**
 * F2: darken the viewport edges with depth. The cached unit-space gradient is
 * stretched to the viewport by the transform, which makes the vignette an
 * ellipse matched to any aspect ratio; the depth strength is one globalAlpha.
 * Issues no draw call at depthRatio 0. Leaves the context state as found.
 */
export function drawDepthVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  depthRatio: number,
): void {
  const intensity = depthVignetteIntensity(depthRatio);
  if (intensity <= 0 || !(w > 0) || !(h > 0)) return;
  const gradient = vignetteGradient(ctx);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / 2, h / 2);
  ctx.globalAlpha = intensity;
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
