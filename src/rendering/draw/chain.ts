// Chain draw module — dark gunmetal steel links.
//
// The chain follows one continuous, gently sagging and swaying path from the
// surface attachment (x1, y1) down to the anchor's shackle ring (x2, y2). The
// path formula is the original one; only link placement and shading changed.
//
// Placement: joints sit at fixed arc-length intervals measured from the
// ANCHOR end, and each link spans two consecutive joints. Adjacent links
// therefore always share a joint (no gaps, no floating links), the link at
// the anchor never slides, and the layout is a pure function of the inputs.
//
// Drawing: links alternate edge-on (a rounded bar) and face-on (a stadium
// ring). Face-on links are painted first and edge-on links over them, so every
// edge-on link visibly threads the end loops of its two neighbours. All links
// of one kind are batched into a single path per shading pass, which keeps
// the per-frame cost at a fixed, small number of strokes with no gradients.

import { CHAIN_THEME } from "../theme";

// ----- Link geometry (CSS px) -----

/** Outer length of one link. */
export const CHAIN_LINK_LENGTH = 19;
/** Outer width of a face-on link. */
export const CHAIN_LINK_WIDTH = 10;
/** Distance between consecutive joints along the path. */
export const CHAIN_LINK_PITCH = 13.5;

const WIRE = 2.8; // steel bar diameter of a face-on link
const EDGE_WIRE = 3.4; // apparent thickness of an edge-on link
const RIM = 1.4; // extra width of the dark silhouette pass

const FACE_STRAIGHT = (CHAIN_LINK_LENGTH - CHAIN_LINK_WIDTH) / 2; // half straight run
const FACE_RADIUS = (CHAIN_LINK_WIDTH - WIRE) / 2; // end-loop centreline radius
const EDGE_HALF = (CHAIN_LINK_LENGTH - EDGE_WIRE) / 2; // half bar centreline

/** Link 0 (at the anchor) is edge-on, so it threads the anchor's face-on ring. */
const FACE_PARITY = 1;

// Fixed screen-space light from the upper left.
const LIGHT_X = -Math.SQRT1_2;
const LIGHT_Y = -Math.SQRT1_2;

// ----- Path (unchanged sway formula) -----

const SAG = 6 * 0.22;
const WAVE = 1.4;
const WAVE_SPEED = 1.1;
const SAMPLE_STEP = 3; // px between path samples used for arc-length marching

// ----- Layout -----

/** Floats per link in `ChainLayout.data`: centreX, centreY, dirX, dirY, angle. */
export const CHAIN_LINK_STRIDE = 5;

