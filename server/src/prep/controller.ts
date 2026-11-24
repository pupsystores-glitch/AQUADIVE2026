// Development-only controller of the offline RoundScript preparation worker (P8-4b-0). PLAY MONEY
// ONLY; OFFLINE DEVELOPMENT AND TESTING ONLY. Nothing in the application startup, the HTTP routes
// or the WebSocket gateway imports it (a boundary test checks it). It is not a scheduler: it has
// no clock, no timer, no look-ahead policy and no round lifecycle; it only runs preparations off
// the main thread on request.
//
// `PrepWorkerController.start(options)`:
//
// 1. validates the options (exactly `mode`, `chain`, optional `chainLength`, `maxInFlight`;
//    no path, entry, code, module or runtime is accepted) and refuses a production NODE_ENV;
// 2. verifies the compiled build against the TRUSTED integrity manifest on the main thread too
//    (P8-4a-1): the manifest must name the worker's own files (src/prep is protected since
//    P8-4b-0), every protected file must match it, and every module this controller loaded,
//    transitively, must be a manifest file at its exact path. Like the loader's own check, it
//    cannot vouch for code already running (A-1);
// 3. starts ONE worker thread from the fixed compiled entry next to this file
//    (<build>/server/src/prep/prep-worker.js; no eval, no inherited execArgv), which loads and
//    verifies the engine runtime itself, creates its private environment and chain, and reports
//    `ready`.
//
// `prepare(requestId, saltHex)` sends one request. The controller refuses — without sending
// anything, so no index is reserved — a malformed id or salt, a request id it has seen before,
// and any request beyond `maxInFlight` (≤ 2) outstanding (`backpressure`; there is no queue).
// The result is the worker's canonical bytes re-parsed and fully re-validated here
// (RoundScriptVerification with the reported digest): a RoundScript of this worker's chain whose
// index is exactly the previous one + 1 — a skipped, repeated or foreign index is a protocol
// violation.
//
// Failure behaviour (fail closed; no production D10 / OD-11 / OD-8 policy is implemented):
//
// - a fixed-code failure the worker reports rejects that request (`preparation-failed`, with the
//   worker's `indexState`); if it touched an index, the worker halts and so does the controller;
// - a worker crash, unexpected exit, contract violation or `terminate()` rejects EVERY pending
//   request as INDETERMINATE (`worker-lost` / `protocol-violation` / `worker-terminated`) and
//   ends the controller for good. Its chain lived only in the worker's memory and is gone; the
//   controller never restarts a worker and never retries a request.
//
// The worker thread isolates the main event loop from round preparation; it is not a security
// boundary against compromised code running in this process.
//
// P8-4b-1 (lifecycle and verification):
//
// - every worker event — message, error, exit — goes through ONE serial queue, in arrival order:
//   a `prepared` result is verified in slices of DEFAULT_VERIFICATION_BUDGET operations
//   (RoundScriptVerification), yielding to the event loop between them, and no later event (a
//   second result, `failed`, `closed`, `exit`) is handled before it is finished;
//   the received bytes are zeroed right after their private copy is taken;
// - `terminate()` or any terminal failure during a verification cancels it (its copy is zeroed)
//   and nothing is delivered: the request is rejected as INDETERMINATE, never retried;
// - a worker that halted (`worker-halted`, or any failure that touched an index) halts the
//   controller too;
// - `start()` fails with `startup-timeout` if the worker is not ready within
//   PREP_START_TIMEOUT_MS (30 s, fixed);
// - at most chainLength + REQUEST_ID_SLACK request ids are retained, none evicted; once they are
//   used up every new request is refused (`request-ids-exhausted`) without being sent.

