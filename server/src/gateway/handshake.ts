// The hello → welcome handshake (P8-2; docs/09 §8.3, P1-D12; P8-1 Draft v1 exception).
//
// Pure: given a decoded `hello` and the connection's facts, it returns either
// the welcome to send or "unsupported". The welcome states only what is true
// for an unauthenticated connection with no round engine:
//
// - `protocol`: the major chosen by the protocol library's `negotiateProtocol`;
// - `sessionId`: a fresh random id for this connection. It identifies the
//   connection only; no player, account or authenticated session exists;
// - `serverTimeMs`: the server's wall clock when the welcome is built;
// - `tickHz`: the configured tick rate (60);
// - no `snapshot`: the server has no authoritative round to report, and
//   inventing one (round id, number, commitment, phase) is forbidden;
// - no `player`: private state is never sent to an unauthenticated connection.

import {
  negotiateProtocol,
  type ClientMessageOf,
  type SessionServerMessageInput,
} from "../protocol";

export interface HandshakeFacts {
  /** A fresh random UUID for this connection. */
  readonly connectionId: string;
  /** Server wall-clock time in milliseconds. */
  readonly nowMs: number;
  /** Tick rate to announce. */
  readonly tickHz: number;
}

/** The welcome without its envelope sequence fields (the sender adds `seq` and `ts`). */
export type WelcomeDraft = Omit<Extract<SessionServerMessageInput, { t: "welcome" }>, "seq" | "ts">;

export type HelloAnswer =
  | { readonly kind: "welcome"; readonly protocol: number; readonly welcome: WelcomeDraft }
  | { readonly kind: "unsupported" };

export function answerHello(hello: ClientMessageOf<"hello">, facts: HandshakeFacts): HelloAnswer {
  const protocol = negotiateProtocol(hello.p.protocol);
  if (protocol === null) return { kind: "unsupported" };
  return {
    kind: "welcome",
    protocol,
    welcome: {
      v: 1,
      t: "welcome",
      re: hello.id,
      p: {
        protocol,
        sessionId: facts.connectionId,
        serverTimeMs: String(facts.nowMs),
        tickHz: facts.tickHz,
      },
    },
  };
}
