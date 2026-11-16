// E-X7 — SceneRenderer's renderer-owned chain-snap timing. The layers are
// replaced by recorders so only the state each frame hands them is observed:
// no chainSnap outside crashed (and the state object passes through
// untouched), one latch per crash on the first rendered crashed frame, the
// settled result after a remount mid-crash, a caller-supplied chainSnap
// winning over the renderer's own clock, and no per-frame allocation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderState } from "./render-state";

const { seen, idle } = vi.hoisted(() => ({
  seen: [] as RenderState[],
  idle: (name: string) => ({ [name]: { name, render: () => {} } }),
}));
vi.mock("./layers/background", () => idle("backgroundLayer"));
vi.mock("./layers/environment", () => idle("environmentLayer"));
vi.mock("./layers/world", () => idle("worldLayer"));
vi.mock("./layers/effects", () => idle("effectsLayer"));
vi.mock("./layers/actor", () => ({
  actorLayer: { name: "actor", render: (_c: unknown, s: RenderState) => seen.push(s) },
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