import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createNodeFairnessCrypto } from "../fairness/crypto-node";
import type { FairnessHashProvider } from "../fairness";
import { REQUIRED_PROTECTED_FILES } from "../round/engine-runtime";
import { RoundScriptError } from "../round/errors";
import { assertLoadedClosure, readTrustedManifest, verifyBuildIntegrity } from "../round/integrity";
import {
  DEFAULT_VERIFICATION_BUDGET,
  RoundScriptVerification,
  type RoundScript,
} from "../round/round-script";
import {
  DEFAULT_PREP_CHAIN_LENGTH,
  MAX_IN_FLIGHT_LIMIT,
  PREP_CONTROLLER_LOCATION,
  PREP_PROTECTED_FILES,
  PREP_PROTOCOL_VERSION,
  PUBLIC_TEST_VECTOR_CHAIN_LENGTH,
  PrepWorkerError,
  REQUEST_ID_PATTERN,
  SALT_HEX_PATTERN,
  parseWorkerConfig,
  parseWorkerMessage,
  type ClosedMessage,
  type PrepChainSource,
  type PrepMode,
  type PrepWorkerConfig,
  type PrepWorkerErrorCode,
  type PreparedMessage,
  type ReadyMessage,
  type WorkerMessage,
} from "./protocol";

/** The worker's compiled entry, next to this file (no caller can choose another). */
export const PREP_WORKER_ENTRY = "prep-worker.js";
/** How long `start()` waits for the worker's `ready` (fixed; not an option). */
export const PREP_START_TIMEOUT_MS = 30_000;
/** Request ids retained beyond the chain length (for requests that reserve no index). */
export const REQUEST_ID_SLACK = 64;

export interface PrepWorkerOptions {
  readonly mode: PrepMode;
  readonly chain: PrepChainSource;
  /** Random chains only (default 1,024); the public vector chain has 8 links. */
  readonly chainLength?: number;
  /** 1 or 2 (default 2, the look-ahead bound). */
  readonly maxInFlight?: number;
}

/** Public facts of the worker's chain and thread. */
export interface PrepChainInfo {
  readonly chainId: string;
  readonly chainLength: number;
  readonly fv: number;
  readonly threadId: number;
}

/** One prepared round. The script's content is SECRET until the round's reveal. */
export interface PreparedRound {
  readonly requestId: string;
  readonly chainIndex: number;
  readonly script: RoundScript;
}

export type PrepControllerState =
  "ready" | "halted" | "closing" | "closed" | "failed" | "terminated";

const OPTION_KEYS = ["mode", "chain", "chainLength", "maxInFlight"];
const CONSTRUCT: object = Object.freeze(Object.create(null));
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

function configOf(options: unknown): PrepWorkerConfig {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new PrepWorkerError("invalid-request", "invalid-options");
  }
  const o = options as Record<string, unknown>;
  if (Reflect.ownKeys(o).some((k) => typeof k !== "string" || !OPTION_KEYS.includes(k))) {
    throw new PrepWorkerError("invalid-request", "invalid-options");
  }
  const vectors = o.chain === "public-test-vectors";
  try {
    return parseWorkerConfig({
      protocol: PREP_PROTOCOL_VERSION,
      mode: o.mode,
      chain: o.chain,
      chainLength:
        o.chainLength ?? (vectors ? PUBLIC_TEST_VECTOR_CHAIN_LENGTH : DEFAULT_PREP_CHAIN_LENGTH),
      maxInFlight: o.maxInFlight ?? MAX_IN_FLIGHT_LIMIT,
    });
  } catch {
    throw new PrepWorkerError("invalid-request", "invalid-options");
  }
}

/** <build> of <build>/server/src/prep/controller.js. */
const buildRoot = (): string => join(__dirname, "..", "..", "..");

interface Pending {
  readonly resolve: (round: PreparedRound) => void;
  readonly reject: (error: PrepWorkerError) => void;
}

type WorkerEvent =
  | { readonly kind: "message"; readonly raw: unknown }
  | { readonly kind: "error" }
  | { readonly kind: "exit"; readonly code: number };

