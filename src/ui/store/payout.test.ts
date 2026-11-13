// Payout function tests (M1, docs/07_UI_ARCHITECTURE.md §23.7 V2 and
// final-reconciliation blocks, §23.13, §23.16, §23.19). Node env.
//
// Every expected value is an integer-cent literal or comes from an
// independent integer oracle (⌊k·M/100⌋, or the exact binary rational of
// src/ui/test/money-oracle.ts) — never from the function under test and
// never from toFixed.
import { describe, expect, it } from "vitest";
import { exactBinary, floorCentsBinary } from "@/ui/test/money-oracle";
import {
  amountToCents,
  BALANCE_LIMIT_CENTS,
  centsToAmount,
  decimalOf,
  exactCredit,
  isSettlementMultiplier,
  payoutAmount,
  payoutCents,
} from "./payout";

describe("payoutCents — required cases (rounded down, never above the intended amount)", () => {
  const cases: Array<[number, number, bigint]> = [
    [0.01, 1.5, 1n],
    [0.01, 1.5014, 1n], // V2: round-to-nearest paid 0.02
    [0.01, 1.5000000001, 1n],
    [0.01, 2.4999, 2n],
    [0.29, 1, 29n], // Math.floor form: 28
    [0.29, 2, 58n], // Math.floor form: 57
    [1, 1.15, 115n], // double of 1.15 lies below the decimal
    [1, 57.29, 5729n],
    [100, 1.15, 11500n],
    [33.33, 57.29, 190947n], // today 1909.48
    [33.33, 2.005, 6682n], // 66.82665 → 66.82
    [0.29, 100.57, 2916n], // jackpot; today 29.17
    [10, 499.99, 499990n], // Math.floor form: 4999.89
    [0.01, 50.01, 50n],
    [0.01, 25000, 25000n],
  ];
  for (const [s, m, cents] of cases) {
    it(`${s} × ${m} → ${cents} cents`, () => {
      expect(payoutCents(s, m)).toBe(cents);
      expect(payoutAmount(s, m)).toBe(Number(cents) / 100);
    });
  }

  it("floating-point cent boundaries: these stakes at 1× and 2× pay exactly the stake and twice it", () => {
    for (const k of [7, 29, 57, 115, 435, 820, 99999]) {
      expect(payoutCents(k / 100, 1)).toBe(BigInt(k));
      expect(payoutCents(k / 100, 2)).toBe(BigInt(2 * k));
    }
  });
});

describe("payoutCents — exhaustive grid against ⌊k·M/100⌋ in integers", () => {
  it("stakes k/100 (k ≤ 600) × two-decimal multipliers M/100 (100 ≤ M ≤ 1000): no mismatch", () => {
    let checked = 0;
    for (let k = 1; k <= 600; k++) {
      const s = k / 100;
      for (let M = 100; M <= 1000; M++) {
        const want = (BigInt(k) * BigInt(M)) / 100n;
        const got = payoutCents(s, M / 100);
        if (got !== want) throw new Error(`k=${k} M=${M}: got ${got}, want ${want}`);
        checked++;
      }
    }
    expect(checked).toBe(600 * 901);
  });

  it("large two-decimal multipliers up to 25,000 with boundary stakes", () => {
    for (const k of [1, 2, 29, 3333, 99999, 100000]) {
      for (const M of [5000, 5001, 10057, 49999, 50000, 2500000]) {
        expect(payoutCents(k / 100, M / 100)).toBe((BigInt(k) * BigInt(M)) / 100n);
      }
    }
  });
});

describe("payoutCents — unrounded cashout multipliers vs the exact binary oracle (§23.16)", () => {
  it("exp(0.085·t) + boost over every tick to the sea floor, 8 stakes: equals ⌊cents × m_binary⌋, never above it by more than the documented straddle", () => {
    const stakes = [1n, 2n, 10n, 29n, 500n, 1000n, 3333n, 12345678n];
    let differences = 0;
    for (let tick = 1; tick <= 1289; tick++) {
      for (const boost of [0, 0.15, 0.4]) {
        const m = Math.exp(0.085 * (tick / 60)) + boost;
        for (const c of stakes) {
          const got = payoutCents(Number(c) / 100, m)!;
          const binary = floorCentsBinary(c, m);
          if (got !== binary) {
            differences++;
            // Meaning 1 vs meaning 2 differ by at most one cent (§23.16).
            expect(got - binary === 1n || binary - got === 1n).toBe(true);
          }
        }
      }
    }
    expect(differences).toBe(0);
  });
});

