// Domain-separated derivation (P8-3a; D2): every input changes the output, and invalid input fails.
import { describe, expect, it } from "vitest";
import {
  RoundDerivation,
  deriveBlock,
  maxBlockCounter,
  type RoundDerivationInput,
} from "./derive.ts";
import { bytesToHex, encodeBlockMessage, hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { nodeHashProvider as p } from "./test/node-provider.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "./vectors.ts";
import { FairnessError, PURPOSE_DRAW_LIMITS_V1 } from "./version.ts";

const input = (patch: Partial<RoundDerivationInput> = {}): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: 3,
  salt: hexToBytes(V.saltAHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[3])),
  ...patch,
});
const block = (patch: Partial<RoundDerivationInput> = {}, purpose = "crash", counter = 0) =>
  bytesToHex(deriveBlock(p, input(patch), purpose, counter));
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FairnessError) return e.code;
    throw e;
  }
  return "no error";
};

describe("block vectors", () => {
  it.each(Object.entries(V.blocksIndex3SaltA))("%s", (name, expected) => {
    const purpose = name.replace(/\d+$/, "");
    const counter = Number(name.slice(purpose.length));
    expect(block({}, purpose, counter)).toBe(expected);
  });

  it("is HMAC-SHA256(x_j, canonical message) exactly", () => {
    const msg = encodeBlockMessage({
      fv: 1,
      chainId: input().chainId,
      chainIndex: 3,
      salt: input().salt,
      purpose: "crash",
      counter: 0,
    });
    expect(bytesToHex(p.hmacSha256(hexToBytes(V.linksHex[3]))(msg))).toBe(
      V.blocksIndex3SaltA.crash0,
    );
  });
});

describe("every derivation input separates the output", () => {
  const reference = V.blocksIndex3SaltA.crash0;

  it("changed salt", () => {
    expect(block({ salt: hexToBytes(V.saltBHex) })).toBe(V.variants.saltB_index3_crash0);
    expect(V.variants.saltB_index3_crash0).not.toBe(reference);
  });

  it("changed chain index (with that index's seed)", () => {
    const b = block({ chainIndex: 4, roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[4])) });
    expect(b).toBe(V.variants.index4_saltA_crash0);
    expect(b).not.toBe(reference);
  });

  it("changed chain index alone (same seed)", () => {
    expect(block({ chainIndex: 4 })).not.toBe(reference);
  });

  it("changed chain identifier", () => {
    const b = block({ chainId: hexToBytes(V.variants.altChainIdHex) });
    expect(b).toBe(V.variants.altChainId_index3_saltA_crash0);
    expect(b).not.toBe(reference);
  });

  it("changed purpose", () => {
    const outs = ["crash", "jackpot", "chests", "world"].map((purpose) => block({}, purpose, 0));
    expect(new Set(outs).size).toBe(4);
  });

  it("changed block counter", () => {
    expect(block({}, "chests", 1)).toBe(V.blocksIndex3SaltA.chests1);
    expect(V.blocksIndex3SaltA.chests1).not.toBe(V.blocksIndex3SaltA.chests0);
  });

  it("changed round seed (key)", () => {
    expect(block({ roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[2])) })).not.toBe(
      reference,
    );
  });

  it("changed fairness version byte: the version is inside the MAC input", () => {
    const msg = encodeBlockMessage({
      fv: 1,
      chainId: input().chainId,
      chainIndex: 3,
      salt: input().salt,
      purpose: "crash",
      counter: 0,
    });
    const fv2 = Uint8Array.from(msg);
    fv2[18] = 2;
    const mac = p.hmacSha256(hexToBytes(V.linksHex[3]));
    expect(bytesToHex(mac(fv2))).not.toBe(bytesToHex(mac(msg)));
  });

  it("an unsupported fairness version is rejected, not derived", () => {
    for (const fv of [0, 2, 255, "1", undefined]) {
      expect(code(() => RoundDerivation.create(p, input({ fv: fv as number })))).toBe(
        "unsupported-version",
      );
    }
  });
});

