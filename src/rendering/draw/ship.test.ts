// Surface ship draw invariants: deterministic, a gently floating hull that is
// still at motion 0, balanced state, no gradients or shadows, and the chain
// attachment where the Actor layer starts the chain. E-X6 S1: the rescue boat
// artwork, its measured hole on the chain attachment, the vector fallback.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetHandle } from "../assets";
import {
  drawShip,
  SHIP_GEOMETRY,
  SHIP_HALF_EXTENT,
  SHIP_HEAVE_MAX,
  SHIP_ROLL_MAX,
  SHINE_FALL_END,
  SHINE_HOLD_END,
  SHINE_OFFSET,
  SHINE_PEAK,
  SHINE_PERIOD,
  SHINE_RISE_END,
  SHINE_STILL_ALPHA,
  shineAlpha,
  shipChainAttach,
  shipScale,
  SPRITE_HOLE_X,
  SPRITE_HOLE_Y,
  SPRITE_SCALE,
} from "./ship";

/** 2D affine matrix [a, b, c, d, e, f], as CanvasRenderingContext2D keeps it. */
type Mat = [number, number, number, number, number, number];
const apply = (m: Mat, x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** Minimal recording 2D context — just the calls drawShip makes — that also tracks the transform. */
function recordingCtx() {
  const calls: string[] = [];
  /** The transform and global alpha at each drawImage call, with the call's arguments. */
  const draws: Array<{ m: Mat; source: unknown; args: number[]; alpha: number }> = [];
  /** The transform at each ellipse call (the vector hawse hole). */
  const ellipses: Mat[] = [];
  let m: Mat = [1, 0, 0, 1, 0, 0];
  const stack: Mat[] = [];
  /** globalAlpha saved alongside each transform (save/restore keep both, as a canvas does). */
  const alphaStack: number[] = [];
  const rec =
    (name: string, effect?: (...a: number[]) => void) =>
    (...a: number[]) => {
      calls.push(`${name}(${a.map((v) => (typeof v === "number" ? v.toFixed(3) : v)).join(",")})`);
      effect?.(...a);
    };
  const ctx = {
    save: rec("save", () => {
      stack.push([...m] as Mat);
      alphaStack.push(ctx.globalAlpha);
    }),
    restore: rec("restore", () => {
      m = stack.pop() ?? m;
      ctx.globalAlpha = alphaStack.pop() ?? ctx.globalAlpha;
    }),
    translate: rec("translate", (x, y) => {
      m = [m[0], m[1], m[2], m[3], m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    }),
    scale: rec("scale", (x, y) => {
      m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]];
    }),
    rotate: rec("rotate", (r) => {
      const c = Math.cos(r);
      const s = Math.sin(r);
      m = [
        m[0] * c + m[2] * s,
        m[1] * c + m[3] * s,
        m[2] * c - m[0] * s,
        m[3] * c - m[1] * s,
        m[4],
        m[5],
      ];
    }),
    drawImage: (source: unknown, ...args: number[]) => {
      calls.push(`drawImage(${args.map((v) => v.toFixed(3)).join(",")})`);
      draws.push({ m: [...m] as Mat, source, args, alpha: ctx.globalAlpha });
    },
    rect: rec("rect"),
    beginPath: rec("beginPath"),
    closePath: rec("closePath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    quadraticCurveTo: rec("quadraticCurveTo"),
    arc: rec("arc"),
    ellipse: rec("ellipse", () => ellipses.push([...m] as Mat)),
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
    globalCompositeOperation: "source-over",
    shadowBlur: 0,
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    raw: ctx,
    calls,
    draws,
    ellipses,
    stackDepth: () => stack.length,
  };
}

/** A loaded artwork handle (the image object is only passed through to drawImage). */
function artworkHandle(): AssetHandle {
  const image = { naturalWidth: 1774, naturalHeight: 887, complete: true };
  return { image: image as unknown as HTMLImageElement, ready: true };
}
const NOT_LOADED: AssetHandle = { image: null, ready: false };
/** A loaded shine overlay handle (E-X6 S3) — a distinct image object, same frame size. */
function shineHandle(): AssetHandle {
  const image = { naturalWidth: 1774, naturalHeight: 887, complete: true, shine: true };
  return { image: image as unknown as HTMLImageElement, ready: true };
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
      // E-X6 S1: shipScale now fits the artwork (half-extent 302.87); the vector
      // fallback keeps its previous fit (bow 354 px) through an extra scale around
      // the chain hole, so its drawn size is the previous scale, below.
      const kf = Math.max(0.3, Math.min(1, (w / 2 - 10) / 354));
      if (kf < k) expect(calls).toContain(`scale(${(kf / k).toFixed(3)},${(kf / k).toFixed(3)})`);
      const xs = path.flatMap((c) => {
        const m = /^(moveTo|lineTo)\(([-\d.]+),/.exec(c);
        const q = /^quadraticCurveTo\([-\d.]+,[-\d.]+,([-\d.]+),/.exec(c);
        return m ? [Number(m[2])] : q ? [Number(q[1])] : [];
      });
      expect(xs.length).toBeGreaterThanOrEqual(5);
      expect(Math.min(...xs) * kf).toBeGreaterThan(-w / 2);
      expect(Math.max(...xs) * kf).toBeLessThan(w / 2);
      // A large hull for the scene: most of a phone's width, 600 px where it fits.
      expect((Math.max(...xs) - Math.min(...xs)) * kf).toBeGreaterThanOrEqual(
        Math.min(0.75 * w, 600),
      );
    }
  });

  it("is full size from tablet widths up and smaller only on phones", () => {
    expect(shipScale(907)).toBe(1);
    expect(shipScale(1089)).toBe(1);
    expect(shipScale(1422)).toBe(1);
    // E-X6 S1 (owner decision D4): the fit rule is unchanged — the widest half
    // of the hull plus a 10 px margin fills half the scene — but the measured
    // half-extent of the artwork is 302.87 px (previously 354), so phones show
    // a larger ship than the previous 0.602 / 0.628.
    expect(shipScale(375 / 0.84)).toBeCloseTo(0.704, 3);
    expect(shipScale(390 / 0.84)).toBeCloseTo(0.733, 3);
  });

  it("keeps the whole artwork hull inside the scene at every width", () => {
    for (const w of [...WIDTHS, 300, 2000]) {
      const k = shipScale(w);
      expect(SHIP_HALF_EXTENT * k).toBeLessThanOrEqual(w / 2 - 10 + 1e-9);
      expect(SHIP_GEOMETRY.bowX * k).toBeLessThanOrEqual(w / 2 - 10 + 1e-9);
      if (k < 1) expect(SHIP_HALF_EXTENT * k).toBeCloseTo(w / 2 - 10, 9); // no needless shrink
    }
  });
});

