// One WebSocket connection's lifecycle (P8-2; docs/09 §8.3, §8.4, §9.1, §9.5).
//
//   awaiting-hello ──hello, version agreed──▶ open ──▶ closing ──▶ closed
//         │                                      │
//         └── timeout, fault, refusal ───────────┴──▶ closing
//
// Every inbound frame, in this order:
//   1. rate limit (token bucket; before any decoding)      → error rate-limited, close 4008
//   2. text frames only                                    → error malformed, close 1003
//   3. `decodeClientFrame` (size, UTF-8, nesting ≤ 6, JSON, prototype keys,
//      version, strict envelope and payload; never throws)  → error <code>, close 4001 / 1009 / 1008
//   4. before the handshake: only `hello`                  → close 1008
//      `hello`: `negotiateProtocol`, then `welcome`        → or error protocol-unsupported, close 4001
//   5. after the handshake: a second `hello`               → error malformed, close 1008
//      any other request: refused before processing        → error <REFUSALS>, connection stays open
//
// Frames over the size limit never reach step 1: `ws` (maxPayload) closes
// them with 1009 itself. Frame contents are never logged; a decode failure's
// `detail` (a schema path and issue kind, never input values) is.

import type { FastifyBaseLogger } from "fastify";
import {
  decodeClientFrame,
  encodeServerFrame,
  errorCodeSpec,
  type ClientMessage,
  type DecodeErrorCode,
  type ErrorCodeFor,
  type SessionServerMessageInput,
} from "../protocol";
import { CLOSE, CLOSE_HANDSHAKE_TIMEOUT_MS, type CloseCode } from "./close-codes";
import { answerHello } from "./handshake";
import { monotonicNow, TokenBucket, type MonotonicClock } from "./rate-limit";
import { REFUSALS } from "./request-policy";
import { SOCKET_OPEN, type GatewaySocket } from "./socket";

export type ConnectionPhase = "awaiting-hello" | "open" | "closing" | "closed";

export interface ConnectionLimits {
  readonly helloTimeoutMs: number;
  readonly messageRatePerSecond: number;
  readonly messageBurst: number;
  readonly heartbeatIntervalMs: number;
  readonly tickHz: number;
}

export interface ConnectionOptions {
  readonly socket: GatewaySocket;
  readonly connectionId: string;
  readonly log: FastifyBaseLogger;
  readonly limits: ConnectionLimits;
  /** Called once, when the socket has closed. */
  readonly onClosed: (connection: GatewayConnection) => void;
  readonly wallClockMs?: () => number;
  readonly monotonic?: MonotonicClock;
}

type ErrorFrameCode = ErrorCodeFor<"error">;

const DECODE_FAILURE_CLOSE: Readonly<Record<DecodeErrorCode, CloseCode>> = {
  "protocol-unsupported": CLOSE.PROTOCOL_UNSUPPORTED,
  "frame-too-large": CLOSE.TOO_BIG,
  malformed: CLOSE.POLICY,
  "unknown-type": CLOSE.POLICY,
};

export class GatewayConnection {
  private phase: ConnectionPhase = "awaiting-hello";
  private seq = 0;
  private alive = true;
  private helloTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private closeTimer: NodeJS.Timeout | undefined;
  private readonly bucket: TokenBucket;
  private readonly socket: GatewaySocket;
  private readonly log: FastifyBaseLogger;
  private readonly wallClockMs: () => number;

  constructor(private readonly options: ConnectionOptions) {
    this.socket = options.socket;
    this.log = options.log;
    this.wallClockMs = options.wallClockMs ?? Date.now;
    this.bucket = new TokenBucket(
      options.limits.messageRatePerSecond,
      options.limits.messageBurst,
      options.monotonic ?? monotonicNow,
    );
  }

  get id(): string {
    return this.options.connectionId;
  }

  get state(): ConnectionPhase {
    return this.phase;
  }

  /** Attach listeners and start the hello timeout and the heartbeat. */
  start(): void {
    const { helloTimeoutMs, heartbeatIntervalMs } = this.options.limits;
    this.socket.on("message", (data, isBinary) => this.guard(() => this.onFrame(data, isBinary)));
    this.socket.on("pong", () => {
      this.alive = true;
    });
    this.socket.on("close", (code) => this.onSocketClosed(code));
    this.helloTimer = setTimeout(
      () => this.guard(() => this.close(CLOSE.POLICY, "hello timeout")),
      helloTimeoutMs,
    );
    this.heartbeatTimer = setInterval(
      () => this.guard(() => this.heartbeat()),
      heartbeatIntervalMs,
    );
    this.log.debug("connection opened");
  }

  /** Close because the server is shutting down. */
  goAway(): void {
    this.close(CLOSE.GOING_AWAY, "server shutting down");
  }

  /**
   * A socket-level error reported by `ws` (for example an oversized or
   * invalid UTF-8 frame, which `ws` already answers with its own close
   * frame). Only the error code is logged.
   */
  onSocketError(errorCode: string | undefined): void {
    this.log.info({ errorCode }, "socket error");
    if (this.socket.readyState === SOCKET_OPEN) {
      this.close(CLOSE.INTERNAL, "socket error");
    } else {
      this.enterClosing();
    }
  }

