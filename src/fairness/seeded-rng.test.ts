// Purpose-separated streams (P8-3a): draw vectors, exact [0, 1) values, boundaries and hard limits.
import { describe, expect, it } from "vitest";
import { RoundDerivation, type RoundDerivationInput } from "./derive.ts";
import { hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { SeededStream, top52, unitFromBlock } from "./seeded-rng.ts";
import { nodeHashProvider as p } from "./test/node-provider.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V, UNIT_BOUNDARY_VECTORS_V1 } from "./vectors.ts";
import {
  FAIRNESS_PURPOSES,
  FairnessError,
  PURPOSE_DRAW_LIMITS_V1,
  type FairnessPurpose,
} from "./version.ts";

const input = (): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: 3,
  salt: hexToBytes(V.saltAHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[3])),
});
const open = (purpose: FairnessPurpose) => RoundDerivation.create(p, input()).openStream(purpose);
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FairnessError) return e.code;
    throw e;
  }
  return "no error";
};

describe("draw vectors", () => {
  it.each([
    ["crash", V.drawsIndex3SaltA.crash],
    ["jackpot", V.drawsIndex3SaltA.jackpot],
    ["chests", V.drawsIndex3SaltA.chests],
    ["world", V.drawsIndex3SaltA.worldFirst8],
  ] as const)("%s", (purpose, expected) => {
    const s = open(purpose);
    for (const d of expected) {
      const v = s.next();
      expect(v).toBe(d.value);
      expect(v * 2 ** 52).toBe(d.u52);
    }
  });

  it("draw k is word k mod 4 of block floor(k / 4)", () => {
    const d = RoundDerivation.create(p, input());
    const s = d.openStream("world");
    const b0 = d.block("world", 0);
    const b1 = d.block("world", 1);
    for (let k = 0; k < 8; k++) expect(s.next()).toBe(unitFromBlock(k < 4 ? b0 : b1, k % 4));
  });
});

describe("exact uniform values in [0, 1)", () => {
  it.each(UNIT_BOUNDARY_VECTORS_V1)("$name", ({ word0Hex, u52, value }) => {
    const block = new Uint8Array(32);
    block.set(hexToBytes(word0Hex));
    expect(top52(block, 0)).toBe(u52);
    expect(unitFromBlock(block, 0)).toBe(value);
  });

  it("the largest value is 1 - 2^-52, strictly below 1", () => {
    const max = unitFromBlock(new Uint8Array(32).fill(0xff), 3);
    expect(max).toBe(1 - 2 ** -52);
    expect(max < 1).toBe(true);
  });

  it("reads each of the four words independently", () => {
    const block = new Uint8Array(32);
    for (let w = 0; w < 4; w++) block[w * 8] = 0x10 * (w + 1);
    expect([0, 1, 2, 3].map((w) => unitFromBlock(block, w))).toEqual([0.0625, 0.125, 0.1875, 0.25]);
  });

  it("every value of a full world stream is an exact multiple of 2^-52 in [0, 1)", () => {
    const s = open("world");
    for (let k = 0; k < PURPOSE_DRAW_LIMITS_V1.world; k++) {
      const v = s.next();
      expect(v >= 0 && v < 1).toBe(true);
      expect(Number.isInteger(v * 2 ** 52)).toBe(true);
    }
  });

  it("rejects malformed block or word arguments", () => {
    expect(code(() => top52(new Uint8Array(31), 0))).toBe("invalid-bytes");
    expect(code(() => top52(new Uint8Array(32), 4))).toBe("invalid-counter");
    expect(code(() => top52(new Uint8Array(32), -1))).toBe("invalid-counter");
  });
});

describe("hard draw limits", () => {
  it.each(FAIRNESS_PURPOSES)("%s stops exactly at its limit and stays exhausted", (purpose) => {
    const s = open(purpose);
    const limit = PURPOSE_DRAW_LIMITS_V1[purpose];
    for (let k = 0; k < limit; k++) s.next();
    expect(s.drawsUsed).toBe(limit);
    expect(s.remaining).toBe(0);
    expect(code(() => s.next())).toBe("draw-limit-exceeded");
    expect(code(() => s.next())).toBe("draw-limit-exceeded");
    expect(s.drawsUsed).toBe(limit);
  });

  it("the fv=1 limits are the documented values", () => {
    expect(PURPOSE_DRAW_LIMITS_V1).toEqual({ crash: 2, jackpot: 2, chests: 6, world: 2048 });
  });

  it("a stream refuses a non-positive limit or a missing source", () => {
    expect(code(() => new SeededStream("crash", 0, () => new Uint8Array(32)))).toBe(
      "invalid-counter",
    );
    expect(code(() => new SeededStream("crash", 1.5, () => new Uint8Array(32)))).toBe(
      "invalid-counter",
    );
    expect(code(() => new SeededStream("crash", 2, null as never))).toBe("crypto-provider-failed");
  });
});

describe("purpose independence and determinism", () => {
  it("draws on one purpose never shift another purpose's values", () => {
    const a = RoundDerivation.create(p, input());
    const crashA = a.openStream("crash");
    crashA.next(); // one crash draw (the 3 % branch)
    const jackpotA = [a.openStream("jackpot").next()];

    const b = RoundDerivation.create(p, input());
    const crashB = b.openStream("crash");
    crashB.next();
    crashB.next(); // two crash draws
    const jackpotB = [b.openStream("jackpot").next()];

    expect(jackpotA).toEqual(jackpotB);
    expect(jackpotA[0]).toBe(V.drawsIndex3SaltA.jackpot[0].value);
  });

  it("two contexts from identical inputs produce identical full streams", () => {
    for (const purpose of FAIRNESS_PURPOSES) {
      const x = open(purpose);
      const y = open(purpose);
      for (let k = 0; k < PURPOSE_DRAW_LIMITS_V1[purpose]; k++) expect(x.next()).toBe(y.next());
    }
  });

  it("matches the engine Rng shape: next() returns a number (structural, no engine import)", () => {
    const s = open("crash");
    expect(typeof s.next).toBe("function");
    expect(typeof s.next()).toBe("number");
  });

  it("serializes only public bookkeeping", () => {
    const s = open("chests");
    s.next();
    expect(JSON.stringify(s)).toBe('{"purpose":"chests","drawsUsed":1,"drawLimit":6}');
  });
});
