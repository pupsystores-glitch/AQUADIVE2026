// The chain store boundary (P8-3c-2; owner-approved interface).
//
// A ChainStore keeps one or more reverse hash chains: the public commitment, the secret
// checkpoints, the chain state, and one record per reserved round index. It is the persistence
// boundary: P8-3c ships only a development in-memory implementation (memory-chain-store.ts); a
// durable implementation (PostgreSQL, KMS / encryption, recovery) is P8-7 and does not exist.
//
// Rules every implementation must enforce atomically per call:
//
// - Index reservation is monotonic (1, 2, 3, …): an index is never reused and never skipped
//   silently. A reservation is keyed by a caller request id; repeating the id returns the SAME
//   index (an ambiguous failure is retried, never answered with a fresh index).
// - The public salt is bound to an index before any derivation, and only once (a retry cannot
//   choose a different salt, so outcomes cannot be shopped for).
// - A derivation is issued at most once per index.
// - A disposition (completed, aborted, voided, indeterminate) is a recorded classification, not a
//   settlement decision. `indeterminate` may later be replaced by a final classification; final
//   classifications never change. Both stay in the history.
// - A reveal is recorded only for a concluded round, and only while every earlier reserved index
//   is concluded or revealed: revealing x_j discloses every x_i with i < j (SHA-256 runs forward),
//   so it must never expose a round that is still live. Revealed data never changes; a
//   contradicting reveal marks the chain compromised. A store does not hash: the vault verifies
//   every link (reveal.ts) before it records a reveal, and the store checks only equality with
//   the chain id and with recorded neighbours. Only the vault may write reveals.
//
// Snapshots are plain, frozen, public-safe views: they never contain unrevealed seed material.
// Secret checkpoints leave the store only as fresh `SecretBytes` copies the caller must dispose.

import type { ChainCommitment, SecretBytes } from "../fairness";
import { ChainError } from "./errors";

export type ChainState = "active" | "suspended" | "exhausted" | "retired" | "compromised";

/**
 * Explicit transitions an operator may request. `exhausted` is entered only automatically, when
 * the last index is reserved. `retired` and `compromised` are terminal (a retired chain may still
 * be found compromised).
 */
export const CHAIN_TRANSITIONS: Readonly<Record<ChainState, readonly ChainState[]>> = Object.freeze(
  {
    active: Object.freeze(["suspended", "retired", "compromised"] as ChainState[]),
    suspended: Object.freeze(["active", "retired", "compromised"] as ChainState[]),
    exhausted: Object.freeze(["retired", "compromised"] as ChainState[]),
    retired: Object.freeze(["compromised"] as ChainState[]),
    compromised: Object.freeze([] as ChainState[]),
  },
);

/** What each chain state allows. */
export const CHAIN_STATE_RULES: Readonly<
  Record<ChainState, { reserve: boolean; derive: boolean; reveal: boolean }>
> = Object.freeze({
  active: Object.freeze({ reserve: true, derive: true, reveal: true }),
  suspended: Object.freeze({ reserve: false, derive: false, reveal: true }),
  exhausted: Object.freeze({ reserve: false, derive: true, reveal: true }),
  retired: Object.freeze({ reserve: false, derive: false, reveal: true }),
  compromised: Object.freeze({ reserve: false, derive: false, reveal: false }),
});

/**
 * Classification of a reserved round, recorded as evidence. It does not decide settlement,
 * refunds or payouts (no business rule is encoded here).
 * - completed: the round reached its terminal state with outcomes derived.
 * - aborted: the round stopped before completing.
 * - voided: the round was deliberately invalidated by an operator decision.
 * - indeterminate: what happened cannot be established (yet); may be replaced by a final value.
 */
export type RoundDisposition = "completed" | "aborted" | "voided" | "indeterminate";

export const ROUND_DISPOSITIONS: readonly RoundDisposition[] = Object.freeze([
  "completed",
  "aborted",
  "voided",
  "indeterminate",
]);

/** Store guarantees, stated explicitly so a caller can refuse a store that is too weak. */
export interface StoreGuarantees {
  /** State survives a process restart. */
  readonly durable: boolean;
  /** Index uniqueness holds across processes and restarts (not only inside one process). */
  readonly crossProcessIndexUniqueness: boolean;
  /** Multi-step operations are atomic (each single call is atomic in every implementation). */
  readonly multiStepTransactions: boolean;
  /** The store may be used in production. */
  readonly productionUse: boolean;
}

