// Versioned development vectors (P8-3a): this module reproduces the independently generated
// vectors with two unrelated SHA-256 implementations (node:crypto / OpenSSL, pure-TypeScript).
import { describe, expect, it } from "vitest";
import { computeRoundSeed, createChainCommitment } from "./chain.ts";
import type { FairnessHashProvider } from "./crypto.ts";
import { RoundDerivation } from "./derive.ts";
import { bytesToHex, encodeBlockMessage, hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { nodeHashProvider } from "./test/node-provider.ts";
import { referenceHashProvider } from "./test/sha256-reference.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "./vectors.ts";

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe("vector file integrity", () => {
  it("is frozen, labelled non-secret, and fv = 1", () => {
    expect(Object.isFrozen(V)).toBe(true);
    expect(V.fv).toBe(1);
    expect(V.label).toMatch(/non-secret, not for production/);
    for (const phrase of Object.values(V.phrases))
      expect(phrase).toMatch(/NOT SECRET|not a public beacon/);
  });
});

describe.each([
  ["node:crypto (OpenSSL)", nodeHashProvider],
  ["pure-TypeScript reference", referenceHashProvider],
] as [string, FairnessHashProvider][])("reproduces every vector — %s", (_n, p) => {
  const seed = SecretBytes.fromBytes(hexToBytes(V.seedHex));
  const ctx = (index = 3, saltHex: string = V.saltAHex, chainIdHex: string = V.linksHex[0]) =>
    RoundDerivation.create(p, {
      fv: 1,
      chainId: hexToBytes(chainIdHex),
      chainIndex: index,
      salt: hexToBytes(saltHex),
      roundSeed: computeRoundSeed(p, seed, V.chainLength, index),
    });

  it("seed and salts derive from the public phrases", () => {
    expect(bytesToHex(p.sha256(ascii(V.phrases.seed)))).toBe(V.seedHex);
    expect(bytesToHex(p.sha256(ascii(V.phrases.saltA)))).toBe(V.saltAHex);
    expect(bytesToHex(p.sha256(ascii(V.phrases.saltB)))).toBe(V.saltBHex);
  });

  it("chain links", () => {
    expect(bytesToHex(createChainCommitment(p, seed, V.chainLength).chainId)).toBe(V.linksHex[0]);
    for (let j = 1; j <= V.chainLength; j++) {
      expect(bytesToHex(computeRoundSeed(p, seed, V.chainLength, j).reveal())).toBe(V.linksHex[j]);
    }
  });

  it("canonical message", () => {
    const m = encodeBlockMessage({
      fv: 1,
      chainId: hexToBytes(V.linksHex[0]),
      chainIndex: 3,
      salt: hexToBytes(V.saltAHex),
      purpose: "crash",
      counter: 0,
    });
    expect(bytesToHex(m)).toBe(V.messageIndex3SaltACrash0Hex);
  });

  it("blocks and variants", () => {
    const d = ctx();
    for (const [name, hex] of Object.entries(V.blocksIndex3SaltA)) {
      const purpose = name.replace(/\d+$/, "");
      expect(bytesToHex(d.block(purpose, Number(name.slice(purpose.length))))).toBe(hex);
    }
    expect(bytesToHex(ctx(3, V.saltBHex).block("crash", 0))).toBe(V.variants.saltB_index3_crash0);
    expect(bytesToHex(ctx(4).block("crash", 0))).toBe(V.variants.index4_saltA_crash0);
    expect(bytesToHex(p.sha256(hexToBytes(V.linksHex[0])))).toBe(V.variants.altChainIdHex);
    expect(bytesToHex(ctx(3, V.saltAHex, V.variants.altChainIdHex).block("crash", 0))).toBe(
      V.variants.altChainId_index3_saltA_crash0,
    );
  });

  it("draws", () => {
    const d = ctx();
    const check = (purpose: string, list: readonly { u52: number; value: number }[]) => {
      const s = d.openStream(purpose);
      for (const e of list) expect(s.next()).toBe(e.value);
    };
    check("crash", V.drawsIndex3SaltA.crash);
    check("jackpot", V.drawsIndex3SaltA.jackpot);
    check("chests", V.drawsIndex3SaltA.chests);
    check("world", V.drawsIndex3SaltA.worldFirst8);
  });
});
