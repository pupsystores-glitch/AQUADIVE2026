// Chain Snapped animation (E-X7) — rendering only.
//
// When the round crashes the chain breaks CHAIN_SNAP_DETACH_LINKS links above
// the anchor (fewer on a short chain). The anchor falls away with those links;
// the chain above recoils, whips and swings, and settles hanging straight
// down by CHAIN_SNAP_SETTLE_SECONDS — inside the engine's unchanged 2.4 s
// crashed phase. Everything is a closed-form function of the time since the
// break: no randomness, no timers, no integration state.
//
// Geometry at the break (prepareChainSnap):
//  - The swaying chain is re-sampled exactly as draw/chain.ts lays it out
//    (sampleChainLine). Its joints sit at whole multiples of CHAIN_LINK_PITCH
//    of arc length from the anchor end, and link k spans joints k and k + 1.
//  - The break is joint N (N = detached links). The detached links are the
//    original links 0 … N−1, rebuilt from their own joints. The upper chain is
//    the original sample polyline from joint N to the attachment; laid out
//    with layoutChainPath(…, firstIndex = N) it reproduces original links
//    N … end with their positions and face-on / edge-on parity. So at
//    elapsed = 0 the picture is the unbroken chain, with no link added,
//    dropped or duplicated.
//
// Motion (per frame):
//  - Upper chain: an inextensible line hung from the current attachment,
//    stored as segment lengths + angles. Angles = base angles × a damped
//    swing back to vertical + a whip wave that starts at the free end and
//    travels up the chain + a pendulum swing of the lower part. A short
//    elastic recoil pulls the chain up along its own length. Segment lengths
//    never change, so link pitch is exact; the attachment never moves (it
//    follows the hull while the ship is in view, as before).
//  - Detached links: a 4-segment line hung from the falling anchor's ring,
//    trailing upward in the water, with fixed segment lengths.
//  - Anchor: water-drag fall (terminal velocity, exponential approach),
//    initial horizontal velocity carried and damped, tilt as a damped
//    oscillator toward crown-down. Near the sea floor the caller uses the
//    existing landing instead (layers/actor.ts).
//
// The clock (ChainSnapClock) latches the break at the first rendered crashed
// frame, i.e. up to one frame after the engine's transition — it is not
// claimed to be synchronous with the engine event.

import {
  CHAIN_LINK_PITCH,
  CHAIN_LINK_STRIDE,
  chainLinePoints,
  layoutChainPath,
  sampleChainLine,
  type ChainLayout,
} from "../draw/chain";
import type { ChainSnapTiming, Phase } from "../render-state";

// ----- Timing -----

/** Links that fall with the anchor (fewer on a shorter chain). */
export const CHAIN_SNAP_DETACH_LINKS = 4;
/** Every chain motion is exactly zero from here on (seconds after the break). */
export const CHAIN_SNAP_SETTLE_SECONDS = 2.3;
/** The final fade of all chain motion starts here (seconds after the break). */
const SETTLE_START = 1.2;

const smooth = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

/** 1 until SETTLE_START, smoothly to exactly 0 at CHAIN_SNAP_SETTLE_SECONDS. */
export function snapSettle(t: number): number {
  return 1 - smooth((t - SETTLE_START) / (CHAIN_SNAP_SETTLE_SECONDS - SETTLE_START));
}

/**
 * Renderer-owned crash clock. Latches once on entering `crashed`, never
 * re-triggers on repeated crashed frames, and resets on leaving it.
 *
 * - Fresh break (a non-crashed frame was seen before): startedAt = this
 *   frame's animTime, so elapsed starts at 0.
 * - First frame ever is already crashed (remount mid-crash) or the clock
 *   moves backwards during a crash: the renderer did not witness the break,
 *   so it shows the settled result — startedAt = animTime − settle time.
 */
export class ChainSnapClock {
  private readonly timing = { startedAt: 0, elapsed: 0 };
  private active = false;
  private seen = false;
  private lastTime = 0;

