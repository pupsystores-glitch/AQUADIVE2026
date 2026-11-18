// Reverse hash chain (P8-3a; D1): construction, link direction, sequence and seed generation.
import { describe, expect, it } from "vitest";
import {
  assertChainLength,
  assertNextChainIndex,
  computeRoundSeed,
  createChainCommitment,
  generateChainSeed,
  verifyChainLink,
  verifyRevealSequence,
  verifySeedAgainstCommitment,
  type ChainCommitment,
  type RevealedSeed,
} from "./chain.ts";
import type { SecureRandomSource } from "./crypto.ts";
import { bytesToHex, hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { nodeHashProvider as p, nodeSecureRandom } from "./test/node-provider.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "./vectors.ts";
import { FairnessError, MAX_CHAIN_LENGTH } from "./version.ts";

const seed = SecretBytes.fromBytes(hexToBytes(V.seedHex));
const links = V.linksHex.map(hexToBytes);
const commitment: ChainCommitment = createChainCommitment(p, seed, V.chainLength);
const reveal = (index: number): RevealedSeed => ({ index, seed: links[index] });
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FairnessError) return e.code;
    throw e;
  }
  return "no error";
};

describe("fixed development chain", () => {
  it("the seed is SHA-256 of the public phrase", () => {
    const phrase = new Uint8Array([...V.phrases.seed].map((c) => c.charCodeAt(0)));
    expect(bytesToHex(p.sha256(phrase))).toBe(V.seedHex);
  });

  it("chain id is x_0 = SHA-256^N(seed)", () => {
    expect(bytesToHex(commitment.chainId)).toBe(V.linksHex[0]);
    expect(commitment.length).toBe(8);
    expect(commitment.fv).toBe(1);
    expect(Object.isFrozen(commitment)).toBe(true);
  });

  it("every round seed x_j matches the vector, and x_N is the seed itself", () => {
    for (let j = 1; j <= V.chainLength; j++) {
      expect(bytesToHex(computeRoundSeed(p, seed, V.chainLength, j).reveal())).toBe(V.linksHex[j]);
    }
  });

  it("link direction: SHA-256(x_j) = x_(j-1), never the reverse", () => {
    for (let j = 1; j <= V.chainLength; j++) {
      expect(verifyChainLink(p, links[j], links[j - 1])).toBe(true);
      expect(verifyChainLink(p, links[j - 1], links[j])).toBe(false);
    }
  });

  it("the chain id is not any round seed and no round seed repeats", () => {
    const all = new Set(V.linksHex);
    expect(all.size).toBe(V.chainLength + 1);
  });

  it("does not mutate or consume the chain seed", () => {
    computeRoundSeed(p, seed, V.chainLength, 1);
    expect(bytesToHex(seed.reveal())).toBe(V.seedHex);
  });
});

describe("invalid links", () => {
  it("rejects a flipped bit, a wrong length and non-bytes", () => {
    const flipped = Uint8Array.from(links[3]);
    flipped[31] ^= 1;
    expect(verifyChainLink(p, flipped, links[2])).toBe(false);
    expect(verifyChainLink(p, links[3].slice(0, 31), links[2])).toBe(false);
    expect(verifyChainLink(p, links[3], links[2].slice(0, 31))).toBe(false);
    expect(verifyChainLink(p, "x" as unknown as Uint8Array, links[2])).toBe(false);
  });

  it("rejects skipping a link", () => {
    expect(verifyChainLink(p, links[3], links[1])).toBe(false);
  });
});

