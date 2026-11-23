// Development in-memory chain store (P8-3c-2): states, transitions, reservations, salts,
// classifications, reveals, production refusal, and the durable-store contract it does NOT meet.
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretBytes, hexToBytes } from "../../src/fairness";
import {
  CHAIN_STATE_RULES,
  CHAIN_TRANSITIONS,
  type ChainState,
  type ChainStore,
} from "../../src/fairness/chain-store";
import { checkpointAbove, checkpointIndices } from "../../src/fairness/checkpoints";
import {
  MEMORY_STORE_MAX_CHAIN_LENGTH,
  MemoryChainStore,
} from "../../src/fairness/memory-chain-store";
import {
  DEV,
  DEV_CHAIN_ID,
  devChainInput,
  devStore,
  expectCode,
  newStore,
  renderings,
  saltA,
  saltB,
} from "../helpers/fairness";

const ID = DEV_CHAIN_ID;
const link = (i: number) => hexToBytes(DEV.linksHex[i]);
const STATES: ChainState[] = ["active", "suspended", "exhausted", "retired", "compromised"];

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Reserves `n` indices with request ids r1 … rn. */
async function reserve(store: ChainStore, n: number) {
  for (let i = 1; i <= n; i++) await store.reserveIndex(ID, `r${i}`);
}

/** Puts a chain into `state` through valid moves only. */
async function inState(state: ChainState): Promise<ChainStore> {
  const store = await devStore();
  if (state === "exhausted") await reserve(store, DEV.chainLength);
  else if (state !== "active") await store.transitionChain(ID, state, "test");
  expect((await store.getChain(ID)).state).toBe(state);
  return store;
}

describe("development-only use (test 17)", () => {
  it.each([
    ["production mode", { mode: "production" }],
    ["no mode", {}],
    ["no options", undefined],
    ["NODE_ENV=production", { mode: "development", environment: { NODE_ENV: "production" } }],
    [
      "NODE_ENV=staging (unknown values fail closed)",
      { mode: "test", environment: { NODE_ENV: "staging" } },
    ],
  ])("refuses %s", async (_n, options) => {
    await expectCode(() => new MemoryChainStore(options as never), "development-store-refused");
  });

  it("refuses when the real process environment says production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expectCode(
      () => new MemoryChainStore({ mode: "development" }),
      "development-store-refused",
    );
  });

  it.each([undefined, "", "development", "test"])("accepts NODE_ENV=%s", (value) => {
    expect(
      () => new MemoryChainStore({ mode: "development", environment: { NODE_ENV: value } }),
    ).not.toThrow();
  });

  it("states that it is neither durable, cross-process unique, transactional nor for production", () => {
    expect(newStore().guarantees).toEqual({
      durable: false,
      crossProcessIndexUniqueness: false,
      multiStepTransactions: false,
      productionUse: false,
    });
  });
});