/** One turn of the event loop (between verification slices). */
const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export class PrepWorkerController {
  readonly chain: PrepChainInfo;
  readonly maxInFlight: number;
  readonly #worker: Worker;
  readonly #hash: FairnessHashProvider;
  readonly #pending = new Map<string, Pending>();
  readonly #used = new Set<string>();
  /** chainLength + REQUEST_ID_SLACK: the most request ids this controller ever retains. */
  readonly #idLimit: number;
  /** Worker events not yet handled, in arrival order (see the file comment). */
  readonly #events: WorkerEvent[] = [];
  #draining = false;
  /** An `error` or `exit` event arrived (it may still wait behind a verification). */
  #lost = false;
  #state: PrepControllerState = "ready";
  #lastIndex = 0;
  #closed: ClosedMessage | null = null;
  #closeWaiters: { resolve: (c: ClosedMessage) => void; reject: (e: PrepWorkerError) => void }[] =
    [];

  /** Use `PrepWorkerController.start`. Refused without the module-private capability. */
  private constructor(
    capability: unknown,
    worker: Worker,
    config: PrepWorkerConfig,
    ready: ReadyMessage,
    hash: FairnessHashProvider,
  ) {
    if (capability !== CONSTRUCT)
      throw new PrepWorkerError("invalid-request", "construction-refused");
    this.#worker = worker;
    this.#hash = hash;
    this.maxInFlight = config.maxInFlight;
    this.chain = Object.freeze({
      chainId: ready.chainId,
      chainLength: ready.chainLength,
      fv: ready.fv,
      threadId: ready.threadId,
    });
    this.#idLimit = ready.chainLength + REQUEST_ID_SLACK;
    worker.on("message", (raw: unknown) => this.#push({ kind: "message", raw }));
    worker.on("error", () => this.#push({ kind: "error" }));
    worker.on("exit", (code: number) => this.#push({ kind: "exit", code }));
    Object.freeze(this);
  }

  /** Starts a worker and resolves once it reported `ready` (see the file comment). */
  static start(options: PrepWorkerOptions): Promise<PrepWorkerController> {
    let config: PrepWorkerConfig;
    let hash: FairnessHashProvider;
    try {
      config = configOf(options);
      if (process.env.NODE_ENV === "production") {
        throw new PrepWorkerError("development-only", "production-refused");
      }
      hash = createNodeFairnessCrypto().hash;
      try {
        const root = buildRoot();
        const manifest = readTrustedManifest(root, [
          ...REQUIRED_PROTECTED_FILES,
          ...PREP_PROTECTED_FILES,
        ]);
        verifyBuildIntegrity(root, manifest, hash);
        assertLoadedClosure(root, manifest, require.cache, [PREP_CONTROLLER_LOCATION]);
      } catch (error) {
        throw new PrepWorkerError(
          "start-failed",
          error instanceof RoundScriptError ? error.code : "runtime-integrity-failed",
        );
      }
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(__dirname, PREP_WORKER_ENTRY), {
        workerData: config,
        eval: false,
        execArgv: [],
        argv: [],
        stdin: false,
        name: "aquadive-prep",
      });
      let settled = false;
      // Fixed startup bound: a worker that never reports is terminated, never waited on forever.
      const timer = setTimeout(
        () => settle(new PrepWorkerError("start-failed", "startup-timeout")),
        PREP_START_TIMEOUT_MS,
      );
      const settle = (error: PrepWorkerError | null, controller?: PrepWorkerController) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.off("message", onMessage);
        worker.off("error", onError);
        worker.off("exit", onExit);
        if (error === null) {
          resolve(controller!);
        } else {
          void worker.terminate();
          reject(error);
        }
      };
      const onMessage = (raw: unknown) => {
        let message: WorkerMessage;
        try {
          message = parseWorkerMessage(raw);
        } catch {
          return settle(new PrepWorkerError("start-failed", "protocol-violation"));
        }
        if (message.type === "fatal") {
          return settle(new PrepWorkerError("start-failed", message.reason ?? message.code));
        }
        if (message.type !== "ready") {
          return settle(new PrepWorkerError("start-failed", "protocol-violation"));
        }
        // Listeners are swapped synchronously: no later message is missed.
        settle(null, new PrepWorkerController(CONSTRUCT, worker, config, message, hash));
      };
      const onError = () => settle(new PrepWorkerError("start-failed", "worker-error"));
      const onExit = () => settle(new PrepWorkerError("start-failed", "worker-exited"));
      worker.on("message", onMessage);
      worker.on("error", onError);
      worker.on("exit", onExit);
    });
  }

  get state(): PrepControllerState {
    return this.#state;
  }

  /** Requests sent and not yet answered (never more than `maxInFlight`). */
  get inFlight(): number {
    return this.#pending.size;
  }

  /** Prepares the next round of the worker's chain (see the file comment). */
  prepare(requestId: string, saltHex: string): Promise<PreparedRound> {
    if (this.#state !== "ready") {
      return Promise.reject(new PrepWorkerError("not-ready", this.#state));
    }
    if (this.#lost) {
      // The worker's error / exit is queued behind a verification: send nothing more.
      return Promise.reject(new PrepWorkerError("not-ready", "worker-lost"));
    }
    if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
      return Promise.reject(new PrepWorkerError("invalid-request", "invalid-request-id"));
    }
    if (typeof saltHex !== "string" || !SALT_HEX_PATTERN.test(saltHex)) {
      return Promise.reject(new PrepWorkerError("invalid-request", "invalid-salt"));
    }
    if (this.#used.has(requestId)) {
      return Promise.reject(new PrepWorkerError("request-replayed"));
    }
    if (this.#used.size >= this.#idLimit) {
      return Promise.reject(new PrepWorkerError("request-ids-exhausted"));
    }
    if (this.#pending.size >= this.maxInFlight) {
      return Promise.reject(new PrepWorkerError("backpressure"));
    }
    this.#used.add(requestId);
    return new Promise<PreparedRound>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      this.#worker.postMessage({ type: "prepare", requestId, saltHex });
    });
  }

  /**
   * Graceful shutdown: the worker finishes the requests already sent, closes its environment
   * (its in-memory chain is discarded) and exits. Resolves with its final public counters.
   */
  close(): Promise<ClosedMessage> {
    if (this.#state === "closed" && this.#closed !== null) return Promise.resolve(this.#closed);
    if (this.#state !== "ready" && this.#state !== "halted" && this.#state !== "closing") {
      return Promise.reject(new PrepWorkerError("not-ready", this.#state));
    }
    return new Promise((resolve, reject) => {
      this.#closeWaiters.push({ resolve, reject });
      if (this.#state !== "closing") {
        this.#state = "closing";
        this.#worker.postMessage({ type: "shutdown" });
      }
    });
  }

  /**
   * Stops the worker immediately. Every pending request is rejected as INDETERMINATE
   * (`worker-terminated`): its index may be untouched, reserved, prepared or classified, and the
   * chain is lost with the worker. Nothing is retried.
   */
  async terminate(): Promise<void> {
    this.#fail("worker-terminated", "terminated-by-owner");
    await this.#worker.terminate();
  }

  toJSON(): { controller: string; state: PrepControllerState } {
    return { controller: "PrepWorkerController", state: this.#state };
  }

  [INSPECT](): string {
    return `PrepWorkerController(${this.#state})`;
  }

  /** True once nothing more is handled: every pending request has been settled. */
  #ended(): boolean {
    return this.#state === "failed" || this.#state === "terminated" || this.#state === "closed";
  }

  /** Queues one worker event; handles the queue unless it is already being handled. */
  #push(event: WorkerEvent): void {
    if (event.kind !== "message") this.#lost = true;
    if (this.#ended()) return PrepWorkerController.#discard(event);
    this.#events.push(event);
    if (!this.#draining) void this.#drain();
  }

  /** Strictly one event at a time, in arrival order; a verification finishes before the next. */
  async #drain(): Promise<void> {
    this.#draining = true;
    try {
      while (this.#events.length > 0) {
        const event = this.#events.shift()!;
        if (this.#ended()) {
          PrepWorkerController.#discard(event);
          continue;
        }
        if (event.kind === "error") this.#fail("worker-lost", "worker-error");
        else if (event.kind === "exit") this.#exited(event.code);
        else await this.#receive(event.raw);
      }
    } catch {
      // Not reachable by design (#receive settles everything itself); fail closed regardless.
      this.#fail("protocol-violation", "controller-error");
    } finally {
      this.#draining = false;
    }
  }

  /** An event that arrived after the end: an owned result buffer is still zeroed. */
  static #discard(event: WorkerEvent): void {
    if (event.kind !== "message") return;
    try {
      const message = parseWorkerMessage(event.raw);
      if (message.type === "prepared") message.bytes.fill(0);
    } catch {
      // Not a contract message: nothing of ours to clear.
    }
  }

  async #receive(raw: unknown): Promise<void> {
    let message: WorkerMessage;
    try {
      message = parseWorkerMessage(raw);
    } catch {
      return this.#fail("protocol-violation", "invalid-message");
    }
    switch (message.type) {
      case "prepared": {
        const pending = this.#pending.get(message.requestId);
        if (pending === undefined) {
          message.bytes.fill(0);
          return this.#fail("protocol-violation", "unknown-request");
        }
        const script = await this.#verify(message);
        // Refused (protocol violation) or cancelled: settled already. Ended in the last slice (a
        // re-entrant terminate): the request was rejected as INDETERMINATE; nothing is delivered.
        if (script === null || this.#ended()) return;
        if (
          script.public.chainId !== this.chain.chainId ||
          script.public.chainIndex !== message.chainIndex ||
          message.chainIndex !== this.#lastIndex + 1
        ) {
          return this.#fail("protocol-violation", "index-sequence");
        }
        this.#lastIndex = message.chainIndex;
        this.#pending.delete(message.requestId);
        pending.resolve(
          Object.freeze({ requestId: message.requestId, chainIndex: message.chainIndex, script }),
        );
        return;
      }
      case "failed": {
        const pending = this.#pending.get(message.requestId);
        if (pending === undefined) return this.#fail("protocol-violation", "unknown-request");
        if (message.indexState === "consumed") {
          if (message.chainIndex !== this.#lastIndex + 1) {
            return this.#fail("protocol-violation", "index-sequence");
          }
          this.#lastIndex = message.chainIndex!;
        }
        // The worker halted (it touched an index, or reports that it is halted): so does this.
        if (
          (message.indexState !== "untouched" || message.code === "worker-halted") &&
          this.#state === "ready"
        ) {
          this.#state = "halted";
        }
        this.#pending.delete(message.requestId);
        pending.reject(
          new PrepWorkerError("preparation-failed", message.code, {
            indexState: message.indexState,
            chainIndex: message.chainIndex,
            indeterminate: message.indexState === "unknown",
          }),
        );
        return;
      }
      case "closed": {
        if (this.#state !== "closing" || this.#pending.size > 0 || this.#closed !== null) {
          return this.#fail("protocol-violation", "unexpected-close");
        }
        this.#closed = Object.freeze({ ...message });
        return; // the exit event completes the close
      }
      default:
        // ready / fatal / rejected after start: the controller never sends malformed messages.
        return this.#fail("protocol-violation", "unexpected-message");
    }
  }

  /**
   * Verifies one result in slices of DEFAULT_VERIFICATION_BUDGET operations, yielding to the
   * event loop between them. Null if it was refused (the controller failed) or the controller
   * ended meanwhile (terminate: the request was already rejected as INDETERMINATE, and the
   * cancelled verification zeroed its copy). The received bytes were transferred to this thread,
   * so it owns them: they are zeroed as soon as the private copy exists (or the copy failed).
   */
  async #verify(message: PreparedMessage): Promise<RoundScript | null> {
    let verification: RoundScriptVerification;
    try {
      verification = RoundScriptVerification.begin(this.#hash, message.bytes, message.digest);
    } catch {
      this.#fail("protocol-violation", "result-invalid");
      return null;
    } finally {
      message.bytes.fill(0);
    }
    try {
      for (;;) {
        const script = verification.step(DEFAULT_VERIFICATION_BUDGET);
        // The caller resumes a microtask later and re-checks #ended() before it delivers.
        if (script !== null) return script;
        await nextTurn();
        if (this.#ended()) {
          verification.cancel();
          return null;
        }
      }
    } catch {
      this.#fail("protocol-violation", "result-invalid");
      return null;
    }
  }

  #exited(code: number): void {
    if (this.#state === "closing" && this.#closed !== null && code === 0) {
      this.#state = "closed";
      for (const w of this.#closeWaiters.splice(0)) w.resolve(this.#closed);
      return;
    }
    this.#fail("worker-lost", "worker-exited");
  }

  /** Terminal: every pending request becomes INDETERMINATE; the worker is stopped. */
  #fail(code: PrepWorkerErrorCode, reason: string): void {
    if (this.#state === "failed" || this.#state === "terminated" || this.#state === "closed") {
      return;
    }
    this.#state = code === "worker-terminated" ? "terminated" : "failed";
    for (const pending of this.#pending.values()) {
      pending.reject(new PrepWorkerError(code, reason, { indeterminate: true }));
    }
    this.#pending.clear();
    for (const w of this.#closeWaiters.splice(0)) {
      w.reject(new PrepWorkerError(code, reason, { indeterminate: true }));
    }
    void this.#worker.terminate();
  }
}
