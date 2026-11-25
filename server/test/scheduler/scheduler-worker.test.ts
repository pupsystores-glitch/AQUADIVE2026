// Offline Global Round Scheduler, compiled run time with the real preparation worker (P8-4b-2).
// PLAY MONEY ONLY; offline only.
//
// Builds the server as `npm run build` does into a temporary directory and runs
// scheduler-probe.cjs in fresh Node processes (one scheduler per process, by design):
//
// - the public fv = 1 vector chain (salts A and B) through PrepWorkerRoundSource and
//   GlobalRoundScheduler on a SimulatedClock: the event log equals the independent reference
//   model (reference-model.cjs, fed by the in-process environment's facts), the outcomes equal the
//   independent spec implementation's vectors (vectors-v1.json), every-tick and jittered polling
//   give the same digest, the chain-exhaustion halt follows round 8;
// - the admission deadline, option / construction / duplicate-instance refusals;
// - worker loss with a request pending and with none (SD-6), a preparation failure;
// - integrity: tampered, missing, extra scheduler files and an unexpected dependency are
//   refused; the scheduler's loaded closure is protected; the compiled startup never loads it.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as tool from "../../scripts/engine-integrity.mjs";
import {
  SERVER,
  TRUSTED_MANIFEST,
  buildServer,
  writeRehashedManifest,
} from "../helpers/engine-build";

const PROBE = fileURLToPath(new URL("./scheduler-probe.cjs", import.meta.url));
const ref = createRequire(import.meta.url)("./reference-model.cjs");
const VECTORS = JSON.parse(
  readFileSync(join(SERVER, "test", "independent", "vectors-v1.json"), "utf8"),
).vectors;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Report = any;

/**
 * Event-log digests of the two public vector chains. Not self-pinned: each equals the digest the
 * independent reference model computes from the in-process environment's facts (asserted below
 * in the same test), so a change of either side fails.
 */
const PINNED_DIGEST: Record<string, string> = {
  A: "0218d4a2d6fb756bf6ed6083961e8d889b0cefa3f7f1fa0810f212c50180dc38",
  B: "816b34082f68ba57bdd5c4440961c1b9b7a996e00d1b718e2978f9c4d9d6305d",
};

let tmp = "";
let dist = "";

const probe = (buildDir: string, ...args: string[]): Report => {
  const run = spawnSync(process.execPath, [PROBE, buildDir, ...args], {
    encoding: "utf8",
    timeout: 240_000,
  });
  const report = JSON.parse(run.stdout);
  expect(report.fatal, run.stdout.slice(0, 2000)).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  expect(report.counters).toEqual({ mathRandom: 0, browser: {}, console: 0, unhandled: 0 });
  return report;
};

const WORKER_POST = "this.#port.postMessage(prepared, [bytes.buffer]);";

/** A copy of the build with one compiled file patched; manifest "trusted" or "rehashed". */
const patched = (
  name: string,
  file: string,
  anchor: string,
  replacement: string,
  manifest: "trusted" | "rehashed",
): string => {
  const copy = copyOf(name);
  const path = join(copy, ...file.split("/"));
  const code = readFileSync(path, "utf8");
  expect(code.split(anchor).length - 1, anchor).toBe(1);
  writeFileSync(path, code.replace(anchor, replacement));
  if (manifest === "rehashed") writeRehashedManifest(copy);
  return copy;
};
/** An unpatched copy of the clean build next to the TRUSTED manifest. */
const copyOf = (name: string): string => {
  const copy = join(tmp, name, "dist");
  cpSync(dist, copy, { recursive: true });
  cpSync(join(tmp, "integrity"), join(tmp, name, "integrity"), { recursive: true });
  writeFileSync(join(tmp, name, "package.json"), '{ "type": "commonjs" }\n');
  return copy;
};
const cliVerify = (buildDir: string): string[] => {
  const run = spawnSync(
    process.execPath,
    [join(SERVER, "scripts", "engine-integrity.mjs"), "verify", buildDir],
    { encoding: "utf8", timeout: 60_000 },
  );
  expect(run.status).toBe(1);
  return run.stderr
    .split(/\r?\n/)
    .filter((l) => l.startsWith("  "))
    .map((l) => l.trim());
};

