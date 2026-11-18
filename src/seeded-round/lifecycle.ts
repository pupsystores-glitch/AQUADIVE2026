// The shared lifecycle of one seeded round (P8-3b; owner decisions D-B2, D-B8).
//
// One RoundLifecycle is shared by a round's four purpose streams and its authority. It moves
// live → failed (any draw failure, exhaustion or reuse) or live/failed → disposed, never back.
// A failed round can only be disposed: nothing is drawn from it again, so no partial result can
// be completed after an error, and no value is ever reused.

import { SeededRoundError } from "./errors";

export type RoundStatus = "live" | "failed" | "disposed";

export class RoundLifecycle {
  #status: RoundStatus = "live";

  get status(): RoundStatus {
    return this.#status;
  }

  /** Throws `round-disposed` or `round-failed` unless the round is live. */
  assertLive(): void {
    if (this.#status === "disposed") {
      throw new SeededRoundError("round-disposed", "the seeded round was disposed");
    }
    if (this.#status === "failed") {
      throw new SeededRoundError("round-failed", "the seeded round failed earlier");
    }
  }

  /** Marks a live round failed (no effect once failed or disposed). */
  fail(): void {
    if (this.#status === "live") this.#status = "failed";
  }

  /** Marks the round disposed. Returns false if it already was. */
  markDisposed(): boolean {
    if (this.#status === "disposed") return false;
    this.#status = "disposed";
    return true;
  }
}
