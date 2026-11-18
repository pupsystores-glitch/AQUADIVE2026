// AQUADIVE network protocol v1 — DRAFT (P8-1). The only public surface of
// `src/protocol`; see README.md. Pure TypeScript: imports nothing but `zod`.
// Nothing in the application imports it yet.

export {
  MAX_PROTOCOL_MAJOR,
  negotiateProtocol,
  PROTOCOL_MAJOR,
  PROTOCOL_STATUS,
  PROTOCOL_UNSUPPORTED_CLOSE_CODE,
  SUPPORTED_PROTOCOL,
  type ProtocolRange,
} from "./version";

export * from "./limits";

export {
  BetIdSchema,
  ChestIdSchema,
  CounterSchema,
  CreatureIdSchema,
  isCounterString,
  MAX_COUNTER,
  RequestIdSchema,
  RoundIdSchema,
  RoundNumberSchema,
  SessionIdSchema,
  Sha256HexSchema,
  SlotSchema,
  TickSchema,
  type BetId,
  type ChestId,
  type RequestId,
  type RoundId,
  type RoundNumber,
  type SessionId,
  type Slot,
} from "./ids";

export {
  AmountMinorSchema,
  CurrencyCodeSchema,
  formatMinor,
  MAX_MINOR,
  parseMinor,
  StakeMinorSchema,
  type AmountMinor,
  type CurrencyCode,
  type StakeMinor,
} from "./money";

export {
  formatDecimal,
  formatMultiplier,
  isCanonicalMultiplier,
  multiplierDecimal,
  MultiplierSchema,
  parseMultiplier,
  type ExactDecimal,
  type Multiplier,
} from "./multiplier";

export {
  classifyRequestResponse,
  ERROR_CODES,
  errorCodeSpec,
  isErrorCodeAllowed,
  isRegisteredErrorCode,
  WireErrorCodeSchema,
  type ErrorCarrier,
  type ErrorCode,
  type ErrorCodeFor,
  type ErrorCodeSpec,
  type RequestOutcome,
} from "./errors";

export {
  classifySeq,
  FIRST_SEQ,
  ServerTimeMsSchema,
  type CorrelationRule,
  type SeqStatus,
  type ServerTimeMs,
} from "./envelope";

export {
  CLIENT_MESSAGE_TYPES,
  CLIENT_PAYLOADS,
  IDEMPOTENT_CLIENT_TYPES,
  idempotencyDecision,
  idempotencyFingerprint,
  isClientMessageType,
  isIdempotentMessage,
  type ClientMessage,
  type ClientMessageInput,
  type ClientMessageOf,
  type ClientMessageType,
  type IdempotentClientMessage,
  type IdempotentClientType,
} from "./messages/client";

export {
  CreatureKindSchema,
  PUBLIC_SERVER_MESSAGES,
  type PublicServerMessage,
  type PublicServerMessageInput,
  type PublicServerMessageType,
} from "./messages/server-public";

export {
  SESSION_SERVER_MESSAGES,
  type SessionServerMessage,
  type SessionServerMessageInput,
  type SessionServerMessageType,
} from "./messages/server-session";

export {
  PlayerPrivateStateSchema,
  PublicSnapshotSchema,
  SnapshotPhaseSchema,
  type PlayerPrivateStateV1,
  type PublicSnapshotV1,
  type SnapshotPhase,
} from "./snapshot";

export {
  decodeClientFrame,
  decodeServerFrame,
  encodeClientFrame,
  encodePublicServerFrame,
  encodeServerFrame,
  isPublicServerMessage,
  SERVER_MESSAGES,
  type DecodeErrorCode,
  type DecodeFailure,
  type DecodeResult,
  type EncodeErrorCode,
  type EncodeResult,
  type ServerMessage,
  type ServerMessageInput,
} from "./codec";
