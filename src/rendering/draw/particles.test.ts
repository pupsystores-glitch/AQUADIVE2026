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
// V3 — F3 anchor wake, F4 release splash and the Effects layer.
import { SHIP_WORLD_Y } from "@/shared/world";
import { SHIP_CHAIN_ATTACH_DY, SHIP_IMPACT_FX_SECONDS } from "../constants";
import { anchorPose } from "../layers/actor";
import { effectsLayer } from "../layers/effects";
import { launchProgress, presentationOffsetY } from "../layers/presentation";
import { WAKE_FX_THEME } from "../theme";
import { drawShipImpact } from "./impact-fx";
import {
  ANCHOR_WAKE_ALPHA_MAX,
  ANCHOR_WAKE_ALPHA_MIN,
  ANCHOR_WAKE_GAP,
  ANCHOR_WAKE_GROWTH,
  ANCHOR_WAKE_LIFE,
  ANCHOR_WAKE_MAX,
  ANCHOR_WAKE_MAX_LOW,
  ANCHOR_WAKE_RADIUS_MAX,
  ANCHOR_WAKE_RADIUS_MIN,
  ANCHOR_WAKE_SIDE_MAX,
  ANCHOR_WAKE_SIDE_MIN,
  ANCHOR_WAKE_SPACING,
  ANCHOR_WAKE_WOBBLE,
  BUBBLE_STRIDE,
  RELEASE_BUBBLE_ALPHA_MAX,
  RELEASE_BUBBLE_RADIUS_MAX,
  RELEASE_BUBBLE_RADIUS_MIN,
  RELEASE_RING_ALPHA,
  RELEASE_RING_COUNT,
  RELEASE_RING_FLATNESS,
  RELEASE_RING_RX_END,
  RELEASE_RING_STRIDE,
  RELEASE_RING_UPPER,
  RELEASE_SPLASH_DEPTH,
  RELEASE_SPLASH_MAX,
  RELEASE_SPLASH_MAX_LOW,
  anchorWakeBubbles,
  anchorWakeCount,
  anchorWakeLaunchFade,
  anchorWakeLifeFade,
  drawAnchorWake,
  drawReleaseSplash,
  layoutAnchorWake,
  layoutReleaseSplash,
  releaseSplashBubbles,
  releaseSplashProgress,
  releaseSplashRings,
  shipWaterlineY,
  waterSurfaceAt,
} from "./particles";
import { WATERLINE, drawShip, shipScale } from "./ship";

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

// ===== V3 — F3 anchor wake, F4 release splash (owner decisions Q10/V3) =====

interface Bubble {
  x: number;
  y: number;
  r: number;
  a: number;
}

function readBubbles(buffer: Float32Array, n: number): Bubble[] {
  const out: Bubble[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * BUBBLE_STRIDE;
    out.push({ x: buffer[o], y: buffer[o + 1], r: buffer[o + 2], a: buffer[o + 3] });
  }
  return out;
}

/** A deep, fully launched chain on a tall viewport, so no bubble is culled by an edge. */
const DEEP = { sx: 195, sy: -300, ex: 205, ey: 1000, h: 2000 };

function wake(worldY: number, fx: FxSettings, launch = 1, surface = -Infinity): Bubble[] {
  const n = layoutAnchorWake(
    worldY,
    DEEP.sx,
    DEEP.sy,
    DEEP.ex,
    DEEP.ey,
    launch,
    surface,
    DEEP.h,
    fx,
  );
  return readBubbles(anchorWakeBubbles(), n);
}

/** The chain line's x at screen height y (DEEP geometry). */
const chainLineX = (y: number) => {
  const u = Math.min(1, Math.max(0, (y - DEEP.ey) / (DEEP.sy - DEEP.ey)));
  return DEEP.ex + (DEEP.sx - DEEP.ex) * u;
};

/** The camera exactly as SceneRenderer sets it up for a frame at `worldY`. */
function diveCamera(w: number, h: number, worldY: number): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  camera.setPresentationOffset(presentationOffsetY(worldY, w, h));
  return camera;
}

