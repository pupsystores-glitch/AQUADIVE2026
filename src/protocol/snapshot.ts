// Wire snapshots (P8-1; docs/09 §12, §34.7, §34.8).
//
// `PublicSnapshotV1` is what any connection may see of the current round. It
// is built field by field from an allow-list (P8-5) and never from the
// engine's `EngineSnapshot`, which exposes `crashAt` (docs/09 §12.3). The
// phase decides which sections exist, so an undisclosed fact has no field to
// travel in:
//
// | phase     | betting | dive | world | crash | impact | bonus | bonus.chests |
// |-----------|---------|------|-------|-------|--------|-------|--------------|
// | betting   | yes     | —    | —     | —     | —      | —     | —            |
// | diving    | —       | yes  | opt.  | —     | —      | —     | —            |
// | crashed   | —       | opt. | opt.  | yes   | —      | —     | —            |
// | impact    | —       | opt. | opt.  | —     | yes    | —     | —            |
// | bonus     | —       | opt. | opt.  | —     | yes    | yes   | — (hidden)   |
// | reveal    | —       | opt. | opt.  | —     | yes    | yes   | yes          |
//
// No world data before the dive: disclosing the world at betting open is the
// rejected option W-C (docs/09 §16.7).
//
// `PlayerPrivateStateV1` is the owning player's own state (balance, own bets
// per slot, own pick, pending request ids). It travels only in session
// messages (`welcome`, `auth.ok`, `sync.snapshot`).
//
// The snapshot `v` is the wire snapshot schema version, independent of the
// protocol major and of the engine's `SNAPSHOT_SCHEMA_VERSION`.

import { z } from "zod";
import {
  BetIdSchema,
  ChestIdSchema,
  CounterSchema,
  integerIn,
  RequestIdSchema,
  RoundIdSchema,
  RoundNumberSchema,
  SlotSchema,
  TickSchema,
} from "./ids";
import { ServerTimeMsSchema } from "./envelope";
import { MAX_FEED_PLAYERS, MAX_PENDING_REQUEST_IDS, MAX_SNAPSHOT_FEED_ENTRIES } from "./limits";
import { AmountMinorSchema, CurrencyCodeSchema, StakeMinorSchema } from "./money";
import { MultiplierSchema } from "./multiplier";
import {
  BoostSchema,
  ChestValuesSchema,
  CommitmentSchema,
  CreatureListSchema,
  FeedEntrySchema,
  WorldYSchema,
} from "./messages/server-public";

export const SnapshotPhaseSchema = z.enum([
  "betting",
  "diving",
  "crashed",
  "impact",
  "bonus",
  "reveal",
]);
export type SnapshotPhase = z.output<typeof SnapshotPhaseSchema>;

type Section = "betting" | "dive" | "world" | "crash" | "impact" | "bonus";

/** Per phase: the sections that must be present and those that may be. */
const PHASE_SECTIONS: Record<SnapshotPhase, { required: Section[]; optional: Section[] }> = {
  betting: { required: ["betting"], optional: [] },
  diving: { required: ["dive"], optional: ["world"] },
  crashed: { required: ["crash"], optional: ["dive", "world"] },
  impact: { required: ["impact"], optional: ["dive", "world"] },
  bonus: { required: ["impact", "bonus"], optional: ["dive", "world"] },
  reveal: { required: ["impact", "bonus"], optional: ["dive", "world"] },
};

const SECTIONS: readonly Section[] = ["betting", "dive", "world", "crash", "impact", "bonus"];

export const PublicSnapshotSchema = z
  .object({
    schema: z.literal("public-snapshot"),
    v: z.literal(1),
    roundId: RoundIdSchema,
    roundNumber: RoundNumberSchema,
    phase: SnapshotPhaseSchema,
    commitment: CommitmentSchema,
    betting: z.object({ closesAtServerMs: ServerTimeMsSchema }).optional(),
    dive: z
      .object({
        startServerMs: ServerTimeMsSchema,
        tick: TickSchema,
        multiplier: MultiplierSchema,
        boost: BoostSchema,
        worldY: WorldYSchema,
      })
      .optional(),
    world: z.object({ fromTick: TickSchema, creatures: CreatureListSchema }).optional(),
    crash: z.object({ tick: TickSchema, multiplier: MultiplierSchema }).optional(),
    impact: z.object({ tick: TickSchema, jackpotMultiplier: MultiplierSchema }).optional(),
    bonus: z
      .object({ pickClosesAtServerMs: ServerTimeMsSchema, chests: ChestValuesSchema.optional() })
      .optional(),
    feed: z.object({
      players: integerIn(0, MAX_FEED_PLAYERS),
      totalStakeMinor: AmountMinorSchema,
      currency: CurrencyCodeSchema,
      recent: z.array(FeedEntrySchema).max(MAX_SNAPSHOT_FEED_ENTRIES),
    }),
    serverTimeMs: ServerTimeMsSchema,
  })
  .superRefine((s, ctx) => {
    const rule = PHASE_SECTIONS[s.phase];
    for (const section of SECTIONS) {
      const present = s[section] !== undefined;
      if (rule.required.includes(section) && !present) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [section],
          message: "missing for phase",
        });
      } else if (present && !rule.required.includes(section) && !rule.optional.includes(section)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [section],
          message: "not allowed in phase",
        });
      }
    }
    const chestsShown = s.bonus?.chests !== undefined;
    if (chestsShown !== (s.phase === "reveal")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bonus", "chests"],
        message: "chest values only after the pick window",
      });
    }
  });

export type PublicSnapshotV1 = z.output<typeof PublicSnapshotSchema>;

const betBase = { slot: SlotSchema, betId: BetIdSchema, amountMinor: StakeMinorSchema };

/** One own bet, by settlement state (docs/09 §18.1 FI-3). */
export const PrivateBetSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("open"), ...betBase }),
  z.object({
    state: z.literal("cashedOut"),
    ...betBase,
    tick: TickSchema,
    multiplier: MultiplierSchema,
    payoutMinor: AmountMinorSchema,
  }),
  z.object({ state: z.literal("lost"), ...betBase }),
  z.object({
    state: z.literal("jackpotPending"),
    ...betBase,
    jackpotMultiplier: MultiplierSchema,
    bonusEligible: z.literal(true),
  }),
  z.object({
    state: z.literal("jackpotSettled"),
    ...betBase,
    finalMultiplier: MultiplierSchema,
    payoutMinor: AmountMinorSchema,
  }),
  z.object({ state: z.literal("voided"), ...betBase }),
]);

export const PlayerPrivateStateSchema = z.object({
  currency: CurrencyCodeSchema,
  balanceMinor: AmountMinorSchema,
  ledgerSeq: CounterSchema,
  round: z
    .object({
      roundId: RoundIdSchema,
      bets: z
        .array(PrivateBetSchema)
        .max(2)
        .refine((bets) => new Set(bets.map((b) => b.slot)).size === bets.length, "duplicate slot"),
      pick: ChestIdSchema.optional(),
    })
    .optional(),
  pendingRequestIds: z.array(RequestIdSchema).max(MAX_PENDING_REQUEST_IDS),
});

export type PlayerPrivateStateV1 = z.output<typeof PlayerPrivateStateSchema>;
