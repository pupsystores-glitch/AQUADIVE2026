// Gateway security and connection lifecycle (P8-2 tests 7 – 10, 12 – 17).
import { afterEach, describe, expect, it } from "vitest";
// The client-side decoder: tests read server frames as a client would.
import { decodeServerFrame, MAX_CLIENT_FRAME_BYTES } from "../../src/protocol";
import { clientFrame, connect, handshake, helloFrame } from "./helpers/client";
import { clientFrameBytes, OPCODE, rawUpgrade } from "./helpers/raw";
import { startServer, TEST_ORIGIN, waitFor, type TestServer } from "./helpers/server";

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const start = async (env: Record<string, string> = {}) => (server = await startServer(env));
const errorCode = (frame: string) => {
  const d = decodeServerFrame(frame);
  return d.ok && d.msg.t === "error" ? d.msg.p.code : null;
};

/** Open a connection and send one raw text frame before any hello. */
async function sendFirst(s: TestServer, text: string) {
  const client = connect(s.wsUrl);
  expect(await client.opened).toBe(true);
  client.send(text);
  return client;
}

describe("hostile frames (each closes only its own connection)", () => {
  it.each([
    ["not JSON", "{not json", "malformed", 1008],
    ["JSON array", "[1,2,3]", "malformed", 1008],
    ["empty text", "", "malformed", 1008],
    ["missing request id", '{"v":1,"t":"hello","p":{}}', "malformed", 1008],
    ["extra envelope field", helloFrame().replace('{"v":1', '{"x":1,"v":1'), "malformed", 1008],
    // The envelope is depth 1; six arrays inside it make depth 7 (limit 6).
    [
      "nesting depth 7",
      `{"v":1,"t":"hello","id":"x","p":${"[".repeat(6)}${"]".repeat(6)}}`,
      "malformed",
      1008,
    ],
    [
      "`__proto__` key",
      helloFrame().replace('"p":{', '"p":{"__proto__":{"polluted":true},'),
      "malformed",
      1008,
    ],
    [
      "`constructor` key",
      helloFrame().replace('"p":{', '"p":{"constructor":{"prototype":{"x":1}},'),
      "malformed",
      1008,
    ],
    ["lone surrogate", helloFrame().replace("test.1", "\ud800"), "malformed", 1008],
  ])("%s → error %s, close %i", async (_name, text, code, close) => {
    const s = await start();
    const client = await sendFirst(s, text);
    const closed = await client.closed;
    expect(closed.code).toBe(close);
    if (client.messages.length > 0) expect(errorCode(client.messages[0]!)).toBe(code);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("x");
  });

  it("malformed frames answer error malformed before closing", async () => {
    const s = await start();
    const client = await sendFirst(s, "{not json");
    expect(errorCode(await client.next())).toBe("malformed");
    expect(await client.closed).toMatchObject({ code: 1008, reason: "malformed" });
  });

  it("a frame of exactly the size limit is decoded; one byte more closes with 1009", async () => {
    const s = await start();
    const pad = (n: number) => {
      const base = helloFrame();
      // Inserting `"pad":"<k chars>",` adds k + 9 characters (all ASCII).
      return base.replace('"p":{', `"p":{"pad":"${"a".repeat(n - base.length - 9)}",`);
    };
    const atLimit = pad(MAX_CLIENT_FRAME_BYTES);
    expect(Buffer.byteLength(atLimit)).toBe(MAX_CLIENT_FRAME_BYTES);
    const a = await sendFirst(s, atLimit);
    // Decoded (and refused as malformed: `pad` is not a hello field), not cut off by size.
    expect(errorCode(await a.next())).toBe("malformed");
    expect(await a.closed).toMatchObject({ code: 1008 });

    const b = await sendFirst(s, pad(MAX_CLIENT_FRAME_BYTES + 1));
    expect(await b.closed).toMatchObject({ code: 1009 });
    expect(b.messages).toEqual([]);
  });

  it("a declared 1 GiB frame is refused from its header (1009), without waiting for the body", async () => {
    const s = await start();
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    expect(raw.status).toBe(101);
    raw.socket.write(clientFrameBytes(OPCODE.TEXT, Buffer.from("{"), { declaredLength: 2 ** 30 }));
    expect(await raw.closeCode).toBe(1009);
  });

  it("oversized fragmented messages are refused (1009)", async () => {
    const s = await start();
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    const chunk = Buffer.alloc(2048, 0x61);
    raw.socket.write(clientFrameBytes(OPCODE.TEXT, chunk, { fin: false }));
    raw.socket.write(clientFrameBytes(OPCODE.CONTINUATION, chunk, { fin: false }));
    raw.socket.write(clientFrameBytes(OPCODE.CONTINUATION, chunk, { fin: true }));
    expect(await raw.closeCode).toBe(1009);
  });

  it("invalid UTF-8 in a text frame closes with 1007 (rejected by ws)", async () => {
    const s = await start();
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    raw.socket.write(clientFrameBytes(OPCODE.TEXT, Buffer.from([0x7b, 0xff, 0xfe, 0x7d])));
    expect(await raw.closeCode).toBe(1007);
  });

  it("a binary frame → error malformed, close 1003", async () => {
    const s = await start();
    const client = connect(s.wsUrl);
    await client.opened;
    client.send(new TextEncoder().encode(helloFrame()).buffer as ArrayBuffer);
    expect(errorCode(await client.next())).toBe("malformed");
    expect(await client.closed).toMatchObject({ code: 1003 });
  });

  it("raw garbage instead of a WebSocket frame ends the connection", async () => {
    const s = await start();
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    raw.socket.write(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x01, 0x02]));
    await raw.ended;
    await waitFor(() => s.gateway.connectionCount() === 0);
  });

  it("an unmasked client frame is refused (1002, ws)", async () => {
    const s = await start();
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    raw.socket.write(Buffer.from([0x81, 0x01, 0x7b]));
    expect(await raw.closeCode).toBe(1002);
  });
});

