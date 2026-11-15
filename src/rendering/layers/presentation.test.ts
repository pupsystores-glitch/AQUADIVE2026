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
  ANCHOR_REST_CHAIN_HULL_PX,
  ANCHOR_REST_CHAIN_PX,
  ANCHOR_RING_Y_FRAC,
  SHIP_CHAIN_ATTACH_DY,
  SHIP_CULL_MARGIN_TOP,
  SHIP_REST_HUD_BOTTOM,
  SHIP_REST_TOP_MARGIN,
} from "../constants";
import type { RenderState } from "../render-state";
import {
  SHIP_GEOMETRY,
  SHIP_HEAVE_MAX,
  SHIP_ROLL_MAX,
  shipChainAttach,
  shipScale,
} from "../draw/ship";
import { anchorPinY, anchorPose, anchorSwayX } from "./actor";
import {
  launchProgress,
  presentationOffsetY,
  presentedShipRestY,
  presentState,
  shipClearRestY,
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

// E-X6 S2: the seven-size QA matrix as logical scenes (docs/07 §19 gate 8):
// phones at the 0.84 scene-fit scale; desktop stages about 73–76 % of the
// window width, 820 logical px tall below an 820 px stage.
const QA_MATRIX: Array<[string, number, number]> = [
  ["375x667", 375 / 0.84, 427 / 0.84],
  ["390x844", 390 / 0.84, 604 / 0.84],
  ["768x1024", 907, 820],
  ["1280x800", (0.73 * 1280) / (800 / 820), 820],
  ["1366x768", (0.73 * 1366) / (768 / 820), 820],
  ["1440x900", 0.73 * 1440, 900],
  ["1920x1080", 0.76 * 1920, 1080],
];

/**
 * The one tested scene too short for the whole rescue boat, its HUD clearance
 * and a resting anchor above its pinned diving position all at once (E-X6 S2):
 * the boat stays fully in view, and the anchor rests below its pinned position.
 */
const isShortPhone = (w: number, h: number) => w === 375 / 0.84 && h === 427 / 0.84;

/** Highest rise of a ship point `x` px beside the hole during its bob (heave + roll). */
const bobRise = (x: number) => SHIP_HEAVE_MAX + Math.abs(x) * Math.sin(SHIP_ROLL_MAX);

/** Screen Y of the mast top and of the bow rail at the top of their bob, for the resting ship. */
function restTops(w: number, h: number) {
  const k = shipScale(w);
  const hole = presentedShipRestY(w, h) + SHIP_CHAIN_ATTACH_DY;
  return {
    mast: hole - SHIP_GEOMETRY.mastRise * k - bobRise(SHIP_GEOMETRY.mastX * k),
    bowRail: hole - SHIP_GEOMETRY.bowRailRise * k - bobRise(SHIP_GEOMETRY.bowX * k),
  };
}

/** The camera as SceneRenderer sets it up for a frame at `worldY`. */
function cameraAt(w: number, h: number, worldY: number): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  camera.setPresentationOffset(presentationOffsetY(worldY, w, h));
  return camera;
}

/** Depth at which the ship is culled and the launch is complete. */
const launchRange = (w: number, h: number) =>
  Math.max(ANCHOR_LAUNCH_MIN_RANGE_PX, presentedShipRestY(w, h) + SHIP_CULL_MARGIN_TOP);

/** Rest chain length under a ship scaled for width `w`. */
const restChain = (w: number) =>
  ANCHOR_REST_CHAIN_PX - ANCHOR_REST_CHAIN_HULL_PX * (1 - shipScale(w));

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
    for (const [w, h] of VIEWPORTS) {
      const range = launchRange(w, h);
      expect(launchProgress(0, w, h)).toBe(0);
      expect(launchProgress(range, w, h)).toBe(1);
      expect(launchProgress(range + 3000, w, h)).toBe(1);
      let prev = 0;
      for (let y = 0; y <= range; y += 1) {
        const p = launchProgress(y, w, h);
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    }
  });

  it("is safe for non-finite or negative depths", () => {
    expect(launchProgress(NaN, 907, 820)).toBe(0);
    expect(launchProgress(-5, 907, 820)).toBe(0);
    expect(launchProgress(Infinity, 907, 820)).toBe(1);
  });
});