describe("drawShip — artwork (E-X6 S1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the measured artwork geometry: 600 px hull, hole (876.7, 677.4), half-extent 302.87", () => {
    expect(SPRITE_SCALE).toBe(600 / 1423);
    expect(SPRITE_HOLE_X).toBe(876.7);
    expect(SPRITE_HOLE_Y).toBe(677.4);
    expect(SHIP_HALF_EXTENT).toBeCloseTo(302.87, 2);
    expect(SHIP_GEOMETRY.bowX).toBeCloseTo(297.13, 2);
    expect(SHIP_GEOMETRY.mastRise).toBeCloseTo(280.14, 2);
    expect(SHIP_GEOMETRY.keelDepth).toBeCloseTo(78.26, 2);
  });

  it("draws the artwork once, at the exact rectangle that puts the hole centre on (0, attachDy)", () => {
    const { ctx, calls, draws } = recordingCtx();
    drawShip(ctx, 544.5, 300, 4.2, 1089, 40, 1, artworkHandle());
    const sprite = draws.filter((d) => d.args.length === 4);
    expect(sprite).toHaveLength(1); // no tint canvas without a DOM
    const [x, y, sw, sh] = sprite[0].args;
    expect(x).toBe(-876.7 * SPRITE_SCALE);
    expect(y).toBe(40 - 677.4 * SPRITE_SCALE);
    expect(sw).toBe(1774 * SPRITE_SCALE);
    expect(sh).toBe(887 * SPRITE_SCALE);
    expect(x).toBeCloseTo(-369.66, 2);
    expect(y).toBeCloseTo(-245.62, 2);
    expect(sw).toBeCloseTo(748.0, 2);
    expect(sh).toBeCloseTo(374.0, 2);
    // The source hole maps to the local attachment point.
    expect(x + SPRITE_HOLE_X * SPRITE_SCALE).toBeCloseTo(0, 12);
    expect(y + SPRITE_HOLE_Y * SPRITE_SCALE).toBeCloseTo(40, 12);
    // Same transform chain as the hull: translate(pivot) · rotate · scale(k) · translate(0, −WATERLINE).
    const i = calls.findIndex((c) => c.startsWith("drawImage("));
    expect(calls.slice(i - 4, i).map((c) => c.split("(")[0])).toEqual([
      "translate",
      "rotate",
      "scale",
      "translate",
    ]);
    expect(calls[i - 1]).toBe("translate(0.000,-20.000)");
    // The vector hull and its hawse hole are not drawn over the artwork.
    expect(calls.some((c) => c.startsWith("ellipse("))).toBe(false);
    expect(calls).not.toContain("clip()");
  });

  it("keeps the artwork's hole exactly on shipChainAttach through surge, heave, roll and scaling", () => {
    const at = { x: 0, y: 0 };
    for (const w of [...WIDTHS, 320]) {
      const k = shipScale(w);
      for (const motion of [0, 0.35, 1]) {
        for (let t = 0; t < 30; t += 0.731) {
          const { ctx, draws } = recordingCtx();
          drawShip(ctx, w / 2, 123, t, w, 40, motion, artworkHandle());
          const d = draws[0];
          const [hx, hy] = apply(
            d.m,
            d.args[0] + SPRITE_HOLE_X * SPRITE_SCALE,
            d.args[1] + SPRITE_HOLE_Y * SPRITE_SCALE,
          );
          shipChainAttach(t, motion, 40, k, at);
          expect(hx).toBeCloseTo(w / 2 + at.x, 9);
          expect(hy).toBeCloseTo(123 + at.y, 9);
        }
      }
    }
  });

  it("draws the artwork at the ship's scale: one source px is SPRITE_SCALE · k screen px", () => {
    for (const w of WIDTHS) {
      const { ctx, draws } = recordingCtx();
      drawShip(ctx, w / 2, 123, 0, w, 40, 0, artworkHandle());
      const d = draws[0];
      const k = shipScale(w);
      expect(Math.hypot(d.m[0], d.m[1])).toBeCloseTo(k, 12);
      expect(Math.hypot(d.m[2], d.m[3])).toBeCloseTo(k, 12);
      // Still ship: no rotation; screen width of the hull = 600 · k.
      expect(d.m[1]).toBe(0);
      expect((1595 - 172) * SPRITE_SCALE * d.m[0]).toBeCloseTo(600 * k, 9);
    }
  });

  it("falls back to the vector ship, call for call, while the artwork is not loaded", () => {
    for (const w of WIDTHS) {
      for (const t of [0, 2.2, 7.5]) {
        const a = recordingCtx();
        const b = recordingCtx();
        drawShip(a.ctx, w / 2, 51, t, w, 40, 1);
        drawShip(b.ctx, w / 2, 51, t, w, 40, 1, NOT_LOADED);
        expect(b.calls).toEqual(a.calls);
        expect(b.draws).toHaveLength(0);
        expect(b.calls.some((c) => c.startsWith("ellipse(0.000,0.000,9.000,"))).toBe(true);
      }
    }
  });

  it("balances save/restore and leaves no transform, gradient or shadow behind", () => {
    for (const w of WIDTHS) {
      const { ctx, raw, calls, stackDepth } = recordingCtx();
      drawShip(ctx, w / 2, 51, 1, w, 40, 1, artworkHandle());
      expect(countOf(calls, "save")).toBe(countOf(calls, "restore"));
      expect(stackDepth()).toBe(0);
      expect(countOf(calls, "createLinearGradient")).toBe(0);
      expect(countOf(calls, "createRadialGradient")).toBe(0);
      expect(raw.shadowBlur).toBe(0);
      expect(raw.globalCompositeOperation).toBe("source-over");
    }
  });

  it("tints the submerged artwork from one canvas prepared once, clipped level with the water", () => {
    const created: Array<{ ops: string[] }> = [];
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        expect(tag).toBe("canvas");
        const ops: string[] = [];
        const c2d = {
          drawImage: () => ops.push("drawImage"),
          fillRect: () => ops.push(`fillRect:${c2d.globalCompositeOperation}`),
          globalCompositeOperation: "source-over",
          fillStyle: "",
        };
        const canvas = { width: 0, height: 0, getContext: () => c2d, ops };
        created.push(canvas);
        return canvas;
      },
    });
    const handle = artworkHandle();
    let last: ReturnType<typeof recordingCtx> | null = null;
    for (let frame = 0; frame < 6; frame++) {
      last = recordingCtx();
      drawShip(last.ctx, 544.5, 300, frame / 60, 1089, 40, 1, handle);
      expect(countOf(last.calls, "save")).toBe(countOf(last.calls, "restore"));
    }
    expect(created).toHaveLength(1); // prepared once, not per frame
    expect(created[0].ops).toEqual(["drawImage", "fillRect:source-in"]);
    const draws = last?.draws ?? [];
    expect(draws).toHaveLength(2);
    expect(draws[1].source).toBe(created[0]);
    expect(draws[1].args).toEqual(draws[0].args); // same rectangle as the artwork
    expect(draws[1].m).toEqual(draws[0].m); // same rolling transform
    // The clip is set up level with the water surface (translated, not rotated).
    const calls = last?.calls ?? [];
    const clip = calls.indexOf("clip()");
    expect(clip).toBeGreaterThan(calls.findIndex((c) => c.startsWith("drawImage(")));
    expect(calls.slice(clip - 4, clip).map((c) => c.split("(")[0])).toEqual([
      "save",
      "translate",
      "beginPath",
      "rect",
    ]);
    // translate(cx + surge, surfaceY): the surface level, without heave or roll.
    const surge = Math.sin((5 / 60) * 0.52 + 0.4) * 6;
    expect(calls[clip - 3]).toBe(`translate(${(544.5 + surge).toFixed(3)},320.000)`);
  });

  it("starts no animation loop or timer of its own", () => {
    const raf = vi.fn();
    const timeout = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("setTimeout", timeout);
    vi.stubGlobal("setInterval", timeout);
    for (let t = 0; t < 2; t += 0.1) {
      const { ctx } = recordingCtx();
      drawShip(ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle());
    }
    expect(raf).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  });
});

