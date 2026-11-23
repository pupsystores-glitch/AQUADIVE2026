// Typed errors of the server fairness infrastructure (P8-3c-2).
//
// One closed set of codes for the chain store, the vault and their helpers. Messages are
// diagnostic only and never contain secret material: they name the operation and, at most, a
// public chain index. Errors of the shared library (`FairnessError`, for example `invalid-salt`,
// `crypto-provider-failed`, `secret-disposed`) pass through unchanged.

export type ChainErrorCode =
  /** A development-only component was asked to run in production mode. */
  | "development-store-refused"
  /** The crypto object did not come from a verified adapter. */
  | "unverified-crypto"
  | "unknown-chain"
  | "chain-exists"
  | "invalid-chain-id"
  | "invalid-chain-length"
  | "invalid-checkpoint"
  /** The operation is not allowed in the chain's current state. */
  | "invalid-chain-state"
  | "invalid-transition"
  | "chain-exhausted"
  | "invalid-request-id"
  | "invalid-reason"
  | "invalid-index"
  | "index-not-reserved"
  | "salt-not-bound"
  | "salt-conflict"
  | "derivation-already-issued"
  | "invalid-disposition"
  | "disposition-conflict"
  | "round-not-concluded"
  | "reveal-order-violation"
  | "reveal-conflict"
  | "reveal-verification-failed"
  | "invalid-precompute-range"
  | "store-closed"
  | "vault-disposed"
  | "audit-failed";

/** The only error type the server fairness modules throw themselves. `code` is stable. */
export class ChainError extends Error {
  readonly code: ChainErrorCode;

  constructor(code: ChainErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ChainError";
    this.code = code;
  }
}
