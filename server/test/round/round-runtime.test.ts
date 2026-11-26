// Offline RoundScript precomputation, compiled run time (P8-4a). PLAY MONEY ONLY; offline only.
//
// Builds the server as `npm run build` does into a temporary directory (plus the TEST-ONLY
// bundles of test/helpers/engine-build.ts) and runs round-probe.cjs in fresh Node processes, with
// Math.random and every browser global poisoned and console output counted:
//
// - the production bundle's surface (K2) and profile (K12); the loader's refusals of missing,
//   unparsable, widened, narrowed, re-profiled, duplicate-fairness, wrong-math and
//   drive-letter-duplicate bundles (fail closed, fixed codes);
// - all 16 replay pins (A1–A8, B1–B8) through ChainVault → RoundKeys → the sealed runner, the
//   independent outcome vectors, an independent recorder + encoder reproducing every RoundScript
//   digest, the A1 / B1 digest candidates, fresh-process reproducibility, reversed order;
// - the offline disposition, fixed-code audit records, chain states (unknown, malformed,
//   suspended, compromised, exhausted, changed mid-preparation), concurrent reservations,
//   injected audit / runner faults, disposal of every derivation and RoundKeys;
// - redaction of scripts, errors, environments and audit records; reveal verification and
//   tamper detection; the analytic tick bound;
// - the run-time construction guard (M-2b): direct JavaScript construction, forged capabilities,
//   selectively throwing / forged / copied / proxied runtimes, unverified crypto, unsupported modes;
// - that the compiled application module loads no round, engine or fairness module.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROUND_SCRIPT_ERROR_CODES } from "../../src/round/errors";
import {
  SERVER,
  TRUSTED_MANIFEST,
  buildQaBundles,
  buildServer,
  writeRehashedManifest,
} from "../helpers/engine-build";

const PROBE = fileURLToPath(new URL("./round-probe.cjs", import.meta.url));
const ENGINE = join("engine", "engine.cjs");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Report = any;

let tmp = "";
let dist = "";
let main: Report;

const probe = (buildDir: string, scenario: string): Report => {
  const run = spawnSync(process.execPath, [PROBE, buildDir, scenario], {
    encoding: "utf8",
    timeout: 240_000,
  });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  const report = JSON.parse(run.stdout);
  // Every probe run: no Math.random, no browser global, no console output.
  expect(report.counters).toEqual({ mathRandom: 0, browser: {}, console: 0 });
  return report;
};

/**
 * A copy of the build whose engine bundle is patched (`patch` must change the text). `manifest`:
 * "trusted" keeps the TRUSTED manifest next to the copy (the integrity check must refuse it);
 * "rehashed" writes a manifest of the patched copy itself — an attacker who rewrote both — so
 * the loader's later defence-in-depth layers are what is tested.
 */
const patched = (
  name: string,
  patch: (code: string) => string | null,
  manifest: "trusted" | "rehashed" = "rehashed",
): string => {
  const copy = join(tmp, name, "dist");
  cpSync(dist, copy, { recursive: true });
  cpSync(join(tmp, "integrity"), join(tmp, name, "integrity"), { recursive: true });
  const file = join(copy, ENGINE);
  const code = readFileSync(file, "utf8");
  const next = patch(code);
  if (next === null) {
    rmSync(file);
  } else {
    expect(next, name).not.toBe(code);
    writeFileSync(file, next);
  }
  writeFileSync(join(tmp, name, "package.json"), '{ "type": "commonjs" }\n');
  if (manifest === "rehashed") writeRehashedManifest(copy);
  return copy;
};
const replaceOnce = (code: string, a: string, b: string) => {
  expect(code.split(a).length - 1, a).toBe(1);
  return code.replace(a, b);
};

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-4a-round-"));
  dist = buildServer(tmp);
  await buildQaBundles(dist);
  main = probe(dist, "main");
}, 300_000);

afterAll(() => {
  if (!tmp) return;
  // Unlink the node_modules junction first, so nothing can reach this package's own files.
  rmSync(join(tmp, "node_modules"), { force: true });
  rmSync(tmp, { recursive: true, force: true });
});

describe("the production bundle and its loader", () => {
  it("exports only the sealed runner, with the approved construction profile", () => {
    expect(main.exports).toEqual({
      ROUND_RUNNER_PROFILE: "object",
      RoundRunnerError: "function",
      runSeededRound: "function",
    });
    expect(main.profile.bundle).toBe(main.profile.expected);
    expect(JSON.parse(main.profile.bundle)).toEqual({
      id: "aquadive-offline-round-runner",
      version: 1,
      fv: 1,
      tickSeconds: 1 / 60,
      bettingTicks: 300,
      impactToBonusTicks: 84,
      maxTotalTicks: 2500,
      terminal: "first-crashed-or-bonus",
      snapshotSchemaVersion: 3,
    });
    expect(main.profile).toMatchObject({
      runtimeFrozen: true,
      verified: true,
      fakeVerified: false,
    });
  });

  it("the runner returns plain, deeply frozen data and refuses a foreign derivation", () => {
    expect(main.production.problems).toEqual([]);
    expect(main.production.keys).not.toContain("engine");
    expect(main.production.foreignDerivation).toEqual({
      name: "RoundRunnerError",
      code: "derivation-unusable",
      reason: null,
      message: "derivation-unusable",
    });
  });

  // Defence in depth: each bundle below comes with a REHASHED manifest (an attacker who rewrote
  // both), so the integrity check passes and the later layer named in the test must refuse it.
  // With the trusted manifest every one of them is refused earlier (`runtime-integrity-failed`,
  // see "build integrity" below).
  it.each([
    ["unparsable", "runtime-unavailable", () => "exports.x = (;\n"],
    [
      "widened (GameEngine exported again)",
      "runtime-incompatible",
      (c: string) => `${c}exports.GameEngine = GameEngine;\n`,
    ],
    [
      "narrowed (profile not exported)",
      "runtime-incompatible",
      (c: string) => replaceOnce(c, "exports.ROUND_RUNNER_PROFILE = ROUND_RUNNER_PROFILE;\n", ""),
    ],
    [
      "re-profiled",
      "runtime-incompatible",
      (c: string) =>
        replaceOnce(
          c,
          '\tid: "aquadive-offline-round-runner",\n\tversion: 1,',
          '\tid: "aquadive-offline-round-runner",\n\tversion: 2,',
        ),
    ],
    [
      "on a second fairness copy",
      "runtime-duplicate-fairness",
      (c: string) =>
        replaceOnce(
          c,
          'require("../src/fairness/index.js")',
          'require("../dup/fairness/index.js")',
        ),
    ],
    [
      "with changed mathematics (known answers)",
      "runtime-known-answer-failed",
      (c: string) => replaceOnce(c, "Math.exp(.085 * tSeconds)", "Math.exp(.0851 * tSeconds)"),
    ],
  ])("refuses a bundle that is %s (%s)", (name, code, patch) => {
    const dir = patched(`load-${name.split(" ")[0]}`, patch as (c: string) => string | null);
    if (code === "runtime-duplicate-fairness") {
      // Outside the protected directories, so the (rehashed) integrity check does not see it.
      cpSync(join(dir, "src", "fairness"), join(dir, "dup", "fairness"), { recursive: true });
    }
    const report = probe(dir, "load");
    expect(report.result).toEqual({
      ok: false,
      name: "RoundScriptError",
      code,
      reason: null,
      message: code,
    });
    expect(report.disposal.liveDerivations).toBe(0);
  });

  it("accepts the unmodified bundle in a fresh process", () => {
    expect(probe(dist, "load").result).toEqual({ ok: true });
  });

  it.skipIf(process.platform !== "win32")(
    "refuses a fairness instance loaded under another drive-letter case (Windows)",
    () => {
      const report = probe(dist, "case");
      expect(report.distinctInstances).toBe(true);
      expect(report.result).toMatchObject({ ok: false, code: "runtime-duplicate-fairness" });
    },
  );
});

