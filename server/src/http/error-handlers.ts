// HTTP error and not-found handling (P8-2).
//
// Every failure answers with a fixed JSON body (`{ "error": "<kind>" }`) and
// never with a message, stack trace or echo of the request. The log line
// records the status and Fastify's error code only: an error message can
// quote client input (for example a parser error).

import type { FastifyError, FastifyInstance } from "fastify";

const ERROR_KINDS: Readonly<Record<number, string>> = {
  400: "bad-request",
  403: "forbidden",
  404: "not-found",
  405: "method-not-allowed",
  408: "request-timeout",
  413: "payload-too-large",
  415: "unsupported-media-type",
  429: "too-many-requests",
  503: "unavailable",
};

/** The fixed body kind for a status code. */
export function errorKind(status: number): string {
  return ERROR_KINDS[status] ?? (status >= 500 ? "internal" : "bad-request");
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    const entry = { statusCode: status, code: error.code };
    if (status >= 500) request.log.error(entry, "request failed");
    else request.log.info(entry, "request rejected");
    return reply.code(status).send({ error: errorKind(status) });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: errorKind(404) }));
}
