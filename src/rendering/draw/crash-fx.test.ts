// V5 — F6 crash accent (docs/08 §4.3; owner decisions D1–D5, 2026-11-18).
// These tests pin: the start on the visual chain break (the E-X7 chain-snap
// clock, elapsed 0 on the first frame the chain is drawn broken) at the E-X7
// split point; nothing before the break and nothing after CRASH_FX_LIFE; the
// High (12) and Low (6) fragment caps; reduced motion (no fragments, no
// pulse, one static fading accent); no Canvas camera movement (the shake hook
// stays 0) and the unchanged DOM `crash-shake`; deterministic output with no
// randomness, clock, blur or filter; no effect on cashout or jackpot frames;
// no accumulation or duplication over repeated frames; the per-context
// gradient caches; that the pulse leaves the anchor and chain-break area
// clear; that the Actor layer's chain-snap drawing is unchanged by it; and
// the pulse bitmap (V5 refinement): built once per canvas pixel size, copied
// 1:1, rebuilt on resize or DPR change, released above its cap.
import { describe, expect, it } from "vitest";
import { CHAIN_MAX_DEPTH } from "@/shared/world";
import { Camera } from "../camera";
import { CHAIN_LINK_STRIDE } from "./chain";
import { cameraShakeOffset, FxQueue } from "../fx-queue";
import fxQueueSource from "../fx-queue.ts?raw";
import { actorLayer, anchorPose } from "../layers/actor";
import { chainSnapBreak, layoutDetachedLinks } from "../layers/chain-snap";
import { crashBreakPoint, effectsLayer } from "../layers/effects";
import effectsSource from "../layers/effects.ts?raw";
import { presentationOffsetY } from "../layers/presentation";
import type { FxSettings, RenderState } from "../render-state";
import { SceneRenderer } from "../scene-renderer";
import { readFileSync } from "node:fs";
import {
  CRASH_FRAGMENT_ALPHA_MAX,
  CRASH_FRAGMENT_BODY,
  CRASH_FRAGMENT_GLINT,
  CRASH_FRAGMENT_LENGTH_MAX,
  CRASH_FRAGMENT_LIFE,
  CRASH_FRAGMENT_MAX,
  CRASH_FRAGMENT_MAX_LOW,
  CRASH_FRAGMENT_REACH_MAX,
  CRASH_FRAGMENT_SINK_MAX,
  CRASH_FRAGMENT_STRIDE,
  CRASH_FX_LIFE,
  CRASH_PULSE_ATTACK,
  CRASH_PULSE_CACHE_MAX_PIXELS,
  CRASH_PULSE_INNER,
  CRASH_PULSE_LIFE,
  CRASH_PULSE_PEAK,
  CRASH_STATIC_ALPHA,
  CRASH_STATIC_LIFE,
  crashFragmentCount,
  crashFragmentData,
  crashFxActive,
  crashPulseBitmap,
  crashPulseIntensity,
  crashPulseProfile,
  crashStaticAlpha,
  drawCrashFx,
  layoutCrashFragments,
} from "./crash-fx";
import crashFxSource from "./crash-fx.ts?raw";

// ----- Helpers -----

const HIGH: FxSettings = { reducedMotion: false, quality: "high" };
const LOW: FxSettings = { reducedMotion: false, quality: "low" };
const HIGH_REDUCED: FxSettings = { reducedMotion: true, quality: "high" };
const LOW_REDUCED: FxSettings = { reducedMotion: true, quality: "low" };
const ALL_FX = [HIGH, LOW, HIGH_REDUCED, LOW_REDUCED];

