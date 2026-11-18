// Startup, graceful shutdown and the executable entrypoint (P8-2 test 3).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createShutdown } from "../src/ops/shutdown";
import { connect, handshake } from "./helpers/client";
import { rawUpgrade } from "./helpers/raw";
import { startServer, TEST_ORIGIN, waitFor } from "./helpers/server";

const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
const TSX_CLI = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));

describe("graceful shutdown", () => {
  it("drains: ready → 503, every WebSocket closed with 1001, HTTP stops, exit 0", async () => {
    const server = await startServer();
    const { client: a } = await handshake(server.wsUrl);
    const b = connect(server.wsUrl); // still awaiting hello
    expect(await b.opened).toBe(true);
    await waitFor(() => server.gateway.connectionCount() === 2);

    const exits: number[] = [];
    const shutdown = createShutdown({
      app: server.app,
      readiness: server.readiness,
      graceMs: 5000,
      log: server.app.log,
      exit: (code) => exits.push(code),
    });
    const first = shutdown("test");
    expect(shutdown("again")).toBe(first); // idempotent
    expect(server.readiness.ready).toBe(false);
    await first;

    expect(await a.closed).toMatchObject({ code: 1001 });
    expect(await b.closed).toMatchObject({ code: 1001 });
    expect(server.gateway.connectionCount()).toBe(0);
    expect(exits).toEqual([0]);
    await expect(fetch(`${server.httpUrl}/health/live`)).rejects.toThrow();
  });

  it("exits 1 when closing exceeds the grace period", async () => {
    const exits: number[] = [];
    let release!: () => void;
    const stuck = new Promise<void>((r) => (release = r));
    const fakeApp = { close: () => stuck } as never;
    const shutdown = createShutdown({
      app: fakeApp,
      readiness: { markDraining: () => undefined } as never,
      graceMs: 50,
      log: { info: () => undefined, error: () => undefined } as never,
      exit: (code) => exits.push(code),
    });
    const done = shutdown("test");
    await waitFor(() => exits.length > 0);
    expect(exits).toEqual([1]);
    release();
    await done;
  });

  it("an upgrade during draining is refused with 503", async () => {
    const server = await startServer();
    server.readiness.markDraining();
    const raw = await rawUpgrade(server.port, { Origin: TEST_ORIGIN });
    expect(raw.status).toBe(503);
    const client = connect(server.wsUrl);
    expect(await client.opened).toBe(false);
    await server.close();
  });
});

const runMain = (env: Record<string, string>) =>
  spawn(process.execPath, [TSX_CLI, "src/main.ts"], {
    cwd: SERVER_DIR,
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

describe("entrypoint (src/main.ts)", () => {
  it("invalid configuration: exit 1, one JSON line naming the variable, no value", async () => {
    const child = runMain({ AQUADIVE_SERVER_PORT: "canary-port-value" });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const code = await new Promise<number | null>((r) => child.on("exit", r));
    expect(code).toBe(1);
    const line = JSON.parse(stderr.trim()) as { level: string; msg: string; errors: string[] };
    expect(line).toMatchObject({ level: "fatal", msg: "invalid configuration" });
    expect(line.errors[0]).toMatch(/^AQUADIVE_SERVER_PORT: /);
    expect(stderr).not.toContain("canary-port-value");
  });

  it("valid configuration: listens on loopback and serves health", async () => {
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    const child = runMain({ AQUADIVE_SERVER_PORT: String(port) });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    try {
      await waitFor(() => stdout.includes("Server listening"), 15_000);
      expect(stdout).toContain(`http://127.0.0.1:${port}`);
      const res = await fetch(`http://127.0.0.1:${port}/health/live`);
      expect(res.status).toBe(200);
    } finally {
      child.kill();
      await new Promise((r) => child.on("exit", r));
    }
  });
});
