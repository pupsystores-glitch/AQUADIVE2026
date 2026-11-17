// Landing silt plume — F5 (Phase 7 step V4; docs/08 §4.3, owner decisions
// D1–D4, 2026-11-17).
//
// When the jackpot anchor touches the sand, a few soft puffs of sediment
// spread sideways from the contact point, drift up a little and fade. The
// effect is a pure function of its arguments: the time since the touchdown
// (`age`, seconds), the contact point on screen and the renderer's read-only
// FX settings. There is no Math.random, no timer and no state besides caches
// that never change what is drawn:
//
// - the puff table, built once at module load from an integer hash. Puffs
//   alternate sides, so its first half (the Low-quality set) is balanced too;
// - the layout buffer each frame is written into (reused, no allocation);
// - one unit-space radial gradient per canvas context. Each puff is the same
//   gradient placed and stretched by the transform, so nothing is created
//   per frame and no blur or filter is involved.
//
// Timing (owner decision D1): age 0 is the moment the drawn anchor stands on
// the sand — layers/actor.ts anchorTouchdown, the same instant the floor-thud
// hit is timed on — not the engine's earlier shipImpact. The plume is drawn
// for 0 ≤ age < SILT_PLUME_LIFE (D2: about 1 s, provisional) and is exactly
// absent outside it. Scope (D3) is the Effects layer's job: it calls this
// only for the jackpot sea-floor landing.
//
// Reduced motion: one static puff at the contact point that only fades.
//
// Every value here is provisional until the owner's visual review.

import type { FxSettings } from "../render-state";
import { SILT_FX_THEME } from "../theme";

/** Plume lifetime from touchdown (seconds; owner decision D2, provisional). */
export const SILT_PLUME_LIFE = 1.0;
/** Puff cap at High quality. */
export const SILT_PLUME_MAX = 12;
/** Puff cap at Low quality: the first half of the same table. */
export const SILT_PLUME_MAX_LOW = 6;
/** Peak alpha range of a puff before its envelope. */
export const SILT_PUFF_ALPHA_MIN = 0.36;
export const SILT_PUFF_ALPHA_MAX = 0.52;
/** Horizontal radius range (CSS px) at birth and at the end of the life. */
export const SILT_PUFF_RADIUS_START_MIN = 7;
export const SILT_PUFF_RADIUS_START_MAX = 11;
export const SILT_PUFF_RADIUS_END_MIN = 18;
export const SILT_PUFF_RADIUS_END_MAX = 30;
/** Vertical / horizontal radius: puffs hug the sand. */
export const SILT_PUFF_FLATNESS = 0.55;
/** Sideways spread (CSS px) over the life, and the start offset from the contact. */
export const SILT_PUFF_REACH_MIN = 16;
export const SILT_PUFF_REACH_MAX = 60;
const START_SIDE_MIN = 1;
const START_SIDE_MAX = 7;
/** Upward drift (CSS px) over the life; the start height above the sand. */
export const SILT_PUFF_RISE_MIN = 3;
export const SILT_PUFF_RISE_MAX = 14;
const START_ABOVE_MIN = 2;
const START_ABOVE_MAX = 5;
/** Birth delay range (seconds): the puffs leave the contact in a short ripple, not at once. */
export const SILT_PUFF_DELAY_MAX = 0.12;
/** Share of a puff's life spent fading in. */
const FADE_IN = 0.12;
/** Fade-out exponent: (1 - life)^FADE_OUT. */
const FADE_OUT = 1.1;

/** Reduced motion: the single static puff (radius CSS px, height above the sand, peak alpha). */
export const SILT_STATIC_RADIUS = 20;
export const SILT_STATIC_ABOVE = 4;
export const SILT_STATIC_ALPHA = 0.4;

/** Layout buffer stride: x, y, rx, ry, alpha (final). */
export const SILT_PUFF_STRIDE = 5;

/** Below this opacity (under one 8-bit alpha step) a puff is skipped. */
const MIN_ALPHA = 1 / 255;

// Puff table stride: side, start side offset, start height, reach, rise,
// start radius, end radius, peak alpha, delay.
const PUFF_STRIDE = 9;

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