const VIEWPORTS: Array<[number, number]> = [
  [375, 667],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

/** Sample times over and past the effect's life. */
const TIMES = Array.from({ length: 50 }, (_, i) => i * 0.016);

type Call = [string, ...unknown[]];
interface Grad {
  __gradient: number;
  args: number[];
  stops: Array<[number, string]>;
}

/**
 * A 2D context stand-in that records every method call and property write, in
 * order. Without `canvas` it has no backing canvas (the chain skips its view
 * culling and the pulse fills its gradient directly).
 */
function recorder(canvas?: object) {
  const calls: Call[] = [];
  const grads: Grad[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "canvas") return canvas;
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...args: number[]) => {
          calls.push([prop, ...args]);
          const g: Grad & { addColorStop?: unknown } = {
            __gradient: grads.length,
            args,
            stops: [],
          };
          Object.defineProperty(g, "addColorStop", {
            enumerable: false,
            value: (p: number, c: string) => {
              g.stops.push([p, c]);
              calls.push(["addColorStop", p, c]);
            },
          });
          grads.push(g);
          return g;
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
  return { ctx, calls, grads };
}

const isPulse = (g: Grad) => g.args[2] === CRASH_PULSE_INNER && g.args[5] === Math.SQRT2;
const isStatic = (g: Grad) => g.stops.some(([, c]) => c.includes("196, 214, 236"));

/** What of F6 a call list contains: fragment bodies and glints, pulse fills and static-accent fills. */
function classify(calls: Call[]) {
  const out = { fragments: 0, glints: 0, pulse: 0, accent: 0 };
  for (const c of calls) {
    if (c[0] !== "set fillStyle") continue;
    const v = c[1] as unknown;
    if (v === CRASH_FRAGMENT_BODY) out.fragments++;
    else if (v === CRASH_FRAGMENT_GLINT) out.glints++;
    else if (v && typeof v === "object" && "__gradient" in v) {
      const g = v as Grad;
      if (isPulse(g)) out.pulse++;
      else if (isStatic(g)) out.accent++;
    }
  }
  return out;
}
const none = { fragments: 0, glints: 0, pulse: 0, accent: 0 };

/** Gradient objects differ between recorders; compare them by their creation index. */
const normalise = (calls: Call[]) =>
  JSON.parse(
    JSON.stringify(calls, (_k, v) => (v && v.__gradient !== undefined ? `g${v.__gradient}` : v)),
  );

function camera(w: number, h: number, worldY: number): Camera {
  const c = new Camera();
  c.setViewport(w, h);
  c.follow(worldY);
  c.setPresentationOffset(presentationOffsetY(worldY, w, h));
  return c;
}

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

/** A real SceneRenderer (real layers) drawing into a recorder. */
function sceneRenderer(w: number, h: number, fx: FxSettings = HIGH) {
  const rec = recorder();
  const canvas = { width: 0, height: 0, getContext: () => rec.ctx } as unknown as HTMLCanvasElement;
  const r = new SceneRenderer(canvas);
  r.resize(w, h, 1);
  r.setMotion({ reducedMotion: fx.reducedMotion });
  r.setQuality(fx.quality);
  /** Renders one frame and returns only that frame's calls. */
  const frame = (s: RenderState, animTime: number): Call[] => {
    const from = rec.calls.length;
    r.frame(s, { animTime, frameDt: 1 / 60 });
    return rec.calls.slice(from);
  };
  return { r, rec, frame };
}

/** The crashed frame at `elapsed` after the break, through the real layers (Actor then Effects). */
function crashFrame(w: number, h: number, worldY: number, elapsed: number, fx: FxSettings) {
  const cam = camera(w, h, worldY);
  const startedAt = 10;
  const s = state("crashed", worldY, { chainSnap: { startedAt, elapsed } });
  const time = { animTime: startedAt + elapsed, frameDt: 1 / 60 };
  const actor = recorder();
  actorLayer.render(actor.ctx, s, cam, time, fx);
  const fxRec = recorder();
  effectsLayer.render(fxRec.ctx, s, cam, time, fx);
  return { cam, s, time, actor, effects: fxRec, startedAt };
}

/**
 * The break point computed independently of the upper chain: the detached
 * links' far joint at elapsed 0, rebuilt from their own link data hung from
 * the ring at the break pose (chain-snap.ts rebuilds those joints the same way).
 */
function detachedTopJoint(worldY: number, cam: Camera, startedAt: number) {
  const p = anchorPose(worldY, cam, startedAt);
  const ringX = p.chainEndX;
  const ringY = p.chainEndY;
  const layout = layoutDetachedLinks(0, ringX, ringY, 0, 1, 1, Infinity);
  let jx = ringX;
  let jy = ringY;
  for (let k = 0; k < layout.count; k++) {
    const o = k * CHAIN_LINK_STRIDE;
    jx = 2 * layout.data[o] - jx;
    jy = 2 * layout.data[o + 1] - jy;
  }
  return { x: jx, y: jy, count: layout.count };
}

// ----- 1. Start at the visual chain break, at the break point -----

describe("F6 timing and position: the visual chain break", () => {
  it("starts on the first rendered crashed frame (elapsed 0), on the E-X7 chain-snap clock", () => {
    const { r, frame } = sceneRenderer(390, 844);
    expect(classify(frame(state("diving", 2000), 9.98))).toEqual(none);
    const first = frame(state("crashed", 2000), 10);
    // The latched break and the FX queue's crash entry share one timestamp (one crash clock).
    const f = classify(first);
    expect(f.fragments).toBe(CRASH_FRAGMENT_MAX);
    expect(f.pulse).toBe(0); // the pulse rises from exactly 0 at the break
    const next = classify(frame(state("crashed", 2000), 10 + CRASH_PULSE_ATTACK));
    expect(next.pulse).toBe(1);
    expect(r.fxSettings().shakeOffset).toBe(0);
  });

  it("follows the chain-snap elapsed, not the frame count or a clock of its own", () => {
    for (const elapsed of [0, 0.1, 0.3, 0.55]) {
      const { effects } = crashFrame(390, 844, 2000, elapsed, HIGH);
      const standalone = recorder();
      const bp = crashBreakPoint();
      drawCrashFx(standalone.ctx, elapsed, bp.x, bp.y, 390, 844, HIGH);
      expect(normalise(effects.calls)).toEqual(normalise(standalone.calls));
    }
  });

  it("places the break at the E-X7 split point, at all seven sizes and depths", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [300, 2000, 4100]) {
        const { cam, startedAt, effects } = crashFrame(w, h, worldY, 0, HIGH);
        const bp = crashBreakPoint();
        const ref = detachedTopJoint(worldY, cam, startedAt);
        expect(ref.count).toBe(chainSnapBreak().detached);
        expect(Math.hypot(bp.x - ref.x, bp.y - ref.y)).toBeLessThan(0.5);
        // At elapsed 0 every fragment sits exactly on the break point.
        const translates = effects.calls.filter((c) => c[0] === "translate");
        expect(translates.length).toBeGreaterThan(0);
        for (const t of translates) {
          expect(t[1]).toBeCloseTo(bp.x, 9);
          expect(t[2]).toBeCloseTo(bp.y, 9);
        }
      }
    }
  });
});

