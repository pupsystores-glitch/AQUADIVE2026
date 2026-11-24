// Differential verification of the P8-4b-1 parser against the EXACT P8-4b-0 parser (2994be1;
// oracle/head-*.ts are verbatim copies with only their import paths changed — the first test
// proves it by hash). TEST ONLY.
//
// Inputs: the 16 replay pins, the 45 independent known-answer vectors (checked against their
// committed record digests), fresh random development rounds, the longest constructed script,
// deterministic mutations of all of them, exotic byte containers, cap boundaries and hostile
// shapes. Each input is parsed by the oracle and by RoundScriptVerification at budgets 1, 7, 64,
// 512 and unbounded, without a digest, with its correct digest and with a wrong one. The two must
// agree exactly: acceptance, error (class, code, reason, message), and for accepted scripts the
// canonical bytes, digest, public part, secret content and deep immutability.
//
// Scale: P84B1_DIFF_RANDOM (default 200) random rounds and P84B1_DIFF_MUTANTS (default 1500)
// mutants. The P8-4b-1 acceptance run used 10,000 and 20,000 (see the report).
// P84B1_DIFF_CORPUS=<dir>: use a corpus verify-probe.cjs already wrote there (no build).
// P84B1_DIFF_REPORT=<file>: append each comparison test's counts to that file (JSON lines).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import { canonicalDigest, canonicalJson } from "../../src/round/canonical";
import {
  MAX_ROUND_SCRIPT_BYTES,
  RoundScriptVerification,
  buildRoundScript,
  validateRunnerOutput,
} from "../../src/round/round-script";
import { buildServer } from "../helpers/engine-build";
import { longestRunnerOutput } from "../helpers/round-scripts";
import { parseRoundScript as headParse } from "./oracle/head-round-script";

const PROBE = fileURLToPath(new URL("./verify-probe.cjs", import.meta.url));
const ORACLE = fileURLToPath(new URL("./oracle/", import.meta.url));
const RANDOM = Number(process.env.P84B1_DIFF_RANDOM ?? 200);
const MUTANTS = Number(process.env.P84B1_DIFF_MUTANTS ?? 1500);
const BUDGETS = [1, 7, 64, 512, Number.POSITIVE_INFINITY];
/** Generous per-test time: proportional to the requested scale (never shortened to pass). */
const timeFor = (inputs: number) => 60_000 + inputs * 60;

const { hash } = createNodeFairnessCrypto();
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const latin1 = (b: Uint8Array) =>
  Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");

const deepFrozen = (v: unknown): boolean =>
  v === null || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(deepFrozen));

/** Everything observable about one parse. */
function observe(run: () => any, input: unknown) {
  try {
    const s = run();
    const kept: Uint8Array = s.secretCanonicalBytes();
    return {
      ok: true,
      digest: s.secretDigest(),
      bytes: sha(kept),
      keptIsInput: input instanceof Uint8Array && latin1(kept) === latin1(input),
      public: JSON.stringify(s.public),
      content: sha(canonicalJson({ p: s.public, s: s.secretContent() })),
      frozen: deepFrozen(s.public) && deepFrozen(s.secretContent()) && Object.isFrozen(s),
      redacted: JSON.stringify(s),
    };
  } catch (e: any) {
    return {
      ok: false,
      ctor: e?.constructor?.name,
      code: e?.code,
      reason: e?.reason,
      message: e?.message,
    };
  }
}

const headOf = (bytes: unknown, digest?: string) =>
  observe(() => headParse(hash, bytes as Uint8Array, digest), bytes);
const slicedOf = (bytes: unknown, digest: string | undefined, budget: number) =>
  observe(() => {
    const v = RoundScriptVerification.begin(hash, bytes as Uint8Array, digest);
    for (;;) {
      const s = v.step(budget);
      if (s !== null) return s;
    }
  }, bytes);

