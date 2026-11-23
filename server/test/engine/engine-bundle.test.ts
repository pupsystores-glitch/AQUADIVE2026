// Engine build integration (P8-4-0; export surface hardened in P8-4a, owner decision K2). PLAY
// MONEY ONLY; nothing here is connected.
//
// Builds the server exactly as `npm run build` does — `tsc -p tsconfig.build.json`, then
// `node scripts/build-engine.mjs <dist>` — into a temporary directory, adds TEST-ONLY bundles
// (test/helpers/engine-build.ts) of the unchanged GameEngine and SeededRound source, which the
// production bundle no longer exports, and of the original src/seeded-round/test helpers
// (reference runner, replay pins, independent vectors), and checks:
// - the bundle holds only engine, shared and seeded-round modules (no rendering, UI, audio,
//   protocol or fairness code) and requires exactly one thing: the compiled fairness module;
// - the emitted code passes the syntax-aware validation (no randomness, clock, process, eval,
//   timer, global-object, browser or network access; owner decision D-2), whose every rule has
//   a positive and a negative test below; the build is reproducible and fails closed (no bundle
//   left at the target, non-zero CLI exit, a stale bundle removed);
// - in a fresh Node process with Math.random and every browser global poisoned: the export
//   surface (only the sealed runner: no engine, round or authority constructor; D-1, K2), ONE
//   fairness instance shared with the server's bridge (a second copy is refused by
//   SeededRound.bind and by the production runner), the A1–A8 and B1–B8
//   replay pins through SeededRound.create, through the server's RoundDerivation and through
//   the vault, agreement with the independent vectors, no secret in a live round's renderings
//   or in the EventBus's listener-error output, and a deterministic round of the production
//   GameEngine over LocalRoundAuthority from a TEST-ONLY bundle. The production runner itself
//   (RoundScript precomputation) is tested in test/round/.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ENGINE_BUNDLE,
  FAIRNESS_REQUIRE,
  REPO_DIR,
  buildEngineBundle,
  validateEngineCode,
} from "../../scripts/build-engine.mjs";
import { SEEDED_TEST, SERVER, buildQaBundles, buildServer } from "../helpers/engine-build";

const PROBE = fileURLToPath(new URL("./compiled-probe.cjs", import.meta.url));

/**
 * The production bundle's modules (repository-relative): the P8-4-0 list plus the sealed
 * runner (P8-4a); src/engine/commands.ts dropped out with the BET_SLOTS export (K2).
 */
const BUNDLED_MODULES = [
  "server/engine/entry.ts",
  "server/engine/round-runner.ts",
  "src/engine/clock.ts",
  "src/engine/domain/creatures.ts",
  "src/engine/domain/descent.ts",
  "src/engine/domain/multiplier.ts",
  "src/engine/domain/outcomes.ts",
  "src/engine/domain/tuning.ts",
  "src/engine/events.ts",
  "src/engine/game-engine.ts",
  "src/engine/round-authority.ts",
  "src/engine/simulation.ts",
  "src/engine/state-machine.ts",
  "src/seeded-round/authority.ts",
  "src/seeded-round/errors.ts",
  "src/seeded-round/lifecycle.ts",
  "src/seeded-round/purpose-rng.ts",
  "src/seeded-round/secrecy.ts",
  "src/seeded-round/seeded-round.ts",
  "src/shared/stake.ts",
  "src/shared/world.ts",
];

/** The production export surface (K2): the sealed runner only. */
const EXPORTS = {
  ROUND_RUNNER_PROFILE: "object",
  RoundRunnerError: "function",
  runSeededRound: "function",
};

/** The TEST-ONLY LocalRoundAuthority bundle (src/engine/round-authority.ts, unchanged). */
const LOCAL_AUTHORITY_MODULES = ["src/engine/domain/outcomes.ts", "src/engine/round-authority.ts"];

/** The pins as written in the source (src/seeded-round/test/replay-pins.ts), parsed as text. */
const SOURCE_PINS = [
  ...readFileSync(join(SEEDED_TEST, "replay-pins.ts"), "utf8").matchAll(
    /\["([AB])", (\d+), "([0-9a-f]{64})"\]/g,
  ),
].map((m) => [m[1]!, Number(m[2]), m[3]!] as const);

