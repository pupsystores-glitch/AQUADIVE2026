// Message contract of the offline RoundScript preparation worker (P8-4b-0). PLAY MONEY ONLY;
// OFFLINE DEVELOPMENT AND TESTING ONLY. Not connected to the server's startup, HTTP routes,
// WebSocket gateway, cashout processing or any live loop; there is no scheduler.
//
// One worker thread (prep-worker.ts) owns an OfflineRoundEnvironment — its verified engine
// runtime, private ChainVault and private MemoryChainStore — and prepares rounds one at a time on
// the chain it created itself. The main thread (controller.ts) only ever sends:
//
//   { type: "prepare", requestId, saltHex }   a preparation; the VAULT assigns the chain index
//   { type: "shutdown" }                      drain, close the environment, exit
//
// and only ever accepts:
//
//   { type: "ready",    protocol, threadId, chainId, chainLength, fv }
//   { type: "prepared", requestId, chainIndex, digest, bytes }       canonical RoundScript bytes
//   { type: "failed",   requestId, code, reason, indexState, chainIndex }
//   { type: "rejected", code: "invalid-message" }
//   { type: "fatal",    code, reason, detail }
//   { type: "closed",   prepared, failed, lastReservedIndex, revealedCount, chainState }
//
// Every message is a plain object with EXACTLY these keys, validated on receipt in both
// directions; anything else is refused. No message carries a seed, a key, an RNG, a RoundKeys, a
// RoundDerivation, a function, a path, code or a runtime: the structured clone between threads
// could not carry their behaviour anyway, and the validators refuse every extra field. The only
// outcome-derived data that crosses is the finished RoundScript (canonical bytes and its internal
// digest), SECRET until the round's reveal, transferred (not copied) out of the worker.
//
// Errors are fixed codes (PrepWorkerError); a `reason` is a fixed kebab-case code, never data.
//
// P8-4b-1: a `prepared` message's bytes must be a plain Uint8Array that covers the whole of its
// own, non-shared, non-resizable ArrayBuffer (what a transfer of the worker's fresh copy yields)
// and at most MAX_SCRIPT_BYTES long — checked with the intrinsic accessors before anything reads
// the bytes. A SharedArrayBuffer view (another thread could change it while it is validated), a
// resizable buffer, an offset or partial view, or a longer message is a contract violation.
//
// P8-4b-2 R-1b: the controller binds this module's parsers and constants as it loads, and this
// module's CommonJS exports are frozen as it loads (its own constants are read through them in
// the compiled build), so a later replacement — e.g. of `parseWorkerMessage`, which made the
// controller verify forged bytes — is refused. Not covered: code that runs before it loads or
// rewrites shared built-ins (server README §18, A-1).

import { ROUND_SCRIPT_ERROR_CODES } from "../round/errors";

/** Version of this message contract. */
export const PREP_PROTOCOL_VERSION = 1;
/**
 * The hard upper bound of outstanding preparations per worker (owner decision: a look-ahead of at
 * most two prepared scripts). A controller may lower it to 1, never raise it.
 */
export const MAX_IN_FLIGHT_LIMIT = 2;
/** Default and maximum length of a fresh random development chain of a worker. */
export const DEFAULT_PREP_CHAIN_LENGTH = 1024;
export const MAX_PREP_CHAIN_LENGTH = 65_536;
/** The length of the public fv = 1 development-vector chain (FAIRNESS_DEV_VECTORS_V1). */
export const PUBLIC_TEST_VECTOR_CHAIN_LENGTH = 8;
/**
 * Upper bound of one canonical RoundScript: round-script.ts MAX_ROUND_SCRIPT_BYTES, the proved cap
 * (stated here, not imported, so that this contract stays pure; a test keeps the two equal).
 * P8-4a-1 … P8-4b-0 allowed 4 MiB, which only invalid scripts can use.
 */
export const MAX_SCRIPT_BYTES = 196_608;

/**
 * The worker's compiled components in the build. They are part of the TRUSTED integrity
 * manifest's protected set (server/src/prep, owner-approved P8-4b-0 expansion; integrity.ts):
 * the controller and the worker both refuse a manifest that does not name them.
 */
export const PREP_CONTROLLER_LOCATION = "server/src/prep/controller.js";
export const PREP_WORKER_LOCATION = "server/src/prep/prep-worker.js";
export const PREP_PROTECTED_FILES = Object.freeze([
  PREP_CONTROLLER_LOCATION,
  PREP_WORKER_LOCATION,
  "server/src/prep/protocol.js",
] as const);

export type PrepMode = "development" | "test";
/** `public-test-vectors`: the public, non-secret fv = 1 vector chain (test mode only). */
export type PrepChainSource = "random" | "public-test-vectors";

