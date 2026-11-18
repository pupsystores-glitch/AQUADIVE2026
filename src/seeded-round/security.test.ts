// Security, isolation and confidentiality of src/seeded-round (P8-3b; owner decisions D-B1, D-B4).
// - Production files import only the `@/engine` and `@/fairness` public barrels and each other.
// - No Math.random, clock, logging, network, DOM, process, timers or eval in production.
// - Nothing in the application or the server imports src/seeded-round.
// - Before the reveal no draw count, outcome, seed or block leaks through serialization,
//   string conversion, inspection, enumeration or error messages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { format, inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { GameEngine } from "@/engine";
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  RoundDerivation,
  SecretBytes,
  hexToBytes,
  type RoundDerivationInput,
} from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { SeededRound, SeededRoundError } from "./index";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const PRODUCTION = [
  "index.ts",
  "errors.ts",
  "lifecycle.ts",
  "secrecy.ts",
  "purpose-rng.ts",
  "authority.ts",
  "seeded-round.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const specifiers = (src: string) =>
  [...src.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]);

describe("production import boundary", () => {
  it("the production file set is exactly the authorized one", () => {
    const actual = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(actual.sort()).toEqual([...PRODUCTION].sort());
  });

  it.each(PRODUCTION)("%s imports only @/engine, @/fairness and sibling modules", (file) => {
    const src = code(join(here, file));
    expect([...src.matchAll(/\bimport\s*\(|\brequire\s*\(/g)]).toEqual([]);
    for (const s of specifiers(src)) {
      const ok =
        s === "@/engine" ||
        s === "@/fairness" ||
        (/^\.\/[a-z-]+$/.test(s) && PRODUCTION.includes(`${s.slice(2)}.ts`));
      expect(ok, `${file} imports ${s}`).toBe(true);
    }
  });

  it.each(PRODUCTION)("%s uses no forbidden runtime facility", (file) => {
    const src = code(join(here, file));
    const forbidden: [string, RegExp][] = [
      ["Math.random", /Math\s*\.\s*random/],
      ["Date", /\bDate\b/],
      ["performance", /\bperformance\b/],
      ["console", /\bconsole\b/],
      ["process", /\bprocess\b/],
      ["globalThis / window / self", /\b(globalThis|window|self)\b/],
      ["DOM", /\b(document|navigator|localStorage|sessionStorage)\b/],
      ["network", /\b(fetch|XMLHttpRequest|WebSocket)\b/],
      ["crypto global", /\bcrypto\s*\./],
      ["eval", /\beval\s*\(|\bnew\s+Function\b/],
      ["timers", /\b(setTimeout|setInterval|setImmediate|queueMicrotask)\b/],
      ["zod / fastify", /\b(zod|fastify)\b/i],
    ];
    for (const [name, re] of forbidden) expect(re.test(src), `${file} uses ${name}`).toBe(false);
  });

  it("test helpers stay under test/ and production never imports them", () => {
    for (const file of PRODUCTION) expect(code(join(here, file))).not.toMatch(/\.\/test\//);
  });

  it("tests and test helpers use only the engine's public barrel (no private engine module)", () => {
    for (const f of walk(here)) {
      for (const s of specifiers(readFileSync(f, "utf8"))) {
        expect(s, relative(repo, f)).not.toMatch(/^@\/engine\//);
      }
    }
  });
});

describe("isolation from the application and the server", () => {
  it("no file outside src/seeded-round imports it", () => {
    const roots = [join(repo, "src"), join(repo, "server", "src"), join(repo, "server", "test")];
    const offenders: string[] = [];
    for (const root of roots) {
      let files: string[] = [];
      try {
        files = walk(root);
      } catch {
        continue;
      }
      for (const f of files) {
        const rel = relative(repo, f).split(sep).join("/");
        if (rel.startsWith("src/seeded-round/")) continue;
        if (
          /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'][^"']*seeded-round/.test(
            readFileSync(f, "utf8"),
          )
        ) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("confidentiality before the reveal (D-B4)", () => {
  const input = (index = 7): RoundDerivationInput => ({
    fv: 1,
    chainId: hexToBytes(V.linksHex[0]),
    chainIndex: index,
    salt: hexToBytes(V.saltAHex),
    roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[index])),
  });
  const seedHex = V.linksHex[7];

  /** A live round in mid-dive with every decision taken and many world draws. */
  function liveRound() {
    const round = SeededRound.create(p, input());
    const crash = round.authority.sampleCrashPoint();
    const jackpot = round.authority.sampleJackpot();
    const chests = round.authority.rollBonusChests();
    const world: number[] = [];
    for (let i = 0; i < 37; i++) world.push(round.worldRng.next());
    const secrets = [
      seedHex,
      seedHex.slice(0, 16),
      String(crash),
      String(jackpot),
      ...chests.map((c) => String(c.multiplier)),
      ...world.slice(0, 5).map(String),
    ];
    return { round, secrets };
  }
  const views = (x: unknown): string[] => [
    JSON.stringify(x),
    String(x),
    `${x}`,
    inspect(x, { depth: 10, showHidden: true }),
    format("%o", x),
    format("%j", x),
    JSON.stringify(Object.entries(x as object)),
  ];

  it("a round, its authority, its world stream and its deps show public facts only", () => {
    const { round, secrets } = liveRound();
    for (const target of [round, round.authority, round.worldRng, round.deps]) {
      for (const view of views(target)) {
        expect(view).not.toMatch(/drawsUsed|drawLimit|"(crash|jackpot|chests|world)":\s*\d/);
        for (const s of secrets) expect(view).not.toContain(s);
      }
    }
    expect(JSON.stringify(round)).toBe('{"fv":1,"chainIndex":7}');
    expect(JSON.stringify(round.worldRng)).toBe('{"purpose":"world"}');
    expect(JSON.stringify(round.authority)).toBe('{"authority":"SeededRoundAuthority"}');
    expect(Object.keys(round).sort()).toEqual(["chainIndex", "deps", "fv"]);
    expect(Object.keys(round.authority)).toEqual([]);
    expect(Object.keys(round.worldRng)).toEqual(["purpose"]);
  });

  it("a GameEngine holding the round's deps never serializes a stream's draw count", () => {
    const round = SeededRound.create(p, input(3));
    const engine = new GameEngine(round.deps);
    for (let i = 0; i < 600; i++) engine.advance(1 / 60);
    expect(round.secretDrawCounts().world).toBeGreaterThan(0);
    const json = JSON.stringify(engine);
    expect(json).not.toMatch(/drawsUsed|drawLimit/);
    expect(json).not.toContain(V.linksHex[3]);
    // The engine's own snapshot carries no stream position at all (EngineSnapshot, §14).
    expect(JSON.stringify(engine.snapshot())).not.toMatch(/drawsUsed|drawLimit|purpose/);
  });

  it("secret draw counts are only reachable through the explicitly named accessor", () => {
    const { round } = liveRound();
    const surface = new Set<string>();
    for (let o: object | null = round; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const k of Object.getOwnPropertyNames(o)) surface.add(k);
    }
    expect([...surface].filter((k) => /count|draw/i.test(k))).toEqual(["secretDrawCounts"]);
  });

  it("error messages never carry a seed, an outcome or a draw count below the limit", () => {
    const messages: string[] = [];
    const renderings: string[] = [];
    const attempt = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        expect(e).toBeInstanceOf(SeededRoundError);
        messages.push((e as Error).message);
        renderings.push(String(e), JSON.stringify(e), (e as Error).stack ?? "");
      }
    };
    const { round, secrets } = liveRound();
    attempt(() => round.authority.sampleCrashPoint());
    attempt(() => round.worldRng.next());
    const b = SeededRound.create(p, input());
    attempt(() => b.authority.sampleJackpot());
    const c = SeededRound.create(p, input());
    for (let i = 0; i < 2048; i++) c.worldRng.next();
    attempt(() => c.worldRng.next());
    c.dispose();
    attempt(() => c.worldRng.next());
    const d = RoundDerivation.create(p, input());
    d.openStream("world");
    attempt(() => SeededRound.bind(d));
    expect(messages).toHaveLength(6);
    for (const m of [...messages, ...renderings]) {
      for (const s of secrets) expect(m).not.toContain(s);
    }
    // Numbers in messages are public constants only (the fv world draw limit), never a live count.
    for (const m of messages) {
      for (const n of m.match(/\d+/g) ?? []) expect(["2048"]).toContain(n);
    }
  });
});
