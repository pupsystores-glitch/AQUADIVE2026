// Action-state derivation tests (Sprint 4, Commit U5; docs/07_UI_ARCHITECTURE.md
// §13.3, §21 tier 2). Node env, no React.
//
// The oracle below is the pre-U5 JSX decision, transcribed verbatim from
// AbyssAnchor.tsx (the inline canBet expression and the five-branch
// conditional, including the fallthrough button's `disabled` expression and
// its idle/WAITING label). actionStateFor must agree with it on the full
// cross product: every phase × participating × hasCashed × countdown edge ×
// bet edge × balance — including combinations the engine never produces,
// so the equivalence does not rest on engine invariants.
import { describe, expect, it } from "vitest";
import { BET_CUTOFF_SECONDS } from "@/game/config";
import type { RoundState } from "@/ui/store/round-store";
import {
  actionStateFor,
  canPlaceBet,
  type ActionKind,
  type ActionRoundInput,
  type ActionState,
  type ActionWalletInput,
} from "./action-state";

type Phase = RoundState["phase"];
const PHASES: readonly Phase[] = ["idle", "diving", "cashed", "crashed", "bonus"];

/** What the button renders: which branch, and whether it is disabled. */
interface Rendered {
  branch: ActionKind;
  disabled: boolean;
}

/** The pre-U5 JSX, verbatim in its logic. */
function oracle(
  phase: Phase,
  countdown: number,
  participating: boolean,
  hasCashed: boolean,
  bet: number,
  balance: number,
): Rendered {
  const inDive = phase === "diving";
  const isIdle = phase === "idle";
  const showCrash = phase === "crashed";
  const showBonus = phase === "bonus";
  const canBet = isIdle && !participating && bet > 0 && bet <= balance && countdown > 0.2;
  if (inDive && participating && !hasCashed) return { branch: "cashOut", disabled: false };
  if (inDive && participating && hasCashed) return { branch: "secured", disabled: true };
  if (inDive && !participating) return { branch: "spectating", disabled: true };
  if (isIdle && participating) return { branch: "betLocked", disabled: true };
  return { branch: isIdle ? "placeBet" : "waiting", disabled: !canBet || showBonus || showCrash };
}

/** How the component renders an ActionState (the JSX mapping in AbyssAnchor.tsx). */
const render = (s: ActionState): Rendered => ({
  branch: s.kind,
  disabled: s.kind === "placeBet" ? !s.enabled : s.kind !== "cashOut",
});

const COUNTDOWNS = [5, 4.2, 1, 0.25, 0.21, 0.2000001, 0.2, 0.19999, 0.1, 1 / 60, 0, -0.1];
const BETS = [
  0,
  -1,
  0.01,
  0.1,
  1,
  5,
  25,
  100,
  999.99,
  1000,
  1000.01,
  7490,
  1e9,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];
const BALANCES = [0, 0.01, 5, 999.99, 1000, 7490];
const BOOLS = [false, true];

describe("actionStateFor — exhaustive equivalence with the pre-U5 JSX matrix", () => {
  it("agrees with the oracle on every combination", () => {
    let combos = 0;
    const kinds = new Set<ActionKind>();
    for (const phase of PHASES)
      for (const participating of BOOLS)
        for (const hasCashed of BOOLS)
          for (const countdownSeconds of COUNTDOWNS)
            for (const bet of BETS)
              for (const balance of BALANCES) {
                const state = actionStateFor(
                  { phase, countdownSeconds },
                  { balance, participating, hasCashed },
                  bet,
                );
                const expected = oracle(
                  phase,
                  countdownSeconds,
                  participating,
                  hasCashed,
                  bet,
                  balance,
                );
                const got = render(state);
                if (got.branch !== expected.branch || got.disabled !== expected.disabled) {
                  throw new Error(
                    `mismatch at ${JSON.stringify({ phase, participating, hasCashed, countdownSeconds, bet, balance })}: ` +
                      `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`,
                  );
                }
                kinds.add(state.kind);
                combos++;
              }
    expect(combos).toBe(PHASES.length * 4 * COUNTDOWNS.length * BETS.length * BALANCES.length);
    // Every one of the six states is reachable.
    expect([...kinds].sort()).toEqual(
      ["betLocked", "cashOut", "placeBet", "secured", "spectating", "waiting"].sort(),
    );
  });
});

describe("actionStateFor — the branches, one by one", () => {
  const round = (phase: Phase, countdownSeconds = 3): ActionRoundInput => ({
    phase,
    countdownSeconds,
  });
  const wallet = (
    participating: boolean,
    hasCashed = false,
    balance = 1000,
  ): ActionWalletInput => ({ balance, participating, hasCashed });

  it("diving + participating + not settled → cashOut", () => {
    expect(actionStateFor(round("diving"), wallet(true, false), 5)).toEqual({ kind: "cashOut" });
  });

  it("diving + participating + settled → secured", () => {
    expect(actionStateFor(round("diving"), wallet(true, true), 5)).toEqual({ kind: "secured" });
  });

  it("diving + spectator → spectating, whatever the bet or settlement flags", () => {
    expect(actionStateFor(round("diving"), wallet(false), 5)).toEqual({ kind: "spectating" });
    expect(actionStateFor(round("diving"), wallet(false, true), 0)).toEqual({ kind: "spectating" });
  });

  it("idle + participating → betLocked, even past the cutoff", () => {
    expect(actionStateFor(round("idle"), wallet(true), 5)).toEqual({ kind: "betLocked" });
    expect(actionStateFor(round("idle", 0.1), wallet(true), 5)).toEqual({ kind: "betLocked" });
  });

  it("idle + not participating → placeBet, enabled only when canPlaceBet", () => {
    expect(actionStateFor(round("idle"), wallet(false), 5)).toEqual({
      kind: "placeBet",
      enabled: true,
    });
    expect(actionStateFor(round("idle"), wallet(false), 0)).toEqual({
      kind: "placeBet",
      enabled: false,
    });
    expect(actionStateFor(round("idle"), wallet(false, false, 4.99), 5)).toEqual({
      kind: "placeBet",
      enabled: false,
    });
  });

  it("D10: cashed (impact), crashed and bonus → waiting, for participants and spectators alike", () => {
    for (const phase of ["cashed", "crashed", "bonus"] as const) {
      for (const p of BOOLS) {
        for (const c of BOOLS) {
          expect(actionStateFor(round(phase), wallet(p, c), 5), `${phase} ${p} ${c}`).toEqual({
            kind: "waiting",
          });
        }
      }
    }
  });
});

