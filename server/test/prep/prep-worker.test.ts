// Offline preparation worker, compiled run time (P8-4b-0). PLAY MONEY ONLY; offline only.
//
// Builds the server as `npm run build` does into a temporary directory (plus the TEST-ONLY
// bundles of test/helpers/engine-build.ts) and runs prep-probe.cjs in fresh Node processes:
//
// - preparation runs in the worker thread: nothing round-related is created on the main thread,
//   which never loads the engine bundle;
// - all 16 replay pins through two workers, equal as whole RoundScripts (canonical bytes,
//   digest, public part, content) to the current in-process implementation and to the
//   reference runner's records; the A1 / B1 digest candidates (not owner-approved);
// - the raw message stream: exact contract keys, plain data, no round seed of the public chain;
// - refusal of injected configurations, messages, options and constructions; duplicates and
//   backpressure reserve nothing; the worker entry refuses to run on the main thread;
// - start, close, close while busy, terminate while busy; crashes, an index-consuming failure,
//   forged results and tampered builds on patched copies: pending requests become
//   INDETERMINATE (never completed), nothing is retried, the controller ends;
// - main-thread responsiveness while 1, 10 and 50 rounds are prepared (a smoke bound, NOT D7);
// - the compiled application loads no prep, round, engine or fairness module.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as tool from "../../scripts/engine-integrity.mjs";
import { PREP_START_TIMEOUT_MS, REQUEST_ID_SLACK } from "../../src/prep/controller";
import {
  SERVER,
  TRUSTED_MANIFEST,
  buildQaBundles,
  buildServer,
  writeRehashedManifest,
} from "../helpers/engine-build";

const PROBE = fileURLToPath(new URL("./prep-probe.cjs", import.meta.url));
const INTEGRITY_CLI = join(SERVER, "scripts", "engine-integrity.mjs");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Report = any;

let tmp = "";
let dist = "";

const probe = (buildDir: string, scenario: string): Report => {
  const run = spawnSync(process.execPath, [PROBE, buildDir, scenario], {
    encoding: "utf8",
    timeout: 240_000,
  });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  const report = JSON.parse(run.stdout);
  expect(report.counters).toEqual({ mathRandom: 0, browser: {}, console: 0 });
  return report;
};

/**
 * A copy of the build with one compiled file patched. "trusted": the TRUSTED manifest stays next
 * to it; "rehashed": a manifest of the patched copy itself (an attacker who rewrote both).
 */
const patched = (
  name: string,
  file: string,
  anchor: string,
  replacement: string,
  manifest: "trusted" | "rehashed",
): string => {
  const copy = join(tmp, name, "dist");
  cpSync(dist, copy, { recursive: true });
  cpSync(join(tmp, "integrity"), join(tmp, name, "integrity"), { recursive: true });
  writeFileSync(join(tmp, name, "package.json"), '{ "type": "commonjs" }\n');
  const path = join(copy, ...file.split("/"));
  const code = readFileSync(path, "utf8");
  expect(code.split(anchor).length - 1, anchor).toBe(1);
  writeFileSync(path, code.replace(anchor, replacement));
  if (manifest === "rehashed") writeRehashedManifest(copy);
  return copy;
};

/** As `patched`, with several [file, anchor, replacement] patches; always a rehashed manifest. */
const patchedMany = (name: string, patches: readonly [string, string, string][]): string => {
  const [first, ...rest] = patches;
  const copy = patched(name, first![0], first![1], first![2], "trusted");
  for (const [file, anchor, replacement] of rest) {
    const path = join(copy, ...file.split("/"));
    const code = readFileSync(path, "utf8");
    expect(code.split(anchor).length - 1, anchor).toBe(1);
    writeFileSync(path, code.replace(anchor, replacement));
  }
  writeRehashedManifest(copy);
  return copy;
};
const WORKER_POST = "this.#port.postMessage(prepared, [bytes.buffer]);";

const INDETERMINATE = (code: string, reason: string) => ({
  ok: false,
  error: expect.objectContaining({ code, reason, indeterminate: true }),
});

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-p8-4b-0-prep-"));
  dist = buildServer(tmp);
  await buildQaBundles(dist);
}, 300_000);

afterAll(() => {
  if (!tmp) return;
  rmSync(join(tmp, "node_modules"), { force: true });
  rmSync(tmp, { recursive: true, force: true });
});

