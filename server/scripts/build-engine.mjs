// Builds the server's engine bundle (P8-4-0). PLAY MONEY ONLY; not connected.
//
//   node scripts/build-engine.mjs [distDir]      (default: server/dist; `npm run build` runs it)
//
// Bundles engine/entry.ts — since P8-4a the sealed round runner engine/round-runner.ts over the
// existing src/engine and src/seeded-round source, unchanged — with rolldown into
// <dist>/engine/engine.cjs as CommonJS:
//
// - `@/` imports are resolved to the repository's src/ at build time; none survives in the
//   output. Type-only imports (the rendering layer's types) are erased by the transform.
// - `@/fairness` stays EXTERNAL and is emitted as require("../src/fairness/index.js"): the
//   fairness module that `tsc -p tsconfig.build.json` compiles into <dist>/src/fairness/ and that
//   the server's bridge (src/fairness.ts) loads. One fairness instance at run time, so
//   `SeededRound.bind` accepts the server's `RoundDerivation` (it checks `instanceof`).
// - Fail closed: the build throws (and leaves no bundle at the target) if a bundled module is
//   outside the allow-list (no rendering, UI, audio, protocol, fairness, test or package module),
//   or if `validateEngineCode` refuses the emitted code. The CLI then exits non-zero.
// - `validateEngineCode` (P8-4-0 hardening, owner decision D-2) parses the EMITTED executable
//   code with rolldown's own parser (`rolldown/parseAst`, the oxc parser of the declared
//   rolldown dependency; no new dependency) and checks the syntax tree, so comments and string
//   literals can neither hide code nor trigger a match. It refuses: unseeded randomness
//   (Math.random, crypto), clocks (Date, performance, Intl, locale formatting), process and
//   module-system access (process, Buffer, module, __dirname, __filename, any `require` other
//   than a literal call to an allowed specifier), eval and constructed functions (eval,
//   Function, `.constructor`), timers and asynchronous scheduling (setTimeout & co.,
//   queueMicrotask, Promise, async functions, await, workers, channels, Atomics), the global
//   object (globalThis, global, window, self), browser APIs, network APIs, `with`, `import()`,
//   `import.meta`, and `@/` or `.ts` specifiers. `Math` may only be read by a named property
//   and `console` only as `console.error` (the engine's EventBus listener firewall).
// - The bundle is written to a temporary file and renamed into place; an existing bundle at the
//   target is removed before the build starts, so a failed build never leaves a stale one.
//
// `buildEngineBundle` is also used by test/engine/ to build into a temporary directory, and,
// with `allowTestModules`, to build TEST-ONLY bundles of src/seeded-round/test/ helpers that
// load the production bundle through `external` (never shipped).
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
import { parseAst } from "rolldown/parseAst";

export const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
export const REPO_DIR = join(SERVER_DIR, "..");
export const ENGINE_ENTRY = join(SERVER_DIR, "engine", "entry.ts");
/** The bundle's path inside a server build directory. */
export const ENGINE_BUNDLE = "engine/engine.cjs";
/** How the bundle requires the fairness module compiled by tsc (relative to ENGINE_BUNDLE). */
export const FAIRNESS_REQUIRE = "../src/fairness/index.js";

const posix = (p) => p.split(sep).join("/");

/** Repository-relative module paths the production bundle may contain. */
const PRODUCTION_MODULE =
  /^(server\/engine\/(entry|round-runner)\.ts|src\/(engine|shared|seeded-round)\/[^]+\.ts)$/;
const TEST_MODULE = /(^|\/)test\/|\.test\.ts$/;

