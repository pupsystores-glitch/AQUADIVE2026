// Surface ship draw module — the rescue boat artwork (src/assets/ship.png,
// E-X6 S1), partly submerged, with the chain's attachment point (the
// chrome-rimmed hole right of the lifebuoy) on its hull. While the artwork is
// not loaded (or failed to load) the previous vector hull is drawn instead.
//
// The ship floats: it heaves, surges and rolls gently on the animation clock
// (`shipChainAttach` gives the moving attachment point, so the chain stays on
// the hull). `motion` scales that movement, 1 = full, 0 = still. No gradients,
// shadows or per-frame allocation; the underwater tint of the artwork is
// prepared once per image.
//
// E-X6 S3: the owner-supplied shine overlay (src/assets/ship-shine.png, the
// same 1774 × 887 frame as the base artwork) is drawn directly over the base,
// in the same rectangle and transform, with an opacity that fades in and out
// on the animation clock (`shineLevel`): up to 0.50 above the water surface and
// 0.35 below it (S3 refinement), the two regions meeting at the surface line
// the underwater tint starts at. It is never drawn over the vector fallback and
// is skipped while its opacity is effectively zero.
//
// Layout, relative to the ship's origin (cx, cy):
//   y = WATERLINE   water surface (unchanged from the previous ship)
//   (0, attachDy)   chain attachment — the Actor layer starts the chain here
// The artwork is placed so that its measured hole centre lies exactly on
// (0, attachDy), at SPRITE_SCALE local px per source px (hull HULL_LENGTH
// long). On a scene too narrow for it the whole ship is scaled down uniformly
// around the chain attachment (`shipScale`), so it looks identical at every
// screen size.

import type { AssetHandle } from "../assets";
import { SHIP_THEME } from "../theme";

type Ctx = CanvasRenderingContext2D;

/**
 * Water surface below the ship's origin (px). Exported (Phase 7 V3, owner
 * decision Q10/V3 item 5, option A) so the F4 release splash finds the drawn
 * waterline; the ship's own drawing is unchanged.
 */
export const WATERLINE = 20;

const HULL_TOP = -22; // gunwale at the stern
const HULL_LENGTH = 600;
const HULL_STERN = HULL_LENGTH * 0.41; // extent left of the origin
const HULL_BOW = HULL_LENGTH - HULL_STERN; // extent right of the origin

// ----- Artwork geometry (source px of src/assets/ship.png, measured) -----

/** Source image size. */
const SPRITE_W = 1774;
const SPRITE_H = 887;
/** Centre of the chain hole's dark interior — the chain attachment. */
export const SPRITE_HOLE_X = 876.7;
export const SPRITE_HOLE_Y = 677.4;
/** Hull extent: bow tip (left) to stern (right), and the lowest opaque row (keel). */
const SPRITE_LEFT = 172;
const SPRITE_RIGHT = 1595;
const SPRITE_KEEL_Y = 863;
/** Mast top (the artwork's highest point) and the bow rail's top (highest point of its left half). */
const SPRITE_MAST_TOP_X = 1159;
const SPRITE_MAST_TOP_Y = 13;
const SPRITE_BOW_RAIL_TOP_Y = 365;

/** Local px per source px: the hull is HULL_LENGTH long, like the previous ship (600 / 1423). */
export const SPRITE_SCALE = HULL_LENGTH / (SPRITE_RIGHT - SPRITE_LEFT);

/** Widest half of the hull, measured from the chain hole (the stern side), at full size. */
export const SHIP_HALF_EXTENT = (SPRITE_RIGHT - SPRITE_HOLE_X) * SPRITE_SCALE;

/** Geometry the pre-dive placement needs, relative to the chain hole at full size (px). */
export const SHIP_GEOMETRY = {
  /** Mast top: height above the hole and its distance to the right of it. */
  mastRise: (SPRITE_HOLE_Y - SPRITE_MAST_TOP_Y) * SPRITE_SCALE,
  mastX: (SPRITE_MAST_TOP_X - SPRITE_HOLE_X) * SPRITE_SCALE,
  /** Bow rail: height above the hole of the left half's highest point; the bow tip's distance left of the hole. */
  bowRailRise: (SPRITE_HOLE_Y - SPRITE_BOW_RAIL_TOP_Y) * SPRITE_SCALE,
  bowX: (SPRITE_HOLE_X - SPRITE_LEFT) * SPRITE_SCALE,
  /** Keel: depth of the hull's lowest point below the hole. */
  keelDepth: (SPRITE_KEEL_Y - SPRITE_HOLE_Y) * SPRITE_SCALE,
} as const;

