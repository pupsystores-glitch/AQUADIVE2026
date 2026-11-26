// IPC contract of the offline Isolated Authority Host (Stage 1). PLAY MONEY ONLY; OFFLINE
// DEVELOPMENT ONLY. Pure: no I/O, no Node built-in, no import. Used by the Authority (the trusted
// child process: authority-main.ts, host.ts) and by the development launcher / relay in the
// untrusted application process (launcher.ts). Not connected to the server's startup, HTTP routes
// or WebSocket gateway.
//
// Transport. Two one-way anonymous pipes inherited by the Authority: file descriptor 3 carries
// commands to it, file descriptor 4 its replies (no Node IPC channel, no socket, no port; one
// direction per pipe, because a Windows pipe inherited as a file descriptor holds a write while
// a read on the same handle is pending). Each frame is a 4-byte unsigned big-endian length L followed by L
// bytes of UTF-8 JSON. A frame toward the Authority is at most MAX_COMMAND_BYTES; a frame from it
// at most MAX_REPLY_BYTES. A decoder never buffers more than one frame's bound.
//
// Strictness. A frame's text must be the CANONICAL JSON of its object: `JSON.stringify(parsed)`
// equals the text exactly, so whitespace, duplicate keys, escaped look-alikes or reordered keys
// are refused; every object has exactly its fixed keys, in a fixed order (absent values are
// `null`, never a missing key).
//
// Commands (application → Authority): { v: 1, id, op, …arguments of op, in ARGUMENT_KEYS order }
//
//   start     mode, chain, clock, chainLength, vectorSalt, eventCapacity   (once per Authority)
//   snapshot  —                                  the public snapshot at the current tick
//   events    after, limit                       events with seq > after, oldest first (≤ limit)
//   stop      —                                  owner stop (immediate halt)
//   shutdown  —                                  stop, close the worker, exit
//
// `id` is a safe integer 1 … MAX_COMMAND_ID and must increase with every command. There is no
// command that carries a script, a seal, a seed, a salt, an outcome, a clock reading, a path or
// code, and no command that returns anything the scheduler's public API does not already expose
// at the current tick (snapshot, events, digest, the chain's public id).
//
// Replies (Authority → application), keys in this order:
//
//   { v: 1, type: "ready" }                                    once, after the Authority's checks
//   { v: 1, type: "result", re: id, result: {…} }              per op, see RESULT_KEYS
//   { v: 1, type: "rejected", re: id, code, reason }           a refused command (no state change)
//   { v: 1, type: "fatal", code }                              the Authority fails closed and exits
//
// Failure classes. A malformed FRAME (length 0 or over the bound, invalid UTF-8, not canonical
// JSON, wrong envelope, version or id) is fatal: the Authority halts the scheduler, terminates the
// worker and exits — framing can no longer be trusted. A well-formed but invalid COMMAND (unknown
// op, wrong arguments, a non-increasing id, a command the state does not allow) is rejected and
// changes nothing; more than MAX_REJECTED_COMMANDS rejections, or more than MAX_QUEUED_COMMANDS
// commands waiting, are fatal.

export const AUTHORITY_PROTOCOL_VERSION = 1;
/** Largest command frame body (bytes). The largest valid command is far below it. */
export const MAX_COMMAND_BYTES = 1024;
/** Largest reply frame body (bytes). */
export const MAX_REPLY_BYTES = 131_072;
/** Most events in one `events` result. */
export const MAX_EVENTS_PER_BATCH = 256;
export const MAX_COMMAND_ID = 2_147_483_647;
/** Commands that may wait (one runs at a time); more is fatal. */
export const MAX_QUEUED_COMMANDS = 8;
/** Rejected commands the Authority tolerates over its lifetime; one more is fatal. */
export const MAX_REJECTED_COMMANDS = 8;
/** Bytes the Authority lets queue on the pipe toward the application; more is fatal. */
export const MAX_OUTBOUND_BUFFER_BYTES = 1_048_576;

