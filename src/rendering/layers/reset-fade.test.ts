// V6 — F7 round-reset fade (owner authorization F7, 2026-11-18; docs/08 §4.3).
// These tests pin: the FX queue as the only reset clock (SceneRenderer
// forwards the queue's own entry object through FxSettings.reset, no copy and
// no second clock); the envelope (0.14 on the first reset frame, a smooth
// quadratic ease-out to exactly 0 at 0.40 s, no fade-in, no second dip); one
// solid translucent fill over the whole canvas, drawn last; no effect on the
// initial load, on ordinary frames, while diving, crashed, cashed or on the
// jackpot; High and Low identical; reduced motion drawing nothing; a backwards
// clock and a remount dropping the entry; repeated rounds not accumulating;
// every V1–V5 draw call unchanged; and the RenderState left untouched.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAIN_MAX_DEPTH } from "@/shared/world";
import { Camera } from "../camera";
import { FX_LIFETIME_SECONDS } from "../fx-queue";
import type { FxSettings, RenderState } from "../render-state";
import { SceneRenderer } from "../scene-renderer";
import {
  effectsLayer,
  RESET_FADE_COLOR,
  RESET_FADE_LIFE,
  RESET_FADE_MAX_ALPHA,
  resetFadeAlpha,
} from "./effects";

// ----- Helpers -----

type Call = [string, ...unknown[]];