const SCHEDULER_FILES = [
  "clock",
  "core",
  "disclosure",
  "events",
  "scheduler",
  "sealed",
  "source",
  "timeline",
].map((f) => `server/src/scheduler/${f}.js`);

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-4b-2-scheduler-"));
  dist = buildServer(tmp);
}, 300_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("the public vector chain through the real worker (independent known answers)", () => {
  it.each(["A", "B"])(
    "salt %s: log = reference model, outcomes = independent vectors, halt after round 8",
    (salt) => {
      const facts = probe(dist, "facts", salt);
      const run = probe(dist, "run", salt, "every");
      const model = ref.referenceLog(facts.chainId, 8, facts.facts);
      expect(run.chain).toEqual({ chainId: facts.chainId, chainLength: 8, fv: 1 });
      expect(run.events).toEqual(model.events);
      expect(run.digest).toBe(model.digest);
      expect(run.digest).toBe(PINNED_DIGEST[salt]);
      expect(run.snapshot.halted).toEqual({
        reason: "chain-exhausted",
        tick: model.end,
        interruptedRound: null,
      });
      // The independent spec implementation's records (no engine, no scheduler code involved).
      const vectors = VECTORS.filter((v: Report) => v.set === "dev-v1" && v.salt === salt);
      expect(vectors).toHaveLength(8);
      for (const v of vectors) {
        const of = (type: string) =>
          run.events.find((e: Report) => e.round === v.index && e.type === type);
        const open = of("round.betting").tick;
        if (v.outcome === "crash") {
          expect(of("round.crashed")).toMatchObject({ crashAt: v.crashAt });
          expect(of("round.crashed").tick - open).toBe(v.terminalTick);
          expect(of("round.impact")).toBeUndefined();
        } else {
          expect(of("round.impact")).toMatchObject({ jackpot: v.jackpot });
          expect(of("round.bonus").tick - open).toBe(v.terminalTick);
          expect(of("round.chests").chests).toEqual(v.chests);
          expect(of("round.crashed")).toBeUndefined();
        }
        const boosts = run.events.filter(
          (e: Report) => e.round === v.index && e.type === "round.boost",
        );
        expect(boosts).toHaveLength(v.goldfishConsumed);
        expect(of("round.betting").roundId).toBe(ref.roundId(facts.chainId, v.index, v.index));
      }
      // Snapshots sampled during the run equal the events reduced to their tick.
      expect(run.snapshots.length).toBeGreaterThan(20);
      for (const snap of run.snapshots) {
        const expected = ref.reduceSnapshot(run.events, snap.tick);
        if (expected.round?.multiplier === "live") {
          expect(snap.round.multiplier).toBeGreaterThanOrEqual(1);
          expected.round.multiplier = snap.round.multiplier;
        }
        expect(snap).toEqual(expected);
      }
      // No secret in any rendering; after the halt nothing restarts; the source is closed.
      for (const t of run.texts)
        expect(t).toMatch(
          /^(\{"(scheduler|source)":.*\}|\[object Object\]|\w+\((created|ready|halted)\))$/,
        );
      expect(run.afterHalt.poll).toEqual({ ok: true, value: null });
      expect(run.afterHalt.start.error).toMatchObject({ code: "invalid-state", reason: "started" });
      expect(run.afterHalt.second.error).toMatchObject({ code: "duplicate-instance" });
      expect(run.sourceState).toBe("closed");
    },
  );

  it("jittered, non-tick-aligned polling gives the identical log with far fewer polls", () => {
    const every = probe(dist, "run", "A", "every");
    const jitter = probe(dist, "run", "A", "jitter");
    expect(jitter.digest).toBe(every.digest);
    expect(jitter.events).toEqual(every.events);
    expect(jitter.polls).toBeLessThan(every.polls / 20);
  });
});

