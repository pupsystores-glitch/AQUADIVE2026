// The server's single bridge to the shared protocol library (P8-2).
//
// `src/protocol` (P8-1, DRAFT v1) is consumed from its original source, never
// copied. This file is the only server module that reaches outside `server/`,
// and it imports the library's public surface (`index.ts`) only; an import
// boundary test enforces both rules. Every other server module imports from
// here.
//
// Runtime resolution: `tsc` compiles the protocol source next to the server
// under `dist/`, inside this package, so the protocol's bare `zod` import
// resolves from `server/node_modules` (see README.md, "Dependency resolution").

export {
  decodeClientFrame,
  encodeServerFrame,
  errorCodeSpec,
  MAX_CLIENT_FRAME_BYTES,
  MAX_TICK_HZ,
  negotiateProtocol,
  PROTOCOL_STATUS,
  PROTOCOL_UNSUPPORTED_CLOSE_CODE,
  SUPPORTED_PROTOCOL,
  type ClientMessage,
  type ClientMessageOf,
  type ClientMessageType,
  type DecodeErrorCode,
  type ErrorCode,
  type ErrorCodeFor,
  type SessionServerMessageInput,
} from "../../src/protocol";
