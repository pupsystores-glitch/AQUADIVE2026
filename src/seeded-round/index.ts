// Public surface of src/seeded-round (P8-3b — README.md, docs/09 §39).
//
// The binding layer between the fv fairness streams (`@/fairness`) and the engine's existing
// RoundAuthority / GameEngineDeps contracts (`@/engine`). It changes no engine code, probability,
// draw site or timing. fv = 1 stays INTERNAL AND EXPERIMENTAL. Nothing in the application or the
// server imports this module; production RoundScript construction is P8-4.

export { OUTCOME_DECISIONS, SeededRoundAuthority, type OutcomeDecision } from "./authority";
export { SeededRoundError, type SeededRoundErrorCode } from "./errors";
export type { RoundStatus } from "./lifecycle";
export { SeededRound, type SecretDrawCounts } from "./seeded-round";
