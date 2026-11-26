// IPC contract of the offline Isolated Authority Host (Stage 1), source level. PLAY MONEY ONLY.
//
// Framing bounds, canonical-JSON strictness, the command and reply schemas, the fatal / rejected
// classification, the launch flags and environment rule, and the agreement of the protocol's
// event-shape copy with the scheduler's EVENT_FIELDS.
import { describe, expect, it } from "vitest";
import { EVENT_FIELDS } from "../../src/scheduler/events";
import * as p from "../../src/authority/protocol";

const enc = (s: string) => new TextEncoder().encode(s);
const frame = (body: Uint8Array) => {
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
};
const START = {
  v: 1,
  id: 1,
  op: "start",
  mode: "test",
  chain: "public-test-vectors",
  clock: "replay",
  chainLength: null,
  vectorSalt: "A",
  eventCapacity: null,
};
const cmd = (o: object) => p.parseCommand(enc(JSON.stringify(o)));
const fatalCode = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    expect(p.isFrameError(e)).toBe(true);
    return (e as { code: string }).code;
  }
  throw new Error("no error");
};

describe("framing", () => {
  it("decodes frames split at every byte boundary and many frames in one chunk", () => {
    const bodies = ["a", "bc", "x".repeat(1024)].map(enc);
    const stream = new Uint8Array(bodies.reduce((n, b) => n + 4 + b.length, 0));
    let at = 0;
    for (const b of bodies) {
      stream.set(frame(b), at);
      at += 4 + b.length;
    }
    for (const size of [1, 2, 3, 5, 7, 1000, stream.length]) {
      const d = new p.FrameDecoder(1024);
      const got: string[] = [];
      for (let i = 0; i < stream.length; i += size) {
        for (const b of d.push(stream.subarray(i, i + size))) got.push(new TextDecoder().decode(b));
      }
      expect(got).toEqual(["a", "bc", "x".repeat(1024)]);
      expect(d.buffered).toBe(0);
    }
  });

  it("refuses an empty or oversized frame at its header, before buffering, and stays failed", () => {
    for (const [header, code] of [
      [[0, 0, 0, 0], "frame-empty"],
      [[0, 0, 4, 1], "frame-too-large"],
      [[255, 255, 255, 255], "frame-too-large"],
    ] as const) {
      const d = new p.FrameDecoder(1024);
      expect(fatalCode(() => d.push(Uint8Array.from(header)))).toBe(code);
      expect(d.buffered).toBe(0);
      expect(fatalCode(() => d.push(frame(enc("{}"))))).toBe("decoder-failed");
    }
    const d = new p.FrameDecoder(1024);
    d.push(Uint8Array.from([0, 0, 4, 0, 1, 2]));
    expect(d.buffered).toBe(6); // at most one partial frame (≤ 4 + bound) is held
    expect(() => p.encodeFrame(new Uint8Array(0), 10)).toThrow();
    expect(() => p.encodeFrame(new Uint8Array(11), 10)).toThrow();
  });
});

