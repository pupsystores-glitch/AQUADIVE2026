// Package boundaries and dependency resolution (P8-2 tests 19, 20; docs/09 §6.3).
//
// - Server source imports only Node built-ins, its three runtime
//   dependencies, and its own files; exactly one module (src/protocol.ts)
//   reaches the shared protocol, through its public index.
// - No engine, shared, rendering, UI, audio or wallet code is imported.
// - The frontend (../src) never imports the server.
// - The protocol's `zod` is this package's `zod`: one instance.
import { readdirSync, readFileSync, statSync } from "node:fs";
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
const BRIDGE = join(SERVER_SRC, "protocol.ts");

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

describe("server import boundary", () => {
  it("server source imports only node built-ins, its dependencies and itself", () => {
    for (const file of walk(SERVER_SRC)) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) {
          const target = resolve(dirname(file), spec);
          if (file === BRIDGE) expect(target).toBe(PROTOCOL_INDEX);
          else expect(relative(SERVER_SRC, target).startsWith("..")).toBe(false);
        } else if (!spec.startsWith("node:")) {
          expect(RUNTIME_PACKAGES).toContain(spec);
        }
      }
    }
  });

  it("only src/protocol.ts reaches the shared protocol, and only its public index", () => {
    const outside = walk(SERVER_SRC).filter((file) =>
      specifiers(file).some(
        (spec) =>
          spec.startsWith(".") &&
          relative(SERVER_SRC, resolve(dirname(file), spec)).startsWith(".."),
      ),
    );
    expect(outside).toEqual([BRIDGE]);
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