interface Tally {
  inputs: number;
  comparisons: number;
  accepted: number;
  rejected: number;
  mismatches: unknown[];
}
/** Appends a test's counts to P84B1_DIFF_REPORT (JSON lines) when that names a file. */
const record = (name: string, t: Tally) => {
  const file = process.env.P84B1_DIFF_REPORT;
  if (file)
    appendFileSync(file, `${JSON.stringify({ name, ...t, mismatches: t.mismatches.length })}\n`);
};
const tally = (): Tally => ({
  inputs: 0,
  comparisons: 0,
  accepted: 0,
  rejected: 0,
  mismatches: [],
});

/** Compares one input in all three digest modes and every budget. */
function compare(t: Tally, label: string, bytes: unknown) {
  t.inputs += 1;
  const plain = headOf(bytes);
  if (plain.ok) t.accepted += 1;
  else t.rejected += 1;
  let own = "0".repeat(64); // the digest of the input's own bytes, when it has any
  try {
    if (bytes instanceof Uint8Array) own = canonicalDigest(hash, Uint8Array.from(bytes));
  } catch {
    // a detached view
  }
  for (const digest of [undefined, plain.ok ? (plain as any).digest : own, "f".repeat(64)]) {
    const ref = digest === undefined ? plain : headOf(bytes, digest);
    for (const b of BUDGETS) {
      t.comparisons += 1;
      const got = slicedOf(bytes, digest, b);
      if (JSON.stringify(got) !== JSON.stringify(ref) && t.mismatches.length < 10) {
        t.mismatches.push({ label, digest: digest?.slice(0, 6), budget: b, ref, got });
      }
    }
  }
}

// ---- Deterministic mutations ---------------------------------------------------------------
let seed = 0x84b1 >>> 0;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T>(xs: readonly T[]): T => xs[ri(xs.length)]!;
const NUM = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g;
const utf8 = (s: string) => new TextEncoder().encode(s);
const at = (t: string, i: number, s: string, del = 0) => t.slice(0, i) + s + t.slice(i + del);
const numberAt = (t: string): [RegExpExecArray | null, string] => {
  const all = [...t.matchAll(NUM)];
  return all.length === 0 ? [null, ""] : [all[ri(all.length)] as RegExpExecArray, ""];
};

