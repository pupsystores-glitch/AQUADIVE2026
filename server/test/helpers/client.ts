// Test WebSocket client on Node's built-in WebSocket (no extra dependency).
import { randomUUID } from "node:crypto";
import { TEST_ORIGIN } from "./server";

export interface CloseInfo {
  readonly code: number;
  readonly reason: string;
}

export interface TestClient {
  readonly socket: WebSocket;
  /** True once open; false if the upgrade was refused or failed. */
  readonly opened: Promise<boolean>;
  readonly closed: Promise<CloseInfo>;
  /** Every text message received, in order. */
  readonly messages: string[];
  /** The next message not yet taken by `next`. */
  next(timeoutMs?: number): Promise<string>;
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
}

export interface ClientOptions {
  /** Origin header; `null` sends none. Default: the allowed test origin. */
  readonly origin?: string | null;
  readonly headers?: Record<string, string>;
}

export function connect(url: string, options: ClientOptions = {}): TestClient {
  const origin = options.origin === undefined ? TEST_ORIGIN : options.origin;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (origin !== null) headers.origin = origin;
  const socket = new WebSocket(url, { headers } as unknown as string[]);
  const messages: string[] = [];
  let taken = 0;
  const waiters: Array<() => void> = [];

  const opened = new Promise<boolean>((resolve) => {
    socket.addEventListener("open", () => resolve(true));
    socket.addEventListener("close", () => resolve(false));
  });
  const closed = new Promise<CloseInfo>((resolve) => {
    socket.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason }));
  });
  socket.addEventListener("error", () => undefined);
  socket.addEventListener("message", (e) => {
    messages.push(String(e.data));
    waiters.splice(0).forEach((w) => w());
  });

  return {
    socket,
    opened,
    closed,
    messages,
    next: (timeoutMs = 3000) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no message in time")), timeoutMs);
        const check = () => {
          if (taken < messages.length) {
            clearTimeout(timer);
            resolve(messages[taken++]!);
          } else waiters.push(check);
        };
        check();
      }),
    send: (data) => socket.send(data),
    close: (code = 1000) => socket.close(code),
  };
}

/** A canonical client frame with a fresh UUIDv4 request id. */
export function clientFrame(t: string, p: unknown, id: string = randomUUID()): string {
  return JSON.stringify({ v: 1, t, id, p });
}

export const helloFrame = (id?: string, min = 1, max = 1): string =>
  clientFrame(
    "hello",
    { protocol: { min, max }, client: { build: "test.1", platform: "node" } },
    id,
  );

/** Open, send hello and return the client with the welcome frame (parsed). */
export async function handshake(
  url: string,
  options?: ClientOptions,
): Promise<{ client: TestClient; welcome: Record<string, unknown> }> {
  const client = connect(url, options);
  if (!(await client.opened)) throw new Error("connection refused");
  client.send(helloFrame());
  const welcome = JSON.parse(await client.next()) as Record<string, unknown>;
  return { client, welcome };
}
