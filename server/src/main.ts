// Executable entrypoint (P8-2): read the environment, build the app, listen, handle signals.
//
// Invalid configuration ends the process with exit code 1 and one JSON line
// on stderr naming the offending variables (never their values). SIGINT and
// SIGTERM start a graceful shutdown (ops/shutdown.ts).

import { buildApp } from "./app";
import { parseConfig } from "./config";
import { createShutdown } from "./ops/shutdown";

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

function writeFatal(msg: string, extra: Record<string, unknown> = {}): void {
  process.stderr.write(`${JSON.stringify({ level: "fatal", time: Date.now(), msg, ...extra })}\n`);
}

async function main(): Promise<void> {
  const parsed = parseConfig(process.env);
  if (!parsed.ok) {
    writeFatal("invalid configuration", { errors: parsed.errors });
    process.exitCode = 1;
    return;
  }
  const { config } = parsed;
  const { app, readiness } = await buildApp(config);

  const shutdown = createShutdown({
    app,
    readiness,
    graceMs: config.shutdownGraceMs,
    log: app.log,
    exit: (code) => process.exit(code),
  });
  for (const signal of SHUTDOWN_SIGNALS) process.once(signal, () => void shutdown(signal));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.fatal({ err }, "listen failed");
    process.exitCode = 1;
    await app.close();
  }
}

main().catch((err: unknown) => {
  writeFatal("startup failed", { error: err instanceof Error ? err.name : "unknown" });
  process.exitCode = 1;
});