/** The worker's whole configuration (its `workerData`). */
export interface PrepWorkerConfig {
  readonly protocol: typeof PREP_PROTOCOL_VERSION;
  readonly mode: PrepMode;
  readonly chain: PrepChainSource;
  readonly chainLength: number;
  readonly maxInFlight: number;
}

// ---- Main thread → worker -------------------------------------------------------------------

export interface PrepareMessage {
  readonly type: "prepare";
  readonly requestId: string;
  /** The round's public salt, lower-case hex, 16 … 64 bytes. */
  readonly saltHex: string;
}
export interface ShutdownMessage {
  readonly type: "shutdown";
}
export type MainMessage = PrepareMessage | ShutdownMessage;

// ---- Worker → main thread -------------------------------------------------------------------

/** Failure codes a worker reports for one request. */
export const WORKER_FAILURE_CODES = Object.freeze([
  ...ROUND_SCRIPT_ERROR_CODES,
  /** More outstanding requests than the configured limit; nothing was reserved. */
  "backpressure",
  /** The worker stopped preparing after an earlier failure that touched an index. */
  "worker-halted",
  /** The worker is draining for shutdown; nothing was reserved. */
  "shutting-down",
  /** A non-RoundScriptError failure (no detail). */
  "unexpected-error",
] as const);
export type WorkerFailureCode = (typeof WORKER_FAILURE_CODES)[number];

/**
 * What the failed request did to the chain, from the vault's own reservation frontier read before
 * and after: `untouched` — no index was reserved; `consumed` — exactly one index was reserved (and
 * is reported); `unknown` — the frontier could not be read. Anything but `untouched` halts the
 * worker (fail closed; D10 / OD-11 stay open, so no policy continues past such an index).
 */
export type IndexState = "untouched" | "consumed" | "unknown";

export interface ReadyMessage {
  readonly type: "ready";
  readonly protocol: typeof PREP_PROTOCOL_VERSION;
  /** The worker's thread id (never the main thread's 0). */
  readonly threadId: number;
  readonly chainId: string;
  readonly chainLength: number;
  readonly fv: number;
}
export interface PreparedMessage {
  readonly type: "prepared";
  readonly requestId: string;
  readonly chainIndex: number;
  /** SECRET until the reveal: the RoundScript's internal digest (K11). */
  readonly digest: string;
  /** SECRET until the reveal: the canonical RoundScript bytes. */
  readonly bytes: Uint8Array;
}
export interface FailedMessage {
  readonly type: "failed";
  readonly requestId: string;
  readonly code: WorkerFailureCode;
  readonly reason: string | null;
  readonly indexState: IndexState;
  /** The reserved index when `indexState` is `consumed`, otherwise null. */
  readonly chainIndex: number | null;
}
export interface RejectedMessage {
  readonly type: "rejected";
  readonly code: "invalid-message";
}
export interface FatalMessage {
  readonly type: "fatal";
  readonly code: "invalid-config" | "startup-failed";
  /** For `startup-failed`: the RoundScriptError code (e.g. `runtime-integrity-failed`). */
  readonly reason: string | null;
  /** The failing layer's fixed reason code (e.g. `digest-mismatch`), or null. */
  readonly detail: string | null;
}
export interface ClosedMessage {
  readonly type: "closed";
  readonly prepared: number;
  readonly failed: number;
  readonly lastReservedIndex: number | null;
  readonly revealedCount: number | null;
  readonly chainState: string | null;
}
export type WorkerMessage =
  ReadyMessage | PreparedMessage | FailedMessage | RejectedMessage | FatalMessage | ClosedMessage;

// ---- Errors ---------------------------------------------------------------------------------

export type PrepWorkerErrorCode =
  /** Malformed controller options, request id or salt; nothing was sent to the worker. */
  | "invalid-request"
  /** The request id was used before on this controller; nothing was sent. */
  | "request-replayed"
  /**
   * The controller has retained chainLength + 64 request ids (P8-4b-1 bound; none is ever
   * evicted, so replay detection stays complete): it sends no further request.
   */
  | "request-ids-exhausted"
  /** The in-flight limit is reached; nothing was sent. */
  | "backpressure"
  /** The controller is not accepting requests (`reason`: its state). */
  | "not-ready"
  /** The worker reported a fixed-code failure (`reason`: the code; see `indexState`). */
  | "preparation-failed"
  /** The worker could not start (`reason`: a fixed code, e.g. runtime-integrity-failed). */
  | "start-failed"
  /** The worker crashed or exited: every pending request is INDETERMINATE. */
  | "worker-lost"
  /** The owner terminated the worker: every pending request is INDETERMINATE. */
  | "worker-terminated"
  /** The worker sent something outside the contract: it is terminated, pending INDETERMINATE. */
  | "protocol-violation"
  /** A development-only component was asked to run in production. */
  | "development-only";

