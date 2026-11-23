// P8-3c-3 security hardening: (A) an indeterminate round is unresolved, so it blocks its own
// reveal and every later reveal; (B) a compromised (or no longer derivable) chain loses every
// cached secret seed as soon as the vault observes it, including across vaults that share a store
// and while operations are in flight. Development data only (the public fv = 1 vector chain).
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretBytes, bytesToHex, hexToBytes } from "../../src/fairness";
import { MemoryAuditSink, type AuditEventInput, type AuditSink } from "../../src/fairness/audit";
import type { IndexSnapshot, StoreResult } from "../../src/fairness/chain-store";
import type { ChainVault } from "../../src/fairness/chain-vault";
import type { ChainError } from "../../src/fairness/errors";
import { RoundKeys } from "../../src/fairness/round-keys";
import {
  DEV,
  DEV_CHAIN_ID,
  FaultyStore,
  devStore,
  expectCode,
  newStore,
  newVault,
  renderings,
  saltA,
  saltB,
} from "../helpers/fairness";

const ID = DEV_CHAIN_ID;
const link = (i: number): Uint8Array => hexToBytes(DEV.linksHex[i]);

afterEach(() => {
  vi.restoreAllMocks();
});

/** Indices of development links found anywhere in `texts`. */
const linksIn = (texts: string[]): number[] => {
  const all = texts.join("\n");
  return DEV.linksHex.flatMap((hex, i) => (i > 0 && all.includes(hex) ? [i] : []));
};

/** Error of a rejected call (fails the test if the call succeeds). */
async function failure(run: () => Promise<unknown>): Promise<Error & { code?: string }> {
  try {
    await run();
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error("expected a rejection");
}

/**
 * Counts SecretBytes created from now on that are not disposed. Every temporary the vault makes
 * is disposed before its call returns, so after setup this is exactly the number of cached seeds.
 */
function trackSecrets(): { alive: () => number } {
  const spy = vi.spyOn(SecretBytes, "fromBytes");
  return {
    alive: () =>
      spy.mock.results.filter((r) => r.type === "return" && !(r.value as SecretBytes).disposed)
        .length,
  };
}

/** A yieldSlice that can hold exactly one yield until released (bounded: no loops). */
function pausableYield() {
  let armed = false;
  let release: () => void = () => undefined;
  let reached: () => void = () => undefined;
  return {
    /** Holds the next yield; resolves once a call reaches it. */
    arm(): Promise<void> {
      armed = true;
      return new Promise<void>((r) => (reached = r));
    },
    release: () => release(),
    yieldSlice: async (): Promise<void> => {
      if (!armed) return;
      armed = false;
      const held = new Promise<void>((r) => (release = r));
      reached();
      await held;
    },
  };
}

/** A store whose recordReveal waits at a gate (to interleave other calls before it records). */
class GatedRevealStore extends FaultyStore {
  #gate: { reached: () => void; held: Promise<void> } | null = null;
  #release: () => void = () => undefined;

  arm(): Promise<void> {
    return new Promise<void>((reached) => {
      this.#gate = { reached, held: new Promise<void>((r) => (this.#release = r)) };
    });
  }

  release(): void {
    this.#release();
  }

  override async recordReveal(
    chainId: string,
    index: number,
    seed: Uint8Array,
    previousLink: Uint8Array,
  ): Promise<StoreResult<IndexSnapshot>> {
    const gate = this.#gate;
    this.#gate = null;
    if (gate) {
      gate.reached();
      await gate.held;
    }
    return super.recordReveal(chainId, index, seed, previousLink);
  }
}

/** Dev chain with `n` reserved rounds (no salt, nothing classified). */
async function reserved(vault: ChainVault, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) await vault.reserveRound(ID, `r${i}`);
}

// ---------------------------------------------------------------------------------------------
// Finding A — indeterminate rounds are unresolved
// ---------------------------------------------------------------------------------------------