function diveState(
  worldY: number,
  phase: RenderState["phase"] = "diving",
  shipImpact: RenderState["shipImpact"] = null,
): RenderState {
  return {
    phase,
    worldY,
    depthRatio: Math.min(1, worldY / 4200),
    boost: 0,
    creatures: [],
    crashed: phase === "crashed",
    shipImpact,
  };
}

/** The release-splash geometry the Effects layer hands over for a frame. */
function splashGeometry(w: number, h: number, worldY: number, t: number) {
  const camera = diveCamera(w, h, worldY);
  const p = anchorPose(worldY, camera, t);
  const k = shipScale(w);
  const shipY = camera.worldToScreenY(SHIP_WORLD_Y);
  return {
    holeX: p.chainStartX,
    holeY: p.chainStartY,
    cx: w / 2,
    shipY,
    k,
    waterline: shipWaterlineY(shipY, SHIP_CHAIN_ATTACH_DY, k),
  };
}

function splash(w: number, h: number, worldY: number, t: number, fx: FxSettings) {
  const g = splashGeometry(w, h, worldY, t);
  const n = layoutReleaseSplash(worldY, g.holeX, g.holeY, g.cx, g.waterline, t, g.k, fx);
  const ringBuffer = releaseSplashRings();
  const rings: Array<{ x: number; y: number; rx: number; ry: number; a: number }> = [];
  for (let i = 0; i < RELEASE_RING_COUNT; i++) {
    const o = i * RELEASE_RING_STRIDE;
    if (ringBuffer[o + 4] > 0) {
      rings.push({
        x: ringBuffer[o],
        y: ringBuffer[o + 1],
        rx: ringBuffer[o + 2],
        ry: ringBuffer[o + 3],
        a: ringBuffer[o + 4],
      });
    }
  }
  return { g, bubbles: readBubbles(releaseSplashBubbles(), n), rings };
}

/** Initial descent speed, px/s: the engine's descentSpeed(1) = 120 + 28 (src/engine/domain/descent.ts). */
const INITIAL_DESCENT_SPEED = 148;
/** Fastest descent, px/s: (120 + 520) × (1 + 0.8 boost). */
const MAX_DESCENT_SPEED = 1152;

