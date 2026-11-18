// Domain-separated HMAC-SHA256 derivation (P8-3a; owner decisions D2, D7 — docs/09 §16.4, §38).
//
//   block(purpose, counter) = HMAC-SHA256(key = round seed x_j,
//                                         msg = encodeBlockMessage(fv, chainId, j, salt, purpose, counter))
//
// Inputs are the fairness version, the chain id (terminating hash x_0), the chain index j, the
// explicit public salt, the purpose and the per-purpose block counter. A database round number is
// not an input (D2). Each purpose has its own counter starting at 0, so the number of draws one
// purpose uses never shifts another purpose's values. No per-round beacon is mixed in (D3: OPEN).

import { keyedHmac, type FairnessHashProvider, type KeyedHmac } from "./crypto.ts";
import {
  assertChainId,
  assertChainIndex,
  assertCounter,
  assertPurposeSyntax,
  assertSalt,
  bytesEqual,
  encodeBlockMessage,
} from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { SeededStream } from "./seeded-rng.ts";
import {
  DRAWS_PER_BLOCK,
  FairnessError,
  HASH_BYTES,
  assertSupportedVersion,
  purposeDrawLimit,
} from "./version.ts";

/** Everything one round's derivation depends on. */
export interface RoundDerivationInput {
  readonly fv: number;
  /** The chain's terminating hash x_0. */
  readonly chainId: Uint8Array;
  /** j: this round's index in the chain (1 … N). */
  readonly chainIndex: number;
  /** The explicit public salt. */
  readonly salt: Uint8Array;
  /** x_j, secret until the round's reveal. */
  readonly roundSeed: SecretBytes;
}

/** The highest block counter a purpose may use, from its hard draw limit. */
export function maxBlockCounter(fv: number, purpose: string): number {
  return Math.ceil(purposeDrawLimit(fv, purpose) / DRAWS_PER_BLOCK) - 1;
}

/**
 * One round's validated derivation context. Inputs are validated and copied once; the HMAC key is
 * prepared once. Each purpose's stream can be opened once (a second open throws
 * `purpose-already-open`, so a stream's values are never replayed by accident).
 */
export class RoundDerivation {
  readonly fv: number;
  readonly chainIndex: number;
  #chainId: Uint8Array;
  #salt: Uint8Array;
  #mac: KeyedHmac;
  #opened = new Set<string>();

  private constructor(input: RoundDerivationInput, mac: KeyedHmac) {
    this.fv = input.fv;
    this.chainIndex = input.chainIndex;
    this.#chainId = Uint8Array.from(input.chainId);
    this.#salt = Uint8Array.from(input.salt);
    this.#mac = mac;
    Object.freeze(this);
  }

  static create(provider: FairnessHashProvider, input: RoundDerivationInput): RoundDerivation {
    assertSupportedVersion(input?.fv);
    assertChainId(input.chainId);
    assertChainIndex(input.chainIndex);
    assertSalt(input.salt);
    if (!(input.roundSeed instanceof SecretBytes) || input.roundSeed.length !== HASH_BYTES) {
      throw new FairnessError("invalid-bytes", "round seed must be a 32-byte SecretBytes");
    }
    // x_0 is public and never a round seed (index 0 is not a round).
    const probe = input.roundSeed.reveal();
    const isTerminatingHash = bytesEqual(probe, input.chainId);
    probe.fill(0);
    if (isTerminatingHash) {
      throw new FairnessError("invalid-chain-index", "the terminating hash is not a round seed");
    }
    return new RoundDerivation(input, keyedHmac(provider, input.roundSeed));
  }

  /** Block `counter` of `purpose`. Counters beyond the purpose's draw limit are rejected. */
  block(purpose: string, counter: number): Uint8Array {
    assertPurposeSyntax(purpose);
    assertCounter(counter);
    if (counter > maxBlockCounter(this.fv, purpose)) {
      throw new FairnessError("draw-limit-exceeded", `purpose ${purpose} block counter exhausted`);
    }
    return this.#mac(
      encodeBlockMessage({
        fv: this.fv,
        chainId: this.#chainId,
        chainIndex: this.chainIndex,
        salt: this.#salt,
        purpose,
        counter,
      }),
    );
  }

  /** Opens the stream of `purpose` (once per round context). */
  openStream(purpose: string): SeededStream {
    assertPurposeSyntax(purpose);
    const limit = purposeDrawLimit(this.fv, purpose);
    if (this.#opened.has(purpose)) {
      throw new FairnessError(
        "purpose-already-open",
        `purpose ${purpose} stream was already opened`,
      );
    }
    this.#opened.add(purpose);
    return new SeededStream(purpose, limit, (counter) => this.block(purpose, counter));
  }

  /** Serialization shows only public fields. */
  toJSON(): { fv: number; chainIndex: number } {
    return { fv: this.fv, chainIndex: this.chainIndex };
  }
}

/** One-shot block derivation (prepares the key per call; for vectors and verifiers). */
export function deriveBlock(
  provider: FairnessHashProvider,
  input: RoundDerivationInput,
  purpose: string,
  counter: number,
): Uint8Array {
  return RoundDerivation.create(provider, input).block(purpose, counter);
}