describe("admission, contract and failure behaviour (compiled)", () => {
  it("round 1's admission tick passes before the worker answers: halt at 240, late script dropped", () => {
    const r = probe(dist, "deadline");
    expect(r.halted).toMatchObject({
      state: "halted",
      tick: 240,
      lastRound: 0,
      round: null,
      halted: { reason: "admission-deadline-missed", tick: 240, interruptedRound: null },
    });
    expect(r.events.map((e: Report) => `${e.tick}:${e.type}`)).toEqual([
      "0:scheduler.started",
      "240:scheduler.halting",
      "240:scheduler.halted",
    ]);
    expect(r.after).toEqual(r.halted);
    expect(r.residency).toEqual({ active: 0, next: "none", total: 0 });
  });

  it("refuses injected options, production, unapproved or duplicate instances, re-claims", () => {
    const r = probe(dist, "contract");
    expect(r.sourceOptions).toEqual([
      ...Array(9).fill("invalid-argument:invalid-options"),
      "source-failed:invalid-options", // mode production: refused by the controller
      "source-failed:invalid-options", // the public vector chain is test-mode only
      "invalid-argument:invalid-options", // maxInFlight is not a source option
    ]);
    expect(r.productionSource).toBe("development-only:production-refused");
    expect(r.productionScheduler.error).toMatchObject({
      code: "development-only",
      reason: "production-refused",
    });
    expect(r.fakeSource.error).toMatchObject({ code: "source-not-approved" });
    expect(r.newSource.error).toMatchObject({
      code: "source-not-approved",
      reason: "construction-refused",
    });
    expect(r.newScheduler.error).toMatchObject({ reason: "construction-refused" });
    expect(r.badClock.error).toMatchObject({ reason: "invalid-clock" });
    expect(r.publicRequest).toBe("undefined"); // only the claiming scheduler can request
    expect(r.pollBeforeStart.error).toMatchObject({ reason: "not-started" });
    expect(r.duplicate.error).toMatchObject({ code: "duplicate-instance" });
    expect(r.duplicateOtherSource.error).toMatchObject({ code: "duplicate-instance" });
    // R-1: no public claim; the one-time binder belongs to the compiled scheduler module.
    expect(r.publicClaim).toBe("undefined");
    expect(r.claimAgain.error).toMatchObject({ code: "invalid-state", reason: "binder-claimed" });
    expect(r.startTwice.error).toMatchObject({ reason: "started" });
    expect(r.keys).toEqual(["chain"]);
    expect(r.closedState).toBe("halted");
  });

  it("worker loss with round 3's request pending (SD-6): round 2 finishes, reveal unavailable", () => {
    const copy = patched(
      "loss-pending",
      "server/src/prep/prep-worker.js",
      WORKER_POST,
      `if ((globalThis.__p84b2 = (globalThis.__p84b2 || 0) + 1) === 3) process.exit(3); ${WORKER_POST}`,
      "rehashed",
    );
    const r = probe(copy, "loss");
    const ended = r.events.filter((e: Report) => e.type === "round.ended");
    expect(ended.map((e: Report) => [e.round, e.reveal])).toEqual([
      [1, "deferred"],
      [2, "unavailable"],
    ]);
    expect(r.events.filter((e: Report) => e.type === "source.failed")).toEqual([
      expect.objectContaining({ failure: "lost" }),
    ]);
    expect(r.snapshot).toMatchObject({
      state: "halted",
      lastRound: 2,
      halted: { reason: "source-lost", interruptedRound: null },
    });
    expect(r.snapshot.halted.tick).toBe(ended[1].tick);
  });

  it("worker loss after round 2 was delivered (no request pending): round 2 is never played", () => {
    const copy = patched(
      "loss-idle",
      "server/src/prep/prep-worker.js",
      WORKER_POST,
      `${WORKER_POST} if ((globalThis.__p84b2 = (globalThis.__p84b2 || 0) + 1) === 2) process.exit(3);`,
      "rehashed",
    );
    const r = probe(copy, "loss");
    const ended = r.events.filter((e: Report) => e.type === "round.ended");
    expect(ended.map((e: Report) => [e.round, e.reveal])).toEqual([[1, "unavailable"]]);
    expect(r.events.some((e: Report) => e.type === "round.betting" && e.round === 2)).toBe(false);
    expect(r.snapshot).toMatchObject({
      state: "halted",
      lastRound: 1,
      halted: { reason: "source-lost", interruptedRound: null },
    });
  });

  it("a preparation failure before round 1 halts at once; nothing is retried", () => {
    const copy = patched(
      "prep-fail",
      "server/src/prep/prep-worker.js",
      "return (await this.#env.chainStatus(this.#chainId)).lastReservedIndex;",
      "if (!globalThis.__p84b2Halt) { globalThis.__p84b2Halt = true; return null; } " +
        "return (await this.#env.chainStatus(this.#chainId)).lastReservedIndex;",
      "rehashed",
    );
    const r = probe(copy, "prepfail");
    expect(r.events.map((e: Report) => e.type)).toEqual([
      "scheduler.started",
      "source.failed",
      "scheduler.halting",
      "scheduler.halted",
    ]);
    expect(r.events[1].failure).toBe("preparation-failed");
    expect(r.snapshot.halted).toMatchObject({
      reason: "preparation-failed",
      interruptedRound: null,
    });
    expect(r.snapshot.lastRound).toBe(0);
  });
});

