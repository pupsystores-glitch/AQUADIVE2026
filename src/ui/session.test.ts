// Game session tests (Sprint 4, Commit U1; docs/07_UI_ARCHITECTURE.md §8,
// §20 risk 5): construction order and remount semantics. The session is
// assembled by createGameSession with injected deps — scripted authority,
// deterministic Rng, and a recording renderer factory (SceneRenderer needs
// a real 2D context, so headless tests inject the renderer seam). The rAF
// host is stubbed exactly as in the driver's own tests: fire(ts) drives
// frames with explicit timestamps.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EngineEventMap, EngineStateName, GameEngine, RoundAuthority } from "@/engine";
import { DEFAULT_BALANCE } from "@/game/constants";
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

// ----- stubbed rAF + window host -----
const host = globalThis as unknown as {
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  window?: { devicePixelRatio: number };
};
let pending: Map<number, FrameRequestCallback>;
let nextId: number;

beforeEach(() => {
  pending = new Map();
  nextId = 1;
  host.requestAnimationFrame = (cb) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  host.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };
  // The session's frame callback reads window.devicePixelRatio (verbatim
  // from the component shell); node has no window, so the test provides it.
  host.window = { devicePixelRatio: 2 };
});

afterEach(() => {
  delete host.requestAnimationFrame;
  delete host.cancelAnimationFrame;
  delete host.window;
});

/** Fire all pending rAF callbacks with the given timestamp (ms). */
const fire = (tsMs: number) => {
  const callbacks = [...pending.values()];
  pending.clear();
  for (const cb of callbacks) cb(tsMs);
};

// ----- recording renderer seam -----
interface RendererRecord {
  renderer: CanvasRenderer;
  resizes: Array<[number, number, number]>;
  frames: number;
  disposed: boolean;
}

const makeHarness = (crashPoint?: number) => {
  const renderers: RendererRecord[] = [];
  const session = createGameSession({
    authority: stubAuthority(crashPoint),
    worldRng: { next: () => 0.5 },
    createRenderer: () => {
      const record: RendererRecord = {
        resizes: [],
        frames: 0,
        disposed: false,
        renderer: {
          resize: (w, h, dpr) => record.resizes.push([w, h, dpr]),
          frame: () => {
            record.frames++;
          },
          dispose: () => {
            record.disposed = true;
          },
        },
      };
      renderers.push(record);
      return record.renderer;
    },
  });
  const canvas = { clientWidth: 375, clientHeight: 667 } as HTMLCanvasElement;
  return { session, renderers, canvas };
};

describe("createGameSession — construction order (§8, §20 risk 5)", () => {
  it("construction is inert: no renderer, no rAF, no ticks — SSR-safe module-scope assembly", () => {
    const { session, renderers } = makeHarness();
    expect(renderers).toHaveLength(0);
    expect(pending.size).toBe(0);
    expect(session.driver.running).toBe(false);
    expect(session.engine.tickCount).toBe(0);
  });

  it("attachCanvas constructs the renderer, starts the driver, and drives resize + frame + sync per rAF frame", () => {
    const { session, renderers, canvas } = makeHarness();
    const syncs: string[] = [];
    session.attachCanvas(canvas, (s) => syncs.push(s.phase));

    expect(renderers).toHaveLength(1);
    expect(session.driver.running).toBe(true);

    fire(1000); // first frame after attach: zero wall delta
    fire(1100);
    expect(renderers[0].frames).toBe(2);
    expect(renderers[0].resizes[0]).toEqual([375, 667, 2]); // CSS size + window.devicePixelRatio
    expect(syncs).toHaveLength(2);
    expect(syncs[0]).toBe("idle"); // betting → renderer Phase "idle" (docs/06 §5 projection)
    expect(session.engine.tickCount).toBeGreaterThan(0); // 100 ms advanced = 6 ticks
  });

  it("sync is optional: attach without it still renders", () => {
    const { session, renderers, canvas } = makeHarness();
    session.attachCanvas(canvas);
    fire(1000);
    fire(1016);
    expect(renderers[0].frames).toBe(2);
  });
});

