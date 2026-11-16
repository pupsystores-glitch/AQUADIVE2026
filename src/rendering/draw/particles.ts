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

//
// Phase 7 step V3 (owner decisions Q10/V3) appends F3, the anchor wake, and
// F4, the release splash, below. Both are pure functions of the dive depth
// and the geometry handed in, hidden under reduced motion, and use the same
// integer hash and reused buffers; nothing above them changed.

import type { FxSettings } from "../render-state";
import { DEPTH_FX_THEME, WAKE_FX_THEME } from "../theme";
import { WATERLINE } from "./ship";

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

// ----- F3 anchor wake (Phase 7 step V3, owner decisions Q10/V3) -----
//
// A short trail of tiny bubbles above the anchor's shackle ring, along the
// chain. Pure depth-driven rendering: bubble k is "emitted" at dive depth
// k · ANCHOR_WAKE_SPACING and lives for ANCHOR_WAKE_LIFE world px of further
// descent. Its age is therefore the depth descended since its emission, so
// nothing is stored, timed or spawned. On screen it sits above the ring by
// its age times (1 + its own rise factor): it is left behind in the water as
// the anchor descends (the world scrolls up past the pinned anchor) and rises
// a little on its own. The rise factors differ per bubble, so the trail is not
// a rigid grid — at a descent step close to the spacing (about 19 px per frame
// at full speed and boost) a regular grid would look frozen or strobe.
// Bubble identity is continuous: from one frame to the next a bubble moves by
// its own smooth amount, it fades in at the ring and fades out at the end of
// its life, so nothing pops.
//
// Horizontally a bubble follows the current chain line (the straight line from
// the chain's top to its end at the ring — the drawn chain stays within a few
// px of it), with a fixed side offset and a small wobble that is a function
// of its age. Every value is provisional until the owner's visual review.

/** Bubble cap at High quality (owner decision). */
export const ANCHOR_WAKE_MAX = 16;
/** Bubble cap at Low quality: every other emission of the same trail. */
export const ANCHOR_WAKE_MAX_LOW = 8;
/** Dive depth between two emissions (world px). */
export const ANCHOR_WAKE_SPACING = 20;
/** Lifetime of a bubble in descended depth (world px): exactly ANCHOR_WAKE_MAX alive at once. */
export const ANCHOR_WAKE_LIFE = ANCHOR_WAKE_MAX * ANCHOR_WAKE_SPACING;
/** Bubble radius range (CSS px) at birth; it grows by up to ANCHOR_WAKE_GROWTH as it rises. */
export const ANCHOR_WAKE_RADIUS_MIN = 0.9;
export const ANCHOR_WAKE_RADIUS_MAX = 1.85;
export const ANCHOR_WAKE_GROWTH = 0.18;
/** Bubble alpha range before the lifetime and launch fades. */
export const ANCHOR_WAKE_ALPHA_MIN = 0.28;
export const ANCHOR_WAKE_ALPHA_MAX = 0.42;
/** Own rise, as a fraction of the descended depth. */
export const ANCHOR_WAKE_RISE_MIN = 0.15;
export const ANCHOR_WAKE_RISE_MAX = 0.45;
/**
 * Side offset from the chain line (CSS px), alternating sides: just outside
 * the links (half a link is 5 px wide), so a bubble is not lost on the steel.
 */
export const ANCHOR_WAKE_SIDE_MIN = 7;
export const ANCHOR_WAKE_SIDE_MAX = 12;
/** Wobble amplitude (CSS px) and its angular rate per descended world px. */
export const ANCHOR_WAKE_WOBBLE = 1.4;
const WAKE_WOBBLE_RATE = 0.04;
/** Clear gap (CSS px) between the chain's end at the ring and the youngest bubble: the trail never covers the anchor. */
export const ANCHOR_WAKE_GAP = 8;
/** Share of the life spent fading in (at the ring). */
const WAKE_FADE_IN = 0.2;
/** Launch progress from which the trail fades in; it is full at launch 1. */
export const ANCHOR_WAKE_LAUNCH_START = 0.5;
/** While the ship is in view, bubbles fade out this far (CSS px) below the water surface and are never drawn above it. */
export const ANCHOR_WAKE_SURFACE_FADE = 10;
const WAKE_SURFACE_CLEAR = 2;

/** Layout buffer stride (wake and splash bubbles): x, y, radius, alpha (final). */
export const BUBBLE_STRIDE = 4;

