// SeededRound — binds one round's fv derivation to the engine's dependency contract
// (P8-3b; docs/09 §16.5; owner decisions D-B1, D-B2, D-B4, D-B8, D-B9).
//
// A SeededRound owns one RoundDerivation and opens each of its four purpose streams exactly once
// (crash, jackpot, chests, world), so one seed and one derivation back exactly one round. It
// exposes the existing `GameEngineDeps` shape — `{ authority, worldRng }` — for one fresh
// GameEngine; the engine, its state machine and every draw site run unchanged. It does not
// drive the engine, and it is connected to nothing (no server, network, wallet or persistence).
//
// Secrecy (D-B4): before the round's reveal its draw counts are secret, so they are readable only
// through the explicitly named `secretDrawCounts()`; serialization shows public facts only.
//
// Lifecycle: `dispose()` disposes the derivation (zeroing its cached blocks and key copies, best
// effort) and refuses every later draw. After any failure — exhaustion, a reused or out-of-order
// decision, a broken provider — the round is failed for good; the caller must discard the engine
// that used it and dispose the round. There is no rewind: EngineSnapshot does not include stream
// positions, and restoring a snapshot does not reset a stream.

import type { GameEngineDeps, Rng } from "@/engine";
import {
  FAIRNESS_PURPOSES,
  FairnessError,
  RoundDerivation,
  type FairnessHashProvider,
  type FairnessPurpose,
  type RoundDerivationInput,
} from "@/fairness";
import { SeededRoundAuthority } from "./authority";
import { SeededRoundError } from "./errors";
import { RoundLifecycle, type RoundStatus } from "./lifecycle";
import { PurposeRng } from "./purpose-rng";
import { INSPECT, SEALED } from "./secrecy";

/** Draws used per purpose. SECRET until the round's reveal (D-B4). */
export type SecretDrawCounts = Readonly<Record<FairnessPurpose, number>>;

export class SeededRound {
  readonly fv: number;
  /** The round's chain index j (public: x_(j−1) is the round's published commitment). */
  readonly chainIndex: number;
  /** The engine dependencies for exactly one fresh GameEngine. */
  readonly deps: Readonly<GameEngineDeps>;
  #derivation: RoundDerivation;
  #lifecycle: RoundLifecycle;
  #rngs: Readonly<Record<FairnessPurpose, PurposeRng>>;

  private constructor(derivation: RoundDerivation) {
    this.fv = derivation.fv;
    this.chainIndex = derivation.chainIndex;
    this.#derivation = derivation;
    this.#lifecycle = new RoundLifecycle();
    const rngs = {} as Record<FairnessPurpose, PurposeRng>;
    for (const purpose of FAIRNESS_PURPOSES) {
      rngs[purpose] = new PurposeRng(purpose, derivation.openStream(purpose), this.#lifecycle);
    }
    this.#rngs = Object.freeze(rngs);
    this.deps = Object.freeze({
      authority: new SeededRoundAuthority(rngs, this.#lifecycle),
      worldRng: rngs.world,
    });
    Object.freeze(this);
  }

  /**
   * Binds a fresh derivation. Ownership passes to the round, also on failure: a derivation that
   * is disposed or already has an open purpose stream is disposed and refused with
   * `derivation-unusable`, so it can never back a second, financially distinct round.
   */
  static bind(derivation: RoundDerivation): SeededRound {
    if (!(derivation instanceof RoundDerivation)) {
      throw new SeededRoundError("derivation-unusable", "a RoundDerivation is required");
    }
    try {
      return new SeededRound(derivation);
    } catch (error) {
      derivation.dispose();
      if (error instanceof FairnessError) {
        throw new SeededRoundError(
          "derivation-unusable",
          `the derivation cannot back a new round (${error.code})`,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /** Validates the inputs, prepares the derivation once and binds it (see `bind`). */
  static create(provider: FairnessHashProvider, input: RoundDerivationInput): SeededRound {
    return SeededRound.bind(RoundDerivation.create(provider, input));
  }

  get status(): RoundStatus {
    return this.#lifecycle.status;
  }

  /** The engine's RoundAuthority for this round (same object as `deps.authority`). */
  get authority(): SeededRoundAuthority {
    return this.deps.authority as SeededRoundAuthority;
  }

  /** The `world` stream for this round (same object as `deps.worldRng`). */
  get worldRng(): Rng {
    return this.deps.worldRng;
  }

  /**
   * SECRET before the round's reveal (D-B4): draws used per purpose. For the round's owner only
   * (the authority process, the reference runner, a post-reveal verifier). Never put the result
   * in a public message, a public snapshot or a log before the reveal. Stays readable after
   * `dispose()` (bookkeeping only; no key material).
   */
  secretDrawCounts(): SecretDrawCounts {
    const counts = {} as Record<FairnessPurpose, number>;
    for (const purpose of FAIRNESS_PURPOSES)
      counts[purpose] = this.#rngs[purpose].secretDrawsUsed();
    return Object.freeze(counts);
  }

  /** Ends the round's use of secret material (idempotent; best-effort zeroing). */
  dispose(): void {
    if (this.#lifecycle.markDisposed()) this.#derivation.dispose();
  }

  /** Public facts only. */
  toJSON(): { fv: number; chainIndex: number } {
    return { fv: this.fv, chainIndex: this.chainIndex };
  }

  toString(): string {
    return `SeededRound(fv ${this.fv}, chain index ${this.chainIndex}) ${SEALED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }
}
