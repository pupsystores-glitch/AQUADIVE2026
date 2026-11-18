// Crash accent — F6 (Phase 7 step V5; docs/08 §4.3, owner decisions D1–D5,
// 2026-11-18).
//
// When the chain snaps, a few small steel fragments leave the break point,
// slow down in the water, sink a little and fade, while the viewport edges
// darken in one brief dark-blue pulse. The effect is a pure function of its
// arguments: the time since the break (`t`, seconds — the E-X7 chain-snap
// clock, RenderState.chainSnap.elapsed, never a clock of its own), the break
// point on screen, the viewport size and the renderer's read-only FX
// settings. There is no Math.random, no timer and no state besides caches
// that never change what is drawn:
//
// - the fragment table, built once at module load from an integer hash.
//   Directions follow the golden angle, so its first half (the Low-quality
//   set) is spread evenly around the break too;
// - the layout buffer each frame is written into (reused, no allocation);
// - two unit-space radial gradients per canvas context (the pulse and the
//   reduced-motion accent), placed and stretched by the transform. Nothing is
//   created per frame; no shadowBlur and no filter;
// - the pulse bitmap (V5 refinement, 2026-11-18): the pulse's gradient
//   rasterized once into an offscreen canvas of the target canvas's own
//   pixel size, then copied 1:1 with the pulse strength as globalAlpha. A
//   full-viewport radial-gradient fill evaluates the gradient for every
//   device pixel on every frame (~18 ms at 1920×1080 in software raster); a
//   same-size bitmap copy is a plain blend (~1.6 ms). Rebuilt only when the
//   canvas's pixel size changes (resize, DPR); kept per canvas context
//   (WeakMap), so it goes with the renderer. A scaled-up low-resolution
//   bitmap was measured too: any scaled copy takes the filtered path and
//   saves only about a third. Without a document (tests, SSR), an
//   OffscreenCanvas target or above CRASH_PULSE_CACHE_MAX_PIXELS, the
//   gradient is filled directly as before.
//
// D1 (camera): no Canvas camera shake. This module never moves the viewport;
// the reserved shake hook (fx-queue.ts cameraShakeOffset) stays at 0 and the
// DOM multiplier `crash-shake` is untouched.
//
// Reduced motion (D4): no fragments and no pulse; one small static glint at
// the break point that only fades.

import type { FxSettings } from "../render-state";

// ----- Timing -----

/** Fragment lifetime cap from the break (seconds). Each fragment ends between 0.5 and this. */
export const CRASH_FRAGMENT_LIFE = 0.7;
/** Vignette pulse lifetime from the break (seconds). */
export const CRASH_PULSE_LIFE = 0.6;
/** Rise time of the pulse (seconds). */
export const CRASH_PULSE_ATTACK = 0.07;
/** Reduced motion: the static accent's lifetime (seconds). */
export const CRASH_STATIC_LIFE = 0.6;
/** Nothing of F6 is drawn from here on (seconds after the break). */
export const CRASH_FX_LIFE = Math.max(CRASH_FRAGMENT_LIFE, CRASH_PULSE_LIFE, CRASH_STATIC_LIFE);

// ----- Fragments -----

/** Fragment cap at High quality (D2). */
export const CRASH_FRAGMENT_MAX = 12;
/** Fragment cap at Low quality (D2): the first half of the same table. */
export const CRASH_FRAGMENT_MAX_LOW = 6;
/** Distance (CSS px) a fragment travels outward before the water stops it. */
export const CRASH_FRAGMENT_REACH_MIN = 14;
export const CRASH_FRAGMENT_REACH_MAX = 34;
/** Drag time constant of the outward motion (seconds). */
const DRAG_TAU_MIN = 0.09;
const DRAG_TAU_MAX = 0.15;
/** Sinking (CSS px) by the end of a fragment's life. */
export const CRASH_FRAGMENT_SINK_MAX = 9;
const SINK_MIN = 3;
/** Shard size (CSS px): length and width. */
export const CRASH_FRAGMENT_LENGTH_MIN = 2.4;
export const CRASH_FRAGMENT_LENGTH_MAX = 4.4;
const WIDTH_MIN = 1.0;
const WIDTH_MAX = 1.5;
/** Peak alpha range of a fragment's body. */
export const CRASH_FRAGMENT_ALPHA_MIN = 0.7;
export const CRASH_FRAGMENT_ALPHA_MAX = 0.9;
/** Per-fragment life range (seconds), so they do not all vanish together. */
const LIFE_MIN = 0.5;
/** Fade-out exponent: (1 - life)^FADE_OUT. */
const FADE_OUT = 1.4;
/** Spin: initial rate range (rad/s, sign alternates) and its decay (seconds). */
const SPIN_MIN = 5;
const SPIN_MAX = 11;
const SPIN_TAU = 0.35;
/** Highlight: share of the shard's width that carries the glint, and its floor. */
const GLINT_SHARE = 0.45;
const GLINT_FLOOR = 0.2;