describe("anchor wake (F3)", () => {
  it("caps the trail at 16 bubbles on High and 8 on Low, at every depth", () => {
    expect([ANCHOR_WAKE_MAX, ANCHOR_WAKE_MAX_LOW]).toEqual([16, 8]);
    expect(ANCHOR_WAKE_SPACING).toBe(20);
    expect(anchorWakeCount(HIGH)).toBe(16);
    expect(anchorWakeCount(LOW)).toBe(8);
    let maxHigh = 0;
    let maxLow = 0;
    for (let worldY = 0.25; worldY < 4300; worldY += 0.75) {
      const high = wake(worldY, HIGH).length;
      const low = wake(worldY, LOW).length;
      expect(high).toBeLessThanOrEqual(16);
      expect(low).toBeLessThanOrEqual(8);
      maxHigh = Math.max(maxHigh, high);
      maxLow = Math.max(maxLow, low);
    }
    // The cap is actually used: the trail is full apart from a bubble at the very end of its fade.
    expect(maxHigh).toBeGreaterThanOrEqual(15);
    expect(maxLow).toBeGreaterThanOrEqual(7);
  });

  it("is deterministic and depth-driven: no randomness, the same inputs give the same trail", () => {
    const random = vi.spyOn(Math, "random");
    const a = wake(1234.5, HIGH);
    wake(77, LOW);
    wake(3999, HIGH, 0.7, 400);
    expect(wake(1234.5, HIGH)).toEqual(a);
    expect(random).not.toHaveBeenCalled();
  });

  it("keeps sizes within 0.9–2.2 px and alpha within 0.28–0.42 before the lifetime fade", () => {
    expect([ANCHOR_WAKE_RADIUS_MIN, ANCHOR_WAKE_ALPHA_MIN, ANCHOR_WAKE_ALPHA_MAX]).toEqual([
      0.9, 0.28, 0.42,
    ]);
    expect(ANCHOR_WAKE_RADIUS_MAX * (1 + ANCHOR_WAKE_GROWTH)).toBeLessThanOrEqual(2.2);
    for (let worldY = 150; worldY < 2000; worldY += 7.3) {
      for (const b of wake(worldY, HIGH)) {
        expect(b.r).toBeGreaterThanOrEqual(0.9 - 1e-6);
        expect(b.r).toBeLessThanOrEqual(2.2 + 1e-6);
        expect(b.a).toBeGreaterThan(0);
        expect(b.a).toBeLessThanOrEqual(0.42 + 1e-6);
      }
    }
    // The lifetime envelope never amplifies; it is 0 outside the life.
    for (let life = -0.1; life <= 1.1; life += 0.01) {
      expect(anchorWakeLifeFade(life)).toBeGreaterThanOrEqual(0);
      expect(anchorWakeLifeFade(life)).toBeLessThanOrEqual(1);
    }
    expect(anchorWakeLifeFade(0)).toBe(0);
    expect(anchorWakeLifeFade(1)).toBe(0);
  });

  it("follows the chain above the ring and never covers the anchor", () => {
    for (let worldY = 150; worldY < 4200; worldY += 13.7) {
      for (const b of wake(worldY, HIGH)) {
        expect(b.y).toBeLessThanOrEqual(DEEP.ey - ANCHOR_WAKE_GAP + 1e-3);
        const off = Math.abs(b.x - chainLineX(b.y));
        expect(off).toBeLessThanOrEqual(ANCHOR_WAKE_SIDE_MAX + ANCHOR_WAKE_WOBBLE + 1e-3);
        expect(off).toBeGreaterThanOrEqual(ANCHOR_WAKE_SIDE_MIN - ANCHOR_WAKE_WOBBLE - 1e-3);
      }
    }
    // The trail spans a few hundred px above the ring, not the whole screen.
    const ys = wake(2010, HIGH).map((b) => b.y);
    expect(DEEP.ey - Math.min(...ys)).toBeLessThan(ANCHOR_WAKE_LIFE * 1.5);
    expect(DEEP.ey - Math.min(...ys)).toBeGreaterThan(ANCHOR_WAKE_LIFE);
  });

  it("Low draws every other bubble of the same trail", () => {
    for (const worldY of [300, 1234.5, 2999.9]) {
      const high = wake(worldY, HIGH).map((b) => JSON.stringify(b));
      for (const b of wake(worldY, LOW)) expect(high).toContain(JSON.stringify(b));
    }
  });

  it("fades in over launchProgress 0.5 → 1 and is absent before", () => {
    expect(anchorWakeLaunchFade(0)).toBe(0);
    expect(anchorWakeLaunchFade(0.5)).toBe(0);
    expect(anchorWakeLaunchFade(0.75)).toBeCloseTo(0.5, 12);
    expect(anchorWakeLaunchFade(1)).toBe(1);
    for (let l = 0.5; l < 1; l += 0.01) {
      expect(anchorWakeLaunchFade(l + 0.01)).toBeGreaterThanOrEqual(anchorWakeLaunchFade(l));
    }
    expect(wake(1000, HIGH, 0.5)).toEqual([]);
    expect(wake(1000, HIGH, 0.3)).toEqual([]);
    const half = wake(1000, HIGH, 0.75);
    const full = wake(1000, HIGH, 1);
    expect(half.length).toBeGreaterThan(0);
    for (let i = 0; i < half.length; i++) expect(half[i].a).toBeCloseTo(full[i].a * 0.5, 6);
  });

  it("is never drawn at or above the water surface while the ship is in view", () => {
    const surface = 700;
    for (let worldY = 200; worldY < 800; worldY += 3.1) {
      for (const b of wake(worldY, HIGH, 1, surface)) expect(b.y).toBeGreaterThan(surface + 2);
    }
  });

  it("is hidden under reduced motion, at the surface and for invalid input", () => {
    for (const worldY of [0, 150, 1000, 4000]) {
      expect(wake(worldY, HIGH_REDUCED)).toEqual([]);
      expect(wake(worldY, LOW_REDUCED)).toEqual([]);
    }
    expect(wake(0, HIGH)).toEqual([]);
    expect(wake(-20, HIGH)).toEqual([]);
    expect(wake(Number.NaN, HIGH)).toEqual([]);
    expect(layoutAnchorWake(1000, 0, -300, 0, 400, 1, -Infinity, 0, HIGH)).toBe(0);
  });

  it("does not strobe at high descent speed: no pop at birth, no frozen or regular grid", () => {
    // Birth: a bubble's first frame carries almost no alpha even at the full-speed step.
    const fullStep = MAX_DESCENT_SPEED / 60;
    expect(fullStep).toBeLessThan(ANCHOR_WAKE_SPACING);
    expect(
      ANCHOR_WAKE_ALPHA_MAX * anchorWakeLifeFade(ANCHOR_WAKE_SPACING / ANCHOR_WAKE_LIFE),
    ).toBeLessThan(0.1);
    // Death: the last frame of a life is invisible.
    expect(
      ANCHOR_WAKE_ALPHA_MAX * anchorWakeLifeFade(1 - ANCHOR_WAKE_SPACING / ANCHOR_WAKE_LIFE),
    ).toBeLessThan(0.01);

    for (const step of [INITIAL_DESCENT_SPEED / 60, 10, fullStep, ANCHOR_WAKE_SPACING]) {
      let prevMass = -1;
      for (let f = 0; f < 240; f++) {
        const worldY = 1000 + f * step;
        const bubbles = wake(worldY, HIGH);
        // Whatever is near the ring (born within the last step) is still nearly transparent.
        for (const b of bubbles) {
          if (b.y > DEEP.ey - ANCHOR_WAKE_GAP - step * 1.45) expect(b.a).toBeLessThan(0.1);
        }
        // Total visual weight changes smoothly from frame to frame: no bubble pops in or out.
        const mass = bubbles.reduce((s, b) => s + b.a * b.r * b.r, 0);
        if (prevMass >= 0)
          expect(Math.abs(mass - prevMass)).toBeLessThan(0.35 * Math.max(mass, prevMass));
        prevMass = mass;
      }
    }

    // At a step equal to the spacing a rigid grid would look frozen; this trail does not.
    const a = wake(2000, HIGH)
      .map((b) => b.y)
      .sort((p, q) => p - q);
    const b = wake(2000 + ANCHOR_WAKE_SPACING, HIGH)
      .map((v) => v.y)
      .sort((p, q) => p - q);
    const n = Math.min(a.length, b.length);
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff / n).toBeGreaterThan(2);
    // Irregular spacing along the trail (per-bubble rise).
    const gaps: number[] = [];
    for (let i = 1; i < a.length; i++) gaps.push(a[i] - a[i - 1]);
    expect(Math.max(...gaps) / Math.max(1e-6, Math.min(...gaps))).toBeGreaterThan(1.3);
  });

  it("writes into one reused buffer and draws with constant styles", () => {
    const buffer = anchorWakeBubbles();
    wake(500, HIGH);
    wake(3000, LOW);
    expect(anchorWakeBubbles()).toBe(buffer);
    expect(buffer).toHaveLength(ANCHOR_WAKE_MAX * BUBBLE_STRIDE);

    const r = recorder();
    drawAnchorWake(r.ctx, 2010, DEEP.sx, DEEP.sy, DEEP.ex, DEEP.ey, 1, -Infinity, DEEP.h, HIGH);
    const n = wake(2010, HIGH).length;
    expect(r.calls[0]).toEqual(["save"]);
    expect(r.calls[r.calls.length - 1]).toEqual(["restore"]);
    expect(named(r.calls, "arc")).toHaveLength(n);
    expect(named(r.calls, "set fillStyle")).toEqual([["set fillStyle", WAKE_FX_THEME.bubble]]);
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

    const none = recorder();
    drawAnchorWake(
      none.ctx,
      2010,
      DEEP.sx,
      DEEP.sy,
      DEEP.ex,
      DEEP.ey,
      1,
      -Infinity,
      DEEP.h,
      HIGH_REDUCED,
    );
    expect(none.calls).toEqual([]);
  });
});