describe("off-main-thread preparation", () => {
  it("prepares in the worker; the main thread creates no round secret and never loads the bundle", () => {
    const r = probe(dist, "offmain");
    expect(r.mainThreadId).toBe(0);
    expect(r.chain.threadId).toBeGreaterThan(0);
    expect(r.indices).toEqual([1, 2, 3, 4, 5, 6]);
    for (const s of r.scripts) {
      expect(s.chainMatches).toBe(true);
      expect(s.redacted).toMatch(/\[redacted secret\]$/);
      expect(s.json).toContain('"secret":"[redacted secret]"');
    }
    // start() runs only the crypto provider's PUBLIC known-answer self-test here; preparing six
    // rounds adds no derivation, RoundKeys or seed copy on the main thread.
    expect(r.mainThread).toEqual(r.mainThreadAtStart);
    expect(r.mainThread.keys).toBe(0);
    expect(r.mainLoadedBundle).toBe(false);
    expect(r.mainLoadedPrepare).toBe(false);
    expect(r.mainLoadedWorkerEntry).toBe(false);
    expect(r.closed).toEqual({
      type: "closed",
      prepared: 6,
      failed: 0,
      lastReservedIndex: 6,
      revealedCount: 0,
      chainState: "active",
    });
  });
});

describe("replay compatibility", () => {
  it("reproduces all 16 replay pins as whole RoundScripts equal to the current implementation", () => {
    const r = probe(dist, "replay");
    expect(r.threadIds.every((t: number) => t > 0)).toBe(true);
    expect(r.pins).toHaveLength(16);
    for (const p of r.pins) {
      expect(p.chainIndex, p.key).toBe(Number(p.key.slice(1)));
      expect(p.rebuiltRecordSha256, p.key).toBe(p.pin);
      expect(p.sameReferenceRecord, p.key).toBe(true);
      expect(p.sameBytes, p.key).toBe(true);
      expect(p.samePublic, p.key).toBe(true);
      expect(p.sameContent, p.key).toBe(true);
      expect(p.digest, p.key).toBe(p.inProcessDigest);
      if (p.candidate !== null) expect(p.digest, p.key).toBe(p.candidate);
    }
    // A1 and B1 are the two digest candidates (NOT owner-approved), both reproduced.
    expect(r.pins.filter((p: Report) => p.candidate !== null).map((p: Report) => p.key)).toEqual([
      "A1",
      "B1",
    ]);
    for (const s of ["A", "B"]) {
      expect(r[`closed${s}`]).toMatchObject({ prepared: 8, failed: 0, lastReservedIndex: 8 });
    }
  });
});