interface RunSummary {
  key: string;
  recordSha256: string;
  outcome: "crash" | "floor";
  crashAt: number;
  crashDraws: number;
}
interface ProbeReport {
  counters: { mathRandom: number; browser: Record<string, number> };
  exports: Record<string, string>;
  identity: Record<string, boolean>;
  replay: {
    pins: [string, number, string][];
    vectors: { salt: string; index: number; crashAt: number; crashDraws: number }[];
    forward: RunSummary[];
    again: RunSummary[];
    reversed: RunSummary[];
  };
  bind: RunSummary[];
  vault: RunSummary[];
  duplicate: {
    distinctClass: boolean;
    refusal: { isSeededRoundError: boolean; code: string; message: string } | null;
    production: { isRunnerError: boolean; code: string; message: string } | null;
  };
  secrecy: { json: string; leakedViews: number; errorRaised: boolean; errorLeaks: boolean };
  local: {
    exportedByProduction: boolean;
    terminal: string | null;
    ticks: number;
    identical: boolean;
  };
  authorityRoute: {
    functionExports: string[];
    authorityClassExported: boolean;
    productionExportsEngineOrRound: boolean;
    authorityIsSeeded: boolean;
    depsAuthorityIsRoundAuthority: boolean;
    reflectionReachable: boolean;
  };
  eventBus: {
    terminal: string | null;
    listenerCalls: number;
    calls: {
      argCount: number;
      prefix: string;
      event: string;
      isThrownValue: boolean;
      preReveal: boolean;
    }[];
    stderrBytes: number;
    sealedMarkers: number;
    leaks: string[];
  };
  loaded: { compiled: string[]; resolved: string[] };
}

let tmp = "";
let dist = "";
let bundleCode = "";
let localAuthorityModules: readonly string[] = [];
let report: ProbeReport;

const posix = (p: string) => p.split(sep).join("/");

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-4-0-engine-"));

  // 1. The two `npm run build` steps, into the temporary directory.
  dist = buildServer(tmp);
  bundleCode = readFileSync(join(dist, ENGINE_BUNDLE), "utf8");

  // 2. TEST-ONLY bundles (K2: GameEngine, SeededRound and the seeded-round test helpers; D-1:
  // LocalRoundAuthority from its unchanged source module alone).
  localAuthorityModules = await buildQaBundles(dist);

  // 3. A second, separate copy of the compiled fairness module (negative control only).
  cpSync(join(dist, "src", "fairness"), join(tmp, "duplicate", "fairness"), { recursive: true });

  // 4. The probe, in a fresh Node process.
  const run = spawnSync(
    process.execPath,
    [PROBE, dist, join(tmp, "duplicate", "fairness", "index.js")],
    { encoding: "utf8", timeout: 120_000 },
  );
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  report = JSON.parse(run.stdout) as ProbeReport;
}, 300_000);