describe("A: an unresolved indeterminate round blocks reveals (tests 1 – 5)", () => {
  it("blocks every later reveal and its own reveal, in the vault and in the store (test 1)", async () => {
    const store = await devStore(8);
    const vault = newVault(store);
    await reserved(vault, 4);
    await vault.classifyRound(ID, 1, "indeterminate", "process-failure");
    for (let i = 2; i <= 4; i++) await vault.classifyRound(ID, i, "aborted", "test");
    await expectCode(vault.revealRound(ID, 1), "round-not-concluded");
    for (let i = 2; i <= 4; i++) {
      await expectCode(vault.revealRound(ID, i), "reveal-order-violation");
    }
    // The store refuses on its own, too (a caller bypassing the vault gets no further).
    await expectCode(store.recordReveal(ID, 1, link(1), link(0)), "round-not-concluded");
    await expectCode(store.recordReveal(ID, 2, link(2), link(1)), "reveal-order-violation");
    expect((await store.getChain(ID)).revealedCount).toBe(0);
    expect((await store.getChain(ID)).state).toBe("active");
    for (let i = 1; i <= 4; i++) expect((await store.getIndex(ID, i)).reveal).toBeNull();
  });

  it("the indeterminate round's own reveal is refused before any seed is reconstructed", async () => {
    const store = new FaultyStore(await devStore(8));
    const vault = newVault(store);
    await reserved(vault, 1);
    await vault.classifyRound(ID, 1, "indeterminate", "process-failure");
    const read = vi.spyOn(store, "readCheckpoint");
    const neighbours = vi.spyOn(store, "revealNeighbours");
    await expectCode(vault.revealRound(ID, 1), "round-not-concluded");
    expect(read).not.toHaveBeenCalled();
    expect(neighbours).not.toHaveBeenCalled();
  });

  it("a blocked reveal leaks no secret material anywhere (test 2)", async () => {
    const store = new FaultyStore(await devStore(3));
    const vault = newVault(store);
    await reserved(vault, 3);
    const keys = await vault.prepareRound(ID, 1, saltA());
    keys.dispose();
    await vault.classifyRound(ID, 1, "indeterminate", "settlement-unknown");
    await vault.classifyRound(ID, 2, "aborted", "test");
    await vault.classifyRound(ID, 3, "voided", "operator-decision");
    await vault.precompute(ID, 1, 3);
    const errors = [
      await failure(() => vault.revealRound(ID, 1)),
      await failure(() => vault.revealRound(ID, 2)),
      await failure(() => vault.revealRound(ID, 3)),
      await failure(() => store.inner.recordReveal(ID, 3, link(3), link(2))),
    ];
    expect(errors.map((e) => e.code)).toEqual([
      "round-not-concluded",
      "reveal-order-violation",
      "reveal-order-violation",
      "reveal-order-violation",
    ]);
    const outputs: unknown[] = [
      ...errors,
      vault,
      store,
      store.inner,
      keys,
      await vault.chainStatus(ID),
      await store.getChain(ID),
      await store.getIndex(ID, 1),
      await store.getIndex(ID, 2),
      await store.getIndex(ID, 3),
      await store.revealNeighbours(ID, 2),
      (vault.audit as MemoryAuditSink).events(),
    ];
    expect(linksIn(outputs.flatMap(renderings))).toEqual([]);
    const failed = (vault.audit as MemoryAuditSink)
      .events()
      .filter((e) => e.kind === "operation-failed");
    expect(failed.map((e) => [e.operation, e.chainIndex, e.code])).toEqual([
      ["reveal-round", 1, "round-not-concluded"],
      ["reveal-round", 2, "reveal-order-violation"],
      ["reveal-round", 3, "reveal-order-violation"],
    ]);
  });

  it("duplicates, replays, cache and a second vault cannot bypass the block (test 3)", async () => {
    const store = await devStore(8);
    const first = newVault(store);
    const second = newVault(store);
    await reserved(first, 3);
    await first.classifyRound(ID, 1, "indeterminate", "process-failure");
    await first.classifyRound(ID, 2, "aborted", "test");
    // An identical classification is a replay and still indeterminate.
    const replay = await second.classifyRound(ID, 1, "indeterminate", "process-failure");
    expect(replay.disposition).toBe("indeterminate");
    // Precomputed seeds do not open a path around the store's ordering check.
    await first.precompute(ID, 1, 3);
    await second.precompute(ID, 1, 3);
    for (let attempt = 0; attempt < 3; attempt++) {
      await expectCode(first.revealRound(ID, 2), "reveal-order-violation");
      await expectCode(second.revealRound(ID, 2), "reveal-order-violation");
      await expectCode(second.revealRound(ID, 1), "round-not-concluded");
    }
    const burst = await Promise.allSettled([
      first.revealRound(ID, 2),
      second.revealRound(ID, 2),
      first.revealRound(ID, 2),
      second.revealRound(ID, 1),
      first.revealRound(ID, 1),
    ]);
    expect(burst.every((r) => r.status === "rejected")).toBe(true);
    // Classifying further rounds does not unblock anything either.
    await first.classifyRound(ID, 3, "aborted", "test");
    await expectCode(first.revealRound(ID, 3), "reveal-order-violation");
    expect((await store.getChain(ID)).revealedCount).toBe(0);
    const history = (await store.getIndex(ID, 1)).dispositionHistory;
    expect(history).toEqual([{ disposition: "indeterminate", reasonCode: "process-failure" }]);
  });

  it("invalid resolution attempts fail closed and change nothing (test 4)", async () => {
    const store = await devStore(8);
    const vault = newVault(store);
    await reserved(vault, 2);
    await vault.classifyRound(ID, 1, "indeterminate", "process-failure");
    await vault.classifyRound(ID, 2, "aborted", "test");
    const attempts: [string, string, string][] = [
      ["settled", "investigated", "invalid-disposition"],
      ["", "investigated", "invalid-disposition"],
      ["completed", "terminal-state", "invalid-disposition"], // no derivation was ever issued
      ["indeterminate", "other-reason", "disposition-conflict"],
      ["aborted", "Free Text With Spaces", "invalid-reason"],
      ["aborted", "", "invalid-reason"],
    ];
    for (const [disposition, reason, code] of attempts) {
      await expectCode(vault.classifyRound(ID, 1, disposition as never, reason), code);
      await expectCode(vault.revealRound(ID, 2), "reveal-order-violation");
    }
    const idx = await store.getIndex(ID, 1);
    expect(idx.disposition).toBe("indeterminate");
    expect(idx.dispositionHistory).toHaveLength(1);
    // One valid resolution; any further change of the now final value is refused.
    await vault.classifyRound(ID, 1, "aborted", "investigated");
    await expectCode(
      vault.classifyRound(ID, 1, "voided", "operator-decision"),
      "disposition-conflict",
    );
    await expectCode(vault.classifyRound(ID, 1, "indeterminate", "again"), "disposition-conflict");
    expect((await store.getIndex(ID, 1)).dispositionHistory).toEqual([
      { disposition: "indeterminate", reasonCode: "process-failure" },
      { disposition: "aborted", reasonCode: "investigated" },
    ]);
  });

  it("legitimate ordering still works; an explicit resolution unblocks (test 5)", async () => {
    const store = await devStore(3);
    const vault = newVault(store);
    await reserved(vault, 5);
    (await vault.prepareRound(ID, 1, saltA())).dispose();
    await vault.classifyRound(ID, 1, "indeterminate", "process-failure");
    await vault.classifyRound(ID, 2, "aborted", "test");
    await vault.classifyRound(ID, 3, "voided", "operator-decision");
    // An indeterminate round later in the chain does not block earlier ones.
    await vault.classifyRound(ID, 5, "indeterminate", "process-failure");
    await expectCode(vault.revealRound(ID, 3), "reveal-order-violation");
    // Resolution needs an issued derivation for `completed`, exactly as before.
    await vault.classifyRound(ID, 1, "completed", "investigated");
    const r3 = await vault.revealRound(ID, 3); // gap: 1 and 2 concluded, not revealed
    const r1 = await vault.revealRound(ID, 1);
    const r2 = await vault.revealRound(ID, 2);
    expect([r1.seed, r2.seed, r3.seed]).toEqual([1, 2, 3].map((i) => DEV.linksHex[i]));
    expect([r1.previousLink, r1.salt, r1.disposition]).toEqual([ID, DEV.saltAHex, "completed"]);
    // Index 4 still open, index 5 still indeterminate: both stay hidden.
    await expectCode(vault.revealRound(ID, 5), "round-not-concluded");
    await vault.classifyRound(ID, 4, "aborted", "test");
    await expectCode(vault.revealRound(ID, 5), "round-not-concluded");
    expect((await vault.revealRound(ID, 4)).seed).toBe(DEV.linksHex[4]);
    await vault.classifyRound(ID, 5, "voided", "investigated");
    expect((await vault.revealRound(ID, 5)).seed).toBe(DEV.linksHex[5]);
    expect((await store.getChain(ID)).state).toBe("active");
  });

  it("interleaving: a round marked indeterminate while a later reveal is in flight blocks it (test 10)", async () => {
    const store = new GatedRevealStore(await devStore(8));
    const vault = newVault(store);
    await reserved(vault, 2);
    await vault.classifyRound(ID, 2, "aborted", "test");
    const gate = store.arm();
    const pending = vault.revealRound(ID, 2);
    pending.catch(() => undefined);
    await gate; // the vault verified x_2 and is about to record it
    await vault.classifyRound(ID, 1, "indeterminate", "process-failure");
    store.release();
    await expectCode(pending, "reveal-order-violation");
    expect((await store.getIndex(ID, 2)).reveal).toBeNull();
  });

  it("interleaving: a resolution racing a later reveal either precedes it or blocks it", async () => {
    const store = new GatedRevealStore(await devStore(8));
    const vault = newVault(store);
    await reserved(vault, 2);
    await vault.classifyRound(ID, 1, "indeterminate", "process-failure");
    await vault.classifyRound(ID, 2, "aborted", "test");
    await expectCode(vault.revealRound(ID, 2), "reveal-order-violation");
    const gate = store.arm();
    const pending = vault.revealRound(ID, 2);
    pending.catch(() => undefined);
    await gate;
    await vault.classifyRound(ID, 1, "aborted", "investigated");
    store.release();
    // The resolution was recorded before the reveal reached the store, so it is legitimate.
    expect((await pending).seed).toBe(DEV.linksHex[2]);
  });
});

