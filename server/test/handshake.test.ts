// Real WebSocket handshake over loopback (P8-2 tests 4, 5, 6, 11, 18, 19).
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// The client-side decoder: tests read server frames as a client would.
import { decodeServerFrame } from "../../src/protocol";
import { clientFrame, connect, handshake, helloFrame } from "./helpers/client";
import { startServer, type TestServer } from "./helpers/server";

const ROUND = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

const parse = (frame: string) => {
  const d = decodeServerFrame(frame);
  if (!d.ok) throw new Error(`server sent an invalid frame: ${d.code} ${d.detail}`);
  return d.msg;
};

describe("hello → welcome", () => {
  it("answers a valid hello with a protocol-valid welcome", async () => {
    const id = randomUUID();
    const client = connect(server.wsUrl);
    expect(await client.opened).toBe(true);
    const before = Date.now();
    client.send(helloFrame(id));
    const frame = await client.next();
    const after = Date.now();
    const msg = parse(frame);
    if (msg.t !== "welcome") throw new Error(`expected welcome, got ${msg.t}`);

    expect(msg.seq).toBe(1);
    expect(msg.re).toBe(id);
    expect(msg.p.protocol).toBe(1);
    expect(msg.p.tickHz).toBe(60);
    const serverTime = Number(msg.p.serverTimeMs);
    expect(serverTime).toBeGreaterThanOrEqual(before - 5);
    expect(serverTime).toBeLessThanOrEqual(after + 5);
    // `ts` stamps the frame when sent; `serverTimeMs` when the welcome was built.
    expect(Number(msg.ts) - serverTime).toBeGreaterThanOrEqual(0);
    expect(Number(msg.ts) - serverTime).toBeLessThan(50);
    client.close();
  });

  it("the welcome carries no round snapshot and no private player state", async () => {
    const { client, welcome } = await handshake(server.wsUrl);
    const p = welcome.p as Record<string, unknown>;
    expect(Object.keys(p)).toEqual(["protocol", "sessionId", "serverTimeMs", "tickHz"]);
    expect(p).not.toHaveProperty("snapshot");
    expect(p).not.toHaveProperty("player");
    const raw = JSON.stringify(welcome);
    for (const key of ["roundId", "roundNumber", "commitment", "phase", "balanceMinor", "bets"]) {
      expect(raw).not.toContain(key);
    }
    client.close();
  });

  it("each connection gets a fresh connection id", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { client, welcome } = await handshake(server.wsUrl);
      ids.add((welcome.p as { sessionId: string }).sessionId);
      client.close();
    }
    expect(ids.size).toBe(5);
  });

  it("negotiates the highest common major from a wider client range", async () => {
    const client = connect(server.wsUrl);
    await client.opened;
    client.send(helloFrame(undefined, 1, 9));
    expect(parse(await client.next())).toMatchObject({ t: "welcome", p: { protocol: 1 } });
    client.close();
  });
});

describe("unsupported protocol versions", () => {
  it("a hello with no common major → error protocol-unsupported (re = hello id), close 4001", async () => {
    const id = randomUUID();
    const client = connect(server.wsUrl);
    await client.opened;
    client.send(helloFrame(id, 2, 3));
    const msg = parse(await client.next());
    expect(msg).toMatchObject({
      t: "error",
      seq: 1,
      re: id,
      p: { code: "protocol-unsupported", retryable: false },
    });
    expect(await client.closed).toMatchObject({ code: 4001 });
  });

  it("a frame of another major (v: 2) → error protocol-unsupported, close 4001", async () => {
    const client = connect(server.wsUrl);
    await client.opened;
    client.send(helloFrame().replace('{"v":1', '{"v":2'));
    expect(parse(await client.next())).toMatchObject({
      t: "error",
      p: { code: "protocol-unsupported" },
    });
    expect(await client.closed).toMatchObject({ code: 4001 });
  });
});

describe("requests other than hello", () => {
  it("before the handshake: any other valid request closes with 1008 and gets no answer", async () => {
    const client = connect(server.wsUrl);
    await client.opened;
    client.send(
      clientFrame("bet.place", { roundId: ROUND, slot: 0, amountMinor: "500", currency: "AQC" }),
    );
    expect(await client.closed).toMatchObject({ code: 1008, reason: "hello required" });
    expect(client.messages).toEqual([]);
  });

  it.each([
    [
      "bet.place",
      { roundId: ROUND, slot: 0, amountMinor: "500", currency: "AQC" },
      "auth-required",
    ],
    ["bet.cashout", { roundId: ROUND, slot: 1 }, "auth-required"],
    ["bonus.pick", { roundId: ROUND, chestId: 2 }, "auth-required"],
    ["auth.resume", { ticket: "q7Lk2V9xPz4mN8bR1cT6yW" }, "server-busy"],
    ["sync.request", {}, "server-busy"],
    ["ping", { clientTs: 1 }, "server-busy"],
  ])(
    "after the handshake: %s is refused before processing (%s → %s), connection stays open",
    async (t, p, code) => {
      const { client } = await handshake(server.wsUrl);
      const id = randomUUID();
      client.send(clientFrame(t, p, id));
      const msg = parse(await client.next());
      expect(msg).toMatchObject({ t: "error", seq: 2, re: id, p: { code, retryable: true } });
      // Still open: a further request is answered too.
      const id2 = randomUUID();
      client.send(clientFrame(t, p, id2));
      expect(parse(await client.next())).toMatchObject({ t: "error", seq: 3, re: id2 });
      client.close();
      expect(await client.closed).toMatchObject({ code: 1000 });
    },
  );

  it("never sends anything but welcome and error frames (no gameplay or money frame)", async () => {
    const { client } = await handshake(server.wsUrl);
    for (let i = 0; i < 10; i++) {
      client.send(
        clientFrame("bet.place", { roundId: ROUND, slot: 0, amountMinor: "500", currency: "AQC" }),
      );
      client.send(clientFrame("bet.cashout", { roundId: ROUND, slot: 0 }));
    }
    while (client.messages.length < 21) await client.next().catch(() => undefined);
    const types = new Set(client.messages.map((m) => parse(m).t));
    expect([...types].sort()).toEqual(["error", "welcome"]);
    client.close();
  });

  it("a second hello is a protocol fault: error malformed, close 1008", async () => {
    const { client } = await handshake(server.wsUrl);
    const id = randomUUID();
    client.send(helloFrame(id));
    expect(parse(await client.next())).toMatchObject({
      t: "error",
      re: id,
      p: { code: "malformed" },
    });
    expect(await client.closed).toMatchObject({ code: 1008, reason: "duplicate hello" });
  });

  it("an unknown message type: error unknown-type, close 1008", async () => {
    const { client } = await handshake(server.wsUrl);
    client.send(clientFrame("chat.send", { text: "hi" }));
    expect(parse(await client.next())).toMatchObject({ t: "error", p: { code: "unknown-type" } });
    expect(await client.closed).toMatchObject({ code: 1008 });
  });

  it("a request carrying server authority (a multiplier) is malformed: close 1008", async () => {
    const { client } = await handshake(server.wsUrl);
    client.send(clientFrame("bet.cashout", { roundId: ROUND, slot: 0, multiplier: "99" }));
    expect(parse(await client.next())).toMatchObject({ t: "error", p: { code: "malformed" } });
    expect(await client.closed).toMatchObject({ code: 1008 });
  });
});