afterAll(() => {
  if (!tmp) return;
  // Unlink the node_modules junctions first, so nothing can reach this package's own files.
  for (const junction of [
    join(tmp, "bad", "node_modules"),
    join(tmp, "cli", "server", "node_modules"),
  ]) {
    rmSync(junction, { force: true });
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("the engine bundle (dist/engine/engine.cjs)", () => {
  it("contains exactly the approved engine, shared and seeded-round modules", () => {
    const regions = [...bundleCode.matchAll(/^\/\/ ((?:src|server)\/\S+\.ts)$/gm)].map((m) => m[1]);
    // The entry only re-exports, so it leaves no code region; the build's own module list
    // (checked below) includes it. The two barrels are resolved through and do not appear.
    expect(regions.sort()).toEqual(BUNDLED_MODULES.filter((m) => m !== "server/engine/entry.ts"));
    // No other source path is named (the fairness `require` is the one allowed reference).
    expect(bundleCode.replace(`require("${FAIRNESS_REQUIRE}")`, "")).not.toMatch(
      /src\/(rendering|ui|audio|protocol|fairness|assets|game)\//,
    );
  });

  it("requires only the server's compiled fairness module, once, and inlines no fairness code", () => {
    const code = stripComments(bundleCode);
    expect([...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])).toEqual([
      FAIRNESS_REQUIRE,
    ]);
    expect(FAIRNESS_REQUIRE).toBe("../src/fairness/index.js");
    expect(bundleCode).not.toContain("AQUADIVE-FAIRNESS"); // the fv domain tag lives in encoding.js
    expect(code).not.toMatch(/class (RoundDerivation|SecretBytes|SeededStream|FairnessError)\b/);
    expect(code).not.toMatch(/\b(createHmac|createHash|randomBytes|webcrypto)\b/);
  });

  it("passes the syntax-aware validation exactly as the build applies it", () => {
    expect(validateEngineCode(bundleCode, { fileName: "engine.cjs" }).problems).toEqual([
      `unexpected require("${FAIRNESS_REQUIRE}") in engine.cjs`, // nothing allowed: refused
    ]);
    expect(
      validateEngineCode(bundleCode, {
        fileName: "engine.cjs",
        allowedRequires: [FAIRNESS_REQUIRE],
      }),
    ).toEqual({ problems: [], requires: [FAIRNESS_REQUIRE] });
  });

  it("names no browser API, Math.random, `@/` or `.ts` specifier (independent text check)", () => {
    const code = stripComments(bundleCode);
    for (const re of [
      /Math\s*\.\s*random/,
      /\b(requestAnimationFrame|cancelAnimationFrame)\b/,
      /\b(window|document|navigator|localStorage|sessionStorage)\b/,
      /\b(HTMLCanvasElement|OffscreenCanvas|CanvasRenderingContext2D|getContext)\b/,
      /\b(Image|Audio|AudioContext|fetch|XMLHttpRequest|WebSocket)\b/,
      /["']@\//,
      /["'][^"']+\.tsx?["']/,
      /\b(EngineDriver|createMathRandomRng)\b/,
    ]) {
      expect(code).not.toMatch(re);
    }
  });

  it("is CommonJS with exactly the approved named exports", () => {
    const exported = [...bundleCode.matchAll(/^exports\.(\w+) = \1;$/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(Object.keys(EXPORTS).sort());
    expect(bundleCode).not.toMatch(/^\s*(import|export)\s/m);
  });

  it("rebuilds byte-identically through the API, with the same module list", async () => {
    const [again] = await buildEngineBundle({ dist: join(tmp, "again"), file: ENGINE_BUNDLE });
    expect(again!.code).toBe(bundleCode);
    expect(again!.requires).toEqual([FAIRNESS_REQUIRE]);
    expect(again!.modules).toEqual(BUNDLED_MODULES);
  }, 60_000);

  it("fails closed: every refusal names its reason and leaves no bundle, not even a stale one", async () => {
    const bad = join(tmp, "bad");
    mkdirSync(bad, { recursive: true });
    // A resolvable copy of this package's node_modules for the package-import case (a
    // junction: no privilege needed on Windows; removed before the directory in afterAll).
    symlinkSync(join(SERVER, "node_modules"), join(bad, "node_modules"), "junction");
    const attempt = async (name: string, source: string) => {
      const entry = join(bad, `${name}.ts`);
      writeFileSync(entry, source);
      const out = join(bad, `${name}-out`);
      // A bundle from an earlier build sits at the target: it must not survive the refusal.
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "x.cjs"), "exports.stale = true;\n");
      const error = await buildEngineBundle({ dist: out, file: "x.cjs", input: entry }).then(
        () => null,
        (e: Error & { problems?: string[] }) => e,
      );
      expect(error, name).not.toBeNull();
      expect(existsSync(join(out, "x.cjs")), name).toBe(false);
      expect(readdirSync(out), name).toEqual([]); // no temporary file either
      // The fixture entry itself lies outside the allow-list; every other line is the reason.
      const self = `module not allowed: ${posix(relative(REPO_DIR, entry))}`;
      if (!error!.problems) return { message: error!.message, problems: [] as string[] };
      expect(error!.problems[0], name).toBe(self);
      return { message: error!.message, problems: error!.problems.slice(1) };
    };
    // A private fairness module would be bundled (not the external barrel): refused. The fixture
    // is text written to a temporary entry, never an import of this file; the specifier is kept
    // in a constant so src/fairness/security.test.ts's text scan of server/test stays exact.
    const privateFairnessModule = ["@", "fairness", "encoding.ts"].join("/");
    const fairness = await attempt(
      "fairness",
      `export { bytesToHex } from "${privateFairnessModule}";`,
    );
    expect(fairness.problems).toContain("module not allowed: src/fairness/encoding.ts");
    // The unseeded Math.random stream: refused.
    const random = await attempt("random", 'export { createMathRandomRng } from "@/engine";');
    expect(random.problems).toContain("x.cjs uses Math.random");
    // The requestAnimationFrame driver: refused.
    const driver = await attempt("driver", 'export { EngineDriver } from "@/engine";');
    expect(driver.problems).toContain(
      "x.cjs uses requestAnimationFrame (timer / async scheduling)",
    );
    // A Node built-in, by either specifier: refused for the require, nothing else.
    expect(
      (
        await attempt(
          "nodefs",
          'import { readFileSync } from "node:fs"; export const r = readFileSync;',
        )
      ).problems,
    ).toEqual(['unexpected require("node:fs") in x.cjs']);
    expect(
      (await attempt("barefs", 'import { readFileSync } from "fs"; export const r = readFileSync;'))
        .problems,
    ).toEqual(['unexpected require("fs") in x.cjs']);
    // A resolvable package: bundled, so refused as modules outside the allow-list.
    const pkg = await attempt("pkg", 'export { z } from "zod";');
    expect(pkg.problems).toContain("module not allowed: server/node_modules/zod/v3/external.js");
    // (zod's own code is refused by the code checks as well, e.g. for Promise and Date.)
    expect(pkg.problems).toContain("x.cjs uses Promise (timer / async scheduling)");
    // An unresolvable package: every rolldown warning is fatal.
    expect((await attempt("missing", 'export { x } from "no-such-package";')).message).toMatch(
      /UNRESOLVED_IMPORT/,
    );
    // A dynamic import of a built-in: refused as dynamic loading.
    expect((await attempt("dyn", 'export const m = () => import("node:fs");')).problems).toEqual([
      "x.cjs uses dynamic import()",
    ]);
    // A string literal that opens a "comment" no longer hides code from the scan.
    expect(
      (await attempt("hidden", 'const s = "/*"; export const x = () => Math.random(); // */'))
        .problems,
    ).toEqual(["x.cjs uses .random (unseeded randomness)", "x.cjs uses Math.random"]);
    // A clock read through the real transform: refused.
    expect((await attempt("date", "export const t = () => Date.now();")).problems).toEqual([
      "x.cjs uses .now (clock)",
      "x.cjs uses Date (clock)",
    ]);
  }, 60_000);
});

describe("validateEngineCode (syntax-aware bundle validation, owner decision D-2)", () => {
  const check = (code: string) =>
    validateEngineCode(code, { fileName: "t.cjs", allowedRequires: [FAIRNESS_REQUIRE] }).problems;

  it.each([
    [
      "Math by a named, non-forbidden property",
      "exports.f = (x) => Math.floor(x) + Math.imul(x, 3) + Math.max(1, Math.PI);",
    ],
    [
      "console.error (the EventBus firewall)",
      'try { f(); } catch (e) { console.error("[engine] event listener failed:", "x", e); }',
    ],
    [
      "forbidden names inside string and template literals",
      'const s = "Math.random() /* setTimeout(eval) */ Date.now() process.env require(\\"node:fs\\")"; const t = `globalThis ${s} constructor`;',
    ],
    [
      "objects, literal and dynamic keys, class constructors and fields",
      'const o = { a: 1, "b": 2 }; o["a"]; o[`b`]; arr[i]; arr[0]; class C { constructor() { this.x = 1; } static y = 2; #z = 3; }',
    ],
    ["the allowed fairness require", `const fairness = require("${FAIRNESS_REQUIRE}");`],
    ["labels", "outer: for (const x of y) { if (x) continue outer; else break outer; }"],
    [
      "local bindings named like members, and generators",
      "const random = 1, now = 2; function* g() { yield random + now; }",
    ],
    [
      "the globals the engine uses",
      "Object.freeze(Symbol.for('nodejs.util.inspect.custom')); (1.5).toFixed(2); Number.isFinite(1);",
    ],
  ])("accepts %s", (_name, code) => {
    expect(check(code)).toEqual([]);
  });

  it("the pre-hardening comment-stripping scan missed a string that opens a comment", () => {
    const oldScan = (code: string) => /Math\s*\.\s*random/.test(stripComments(code));
    const hidden = 'const s = "/*"; exports.x = () => Math.random(); // */';
    expect(oldScan(hidden)).toBe(false); // the confirmed gap
    expect(check(hidden)).toEqual([
      "t.cjs uses .random (unseeded randomness)",
      "t.cjs uses Math.random",
    ]);
  });

  it.each([
    // Unseeded randomness
    [
      "exports.x = Math.random();",
      ["t.cjs uses .random (unseeded randomness)", "t.cjs uses Math.random"],
    ],
    [
      'exports.x = Math["random"]();',
      ["t.cjs uses .random (unseeded randomness)", "t.cjs uses Math[…]"],
    ],
    ["const M = Math; M.floor(1);", ["t.cjs uses Math as a value"]],
    [
      "const { random } = Math;",
      ["t.cjs uses .random (unseeded randomness)", "t.cjs uses Math as a value"],
    ],
    [
      "crypto.getRandomValues(new Uint8Array(4));",
      [
        "t.cjs uses .getRandomValues (unseeded randomness)",
        "t.cjs uses crypto (unseeded randomness)",
      ],
    ],
    // Date and clock access
    ["exports.t = () => Date.now();", ["t.cjs uses .now (clock)", "t.cjs uses Date (clock)"]],
    ["exports.t = () => new Date();", ["t.cjs uses Date (clock)"]],
    [
      "exports.t = () => performance.now();",
      ["t.cjs uses .now (clock)", "t.cjs uses performance (clock)"],
    ],
    ["exports.t = () => new Intl.DateTimeFormat();", ["t.cjs uses Intl (clock)"]],
    ["exports.t = (n) => n.toLocaleString();", ["t.cjs uses .toLocaleString (clock)"]],
    // process and module-system access
    ["exports.e = process.env.NODE_ENV;", ["t.cjs uses process (process / module system)"]],
    ["exports.b = Buffer.from('a');", ["t.cjs uses Buffer (process / module system)"]],
    ["module.exports = {};", ["t.cjs uses module (process / module system)"]],
    [
      "exports.d = __dirname + __filename;",
      [
        "t.cjs uses __dirname (process / module system)",
        "t.cjs uses __filename (process / module system)",
      ],
    ],
    // eval and constructed functions
    ['eval("1");', ["t.cjs uses eval (eval / constructed function)"]],
    [
      'exports.f = new Function("return 1");',
      ["t.cjs uses Function (eval / constructed function)"],
    ],
    [
      'exports.f = (function () {}).constructor("return 1");',
      ["t.cjs uses .constructor (eval / constructed function)"],
    ],
    ['exports.f = x["constructor"];', ["t.cjs uses .constructor (eval / constructed function)"]],
    ["exports.f = x[`constructor`];", ["t.cjs uses .constructor (eval / constructed function)"]],
    ["exports.p = x.__proto__;", ["t.cjs uses .__proto__ (eval / constructed function)"]],
    // Timers and asynchronous scheduling
    ["setTimeout(f, 1);", ["t.cjs uses setTimeout (timer / async scheduling)"]],
    [
      "setImmediate(f); clearTimeout(t);",
      [
        "t.cjs uses setImmediate (timer / async scheduling)",
        "t.cjs uses clearTimeout (timer / async scheduling)",
      ],
    ],
    ["queueMicrotask(f);", ["t.cjs uses queueMicrotask (timer / async scheduling)"]],
    ["Promise.resolve().then(f);", ["t.cjs uses Promise (timer / async scheduling)"]],
    ["async function f() {}", ["t.cjs uses an async function (timer / async scheduling)"]],
    ["exports.f = async () => {};", ["t.cjs uses an async function (timer / async scheduling)"]],
    [
      "exports.f = async function () { await 1; };",
      ["t.cjs uses an async function (timer / async scheduling)", "t.cjs uses await"],
    ],
    [
      "async function f() { for await (const x of y) {} }",
      [
        "t.cjs uses an async function (timer / async scheduling)",
        "t.cjs uses for await (timer / async scheduling)",
      ],
    ],
    [
      "new Worker('w.js'); new MessageChannel(); Atomics.wait(a, 0, 0);",
      [
        "t.cjs uses Worker (timer / async scheduling)",
        "t.cjs uses MessageChannel (timer / async scheduling)",
        "t.cjs uses Atomics (timer / async scheduling)",
      ],
    ],
    [
      "new WeakRef(o); new FinalizationRegistry(f);",
      [
        "t.cjs uses WeakRef (timer / async scheduling)",
        "t.cjs uses FinalizationRegistry (timer / async scheduling)",
      ],
    ],
    // globalThis and the global object
    [
      "globalThis.setTimeout(f, 1);",
      [
        "t.cjs uses .setTimeout (timer / async scheduling)",
        "t.cjs uses globalThis (global object)",
      ],
    ],
    [
      'exports.g = global["process"];',
      ["t.cjs uses .process (process / module system)", "t.cjs uses global (global object)"],
    ],
    ["window.x; self.x;", ["t.cjs uses window (global object)", "t.cjs uses self (global object)"]],
    [
      'exports.r = globalThis["Math"]["random"]();',
      ["t.cjs uses .random (unseeded randomness)", "t.cjs uses globalThis (global object)"],
    ],
    // Browser and network APIs (the pre-existing prohibitions)
    [
      "document.body; navigator.userAgent; localStorage.x; requestAnimationFrame(f);",
      [
        "t.cjs uses document (browser API)",
        "t.cjs uses navigator (browser API)",
        "t.cjs uses localStorage (browser API)",
        "t.cjs uses requestAnimationFrame (timer / async scheduling)",
      ],
    ],
    [
      'exports.c = canvas.getContext("2d"); new Image(); new Audio(); new AudioContext();',
      [
        "t.cjs uses .getContext (browser API)",
        "t.cjs uses Image (browser API)",
        "t.cjs uses Audio (browser API)",
        "t.cjs uses AudioContext (browser API)",
      ],
    ],
    [
      "fetch(u); new XMLHttpRequest(); new WebSocket(u); new EventSource(u);",
      [
        "t.cjs uses fetch (network)",
        "t.cjs uses XMLHttpRequest (network)",
        "t.cjs uses WebSocket (network)",
        "t.cjs uses EventSource (network)",
      ],
    ],
    // Dynamic scoping and loading
    ["with (o) { x; }", ["t.cjs uses with statement"]],
    ['exports.m = import("x");', ["t.cjs uses dynamic import()"]],
    ["exports.n = function () { return new.target; };", ["t.cjs uses import.meta / new.target"]],
    // require(): only a literal call to an allowed specifier
    ['require("node:fs");', ['unexpected require("node:fs") in t.cjs']],
    ['require("fs");', ['unexpected require("fs") in t.cjs']],
    ['require("zod");', ['unexpected require("zod") in t.cjs']],
    ['require("./other-chunk.cjs");', ['unexpected require("./other-chunk.cjs") in t.cjs']],
    ["require(name);", ["t.cjs uses require (other than a literal call)"]],
    ['require.resolve("x");', ["t.cjs uses require (other than a literal call)"]],
    ["const r = require;", ["t.cjs uses require (other than a literal call)"]],
    ['require("a", "b");', ["t.cjs uses require (other than a literal call)"]],
    // Specifiers that must not survive the build
    ['exports.s = "@/engine";', ['t.cjs uses an @/ specifier ("@/engine")']],
    ['exports.s = "./x.ts";', ['t.cjs uses a .ts specifier ("./x.ts")']],
    ["exports.s = `../src/a.tsx`;", ['t.cjs uses a .ts specifier ("../src/a.tsx")']],
    // console: only console.error
    ["exports.c = console.log('x');", ["t.cjs uses console.log"]],
    ["exports.c = console;", ["t.cjs uses console as a value"]],
  ])("refuses %s", (code, problems) => {
    expect(check(code)).toEqual(problems);
  });

  it("refuses code it cannot parse (including import.meta, invalid in CommonJS)", () => {
    for (const code of ["exports.x = (;", "exports.u = import.meta.url;"]) {
      const problems = check(code);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^t\.cjs cannot be parsed: /);
    }
  });
});

describe("the build-engine CLI (exit status, stale bundle, normal build workflow)", () => {
  it("`npm run build` cleans dist first and stops at the first failing step", () => {
    const pkg = JSON.parse(readFileSync(join(SERVER, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    // P8-4a-1: the last step verifies the build against the trusted integrity manifest.
    expect(pkg.scripts.build).toBe(
      "npm run clean && tsc -p tsconfig.build.json && node scripts/build-engine.mjs && node scripts/engine-integrity.mjs verify",
    );
    expect(pkg.scripts.clean).toBe(
      "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
    );
  });

  it("a refused bundle exits non-zero, removes the stale bundle and writes nothing", () => {
    // A copy of the script in its own server/ tree, so its fixed entry (engine/entry.ts) can be a
    // fixture; node_modules is a junction to this package's (removed before the tree).
    const root = join(tmp, "cli", "server");
    mkdirSync(join(root, "scripts"), { recursive: true });
    mkdirSync(join(root, "engine"), { recursive: true });
    cpSync(join(SERVER, "scripts", "build-engine.mjs"), join(root, "scripts", "build-engine.mjs"));
    symlinkSync(join(SERVER, "node_modules"), join(root, "node_modules"), "junction");
    const out = join(root, "dist");
    const run = () =>
      spawnSync(process.execPath, [join("scripts", "build-engine.mjs"), out], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
      });

    mkdirSync(join(out, "engine"), { recursive: true });
    writeFileSync(join(out, ENGINE_BUNDLE), "exports.stale = true;\n");
    writeFileSync(join(root, "engine", "entry.ts"), "export const pick = () => Math.random();\n");
    const refused = run();
    expect(refused.status).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toBe(
      "engine bundle refused:\n- engine.cjs uses .random (unseeded randomness)\n" +
        "- engine.cjs uses Math.random\n",
    );
    expect(readdirSync(join(out, "engine"))).toEqual([]);

    // The same tree with an acceptable entry: exit 0, exactly one bundle, no temporary file.
    writeFileSync(join(root, "engine", "entry.ts"), "export const two = () => 1 + 1;\n");
    const accepted = run();
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(accepted.stderr).toBe("");
    expect(readdirSync(join(out, "engine"))).toEqual(["engine.cjs"]);
    expect(readFileSync(join(out, ENGINE_BUNDLE), "utf8")).toMatch(/^exports\.two = two;$/m);
  }, 120_000);
});

describe("compiled run time (fresh Node process, Math.random and browser globals poisoned)", () => {
  it("exports exactly the approved surface", () => {
    expect(report.exports).toEqual(EXPORTS);
  });

  it("never calls Math.random and never touches a browser global", () => {
    expect(report.counters.mathRandom).toBe(0);
    expect(report.counters.browser).toEqual({});
  });

  it("loads only compiled .js/.cjs files from the build, each fairness module exactly once", () => {
    const own = report.loaded.compiled.filter((f) => !f.includes("duplicate"));
    expect(
      own.every((f) => /^(server\/src|src\/fairness|engine|qa)\/[\w/.-]+\.c?js$/.test(f)),
    ).toBe(true);
    expect(report.loaded.compiled.some((f) => /\.tsx?$/.test(f))).toBe(false);
    const fairness = own.filter((f) => f.startsWith("src/fairness/"));
    expect(new Set(fairness).size).toBe(fairness.length);
    expect(fairness.sort()).toEqual(
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
        .map((n) => `src/fairness/${n}.js`)
        .sort(),
    );
    expect(own.filter((f) => f === ENGINE_BUNDLE)).toEqual([ENGINE_BUNDLE]);
    // Nothing from the repository source, node_modules (no zod, no Fastify) or the protocol.
    for (const f of report.loaded.resolved) {
      expect(f).not.toMatch(/node_modules|src[\\/]protocol|AQUADIVE-GIT[\\/]src/);
    }
  });

  it("shares ONE fairness instance with the server's bridge; a second copy is refused", () => {
    expect(report.identity).toEqual({
      bridgeRoundDerivationIsCompiledIndex: true,
      bridgeSecretBytesIsCompiledIndex: true,
    });
    // Every bind of the server's RoundDerivation succeeded (see the bind replay below) …
    expect(report.bind).toHaveLength(16);
    // … and a RoundDerivation from a separate compiled copy fails SeededRound.bind's instanceof.
    expect(report.duplicate.distinctClass).toBe(true);
    expect(report.duplicate.refusal).toEqual({
      isSeededRoundError: true,
      code: "derivation-unusable",
      message: "derivation-unusable: a RoundDerivation is required",
    });
    // The production bundle's sealed runner refuses it with its fixed code and nothing else.
    expect(report.duplicate.production).toEqual({
      isRunnerError: true,
      code: "derivation-unusable",
      message: "derivation-unusable",
    });
  });

  it("the compiled pins are the source pins (A1–A8, B1–B8)", () => {
    expect(SOURCE_PINS).toHaveLength(16);
    expect(report.replay.pins).toEqual(SOURCE_PINS);
    expect(SOURCE_PINS.filter(([s]) => s === "A").map(([, i]) => i)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  const expectPins = (runs: RunSummary[]) => {
    const pins = new Map(SOURCE_PINS.map(([s, i, h]) => [`${s}${i}`, h]));
    expect(runs.map((r) => r.key).sort()).toEqual([...pins.keys()].sort());
    for (const r of runs) expect(r.recordSha256, r.key).toBe(pins.get(r.key));
  };

  it("SeededRound.create: every pinned round reproduces its record hash, in any order", () => {
    expectPins(report.replay.forward);
    expect(report.replay.again).toEqual(report.replay.forward);
    expectPins(report.replay.reversed);
    expect([...report.replay.reversed].reverse()).toEqual(report.replay.forward);
  });

  it("the server's RoundDerivation bound by the bundle reproduces every pin", () => {
    expectPins(report.bind);
    expect(report.bind).toEqual(report.replay.forward);
  });

  it("vault → RoundKeys.derivation → SeededRound.bind reproduces every pin", () => {
    expectPins(report.vault);
    const byKey = new Map(report.replay.forward.map((r) => [r.key, r]));
    for (const r of report.vault) expect(r).toEqual(byKey.get(r.key));
  });

  it("agrees with the independently generated outcome vectors (crash point, crash draws)", () => {
    expect(report.replay.vectors).toHaveLength(16);
    const byKey = new Map(report.replay.forward.map((r) => [r.key, r]));
    for (const v of report.replay.vectors) {
      const r = byKey.get(`${v.salt}${v.index}`)!;
      expect(r.crashAt, r.key).toBe(v.crashAt);
      expect(r.crashDraws, r.key).toBe(v.crashDraws);
    }
  });

  it("a live compiled round shows public facts only; its errors carry no secret", () => {
    expect(report.secrecy).toEqual({
      json: '{"fv":1,"chainIndex":7}',
      leakedViews: 0,
      errorRaised: true,
      errorLeaks: false,
    });
  });

  it("the production GameEngine over a TEST-ONLY LocalRoundAuthority runs a deterministic round", () => {
    // D-1: the constructor comes from a TEST-ONLY bundle of its unchanged source module.
    expect(localAuthorityModules).toEqual(LOCAL_AUTHORITY_MODULES);
    expect(report.local.exportedByProduction).toBe(false);
    expect(report.local.terminal).not.toBeNull();
    expect(report.local.ticks).toBeGreaterThan(60);
    expect(report.local.identical).toBe(true);
  });

  it("seeded authority is reachable only through SeededRound (no constructor is exported)", () => {
    expect(report.authorityRoute).toEqual({
      // K2: the production bundle's only functions are the sealed runner and its error class.
      functionExports: ["RoundRunnerError", "runSeededRound"],
      authorityClassExported: false,
      productionExportsEngineOrRound: false,
      authorityIsSeeded: true,
      depsAuthorityIsRoundAuthority: true,
      // RESIDUAL RISK (server/README.md §13): JavaScript reflection still reaches the class
      // through an instance's prototype, and GameEngine accepts any object with the
      // RoundAuthority methods. Closing either needs a change to unchanged engine or
      // seeded-round source, which is not authorized. Since P8-4a (K2) no round instance
      // leaves the production bundle, so this holds for the TEST-ONLY bundles here only.
      reflectionReachable: true,
    });
  });

  it("a throwing EventBus listener logs only the event name and its own error: no secret", () => {
    const e = report.eventBus;
    expect(e.terminal).not.toBeNull();
    // Every listener threw, and every throw produced exactly one console.error call …
    expect(e.calls).toHaveLength(e.listenerCalls);
    expect(e.listenerCalls).toBeGreaterThan(5);
    // … whose arguments are the fixed prefix, the event name and the very value thrown.
    for (const c of e.calls) {
      expect(c).toMatchObject({
        argCount: 3,
        prefix: "[engine] event listener failed:",
        isThrownValue: true,
      });
    }
    expect(e.calls.filter((c) => c.preReveal).map((c) => c.event)).toContain("diveStarted");
    expect(e.calls.some((c) => !c.preReveal)).toBe(true);
    // The output really went through console.error to stderr, and the round, its authority,
    // world stream and deps that the listeners attached to their errors were rendered sealed.
    expect(e.stderrBytes).toBeGreaterThan(0);
    expect(e.sealedMarkers).toBeGreaterThan(0);
    // No seed bytes, no outcome before its reveal, no draw count, no record digest.
    expect(e.leaks).toEqual([]);
  });
});
