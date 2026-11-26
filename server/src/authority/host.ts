// The offline Isolated Authority Host (Stage 1). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Runs
// ONLY inside the Authority child process (authority-main.ts), never in the application process.
// Not connected to the server's startup, HTTP routes or WebSocket gateway; no reveal protocol
// (P8-4b-3), no betting, cashout, wallet, settlement or persistence.
//
// The host owns, inside the Authority process:
//
// - the one GlobalRoundScheduler and its PrepWorkerRoundSource (P8-4b-2, unchanged): the
//   preparation worker thread, the controller's verification, the sealed scripts, the disclosure
//   cursor and the chain all live here, and nothing of them is ever sent;
// - the clock. `monotonic`: the real monotonic clock (process.hrtime), polled by the host's own
//   loop every POLL_INTERVAL_MS and before every reply. `replay` (TEST ONLY; public vector chain
//   and test mode only): a SimulatedClock the host itself advances one tick (+1 ns) per poll and
//   holds while a requested script is not yet delivered — the deterministic pacing of the P8-4b-2
//   vector tests, so the public vectors A / B give their pinned event-log digests. No command
//   reads, sets or advances either clock.
//
// Commands (protocol.ts) run strictly one at a time, in arrival order. A reply carries only what
// the scheduler's public API exposes at the current tick: the public snapshot, the public events
// (each with tick ≤ the current tick), the public event-log digest and the chain's public id.
// The scheduler's internal residency diagnostics are used only by the replay pacing, never sent.
//
// Fail closed (`fail`): a malformed frame, a channel failure (the application closed the pipe or
// died), a bound exceeded or an unexpected error halts the scheduler at once (owner stop: the
// active round is interrupted), terminates the worker — its in-memory chain is gone — and exits
// the process with a fixed code. Nothing is retried, restarted or resumed.

import { GlobalRoundScheduler as SchedulerExport } from "../scheduler/scheduler";
import { PrepWorkerRoundSource as SourceExport } from "../scheduler/source";
import {
  SimulatedClock as SimulatedClockExport,
  createMonotonicClock as createMonotonicClockExport,
  type MonotonicClock,
} from "../scheduler/clock";
import { SchedulerError as SchedulerErrorExport } from "../scheduler/events";
import * as protocol from "./protocol";
import type { AuthorityCommand, FatalCode, RejectionCode, StartArguments } from "./protocol";

// Bound once, as this module loads.
const GlobalRoundScheduler = SchedulerExport;
type GlobalRoundScheduler = SchedulerExport;
const PrepWorkerRoundSource = SourceExport;
type PrepWorkerRoundSource = SourceExport;
const SimulatedClock = SimulatedClockExport;
const createMonotonicClock = createMonotonicClockExport;
const SchedulerError = SchedulerErrorExport;
const {
  AUTHORITY_EXIT,
  FrameDecoder,
  MAX_COMMAND_BYTES,
  MAX_OUTBOUND_BUFFER_BYTES,
  MAX_QUEUED_COMMANDS,
  MAX_REJECTED_COMMANDS,
  encodeFatal,
  encodeReady,
  encodeRejected,
  encodeResult,
  isFrameError,
  parseCommand,
} = protocol;
const hrtime = process.hrtime.bigint;
const setTimeoutBound = setTimeout;
const clearTimeoutBound = clearTimeout;
const setImmediateBound = setImmediate;

/** Real-clock poll interval of the host's loop (ms; timer granularity varies by platform). */
export const POLL_INTERVAL_MS = 4;
/** Replay: ticks processed per macrotask before commands are served again. */
const REPLAY_SLICE_TICKS = 600;
/** Replay: real time a requested script may take before the pacing moves on (ns). */
const REPLAY_DELIVERY_LIMIT_NS = 30_000_000_000n;
const NS_PER_TICK = 1_000_000_000n / 60n;
/** Bound on the graceful close at shutdown / fail closed (ms). */
const CLOSE_LIMIT_MS = 5_000;
/** Time given to the last frame before the process exits (ms). */
const EXIT_FLUSH_MS = 100;

/** The pipe to the application (the Authority's file descriptor 3). */
export interface HostChannel {
  write(frame: Uint8Array): void;
  /** Bytes written but not yet taken by the pipe. */
  pending(): number;
  end(): void;
}

export type HostExit = (code: number) => void;

const turn = (): Promise<void> => new Promise((r) => setImmediateBound(r));
const reasonOf = (e: unknown): string | null =>
  e instanceof SchedulerError ? (e.reason ?? e.code) : null;

export class AuthorityHost {
  readonly #channel: HostChannel;
  readonly #exit: HostExit;
  readonly #decoder = new FrameDecoder(MAX_COMMAND_BYTES);
  readonly #queue: AuthorityCommand[] = [];
  #draining = false;
  #lastId = 0;
  #rejections = 0;
  #started = false;
  #scheduler: GlobalRoundScheduler | null = null;
  #source: PrepWorkerRoundSource | null = null;
  #clockMode: StartArguments["clock"] | null = null;
  #replayClock: SimulatedClockExport | null = null;
  #loop: ReturnType<typeof setTimeout> | null = null;
  #ended = false;

