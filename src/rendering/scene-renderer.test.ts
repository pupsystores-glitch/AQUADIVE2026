// E-X7 — SceneRenderer's renderer-owned chain-snap timing. The layers are
// replaced by recorders so only the state each frame hands them is observed:
// no chainSnap outside crashed (and the state object passes through
// untouched), one latch per crash on the first rendered crashed frame, the
// settled result after a remount mid-crash, a caller-supplied chainSnap
// winning over the renderer's own clock, and no per-frame allocation.
// Since V1 also: the FX queue's crash entry shares the chain-snap break time
// (one crash clock), triggers leave the chain-snap timing unchanged, the
// queue resets for the next round, and the motion / quality flags are inert.
// Since V2 also: every layer receives the renderer's FX settings as one
// reused, read-only object (D-V2-1) that follows setMotion / setQuality.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderState } from "./render-state";

const { seen, fxSeen, idle } = vi.hoisted(() => {
  const fxSeen: Array<{ layer: string; fx: unknown }> = [];
  return {
    seen: [] as RenderState[],
    fxSeen,
    idle: (name: string) => ({
      [name]: {
        name,
        render: (_c: unknown, _s: unknown, _cam: unknown, _t: unknown, fx: unknown) => {
          fxSeen.push({ layer: name, fx });
        },
      },
    }),
  };
});
vi.mock("./layers/background", () => idle("backgroundLayer"));
vi.mock("./layers/environment", () => idle("environmentLayer"));
vi.mock("./layers/world", () => idle("worldLayer"));
vi.mock("./layers/effects", () => idle("effectsLayer"));
vi.mock("./layers/actor", () => ({
  actorLayer: {
    name: "actor",
    render: (_c: unknown, s: RenderState, _cam: unknown, _t: unknown, fx: unknown) => {
      seen.push(s);
      fxSeen.push({ layer: "actorLayer", fx });
    },
  },
}));

import { CHAIN_SNAP_SETTLE_SECONDS } from "./layers/chain-snap";
import { SceneRenderer } from "./scene-renderer";

function renderer(): SceneRenderer {
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = new SceneRenderer(canvas);
  r.resize(390, 844, 1);
  return r;
}

function engineState(phase: RenderState["phase"], worldY = 2000): RenderState {
  return {
    phase,
    worldY,
    depthRatio: 0.4,
    boost: 0,
    creatures: [],
    crashed: phase === "crashed",
    shipImpact: null,
  };
}

const frame = (r: SceneRenderer, s: RenderState, animTime: number) => {
  r.frame(s, { animTime, frameDt: 1 / 60 });
  return seen[seen.length - 1];
};

describe("SceneRenderer chain-snap timing", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("passes non-crashed states through untouched, without chainSnap", () => {
    const r = renderer();
    const s = engineState("diving");
    const v = frame(r, s, 1);
    expect(v).toBe(s);
    expect(v.chainSnap).toBeUndefined();
  });

  it("latches on the first rendered crashed frame and does not re-trigger", () => {
    const r = renderer();
    frame(r, engineState("diving"), 9.98);
    const crashed = engineState("crashed");
    const a = frame(r, crashed, 10);
    expect(a.chainSnap).toEqual({ startedAt: 10, elapsed: 0 });
    expect(a.worldY).toBe(2000);
    expect(a.crashed).toBe(true);
    const b = frame(r, crashed, 11.25);
    expect(b.chainSnap?.startedAt).toBe(10);
    expect(b.chainSnap?.elapsed).toBeCloseTo(1.25, 12);
    // One reused object frame to frame: no per-frame allocation.
    expect(b).toBe(a);
    expect(b.chainSnap).toBe(a.chainSnap);
  });

  it("resets after the crash, and latches again in the next crashed round", () => {
    const r = renderer();
    frame(r, engineState("diving"), 1);
    frame(r, engineState("crashed"), 2);
    expect(frame(r, engineState("idle"), 4.4).chainSnap).toBeUndefined();
    frame(r, engineState("diving", 500), 9.5);
    const v = frame(r, engineState("crashed", 500), 10);
    expect(v.chainSnap).toEqual({ startedAt: 10, elapsed: 0 });
    expect(v.worldY).toBe(500);
  });

  it("after a remount mid-crash shows the settled result", () => {
    const r = renderer(); // fresh renderer: its first frame is already crashed
    const v = frame(r, engineState("crashed"), 30);
    expect(v.chainSnap?.elapsed).toBeCloseTo(CHAIN_SNAP_SETTLE_SECONDS, 12);
  });

  it("uses a caller-supplied chainSnap instead of running its own clock", () => {
    const r = renderer();
    frame(r, engineState("diving"), 1);
    const supplied: RenderState = {
      ...engineState("crashed"),
      chainSnap: { startedAt: 0.5, elapsed: 0.7 },
    };
    expect(frame(r, supplied, 1.2)).toBe(supplied);
  });
});

