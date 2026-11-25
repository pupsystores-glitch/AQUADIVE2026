// The approved round source of the offline Global Round Scheduler (P8-4b-2): a minimal adapter
// over the existing PrepWorkerController (P8-4b-0 / P8-4b-1, unchanged; its message contract is
// not modified). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Not connected to the server's startup,
// HTTP routes or WebSocket gateway.
//
// `PrepWorkerRoundSource.start(options)` accepts exactly `mode`, `chain` and, for the random chain,
// `chainLength`, or, for the public vector chain (test mode only), `vectorSalt` ("A" / "B": the
// public FAIRNESS_DEV_VECTORS_V1 salts). No path, entry, worker, runtime, chain index, request id,
// salt or outcome can be chosen by a caller. It refuses a production NODE_ENV, verifies the build
// against the TRUSTED integrity manifest (which must name the scheduler's own compiled files; the
// scheduler is protected since P8-4b-2) and the loaded closure of this module, then starts ONE
// controller with `maxInFlight: 1`.
//
// SOURCE AUTHENTICITY (R-1 correction). A source has NO public method that binds a listener or
// requests a round. It is bound to its one scheduler through the module-private binder that
// `claimSourceBinder()` hands out ONCE per module instance; scheduler.ts claims it as it loads,
// so every later claim is refused (`invalid-state: binder-claimed`) and a scheduler module that
// finds it claimed fails to load (fail closed). Binding refuses anything but a source of this
// module (a private-field brand: no prototype, Proxy or WeakSet method is consulted), a source
// bound before, or one that is no longer ready. Every prepared script is sealed for THIS source
// (sealed.ts, `claimSourceSealing`, claimed as this module loads) and the binding's `owns` lets
// the scheduler admit only such seals. The class, its prototype and this module's CommonJS
// exports are frozen as it loads; the controller's API (start, prepare, state, close, terminate),
// the integrity checks, the protected-file lists, the public vector salts and the salt hash are
// bound once, as this module loads, so a later replacement of an export or prototype method of
// those modules is never reached. Their own internals — the controller's verifier, the worker
// message parser, the worker entry, class and environment — bind and freeze their references in
// turn (R-1b correction, prep/controller.ts, round/round-script.ts, round/canonical.ts); shared
// built-ins on the worker channel are not covered (A-1, server README §18).
//
// The request capability (returned once, by the binder, to the one scheduler) asks for round
// n = the previous request + 1,
// starting at 1 — never a skipped, repeated or concurrent round — with the request id
// `sched-round-<n>` (unique: one source per controller, n strictly increasing) and the salt
//
//   random chain:         lower-case hex of SHA-256( UTF-8("AQUADIVE|scheduler|salt|v1") ‖ 0x00
//                         ‖ chainId (32 bytes) ‖ u64be(n) )   — fixed by the chain and n
//   public vector chain:  the chosen public vector salt, for every round
//
// so the salt is never an input of the caller. The verified result must be chain index n of the
// worker's own chain; it is SEALED at once (sealed.ts) and handed to the scheduler's listener with
// nothing else. A failure is reported as one fixed kind:
//
//   lost                the worker crashed, exited or was terminated (the in-memory chain, and
//                       with it every unrevealed round's reveal, is gone)
//   preparation-failed  the worker reported a failure, or the controller stopped accepting
//   contract-violation  anything outside the contract (wrong index or chain, refused request)
//
// Nothing is retried; the worker is never restarted; a fulfilled preparation means a validated
// script with the expected index, NOT a durable disposition (P8-7). `checkHealth()` reports a
// worker loss that happened while no request was pending (the controller ends itself then). An
// unexpected error while a result is handed over (the listener throws) never becomes an
// unhandled rejection: the script is discarded unopened and the source stops (L-2 backstop).
//
// RECORDED RISK (SD-9; NOT mitigated, so no public or network activation). Round n + 1 is
// prepared in the worker and VERIFIED ON THIS THREAD (in slices) during round n's betting window.
// Both durations grow with round n + 1's secret dive length, so the arrival instant and the
// main-loop jitter they cause are a timing side channel on the next round's outcome; a near-miss
// of the admission deadline would likewise correlate (weakly) with it. Mitigation (constant-shape
// verification padding, fixed-time delivery) is a separate, owner-approved milestone.