describe("createGameSession — remount semantics (§8, §20 risk 5)", () => {
  it("detach pauses the driver and disposes the renderer; engine state survives; re-attach resumes with a new renderer", () => {
    const { session, renderers, canvas } = makeHarness();

    const detach = session.attachCanvas(canvas);
    fire(1000);
    fire(1500); // 0.5 s wall time → ticks advance
    const ticksBeforeDetach = session.engine.tickCount;
    expect(ticksBeforeDetach).toBeGreaterThan(0);

    detach();
    expect(session.driver.running).toBe(false);
    expect(renderers[0].disposed).toBe(true);
    expect(session.engine.tickCount).toBe(ticksBeforeDetach); // pause, never reset

    // Remount: a new renderer for the new canvas mount; the world resumes.
    session.attachCanvas(canvas);
    expect(renderers).toHaveLength(2);
    expect(renderers[1].disposed).toBe(false);

    fire(9000); // fresh wall-clock baseline: first frame contributes zero delta
    expect(session.engine.tickCount).toBe(ticksBeforeDetach);
    fire(9100);
    expect(session.engine.tickCount).toBeGreaterThan(ticksBeforeDetach);
  });
});

// ----- U2: the wallet store at session scope (docs/07 §8, §10; delta V1) -----

/** One simulated 60 Hz frame of wall time. */
const FRAME_SECONDS = 1 / 60;
/** Crash point that is never reached — forces the sea-floor (jackpot) path. */
const NEVER_CRASH = 1e9;

/** Advance the engine frame by frame until it reaches `state` (cap guards runaway loops). */
const advanceUntilState = (engine: GameEngine, state: EngineStateName, cap = 20000) => {
  for (let i = 0; i < cap && engine.state !== state; i++) engine.advance(FRAME_SECONDS);
  expect(engine.state).toBe(state);
};
const advanceFrames = (engine: GameEngine, n: number) => {
  for (let i = 0; i < n; i++) engine.advance(FRAME_SECONDS);
};

/** Record the engine events a test cares about (stands in for nothing component-side). */
const recordEvents = (engine: GameEngine, names: Array<keyof EngineEventMap>) => {
  const log: Array<{ name: keyof EngineEventMap; payload: unknown }> = [];
  for (const name of names) engine.events.on(name, (payload) => log.push({ name, payload }));
  return log;
};

