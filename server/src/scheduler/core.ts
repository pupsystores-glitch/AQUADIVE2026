// Pure deterministic core of the offline Global Round Scheduler (P8-4b-2; owner decisions SD-1 …
// SD-10). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. No clock, timer, promise, I/O or worker: the
// core lives in the TICK domain and is driven by a separate driver (scheduler.ts) that maps a
// monotonic clock onto ticks. The same inputs always give the same events, snapshots and effects.
//
// Inputs (each at the core's current tick; the driver catches the core up first):
//
//   start()             tick 0: `scheduler.started`; requests round 1
//   advanceTo(t)        processes EVERY tick (cursor, t] in order, one at a time (catch-up after
//                       a late wakeup never skips or merges a tick); t ≤ cursor is a no-op
//   deliver(sealed)     the requested round's sealed script arrived (now held)
//   sourceFailed(kind)  the source reported a loss, a preparation failure or a contract breach
//   stop()              owner stop: immediate halt
//   fault(reason)       the driver failed closed (`clock-failed`, `internal-error`): immediate halt
//
// Outputs: public events (events.ts), a public snapshot, and effects for the driver — `prepare`
// (request round n from the source) and `halted`.
//
// One authority, one round. At most one round is ACTIVE; round n + 1 opens on round n's end tick
// (zero gap). Round numbers are 1, 2, 3, … and round n plays chain index n of the source's chain;
// a delivered script with any other chain or index is a contract violation.
//
// Look-ahead and admission (SD-4, SD-5). Round n + 1 is requested at round n's opening tick S_n
// (round 1 at tick 0) — outcome-independent instants. Its script must be HELD before the fixed
// admission tick S_n + ADMISSION_DEADLINE_TICKS (round 1: tick ADMISSION_DEADLINE_TICKS, its
// opening tick), which lies inside round n's fixed betting window. At that tick a held script is
// ADMITTED (`round.admitted`, reading only the seal's public metadata); otherwise the scheduler
// starts HALTING: round n plays to its end, then the scheduler halts. There is no delay, no
// retry, no skipped or substituted round. Active + held/admitted + requested scripts ≤ 2 at
// every tick (checked).
//
// Failures (fail closed; NOT a production D10 / OD-11 settlement, void or refund policy):
//
// - admission deadline missed, chain exhausted (no index for the next round; SD-10), preparation
//   failure, source loss (SD-6): HALTING — the active round, already admitted, finishes in this
//   offline simulation and the scheduler halts at its end tick. After a source loss the active
//   round's reveal is `unavailable` (the source's chain is gone); otherwise it is `deferred`
//   (the reveal protocol is P8-4b-3, SD-7). Nothing is requested, admitted or opened again.
// - contract violation, owner stop, driver fault: IMMEDIATE halt; the active round is
//   interrupted (its private schedule released, its reveal unavailable). "Interrupted" is not a
//   settlement outcome, and never a "completed" round.
// - Before the first round opens, any halting condition halts immediately.
//
// A script that is never played (deadline missed, halt, late delivery) is discarded unopened.
// The core holds no RoundScript: only seals (public metadata) and, for the active round, the
// disclosure cursor (disclosure.ts), which alone reads secret content, tick by tick.

import * as fairness from "../fairness";
import type { FairnessHashProvider } from "../fairness";
import { RoundDisclosure, type DisclosureFact } from "./disclosure";
import {
  DEFAULT_EVENT_CAPACITY,
  EventLog,
  SchedulerError,
  type HaltReason,
  type RevealStatus,
  type SchedulerEvent,
  type SourceFailure,
} from "./events";
import { SealedRound } from "./sealed";
import { ADMISSION_DEADLINE_TICKS, BETTING_TICKS, type RoundPhase } from "./timeline";
import { MAX_GLOBAL_TICK } from "./clock";

