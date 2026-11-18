// Client → server messages, v1 draft (P8-1; docs/09 §35.2 P1-D4, P1-D8, P1-D13).
//
// Client messages are REQUESTS. A client never sends an event, a multiplier,
// a payout, a balance, a tick, a player or bet id, a timestamp the server
// trusts, or an outcome (docs/09 §8.1). Every schema is strict: an unknown
// field anywhere rejects the frame.
//
// | Type           | Payload                                     | Answered by                          |
// |----------------|---------------------------------------------|--------------------------------------|
// | `hello`        | `{ protocol: {min, max}, client: {build, platform} }` | `welcome` / `error`        |
// | `auth.resume`  | `{ ticket }` (one-time WebSocket ticket)    | `auth.ok` / `error`                  |
// | `bet.place`    | `{ roundId, slot, amountMinor, currency }`  | `bet.accepted` / `bet.rejected`      |
// | `bet.cashout`  | `{ roundId, slot }`                         | `bet.cashedOut` / `bet.rejected`     |
// | `bonus.pick`   | `{ roundId, chestId }`                      | `bonus.pickAccepted` / `bonus.pickRejected` |
// | `sync.request` | `{ lastSeq?, roundId? }`                    | `sync.snapshot`                      |
// | `ping`         | `{ clientTs }` (client clock, echoed only)  | `pong`                               |
//
// Not in v1: bet cancellation (OD-19; addable as a new type), auto-cashout, chat.

import { z } from "zod";
import { ChestIdSchema, integerIn, RoundIdSchema, SlotSchema, type RequestId } from "../ids";
import {
  MAX_CLIENT_BUILD_LENGTH,
  MAX_CLIENT_PLATFORM_LENGTH,
  MAX_SAFE_COUNTER,
  MAX_TICKET_LENGTH,
  MIN_TICKET_LENGTH,
} from "../limits";
import { CurrencyCodeSchema, StakeMinorSchema } from "../money";
import { MAX_PROTOCOL_MAJOR } from "../version";

const BUILD = new RegExp(`^[A-Za-z0-9._+-]{1,${MAX_CLIENT_BUILD_LENGTH}}$`);
const PLATFORM = new RegExp(`^[a-z0-9-]{1,${MAX_CLIENT_PLATFORM_LENGTH}}$`);
const TICKET = new RegExp(`^[A-Za-z0-9_-]{${MIN_TICKET_LENGTH},${MAX_TICKET_LENGTH}}$`);

const ProtocolMajor = integerIn(1, MAX_PROTOCOL_MAJOR);

export const HelloPayload = z
  .object({
    protocol: z
      .object({ min: ProtocolMajor, max: ProtocolMajor })
      .strict()
      .refine((r) => r.min <= r.max, "min > max"),
    client: z
      .object({ build: z.string().regex(BUILD), platform: z.string().regex(PLATFORM) })
      .strict(),
  })
  .strict();

export const AuthResumePayload = z.object({ ticket: z.string().regex(TICKET) }).strict();

export const BetPlacePayload = z
  .object({
    roundId: RoundIdSchema,
    slot: SlotSchema,
    amountMinor: StakeMinorSchema,
    currency: CurrencyCodeSchema,
  })
  .strict();

export const BetCashoutPayload = z.object({ roundId: RoundIdSchema, slot: SlotSchema }).strict();

export const BonusPickPayload = z
  .object({ roundId: RoundIdSchema, chestId: ChestIdSchema })
  .strict();

export const SyncRequestPayload = z
  .object({ lastSeq: integerIn(0, MAX_SAFE_COUNTER).optional(), roundId: RoundIdSchema.optional() })
  .strict();

export const PingPayload = z.object({ clientTs: integerIn(0, MAX_SAFE_COUNTER) }).strict();

/** The client catalogue: message type → payload schema. */
export const CLIENT_PAYLOADS = {
  hello: HelloPayload,
  "auth.resume": AuthResumePayload,
  "bet.place": BetPlacePayload,
  "bet.cashout": BetCashoutPayload,
  "bonus.pick": BonusPickPayload,
  "sync.request": SyncRequestPayload,
  ping: PingPayload,
} as const;

type ClientPayloads = typeof CLIENT_PAYLOADS;

export type ClientMessageType = keyof ClientPayloads;

type Message<T extends ClientMessageType, P> = { v: 1; t: T; id: RequestId; p: P };

/** A decoded client message (branded values). */
export type ClientMessage = {
  [T in ClientMessageType]: Message<T, z.output<ClientPayloads[T]>>;
}[ClientMessageType];

/** A client message as an encoder accepts it (plain strings; validated on encode). */
export type ClientMessageInput = {
  [T in ClientMessageType]: { v: 1; t: T; id: string; p: z.input<ClientPayloads[T]> };
}[ClientMessageType];

export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { t: T }>;

export const CLIENT_MESSAGE_TYPES = Object.keys(CLIENT_PAYLOADS) as readonly ClientMessageType[];

/** True iff `t` is a client message type. */
export function isClientMessageType(t: unknown): t is ClientMessageType {
  return typeof t === "string" && Object.prototype.hasOwnProperty.call(CLIENT_PAYLOADS, t);
}

// ---------------------------------------------------------------------------
// Idempotency semantics (P1-D8). Enforcement (the store keyed by
// (playerId, id), retention ≥ settlement + 24 h) is P8-10's; these are the
// pure rules it applies.

/** The request types with at-most-one-effect semantics per `(playerId, id)`. */
export const IDEMPOTENT_CLIENT_TYPES = ["bet.place", "bet.cashout", "bonus.pick"] as const;

export type IdempotentClientType = (typeof IDEMPOTENT_CLIENT_TYPES)[number];
export type IdempotentClientMessage = ClientMessageOf<IdempotentClientType>;

/** True iff the message has idempotency semantics. */
export function isIdempotentMessage(msg: ClientMessage): msg is IdempotentClientMessage {
  return (IDEMPOTENT_CLIENT_TYPES as readonly string[]).includes(msg.t);
}

/**
 * The canonical payload of an idempotent request: its type and payload, in
 * schema field order, as JSON. Two requests with the same id are "the same
 * request" iff their fingerprints are equal (key order and whitespace of the
 * original frames do not matter; every value is already canonical).
 */
export function idempotencyFingerprint(msg: IdempotentClientMessage): string {
  const canonical = CLIENT_PAYLOADS[msg.t].parse(msg.p);
  return JSON.stringify([msg.t, canonical]);
}

/**
 * What the server does with a request whose `(playerId, id)` already has a
 * stored final response: the same canonical payload replays that response
 * (same `t`, `re` and `p`, new `seq`); a different one is answered with
 * `idempotency-conflict`, which is itself not stored.
 */
export function idempotencyDecision(
  storedFingerprint: string,
  incoming: IdempotentClientMessage,
): "replay" | "conflict" {
  return idempotencyFingerprint(incoming) === storedFingerprint ? "replay" : "conflict";
}