describe("handshake timeout", () => {
  it("no hello within the timeout → close 1008", async () => {
    const s = await start({ AQUADIVE_WS_HELLO_TIMEOUT_MS: "200" });
    const client = connect(s.wsUrl);
    await client.opened;
    const t0 = Date.now();
    expect(await client.closed).toMatchObject({ code: 1008, reason: "hello timeout" });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150);
    expect(client.messages).toEqual([]);
  });

  it("a completed handshake is not closed by the hello timeout", async () => {
    const s = await start({ AQUADIVE_WS_HELLO_TIMEOUT_MS: "200" });
    const { client } = await handshake(s.wsUrl);
    await new Promise((r) => setTimeout(r, 400));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.close();
  });
});

describe("Origin policy", () => {
  it.each([
    ["missing", null],
    ["another site", "https://evil.example.test"],
    ["the literal null origin", "null"],
    ["a longer port", "http://localhost:51730"],
    ["a suffix", "http://localhost:5173.evil.test"],
    ["another scheme", "https://localhost:5173"],
  ])("%s → HTTP 403 at the upgrade, no WebSocket", async (_name, origin) => {
    const s = await start();
    const headers: Record<string, string> = origin === null ? {} : { Origin: origin };
    const raw = await rawUpgrade(s.port, headers);
    expect(raw.status).toBe(403);
    await raw.ended;
    expect(s.gateway.connectionCount()).toBe(0);
  });

  it("the allowed origin upgrades (101)", async () => {
    const s = await start();
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    expect(raw.status).toBe(101);
    raw.socket.destroy();
  });

  it("with no configured origin (the default) every upgrade is refused", async () => {
    const s = await start({ AQUADIVE_WS_ALLOWED_ORIGINS: "" });
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    expect(raw.status).toBe(403);
  });
});

