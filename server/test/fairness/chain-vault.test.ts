// Chain vault (P8-3c-2): chain creation, reservation, round keys, classification, verified
// reveals, precomputation. Development data only.
import { describe, expect, it } from "vitest";
import {
  FAIRNESS_PURPOSES,
  RoundDerivation,
  bytesToHex,
  hexToBytes,
  verifyChainLink,
  verifySeedAgainstCommitment,
} from "../../src/fairness";
import { MemoryAuditSink } from "../../src/fairness/audit";
import {
  ChainVault,
  HASH_SLICE_LINKS,
  MAX_PRECOMPUTED_SEEDS,
} from "../../src/fairness/chain-vault";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import { RECORD_FIELDS } from "../../src/fairness/records";
import { verifyRevealCandidate } from "../../src/fairness/reveal";
import {
  DEV,
  DEV_CHAIN_ID,
  FaultyStore,
  devStore,
  expectCode,
  newStore,
  newVault,
  nodeCrypto,
  saltA,
  saltB,
} from "../helpers/fairness";

const ID = DEV_CHAIN_ID;
const hash = nodeCrypto.hash;

/** Runs one round through the vault: reserve, prepare, classify; returns the keys (open). */
async function playRound(vault: ChainVault, chainId: string, request: string) {
  const r = await vault.reserveRound(chainId, request);
  const keys = await vault.prepareRound(chainId, r.chainIndex, saltA());
  await vault.classifyRound(chainId, r.chainIndex, "completed", "terminal-state");
  return keys;
}

describe("construction", () => {
  it("refuses crypto that did not come from the verified adapter (test 1)", async () => {
    const store = newStore();
    const copy = { hash: nodeCrypto.hash, random: nodeCrypto.random };
    await expectCode(() => new ChainVault({ crypto: copy, store }), "unverified-crypto");
    await expectCode(
      () => new ChainVault({ crypto: undefined as never, store }),
      "unverified-crypto",
    );
    expect(() => new ChainVault({ crypto: createNodeFairnessCrypto(), store })).not.toThrow();
  });
});

describe("development vectors through the vault and checkpoints", () => {
  it.each([1, 3, 4, 8])(
    "interval %i: round keys reproduce the vector blocks and draws",
    async (interval) => {
      const vault = newVault(await devStore(interval));
      for (let i = 1; i <= 3; i++) await vault.reserveRound(ID, `r${i}`);
      const keys = await vault.prepareRound(ID, 3, saltA());
      expect(keys.toJSON()).toEqual({ chainId: ID, chainIndex: 3, salt: DEV.saltAHex });
      const d = keys.derivation;
      expect(d).toBeInstanceOf(RoundDerivation);
      expect(bytesToHex(d.block("crash", 0))).toBe(DEV.blocksIndex3SaltA.crash0);
      expect(bytesToHex(d.block("world", 511))).toBe(DEV.blocksIndex3SaltA.world511);
      const crash = d.openStream("crash");
      expect([crash.next(), crash.next()]).toEqual(DEV.drawsIndex3SaltA.crash.map((x) => x.value));
      keys.dispose();
    },
  );

  it.each([1, 3, 8])(
    "interval %i: reveals reproduce every chain link and verify",
    async (interval) => {
      const vault = newVault(await devStore(interval));
      for (let i = 1; i <= DEV.chainLength; i++) {
        (await playRound(vault, ID, `r${i}`)).dispose();
        const rec = await vault.revealRound(ID, i);
        expect(rec.seed).toBe(DEV.linksHex[i]);
        expect(rec.previousLink).toBe(DEV.linksHex[i - 1]);
        expect(rec.salt).toBe(DEV.saltAHex);
        expect(verifyChainLink(hash, hexToBytes(rec.seed), hexToBytes(rec.previousLink))).toBe(
          true,
        );
      }
      expect((await vault.chainStatus(ID)).state).toBe("exhausted");
    },
  );
});

