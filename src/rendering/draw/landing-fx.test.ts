// V4 — F5 landing silt plume (docs/08 §4.3; owner decisions D1–D4,
// 2026-11-17). These tests pin: the touchdown timing (the Actor layer's own
// landing, identical to the audio host's floor-thud timing) and contact point;
// nothing before the touchdown and nothing after SILT_PLUME_LIFE; the High,
// Low and reduced-motion caps; deterministic output with no randomness or
// clock; that the plume appears only on the jackpot landing (never on a
// crash — including the snapped anchor landing on the sand — a cashout,
// betting or diving); that the jackpot burst is still drawn exactly as before
// on top of it; the per-context gradient cache; and that the touchdown helper
// leaves the Actor layer's pose and drawing untouched.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAIN_MAX_DEPTH } from "@/shared/world";
import { anchorTouchdownSeconds } from "@/ui/anchor-touchdown";
import { Camera } from "../camera";
import { ANCHOR_DRAW_H, SHIP_IMPACT_FX_SECONDS } from "../constants";
import { actorLayer, anchorPose, anchorTouchdown } from "../layers/actor";
import { effectsLayer } from "../layers/effects";
import { presentationOffsetY } from "../layers/presentation";
import type { FxSettings, RenderState } from "../render-state";
import { SILT_FX_THEME, SILT_FX_TONE } from "../theme";
import { drawShipImpact } from "./impact-fx";
import {
  SILT_PLUME_LIFE,
  SILT_PLUME_MAX,
  SILT_PLUME_MAX_LOW,
  SILT_PUFF_ALPHA_MAX,
  SILT_PUFF_FLATNESS,
  SILT_PUFF_RADIUS_END_MAX,
  SILT_PUFF_RADIUS_START_MIN,
  SILT_PUFF_REACH_MAX,
  SILT_PUFF_RISE_MAX,
  SILT_PUFF_STRIDE,
  SILT_STATIC_ALPHA,
  drawSiltPlume,
  layoutSiltPlume,
  siltPlumeActive,
  siltPlumeCount,
  siltPlumePuffs,
  siltPuffFade,
} from "./landing-fx";
import landingFxSource from "./landing-fx.ts?raw";

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

const TIME = { animTime: 7.77, frameDt: 1 / 60 };
/** The anchor's bottom tip below its sprite centre (actor.ts TIP_BELOW_CENTER). */
const TIP_BELOW_CENTER = ANCHOR_DRAW_H * 0.452;

type Call = [string, ...unknown[]];

/** A 2D context stand-in that records every method call and property write, in order. */
function recorder() {
  const calls: Call[] = [];
  let gradients = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "canvas") return undefined; // no backing canvas: the chain skips its view culling
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...args: number[]) => {
          calls.push([prop, ...args]);
          const id = gradients++;
          return {
            __gradient: id,
            addColorStop: (p: number, c: string) => calls.push(["addColorStop", p, c]),
          };
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
  return { ctx, calls };
}

const named = (calls: Call[], name: string) => calls.filter((c) => c[0] === name);

/** Gradient objects differ between recorders; compare them by their creation index. */
const normalise = (calls: Call[]) =>
  JSON.parse(
    JSON.stringify(calls, (_k, v) => (v && v.__gradient !== undefined ? `g${v.__gradient}` : v)),
  );

function floorCamera(w: number, h: number, worldY = CHAIN_MAX_DEPTH): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  camera.setPresentationOffset(presentationOffsetY(worldY, w, h));
  return camera;
}

function sceneState(
  phase: RenderState["phase"],
  shipImpact: RenderState["shipImpact"],
  worldY = CHAIN_MAX_DEPTH,
): RenderState {
  return {
    phase,
    worldY,
    depthRatio: Math.min(1, worldY / CHAIN_MAX_DEPTH),
    boost: 0,
    creatures: [],
    crashed: phase === "crashed",
    shipImpact,
  };
}

interface Puff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  a: number;
}

function puffs(age: number, cx: number, cy: number, fx: FxSettings): Puff[] {
  const n = layoutSiltPlume(age, cx, cy, fx);
  const b = siltPlumePuffs();
  const out: Puff[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * SILT_PUFF_STRIDE;
    out.push({ x: b[o], y: b[o + 1], rx: b[o + 2], ry: b[o + 3], a: b[o + 4] });
  }
  return out;
}

/** The plume's draw signature: one translate per puff (nothing else in the Effects layer translates). */
const plumePuffCount = (calls: Call[]) => named(calls, "translate").length;

