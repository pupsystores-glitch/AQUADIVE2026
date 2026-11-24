// Canonical encoding and digest of RoundScript data (P8-4a; K11). Source-level unit tests.
import { describe, expect, it } from "vitest";
import {
  CANONICAL_MAX_DEPTH,
  CanonicalCheck,
  ROUND_SCRIPT_DIGEST_DOMAIN,
  canonicalBytes,
  canonicalDigest,
  canonicalJson,
  decodeCanonical,
  prescanCanonical,
  snapshotBytes,
} from "../../src/round/canonical";
import { bytesToHex, sha256 } from "../../src/fairness";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";

const invalid = { name: "RoundScriptError", code: "script-invalid", message: "script-invalid" };
const refuses = (value: unknown) => {
  let error: unknown = null;
  try {
    canonicalJson(value);
  } catch (e) {
    error = e;
  }
  expect(error).toMatchObject(invalid);
};

describe("canonicalJson", () => {
  it("sorts keys by UTF-16 code units at every level and writes no whitespace", () => {
    expect(canonicalJson({ b: 1, a: [true, null, { d: "x", C: 2 }], A: false })).toBe(
      '{"A":false,"a":[true,null,{"C":2,"d":"x"}],"b":1}',
    );
  });

  it("is independent of property insertion order", () => {
    expect(canonicalJson({ x: 1, y: { p: 1, q: 2 } })).toBe(
      canonicalJson({ y: { q: 2, p: 1 }, x: 1 }),
    );
  });

  it("writes numbers in ECMAScript's shortest round-trip form (RFC 8785)", () => {
    const values = [0, 1, -1, 0.1, 1 / 3, 1 / 60, 1e21, 1e-7, 5e-324, Number.MAX_VALUE, 2 ** 53];
    expect(canonicalJson(values)).toBe(`[${values.map(String).join(",")}]`);
    for (const v of values) expect(JSON.parse(canonicalJson(v))).toBe(v); // exact
  });

  it.each([
    ["negative zero", -0],
    ["negative zero nested", { a: [1, -0] }],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["undefined", undefined],
    ["undefined property", { a: undefined }],
    ["bigint", 1n],
    ["symbol", Symbol("s")],
    ["function", () => 1],
    ["a class instance", new (class X {})()],
    ["a Date", new Date(0)],
    ["a Map", new Map()],
    ["a typed array", new Uint8Array(1)],
    ["a sparse array", [1, , 3]], // eslint-disable-line no-sparse-arrays
    ["an array with an extra property", Object.assign([1], { x: 1 })],
    ["a getter", Object.defineProperty({}, "a", { get: () => 1, enumerable: true })],
    ["a non-enumerable property", Object.defineProperty({}, "a", { value: 1 })],
    ["a symbol key", { [Symbol("k")]: 1 }],
    ["a quote in a string", 'a"b'],
    ["a backslash in a string", "a\\b"],
    ["a control character", "a\nb"],
    ["non-ASCII", "é"],
    ["a non-ASCII key", { é: 1 }],
    ["too deep", [[[[[[[[[[1]]]]]]]]]]],
  ])("refuses %s", (_name, value) => {
    refuses(value);
  });

  it("accepts objects with a null prototype", () => {
    const o = Object.create(null) as Record<string, number>;
    o.b = 2;
    o.a = 1;
    expect(canonicalJson(o)).toBe('{"a":1,"b":2}');
  });
});