describe("chain creation", () => {
  it("stores a valid chain and returns a public snapshot", async () => {
    const store = newStore();
    const input = devChainInput(3);
    const snap = await store.createChain(input);
    expect(snap).toEqual({
      chainId: ID,
      fv: 1,
      length: 8,
      checkpointInterval: 3,
      state: "active",
      lastReservedIndex: 0,
      revealedCount: 0,
    });
    expect(Object.isFrozen(snap)).toBe(true);
    // The store keeps its own copies: disposing the caller's does not affect it.
    for (const cp of input.checkpoints.values()) cp.dispose();
    const x6 = await store.readCheckpoint(ID, 6);
    expect(x6.reveal()).toEqual(link(6));
  });

  it("rejects duplicates, incomplete or malformed checkpoint sets and oversized chains", async () => {
    const store = await devStore(3);
    await expectCode(store.createChain(devChainInput(3)), "chain-exists");
    const missing = devChainInput(3);
    (missing.checkpoints as Map<number, SecretBytes>).delete(3);
    await expectCode(newStore().createChain(missing), "invalid-checkpoint");
    const wrongKey = devChainInput(3);
    const m = wrongKey.checkpoints as Map<number, SecretBytes>;
    m.set(4, m.get(3)!);
    m.delete(3);
    await expectCode(newStore().createChain(wrongKey), "invalid-checkpoint");
    const tooLong = {
      ...devChainInput(3),
      commitment: { fv: 1, chainId: link(0), length: MEMORY_STORE_MAX_CHAIN_LENGTH + 1 },
    };
    await expectCode(newStore().createChain(tooLong), "invalid-chain-length");
    await expectCode(
      newStore().createChain({ ...devChainInput(3), checkpointInterval: 0 }),
      "invalid-checkpoint",
    );
    await expectCode(
      newStore().createChain({
        ...devChainInput(3),
        commitment: { fv: 2, chainId: link(0), length: 8 },
      }),
      "invalid-chain-length",
    );
  });

  it("checkpoint geometry: x_N plus every multiple of the interval", () => {
    expect(checkpointIndices(8, 3)).toEqual([8, 6, 3]);
    expect(checkpointIndices(3072, 1024)).toEqual([3072, 2048, 1024]);
    expect(checkpointIndices(5, 1024)).toEqual([5]);
    expect(checkpointAbove(1, 3000, 1024)).toBe(1024);
    expect(checkpointAbove(1024, 3000, 1024)).toBe(1024);
    expect(checkpointAbove(1025, 3000, 1024)).toBe(2048);
    expect(checkpointAbove(2999, 3000, 1024)).toBe(3000);
  });

  it("unknown chains and malformed chain ids fail closed", async () => {
    const store = newStore();
    await expectCode(store.getChain(ID), "unknown-chain");
    await expectCode(store.reserveIndex(ID, "r1"), "unknown-chain");
    await expectCode(store.getChain(ID.toUpperCase()), "invalid-chain-id");
  });
});

describe("index reservation (tests 4 – 6)", () => {
  it("is monotonic and never reuses an index; a repeated request id gets the same index", async () => {
    const store = await devStore();
    const a = await store.reserveIndex(ID, "round-a");
    const b = await store.reserveIndex(ID, "round-b");
    const again = await store.reserveIndex(ID, "round-a");
    const c = await store.reserveIndex(ID, "round-c");
    expect([a.value.index, b.value.index, c.value.index]).toEqual([1, 2, 3]);
    expect(again).toEqual({ value: a.value, replayed: true });
    expect(a.replayed || b.replayed || c.replayed).toBe(false);
    expect((await store.getChain(ID)).lastReservedIndex).toBe(3);
  });

  it("concurrent reservations receive distinct, gap-free indices", async () => {
    const store = newStore();
    // A longer chain (interval 8) built from arbitrary development checkpoints: geometry only.
    const length = 600;
    const cps = new Map(
      checkpointIndices(length, 8).map((c) => [
        c,
        SecretBytes.fromBytes(new Uint8Array(32).fill(c % 251 || 1)),
      ]),
    );
    const chainId = "ab".repeat(32);
    await store.createChain({
      commitment: { fv: 1, chainId: hexToBytes(chainId), length },
      checkpointInterval: 8,
      checkpoints: cps,
    });
    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) => store.reserveIndex(chainId, `req-${i}`)),
    );
    const indices = results.map((r) => r.value.index).sort((x, y) => x - y);
    expect(indices).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    const same = await Promise.all(
      Array.from({ length: 50 }, () => store.reserveIndex(chainId, "one-id")),
    );
    expect(new Set(same.map((r) => r.value.index))).toEqual(new Set([501]));
    expect(same.filter((r) => !r.replayed)).toHaveLength(1);
  });

  it("exhaustion: the last index moves the chain to exhausted; further reservations fail", async () => {
    const store = await devStore();
    await reserve(store, 8);
    expect((await store.getChain(ID)).state).toBe("exhausted");
    await expectCode(store.reserveIndex(ID, "r9"), "chain-exhausted");
    expect((await store.reserveIndex(ID, "r8")).value.index).toBe(8); // replay still answers
    expect((await store.getChain(ID)).lastReservedIndex).toBe(8);
  });

  it("refuses malformed request ids and unreserved or out-of-range indices", async () => {
    const store = await devStore();
    for (const bad of ["", " x", "a".repeat(129), "a/b", 5 as never]) {
      await expectCode(store.reserveIndex(ID, bad), "invalid-request-id");
    }
    await reserve(store, 1);
    await expectCode(store.getIndex(ID, 2), "index-not-reserved");
    for (const bad of [0, 9, 1.5, -1]) await expectCode(store.getIndex(ID, bad), "invalid-index");
    expect((await store.getChain(ID)).lastReservedIndex).toBe(1);
  });
});

