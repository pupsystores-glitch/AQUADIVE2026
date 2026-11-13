// Stake validity — the M1 bet-validity contract (docs/07_UI_ARCHITECTURE.md
// §23.4; owner policy M1-D1, M1-D2, M1-D3; engine enforcement E-X2).
//
// A valid stake is a finite number that is the canonical double of k / 100
// for some integer k ≥ 1: a positive whole number of cents. Invalid amounts
// are rejected, never rounded into valid ones.
//
// `+a.toFixed(2) === a` is exact, with no tolerance: `toFixed(2)` works on
// the exact binary value and `+` parses the decimal back to the nearest
// double, so the round trip returns `a` iff `a` already is the nearest double
// to a two-decimal value. Validity looks at the number, never the text:
// 1.000, 0.010 and 1e-2 are valid; 0.1 + 0.2 is not.
//
// Representability (§23.11, Q1 OPEN): the predicate decides M1-D1 exactly
// below 2^46 currency units. No technical ceiling is applied here — none is
// approved (M1-D2, M1-D10). On the UI path affordability bounds every stake
// by the balance.
//
// Home: `src/shared` — the dependency floor imported by both `src/engine`
// (§4: the engine imports `src/shared`) and `src/ui` (§6). One predicate,
// one import, satisfying K4.

/** The minimum accepted bet, 0.01 (M1-D2). */
export const MIN_STAKE = 0.01;

/** M1-D1/D2: finite, ≥ 0.01, and a canonical whole-cent value. */
export const isValidStake = (amount: unknown): amount is number =>
  typeof amount === "number" &&
  Number.isFinite(amount) &&
  amount >= MIN_STAKE &&
  +amount.toFixed(2) === amount;
