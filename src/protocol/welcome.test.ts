// The optional welcome snapshot (owner-approved P8-1 Draft v1 exception for P8-2, 2026-11-18).
//
// A present `welcome.snapshot` is the public state of a real authoritative
// round; an absent one means the server has no round to report. These tests
// pin the amendment's scope: only `welcome` changed, `sync.snapshot` still
// requires a snapshot, the 43 frames that existed before the amendment are
// byte-identical, and a welcome without a snapshot carries no invented round.
import { describe, expect, it } from "vitest";
import { decodeServerFrame, encodeServerFrame } from "./codec";
import { SESSION_SERVER_MESSAGES, WelcomePayload } from "./messages/server-session";
import { GOLDEN_V1 } from "./test/golden-v1";
import { PROTOCOL_STATUS } from "./version";

const AMENDMENT_FRAME = "welcome without a round";
const golden = (name: string) => GOLDEN_V1.find((g) => g.name === name)!.frame;

// FNV-1a 64 over [name, direction, frame] of every pre-amendment frame, in
// corpus order. Computed from commit 402376c (P8-1), where the corpus had 43 frames.
const PRE_AMENDMENT_COUNT = 43;
const PRE_AMENDMENT_FINGERPRINT = "62db2945a29441ef";

function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

const BASE = {
  protocol: 1,
  sessionId: "6b1f0c2e-3d4a-4b5c-8d6e-7f8091a2b3c4",
  serverTimeMs: "1731940000123",
  tickHz: 60,
};

describe("welcome without a snapshot (P8-2 exception)", () => {
  it("the protocol is still a draft", () => {
    expect(PROTOCOL_STATUS).toBe("draft");
  });

  it("the golden frame decodes, has no snapshot and no player, and re-encodes byte for byte", () => {
    const frame = golden(AMENDMENT_FRAME);
    const decoded = decodeServerFrame(frame);
    if (!decoded.ok || decoded.msg.t !== "welcome") throw new Error("does not decode as welcome");
    expect(decoded.msg.p).not.toHaveProperty("snapshot");
    expect(decoded.msg.p).not.toHaveProperty("player");
    expect(Object.keys(decoded.msg.p)).toEqual(["protocol", "sessionId", "serverTimeMs", "tickHz"]);
    expect(encodeServerFrame(decoded.msg)).toEqual({ ok: true, frame });
  });

  it("carries no round field of any kind", () => {
    const frame = golden(AMENDMENT_FRAME);
    for (const key of ["roundId", "roundNumber", "commitment", "phase", "betting", "dive"]) {
      expect(frame).not.toContain(`"${key}"`);
    }
  });

  it("an explicit null or an empty object is not an absent snapshot", () => {
    expect(WelcomePayload.safeParse({ ...BASE, snapshot: null }).success).toBe(false);
    expect(WelcomePayload.safeParse({ ...BASE, snapshot: {} }).success).toBe(false);
    expect(WelcomePayload.safeParse({ ...BASE, snapshot: undefined }).success).toBe(true);
  });

  it("an encoder still refuses any field outside the welcome schema", () => {
    const decoded = decodeServerFrame(golden(AMENDMENT_FRAME));
    if (!decoded.ok) throw new Error("does not decode");
    const withRound = { ...decoded.msg, p: { ...decoded.msg.p, roundId: "x" } };
    expect(encodeServerFrame(withRound as never)).toMatchObject({ ok: false, code: "malformed" });
  });

  it("a present snapshot is still validated in full", () => {
    const spectator = golden("welcome spectator").replace('"phase":"betting"', '"phase":"sunk"');
    expect(decodeServerFrame(spectator)).toMatchObject({ ok: false, code: "malformed" });
  });

  it("sync.snapshot still requires its snapshot (only welcome changed)", () => {
    const payload = SESSION_SERVER_MESSAGES["sync.snapshot"].payload;
    expect(payload.safeParse({}).success).toBe(false);
  });
});

describe("pre-amendment golden frames (compatibility)", () => {
  const preAmendment = GOLDEN_V1.filter((g) => g.name !== AMENDMENT_FRAME);

  it("the amendment added exactly one frame", () => {
    expect(GOLDEN_V1.length).toBe(PRE_AMENDMENT_COUNT + 1);
    expect(preAmendment.length).toBe(PRE_AMENDMENT_COUNT);
  });

  it("the 43 earlier frames are byte-identical to commit 402376c, in the same order", () => {
    const fingerprint = fnv1a64(
      JSON.stringify(preAmendment.map((g) => [g.name, g.direction, g.frame])),
    );
    expect(fingerprint).toBe(PRE_AMENDMENT_FINGERPRINT);
  });

  it("both earlier welcome frames still decode with their snapshot", () => {
    for (const name of ["welcome spectator", "welcome player"]) {
      const decoded = decodeServerFrame(golden(name));
      if (!decoded.ok || decoded.msg.t !== "welcome") throw new Error(`${name} does not decode`);
      expect(decoded.msg.p.snapshot?.schema).toBe("public-snapshot");
    }
  });
});