/** R-1: bound ONCE, as this module loads (a later replacement of an export is never reached). */
const { bytesToHex, hexToBytes, sha256 } = fairness;

/** The public facts of the source's chain the core needs. */
export interface SchedulerChain {
  readonly chainId: string;
  readonly chainLength: number;
  readonly fv: number;
}

export interface SchedulerCoreOptions {
  readonly chain: SchedulerChain;
  readonly hash: FairnessHashProvider;
  /** Events retained (16 … 65,536; default 1,024). The digest covers every event. */
  readonly eventCapacity?: number;
}

export type CoreState = "created" | "running" | "halting" | "halted";

export type CoreEffect =
  | { readonly type: "prepare"; readonly roundNumber: number }
  | { readonly type: "halted"; readonly reason: HaltReason };

/** The public round part of a snapshot (global ticks). */
export interface RoundSnapshot {
  readonly number: number;
  readonly roundId: string;
  readonly chainIndex: number;
  readonly openedAtTick: number;
  readonly bettingClosesAtTick: number;
  readonly phase: RoundPhase;
  readonly phaseStartTick: number;
  /** Null while diving (the dive's end is secret until it happens). */
  readonly phaseEndsAtTick: number | null;
  /** The current tick's multiplier while diving; the crash point / jackpot afterwards. */
  readonly multiplier: number | null;
  readonly crashAt: number | null;
  readonly jackpot: number | null;
  readonly chests: readonly [number, number, number] | null;
  readonly boosts: number;
  readonly reveal: RevealStatus;
}

export interface SchedulerSnapshot {
  readonly schema: "aquadive.scheduler.snapshot";
  readonly version: 1;
  readonly state: CoreState;
  /** The last processed global tick (−1 before start). */
  readonly tick: number;
  readonly lastSeq: number;
  readonly lastRound: number;
  readonly round: RoundSnapshot | null;
  readonly halting: { readonly reason: HaltReason; readonly sinceTick: number } | null;
  readonly halted: {
    readonly reason: HaltReason;
    readonly tick: number;
    readonly interruptedRound: number | null;
  } | null;
}

/** INTERNAL diagnostics (offline only): which scripts the scheduler holds. NOT public state. */
export interface Residency {
  readonly active: 0 | 1;
  readonly next: "none" | "requested" | "held" | "admitted";
  readonly total: number;
}

const ROUND_ID_DOMAIN = "AQUADIVE|scheduler|round-id|v1";
const HEX64 = /^[0-9a-f]{64}$/;
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

const u64be = (n: number): Uint8Array => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n));
  return out;
};

/**
 * The round id (SD-8): lower-case hex of
 *
 *   SHA-256( UTF-8("AQUADIVE|scheduler|round-id|v1") ‖ 0x00 ‖ chainId (32 bytes)
 *            ‖ u64be(chainIndex) ‖ u64be(roundNumber) )
 *
 * Every field has a fixed length, so the encoding is injective; distinct inputs collide only if
 * SHA-256 does (birthday bound ≈ n² / 2²⁵⁷ for n ids). Within one scheduler the round number
 * strictly increases, so its ids are distinct inputs. Public: derived from public metadata only.
 */
export function deriveRoundId(
  hash: FairnessHashProvider,
  chainId: string,
  chainIndex: number,
  roundNumber: number,
): string {
  if (typeof chainId !== "string" || !HEX64.test(chainId)) {
    throw new SchedulerError("invalid-argument", "invalid-chain-id");
  }
  for (const n of [chainIndex, roundNumber]) {
    if (!Number.isSafeInteger(n) || n < 1)
      throw new SchedulerError("invalid-argument", "invalid-index");
  }
  const domain = new TextEncoder().encode(ROUND_ID_DOMAIN);
  const parts = [
    domain,
    Uint8Array.of(0),
    hexToBytes(chainId),
    u64be(chainIndex),
    u64be(roundNumber),
  ];
  const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return bytesToHex(sha256(hash, bytes));
}

