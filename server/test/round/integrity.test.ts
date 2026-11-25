// Build integrity rules, source level (P8-4a-1; owner decisions I1 – I4, I8). PLAY MONEY ONLY.
//
// The manifest schema and its canonical form, the protected-set rules on small fake builds in
// temporary directories, the agreement of the build tool (scripts/engine-integrity.mjs, which
// runs none of the build's code) with src/round/integrity.ts, and fixed-code errors. The
// compiled loader against real builds is covered by round-runtime.test.ts.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as tool from "../../scripts/engine-integrity.mjs";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import {
  INTEGRITY_SCHEMA,
  PROTECTED_DIRECTORIES,
  PROTECTED_PATH,
  PROTECTED_SINGLE_FILES,
  computeIntegrityManifest,
  listProtectedFiles,
  parseIntegrityManifest,
  serializeIntegrityManifest,
  verifyBuildIntegrity,
  type IntegrityManifest,
} from "../../src/round/integrity";
import { RoundScriptError } from "../../src/round/errors";

const hash = createNodeFairnessCrypto().hash;
let tmp = "";
let dist = "";

const FILES: Record<string, string> = {
  "engine/engine.cjs": "'use strict';\nexports.x = 1;\n",
  "server/src/fairness.js": "'use strict';\n",
  "server/src/fairness/audit.js": "'use strict';\n// audit\n",
  "server/src/prep/protocol.js": "'use strict';\n// prep protocol\n",
  "server/src/round/engine-runtime.js": "'use strict';\n// loader\n",
  "server/src/round/integrity.js": "'use strict';\n// integrity\n",
  "server/src/round/prepare.js": "'use strict';\n// prepare\n",
  "server/src/scheduler/core.js": "'use strict';\n// scheduler core\n",
  "src/fairness/index.js": "'use strict';\n// fairness\n",
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-4a-1-integrity-"));
  dist = join(tmp, "dist");
  for (const [p, text] of Object.entries(FILES)) {
    const abs = join(dist, ...p.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, text);
  }
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const reasonOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(RoundScriptError);
    const err = e as RoundScriptError;
    expect(err.code).toBe("runtime-integrity-failed");
    expect(err.message).toBe(`runtime-integrity-failed: ${err.reason}`);
    expect("cause" in err).toBe(false);
    return err.reason;
  }
};
const text = (m: IntegrityManifest) => serializeIntegrityManifest(m);

