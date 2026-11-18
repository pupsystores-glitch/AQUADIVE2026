// Frame codec: never-throwing decode and validating encode (P8-1; docs/09 §35.2 P1-D4).
//
// Decode pipeline, in this order, each step before any more expensive one:
//
//   1. input kind     a string or a Uint8Array (UTF-8 bytes), else `malformed`
//   2. byte size      ≤ 4 KiB client → server, ≤ 64 KiB server → client,
//                     measured BEFORE decoding or parsing  → `frame-too-large`
//   3. text           valid UTF-8 / no lone surrogates     → `malformed`
//   4. nesting        a string-aware bracket scan, ≤ 6, before `JSON.parse`
//   5. JSON.parse     in try/catch                          → `malformed`
//   6. object keys    `__proto__`, `constructor`, `prototype` anywhere → `malformed`
//   7. version        `v` an integer other than 1           → `protocol-unsupported`
//   8. envelope       shape; client frames strictly
//   9. type           unknown type → `unknown-type` (ignorable for a client)
//  10. payload        the type's schema (client: strict; server: unknown fields stripped)
//
// Decoders NEVER throw: every outcome is a `DecodeResult`. Failure details
// name a schema path and an issue kind only, never input values, so they are
// safe to log. The failure `code` is the stable contract; `detail` is a
// diagnostic whose wording may change at any time (never parse or match it
// outside this library's own tests). Encoders validate their own output first: a server encoder
// also rejects any field its schema does not list (nothing outside the
// allow-list is serialized, even nested), unregistered error codes and codes
// on the wrong carrier. Encoding a decoded message reproduces the canonical
// frame: `encode(decode(frame)) === frame` for every canonical frame.
//
// This module validates frames. It does not authenticate, rate-limit, order,
// replay-protect, store idempotency records or move money: those are runtime
// duties of later milestones (P8-2, P8-5, P8-8, P8-10).

import {
  ClientEnvelopeSchema,
  isJsonObject,
  ServerEnvelopeSchema,
  type ServerMessageSpec,
} from "./envelope";
import { errorCodeSpec, isErrorCodeAllowed, type ErrorCarrier } from "./errors";
import { MAX_CLIENT_FRAME_BYTES, MAX_NESTING_DEPTH, MAX_SERVER_FRAME_BYTES } from "./limits";
import {
  CLIENT_PAYLOADS,
  isClientMessageType,
  type ClientMessage,
  type ClientMessageInput,
} from "./messages/client";
import {
  PUBLIC_SERVER_MESSAGES,
  type PublicServerMessage,
  type PublicServerMessageInput,
} from "./messages/server-public";
import {
  SESSION_SERVER_MESSAGES,
  type SessionServerMessage,
  type SessionServerMessageInput,
} from "./messages/server-session";
import { PROTOCOL_MAJOR } from "./version";
import type { ZodError } from "zod";

export type ServerMessage = PublicServerMessage | SessionServerMessage;
export type ServerMessageInput = PublicServerMessageInput | SessionServerMessageInput;

export type DecodeErrorCode =
  "frame-too-large" | "malformed" | "protocol-unsupported" | "unknown-type";

export interface DecodeFailure {
  readonly ok: false;
  readonly code: DecodeErrorCode;
  /** Schema path and issue kind; never input values. */
  readonly detail: string;
  /** True only for an unknown server type at a client: skip the frame, keep the connection. */
  readonly ignorable: boolean;
}

export type DecodeResult<M> = { readonly ok: true; readonly msg: M } | DecodeFailure;

export type EncodeErrorCode = "frame-too-large" | "malformed" | "unknown-type";

export type EncodeResult =
  | { readonly ok: true; readonly frame: string }
  | { readonly ok: false; readonly code: EncodeErrorCode; readonly detail: string };

/** Every server message type, public and session. */
export const SERVER_MESSAGES: Readonly<Record<string, ServerMessageSpec>> = {
  ...PUBLIC_SERVER_MESSAGES,
  ...SESSION_SERVER_MESSAGES,
};

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ERROR_CARRIERS: ReadonlySet<string> = new Set<ErrorCarrier>([
  "bet.rejected",
  "bonus.pickRejected",
  "error",
]);
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const fail = (code: DecodeErrorCode, detail: string, ignorable = false): DecodeFailure => ({
  ok: false,
  code,
  detail,
  ignorable,
});

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** UTF-8 byte length of a string, or -1 if it holds a lone surrogate. */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return -1;
      bytes += 4;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return -1;
    else bytes += 3;
  }
  return bytes;
}

