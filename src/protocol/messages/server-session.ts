// Session server → client messages, v1 draft (P8-1; docs/09 §34.7, §34.8, §35.2 P1-D5, P1-D13).
//
// SESSION = sent to one connection only: its own responses and its player's
// private state. These must never be broadcast (`welcome` included: it carries
// private state, docs/09 §34.7). Every `bet.*`, `bonus.pick*` and `wallet.*`
// message is a session message. Responses repeat the request id in the
// envelope's `re`; payloads carry no request id.
//
// | Type                 | `re`     | Payload |
// |----------------------|----------|---------|
// | `welcome`            | required | `{ protocol, sessionId, serverTimeMs, tickHz, snapshot, player? }` |
// | `auth.ok`            | required | `{ player }` |
// | `sync.snapshot`      | required | `{ snapshot, player? }` — `player` for authenticated sessions |
// | `pong`               | required | `{ clientTs, serverTimeMs }` |
// | `bet.accepted`       | required | `{ betId, roundId, slot, amountMinor, currency, balanceMinor }` |
// | `bet.rejected`       | required | `{ roundId, slot, code }` |
// | `bet.cashedOut`      | required | `{ betId, roundId, slot, tick, multiplier, payoutMinor, currency, balanceMinor }` |
// | `bet.lost`           | —        | `{ betId, roundId, slot }` |
// | `bet.jackpot`        | —        | `{ betId, roundId, slot, jackpotMultiplier, bonusEligible: true }` |
// | `bet.settled`        | —        | `{ betId, roundId, slot, finalMultiplier, payoutMinor, currency, balanceMinor }` |
// | `bonus.pickAccepted` | required | `{ roundId, chestId }` |
// | `bonus.pickRejected` | required | `{ roundId, code }` |
// | `wallet.balance`     | —        | `{ balanceMinor, currency, ledgerSeq }` |
// | `error`              | optional | `{ code, retryable }` |
//
// `bet.jackpot` + `bet.settled` encode the draft "one settlement per bet at
// bonus resolution" (OD-20, not decided). A private rejection caused by the
// crash must not reach a client before the public `round.crashed` (docs/09
// §34.4 F3): an ordering duty of the server, not a schema property.

import { z } from "zod";
import {
  BetIdSchema,
  ChestIdSchema,
  CounterSchema,
  integerIn,
  RoundIdSchema,
  SessionIdSchema,
  SlotSchema,
  TickSchema,
} from "../ids";
import {
  ServerTimeMsSchema,
  type ServerMessageInputUnion,
  type ServerMessageUnion,
} from "../envelope";
import { WireErrorCodeSchema } from "../errors";
import { MAX_SAFE_COUNTER, MAX_TICK_HZ } from "../limits";
import { AmountMinorSchema, CurrencyCodeSchema, StakeMinorSchema } from "../money";
import { MultiplierSchema } from "../multiplier";
import { PlayerPrivateStateSchema, PublicSnapshotSchema } from "../snapshot";
import { MAX_PROTOCOL_MAJOR } from "../version";

export const WelcomePayload = z.object({
  protocol: integerIn(1, MAX_PROTOCOL_MAJOR),
  sessionId: SessionIdSchema,
  serverTimeMs: ServerTimeMsSchema,
  tickHz: integerIn(1, MAX_TICK_HZ),
  snapshot: PublicSnapshotSchema,
  player: PlayerPrivateStateSchema.optional(),
});

export const AuthOkPayload = z.object({ player: PlayerPrivateStateSchema });

export const SyncSnapshotPayload = z.object({
  snapshot: PublicSnapshotSchema,
  player: PlayerPrivateStateSchema.optional(),
});

export const PongPayload = z.object({
  clientTs: integerIn(0, MAX_SAFE_COUNTER),
  serverTimeMs: ServerTimeMsSchema,
});

export const BetAcceptedPayload = z.object({
  betId: BetIdSchema,
  roundId: RoundIdSchema,
  slot: SlotSchema,
  amountMinor: StakeMinorSchema,
  currency: CurrencyCodeSchema,
  balanceMinor: AmountMinorSchema,
});

export const BetRejectedPayload = z.object({
  roundId: RoundIdSchema,
  slot: SlotSchema,
  code: WireErrorCodeSchema,
});

export const BetCashedOutPayload = z.object({
  betId: BetIdSchema,
  roundId: RoundIdSchema,
  slot: SlotSchema,
  tick: TickSchema,
  multiplier: MultiplierSchema,
  payoutMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  balanceMinor: AmountMinorSchema,
});

export const BetLostPayload = z.object({
  betId: BetIdSchema,
  roundId: RoundIdSchema,
  slot: SlotSchema,
});

export const BetJackpotPayload = z.object({
  betId: BetIdSchema,
  roundId: RoundIdSchema,
  slot: SlotSchema,
  jackpotMultiplier: MultiplierSchema,
  bonusEligible: z.literal(true),
});

export const BetSettledPayload = z.object({
  betId: BetIdSchema,
  roundId: RoundIdSchema,
  slot: SlotSchema,
  finalMultiplier: MultiplierSchema,
  payoutMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  balanceMinor: AmountMinorSchema,
});

export const BonusPickAcceptedPayload = z.object({
  roundId: RoundIdSchema,
  chestId: ChestIdSchema,
});

export const BonusPickRejectedPayload = z.object({
  roundId: RoundIdSchema,
  code: WireErrorCodeSchema,
});

export const WalletBalancePayload = z.object({
  balanceMinor: AmountMinorSchema,
  currency: CurrencyCodeSchema,
  ledgerSeq: CounterSchema,
});

// `retryable`: a resend with the SAME request id may succeed later. It says
// nothing about whether the original request took effect (errors.ts,
// `RequestOutcome`); a client never answers it with a new request id.
// `bet.rejected` / `bonus.pickRejected` need no such flag: they carry only
// stored, final decisions (errors.ts, carrier rule).
export const ErrorPayload = z.object({
  code: WireErrorCodeSchema,
  retryable: z.boolean(),
});

/** The session catalogue: type → payload schema and `re` rule. */
export const SESSION_SERVER_MESSAGES = {
  welcome: { payload: WelcomePayload, re: "required" },
  "auth.ok": { payload: AuthOkPayload, re: "required" },
  "sync.snapshot": { payload: SyncSnapshotPayload, re: "required" },
  pong: { payload: PongPayload, re: "required" },
  "bet.accepted": { payload: BetAcceptedPayload, re: "required" },
  "bet.rejected": { payload: BetRejectedPayload, re: "required" },
  "bet.cashedOut": { payload: BetCashedOutPayload, re: "required" },
  "bet.lost": { payload: BetLostPayload, re: "forbidden" },
  "bet.jackpot": { payload: BetJackpotPayload, re: "forbidden" },
  "bet.settled": { payload: BetSettledPayload, re: "forbidden" },
  "bonus.pickAccepted": { payload: BonusPickAcceptedPayload, re: "required" },
  "bonus.pickRejected": { payload: BonusPickRejectedPayload, re: "required" },
  "wallet.balance": { payload: WalletBalancePayload, re: "forbidden" },
  error: { payload: ErrorPayload, re: "optional" },
} as const;

export type SessionServerMessageType = keyof typeof SESSION_SERVER_MESSAGES;

/** A decoded session message: one connection only, never broadcast. */
export type SessionServerMessage = ServerMessageUnion<typeof SESSION_SERVER_MESSAGES>;

/** A session message as an encoder accepts it. */
export type SessionServerMessageInput = ServerMessageInputUnion<typeof SESSION_SERVER_MESSAGES>;
