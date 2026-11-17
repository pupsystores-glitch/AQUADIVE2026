// Session frame-rendered callbacks (LA1; the startup screen's renderer
// task). Node env, the rAF host stubbed as in session.fx.test.ts. A callback
// runs once, after the next frame a renderer has drawn; cancel works; a
// throwing callback is contained; the frame loop is unaffected.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoundAuthority } from "@/engine";
import { createGameSession, type CanvasRenderer } from "./session";

const stubAuthority = (crashPoint = 2): RoundAuthority => ({
  sampleCrashPoint: () => crashPoint,
  sampleJackpot: () => 100,
  rollBonusChests: () => [
    { id: 0, multiplier: 2, opened: false },
    { id: 1, multiplier: 6.5, opened: false },
    { id: 2, multiplier: 30, opened: false },
  ],
});

const host = globalThis as unknown as {
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  window?: { devicePixelRatio: number };
};
let pending: Map<number, FrameRequestCallback>;
let nextId: number;
let now: number;

beforeEach(() => {
  pending = new Map();
  nextId = 1;
  now = 1000;
  host.requestAnimationFrame = (cb) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  host.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };
  host.window = { devicePixelRatio: 1 };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete host.requestAnimationFrame;
  delete host.cancelAnimationFrame;
  delete host.window;
  vi.restoreAllMocks();
});

const fire = () => {
  now += 1000 / 60;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const cb of callbacks) cb(now);
};

type Log = string[];

/** A renderer that logs its triggers and the phase of every frame it renders. */
const recordingRenderer = (log: Log, extra: Partial<CanvasRenderer> = {}): CanvasRenderer => ({
  resize: () => {},
  frame: (state) => log.push(`frame:${state.phase}`),
  dispose: () => {},
  trigger: (kind) => log.push(`trigger:${kind}`),
  ...extra,
});

const makeSession = (createRenderer: (canvas: HTMLCanvasElement) => CanvasRenderer) =>
  createGameSession({
    authority: stubAuthority(),
    worldRng: { next: () => 0.5 },
    createRenderer,
    audio: { environment: () => null },
  });

const canvas = { clientWidth: 375, clientHeight: 667 } as HTMLCanvasElement;

describe("session — LA1 whenFrameRendered", () => {
  it("calls back once, after the next drawn frame, never before", () => {
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    const calls: number[] = [];
    session.whenFrameRendered(() => calls.push(log.length));
    fire();
    expect(calls).toEqual([]); // no canvas yet: no frame
    session.attachCanvas(canvas);
    fire();
    expect(calls).toEqual([1]); // after exactly one drawn frame
    fire();
    fire();
    expect(calls).toEqual([1]);
  });

  it("a cancelled callback is never called", () => {
    const session = makeSession(() => recordingRenderer([]));
    const callback = vi.fn();
    const cancel = session.whenFrameRendered(callback);
    cancel();
    session.attachCanvas(canvas);
    fire();
    expect(callback).not.toHaveBeenCalled();
  });

  it("a throwing callback is logged; the loop and later callbacks continue", () => {
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    const after = vi.fn();
    session.whenFrameRendered(() => {
      throw new Error("boom");
    });
    session.whenFrameRendered(after);
    session.attachCanvas(canvas);
    fire();
    expect(after).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
    fire();
    expect(log.filter((l) => l.startsWith("frame")).length).toBe(2);
    expect(pending.size).toBe(1);
  });
});
