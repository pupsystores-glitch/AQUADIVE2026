// V2 — F1 marine snow and F2 depth vignette (docs/08 §4.3). These tests pin:
// determinism (no randomness, no clock of their own); the speck caps and the
// alpha / radius / sink / parallax bounds; stable wrapping; the High, Low and
// reduced-motion behaviours; viewport scaling; that both effects issue no
// draw call at depthRatio 0; the per-context vignette gradient cache; no
// per-frame allocation (one reused buffer, one gradient, constant styles);
// and that the Environment layer still draws its rays and bubbles exactly as
// before, with the snow and then the vignette appended after them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Camera } from "../camera";
import { environmentLayer } from "../layers/environment";
import type { FxSettings, RenderState } from "../render-state";
import { BG_BOTTOM_ABYSS, DEPTH_FX_THEME, DEPTH_VIGNETTE_TONE } from "../theme";
import {
  DEFAULT_FX_SETTINGS,
  DEPTH_VIGNETTE_FALLOFF,
  DEPTH_VIGNETTE_FULL_DEPTH,
  DEPTH_VIGNETTE_INNER,
  DEPTH_VIGNETTE_MAX,
  MARINE_SNOW_ALPHA_MAX,
  MARINE_SNOW_ALPHA_MIN,
  MARINE_SNOW_FULL_DEPTH,
  MARINE_SNOW_MAX,
  MARINE_SNOW_MAX_LOW,
  MARINE_SNOW_PARALLAX_MAX,
  MARINE_SNOW_PARALLAX_MIN,
  MARINE_SNOW_RADIUS_MAX,
  MARINE_SNOW_RADIUS_MIN,
  MARINE_SNOW_REDUCED_PARALLAX,
  MARINE_SNOW_SINK_MAX,
  MARINE_SNOW_SINK_MIN,
  MARINE_SNOW_STRIDE,
  MARINE_SNOW_SWAY_MAX,
  MARINE_SNOW_WRAP_MARGIN,
  depthVignetteIntensity,
  depthVignetteProfile,
  drawDepthVignette,
  drawMarineSnow,
  layoutMarineSnow,
  marineSnowCount,
  marineSnowFade,
  marineSnowSpecks,
} from "./particles";
import particlesSource from "./particles.ts?raw";

// ----- Helpers -----

const HIGH: FxSettings = { reducedMotion: false, quality: "high" };
const LOW: FxSettings = { reducedMotion: false, quality: "low" };
const HIGH_REDUCED: FxSettings = { reducedMotion: true, quality: "high" };
const LOW_REDUCED: FxSettings = { reducedMotion: true, quality: "low" };

