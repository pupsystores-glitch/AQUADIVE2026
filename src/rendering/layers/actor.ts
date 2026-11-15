// Actor layer — chain + anchor + sway math (Sprint 2, Commit R3;
// docs/05_RENDERING_ARCHITECTURE.md §5 layer 4, §9). The whole sway block
// moved as one unit from the component's drawScene (§20 risk 4): pendulum X,
// sway angle, ring-position trig, chain endpoints — all formulas verbatim,
// derived only from the animation clock and the viewport. Draw order within
// the layer: anchor → chain (owner request, 2026-11-15: the chain's last link
// lies over the anchor's shackle ring, not under it).
//
// The pendulum X and pinned screen-Y are exported as pure helpers so the
// Effects layer can anchor impact FX to the swaying anchor without
// duplicating the formula (§18 correction, R3).
//
// Pre-dive presentation: at depth 0 the anchor hangs close under the ship on
// a short chain, swinging like a pendulum from the hawse hole and trailing the
// floating ship; it eases to the pinned pose as the dive starts
// (layers/presentation.ts). Once the ship has been culled the pose is the
// previous one, formula for formula.
//
// Landing: when the anchor reaches the sea floor it drops from its pinned pose
// to the sand beside the crown, tips over onto its side with a small bounce,
// and the chain goes slack and settles in a loose coil next to it. All of it
// is a pure function of the time since impact (RenderState.shipImpact).

import { ANCHOR_WORLD_OFFSET_PX, CHAIN_MAX_DEPTH, SHIP_WORLD_Y } from "@/shared/world";
import {
  ANCHOR_DRAW_H,
  ANCHOR_REST_CHAIN_HULL_PX,
  ANCHOR_REST_CHAIN_PX,
  ANCHOR_REST_SWING,
  ANCHOR_REST_SWING_2,
  ANCHOR_REST_SWING_SPEED,
  ANCHOR_RING_Y_FRAC,
  ANCHOR_SCREEN_Y_FRAC,
  CHAIN_RING_GRIP_PX,
  SHIP_CHAIN_ATTACH_DY,
} from "../constants";
import { assets } from "../assets";
import type { Camera } from "../camera";
import { drawAnchor } from "../draw/anchor";
import { drawChain, drawChainPath } from "../draw/chain";
import { seaFloorRestPoint } from "../draw/sea-floor-art";
import { shipChainAttach, shipScale, type ShipOffset } from "../draw/ship";
import type { RenderLayer, RenderState } from "../render-state";
import { launchProgress, presentedShipRestY } from "./presentation";

/** Anchor sway — faster & wider for a more natural pendulum swing. */
export function anchorSwayX(animTime: number, w: number): number {
  return w / 2 + Math.sin(animTime * 1.4) * 38 + Math.sin(animTime * 0.7) * 10;
}

/** World camera: anchor is fixed near 55% of screen. */
export function anchorPinY(h: number): number {
  return h * ANCHOR_SCREEN_Y_FRAC;
}

/** Radius of the anchor's shackle ring (px). */
const RING_R = 9;
/** Chain end above the ring's centre: just inside the ring, so the last link hooks over its top bar. */
const CHAIN_END_ABOVE_RING = RING_R - CHAIN_RING_GRIP_PX;

/** How far (seconds) the hanging anchor trails the ship's movement. */
const ANCHOR_FOLLOW_LAG = 0.45;
/** How strongly the hanging anchor reacts to the hull's sideways movement. */
const ANCHOR_FOLLOW_GAIN = 1.5;

// Reused across frames.
const attachNow: ShipOffset = { x: 0, y: 0 };
const attachLagged: ShipOffset = { x: 0, y: 0 };

export interface AnchorPose {
  /** Anchor sprite centre. */
  x: number;
  y: number;
  swayAngle: number;
  /** Chain top: the hull's attachment point. */
  chainStartX: number;
  chainStartY: number;
  /** Chain bottom: just inside the top of the anchor's shackle ring. */
  chainEndX: number;
  chainEndY: number;
  /** True while the anchor is launching and the chain starts at the hull's attachment point. */
  fromHull: boolean;
  /** 0 = taut chain, 1 = the chain lies slack beside the landed anchor. */
  slack: number;
  /** Screen Y of the sand under the landed anchor (meaningful while slack > 0). */
  floorY: number;
}

// Reused across frames — the pose is computed every frame.
const pose: AnchorPose = {
  x: 0,
  y: 0,
  swayAngle: 0,
  chainStartX: 0,
  chainStartY: 0,
  chainEndX: 0,
  chainEndY: 0,
  fromHull: false,
  slack: 0,
  floorY: 0,
};

// ----- Landing on the sea floor -----

