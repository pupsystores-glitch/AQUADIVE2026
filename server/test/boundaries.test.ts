// Package boundaries and dependency resolution (P8-2 tests 19, 20; docs/09 §6.3).
//
// - Server source imports only Node built-ins, its three runtime
//   dependencies, and its own files; exactly two modules reach outside
//   `server/`: src/protocol.ts (the shared protocol, through its public
//   index) and, since P8-3c-0, src/fairness.ts (the shared fairness library,
//   through its public barrel `index.ts`).
// - No engine, shared, rendering, UI, audio or wallet code is imported.
// - The application startup, HTTP routes and WebSocket gateway never reach
//   the fairness bridge or server/src/fairness (P8-3c is not connected).
// - The frontend (../src) never imports the server.
// - The protocol's `zod` is this package's `zod`: one instance.
// - P8-4-0 (engine build integration): outside src/, exactly two places reach the engine.
//   engine/entry.ts, the bundle entry, imports only the public barrels `@/engine` and
//   `@/seeded-round`; scripts/build-engine.mjs imports only Node built-ins and rolldown (the
//   bundler and its parser `rolldown/parseAst`, used by the syntax-aware validation). Nothing
//   in src/ (startup, routes, gateway, fairness) imports either or loads the built bundle.
// - P8-4a (offline RoundScript precomputation; owner decision K3): engine/ also holds the sealed
//   round runner (round-runner.ts), the only file there that imports the two barrels; the entry
//   imports only the runner. Exactly one server module loads the built bundle —
//   src/round/engine-runtime.ts, with one literal-free `require(` of its fixed location — and
//   src/round/ imports only node:path, the fairness bridge, server/src/fairness modules and its
//   own files — and, since P8-4a-1, node:fs in integrity.ts only (reading the build and the
//   trusted manifest; nothing in src/round/ writes a file). The startup, HTTP routes and gateway never reach src/round/.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as protocol from "../../src/protocol";

const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
const SERVER_SRC = join(SERVER_DIR, "src");
const REPO_SRC = resolve(SERVER_DIR, "..", "src");
const PROTOCOL_INDEX = join(REPO_SRC, "protocol");
const FAIRNESS_BARREL = join(REPO_SRC, "fairness", "index.ts");
const PROTOCOL_BRIDGE = join(SERVER_SRC, "protocol.ts");
const FAIRNESS_BRIDGE = join(SERVER_SRC, "fairness.ts");
const FAIRNESS_DIR = join(SERVER_SRC, "fairness");

/** Each bridge and the one target it may import. */
const BRIDGES = new Map([
  [PROTOCOL_BRIDGE, PROTOCOL_INDEX],
  [FAIRNESS_BRIDGE, FAIRNESS_BARREL],
]);

const RUNTIME_PACKAGES = ["fastify", "@fastify/websocket", "zod"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });

const specifiers = (file: string) =>
  [
    ...readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g),
  ].map((m) => m[1]!);

/** Resolves a relative server import the way tsc (node10) and Node's CommonJS loader do. */
const resolveServerImport = (from: string, spec: string): string | null => {
  const target = resolve(dirname(from), spec);
  for (const candidate of [target, `${target}.ts`, join(target, "index.ts")]) {
    if (candidate.endsWith(".ts") && existsSync(candidate)) return candidate;
  }
  return null;
};

/** Every server source file reachable from `entry` through relative imports. */
const closure = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(file)) {
      if (!spec.startsWith(".")) continue;
      const target = resolveServerImport(file, spec);
      expect(target, `${relative(SERVER_DIR, file)} imports ${spec}`).not.toBeNull();
      if (target!.startsWith(SERVER_SRC + sep)) queue.push(target!);
    }
  }
  return seen;
};

