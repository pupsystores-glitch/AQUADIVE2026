// The WebSocket gateway: upgrade admission and connection wiring (P8-2; docs/09 §8.4, §9.3, §9.5).
//
// At the HTTP upgrade, before a WebSocket exists:
//   draining                    → 503
//   Origin not allowed          → 403
//   connection limits reached   → 503
// The socket itself: `maxPayload` = the protocol's client frame limit (`ws`
// closes larger frames with 1009), permessage-deflate off (docs/09 §8.10).
// On shutdown every connection is closed with 1001.

import { randomUUID } from "node:crypto";
import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ServerConfig } from "../config";
import { errorKind } from "../http/error-handlers";
import type { Readiness } from "../ops/readiness";
import { MAX_CLIENT_FRAME_BYTES } from "../protocol";
import { CLOSE } from "./close-codes";
import { GatewayConnection } from "./connection";
import { ConnectionRegistry } from "./connection-registry";
import { OriginPolicy } from "./origin-policy";
import type { GatewaySocket } from "./socket";

export const WS_PATH = "/ws";

export interface GatewayDeps {
  readonly config: ServerConfig;
  readonly readiness: Readiness;
}

export interface GatewayHandle {
  /** Live connections. */
  readonly connectionCount: () => number;
  /** Remote addresses with at least one live connection. */
  readonly addressCount: () => number;
}

const refuseUpgrade = (reply: FastifyReply, status: 403 | 503) =>
  reply.code(status).send({ error: errorKind(status) });

export async function registerGateway(
  app: FastifyInstance,
  { config, readiness }: GatewayDeps,
): Promise<GatewayHandle> {
  const origins = new OriginPolicy(config.allowedOrigins);
  const registry = new ConnectionRegistry<GatewayConnection>(
    config.maxConnections,
    config.maxConnectionsPerIp,
  );
  const bySocket = new WeakMap<GatewaySocket, GatewayConnection>();

  // Shutdown waits until every connection has really closed. Each one is
  // bounded by its close-handshake fallback (CLOSE_HANDSHAKE_TIMEOUT_MS), the
  // whole shutdown by the grace period (ops/shutdown.ts).
  const onEmpty: Array<() => void> = [];
  const release = (address: string, connection: GatewayConnection) => {
    registry.remove(address, connection);
    if (registry.size === 0) onEmpty.splice(0).forEach((resolve) => resolve());
  };
  const allClosed = () =>
    registry.size === 0 ? Promise.resolve() : new Promise<void>((r) => onEmpty.push(r));

  await app.register(websocket, {
    options: {
      maxPayload: MAX_CLIENT_FRAME_BYTES,
      perMessageDeflate: false,
      clientTracking: true,
    },
    // Errors on an established socket. The connection decides how to close;
    // a socket without a connection (refused at capacity) is destroyed.
    errorHandler: (error: NodeJS.ErrnoException, socket: GatewaySocket) => {
      const connection = bySocket.get(socket);
      if (connection) connection.onSocketError(error.code);
      else socket.terminate();
    },
    preClose: async () => {
      for (const connection of registry.snapshot()) connection.goAway();
      await allClosed();
      app.websocketServer.close();
    },
  });

  app.route({
    method: "GET",
    url: WS_PATH,
    websocket: true,
    preValidation: async (request, reply) => {
      if (!request.ws) return;
      if (!readiness.ready) return refuseUpgrade(reply, 503);
      if (!origins.allows(request.headers.origin)) {
        request.log.info("websocket upgrade refused: origin");
        return refuseUpgrade(reply, 403);
      }
      const admission = registry.check(request.ip);
      if (admission !== "ok") {
        request.log.warn({ admission }, "websocket upgrade refused: capacity");
        return refuseUpgrade(reply, 503);
      }
    },
    // With `websocket: true` this is the WebSocket handler; the plugin answers
    // a plain (non-upgrade) GET on this path with 404.
    handler: (socket: GatewaySocket, request) => {
      const address = request.ip;
      const connectionId = randomUUID();
      const log = request.log.child({ connectionId });
      if (!readiness.ready) {
        socket.close(CLOSE.GOING_AWAY, "server shutting down");
        return;
      }
      const connection = new GatewayConnection({
        socket,
        connectionId,
        log,
        limits: config,
        onClosed: (closed) => release(address, closed),
      });
      if (!registry.add(address, connection)) {
        log.warn("connection refused: capacity reached during upgrade");
        socket.close(CLOSE.TRY_AGAIN_LATER, "server full");
        return;
      }
      bySocket.set(socket, connection);
      connection.start();
    },
  });

  return {
    connectionCount: () => registry.size,
    addressCount: () => registry.addressCount,
  };
}
