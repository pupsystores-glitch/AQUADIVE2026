// Worker-thread entrypoint of offline RoundScript preparation (P8-4b-0). PLAY MONEY ONLY;
// OFFLINE DEVELOPMENT AND TESTING ONLY. Started only by controller.ts, from this fixed compiled
// location; it accepts no path, code, module or runtime from anyone. Message contract and
// validators: protocol.ts.
//
// Ownership. This thread creates the one OfflineRoundEnvironment it uses (P8-4a): the engine
// runtime is loaded and verified HERE (trusted integrity manifest, export surface, profile, one
// fairness instance, known answers — engine-runtime.ts); then this thread checks that the
// manifest names the worker's own files and that every module this entry loaded, transitively,
// is a manifest file at its exact path (src/prep is protected since P8-4b-0; A-1 and A-2 apply
// unchanged). The environment's ChainVault,
// MemoryChainStore and audit sink live and die in this thread. The worker creates its own chain
// (a fresh random development chain, or in test mode the public fv = 1 vector chain) and every
// request uses it: the vault assigns the index; no message names a chain or an index. Seeds,
// RoundKeys, derivations, RNG streams and the runtime never leave this thread. A prepared
// RoundScript leaves as canonical bytes (transferred, so this thread keeps no copy) and digest.
//
// Order and bounds. Requests run strictly one at a time in arrival order. At most
// `maxInFlight` (≤ 2) requests may be outstanding; one more is refused with `backpressure`
// BEFORE the vault is asked, so it reserves nothing.
//
// Failures (fail closed; NOT a production D10 / OD-11 policy). A failed request reports the fixed
// code and what it did to the chain, read from the vault's reservation frontier before and after.
// If it touched an index (`consumed`), or the frontier cannot be read (`unknown`), the worker
// HALTS: every later request is refused with `worker-halted` and reserves nothing (and a request
// refused because the frontier could not be read BEFORE it is reported as `worker-halted` with
// reason `chain-unavailable`, so the controller halts as well; P8-4b-1). Nothing is
// retried here or in the controller, so an ambiguous failure can never consume a fresh index.
// A crash of this thread loses its in-memory store, and with it every seed, reservation and
// disposition of its chain: the controller reports the pending requests as INDETERMINATE, never
// as completed or voided. Crash recovery is NOT provided (durable storage is P8-7).
//
// Isolation is for performance (the main event loop never runs a round). A worker thread shares
// the process: it is not a security boundary against compromised code in the same process.

import { join } from "node:path";
import {
  isMainThread,
  parentPort,
  threadId,
  workerData,
  type MessagePort,
} from "node:worker_threads";
import { hexToBytes } from "../fairness";
import { REQUIRED_PROTECTED_FILES } from "../round/engine-runtime";
import { RoundScriptError } from "../round/errors";
import { assertLoadedClosure, readTrustedManifest } from "../round/integrity";
import { createOfflineRoundEnvironment, type OfflineRoundEnvironment } from "../round/prepare";
import {
  PREP_PROTECTED_FILES,
  PREP_PROTOCOL_VERSION,
  PREP_WORKER_LOCATION,
  PrepWorkerError,
  parseMainMessage,
  parseWorkerConfig,
  type ClosedMessage,
  type FailedMessage,
  type IndexState,
  type PrepWorkerConfig,
  type PrepareMessage,
  type PreparedMessage,
  type WorkerFailureCode,
} from "./protocol";

const codeOf = (error: unknown): { code: WorkerFailureCode; reason: string | null } =>
  error instanceof RoundScriptError
    ? { code: error.code, reason: error.reason }
    : { code: "unexpected-error", reason: null };

class PreparationWorker {
  readonly #port: MessagePort;
  readonly #config: PrepWorkerConfig;
  readonly #env: OfflineRoundEnvironment;
  readonly #chainId: string;
  #queue: Promise<void> = Promise.resolve();
  #outstanding = 0;
  #halted = false;
  #shuttingDown = false;
  #prepared = 0;
  #failed = 0;