/** Below this opacity (under one 8-bit alpha step) a bubble or ring is skipped. */
const MIN_ALPHA = 1 / 255;
/** Off-screen margin (CSS px) of the bubble cull. */
const BUBBLE_CULL = 4;

const wakeOut = new Float32Array(ANCHOR_WAKE_MAX * BUBBLE_STRIDE);

/** Number of wake bubbles alive at a quality (the cap). */
export function anchorWakeCount(fx: FxSettings): number {
  return fx.quality === "low" ? ANCHOR_WAKE_MAX_LOW : ANCHOR_WAKE_MAX;
}

/** Fade of the trail with the anchor's launch: 0 up to ANCHOR_WAKE_LAUNCH_START, smooth, 1 at launch 1. */
export function anchorWakeLaunchFade(launch: number): number {
  return smoothstep01((launch - ANCHOR_WAKE_LAUNCH_START) / (1 - ANCHOR_WAKE_LAUNCH_START));
}

/** Lifetime envelope of a bubble at life fraction `life` in [0, 1): fade in at the ring, long fade out. */
export function anchorWakeLifeFade(life: number): number {
  if (!(life >= 0) || !(life < 1)) return 0;
  const rest = 1 - life;
  return smoothstep01(life / WAKE_FADE_IN) * rest * Math.sqrt(rest);
}

/**
 * Lay the wake out for one frame into the reused buffer (anchorWakeBubbles())
 * and return the number of bubbles written (never more than the quality's
 * cap). Bubbles that are off screen, invisible, above the water surface or
 * faded out are left out.
 *
 * `surfaceY` is the water surface's screen Y while the ship is in view, or
 * -Infinity. Reduced motion lays out nothing (owner decision: hidden).
 */
export function layoutAnchorWake(
  worldY: number,
  chainStartX: number,
  chainStartY: number,
  chainEndX: number,
  chainEndY: number,
  launch: number,
  surfaceY: number,
  h: number,
  fx: FxSettings,
): number {
  if (fx.reducedMotion || !(worldY > 0) || !Number.isFinite(worldY) || !(h > 0)) return 0;
  const launchFade = anchorWakeLaunchFade(launch);
  if (launchFade <= 0) return 0;
  const step = fx.quality === "low" ? 2 : 1;
  const baseY = chainEndY - ANCHOR_WAKE_GAP;
  const spanY = chainStartY - chainEndY;
  const spanX = chainStartX - chainEndX;
  const newest = Math.floor(worldY / ANCHOR_WAKE_SPACING);
  let n = 0;
  for (let j = 0; j < ANCHOR_WAKE_MAX; j++) {
    const k = newest - j;
    if (k < 1) break;
    if (k % step !== 0) continue;
    const age = worldY - k * ANCHOR_WAKE_SPACING;
    const life = age / ANCHOR_WAKE_LIFE;
    let alpha =
      mix(ANCHOR_WAKE_ALPHA_MIN, ANCHOR_WAKE_ALPHA_MAX, hash01(k, 11)) *
      anchorWakeLifeFade(life) *
      launchFade;
    const y = baseY - age * (1 + mix(ANCHOR_WAKE_RISE_MIN, ANCHOR_WAKE_RISE_MAX, hash01(k, 12)));
    if (y < -BUBBLE_CULL || y > h + BUBBLE_CULL) continue;
    if (surfaceY > -Infinity) {
      alpha *= smoothstep01((y - surfaceY - WAKE_SURFACE_CLEAR) / ANCHOR_WAKE_SURFACE_FADE);
    }
    if (!(alpha >= MIN_ALPHA)) continue;
    // Along the chain line at this height (clamped to the chain), then off to one side.
    const u = spanY < 0 ? Math.min(1, Math.max(0, (y - chainEndY) / spanY)) : 0;
    const side = ((k >> 1) ^ k) & 1 ? 1 : -1;
    const x =
      chainEndX +
      spanX * u +
      side * mix(ANCHOR_WAKE_SIDE_MIN, ANCHOR_WAKE_SIDE_MAX, hash01(k, 13)) +
      Math.sin(age * WAKE_WOBBLE_RATE + hash01(k, 14) * Math.PI * 2) * ANCHOR_WAKE_WOBBLE;
    const o = n * BUBBLE_STRIDE;
    wakeOut[o] = x;
    wakeOut[o + 1] = y;
    wakeOut[o + 2] =
      mix(ANCHOR_WAKE_RADIUS_MIN, ANCHOR_WAKE_RADIUS_MAX, hash01(k, 15)) *
      (1 + ANCHOR_WAKE_GROWTH * life);
    wakeOut[o + 3] = alpha;
    n++;
  }
  return n;
}

