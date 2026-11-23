// Canonical encoding and digest of RoundScript data (P8-4a; K11). Source-level unit tests.
import { describe, expect, it } from "vitest";
import {
  ROUND_SCRIPT_DIGEST_DOMAIN,
  canonicalBytes,
  canonicalDigest,
  canonicalJson,
  decodeCanonical,
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
