// Secret lifecycle hardening (P8-3b-0, owner decision D-B2; requirements R1 – R4 of docs/09 §38.1).
// R1 revealed HMAC key copies are zeroed in `finally`; R2 RoundDerivation.dispose(); R3
// SeededStream.dispose(); R4 superseded chain links are zeroed. Derived values never change.
// These tests observe buffers the module hands out or allocates; they show best-effort zeroing,
// not guaranteed erasure (JavaScript gives none).
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeRoundSeed, createChainCommitment, verifySeedAgainstCommitment } from "./chain.ts";
import { keyedHmac, type FairnessHashProvider } from "./crypto.ts";
import { RoundDerivation, deriveBlock, type RoundDerivationInput } from "./derive.ts";
import { bytesToHex, hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { SeededStream } from "./seeded-rng.ts";
import { nodeHashProvider as p } from "./test/node-provider.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "./vectors.ts";
import { FAIRNESS_PURPOSES, FairnessError } from "./version.ts";

const isZero = (b: Uint8Array) => b.every((x) => x === 0);
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FairnessError) return e.code;
    throw e;
  }
  return "no error";
};
const input = (): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: 3,
  salt: hexToBytes(V.saltAHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[3])),
});

/** A node:crypto provider that records every buffer it receives as a key and every tag it returns. */
function recordingProvider() {
  const keys: Uint8Array[] = [];
  const tags: Uint8Array[] = [];
  const digests: Uint8Array[] = [];
  const provider: FairnessHashProvider = {
    sha256: (data) => {
      const out = p.sha256(data);
      digests.push(out);
      return out;
    },
    hmacSha256: (key) => {
      keys.push(key);
      const mac = p.hmacSha256(key);
      return (message) => {
        const tag = mac(message);
        tags.push(tag);
        return tag;
      };
    },
  };
  return { provider, keys, tags, digests };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R1 — revealed HMAC key copies are zeroed in finally", () => {
  it("the provider's key copy is zeroed once keyedHmac returns; tags are unchanged", () => {
    const r = recordingProvider();
    const key = SecretBytes.fromBytes(hexToBytes(V.linksHex[3]));
    const mac = keyedHmac(r.provider, key);
    expect(r.keys).toHaveLength(1);
    expect(isZero(r.keys[0])).toBe(true);
    const msg = new Uint8Array([1, 2, 3]);
    expect(bytesToHex(mac(msg))).toBe(bytesToHex(keyedHmac(p, key)(msg)));
    expect(bytesToHex(key.reveal())).toBe(V.linksHex[3]);
  });

  it("the copy is zeroed even when the provider throws, and the error propagates", () => {
    let received: Uint8Array | null = null;
    const throwing: FairnessHashProvider = {
      sha256: p.sha256,
      hmacSha256: (k) => {
        received = k;
        throw new Error("provider failure");
      },
    };
    expect(() =>
      keyedHmac(throwing, SecretBytes.fromBytes(new Uint8Array(32).fill(7))),
    ).toThrowError("provider failure");
    expect(received).not.toBeNull();
    expect(isZero(received as unknown as Uint8Array)).toBe(true);
  });

  it("RoundDerivation.create leaves no revealed seed copy un-zeroed (probe and key copy)", () => {
    const copies: Uint8Array[] = [];
    const original = SecretBytes.prototype.reveal;
    vi.spyOn(SecretBytes.prototype, "reveal").mockImplementation(function (this: SecretBytes) {
      const out = original.call(this);
      copies.push(out);
      return out;
    });
    const d = RoundDerivation.create(p, input());
    expect(copies.length).toBeGreaterThanOrEqual(2);
    for (const c of copies) expect(isZero(c)).toBe(true);
    vi.restoreAllMocks();
    expect(bytesToHex(d.block("crash", 0))).toBe(V.blocksIndex3SaltA.crash0);
  });

  it("the provider contract matters: a provider that keeps the caller's buffer sees a zeroed key", () => {
    // Documents why FairnessHashProvider.hmacSha256 must copy a key it keeps (crypto.ts).
    let kept: Uint8Array | null = null;
    const nonCopying: FairnessHashProvider = {
      sha256: p.sha256,
      hmacSha256: (k) => {
        kept = k;
        return (m) => p.hmacSha256(kept as unknown as Uint8Array)(m);
      },
    };
    keyedHmac(nonCopying, SecretBytes.fromBytes(new Uint8Array(32).fill(5)));
    expect(isZero(kept as unknown as Uint8Array)).toBe(true);
  });
});

