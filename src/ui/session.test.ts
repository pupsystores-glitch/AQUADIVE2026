// Game session tests (Sprint 4, Commit U1; docs/07_UI_ARCHITECTURE.md §8,
// §20 risk 5): construction order and remount semantics. The session is
// assembled by createGameSession with injected deps — scripted authority,
// deterministic Rng, and a recording renderer factory (SceneRenderer needs
// a real 2D context, so headless tests inject the renderer seam). The rAF
// host is stubbed exactly as in the driver's own tests: fire(ts) drives
// frames with explicit timestamps.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineEventMap, EngineStateName, GameEngine, RoundAuthority } from "@/engine";
import { BET_CUTOFF_SECONDS, CASH_FLASH_MS, JACKPOT_FLASH_MS } from "@/game/config";
import { DEFAULT_BALANCE, DEFAULT_BET } from "@/game/constants";
import { actionStateFor, canPlaceBet } from "./components/action-state";
import {
  createGameSession,
  type CanvasRenderer,
  type GameSession,
  type GameSessionDeps,
} from "./session";
import type { NotificationClock } from "./store/notification-store";
import { isPlaceableStake } from "./store/wallet-store";
import { adjacentDoubles, payoutOracle } from "./test/money-oracle";
import { slot0View, type SingleSlotWalletView } from "@/ui/test/wallet-view";

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

  it("attachCanvas constructs the renderer, starts the driver, and drives resize + frame + round-store sync per rAF frame", () => {
    const { session, renderers, canvas } = makeHarness();
    const reads = vi.spyOn(session.engine, "getPublicState");
    session.attachCanvas(canvas);

    expect(renderers).toHaveLength(1);
    expect(session.driver.running).toBe(true);
    expect(reads).toHaveBeenCalledTimes(1); // the synchronous write on attach

    fire(1000); // first frame after attach: zero wall delta
    expect(reads).toHaveBeenCalledTimes(2); // one sync per frame
    expect(session.round.get().phase).toBe("idle"); // betting → renderer Phase "idle" (docs/06 §5 projection)
    fire(1100);
    expect(reads).toHaveBeenCalledTimes(3);
    expect(renderers[0].frames).toBe(2);
    // Scene fit (Sprint 4 QA fix): a 667 px canvas is shorter than
    // MIN_SCENE_HEIGHT, so the renderer gets a zoomed-out logical viewport
    // (zoomed out no further than MIN_SCENE_SCALE, 0.84: 667 / 0.84 tall)
    // whose backing store is still the native 750 × 1334 (CSS size × dpr 2).
    const [w, h, dpr] = renderers[0].resizes[0];
    expect(h).toBeCloseTo(667 / 0.84, 9);
    expect(w * dpr).toBe(750);
    expect(h * dpr).toBe(1334);
    expect(session.engine.tickCount).toBeGreaterThan(0); // 100 ms advanced = 6 ticks
    expect(session.round.get()).toEqual(session.engine.getPublicState()); // the store holds this frame's state
  });

  it("attachCanvas takes no host sync callback: the round store is the only sync target (U4b)", () => {
    const { session, renderers, canvas } = makeHarness();
    expect(session.attachCanvas.length).toBe(1);
    session.attachCanvas(canvas);
    fire(1000);
    fire(1016);
    expect(renderers[0].frames).toBe(2);
    expect(session.round.get().countdownSeconds).toBe(
      session.engine.getPublicState().countdownSeconds,
    );
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
    expect(slot0View(session.wallet.get()).balance).toBe(DEFAULT_BALANCE);

    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceFrames(session.engine, 1);
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: 990,
      roundBet: 10,
      participating: true,
    });
  });

  it("submit drops a placeBet the wallet cannot afford — it never reaches the engine", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);

    session.submit({ type: "placeBet", slot: 0, amount: DEFAULT_BALANCE + 0.01 });
    session.submit({ type: "placeBet", slot: 0, amount: 0 });
    advanceFrames(session.engine, 1);
    expect(log).toEqual([]); // not rejected by the engine: never submitted
    expect(slot0View(session.wallet.get()).balance).toBe(DEFAULT_BALANCE);

    session.submit({ type: "placeBet", slot: 0, amount: DEFAULT_BALANCE }); // exactly affordable
    advanceFrames(session.engine, 1);
    expect(log).toEqual([
      { name: "betPlaced", payload: { roundId: 1, slot: 0, amount: DEFAULT_BALANCE } },
    ]);
    expect(slot0View(session.wallet.get()).balance).toBe(0);
  });

  it("submit forwards every other command unchanged; the engine validates round state (D4)", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["commandRejected"]);
    session.submit({ type: "cashOut", slot: 0 });
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

    session.submit({ type: "placeBet", slot: 0, amount: 5 });
    advanceFrames(session.engine, 1);
    session.submit({ type: "placeBet", slot: 0, amount: 100 }); // affordable → reaches the engine → rejected
    advanceFrames(session.engine, 1);
    expect(log.map((e) => (e.payload as { reason: string }).reason)).toEqual([
      "already-participating",
    ]);
    expect(slot0View(session.wallet.get())).toMatchObject({ balance: 995, roundBet: 5 });

    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier; // tick-authoritative cashout value (D4)
    session.submit({ type: "cashOut", slot: 0 });
    advanceFrames(session.engine, 1);

    const win = payoutOracle(5, m);
    expect(slot0View(session.wallet.get()).lastWin).toEqual({ amount: win, mult: m }); // 5 × m, never 100 × m
    expect(slot0View(session.wallet.get()).balance).toBe(+(995 + win).toFixed(2));
  });

  it("full jackpot round end to end: debit, auto-credit at impact, chest delta, reset at bettingOpened", () => {
    const { session } = makeHarness(NEVER_CRASH);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "impact");
    expect(slot0View(session.wallet.get())).toMatchObject({ balance: 1990, hasCashed: true }); // 990 + 10 × 100
    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 1 }); // 100 × 6.5 = 650
    advanceFrames(session.engine, 1);
    expect(slot0View(session.wallet.get()).balance).toBe(7490); // + (6500 − 1000)
    expect(slot0View(session.wallet.get()).lastWin).toEqual({ amount: 6500, mult: 650 });

    advanceUntilState(session.engine, "betting");
    expect(slot0View(session.wallet.get())).toMatchObject({
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
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier; // tick-authoritative cashout value (D4)
    session.submit({ type: "cashOut", slot: 0 });
    advanceFrames(session.engine, 1);
    const afterCashout = +(990 + payoutOracle(10, m)).toFixed(2);
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: afterCashout,
      settledBy: "cashout",
    });

    advanceUntilState(session.engine, "impact");
    expect(slot0View(session.wallet.get()).balance).toBe(afterCashout);
    advanceUntilState(session.engine, "bonus");
    expect(session.engine.getPublicState().participants[0]?.bonusEligible).toBe(false);
    session.submit({ type: "pickChest", chestId: 2 }); // 100 × 30 — must not be credited
    advanceFrames(session.engine, 1);
    expect(log.filter((e) => e.name === "commandRejected").map((e) => e.payload)).toEqual([
      { roundId: 1, command: { type: "pickChest", chestId: 2 }, reason: "not-bonus-eligible" },
    ]);
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: afterCashout,
      lastWin: { amount: payoutOracle(10, m), mult: m },
    });

    advanceUntilState(session.engine, "betting"); // bonus completes on its own: no stuck round
    expect(log.filter((e) => e.name === "chestPicked")).toEqual([]);
    expect(log.filter((e) => e.name === "roundEnded")).toEqual([
      { name: "roundEnded", payload: { roundId: 1, outcome: "jackpot" } },
    ]);
    expect(slot0View(session.wallet.get())).toMatchObject({
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
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: DEFAULT_BALANCE,
      participating: false,
      settledBy: null,
      lastWin: null,
    });
    advanceUntilState(session.engine, "betting");
    expect(log.filter((e) => e.name === "chestPicked")).toEqual([]);
    expect(log.filter((e) => e.name === "roundEnded")).toHaveLength(1);
    expect(slot0View(session.wallet.get()).balance).toBe(DEFAULT_BALANCE);
    expect(slot0View(session.wallet.get()).history).toEqual([{ mult: 100, crashed: false }]); // no chest entry
  });

  it("real engine (E-X1): eligible player never picks → chest 0 auto-applied and credited by the unchanged delta formula", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["chestPicked"]);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "bonus");
    expect(slot0View(session.wallet.get()).balance).toBe(1990); // 990 + 10 × 100
    advanceUntilState(session.engine, "betting"); // nobody clicks
    expect(log.map((e) => e.payload)).toEqual([
      { roundId: 1, chestId: 0, chestMultiplier: 2, finalMultiplier: 200 },
    ]);
    // delta = +(10 × 200).toFixed(2) − +(10 × 100).toFixed(2) = 1000
    expect(slot0View(session.wallet.get())).toMatchObject({
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
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 1 });
    advanceUntilState(session.engine, "betting");
    expect(slot0View(session.wallet.get()).balance).toBe(7490);

    // Round 2: spectator — no movement.
    advanceUntilState(session.engine, "bonus");
    advanceUntilState(session.engine, "betting");
    expect(slot0View(session.wallet.get()).balance).toBe(7490);

    // Round 3: manual cashout → seabed — cashout only.
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut", slot: 0 });
    advanceUntilState(session.engine, "betting");
    const afterRound3 = +(+(7490 - 10).toFixed(2) + payoutOracle(10, m)).toFixed(2);
    expect(slot0View(session.wallet.get()).balance).toBe(afterRound3);

    // Round 4: eligible, auto-pick chest 0 → −10 + 1000 + (2000 − 1000)
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "bonus"); // nobody clicks
    advanceUntilState(session.engine, "betting");
    let expected = +(afterRound3 - 10).toFixed(2); // debit
    expected = +(expected + 1000).toFixed(2); // jackpot auto-credit 10 × 100
    expected = +(expected + 1000).toFixed(2); // chest delta 2000 − 1000
    expect(slot0View(session.wallet.get()).balance).toBe(expected);

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
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving");
    const mid = slot0View(session.wallet.get());
    expect(mid).toMatchObject({ balance: 990, roundBet: 10, participating: true });

    // Unmount mid-dive.
    detach();
    expect(renderers[0].disposed).toBe(true);
    expect(slot0View(session.wallet.get())).toBe(mid); // untouched by the unmount

    // Remount: a new canvas mount; the wallet is the same, nothing re-initialized.
    session.attachCanvas(canvas);
    expect(renderers).toHaveLength(2);
    expect(slot0View(session.wallet.get())).toBe(mid);

    advanceFrames(session.engine, 20);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut", slot: 0 });
    advanceFrames(session.engine, 1);
    expect(slot0View(session.wallet.get()).balance).toBe(+(990 + payoutOracle(10, m)).toFixed(2));
    expect(slot0View(session.wallet.get()).hasCashed).toBe(true);
  });

  it("events that occur while no component is mounted are still settled", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    // A component-side listener, as the shell's display subscriptions are.
    let componentSawImpact = 0;
    const unsubscribeComponent = session.engine.events.on("shipImpact", () => {
      componentSawImpact++;
    });
    const detach = session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving");

    // Unmount: the component's subscriptions and the canvas go away...
    unsubscribeComponent();
    detach();

    // ...while the round keeps producing settlement events (simulated detach).
    advanceUntilState(session.engine, "impact");
    expect(componentSawImpact).toBe(0);
    expect(slot0View(session.wallet.get())).toMatchObject({
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
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut", slot: 0 });
    advanceFrames(session.engine, 1);

    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: +(990 + payoutOracle(10, m)).toFixed(2),
      lastWin: { amount: payoutOracle(10, m), mult: m },
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
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "impact");
    expect(slot0View(session.wallet.get()).balance).toBe(1990);
    expect(session.notifications.get().flash).toMatchObject({ kind: "jackpotFlash" });
    expect(clock.pending()).toEqual([JACKPOT_FLASH_MS]);

    advanceUntilState(session.engine, "bonus");
    session.submit({ type: "pickChest", chestId: 1 });
    advanceFrames(session.engine, 1);
    expect(slot0View(session.wallet.get()).balance).toBe(7490);
    expect(session.notifications.get().flash).toMatchObject({ kind: "jackpotFlash" });

    advanceUntilState(session.engine, "betting");
    expect(session.notifications.get().flash).toBeNull();
    expect(clock.pending()).toEqual([]);
  });

  it("an expired flash stays expired; settlement never waits on the timer", () => {
    const clock = frozenClock();
    const { session } = makeHarness(NEVER_CRASH, { notificationClock: clock });
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "impact");
    clock.fireAll();
    expect(session.notifications.get().flash).toBeNull();
    advanceUntilState(session.engine, "betting");
    expect(slot0View(session.wallet.get()).balance).toBe(2990); // auto-pick chest 0: 1990 + (2000 − 1000)
  });

  it("diagnostics opted in: each engine rejection is logged once and recorded", () => {
    const log = vi.fn();
    const { session } = makeHarness(undefined, {
      notificationClock: frozenClock(),
      diagnostics: true,
      diagnosticsLog: log,
    });
    session.submit({ type: "cashOut", slot: 0 });
    session.submit({ type: "placeBet", slot: 0, amount: DEFAULT_BALANCE + 1 }); // dropped by submit: never rejected by the engine
    advanceFrames(session.engine, 1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(session.notifications.get().rejections).toEqual([
      { roundId: 1, command: { type: "cashOut", slot: 0 }, reason: "not-diving", at: 0 },
    ]);
  });

  it("diagnostics default off in the factory: no log, no history", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session } = makeHarness();
    session.submit({ type: "cashOut", slot: 0 });
    advanceFrames(session.engine, 1);
    expect(warn).not.toHaveBeenCalled();
    expect(session.notifications.get().rejections).toEqual([]);
    warn.mockRestore();
  });
});