export interface ChainClip {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ChainLayout {
  /** Number of links stored in `data`. */
  count: number;
  /** Chain index (0 = link at the anchor) of the first stored link. */
  first: number;
  /** `count * CHAIN_LINK_STRIDE` floats; dir points down-chain toward the anchor. */
  data: Float64Array;
}

// Reused across frames — the chain is laid out every frame.
const layout: ChainLayout = { count: 0, first: 0, data: new Float64Array(CHAIN_LINK_STRIDE * 128) };
const clipRect: ChainClip = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * Computes link placement along the chain path. Pure and deterministic for
 * the same inputs. When `clip` is given, only the contiguous run of links
 * near that rectangle is stored.
 *
 * The returned object and its buffer are reused by the next call.
 */
export function layoutChain(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
  clip?: ChainClip,
): ChainLayout {
  layout.count = 0;
  layout.first = 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return layout;

  const nx = -dy / len;
  const ny = dx / len;
  const sag = SAG * Math.sign(dx || 1);
  const phase = t * WAVE_SPEED;
  const steps = Math.max(1, Math.ceil(len / SAMPLE_STEP));
  const margin = CHAIN_LINK_LENGTH;

  // Monotonic cursor over path samples, walking up from the anchor (u = 1).
  // [a, b] is the current sample segment; accA / accB are their arc lengths.
  let si = 0;
  let bx = x2;
  let by = y2;
  let ax = bx;
  let ay = by;
  let accA = 0;
  let accB = 0;
  let segLen = 0;

  let px = bx; // lower joint of the current link (joint 0 = anchor end)
  let py = by;
  let seen = false;

  for (let k = 0; ; k++) {
    const s = (k + 1) * CHAIN_LINK_PITCH;
    while (accB < s && si < steps) {
      ax = bx;
      ay = by;
      accA = accB;
      si++;
      const u = 1 - si / steps;
      const env = Math.sin(u * Math.PI);
      const off = env * (sag + Math.sin(u * Math.PI * 2 - phase) * WAVE);
      bx = x1 + dx * u + nx * off;
      by = y1 + dy * u + ny * off;
      segLen = Math.hypot(bx - ax, by - ay);
      accB = accA + segLen;
    }
    // Past the top of the path the last segment is extended (f > 1), so the
    // final link still reaches the attachment point instead of leaving a gap.
    const ended = si >= steps && s >= accB;
    const f = segLen > 0 ? (s - accA) / segLen : 0;
    const qx = ax + (bx - ax) * f;
    const qy = ay + (by - ay) * f;

    const cx = (px + qx) / 2;
    const cy = (py + qy) / 2;
    const visible =
      !clip ||
      (cx >= clip.minX - margin &&
        cx <= clip.maxX + margin &&
        cy >= clip.minY - margin &&
        cy <= clip.maxY + margin);

    if (visible) {
      const n = layout.count;
      if (n === 0) layout.first = k;
      const o = n * CHAIN_LINK_STRIDE;
      if (o + CHAIN_LINK_STRIDE > layout.data.length) {
        const grown = new Float64Array(layout.data.length * 2);
        grown.set(layout.data);
        layout.data = grown;
      }
      const lx = px - qx;
      const ly = py - qy;
      const d = Math.hypot(lx, ly) || 1;
      const data = layout.data;
      data[o] = cx;
      data[o + 1] = cy;
      data[o + 2] = lx / d;
      data[o + 3] = ly / d;
      data[o + 4] = Math.atan2(ly, lx);
      layout.count = n + 1;
      seen = true;
    } else if (seen) {
      break; // walked off the visible area; the rest is off-screen too
    }

    if (ended) break;
    px = qx;
    py = qy;
  }

  return layout;
}

// ----- Path tracing (canvas space, batched per pass) -----

type Ctx = CanvasRenderingContext2D;

/** Stadium centrelines of all face-on links, shifted by (ox, oy). */
function traceFaceLinks(ctx: Ctx, l: ChainLayout, ox: number, oy: number) {
  const { data, count, first } = l;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    if ((first + i) % 2 !== FACE_PARITY) continue;
    const o = i * CHAIN_LINK_STRIDE;
    const cx = data[o] + ox;
    const cy = data[o + 1] + oy;
    const ux = data[o + 2];
    const uy = data[o + 3];
    const a = data[o + 4];
    const hx = ux * FACE_STRAIGHT;
    const hy = uy * FACE_STRAIGHT;
    // side = dir rotated +90deg: (-uy, ux)
    ctx.moveTo(cx - hx - uy * FACE_RADIUS, cy - hy + ux * FACE_RADIUS);
    ctx.arc(cx + hx, cy + hy, FACE_RADIUS, a + Math.PI / 2, a - Math.PI / 2, true);
    ctx.arc(cx - hx, cy - hy, FACE_RADIUS, a - Math.PI / 2, a - Math.PI * 1.5, true);
    ctx.closePath();
  }
}

/** Specular run along the lit outer edge: up the side bar and around the upper loop. */
function traceFaceSpecular(ctx: Ctx, l: ChainLayout) {
  const { data, count, first } = l;
  const r = FACE_RADIUS + WIRE / 2 - 0.75;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    if ((first + i) % 2 !== FACE_PARITY) continue;
    const o = i * CHAIN_LINK_STRIDE;
    const ux = data[o + 2];
    const uy = data[o + 3];
    const a = data[o + 4];
    const tx = data[o] - ux * FACE_STRAIGHT; // upper loop centre
    const ty = data[o + 1] - uy * FACE_STRAIGHT;
    ctx.moveTo(tx - uy * r + ux * 3.2, ty + ux * r + uy * 3.2);
    ctx.arc(tx, ty, r, a + Math.PI / 2, a + Math.PI / 2 + 1.35, false);
  }
}

/** Weld seam: a short tick across the shaded side bar of each face-on link. */
function traceWelds(ctx: Ctx, l: ChainLayout, along: number) {
  const { data, count, first } = l;
  const r0 = FACE_RADIUS - 0.9;
  const r1 = FACE_RADIUS + 0.9;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    if ((first + i) % 2 !== FACE_PARITY) continue;
    const o = i * CHAIN_LINK_STRIDE;
    const ux = data[o + 2];
    const uy = data[o + 3];
    const cx = data[o] + ux * along;
    const cy = data[o + 1] + uy * along;
    ctx.moveTo(cx + uy * r0, cy - ux * r0);
    ctx.lineTo(cx + uy * r1, cy - ux * r1);
  }
}

