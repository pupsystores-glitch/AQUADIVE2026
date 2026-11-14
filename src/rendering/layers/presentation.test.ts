// Pre-dive presentation: the betting-phase surface view, the ship shifted into
// view on short viewports, the anchor swinging under the ship on a short
// chain, a continuous launch, and bit-identical normal diving once the ship
// is off screen.
import { describe, expect, it } from "vitest";
import { SHIP_WORLD_Y } from "@/shared/world";
import { Camera } from "../camera";
import {
  ANCHOR_DRAW_H,
  ANCHOR_LAUNCH_MIN_RANGE_PX,
  ANCHOR_REST_CHAIN_PX,
  ANCHOR_RING_Y_FRAC,
  SHIP_CHAIN_ATTACH_DY,
  SHIP_CULL_MARGIN_TOP,
  SHIP_REST_MIN_Y,
} from "../constants";
import type { RenderState } from "../render-state";
import { shipChainAttach } from "../draw/ship";
import { anchorPinY, anchorPose, anchorSwayX } from "./actor";
import {
  launchProgress,
  presentationOffsetY,
  presentedShipRestY,
  presentState,
  shipRestScreenY,
} from "./presentation";

// The logical viewports the session produces at the tested screen sizes:
// 375×667 and 390×844 phones (scene fit at the 0.84 minimum scale), 768×1024
// and 1366×768 (820 tall via the scene fit), 1920×1080 (native).
const VIEWPORTS: Array<[number, number]> = [
  [375 / 0.84, 427 / 0.84],
  [390 / 0.84, 604 / 0.84],
  [907, 820],
  [1089, 820],
  [1422, 1046],
];
const PHONES = VIEWPORTS.slice(0, 2);
const TIMES = [0, 0.37, 2.5, 17.123];

/** The camera as SceneRenderer sets it up for a frame at `worldY`. */
function cameraAt(w: number, h: number, worldY: number): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  camera.setPresentationOffset(presentationOffsetY(worldY, h));
  return camera;
}

/** Depth at which the ship is culled and the launch is complete. */
const launchRange = (h: number) =>
  Math.max(ANCHOR_LAUNCH_MIN_RANGE_PX, presentedShipRestY(h) + SHIP_CULL_MARGIN_TOP);

const snapshot = (worldY: number, w: number, h: number, t: number) => {
  const p = { ...anchorPose(worldY, cameraAt(w, h, worldY), t) };
  p.swayAngle += 0; // −0 → 0: the sign of a zero angle is not observable
  return p;
};

const state = (over: Partial<RenderState>): RenderState => ({
  phase: "diving",
  worldY: 1500,
  depthRatio: 0.36,
  boost: 0.4,
  creatures: [{ kind: "goldfish", x: 0.5, worldY: 1600, size: 1, phase: 0, dir: 1 }],
  crashed: false,
  shipImpact: null,
  ...over,
});

describe("presentState", () => {
  it("shows the surface while betting, whatever depth the previous round ended at", () => {
    const view = presentState(state({ phase: "idle" }));
    expect(view.worldY).toBe(0);
    expect(view.depthRatio).toBe(0);
    expect(view.creatures).toEqual([]);
    expect(view.boost).toBe(0.4); // everything else passes through
    expect(view.phase).toBe("idle");
  });

  it("passes every other phase through untouched (same object)", () => {
    for (const phase of ["diving", "cashed", "crashed", "bonus"] as const) {
      const s = state({ phase });
      expect(presentState(s)).toBe(s);
    }
  });

  it("does not copy a betting state that is already at the surface, and never mutates its input", () => {
    const fresh = state({ phase: "idle", worldY: 0, depthRatio: 0, creatures: [] });
    expect(presentState(fresh)).toBe(fresh);
    const deep = Object.freeze(state({ phase: "idle" }));
    presentState(deep);
    expect(deep.worldY).toBe(1500);
  });
});