// ---------------------------------------------------------------------------------------------
// Finding B — compromised chains lose their cached secrets
// ---------------------------------------------------------------------------------------------

/** An audit sink that lets a test observe (or fail) every append. */
class ProbeAudit implements AuditSink {
  readonly guarantees = { durable: false, tamperEvident: false };
  readonly inner = new MemoryAuditSink();
  hook: ((event: AuditEventInput) => void) | null = null;

  append(event: AuditEventInput): void {
    this.hook?.(event);
    this.inner.append(event);
  }
}

/** Dev chain (interval 8) with rounds 1 – 4 reserved, 1 and 2 aborted, and seeds 1 – 6 cached. */
async function cachedSetup(audit: AuditSink = new MemoryAuditSink()) {
  const store = new FaultyStore(await devStore(8));
  const vault = newVault(store, { audit });
  await reserved(vault, 4);
  await vault.classifyRound(ID, 1, "aborted", "test");
  await vault.classifyRound(ID, 2, "aborted", "test");
  const secrets = trackSecrets();
  expect(await vault.precompute(ID, 1, 6)).toBe(6);
  expect(secrets.alive()).toBe(6);
  return { store, vault, secrets };
}

/**
 * Plants a self-inconsistent reveal of index 2 directly in the store (x_2 with a wrong
 * predecessor): the vault's verification of index 1 passes against x_2, but the store then
 * finds that x_1 contradicts the recorded predecessor and marks the chain compromised.
 */