/** Uniform ship scale for a viewport width: 1 where the full hull fits (10 px side margin), smaller on narrow scenes. */
export function shipScale(w: number): number {
  return Math.max(0.3, Math.min(1, (w / 2 - 10) / SHIP_HALF_EXTENT));
}

/**
 * Extra uniform scale of the vector fallback hull (around the chain hole), so
 * it keeps its previous fit: the fallback is HULL_BOW wide on its right.
 */
function fallbackScale(w: number, k: number): number {
  return Math.min(1, Math.max(0.3, Math.min(1, (w / 2 - 10) / HULL_BOW)) / k);
}

// ----- Floating motion (px / rad at motion = 1) -----

/** Sideways surge. */
const surge = (t: number) => Math.sin(t * 0.52 + 0.4) * 6;
/** Vertical heave. */
const heave = (t: number) => Math.sin(t * 1.15) * 4 + Math.sin(t * 0.67 + 1.3) * 2;
/** Roll around the waterline under the ship's origin. */
const roll = (t: number) => Math.sin(t * 0.85 + 0.9) * 0.024 + Math.sin(t * 1.43) * 0.008;

/** Upper bounds of |heave| (px) and |roll| (rad) at motion 1: the sums of their sine amplitudes. */
export const SHIP_HEAVE_MAX = 4 + 2;
export const SHIP_ROLL_MAX = 0.024 + 0.008;

// ----- Shine overlay opacity (E-X6 S3, owner-approved timing) -----

/** Length of one shine cycle (s). */
export const SHINE_PERIOD = 7;
/** Phase boundaries within a cycle (s): fade in to here, hold to here, fade out to here, then rest at 0. */
export const SHINE_RISE_END = 1.6;
export const SHINE_HOLD_END = 2.2;
export const SHINE_FALL_END = 4.4;
/**
 * Peak opacity of the shine overlay above and below the water surface
 * (S3 refinement, 2026-11-16): stronger reflections on the visible upper
 * boat, the earlier 0.35 kept for the part seen through the water.
 */
export const SHINE_PEAK_ABOVE = 0.5;
export const SHINE_PEAK_BELOW = 0.35;
/** Clock offset (s): at t = 0 the cycle is in its rest, and the first glint starts 1.5 s later. */
export const SHINE_OFFSET = 5.5;
/**
 * Level used when the shine is not animated (a future reduced-motion
 * setting, docs D6): 0 keeps the approved clean base ship. Not wired to
 * any configuration.
 */
export const SHINE_STILL_LEVEL = 0;
/** Below this opacity (under one 8-bit alpha step) a draw is skipped. */
const MIN_ALPHA = 1 / 255;

/** Smoothstep ease on [0, 1]: x² (3 − 2x). */
const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * Fade-in / hold / fade-out / rest envelope on [0, 1] at phase `p` of a
 * cycle (s), with smoothstep fades; continuous at every boundary.
 */
function envelope(p: number, riseEnd: number, holdEnd: number, fallEnd: number): number {
  if (p < riseEnd) return smoothstep(p / riseEnd);
  if (p < holdEnd) return 1;
  if (p < fallEnd) return 1 - smoothstep((p - holdEnd) / (fallEnd - holdEnd));
  return 0;
}

/** Phase of `t` within a cycle of length `period`, in [0, period). */
const phase = (t: number, period: number) => ((t % period) + period) % period;

/**
 * Level of the shine overlay at animation time `t` (s), 0..1: a smooth fade
 * in, a hold, a smooth fade out and a rest, repeating every SHINE_PERIOD
 * seconds. Both regions use it — the opacity is level · SHINE_PEAK_ABOVE
 * above the water and level · SHINE_PEAK_BELOW below it, in the same phase.
 * With `animate` false it returns SHINE_STILL_LEVEL (future reduced motion).
 * Pure and allocation-free.
 */
export function shineLevel(t: number, animate = true): number {
  if (!animate) return SHINE_STILL_LEVEL;
  const p = phase(t + SHINE_OFFSET, SHINE_PERIOD);
  return envelope(p, SHINE_RISE_END, SHINE_HOLD_END, SHINE_FALL_END);
}

export interface ShipOffset {
  x: number;
  y: number;
}