  update(phase: Phase, animTime: number): ChainSnapTiming | null {
    if (!Number.isFinite(animTime)) return this.active ? this.timing : null;
    const first = !this.seen;
    const backwards = !first && animTime < this.lastTime;
    this.seen = true;
    this.lastTime = animTime;
    if (phase !== "crashed") {
      this.active = false;
      return null;
    }
    if (!this.active || backwards) {
      this.timing.startedAt =
        this.active || first ? animTime - CHAIN_SNAP_SETTLE_SECONDS : animTime;
      this.active = true;
    }
    this.timing.elapsed = Math.max(0, animTime - this.timing.startedAt);
    return this.timing;
  }
}

// ----- Motion tuning -----

/** Anchor fall: terminal speed (px/s) and drag time constant (s). */
const FALL_TERMINAL = 620;
const FALL_TAU = 0.32;
/** Horizontal velocity at the break decays with this time constant (s). */
const DRIFT_TAU = 0.45;
/** Tilt: damped oscillation toward crown-down. */
const TILT_TAU = 0.5;
const TILT_FREQ = 5;

/** Upper chain: elastic recoil along its length (px; capped to a share of a short chain). */
const RECOIL_PX = 44;
const RECOIL_SHARE = 0.3;
const RECOIL_RISE = 0.03;
const RECOIL_FALL = 0.38;
/** Swing back to vertical: angular frequency (rad/s) and decay (s). */
const RELAX_FREQ = 3.8;
const RELAX_TAU = 0.8;
/** Whip wave: angle (rad), decay (s), reach above the free end (px), frequency (rad/s), speed (px/s). */
const WHIP_ANGLE = 0.55;
const WHIP_TAU = 0.4;
const WHIP_REACH = 140;
const WHIP_FREQ = 16;
const WHIP_SPEED = 650;
const WHIP_FRONT = 60;
/** Pendulum swing of the lower chain: angle (rad), decay (s), frequency (rad/s), height (px). */
const SWING_ANGLE = 0.22;
const SWING_TAU = 0.75;
const SWING_FREQ = 7.5;
const SWING_HEIGHT = 320;
/** Free-end speed (px/s) below which the swing direction falls back to the lean. */
const SIGN_SPEED = 1;

/** Detached links: settle time (s) to trailing, wobble angle (rad), decay (s), frequency (rad/s), lag per link (s). */
const TRAIL_TAU = 0.25;
const TRAIL_LEAN_PER_PX_S = 0.004;
const TRAIL_LEAN_MAX = 0.3;
const WOBBLE_ANGLE = 0.35;
const WOBBLE_TAU = 0.45;
const WOBBLE_FREQ = 13;
const WOBBLE_LAG = 0.035;
/** Angle (rad from straight up) the links lie at once the anchor rests on the sand. */
const LIE_ANGLE = Math.PI / 2 + 0.12;
/** Link centres rest this far above the sand. */
const LIE_ABOVE_FLOOR = 4;

// ----- Break record (reused; rebuilt only when the break changes) -----

/** Break-time scalars the caller copies out of its pose (never a retained pose object). */
export interface ChainSnapBreakInput {
  /** animTime of the break. */
  t: number;
  anchorX: number;
  anchorY: number;
  anchorAngle: number;
  /** Anchor velocity at the break (px/s, rad/s). */
  anchorVx: number;
  anchorVy: number;
  anchorVa: number;
  chainStartX: number;
  chainStartY: number;
  chainEndX: number;
  chainEndY: number;
  /** Horizontal velocity of the chain's anchor end at the break (px/s). */
  chainEndVx: number;
}

let pathXs = new Float64Array(2048);
let pathYs = new Float64Array(2048);

/** Upper chain, top → bottom: segment lengths, base angles (from straight down), arc at each lower end. */
let segLen = new Float64Array(2048);
let segAngle = new Float64Array(2048);
let segArc = new Float64Array(2048);
let segCount = 0;
let upperLength = 0;

/** Upper chain output polyline, point 0 at the free end. */
let outXs = new Float64Array(2048);
let outYs = new Float64Array(2048);

