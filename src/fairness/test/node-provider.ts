// TEST AND QA ONLY: node:crypto providers for src/fairness tests and benchmarks.
// This is not the server crypto adapter (that is P8-3c, D9) and nothing outside tests imports it.
import { createHash, createHmac, createSecretKey, randomBytes } from "node:crypto";
import type { FairnessHashProvider, SecureRandomSource } from "../crypto.ts";

/** node:crypto (OpenSSL). The HMAC key is prepared once as a KeyObject (createSecretKey copies it). */
export const nodeHashProvider: FairnessHashProvider = {
  sha256: (data) => new Uint8Array(createHash("sha256").update(data).digest()),
  hmacSha256: (key) => {
    const k = createSecretKey(key);
    return (message) => new Uint8Array(createHmac("sha256", k).update(message).digest());
  },
};

/** node:crypto randomBytes (a CSPRNG). Test use only: tests never print what it returns. */
export const nodeSecureRandom: SecureRandomSource = {
  randomBytes: (length) => new Uint8Array(randomBytes(length)),
};