afterEach(() => {
  vi.restoreAllMocks();
});

// ----- Touchdown timing and contact (D1) -----

describe("anchor touchdown (V4, D1)", () => {
  it.each(VIEWPORTS)("%i × %i: the same instant the floor-thud hit is timed on", (w, h) => {
    const t = anchorTouchdown(floorCamera(w, h)).seconds;
    expect(t).toBeCloseTo(anchorTouchdownSeconds(w, h, CHAIN_MAX_DEPTH)!, 9);
    expect(t).toBeGreaterThanOrEqual(0.3);
    expect(t).toBeLessThanOrEqual(0.7);
  });

  it.each(VIEWPORTS)(
    "%i × %i: the contact is the sand under the drawn anchor's tip at touchdown",
    (w, h) => {
      const camera = floorCamera(w, h);
      const { seconds, x, y } = { ...anchorTouchdown(camera) };
      const p = anchorPose(CHAIN_MAX_DEPTH, camera, TIME.animTime, seconds);
      const tipX = p.x - Math.sin(p.swayAngle) * TIP_BELOW_CENTER;
      const tipY = p.y + Math.cos(p.swayAngle) * TIP_BELOW_CENTER;
      expect(tipX).toBeCloseTo(x, 6);
      expect(tipY).toBeCloseTo(y, 6);
      expect(p.floorY).toBeCloseTo(y, 9);
      // Just before, the tip is still above the sand.
      const q = anchorPose(CHAIN_MAX_DEPTH, camera, TIME.animTime, seconds - 0.05);
      expect(q.y + Math.cos(q.swayAngle) * TIP_BELOW_CENTER).toBeLessThan(y - 1);
    },
  );

  it("does not change the Actor layer's pose or drawing", () => {
    for (const [w, h] of VIEWPORTS) {
      const camera = floorCamera(w, h);
      for (const landing of [-1, 0, 0.2, 0.5, 0.9, 1.6, 3]) {
        const before = { ...anchorPose(CHAIN_MAX_DEPTH, camera, TIME.animTime, landing) };
        anchorTouchdown(camera);
        expect({ ...anchorPose(CHAIN_MAX_DEPTH, camera, TIME.animTime, landing) }).toEqual(before);
      }
      const state = sceneState("cashed", { elapsed: 0.8 });
      const a = recorder();
      actorLayer.render(a.ctx, state, camera, TIME);
      anchorTouchdown(camera);
      const b = recorder();
      actorLayer.render(b.ctx, state, camera, TIME);
      expect(normalise(b.calls)).toEqual(normalise(a.calls));
    }
  });
});

// ----- Layout -----

