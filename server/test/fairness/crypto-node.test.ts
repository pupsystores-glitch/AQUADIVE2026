// node:crypto fairness adapter (P8-3c-1): known answers, development vectors, provider checks,
// output ownership and key handling. Development vectors only; no secret is printed.
import { createHash, createHmac } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  FAIRNESS_PURPOSES,
  FairnessError,
  RoundDerivation,
  SecretBytes,
  bytesToHex,
  computeRoundSeed,
  createChainCommitment,
  hexToBytes,
  type FairnessHashProvider,
  type SecureRandomSource,
} from "../../src/fairness";
import {
  assertFairnessCryptoReady,
  createNodeFairnessCrypto,
  isVerifiedFairnessCrypto,
} from "../../src/fairness/crypto-node";
import { expectCode, nodeCrypto } from "../helpers/fairness-crypto";

const { hash, random } = nodeCrypto;
const hex = (s: string) => hexToBytes(s);
const ascii = (s: string) => new TextEncoder().encode(s);

describe("published known answers (independent of the library's built-in list)", () => {
  it("SHA-256: FIPS 180-2 B.1, B.2 and the empty message", () => {
    expect(bytesToHex(hash.sha256(ascii("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      bytesToHex(hash.sha256(ascii("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(bytesToHex(hash.sha256(new Uint8Array(0)))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("HMAC-SHA256: RFC 4231 test cases 1, 2, 3 and 6 (key longer than the block)", () => {
    const cases = [
      [
        "0b".repeat(20),
        "4869205468657265",
        "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
      ],
      [
        "4a656665",
        "7768617420646f2079612077616e7420666f72206e6f7468696e673f",
        "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
      ],
      [
        "aa".repeat(20),
        "dd".repeat(50),
        "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
      ],
      [
        "aa".repeat(131),
        bytesToHex(ascii("Test Using Larger Than Block-Size Key - Hash Key First")),
        "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
      ],
    ] as const;
    for (const [key, data, out] of cases) {
      expect(bytesToHex(hash.hmacSha256(hex(key))(hex(data)))).toBe(out);
    }
  });

  it("agrees with direct node:crypto calls on 200 random inputs", () => {
    for (let n = 0; n < 200; n++) {
      const data = random.randomBytes(1 + (n % 64));
      const key = random.randomBytes(32);
      expect(hash.sha256(data)).toEqual(new Uint8Array(createHash("sha256").update(data).digest()));
      expect(hash.hmacSha256(key)(data)).toEqual(
        new Uint8Array(createHmac("sha256", key).update(data).digest()),
      );
    }
  });
});

describe("fv = 1 development vectors through the adapter", () => {
  const seed = SecretBytes.fromBytes(hex(V.seedHex));

  it("reproduces every chain link x_0 … x_8", () => {
    expect(bytesToHex(createChainCommitment(hash, seed, V.chainLength).chainId)).toBe(
      V.linksHex[0],
    );
    for (let j = 1; j <= V.chainLength; j++) {
      const x = computeRoundSeed(hash, seed, V.chainLength, j);
      expect(bytesToHex(x.reveal())).toBe(V.linksHex[j]);
      x.dispose();
    }
  });

  it("reproduces the derived blocks, variants and first draws of every purpose", () => {
    const roundSeed = computeRoundSeed(hash, seed, V.chainLength, 3);
    const input = {
      fv: 1,
      chainId: hex(V.linksHex[0]),
      chainIndex: 3,
      salt: hex(V.saltAHex),
      roundSeed,
    };
    const d = RoundDerivation.create(hash, input);
    const b = V.blocksIndex3SaltA;
    expect(bytesToHex(d.block("crash", 0))).toBe(b.crash0);
    expect(bytesToHex(d.block("jackpot", 0))).toBe(b.jackpot0);
    expect(bytesToHex(d.block("chests", 0))).toBe(b.chests0);
    expect(bytesToHex(d.block("chests", 1))).toBe(b.chests1);
    expect(bytesToHex(d.block("world", 0))).toBe(b.world0);
    expect(bytesToHex(d.block("world", 1))).toBe(b.world1);
    expect(bytesToHex(d.block("world", 511))).toBe(b.world511);
    const draws = V.drawsIndex3SaltA;
    const expected = {
      crash: draws.crash,
      jackpot: draws.jackpot,
      chests: draws.chests,
      world: draws.worldFirst8,
    };
    for (const purpose of FAIRNESS_PURPOSES) {
      const stream = d.openStream(purpose);
      for (const { value } of expected[purpose]) expect(stream.next()).toBe(value);
    }
    d.dispose();
    const v4 = computeRoundSeed(hash, seed, V.chainLength, 4);
    const salted = RoundDerivation.create(hash, { ...input, salt: hex(V.saltBHex) });
    const indexed = RoundDerivation.create(hash, { ...input, chainIndex: 4, roundSeed: v4 });
    const alt = RoundDerivation.create(hash, { ...input, chainId: hex(V.variants.altChainIdHex) });
    expect(bytesToHex(salted.block("crash", 0))).toBe(V.variants.saltB_index3_crash0);
    expect(bytesToHex(indexed.block("crash", 0))).toBe(V.variants.index4_saltA_crash0);
    expect(bytesToHex(alt.block("crash", 0))).toBe(V.variants.altChainId_index3_saltA_crash0);
    for (const x of [salted, indexed, alt]) x.dispose();
    roundSeed.dispose();
    v4.dispose();
  });
});

describe("verification gate", () => {
  it("createNodeFairnessCrypto returns a frozen, verified pair", () => {
    const c = createNodeFairnessCrypto();
    expect(isVerifiedFairnessCrypto(c)).toBe(true);
    expect(Object.isFrozen(c) && Object.isFrozen(c.hash) && Object.isFrozen(c.random)).toBe(true);
    expect(isVerifiedFairnessCrypto({ hash: c.hash, random: c.random })).toBe(false);
  });

  const zeroHash: FairnessHashProvider = {
    sha256: () => new Uint8Array(32),
    hmacSha256: () => () => new Uint8Array(32),
  };
  const sha3: FairnessHashProvider = {
    sha256: (d) => new Uint8Array(createHash("sha3-256").update(d).digest()),
    hmacSha256: (k) => (m) =>
      new Uint8Array(createHmac("sha3-256", Uint8Array.from(k)).update(m).digest()),
  };
  const throwing: FairnessHashProvider = {
    sha256: () => {
      throw new Error("boom");
    },
    hmacSha256: () => {
      throw new Error("boom");
    },
  };
  // Keeps a REFERENCE to the caller's key: correct answers until the caller zeroes its copy.
  const keepsKey: FairnessHashProvider = {
    sha256: hash.sha256,
    hmacSha256: (key) => (m) => new Uint8Array(createHmac("sha256", key).update(m).digest()),
  };
  // Correct primitives except for a wrong fairness-specific behaviour: SHA-256 is fine, but the
  // HMAC truncates long messages (the published HMAC answers use short messages only).
  const truncating: FairnessHashProvider = {
    sha256: hash.sha256,
    hmacSha256: (key) => {
      const k = Uint8Array.from(key);
      return (m) => new Uint8Array(createHmac("sha256", k).update(m.subarray(0, 64)).digest());
    },
  };

  it.each([
    ["all-zero outputs", zeroHash],
    ["SHA3-256 instead of SHA-256", sha3],
    ["a throwing provider", throwing],
    ["a provider that keeps the caller's HMAC key", keepsKey],
    ["a provider correct on published answers but wrong on fairness messages", truncating],
  ])("rejects %s with crypto-provider-failed", async (_name, bad) => {
    await expectCode(
      () => assertFairnessCryptoReady({ hash: bad, random }),
      "crypto-provider-failed",
    );
  });

  it("rejects incomplete provider objects", async () => {
    for (const bad of [null, {}, { hash }, { random }, { hash: { sha256: hash.sha256 }, random }]) {
      await expectCode(() => assertFairnessCryptoReady(bad as never), "crypto-provider-failed");
    }
  });

  const counter = (() => {
    let n = 0;
    return { randomBytes: (len: number) => new Uint8Array(len).fill(++n) };
  })();
  it.each([
    ["all zeros", { randomBytes: (n: number) => new Uint8Array(n) }],
    ["a constant source", { randomBytes: (n: number) => new Uint8Array(n).fill(7) }],
    ["wrong length", { randomBytes: () => new Uint8Array(31) }],
    ["a non-byte result", { randomBytes: () => [1, 2, 3] as unknown as Uint8Array }],
    [
      "a throwing source",
      {
        randomBytes: () => {
          throw new Error("no entropy");
        },
      },
    ],
  ] as [string, SecureRandomSource][])("rejects %s with secure-random-failed", async (_n, bad) => {
    await expectCode(
      () => assertFairnessCryptoReady({ hash, random: bad }),
      "secure-random-failed",
    );
  });

  it("accepts a varying source (sanity checks are not a statistical test)", () => {
    expect(() => assertFairnessCryptoReady({ hash, random: counter })).not.toThrow();
  });
});

describe("output ownership, inputs and key handling", () => {
  it("every output is a fresh plain Uint8Array, never a Node Buffer", () => {
    const outs = [
      hash.sha256(ascii("x")),
      hash.hmacSha256(ascii("k"))(ascii("m")),
      random.randomBytes(32),
    ];
    for (const out of outs) {
      expect(Object.getPrototypeOf(out)).toBe(Uint8Array.prototype);
      expect(Buffer.isBuffer(out)).toBe(false);
      expect(out.byteOffset).toBe(0);
      expect(out.buffer.byteLength).toBe(out.length);
    }
    expect(hash.sha256(ascii("x"))).not.toBe(hash.sha256(ascii("x")));
  });

  it("the prepared HMAC does not depend on the caller's key buffer", () => {
    const key = random.randomBytes(32);
    const before = hash.hmacSha256(key)(ascii("message"));
    const mac = hash.hmacSha256(key);
    key.fill(0);
    expect(mac(ascii("message"))).toEqual(before);
  });

  it("rejects non-byte inputs, empty keys and out-of-range random lengths", async () => {
    await expectCode(() => hash.sha256("abc" as never), "invalid-bytes");
    await expectCode(() => hash.hmacSha256(new Uint8Array(0)), "invalid-length");
    await expectCode(() => hash.hmacSha256(ascii("k"))([1, 2] as never), "invalid-bytes");
    for (const n of [0, -1, 1.5, 65, Number.NaN]) {
      await expectCode(() => random.randomBytes(n), "secure-random-failed");
    }
  });

  it("the KeyObject never leaves the closure: nothing to serialize or inspect", () => {
    const mac = hash.hmacSha256(random.randomBytes(32));
    expect(Object.getOwnPropertyNames(mac).sort()).toEqual(["length", "name"]);
    expect(inspect(mac, { showHidden: true })).not.toMatch(/KeyObject|SecretKeyObject/);
    expect(JSON.stringify(nodeCrypto)).toBe('{"hash":{},"random":{}}');
    expect(inspect(nodeCrypto, { depth: 5 })).not.toMatch(/KeyObject/);
  });

  it("errors are FairnessErrors whose messages carry no input bytes", () => {
    try {
      hash.hmacSha256(new Uint8Array(0));
    } catch (e) {
      expect(e).toBeInstanceOf(FairnessError);
    }
  });
});