type Next =
  | { readonly kind: "none" }
  | { readonly kind: "requested"; readonly round: number; readonly deadline: number }
  | {
      readonly kind: "held";
      readonly round: number;
      readonly deadline: number;
      readonly sealed: SealedRound;
    }
  | {
      readonly kind: "admitted";
      readonly round: number;
      readonly sealed: SealedRound;
      readonly roundId: string;
    }
  | { readonly kind: "exhausted"; readonly round: number; readonly deadline: number };

interface Active {
  readonly round: number;
  readonly roundId: string;
  readonly chainIndex: number;
  readonly openedAt: number;
  readonly disclosure: RoundDisclosure;
  reveal: RevealStatus;
}

const NONE: Next = Object.freeze({ kind: "none" });

export class SchedulerCore {
  readonly chain: SchedulerChain;
  readonly #hash: FairnessHashProvider;
  readonly #log: EventLog;
  #state: CoreState = "created";
  #cursor = -1;
  #active: Active | null = null;
  #next: Next = NONE;
  /** The tick at which the next round must open (round 1: the first deadline; then end ticks). */
  #openingDue = ADMISSION_DEADLINE_TICKS;
  #lastRound = 0;
  #sourceAlive = true;
  #halting: { reason: HaltReason; sinceTick: number } | null = null;
  #halted: { reason: HaltReason; tick: number; interruptedRound: number | null } | null = null;
  #effects: CoreEffect[] = [];
  #discarded = 0;

  constructor(options: SchedulerCoreOptions) {
    const o = options as Partial<SchedulerCoreOptions> | null;
    const c = o?.chain;
    if (
      typeof c !== "object" ||
      c === null ||
      typeof c.chainId !== "string" ||
      !HEX64.test(c.chainId) ||
      !Number.isSafeInteger(c.chainLength) ||
      c.chainLength < 1 ||
      c.fv !== 1 ||
      typeof o?.hash?.sha256 !== "function"
    ) {
      throw new SchedulerError("invalid-argument", "invalid-options");
    }
    this.chain = Object.freeze({ chainId: c.chainId, chainLength: c.chainLength, fv: c.fv });
    this.#hash = o.hash;
    this.#log = new EventLog(o.hash, o.eventCapacity ?? DEFAULT_EVENT_CAPACITY);
    Object.freeze(this);
  }

  get state(): CoreState {
    return this.#state;
  }

  /** The last processed global tick (−1 before start). */
  get tick(): number {
    return this.#cursor;
  }

  /** Running SHA-256 over every event (events.ts). */
  get digest(): string {
    return this.#log.digest;
  }

  get eventTotal(): number {
    return this.#log.total;
  }

  get eventsDropped(): number {
    return this.#log.dropped;
  }

  /** Scripts delivered but never played (discarded unopened). */
  get discarded(): number {
    return this.#discarded;
  }

  /** Retained public events with seq > `afterSeq`. */
  events(afterSeq = 0): readonly SchedulerEvent[] {
    return this.#log.since(afterSeq);
  }

  /** INTERNAL diagnostics (offline tests): never part of the public state. */
  residency(): Residency {
    const next =
      this.#next.kind === "held" || this.#next.kind === "admitted"
        ? this.#next.kind
        : this.#next.kind === "requested"
          ? "requested"
          : "none";
    const active = this.#active === null ? 0 : 1;
    return Object.freeze({ active, next, total: active + (next === "none" ? 0 : 1) });
  }