describe("launchProgress", () => {
  it("is 0 at the surface, 1 from the ship's culling depth on, and never decreases", () => {
    for (const [, h] of VIEWPORTS) {
      const range = launchRange(h);
      expect(launchProgress(0, h)).toBe(0);
      expect(launchProgress(range, h)).toBe(1);
      expect(launchProgress(range + 3000, h)).toBe(1);
      let prev = 0;
      for (let y = 0; y <= range; y += 1) {
        const p = launchProgress(y, h);
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
  });

  it("is safe for non-finite or negative depths", () => {
    expect(launchProgress(NaN, 820)).toBe(0);
    expect(launchProgress(-5, 820)).toBe(0);
    expect(launchProgress(Infinity, 820)).toBe(1);
  });
});

describe("presentationOffsetY", () => {
  it("rests the ship at SHIP_REST_MIN_Y on phone viewports, fully in view", () => {
    for (const [w, h] of PHONES) {
      expect(shipRestScreenY(h)).toBeLessThan(0); // pinned camera: ship above the top edge
      const shipY = cameraAt(w, h, 0).worldToScreenY(SHIP_WORLD_Y);
      expect(shipY).toBeCloseTo(SHIP_REST_MIN_Y, 9);
      expect(shipY - 22 - 8).toBeGreaterThan(0); // hull top, with heave, below the top edge
    }
  });

  it("is 0 on viewports 820 px and taller, so their view is unchanged", () => {
    for (const [, h] of VIEWPORTS.slice(2)) {
      for (const y of [0, 10, 100, 400]) expect(presentationOffsetY(y, h)).toBe(0);
    }
  });

  it("eases out over the launch: continuous, never increasing, 0 from the culling depth on", () => {
    for (const [, h] of PHONES) {
      const range = launchRange(h);
      let prev = presentationOffsetY(0, h);
      for (let y = 1; y <= range; y += 1) {
        const o = presentationOffsetY(y, h);
        expect(o).toBeLessThanOrEqual(prev);
        expect(prev - o).toBeLessThan(3); // per world px
        prev = o;
      }
      expect(presentationOffsetY(range, h)).toBe(0);
      expect(presentationOffsetY(4200, h)).toBe(0);
    }
  });
});

describe("anchorPose — betting (depth 0)", () => {
  it("hangs the anchor under the hull on a short chain from the hull attachment point", () => {
    const attach = { x: 0, y: 0 };
    for (const [w, h] of VIEWPORTS) {
      for (const t of TIMES) {
        const p = snapshot(0, w, h, t);
        const shipY = cameraAt(w, h, 0).worldToScreenY(SHIP_WORLD_Y);
        shipChainAttach(t, 1, SHIP_CHAIN_ATTACH_DY, attach);
        expect(p.fromHull).toBe(true);
        expect(p.chainStartX).toBe(w / 2 + attach.x);
        expect(p.chainStartY).toBe(shipY + attach.y);
        const len = Math.hypot(p.chainEndX - p.chainStartX, p.chainEndY - p.chainStartY);
        expect(Math.abs(len - ANCHOR_REST_CHAIN_PX)).toBeLessThan(8); // short, never stretched far
        // The whole anchor is on screen, above its pinned diving position.
        expect(p.y + ANCHOR_DRAW_H / 2).toBeLessThan(h);
        expect(p.y).toBeLessThan(anchorPinY(h) - 40);
      }
    }
  });

  it("swings visibly and smoothly like a pendulum, hanging along its chain", () => {
    for (const [w, h] of [PHONES[0], VIEWPORTS[4]]) {
      let prev = snapshot(0, w, h, 0);
      let minX = Infinity;
      let maxX = -Infinity;
      let maxAngle = 0;
      for (let t = 1 / 60; t < 40; t += 1 / 60) {
        const p = snapshot(0, w, h, t);
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(1); // per 60 Hz frame
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        maxAngle = Math.max(maxAngle, Math.abs(p.swayAngle));
        // The sprite's axis points along the chain, up to the attachment.
        const chainAngle = -Math.atan2(p.chainEndX - p.chainStartX, p.chainEndY - p.chainStartY);
        expect(Math.abs(p.swayAngle - chainAngle)).toBeLessThan(0.06);
        prev = p;
      }
      expect(maxX - minX).toBeGreaterThan(40); // clearly noticeable …
      expect(Math.max(w / 2 - minX, maxX - w / 2)).toBeLessThan(45); // … and still under the hull
      expect(maxAngle).toBeGreaterThan(0.15);
      expect(maxAngle).toBeLessThan(0.3);
    }
  });

  it("trails the ship: a still ship gives a different swing than a floating one", () => {
    const [w, h] = PHONES[0];
    let differs = 0;
    for (let t = 0; t < 20; t += 0.5) {
      const p = snapshot(0, w, h, t);
      const pendulumOnly = Math.sin(t * 1.3) * 0.15 + Math.sin(t * 0.71 + 1.1) * 0.05;
      if (Math.abs(-p.swayAngle - pendulumOnly) > 0.005) differs++;
    }
    expect(differs).toBeGreaterThan(30);
  });

  it("is deterministic in (depth, viewport, time)", () => {
    const [w, h] = VIEWPORTS[0];
    for (const t of TIMES) expect(snapshot(0, w, h, t)).toEqual(snapshot(0, w, h, t));
  });
});

describe("anchorPose — launch", () => {
  it("moves continuously and only lengthens the chain as the dive deepens", () => {
    for (const [w, h] of VIEWPORTS) {
      const range = launchRange(h);
      for (const t of TIMES) {
        let prev = snapshot(0, w, h, t);
        // 2.5 world px per step ≈ one 60 Hz frame at the initial descent speed.
        for (let y = 2.5; y < range; y += 2.5) {
          const p = snapshot(y, w, h, t);
          expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(12);
          expect(p.y).toBeGreaterThanOrEqual(prev.y); // the anchor only descends
          const len = Math.hypot(p.chainEndX - p.chainStartX, p.chainEndY - p.chainStartY);
          const prevLen = Math.hypot(
            prev.chainEndX - prev.chainStartX,
            prev.chainEndY - prev.chainStartY,
          );
          expect(len).toBeGreaterThan(prevLen);
          prev = p;
        }
      }
    }
  });

  it("hands over to normal diving without a jump when the ship is culled", () => {
    for (const [w, h] of VIEWPORTS) {
      const range = launchRange(h);
      for (const t of TIMES) {
        const before = snapshot(range - 0.01, w, h, t);
        const after = snapshot(range, w, h, t);
        expect(before.fromHull).toBe(true);
        expect(after.fromHull).toBe(false);
        expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.05);
        expect(Math.abs(after.swayAngle - before.swayAngle)).toBeLessThan(1e-4);
        expect(after.chainStartY).toBeLessThan(0); // the attachment is off screen
        expect(Math.abs(after.chainStartY - before.chainStartY)).toBeLessThan(0.05);
      }
    }
  });
});

describe("anchorPose — normal diving (ship off screen)", () => {
  it("is bit-identical to the previous Actor-layer formulas", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [launchRange(h), 400, 1234.5, 4200]) {
        for (const t of TIMES) {
          const camera = cameraAt(w, h, worldY);
          const p = anchorPose(worldY, camera, t);

          // The formulas as they stood before the pre-dive presentation.
          const anchorScreenY = anchorPinY(h);
          const anchorX = anchorSwayX(t, w);
          const swayAngle = Math.sin(t * 1.8) * 0.22 + Math.sin(t * 0.9) * 0.05;
          const ringOffsetFromCenter = ANCHOR_DRAW_H * (0.5 - ANCHOR_RING_Y_FRAC);
          const anchorRingY = anchorScreenY - Math.cos(swayAngle) * ringOffsetFromCenter;
          const anchorRingX = anchorX + Math.sin(swayAngle) * ringOffsetFromCenter;
          const shipScreenY = camera.worldToScreenY(SHIP_WORLD_Y);

          expect(p.fromHull).toBe(false);
          expect(p.x).toBe(anchorX);
          expect(p.y).toBe(anchorScreenY);
          expect(p.swayAngle).toBe(swayAngle);
          expect(p.chainStartX).toBe(w / 2);
          expect(p.chainStartY).toBe(Math.min(shipScreenY + 40, 0));
          expect(p.chainEndX).toBe(anchorRingX);
          expect(p.chainEndY).toBe(anchorRingY - 9);
        }
      }
    }
  });
});