/**
 * The chain attachment (hawse hole) relative to the ship's origin at time
 * `t` for a ship drawn at `scale`, written into `out`. With `motion` 0 it
 * is exactly (0, attachDy) at every scale.
 */
export function shipChainAttach(
  t: number,
  motion: number,
  attachDy: number,
  scale: number,
  out: ShipOffset,
): ShipOffset {
  const r = roll(t) * motion;
  const arm = (attachDy - WATERLINE) * scale; // attachment below the roll pivot
  out.x = surge(t) * motion - Math.sin(r) * arm;
  out.y = heave(t) * motion + attachDy + (Math.cos(r) - 1) * arm;
  return out;
}

/** Hull silhouette in ship-local coordinates, from the stern at `xs`. */
function traceHull(ctx: Ctx, xs: number, len: number) {
  const xb = xs + len;
  ctx.beginPath();
  ctx.moveTo(xs, HULL_TOP);
  ctx.lineTo(xb - len * 0.03, -9); // sheer line, falling toward the bow
  ctx.quadraticCurveTo(xb + len * 0.005, -8, xb, -3); // bow tip
  ctx.quadraticCurveTo(xb - len * 0.03, 44, xb - len * 0.17, 68); // stem
  ctx.quadraticCurveTo(xs + len * 0.53, 96, xs + len * 0.07, 74); // keel
  ctx.lineTo(xs + len * 0.035, 66); // stern chamfer
  ctx.closePath();
}

/** Everything below a line from (xs, yLeft) to (xb, yRight): one hull plank band. */
function fillBand(ctx: Ctx, xs: number, xb: number, yLeft: number, yRight: number) {
  ctx.beginPath();
  ctx.moveTo(xs - 6, yLeft);
  ctx.lineTo(xb + 6, yRight);
  ctx.lineTo(xb + 6, 140);
  ctx.lineTo(xs - 6, 140);
  ctx.closePath();
  ctx.fill();
}

/** Water surface polyline across the viewport, in screen coordinates. */
function traceSurface(ctx: Ctx, cx: number, surfaceY: number, t: number, w: number) {
  const from = -Math.ceil(cx / 8) * 8 - 8;
  const to = w - cx + 8;
  for (let x = from; x <= to; x += 8) {
    const y = surfaceY + Math.sin(t * 1.5 + x * 0.08) * 2;
    if (x === from) ctx.moveTo(cx + x, y);
    else ctx.lineTo(cx + x, y);
  }
}

// ----- Artwork: underwater tint, prepared once per image -----

let tintFrom: HTMLImageElement | null = null;
let tint: HTMLCanvasElement | null = null;

/**
 * The artwork's silhouette filled with the underwater tint (the tint color at
 * the artwork's alpha), built once per image — the equivalent of the vector
 * hull's tint fill clipped to its outline. Null where no DOM canvas exists.
 */
function prepareTint(image: HTMLImageElement): HTMLCanvasElement | null {
  if (tintFrom === image) return tint;
  tintFrom = image;
  tint = null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_W;
  canvas.height = SPRITE_H;
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.drawImage(image, 0, 0, SPRITE_W, SPRITE_H);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = SHIP_THEME.underwaterTint;
  c.fillRect(0, 0, SPRITE_W, SPRITE_H);
  tint = canvas;
  return tint;
}

/** Undoes the vector fallback's extra scale `f` around the chain hole. */
function unscaleAroundHole(ctx: Ctx, attachDy: number, f: number) {
  if (f === 1) return;
  ctx.translate(0, attachDy);
  ctx.scale(1 / f, 1 / f);
  ctx.translate(0, -attachDy);
}

/** Applies the vector fallback's extra scale `f` around the chain hole. */
function scaleAroundHole(ctx: Ctx, attachDy: number, f: number) {
  if (f === 1) return;
  ctx.translate(0, attachDy);
  ctx.scale(f, f);
  ctx.translate(0, -attachDy);
}