// ----- U4b: the round store at session scope (docs/07 §8, §11) -----

/** A 60 Hz rAF frame clock over the stubbed host: each step fires one driver frame. */
const frameClock = () => {
  let ts = 0;
  return {
    step: () => {
      ts += 1000 / 60;
      fire(ts);
    },
  };
};

/** Step driver frames until `predicate` holds, calling `each` after every frame. */
const stepUntil = (
  clock: ReturnType<typeof frameClock>,
  predicate: () => boolean,
  each: () => void = () => {},
  cap = 20000,
) => {
  for (let i = 0; i < cap && !predicate(); i++) {
    clock.step();
    each();
  }
  expect(predicate()).toBe(true);
};

describe("createGameSession — round store wiring (U4b, §8/§11)", () => {
  it("is seeded at construction from the engine's public state; construction notifies nobody and schedules nothing", () => {
    const { session } = makeHarness();
    const seeded = session.round.get();
    expect(seeded).toEqual(session.engine.getPublicState());
    expect(seeded).toMatchObject({
      phase: "idle",
      multiplier: 1,
      boost: 0,
      participants: [null, null],
      chests: null,
    });
    expect(seeded.countdownSeconds.toFixed(1)).toBe("5.0"); // the shell's old initial state
    expect(pending.size).toBe(0);
    expect(Object.keys(session.round).sort()).toEqual(["get", "subscribe"]); // read-only surface
  });

  it("the driver's sync is the only writer: a detached session does not update the mirror, even when the engine advances", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const seeded = session.round.get();
    const notify = vi.fn();
    session.round.subscribe(notify);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving"); // events fire; the round store has no listeners
    expect(session.round.get()).toBe(seeded);
    expect(notify).not.toHaveBeenCalled();
    expect(slot0View(session.wallet.get()).participating).toBe(true); // settlement still ran
  });

  it("per frame, through a full jackpot round with a pick, the store equals the engine's public state; the ledger is unchanged", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    session.attachCanvas(canvas);
    const phases = new Set<string>();
    const check = () => {
      expect(session.round.get()).toEqual(session.engine.getPublicState());
      phases.add(session.round.get().phase);
    };
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "bonus", check);
    expect(session.round.get().participants[0]).toEqual({
      betAmount: 10,
      cashedOut: true,
      cashedOutAt: 100,
      bonusEligible: true,
    });
    session.submit({ type: "pickChest", chestId: 1 });
    stepUntil(clock, () => session.round.get().chosenChestId !== null, check);
    expect(session.round.get().chosenChestId).toBe(1);
    expect(slot0View(session.wallet.get()).balance).toBe(7490); // the U2 ledger: 1990 + (6500 − 1000)
    stepUntil(clock, () => session.engine.state === "betting", check);
    expect([...phases]).toEqual(["idle", "diving", "cashed", "bonus"]);
    expect(session.round.get().participants[0]).toBeNull();
    expect(slot0View(session.wallet.get()).history).toEqual([
      { mult: 650, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("per frame, through a crash round, the store equals the engine's public state", () => {
    const { session, canvas } = makeHarness(2);
    const clock = frameClock();
    session.attachCanvas(canvas);
    const check = () => expect(session.round.get()).toEqual(session.engine.getPublicState());
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "crashed", check);
    expect(session.round.get()).toMatchObject({ phase: "crashed", multiplier: 2 });
    stepUntil(clock, () => session.engine.state === "betting", check);
    expect(slot0View(session.wallet.get()).history).toEqual([{ mult: 2, crashed: true }]);
  });

  it("quiet frames notify nobody: an unchanged engine frame keeps the stored snapshot by reference", () => {
    const { session, canvas } = makeHarness(2);
    const clock = frameClock();
    session.attachCanvas(canvas);
    stepUntil(clock, () => session.engine.state === "crashed");
    clock.step();
    const held = session.round.get();
    const notify = vi.fn();
    session.round.subscribe(notify);
    // During the crash banner the multiplier is locked and no field moves;
    // the engine still builds a new public-state object every frame.
    const reads = new Set<unknown>();
    for (let i = 0; i < 30; i++) {
      clock.step();
      reads.add(session.engine.getPublicState());
      expect(session.engine.state).toBe("crashed");
    }
    expect(reads.size).toBe(30);
    expect(notify).not.toHaveBeenCalled();
    expect(session.round.get()).toBe(held);
  });

  it("a changed field notifies once per frame and keeps unchanged sub-objects by reference", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "diving");
    clock.step();
    const before = session.round.get();
    expect(before.participants[0]).not.toBeNull();
    const notify = vi.fn();
    session.round.subscribe(notify);
    clock.step(); // the multiplier moves; the participant does not
    const after = session.round.get();
    expect(after).not.toBe(before);
    expect(after.multiplier).not.toBe(before.multiplier);
    expect(after.participants[0]).toBe(before.participants[0]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("the engine's live participant object never leaks into a stored snapshot", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "diving");
    const diving = session.round.get();
    const live = session.engine.getPublicState().participants[0]!;
    expect(diving.participants[0]).not.toBe(live);
    expect(Object.isFrozen(diving.participants[0])).toBe(true);

    // At impact the engine flips cashedOut/bonusEligible IN PLACE on that
    // same live object; the snapshot taken during the dive must not change.
    stepUntil(clock, () => session.engine.state === "impact");
    expect(session.engine.getPublicState().participants[0]).toBe(live); // the engine's object is reused…
    expect(live.bonusEligible).toBe(true);
    expect(diving.participants[0]).toEqual({
      betAmount: 10,
      cashedOut: false,
      cashedOutAt: null,
      bonusEligible: false,
    }); // …the old snapshot is untouched…
    expect(session.round.get().participants[0]).not.toBe(diving.participants[0]); // …and the change was seen
    expect(session.round.get().participants[0]?.bonusEligible).toBe(true);
  });

  it("chests: the engine never mutates its array in place, and the store holds a frozen copy anyway", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    let revealed: unknown = null;
    session.engine.events.on("chestsRevealed", ({ chests }) => {
      revealed = chests;
    });
    session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "bonus");
    clock.step();
    const engineChests = session.engine.getPublicState().chests!;
    expect(engineChests).toBe(revealed); // the engine hands the same array to listeners and to the projection
    const contents = JSON.stringify(engineChests);
    const stored = session.round.get().chests!;
    expect(stored).not.toBe(engineChests);
    expect(stored).toEqual(engineChests);
    expect(Object.isFrozen(stored) && stored.every((c) => Object.isFrozen(c))).toBe(true);

    // Through the pick and the result interval: same engine array, same
    // contents (opened is never written), and the stored copy keeps its identity.
    session.submit({ type: "pickChest", chestId: 2 });
    stepUntil(
      clock,
      () => session.engine.state === "betting",
      () => {
        if (session.engine.getPublicState().chests !== null) {
          expect(session.engine.getPublicState().chests).toBe(engineChests);
          expect(JSON.stringify(engineChests)).toBe(contents);
        }
        expect(session.round.get().chests).toBe(stored);
      },
    );

    // A listener holding the engine array can mutate it; the stored
    // snapshot cannot change underneath its readers.
    (engineChests as unknown as Array<{ multiplier: number }>)[0].multiplier = 999;
    expect(stored[0].multiplier).toBe(2);
  });

  it("detach keeps the mirror; re-attach synchronizes once immediately, and notifies only if the engine moved", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    const detach = session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "diving");
    detach();
    const held = session.round.get();
    const notify = vi.fn();
    session.round.subscribe(notify);

    // Production remount: nothing advanced while detached → no change, no notification.
    const detach2 = session.attachCanvas(canvas);
    expect(session.round.get()).toBe(held);
    expect(notify).not.toHaveBeenCalled();
    detach2();

    // Test-only: the engine advanced while detached → the attach write
    // brings the mirror up to date before any frame runs.
    advanceFrames(session.engine, 30);
    expect(session.round.get()).toBe(held);
    session.attachCanvas(canvas);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(session.round.get()).toEqual(session.engine.getPublicState());
  });

  it("E-X1 timeout: an eligible player who never picks ends with chest 0 in the mirror and the unchanged ledger", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    session.attachCanvas(canvas);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "bonus");
    expect(session.round.get().chosenChestId).toBeNull();
    stepUntil(clock, () => session.round.get().chosenChestId !== null);
    expect(session.round.get()).toMatchObject({ phase: "bonus", chosenChestId: 0 });
    expect(slot0View(session.wallet.get()).balance).toBe(2990);
    stepUntil(clock, () => session.engine.state === "betting");
    expect(slot0View(session.wallet.get()).history).toEqual([
      { mult: 200, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("E-X1: manual-cashout players and spectators are never bonus-eligible in the mirror", () => {
    // Manual cashout.
    const a = makeHarness(NEVER_CRASH);
    const clockA = frameClock();
    a.session.attachCanvas(a.canvas);
    a.session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clockA, () => a.session.engine.state === "diving");
    for (let i = 0; i < 30; i++) clockA.step();
    a.session.submit({ type: "cashOut", slot: 0 });
    stepUntil(clockA, () => a.session.engine.state === "bonus");
    expect(a.session.round.get().chests).not.toBeNull();
    expect(a.session.round.get().participants[0]).toMatchObject({
      cashedOut: true,
      bonusEligible: false,
    });
    stepUntil(
      clockA,
      () => a.session.engine.state === "betting",
      () => {
        expect(a.session.round.get().participants[0]?.bonusEligible ?? false).toBe(false);
        expect(a.session.round.get().chosenChestId).toBeNull();
      },
    );

    // Spectator.
    const b = makeHarness(NEVER_CRASH);
    const clockB = frameClock();
    b.session.attachCanvas(b.canvas);
    stepUntil(clockB, () => b.session.engine.state === "bonus");
    expect(b.session.round.get().participants[0]).toBeNull();
    stepUntil(
      clockB,
      () => b.session.engine.state === "betting",
      () => {
        expect(b.session.round.get().chosenChestId).toBeNull();
      },
    );
  });
});

