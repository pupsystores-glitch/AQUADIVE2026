// The test-only development chain (P8-3b; D-B10) is a genuine fv = 1 reverse hash chain: it
// agrees with src/fairness's own chain construction and verification.
import { describe, expect, it } from "vitest";
import {
  SecretBytes,
  bytesToHex,
  computeRoundSeed,
  createChainCommitment,
  hexToBytes,
  sha256,
  verifyRevealSequence,
} from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { DEV_CHAIN_LABEL, DEV_PHRASES, buildDevChain } from "./test/dev-chain";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("development chain", () => {
  const LENGTH = 64;
  const chain = buildDevChain(p, LENGTH);
  const seed = SecretBytes.fromBytes(sha256(p, ascii(DEV_PHRASES.seed)));

  it("is labelled public and non-secret", () => {
    expect(chain.label).toBe(DEV_CHAIN_LABEL);
    expect(DEV_CHAIN_LABEL).toMatch(/public, non-secret, not for production/);
    expect(DEV_PHRASES.seed).toMatch(/PUBLIC, NOT SECRET/);
  });

  it("its chain id is createChainCommitment's x_0", () => {
    expect(bytesToHex(chain.chainId)).toBe(
      bytesToHex(createChainCommitment(p, seed, LENGTH).chainId),
    );
  });

  it("every round seed is computeRoundSeed's x_j", () => {
    for (const j of [1, 2, 31, 63, 64]) {
      expect(chain.linkHex(j)).toBe(bytesToHex(computeRoundSeed(p, seed, LENGTH, j).reveal()));
      expect(bytesToHex(chain.input(j).roundSeed.reveal())).toBe(chain.linkHex(j));
    }
  });

  it("its reveals verify as one complete sequence", () => {
    const commitment = createChainCommitment(p, seed, LENGTH);
    const reveals = Array.from({ length: LENGTH }, (_, i) => ({
      index: i + 1,
      seed: hexToBytes(chain.linkHex(i + 1)),
    }));
    expect(verifyRevealSequence(p, commitment, reveals)).toEqual({ ok: true });
  });

  it("the salt is SHA-256 of its phrase, and inputs carry fv 1 and the index", () => {
    expect(bytesToHex(chain.salt)).toBe(bytesToHex(sha256(p, ascii(DEV_PHRASES.salt))));
    const input = chain.input(5);
    expect(input.fv).toBe(1);
    expect(input.chainIndex).toBe(5);
    expect(() => chain.input(0)).toThrow(RangeError);
    expect(() => chain.input(LENGTH + 1)).toThrow(RangeError);
  });
});