export function drawShip(
  ctx: Ctx,
  cx: number,
  cy: number,
  t: number,
  w: number,
  attachDy: number,
  motion: number,
  artwork?: AssetHandle,
  shine?: AssetHandle,
) {
  const k = shipScale(w);
  const dx = surge(t) * motion;
  const dy = heave(t) * motion;
  const r = roll(t) * motion;
  // The ship is scaled around the chain attachment, so the hole stays at
  // (0, attachDy) and the roll pivot — the waterline — sits `arm` above it.
  const arm = (attachDy - WATERLINE) * k;
  const surfaceY = cy + attachDy - arm;

  ctx.save();

  // Lit water above the surface, behind the hull
  ctx.fillStyle = SHIP_THEME.surfaceLight;
  ctx.beginPath();
  traceSurface(ctx, cx, surfaceY, t, w);
  ctx.lineTo(w + 8, -8);
  ctx.lineTo(-16, -8);
  ctx.closePath();
  ctx.fill();

  const image = artwork?.ready ? artwork.image : null;
  if (image) {
    // The shine only ever goes on the artwork, never on the vector fallback.
    const shineImage = shine?.ready ? shine.image : null;
    const level = shineImage ? shineLevel(t) : 0;
    drawArtworkHull(ctx, image, shineImage, level, cx + dx, surfaceY, dy, r, k, attachDy);
  } else drawVectorHull(ctx, cx + dx, surfaceY, dy, r, k, attachDy, fallbackScale(w, k));

  // Water surface line, crossing in front of the hull
  ctx.strokeStyle = SHIP_THEME.waterLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  traceSurface(ctx, cx, surfaceY, t, w);
  ctx.stroke();

  ctx.restore();
}

/** The ship transform: pivot on the water surface at (x, y), rolled by r, scaled by k, origin WATERLINE above. */
function shipTransform(ctx: Ctx, x: number, y: number, r: number, k: number) {
  ctx.translate(x, y);
  ctx.rotate(r);
  ctx.scale(k, k);
  ctx.translate(0, -WATERLINE);
}

/**
 * The rescue boat artwork in the ship's transform (pivot on the water surface
 * at x, rolled, scaled, origin WATERLINE above the pivot), its hole centre on
 * (0, attachDy). Draw order:
 *   1. the base artwork;
 *   2. the shine overlay above the water surface at shine · SHINE_PEAK_ABOVE;
 *   3. below the surface, the shine at shine · SHINE_PEAK_BELOW, then the
 *      tinted silhouette over everything, as before.
 * The two shine regions are clipped by complementary rectangles meeting at the
 * water surface — the line the underwater tint already starts at — so every
 * pixel of the shine is drawn exactly once. Both use the base's rectangle and
 * transform; the clips are level with the water, like the tint's.
 */
function drawArtworkHull(
  ctx: Ctx,
  image: HTMLImageElement,
  shineImage: HTMLImageElement | null,
  shine: number,
  x: number,
  surfaceY: number,
  dy: number,
  r: number,
  k: number,
  attachDy: number,
) {
  const sx = -SPRITE_HOLE_X * SPRITE_SCALE;
  const sy = attachDy - SPRITE_HOLE_Y * SPRITE_SCALE;
  const sw = SPRITE_W * SPRITE_SCALE;
  const sh = SPRITE_H * SPRITE_SCALE;

  ctx.save();
  shipTransform(ctx, x, surfaceY + dy, r, k);
  ctx.drawImage(image, sx, sy, sw, sh);
  ctx.restore();

  const above = shineImage ? shine * SHINE_PEAK_ABOVE : 0;
  if (shineImage && above >= MIN_ALPHA) {
    ctx.save();
    ctx.translate(x, surfaceY);
    ctx.beginPath();
    ctx.rect(-sw, -sh, 2 * sw, sh); // everything above the surface around the ship
    ctx.clip();
    shipTransform(ctx, 0, dy, r, k);
    ctx.globalAlpha *= above; // restored with the clip
    ctx.drawImage(shineImage, sx, sy, sw, sh);
    ctx.restore();
  }

  const tinted = prepareTint(image);
  const below = shineImage ? shine * SHINE_PEAK_BELOW : 0;
  const shineBelow = shineImage !== null && below >= MIN_ALPHA;
  if (!tinted && !shineBelow) return;
  ctx.save();
  ctx.translate(x, surfaceY);
  ctx.beginPath();
  ctx.rect(-sw, 0, 2 * sw, sh); // everything below the surface around the ship
  ctx.clip();
  shipTransform(ctx, 0, dy, r, k);
  if (shineImage && shineBelow) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * below;
    ctx.drawImage(shineImage, sx, sy, sw, sh);
    ctx.globalAlpha = a;
  }
  if (tinted) ctx.drawImage(tinted, sx, sy, sw, sh);
  ctx.restore();
}