// ----- U5: the bet-input store at session scope (docs/07 §8, §9; delta V4) -----

describe("createGameSession — bet-input ownership (U5, §8/§9)", () => {
  it("is constructed with the session at DEFAULT_BET; construction stays inert", () => {
    const { session, renderers } = makeHarness();
    expect(session.betInputs[0].get()).toBe(DEFAULT_BET);
    expect(DEFAULT_BET).toBe(5);
    expect(renderers).toHaveLength(0);
    expect(pending.size).toBe(0);
    expect(session.engine.tickCount).toBe(0);
  });

  it("each session owns its own bet input (isolation)", () => {
    const a = makeHarness().session;
    const b = makeHarness().session;
    expect(a.betInputs[0]).not.toBe(b.betInputs[0]);
    a.betInputs[0].set(100);
    expect(b.betInputs[0].get()).toBe(DEFAULT_BET);
  });

  it("is independent: a full round of engine events and frames never writes it, and its writes touch no other store", () => {
    const { session, canvas } = makeHarness(NEVER_CRASH);
    const clock = frameClock();
    session.attachCanvas(canvas);
    const notify = vi.fn();
    session.betInputs[0].subscribe(notify);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    stepUntil(clock, () => session.engine.state === "bonus");
    stepUntil(clock, () => session.engine.state === "betting");
    expect(notify).not.toHaveBeenCalled();
    expect(session.betInputs[0].get()).toBe(DEFAULT_BET);

    const wallet = slot0View(session.wallet.get());
    const round = session.round.get();
    const notifications = session.notifications.get();
    session.betInputs[0].set(25);
    session.betInputs[0].halve();
    session.betInputs[0].double(wallet.balance);
    session.betInputs[0].input("");
    expect(notify).toHaveBeenCalledTimes(4);
    expect(slot0View(session.wallet.get())).toBe(wallet);
    expect(session.round.get()).toBe(round);
    expect(session.notifications.get()).toBe(notifications);
  });

  it("survives detach and re-attach (the remount path) unchanged", () => {
    const { session, canvas } = makeHarness();
    const detach = session.attachCanvas(canvas);
    session.betInputs[0].set(25);
    detach();
    session.attachCanvas(canvas);
    expect(session.betInputs[0].get()).toBe(25);
  });
});

