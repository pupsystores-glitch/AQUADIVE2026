// Deterministic purpose-separated random streams (P8-3a; docs/09 §16.4, §38).
//
// Draw k of a purpose is word (k mod 4) of block ⌊k / 4⌋, where a block is one 32-byte HMAC-SHA256
// output read as four big-endian 64-bit words. The draw value is the word's top 52 bits divided
// by 2^52: an integer below 2^52 divided by a power of two is exact in IEEE-754 binary64, so every
// value is exactly representable, lies in [0, 1 − 2^−52] ⊂ [0, 1), and is identical on every
// conforming JavaScript engine (no Math.exp / Math.pow / platform float behaviour is involved).
//
// `next(): number` matches the shape of the engine's `Rng` contract without importing the engine
// (D5, D6). Wiring a stream into a RoundAuthority is P8-3b, not P8-3a.

import { DRAWS_PER_BLOCK, FairnessError, HASH_BYTES } from "./version.ts";

const TWO_POW_20 = 0x10_0000;
const TWO_POW_52 = 0x10_0000_0000_0000;

/** The top 52 bits of big-endian 64-bit word `word` (0 … 3) of `block`, as an exact integer. */
export function top52(block: Uint8Array, word: number): number {
  if (!(block instanceof Uint8Array) || block.length !== HASH_BYTES) {
    throw new FairnessError("invalid-bytes", "block must be 32 bytes");
  }
  if (!Number.isInteger(word) || word < 0 || word >= DRAWS_PER_BLOCK) {
    throw new FairnessError("invalid-counter", "word index must be 0 … 3");
  }
  const o = word * 8;
  const hi = ((block[o] << 24) | (block[o + 1] << 16) | (block[o + 2] << 8) | block[o + 3]) >>> 0;
  const lo =
    ((block[o + 4] << 24) | (block[o + 5] << 16) | (block[o + 6] << 8) | block[o + 7]) >>> 0;
  return hi * TWO_POW_20 + (lo >>> 12);
}

/** Draw value of word `word` of `block`: top52 / 2^52, exactly, in [0, 1). */
export function unitFromBlock(block: Uint8Array, word: number): number {
  return top52(block, word) / TWO_POW_52;
}

/** Produces block `counter` of one purpose; supplied by derive.ts. */
export type BlockSource = (counter: number) => Uint8Array;

/**
 * One purpose's stream for one round. It draws at most `drawLimit` values; the next call after
 * that throws `draw-limit-exceeded` and every later call throws again (it never wraps, repeats or
 * falls back to another source). Not safe to share between purposes.
 *
 * Lifecycle (P8-3b-0): `dispose()` zeroes the cached block and drops the block source; it is
 * idempotent, and every later `next()` throws `secret-disposed`. Erasure is best effort only.
 */
export class SeededStream {
  readonly purpose: string;
  readonly drawLimit: number;
  #source: BlockSource | null;
  #block: Uint8Array | null = null;
  #draws = 0;

  constructor(purpose: string, drawLimit: number, source: BlockSource) {
    if (!Number.isInteger(drawLimit) || drawLimit < 1) {
      throw new FairnessError("invalid-counter", "draw limit must be a positive integer");
    }
    if (typeof source !== "function") {
      throw new FairnessError("crypto-provider-failed", "stream needs a block source");
    }
    this.purpose = purpose;
    this.drawLimit = drawLimit;
    this.#source = source;
    Object.freeze(this);
  }

  /** Draws used so far. */
  get drawsUsed(): number {
    return this.#draws;
  }

  get remaining(): number {
    return this.drawLimit - this.#draws;
  }

  /** True once `dispose()` has run. */
  get disposed(): boolean {
    return this.#source === null;
  }

  /** The next value in [0, 1). Throws `secret-disposed` after `dispose()`. */
  next(): number {
    const source = this.#source;
    if (source === null) {
      throw new FairnessError("secret-disposed", `purpose ${this.purpose} stream was disposed`);
    }
    if (this.#draws >= this.drawLimit) {
      this.#clear();
      throw new FairnessError(
        "draw-limit-exceeded",
        `purpose ${this.purpose} exceeded its draw limit`,
      );
    }
    const word = this.#draws % DRAWS_PER_BLOCK;
    if (word === 0) {
      this.#clear();
      this.#block = source(this.#draws / DRAWS_PER_BLOCK);
    }
    const value = unitFromBlock(this.#block as Uint8Array, word);
    this.#draws++;
    return value;
  }

  /** Zeroes the cached block and drops the block source (idempotent). */
  dispose(): void {
    this.#clear();
    this.#source = null;
  }

  /**
   * Serialization shows bookkeeping, never block material. The draw count is outcome-relevant and
   * therefore SECRET until the round's reveal (P8-3b, D-B4): a live stream must never reach a
   * public message, snapshot or log, so a consumer keeps its live streams private.
   */
  toJSON(): { purpose: string; drawsUsed: number; drawLimit: number } {
    return { purpose: this.purpose, drawsUsed: this.#draws, drawLimit: this.drawLimit };
  }

  #clear(): void {
    if (this.#block) this.#block.fill(0);
    this.#block = null;
  }
}
