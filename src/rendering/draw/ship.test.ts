// Surface ship draw invariants: deterministic, a gently floating hull that is
// still at motion 0, balanced state, no gradients or shadows, and the chain
// attachment where the Actor layer starts the chain.
import { describe, expect, it } from "vitest";
import { drawShip, shipChainAttach, shipScale } from "./ship";

/** Minimal recording 2D context — just the calls drawShip makes. */
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
    translate: rec("translate"),
    scale: rec("scale"),
    rotate: rec("rotate"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    quadraticCurveTo: rec("quadraticCurveTo"),
    arc: rec("arc"),
    ellipse: rec("ellipse"),
    fill: rec("fill"),
    fillRect: rec("fillRect"),
    stroke: rec("stroke"),
    clip: rec("clip"),
    createLinearGradient: rec("createLinearGradient"),
    createRadialGradient: rec("createRadialGradient"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    shadowBlur: 0,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, calls };
}

const countOf = (calls: string[], name: string) =>
  calls.filter((c) => c.startsWith(`${name}(`)).length;

/** Calls that are not part of the animated water surface (its polyline is the only lineTo run of 20+). */
const hullCalls = (calls: string[]) =>
  calls.filter((c) => !c.startsWith("lineTo(") && !c.startsWith("moveTo("));

// Logical widths at the tested screen sizes (phones at the 0.84 scene-fit scale).
const WIDTHS = [375 / 0.84, 390 / 0.84, 907, 1089, 1422];

describe("drawShip", () => {
  it("emits identical draw calls for identical inputs", () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawShip(a.ctx, 264.5, 51, 7.5, 529, 40, 1);
    drawShip(b.ctx, 264.5, 51, 7.5, 529, 40, 1);
    expect(b.calls).toEqual(a.calls);
    expect(a.calls.every((c) => !c.includes("NaN"))).toBe(true);
  });

  it("floats: the hull moves over time at motion 1", () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawShip(a.ctx, 360, 51, 0, 720, 40, 1);
    drawShip(b.ctx, 360, 51, 3.7, 720, 40, 1);
    expect(hullCalls(b.calls)).not.toEqual(hullCalls(a.calls));
  });

  it("is still at motion 0 (only the water surface moves)", () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawShip(a.ctx, 544.5, 51, 0, 1089, 40, 0);
    drawShip(b.ctx, 544.5, 51, 3.7, 1089, 40, 0);
    expect(hullCalls(b.calls)).toEqual(hullCalls(a.calls));
    expect(b.calls).not.toEqual(a.calls); // the surface did move
    expect(a.calls.filter((c) => c === "translate(544.500,71.000)").length).toBe(2);
  });

  it("balances save/restore, and uses no gradients or shadows", () => {
    for (const w of WIDTHS) {
      const { ctx, raw, calls } = recordingCtx();
      drawShip(ctx, w / 2, 51, 1, w, 40, 1);
      expect(countOf(calls, "save")).toBe(countOf(calls, "restore"));
      expect(countOf(calls, "createLinearGradient")).toBe(0);
      expect(countOf(calls, "createRadialGradient")).toBe(0);
      expect(raw.shadowBlur).toBe(0);
    }
  });

  it("draws the chain attachment at the given offset below the origin", () => {
    const { ctx, calls } = recordingCtx();
    drawShip(ctx, 264.5, 51, 0, 529, 40, 1);
    const hole = calls.findIndex((c) => c.startsWith("ellipse(0.000,0.000,9.000,"));
    expect(hole).toBeGreaterThan(0);
    expect(
      calls
        .slice(0, hole)
        .filter((c) => c.startsWith("translate("))
        .pop(),
    ).toBe("translate(0.000,40.000)");
  });

  it("draws one hull shape at every width, scaled to stay inside the scene", () => {
    let reference: string[] | null = null;
    for (const w of WIDTHS) {
      const { ctx, calls } = recordingCtx();
      drawShip(ctx, w / 2, 51, 0, w, 40, 1);
      // Hull silhouette: the path traced right before clip(), in ship-local coordinates.
      const end = calls.indexOf("clip()");
      const start = calls.lastIndexOf("beginPath()", end);
      const path = calls.slice(start, end);
      reference ??= path;
      expect(path).toEqual(reference); // identical shape: only the scale differs

      const k = shipScale(w);
      expect(calls).toContain(`scale(${k.toFixed(3)},${k.toFixed(3)})`);
      const xs = path.flatMap((c) => {
        const m = /^(moveTo|lineTo)\(([-\d.]+),/.exec(c);
        const q = /^quadraticCurveTo\([-\d.]+,[-\d.]+,([-\d.]+),/.exec(c);
        return m ? [Number(m[2])] : q ? [Number(q[1])] : [];
      });
      expect(xs.length).toBeGreaterThanOrEqual(5);
      expect(Math.min(...xs) * k).toBeGreaterThan(-w / 2);
      expect(Math.max(...xs) * k).toBeLessThan(w / 2);
      // A large hull for the scene: most of a phone's width, 600 px where it fits.
      expect((Math.max(...xs) - Math.min(...xs)) * k).toBeGreaterThanOrEqual(
        Math.min(0.75 * w, 600),
      );
    }
  });

  it("is full size from tablet widths up and smaller only on phones", () => {
    expect(shipScale(907)).toBe(1);
    expect(shipScale(1089)).toBe(1);
    expect(shipScale(1422)).toBe(1);
    expect(shipScale(375 / 0.84)).toBeCloseTo(0.602, 2);
    expect(shipScale(390 / 0.84)).toBeCloseTo(0.628, 2);
  });
});

