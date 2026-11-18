// SHA-256 reverse hash chain (P8-3a; owner decision D1, scheme A — docs/09 §16.3, §38).
//
// A chain of length N starts from a secret 32-byte seed x_N drawn from a secure random source.
// Links are x_{i} = SHA-256(x_{i+1}) for i = N−1 … 0. The terminating hash x_0 is the chain id
// (it is public, published before the chain's first round and never used as a round seed).
// Round j (1 … N) uses x_j as its round seed, so seeds are revealed in the reverse order of their
// generation, and every revealed seed satisfies SHA-256(x_j) = x_{j−1}.
//
// P8-3a builds and verifies chains in memory for development and tests only. It does NOT generate
// or store production chains, choose a public salt source, or persist the last used index: an
// in-memory index gives no uniqueness across a process restart (that needs P8-7 persistence).

import { sha256, type FairnessHashProvider, type SecureRandomSource } from "./crypto.ts";
import { assertChainId, bytesEqual } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import {
  FAIRNESS_VERSION,
  FairnessError,
  HASH_BYTES,
  MAX_CHAIN_LENGTH,
  assertSupportedVersion,
} from "./version.ts";

/** The public chain commitment: everything a verifier needs before the first round. */
export interface ChainCommitment {
  readonly fv: number;
  /** x_0, the terminating hash. */
  readonly chainId: Uint8Array;
  /** N: round seeds exist for indices 1 … N. */
  readonly length: number;
}

/** One revealed round seed. */
export interface RevealedSeed {
  readonly index: number;
  readonly seed: Uint8Array;
}

/** Outcome of verifying untrusted revealed data. Verification never throws for bad data. */
export type ChainVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ChainFailureCode; readonly at: number };

export type ChainFailureCode =
  | "malformed-commitment"
  | "malformed-seed"
  | "index-out-of-range"
  | "duplicate-index"
  | "missing-index"
  | "non-monotonic-index"
  | "broken-link";

/** Validates a chain length: 1 … MAX_CHAIN_LENGTH. */
export function assertChainLength(length: unknown): asserts length is number {
  if (
    typeof length !== "number" ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > MAX_CHAIN_LENGTH
  ) {
    throw new FairnessError("invalid-chain-length", "chain length is out of range");
  }
}

/**
 * Draws a 32-byte chain seed x_N from a secure random source. The provider's buffer is copied
 * into a SecretBytes and then zeroed. Wrong types, wrong lengths and an all-zero result (a broken
 * or stubbed source) are rejected. There is no fallback source of any kind.
 */
export function generateChainSeed(random: SecureRandomSource): SecretBytes {
  let raw: unknown;
  try {
    raw = random.randomBytes(HASH_BYTES);
  } catch {
    throw new FairnessError("secure-random-failed", "secure random source threw");
  }
  if (!(raw instanceof Uint8Array) || raw.length !== HASH_BYTES) {
    throw new FairnessError("secure-random-failed", "secure random source returned wrong output");
  }
  let any = 0;
  for (const b of raw) any |= b;
  if (any === 0) {
    raw.fill(0);
    throw new FairnessError("secure-random-failed", "secure random source returned all zeros");
  }
  const seed = SecretBytes.fromBytes(raw);
  raw.fill(0);
  return seed;
}

/**
 * Applies SHA-256 `times` times to a copy of `start`. Each superseded intermediate link is zeroed
 * as soon as its successor exists (P8-3b-0): between x_N and the returned link they are the seeds
 * of later rounds. `start` belongs to the caller and is never modified; the result is a fresh
 * buffer the caller owns.
 */
function iterate(provider: FairnessHashProvider, start: Uint8Array, times: number): Uint8Array {
  let x = start;
  for (let i = 0; i < times; i++) {
    const next = sha256(provider, x);
    // A provider that hands back the buffer it was given must not lose its own output.
    if (x !== start && next !== x) x.fill(0);
    x = next;
  }
  return x === start ? Uint8Array.from(start) : x;
}

function assertSeed(chainSeed: SecretBytes): void {
  if (!(chainSeed instanceof SecretBytes) || chainSeed.length !== HASH_BYTES) {
    throw new FairnessError("invalid-bytes", "chain seed must be a 32-byte SecretBytes");
  }
}

/** Computes the public commitment of the chain x_N … x_0. Cost: N hashes. */
export function createChainCommitment(
  provider: FairnessHashProvider,
  chainSeed: SecretBytes,
  length: number,
  fv: number = FAIRNESS_VERSION,
): ChainCommitment {
  assertSupportedVersion(fv);
  assertSeed(chainSeed);
  assertChainLength(length);
  const start = chainSeed.reveal();
  try {
    return Object.freeze({ fv, chainId: iterate(provider, start, length), length });
  } finally {
    start.fill(0);
  }
}

/**
 * The round seed x_index for 1 ≤ index ≤ length. Cost: length − index hashes (development use;
 * production storage with checkpoints is P8-3c / P8-7).
 */
export function computeRoundSeed(
  provider: FairnessHashProvider,
  chainSeed: SecretBytes,
  length: number,
  index: number,
): SecretBytes {
  assertSeed(chainSeed);
  assertChainLength(length);
  if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > length) {
    throw new FairnessError("invalid-chain-index", "round index must be 1 … chain length");
  }
  const start = chainSeed.reveal();
  const link = iterate(provider, start, length - index);
  try {
    return SecretBytes.fromBytes(link);
  } finally {
    start.fill(0);
    link.fill(0);
  }
}

