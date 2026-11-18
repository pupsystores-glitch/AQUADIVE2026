// Raw TCP WebSocket client for hostile-input tests: hand-built upgrades and frames.
//
// It sends exactly the bytes a test asks for (wrong headers, declared lengths
// far beyond the payload, garbage) and never answers pings, which the
// standards-conforming built-in client cannot be made to do.
import { randomBytes } from "node:crypto";
import { connect, type Socket } from "node:net";

export interface RawConnection {
  readonly socket: Socket;
  /** HTTP status of the upgrade response (101 on success). */
  readonly status: number;
  /** Resolves with the server's close code, or null if the TCP connection ended without one. */
  readonly closeCode: Promise<number | null>;
  /** Text payloads of server data frames received so far. */
  readonly texts: string[];
  /** Resolves when the TCP connection has ended. */
  readonly ended: Promise<void>;
}

export async function rawUpgrade(
  port: number,
  headers: Record<string, string>,
  path = "/ws",
): Promise<RawConnection> {
  const socket = connect(port, "127.0.0.1");
  socket.on("error", () => undefined);
  const lines = [
    `GET ${path} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
    "Sec-WebSocket-Version: 13",
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ];
  socket.write(`${lines.join("\r\n")}\r\n\r\n`);

  let buffer = Buffer.alloc(0);
  const ended = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  const status = await new Promise<number>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf("\r\n\r\n");
      if (end === -1) return;
      socket.off("data", onData);
      const head = buffer.subarray(0, end).toString("latin1");
      buffer = buffer.subarray(end + 4);
      resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(head)?.[1] ?? 0));
    };
    socket.on("data", onData);
    socket.once("close", () => reject(new Error("closed before an HTTP response")));
  });

  const texts: string[] = [];
  const closeCode = new Promise<number | null>((resolve) => {
    const parse = () => {
      for (;;) {
        const frame = readFrame(buffer);
        if (!frame) return;
        buffer = buffer.subarray(frame.size);
        if (frame.opcode === 0x1) texts.push(frame.payload.toString("utf8"));
        if (frame.opcode === 0x8) {
          resolve(frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005);
          return;
        }
      }
    };
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      parse();
    });
    socket.once("close", () => resolve(null));
    parse();
  });
  return { socket, status, closeCode, texts, ended };
}

interface Frame {
  readonly opcode: number;
  readonly payload: Buffer;
  readonly size: number;
}

/** Parse one unmasked server frame from the start of `buf`, or null if incomplete. */
function readFrame(buf: Buffer): Frame | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  let length = buf[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buf.length < 4) return null;
    length = buf.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buf.length < 10) return null;
    length = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  if (buf.length < offset + length) return null;
  return { opcode, payload: buf.subarray(offset, offset + length), size: offset + length };
}

export interface FrameOptions {
  readonly fin?: boolean;
  /** Length to declare in the header (default: the payload's). */
  readonly declaredLength?: number;
}

/** A masked client frame. */
export function clientFrameBytes(
  opcode: number,
  payload: Buffer,
  { fin = true, declaredLength = payload.length }: FrameOptions = {},
): Buffer {
  const mask = randomBytes(4);
  let header: Buffer;
  if (declaredLength < 126) {
    header = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | declaredLength]);
  } else if (declaredLength < 65_536) {
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0) | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(declaredLength, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0) | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(declaredLength), 2);
  }
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

export const OPCODE = { CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8 } as const;
