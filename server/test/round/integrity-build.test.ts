// Build integrity against SOURCE changes (P8-4a-1; owner decisions I1, I4, I7). PLAY MONEY ONLY.
//
// Each case copies the protected sources and build inputs of this working tree into its own
// temporary repository (with a junction to this package's node_modules), applies one change, and
// runs the real build steps there: `tsc -p tsconfig.build.json`, `scripts/build-engine.mjs` and
// `scripts/engine-integrity.mjs verify` against the copied TRUSTED manifest.
//
// - Unchanged sources rebuild to exactly the trusted manifest from another directory.
// - Line endings (all protected sources CRLF) and comment- or whitespace-only engine edits do not
//   change the protected output, so they neither need a manifest update nor change gameplay.
// - The 200× → 30× clamp edit in src/engine is refused: the build fails, names the bundle, removes
//   it, and leaves the trusted manifest untouched. A fairness source change that alters compiled
//   output is refused the same way: it needs an explicit, reviewed manifest update.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { REPO_DIR } from "../../scripts/build-engine.mjs";
import { SERVER } from "../helpers/engine-build";

const COPIED = [
  "package.json",
  "src/engine",
  "src/shared",
  "src/seeded-round",
  "src/fairness",
  "src/protocol",
  "server/src",
  "server/engine",
  "server/scripts",
  "server/integrity",
  "server/package.json",
  "server/tsconfig.json",
  "server/tsconfig.build.json",
];
const roots: string[] = [];

afterAll(() => {
  for (const r of roots) {
    rmSync(join(r, "server", "node_modules"), { force: true }); // the junction first
    rmSync(r, { recursive: true, force: true });
  }
});

function buildCopy(mutate: (repo: string) => void) {
  const repo = mkdtempSync(join(tmpdir(), "aquadive-p8-4a-1-source-"));
  roots.push(repo);
  for (const p of COPIED) cpSync(join(REPO_DIR, p), join(repo, p), { recursive: true });
  symlinkSync(join(SERVER, "node_modules"), join(repo, "server", "node_modules"), "junction");
  mutate(repo);
  const server = join(repo, "server");
  const manifest = join(server, "integrity", "engine-manifest.json");
  const before = readFileSync(manifest, "utf8");
  const run = (args: string[]) =>
    spawnSync(process.execPath, args, { cwd: server, encoding: "utf8", timeout: 240_000 });
  const tsc = run([join("node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json"]);
  expect(tsc.status, `${tsc.stdout}${tsc.stderr}`).toBe(0);
  const bundle = run([join("scripts", "build-engine.mjs")]);
  expect(bundle.status, bundle.stderr).toBe(0);
  const verify = run([join("scripts", "engine-integrity.mjs"), "verify"]);
  return {
    status: verify.status,
    problems: `${verify.stdout}${verify.stderr}`
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^(changed|missing|unexpected):/.test(l)),
    output: `${verify.stdout}${verify.stderr}`,
    bundlePresent: existsSync(join(server, "dist", "engine", "engine.cjs")),
    manifestUnchanged: readFileSync(manifest, "utf8") === before,
  };
}

const edit = (file: string, a: string, b: string) => {
  const text = readFileSync(file, "utf8");
  expect(text.split(a).length - 1, `${file}: ${a}`).toBe(1);
  writeFileSync(file, text.replace(a, b));
};
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );
const OUTCOMES = (repo: string) => join(repo, "src", "engine", "domain", "outcomes.ts");
const TIMEOUT = 300_000;

describe("trusted manifest against source changes (real builds in copies)", () => {
  it(
    "unchanged sources rebuild to exactly the trusted manifest in another directory",
    () => {
      const r = buildCopy(() => {});
      expect(r.status, r.output).toBe(0);
      expect(r.problems).toEqual([]);
      expect(r.bundlePresent).toBe(true);
      expect(r.manifestUnchanged).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "CRLF line endings in every protected source leave the protected output unchanged",
    () => {
      let converted = 0;
      const r = buildCopy((repo) => {
        for (const dir of [
          "src/engine",
          "src/shared",
          "src/seeded-round",
          "src/fairness",
          "server/src",
          "server/engine",
        ]) {
          for (const f of walk(join(repo, dir)).filter((x) => x.endsWith(".ts"))) {
            const t = readFileSync(f, "utf8");
            const crlf = t.replace(/\r?\n/g, "\r\n");
            if (crlf !== t) converted += 1;
            writeFileSync(f, crlf);
          }
        }
      });
      expect(converted).toBeGreaterThan(50);
      expect(r.status, r.output).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "comment- and whitespace-only engine edits leave the bundle unchanged (no update, no gameplay change)",
    () => {
      const r = buildCopy((repo) => {
        edit(OUTCOMES(repo), "// 3% house edge style", "// 3% house edge style (comment only)");
        edit(OUTCOMES(repo), "const m = 0.99 / (1 - u);", "const m   =   0.99 / (1 - u);");
      });
      expect(r.status, r.output).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "the 200× → 30× clamp edit is refused: build fails, bundle removed, trusted manifest untouched",
    () => {
      const r = buildCopy((repo) => edit(OUTCOMES(repo), "Math.min(m, 200)", "Math.min(m, 30)"));
      expect(r.status).toBe(1);
      expect(r.problems).toEqual(["changed: engine/engine.cjs"]);
      expect(r.output).toContain("the engine bundle was removed");
      expect(r.output).not.toMatch(/[0-9a-f]{16}/);
      expect(r.bundlePresent).toBe(false);
      expect(r.manifestUnchanged).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "a fairness source change that alters compiled output needs a reviewed manifest update",
    () => {
      const r = buildCopy((repo) => {
        const f = join(repo, "src", "fairness", "derive.ts");
        writeFileSync(f, `// a reviewed-looking comment\n${readFileSync(f, "utf8")}`);
      });
      expect(r.status).toBe(1);
      expect(r.problems).toEqual(["changed: src/fairness/derive.js"]);
      expect(r.bundlePresent).toBe(false);
      expect(r.manifestUnchanged).toBe(true);
    },
    TIMEOUT,
  );
});
