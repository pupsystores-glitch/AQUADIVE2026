// Public server → client messages, v1 draft (P8-1; docs/09 §35.2 P1-D5, P1-D13).
//
// PUBLIC = broadcast to every connection, spectators included. A public
// message may carry only facts that are already disclosed: never `crashAt`,
// `terminalTick` before the end, an undisclosed jackpot or chest value, a
// seed before its reveal, a balance, or anything identifying another player
// beyond a public alias (docs/09 §12.1). `round.bonus` carries no chest
// values; they first appear in `round.chests`, when the pick window closes.
//
// | Type            | Payload                                                         | Sent at |
// |-----------------|-----------------------------------------------------------------|---------|
// | `round.betting` | `{ roundId, roundNumber, commitment, closesAtServerMs, bettingMs }` | entry(betting) |
// | `round.dive`    | `{ roundId, startServerMs }`                                     | entry(diving) |
// | `round.world`   | `{ roundId, fromTick, creatures }` (W-A stream, OD-5)            | ahead of need |
// | `round.sync`    | `{ roundId, tick, multiplier, boost, worldY }`                   | uniform cadence while diving |
// | `round.boost`   | `{ roundId, tick, creatureId }`                                  | goldfish consumed |
// | `round.crashed` | `{ roundId, tick, multiplier }`                                  | entry(crashed) |
// | `round.impact`  | `{ roundId, tick, jackpotMultiplier }`                           | entry(impact) |
// | `round.bonus`   | `{ roundId, pickClosesAtServerMs, pickWindowMs }` — no values     | entry(bonus) |
// | `round.chests`  | `{ roundId, chests: [m0, m1, m2] }`                              | pick window closed |
// | `round.ended`   | crash: `{ …, terminalTick, crashMultiplier, reveal }`; jackpot: `{ …, terminalTick, jackpotMultiplier, chests, reveal }` | after settlement commits |
// | `feed.bets`     | `{ roundId, entries: [{ alias, slot, amountMinor, currency, cashoutMultiplier? }] }` | batched |
// | `server.notice` | `{ kind: "drain" \| "maintenance", retryAfterMs? }`               | before planned shutdown |
//
// `round.sync` and `round.world` carry what both client replica options of
// docs/09 §34.11 need: tick-stamped samples and creature DTOs with server ids.
// The type system keeps session messages out of the broadcast path
// (`PublicServerMessage`); runtime allow-list builders (P8-5) stay required.

import { z } from "zod";
import {
  CounterSchema,
  CreatureIdSchema,
  integerIn,
  RoundIdSchema,
  RoundNumberSchema,
  Sha256HexSchema,
  SlotSchema,
  TickSchema,
} from "../ids";
import {
  ServerTimeMsSchema,
  type ServerMessageInputUnion,
  type ServerMessageUnion,
} from "../envelope";
import {
  MAX_ALIAS_LENGTH,
  MAX_CREATURE_PHASE,
  MAX_CREATURE_SIZE,
  MAX_CREATURES_PER_FRAME,
  MAX_DURATION_MS,
  MAX_FAIRNESS_VERSION,
  MAX_FEED_ENTRIES,
  MAX_WORLD_Y_PX,
} from "../limits";
import { CurrencyCodeSchema, StakeMinorSchema } from "../money";
import { decimalIn, MultiplierSchema } from "../multiplier";