describe("payoutCents — W7 preconditions: nothing is computed, nothing coerced to zero", () => {
  it("invalid multipliers: NaN, ±Infinity, negative, -0, 0, non-number", () => {
    for (const m of [NaN, Infinity, -Infinity, -1, -0, 0, "2" as unknown as number]) {
      expect(payoutCents(1, m), String(m)).toBeNull();
      expect(payoutAmount(1, m), String(m)).toBeNull();
      expect(isSettlementMultiplier(m)).toBe(false);
    }
  });

  it("invalid stakes: sub-cent, zero, negative, non-finite", () => {
    for (const s of [0, -1, 0.005, 1.005, NaN, Infinity])
      expect(payoutCents(s, 2), String(s)).toBeNull();
  });

  it("positive multipliers below 1 are not refused here (Q9b — range is the engine's contract)", () => {
    expect(payoutCents(1, 0.5)).toBe(50n);
  });
});

describe("decimalOf — exact decomposition of String(x)", () => {
  it("plain and exponent notation", () => {
    expect(decimalOf(1.15)).toEqual({ n: 115n, e: -2 });
    expect(decimalOf(1e21)).toEqual({ n: 1n, e: 21 });
    expect(decimalOf(5e-7)).toEqual({ n: 5n, e: -7 });
    expect(decimalOf(1.5e-10)).toEqual({ n: 15n, e: -11 });
    expect(decimalOf(0)).toEqual({ n: 0n, e: 0 });
  });

  it("refuses NaN, Infinity and negatives instead of coercing", () => {
    for (const x of [NaN, Infinity, -Infinity, -1]) expect(decimalOf(x)).toBeNull();
  });

  it("the digit strings the suite relies on are pinned (String(x) determinism)", () => {
    expect(String(1.15)).toBe("1.15");
    expect(String(0.1 + 0.2)).toBe("0.30000000000000004");
    expect(String(1e21)).toBe("1e+21");
  });
});

describe("numeric envelope — documented behavior, no ceiling enforced (§23.19, Q1/Q11 OPEN)", () => {
  it("the integer payout is exact at any size", () => {
    expect(payoutCents(1e21, 1)).toBe(10n ** 23n);
    expect(payoutCents(1e15, 25000)).toBe(25n * 10n ** 20n);
  });

  it("below 2^46 units the converted payout is the canonical cent double", () => {
    const k = 2n ** 46n * 100n - 1n; // just under 2^46 units, in cents
    const s = Number(k) / 100;
    expect(payoutAmount(s, 1)).toBe(s);
  });

  it("conversion: Number(c) rounds to nearest above 2^53 cents (documented, Q11)", () => {
    const c = 2n ** 53n + 3n;
    expect(BigInt(Number(c))).toBe(2n ** 53n + 4n); // rounds UP — recorded, not bounded
    expect(centsToAmount(c)).toBe(Number(2n ** 53n + 4n) / 100);
  });

  it("MAX_VALUE × 1: the integer payout is finite but its conversion is not — refused (W7)", () => {
    expect(payoutCents(Number.MAX_VALUE, 1)).not.toBeNull();
    expect(payoutAmount(Number.MAX_VALUE, 1)).toBeNull();
  });

  it("1e305 × 25,000: no float overflow in the product; the conversion overflows and is refused", () => {
    expect(payoutCents(1e305, 25000)).toBe(25n * 10n ** 310n);
    expect(payoutAmount(1e305, 25000)).toBeNull();
  });

  it("exactBinary oracle sanity: 1.15 is stored below 1.15", () => {
    const { num, den } = exactBinary(1.15);
    expect(num * 100n < 115n * den).toBe(true);
  });
});

