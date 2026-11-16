// E-X7 — Chain Snapped animation (rendering only). These tests pin:
// the renderer-owned crash clock (latch, no re-trigger, reset, remount,
// backwards clock, consecutive rounds); break geometry against the chain's
// own sampled links (continuity at elapsed 0, the detached count, parity, no
// duplicated or dropped link, short chains); inextensibility and the fixed
// attachment; damping and the exact settle by 2.3 s; determinism across frame
// intervals; the anchor's fall, including the near-floor landing; and that
// every non-crashed path is drawn exactly as before.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAIN_MAX_DEPTH } from "@/shared/world";

// The draw calls are observed; the layout functions stay real.
vi.mock("../draw/anchor", () => ({ drawAnchor: vi.fn() }));
vi.mock("../draw/chain", async (importOriginal) => {
  const real = await importOriginal<typeof import("../draw/chain")>();
  return { ...real, drawChain: vi.fn(), drawChainPath: vi.fn(), drawChainLinks: vi.fn() };
});

import { Camera } from "../camera";
import { drawAnchor } from "../draw/anchor";
import {
  CHAIN_LINK_PITCH,
  CHAIN_LINK_STRIDE,
  drawChain,
  drawChainLinks,
  drawChainPath,
  layoutChain,
  layoutChainPath,
  type ChainLayout,
} from "../draw/chain";
import type { ChainSnapTiming, Phase, RenderState } from "../render-state";
import { actorLayer, anchorPose } from "./actor";
import {
  CHAIN_SNAP_DETACH_LINKS,
  CHAIN_SNAP_SETTLE_SECONDS,
  ChainSnapClock,
  chainSnapBreak,
  layoutDetachedLinks,
  layoutUpperChain,
  prepareChainSnap,
  snapAnchorFall,
  snapBend,
  snapRecoil,
  snapRelax,
  upperChainPoints,
} from "./chain-snap";
import { presentationOffsetY } from "./presentation";
import snapSource from "./chain-snap.ts?raw";

// ----- Helpers -----

interface Link {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  a: number;
}

function copyLinks(l: ChainLayout): { first: number; list: Link[] } {
  const list: Link[] = [];
  for (let i = 0; i < l.count; i++) {
    const o = i * CHAIN_LINK_STRIDE;
    const d = l.data;
    list.push({ cx: d[o], cy: d[o + 1], ux: d[o + 2], uy: d[o + 3], a: d[o + 4] });
  }
  return { first: l.first, list };
}

function expectSameLink(a: Link, b: Link, eps = 1e-6) {
  expect(Math.abs(a.cx - b.cx)).toBeLessThan(eps);
  expect(Math.abs(a.cy - b.cy)).toBeLessThan(eps);
  expect(Math.abs(a.ux - b.ux)).toBeLessThan(eps);
  expect(Math.abs(a.uy - b.uy)).toBeLessThan(eps);
  expect(Math.abs(a.a - b.a)).toBeLessThan(eps);
}

function cameraAt(worldY: number, w: number, h: number): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  camera.setPresentationOffset(presentationOffsetY(worldY, w, h));
  return camera;
}

const FD = 1 / 120;

/** Break-time pose scalars + prepared break, exactly as the actor layer derives them. */
function breakAt(worldY: number, camera: Camera, t: number) {
  let p = anchorPose(worldY, camera, t);
  const s = {
    x: p.x,
    y: p.y,
    a: p.swayAngle,
    csx: p.chainStartX,
    csy: p.chainStartY,
    cex: p.chainEndX,
    cey: p.chainEndY,
    fromHull: p.fromHull,
  };
  p = anchorPose(worldY, camera, t - FD);
  const vx = (s.x - p.x) / FD;
  prepareChainSnap({
    t,
    anchorX: s.x,
    anchorY: s.y,
    anchorAngle: s.a,
    anchorVx: vx,
    anchorVy: (s.y - p.y) / FD,
    anchorVa: (s.a - p.swayAngle) / FD,
    chainStartX: s.csx,
    chainStartY: s.csy,
    chainEndX: s.cex,
    chainEndY: s.cey,
    chainEndVx: (s.cex - p.chainEndX) / FD,
  });
  return { ...s, vx };
}