describe("the worker boundary", () => {
  it("sends only contract messages of plain data and never a round seed", () => {
    const r = probe(dist, "secrets");
    expect(r.exitCode).toBe(0);
    expect(r.messages.map((m: Report) => m.type)).toEqual([
      "ready",
      ...Array(8).fill("prepared"),
      "closed",
    ]);
    const keys: Record<string, string[]> = {
      ready: ["chainId", "chainLength", "fv", "protocol", "threadId", "type"],
      prepared: ["bytes", "chainIndex", "digest", "requestId", "type"],
      closed: ["chainState", "failed", "lastReservedIndex", "prepared", "revealedCount", "type"],
    };
    for (const m of r.messages) expect(m.keys).toEqual(keys[m.type]);
    expect(r.shapes).toEqual(["Uint8Array:true", "number", "object", "string"]);
    expect(r.seedHits).toEqual([]);
    expect(r.forbiddenKeys).toEqual([]);
    expect(r.prepared.keys).toEqual(["chainIndex", "requestId", "script"]);
    expect(r.prepared.views).toEqual([false, false, false]);
    expect(r.prepared.controllerViews).toEqual([
      '{"controller":"PrepWorkerController","state":"ready"}',
      "PrepWorkerController(ready)",
    ]);
  });

  it("refuses injected configurations, messages, options and constructions; reserves nothing", () => {
    const r = probe(dist, "contract");
    for (const [name, c] of Object.entries<Report>(r.configs)) {
      expect(c.messages, name).toEqual([
        { type: "fatal", code: "invalid-config", reason: null, detail: null },
      ]);
      expect(c.exitCode, name).toBe(0);
    }
    // 12 malformed / injected messages: each rejected, none reserved an index; a duplicate id
    // is refused by the environment before the vault (untouched).
    expect(r.messages.rejected).toBe(r.messages.badCount);
    expect(r.messages.results).toEqual([
      { type: "prepared", requestId: "m-1", chainIndex: 1, code: null, indexState: null },
      {
        type: "failed",
        requestId: "m-1",
        chainIndex: null,
        code: "request-replayed",
        indexState: "untouched",
      },
      { type: "prepared", requestId: "m-2", chainIndex: 2, code: null, indexState: null },
    ]);
    expect(r.messages.closed).toMatchObject({ prepared: 2, failed: 1, lastReservedIndex: 2 });
    // Worker-side bound (defence in depth): a refusal reserves nothing; whatever was accepted is
    // prepared in order. (Preparation completes within microtasks, so arrivals rarely overlap.)
    const raw = r.rawBackpressure.results;
    const accepted = raw.filter((x: Report) => x.type === "prepared");
    for (const x of raw.filter((y: Report) => y.type === "failed")) {
      expect(x).toMatchObject({ code: "backpressure", indexState: "untouched" });
    }
    expect(r.rawBackpressure.closed.lastReservedIndex).toBe(accepted.length);

    for (const [name, o] of Object.entries<Report>(r.options)) {
      expect(o.ok, name).toBe(false);
      if (name === "nodeEnvProduction") {
        expect(o.error).toMatchObject({ code: "development-only", reason: "production-refused" });
      } else {
        expect(o.error, name).toMatchObject({ code: "invalid-request", reason: "invalid-options" });
      }
    }
    for (const [name, c] of Object.entries<Report>(r.construction)) {
      expect(c.error, name).toMatchObject({
        code: "invalid-request",
        reason: "construction-refused",
      });
    }
    expect(r.entryOnMain.error).toMatchObject({
      code: "development-only",
      reason: "not-a-worker-thread",
    });

    const c = r.controller;
    expect(c.badId.error).toMatchObject({ code: "invalid-request", reason: "invalid-request-id" });
    expect(c.badSalt.error).toMatchObject({ code: "invalid-request", reason: "invalid-salt" });
    expect(c.badType.error).toMatchObject({ code: "invalid-request" });
    expect(c.duplicateWhilePending.error).toMatchObject({ code: "request-replayed" });
    expect(c.duplicateAfterDone.error).toMatchObject({ code: "request-replayed" });
    // 49 at once with one pending: exactly one more accepted, 48 refused, nothing queued.
    expect(c.inFlightAfterBurst).toBe(2);
    expect(c.burst.prepared).toEqual([2]);
    expect(c.burst.refused).toEqual(Array(48).fill("backpressure"));
    expect(c.first).toBe(1);
    expect(c.next).toBe(3);
    expect(c.closed).toMatchObject({ prepared: 3, failed: 0, lastReservedIndex: 3 });
  });
});

