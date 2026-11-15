// Session audio integration tests (Sprint 5 / Phase 7, step A4b; docs/08
// §3.3, §7, §14 risk 14; docs/07 §8). Node env.
//
// The real session with an injected audio seam: a fake context, a fake
// browser environment, in-memory settings storage, and (where a test needs
// it) a recording or failing director. The rAF host is stubbed as in
// session.test.ts. Checks: the session stays SSR-safe; audio is fed from
// the driver sink with no extra engine read; settings apply before the
// unlock; listeners follow attach/detach; no audio failure stops the frame
// loop or changes settlement; dispose() ends audio only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioDirector, AudioFrame } from "@/audio/director";
import { createAudioDirector } from "@/audio/director";
import { createAudioManager } from "@/audio/audio-manager";
import { FakeAudioContext } from "@/audio/test/fake-audio-context";
import type { EngineStateName, RoundAuthority } from "@/engine";
import { DEFAULT_BET } from "@/game/constants";
import type { AudioEnvironment, AudioEventTarget } from "./audio-host";
import { createGameSession, type CanvasRenderer, type GameSessionDeps } from "./session";
import { SOUND_SETTINGS_STORAGE_KEY } from "./store/sound-settings-store";

const stubAuthority = (crashPoint = 2): RoundAuthority => ({
  sampleCrashPoint: () => crashPoint,
  sampleJackpot: () => 100,
  rollBonusChests: () => [
    { id: 0, multiplier: 2, opened: false },
    { id: 1, multiplier: 6.5, opened: false },
    { id: 2, multiplier: 30, opened: false },
  ],
});

// ----- stubbed rAF + window host (as in session.test.ts) -----
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
  host.window = { devicePixelRatio: 2 };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete host.requestAnimationFrame;
  delete host.cancelAnimationFrame;
  delete host.window;
  vi.restoreAllMocks();
});

const fire = (stepMs = 1000 / 60) => {
  now += stepMs;
  const callbacks = [...pending.values()];
  pending.clear();
  for (const cb of callbacks) cb(now);
};

