// Round key derivation from a reserved chain index (P8-3c-2).
//
// RoundKeys owns exactly one src/fairness `RoundDerivation`, created from a genuinely reserved
// index, its bound public salt and its round seed x_j. Only the chain vault creates RoundKeys,
// once per index (the store records the issue). The caller owns the result and must `dispose()`
// it when the round no longer needs derivation; disposal is idempotent and disposes the
// derivation (P8-3b-0 lifecycle: its streams, cached blocks and prepared HMAC are released).
//
// Serialization shows only public fields (chain id, index, salt). The round seed is never held:
// the vault disposes its copy as soon as the derivation is prepared. P8-3c does not bind a
// SeededRoundAuthority, construct a GameEngine or derive gameplay outcomes (P8-4).

import {
  FAIRNESS_VERSION,
  FairnessError,
  MAX_SALT_BYTES,
  MIN_SALT_BYTES,
  RoundDerivation,
  bytesToHex,
  hexToBytes,
  type FairnessHashProvider,
  type SecretBytes,
} from "../fairness";

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** Throws `invalid-salt` unless `salt` is an explicit 16 – 64 byte public salt. */
export function assertPublicSalt(salt: unknown): asserts salt is Uint8Array {
  if (
    !(salt instanceof Uint8Array) ||
    salt.length < MIN_SALT_BYTES ||
    salt.length > MAX_SALT_BYTES
  ) {
    throw new FairnessError("invalid-salt", "salt must be 16 to 64 bytes");
  }
}

export interface RoundKeysInput {
  readonly chainId: string;
  readonly chainIndex: number;
  readonly salt: Uint8Array;
  /** x_j; borrowed, not disposed by RoundKeys. */
  readonly roundSeed: SecretBytes;
}

export class RoundKeys {
  readonly chainId: string;
  readonly chainIndex: number;
  readonly salt: string;
  #derivation: RoundDerivation | null;

  private constructor(input: RoundKeysInput, derivation: RoundDerivation) {
    this.chainId = input.chainId;
    this.chainIndex = input.chainIndex;
    this.salt = bytesToHex(input.salt);
    this.#derivation = derivation;
    Object.freeze(this);
  }

  /** Prepares the round's derivation (validates every input through src/fairness). */
  static create(provider: FairnessHashProvider, input: RoundKeysInput): RoundKeys {
    assertPublicSalt(input.salt);
    const derivation = RoundDerivation.create(provider, {
      fv: FAIRNESS_VERSION,
      chainId: hexToBytes(input.chainId),
      chainIndex: input.chainIndex,
      salt: input.salt,
      roundSeed: input.roundSeed,
    });
    return new RoundKeys(input, derivation);
  }

  get disposed(): boolean {
    return this.#derivation === null;
  }

  /** The round's derivation. Throws `secret-disposed` after `dispose()`. */
  get derivation(): RoundDerivation {
    if (this.#derivation === null) {
      throw new FairnessError("secret-disposed", "round keys were disposed");
    }
    return this.#derivation;
  }

  /** Disposes the derivation (idempotent). Best effort: see src/fairness README §7. */
  dispose(): void {
    this.#derivation?.dispose();
    this.#derivation = null;
  }

  toJSON(): { chainId: string; chainIndex: number; salt: string } {
    return { chainId: this.chainId, chainIndex: this.chainIndex, salt: this.salt };
  }

  [INSPECT](): string {
    return `RoundKeys { chainIndex: ${this.chainIndex} } [secrets redacted]`;
  }
}