describe("createGameSession — wallet wiring (U2, §8/§10)", () => {
  it("the wallet is constructed with the session and settles with no component and no canvas attached", () => {
    const { session } = makeHarness();
    expect(session.wallet.get().balance).toBe(DEFAULT_BALANCE);

    session.submit({ type: "placeBet", amount: 10 });
    advanceFrames(session.engine, 1);
    expect(session.wallet.get()).toMatchObject({
      balance: 990,
      roundBet: 10,
      participating: true,
    });
  });

  it("submit drops a placeBet the wallet cannot afford — it never reaches the engine", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);

    session.submit({ type: "placeBet", amount: DEFAULT_BALANCE + 0.01 });
    session.submit({ type: "placeBet", amount: 0 });
    advanceFrames(session.engine, 1);
    expect(log).toEqual([]); // not rejected by the engine: never submitted
    expect(session.wallet.get().balance).toBe(DEFAULT_BALANCE);

    session.submit({ type: "placeBet", amount: DEFAULT_BALANCE }); // exactly affordable
    advanceFrames(session.engine, 1);
    expect(log).toEqual([{ name: "betPlaced", payload: { roundId: 1, amount: DEFAULT_BALANCE } }]);
    expect(session.wallet.get().balance).toBe(0);
  });

  it("submit forwards every other command unchanged; the engine validates round state (D4)", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["commandRejected"]);
    session.submit({ type: "cashOut" });
    session.submit({ type: "pickChest", chestId: 1 });
    advanceFrames(session.engine, 1);
    expect(log.map((e) => (e.payload as { reason: string }).reason)).toEqual([
      "not-diving",
      "not-in-bonus",
    ]);
  });

  it("bet-basis lock through the real command path: a later, larger affordable bet cannot move the basis", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["commandRejected"]);

    session.submit({ type: "placeBet", amount: 5 });
    advanceFrames(session.engine, 1);
    session.submit({ type: "placeBet", amount: 100 }); // affordable → reaches the engine → rejected
    advanceFrames(session.engine, 1);
    expect(log.map((e) => (e.payload as { reason: string }).reason)).toEqual([
      "already-participating",
    ]);
    expect(session.wallet.get()).toMatchObject({ balance: 995, roundBet: 5 });

    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier; // tick-authoritative cashout value (D4)
    session.submit({ type: "cashOut" });
    advanceFrames(session.engine, 1);

    const win = +(5 * m).toFixed(2);
    expect(session.wallet.get().lastWin).toEqual({ amount: win, mult: m }); // 5 × m, never 100 × m
    expect(session.wallet.get().balance).toBe(+(995 + win).toFixed(2));
  });

  it("full jackpot round end to end: debit, auto-credit at impact, chest delta, reset at bettingOpened", () => {
    const { session } = makeHarness(NEVER_CRASH);
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "impact");
    expect(session.wallet.get()).toMatchObject({ balance: 1990, hasCashed: true }); // 990 + 10 × 100
    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 1 }); // 100 × 6.5 = 650
    advanceFrames(session.engine, 1);
    expect(session.wallet.get().balance).toBe(7490); // + (6500 − 1000)
    expect(session.wallet.get().lastWin).toEqual({ amount: 6500, mult: 650 });

    advanceUntilState(session.engine, "betting");
    expect(session.wallet.get()).toMatchObject({
      balance: 7490,
      roundBet: 0,
      participating: false,
      hasCashed: false,
      history: [
        { mult: 650, crashed: false },
        { mult: 100, crashed: false },
      ],
    });
  });
});

describe("createGameSession — wallet survives remount mid-round (V1, §21 tier 1)", () => {
  it("unmount during the dive, remount, then cash out: the credit uses the locked bet and nothing reset", () => {
    // Pre-U2 failure mode: a remount re-ran useState/useRef initializers —
    // balance back to the default, roundBetRef 0, participating false — so
    // the round in flight settled against a zero basis.
    const { session, renderers, canvas } = makeHarness(NEVER_CRASH);

    // Mount 1: canvas attached (the component's mount effect).
    const detach = session.attachCanvas(canvas);
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "diving");
    const mid = session.wallet.get();
    expect(mid).toMatchObject({ balance: 990, roundBet: 10, participating: true });

    // Unmount mid-dive.
    detach();
    expect(renderers[0].disposed).toBe(true);
    expect(session.wallet.get()).toBe(mid); // untouched by the unmount

    // Remount: a new canvas mount; the wallet is the same, nothing re-initialized.
    session.attachCanvas(canvas);
    expect(renderers).toHaveLength(2);
    expect(session.wallet.get()).toBe(mid);

    advanceFrames(session.engine, 20);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut" });
    advanceFrames(session.engine, 1);
    expect(session.wallet.get().balance).toBe(+(990 + +(10 * m).toFixed(2)).toFixed(2));
    expect(session.wallet.get().hasCashed).toBe(true);
  });

  it("events that occur while no component is mounted are still settled", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    // A component-side listener, as the shell's display subscriptions are.
    let componentSawImpact = 0;
    const unsubscribeComponent = session.engine.events.on("shipImpact", () => {
      componentSawImpact++;
    });
    const detach = session.attachCanvas(canvas);
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "diving");

    // Unmount: the component's subscriptions and the canvas go away...
    unsubscribeComponent();
    detach();

    // ...while the round keeps producing settlement events (simulated detach).
    advanceUntilState(session.engine, "impact");
    expect(componentSawImpact).toBe(0);
    expect(session.wallet.get()).toMatchObject({
      balance: 1990, // the jackpot auto-credit was applied with no component mounted
      hasCashed: true,
      lastWin: { amount: 1000, mult: 100 },
    });
  });
});