const REASON_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export class PrepWorkerError extends Error {
  readonly code: PrepWorkerErrorCode;
  /** A fixed kebab-case code, or null. Never data. */
  readonly reason: string | null;
  /**
   * True when nothing can be said about the request's index: it may be untouched, reserved,
   * prepared, classified or lost with the worker's in-memory store. It is NEVER reported as
   * completed or voided, and nothing retries it.
   */
  readonly indeterminate: boolean;
  readonly indexState: IndexState | null;
  readonly chainIndex: number | null;

  constructor(
    code: PrepWorkerErrorCode,
    reason: unknown = null,
    details: {
      indeterminate?: boolean;
      indexState?: IndexState | null;
      chainIndex?: number | null;
    } = {},
  ) {
    const fixed = typeof reason === "string" && REASON_PATTERN.test(reason) ? reason : null;
    super(fixed === null ? code : `${code}: ${fixed}`);
    this.name = "PrepWorkerError";
    this.code = code;
    this.reason = fixed;
    this.indeterminate = details.indeterminate === true;
    this.indexState = details.indexState ?? null;
    this.chainIndex = Number.isSafeInteger(details.chainIndex) ? details.chainIndex! : null;
  }
}

// ---- Validators ---------------------------------------------------------------------------

/** The request-id rule of the chain store (server/src/fairness/chain-store.ts). */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** 16 … 64 bytes as lower-case hex (assertPublicSalt). */
export const SALT_HEX_PATTERN = /^(?:[0-9a-f]{2}){16,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

class ContractError extends Error {}
const refuse = (): never => {
  throw new ContractError("contract");
};

/** A plain data object (structured-clone result or literal) with exactly `keys`. */
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return refuse();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return refuse();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((k) => typeof k !== "string" || !keys.includes(k))) {
    return refuse();
  }
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (d === undefined || !("value" in d)) return refuse(); // no getters
  }
  return value as Record<string, unknown>;
}

// Intrinsic accessors, captured once: own properties or replaced prototype members of a
// received object cannot change what they report.
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicGetter = (target: object, key: string): ((this: unknown) => unknown) | undefined =>
  Object.getOwnPropertyDescriptor(target, key)?.get as ((this: unknown) => unknown) | undefined;
const viewBuffer = intrinsicGetter(TYPED_ARRAY_PROTOTYPE, "buffer")!;
const viewByteOffset = intrinsicGetter(TYPED_ARRAY_PROTOTYPE, "byteOffset")!;
const viewByteLength = intrinsicGetter(TYPED_ARRAY_PROTOTYPE, "byteLength")!;
/** Throws for anything but a non-shared ArrayBuffer (SharedArrayBuffer included). */
const bufferByteLength = intrinsicGetter(ArrayBuffer.prototype, "byteLength")!;
/** Absent on runtimes without resizable buffers (then no buffer can be resizable). */
const bufferResizable = intrinsicGetter(ArrayBuffer.prototype, "resizable");

/**
 * True for a plain Uint8Array of 2 … MAX_SCRIPT_BYTES bytes that is the whole of its own
 * non-shared, fixed-length ArrayBuffer. Reads no byte of it.
 */
function isWholeOwnedBytes(bytes: unknown): bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array) || Object.getPrototypeOf(bytes) !== Uint8Array.prototype) {
    return false;
  }
  try {
    const buffer = viewBuffer.call(bytes);
    const total = bufferByteLength.call(buffer) as number; // throws for a SharedArrayBuffer
    if (bufferResizable !== undefined && bufferResizable.call(buffer) !== false) return false;
    const length = viewByteLength.call(bytes) as number;
    return (
      viewByteOffset.call(bytes) === 0 &&
      length === total &&
      length >= 2 &&
      length <= MAX_SCRIPT_BYTES
    );
  } catch {
    return false;
  }
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const isReason = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && REASON_PATTERN.test(v));
const isRequestId = (v: unknown): v is string =>
  typeof v === "string" && REQUEST_ID_PATTERN.test(v);

const guarded =
  <T>(parse: (value: unknown) => T) =>
  (value: unknown): T => {
    try {
      return parse(value);
    } catch {
      throw new PrepWorkerError("invalid-request", "contract-violation");
    }
  };

