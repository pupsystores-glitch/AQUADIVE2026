// Tick-gated disclosure of one admitted round (P8-4b-2). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY.
//
// The ONLY component of the scheduler that reads a RoundScript's secret content. At the round's
// opening tick it opens the seal (once), checks the content against the fixed timeline, keeps a
// minimal private schedule — outcome, exit tick, crash point, jackpot, chests, the per-dive-tick
// multiplier series and the goldfish consumption ticks — and drops the script. Nothing else of
// the content is kept: no boost or worldY samples, no creatures (OD-5: no world stream), no final
// world, no draw counts, no digest, no canonical bytes.
//
// Disclosure is MONOTONIC and bound to the authoritative tick: `advance(r)` accepts only the next
// round-relative tick (r = previous + 1, starting at 0) and returns the facts that become public
// AT r — never a fact of a later tick. There is no method that reads another tick, the end tick,
// the exit tick or a future sample:
//
//   r = 0                 betting (closes at 300: public, fixed)
//   r = 300               dive
//   r = consumption tick  boost (one per goldfish consumed at r; before the terminal fact of r)
//   r = exit              crash: crashed (crash point, end = exit + 144)
//                         floor: impact (jackpot, bonus at exit + 84)
//   r = exit + 84         bonus (pick window closes at + 360; NO chest values, §15.4)
//   r = exit + 444        chests (the three values; end at + 132)
//   r = end               ended
//
// `view()` is the public state at the last disclosed tick (the current multiplier sample while
// diving). Once the round has ended the private schedule is released. JSON / String / inspect
// show the round's public position only.

import { REDACTED as REDACTED_EXPORT } from "../fairness";
import { RoundScript, type RoundScriptSecret } from "../round/round-script";
import { SchedulerError } from "./events";
import { claimSealedRoundOpener, type SealedRound } from "./sealed";
import {
  BETTING_TICKS,
  BONUS_PICK_TICKS,
  IMPACT_TO_BONUS_TICKS,
  MAX_DIVE_TICKS,
  roundEndTick,
  type RoundPhase,
} from "./timeline";

/** The seals' one-time opening capability, claimed as this module loads (sealed.ts). */
const openSealedRound = claimSealedRoundOpener();
/**
 * R-1: the script's content accessor, bound ONCE as this module loads (a later replacement of
 * RoundScript.prototype.secretContent is never reached; it also refuses anything but a real
 * RoundScript, by its private field).
 */
const secretContentOf = RoundScript.prototype.secretContent;
const REDACTED: string = REDACTED_EXPORT;

export type DisclosureFact =
  | { readonly kind: "betting"; readonly closesAt: number }
  | { readonly kind: "dive" }
  | { readonly kind: "boost" }
  | { readonly kind: "crashed"; readonly crashAt: number; readonly endsAt: number }
  | { readonly kind: "impact"; readonly jackpot: number; readonly bonusAt: number }
  | { readonly kind: "bonus"; readonly closesAt: number }
  | {
      readonly kind: "chests";
      readonly chests: readonly [number, number, number];
      readonly endsAt: number;
    }
  | { readonly kind: "ended"; readonly outcome: "crash" | "floor" };

/** The public state of a round at its last disclosed (round-relative) tick. */
export interface PublicRoundView {
  readonly phase: RoundPhase;
  readonly phaseStartTick: number;
  /** Null while diving: the dive's end is secret until it happens. */
  readonly phaseEndsAtTick: number | null;
  /** The current tick's sample while diving; the crash point / jackpot afterwards; else null. */
  readonly multiplier: number | null;
  readonly crashAt: number | null;
  readonly jackpot: number | null;
  readonly chests: readonly [number, number, number] | null;
  readonly boosts: number;
  readonly outcome: "crash" | "floor" | null;
}

const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const EMPTY: readonly DisclosureFact[] = Object.freeze([]);
const violation = (): never => {
  throw new SchedulerError("contract-violation", "timeline-mismatch");
};