describe("silt plume layout (V4)", () => {
  const CX = 600;
  const CY = 700;

  it("is exactly absent before the touchdown and from SILT_PLUME_LIFE on", () => {
    for (const fx of ALL_FX) {
      for (const age of [-1, -0.3, -1e-6, SILT_PLUME_LIFE, SILT_PLUME_LIFE + 0.01, 5, NaN]) {
        expect(layoutSiltPlume(age, CX, CY, fx)).toBe(0);
      }
      expect(layoutSiltPlume(0.3, NaN, CY, fx)).toBe(0);
      expect(layoutSiltPlume(0.3, CX, Infinity, fx)).toBe(0);
    }
    expect(siltPlumeActive(-0.001)).toBe(false);
    expect(siltPlumeActive(0)).toBe(true);
    expect(siltPlumeActive(SILT_PLUME_LIFE - 1e-9)).toBe(true);
    expect(siltPlumeActive(SILT_PLUME_LIFE)).toBe(false);
    expect(SILT_PLUME_LIFE).toBe(1.0); // D2: about 1 s, provisional
  });

  it("caps the puffs at 12 on High, 6 on Low and 1 under reduced motion", () => {
    expect(SILT_PLUME_MAX).toBe(12);
    expect(SILT_PLUME_MAX_LOW).toBe(6);
    expect(siltPlumeCount(HIGH)).toBe(12);
    expect(siltPlumeCount(LOW)).toBe(6);
    expect(siltPlumeCount(HIGH_REDUCED)).toBe(1);
    expect(siltPlumeCount(LOW_REDUCED)).toBe(1);
    let peakHigh = 0;
    let peakLow = 0;
    for (let age = 0; age < SILT_PLUME_LIFE; age += 1 / 120) {
      const high = puffs(age, CX, CY, HIGH).length;
      const low = puffs(age, CX, CY, LOW).length;
      expect(high).toBeLessThanOrEqual(12);
      expect(low).toBeLessThanOrEqual(6);
      expect(puffs(age, CX, CY, HIGH_REDUCED).length).toBeLessThanOrEqual(1);
      peakHigh = Math.max(peakHigh, high);
      peakLow = Math.max(peakLow, low);
    }
    expect(peakHigh).toBe(12);
    expect(peakLow).toBe(6);
  });

  it("Low quality is the first half of the High plume, balanced on both sides", () => {
    for (const age of [0.1, 0.3, 0.5, 0.9]) {
      const high = puffs(age, CX, CY, HIGH);
      const low = puffs(age, CX, CY, LOW);
      expect(low).toEqual(high.slice(0, low.length));
    }
    const low = puffs(0.5, CX, CY, LOW);
    expect(low.filter((p) => p.x < CX)).toHaveLength(3);
    expect(low.filter((p) => p.x > CX)).toHaveLength(3);
  });

  it("starts at the contact, spreads sideways, drifts slightly up and fades", () => {
    const first = puffs(0.13, CX, CY, HIGH);
    expect(first.length).toBeGreaterThan(0);
    for (const p of first) {
      expect(Math.abs(p.x - CX)).toBeLessThan(20);
      expect(p.y).toBeLessThanOrEqual(CY);
      expect(p.y).toBeGreaterThan(CY - 12);
    }
    let prevSpread = 0;
    let prevRise = 0;
    for (const age of [0.2, 0.4, 0.6, 0.8]) {
      const all = puffs(age, CX, CY, HIGH);
      expect(all).toHaveLength(12);
      const spread = Math.max(...all.map((p) => Math.abs(p.x - CX)));
      const rise = Math.max(...all.map((p) => CY - p.y));
      expect(spread).toBeGreaterThan(prevSpread);
      expect(rise).toBeGreaterThanOrEqual(prevRise);
      prevSpread = spread;
      prevRise = rise;
      for (const p of all) {
        // Subtle, bounded and flat: no explosion, nothing below the sand.
        expect(Math.abs(p.x - CX)).toBeLessThanOrEqual(7 + SILT_PUFF_REACH_MAX + 1e-3);
        expect(p.y).toBeLessThanOrEqual(CY);
        expect(CY - p.y).toBeLessThanOrEqual(5 + SILT_PUFF_RISE_MAX + 1e-3);
        expect(p.rx).toBeGreaterThanOrEqual(SILT_PUFF_RADIUS_START_MIN - 1e-3);
        expect(p.rx).toBeLessThanOrEqual(SILT_PUFF_RADIUS_END_MAX + 1e-3);
        expect(p.ry).toBeCloseTo(p.rx * SILT_PUFF_FLATNESS, 4);
        expect(p.a).toBeGreaterThan(0);
        expect(p.a).toBeLessThanOrEqual(SILT_PUFF_ALPHA_MAX + 1e-6);
      }
    }
    // The last puffs fade below one alpha step and are skipped before the end.
    expect(puffs(0.995, CX, CY, HIGH).length).toBeLessThan(12);
    // Overall opacity falls toward the end of the life.
    const total = (age: number) => puffs(age, CX, CY, HIGH).reduce((s, p) => s + p.a, 0);
    expect(total(0.3)).toBeGreaterThan(total(0.6));
    expect(total(0.6)).toBeGreaterThan(total(0.9));
    expect(total(0.999)).toBeLessThan(0.01);
  });

  it("the puff envelope is 0 outside [0, 1), smooth inside", () => {
    expect(siltPuffFade(-0.01)).toBe(0);
    expect(siltPuffFade(0)).toBe(0);
    expect(siltPuffFade(1)).toBe(0);
    expect(siltPuffFade(NaN)).toBe(0);
    expect(siltPuffFade(0.12)).toBeGreaterThan(0.8);
    for (let l = 0.12; l < 0.99; l += 0.05) {
      expect(siltPuffFade(l + 0.05)).toBeLessThan(siltPuffFade(l));
    }
  });

  it("reduced motion: one static puff at the contact that only fades", () => {
    for (const fx of [HIGH_REDUCED, LOW_REDUCED]) {
      let prev = Infinity;
      let ref: Puff | null = null;
      for (const age of [0, 0.1, 0.5, 0.9, 0.98]) {
        const all = puffs(age, CX, CY, fx);
        expect(all).toHaveLength(1);
        const [p] = all;
        expect(p.a).toBeLessThan(prev);
        expect(p.a).toBeLessThanOrEqual(Math.fround(SILT_STATIC_ALPHA));
        prev = p.a;
        if (ref === null) ref = p;
        // No drift and no growth.
        expect([p.x, p.y, p.rx, p.ry]).toEqual([ref.x, ref.y, ref.rx, ref.ry]);
        expect(p.x).toBe(CX);
        expect(p.y).toBeLessThan(CY);
      }
    }
  });

  it("is deterministic: the same inputs give the same output, without Math.random", () => {
    const random = vi.spyOn(Math, "random");
    for (const fx of ALL_FX) {
      for (const age of [0, 0.1, 0.5, 0.9]) {
        const a = puffs(age, CX, CY, fx);
        puffs(age * 0.5, CX + 13, CY - 7, fx); // something else in between
        expect(puffs(age, CX, CY, fx)).toEqual(a);
        // Translating the contact translates the plume.
        const moved = puffs(age, CX + 100, CY - 50, fx);
        moved.forEach((p, i) => {
          expect(p.x - 100).toBeCloseTo(a[i].x, 3);
          expect(p.y + 50).toBeCloseTo(a[i].y, 3);
        });
      }
    }
    expect(random).not.toHaveBeenCalled();
    const code = landingFxSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const banned of [
      "Math.random",
      "setTimeout",
      "setInterval",
      "requestAnimationFrame",
      "Date.now",
      "performance.now",
      "shadowBlur",
      "filter",
    ]) {
      expect(code).not.toContain(banned);
    }
  });
});

