// The offline Global Round Scheduler (P8-4b-2; owner decisions SD-1 … SD-10): the driver that
// maps an injected monotonic clock onto the pure core (core.ts) and connects it to the approved
// worker source (source.ts). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. NOT a production or
// network component: nothing in the server's startup, HTTP routes or WebSocket gateway imports it
// (boundary tests check it), it creates no timer and no loop, and it refuses a production
// NODE_ENV. There is no reveal protocol (P8-4b-3), no betting, cashout, wallet or settlement.
//
// `GlobalRoundScheduler.create({ clock, source })`:
//
// - accepts exactly `clock` (a MonotonicClock), `source` (a PrepWorkerRoundSource from
//   `PrepWorkerRoundSource.start`, unused; any other object is refused) and optional
//   `eventCapacity`;
// - reads the caller's options exactly ONCE (H-1 correction): the options object must be a plain,
//   non-Proxy object whose keys are own DATA properties (a getter is refused); each value is taken
//   from that one read, the clock's `nowNs` method is taken once, and only these captured,
//   verified references are used afterwards. Nothing of the caller's object is ever read again,
//   so a getter or Proxy cannot show the approved source to the check and another one to the
//   scheduler. Malformed or hostile options are refused with fixed codes before anything starts;
//   a refusal does not use up the process's one scheduler;
// - at most ONE scheduler per process, ever (one global authority; a halted scheduler is never
//   replaced in the same process — that would be a restart): a second `create` is refused with
//   `duplicate-instance`. The record is a non-configurable property of `process` (R-1), shared
//   by every module instance, so a fresh copy of this module (module cache entry deleted) is
//   refused as well; code that pre-sets it only prevents the scheduler (fail closed);
// - verifies the build and this module's loaded closure against the trusted manifest;
// - binds the source through the module-private source binder (R-1; source.ts), claimed as this
//   module loads: a source has no public method that binds a listener or requests a round.
//
// Source authenticity (R-1 correction). A prepared result is admitted only if its seal was made
// by THIS scheduler's source for itself (the binding's `owns`, sealed.ts `sealedBy`); anything
// else — a test seal, another source's seal — is discarded unopened and halts the scheduler as a
// source contract violation (the source is terminated). The scheduler modules' classes,
// prototypes and CommonJS exports are frozen as they load, so no method on the path from the
// source to the disclosure cursor (bind, seal, deliver, open, the event log) can be
// replaced or intercepted afterwards; the preparation and RoundScript modules do the same for
// the controller's verifier path (R-1b correction). NOT covered (no in-process check can be):
// code that rewrites shared built-ins (e.g. EventEmitter or Promise on the worker channel) or
// runs before these modules load, module loader hooks, the inspector, a patched build (server
// README §18, A-1).
//
// `start()` reads the clock once: that reading is the epoch, global tick 0. `poll()` reads the
// clock and lets the core process every tick up to `ticksElapsed(epoch, now)` — a late or
// irregular poll processes more ticks in order. A source result is handled the moment it settles:
// the core is first caught up to the tick of that moment, then the result is applied at that tick
// (so a script that arrives after its admission tick has passed is never admitted). A late poll
// can therefore cross a round's opening and its admission tick in one catch-up, which then halts
// on a missed deadline exactly as a timely poll would have (the request is sent at the opening
// tick, after the catch-up). A worker loss noticed with no request pending (`checkHealth`) is
// applied BEFORE newer ticks are processed. Events never carry a processing time.
//
// Clock safety (L-1 correction). Every reading is checked BEFORE it is used: a clock that throws,
// returns anything but a bigint, a negative value, a value below the previous reading
// (backwards), or one past the largest tick, FAILS CLOSED: nothing of that reading is processed,
// the core halts at once at its last processed tick with `clock-failed` (the active round, if any,
// is interrupted: never "completed"), and `start` / `poll` throw `clock-failed: <fixed reason>`.
// An invalid reading at `start` halts the timeline at tick 0 with nothing requested. A stalled
// clock (equal readings) is valid monotonic time: no ticks pass.
//
// Fail closed on anything unexpected (L-2 correction). Each step (start, poll, stop, a source
// result) runs inside one guard: an error halts the core at once (`internal-error`; the source is
// terminated) or with `clock-failed`, every queued sealed script is discarded unopened, effects
// of the interrupted step are dropped (no request after a halt), and nothing is retried. A
// synchronous call rethrows a fixed-code SchedulerError; an asynchronous source result has no
// caller, so its failure is contained (no unhandled rejection) and visible as the halt. A result
// that settles after the halt is discarded unopened and changes nothing.
//
// Halts (core.ts): after a contract violation or an internal error the source is terminated at
// once; otherwise it is left as it is (its chain holds the reveal records of played rounds until
// `close()`; the reveal protocol is P8-4b-3). Nothing is restarted or retried.