import { join as joinExport } from "node:path";
import * as fairness from "../fairness";
import { createNodeFairnessCrypto as createNodeFairnessCryptoExport } from "../fairness/crypto-node";
import {
  PrepWorkerController as PrepWorkerControllerExport,
  type PreparedRound,
} from "../prep/controller";
import * as prepProtocol from "../prep/protocol";
import { REQUIRED_PROTECTED_FILES as REQUIRED_PROTECTED_FILES_EXPORT } from "../round/engine-runtime";
import { RoundScriptError as RoundScriptErrorExport } from "../round/errors";
import * as integrity from "../round/integrity";
import type { SchedulerChain } from "./core";
import { SchedulerError, type SourceFailure } from "./events";
import { claimSourceSealing, type SealedRound } from "./sealed";

// ---- R-1: every external reference this module calls, bound ONCE as it loads -----------------

type PrepWorkerController = PrepWorkerControllerExport;
const join = joinExport;
const { bytesToHex, hexToBytes, sha256 } = fairness;
const VECTOR_SALT_A_HEX: string = fairness.FAIRNESS_DEV_VECTORS_V1.saltAHex;
const VECTOR_SALT_B_HEX: string = fairness.FAIRNESS_DEV_VECTORS_V1.saltBHex;
const createNodeFairnessCrypto = createNodeFairnessCryptoExport;
const PrepWorkerError = prepProtocol.PrepWorkerError;
const RoundScriptError = RoundScriptErrorExport;
const { assertLoadedClosure, readTrustedManifest, verifyBuildIntegrity } = integrity;
const PROTECTED_FILES: readonly string[] = Object.freeze([
  ...REQUIRED_PROTECTED_FILES_EXPORT,
  ...prepProtocol.PREP_PROTECTED_FILES,
]);
const Controller = PrepWorkerControllerExport;
const controllerStart = Controller.start;
const controllerPrepare = Controller.prototype.prepare;
const controllerClose = Controller.prototype.close;
const controllerTerminate = Controller.prototype.terminate;
const controllerState = Object.getOwnPropertyDescriptor(Controller.prototype, "state")!.get!;
type ControllerState = PrepWorkerController["state"];
/** The controller's state through the bound getter (throws for anything but a controller). */
const stateOf = (c: PrepWorkerController): ControllerState =>
  Reflect.apply(controllerState, c, []) as ControllerState;
/** The seals' source capability (sealed.ts), claimed as this module loads. */
const sealing = claimSourceSealing();

/**
 * The scheduler's compiled files in the build: part of the TRUSTED integrity manifest's
 * protected set (server/src/scheduler; owner-approved P8-4b-2 expansion, integrity.ts).
 */
export const SCHEDULER_SOURCE_LOCATION = "server/src/scheduler/source.js";
export const SCHEDULER_DRIVER_LOCATION = "server/src/scheduler/scheduler.js";
export const SCHEDULER_PROTECTED_FILES = Object.freeze([
  "server/src/scheduler/clock.js",
  "server/src/scheduler/core.js",
  "server/src/scheduler/disclosure.js",
  "server/src/scheduler/events.js",
  SCHEDULER_DRIVER_LOCATION,
  "server/src/scheduler/sealed.js",
  SCHEDULER_SOURCE_LOCATION,
  "server/src/scheduler/timeline.js",
] as const);

export interface RoundSourceOptions {
  readonly mode: "development" | "test";
  readonly chain: "random" | "public-test-vectors";
  /** Random chain only (1 … 65,536; default 1,024). */
  readonly chainLength?: number;
  /** Public vector chain only (test mode): which public salt every round uses (default "A"). */
  readonly vectorSalt?: "A" | "B";
}

export type SourceEvent =
  | { readonly kind: "prepared"; readonly roundNumber: number; readonly sealed: SealedRound }
  | { readonly kind: "failed"; readonly roundNumber: number; readonly failure: SourceFailure };