// ----- 2. Nothing before the break -----

describe("F6 never appears before the break", () => {
  it("draws nothing on betting, diving or cashout frames, and nothing for a crashed state without chainSnap", () => {
    for (const fx of ALL_FX) {
      const cam = camera(390, 844, 2000);
      const time = { animTime: 10, frameDt: 1 / 60 };
      for (const s of [
        state("idle", 0),
        state("diving", 60),
        state("diving", 2000),
        state("cashed", 2000),
        state("crashed", 2000), // the engine's crashed frame before the renderer latches a break
        state("crashed", 2000, { chainSnap: null }),
      ]) {
        const rec = recorder();
        effectsLayer.render(rec.ctx, s, cam, time, fx);
        expect(classify(rec.calls)).toEqual(none);
      }
    }
  });

  it("layout and draw issue nothing for a negative or non-finite time", () => {
    for (const t of [-0.001, -1, NaN, Infinity, -Infinity]) {
      expect(layoutCrashFragments(t, 100, 100, HIGH)).toBe(0);
      expect(crashFxActive(t)).toBe(false);
      const rec = recorder();
      drawCrashFx(rec.ctx, t, 100, 100, 390, 844, HIGH);
      expect(rec.calls).toEqual([]);
    }
  });
});

// ----- 3, 4. Caps -----

describe("F6 fragment caps", () => {
  it("never exceeds 12 on High and 6 on Low, and starts at the cap", () => {
    expect(crashFragmentCount(HIGH)).toBe(12);
    expect(crashFragmentCount(LOW)).toBe(6);
    expect(layoutCrashFragments(0, 0, 0, HIGH)).toBe(CRASH_FRAGMENT_MAX);
    expect(layoutCrashFragments(0, 0, 0, LOW)).toBe(CRASH_FRAGMENT_MAX_LOW);
    for (const t of TIMES) {
      expect(layoutCrashFragments(t, 0, 0, HIGH)).toBeLessThanOrEqual(12);
      expect(layoutCrashFragments(t, 0, 0, LOW)).toBeLessThanOrEqual(6);
      for (const [fx, cap] of [
        [HIGH, 12],
        [LOW, 6],
      ] as const) {
        const rec = recorder();
        drawCrashFx(rec.ctx, t, 100, 100, 390, 844, fx);
        const c = classify(rec.calls);
        expect(c.fragments).toBeLessThanOrEqual(cap);
        expect(c.glints).toBe(c.fragments);
        expect(c.pulse).toBeLessThanOrEqual(1);
      }
    }
  });

  it("Low is the first half of the High set (same fragments, same places)", () => {
    for (const t of [0.05, 0.2, 0.45]) {
      const nHigh = layoutCrashFragments(t, 50, 60, HIGH);
      const high = Array.from(crashFragmentData().subarray(0, nHigh * CRASH_FRAGMENT_STRIDE));
      const nLow = layoutCrashFragments(t, 50, 60, LOW);
      const low = Array.from(crashFragmentData().subarray(0, nLow * CRASH_FRAGMENT_STRIDE));
      expect(low).toEqual(high.slice(0, low.length));
    }
  });

  it("keeps the motion short and restrained: reach, sink, size and alpha bounds", () => {
    const maxDist = CRASH_FRAGMENT_REACH_MAX + CRASH_FRAGMENT_SINK_MAX;
    for (const t of TIMES) {
      const n = layoutCrashFragments(t, 0, 0, HIGH);
      const d = crashFragmentData();
      for (let i = 0; i < n; i++) {
        const o = i * CRASH_FRAGMENT_STRIDE;
        expect(Math.hypot(d[o], d[o + 1])).toBeLessThanOrEqual(maxDist + 1e-9);
        expect(d[o + 3]).toBeLessThanOrEqual(CRASH_FRAGMENT_LENGTH_MAX);
        expect(d[o + 5]).toBeLessThanOrEqual(CRASH_FRAGMENT_ALPHA_MAX);
        expect(d[o + 6]).toBeLessThanOrEqual(d[o + 5] + 1e-12);
      }
    }
  });

  it("spreads the fragments outward on every side (High and Low)", () => {
    for (const fx of [HIGH, LOW]) {
      const n = layoutCrashFragments(0.3, 0, 0, fx);
      const d = crashFragmentData();
      const quadrants = new Set<string>();
      for (let i = 0; i < n; i++) {
        const o = i * CRASH_FRAGMENT_STRIDE;
        quadrants.add(`${d[o] > 0}${d[o + 1] > 0}`);
      }
      expect(quadrants.size).toBe(4);
    }
  });
});