describe("security corrections H-1 / M-1 / L-1 / L-2 (compiled CommonJS)", () => {
  const FORGED_CHAIN = "66".repeat(32);
  const round1 = VECTORS.find((v: Report) => v.set === "dev-v1" && v.salt === "A" && v.index === 1);

  it.each([
    ["getter", "invalid-argument", "invalid-options"],
    ["proxy", "invalid-argument", "invalid-options"],
    ["descriptor", "invalid-argument", "invalid-options"],
    ["throwing-keys", "invalid-argument", "invalid-options"],
    ["capacity-getter", "invalid-argument", "invalid-options"],
    ["clock-getter", "invalid-argument", "invalid-options"],
    ["clock-proxy", "invalid-argument", "invalid-clock"],
    ["source-proxy", "source-not-approved", null],
  ])(
    "H-1 %s: refused before any read of a substitute; the approved path still works",
    (v, code, reason) => {
      const r = probe(dist, "forge", v);
      expect(r.hostile).toEqual({
        ok: false,
        error: {
          name: "SchedulerError",
          code,
          reason,
          message: reason === null ? code : `${code}: ${reason}`,
        },
      });
      expect(r.sourceReads).toBe(0); // no getter or trap result was ever used
      expect(r.forgedRequests).toBe(0);
      // The refusal did not use up the process's scheduler: the legitimate one plays the
      // approved chain, whose round 1 equals the independent vector (not a forged outcome).
      expect(r.legitimate).toBe(true);
      expect(r.chain.chainId).not.toBe(FORGED_CHAIN);
      // Every admitted round id is the reference model's id on the APPROVED chain.
      expect(r.admitted.length).toBeGreaterThanOrEqual(1);
      for (const a of r.admitted) {
        expect(a.roundId).toBe(ref.roundId(r.chain.chainId, a.round, a.round));
        expect(a.roundId).not.toBe(ref.roundId(FORGED_CHAIN, a.round, a.round));
      }
      expect(round1.outcome).toBe("crash");
      expect(r.crashed).toEqual([expect.objectContaining({ round: 1, crashAt: round1.crashAt })]);
      expect(r.crashed[0].crashAt).not.toBe(99.99);
      expect(r.claimAgain.error).toMatchObject({ reason: "binder-claimed" });
    },
  );

  it("M-1: the compiled sealed module exposes no opener; a fresh module instance cannot open", () => {
    const r = probe(dist, "sealed");
    expect(r.exports).toEqual([
      "SealedRound",
      "claimSealedRoundOpener",
      "claimSourceSealing",
      "sealRoundScript",
    ]);
    expect(r.classKeys).toEqual(["length", "name", "prototype", "seal"]);
    expect(r.classSymbols).toEqual([]);
    expect(r.protoSymbols).toEqual(["Symbol(nodejs.util.inspect.custom)"]);
    expect(r.sealKeys).toEqual(["admission"]);
    expect(r.sealSymbols).toBe(0);
    for (const c of [r.claim, r.claimAgain]) {
      expect(c.error).toMatchObject({ code: "sealed-misuse", reason: "opener-claimed" });
    }
    expect(r.leaked).toBe(0);
    expect(r.stateAfterProbes).toBe("sealed");
    expect(r.freshOpensOriginal.error).toMatchObject({
      code: "sealed-misuse",
      reason: "not-sealed",
    });
    expect(r.freshInstanceOf).toBe(false);
    expect(r.stateAfterFresh).toBe("sealed");
  });

  const CLOCK_CASES = [
    ["backwards", "clock-backwards", ["run"]],
    ["negative", "negative-reading", ["start", "run"]],
    ["number", "invalid-reading", ["start", "run"]],
    ["undefined", "invalid-reading", ["start", "run"]],
    ["throw", "clock-threw", ["start", "run"]],
    ["overflow", "tick-overflow", ["run"]],
  ] as const;
  it.each(CLOCK_CASES.flatMap(([v, reason, ats]) => ats.map((at) => [v, at, reason] as const)))(
    "L-1 %s reading at %s: fails closed (clock-failed), nothing processed, nothing revives",
    (variant, at, reason) => {
      const r = probe(dist, "clock", variant, at);
      expect(r.call.error).toMatchObject({ code: "clock-failed", reason });
      expect(r.state).toBe("halted");
      const tick = at === "start" ? 0 : 300;
      const interruptedRound = at === "start" ? null : 1;
      expect(r.halted).toMatchObject({
        state: "halted",
        tick,
        halted: { reason: "clock-failed", tick, interruptedRound },
      });
      if (at === "start") {
        expect(r.events.map((e: Report) => `${e.tick}:${e.type}`)).toEqual([
          "0:scheduler.started",
          "0:scheduler.halted",
        ]);
      } else {
        expect(r.before.snapshot).toMatchObject({ state: "running", tick: 300 });
        expect(r.before.residency).toEqual({ active: 1, next: "held", total: 2 });
        expect(r.events.at(-1)).toMatchObject({
          tick: 300,
          type: "scheduler.halted",
          reason: "clock-failed",
          interruptedRound: 1,
        });
        expect(r.events.some((e: Report) => e.type === "round.ended")).toBe(false);
      }
      expect(r.residency).toEqual({ active: 0, next: "none", total: 0 });
      expect(r.pollAfter).toEqual({ ok: true, value: null });
      expect(r.pollAfterWait).toEqual({ ok: true, value: null });
      expect(r.startAfter.error).toMatchObject({ code: "invalid-state", reason: "started" });
      expect(r.after).toEqual(r.halted);
      expect(r.eventsAfter).toBe(r.events.length);
      expect(r.residencyAfter).toEqual({ active: 0, next: "none", total: 0 });
      expect(r.sourceState).toBe("closed");
    },
  );

  it.each([
    ["delivery-clock-throws", "clock-failed", ["0:scheduler.started", "0:scheduler.halted"]],
    ["stop-pending", "owner-stopped", ["0:scheduler.started", "0:scheduler.halted"]],
    ["close-pending", "owner-stopped", ["0:scheduler.started", "0:scheduler.halted"]],
    [
      "terminate-pending",
      "source-lost",
      ["0:scheduler.started", "0:source.failed", "0:scheduler.halting", "0:scheduler.halted"],
    ],
  ] as const)(
    "L-2 %s: contained, no unhandled rejection, late results discarded",
    (v, reason, log) => {
      const r = probe(dist, "async", v); // probe() asserts counters.unhandled === 0
      expect(r.settled).toBe(true);
      expect(r.halted.halted).toEqual({ reason, tick: 0, interruptedRound: null });
      expect(r.events).toEqual(log);
      expect(r.residency).toEqual({ active: 0, next: "none", total: 0 });
      expect(r.unchanged).toBe(true);
      expect(r.eventsAdded).toBe(0);
      expect(r.pollAfter).toEqual({ ok: true, value: null });
      expect(r.sourceState).toBe("closed");
    },
  );

  it("L-2 a throwing listener: the source discards the script unopened and stops", () => {
    const r = probe(dist, "async", "listener-throws");
    expect(r).toMatchObject({
      settled: true,
      kind: "prepared",
      sealState: "discarded",
      sourceState: "closed",
    });
    // R-1: this process claimed the binder before scheduler.js loaded, so it cannot load.
    expect(r.schedulerLoad.error).toMatchObject({
      code: "invalid-state",
      reason: "binder-claimed",
    });
    expect(r.bindAgain.error).toMatchObject({ reason: "source-claimed" });
  });

  it.each(["internal-delivery", "internal-poll"])(
    "L-2 %s (patched core): internal-error halt, source terminated, sanitized error",
    (v) => {
      const copy = patched(
        `fault-${v}`,
        "server/src/scheduler/core.js",
        "    deliver(sealed) {",
        '    deliver(sealed) { if (globalThis.__p84b2Throw === "deliver") throw new TypeError("injected 99.99");',
        "trusted",
      );
      const core = join(copy, "server", "src", "scheduler", "core.js");
      const code = readFileSync(core, "utf8");
      const anchor = "    advanceTo(target) {";
      expect(code.split(anchor).length - 1).toBe(1);
      writeFileSync(
        core,
        code.replace(
          anchor,
          `${anchor} if (globalThis.__p84b2Throw === "advanceTo") throw new TypeError("injected 99.99");`,
        ),
      );
      writeRehashedManifest(copy);
      const r = probe(copy, "async", v);
      expect(r.settled).toBe(true);
      if (v === "internal-poll") {
        expect(r.call.error).toEqual({
          name: "SchedulerError",
          code: "invalid-state",
          reason: "internal-error",
          message: "invalid-state: internal-error",
        });
      }
      expect(r.halted.halted).toEqual({ reason: "internal-error", tick: 300, interruptedRound: 1 });
      expect(r.events.at(-1)).toBe("300:scheduler.halted");
      expect(r.events.some((e: string) => e.endsWith("round.ended"))).toBe(false);
      expect(r.residency).toEqual({ active: 0, next: "none", total: 0 });
      expect(r.unchanged).toBe(true);
      expect(r.eventsAdded).toBe(0);
      expect(r.sourceState).toBe("closed");
      expect(JSON.stringify(r)).not.toContain("injected");
    },
  );
});

