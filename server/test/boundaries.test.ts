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