/** Identifiers the emitted code may not name at all (reference, binding or shadowing). */
const FORBIDDEN_GLOBALS = new Map(
  Object.entries({
    "unseeded randomness": ["crypto"],
    clock: ["Date", "performance", "Intl"],
    "process / module system": ["process", "Buffer", "module", "__dirname", "__filename"],
    "eval / constructed function": ["eval", "Function"],
    "timer / async scheduling": [
      "setTimeout",
      "setInterval",
      "setImmediate",
      "clearTimeout",
      "clearInterval",
      "clearImmediate",
      "queueMicrotask",
      "requestIdleCallback",
      "cancelIdleCallback",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "Promise",
      "MessageChannel",
      "MessagePort",
      "BroadcastChannel",
      "Worker",
      "SharedArrayBuffer",
      "Atomics",
      "WeakRef",
      "FinalizationRegistry",
    ],
    "global object": ["globalThis", "global", "window", "self", "frames", "parent", "top"],
    "browser API": [
      "document",
      "navigator",
      "location",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "HTMLCanvasElement",
      "OffscreenCanvas",
      "CanvasRenderingContext2D",
      "Image",
      "Audio",
      "AudioContext",
      "postMessage",
      "importScripts",
    ],
    network: ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"],
  }).flatMap(([category, names]) => names.map((n) => [n, category])),
);

/** Property names the emitted code may not access on any object (named or literal key). */
const FORBIDDEN_MEMBERS = new Map(
  Object.entries({
    "unseeded randomness": ["random", "getRandomValues", "randomUUID"],
    "eval / constructed function": ["constructor", "__proto__", "eval"],
    clock: ["now", "toLocaleString", "toLocaleDateString", "toLocaleTimeString", "localeCompare"],
    "browser API": ["getContext"],
  }).flatMap(([category, names]) => names.map((n) => [n, category])),
);

/** Globals the emitted code may read only by a named, non-forbidden property. */
const RESTRICTED_OBJECTS = {
  Math: (name) => !FORBIDDEN_MEMBERS.has(name),
  console: (name) => name === "error",
};

/** Node types refused outright: dynamic scoping, dynamic loading and async scheduling. */
const FORBIDDEN_SYNTAX = {
  WithStatement: "with statement",
  ImportExpression: "dynamic import()",
  MetaProperty: "import.meta / new.target",
  AwaitExpression: "await",
};

/**
 * Validates emitted bundle code by its syntax tree (not by text), so comments and string
 * literals neither hide nor fake a match. Returns the problems found (empty = accepted) and
 * every literal `require()` specifier.
 *
 * @param {string} code the emitted (executable) CommonJS code
 * @param {{ fileName?: string, allowedRequires?: Iterable<string> }} [options]
 */
