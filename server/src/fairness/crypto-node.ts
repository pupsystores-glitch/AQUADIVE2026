// node:crypto adapter for the shared fairness library (P8-3c-1; owner-approved provider).
//
// Implements the two interfaces src/fairness injects (crypto.ts there): `FairnessHashProvider`
// (SHA-256; HMAC-SHA256 with the key prepared once per round as a `KeyObject`) and
// `SecureRandomSource` (`randomBytes`, a CSPRNG). There is no other source of randomness and no
// fallback of any kind.
//
// The adapter is only handed out by `createNodeFairnessCrypto()`, which first verifies it
// (`assertFairnessCryptoReady`): the published SHA-256 / HMAC-SHA256 known answers, the fv = 1
// development vectors end to end (chain link, round seed, derived blocks), the HMAC key-copy
// contract, and basic random-source sanity. Any failure throws `crypto-provider-failed` or
// `secure-random-failed`; a verified object is recorded so that consumers (the chain vault) can
// refuse anything else.
//
// Secret handling (defense in depth; JavaScript cannot guarantee erasure): every Node `Buffer`
// the adapter receives is copied into a plain `Uint8Array` and then zeroed, so no output aliases
// a Node-owned buffer. The prepared `KeyObject` lives only in the returned closure; it is never
// returned, logged or serialized, and OpenSSL frees it when the closure is garbage-collected
// (`RoundDerivation.dispose()` drops the closure).

import { createHash, createHmac, createSecretKey, randomBytes } from "node:crypto";
import {
  FAIRNESS_DEV_VECTORS_V1,
  FairnessError,
  HASH_BYTES,
  SecretBytes,
  assertHashProviderKnownAnswers,
  bytesEqual,
  bytesToHex,
  computeRoundSeed,
  createChainCommitment,
  deriveBlock,
  hexToBytes,
  type FairnessHashProvider,
  type KeyedHmac,
  type SecureRandomSource,
} from "../fairness";

const HASH_ALGORITHM = "sha256";

/** Largest request the random source serves (fairness asks for 32-byte chain seeds). */
const MAX_RANDOM_BYTES = 64;

/** A verified pair of providers for the fairness library. */
export interface NodeFairnessCrypto {
  readonly hash: FairnessHashProvider;
  readonly random: SecureRandomSource;
}

/** Objects that passed `assertFairnessCryptoReady` inside `createNodeFairnessCrypto`. */
const verified = new WeakSet<object>();

/**
 * Copies a Node output buffer into a fresh plain `Uint8Array` and zeroes the original. Throws
 * `crypto-provider-failed` unless it has exactly `length` bytes.
 */
function owned(buffer: Uint8Array, length: number): Uint8Array {
  if (!(buffer instanceof Uint8Array) || buffer.length !== length) {
    throw new FairnessError("crypto-provider-failed", "node:crypto returned unexpected output");
  }
  const out = new Uint8Array(length);
  out.set(buffer);
  buffer.fill(0);
  return out;
}

function assertInput(data: unknown, what: string): asserts data is Uint8Array {
  if (!(data instanceof Uint8Array)) {
    throw new FairnessError("invalid-bytes", `${what} must be a Uint8Array`);
  }
}

const nodeHashProvider: FairnessHashProvider = Object.freeze({
  sha256(data: Uint8Array): Uint8Array {
    assertInput(data, "hash input");
    return owned(createHash(HASH_ALGORITHM).update(data).digest(), HASH_BYTES);
  },
  hmacSha256(key: Uint8Array): KeyedHmac {
    assertInput(key, "HMAC key");
    if (key.length === 0) throw new FairnessError("invalid-length", "HMAC key is empty");
    // createSecretKey copies the key into the KeyObject (the contract src/fairness requires:
    // keyedHmac() zeroes its own copy as soon as this returns).
    const keyObject = createSecretKey(key);
    return (message: Uint8Array): Uint8Array => {
      assertInput(message, "HMAC message");
      return owned(createHmac(HASH_ALGORITHM, keyObject).update(message).digest(), HASH_BYTES);
    };
  },
});

const nodeSecureRandom: SecureRandomSource = Object.freeze({
  randomBytes(length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 1 || length > MAX_RANDOM_BYTES) {
      throw new FairnessError("secure-random-failed", "random length is out of range");
    }
    return owned(randomBytes(length), length);
  },
});