async function plantConflict(store: FaultyStore): Promise<void> {
  await store.inner.recordReveal(ID, 2, link(2), link(5));
}

describe("B: a store-detected conflict compromises the chain and drops the cache (tests 6, 7)", () => {
  it("the conflicting reveal compromises the chain, is audited and evicts every cached seed", async () => {
    const { store, vault, secrets } = await cachedSetup();
    await plantConflict(store);
    const err = await failure(() => vault.revealRound(ID, 1));
    expect(err.code).toBe("reveal-conflict");
    expect((await store.getChain(ID)).state).toBe("compromised");
    expect(secrets.alive()).toBe(0);
    expect((await store.getIndex(ID, 1)).reveal).toBeNull();
    const events = (vault.audit as MemoryAuditSink).events();
    expect(events.slice(-2).map((e) => [e.kind, e.operation, e.code])).toEqual([
      ["chain-transition", "reveal-round", "compromised"],
      ["operation-failed", "reveal-round", "reveal-conflict"],
    ]);
    // Nothing secret in the error or the audit (x_2 and x_5 are the planted public data).
    expect(linksIn([err, events, vault].flatMap(renderings))).toEqual([]);
  });

  it("the cache is dropped as soon as the conflict is seen, before the vault yields again", async () => {
    const audit = new ProbeAudit();
    const { store, vault, secrets } = await cachedSetup(audit);
    await plantConflict(store);
    // Sample the cache at every audit append and at every store call made after the conflict:
    // any of them is a point where other code could run.
    let conflicted = false;
    const seen: number[] = [];
    const sample = () => void (conflicted && seen.push(secrets.alive()));
    audit.hook = () => {
      conflicted = true; // the first event of this reveal is already after the conflict
      sample();
    };
    const record = store.recordReveal.bind(store);
    vi.spyOn(store, "recordReveal").mockImplementation(async (...args) => {
      try {
        return await record(...args);
      } finally {
        conflicted = true;
      }
    });
    const getChain = store.getChain.bind(store);
    vi.spyOn(store, "getChain").mockImplementation(async (chainId) => {
      sample();
      return getChain(chainId);
    });
    await expectCode(vault.revealRound(ID, 1), "reveal-conflict");
    expect(seen.length).toBeGreaterThanOrEqual(3); // getChain, then two audit events
    expect(seen.every((n) => n === 0)).toBe(true);
  });

  it("a vault-detected verification failure also leaves nothing cached", async () => {
    const { store, vault, secrets } = await cachedSetup();
    await store.inner.recordReveal(ID, 2, link(3), link(2)); // x_3 does not hash to x_1
    await expectCode(vault.revealRound(ID, 1), "reveal-verification-failed");
    expect((await store.getChain(ID)).state).toBe("compromised");
    expect(secrets.alive()).toBe(0);
  });

  it("an audit failure during the compromise does not keep the cache or mask the error", async () => {
    const audit = new ProbeAudit();
    const { store, vault, secrets } = await cachedSetup(audit);
    await plantConflict(store);
    audit.hook = () => {
      throw new Error("audit down");
    };
    await expectCode(vault.revealRound(ID, 1), "reveal-conflict");
    expect(secrets.alive()).toBe(0);
  });
});

