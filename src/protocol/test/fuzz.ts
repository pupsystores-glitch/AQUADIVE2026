// Seeded hostile-input generator for the codec tests (P8-1; docs/20 §5.3 test 1).
//
// Deterministic: the same seed yields the same inputs, so a failure is
// reproducible from the seed and index alone. No dependency: a 32-bit
// mulberry32 generator drives every choice.

import { MAX_CLIENT_FRAME_BYTES, MAX_SERVER_FRAME_BYTES } from "../limits";
import { GOLDEN_V1 } from "./golden-v1";

export type FuzzInput = string | Uint8Array;

/** mulberry32: a small, fast, seedable 32-bit generator (test use only). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKENS = [
  "1e309",
  "-1e309",
  "-0",
  "0.1",
  "1e3",
  "9007199254740993",
  "null",
  "true",
  '"__proto__"',
  '"constructor"',
  '"prototype"',
  '"NaN"',
  '"Infinity"',
  '"-1"',
  '"01"',
  '"1.50"',
  '"\\u0000"',
  '"\\ud800"',
  "{}",
  "[]",
  '{"__proto__":{"polluted":true}}',
];

const KEYS = [
  "v",
  "t",
  "id",
  "p",
  "seq",
  "ts",
  "re",
  "slot",
  "amountMinor",
  "__proto__",
  "constructor",
  "prototype",
];

/** One structurally hostile input built from scratch. */
function hostile(rand: () => number): FuzzInput {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  switch (Math.floor(rand() * 10)) {
    case 0: {
      // Random bytes, often invalid UTF-8.
      const bytes = new Uint8Array(Math.floor(rand() * 64));
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rand() * 256);
      return bytes;
    }
    case 1: {
      // Deep nesting, beyond any limit.
      const depth = 1 + Math.floor(rand() * 400);
      const open = rand() < 0.5 ? "[" : '{"a":';
      const close = open === "[" ? "]" : "}";
      return open.repeat(depth) + "1" + close.repeat(depth);
    }
    case 2:
      // Oversized frames, one byte over each limit and far beyond.
      return "x".repeat(
        pick([MAX_CLIENT_FRAME_BYTES + 1, MAX_SERVER_FRAME_BYTES + 1, MAX_SERVER_FRAME_BYTES * 4]),
      );
    case 3:
      // A long string value inside a well-formed object.
      return `{"v":1,"t":"ping","id":"x","p":{"clientTs":"${"9".repeat(Math.floor(rand() * 5000))}"}}`;
    case 4: {
      // Random objects with dangerous keys and values.
      const parts: string[] = [];
      const n = Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) parts.push(`"${pick(KEYS)}":${pick(TOKENS)}`);
      return `{${parts.join(",")}}`;
    }
    case 5:
      // Lone surrogates and control characters in a JS string.
      return `{"v":1,"t":"hello\ud800","id":"\u0000","p":{}}`;
    case 6:
      // Byte-order mark, then JSON.
      return new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    case 7:
      return pick(TOKENS);
    case 8:
      // Not text at all.
      return pick<FuzzInput>([new Uint8Array(0), ""]);
    default: {
      // A random printable ASCII string.
      let s = "";
      const n = Math.floor(rand() * 80);
      for (let i = 0; i < n; i++) s += String.fromCharCode(32 + Math.floor(rand() * 95));
      return s;
    }
  }
}

/** A golden frame, mutated: truncated, a character replaced, inserted or deleted, or a token spliced in. */
function mutated(rand: () => number): FuzzInput {
  const base = GOLDEN_V1[Math.floor(rand() * GOLDEN_V1.length)].frame;
  const at = Math.floor(rand() * base.length);
  switch (Math.floor(rand() * 5)) {
    case 0:
      return base.slice(0, at);
    case 1:
      return (
        base.slice(0, at) + String.fromCharCode(Math.floor(rand() * 0x10000)) + base.slice(at + 1)
      );
    case 2:
      return base.slice(0, at) + String.fromCharCode(32 + Math.floor(rand() * 95)) + base.slice(at);
    case 3:
      return base.slice(0, at) + base.slice(at + 1);
    default: {
      // Replace the value after a random colon with a hostile token.
      const colon = base.indexOf(":", at);
      if (colon < 0) return base;
      const end = base.slice(colon + 1).search(/[,}\]]/);
      const tail = end < 0 ? "" : base.slice(colon + 1 + end);
      return base.slice(0, colon + 1) + TOKENS[Math.floor(rand() * TOKENS.length)] + tail;
    }
  }
}

/** `count` deterministic inputs: half built from scratch, half mutated golden frames. */
export function* fuzzInputs(seed: number, count: number): Generator<FuzzInput> {
  const rand = seededRandom(seed);
  for (let i = 0; i < count; i++) yield rand() < 0.5 ? hostile(rand) : mutated(rand);
}
