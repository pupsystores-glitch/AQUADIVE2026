// Canonical encoding (P8-3a; D2): exact byte layout, field validation, and injectivity.
import { describe, expect, it } from "vitest";
import {
  DOMAIN_TAG,
  bytesEqual,
  bytesToHex,
  decodeBlockMessage,
  encodeBlockMessage,
  hexToBytes,
  type BlockMessageFields,
} from "./encoding.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "./vectors.ts";
import { FairnessError } from "./version.ts";

const chainId = hexToBytes(V.linksHex[0]);
const saltA = hexToBytes(V.saltAHex);
const base: BlockMessageFields = {
  fv: 1,
  chainId,
  chainIndex: 3,
  salt: saltA,
  purpose: "crash",
  counter: 0,
};
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FairnessError) return e.code;
    throw e;
  }
  return "no error";
};

describe("byte layout", () => {
  it("matches the independently generated vector", () => {
    expect(bytesToHex(encodeBlockMessage(base))).toBe(V.messageIndex3SaltACrash0Hex);
  });

  it("places every field at its documented offset", () => {
    const m = encodeBlockMessage({ ...base, chainIndex: 0x01020304, counter: 0xa1b2c3d4 });
    expect(m.length).toBe(63 + 32 + 5);
    expect(m[0]).toBe(17);
    expect(String.fromCharCode(...m.slice(1, 18))).toBe(DOMAIN_TAG);
    expect(m[18]).toBe(1); // fv
    expect(m[19]).toBe(1); // kind: stream block
    expect(m[20]).toBe(32);
    expect(bytesEqual(m.slice(21, 53), chainId)).toBe(true);
    expect(bytesToHex(m.slice(53, 57))).toBe("01020304"); // big-endian u32
    expect(m[57]).toBe(32);
    expect(bytesEqual(m.slice(58, 90), saltA)).toBe(true);
    expect(m[90]).toBe(5);
    expect(String.fromCharCode(...m.slice(91, 96))).toBe("crash");
    expect(bytesToHex(m.slice(96, 100))).toBe("a1b2c3d4");
  });

  it("total length is 63 + salt + purpose for the extreme field sizes", () => {
    const shortest = encodeBlockMessage({ ...base, salt: new Uint8Array(16), purpose: "a" });
    const longest = encodeBlockMessage({
      ...base,
      salt: new Uint8Array(64),
      purpose: "a".repeat(32),
    });
    expect(shortest.length).toBe(80);
    expect(longest.length).toBe(159);
  });

  it("round-trips through the strict decoder", () => {
    const d = decodeBlockMessage(encodeBlockMessage(base));
    expect(d.fv).toBe(1);
    expect(bytesEqual(d.chainId, chainId)).toBe(true);
    expect(d.chainIndex).toBe(3);
    expect(bytesEqual(d.salt, saltA)).toBe(true);
    expect(d.purpose).toBe("crash");
    expect(d.counter).toBe(0);
  });
});

describe("field validation and rejection", () => {
  it.each([
    ["fv 0", { fv: 0 }, "unsupported-version"],
    ["fv 2", { fv: 2 }, "unsupported-version"],
    ["fv as a string", { fv: "1" }, "unsupported-version"],
    ["chain id of 31 bytes", { chainId: new Uint8Array(31) }, "invalid-chain-id"],
    ["chain id of 33 bytes", { chainId: new Uint8Array(33) }, "invalid-chain-id"],
    ["chain id as an array", { chainId: Array.from(chainId) }, "invalid-chain-id"],
    ["chain index 0 (the terminating hash)", { chainIndex: 0 }, "invalid-chain-index"],
    ["chain index -1", { chainIndex: -1 }, "invalid-chain-index"],
    ["chain index 2^32", { chainIndex: 2 ** 32 }, "invalid-chain-index"],
    ["chain index 1.5", { chainIndex: 1.5 }, "invalid-chain-index"],
    ["chain index NaN", { chainIndex: Number.NaN }, "invalid-chain-index"],
    ["chain index as a bigint", { chainIndex: 3n }, "invalid-chain-index"],
    ["salt of 15 bytes", { salt: new Uint8Array(15) }, "invalid-salt"],
    ["salt of 65 bytes", { salt: new Uint8Array(65) }, "invalid-salt"],
    ["salt as a string", { salt: "salt-salt-salt-salt" }, "invalid-salt"],
    ["empty purpose", { purpose: "" }, "invalid-purpose"],
    ["purpose of 33 bytes", { purpose: "a".repeat(33) }, "invalid-purpose"],
    ["upper-case purpose", { purpose: "Crash" }, "invalid-purpose"],
    ["purpose with a separator", { purpose: "crash|0" }, "invalid-purpose"],
    ["purpose with a NUL", { purpose: "crash\u0000" }, "invalid-purpose"],
    ["non-ASCII purpose", { purpose: "crashé" }, "invalid-purpose"],
    ["purpose starting with a digit", { purpose: "1crash" }, "invalid-purpose"],
    ["counter -1", { counter: -1 }, "invalid-counter"],
    ["counter 2^32", { counter: 2 ** 32 }, "invalid-counter"],
    ["counter 0.5", { counter: 0.5 }, "invalid-counter"],
    ["counter Infinity", { counter: Number.POSITIVE_INFINITY }, "invalid-counter"],
  ])("rejects %s", (_n, patch, expected) => {
    expect(
      code(() => encodeBlockMessage({ ...base, ...(patch as object) } as BlockMessageFields)),
    ).toBe(expected);
  });

  it("accepts the u32 extremes", () => {
    expect(() =>
      encodeBlockMessage({ ...base, chainIndex: 0xffffffff, counter: 0xffffffff }),
    ).not.toThrow();
    expect(() => encodeBlockMessage({ ...base, chainIndex: 1, counter: 0 })).not.toThrow();
  });

  it("strict hex decoder rejects odd length, upper case and non-hex", () => {
    for (const bad of ["abc", "AB", "zz", "0x00", " 00"])
      expect(code(() => hexToBytes(bad))).toBe("invalid-hex");
    expect(bytesToHex(hexToBytes(""))).toBe("");
  });
});

