// One purpose's engine-facing random stream (P8-3b; owner decisions D-B4, D-B8).
//
// PurposeRng implements the engine's existing `Rng` contract over one private fv stream of a
// round. It adds only the round's lifecycle rules: nothing is drawn from a failed or disposed
// round; exceeding the purpose's hard draw limit fails the whole round with a typed
// `draw-limit-exceeded` (never a wrap, a reused value or a fallback source); and serialization
// shows the purpose name only, never the stream's draw count.

import type { Rng } from "@/engine";
import { FairnessError, type FairnessPurpose, type SeededStream } from "@/fairness";
import { SeededRoundError } from "./errors";
import type { RoundLifecycle } from "./lifecycle";
import { INSPECT, SEALED } from "./secrecy";

export class PurposeRng implements Rng {
  readonly purpose: FairnessPurpose;
  #stream: SeededStream;
  #lifecycle: RoundLifecycle;

  constructor(purpose: FairnessPurpose, stream: SeededStream, lifecycle: RoundLifecycle) {
    this.purpose = purpose;
    this.#stream = stream;
    this.#lifecycle = lifecycle;
    Object.freeze(this);
  }

  /** The next value in [0, 1) of this purpose. */
  next(): number {
    this.#lifecycle.assertLive();
    try {
      return this.#stream.next();
    } catch (error) {
      this.#lifecycle.fail();
      if (error instanceof FairnessError && error.code === "draw-limit-exceeded") {
        throw new SeededRoundError(
          "draw-limit-exceeded",
          `purpose ${this.purpose} exceeded its draw limit of ${this.#stream.drawLimit}`,
          { cause: error },
        );
      }
      throw new SeededRoundError("round-failed", `purpose ${this.purpose} stream failed`, {
        cause: error,
      });
    }
  }

  /** SECRET before the reveal (D-B4): draws used so far. Only the owning SeededRound reads it. */
  secretDrawsUsed(): number {
    return this.#stream.drawsUsed;
  }

  toJSON(): { purpose: FairnessPurpose } {
    return { purpose: this.purpose };
  }

  toString(): string {
    return `PurposeRng(${this.purpose}) ${SEALED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }
}