/** Layout buffer stride: x, y, angle, length, width, body alpha, glint alpha. */
export const CRASH_FRAGMENT_STRIDE = 7;

/** Below this opacity (under one 8-bit alpha step) a draw is skipped. */
const MIN_ALPHA = 1 / 255;

/** Steel-blue body and the metallic highlight (D2: subtle, no sparks). */
export const CRASH_FRAGMENT_BODY = "rgb(112, 138, 168)";
export const CRASH_FRAGMENT_GLINT = "rgb(214, 228, 244)";

// ----- Vignette pulse -----

/** Largest darkening, in the viewport corners, at the pulse's peak (D3: restrained). */
export const CRASH_PULSE_PEAK = 0.26;
/** Unit-space radius inside which nothing is darkened (1 = the middle of an edge). */
export const CRASH_PULSE_INNER = 0.55;
const PULSE_OUTER = Math.SQRT2;
const PULSE_STOPS = 12;
const PULSE_FALLOFF = 1.6;
/** Dark blue, rgb. */
export const CRASH_PULSE_TONE: readonly number[] = [2, 12, 34];
/**
 * Largest canvas (device pixels) the pulse bitmap is kept for: 1920×1080 at
 * the renderer's DPR cap of 2, about 33 MB. Larger canvases fill the gradient
 * directly instead of holding a bigger bitmap.
 */
export const CRASH_PULSE_CACHE_MAX_PIXELS = 3840 * 2160;

// ----- Reduced motion accent -----

/** The static glint (radius CSS px, peak alpha). */
export const CRASH_STATIC_RADIUS = 10;
export const CRASH_STATIC_ALPHA = 0.3;
/** Glint tone, rgb (the fragments' highlight family). */
const STATIC_TONE: readonly number[] = [196, 214, 236];

// ----- Fragment table -----

// Stride: direction, reach, drag tau, sink, length, width, peak alpha, life,
// start angle, spin rate.
const TABLE_STRIDE = 10;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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

function smoothstep01(t: number): number {
  if (!(t > 0)) return 0; // also NaN
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function buildFragments(): Float64Array {
  const table = new Float64Array(CRASH_FRAGMENT_MAX * TABLE_STRIDE);
  for (let i = 0; i < CRASH_FRAGMENT_MAX; i++) {
    const o = i * TABLE_STRIDE;
    table[o] = i * GOLDEN_ANGLE + (hash01(i, 51) - 0.5) * 0.4;
    table[o + 1] = mix(CRASH_FRAGMENT_REACH_MIN, CRASH_FRAGMENT_REACH_MAX, hash01(i, 52));
    table[o + 2] = mix(DRAG_TAU_MIN, DRAG_TAU_MAX, hash01(i, 53));
    table[o + 3] = mix(SINK_MIN, CRASH_FRAGMENT_SINK_MAX, hash01(i, 54));
    table[o + 4] = mix(CRASH_FRAGMENT_LENGTH_MIN, CRASH_FRAGMENT_LENGTH_MAX, hash01(i, 55));
    table[o + 5] = mix(WIDTH_MIN, WIDTH_MAX, hash01(i, 56));
    table[o + 6] = mix(CRASH_FRAGMENT_ALPHA_MIN, CRASH_FRAGMENT_ALPHA_MAX, hash01(i, 57));
    table[o + 7] = mix(LIFE_MIN, CRASH_FRAGMENT_LIFE, hash01(i, 58));
    table[o + 8] = Math.PI * hash01(i, 59);
    table[o + 9] = (i & 1 ? 1 : -1) * mix(SPIN_MIN, SPIN_MAX, hash01(i, 60));
  }
  return table;
}

const FRAGMENTS = buildFragments();
const fragmentOut = new Float64Array(CRASH_FRAGMENT_MAX * CRASH_FRAGMENT_STRIDE);

/** Number of fragments at a quality (the cap); reduced motion draws none. */
export function crashFragmentCount(fx: FxSettings): number {
  if (fx.reducedMotion) return 0;
  return fx.quality === "low" ? CRASH_FRAGMENT_MAX_LOW : CRASH_FRAGMENT_MAX;
}

/** True while any part of F6 can still be drawn: 0 ≤ t < CRASH_FX_LIFE. */
export function crashFxActive(t: number): boolean {
  return t >= 0 && t < CRASH_FX_LIFE;
}

/**
 * Lay the fragments out for one frame into the reused buffer
 * (crashFragmentData()) and return how many were written (never more than
 * the quality's cap; none under reduced motion). `t` is seconds since the
 * break, (`bx`, `by`) the break point. Nothing is laid out outside the
 * fragments' life or for a non-finite input.
 */
export function layoutCrashFragments(t: number, bx: number, by: number, fx: FxSettings): number {
  if (!(t >= 0) || !(t < CRASH_FRAGMENT_LIFE)) return 0;
  if (!Number.isFinite(bx) || !Number.isFinite(by)) return 0;
  const count = crashFragmentCount(fx);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const s = i * TABLE_STRIDE;
    const lifeSpan = FRAGMENTS[s + 7];
    const life = t / lifeSpan;
    if (!(life < 1)) continue;
    const alpha = FRAGMENTS[s + 6] * (1 - life) ** FADE_OUT;
    if (!(alpha >= MIN_ALPHA)) continue;
    const dir = FRAGMENTS[s];
    // Water drag: thrown out fast, stopped within a fraction of a second.
    const out = FRAGMENTS[s + 1] * (1 - Math.exp(-t / FRAGMENTS[s + 2]));
    const sink = FRAGMENTS[s + 3] * life * life;
    const angle = FRAGMENTS[s + 8] + FRAGMENTS[s + 9] * SPIN_TAU * (1 - Math.exp(-t / SPIN_TAU));
    // The highlight (the shard's upper edge) catches the light from above
    // when the shard lies level, and dims as it turns on edge.
    const facing = Math.abs(Math.cos(angle));
    const glint = alpha * (GLINT_FLOOR + (1 - GLINT_FLOOR) * facing * facing * facing);
    const o = n * CRASH_FRAGMENT_STRIDE;
    fragmentOut[o] = bx + Math.cos(dir) * out;
    fragmentOut[o + 1] = by + Math.sin(dir) * out + sink;
    fragmentOut[o + 2] = angle;
    fragmentOut[o + 3] = FRAGMENTS[s + 4];
    fragmentOut[o + 4] = FRAGMENTS[s + 5];
    fragmentOut[o + 5] = alpha;
    fragmentOut[o + 6] = glint;
    n++;
  }
  return n;
}

