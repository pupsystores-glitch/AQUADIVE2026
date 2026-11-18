// Money on the wire (P8-1; docs/09 §35.2 P1-D9).
//
// Every amount is an integer number of minor units, written as a canonical
// decimal string: digits only, no sign, no leading zero, no exponent, no
// whitespace, at most 18 digits, so every value fits PostgreSQL `BIGINT`.
// Amounts are converted with `bigint` only. A JSON number or a float is never
// money: JSON numbers lose integers above 2^53 and invite float arithmetic.
//
// Stakes are ≥ 1 minor unit; balances, payouts and totals may be 0. Every
// amount travels with a currency code. AQUADIVE is PLAY-MONEY ONLY (owner
// directive, 2026-11-18): a currency code such as `AQC` names a play-money
// unit and implies no real-money semantics. Currency exponents (how many
// minor units make a major unit, OD-15) are currency metadata outside v1.

import { z } from "zod";
import { MAX_MINOR_DIGITS } from "./limits";

const STAKE = new RegExp(`^[1-9][0-9]{0,${MAX_MINOR_DIGITS - 1}}$`);
const AMOUNT = new RegExp(`^(0|[1-9][0-9]{0,${MAX_MINOR_DIGITS - 1}})$`);
const CURRENCY = /^[A-Z][A-Z0-9]{2,7}$/;

/** The largest amount the format can carry: 10^18 − 1 minor units. */
export const MAX_MINOR = 10n ** BigInt(MAX_MINOR_DIGITS) - 1n;

/** A stake in minor units: ≥ 1. */
export const StakeMinorSchema = z.string().regex(STAKE).brand<"StakeMinor">();

/** A balance, payout or total in minor units: ≥ 0. */
export const AmountMinorSchema = z.string().regex(AMOUNT).brand<"AmountMinor">();

/** A currency code: an uppercase letter, then 2 – 7 uppercase letters or digits. */
export const CurrencyCodeSchema = z.string().regex(CURRENCY).brand<"CurrencyCode">();

export type StakeMinor = z.output<typeof StakeMinorSchema>;
export type AmountMinor = z.output<typeof AmountMinorSchema>;
export type CurrencyCode = z.output<typeof CurrencyCodeSchema>;

/** The exact amount a canonical minor-unit string denotes, or `null` for any other input. */
export function parseMinor(s: unknown): bigint | null {
  return typeof s === "string" && AMOUNT.test(s) ? BigInt(s) : null;
}

/** The canonical string of an amount in [0, MAX_MINOR], or `null` outside it. */
export function formatMinor(n: bigint): string | null {
  return typeof n === "bigint" && n >= 0n && n <= MAX_MINOR ? n.toString() : null;
}
