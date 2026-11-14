// Chain geometry and rendering invariants: deterministic layout, links that
// stay attached to each other and to the anchor, and a fixed draw-call budget.
import { describe, expect, it } from "vitest";
import {
  CHAIN_LINK_LENGTH,
  CHAIN_LINK_PITCH,
  CHAIN_LINK_STRIDE,
  drawChain,
  layoutChain,
} from "./chain";

interface Link {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
}

function links(...args: Parameters<typeof layoutChain>): { first: number; list: Link[] } {
  const l = layoutChain(...args);
  const list: Link[] = [];
  for (let i = 0; i < l.count; i++) {
    const o = i * CHAIN_LINK_STRIDE;
    list.push({ cx: l.data[o], cy: l.data[o + 1], ux: l.data[o + 2], uy: l.data[o + 3] });
  }
  return { first: l.first, list };
}

const lower = (k: Link) => ({
  x: k.cx + (k.ux * CHAIN_LINK_PITCH) / 2,
  y: k.cy + (k.uy * CHAIN_LINK_PITCH) / 2,
});
const upper = (k: Link) => ({
  x: k.cx - (k.ux * CHAIN_LINK_PITCH) / 2,
  y: k.cy - (k.uy * CHAIN_LINK_PITCH) / 2,
});

// Representative endpoints: straight down, swayed left/right, long and short.
const CASES: Array<[number, number, number, number]> = [
  [187.5, 0, 187.5, 357],
  [195, -40, 150, 455],
  [960, -900, 1040, 585],
  [384, 0, 400, 220],
];
const TIMES = [0, 0.37, 2.5, 17.123];

describe("layoutChain", () => {
  it("is deterministic for the same inputs", () => {
    for (const [x1, y1, x2, y2] of CASES) {
      for (const t of TIMES) {
        const a = links(x1, y1, x2, y2, t);
        const b = links(x1, y1, x2, y2, t);
        expect(b).toEqual(a);
      }
    }
  });

  it("keeps the first link attached to the anchor end at every time", () => {
    for (const [x1, y1, x2, y2] of CASES) {
      for (const t of TIMES) {
        const { first, list } = links(x1, y1, x2, y2, t);
        expect(first).toBe(0);
        const j = lower(list[0]);
        expect(j.x).toBeCloseTo(x2, 2);
        expect(j.y).toBeCloseTo(y2, 2);
      }
    }
  });

  it("joins every adjacent pair of links at a shared joint with no abrupt turns", () => {
    for (const [x1, y1, x2, y2] of CASES) {
      for (const t of TIMES) {
        const { list } = links(x1, y1, x2, y2, t);
        for (let i = 1; i < list.length; i++) {
          const a = upper(list[i - 1]);
          const b = lower(list[i]);
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.2); // sub-pixel: chord vs arc length
          const dot = list[i - 1].ux * list[i].ux + list[i - 1].uy * list[i].uy;
          expect(dot).toBeGreaterThan(0.995); // < ~6 degrees between neighbours
        }
      }
    }
  });

  it("covers the whole path up to the surface attachment", () => {
    for (const [x1, y1, x2, y2] of CASES) {
      const { list } = links(x1, y1, x2, y2, 1.2);
      const span = Math.hypot(x2 - x1, y2 - y1);
      expect(list.length).toBeGreaterThanOrEqual(Math.ceil(span / CHAIN_LINK_PITCH));
      expect(list.length).toBeLessThanOrEqual(Math.ceil(span / CHAIN_LINK_PITCH) + 1);
      const top = upper(list[list.length - 1]);
      expect(Math.hypot(top.x - x1, top.y - y1)).toBeLessThan(CHAIN_LINK_PITCH);
    }
  });

  it("sways as one continuous curve: links move smoothly over time", () => {
    const [x1, y1, x2, y2] = CASES[1];
    const a = links(x1, y1, x2, y2, 3).list;
    const b = links(x1, y1, x2, y2, 3.016).list; // one 60 Hz frame later
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(Math.hypot(a[i].cx - b[i].cx, a[i].cy - b[i].cy)).toBeLessThan(0.1);
    }
  });

  it("stores only links near the clip rectangle, without shifting them", () => {
    const [x1, y1, x2, y2] = [200, -50_000, 210, 400];
    const clip = { minX: 0, minY: 0, maxX: 390, maxY: 844 };
    const clipped = links(x1, y1, x2, y2, 4, clip).list;
    const full = links(x1, y1, x2, y2, 4).list;
    expect(clipped.length).toBeLessThan(40);
    expect(full.length).toBeGreaterThan(3000);
    expect(clipped).toEqual(full.slice(0, clipped.length));
    for (const k of clipped) expect(k.cy).toBeGreaterThanOrEqual(-CHAIN_LINK_LENGTH);
  });

  it("returns no links for a degenerate or non-finite span", () => {
    expect(layoutChain(10, 10, 10, 10, 0).count).toBe(0);
    expect(layoutChain(10, NaN, 10, 10, 0).count).toBe(0);
  });
});

/** Minimal recording 2D context — just the calls drawChain makes. */
function recordingCtx() {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...a: number[]) => {
      calls.push(`${name}(${a.map((v) => (typeof v === "number" ? v.toFixed(3) : v)).join(",")})`);
    };
  const ctx = {
    save: rec("save"),
    restore: rec("restore"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arc: rec("arc"),
    stroke: rec("stroke"),
    createLinearGradient: rec("createLinearGradient"),
    createRadialGradient: rec("createRadialGradient"),
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const countOf = (calls: string[], name: string) =>
  calls.filter((c) => c.startsWith(`${name}(`)).length;

describe("drawChain", () => {
  it("emits identical draw calls for identical inputs", () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawChain(a.ctx, 195, -40, 150, 455, 7.5);
    drawChain(b.ctx, 195, -40, 150, 455, 7.5);
    expect(b.calls).toEqual(a.calls);
    expect(a.calls.every((c) => !c.includes("NaN"))).toBe(true);
  });

  it("uses a fixed number of strokes and no gradients, whatever the length", () => {
    const short = recordingCtx();
    const long = recordingCtx();
    drawChain(short.ctx, 200, 0, 200, 120, 1);
    drawChain(long.ctx, 200, -3000, 230, 600, 1);
    expect(countOf(long.calls, "stroke")).toBe(countOf(short.calls, "stroke"));
    expect(countOf(long.calls, "stroke")).toBeLessThanOrEqual(12);
    for (const { calls } of [short, long]) {
      expect(countOf(calls, "save")).toBe(1);
      expect(countOf(calls, "restore")).toBe(1);
      expect(countOf(calls, "createLinearGradient")).toBe(0);
      expect(countOf(calls, "createRadialGradient")).toBe(0);
    }
  });

  it("draws nothing for a zero-length chain", () => {
    const { ctx, calls } = recordingCtx();
    drawChain(ctx, 5, 5, 5, 5, 0);
    expect(calls).toEqual([]);
  });
});
