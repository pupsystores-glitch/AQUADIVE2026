// Session FX forwarding (Sprint 5 / Phase 7, step V1; docs/08 §4.2, §5).
// Node env, the rAF host stubbed as in session.test.ts. The session forwards
// `crashed` → trigger("crash") and `bettingOpened` → trigger("reset") to the
// attached renderer only, exactly once per event, before that frame renders;
// a renderer without trigger, or one whose trigger throws, changes nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineStateName, RoundAuthority } from "@/engine";
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

const runUntil = (session: ReturnType<typeof makeSession>, state: EngineStateName, cap = 20000) => {
  for (let i = 0; i < cap && session.engine.state !== state; i++) fire();
  expect(session.engine.state).toBe(state);
};

describe("session → renderer FX forwarding (V1)", () => {
  it("forwards crashed → crash and bettingOpened → reset, once each, before that frame renders", () => {
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    const crashed = vi.fn();
    const opened = vi.fn();
    session.engine.events.on("crashed", crashed);
    session.engine.events.on("bettingOpened", opened);
    session.attachCanvas(canvas);
    runUntil(session, "crashed");
    const crashAt = log.indexOf("trigger:crash");
    expect(crashAt).toBeGreaterThanOrEqual(0);
    expect(log[crashAt + 1]).toBe("frame:crashed"); // stamped on the first crashed frame
    runUntil(session, "betting");
    const triggers = log.filter((l) => l.startsWith("trigger:"));
    expect(triggers).toEqual(["trigger:crash", "trigger:reset"]);
    expect(crashed).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    const resetAt = log.indexOf("trigger:reset");
    expect(log[resetAt + 1]).toBe("frame:idle");
  });

  it("forwards every round: one crash and one reset per round", () => {
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    session.attachCanvas(canvas);
    for (let round = 0; round < 3; round++) {
      runUntil(session, "crashed");
      runUntil(session, "betting");
    }
    expect(log.filter((l) => l.startsWith("trigger:"))).toEqual([
      "trigger:crash",
      "trigger:reset",
      "trigger:crash",
      "trigger:reset",
      "trigger:crash",
      "trigger:reset",
    ]);
  });

  it("forwards nothing while detached, and only to the current renderer after a remount", () => {
    const first: Log = [];
    const second: Log = [];
    const logs = [first, second];
    let mounts = 0;
    const session = makeSession(() => recordingRenderer(logs[mounts++]));
    const detach = session.attachCanvas(canvas);
    detach();
    // Advance the engine while detached (as a hidden tab would not, but tests may).
    for (let i = 0; i < 20000 && session.engine.state !== "crashed"; i++)
      session.engine.advance(1 / 60);
    expect(session.engine.state).toBe("crashed");
    expect(first.filter((l) => l.startsWith("trigger:"))).toEqual([]);
    session.attachCanvas(canvas);
    runUntil(session, "betting");
    runUntil(session, "crashed");
    expect(first.filter((l) => l.startsWith("trigger:"))).toEqual([]);
    expect(second.filter((l) => l.startsWith("trigger:"))).toEqual([
      "trigger:reset",
      "trigger:crash",
    ]);
  });

  it("a renderer without trigger, or with a throwing trigger, keeps the loop and settlement running", () => {
    for (const extra of [
      { trigger: undefined },
      {
        trigger: () => {
          throw new Error("fx failure");
        },
      },
    ]) {
      const log: Log = [];
      const session = makeSession(() => recordingRenderer(log, extra));
      session.attachCanvas(canvas);
      const balance = session.wallet.get().balance;
      runUntil(session, "crashed");
      runUntil(session, "betting");
      runUntil(session, "diving");
      expect(log.filter((l) => l.startsWith("trigger:"))).toEqual([]);
      expect(log.at(-1)).toBe("frame:diving");
      expect(session.wallet.get().balance).toBe(balance);
    }
  });
});
