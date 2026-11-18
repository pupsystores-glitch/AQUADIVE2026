// Typed failures of the seeded round binding (P8-3b; owner decisions D-B8, D-B9).
//
// Messages name the failing purpose or decision and public constants only (fv, draw limits). They
// never carry a seed, a block, a drawn value, an outcome or a draw count below the limit.

/** Closed set of failure codes. `code` is stable; `message` is diagnostic only. */
export type SeededRoundErrorCode =
  /** A purpose asked for a draw beyond its fv hard limit (D-B8). The round is failed. */
  | "draw-limit-exceeded"
  /** A one-time outcome decision was requested a second time (D-B9). The round is failed. */
  | "outcome-already-consumed"
  /** An outcome decision was requested before the one the engine always takes first. */
  | "outcome-out-of-order"
  /** The round failed earlier; nothing may be drawn from it any more. */
  | "round-failed"
  /** The round was disposed; its secret material is gone. */
  | "round-disposed"
  /** The derivation cannot back a round (disposed, or a purpose stream already opened). */
  | "derivation-unusable";

export class SeededRoundError extends Error {
  readonly code: SeededRoundErrorCode;

  constructor(code: SeededRoundErrorCode, message: string, options?: { cause?: unknown }) {
    super(`${code}: ${message}`, options);
    this.name = "SeededRoundError";
    this.code = code;
  }
}
