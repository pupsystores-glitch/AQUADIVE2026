// Application construction, separate from the executable entrypoint (P8-2).
//
// `buildApp` creates a configured Fastify instance without listening, so
// integration tests start it on an ephemeral loopback port and close it
// again. `main.ts` is the only place that reads the environment, listens and
// handles signals.

import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config";
import { registerGateway, type GatewayHandle } from "./gateway/server";
import { registerErrorHandlers } from "./http/error-handlers";
import { registerHealthRoutes } from "./http/health";
import { loggerOptions, type LogDestination } from "./ops/logger";
import { Readiness } from "./ops/readiness";

/** HTTP limits: no route accepts a body, and slow or idle HTTP clients are cut off. */
export const HTTP_LIMITS = {
  bodyLimitBytes: 1024,
  requestTimeoutMs: 10_000,
  keepAliveTimeoutMs: 5_000,
} as const;

/** Headers on every HTTP response. */
const RESPONSE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export interface AppOptions {
  /** Capture log lines instead of writing them to stdout (tests). */
  readonly logStream?: LogDestination;
}

export interface ServerApp {
  readonly app: FastifyInstance;
  readonly readiness: Readiness;
  readonly gateway: GatewayHandle;
}

export async function buildApp(config: ServerConfig, options: AppOptions = {}): Promise<ServerApp> {
  const app = Fastify({
    logger: loggerOptions(config.logLevel, options.logStream),
    bodyLimit: HTTP_LIMITS.bodyLimitBytes,
    requestTimeout: HTTP_LIMITS.requestTimeoutMs,
    keepAliveTimeout: HTTP_LIMITS.keepAliveTimeoutMs,
    trustProxy: false,
    return503OnClosing: true,
  });
  const readiness = new Readiness();

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.headers(RESPONSE_HEADERS);
    return payload;
  });
  registerErrorHandlers(app);
  registerHealthRoutes(app, readiness);
  const gateway = await registerGateway(app, { config, readiness });

  return { app, readiness, gateway };
}