describe("shipChainAttach", () => {
  it("is exactly (0, attachDy) at motion 0, at every scale", () => {
    for (const scale of [1, 0.6]) {
      for (const t of [0, 1.3, 9.9]) {
        const at = shipChainAttach(t, 0, 40, scale, { x: 1, y: 1 });
        expect(at.x + 0).toBe(0); // −0 → 0
        expect(at.y).toBe(40);
      }
    }
  });

  it("moves gently and smoothly at motion 1", () => {
    let prev = { ...shipChainAttach(0, 1, 40, 1, { x: 0, y: 0 }) };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let t = 1 / 60; t < 40; t += 1 / 60) {
      const p = { ...shipChainAttach(t, 1, 40, 1, { x: 0, y: 0 }) };
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(0.2); // per 60 Hz frame
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      prev = p;
    }
    expect(maxX - minX).toBeGreaterThan(8); // it does float …
    expect(maxY - minY).toBeGreaterThan(6);
    expect(Math.max(-minX, maxX)).toBeLessThan(8); // … within a few pixels
    expect(Math.max(40 - minY, maxY - 40)).toBeLessThan(7);
  });

  it("matches where drawShip puts the hawse hole, at full size and scaled down", () => {
    // drawShip: translate(pivot) · rotate(r) · scale(k) · translate(0,-20) … translate(0,40):
    // the hole is 20·k below the pivot along the rolled axis.
    for (const w of [1089, 375 / 0.84]) {
      const k = shipScale(w);
      const { ctx, calls } = recordingCtx();
      drawShip(ctx, w / 2, 51, 2.2, w, 40, 1);
      const i = calls.findIndex((c) => c.startsWith("ellipse(0.000,0.000,9.000,"));
      const before = calls.slice(0, i);
      const lastMove = before
        .filter((c) => c.startsWith("translate(") && !c.startsWith("translate(0.000"))
        .pop();
      const lastRotate = before.filter((c) => c.startsWith("rotate(")).pop();
      const tr = /^translate\(([-\d.]+),([-\d.]+)\)/.exec(lastMove ?? "");
      const rot = /^rotate\(([-\d.]+)\)/.exec(lastRotate ?? "");
      expect(tr).not.toBeNull();
      expect(rot).not.toBeNull();
      const angle = Number(rot?.[1]);
      const holeX = Number(tr?.[1]) - Math.sin(angle) * 20 * k;
      const holeY = Number(tr?.[2]) + Math.cos(angle) * 20 * k;
      const at = shipChainAttach(2.2, 1, 40, k, { x: 0, y: 0 });
      expect(w / 2 + at.x).toBeCloseTo(holeX, 1);
      expect(51 + at.y).toBeCloseTo(holeY, 1);
    }
  });
});
