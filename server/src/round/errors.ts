// Typed failures of offline RoundScript precomputation (P8-4a). PLAY MONEY ONLY; offline only.
//
// One closed set of codes. A message is the code and, at most, one fixed reason code of the
// layer that failed (a ChainError / FairnessError code, or the bundle runner's code). Errors carry
// no cause, no value, no seed, no draw count, no tick and no digest, so no ordinary error path,
// log line or serialization can disclose an outcome before the round's reveal (K6).

export type RoundScriptErrorCode =
  /** The engine bundle could not be loaded from its fixed location. */
  | "runtime-unavailable"
  /** The bundle's export surface or construction profile is not the approved one. */
  | "runtime-incompatible"
  /** The bundle does not share the server's one fairness-module instance. */
  | "runtime-duplicate-fairness"
  /** The bundle failed a known-answer vector. */
  | "runtime-known-answer-failed"
  /**
   * The build does not match the trusted integrity manifest, or the manifest is missing, stale or
   * malformed (P8-4a-1; `reason`: a fixed integrity reason code, never a path or digest).
   */
  | "runtime-integrity-failed"
  /** An engine runtime that did not come from `loadEngineRuntime` was offered. */
  | "unverified-runtime"
  /** The sealed runner refused or failed the round (`reason`: the runner's code). */
  | "runner-failed"
  /** A RoundScript (or the runner's output) failed validation or canonical encoding. */
  | "script-invalid"
  /** Canonical bytes do not match the expected digest. */
  | "script-digest-mismatch"
  /** Reservation or preparation failed in the vault or store (`reason`: its code). */
  | "chain-unavailable"
  /** A reservation request id was replayed: the index is never prepared twice. */
  | "request-replayed"
  /** The offline disposition could not be recorded (the index stays open: fail closed). */
  | "disposition-failed"
  /** The audit sink refused an event. */
  | "audit-failed"
  /** A reveal record does not belong to the script's round, or does not verify. */
  | "reveal-mismatch"
  /** The offline environment was closed. */
  | "environment-closed"
  /** A development-only component was asked to run outside development or test. */
  | "development-only"
  /** A malformed argument (request id, salt, chain id). */
  | "invalid-request";

/** Every code, at run time (the audit's SCRIPT_FAILURE_CODES must equal it; a test checks). */
export const ROUND_SCRIPT_ERROR_CODES = Object.freeze([
  "runtime-unavailable",
  "runtime-incompatible",
  "runtime-duplicate-fairness",
  "runtime-known-answer-failed",
  "runtime-integrity-failed",
  "unverified-runtime",
  "runner-failed",
  "script-invalid",
  "script-digest-mismatch",
  "chain-unavailable",
  "request-replayed",
  "disposition-failed",
  "audit-failed",
  "reveal-mismatch",
  "environment-closed",
  "development-only",
  "invalid-request",
] as const satisfies readonly RoundScriptErrorCode[]);

// Compile-time check that the list above names every code of the union.
type Missing = Exclude<RoundScriptErrorCode, (typeof ROUND_SCRIPT_ERROR_CODES)[number]>;
const everyCodeListed: [Missing] extends [never] ? true : never = true;
void everyCodeListed;

const REASON_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export class RoundScriptError extends Error {
  readonly code: RoundScriptErrorCode;
  /** A fixed kebab-case code of the failing layer, or null. Never data. */
  readonly reason: string | null;

  constructor(code: RoundScriptErrorCode, reason: unknown = null) {
    const fixed = typeof reason === "string" && REASON_PATTERN.test(reason) ? reason : null;
    super(fixed === null ? code : `${code}: ${fixed}`);
    this.name = "RoundScriptError";
    this.code = code;
    this.reason = fixed;
  }
}