import { isProxy as isProxyExport } from "node:util/types";
import { createNodeFairnessCrypto as createNodeFairnessCryptoExport } from "../fairness/crypto-node";
import {
  SchedulerCore,
  type CoreEffect,
  type Residency,
  type SchedulerChain,
  type SchedulerSnapshot,
} from "./core";
import { ticksElapsed, type MonotonicClock } from "./clock";
import { SchedulerError, type SchedulerEvent } from "./events";
import {
  SCHEDULER_DRIVER_LOCATION,
  claimSourceBinder,
  isApprovedSource,
  verifySchedulerBuild,
  type PrepWorkerRoundSource,
  type SourceAccess,
  type SourceEvent,
} from "./source";

/** R-1: external references bound ONCE, as this module loads. */
const isProxy = isProxyExport;
const createNodeFairnessCrypto = createNodeFairnessCryptoExport;
/** R-1: the source binder (source.ts), claimed as this module loads. */
const bindSource = claimSourceBinder();
/** R-1 / A-2: the process-wide record of THE scheduler (every module instance sees it). */
const PROCESS_MARK = Symbol.for("aquadive.offline-global-round-scheduler.v1");

export interface GlobalRoundSchedulerOptions {
  readonly clock: MonotonicClock;
  readonly source: PrepWorkerRoundSource;
  readonly eventCapacity?: number;
}

/** The options as read ONCE from the caller and verified (H-1): never the caller's object. */
interface VerifiedOptions {
  readonly clock: object;
  readonly nowNs: (...args: never[]) => unknown;
  readonly source: PrepWorkerRoundSource;
  readonly eventCapacity: unknown;
}

const OPTION_KEYS: readonly string[] = Object.freeze(["clock", "source", "eventCapacity"]);
const CONSTRUCT: object = Object.freeze(Object.create(null));
const INSPECT = Symbol.for("nodejs.util.inspect.custom");
/** One global authority per process, for the process's lifetime. */
let created = false;

/**
 * Snapshots the caller's options: one ownKeys and one descriptor read per key; Proxies and
 * accessor properties are refused; then the clock's `nowNs` is read once.
 */
function readOptions(options: unknown): VerifiedOptions {
  const values = new Map<string, unknown>();
  try {
    if (typeof options !== "object" || options === null || isProxy(options)) throw options;
    if (Array.isArray(options)) throw options;
    for (const key of Reflect.ownKeys(options)) {
      if (typeof key !== "string" || !OPTION_KEYS.includes(key)) throw key;
      const d = Reflect.getOwnPropertyDescriptor(options, key);
      if (d === undefined || !Object.hasOwn(d, "value")) throw key; // a getter / setter
      values.set(key, d.value);
    }
  } catch {
    throw new SchedulerError("invalid-argument", "invalid-options");
  }
  const clock = values.get("clock");
  let nowNs: unknown;
  try {
    if (typeof clock !== "object" || clock === null || isProxy(clock)) throw clock;
    nowNs = (clock as { readonly nowNs?: unknown }).nowNs; // read ONCE
  } catch {
    throw new SchedulerError("invalid-argument", "invalid-clock");
  }
  if (typeof nowNs !== "function" || isProxy(nowNs)) {
    throw new SchedulerError("invalid-argument", "invalid-clock");
  }
  const source = values.get("source");
  if (!isApprovedSource(source)) throw new SchedulerError("source-not-approved");
  return Object.freeze({
    clock,
    nowNs: nowNs as VerifiedOptions["nowNs"],
    source,
    eventCapacity: values.get("eventCapacity"),
  });
}

/** Drops a never-played script unopened (idempotent; a failure event carries none). */
const discardEvent = (event: SourceEvent): void => {
  if (event.kind !== "prepared") return;
  try {
    event.sealed.discard();
  } catch {
    // not a seal: nothing to drop
  }
};