describe("createGameSession — M1 stake validity at the submit edge (M1-D1 to M1-D3, docs/07 §23.5)", () => {
  const INVALID = [
    0,
    -0,
    -1,
    0.001,
    0.004,
    0.005,
    0.009,
    1.005,
    0.1 + 0.2,
    NaN,
    Infinity,
    -Infinity,
  ];

  it("every invalid stake is dropped before the engine: no betPlaced, no rejection, no debit, not participating", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);
    for (const amount of INVALID) session.submit({ type: "placeBet", slot: 0, amount });
    advanceFrames(session.engine, 1);
    expect(log).toEqual([]);
    expect(session.engine.getPublicState().participants[0]).toBeNull();
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: DEFAULT_BALANCE,
      participating: false,
      roundBet: 0,
    });
  });

  it("the minimum 0.01 is forwarded and debits exactly one cent; a full round then settles", () => {
    const { session } = makeHarness(NEVER_CRASH);
    session.submit({ type: "placeBet", slot: 0, amount: 0.01 });
    advanceFrames(session.engine, 1);
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: 999.99,
      roundBet: 0.01,
      participating: true,
    });
    expect(session.engine.getPublicState().participants[0]?.betAmount).toBe(0.01);
  });

  it("I3: PLACE BET enabled ⇔ the session forwards the command, over the value matrix (cutoff excluded, D9)", () => {
    const values = [...INVALID, 0.01, 0.02, 0.07, 0.29, 1, 5, 999.99, 1000, 1000.01, 1e9];
    for (const amount of values) {
      const { session } = makeHarness();
      const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);
      const enabled = canPlaceBet(
        { phase: "idle", countdownSeconds: 3 },
        slot0View(session.wallet.get()),
        amount,
      );
      session.submit({ type: "placeBet", slot: 0, amount });
      advanceFrames(session.engine, 1);
      expect(log.length === 1 && log[0].name === "betPlaced", String(amount)).toBe(enabled);
    }
  });
});

