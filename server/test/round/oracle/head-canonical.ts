// Canonical encoding and digest of RoundScript data (P8-4a; owner decision K11). Offline only.
//
// The encoding is a strict subset of RFC 8785 (JSON Canonicalization Scheme), so two equal values
// always produce the same bytes and different values never do:
//
// - plain objects only (prototype Object.prototype or null; own, enumerable, string-keyed data
//   properties; no getters, symbols, class instances, typed arrays or functions); keys sorted by
//   UTF-16 code units; dense arrays;
// - numbers: finite only, and never negative zero (JSON cannot tell −0 from 0, so −0 would
//   collide with 0); written as ECMAScript's shortest round-trip form (`String(n)`, the RFC 8785
//   rule), which is exact for every finite double;
// - strings: printable ASCII without `"` or `\` (the script holds only codes, kinds and hex), so
//   no escaping question can arise; booleans and null as JSON literals; nothing else (undefined,
//   bigint, NaN and Infinity are refused);
// - at most MAX_DEPTH levels of nesting.
//
// Any refusal throws `script-invalid` with no detail: the value being encoded is secret before
// its round's reveal. The digest is SHA-256 over a fixed domain tag followed by the canonical
// bytes, computed with the server's verified fairness hash provider. It is INTERNAL (K11): never
// published, logged or audited before the reveal.

import { bytesToHex, sha256, type FairnessHashProvider } from "../../../src/fairness";
import { RoundScriptError } from "../../../src/round/errors";

/** Domain separation for the RoundScript digest (version 1 of the script format). */
export const ROUND_SCRIPT_DIGEST_DOMAIN = "AQUADIVE-ROUNDSCRIPT\u0000v1\u0000";

const MAX_DEPTH = 8;
const SAFE_STRING = /^[\x20-\x21\x23-\x5b\x5d-\x7e]*$/;

const invalid = (): never => {
  throw new RoundScriptError("script-invalid");
};

function encode(value: unknown, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH) invalid();
  if (value === null) {
    out.push("null");
    return;
  }
  switch (typeof value) {
    case "boolean":
      out.push(value ? "true" : "false");
      return;
    case "number":
      if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
      out.push(String(value));
      return;
    case "string":
      if (!SAFE_STRING.test(value)) invalid();
      out.push(`"${value}"`);
      return;
    case "object":
      break;
    default:
      invalid();
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) invalid();
    if (Object.keys(descriptors).length !== value.length + 1) invalid(); // indices + length
    out.push("[");
    for (let i = 0; i < value.length; i++) {
      const d = descriptors[i];
      if (d === undefined || !("value" in d) || !d.enumerable) invalid();
      if (i > 0) out.push(",");
      encode(d!.value, depth + 1, out);
    }
    out.push("]");
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid();
  if (Object.getOwnPropertySymbols(value).length > 0) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  out.push("{");
  keys.forEach((key, i) => {
    const d = descriptors[key]!;
    if (!("value" in d) || !d.enumerable || !SAFE_STRING.test(key)) invalid();
    if (i > 0) out.push(",");
    out.push(`"${key}":`);
    encode(d.value, depth + 1, out);
  });
  out.push("}");
}

/** The canonical JSON text of `value` (throws `script-invalid` for anything outside the subset). */
export function canonicalJson(value: unknown): string {
  const out: string[] = [];
  encode(value, 0, out);
  return out.join("");
}

/** The canonical encoding as bytes (the text is ASCII, so UTF-8 is one byte per character). */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

/**
 * Decodes canonical bytes into fresh plain data. Refuses invalid UTF-8, invalid JSON and any
 * input that is not exactly the canonical form of its own value (`script-invalid`).
 */
export function decodeCanonical(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array)) invalid();
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (canonicalJson(value) !== text) invalid();
  return value;
}

/** SHA-256(domain ‖ canonical bytes) as lower-case hex. INTERNAL; secret before the reveal. */
export function canonicalDigest(provider: FairnessHashProvider, bytes: Uint8Array): string {
  const domain = new TextEncoder().encode(ROUND_SCRIPT_DIGEST_DOMAIN);
  const message = new Uint8Array(domain.length + bytes.length);
  message.set(domain, 0);
  message.set(bytes, domain.length);
  return bytesToHex(sha256(provider, message));
}
