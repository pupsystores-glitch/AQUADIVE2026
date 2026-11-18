// SeededRoundAuthority — the engine's existing RoundAuthority over a round's seeded purpose
// streams (P8-3b; docs/09 §16.5; owner decisions D-B1, D-B9).
//
// The outcome mathematics stay in the engine: each decision delegates to an existing
// `LocalRoundAuthority` from the public `@/engine` barrel, bound to its own purpose stream, so
// `sampleCrashPoint`, `sampleJackpot` and `rollBonusChests` run unchanged and read only
// `crash`, `jackpot` and `chests` respectively. This class adds two rules and nothing else:
//
//   - one-time decisions: each method may be called once per round; a second call throws
//     `outcome-already-consumed` and fails the round (no value is ever drawn twice or reused);
//   - the engine's call order: crash (entry diving) → jackpot (entry impact) → chests (entry
//     bonus). An earlier call out of that order throws `outcome-out-of-order` and fails the round.
//
// It neither changes nor replaces LocalRoundAuthority, the engine state machine or its timing.

import { LocalRoundAuthority, type BonusChest, type RoundAuthority } from "@/engine";
import { SeededRoundError } from "./errors";
import type { RoundLifecycle } from "./lifecycle";
import type { PurposeRng } from "./purpose-rng";
import { INSPECT, SEALED } from "./secrecy";

/** The three one-time outcome decisions, in the engine's call order. */
export const OUTCOME_DECISIONS = ["crash", "jackpot", "chests"] as const;
export type OutcomeDecision = (typeof OUTCOME_DECISIONS)[number];

export class SeededRoundAuthority implements RoundAuthority {
  #crash: LocalRoundAuthority;
  #jackpot: LocalRoundAuthority;
  #chests: LocalRoundAuthority;
  #lifecycle: RoundLifecycle;
  /** Decisions taken so far (always a prefix of OUTCOME_DECISIONS). */
  #taken = 0;

  /** Built by SeededRound only, from that round's own purpose streams. */
  constructor(
    streams: { crash: PurposeRng; jackpot: PurposeRng; chests: PurposeRng },
    lifecycle: RoundLifecycle,
  ) {
    this.#crash = new LocalRoundAuthority(streams.crash);
    this.#jackpot = new LocalRoundAuthority(streams.jackpot);
    this.#chests = new LocalRoundAuthority(streams.chests);
    this.#lifecycle = lifecycle;
    Object.freeze(this);
  }

  sampleCrashPoint(): number {
    this.#take("crash");
    return this.#crash.sampleCrashPoint();
  }

  sampleJackpot(): number {
    this.#take("jackpot");
    return this.#jackpot.sampleJackpot();
  }

  rollBonusChests(): [BonusChest, BonusChest, BonusChest] {
    this.#take("chests");
    return this.#chests.rollBonusChests();
  }

  /** Public view: the class only. Which decisions were taken is outcome information (D-B4). */
  toJSON(): { authority: string } {
    return { authority: "SeededRoundAuthority" };
  }

  toString(): string {
    return `SeededRoundAuthority ${SEALED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }

  // The decision is marked taken before its draws: a draw failure leaves it consumed, and the
  // failed lifecycle refuses everything afterwards.
  #take(decision: OutcomeDecision): void {
    this.#lifecycle.assertLive();
    const position = OUTCOME_DECISIONS.indexOf(decision);
    if (position < this.#taken) {
      this.#lifecycle.fail();
      throw new SeededRoundError(
        "outcome-already-consumed",
        `the ${decision} decision was already taken for this round`,
      );
    }
    if (position > this.#taken) {
      this.#lifecycle.fail();
      throw new SeededRoundError(
        "outcome-out-of-order",
        `the ${decision} decision was requested before the ${OUTCOME_DECISIONS[this.#taken]} decision`,
      );
    }
    this.#taken++;
  }
}