/**
 * True iff SHA-256(revealed) equals `previousLink`, i.e. `revealed` is x_j and `previousLink` is
 * x_{j−1} (for j = 1, x_0 is the chain id). The reverse direction does not verify.
 */
export function verifyChainLink(
  provider: FairnessHashProvider,
  revealed: Uint8Array,
  previousLink: Uint8Array,
): boolean {
  if (!(revealed instanceof Uint8Array) || revealed.length !== HASH_BYTES) return false;
  if (!(previousLink instanceof Uint8Array) || previousLink.length !== HASH_BYTES) return false;
  return bytesEqual(sha256(provider, revealed), previousLink);
}

/**
 * Verifies one revealed seed against the chain id alone: SHA-256^index(seed) = x_0. Cost: index
 * hashes; a verifier that already holds x_{index−1} should use verifyChainLink instead.
 */
export function verifySeedAgainstCommitment(
  provider: FairnessHashProvider,
  commitment: ChainCommitment,
  reveal: RevealedSeed,
): ChainVerification {
  const bad = commitmentProblem(commitment);
  if (bad) return bad;
  if (!isIndex(reveal?.index, commitment.length)) {
    return { ok: false, code: "index-out-of-range", at: 0 };
  }
  if (!(reveal.seed instanceof Uint8Array) || reveal.seed.length !== HASH_BYTES) {
    return { ok: false, code: "malformed-seed", at: 0 };
  }
  const x0 = iterate(provider, reveal.seed, reveal.index);
  return bytesEqual(x0, commitment.chainId)
    ? { ok: true }
    : { ok: false, code: "broken-link", at: 0 };
}

/** A link the verifier already trusts: x_index (index 0 means the chain id x_0). */
export interface VerifiedAnchor {
  readonly index: number;
  readonly link: Uint8Array;
}

/**
 * Verifies an ordered sequence of revealed seeds that continues directly after `anchor` (by
 * default the chain id, so the sequence starts at index 1). Indices must be exactly
 * anchor + 1, anchor + 2, … within the chain length (no duplicate, gap or reordering), and each
 * seed must link to its predecessor. `at` is the position in `reveals`. The anchor must itself
 * have been verified earlier; an anchor at index 0 must equal the chain id.
 */
export function verifyRevealSequence(
  provider: FairnessHashProvider,
  commitment: ChainCommitment,
  reveals: readonly RevealedSeed[],
  anchor?: VerifiedAnchor,
): ChainVerification {
  const bad = commitmentProblem(commitment);
  if (bad) return bad;
  const from = anchor ?? { index: 0, link: commitment.chainId };
  if (
    typeof from.index !== "number" ||
    !Number.isInteger(from.index) ||
    from.index < 0 ||
    from.index >= commitment.length ||
    !(from.link instanceof Uint8Array) ||
    from.link.length !== HASH_BYTES ||
    (from.index === 0 && !bytesEqual(from.link, commitment.chainId))
  ) {
    return { ok: false, code: "malformed-commitment", at: 0 };
  }
  if (!Array.isArray(reveals)) return { ok: false, code: "malformed-seed", at: 0 };
  let previous = from.link;
  for (let at = 0; at < reveals.length; at++) {
    const r = reveals[at];
    const expected = from.index + at + 1;
    if (!isIndex(r?.index, commitment.length)) return { ok: false, code: "index-out-of-range", at };
    if (r.index !== expected) {
      const seen = r.index === from.index || reveals.slice(0, at).some((p) => p.index === r.index);
      const code: ChainFailureCode =
        r.index > expected ? "missing-index" : seen ? "duplicate-index" : "non-monotonic-index";
      return { ok: false, code, at };
    }
    if (!(r.seed instanceof Uint8Array) || r.seed.length !== HASH_BYTES) {
      return { ok: false, code: "malformed-seed", at };
    }
    if (!verifyChainLink(provider, r.seed, previous)) return { ok: false, code: "broken-link", at };
    previous = r.seed;
  }
  return { ok: true };
}

/**
 * Explicit monotonic index check for an issuer that knows the last used index (0 before the first
 * round): throws unless `next` is exactly `lastUsed + 1` and within the chain. This is a pure
 * check on caller-supplied state; it does not remember anything and gives no durability.
 */
export function assertNextChainIndex(lastUsed: number, next: number, length: number): void {
  assertChainLength(length);
  if (
    typeof lastUsed !== "number" ||
    !Number.isInteger(lastUsed) ||
    lastUsed < 0 ||
    lastUsed > length
  ) {
    throw new FairnessError("invalid-chain-index", "last used index is out of range");
  }
  if (lastUsed === length) {
    throw new FairnessError("invalid-chain-index", "chain is exhausted");
  }
  if (next !== lastUsed + 1) {
    throw new FairnessError("invalid-chain-index", "next index must follow the last used index");
  }
}

function isIndex(index: unknown, length: number): index is number {
  return typeof index === "number" && Number.isInteger(index) && index >= 1 && index <= length;
}

function commitmentProblem(c: ChainCommitment): ChainVerification | null {
  try {
    assertSupportedVersion(c?.fv);
    assertChainId(c.chainId);
    assertChainLength(c.length);
    return null;
  } catch {
    return { ok: false, code: "malformed-commitment", at: 0 };
  }
}
