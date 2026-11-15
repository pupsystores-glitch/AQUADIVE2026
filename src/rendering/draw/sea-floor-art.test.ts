// Sea floor artwork placement: the wreck centred, the scene always covering
// the viewport width, its bottom edge on the viewport's bottom edge when the
// anchor reaches the floor, and a graceful fallback without the image.
import { describe, expect, it } from "vitest";
import {
  drawSeaFloorArt,
  seaFloorArtLayout,
  seaFloorArtTopExtent,
  seaFloorRestPoint,
} from "./sea-floor-art";

// Logical viewports at the tested screen sizes (width, height).
const VIEWPORTS: ReadonlyArray<readonly [number, number]> = [
  [375 / 0.84, 427 / 0.84],
  [390 / 0.84, 604 / 0.84],
  [907, 820],
  [1089, 820],
  [1422, 900],
];
const ART_W = 1291;
const ART_ROWS = 726;
/** The anchor's pinned screen Y: the floor's screen Y at impact. */
const pinY = (h: number) => h * 0.55;

describe("seaFloorArtLayout", () => {
  it("covers the whole viewport width at every tested size", () => {
    for (const [w, h] of VIEWPORTS) {
      const l = { ...seaFloorArtLayout(w, h, pinY(h)) };
      expect(l.x).toBeLessThanOrEqual(0);
      expect(l.x + ART_W * l.scale).toBeGreaterThanOrEqual(w);
    }
  });

  it("centres the wreck and rests the artwork on the viewport's bottom edge at impact", () => {
    for (const [w, h] of VIEWPORTS) {
      const l = { ...seaFloorArtLayout(w, h, pinY(h)) };
      expect(l.x + 640 * l.scale).toBeCloseTo(w / 2, 9); // wreck at the centre
      expect(l.y + ART_ROWS * l.scale).toBeCloseTo(h, 9); // no gap below the artwork
    }
  });

  it("never shrinks the wreck below the minimum scale, and scales up on wide scenes", () => {
    expect(seaFloorArtLayout(375 / 0.84, 508, 0).scale).toBe(0.7);
    expect(seaFloorArtLayout(907, 820, 0).scale).toBeCloseTo(907 / 1280, 9);
    expect(seaFloorArtLayout(1422, 900, 0).scale).toBeCloseTo(1422 / 1280, 9);
  });

  it("moves with the floor: one px of camera travel is one px on screen", () => {
    const a = { ...seaFloorArtLayout(907, 820, 500) };
    const b = { ...seaFloorArtLayout(907, 820, 499) };
    expect(a.y - b.y).toBe(1);
    expect(a.x).toBe(b.x);
  });

  it("reports how far the artwork reaches above the floor line (the culling margin)", () => {
    for (const [w, h] of VIEWPORTS) {
      const l = { ...seaFloorArtLayout(w, h, 1000) };
      expect(seaFloorArtTopExtent(w, h)).toBeCloseTo(1000 - l.y, 9);
    }
  });
});

describe("seaFloorRestPoint", () => {
  it("is on the sand, inside the viewport, below the anchor's pinned centre", () => {
    for (const [w, h] of VIEWPORTS) {
      const rest = { ...seaFloorRestPoint(w, h, pinY(h)) };
      expect(rest.x).toBeGreaterThan(w * 0.4);
      expect(rest.x).toBeLessThan(w * 0.75);
      expect(rest.y).toBeGreaterThan(pinY(h));
      expect(rest.y).toBeLessThan(h - 30);
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