describe("fresh chains (explicit new-chain workflow)", () => {
  it("creates a verifiable chain; reveals across checkpoint boundaries verify independently", async () => {
    const vault = newVault(newStore());
    const commitment = await vault.createChain({ length: 300, checkpointInterval: 64 });
    expect(Object.keys(commitment)).toEqual(RECORD_FIELDS["chain-commitment"]);
    expect(commitment).toMatchObject({
      kind: "chain-commitment",
      status: "experimental-internal",
      fv: 1,
      length: 300,
    });
    const pub = { fv: 1, chainId: hexToBytes(commitment.chainId), length: 300 };
    let previous = commitment.chainId;
    for (let i = 1; i <= 130; i++) {
      await vault.reserveRound(commitment.chainId, `r${i}`);
      await vault.classifyRound(commitment.chainId, i, "aborted", "test");
      const rec = await vault.revealRound(commitment.chainId, i);
      expect(rec.previousLink).toBe(previous);
      previous = rec.seed;
      if (i % 63 === 0 || i === 64 || i === 65 || i === 128 || i === 129) {
        expect(
          verifySeedAgainstCommitment(hash, pub, { index: i, seed: hexToBytes(rec.seed) }),
        ).toEqual({ ok: true });
      }
    }
  });

  it("default interval 1,024: seeds on both sides of a checkpoint verify", async () => {
    const vault = newVault(newStore());
    const c = await vault.createChain({ length: 2100 });
    const pub = { fv: 1, chainId: hexToBytes(c.chainId), length: 2100 };
    for (let i = 1; i <= 1026; i++) {
      await vault.reserveRound(c.chainId, `r${i}`);
      await vault.classifyRound(c.chainId, i, "aborted", "test");
    }
    await vault.precompute(c.chainId, 1020, 7);
    for (const i of [1, 2, 1023, 1024, 1025, 1026]) {
      // Reveal order: everything below is concluded, so any of these may be revealed.
      const rec = await vault.revealRound(c.chainId, i);
      expect(
        verifySeedAgainstCommitment(hash, pub, { index: i, seed: hexToBytes(rec.seed) }),
      ).toEqual({ ok: true });
    }
  }, 60_000);

  it("two chains never share seeds or ids, and each is independent", async () => {
    const vault = newVault(newStore());
    const a = await vault.createChain({ length: 16, checkpointInterval: 4 });
    const b = await vault.createChain({ length: 16, checkpointInterval: 4 });
    expect(a.chainId).not.toBe(b.chainId);
    (await playRound(vault, a.chainId, "x")).dispose();
    (await playRound(vault, b.chainId, "x")).dispose();
    const ra = await vault.revealRound(a.chainId, 1);
    const rb = await vault.revealRound(b.chainId, 1);
    expect(ra.seed).not.toBe(rb.seed);
  });

  it("rejects invalid lengths and intervals; nothing is created and every refusal is audited", async () => {
    const vault = newVault(newStore());
    for (const length of [0, -1, 1.5, 2 ** 32, undefined]) {
      await expectCode(vault.createChain({ length: length as number }), "invalid-chain-length");
    }
    await expectCode(vault.createChain({ length: 8, checkpointInterval: 0 }), "invalid-checkpoint");
    const events = (vault.audit as MemoryAuditSink).events();
    expect(events.map((e) => [e.kind, e.code])).toEqual([
      ...Array.from({ length: 5 }, () => ["operation-failed", "invalid-chain-length"]),
      ["operation-failed", "invalid-checkpoint"],
    ]);
    // The provider objects are frozen: nothing can patch or wrap them after verification.
    expect(Object.isFrozen(nodeCrypto.random) && Object.isFrozen(nodeCrypto.hash)).toBe(true);
  });

  it("hashes in slices and yields to the event loop between them", async () => {
    let yields = 0;
    const vault = newVault(newStore(), {
      yieldSlice: async () => {
        yields++;
      },
    });
    await vault.createChain({ length: 4096, checkpointInterval: 1024 });
    // 4,096 links in ≤ 256-hash slices: at least 15 yields.
    expect(yields).toBeGreaterThanOrEqual(4096 / HASH_SLICE_LINKS - 1);
  });
});