describe("chain states and transitions (test 10)", () => {
  for (const from of STATES) {
    for (const to of STATES) {
      const allowed = CHAIN_TRANSITIONS[from].includes(to);
      it(`${from} → ${to}: ${allowed ? "allowed" : "invalid-transition"}`, async () => {
        const store = await inState(from);
        if (allowed) expect((await store.transitionChain(ID, to, "test")).state).toBe(to);
        else await expectCode(store.transitionChain(ID, to, "test"), "invalid-transition");
      });
    }
  }

  it("exhausted is only entered automatically; compromised is terminal", () => {
    for (const from of STATES) expect(CHAIN_TRANSITIONS[from]).not.toContain("exhausted");
    expect(CHAIN_TRANSITIONS.compromised).toEqual([]);
  });

  it("reason codes are short identifiers, never free text", async () => {
    const store = await devStore();
    await expectCode(store.transitionChain(ID, "suspended", "Seed was 0xabc"), "invalid-reason");
    expect((await store.getChain(ID)).state).toBe("active");
  });

  it.each(STATES)("state %s allows exactly its rule set", async (state) => {
    // Index 1 is reserved while active (all 8 for exhausted), then the chain moves to `state`.
    const store = await devStore();
    await reserve(store, state === "exhausted" ? DEV.chainLength : 1);
    if (state !== "active" && state !== "exhausted") await store.transitionChain(ID, state, "test");
    expect((await store.getChain(ID)).state).toBe(state);
    const rules = CHAIN_STATE_RULES[state];
    const ok = async (run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch {
        return false;
      }
    };
    expect(await ok(() => store.reserveIndex(ID, "fresh"))).toBe(rules.reserve);
    expect(await ok(() => store.bindSalt(ID, 1, saltA()))).toBe(rules.derive);
    expect(await ok(async () => (await store.readCheckpoint(ID, 3)).dispose())).toBe(rules.reveal);
    // Classification is evidence and is recorded in every state, including compromised.
    expect(await ok(() => store.classifyRound(ID, 1, "aborted", "test"))).toBe(true);
  });
});

describe("salt binding and derivation issue", () => {
  it("binds once: same salt is a replay, a different salt is a conflict", async () => {
    const store = await devStore();
    await reserve(store, 1);
    expect((await store.bindSalt(ID, 1, saltA())).replayed).toBe(false);
    expect((await store.bindSalt(ID, 1, saltA())).replayed).toBe(true);
    await expectCode(store.bindSalt(ID, 1, saltB()), "salt-conflict");
    expect((await store.getIndex(ID, 1)).saltHex).toBe(DEV.saltAHex);
  });

  it("rejects invalid salts (test 20) and leaves the index unbound", async () => {
    const store = await devStore();
    await reserve(store, 1);
    for (const bad of [undefined, new Uint8Array(15), new Uint8Array(65), [1, 2, 3], "salt"]) {
      await expectCode(store.bindSalt(ID, 1, bad as never), "invalid-salt");
    }
    expect((await store.getIndex(ID, 1)).saltHex).toBeNull();
  });

  it("issues a derivation at most once, and only after the salt is bound", async () => {
    const store = await devStore();
    await reserve(store, 1);
    await expectCode(store.markDerivationIssued(ID, 1), "salt-not-bound");
    await store.bindSalt(ID, 1, saltA());
    expect((await store.markDerivationIssued(ID, 1)).derivationIssued).toBe(true);
    await expectCode(store.markDerivationIssued(ID, 1), "derivation-already-issued");
  });

  it("a concluded round cannot be salted or derived any more", async () => {
    const store = await devStore();
    await reserve(store, 1);
    await store.classifyRound(ID, 1, "aborted", "operator-stop");
    await expectCode(store.bindSalt(ID, 1, saltA()), "disposition-conflict");
  });
});