/** The sprite's bottom tip (the anchor's crown) below its centre. */
const TIP_BELOW_CENTER = ANCHOR_DRAW_H * 0.452;
/** Lean (rad, toward the crown side) the anchor touches down with. */
const LAND_LEAN = 0.08;
/** Tipping over, from touchdown to hitting the sand (seconds). */
const TOPPLE_SECONDS = 0.75;
/** Resting angle (rad): on its side, lying on one fluke and the end of its stock. */
const REST_ANGLE = 1.705;
/** Bounce after it hits the sand: size (rad), decay (1/s) and speed (rad/s). */
const BOUNCE = 0.16;
const BOUNCE_DECAY = 6;
const BOUNCE_SPEED = 13;
/** The chain starts to go slack this long after touchdown, and takes this long to settle (seconds). */
const SLACK_DELAY = 0.3;
const SLACK_SECONDS = 1.2;

/**
 * Outline points of the anchor's lower side, relative to its bottom tip, in
 * units of ANCHOR_DRAW_H (x, y pairs): fluke tip, fluke edge, arm, stock end,
 * ring. Whichever is lowest carries the anchor as it tips over.
 */
const CONTACT = [-0.294, -0.431, -0.288, -0.228, -0.185, -0.141, -0.228, -0.671, -0.09, -0.839];

/** How far (px) the bottom tip is lifted off the sand when the anchor is tipped by `angle`. */
function tipLift(angle: number): number {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  let lowest = 0;
  for (let i = 0; i < CONTACT.length; i += 2) {
    const y = (-CONTACT[i] * sin + CONTACT[i + 1] * cos) * ANCHOR_DRAW_H;
    if (y > lowest) lowest = y;
  }
  return lowest;
}

const smooth = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

/** Moves the pinned pose to its place in the landing, `t` seconds after impact. */
function applyLanding(p: AnchorPose, t: number, camera: Camera) {
  const { w, h } = camera.viewport;
  const floorScreenY = camera.worldToScreenY(CHAIN_MAX_DEPTH + ANCHOR_WORLD_OFFSET_PX);
  const rest = seaFloorRestPoint(w, h, floorScreenY);
  p.floorY = rest.y;

  // Upright on the sand, leaning slightly: where the drop ends and the tipping starts.
  const standX = rest.x - Math.sin(LAND_LEAN) * TIP_BELOW_CENTER;
  const standY = rest.y - Math.cos(LAND_LEAN) * TIP_BELOW_CENTER;
  const drop = Math.max(0, standY - p.y);
  const dropSeconds = Math.min(0.7, Math.max(0.3, 0.28 + drop / 650));

  if (t < dropSeconds) {
    // Sinking the last stretch: it keeps its speed and gathers a little more.
    const q = t / dropSeconds;
    p.x += (standX - p.x) * smooth(q);
    p.y += (standY - p.y) * (0.4 * q + 0.6 * q * q);
    p.swayAngle += (-LAND_LEAN - p.swayAngle) * q;
    return;
  }

  const since = t - dropSeconds;
  let angle: number;
  if (since < TOPPLE_SECONDS) {
    // Tipping over like a falling pole: slow at first, fastest when it hits.
    const fall = 1 - Math.cos((since / TOPPLE_SECONDS) * (Math.PI / 2));
    angle = LAND_LEAN + (REST_ANGLE - LAND_LEAN) * fall;
  } else {
    const b = since - TOPPLE_SECONDS;
    angle =
      REST_ANGLE - BOUNCE * Math.exp(-BOUNCE_DECAY * b) * Math.abs(Math.sin(BOUNCE_SPEED * b));
  }
  const tipY = rest.y - tipLift(angle);
  p.x = rest.x - Math.sin(angle) * TIP_BELOW_CENTER;
  p.y = tipY - Math.cos(angle) * TIP_BELOW_CENTER;
  p.swayAngle = -angle;
  p.slack = smooth((since - SLACK_DELAY) / SLACK_SECONDS);
}

/** Seconds since the anchor reached the sea floor, or -1 while it has not (or betting is open). */
export function landingSeconds(state: RenderState): number {
  if (state.phase === "idle" || state.shipImpact === null) return -1;
  return Math.max(0, state.shipImpact.elapsed);
}

// ----- Slack chain path (reused across frames) -----

const SLACK_MAX_POINTS = 400;
const slackXs = new Float64Array(SLACK_MAX_POINTS);
const slackYs = new Float64Array(SLACK_MAX_POINTS);
const slackLen = new Float64Array(SLACK_MAX_POINTS);
/** Screen Y the slack path is built up to; the chain above it is off screen. */
const SLACK_TOP_Y = -30;
/**
 * The settled chain, as control points relative to the ring (x) and the sand
 * (y, up is negative): down from the ring, along the sand, round in a loose
 * coil, then up toward the surface. The first and last points are set per frame.
 */
