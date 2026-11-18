// Server configuration (P8-2 test 1).
import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  isCanonicalOrigin,
  isLoopbackHost,
  parseConfig,
  SERVER_TICK_HZ,
} from "../src/config";
import { MAX_TICK_HZ } from "../src/protocol";

const errorsOf = (env: Record<string, string>) => {
  const r = parseConfig(env);
  if (r.ok) throw new Error("expected invalid configuration");
  return r.errors;
};

describe("parseConfig", () => {
  it("defaults: loopback, no origin allowed, bounded, 60 Hz", () => {
    const r = parseConfig({});
    expect(r).toEqual({
      ok: true,
      config: {
        host: "127.0.0.1",
        port: DEFAULTS.port,
        logLevel: "info",
        allowedOrigins: [],
        maxConnections: 1000,
        maxConnectionsPerIp: 32,
        helloTimeoutMs: 5000,
        messageRatePerSecond: 30,
        messageBurst: 60,
        heartbeatIntervalMs: 10_000,
        shutdownGraceMs: 10_000,
        tickHz: 60,
      },
    });
  });

  it("ignores unrelated environment variables", () => {
    expect(parseConfig({ PATH: "x", HOME: "y", NODE_ENV: "production" }).ok).toBe(true);
  });

  it("reads every setting", () => {
    const r = parseConfig({
      AQUADIVE_SERVER_HOST: "::1",
      AQUADIVE_SERVER_PORT: "9000",
      AQUADIVE_LOG_LEVEL: "warn",
      AQUADIVE_WS_ALLOWED_ORIGINS: " https://play.example.test , http://localhost:5173 ",
      AQUADIVE_WS_MAX_CONNECTIONS: "10",
      AQUADIVE_WS_MAX_CONNECTIONS_PER_IP: "3",
      AQUADIVE_WS_HELLO_TIMEOUT_MS: "250",
      AQUADIVE_WS_MESSAGE_RATE_PER_SECOND: "5",
      AQUADIVE_WS_MESSAGE_BURST: "8",
      AQUADIVE_WS_HEARTBEAT_INTERVAL_MS: "500",
      AQUADIVE_SHUTDOWN_GRACE_MS: "0",
    });
    expect(r).toMatchObject({
      ok: true,
      config: {
        host: "::1",
        port: 9000,
        logLevel: "warn",
        allowedOrigins: ["https://play.example.test", "http://localhost:5173"],
        maxConnections: 10,
        maxConnectionsPerIp: 3,
        helloTimeoutMs: 250,
        messageRatePerSecond: 5,
        messageBurst: 8,
        heartbeatIntervalMs: 500,
        shutdownGraceMs: 0,
      },
    });
  });

  it("refuses a non-loopback bind unless explicitly allowed", () => {
    expect(errorsOf({ AQUADIVE_SERVER_HOST: "0.0.0.0" })[0]).toMatch(
      /^AQUADIVE_SERVER_HOST: not a loopback address/,
    );
    expect(errorsOf({ AQUADIVE_SERVER_HOST: "192.168.1.10" }).length).toBe(1);
    const r = parseConfig({
      AQUADIVE_SERVER_HOST: "0.0.0.0",
      AQUADIVE_SERVER_ALLOW_NON_LOOPBACK: "true",
    });
    expect(r).toMatchObject({ ok: true, config: { host: "0.0.0.0" } });
  });

  it.each([
    ["AQUADIVE_SERVER_HOST", "example.com"],
    ["AQUADIVE_SERVER_PORT", "65536"],
    ["AQUADIVE_SERVER_PORT", "-1"],
    ["AQUADIVE_SERVER_PORT", "80.5"],
    ["AQUADIVE_SERVER_PORT", "0080"],
    ["AQUADIVE_SERVER_PORT", ""],
    ["AQUADIVE_SERVER_ALLOW_NON_LOOPBACK", "yes"],
    ["AQUADIVE_LOG_LEVEL", "verbose"],
    ["AQUADIVE_WS_ALLOWED_ORIGINS", "*"],
    ["AQUADIVE_WS_ALLOWED_ORIGINS", "null"],
    ["AQUADIVE_WS_ALLOWED_ORIGINS", "http://localhost:5173/"],
    ["AQUADIVE_WS_ALLOWED_ORIGINS", "http://LOCALHOST:5173"],
    ["AQUADIVE_WS_ALLOWED_ORIGINS", "ws://localhost:5173"],
    ["AQUADIVE_WS_ALLOWED_ORIGINS", "http://localhost:5173/path"],
    ["AQUADIVE_WS_MAX_CONNECTIONS", "0"],
    ["AQUADIVE_WS_HELLO_TIMEOUT_MS", "10"],
    ["AQUADIVE_WS_MESSAGE_RATE_PER_SECOND", "0"],
  ])("rejects %s=%j", (name, value) => {
    const errors = errorsOf({ [name]: value });
    expect(errors.length).toBeGreaterThan(0);
    // "NAME: …", or "NAME.<index>: …" for one entry of a list.
    expect(errors[0]).toMatch(new RegExp(`^${name}(\\.\\d+)?: `));
  });

  it("rejects inconsistent limits", () => {
    expect(
      errorsOf({ AQUADIVE_WS_MAX_CONNECTIONS: "5", AQUADIVE_WS_MAX_CONNECTIONS_PER_IP: "6" }),
    ).toEqual(["AQUADIVE_WS_MAX_CONNECTIONS_PER_IP: greater than AQUADIVE_WS_MAX_CONNECTIONS"]);
    expect(
      errorsOf({ AQUADIVE_WS_MESSAGE_RATE_PER_SECOND: "10", AQUADIVE_WS_MESSAGE_BURST: "5" }),
    ).toEqual(["AQUADIVE_WS_MESSAGE_BURST: smaller than AQUADIVE_WS_MESSAGE_RATE_PER_SECOND"]);
  });

  it("rejects unknown AQUADIVE_ variables (typos never fall back to defaults)", () => {
    expect(errorsOf({ AQUADIVE_SERVER_PROT: "1" })).toEqual([
      "AQUADIVE_SERVER_PROT: unknown variable",
    ]);
  });

  it("never echoes a value in an error message", () => {
    const secret = "s3cr3t-Value-42";
    const errors = errorsOf({
      AQUADIVE_SERVER_HOST: secret,
      AQUADIVE_SERVER_PORT: secret,
      AQUADIVE_LOG_LEVEL: secret,
      AQUADIVE_WS_ALLOWED_ORIGINS: secret,
      AQUADIVE_WS_MAX_CONNECTIONS: secret,
      AQUADIVE_SERVER_ALLOW_NON_LOOPBACK: secret,
    });
    expect(errors.length).toBeGreaterThanOrEqual(6);
    for (const e of errors) expect(e).not.toContain(secret);
  });

  it("the announced tick rate is 60 Hz and within the protocol's bound", () => {
    expect(SERVER_TICK_HZ).toBe(60);
    expect(SERVER_TICK_HZ).toBeLessThanOrEqual(MAX_TICK_HZ);
  });
});

describe("helpers", () => {
  it.each([
    ["127.0.0.1", true],
    ["127.10.0.1", true],
    ["::1", true],
    ["localhost", true],
    ["0.0.0.0", false],
    ["::", false],
    ["10.0.0.1", false],
    ["127.example", false],
  ])("isLoopbackHost(%j) = %s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });

  it.each([
    ["http://localhost:5173", true],
    ["https://play.example.test", true],
    ["https://play.example.test:443", false],
    ["https://user@play.example.test", false],
    ["file:///x", false],
    ["", false],
  ])("isCanonicalOrigin(%j) = %s", (origin, expected) => {
    expect(isCanonicalOrigin(origin)).toBe(expected);
  });
});