/** Steps 1 – 3: the frame as text within the byte limit. */
function frameText(raw: unknown, maxBytes: number): { ok: true; text: string } | DecodeFailure {
  if (typeof raw === "string") {
    // Every UTF-16 unit takes ≥ 1 UTF-8 byte, so a longer string is too large unmeasured.
    if (raw.length > maxBytes) return fail("frame-too-large", `exceeds ${maxBytes} bytes`);
    const bytes = utf8ByteLength(raw);
    if (bytes < 0) return fail("malformed", "lone surrogate");
    if (bytes > maxBytes) return fail("frame-too-large", `exceeds ${maxBytes} bytes`);
    return { ok: true, text: raw };
  }
  if (raw instanceof Uint8Array) {
    if (raw.byteLength > maxBytes) return fail("frame-too-large", `exceeds ${maxBytes} bytes`);
    try {
      return { ok: true, text: UTF8.decode(raw) };
    } catch {
      return fail("malformed", "invalid UTF-8");
    }
  }
  return fail("malformed", "frame is not text");
}

/** Step 4: true iff the JSON text nests containers deeper than `max` (strings are skipped). */
export function exceedsNesting(text: string, max: number): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c)
        i++; // backslash: skip the escaped unit
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) inString = true;
    else if (c === 0x7b || c === 0x5b) {
      if (++depth > max) return true;
    } else if (c === 0x7d || c === 0x5d) depth--;
  }
  return false;
}

/** Step 6: true iff a forbidden key appears anywhere (depth is already bounded by step 4). */
function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isJsonObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || hasForbiddenKey(value[key])) return true;
  }
  return false;
}

