// Development launcher and relay of the offline Isolated Authority Host (Stage 1). PLAY MONEY
// ONLY; OFFLINE DEVELOPMENT ONLY. This module runs in the UNTRUSTED application process: it holds
// no scheduler, source, worker, RoundScript, seal, seed or salt and imports nothing of them (a
// boundary test checks it). Nothing in the server's startup, HTTP routes or WebSocket gateway
// imports it; it is not connected to live gameplay.
//
// `AuthorityRelay.launch()`:
//
// - refuses a production NODE_ENV; at most ONE relay per application process, ever (a lost
//   Authority is never relaunched — that would be a new chain: no automatic restart exists);
// - spawns the Authority from the fixed compiled entry next to this file with the fixed hardening
//   flags (protocol.ts authorityNodeFlags), an EXPLICIT environment that holds NODE_ENV only (an
//   inherited NODE_OPTIONS `--require` would otherwise run inside the Authority), no shell, no
//   inherited stdin / stdout / stderr, and two one-way pipes as its file descriptors 3 (commands)
//   and 4 (replies);
// - waits for its `ready` frame (STARTUP_TIMEOUT_MS), otherwise kills it and fails.
//
// The relay sends one command at a time and waits for its reply (REQUEST_TIMEOUT_MS; start:
// START_TIMEOUT_MS). Every frame from the Authority is bounded and validated strictly
// (protocol.ts parseReply); events are retrieved by sequence number and must continue the
// relay's cursor exactly (seq = cursor + 1, + 2, …, ticks never decreasing, none after the
// reply's tick). The relay keeps its own running digest of the events (the scheduler's event-log
// digest, recomputed); a snapshot whose lastSeq equals the cursor must carry the same digest.
//
// Fail closed: a malformed frame, an unexpected reply, a timeout, a sequence gap, a digest
// mismatch, an `events-unavailable` refusal (events were dropped before the relay read them) or a
// `fatal` frame kills the Authority and ends the relay for good (`failed`); an Authority that
// exits or whose pipe closes ends it as `lost`. Every pending and later call is rejected; nothing
// is retried and nothing is relaunched.

import { spawn as spawnExport, type ChildProcess } from "node:child_process";
import { createHash as createHashExport } from "node:crypto";
import { join as joinExport } from "node:path";
import type { Readable, Writable } from "node:stream";
import * as protocol from "./protocol";
import type { AuthorityCommand, AuthorityOp, StartArguments } from "./protocol";

// Bound once, as this module loads (defense in depth only: this process is not trusted).
const spawn = spawnExport;
const createHash = createHashExport;
const join = joinExport;
const execPath = process.execPath;
const {
  AuthorityError,
  FrameDecoder,
  MAX_EVENTS_PER_BATCH,
  MAX_REPLY_BYTES,
  authorityNodeFlags,
  encodeCommand,
  parseReply,
} = protocol;
type AuthorityError = protocol.AuthorityError;

export const STARTUP_TIMEOUT_MS = 15_000;
export const START_TIMEOUT_MS = 60_000;
export const REQUEST_TIMEOUT_MS = 10_000;
const EXIT_WAIT_MS = 5_000;
const PROCESS_MARK = Symbol.for("aquadive.offline-authority-relay.v1");
const LOG_DOMAIN = "AQUADIVE|scheduler|event-log|v1";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const CONSTRUCT: object = Object.freeze(Object.create(null));
const ENTRY = "authority-main.js";

/** The fixed launch of the Authority (also used by tests that drive the pipe directly). */
export interface AuthorityLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

/** The Authority's fixed command line and environment for this build. */
export function authorityLaunch(): AuthorityLaunch {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") throw new AuthorityError("development-only", "production-refused");
  const build = join(__dirname, "..", "..", "..");
  const packageRoot = join(build, "..");
  return Object.freeze({
    command: execPath,
    args: Object.freeze([...authorityNodeFlags(packageRoot), join(__dirname, ENTRY)]),
    env: Object.freeze({ NODE_ENV: nodeEnv === "test" ? "test" : "development" }),
    cwd: build,
  });
}

export type RelayState = "starting" | "ready" | "failed" | "lost" | "closed";