// ----- 5. Reduced motion -----

describe("F6 under reduced motion", () => {
  it("draws no fragments and no pulse; one static accent that only fades", () => {
    for (const fx of [HIGH_REDUCED, LOW_REDUCED]) {
      let lastAlpha = Infinity;
      for (const t of TIMES) {
        expect(crashPulseIntensity(t, fx)).toBe(0);
        expect(layoutCrashFragments(t, 120, 300, fx)).toBe(0);
        const rec = recorder();
        drawCrashFx(rec.ctx, t, 120, 300, 390, 844, fx);
        const c = classify(rec.calls);
        expect(c.fragments).toBe(0);
        expect(c.pulse).toBe(0);
        expect(c.accent).toBeLessThanOrEqual(1);
        if (c.accent === 1) {
          // Static: always at the break point, same size; only its alpha falls.
          expect(rec.calls.filter((x) => x[0] === "translate")).toEqual([["translate", 120, 300]]);
          expect(rec.calls.filter((x) => x[0] === "rotate")).toEqual([]);
          const alpha = rec.calls.find((x) => x[0] === "set globalAlpha")?.[1] as number;
          expect(alpha).toBeLessThanOrEqual(CRASH_STATIC_ALPHA);
          expect(alpha).toBeLessThan(lastAlpha);
          lastAlpha = alpha;
        } else {
          expect(t >= CRASH_STATIC_LIFE || crashStaticAlpha(t) < 1 / 255).toBe(true);
        }
      }
    }
  });

  it("shows the accent through the real layers at the break and nothing after its life", () => {
    const a = crashFrame(390, 844, 2000, 0.05, HIGH_REDUCED);
    expect(classify(a.effects.calls)).toEqual({ fragments: 0, glints: 0, pulse: 0, accent: 1 });
    const b = crashFrame(390, 844, 2000, CRASH_STATIC_LIFE, HIGH_REDUCED);
    expect(classify(b.effects.calls)).toEqual(none);
  });
});

// ----- 6, 7. No camera movement; DOM crash-shake unchanged -----