  constructor(
    port: MessagePort,
    config: PrepWorkerConfig,
    env: OfflineRoundEnvironment,
    chainId: string,
  ) {
    this.#port = port;
    this.#config = config;
    this.#env = env;
    this.#chainId = chainId;
    port.on("message", (raw: unknown) => this.#receive(raw));
  }

  #receive(raw: unknown): void {
    let message;
    try {
      message = parseMainMessage(raw);
    } catch {
      this.#port.postMessage({ type: "rejected", code: "invalid-message" });
      return;
    }
    if (message.type === "shutdown") {
      if (!this.#shuttingDown) {
        this.#shuttingDown = true;
        this.#enqueue(() => this.#finish());
      }
      return;
    }
    const refusal: WorkerFailureCode | null = this.#shuttingDown
      ? "shutting-down"
      : this.#halted
        ? "worker-halted"
        : this.#outstanding >= this.#config.maxInFlight
          ? "backpressure"
          : null;
    if (refusal !== null) {
      this.#postFailed(message.requestId, refusal, null, "untouched", null);
      return;
    }
    this.#outstanding += 1;
    this.#enqueue(async () => {
      try {
        await this.#prepare(message);
      } finally {
        this.#outstanding -= 1;
      }
    });
  }

  /** Strictly serial. A rejection here is a worker crash (fail closed), never swallowed. */
  #enqueue(task: () => Promise<void>): void {
    this.#queue = this.#queue.then(task);
  }

  async #frontier(): Promise<number | null> {
    try {
      return (await this.#env.chainStatus(this.#chainId)).lastReservedIndex;
    } catch {
      return null;
    }
  }

  async #prepare(message: PrepareMessage): Promise<void> {
    if (this.#halted) {
      this.#postFailed(message.requestId, "worker-halted", null, "untouched", null);
      return;
    }
    const before = await this.#frontier();
    if (before === null) {
      // Nothing was reserved yet, but the chain can no longer be read: stop, and say so — the
      // controller halts on `worker-halted` (P8-4b-1; the reason names the cause).
      this.#halted = true;
      this.#postFailed(message.requestId, "worker-halted", "chain-unavailable", "untouched", null);
      return;
    }
    let script;
    try {
      script = await this.#env.prepareScript(
        this.#chainId,
        message.requestId,
        hexToBytes(message.saltHex),
      );
    } catch (error) {
      const { code, reason } = codeOf(error);
      const after = await this.#frontier();
      const state: IndexState =
        after === null ? "unknown" : after === before ? "untouched" : "consumed";
      if (state !== "untouched") this.#halted = true;
      this.#failed += 1;
      this.#postFailed(message.requestId, code, reason, state, state === "consumed" ? after : null);
      return;
    }
    const bytes = script.secretCanonicalBytes();
    const prepared: PreparedMessage = {
      type: "prepared",
      requestId: message.requestId,
      chainIndex: script.public.chainIndex,
      digest: script.secretDigest(),
      bytes,
    };
    this.#prepared += 1;
    // Transferred: this thread's copy of the bytes is detached by the post.
    this.#port.postMessage(prepared, [bytes.buffer]);
  }

  #postFailed(
    requestId: string,
    code: WorkerFailureCode,
    reason: string | null,
    indexState: IndexState,
    chainIndex: number | null,
  ): void {
    const failed: FailedMessage = {
      type: "failed",
      requestId,
      code,
      reason,
      indexState,
      chainIndex,
    };
    this.#port.postMessage(failed);
  }

  async #finish(): Promise<void> {
    let status = null;
    try {
      status = await this.#env.chainStatus(this.#chainId);
    } catch {
      // Reported as null below.
    }
    this.#env.close();
    const closed: ClosedMessage = {
      type: "closed",
      prepared: this.#prepared,
      failed: this.#failed,
      lastReservedIndex: status?.lastReservedIndex ?? null,
      revealedCount: status?.revealedCount ?? null,
      chainState: status?.state ?? null,
    };
    this.#port.postMessage(closed);
    // Nothing else keeps the thread alive: it exits with code 0 once the port is closed.
    this.#port.close();
  }
}

async function start(port: MessagePort): Promise<void> {
  let config: PrepWorkerConfig;
  try {
    config = parseWorkerConfig(workerData);
  } catch {
    port.postMessage({ type: "fatal", code: "invalid-config", reason: null, detail: null });
    port.close();
    return;
  }
  let env: OfflineRoundEnvironment | null = null;
  try {
    // Loads and verifies the engine runtime in THIS thread (loadEngineRuntime, P8-4a-1).
    env = createOfflineRoundEnvironment({ mode: config.mode });
    // The worker's own closure, against the same trusted manifest (<build> of this file).
    const root = join(__dirname, "..", "..", "..");
    assertLoadedClosure(
      root,
      readTrustedManifest(root, [...REQUIRED_PROTECTED_FILES, ...PREP_PROTECTED_FILES]),
      require.cache,
      [PREP_WORKER_LOCATION],
    );
    const chain =
      config.chain === "public-test-vectors"
        ? await env.importPublicTestVectorChain()
        : await env.createChain({ length: config.chainLength });
    if (chain.length !== config.chainLength) throw new RoundScriptError("chain-unavailable");
    new PreparationWorker(port, config, env, chain.chainId);
    port.postMessage({
      type: "ready",
      protocol: PREP_PROTOCOL_VERSION,
      threadId,
      chainId: chain.chainId,
      chainLength: chain.length,
      fv: chain.fv,
    });
  } catch (error) {
    env?.close();
    const fixed =
      error instanceof RoundScriptError
        ? { reason: error.code, detail: error.reason }
        : { reason: "unexpected-error", detail: null };
    port.postMessage({ type: "fatal", code: "startup-failed", ...fixed });
    port.close();
  }
}

if (isMainThread || parentPort === null) {
  // Loaded outside a worker thread: do nothing but refuse.
  throw new PrepWorkerError("development-only", "not-a-worker-thread");
}
void start(parentPort);