describe("server import boundary", () => {
  it("server source imports only node built-ins, its dependencies and itself", () => {
    for (const file of walk(SERVER_SRC)) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) {
          const target = resolve(dirname(file), spec);
          const bridged = BRIDGES.get(file);
          if (bridged) expect(target).toBe(bridged);
          else expect(relative(SERVER_SRC, target).startsWith("..")).toBe(false);
        } else if (!spec.startsWith("node:")) {
          expect(RUNTIME_PACKAGES).toContain(spec);
        }
      }
    }
  });

  it("only the two bridges reach outside server/, each through one public entry", () => {
    const outside = walk(SERVER_SRC).filter((file) =>
      specifiers(file).some(
        (spec) =>
          spec.startsWith(".") &&
          relative(SERVER_SRC, resolve(dirname(file), spec)).startsWith(".."),
      ),
    );
    expect(outside.sort()).toEqual([FAIRNESS_BRIDGE, PROTOCOL_BRIDGE].sort());
    expect(specifiers(FAIRNESS_BRIDGE)).toEqual(["../../src/fairness/index.ts"]);
  });

  it("server/src/fairness has no index module, so its bridge imports resolve to the bridge", () => {
    expect(existsSync(join(FAIRNESS_DIR, "index.ts"))).toBe(false);
    // The directory exists from P8-3c-1 on; the P8-3c-0 bridge alone does not need it.
    for (const file of existsSync(FAIRNESS_DIR) ? walk(FAIRNESS_DIR) : []) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".") && !spec.startsWith("./")) {
          expect(resolveServerImport(file, spec), `${file}: ${spec}`).toBe(FAIRNESS_BRIDGE);
        }
      }
    }
  });

  it("the application startup, HTTP routes and gateway never reach the fairness modules", () => {
    const entries = [join(SERVER_SRC, "main.ts"), join(SERVER_SRC, "app.ts")];
    const reached = new Set(entries.flatMap((entry) => [...closure(entry)]));
    expect(reached.size).toBeGreaterThan(10);
    for (const file of reached) {
      expect(file).not.toBe(FAIRNESS_BRIDGE);
      expect(file.startsWith(FAIRNESS_DIR + sep), relative(SERVER_DIR, file)).toBe(false);
    }
    for (const dir of ["gateway", "http", "ops"]) {
      for (const file of walk(join(SERVER_SRC, dir))) {
        expect(readFileSync(file, "utf8"), relative(SERVER_DIR, file)).not.toMatch(/fairness/);
      }
    }
  });

  it("no file in the repository's src/ imports the server", () => {
    for (const file of walk(REPO_SRC)) {
      for (const spec of specifiers(file)) {
        expect(spec.includes("server/src")).toBe(false);
        if (spec.startsWith(".")) {
          expect(resolve(dirname(file), spec).startsWith(SERVER_DIR + sep)).toBe(false);
        }
      }
    }
  });
});

