// TEST AND QA ONLY: fixed, PUBLIC, NON-SECRET development chains for seeded-round tests
// (P8-3b; owner decision D-B10). Never a production chain, never a published commitment.
//
// The P8-3a vectors' chain has only 8 rounds, and `computeRoundSeed` re-hashes from the top for
// every index (development use). Distribution tests need up to 10^6 rounds, so this helper walks
// one chain once and keeps every link: x_N = SHA-256(phrase), x_i = SHA-256(x_(i+1)), chain id x_0.
// `dev-chain.test.ts` checks it against createChainCommitment / computeRoundSeed.

import {
  SecretBytes,
  bytesToHex,
  sha256,
  type FairnessHashProvider,
  type RoundDerivationInput,
} from "@/fairness";

export const DEV_CHAIN_LABEL =
  "AQUADIVE seeded-round P8-3b development chain (public, non-secret, not for production)";

/** Fixed ASCII phrases; the seed and salt are SHA-256 of these. */
export const DEV_PHRASES = Object.freeze({
  seed: "AQUADIVE seeded-round P8-3b development chain seed. PUBLIC, NOT SECRET. Never use in production.",
  salt: "AQUADIVE seeded-round P8-3b development salt. Fixed test value, not a public beacon value.",
});

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

export interface DevChain {
  readonly label: string;
  readonly length: number;
  readonly chainId: Uint8Array;
  readonly salt: Uint8Array;
  /** Derivation input for round j (1 … length). A fresh SecretBytes per call. */
  input(j: number): RoundDerivationInput;
  /** x_j as hex (public here: development chain). */
  linkHex(j: number): string;
}

/**
 * Builds a development chain of `length` rounds from `seedPhrase` (default DEV_PHRASES.seed).
 * Cost: `length` SHA-256 calls and 32 bytes per link.
 */
export function buildDevChain(
  provider: FairnessHashProvider,
  length: number,
  seedPhrase: string = DEV_PHRASES.seed,
  saltPhrase: string = DEV_PHRASES.salt,
): DevChain {
  if (!Number.isInteger(length) || length < 1) throw new RangeError("chain length must be ≥ 1");
  const links: Uint8Array[] = new Array(length + 1);
  links[length] = sha256(provider, ascii(seedPhrase));
  for (let i = length - 1; i >= 0; i--) links[i] = sha256(provider, links[i + 1]);
  const chainId = links[0];
  const salt = sha256(provider, ascii(saltPhrase));
  return Object.freeze({
    label: DEV_CHAIN_LABEL,
    length,
    chainId,
    salt,
    input(j: number): RoundDerivationInput {
      if (!Number.isInteger(j) || j < 1 || j > length) throw new RangeError("index out of range");
      return { fv: 1, chainId, chainIndex: j, salt, roundSeed: SecretBytes.fromBytes(links[j]) };
    },
    linkHex(j: number): string {
      return bytesToHex(links[j]);
    },
  });
}
