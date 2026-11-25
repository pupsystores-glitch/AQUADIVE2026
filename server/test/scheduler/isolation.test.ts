// Offline Global Round Scheduler isolation (P8-4b-2). PLAY MONEY ONLY; offline only.
//
// Source-level boundaries: src/scheduler/ holds exactly its eight modules, imports only what the
// design allows (the pure modules nothing of the worker, Node or the network), starts no timer,
// loads no code by name; nothing in the startup, HTTP routes, WebSocket gateway, operations code
// or the frontend reaches it; its public facade exposes no secret accessor. The compiled startup
// is checked at run time by scheduler-worker.test.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as facade from "../../src/scheduler/scheduler";
import { SchedulerError } from "../../src/scheduler/events";
import { GlobalRoundScheduler } from "../../src/scheduler/scheduler";
import { claimSealedRoundOpener, claimSourceSealing } from "../../src/scheduler/sealed";
import {
  PrepWorkerRoundSource,
  SCHEDULER_PROTECTED_FILES,
  claimSourceBinder,
  isApprovedSource,
} from "../../src/scheduler/source";

const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(SERVER, "src");
const DIR = join(SRC, "scheduler");
const REPO_SRC = resolve(SERVER, "..", "src");

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
const rel = (f: string) => relative(SERVER, f).split(sep).join("/");
const MODULES = [
  "clock",
  "core",
  "disclosure",
  "events",
  "scheduler",
  "sealed",
  "source",
  "timeline",
];