const M = MARINE_SNOW_WRAP_MARGIN;
const VIEWPORTS: Array<[number, number]> = [
  [375, 667],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

interface Speck {
  x: number;
  y: number;
  r: number;
  a: number;
}

function layout(w: number, h: number, worldY: number, t: number, fx: FxSettings): Speck[] {
  const n = layoutMarineSnow(w, h, worldY, t, fx);
  const b = marineSnowSpecks();
  const out: Speck[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * MARINE_SNOW_STRIDE;
    out.push({ x: b[o], y: b[o + 1], r: b[o + 2], a: b[o + 3] });
  }
  return out;
}

/** Signed shortest distance from a to b on a circle of length `span`. */
function wrapDelta(a: number, b: number, span: number): number {
  let d = (b - a) % span;
  if (d > span / 2) d -= span;
  if (d < -span / 2) d += span;
  return d;
}

type Call = [string, ...unknown[]];

interface Recorder {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  gradients: Array<{ args: number[]; stops: Array<[number, string]> }>;
}

/** A 2D context stand-in that records every method call and property write, in order. */
function recorder(): Recorder {
  const calls: Call[] = [];
  const gradients: Recorder["gradients"] = [];
  const makeGradient = (kind: string, args: number[]) => {
    const g = { kind, args, stops: [] as Array<[number, string]> };
    gradients.push(g);
    return {
      __gradient: gradients.length - 1,
      addColorStop: (p: number, c: string) => {
        g.stops.push([p, c]);
        calls.push(["addColorStop", p, c]);
      },
    };
  };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop: string) {
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...args: number[]) => {
          calls.push([prop, ...args]);
          return makeGradient(prop, args);
        };
      }
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
      };
    },
    set(_t, prop: string, value: unknown) {
      calls.push([`set ${prop}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, gradients };
}

const named = (calls: Call[], name: string) => calls.filter((c) => c[0] === name);

function stateAt(depthRatio: number, worldY = depthRatio * 4200): RenderState {
  return {
    phase: "diving",
    worldY,
    depthRatio,
    boost: 0,
    creatures: [],
    crashed: false,
    shipImpact: null,
  };
}

function cameraFor(w: number, h: number, worldY: number): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  return camera;
}

/** The Environment layer's body as it was before V2 (rays + bubbles), kept verbatim as the reference. */
function legacyEnvironment(
  ctx: CanvasRenderingContext2D,
  depthRatio: number,
  w: number,
  h: number,
  animTime: number,
) {
  const rayAlpha = (1 - depthRatio) * 0.18;
  if (rayAlpha > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i++) {
      const x = (w * (i + 0.5)) / 4 + Math.sin(animTime * 0.4 + i) * 14;
      const g = ctx.createLinearGradient(x, 0, x, h * 0.7);
      g.addColorStop(0, `rgba(180,220,255,${rayAlpha})`);
      g.addColorStop(1, "rgba(180,220,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 30, 0);
      ctx.lineTo(x + 30, 0);
      ctx.lineTo(x + 80, h * 0.7);
      ctx.lineTo(x - 80, h * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const bubbleSeed = animTime;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = 0; i < 24; i++) {
    const bx = (i * 73 + bubbleSeed * 12) % w;
    const by = h - ((i * 41 + bubbleSeed * 60) % h);
    const br = 1 + ((i * 17) % 3);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Gradient objects differ between recorders; compare them by their creation index. */
const normalise = (calls: Call[]) =>
  JSON.parse(
    JSON.stringify(calls, (_k, v) => (v && v.__gradient !== undefined ? `g${v.__gradient}` : v)),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

// ----- F1 marine snow -----

describe("marine snow layout (F1)", () => {
  it("is deterministic: the same inputs give the same layout, whatever was laid out in between", () => {
    const random = vi.spyOn(Math, "random");
    const a = layout(390, 844, 1234, 56.7, HIGH);
    layout(1920, 1080, 9, 3, LOW);
    layout(768, 1024, 4000, 900, HIGH_REDUCED);
    expect(layout(390, 844, 1234, 56.7, HIGH)).toEqual(a);
    expect(random).not.toHaveBeenCalled();
  });

  it("uses no randomness, timer, wall clock or animation loop of its own", () => {
    const code = particlesSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const banned of [
      "Math.random",
      "setTimeout",
      "setInterval",
      "requestAnimationFrame",
      "Date.now",
      "performance",
      "new Date",
    ]) {
      expect(code).not.toContain(banned);
    }
  });

  it("caps the specks at 48 on High and 24 on Low, in every viewport", () => {
    expect(MARINE_SNOW_MAX).toBe(48);
    expect(MARINE_SNOW_MAX_LOW).toBe(24);
    for (const [w, h] of VIEWPORTS) {
      expect(layoutMarineSnow(w, h, 800, 3, HIGH)).toBe(48);
      expect(layoutMarineSnow(w, h, 800, 3, LOW)).toBe(24);
      expect(layoutMarineSnow(w, h, 800, 3, HIGH_REDUCED)).toBe(48);
      expect(layoutMarineSnow(w, h, 800, 3, LOW_REDUCED)).toBe(24);
    }
    expect(marineSnowCount(HIGH)).toBe(48);
    expect(marineSnowCount(LOW)).toBe(24);
  });

  it("keeps alpha within 0.18–0.40 and radius within 1.1–2.2 px, with real variety", () => {
    expect([MARINE_SNOW_ALPHA_MIN, MARINE_SNOW_ALPHA_MAX]).toEqual([0.18, 0.4]);
    expect([MARINE_SNOW_RADIUS_MIN, MARINE_SNOW_RADIUS_MAX]).toEqual([1.1, 2.2]);
    const specks = layout(390, 844, 0, 0, HIGH);
    for (const s of specks) {
      expect(s.a).toBeGreaterThanOrEqual(0.18 - 1e-6);
      expect(s.a).toBeLessThanOrEqual(0.4 + 1e-6);
      expect(s.r).toBeGreaterThanOrEqual(1.1 - 1e-6);
      expect(s.r).toBeLessThanOrEqual(2.2 + 1e-6);
    }
    const alphas = specks.map((s) => s.a);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.12);
    const radii = specks.map((s) => s.r);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.6);
  });

  it("returns nothing for an empty or invalid viewport", () => {
    expect(layoutMarineSnow(0, 844, 0, 0, HIGH)).toBe(0);
    expect(layoutMarineSnow(390, 0, 0, 0, HIGH)).toBe(0);
    expect(layoutMarineSnow(Number.NaN, 844, 0, 0, HIGH)).toBe(0);
  });

  it("stays inside the wrap area at every time and depth, and never produces a non-finite value", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [0, 1, 733.3, 4200, -50]) {
        for (const t of [0, 0.016, 77.7, 3600, 86400]) {
          for (const s of layout(w, h, worldY, t, HIGH)) {
            expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
            expect(s.x).toBeGreaterThanOrEqual(-M);
            expect(s.x).toBeLessThanOrEqual(w + M);
            expect(s.y).toBeGreaterThanOrEqual(-M);
            expect(s.y).toBeLessThanOrEqual(h + M);
          }
        }
      }
    }
    // A non-finite clock or depth is treated as 0 rather than poisoning the layout.
    expect(layout(390, 844, Number.NaN, Number.POSITIVE_INFINITY, HIGH)).toEqual(
      layout(390, 844, 0, 0, HIGH),
    );
  });

  it("spreads the specks over the viewport: every quadrant is populated on High and on Low", () => {
    for (const fx of [HIGH, LOW]) {
      const quadrants = [0, 0, 0, 0];
      for (const s of layout(1280, 720, 0, 0, fx)) {
        quadrants[(s.x < 640 ? 0 : 1) + (s.y < 360 ? 0 : 2)]++;
      }
      for (const q of quadrants) expect(q).toBeGreaterThanOrEqual(marineSnowCount(fx) / 8);
    }
  });

  it("sinks at 3–6 px/s with a small sway, and wraps without a jump", () => {
    const [w, h] = [390, 844];
    const spanX = w + 2 * M;
    const spanY = h + 2 * M;
    for (const t0 of [0, 41.3, 500]) {
      const a = layout(w, h, 900, t0, HIGH);
      const b = layout(w, h, 900, t0 + 1, HIGH);
      for (let i = 0; i < a.length; i++) {
        const dy = wrapDelta(a[i].y, b[i].y, spanY);
        expect(dy).toBeGreaterThanOrEqual(MARINE_SNOW_SINK_MIN - 1e-3);
        expect(dy).toBeLessThanOrEqual(MARINE_SNOW_SINK_MAX + 1e-3);
        // Sway: a bounded sine, so one second moves a speck at most twice its amplitude.
        expect(Math.abs(wrapDelta(a[i].x, b[i].x, spanX))).toBeLessThanOrEqual(
          2 * MARINE_SNOW_SWAY_MAX + 1e-3,
        );
      }
    }
    // Stable wrapping: over a full sweep, one 60 Hz frame never moves a speck more than a
    // fraction of a pixel on the wrap circle — an edge crossing is continuous, not a jump.
    let prev = layout(w, h, 0, 0, HIGH);
    let maxStep = 0;
    for (let f = 1; f <= 3600; f++) {
      const cur = layout(w, h, 0, f / 60, HIGH);
      for (let i = 0; i < cur.length; i++) {
        maxStep = Math.max(
          maxStep,
          Math.abs(wrapDelta(prev[i].y, cur[i].y, spanY)),
          Math.abs(wrapDelta(prev[i].x, cur[i].x, spanX)),
        );
      }
      prev = cur;
    }
    expect(maxStep).toBeLessThan(0.2);
  });

  it("High: scrolls against the dive at a parallax factor of 0.25–0.50, slower than the world", () => {
    const [w, h] = [390, 844];
    const spanY = h + 2 * M;
    const a = layout(w, h, 1000, 5, HIGH);
    const b = layout(w, h, 1100, 5, HIGH);
    const factors = a.map((s, i) => -wrapDelta(s.y, b[i].y, spanY) / 100);
    for (let i = 0; i < a.length; i++) {
      expect(factors[i]).toBeGreaterThanOrEqual(MARINE_SNOW_PARALLAX_MIN - 1e-4);
      expect(factors[i]).toBeLessThanOrEqual(MARINE_SNOW_PARALLAX_MAX + 1e-4);
      expect(b[i].x).toBe(a[i].x); // depth never moves a speck sideways
    }
    expect(Math.max(...factors) - Math.min(...factors)).toBeGreaterThan(0.1); // layered depth
  });

  it("Low: half the specks — the first 24 of the High set — and no world-scroll parallax", () => {
    const high = layout(390, 844, 0, 7, HIGH);
    const low = layout(390, 844, 0, 7, LOW);
    expect(low).toEqual(high.slice(0, 24));
    expect(layout(390, 844, 3000, 7, LOW)).toEqual(low);
    // It still sinks and sways with the animation clock.
    expect(layout(390, 844, 0, 9, LOW)).not.toEqual(low);
  });

  it("reduced motion: nothing depends on time; the static composition keeps a reduced parallax", () => {
    const still = layout(390, 844, 1500, 0, HIGH_REDUCED);
    for (const t of [0.016, 1, 59.9, 3600]) {
      expect(layout(390, 844, 1500, t, HIGH_REDUCED)).toEqual(still);
      expect(layout(390, 844, 1500, t, LOW_REDUCED)).toEqual(
        layout(390, 844, 1500, 0, LOW_REDUCED),
      );
    }
    // At depth 0 it is the High composition frozen at t = 0.
    expect(layout(390, 844, 0, 123, HIGH_REDUCED)).toEqual(layout(390, 844, 0, 0, HIGH));
    // Parallax is halved on High…
    const spanY = 844 + 2 * M;
    const a = layout(390, 844, 1000, 9, HIGH_REDUCED);
    const b = layout(390, 844, 1100, 9, HIGH_REDUCED);
    for (let i = 0; i < a.length; i++) {
      const factor = -wrapDelta(a[i].y, b[i].y, spanY) / 100;
      expect(factor).toBeGreaterThanOrEqual(
        MARINE_SNOW_PARALLAX_MIN * MARINE_SNOW_REDUCED_PARALLAX - 1e-4,
      );
      expect(factor).toBeLessThanOrEqual(
        MARINE_SNOW_PARALLAX_MAX * MARINE_SNOW_REDUCED_PARALLAX + 1e-4,
      );
    }
    // …and absent on Low: fully static.
    expect(layout(390, 844, 4000, 50, LOW_REDUCED)).toEqual(layout(390, 844, 0, 0, LOW_REDUCED));
  });

  it("scales with the viewport: the same normalised composition at all seven sizes", () => {
    const norm = (w: number, h: number) =>
      layout(w, h, 0, 0, HIGH_REDUCED).map((s) => [
        (s.x + M) / (w + 2 * M),
        (s.y + M) / (h + 2 * M),
        s.r,
        s.a,
      ]);
    const ref = norm(390, 844);
    for (const [w, h] of VIEWPORTS) {
      const n = norm(w, h);
      const spanX = w + 2 * M;
      for (let i = 0; i < ref.length; i++) {
        // Horizontally the frozen sway offset is in CSS px, not a fraction: allow its
        // amplitude, expressed as a fraction of each of the two viewports.
        const dx = Math.abs(wrapDelta(n[i][0], ref[i][0], 1));
        expect(dx).toBeLessThanOrEqual(
          MARINE_SNOW_SWAY_MAX / spanX + MARINE_SNOW_SWAY_MAX / (390 + 2 * M) + 1e-6,
        );
        expect(n[i][1]).toBeCloseTo(ref[i][1], 4);
        expect(n[i][2]).toBe(ref[i][2]); // radius stays in CSS px
        expect(n[i][3]).toBe(ref[i][3]);
      }
    }
  });

  it("writes into one reused buffer: no per-frame allocation", () => {
    const buffer = marineSnowSpecks();
    expect(buffer.length).toBe(MARINE_SNOW_MAX * MARINE_SNOW_STRIDE);
    for (let f = 0; f < 10; f++) {
      layoutMarineSnow(390 + f, 844, f * 10, f / 60, f % 2 ? HIGH : LOW);
      expect(marineSnowSpecks()).toBe(buffer);
    }
  });
});

describe("marine snow depth fade and drawing (F1)", () => {
  it("fades in smoothly from exactly 0 at the surface to 1 at depthRatio 0.10", () => {
    expect(MARINE_SNOW_FULL_DEPTH).toBe(0.1);
    expect(marineSnowFade(0)).toBe(0);
    expect(marineSnowFade(-0.1)).toBe(0);
    expect(marineSnowFade(Number.NaN)).toBe(0);
    expect(marineSnowFade(0.1)).toBe(1);
    expect(marineSnowFade(0.12)).toBe(1);
    expect(marineSnowFade(1)).toBe(1);
    expect(marineSnowFade(0.05)).toBeCloseTo(0.5, 12);
    let prev = 0;
    for (let d = 0.0005; d <= 0.2; d += 0.0005) {
      const f = marineSnowFade(d);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f - prev).toBeLessThan(0.01); // no sudden step
      prev = f;
    }
  });

  it("issues no draw call at depthRatio 0, in any mode", () => {
    for (const fx of [HIGH, LOW, HIGH_REDUCED, LOW_REDUCED]) {
      const r = recorder();
      drawMarineSnow(r.ctx, 390, 844, 0, 0, 12, fx);
      drawMarineSnow(r.ctx, 390, 844, 500, 0, 12, fx);
      expect(r.calls).toEqual([]);
    }
  });

  it("draws one small soft disc per speck inside a balanced save/restore", () => {
    for (const [fx, count] of [
      [HIGH, 48],
      [LOW, 24],
    ] as const) {
      for (const depth of [0.01, 0.05, 0.1, 0.5, 1]) {
        const r = recorder();
        drawMarineSnow(r.ctx, 390, 844, depth * 4200, depth, 3, fx);
        expect(r.calls[0]).toEqual(["save"]);
        expect(r.calls[r.calls.length - 1]).toEqual(["restore"]);
        expect(named(r.calls, "save")).toHaveLength(1);
        expect(named(r.calls, "restore")).toHaveLength(1);
        expect(named(r.calls, "arc")).toHaveLength(count);
        expect(named(r.calls, "fill")).toHaveLength(count);
        // One constant fill style; the alpha is globalAlpha — no colour string per speck or frame.
        expect(named(r.calls, "set fillStyle")).toEqual([
          ["set fillStyle", DEPTH_FX_THEME.marineSnow],
        ]);
        const fade = marineSnowFade(depth);
        const alphas = named(r.calls, "set globalAlpha").map((c) => c[1] as number);
        expect(alphas).toHaveLength(count);
        for (const a of alphas) {
          expect(a).toBeGreaterThan(0);
          expect(a).toBeGreaterThanOrEqual(MARINE_SNOW_ALPHA_MIN * fade - 1e-6);
          expect(a).toBeLessThanOrEqual(MARINE_SNOW_ALPHA_MAX * fade + 1e-6);
          expect(a).toBeLessThanOrEqual(0.4 + 1e-6);
        }
        for (const arc of named(r.calls, "arc")) {
          expect(arc[3] as number).toBeLessThanOrEqual(2.2 + 1e-6);
          expect(arc.slice(4)).toEqual([0, Math.PI * 2]);
        }
        // Only these operations: nothing that could touch another layer's state.
        const allowed = [
          "save",
          "restore",
          "set fillStyle",
          "set globalAlpha",
          "beginPath",
          "arc",
          "fill",
        ];
        for (const c of r.calls) expect(allowed).toContain(c[0]);
      }
    }
  });
});

// ----- F2 depth vignette -----

describe("depth vignette (F2)", () => {
  it("is exactly 0 at the surface, grows smoothly and tops out at 0.60 from depthRatio 0.45", () => {
    expect(DEPTH_VIGNETTE_MAX).toBe(0.6);
    expect(DEPTH_VIGNETTE_FULL_DEPTH).toBe(0.45);
    expect(depthVignetteIntensity(0)).toBe(0);
    expect(depthVignetteIntensity(-1)).toBe(0);
    expect(depthVignetteIntensity(Number.NaN)).toBe(0);
    expect(depthVignetteIntensity(DEPTH_VIGNETTE_FULL_DEPTH)).toBe(0.6);
    expect(depthVignetteIntensity(0.45)).toBe(0.6);
    expect(depthVignetteIntensity(1)).toBe(0.6);
    expect(depthVignetteIntensity(5)).toBe(0.6);
    let prev = 0;
    for (let d = 0.001; d <= 1; d += 0.001) {
      const v = depthVignetteIntensity(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      // No sudden depth transition: the steepest smoothstep slope is 1.5 × 0.6 / 0.45 = 2 per
      // unit depth, i.e. 0.002 per 0.001 step.
      expect(v - prev).toBeLessThan(0.0021);
      prev = v;
    }
    // Near the surface it is negligible.
    expect(depthVignetteIntensity(0.01)).toBeLessThan(0.001);
    expect(depthVignetteIntensity(0.02)).toBeLessThan(0.004);
  });

  it("issues no draw call and creates no gradient at depthRatio 0", () => {
    const r = recorder();
    drawDepthVignette(r.ctx, 390, 844, 0);
    expect(r.calls).toEqual([]);
    drawDepthVignette(r.ctx, 0, 844, 0.5);
    expect(r.calls).toEqual([]);
  });

  it("fills an ellipse matched to the viewport: unit gradient, stretched by the transform", () => {
    for (const [w, h] of VIEWPORTS) {
      const r = recorder();
      drawDepthVignette(r.ctx, w, h, 0.4);
      const ops = r.calls.filter((c) => c[0] !== "addColorStop");
      expect(ops.map((c) => c[0])).toEqual([
        "createRadialGradient",
        "save",
        "translate",
        "scale",
        "set globalAlpha",
        "set fillStyle",
        "fillRect",
        "restore",
      ]);
      // Centred on the viewport; edge midpoints at radius 1, corners at √2 — in both axes.
      expect(ops[0]).toEqual([
        "createRadialGradient",
        0,
        0,
        DEPTH_VIGNETTE_INNER,
        0,
        0,
        Math.SQRT2,
      ]);
      expect(ops[2]).toEqual(["translate", w / 2, h / 2]);
      expect(ops[3]).toEqual(["scale", w / 2, h / 2]);
      expect(ops[4]).toEqual(["set globalAlpha", depthVignetteIntensity(0.4)]);
      expect(ops[6]).toEqual(["fillRect", -1, -1, 2, 2]);
    }
  });

  it("never darkens more than 0.60, only outside the clear centre, on a p^1.6 falloff", () => {
    const r = recorder();
    drawDepthVignette(r.ctx, 390, 844, 1);
    expect(named(r.calls, "set globalAlpha")).toEqual([["set globalAlpha", 0.6]]);
    expect(DEPTH_VIGNETTE_INNER).toBe(0.3); // clear centre: 0.30 of the half-viewport
    expect(DEPTH_VIGNETTE_FALLOFF).toBe(1.6);
    const stops = r.gradients[0].stops;
    const alpha = (c: string) => Number(/, ([\d.e-]+)\)$/.exec(c)?.[1]);
    expect(stops[0][0]).toBe(0);
    expect(alpha(stops[0][1])).toBe(0); // nothing at the inner radius: no ring
    expect(stops[stops.length - 1][0]).toBe(1);
    expect(alpha(stops[stops.length - 1][1])).toBe(1); // corners: globalAlpha × 1 = intensity
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      const step = alpha(stops[i][1]) - alpha(stops[i - 1][1]);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(0.2); // many small steps: no visible band or hard ring
    }
    for (const [p, c] of stops) expect(alpha(c)).toBeCloseTo(p ** 1.6, 12);
    expect(alpha(stops[1][1])).toBeLessThan(0.02); // soft start: (1/12)^1.6 ≈ 0.019
    expect(depthVignetteProfile(-1)).toBe(0);
    expect(depthVignetteProfile(2)).toBe(1);
  });

  it("uses the theme's dark blue, not black", () => {
    expect(DEPTH_VIGNETTE_TONE).toEqual([0, 3, 10]);
    const [red, green, blue] = DEPTH_VIGNETTE_TONE;
    // A shade deeper than the abyss gradient's bottom colour, never lighter.
    for (let i = 0; i < 3; i++)
      expect(DEPTH_VIGNETTE_TONE[i]).toBeLessThanOrEqual(BG_BOTTOM_ABYSS[i]);
    expect(DEPTH_FX_THEME.vignette(0.5)).toBe(`rgba(${red}, ${green}, ${blue}, 0.5)`);
    expect(blue).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
    expect(red + green + blue).toBeGreaterThan(0);
    const r = recorder();
    drawDepthVignette(r.ctx, 390, 844, 1);
    for (const [, colour] of r.gradients[0].stops) {
      expect(colour.startsWith(`rgba(${red}, ${green}, ${blue}, `)).toBe(true);
    }
  });

  it("caches one gradient per context: reused across frames, depths and viewport sizes", () => {
    const a = recorder();
    for (let f = 0; f < 50; f++) {
      const [w, h] = VIEWPORTS[f % VIEWPORTS.length];
      drawDepthVignette(a.ctx, w, h, 0.05 + (f % 10) / 10);
    }
    expect(named(a.calls, "createRadialGradient")).toHaveLength(1);
    const styles = named(a.calls, "set fillStyle").map((c) => c[1]);
    expect(styles).toHaveLength(50);
    expect(new Set(styles).size).toBe(1); // the very same gradient object every frame

    // A different drawing context gets its own gradient; the first one keeps its own.
    const b = recorder();
    drawDepthVignette(b.ctx, 390, 844, 0.5);
    drawDepthVignette(b.ctx, 390, 844, 0.6);
    expect(named(b.calls, "createRadialGradient")).toHaveLength(1);
    expect(named(b.calls, "set fillStyle")[0][1]).not.toBe(styles[0]);
    drawDepthVignette(a.ctx, 390, 844, 0.5);
    expect(named(a.calls, "createRadialGradient")).toHaveLength(1);
  });
});

// ----- Environment layer integration -----

describe("Environment layer with V2", () => {
  const TIME = { animTime: 12.34, frameDt: 1 / 60 };

  it("at the surface draws exactly what it drew before V2: rays and bubbles, nothing else", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const fx of [HIGH, LOW, HIGH_REDUCED, undefined]) {
        const now = recorder();
        environmentLayer.render(now.ctx, stateAt(0), cameraFor(w, h, 0), TIME, fx);
        const before = recorder();
        legacyEnvironment(before.ctx, 0, w, h, TIME.animTime);
        expect(normalise(now.calls)).toEqual(normalise(before.calls));
      }
    }
  });

  it("at depth keeps rays and bubbles unchanged, then adds the snow and, last, the vignette", () => {
    for (const depth of [0.05, 0.3, 0.6, 0.97, 1]) {
      for (const [fx, count] of [
        [HIGH, 48],
        [LOW, 24],
        [HIGH_REDUCED, 48],
      ] as const) {
        const [w, h] = [390, 844];
        const worldY = depth * 4200;
        const now = recorder();
        environmentLayer.render(now.ctx, stateAt(depth), cameraFor(w, h, worldY), TIME, fx);
        const before = recorder();
        legacyEnvironment(before.ctx, depth, w, h, TIME.animTime);
        const legacy = normalise(before.calls);
        const all = normalise(now.calls);
        // Rays and bubbles: identical calls, in the same order, before anything new.
        expect(all.slice(0, legacy.length)).toEqual(legacy);

        const added = now.calls.slice(before.calls.length);
        const snow = recorder();
        drawMarineSnow(snow.ctx, w, h, worldY, depth, TIME.animTime, fx);
        expect(named(snow.calls, "arc")).toHaveLength(count);
        expect(added.slice(0, snow.calls.length)).toEqual(snow.calls);

        // The vignette closes the layer: its fill is the layer's last painting call.
        const tail = added.slice(snow.calls.length).filter((c) => c[0] !== "addColorStop");
        expect(tail.map((c) => c[0])).toEqual([
          "createRadialGradient",
          "save",
          "translate",
          "scale",
          "set globalAlpha",
          "set fillStyle",
          "fillRect",
          "restore",
        ]);
        expect(tail[4]).toEqual(["set globalAlpha", depthVignetteIntensity(depth)]);
        // Everything V2 adds is wrapped: saves and restores balance.
        expect(named(added, "save")).toHaveLength(named(added, "restore").length);
      }
    }
  });

  it("without an FX argument falls back to the renderer defaults (High, full motion)", () => {
    expect(DEFAULT_FX_SETTINGS).toEqual({ reducedMotion: false, quality: "high" });
    expect(Object.isFrozen(DEFAULT_FX_SETTINGS)).toBe(true);
    const implicit = recorder();
    environmentLayer.render(implicit.ctx, stateAt(0.5), cameraFor(390, 844, 2100), TIME);
    const explicit = recorder();
    environmentLayer.render(explicit.ctx, stateAt(0.5), cameraFor(390, 844, 2100), TIME, HIGH);
    expect(normalise(implicit.calls)).toEqual(normalise(explicit.calls));
  });

  it("creates the vignette gradient once across many frames on one context", () => {
    const r = recorder();
    for (let f = 0; f < 120; f++) {
      const depth = f / 120;
      environmentLayer.render(
        r.ctx,
        stateAt(depth),
        cameraFor(390, 844, depth * 4200),
        { animTime: f / 60, frameDt: 1 / 60 },
        HIGH,
      );
    }
    expect(named(r.calls, "createRadialGradient")).toHaveLength(1);
  });
});
