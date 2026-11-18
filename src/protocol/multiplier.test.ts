// Multiplier and presentation-decimal format (P8-1; docs/20 §5.3 test 3; P1-D10).
import { describe, expect, it } from "vitest";
import {
  decimalIn,
  formatDecimal,
  formatMultiplier,
  isCanonicalMultiplier,
  multiplierDecimal,
  MultiplierSchema,
  parseMultiplier,
} from "./multiplier";
import { seededRandom } from "./test/fuzz";

describe("multiplier strings", () => {
  it.each([
    "1",
    "1.01",
    "1.5",
    "2",
    "3.6411",
    "142.18",
    "2.3",
    "25000",
    "6.614321406550276",
    "3.3333333333333335",
  ])("accepts canonical %s", (s) => {
    expect(MultiplierSchema.safeParse(s).success).toBe(true);
  });

  it.each([
    "1e0",
    "1e+21",
    "1E2",
    "2.5e1",
    "NaN",
    "Infinity",
    "-Infinity",
    "1.50",
    "1.0",
    "01.5",
    "+1.5",
    " 1.5",
    "1.5 ",
    "0x10",
    "0.99",
    "0",
    "-1",
    "-0",
    ".5",
    "1.",
    "",
    "1".repeat(25),
    "1.00000000000000001",
    1.5,
    null,
    true,
  ])("rejects %p", (s) => {
    expect(MultiplierSchema.safeParse(s).success).toBe(false);
    expect(parseMultiplier(s)).toBeNull();
    expect(multiplierDecimal(s)).toBeNull();
  });

  it("formatMultiplier is String(m) for every finite m ≥ 1 below 10^21, and refuses the rest", () => {
    const rand = seededRandom(20261118);
    for (let i = 0; i < 20000; i++) {
      const m = 1 + rand() * 10 ** (rand() * 20);
      const s = formatMultiplier(m);
      expect(s).toBe(String(m));
      expect(parseMultiplier(s)).toBe(m);
    }
    for (const bad of [0.99, 0, -1, Number.NaN, Infinity, 1e21, 1e300]) {
      expect(formatMultiplier(bad)).toBeNull();
    }
  });

  it("parse and format are exact inverses on the engine's curve values", () => {
    for (let k = 0; k <= 1290; k++) {
      const m = Math.exp(0.085 * (k / 60));
      if (m < 1) continue;
      expect(parseMultiplier(formatMultiplier(m))).toBe(m);
    }
  });

  it("multiplierDecimal gives the exact decimal the string denotes", () => {
    expect(multiplierDecimal("1")).toEqual({ coefficient: 1n, exponent: 0 });
    expect(multiplierDecimal("3.6411")).toEqual({ coefficient: 36411n, exponent: -4 });
    expect(multiplierDecimal("25000")).toEqual({ coefficient: 25000n, exponent: 0 });
    expect(multiplierDecimal("1.0000000000000002")).toEqual({
      coefficient: 10000000000000002n,
      exponent: -16,
    });
  });
});

// Consistency with the M1 settlement rule (src/ui/store/payout.ts): payoutCents = ⌊100 · s̄ · m̄⌋,
// i.e. ⌊stakeMinor × m̄⌋ with m̄ the multiplier's String(m). The expected values below were
// produced by the real `payoutCents` (P8-1 cross-check: 1,000,000 random pairs, 0 mismatches).
// The protocol carries the decimal; it does not own the payout rule (OD-7 is open).
const PAYOUT_FIXTURES: readonly [stakeMinor: string, multiplier: string, payoutMinor: string][] = [
  ["1", "1", "1"],
  ["1", "1.99", "1"],
  ["1", "2", "2"],
  ["29", "1", "29"],
  ["100", "1.01", "101"],
  ["200", "3.6411", "728"],
  ["500", "159.24", "79620"],
  ["500", "142.18", "71090"],
  ["100", "3.6400593992835644", "364"],
  ["10000", "6.218321406550276", "62183"],
  ["10000", "6.614321406550276", "66143"],
  ["7", "1.15", "8"],
  ["1234", "6.614321", "8162"],
  ["100000000", "25000", "2500000000000"],
  ["3", "3.3333333333333335", "10"],
  ["110", "1.1", "121"],
  ["10", "1.3", "13"],
  ["999999", "1.0000000000000002", "999999"],
  ["50", "199.99", "9999"],
  ["300", "2.3", "690"],
];

describe("payout consistency (⌊stakeMinor × m̄⌋, exact)", () => {
  it.each(PAYOUT_FIXTURES)("stake %s × %s → %s", (stake, m, payout) => {
    const d = multiplierDecimal(m);
    expect(d).not.toBeNull();
    const { coefficient, exponent } = d!;
    const product = BigInt(stake) * coefficient;
    const exact =
      exponent >= 0 ? product * 10n ** BigInt(exponent) : product / 10n ** BigInt(-exponent);
    expect(exact.toString()).toBe(payout);
  });

  it("the float product would be wrong where the decimal is right", () => {
    // 0.29 × 1 in float cents gives 28; the exact rule gives 29 (payout.ts, V2).
    expect(Math.floor(0.29 * 1 * 100)).toBe(28);
  });
});

describe("presentation decimals", () => {
  const unit = decimalIn(0, 1);

  it.each(["0", "1", "0.79", "0.5", "5.551115123125783e-17", "1e-7"])(
    "accepts %s in [0, 1]",
    (s) => {
      expect(unit.safeParse(s).success).toBe(true);
    },
  );

  it.each([
    "-0",
    "0.50",
    "1.5",
    "-0.1",
    "NaN",
    "Infinity",
    "5.551115123125783E-17",
    "1e-07",
    ".5",
    "",
    0.5,
  ])("rejects %p", (s) => {
    expect(unit.safeParse(s).success).toBe(false);
  });

  it("formatDecimal is String(x) within range", () => {
    expect(formatDecimal(0.8 - 0.01 * 80, 0, 1)).toBe(String(0.8 - 0.01 * 80));
    expect(formatDecimal(-0, 0, 1)).toBe("0");
    expect(formatDecimal(2, 0, 1)).toBeNull();
    expect(formatDecimal(Number.NaN, 0, 1)).toBeNull();
  });

  it("isCanonicalMultiplier never accepts an exponent", () => {
    expect(isCanonicalMultiplier(String(1e21))).toBe(false);
  });
});
