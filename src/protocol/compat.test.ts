// Golden-frame corpus and compatibility rules (P8-1; P1-D4, P1-D12; docs/20 §5.4 gate 6).
import { describe, expect, it } from "vitest";
import {
  decodeClientFrame,
  decodeServerFrame,
  encodeClientFrame,
  encodeServerFrame,
  exceedsNesting,
  utf8ByteLength,
} from "./codec";
import { MAX_CLIENT_FRAME_BYTES, MAX_NESTING_DEPTH, MAX_SERVER_FRAME_BYTES } from "./limits";
import { CLIENT_PAYLOADS } from "./messages/client";
import { PUBLIC_SERVER_MESSAGES } from "./messages/server-public";
import { SESSION_SERVER_MESSAGES } from "./messages/server-session";
import { GOLDEN_V1 } from "./test/golden-v1";
import { PROTOCOL_STATUS } from "./version";

const clientGoldens = GOLDEN_V1.filter((g) => g.direction === "client");
const serverGoldens = GOLDEN_V1.filter((g) => g.direction === "server");
const typeOf = (frame: string) => (JSON.parse(frame) as { t: string }).t;

describe("golden corpus v1", () => {
  it("is still a draft corpus", () => {
    expect(PROTOCOL_STATUS).toBe("draft");
  });

  it("has unique names and covers every message type", () => {
    expect(new Set(GOLDEN_V1.map((g) => g.name)).size).toBe(GOLDEN_V1.length);
    expect([...new Set(clientGoldens.map((g) => typeOf(g.frame)))].sort()).toEqual(
      Object.keys(CLIENT_PAYLOADS).sort(),
    );
    expect([...new Set(serverGoldens.map((g) => typeOf(g.frame)))].sort()).toEqual(
      [...Object.keys(PUBLIC_SERVER_MESSAGES), ...Object.keys(SESSION_SERVER_MESSAGES)].sort(),
    );
  });

  it.each(clientGoldens.map((g) => [g.name, g.frame]))(
    "client %s: encode(decode(frame)) === frame",
    (_n, frame) => {
      const decoded = decodeClientFrame(frame);
      expect(decoded).toMatchObject({ ok: true });
      if (decoded.ok) expect(encodeClientFrame(decoded.msg)).toEqual({ ok: true, frame });
    },
  );

  it.each(serverGoldens.map((g) => [g.name, g.frame]))(
    "server %s: encode(decode(frame)) === frame",
    (_n, frame) => {
      const decoded = decodeServerFrame(frame);
      expect(decoded).toMatchObject({ ok: true });
      if (decoded.ok) expect(encodeServerFrame(decoded.msg)).toEqual({ ok: true, frame });
    },
  );

  it("every frame is within its size and nesting limits", () => {
    for (const g of GOLDEN_V1) {
      const limit = g.direction === "client" ? MAX_CLIENT_FRAME_BYTES : MAX_SERVER_FRAME_BYTES;
      expect(utf8ByteLength(g.frame)).toBeLessThanOrEqual(limit);
      expect(exceedsNesting(g.frame, MAX_NESTING_DEPTH)).toBe(false);
    }
  });

  it("frames do not cross directions", () => {
    for (const g of clientGoldens) expect(decodeServerFrame(g.frame).ok).toBe(false);
    for (const g of serverGoldens) expect(decodeClientFrame(g.frame).ok).toBe(false);
  });
});

describe("compatibility rules (bind from the first release; exercised now)", () => {
  it("a client tolerates a new optional server field and re-encodes without it", () => {
    const original = GOLDEN_V1.find((g) => g.name === "round.sync")!.frame;
    const extended = original
      .replace('"worldY":', '"depthBand":2,"worldY":')
      .replace('"ts":', '"trace":"x","ts":');
    const decoded = decodeServerFrame(extended);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.msg.p).not.toHaveProperty("depthBand");
      expect(encodeServerFrame(decoded.msg)).toEqual({ ok: true, frame: original });
    }
  });

  it("a client skips a new server message type without failing the connection", () => {
    expect(
      decodeServerFrame('{"v":1,"t":"round.replay","seq":9,"ts":"1","p":{"x":1}}'),
    ).toMatchObject({
      ok: false,
      code: "unknown-type",
      ignorable: true,
    });
  });

  it("a client accepts a new error code (and maps it to a generic message itself)", () => {
    const frame = GOLDEN_V1.find((g) => g.name === "error rate-limited")!.frame.replace(
      "rate-limited",
      "region-closed",
    );
    expect(decodeServerFrame(frame).ok).toBe(true);
  });

  it("the server stays strict: an unknown client field is rejected, never ignored", () => {
    const frame = GOLDEN_V1.find((g) => g.name === "bet.cashout")!.frame.replace(
      '"slot":1',
      '"slot":1,"auto":true',
    );
    expect(decodeClientFrame(frame)).toMatchObject({ ok: false, code: "malformed" });
  });

  it("a frame of another major is refused, not guessed", () => {
    const v2 = GOLDEN_V1.find((g) => g.name === "round.sync")!.frame.replace('{"v":1', '{"v":2');
    expect(decodeServerFrame(v2)).toMatchObject({ ok: false, code: "protocol-unsupported" });
  });
});