/** Steps 1 – 7: a parsed, bounded, prototype-safe JSON object with `v` = 1. */
function parseFrame(
  raw: unknown,
  maxBytes: number,
): { ok: true; value: Record<string, unknown> } | DecodeFailure {
  const text = frameText(raw, maxBytes);
  if (!text.ok) return text;
  if (exceedsNesting(text.text, MAX_NESTING_DEPTH)) {
    return fail("malformed", `nesting deeper than ${MAX_NESTING_DEPTH}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text.text);
  } catch {
    return fail("malformed", "invalid JSON");
  }
  if (!isJsonObject(value)) return fail("malformed", "frame is not an object");
  if (hasForbiddenKey(value)) return fail("malformed", "forbidden key");
  const v = value.v;
  if (v !== PROTOCOL_MAJOR) {
    return typeof v === "number" && Number.isInteger(v)
      ? fail("protocol-unsupported", "v")
      : fail("malformed", "v: invalid");
  }
  return { ok: true, value };
}

/** A safe failure detail: the first issue's schema path and code. */
function issueDetail(prefix: string, error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return `${prefix}: invalid`;
  const path = [prefix, ...issue.path].filter((s) => s !== "").join(".");
  return `${path}: ${issue.code}`;
}

const firewall = (): DecodeFailure => fail("malformed", "decoder fault");

/** Decode a client → server frame strictly (the server's inbound path). Never throws. */
export function decodeClientFrame(raw: unknown): DecodeResult<ClientMessage> {
  try {
    const frame = parseFrame(raw, MAX_CLIENT_FRAME_BYTES);
    if (!frame.ok) return frame;
    const env = ClientEnvelopeSchema.safeParse(frame.value);
    if (!env.success) return fail("malformed", issueDetail("", env.error));
    const { t, id } = env.data;
    if (!isClientMessageType(t)) return fail("unknown-type", "t: not a client message type");
    const payload = CLIENT_PAYLOADS[t].safeParse(frame.value.p);
    if (!payload.success) return fail("malformed", issueDetail("p", payload.error));
    return { ok: true, msg: { v: PROTOCOL_MAJOR, t, id, p: payload.data } as ClientMessage };
  } catch {
    return firewall();
  }
}

/** Decode a server → client frame tolerantly (the client's inbound path). Never throws. */
export function decodeServerFrame(raw: unknown): DecodeResult<ServerMessage> {
  try {
    const frame = parseFrame(raw, MAX_SERVER_FRAME_BYTES);
    if (!frame.ok) return frame;
    const env = ServerEnvelopeSchema.safeParse(frame.value);
    if (!env.success) return fail("malformed", issueDetail("", env.error));
    const { t, seq, ts, re } = env.data;
    if (!hasOwn(SERVER_MESSAGES, t))
      return fail("unknown-type", "t: not a known server type", true);
    const spec = SERVER_MESSAGES[t];
    const correlation = checkCorrelation(spec, re);
    if (correlation) return fail("malformed", correlation);
    const payload = spec.payload.safeParse(frame.value.p);
    if (!payload.success) return fail("malformed", issueDetail("p", payload.error));
    const msg =
      re === undefined
        ? { v: PROTOCOL_MAJOR, t, seq, ts, p: payload.data }
        : { v: PROTOCOL_MAJOR, t, seq, ts, re, p: payload.data };
    return { ok: true, msg: msg as ServerMessage };
  } catch {
    return firewall();
  }
}

/** A `re` rule violation, or `null`. */
function checkCorrelation(spec: ServerMessageSpec, re: unknown): string | null {
  if (spec.re === "required" && re === undefined) return "re: required";
  if (spec.re === "forbidden" && re !== undefined) return "re: not allowed";
  return null;
}

/** The first path where `input` has a defined field that `output` (the schema's parse) lacks. */
function extraField(input: unknown, output: unknown, path: string): string | null {
  if (Array.isArray(input) && Array.isArray(output)) {
    for (let i = 0; i < input.length; i++) {
      const found = extraField(input[i], output[i], `${path}.${i}`);
      if (found) return found;
    }
    return null;
  }
  if (isJsonObject(input) && isJsonObject(output)) {
    for (const key of Object.keys(input)) {
      if (input[key] === undefined) continue;
      if (!hasOwn(output, key)) return `${path}.${key}`;
      const found = extraField(input[key], output[key], `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

type EncodeFailure = Extract<EncodeResult, { ok: false }>;
const encodeFail = (code: EncodeErrorCode, detail: string): EncodeFailure => ({
  ok: false,
  code,
  detail,
});

/** Serialize a validated frame object and check the size and depth bounds. */
function serialize(out: object, maxBytes: number): EncodeResult {
  const frame = JSON.stringify(out);
  if (utf8ByteLength(frame) > maxBytes)
    return encodeFail("frame-too-large", `exceeds ${maxBytes} bytes`);
  if (exceedsNesting(frame, MAX_NESTING_DEPTH)) {
    return encodeFail("malformed", `nesting deeper than ${MAX_NESTING_DEPTH}`);
  }
  return { ok: true, frame };
}

/** Encode a client → server frame after strict validation. Never throws. */
export function encodeClientFrame(msg: ClientMessageInput): EncodeResult {
  try {
    const env = ClientEnvelopeSchema.safeParse(msg);
    if (!env.success) return encodeFail("malformed", issueDetail("", env.error));
    const { t, id } = env.data;
    if (!isClientMessageType(t)) return encodeFail("unknown-type", "t: not a client message type");
    const payload = CLIENT_PAYLOADS[t].safeParse(env.data.p);
    if (!payload.success) return encodeFail("malformed", issueDetail("p", payload.error));
    return serialize({ v: PROTOCOL_MAJOR, t, id, p: payload.data }, MAX_CLIENT_FRAME_BYTES);
  } catch {
    return encodeFail("malformed", "encoder fault");
  }
}

const ENVELOPE_KEYS = new Set(["v", "t", "seq", "ts", "re", "p"]);

function encodeServer(
  msg: unknown,
  catalogue: Readonly<Record<string, ServerMessageSpec>>,
  scope: string,
): EncodeResult {
  try {
    if (!isJsonObject(msg)) return encodeFail("malformed", "frame is not an object");
    const extraTop = Object.keys(msg).find((k) => msg[k] !== undefined && !ENVELOPE_KEYS.has(k));
    if (extraTop !== undefined) return encodeFail("malformed", "envelope: field not in schema");
    const env = ServerEnvelopeSchema.safeParse(msg);
    if (!env.success) return encodeFail("malformed", issueDetail("", env.error));
    const { t, seq, ts, re } = env.data;
    if (!hasOwn(catalogue, t)) return encodeFail("unknown-type", `t: not a ${scope} message type`);
    const spec = catalogue[t];
    const correlation = checkCorrelation(spec, re);
    if (correlation) return encodeFail("malformed", correlation);
    const payload = spec.payload.safeParse(env.data.p);
    if (!payload.success) return encodeFail("malformed", issueDetail("p", payload.error));
    const extra = extraField(env.data.p, payload.data, "p");
    if (extra) return encodeFail("malformed", `${extra}: field not in schema`);
    const policy = errorCodePolicy(t, payload.data);
    if (policy) return encodeFail("malformed", policy);
    const out =
      re === undefined
        ? { v: PROTOCOL_MAJOR, t, seq, ts, p: payload.data }
        : { v: PROTOCOL_MAJOR, t, seq, ts, re, p: payload.data };
    return serialize(out, MAX_SERVER_FRAME_BYTES);
  } catch {
    return encodeFail("malformed", "encoder fault");
  }
}

/** Outbound error-code rules: registered, allowed on this carrier, `retryable` as registered. */
function errorCodePolicy(t: string, p: unknown): string | null {
  if (!ERROR_CARRIERS.has(t) || !isJsonObject(p)) return null;
  if (!isErrorCodeAllowed(p.code, t as ErrorCarrier))
    return "p.code: not registered for this carrier";
  if (t === "error" && p.retryable !== errorCodeSpec(p.code)?.retryable)
    return "p.retryable: differs from the registry";
  return null;
}

/** Encode any server → client frame (session path). Never throws. */
export function encodeServerFrame(msg: ServerMessageInput): EncodeResult {
  return encodeServer(msg, SERVER_MESSAGES, "server");
}

/**
 * Encode a frame for the broadcast path. The parameter type admits public
 * messages only (P1-D5); a session message passed through a cast is still
 * refused at runtime.
 */
export function encodePublicServerFrame(msg: PublicServerMessageInput): EncodeResult {
  return encodeServer(msg, PUBLIC_SERVER_MESSAGES, "public");
}

/** True iff the message is a public (broadcastable) message. */
export function isPublicServerMessage(msg: ServerMessage): msg is PublicServerMessage {
  return hasOwn(PUBLIC_SERVER_MESSAGES, msg.t);
}
