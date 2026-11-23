// Secret handling (P8-3c-2, tests 18, 19, 21) and source-level rules for server/src/fairness.
// The development chain's links x_1 … x_8 are known to the test, so every rendering of every
// object the vault, store, records, audit and errors produce can be searched for them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REDACTED } from "../../src/fairness";
import { AUDIT_EVENT_KINDS, MemoryAuditSink, assertAuditEvent } from "../../src/fairness/audit";
import { ChainError } from "../../src/fairness/errors";
import {
  RECORD_FIELDS,
  chainCommitmentRecord,
  roundRevealRecord,
  type FairnessRecord,
} from "../../src/fairness/records";
import {
  DEV,
  DEV_CHAIN_ID,
  FaultyStore,
  devStore,
  expectCode,
  newVault,
  renderings,
  saltA,
} from "../helpers/fairness";

const ID = DEV_CHAIN_ID;
const FAIRNESS_SRC = fileURLToPath(new URL("../../src/fairness", import.meta.url));

/** Indices of development links found anywhere in `texts`. */
const linksIn = (texts: string[]): number[] => {
  const all = texts.join("\n");
  return DEV.linksHex.flatMap((hex, i) => (i > 0 && all.includes(hex) ? [i] : []));
};

describe("no secret material in any output (tests 18, 21)", () => {
  it("before any reveal nothing shows a chain link; after revealing j only x_1 … x_j appear", async () => {
    const store = new FaultyStore(await devStore(3));
    const vault = newVault(store);
    const outputs: unknown[] = [vault, store, store.inner];
    for (let i = 1; i <= 5; i++) {
      outputs.push(await vault.reserveRound(ID, `r${i}`));
      const keys = await vault.prepareRound(ID, i, saltA());
      outputs.push(keys, keys.derivation, keys.derivation.openStream("crash"));
      outputs.push(await vault.classifyRound(ID, i, "completed", "terminal-state"));
      outputs.push(await store.getIndex(ID, i), await store.getChain(ID));
      keys.dispose();
    }
    await vault.precompute(ID, 6, 3); // future seeds now sit in the vault's cache
    outputs.push(vault, await vault.chainStatus(ID));
    const errors: unknown[] = [];
    for (const run of [
      () => vault.revealRound(ID, 6),
      () => vault.prepareRound(ID, 1, saltA()),
      () => vault.reserveRound(ID, "bad id"),
      () => store.inner.recordReveal(ID, 9, new Uint8Array(32), new Uint8Array(32)),
    ]) {
      try {
        await run();
      } catch (e) {
        errors.push(e);
      }
    }
    expect(errors).toHaveLength(4);
    const audit = (vault.audit as MemoryAuditSink).events();
    const texts = [...outputs, ...errors, audit].flatMap(renderings);
    expect(linksIn(texts)).toEqual([]);

    const reveals = [];
    for (let j = 1; j <= 3; j++) reveals.push(await vault.revealRound(ID, j));
    const after = [...reveals, vault, store, (vault.audit as MemoryAuditSink).events()].flatMap(
      renderings,
    );
    // x_1 … x_3 are now public; x_4 … x_8 (live, precomputed or future) never appear.
    expect(linksIn(after)).toEqual([1, 2, 3]);
  });

  it("vault, store and round keys render as redacted markers", async () => {
    const store = await devStore();
    const vault = newVault(store);
    await vault.reserveRound(ID, "r1");
    const keys = await vault.prepareRound(ID, 1, saltA());
    expect(JSON.stringify(vault)).toBe('{"vault":"ChainVault"}');
    expect(JSON.stringify(keys)).toBe(
      JSON.stringify({ chainId: ID, chainIndex: 1, salt: DEV.saltAHex }),
    );
    expect(renderings(vault).join()).toMatch(/redacted/);
    expect(renderings(keys).join()).toMatch(/redacted/);
    expect(renderings(store).join()).toMatch(/redacted/);
    const checkpoint = await store.readCheckpoint(ID, 3);
    expect(renderings(checkpoint).every((t) => t === "" || t.includes(REDACTED))).toBe(true);
    expect(linksIn(renderings(checkpoint))).toEqual([]);
    checkpoint.dispose();
    await expectCode(() => checkpoint.reveal(), "secret-disposed");
    keys.dispose();
  });
});

