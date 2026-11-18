// Codec pipeline: order of checks, failure codes, encoder self-validation (P8-1; P1-D4).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeClientFrame,
  decodeServerFrame,
  encodeClientFrame,
  encodePublicServerFrame,
  encodeServerFrame,
  exceedsNesting,
  utf8ByteLength,
} from "./codec";
import { MAX_CLIENT_FRAME_BYTES, MAX_NESTING_DEPTH, MAX_SERVER_FRAME_BYTES } from "./limits";
import { GOLDEN_V1 } from "./test/golden-v1";

const ID = "0193f6a2-8000-7000-a000-000000000001";
const ROUND = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";
const golden = (name: string) => GOLDEN_V1.find((g) => g.name === name)!.frame;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("size is checked before decoding and parsing", () => {
  it("rejects one byte over the client limit without calling JSON.parse", () => {
    const parse = vi.spyOn(JSON, "parse");
    const pad = "x".repeat(MAX_CLIENT_FRAME_BYTES);
    const frame = `{"v":1,"t":"ping","id":"${ID}","p":{"clientTs":1},"pad":"${pad}"}`;
    expect(decodeClientFrame(frame)).toMatchObject({ ok: false, code: "frame-too-large" });
    expect(decodeClientFrame(new TextEncoder().encode(frame))).toMatchObject({
      ok: false,
      code: "frame-too-large",
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes, not UTF-16 units", () => {
    const frame = `{"v":1,"t":"ping","id":"${ID}","p":{"x":"${"é".repeat(MAX_CLIENT_FRAME_BYTES / 2)}"}}`;
    expect(frame.length).toBeLessThan(MAX_CLIENT_FRAME_BYTES + 64);
    expect(decodeClientFrame(frame)).toMatchObject({ ok: false, code: "frame-too-large" });
  });

  it("allows server frames up to 64 KiB, not beyond", () => {
    expect(decodeServerFrame("x".repeat(MAX_SERVER_FRAME_BYTES + 1))).toMatchObject({
      code: "frame-too-large",
    });
    expect(decodeServerFrame("x".repeat(MAX_SERVER_FRAME_BYTES))).toMatchObject({
      code: "malformed",
    });
  });

  it("utf8ByteLength agrees with TextEncoder and flags lone surrogates", () => {
    for (const s of ["", "abc", "é", "€", "🐟", "a🐟é€", "߿ࠀ￿"]) {
      expect(utf8ByteLength(s)).toBe(new TextEncoder().encode(s).length);
    }
    expect(utf8ByteLength("\ud800")).toBe(-1);
    expect(utf8ByteLength("\udc00x")).toBe(-1);
    expect(utf8ByteLength("\ud800\ud800")).toBe(-1);
  });
});

describe("text and structure", () => {
  it("rejects invalid UTF-8, a byte-order mark and lone surrogates", () => {
    expect(decodeClientFrame(new Uint8Array([0x7b, 0xff, 0x7d]))).toMatchObject({
      code: "malformed",
    });
    expect(decodeClientFrame(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toMatchObject({
      code: "malformed",
    });
    expect(decodeClientFrame(`{"v":1,"t":"ping","id":"${ID}","p":{"x":"\ud800"}}`)).toMatchObject({
      code: "malformed",
    });
  });

  it("decodes UTF-8 bytes like the equivalent string", () => {
    const frame = golden("bet.place slot 0");
    expect(decodeClientFrame(new TextEncoder().encode(frame))).toEqual(decodeClientFrame(frame));
  });

  it("rejects non-text input", () => {
    for (const raw of [null, undefined, 1, {}, [], new ArrayBuffer(4)]) {
      expect(decodeClientFrame(raw)).toMatchObject({ ok: false, code: "malformed" });
      expect(decodeServerFrame(raw)).toMatchObject({ ok: false, code: "malformed" });
    }
  });

  it("rejects nesting deeper than the limit before JSON.parse; brackets inside strings do not count", () => {
    const parse = vi.spyOn(JSON, "parse");
    const deep = `{"v":1,"t":"ping","id":"${ID}","p":${"[".repeat(MAX_NESTING_DEPTH)}${"]".repeat(MAX_NESTING_DEPTH)}}`;
    expect(decodeClientFrame(deep)).toMatchObject({
      code: "malformed",
      detail: `nesting deeper than ${MAX_NESTING_DEPTH}`,
    });
    expect(parse).not.toHaveBeenCalled();
    expect(exceedsNesting(`{"a":"[[[[[[[[[[[[\\"[[[["}`, 2)).toBe(false);
    expect(exceedsNesting("[[[]]]", 3)).toBe(false);
    expect(exceedsNesting("[[[[]]]]", 3)).toBe(true);
  });

  it("rejects invalid JSON and non-object frames", () => {
    for (const raw of ["", "{", '{"v":1,', "[]", "null", "1", '"x"', "{'v':1}", '{"v":1}x']) {
      expect(decodeClientFrame(raw)).toMatchObject({ ok: false, code: "malformed" });
    }
  });
});

describe("version and type", () => {
  it("v other than 1 is protocol-unsupported; a non-integer v is malformed", () => {
    const frame = (v: string) => `{"v":${v},"t":"ping","id":"${ID}","p":{"clientTs":1}}`;
    expect(decodeClientFrame(frame("2"))).toMatchObject({ code: "protocol-unsupported" });
    expect(decodeClientFrame(frame("0"))).toMatchObject({ code: "protocol-unsupported" });
    expect(decodeClientFrame(frame('"1"'))).toMatchObject({ code: "malformed" });
    expect(decodeClientFrame(frame("1.5"))).toMatchObject({ code: "malformed" });
    expect(decodeClientFrame(`{"t":"ping","id":"${ID}","p":{}}`)).toMatchObject({
      code: "malformed",
    });
  });

  it("an unknown type is rejected by the server and ignorable at a client", () => {
    expect(decodeClientFrame(`{"v":1,"t":"chat.say","id":"${ID}","p":{}}`)).toMatchObject({
      code: "unknown-type",
      ignorable: false,
    });
    expect(decodeServerFrame(`{"v":1,"t":"round.future","seq":1,"ts":"1","p":{}}`)).toMatchObject({
      code: "unknown-type",
      ignorable: true,
    });
  });
});

describe("correlation (re)", () => {
  it("is required on responses and forbidden on broadcasts", () => {
    const accepted = golden("bet.accepted slot 0");
    expect(decodeServerFrame(accepted.replace(/"re":"[^"]+",/, ""))).toMatchObject({
      code: "malformed",
      detail: "re: required",
    });
    const sync = golden("round.sync");
    expect(decodeServerFrame(sync.replace('"ts":', `"re":"${ID}","ts":`))).toMatchObject({
      code: "malformed",
      detail: "re: not allowed",
    });
  });

  it("is optional on error", () => {
    expect(decodeServerFrame(golden("error rate-limited")).ok).toBe(true);
    expect(decodeServerFrame(golden("error idempotency-conflict")).ok).toBe(true);
  });
});

describe("canonical form", () => {
  it("decoding ignores key order and whitespace; encoding restores the canonical frame", () => {
    const canonical = golden("bet.place slot 0");
    const shuffled = `{ "p": { "currency": "AQC", "amountMinor": "500", "slot": 0, "roundId": "${ROUND}" }, "id": "${ID}", "t": "bet.place", "v": 1 }`;
    const decoded = decodeClientFrame(shuffled);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(encodeClientFrame(decoded.msg)).toEqual({ ok: true, frame: canonical });
  });

  it("failure details never echo input values", () => {
    const frame = `{"v":1,"t":"bet.place","id":"${ID}","p":{"roundId":"${ROUND}","slot":0,"amountMinor":"SECRET-123","currency":"AQC"}}`;
    const result = decodeClientFrame(frame);
    expect(result).toMatchObject({
      ok: false,
      code: "malformed",
      detail: "p.amountMinor: invalid_string",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});

describe("encoders validate their own output", () => {
  const decodedServer = (name: string) => {
    const d = decodeServerFrame(golden(name));
    if (!d.ok) throw new Error(`golden ${name} does not decode`);
    return d.msg;
  };

  it("reject a field outside the schema at any depth (allow-list, never silently stripped)", () => {
    const snapshot = decodedServer("sync.snapshot diving") as Extract<
      ReturnType<typeof decodedServer>,
      { t: "sync.snapshot" }
    >;
    const leaking = {
      ...snapshot,
      p: {
        ...snapshot.p,
        snapshot: {
          ...snapshot.p.snapshot,
          dive: { ...snapshot.p.snapshot.dive!, crashAt: "7.1" },
        },
      },
    };
    expect(encodeServerFrame(leaking as never)).toMatchObject({
      ok: false,
      detail: "p.snapshot.dive.crashAt: field not in schema",
    });
    const topLevel = { ...decodedServer("round.sync"), secret: 1 };
    expect(encodeServerFrame(topLevel as never)).toMatchObject({
      ok: false,
      detail: "envelope: field not in schema",
    });
  });

  it("accept unknown error codes when decoding but emit only registered codes on their carriers", () => {
    const future = golden("bet.rejected").replace("not-in-betting", "future-code");
    const decoded = decodeServerFrame(future);
    expect(decoded.ok).toBe(true);
    if (decoded.ok)
      expect(encodeServerFrame(decoded.msg)).toMatchObject({
        ok: false,
        detail: "p.code: not registered for this carrier",
      });
    const wrongCarrier = decodeServerFrame(
      golden("bet.rejected").replace("not-in-betting", "chest-already-picked"),
    );
    if (wrongCarrier.ok) expect(encodeServerFrame(wrongCarrier.msg)).toMatchObject({ ok: false });
    const wrongFlag = decodeServerFrame(
      golden("error rate-limited").replace('"retryable":true', '"retryable":false'),
    );
    if (wrongFlag.ok) {
      expect(encodeServerFrame(wrongFlag.msg)).toMatchObject({
        ok: false,
        detail: "p.retryable: differs from the registry",
      });
    }
  });

  it("refuse a session message on the broadcast path at runtime too", () => {
    const welcome = decodedServer("welcome player");
    expect(encodePublicServerFrame(welcome as never)).toMatchObject({
      ok: false,
      code: "unknown-type",
    });
    expect(encodePublicServerFrame(decodedServer("round.sync") as never)).toMatchObject({
      ok: true,
    });
  });

  it("reject client messages that the server would reject", () => {
    expect(
      encodeClientFrame({
        v: 1,
        t: "bet.cashout",
        id: ID,
        p: { roundId: ROUND, slot: 2 },
      } as never),
    ).toMatchObject({
      ok: false,
    });
    expect(encodeClientFrame({ v: 1, t: "round.crashed", id: ID, p: {} } as never)).toMatchObject({
      code: "unknown-type",
    });
  });
});