/** A 2D context stand-in that records every method call and property write, in order. */
function recorder() {
  const calls: Call[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "canvas") return undefined;
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...args: number[]) => {
          calls.push([prop, ...args]);
          return { addColorStop: (p: number, c: string) => calls.push(["addColorStop", p, c]) };
        };
      }
      if (prop === "measureText") return () => ({ width: 0 });
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
      };
    },
    set(_t, prop: string, value: unknown) {
      calls.push([`set ${prop}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

/** A frame's calls as one string (gradients become their recorded stops): cheap to compare. */
const serial = (calls: Call[]) => JSON.stringify(calls);

const VIEWPORTS: Array<[number, number]> = [
  [375, 667],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

const HIGH: FxSettings = { reducedMotion: false, quality: "high" };
const LOW: FxSettings = { reducedMotion: false, quality: "low" };

function state(
  phase: RenderState["phase"],
  worldY: number,
  extra: Partial<RenderState> = {},
): RenderState {
  return {
    phase,
    worldY,
    depthRatio: Math.min(1, worldY / CHAIN_MAX_DEPTH),
    boost: 0,
    creatures: [],
    crashed: phase === "crashed",
    shipImpact: null,
    ...extra,
  };
}

/** A frame step that is exact in binary, so frame counts at the 0.40 s boundary are exact. */
const STEP = 1 / 64;
/** Frames one reset fade lasts at STEP: elapsed 0, STEP, … while elapsed < 0.40 s. */
const FADE_FRAMES = Math.ceil(0.4 / STEP);

/** The betting view: the engine still reports the previous round's depth. */
const betting = (worldY = 2400) => state("idle", worldY);

/** The exact F7 sequence for one frame at `alpha`. */
const fadeCalls = (alpha: number, w: number, h: number): Call[] => [
  ["save"],
  ["set globalAlpha", alpha],
  ["set fillStyle", RESET_FADE_COLOR],
  ["fillRect", 0, 0, w, h],
  ["restore"],
];

/** The F7 fills in a call list: their alphas, in order. */
function fades(calls: Call[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === "set fillStyle" && calls[i][1] === RESET_FADE_COLOR) {
      const a = calls[i - 1];
      out.push(a && a[0] === "set globalAlpha" ? (a[1] as number) : NaN);
    }
  }
  return out;
}

/** A real SceneRenderer (real layers) drawing into a recorder. */
function sceneRenderer(w = 390, h = 844, fx: FxSettings = HIGH) {
  const rec = recorder();
  const canvas = { width: 0, height: 0, getContext: () => rec.ctx } as unknown as HTMLCanvasElement;
  const r = new SceneRenderer(canvas);
  r.resize(w, h, 1);
  r.setMotion({ reducedMotion: fx.reducedMotion });
  r.setQuality(fx.quality);
  const frame = (s: RenderState, animTime: number): Call[] => {
    const from = rec.calls.length;
    r.frame(s, { animTime, frameDt: 1 / 60 });
    return rec.calls.slice(from);
  };
  return { r, rec, frame };
}

// The jackpot burst may use Math.random (docs/05 §12): seed it per test so two
// renderers given the same inputs draw the same calls.
let seed = 1;
beforeEach(() => {
  seed = 1;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ----- 1. Envelope -----

describe("F7 envelope", () => {
  it("starts at the maximum opacity and ends at exactly 0 at the lifetime", () => {
    expect(RESET_FADE_MAX_ALPHA).toBe(0.14);
    expect(RESET_FADE_LIFE).toBe(0.4);
    expect(RESET_FADE_LIFE).toBe(FX_LIFETIME_SECONDS.reset);
    expect(resetFadeAlpha(0)).toBe(0.14);
    expect(resetFadeAlpha(0.4)).toBe(0);
    expect(resetFadeAlpha(1)).toBe(0);
    expect(resetFadeAlpha(-0.01)).toBe(0);
    expect(resetFadeAlpha(NaN)).toBe(0);
  });

  it("is a quadratic ease-out: 0.14 · (1 − t/0.4)²", () => {
    expect(resetFadeAlpha(0.1)).toBeCloseTo(0.14 * 0.5625, 12);
    expect(resetFadeAlpha(0.2)).toBeCloseTo(0.14 * 0.25, 12);
    expect(resetFadeAlpha(0.3)).toBeCloseTo(0.14 * 0.0625, 12);
  });

  it("only decreases, with no step after the first frame and a flat landing at 0", () => {
    let prev = resetFadeAlpha(0);
    let maxStep = 0;
    for (let i = 1; i <= 400; i++) {
      const a = resetFadeAlpha(i / 1000);
      expect(a).toBeLessThanOrEqual(prev);
      maxStep = Math.max(maxStep, prev - a);
      prev = a;
    }
    // Steepest at the start: 2·0.14/0.4 per second → 0.0007 per ms.
    expect(maxStep).toBeLessThanOrEqual(0.0007 + 1e-12);
    // At 60 fps the last frames before 0.40 s are already invisible.
    expect(resetFadeAlpha(0.4 - 1 / 60)).toBeLessThan(0.0003);
  });
});

// ----- 2. Queue timing through FxSettings -----

describe("F7 timing: the FX queue's reset entry, forwarded through FxSettings", () => {
  it("forwards the queue's own entry object (no copy, no second clock)", () => {
    const seen: unknown[] = [];
    const spy = vi.spyOn(effectsLayer, "render").mockImplementation((_c, _s, _cam, _t, fx) => {
      seen.push(fx?.reset ?? null);
    });
    const { r, frame } = sceneRenderer();
    frame(betting(), 5);
    expect(seen[0]).toBeNull();
    r.trigger("reset");
    for (const t of [6, 6.1, 6.25]) {
      frame(betting(), t);
      const entry = r.activeFx("reset");
      expect(entry).not.toBeNull();
      expect(seen[seen.length - 1]).toBe(entry); // the same object the queue keeps
      expect(entry?.startedAt).toBe(6);
      expect(entry?.elapsed).toBeCloseTo(t - 6, 12);
    }
    expect(new Set(seen.slice(1)).size).toBe(1); // reused across frames
    frame(betting(), 6.4);
    expect(seen[seen.length - 1]).toBeNull();
    expect(r.activeFx("reset")).toBeNull();
    spy.mockRestore();
  });

  it("the settings object every layer receives carries reset: null by default", () => {
    const seen: FxSettings[] = [];
    const spy = vi.spyOn(effectsLayer, "render").mockImplementation((_c, _s, _cam, _t, fx) => {
      if (fx) seen.push(fx);
    });
    const { r, frame } = sceneRenderer();
    frame(betting(), 1);
    expect(seen[0]).toEqual({ reducedMotion: false, quality: "high", reset: null });
    expect(r.fxSettings()).toEqual({ reducedMotion: false, quality: "high", shakeOffset: 0 });
    spy.mockRestore();
  });

  it("draws 0.14 on the first reset frame, then the envelope, then nothing", () => {
    const { r, frame } = sceneRenderer();
    expect(fades(frame(betting(), 9.9))).toEqual([]); // initial load: no trigger, no fade
    r.trigger("reset");
    const first = frame(betting(), 10);
    expect(fades(first)).toEqual([0.14]);
    for (const dt of [0.1, 0.2, 0.3, 0.39]) {
      const f = fades(frame(betting(), 10 + dt));
      expect(f).toHaveLength(1);
      expect(f[0]).toBeCloseTo(resetFadeAlpha(dt), 12);
    }
    expect(fades(frame(betting(), 10.4))).toEqual([]);
    expect(fades(frame(betting(), 10.5))).toEqual([]);
    expect(fades(frame(betting(), 12))).toEqual([]);
  });

  it("covers the whole canvas with one fill, drawn last, at all seven sizes", () => {
    for (const [w, h] of VIEWPORTS) {
      const { r, frame } = sceneRenderer(w, h);
      frame(betting(), 1);
      r.trigger("reset");
      const calls = frame(betting(), 2);
      expect(calls.slice(-5)).toEqual(fadeCalls(0.14, w, h));
      expect(fades(calls)).toHaveLength(1);
    }
  });

  it("never re-triggers on ordinary frames, and one trigger draws one fade", () => {
    const { r, frame } = sceneRenderer();
    r.trigger("reset");
    let frames = 0;
    for (let t = 3; t < 8; t += STEP) if (fades(frame(betting(), t)).length > 0) frames++;
    expect(frames).toBe(FADE_FRAMES); // one 0.40 s run
  });

  it("a backwards clock drops the entry: no stale fade", () => {
    const { r, frame } = sceneRenderer();
    r.trigger("reset");
    expect(fades(frame(betting(), 20))).toEqual([0.14]);
    expect(fades(frame(betting(), 19.5))).toEqual([]);
    expect(r.activeFx("reset")).toBeNull();
    expect(fades(frame(betting(), 20.1))).toEqual([]);
  });

  it("a remount starts with no reset entry, even mid-fade", () => {
    const a = sceneRenderer();
    a.r.trigger("reset");
    expect(fades(a.frame(betting(), 4))).toEqual([0.14]);
    a.r.dispose();
    const b = sceneRenderer();
    expect(fades(b.frame(betting(), 4.1))).toEqual([]);
    expect(b.r.activeFx("reset")).toBeNull();
  });

  it("repeated rounds each draw one fresh fade, without accumulating", () => {
    const { r, frame } = sceneRenderer();
    let t = 1;
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < 30; i++, t += STEP) frame(state("diving", 300 + i * 40), t);
      for (let i = 0; i < 30; i++, t += STEP) frame(state("crashed", 1500), t);
      r.trigger("reset");
      const runs: number[] = [];
      for (let i = 0; i < 40; i++, t += STEP) runs.push(...fades(frame(betting(1500), t)));
      expect(runs[0]).toBe(0.14);
      expect(runs).toHaveLength(FADE_FRAMES);
      for (let i = 1; i < runs.length; i++) expect(runs[i]).toBeLessThan(runs[i - 1]);
    }
  });
});

// ----- 3. Scope: phases, quality, reduced motion -----

describe("F7 scope", () => {
  const nonBetting: Array<[string, RenderState]> = [
    ["diving", state("diving", 2000)],
    ["crashed", state("crashed", 2000)],
    ["cashed", state("cashed", 2000)],
    ["jackpot", state("bonus", CHAIN_MAX_DEPTH, { shipImpact: { elapsed: 0.2 } })],
  ];

  it("draws nothing while diving, crashed, cashed or on the jackpot, even with an entry", () => {
    for (const [, s] of nonBetting) {
      const { r, frame } = sceneRenderer();
      r.trigger("reset");
      expect(fades(frame(s, 5))).toEqual([]);
      expect(r.activeFx("reset")).not.toBeNull(); // the entry exists; the layer ignores it
    }
  });

  it("High and Low draw the same fade", () => {
    for (const dt of [0, 0.1, 0.2, 0.3]) {
      const hi = recorder();
      const lo = recorder();
      const cam = new Camera();
      cam.setViewport(1280, 720);
      const time = { animTime: 10 + dt, frameDt: 1 / 60 };
      effectsLayer.render(hi.ctx, betting(), cam, time, { ...HIGH, reset: { elapsed: dt } });
      effectsLayer.render(lo.ctx, betting(), cam, time, { ...LOW, reset: { elapsed: dt } });
      expect(lo.calls).toEqual(hi.calls);
      expect(hi.calls).toEqual(fadeCalls(resetFadeAlpha(dt), 1280, 720));
    }
  });

  it("reduced motion disables F7 completely, at High and Low", () => {
    for (const quality of ["high", "low"] as const) {
      const { r, frame } = sceneRenderer(390, 844, { reducedMotion: true, quality });
      r.trigger("reset");
      for (let t = 0; t < 0.5; t += 1 / 60) expect(fades(frame(betting(), 7 + t))).toEqual([]);
    }
  });

  it("issues no call at all in the betting view without a reset entry", () => {
    const cam = new Camera();
    cam.setViewport(390, 844);
    const rec = recorder();
    effectsLayer.render(rec.ctx, betting(), cam, { animTime: 1, frameDt: 1 / 60 }, HIGH);
    effectsLayer.render(rec.ctx, betting(), cam, { animTime: 1, frameDt: 1 / 60 });
    expect(rec.calls).toEqual([]);
  });
});

// ----- 4. V1–V5 unchanged, gameplay untouched -----

describe("F7 leaves everything else unchanged", () => {
  /** One scripted round through the real layers; `trigger` adds reset triggers. */
  function script(trigger: boolean, w: number, h: number) {
    seed = 1;
    const { r, frame } = sceneRenderer(w, h);
    const out: Call[][] = [];
    let t = 1;
    const run = (s: (i: number) => RenderState, n: number) => {
      for (let i = 0; i < n; i++, t += STEP) out.push(frame(s(i), t));
    };
    run(() => betting(0), 5);
    run((i) => state("diving", 40 + i * 60), 40); // V3 wake and splash
    run(() => state("crashed", 2440), 50); // V5 crash FX
    if (trigger) r.trigger("reset");
    run(() => betting(2440), 40); // F7 here only
    run((i) => state("diving", 40 + i * 120), 30);
    run(() => state("cashed", 3640), 10);
    if (trigger) r.trigger("reset");
    run(() => betting(3640), 30);
    run(
      (i) => state("bonus", CHAIN_MAX_DEPTH, { shipImpact: { elapsed: i * STEP } }),
      70, // V4 silt plume and jackpot burst
    );
    return out;
  }

  it("every frame equals the no-reset frame, plus only the F7 fill in the betting view", () => {
    for (const [w, h] of [VIEWPORTS[1], VIEWPORTS[6]]) {
      const base = script(false, w, h);
      const withReset = script(true, w, h);
      expect(withReset).toHaveLength(base.length);
      let fadeFrames = 0;
      for (let i = 0; i < base.length; i++) {
        const f = fades(withReset[i]);
        if (f.length === 0) {
          expect(serial(withReset[i]) === serial(base[i]), `frame ${i}`).toBe(true);
        } else {
          fadeFrames++;
          expect(f).toHaveLength(1);
          expect(serial(withReset[i].slice(0, -5)) === serial(base[i]), `frame ${i}`).toBe(true);
          expect(withReset[i].slice(-5)).toEqual(fadeCalls(f[0], w, h));
        }
      }
      expect(fadeFrames).toBe(2 * FADE_FRAMES);
    }
  }, 60_000);

  it("never touches the RenderState or the camera", () => {
    const { r, frame } = sceneRenderer();
    const s = betting();
    const before = JSON.stringify(s);
    r.trigger("reset");
    frame(s, 3);
    frame(s, 3.2);
    expect(JSON.stringify(s)).toBe(before);
    expect(r.fxSettings().shakeOffset).toBe(0);
  });

  it("adds no clock, timer, randomness, gradient, blur or shadow", () => {
    const src = readFileSync(new URL("./effects.ts", import.meta.url), "utf8");
    const start = src.indexOf("export const RESET_FADE_LIFE");
    const end = src.indexOf("/** V3: F3 and F4");
    const block = src.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    for (const banned of [
      "performance",
      "Date",
      "setTimeout",
      "requestAnimationFrame",
      "Math.random",
      "Gradient",
      "shadow",
      "filter",
      "drawImage",
      "translate",
      "scale(",
    ]) {
      expect(block).not.toContain(banned);
    }
  });
});
