// Notification store — flash timing + dev rejection diagnostics
// (docs/07_UI_ARCHITECTURE.md §12). Sprint 4, Commit U4a (delta V2).
//
// Owns, for the lifetime of the game session (never a component mount):
//
// - The active win flash: which kind, when it started, when it expires. At
//   most one flash is active; a new trigger cancels the pending timer and
//   supersedes the current flash. The flash carries no money: the banner's
//   amount is the wallet's `lastWin` (the single owner of money, §6).
// - The flash timer. Durations are verbatim from the component shell:
//   CASH_FLASH_MS for a manual cashout, JACKPOT_FLASH_MS for the jackpot
//   auto-cash. The clock is injectable so tests are deterministic; the
//   production clock reads the global setTimeout at call time.
// - Development diagnostics: every `commandRejected` is logged and kept in
//   a bounded history (newest first). Gated by `import.meta.env.DEV` AND
//   the caller's opt-in, so production never subscribes and the branch is
//   compiled out. The visual dev banner is deferred to U6 (owner decision
//   2026-11-13); U4a lands the log and the history only.
//
// Writers (§9 one-writer rule, all inside this module): the wallet's flash
// trigger (`onFlash` — the wallet decides WHEN a flash is due, settlement
// stays there), the round-transition events `bettingOpened` and
// `diveStarted` (clear the flash and cancel its timer — the events on which
// the shell cleared it), the store's own timer (expiry), and — dev only —
// `commandRejected`. The read surface is get/subscribe only.
//
// No React, no DOM. Construction schedules nothing, so building the
// session at module scope stays SSR-safe.

import type { EngineCommand, EngineEventMap, EventBus } from "@/engine";
import { CASH_FLASH_MS, JACKPOT_FLASH_MS } from "@/game/config";
import { createStore, type ReadableStore } from "./store";
import type { FlashKind, WalletStore } from "./wallet-store";

/** Flash durations per kind — values unchanged from the component shell (V2). */
export const FLASH_MS: Readonly<Record<FlashKind, number>> = {
  cashFlash: CASH_FLASH_MS,
  jackpotFlash: JACKPOT_FLASH_MS,
};

/** Rejection records kept by the dev diagnostics (bounded; oldest dropped). */
export const REJECTION_HISTORY_LIMIT = 20;

/** Opaque timer handle (number in browsers, Timeout in Node). */
export type TimerHandle = unknown;

/** The wall-clock surface the store uses — injectable for deterministic tests (§6: notification timing is the one sanctioned wall-clock use in src/ui). */
export interface NotificationClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

/** Production clock. Resolves the globals at call time (never at construction). */
export const systemClock: NotificationClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ActiveFlash {
  readonly kind: FlashKind;
  /** Monotonic per store; lets a superseded timer recognize it is stale. */
  readonly seq: number;
  readonly startedAt: number;
  readonly expiresAt: number;
}

export interface RejectionRecord {
  readonly roundId: number;
  readonly command: EngineCommand;
  readonly reason: string;
  readonly at: number;
}

export interface NotificationState {
  /** The active win flash, or null. */
  readonly flash: ActiveFlash | null;
  /** Dev diagnostics only: recent command rejections, newest first. Always empty in production. */
  readonly rejections: readonly RejectionRecord[];
}

export type NotificationStore = ReadableStore<NotificationState>;

/** The two sources the store listens to. */
export interface NotificationSources {
  flashes: Pick<WalletStore, "onFlash">;
  events: Pick<EventBus<EngineEventMap>, "on">;
}

export type RejectionLogger = (message: string, detail: RejectionRecord) => void;

export interface NotificationOptions {
  clock?: NotificationClock;
  /** Opt in to the dev rejection diagnostics. Effective only when import.meta.env.DEV is true. Default false. */
  diagnostics?: boolean;
  /** Diagnostics sink. Default console.warn. */
  log?: RejectionLogger;
}

const INITIAL_NOTIFICATIONS: NotificationState = { flash: null, rejections: [] };

/**
 * Create the notification store and subscribe it to its sources for the
 * lifetime of the session. Called once per game session (§8).
 */
export function createNotificationStore(
  sources: NotificationSources,
  options: NotificationOptions = {},
): NotificationStore {
  const clock = options.clock ?? systemClock;
  const store = createStore<NotificationState>(INITIAL_NOTIFICATIONS);
  let timer: TimerHandle | null = null;
  let seq = 0;

  const cancelTimer = () => {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };

  const clearFlash = () => {
    cancelTimer();
    const s = store.get();
    if (s.flash !== null) store.set({ ...s, flash: null });
  };

  sources.flashes.onFlash((kind) => {
    cancelTimer(); // supersede: at most one pending flash timer
    const startedAt = clock.now();
    const flash: ActiveFlash = {
      kind,
      seq: ++seq,
      startedAt,
      expiresAt: startedAt + FLASH_MS[kind],
    };
    store.set({ ...store.get(), flash });
    timer = clock.setTimeout(() => {
      timer = null;
      const s = store.get();
      if (s.flash !== null && s.flash.seq === flash.seq) store.set({ ...s, flash: null });
    }, FLASH_MS[kind]);
  });

  // Round transitions: the events on which the shell cleared its flash.
  sources.events.on("bettingOpened", clearFlash);
  sources.events.on("diveStarted", clearFlash);

  // Dev diagnostics (§12): compiled out of production builds.
  if (import.meta.env.DEV && options.diagnostics) {
    const log: RejectionLogger =
      options.log ?? ((message, detail) => console.warn(message, detail));
    sources.events.on("commandRejected", ({ roundId, command, reason }) => {
      const record: RejectionRecord = { roundId, command, reason, at: clock.now() };
      const s = store.get();
      store.set({
        ...s,
        rejections: [record, ...s.rejections].slice(0, REJECTION_HISTORY_LIMIT),
      });
      log(`[aquadive] command rejected: ${command.type} (${reason})`, record);
    });
  }

  return { get: store.get, subscribe: store.subscribe };
}