/** The layout buffer written by layoutCrashFragments (stride CRASH_FRAGMENT_STRIDE). Reused every frame. */
export function crashFragmentData(): Float64Array {
  return fragmentOut;
}

/** Pulse strength (globalAlpha of the cached gradient): quick rise, eased decay, exactly 0 outside [0, life). */
export function crashPulseIntensity(t: number, fx: FxSettings): number {
  if (fx.reducedMotion || !(t >= 0) || !(t < CRASH_PULSE_LIFE)) return 0;
  if (t < CRASH_PULSE_ATTACK) return CRASH_PULSE_PEAK * smoothstep01(t / CRASH_PULSE_ATTACK);
  const d = 1 - (t - CRASH_PULSE_ATTACK) / (CRASH_PULSE_LIFE - CRASH_PULSE_ATTACK);
  return CRASH_PULSE_PEAK * d * d;
}

/** Relative darkening at unit-space radius r (aspect-matched; 1 = middle of an edge, √2 = corner). */
export function crashPulseProfile(r: number): number {
  const p = (r - CRASH_PULSE_INNER) / (PULSE_OUTER - CRASH_PULSE_INNER);
  const q = p <= 0 ? 0 : p >= 1 ? 1 : p;
  return q ** PULSE_FALLOFF;
}

/** Reduced motion: the static accent's alpha, linear fade, exactly 0 outside [0, life). */
export function crashStaticAlpha(t: number): number {
  if (!(t >= 0) || !(t < CRASH_STATIC_LIFE)) return 0;
  return CRASH_STATIC_ALPHA * (1 - t / CRASH_STATIC_LIFE);
}

// ----- Drawing -----

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

const pulseGradients = new WeakMap<object, CanvasGradient>();
const staticGradients = new WeakMap<object, CanvasGradient>();

function pulseGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = pulseGradients.get(ctx);
  if (g === undefined) {
    g = ctx.createRadialGradient(0, 0, CRASH_PULSE_INNER, 0, 0, PULSE_OUTER);
    for (let i = 0; i <= PULSE_STOPS; i++) {
      const p = i / PULSE_STOPS;
      g.addColorStop(p, rgba(CRASH_PULSE_TONE, p ** PULSE_FALLOFF));
    }
    pulseGradients.set(ctx, g);
  }
  return g;
}

/** One pulse bitmap per target context; the element is reused across rebuilds. */
interface PulseBitmap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Target pixel size it was rasterized for; 0 × 0 while released. */
  w: number;
  h: number;
}

const pulseBitmaps = new WeakMap<object, PulseBitmap | null>();

