// WebSocket close codes the gateway uses (P8-2; docs/09 §8.4, RFC 6455 §7.4).

import { PROTOCOL_UNSUPPORTED_CLOSE_CODE } from "../protocol";

export const CLOSE = {
  /** Server shutting down (docs/09 §8.4 "going away"). */
  GOING_AWAY: 1001,
  /** A binary frame: the protocol is one UTF-8 JSON text frame per message. */
  UNSUPPORTED_DATA: 1003,
  /** Policy: no hello in time, a non-hello first frame, a malformed frame, a second hello. */
  POLICY: 1008,
  /** A frame above the client → server size limit. */
  TOO_BIG: 1009,
  /** An unexpected server fault on this connection. */
  INTERNAL: 1011,
  /** Capacity reached between the upgrade check and the connection. */
  TRY_AGAIN_LATER: 1013,
  /** No common protocol version (protocol library constant). */
  PROTOCOL_UNSUPPORTED: PROTOCOL_UNSUPPORTED_CLOSE_CODE,
  /** Frame rate above the per-connection limit (docs/09 §9.5). */
  RATE_LIMITED: 4008,
} as const;

export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

/** How long a closing socket may take to finish the close handshake before it is destroyed. */
export const CLOSE_HANDSHAKE_TIMEOUT_MS = 2000;
