// Money format (P8-1; docs/20 §5.3 test 2).
import { describe, expect, it } from "vitest";
import {
  AmountMinorSchema,
  CurrencyCodeSchema,
  formatMinor,
  MAX_MINOR,
  parseMinor,
  StakeMinorSchema,
} from "./money";

const REJECTED_ALWAYS: unknown[] = [
  "-1",
  "+1",
  "01",
  "00",
  "1e3",
  "1E3",
  "1.0",
  "1.",
  ".5",
  " 1",
  "1 ",
  "\t1",
  "1_000",
  "0x10",
  "١٢",
  "",
  "1".repeat(19),
  "9223372036854775808",
  "9223372036854775807",
  100,
  0,
  1.5,
  -1,
  null,
  undefined,
  true,
  false,
  {},
  [],
  ["1"],
  10n,
];

describe("stakes (minor units ≥ 1)", () => {
  it.each(["1", "500", "99999", "1".repeat(18), "999999999999999999"])("accepts %s", (s) => {
    expect(StakeMinorSchema.safeParse(s).success).toBe(true);
  });

  it.each([...REJECTED_ALWAYS, "0"])("rejects %p", (s) => {
    expect(StakeMinorSchema.safeParse(s).success).toBe(false);
  });
});

describe("amounts (minor units ≥ 0)", () => {
  it.each(["0", "1", "728", "999999999999999999"])("accepts %s", (s) => {
    expect(AmountMinorSchema.safeParse(s).success).toBe(true);
  });

  it.each(REJECTED_ALWAYS)("rejects %p", (s) => {
    expect(AmountMinorSchema.safeParse(s).success).toBe(false);
  });
});

describe("parseMinor / formatMinor (bigint only)", () => {
  it("round-trips accepted values exactly through bigint", () => {
    for (const s of ["0", "1", "728", "9007199254740993", "999999999999999999"]) {
      const n = parseMinor(s);
      expect(typeof n).toBe("bigint");
      expect(formatMinor(n as bigint)).toBe(s);
    }
  });

  it("keeps integers above 2^53 exact (a JSON number would not)", () => {
    expect(parseMinor("9007199254740993")).toBe(9007199254740993n);
    expect(Number("9007199254740993")).toBe(9007199254740992);
  });

  it("parses only canonical strings", () => {
    for (const s of REJECTED_ALWAYS) expect(parseMinor(s)).toBeNull();
  });

  it("formats only 0 … 10^18 − 1", () => {
    expect(formatMinor(0n)).toBe("0");
    expect(formatMinor(MAX_MINOR)).toBe("999999999999999999");
    expect(formatMinor(MAX_MINOR + 1n)).toBeNull();
    expect(formatMinor(-1n)).toBeNull();
    expect(formatMinor(1 as unknown as bigint)).toBeNull();
  });

  it("MAX_MINOR fits a signed 64-bit BIGINT", () => {
    expect(MAX_MINOR < 2n ** 63n - 1n).toBe(true);
  });
});

describe("currency codes", () => {
  it.each(["AQC", "USD", "AQC2", "PLAYMONY"])("accepts %s", (s) => {
    expect(CurrencyCodeSchema.safeParse(s).success).toBe(true);
  });

  it.each(["aqc", "AQ", "1AQ", "AQC-1", "TOOLONGXX", " AQC", "", 1])("rejects %p", (s) => {
    expect(CurrencyCodeSchema.safeParse(s).success).toBe(false);
  });
});