export type SourceListener = (event: SourceEvent) => void;

export type RoundSourceState = "ready" | "ended" | "closed";

/** What the binder hands the one scheduler (R-1): its request capability and the seal check. */
export interface SourceAccess {
  /** Requests round `n` (see the file comment). */
  readonly request: (n: number) => void;
  /** True only for an unopened seal this source made (R-1; sealed.ts `sealedBy`). */
  readonly owns: (sealed: unknown) => boolean;
}

export type SourceBinder = (source: unknown, listener: SourceListener) => SourceAccess;

const OPTION_KEYS = ["mode", "chain", "chainLength", "vectorSalt"];
const SALT_DOMAIN = "AQUADIVE|scheduler|salt|v1";
const CONSTRUCT: object = Object.freeze(Object.create(null));
const INSPECT = Symbol.for("nodejs.util.inspect.custom");
/** Module-private (set by the class's static block; R-1): the binder and the brand check. */
let binder: SourceBinder | null = null;
let binderClaimed = false;
let isSource: (value: unknown) => boolean = () => false;

/** <build> of <build>/server/src/scheduler/source.js. */
const buildRoot = (): string => join(__dirname, "..", "..", "..");

/**
 * Verifies the build against the TRUSTED manifest, which must name the scheduler's files, and
 * the loaded closure of `entries` (scheduler locations). Throws `integrity-failed` with the
 * integrity layer's fixed reason. Like every in-process check it cannot vouch for code that
 * already runs (A-1); duplicate-instance detection has the A-2 limits.
 */
export function verifySchedulerBuild(entries: readonly string[]): void {
  try {
    const hash = createNodeFairnessCrypto().hash;
    const root = buildRoot();
    const manifest = readTrustedManifest(root, [...PROTECTED_FILES, ...SCHEDULER_PROTECTED_FILES]);
    verifyBuildIntegrity(root, manifest, hash);
    assertLoadedClosure(root, manifest, require.cache, entries);
  } catch (error) {
    throw new SchedulerError(
      "integrity-failed",
      error instanceof RoundScriptError ? (error.reason ?? error.code) : "runtime-integrity-failed",
    );
  }
}

const u64be = (n: number): Uint8Array => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n));
  return out;
};

export class PrepWorkerRoundSource {
  readonly chain: SchedulerChain;
  readonly #controller: PrepWorkerController;
  readonly #salt: ((round: number) => string) | null;
  readonly #fixedSalt: string | null;
  #listener: SourceListener | null = null;
  #claimed = false;
  #lastRequested = 0;
  #pending = false;
  #state: RoundSourceState = "ready";
  #lossReported = false;

  /** Use `PrepWorkerRoundSource.start`. */
  private constructor(
    capability: unknown,
    controller: PrepWorkerController,
    fixedSalt: string | null,
  ) {
    if (capability !== CONSTRUCT)
      throw new SchedulerError("source-not-approved", "construction-refused");
    this.#controller = controller;
    this.chain = Object.freeze({
      chainId: controller.chain.chainId,
      chainLength: controller.chain.chainLength,
      fv: controller.chain.fv,
    });
    this.#fixedSalt = fixedSalt;
    const hash = createNodeFairnessCrypto().hash;
    const chainId = hexToBytes(this.chain.chainId);
    const domain = new TextEncoder().encode(SALT_DOMAIN);
    this.#salt =
      fixedSalt !== null
        ? null
        : (round: number) => {
            const bytes = new Uint8Array(domain.length + 1 + chainId.length + 8);
            bytes.set(domain, 0);
            bytes[domain.length] = 0;
            bytes.set(chainId, domain.length + 1);
            bytes.set(u64be(round), domain.length + 1 + chainId.length);
            return bytesToHex(sha256(hash, bytes));
          };
    Object.freeze(this);
  }

