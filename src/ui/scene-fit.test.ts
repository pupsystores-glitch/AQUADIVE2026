// Scene fit (Sprint 4 QA fix) — the renderer viewport chosen for a canvas.

import { describe, expect, it } from "vitest";
import { ANCHOR_SCREEN_Y_FRAC, ANCHOR_DRAW_H, MAX_DPR } from "@/rendering/constants";
import { presentedShipRestY } from "@/rendering/layers/presentation";
import { ANCHOR_WORLD_OFFSET_PX, SHIP_WORLD_Y } from "@/shared/world";
import { MIN_SCENE_HEIGHT, MIN_SCENE_SCALE, fitScene, sceneHeightFor } from "./scene-fit";

/** The renderer's own backing-store rule: `canvas.width = w × min(dpr, MAX_DPR)`. */
const backing = (v: { width: number; height: number; dpr: number }) => {
  const d = Math.min(v.dpr, MAX_DPR);
  return [v.width * d, v.height * d];
};

/** The idle ship's screen Y in the renderer's camera (worldY = 0). */
const idleShipY = (h: number) => h * ANCHOR_SCREEN_Y_FRAC + (SHIP_WORLD_Y - ANCHOR_WORLD_OFFSET_PX);

describe("fitScene", () => {
  it("passes canvases at or above MIN_SCENE_HEIGHT through unchanged (desktop)", () => {
    expect(fitScene(1422, 1046, 1)).toEqual({ width: 1422, height: 1046, dpr: 1 });
    expect(fitScene(800, MIN_SCENE_HEIGHT, 2)).toEqual({
      width: 800,
      height: MIN_SCENE_HEIGHT,
      dpr: 2,
    });
    expect(fitScene(1422, 1046, 3)).toEqual({ width: 1422, height: 1046, dpr: 3 }); // raw dpr, clamped by the renderer as before
  });

  it("passes an unmeasured canvas through unchanged", () => {
    expect(fitScene(0, 0, 2)).toEqual({ width: 0, height: 0, dpr: 2 });
    expect(fitScene(375, 0, 2)).toEqual({ width: 375, height: 0, dpr: 2 });
  });

  it.each([
    [375, 427, 2],
    [390, 604, 3],
    [768, 694, 2],
    [975, 734, 1],
    [360, 380, 2.625],
    [375, 427, 1.25],
  ])(
    "%ix%i @%f: logical height sceneHeightFor(h), same aspect, native backing store",
    (w, h, dpr) => {
      const v = fitScene(w, h, dpr);
      expect(v.height).toBeCloseTo(sceneHeightFor(h), 9);
      expect(h / v.height).toBeGreaterThanOrEqual(MIN_SCENE_SCALE - 1e-9); // never zoomed out further
      expect(v.width / v.height).toBeCloseTo(w / h, 2);
      const ratio = Math.min(dpr, MAX_DPR);
      const [bw, bh] = backing(v);
      expect(Number.isInteger(bw) && Number.isInteger(bh)).toBe(true);
      expect(Math.abs(bw - Math.round(w * ratio))).toBeLessThanOrEqual(1);
      expect(Math.abs(bh - Math.round(h * ratio))).toBeLessThanOrEqual(1);
      expect(v.dpr).toBeLessThan(MAX_DPR); // never clamped by the renderer
    },
  );

  it("zooms phones out only to MIN_SCENE_SCALE, and leaves the portrait iPad at MIN_SCENE_HEIGHT", () => {
    expect(fitScene(375, 427, 2).height).toBeCloseTo(427 / MIN_SCENE_SCALE, 9);
    expect(fitScene(390, 604, 2).height).toBeCloseTo(604 / MIN_SCENE_SCALE, 9);
    expect(fitScene(768, 694, 2).height).toBeCloseTo(MIN_SCENE_HEIGHT, 9);
    expect(fitScene(975, 734, 1).height).toBeCloseTo(MIN_SCENE_HEIGHT, 9);
  });

  it("keeps the presented surface ship and the whole diving anchor on screen for every short canvas", () => {
    for (const [w, h] of [
      [375, 427],
      [390, 604],
      [768, 694],
      [975, 734],
      [320, 300],
    ]) {
      const v = fitScene(w, h, 2);
      // The renderer's pre-dive presentation shifts the ship into view on short viewports.
      expect(presentedShipRestY(v.height) - 22 - 8).toBeGreaterThan(0); // hull top, with heave
      expect(v.height * ANCHOR_SCREEN_Y_FRAC + ANCHOR_DRAW_H / 2).toBeLessThan(v.height); // anchor above the bottom edge
    }
    // Without the fit the ship is off screen on these canvases (the defect).
    expect(idleShipY(427) + 18).toBeLessThan(0);
    expect(idleShipY(604) + 18).toBeLessThan(0);
  });

  it("the backing-store product is exact across phone, tablet and laptop sizes (no per-frame canvas reset)", () => {
    // Includes the sizes whose native pair has no exact product (441×538,
    // 882×538, 1141×707 @1.5, 1246×369 @1.5), which need a 1 px nudge.
    // Violations are collected and asserted once (one expect per size is
    // too slow for a parallel run); every size is still checked.
    const bad: string[] = [];
    let native = 0;
    let checked = 0;
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      for (let w = 280; w <= 1400; w += 7) {
        for (let h = 200; h < MIN_SCENE_HEIGHT; h += 13) {
          const v = fitScene(w, h, dpr);
          const ratio = Math.min(dpr, MAX_DPR);
          const [bw, bh] = backing(v);
          checked++;
          const ok =
            // The scaled path was taken (not the unchanged fallback) …
            Math.abs(v.height - sceneHeightFor(h)) < 1e-9 &&
            // … its products are exact integers (the renderer compares them
            // with the canvas size every frame) …
            Number.isInteger(bw) &&
            Number.isInteger(bh) &&
            // … at the native resolution, or one device pixel off it.
            Math.abs(bw - Math.round(w * ratio)) <= 1 &&
            Math.abs(bh - Math.round(h * ratio)) <= 1;
          if (!ok) bad.push(`${w}x${h}@${dpr} → ${v.width}x${v.height}@${v.dpr}`);
          if (bw === Math.round(w * ratio) && bh === Math.round(h * ratio)) native++;
        }
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(40000);
    expect(native / checked).toBeGreaterThan(0.99);
    for (const [w, h, dpr] of [
      [441, 538, 1],
      [882, 538, 2],
      [1141, 707, 1.5],
      [1246, 369, 1.5],
    ]) {
      const v = fitScene(w, h, dpr);
      expect(Math.abs(v.height - sceneHeightFor(h))).toBeLessThan(1e-9);
      expect(backing(v).every(Number.isInteger)).toBe(true);
    }
  });
});
