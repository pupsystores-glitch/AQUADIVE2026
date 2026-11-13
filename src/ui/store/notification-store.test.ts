// Notification store tests (Sprint 4, Commit U4a; docs/07_UI_ARCHITECTURE.md
// §12, §21 tier 2; delta V2). Headless: a manual clock and hand-rolled
// sources stand in for the wall clock, the wallet's flash trigger and the
// engine event bus, so every timing assertion is exact.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineEventMap } from "@/engine";
import { CASH_FLASH_MS, JACKPOT_FLASH_MS } from "@/game/config";
import {
  FLASH_MS,
  REJECTION_HISTORY_LIMIT,
  createNotificationStore,
  systemClock,
  type NotificationClock,
  type NotificationOptions,
  type RejectionRecord,
} from "./notification-store";
import type { FlashKind } from "./wallet-store";

// ----- manual clock -----
interface ManualClock extends NotificationClock {
  advance(ms: number): void;
  pending(): number;
  scheduled: number;
  cleared: number;
}

const manualClock = (): ManualClock => {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const clock: ManualClock = {
    scheduled: 0,
    cleared: 0,
    now: () => t,
    setTimeout: (cb, ms) => {
      clock.scheduled++;
      const id = nextId++;
      timers.set(id, { at: t + ms, cb });
      return id;
    },
    clearTimeout: (handle) => {
      if (timers.delete(handle as number)) clock.cleared++;
    },
    advance: (ms) => {
      const end = t + ms;
      for (;;) {
        let due: [number, { at: number; cb: () => void }] | null = null;
        for (const entry of timers)
          if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].cb();
      }
      t = end;
    },
    pending: () => timers.size,
  };
  return clock;
};

// ----- hand-rolled sources -----
type Listener = (payload: never) => void;

const makeSources = () => {
  const flashListeners = new Set<(kind: FlashKind) => void>();
  const listeners = new Map<keyof EngineEventMap, Set<Listener>>();
  const subscribed: Array<keyof EngineEventMap | "onFlash"> = [];
  return {
    subscribed,
    flashes: {
      onFlash: (listener: (kind: FlashKind) => void) => {
        subscribed.push("onFlash");
        flashListeners.add(listener);
        return () => {
          flashListeners.delete(listener);
        };
      },
    },
    events: {
      on: <K extends keyof EngineEventMap>(name: K, listener: (p: EngineEventMap[K]) => void) => {
        subscribed.push(name);
        const set = listeners.get(name) ?? new Set<Listener>();
        listeners.set(name, set);
        set.add(listener as Listener);
        return () => {
          set.delete(listener as Listener);
        };
      },
    },
    flash: (kind: FlashKind) => {
      for (const l of flashListeners) l(kind);
    },
    emit: <K extends keyof EngineEventMap>(name: K, payload: EngineEventMap[K]) => {
      for (const l of listeners.get(name) ?? []) (l as (p: EngineEventMap[K]) => void)(payload);
    },
  };
};