const TEXT_MUTATORS: Record<string, (t: string) => string> = {
  flip: (t) => at(t, ri(t.length), String.fromCharCode(0x20 + ri(95)), 1),
  delete: (t) => at(t, ri(t.length), "", 1),
  whitespace: (t) => at(t, ri(t.length + 1), pick([" ", "\n", "\t", "\r"])),
  trailing: (t) => t + pick([" ", "\n", "0", "}", ",", "\u0000", "]"]),
  leading: (t) => pick([" ", "﻿", "\n"]) + t,
  truncate: (t) => t.slice(0, ri(t.length)),
  numberFormat: (t) => {
    const [m] = numberAt(t);
    if (m === null) return t;
    const v = m[0];
    const forms = [
      `${v}0`,
      v.includes(".") ? `${v}0` : `${v}.0`,
      `${v}e0`,
      `0${v}`,
      v.replace("e-", "E-"),
      v.replace(/e-(\d)$/, "e-0$1"),
      "-0",
      "0.0",
      "1e999",
      "-1e999",
      String(Number(v) + 1e-12),
      `+${v}`,
      v.replace(/^0\./, "."),
      Number(v).toExponential(),
      Number(v).toFixed(20),
    ];
    return at(t, m.index, pick(forms), v.length);
  },
  numberValue: (t) => {
    const [m] = numberAt(t);
    if (m === null) return t;
    const v = Number(m[0]);
    const values = [
      v * (0.5 + rnd()),
      v + 1,
      v - 1,
      -v,
      0,
      1,
      200,
      200.01,
      4200,
      1e7,
      2 ** 53,
      v + Number.EPSILON,
    ];
    return at(t, m.index, String(pick(values)), m[0].length);
  },
  escape: (t) => {
    const q = [...t.matchAll(/"([a-z])/g)];
    if (q.length === 0) return t;
    const m = pick(q);
    return at(t, m.index + 1, `\\u00${m[1]!.charCodeAt(0).toString(16)}`, 1);
  },
  duplicateKey: (t) => {
    const q = [...t.matchAll(/\{"([A-Za-z]+)":([^,{}[\]]+),/g)];
    if (q.length === 0) return t;
    const m = pick(q);
    return at(t, m.index + 1, `"${m[1]}":${m[2]},`);
  },
  swapKeys: (t) => {
    const q = [...t.matchAll(/"([A-Za-z]+)":([^,{}[\]]+),"([A-Za-z]+)":([^,{}[\]]+)([,}])/g)];
    if (q.length === 0) return t;
    const m = pick(q);
    return at(t, m.index, `"${m[3]}":${m[4]},"${m[1]}":${m[2]}${m[5]}`, m[0].length);
  },
  extraKey: (t) => {
    const i = t.indexOf("{", ri(t.length));
    return i < 0
      ? t
      : at(t, i + 1, pick(['"__proto__":1,', '"a":1,', '"zz":null,', '"constructor":{},']));
  },
  removeKey: (t) => t.replace(/,"[A-Za-z]+":[^,{}[\]]+(?=[,}])/, ""),
  nest: (t) => "[".repeat(1 + ri(12)) + t + "]".repeat(1 + ri(12)),
  bigArray: (t) =>
    t.replace('"chests":', `"chests":[${"[".repeat(ri(9))}${"1,".repeat(ri(3000))}1],"chestsX":`),
  arrayLength: (t) => t.replace(/\[(\d)/, (_, d) => `[${d},${d}`),
  literal: (t) => {
    const i = t.indexOf("null", ri(t.length));
    return i < 0
      ? t
      : at(t, i, pick(["true", "false", "Null", "nul", "0", '"null"', "{}", "[]"]), 4);
  },
  stringValue: (t) =>
    t.replace(
      /"(anglerfish|fishSchool|goldfish|jellyfish|kelp|manta|octopus|seahorse|sealion|whale|crash|floor)"/,
      pick(['"shark"', '"Kelp"', '"kelp "', "1", "null"]),
    ),
  nonAscii: (t) => at(t, ri(t.length), pick(["é", "ÿ", "\u0080", "€", "😀"])),
  empty: () => pick(["", "{}", "[]", "null", '{"public":{},"secret":{}}']),
};
const BYTE_MUTATORS: Record<string, (b: Uint8Array) => Uint8Array> = {
  bitFlip: (b) => {
    const c = Uint8Array.from(b);
    c[ri(c.length)] ^= 1 << ri(8);
    return c;
  },
  invalidUtf8: (b) => {
    const i = ri(b.length);
    return Uint8Array.from([
      ...b.subarray(0, i),
      pick([0xff, 0xc3, 0x80, 0xed, 0xf8]),
      ...b.subarray(i),
    ]);
  },
  overlongUtf8: (b) => {
    const i = ri(b.length);
    return Uint8Array.from([...b.subarray(0, i), 0xc0, 0xa2, ...b.subarray(i)]); // '"' overlong
  },
};
const MUTATOR_NAMES = [...Object.keys(TEXT_MUTATORS), ...Object.keys(BYTE_MUTATORS)];
function mutate(bytes: Uint8Array): [string, Uint8Array] {
  const name = pick(MUTATOR_NAMES);
  if (name in BYTE_MUTATORS) return [name, BYTE_MUTATORS[name]!(bytes)];
  return [name, utf8(TEXT_MUTATORS[name]!(latin1(bytes)))];
}

// ---- The corpus ------------------------------------------------------------------------------
let tmp = "";
let corpus: { kind: string; key: string; digest: string; bytes: Uint8Array }[] = [];
let summary: any;

beforeAll(() => {
  let dir = process.env.P84B1_DIFF_CORPUS ?? "";
  if (dir === "") {
    tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-4b-1-diff-"));
    const dist = buildServer(tmp);
    dir = join(tmp, "corpus");
    const run = spawnSync(process.execPath, [PROBE, dist, dir, String(RANDOM)], {
      encoding: "utf8",
      timeout: 120_000 + RANDOM * 100,
    });
    expect(run.status, run.stderr).toBe(0);
  }
  const parsed = JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"));
  summary = parsed.summary;
  const meta = parsed.entries;
  const bin = readFileSync(join(dir, "corpus.bin"));
  let o = 0;
  corpus = meta.map((m: any) => {
    const n = bin.readUInt32LE(o);
    const bytes = new Uint8Array(bin.subarray(o + 4, o + 4 + n)); // a copy, its own buffer
    o += 4 + n;
    return { ...m, bytes };
  });
  const longest = buildRoundScript(
    hash,
    { chainId: "ab".repeat(32), chainIndex: Number.MAX_SAFE_INTEGER, salt: "ab".repeat(64) },
    validateRunnerOutput(longestRunnerOutput(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER),
  );
  corpus.push({
    kind: "longest",
    key: "longest",
    digest: longest.secretDigest(),
    bytes: longest.secretCanonicalBytes(),
  });
}, 600_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("the oracle is the exact P8-4b-0 parser", () => {
  it("oracle/head-*.ts are 2994be1's canonical.ts and round-script.ts, imports re-pointed only", () => {
    // [specifier in the oracle copy, specifier at 2994be1]; assembled at run time so that no
    // import-shaped text appears here (src/fairness/security.test.ts scans for such imports).
    const spec = (path: string) => ["from ", '"', path, '";'].join("");
    const BRIDGE = ["..", "fairness"].join("/");
    const restore = (file: string, pairs: [string, string][]) => {
      let text = readFileSync(join(ORACLE, file), "utf8").replace(/\r\n/g, "\n");
      for (const [now, then] of pairs) {
        expect(text.split(spec(now)).length - 1, now).toBe(1);
        text = text.replace(spec(now), spec(then));
      }
      return sha(text);
    };
    // SHA-256 of `git show 2994be1:server/src/round/<file>` (LF).
    expect(
      restore("head-canonical.ts", [
        [`../../../src/${BRIDGE.slice(3)}`, BRIDGE],
        ["../../../src/round/errors", "./errors"],
      ]),
    ).toBe("555f5639b87f58ac2e65063835e9408f398859c074c05400163a0510b2bdd92f");
    expect(
      restore("head-round-script.ts", [
        [`../../../src/${BRIDGE.slice(3)}`, BRIDGE],
        ["./head-canonical", "./canonical"],
        ["../../../src/round/engine-types", "./engine-types"],
        ["../../../src/round/errors", "./errors"],
      ]),
    ).toBe("656d39516480e889e380f34fb67c48cf1889a957ed6255e9bcb8718fcf30dc78");
  });
});

describe("differential verification against the P8-4b-0 parser", () => {
  it(
    "the corpus: 16 replay pins, 45 independent vectors (record digests match), random rounds",
    {
      timeout: timeFor(RANDOM * 10),
    },
    () => {
      expect(summary).toMatchObject({ pins: 16, vectors: 45, vectorRecordsMatch: 45 });
      if (!process.env.P84B1_DIFF_CORPUS) expect(summary.random).toBe(RANDOM);
      // every corpus script is accepted by the oracle with its recorded digest
      for (const e of corpus) expect(headOf(e.bytes, e.digest).ok, e.key).toBe(true);
    },
  );

  it(
    "valid scripts: identical results at every budget and digest mode",
    { timeout: timeFor(RANDOM * 20) },
    () => {
      const t = tally();
      for (const e of corpus) compare(t, `${e.kind}:${e.key}`, e.bytes);
      record("valid", t);
      expect(t.mismatches).toEqual([]);
      expect(t.inputs).toBe(16 + 45 + summary.random + 1);
      expect(t.accepted).toBe(t.inputs);
      expect(t.comparisons).toBe(t.inputs * 3 * BUDGETS.length);
    },
  );

  it("mutated scripts: identical acceptance and errors", { timeout: timeFor(MUTANTS * 20) }, () => {
    const t = tally();
    const kinds: Record<string, number> = {};
    for (let i = 0; i < MUTANTS; i++) {
      const base = corpus[i % corpus.length]!;
      let [name, bytes] = mutate(base.bytes);
      if (rnd() < 0.2) [name, bytes] = [`${name}+`, mutate(bytes)[1]]; // a second mutation
      kinds[name.replace(/\+$/, "")] = (kinds[name.replace(/\+$/, "")] ?? 0) + 1;
      compare(t, `${name} of ${base.key}`, bytes);
    }
    record("mutants", { ...t, kinds } as Tally);
    expect(t.mismatches).toEqual([]);
    expect(t.inputs).toBe(MUTANTS);
    // every mutator was exercised, and both outcomes occurred
    expect(Object.keys(kinds).sort()).toEqual([...MUTATOR_NAMES].sort());
    expect(t.accepted).toBeGreaterThan(0);
    expect(t.rejected).toBeGreaterThan(MUTANTS / 2);
  });

  it(
    "byte containers, cap boundaries and hostile shapes: identical results",
    { timeout: 300_000 },
    () => {
      const t = tally();
      const v = corpus.find((e) => e.kind === "vector")!.bytes;
      const offset = new Uint8Array(v.length + 7);
      offset.set(v, 7);
      const shared = new Uint8Array(new SharedArrayBuffer(v.length));
      shared.set(v);
      const resizable = new Uint8Array(
        new (ArrayBuffer as any)(v.length, { maxByteLength: v.length * 2 }),
      );
      resizable.set(v);
      const growable = new Uint8Array(
        new (SharedArrayBuffer as any)(v.length, { maxByteLength: v.length * 2 }),
      );
      growable.set(v);
      const detached = Uint8Array.from(v);
      structuredClone(detached.buffer, { transfer: [detached.buffer] });
      const lying = Uint8Array.from(v);
      Object.defineProperty(lying, "length", { value: 2 });
      const exotic: [string, unknown][] = [
        ["Buffer", Buffer.from(v)],
        ["offset view", offset.subarray(7)],
        ["SharedArrayBuffer view", shared],
        ["resizable buffer view", resizable],
        ["growable shared view", growable],
        ["detached", detached],
        ["own length property", lying],
        ["Uint8ClampedArray", new Uint8ClampedArray(v)],
        ["DataView", new DataView(v.buffer.slice(0))],
        ["Array", Array.from(v)],
        ["string", latin1(v)],
        ["ArrayBuffer", v.buffer.slice(0)],
        ["null", null],
        ["fake Uint8Array", Object.create(Uint8Array.prototype)],
      ];
      for (const [name, input] of exotic) compare(t, name, input);

      const longest = corpus.find((e) => e.kind === "longest")!.bytes;
      const pad = (n: number, base: Uint8Array, byte: number) => {
        const b = new Uint8Array(n).fill(byte);
        b.set(base.subarray(0, Math.min(n, base.length)));
        return b;
      };
      for (const n of [
        MAX_ROUND_SCRIPT_BYTES - 1,
        MAX_ROUND_SCRIPT_BYTES,
        MAX_ROUND_SCRIPT_BYTES + 1,
      ]) {
        compare(t, `longest + spaces to ${n}`, pad(n, longest, 0x20));
        compare(t, `longest + zeros to ${n}`, pad(n, longest, 0x30));
        compare(t, `[ to ${n}`, new Uint8Array(n).fill(0x5b));
      }
      const size = 1024 * 1024;
      const fit = (open: string, item: string, close: string) =>
        utf8(
          open +
            Array(Math.floor((size - 2) / (item.length + 1)))
              .fill(item)
              .join(",") +
            close,
        );
      const hostile: [string, Uint8Array][] = [
        ["1 MiB number array", fit("[", "1", "]")],
        ["1 MiB small objects", fit("[", '{"a":1,"b":[1,2]}', "]")],
        ["1 MiB deep nesting", utf8("[".repeat(size / 2) + "]".repeat(size / 2))],
        ["1 MiB long string", utf8(`"${"a".repeat(size - 2)}"`)],
        [
          "1 MiB wide object",
          utf8(
            `{${Array.from({ length: 60_000 }, (_, i) => `"k${String(i).padStart(8, "0")}":0`).join(",")}}`,
          ),
        ],
        ["valid prefix + 1 MiB", Uint8Array.from([...longest, ...new Uint8Array(size).fill(0x20)])],
      ];
      for (const [name, bytes] of hostile) compare(t, name, bytes);
      record("containers", t);
      expect(t.mismatches).toEqual([]);
      expect(t.inputs).toBe(exotic.length + 9 + hostile.length);
    },
  );
});