describe("release splash (F4)", () => {
  const T = 4.2;

  it("plays over the first 120 world px — about 0.8 s at the initial descent speed", () => {
    expect(RELEASE_SPLASH_DEPTH).toBe(120);
    const seconds = RELEASE_SPLASH_DEPTH / INITIAL_DESCENT_SPEED;
    expect(seconds).toBeGreaterThan(0.75);
    expect(seconds).toBeLessThan(0.85);
    expect(releaseSplashProgress(60)).toBe(0.5);
    for (const worldY of [0, -1, 120, 121, 4000, Number.NaN]) {
      expect(releaseSplashProgress(worldY)).toBe(0);
    }
  });

  it("is exactly absent at worldY 0, from 120 on and under reduced motion", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [0, 120, 500]) {
        for (const fx of [HIGH, LOW]) {
          const s = splash(w, h, worldY, T, fx);
          expect(s.bubbles).toEqual([]);
          expect(s.rings).toEqual([]);
          const g = s.g;
          const r = recorder();
          drawReleaseSplash(r.ctx, worldY, g.holeX, g.holeY, g.cx, g.waterline, T, g.k, fx);
          expect(r.calls).toEqual([]);
        }
      }
      for (const fx of [HIGH_REDUCED, LOW_REDUCED]) {
        const g = splashGeometry(w, h, 60, T);
        const r = recorder();
        drawReleaseSplash(r.ctx, 60, g.holeX, g.holeY, g.cx, g.waterline, T, g.k, fx);
        expect(r.calls).toEqual([]);
      }
    }
  });

  it("caps the bubbles at 8 on High and 4 on Low; Low is a subset of High", () => {
    expect([RELEASE_SPLASH_MAX, RELEASE_SPLASH_MAX_LOW]).toEqual([8, 4]);
    for (const [w, h] of VIEWPORTS) {
      let seen = 0;
      for (let worldY = 0.5; worldY < 120; worldY += 0.5) {
        const high = splash(w, h, worldY, T, HIGH).bubbles;
        const low = splash(w, h, worldY, T, LOW).bubbles;
        expect(high.length).toBeLessThanOrEqual(8);
        expect(low.length).toBeLessThanOrEqual(4);
        const highKeys = high.map((b) => JSON.stringify(b));
        for (const b of low) expect(highKeys).toContain(JSON.stringify(b));
        seen = Math.max(seen, high.length);
      }
      expect(seen).toBeGreaterThan(0);
    }
  });

  it("keeps every bubble under the water surface, small and faint", () => {
    for (const [w, h] of VIEWPORTS) {
      for (let worldY = 0.5; worldY < 120; worldY += 1.5) {
        for (const t of [0, 1.3, 9.9]) {
          const { g, bubbles } = splash(w, h, worldY, t, HIGH);
          for (const b of bubbles) {
            expect(b.y - b.r).toBeGreaterThan(waterSurfaceAt(g.cx, g.waterline, t, b.x));
            expect(b.r).toBeGreaterThanOrEqual(RELEASE_BUBBLE_RADIUS_MIN - 1e-6);
            expect(b.r).toBeLessThanOrEqual(RELEASE_BUBBLE_RADIUS_MAX + 1e-6);
            expect(b.a).toBeGreaterThan(0);
            expect(b.a).toBeLessThanOrEqual(RELEASE_BUBBLE_ALPHA_MAX + 1e-6);
            // They stay at the hole: never further from it than the largest ring.
            expect(Math.abs(b.x - g.holeX)).toBeLessThan(RELEASE_RING_RX_END[1] * g.k);
          }
        }
      }
    }
  });

  it("draws two rings on the ship's drawn waterline above the hawse hole, at every viewport", () => {
    const points = (calls: Call[]) => {
      // drawShip strokes the surface polyline last: beginPath, moveTo, lineTo…, stroke.
      const end = calls.map((c) => c[0]).lastIndexOf("stroke");
      const start = calls
        .slice(0, end)
        .map((c) => c[0])
        .lastIndexOf("beginPath");
      return calls.slice(start + 1, end).map((c) => [c[1] as number, c[2] as number]);
    };
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [10, 45, 90]) {
        for (const t of [0, 2.5, 13.1]) {
          const { g, rings } = splash(w, h, worldY, t, HIGH);
          expect(rings.length).toBeGreaterThan(0);
          expect(rings.length).toBeLessThanOrEqual(2);
          const ship = recorder();
          const motion = 1 - launchProgress(worldY, w, h);
          drawShip(ship.ctx, g.cx, g.shipY, t, w, SHIP_CHAIN_ATTACH_DY, motion);
          const line = points(ship.calls);
          const i = line.findIndex((p, j) => j > 0 && p[0] >= g.holeX);
          const [x0, y0] = line[i - 1];
          const [x1, y1] = line[i];
          const drawnY = y0 + ((y1 - y0) * (g.holeX - x0)) / (x1 - x0);
          for (const ring of rings) {
            expect(ring.x).toBe(Math.fround(g.holeX));
            expect(ring.y).toBeCloseTo(drawnY, 3);
          }
        }
      }
    }
  });

  it("scales the rings with the ship and keeps them flat and faint", () => {
    expect(WATERLINE).toBe(20);
    for (const [w, h] of VIEWPORTS) {
      const k = shipScale(w);
      for (let worldY = 0.5; worldY < 120; worldY += 0.5) {
        for (const ring of splash(w, h, worldY, T, HIGH).rings) {
          expect(ring.rx).toBeLessThanOrEqual(RELEASE_RING_RX_END[1] * k + 1e-3);
          expect(ring.ry).toBeCloseTo(ring.rx * RELEASE_RING_FLATNESS, 4);
          expect(ring.a).toBeLessThanOrEqual(Math.max(...RELEASE_RING_ALPHA) + 1e-6);
        }
      }
    }
    // Same progress, smaller ship → proportionally smaller rings.
    const big = splash(1920, 1080, 60, T, HIGH).rings;
    const small = splash(375, 667, 60, T, HIGH).rings;
    expect(small).toHaveLength(big.length);
    const ratio = shipScale(375) / shipScale(1920);
    expect(ratio).toBeLessThan(1);
    for (let i = 0; i < big.length; i++) expect(small[i].rx / big[i].rx).toBeCloseTo(ratio, 4);
  });

  it("strokes each ring's lower half at the ring alpha and its upper half at 0.45 of it", () => {
    const g = splashGeometry(390, 844, 50, T);
    const s = splash(390, 844, 50, T, HIGH);
    expect(s.rings).toHaveLength(2);
    const r = recorder();
    drawReleaseSplash(r.ctx, 50, g.holeX, g.holeY, g.cx, g.waterline, T, g.k, HIGH);
    expect(named(r.calls, "set strokeStyle")).toEqual([["set strokeStyle", WAKE_FX_THEME.ripple]]);
    const ellipses = named(r.calls, "ellipse");
    expect(ellipses).toHaveLength(4);
    const alphas = named(r.calls, "set globalAlpha").map((c) => c[1] as number);
    for (let i = 0; i < 2; i++) {
      expect(ellipses[2 * i].slice(6)).toEqual([0, Math.PI]);
      expect(ellipses[2 * i + 1].slice(6)).toEqual([Math.PI, Math.PI * 2]);
      expect(alphas[2 * i]).toBeCloseTo(s.rings[i].a, 6);
      expect(alphas[2 * i + 1]).toBeCloseTo(s.rings[i].a * RELEASE_RING_UPPER, 6);
    }
    expect(named(r.calls, "save")).toHaveLength(named(r.calls, "restore").length);
    expect(releaseSplashRings()).toHaveLength(RELEASE_RING_COUNT * RELEASE_RING_STRIDE);
    expect(releaseSplashBubbles()).toHaveLength(RELEASE_SPLASH_MAX * BUBBLE_STRIDE);
  });
});

