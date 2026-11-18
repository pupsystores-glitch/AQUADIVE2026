// Health endpoints (P8-2; docs/09 §23.4).
//
// `GET /health/live`: the process is up and serving HTTP.
// `GET /health/ready`: the process accepts new WebSocket connections (503 while
// draining). Neither response carries versions, configuration, counts or any
// other detail an unauthenticated caller does not need.

import type { FastifyInstance } from "fastify";
import type { Readiness } from "../ops/readiness";

export const HEALTH_LIVE_PATH = "/health/live";
export const HEALTH_READY_PATH = "/health/ready";

export function registerHealthRoutes(app: FastifyInstance, readiness: Readiness): void {
  app.get(HEALTH_LIVE_PATH, async () => ({ status: "live" }));

  app.get(HEALTH_READY_PATH, async (_request, reply) => {
    if (readiness.ready) return { status: "ready" };
    return reply.code(503).send({ status: "draining" });
  });
}