// W11 (owner, 2026-11-14; docs/07 §23.21). Expected values are integer-cent
// literals or BigInt sums — never the function under test, never toFixed.
describe("W11 — the exact-cent credit decision (2^44 exclusive envelope)", () => {
  const LIMIT = 2n ** 44n * 100n; // 1,759,218,604,441,600 cents
  const amount = (c: bigint) => Number(c) / 100; // test-side, exact below 2^53 cents

  it("the boundary is 2^44 currency units, in cents", () => {
    expect(BALANCE_LIMIT_CENTS).toBe(LIMIT);
    expect(BALANCE_LIMIT_CENTS).toBe(1_759_218_604_441_600n);
  });

  it("amountToCents is exact for canonical cent values and refuses everything else", () => {
    expect(amountToCents(0)).toBe(0n);
    expect(amountToCents(0.29)).toBe(29n); // Math.floor(0.29 * 100) = 28
    expect(amountToCents(1000)).toBe(100000n);
    expect(amountToCents(17592186044415.99)).toBe(LIMIT - 1n);
    expect(amountToCents(17592186044416)).toBe(LIMIT);
    expect(amountToCents(1e21)).toBe(10n ** 23n);
    for (const x of [0.001, 0.1 + 0.2, -0.01, NaN, Infinity, -Infinity]) {
      expect(amountToCents(x)).toBeNull();
    }
  });

  it("immediately below the boundary: a credit landing at 2^44 − 0.01 is applied exactly", () => {
    expect(exactCredit(0, LIMIT - 1n)).toBe(17592186044415.99);
    expect(exactCredit(17592186044415.98, 1n)).toBe(17592186044415.99);
    expect(exactCredit(1000, LIMIT - 1n - 100000n)).toBe(17592186044415.99);
    expect(exactCredit(17592186044415.99, 0n)).toBe(17592186044415.99);
  });

  it("at the boundary: a credit landing exactly on 2^44 is refused", () => {
    expect(exactCredit(17592186044415.99, 1n)).toBeNull();
    expect(exactCredit(0, LIMIT)).toBeNull();
    expect(exactCredit(1000, LIMIT - 100000n)).toBeNull();
  });

  it("above the boundary: payouts, balances and results at or over 2^44 are refused", () => {
    expect(exactCredit(0, LIMIT + 1n)).toBeNull();
    expect(exactCredit(17592186044415.99, 2n)).toBeNull();
    expect(exactCredit(17592186044416, 0n)).toBeNull(); // existing balance at 2^44
    expect(exactCredit(2 ** 45, 1n)).toBeNull(); // existing balance above
    expect(exactCredit(0, 10n ** 23n)).toBeNull(); // 1e21 units
    expect(exactCredit(0, payoutCents(Number.MAX_VALUE, 1) as bigint)).toBeNull();
    // The §23.21 mis-credit example lies outside the envelope: refused, never
    // credited as …186.37 (exact …186.36).
    expect(exactCredit(41543552609738.77, 65444759n)).toBeNull();
  });

  it("refuses a balance that is not an exact whole-cent value, and a negative credit", () => {
    for (const balance of [0.1 + 0.2, 0.001, -0.01, NaN, Infinity]) {
      expect(exactCredit(balance, 1n)).toBeNull();
    }
    expect(exactCredit(1000, -1n)).toBeNull();
  });

  it("never rounds: the result is exactly balance + credit in cents, across the envelope", () => {
    // Deterministic 64-bit LCG over BigInt so the sample is reproducible.
    let x = 20261114n;
    const next = (mod: bigint) => {
      x = (x * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
      return (x >> 8n) % mod;
    };
    let checked = 0;
    for (let i = 0; i < 20000; i++) {
      const b = next(LIMIT);
      const c = i % 2 === 0 ? next(LIMIT - b + 50n) : next(100_000_000n);
      const result = exactCredit(amount(b), c);
      if (b + c >= LIMIT) {
        expect(result).toBeNull();
        continue;
      }
      // The canonical cent double of b + c, round-tripping to the same cents.
      expect(result).toBe(amount(b + c));
      expect(amountToCents(result as number)).toBe(b + c);
      checked++;
    }
    expect(checked).toBeGreaterThan(15000);
  });

  it("accumulates exactly: repeated credits equal the BigInt ledger, then stop at the boundary", () => {
    let balance = 1000;
    let ledger = 100000n;
    const step = 123_456_789_012_345n; // ≈ 1.23 × 10^12 units per credit
    let applied = 0;
    for (;;) {
      const next = exactCredit(balance, step);
      if (next === null) break;
      balance = next;
      ledger += step;
      applied++;
      expect(amountToCents(balance)).toBe(ledger);
    }
    expect(applied).toBe(14); // ⌊(LIMIT − 100000) / step⌋
    expect(ledger < LIMIT && ledger + step >= LIMIT).toBe(true);
    expect(exactCredit(balance, LIMIT - 1n - ledger)).toBe(17592186044415.99);
  });
});