describe("manifest schema and canonical form", () => {
  it("a computed manifest is canonical, sorted, and round-trips", () => {
    const m = computeIntegrityManifest(dist, hash);
    expect(m.files.map((f) => f.path)).toEqual(Object.keys(FILES).sort());
    expect(m.files[0]).toEqual({
      path: "engine/engine.cjs",
      bytes: Buffer.byteLength(FILES["engine/engine.cjs"]!),
      sha256: createHash("sha256").update(FILES["engine/engine.cjs"]!).digest("hex"),
    });
    const t = text(m);
    expect(t.endsWith("}\n")).toBe(true);
    expect(parseIntegrityManifest(t)).toEqual(m);
  });

  it.each([
    ["not JSON", (t: string) => t.slice(1), "manifest-malformed"],
    ["CRLF line endings", (t: string) => t.replace(/\n/g, "\r\n"), "manifest-not-canonical"],
    ["no final newline", (t: string) => t.trimEnd(), "manifest-not-canonical"],
    ["re-indented", (t: string) => JSON.stringify(JSON.parse(t)), "manifest-not-canonical"],
    [
      "a duplicate key",
      (t: string) =>
        t.replace(
          '  "algorithm": "sha256",\n',
          '  "algorithm": "sha256",\n  "algorithm": "sha256",\n',
        ),
      "manifest-not-canonical",
    ],
    ["another schema", (t: string) => t.replace(INTEGRITY_SCHEMA, "other"), "manifest-malformed"],
    [
      "schema version 2",
      (t: string) => t.replace('"schemaVersion": 1', '"schemaVersion": 2'),
      "manifest-malformed",
    ],
    [
      "another algorithm",
      (t: string) => t.replace('"sha256",\n  "files"', '"sha512",\n  "files"'),
      "manifest-malformed",
    ],
  ])("refuses a manifest with %s", (_n, mutate, reason) => {
    const t = text(computeIntegrityManifest(dist, hash));
    expect(reasonOf(() => parseIntegrityManifest(mutate(t)))).toBe(reason);
  });

  type Mutation = readonly [string, (m: Record<string, unknown>) => unknown];
  const MALFORMED: readonly Mutation[] = [
    ["an extra top-level field", (m: Record<string, unknown>) => ({ ...m, note: "x" })],
    ["reordered keys", (m: Record<string, unknown>) => ({ files: m.files, ...m })],
    ["no files", (m: Record<string, unknown>) => ({ ...m, files: [] })],
    [
      "unsorted files",
      (m: Record<string, unknown>) => ({ ...m, files: [...(m.files as unknown[])].reverse() }),
    ],
    [
      "a duplicate file",
      (m: Record<string, unknown>) => ({
        ...m,
        files: [...(m.files as unknown[]), (m.files as unknown[]).at(-1)],
      }),
    ],
    ...[
      "../escape.js",
      "/abs/x.js",
      "engine\\engine.cjs",
      "server/src/round/../../x.js",
      "server/src/round/sub/x.js",
      "server/src/http/routes.js",
      "src/protocol/index.js",
      "engine/engine.js",
      "server/src/round/X.js",
    ].map(
      (p) =>
        [
          `the unprotected or traversing path ${p}`,
          (m: Record<string, unknown>) => ({
            ...m,
            files: [{ path: p, bytes: 1, sha256: "0".repeat(64) }, ...(m.files as unknown[])],
          }),
        ] as Mutation,
    ),
    [
      "a non-hex digest",
      (m: Record<string, unknown>) => ({
        ...m,
        files: (m.files as { path: string }[]).map((f, i) =>
          i === 0 ? { ...f, sha256: "Z".repeat(64) } : f,
        ),
      }),
    ],
    [
      "a zero size",
      (m: Record<string, unknown>) => ({
        ...m,
        files: (m.files as { path: string }[]).map((f, i) => (i === 0 ? { ...f, bytes: 0 } : f)),
      }),
    ],
    [
      "an extra file field",
      (m: Record<string, unknown>) => ({
        ...m,
        files: (m.files as { path: string }[]).map((f, i) => (i === 0 ? { ...f, mode: 420 } : f)),
      }),
    ],
  ];
  it.each(MALFORMED)("refuses a manifest with %s", (_n, mutate) => {
    const m = JSON.parse(text(computeIntegrityManifest(dist, hash)));
    const t = `${JSON.stringify(mutate(m), null, 2)}\n`;
    expect(reasonOf(() => parseIntegrityManifest(t))).toBe("manifest-malformed");
  });

  it("refuses a manifest without a required file", () => {
    const t = text(computeIntegrityManifest(dist, hash));
    expect(reasonOf(() => parseIntegrityManifest(t, ["server/src/round/missing.js"]))).toBe(
      "manifest-incomplete",
    );
    expect(reasonOf(() => parseIntegrityManifest(t, Object.keys(FILES)))).toBeNull();
  });
});

