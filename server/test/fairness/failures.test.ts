// Failure and recovery behaviour (P8-3c-2, tests 11 – 16). Each failure is injected at a precise
// step; the assertions state what the in-memory store guarantees inside ONE process and what it
// does not (restart = loss, never recovery). Durable recovery is P8-7.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RoundDerivation } from "../../src/fairness";
import { MemoryAuditSink } from "../../src/fairness/audit";
import {
  DEV,
  DEV_CHAIN_ID,
  FailingAudit,
  FaultyStore,
  devStore,
  expectCode,
  newVault,
  saltA,
} from "../helpers/fairness";

const ID = DEV_CHAIN_ID;
const SERVER = fileURLToPath(new URL("../..", import.meta.url));

describe("reservation failures", () => {
  it("failure before reservation (test 11): nothing is reserved and the failure is audited", async () => {
    const store = new FaultyStore(await devStore());
    const vault = newVault(store);
    store.fail("reserveIndex", "before");
    await expect(vault.reserveRound(ID, "r1")).rejects.toThrow(/injected/);
    await expectCode(vault.reserveRound(ID, "bad id"), "invalid-request-id");
    expect((await store.getChain(ID)).lastReservedIndex).toBe(0);
    expect((await vault.reserveRound(ID, "r1")).chainIndex).toBe(1);
    const failed = (vault.audit as MemoryAuditSink)
      .events()
      .filter((e) => e.kind === "operation-failed");
    expect(failed.map((e) => e.code)).toEqual(["unexpected-error", "invalid-request-id"]);
  });

  it("failure after reservation (test 12): the retry gets the SAME index, never a new one", async () => {
    const audit = new FailingAudit();
    const vault = newVault(await devStore(), { audit });
    audit.failOn("index-reserved");
    await expectCode(vault.reserveRound(ID, "round-a"), "audit-failed");
    expect((await vault.chainStatus(ID)).lastReservedIndex).toBe(1); // the index IS reserved
    expect((await vault.reserveRound(ID, "round-a")).chainIndex).toBe(1); // idempotent retry
    expect((await vault.reserveRound(ID, "round-b")).chainIndex).toBe(2); // index 1 never reused
    // The lost "index-reserved" event is replaced by the failure record and the replay.
    expect(audit.inner.events().map((e) => [e.kind, e.chainIndex, e.code])).toEqual([
      ["operation-failed", null, "audit-failed"],
      ["reservation-replayed", 1, null],
      ["index-reserved", 2, null],
    ]);
  });

  it("store-level ambiguous failure: the call changed state, the caller saw an error", async () => {
    const store = new FaultyStore(await devStore());
    const vault = newVault(store);
    store.fail("reserveIndex", "after");
    await expect(vault.reserveRound(ID, "round-a")).rejects.toThrow(/after the store call/);
    expect((await vault.reserveRound(ID, "round-a")).chainIndex).toBe(1);
    expect((await vault.chainStatus(ID)).lastReservedIndex).toBe(1);
  });
});

describe("failure while preparing round secrets (test 13)", () => {
  it("checkpoint read fails: no keys, salt stays bound, same-salt retry succeeds", async () => {
    const store = new FaultyStore(await devStore());
    const vault = newVault(store);
    await vault.reserveRound(ID, "r1");
    store.fail("readCheckpoint");
    await expect(vault.prepareRound(ID, 1, saltA())).rejects.toThrow(/injected/);
    const idx = await store.getIndex(ID, 1);
    expect([idx.saltHex, idx.derivationIssued]).toEqual([DEV.saltAHex, false]);
    const keys = await vault.prepareRound(ID, 1, saltA());
    expect(keys.chainIndex).toBe(1);
  });

  it("marking the issue fails after the keys were built: the keys are disposed, never returned", async () => {
    const store = new FaultyStore(await devStore());
    const vault = newVault(store);
    await vault.reserveRound(ID, "r1");
    const dispose = vi.spyOn(RoundDerivation.prototype, "dispose");
    store.fail("markDerivationIssued", "before");
    await expect(vault.prepareRound(ID, 1, saltA())).rejects.toThrow(/injected/);
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
    expect((await store.getIndex(ID, 1)).derivationIssued).toBe(false);
  });

  it("ambiguous issue (recorded, then the audit fails): keys disposed; the index must be classified", async () => {
    const audit = new FailingAudit();
    const vault = newVault(await devStore(), { audit });
    await vault.reserveRound(ID, "r1");
    audit.failOn("derivation-issued");
    const dispose = vi.spyOn(RoundDerivation.prototype, "dispose");
    await expectCode(vault.prepareRound(ID, 1, saltA()), "audit-failed");
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
    await expectCode(vault.prepareRound(ID, 1, saltA()), "derivation-already-issued");
    const rec = await vault.classifyRound(ID, 1, "indeterminate", "audit-unavailable");
    expect(rec.disposition).toBe("indeterminate");
    expect((await vault.reserveRound(ID, "r2")).chainIndex).toBe(2);
  });
});