describe("round keys: one derivation per reserved index", () => {
  it("only a reserved index can be prepared; preparation is issued once", async () => {
    const vault = newVault(await devStore());
    await expectCode(vault.prepareRound(ID, 1, saltA()), "index-not-reserved");
    await vault.reserveRound(ID, "r1");
    const keys = await vault.prepareRound(ID, 1, saltA());
    await expectCode(vault.prepareRound(ID, 1, saltA()), "derivation-already-issued");
    keys.dispose();
    await expectCode(vault.prepareRound(ID, 1, saltA()), "derivation-already-issued");
  });

  it("concurrent preparations of one index: exactly one succeeds", async () => {
    const vault = newVault(await devStore());
    await vault.reserveRound(ID, "r1");
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => vault.prepareRound(ID, 1, saltA())),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected")
        expect((r.reason as { code: string }).code).toBe("derivation-already-issued");
    }
  });

  it("the salt is fixed at the first attempt (no outcome shopping)", async () => {
    const store = new FaultyStore(await devStore());
    const vault = newVault(store);
    await vault.reserveRound(ID, "r1");
    store.fail("readCheckpoint");
    await expect(vault.prepareRound(ID, 1, saltA())).rejects.toThrow(/injected readCheckpoint/);
    expect((await store.getIndex(ID, 1)).saltHex).toBe(DEV.saltAHex);
    await expectCode(vault.prepareRound(ID, 1, saltB()), "salt-conflict");
    const keys = await vault.prepareRound(ID, 1, saltA());
    expect(keys.salt).toBe(DEV.saltAHex);
  });

  it("missing or invalid public salt is refused before anything is bound (test 20)", async () => {
    const vault = newVault(await devStore());
    await vault.reserveRound(ID, "r1");
    for (const bad of [
      undefined,
      null,
      new Uint8Array(0),
      new Uint8Array(15),
      new Uint8Array(65),
      [1],
      "salt",
    ]) {
      await expectCode(vault.prepareRound(ID, 1, bad as never), "invalid-salt");
    }
    const keys = await vault.prepareRound(ID, 1, saltB());
    expect(keys.salt).toBe(DEV.saltBHex);
  });

  it("disposing round keys disposes the derivation and its streams (test 19)", async () => {
    const vault = newVault(await devStore());
    await vault.reserveRound(ID, "r1");
    const keys = await vault.prepareRound(ID, 1, saltA());
    const streams = FAIRNESS_PURPOSES.map((p) => keys.derivation.openStream(p));
    const derivation = keys.derivation;
    keys.dispose();
    keys.dispose();
    expect(keys.disposed).toBe(true);
    expect(derivation.disposed).toBe(true);
    await expectCode(() => keys.derivation, "secret-disposed");
    for (const s of streams) await expectCode(() => s.next(), "secret-disposed");
  });
});

