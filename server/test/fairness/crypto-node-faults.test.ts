// node:crypto misbehaviour (P8-3c-1, tests 1 – 3): the adapter must fail closed when the
// platform crypto is wrong, and must zero every Node buffer it receives. node:crypto is replaced
// by a wrapper that delegates to the real module unless a fault is selected.
import { afterEach, describe, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({
  mode: "none" as
    "none" | "wrong-hash" | "wrong-hmac" | "short-digest" | "zero-random" | "repeat-random",
  captured: [] as Uint8Array[],
}));

vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  const capture = <T extends Uint8Array>(b: T): T => {
    fault.captured.push(b);
    return b;
  };
  const wrapDigest = <H extends { update(d: Uint8Array): H; digest(): Buffer }>(h: H) => ({
    update(d: Uint8Array) {
      h.update(d);
      return this;
    },
    digest() {
      const out = h.digest();
      return capture(fault.mode === "short-digest" ? out.subarray(0, 31) : out);
    },
  });
  return {
    ...real,
    createHash: (alg: string) =>
      wrapDigest(real.createHash(fault.mode === "wrong-hash" ? "sha512-256" : alg)),
    createHmac: (alg: string, key: import("node:crypto").KeyObject) =>
      wrapDigest(real.createHmac(fault.mode === "wrong-hmac" ? "sha3-256" : alg, key)),
    randomBytes: (n: number) => {
      if (fault.mode === "zero-random") return capture(Buffer.alloc(n));
      if (fault.mode === "repeat-random") return capture(Buffer.alloc(n, 0x5a));
      return capture(real.randomBytes(n));
    },
  };
});

const { createNodeFairnessCrypto } = await import("../../src/fairness/crypto-node");
const { expectCode } = await import("../helpers/fairness-crypto");

afterEach(() => {
  fault.mode = "none";
  fault.captured.length = 0;
});

describe("node:crypto faults fail closed", () => {
  it.each([
    ["a different hash algorithm (SHA-512/256)", "wrong-hash", "crypto-provider-failed"],
    ["a different HMAC algorithm (HMAC-SHA3-256)", "wrong-hmac", "crypto-provider-failed"],
    ["a truncated digest", "short-digest", "crypto-provider-failed"],
    ["an all-zero random source", "zero-random", "secure-random-failed"],
    ["a repeating random source", "repeat-random", "secure-random-failed"],
  ] as const)("%s → %s", async (_name, mode, code) => {
    fault.mode = mode;
    await expectCode(() => createNodeFairnessCrypto(), code);
  });

  it("the real module passes (the wrapper itself is transparent)", () => {
    expect(() => createNodeFairnessCrypto()).not.toThrow();
  });
});

describe("temporary Node buffers are zeroed", () => {
  it("every digest and random buffer handed to the adapter is zero afterwards", () => {
    const c = createNodeFairnessCrypto();
    fault.captured.length = 0;
    const outputs = [
      c.hash.sha256(new Uint8Array([1, 2, 3])),
      c.hash.hmacSha256(new Uint8Array(32).fill(9))(new Uint8Array([4])),
      c.random.randomBytes(32),
    ];
    expect(fault.captured.length).toBe(3);
    for (const buffer of fault.captured) expect(buffer.every((b) => b === 0)).toBe(true);
    for (const out of outputs) expect(out.some((b) => b !== 0)).toBe(true);
  });
});
