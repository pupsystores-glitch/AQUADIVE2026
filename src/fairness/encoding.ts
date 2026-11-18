// Canonical binary encoding of derivation messages (P8-3a; owner decision D2 — docs/09 §38).
//
// fv = 1 stream-block message (all integers big-endian, all lengths in bytes):
//
//   offset        size  field
//   0             1     tag length = 17
//   1             17    tag, ASCII "AQUADIVE-FAIRNESS"
//   18            1     fv = 0x01
//   19            1     kind = 0x01 (stream block)
//   20            1     chain id length = 32
//   21            32    chain id (the chain's terminating hash x_0)
//   53            4     chain index, u32, 1 … 4,294,967,295
//   57            1     salt length S, 16 … 64
//   58            S     salt (explicit public salt bytes)
//   58+S          1     purpose length P, 1 … 32
//   59+S          P     purpose, ASCII matching PURPOSE_PATTERN
//   59+S+P        4     block counter, u32, 0 … 4,294,967,295
//   total = 63 + S + P bytes (95 … 159)
//
// Every field has either a fixed width or a one-byte length prefix and the field order is fixed,
// so a message parses in exactly one way: two different field tuples can never encode to the
// same bytes. decodeBlockMessage() is the strict inverse and rejects trailing or missing bytes.
// A database-assigned round number is deliberately NOT a field (D2).

import {
  FAIRNESS_VERSION,
  FairnessError,
  HASH_BYTES,
  MAX_BLOCK_COUNTER,
  MAX_CHAIN_INDEX,
  MAX_PURPOSE_BYTES,
  MAX_SALT_BYTES,
  MIN_SALT_BYTES,
  PURPOSE_PATTERN,
  assertSupportedVersion,
} from "./version.ts";

/** Domain-separation tag of every fv = 1 message. */
export const DOMAIN_TAG = "AQUADIVE-FAIRNESS";

/** Message kinds. Only the stream block exists in P8-3a; new kinds never reuse a value. */
export const MESSAGE_KIND_STREAM_BLOCK = 0x01;

/** The fields of one stream-block message. */
export interface BlockMessageFields {
  readonly fv: number;
  readonly chainId: Uint8Array;
  readonly chainIndex: number;
  readonly salt: Uint8Array;
  readonly purpose: string;
  readonly counter: number;
}

const TAG_BYTES = asciiBytes(DOMAIN_TAG);

/** Throws unless `value` is an integer in [min, max]. */
function assertU32(
  value: unknown,
  min: number,
  max: number,
  code: "invalid-chain-index" | "invalid-counter",
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new FairnessError(code, "integer is out of range");
  }
}

/** Validates a chain identifier: exactly 32 bytes. */
export function assertChainId(chainId: unknown): asserts chainId is Uint8Array {
  if (!(chainId instanceof Uint8Array) || chainId.length !== HASH_BYTES) {
    throw new FairnessError("invalid-chain-id", "chain id must be 32 bytes");
  }
}

/** Validates a round chain index: 1 … MAX_CHAIN_INDEX (index 0 is the terminating hash). */
export function assertChainIndex(chainIndex: unknown): asserts chainIndex is number {
  assertU32(chainIndex, 1, MAX_CHAIN_INDEX, "invalid-chain-index");
}

/** Validates an explicit salt: MIN_SALT_BYTES … MAX_SALT_BYTES bytes. */
export function assertSalt(salt: unknown): asserts salt is Uint8Array {
  if (
    !(salt instanceof Uint8Array) ||
    salt.length < MIN_SALT_BYTES ||
    salt.length > MAX_SALT_BYTES
  ) {
    throw new FairnessError("invalid-salt", "salt must be 16 to 64 bytes");
  }
}

/** Validates the syntax of a purpose identifier (registry membership is checked by derive.ts). */
export function assertPurposeSyntax(purpose: unknown): asserts purpose is string {
  if (
    typeof purpose !== "string" ||
    purpose.length === 0 ||
    purpose.length > MAX_PURPOSE_BYTES ||
    !PURPOSE_PATTERN.test(purpose)
  ) {
    throw new FairnessError("invalid-purpose", "purpose identifier is malformed");
  }
}

/** Validates a block counter: 0 … MAX_BLOCK_COUNTER. */
export function assertCounter(counter: unknown): asserts counter is number {
  assertU32(counter, 0, MAX_BLOCK_COUNTER, "invalid-counter");
}