describe("engine build integration (P8-4-0, P8-4a)", () => {
  const ENGINE_DIR = join(SERVER_DIR, "engine");
  const SCRIPTS_DIR = join(SERVER_DIR, "scripts");
  const ROUND_DIR = join(SERVER_SRC, "round");
  const ENGINE_RUNTIME = join(ROUND_DIR, "engine-runtime.ts");

  it("engine/ and scripts/ hold exactly the entry, the sealed runner, its type check and the build script", () => {
    expect(readdirSync(ENGINE_DIR).sort()).toEqual([
      "entry.ts",
      "round-runner.ts",
      "tsconfig.json",
    ]);
    // P8-4a-1: plus the build integrity tool (verify / candidate) and its types.
    expect(readdirSync(SCRIPTS_DIR).sort()).toEqual([
      "build-engine.d.mts",
      "build-engine.mjs",
      "engine-integrity.d.mts",
      "engine-integrity.mjs",
    ]);
  });

  it("the integrity tool imports only Node built-ins and nothing of the build it checks", () => {
    for (const file of ["engine-integrity.mjs", "engine-integrity.d.mts"]) {
      for (const spec of specifiers(join(SCRIPTS_DIR, file))) {
        expect(spec, file).toMatch(/^node:/);
      }
      expect(readFileSync(join(SCRIPTS_DIR, file), "utf8"), file).not.toMatch(
        /\brequire\s*\(|\bimport\s*\(/,
      );
    }
  });

  it("the entry imports only the runner; the runner only the engine and seeded-round barrels", () => {
    expect(specifiers(join(ENGINE_DIR, "entry.ts"))).toEqual(["./round-runner"]);
    expect(specifiers(join(ENGINE_DIR, "round-runner.ts"))).toEqual(["@/engine", "@/seeded-round"]);
    for (const file of ["entry.ts", "round-runner.ts"]) {
      const source = readFileSync(join(ENGINE_DIR, file), "utf8");
      expect(source, file).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
    }
  });

  it("the build script imports only Node built-ins and rolldown (bundler and its parser)", () => {
    for (const file of ["build-engine.mjs", "build-engine.d.mts"]) {
      for (const spec of specifiers(join(SCRIPTS_DIR, file))) {
        expect(
          spec.startsWith("node:") || spec === "rolldown" || spec === "rolldown/parseAst",
          `${file}: ${spec}`,
        ).toBe(true);
      }
    }
    expect(specifiers(join(SCRIPTS_DIR, "build-engine.mjs"))).toContain("rolldown/parseAst");
  });

  it("nothing in src/ imports the bundle entry, the runner, the build script or the bundle", () => {
    for (const file of walk(SERVER_SRC)) {
      let source = readFileSync(file, "utf8");
      for (const spec of specifiers(file)) {
        // A path segment named engine, seeded-round or scripts (./engine-runtime is not one).
        expect(spec, relative(SERVER_DIR, file)).not.toMatch(
          /(^|\/)(engine|seeded-round|scripts)(\/|$)|round-runner|engine\.cjs|^@\//,
        );
      }
      if (file === ENGINE_RUNTIME) {
        // P8-4a exception (K3): the loader's one require of its fixed location and the bundle's
        // name (engine/engine.cjs); nothing else of the rule is relaxed.
        expect(source.match(/\brequire\s*\(/g)).toEqual(["require("]);
        expect(source).toContain("const exports: unknown = require(path);");
        expect(source).toContain('ENGINE_BUNDLE_LOCATION = "engine/engine.cjs"');
        source = source.replace("require(path)", "").replaceAll("engine.cjs", "");
      }
      expect(source, relative(SERVER_DIR, file)).not.toMatch(
        /engine\.cjs|build-engine|seeded-round|\brequire\s*\(/,
      );
    }
  });

  it("src/round/ imports only node:path, the fairness bridge and modules, and itself", () => {
    const allowed = new Set([FAIRNESS_BRIDGE, ...walk(FAIRNESS_DIR), ...walk(ROUND_DIR)]);
    expect(walk(ROUND_DIR).length).toBe(8);
    const INTEGRITY = join(ROUND_DIR, "integrity.ts");
    for (const file of walk(ROUND_DIR)) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) {
          const target = resolveServerImport(file, spec);
          expect(allowed.has(target!), `${relative(SERVER_DIR, file)}: ${spec}`).toBe(true);
        } else if (file === INTEGRITY) {
          // P8-4a-1: the integrity check reads files; it never writes one.
          expect(["node:path", "node:fs"], relative(SERVER_DIR, file)).toContain(spec);
        } else {
          expect(spec, relative(SERVER_DIR, file)).toBe("node:path");
        }
      }
    }
    // Only the loader names the bundle location; only prepare.ts is the pipeline's entry.
    expect(specifiers(ENGINE_RUNTIME)).toContain("node:path");
    expect(readFileSync(INTEGRITY, "utf8")).not.toMatch(
      /\b(write|append|rm|unlink|rename|copy)\w*Sync\b/,
    );
  });

  it("the application startup, HTTP routes and gateway never reach src/round/", () => {
    const entries = [join(SERVER_SRC, "main.ts"), join(SERVER_SRC, "app.ts")];
    const reached = new Set(entries.flatMap((entry) => [...closure(entry)]));
    for (const file of reached) {
      expect(file.startsWith(ROUND_DIR + sep), relative(SERVER_DIR, file)).toBe(false);
    }
    for (const dir of ["gateway", "http", "ops", "fairness"]) {
      for (const file of walk(join(SERVER_SRC, dir))) {
        for (const spec of specifiers(file)) {
          expect(spec, relative(SERVER_DIR, file)).not.toMatch(/(^|\/)round(\/|$)/);
        }
      }
    }
    for (const file of [join(SERVER_SRC, "main.ts"), join(SERVER_SRC, "app.ts")]) {
      expect(readFileSync(file, "utf8"), relative(SERVER_DIR, file)).not.toMatch(/round\//);
    }
  });
});

describe("offline preparation worker (P8-4b-0)", () => {
  const PREP_DIR = join(SERVER_SRC, "prep");
  const ROUND_DIR = join(SERVER_SRC, "round");
  const CONTROLLER = join(PREP_DIR, "controller.ts");
  const WORKER = join(PREP_DIR, "prep-worker.ts");

  it("src/prep/ holds exactly the controller, the worker entry and the message contract", () => {
    expect(readdirSync(PREP_DIR).sort()).toEqual([
      "controller.ts",
      "prep-worker.ts",
      "protocol.ts",
    ]);
  });

  it("src/prep/ imports only worker_threads, path, the fairness and round modules, and itself", () => {
    const allowed = new Set([
      FAIRNESS_BRIDGE,
      join(FAIRNESS_DIR, "crypto-node.ts"),
      ...["prepare", "errors", "engine-runtime", "integrity", "round-script"].map((f) =>
        join(ROUND_DIR, `${f}.ts`),
      ),
      ...walk(PREP_DIR),
    ]);
    for (const file of walk(PREP_DIR)) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) {
          const target = resolveServerImport(file, spec);
          expect(allowed.has(target!), `${relative(SERVER_DIR, file)}: ${spec}`).toBe(true);
        } else {
          expect(["node:worker_threads", "node:path"], relative(SERVER_DIR, file)).toContain(spec);
        }
      }
      // No dynamic code, no module loading by name, no network, no file writes.
      expect(readFileSync(file, "utf8"), relative(SERVER_DIR, file)).not.toMatch(
        /\beval\s*\(|new\s+Function\b|\bimport\s*\(|\brequire\s*\(|eval:\s*true|node:(?:http|net|fs|child_process)/,
      );
    }
    // The protocol is pure: it imports only the round error codes.
    expect(specifiers(join(PREP_DIR, "protocol.ts"))).toEqual(["../round/errors"]);
    // Only the worker entry creates the environment; only the controller creates a worker.
    for (const file of walk(PREP_DIR)) {
      const source = readFileSync(file, "utf8");
      expect(/createOfflineRoundEnvironment\(/.test(source), relative(SERVER_DIR, file)).toBe(
        file === WORKER,
      );
      expect((source.match(/new Worker\(/g) ?? []).length, relative(SERVER_DIR, file)).toBe(
        file === CONTROLLER ? 1 : 0,
      );
    }
    // The one worker: the fixed entry next to the controller, no eval, no inherited execArgv.
    // P8-4b-2 R-1b: the entry is a module-private constant (the export only reports it), and the
    // worker gets an explicit environment (an inherited one would carry NODE_OPTIONS).
    const controller = readFileSync(CONTROLLER, "utf8");
    expect(controller).toContain('const WORKER_ENTRY = "prep-worker.js";');
    expect(controller).toContain("export const PREP_WORKER_ENTRY = WORKER_ENTRY;");
    expect(controller).toContain("new Worker(join(__dirname, WORKER_ENTRY), {");
    expect(controller).toContain("eval: false,");
    expect(controller).toContain("execArgv: [],");
    expect(controller).toContain("env: workerEnv,");
  });

  it("the startup, routes, gateway and the round / fairness modules never reach src/prep/", () => {
    const entries = [join(SERVER_SRC, "main.ts"), join(SERVER_SRC, "app.ts")];
    const reached = new Set(entries.flatMap((entry) => [...closure(entry)]));
    for (const file of reached) {
      expect(file.startsWith(PREP_DIR + sep), relative(SERVER_DIR, file)).toBe(false);
    }
    for (const dir of ["gateway", "http", "ops", "fairness", "round"]) {
      for (const file of walk(join(SERVER_SRC, dir))) {
        for (const spec of specifiers(file)) {
          expect(spec, relative(SERVER_DIR, file)).not.toMatch(/(^|\/)prep(\/|$)/);
        }
      }
    }
    for (const file of entries) {
      expect(readFileSync(file, "utf8"), relative(SERVER_DIR, file)).not.toMatch(/prep\//);
    }
  });
});

describe("zod resolution", () => {
  it("this package resolves zod from its own node_modules", () => {
    const resolved = createRequire(import.meta.url).resolve("zod");
    expect(resolved.startsWith(join(SERVER_DIR, "node_modules", "zod") + sep)).toBe(true);
  });

  it("the shared protocol's schemas are built by the same zod instance as the server's", () => {
    expect(protocol.PublicSnapshotSchema).toBeInstanceOf(z.ZodType);
    expect(protocol.CLIENT_PAYLOADS.hello).toBeInstanceOf(z.ZodObject);
  });
});