/** The upper chain's links at `t`, laid out as the actor layer draws them. */
function upperLinks(t: number, ax: number, ay: number) {
  const n = layoutUpperChain(t, ax, ay);
  const { xs, ys } = upperChainPoints();
  return { n, ...copyLinks(layoutChainPath(xs, ys, n, undefined, chainSnapBreak().detached)) };
}

/** Joint-to-joint lengths of a link list (lower joint = centre + dir × half chord). */
function polylineLength(n: number): number {
  const { xs, ys } = upperChainPoints();
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  return len;
}

const W = 390;
const H = 844;
const T = 12.3;
/** Early (rest chain under the hull), launch, middle, deep and near-floor crash depths. */
const DEPTHS = [3, 60, 2000, 3800, CHAIN_MAX_DEPTH - 40];
const VIEWPORTS: Array<[number, number]> = [
  [375, 667],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
];

// ----- Clock -----

describe("ChainSnapClock", () => {
  const step = (c: ChainSnapClock, phase: Phase, t: number) => {
    const r = c.update(phase, t);
    return r === null ? null : { startedAt: r.startedAt, elapsed: r.elapsed };
  };

  it("latches once on entering crashed, counts up, and never re-triggers", () => {
    const c = new ChainSnapClock();
    expect(step(c, "diving", 9.9)).toBeNull();
    expect(step(c, "crashed", 10)).toEqual({ startedAt: 10, elapsed: 0 });
    expect(step(c, "crashed", 10.5)).toEqual({ startedAt: 10, elapsed: 0.5 });
    expect(step(c, "crashed", 12.3)?.startedAt).toBe(10);
  });

  it("resets on leaving crashed and latches afresh in the next crashed round", () => {
    const c = new ChainSnapClock();
    step(c, "diving", 1);
    step(c, "crashed", 2);
    expect(step(c, "idle", 4.4)).toBeNull();
    step(c, "diving", 9);
    expect(step(c, "crashed", 15)).toEqual({ startedAt: 15, elapsed: 0 });
  });

  it("shows the settled result when the first frame it sees is already crashed (remount)", () => {
    const c = new ChainSnapClock();
    const r = step(c, "crashed", 50);
    expect(r?.elapsed).toBeCloseTo(CHAIN_SNAP_SETTLE_SECONDS, 12);
    expect(step(c, "crashed", 50.1)?.elapsed).toBeCloseTo(CHAIN_SNAP_SETTLE_SECONDS + 0.1, 12);
  });

  it("treats a backwards clock during a crash as a discontinuity: settled, never negative", () => {
    const c = new ChainSnapClock();
    step(c, "diving", 1);
    step(c, "crashed", 2);
    step(c, "crashed", 2.5);
    const r = step(c, "crashed", 1.2);
    expect(r?.elapsed).toBeCloseTo(CHAIN_SNAP_SETTLE_SECONDS, 12);
    expect(r!.elapsed).toBeGreaterThanOrEqual(0);
  });

  it("gives the same elapsed time for the same clock reading at any frame interval", () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144, 0.1]) {
      const c = new ChainSnapClock();
      step(c, "diving", 4.9);
      step(c, "crashed", 5);
      let t = 5;
      while (t + dt < 6) {
        t += dt;
        step(c, "crashed", t);
      }
      expect(step(c, "crashed", 6)?.elapsed).toBeCloseTo(1, 12);
    }
  });
});

// ----- Geometry at the break (Checkpoint A) -----