interface PrivateSchedule {
  readonly outcome: "crash" | "floor";
  readonly exit: number;
  readonly end: number;
  readonly crashAt: number;
  readonly jackpot: number | null;
  readonly chests: readonly [number, number, number] | null;
  readonly multipliers: readonly number[];
  readonly boosts: readonly number[];
}

export class RoundDisclosure {
  readonly chainIndex: number;
  #schedule: PrivateSchedule | null;
  #tick = -1;
  #boostCursor = 0;
  #boostsDisclosed = 0;
  #phase: RoundPhase = "betting";
  #phaseStart = 0;
  #phaseEnds: number | null = BETTING_TICKS;
  #crashAt: number | null = null;
  #jackpot: number | null = null;
  #chests: readonly [number, number, number] | null = null;
  #outcome: "crash" | "floor" | null = null;
  #ended = false;

  private constructor(chainIndex: number, schedule: PrivateSchedule) {
    this.chainIndex = chainIndex;
    this.#schedule = schedule;
    Object.freeze(this);
  }

  /**
   * Opens `sealed` (exactly once) for the round whose chain id and index the core expects, and
   * checks its content against the fixed timeline. Throws `contract-violation` (no detail).
   */
  static open(
    sealed: SealedRound,
    expectedChainId: string,
    expectedIndex: number,
  ): RoundDisclosure {
    const a = sealed.admission;
    if (a.chainId !== expectedChainId || a.chainIndex !== expectedIndex) {
      sealed.discard();
      throw new SchedulerError("contract-violation", "index-sequence");
    }
    const script = openSealedRound(sealed);
    const s = Reflect.apply(secretContentOf, script, []) as RoundScriptSecret;
    const floor = s.outcome === "floor";
    const exit = s.exitDiveTick;
    if (s.outcome !== "crash" && !floor) violation();
    if (s.diveStartTick !== BETTING_TICKS) violation();
    if (
      !Number.isSafeInteger(exit) ||
      exit <= BETTING_TICKS ||
      exit > BETTING_TICKS + MAX_DIVE_TICKS
    )
      violation();
    if (s.samples.multiplier.length !== exit - BETTING_TICKS) violation();
    if (floor) {
      if (s.impactTick !== exit || s.terminalTick !== exit + IMPACT_TO_BONUS_TICKS) violation();
      if (s.jackpot === null || s.chests === null || s.chests.length !== 3) violation();
    } else if (s.impactTick !== null || s.terminalTick !== exit || s.jackpot !== null) {
      violation();
    }
    const boosts: number[] = [];
    for (const c of s.creatures) {
      if (c.kind !== "goldfish" || c.consumedTick === null) continue;
      if (c.consumedTick <= BETTING_TICKS || c.consumedTick > exit) violation();
      boosts.push(c.consumedTick);
    }
    boosts.sort((x, y) => x - y);
    return new RoundDisclosure(
      a.chainIndex,
      Object.freeze({
        outcome: s.outcome,
        exit,
        end: roundEndTick(s.outcome, exit),
        crashAt: s.crashAt,
        jackpot: floor ? s.jackpot : null,
        chests: floor
          ? (Object.freeze([...s.chests!]) as unknown as [number, number, number])
          : null,
        // The validated, deeply frozen series of the script (no copy); released at the end.
        multipliers: s.samples.multiplier,
        boosts: Object.freeze(boosts),
      }),
    );
  }

  /** The last disclosed round-relative tick (−1 before the opening tick). */
  get tick(): number {
    return this.#tick;
  }

  get ended(): boolean {
    return this.#ended;
  }