describe("lifecycle and failures", () => {
  it("starts, closes (also while busy) and terminates; pending requests become INDETERMINATE", () => {
    const { lifecycle: l } = probe(dist, "lifecycle");
    for (const k of [0, 1, 2]) {
      expect(l[`closed${k}`]).toMatchObject({ prepared: 2, lastReservedIndex: 2 });
      expect(l[`state${k}`]).toBe("closed");
      expect(l[`afterClose${k}`].error).toMatchObject({ code: "not-ready", reason: "closed" });
      expect(l[`closeAgain${k}`]).toBe(true);
    }
    expect(new Set([l.threadId0, l.threadId1, l.threadId2]).size).toBe(3);
    expect(l.handlesAfter).toBe(l.handlesBefore);
    expect(l.closeWhileBusyStateNow).toBe("closing");
    expect(l.refusedWhileClosing.error).toMatchObject({ code: "not-ready", reason: "closing" });
    expect(l.closeWhileBusy.results).toEqual([1, 2]);
    expect(l.closeWhileBusy.closed).toMatchObject({ prepared: 2, lastReservedIndex: 2 });
    expect(l.closeWhileBusy.state).toBe("closed");
    expect(l.terminate.results).toEqual([
      INDETERMINATE("worker-terminated", "terminated-by-owner"),
      INDETERMINATE("worker-terminated", "terminated-by-owner"),
    ]);
    expect(l.terminate.state).toBe("terminated");
    expect(l.terminate.after.error).toMatchObject({ code: "not-ready", reason: "terminated" });
    expect(l.terminate.close.error).toMatchObject({ code: "not-ready", reason: "terminated" });
  });

  const expectEnded = (r: Report, reason: string) => {
    expect(r.state).toBe("failed");
    expect(r.after.error).toMatchObject({ code: "not-ready", reason: "failed" });
    expect(r.close.error).toMatchObject({ code: "not-ready", reason: "failed" });
    expect(r.workerHandles).toBe(0); // no replacement worker, no retry
    void reason;
  };

  it("a crash after a completed preparation: the result is INDETERMINATE, never completed", () => {
    const copy = patched(
      "crash-after",
      "server/src/prep/prep-worker.js",
      "this.#prepared += 1;",
      'this.#prepared += 1; throw new Error("injected crash after preparation");',
      // prep/ is protected (P8-4b-0): with the trusted manifest this copy is refused at start
      // (see "integrity"); a rehashed manifest reaches the crash behaviour itself.
      "rehashed",
    );
    const r = probe(copy, "crash");
    expect(r.started).toBe(true);
    expect(r.results).toEqual([
      INDETERMINATE("worker-lost", "worker-error"),
      INDETERMINATE("worker-lost", "worker-error"),
    ]);
    expectEnded(r, "worker-error");
  });

  it("a worker exit with an unresolved reservation: INDETERMINATE, no retry", () => {
    const copy = patched(
      "exit-reserved",
      "server/src/round/prepare.js",
      "index = reservation.chainIndex;",
      "index = reservation.chainIndex; process.exit(7);",
      "rehashed",
    );
    const r = probe(copy, "crash");
    expect(r.results).toEqual([
      INDETERMINATE("worker-lost", "worker-exited"),
      INDETERMINATE("worker-lost", "worker-exited"),
    ]);
    expectEnded(r, "worker-exited");
  });

  it("an index-consuming failure halts the worker: nothing later is reserved or retried", () => {
    const copy = patched(
      "fail-consumed",
      "server/src/round/prepare.js",
      "const output = this.#runtime.run(keys.derivation); // disposes the derivation",
      'if (keys.chainIndex === 1) throw new Error("injected"); const output = this.#runtime.run(keys.derivation);',
      "rehashed",
    );
    const r = probe(copy, "crash");
    expect(r.results).toEqual([
      {
        ok: false,
        error: expect.objectContaining({
          code: "preparation-failed",
          reason: "script-invalid",
          indexState: "consumed",
          chainIndex: 1,
          indeterminate: false,
        }),
      },
      {
        ok: false,
        error: expect.objectContaining({
          code: "preparation-failed",
          reason: "worker-halted",
          indexState: "untouched",
          chainIndex: null,
        }),
      },
    ]);
    expect(r.state).toBe("halted");
    expect(r.after.error).toMatchObject({ code: "not-ready", reason: "halted" });
    // The offline P8-4a disposition classified index 1 `aborted`; index 2 was never reserved.
    expect(r.close).toMatchObject({
      ok: true,
      value: { prepared: 0, failed: 1, lastReservedIndex: 1, chainState: "active" },
    });
  });

  it.each([
    [
      "forged-index",
      "chainIndex: script.public.chainIndex,",
      "chainIndex: script.public.chainIndex + 1,",
      "index-sequence",
    ],
    [
      "forged-digest",
      "digest: script.secretDigest(),",
      'digest: "0".repeat(64),',
      "result-invalid",
    ],
  ])(
    "a forged result (%s) is a protocol violation: everything pending INDETERMINATE",
    (name, a, b, reason) => {
      const r = probe(patched(name, "server/src/prep/prep-worker.js", a, b, "rehashed"), "crash");
      expect(r.results).toEqual([
        INDETERMINATE("protocol-violation", reason),
        INDETERMINATE("protocol-violation", reason),
      ]);
      expectEnded(r, reason);
    },
  );
});