/** Detached segments, ring → break: lengths and angles (from straight up). */
const detLen = new Float64Array(CHAIN_SNAP_DETACH_LINKS);
const detAngle = new Float64Array(CHAIN_SNAP_DETACH_LINKS);
const detLayout: ChainLayout = {
  count: 0,
  first: 0,
  data: new Float64Array(CHAIN_SNAP_DETACH_LINKS * CHAIN_LINK_STRIDE),
};

const brk = {
  /** Original link count of the unbroken chain. */
  links: 0,
  /** Links detached with the anchor (chain index of the upper chain's first link). */
  detached: 0,
  t: 0,
  anchorX: 0,
  anchorY: 0,
  anchorAngle: 0,
  anchorVx: 0,
  anchorVy: 0,
  anchorVa: 0,
  attachX: 0,
  attachY: 0,
  /** Lateral direction of the whip and swing (±1). */
  sign: 1,
};

function ensure(buf: Float64Array<ArrayBuffer>, n: number): Float64Array<ArrayBuffer> {
  if (buf.length >= n) return buf;
  let size = buf.length;
  while (size < n) size *= 2;
  return new Float64Array(size);
}

/** Read-only view of the current break (tests and the actor layer). */
export function chainSnapBreak(): Readonly<typeof brk> {
  return brk;
}

/**
 * Builds the break geometry from the unbroken chain at the break instant.
 * Allocation-free except for one-time buffer growth on an unusually long chain.
 */
export function prepareChainSnap(b: ChainSnapBreakInput): void {
  brk.t = b.t;
  brk.anchorX = b.anchorX;
  brk.anchorY = b.anchorY;
  brk.anchorAngle = b.anchorAngle;
  brk.anchorVx = b.anchorVx;
  brk.anchorVy = b.anchorVy;
  brk.anchorVa = b.anchorVa;
  brk.attachX = b.chainStartX;
  brk.attachY = b.chainStartY;
  brk.links = 0;
  brk.detached = 0;
  segCount = 0;
  upperLength = 0;

  const want = chainLinePoints(b.chainStartX, b.chainStartY, b.chainEndX, b.chainEndY);
  pathXs = ensure(pathXs, want);
  pathYs = ensure(pathYs, want);
  const n = sampleChainLine(
    b.chainStartX,
    b.chainStartY,
    b.chainEndX,
    b.chainEndY,
    b.t,
    pathXs,
    pathYs,
  );
  brk.sign = b.chainEndVx > SIGN_SPEED ? 1 : b.chainEndVx < -SIGN_SPEED ? -1 : 1;
  if (n < 2) return;
  const steps = n - 1;

  // The unbroken chain, exactly as drawn (unclipped).
  const full = layoutChainPath(pathXs, pathYs, n);
  brk.links = full.count;
  const nd = Math.min(CHAIN_SNAP_DETACH_LINKS, Math.max(0, full.count - 1));
  brk.detached = nd;

  // Detached links: joints rebuilt from the original link data (joint 0 = chain end).
  let jx = pathXs[0];
  let jy = pathYs[0];
  for (let k = 0; k < nd; k++) {
    const o = k * CHAIN_LINK_STRIDE;
    const qx = 2 * full.data[o] - jx;
    const qy = 2 * full.data[o + 1] - jy;
    detLen[k] = Math.hypot(qx - jx, qy - jy);
    detAngle[k] = Math.atan2(qx - jx, -(qy - jy));
    jx = qx;
    jy = qy;
  }

  // Split point: arc length nd × pitch from the anchor end, found with the
  // same cursor arithmetic as the chain's own march (draw/chain.ts).
  const target = nd * CHAIN_LINK_PITCH;
  let si = 0;
  let ax = pathXs[0];
  let ay = pathYs[0];
  let bx = ax;
  let by = ay;
  let accA = 0;
  let accB = 0;
  let len = 0;
  while (accB < target && si < steps) {
    ax = bx;
    ay = by;
    accA = accB;
    si++;
    bx = pathXs[si];
    by = pathYs[si];
    len = Math.hypot(bx - ax, by - ay);
    accB = accA + len;
  }
  const f = len > 0 ? (target - accA) / len : 0;
  const splitX = nd === 0 ? pathXs[0] : ax + (bx - ax) * f;
  const splitY = nd === 0 ? pathYs[0] : ay + (by - ay) * f;

  // Upper chain, top → bottom: attachment (sample `steps`) down to sample si,
  // then the split point (for nd = 0, si = 0 and the split is sample 0 itself).
  const segs = steps - si + (nd === 0 ? 0 : 1);
  segLen = ensure(segLen, segs);
  segAngle = ensure(segAngle, segs);
  segArc = ensure(segArc, segs);
  outXs = ensure(outXs, segs + 1);
  outYs = ensure(outYs, segs + 1);
  let px = pathXs[steps];
  let py = pathYs[steps];
  let arc = 0;
  let j = 0;
  for (let i = steps - 1; i >= si - (nd === 0 ? 0 : 1); i--) {
    const qx = i >= si ? pathXs[i] : splitX;
    const qy = i >= si ? pathYs[i] : splitY;
    const dx = qx - px;
    const dy = qy - py;
    const l = Math.hypot(dx, dy);
    segLen[j] = l;
    segAngle[j] = Math.atan2(dx, dy);
    arc += l;
    segArc[j] = arc;
    j++;
    px = qx;
    py = qy;
  }
  segCount = j;
  upperLength = arc;
}