describe("classification (completed / aborted / voided / indeterminate)", () => {
  it("records each disposition; completed requires an issued derivation", async () => {
    const store = await devStore();
    await reserve(store, 4);
    await expectCode(
      store.classifyRound(ID, 1, "completed", "terminal-state"),
      "invalid-disposition",
    );
    await store.bindSalt(ID, 1, saltA());
    await store.markDerivationIssued(ID, 1);
    expect(
      (await store.classifyRound(ID, 1, "completed", "terminal-state")).value.disposition,
    ).toBe("completed");
    expect((await store.classifyRound(ID, 2, "aborted", "before-outcomes")).value.disposition).toBe(
      "aborted",
    );
    expect(
      (await store.classifyRound(ID, 3, "voided", "operator-decision")).value.disposition,
    ).toBe("voided");
    expect(
      (await store.classifyRound(ID, 4, "indeterminate", "process-failure")).value.disposition,
    ).toBe("indeterminate");
    await expectCode(store.classifyRound(ID, 1, "settled" as never, "x"), "invalid-disposition");
  });

  it("final classifications never change; indeterminate may be resolved once, with history", async () => {
    const store = await devStore();
    await reserve(store, 2);
    await store.classifyRound(ID, 1, "aborted", "before-outcomes");
    expect((await store.classifyRound(ID, 1, "aborted", "before-outcomes")).replayed).toBe(true);
    await expectCode(
      store.classifyRound(ID, 1, "voided", "operator-decision"),
      "disposition-conflict",
    );
    await expectCode(store.classifyRound(ID, 1, "aborted", "other-reason"), "disposition-conflict");
    await store.classifyRound(ID, 2, "indeterminate", "process-failure");
    const resolved = await store.classifyRound(ID, 2, "aborted", "investigated");
    expect(resolved.value.dispositionHistory).toEqual([
      { disposition: "indeterminate", reasonCode: "process-failure" },
      { disposition: "aborted", reasonCode: "investigated" },
    ]);
    await expectCode(store.classifyRound(ID, 2, "indeterminate", "again"), "disposition-conflict");
  });
});

describe("reveal recording (tests 8, 9, 21)", () => {
  async function concluded(n: number) {
    const store = await devStore();
    await reserve(store, n);
    for (let i = 1; i <= n; i++) await store.classifyRound(ID, i, "aborted", "test");
    return store;
  }

  it("records the actual index, seed and predecessor; a repeat with the same data is a replay", async () => {
    const store = await concluded(2);
    const first = await store.recordReveal(ID, 1, link(1), link(0));
    expect(first.value.reveal).toEqual({
      seedHex: DEV.linksHex[1],
      previousLinkHex: DEV.linksHex[0],
    });
    expect((await store.recordReveal(ID, 1, link(1), link(0))).replayed).toBe(true);
    expect((await store.getChain(ID)).revealedCount).toBe(1);
  });

  it("a conflicting repeat marks the chain compromised", async () => {
    const store = await concluded(2);
    await store.recordReveal(ID, 1, link(1), link(0));
    await expectCode(store.recordReveal(ID, 1, link(2), link(1)), "reveal-conflict");
    expect((await store.getChain(ID)).state).toBe("compromised");
    await expectCode(store.recordReveal(ID, 2, link(2), link(1)), "invalid-chain-state");
    await expectCode(store.readCheckpoint(ID, 3), "invalid-chain-state");
  });

  it("data contradicting a recorded neighbour or the chain id marks the chain compromised", async () => {
    const store = await concluded(3);
    await expectCode(store.recordReveal(ID, 1, link(1), link(5)), "reveal-conflict");
    expect((await store.getChain(ID)).state).toBe("compromised");
    const other = await concluded(3);
    await other.recordReveal(ID, 1, link(1), link(0));
    await expectCode(other.recordReveal(ID, 2, link(2), link(4)), "reveal-conflict");
  });

  it("refuses unconcluded rounds, earlier open rounds and unreserved (future) indices", async () => {
    const store = await devStore();
    await reserve(store, 3);
    await expectCode(store.recordReveal(ID, 1, link(1), link(0)), "round-not-concluded");
    await store.classifyRound(ID, 2, "aborted", "test");
    await expectCode(store.recordReveal(ID, 2, link(2), link(1)), "reveal-order-violation");
    await expectCode(store.recordReveal(ID, 4, link(4), link(3)), "index-not-reserved");
    await store.classifyRound(ID, 1, "aborted", "test");
    expect((await store.recordReveal(ID, 2, link(2), link(1))).replayed).toBe(false);
  });

  it("neighbours: nearest revealed link below (or the chain id) and above", async () => {
    const store = await concluded(5);
    expect(await store.revealNeighbours(ID, 3)).toEqual({
      below: { index: 0, linkHex: ID },
      above: null,
    });
    await store.recordReveal(ID, 2, link(2), link(1));
    await store.recordReveal(ID, 5, link(5), link(4));
    expect(await store.revealNeighbours(ID, 3)).toEqual({
      below: { index: 2, linkHex: DEV.linksHex[2] },
      above: { index: 5, seedHex: DEV.linksHex[5] },
    });
    // An already revealed index is never its own neighbour; the ends fall back correctly.
    await store.recordReveal(ID, 3, link(3), link(2));
    expect(await store.revealNeighbours(ID, 3)).toEqual({
      below: { index: 2, linkHex: DEV.linksHex[2] },
      above: { index: 5, seedHex: DEV.linksHex[5] },
    });
    expect((await store.revealNeighbours(ID, 2)).below).toEqual({ index: 0, linkHex: ID });
    expect((await store.revealNeighbours(ID, 5)).above).toBeNull();
    expect((await store.revealNeighbours(ID, 4)).below).toEqual({
      index: 3,
      linkHex: DEV.linksHex[3],
    });
  });
});