/** Compiled locations (in the build) of the Authority's modules: all protected (integrity.ts). */
export const AUTHORITY_ENTRY_LOCATION = "server/src/authority/authority-main.js";
export const AUTHORITY_PROTECTED_FILES = Object.freeze([
  AUTHORITY_ENTRY_LOCATION,
  "server/src/authority/host.js",
  "server/src/authority/launcher.js",
  "server/src/authority/protocol.js",
] as const);

/** Process exit codes of the Authority (no other information leaves a failed Authority). */
export const AUTHORITY_EXIT = Object.freeze({
  /** Owner shutdown. */
  ok: 0,
  /** Launched without the fixed hardening (flags, environment, permission model, channel). */
  selfCheck: 64,
  /** The build does not match the trusted integrity manifest. */
  integrity: 65,
  /** The pipe to the application closed or failed (parent disconnect). */
  channel: 66,
  /** A malformed frame. */
  protocol: 67,
  /** Queue, rejection or backpressure bound exceeded. */
  limits: 68,
  /** An unexpected error inside the Authority. */
  internal: 70,
} as const);

/**
 * The Authority's Node flags, fixed (launcher and Authority compute the same list; the Authority
 * refuses to run with any other `process.execArgv`):
 *
 * - `--permission` (Node permission model): no child process, no file write, no native addon,
 *   no WASI, no inspector (it cannot be opened from inside); reads only below `packageRoot` (the
 *   build and the trusted manifest beside it);
 * - `--allow-worker`: the one preparation worker (fixed compiled entry, no eval);
 * - `--disable-sigusr1`: no inspector activation from outside (`process._debugProcess`);
 * - `--disallow-code-generation-from-strings`: no eval / new Function;
 * - `--no-addons`.
 */
export function authorityNodeFlags(packageRoot: string): readonly string[] {
  if (typeof packageRoot !== "string" || packageRoot.length === 0 || /[\0\r\n]/.test(packageRoot)) {
    throw new AuthorityError("invalid-argument", "invalid-root");
  }
  return Object.freeze([
    "--permission",
    `--allow-fs-read=${packageRoot}`,
    "--allow-worker",
    "--disable-sigusr1",
    "--disallow-code-generation-from-strings",
    "--no-addons",
  ]);
}

/**
 * The Authority's environment rule: NODE_ENV ("development" or "test") and nothing else that Node
 * reads — no NODE_OPTIONS, NODE_PATH, NODE_DEBUG, NODE_EXTRA_CA_CERTS, NODE_V8_COVERAGE, … (any
 * name starting with NODE_, case-insensitive). The operating system's own variables (Windows adds
 * SYSTEMROOT, PATH, … to every child) are not Node configuration and are allowed.
 */
export function isAuthorityEnvironment(env: Readonly<Record<string, string | undefined>>): boolean {
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test") return false;
  for (const key of Object.keys(env)) {
    if (/^node_/i.test(key) && key !== "NODE_ENV") return false;
  }
  return true;
}

// ---- Errors -----------------------------------------------------------------------------------

export type AuthorityErrorCode =
  /** A malformed argument of a local call. */
  | "invalid-argument"
  /** The operation is not allowed in the current state. */
  | "invalid-state"
  /** A development-only component was asked to run in production. */
  | "development-only"
  /** A second relay in this process (one Authority per application process, never relaunched). */
  | "duplicate-instance"
  /** The Authority could not be started (`reason`: fixed code). */
  | "startup-failed"
  /** The Authority refused a command (`reason`: its rejection code). */
  | "rejected"
  /** The Authority failed closed (`reason`: its fatal code) or broke the protocol. */
  | "authority-failed"
  /** The Authority process exited or its pipe closed unexpectedly. */
  | "authority-lost"
  /** A frame broke the IPC contract (`reason`: fixed code). */
  | "protocol-violation"
  /** The event stream had a gap, a reordering or a digest mismatch. */
  | "sequence-gap"
  /** A reply did not arrive in time. */
  | "timeout"
  /** The relay was shut down. */
  | "closed";