/** Encodes one stream-block message. Validates every field first; never truncates or pads. */
export function encodeBlockMessage(fields: BlockMessageFields): Uint8Array {
  assertSupportedVersion(fields.fv);
  assertChainId(fields.chainId);
  assertChainIndex(fields.chainIndex);
  assertSalt(fields.salt);
  assertPurposeSyntax(fields.purpose);
  assertCounter(fields.counter);
  const purpose = asciiBytes(fields.purpose);
  const out = new Uint8Array(63 + fields.salt.length + purpose.length);
  const view = new DataView(out.buffer);
  let o = 0;
  out[o++] = TAG_BYTES.length;
  out.set(TAG_BYTES, o);
  o += TAG_BYTES.length;
  out[o++] = fields.fv;
  out[o++] = MESSAGE_KIND_STREAM_BLOCK;
  out[o++] = HASH_BYTES;
  out.set(fields.chainId, o);
  o += HASH_BYTES;
  view.setUint32(o, fields.chainIndex, false);
  o += 4;
  out[o++] = fields.salt.length;
  out.set(fields.salt, o);
  o += fields.salt.length;
  out[o++] = purpose.length;
  out.set(purpose, o);
  o += purpose.length;
  view.setUint32(o, fields.counter, false);
  o += 4;
  if (o !== out.length) throw new FairnessError("invalid-encoding", "encoder length mismatch");
  return out;
}

/**
 * Strict inverse of encodeBlockMessage. Throws `invalid-encoding` for any byte string that the
 * encoder could not have produced (wrong tag, kind or lengths, truncation, trailing bytes).
 */
export function decodeBlockMessage(bytes: Uint8Array): BlockMessageFields {
  if (!(bytes instanceof Uint8Array)) throw new FairnessError("invalid-encoding", "not bytes");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const need = (n: number): void => {
    if (o + n > bytes.length) throw new FairnessError("invalid-encoding", "message is truncated");
  };
  const lengthPrefixed = (min: number, max: number): Uint8Array => {
    need(1);
    const n = bytes[o++];
    if (n < min || n > max)
      throw new FairnessError("invalid-encoding", "field length is out of range");
    need(n);
    const field = bytes.slice(o, o + n);
    o += n;
    return field;
  };
  const tag = lengthPrefixed(TAG_BYTES.length, TAG_BYTES.length);
  if (!bytesEqual(tag, TAG_BYTES)) throw new FairnessError("invalid-encoding", "wrong domain tag");
  need(2);
  const fv = bytes[o++];
  if (fv !== FAIRNESS_VERSION)
    throw new FairnessError("invalid-encoding", "unsupported version byte");
  if (bytes[o++] !== MESSAGE_KIND_STREAM_BLOCK)
    throw new FairnessError("invalid-encoding", "wrong message kind");
  const chainId = lengthPrefixed(HASH_BYTES, HASH_BYTES);
  need(4);
  const chainIndex = view.getUint32(o, false);
  o += 4;
  const salt = lengthPrefixed(MIN_SALT_BYTES, MAX_SALT_BYTES);
  const purposeBytes = lengthPrefixed(1, MAX_PURPOSE_BYTES);
  need(4);
  const counter = view.getUint32(o, false);
  o += 4;
  if (o !== bytes.length) throw new FairnessError("invalid-encoding", "trailing bytes");
  let purpose = "";
  for (const b of purposeBytes) purpose += String.fromCharCode(b);
  try {
    assertChainIndex(chainIndex);
    assertPurposeSyntax(purpose);
  } catch {
    throw new FairnessError("invalid-encoding", "field value is invalid");
  }
  return { fv, chainId, chainIndex, salt, purpose, counter };
}

/** ASCII-only string to bytes; throws for any code unit above 0x7f. */
export function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) throw new FairnessError("invalid-purpose", "text is not ASCII");
    out[i] = c;
  }
  return out;
}

/** Lower-case hex of public bytes (never pass secret material to logs through this). */
export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += (b < 16 ? "0" : "") + b.toString(16);
  return s;
}

/** Strict lower-case hex decoder: even length, [0-9a-f] only. */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) {
    throw new FairnessError("invalid-hex", "expected lower-case hex of even length");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Constant-time equality for equal lengths (lengths are not secret here). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