describe("secret material and closing", () => {
  it("snapshots, JSON and inspection never show checkpoint material (test 18)", async () => {
    const store = await devStore(3);
    await reserve(store, 2);
    const texts = [
      ...renderings(store),
      ...renderings(await store.getChain(ID)),
      ...renderings(await store.getIndex(ID, 1)),
    ].join("\n");
    for (let i = 1; i <= DEV.chainLength; i++) expect(texts).not.toContain(DEV.linksHex[i]);
  });

  it("readCheckpoint hands out an independent copy", async () => {
    const store = await devStore(3);
    const copy = await store.readCheckpoint(ID, 8);
    copy.dispose();
    expect((await store.readCheckpoint(ID, 8)).reveal()).toEqual(link(8));
    await expectCode(store.readCheckpoint(ID, 5), "invalid-checkpoint");
  });

  it("close() disposes everything; every later call fails (test 19)", async () => {
    const store = await devStore(3);
    store.close();
    store.close();
    await expectCode(store.getChain(ID), "store-closed");
    await expectCode(store.readCheckpoint(ID, 8), "store-closed");
    await expectCode(store.createChain(devChainInput(3)), "store-closed");
  });
});

describe("process restart (test 16)", () => {
  it("a new store (what a restart produces) knows nothing and recovers nothing", async () => {
    const before = await devStore(3);
    await reserve(before, 3);
    before.close();
    const after = newStore();
    await expectCode(after.getChain(ID), "unknown-chain");
    await expectCode(after.reserveIndex(ID, "r4"), "unknown-chain");
    await expectCode(after.getIndex(ID, 1), "unknown-chain");
  });

  // FUTURE P8-7 CONTRACT (durable store). The in-memory store cannot meet these by design; they
  // are recorded here so a durable implementation is tested against them, not claimed now.
  it.todo("P8-7: reserved indices, bound salts, issued derivations and reveals survive a restart");
  it.todo("P8-7: index uniqueness holds across processes and concurrent server instances");
  it.todo("P8-7: a reservation and its audit record commit atomically (no ambiguous outcome)");
  it.todo("P8-7: checkpoints are stored encrypted (KMS) and readable only by the vault");
  it.todo("P8-7: rounds open at a crash are classified on recovery, never silently reused");
});