class FakeTarget implements AudioEventTarget {
  readonly listeners = new Map<string, Set<() => void>>();
  visibilityState = "visible";
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  count(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

interface HarnessOptions {
  stored?: string;
  director?: (real: AudioDirector) => AudioDirector;
  crashPoint?: number;
}

const makeHarness = (opts: HarnessOptions = {}) => {
  const win = new FakeTarget();
  const doc = new FakeTarget();
  const contexts: FakeAudioContext[] = [];
  const reads: string[] = [];
  const data = new Map<string, string>(
    opts.stored === undefined ? [] : [[SOUND_SETTINGS_STORAGE_KEY, opts.stored]],
  );
  let environments = 0;
  const frames: AudioFrame[] = [];
  const plays: string[] = [];
  const deps: GameSessionDeps = {
    authority: stubAuthority(opts.crashPoint),
    worldRng: { next: () => 0.5 },
    createRenderer: (): CanvasRenderer => ({
      resize: () => {},
      frame: () => {},
      dispose: () => {},
    }),
    soundSettingsStorage: () => ({
      getItem: (key) => {
        reads.push(key);
        return data.get(key) ?? null;
      },
      setItem: (key, value) => void data.set(key, value),
    }),
    audio: {
      createContext: () => {
        const context = new FakeAudioContext();
        contexts.push(context);
        return context;
      },
      createManager: (options) => {
        const manager = createAudioManager(options);
        const play = manager.play.bind(manager);
        manager.play = (cue, o) => {
          plays.push(cue);
          play(cue, o);
        };
        return manager;
      },
      environment: (): AudioEnvironment => {
        environments++;
        return { window: win, document: doc };
      },
      createDirector: (events, audio) => {
        const real = createAudioDirector(events, audio);
        const recorded: AudioDirector = {
          ...real,
          update: (frame) => {
            frames.push({ ...frame });
            real.update(frame);
          },
        };
        return opts.director ? opts.director(recorded) : recorded;
      },
    },
  };
  const session = createGameSession(deps);
  const canvas = { clientWidth: 375, clientHeight: 667 } as HTMLCanvasElement;
  return {
    session,
    canvas,
    win,
    doc,
    contexts,
    reads,
    frames,
    plays,
    environments: () => environments,
  };
};

const runUntil = (h: ReturnType<typeof makeHarness>, state: EngineStateName, cap = 20000) => {
  for (let i = 0; i < cap && h.session.engine.state !== state; i++) fire();
  expect(h.session.engine.state).toBe(state);
};

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe("session audio — construction stays SSR-safe", () => {
  it("constructs no context, reads no storage, resolves no environment, starts no frame", () => {
    const h = makeHarness({ stored: JSON.stringify({ version: 1, muted: true }) });
    expect(h.contexts).toHaveLength(0);
    expect(h.reads).toHaveLength(0);
    expect(h.environments()).toBe(0);
    expect(pending.size).toBe(0);
    expect(h.session.soundSettings.get().muted).toBe(false); // not restored until a canvas attaches
  });

  it("the production module imports with no window, document, AudioContext or storage, and builds no context", async () => {
    delete host.window;
    const contextCtor = vi.fn();
    const fetchSpy = vi.fn();
    vi.stubGlobal("AudioContext", contextCtor);
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    const mod = await import("@/ui/session");
    expect(mod.gameSession.audio).toBeDefined();
    expect(mod.gameSession.soundSettings.get().muted).toBe(false);
    expect(contextCtor).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("session audio — the driver sink feeds the director", () => {
  it("one AudioFrame per rendered frame, from the sink's own projections; no extra getPublicState()", () => {
    const h = makeHarness();
    const reads = vi.spyOn(h.session.engine, "getPublicState");
    h.session.attachCanvas(h.canvas);
    expect(reads).toHaveBeenCalledTimes(1); // the attach write, as before A4b
    fire();
    fire();
    fire();
    expect(reads).toHaveBeenCalledTimes(4); // one per frame, as before A4b
    expect(h.frames).toHaveLength(3);
    const state = h.session.engine.getPublicState();
    const render = h.session.engine.getRenderState();
    const last = h.frames.at(-1)!;
    expect(last.phase).toBe(state.phase);
    expect(last.multiplier).toBe(state.multiplier);
    expect(last.boost).toBe(state.boost);
    expect(last.depthRatio).toBe(render.depthRatio);
    expect(last.dt).toBe(h.session.engine.getRenderTime().frameDt);
  });

  it("the round store is written before audio, and keeps the frame's state", () => {
    const order: string[] = [];
    const h = makeHarness({
      director: (d) => ({
        ...d,
        update: (f) => {
          order.push(`audio:${h.session.round.get().countdownSeconds}`);
          d.update(f);
        },
      }),
    });
    h.session.attachCanvas(h.canvas);
    fire();
    fire(100);
    expect(order).toHaveLength(2);
    expect(order[1]).toBe(`audio:${h.session.engine.getPublicState().countdownSeconds}`);
  });

  it("a crash round reaches the manager as cues through the session, in order, each once", async () => {
    const h = makeHarness({ crashPoint: 2 });
    h.session.attachCanvas(h.canvas);
    fire(0);
    h.win.dispatch("pointerdown");
    await flush();
    const ctx = h.contexts[0];
    expect(ctx.state).toBe("running");
    h.session.submit({ type: "placeBet", slot: 0, amount: DEFAULT_BET });
    runUntil(h, "diving");
    runUntil(h, "crashed");
    expect(h.plays).toEqual([
      "bet-clink-1",
      "chain-unspool",
      "water-splash",
      // No creak: the chain snaps on the frame the multiplier reaches 2×, and
      // tension counts only while diving (§7.4).
      "chain-snap",
      "crash-boom",
    ]);
    // Null assets (A6 pending): no source beyond the unlock prime.
    expect(ctx.sources.filter((s) => s.loop)).toEqual([]);
  });
});

describe("session audio — settings before unlock (docs/08 §14 risk 14)", () => {
  it("a persisted mute is restored on attach and applied before the first gesture unlocks", async () => {
    const h = makeHarness({
      stored: JSON.stringify({ version: 1, muted: true, master: 1, music: 1, ambience: 1, sfx: 1 }),
    });
    h.session.attachCanvas(h.canvas);
    expect(h.reads).toEqual([SOUND_SETTINGS_STORAGE_KEY]);
    expect(h.session.soundSettings.get().muted).toBe(true);
    expect(h.contexts).toHaveLength(0);
    h.win.dispatch("pointerdown");
    await flush();
    expect(h.contexts).toHaveLength(1);
    expect(h.contexts[0].state).toBe("suspended"); // muted: never left running
    h.session.soundSettings.setMuted(false);
    await flush();
    expect(h.contexts[0].state).toBe("running");
  });

  it("the restore runs once per session, not per attach", () => {
    const h = makeHarness();
    h.session.attachCanvas(h.canvas)();
    h.session.attachCanvas(h.canvas)();
    h.session.attachCanvas(h.canvas);
    expect(h.reads).toHaveLength(1);
  });
});

describe("session audio — attach / detach lifecycle", () => {
  it("attachCanvas installs the listeners once; detach removes them all and pauses the director", () => {
    let pauses = 0;
    const h = makeHarness({
      director: (d) => ({
        ...d,
        pause: () => {
          pauses++;
          d.pause();
        },
      }),
    });
    expect(pauses).toBe(1); // paused at construction
    const detach = h.session.attachCanvas(h.canvas);
    expect(h.win.count()).toBe(5);
    expect(h.doc.count()).toBe(1);
    detach();
    expect(h.win.count() + h.doc.count()).toBe(0);
    expect(pauses).toBe(2);
    fire();
    expect(h.frames).toHaveLength(0);
  });

  it("StrictMode order (attach, detach, attach) and remounts leave exactly one listener set and one sink", () => {
    const h = makeHarness();
    const first = h.session.attachCanvas(h.canvas);
    first();
    const second = h.session.attachCanvas(h.canvas);
    expect(h.win.count()).toBe(5);
    expect(h.doc.count()).toBe(1);
    fire();
    expect(pending.size).toBe(1);
    expect(h.frames).toHaveLength(1);
    second();
    const third = h.session.attachCanvas(h.canvas);
    expect(h.win.count()).toBe(5);
    third();
    expect(h.win.count() + h.doc.count()).toBe(0);
  });

  it("subscribes to the engine bus only at construction (no per-attach engine subscription)", () => {
    const h = makeHarness();
    const on = vi.spyOn(h.session.engine.events, "on");
    h.session.attachCanvas(h.canvas)();
    h.session.attachCanvas(h.canvas);
    fire();
    expect(on).not.toHaveBeenCalled();
  });
});

describe("session audio — no audio failure reaches rendering or settlement", () => {
  const throwing = (): ((real: AudioDirector) => AudioDirector) => () => {
    const boom = () => {
      throw new Error("audio exploded");
    };
    return { update: boom, pause: boom, wake: boom, dispose: boom };
  };

  it("a director that throws every frame never stops requestAnimationFrame", () => {
    const h = makeHarness({ director: throwing() });
    const detach = h.session.attachCanvas(h.canvas);
    for (let i = 0; i < 120; i++) {
      fire();
      expect(pending.size).toBe(1);
    }
    expect(h.session.round.get()).toEqual(h.session.engine.getPublicState());
    expect(() => detach()).not.toThrow();
    expect(() => h.session.dispose()).not.toThrow();
  });

  it("settlement over a full round is identical with a failing audio subsystem", () => {
    const play = (director?: (real: AudioDirector) => AudioDirector) => {
      const h = makeHarness({ director, crashPoint: 2 });
      h.session.attachCanvas(h.canvas);
      fire(0);
      h.win.dispatch("pointerdown");
      h.session.submit({ type: "placeBet", slot: 0, amount: DEFAULT_BET });
      runUntil(h, "diving");
      runUntil(h, "crashed");
      runUntil(h, "betting");
      return h.session.wallet.get();
    };
    const healthy = play();
    const failing = play(throwing());
    expect(failing).toEqual(healthy);
    expect(failing.history.length).toBeGreaterThan(0);
  });

  it("a gesture listener never throws, even when the audio stack is broken", () => {
    const h = makeHarness({ director: throwing() });
    h.session.attachCanvas(h.canvas);
    expect(() => h.win.dispatch("pointerdown")).not.toThrow();
    expect(() => h.doc.dispatch("visibilitychange")).not.toThrow();
  });
});

describe("session audio — dispose() ends audio only", () => {
  it("removes the audio listeners and closes the context; engine, wallet, stores, submit and attachCanvas keep working", async () => {
    const h = makeHarness();
    const detach = h.session.attachCanvas(h.canvas);
    fire(0);
    h.win.dispatch("pointerdown");
    await flush();
    h.session.dispose();
    h.session.dispose();
    expect(h.win.count() + h.doc.count()).toBe(0);
    expect(h.contexts[0].closeCalls).toBe(1);
    // The frame loop continues; the session still plays rounds.
    const frames = h.frames.length;
    h.session.submit({ type: "placeBet", slot: 0, amount: DEFAULT_BET });
    runUntil(h, "diving");
    expect(h.frames.length).toBe(frames); // no audio frame after dispose
    expect(h.session.wallet.get().slots[0].participating).toBe(true);
    detach();
    h.session.attachCanvas(h.canvas);
    expect(h.win.count()).toBe(0); // silent re-attach
    fire();
    expect(pending.size).toBe(1);
  });
});
