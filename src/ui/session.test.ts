// Game session tests (Sprint 4, Commit U1; docs/07_UI_ARCHITECTURE.md §8,
// §20 risk 5): construction order and remount semantics. The session is
// assembled by createGameSession with injected deps — scripted authority,
// deterministic Rng, and a recording renderer factory (SceneRenderer needs
// a real 2D context, so headless tests inject the renderer seam). The rAF
// host is stubbed exactly as in the driver's own tests: fire(ts) drives
// frames with explicit timestamps.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEventMap, EngineStateName, GameEngine, RoundAuthority } from "@/engine";
import { CASH_FLASH_MS, JACKPOT_FLASH_MS } from "@/game/config";
import { DEFAULT_BALANCE } from "@/game/constants";
import { createGameSession, type CanvasRenderer, type GameSessionDeps } from "./session";
import type { NotificationClock } from "./store/notification-store";

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

const makeHarness = (crashPoint?: number, extra: Partial<GameSessionDeps> = {}) => {
  const renderers: RendererRecord[] = [];
  const session = createGameSession({
    ...extra,
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

  it("real engine (E-X1): cashout → seabed → bonus: pick rejected, no chestPicked, cashout stands alone; the round completes", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["chestPicked", "roundEnded", "commandRejected"]);
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier; // tick-authoritative cashout value (D4)
    session.submit({ type: "cashOut" });
    advanceFrames(session.engine, 1);
    const afterCashout = +(990 + +(10 * m).toFixed(2)).toFixed(2);
    expect(session.wallet.get()).toMatchObject({ balance: afterCashout, settledBy: "cashout" });

    advanceUntilState(session.engine, "impact");
    expect(session.wallet.get().balance).toBe(afterCashout);
    advanceUntilState(session.engine, "bonus");
    expect(session.engine.getPublicState().participant?.bonusEligible).toBe(false);
    session.submit({ type: "pickChest", chestId: 2 }); // 100 × 30 — must not be credited
    advanceFrames(session.engine, 1);
    expect(log.filter((e) => e.name === "commandRejected").map((e) => e.payload)).toEqual([
      { roundId: 1, command: { type: "pickChest", chestId: 2 }, reason: "not-bonus-eligible" },
    ]);
    expect(session.wallet.get()).toMatchObject({
      balance: afterCashout,
      lastWin: { amount: +(10 * m).toFixed(2), mult: m },
    });

    advanceUntilState(session.engine, "betting"); // bonus completes on its own: no stuck round
    expect(log.filter((e) => e.name === "chestPicked")).toEqual([]);
    expect(log.filter((e) => e.name === "roundEnded")).toEqual([
      { name: "roundEnded", payload: { roundId: 1, outcome: "jackpot" } },
    ]);
    expect(session.wallet.get()).toMatchObject({
      balance: afterCashout,
      settledBy: null,
      chestSettled: false,
      // No chest entry: the cashout and the round's jackpot result only.
      history: [
        { mult: 100, crashed: false },
        { mult: m, crashed: false },
      ],
    });
  });

  it("real engine (E-X1): spectator → bonus: pick rejected, no chestPicked, no credit; the round completes", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["chestPicked", "roundEnded", "commandRejected"]);
    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 2 });
    advanceFrames(session.engine, 1);
    expect(log.filter((e) => e.name === "commandRejected").map((e) => e.payload)).toEqual([
      { roundId: 1, command: { type: "pickChest", chestId: 2 }, reason: "not-bonus-eligible" },
    ]);
    expect(session.wallet.get()).toMatchObject({
      balance: DEFAULT_BALANCE,
      participating: false,
      settledBy: null,
      lastWin: null,
    });
    advanceUntilState(session.engine, "betting");
    expect(log.filter((e) => e.name === "chestPicked")).toEqual([]);
    expect(log.filter((e) => e.name === "roundEnded")).toHaveLength(1);
    expect(session.wallet.get().balance).toBe(DEFAULT_BALANCE);
    expect(session.wallet.get().history).toEqual([{ mult: 100, crashed: false }]); // no chest entry
  });

  it("real engine (E-X1): eligible player never picks → chest 0 auto-applied and credited by the unchanged delta formula", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["chestPicked"]);
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "bonus");
    expect(session.wallet.get().balance).toBe(1990); // 990 + 10 × 100
    advanceUntilState(session.engine, "betting"); // nobody clicks
    expect(log.map((e) => e.payload)).toEqual([
      { roundId: 1, chestId: 0, chestMultiplier: 2, finalMultiplier: 200 },
    ]);
    // delta = +(10 × 200).toFixed(2) − +(10 × 100).toFixed(2) = 1000
    expect(session.wallet.get()).toMatchObject({
      balance: 2990,
      lastWin: { amount: 2000, mult: 200 },
      history: [
        { mult: 200, crashed: false },
        { mult: 100, crashed: false },
      ],
    });
  });

  it("real engine (E-X1): repeated rounds — the ledger follows the unchanged payout formulas on every path", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["chestPicked", "roundEnded"]);

    // Round 1: eligible, manual pick chest 1 → 990 + 1000 + (6500 − 1000) = 7490
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 1 });
    advanceUntilState(session.engine, "betting");
    expect(session.wallet.get().balance).toBe(7490);

    // Round 2: spectator — no movement.
    advanceUntilState(session.engine, "bonus");
    advanceUntilState(session.engine, "betting");
    expect(session.wallet.get().balance).toBe(7490);

    // Round 3: manual cashout → seabed — cashout only.
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut" });
    advanceUntilState(session.engine, "betting");
    const afterRound3 = +(+(7490 - 10).toFixed(2) + +(10 * m).toFixed(2)).toFixed(2);
    expect(session.wallet.get().balance).toBe(afterRound3);

    // Round 4: eligible, auto-pick chest 0 → −10 + 1000 + (2000 − 1000)
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "bonus"); // nobody clicks
    advanceUntilState(session.engine, "betting");
    let expected = +(afterRound3 - 10).toFixed(2); // debit
    expected = +(expected + 1000).toFixed(2); // jackpot auto-credit 10 × 100
    expected = +(expected + 1000).toFixed(2); // chest delta 2000 − 1000
    expect(session.wallet.get().balance).toBe(expected);

    expect(log.filter((e) => e.name === "chestPicked").map((e) => e.payload)).toEqual([
      { roundId: 1, chestId: 1, chestMultiplier: 6.5, finalMultiplier: 650 },
      { roundId: 4, chestId: 0, chestMultiplier: 2, finalMultiplier: 200 },
    ]);
    expect(log.filter((e) => e.name === "roundEnded")).toHaveLength(4);
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