export function validateEngineCode(code, options = {}) {
  const file = options.fileName ?? "bundle";
  const allowed = new Set(options.allowedRequires ?? []);
  const problems = [];
  const requires = [];
  const refuse = (what) => problems.push(`${file} uses ${what}`);
  let ast;
  try {
    ast = parseAst(code, { sourceType: "commonjs", lang: "js" });
  } catch (e) {
    return {
      problems: [`${file} cannot be parsed: ${String(e.message).split("\n")[0]}`],
      requires,
    };
  }
  /** A literal property key: an identifier, a string literal or a template without `${}`. */
  const keyOf = (node, computed) => {
    if (!computed) return node.type === "Identifier" ? node.name : null;
    if (node.type === "Literal" && typeof node.value === "string") return node.value;
    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
      return node.quasis[0].value.cooked;
    }
    return null;
  };
  const checkKey = (name) => {
    if (name === null) return;
    if (FORBIDDEN_MEMBERS.has(name)) refuse(`.${name} (${FORBIDDEN_MEMBERS.get(name)})`);
    else if (FORBIDDEN_GLOBALS.has(name)) refuse(`.${name} (${FORBIDDEN_GLOBALS.get(name)})`);
  };
  const checkString = (value) => {
    if (value.startsWith("@/")) refuse(`an @/ specifier ("${value}")`);
    if (/^[^\s"']+\.[cm]?tsx?$/.test(value)) refuse(`a .ts specifier ("${value}")`);
  };
  const identifier = (node, parent, key) => {
    const name = node.name;
    if (FORBIDDEN_GLOBALS.has(name)) return refuse(`${name} (${FORBIDDEN_GLOBALS.get(name)})`);
    if (Object.hasOwn(RESTRICTED_OBJECTS, name)) {
      const named =
        parent?.type === "MemberExpression" &&
        key === "object" &&
        !parent.computed &&
        RESTRICTED_OBJECTS[name](parent.property.name);
      if (!named) {
        const what =
          parent?.type === "MemberExpression" && key === "object"
            ? `${name}${parent.computed ? "[…]" : "." + parent.property.name}`
            : `${name} as a value`;
        refuse(what);
      }
      return;
    }
    if (name === "require") {
      const arg = parent?.arguments?.[0];
      const literalCall =
        parent?.type === "CallExpression" &&
        key === "callee" &&
        parent.arguments.length === 1 &&
        arg.type === "Literal" &&
        typeof arg.value === "string";
      if (!literalCall) return refuse("require (other than a literal call)");
      requires.push(arg.value);
      if (!allowed.has(arg.value)) problems.push(`unexpected require("${arg.value}") in ${file}`);
    }
  };
  const visit = (node, parent, key) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, key);
      return;
    }
    if (node === null || typeof node !== "object" || typeof node.type !== "string") return;
    switch (node.type) {
      case "Identifier":
        // Property names are not references: member names, object keys, class member names
        // and labels are checked as keys (or not at all) by their parent.
        if (parent?.type === "MemberExpression" && key === "property" && !parent.computed) break;
        if (parent?.type === "Property" && key === "key" && !parent.computed) break;
        if (
          /^(MethodDefinition|PropertyDefinition)$/.test(parent?.type) &&
          key === "key" &&
          !parent.computed
        ) {
          break;
        }
        if (key === "label") break;
        identifier(node, parent, key);
        break;
      case "MemberExpression":
        checkKey(keyOf(node.property, node.computed));
        break;
      case "Property":
        checkKey(keyOf(node.key, node.computed));
        break;
      case "Literal":
        if (typeof node.value === "string") checkString(node.value);
        break;
      case "TemplateElement":
        checkString(node.value.cooked ?? node.value.raw);
        break;
      case "ForOfStatement":
        if (node.await) refuse("for await (timer / async scheduling)");
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.async) refuse("an async function (timer / async scheduling)");
        break;
      default:
        if (Object.hasOwn(FORBIDDEN_SYNTAX, node.type)) refuse(FORBIDDEN_SYNTAX[node.type]);
    }
    for (const [k, v] of Object.entries(node)) {
      if (k !== "type" && v !== null && typeof v === "object") visit(v, node, k);
    }
  };
  visit(ast, null, null);
  return { problems, requires };
}

/** Writes `code` to a temporary sibling and renames it into place, then re-reads it. */
function writeAtomically(target, code) {
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, code);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  if (readFileSync(target, "utf8") !== code) {
    rmSync(target, { force: true });
    throw new Error(`engine bundle refused: ${target} does not hold the validated code`);
  }
}

/** The refusal error; `problems` lists every reason (tests assert them exactly). */
function refusal(problems) {
  const error = new Error(`engine bundle refused:\n- ${problems.join("\n- ")}`);
  error.problems = problems;
  return error;
}

/**
 * Builds one CommonJS bundle and returns its code and repository-relative module list.
 *
 * @param {object} [options]
 * @param {string} [options.dist] server build directory (default server/dist)
 * @param {string | Record<string, string>} [options.input] entry file(s) (default engine/entry.ts)
 * @param {string} [options.file] output file relative to `dist` (single entry)
 * @param {string} [options.dir] output directory relative to `dist` (multiple entries)
 * @param {Record<string, string>} [options.external] extra external specifier → emitted require
 * @param {boolean} [options.allowTestModules] TEST-ONLY bundles: allow src/seeded-round/test/
 */
