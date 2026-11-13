// Payout calculation — the M1 settlement rounding rule
// (docs/07_UI_ARCHITECTURE.md §23.13, §23.16; owner policy M1-D8, M1-D13).
//
// One function for every settlement path (cashout, jackpot, chest total) and
// for the display-only potential win, so the UI never promises more than the
// wallet credits:
//
//   payoutCents = ⌊100 · s̄ · m̄⌋
//
// where s̄ and m̄ are the decimals the numbers denote — their shortest
// round-trip strings, String(x) (meaning 1, §23.16) — and the product is
// computed exactly in BigInt. Truncating BigInt division equals rounding
// down for nonnegative operands. The binary float product is never used as a
// monetary value: `Math.floor(s * m * 100)` loses a cent (0.29 × 1 → 0.28),
// and `+(s * m).toFixed(2)` rounds to nearest (V2).
//
// Preconditions (W7, M1-D14): the stake is a valid stake (whole cents,
// ≥ 0.01) and the multiplier is a finite number > 0. Otherwise nothing is
// computed — `null`, never a coerced zero.
//
// Numeric envelope (§23.19; Q1 and Q11 OPEN — no bound enforced, M1-D10):
// the integer payout is exact at any size. Its conversion to a `number`,
// `Number(c) / 100`, is the canonical cent double only below 100 · 2^46
// cents; above 2^53 cents `Number(c)` rounds to nearest. A conversion that
// is not finite is refused. W11 (§23.21): the wallet credits only through
// `exactCredit`, which keeps every balance, credit and result below 2^44
// units, inside the exact domain.

import { isValidStake } from "./stake";

/** A finite nonnegative number as an exact decimal: value = n · 10^e. */
interface Decimal {
  readonly n: bigint;
  readonly e: number;
}

// ECMAScript Number::toString of a finite nonnegative double: digits with an
// optional fraction, or exponent notation ("1e+21", "5e-7").
const DECIMAL = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

/** Exact decimal of a finite nonnegative number via String(x); null for anything else. */
export function decimalOf(x: number): Decimal | null {
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0) return null;
  const match = DECIMAL.exec(String(x));
  if (!match) return null;
  const fraction = match[2] ?? "";
  return { n: BigInt(match[1] + fraction), e: (match[3] ? Number(match[3]) : 0) - fraction.length };
}

/** W7: a settlement multiplier must be a finite number strictly above zero. */
export const isSettlementMultiplier = (m: unknown): m is number =>
  typeof m === "number" && Number.isFinite(m) && m > 0;

/** ⌊100 · s̄ · m̄⌋ in integer cents; null unless the stake is valid and the multiplier passes W7. */
export function payoutCents(stake: number, multiplier: number): bigint | null {
  if (!isValidStake(stake) || !isSettlementMultiplier(multiplier)) return null;
  const s = decimalOf(stake);
  const m = decimalOf(multiplier);
  if (!s || !m) return null;
  const product = s.n * m.n;
  const exponent = s.e + m.e + 2;
  return exponent >= 0 ? product * 10n ** BigInt(exponent) : product / 10n ** BigInt(-exponent);
}

/** The one BigInt → number conversion: integer cents → amount; null if not finite. */
export function centsToAmount(cents: bigint): number | null {
  const amount = Number(cents) / 100;
  return Number.isFinite(amount) ? amount : null;
}

/**
 * W11 (owner, 2026-11-14; docs/07 §23.21): the M1 numerical envelope — the
 * exclusive balance boundary of 2^44 currency units, in integer cents. Below
 * it every canonical cent value converts exactly between cents and `number`
 * (I4). It is not a stake ceiling or a product maximum.
 */
export const BALANCE_LIMIT_CENTS: bigint = 2n ** 44n * 100n;

/**
 * Exact integer cents of a canonical whole-cent amount (via `decimalOf`, no
 * float multiply); null for anything that is not finite, ≥ 0 and whole cents.
 */
export function amountToCents(amount: number): bigint | null {
  const d = decimalOf(amount);
  if (!d) return null;
  const shift = d.e + 2;
  if (shift >= 0) return d.n * 10n ** BigInt(shift);
  const unit = 10n ** BigInt(-shift);
  return d.n % unit === 0n ? d.n / unit : null;
}

/**
 * W11: the balance after crediting `cents`, decided entirely in exact integer
 * cents BEFORE any lossy conversion. The existing balance, the credit and the
 * resulting balance must each be exact whole cents inside [0, 2^44 units);
 * only then is the result converted once, exactly, to its canonical cent
 * double. null means the credit cannot be represented and must not be applied.
 */
export function exactCredit(balance: number, cents: bigint): number | null {
  const current = amountToCents(balance);
  if (current === null || current >= BALANCE_LIMIT_CENTS) return null;
  if (cents < 0n || cents >= BALANCE_LIMIT_CENTS) return null;
  const next = current + cents;
  if (next >= BALANCE_LIMIT_CENTS) return null;
  // next < 2^44 · 100 < 2^53: Number(next) is exact and the division by 100 is
  // correctly rounded, so this is the canonical double of next / 100.
  return Number(next) / 100;
}

/** The rounded-down payout as an amount; null when it cannot be computed or represented. */
export function payoutAmount(stake: number, multiplier: number): number | null {
  const cents = payoutCents(stake, multiplier);
  return cents === null ? null : centsToAmount(cents);
}