const COIL = [
  0, 0, -8, -10, -20, -3, -38, -3, -52, -10, -50, -22, -36, -27, -22, -21, -13, -36, -8, -66, -5,
  -120, 0, 0,
];
const COIL_POINTS = COIL.length / 2;
const coilX = new Float64Array(COIL_POINTS);
const coilY = new Float64Array(COIL_POINTS);

/**
 * Builds the slack chain path into slackXs / slackYs (point 0 at the ring) and
 * returns the number of points. `slack` blends from the taut line (0) to the
 * settled coil (1).
 */
function buildSlackPath(p: AnchorPose): number {
  // Top of the visible chain: where the taut line crosses SLACK_TOP_Y.
  let topX = p.chainStartX;
  let topY = p.chainStartY;
  if (topY < SLACK_TOP_Y && p.chainEndY > SLACK_TOP_Y) {
    topX += ((p.chainEndX - topX) * (SLACK_TOP_Y - topY)) / (p.chainEndY - topY);
    topY = SLACK_TOP_Y;
  }
  const floor = p.floorY - 4; // link centres rest just above the sand
  for (let i = 0; i < COIL_POINTS; i++) {
    coilX[i] = p.chainEndX + COIL[i * 2];
    coilY[i] = floor + COIL[i * 2 + 1];
  }
  coilY[0] = p.chainEndY;
  coilX[COIL_POINTS - 1] = topX;
  coilY[COIL_POINTS - 1] = topY;

  // Catmull-Rom through the control points, sampled about every 4 px.
  slackXs[0] = coilX[0];
  slackYs[0] = coilY[0];
  slackLen[0] = 0;
  let n = 1;
  for (let i = 0; i < COIL_POINTS - 1 && n < SLACK_MAX_POINTS; i++) {
    const i0 = Math.max(0, i - 1);
    const i3 = Math.min(COIL_POINTS - 1, i + 2);
    const x0 = coilX[i0];
    const y0 = coilY[i0];
    const x1 = coilX[i];
    const y1 = coilY[i];
    const x2 = coilX[i + 1];
    const y2 = coilY[i + 1];
    const x3 = coilX[i3];
    const y3 = coilY[i3];
    const span = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(2, Math.ceil(span / 4));
    // Tangents limited to the span, so the long last stretch cannot overshoot.
    const k1 = Math.min(1, span / (Math.hypot(x2 - x0, y2 - y0) || 1));
    const k2 = Math.min(1, span / (Math.hypot(x3 - x1, y3 - y1) || 1));
    const m1x = (x2 - x0) * k1;
    const m1y = (y2 - y0) * k1;
    const m2x = (x3 - x1) * k2;
    const m2y = (y3 - y1) * k2;
    for (let j = 1; j <= steps && n < SLACK_MAX_POINTS; j++) {
      const u = j / steps;
      const u2 = u * u;
      const u3 = u2 * u;
      const h1 = 2 * u3 - 3 * u2 + 1;
      const h2 = u3 - 2 * u2 + u;
      const h3 = -2 * u3 + 3 * u2;
      const h4 = u3 - u2;
      const x = h1 * x1 + h2 * m1x + h3 * x2 + h4 * m2x;
      const y = Math.min(floor, h1 * y1 + h2 * m1y + h3 * y2 + h4 * m2y);
      slackLen[n] = slackLen[n - 1] + Math.hypot(x - slackXs[n - 1], y - slackYs[n - 1]);
      slackXs[n] = x;
      slackYs[n] = y;
      n++;
    }
  }

  // Blend toward the taut line (ring → top), point for point by path fraction.
  const e = p.slack;
  if (e < 1) {
    const total = slackLen[n - 1] || 1;
    const x0 = slackXs[0];
    const y0 = slackYs[0];
    for (let i = 1; i < n; i++) {
      const f = slackLen[i] / total;
      const lx = x0 + (topX - x0) * f;
      const ly = y0 + (topY - y0) * f;
      slackXs[i] = lx + (slackXs[i] - lx) * e;
      slackYs[i] = ly + (slackYs[i] - ly) * e;
    }
  }
  return n;
}

/**
 * Anchor and chain placement for one frame — presentation only, derived from
 * the depth, the viewport and the animation clock. The returned object is
 * reused by the next call.
 */