describe("Effects layer with V3", () => {
  const TIME = { animTime: 7.77, frameDt: 1 / 60 };

  it("draws nothing new before the dive: the pre-dive surface is unchanged", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const fx of [HIGH, LOW, HIGH_REDUCED, undefined]) {
        for (const state of [diveState(0, "idle"), diveState(0, "diving")]) {
          const r = recorder();
          effectsLayer.render(r.ctx, state, diveCamera(w, h, 0), TIME, fx);
          expect(r.calls).toEqual([]);
        }
      }
    }
  });

  it("vanishes at once on crash, cashout and bonus, and under reduced motion", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [40, 300, 2500]) {
        for (const phase of ["crashed", "cashed", "bonus", "idle"] as const) {
          const r = recorder();
          effectsLayer.render(
            r.ctx,
            diveState(worldY, phase),
            diveCamera(w, h, worldY),
            TIME,
            HIGH,
          );
          expect(r.calls).toEqual([]);
        }
        for (const fx of [HIGH_REDUCED, LOW_REDUCED]) {
          const r = recorder();
          effectsLayer.render(r.ctx, diveState(worldY), diveCamera(w, h, worldY), TIME, fx);
          expect(r.calls).toEqual([]);
        }
      }
    }
  });

  it("while diving draws the release splash at the start and the wake once launched", () => {
    for (const [w, h] of VIEWPORTS) {
      // Release: rings centred on the chain's top (the hawse hole).
      const early = recorder();
      effectsLayer.render(early.ctx, diveState(50), diveCamera(w, h, 50), TIME, HIGH);
      const hole = anchorPose(50, diveCamera(w, h, 50), TIME.animTime).chainStartX;
      const ellipses = named(early.calls, "ellipse");
      expect(ellipses.length).toBeGreaterThan(0);
      for (const e of ellipses) expect(e[1]).toBe(Math.fround(hole));

      // Deep: the wake only — bubbles above the ring, within the cap.
      for (const [fx, cap] of [
        [HIGH, 16],
        [LOW, 8],
      ] as const) {
        const camera = diveCamera(w, h, 2000);
        const r = recorder();
        effectsLayer.render(r.ctx, diveState(2000), camera, TIME, fx);
        const end = anchorPose(2000, camera, TIME.animTime).chainEndY;
        const arcs = named(r.calls, "arc");
        expect(arcs.length).toBeGreaterThan(0);
        expect(arcs.length).toBeLessThanOrEqual(cap);
        for (const a of arcs)
          expect(a[2] as number).toBeLessThanOrEqual(end - ANCHOR_WAKE_GAP + 1e-3);
        expect(named(r.calls, "ellipse")).toEqual([]);
        expect(named(r.calls, "save")).toHaveLength(named(r.calls, "restore").length);
      }
    }
  });

  it("without an FX argument falls back to the renderer defaults", () => {
    const implicit = recorder();
    effectsLayer.render(implicit.ctx, diveState(1500), diveCamera(390, 844, 1500), TIME);
    const explicit = recorder();
    effectsLayer.render(explicit.ctx, diveState(1500), diveCamera(390, 844, 1500), TIME, HIGH);
    expect(implicit.calls).toEqual(explicit.calls);
  });

  it("leaves the jackpot impact burst exactly as before", () => {
    let seed = 0;
    const random = vi.spyOn(Math, "random").mockImplementation(() => (seed++ * 0.6180339887) % 1);
    for (const [w, h] of VIEWPORTS) {
      for (const elapsed of [0, 0.4, 1.2, SHIP_IMPACT_FX_SECONDS]) {
        for (const phase of ["bonus", "cashed", "diving"] as const) {
          const worldY = 4200;
          const state = diveState(worldY, phase, { elapsed });
          const camera = diveCamera(w, h, worldY);
          seed = 0;
          const now = recorder();
          effectsLayer.render(now.ctx, state, camera, TIME, HIGH);
          seed = 0;
          const before = recorder();
          if (elapsed < SHIP_IMPACT_FX_SECONDS) {
            const p = anchorPose(worldY, camera, TIME.animTime, Math.max(0, elapsed));
            const life = Math.min(1, elapsed / SHIP_IMPACT_FX_SECONDS);
            drawShipImpact(before.ctx, p.x, p.y, w, h, elapsed, life);
          }
          expect(normalise(now.calls)).toEqual(normalise(before.calls));
        }
      }
    }
    expect(random).toHaveBeenCalled();
  });
});
