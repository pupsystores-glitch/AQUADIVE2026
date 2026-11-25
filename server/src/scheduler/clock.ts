// Monotonic clocks and exact tick arithmetic of the offline Global Round Scheduler (P8-4b-2).
// PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Not connected to the server's startup, HTTP routes or
// WebSocket gateway.
//
// Time is an injected MONOTONIC clock that reads whole nanoseconds as a bigint. The scheduler
// never accumulates time deltas: global tick k has the fixed scheduled instant
//
//   instant(k) = epoch + floor(k · 1e9 / 60)   (nanoseconds, bigint)
//
// computed from the one scheduler epoch every time, so tick k's instant is exact whatever
// happened before it (no drift over any number of rounds), and the tick reached at a monotonic
// reading `now` is the largest k with instant(k) ≤ now (`ticksElapsed`). A late wakeup only
// raises the number of ticks the scheduler then processes in order; it never changes which tick
// an instant belongs to.
//
// `SimulatedClock` is the test clock (set or advance it by whole nanoseconds). The real adapter
// (`createMonotonicClock`, process.hrtime.bigint) exists but is NOT WIRED to anything: nothing in
// this milestone starts a timer or a loop.

import { SchedulerError } from "./events";

/** The fixed simulation rate (engine TICK_SECONDS = 1 / 60). */
export const TICKS_PER_SECOND = 60n;
export const NANOS_PER_SECOND = 1_000_000_000n;
/** The largest global tick the scheduler accepts (≈ 4.76 million years at 60 Hz). */
export const MAX_GLOBAL_TICK = Number.MAX_SAFE_INTEGER;

/** A monotonic clock: whole nanoseconds, never decreasing. */
export interface MonotonicClock {
  nowNs(): bigint;
}

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** Scheduled instant of global tick `tick` (≥ 0) from `epochNs`. Exact; no accumulation. */
export function tickInstantNs(epochNs: bigint, tick: number): bigint {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new SchedulerError("invalid-argument", "invalid-tick");
  }
  return epochNs + (BigInt(tick) * NANOS_PER_SECOND) / TICKS_PER_SECOND;
}

/**
 * The global tick reached at monotonic reading `nowNs`: the largest k ≥ 0 with
 * tickInstantNs(epochNs, k) ≤ nowNs, or −1 before the epoch.
 * floor(k·1e9/60) ≤ d  ⟺  k·1e9 < 60·(d + 1)  ⟺  k ≤ ⌊(60·(d + 1) − 1) / 1e9⌋.
 */
export function ticksElapsed(epochNs: bigint, nowNs: bigint): number {
  if (typeof epochNs !== "bigint" || typeof nowNs !== "bigint") {
    throw new SchedulerError("invalid-argument", "invalid-instant");
  }
  const d = nowNs - epochNs;
  if (d < 0n) return -1;
  const k = (TICKS_PER_SECOND * (d + 1n) - 1n) / NANOS_PER_SECOND;
  if (k > BigInt(MAX_GLOBAL_TICK)) throw new SchedulerError("invalid-argument", "tick-overflow");
  return Number(k);
}

/** TEST clock: starts at `startNs`, moves only when told to, never backwards. */
export class SimulatedClock implements MonotonicClock {
  #now: bigint;

  constructor(startNs: bigint = 0n) {
    if (typeof startNs !== "bigint" || startNs < 0n) {
      throw new SchedulerError("invalid-argument", "invalid-instant");
    }
    this.#now = startNs;
  }

  nowNs(): bigint {
    return this.#now;
  }

  /** Moves the clock forward by `deltaNs` (≥ 0). */
  advanceNs(deltaNs: bigint): void {
    if (typeof deltaNs !== "bigint" || deltaNs < 0n) {
      throw new SchedulerError("invalid-argument", "clock-backwards");
    }
    this.#now += deltaNs;
  }

  /** Sets the clock to `nowNs` (≥ the current reading). */
  setNs(nowNs: bigint): void {
    if (typeof nowNs !== "bigint" || nowNs < this.#now) {
      throw new SchedulerError("invalid-argument", "clock-backwards");
    }
    this.#now = nowNs;
  }

  toJSON(): { clock: string } {
    return { clock: "SimulatedClock" };
  }

  [INSPECT](): string {
    return "SimulatedClock";
  }
}

/**
 * The real monotonic clock (process.hrtime.bigint). Implemented for a later milestone and NOT
 * WIRED: nothing in P8-4b-2 creates it outside tests. A reading that goes backwards (not expected
 * of hrtime) is refused rather than used.
 */
export function createMonotonicClock(): MonotonicClock {
  let last = -1n;
  return Object.freeze({
    nowNs(): bigint {
      const now = process.hrtime.bigint();
      if (now < last) throw new SchedulerError("clock-failed", "clock-backwards");
      last = now;
      return now;
    },
  });
}
