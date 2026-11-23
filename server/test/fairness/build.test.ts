// CommonJS build integration of the shared fairness source (P8-3c-0).
//
// Builds the server exactly as `npm run build` does (tsconfig.build.json) into a temporary
// directory, plus the original test-only vector dump of src/fairness, and checks:
// - every relative import of the shared fairness source is emitted as `.js`; no `.ts` and no
//   `@/` specifier survives;
// - the fairness implementation exists once, under src/fairness/, and nowhere in the server;
// - the two import-extension options change nothing for code without `.ts` imports (the
//   existing server and protocol output is byte-identical with and without them);
// - at run time the compiled code loads no `.ts` file and nothing outside the build, and the
//   full per-purpose dump of every development round is byte-identical between the original
//   type-stripped source, the compiled source, and the compiled source on the server adapter.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const REPO = join(SERVER, "..");
const TSC = join(SERVER, "node_modules", "typescript", "bin", "tsc");
/** sha256 of the full development dump (P8-3a/P8-3b record; docs/15). */
const DUMP_SHA256 = "9a5c227e52494f3c91c550ac27465f7ff22f32bff3a3f971018732f23c28afdb";

const posix = (p: string) => p.split(sep).join("/");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

let tmp = "";
let out = "";

/** Writes a temporary tsconfig (outside server/, so `@types` is located explicitly) and runs tsc. */
function build(
  name: string,
  config: { compilerOptions: Record<string, unknown> } & Record<string, unknown>,
): { status: number | null; output: string } {
  const file = join(tmp, `${name}.json`);
  const typeRoots = [join(SERVER, "node_modules", "@types")];
  writeFileSync(
    file,
    JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, typeRoots } }),
  );
  const r = spawnSync(process.execPath, [TSC, "-p", file], { encoding: "utf8", timeout: 120_000 });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-3c-build-"));
  out = join(tmp, "full");
  const r = build("full", {
    extends: join(SERVER, "tsconfig.build.json"),
    compilerOptions: { outDir: out, rootDir: REPO },
    include: [
      posix(join(SERVER, "src", "**", "*.ts")),
      posix(join(REPO, "src", "fairness", "test", "vector-dump.ts")),
    ],
  });
  expect(r.status, r.output).toBe(0);
  // The build lives outside server/, so state the module format the server package declares.
  writeFileSync(join(tmp, "package.json"), '{ "type": "commonjs" }\n');
}, 180_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("emitted CommonJS", () => {
  it("shared fairness imports are rewritten to .js; no .ts or @/ specifier remains", () => {
    const files = walk(out).filter((f) => f.endsWith(".js"));
    const requires = files.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]!),
    );
    expect(requires.filter((s) => /\.ts$/.test(s))).toEqual([]);
    expect(requires.filter((s) => s.startsWith("@/"))).toEqual([]);
    const bridge = readFileSync(join(out, "server", "src", "fairness.js"), "utf8");
    expect([...bridge.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])).toEqual([
      "../../src/fairness/index.js",
    ]);
    const index = readFileSync(join(out, "src", "fairness", "index.js"), "utf8");
    expect(index).toMatch(/require\("\.\/version\.js"\)/);
  });

  it("the fairness implementation is compiled once, from the original source", () => {
    const fairness = walk(join(out, "src", "fairness"))
      .map((f) => posix(relative(join(out, "src", "fairness"), f)))
      .sort();
    expect(fairness.filter((f) => !f.startsWith("test/"))).toEqual(
      [
        "chain",
        "crypto",
        "derive",
        "encoding",
        "index",
        "secret",
        "seeded-rng",
        "vectors",
        "version",
      ]
        .map((n) => `${n}.js`)
        .sort(),
    );
    const tagHolders = walk(out).filter((f) =>
      readFileSync(f, "utf8").includes("AQUADIVE-FAIRNESS"),
    );
    expect(tagHolders.map((f) => posix(relative(out, f)))).toEqual(["src/fairness/encoding.js"]);
    expect(
      walk(out).some((f) => /[\\/]server[\\/].*(chain|derive|encoding|secret)\.js$/.test(f)),
    ).toBe(false);
  });

  it("the import-extension options leave code without .ts imports byte-identical", () => {
    const plainOut = join(tmp, "plain");
    const r = build("plain", {
      extends: join(SERVER, "tsconfig.build.json"),
      compilerOptions: {
        outDir: plainOut,
        rootDir: REPO,
        allowImportingTsExtensions: false,
        rewriteRelativeImportExtensions: false,
      },
      include: [posix(join(SERVER, "src", "main.ts"))],
    });
    expect(r.status, r.output).toBe(0);
    const plain = walk(plainOut);
    expect(plain.length).toBeGreaterThan(25);
    for (const f of plain) {
      const rel = relative(plainOut, f);
      expect(readFileSync(join(out, rel)), rel).toEqual(readFileSync(f));
    }
  }, 180_000);
});

describe("run time", () => {
  const probe = `
"use strict";
const Module = require("node:module");
const path = require("node:path");
const out = process.argv[2];
const seen = new Set();
const resolve = Module._resolveFilename;
Module._resolveFilename = function (...args) { const f = resolve.apply(this, args); seen.add(f); return f; };
const { dumpAll } = require(path.join(out, "src/fairness/test/vector-dump.js"));
const { nodeHashProvider } = require(path.join(out, "src/fairness/test/node-provider.js"));
const { referenceHashProvider } = require(path.join(out, "src/fairness/test/sha256-reference.js"));
const { createNodeFairnessCrypto } = require(path.join(out, "server/src/fairness/crypto-node.js"));
const result = {
  testProvider: dumpAll(nodeHashProvider),
  reference: dumpAll(referenceHashProvider),
  adapter: dumpAll(createNodeFairnessCrypto().hash),
};
const files = [...seen].filter((f) => path.isAbsolute(f));
result.files = files.length;
result.ts = files.filter((f) => /\\.[cm]?ts$/.test(f));
result.outside = files.filter((f) => !f.startsWith(out + path.sep));
process.stdout.write(JSON.stringify(result));
`;

  it("loads only compiled files and reproduces the full development dump on every provider", () => {
    const script = join(tmp, "probe.cjs");
    writeFileSync(script, probe);
    const r = spawnSync(process.execPath, [script, out], { encoding: "utf8", timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
    const result = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(result.ts).toEqual([]);
    expect(result.outside).toEqual([]);
    expect(result.files).toBeGreaterThan(10);

    const original = spawnSync(
      process.execPath,
      [join(REPO, "src", "fairness", "test", "vector-dump.ts"), "node"],
      { encoding: "utf8", timeout: 120_000 },
    );
    expect(original.status, original.stderr).toBe(0);
    expect(createHash("sha256").update(original.stdout).digest("hex")).toBe(DUMP_SHA256);
    expect(result.testProvider).toBe(original.stdout);
    expect(result.reference).toBe(original.stdout);
    expect(result.adapter).toBe(original.stdout);
  }, 180_000);
});
