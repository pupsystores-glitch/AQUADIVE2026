// Session reduced-motion wiring (Sprint 5 / Phase 7, step V7; docs/08 §4.2,
// §12, §13.2). Node env, the rAF host stubbed as in session.fx.test.ts.
// attachCanvas resolves the `(prefers-reduced-motion: reduce)` query, calls
// renderer.setMotion before the first frame, follows `change` events through
// exactly one listener per attached renderer and removes it on detach. The
// session never resolves the query at construction (SSR), tolerates a missing
// or failing matchMedia, does no per-frame work, and changes no gameplay or
// money. The real SceneRenderer receives the flag through its existing setMotion.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoundAuthority } from "@/engine";
import { SceneRenderer } from "@/rendering/scene-renderer";
import {
  createGameSession,
  REDUCED_MOTION_QUERY,
  type CanvasRenderer,
  type GameSessionDeps,
  type ReducedMotionQuery,
} from "./session";

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
  window?: { devicePixelRatio: number; matchMedia?: unknown };
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

const fire = (n = 1) => {
  for (let i = 0; i < n; i++) {
    now += 1000 / 60;
    const callbacks = [...pending.values()];
    pending.clear();
    for (const cb of callbacks) cb(now);
  }
};

/** A controllable MediaQueryList: standard or legacy listener API. */
function fakeQuery(initial: boolean, api: "standard" | "legacy" | "none" = "standard") {
  const listeners = new Set<() => void>();
  const q = {
    matches: initial,
    added: 0,
    removed: 0,
    get active() {
      return listeners.size;
    },
    set(value: boolean) {
      q.matches = value;
      for (const l of [...listeners]) l();
    },
  };
  const add = (l: () => void) => {
    q.added++;
    listeners.add(l);
  };
  const remove = (l: () => void) => {
    if (listeners.delete(l)) q.removed++;
  };
  const query: ReducedMotionQuery & typeof q = Object.assign(q, {});
  if (api === "standard") {
    Object.assign(query, {
      addEventListener: (type: string, l: () => void) => type === "change" && add(l),
      removeEventListener: (type: string, l: () => void) => type === "change" && remove(l),
    });
  } else if (api === "legacy") {
    Object.assign(query, { addListener: add, removeListener: remove });
  }
  return query;
}

type Log = string[];

/** A renderer that logs setMotion calls and the frames it renders. */
const recordingRenderer = (log: Log, extra: Partial<CanvasRenderer> = {}): CanvasRenderer => ({
  resize: () => {},
  frame: () => log.push("frame"),
  dispose: () => log.push("dispose"),
  trigger: () => {},
  setMotion: ({ reducedMotion }) => log.push(`motion:${reducedMotion}`),
  ...extra,
});

const makeSession = (
  createRenderer: (canvas: HTMLCanvasElement) => CanvasRenderer,
  extra: Partial<GameSessionDeps> = {},
) =>
  createGameSession({
    authority: stubAuthority(),
    worldRng: { next: () => 0.5 },
    createRenderer,
    audio: { environment: () => null },
    ...extra,
  });

const canvas = { clientWidth: 375, clientHeight: 667 } as HTMLCanvasElement;

describe("V7: the OS reduced-motion preference reaches the renderer", () => {
  it("queries exactly (prefers-reduced-motion: reduce) through window.matchMedia by default", () => {
    const q = fakeQuery(false);
    const matchMedia = vi.fn(() => q);
    host.window = { devicePixelRatio: 1, matchMedia };
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    expect(matchMedia).not.toHaveBeenCalled(); // never at construction
    const detach = session.attachCanvas(canvas);
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
    detach();
  });

  it("default preference (no-preference): full motion, applied before the first frame", () => {
    const q = fakeQuery(false);
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: () => q });
    session.attachCanvas(canvas);
    fire(3);
    expect(log).toEqual(["motion:false", "frame", "frame", "frame"]);
  });

  it("initial reduce preference: the renderer is reduced before it draws anything", () => {
    const q = fakeQuery(true);
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: () => q });
    session.attachCanvas(canvas);
    fire(2);
    expect(log).toEqual(["motion:true", "frame", "frame"]);
  });

  it("follows live changes normal → reduced → normal, one call per change", () => {
    const q = fakeQuery(false);
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: () => q });
    session.attachCanvas(canvas);
    fire();
    q.set(true);
    fire();
    q.set(false);
    fire();
    expect(log).toEqual(["motion:false", "frame", "motion:true", "frame", "motion:false", "frame"]);
  });

  it("supports the legacy addListener / removeListener API", () => {
    const q = fakeQuery(false, "legacy");
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: () => q });
    const detach = session.attachCanvas(canvas);
    expect(q.active).toBe(1);
    q.set(true);
    expect(log).toEqual(["motion:false", "motion:true"]);
    detach();
    expect(q.active).toBe(0);
    expect(q.removed).toBe(1);
  });

  it("a query with no listener API still applies the initial preference", () => {
    const q = fakeQuery(true, "none");
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: () => q });
    const detach = session.attachCanvas(canvas);
    expect(log).toEqual(["motion:true"]);
    expect(() => detach()).not.toThrow();
  });
});

