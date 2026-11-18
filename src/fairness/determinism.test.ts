// Determinism across independent executions (P8-3a §5): separate Node processes, running this
// module unmodified through Node's built-in type stripping, produce byte-identical output, equal
// to the in-process result, with both node:crypto and the pure-TypeScript SHA-256.
// Scope: same machine and Node major only. This is not a cross-engine determinism claim (D4).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nodeHashProvider } from "./test/node-provider.ts";
import { referenceHashProvider } from "./test/sha256-reference.ts";
import { dumpAll } from "./test/vector-dump.ts";

const script = fileURLToPath(new URL("./test/vector-dump.ts", import.meta.url));
const runChild = (provider: "node" | "reference") => {
  const r = spawnSync(process.execPath, [script, provider], { encoding: "utf8", timeout: 60_000 });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
};

describe("independent executions", () => {
  it("two child processes and this process agree byte for byte (node:crypto)", () => {
    const a = runChild("node");
    const b = runChild("node");
    expect(a.length).toBeGreaterThan(1000);
    expect(b).toBe(a);
    expect(dumpAll(nodeHashProvider)).toBe(a);
  }, 120_000);

  it("the pure-TypeScript SHA-256 in a child process gives the same output as node:crypto", () => {
    expect(runChild("reference")).toBe(dumpAll(nodeHashProvider));
  }, 120_000);

  it("in-process: both providers agree on every draw of every purpose, index and salt", () => {
    expect(dumpAll(referenceHashProvider)).toBe(dumpAll(nodeHashProvider));
  }, 120_000);
});