describe("connection limits", () => {
  it("per address: the connection over the limit gets HTTP 503; a slot frees on close", async () => {
    const s = await start({
      AQUADIVE_WS_MAX_CONNECTIONS: "10",
      AQUADIVE_WS_MAX_CONNECTIONS_PER_IP: "2",
    });
    const a = connect(s.wsUrl);
    const b = connect(s.wsUrl);
    expect([await a.opened, await b.opened]).toEqual([true, true]);
    await waitFor(() => s.gateway.connectionCount() === 2);
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    expect(raw.status).toBe(503);
    a.close();
    await waitFor(() => s.gateway.connectionCount() === 1);
    const c = connect(s.wsUrl);
    expect(await c.opened).toBe(true);
    b.close();
    c.close();
  });

  it("total: the server never holds more than its limit", async () => {
    const s = await start({
      AQUADIVE_WS_MAX_CONNECTIONS: "3",
      AQUADIVE_WS_MAX_CONNECTIONS_PER_IP: "3",
    });
    const clients = Array.from({ length: 8 }, () => connect(s.wsUrl));
    const opened = await Promise.all(clients.map((c) => c.opened));
    // Some may open and be closed with 1013 when several upgrades race past the HTTP check.
    await new Promise((r) => setTimeout(r, 200));
    expect(s.gateway.connectionCount()).toBeLessThanOrEqual(3);
    expect(opened.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    clients.forEach((c) => c.close());
    await waitFor(() => s.gateway.connectionCount() === 0);
  });
});

describe("rate limit", () => {
  it("frames above the burst → error rate-limited, close 4008", async () => {
    const s = await start({
      AQUADIVE_WS_MESSAGE_RATE_PER_SECOND: "5",
      AQUADIVE_WS_MESSAGE_BURST: "5",
    });
    const { client } = await handshake(s.wsUrl); // hello used one token
    for (let i = 0; i < 10; i++) client.send(clientFrame("ping", { clientTs: i }));
    const closed = await client.closed;
    expect(closed.code).toBe(4008);
    const codes = client.messages.slice(1).map(errorCode);
    expect(codes.slice(0, 4)).toEqual(["server-busy", "server-busy", "server-busy", "server-busy"]);
    expect(codes[4]).toBe("rate-limited");
    expect(codes.length).toBe(5); // nothing after the limit
  });

  it("malformed frames count against the limit too (before decoding)", async () => {
    const s = await start({
      AQUADIVE_WS_MESSAGE_RATE_PER_SECOND: "1",
      AQUADIVE_WS_MESSAGE_BURST: "1",
    });
    const { client } = await handshake(s.wsUrl);
    client.send("{not json");
    expect(errorCode(await client.next())).toBe("rate-limited");
    expect(await client.closed).toMatchObject({ code: 4008 });
  });

  it("a client within the rate is never limited", async () => {
    const s = await start({
      AQUADIVE_WS_MESSAGE_RATE_PER_SECOND: "20",
      AQUADIVE_WS_MESSAGE_BURST: "20",
    });
    const { client } = await handshake(s.wsUrl);
    for (let i = 0; i < 10; i++) {
      client.send(clientFrame("ping", { clientTs: i }));
      expect(errorCode(await client.next())).toBe("server-busy");
      await new Promise((r) => setTimeout(r, 60));
    }
    client.close();
  });
});

describe("heartbeat", () => {
  it("a peer that never answers pings is disconnected", async () => {
    const s = await start({
      AQUADIVE_WS_HEARTBEAT_INTERVAL_MS: "100",
      AQUADIVE_WS_HELLO_TIMEOUT_MS: "60000",
    });
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
    expect(raw.status).toBe(101);
    const t0 = Date.now();
    await raw.ended;
    expect(Date.now() - t0).toBeLessThan(2000);
    await waitFor(() => s.gateway.connectionCount() === 0);
  });

  it("a peer that answers pings stays connected", async () => {
    const s = await start({ AQUADIVE_WS_HEARTBEAT_INTERVAL_MS: "100" });
    const { client } = await handshake(s.wsUrl);
    await new Promise((r) => setTimeout(r, 500));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.close();
  });
});

describe("cleanup and stability", () => {
  it("200 connect / hello / close cycles leave nothing behind", async () => {
    const s = await start({
      AQUADIVE_WS_MESSAGE_RATE_PER_SECOND: "1000",
      AQUADIVE_WS_MESSAGE_BURST: "1000",
    });
    for (let i = 0; i < 200; i++) {
      const { client } = await handshake(s.wsUrl);
      client.close();
      await client.closed;
    }
    await waitFor(() => s.gateway.connectionCount() === 0);
    expect(s.gateway.addressCount()).toBe(0);
  });

  it("abrupt TCP disconnects (mid-handshake and after) are cleaned up", async () => {
    const s = await start();
    for (let i = 0; i < 20; i++) {
      const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
      if (i % 2 === 0) raw.socket.write(clientFrameBytes(OPCODE.TEXT, Buffer.from(helloFrame())));
      raw.socket.destroy();
    }
    // A half-sent upgrade request.
    const { connect: tcp } = await import("node:net");
    const half = tcp(s.port, "127.0.0.1");
    half.on("error", () => undefined);
    half.write("GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\n");
    half.destroy();
    await waitFor(() => s.gateway.connectionCount() === 0);
    expect(s.gateway.addressCount()).toBe(0);
  });

  it("after a barrage of hostile clients the server still serves health and handshakes", async () => {
    const s = await start({ AQUADIVE_WS_MAX_CONNECTIONS_PER_IP: "100" });
    const hostile: Array<Promise<unknown>> = [];
    for (let i = 0; i < 30; i++) {
      const c = connect(s.wsUrl);
      hostile.push(
        c.opened.then(() => {
          const kind = i % 6;
          if (kind === 0) c.send("{oops");
          else if (kind === 1) c.send("x".repeat(MAX_CLIENT_FRAME_BYTES + 100));
          else if (kind === 2) c.send(helloFrame().replace('"p":{', '"p":{"__proto__":{},'));
          else if (kind === 3) c.send(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer);
          else if (kind === 4)
            for (let k = 0; k < 200; k++) c.send(clientFrame("ping", { clientTs: k }));
          else c.socket.close();
          return c.closed;
        }),
      );
      const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN });
      raw.socket.write(
        clientFrameBytes(OPCODE.TEXT, Buffer.from("x"), { declaredLength: 2 ** 40 }),
      );
      hostile.push(raw.closeCode);
    }
    await Promise.all(hostile);
    await waitFor(() => s.gateway.connectionCount() === 0);

    expect((await fetch(`${s.httpUrl}/health/live`)).status).toBe(200);
    expect((await fetch(`${s.httpUrl}/health/ready`)).status).toBe(200);
    const { client, welcome } = await handshake(s.wsUrl);
    expect(welcome.t).toBe("welcome");
    client.close();
  });
});

describe("logs", () => {
  it("never contain frame contents or credentials sent at the upgrade", async () => {
    const s = await start();
    const { client } = await handshake(s.wsUrl, {
      headers: { cookie: "sid=canary-cookie-9", authorization: "Bearer canary-auth-9" },
    });
    client.send(clientFrame("auth.resume", { ticket: "canaryTicketValue0123456789" }));
    await client.next();
    client.send('{"v":1,"t":"hello","canary-frame-9":1}');
    await client.closed;
    const raw = await rawUpgrade(s.port, { Origin: TEST_ORIGIN }, "/ws?ticket=canary-query-9");
    raw.socket.destroy();
    await waitFor(() => s.gateway.connectionCount() === 0);
    const text = s.logs.join("");
    for (const canary of [
      "canary-cookie-9",
      "canary-auth-9",
      "canaryTicketValue",
      "canary-frame-9",
      "canary-query-9",
    ]) {
      expect(text).not.toContain(canary);
    }
    expect(text).toContain("handshake complete");
  });
});
