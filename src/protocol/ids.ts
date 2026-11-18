// Canonical identifiers and indices (P8-1; docs/09 §35.2 P1-D6).
//
// One canonical form per identifier, so that idempotency comparisons and log
// joins are exact string comparisons:
//
// - `roundId`, `betId`, `sessionId`: lower-case RFC 9562 UUID strings, any
//   version (server-generated; `betId` is UUIDv7 by docs/09 §14).
// - Request `id`: lower-case UUID, version 4 or 7 only (client-generated with
//   `crypto.randomUUID()` or a v7 generator). ULIDs are not accepted.
// - Unsigned 63-bit counters (`roundNumber`, `chainIndex`, `ledgerSeq`):
//   canonical decimal strings, never JSON numbers, so they stay exact above
//   2^53 and fit PostgreSQL `BIGINT`. `roundNumber` is ≥ 1.
// - `tick`: the dive tick index (0 = dive start) as a JSON integer.
// - `slot` ∈ {0, 1} and `chestId` ∈ {0, 1, 2} as JSON integers.
//
// Branded types mark values that passed their schema.

import { z } from "zod";
import { MAX_COUNTER_DIGITS, MAX_CREATURE_ID, MAX_TICK } from "./limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COUNTER = new RegExp(`^(0|[1-9][0-9]{0,${MAX_COUNTER_DIGITS - 1}})$`);
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The largest value of an unsigned 63-bit counter: PostgreSQL `BIGINT`'s maximum. */
export const MAX_COUNTER = 2n ** 63n - 1n;

/** A JSON integer in [min, max]; `-0` is not canonical and is rejected. */
export const integerIn = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .refine((n) => !Object.is(n, -0), "negative zero");

export const RoundIdSchema = z.string().regex(UUID).brand<"RoundId">();
export const BetIdSchema = z.string().regex(UUID).brand<"BetId">();
export const SessionIdSchema = z.string().regex(UUID).brand<"SessionId">();
export const RequestIdSchema = z.string().regex(REQUEST_UUID).brand<"RequestId">();

/** True iff `s` is a canonical counter string within `BIGINT`. */
export function isCounterString(s: string): boolean {
  return COUNTER.test(s) && BigInt(s) <= MAX_COUNTER;
}

/** Canonical unsigned 63-bit counter string (chain index, ledger sequence). */
export const CounterSchema = z.string().refine(isCounterString, "not a canonical counter");

/** Round number: a counter ≥ 1, never reused (docs/09 §16.6). */
export const RoundNumberSchema = z
  .string()
  .refine((s) => isCounterString(s) && s !== "0", "not a canonical round number")
  .brand<"RoundNumber">();

export const TickSchema = integerIn(0, MAX_TICK);
export const SlotSchema = z.union([z.literal(0), z.literal(1)]);
export const ChestIdSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const CreatureIdSchema = integerIn(0, MAX_CREATURE_ID);

/** A SHA-256 value or 256-bit seed as 64 lower-case hex digits. */
export const Sha256HexSchema = z.string().regex(SHA256_HEX);

export type RoundId = z.output<typeof RoundIdSchema>;
export type BetId = z.output<typeof BetIdSchema>;
export type SessionId = z.output<typeof SessionIdSchema>;
export type RequestId = z.output<typeof RequestIdSchema>;
export type RoundNumber = z.output<typeof RoundNumberSchema>;
export type Slot = z.output<typeof SlotSchema>;
export type ChestId = z.output<typeof ChestIdSchema>;