describe("commands", () => {
  it("accepts exactly the five ops with their fixed arguments", () => {
    expect(cmd(START)).toEqual({ ok: true, command: { ...START, v: undefined } });
    for (const op of ["snapshot", "stop", "shutdown"]) {
      expect(cmd({ v: 1, id: 7, op })).toEqual({ ok: true, command: { id: 7, op } });
    }
    expect(cmd({ v: 1, id: 2, op: "events", after: 0, limit: 256 })).toMatchObject({ ok: true });
    // Round trip: the relay's encoder emits what the parser accepts.
    const f = p.encodeCommand({ ...START, id: 9 } as never);
    expect(new p.FrameDecoder(p.MAX_COMMAND_BYTES).push(f)).toHaveLength(1);
  });

  it("malformed frames are fatal (frame errors), never a rejection", () => {
    for (const [text, code] of [
      ["{v:1}", "frame-invalid-json"],
      ["[1,2]", "frame-not-object"],
      ["1", "frame-not-object"],
      ['{"v": 1,"id":1,"op":"snapshot"}', "frame-not-canonical"],
      ['{"v":1,"id":1,"id":2,"op":"snapshot"}', "frame-not-canonical"],
      ['{"v":1,"\\u0069d":1,"op":"snapshot"}', "frame-not-canonical"],
      ['{"v":1,"id":1.0,"op":"snapshot"}', "frame-not-canonical"],
      ['{"id":1,"v":1,"op":"snapshot"}', "frame-invalid-envelope"],
      ['{"v":1,"id":1}', "frame-invalid-envelope"],
      ['{"v":2,"id":1,"op":"snapshot"}', "frame-invalid-version"],
      ['{"v":1,"id":0,"op":"snapshot"}', "frame-invalid-id"],
      ['{"v":1,"id":"1","op":"snapshot"}', "frame-invalid-id"],
      ['{"v":1,"id":2147483648,"op":"snapshot"}', "frame-invalid-id"],
      ['{"v":1,"id":1.5,"op":"snapshot"}', "frame-invalid-id"],
    ] as const) {
      expect(
        fatalCode(() => p.parseCommand(enc(text))),
        text,
      ).toBe(code);
    }
    expect(fatalCode(() => p.parseCommand(Uint8Array.from([0x7b, 0xc3, 0x28, 0x7d])))).toBe(
      "frame-invalid-utf8",
    );
    expect(fatalCode(() => p.parseCommand(enc(`{"v":1,"id":1,"op":"${"x".repeat(1024)}"}`)))).toBe(
      "frame-too-large",
    );
  });

  it("unknown ops and invalid arguments are rejected with the command's id", () => {
    for (const op of ["reveal", "deliver", "seal", "eval", "residency", "inspect", "__proto__"]) {
      expect(cmd({ v: 1, id: 3, op })).toEqual({ ok: false, id: 3, code: "unknown-op" });
    }
    const invalid: object[] = [
      { ...START, salt: "ab".repeat(32) },
      { ...START, eventCapacity: undefined },
      { v: 1, id: 1, op: "snapshot", round: 1 },
      { ...START, mode: "production" },
      { ...START, chain: "other" },
      { ...START, clock: "simulated" },
      { ...START, chainLength: 0 },
      { ...START, chainLength: 65_537 },
      { ...START, chainLength: 2.5 },
      { ...START, vectorSalt: "C" },
      { ...START, eventCapacity: 15 },
      { v: 1, id: 1, op: "events", after: -1, limit: 1 },
      { v: 1, id: 1, op: "events", after: 0, limit: 0 },
      { v: 1, id: 1, op: "events", after: 0, limit: 257 },
      { v: 1, id: 1, op: "events", limit: 1, after: 0 },
    ];
    for (const o of invalid) {
      expect(cmd(o), JSON.stringify(o)).toEqual({ ok: false, id: 1, code: "invalid-arguments" });
    }
    expect(() => p.encodeCommand({ id: 1, op: "reveal" } as never)).toThrow("invalid-argument");
  });
});