const REASON = /^[a-z][a-z0-9-]{0,63}$/;

/** Fixed code and at most one fixed kebab-case reason. Never a value, digest, path or text. */
export class AuthorityError extends Error {
  readonly code: AuthorityErrorCode;
  readonly reason: string | null;

  constructor(code: AuthorityErrorCode, reason: unknown = null) {
    const fixed = typeof reason === "string" && REASON.test(reason) ? reason : null;
    super(fixed === null ? code : `${code}: ${fixed}`);
    this.name = "AuthorityError";
    this.code = code;
    this.reason = fixed;
  }
}

/** A frame-level violation (always fatal on the receiving side). */
class FrameError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "FrameError";
    this.code = code;
  }
}

export const isFrameError = (e: unknown): e is { readonly code: string } => e instanceof FrameError;

// ---- Framing ----------------------------------------------------------------------------------

/** One frame: 4-byte big-endian length, then the body. Refuses an empty or oversized body. */
export function encodeFrame(body: Uint8Array, maxBytes: number): Uint8Array {
  if (body.length === 0 || body.length > maxBytes) throw new FrameError("frame-too-large");
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

/**
 * Streaming frame decoder. `push` returns the complete bodies in the chunk, in order. A declared
 * length of 0 or above `maxBytes` throws at once (before any of the body is buffered); at most
 * one partial frame (≤ 4 + maxBytes bytes) is kept. Once it has thrown it stays failed.
 */
export class FrameDecoder {
  readonly maxBytes: number;
  #header = new Uint8Array(4);
  #headerFill = 0;
  #body: Uint8Array | null = null;
  #bodyFill = 0;
  #failed = false;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) {
      throw new AuthorityError("invalid-argument", "invalid-bound");
    }
    this.maxBytes = maxBytes;
  }

  push(chunk: Uint8Array): Uint8Array[] {
    if (this.#failed) throw new FrameError("decoder-failed");
    const out: Uint8Array[] = [];
    let at = 0;
    try {
      while (at < chunk.length) {
        if (this.#body === null) {
          const take = Math.min(4 - this.#headerFill, chunk.length - at);
          this.#header.set(chunk.subarray(at, at + take), this.#headerFill);
          this.#headerFill += take;
          at += take;
          if (this.#headerFill < 4) break;
          const length = new DataView(this.#header.buffer).getUint32(0);
          this.#headerFill = 0;
          if (length === 0) throw new FrameError("frame-empty");
          if (length > this.maxBytes) throw new FrameError("frame-too-large");
          this.#body = new Uint8Array(length);
          this.#bodyFill = 0;
        }
        const body: Uint8Array = this.#body;
        const take = Math.min(body.length - this.#bodyFill, chunk.length - at);
        body.set(chunk.subarray(at, at + take), this.#bodyFill);
        this.#bodyFill += take;
        at += take;
        if (this.#bodyFill === body.length) {
          out.push(body);
          this.#body = null;
        }
      }
    } catch (error) {
      this.#failed = true;
      this.#body = null;
      throw error;
    }
    return out;
  }

  /** Bytes of an incomplete frame currently held. */
  get buffered(): number {
    return this.#body === null ? this.#headerFill : 4 + this.#bodyFill;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Canonical text → parsed plain object (frame-level checks). */
function parseCanonical(body: Uint8Array): Record<string, unknown> {
  let text: string;
  try {
    text = decoder.decode(body);
  } catch {
    throw new FrameError("frame-invalid-utf8");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new FrameError("frame-invalid-json");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FrameError("frame-not-object");
  }
  if (JSON.stringify(value) !== text) throw new FrameError("frame-not-canonical");
  return value as Record<string, unknown>;
}

const keysAre = (o: object, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && own.every((k, i) => k === keys[i]);
};
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const HEX64 = /^[0-9a-f]{64}$/;
const WORD = /^[a-z][a-z0-9.-]{0,63}$/;

// ---- Commands ---------------------------------------------------------------------------------

export type AuthorityOp = "start" | "snapshot" | "events" | "stop" | "shutdown";

export const ARGUMENT_KEYS: Readonly<Record<AuthorityOp, readonly string[]>> = Object.freeze({
  start: Object.freeze(["mode", "chain", "clock", "chainLength", "vectorSalt", "eventCapacity"]),
  snapshot: Object.freeze([]),
  events: Object.freeze(["after", "limit"]),
  stop: Object.freeze([]),
  shutdown: Object.freeze([]),
});

export interface StartArguments {
  readonly mode: "development" | "test";
  readonly chain: "random" | "public-test-vectors";
  /** `monotonic`: the Authority's real monotonic clock. `replay`: TEST ONLY, see host.ts. */
  readonly clock: "monotonic" | "replay";
  readonly chainLength: number | null;
  readonly vectorSalt: "A" | "B" | null;
  readonly eventCapacity: number | null;
}

export type AuthorityCommand =
  | ({ readonly id: number; readonly op: "start" } & StartArguments)
  | { readonly id: number; readonly op: "snapshot" | "stop" | "shutdown" }
  | { readonly id: number; readonly op: "events"; readonly after: number; readonly limit: number };

/** A parsed frame: a command, or a well-formed frame whose command is refused (`code`). */
export type ParsedCommand =
  | { readonly ok: true; readonly command: AuthorityCommand }
  | { readonly ok: false; readonly id: number; readonly code: "unknown-op" | "invalid-arguments" };

/** Encodes a command (relay side); refuses anything the Authority would not accept. */
export function encodeCommand(command: AuthorityCommand): Uint8Array {
  const op = command.op;
  const keys = ARGUMENT_KEYS[op];
  if (keys === undefined) throw new AuthorityError("invalid-argument", "unknown-op");
  const o: Record<string, unknown> = { v: AUTHORITY_PROTOCOL_VERSION, id: command.id, op };
  for (const k of keys) o[k] = (command as unknown as Record<string, unknown>)[k];
  const body = encoder.encode(JSON.stringify(o));
  const parsed = parseCommand(body); // the relay sends nothing the Authority would refuse
  if (!parsed.ok) throw new AuthorityError("invalid-argument", parsed.code);
  return encodeFrame(body, MAX_COMMAND_BYTES);
}

/**
 * Parses one command body (Authority side). Throws a frame error (fatal) for a malformed frame;
 * returns `ok: false` for a well-formed frame with an unknown op or invalid arguments.
 */
export function parseCommand(body: Uint8Array): ParsedCommand {
  if (body.length > MAX_COMMAND_BYTES) throw new FrameError("frame-too-large");
  const o = parseCanonical(body);
  const keys = Object.keys(o);
  if (keys[0] !== "v" || keys[1] !== "id" || keys[2] !== "op") {
    throw new FrameError("frame-invalid-envelope");
  }
  if (o.v !== AUTHORITY_PROTOCOL_VERSION) throw new FrameError("frame-invalid-version");
  if (!isInt(o.id, 1, MAX_COMMAND_ID)) throw new FrameError("frame-invalid-id");
  const id = o.id;
  if (typeof o.op !== "string" || !Object.hasOwn(ARGUMENT_KEYS, o.op)) {
    return { ok: false, id, code: "unknown-op" };
  }
  const op = o.op as AuthorityOp;
  if (!keysAre(o, ["v", "id", "op", ...ARGUMENT_KEYS[op]])) {
    return { ok: false, id, code: "invalid-arguments" };
  }
  const bad = { ok: false, id, code: "invalid-arguments" } as const;
  switch (op) {
    case "start": {
      if (o.mode !== "development" && o.mode !== "test") return bad;
      if (o.chain !== "random" && o.chain !== "public-test-vectors") return bad;
      if (o.clock !== "monotonic" && o.clock !== "replay") return bad;
      if (o.chainLength !== null && !isInt(o.chainLength, 1, 65_536)) return bad;
      if (o.vectorSalt !== null && o.vectorSalt !== "A" && o.vectorSalt !== "B") return bad;
      if (o.eventCapacity !== null && !isInt(o.eventCapacity, 16, 65_536)) return bad;
      return {
        ok: true,
        command: Object.freeze({
          id,
          op,
          mode: o.mode,
          chain: o.chain,
          clock: o.clock,
          chainLength: o.chainLength as number | null,
          vectorSalt: o.vectorSalt as "A" | "B" | null,
          eventCapacity: o.eventCapacity as number | null,
        }),
      };
    }
    case "events":
      if (!isInt(o.after, 0, Number.MAX_SAFE_INTEGER)) return bad;
      if (!isInt(o.limit, 1, MAX_EVENTS_PER_BATCH)) return bad;
      return { ok: true, command: Object.freeze({ id, op, after: o.after, limit: o.limit }) };
    default:
      return { ok: true, command: Object.freeze({ id, op }) };
  }
}

// ---- Replies ----------------------------------------------------------------------------------

export type RejectionCode =
  | "unknown-op"
  | "invalid-arguments"
  | "id-not-increasing"
  | "not-started"
  | "already-started"
  | "refused"
  | "start-failed"
  | "invalid-cursor"
  | "events-unavailable";

export const REJECTION_CODES: readonly RejectionCode[] = Object.freeze([
  "unknown-op",
  "invalid-arguments",
  "id-not-increasing",
  "not-started",
  "already-started",
  "refused",
  "start-failed",
  "invalid-cursor",
  "events-unavailable",
]);

export type FatalCode =
  | "frame-too-large"
  | "frame-empty"
  | "frame-invalid"
  | "queue-overflow"
  | "too-many-rejections"
  | "backpressure"
  | "internal-error";

export const FATAL_CODES: readonly FatalCode[] = Object.freeze([
  "frame-too-large",
  "frame-empty",
  "frame-invalid",
  "queue-overflow",
  "too-many-rejections",
  "backpressure",
  "internal-error",
]);

/** The keys of each op's `result`, in order. */
export const RESULT_KEYS: Readonly<Record<AuthorityOp, readonly string[]>> = Object.freeze({
  start: Object.freeze(["state", "chain"]),
  snapshot: Object.freeze(["snapshot", "digest"]),
  events: Object.freeze(["tick", "lastSeq", "events", "more"]),
  stop: Object.freeze(["state"]),
  shutdown: Object.freeze(["state"]),
});

const reply = (o: Record<string, unknown>): Uint8Array =>
  encodeFrame(encoder.encode(JSON.stringify(o)), MAX_REPLY_BYTES);

export const encodeReady = (): Uint8Array =>
  reply({ v: AUTHORITY_PROTOCOL_VERSION, type: "ready" });
export const encodeFatal = (code: FatalCode): Uint8Array =>
  reply({ v: AUTHORITY_PROTOCOL_VERSION, type: "fatal", code });
export const encodeRejected = (re: number, code: RejectionCode, reason: string | null = null) =>
  reply({
    v: AUTHORITY_PROTOCOL_VERSION,
    type: "rejected",
    re,
    code,
    reason: reason !== null && REASON.test(reason) ? reason : null,
  });
/** A result frame, or null if it would exceed MAX_REPLY_BYTES (the caller sends fewer events). */
export function encodeResult(re: number, op: AuthorityOp, result: Record<string, unknown>) {
  const keys = RESULT_KEYS[op];
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = result[k];
  const body = encoder.encode(
    JSON.stringify({ v: AUTHORITY_PROTOCOL_VERSION, type: "result", re, result: ordered }),
  );
  return body.length > MAX_REPLY_BYTES ? null : encodeFrame(body, MAX_REPLY_BYTES);
}

export type AuthorityReply =
  | { readonly type: "ready" }
  | { readonly type: "fatal"; readonly code: FatalCode }
  | {
      readonly type: "rejected";
      readonly re: number;
      readonly code: RejectionCode;
      readonly reason: string | null;
    }
  | { readonly type: "result"; readonly re: number; readonly result: Record<string, unknown> };

/**
 * Parses one reply body (relay side): the envelope, then — for a result — the op's result,
 * strictly (`op` is the command the relay is waiting for). Throws a frame error otherwise.
 */
export function parseReply(body: Uint8Array, op: AuthorityOp | null): AuthorityReply {
  if (body.length > MAX_REPLY_BYTES) throw new FrameError("frame-too-large");
  const o = parseCanonical(body);
  if (o.v !== AUTHORITY_PROTOCOL_VERSION) throw new FrameError("frame-invalid-version");
  switch (o.type) {
    case "ready":
      if (!keysAre(o, ["v", "type"])) break;
      return { type: "ready" };
    case "fatal":
      if (!keysAre(o, ["v", "type", "code"]) || !FATAL_CODES.includes(o.code as FatalCode)) break;
      return { type: "fatal", code: o.code as FatalCode };
    case "rejected":
      if (
        !keysAre(o, ["v", "type", "re", "code", "reason"]) ||
        !isInt(o.re, 1, MAX_COMMAND_ID) ||
        !REJECTION_CODES.includes(o.code as RejectionCode) ||
        !(o.reason === null || (typeof o.reason === "string" && REASON.test(o.reason)))
      ) {
        break;
      }
      return {
        type: "rejected",
        re: o.re,
        code: o.code as RejectionCode,
        reason: o.reason as string | null,
      };
    case "result":
      if (
        op === null ||
        !keysAre(o, ["v", "type", "re", "result"]) ||
        !isInt(o.re, 1, MAX_COMMAND_ID) ||
        !isPlain(o.result) ||
        !keysAre(o.result, RESULT_KEYS[op]) ||
        !validResult(op, o.result)
      ) {
        break;
      }
      return { type: "result", re: o.re, result: o.result };
  }
  throw new FrameError("frame-invalid-reply");
}

const STATES = ["created", "running", "halting", "halted"];

function validResult(op: AuthorityOp, r: Record<string, unknown>): boolean {
  switch (op) {
    case "start": {
      const c = r.chain;
      return (
        STATES.includes(r.state as string) &&
        isPlain(c) &&
        keysAre(c, ["chainId", "chainLength", "fv"]) &&
        typeof c.chainId === "string" &&
        HEX64.test(c.chainId) &&
        isInt(c.chainLength, 1, 65_536) &&
        isInt(c.fv, 1, 255)
      );
    }
    case "snapshot":
      return typeof r.digest === "string" && HEX64.test(r.digest) && isSnapshot(r.snapshot);
    case "events":
      return (
        isInt(r.tick, -1, Number.MAX_SAFE_INTEGER) &&
        isInt(r.lastSeq, 0, Number.MAX_SAFE_INTEGER) &&
        typeof r.more === "boolean" &&
        Array.isArray(r.events) &&
        r.events.length <= MAX_EVENTS_PER_BATCH &&
        r.events.every(isEvent)
      );
    case "stop":
      return STATES.includes(r.state as string);
    case "shutdown":
      return r.state === "closed";
  }
}

// ---- Public event and snapshot shapes (a copy of the scheduler's; a test keeps them equal) ----

/** The ordered type-specific fields of every event type (= scheduler events.ts EVENT_FIELDS). */
export const EVENT_SHAPES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "scheduler.started": Object.freeze(["firstOpeningTick"]),
  "round.admitted": Object.freeze(["roundId", "chainIndex"]),
  "round.betting": Object.freeze(["roundId", "closesAtTick"]),
  "round.dive": Object.freeze([]),
  "round.boost": Object.freeze([]),
  "round.crashed": Object.freeze(["crashAt", "endsAtTick"]),
  "round.impact": Object.freeze(["jackpot", "bonusAtTick"]),
  "round.bonus": Object.freeze(["closesAtTick"]),
  "round.chests": Object.freeze(["chests", "endsAtTick"]),
  "round.ended": Object.freeze(["outcome", "reveal"]),
  "source.failed": Object.freeze(["failure"]),
  "scheduler.halting": Object.freeze(["reason"]),
  "scheduler.halted": Object.freeze(["reason", "interruptedRound"]),
});

const isNum = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
/** One public field value: null, a finite number, a fixed word or id, or ≤ 3 numbers. */
const isFieldValue = (v: unknown): boolean =>
  v === null ||
  isNum(v) ||
  (typeof v === "string" && (WORD.test(v) || HEX64.test(v))) ||
  (Array.isArray(v) && v.length <= 3 && v.every(isNum));

/** A public scheduler event of exactly its type's shape. */
export function isEvent(e: unknown): boolean {
  if (!isPlain(e) || typeof e.type !== "string" || !Object.hasOwn(EVENT_SHAPES, e.type)) {
    return false;
  }
  const fields = EVENT_SHAPES[e.type]!;
  if (!keysAre(e, ["seq", "tick", "type", "round", ...fields])) return false;
  if (!isInt(e.seq, 1, Number.MAX_SAFE_INTEGER) || !isInt(e.tick, 0, Number.MAX_SAFE_INTEGER)) {
    return false;
  }
  if (e.round !== null && !isInt(e.round, 1, Number.MAX_SAFE_INTEGER)) return false;
  return fields.every((f) =>
    f === "roundId" ? typeof e[f] === "string" && HEX64.test(e[f] as string) : isFieldValue(e[f]),
  );
}

const ROUND_KEYS = [
  "number",
  "roundId",
  "chainIndex",
  "openedAtTick",
  "bettingClosesAtTick",
  "phase",
  "phaseStartTick",
  "phaseEndsAtTick",
  "multiplier",
  "crashAt",
  "jackpot",
  "chests",
  "boosts",
  "reveal",
];

/** The scheduler's public snapshot (schema aquadive.scheduler.snapshot v1), exactly. */
export function isSnapshot(s: unknown): boolean {
  if (
    !isPlain(s) ||
    !keysAre(s, [
      "schema",
      "version",
      "state",
      "tick",
      "lastSeq",
      "lastRound",
      "round",
      "halting",
      "halted",
    ]) ||
    s.schema !== "aquadive.scheduler.snapshot" ||
    s.version !== 1 ||
    !STATES.includes(s.state as string) ||
    !isInt(s.tick, -1, Number.MAX_SAFE_INTEGER) ||
    !isInt(s.lastSeq, 0, Number.MAX_SAFE_INTEGER) ||
    !isInt(s.lastRound, 0, Number.MAX_SAFE_INTEGER)
  ) {
    return false;
  }
  const r = s.round;
  if (r !== null) {
    if (!isPlain(r) || !keysAre(r, ROUND_KEYS)) return false;
    if (typeof r.roundId !== "string" || !HEX64.test(r.roundId)) return false;
    for (const k of ROUND_KEYS) if (k !== "roundId" && !isFieldValue(r[k])) return false;
  }
  const h = s.halting;
  if (h !== null && !(isPlain(h) && keysAre(h, ["reason", "sinceTick"]) && isFieldValue(h.reason)))
    return false;
  const d = s.halted;
  if (
    d !== null &&
    !(isPlain(d) && keysAre(d, ["reason", "tick", "interruptedRound"]) && isFieldValue(d.reason))
  ) {
    return false;
  }
  return true;
}

// Nothing of this module can be replaced once it has loaded.
Object.freeze(AuthorityError);
Object.freeze(AuthorityError.prototype);
Object.freeze(FrameError);
Object.freeze(FrameError.prototype);
Object.freeze(FrameDecoder);
Object.freeze(FrameDecoder.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
