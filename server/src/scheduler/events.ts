// Public events, fixed-code errors and the bounded event log of the offline Global Round
// Scheduler (P8-4b-2). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Nothing is broadcast, routed or
// persisted: the log lives in memory and is read by tests.
//
// Every event is a frozen plain object with keys in exactly this order:
//
//   { seq, tick, type, round, ...fields of its type, in the order of EVENT_FIELDS }
//
// `seq` starts at 1 and increases by exactly 1; `tick` is the AUTHORITATIVE global tick the event
// belongs to (never a wall-clock or processing time, so a late wakeup cannot change it) and never
// decreases; `round` is the round number or null. Every value is public at `tick`: an event never
// carries a future multiplier sample, a future terminal or end tick, a RoundScript digest, a seed,
// a salt or the world stream (OD-5: no creature data; a goldfish consumption is `round.boost`
// with no creature id).
//
// The log keeps at most `capacity` events (the oldest are dropped; `seq` continues) and a running
// SHA-256 over every event ever appended:
//
//   h0 = SHA-256(UTF-8("AQUADIVE|scheduler|event-log|v1"))
//   hi = SHA-256(h(i−1) ‖ UTF-8(JSON.stringify(event i)))
//
// so two logs are equal iff their digests are (a test recomputes it with node:crypto).

import { bytesToHex, sha256, type FairnessHashProvider } from "../fairness";

// ---- Errors -----------------------------------------------------------------------------------

export type SchedulerErrorCode =
  /** A malformed argument (tick, instant, option, request). */
  | "invalid-argument"
  /** The operation is not allowed in the scheduler's current state. */
  | "invalid-state"
  /** A development-only component was asked to run in production. */
  | "development-only"
  /** A second Global Round Scheduler in this process (one global authority). */
  | "duplicate-instance"
  /** A round source that did not come from the approved worker adapter. */
  | "source-not-approved"
  /** The round source could not start or failed (`reason`: a fixed code). */
  | "source-failed"
  /** A sealed script was opened twice, or something other than a sealed script was offered. */
  | "sealed-misuse"
  /** A prepared round broke the source contract (index, chain, timeline). */
  | "contract-violation"
  /** The build does not match the trusted integrity manifest (`reason`: fixed code). */
  | "integrity-failed"
  /** The monotonic clock misbehaved. */
  | "clock-failed";

const REASON_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** Fixed code and, at most, one fixed kebab-case reason. Never a value, tick, digest or path. */
export class SchedulerError extends Error {
  readonly code: SchedulerErrorCode;
  readonly reason: string | null;

  constructor(code: SchedulerErrorCode, reason: unknown = null) {
    const fixed = typeof reason === "string" && REASON_PATTERN.test(reason) ? reason : null;
    super(fixed === null ? code : `${code}: ${fixed}`);
    this.name = "SchedulerError";
    this.code = code;
    this.reason = fixed;
  }
}

// ---- Events -----------------------------------------------------------------------------------

/** Why the scheduler halts (fail closed; none of these is a void, refund or settlement policy). */
export type HaltReason =
  | "admission-deadline-missed"
  | "chain-exhausted"
  | "source-lost"
  | "preparation-failed"
  | "source-contract-violation"
  | "owner-stopped"
  /** The injected clock threw, went backwards or gave an invalid reading (driver). */
  | "clock-failed"
  /** An unexpected error inside the driver or the core (fail closed; the source is stopped). */
  | "internal-error";

/** Reveal status of a round at its end. The reveal protocol itself is P8-4b-3 (SD-7). */
export type RevealStatus = "deferred" | "unavailable";
/** What the round source reported. */
export type SourceFailure = "lost" | "preparation-failed" | "contract-violation";

/** The ordered type-specific fields of every event type (after seq, tick, type, round). */
export const EVENT_FIELDS = Object.freeze({
  "scheduler.started": ["firstOpeningTick"],
  "round.admitted": ["roundId", "chainIndex"],
  "round.betting": ["roundId", "closesAtTick"],
  "round.dive": [],
  "round.boost": [],
  "round.crashed": ["crashAt", "endsAtTick"],
  "round.impact": ["jackpot", "bonusAtTick"],
  "round.bonus": ["closesAtTick"],
  "round.chests": ["chests", "endsAtTick"],
  "round.ended": ["outcome", "reveal"],
  "source.failed": ["failure"],
  "scheduler.halting": ["reason"],
  "scheduler.halted": ["reason", "interruptedRound"],
} as const);

