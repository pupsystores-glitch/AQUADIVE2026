// Identifier and index formats (P8-1; P1-D6; docs/20 §5.3 test 4).
import { describe, expect, it } from "vitest";
import {
  ChestIdSchema,
  CounterSchema,
  CreatureIdSchema,
  isCounterString,
  MAX_COUNTER,
  RequestIdSchema,
  RoundIdSchema,
  RoundNumberSchema,
  Sha256HexSchema,
  SlotSchema,
  TickSchema,
} from "./ids";
import { MAX_TICK } from "./limits";

const V4 = "3f8e2b9a-1c4d-4e5f-8a6b-7c8d9e0f1a2b";
const V7 = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";
const V1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("UUIDs", () => {
  it("round and bet ids accept any canonical lower-case version", () => {
    for (const id of [V4, V7, V1]) expect(RoundIdSchema.safeParse(id).success).toBe(true);
  });

  it("request ids accept v4 and v7 only", () => {
    expect(RequestIdSchema.safeParse(V4).success).toBe(true);
    expect(RequestIdSchema.safeParse(V7).success).toBe(true);
    expect(RequestIdSchema.safeParse(V1).success).toBe(false);
  });

  it.each([
    V4.toUpperCase(),
    `{${V4}}`,
    V4.replace(/-/g, ""),
    ` ${V4}`,
    "00000000-0000-0000-0000-000000000000",
    "3f8e2b9a-1c4d-4e5f-ca6b-7c8d9e0f1a2b",
    "01JD6Z8Q4K3M2N1P0R9S8T7V6W",
    "",
    1,
    null,
  ])("rejects non-canonical %p", (id) => {
    expect(RoundIdSchema.safeParse(id).success).toBe(false);
    expect(RequestIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("counters and round numbers (BIGINT-safe decimal strings)", () => {
  it("accepts 0 … 2^63 − 1 for counters", () => {
    for (const s of ["0", "1", "9999812", (2n ** 53n + 1n).toString(), MAX_COUNTER.toString()]) {
      expect(CounterSchema.safeParse(s).success).toBe(true);
    }
    expect(isCounterString((MAX_COUNTER + 1n).toString())).toBe(false);
  });

  it("round numbers are ≥ 1", () => {
    expect(RoundNumberSchema.safeParse("1").success).toBe(true);
    expect(RoundNumberSchema.safeParse("0").success).toBe(false);
  });

  it.each(["-1", "01", "1e3", "1.0", " 1", "", "99999999999999999999", 5])("rejects %p", (s) => {
    expect(CounterSchema.safeParse(s).success).toBe(false);
    expect(RoundNumberSchema.safeParse(s).success).toBe(false);
  });
});

describe("integers", () => {
  it("ticks are integers 0 … 2^31 − 1", () => {
    for (const t of [0, 1, 1290, MAX_TICK]) expect(TickSchema.safeParse(t).success).toBe(true);
    const fromJson1e309 = JSON.parse("1e309") as number; // Infinity
    for (const t of [-1, 0.5, MAX_TICK + 1, -0, Number.NaN, Infinity, "1", null, fromJson1e309]) {
      expect(TickSchema.safeParse(t).success).toBe(false);
    }
  });

  it("slot ∈ {0, 1}", () => {
    expect(SlotSchema.safeParse(0).success).toBe(true);
    expect(SlotSchema.safeParse(1).success).toBe(true);
    for (const s of [2, -1, 0.5, "0", true, null, -0.0001])
      expect(SlotSchema.safeParse(s).success).toBe(false);
  });

  it("chestId ∈ {0, 1, 2}", () => {
    for (const c of [0, 1, 2]) expect(ChestIdSchema.safeParse(c).success).toBe(true);
    for (const c of [3, -1, 1.5, "2", false])
      expect(ChestIdSchema.safeParse(c).success).toBe(false);
  });

  it("creature ids are non-negative integers", () => {
    expect(CreatureIdSchema.safeParse(7).success).toBe(true);
    expect(CreatureIdSchema.safeParse(-1).success).toBe(false);
  });
});

describe("hex", () => {
  it("SHA-256 values are 64 lower-case hex digits", () => {
    expect(Sha256HexSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(Sha256HexSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(Sha256HexSchema.safeParse("a".repeat(63)).success).toBe(false);
  });
});