  static {
    // R-1: the brand check is a private field, which no prototype, Proxy or WeakSet method can
    // fake, and the binder is the ONLY way to bind a listener or to request a round.
    isSource = (value: unknown): boolean =>
      typeof value === "object" && value !== null && #claimed in value;
    binder = (value: unknown, listener: SourceListener): SourceAccess => {
      if (!isSource(value)) throw new SchedulerError("source-not-approved");
      const source = value as PrepWorkerRoundSource;
      if (source.#claimed || typeof listener !== "function") {
        throw new SchedulerError("invalid-state", "source-claimed");
      }
      if (source.#state !== "ready") throw new SchedulerError("invalid-state", source.#state);
      source.#claimed = true;
      source.#listener = listener;
      return Object.freeze({
        request: (n: number) => source.#request(n),
        owns: (sealed: unknown) => sealing.sealedBy(sealed, source),
      });
    };
  }

  /** Starts the source (see the file comment). */
  static async start(options: RoundSourceOptions): Promise<PrepWorkerRoundSource> {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new SchedulerError("invalid-argument", "invalid-options");
    }
    const o = options as unknown as Record<string, unknown>;
    if (Reflect.ownKeys(o).some((k) => typeof k !== "string" || !OPTION_KEYS.includes(k))) {
      throw new SchedulerError("invalid-argument", "invalid-options");
    }
    if (process.env.NODE_ENV === "production") {
      throw new SchedulerError("development-only", "production-refused");
    }
    const vectors = o.chain === "public-test-vectors";
    if (o.chain !== "random" && !vectors) {
      throw new SchedulerError("invalid-argument", "invalid-options");
    }
    if (vectors ? o.chainLength !== undefined : o.vectorSalt !== undefined) {
      throw new SchedulerError("invalid-argument", "invalid-options");
    }
    let fixedSalt: string | null = null;
    if (vectors) {
      const which = o.vectorSalt ?? "A";
      if (which !== "A" && which !== "B")
        throw new SchedulerError("invalid-argument", "invalid-options");
      fixedSalt = which === "A" ? VECTOR_SALT_A_HEX : VECTOR_SALT_B_HEX;
    }
    verifySchedulerBuild([SCHEDULER_SOURCE_LOCATION]);
    let controller: PrepWorkerController;
    try {
      controller = (await Reflect.apply(controllerStart, Controller, [
        {
          mode: o.mode as "development" | "test",
          chain: o.chain as "random" | "public-test-vectors",
          ...(o.chainLength === undefined ? {} : { chainLength: o.chainLength as number }),
          maxInFlight: 1,
        },
      ])) as PrepWorkerController;
      stateOf(controller); // R-1: a real controller (the bound getter's brand), nothing else
    } catch (error) {
      throw new SchedulerError(
        "source-failed",
        error instanceof PrepWorkerError ? (error.reason ?? error.code) : "start-failed",
      );
    }
    return new PrepWorkerRoundSource(CONSTRUCT, controller, fixedSalt);
  }

  get state(): RoundSourceState {
    return this.#state;
  }

