// The global round timeline of the offline scheduler (P8-4b-2; owner decision SD-3). PLAY MONEY
// ONLY; OFFLINE DEVELOPMENT ONLY. Pure constants and arithmetic; no secret, no clock.
//
// Durations are the engine's existing values (src/engine/domain/tuning.ts), quantized exactly as
// the engine does (state-machine.ts `ticksFor = Math.round(ms / 1000 / TICK_SECONDS)`); a test
// recomputes each from the engine source. Changing any of them is an owner decision.
//
//   betting             300 ticks  (BETTING_WINDOW_SECONDS = 5)
//   impact → bonus       84 ticks  (SHIP_IMPACT_TO_CHESTS_MS = 1400)
//   crash banner        144 ticks  (CRASH_BANNER_MS = 2400)
//   bonus pick window   360 ticks  (BONUS_PICK_WINDOW_MS = 6000; global on the server, §15.3)
//   chest result        132 ticks  (CHEST_RESULT_TO_IDLE_MS = 2200)
//   inter-round gap       0 ticks  (round n's end tick is round n + 1's opening tick)
//
// Round-relative tick r (r = 0 is the opening tick, betting) follows the RoundScript's own tick
// numbering (the runner's tick r is the engine state after r steps):
//
//   0 ≤ r < 300                    betting (closes at r = 300)
//   300 ≤ r < exit                 diving (r = 300: the dive starts; sample r − 300)
//   crash:  r = exit               crashed (crash point disclosed), until exit + 144 = end
//   floor:  r = exit               impact (jackpot disclosed); r = exit + 84 = terminal: bonus
//           r = terminal + 360     the pick window closes, the three chests are disclosed
//           r = terminal + 492     end
//
// so a crash round lasts exit + 144 ticks and a floor round exit + 576 (= terminal + 492).
// Goldfish consumptions are disclosed at their own tick (301 ≤ r ≤ exit).

import { ANALYTIC_MAX_DIVE_TICKS } from "../round/round-script";
import { EXPECTED_RUNNER_PROFILE } from "../round/engine-types";

/** The engine's own whole-tick quantization (state-machine.ts `ticksFor`). */
const ticksFor = (ms: number): number =>
  Math.round(ms / 1000 / EXPECTED_RUNNER_PROFILE.tickSeconds);

export const BETTING_TICKS = ticksFor(5 * 1000);
export const IMPACT_TO_BONUS_TICKS = ticksFor(1400);
export const CRASH_BANNER_TICKS = ticksFor(2400);
export const BONUS_PICK_TICKS = ticksFor(6000);
export const CHEST_RESULT_TICKS = ticksFor(2200);
export const INTER_ROUND_GAP_TICKS = 0;

/**
 * The look-ahead deadline (SD-4, SD-5): round n + 1's script must be HELD (delivered and fully
 * verified) strictly before global tick S_n + ADMISSION_DEADLINE_TICKS, where S_n is round n's
 * opening tick; round 1's deadline is tick ADMISSION_DEADLINE_TICKS after the scheduler start, and
 * round 1 opens at that tick. It lies inside round n's fixed betting window, so it never depends
 * on any outcome (round n's own end does: using it would make a miss depend on round n's secret
 * dive length). Fixed; not an option.
 */
export const ADMISSION_DEADLINE_TICKS = 240;

export const MIN_DIVE_TICKS = 1;
export const MAX_DIVE_TICKS = ANALYTIC_MAX_DIVE_TICKS;
/** Shortest round: a 1-tick dive (a 1.00× crash) + the crash banner. */
export const MIN_ROUND_TICKS = BETTING_TICKS + MIN_DIVE_TICKS + CRASH_BANNER_TICKS;
/** Longest round: the longest floor dive + impact → bonus + pick window + chest result. */
export const MAX_ROUND_TICKS =
  BETTING_TICKS + MAX_DIVE_TICKS + IMPACT_TO_BONUS_TICKS + BONUS_PICK_TICKS + CHEST_RESULT_TICKS;

/** Public phases of a round. */
export type RoundPhase = "betting" | "diving" | "crashed" | "impact" | "bonus" | "chests";

/** Round-relative end tick of a round: its exit tick and outcome determine it (SECRET input). */
export function roundEndTick(outcome: "crash" | "floor", exitDiveTick: number): number {
  return outcome === "crash"
    ? exitDiveTick + CRASH_BANNER_TICKS
    : exitDiveTick + IMPACT_TO_BONUS_TICKS + BONUS_PICK_TICKS + CHEST_RESULT_TICKS;
}

// The deadline lies inside the fixed betting window and before the shortest possible next round.
if (!(ADMISSION_DEADLINE_TICKS > 0 && ADMISSION_DEADLINE_TICKS <= BETTING_TICKS)) {
  throw new Error("scheduler timeline: invalid admission deadline");
}

// R-1: no constant of the timeline can be replaced once this module has loaded (the compiled
// build's CommonJS exports object; an ES module namespace, as under Vitest, is immutable already).
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