// ----- Per-frame motion -----

/** Anchor pose of the free fall (reused). */
export const fallPose = { x: 0, y: 0, angle: 0, vx: 0 };

/** The falling anchor `t` seconds after the break (no sea floor). Writes fallPose. */
export function snapAnchorFall(t: number): typeof fallPose {
  const s = Math.max(0, t);
  const ex = Math.exp(-s / DRIFT_TAU);
  const ey = Math.exp(-s / FALL_TAU);
  fallPose.x = brk.anchorX + brk.anchorVx * DRIFT_TAU * (1 - ex);
  fallPose.vx = brk.anchorVx * ex;
  fallPose.y =
    brk.anchorY + brk.anchorVy * FALL_TAU * (1 - ey) + FALL_TERMINAL * (s - FALL_TAU * (1 - ey));
  // Damped oscillator from (angle, angular velocity) at the break toward 0.
  const a0 = brk.anchorAngle;
  const k = (brk.anchorVa + a0 / TILT_TAU) / TILT_FREQ;
  fallPose.angle =
    Math.exp(-s / TILT_TAU) * (a0 * Math.cos(TILT_FREQ * s) + k * Math.sin(TILT_FREQ * s));
  return fallPose;
}

/** Elastic recoil (px) the chain is pulled up along its length, `t` seconds after the break. */
export function snapRecoil(t: number): number {
  if (!(t > 0)) return 0;
  const r = Math.min(RECOIL_PX, upperLength * RECOIL_SHARE);
  return r * snapSettle(t) * (1 - Math.exp(-t / RECOIL_RISE)) * Math.exp(-t / RECOIL_FALL);
}

/** Multiplier on the chain's break-time lean: 1 at the break, swinging through 0, exactly 0 when settled. */
export function snapRelax(t: number): number {
  const s = Math.max(0, t);
  const e = Math.exp(-s / RELAX_TAU);
  const w = RELAX_FREQ * s;
  return snapSettle(s) * e * (Math.cos(w) + Math.sin(w) / (RELAX_FREQ * RELAX_TAU));
}

/** Angle (rad) added to the upper chain `sigma` px above its free end. 0 at t = 0 and once settled. */
export function snapBend(sigma: number, t: number): number {
  if (!(t > 0)) return 0;
  const g = snapSettle(t);
  if (g === 0) return 0;
  let a = 0;
  if (sigma < WHIP_REACH * 6) {
    const front = smooth((WHIP_SPEED * t - sigma) / WHIP_FRONT);
    if (front > 0) {
      a +=
        WHIP_ANGLE *
        Math.exp(-t / WHIP_TAU) *
        Math.exp(-sigma / WHIP_REACH) *
        Math.sin(WHIP_FREQ * t - (WHIP_FREQ / WHIP_SPEED) * sigma) *
        front;
    }
  }
  const height = Math.min(SWING_HEIGHT, upperLength);
  if (sigma < height) {
    a +=
      SWING_ANGLE *
      Math.exp(-t / SWING_TAU) *
      Math.sin(SWING_FREQ * t) *
      (1 - smooth(sigma / height));
  }
  return a * g * brk.sign;
}

