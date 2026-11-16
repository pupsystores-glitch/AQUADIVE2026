// V1 — FX queue, camera shake hook, motion / quality flags (docs/08 §4.2,
// §11). Pure tests of the queue (trigger → stamp → expiry → removal on the
// animation clock, one shared crash timestamp), the camera's shake offset,
// and a draw-call equivalence check through the real layers: V1's calls
// change no pixel of normal gameplay or of the E-X7 Chain Snapped animation.
import { describe, expect, it } from "vitest";
import { Camera } from "./camera";
import { cameraShakeOffset, FX_LIFETIME_SECONDS, FxQueue } from "./fx-queue";
import { CHAIN_SNAP_SETTLE_SECONDS } from "./layers/chain-snap";
import type { RenderState } from "./render-state";
import { SceneRenderer } from "./scene-renderer";

describe("FxQueue — reset entries", () => {
  it("stamps a trigger on the next update's animTime, ages it, and removes it at its lifetime", () => {
    const q = new FxQueue();
    q.trigger("reset");
    expect(q.active("reset")).toBeNull(); // not stamped until a frame
    q.update(5, null);
    expect(q.active("reset")).toEqual({ kind: "reset", startedAt: 5, elapsed: 0 });
    q.update(5.25, null);
    expect(q.active("reset")?.elapsed).toBeCloseTo(0.25, 12);
    q.update(5 + FX_LIFETIME_SECONDS.reset, null);
    expect(q.active("reset")).toBeNull();
    q.update(6, null);
    expect(q.active("reset")).toBeNull(); // removed, not revived
  });

  it("is deterministic: the same trigger/update script gives the same entries", () => {
    const run = () => {
      const q = new FxQueue();
      const out: unknown[] = [];
      q.trigger("reset");
      for (const t of [1, 1.1, 1.2, 1.3, 1.45]) {
        q.update(t, null);
        const e = q.active("reset");
        out.push(e && { ...e });
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("a re-trigger restarts the entry; a backwards clock drops it", () => {
    const q = new FxQueue();
    q.trigger("reset");
    q.update(2, null);
    q.trigger("reset");
    q.update(2.2, null);
    expect(q.active("reset")?.startedAt).toBe(2.2);
    q.update(1, null); // clock moved backwards (remount or test clock)
    expect(q.active("reset")).toBeNull();
  });

  it("ignores non-finite animTime and unknown kinds; clear() drops everything", () => {
    const q = new FxQueue();
    q.trigger("reset");
    q.update(Number.NaN, null);
    expect(q.active("reset")).toBeNull();
    q.update(3, null);
    expect(q.active("reset")?.startedAt).toBe(3);
    (q as unknown as { trigger(k: string): void }).trigger("bogus");
    q.update(3.1, null);
    q.clear();
    expect(q.active("reset")).toBeNull();
    q.update(3.2, null);
    expect(q.active("reset")).toBeNull();
  });
});

describe("FxQueue — crash entries share the chain-snap break time", () => {
  it("takes startedAt from the break, never from a clock of its own", () => {
    const q = new FxQueue();
    q.trigger("crash");
    q.update(10, 10);
    expect(q.active("crash")).toEqual({ kind: "crash", startedAt: 10, elapsed: 0 });
    q.update(11, 10);
    expect(q.active("crash")).toEqual({ kind: "crash", startedAt: 10, elapsed: 1 });
    // The break re-latches (backwards clock: settled result) — the entry follows it.
    q.update(4, 4 - CHAIN_SNAP_SETTLE_SECONDS);
    expect(q.active("crash")).toBeNull(); // already past its lifetime on the new timeline
  });

  it("ignores repeated crash triggers during one break — no double crash", () => {
    const q = new FxQueue();
    q.trigger("crash");
    q.update(10, 10);
    for (const t of [0.5, 1, 2.2]) {
      q.trigger("crash");
      q.update(10 + t, 10);
      expect(q.active("crash")?.startedAt).toBe(10);
      expect(q.active("crash")?.elapsed).toBeCloseTo(t, 12);
    }
    q.update(10 + CHAIN_SNAP_SETTLE_SECONDS, 10);
    expect(q.active("crash")).toBeNull(); // expired; no duplicate restarted it
    q.trigger("crash");
    q.update(12.4, 10);
    expect(q.active("crash")).toBeNull(); // retired until the break ends
  });

  it("expires at its lifetime, which matches the E-X7 settle time", () => {
    expect(FX_LIFETIME_SECONDS.crash).toBe(CHAIN_SNAP_SETTLE_SECONDS);
    const q = new FxQueue();
    q.trigger("crash");
    q.update(10, 10);
    q.update(10 + CHAIN_SNAP_SETTLE_SECONDS - 0.01, 10);
    expect(q.active("crash")).not.toBeNull();
    q.update(10 + CHAIN_SNAP_SETTLE_SECONDS, 10);
    expect(q.active("crash")).toBeNull();
  });

  it("drops a stale trigger when the next frame has no break", () => {
    const q = new FxQueue();
    q.trigger("crash");
    q.update(10, null);
    q.update(10.1, 10.1); // a later break without a trigger (e.g. a remount) adds no entry
    expect(q.active("crash")).toBeNull();
  });

  it("ends with the break and works again in the next round", () => {
    const q = new FxQueue();
    q.trigger("crash");
    q.update(10, 10);
    q.update(11, null); // left crashed
    expect(q.active("crash")).toBeNull();
    q.trigger("reset");
    q.update(12.5, null);
    q.trigger("crash");
    q.update(40, 40);
    expect(q.active("crash")).toEqual({ kind: "crash", startedAt: 40, elapsed: 0 });
  });
});

describe("camera shake hook", () => {
  it("cameraShakeOffset is 0 in V1, with and without reduced motion", () => {
    const q = new FxQueue();
    q.trigger("crash");
    q.trigger("reset");
    for (const t of [10, 10.05, 10.15, 10.3, 11, 12.3]) {
      q.update(t, 10);
      expect(cameraShakeOffset(q, t, false)).toBe(0);
      expect(cameraShakeOffset(q, t, true)).toBe(0);
    }
  });

  it("the camera's shake offset defaults to 0, is additive, and rejects non-finite values", () => {
    const c = new Camera();
    c.setViewport(390, 844);
    c.follow(1200);
    const base = c.worldToScreenY(1500);
    expect(c.shakeOffset).toBe(0);
    c.setShake(3);
    expect(c.worldToScreenY(1500)).toBe(base + 3);
    c.setShake(Number.NaN);
    expect(c.shakeOffset).toBe(0);
    expect(c.worldToScreenY(1500)).toBe(base);
    c.setShake(0);
    expect(c.worldToScreenY(1500)).toBe(base);
  });
});

// ----- Draw-call equivalence through the real layers -----

/** A 2D context that records every call and property write, in order. */
function recordingContext(log: string[]): unknown {
  const make = (tag: string): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "canvas") return { width: 390, height: 844 };
          if (prop === "measureText") return () => ({ width: 10 });
          if (prop === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
          return (...args: unknown[]) => {
            log.push(`${tag}.${String(prop)}(${JSON.stringify(args)})`);
            return String(prop).startsWith("create") ? make(`${tag}>${String(prop)}`) : undefined;
          };
        },
        set(_t, prop, value) {
          log.push(`${tag}.${String(prop)}=${JSON.stringify(value)}`);
          return true;
        },
      },
    );
  return make("ctx");
}

const scene = (phase: RenderState["phase"], worldY: number): RenderState => ({
  phase,
  worldY,
  depthRatio: Math.min(1, worldY / 20000),
  boost: 0,
  creatures: [],
  crashed: phase === "crashed",
  shipImpact: null,
});

/**
 * Two crash rounds (idle → dive → crashed at representative times → idle); one draw log per frame.
 * Since V2 the flags are no longer inert (they shape F1 marine snow, draw/particles.test.ts), so
 * they are a separate switch: the queue's triggers stay invisible under either set of flags.
 */
function drawLogs(withV1: boolean, withFlags: boolean = withV1): string[] {
  const log: string[] = [];
  const ctx = recordingContext(log);
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = new SceneRenderer(canvas);
  r.resize(390, 844, 1);
  if (withFlags) {
    r.setMotion({ reducedMotion: true });
    r.setQuality("low");
  }
  const frames: string[] = [];
  const shot = (s: RenderState, t: number) => {
    log.length = 0;
    r.frame(s, { animTime: t, frameDt: 1 / 60 });
    if (withV1) expect(r.fxSettings().shakeOffset).toBe(0);
    frames.push(log.join("\n"));
  };
  const crashOffsets = [0, 1 / 60, 0.1, 0.25, 0.5, 1, 1.2, 1.75, 2.29, 2.3, 2.4];
  for (const [base, y] of [
    [10, 1800],
    [40, 6400],
  ] as const) {
    if (withV1) r.trigger("reset");
    shot(scene("idle", 0), base - 5);
    for (let i = 0; i < 5; i++) shot(scene("diving", y - 50 + i * 10), base - 0.1 + i * 0.02);
    for (const o of crashOffsets) {
      if (withV1) r.trigger("crash"); // the first is the real one, the rest duplicates
      shot(scene("crashed", y), base + o);
      if (withV1) expect(r.activeFx("crash")?.startedAt ?? base).toBe(base);
    }
    shot(scene("idle", 0), base + 2.5);
  }
  return frames;
}

describe("V1 is invisible", () => {
  it("draws exactly the same calls, frame by frame, with triggers, under either motion / quality setting", () => {
    const plain = drawLogs(false, false);
    const fx = drawLogs(true, false);
    expect(fx).toHaveLength(plain.length);
    for (let i = 0; i < plain.length; i++) expect(fx[i]).toBe(plain[i]);
    // V2: the same with reduced motion and low quality on both sides.
    const plainLow = drawLogs(false, true);
    const fxLow = drawLogs(true, true);
    expect(fxLow).toHaveLength(plainLow.length);
    for (let i = 0; i < plainLow.length; i++) expect(fxLow[i]).toBe(plainLow[i]);
    // V2: the flags change nothing at the surface (the first frame of each round is the betting view).
    expect(plainLow[0]).toBe(plain[0]);
    expect(plainLow[17]).toBe(plain[17]);
    // The logs are real drawing, not empty frames.
    expect(plain.every((f) => f.length > 1000)).toBe(true);
  });
});
