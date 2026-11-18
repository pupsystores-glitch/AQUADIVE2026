// Fairness scheme registry (P8-3a; owner decisions D1, D2, D11 — docs/09 §38).
//
// Everything that a fairness version `fv` fixes lives here: the version number itself, the
// field limits of the canonical encoding (encoding.ts), the purpose registry with its hard draw
// limits, and the closed set of failure codes. A different value for any of these is a different
// scheme and needs a new `fv`.
//
// fv = 1 is INTERNAL AND EXPERIMENTAL (D11). It is not frozen, published or activated, and it
// is not connected to gameplay. Public activation needs a separate owner approval, resolved
// economic rules and independent verification. The future economics redesign is NOT
// automatically fv = 2.

/** The one fairness scheme version this module implements (D11: internal, experimental). */
export const FAIRNESS_VERSION = 1 as const;

/** fv = 1 is not frozen, published or active. Nothing in this module changes that. */
export const FAIRNESS_STATUS = "experimental-internal" as const;

/** Every fairness version this module can derive or verify. */
export const SUPPORTED_FAIRNESS_VERSIONS: readonly number[] = Object.freeze([FAIRNESS_VERSION]);

/** Length of every hash, chain link, chain identifier and HMAC block (SHA-256). */
export const HASH_BYTES = 32;

/** Chain indices are u32 on the wire; index 0 is the terminating hash and never a round seed. */
export const MAX_CHAIN_INDEX = 0xffff_ffff;

/** Longest chain fv = 1 can address (one round seed per index 1 … length). */
export const MAX_CHAIN_LENGTH = MAX_CHAIN_INDEX;

/** Explicit public salt length bounds (D1). The real salt source is an open owner decision. */
export const MIN_SALT_BYTES = 16;
export const MAX_SALT_BYTES = 64;

/** Purpose identifiers: ASCII, lower-case letter first, then lower-case letters, digits, '-'. */
export const MAX_PURPOSE_BYTES = 32;
export const PURPOSE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** One HMAC-SHA256 block holds four big-endian 64-bit words, one draw each. */
export const DRAWS_PER_BLOCK = 4;

/** The block counter is u32 on the wire; the per-purpose draw limits below are far smaller. */
export const MAX_BLOCK_COUNTER = 0xffff_ffff;

/**
 * fv = 1 purpose registry with HARD per-round draw limits.
 *
 * The limits follow the engine's draw sites at `fd292bc` (read-only; no engine change):
 * `sampleCrashPoint` draws 1 or 2, `sampleJackpot` exactly 2, `rollBonusChests` exactly 6.
 * `world` is bounded analytically by about 7 draws per creature with at most about 153
 * creatures per dive (spawn spacing strictly above 34 px over at most about 5,200 px); the most
 * measured was 861 draws in 3,000 forced-floor rounds (qa/p8-3-fairness/engine-draws). 2,048
 * keeps a wide margin. Exceeding a limit is an error, never a silent wrap or reuse.
 */
export const PURPOSE_DRAW_LIMITS_V1: Readonly<Record<FairnessPurpose, number>> = Object.freeze({
  crash: 2,
  jackpot: 2,
  chests: 6,
  world: 2048,
});

/** The purposes fv = 1 derives. Each has its own block counter starting at 0. */
export type FairnessPurpose = "crash" | "jackpot" | "chests" | "world";

export const FAIRNESS_PURPOSES: readonly FairnessPurpose[] = Object.freeze([
  "crash",
  "jackpot",
  "chests",
  "world",
]);

/** Closed set of failure codes. Messages never contain secret material. */
export type FairnessErrorCode =
  | "unsupported-version"
  | "invalid-bytes"
  | "invalid-length"
  | "invalid-chain-id"
  | "invalid-chain-index"
  | "invalid-chain-length"
  | "invalid-salt"
  | "invalid-purpose"
  | "unknown-purpose"
  | "purpose-already-open"
  | "invalid-counter"
  | "draw-limit-exceeded"
  | "invalid-encoding"
  | "invalid-hex"
  | "crypto-provider-failed"
  | "secure-random-failed"
  | "secret-disposed";

/** The only error type this module throws. `code` is stable; `message` is diagnostic only. */
export class FairnessError extends Error {
  readonly code: FairnessErrorCode;

  constructor(code: FairnessErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "FairnessError";
    this.code = code;
  }
}

/** Throws `unsupported-version` unless `fv` is a version this module implements. */
export function assertSupportedVersion(fv: unknown): asserts fv is typeof FAIRNESS_VERSION {
  if (typeof fv !== "number" || !SUPPORTED_FAIRNESS_VERSIONS.includes(fv)) {
    throw new FairnessError("unsupported-version", "fairness version is not supported");
  }
}

/** The hard draw limit of `purpose` under `fv`; throws for an unknown purpose. */
export function purposeDrawLimit(fv: number, purpose: string): number {
  assertSupportedVersion(fv);
  if (!Object.prototype.hasOwnProperty.call(PURPOSE_DRAW_LIMITS_V1, purpose)) {
    throw new FairnessError("unknown-purpose", "purpose is not registered for this version");
  }
  return PURPOSE_DRAW_LIMITS_V1[purpose as FairnessPurpose];
}