describe("build integrity (P8-4a-1, the trusted manifest)", () => {
  /** A copy of the build and its manifest; `mutate` changes either; then the loader runs. */
  const integrityCase = (
    name: string,
    mutate: (copy: string, root: string) => void,
    manifest: "trusted" | "rehashed" = "trusted",
  ): Report => {
    const root = join(tmp, `int-${name}`);
    const copy = join(root, "dist");
    cpSync(dist, copy, { recursive: true });
    cpSync(join(tmp, "integrity"), join(root, "integrity"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{ "type": "commonjs" }\n');
    if (manifest === "rehashed") {
      mutate(copy, root);
      writeRehashedManifest(copy);
    } else {
      mutate(copy, root);
    }
    return probe(copy, "load").result;
  };
  const refused = (reason: string) => ({
    ok: false,
    name: "RoundScriptError",
    code: "runtime-integrity-failed",
    reason,
    message: `runtime-integrity-failed: ${reason}`,
  });
  const edit = (file: string, a: string, b: string) => {
    const text = readFileSync(file, "utf8");
    expect(text.split(a).length - 1, `${file}: ${a}`).toBe(1);
    writeFileSync(file, text.replace(a, b));
  };
  const flipOneByte = (file: string, offset: number) => {
    const bytes = readFileSync(file);
    bytes[offset] = bytes[offset]! ^ 0x01;
    writeFileSync(file, bytes);
  };
  const manifestOf = (root: string) => join(root, "integrity", "engine-manifest.json");

  it("the trusted manifest is canonical, lists exactly the runtime closure, and the clean build matches", () => {
    const text = readFileSync(TRUSTED_MANIFEST, "utf8");
    const m = JSON.parse(text);
    expect(`${JSON.stringify(m, null, 2)}\n`).toBe(text);
    expect(text).not.toContain("\r");
    expect(m.schema).toBe("aquadive.engine-integrity");
    // The round runtime's loaded closure (29 files) plus the offline preparation worker's three
    // compiled components (owner-approved P8-4b-0 expansion; they are not part of this closure)
    // and the offline Global Round Scheduler's eight (owner-approved P8-4b-2 expansion).
    const prep = [
      "server/src/prep/controller.js",
      "server/src/prep/prep-worker.js",
      "server/src/prep/protocol.js",
    ];
    const scheduler = [
      "clock",
      "core",
      "disclosure",
      "events",
      "scheduler",
      "sealed",
      "source",
      "timeline",
    ].map((f) => `server/src/scheduler/${f}.js`);
    expect(main.closure).toHaveLength(29);
    expect(main.closure.some((p: string) => p.startsWith("server/src/prep/"))).toBe(false);
    expect(main.closure.some((p: string) => p.startsWith("server/src/scheduler/"))).toBe(false);
    // + the Isolated Authority Host's four (owner-approved Stage 1 expansion).
    const authority = ["authority-main", "host", "launcher", "protocol"].map(
      (f) => `server/src/authority/${f}.js`,
    );
    expect(main.closure.some((p: string) => p.startsWith("server/src/authority/"))).toBe(false);
    expect(m.files.map((f: Report) => f.path)).toEqual(
      [...main.closure, ...prep, ...scheduler, ...authority].sort(),
    );
    expect(m.files).toHaveLength(44);
    expect(m.files.find((f: Report) => f.path === "engine/engine.cjs").sha256).toBe(
      main.bundleSha256,
    );
    expect(probe(dist, "load").result).toEqual({ ok: true });
  });

  it.each([
    [
      "one byte of the bundle",
      (c: string) => flipOneByte(join(c, ENGINE), 2000),
      "digest-mismatch",
    ],
    [
      "the 200× → 30× clamp (shorter file)",
      (c: string) => edit(join(c, ENGINE), "Math.min(m, 200)", "Math.min(m, 30)"),
      "size-mismatch",
    ],
    [
      "the 200× → 30× clamp (same size)",
      (c: string) => edit(join(c, ENGINE), "Math.min(m, 200)", "Math.min(m,  30)"),
      "digest-mismatch",
    ],
    [
      "compiled shared fairness code",
      (c: string) => flipOneByte(join(c, "src", "fairness", "derive.js"), 1500),
      "digest-mismatch",
    ],
    [
      "compiled server fairness code",
      (c: string) => flipOneByte(join(c, "server", "src", "fairness", "chain-vault.js"), 3000),
      "digest-mismatch",
    ],
    [
      "compiled round-preparation code",
      (c: string) => flipOneByte(join(c, "server", "src", "round", "prepare.js"), 3000),
      "digest-mismatch",
    ],
    [
      "the compiled known answers",
      (c: string) => flipOneByte(join(c, "server", "src", "round", "known-answers.js"), 3000),
      "digest-mismatch",
    ],
    ["a missing bundle", (c: string) => rmSync(join(c, ENGINE)), "file-missing"],
    // Modules the probe has not loaded before the loader runs (a module required earlier is
    // already executing: it is hash-checked only afterwards — see the TOCTOU notes).
    [
      "a missing server fairness module",
      (c: string) => rmSync(join(c, "server", "src", "fairness", "chain-vault.js")),
      "file-missing",
    ],
    [
      "a missing round-preparation module",
      (c: string) => rmSync(join(c, "server", "src", "round", "prepare.js")),
      "file-missing",
    ],
    [
      "an unexpected round module",
      (c: string) =>
        writeFileSync(join(c, "server", "src", "round", "extra.js"), "'use strict';\n"),
      "unexpected-file",
    ],
    [
      "an unexpected second bundle",
      (c: string) => cpSync(join(c, ENGINE), join(c, "engine", "second.cjs")),
      "unexpected-file",
    ],
    [
      "a subdirectory in a protected directory",
      (c: string) => {
        mkdirSync(join(c, "src", "fairness", "nested"));
        writeFileSync(join(c, "src", "fairness", "nested", "index.js"), "'use strict';\n");
      },
      "unexpected-file",
    ],
    [
      "a protected directory replaced by a junction",
      (c: string, root: string) => {
        const real = join(root, "elsewhere-fairness");
        cpSync(join(c, "src", "fairness"), real, { recursive: true });
        rmSync(join(c, "src", "fairness"), { recursive: true });
        symlinkSync(real, join(c, "src", "fairness"), "junction");
      },
      "protected-directory-invalid",
    ],
  ])("refuses %s with the trusted manifest unchanged", (_name, mutate, reason) => {
    expect(integrityCase(_name.replace(/\W+/g, "-"), mutate as never)).toEqual(refused(reason));
  });

  it.each([
    ["missing", (root: string) => rmSync(manifestOf(root)), "manifest-missing"],
    ["malformed", (root: string) => writeFileSync(manifestOf(root), "{"), "manifest-malformed"],
    [
      "not canonical (CRLF)",
      (root: string) =>
        writeFileSync(
          manifestOf(root),
          readFileSync(manifestOf(root), "utf8").replace(/\n/g, "\r\n"),
        ),
      "manifest-not-canonical",
    ],
    [
      "not canonical (a duplicate key)",
      (root: string) =>
        writeFileSync(
          manifestOf(root),
          readFileSync(manifestOf(root), "utf8").replace(
            '  "schemaVersion": 1,\n',
            '  "schemaVersion": 1,\n  "schemaVersion": 1,\n',
          ),
        ),
      "manifest-not-canonical",
    ],
    [
      "with an extra field",
      (root: string) => {
        const m = JSON.parse(readFileSync(manifestOf(root), "utf8"));
        writeFileSync(manifestOf(root), `${JSON.stringify({ ...m, approvedBy: "x" }, null, 2)}\n`);
      },
      "manifest-malformed",
    ],
    [
      "with a path-traversal entry",
      (root: string) => {
        const m = JSON.parse(readFileSync(manifestOf(root), "utf8"));
        m.files.unshift({ path: "../outside.js", bytes: 1, sha256: "0".repeat(64) });
        writeFileSync(manifestOf(root), `${JSON.stringify(m, null, 2)}\n`);
      },
      "manifest-malformed",
    ],
    [
      "incomplete (the bundle entry removed)",
      (root: string) => {
        const m = JSON.parse(readFileSync(manifestOf(root), "utf8"));
        m.files = m.files.filter((f: Report) => f.path !== "engine/engine.cjs");
        writeFileSync(manifestOf(root), `${JSON.stringify(m, null, 2)}\n`);
      },
      "manifest-incomplete",
    ],
    [
      "stale (one recorded digest of another build)",
      (root: string) => {
        const m = JSON.parse(readFileSync(manifestOf(root), "utf8"));
        const f = m.files.find((x: Report) => x.path === "server/src/round/round-script.js");
        f.sha256 = f.sha256.replace(/^./, (ch: string) => (ch === "0" ? "1" : "0"));
        writeFileSync(manifestOf(root), `${JSON.stringify(m, null, 2)}\n`);
      },
      "digest-mismatch",
    ],
    [
      "reached through a linked directory",
      (root: string) => {
        const real = join(root, "elsewhere-integrity");
        cpSync(join(root, "integrity"), real, { recursive: true });
        rmSync(join(root, "integrity"), { recursive: true });
        symlinkSync(real, join(root, "integrity"), "junction");
      },
      "manifest-not-regular",
    ],
  ])("refuses a trusted manifest that is %s", (_name, mutate, reason) => {
    expect(
      integrityCase(`manifest-${_name.replace(/\W+/g, "-")}`, (_c, root) =>
        (mutate as (r: string) => void)(root),
      ),
    ).toEqual(refused(reason));
  });

  it("refuses a manifest mismatch although every known answer still passes", () => {
    // A change that alters no behaviour: the bundle banner. With its own (rehashed) manifest it
    // loads, so the known answers pass; with the trusted manifest it is refused.
    const banner = (c: string) => edit(join(c, ENGINE), "// GENERATED by", "// GENERATED By");
    expect(integrityCase("kat-pass-rehashed", banner, "rehashed")).toEqual({ ok: true });
    expect(integrityCase("kat-pass-trusted", banner)).toEqual(refused("digest-mismatch"));
  });

  it("the 200× → 30× bundle with a rehashed manifest is still refused by the known answers", () => {
    // The P8-4a M-3 demonstration passed the loader; the expanded independent known answers (a
    // 200× clamp and a crash point above 100×) now refuse it as defence in depth. This is a
    // regression check, not authentication: the trusted manifest is what authenticates.
    const clamp = (c: string) => edit(join(c, ENGINE), "Math.min(m, 200)", "Math.min(m, 30)");
    expect(integrityCase("clamp-rehashed", clamp, "rehashed")).toMatchObject({
      ok: false,
      code: "runtime-known-answer-failed",
    });
  });

  it("refuses a bundle that requires a module outside the protected set (rehashed manifest)", () => {
    const result = integrityCase(
      "unprotected-require",
      (c) => {
        mkdirSync(join(c, "extra"), { recursive: true });
        writeFileSync(join(c, "extra", "helper.js"), "'use strict';\n");
        edit(join(c, ENGINE), "Do not edit.\n", 'Do not edit.\nrequire("../extra/helper.js");\n');
      },
      "rehashed",
    );
    expect(result).toEqual(refused("unexpected-module"));
  });

  it.skipIf(process.platform !== "win32")(
    "refuses a protected round module loaded under another drive-letter case (Windows)",
    () => {
      const report = probe(dist, "case-round");
      expect(report.flippedDiffers).toBe(true);
      expect(report.result).toEqual(refused("duplicate-module-instance"));
    },
  );

  it("the build tool verifies the clean build and fails closed on a tampered one", () => {
    const cli = join(SERVER, "scripts", "engine-integrity.mjs");
    const run = (args: string[]) =>
      spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 60_000 });
    const ok = run(["verify", dist]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(run(["candidate", dist]).stdout).toBe(readFileSync(TRUSTED_MANIFEST, "utf8"));
    const root = join(tmp, "cli-tampered");
    cpSync(dist, join(root, "dist"), { recursive: true });
    edit(join(root, "dist", ENGINE), "Math.min(m, 200)", "Math.min(m, 30)");
    const bad = run(["verify", join(root, "dist")]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("changed: engine/engine.cjs");
    expect(bad.stderr).not.toMatch(/[0-9a-f]{16}/);
    // Failed-build cleanup: no unverified bundle stays behind.
    expect(() => readFileSync(join(root, "dist", ENGINE))).toThrow();
  });

  it("integrity errors are sanitized: a fixed code and reason, no path, size or digest", () => {
    const r = integrityCase("sanitized", (c) => flipOneByte(join(c, ENGINE), 2000));
    expect(r.message).toMatch(/^runtime-integrity-failed: [a-z-]+$/);
    expect(r.message).not.toMatch(/[0-9a-f]{16}|dist|engine|\\|\//);
    expect(ROUND_SCRIPT_ERROR_CODES).toContain("runtime-integrity-failed");
  });
});

describe("independent known-answer vectors (P8-4a-1, I5 / I6)", () => {
  let v: Report;
  beforeAll(() => {
    v = probe(dist, "vectors");
  }, 240_000);

  it("the production runner reproduces all 45 independent round records exactly", () => {
    expect(v.count).toBe(45);
    for (const r of v.results) {
      expect(r.firstDifference, r.key).toBeNull();
      expect(r.digestMatches, r.key).toBe(true);
      expect(r.serverDigestMatches, r.key).toBe(true);
    }
    expect(v.results.filter((r: Report) => r.key.startsWith("dev-v1:"))).toHaveLength(16);
    expect(v.disposal.liveDerivations).toBe(0);
  });

  it("every required scenario is covered for every salt of the known-answer chain", () => {
    const required = [
      "crash-exact-1x",
      "crash-floor-1.01",
      "crash-over-100",
      "crash-clamp-200",
      "crash-during-boost",
      "floor-jackpot-tier-1",
      "floor-jackpot-tier-2",
      "floor-jackpot-tier-3",
      "floor-chest-rare",
      "goldfish-consumed",
      "goldfish-consumed-twice",
    ];
    for (const salt of ["A", "B", "C"]) {
      const covered = v.results
        .filter((r: Report) => r.key.startsWith(`kat-v1:${salt}`))
        .flatMap((r: Report) => r.categories);
      expect([...new Set(covered)].sort(), salt).toEqual([...required].sort());
    }
    // World draw order is checked on every creature of every round (full record), with
    // goldfish consumption in rounds that consume up to four.
    expect(Math.max(...v.results.map((r: Report) => r.consumed))).toBeGreaterThanOrEqual(2);
    expect(v.results.reduce((n: number, r: Report) => n + r.creatures, 0)).toBeGreaterThan(3000);
  });

  it("selection was not cherry-picked: each vector is the FIRST index of its category", () => {
    expect(v.firstProof.length).toBe(33);
    for (const [key, category, earlier] of v.firstProof) {
      expect(earlier, `${key} ${category}`).toBe(0);
    }
  });

  it("the tracked generator regenerates the committed vectors (data)", () => {
    expect(v.regeneratedEqualsCommitted).toBe(true);
  });

  it("the loader's known answers are the generator's values and record digests", () => {
    expect(v.knownAnswers.map((k: Report) => k.key)).toEqual([
      "dev-v1:A1",
      "dev-v1:B1",
      "dev-v1:A7",
      "kat-v1:A145",
      "kat-v1:B212",
      "kat-v1:A9",
      "kat-v1:C200",
      "kat-v1:B72",
      "kat-v1:A1",
    ]);
    for (const k of v.knownAnswers) {
      expect(k, k.key).toMatchObject({ inVectors: true, recordDigest: true, values: true });
    }
    expect(v.katChain).toEqual({ chainId: true, length: true, phrase: true, saltC: true });
  });
});

describe("known answers and replay", () => {
  it("the known answers equal the independent outcome vectors and reproduce", () => {
    expect(main.knownAnswerStatus).toBe("candidate-not-owner-approved");
    expect(main.knownAnswers.map((k: Report) => [k.key, k.outcome, k.matchesVector])).toEqual([
      ["A1", "crash", true],
      ["B1", "crash", true],
      ["A7", "floor", true],
    ]);
    for (const k of main.knownAnswers) {
      expect(k.independentDigest, k.key).toBe(k.digest);
      if (k.digestCandidate !== null) expect(k.digest, k.key).toBe(k.digestCandidate);
    }
  });

  it("the A1 / B1 RoundScript digest candidates (NOT owner-approved)", () => {
    const byKey = new Map(main.knownAnswers.map((k: Report) => [k.key, k]));
    expect((byKey.get("A1") as Report).digestCandidate).toBe(
      "1e8adf849d36618b2f3850727763aba45a784eeb0de67318fb603f7b3f0f13ac",
    );
    expect((byKey.get("B1") as Report).digestCandidate).toBe(
      "6f68e59e7e6f11e896446919adbba9a8257fb411ee4bc5d9b4cb98b86d198a17",
    );
    expect((byKey.get("A7") as Report).digestCandidate).toBeNull();
  });

  it("all 16 replay pins reproduce through vault → RoundKeys → the sealed runner", () => {
    expect(main.pins).toHaveLength(16);
    for (const p of main.pins) {
      expect(p.rebuiltRecordSha256, p.key).toBe(p.pin);
      expect(p.referenceRecordSha256, p.key).toBe(p.pin);
      expect(p.sameRecord, p.key).toBe(true);
      expect(p.chainIndex, p.key).toBe(Number(p.key.slice(1)));
    }
    expect(
      main.pins.filter((p: Report) => p.outcome === "floor").map((p: Report) => p.key),
    ).toEqual(["A7", "B3", "B7"]);
  });

  it("an independent recorder and encoder reproduce every RoundScript digest", () => {
    for (const p of main.pins) {
      expect(p.independentDigest, p.key).toBe(p.digest);
      expect(p.directDigest, p.key).toBe(p.digest);
    }
    expect(new Set(main.pins.map((p: Report) => p.digest)).size).toBe(16);
  });

  it("digests are identical in reversed order and in two fresh processes", () => {
    const forward = main.pins.map((p: Report) => [p.key, p.digest]);
    expect([...main.reversed].reverse()).toEqual(forward);
    const a = probe(dist, "digests").digests;
    const b = probe(dist, "digests").digests;
    expect(a).toEqual(forward);
    expect(b).toEqual(forward);
  });

  it("stops at the first crashed / bonus entry within the analytic tick bound", () => {
    expect(main.bound).toEqual({
      impactTick: 1590,
      terminalTick: 1674,
      analyticMaxDiveTicks: 1290,
      analyticMaxTerminalTick: 1674,
    });
    for (const p of main.pins) {
      expect(p.terminalTick, p.key).toBeLessThanOrEqual(1674);
      expect(p.samples, p.key).toBeGreaterThan(0);
    }
  });
});

describe("pipeline, offline disposition and audit", () => {
  it("each round: reserve, bind salt, issue, classify completed, script-built", () => {
    expect(main.offlineDisposition).toEqual({
      built: { disposition: "completed", reasonCode: "offline-script-built" },
      failed: { disposition: "aborted", reasonCode: "offline-script-failed" },
    });
    const perRound = (i: number) => [
      ["index-reserved", "reserve-round", i, null],
      ["salt-bound", "prepare-round", i, null],
      ["derivation-issued", "prepare-round", i, null],
      ["round-classified", "classify-round", i, "completed"],
      ["script-built", "prepare-script", i, null],
    ];
    expect(main.audit).toEqual([
      ["chain-created", "import-test-vectors", null, null],
      ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(perRound),
    ]);
  });

  it("script events are narrowly typed: fixed codes equal to RoundScriptError's", () => {
    expect(main.auditRules).toEqual({
      codes: [...ROUND_SCRIPT_ERROR_CODES].sort(),
      freeCode: true,
      nullFailure: true,
      builtWithCode: true,
      otherOperation: true,
      accepted: true,
    });
  });

  it("refuses unavailable, suspended, compromised and exhausted chains (no partial result)", () => {
    const s = main.states;
    const fail = (code: string, reason: string | null) => ({
      name: "RoundScriptError",
      code,
      reason,
      message: reason === null ? code : `${code}: ${reason}`,
    });
    expect(s.unknownChain).toEqual(fail("chain-unavailable", "unknown-chain"));
    expect(s.malformedChainId).toEqual(fail("chain-unavailable", "invalid-chain-id"));
    expect(s.suspended).toEqual(fail("chain-unavailable", "invalid-chain-state"));
    expect(s.compromised).toEqual(fail("chain-unavailable", "invalid-chain-state"));
    expect(s.exhausted).toEqual(fail("chain-unavailable", "chain-exhausted"));
    expect(s.badSalt).toEqual(fail("invalid-request", null));
    expect(s.badRequestId).toEqual(fail("invalid-request", null));
    expect(s.replayedRequest).toEqual(fail("request-replayed", null));
    expect(s.closed).toEqual(fail("environment-closed", null));
    expect(s.closedVerify).toEqual(fail("environment-closed", null));
    // A chain suspended or compromised after the reservation: the index is concluded aborted.
    for (const to of ["suspended", "compromised"]) {
      expect(s.midChain[to]).toEqual({
        error: fail("chain-unavailable", "invalid-chain-state"),
        classified: [[1, "aborted"]],
        scriptFailed: ["chain-unavailable"],
      });
    }
    // The replayed request id is refused before the vault is asked: no index in its event.
    expect(s.failedEvents.at(-1)).toEqual([null, "request-replayed"]);
    expect(s.failedEvents.map((e: Report) => e[1])).toEqual([
      "chain-unavailable",
      "chain-unavailable",
      "chain-unavailable",
      "chain-unavailable",
      "invalid-request",
      "invalid-request",
      "chain-unavailable",
      "request-replayed",
    ]);
  });

  it("concurrent preparations get distinct indices; a shared request id is refused once", () => {
    const c = main.concurrency;
    expect(c.fulfilled).toBe(24);
    expect(c.indices).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(c.distinctDigests).toBe(24);
    expect(c.sameRequest).toEqual(["ok", "request-replayed"]);
    expect(c.verified).toEqual(Array(24).fill(true));
    expect(c.built).toBe(25);
  });

  it("injected audit failures fail closed, classify as documented and dispose every secret", () => {
    const i = main.inject;
    const fail = (code: string, reason: string | null) => ({
      name: "RoundScriptError",
      code,
      reason,
      message: reason === null ? code : `${code}: ${reason}`,
    });
    expect(i.derivationIssued).toMatchObject({
      error: fail("chain-unavailable", "audit-failed"),
      classified: ["aborted"],
      scriptEvents: [["script-failed", "chain-unavailable"]],
    });
    // completed was recorded by the store before its audit failed: no script is returned.
    expect(i.roundClassified).toMatchObject({
      error: fail("disposition-failed", "audit-failed"),
      classified: ["completed"],
      scriptEvents: [["script-failed", "disposition-failed"]],
    });
    expect(i.scriptBuilt).toMatchObject({
      error: fail("audit-failed", null),
      classified: ["completed"],
    });
    expect(i.everything).toMatchObject({
      error: fail("disposition-failed", "audit-failed"),
      classified: ["aborted"],
    });
    for (const name of ["derivationIssued", "roundClassified", "scriptBuilt", "everything"]) {
      expect(i[name].newDerivations, name).toBe(1);
      expect(i[name].liveDerivations, name).toBe(0);
      expect(i[name].liveKeys, name).toBe(0);
    }
    expect(i.fakeRuntime).toMatchObject({ code: "unverified-runtime" });
    expect(i.productionMode).toMatchObject({ code: "development-only" });
    expect(i.importInDevelopment).toMatchObject({ code: "development-only" });
    expect(i.nodeEnvProduction).toMatchObject({
      code: "development-only",
      reason: "development-store-refused",
    });
  });

  it("every derivation and every RoundKeys created in the run was disposed", () => {
    expect(main.disposal.derivations).toBeGreaterThan(100);
    expect(main.disposal.liveDerivations).toBe(0);
    expect(main.disposal.keys).toBeGreaterThan(50);
    expect(main.disposal.liveKeys).toBe(0);
  });
});

describe("injected runner faults (patched bundle; known answers still pass)", () => {
  let fault: Report;
  beforeAll(() => {
    const dir = patched("fault", (c) => {
      let code = c;
      // index 3: one advance consumes two ticks
      code = replaceOnce(
        code,
        "\t\tengine.advance(TICK);",
        "\t\tengine.advance(round.chainIndex === 3 && tick === 310 ? TICK * 2 : TICK);",
      );
      // index 4: a NaN sample reaches the server's validation
      code = replaceOnce(
        code,
        "multiplier.push(engine.getPublicState().multiplier);",
        "multiplier.push(round.chainIndex === 4 ? Number.NaN : engine.getPublicState().multiplier);",
      );
      // index 5: an observed state outside the one-round sequence
      code = replaceOnce(
        code,
        "\t\tconst state = engine.state;",
        '\t\tconst state = round.chainIndex === 5 && tick === 400 ? "betting" : engine.state;',
      );
      // index 6: the round is disposed mid-dive (the next draw fails)
      code = replaceOnce(
        code,
        "\t\tconst render = engine.getRenderState();",
        "\t\tif (round.chainIndex === 6 && tick === 320) round.dispose();\n\t\tconst render = engine.getRenderState();",
      );
      return code;
    });
    fault = probe(dir, "fault");
  }, 120_000);

  it("each fault fails its round with a fixed code; the other rounds succeed", () => {
    expect(fault.results).toEqual([
      { index: 1, ok: true, chainIndex: 1 },
      { index: 2, ok: true, chainIndex: 2 },
      {
        index: 3,
        ok: false,
        name: "RoundScriptError",
        code: "runner-failed",
        reason: "tick-mismatch",
        message: "runner-failed: tick-mismatch",
      },
      {
        index: 4,
        ok: false,
        name: "RoundScriptError",
        code: "script-invalid",
        reason: null,
        message: "script-invalid",
      },
      {
        index: 5,
        ok: false,
        name: "RoundScriptError",
        code: "runner-failed",
        reason: "unexpected-state",
        message: "runner-failed: unexpected-state",
      },
      {
        index: 6,
        ok: false,
        name: "RoundScriptError",
        code: "runner-failed",
        reason: "draw-failed",
        message: "runner-failed: draw-failed",
      },
      { index: 7, ok: true, chainIndex: 7 },
      { index: 8, ok: true, chainIndex: 8 },
    ]);
  });

  it("failed rounds are aborted (offline disposition), audited, and their secrets disposed", () => {
    expect(fault.classified).toEqual([
      [1, "completed"],
      [2, "completed"],
      [3, "aborted"],
      [4, "aborted"],
      [5, "aborted"],
      [6, "aborted"],
      [7, "completed"],
      [8, "completed"],
    ]);
    expect(fault.scriptEvents).toEqual([
      ["script-built", 1, null],
      ["script-built", 2, null],
      ["script-failed", 3, "runner-failed"],
      ["script-failed", 4, "script-invalid"],
      ["script-failed", 5, "runner-failed"],
      ["script-failed", 6, "runner-failed"],
      ["script-built", 7, null],
      ["script-built", 8, null],
    ]);
    expect(fault.disposal.liveDerivations).toBe(0);
    expect(fault.disposal.liveKeys).toBe(0);
  });
});

describe("secrecy, verification and tamper detection", () => {
  it("no rendering of a script, error, environment, runtime or audit record holds a secret", () => {
    const r = main.redaction;
    expect(r.leaks).toEqual([]);
    expect(r.ownKeys).toEqual(["public"]);
    expect(r.string).toBe("RoundScript(fv 1, chain index 7) [redacted secret]");
    expect(r.inspect).toBe(r.string);
    expect(JSON.parse(r.json)).toEqual({
      chainId: "ad95b4b96dd875673576b61889cb323afee9dab79fb3b1851279ec7013018b71",
      chainIndex: 7,
      fv: 1,
      profile: "aquadive-offline-round-runner",
      profileVersion: 1,
      salt: "ce42ce61a55967eb18db394940853f7bf2e95390dd890ea17e3232a0cde0210e",
      scriptVersion: 1,
      status: "experimental-internal-offline",
      secret: "[redacted secret]",
    });
    expect(r).toMatchObject({ frozen: true, deepFrozen: true, bytesAreCopies: true });
    expect(r.errorCount).toBeGreaterThan(20);
    expect(r.errorsWithCause).toBe(0);
  });

  it("verifies a script against its round's reveal; refuses another round's or a forged reveal", () => {
    const v = main.verify;
    expect(v.ok).toEqual({ match: true, alteredFields: [] });
    for (const name of ["wrongRound", "forged", "badLink", "offChain", "otherSalt"]) {
      expect(v[name], name).toMatchObject({ code: "reveal-mismatch", reason: null });
    }
    expect(v.roundTripDigest).toBe(true);
    expect(v.roundTripVerifies).toBe(true);
  });

  it("identifies exactly the altered fields, and a digest check refuses any alteration", () => {
    const t = main.verify.tamper;
    expect(t.multiplierSample.alteredFields).toEqual([
      `secret.samples.multiplier[${t.sampleIndex}]`,
    ]);
    expect(t.salt.alteredFields).toEqual(["public.salt"]);
    expect(t.creatureSize.alteredFields).toEqual(["secret.creatures[4].size"]);
    expect(t.chest.alteredFields).toEqual(["secret.chests[0]", "secret.chests[2]"]);
    for (const name of ["multiplierSample", "salt", "creatureSize", "chest"]) {
      expect(t[name].match, name).toBe(false);
      expect(t[name].withDigest, name).toMatchObject({ code: "script-digest-mismatch" });
    }
  });

  it("refuses non-canonical or rule-breaking bytes with a fixed code and no detail", () => {
    for (const [name, e] of Object.entries(main.verify.invalid as Record<string, Report>)) {
      expect(e, name).toEqual({
        name: "RoundScriptError",
        code: "script-invalid",
        reason: null,
        message: "script-invalid",
      });
    }
    expect(Object.keys(main.verify.invalid).sort()).toEqual([
      "extraKey",
      "nan",
      "negativeZero",
      "outOfRange",
      "reorderedKeys",
      "tickBound",
      "whitespace",
    ]);
  });
});

describe("acceptance corrections M-1, M-2, L-1 (adversarial)", () => {
  let adv: Report;
  beforeAll(() => {
    adv = probe(dist, "adversarial");
  }, 120_000);
  const mismatch = { ok: false, name: "RoundScriptError", code: "reveal-mismatch", reason: null };

  it("M-1: a fabricated chain is refused although its hashes are consistent", () => {
    const f = adv.fabricated;
    expect(f.consistent).toBe(true);
    expect(f.verify).toMatchObject(mismatch);
    expect(f.chainLengthLie).toMatchObject(mismatch);
    expect(f.knownToEnv).toMatchObject({ code: "chain-unavailable", reason: "unknown-chain" });
    expect(f.revealViaEnv).toMatchObject({
      code: "chain-unavailable",
      reason: "round-not-prepared",
    });
    expect(f.liveSecrets).toBe(0);
  });

  it("M-1: every forged reveal field of a real round is refused; the true one matches", () => {
    const r = adv.realChain;
    expect(Object.keys(r.forged).sort()).toEqual(
      [
        "chainIdOther",
        "chainLength999",
        "chainLengthShort",
        "dispositionVoided",
        "empty",
        "fvOther",
        "indexOther",
        "notAnObject",
        "saltMalformed",
        "saltNull",
        "saltOther",
        "saltShort",
        "seedOfRound1",
        "statusOther",
      ].sort(),
    );
    for (const [name, v] of Object.entries(r.forged as Record<string, Report>)) {
      expect(v, name).toMatchObject({ ...mismatch, hasCause: false });
    }
    expect(r.control).toEqual({ ok: true, value: { match: true, alteredFields: [] } });
    expect(adv.compromisedVerify).toMatchObject(mismatch);
  });

  it("M-1: verification never reveals: an exact record of an unrevealed round is refused", () => {
    const r = adv.realChain;
    expect(r.unrevealed).toMatchObject(mismatch);
    expect(r.revealedCountAfter).toBe(r.revealedCountBefore);
    expect(r.revealedCountBefore).toBe(2);
    expect(r.lastReservedAfter).toBe(r.lastReservedBefore);
    expect(r.eventsDuringVerify).toEqual([]);
    expect(r.reveal3AfterwardsDisposition).toBe("completed");
    expect(r.liveSecrets).toBe(0);
    expect(r.liveKeys).toBe(0);
  });

  it("M-2: the vault is private; no caller can classify, transition, reserve or prepare", () => {
    const b = adv.vaultBypass;
    expect(b.surface).toEqual({
      vault: true,
      ownKeys: ["audit", "mode"],
      methods: [
        "chainStatus",
        "close",
        "constructor",
        "createChain",
        "importPublicTestVectorChain",
        "prepareScript",
        "restrictChainForTest",
        "revealRound",
        "toJSON",
        "verifyScript",
      ],
      frozen: true,
      assignVault: "TypeError",
      vaultAfterAssign: true,
    });
    expect(b.attempts).toHaveLength(4);
    for (const a of b.attempts) {
      expect(a.tries, `index ${a.index}`).toEqual({
        vaultClassify: "TypeError:",
        envClassify: "TypeError:",
        envTransition: "TypeError:",
        envReserve: "TypeError:",
        envPrepareRound: "TypeError:",
        restrictInDevelopment: "RoundScriptError:development-only",
        replay: "RoundScriptError:request-replayed",
      });
    }
    // Whatever the caller wanted after seeing the outcome, every round stays completed.
    expect(b.dispositions).toEqual(["completed", "completed", "completed", "completed"]);
    expect(b.classifiedEvents).toEqual([1, 2, 3, 4, 5].map((i) => [i, "completed"]));
    expect(b.nextIndex).toBe(5);
    expect(b.revealUnprepared).toMatchObject({ reason: "round-not-prepared" });
    expect(b.status).toBe("active");
  });

  it("M-2: the test-only restriction is one way, fixed, and changes no disposition", () => {
    expect(adv.restrict).toEqual({
      active: "invalid-request",
      retired: "invalid-request",
      exhausted: "invalid-request",
      voided: "invalid-request",
      indeterminate: "invalid-request",
      suspended: "suspended",
      backToActive: "invalid-request",
      prepareWhileSuspended: "chain-unavailable",
      revealWhileSuspended: "completed",
      compromised: "compromised",
      reasonCodes: [
        ["transition-chain", "suspended"],
        ["transition-chain", "compromised"],
      ],
    });
  });

  it("L-1: construction faults map to reveal-mismatch and leave nothing live", () => {
    const f = adv.faults;
    expect(f.keysFault).toMatchObject({ ...mismatch, hasCause: false });
    expect(f.secretFault).toMatchObject({ ...mismatch, hasCause: false });
    expect(f.afterFaults).toEqual({ ok: true, value: { match: true, alteredFields: [] } });
    expect(f.faultsConsumed).toBe(true);
    expect(f.secretsCreated).toBe(2);
    expect(f.liveSecrets).toBe(0);
    expect(f.keysCreated).toBe(1);
    expect(f.liveKeys).toBe(0);
    expect(adv.fabricated.shortSalt).toMatchObject({ ...mismatch, hasCause: false });
  });

  it("L-1: known-answer derivations (loader and direct) dispose their seed copies", () => {
    // One temporary seed copy per loader known answer (9 since P8-4a-1), all disposed.
    expect(adv.loadSecrets).toEqual({ created: 9, live: 0 });
    expect(adv.knownAnswerSecrets).toEqual({ created: 16, live: 0 });
    expect(adv.disposal.liveDerivations).toBe(0);
    expect(adv.disposal.liveKeys).toBe(0);
  });
});

describe("acceptance correction M-2b (run-time construction guard)", () => {
  let c: Report;
  beforeAll(() => {
    c = probe(dist, "construction");
  }, 120_000);
  const refused = (code: string, reason: string) => ({
    ok: false,
    name: "RoundScriptError",
    code,
    reason,
    message: `${code}: ${reason}`,
    hasCause: false,
  });
  const RUNTIMES = [
    "boundDelegate",
    "forged",
    "frozenCopy",
    "prototypeChild",
    "proxy",
    "selectiveWrapper",
  ];

  it("the non-verified runtimes look like real ones; only the loader's object is verified", () => {
    expect(Object.keys(c.runtimeShapes).sort()).toEqual(RUNTIMES);
    for (const n of RUNTIMES) expect(c.runtimeShapes[n], n).toBe(true);
    expect(c.verifiedFlags).toEqual({
      real: true,
      ...Object.fromEntries(RUNTIMES.map((n) => [n, false])),
    });
  });

  it("direct JavaScript construction is refused by the capability, whatever the arguments", () => {
    const names = Object.keys(c.direct);
    // The audit's exact call shape with each runtime, and invalid capabilities with otherwise
    // VALID arguments (verified crypto, the real runtime, a supported mode).
    expect(names.filter((n) => n.startsWith("legacy:"))).toHaveLength(RUNTIMES.length);
    expect(names.filter((n) => n.startsWith("token:"))).toHaveLength(11);
    for (const extra of ["reflectConstruct", "subclass", "instanceConstructor"]) {
      expect(names).toContain(extra);
    }
    for (const [name, r] of Object.entries(c.direct as Record<string, Report>)) {
      expect(r, name).toEqual(refused("invalid-request", "construction-refused"));
    }
  });

  it("the factory and static create refuse every non-verified runtime in the constructor", () => {
    expect(Object.keys(c.factory)).toHaveLength(2 * RUNTIMES.length);
    for (const [name, r] of Object.entries(c.factory as Record<string, Report>)) {
      expect(r, name).toEqual(refused("unverified-runtime", "unverified-engine-runtime"));
    }
  });

  it("unverified crypto providers and unsupported modes are refused with their own reasons", () => {
    expect(Object.keys(c.crypto)).toHaveLength(8);
    for (const [name, r] of Object.entries(c.crypto as Record<string, Report>)) {
      expect(r, name).toEqual(refused("unverified-runtime", "unverified-crypto"));
    }
    expect(Object.keys(c.modes).sort()).toEqual(
      ["capitalised", "empty", "noOptions", "object", "production", "undefined"].sort(),
    );
    for (const [name, r] of Object.entries(c.modes as Record<string, Report>)) {
      expect(r, name).toEqual(refused("development-only", "unsupported-mode"));
    }
    // No refused construction reached a store, a vault or the audit sink.
    expect(c.refusalEvents).toBe(0);
  });

  it("the audit's selective-abort exploit cannot be staged; a legitimate run keeps every round", () => {
    expect(c.exploit).toEqual({
      attempts: 30,
      constructed: 0,
      codes: [
        "invalid-request:construction-refused",
        "unverified-runtime:unverified-engine-runtime",
      ],
      // The wrapper and the forged runner never ran a single round.
      calls: { wrapper: 0, forged: 0 },
    });
    const l = c.legitimate;
    expect(l).toMatchObject({
      mode: "development",
      dispositions: { completed: 30 },
      classified: 30,
      scriptBuilt: 30,
      scriptFailed: 0,
      status: "active",
    });
    // Low crashes are kept like every other outcome (the exploit had kept none).
    expect(l.lowCount).toBeGreaterThan(0);
  });

  it("a bundle export replaced after verification is never reached by the verified runtime", () => {
    const x = c.exportReplacement;
    // The replacement really was installed on the module the loader required…
    expect(x.replaced).toBe(true);
    // …yet every round ran the function bound at load: all 30 built and completed.
    expect(x.callsDuringRounds).toBe(0);
    expect(x).toMatchObject({ built: 30, failed: 0, dispositions: { completed: 30 } });
    // A runtime loaded after the replacement checks the replaced function with its known answers.
    expect(x.callsDuringLateLoad).toBe(3);
    expect(x.lateLoad).toMatchObject({ ok: false, code: "runtime-known-answer-failed" });
  });

  it("env.audit cannot change chain state and never receives seed or salt material", () => {
    const a = c.auditSink;
    // The development sink is NOT durable and NOT tamper-evident: false events are accepted…
    expect(a.guarantees).toEqual({ durable: false, tamperEvident: false });
    expect(a.forgedEvents).toEqual(["appended", "appended", "appended"]);
    // …but they are only log lines: the chain and every disposition are unchanged.
    expect(a.stateUnchanged).toBe(true);
    expect(a.state).toBe("active");
    expect(c.legitimate.dispositions).toEqual({ completed: 30 });
    expect(a.seedsInAudit).toBe(0);
    expect(a.saltInAudit).toBe(false);
    expect(a.environmentKeys.length).toBeGreaterThan(0);
  });

  it("normal creation with defaults works; development and test stay distinct", () => {
    expect(c.defaults).toMatchObject({
      testMode: "test",
      devMode: "development",
      a1DigestEqualsDirect: true,
      testRestrict: "suspended",
      devImport: { ok: false, code: "development-only" },
      devRestrict: { ok: false, code: "development-only" },
      devChainState: "active",
    });
  });

  it("no capability, store, vault or disposition control is reachable from outside", () => {
    const s = c.surface;
    expect(s.moduleExports).toEqual([
      "OFFLINE_DISPOSITION",
      "OfflineRoundEnvironment",
      "PREPARE_OPERATION",
      "TEST_CHAIN_RESTRICTIONS",
      "TEST_RESTRICTION_REASON",
      "createOfflineRoundEnvironment",
    ]);
    expect(s.classStatics).toEqual(["create", "length", "name", "prototype"]);
    expect(s.classSymbols).toBe(0);
    expect(s.ownKeys).toEqual(["audit", "mode"]);
    expect(s.methods).toEqual(ENV_METHODS);
    expect(s.frozen).toBe(true);
    expect(s.hidden).toEqual([]);
    expect(s.disposition).toEqual([]);
    expect(s.text).toBe(
      '{"environment":"OfflineRoundEnvironment","mode":"test"} ' +
        "OfflineRoundEnvironment(test) [secrets redacted]",
    );
    // An object made from the prototype has none of the private state: every method refuses.
    expect(s.fakeCalls).toEqual({
      prepareScript: "TypeError",
      createChain: "TypeError",
      chainStatus: "TypeError",
      revealRound: "TypeError",
      close: "TypeError",
    });
    expect(c.disposal.liveDerivations).toBe(0);
    expect(c.disposal.liveKeys).toBe(0);
  });
});

const ENV_METHODS = [
  "chainStatus",
  "close",
  "constructor",
  "createChain",
  "importPublicTestVectorChain",
  "prepareScript",
  "restrictChainForTest",
  "revealRound",
  "toJSON",
  "verifyScript",
];

describe("isolation from the running server", () => {
  it("the compiled application module loads no round, engine or fairness module", () => {
    // app.js needs fastify & co.: a junction to this package's node_modules (removed first in
    // afterAll), created only now so that no earlier probe could resolve a package.
    symlinkSync(join(SERVER, "node_modules"), join(tmp, "node_modules"), "junction");
    const s = probe(dist, "startup");
    expect(s.loaded.length).toBeGreaterThan(10);
    expect(s.round).toEqual([]);
    expect(s.engine).toEqual([]);
    expect(s.fairness).toEqual([]);
  });

  it("the main run loaded only compiled server, fairness, engine and TEST-ONLY qa files", () => {
    for (const f of main.loaded) {
      expect(f).toMatch(
        /^(server\/src\/(fairness|round)|src\/fairness|engine|qa)\b[\w/.-]*\.c?js$/,
      );
    }
    expect(main.loaded.filter((f: string) => f.startsWith("server/src/round/")).sort()).toEqual(
      [
        "canonical",
        "engine-runtime",
        "engine-types",
        "errors",
        "integrity",
        "known-answers",
        "prepare",
        "round-script",
      ].map((n) => `server/src/round/${n}.js`),
    );
  });
});