  /**
   * Discloses round-relative tick `r`, which must be exactly the next tick. Returns the facts
   * that become public at `r` (frozen). After `ended`, nothing more is accepted.
   */
  advance(r: number): readonly DisclosureFact[] {
    const s = this.#schedule;
    if (s === null || this.#ended) throw new SchedulerError("invalid-state", "round-ended");
    if (r !== this.#tick + 1) throw new SchedulerError("invalid-argument", "tick-sequence");
    this.#tick = r;
    if (r === 0) return Object.freeze([{ kind: "betting", closesAt: BETTING_TICKS }]);
    if (r < BETTING_TICKS) return EMPTY;
    if (r === BETTING_TICKS) {
      this.#enter("diving", r, null);
      return Object.freeze([{ kind: "dive" }]);
    }
    let facts: DisclosureFact[] | null = null;
    while (this.#boostCursor < s.boosts.length && s.boosts[this.#boostCursor] === r) {
      (facts ??= []).push({ kind: "boost" });
      this.#boostCursor += 1;
      this.#boostsDisclosed += 1;
    }
    if (r === s.exit) {
      this.#outcome = s.outcome;
      if (s.outcome === "crash") {
        this.#crashAt = s.crashAt;
        this.#enter("crashed", r, s.end);
        (facts ??= []).push({ kind: "crashed", crashAt: s.crashAt, endsAt: s.end });
      } else {
        const bonusAt = s.exit + IMPACT_TO_BONUS_TICKS;
        this.#jackpot = s.jackpot;
        this.#enter("impact", r, bonusAt);
        (facts ??= []).push({ kind: "impact", jackpot: s.jackpot!, bonusAt });
      }
    } else if (s.outcome === "floor" && r === s.exit + IMPACT_TO_BONUS_TICKS) {
      const closesAt = r + BONUS_PICK_TICKS;
      this.#enter("bonus", r, closesAt);
      (facts ??= []).push({ kind: "bonus", closesAt });
    } else if (s.outcome === "floor" && r === s.exit + IMPACT_TO_BONUS_TICKS + BONUS_PICK_TICKS) {
      this.#chests = s.chests;
      this.#enter("chests", r, s.end);
      (facts ??= []).push({ kind: "chests", chests: s.chests!, endsAt: s.end });
    } else if (r === s.end) {
      this.#ended = true;
      this.#schedule = null; // the private schedule is released
      return Object.freeze([{ kind: "ended", outcome: s.outcome }]);
    }
    return facts === null ? EMPTY : Object.freeze(facts);
  }

  /** The public state at the last disclosed tick (see PublicRoundView). */
  view(): PublicRoundView {
    const s = this.#schedule;
    const diving = this.#phase === "diving";
    let multiplier: number | null = null;
    if (diving && s !== null) multiplier = s.multipliers[this.#tick - BETTING_TICKS]!;
    else if (this.#outcome === "crash") multiplier = this.#crashAt;
    else if (this.#outcome === "floor") multiplier = this.#jackpot;
    return Object.freeze({
      phase: this.#phase,
      phaseStartTick: this.#phaseStart,
      phaseEndsAtTick: this.#phaseEnds,
      multiplier,
      crashAt: this.#crashAt,
      jackpot: this.#jackpot,
      chests: this.#chests,
      boosts: this.#boostsDisclosed,
      outcome: this.#outcome,
    });
  }

  /** Drops the private schedule of a round that is interrupted (halt). Idempotent. */
  release(): void {
    this.#schedule = null;
  }

  toJSON(): { disclosure: string; chainIndex: number; tick: number; phase: RoundPhase } {
    return {
      disclosure: "RoundDisclosure",
      chainIndex: this.chainIndex,
      tick: this.#tick,
      phase: this.#phase,
    };
  }

  toString(): string {
    return `RoundDisclosure(chain index ${this.chainIndex}, tick ${this.#tick}, ${this.#phase}) ${REDACTED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }

  #enter(phase: RoundPhase, start: number, ends: number | null): void {
    this.#phase = phase;
    this.#phaseStart = start;
    this.#phaseEnds = ends;
  }
}

// R-1: nothing of this module can be replaced once it has loaded. The compiled build's CommonJS
// exports object is frozen too (an ES module namespace, as under Vitest, is immutable already).
Object.freeze(RoundDisclosure);
Object.freeze(RoundDisclosure.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