describe("presentationOffsetY", () => {
  it("rests the scaled-down ship fully in view on phone viewports, below the top-left corner", () => {
    for (const [w, h] of PHONES) {
      const k = shipScale(w);
      expect(k).toBeLessThan(1);
      expect(shipRestScreenY(h)).toBeLessThan(0); // pinned camera: ship above the top edge
      const shipY = cameraAt(w, h, 0).worldToScreenY(SHIP_WORLD_Y);
      expect(shipY).toBeCloseTo(presentedShipRestY(w, h), 9);
      // E-X6 S2: the previous hull's top was its gunwale, 62 px above the
      // attachment. The rescue boat's left half (under the HUD lane) is highest
      // at its bow rail, SHIP_GEOMETRY.bowRailRise (131.7 px) above the hole;
      // at the top of its bob (heave + roll at the bow tip) it stays below the
      // multiplier readout, which ends about 113 logical px down — as before.
      expect(restTops(w, h).bowRail).toBeGreaterThan(110);
    }
  });

  it("rests the whole rescue boat in view, mast included, on every QA viewport (E-X6 S2)", () => {
    // Supersedes "is 0 on viewports 820 px and taller …": the boat's mast rises
    // 280 px above the hole, so viewports up to about 1196 px tall now shift the
    // pre-dive view down until the whole boat shows.
    for (const [name, w, h] of QA_MATRIX) {
      const tops = restTops(w, h);
      expect(tops.mast, name).toBeGreaterThanOrEqual(0); // never clipped by the top edge
      expect(tops.bowRail, name).toBeGreaterThanOrEqual(SHIP_REST_HUD_BOTTOM - 1e-9);
      expect(cameraAt(w, h, 0).worldToScreenY(SHIP_WORLD_Y), name).toBeCloseTo(
        presentedShipRestY(w, h),
        9,
      );
    }
    // With air above the mast wherever the anchor allows it (all but the short phone).
    for (const [name, w, h] of QA_MATRIX.slice(1)) {
      expect(restTops(w, h).mast, name).toBeGreaterThan(0);
    }
    expect(restTops(1459, 1080).mast).toBeCloseTo(SHIP_REST_TOP_MARGIN, 9);
  });

  it("places the boat no lower than it needs: the floor, plus the top margin where the anchor allows", () => {
    for (const [name, w, h] of QA_MATRIX) {
      const tops = restTops(w, h);
      // The mast has at most SHIP_REST_TOP_MARGIN of air — unless the bow rail's
      // HUD clearance is what holds the boat down.
      const hudBound = Math.abs(tops.bowRail - SHIP_REST_HUD_BOTTOM) < 1e-9;
      expect(hudBound || tops.mast <= SHIP_REST_TOP_MARGIN + 1e-9, name).toBe(true);
    }
  });

  it("is 0 where the pinned camera already shows the whole boat", () => {
    for (const [w, h] of [
      [1459, 1300],
      [1089, 1440],
    ]) {
      expect(shipRestScreenY(h)).toBeGreaterThanOrEqual(shipClearRestY(w, h));
      for (const y of [0, 10, 100, 400]) expect(presentationOffsetY(y, w, h)).toBe(0);
    }
  });

  it("eases out over the launch: continuous, never increasing, 0 from the culling depth on", () => {
    for (const [w, h] of PHONES) {
      const range = launchRange(w, h);
      let prev = presentationOffsetY(0, w, h);
      for (let y = 1; y <= range; y += 1) {
        const o = presentationOffsetY(y, w, h);
        expect(o).toBeLessThanOrEqual(prev);
        expect(prev - o).toBeLessThan(3); // per world px
        prev = o;
      }
      expect(presentationOffsetY(range, w, h)).toBe(0);
      expect(presentationOffsetY(4200, w, h)).toBe(0);
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
        shipChainAttach(t, 1, SHIP_CHAIN_ATTACH_DY, shipScale(w), attach);
        expect(p.fromHull).toBe(true);
        expect(p.chainStartX).toBe(w / 2 + attach.x);
        expect(p.chainStartY).toBe(shipY + attach.y);
        const len = Math.hypot(p.chainEndX - p.chainStartX, p.chainEndY - p.chainStartY);
        expect(Math.abs(len - restChain(w))).toBeLessThan(4); // short, just clearing the hull
        // The whole anchor is on screen, above its pinned diving position —
        // except on the short phone (E-X6 S2: there the full rescue boat leaves
        // no room above the pin; see isShortPhone), where it rests below it.
        expect(p.y + ANCHOR_DRAW_H / 2).toBeLessThan(h);
        if (isShortPhone(w, h)) expect(p.y).toBeGreaterThan(anchorPinY(h));
        else expect(p.y).toBeLessThan(anchorPinY(h));
      }
    }
  });

  it("hangs the resting anchor clear below the keel, on every QA viewport (E-X6 S2)", () => {
    const attach = { x: 0, y: 0 };
    for (const [name, w, h] of QA_MATRIX) {
      const k = shipScale(w);
      for (let t = 0; t < 30; t += 0.25) {
        const p = snapshot(0, w, h, t);
        shipChainAttach(t, 1, SHIP_CHAIN_ATTACH_DY, k, attach);
        const keelY = presentedShipRestY(w, h) + attach.y + SHIP_GEOMETRY.keelDepth * k;
        // The chain's end (inside the shackle ring) hangs below the keel …
        expect(p.chainEndY - keelY, name).toBeGreaterThan(8);
        // … and the whole anchor, ring to crown, is on screen.
        expect(p.chainEndY, name).toBeGreaterThan(0);
        expect(p.y + ANCHOR_DRAW_H / 2, name).toBeLessThan(h);
      }
    }
  });

  it("uses the measured keel for the rest chain: 14 px of clearance at full size", () => {
    expect(ANCHOR_REST_CHAIN_HULL_PX).toBe(78);
    expect(ANCHOR_REST_CHAIN_PX).toBe(92);
    expect(ANCHOR_REST_CHAIN_HULL_PX).toBeCloseTo(SHIP_GEOMETRY.keelDepth, 0);
    expect(ANCHOR_REST_CHAIN_PX - SHIP_GEOMETRY.keelDepth).toBeGreaterThan(13);
  });

  it("removes the ship only once its keel is above the top edge (no visible pop)", () => {
    for (const [name, w, h] of QA_MATRIX) {
      // The first depth at which the World layer culls the ship (its test, verbatim).
      let y = 0;
      let camera = cameraAt(w, h, 0);
      while (camera.isVisibleY(SHIP_WORLD_Y, SHIP_CULL_MARGIN_TOP, 80)) {
        y += 0.25;
        camera = cameraAt(w, h, y);
      }
      // In its last drawn frame the ship may still be bobbing (the presentation
      // shift culls it before the launch completes): its lowest point at the
      // bottom of a full bob — keel, heave, and roll at the bow — is already
      // above the top edge, so nothing visible disappears.
      const k = shipScale(w);
      const lowest =
        cameraAt(w, h, y - 0.25).worldToScreenY(SHIP_WORLD_Y) +
        SHIP_CHAIN_ATTACH_DY +
        SHIP_GEOMETRY.keelDepth * k +
        bobRise(SHIP_GEOMETRY.bowX * k);
      expect(lowest, name).toBeLessThan(0);
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
      expect(maxX - minX).toBeGreaterThan(30); // clearly noticeable …
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
      const range = launchRange(w, h);
      for (const t of TIMES) {
        let prev = snapshot(0, w, h, t);
        // 2.5 world px per step ≈ one 60 Hz frame at the initial descent speed.
        for (let y = 2.5; y < range; y += 2.5) {
          const p = snapshot(y, w, h, t);
          expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(12);
          // The anchor only descends — on the short phone, where it rests below
          // its pinned position (E-X6 S2, isShortPhone), it only rises to it.
          if (isShortPhone(w, h)) expect(p.y).toBeLessThanOrEqual(prev.y);
          else expect(p.y).toBeGreaterThanOrEqual(prev.y);
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
      const range = launchRange(w, h);
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
  it("is bit-identical to the previous Actor-layer formulas (chain end 4 px lower, inside the ring)", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [launchRange(w, h), 400, 1234.5, 4200]) {
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
          expect(p.chainEndY).toBe(anchorRingY - 5); // was − 9 (ring top): the last link now hooks over the ring
        }
      }
    }
  });
});