describe("P8-4b-1 lifecycle: ordering, halt, timeout, cancellation, request ids", () => {
  const expectEnded = (r: Report) => {
    expect(r.state).toBe("failed");
    expect(r.after.error).toMatchObject({ code: "not-ready", reason: "failed" });
    expect(r.close.error).toMatchObject({ code: "not-ready", reason: "failed" });
    expect(r.workerHandles).toBe(0);
  };

  it("fixed constants: a 30 s startup bound, chainLength + 64 request ids", () => {
    expect(PREP_START_TIMEOUT_MS).toBe(30_000);
    expect(REQUEST_ID_SLACK).toBe(64);
  });

  it("a worker halted before a request (unreadable frontier) halts the controller", () => {
    // P8-4b-0 reported this as an ordinary `chain-unavailable` failure and stayed `ready`.
    const copy = patched(
      "halt-frontier",
      "server/src/prep/prep-worker.js",
      "return (await this.#env.chainStatus(this.#chainId)).lastReservedIndex;",
      "if (!globalThis.__p84b1Halt) { globalThis.__p84b1Halt = true; return null; } " +
        "return (await this.#env.chainStatus(this.#chainId)).lastReservedIndex;",
      "rehashed",
    );
    const r = probe(copy, "crash");
    const halted = {
      ok: false,
      error: expect.objectContaining({
        code: "preparation-failed",
        reason: "worker-halted",
        indexState: "untouched",
        chainIndex: null,
        indeterminate: false,
      }),
    };
    expect(r.results).toEqual([halted, halted]);
    expect(r.state).toBe("halted");
    expect(r.after.error).toMatchObject({ code: "not-ready", reason: "halted" });
    // Nothing was reserved; the worker still closes cleanly.
    expect(r.close).toMatchObject({
      ok: true,
      value: { prepared: 0, failed: 0, lastReservedIndex: 0, chainState: "active" },
    });
  });

  it("a result then an exit: events are handled in order (the result first, then the loss)", () => {
    const copy = patched(
      "post-then-exit",
      "server/src/prep/prep-worker.js",
      WORKER_POST,
      `${WORKER_POST} process.exit(3);`,
      "rehashed",
    );
    const r = probe(copy, "crash");
    expect(r.results).toEqual([
      { ok: true, chainIndex: 1 },
      INDETERMINATE("worker-lost", "worker-exited"),
    ]);
    expectEnded(r);
  });

  it.each([
    [
      "a 4 MiB number array (the P8-4b-0 2 s / OOM payload)",
      "hostile-4mib",
      '{ const h = new TextEncoder().encode("[" + "1,".repeat(2097150) + "1]"); ' +
        "this.#port.postMessage({ ...prepared, bytes: h }, [h.buffer]); }",
    ],
    [
      "one byte over the proved cap",
      "hostile-cap",
      "{ const h = new Uint8Array(196609).fill(32); h.set(bytes); " +
        "this.#port.postMessage({ ...prepared, bytes: h }, [h.buffer]); }",
    ],
    [
      "a valid script in a SharedArrayBuffer",
      "hostile-sab",
      "{ const s = new Uint8Array(new SharedArrayBuffer(bytes.length)); s.set(bytes); " +
        "this.#port.postMessage({ ...prepared, bytes: s }); }",
    ],
    [
      "a valid script in an offset view",
      "hostile-offset",
      "{ const o = new Uint8Array(bytes.length + 8); o.set(bytes, 8); " +
        "this.#port.postMessage({ ...prepared, bytes: o.subarray(8) }, [o.buffer]); }",
    ],
  ])("%s is a contract violation, refused before any byte is read", (_name, dir, replacement) => {
    const r = probe(
      patched(dir, "server/src/prep/prep-worker.js", WORKER_POST, replacement, "rehashed"),
      "crash",
    );
    expect(r.results).toEqual([
      INDETERMINATE("protocol-violation", "invalid-message"),
      INDETERMINATE("protocol-violation", "invalid-message"),
    ]);
    expectEnded(r);
    // No main-thread turn was held for anything like a parse of the payload (P8-4b-0: 2.1 s).
    expect(r.maxGapMs).toBeLessThan(250);
  });

  it("start() fails with startup-timeout when the worker never reports ready", () => {
    const copy = patchedMany("start-timeout", [
      [
        "server/src/prep/prep-worker.js",
        "void start(node_worker_threads_1.parentPort);",
        "setInterval(() => {}, 1000);",
      ],
      // the fixed 30 s bound, shortened in this patched copy only
      [
        "server/src/prep/controller.js",
        "exports.PREP_START_TIMEOUT_MS = 30_000;",
        "exports.PREP_START_TIMEOUT_MS = 400;",
      ],
    ]);
    const r = probe(copy, "start");
    expect(r.result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "start-failed", reason: "startup-timeout" }),
    });
    expect(r.timeoutMs).toBe(400);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(390);
    expect(r.elapsedMs).toBeLessThan(10_000);
    expect(r.workerHandles).toBe(0); // the silent worker was terminated
  });

  it("retains chainLength + 64 request ids, evicts none, then refuses without sending", () => {
    const { ids: r } = probe(dist, "ids");
    expect(r.sent).toBe(1 + 64);
    expect(r.outcomes).toEqual({
      "prepared:1": 1,
      "preparation-failed:chain-unavailable:untouched": 64,
    });
    expect(r.state).toBe("ready");
    expect(r.exhausted.error).toMatchObject({ code: "request-ids-exhausted", reason: null });
    // old ids are still known: replays are still detected, never re-sent
    expect(r.replayedOld.error).toMatchObject({ code: "request-replayed" });
    expect(r.replayedLast.error).toMatchObject({ code: "request-replayed" });
    expect(r.inFlight).toBe(0);
    expect(r.stateAfter).toBe("ready");
    // the worker saw exactly the 65 sent requests
    expect(r.closed).toMatchObject({ prepared: 1, failed: 64, lastReservedIndex: 1 });
  });

  it("terminate() between verification slices: cancelled, zeroed, INDETERMINATE, not delivered", () => {
    const copy = patched(
      "slice-hook",
      "server/src/prep/controller.js",
      "const script = verification.step(round_script_1.DEFAULT_VERIFICATION_BUDGET);",
      "globalThis.__p84b1Slice?.(message.bytes, verification); " +
        "const script = verification.step(round_script_1.DEFAULT_VERIFICATION_BUDGET);",
      "rehashed",
    );
    const { slice: r } = probe(copy, "slice");
    expect(r.receivedBytesZeroed).toBe(true); // zeroed once the private copy existed
    expect(r.stateAtTerminate).toBe("running");
    expect(r.slicesAfterTerminate).toBe(2); // no slice ran after the next turn
    expect(r.verification).toEqual([
      "cancelled",
      '{"verification":"RoundScriptVerification","state":"cancelled"}',
    ]);
    expect(r.results).toEqual([
      INDETERMINATE("worker-terminated", "terminated-by-owner"),
      INDETERMINATE("worker-terminated", "terminated-by-owner"),
    ]);
    expect(r.state).toBe("terminated");
  });
});