describe("records are allow-listed", () => {
  it("every record kind has exactly its allow-listed primitive fields", async () => {
    const vault = newVault(await devStore());
    const records: FairnessRecord[] = [];
    records.push(await vault.reserveRound(ID, "r1"));
    const keys = await vault.prepareRound(ID, 1, saltA());
    keys.dispose();
    records.push(await vault.classifyRound(ID, 1, "completed", "terminal-state"));
    records.push(await vault.revealRound(ID, 1));
    records.push(await vault.chainStatus(ID));
    const kinds = new Set(records.map((r) => r.kind));
    expect(kinds).toEqual(
      new Set(["round-reservation", "round-disposition", "round-reveal", "chain-status"]),
    );
    for (const r of records) {
      expect(Object.keys(r)).toEqual(RECORD_FIELDS[r.kind]);
      expect(Object.isFrozen(r)).toBe(true);
      expect(r.status).toBe("experimental-internal");
    }
  });

  it("builders refuse states they cannot describe", () => {
    const chain = {
      chainId: ID,
      fv: 1,
      length: 8,
      checkpointInterval: 3,
      state: "active" as const,
      lastReservedIndex: 1,
      revealedCount: 0,
    };
    const open = {
      chainId: ID,
      index: 1,
      requestId: "r1",
      saltHex: null,
      derivationIssued: false,
      disposition: null,
      dispositionHistory: [],
      reveal: null,
    };
    expect(() => roundRevealRecord(chain, open)).toThrow(TypeError);
    expect(Object.keys(chainCommitmentRecord(chain))).toEqual(RECORD_FIELDS["chain-commitment"]);
  });
});

describe("audit trail", () => {
  it("is explicitly neither durable nor tamper-evident", () => {
    expect(new MemoryAuditSink().guarantees).toEqual({ durable: false, tamperEvident: false });
  });

  it("accepts only the allow-listed shape (no free text, no extra field)", () => {
    const good = {
      kind: "index-reserved",
      operation: "reserve-round",
      chainId: ID,
      chainIndex: 1,
      code: null,
    } as const;
    expect(() => assertAuditEvent(good)).not.toThrow();
    const bad = [
      { ...good, kind: "seed-dump" },
      { ...good, operation: "Reserve Round" },
      { ...good, chainId: "xyz" },
      { ...good, chainIndex: -1 },
      { ...good, code: DEV.linksHex[4] + "-and-more-text-than-a-code-may-hold-overall" },
      { ...good, extra: DEV.linksHex[4] },
      { ...good, code: "Free text" },
    ];
    for (const b of bad) expect(() => assertAuditEvent(b as never)).toThrow(ChainError);
    expect(AUDIT_EVENT_KINDS).toContain("operation-failed");
  });

  it("records every step of a round in order, with sequence numbers and a clock", async () => {
    let t = 1000;
    const audit = new MemoryAuditSink(() => t++);
    const vault = newVault(await devStore(), { audit });
    await vault.reserveRound(ID, "r1");
    (await vault.prepareRound(ID, 1, saltA())).dispose();
    await vault.classifyRound(ID, 1, "completed", "terminal-state");
    await vault.revealRound(ID, 1);
    const events = audit.events();
    expect(events.map((e) => [e.seq, e.at, e.kind, e.chainIndex, e.code])).toEqual([
      [1, 1000, "index-reserved", 1, null],
      [2, 1001, "salt-bound", 1, null],
      [3, 1002, "derivation-issued", 1, null],
      [4, 1003, "round-classified", 1, "completed"],
      [5, 1004, "reveal-recorded", 1, null],
    ]);
    expect(Object.isFrozen(events) && events.every((e) => Object.isFrozen(e))).toBe(true);
  });
});

describe("source rules for server/src/fairness", () => {
  const files = readdirSync(FAIRNESS_SRC).filter((f) => f.endsWith(".ts"));
  const code = (f: string) =>
    readFileSync(join(FAIRNESS_SRC, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("the module set is exactly the authorized one", () => {
    expect(files.sort()).toEqual(
      [
        "audit.ts",
        "chain-store.ts",
        "chain-vault.ts",
        "checkpoints.ts",
        "crypto-node.ts",
        "errors.ts",
        "memory-chain-store.ts",
        "records.ts",
        "reveal.ts",
        "round-keys.ts",
      ].sort(),
    );
  });

  it.each(files)("%s uses no forbidden facility", (file) => {
    const src = code(file);
    const forbidden: [string, RegExp][] = [
      ["Math.random", /Math\s*\.\s*random/],
      ["console / logging", /\bconsole\b|\.log\s*\(|\blogger\b/],
      ["network", /\b(fetch|XMLHttpRequest|WebSocket|fastify)\b/i],
      ["file system", /node:fs|\bwriteFile|\breadFile/],
      ["eval", /\beval\s*\(|\bnew\s+Function\b/],
      ["engine / seeded round / UI", /engine|seeded-round|rendering|\bui\b|audio|protocol|zod/],
      ["Buffer leaking out", /\.toString\(\s*["'](hex|base64)/],
    ];
    for (const [name, re] of forbidden) expect(re.test(src), `${file} uses ${name}`).toBe(false);
  });

  it("only crypto-node.ts touches node:crypto, and only memory-chain-store.ts reads the environment", () => {
    for (const f of files) {
      expect(/node:crypto/.test(code(f)), f).toBe(f === "crypto-node.ts");
      expect(/\bprocess\b/.test(code(f)), f).toBe(f === "memory-chain-store.ts");
    }
  });
});