// ----- Drawing -----

describe("silt plume drawing (V4)", () => {
  it("issues no call outside the plume's life", () => {
    for (const fx of ALL_FX) {
      for (const age of [-0.5, -1e-6, SILT_PLUME_LIFE, 2]) {
        const r = recorder();
        drawSiltPlume(r.ctx, age, 500, 600, fx);
        expect(r.calls).toEqual([]);
      }
    }
  });

  it("draws each puff as the cached unit gradient, with balanced state and no blur", () => {
    const r = recorder();
    for (let f = 0; f < 60; f++) drawSiltPlume(r.ctx, f / 60, 500, 600, HIGH);
    // One gradient for the context, however many frames.
    expect(named(r.calls, "createRadialGradient")).toEqual([
      ["createRadialGradient", 0, 0, 0, 0, 0, 1],
    ]);
    for (const [, , color] of named(r.calls, "addColorStop")) {
      expect(color).toMatch(
        new RegExp(`^rgba\\(${SILT_FX_TONE[0]}, ${SILT_FX_TONE[1]}, ${SILT_FX_TONE[2]}, `),
      );
    }
    expect(SILT_FX_THEME.silt(0.5)).toBe(
      `rgba(${SILT_FX_TONE[0]}, ${SILT_FX_TONE[1]}, ${SILT_FX_TONE[2]}, 0.5)`,
    );
    expect(named(r.calls, "save")).toHaveLength(named(r.calls, "restore").length);
    expect(r.calls.some((c) => c[0] === "set shadowBlur" || c[0] === "set filter")).toBe(false);
    expect(named(r.calls, "fillRect").every((c) => c.slice(1).join() === "-1,-1,2,2")).toBe(true);

    const one = recorder();
    drawSiltPlume(one.ctx, 0.5, 500, 600, HIGH);
    expect(plumePuffCount(one.calls)).toBe(12);
    const low = recorder();
    drawSiltPlume(low.ctx, 0.5, 500, 600, LOW);
    expect(plumePuffCount(low.calls)).toBe(6);
    const reduced = recorder();
    drawSiltPlume(reduced.ctx, 0.5, 500, 600, HIGH_REDUCED);
    expect(plumePuffCount(reduced.calls)).toBe(1);
  });
});

// ----- Effects layer: scope (D3), timing (D1) and the jackpot burst -----

