// Multipliers and other decimals on the wire (P8-1; docs/09 §35.2 P1-D10).
//
// A wire decimal is the canonical string of an IEEE-754 double: the shortest
// decimal that round-trips, exactly what ECMAScript's `String(x)` prints. A
// string is canonical iff `String(Number(s)) === s`. That one test rejects
// signs on zero, leading zeros, trailing fractional zeros ("1.50"), "+",
// whitespace, hex and non-canonical exponents; finiteness and the range are
// checked separately ("NaN" and "Infinity" round-trip but are not finite).
//
// Multipliers additionally have no exponent and are ≥ 1. A double ≥ 1 prints
// without an exponent below 10^21, so every reachable multiplier qualifies
// (today's maximum is 25,000). The protocol encodes no economic cap.
//
// Settlement multipliers are the server's double written this way: the same
// decimal `src/ui/store/payout.ts` reads with `String(m)`, so a client can
// check `payoutMinor = ⌊stakeMinor × m̄⌋` (m̄ = the decimal the string
// denotes) with `multiplierDecimal`. This is the format only: which value is
// paid and how it is rounded (P-A / P-B / P-C) is OD-7 and is not decided
// here. Two-decimal values such as jackpot and chest multipliers are valid
// as they are ("142.18"; "2.3", never "2.30").
//
// Floating point: `Number(s)` and `String(x)` are exact inverses on canonical
// strings in every conforming engine; no arithmetic happens here. Values
// derived from `Math.exp` / `Math.pow` may differ across engines in the last
// bit (docs/09 §16.9, OD-18); the wire carries the server's value, so clients
// never recompute a settlement value.
//
// Presentation decimals (boost, world depth, creature attributes) use the
// same canonical rule within a stated range. They may carry an exponent where
// `String` prints one: boost decays towards 0 and can be a residue such as
// "5.551115123125783e-17".

import { z } from "zod";
import { MAX_DECIMAL_LENGTH, MAX_MULTIPLIER_LENGTH } from "./limits";

/** True iff `s` is the canonical string of a finite double in [min, max]. */
function isCanonicalDecimal(s: string, maxLength: number, min: number, max: number): boolean {
  if (s.length === 0 || s.length > maxLength) return false;
  const x = Number(s);
  return Number.isFinite(x) && String(x) === s && x >= min && x <= max;
}

/** True iff `s` is a canonical multiplier: no exponent, finite, ≥ 1. */
export function isCanonicalMultiplier(s: unknown): s is string {
  return (
    typeof s === "string" &&
    !s.includes("e") &&
    isCanonicalDecimal(s, MAX_MULTIPLIER_LENGTH, 1, Number.MAX_VALUE)
  );
}

export const MultiplierSchema = z
  .string()
  .refine(isCanonicalMultiplier, "not a canonical multiplier")
  .brand<"Multiplier">();

export type Multiplier = z.output<typeof MultiplierSchema>;

/** The wire string of a multiplier double, or `null` if it is not finite, < 1 or would need an exponent. */
export function formatMultiplier(m: number): string | null {
  if (typeof m !== "number") return null;
  const s = String(m);
  return isCanonicalMultiplier(s) ? s : null;
}

/** The double a canonical multiplier string denotes, or `null` for any other input. */
export function parseMultiplier(s: unknown): number | null {
  return isCanonicalMultiplier(s) ? Number(s) : null;
}

/** An exact decimal: value = coefficient · 10^exponent. */
export interface ExactDecimal {
  readonly coefficient: bigint;
  readonly exponent: number;
}

/** The exact decimal a canonical multiplier string denotes, or `null` for any other input. */
export function multiplierDecimal(s: unknown): ExactDecimal | null {
  if (!isCanonicalMultiplier(s)) return null;
  const dot = s.indexOf(".");
  if (dot < 0) return { coefficient: BigInt(s), exponent: 0 };
  const fraction = s.slice(dot + 1);
  return { coefficient: BigInt(s.slice(0, dot) + fraction), exponent: -fraction.length };
}

/** A canonical presentation decimal in [min, max] (exponent allowed where `String` prints one). */
export const decimalIn = (min: number, max: number) =>
  z
    .string()
    .refine((s) => isCanonicalDecimal(s, MAX_DECIMAL_LENGTH, min, max), "not a canonical decimal");

/** The wire string of a presentation double, or `null` if it is not finite or outside [min, max]. */
export function formatDecimal(x: number, min: number, max: number): string | null {
  if (typeof x !== "number") return null;
  const s = String(x);
  return isCanonicalDecimal(s, MAX_DECIMAL_LENGTH, min, max) ? s : null;
}