describe("reveal", () => {
  it("repeating a reveal returns the identical record and is audited as a replay (test 8)", async () => {
    const vault = newVault(await devStore());
    (await playRound(vault, ID, "r1")).dispose();
    const first = await vault.revealRound(ID, 1);
    const second = await vault.revealRound(ID, 1);
    expect(second).toEqual(first);
    expect(vault.audit).toBeInstanceOf(MemoryAuditSink);
    const kinds = (vault.audit as MemoryAuditSink).events().map((e) => e.kind);
    expect(kinds.filter((k) => k === "reveal-recorded")).toHaveLength(1);
    expect(kinds.filter((k) => k === "reveal-replayed")).toHaveLength(1);
  });

  it("a wrong chain link is refused and the chain is compromised (test 7)", async () => {
    const store = new FaultyStore(await devStore(3));
    const vault = newVault(store);
    await vault.reserveRound(ID, "r1");
    await vault.classifyRound(ID, 1, "aborted", "test");
    store.corruptCheckpoint(3);
    await expectCode(vault.revealRound(ID, 1), "reveal-verification-failed");
    expect((await vault.chainStatus(ID)).state).toBe("compromised");
    expect((await store.getIndex(ID, 1)).reveal).toBeNull();
    await expectCode(vault.reserveRound(ID, "r2"), "invalid-chain-state");
  });

  it("a corrupted secret on a repeated reveal is caught before it can conflict (test 9)", async () => {
    const store = new FaultyStore(await devStore(3));
    const vault = newVault(store);
    (await playRound(vault, ID, "r1")).dispose();
    const good = await vault.revealRound(ID, 1);
    store.corruptCheckpoint(3);
    await expectCode(vault.revealRound(ID, 1), "reveal-verification-failed");
    expect((await store.getIndex(ID, 1)).reveal?.seedHex).toBe(good.seed);
    expect((await store.getChain(ID)).state).toBe("compromised");
  });

  it("refuses open rounds, out-of-order reveals and unreserved future indices (test 21)", async () => {
    const vault = newVault(await devStore());
    await vault.reserveRound(ID, "r1");
    await vault.reserveRound(ID, "r2");
    await expectCode(vault.revealRound(ID, 1), "round-not-concluded");
    await vault.classifyRound(ID, 2, "aborted", "test");
    // Revealing x_2 would disclose x_1 (SHA-256(x_2) = x_1) while round 1 is still open.
    await expectCode(vault.revealRound(ID, 2), "reveal-order-violation");
    await expectCode(vault.revealRound(ID, 3), "index-not-reserved");
    await expectCode(vault.revealRound(ID, 9), "invalid-index");
  });

  it("verifies a gap of unrevealed concluded rounds against the nearest revealed links", async () => {
    const vault = newVault(await devStore(8));
    for (let i = 1; i <= 6; i++) {
      await vault.reserveRound(ID, `r${i}`);
      await vault.classifyRound(ID, i, "aborted", "test");
    }
    expect((await vault.revealRound(ID, 5)).seed).toBe(DEV.linksHex[5]); // below anchor x_0
    expect((await vault.revealRound(ID, 2)).seed).toBe(DEV.linksHex[2]); // above anchor x_5
    expect((await vault.revealRound(ID, 6)).seed).toBe(DEV.linksHex[6]);
  });

  it("verifyRevealCandidate rejects wrong seeds and inconsistent neighbours", async () => {
    const y = async () => undefined;
    const seed = (i: number) => hexToBytes(DEV.linksHex[i]);
    const ok = await verifyRevealCandidate(
      hash,
      {
        chainIndex: 3,
        seed: seed(3),
        neighbours: {
          below: { index: 0, linkHex: ID },
          above: { index: 5, seedHex: DEV.linksHex[5] },
        },
      },
      y,
    );
    expect(bytesToHex(ok)).toBe(DEV.linksHex[2]);
    const cases = [
      {
        chainIndex: 3,
        seed: seed(4),
        neighbours: { below: { index: 0, linkHex: ID }, above: null },
      },
      {
        chainIndex: 3,
        seed: seed(3),
        neighbours: { below: { index: 1, linkHex: DEV.linksHex[2] }, above: null },
      },
      {
        chainIndex: 3,
        seed: seed(3),
        neighbours: {
          below: { index: 0, linkHex: ID },
          above: { index: 5, seedHex: DEV.linksHex[6] },
        },
      },
      {
        chainIndex: 3,
        seed: seed(3),
        neighbours: { below: { index: 3, linkHex: ID }, above: null },
      },
      {
        chainIndex: 3,
        seed: seed(3),
        neighbours: {
          below: { index: 0, linkHex: ID },
          above: { index: 3, seedHex: DEV.linksHex[3] },
        },
      },
    ];
    for (const c of cases)
      await expectCode(verifyRevealCandidate(hash, c, y), "reveal-verification-failed");
  });
});