describe("R-1 source authenticity (compiled CommonJS)", () => {
  /** The independent vectors of the public chain's rounds 1 and 2 (salt A). */
  const expected = [1, 2].map((index) => {
    const v = VECTORS.find(
      (x: Report) => x.set === "dev-v1" && x.salt === "A" && x.index === index,
    );
    expect(v.outcome).toBe("crash");
    return { round: index, crashAt: v.crashAt, jackpot: null };
  });

  // Before the correction every vector played the chosen 77.77x on the legitimate chain id
  // (R-1: reproduced on 5d90e5f; R-1b, the controller's verifier path: reproduced on the R-1
  // correction; docs/09 §46, server README §18).
  /** R-1b vectors: the frozen module refuses the replacement; the binding is tested below. */
  const R1B_REFUSED = [
    "verification-step",
    "verification-export",
    "verification-begin",
    "canonical-check",
    "canonical-value",
    "decode-utf8",
    "parse-message",
    "worker-entry",
  ];
  it.each([
    "claim-proto",
    "claim-define",
    "claim-setproto",
    "seal-export",
    "seal-static",
    "seal-hasinstance",
    "core-deliver",
    "core-export",
    "disclosure-open",
    "disclosure-export",
    "event-log",
    "verify-export",
    // R-1b: RoundScript and the controller are frozen too now.
    "secret-content",
    "controller-prepare",
    "controller-start",
    "controller-export",
    ...R1B_REFUSED,
  ])("%s: the replacement is refused; the legitimate rounds are played", (v) => {
    const r = probe(dist, "r1", v);
    expect(r.armed).toBe(false);
    expect(r.armError).toBe("TypeError");
    expect(r.forgedUsed).toBe(0);
    expect(r.outcomes).toEqual(expected);
    expect(r.admitted).toEqual([1, 2, 3]); // round 3 opens as round 2 ends
    expect(r.failures).toEqual([]);
  });

  it.each(["worker-class", "node-options", "integrity-export"])(
    "%s (R-1b; installed after load): never reached; the legitimate rounds are played",
    (v) => {
      // node:worker_threads, process.env and integrity.js stay writable; the controller bound
      // Worker and the integrity checks as it loaded and gives the worker an explicit env.
      const r = probe(dist, "r1", v);
      expect(r.armed).toBe(true);
      expect(r.forgedUsed).toBe(0); // incl. code run inside the worker (marker file)
      expect(r.outcomes).toEqual(expected);
      expect(r.failures).toEqual([]);
    },
  );

  // The load-time BINDING layer alone (R-1b): classes, prototypes and exports left unfrozen
  // (Object.freeze skips them, before any module loads), so every replacement takes effect.
  it.each([
    ...R1B_REFUSED,
    "worker-class",
    "node-options",
    "secret-content",
    "controller-prepare",
    "controller-start",
    "controller-export",
  ])("%s, nothing frozen: installed, never reached (load-time bindings)", (v) => {
    const r = probe(dist, "r1-unfrozen", v);
    expect(r.armed).toBe(true);
    expect(r.forgedUsed).toBe(0);
    expect(r.outcomes).toEqual(expected);
    expect(r.failures).toEqual([]);
  });

  it.each(["approved-export", "weakset"])(
    "%s: a forged source is not approved (private-field brand)",
    (v) => {
      const r = probe(dist, "r1", v);
      expect(r.armed).toBe(v === "weakset"); // the shared built-in itself can be patched
      expect(r.createError).toMatchObject({ code: "source-not-approved" });
      expect(r.forgedUsed).toBe(0);
      expect(r.outcomes).toBeUndefined();
    },
  );

  it.each([
    ["test seal", "(0, sealed_1.sealRoundScript)(round.script)"],
    ["other origin", "sealing.seal(round.script, Object.freeze({}))"],
  ])("a delivered %s is never admitted: source contract violation, source stopped", (_, by) => {
    const copy = patched(
      `foreign-${by.length}`,
      "server/src/scheduler/source.js",
      "sealing.seal(round.script, this)",
      by,
      "rehashed",
    );
    const r = probe(copy, "foreign");
    expect(r.admitted).toEqual([]);
    expect(r.outcomes).toEqual([]);
    expect(r.failures).toEqual(["contract-violation"]);
    expect(r.halts).toEqual(["source-contract-violation"]);
    expect(r.state).toBe("halted");
    expect(r.residency).toEqual({ active: 0, next: "none", total: 0 });
    expect(r.sourceState).toBe("closed");
  });

  it.each([
    ["binder", null, "binder-claimed"],
    ["sealing", "sealing-claimed", "sealing-claimed"],
    ["opener", null, "opener-claimed"],
  ])("a %s claimed before the scheduler loads only prevents it (fail closed)", (v, src, sch) => {
    const r = probe(dist, "r1-preload", v);
    expect(r.claim).toEqual({
      ok: true,
      value: v === "binder" ? "function" : v === "sealing" ? "object" : "function",
    });
    if (v !== "binder") {
      if (src === null) expect(r.sourceLoad.ok).toBe(true);
      else expect(r.sourceLoad.error).toMatchObject({ reason: src });
    }
    expect(r.schedulerLoad.error).toMatchObject({ reason: sch });
  });

  it("module cache deletion after create: a fresh module copy cannot create a second scheduler", () => {
    const r = probe(dist, "r1-cache", "after-create");
    expect(r.freshClass).toBe(true);
    expect(r.second.error).toMatchObject({ code: "duplicate-instance" });
    expect(r.crossSource.error).toMatchObject({ code: "source-not-approved" });
    expect(r.otherState).toBe("ready"); // the refusal bound nothing
    expect(r.outcomes).toEqual(expected); // the first scheduler is unaffected
  });

  it("module cache deletion before create: one scheduler per process, whichever copy is first", () => {
    const r = probe(dist, "r1-cache", "fresh-first");
    expect(r.staleSource.error).toMatchObject({ code: "source-not-approved" });
    expect(r.originalAfter.error).toMatchObject({ code: "duplicate-instance" });
    expect(r.outcomes).toEqual(expected);
  });

  it("a pre-set process record only prevents the scheduler (fail closed)", () => {
    const r = probe(dist, "r1-cache", "preset");
    expect(r.second.error).toMatchObject({ code: "duplicate-instance" });
    expect(r.sourceState).toBe("ready");
  });
});