describe("protected set on a build", () => {
  const verify = (m: IntegrityManifest) => reasonOf(() => verifyBuildIntegrity(dist, m, hash));

  it("an unchanged build verifies; any changed byte, size, missing or extra file does not", () => {
    const m = computeIntegrityManifest(dist, hash);
    expect(verify(m)).toBeNull();
    const file = join(dist, "server", "src", "round", "prepare.js");
    writeFileSync(file, FILES["server/src/round/prepare.js"]!.replace("prepare", "prepar3"));
    expect(verify(m)).toBe("digest-mismatch");
    writeFileSync(file, `${FILES["server/src/round/prepare.js"]!}\n`);
    expect(verify(m)).toBe("size-mismatch");
    rmSync(file);
    expect(verify(m)).toBe("file-missing");
    writeFileSync(file, FILES["server/src/round/prepare.js"]!);
    expect(verify(m)).toBeNull();
    writeFileSync(join(dist, "src", "fairness", "extra.js"), "x");
    expect(verify(m)).toBe("unexpected-file");
  });

  it("refuses unexpected entries: other file types, odd names, subdirectories", () => {
    for (const bad of ["engine/notes.txt", "server/src/round/Upper.js", "src/fairness/a.mjs"]) {
      writeFileSync(join(dist, ...bad.split("/")), "x");
      expect(
        reasonOf(() => listProtectedFiles(dist)),
        bad,
      ).toBe("unexpected-file");
      rmSync(join(dist, ...bad.split("/")));
    }
    mkdirSync(join(dist, "server", "src", "fairness", "sub"));
    expect(reasonOf(() => listProtectedFiles(dist))).toBe("unexpected-file");
  });

  it("refuses a missing protected directory", () => {
    rmSync(join(dist, "src", "fairness"), { recursive: true });
    expect(reasonOf(() => listProtectedFiles(dist))).toBe("protected-directory-invalid");
  });

  it("protects the offline preparation worker directory (owner-approved P8-4b-0 expansion)", () => {
    expect(PROTECTED_DIRECTORIES).toEqual([
      "engine",
      "server/src/fairness",
      "server/src/prep",
      "server/src/round",
      "server/src/scheduler",
      "src/fairness",
    ]);
    for (const p of ["controller", "prep-worker", "protocol"]) {
      expect(PROTECTED_PATH.test(`server/src/prep/${p}.js`), p).toBe(true);
    }
    expect(PROTECTED_PATH.test("server/src/prep/sub/x.js")).toBe(false);
    const m = computeIntegrityManifest(dist, hash);
    writeFileSync(join(dist, "server", "src", "prep", "extra.js"), "x");
    expect(reasonOf(() => verifyBuildIntegrity(dist, m, hash))).toBe("unexpected-file");
    rmSync(join(dist, "server", "src", "prep"), { recursive: true });
    expect(reasonOf(() => listProtectedFiles(dist))).toBe("protected-directory-invalid");
  });

  it("protects the offline Global Round Scheduler directory (owner-approved P8-4b-2 expansion)", () => {
    for (const p of [
      "clock",
      "core",
      "disclosure",
      "events",
      "scheduler",
      "sealed",
      "source",
      "timeline",
    ]) {
      expect(PROTECTED_PATH.test(`server/src/scheduler/${p}.js`), p).toBe(true);
    }
    expect(PROTECTED_PATH.test("server/src/scheduler/sub/x.js")).toBe(false);
    expect(PROTECTED_PATH.test("server/src/scheduler/core.ts")).toBe(false);
    const m = computeIntegrityManifest(dist, hash);
    expect(verifyBuildIntegrity(dist, m, hash)).toBeUndefined();
    writeFileSync(join(dist, "server", "src", "scheduler", "extra.js"), "x");
    expect(reasonOf(() => verifyBuildIntegrity(dist, m, hash))).toBe("unexpected-file");
    rmSync(join(dist, "server", "src", "scheduler", "extra.js"));
    writeFileSync(
      join(dist, "server", "src", "scheduler", "core.js"),
      "'use strict';\n// scheduler CORE\n",
    );
    expect(reasonOf(() => verifyBuildIntegrity(dist, m, hash))).toBe("digest-mismatch");
    rmSync(join(dist, "server", "src", "scheduler"), { recursive: true });
    expect(reasonOf(() => listProtectedFiles(dist))).toBe("protected-directory-invalid");
  });

  it("files outside the protected set are not part of it", () => {
    mkdirSync(join(dist, "server", "src", "http"), { recursive: true });
    writeFileSync(join(dist, "server", "src", "http", "routes.js"), "x");
    mkdirSync(join(dist, "qa"));
    writeFileSync(join(dist, "qa", "test-only.cjs"), "x");
    expect(listProtectedFiles(dist)).toEqual(Object.keys(FILES).sort());
  });
});

