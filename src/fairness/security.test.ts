// Security and isolation tests (P8-3a §5, §6; D5, D6, D9, D12).
// - Production files import only each other (relative .ts), never the engine, UI, rendering,
//   audio, shared floor, protocol, zod, Fastify, Node built-ins or any package.
// - No Math.random, clock, logging, network, DOM, process or global crypto access in production.
// - Nothing in the application or the server imports src/fairness (not connected to gameplay).
// - Errors and commitments never carry secret material.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeRoundSeed, createChainCommitment, generateChainSeed } from "./chain.ts";
import { RoundDerivation } from "./derive.ts";
import { bytesToHex, hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { nodeHashProvider as p, nodeSecureRandom } from "./test/node-provider.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "./vectors.ts";
import { FAIRNESS_PURPOSES, FairnessError, PURPOSE_DRAW_LIMITS_V1 } from "./version.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const PRODUCTION = [
  "index.ts",
  "version.ts",
  "encoding.ts",
  "crypto.ts",
  "chain.ts",
  "derive.ts",
  "seeded-rng.ts",
  "secret.ts",
  "vectors.ts",
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

/** Source without comments (so documentation may name forbidden things). */
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("production import boundary", () => {
  it("the production file set is exactly the authorized one", () => {
    const actual = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(actual.sort()).toEqual([...PRODUCTION].sort());
  });

  it.each(PRODUCTION)("%s imports only sibling production modules", (file) => {
    const src = code(join(here, file));
    const specifiers = [
      ...src.matchAll(/\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g),
    ].map((m) => m[1]);
    const dynamic = [...src.matchAll(/\bimport\s*\(|\brequire\s*\(/g)];
    expect(dynamic).toEqual([]);
    for (const s of specifiers) {
      expect(s, `${file} imports ${s}`).toMatch(/^\.\/[a-z-]+\.ts$/);
      expect(PRODUCTION).toContain(s.slice(2));
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
      ["global crypto", /\bcrypto\s*\.\s*(subtle|getRandomValues|randomUUID)/],
      ["eval", /\beval\s*\(|\bnew\s+Function\b/],
      ["timers", /\b(setTimeout|setInterval|setImmediate|queueMicrotask)\b/],
      ["zod / fastify", /\b(zod|fastify)\b/i],
    ];
    for (const [name, re] of forbidden) expect(re.test(src), `${file} uses ${name}`).toBe(false);
  });

  it("test helpers stay under src/fairness/test and are not imported by production files", () => {
    for (const file of PRODUCTION) expect(code(join(here, file))).not.toMatch(/\.\/test\//);
  });
});

describe("isolation from the application and the server", () => {
  it("no file outside src/fairness imports it", () => {
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
        if (rel.startsWith("src/fairness/")) continue;
        const src = readFileSync(f, "utf8");
        if (
          /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'][^"']*\bfairness\b/.test(
            src,
          )
        ) {
          offenders.push(rel);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("fairness tests never import the engine, UI, rendering, audio or shared floor", () => {
    for (const f of walk(here)) {
      const src = readFileSync(f, "utf8");
      expect(src, relative(repo, f)).not.toMatch(
        /from\s+["'](@\/|\.\.\/(engine|ui|rendering|audio|shared|protocol))/,
      );
    }
  });
});

describe("secret material never leaks through errors or public values", () => {
  const seed = SecretBytes.fromBytes(hexToBytes(V.seedHex));
  const roundSeed = computeRoundSeed(p, seed, V.chainLength, 3);
  const seedHex = bytesToHex(roundSeed.reveal());
  const input = {
    fv: 1,
    chainId: hexToBytes(V.linksHex[0]),
    chainIndex: 3,
    salt: hexToBytes(V.saltAHex),
    roundSeed,
  };

  it("error messages on every failure path omit the seed", () => {
    const messages: string[] = [];
    const attempt = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        expect(e).toBeInstanceOf(FairnessError);
        messages.push(String(e), (e as Error).message, JSON.stringify(e), (e as Error).stack ?? "");
      }
    };
    attempt(() => RoundDerivation.create(p, { ...input, fv: 2 }));
    attempt(() => RoundDerivation.create(p, { ...input, salt: new Uint8Array(3) }));
    attempt(() => RoundDerivation.create(p, { ...input, chainIndex: 0 }));
    attempt(() =>
      RoundDerivation.create(p, { ...input, roundSeed: SecretBytes.fromBytes(input.chainId) }),
    );
    const d = RoundDerivation.create(p, input);
    attempt(() => d.block("nope", 0));
    attempt(() => d.block("crash", 9));
    const s = d.openStream("crash");
    s.next();
    s.next();
    attempt(() => s.next());
    attempt(() => d.openStream("crash"));
    expect(messages.length).toBeGreaterThanOrEqual(32);
    for (const m of messages) {
      expect(m).not.toContain(seedHex);
      expect(m).not.toContain(seedHex.slice(0, 12));
    }
  });

  it("the public commitment never equals a round seed or a derived block", () => {
    const fresh = generateChainSeed(nodeSecureRandom);
    const c = createChainCommitment(p, fresh, 16);
    const id = bytesToHex(c.chainId);
    for (let j = 1; j <= 16; j++) {
      const sj = computeRoundSeed(p, fresh, 16, j);
      expect(bytesToHex(sj.reveal())).not.toBe(id);
      const d = RoundDerivation.create(p, {
        fv: 1,
        chainId: c.chainId,
        chainIndex: j,
        salt: input.salt,
        roundSeed: sj,
      });
      for (const purpose of FAIRNESS_PURPOSES) {
        const b = bytesToHex(d.block(purpose, 0));
        expect(b).not.toBe(id);
        expect(b).not.toBe(bytesToHex(sj.reveal()));
      }
    }
  });

  it("a derived block does not reveal the round seed (it is an HMAC output, not the key)", () => {
    const d = RoundDerivation.create(p, input);
    for (const purpose of FAIRNESS_PURPOSES) {
      const last = Math.ceil(PURPOSE_DRAW_LIMITS_V1[purpose] / 4) - 1;
      for (const c of [0, last])
        expect(bytesToHex(d.block(purpose, c))).not.toContain(seedHex.slice(0, 16));
    }
  });

  it("the commitment object holds only public fields", () => {
    const c = createChainCommitment(p, seed, V.chainLength);
    expect(Object.keys(c).sort()).toEqual(["chainId", "fv", "length"]);
    expect(JSON.stringify(c)).not.toContain(V.seedHex);
  });
});