/** Validates a worker configuration (`workerData`). */
export const parseWorkerConfig = guarded((value: unknown): PrepWorkerConfig => {
  const v = exact(value, ["protocol", "mode", "chain", "chainLength", "maxInFlight"]);
  if (v.protocol !== PREP_PROTOCOL_VERSION) refuse();
  if (v.mode !== "development" && v.mode !== "test") refuse();
  if (v.chain === "public-test-vectors") {
    if (v.mode !== "test" || v.chainLength !== PUBLIC_TEST_VECTOR_CHAIN_LENGTH) refuse();
  } else if (v.chain !== "random" || !isInt(v.chainLength, 1, MAX_PREP_CHAIN_LENGTH)) {
    refuse();
  }
  if (!isInt(v.maxInFlight, 1, MAX_IN_FLIGHT_LIMIT)) refuse();
  return Object.freeze({
    protocol: PREP_PROTOCOL_VERSION,
    mode: v.mode as PrepMode,
    chain: v.chain as PrepChainSource,
    chainLength: v.chainLength as number,
    maxInFlight: v.maxInFlight as number,
  });
});

/** Validates a message the worker received from the main thread. */
export const parseMainMessage = guarded((value: unknown): MainMessage => {
  const type = (value as { type?: unknown } | null)?.type;
  if (type === "shutdown") {
    exact(value, ["type"]);
    return Object.freeze({ type: "shutdown" });
  }
  if (type !== "prepare") return refuse();
  const v = exact(value, ["type", "requestId", "saltHex"]);
  if (!isRequestId(v.requestId)) refuse();
  if (typeof v.saltHex !== "string" || !SALT_HEX_PATTERN.test(v.saltHex)) refuse();
  return Object.freeze({
    type: "prepare",
    requestId: v.requestId as string,
    saltHex: v.saltHex as string,
  });
});

/** Validates a message the main thread received from the worker. */
export const parseWorkerMessage = guarded((value: unknown): WorkerMessage => {
  const type = (value as { type?: unknown } | null)?.type;
  switch (type) {
    case "ready": {
      const v = exact(value, ["type", "protocol", "threadId", "chainId", "chainLength", "fv"]);
      if (v.protocol !== PREP_PROTOCOL_VERSION || !isInt(v.threadId, 1, Number.MAX_SAFE_INTEGER)) {
        refuse();
      }
      if (typeof v.chainId !== "string" || !HEX64.test(v.chainId)) refuse();
      if (!isInt(v.chainLength, 1, MAX_PREP_CHAIN_LENGTH) || v.fv !== 1) refuse();
      return Object.freeze({ ...v }) as unknown as ReadyMessage;
    }
    case "prepared": {
      const v = exact(value, ["type", "requestId", "chainIndex", "digest", "bytes"]);
      if (!isRequestId(v.requestId) || !isInt(v.chainIndex, 1, MAX_PREP_CHAIN_LENGTH)) refuse();
      if (typeof v.digest !== "string" || !HEX64.test(v.digest)) refuse();
      if (!isWholeOwnedBytes(v.bytes)) refuse();
      return Object.freeze({ ...v }) as unknown as PreparedMessage;
    }
    case "failed": {
      const v = exact(value, ["type", "requestId", "code", "reason", "indexState", "chainIndex"]);
      if (!isRequestId(v.requestId) || !WORKER_FAILURE_CODES.includes(v.code as never)) refuse();
      if (!isReason(v.reason)) refuse();
      if (v.indexState === "consumed") {
        if (!isInt(v.chainIndex, 1, MAX_PREP_CHAIN_LENGTH)) refuse();
      } else if (
        (v.indexState !== "untouched" && v.indexState !== "unknown") ||
        v.chainIndex !== null
      ) {
        refuse();
      }
      return Object.freeze({ ...v }) as unknown as FailedMessage;
    }
    case "rejected": {
      const v = exact(value, ["type", "code"]);
      if (v.code !== "invalid-message") refuse();
      return Object.freeze({ ...v }) as unknown as RejectedMessage;
    }
    case "fatal": {
      const v = exact(value, ["type", "code", "reason", "detail"]);
      if (v.code !== "invalid-config" && v.code !== "startup-failed") refuse();
      if (!isReason(v.reason) || !isReason(v.detail)) refuse();
      return Object.freeze({ ...v }) as unknown as FatalMessage;
    }
    case "closed": {
      const v = exact(value, [
        "type",
        "prepared",
        "failed",
        "lastReservedIndex",
        "revealedCount",
        "chainState",
      ]);
      if (!isInt(v.prepared, 0, MAX_PREP_CHAIN_LENGTH) || !isInt(v.failed, 0, 2 ** 31)) refuse();
      for (const k of ["lastReservedIndex", "revealedCount"]) {
        if (v[k] !== null && !isInt(v[k], 0, MAX_PREP_CHAIN_LENGTH)) refuse();
      }
      if (!isReason(v.chainState)) refuse();
      return Object.freeze({ ...v }) as unknown as ClosedMessage;
    }
    default:
      return refuse();
  }
});

// R-1b: this module's exports cannot be replaced once it has loaded (an ES module namespace, as
// under Vitest, is immutable already).
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