  constructor(channel: HostChannel, exit: HostExit) {
    this.#channel = channel;
    this.#exit = exit;
    Object.freeze(this);
  }

  /** Sends `ready` (the Authority's checks passed). */
  ready(): void {
    this.#send(encodeReady());
  }

  /** Bytes from the application. A malformed frame fails closed. */
  receive(chunk: Uint8Array): void {
    if (this.#ended) return;
    let bodies: Uint8Array[];
    try {
      bodies = this.#decoder.push(chunk);
    } catch (error) {
      const code = isFrameError(error) && error.code === "frame-empty" ? "frame-empty" : null;
      return this.fail(code ?? "frame-too-large", AUTHORITY_EXIT.protocol);
    }
    for (const body of bodies) {
      if (this.#ended) return;
      let parsed;
      try {
        parsed = parseCommand(body);
      } catch {
        return this.fail("frame-invalid", AUTHORITY_EXIT.protocol);
      }
      if (!parsed.ok) {
        if (parsed.id > this.#lastId) this.#lastId = parsed.id;
        this.#reject(parsed.id, parsed.code);
        continue;
      }
      if (parsed.command.id <= this.#lastId) {
        this.#reject(parsed.command.id, "id-not-increasing");
        continue;
      }
      this.#lastId = parsed.command.id;
      if (this.#queue.length >= MAX_QUEUED_COMMANDS) {
        return this.fail("queue-overflow", AUTHORITY_EXIT.limits);
      }
      this.#queue.push(parsed.command);
    }
    if (!this.#draining) void this.#drain();
  }

  /** The pipe closed or failed (the application exited, crashed or disconnected). */
  channelLost(): void {
    this.fail(null, AUTHORITY_EXIT.channel);
  }

  /**
   * Fails closed: halts the scheduler at once, discards the worker and its chain, sends `fatal`
   * (if the pipe is still usable) and exits with `exitCode`. Idempotent.
   */
  fail(code: FatalCode | null, exitCode: number): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#stopLoop();
    this.#queue.length = 0;
    try {
      this.#scheduler?.stop();
    } catch {
      // halted already (or failed closed itself)
    }
    if (code !== null) {
      try {
        this.#channel.write(encodeFatal(code));
      } catch {
        // the pipe is gone
      }
    }
    this.#finish(exitCode, EXIT_FLUSH_MS);
  }

  // ---- Commands -------------------------------------------------------------------------------

  async #drain(): Promise<void> {
    this.#draining = true;
    try {
      while (this.#queue.length > 0 && !this.#ended) {
        const command = this.#queue.shift()!;
        await this.#handle(command);
      }
    } catch {
      this.fail("internal-error", AUTHORITY_EXIT.internal);
    } finally {
      this.#draining = false;
    }
  }

  async #handle(c: AuthorityCommand): Promise<void> {
    if (c.op === "start") return this.#start(c);
    if (c.op === "shutdown") return this.#shutdown(c.id);
    const s = this.#scheduler;
    if (s === null) return this.#reject(c.id, "not-started");
    if (this.#clockMode === "monotonic") this.#poll();
    if (c.op === "snapshot") {
      return this.#result(c.id, "snapshot", { snapshot: s.snapshot(), digest: s.digest });
    }
    if (c.op === "stop") {
      try {
        s.stop();
      } catch {
        // failed closed: halted
      }
      this.#stopLoop();
      return this.#result(c.id, "stop", { state: s.state });
    }
    if (c.op !== "events") return this.#reject(c.id, "unknown-op");
    const snap = s.snapshot();
    if (c.after > snap.lastSeq) return this.#reject(c.id, "invalid-cursor");
    const retained = s.events(c.after);
    if (c.after < snap.lastSeq && (retained.length === 0 || retained[0]!.seq !== c.after + 1)) {
      return this.#reject(c.id, "events-unavailable"); // dropped from the bounded log
    }
    let n = Math.min(c.limit, retained.length);
    for (;;) {
      const batch = retained.slice(0, n);
      const frame = encodeResult(c.id, "events", {
        tick: snap.tick,
        lastSeq: snap.lastSeq,
        events: batch,
        more: n < retained.length,
      });
      if (frame !== null) return this.#send(frame);
      n = Math.max(1, Math.floor(n / 2));
    }
  }

  async #start(c: AuthorityCommand & { readonly op: "start" }): Promise<void> {
    if (this.#started) return this.#reject(c.id, "already-started");
    if (c.clock === "replay" && (c.mode !== "test" || c.chain !== "public-test-vectors")) {
      return this.#reject(c.id, "refused", "replay-test-vectors-only");
    }
    this.#started = true; // one chain per Authority: a failed start is never retried
    let source: PrepWorkerRoundSource;
    try {
      source = await PrepWorkerRoundSource.start({
        mode: c.mode,
        chain: c.chain,
        ...(c.chainLength === null ? {} : { chainLength: c.chainLength }),
        ...(c.vectorSalt === null ? {} : { vectorSalt: c.vectorSalt }),
      });
    } catch (error) {
      return this.#reject(c.id, "start-failed", reasonOf(error) ?? "source-failed");
    }
    if (this.#ended) {
      void source.terminate();
      return;
    }
    this.#source = source;
    let clock: MonotonicClock;
    if (c.clock === "replay") {
      this.#replayClock = new SimulatedClock(5_000_000_000n);
      clock = this.#replayClock;
    } else {
      clock = createMonotonicClock();
    }
    let scheduler: GlobalRoundScheduler;
    try {
      scheduler = GlobalRoundScheduler.create({
        clock,
        source,
        ...(c.eventCapacity === null ? {} : { eventCapacity: c.eventCapacity }),
      });
      scheduler.start();
    } catch (error) {
      void source.terminate();
      return this.#reject(c.id, "start-failed", reasonOf(error) ?? "scheduler-failed");
    }
    this.#scheduler = scheduler;
    this.#clockMode = c.clock;
    this.#result(c.id, "start", { state: scheduler.state, chain: scheduler.chain });
    if (c.clock === "replay") void this.#replay();
    else this.#schedule();
  }

  async #shutdown(id: number): Promise<void> {
    this.#stopLoop();
    try {
      this.#scheduler?.stop();
    } catch {
      // halted
    }
    this.#result(id, "shutdown", { state: "closed" });
    this.#ended = true;
    this.#queue.length = 0;
    this.#finish(AUTHORITY_EXIT.ok, EXIT_FLUSH_MS);
  }

  // ---- Clocks ---------------------------------------------------------------------------------

  /** One poll of the real clock (a failure has already failed the scheduler closed). */
  #poll(): void {
    const s = this.#scheduler;
    if (s === null || s.state === "halted") return;
    try {
      s.poll();
    } catch {
      // the scheduler failed closed (halted); its log shows why
    }
  }

