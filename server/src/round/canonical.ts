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
//
// Decoding untrusted bytes (P8-4b-1). `snapshotBytes` takes ONE private copy of the input before
// anything reads it, after a length check that comes before any copy or allocation; everything
// after (prescan, UTF-8 decoding, JSON.parse, the canonical check, the digest) reads only that
// copy, so a caller's buffer that changes meanwhile — a SharedArrayBuffer written by another
// thread — cannot make the validated content and the kept bytes differ. `prescanCanonical` is a
// rejection-only structural check of the copy: it refuses only inputs that are provably outside
// the canonical form (or outside caller-supplied shape bounds that the caller proves sound).
// `CanonicalCheck` replaces `canonicalJson(JSON.parse(text)) === text` for values JSON.parse just
// produced: it compares the canonical form position by position, with an explicit stack, in
// slices of a bounded number of operations, and accepts exactly the same texts.

import { bytesToHex, sha256, type FairnessHashProvider } from "../fairness";
import { RoundScriptError } from "./errors";

/** Domain separation for the RoundScript digest (version 1 of the script format). */
export const ROUND_SCRIPT_DIGEST_DOMAIN = "AQUADIVE-ROUNDSCRIPT\u0000v1\u0000";

/** The deepest nesting level of a value inside the encoded root (the root is level 0). */
export const CANONICAL_MAX_DEPTH = 8;
const MAX_DEPTH = CANONICAL_MAX_DEPTH;
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
 * input that is not exactly the canonical form of its own value (`script-invalid`). Reads the
 * input once, into a private copy (`snapshotBytes`), and checks only that copy.
 */
export function decodeCanonical(bytes: Uint8Array): unknown {
  const copy = snapshotBytes(bytes, Number.MAX_SAFE_INTEGER);
  const check = CanonicalCheck.parse(decodeUtf8(copy));
  check.step(Number.POSITIVE_INFINITY);
  return check.value;
}

/** SHA-256(domain ‖ canonical bytes) as lower-case hex. INTERNAL; secret before the reveal. */
export function canonicalDigest(provider: FairnessHashProvider, bytes: Uint8Array): string {
  const domain = new TextEncoder().encode(ROUND_SCRIPT_DIGEST_DOMAIN);
  const message = new Uint8Array(domain.length + bytes.length);
  message.set(domain, 0);
  message.set(bytes, domain.length);
  return bytesToHex(sha256(provider, message));
}

// ---- Untrusted input (P8-4b-1) ---------------------------------------------------------------

// The intrinsic typed-array accessors, captured once: an own `length` property or a replaced
// prototype method of the INPUT object cannot change what is read or copied.
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayLength = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "length")!.get as (
  this: Uint8Array,
) => number;
const typedArraySet = Uint8Array.prototype.set;

/**
 * One private, independent copy of `bytes` (a Uint8Array, as before: Buffer is accepted, other
 * views and arrays are not). The length is checked against `maxBytes` BEFORE anything is copied
 * or allocated. The copy is a new ArrayBuffer (never an alias such as `Buffer#slice`), taken in a
 * single pass; nothing reads `bytes` again. If a shared buffer changes during that pass, the copy
 * is one consistent snapshot that is then validated as a whole. Throws `script-invalid`.
 */
export function snapshotBytes(bytes: Uint8Array, maxBytes: number): Uint8Array {
  if (!(bytes instanceof Uint8Array)) invalid();
  let length: number;
  try {
    length = typedArrayLength.call(bytes); // throws for an object that is not a typed array
  } catch {
    return invalid();
  }
  if (length > maxBytes) invalid();
  const copy = new Uint8Array(length);
  try {
    // Throws if the view grew (a growable shared buffer) or was detached since `length`.
    typedArraySet.call(copy, bytes);
  } catch {
    return invalid();
  }
  return copy;
}

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Strict UTF-8 (a BOM is kept as a character, so canonical text never has one). */
export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    return invalid();
  }
}

/** Shape bounds of a rejection-only prescan; each must be proved sound by the caller. */
export interface CanonicalShapeLimits {
  /** Brackets open at the same time (the canonical rule alone allows CANONICAL_MAX_DEPTH + 1). */
  readonly maxNesting: number;
  readonly maxArrayElements: number;
  readonly maxObjectMembers: number;
  /** Arrays and objects in the whole text. */
  readonly maxContainers: number;
}

const QUOTE = 0x22;
const COMMA = 0x2c;
const OPEN_ARRAY = 0x5b;
const BACKSLASH = 0x5c;
const CLOSE_ARRAY = 0x5d;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;

/**
 * Rejection-only structural prescan of a private copy, in one pass with no allocation beyond
 * two small arrays. Returns false ONLY for inputs no canonical text can be:
 *
 * - a byte outside printable ASCII, or a backslash: canonical text is printable ASCII and its
 *   strings never contain `\` (SAFE_STRING); any other byte is invalid UTF-8, a character
 *   canonicalJson refuses, whitespace it never writes, or an escape it never writes;
 * - an unbalanced or mismatched bracket, or an unterminated string (no escapes can hide a
 *   quote, so string boundaries are exact): invalid JSON;
 * - a container with more elements or members than `limits` allows (k commas at one level mean
 *   k + 1 entries or invalid JSON; a duplicate key is refused by the canonical check anyway),
 *   more containers or deeper nesting than `limits` allows.
 *
 * It never decides acceptance: whatever it passes is decoded, parsed and checked in full.
 */