describe("canPlaceBet — the old inline canBet, with the named cutoff and the wallet's predicate", () => {
  const idle = (countdownSeconds: number): ActionRoundInput => ({
    phase: "idle",
    countdownSeconds,
  });
  const spectator: ActionWalletInput = { balance: 1000, participating: false, hasCashed: false };

  it("the cutoff is strict: countdown must be > BET_CUTOFF_SECONDS (0.2)", () => {
    expect(BET_CUTOFF_SECONDS).toBe(0.2);
    expect(canPlaceBet(idle(0.2000001), spectator, 5)).toBe(true);
    expect(canPlaceBet(idle(BET_CUTOFF_SECONDS), spectator, 5)).toBe(false);
    expect(canPlaceBet(idle(0.19999), spectator, 5)).toBe(false);
  });

  it("affordability: (0, balance] — a bet equal to the balance is affordable", () => {
    expect(canPlaceBet(idle(3), spectator, 1000)).toBe(true);
    expect(canPlaceBet(idle(3), spectator, 1000.01)).toBe(false);
    expect(canPlaceBet(idle(3), spectator, 0)).toBe(false);
  });

  it("non-finite bets are never placeable (unchanged: they never were)", () => {
    for (const bet of [Number.NaN, Infinity, -Infinity]) {
      expect(canPlaceBet(idle(3), spectator, bet)).toBe(false);
    }
  });

  it("only in the betting window and only before participating", () => {
    for (const phase of ["diving", "cashed", "crashed", "bonus"] as const) {
      expect(canPlaceBet({ phase, countdownSeconds: 3 }, spectator, 5)).toBe(false);
    }
    expect(canPlaceBet(idle(3), { ...spectator, participating: true }, 5)).toBe(false);
  });
});

describe("canPlaceBet — M1 stake validity (M1-D1 to M1-D3, docs/07 §23.5)", () => {
  const idle: ActionRoundInput = { phase: "idle", countdownSeconds: 3 };
  const spectator: ActionWalletInput = { balance: 1000, participating: false, hasCashed: false };

  it("sub-cent, fractional-cent and non-canonical bets are never offered, though affordable", () => {
    for (const bet of [0.001, 0.004, 0.005, 0.009, 1.005, 0.123, 0.1 + 0.2, 1000.0000000000001]) {
      expect(canPlaceBet(idle, spectator, bet), String(bet)).toBe(false);
    }
  });

  it("whole-cent bets keep the U5 behaviour — the oracle's canBet, unchanged", () => {
    for (const bet of [0.01, 0.07, 0.29, 0.57, 1.15, 4.35, 8.2, 999.99, 1000]) {
      expect(canPlaceBet(idle, spectator, bet), String(bet)).toBe(true);
    }
    expect(canPlaceBet(idle, { ...spectator, balance: 0.01 }, 0.01)).toBe(true);
    expect(canPlaceBet(idle, { ...spectator, balance: 0.01 }, 0.02)).toBe(false);
  });

  it("over the full cross product with sub-cent bets added: enabled ⇔ oracle ∧ valid stake", () => {
    const valid = (b: number) => Number.isFinite(b) && b >= 0.01 && +b.toFixed(2) === b;
    for (const phase of PHASES)
      for (const countdownSeconds of COUNTDOWNS)
        for (const bet of [...BETS, 0.001, 0.005, 0.009, 1.005, 0.123])
          for (const balance of BALANCES) {
            const s = actionStateFor(
              { phase, countdownSeconds },
              { balance, participating: false, hasCashed: false },
              bet,
            );
            const o = oracle(phase, countdownSeconds, false, false, bet, balance);
            const expectedDisabled = o.disabled || (o.branch === "placeBet" && !valid(bet));
            expect(render(s)).toEqual({ branch: o.branch, disabled: expectedDisabled });
          }
  });
});

describe("actionStateFor — purity", () => {
  it("reads frozen plain inputs without mutating them and is deterministic", () => {
    const r = Object.freeze({ phase: "idle" as const, countdownSeconds: 3 });
    const w = Object.freeze({ balance: 1000, participating: false, hasCashed: false });
    const a = actionStateFor(r, w, 5);
    const b = actionStateFor(r, w, 5);
    expect(a).toEqual(b);
    expect(r).toEqual({ phase: "idle", countdownSeconds: 3 });
    expect(w).toEqual({ balance: 1000, participating: false, hasCashed: false });
  });

  it("accepts full store snapshots (extra fields are ignored)", () => {
    const snapshot = {
      phase: "diving" as const,
      roundId: 3,
      countdownSeconds: 0,
      multiplier: 1.5,
      boost: 0,
      participants: [null, null],
      chests: null,
      chosenChestId: null,
    } satisfies RoundState;
    expect(
      actionStateFor(snapshot, { balance: 1, participating: true, hasCashed: false }, 0),
    ).toEqual({ kind: "cashOut" });
  });
});