describe("reveal sequences", () => {
  it("accepts the complete ordered sequence 1 … N", () => {
    const all = Array.from({ length: V.chainLength }, (_, i) => reveal(i + 1));
    expect(verifyRevealSequence(p, commitment, all)).toEqual({ ok: true });
    expect(verifyRevealSequence(p, commitment, [])).toEqual({ ok: true });
  });

  it.each([
    ["duplicate index", [1, 2, 2], "duplicate-index", 2],
    ["missing index", [1, 3], "missing-index", 1],
    ["starts after 1", [2], "missing-index", 0],
    ["reordered", [2, 1], "missing-index", 0],
    ["index 0", [0], "index-out-of-range", 0],
    ["beyond the chain", [1, 2, 3, 4, 5, 6, 7, 8, 9], "index-out-of-range", 8],
  ])("%s", (_n, indices, failure, at) => {
    const seq = (indices as number[]).map((i) => ({ index: i, seed: links[Math.min(i, 8)] }));
    expect(verifyRevealSequence(p, commitment, seq)).toEqual({ ok: false, code: failure, at });
  });

  it("flags a broken link at its position", () => {
    const forged = Uint8Array.from(links[2]);
    forged[0] ^= 0x80;
    const seq = [reveal(1), { index: 2, seed: forged }, reveal(3)];
    expect(verifyRevealSequence(p, commitment, seq)).toEqual({
      ok: false,
      code: "broken-link",
      at: 1,
    });
  });

  it("flags a seed with the wrong length", () => {
    expect(verifyRevealSequence(p, commitment, [{ index: 1, seed: links[1].slice(1) }])).toEqual({
      ok: false,
      code: "malformed-seed",
      at: 0,
    });
  });

  it("continues from a verified anchor and detects duplicates and backward steps", () => {
    const anchor = { index: 3, link: links[3] };
    expect(verifyRevealSequence(p, commitment, [reveal(4), reveal(5)], anchor)).toEqual({
      ok: true,
    });
    expect(verifyRevealSequence(p, commitment, [reveal(3)], anchor)).toEqual({
      ok: false,
      code: "duplicate-index",
      at: 0,
    });
    expect(verifyRevealSequence(p, commitment, [reveal(2)], anchor)).toEqual({
      ok: false,
      code: "non-monotonic-index",
      at: 0,
    });
    expect(verifyRevealSequence(p, commitment, [reveal(4), reveal(4)], anchor)).toEqual({
      ok: false,
      code: "duplicate-index",
      at: 1,
    });
  });

  it("rejects a malformed anchor or commitment", () => {
    const bad = (anchor: unknown) => verifyRevealSequence(p, commitment, [], anchor as never);
    expect(bad({ index: 0, link: links[1] })).toEqual({
      ok: false,
      code: "malformed-commitment",
      at: 0,
    });
    expect(bad({ index: 8, link: links[8] })).toEqual({
      ok: false,
      code: "malformed-commitment",
      at: 0,
    });
    expect(bad({ index: -1, link: links[0] })).toEqual({
      ok: false,
      code: "malformed-commitment",
      at: 0,
    });
    const wrongFv = { ...commitment, fv: 2 };
    expect(verifyRevealSequence(p, wrongFv, [reveal(1)])).toEqual({
      ok: false,
      code: "malformed-commitment",
      at: 0,
    });
    expect(verifyRevealSequence(p, null as never, [])).toEqual({
      ok: false,
      code: "malformed-commitment",
      at: 0,
    });
    expect(verifyRevealSequence(p, commitment, "1" as never)).toEqual({
      ok: false,
      code: "malformed-seed",
      at: 0,
    });
  });

  it("a changed chain id makes every reveal fail", () => {
    const other = { ...commitment, chainId: hexToBytes(V.variants.altChainIdHex) };
    expect(verifyRevealSequence(p, other, [reveal(1)])).toEqual({
      ok: false,
      code: "broken-link",
      at: 0,
    });
    expect(verifySeedAgainstCommitment(p, other, reveal(5))).toEqual({
      ok: false,
      code: "broken-link",
      at: 0,
    });
  });
});

