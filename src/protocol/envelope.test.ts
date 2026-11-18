// Envelopes, sequencing and version negotiation (P8-1; P1-D3, P1-D7, P1-D12).
import { describe, expect, it } from "vitest";
import {
  classifySeq,
  ClientEnvelopeSchema,
  FIRST_SEQ,
  MessageTypeSchema,
  ServerEnvelopeSchema,
} from "./envelope";
import { negotiateProtocol, PROTOCOL_MAJOR, PROTOCOL_STATUS, SUPPORTED_PROTOCOL } from "./version";

const ID = "3f8e2b9a-1c4d-4e5f-8a6b-7c8d9e0f1a2b";

describe("client envelope { v, t, id, p }", () => {
  const ok = { v: 1, t: "ping", id: ID, p: {} };

  it("accepts the canonical shape", () => {
    expect(ClientEnvelopeSchema.safeParse(ok).success).toBe(true);
  });

  it.each([
    ["missing id", { v: 1, t: "ping", p: {} }],
    ["missing p", { v: 1, t: "ping", id: ID }],
    ["array payload", { ...ok, p: [] }],
    ["null payload", { ...ok, p: null }],
    ["v 2", { ...ok, v: 2 }],
    ["v string", { ...ok, v: "1" }],
    ["server field seq", { ...ok, seq: 1 }],
    ["server field re", { ...ok, re: ID }],
    ["unknown field", { ...ok, extra: true }],
    ["bad type", { ...ok, t: "Ping" }],
  ])("rejects %s", (_name, frame) => {
    expect(ClientEnvelopeSchema.safeParse(frame).success).toBe(false);
  });
});

describe("server envelope { v, t, seq, ts, re?, p }", () => {
  const ok = { v: 1, t: "round.sync", seq: 1, ts: "1731940000123", p: {} };

  it("accepts with and without re", () => {
    expect(ServerEnvelopeSchema.safeParse(ok).success).toBe(true);
    expect(ServerEnvelopeSchema.safeParse({ ...ok, re: ID }).success).toBe(true);
  });

  it("strips unknown fields (tolerant client decoding)", () => {
    const parsed = ServerEnvelopeSchema.parse({ ...ok, future: 1 });
    expect("future" in parsed).toBe(false);
  });

  it.each([
    ["seq 0", { ...ok, seq: 0 }],
    ["seq fraction", { ...ok, seq: 1.5 }],
    ["seq unsafe", { ...ok, seq: 2 ** 53 }],
    ["ts number", { ...ok, ts: 1731940000123 }],
    ["ts leading zero", { ...ok, ts: "01" }],
    ["ts too long", { ...ok, ts: "1".repeat(17) }],
    ["re not a uuid", { ...ok, re: "q1" }],
  ])("rejects %s", (_name, frame) => {
    expect(ServerEnvelopeSchema.safeParse(frame).success).toBe(false);
  });
});

describe("message type strings (shape only; the catalogue decides validity)", () => {
  it.each(["hello", "ping", "bet.place", "bet.cashedOut", "round.sync"])("well-formed: %s", (t) => {
    expect(MessageTypeSchema.safeParse(t).success).toBe(true);
  });

  it.each([
    "",
    "Hello",
    "bet.",
    ".place",
    "bet.place.x",
    "bet_place",
    "bet.Place",
    "a".repeat(33),
    1,
  ])("malformed: %p", (t) => {
    expect(MessageTypeSchema.safeParse(t).success).toBe(false);
  });
});

describe("sequencing (P1-D7)", () => {
  it("starts at 1 and increases by exactly 1", () => {
    expect(FIRST_SEQ).toBe(1);
    expect(classifySeq(null, 1)).toBe("next");
    expect(classifySeq(1, 2)).toBe("next");
    expect(classifySeq(null, 2)).toBe("gap");
    expect(classifySeq(5, 7)).toBe("gap");
    expect(classifySeq(5, 5)).toBe("stale");
    expect(classifySeq(5, 3)).toBe("stale");
  });
});

describe("version (P1-D2, P1-D12)", () => {
  it("is major 1, DRAFT", () => {
    expect(PROTOCOL_MAJOR).toBe(1);
    expect(PROTOCOL_STATUS).toBe("draft");
    expect(SUPPORTED_PROTOCOL).toEqual({ min: 1, max: 1 });
  });

  it("negotiates the highest common major, or none", () => {
    expect(negotiateProtocol({ min: 1, max: 1 })).toBe(1);
    expect(negotiateProtocol({ min: 1, max: 3 })).toBe(1);
    expect(negotiateProtocol({ min: 2, max: 3 })).toBeNull();
    expect(negotiateProtocol({ min: 1, max: 3 }, { min: 1, max: 2 })).toBe(2);
    expect(negotiateProtocol({ min: 3, max: 1 })).toBeNull();
  });
});