describe("B: every later operation is refused consistently (test 8)", () => {
  it("reserve, prepare, reveal and precompute keep failing; nothing is cached again", async () => {
    const { store, vault, secrets } = await cachedSetup();
    await plantConflict(store);
    await expectCode(vault.revealRound(ID, 1), "reveal-conflict");
    for (let attempt = 0; attempt < 3; attempt++) {
      await expectCode(vault.reserveRound(ID, `late-${attempt}`), "invalid-chain-state");
      // A retried reservation id still answers with its original index (public data only).
      expect((await vault.reserveRound(ID, "r1")).chainIndex).toBe(1);
      await expectCode(vault.prepareRound(ID, 3, saltA()), "invalid-chain-state");
      await expectCode(vault.revealRound(ID, 1), "invalid-chain-state");
      await expectCode(vault.revealRound(ID, 2), "invalid-chain-state");
      await expectCode(vault.precompute(ID, 1, 2), "invalid-chain-state");
      await expectCode(vault.transitionChain(ID, "active", "operator-retry"), "invalid-transition");
      expect(secrets.alive()).toBe(0);
    }
    expect((await vault.chainStatus(ID)).state).toBe("compromised");
    expect((await store.getIndex(ID, 3)).derivationIssued).toBe(false);
  });
});

describe("B: vaults sharing a store never use stale secrets (test 9)", () => {
  /** Vault A caches seeds; vault B (same store) compromises the chain through a conflict. */
  async function twoVaults() {
    const { store, vault: a, secrets } = await cachedSetup();
    const b = newVault(store);
    await plantConflict(store);
    await expectCode(b.revealRound(ID, 1), "reveal-conflict");
    // Documented limitation: A has not touched the chain yet, so it cannot know.
    expect(secrets.alive()).toBe(6);
    return { store, a, b, secrets };
  }

  const triggers: [string, (a: ChainVault) => Promise<unknown>, string | null][] = [
    ["chainStatus", (a) => a.chainStatus(ID), null],
    ["prepareRound", (a) => a.prepareRound(ID, 3, saltA()), "invalid-chain-state"],
    ["revealRound", (a) => a.revealRound(ID, 1), "invalid-chain-state"],
    ["precompute", (a) => a.precompute(ID, 7, 1), "invalid-chain-state"],
    ["reserveRound", (a) => a.reserveRound(ID, "late"), "invalid-chain-state"],
    ["classifyRound", (a) => a.classifyRound(ID, 3, "aborted", "test"), null],
    ["transitionChain", (a) => a.transitionChain(ID, "retired", "x"), "invalid-transition"],
  ];

  it.each(triggers)("A's next %s drops A's cached seeds", async (_name, run, code) => {
    const { a, secrets } = await twoVaults();
    if (code === null) await run(a);
    else await expectCode(run(a), code);
    expect(secrets.alive()).toBe(0);
    await expectCode(a.prepareRound(ID, 4, saltB()), "invalid-chain-state");
    expect(secrets.alive()).toBe(0);
  });

  it("an operator compromise through another vault is picked up the same way", async () => {
    const { store, vault: a, secrets } = await cachedSetup();
    await newVault(store).transitionChain(ID, "compromised", "operator-finding");
    expect(secrets.alive()).toBe(6);
    await expectCode(a.revealRound(ID, 1), "invalid-chain-state");
    expect(secrets.alive()).toBe(0);
  });

  it("an out-of-band suspension drops the cache too; reveals still work, from checkpoints", async () => {
    const { store, vault: a, secrets } = await cachedSetup();
    await newVault(store).transitionChain(ID, "suspended", "maintenance");
    expect((await a.revealRound(ID, 1)).seed).toBe(DEV.linksHex[1]);
    expect(secrets.alive()).toBe(0);
  });

  it("a closed store drops the cache on the next interaction", async () => {
    const { store, vault, secrets } = await cachedSetup();
    store.close();
    await expectCode(vault.prepareRound(ID, 3, saltA()), "store-closed");
    expect(secrets.alive()).toBe(0);
  });
});

