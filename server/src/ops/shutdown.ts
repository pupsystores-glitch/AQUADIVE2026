// Graceful shutdown (P8-2; docs/09 §29 P8-2 "SIGTERM drains").
//
// The first call marks the process as draining (`/health/ready` → 503, new
// upgrades refused), then closes Fastify: the gateway closes every WebSocket
// with 1001 and the HTTP server stops accepting. If that does not finish
// within the grace period the process exits with 1. Later calls return the
// same promise.

import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Readiness } from "./readiness";

export interface ShutdownDeps {
  readonly app: FastifyInstance;
  readonly readiness: Readiness;
  readonly graceMs: number;
  readonly log: FastifyBaseLogger;
  /** Ends the process (injected so tests can observe it). */
  readonly exit: (code: number) => void;
}

export function createShutdown(deps: ShutdownDeps): (reason: string) => Promise<void> {
  let running: Promise<void> | undefined;

  const run = async (reason: string): Promise<void> => {
    deps.readiness.markDraining();
    deps.log.info({ reason }, "shutdown started");
    const deadline = setTimeout(() => {
      deps.log.error({ graceMs: deps.graceMs }, "shutdown grace period exceeded");
      deps.exit(1);
    }, deps.graceMs);
    deadline.unref();
    try {
      await deps.app.close();
      clearTimeout(deadline);
      deps.log.info("shutdown complete");
      deps.exit(0);
    } catch (err) {
      clearTimeout(deadline);
      deps.log.error({ err }, "shutdown failed");
      deps.exit(1);
    }
  };

  return (reason) => (running ??= run(reason));
}