describe("integrity (src/scheduler is protected: owner-approved P8-4b-2 expansion)", () => {
  it("the trusted manifest names the eight scheduler files; a clean build is accepted", () => {
    const m = JSON.parse(readFileSync(TRUSTED_MANIFEST, "utf8"));
    expect(m.files).toHaveLength(40);
    expect(
      m.files
        .map((f: Report) => f.path)
        .filter((p: string) => p.startsWith("server/src/scheduler/")),
    ).toEqual(SCHEDULER_FILES);
    expect(probe(dist, "integrity")).toMatchObject({ start: { ok: true }, create: { ok: true } });
    expect(tool.verifyAgainstTrusted(dist)).toEqual([]);
  });

  it.each(SCHEDULER_FILES)("one changed byte of %s is refused (source start and CLI)", (file) => {
    const copy = copyOf(`flip-${file.split("/").pop()}`);
    const path = join(copy, ...file.split("/"));
    // One letter's case in the compiled header comment: the module still parses and loads, so
    // only the integrity check can refuse it.
    const bytes = readFileSync(path);
    const at = bytes.indexOf("PLAY MONEY");
    expect(at).toBeGreaterThan(0);
    bytes[at] = bytes[at]! ^ 0x20;
    writeFileSync(path, bytes);
    const r = probe(copy, "integrity");
    expect(r.start).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "integrity-failed", reason: "digest-mismatch" }),
    });
    expect(cliVerify(copy)).toEqual([`changed: ${file}`]);
  });

  it("a missing or an extra scheduler file is refused", () => {
    const missing = copyOf("missing-core");
    rmSync(join(missing, "server", "src", "scheduler", "disclosure.js"));
    // disclosure.js is required by core.js: loading the scheduler fails before anything starts.
    expect(probe(missing, "integrity")).toMatchObject({ loadError: { code: "MODULE_NOT_FOUND" } });
    expect(cliVerify(missing)).toEqual(["missing: server/src/scheduler/disclosure.js"]);
    const extra = copyOf("extra-file");
    writeFileSync(join(extra, "server", "src", "scheduler", "extra.js"), '"use strict";\n');
    expect(probe(extra, "integrity").start.error).toMatchObject({
      code: "integrity-failed",
      reason: "unexpected-file",
    });
    expect(cliVerify(extra)).toEqual(["unexpected: server/src/scheduler/extra.js"]);
  });

  it("an unexpected dependency of the source or the driver is refused (rehashed manifests)", () => {
    // An attacker who rewrote both build and manifest: only the closure walk refuses it (A-1:
    // the same attacker could remove the walk).
    for (const [name, file, where] of [
      ["dep-source", "server/src/scheduler/source.js", "start"],
      ["dep-driver", "server/src/scheduler/scheduler.js", "create"],
    ] as const) {
      const copy = patched(
        name,
        file,
        '"use strict";',
        '"use strict";require("../extra-dep.js");',
        "rehashed",
      );
      writeFileSync(join(copy, "server", "src", "extra-dep.js"), '"use strict";\n');
      const r = probe(copy, "integrity");
      const refused = { code: "integrity-failed", reason: "unexpected-module" };
      if (where === "start") expect(r.start.error, name).toMatchObject(refused);
      else expect(r.create.error, name).toMatchObject(refused);
    }
  });

  it("the scheduler's loaded closure is all protected; the main thread never loads the bundle", () => {
    const r = probe(dist, "closure");
    expect(r.unprotected).toEqual([]);
    for (const f of SCHEDULER_FILES) expect(r.loaded).toContain(f);
    expect(r.loaded).toContain("server/src/prep/controller.js");
    expect(r.loaded).not.toContain("engine/engine.cjs");
    expect(r.loaded).not.toContain("server/src/round/prepare.js");
  });

  it("the compiled application startup loads no scheduler module", () => {
    // app.js needs fastify & co.: resolved from this package through NODE_PATH.
    const r = spawnSync(process.execPath, [PROBE, dist, "startup"], {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, NODE_PATH: join(SERVER, "node_modules") },
    });
    const report = JSON.parse(r.stdout);
    expect(report.fatal, r.stdout.slice(0, 2000)).toBeUndefined();
    expect(report.loaded).toBeGreaterThan(5);
    expect(report.scheduler).toEqual([]);
  });
});

describe("performance and memory smoke (provisional; NOT D7)", () => {
  it("a 30-round random development chain: bounded polls, deliveries and memory", () => {
    const r = probe(dist, "bench", "30");
    expect(r.snapshot.halted).toMatchObject({ reason: "chain-exhausted" });
    expect(r.snapshot.lastRound).toBe(30);
    expect(r.events).toBeLessThanOrEqual(1024);
    expect(r.delivery.n).toBe(30);
    // Smoke bounds only (battery / CI noise): the numbers are reported, not gated.
    expect(r.poll.p50).toBeLessThan(50);
    expect(r.memory.length).toBeGreaterThanOrEqual(3);
    console.info(
      `P8-4b-2 bench: ${JSON.stringify({ poll: r.poll, delivery: r.delivery, memory: r.memory })}`,
    );
  }, 240_000);
});
