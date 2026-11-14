// Sea floor artwork placement: the wreck centred under the anchor, the scene
// always covering the viewport width, and a graceful fallback without the image.
import { describe, expect, it } from "vitest";
import { drawSeaFloorArt, seaFloorArtLayout, seaFloorArtTopExtent } from "./sea-floor-art";

// Logical widths at the tested screen sizes.
const WIDTHS = [375 / 0.84, 390 / 0.84, 907, 1089, 1422];
const ART_W = 1291;

describe("seaFloorArtLayout", () => {
  it("covers the whole viewport width at every tested size", () => {
    for (const w of WIDTHS) {
      const l = { ...seaFloorArtLayout(w, 400) };
      expect(l.x).toBeLessThanOrEqual(0);
      expect(l.x + ART_W * l.scale).toBeGreaterThanOrEqual(w);
    }
  });

  it("centres the wreck and puts its deck just below the anchor's pinned centre", () => {
    for (const w of WIDTHS) {
      const floorY = 451;
      const l = { ...seaFloorArtLayout(w, floorY) };
      expect(l.x + 640 * l.scale).toBeCloseTo(w / 2, 9); // wreck at the centre
      expect(l.y + 560 * l.scale).toBeCloseTo(floorY + 60, 9); // deck under the anchor's flukes
    }
  });

  it("never shrinks the wreck below the minimum scale, and scales up on wide scenes", () => {
    expect(seaFloorArtLayout(375 / 0.84, 0).scale).toBe(0.7);
    expect(seaFloorArtLayout(907, 0).scale).toBeCloseTo(907 / 1280, 9);
    expect(seaFloorArtLayout(1422, 0).scale).toBeCloseTo(1422 / 1280, 9);
  });

  it("moves with the floor: one px of camera travel is one px on screen", () => {
    const a = { ...seaFloorArtLayout(907, 500) };
    const b = { ...seaFloorArtLayout(907, 499) };
    expect(a.y - b.y).toBe(1);
    expect(a.x).toBe(b.x);
  });

  it("reports how far the artwork reaches above the floor line (the culling margin)", () => {
    for (const w of WIDTHS) {
      const l = { ...seaFloorArtLayout(w, 1000) };
      expect(seaFloorArtTopExtent(w)).toBeCloseTo(1000 - l.y, 9);
      expect(seaFloorArtTopExtent(w)).toBeGreaterThan(300);
    }
  });
});

describe("drawSeaFloorArt", () => {
  it("draws nothing and reports false while the image is not loaded", () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, name) => () => calls.push(String(name)),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    expect(drawSeaFloorArt(ctx, 907, 820, 451, { image: null, ready: false })).toBe(false);
    expect(calls).toEqual([]);
  });
});