export interface ChainSnapshot {
  /** x_0 as lower-case hex (public). */
  readonly chainId: string;
  readonly fv: number;
  readonly length: number;
  readonly checkpointInterval: number;
  readonly state: ChainState;
  /** 0 before the first reservation. */
  readonly lastReservedIndex: number;
  readonly revealedCount: number;
}

export interface DispositionEntry {
  readonly disposition: RoundDisposition;
  readonly reasonCode: string;
}

export interface RevealedData {
  /** x_j, public after the reveal. */
  readonly seedHex: string;
  /** x_(j−1) = SHA-256(x_j); for j = 1 the chain id. */
  readonly previousLinkHex: string;
}

export interface IndexSnapshot {
  readonly chainId: string;
  readonly index: number;
  readonly requestId: string;
  /** The bound public salt, or null before binding. */
  readonly saltHex: string | null;
  readonly derivationIssued: boolean;
  /** The current classification, or null while the round is open. */
  readonly disposition: RoundDisposition | null;
  readonly dispositionHistory: readonly DispositionEntry[];
  readonly reveal: RevealedData | null;
}

export interface NewChainInput {
  readonly commitment: ChainCommitment;
  readonly checkpointInterval: number;
  /** x_c for every checkpoint index c (checkpoints.ts). The store keeps its own copies. */
  readonly checkpoints: ReadonlyMap<number, SecretBytes>;
}

/** A revealed link next to an index, for reveal verification (public data only). */
export interface RevealNeighbours {
  /** The nearest revealed index below, or index 0 with the chain id. */
  readonly below: { readonly index: number; readonly linkHex: string };
  /** The nearest revealed index above, if any. */
  readonly above: { readonly index: number; readonly seedHex: string } | null;
}

export interface StoreResult<T> {
  readonly value: T;
  /** True when the call repeated an earlier identical call and changed nothing. */
  readonly replayed: boolean;
}

export interface ChainStore {
  readonly guarantees: StoreGuarantees;
  createChain(input: NewChainInput): Promise<ChainSnapshot>;
  getChain(chainId: string): Promise<ChainSnapshot>;
  transitionChain(chainId: string, to: ChainState, reasonCode: string): Promise<ChainSnapshot>;
  /** Reserves the next index for `requestId`, or returns the index that id already holds. */
  reserveIndex(chainId: string, requestId: string): Promise<StoreResult<IndexSnapshot>>;
  getIndex(chainId: string, index: number): Promise<IndexSnapshot>;
  bindSalt(chainId: string, index: number, salt: Uint8Array): Promise<StoreResult<IndexSnapshot>>;
  markDerivationIssued(chainId: string, index: number): Promise<IndexSnapshot>;
  classifyRound(
    chainId: string,
    index: number,
    disposition: RoundDisposition,
    reasonCode: string,
  ): Promise<StoreResult<IndexSnapshot>>;
  revealNeighbours(chainId: string, index: number): Promise<RevealNeighbours>;
  recordReveal(
    chainId: string,
    index: number,
    seed: Uint8Array,
    previousLink: Uint8Array,
  ): Promise<StoreResult<IndexSnapshot>>;
  /** A fresh copy of checkpoint x_c; the caller disposes it. */
  readCheckpoint(chainId: string, checkpointIndex: number): Promise<SecretBytes>;
  /** Disposes every secret the store holds; later calls throw `store-closed`. */
  close(): void;
}

const CHAIN_ID_PATTERN = /^[0-9a-f]{64}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REASON_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export function assertChainIdHex(chainId: unknown): asserts chainId is string {
  if (typeof chainId !== "string" || !CHAIN_ID_PATTERN.test(chainId)) {
    throw new ChainError("invalid-chain-id", "chain id must be 64 lower-case hex characters");
  }
}

export function assertRequestId(requestId: unknown): asserts requestId is string {
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new ChainError("invalid-request-id", "request id is malformed");
  }
}

/** Reason codes are short kebab-case identifiers, never free text (no data can leak through). */
export function assertReasonCode(reasonCode: unknown): asserts reasonCode is string {
  if (typeof reasonCode !== "string" || !REASON_PATTERN.test(reasonCode)) {
    throw new ChainError("invalid-reason", "reason code is malformed");
  }
}

export function assertDisposition(disposition: unknown): asserts disposition is RoundDisposition {
  if (!ROUND_DISPOSITIONS.includes(disposition as RoundDisposition)) {
    throw new ChainError("invalid-disposition", "unknown round disposition");
  }
}