describe("createGameSession — submit edge after U5 (D7, D8, D9)", () => {
  it("D7: a non-finite placeBet is dropped at submit (before U5, NaN reached the engine as invalid-amount)", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);
    session.submit({ type: "placeBet", slot: 0, amount: Number.NaN });
    session.submit({ type: "placeBet", slot: 0, amount: Number.POSITIVE_INFINITY });
    session.submit({ type: "placeBet", slot: 0, amount: Number.NEGATIVE_INFINITY });
    advanceFrames(session.engine, 1);
    expect(log).toEqual([]);
    expect(slot0View(session.wallet.get()).balance).toBe(DEFAULT_BALANCE);
  });

  it("D8: two placeBet submits before the tick → one debit; the engine rejects the second as before", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceFrames(session.engine, 1);
    expect(log.map((e) => e.name)).toEqual(["betPlaced", "commandRejected"]);
    expect((log[1].payload as { reason: string }).reason).toBe("already-participating");
    expect(slot0View(session.wallet.get())).toMatchObject({ balance: 990, roundBet: 10 });
  });

  it("D8: two cashOut submits before the tick → one credit, one history entry", () => {
    const { session } = makeHarness(NEVER_CRASH);
    const log = recordEvents(session.engine, ["cashedOut", "commandRejected"]);
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceUntilState(session.engine, "diving");
    advanceFrames(session.engine, 30);
    const m = session.engine.getPublicState().multiplier;
    session.submit({ type: "cashOut", slot: 0 });
    session.submit({ type: "cashOut", slot: 0 });
    advanceFrames(session.engine, 1);
    expect(log.map((e) => e.name)).toEqual(["cashedOut", "commandRejected"]);
    expect((log[1].payload as { reason: string }).reason).toBe("already-cashed-out");
    const win = payoutOracle(10, m);
    expect(slot0View(session.wallet.get())).toMatchObject({
      balance: +(990 + win).toFixed(2),
      history: [{ mult: m, crashed: false }],
    });
  });

  it("D9: the cutoff is UI-only — a bet submitted at or below BET_CUTOFF_SECONDS is still accepted by the session and the engine", () => {
    const { session } = makeHarness();
    const log = recordEvents(session.engine, ["betPlaced", "commandRejected"]);
    while (session.engine.getPublicState().countdownSeconds > 0.1) advanceFrames(session.engine, 1);
    expect(session.engine.state).toBe("betting");
    session.submit({ type: "placeBet", slot: 0, amount: 10 });
    advanceFrames(session.engine, 1);
    expect(log.map((e) => e.name)).toEqual(["betPlaced"]);
    expect(slot0View(session.wallet.get()).balance).toBe(990);
  });
});