  start(): readonly CoreEffect[] {
    if (this.#state !== "created") throw new SchedulerError("invalid-state", this.#state);
    this.#state = "running";
    this.#cursor = 0;
    this.#log.append(0, "scheduler.started", null, { firstOpeningTick: ADMISSION_DEADLINE_TICKS });
    this.#request(1, ADMISSION_DEADLINE_TICKS);
    return this.#flush();
  }

  /** Processes every tick (cursor, target] in order. */
  advanceTo(target: number): readonly CoreEffect[] {
    if (this.#state === "created") throw new SchedulerError("invalid-state", "created");
    if (!Number.isSafeInteger(target) || target < -1 || target > MAX_GLOBAL_TICK) {
      throw new SchedulerError("invalid-argument", "invalid-tick");
    }
    while (this.#cursor < target && this.#state !== "halted") {
      this.#cursor += 1;
      this.#processTick(this.#cursor);
    }
    return this.#flush();
  }

  /** The requested round's sealed script arrived at the current tick. */
  deliver(sealed: SealedRound): readonly CoreEffect[] {
    if (this.#state === "created") throw new SchedulerError("invalid-state", "created");
    if (!(sealed instanceof SealedRound) || sealed.state !== "sealed") {
      throw new SchedulerError("sealed-misuse", "not-sealed");
    }
    const next = this.#next;
    if (this.#state !== "running" || next.kind !== "requested") {
      // Halting / halted (a deadline already passed or the source failed): never played.
      if (this.#state === "running") {
        sealed.discard();
        this.#discarded += 1;
        this.#haltNow("source-contract-violation"); // nothing was requested
        return this.#flush();
      }
      sealed.discard();
      this.#discarded += 1;
      return this.#flush();
    }
    const a = sealed.admission;
    if (a.chainId !== this.chain.chainId || a.chainIndex !== next.round || a.fv !== this.chain.fv) {
      sealed.discard();
      this.#discarded += 1;
      this.#haltNow("source-contract-violation");
      return this.#flush();
    }
    this.#next = Object.freeze({
      kind: "held",
      round: next.round,
      deadline: next.deadline,
      sealed,
    });
    this.#checkResidency();
    return this.#flush();
  }

  /** The source failed at the current tick (see the file comment). */
  sourceFailed(failure: SourceFailure): readonly CoreEffect[] {
    if (this.#state === "created") throw new SchedulerError("invalid-state", "created");
    if (
      failure !== "lost" &&
      failure !== "preparation-failed" &&
      failure !== "contract-violation"
    ) {
      throw new SchedulerError("invalid-argument", "invalid-failure");
    }
    if (this.#state === "halted") return this.#flush();
    this.#log.append(this.#cursor, "source.failed", null, { failure });
    if (failure === "lost") {
      this.#sourceAlive = false;
      if (this.#active !== null) this.#active.reveal = "unavailable";
    }
    if (failure === "contract-violation") this.#haltNow("source-contract-violation");
    else this.#beginHalting(failure === "lost" ? "source-lost" : "preparation-failed");
    return this.#flush();
  }

  /** Owner stop: an immediate halt (the active round, if any, is interrupted). */
  stop(): readonly CoreEffect[] {
    if (this.#state === "created") throw new SchedulerError("invalid-state", "created");
    if (this.#state !== "halted") this.#haltNow("owner-stopped");
    return this.#flush();
  }

  /**
   * The driver failed closed (an invalid clock reading, or an unexpected error that may have
   * interrupted a step midway): an immediate halt at the last processed tick. Effects of the
   * interrupted step that were never handed out (a `prepare`) are dropped, never applied.
   */
  fault(reason: "clock-failed" | "internal-error"): readonly CoreEffect[] {
    if (this.#state === "created") throw new SchedulerError("invalid-state", "created");
    if (reason !== "clock-failed" && reason !== "internal-error") {
      throw new SchedulerError("invalid-argument", "invalid-failure");
    }
    this.#effects = [];
    if (this.#state !== "halted") this.#haltNow(reason);
    return this.#flush();
  }

  /** The public snapshot at the last processed tick. */
  snapshot(): SchedulerSnapshot {
    const a = this.#active;
    let round: RoundSnapshot | null = null;
    if (a !== null) {
      const v = a.disclosure.view();
      round = Object.freeze({
        number: a.round,
        roundId: a.roundId,
        chainIndex: a.chainIndex,
        openedAtTick: a.openedAt,
        bettingClosesAtTick: a.openedAt + BETTING_TICKS,
        phase: v.phase,
        phaseStartTick: a.openedAt + v.phaseStartTick,
        phaseEndsAtTick: v.phaseEndsAtTick === null ? null : a.openedAt + v.phaseEndsAtTick,
        multiplier: v.multiplier,
        crashAt: v.crashAt,
        jackpot: v.jackpot,
        chests: v.chests,
        boosts: v.boosts,
        reveal: a.reveal,
      });
    }
    return Object.freeze({
      schema: "aquadive.scheduler.snapshot",
      version: 1,
      state: this.#state,
      tick: this.#cursor,
      lastSeq: this.#log.total,
      lastRound: this.#lastRound,
      round,
      halting: this.#halting === null ? null : Object.freeze({ ...this.#halting }),
      halted: this.#halted === null ? null : Object.freeze({ ...this.#halted }),
    });
  }

  toJSON(): { scheduler: string; state: CoreState; tick: number } {
    return { scheduler: "SchedulerCore", state: this.#state, tick: this.#cursor };
  }

  [INSPECT](): string {
    return `SchedulerCore(${this.#state}, tick ${this.#cursor})`;
  }

  // ---- Tick processing ----------------------------------------------------------------------

  #processTick(g: number): void {
    // 1. The active round discloses tick g (its end included).
    const a = this.#active;
    if (a !== null) {
      for (const fact of a.disclosure.advance(g - a.openedAt)) this.#emitFact(a, g, fact);
      if (a.disclosure.ended) {
        this.#active = null;
        this.#openingDue = g;
      }
    }
    // 2. The next round's fixed admission tick.
    const next = this.#next;
    if (
      (next.kind === "requested" || next.kind === "held" || next.kind === "exhausted") &&
      g === next.deadline
    ) {
      if (next.kind === "held") {
        const roundId = deriveRoundId(this.#hash, this.chain.chainId, next.round, next.round);
        this.#next = Object.freeze({
          kind: "admitted",
          round: next.round,
          sealed: next.sealed,
          roundId,
        });
        this.#log.append(g, "round.admitted", next.round, { roundId, chainIndex: next.round });
      } else {
        this.#beginHalting(
          next.kind === "exhausted" ? "chain-exhausted" : "admission-deadline-missed",
        );
      }
    }
    // 3. The opening tick (round 1's first deadline, or the previous round's end tick).
    if (this.#active === null && g === this.#openingDue && this.#state === "running") {
      if (this.#next.kind === "admitted") this.#open(g);
      else this.#haltNow("admission-deadline-missed"); // unreachable: deadline ≤ opening tick
    } else if (this.#active === null && this.#state === "halting") {
      this.#haltGracefully(g);
    }
    this.#checkResidency();
  }

  #open(g: number): void {
    const next = this.#next as Extract<Next, { kind: "admitted" }>;
    this.#next = NONE;
    let disclosure: RoundDisclosure;
    try {
      disclosure = RoundDisclosure.open(next.sealed, this.chain.chainId, next.round);
    } catch {
      next.sealed.discard();
      this.#haltNow("source-contract-violation");
      return;
    }
    const active: Active = {
      round: next.round,
      roundId: next.roundId,
      chainIndex: next.round,
      openedAt: g,
      disclosure,
      reveal: this.#sourceAlive ? "deferred" : "unavailable",
    };
    this.#active = active;
    this.#lastRound = next.round;
    for (const fact of disclosure.advance(0)) this.#emitFact(active, g, fact);
    const following = next.round + 1;
    if (following <= this.chain.chainLength) {
      this.#request(following, g + ADMISSION_DEADLINE_TICKS);
    } else {
      this.#next = Object.freeze({
        kind: "exhausted",
        round: following,
        deadline: g + ADMISSION_DEADLINE_TICKS,
      });
    }
  }

  #request(round: number, deadline: number): void {
    this.#next = Object.freeze({ kind: "requested", round, deadline });
    this.#effects.push(Object.freeze({ type: "prepare", roundNumber: round }));
  }

  #emitFact(a: Active, g: number, fact: DisclosureFact): void {
    const n = a.round;
    switch (fact.kind) {
      case "betting":
        this.#log.append(g, "round.betting", n, {
          roundId: a.roundId,
          closesAtTick: a.openedAt + fact.closesAt,
        });
        return;
      case "dive":
        this.#log.append(g, "round.dive", n);
        return;
      case "boost":
        this.#log.append(g, "round.boost", n);
        return;
      case "crashed":
        this.#log.append(g, "round.crashed", n, {
          crashAt: fact.crashAt,
          endsAtTick: a.openedAt + fact.endsAt,
        });
        return;
      case "impact":
        this.#log.append(g, "round.impact", n, {
          jackpot: fact.jackpot,
          bonusAtTick: a.openedAt + fact.bonusAt,
        });
        return;
      case "bonus":
        this.#log.append(g, "round.bonus", n, { closesAtTick: a.openedAt + fact.closesAt });
        return;
      case "chests":
        this.#log.append(g, "round.chests", n, {
          chests: fact.chests,
          endsAtTick: a.openedAt + fact.endsAt,
        });
        return;
      case "ended":
        this.#log.append(g, "round.ended", n, { outcome: fact.outcome, reveal: a.reveal });
        return;
    }
  }

  // ---- Halting ------------------------------------------------------------------------------

  /** Stop admitting; the active round (if any) finishes; then halt. */
  #beginHalting(reason: HaltReason): void {
    if (this.#state !== "running") return;
    this.#state = "halting";
    this.#halting = { reason, sinceTick: this.#cursor };
    this.#log.append(this.#cursor, "scheduler.halting", null, { reason });
    this.#dropNext();
    if (this.#active === null) this.#haltGracefully(this.#cursor);
  }

  #haltGracefully(g: number): void {
    const reason = this.#halting!.reason;
    this.#state = "halted";
    this.#halted = { reason, tick: g, interruptedRound: null };
    this.#log.append(g, "scheduler.halted", null, { reason, interruptedRound: null });
    this.#effects.push(Object.freeze({ type: "halted", reason }));
  }

  /** Immediate halt: the active round is interrupted (its private schedule released). */
  #haltNow(reason: HaltReason): void {
    if (this.#state === "halted") return;
    const interrupted = this.#active?.round ?? null;
    this.#active?.disclosure.release();
    this.#active = null;
    this.#dropNext();
    this.#state = "halted";
    this.#halted = { reason, tick: this.#cursor, interruptedRound: interrupted };
    this.#log.append(this.#cursor, "scheduler.halted", null, {
      reason,
      interruptedRound: interrupted,
    });
    this.#effects.push(Object.freeze({ type: "halted", reason }));
  }

  /** The next round will never be played: its seal (if any) is discarded unopened. */
  #dropNext(): void {
    const next = this.#next;
    if (next.kind === "held" || next.kind === "admitted") {
      next.sealed.discard();
      this.#discarded += 1;
    }
    this.#next = NONE;
  }

  #checkResidency(): void {
    if (this.residency().total > 2) {
      // Unreachable by construction; fail closed if it ever happens.
      this.#haltNow("source-contract-violation");
    }
  }

  #flush(): readonly CoreEffect[] {
    const out = Object.freeze(this.#effects);
    this.#effects = [];
    return out;
  }
}

// R-1: nothing of this module can be replaced once it has loaded. The compiled build's CommonJS
// exports object is frozen too (an ES module namespace, as under Vitest, is immutable already).
Object.freeze(SchedulerCore);
Object.freeze(SchedulerCore.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
