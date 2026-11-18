// Frame envelopes (P8-1; docs/09 §35.2 P1-D3, P1-D7).
//
// One UTF-8 JSON object per frame.
//
//   client → server   { "v": 1, "t": type, "id": requestId, "p": payload }
//   server → client   { "v": 1, "t": type, "seq": n, "ts": "ms", "re"?: requestId, "p": payload }
//
// - `t`: `namespace.verb` (or a bare connection-level verb such as `ping`).
// - `id`: the client's request id (UUID v4 or v7), on every client frame.
// - `re`: the request id a response answers. Required on responses, absent on
//   broadcasts and unsolicited messages (each type states its rule).
// - `seq`: per connection, 1 on the first server frame, then +1 exactly. A
//   gap means "resynchronize" (`sync.request`); a new connection restarts it.
// - `ts`: server wall-clock milliseconds as a decimal string. Informational
//   only: never used for ordering, never trusted back from a client.
//
// The envelope schemas here check the frame's shape with the payload left
// open; `codec.ts` then checks the payload against its type's schema.

import { z } from "zod";
import { integerIn, RequestIdSchema } from "./ids";
import { MAX_SAFE_COUNTER, MAX_SERVER_TIME_DIGITS, MAX_TYPE_LENGTH } from "./limits";
import { PROTOCOL_MAJOR } from "./version";

// `namespace.verb`, or a bare connection-level verb (`hello`, `ping`, `welcome`, `pong`, `error`).
const TYPE = /^[a-z][a-z0-9]*(\.[a-z][A-Za-z0-9]*)?$/;
const SERVER_TIME = new RegExp(`^(0|[1-9][0-9]{0,${MAX_SERVER_TIME_DIGITS - 1}})$`);

/** The first `seq` of every connection. */
export const FIRST_SEQ = 1;

/** A well-formed message type string (known or not). */
export const MessageTypeSchema = z.string().max(MAX_TYPE_LENGTH).regex(TYPE);

/** Server wall-clock milliseconds: canonical decimal string below 10^16. */
export const ServerTimeMsSchema = z.string().regex(SERVER_TIME).brand<"ServerTimeMs">();
export type ServerTimeMs = z.output<typeof ServerTimeMsSchema>;

export const SeqSchema = integerIn(FIRST_SEQ, MAX_SAFE_COUNTER);

/** A JSON object (not an array or null). */
export const isJsonObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

// The payload is checked for being an object without copying it: a copying
// record schema would assign every key, `__proto__` included.
const PayloadSlot = z.custom<Record<string, unknown>>(isJsonObject, "payload is not an object");

/** Client → server envelope; strict, payload checked per type afterwards. */
export const ClientEnvelopeSchema = z
  .object({
    v: z.literal(PROTOCOL_MAJOR),
    t: MessageTypeSchema,
    id: RequestIdSchema,
    p: PayloadSlot,
  })
  .strict();

/** Server → client envelope; unknown fields are stripped (tolerant client decoding). */
export const ServerEnvelopeSchema = z.object({
  v: z.literal(PROTOCOL_MAJOR),
  t: MessageTypeSchema,
  seq: SeqSchema,
  ts: ServerTimeMsSchema,
  re: RequestIdSchema.optional(),
  p: PayloadSlot,
});

/** Whether a server message type carries `re`. */
export type CorrelationRule = "required" | "forbidden" | "optional";

/** One server catalogue entry: the payload schema and the `re` rule. */
export interface ServerMessageSpec {
  readonly payload: z.ZodTypeAny;
  readonly re: CorrelationRule;
}

type ReField<R extends CorrelationRule, Id> = R extends "required"
  ? { re: Id }
  : R extends "optional"
    ? { re?: Id }
    : { re?: never };

/** The decoded messages of a server catalogue (branded values). */
export type ServerMessageUnion<C extends Record<string, ServerMessageSpec>> = {
  [T in keyof C & string]: {
    v: 1;
    t: T;
    seq: number;
    ts: ServerTimeMs;
    p: z.output<C[T]["payload"]>;
  } & ReField<C[T]["re"], z.output<typeof RequestIdSchema>>;
}[keyof C & string];

/** The messages of a server catalogue as an encoder accepts them (plain strings; validated on encode). */
export type ServerMessageInputUnion<C extends Record<string, ServerMessageSpec>> = {
  [T in keyof C & string]: {
    v: 1;
    t: T;
    seq: number;
    ts: string;
    p: z.input<C[T]["payload"]>;
  } & ReField<C[T]["re"], string>;
}[keyof C & string];

/** How a received `seq` relates to the previous one (P1-D7). */
export type SeqStatus = "next" | "gap" | "stale";

/**
 * Classify a received `seq` against the last one seen on this connection
 * (`null` before the first frame). "gap" and "stale" both mean the client's
 * view may be incomplete: it sends `sync.request` and rebuilds from the
 * `sync.snapshot` reply (there is no replay buffer, docs/09 §13.3).
 */
export function classifySeq(previous: number | null, received: number): SeqStatus {
  const expected = previous === null ? FIRST_SEQ : previous + 1;
  if (received === expected) return "next";
  return received > expected ? "gap" : "stale";
}