describe("shineAlpha (E-X6 S3)", () => {
  /** Animation time at which the cycle is at phase `p` (s). */
  const at = (p: number, cycle = 0) => p - SHINE_OFFSET + SHINE_PERIOD * (cycle + 1);

  it("uses the owner-approved timing: 7 s cycle, 0.35 peak, offset 5.5 s", () => {
    expect(SHINE_PERIOD).toBe(7);
    expect(SHINE_RISE_END).toBe(1.6);
    expect(SHINE_HOLD_END).toBe(2.2);
    expect(SHINE_FALL_END).toBe(4.4);
    expect(SHINE_PEAK).toBe(0.35);
    expect(SHINE_OFFSET).toBe(5.5);
  });

  it("fades in, holds, fades out and rests, with smoothstep easing", () => {
    const smooth = (x: number) => x * x * (3 - 2 * x);
    expect(shineAlpha(0)).toBe(0); // t = 0 is in the rest; the first glint starts at 1.5 s
    expect(shineAlpha(1.5)).toBeCloseTo(0, 12);
    for (const p of [0.2, 0.4, 0.8, 1.2, 1.5]) {
      expect(shineAlpha(at(p))).toBeCloseTo(0.35 * smooth(p / 1.6), 9);
    }
    expect(shineAlpha(at(0.8))).toBeCloseTo(0.175, 9); // half way up
    for (const p of [1.6001, 1.9, 2.1999]) expect(shineAlpha(at(p))).toBe(0.35);
    for (const p of [2.5, 3.3, 4.0]) {
      expect(shineAlpha(at(p))).toBeCloseTo(0.35 * (1 - smooth((p - 2.2) / 2.2)), 9);
    }
    expect(shineAlpha(at(3.3))).toBeCloseTo(0.175, 9); // half way down
    for (const p of [4.4001, 5, 6, 6.9999]) expect(shineAlpha(at(p))).toBe(0);
  });

  it("stays within 0..0.35 and repeats every 7 s", () => {
    let max = 0;
    for (let t = -20; t < 60; t += 0.01) {
      const a = shineAlpha(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(0.35);
      expect(shineAlpha(t + 7)).toBeCloseTo(a, 9);
      max = Math.max(max, a);
    }
    expect(max).toBe(0.35);
  });

  it("has no jumps: continuous at every phase boundary and across the cycle wrap", () => {
    // The steepest slope of the smoothstep fade-in is 1.5 · 0.35 / 1.6 ≈ 0.33 per second.
    const dt = 1e-4;
    let steepest = 0;
    for (let t = 0; t < 21; t += dt * 37) {
      steepest = Math.max(steepest, Math.abs(shineAlpha(t + dt) - shineAlpha(t)) / dt);
    }
    expect(steepest).toBeLessThan(0.34);
    for (const p of [0, 1.6, 2.2, 4.4, 7]) {
      for (const cycle of [0, 3]) {
        const t = at(p, cycle);
        expect(Math.abs(shineAlpha(t + 1e-9) - shineAlpha(t - 1e-9))).toBeLessThan(1e-6);
      }
    }
  });

  it("returns the constant still opacity when not animated (future reduced motion)", () => {
    expect(SHINE_STILL_ALPHA).toBe(0);
    for (const t of [0, 3.4, 9.1, 100]) expect(shineAlpha(t, false)).toBe(SHINE_STILL_ALPHA);
  });
});

describe("drawShip — shine overlay (E-X6 S3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Times inside the hold (peak), the rise and the rest of the shine cycle. */
  const PEAK_T = 3.4;
  const RISE_T = 2.3;
  const REST_T = 0;

  it("draws the shine right over the artwork: same rectangle, same transform, at the curve's opacity", () => {
    for (const t of [PEAK_T, RISE_T]) {
      const shine = shineHandle();
      const { ctx, raw, calls, draws, stackDepth } = recordingCtx();
      drawShip(ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle(), shine);
      expect(draws).toHaveLength(2); // no tint canvas without a DOM
      expect(draws[1].source).toBe(shine.image);
      expect(draws[1].args).toEqual(draws[0].args);
      expect(draws[1].m).toEqual(draws[0].m);
      expect(draws[0].alpha).toBe(1);
      expect(draws[1].alpha).toBeCloseTo(shineAlpha(t), 12);
      // Directly above the base: no transform change between the two draws.
      const i = calls.findIndex((c) => c.startsWith("drawImage("));
      expect(calls[i + 1].startsWith("drawImage(")).toBe(true);
      // Opacity and state are restored afterwards.
      expect(raw.globalAlpha).toBe(1);
      expect(raw.globalCompositeOperation).toBe("source-over");
      expect(stackDepth()).toBe(0);
      expect(countOf(calls, "save")).toBe(countOf(calls, "restore"));
    }
  });

  it("follows surge, heave, roll and scaling exactly: the shine's hole stays on shipChainAttach", () => {
    const hole = { x: 0, y: 0 };
    for (const w of [...WIDTHS, 320]) {
      const k = shipScale(w);
      for (const motion of [0, 0.35, 1]) {
        for (let t = 2; t < 5; t += 0.137) {
          const { ctx, draws } = recordingCtx();
          drawShip(ctx, w / 2, 123, t, w, 40, motion, artworkHandle(), shineHandle());
          expect(draws).toHaveLength(2);
          expect(draws[1].m).toEqual(draws[0].m);
          expect(draws[1].args).toEqual(draws[0].args);
          const d = draws[1];
          const [hx, hy] = apply(
            d.m,
            d.args[0] + SPRITE_HOLE_X * SPRITE_SCALE,
            d.args[1] + SPRITE_HOLE_Y * SPRITE_SCALE,
          );
          shipChainAttach(t, motion, 40, k, hole);
          expect(hx).toBeCloseTo(w / 2 + hole.x, 9);
          expect(hy).toBeCloseTo(123 + hole.y, 9);
        }
      }
    }
  });

  it("skips the extra draw while the opacity is effectively zero", () => {
    for (const t of [REST_T, 6.0, 8.0, 8.4]) {
      expect(shineAlpha(t)).toBe(0);
      const a = recordingCtx();
      const b = recordingCtx();
      drawShip(a.ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle());
      drawShip(b.ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle(), shineHandle());
      expect(b.calls).toEqual(a.calls);
      expect(b.draws).toHaveLength(1);
    }
  });

  it("draws the base ship normally while the shine is not loaded", () => {
    for (const t of [PEAK_T, RISE_T]) {
      const a = recordingCtx();
      const b = recordingCtx();
      drawShip(a.ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle());
      drawShip(b.ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle(), NOT_LOADED);
      expect(b.calls).toEqual(a.calls);
      expect(b.draws).toHaveLength(1);
    }
  });

  it("never draws the shine over the vector fallback", () => {
    for (const w of WIDTHS) {
      for (const t of [PEAK_T, RISE_T, REST_T]) {
        const a = recordingCtx();
        const b = recordingCtx();
        drawShip(a.ctx, w / 2, 51, t, w, 40, 1, NOT_LOADED);
        drawShip(b.ctx, w / 2, 51, t, w, 40, 1, NOT_LOADED, shineHandle());
        expect(b.calls).toEqual(a.calls);
        expect(b.draws).toHaveLength(0);
      }
    }
  });

  it("scales with the context's opacity and restores it", () => {
    const { ctx, raw, draws } = recordingCtx();
    raw.globalAlpha = 0.5;
    drawShip(ctx, 544.5, 300, PEAK_T, 1089, 40, 1, artworkHandle(), shineHandle());
    expect(draws[0].alpha).toBe(0.5);
    expect(draws[1].alpha).toBeCloseTo(0.175, 12);
    expect(raw.globalAlpha).toBe(0.5);
  });

  it("keeps the underwater tint unchanged: built from the base once, drawn after the shine", () => {
    const created: Array<{ sources: unknown[] }> = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const sources: unknown[] = [];
        const c2d = {
          drawImage: (s: unknown) => sources.push(s),
          fillRect: () => {},
          globalCompositeOperation: "source-over",
          fillStyle: "",
        };
        const canvas = { width: 0, height: 0, getContext: () => c2d, sources };
        created.push(canvas);
        return canvas;
      },
    });
    const base = artworkHandle();
    const shine = shineHandle();
    let last: ReturnType<typeof recordingCtx> | null = null;
    for (let frame = 0; frame < 6; frame++) {
      last = recordingCtx();
      drawShip(last.ctx, 544.5, 300, PEAK_T + frame / 60, 1089, 40, 1, base, shine);
    }
    expect(created).toHaveLength(1); // still one tint canvas, not per frame
    expect(created[0].sources).toEqual([base.image]); // the tint silhouette is the base's
    const draws = last?.draws ?? [];
    expect(draws.map((d) => d.source)).toEqual([base.image, shine.image, created[0]]);
    expect(draws[2].args).toEqual(draws[0].args);
    expect(draws[2].m).toEqual(draws[0].m);
    expect(draws[2].alpha).toBe(1); // the tint is not dimmed by the shine's opacity
  });

  it("starts no animation loop or timer and allocates no canvas per frame", () => {
    const raf = vi.fn();
    const timeout = vi.fn();
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => null }));
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("setTimeout", timeout);
    vi.stubGlobal("setInterval", timeout);
    vi.stubGlobal("document", { createElement });
    const base = artworkHandle();
    const shine = shineHandle();
    for (let t = 0; t < 14; t += 0.1) {
      const { ctx } = recordingCtx();
      drawShip(ctx, 544.5, 300, t, 1089, 40, 1, base, shine);
    }
    expect(raf).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(createElement.mock.calls.length).toBeLessThanOrEqual(1); // the tint, once per base image at most
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

  it("keeps the vector fallback's hawse hole exactly on shipChainAttach too", () => {
    const at = { x: 0, y: 0 };
    for (const w of WIDTHS) {
      const k = shipScale(w);
      for (const t of [0, 1.1, 2.2, 13.7]) {
        const { ctx, calls, ellipses } = recordingCtx();
        drawShip(ctx, w / 2, 51, t, w, 40, 1);
        expect(calls.find((c) => c.startsWith("ellipse("))).toMatch(
          /^ellipse\(0\.000,0\.000,9\.000,/,
        );
        // The first ellipse is the hole, drawn at the origin of its frame.
        const [hx, hy] = apply(ellipses[0], 0, 0);
        shipChainAttach(t, 1, 40, k, at);
        expect(hx).toBeCloseTo(w / 2 + at.x, 9);
        expect(hy).toBeCloseTo(51 + at.y, 9);
      }
    }
  });
});