/** The previous vector hull — the fallback while the artwork is unavailable. */
function drawVectorHull(
  ctx: Ctx,
  x: number,
  surfaceY: number,
  dy: number,
  r: number,
  k: number,
  attachDy: number,
  f: number,
) {
  const xs = -HULL_STERN;
  const xb = HULL_BOW;
  const len = HULL_LENGTH;

  // ----- Hull (ship-local coordinates) -----
  ctx.save();
  ctx.translate(x, surfaceY + dy);
  ctx.rotate(r);
  ctx.scale(k, k);
  ctx.translate(0, -WATERLINE);
  scaleAroundHole(ctx, attachDy, f);
  ctx.globalAlpha = SHIP_THEME.hullAlpha;
  traceHull(ctx, xs, len);
  ctx.clip();

  // Plank bands, lighter at the gunwale, darker toward the keel
  ctx.fillStyle = SHIP_THEME.hullTop;
  ctx.fillRect(xs - 6, HULL_TOP - 4, len + 12, 140);
  ctx.fillStyle = SHIP_THEME.hullMid;
  fillBand(ctx, xs, xb, 22, 14);
  ctx.fillStyle = SHIP_THEME.hullLow;
  fillBand(ctx, xs, xb, 46, 30);
  ctx.fillStyle = SHIP_THEME.hullKeel;
  fillBand(ctx, xs, xb, 66, 46);

  // Chine highlights along the band edges
  ctx.strokeStyle = SHIP_THEME.chine;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(xs, 22);
  ctx.lineTo(xb, 14);
  ctx.moveTo(xs, 46);
  ctx.lineTo(xb, 30);
  ctx.moveTo(xs, 66);
  ctx.lineTo(xb, 46);
  ctx.stroke();

  // Deck edge: a bright strip under the sheer line, with a soft shade below it
  ctx.strokeStyle = SHIP_THEME.deck;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(xs, HULL_TOP + 3);
  ctx.lineTo(xb, -6);
  ctx.stroke();
  ctx.strokeStyle = SHIP_THEME.deckShade;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(xs, HULL_TOP + 7.5);
  ctx.lineTo(xb, -1.5);
  ctx.stroke();

  // Lifebuoy on the hull side, straddling the waterline, left of the chain
  const ringR = 24; // centreline radius
  const ringW = 18; // tube width
  const bx = -HULL_STERN * 0.28;
  const by = WATERLINE + 2;
  ctx.lineCap = "butt";
  ctx.strokeStyle = SHIP_THEME.buoyShadow;
  ctx.lineWidth = ringW + 2;
  ctx.beginPath();
  ctx.arc(bx - 4, by + 3, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = SHIP_THEME.buoy;
  ctx.lineWidth = ringW;
  ctx.beginPath();
  ctx.arc(bx, by, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = SHIP_THEME.buoyBand;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.moveTo(bx + Math.cos(a - 0.17) * ringR, by + Math.sin(a - 0.17) * ringR);
    ctx.arc(bx, by, ringR, a - 0.17, a + 0.17);
  }
  ctx.stroke();
  ctx.strokeStyle = SHIP_THEME.buoyShade;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(bx, by, ringR + ringW / 2, 0, Math.PI * 2);
  ctx.moveTo(bx + ringR - ringW / 2, by);
  ctx.arc(bx, by, ringR - ringW / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Submerged part seen through the water
  // (level with the water, not with the rolling hull)
  unscaleAroundHole(ctx, attachDy, f);
  ctx.translate(0, WATERLINE);
  ctx.scale(1 / k, 1 / k);
  ctx.rotate(-r);
  ctx.translate(0, -dy);
  ctx.fillStyle = SHIP_THEME.underwaterTint;
  ctx.fillRect(xs - 40, 0, len + 80, 180);
  ctx.restore(); // clip, alpha and hull transform

  ctx.save();
  ctx.translate(x, surfaceY + dy);
  ctx.rotate(r);
  ctx.scale(k, k);
  ctx.translate(0, -WATERLINE);
  scaleAroundHole(ctx, attachDy, f);
  ctx.strokeStyle = SHIP_THEME.hullOutline;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  traceHull(ctx, xs, len);
  ctx.stroke();

  // Chain attachment: a dark hawse hole with a steel rim. Kept at full size
  // on a scaled-down ship — the chain that runs through it is not scaled.
  ctx.translate(0, attachDy);
  ctx.scale(1 / (k * f), 1 / (k * f));
  ctx.fillStyle = SHIP_THEME.hawseHole;
  ctx.strokeStyle = SHIP_THEME.hawseRim;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = SHIP_THEME.hawseRimLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.6, 8.1, 0, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
}