describe("Effects layer with V4", () => {
  it("draws the plume on the jackpot landing only from the touchdown, for SILT_PLUME_LIFE", () => {
    for (const [w, h] of VIEWPORTS) {
      const camera = floorCamera(w, h);
      const touch = anchorTouchdown(camera).seconds;
      for (const phase of ["cashed", "bonus"] as const) {
        for (const dt of [-0.3, -0.05, -0.001, 0, 0.1, 0.5, 0.9, 0.999, 1.0, 1.2]) {
          const elapsed = touch + dt;
          if (elapsed < 0) continue;
          vi.spyOn(Math, "random").mockReturnValue(0.5);
          const r = recorder();
          effectsLayer.render(r.ctx, sceneState(phase, { elapsed }), camera, TIME, HIGH);
          const expected = dt >= 0 && dt < SILT_PLUME_LIFE ? puffs(dt, 0, 0, HIGH).length : 0;
          expect(plumePuffCount(r.calls)).toBe(expected);
          if (dt >= 0.1 && dt <= 0.9) expect(expected).toBeGreaterThan(0);
        }
      }
    }
  });

  it("places the plume at the touchdown contact", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    for (const [w, h] of VIEWPORTS) {
      const camera = floorCamera(w, h);
      const { seconds, x, y } = { ...anchorTouchdown(camera) };
      const r = recorder();
      effectsLayer.render(r.ctx, sceneState("cashed", { elapsed: seconds + 0.1 }), camera, TIME);
      const expected = puffs(0.1, x, y, HIGH);
      const drawn = named(r.calls, "translate").map((c) => [c[1], c[2]]);
      expect(drawn).toEqual(expected.map((p) => [p.x, p.y]));
    }
  });

  it("is absent on crash (also the snapped anchor on the sand), cashout, betting and diving", () => {
    for (const [w, h] of VIEWPORTS) {
      for (const worldY of [0, 300, 2500, CHAIN_MAX_DEPTH - 1, CHAIN_MAX_DEPTH]) {
        const camera = floorCamera(w, h, worldY);
        const states: RenderState[] = [
          sceneState("idle", null, worldY),
          sceneState("diving", null, worldY),
          sceneState("cashed", null, worldY), // the player's own cashout: no impact
          sceneState("bonus", null, worldY),
          sceneState("crashed", null, worldY),
          { ...sceneState("crashed", null, worldY), chainSnap: { startedAt: 7, elapsed: 0.77 } },
          sceneState("idle", { elapsed: 0.8 }, worldY), // betting reopened: the landing is over
        ];
        for (const state of states) {
          for (const fx of ALL_FX) {
            const r = recorder();
            effectsLayer.render(r.ctx, state, camera, TIME, fx);
            expect(plumePuffCount(r.calls)).toBe(0);
            expect(named(r.calls, "fillRect").filter((c) => c[1] === -1)).toEqual([]);
          }
        }
      }
    }
  });

  it("reduced motion: one static puff on the landing", () => {
    for (const [w, h] of VIEWPORTS) {
      const camera = floorCamera(w, h);
      const t = anchorTouchdown(camera).seconds;
      for (const fx of [HIGH_REDUCED, LOW_REDUCED]) {
        for (const dt of [0.1, 0.5, 0.9]) {
          vi.spyOn(Math, "random").mockReturnValue(0.5);
          const r = recorder();
          effectsLayer.render(r.ctx, sceneState("bonus", { elapsed: t + dt }), camera, TIME, fx);
          expect(plumePuffCount(r.calls)).toBe(1);
        }
      }
    }
  });

  it("keeps the jackpot burst exactly as before, drawn on top of the plume", () => {
    let seed = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (seed++ * 0.6180339887) % 1);
    for (const [w, h] of VIEWPORTS) {
      const camera = floorCamera(w, h);
      const touch = { ...anchorTouchdown(camera) };
      for (const elapsed of [0, 0.2, touch.seconds + 0.1, touch.seconds + 0.5, 1.3, 1.6]) {
        const state = sceneState("cashed", { elapsed });
        seed = 0;
        const now = recorder();
        effectsLayer.render(now.ctx, state, camera, TIME, HIGH);
        seed = 0;
        const ref = recorder();
        drawSiltPlume(ref.ctx, elapsed - touch.seconds, touch.x, touch.y, HIGH);
        if (elapsed < SHIP_IMPACT_FX_SECONDS) {
          const p = anchorPose(CHAIN_MAX_DEPTH, camera, TIME.animTime, elapsed);
          drawShipImpact(ref.ctx, p.x, p.y, w, h, elapsed, elapsed / SHIP_IMPACT_FX_SECONDS);
        }
        expect(normalise(now.calls)).toEqual(normalise(ref.calls));
      }
    }
  });

  it("is deterministic frame for frame (the burst's permitted jitter fixed)", () => {
    const camera = floorCamera(1280, 720);
    const t = anchorTouchdown(camera).seconds;
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    for (const dt of [0.1, 0.5, 0.9]) {
      const state = sceneState("cashed", { elapsed: t + dt });
      const a = recorder();
      effectsLayer.render(a.ctx, state, camera, TIME, HIGH);
      const b = recorder();
      effectsLayer.render(b.ctx, state, camera, TIME, HIGH);
      expect(normalise(b.calls)).toEqual(normalise(a.calls));
    }
  });
});