describe("break geometry", () => {
  it("is the unbroken chain at elapsed 0: same links, same parity, none added or dropped", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of DEPTHS) {
        const camera = cameraAt(worldY, w, h);
        const s = breakAt(worldY, camera, T);
        const original = copyLinks(layoutChain(s.csx, s.csy, s.cex, s.cey, T));
        const nd = chainSnapBreak().detached;
        expect(chainSnapBreak().links).toBe(original.list.length);
        expect(nd).toBe(Math.min(CHAIN_SNAP_DETACH_LINKS, original.list.length - 1));

        const det = copyLinks(layoutDetachedLinks(0, s.cex, s.cey, s.vx, 1, 1, Infinity));
        const up = upperLinks(0, s.csx, s.csy);
        expect(det.first).toBe(0);
        expect(det.list.length).toBe(nd);
        expect(up.first).toBe(nd); // keeps the face-on / edge-on alternation
        expect(det.list.length + up.list.length).toBe(original.list.length);
        const joined = [...det.list, ...up.list];
        for (let i = 0; i < joined.length; i++) expectSameLink(joined[i], original.list[i]);
      }
    }
  });

  it("detaches exactly four links on a normal chain, fewer on a short one, and keeps one hanging", () => {
    const camera = cameraAt(2000, W, H);
    breakAt(2000, camera, T);
    expect(chainSnapBreak().detached).toBe(4);

    // Hand-built short chains: 1, 2, 3, 5 links.
    for (const span of [10, 20, 33, 60]) {
      prepareChainSnap({
        t: 0,
        anchorX: 100,
        anchorY: 200,
        anchorAngle: 0,
        anchorVx: 0,
        anchorVy: 0,
        anchorVa: 0,
        chainStartX: 100,
        chainStartY: 100,
        chainEndX: 100,
        chainEndY: 100 + span,
        chainEndVx: 0,
      });
      const links = layoutChain(100, 100, 100, 100 + span, 0).count;
      const b = chainSnapBreak();
      expect(b.links).toBe(links);
      expect(b.detached).toBe(Math.min(4, links - 1));
      const up = upperLinks(0, 100, 100);
      expect(up.list.length).toBe(links - b.detached);
      expect(up.list.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("splits at the true break joint, not at the anchor ring", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    layoutUpperChain(0, s.csx, s.csy);
    const { xs, ys } = upperChainPoints();
    // Arc length 4 × pitch from the ring along a nearly straight chain.
    const d = Math.hypot(xs[0] - s.cex, ys[0] - s.cey);
    expect(d).toBeGreaterThan(4 * CHAIN_LINK_PITCH - 0.05);
    expect(d).toBeLessThanOrEqual(4 * CHAIN_LINK_PITCH + 1e-9);
    // The detached chain's top joint (rebuilt from its links) is the upper chain's free end.
    const det = copyLinks(layoutDetachedLinks(0, s.cex, s.cey, s.vx, 1, 1, Infinity)).list;
    let jx = s.cex;
    let jy = s.cey;
    for (const k of det) {
      jx = 2 * k.cx - jx;
      jy = 2 * k.cy - jy;
    }
    expect(Math.hypot(jx - xs[0], jy - ys[0])).toBeLessThan(1e-6);
  });
});

// ----- Motion (Checkpoint B) -----

describe("upper chain motion", () => {
  const TIMES = Array.from({ length: 241 }, (_, i) => i / 100); // 0 … 2.4 s

  it("never stretches: the chain is its break length less the recoil, and the joints stay one pitch apart", () => {
    for (const worldY of [60, 2000]) {
      const camera = cameraAt(worldY, W, H);
      const s = breakAt(worldY, camera, T);
      const n0 = layoutUpperChain(0, s.csx, s.csy);
      const L0 = polylineLength(n0);
      for (const t of TIMES) {
        const n = layoutUpperChain(t, s.csx, s.csy);
        expect(polylineLength(n)).toBeCloseTo(L0 - snapRecoil(t), 6);
        const { list } = upperLinks(t, s.csx, s.csy);
        // Chord between consecutive link centres stays within the curve tolerance of one pitch.
        // D-T1: the same bounds on every link, asserted once per time step on the
        // shortest and longest chord instead of twice per link. A NaN chord fails
        // the Number.isFinite check, as it failed the per-link comparisons.
        let min = Infinity;
        let max = -Infinity;
        let finite = true;
        for (let i = 1; i < list.length - 1; i++) {
          const d = Math.hypot(list[i].cx - list[i - 1].cx, list[i].cy - list[i - 1].cy);
          if (!Number.isFinite(d)) finite = false;
          if (d < min) min = d;
          if (d > max) max = d;
        }
        if (list.length > 2) {
          expect(finite).toBe(true);
          expect(min).toBeGreaterThan(CHAIN_LINK_PITCH - 0.6);
          expect(max).toBeLessThan(CHAIN_LINK_PITCH + 1e-6);
        }
      }
    }
  });

  it("keeps the attachment exactly fixed", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    for (const t of TIMES) {
      const n = layoutUpperChain(t, s.csx, s.csy);
      const { xs, ys } = upperChainPoints();
      expect(xs[n - 1]).toBe(s.csx);
      expect(ys[n - 1]).toBe(s.csy);
    }
  });

  it("recoils upward sharply within the first 120 ms", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    layoutUpperChain(0, s.csx, s.csy);
    const y0 = upperChainPoints().ys[0];
    layoutUpperChain(0.1, s.csx, s.csy);
    expect(upperChainPoints().ys[0]).toBeLessThan(y0 - 25);
    expect(snapRecoil(0.1)).toBeGreaterThan(25);
  });

  it("swings with decreasing amplitude and settles exactly by 2.3 s", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    const n = layoutUpperChain(CHAIN_SNAP_SETTLE_SECONDS, s.csx, s.csy);
    const { xs, ys } = upperChainPoints();
    const finalX = xs[0];
    const finalY = ys[0];
    // Settled: hanging straight down, motion terms exactly zero.
    for (let i = 0; i < n; i++) expect(xs[i]).toBeCloseTo(s.csx, 9);
    const peak = (a: number, b: number) => {
      let m = 0;
      for (let t = a; t < b; t += 0.005) {
        layoutUpperChain(t, s.csx, s.csy);
        m = Math.max(m, Math.abs(upperChainPoints().xs[0] - finalX));
      }
      return m;
    };
    const p1 = peak(0, 0.6);
    const p2 = peak(0.6, 1.2);
    const p3 = peak(1.2, 2.3);
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
    for (const t of [2.3, 2.33, 2.37, 2.4, 3]) {
      expect(snapRecoil(t) === 0).toBe(true);
      expect(snapRelax(t) === 0).toBe(true);
      expect(snapBend(0, t) === 0).toBe(true);
      layoutUpperChain(t, s.csx, s.csy);
      expect(upperChainPoints().xs[0]).toBe(finalX);
      expect(upperChainPoints().ys[0]).toBe(finalY);
    }
  });

  it("starts the wave at the free end and carries it up the chain", () => {
    breakAt(2000, cameraAt(2000, W, H), T);
    // Nothing bends at the break instant.
    for (const sigma of [0, 50, 300, 900]) expect(snapBend(sigma, 0) === 0).toBe(true);
    // 500 px up the chain (above the 320 px pendulum swing) only the whip
    // wave moves it: still at 0.2 s (front at 130 px), moving by 0.9 s.
    expect(snapBend(500, 0.2) === 0).toBe(true);
    expect(Math.abs(snapBend(500, 0.9))).toBeGreaterThan(0);
    // Near the free end it moves at once.
    expect(Math.abs(snapBend(5, 0.05))).toBeGreaterThan(0.05);
  });

  it("is a pure function of the time since the break (any frame interval)", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    const target = 0.731;
    const direct = upperLinks(target, s.csx, s.csy).list;
    for (const dt of [1 / 30, 1 / 144]) {
      for (let t = 0; t < target; t += dt) upperLinks(t, s.csx, s.csy);
      expect(upperLinks(target, s.csx, s.csy).list).toEqual(direct);
    }
  });
});