function smoothstep01(t: number): number {
  if (!(t > 0)) return 0; // also NaN
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function buildPuffs(): Float32Array {
  const table = new Float32Array(SILT_PLUME_MAX * PUFF_STRIDE);
  for (let i = 0; i < SILT_PLUME_MAX; i++) {
    const o = i * PUFF_STRIDE;
    // Alternating sides; per side, the reach follows a golden-ratio sequence,
    // so every prefix mixes near and far puffs on both sides.
    table[o] = i & 1 ? 1 : -1;
    table[o + 1] = mix(START_SIDE_MIN, START_SIDE_MAX, hash01(i, 31));
    table[o + 2] = mix(START_ABOVE_MIN, START_ABOVE_MAX, hash01(i, 32));
    table[o + 3] = mix(SILT_PUFF_REACH_MIN, SILT_PUFF_REACH_MAX, frac((i >> 1) * 0.618034 + 0.2));
    table[o + 4] = mix(SILT_PUFF_RISE_MIN, SILT_PUFF_RISE_MAX, hash01(i, 34));
    table[o + 5] = mix(SILT_PUFF_RADIUS_START_MIN, SILT_PUFF_RADIUS_START_MAX, hash01(i, 35));
    table[o + 6] = mix(SILT_PUFF_RADIUS_END_MIN, SILT_PUFF_RADIUS_END_MAX, hash01(i, 36));
    table[o + 7] = mix(SILT_PUFF_ALPHA_MIN, SILT_PUFF_ALPHA_MAX, hash01(i, 37));
    table[o + 8] = SILT_PUFF_DELAY_MAX * hash01(i, 38);
  }
  return table;
}

const PUFFS = buildPuffs();
const plumeOut = new Float32Array(SILT_PLUME_MAX * SILT_PUFF_STRIDE);

/** Number of puffs at a quality (the cap); reduced motion draws at most one. */
export function siltPlumeCount(fx: FxSettings): number {
  if (fx.reducedMotion) return 1;
  return fx.quality === "low" ? SILT_PLUME_MAX_LOW : SILT_PLUME_MAX;
}

/** Envelope of a puff at life fraction `life`: quick fade-in, long fade-out, exactly 0 outside [0, 1). */
export function siltPuffFade(life: number): number {
  if (!(life >= 0) || !(life < 1)) return 0;
  return smoothstep01(life / FADE_IN) * (1 - life) ** FADE_OUT;
}

/** True while the plume is alive: 0 ≤ age < SILT_PLUME_LIFE. */
export function siltPlumeActive(age: number): boolean {
  return age >= 0 && age < SILT_PLUME_LIFE;
}

/**
 * Lay the plume out for one frame into the reused buffer (siltPlumePuffs())
 * and return the number of puffs written (never more than the quality's cap,
 * one under reduced motion). `age` is seconds since the touchdown, (`cx`,
 * `cy`) the contact point on the sand. Nothing is laid out outside the
 * plume's life or for a non-finite input.
 */
export function layoutSiltPlume(age: number, cx: number, cy: number, fx: FxSettings): number {
  if (!siltPlumeActive(age) || !Number.isFinite(cx) || !Number.isFinite(cy)) return 0;

  if (fx.reducedMotion) {
    // One static puff: no drift, no growth; it only fades.
    const a = SILT_STATIC_ALPHA * (1 - age / SILT_PLUME_LIFE);
    if (!(a >= MIN_ALPHA)) return 0;
    plumeOut[0] = cx;
    plumeOut[1] = cy - SILT_STATIC_ABOVE;
    plumeOut[2] = SILT_STATIC_RADIUS;
    plumeOut[3] = SILT_STATIC_RADIUS * SILT_PUFF_FLATNESS;
    plumeOut[4] = a;
    return 1;
  }

  const count = siltPlumeCount(fx);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const s = i * PUFF_STRIDE;
    const delay = PUFFS[s + 8];
    const life = (age - delay) / (SILT_PLUME_LIFE - delay);
    const alpha = PUFFS[s + 7] * siltPuffFade(life);
    if (!(alpha >= MIN_ALPHA)) continue;
    // Ease-out: pushed out fast by the impact, then slowed by the water.
    const spread = 1 - (1 - life) * (1 - life);
    const side = PUFFS[s];
    const rx = mix(PUFFS[s + 5], PUFFS[s + 6], spread);
    const o = n * SILT_PUFF_STRIDE;
    plumeOut[o] = cx + side * (PUFFS[s + 1] + PUFFS[s + 3] * spread);
    plumeOut[o + 1] = cy - PUFFS[s + 2] - PUFFS[s + 4] * Math.sqrt(life);
    plumeOut[o + 2] = rx;
    plumeOut[o + 3] = rx * SILT_PUFF_FLATNESS;
    plumeOut[o + 4] = alpha;
    n++;
  }
  return n;
}

/** The layout buffer written by layoutSiltPlume (stride SILT_PUFF_STRIDE). Reused every frame. */
export function siltPlumePuffs(): Float32Array {
  return plumeOut;
}

// ----- Drawing -----

/** Unit-space gradient stops: (position, alpha). Soft core, no hard edge. */
const GRADIENT_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.35, 0.7],
  [0.7, 0.25],
  [1, 0],
];

const puffGradients = new WeakMap<object, CanvasGradient>();

function puffGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = puffGradients.get(ctx);
  if (g === undefined) {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [p, a] of GRADIENT_STOPS) g.addColorStop(p, SILT_FX_THEME.silt(a));
    puffGradients.set(ctx, g);
  }
  return g;
}

/**
 * F5: draw the silt plume (layoutSiltPlume's arguments). Issues no call at
 * all outside the plume's life. Each puff is the cached unit gradient,
 * translated and stretched to its ellipse; its opacity is one globalAlpha.
 * Leaves the context state as found.
 */
export function drawSiltPlume(
  ctx: CanvasRenderingContext2D,
  age: number,
  cx: number,
  cy: number,
  fx: FxSettings,
): void {
  const n = layoutSiltPlume(age, cx, cy, fx);
  if (n === 0) return;
  const gradient = puffGradient(ctx);
  ctx.save();
  ctx.fillStyle = gradient;
  for (let i = 0; i < n; i++) {
    const o = i * SILT_PUFF_STRIDE;
    ctx.save();
    ctx.translate(plumeOut[o], plumeOut[o + 1]);
    ctx.scale(plumeOut[o + 2], plumeOut[o + 3]);
    ctx.globalAlpha = plumeOut[o + 4];
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  ctx.restore();
}
