// Bet-input store — the betting panel's amount field (docs/07_UI_ARCHITECTURE.md
// §9, §13.3). Sprint 4, Commit U5 (delta V4).
//
// Session-owned (src/ui/session.ts), so the typed amount survives a React
// remount and StrictMode's double-mount like every other session store.
// Framework-free: no React import, ever (§9). Independent: it subscribes to
// no other store and to no engine event. The one outside value it needs —
// the balance that caps `double` — is passed in by the caller at the moment
// of the click, exactly as the shell read it.
//
// Arithmetic moved verbatim from the shell's handlers:
//   halve      Math.max(1, +(b / 2).toFixed(2))
//   double     Math.min(balance, +(b * 2).toFixed(2))
//   quick-set  the QUICK_BETS value as is
//   typed      Math.max(0, +raw)
// No new rounding (D11): a typed 0.123 stays 0.123 in the field. Since M1
// (M1-D1; D11 superseded in part, docs/07 §23.3) such a value is editable
// but not submittable — PLACE BET and the submit edge both reject it.
//
// Sanitation (V4, D1–D3), applied to every write: a non-finite number
// (NaN, Infinity, -Infinity) becomes 0, and the existing negative clamp is
// kept. So the snapshot is always a finite number ≥ 0. A cleared field
// (`+""` → 0) still shows 0, as before U5: the pre-U5 docs claimed an empty
// field produced NaN, which was wrong — only non-finite numeric input
// (e.g. a value that overflows to Infinity) could reach the field
// unsanitized.
//
// This store holds the *input*, never the round's bet: the settlement basis
// locks in the wallet from the accepted `betPlaced` amount (§10) and is
// never read from here.

import { createStore, type ReadableStore } from "./store";

/** Finite and ≥ 0: non-finite → 0; the pre-U5 negative clamp (Math.max(0, …)) preserved. */
export const sanitizeBetAmount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

/** The amount field's raw string → a sanitized bet. `+""` is 0, as before U5 (D1). */
export const parseBetInput = (raw: string): number => sanitizeBetAmount(+raw);

export interface BetInputStore extends ReadableStore<number> {
  /** Quick-set (a QUICK_BETS value). */
  set(amount: number): void;
  /** The amount field's onChange value. */
  input(raw: string): void;
  /** The − stepper: half, two decimals, floor of 1. */
  halve(): void;
  /** The + stepper: double, two decimals, capped at the caller's current balance. */
  double(balance: number): void;
}

/** Create the bet input, starting at `initial` (the session passes DEFAULT_BET). */
export function createBetInputStore(initial: number): BetInputStore {
  const store = createStore<number>(sanitizeBetAmount(initial));
  // Every write goes through the sanitizer; createStore's Object.is bailout
  // keeps a write of the same value quiet.
  const write = (amount: number) => store.set(sanitizeBetAmount(amount));
  return {
    get: store.get,
    subscribe: store.subscribe,
    set: write,
    input: (raw) => write(parseBetInput(raw)),
    halve: () => write(Math.max(1, +(store.get() / 2).toFixed(2))),
    double: (balance) => write(Math.min(balance, +(store.get() * 2).toFixed(2))),
  };
}
