// The server's view of the engine bundle's sealed runner (P8-4a). Types and constants only.
//
// server/engine/round-runner.ts is type-checked under the frontend's configuration (its type
// closure reaches the rendering layer), so the server cannot import its types. This file states
// the same contract by hand; it is never trusted on its own: engine-runtime.ts checks the loaded
// bundle's export surface and profile, and round-script.ts validates every runner result field by
// field before anything uses it. A compiled-runtime test checks both directions.

import type { RoundDerivation } from "../fairness";

/** The production bundle's complete export surface (owner decision K2), sorted. */
export const ENGINE_BUNDLE_EXPORTS = Object.freeze([
  "ROUND_RUNNER_PROFILE",
  "RoundRunnerError",
  "runSeededRound",
] as const);

/** The construction profile the server accepts (owner decision K12). */
export const EXPECTED_RUNNER_PROFILE = Object.freeze({
  id: "aquadive-offline-round-runner",
  version: 1,
  fv: 1,
  tickSeconds: 1 / 60,
  bettingTicks: 300,
  impactToBonusTicks: 84,
  maxTotalTicks: 2500,
  terminal: "first-crashed-or-bonus",
  snapshotSchemaVersion: 3,
});

export type RunnerProfile = typeof EXPECTED_RUNNER_PROFILE;

/** The runner's closed set of failure codes (round-runner.ts `RoundRunnerErrorCode`). */
export const RUNNER_ERROR_CODES: readonly string[] = Object.freeze([
  "derivation-unusable",
  "unsupported-fv",
  "draw-failed",
  "tick-mismatch",
  "tick-limit-exceeded",
  "unexpected-state",
  "unexpected-draws",
  "snapshot-mismatch",
  "runner-failed",
]);

/** The ten creature kinds of the engine (src/shared/creatures.ts `CreatureKind`). */
export const CREATURE_KINDS: readonly string[] = Object.freeze([
  "anglerfish",
  "fishSchool",
  "goldfish",
  "jellyfish",
  "kelp",
  "manta",
  "octopus",
  "seahorse",
  "sealion",
  "whale",
]);

export interface RunnerCreature {
  readonly id: number;
  readonly kind: string;
  readonly x: number;
  readonly worldY: number;
  readonly size: number;
  readonly phase: number;
  readonly dir: 1 | -1;
  readonly spawnTick: number;
  readonly consumedTick: number | null;
}

/** round-runner.ts `RoundRunnerOutput`. SECRET until the round's reveal. */
export interface RunnerOutput {
  readonly profile: string;
  readonly profileVersion: number;
  readonly fv: number;
  readonly chainIndex: number;
  readonly outcome: "crash" | "floor";
  readonly crashAt: number;
  readonly diveStartTick: number;
  readonly exitDiveTick: number;
  readonly impactTick: number | null;
  readonly terminalTick: number;
  readonly jackpot: number | null;
  readonly chests: readonly [number, number, number] | null;
  readonly samples: {
    readonly multiplier: readonly number[];
    readonly boost: readonly number[];
    readonly worldY: readonly number[];
  };
  readonly creatures: readonly RunnerCreature[];
  readonly final: {
    readonly worldY: number;
    readonly boost: number;
    readonly multiplier: number;
    readonly nextSpawnAt: number;
    readonly nextCreatureId: number;
  };
  readonly drawCounts: {
    readonly crash: number;
    readonly jackpot: number;
    readonly chests: number;
    readonly world: number;
  };
}

/** The bundle module as loaded (checked by engine-runtime.ts before use). */
export interface EngineBundleModule {
  readonly ROUND_RUNNER_PROFILE: unknown;
  readonly RoundRunnerError: new (...args: never[]) => Error & {
    readonly code: string;
    readonly reason: string | null;
  };
  readonly runSeededRound: (derivation: RoundDerivation) => unknown;
}