describe("V7: SSR and unsupported environments", () => {
  it("constructing a session without window touches nothing; attaching works and calls no setMotion", () => {
    delete host.window;
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    expect(session.round.get().phase).toBe(session.engine.getPublicState().phase);
    // The driver reads window.devicePixelRatio per frame, so give it one without matchMedia.
    host.window = { devicePixelRatio: 1 };
    session.attachCanvas(canvas);
    fire(2);
    expect(log).toEqual(["frame", "frame"]);
  });

  it("no window at attach: the default resolver returns null, setMotion is not called", () => {
    delete host.window;
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log));
    const detach = session.attachCanvas(canvas);
    expect(log).toEqual([]);
    detach();
    expect(log).toEqual(["dispose"]);
  });

  it("window without matchMedia, or matchMedia that is not a function: full motion", () => {
    for (const matchMedia of [undefined, null, 42, "x"]) {
      host.window = { devicePixelRatio: 1, matchMedia };
      const log: Log = [];
      const session = makeSession(() => recordingRenderer(log));
      session.attachCanvas(canvas);
      fire();
      expect(log).toEqual(["frame"]);
    }
  });

  it("a throwing matchMedia, a throwing listener API or a throwing setMotion never breaks attach or frames", () => {
    host.window = {
      devicePixelRatio: 1,
      matchMedia: () => {
        throw new Error("blocked");
      },
    };
    const logA: Log = [];
    makeSession(() => recordingRenderer(logA)).attachCanvas(canvas);
    fire();
    expect(logA).toEqual(["frame"]);

    const bad: ReducedMotionQuery = {
      matches: true,
      addEventListener: () => {
        throw new Error("nope");
      },
    };
    const logB: Log = [];
    const detachB = makeSession(() => recordingRenderer(logB), {
      reducedMotion: () => bad,
    }).attachCanvas(canvas);
    fire();
    expect(logB).toEqual(["motion:true", "frame"]);
    expect(() => detachB()).not.toThrow();

    const q = fakeQuery(true);
    const logC: Log = [];
    makeSession(
      () =>
        recordingRenderer(logC, {
          setMotion: () => {
            throw new Error("renderer failure");
          },
        }),
      { reducedMotion: () => q },
    ).attachCanvas(canvas);
    expect(() => q.set(false)).not.toThrow();
    fire();
    expect(logC).toEqual(["frame"]);
  });

  it("a renderer without setMotion: the query is not even resolved, no listener", () => {
    const q = fakeQuery(true);
    const resolver = vi.fn(() => q);
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log, { setMotion: undefined }), {
      reducedMotion: resolver,
    });
    session.attachCanvas(canvas);
    fire();
    expect(resolver).not.toHaveBeenCalled();
    expect(q.added).toBe(0);
    expect(log).toEqual(["frame"]);
  });
});

describe("V7: listener lifecycle", () => {
  it("one listener per attachment, removed on detach; no calls after detach", () => {
    const q = fakeQuery(false);
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: () => q });
    const detach = session.attachCanvas(canvas);
    expect(q.added).toBe(1);
    expect(q.active).toBe(1);
    detach();
    expect(q.active).toBe(0);
    expect(q.removed).toBe(1);
    q.set(true);
    expect(log).toEqual(["motion:false", "dispose"]);
    detach(); // a second detach removes nothing more and does not throw
    expect(q.removed).toBe(1);
  });

  it("remount: the new renderer gets the current preference and its own single listener", () => {
    const q = fakeQuery(false);
    const logs: Log[] = [];
    const session = makeSession(
      () => {
        const log: Log = [];
        logs.push(log);
        return recordingRenderer(log);
      },
      { reducedMotion: () => q },
    );
    const detach1 = session.attachCanvas(canvas);
    fire();
    detach1();
    q.set(true); // changed while unmounted: nobody listens
    const detach2 = session.attachCanvas(canvas);
    fire();
    q.set(false);
    expect(logs[0]).toEqual(["motion:false", "frame", "dispose"]);
    expect(logs[1]).toEqual(["motion:true", "frame", "motion:false"]);
    expect(q.active).toBe(1);
    detach2();
    expect(q.active).toBe(0);
    expect(q.added).toBe(2);
    expect(q.removed).toBe(2);
  });

  it("StrictMode-style attach → detach → attach leaves exactly one live listener", () => {
    const q = fakeQuery(false);
    const session = makeSession(() => recordingRenderer([]), { reducedMotion: () => q });
    session.attachCanvas(canvas)();
    const detach = session.attachCanvas(canvas);
    expect(q.active).toBe(1);
    for (let i = 0; i < 5; i++) {
      session.attachCanvas(canvas)(); // repeated remount cycles do not leak
    }
    expect(q.active).toBe(1);
    detach();
    expect(q.active).toBe(0);
  });

  it("the session's audio dispose() does not touch the motion listener", () => {
    const q = fakeQuery(false);
    const session = makeSession(() => recordingRenderer([]), { reducedMotion: () => q });
    const detach = session.attachCanvas(canvas);
    session.dispose();
    expect(q.active).toBe(1);
    detach();
    expect(q.active).toBe(0);
  });
});

