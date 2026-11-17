// Anchor touchdown (A-OWN.1): the audio host's copy of the landing arithmetic
// must match the renderer's own landing. The renderer is only read here.
import { describe, expect, it } from "vitest";
import { Camera } from "@/rendering/camera";
import { anchorPose } from "@/rendering/layers/actor";
import { CHAIN_MAX_DEPTH } from "@/shared/world";
import { anchorTouchdownSeconds } from "./anchor-touchdown";

/** The landing lean the drop ends on (actor.ts LAND_LEAN). */
const LAND_LEAN = 0.08;
/** An animation time whose diving sway (≈ +0.25 rad) is far from −LAND_LEAN. */
const ANIM_TIME = 0.8;

/** The renderer's pose `t` seconds after impact, for a `w` × `h` scene at the sea floor. */
function poseAt(w: number, h: number, t: number) {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(CHAIN_MAX_DEPTH);
  camera.setPresentationOffset(0);
  const { swayAngle, y } = anchorPose(CHAIN_MAX_DEPTH, camera, ANIM_TIME, t);
  return { swayAngle, y };
}

// Phones (the canvas above the betting panel), tablets, laptops, desktops, and extremes.
const SCENES: readonly (readonly [number, number])[] = [
  [320, 260],
  [375, 330],
  [390, 420],
  [375, 667],
  [768, 640],
  [768, 1024],
  [1024, 1366],
  [940, 720],
  [1280, 800],
  [1920, 1080],
  [2560, 1440],
];

describe("anchorTouchdownSeconds (A-OWN.1)", () => {
  it.each(SCENES)("%i × %i: the renderer's anchor stands on the sand exactly then", (w, h) => {
    const t = anchorTouchdownSeconds(w, h, CHAIN_MAX_DEPTH)!;
    expect(t).toBeGreaterThanOrEqual(0.3);
    expect(t).toBeLessThanOrEqual(0.7);
    // At the touchdown the drop has ended: the anchor stands at the landing lean.
    expect(poseAt(w, h, t).swayAngle).toBeCloseTo(-LAND_LEAN, 9);
    // 10 ms earlier it is still sinking (the lean is not reached yet)…
    expect(Math.abs(poseAt(w, h, t - 0.01).swayAngle + LAND_LEAN)).toBeGreaterThan(1e-4);
    // …and 50 ms later it is tipping over (the lean has grown).
    expect(-poseAt(w, h, t + 0.05).swayAngle).toBeGreaterThan(LAND_LEAN + 1e-3);
  });

  it("covers both clamps of the drop time and the values in between", () => {
    const times = SCENES.map(([w, h]) => anchorTouchdownSeconds(w, h, CHAIN_MAX_DEPTH)!);
    expect(times).toContain(0.3);
    expect(times).toContain(0.7);
    expect(times.some((t) => t > 0.3 && t < 0.7)).toBe(true);
  });

  it("returns null for an unusable scene or depth", () => {
    expect(anchorTouchdownSeconds(0, 800, CHAIN_MAX_DEPTH)).toBeNull();
    expect(anchorTouchdownSeconds(1280, Number.NaN, CHAIN_MAX_DEPTH)).toBeNull();
    expect(anchorTouchdownSeconds(1280, 800, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
