// Public snapshot phase rules and private state (P8-1; docs/09 §12, §34.7, §34.8).
import { describe, expect, it } from "vitest";
import { PlayerPrivateStateSchema, PublicSnapshotSchema, type SnapshotPhase } from "./snapshot";

const ROUND = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";
const BET0 = "0193f6a2-7c1e-7b20-9c3d-5e6f70819203";
const BET1 = "0193f6a2-7c1e-7c30-ad4e-6f7081920314";
const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const base = {
  schema: "public-snapshot",
  v: 1,
  roundId: ROUND,
  roundNumber: "18446",
  commitment: { fv: 1, chainIndex: "9999812", hash: HASH },
  feed: { players: 0, totalStakeMinor: "0", currency: "AQC", recent: [] },
  serverTimeMs: "1731940000123",
};
const betting = { closesAtServerMs: "1731940005123" };
const dive = { startServerMs: "1", tick: 433, multiplier: "1.8461", boost: "0", worldY: "1532.25" };
const world = { fromTick: 433, creatures: [] };
const crash = { tick: 913, multiplier: "3.64" };
const impact = { tick: 1206, jackpotMultiplier: "142.18" };
const bonusOpen = { pickClosesAtServerMs: "1731940032000" };
const bonusRevealed = { ...bonusOpen, chests: ["2.31", "7.04", "1.12"] };

const snap = (phase: SnapshotPhase, sections: Record<string, unknown>) => ({
  ...base,
  phase,
  ...sections,
});
const valid = (s: unknown) => PublicSnapshotSchema.safeParse(s).success;

describe("public snapshot: sections by phase", () => {
  it.each([
    ["betting", { betting }],
    ["diving", { dive }],
    ["diving", { dive, world }],
    ["crashed", { crash }],
    ["crashed", { dive, world, crash }],
    ["impact", { impact }],
    ["bonus", { impact, bonus: bonusOpen }],
    ["reveal", { impact, bonus: bonusRevealed }],
  ] as const)("accepts %s with its sections", (phase, sections) => {
    expect(valid(snap(phase, sections))).toBe(true);
  });

  it.each([
    ["betting without betting", "betting", {}],
    ["world during betting (W-C, rejected)", "betting", { betting, world }],
    ["dive during betting", "betting", { betting, dive }],
    ["diving without dive", "diving", { world }],
    ["crash during the dive", "diving", { dive, crash }],
    ["impact during the dive", "diving", { dive, impact }],
    ["crashed without crash", "crashed", { dive }],
    ["crash and impact together", "crashed", { crash, impact }],
    ["bonus without impact", "bonus", { bonus: bonusOpen }],
    ["chest values while the window is open", "bonus", { impact, bonus: bonusRevealed }],
    ["reveal without chest values", "reveal", { impact, bonus: bonusOpen }],
    ["betting section after the dive", "impact", { impact, betting }],
  ] as const)("rejects %s", (_name, phase, sections) => {
    expect(valid(snap(phase, sections))).toBe(false);
  });

  it("rejects an engine snapshot and an unknown phase", () => {
    expect(valid({ ...snap("betting", { betting }), schema: "engine" })).toBe(false);
    expect(valid(snap("ended" as SnapshotPhase, {}))).toBe(false);
  });

  it("strips fields outside the allow-list (crashAt never survives a parse)", () => {
    const parsed = PublicSnapshotSchema.parse({
      ...snap("diving", { dive }),
      crashAt: 7.1,
      terminalTick: 1200,
    });
    expect(parsed).not.toHaveProperty("crashAt");
    expect(parsed).not.toHaveProperty("terminalTick");
  });
});

describe("player private state", () => {
  const player = {
    currency: "AQC",
    balanceMinor: "100028",
    ledgerSeq: "41",
    round: {
      roundId: ROUND,
      bets: [
        { state: "open", slot: 0, betId: BET0, amountMinor: "500" },
        {
          state: "cashedOut",
          slot: 1,
          betId: BET1,
          amountMinor: "200",
          tick: 912,
          multiplier: "3.6411",
          payoutMinor: "728",
        },
      ],
    },
    pendingRequestIds: [],
  };

  it("accepts own bets by state", () => {
    expect(PlayerPrivateStateSchema.safeParse(player).success).toBe(true);
    for (const bet of [
      { state: "lost", slot: 0, betId: BET0, amountMinor: "500" },
      { state: "voided", slot: 0, betId: BET0, amountMinor: "500" },
      {
        state: "jackpotPending",
        slot: 0,
        betId: BET0,
        amountMinor: "500",
        jackpotMultiplier: "142.18",
        bonusEligible: true,
      },
      {
        state: "jackpotSettled",
        slot: 0,
        betId: BET0,
        amountMinor: "500",
        finalMultiplier: "159.24",
        payoutMinor: "79620",
      },
    ]) {
      expect(
        PlayerPrivateStateSchema.safeParse({ ...player, round: { roundId: ROUND, bets: [bet] } })
          .success,
      ).toBe(true);
    }
  });

  it("rejects two bets on one slot, a third bet, and a cashout without its fields", () => {
    const open0 = { state: "open", slot: 0, betId: BET0, amountMinor: "500" };
    const reject = (bets: unknown[]) =>
      PlayerPrivateStateSchema.safeParse({ ...player, round: { roundId: ROUND, bets } }).success;
    expect(reject([open0, open0])).toBe(false);
    expect(reject([open0, { ...open0, slot: 1 }, { ...open0, slot: 1 }])).toBe(false);
    expect(reject([{ state: "cashedOut", slot: 0, betId: BET0, amountMinor: "500" }])).toBe(false);
  });

  it("rejects too many pending request ids", () => {
    const ids = Array.from({ length: 9 }, () => "0193f6a2-8000-7000-a000-000000000001");
    expect(PlayerPrivateStateSchema.safeParse({ ...player, pendingRequestIds: ids }).success).toBe(
      false,
    );
  });
});