describe("integrity (src/prep is protected: owner-approved P8-4b-0 expansion)", () => {
  const PREP_FILES = [
    "server/src/prep/controller.js",
    "server/src/prep/prep-worker.js",
    "server/src/prep/protocol.js",
  ];
  /** An unpatched copy of the clean build next to the TRUSTED manifest. */
  const copyOf = (name: string): string => {
    const copy = join(tmp, name, "dist");
    cpSync(dist, copy, { recursive: true });
    cpSync(join(tmp, "integrity"), join(tmp, name, "integrity"), { recursive: true });
    writeFileSync(join(tmp, name, "package.json"), '{ "type": "commonjs" }\n');
    return copy;
  };
  const flipOneByte = (file: string, offset: number) => {
    const bytes = readFileSync(file);
    bytes[offset] = bytes[offset]! ^ 0x01;
    writeFileSync(file, bytes);
  };
  /**
   * The OUT-OF-PROCESS verifier (scripts/engine-integrity.mjs verify, the build's last step; it
   * runs no code of the build and always compares with the tracked trusted manifest). It never
   * writes the trusted manifest; on a mismatch it removes the copy's engine bundle.
   */
  const cliVerify = (buildDir: string) => {
    const before = readFileSync(TRUSTED_MANIFEST);
    const run = spawnSync(process.execPath, [INTEGRITY_CLI, "verify", buildDir], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(readFileSync(TRUSTED_MANIFEST).equals(before)).toBe(true);
    return {
      status: run.status,
      problems: run.stderr
        .split(/\r?\n/)
        .filter((l) => l.startsWith("  "))
        .map((l) => l.trim()),
      bundleLeft: existsSync(join(buildDir, "engine", "engine.cjs")),
    };
  };
  const REFUSED = {
    ok: false,
    error: expect.objectContaining({ code: "start-failed", reason: "runtime-integrity-failed" }),
  };
  const fatal = (detail: string) => [
    { type: "fatal", code: "startup-failed", reason: "runtime-integrity-failed", detail },
  ];

  it("the trusted manifest names the 3 worker files; a clean build is accepted everywhere", () => {
    const m = JSON.parse(readFileSync(TRUSTED_MANIFEST, "utf8"));
    // 32 until P8-4b-2; + the scheduler's eight files (owner-approved P8-4b-2 expansion).
    expect(m.files).toHaveLength(40);
    expect(
      m.files.map((f: Report) => f.path).filter((p: string) => p.startsWith("server/src/prep/")),
    ).toEqual(PREP_FILES);
    const r = probe(dist, "integrity");
    expect(r.controller).toEqual({ ok: true });
    expect(r.controllerClosed).toBe("closed");
    expect(r.rawMessages).toEqual([{ type: "ready" }, { type: "closed" }]);
    expect(r.rawExitCode).toBe(0);
    expect(cliVerify(dist)).toEqual({ status: 0, problems: [], bundleLeft: true });
  });

  it.each(PREP_FILES)(
    "one changed byte of %s is refused (controller, worker, out of process)",
    (file) => {
      const copy = copyOf(`flip-${file.split("/").pop()}`);
      // Offset 20 lies in the file's leading comment: the code still parses and runs.
      flipOneByte(join(copy, ...file.split("/")), 20);
      const r = probe(copy, "integrity");
      expect(r.controller).toEqual(REFUSED);
      expect(r.rawMessages).toEqual(fatal("digest-mismatch"));
      expect(r.rawExitCode).toBe(0);
      expect(cliVerify(copy)).toEqual({
        status: 1,
        problems: [`changed: ${file}`],
        bundleLeft: false,
      });
    },
  );

  it.each(PREP_FILES)("a missing %s fails closed", (file) => {
    const copy = copyOf(`missing-${file.split("/").pop()}`);
    rmSync(join(copy, ...file.split("/")));
    const r = probe(copy, "integrity");
    expect(r.controller.ok).toBe(false);
    if (file.endsWith("controller.js")) {
      // Nothing can start a worker; a raw worker refuses the build by itself.
      expect(r.controller.loadError).toEqual({ code: "MODULE_NOT_FOUND" });
      expect(r.rawMessages).toEqual(fatal("file-missing"));
    } else if (file.endsWith("prep-worker.js")) {
      // Refused by the controller's check before any worker is created.
      expect(r.controller).toEqual(REFUSED);
      expect(r.rawMessages).toEqual([]);
      expect(r.rawExitCode).not.toBe(0);
    } else {
      // The contract module is required by both: neither can even load.
      expect(r.controller.loadError).toEqual({ code: "MODULE_NOT_FOUND" });
      expect(r.rawMessages).toEqual([]);
      expect(r.rawError).toEqual({ code: "MODULE_NOT_FOUND" });
      expect(r.rawExitCode).not.toBe(0);
    }
    expect(cliVerify(copy)).toEqual({
      status: 1,
      problems: [`missing: ${file}`],
      bundleLeft: false,
    });
  });

  it("an unexpected file in src/prep or round/ is refused", () => {
    for (const [name, target] of [
      ["extra-prep-file", "server/src/prep/extra.js"],
      ["extra-round-file", "server/src/round/prep-worker.js"],
    ] as const) {
      const copy = copyOf(name);
      cpSync(
        join(copy, "server", "src", "prep", "prep-worker.js"),
        join(copy, ...target.split("/")),
      );
      const r = probe(copy, "integrity");
      expect(r.controller, name).toEqual(REFUSED);
      expect(r.rawMessages, name).toEqual(fatal("unexpected-file"));
      expect(cliVerify(copy), name).toEqual({
        status: 1,
        problems: [`unexpected: ${target}`],
        bundleLeft: false,
      });
    }
  });

  it("a stale 29-file manifest cannot authorize the expanded worker", () => {
    // The strongest stale case: every other entry current, only the three worker files absent.
    const copy = copyOf("stale-manifest");
    const trusted = JSON.parse(readFileSync(TRUSTED_MANIFEST, "utf8"));
    const stale = {
      ...trusted,
      files: trusted.files.filter((f: Report) => !f.path.startsWith("server/src/prep/")),
    };
    // 29 before P8-4b-2; the scheduler's eight files (P8-4b-2) stay current in this copy.
    expect(stale.files).toHaveLength(37);
    const stalePath = join(copy, "..", "integrity", "engine-manifest.json");
    writeFileSync(stalePath, `${JSON.stringify(stale, null, 2)}\n`);
    const r = probe(copy, "integrity");
    expect(r.controller).toEqual(REFUSED); // manifest-incomplete: it must name the worker files
    expect(r.rawMessages).toEqual(fatal("unexpected-file"));
    expect(tool.verifyAgainstTrusted(copy, stalePath)).toEqual(
      PREP_FILES.map((p) => `unexpected: ${p}`),
    );
  });

  it("an unexpected dependency path of the worker or the controller is refused", () => {
    // Rehashed manifests (an attacker who rewrote both): the closure checks are what refuse an
    // entry that loads a module outside the protected set. Not a defence against that attacker
    // in general (A-1): the same attacker can remove the checks.
    for (const [name, file, expected] of [
      ["dep-worker", "server/src/prep/prep-worker.js", "worker"],
      ["dep-controller", "server/src/prep/controller.js", "controller"],
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
      expect(r.controller, name).toEqual(REFUSED);
      if (expected === "worker") {
        expect(r.rawMessages, name).toEqual(fatal("unexpected-module"));
      } else {
        // The raw worker never loads the controller: it starts normally.
        expect(r.rawMessages, name).toEqual([{ type: "ready" }, { type: "closed" }]);
      }
    }
  });

  it.each([
    ["the engine bundle", "engine/engine.cjs", "Math.min(m, 200)", "Math.min(m, 199)"],
    ["compiled shared fairness", "src/fairness/derive.js", '"use strict";', '"use strict"; '],
    ["server fairness", "server/src/fairness/chain-vault.js", '"use strict";', '"use strict"; '],
    ["round preparation", "server/src/round/prepare.js", '"use strict";', '"use strict"; '],
  ])("tampered %s is still refused by the controller and by the worker itself", (_, file, a, b) => {
    const copy = patched(`tampered-${file.replace(/\W/g, "-")}`, file, a, b, "trusted");
    const r = probe(copy, "integrity");
    expect(r.controller).toEqual(REFUSED);
    expect(r.rawMessages).toEqual(
      fatal(file === "engine/engine.cjs" ? "digest-mismatch" : "size-mismatch"),
    );
    expect(r.rawExitCode).toBe(0);
    expect(cliVerify(copy)).toMatchObject({ status: 1, problems: [`changed: ${file}`] });
  });
});

describe("responsiveness (smoke bound only; NOT the D7 gate)", () => {
  it("the main event loop keeps turning while 1, 10 and 50 rounds are prepared", () => {
    const r = probe(dist, "respond");
    expect(r.prepared).toBe(61);
    expect(r.closed).toMatchObject({ prepared: 61, failed: 0, lastReservedIndex: 61 });
    for (const n of ["1", "10", "50"]) {
      const [run] = r.worker[n];
      expect(run.consecutive, n).toBe(true);
      expect(run.latency.n, n).toBe(Number(n));
      // The loop turned far more often than results arrived, and no single turn was held for
      // anything like a round's preparation. A coarse smoke bound on unknown hardware, not D7.
      expect(run.gapCount, n).toBeGreaterThan(100 * Number(n));
      expect(run.gaps.max, n).toBeLessThan(50);
    }
  });
});

describe("reachability", () => {
  it("the compiled application loads no prep, round, engine or fairness module", () => {
    // app.js needs fastify & co.: a junction to this package's node_modules (removed first in
    // afterAll), created only now so that no earlier probe could resolve a package.
    symlinkSync(join(SERVER, "node_modules"), join(tmp, "node_modules"), "junction");
    const r = probe(dist, "startup");
    expect(r.loaded).toContain("server/src/app.js");
    expect(r.reached).toEqual([]);
  });
});