describe("floating motion (preserved by E-X6)", () => {
  // The surge, heave and roll formulas as they stood before E-X6, verbatim.
  const surge = (t: number) => Math.sin(t * 0.52 + 0.4) * 6;
  const heave = (t: number) => Math.sin(t * 1.15) * 4 + Math.sin(t * 0.67 + 1.3) * 2;
  const roll = (t: number) => Math.sin(t * 0.85 + 0.9) * 0.024 + Math.sin(t * 1.43) * 0.008;

  it("shipChainAttach is bit-identical to the previous formulas", () => {
    const out = { x: 0, y: 0 };
    for (const scale of [1, 0.733, 0.704, 0.3]) {
      for (const motion of [0, 0.25, 1]) {
        for (let t = 0; t < 60; t += 0.377) {
          shipChainAttach(t, motion, 40, scale, out);
          const r = roll(t) * motion;
          const arm = (40 - 20) * scale;
          expect(out.x).toBe(surge(t) * motion - Math.sin(r) * arm);
          expect(out.y).toBe(heave(t) * motion + 40 + (Math.cos(r) - 1) * arm);
        }
      }
    }
  });

  it("drawShip moves the hull by exactly the previous surge, heave and roll", () => {
    for (const t of [0, 0.5, 3.3, 21.9]) {
      const { ctx, calls } = recordingCtx();
      drawShip(ctx, 544.5, 300, t, 1089, 40, 1, artworkHandle());
      const i = calls.findIndex((c) => c.startsWith("drawImage("));
      expect(calls[i - 4]).toBe(
        `translate(${(544.5 + surge(t)).toFixed(3)},${(320 + heave(t)).toFixed(3)})`,
      );
      expect(calls[i - 3]).toBe(`rotate(${roll(t).toFixed(3)})`);
    }
  });

  it("SHIP_HEAVE_MAX and SHIP_ROLL_MAX bound the motion, and are nearly reached", () => {
    let maxHeave = 0;
    let maxRoll = 0;
    for (let t = 0; t < 2000; t += 0.01) {
      maxHeave = Math.max(maxHeave, Math.abs(heave(t)));
      maxRoll = Math.max(maxRoll, Math.abs(roll(t)));
    }
    expect(SHIP_HEAVE_MAX).toBe(6);
    expect(SHIP_ROLL_MAX).toBeCloseTo(0.032, 12);
    expect(maxHeave).toBeLessThanOrEqual(SHIP_HEAVE_MAX);
    expect(maxRoll).toBeLessThanOrEqual(SHIP_ROLL_MAX);
    expect(maxHeave).toBeGreaterThan(SHIP_HEAVE_MAX * 0.97);
    expect(maxRoll).toBeGreaterThan(SHIP_ROLL_MAX * 0.97);
  });
});