// ----- U4a: the notification store at session scope (docs/07 §8, §12; delta V2) -----

/** A frozen clock: time never moves, timers fire only when a test says so. */
const frozenClock = () => {
  let nextId = 1;
  const timers = new Map<number, { ms: number; cb: () => void }>();
  const clock: NotificationClock & {
    pending(): Array<number>;
    fireAll(): void;
  } = {
    now: () => 0,
    setTimeout: (cb, ms) => {
      const id = nextId++;
      timers.set(id, { ms, cb });
      return id;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
    pending: () => [...timers.values()].map((t) => t.ms),
    fireAll: () => {
      const due = [...timers.values()];
      timers.clear();
      for (const t of due) t.cb();
    },
  };
  return clock;
};

describe("createGameSession — notification wiring (U4a, §8/§12)", () => {
  it("construction is inert: no flash, no timer", () => {
    const clock = frozenClock();
    const { session } = makeHarness(undefined, { notificationClock: clock });
    expect(session.notifications.get()).toEqual({ flash: null, rejections: [] });
    expect(clock.pending()).toEqual([]);
  });

  it("cashout: the wallet credits, the cash flash starts with CASH_FLASH_MS; it survives detach/re-attach; bettingOpened clears it and cancels the timer", () => {
    const clock = frozenClock();
    const { session, canvas } = makeHarness(3, { notificationClock: clock });
    const detach = session.attachCanvas(canvas);
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut" });
    advanceFrames(session.engine, 1);

    expect(session.wallet.get()).toMatchObject({
      balance: +(990 + +(10 * m).toFixed(2)).toFixed(2),
      lastWin: { amount: +(10 * m).toFixed(2), mult: m },
      settledBy: "cashout",
    });
    const flash = session.notifications.get().flash;
    expect(flash).toMatchObject({ kind: "cashFlash", expiresAt: CASH_FLASH_MS });
    expect(clock.pending()).toEqual([CASH_FLASH_MS]);

    // Remount: the flash belongs to the session, not the mount.
    detach();
    session.attachCanvas(canvas);
    expect(session.notifications.get().flash).toBe(flash);
    expect(clock.pending()).toEqual([CASH_FLASH_MS]);

    // The frozen clock never expires it; the next round's betting window does.
    advanceUntilState(session.engine, "crashed");
    expect(session.notifications.get().flash).toBe(flash);
    advanceUntilState(session.engine, "betting");
    expect(session.notifications.get().flash).toBeNull();
    expect(clock.pending()).toEqual([]);
  });

  it("jackpot: the jackpot flash starts with JACKPOT_FLASH_MS and outlives the chest reveal and pick; the ledger is unchanged", () => {
    const clock = frozenClock();
    const { session } = makeHarness(NEVER_CRASH, { notificationClock: clock });
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "impact");
    expect(session.wallet.get().balance).toBe(1990);
    expect(session.notifications.get().flash).toMatchObject({ kind: "jackpotFlash" });
    expect(clock.pending()).toEqual([JACKPOT_FLASH_MS]);

    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 1 });
    advanceFrames(session.engine, 1);
    expect(session.wallet.get().balance).toBe(7490);
    expect(session.notifications.get().flash).toMatchObject({ kind: "jackpotFlash" });

    advanceUntilState(session.engine, "betting");
    expect(session.notifications.get().flash).toBeNull();
    expect(clock.pending()).toEqual([]);
  });

  it("an expired flash stays expired; settlement never waits on the timer", () => {
    const clock = frozenClock();
    const { session } = makeHarness(NEVER_CRASH, { notificationClock: clock });
    session.submit({ type: "placeBet", amount: 10 });
    advanceUntilState(session.engine, "impact");
    clock.fireAll();
    expect(session.notifications.get().flash).toBeNull();
    advanceUntilState(session.engine, "betting");
    expect(session.wallet.get().balance).toBe(2990); // auto-pick chest 0: 1990 + (2000 − 1000)
  });

  it("diagnostics opted in: each engine rejection is logged once and recorded", () => {
    const log = vi.fn();
    const { session } = makeHarness(undefined, {
      notificationClock: frozenClock(),
      diagnostics: true,
      diagnosticsLog: log,
    });
    session.submit({ type: "cashOut" });
    session.submit({ type: "placeBet", amount: DEFAULT_BALANCE + 1 }); // dropped by submit: never rejected by the engine
    advanceFrames(session.engine, 1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(session.notifications.get().rejections).toEqual([
      { roundId: 1, command: { type: "cashOut" }, reason: "not-diving", at: 0 },
    ]);
  });

  it("diagnostics default off in the factory: no log, no history", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session } = makeHarness();
    session.submit({ type: "cashOut" });
    advanceFrames(session.engine, 1);
    expect(warn).not.toHaveBeenCalled();
    expect(session.notifications.get().rejections).toEqual([]);
    warn.mockRestore();
  });
});