describe("single seed against the commitment", () => {
  it("verifies x_j by hashing j times", () => {
    for (let j = 1; j <= 8; j++)
      expect(verifySeedAgainstCommitment(p, commitment, reveal(j))).toEqual({ ok: true });
  });

  it("rejects the wrong index for a seed, out-of-range indices and malformed seeds", () => {
    expect(verifySeedAgainstCommitment(p, commitment, { index: 4, seed: links[3] }).ok).toBe(false);
    expect(verifySeedAgainstCommitment(p, commitment, { index: 0, seed: links[0] })).toEqual({
      ok: false,
      code: "index-out-of-range",
      at: 0,
    });
    expect(verifySeedAgainstCommitment(p, commitment, { index: 9, seed: links[8] }).ok).toBe(false);
    expect(
      verifySeedAgainstCommitment(p, commitment, { index: 1, seed: new Uint8Array(3) }),
    ).toEqual({
      ok: false,
      code: "malformed-seed",
      at: 0,
    });
  });
});

describe("issuer index checks (pure; no durable state)", () => {
  it("accepts exactly lastUsed + 1", () => {
    expect(() => assertNextChainIndex(0, 1, 8)).not.toThrow();
    expect(() => assertNextChainIndex(7, 8, 8)).not.toThrow();
  });

  it.each([
    ["a repeat", 3, 3],
    ["a gap", 3, 5],
    ["a backward step", 3, 2],
    ["exhaustion", 8, 9],
    ["a negative last index", -1, 0],
  ])("rejects %s", (_n, last, next) => {
    expect(code(() => assertNextChainIndex(last as number, next as number, 8))).toBe(
      "invalid-chain-index",
    );
  });
});

describe("construction input validation", () => {
  it.each([0, -1, 1.5, MAX_CHAIN_LENGTH + 1, Number.NaN])("rejects chain length %s", (length) => {
    expect(code(() => assertChainLength(length))).toBe("invalid-chain-length");
    expect(code(() => createChainCommitment(p, seed, length))).toBe("invalid-chain-length");
  });

  it("rejects round indices outside 1 … N", () => {
    for (const j of [0, 9, -1, 2.5])
      expect(code(() => computeRoundSeed(p, seed, 8, j))).toBe("invalid-chain-index");
  });

  it("rejects a non-32-byte or non-wrapped seed and an unsupported version", () => {
    expect(
      code(() => createChainCommitment(p, SecretBytes.fromBytes(new Uint8Array(16).fill(1)), 4)),
    ).toBe("invalid-bytes");
    expect(code(() => createChainCommitment(p, new Uint8Array(32) as never, 4))).toBe(
      "invalid-bytes",
    );
    expect(code(() => createChainCommitment(p, seed, 4, 2))).toBe("unsupported-version");
  });
});

describe("secure seed generation (injected source; no fallback)", () => {
  it("returns 32 wrapped bytes and zeroes the provider's buffer", () => {
    let handed: Uint8Array | null = null;
    const src: SecureRandomSource = {
      randomBytes: (n) => {
        handed = nodeSecureRandom.randomBytes(n);
        return handed;
      },
    };
    const s = generateChainSeed(src);
    expect(s.length).toBe(32);
    expect(Array.from(handed as unknown as Uint8Array).every((b) => b === 0)).toBe(true);
    expect(s.reveal().some((b) => b !== 0)).toBe(true);
  });

  it("asks for exactly 32 bytes", () => {
    const asked: number[] = [];
    generateChainSeed({ randomBytes: (n) => (asked.push(n), new Uint8Array(n).fill(5)) });
    expect(asked).toEqual([32]);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("no entropy");
      },
    ],
    ["returns 31 bytes", () => new Uint8Array(31).fill(1)],
    ["returns 33 bytes", () => new Uint8Array(33).fill(1)],
    ["returns an array", () => new Array(32).fill(1)],
    ["returns all zeros", () => new Uint8Array(32)],
    ["returns nothing", () => undefined],
  ])("rejects a source that %s", (_n, impl) => {
    expect(code(() => generateChainSeed({ randomBytes: impl as never }))).toBe(
      "secure-random-failed",
    );
  });

  it("two real draws differ (sanity, not a randomness test)", () => {
    expect(generateChainSeed(nodeSecureRandom).equals(generateChainSeed(nodeSecureRandom))).toBe(
      false,
    );
  });
});