describe("decodeCanonical", () => {
  it("round-trips canonical bytes into fresh plain data", () => {
    const value = { z: [1, 2.5, null], a: { k: "v" } };
    const bytes = canonicalBytes(value);
    const decoded = decodeCanonical(bytes);
    expect(decoded).toEqual(value);
    expect(canonicalBytes(decoded)).toEqual(bytes);
  });

  it.each([
    ["whitespace", '{ "a":1}'],
    ["unsorted keys", '{"b":1,"a":2}'],
    ["a non-shortest number", '{"a":1.50}'],
    ["an exponent form", '{"a":1E2}'],
    ["negative zero", '{"a":-0}'],
    ["a duplicate key", '{"a":1,"a":1}'],
    ["invalid JSON", '{"a":'],
    ["an escaped string", '{"a":"\\u0041"}'],
  ])("refuses %s", (_name, text) => {
    let error: unknown = null;
    try {
      decodeCanonical(new TextEncoder().encode(text));
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject(invalid);
  });

  it("refuses invalid UTF-8 and non-byte input", () => {
    for (const input of [Uint8Array.of(0x7b, 0xff, 0x7d), "{}" as unknown as Uint8Array]) {
      expect(() => decodeCanonical(input)).toThrow("script-invalid");
    }
  });
});

// ---- P8-4b-1: untrusted input --------------------------------------------------------------

/** The P8-4a decision: is `text` exactly the canonical form of its JSON value? */
const headAccepts = (text: string): boolean => {
  try {
    return canonicalJson(JSON.parse(text)) === text;
  } catch {
    return false;
  }
};
/** The same decision by CanonicalCheck, in steps of `budget` operations. */
const checkAccepts = (text: string, budget: number): boolean => {
  try {
    const check = CanonicalCheck.parse(text);
    while (!check.step(budget));
    return true;
  } catch (e) {
    expect(e).toMatchObject(invalid);
    return false;
  }
};
const BUDGETS = [1, 7, 64, 512, Number.POSITIVE_INFINITY];

/** Deterministic pseudo-random JSON texts: canonical, re-ordered, spaced and mutated. */
function fuzzTexts(count: number, seed: number): string[] {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const numbers = [0, 1, -1, 0.1, 1 / 3, 1e21, 1e-7, 5e-324, 2 ** 53, -0.5, 123.456, 1e300];
  const strings = [
    "",
    "a",
    "Z9",
    " sp ",
    "~!#$%",
    "__proto__",
    "10",
    "9",
    "é",
    'a"b',
    "a\\b",
    "\u0001",
  ];
  const value = (depth: number): unknown => {
    const r = rnd();
    if (depth > 10 || r < 0.35) {
      return pick<unknown>([null, true, false, pick(numbers), pick(strings)]);
    }
    if (r < 0.65) return Array.from({ length: Math.floor(rnd() * 4) }, () => value(depth + 1));
    const o: Record<string, unknown> = {};
    for (let i = Math.floor(rnd() * 4); i > 0; i--) o[pick(strings)] = value(depth + 1);
    return o;
  };
  const shuffled = (v: unknown): string => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(shuffled).join(",")}]`;
    const keys = Object.keys(v).sort(() => rnd() - 0.5);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${shuffled((v as Record<string, unknown>)[k])}`).join(",")}}`;
  };
  const out: string[] = [];
  while (out.length < count) {
    const v = value(0);
    let text: string;
    try {
      text = canonicalJson(v);
    } catch {
      text = JSON.stringify(v) ?? "null";
    }
    const r = rnd();
    if (r < 0.3) out.push(text);
    else if (r < 0.45) out.push(shuffled(v));
    else if (r < 0.55) out.push(JSON.stringify(v, null, 1) ?? "null");
    else {
      const i = Math.floor(rnd() * (text.length + 1));
      const edits = [
        () => text.slice(0, i) + text.slice(i + 1),
        () =>
          text.slice(0, i) + pick([" ", ",", "]", "}", "0", '"', "\\u0041", "1e0"]) + text.slice(i),
        () => text.replace(/\d+/, (m) => `${m}.0`),
        () => text.replace(/"([a-z])/, '"\\u006$1'),
        () => text.replace("{", '{"a":1,"a":1,'),
        () => text.replace("{", '{"__proto__":null,'),
        () =>
          `${"[".repeat(1 + Math.floor(rnd() * 10))}${text}${"]".repeat(1 + Math.floor(rnd() * 10))}`,
      ];
      out.push(pick(edits)());
    }
  }
  return out;
}

describe("CanonicalCheck (P8-4b-1)", () => {
  it("accepts exactly what canonicalJson(JSON.parse(text)) === text accepts, at every budget", () => {
    const texts = [
      ...fuzzTexts(6000, 0x84b1),
      '{"10":1,"9":2}',
      '{"9":2,"10":1}',
      '{"__proto__":1}',
      '{"__proto__":{"a":1}}',
      '{"a":1,"a":1}',
      "[".repeat(9) + "]".repeat(9), // empty array at depth 8
      "[".repeat(9) + "1" + "]".repeat(9), // value at depth 9
      "[".repeat(10) + "]".repeat(10),
      "-0",
      "[-0]",
      "1e21",
      "1e+21",
      "0.1",
      "5e-324",
      '"\\u0041"',
      '"A"',
      "",
      " 1",
      "null",
      "[]",
      "{}",
    ];
    let accepted = 0;
    for (const text of texts) {
      const ref = headAccepts(text);
      if (ref) accepted += 1;
      for (const b of BUDGETS)
        expect(checkAccepts(text, b), `${JSON.stringify(text)} @${b}`).toBe(ref);
    }
    expect(accepted).toBeGreaterThan(1500);
    expect(accepted).toBeLessThan(texts.length - 1500);
  });

  it("counts operations and stops at the budget", () => {
    const check = CanonicalCheck.parse(canonicalJson({ a: [1, 2, 3], b: { c: null } }));
    expect(check.step(1)).toBe(false);
    expect(check.operations).toBe(1);
    expect(check.step(3)).toBe(false);
    expect(check.operations).toBe(4);
    expect(check.step(Number.POSITIVE_INFINITY)).toBe(true);
    // root, a, 1, 2, 3, ], b, c, }, }  = 10 operations
    expect(check.operations).toBe(10);
    expect(check.step(1)).toBe(true);
    expect(check.value).toEqual({ a: [1, 2, 3], b: { c: null } });
  });
});

describe("prescanCanonical (P8-4b-1)", () => {
  const generous = {
    maxNesting: CANONICAL_MAX_DEPTH + 1,
    maxArrayElements: 1_000_000,
    maxObjectMembers: 1_000_000,
    maxContainers: 1_000_000,
  };
  const ascii = (s: string) => new TextEncoder().encode(s);

  it("never refuses a canonical text (rejection only)", () => {
    let canonical = 0;
    for (const text of fuzzTexts(6000, 0x5ca9)) {
      if (!headAccepts(text)) continue;
      canonical += 1;
      expect(prescanCanonical(ascii(text), generous), text).toBe(true);
    }
    expect(canonical).toBeGreaterThan(1500);
  });

  it("refuses only provably non-canonical shapes", () => {
    for (const text of [
      '{"a":1} ', // whitespace is printable, but outside a string it is not canonical: passed
    ]) {
      expect(prescanCanonical(ascii(text), generous)).toBe(true);
      expect(headAccepts(text)).toBe(false);
    }
    for (const text of [
      '{"a":"\\u0041"}', // backslash
      '{"a":\n1}', // control character
      "[1,2]]", // unbalanced
      "[1,2}", // mismatched
      '["abc]', // unterminated string
      "[[[[[[[[[[]]]]]]]]]]", // 10 open brackets
    ]) {
      expect(prescanCanonical(ascii(text), generous), text).toBe(false);
      expect(headAccepts(text), text).toBe(false);
    }
    expect(prescanCanonical(Uint8Array.of(0x5b, 0xc3, 0xa9, 0x5d), generous)).toBe(false); // é
    expect(prescanCanonical(Uint8Array.of(0xef, 0xbb, 0xbf, 0x31), generous)).toBe(false); // BOM
    // Shape limits: k commas at one level mean k + 1 entries.
    const tight = { maxNesting: 3, maxArrayElements: 3, maxObjectMembers: 2, maxContainers: 3 };
    expect(prescanCanonical(ascii("[1,2,3]"), tight)).toBe(true);
    expect(prescanCanonical(ascii("[1,2,3,4]"), tight)).toBe(false);
    expect(prescanCanonical(ascii('["a,b,c,d"]'), tight)).toBe(true); // commas in a string
    expect(prescanCanonical(ascii('{"a":1,"b":2}'), tight)).toBe(true);
    expect(prescanCanonical(ascii('{"a":1,"b":2,"c":3}'), tight)).toBe(false);
    expect(prescanCanonical(ascii("[[[]]]"), tight)).toBe(true);
    expect(prescanCanonical(ascii("[[[[]]]]"), tight)).toBe(false);
    expect(prescanCanonical(ascii("[[],[],[]]"), tight)).toBe(false); // 4 containers
  });
});

describe("snapshotBytes (P8-4b-1)", () => {
  const bytes = canonicalBytes({ a: [1, 2], b: "x" });

  it("copies into a fresh buffer of exactly the input's length; never an alias", () => {
    const offset = new Uint8Array(bytes.length + 9);
    offset.set(bytes, 5);
    const shared = new Uint8Array(new SharedArrayBuffer(bytes.length));
    shared.set(bytes);
    for (const input of [bytes, Buffer.from(bytes), offset.subarray(5, 5 + bytes.length), shared]) {
      const copy = snapshotBytes(input, 1024);
      expect(copy).toEqual(new Uint8Array(bytes));
      expect(copy.buffer).not.toBe(input.buffer);
      expect(copy.byteOffset).toBe(0);
      expect(copy.buffer.byteLength).toBe(bytes.length);
      expect(Object.getPrototypeOf(copy)).toBe(Uint8Array.prototype);
      input[0] = 0; // later changes to the input do not reach the copy
      expect(copy[0]).toBe(0x7b);
      input[0] = 0x7b;
    }
  });

  it("checks the length first, with the intrinsic accessor, and refuses non-byte input", () => {
    const lying = new Uint8Array(4096);
    Object.defineProperty(lying, "length", { value: 1 });
    expect(() => snapshotBytes(lying, 1024)).toThrow("script-invalid");
    expect(snapshotBytes(new Uint8Array(1024), 1024)).toHaveLength(1024);
    expect(() => snapshotBytes(new Uint8Array(1025), 1024)).toThrow("script-invalid");
    for (const input of [
      Array.from(bytes),
      "{}",
      new Uint8ClampedArray(bytes),
      new DataView(bytes.buffer),
      Object.create(Uint8Array.prototype),
      null,
    ]) {
      expect(() => snapshotBytes(input as unknown as Uint8Array, 1024)).toThrow("script-invalid");
    }
    const detached = new Uint8Array(8);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    expect(() => snapshotBytes(detached, 1024)).toThrow("script-invalid");
  });
});

describe("canonicalDigest", () => {
  const { hash } = createNodeFairnessCrypto();

  it("is SHA-256 over the fixed domain tag followed by the canonical bytes", () => {
    const bytes = canonicalBytes({ a: 1 });
    const expected = bytesToHex(
      sha256(hash, new TextEncoder().encode(`${ROUND_SCRIPT_DIGEST_DOMAIN}{"a":1}`)),
    );
    expect(canonicalDigest(hash, bytes)).toBe(expected);
    expect(ROUND_SCRIPT_DIGEST_DOMAIN).toBe("AQUADIVE-ROUNDSCRIPT\u0000v1\u0000");
    // Domain separation: not the plain hash of the bytes.
    expect(canonicalDigest(hash, bytes)).not.toBe(bytesToHex(sha256(hash, bytes)));
  });
});