describe("anchor and detached links", () => {
  it("falls from the break pose with water drag: continuous start, accelerating, bounded tilt", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    const f0 = { ...snapAnchorFall(0) };
    expect(f0.x).toBe(s.x);
    expect(f0.y).toBe(s.y);
    expect(f0.angle).toBeCloseTo(s.a, 12);
    let prevY = f0.y;
    let prevV = 0;
    for (let t = 0.02; t <= 2.4; t += 0.02) {
      const f = snapAnchorFall(t);
      const v = (f.y - prevY) / 0.02;
      expect(v).toBeGreaterThan(prevV - 1e-6); // speeds up toward terminal
      expect(v).toBeLessThan(620 + 1e-6);
      expect(Math.abs(f.angle)).toBeLessThan(0.35); // tilts, never spins
      prevY = f.y;
      prevV = v;
    }
    // Leaves the view before the crashed phase ends.
    expect(snapAnchorFall(1.6).y).toBeGreaterThan(H + 155);
  });

  it("carries the detached links without stretching them", () => {
    const camera = cameraAt(2000, W, H);
    const s = breakAt(2000, camera, T);
    const len0 = copyLinks(layoutDetachedLinks(0, s.cex, s.cey, s.vx, 1, 1, Infinity)).list;
    for (let t = 0; t <= 2.4; t += 0.05) {
      const f = snapAnchorFall(t);
      const list = copyLinks(layoutDetachedLinks(t, f.x, f.y, f.vx, 1, 1, Infinity)).list;
      expect(list.length).toBe(4);
      // consecutive centres one chord apart, as at the break
      for (let i = 1; i < list.length; i++) {
        const d = Math.hypot(list[i].cx - list[i - 1].cx, list[i].cy - list[i - 1].cy);
        const d0 = Math.hypot(len0[i].cx - len0[i - 1].cx, len0[i].cy - len0[i - 1].cy);
        expect(d).toBeLessThan(CHAIN_LINK_PITCH + 1e-6);
        expect(d).toBeGreaterThan(Math.min(d0, CHAIN_LINK_PITCH) * 0.5);
      }
      // The first link still hangs from the ring.
      const k = list[0];
      const half = CHAIN_LINK_PITCH / 2;
      expect(Math.hypot(k.cx + k.ux * half - f.x, k.cy + k.uy * half - f.y)).toBeLessThan(0.05);
    }
  });

  it("lays links on the sand without stretching them or sinking below it", () => {
    breakAt(2000, cameraAt(2000, W, H), T);
    const floor = 500;
    const list = copyLinks(layoutDetachedLinks(2, 200, 490, 0, 0, -1, floor)).list;
    for (const k of list) expect(k.cy).toBeLessThanOrEqual(floor - 4 + 1e-9);
    expect(list[list.length - 1].cx).toBeLessThan(200); // lying toward the ring side
  });
});