describe("reveal failures (tests 14, 15)", () => {
  it("failure before reveal (test 14): a replacement vault on the same store reveals later", async () => {
    const store = await devStore();
    const first = newVault(store);
    await first.reserveRound(ID, "r1");
    (await first.prepareRound(ID, 1, saltA())).dispose();
    await first.classifyRound(ID, 1, "completed", "terminal-state");
    first.dispose(); // the vault is lost before revealing
    const second = newVault(store);
    expect((await second.revealRound(ID, 1)).seed).toBe(DEV.linksHex[1]);
  });

  it.each(["revealNeighbours", "recordReveal"] as const)(
    "failure during reveal in %s (test 15): nothing recorded, retry succeeds",
    async (method) => {
      const store = new FaultyStore(await devStore());
      const vault = newVault(store);
      await vault.reserveRound(ID, "r1");
      await vault.classifyRound(ID, 1, "aborted", "before-outcomes");
      store.fail(method);
      await expect(vault.revealRound(ID, 1)).rejects.toThrow(/injected/);
      expect((await store.getIndex(ID, 1)).reveal).toBeNull();
      expect((await vault.chainStatus(ID)).state).toBe("active");
      expect((await vault.revealRound(ID, 1)).seed).toBe(DEV.linksHex[1]);
    },
  );

  it("ambiguous reveal (recorded, then failed): the retry is a replay with identical data", async () => {
    const store = new FaultyStore(await devStore());
    const vault = newVault(store);
    await vault.reserveRound(ID, "r1");
    await vault.classifyRound(ID, 1, "aborted", "before-outcomes");
    store.fail("recordReveal", "after");
    await expect(vault.revealRound(ID, 1)).rejects.toThrow(/after the store call/);
    expect((await store.getIndex(ID, 1)).reveal?.seedHex).toBe(DEV.linksHex[1]);
    expect((await vault.revealRound(ID, 1)).seed).toBe(DEV.linksHex[1]);
    const kinds = (vault.audit as MemoryAuditSink).events().map((e) => e.kind);
    expect(kinds.at(-1)).toBe("reveal-replayed");
  });
});

describe("process restart (test 16)", () => {
  const child = (args: string[]) => {
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(SERVER, "test", "fairness", "fixtures", "restart-child.ts"),
        ...args,
      ],
      { cwd: SERVER, encoding: "utf8", timeout: 60_000, env: { ...process.env, NODE_ENV: "test" } },
    );
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(r.stdout) as Record<string, unknown>;
  };

  it("a second process cannot see, resume or reuse the first process's chain", () => {
    const first = child(["create"]);
    expect(first.reserved).toEqual([1, 2, 3]);
    const second = child(["resume", first.chainId as string]);
    expect(second).toMatchObject({
      reserve: "unknown-chain",
      prepare: "unknown-chain",
      reveal: "unknown-chain",
      status: "unknown-chain",
    });
    // A new chain needs the explicit workflow and is a different chain (fresh secure seed).
    expect(second.freshChainId).not.toBe(first.chainId);
    expect(second.freshFirstIndex).toBe(1);
  }, 120_000);
});