describe("src/scheduler/ contents and imports", () => {
  it("holds exactly the eight modules, which the protected-file list names", () => {
    expect(readdirSync(DIR).sort()).toEqual(MODULES.map((m) => `${m}.ts`));
    expect([...SCHEDULER_PROTECTED_FILES].sort()).toEqual(
      MODULES.map((m) => `server/src/scheduler/${m}.js`),
    );
  });

  it("imports only the approved modules; the pure modules nothing of the worker or Node", () => {
    const own = (m: string) => join(DIR, `${m}.ts`);
    const allowed: Record<string, readonly string[]> = {
      clock: [own("events")],
      timeline: [join(SRC, "round", "round-script.ts"), join(SRC, "round", "engine-types.ts")],
      events: [join(SRC, "fairness.ts")],
      sealed: [join(SRC, "fairness.ts"), join(SRC, "round", "round-script.ts"), own("events")],
      // R-1: the disclosure cursor binds RoundScript.prototype.secretContent once, at load.
      disclosure: [
        join(SRC, "fairness.ts"),
        join(SRC, "round", "round-script.ts"),
        own("events"),
        own("sealed"),
        own("timeline"),
      ],
      core: [
        join(SRC, "fairness.ts"),
        own("disclosure"),
        own("events"),
        own("sealed"),
        own("timeline"),
        own("clock"),
      ],
      source: [
        join(SRC, "fairness.ts"),
        join(SRC, "fairness", "crypto-node.ts"),
        join(SRC, "prep", "controller.ts"),
        join(SRC, "prep", "protocol.ts"),
        join(SRC, "round", "engine-runtime.ts"),
        join(SRC, "round", "errors.ts"),
        join(SRC, "round", "integrity.ts"),
        own("core"),
        own("events"),
        own("sealed"),
      ],
      scheduler: [
        join(SRC, "fairness", "crypto-node.ts"),
        own("core"),
        own("clock"),
        own("events"),
        own("source"),
      ],
    };
    for (const m of MODULES) {
      const file = own(m);
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) {
          const target = resolveImport(file, spec);
          expect(allowed[m], `${m}: ${spec}`).toContain(target);
        } else {
          // Node built-ins: the source adapter's node:path (its fixed build root) and the driver's
          // node:util/types (isProxy: hostile options are refused, H-1). Nothing else.
          const builtin =
            (m === "source" && spec === "node:path") ||
            (m === "scheduler" && spec === "node:util/types");
          expect(builtin, `${m}: ${spec}`).toBe(true);
        }
      }
    }
  });

  it("no timer, loop, dynamic code, module loading by name, network, file or worker access", () => {
    for (const m of MODULES) {
      // Code only: the header comments name what the module is NOT connected to.
      const source = readFileSync(join(DIR, `${m}.ts`), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(source.length, m).toBeGreaterThan(500);
      expect(source, m).not.toMatch(
        /\beval\s*\(|new\s+Function\b|\bimport\s*\(|\brequire\s*\(|setTimeout|setInterval|setImmediate|queueMicrotask|node:(?:http|https|net|dgram|fs|child_process|worker_threads|cluster)|\bnew Worker\b|\bfetch\s*\(|WebSocket|fastify/,
      );
      // Only the clock adapter reads hrtime; only the driver and the source read the module cache.
      expect(/process\.hrtime/.test(source), m).toBe(m === "clock");
      expect(/require\.cache/.test(source), m).toBe(m === "source");
      expect(/Date\.now|new Date\b|performance\.now|Math\.random/.test(source), m).toBe(false);
    }
  });

  it("R-1: every one-time capability is claimed as the facade loads; no public claim exists", () => {
    // disclosure.ts claimed the opener, source.ts the sealing capability, scheduler.ts the binder.
    expect(() => claimSealedRoundOpener()).toThrow("sealed-misuse: opener-claimed");
    expect(() => claimSourceSealing()).toThrow("sealed-misuse: sealing-claimed");
    expect(() => claimSourceBinder()).toThrow("invalid-state: binder-claimed");
    expect(() => claimSourceBinder()).toThrow("invalid-state: binder-claimed");
    // The source has no method that binds a listener or requests a round (R-1: the patched
    // `claim` captured the scheduler's listener).
    expect(Object.getOwnPropertyNames(PrepWorkerRoundSource.prototype).sort()).toEqual(
      ["checkHealth", "close", "constructor", "state", "terminate", "toJSON"].sort(),
    );
    expect(Object.getOwnPropertyNames(PrepWorkerRoundSource).sort()).toEqual(
      ["length", "name", "prototype", "start"].sort(),
    );
    for (const target of [
      PrepWorkerRoundSource,
      PrepWorkerRoundSource.prototype,
      GlobalRoundScheduler,
      GlobalRoundScheduler.prototype,
    ]) {
      expect(Object.isFrozen(target)).toBe(true);
    }
    // The approval check is a private-field brand: look-alikes and Proxies are not sources.
    const fake = Object.create(PrepWorkerRoundSource.prototype);
    for (const v of [fake, new Proxy(fake, {}), {}, null, undefined]) {
      expect(isApprovedSource(v)).toBe(false);
    }
  });

  it("the public facade exports only the scheduler class; no method hands out a script", () => {
    expect(Object.keys(facade)).toEqual(["GlobalRoundScheduler"]);
    expect(Object.getOwnPropertyNames(GlobalRoundScheduler.prototype).sort()).toEqual(
      [
        "close",
        "constructor",
        "digest",
        "events",
        "poll",
        "residency",
        "snapshot",
        "start",
        "state",
        "stop",
        "toJSON",
      ].sort(),
    );
    expect(Object.getOwnPropertyNames(GlobalRoundScheduler).sort()).toEqual(
      ["create", "length", "name", "prototype"].sort(),
    );
    // In source form (no compiled build) creation is refused before anything starts.
    expect(() => GlobalRoundScheduler.create({ clock: {}, source: {} } as never)).toThrow(
      "invalid-argument: invalid-clock",
    );
    expect(() =>
      GlobalRoundScheduler.create({ clock: { nowNs: () => 0n }, source: {} } as never),
    ).toThrow("source-not-approved");
    expect(() =>
      GlobalRoundScheduler.create({ clock: { nowNs: () => 0n }, source: {}, extra: 1 } as never),
    ).toThrow("invalid-argument: invalid-options");
  });

  it("H-1: options are read once; getters, Proxies and hostile traps are refused", () => {
    const clock = { nowNs: () => 0n };
    let reads = 0;
    const getter = {
      clock,
      get source() {
        reads += 1;
        return {};
      },
    };
    const hostile: unknown[] = [
      getter,
      new Proxy({ clock, source: {} }, {}),
      new Proxy(
        {},
        {
          ownKeys: () => {
            throw new Error("hostile");
          },
        },
      ),
      Object.defineProperty({ source: {} }, "clock", { get: () => clock, enumerable: true }),
      { clock, source: {}, [Symbol("x")]: 1 },
      [clock],
    ];
    for (const options of hostile) {
      expect(() => GlobalRoundScheduler.create(options as never)).toThrow(
        new SchedulerError("invalid-argument", "invalid-options"),
      );
    }
    expect(reads).toBe(0); // the getter was never invoked
    for (const bad of [
      new Proxy(clock, {}),
      { nowNs: new Proxy(() => 0n, {}) },
      Object.defineProperty({}, "nowNs", {
        get: () => {
          throw new Error("hostile");
        },
      }),
    ]) {
      expect(() => GlobalRoundScheduler.create({ clock: bad, source: {} } as never)).toThrow(
        new SchedulerError("invalid-argument", "invalid-clock"),
      );
    }
  });
});

describe("nothing reaches the scheduler", () => {
  it("the startup, HTTP routes, gateway, operations and configuration never reach src/scheduler/", () => {
    const entries = [join(SRC, "main.ts"), join(SRC, "app.ts")];
    const reached = new Set(entries.flatMap((e) => [...closure(e)]));
    expect(reached.size).toBeGreaterThan(10);
    for (const file of reached) expect(file.startsWith(DIR + sep), rel(file)).toBe(false);
    for (const file of walk(SRC)) {
      if (file.startsWith(DIR + sep)) continue;
      for (const spec of specifiers(file)) {
        expect(spec, rel(file)).not.toMatch(/(^|\/)scheduler(\/|$)/);
      }
      // The integrity rules name the protected directory (P8-4b-2 expansion); nothing else may.
      if (file === join(SRC, "round", "integrity.ts")) continue;
      expect(readFileSync(file, "utf8"), rel(file)).not.toMatch(/GlobalRoundScheduler|scheduler\//);
    }
  });

  it("the round, prep and fairness modules do not depend on the scheduler", () => {
    for (const dir of ["round", "prep", "fairness", "gateway", "http", "ops"]) {
      for (const file of walk(join(SRC, dir))) {
        for (const spec of specifiers(file)) {
          expect(spec, rel(file)).not.toMatch(/scheduler/);
        }
      }
    }
  });

  it("the frontend (repository src/) never references the server scheduler", () => {
    for (const file of walk(REPO_SRC)) {
      const text = readFileSync(file, "utf8");
      expect(
        /server\/src\/scheduler|GlobalRoundScheduler|PrepWorkerRoundSource/.test(text),
        file,
      ).toBe(false);
    }
  });
});
