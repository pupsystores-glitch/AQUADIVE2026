// Structured logging options for Fastify's built-in pino logger (P8-2; docs/09 §23.2).
//
// JSON lines to stdout. Redaction covers credentials a client could send
// (cookies, authorization headers, tickets, tokens) wherever they appear in a
// logged object, and the request serializer logs the path without its query
// string, so a token placed in a URL never reaches the log. The gateway never
// logs frame contents (see gateway/connection.ts).

import type { FastifyLoggerOptions, FastifyServerOptions } from "fastify";
import type { LogLevel } from "../config";

/** Where log lines go when not stdout (tests capture them). */
export type LogDestination = NonNullable<FastifyLoggerOptions["stream"]>;

/** The text that replaces a redacted value. */
export const REDACTED = "[redacted]";

/** Paths pino replaces with `REDACTED` (docs/09 §23.2 redaction list, P8-2 subset). */
export const REDACT_PATHS: readonly string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['sec-websocket-protocol']",
  "headers.authorization",
  "headers.cookie",
  "authorization",
  "cookie",
  "ticket",
  "token",
  "password",
  "*.ticket",
  "*.token",
  "*.password",
];

interface RequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly ip?: string;
}

/** The request path without its query string or fragment. */
export function pathOnly(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Fastify `logger` options; `stream` lets tests capture the lines. */
export function loggerOptions(
  level: LogLevel,
  stream?: LogDestination,
): NonNullable<FastifyServerOptions["logger"]> {
  return {
    level,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    serializers: {
      req: (req: RequestLike) => ({
        method: req.method,
        url: pathOnly(req.url),
        remoteAddress: req.ip,
      }),
    },
    ...(stream ? { stream } : {}),
  };
}