// ----- MT-01: Button ⇔ submit over the session matrix (owner D1; docs/07 §23.7, §23.5; I3, I2, I8) -----
//
// For every cell (phase × participation × countdown point × balance) and
// every value of the matrix:
//   P1 (every cell): "the session forwards placeBet to the engine" equals
//      isPlaceableStake(v, balance) equals wallet.canPlaceStake(v);
//   P2 (every cell except the D9 window): PLACE BET enabled equals
//      "forwarded and betPlaced emitted";
//   P3 (D9 window): PLACE BET is disabled, and "accepted" equals "forwarded
//      and not participating" — the one sanctioned asymmetry (the cutoff is
//      UI-only);
//   P4: an accepted bet debits exactly v in cents and I8 holds (the
//      wallet's roundBet is the engine's betAmount); otherwise the wallet
//      snapshot is unchanged.
// The forwarding rule is read literally (P1): session.submit forwards in
// every phase and the engine answers round-state questions (D4), so P2 uses
// "forwarded and accepted", as the I3 test above does.

describe("createGameSession — Button ⇔ submit matrix (MT-01, owner D1; §23.7, §23.5)", () => {
  /** Crashes on the first diving tick (multiplier ≥ 1 at once). */
  const INSTANT_CRASH = 1;

  /** Per-round scripted authority: round n dives with crashPoints[n − 1] (the last entry repeats). */
  const matrixSession = (crashPoints: number[]): GameSession => {
    let round = 0;
    return createGameSession({
      authority: {
        sampleCrashPoint: () => crashPoints[Math.min(round++, crashPoints.length - 1)],
        sampleJackpot: () => 100,
        rollBonusChests: () => [
          { id: 0, multiplier: 2, opened: false },
          { id: 1, multiplier: 6.5, opened: false },
          { id: 2, multiplier: 30, opened: false },
        ],
      },
      worldRng: { next: () => 0.5 },
    });
  };

  const ONE_CENT = adjacentDoubles(0.01);
  const STATIC_VALUES = [
    0,
    -0,
    -1,
    0.001,
    0.004,
    0.005,
    0.009,
    0.01,
    0.02,
    0.07,
    0.1,
    0.29,
    0.3,
    0.57,
    1,
    1.005,
    1.15,
    4.35,
    5,
    8.2,
    999.99,
    1000,
    1e9,
    1e21,
    1e300,
    Number.MAX_VALUE,
    NaN,
    Infinity,
    -Infinity,
    0.1 + 0.2,
    ONE_CENT.below,
    ONE_CENT.above,
    1000.0000000000001,
  ];
  const centsOf = (amount: number) => BigInt(Math.round(amount * 100));
  /** The static values plus b − 0.01, b and b + 0.01, computed in integer cents from the live balance b. */
  const valuesFor = (balance: number) => {
    const b = centsOf(balance);
    return [...STATIC_VALUES, Number(b - 1n) / 100, Number(b) / 100, Number(b + 1n) / 100];
  };
  const label = (cell: string, balance: number, v: number) =>
    `${cell} balance=${balance} v=${Object.is(v, -0) ? "-0" : String(v)}`;

  type SpectatorBalance = 1000 | 0.01 | 0;
  const SPECTATOR_BALANCES: SpectatorBalance[] = [1000, 0.01, 0];
  /** Participating stakes: they leave 990, 0.01 and 0 after the debit. */
  const STAKES = [10, 999.99, 1000];

  /** Tick offsets from the start of a betting window (countdown 5.0 s), measured on a probe session. */
  const windowOffsets = () => {
    const { engine } = matrixSession([NEVER_CRASH]);
    let k = 0;
    while (engine.getPublicState().countdownSeconds > BET_CUTOFF_SECONDS) {
      advanceFrames(engine, 1);
      k++;
    }
    const firstAtOrBelowCutoff = k;
    while (engine.state === "betting") {
      advanceFrames(engine, 1);
      k++;
    }
    return {
      initial: 0,
      lastAboveCutoff: firstAtOrBelowCutoff - 1,
      firstAtOrBelowCutoff,
      lastBetting: k - 1,
    };
  };

  /**
   * A spectator at the start of a betting window with `balance`. 1000 is round
   * 1; 0.01 and 0 are reached by losing round 1 (999.99 or 1000 into an
   * instant crash), and the cell is round 2. The cell round dives with `cellCrash`.
   */
  const spectatorAt = (balance: SpectatorBalance, cellCrash: number): GameSession => {
    if (balance === 1000) return matrixSession([cellCrash]);
    const session = matrixSession([INSTANT_CRASH, cellCrash]);
    session.submit({ type: "placeBet", slot: 0, amount: balance === 0.01 ? 999.99 : 1000 });
    advanceUntilState(session.engine, "crashed");
    advanceUntilState(session.engine, "betting");
    expect(slot0View(session.wallet.get())).toMatchObject({ balance, participating: false });
    return session;
  };

  /** A participant whose bet `stake` was accepted on the first tick of round 1. */
  const participantIn = (stake: number, cellCrash: number): GameSession => {
    const session = matrixSession([cellCrash]);
    session.submit({ type: "placeBet", slot: 0, amount: stake });
    advanceFrames(session.engine, 1);
    expect(slot0View(session.wallet.get())).toMatchObject({ participating: true, roundBet: stake });
    return session;
  };

  /** I8: engine participant ⇔ wallet participating, and the wallet's locked bet is the engine's betAmount. */
  const expectI8 = (session: GameSession, where: string) => {
    const participant = session.engine.getPublicState().participants[0];
    const w = slot0View(session.wallet.get());
    expect(participant !== null, `${where} (I8)`).toBe(w.participating);
    if (participant) expect(w.roundBet, `${where} (I8)`).toBe(participant.betAmount);
  };

  /** P4. */
  const expectP4 = (
    session: GameSession,
    before: SingleSlotWalletView,
    v: number,
    accepted: boolean,
    where: string,
  ) => {
    expectI8(session, where);
    const after = slot0View(session.wallet.get());
    if (accepted) {
      expect(centsOf(before.balance) - centsOf(after.balance), `${where} (P4 debit)`).toBe(
        centsOf(v),
      );
      expect(after.roundBet, `${where} (P4 roundBet)`).toBe(v);
    } else {
      expect(after, `${where} (P4 unchanged)`).toEqual(before);
    }
  };

  /** C1/C2: one value on a fresh session (an acceptance changes the state). */
  const probeOne = (session: GameSession, v: number, d9Window: boolean, where: string) => {
    const { engine, wallet } = session;
    const before = slot0View(wallet.get());
    const placeable = isPlaceableStake(v, before.balance);
    expect(wallet.canPlaceStake(v), `${where} (P1)`).toBe(placeable);
    const action = actionStateFor(engine.getPublicState(), before, v);
    const enabled = action.kind === "placeBet" && action.enabled;

    const placed: number[] = [];
    engine.events.on("betPlaced", ({ amount }) => placed.push(amount));
    const forwards = vi.spyOn(engine, "submit");
    session.submit({ type: "placeBet", slot: 0, amount: v });
    const forwarded = forwards.mock.calls.length === 1;
    forwards.mockRestore();
    advanceFrames(engine, 1);
    const accepted = placed.length === 1;

    expect(forwarded, `${where} (P1)`).toBe(placeable);
    if (d9Window) {
      expect(enabled, `${where} (P3 button)`).toBe(false);
      expect(accepted, `${where} (P3 accepted)`).toBe(forwarded && !before.participating);
    } else {
      expect(enabled, `${where} (P2)`).toBe(forwarded && accepted);
    }
    expectP4(session, before, v, accepted, where);
  };

  /** C3–C12: nothing can be accepted, so every value goes in one batch, applied on one tick. */
  const probeBatch = (
    session: GameSession,
    kind: ReturnType<typeof actionStateFor>["kind"],
    where: string,
  ) => {
    const { engine, wallet } = session;
    const before = slot0View(wallet.get());
    const pub = engine.getPublicState();
    expect(actionStateFor(pub, before, DEFAULT_BET).kind, where).toBe(kind);

    const placed: number[] = [];
    engine.events.on("betPlaced", ({ amount }) => placed.push(amount));
    const forwards = vi.spyOn(engine, "submit");
    const rows = valuesFor(before.balance).map((v) => {
      const at = label(where, before.balance, v);
      const placeable = isPlaceableStake(v, before.balance);
      expect(wallet.canPlaceStake(v), `${at} (P1)`).toBe(placeable);
      const action = actionStateFor(pub, before, v);
      const calls = forwards.mock.calls.length;
      session.submit({ type: "placeBet", slot: 0, amount: v });
      return {
        at,
        placeable,
        enabled: action.kind === "placeBet" && action.enabled,
        forwarded: forwards.mock.calls.length === calls + 1,
      };
    });
    forwards.mockRestore();
    advanceFrames(engine, 1);

    expect(placed, `${where}: no betPlaced`).toEqual([]); // nothing was accepted
    for (const r of rows) {
      expect(r.forwarded, `${r.at} (P1)`).toBe(r.placeable);
      expect(r.enabled, `${r.at} (P2: forwarded ∧ accepted is false)`).toBe(false);
    }
    expectP4(session, before, Number.NaN, false, where);
  };

  it("C1 — idle spectator above the cutoff (5.0 s, last tick above BET_CUTOFF_SECONDS), balances 1000 / 0.01 / 0: P1, P2, P4 per value", () => {
    const at = windowOffsets();
    expect(at.lastAboveCutoff).toBeGreaterThan(at.initial);
    for (const balance of SPECTATOR_BALANCES) {
      for (const offset of [at.initial, at.lastAboveCutoff]) {
        for (const v of valuesFor(balance)) {
          const session = spectatorAt(balance, NEVER_CRASH);
          advanceFrames(session.engine, offset);
          expect(session.engine.state).toBe("betting");
          expect(session.engine.getPublicState().countdownSeconds).toBeGreaterThan(
            BET_CUTOFF_SECONDS,
          );
          probeOne(session, v, false, label(`C1@${offset}`, balance, v));
        }
      }
    }
  }, 120_000);

  it("C2 — idle spectator in the D9 window (first tick at or below the cutoff, last betting tick), balances 1000 / 0.01 / 0: P1, P3, P4 per value", () => {
    const at = windowOffsets();
    expect(at.lastBetting).toBeGreaterThan(at.firstAtOrBelowCutoff);
    for (const balance of SPECTATOR_BALANCES) {
      for (const offset of [at.firstAtOrBelowCutoff, at.lastBetting]) {
        for (const v of valuesFor(balance)) {
          const session = spectatorAt(balance, NEVER_CRASH);
          advanceFrames(session.engine, offset);
          expect(session.engine.state).toBe("betting");
          expect(session.engine.getPublicState().countdownSeconds).toBeLessThanOrEqual(
            BET_CUTOFF_SECONDS,
          );
          probeOne(session, v, true, label(`C2@${offset}`, balance, v));
        }
      }
    }
  }, 120_000);

  it("C3 — idle participant (BET LOCKED) one point above and one below the cutoff, stakes 10 / 999.99 / 1000", () => {
    const at = windowOffsets();
    for (const stake of STAKES) {
      for (const offset of [at.lastAboveCutoff, at.firstAtOrBelowCutoff]) {
        const session = participantIn(stake, NEVER_CRASH);
        advanceFrames(session.engine, offset - 1); // the bet applied on tick 1
        expect(session.engine.state).toBe("betting");
        probeBatch(session, "betLocked", `C3@${offset} stake=${stake}`);
      }
    }
  }, 120_000);

  it("C4–C6 — diving: participant not cashed (CASH OUT), participant cashed (SECURED), spectator (SPECTATING)", () => {
    for (const stake of STAKES) {
      const live = participantIn(stake, NEVER_CRASH);
      advanceUntilState(live.engine, "diving");
      advanceFrames(live.engine, 30);
      probeBatch(live, "cashOut", `C4 stake=${stake}`);

      const cashed = participantIn(stake, NEVER_CRASH);
      advanceUntilState(cashed.engine, "diving");
      advanceFrames(cashed.engine, 30);
      cashed.submit({ type: "cashOut", slot: 0 });
      advanceFrames(cashed.engine, 1);
      expect(slot0View(cashed.wallet.get()).hasCashed).toBe(true);
      probeBatch(cashed, "secured", `C5 stake=${stake}`);
    }
    for (const balance of SPECTATOR_BALANCES) {
      const spectator = spectatorAt(balance, NEVER_CRASH);
      advanceUntilState(spectator.engine, "diving");
      advanceFrames(spectator.engine, 30);
      probeBatch(spectator, "spectating", `C6 balance=${balance}`);
    }
  }, 120_000);

  it("C7–C8 — crashed: lost participant and spectator (WAITING…)", () => {
    for (const stake of STAKES) {
      const lost = participantIn(stake, INSTANT_CRASH);
      advanceUntilState(lost.engine, "crashed");
      expect(slot0View(lost.wallet.get())).toMatchObject({ participating: true, hasCashed: false });
      probeBatch(lost, "waiting", `C7 stake=${stake}`);
    }
    for (const balance of SPECTATOR_BALANCES) {
      const spectator = spectatorAt(balance, INSTANT_CRASH);
      advanceUntilState(spectator.engine, "crashed");
      probeBatch(spectator, "waiting", `C8 balance=${balance}`);
    }
  }, 120_000);

  it("C9–C10 — impact (phase cashed): jackpot participant and spectator (WAITING…)", () => {
    for (const stake of STAKES) {
      const jackpot = participantIn(stake, NEVER_CRASH);
      advanceUntilState(jackpot.engine, "impact");
      expect(jackpot.engine.getPublicState().participants[0]?.bonusEligible).toBe(true);
      expect(slot0View(jackpot.wallet.get())).toMatchObject({
        hasCashed: true,
        settledBy: "jackpot",
      });
      probeBatch(jackpot, "waiting", `C9 stake=${stake}`);
    }
    for (const balance of SPECTATOR_BALANCES) {
      const spectator = spectatorAt(balance, NEVER_CRASH);
      advanceUntilState(spectator.engine, "impact");
      probeBatch(spectator, "waiting", `C10 balance=${balance}`);
    }
  }, 120_000);

  it("C11–C12 — bonus: eligible participant and spectator (WAITING…)", () => {
    for (const stake of STAKES) {
      const eligible = participantIn(stake, NEVER_CRASH);
      advanceUntilState(eligible.engine, "bonus");
      expect(eligible.engine.getPublicState().participants[0]?.bonusEligible).toBe(true);
      probeBatch(eligible, "waiting", `C11 stake=${stake}`);
    }
    for (const balance of SPECTATOR_BALANCES) {
      const spectator = spectatorAt(balance, NEVER_CRASH);
      advanceUntilState(spectator.engine, "bonus");
      probeBatch(spectator, "waiting", `C12 balance=${balance}`);
    }
  }, 120_000);
});