export type SchedulerEventType = keyof typeof EVENT_FIELDS;

export interface SchedulerEventBase {
  readonly seq: number;
  readonly tick: number;
  readonly type: SchedulerEventType;
  readonly round: number | null;
}

export type SchedulerEvent = SchedulerEventBase & Readonly<Record<string, unknown>>;

const LOG_DOMAIN = "AQUADIVE|scheduler|event-log|v1";
export const DEFAULT_EVENT_CAPACITY = 1024;
export const MIN_EVENT_CAPACITY = 16;
export const MAX_EVENT_CAPACITY = 65_536;

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** The bounded, append-only, hash-chained event log (see the file comment). */
export class EventLog {
  readonly capacity: number;
  readonly #hash: FairnessHashProvider;
  readonly #ring: (SchedulerEvent | undefined)[];
  #head = 0; // index of the oldest retained event
  #size = 0;
  #seq = 0;
  #lastTick = 0;
  #digest: Uint8Array;

  constructor(hash: FairnessHashProvider, capacity: number = DEFAULT_EVENT_CAPACITY) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < MIN_EVENT_CAPACITY ||
      capacity > MAX_EVENT_CAPACITY
    ) {
      throw new SchedulerError("invalid-argument", "invalid-capacity");
    }
    this.capacity = capacity;
    this.#hash = hash;
    this.#ring = new Array<SchedulerEvent | undefined>(capacity);
    this.#digest = sha256(hash, utf8(LOG_DOMAIN));
  }

  /** Events appended so far (the last `seq`). */
  get total(): number {
    return this.#seq;
  }

  /** Events no longer retained. */
  get dropped(): number {
    return this.#seq - this.#size;
  }

  /** Lower-case hex of the running digest over every event ever appended. */
  get digest(): string {
    return bytesToHex(this.#digest);
  }

  /**
   * Appends one event. `fields` must hold exactly the type's EVENT_FIELDS (checked); the event
   * is built in the fixed key order and frozen (arrays included).
   */
  append(
    tick: number,
    type: SchedulerEventType,
    round: number | null,
    fields: Readonly<Record<string, unknown>> = {},
  ): SchedulerEvent {
    const names: readonly string[] = EVENT_FIELDS[type];
    if (names === undefined || Object.keys(fields).length !== names.length) {
      throw new SchedulerError("invalid-argument", "invalid-event");
    }
    if (!Number.isSafeInteger(tick) || tick < this.#lastTick) {
      throw new SchedulerError("invalid-argument", "event-order");
    }
    const event: Record<string, unknown> = { seq: this.#seq + 1, tick, type, round };
    for (const name of names) {
      if (!Object.hasOwn(fields, name))
        throw new SchedulerError("invalid-argument", "invalid-event");
      const v = fields[name];
      event[name] = Array.isArray(v) ? Object.freeze([...v]) : v;
    }
    Object.freeze(event);
    const frozen = event as SchedulerEvent;
    const text = utf8(JSON.stringify(frozen));
    const chained = new Uint8Array(this.#digest.length + text.length);
    chained.set(this.#digest, 0);
    chained.set(text, this.#digest.length);
    this.#digest = sha256(this.#hash, chained);
    this.#seq += 1;
    this.#lastTick = tick;
    const slot = (this.#head + this.#size) % this.capacity;
    this.#ring[slot] = frozen;
    if (this.#size < this.capacity) this.#size += 1;
    else this.#head = (this.#head + 1) % this.capacity;
    return frozen;
  }

  /** Retained events with seq > `afterSeq`, oldest first. */
  since(afterSeq: number = 0): readonly SchedulerEvent[] {
    const out: SchedulerEvent[] = [];
    for (let i = 0; i < this.#size; i++) {
      const e = this.#ring[(this.#head + i) % this.capacity]!;
      if (e.seq > afterSeq) out.push(e);
    }
    return Object.freeze(out);
  }

  toJSON(): { log: string; total: number; dropped: number } {
    return { log: "EventLog", total: this.total, dropped: this.dropped };
  }

  [INSPECT](): string {
    return `EventLog(${this.total} events, ${this.dropped} dropped)`;
  }
}