export function anchorPose(
  worldY: number,
  camera: Camera,
  animTime: number,
  landing = -1,
): AnchorPose {
  const { w, h } = camera.viewport;
  const shipScreenY = camera.worldToScreenY(SHIP_WORLD_Y);
  const launch = launchProgress(worldY, w, h);

  const pinY = anchorPinY(h);
  const fullX = anchorSwayX(animTime, w);
  const fullAngle = Math.sin(animTime * 1.8) * 0.22 + Math.sin(animTime * 0.9) * 0.05;
  // Ring above the sprite centre; its position accounts for rotation around that centre.
  const ringOffsetFromCenter = ANCHOR_DRAW_H * (0.5 - ANCHOR_RING_Y_FRAC);

  pose.chainStartX = w / 2;
  pose.slack = 0;
  pose.fromHull = launch < 1;
  if (pose.fromHull) {
    // Chain from the hull's attachment point, which floats with the ship. The
    // ship's motion and the anchor's response fade out as the launch completes.
    const motion = 1 - launch;
    const scale = shipScale(w);
    shipChainAttach(animTime, motion, SHIP_CHAIN_ATTACH_DY, scale, attachNow);
    shipChainAttach(
      animTime - ANCHOR_FOLLOW_LAG,
      motion,
      SHIP_CHAIN_ATTACH_DY,
      scale,
      attachLagged,
    );
    // Rest chain: just long enough to clear the (possibly scaled-down) hull.
    const restChain = ANCHOR_REST_CHAIN_PX - ANCHOR_REST_CHAIN_HULL_PX * (1 - scale);
    pose.chainStartX = w / 2 + attachNow.x;
    pose.chainStartY = shipScreenY + attachNow.y;
    // Rest pose: a pendulum hanging from the hawse hole at depth 0. It swings
    // on its own and trails the hull's sideways movement (the lagged
    // attachment), so it repeats the ship's motion a moment later.
    const theta =
      (Math.sin(animTime * ANCHOR_REST_SWING_SPEED) * ANCHOR_REST_SWING +
        Math.sin(animTime * 0.71 + 1.1) * ANCHOR_REST_SWING_2 +
        ((attachLagged.x - attachNow.x) * ANCHOR_FOLLOW_GAIN) / ANCHOR_REST_CHAIN_PX) *
      motion;
    const reach = restChain + CHAIN_END_ABOVE_RING + ringOffsetFromCenter; // pivot → sprite centre
    const pivotX = w / 2 + attachNow.x;
    const pivotY = presentedShipRestY(w, h) + attachNow.y;
    const restX = pivotX + Math.sin(theta) * reach;
    const restY = pivotY + Math.cos(theta) * reach;
    // Launch: ease from the rest pose to the pinned, swaying diving pose.
    pose.x = restX + (fullX - restX) * launch;
    pose.y = restY + (pinY - restY) * launch;
    pose.swayAngle = -theta + (fullAngle + theta) * launch; // the sprite hangs along the chain
  } else {
    // Normal diving — the ship is off screen. Previous formulas, verbatim.
    pose.chainStartY = Math.min(shipScreenY + SHIP_CHAIN_ATTACH_DY, 0);
    pose.x = fullX;
    pose.y = pinY;
    pose.swayAngle = fullAngle;
    if (landing >= 0) applyLanding(pose, landing, camera);
  }

  pose.chainEndX = pose.x + Math.sin(pose.swayAngle) * ringOffsetFromCenter;
  pose.chainEndY = pose.y - Math.cos(pose.swayAngle) * ringOffsetFromCenter - CHAIN_END_ABOVE_RING;
  return pose;
}

export const actorLayer: RenderLayer = {
  name: "actor",
  render(ctx, state, camera, time) {
    const p = anchorPose(state.worldY, camera, time.animTime, landingSeconds(state));

    // Anchor sprite (in front of shipwreck so it lands ON the ship)
    drawAnchor(
      ctx,
      p.x,
      p.y,
      p.swayAngle,
      state.crashed,
      state.boost,
      ANCHOR_DRAW_H,
      assets.get("anchor"),
    );

    // Chain from the ship down to the anchor's shackle ring, drawn over the
    // anchor so its last link hooks over the ring. While the ship is
    // on screen the chain is cut at the hull's hawse hole, so it visibly comes
    // out of the hole instead of overlapping the hull above it.
    if (p.fromHull) {
      const { w, h } = camera.viewport;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, p.chainStartY - 2, w, h - p.chainStartY + 2);
      ctx.clip();
      drawChain(ctx, p.chainStartX, p.chainStartY, p.chainEndX, p.chainEndY, time.animTime);
      ctx.restore();
    } else if (p.slack > 0) {
      drawChainPath(ctx, slackXs, slackYs, buildSlackPath(p));
    } else {
      drawChain(ctx, p.chainStartX, p.chainStartY, p.chainEndX, p.chainEndY, time.animTime);
    }
  },
};