describe("R2 — RoundDerivation.dispose()", () => {
  it("is idempotent and reports disposal", () => {
    const d = RoundDerivation.create(p, input());
    expect(d.disposed).toBe(false);
    d.dispose();
    expect(d.disposed).toBe(true);
    expect(() => d.dispose()).not.toThrow();
    expect(d.disposed).toBe(true);
  });

  it("every secret-material operation afterwards throws secret-disposed", () => {
    const d = RoundDerivation.create(p, input());
    const open = d.openStream("world");
    open.next();
    d.dispose();
    expect(code(() => d.block("crash", 0))).toBe("secret-disposed");
    for (const purpose of FAIRNESS_PURPOSES) {
      expect(code(() => d.openStream(purpose))).toBe("secret-disposed");
    }
    expect(code(() => open.next())).toBe("secret-disposed");
    // Disposal wins over every other error: invalid arguments still report secret-disposed.
    expect(code(() => d.block("nope", -1))).toBe("secret-disposed");
  });

  it("public fields and serialization survive disposal", () => {
    const d = RoundDerivation.create(p, input());
    d.dispose();
    expect(d.fv).toBe(1);
    expect(d.chainIndex).toBe(3);
    expect(JSON.stringify(d)).toBe('{"fv":1,"chainIndex":3}');
  });

  it("disposes the streams it opened and zeroes their cached blocks", () => {
    const r = recordingProvider();
    const d = RoundDerivation.create(r.provider, input());
    const streams = FAIRNESS_PURPOSES.map((purpose) => d.openStream(purpose));
    for (const s of streams) s.next();
    expect(r.tags).toHaveLength(4);
    expect(r.tags.some((t) => !isZero(t))).toBe(true);
    d.dispose();
    for (const t of r.tags) expect(isZero(t)).toBe(true);
    for (const s of streams) expect(s.disposed).toBe(true);
  });

  it("zeroes the context's own copies of the chain id and salt", () => {
    const copies: Uint8Array[] = [];
    const from = Uint8Array.from.bind(Uint8Array);
    vi.spyOn(Uint8Array, "from").mockImplementation(((src: ArrayLike<number>) => {
      const out = from(src);
      copies.push(out);
      return out;
    }) as typeof Uint8Array.from);
    const caller = input();
    const d = RoundDerivation.create(p, caller);
    vi.restoreAllMocks();
    const chainIdCopy = copies.find((c) => bytesToHex(c) === V.linksHex[0]);
    const saltCopy = copies.find((c) => bytesToHex(c) === V.saltAHex);
    expect(chainIdCopy).toBeDefined();
    expect(saltCopy).toBeDefined();
    d.dispose();
    expect(isZero(chainIdCopy as Uint8Array)).toBe(true);
    expect(isZero(saltCopy as Uint8Array)).toBe(true);
    // The caller's buffers are never touched.
    expect(bytesToHex(caller.chainId)).toBe(V.linksHex[0]);
    expect(bytesToHex(caller.salt)).toBe(V.saltAHex);
  });

  it("does not consume the caller's round seed", () => {
    const caller = input();
    RoundDerivation.create(p, caller).dispose();
    expect(bytesToHex(caller.roundSeed.reveal())).toBe(V.linksHex[3]);
  });

  it("deriveBlock disposes its temporary context and still matches the vectors", () => {
    const spy = vi.spyOn(RoundDerivation.prototype, "dispose");
    expect(bytesToHex(deriveBlock(p, input(), "world", 511))).toBe(V.blocksIndex3SaltA.world511);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a fresh context from the same inputs is unaffected by disposing another", () => {
    const a = RoundDerivation.create(p, input());
    const b = RoundDerivation.create(p, input());
    a.dispose();
    expect(bytesToHex(b.block("jackpot", 0))).toBe(V.blocksIndex3SaltA.jackpot0);
  });
});