  private onFrame(data: Buffer, isBinary: boolean): void {
    if (this.phase === "closing" || this.phase === "closed") return;

    if (!this.bucket.take()) {
      this.sendError("rate-limited");
      this.close(CLOSE.RATE_LIMITED, "rate limited");
      return;
    }
    if (isBinary) {
      this.sendError("malformed");
      this.close(CLOSE.UNSUPPORTED_DATA, "text frames only");
      return;
    }

    const decoded = decodeClientFrame(data);
    if (!decoded.ok) {
      this.log.info({ code: decoded.code, detail: decoded.detail }, "frame rejected");
      this.sendError(decoded.code);
      this.close(DECODE_FAILURE_CLOSE[decoded.code], decoded.code);
      return;
    }

    if (this.phase === "awaiting-hello") this.onFirstMessage(decoded.msg);
    else this.onRequest(decoded.msg);
  }

  private onFirstMessage(msg: ClientMessage): void {
    if (msg.t !== "hello") {
      this.log.info({ type: msg.t }, "first frame is not hello");
      this.close(CLOSE.POLICY, "hello required");
      return;
    }
    clearTimeout(this.helloTimer);
    const answer = answerHello(msg, {
      connectionId: this.options.connectionId,
      nowMs: this.wallClockMs(),
      tickHz: this.options.limits.tickHz,
    });
    if (answer.kind === "unsupported") {
      this.log.info("no common protocol version");
      this.sendError("protocol-unsupported", msg.id);
      this.close(CLOSE.PROTOCOL_UNSUPPORTED, "protocol unsupported");
      return;
    }
    if (this.send(answer.welcome)) {
      this.phase = "open";
      this.log.info({ protocol: answer.protocol }, "handshake complete");
    }
  }

  private onRequest(msg: ClientMessage): void {
    if (msg.t === "hello") {
      this.log.info("second hello");
      this.sendError("malformed", msg.id);
      this.close(CLOSE.POLICY, "duplicate hello");
      return;
    }
    const code = REFUSALS[msg.t];
    this.log.debug({ type: msg.t, code }, "request refused");
    this.sendError(code, msg.id);
  }

  private sendError(code: ErrorFrameCode, re?: string): void {
    const spec = errorCodeSpec(code);
    if (spec === null) throw new Error("unregistered error code");
    const base = { v: 1, t: "error", p: { code, retryable: spec.retryable } } as const;
    this.send(re === undefined ? base : { ...base, re });
  }

  /** Number, stamp, validate and send one frame; false (and the socket closing) if refused. */
  private send(draft: DistributiveOmit<SessionServerMessageInput, "seq" | "ts">): boolean {
    if (this.socket.readyState !== SOCKET_OPEN) return false;
    this.seq += 1;
    const frame = { ...draft, seq: this.seq, ts: String(this.wallClockMs()) };
    const encoded = encodeServerFrame(frame as SessionServerMessageInput);
    if (!encoded.ok) {
      this.log.error({ code: encoded.code, detail: encoded.detail }, "outbound frame refused");
      this.close(CLOSE.INTERNAL, "internal error");
      return false;
    }
    this.socket.send(encoded.frame);
    return true;
  }

  private heartbeat(): void {
    if (this.phase === "closing" || this.phase === "closed") return;
    if (!this.alive) {
      this.log.info("heartbeat timeout");
      this.socket.terminate();
      return;
    }
    this.alive = false;
    this.socket.ping();
  }

  private close(code: CloseCode, reason: string): void {
    if (this.phase === "closing" || this.phase === "closed") return;
    this.log.info({ closeCode: code, reason }, "closing connection");
    if (this.socket.readyState === SOCKET_OPEN) this.socket.close(code, reason);
    this.enterClosing();
  }

  /** Stop timers and destroy the socket if the close handshake does not finish in time. */
  private enterClosing(): void {
    if (this.phase === "closing" || this.phase === "closed") return;
    this.phase = "closing";
    this.stopTimers();
    this.closeTimer = setTimeout(() => this.socket.terminate(), CLOSE_HANDSHAKE_TIMEOUT_MS);
  }

  private onSocketClosed(code: number): void {
    if (this.phase === "closed") return;
    this.phase = "closed";
    this.stopTimers();
    clearTimeout(this.closeTimer);
    this.log.info({ closeCode: code }, "connection closed");
    this.options.onClosed(this);
  }

  private stopTimers(): void {
    clearTimeout(this.helloTimer);
    clearInterval(this.heartbeatTimer);
  }

  /** Contain any unexpected fault to this connection. */
  private guard(action: () => void): void {
    try {
      action();
    } catch (err) {
      this.log.error({ err }, "connection fault");
      try {
        this.close(CLOSE.INTERNAL, "internal error");
      } catch {
        this.socket.terminate();
      }
    }
  }
}

/** `Omit` applied to each member of a union separately. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