export function prescanCanonical(bytes: Uint8Array, limits: CanonicalShapeLimits): boolean {
  const kinds = new Uint8Array(limits.maxNesting + 1);
  const commas = new Uint32Array(limits.maxNesting + 1);
  let depth = 0;
  let containers = 0;
  let inString = false;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (c < 0x20 || c > 0x7e || c === BACKSLASH) return false;
    if (c === QUOTE) {
      inString = !inString;
    } else if (inString) {
      continue;
    } else if (c === OPEN_ARRAY || c === OPEN_OBJECT) {
      if (depth >= limits.maxNesting || containers >= limits.maxContainers) return false;
      depth += 1;
      containers += 1;
      kinds[depth] = c;
      commas[depth] = 0;
    } else if (c === CLOSE_ARRAY || c === CLOSE_OBJECT) {
      if (depth === 0 || kinds[depth] !== (c === CLOSE_ARRAY ? OPEN_ARRAY : OPEN_OBJECT)) {
        return false;
      }
      depth -= 1;
    } else if (c === COMMA && depth > 0) {
      commas[depth] = commas[depth]! + 1;
      const limit = kinds[depth] === OPEN_ARRAY ? limits.maxArrayElements : limits.maxObjectMembers;
      if (commas[depth]! + 1 > limit) return false;
    }
  }
  return !inString && depth === 0;
}

interface Frame {
  readonly container: readonly unknown[] | Readonly<Record<string, unknown>>;
  /** Sorted keys of an object; null for an array. */
  readonly keys: readonly string[] | null;
  readonly depth: number;
  next: number;
}

/**
 * The canonical check of `text` against the value JSON.parse produces from it, resumable: the
 * same accept/refuse decision as `canonicalJson(JSON.parse(text)) === text`, computed by
 * comparing the canonical form with `text` position by position (no output string), with an
 * explicit stack instead of recursion. `step(budget)` performs at most `budget` operations — one
 * value written or one container closed — and returns true once the whole text matched.
 *
 * It relies on what JSON.parse guarantees (plain objects and dense arrays with the standard
 * prototypes and own enumerable data properties only), which is why it parses the text itself:
 * it never sees a value from anywhere else. Every refusal throws `script-invalid`.
 */
export class CanonicalCheck {
  readonly #text: string;
  readonly #root: unknown;
  readonly #stack: Frame[] = [];
  #pos = 0;
  #ops = 0;
  #started = false;
  #done = false;

  private constructor(text: string, root: unknown) {
    this.#text = text;
    this.#root = root;
  }

  /** Parses `text` (JSON.parse; `script-invalid` if it is not JSON) for checking. */
  static parse(text: string): CanonicalCheck {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return invalid();
    }
    return new CanonicalCheck(text, value);
  }

  /** The parsed value. Canonical only once `step` returned true. */
  get value(): unknown {
    return this.#root;
  }

  /** Operations performed so far (all steps). */
  get operations(): number {
    return this.#ops;
  }

  step(budget: number): boolean {
    if (this.#done) return true;
    const limit = this.#ops + budget;
    if (!this.#started) {
      this.#started = true;
      this.#ops += 1;
      this.#visit(this.#root, 0);
    }
    const stack = this.#stack;
    while (stack.length > 0) {
      if (this.#ops >= limit) return false;
      this.#ops += 1;
      const frame = stack[stack.length - 1]!;
      const keys = frame.keys;
      if (frame.next >= (keys === null ? (frame.container as unknown[]).length : keys.length)) {
        this.#char(keys === null ? CLOSE_ARRAY : CLOSE_OBJECT);
        stack.pop();
        continue;
      }
      if (frame.next > 0) this.#char(COMMA);
      let child: unknown;
      if (keys === null) {
        child = (frame.container as readonly unknown[])[frame.next];
      } else {
        const key = keys[frame.next]!;
        if (!SAFE_STRING.test(key)) invalid();
        this.#char(QUOTE);
        this.#literal(key);
        this.#char(QUOTE);
        this.#char(0x3a); // ":"
        child = (frame.container as Readonly<Record<string, unknown>>)[key];
      }
      frame.next += 1;
      this.#visit(child, frame.depth + 1);
    }
    if (this.#pos !== this.#text.length) invalid();
    this.#done = true;
    return true;
  }

  /** Writes a primitive, or opens a container (pushed; written by later operations). */
  #visit(value: unknown, depth: number): void {
    if (depth > MAX_DEPTH) invalid();
    if (value === null) return this.#literal("null");
    switch (typeof value) {
      case "boolean":
        return this.#literal(value ? "true" : "false");
      case "number":
        if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
        return this.#literal(String(value));
      case "string":
        if (!SAFE_STRING.test(value)) invalid();
        this.#char(QUOTE);
        this.#literal(value);
        return this.#char(QUOTE);
      case "object":
        break;
      default:
        invalid();
    }
    if (Array.isArray(value)) {
      this.#char(OPEN_ARRAY);
      this.#stack.push({ container: value, keys: null, depth, next: 0 });
      return;
    }
    const keys = Object.keys(value as object).sort();
    this.#char(OPEN_OBJECT);
    this.#stack.push({ container: value as Record<string, unknown>, keys, depth, next: 0 });
  }

  #char(code: number): void {
    if (this.#text.charCodeAt(this.#pos) !== code) invalid();
    this.#pos += 1;
  }

  #literal(s: string): void {
    if (!this.#text.startsWith(s, this.#pos)) invalid();
    this.#pos += s.length;
  }
}