describe("replies", () => {
  const reply = (o: object, op: p.AuthorityOp | null = null) =>
    p.parseReply(enc(JSON.stringify(o)), op);
  const decoded = (f: Uint8Array | null) => new p.FrameDecoder(p.MAX_REPLY_BYTES).push(f!)[0]!;

  it("round-trips ready, fatal, rejected and results", () => {
    expect(p.parseReply(decoded(p.encodeReady()), null)).toEqual({ type: "ready" });
    expect(p.parseReply(decoded(p.encodeFatal("queue-overflow")), null)).toEqual({
      type: "fatal",
      code: "queue-overflow",
    });
    expect(p.parseReply(decoded(p.encodeRejected(4, "refused", "Not Fixed!")), null)).toEqual({
      type: "rejected",
      re: 4,
      code: "refused",
      reason: null, // a non-kebab reason is never carried
    });
    const result = p.encodeResult(5, "events", { more: false, tick: 3, lastSeq: 0, events: [] });
    expect(p.parseReply(decoded(result), "events")).toEqual({
      type: "result",
      re: 5,
      result: { tick: 3, lastSeq: 0, events: [], more: false }, // fixed key order
    });
  });

  it("refuses anything outside the reply schema", () => {
    const bad: [object, p.AuthorityOp | null][] = [
      [{ v: 1, type: "ready", extra: 1 }, null],
      [{ v: 1, type: "fatal", code: "anything" }, null],
      [{ v: 1, type: "rejected", re: 1, code: "nope", reason: null }, null],
      [{ v: 1, type: "result", re: 1, result: { state: "closed" } }, null], // not awaited
      [{ v: 1, type: "result", re: 1, result: { state: "running" } }, "shutdown"],
      [{ v: 1, type: "result", re: 1, result: { state: "running", chain: {} } }, "start"],
      [{ v: 1, type: "prepared", script: "00" }, null],
      [{ v: 1, type: "result", re: 1, result: { snapshot: {}, digest: "00" } }, "snapshot"],
    ];
    for (const [o, op] of bad) expect(() => reply(o, op), JSON.stringify(o)).toThrow();
    const ev = (e: object) => ({
      v: 1,
      type: "result",
      re: 1,
      result: { tick: 9, lastSeq: 1, events: [e], more: false },
    });
    const ok = { seq: 1, tick: 0, type: "scheduler.started", round: null, firstOpeningTick: 240 };
    expect(reply(ev(ok), "events")).toMatchObject({ type: "result" });
    for (const e of [
      { ...ok, script: "x" },
      { ...ok, type: "round.secret" },
      { seq: 1, tick: 0, type: "round.admitted", round: 1, roundId: "zz", chainIndex: 1 },
      { ...ok, firstOpeningTick: { nested: true } },
      { ...ok, firstOpeningTick: "A".repeat(80) },
      { seq: 0, tick: 0, type: "scheduler.started", round: null, firstOpeningTick: 240 },
    ]) {
      expect(() => reply(ev(e), "events"), JSON.stringify(e)).toThrow();
    }
  });

  it("the event-shape copy equals the scheduler's EVENT_FIELDS", () => {
    expect(JSON.stringify(p.EVENT_SHAPES)).toBe(JSON.stringify(EVENT_FIELDS));
  });

  it("an events result too large for one frame is not encoded (the host sends fewer)", () => {
    const big = { seq: 1, tick: 0, type: "round.dive", round: 1, pad: "x".repeat(200_000) };
    expect(p.encodeResult(1, "events", { tick: 0, lastSeq: 1, events: [big], more: false })).toBe(
      null,
    );
  });
});

describe("launch rules", () => {
  it("fixed hardening flags", () => {
    expect(p.authorityNodeFlags("C:\\srv")).toEqual([
      "--permission",
      "--allow-fs-read=C:\\srv",
      "--allow-worker",
      "--disable-sigusr1",
      "--disallow-code-generation-from-strings",
      "--no-addons",
    ]);
    expect(Object.isFrozen(p.authorityNodeFlags("/srv"))).toBe(true);
    for (const bad of ["", "a\nb", "a\0b"]) expect(() => p.authorityNodeFlags(bad)).toThrow();
  });

  it("environment: NODE_ENV development or test, no other NODE_* variable", () => {
    expect(p.isAuthorityEnvironment({ NODE_ENV: "test", PATH: "x", SYSTEMROOT: "C:\\W" })).toBe(
      true,
    );
    expect(p.isAuthorityEnvironment({ NODE_ENV: "development" })).toBe(true);
    for (const env of [
      {},
      { NODE_ENV: "production" },
      { NODE_ENV: "test", NODE_OPTIONS: "--require x" },
      { NODE_ENV: "test", node_options: "--inspect" },
      { NODE_ENV: "test", NODE_PATH: "x" },
      { NODE_ENV: "test", NODE_DEBUG: "module" },
      { NODE_ENV: "test", NODE_EXTRA_CA_CERTS: "x" },
    ]) {
      expect(p.isAuthorityEnvironment(env), JSON.stringify(env)).toBe(false);
    }
  });

  it("the protected-file list names the four authority modules; errors carry fixed codes", () => {
    expect([...p.AUTHORITY_PROTECTED_FILES].sort()).toEqual(
      ["authority-main", "host", "launcher", "protocol"].map((f) => `server/src/authority/${f}.js`),
    );
    const e = new p.AuthorityError("rejected", "Contains 77.77 and a/path");
    expect([e.code, e.reason, e.message]).toEqual(["rejected", null, "rejected"]);
    for (const o of [p.AuthorityError, p.FrameDecoder, p.FrameDecoder.prototype]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
  });
});