describe("precompute (off the live event loop)", () => {
  it("cached seeds give identical round keys; readCheckpoint is not needed afterwards", async () => {
    const store = new FaultyStore(await devStore(8));
    const vault = newVault(store);
    for (let i = 1; i <= 4; i++) await vault.reserveRound(ID, `r${i}`);
    expect(await vault.precompute(ID, 1, 6)).toBe(6);
    store.fail("readCheckpoint", "before", 100);
    const keys = await vault.prepareRound(ID, 3, saltA());
    expect(bytesToHex(keys.derivation.block("crash", 0))).toBe(DEV.blocksIndex3SaltA.crash0);
    keys.dispose();
    await vault.classifyRound(ID, 1, "aborted", "test");
    expect((await vault.revealRound(ID, 1)).seed).toBe(DEV.linksHex[1]);
    // Preparing index 3 must not have consumed or disposed its cache entry: the reveal of the
    // same index is still served from the cache (checkpoint reads keep failing).
    await vault.classifyRound(ID, 2, "aborted", "test");
    await vault.classifyRound(ID, 3, "completed", "terminal-state");
    expect((await vault.revealRound(ID, 3)).seed).toBe(DEV.linksHex[3]);
  });

  it("skips revealed indices, validates the range and caps the cache", async () => {
    const vault = newVault(await devStore(8));
    (await playRound(vault, ID, "r1")).dispose();
    await vault.revealRound(ID, 1);
    expect(await vault.precompute(ID, 1, 3)).toBe(2);
    expect(await vault.precompute(ID, 1, 3)).toBe(0);
    for (const [from, count] of [
      [0, 1],
      [1, 0],
      [8, 2],
      [1.5, 1],
    ]) {
      await expectCode(vault.precompute(ID, from, count), "invalid-precompute-range");
    }
    const big = newVault(newStore());
    const c = await big.createChain({
      length: MAX_PRECOMPUTED_SEEDS + 10,
      checkpointInterval: 1024,
    });
    await expectCode(
      big.precompute(c.chainId, 1, MAX_PRECOMPUTED_SEEDS + 1),
      "invalid-precompute-range",
    );
  });

  it("a cold seed reconstruction (no precompute) also hashes in yielding slices", async () => {
    let yields = 0;
    const vault = newVault(newStore(), { yieldSlice: async () => void yields++ });
    const c = await vault.createChain({ length: 2048 });
    await vault.reserveRound(c.chainId, "r1");
    yields = 0;
    (await vault.prepareRound(c.chainId, 1, saltA())).dispose(); // 1,023 links below x_1024
    expect(yields).toBeGreaterThanOrEqual(Math.floor(1023 / HASH_SLICE_LINKS));
  });

  it("yields between slices", async () => {
    let yields = 0;
    const vault = newVault(newStore(), { yieldSlice: async () => void yields++ });
    const c = await vault.createChain({ length: 2048 });
    yields = 0;
    await vault.precompute(c.chainId, 1, 1024);
    expect(yields).toBeGreaterThanOrEqual(1024 / HASH_SLICE_LINKS - 1);
  });

  it("is refused while the chain may not derive (suspended, retired, compromised)", async () => {
    const vault = newVault(await devStore());
    await vault.transitionChain(ID, "suspended", "maintenance");
    await expectCode(vault.precompute(ID, 1, 2), "invalid-chain-state");
    await expectCode(vault.reserveRound(ID, "r1"), "invalid-chain-state");
    await vault.transitionChain(ID, "active", "maintenance-done");
    expect((await vault.reserveRound(ID, "r1")).chainIndex).toBe(1);
  });
});

describe("dispose", () => {
  it("a disposed vault refuses every operation (test 19)", async () => {
    const vault = newVault(await devStore());
    await vault.precompute(ID, 1, 4);
    vault.dispose();
    vault.dispose();
    await expectCode(vault.reserveRound(ID, "r1"), "vault-disposed");
    await expectCode(vault.revealRound(ID, 1), "vault-disposed");
    await expectCode(vault.createChain({ length: 4 }), "vault-disposed");
  });
});
