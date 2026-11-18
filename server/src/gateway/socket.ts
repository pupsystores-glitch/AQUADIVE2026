// The subset of a `ws` WebSocket the gateway uses (P8-2).
//
// `ws` ships no type declarations and `@fastify/websocket`'s socket type
// therefore resolves to `any`. This interface states exactly the methods and
// events the gateway relies on, so the rest of the gateway stays typed (and a
// test double can stand in for the socket).

export const SOCKET_OPEN = 1;

export interface GatewaySocket {
  readonly readyState: number;
  send(data: string, callback?: (error?: Error) => void): void;
  close(code: number, reason: string): void;
  terminate(): void;
  ping(): void;
  on(event: "message", listener: (data: Buffer, isBinary: boolean) => void): void;
  on(event: "close", listener: (code: number) => void): void;
  on(event: "pong", listener: () => void): void;
}