describe("B: in-flight and concurrent operations (test 10)", () => {
  async function freshChain() {
    const pause = pausableYield();
    const store = newStore();
    const vault = newVault(store, { yieldSlice: pause.yieldSlice });
    const { chainId } = await vault.createChain({ length: 2048 });
    const secrets = trackSecrets();
    return { pause, store, vault, chainId, secrets };
  }

  it("a compromise while precompute yields: nothing is installed, staged seeds are disposed", async () => {
    const { pause, store, vault, chainId, secrets } = await freshChain();
    const reached = pause.arm();
    const pending = vault.precompute(chainId, 1, 1024);
    pending.catch(() => undefined);
    await reached;
    expect(secrets.alive()).toBeGreaterThan(0); // staged seeds exist mid-walk
    await newVault(store).transitionChain(chainId, "compromised", "operator-finding");
    pause.release();
    await expectCode(pending, "invalid-chain-state");
    expect(secrets.alive()).toBe(0);
  });

  it("a suspend-and-resume while precompute yields moves the epoch: the stale walk is discarded", async () => {
    const { pause, vault, chainId, secrets } = await freshChain();
    const reached = pause.arm();
    const pending = vault.precompute(chainId, 1, 1024);
    pending.catch(() => undefined);
    await reached;
    await vault.transitionChain(chainId, "suspended", "maintenance");
    await vault.transitionChain(chainId, "active", "maintenance-done");
    pause.release();
    await expectCode(pending, "invalid-chain-state");
    expect(secrets.alive()).toBe(0);
    expect(await vault.precompute(chainId, 1, 300)).toBe(300); // a new walk is fine
    expect(secrets.alive()).toBe(300);
  });

  it("dispose while precompute yields: vault-disposed, nothing survives", async () => {
    const { pause, vault, chainId, secrets } = await freshChain();
    await vault.precompute(chainId, 1500, 10);
    const reached = pause.arm();
    const pending = vault.precompute(chainId, 1, 1024);
    pending.catch(() => undefined);
    await reached;
    vault.dispose();
    pause.release();
    await expectCode(pending, "vault-disposed");
    expect(secrets.alive()).toBe(0);
  });

  it("a cache drop while prepareRound reconstructs a seed: no keys, nothing issued, retry works", async () => {
    const { pause, store, vault, chainId } = await freshChain();
    await vault.reserveRound(chainId, "r1");
    const reached = pause.arm();
    const pending = vault.prepareRound(chainId, 1, saltA()); // 1,023 links below x_1024
    pending.catch(() => undefined);
    await reached;
    await vault.transitionChain(chainId, "suspended", "maintenance");
    await vault.transitionChain(chainId, "active", "maintenance-done");
    pause.release();
    await expectCode(pending, "invalid-chain-state");
    expect((await store.getIndex(chainId, 1)).derivationIssued).toBe(false);
    const keys = await vault.prepareRound(chainId, 1, saltA()); // the same salt, once
    expect(keys.chainIndex).toBe(1);
    keys.dispose();
  });

  it("a compromise while prepareRound yields: the store refuses the issue; keys never escape", async () => {
    const { pause, store, vault, chainId, secrets } = await freshChain();
    await vault.reserveRound(chainId, "r1");
    const reached = pause.arm();
    const pending = vault.prepareRound(chainId, 1, saltA());
    pending.catch(() => undefined);
    await reached;
    await newVault(store).transitionChain(chainId, "compromised", "operator-finding");
    pause.release();
    await expectCode(pending, "invalid-chain-state");
    expect((await store.getIndex(chainId, 1)).derivationIssued).toBe(false);
    expect(secrets.alive()).toBe(0);
  });

  it("overlapping concurrent precomputes cache the union exactly once", async () => {
    const store = newStore();
    const vault = newVault(store);
    const { chainId } = await vault.createChain({ length: 2048 });
    const secrets = trackSecrets();
    const [a, b] = await Promise.all([
      vault.precompute(chainId, 1, 600),
      vault.precompute(chainId, 300, 600),
    ]);
    expect(a + b).toBe(899);
    expect(secrets.alive()).toBe(899);
  });

  it("a burst of interleaved calls racing a compromise ends with nothing cached", async () => {
    const { store, vault, secrets } = await cachedSetup();
    const other = newVault(store);
    await plantConflict(store);
    const results = await Promise.allSettled([
      vault.revealRound(ID, 1),
      other.revealRound(ID, 1),
      vault.precompute(ID, 7, 2),
      vault.prepareRound(ID, 3, saltA()),
      other.prepareRound(ID, 4, saltB()),
      vault.reserveRound(ID, "late"),
      vault.revealRound(ID, 1),
    ]);
    // Calls whose store commit preceded the compromise may legitimately succeed; no reveal can.
    for (const i of [0, 1, 6]) expect(results[i].status).toBe("rejected");
    for (const r of results) {
      if (r.status === "fulfilled" && r.value instanceof RoundKeys) r.value.dispose();
    }
    expect((await store.getChain(ID)).state).toBe("compromised");
    expect((await store.getIndex(ID, 1)).reveal).toBeNull();
    expect(secrets.alive()).toBe(0);
    // Every call started after the compromise is refused, and nothing is cached again.
    const after = await Promise.allSettled([
      vault.revealRound(ID, 2),
      other.revealRound(ID, 1),
      vault.precompute(ID, 7, 2),
      other.precompute(ID, 7, 2),
      vault.prepareRound(ID, 3, saltA()),
      other.prepareRound(ID, 4, saltB()),
      vault.reserveRound(ID, "later"),
    ]);
    expect(after.map((r) => r.status === "rejected" && (r.reason as ChainError).code)).toEqual(
      Array(7).fill("invalid-chain-state"),
    );
    expect(secrets.alive()).toBe(0);
  });
});

describe("cryptographic regression (test 12)", () => {
  it("the fv = 1 development chain still reproduces byte for byte through the hardened vault", async () => {
    const vault = newVault(await devStore(3));
    await reserved(vault, 8);
    await vault.precompute(ID, 1, 8);
    for (let i = 1; i <= 8; i++) await vault.classifyRound(ID, i, "aborted", "test");
    for (let i = 1; i <= 8; i++) {
      const r = await vault.revealRound(ID, i);
      expect([r.seed, r.previousLink]).toEqual([DEV.linksHex[i], DEV.linksHex[i - 1]]);
      expect(bytesToHex(link(i))).toBe(DEV.linksHex[i]);
    }
  });
});