// V1 (docs/08 §4.2): the FX queue reuses the E-X7 break time — one crash clock.
describe("SceneRenderer FX queue (V1)", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("stamps a crash trigger with the chain-snap break time, every frame", () => {
    const r = renderer();
    frame(r, engineState("diving"), 9.98);
    r.trigger("crash"); // the session forwards `crashed` before the frame renders
    for (const t of [10, 10.5, 11.25, 12.29]) {
      const v = frame(r, engineState("crashed"), t);
      expect(r.activeFx("crash")?.startedAt).toBe(v.chainSnap?.startedAt);
      expect(r.activeFx("crash")?.elapsed).toBe(v.chainSnap?.elapsed);
    }
    expect(r.activeFx("crash")?.startedAt).toBe(10);
    frame(r, engineState("crashed"), 10 + CHAIN_SNAP_SETTLE_SECONDS);
    expect(r.activeFx("crash")).toBeNull();
  });

  it("chain-snap timing is identical with or without triggers, including duplicates", () => {
    const script = (withTriggers: boolean) => {
      seen.length = 0;
      const r = renderer();
      const out: unknown[] = [];
      for (const [phase, t] of [
        ["diving", 1],
        ["crashed", 2],
        ["crashed", 2.5],
        ["crashed", 4.4],
        ["idle", 4.5],
        ["diving", 9.5],
        ["crashed", 10],
        ["crashed", 11],
      ] as const) {
        if (withTriggers && phase === "crashed") r.trigger("crash");
        if (withTriggers && phase === "idle") r.trigger("reset");
        const v = frame(r, engineState(phase), t);
        out.push(v.chainSnap ? { ...v.chainSnap } : null);
      }
      return out;
    };
    expect(script(true)).toEqual(script(false));
  });

  it("resets for the next round and stamps the next crash freshly", () => {
    const r = renderer();
    frame(r, engineState("diving"), 1);
    r.trigger("crash");
    frame(r, engineState("crashed"), 2);
    r.trigger("reset");
    frame(r, engineState("idle"), 4.4);
    expect(r.activeFx("crash")).toBeNull();
    expect(r.activeFx("reset")).toEqual({ kind: "reset", startedAt: 4.4, elapsed: 0 });
    frame(r, engineState("diving"), 9.5);
    r.trigger("crash");
    frame(r, engineState("crashed"), 10);
    expect(r.activeFx("crash")).toEqual({ kind: "crash", startedAt: 10, elapsed: 0 });
  });

  it("a fresh renderer mid-crash (remount) has no crash FX and shows the settled break", () => {
    const r = renderer();
    const v = frame(r, engineState("crashed"), 30);
    expect(v.chainSnap?.elapsed).toBeCloseTo(CHAIN_SNAP_SETTLE_SECONDS, 12);
    expect(r.activeFx("crash")).toBeNull();
  });

  it("uses a caller-supplied chainSnap as the crash timestamp", () => {
    const r = renderer();
    frame(r, engineState("diving"), 1);
    r.trigger("crash");
    frame(r, { ...engineState("crashed"), chainSnap: { startedAt: 0.5, elapsed: 0.7 } }, 1.2);
    expect(r.activeFx("crash")?.startedAt).toBe(0.5);
  });

  it("motion and quality flags are stored, default off/high, and change no state; shake stays 0", () => {
    const r = renderer();
    expect(r.fxSettings()).toEqual({ reducedMotion: false, quality: "high", shakeOffset: 0 });
    r.setMotion({ reducedMotion: true });
    r.setQuality("low");
    (r as unknown as { setQuality(q: string): void }).setQuality("ultra"); // ignored
    const s = engineState("diving");
    expect(frame(r, s, 1)).toBe(s);
    expect(r.fxSettings()).toEqual({ reducedMotion: true, quality: "low", shakeOffset: 0 });
    r.trigger("crash");
    frame(r, engineState("crashed"), 2);
    expect(r.fxSettings().shakeOffset).toBe(0);
  });
});

// V2 (D-V2-1, option E): the FX settings reach the layers as an extra argument.
describe("SceneRenderer FX settings forwarding (V2)", () => {
  beforeEach(() => {
    seen.length = 0;
    fxSeen.length = 0;
  });

  it("hands every layer the same reused settings object, every frame", () => {
    const r = renderer();
    frame(r, engineState("diving"), 1);
    expect(fxSeen.map((e) => e.layer)).toEqual([
      "backgroundLayer",
      "environmentLayer",
      "worldLayer",
      "actorLayer",
      "effectsLayer",
    ]);
    const first = fxSeen[0].fx;
    expect(first).toEqual({ reducedMotion: false, quality: "high", reset: null });
    frame(r, engineState("diving"), 1.016);
    frame(r, engineState("crashed"), 1.032);
    expect(fxSeen).toHaveLength(15);
    for (const e of fxSeen) expect(e.fx).toBe(first); // one object: no per-frame allocation
  });

  it("the object follows setMotion / setQuality and matches fxSettings()", () => {
    const r = renderer();
    frame(r, engineState("diving"), 1);
    const fx = fxSeen[0].fx as { reducedMotion: boolean; quality: string };
    r.setMotion({ reducedMotion: true });
    r.setQuality("low");
    (r as unknown as { setQuality(q: string): void }).setQuality("ultra"); // ignored
    frame(r, engineState("diving"), 1.016);
    expect(fxSeen[fxSeen.length - 1].fx).toBe(fx);
    expect(fx).toEqual({ reducedMotion: true, quality: "low", reset: null });
    expect(r.fxSettings()).toEqual({ reducedMotion: true, quality: "low", shakeOffset: 0 });
    r.setMotion({ reducedMotion: false });
    r.setQuality("high");
    expect(fx).toEqual({ reducedMotion: false, quality: "high", reset: null });
  });

  it("carries no engine state: the RenderState passes through untouched", () => {
    const r = renderer();
    r.setQuality("low");
    const s = engineState("diving");
    const before = JSON.stringify(s);
    expect(frame(r, s, 1)).toBe(s);
    expect(JSON.stringify(s)).toBe(before);
    expect("fx" in s).toBe(false);
  });
});