export class GlobalRoundScheduler {
  readonly chain: SchedulerChain;
  readonly #clock: object;
  readonly #nowNs: (...args: never[]) => unknown;
  readonly #source: PrepWorkerRoundSource;
  readonly #core: SchedulerCore;
  #epoch: bigint | null = null;
  /** The last valid clock reading (readings never go backwards). */
  #lastNs: bigint | null = null;
  /** Source events not yet applied (a source may report inside an effect). */
  readonly #inbox: SourceEvent[] = [];
  #busy = false;
  /** Set only if even the fail-closed halt failed: the scheduler then does nothing at all. */
  #broken = false;
  /** The source's request capability and seal check (from its one-time binding; R-1). */
  #access: SourceAccess | null = null;

  private constructor(capability: unknown, verified: VerifiedOptions) {
    if (capability !== CONSTRUCT) throw new SchedulerError("invalid-state", "construction-refused");
    this.#clock = verified.clock;
    this.#nowNs = verified.nowNs;
    this.#source = verified.source;
    this.chain = verified.source.chain;
    // The core keeps its own hash provider instance (the build's verified fairness crypto).
    this.#core = new SchedulerCore({
      chain: this.chain,
      hash: createNodeFairnessCrypto().hash,
      ...(verified.eventCapacity === undefined
        ? {}
        : { eventCapacity: verified.eventCapacity as number }),
    });
    Object.freeze(this);
  }

  /** Creates THE scheduler of this process (see the file comment). */
  static create(options: GlobalRoundSchedulerOptions): GlobalRoundScheduler {
    if (process.env.NODE_ENV === "production") {
      throw new SchedulerError("development-only", "production-refused");
    }
    const verified = readOptions(options);
    const source = verified.source;
    if (source.state !== "ready") throw new SchedulerError("invalid-state", "source-not-ready");
    if (created || Object.hasOwn(process, PROCESS_MARK)) {
      throw new SchedulerError("duplicate-instance");
    }
    verifySchedulerBuild([SCHEDULER_DRIVER_LOCATION]);
    // Constructed and bound first: an invalid option must not use up the process's one scheduler.
    const scheduler = new GlobalRoundScheduler(CONSTRUCT, verified);
    const access = bindSource(source, (event) => scheduler.#receive(event));
    created = true;
    const marked = Reflect.defineProperty(process, PROCESS_MARK, {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    if (!marked) {
      void source.terminate(); // bound to a scheduler that is never returned
      throw new SchedulerError("duplicate-instance");
    }
    scheduler.#access = access;
    return scheduler;
  }

  get state(): SchedulerSnapshot["state"] {
    return this.#broken ? "halted" : this.#core.state;
  }

  /** Running SHA-256 over every public event. */
  get digest(): string {
    return this.#core.digest;
  }

  /** Starts the timeline: the clock's reading now is global tick 0. */
  start(): void {
    if (this.#busy) throw new SchedulerError("invalid-state", "re-entrant");
    if (this.#broken || this.#core.state !== "created") {
      throw new SchedulerError("invalid-state", "started");
    }
    let epoch: bigint;
    this.#busy = true;
    try {
      epoch = this.#read();
    } catch (error) {
      // Never started on an invalid reading: the timeline halts at tick 0, nothing is requested.
      try {
        this.#core.start();
        this.#core.fault("clock-failed");
      } catch {
        this.#broken = true;
      }
      throw error;
    } finally {
      this.#busy = false;
    }
    this.#epoch = epoch;
    this.#run(() => this.#core.start());
  }

  /** Processes every tick up to the clock's current reading (no-op once halted). */
  poll(): void {
    if (!this.#broken && this.#core.state === "created") {
      throw new SchedulerError("invalid-state", "not-started");
    }
    if (!this.#live()) return;
    const epoch = this.#epoch!;
    this.#run(() => {
      const tick = this.#tickNow(epoch); // first: an invalid reading processes nothing
      if (this.#source.checkHealth()) this.#apply(this.#core.sourceFailed("lost"));
      return this.#core.advanceTo(tick);
    });
  }

  /** Owner stop: immediate halt (the active round is interrupted). The source stays open. */
  stop(): void {
    if (!this.#broken && this.#core.state === "created") {
      throw new SchedulerError("invalid-state", "not-started");
    }
    if (!this.#live()) return;
    this.#run(() => this.#core.stop());
  }

  /** Owner shutdown: stops (if still running) and closes the source. */
  async close(): Promise<void> {
    if (this.#live()) {
      try {
        this.stop();
      } catch {
        // #run failed closed: the core is halted
      }
    }
    await this.#source.close();
  }

  snapshot(): SchedulerSnapshot {
    return this.#core.snapshot();
  }

  events(afterSeq = 0): readonly SchedulerEvent[] {
    return this.#core.events(afterSeq);
  }

  /** INTERNAL diagnostics (offline tests only): NOT public state (it reflects arrival times). */
  residency(): Residency {
    return this.#core.residency();
  }

  toJSON(): { scheduler: string; state: SchedulerSnapshot["state"] } {
    return { scheduler: "GlobalRoundScheduler", state: this.state };
  }

  [INSPECT](): string {
    return `GlobalRoundScheduler(${this.state})`;
  }

  /** Running or halting (not created, not halted, not broken). */
  #live(): boolean {
    const s = this.#core.state;
    return !this.#broken && (s === "running" || s === "halting");
  }

  /** One checked clock reading (see the file comment); throws `clock-failed` otherwise. */
  #read(): bigint {
    let now: unknown;
    try {
      now = Reflect.apply(this.#nowNs, this.#clock, []);
    } catch {
      throw new SchedulerError("clock-failed", "clock-threw");
    }
    if (typeof now !== "bigint") throw new SchedulerError("clock-failed", "invalid-reading");
    if (now < 0n) throw new SchedulerError("clock-failed", "negative-reading");
    if (this.#lastNs !== null && now < this.#lastNs) {
      throw new SchedulerError("clock-failed", "clock-backwards");
    }
    this.#lastNs = now;
    return now;
  }

  /** The global tick of a checked reading now. */
  #tickNow(epoch: bigint): number {
    const now = this.#read();
    try {
      return ticksElapsed(epoch, now);
    } catch {
      throw new SchedulerError("clock-failed", "tick-overflow");
    }
  }

  /** Runs one core step, then every queued source event, strictly one at a time; fails closed. */
  #run(step: () => readonly CoreEffect[]): void {
    if (this.#busy) throw new SchedulerError("invalid-state", "re-entrant");
    this.#busy = true;
    try {
      this.#apply(step());
      while (this.#inbox.length > 0) this.#handle(this.#inbox.shift()!);
    } catch (error) {
      throw this.#failClosed(error);
    } finally {
      this.#busy = false;
    }
  }

  /**
   * An error interrupted a step: halt at once (`clock-failed` or `internal-error`), discard every
   * queued script unopened, never apply the step's remaining effects. Returns the error to throw.
   */
  #failClosed(error: unknown): SchedulerError {
    const clock = error instanceof SchedulerError && error.code === "clock-failed";
    for (const event of this.#inbox.splice(0)) discardEvent(event);
    try {
      this.#core.fault(clock ? "clock-failed" : "internal-error");
    } catch {
      this.#broken = true;
    }
    if (!clock || this.#broken) void this.#source.terminate();
    return error instanceof SchedulerError
      ? error
      : new SchedulerError("invalid-state", "internal-error");
  }

  #receive(event: SourceEvent): void {
    try {
      if (!this.#live()) return discardEvent(event);
      this.#inbox.push(event);
      if (!this.#busy) this.#run(() => []);
    } catch {
      // #run already failed closed (halted, queued scripts discarded). An asynchronous result has
      // no caller to report to: the halt is visible in the state and the event log.
      discardEvent(event);
    }
  }

  /** Applies one source event at the tick of this moment (catching the core up first). */
  #handle(event: SourceEvent): void {
    if (!this.#live()) return discardEvent(event);
    try {
      const tick = this.#tickNow(this.#epoch!); // first: an invalid reading processes nothing
      // A loss noticed now is applied first: a script delivered by a lost worker is never played.
      if (this.#source.checkHealth()) this.#apply(this.#core.sourceFailed("lost"));
      this.#apply(this.#core.advanceTo(tick));
      if (event.kind !== "prepared") {
        this.#apply(this.#core.sourceFailed(event.failure));
      } else if (!this.#access!.owns(event.sealed)) {
        // R-1: not sealed by THIS scheduler's source: never admitted, never opened.
        discardEvent(event);
        this.#apply(this.#core.sourceFailed("contract-violation"));
      } else {
        this.#apply(this.#core.deliver(event.sealed));
      }
    } catch (error) {
      discardEvent(event);
      throw error;
    }
  }

  #apply(effects: readonly CoreEffect[]): void {
    for (const effect of effects) {
      if (effect.type === "prepare") this.#access!.request(effect.roundNumber);
      else if (effect.reason === "source-contract-violation") void this.#source.terminate();
    }
  }
}

// R-1: nothing of this module can be replaced once it has loaded. The compiled build's CommonJS
// exports object is frozen too (an ES module namespace, as under Vitest, is immutable already).
Object.freeze(GlobalRoundScheduler);
Object.freeze(GlobalRoundScheduler.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
