// Secret wrapper (P8-3a): accidental serialization and logging never show the bytes.
// Defense in depth only; these tests do not claim protection against deliberate extraction.
import { inspect, format } from "node:util";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "./encoding.ts";
import { REDACTED, SecretBytes } from "./secret.ts";
import { FairnessError } from "./version.ts";

const bytes = Uint8Array.from({ length: 32 }, (_, i) => 0xa0 + (i % 16));
const hex = bytesToHex(bytes);
const fresh = () => SecretBytes.fromBytes(bytes);
const leaks = (text: string) =>
  text.includes(hex) ||
  text.includes(hex.slice(0, 16)) ||
  (text.includes(String(bytes[0])) && text.includes(String(bytes[1])));

describe("accidental serialization", () => {
  it.each([
    ["JSON.stringify", (s: SecretBytes) => JSON.stringify(s)],
    [
      "JSON.stringify inside an object",
      (s: SecretBytes) => JSON.stringify({ seed: s, nested: [s] }),
    ],
    ["String()", (s: SecretBytes) => String(s)],
    ["template literal", (s: SecretBytes) => `${s}`],
    ["string concatenation", (s: SecretBytes) => "seed=" + s],
    ["util.inspect", (s: SecretBytes) => inspect(s, { showHidden: true, depth: 5 })],
    [
      "util.inspect inside an object",
      (s: SecretBytes) => inspect({ seed: s }, { showHidden: true }),
    ],
    ["util.format %o / %O / %j / %s", (s: SecretBytes) => format("%o %O %j %s", s, s, s, s)],
    ["Object.entries", (s: SecretBytes) => JSON.stringify(Object.entries(s))],
    ["object spread", (s: SecretBytes) => JSON.stringify({ ...s })],
    ["Reflect.ownKeys", (s: SecretBytes) => Reflect.ownKeys(s).map(String).join(",")],
    ["structuredClone", (s: SecretBytes) => JSON.stringify(structuredClone(s))],
    ["Error message", (s: SecretBytes) => new Error(`failed for ${s}`).message],
  ])("%s shows no secret bytes", (_n, fn) => {
    const out = fn(fresh());
    expect(leaks(out)).toBe(false);
  });

  it("uses the fixed redaction marker", () => {
    const s = fresh();
    expect(JSON.stringify(s)).toBe(JSON.stringify(REDACTED));
    expect(String(s)).toBe(REDACTED);
    expect(inspect(s)).toBe(REDACTED);
  });

  it("has no enumerable or own data properties", () => {
    const s = fresh();
    expect(Object.keys(s)).toEqual([]);
    expect(Object.getOwnPropertyNames(s)).toEqual([]);
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("structuredClone does not carry the bytes", () => {
    const clone = structuredClone(fresh()) as unknown;
    expect(clone instanceof SecretBytes).toBe(false);
    expect(Object.keys(clone as object)).toEqual([]);
  });
});

describe("controlled access", () => {
  it("wraps a copy: mutating the source buffer later changes nothing", () => {
    const src = Uint8Array.from(bytes);
    const s = SecretBytes.fromBytes(src);
    src.fill(0);
    expect(bytesToHex(s.reveal())).toBe(hex);
  });

  it("reveal() returns an independent copy each time", () => {
    const s = fresh();
    const a = s.reveal();
    a.fill(0);
    expect(bytesToHex(s.reveal())).toBe(hex);
    expect(s.reveal()).not.toBe(s.reveal());
  });

  it("equals compares content without exposing it", () => {
    expect(fresh().equals(fresh())).toBe(true);
    const other = Uint8Array.from(bytes);
    other[31] ^= 1;
    expect(fresh().equals(SecretBytes.fromBytes(other))).toBe(false);
    expect(fresh().equals(SecretBytes.fromBytes(bytes.slice(0, 16)))).toBe(false);
    expect(fresh().equals(bytes as unknown as SecretBytes)).toBe(false);
  });

  it("dispose zeroes and locks the wrapper", () => {
    const s = fresh();
    s.dispose();
    expect(s.disposed).toBe(true);
    expect(() => s.reveal()).toThrowError(/secret-disposed/);
    expect(() => s.length).toThrowError(/secret-disposed/);
    expect(() => fresh().equals(s)).toThrowError(/secret-disposed/);
    expect(() => s.dispose()).not.toThrow();
    expect(String(s)).toBe(REDACTED);
  });

  it.each([
    ["an empty buffer", new Uint8Array(0), "invalid-length"],
    ["65 bytes", new Uint8Array(65), "invalid-length"],
    ["a plain array", [1, 2, 3], "invalid-bytes"],
    ["a string", "secret", "invalid-bytes"],
  ])("rejects %s", (_n, value, expected) => {
    try {
      SecretBytes.fromBytes(value as Uint8Array);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FairnessError);
      expect((e as FairnessError).code).toBe(expected);
    }
  });

  it("cannot be constructed without the factory, also at runtime", () => {
    // @ts-expect-error the constructor is private
    expect(() => new SecretBytes(Symbol("forged"), bytes)).toThrowError(/invalid-bytes/);
  });
});