/** Output polyline of layoutUpperChain (point 0 = free end). */
export function upperChainPoints(): { xs: Float64Array; ys: Float64Array } {
  return { xs: outXs, ys: outYs };
}

/**
 * The upper chain `t` seconds after the break, hung from (attachX, attachY).
 * Writes the polyline returned by upperChainPoints (point 0 = free end) and
 * returns its point count (0 when there is no upper chain).
 */
export function layoutUpperChain(t: number, attachX: number, attachY: number): number {
  if (segCount === 0) return 0;
  const relax = snapRelax(t);
  const length = upperLength - snapRecoil(t);
  // Segments needed to reach `length` from the top.
  let m = 0;
  while (m < segCount - 1 && segArc[m] < length) m++;
  const count = m + 1; // segments drawn
  let x = attachX;
  let y = attachY;
  outXs[count] = x;
  outYs[count] = y;
  let top = 0;
  for (let j = 0; j < count; j++) {
    const l = j === m ? Math.max(0, length - top) : segLen[j];
    const sigma = Math.max(0, length - (top + l));
    const phi = segAngle[j] * relax + snapBend(sigma, t);
    x += l * Math.sin(phi);
    y += l * Math.cos(phi);
    outXs[count - 1 - j] = x;
    outYs[count - 1 - j] = y;
    top += segLen[j];
  }
  return count + 1;
}

/**
 * The detached links `t` seconds after the break, hung from the anchor's ring
 * at (ringX, ringY). `trail` is 1 while the anchor sinks (links stream up)
 * and 0 once it rests on the sand (links lie toward `lieSign`); `floorY`
 * keeps link centres above the sand (Infinity for none). `anchorVx` leans the
 * trailing links against the drift. Segment lengths never change.
 */
export function layoutDetachedLinks(
  t: number,
  ringX: number,
  ringY: number,
  anchorVx: number,
  trail: number,
  lieSign: number,
  floorY: number,
): ChainLayout {
  const nd = brk.detached;
  detLayout.count = 0;
  detLayout.first = 0;
  if (nd === 0) return detLayout;
  const s = Math.max(0, t);
  const g = snapSettle(s);
  const lean = Math.max(-TRAIL_LEAN_MAX, Math.min(TRAIL_LEAN_MAX, -anchorVx * TRAIL_LEAN_PER_PX_S));
  const toTrail = Math.exp(-s / TRAIL_TAU);
  const wobbleEnv = WOBBLE_ANGLE * g * Math.exp(-s / WOBBLE_TAU) * brk.sign;
  const lie = lieSign < 0 ? -LIE_ANGLE : LIE_ANGLE;
  const rest = floorY - LIE_ABOVE_FLOOR;
  const data = detLayout.data;
  let px = ringX;
  let py = ringY;
  for (let k = 0; k < nd; k++) {
    let beta = lean + (detAngle[k] - lean) * toTrail;
    beta += wobbleEnv * Math.sin(WOBBLE_FREQ * Math.max(0, s - k * WOBBLE_LAG)) * ((k + 1) / nd);
    beta += (lie - beta) * (1 - trail);
    const l = detLen[k];
    let qx = px + l * Math.sin(beta);
    let qy = py - l * Math.cos(beta);
    if (qy > rest && py <= rest) {
      // Lie along the sand without stretching the link.
      const dy = rest - py;
      const dx = Math.sqrt(Math.max(0, l * l - dy * dy));
      qx = px + (Math.sin(beta) < 0 ? -dx : dx);
      qy = rest;
    }
    const o = k * CHAIN_LINK_STRIDE;
    const lx = px - qx;
    const ly = py - qy;
    const d = Math.hypot(lx, ly) || 1;
    data[o] = (px + qx) / 2;
    data[o + 1] = (py + qy) / 2;
    data[o + 2] = lx / d;
    data[o + 3] = ly / d;
    data[o + 4] = Math.atan2(ly, lx);
    px = qx;
    py = qy;
  }
  detLayout.count = nd;
  return detLayout;
}
