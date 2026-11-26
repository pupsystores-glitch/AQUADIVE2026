// Isolated Authority Host (Stage 1) source boundaries. PLAY MONEY ONLY; offline only.
//
// - src/authority/ holds exactly its four modules; protocol.ts imports nothing (pure).
// - The trusted side (authority-main.ts, host.ts) imports only the scheduler, the integrity and
//   protected-file lists, the fairness crypto and node:net / node:path.
// - The application side (launcher.ts) imports only node:child_process, node:crypto, node:path
//   and the protocol: never the scheduler, source, controller, worker, round or fairness code.
// - Nothing in the startup, HTTP routes, gateway, operations code or the frontend reaches it.
// - No dynamic code, no module loading by name, no network listener, no file write; one process
//   spawn (the launcher's), with an explicit environment, no shell, and the fixed entry.
// - No reply carries the scheduler's internal residency diagnostics.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(SERVER, "src");
const DIR = join(SRC, "authority");
const REPO_SRC = resolve(SERVER, "..", "src");
const own = (m: string) => join(DIR, `${m}.ts`);

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
const resolveImport = (from: string, spec: string): string | null => {
  const target = resolve(dirname(from), spec);
  for (const c of [target, `${target}.ts`, join(target, "index.ts")]) {
    if (c.endsWith(".ts") && existsSync(c)) return c;
  }
  return null;
};
const closure = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of specifiers(file)) {
      if (!spec.startsWith(".")) continue;
      const t = resolveImport(file, spec);
      if (t !== null && t.startsWith(SRC + sep)) queue.push(t);
    }
  }
  return seen;
};
const code = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const rel = (f: string) => relative(SERVER, f).split(sep).join("/");

describe("src/authority/ contents and imports", () => {
  it("holds exactly the four modules", () => {
    expect(readdirSync(DIR).sort()).toEqual([
      "authority-main.ts",
      "host.ts",
      "launcher.ts",
      "protocol.ts",
    ]);
  });

  it("imports only what each side may use", () => {
    const allowed: Record<string, { readonly rel: string[]; readonly node: string[] }> = {
      protocol: { rel: [], node: [] },
      host: {
        rel: [
          join(SRC, "scheduler", "scheduler.ts"),
          join(SRC, "scheduler", "source.ts"),
          join(SRC, "scheduler", "clock.ts"),
          join(SRC, "scheduler", "events.ts"),
          own("protocol"),
        ],
        node: [],
      },
      "authority-main": {
        rel: [
          join(SRC, "fairness", "crypto-node.ts"),
          join(SRC, "prep", "protocol.ts"),
          join(SRC, "round", "engine-runtime.ts"),
          join(SRC, "round", "integrity.ts"),
          join(SRC, "scheduler", "source.ts"),
          own("host"),
          own("protocol"),
        ],
        node: ["node:net", "node:path"],
      },
      launcher: {
        rel: [own("protocol")],
        node: ["node:child_process", "node:crypto", "node:path", "node:stream"],
      },
    };
    for (const [m, a] of Object.entries(allowed)) {
      for (const spec of specifiers(own(m))) {
        if (spec.startsWith("."))
          expect(a.rel, `${m}: ${spec}`).toContain(resolveImport(own(m), spec));
        else expect(a.node, `${m}: ${spec}`).toContain(spec);
      }
    }
    expect(specifiers(own("protocol"))).toEqual([]);
  });

  it("the launcher (application side) never reaches any trusted module", () => {
    const reached = closure(own("launcher"));
    expect([...reached].map(rel).sort()).toEqual([
      "src/authority/launcher.ts",
      "src/authority/protocol.ts",
    ]);
    // (Its event-log digest domain string names the scheduler; no module path does.)
    expect(code(own("launcher"))).not.toMatch(
      /\/scheduler\/|\/prep\/|\/round\/|\/fairness|PrepWorker|RoundScript|SealedRound|sealed/,
    );
  });

  it("no dynamic code, no loading by name, no listener, no file write; one fixed spawn", () => {
    for (const m of ["protocol", "host", "authority-main", "launcher"]) {
      const source = code(own(m));
      expect(source, m).not.toMatch(
        /\beval\s*\(|new\s+Function\b|\bimport\s*\(|\brequire\s*\(|createServer|\.listen\(|node:(?:http|https|dgram|fs|cluster|worker_threads|inspector|vm)|\bnew Worker\b|\bfetch\s*\(|WebSocket|fastify|writeFile|appendFile/,
      );
      expect(/\bspawn\s*\(/.test(source), m).toBe(m === "launcher");
      expect(/process\.env/.test(source), m).toBe(m === "launcher" || m === "authority-main");
      expect(/residency\(\)/.test(source), m).toBe(m === "host");
    }
    const launcher = code(own("launcher"));
    expect(launcher.match(/\bspawn\s*\(/g)).toHaveLength(1);
    expect(launcher).toContain('const ENTRY = "authority-main.js";');
    expect(launcher).toContain('stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],');
    expect(launcher).toContain("shell: false,");
    expect(launcher).toContain("env: { ...spec.env },");
    expect(launcher).toContain(
      'env: Object.freeze({ NODE_ENV: nodeEnv === "test" ? "test" : "development" }),',
    );
    // The host's replay pacing is the only use of residency(); no reply is built from it.
    const host = code(own("host"));
    for (const line of host.split("\n").filter((l) => /residency\(\)/.test(l))) {
      expect(line).toMatch(/\.next === "requested"/);
    }
  });
});

describe("nothing reaches the Authority", () => {
  it("the startup, HTTP routes, gateway and operations code never reach src/authority/", () => {
    const entries = [join(SRC, "main.ts"), join(SRC, "app.ts")];
    const reached = new Set(entries.flatMap((e) => [...closure(e)]));
    expect(reached.size).toBeGreaterThan(10);
    for (const file of reached) expect(file.startsWith(DIR + sep), rel(file)).toBe(false);
    for (const file of walk(SRC)) {
      if (file.startsWith(DIR + sep)) continue;
      for (const spec of specifiers(file)) {
        expect(spec, rel(file)).not.toMatch(/(^|\/)authority(\/|$)/);
      }
    }
  });

  it("the frontend (repository src/) never references the Authority", () => {
    for (const file of walk(REPO_SRC)) {
      expect(
        /server\/src\/authority|AuthorityRelay|AuthorityHost/.test(readFileSync(file, "utf8")),
        file,
      ).toBe(false);
    }
  });
});
