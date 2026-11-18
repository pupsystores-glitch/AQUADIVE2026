// HTTP: health endpoints, fixed error bodies, headers, log redaction (P8-2 tests 2, part of 17).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorKind } from "../src/http/error-handlers";
import { pathOnly, REDACTED } from "../src/ops/logger";
import { startServer, type TestServer } from "./helpers/server";

let server: TestServer;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

describe("health", () => {
  it("GET /health/live → 200 {status: live}", async () => {
    const res = await fetch(`${server.httpUrl}/health/live`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "live" });
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("GET /health/ready → 200 while serving, 503 while draining", async () => {
    let res = await fetch(`${server.httpUrl}/health/ready`);
    expect([res.status, await res.json()]).toEqual([200, { status: "ready" }]);
    server.readiness.markDraining();
    res = await fetch(`${server.httpUrl}/health/ready`);
    expect([res.status, await res.json()]).toEqual([503, { status: "draining" }]);
  });

  it("health bodies carry no version, configuration or counters", async () => {
    for (const path of ["/health/live", "/health/ready"]) {
      const body = (await (await fetch(`${server.httpUrl}${path}`)).json()) as object;
      expect(Object.keys(body)).toEqual(["status"]);
    }
  });

  it("HEAD works without a body", async () => {
    const res = await fetch(`${server.httpUrl}/health/live`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});

describe("errors", () => {
  it("unknown path → 404 with a fixed body", async () => {
    const res = await fetch(`${server.httpUrl}/admin?x=<script>`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not-found" });
  });

  it("a plain GET on the WebSocket path → 404", async () => {
    const res = await fetch(`${server.httpUrl}/ws`);
    expect(res.status).toBe(404);
  });

  it("a body on a route that takes none is refused without echoing it", async () => {
    const res = await fetch(`${server.httpUrl}/health/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"__proto__": {"polluted": true}, "secret": "canary-body-123"}',
    });
    // Fastify's JSON parser refuses a `__proto__` key (400) before routing.
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "bad-request" });
    expect(text).not.toContain("canary-body-123");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("an oversized body is refused before routing", async () => {
    const res = await fetch(`${server.httpUrl}/health/live`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x: "a".repeat(4096) }),
    });
    expect([404, 413]).toContain(res.status);
  });

  it("errorKind maps statuses to fixed kinds", () => {
    expect([
      errorKind(403),
      errorKind(404),
      errorKind(503),
      errorKind(500),
      errorKind(418),
    ]).toEqual(["forbidden", "not-found", "unavailable", "internal", "bad-request"]);
  });
});

describe("logging", () => {
  it("logs are JSON lines; query strings and credential headers never reach them", async () => {
    await fetch(`${server.httpUrl}/health/live?ticket=canary-ticket-123`, {
      headers: { cookie: "sid=canary-cookie-123", authorization: "Bearer canary-auth-123" },
    });
    const text = server.logs.join("");
    for (const line of server.logs) expect(() => JSON.parse(line)).not.toThrow();
    expect(text).toContain('"url":"/health/live"');
    for (const canary of ["canary-ticket-123", "canary-cookie-123", "canary-auth-123"]) {
      expect(text).not.toContain(canary);
    }
  });

  it("redaction replaces credentials in any logged object", () => {
    server.app.log.info(
      {
        ticket: "canary-a",
        token: "canary-b",
        nested: { password: "canary-c" },
        headers: { cookie: "canary-d", authorization: "canary-e" },
      },
      "redaction probe",
    );
    const line = server.logs.find((l) => l.includes("redaction probe"))!;
    for (const canary of ["canary-a", "canary-b", "canary-c", "canary-d", "canary-e"]) {
      expect(line).not.toContain(canary);
    }
    expect(line).toContain(REDACTED);
  });

  it("pathOnly strips query and fragment", () => {
    expect([pathOnly("/a?b=c"), pathOnly("/a#x"), pathOnly("/a"), pathOnly(undefined)]).toEqual([
      "/a",
      "/a",
      "/a",
      undefined,
    ]);
  });
});