// ----- Source-level guarantees -----

describe("chain-snap module", () => {
  it("uses no timers, wall clocks or randomness", () => {
    expect(snapSource).not.toMatch(
      /setTimeout|setInterval|requestAnimationFrame|Date\.now|performance\.now|Math\.random/,
    );
  });

  it("reuses its buffers frame to frame", () => {
    breakAt(2000, cameraAt(2000, W, H), T);
    const a = upperChainPoints();
    layoutUpperChain(0.3, 0, 0);
    const b = upperChainPoints();
    expect(b.xs).toBe(a.xs);
    expect(layoutDetachedLinks(0.3, 0, 0, 0, 1, 1, Infinity)).toBe(
      layoutDetachedLinks(0.4, 0, 0, 0, 1, 1, Infinity),
    );
  });
});

// ----- Actor layer integration -----

const anchorCalls = vi.mocked(drawAnchor);
const chainCalls = vi.mocked(drawChain);
const pathCalls = vi.mocked(drawChainPath);
const linkCalls = vi.mocked(drawChainLinks);

const ctx = {
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
} as unknown as CanvasRenderingContext2D;

function state(
  worldY: number,
  phase: Phase,
  chainSnap?: ChainSnapTiming,
  shipImpact: RenderState["shipImpact"] = null,
): RenderState {
  return {
    phase,
    worldY,
    depthRatio: 0,
    boost: 0,
    creatures: [],
    crashed: phase === "crashed",
    shipImpact,
    chainSnap,
  };
}