interface Pending {
  readonly id: number;
  readonly op: AuthorityOp;
  readonly resolve: (result: Record<string, unknown>) => void;
  readonly reject: (error: AuthorityError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** The result of one `events` call: the next events after the relay's cursor. */
export interface EventBatch {
  readonly tick: number;
  readonly lastSeq: number;
  readonly events: readonly Readonly<Record<string, unknown>>[];
  readonly more: boolean;
}

export class AuthorityRelay {
  readonly #child: ChildProcess;
  /** Commands to the Authority (its fd 3) and its replies (its fd 4). */
  readonly #pipe: Writable;
  readonly #replies: Readable;
  readonly #decoder = new FrameDecoder(MAX_REPLY_BYTES);
  #state: RelayState = "starting";
  #nextId = 1;
  #pending: Pending | null = null;
  #ready: { resolve: () => void; reject: (e: AuthorityError) => void } | null = null;
  #busy: Promise<unknown> = Promise.resolve();
  #cursor = 0;
  #lastTick = 0;
  #digest: Buffer = createHash("sha256").update(LOG_DOMAIN, "utf8").digest();
  #exit: { code: number | null; signal: string | null } | null = null;
  #exited: Promise<void>;
  #failure: AuthorityError | null = null;

  private constructor(capability: unknown, child: ChildProcess) {
    if (capability !== CONSTRUCT) throw new AuthorityError("invalid-state", "construction-refused");
    this.#child = child;
    this.#pipe = child.stdio[3] as Writable;
    this.#replies = child.stdio[4] as Readable;
    this.#exited = new Promise((resolve) => {
      child.once("exit", (code, signal) => {
        this.#exit = { code, signal };
        this.#lost();
        resolve();
      });
    });
    child.once("error", () => this.#lost());
    this.#replies.on("data", (chunk: Buffer) => this.#receive(chunk));
    for (const pipe of [this.#pipe, this.#replies]) {
      pipe.on("error", () => this.#lost());
      pipe.on("close", () => this.#lost());
    }
    Object.freeze(this);
  }

  /** Launches THE Authority of this process (see the file comment). */
  static async launch(): Promise<AuthorityRelay> {
    const spec = authorityLaunch(); // refuses production
    if (Object.hasOwn(process, PROCESS_MARK)) throw new AuthorityError("duplicate-instance");
    const marked = Reflect.defineProperty(process, PROCESS_MARK, {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    if (!marked) throw new AuthorityError("duplicate-instance");
    let child: ChildProcess;
    try {
      child = spawn(spec.command, [...spec.args], {
        cwd: spec.cwd,
        env: { ...spec.env },
        stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: false,
      });
    } catch {
      throw new AuthorityError("startup-failed", "spawn-failed");
    }
    const relay = new AuthorityRelay(CONSTRUCT, child);
    await relay.#awaitReady();
    return relay;
  }

  get state(): RelayState {
    return this.#state;
  }

  /** The Authority's process id (public; tests check its lifetime). */
  get pid(): number | undefined {
    return this.#child.pid;
  }

  /** Last event sequence number received. */
  get cursor(): number {
    return this.#cursor;
  }

  /** The relay's running digest of every event received (= the scheduler's log digest). */
  get digest(): string {
    return this.#digest.toString("hex");
  }

  /** The Authority's exit, once it has exited. */
  get exit(): { readonly code: number | null; readonly signal: string | null } | null {
    return this.#exit;
  }

  /** Resolves once the Authority process has exited. */
  exited(): Promise<void> {
    return this.#exited;
  }

  /** Starts the Authority's scheduler (once). Returns the chain's public facts. */
  async start(options: StartArguments): Promise<Record<string, unknown>> {
    return this.#call({ op: "start", ...options }, START_TIMEOUT_MS);
  }

  /** The public snapshot at the Authority's current tick, and its event-log digest. */
  async snapshot(): Promise<{
    readonly snapshot: Record<string, unknown>;
    readonly digest: string;
  }> {
    const r = await this.#call({ op: "snapshot" });
    const snapshot = r.snapshot as Record<string, unknown>;
    const digest = r.digest as string;
    if (snapshot.lastSeq === this.#cursor && digest !== this.digest) {
      throw this.#fail(new AuthorityError("sequence-gap", "digest-mismatch"));
    }
    if ((snapshot.lastSeq as number) < this.#cursor) {
      throw this.#fail(new AuthorityError("sequence-gap", "cursor-ahead"));
    }
    return Object.freeze({ snapshot, digest });
  }

  /** The next events after the relay's cursor (at most `limit`), checked for continuity. */
  async events(limit: number = MAX_EVENTS_PER_BATCH): Promise<EventBatch> {
    const r = await this.#call({ op: "events", after: this.#cursor, limit });
    const events = r.events as Record<string, unknown>[];
    const tick = r.tick as number;
    const lastSeq = r.lastSeq as number;
    let seq = this.#cursor;
    let last = this.#lastTick;
    for (const e of events) {
      const t = e.tick as number;
      if (e.seq !== seq + 1 || t < last || t > tick) {
        throw this.#fail(new AuthorityError("sequence-gap", "out-of-sequence"));
      }
      seq += 1;
      last = t;
    }
    if (events.length > limit || seq > lastSeq || (r.more === false && seq !== lastSeq)) {
      throw this.#fail(new AuthorityError("sequence-gap", "incomplete-batch"));
    }
    for (const e of events) {
      this.#digest = createHash("sha256")
        .update(this.#digest)
        .update(JSON.stringify(e), "utf8")
        .digest();
    }
    this.#cursor = seq;
    this.#lastTick = last;
    return Object.freeze({ tick, lastSeq, events: Object.freeze(events), more: r.more as boolean });
  }

  /** Owner stop: the Authority halts its scheduler at once. */
  async stop(): Promise<string> {
    return (await this.#call({ op: "stop" })).state as string;
  }

  /** Owner shutdown: the Authority stops, closes its worker and exits. */
  async shutdown(): Promise<void> {
    if (this.#state !== "ready") throw this.#unusable();
    await this.#call({ op: "shutdown" });
    this.#state = "closed";
    const timer = setTimeout(() => this.#kill(), EXIT_WAIT_MS);
    await this.#exited;
    clearTimeout(timer);
  }

  /** Kills the Authority (its chain is gone); the relay ends as `closed`. */
  async terminate(): Promise<void> {
    if (this.#state === "starting" || this.#state === "ready") this.#state = "closed";
    this.#rejectPending(new AuthorityError("closed"));
    this.#kill();
    await this.#exited;
  }

  toJSON(): { relay: string; state: RelayState } {
    return { relay: "AuthorityRelay", state: this.#state };
  }

  [INSPECT](): string {
    return `AuthorityRelay(${this.#state})`;
  }

  // ---- Internals ------------------------------------------------------------------------------

  #awaitReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#ready = null;
        reject(this.#fail(new AuthorityError("startup-failed", "startup-timeout")));
      }, STARTUP_TIMEOUT_MS);
      this.#ready = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
  }

  #unusable(): AuthorityError {
    return (
      this.#failure ??
      new AuthorityError(this.#state === "lost" ? "authority-lost" : "closed", this.#state)
    );
  }

  /** One command at a time; the reply must answer exactly this command. */
  #call(
    partial: Record<string, unknown> & { op: AuthorityOp },
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const run = async (): Promise<Record<string, unknown>> => {
      if (this.#state !== "ready") throw this.#unusable();
      const id = this.#nextId++;
      let frame: Uint8Array;
      try {
        frame = encodeCommand({ ...partial, id } as unknown as AuthorityCommand);
      } catch (error) {
        throw error instanceof AuthorityError ? error : new AuthorityError("invalid-argument");
      }
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(this.#fail(new AuthorityError("timeout", partial.op)));
        }, timeoutMs);
        this.#pending = { id, op: partial.op, resolve, reject, timer };
        try {
          this.#pipe.write(frame);
        } catch {
          reject(this.#fail(new AuthorityError("authority-lost", "write-failed")));
        }
      });
    };
    const result = this.#busy.then(run, run);
    this.#busy = result.catch(() => undefined);
    return result;
  }

  #receive(chunk: Uint8Array): void {
    if (this.#state === "failed" || this.#state === "lost") return;
    let bodies: Uint8Array[];
    try {
      bodies = this.#decoder.push(chunk);
    } catch {
      this.#fail(new AuthorityError("protocol-violation", "frame-invalid"));
      return;
    }
    for (const body of bodies) {
      let reply: protocol.AuthorityReply;
      try {
        reply = parseReply(body, this.#pending?.op ?? null);
      } catch {
        this.#fail(new AuthorityError("protocol-violation", "reply-invalid"));
        return;
      }
      if (reply.type === "ready") {
        if (this.#state !== "starting" || this.#ready === null) {
          this.#fail(new AuthorityError("protocol-violation", "unexpected-ready"));
          return;
        }
        this.#state = "ready";
        const ready = this.#ready;
        this.#ready = null;
        ready.resolve();
        continue;
      }
      if (reply.type === "fatal") {
        this.#fail(new AuthorityError("authority-failed", reply.code));
        return;
      }
      const p = this.#pending;
      if (p === null || reply.re !== p.id) {
        this.#fail(new AuthorityError("protocol-violation", "unexpected-reply"));
        return;
      }
      this.#pending = null;
      clearTimeout(p.timer);
      if (reply.type === "rejected") {
        if (reply.code === "events-unavailable") {
          p.reject(this.#fail(new AuthorityError("sequence-gap", "events-unavailable")));
        } else {
          p.reject(new AuthorityError("rejected", reply.code));
        }
      } else {
        p.resolve(reply.result);
      }
    }
  }

  /** Fails closed: kills the Authority, ends the relay as `failed`. Returns the error. */
  #fail(error: AuthorityError): AuthorityError {
    if (this.#state === "failed" || this.#state === "lost") return this.#failure ?? error;
    if (this.#state !== "closed") {
      this.#state = "failed";
      this.#failure = error;
    }
    this.#rejectPending(error);
    this.#kill();
    return error;
  }

  /** The Authority exited or its pipe closed. */
  #lost(): void {
    if (this.#state === "starting" || this.#state === "ready") {
      this.#state = "lost";
      this.#failure = new AuthorityError("authority-lost", "authority-exited");
    }
    this.#rejectPending(this.#failure ?? new AuthorityError("closed"));
  }

  #rejectPending(error: AuthorityError): void {
    const p = this.#pending;
    this.#pending = null;
    if (p !== null) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    const r = this.#ready;
    this.#ready = null;
    r?.reject(error);
  }

  #kill(): void {
    try {
      if (this.#exit === null) this.#child.kill();
    } catch {
      // gone
    }
  }
}

Object.freeze(AuthorityRelay);
Object.freeze(AuthorityRelay.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
