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
 *
 * Lifecycle (P8-3b-0): `dispose()` releases the prepared HMAC function, zeroes the context's own
 * copies of the chain id and salt, and disposes every stream it opened (zeroing their cached
 * blocks). It is idempotent. Afterwards every operation that needs secret material (`block`,
 * `openStream`, and `next()` on its streams) throws `secret-disposed`. Erasure is best effort:
 * key material held by the crypto provider (for example an OpenSSL `KeyObject`) is released only
 * when the garbage collector frees it, and JavaScript gives no erasure guarantee.
 */
export class RoundDerivation {
  readonly fv: number;
  readonly chainIndex: number;
  #chainId: Uint8Array;
  #salt: Uint8Array;
  #mac: KeyedHmac | null;
  #opened = new Set<string>();
  #streams: SeededStream[] = [];

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
    let isTerminatingHash: boolean;
    try {
      isTerminatingHash = bytesEqual(probe, input.chainId);
    } finally {
      probe.fill(0);
    }
    if (isTerminatingHash) {
      throw new FairnessError("invalid-chain-index", "the terminating hash is not a round seed");
    }
    return new RoundDerivation(input, keyedHmac(provider, input.roundSeed));
  }

  /** True once `dispose()` has run. */
  get disposed(): boolean {
    return this.#mac === null;
  }

  /**
   * Block `counter` of `purpose`. Counters beyond the purpose's draw limit are rejected. Throws
   * `secret-disposed` after `dispose()`.
   */
  block(purpose: string, counter: number): Uint8Array {
    const mac = this.#liveMac();
    assertPurposeSyntax(purpose);
    assertCounter(counter);
    if (counter > maxBlockCounter(this.fv, purpose)) {
      throw new FairnessError("draw-limit-exceeded", `purpose ${purpose} block counter exhausted`);
    }
    return mac(
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

  /** Opens the stream of `purpose` (once per round context). Throws `secret-disposed` after dispose. */
  openStream(purpose: string): SeededStream {
    this.#liveMac();
    assertPurposeSyntax(purpose);
    const limit = purposeDrawLimit(this.fv, purpose);
    if (this.#opened.has(purpose)) {
      throw new FairnessError(
        "purpose-already-open",
        `purpose ${purpose} stream was already opened`,
      );
    }
    this.#opened.add(purpose);
    const stream = new SeededStream(purpose, limit, (counter) => this.block(purpose, counter));
    this.#streams.push(stream);
    return stream;
  }

  /**
   * Ends this context's use of secret material (idempotent). Disposes every stream it opened,
   * drops the prepared HMAC function and zeroes the context's copies of its inputs. The public
   * fields (`fv`, `chainIndex`) stay readable. Best effort only (see the class comment).
   */
  dispose(): void {
    if (this.#mac === null) return;
    this.#mac = null;
    for (const stream of this.#streams) stream.dispose();
    this.#streams = [];
    this.#chainId.fill(0);
    this.#salt.fill(0);
  }

  /** Serialization shows only public fields. */
  toJSON(): { fv: number; chainIndex: number } {
    return { fv: this.fv, chainIndex: this.chainIndex };
  }

  #liveMac(): KeyedHmac {
    if (this.#mac === null) {
      throw new FairnessError("secret-disposed", "round derivation was disposed");
    }
    return this.#mac;
  }
}

/**
 * One-shot block derivation (prepares the key per call; for vectors and verifiers). The temporary
 * context is disposed before returning.
 */
export function deriveBlock(
  provider: FairnessHashProvider,
  input: RoundDerivationInput,
  purpose: string,
  counter: number,
): Uint8Array {
  const derivation = RoundDerivation.create(provider, input);
  try {
    return derivation.block(purpose, counter);
  } finally {
    derivation.dispose();
  }
}