describe("F6 and the camera (owner decision D1: no Canvas camera shake)", () => {
  it("keeps the shake offset at exactly 0 on every crash frame, at every quality", () => {
    for (const fx of ALL_FX) {
      const { r, frame } = sceneRenderer(1280, 720, fx);
      frame(state("diving", 2000), 9.99);
      for (const t of TIMES) {
        frame(state("crashed", 2000), 10 + t);
        expect(r.fxSettings().shakeOffset).toBe(0);
      }
    }
    const q = new FxQueue();
    q.trigger("crash");
    q.update(10, 10);
    for (const t of TIMES) {
      q.update(10 + t, 10);
      expect(cameraShakeOffset(q, 10 + t, false)).toBe(0);
      expect(cameraShakeOffset(q, 10 + t, true)).toBe(0);
    }
  });

  it("does not touch the camera or the frame transform", () => {
    const code = crashFxSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(
      /setShake|camera|Camera|setTransform|resetTransform|import .*fx-queue/,
    );
    // The reserved hook still returns 0 unconditionally.
    expect(fxQueueSource).toMatch(/if \(reducedMotion\) return 0;\s*return 0;/);
    for (const fx of ALL_FX) {
      for (const t of TIMES) {
        const rec = recorder();
        drawCrashFx(rec.ctx, t, 100, 100, 390, 844, fx);
        const saves = rec.calls.filter((c) => c[0] === "save").length;
        const restores = rec.calls.filter((c) => c[0] === "restore").length;
        expect(saves).toBe(restores);
        // Every transform is inside a save/restore pair.
        let depth = 0;
        for (const c of rec.calls) {
          if (c[0] === "save") depth++;
          else if (c[0] === "restore") depth--;
          else if (c[0] === "translate" || c[0] === "rotate" || c[0] === "scale") {
            expect(depth).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("leaves the DOM multiplier crash-shake exactly as before", () => {
    // Read from disk: Vitest's CSS handling empties `?raw` stylesheet imports.
    const read = (rel: string) =>
      readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const stylesSource = read("../../styles.css");
    const multiplierOverlaySource = read("../../ui/components/MultiplierOverlay.tsx");
    expect(stylesSource).toContain(
      [
        "@keyframes crashShake {",
        "  0%, 100% { transform: translate(0,0); }",
        "  20% { transform: translate(-3px, 2px); }",
        "  40% { transform: translate(3px, -2px); }",
        "  60% { transform: translate(-2px, -3px); }",
        "  80% { transform: translate(2px, 3px); }",
        "}",
      ].join("\n"),
    );
    expect(stylesSource).toContain(
      ".crash-shake {\n  animation: crashShake 0.35s ease-in-out 2;\n}",
    );
    expect(multiplierOverlaySource).toContain('showCrash ? "crash-shake text-danger" : ""');
  });
});

// ----- 8. Determinism and cost rules -----

describe("F6 is deterministic", () => {
  it("renders identical calls for identical inputs, with no randomness", () => {
    const realRandom = Math.random;
    for (const fx of ALL_FX) {
      for (const t of [0, 0.03, 0.2, 0.5, 0.69]) {
        Math.random = () => 0.123;
        const a = crashFrame(768, 1024, 2000, t, fx).effects.calls;
        Math.random = () => 0.987;
        const b = crashFrame(768, 1024, 2000, t, fx).effects.calls;
        Math.random = realRandom;
        expect(normalise(a)).toEqual(normalise(b));
      }
    }
    Math.random = realRandom;
  });

  it("uses no Math.random, clock, shadowBlur or filter", () => {
    const code = crashFxSource.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/Math\.random|performance\.now|Date\.now|shadowBlur|\.filter\s*=/);
  });

  it("creates its gradients once per canvas context", () => {
    const rec = recorder();
    for (const t of TIMES) drawCrashFx(rec.ctx, t, 100, 100, 390, 844, HIGH);
    for (const t of TIMES) drawCrashFx(rec.ctx, t, 100, 100, 390, 844, HIGH_REDUCED);
    expect(rec.grads.filter(isPulse)).toHaveLength(1);
    expect(rec.grads.filter(isStatic)).toHaveLength(1);
    expect(rec.grads).toHaveLength(2);
  });
});

// ----- 9. Expiration -----

describe("F6 expires", () => {
  it("is exactly absent from CRASH_FX_LIFE on, through the real layers", () => {
    expect(CRASH_FX_LIFE).toBe(Math.max(CRASH_FRAGMENT_LIFE, CRASH_PULSE_LIFE, CRASH_STATIC_LIFE));
    for (const fx of ALL_FX) {
      for (const t of [CRASH_FX_LIFE, CRASH_FX_LIFE + 0.01, 1.2, 2.3, 5]) {
        expect(classify(crashFrame(390, 844, 2000, t, fx).effects.calls)).toEqual(none);
      }
    }
  });

  it("fades every part to nothing before its end", () => {
    expect(crashPulseIntensity(CRASH_PULSE_LIFE - 1e-9, HIGH)).toBeLessThan(1e-6);
    expect(crashPulseIntensity(CRASH_PULSE_ATTACK, HIGH)).toBeCloseTo(CRASH_PULSE_PEAK, 12);
    expect(crashPulseIntensity(CRASH_PULSE_LIFE, HIGH)).toBe(0);
    expect(crashStaticAlpha(CRASH_STATIC_LIFE)).toBe(0);
    expect(layoutCrashFragments(CRASH_FRAGMENT_LIFE, 0, 0, HIGH)).toBe(0);
    let prev = Infinity;
    for (let t = CRASH_PULSE_ATTACK; t < CRASH_PULSE_LIFE; t += 0.01) {
      const v = crashPulseIntensity(t, HIGH);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("shows nothing after a remount mid-crash (the settled chain is shown, no replay)", () => {
    const { frame } = sceneRenderer(390, 844);
    // First frame ever already crashed: the clock shows the settled result (elapsed 2.3 s).
    expect(classify(frame(state("crashed", 2000), 30))).toEqual(none);
    expect(classify(frame(state("crashed", 2000), 30.1))).toEqual(none);
  });
});

// ----- 10. Cashout and jackpot untouched -----

describe("F6 stays out of cashout and jackpot", () => {
  it("draws nothing on cashed, bonus or jackpot landing frames", () => {
    for (const fx of ALL_FX) {
      for (const [w, h] of VIEWPORTS) {
        for (const s of [
          state("cashed", 1500),
          state("cashed", CHAIN_MAX_DEPTH, { shipImpact: { elapsed: 0 } }),
          state("cashed", CHAIN_MAX_DEPTH, { shipImpact: { elapsed: 0.8 } }),
          state("bonus", CHAIN_MAX_DEPTH, { shipImpact: { elapsed: 2.5 } }),
        ]) {
          const rec = recorder();
          effectsLayer.render(
            rec.ctx,
            s,
            camera(w, h, s.worldY),
            { animTime: 7, frameDt: 1 / 60 },
            fx,
          );
          expect(classify(rec.calls)).toEqual(none);
        }
      }
    }
  });

  it("does not run across a round: after the crash ends nothing is left", () => {
    const { frame } = sceneRenderer(390, 844);
    frame(state("diving", 2000), 9.99);
    frame(state("crashed", 2000), 10);
    expect(classify(frame(state("idle", 0), 12.4))).toEqual(none);
    expect(classify(frame(state("diving", 800), 15))).toEqual(none);
    expect(classify(frame(state("cashed", 800), 15.5))).toEqual(none);
  });
});

// ----- 11. No duplication over repeated frames -----

describe("F6 over repeated frames", () => {
  it("draws the same, single set when the same frame is rendered again", () => {
    for (const fx of ALL_FX) {
      const { frame } = sceneRenderer(390, 844, fx);
      frame(state("diving", 2000), 9.99);
      const a = frame(state("crashed", 2000), 10);
      const b = frame(state("crashed", 2000), 10.2);
      const b2 = frame(state("crashed", 2000), 10.2);
      const cb = classify(b);
      expect(classify(b2)).toEqual(cb);
      expect(cb.fragments).toBeLessThanOrEqual(crashFragmentCount(fx));
      expect(cb.pulse + cb.accent).toBeLessThanOrEqual(1);
      expect(classify(a).fragments).toBe(crashFragmentCount(fx));
      // The second identical frame issues exactly the same calls (nothing
      // accumulates); only one-time gradient creation may differ.
      const drawOnly = (calls: Call[]) =>
        (
          JSON.parse(
            JSON.stringify(calls, (_k, v) => (v && v.__gradient !== undefined ? "g" : v)),
          ) as Call[]
        ).filter(
          (c: Call) =>
            c[0] !== "createRadialGradient" &&
            c[0] !== "createLinearGradient" &&
            c[0] !== "addColorStop",
        );
      expect(drawOnly(b2)).toEqual(drawOnly(b));
    }
  });

  it("repeated crash triggers during one break do not restart or duplicate it", () => {
    const { r, frame } = sceneRenderer(390, 844);
    frame(state("diving", 2000), 9.99);
    r.trigger("crash");
    frame(state("crashed", 2000), 10);
    r.trigger("crash");
    r.trigger("crash");
    const later = classify(frame(state("crashed", 2000), 10 + CRASH_FX_LIFE));
    expect(later).toEqual(none);
    expect(r.activeFx("crash")?.startedAt).toBe(10);
  });
});

// ----- 12. Existing scenes and drawing unchanged -----

describe("F6 leaves the existing drawing unchanged", () => {
  it("does not change the Actor layer's chain-snap drawing on the next frame", () => {
    const run = (withEffects: boolean) => {
      const cam = camera(390, 844, 2000);
      const out: Call[][] = [];
      for (const elapsed of [0, 0.1, 0.2]) {
        const s = state("crashed", 2000, { chainSnap: { startedAt: 10, elapsed } });
        const time = { animTime: 10 + elapsed, frameDt: 1 / 60 };
        const a = recorder();
        actorLayer.render(a.ctx, s, cam, time, HIGH);
        out.push(normalise(a.calls));
        if (withEffects) effectsLayer.render(recorder().ctx, s, cam, time, HIGH);
      }
      return out;
    };
    expect(run(true)).toEqual(run(false));
  });

  it("keeps the anchor, the break and the screen centre clear of the pulse", () => {
    for (const [w, h] of VIEWPORTS) {
      const { cam, startedAt } = crashFrame(w, h, 2000, 0, HIGH);
      const bp = crashBreakPoint();
      const p = anchorPose(2000, cam, startedAt);
      const unit = (x: number, y: number) =>
        Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2));
      expect(crashPulseProfile(unit(bp.x, bp.y))).toBe(0);
      expect(crashPulseProfile(unit(p.x, p.y))).toBe(0);
      expect(crashPulseProfile(0)).toBe(0);
      // At an edge's middle the darkening stays under 0.1 even at the peak.
      expect(CRASH_PULSE_PEAK * crashPulseProfile(1)).toBeLessThan(0.1);
    }
  });

  it("issues no call outside crashed frames, so every other scene draws exactly as in V4", () => {
    // Covered frame for frame against the V4 commit in the browser comparison
    // (docs/15, "V5"); here: the crash block is the only new code path and is
    // gated on phase "crashed" with a chain-snap timing.
    expect(effectsSource).toMatch(/state\.phase === "crashed" \? state\.chainSnap : null/);
    expect(effectsSource.match(/drawCrashFx\(/g)).toHaveLength(1);
  });
});

// ----- 13. Pulse bitmap (V5 refinement) -----

/** A target canvas of `w` × `h` device pixels whose document hands out recorded offscreen canvases. */
function backedTarget(w: number, h: number, opts: { noContext?: boolean } = {}) {
  const made: Array<{
    canvas: { width: number; height: number };
    rec: ReturnType<typeof recorder>;
  }> = [];
  const ownerDocument = {
    createElement(tag: string) {
      expect(tag).toBe("canvas");
      const rec = recorder();
      const canvas = {
        width: 300,
        height: 150,
        getContext: (kind: string) => (opts.noContext || kind !== "2d" ? null : rec.ctx),
      };
      made.push({ canvas, rec });
      return canvas;
    },
  };
  const target = { width: w, height: h, ownerDocument };
  return { target, main: recorder(target), made };
}

const count = (calls: Call[], name: string) => calls.filter((c) => c[0] === name).length;

describe("F6 pulse bitmap", () => {
  it("rasterizes the pulse once at the canvas's pixel size and copies it 1:1 over the viewport", () => {
    const { main, made } = backedTarget(780, 1688); // 390 × 844 at DPR 2
    let drawn = 0;
    for (const t of TIMES) {
      const from = main.calls.length;
      drawCrashFx(main.ctx, t, 100, 100, 390, 844, HIGH);
      const calls = main.calls.slice(from);
      const pulse = crashPulseIntensity(t, HIGH);
      const copies = calls.filter((c) => c[0] === "drawImage");
      if (pulse >= 1 / 255) {
        drawn++;
        expect(copies).toEqual([["drawImage", made[0].canvas, 0, 0, 390, 844]]);
        const alpha = calls.findIndex((c) => c[0] === "set globalAlpha" && c[1] === pulse);
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThan(calls.findIndex((c) => c[0] === "drawImage"));
      } else {
        expect(copies).toHaveLength(0);
      }
    }
    expect(drawn).toBeGreaterThan(20);
    // One offscreen canvas, rasterized once: the unit square stretched over it.
    expect(made).toHaveLength(1);
    const b = made[0];
    expect([b.canvas.width, b.canvas.height]).toEqual([780, 1688]);
    expect(count(b.rec.calls, "fillRect")).toBe(1);
    expect(b.rec.calls).toContainEqual(["translate", 390, 844]);
    expect(b.rec.calls).toContainEqual(["scale", 390, 844]);
    expect(b.rec.calls).toContainEqual(["fillRect", -1, -1, 2, 2]);
    expect(b.rec.grads.filter(isPulse)).toHaveLength(1);
    expect(b.rec.calls.some((c) => c[0] === "set globalAlpha")).toBe(false); // full strength
    // The target never fills the pulse gradient itself on this path.
    expect(main.grads.filter(isPulse)).toHaveLength(0);
    expect(classify(main.calls).pulse).toBe(0);
    expect(classify(main.calls).fragments).toBeGreaterThan(0);
  });

  it("rebuilds on a pixel-size change (resize, DPR) and reuses the same element", () => {
    const { target, main, made } = backedTarget(780, 1688);
    drawCrashFx(main.ctx, 0.1, 100, 100, 390, 844, HIGH);
    drawCrashFx(main.ctx, 0.2, 100, 100, 390, 844, HIGH);
    expect(count(made[0].rec.calls, "fillRect")).toBe(1);
    target.width = 390; // DPR 2 → 1
    target.height = 844;
    drawCrashFx(main.ctx, 0.3, 100, 100, 390, 844, HIGH);
    expect(made).toHaveLength(1);
    expect([made[0].canvas.width, made[0].canvas.height]).toEqual([390, 844]);
    expect(count(made[0].rec.calls, "fillRect")).toBe(2);
    expect(made[0].rec.calls).toContainEqual(["scale", 195, 422]);
    target.width = 1920; // window resize
    target.height = 1080;
    drawCrashFx(main.ctx, 0.35, 100, 100, 1920, 1080, HIGH);
    drawCrashFx(main.ctx, 0.4, 100, 100, 1920, 1080, HIGH);
    expect(made).toHaveLength(1);
    expect([made[0].canvas.width, made[0].canvas.height]).toEqual([1920, 1080]);
    expect(count(made[0].rec.calls, "fillRect")).toBe(3);
    expect(made[0].rec.grads.filter(isPulse)).toHaveLength(1); // one gradient per bitmap context
  });

  it("keeps a separate bitmap per target context", () => {
    const a = backedTarget(390, 844);
    const b = backedTarget(390, 844);
    drawCrashFx(a.main.ctx, 0.1, 100, 100, 390, 844, HIGH);
    drawCrashFx(b.main.ctx, 0.1, 100, 100, 390, 844, HIGH);
    expect(a.made).toHaveLength(1);
    expect(b.made).toHaveLength(1);
    expect(crashPulseBitmap(a.main.ctx)).toBe(a.made[0].canvas);
    expect(crashPulseBitmap(b.main.ctx)).toBe(b.made[0].canvas);
  });

  it("fills the gradient directly above the cap and releases the bitmap", () => {
    const { target, main, made } = backedTarget(780, 1688);
    drawCrashFx(main.ctx, 0.1, 100, 100, 390, 844, HIGH);
    expect(made[0].canvas.width).toBe(780);
    target.width = 3840; // 1920 × 1080 at DPR 2: exactly the cap, still cached
    target.height = 2160;
    expect(target.width * target.height).toBe(CRASH_PULSE_CACHE_MAX_PIXELS);
    expect(crashPulseBitmap(main.ctx)).toBe(made[0].canvas);
    target.width = 5120; // 2560 × 1440 at DPR 2: above the cap
    target.height = 2880;
    const from = main.calls.length;
    drawCrashFx(main.ctx, 0.15, 100, 100, 2560, 1440, HIGH);
    const calls = main.calls.slice(from);
    expect(count(calls, "drawImage")).toBe(0);
    expect(classify(calls).pulse).toBe(1);
    expect([made[0].canvas.width, made[0].canvas.height]).toEqual([0, 0]); // released
    // Back under the cap: the same element is rasterized again.
    target.width = 780;
    target.height = 1688;
    expect(crashPulseBitmap(main.ctx)).toBe(made[0].canvas);
    expect(made[0].canvas.width).toBe(780);
    expect(made).toHaveLength(1);
  });

  it("falls back to the direct fill when no offscreen 2D context is available, asking once", () => {
    const { main, made } = backedTarget(390, 844, { noContext: true });
    for (const t of TIMES) drawCrashFx(main.ctx, t, 100, 100, 390, 844, HIGH);
    expect(made).toHaveLength(1);
    expect(count(main.calls, "drawImage")).toBe(0);
    expect(main.grads.filter(isPulse)).toHaveLength(1);
    // Without any backing canvas (tests, SSR) it is the direct fill as well.
    const bare = recorder();
    drawCrashFx(bare.ctx, 0.1, 100, 100, 390, 844, HIGH);
    expect(classify(bare.calls).pulse).toBe(1);
    expect(crashPulseBitmap(bare.ctx)).toBeNull();
  });

  it("is never built under reduced motion, before the pulse rises or after it ends", () => {
    for (const fx of [HIGH_REDUCED, LOW_REDUCED]) {
      const { main, made } = backedTarget(390, 844);
      for (const t of TIMES) drawCrashFx(main.ctx, t, 100, 100, 390, 844, fx);
      expect(made).toHaveLength(0);
      expect(count(main.calls, "drawImage")).toBe(0);
    }
    const { main, made } = backedTarget(390, 844);
    for (const t of [-1, -0.01, 0, CRASH_PULSE_LIFE, CRASH_PULSE_LIFE + 0.05, 2]) {
      drawCrashFx(main.ctx, t, 100, 100, 390, 844, HIGH);
    }
    expect(made).toHaveLength(0);
  });

  it("serves Low quality from the same bitmap (the fragments differ, the pulse does not)", () => {
    const { main, made } = backedTarget(390, 844);
    drawCrashFx(main.ctx, 0.1, 100, 100, 390, 844, LOW);
    drawCrashFx(main.ctx, 0.2, 100, 100, 390, 844, HIGH);
    expect(made).toHaveLength(1);
    expect(count(made[0].rec.calls, "fillRect")).toBe(1);
    expect(count(main.calls, "drawImage")).toBe(2);
  });
});