/** Every link the actor layer drew this frame, anchor end first. */
function drawnLinks(): Link[] {
  const out: Link[] = [];
  for (const c of linkCalls.mock.calls) out.push(...copyLinks(c[1]).list);
  for (const c of pathCalls.mock.calls) {
    const [, xs, ys, n, first] = c;
    out.push(...copyLinks(layoutChainPath(xs, ys, n, undefined, first ?? 0)).list);
  }
  for (const c of chainCalls.mock.calls) {
    const [, x1, y1, x2, y2, t] = c;
    out.push(...copyLinks(layoutChain(x1, y1, x2, y2, t)).list);
  }
  return out;
}

function renderActor(s: RenderState, camera: Camera, animTime: number) {
  anchorCalls.mockClear();
  chainCalls.mockClear();
  pathCalls.mockClear();
  linkCalls.mockClear();
  actorLayer.render(ctx, s, camera, { animTime, frameDt: 1 / 60 });
}

describe("actor layer while crashed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("draws the unbroken chain and anchor at elapsed 0, at early, middle and near-floor depths", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of DEPTHS) {
        const camera = cameraAt(worldY, w, h);
        renderActor(state(worldY, "diving"), camera, T);
        const before = drawnLinks();
        const anchorBefore = anchorCalls.mock.calls[0].slice(1, 4);
        renderActor(state(worldY, "crashed", { startedAt: T, elapsed: 0 }), camera, T);
        const after = drawnLinks();
        expect(after.length).toBe(before.length);
        for (let i = 0; i < after.length; i++) expectSameLink(after[i], before[i]);
        const anchorAfter = anchorCalls.mock.calls[0].slice(1, 4) as number[];
        for (let i = 0; i < 3; i++) {
          expect(anchorAfter[i]).toBeCloseTo(anchorBefore[i] as number, 9);
        }
        expect(anchorCalls.mock.calls[0][4]).toBe(true); // the crack overlay stays on
      }
    }
  });

  it("near the sea floor lands the anchor on the existing landing rest pose", () => {
    const worldY = CHAIN_MAX_DEPTH - 40;
    const camera = cameraAt(worldY, W, H);
    const rest = { ...anchorPose(worldY, camera, 0, 10) }; // landing fully settled
    renderActor(state(worldY, "crashed", { startedAt: T, elapsed: 2.4 }), camera, T + 2.4);
    const [, x, y, a] = anchorCalls.mock.calls[0] as unknown as number[];
    // Within the landing bounce's residual (< 0.01 px / 5e-4 rad by 2.4 s).
    expect(Math.abs(x - rest.x)).toBeLessThan(0.01);
    expect(Math.abs(y - rest.y)).toBeLessThan(0.01);
    expect(Math.abs(a - rest.swayAngle)).toBeLessThan(5e-4);
    // Already resting at the end of the 2.3 s settle.
    renderActor(state(worldY, "crashed", { startedAt: T, elapsed: 2.3 }), camera, T + 2.3);
    const [, x23, y23] = anchorCalls.mock.calls[0] as unknown as number[];
    expect(Math.abs(x23 - rest.x)).toBeLessThan(0.05);
    expect(Math.abs(y23 - rest.y)).toBeLessThan(0.05);
    renderActor(state(worldY, "crashed", { startedAt: T, elapsed: 2.4 }), camera, T + 2.4);
    // The detached links lie above the sand.
    for (const k of copyLinks(linkCalls.mock.calls[0][1]).list) {
      expect(k.cy).toBeLessThanOrEqual(rest.floorY);
    }
  });

  it("mid-dive: the anchor falls out of view; the chain stays hanging from its attachment", () => {
    const camera = cameraAt(2000, W, H);
    const top = anchorPose(2000, camera, T).chainStartY;
    renderActor(state(2000, "crashed", { startedAt: T, elapsed: 0.5 }), camera, T + 0.5);
    const y05 = (anchorCalls.mock.calls[0] as unknown as number[])[2];
    expect(y05).toBeGreaterThan(anchorPose(2000, camera, T).y + 60);
    renderActor(state(2000, "crashed", { startedAt: T, elapsed: 2.4 }), camera, T + 2.4);
    expect(anchorCalls).not.toHaveBeenCalled(); // fallen out of view
    expect(linkCalls).not.toHaveBeenCalled();
    const [, xs, ys, n, first] = pathCalls.mock.calls[0];
    expect(first).toBe(4);
    expect(ys[n - 1]).toBe(top);
    expect(xs[n - 1]).toBe(W / 2);
  });

  it("two consecutive crashed rounds rebuild the break for each round", () => {
    const camera = cameraAt(2000, W, H);
    renderActor(state(2000, "crashed", { startedAt: T, elapsed: 0 }), camera, T);
    const a = drawnLinks();
    const camera2 = cameraAt(1500, W, H);
    renderActor(state(1500, "crashed", { startedAt: 40, elapsed: 0 }), camera2, 40);
    const b = drawnLinks();
    renderActor(state(1500, "diving"), camera2, 40);
    const expected = drawnLinks();
    expect(b.length).toBe(expected.length);
    for (let i = 0; i < b.length; i++) expectSameLink(b[i], expected[i]);
    expect(b.length).not.toBe(a.length);
  });
});