describe("R3 — SeededStream.dispose()", () => {
  const source = () => {
    const blocks: Uint8Array[] = [];
    const fn = (counter: number) => {
      const b = new Uint8Array(32).fill(counter + 1);
      blocks.push(b);
      return b;
    };
    return { blocks, fn };
  };

  it("zeroes the cached block, is idempotent, and later draws throw secret-disposed", () => {
    const src = source();
    const s = new SeededStream("crash", 2, src.fn);
    s.next();
    expect(isZero(src.blocks[0])).toBe(false);
    s.dispose();
    expect(isZero(src.blocks[0])).toBe(true);
    expect(s.disposed).toBe(true);
    expect(() => s.dispose()).not.toThrow();
    expect(code(() => s.next())).toBe("secret-disposed");
    expect(code(() => s.next())).toBe("secret-disposed");
    expect(src.blocks).toHaveLength(1);
  });

  it("disposal takes precedence over exhaustion and keeps the bookkeeping", () => {
    const s = new SeededStream("crash", 2, source().fn);
    s.next();
    s.next();
    expect(code(() => s.next())).toBe("draw-limit-exceeded");
    s.dispose();
    expect(code(() => s.next())).toBe("secret-disposed");
    expect(s.drawsUsed).toBe(2);
    expect(s.remaining).toBe(0);
  });

  it("disposing one purpose's stream leaves the context and other purposes intact", () => {
    const d = RoundDerivation.create(p, input());
    const crash = d.openStream("crash");
    crash.dispose();
    expect(code(() => crash.next())).toBe("secret-disposed");
    expect(d.disposed).toBe(false);
    expect(code(() => d.openStream("crash"))).toBe("purpose-already-open");
    const jackpot = d.openStream("jackpot");
    expect(jackpot.next()).toBe(V.drawsIndex3SaltA.jackpot[0].value);
  });
});

describe("R4 — superseded chain links are zeroed", () => {
  it("createChainCommitment zeroes every intermediate link and returns the right chain id", () => {
    const r = recordingProvider();
    const c = createChainCommitment(
      r.provider,
      SecretBytes.fromBytes(hexToBytes(V.seedHex)),
      V.chainLength,
    );
    expect(r.digests).toHaveLength(V.chainLength);
    expect(bytesToHex(c.chainId)).toBe(V.linksHex[0]);
    for (const d of r.digests.slice(0, -1)) expect(isZero(d)).toBe(true);
    expect(r.digests.at(-1)).toBe(c.chainId);
  });

  it("computeRoundSeed zeroes every link it computed, and the wrapped seed is still x_j", () => {
    const r = recordingProvider();
    for (let j = 1; j <= V.chainLength; j++) {
      r.digests.length = 0;
      const sj = computeRoundSeed(
        r.provider,
        SecretBytes.fromBytes(hexToBytes(V.seedHex)),
        V.chainLength,
        j,
      );
      expect(r.digests).toHaveLength(V.chainLength - j);
      for (const d of r.digests) expect(isZero(d)).toBe(true);
      expect(bytesToHex(sj.reveal())).toBe(V.linksHex[j]);
    }
  });

  it("verification never modifies the caller's revealed seed", () => {
    const commitment = createChainCommitment(
      p,
      SecretBytes.fromBytes(hexToBytes(V.seedHex)),
      V.chainLength,
    );
    const seed = hexToBytes(V.linksHex[5]);
    expect(verifySeedAgainstCommitment(p, commitment, { index: 5, seed })).toEqual({ ok: true });
    expect(bytesToHex(seed)).toBe(V.linksHex[5]);
  });

  it("a provider that reuses one output buffer still yields the correct links", () => {
    const shared = new Uint8Array(32);
    const inPlace: FairnessHashProvider = {
      sha256: (data) => {
        shared.set(p.sha256(data));
        return shared;
      },
      hmacSha256: p.hmacSha256,
    };
    const c = createChainCommitment(
      inPlace,
      SecretBytes.fromBytes(hexToBytes(V.seedHex)),
      V.chainLength,
    );
    expect(bytesToHex(c.chainId)).toBe(V.linksHex[0]);
  });
});