/** The fv = 1 development vectors (public, non-secret) that every provider must reproduce. */
function assertDevelopmentVectors(hash: FairnessHashProvider): void {
  const v = FAIRNESS_DEV_VECTORS_V1;
  const seed = SecretBytes.fromBytes(hexToBytes(v.seedHex));
  let roundSeed: SecretBytes | null = null;
  try {
    const commitment = createChainCommitment(hash, seed, v.chainLength);
    if (bytesToHex(commitment.chainId) !== v.linksHex[0]) {
      throw new FairnessError("crypto-provider-failed", "provider failed the chain vector");
    }
    roundSeed = computeRoundSeed(hash, seed, v.chainLength, 3);
    const probe = roundSeed.reveal();
    const linkOk = bytesToHex(probe) === v.linksHex[3];
    probe.fill(0);
    if (!linkOk) {
      throw new FairnessError("crypto-provider-failed", "provider failed the round seed vector");
    }
    const input = {
      fv: v.fv,
      chainId: commitment.chainId,
      chainIndex: 3,
      salt: hexToBytes(v.saltAHex),
      roundSeed,
    };
    const blocks: [string, number, string][] = [
      ["crash", 0, v.blocksIndex3SaltA.crash0],
      ["chests", 1, v.blocksIndex3SaltA.chests1],
      ["world", 511, v.blocksIndex3SaltA.world511],
    ];
    for (const [purpose, counter, expected] of blocks) {
      if (bytesToHex(deriveBlock(hash, input, purpose, counter)) !== expected) {
        throw new FairnessError("crypto-provider-failed", "provider failed a derivation vector");
      }
    }
  } finally {
    seed.dispose();
    roundSeed?.dispose();
  }
}

/** The prepared HMAC must not depend on the caller's key buffer after preparation. */
function assertHmacKeyCopied(hash: FairnessHashProvider): void {
  // RFC 4231 test case 2 (also part of the published known answers).
  const key = hexToBytes("4a656665");
  const message = hexToBytes("7768617420646f2079612077616e7420666f72206e6f7468696e673f");
  const expected = hexToBytes("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  const mac = hash.hmacSha256(key);
  key.fill(0);
  const out = mac(message);
  if (!(out instanceof Uint8Array) || !bytesEqual(out, expected)) {
    throw new FairnessError("crypto-provider-failed", "provider keeps the caller's HMAC key");
  }
}

/**
 * Basic sanity of a secure random source: correct type and length, not all zero, and two
 * consecutive draws differ. This rejects broken or stubbed sources; it is no statistical test.
 */
function assertRandomSane(random: SecureRandomSource): void {
  const draw = (): Uint8Array => {
    let out: unknown;
    try {
      out = random.randomBytes(HASH_BYTES);
    } catch {
      throw new FairnessError("secure-random-failed", "secure random source threw");
    }
    if (!(out instanceof Uint8Array) || out.length !== HASH_BYTES) {
      throw new FairnessError("secure-random-failed", "secure random source returned wrong output");
    }
    return out;
  };
  const a = draw();
  const b = draw();
  try {
    let any = 0;
    for (const x of a) any |= x;
    if (any === 0 || bytesEqual(a, b)) {
      throw new FairnessError("secure-random-failed", "secure random source looks broken");
    }
  } finally {
    a.fill(0);
    b.fill(0);
  }
}

/**
 * Throws unless the providers reproduce every known answer and the random source is sane. Usable
 * on any provider pair; `createNodeFairnessCrypto` runs it on node:crypto.
 */
export function assertFairnessCryptoReady(crypto: NodeFairnessCrypto): void {
  if (
    typeof crypto !== "object" ||
    crypto === null ||
    typeof crypto.hash?.sha256 !== "function" ||
    typeof crypto.hash?.hmacSha256 !== "function" ||
    typeof crypto.random?.randomBytes !== "function"
  ) {
    throw new FairnessError("crypto-provider-failed", "crypto providers are incomplete");
  }
  assertHashProviderKnownAnswers(crypto.hash);
  try {
    assertHmacKeyCopied(crypto.hash);
    assertDevelopmentVectors(crypto.hash);
  } catch (err) {
    if (err instanceof FairnessError && err.code === "crypto-provider-failed") throw err;
    throw new FairnessError("crypto-provider-failed", "provider failed a known-answer check");
  }
  assertRandomSane(crypto.random);
}

/** The verified node:crypto providers. Throws if node:crypto does not behave as specified. */
export function createNodeFairnessCrypto(): NodeFairnessCrypto {
  const crypto: NodeFairnessCrypto = Object.freeze({
    hash: nodeHashProvider,
    random: nodeSecureRandom,
  });
  assertFairnessCryptoReady(crypto);
  verified.add(crypto);
  return crypto;
}

/** True iff `crypto` is an object returned by `createNodeFairnessCrypto`. */
export function isVerifiedFairnessCrypto(crypto: unknown): crypto is NodeFairnessCrypto {
  return typeof crypto === "object" && crypto !== null && verified.has(crypto);
}