describe("actor layer outside the snap: unchanged", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores chainSnap in every other phase, and crashed without it draws as before", () => {
    const camera = cameraAt(2000, W, H);
    const snap = { startedAt: T, elapsed: 1 };
    for (const phase of ["idle", "diving", "cashed", "bonus"] as Phase[]) {
      renderActor(state(2000, phase, snap), camera, T + 1);
      const p = anchorPose(2000, camera, T + 1);
      expect(chainCalls).toHaveBeenCalledTimes(1);
      expect(chainCalls.mock.calls[0].slice(1)).toEqual([
        p.chainStartX,
        p.chainStartY,
        p.chainEndX,
        p.chainEndY,
        T + 1,
      ]);
      expect(linkCalls).not.toHaveBeenCalled();
    }
    renderActor(state(2000, "crashed"), camera, T + 1);
    expect(chainCalls).toHaveBeenCalledTimes(1);
    expect(anchorCalls.mock.calls[0][4]).toBe(true);
  });

  it("keeps the jackpot landing's slack chain path exactly as before", () => {
    const worldY = CHAIN_MAX_DEPTH;
    const camera = cameraAt(worldY, W, H);
    renderActor(state(worldY, "diving", undefined, { elapsed: 2 }), camera, 30);
    expect(pathCalls).toHaveBeenCalledTimes(1);
    expect(pathCalls.mock.calls[0].length).toBe(4); // no firstIndex: link 0 at the ring
    expect(linkCalls).not.toHaveBeenCalled();
    const p = anchorPose(worldY, camera, 30, 2);
    expect(anchorCalls.mock.calls[0].slice(1, 4)).toEqual([p.x, p.y, p.swayAngle]);
  });
});