/**
 * The pulse at full strength, rasterized at the target canvas's pixel size,
 * or null when the direct gradient fill must be used instead (no backing
 * canvas or document, no 2D context, an empty or too large canvas). Built on
 * first use and whenever that pixel size changes; nothing is allocated on
 * the frames in between.
 */
export function crashPulseBitmap(ctx: CanvasRenderingContext2D): HTMLCanvasElement | null {
  const target = ctx.canvas as HTMLCanvasElement | undefined;
  const w = target?.width ?? 0;
  const h = target?.height ?? 0;
  let entry = pulseBitmaps.get(ctx);
  if (entry === null) return null; // no offscreen canvas available here
  if (entry !== undefined && entry.w === w && entry.h === h) return entry.canvas;
  if (!(w > 0 && h > 0) || w * h > CRASH_PULSE_CACHE_MAX_PIXELS) {
    if (entry !== undefined) releasePulseBitmap(entry);
    return null;
  }
  if (entry === undefined) {
    const doc = target?.ownerDocument;
    const canvas = doc?.createElement?.("canvas");
    const bctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !bctx) {
      pulseBitmaps.set(ctx, null);
      return null;
    }
    entry = { canvas, ctx: bctx, w: 0, h: 0 };
    pulseBitmaps.set(ctx, entry);
  }
  // Resizing clears the bitmap and resets its context state (identity
  // transform), so every rebuild starts from the same state.
  entry.canvas.width = w;
  entry.canvas.height = h;
  const b = entry.ctx;
  b.translate(w / 2, h / 2);
  b.scale(w / 2, h / 2);
  b.fillStyle = pulseGradient(b);
  b.fillRect(-1, -1, 2, 2);
  entry.w = w;
  entry.h = h;
  return entry.canvas;
}

function releasePulseBitmap(entry: PulseBitmap): void {
  entry.canvas.width = 0;
  entry.canvas.height = 0;
  entry.w = 0;
  entry.h = 0;
}

function staticGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  let g = staticGradients.get(ctx);
  if (g === undefined) {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(STATIC_TONE, 1));
    g.addColorStop(0.4, rgba(STATIC_TONE, 0.45));
    g.addColorStop(1, rgba(STATIC_TONE, 0));
    staticGradients.set(ctx, g);
  }
  return g;
}

/**
 * F6: draw the crash accent `t` seconds after the chain break: the vignette
 * pulse over the whole viewport, then the fragments from (`bx`, `by`) — or,
 * under reduced motion, only the static glint there. A non-finite break point
 * skips the fragments and the glint, not the pulse. Issues no call at all
 * outside the effect's life. Never touches the camera; leaves the context
 * state as found.
 */
export function drawCrashFx(
  ctx: CanvasRenderingContext2D,
  t: number,
  bx: number,
  by: number,
  w: number,
  h: number,
  fx: FxSettings,
): void {
  if (!crashFxActive(t)) return;

  const pulse = crashPulseIntensity(t, fx);
  if (pulse >= MIN_ALPHA && w > 0 && h > 0) {
    const bitmap = crashPulseBitmap(ctx);
    ctx.save();
    ctx.globalAlpha = pulse;
    if (bitmap !== null) {
      // Same geometry as the fill below: the bitmap spans the viewport.
      ctx.drawImage(bitmap, 0, 0, w, h);
    } else {
      ctx.translate(w / 2, h / 2);
      ctx.scale(w / 2, h / 2);
      ctx.fillStyle = pulseGradient(ctx);
      ctx.fillRect(-1, -1, 2, 2);
    }
    ctx.restore();
  }

  if (!Number.isFinite(bx) || !Number.isFinite(by)) return;

  if (fx.reducedMotion) {
    const a = crashStaticAlpha(t);
    if (!(a >= MIN_ALPHA)) return;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(CRASH_STATIC_RADIUS, CRASH_STATIC_RADIUS);
    ctx.globalAlpha = a;
    ctx.fillStyle = staticGradient(ctx);
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    return;
  }

  const n = layoutCrashFragments(t, bx, by, fx);
  if (n === 0) return;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const o = i * CRASH_FRAGMENT_STRIDE;
    const len = fragmentOut[o + 3];
    const wid = fragmentOut[o + 4];
    ctx.save();
    ctx.translate(fragmentOut[o], fragmentOut[o + 1]);
    ctx.rotate(fragmentOut[o + 2]);
    ctx.globalAlpha = fragmentOut[o + 5];
    ctx.fillStyle = CRASH_FRAGMENT_BODY;
    ctx.fillRect(-len / 2, -wid / 2, len, wid);
    ctx.globalAlpha = fragmentOut[o + 6];
    ctx.fillStyle = CRASH_FRAGMENT_GLINT;
    ctx.fillRect(-len / 2, -wid / 2, len, wid * GLINT_SHARE);
    ctx.restore();
  }
  ctx.restore();
}