/**
 * Centrelines of all edge-on links, shifted by (ox, oy), running from
 * `from` to `to` along the link axis (negative = toward the surface).
 */
function traceEdgeLinks(
  ctx: Ctx,
  l: ChainLayout,
  ox: number,
  oy: number,
  from: number,
  to: number,
) {
  const { data, count, first } = l;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    if ((first + i) % 2 === FACE_PARITY) continue;
    const o = i * CHAIN_LINK_STRIDE;
    const cx = data[o] + ox;
    const cy = data[o + 1] + oy;
    const ux = data[o + 2];
    const uy = data[o + 3];
    ctx.moveTo(cx + ux * from, cy + uy * from);
    ctx.lineTo(cx + ux * to, cy + uy * to);
  }
}

/** Visible area in drawing coordinates, or undefined if it cannot be derived. */
function visibleRect(ctx: Ctx): ChainClip | undefined {
  const canvas = ctx.canvas;
  if (!canvas || typeof ctx.getTransform !== "function") return undefined;
  const m = ctx.getTransform();
  if (m.b !== 0 || m.c !== 0 || !(m.a > 0) || !(m.d > 0)) return undefined;
  clipRect.minX = -m.e / m.a;
  clipRect.minY = -m.f / m.d;
  clipRect.maxX = (canvas.width - m.e) / m.a;
  clipRect.maxY = (canvas.height - m.f) / m.d;
  return clipRect;
}

export function drawChain(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
) {
  const l = layoutChain(x1, y1, x2, y2, t, visibleRect(ctx));
  if (l.count === 0) return;

  ctx.save();
  ctx.lineJoin = "round";

  // --- Face-on links (underneath) ---
  ctx.lineCap = "butt";
  traceFaceLinks(ctx, l, 0, 0);
  ctx.strokeStyle = CHAIN_THEME.deepShadow; // silhouette + contact shadow
  ctx.lineWidth = WIRE + RIM;
  ctx.stroke();
  ctx.strokeStyle = CHAIN_THEME.darkSteel; // shaded underside of the bar
  ctx.lineWidth = WIRE;
  ctx.stroke();

  traceFaceLinks(ctx, l, LIGHT_X * 0.3, LIGHT_Y * 0.3);
  ctx.strokeStyle = CHAIN_THEME.gunmetal; // main body, biased toward the light
  ctx.lineWidth = WIRE - 1;
  ctx.stroke();

  traceFaceLinks(ctx, l, LIGHT_X * 0.6, LIGHT_Y * 0.6);
  ctx.strokeStyle = CHAIN_THEME.edge; // metallic edge on light-facing surfaces
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.lineCap = "round";
  traceWelds(ctx, l, 0);
  ctx.strokeStyle = CHAIN_THEME.weldShadow;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  traceWelds(ctx, l, -0.9);
  ctx.strokeStyle = CHAIN_THEME.weldLight;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  traceFaceSpecular(ctx, l);
  ctx.strokeStyle = CHAIN_THEME.highlight;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // --- Edge-on links (on top, threading the face-on loops) ---
  traceEdgeLinks(ctx, l, 0, 0, -EDGE_HALF, EDGE_HALF);
  ctx.strokeStyle = CHAIN_THEME.deepShadow;
  ctx.lineWidth = EDGE_WIRE + RIM;
  ctx.stroke();
  ctx.strokeStyle = CHAIN_THEME.darkSteel;
  ctx.lineWidth = EDGE_WIRE;
  ctx.stroke();

  traceEdgeLinks(ctx, l, LIGHT_X * 0.3, LIGHT_Y * 0.3, -EDGE_HALF, EDGE_HALF);
  ctx.strokeStyle = CHAIN_THEME.gunmetal;
  ctx.lineWidth = EDGE_WIRE - 1.1;
  ctx.stroke();

  traceEdgeLinks(ctx, l, LIGHT_X * 0.8, LIGHT_Y * 0.8, -EDGE_HALF + 0.6, EDGE_HALF - 1.2);
  ctx.strokeStyle = CHAIN_THEME.edge;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  traceEdgeLinks(ctx, l, LIGHT_X * 0.9, LIGHT_Y * 0.9, -EDGE_HALF + 1, -EDGE_HALF + 5.5);
  ctx.strokeStyle = CHAIN_THEME.highlight;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.restore();
}