export async function buildEngineBundle(options = {}) {
  const dist = options.dist ?? join(SERVER_DIR, "dist");
  // A bundle left at the target by an earlier build is removed first: whatever fails below,
  // no stale bundle remains to be loaded in its place.
  if (options.file) rmSync(join(dist, options.file), { force: true });
  const external = { "@/fairness": FAIRNESS_REQUIRE, ...options.external };
  // Externals are matched on the exact specifier text and given a virtual id, so `paths` emits
  // exactly the configured require (rolldown would otherwise re-resolve a relative external).
  const VIRTUAL = "aquadive-external:";
  const externals = {
    name: "aquadive-externals",
    resolveId(source) {
      return Object.hasOwn(external, source) ? { id: VIRTUAL + source, external: true } : null;
    },
  };
  const bundle = await rolldown({
    input: options.input ?? ENGINE_ENTRY,
    cwd: REPO_DIR,
    platform: "node",
    plugins: [externals],
    resolve: { alias: { "@": join(REPO_DIR, "src") } },
    // Fixed transform target: the server's tsconfig (ES2022), independent of any discovered file.
    tsconfig: false,
    transform: { target: "es2022" },
    treeshake: true,
    logLevel: "warn",
    onLog(level, log) {
      throw new Error(`rolldown ${level}: ${log.message}`);
    },
  });
  try {
    const { output } = await bundle.generate({
      format: "cjs",
      exports: "named",
      paths: (id) => (id.startsWith(VIRTUAL) ? external[id.slice(VIRTUAL.length)] : id),
      sourcemap: false,
      minify: false,
      comments: { legal: false },
      entryFileNames: "[name].cjs",
      chunkFileNames: "[name]-chunk.cjs",
      banner:
        "// GENERATED by server/scripts/build-engine.mjs (P8-4-0, P8-4a) from src/engine, " +
        "src/seeded-round and server/engine. Do not edit.",
    });
    const chunks = output.filter((o) => o.type === "chunk");
    if (options.file && chunks.length !== 1) throw new Error("expected exactly one chunk");
    const outDir = join(dist, options.file ? dirname(options.file) : (options.dir ?? "engine"));
    // The configured externals and, for multi-entry TEST-ONLY builds, this build's own chunks.
    const allowedRequires = new Set([
      ...Object.values(external),
      ...chunks.map((c) => `./${c.fileName}`),
    ]);
    const result = [];
    const problems = [];
    for (const chunk of chunks) {
      const modules = chunk.moduleIds.map((id) => posix(relative(REPO_DIR, id))).sort();
      for (const m of modules) {
        const ok =
          (PRODUCTION_MODULE.test(m) && !TEST_MODULE.test(m)) ||
          (options.allowTestModules === true && isQaModule(m));
        if (!ok) problems.push(`module not allowed: ${m}`);
      }
      // The emitted executable code exactly as it is written, comments included, reported
      // under the name of the file it would be written to.
      const checked = validateEngineCode(chunk.code, {
        fileName: options.file ? basename(options.file) : chunk.fileName,
        allowedRequires,
      });
      problems.push(...checked.problems);
      result.push({
        fileName: chunk.fileName,
        code: chunk.code,
        modules,
        requires: checked.requires,
      });
    }
    const targets = result.map((c) =>
      options.file ? join(dist, options.file) : join(outDir, c.fileName),
    );
    if (problems.length > 0) {
      for (const t of targets) rmSync(t, { force: true });
      throw refusal(problems);
    }
    mkdirSync(outDir, { recursive: true });
    result.forEach((c, i) => {
      writeAtomically(targets[i], c.code);
      c.path = targets[i];
    });
    return result;
  } finally {
    await bundle.close();
  }
}

/** TEST-ONLY bundles may also contain the seeded-round test helpers (never shipped). */
const isQaModule = (m) => /^src\/seeded-round\/test\/[a-z-]+\.ts$/.test(m);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dist = process.argv[2] ?? join(SERVER_DIR, "dist");
  try {
    const [bundle] = await buildEngineBundle({ dist, file: ENGINE_BUNDLE });
    console.log(
      `engine bundle: ${posix(relative(process.cwd(), bundle.path))} ` +
        `(${bundle.modules.length} modules, requires ${bundle.requires.join(", ")})`,
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