  /** Requests round `n` (see the file comment); reachable only through the binder's result. */
  #request(n: number): void {
    if (this.#state !== "ready") {
      return this.#emit({ kind: "failed", roundNumber: n, failure: "lost" });
    }
    if (n !== this.#lastRequested + 1 || this.#pending || n > this.chain.chainLength) {
      return this.#emit({ kind: "failed", roundNumber: n, failure: "contract-violation" });
    }
    this.#lastRequested = n;
    this.#pending = true;
    const salt = this.#fixedSalt ?? this.#salt!(n);
    (
      Reflect.apply(controllerPrepare, this.#controller, [
        `sched-round-${n}`,
        salt,
      ]) as Promise<PreparedRound>
    )
      .then(
        (round) => this.#prepared(n, round),
        (error: unknown) => this.#failed(n, error),
      )
      // Backstop (L-2): nothing of an asynchronous result may become an unhandled rejection.
      .catch(() => this.#fault());
  }

  /**
   * True once the worker is known to be lost (its controller ended without a close); reported
   * once. The scheduler calls it before it processes newer ticks.
   */
  checkHealth(): boolean {
    if (this.#lossReported) return false;
    const s = stateOf(this.#controller);
    if (s === "failed" || s === "terminated") {
      this.#lossReported = true;
      if (this.#state === "ready") this.#state = "ended";
      return true;
    }
    return false;
  }

  /** Graceful close: the worker drains and exits; its in-memory chain is discarded. */
  async close(): Promise<void> {
    if (this.#state === "closed") return;
    this.#state = "closed";
    const s = stateOf(this.#controller);
    if (s === "ready" || s === "halted" || s === "closing") {
      try {
        await Reflect.apply(controllerClose, this.#controller, []);
        return;
      } catch {
        // fall through: stop it
      }
    }
    await this.#terminateController();
  }

  /** Immediate stop (contract violations). */
  async terminate(): Promise<void> {
    this.#state = "closed";
    await this.#terminateController();
  }

  async #terminateController(): Promise<void> {
    try {
      await Reflect.apply(controllerTerminate, this.#controller, []);
    } catch {
      // already stopped
    }
  }

  toJSON(): { source: string; state: RoundSourceState } {
    return { source: "PrepWorkerRoundSource", state: this.#state };
  }

  [INSPECT](): string {
    return `PrepWorkerRoundSource(${this.#state})`;
  }

  #prepared(n: number, round: PreparedRound): void {
    this.#pending = false;
    const p = round.script.public;
    if (
      round.chainIndex !== n ||
      p.chainIndex !== n ||
      p.chainId !== this.chain.chainId ||
      p.fv !== this.chain.fv ||
      round.requestId !== `sched-round-${n}`
    ) {
      return this.#emit({ kind: "failed", roundNumber: n, failure: "contract-violation" });
    }
    let sealed: SealedRound;
    try {
      sealed = sealing.seal(round.script, this); // R-1: sealed for THIS source only
    } catch {
      return this.#emit({ kind: "failed", roundNumber: n, failure: "contract-violation" });
    }
    this.#emit({ kind: "prepared", roundNumber: n, sealed });
  }

  #failed(n: number, error: unknown): void {
    this.#pending = false;
    let failure: SourceFailure = "contract-violation";
    if (error instanceof PrepWorkerError) {
      switch (error.code) {
        case "worker-lost":
        case "worker-terminated":
          failure = "lost";
          break;
        case "preparation-failed":
          failure = "preparation-failed";
          break;
        case "not-ready": {
          const s = stateOf(this.#controller);
          failure = s === "failed" || s === "terminated" ? "lost" : "preparation-failed";
          break;
        }
        default:
          failure = "contract-violation";
      }
    }
    if (failure === "lost") {
      this.#lossReported = true;
      if (this.#state === "ready") this.#state = "ended";
    }
    this.#emit({ kind: "failed", roundNumber: n, failure });
  }

  /**
   * Hands one result to the scheduler. If the listener throws (the scheduler contains its own
   * failures, so this is a backstop), the script is discarded unopened and the source stops.
   */
  #emit(event: SourceEvent): void {
    try {
      this.#listener?.(Object.freeze(event));
    } catch {
      if (event.kind === "prepared") event.sealed.discard();
      this.#fault();
    }
  }

  /** Fail closed after an unexpected error: stop the worker; nothing is retried. */
  #fault(): void {
    void this.terminate();
  }
}

/** True only for sources created by `PrepWorkerRoundSource.start` (a private-field brand). */
export const isApprovedSource = (value: unknown): value is PrepWorkerRoundSource => isSource(value);

/**
 * INTERNAL to the scheduler (R-1): returns the source binder exactly ONCE per module instance
 * (scheduler.ts claims it as it loads; see the file comment). Every later call is refused.
 */
export function claimSourceBinder(): SourceBinder {
  if (binderClaimed || binder === null) throw new SchedulerError("invalid-state", "binder-claimed");
  binderClaimed = true;
  const bind = binder;
  binder = null;
  return bind;
}

// R-1: nothing of this module can be replaced once it has loaded (see the file comment).
Object.freeze(PrepWorkerRoundSource);
Object.freeze(PrepWorkerRoundSource.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
