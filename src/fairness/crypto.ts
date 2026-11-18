// Injected cryptography (P8-3a; docs/09 §16.5, §38).
//
// The fairness module never imports a crypto implementation. The caller injects one:
// node:crypto on a server (adapter deferred to P8-3c, D9), or a precomputing WebCrypto wrapper in
// a future browser verifier. Every provider output is checked for type and length before use, and
// assertHashProviderKnownAnswers() lets a caller reject a broken provider before deriving anything.

import { SecretBytes } from "./secret.ts";
import { bytesEqual, hexToBytes } from "./encoding.ts";
import { FairnessError, HASH_BYTES } from "./version.ts";

/** A keyed HMAC-SHA256 function: message → 32-byte tag. */
export type KeyedHmac = (message: Uint8Array) => Uint8Array;

/**
 * Synchronous SHA-256 and HMAC-SHA256.
 *
 * Contract: `hmacSha256(key)` must copy `key` if it keeps it (node:crypto's createSecretKey does),
 * and the returned function must be safe to call repeatedly. The key-prepared form exists because
 * preparing a key once per round is several times cheaper than a fresh HMAC per block in Node.
 */
export interface FairnessHashProvider {
  sha256(data: Uint8Array): Uint8Array;
  hmacSha256(key: Uint8Array): KeyedHmac;
}

/** A cryptographically secure random source (e.g. node:crypto randomBytes, getRandomValues). */
export interface SecureRandomSource {
  randomBytes(length: number): Uint8Array;
}

/** SHA-256 through the provider, with the output validated. */
export function sha256(provider: FairnessHashProvider, data: Uint8Array): Uint8Array {
  return checked(provider.sha256(data));
}

/**
 * Prepares HMAC-SHA256 keyed by a secret. The provider receives a copy of the key; the returned
 * function validates every tag it produces.
 */
export function keyedHmac(provider: FairnessHashProvider, key: SecretBytes): KeyedHmac {
  if (!(key instanceof SecretBytes)) {
    throw new FairnessError("invalid-bytes", "HMAC key must be a SecretBytes");
  }
  const mac = provider.hmacSha256(key.reveal());
  if (typeof mac !== "function") {
    throw new FairnessError("crypto-provider-failed", "provider returned no keyed HMAC");
  }
  return (message) => checked(mac(message));
}

function checked(out: unknown): Uint8Array {
  if (!(out instanceof Uint8Array) || out.length !== HASH_BYTES) {
    throw new FairnessError("crypto-provider-failed", "provider output is not 32 bytes");
  }
  return out;
}

// Published known answers: FIPS 180-2 Appendix B.1 ("abc"), the empty-message digest, and
// RFC 4231 test cases 1 and 2 (HMAC-SHA-256).
const KAT = [
  {
    kind: "sha256",
    data: "616263",
    out: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  },
  {
    kind: "sha256",
    data: "",
    out: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    kind: "hmac",
    key: "0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b",
    data: "4869205468657265",
    out: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  },
  {
    kind: "hmac",
    key: "4a656665",
    data: "7768617420646f2079612077616e7420666f72206e6f7468696e673f",
    out: "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  },
] as const;

/** Throws `crypto-provider-failed` unless the provider reproduces the published answers. */
export function assertHashProviderKnownAnswers(provider: FairnessHashProvider): void {
  for (const k of KAT) {
    let out: unknown;
    try {
      out =
        k.kind === "sha256"
          ? provider.sha256(hexToBytes(k.data))
          : provider.hmacSha256(hexToBytes(k.key))(hexToBytes(k.data));
    } catch {
      throw new FairnessError(
        "crypto-provider-failed",
        `provider threw on a ${k.kind} known answer`,
      );
    }
    if (!(out instanceof Uint8Array) || !bytesEqual(out, hexToBytes(k.out))) {
      throw new FairnessError("crypto-provider-failed", `provider failed a ${k.kind} known answer`);
    }
  }
}