const setup = (options: Omit<NotificationOptions, "clock"> = {}) => {
  const clock = manualClock();
  const sources = makeSources();
  const store = createNotificationStore(sources, { clock, ...options });
  let notified = 0;
  store.subscribe(() => notified++);
  return { clock, sources, store, notifications: () => notified };
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("notification store — construction", () => {
  it("is inert: no flash, no timer, no rejections; subscribes once to its three sources (diagnostics off)", () => {
    const { clock, sources, store } = setup();
    expect(store.get()).toEqual({ flash: null, rejections: [] });
    expect(clock.scheduled).toBe(0);
    expect(sources.subscribed).toEqual(["onFlash", "bettingOpened", "diveStarted"]);
  });

  it("durations are the shell's values, unchanged", () => {
    expect(FLASH_MS).toEqual({ cashFlash: CASH_FLASH_MS, jackpotFlash: JACKPOT_FLASH_MS });
    expect(FLASH_MS).toEqual({ cashFlash: 1800, jackpotFlash: 2200 });
  });

  it("read surface only: get and subscribe", () => {
    const { store } = setup();
    expect(Object.keys(store).sort()).toEqual(["get", "subscribe"]);
  });
});

describe("notification store — flash lifetime", () => {
  it.each<[FlashKind, number]>([
    ["cashFlash", CASH_FLASH_MS],
    ["jackpotFlash", JACKPOT_FLASH_MS],
  ])("%s is active for exactly its duration (%i ms), then expires", (kind, ms) => {
    const { clock, sources, store, notifications } = setup();
    clock.advance(500);
    sources.flash(kind);
    expect(store.get().flash).toEqual({ kind, seq: 1, startedAt: 500, expiresAt: 500 + ms });
    expect(clock.pending()).toBe(1);
    expect(notifications()).toBe(1);

    clock.advance(ms - 1);
    expect(store.get().flash).not.toBeNull();
    clock.advance(1);
    expect(store.get().flash).toBeNull();
    expect(clock.pending()).toBe(0); // no leaked timer
    expect(notifications()).toBe(2); // shown, cleared — nothing else
  });

  it("a second flash cancels the pending timer and supersedes the first", () => {
    const { clock, sources, store } = setup();
    sources.flash("cashFlash");
    clock.advance(1000);
    sources.flash("jackpotFlash");
    expect(clock.cleared).toBe(1);
    expect(clock.pending()).toBe(1);
    expect(store.get().flash).toMatchObject({ kind: "jackpotFlash", seq: 2, expiresAt: 3200 });

    clock.advance(CASH_FLASH_MS - 1000); // the first flash's original deadline passes
    expect(store.get().flash?.kind).toBe("jackpotFlash");
    clock.advance(JACKPOT_FLASH_MS - (CASH_FLASH_MS - 1000) - 1);
    expect(store.get().flash).not.toBeNull();
    clock.advance(1);
    expect(store.get().flash).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it("a repeated trigger of the same kind restarts the full duration", () => {
    const { clock, sources, store } = setup();
    sources.flash("cashFlash");
    clock.advance(1700);
    sources.flash("cashFlash");
    clock.advance(1799);
    expect(store.get().flash).toMatchObject({ kind: "cashFlash", seq: 2 });
    clock.advance(1);
    expect(store.get().flash).toBeNull();
  });

  it("many rapid triggers leave exactly one pending timer", () => {
    const { clock, sources } = setup();
    for (let i = 0; i < 50; i++) sources.flash(i % 2 ? "cashFlash" : "jackpotFlash");
    expect(clock.pending()).toBe(1);
    expect(clock.scheduled - clock.cleared).toBe(1);
  });
});

describe("notification store — round-transition cancellation", () => {
  it.each(["bettingOpened", "diveStarted"] as const)(
    "%s clears the active flash and cancels its timer",
    (name) => {
      const { clock, sources, store } = setup();
      sources.flash("jackpotFlash");
      clock.advance(100);
      sources.emit(name, { roundId: 2 });
      expect(store.get().flash).toBeNull();
      expect(clock.pending()).toBe(0);
      expect(clock.cleared).toBe(1);
    },
  );

  it("a cancelled timer can never clear a later flash", () => {
    const { clock, sources, store } = setup();
    sources.flash("cashFlash");
    clock.advance(1000);
    sources.emit("bettingOpened", { roundId: 2 });
    sources.flash("jackpotFlash");
    clock.advance(CASH_FLASH_MS); // past the first flash's deadline
    expect(store.get().flash?.kind).toBe("jackpotFlash");
  });

  it("a transition with no active flash does not notify", () => {
    const { sources, notifications } = setup();
    sources.emit("bettingOpened", { roundId: 1 });
    sources.emit("diveStarted", { roundId: 1 });
    expect(notifications()).toBe(0);
  });

  it("the other round events do not touch the flash (the jackpot flash outlives the chest reveal and pick)", () => {
    const { sources, store } = setup();
    sources.flash("jackpotFlash");
    const flash = store.get().flash;
    sources.emit("shipImpact", { roundId: 1, jackpotMultiplier: 100 });
    sources.emit("chestsRevealed", {
      roundId: 1,
      chests: [
        { id: 0, multiplier: 2, opened: false },
        { id: 1, multiplier: 6.5, opened: false },
        { id: 2, multiplier: 30, opened: false },
      ],
    });
    sources.emit("chestPicked", {
      roundId: 1,
      chestId: 1,
      chestMultiplier: 6.5,
      finalMultiplier: 650,
    });
    sources.emit("crashed", { roundId: 1, multiplier: 2 });
    sources.emit("roundEnded", { roundId: 1, outcome: "jackpot" });
    expect(store.get().flash).toBe(flash);
  });
});

describe("notification store — development diagnostics", () => {
  const reject = (sources: ReturnType<typeof makeSources>, i: number) =>
    sources.emit("commandRejected", {
      roundId: i,
      command: { type: "cashOut" },
      reason: "not-diving",
    });

  it("off by default: commandRejected is not subscribed", () => {
    const { sources, store } = setup();
    expect(sources.subscribed).not.toContain("commandRejected");
    reject(sources, 1);
    expect(store.get().rejections).toEqual([]);
  });

  it("opted in (DEV): logs each rejection with command + reason and records it", () => {
    const log = vi.fn<(message: string, detail: RejectionRecord) => void>();
    const { clock, sources, store } = setup({ diagnostics: true, log });
    expect(sources.subscribed).toEqual([
      "onFlash",
      "bettingOpened",
      "diveStarted",
      "commandRejected",
    ]);
    clock.advance(42);
    sources.emit("commandRejected", {
      roundId: 3,
      command: { type: "pickChest", chestId: 2 },
      reason: "not-bonus-eligible",
    });
    const record = {
      roundId: 3,
      command: { type: "pickChest", chestId: 2 },
      reason: "not-bonus-eligible",
      at: 42,
    };
    expect(store.get().rejections).toEqual([record]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[aquadive] command rejected: pickChest (not-bonus-eligible)",
      record,
    );
  });

  it("defaults the sink to console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sources } = setup({ diagnostics: true });
    reject(sources, 1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("the history is bounded, newest first", () => {
    const { sources, store } = setup({ diagnostics: true, log: () => {} });
    for (let i = 1; i <= REJECTION_HISTORY_LIMIT + 5; i++) reject(sources, i);
    const ids = store.get().rejections.map((r) => r.roundId);
    expect(ids).toHaveLength(REJECTION_HISTORY_LIMIT);
    expect(ids[0]).toBe(REJECTION_HISTORY_LIMIT + 5);
    expect(ids.at(-1)).toBe(6);
  });

  it("rejections never touch the flash", () => {
    const { sources, store } = setup({ diagnostics: true, log: () => {} });
    sources.flash("cashFlash");
    const flash = store.get().flash;
    reject(sources, 1);
    expect(store.get().flash).toBe(flash);
  });

  it("production build (DEV false): disabled even when opted in — no subscription, no log", () => {
    vi.stubEnv("DEV", false);
    const log = vi.fn();
    const { sources, store } = setup({ diagnostics: true, log });
    expect(sources.subscribed).not.toContain("commandRejected");
    reject(sources, 1);
    expect(log).not.toHaveBeenCalled();
    expect(store.get().rejections).toEqual([]);
  });
});

describe("notification store — system clock", () => {
  it("resolves the global timers at call time (fake timers installed after construction still apply)", () => {
    const sources = makeSources();
    const store = createNotificationStore(sources); // default systemClock
    vi.useFakeTimers();
    sources.flash("cashFlash");
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(CASH_FLASH_MS - 1);
    expect(store.get().flash).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.get().flash).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clearTimeout cancels a pending system timer", () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const handle = systemClock.setTimeout(fired, 10);
    systemClock.clearTimeout(handle);
    vi.advanceTimersByTime(20);
    expect(fired).not.toHaveBeenCalled();
  });
});