describe("decoder rejects every byte string the encoder cannot produce", () => {
  const good = encodeBlockMessage(base);
  const mutate = (i: number, v: number) => {
    const m = Uint8Array.from(good);
    m[i] = v;
    return m;
  };
  it.each([
    ["truncated by one byte", good.slice(0, -1)],
    ["one trailing byte", new Uint8Array([...good, 0])],
    ["empty", new Uint8Array(0)],
    ["wrong tag length", mutate(0, 16)],
    ["wrong tag text", mutate(1, 0x61)],
    ["fv byte 2", mutate(18, 2)],
    ["unknown kind", mutate(19, 2)],
    ["chain id length 31", mutate(20, 31)],
    [
      "chain index 0",
      (() => {
        const m = Uint8Array.from(good);
        m.set([0, 0, 0, 0], 53);
        return m;
      })(),
    ],
    ["salt length 15", mutate(57, 15)],
    ["salt length 65", mutate(57, 65)],
    ["purpose length 0", mutate(90, 0)],
    ["purpose byte outside the pattern", mutate(91, 0x43)],
  ])("%s", (_n, bytes) => {
    expect(code(() => decodeBlockMessage(bytes as Uint8Array))).toBe("invalid-encoding");
  });
});

describe("injectivity (no encoding collisions)", () => {
  it("moving bytes between salt and purpose changes the encoding", () => {
    // Under naive concatenation salt‖purpose these two tuples would collide.
    const s16 = new Uint8Array(16).fill(0x61);
    const s17 = new Uint8Array(17).fill(0x61);
    const a = encodeBlockMessage({ ...base, salt: s17, purpose: "bc" });
    const b = encodeBlockMessage({ ...base, salt: s16, purpose: "abc" });
    expect(bytesEqual(a, b)).toBe(false);
  });

  it("an index/counter swap changes the encoding", () => {
    const a = encodeBlockMessage({ ...base, chainIndex: 1, counter: 2 });
    const b = encodeBlockMessage({ ...base, chainIndex: 2, counter: 1 });
    expect(bytesEqual(a, b)).toBe(false);
  });

  it("purpose prefixes do not collide (crash vs crash-1 with counter bytes)", () => {
    const a = encodeBlockMessage({ ...base, purpose: "crash", counter: 0x2d310000 });
    const b = encodeBlockMessage({ ...base, purpose: "crash-1", counter: 0 });
    expect(bytesEqual(a, b)).toBe(false);
  });

  it("distinct field tuples give distinct bytes, and decoding inverts encoding (seeded sweep)", () => {
    let s = 0x2545f491;
    const rnd = (n: number) => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) % n;
    };
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789-";
    const seen = new Map<string, string>();
    for (let i = 0; i < 4000; i++) {
      const saltLen = 16 + rnd(49);
      const salt = new Uint8Array(saltLen).map(() => rnd(3)); // tiny alphabet → many near-collisions
      let purpose = alphabet[rnd(26)];
      for (let j = rnd(4); j > 0; j--) purpose += alphabet[rnd(alphabet.length)];
      const fields = { fv: 1, chainId, chainIndex: 1 + rnd(4), salt, purpose, counter: rnd(4) };
      const key = JSON.stringify([fields.chainIndex, Array.from(salt), purpose, fields.counter]);
      const hex = bytesToHex(encodeBlockMessage(fields));
      const prior = seen.get(hex);
      if (prior !== undefined) expect(prior).toBe(key);
      seen.set(hex, key);
      const back = decodeBlockMessage(hexToBytes(hex));
      expect(
        JSON.stringify([back.chainIndex, Array.from(back.salt), back.purpose, back.counter]),
      ).toBe(key);
    }
  });
});