const ALIAS = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_ALIAS_LENGTH}}$`);

/** Wire creature kinds (the engine's `CreatureKind`, restated: the protocol imports no engine type). */
export const CreatureKindSchema = z.enum([
  "fishSchool",
  "octopus",
  "sealion",
  "whale",
  "goldfish",
  "seahorse",
  "kelp",
  "jellyfish",
  "manta",
  "anglerfish",
]);

export const DurationMsSchema = integerIn(0, MAX_DURATION_MS);
export const BoostSchema = decimalIn(0, 1);
export const WorldYSchema = decimalIn(0, MAX_WORLD_Y_PX);

/** The provably-fair commitment published before betting opens (OD-6 draft: hash chain). */
export const CommitmentSchema = z.object({
  fv: integerIn(1, MAX_FAIRNESS_VERSION),
  chainIndex: CounterSchema,
  hash: Sha256HexSchema,
});

/** One creature, as the server spawned it. `id` is a server id, never the engine's. */
export const CreatureDtoSchema = z.object({
  id: CreatureIdSchema,
  kind: CreatureKindSchema,
  x: decimalIn(0, 1),
  worldY: WorldYSchema,
  size: decimalIn(0, MAX_CREATURE_SIZE),
  phase: decimalIn(0, MAX_CREATURE_PHASE),
  dir: z.union([z.literal(1), z.literal(-1)]),
});

export const CreatureListSchema = z.array(CreatureDtoSchema).max(MAX_CREATURES_PER_FRAME);

/** One public bet-feed entry: a public alias only (privacy, docs/09 §8.6). */
export const FeedEntrySchema = z.object({
  alias: z.string().regex(ALIAS),
  slot: SlotSchema,
  amountMinor: StakeMinorSchema,
  currency: CurrencyCodeSchema,
  cashoutMultiplier: MultiplierSchema.optional(),
});

/** The three chest multipliers, revealed together after the pick window. */
export const ChestValuesSchema = z.tuple([MultiplierSchema, MultiplierSchema, MultiplierSchema]);

/** Seeds revealed after the round (OD-6 draft: the round seed of the hash chain). */
export const RevealSchema = z.object({ serverSeed: Sha256HexSchema });

export const RoundBettingPayload = z.object({
  roundId: RoundIdSchema,
  roundNumber: RoundNumberSchema,
  commitment: CommitmentSchema,
  closesAtServerMs: ServerTimeMsSchema,
  bettingMs: DurationMsSchema,
});

export const RoundDivePayload = z.object({
  roundId: RoundIdSchema,
  startServerMs: ServerTimeMsSchema,
});

export const RoundWorldPayload = z.object({
  roundId: RoundIdSchema,
  fromTick: TickSchema,
  creatures: CreatureListSchema,
});

export const RoundSyncPayload = z.object({
  roundId: RoundIdSchema,
  tick: TickSchema,
  multiplier: MultiplierSchema,
  boost: BoostSchema,
  worldY: WorldYSchema,
});

export const RoundBoostPayload = z.object({
  roundId: RoundIdSchema,
  tick: TickSchema,
  creatureId: CreatureIdSchema,
});

export const RoundCrashedPayload = z.object({
  roundId: RoundIdSchema,
  tick: TickSchema,
  multiplier: MultiplierSchema,
});

export const RoundImpactPayload = z.object({
  roundId: RoundIdSchema,
  tick: TickSchema,
  jackpotMultiplier: MultiplierSchema,
});

export const RoundBonusPayload = z.object({
  roundId: RoundIdSchema,
  pickClosesAtServerMs: ServerTimeMsSchema,
  pickWindowMs: DurationMsSchema,
});

export const RoundChestsPayload = z.object({
  roundId: RoundIdSchema,
  chests: ChestValuesSchema,
});

export const RoundEndedPayload = z.discriminatedUnion("outcome", [
  z.object({
    roundId: RoundIdSchema,
    outcome: z.literal("crash"),
    terminalTick: TickSchema,
    crashMultiplier: MultiplierSchema,
    reveal: RevealSchema,
  }),
  z.object({
    roundId: RoundIdSchema,
    outcome: z.literal("jackpot"),
    terminalTick: TickSchema,
    jackpotMultiplier: MultiplierSchema,
    chests: ChestValuesSchema,
    reveal: RevealSchema,
  }),
]);

export const FeedBetsPayload = z.object({
  roundId: RoundIdSchema,
  entries: z.array(FeedEntrySchema).max(MAX_FEED_ENTRIES),
});

export const ServerNoticePayload = z.object({
  kind: z.enum(["drain", "maintenance"]),
  retryAfterMs: DurationMsSchema.optional(),
});

/** The public catalogue: type → payload schema and `re` rule (never: broadcasts answer no request). */
export const PUBLIC_SERVER_MESSAGES = {
  "round.betting": { payload: RoundBettingPayload, re: "forbidden" },
  "round.dive": { payload: RoundDivePayload, re: "forbidden" },
  "round.world": { payload: RoundWorldPayload, re: "forbidden" },
  "round.sync": { payload: RoundSyncPayload, re: "forbidden" },
  "round.boost": { payload: RoundBoostPayload, re: "forbidden" },
  "round.crashed": { payload: RoundCrashedPayload, re: "forbidden" },
  "round.impact": { payload: RoundImpactPayload, re: "forbidden" },
  "round.bonus": { payload: RoundBonusPayload, re: "forbidden" },
  "round.chests": { payload: RoundChestsPayload, re: "forbidden" },
  "round.ended": { payload: RoundEndedPayload, re: "forbidden" },
  "feed.bets": { payload: FeedBetsPayload, re: "forbidden" },
  "server.notice": { payload: ServerNoticePayload, re: "forbidden" },
} as const;

export type PublicServerMessageType = keyof typeof PUBLIC_SERVER_MESSAGES;

/** A decoded public message: the only kind the broadcast path accepts. */
export type PublicServerMessage = ServerMessageUnion<typeof PUBLIC_SERVER_MESSAGES>;

/** A public message as an encoder accepts it. */
export type PublicServerMessageInput = ServerMessageInputUnion<typeof PUBLIC_SERVER_MESSAGES>;