/** The layout buffer written by layoutAnchorWake (stride BUBBLE_STRIDE). Reused every frame. */
export function anchorWakeBubbles(): Float32Array {
  return wakeOut;
}

function fillBubbles(ctx: CanvasRenderingContext2D, buffer: Float32Array, count: number): void {
  ctx.save();
  ctx.fillStyle = WAKE_FX_THEME.bubble;
  for (let i = 0; i < count; i++) {
    const o = i * BUBBLE_STRIDE;
    ctx.globalAlpha = buffer[o + 3];
    ctx.beginPath();
    ctx.arc(buffer[o], buffer[o + 1], buffer[o + 2], 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** F3: draw the anchor wake (layoutAnchorWake's arguments). No draw call when nothing is visible. Leaves the context state as found. */
export function drawAnchorWake(
  ctx: CanvasRenderingContext2D,
  worldY: number,
  chainStartX: number,
  chainStartY: number,
  chainEndX: number,
  chainEndY: number,
  launch: number,
  surfaceY: number,
  h: number,
  fx: FxSettings,
): void {
  const n = layoutAnchorWake(
    worldY,
    chainStartX,
    chainStartY,
    chainEndX,
    chainEndY,
    launch,
    surfaceY,
    h,
    fx,
  );
  if (n > 0) fillBubbles(ctx, wakeOut, n);
}

// ----- F4 release splash (Phase 7 step V3, owner decisions Q10/V3, option A) -----
//
// The anchor already hangs under water at rest, so the release is a subtle
// disturbance where the chain leaves the ship: a few bubbles puff out of the
// hawse hole and rise to the surface right above it, and two faint rings
// spread on the water there. Pure function of the dive depth: progress
// p = worldY / RELEASE_SPLASH_DEPTH over the first 120 world px (about 0.8 s
// at the initial descent speed), exactly absent at worldY 0 and from 120 on.
//
// The rings lie on the waterline the ship draws (draw/ship.ts: the surface
// polyline sampled every 8 px from the ship's centre, around the waterline
// WATERLINE below its origin scaled by shipScale), centred above the hole,
// and scale with the ship. Their lower half is drawn at full ring alpha; the
// upper half — the only part above the water, over the hull — at
// RELEASE_RING_UPPER of it. Bubbles are never drawn at or above the surface.

/** Dive depth (world px) over which the release splash plays. */
export const RELEASE_SPLASH_DEPTH = 120;
/** Bubble caps at High and Low quality. */
export const RELEASE_SPLASH_MAX = 8;
export const RELEASE_SPLASH_MAX_LOW = 4;
/** Number of ripple rings. */
export const RELEASE_RING_COUNT = 2;
/** Ring stride in the ring buffer: x, y, rx, ry, alpha (0 = not drawn). */
export const RELEASE_RING_STRIDE = 5;
/** Ring start progress, final horizontal radius (CSS px at ship scale 1) and peak alpha, per ring. */
const RING_START: readonly number[] = [0, 0.25];
const RING_SPAN = 0.75;
export const RELEASE_RING_RX_START = 4;
export const RELEASE_RING_RX_END: readonly number[] = [30, 46];
/** Peak alphas before the ring envelope (whose own peak is about 0.72): visible maxima about 0.36 and 0.29. */
export const RELEASE_RING_ALPHA: readonly number[] = [0.5, 0.4];
/** Vertical / horizontal radius: a flat ellipse lying on the water. */
export const RELEASE_RING_FLATNESS = 0.2;
/** Alpha factor of a ring's upper half (above the water line). */
export const RELEASE_RING_UPPER = 0.45;
/** Ring stroke width (CSS px). */
export const RELEASE_RING_WIDTH = 1.1;
/** Bubble start progress (first, step) and rise span in progress; radius and alpha ranges. */
const SPLASH_BUBBLE_START = 0.05;
const SPLASH_BUBBLE_STEP = 0.06;
const SPLASH_BUBBLE_SPAN = 0.3;
export const RELEASE_BUBBLE_RADIUS_MIN = 0.9;
export const RELEASE_BUBBLE_RADIUS_MAX = 1.9;
export const RELEASE_BUBBLE_ALPHA_MIN = 0.3;
export const RELEASE_BUBBLE_ALPHA_MAX = 0.42;
/** Side drift of a bubble at the surface (CSS px at ship scale 1). */
const SPLASH_BUBBLE_DRIFT_MIN = 1.5;
const SPLASH_BUBBLE_DRIFT_MAX = 6.5;
/** Bubbles start this far (CSS px at ship scale 1) below the hole's centre: they come out of it. */
const SPLASH_BUBBLE_BELOW_HOLE = 3;

// The ship's surface polyline (draw/ship.ts traceSurface): sample step, wave amplitude, rates.
const SURFACE_STEP = 8;
const SURFACE_WAVE = 2;
const SURFACE_WAVE_TIME = 1.5;
const SURFACE_WAVE_X = 0.08;

const splashOut = new Float32Array(RELEASE_SPLASH_MAX * BUBBLE_STRIDE);
const ringOut = new Float32Array(RELEASE_RING_COUNT * RELEASE_RING_STRIDE);

/** Release progress for a dive depth: in (0, 1) during the first RELEASE_SPLASH_DEPTH px, else 0 (inactive). */
export function releaseSplashProgress(worldY: number): number {
  if (!(worldY > 0) || !(worldY < RELEASE_SPLASH_DEPTH)) return 0;
  return worldY / RELEASE_SPLASH_DEPTH;
}

/**
 * Screen Y of the ship's still water surface: drawShip's `surfaceY` for a
 * ship whose origin is at `shipScreenY`, with the chain attachment `attachDy`
 * below it, drawn at `scale`.
 */
export function shipWaterlineY(shipScreenY: number, attachDy: number, scale: number): number {
  return shipScreenY + attachDy - (attachDy - WATERLINE) * scale;
}

/**
 * Screen Y of the drawn surface line at screen x `x`: the ship's polyline
 * (samples every 8 px from its centre `cx`, a 2 px wave on the clock `t`),
 * linearly interpolated between its two neighbouring samples — exactly the
 * stroked line.
 */
export function waterSurfaceAt(cx: number, waterlineY: number, t: number, x: number): number {
  const rel = x - cx;
  const x0 = Math.floor(rel / SURFACE_STEP) * SURFACE_STEP;
  const f = (rel - x0) / SURFACE_STEP;
  const y0 = Math.sin(t * SURFACE_WAVE_TIME + x0 * SURFACE_WAVE_X) * SURFACE_WAVE;
  const y1 = Math.sin(t * SURFACE_WAVE_TIME + (x0 + SURFACE_STEP) * SURFACE_WAVE_X) * SURFACE_WAVE;
  return waterlineY + y0 + (y1 - y0) * f;
}

/** Ring envelope at ring progress q in [0, 1]: quick smooth rise, slow fade, exactly 0 at both ends. */
function ringFade(q: number): number {
  if (!(q > 0) || !(q < 1)) return 0;
  const rest = 1 - q;
  return smoothstep01(q / 0.15) * rest * rest;
}

/**
 * Lay the release splash out for one frame: the rings into the reused ring
 * buffer (releaseSplashRings(), alpha 0 for a ring not drawn) and the bubbles
 * into the reused bubble buffer (releaseSplashBubbles()). Returns the bubble
 * count. Outside the release, or under reduced motion, nothing is laid out
 * and every ring alpha is 0.
 *
 * `holeX`/`holeY` is the hawse hole on screen (the chain's top), `cx` the
 * ship's centre (the surface polyline's origin), `waterlineY` the still
 * surface (shipWaterlineY), `t` the animation clock and `scale` shipScale.
 */
export function layoutReleaseSplash(
  worldY: number,
  holeX: number,
  holeY: number,
  cx: number,
  waterlineY: number,
  t: number,
  scale: number,
  fx: FxSettings,
): number {
  for (let i = 0; i < RELEASE_RING_COUNT; i++) ringOut[i * RELEASE_RING_STRIDE + 4] = 0;
  const p = fx.reducedMotion ? 0 : releaseSplashProgress(worldY);
  if (p <= 0 || !(scale > 0)) return 0;

  const surfaceAtHole = waterSurfaceAt(cx, waterlineY, t, holeX);
  for (let i = 0; i < RELEASE_RING_COUNT; i++) {
    const q = (p - RING_START[i]) / RING_SPAN;
    const a = RELEASE_RING_ALPHA[i] * ringFade(q);
    if (!(a >= MIN_ALPHA)) continue;
    const grow = 1 - (1 - q) * (1 - q); // ease out: spreads fast, then slows
    const rx = scale * mix(RELEASE_RING_RX_START, RELEASE_RING_RX_END[i], grow);
    const o = i * RELEASE_RING_STRIDE;
    ringOut[o] = holeX;
    ringOut[o + 1] = surfaceAtHole;
    ringOut[o + 2] = rx;
    ringOut[o + 3] = rx * RELEASE_RING_FLATNESS;
    ringOut[o + 4] = a;
  }

  const step = fx.quality === "low" ? 2 : 1;
  const startY = holeY + SPLASH_BUBBLE_BELOW_HOLE * scale;
  let n = 0;
  for (let i = 0; i < RELEASE_SPLASH_MAX; i += step) {
    const q = (p - (SPLASH_BUBBLE_START + i * SPLASH_BUBBLE_STEP)) / SPLASH_BUBBLE_SPAN;
    if (!(q > 0) || !(q < 1)) continue;
    const side = i & 2 ? 1 : -1;
    const drift = mix(SPLASH_BUBBLE_DRIFT_MIN, SPLASH_BUBBLE_DRIFT_MAX, hash01(i, 21)) * scale;
    const x = holeX + side * drift * (0.4 + 0.6 * q);
    const surface = waterSurfaceAt(cx, waterlineY, t, x);
    const y = startY + (surface - startY) * q ** 1.2;
    const r = mix(RELEASE_BUBBLE_RADIUS_MIN, RELEASE_BUBBLE_RADIUS_MAX, hash01(i, 22));
    if (!(y - r > surface)) continue; // never at or above the water surface
    const a =
      mix(RELEASE_BUBBLE_ALPHA_MIN, RELEASE_BUBBLE_ALPHA_MAX, hash01(i, 23)) *
      smoothstep01(q / 0.2) *
      (1 - smoothstep01((q - 0.75) / 0.25));
    if (!(a >= MIN_ALPHA)) continue;
    const o = n * BUBBLE_STRIDE;
    splashOut[o] = x;
    splashOut[o + 1] = y;
    splashOut[o + 2] = r;
    splashOut[o + 3] = a;
    n++;
  }
  return n;
}

/** The ring buffer written by layoutReleaseSplash (stride RELEASE_RING_STRIDE). Reused every frame. */
export function releaseSplashRings(): Float32Array {
  return ringOut;
}

/** The bubble buffer written by layoutReleaseSplash (stride BUBBLE_STRIDE). Reused every frame. */
export function releaseSplashBubbles(): Float32Array {
  return splashOut;
}

/** F4: draw the release splash (layoutReleaseSplash's arguments). No draw call outside the release. Leaves the context state as found. */
export function drawReleaseSplash(
  ctx: CanvasRenderingContext2D,
  worldY: number,
  holeX: number,
  holeY: number,
  cx: number,
  waterlineY: number,
  t: number,
  scale: number,
  fx: FxSettings,
): void {
  const n = layoutReleaseSplash(worldY, holeX, holeY, cx, waterlineY, t, scale, fx);
  let rings = false;
  for (let i = 0; i < RELEASE_RING_COUNT; i++) {
    if (ringOut[i * RELEASE_RING_STRIDE + 4] > 0) rings = true;
  }
  if (rings) {
    ctx.save();
    ctx.strokeStyle = WAKE_FX_THEME.ripple;
    ctx.lineWidth = RELEASE_RING_WIDTH;
    for (let i = 0; i < RELEASE_RING_COUNT; i++) {
      const o = i * RELEASE_RING_STRIDE;
      const a = ringOut[o + 4];
      if (!(a > 0)) continue;
      // Lower half (under the water line), then the faint upper half.
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(ringOut[o], ringOut[o + 1], ringOut[o + 2], ringOut[o + 3], 0, 0, Math.PI);
      ctx.stroke();
      ctx.globalAlpha = a * RELEASE_RING_UPPER;
      ctx.beginPath();
      ctx.ellipse(
        ringOut[o],
        ringOut[o + 1],
        ringOut[o + 2],
        ringOut[o + 3],
        0,
        Math.PI,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  if (n > 0) fillBubbles(ctx, splashOut, n);
}