describe("the build tool agrees with src/round/integrity.ts and never writes the manifest", () => {
  it("same rules", () => {
    expect(tool.SCHEMA).toBe(INTEGRITY_SCHEMA);
    expect(tool.SCHEMA_VERSION).toBe(1);
    expect(tool.PROTECTED_DIRECTORIES).toEqual([...PROTECTED_DIRECTORIES]);
    expect(tool.PROTECTED_SINGLE_FILES).toEqual([...PROTECTED_SINGLE_FILES]);
    expect(tool.PROTECTED_PATH.source).toBe(PROTECTED_PATH.source);
  });

  it("the same canonical candidate text, computed independently (node:crypto)", () => {
    expect(tool.candidateManifestText(dist)).toBe(text(computeIntegrityManifest(dist, hash)));
    expect(tool.listProtectedFiles(dist)).toEqual(listProtectedFiles(dist));
  });

  it("verify: an exact match passes; a changed, missing or extra file and any manifest edit fail", () => {
    const trusted = join(tmp, "trusted.json");
    writeFileSync(trusted, tool.candidateManifestText(dist));
    expect(tool.verifyAgainstTrusted(dist, trusted)).toEqual([]);
    writeFileSync(join(dist, "engine", "engine.cjs"), "'use strict';\nexports.x = 2;\n");
    expect(tool.verifyAgainstTrusted(dist, trusted)).toEqual(["changed: engine/engine.cjs"]);
    writeFileSync(join(dist, "engine", "engine.cjs"), FILES["engine/engine.cjs"]!);
    writeFileSync(join(dist, "server", "src", "round", "extra.js"), "x");
    expect(tool.verifyAgainstTrusted(dist, trusted)).toEqual([
      "unexpected: server/src/round/extra.js",
    ]);
    rmSync(join(dist, "server", "src", "round", "extra.js"));
    rmSync(join(dist, "src", "fairness", "index.js"));
    expect(tool.verifyAgainstTrusted(dist, trusted)).toEqual(["missing: src/fairness/index.js"]);
    writeFileSync(join(dist, "src", "fairness", "index.js"), FILES["src/fairness/index.js"]!);
    writeFileSync(trusted, readFileSync(trusted, "utf8").replace(/\n/g, "\r\n"));
    expect(tool.verifyAgainstTrusted(dist, trusted)).toEqual([
      "the trusted manifest is not in canonical form",
    ]);
    expect(tool.verifyAgainstTrusted(dist, join(tmp, "absent.json"))).toEqual([
      "the trusted manifest is missing",
    ]);
    // No digest ever appears in a problem.
    expect(tool.verifyAgainstTrusted(dist, trusted).join(" ")).not.toMatch(/[0-9a-f]{16}/);
  });

  it("no build script writes the trusted manifest; the tool has no write call except the bundle removal", () => {
    const toolText = readFileSync(join(tool.SERVER_DIR, "scripts", "engine-integrity.mjs"), "utf8");
    const buildText = readFileSync(join(tool.SERVER_DIR, "scripts", "build-engine.mjs"), "utf8");
    expect(toolText).not.toMatch(/\b(writeFile|appendFile|copyFile|rename|mkdir)\w*\(/);
    expect(toolText.match(/\brmSync\(/g)).toHaveLength(1);
    expect(buildText).not.toMatch(/integrity/);
    const pkg = JSON.parse(readFileSync(join(tool.SERVER_DIR, "package.json"), "utf8"));
    expect(pkg.scripts.build).toBe(
      "npm run clean && tsc -p tsconfig.build.json && node scripts/build-engine.mjs && node scripts/engine-integrity.mjs verify",
    );
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/candidate\s*>|engine-manifest\.json/);
    expect(statSync(tool.TRUSTED_MANIFEST).isFile()).toBe(true);
  });
});
