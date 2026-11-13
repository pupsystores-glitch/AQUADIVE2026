// Stake predicate tests (M1, docs/07_UI_ARCHITECTURE.md §23.4, §23.7 value
// matrix; owner policy M1-D1, M1-D2). Node env.
//
// Oracle: integer cents. A value is a valid stake iff it equals the double
// nearest k / 100 for an integer k ≥ 1 — computed here as `k / 100` (one
// correctly rounded division), never with the predicate's own toFixed idiom.
import { describe, expect, it } from "vitest";
import { MIN_STAKE, isValidStake } from "./stake";

describe("isValidStake — the §23.7 value matrix", () => {
  it("rejects zero, negatives and non-finite values", () => {
    for (const v of [0, -0, -1, -0.01, NaN, Infinity, -Infinity]) {
      expect(isValidStake(v), String(v)).toBe(false);
    }
  });

  it("rejects sub-cent and fractional-cent amounts — never rounds them", () => {
    for (const v of [0.001, 0.004, 0.005, 0.009, 1.005, 0.123, 999.999]) {
      expect(isValidStake(v), String(v)).toBe(false);
    }
  });

  it("accepts the minimum 0.01 and ordinary whole-cent stakes", () => {
    expect(MIN_STAKE).toBe(0.01);
    for (const v of [0.01, 0.02, 0.1, 0.3, 1, 5, 1000, 999.99, 1e9]) {
      expect(isValidStake(v), String(v)).toBe(true);
    }
  });

  it("no false rejection where k × 0.01 is not exact in binary (0.07, 0.29, 0.57, 1.15, 4.35, 8.2)", () => {
    for (const v of [0.07, 0.29, 0.57, 1.15, 4.35, 8.2]) {
      expect(isValidStake(v), String(v)).toBe(true);
    }
    expect(0.07 * 100).not.toBe(7); // the rejected `(a * 100) % 1` form would fail here
  });

  it("rejects non-canonical doubles that merely look like cents", () => {
    expect(isValidStake(0.1 + 0.2)).toBe(false);
    expect(isValidStake(1000.0000000000001)).toBe(false);
    const up = (x: number) => x + Number.EPSILON * Math.max(1, x);
    const down = (x: number) => x - Number.EPSILON * Math.max(1, x) * 0.5;
    expect(isValidStake(up(0.01))).toBe(false);
    expect(isValidStake(down(0.01))).toBe(false);
  });

  it("validity is of the number, not the text: 1.000, 0.010, 1e-2 are valid", () => {
    for (const raw of ["1.000", "0.010", "1e-2", "007", "  12  "]) {
      expect(isValidStake(+raw), raw).toBe(true);
    }
  });

  it("rejects non-number payloads (a string is never coerced)", () => {
    for (const v of ["5", null, undefined, {}, 5n] as unknown[]) {
      expect(isValidStake(v)).toBe(false);
    }
  });
});

describe("isValidStake — properties against the integer-cent oracle", () => {
  it("every k / 100 for k ≤ 200,000 is accepted; its neighbouring doubles are rejected", () => {
    const buf = new Float64Array(1);
    const bits = new BigInt64Array(buf.buffer);
    const step = (x: number, d: 1n | -1n) => {
      buf[0] = x;
      bits[0] += d;
      return buf[0];
    };
    for (let k = 1; k <= 200_000; k++) {
      const a = k / 100;
      if (!isValidStake(a)) throw new Error(`false rejection at k=${k}`);
      if (isValidStake(step(a, 1n))) throw new Error(`false acceptance above k=${k}`);
      if (isValidStake(step(a, -1n))) throw new Error(`false acceptance below k=${k}`);
    }
  });

  it("the bet controls only produce valid stakes: halve (floor 1) and double of any valid stake", () => {
    for (let k = 1; k <= 200_000; k += 7) {
      const b = k / 100;
      const halved = Math.max(1, +(b / 2).toFixed(2));
      const doubled = +(b * 2).toFixed(2);
      if (!isValidStake(halved)) throw new Error(`halve(${b}) = ${halved}`);
      if (!isValidStake(doubled)) throw new Error(`double(${b}) = ${doubled}`);
    }
  });
});
