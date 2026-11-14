// Surface ship draw module — a large white boat hull seen from the side,
// partly submerged, with a lifebuoy and the chain's attachment point (hawse
// hole) on the hull. Colors come from theme tokens.
//
// The ship floats: it heaves, surges and rolls gently on the animation clock
// (`shipChainAttach` gives the moving attachment point, so the chain stays on
// the hull). `motion` scales that movement, 1 = full, 0 = still. Flat fills
// only — no gradients, shadows or per-frame allocation.
//
// Layout, relative to the ship's origin (cx, cy):
//   y = WATERLINE   water surface (unchanged from the previous ship)
//   (0, attachDy)   chain attachment — the Actor layer starts the chain here
// The hull is one fixed shape, HULL_LENGTH long, running from 41 % of its
// length left of the origin (stern) to 59 % right of it (bow). On a scene too
// narrow for it the whole ship is scaled down uniformly around the chain
// attachment (`shipScale`), so it looks identical at every screen size.

import { SHIP_THEME } from "../theme";

type Ctx = CanvasRenderingContext2D;

/** Water surface below the ship's origin (px). */
const WATERLINE = 20;

const HULL_TOP = -22; // gunwale at the stern
const HULL_LENGTH = 600;
const HULL_STERN = HULL_LENGTH * 0.41; // extent left of the origin
const HULL_BOW = HULL_LENGTH - HULL_STERN; // extent right of the origin

/** Uniform ship scale for a viewport width: 1 where the full hull fits, smaller on narrow scenes. */
export function shipScale(w: number): number {
  return Math.max(0.3, Math.min(1, (w / 2 - 10) / HULL_BOW));
}

// ----- Floating motion (px / rad at motion = 1) -----

/** Sideways surge. */
const surge = (t: number) => Math.sin(t * 0.52 + 0.4) * 6;
/** Vertical heave. */
const heave = (t: number) => Math.sin(t * 1.15) * 4 + Math.sin(t * 0.67 + 1.3) * 2;
/** Roll around the waterline under the ship's origin. */
const roll = (t: number) => Math.sin(t * 0.85 + 0.9) * 0.024 + Math.sin(t * 1.43) * 0.008;

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

export function drawShip(
  ctx: Ctx,
  cx: number,
  cy: number,
  t: number,
  w: number,
  attachDy: number,
  motion: number,
) {
  const xs = -HULL_STERN;
  const xb = HULL_BOW;
  const len = HULL_LENGTH;
  const k = shipScale(w);
  const dx = surge(t) * motion;
  const dy = heave(t) * motion;
  const r = roll(t) * motion;
  // The ship is scaled around the chain attachment, so the hawse hole stays at
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

  // ----- Hull (ship-local coordinates) -----
  ctx.save();
  ctx.translate(cx + dx, surfaceY + dy);
  ctx.rotate(r);
  ctx.scale(k, k);
  ctx.translate(0, -WATERLINE);
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
  ctx.translate(0, WATERLINE);
  ctx.scale(1 / k, 1 / k);
  ctx.rotate(-r);
  ctx.translate(0, -dy);
  ctx.fillStyle = SHIP_THEME.underwaterTint;
  ctx.fillRect(xs - 40, 0, len + 80, 180);
  ctx.restore(); // clip, alpha and hull transform

  ctx.save();
  ctx.translate(cx + dx, surfaceY + dy);
  ctx.rotate(r);
  ctx.scale(k, k);
  ctx.translate(0, -WATERLINE);
  ctx.strokeStyle = SHIP_THEME.hullOutline;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  traceHull(ctx, xs, len);
  ctx.stroke();

  // Chain attachment: a dark hawse hole with a steel rim. Kept at full size
  // on a scaled-down ship — the chain that runs through it is not scaled.
  ctx.translate(0, attachDy);
  ctx.scale(1 / k, 1 / k);
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

  // Water surface line, crossing in front of the hull
  ctx.strokeStyle = SHIP_THEME.waterLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  traceSurface(ctx, cx, surfaceY, t, w);
  ctx.stroke();

  ctx.restore();
}
