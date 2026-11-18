// Test fixture: a real server on an ephemeral loopback port, logs captured in memory.
import type { AddressInfo } from "node:net";
import { buildApp, type ServerApp } from "../../src/app";
import { parseConfig, type ServerConfig } from "../../src/config";

export const TEST_ORIGIN = "http://localhost:5173";

export interface TestServer extends ServerApp {
  readonly config: ServerConfig;
  readonly port: number;
  readonly httpUrl: string;
  readonly wsUrl: string;
  /** Every log line written so far (raw JSON text). */
  readonly logs: string[];
  close(): Promise<void>;
}

/** Valid configuration for tests: ephemeral port, one allowed origin, debug logs. */
export function testConfig(overrides: Record<string, string> = {}): ServerConfig {
  const parsed = parseConfig({
    AQUADIVE_SERVER_PORT: "0",
    AQUADIVE_WS_ALLOWED_ORIGINS: TEST_ORIGIN,
    AQUADIVE_LOG_LEVEL: "debug",
    ...overrides,
  });
  if (!parsed.ok) throw new Error(`invalid test configuration: ${parsed.errors.join("; ")}`);
  return parsed.config;
}

export async function startServer(overrides: Record<string, string> = {}): Promise<TestServer> {
  const config = testConfig(overrides);
  const logs: string[] = [];
  const server = await buildApp(config, {
    logStream: { write: (line: string) => logs.push(line) },
  });
  await server.app.listen({ host: config.host, port: config.port });
  const { port } = server.app.server.address() as AddressInfo;
  return {
    ...server,
    config,
    port,
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    logs,
    close: () => server.app.close(),
  };
}

/** Resolve when `predicate` holds, polling; reject after `timeoutMs`. */
export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not reached in time");
    await new Promise((r) => setTimeout(r, 10));
  }
}