  #schedule(): void {
    if (this.#ended) return;
    this.#loop = setTimeoutBound(() => {
      this.#loop = null;
      this.#poll();
      if (this.#scheduler !== null && this.#scheduler.state !== "halted") this.#schedule();
    }, POLL_INTERVAL_MS);
  }

  #stopLoop(): void {
    if (this.#loop !== null) clearTimeoutBound(this.#loop);
    this.#loop = null;
  }

  /** TEST-ONLY deterministic pacing of the public vector chain (see the file comment). */
  async #replay(): Promise<void> {
    const s = this.#scheduler!;
    const clock = this.#replayClock!;
    let waitingSince: bigint | null = null;
    while (!this.#ended && s.state !== "halted") {
      if (s.residency().next === "requested") {
        const now = hrtime();
        waitingSince ??= now;
        if (now - waitingSince < REPLAY_DELIVERY_LIMIT_NS) {
          await turn();
          continue;
        }
      }
      waitingSince = null;
      for (let i = 0; i < REPLAY_SLICE_TICKS && s.state !== ("halted" as string); i++) {
        clock.advanceNs(NS_PER_TICK + 1n);
        try {
          s.poll();
        } catch {
          break; // failed closed: halted
        }
        if (s.residency().next === "requested") break;
      }
      await turn();
    }
  }

  // ---- Output ---------------------------------------------------------------------------------

  #send(frame: Uint8Array): void {
    if (this.#ended && !this.#closing) return;
    if (this.#channel.pending() > MAX_OUTBOUND_BUFFER_BYTES) {
      return this.fail("backpressure", AUTHORITY_EXIT.limits);
    }
    try {
      this.#channel.write(frame);
    } catch {
      this.fail(null, AUTHORITY_EXIT.channel);
    }
  }

  #closing = false;

  #result(id: number, op: protocol.AuthorityOp, result: Record<string, unknown>): void {
    const frame = encodeResult(id, op, result);
    if (frame === null) return this.fail("internal-error", AUTHORITY_EXIT.internal);
    this.#send(frame);
  }

  #reject(id: number, code: RejectionCode, reason: string | null = null): void {
    this.#rejections += 1;
    if (this.#rejections > MAX_REJECTED_COMMANDS) {
      return this.fail("too-many-rejections", AUTHORITY_EXIT.limits);
    }
    this.#send(encodeRejected(id, code, reason));
  }

  /** Closes the scheduler (bounded), ends the pipe and exits. */
  #finish(exitCode: number, flushMs: number): void {
    this.#closing = true;
    const exit = () => this.#exit(exitCode);
    const hard = setTimeoutBound(exit, CLOSE_LIMIT_MS);
    const done = () => {
      clearTimeoutBound(hard);
      try {
        this.#channel.end();
      } catch {
        // gone
      }
      setTimeoutBound(exit, flushMs);
    };
    const s = this.#scheduler;
    const closing = s !== null ? s.close() : (this.#source?.terminate() ?? Promise.resolve());
    closing.then(done, done);
  }
}

Object.freeze(AuthorityHost);
Object.freeze(AuthorityHost.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