describe("input validation", () => {
  it.each([
    ["31-byte chain id", { chainId: new Uint8Array(31) }, "invalid-chain-id"],
    ["chain index 0", { chainIndex: 0 }, "invalid-chain-index"],
    ["chain index 2^32", { chainIndex: 2 ** 32 }, "invalid-chain-index"],
    ["short salt", { salt: new Uint8Array(8) }, "invalid-salt"],
    ["oversized salt", { salt: new Uint8Array(65) }, "invalid-salt"],
    ["raw-byte seed", { roundSeed: new Uint8Array(32) as unknown as SecretBytes }, "invalid-bytes"],
    [
      "16-byte seed",
      { roundSeed: SecretBytes.fromBytes(new Uint8Array(16).fill(1)) },
      "invalid-bytes",
    ],
    [
      "the terminating hash as a seed",
      { roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[0])) },
      "invalid-chain-index",
    ],
  ])("rejects %s", (_n, patch, expected) => {
    expect(
      code(() => RoundDerivation.create(p, input(patch as Partial<RoundDerivationInput>))),
    ).toBe(expected);
  });

  it("rejects a missing input object", () => {
    expect(code(() => RoundDerivation.create(p, undefined as never))).toBe("unsupported-version");
  });

  it("rejects unregistered and malformed purposes", () => {
    const d = RoundDerivation.create(p, input());
    expect(code(() => d.block("bonus", 0))).toBe("unknown-purpose");
    expect(code(() => d.block("__proto__", 0))).toBe("invalid-purpose");
    expect(code(() => d.block("toString", 0))).toBe("invalid-purpose");
    expect(code(() => d.block("constructor", 0))).toBe("unknown-purpose");
    expect(code(() => d.openStream("Crash"))).toBe("invalid-purpose");
  });

  it("copies its inputs: mutating the caller's buffers later changes nothing", () => {
    const i = input();
    const d = RoundDerivation.create(p, i);
    i.salt.fill(0);
    i.chainId.fill(0);
    expect(bytesToHex(d.block("crash", 0))).toBe(V.blocksIndex3SaltA.crash0);
  });

  it("disposing the round seed after create does not change derived blocks (key prepared once)", () => {
    const i = input();
    const d = RoundDerivation.create(p, i);
    i.roundSeed.dispose();
    expect(bytesToHex(d.block("crash", 0))).toBe(V.blocksIndex3SaltA.crash0);
    expect(code(() => RoundDerivation.create(p, i))).toBe("secret-disposed");
  });
});

describe("counter limits", () => {
  it("block counters stop at the purpose's draw limit", () => {
    for (const [purpose, limit] of Object.entries(PURPOSE_DRAW_LIMITS_V1)) {
      const max = maxBlockCounter(1, purpose);
      expect(max).toBe(Math.ceil(limit / 4) - 1);
      const d = RoundDerivation.create(p, input());
      expect(() => d.block(purpose, max)).not.toThrow();
      expect(code(() => d.block(purpose, max + 1))).toBe("draw-limit-exceeded");
    }
  });

  it("the world block at the last allowed counter matches the vector", () => {
    expect(block({}, "world", 511)).toBe(V.blocksIndex3SaltA.world511);
  });

  it("rejects invalid counters before the limit check", () => {
    const d = RoundDerivation.create(p, input());
    for (const c of [-1, 0.5, 2 ** 32, Number.NaN])
      expect(code(() => d.block("world", c))).toBe("invalid-counter");
  });
});

describe("streams per context", () => {
  it("each purpose opens once", () => {
    const d = RoundDerivation.create(p, input());
    d.openStream("crash");
    expect(code(() => d.openStream("crash"))).toBe("purpose-already-open");
    expect(() => d.openStream("jackpot")).not.toThrow();
  });

  it("serializes only public fields", () => {
    const d = RoundDerivation.create(p, input());
    expect(JSON.stringify(d)).toBe('{"fv":1,"chainIndex":3}');
    expect(Object.keys(d).sort()).toEqual(["chainIndex", "fv"]);
  });
});