describe("V7: no per-frame work, no timers", () => {
  it("frames never call setMotion or resolve the query; only change events do", () => {
    const q = fakeQuery(false);
    const resolver = vi.fn(() => q);
    const log: Log = [];
    const session = makeSession(() => recordingRenderer(log), { reducedMotion: resolver });
    session.attachCanvas(canvas);
    fire(300);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(log.filter((l) => l.startsWith("motion:"))).toEqual(["motion:false"]);
    expect(log.filter((l) => l === "frame")).toHaveLength(300);
  });

  it("schedules no timer or interval", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const q = fakeQuery(false);
    const session = makeSession(() => recordingRenderer([]), { reducedMotion: () => q });
    const detach = session.attachCanvas(canvas);
    q.set(true);
    q.set(false);
    fire(10);
    detach();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

describe("V7: gameplay and money are unchanged by the preference", () => {
  /** Play a scripted session: a bet, natural rounds, a mid-run preference flip. */
  function play(reduced: "off" | "on" | "flip") {
    now = 1000; // the same frame clock for every run
    const q = fakeQuery(reduced === "on");
    const states: string[] = [];
    const session = makeSession(() => recordingRenderer([]), { reducedMotion: () => q });
    session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 5 });
    for (let i = 0; i < 1800; i++) {
      if (reduced === "flip" && i % 200 === 0) q.set(!q.matches);
      fire();
      const s = session.engine.getPublicState();
      states.push(`${s.phase}|${s.roundId}|${s.multiplier}`);
    }
    return {
      states,
      wallet: JSON.stringify(session.wallet.get()),
      round: JSON.stringify(session.round.get()),
    };
  }

  it("engine states, multipliers, wallet and round store are identical with reduced motion off, on or flipping", () => {
    const off = play("off");
    const on = play("on");
    const flip = play("flip");
    expect(on.states).toEqual(off.states);
    expect(flip.states).toEqual(off.states);
    expect(on.wallet).toBe(off.wallet);
    expect(flip.wallet).toBe(off.wallet);
    expect(on.round).toBe(off.round);
    expect(flip.round).toBe(off.round);
    expect(new Set(off.states.map((s) => s.split("|")[0])).size).toBeGreaterThan(2); // rounds ran
  }, 30_000);
});

describe("V7: the real SceneRenderer receives the flag through its existing setMotion", () => {
  /** A 2D context stand-in that accepts every call (gradients included). */
  const nullCtx = () =>
    new Proxy({} as Record<string, unknown>, {
      get: (_t, prop: string) => {
        if (prop === "canvas") return undefined;
        if (prop === "createRadialGradient" || prop === "createLinearGradient")
          return () => ({ addColorStop: () => {} });
        if (prop === "measureText") return () => ({ width: 0 });
        return () => {};
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;

  it("default factory path: SceneRenderer.fxSettings().reducedMotion follows the OS preference", () => {
    const setMotion = vi.spyOn(SceneRenderer.prototype, "setMotion");
    const q = fakeQuery(true);
    let renderer: SceneRenderer | null = null;
    const session = makeSession((c) => (renderer = new SceneRenderer(c)), {
      reducedMotion: () => q,
    });
    const real = {
      clientWidth: 390,
      clientHeight: 844,
      width: 0,
      height: 0,
      getContext: nullCtx,
    } as unknown as HTMLCanvasElement;
    session.attachCanvas(real);
    expect(renderer).not.toBeNull();
    expect(renderer!.fxSettings().reducedMotion).toBe(true);
    fire(5);
    expect(renderer!.fxSettings().reducedMotion).toBe(true);
    q.set(false);
    expect(renderer!.fxSettings().reducedMotion).toBe(false);
    q.set(true);
    expect(renderer!.fxSettings().reducedMotion).toBe(true);
    expect(setMotion).toHaveBeenCalledTimes(3);
    expect(renderer!.fxSettings().quality).toBe("high"); // quality untouched
    expect(renderer!.fxSettings().shakeOffset).toBe(0); // no camera shake
  });

  it("the production session module only uses SceneRenderer's own setMotion (no second motion system)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code.match(/matchMedia\(/g)).toHaveLength(1);
    expect(code).toContain("renderer.setMotion?.({ reducedMotion: q.matches === true })");
    for (const banned of [
      "requestAnimationFrame",
      "setTimeout",
      "setInterval",
      "useState",
      "performance.now",
    ]) {
      expect(code).not.toContain(banned);
    }
  });
});
