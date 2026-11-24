// Compiled-runtime probe of the offline preparation worker (P8-4b-0). TEST ONLY; run by
// prep-worker.test.ts (and the benchmark) in a fresh Node process:
//
//   node prep-probe.cjs <server build dir> <scenario>
//
// The build dir holds the `npm run build` output next to ../integrity/engine-manifest.json and,
// for `replay`, the TEST-ONLY bundles in qa/ (test/helpers/engine-build.ts). Math.random and the
// browser globals throw on use in this (main) thread and are counted; console output is counted.
// Prints one JSON report on stdout and nothing else. Scenarios:
//
//   offmain     preparation runs in the worker: no derivation, RoundKeys or seed copy is created
//               on the main thread and the engine bundle is never loaded there
//   replay      all 16 replay pins (A1–A8, B1–B8) through two workers, compared with the reference
//               runner, the pins, and whole RoundScripts of the current in-process implementation
//   secrets     every raw message of a worker on the public vector chain: exact contract keys,
//               plain data only, no round seed anywhere (seeds of the public chain are known)
//   contract    worker-config / message / option / construction injection, duplicates, backpressure
//   lifecycle   start, close, close while busy, terminate while busy, use after close / terminate
//   crash       (patched builds) pending requests after a worker crash / protocol violation
//   integrity   (tampered builds) controller start and a raw worker refuse the build
//   startup     the compiled application loads no prep, round, engine or fairness module
//   respond     main-thread event-loop gaps while 1, 10 and 50 rounds are prepared (worker)
//   bench       `respond` plus the in-process baseline and repetitions (manual benchmark)
"use strict";
const path = require("node:path");
const { inspect } = require("node:util");
const { Worker, threadId: mainThreadId } = require("node:worker_threads");

const out = path.resolve(process.argv[2]);
const scenario = process.argv[3];

// ---- Poison Math.random and the browser globals in this thread; count console output -------
const counters = { mathRandom: 0, browser: {}, console: 0 };
Math.random = function poisonedRandom() {
  counters.mathRandom += 1;
  throw new Error("Math.random called");
};
for (const name of [
  "window",
  "document",
  "self",
  "navigator",
  "localStorage",
  "fetch",
  "WebSocket",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      counters.browser[name] = (counters.browser[name] ?? 0) + 1;
      throw new Error(`${name} accessed`);
    },
  });
}
for (const m of ["log", "info", "warn", "error", "debug", "trace"]) {
  console[m] = () => {
    counters.console += 1;
  };
}

const load = (rel) => require(path.join(out, rel));
const rel = (f) => path.relative(out, f).split(path.sep).join("/");
const emit = (report) => {
  report.counters = counters;
  process.stdout.write(JSON.stringify(report));
};
const errorOf = (e) => ({
  name: e && e.name,
  code: e && e.code,
  reason: e && Object.hasOwn(e, "reason") ? e.reason : undefined,
  indeterminate: e && Object.hasOwn(e, "indeterminate") ? e.indeterminate : undefined,
  indexState: e && Object.hasOwn(e, "indexState") ? e.indexState : undefined,
  chainIndex: e && Object.hasOwn(e, "chainIndex") ? e.chainIndex : undefined,
  message: e && e.message,
});
const settle = (p) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error: errorOf(error) }),
  );
const ENTRY = path.join(out, "server", "src", "prep", "prep-worker.js");

if (scenario === "startup") {
  load("server/src/app.js");
  const loaded = Object.keys(require.cache)
    .filter((f) => f.startsWith(out + path.sep))
    .map(rel)
    .sort();
  emit({
    loaded,
    reached: loaded.filter((f) =>
      /^(?:engine\/|server\/src\/(?:prep|round|fairness)\/|server\/src\/fairness\.js|src\/fairness\/)/.test(
        f,
      ),
    ),
  });
  return;
}

// ---- Main-thread instrumentation (this thread's fairness instance only) --------------------
const bridge = load("server/src/fairness.js");
const { RoundKeys } = load("server/src/fairness/round-keys.js");
const mainThread = { derivations: 0, keys: 0, secretCopies: 0 };
{
  const create = bridge.RoundDerivation.create;
  bridge.RoundDerivation.create = function (...args) {
    mainThread.derivations += 1;
    return create.apply(this, args);
  };
  const createKeys = RoundKeys.create;
  RoundKeys.create = function (...args) {
    mainThread.keys += 1;
    return createKeys.apply(this, args);
  };
  const fromBytes = bridge.SecretBytes.fromBytes;
  bridge.SecretBytes.fromBytes = function (...args) {
    mainThread.secretCopies += 1;
    return fromBytes.apply(this, args);
  };
}
const V = bridge.FAIRNESS_DEV_VECTORS_V1;
const saltHex = (salt) => (salt === "A" ? V.saltAHex : V.saltBHex);
const SALT_C = "c".repeat(64);
// A build without a loadable controller (the `integrity` scenario's missing-file copies) fails
// closed here: nothing can start a worker. Reported, never worked around.
let controllerLoadError = null;
const { PrepWorkerController } = (() => {
  try {
    return load("server/src/prep/controller.js");
  } catch (e) {
    controllerLoadError = { code: e && e.code };
    return {};
  }
})();

/** Keeps up to `maxInFlight` requests outstanding until `n` rounds are prepared. */
function drive(controller, n, prefix, salt = () => SALT_C, onResult = () => {}) {
  return new Promise((resolve, reject) => {
    const results = [];
    let next = 1;
    const pump = () => {
      while (next <= n && controller.inFlight < controller.maxInFlight) {
        const i = next++;
        const t0 = performance.now();
        controller.prepare(`${prefix}-${i}`, salt(i)).then((round) => {
          results.push({ i, ms: performance.now() - t0, round });
          onResult(round);
          if (results.length === n) resolve(results.sort((a, b) => a.i - b.i));
          else pump();
        }, reject);
      }
    };
    pump();
  });
}

/** Records gaps between consecutive setImmediate callbacks (main-thread responsiveness). */
function gapTicker() {
  const gaps = [];
  let last = performance.now();
  let on = true;
  const tick = () => {
    const t = performance.now();
    gaps.push(t - last);
    last = t;
    if (on) setImmediate(tick);
  };
  setImmediate(tick);
  return () => {
    on = false;
    return gaps;
  };
}
const stats = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const r = (x) => Math.round(x * 1000) / 1000;
  return { n: s.length, p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), max: r(s[s.length - 1]) };
};
const mem = () => {
  const m = process.memoryUsage();
  const mb = (x) => Math.round((x / 1048576) * 10) / 10;
  return { rssMB: mb(m.rss), heapUsedMB: mb(m.heapUsed), externalMB: mb(m.external) };
};

/** A raw worker on the fixed entry (contract tests): every message recorded. */
function rawWorker(workerData) {
  const worker = new Worker(ENTRY, { workerData, execArgv: [] });
  const messages = [];
  const waiters = [];
  worker.on("message", (m) => {
    messages.push(m);
    for (const w of waiters.splice(0)) w();
  });
  const exit = new Promise((resolve) => worker.on("exit", resolve));
  const errored = new Promise((resolve) => worker.on("error", (e) => resolve(errorOf(e))));
  const until = async (pred) => {
    while (!pred(messages)) await new Promise((r) => waiters.push(r));
  };
  return { worker, messages, exit, errored, until };
}
const CONFIG = (over = {}) => ({
  protocol: 1,
  mode: "test",
  chain: "public-test-vectors",
  chainLength: 8,
  maxInFlight: 2,
  ...over,
});

(async () => {
  const report = { mainThreadId };

  // ==== offmain =================================================================================
  if (scenario === "offmain") {
    const c = await PrepWorkerController.start({ mode: "development", chain: "random" });
    // start() runs createNodeFairnessCrypto()'s PUBLIC known-answer self-test on this thread
    // (public vectors only); preparation itself must add nothing here.
    report.mainThreadAtStart = { ...mainThread };
    const rounds = await drive(c, 6, "off");
    report.chain = { ...c.chain, chainId: c.chain.chainId.length };
    report.indices = rounds.map((r) => r.round.chainIndex);
    report.scripts = rounds.map((r) => ({
      redacted: String(r.round.script),
      json: JSON.stringify(r.round.script),
      index: r.round.script.public.chainIndex,
      chainMatches: r.round.script.public.chainId === c.chain.chainId,
    }));
    report.closed = await c.close();
    report.mainThread = mainThread;
    report.mainLoadedBundle = Object.keys(require.cache).some((f) =>
      f.endsWith(path.join("engine", "engine.cjs")),
    );
    report.mainLoadedPrepare = Object.keys(require.cache).some((f) =>
      f.endsWith(path.join("round", "prepare.js")),
    );
    report.mainLoadedWorkerEntry = Object.keys(require.cache).some((f) => f === ENTRY);
    return emit(report);
  }

  // ==== replay ==================================================================================
  if (scenario === "replay") {
    const referenceRunner = load("qa/reference-runner.cjs");
    const { REPLAY_RECORD_PINS } = load("qa/replay-pins.cjs");
    const { ROUND_SCRIPT_KNOWN_ANSWERS } = load("server/src/round/known-answers.js");
    const { createOfflineRoundEnvironment } = load("server/src/round/prepare.js");
    const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
    const crypto = createNodeFairnessCrypto();
    const hash = crypto.hash;
    const utf8 = (s) => new TextEncoder().encode(s);
    const hashJson = (value) => bridge.bytesToHex(bridge.sha256(hash, utf8(JSON.stringify(value))));
    const input = (salt, index) => ({
      fv: 1,
      chainId: bridge.hexToBytes(V.linksHex[0]),
      chainIndex: index,
      salt: bridge.hexToBytes(saltHex(salt)),
      roundSeed: bridge.SecretBytes.fromBytes(bridge.hexToBytes(V.linksHex[index])),
    });
    // The P8-3b reference record, rebuilt from a RoundScript (as in round-probe.cjs).
    const referenceRecordFrom = (script) => {
      const s = script.secretContent();
      const finalCreatures = s.creatures.map((c) => {
        const o = {
          id: c.id,
          kind: c.kind,
          x: c.x,
          worldY: c.worldY,
          size: c.size,
          phase: c.phase,
          dir: c.dir,
        };
        if (c.consumedTick !== null) o.consumed = true;
        return o;
      });
      const body = {
        fv: script.public.fv,
        chainIndex: script.public.chainIndex,
        outcome: s.outcome,
        crashAt: s.crashAt,
        diveStartTick: s.diveStartTick,
        terminalTick: s.terminalTick,
        impactTick: s.impactTick,
        terminalMultiplier: s.final.multiplier,
        jackpot: s.jackpot,
        chests: s.chests,
        creaturesSpawned: s.final.nextCreatureId - 1,
        goldfish: s.creatures
          .filter((c) => c.kind === "goldfish")
          .map((c) => ({ id: c.id, x: c.x, worldY: c.worldY, consumedTick: c.consumedTick })),
        world: {
          worldY: s.final.worldY,
          boost: s.final.boost,
          multiplier: s.final.multiplier,
          nextSpawnAt: s.final.nextSpawnAt,
          nextCreatureId: s.final.nextCreatureId,
          creaturesSha256: hashJson(finalCreatures),
        },
        drawCounts: {
          crash: s.drawCounts.crash,
          jackpot: s.drawCounts.jackpot,
          chests: s.drawCounts.chests,
          world: s.drawCounts.world,
        },
      };
      return { ...body, recordSha256: hashJson(body) };
    };
    const pinMap = new Map(REPLAY_RECORD_PINS.map(([s, i, h]) => [`${s}${i}`, h]));
    const candidates = new Map(
      ROUND_SCRIPT_KNOWN_ANSWERS.filter(
        (a) => a.digestCandidate !== null && (a.chain ?? "dev-v1") === "dev-v1",
      ).map((a) => [`${a.salt}${a.index}`, a.digestCandidate]),
    );
    report.pins = [];
    report.threadIds = [];
    for (const salt of ["A", "B"]) {
      const c = await PrepWorkerController.start({ mode: "test", chain: "public-test-vectors" });
      report.threadIds.push(c.chain.threadId);
      const rounds = await drive(c, 8, `pin-${salt}`, () => saltHex(salt));
      report[`closed${salt}`] = await c.close();
      // The current implementation, in process, on the same public chain with the same ids.
      const env = createOfflineRoundEnvironment({ mode: "test", crypto });
      const chain = await env.importPublicTestVectorChain();
      for (const { i, round } of rounds) {
        const direct = await env.prepareScript(
          chain.chainId,
          `pin-${salt}-${i}`,
          bridge.hexToBytes(saltHex(salt)),
        );
        const a = round.script.secretCanonicalBytes();
        const b = direct.secretCanonicalBytes();
        const rebuilt = referenceRecordFrom(round.script);
        const reference = referenceRunner.runReferenceRoundFromInput(hash, input(salt, i)).record;
        report.pins.push({
          key: `${salt}${i}`,
          chainIndex: round.chainIndex,
          pin: pinMap.get(`${salt}${i}`),
          rebuiltRecordSha256: rebuilt.recordSha256,
          sameReferenceRecord: JSON.stringify(rebuilt) === JSON.stringify(reference),
          digest: round.script.secretDigest(),
          inProcessDigest: direct.secretDigest(),
          sameBytes: a.length === b.length && a.every((x, k) => x === b[k]),
          samePublic: JSON.stringify(round.script.public) === JSON.stringify(direct.public),
          sameContent:
            JSON.stringify(round.script.secretContent()) === JSON.stringify(direct.secretContent()),
          candidate: candidates.get(`${salt}${i}`) ?? null,
          bytes: a.length,
        });
      }
      env.close();
    }
    return emit(report);
  }

  // ==== secrets =================================================================================
  if (scenario === "secrets") {
    const w = rawWorker(CONFIG());
    await w.until((m) => m.some((x) => x.type === "ready"));
    for (let i = 1; i <= 8; i++) {
      w.worker.postMessage({ type: "prepare", requestId: `s-${i}`, saltHex: V.saltAHex });
      await w.until(
        (m) => m.filter((x) => x.type === "prepared" || x.type === "failed").length >= i,
      );
    }
    w.worker.postMessage({ type: "shutdown" });
    report.exitCode = await w.exit;
    const seeds = V.linksHex.slice(1).map((h) => h.toLowerCase());
    const shapes = new Set();
    const hits = [];
    const walk = (v, where) => {
      if (v instanceof Uint8Array) {
        shapes.add(`Uint8Array:${Object.getPrototypeOf(v) === Uint8Array.prototype}`);
        const hex = Buffer.from(v).toString("hex");
        const text = Buffer.from(v).toString("latin1");
        for (const s of seeds) {
          if (hex.includes(s) || text.includes(s) || hex.includes(s.slice(0, 32))) hits.push(where);
        }
        return;
      }
      if (v !== null && typeof v === "object") {
        const proto = Object.getPrototypeOf(v);
        shapes.add(
          Array.isArray(v)
            ? "array"
            : proto === Object.prototype
              ? "object"
              : `other:${proto && proto.constructor && proto.constructor.name}`,
        );
        for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
        return;
      }
      shapes.add(typeof v);
      if (typeof v === "string")
        for (const s of seeds) if (v.toLowerCase().includes(s.slice(0, 32))) hits.push(where);
    };
    report.messages = w.messages.map((m, k) => {
      walk(m, `m${k}`);
      return { type: m.type, keys: Object.keys(m).sort() };
    });
    report.shapes = [...shapes].sort();
    report.seedHits = hits;
    report.forbiddenKeys = w.messages
      .flatMap((m) => Object.keys(m))
      .filter(
        (k) =>
          /seed|key|derivation|rng|stream|authority|runtime|vault|store|path|code$/i.test(k) &&
          k !== "code",
      );
    // The controller's PreparedRound: what an accidental log of it shows.
    const c = await PrepWorkerController.start({ mode: "test", chain: "public-test-vectors" });
    const [r] = await drive(c, 1, "red", () => V.saltAHex);
    const crash = String(r.round.script.secretContent().crashAt);
    report.prepared = {
      keys: Object.keys(r.round).sort(),
      views: [JSON.stringify(r.round), String(r.round.script), inspect(r.round, { depth: 5 })].map(
        (s) => s.includes(r.round.script.secretDigest()) || s.includes(`"crashAt":${crash}`),
      ),
      controllerViews: [JSON.stringify(c), inspect(c)],
    };
    await c.close();
    return emit(report);
  }

  // ==== contract ================================================================================
  if (scenario === "contract") {
    // -- worker configurations: anything but the exact contract is refused at start --
    const badConfigs = {
      extraRuntime: CONFIG({ runtime: "x" }),
      extraEntry: CONFIG({ entry: "x" }),
      extraPath: CONFIG({ path: out }),
      extraCode: CONFIG({ code: "process.exit(0)" }),
      productionMode: CONFIG({ mode: "production" }),
      vectorsInDevelopment: CONFIG({ mode: "development" }),
      maxInFlight3: CONFIG({ maxInFlight: 3 }),
      randomLength0: CONFIG({ chain: "random", chainLength: 0 }),
      protocol2: CONFIG({ protocol: 2 }),
      notObject: "test",
      missing: undefined,
    };
    report.configs = {};
    for (const [name, data] of Object.entries(badConfigs)) {
      const w = rawWorker(data);
      const exitCode = await w.exit;
      report.configs[name] = { messages: w.messages, exitCode };
    }

    // -- messages: malformed / injected messages reserve nothing --
    {
      const w = rawWorker(CONFIG());
      await w.until((m) => m.some((x) => x.type === "ready"));
      const bad = [
        { type: "prepare", requestId: "m-1", saltHex: V.saltAHex, chainIndex: 5 },
        { type: "prepare", requestId: "m-1", saltHex: V.saltAHex, chainId: V.linksHex[0] },
        { type: "prepare", requestId: "m-1", saltHex: V.saltAHex.toUpperCase() },
        { type: "prepare", requestId: "m-1", saltHex: "00" },
        { type: "prepare", requestId: "-bad", saltHex: V.saltAHex },
        { type: "prepare", requestId: "m-1" },
        { type: "eval", code: "process.exit(9)" },
        { type: "load", path: ENTRY },
        { type: "shutdown", now: true },
        null,
        "prepare",
        [1, 2],
      ];
      for (const m of bad) w.worker.postMessage(m);
      w.worker.postMessage({ type: "prepare", requestId: "m-1", saltHex: V.saltAHex });
      w.worker.postMessage({ type: "prepare", requestId: "m-1", saltHex: V.saltAHex }); // duplicate
      await w.until(
        (m) => m.filter((x) => x.type === "prepared" || x.type === "failed").length >= 2,
      );
      w.worker.postMessage({ type: "prepare", requestId: "m-2", saltHex: V.saltAHex });
      await w.until(
        (m) => m.filter((x) => x.type === "prepared" || x.type === "failed").length >= 3,
      );
      w.worker.postMessage({ type: "shutdown" });
      const exitCode = await w.exit;
      report.messages = {
        rejected: w.messages.filter((m) => m.type === "rejected").length,
        badCount: bad.length,
        results: w.messages
          .filter((m) => m.type === "prepared" || m.type === "failed")
          .map((m) => ({
            type: m.type,
            requestId: m.requestId,
            chainIndex: m.chainIndex,
            code: m.code ?? null,
            indexState: m.indexState ?? null,
          })),
        closed: w.messages.find((m) => m.type === "closed"),
        exitCode,
      };
    }

    // -- raw backpressure: maxInFlight 1, three at once --
    {
      const w = rawWorker(CONFIG({ maxInFlight: 1 }));
      await w.until((m) => m.some((x) => x.type === "ready"));
      for (const id of ["b-1", "b-2", "b-3"]) {
        w.worker.postMessage({ type: "prepare", requestId: id, saltHex: V.saltAHex });
      }
      await w.until(
        (m) => m.filter((x) => x.type === "prepared" || x.type === "failed").length >= 3,
      );
      w.worker.postMessage({ type: "shutdown" });
      await w.exit;
      report.rawBackpressure = {
        results: w.messages
          .filter((m) => m.type === "prepared" || m.type === "failed")
          .map((m) => ({
            type: m.type,
            requestId: m.requestId,
            code: m.code ?? null,
            indexState: m.indexState ?? null,
          })),
        closed: w.messages.find((m) => m.type === "closed"),
      };
    }

    // -- controller options: no path, entry, code, runtime or worker data accepted --
    const badOptions = {
      entry: { mode: "test", chain: "random", entry: ENTRY },
      runtime: { mode: "test", chain: "random", runtime: {} },
      workerData: { mode: "test", chain: "random", workerData: {} },
      eval: { mode: "test", chain: "random", eval: true },
      path: { mode: "test", chain: "random", path: out },
      symbol: { mode: "test", chain: "random", [Symbol("x")]: 1 },
      production: { mode: "production", chain: "random" },
      vectorsInDevelopment: { mode: "development", chain: "public-test-vectors" },
      maxInFlight3: { mode: "test", chain: "random", maxInFlight: 3 },
      chainLengthHuge: { mode: "test", chain: "random", chainLength: 1e9 },
      nullOptions: null,
    };
    report.options = {};
    for (const [name, options] of Object.entries(badOptions)) {
      report.options[name] = await settle(PrepWorkerController.start(options));
    }
    process.env.NODE_ENV = "production";
    report.options.nodeEnvProduction = await settle(
      PrepWorkerController.start({ mode: "development", chain: "random" }),
    );
    delete process.env.NODE_ENV;

    // -- construction: only start() constructs a controller --
    const fakeWorker = { on() {}, off() {}, postMessage() {}, terminate() {} };
    const ready = {
      type: "ready",
      protocol: 1,
      threadId: 1,
      chainId: V.linksHex[0],
      chainLength: 8,
      fv: 1,
    };
    const attempts = {
      direct: () => new PrepWorkerController({}, fakeWorker, CONFIG(), ready, {}),
      reflect: () =>
        Reflect.construct(PrepWorkerController, [
          Object.freeze(Object.create(null)),
          fakeWorker,
          CONFIG(),
          ready,
          {},
        ]),
      subclass: () =>
        new (class extends PrepWorkerController {})(undefined, fakeWorker, CONFIG(), ready, {}),
    };
    report.construction = {};
    for (const [name, f] of Object.entries(attempts)) {
      try {
        f();
        report.construction[name] = { ok: true };
      } catch (e) {
        report.construction[name] = { ok: false, error: errorOf(e) };
      }
    }
    // -- the worker entry refuses to run on the main thread --
    try {
      require(ENTRY);
      report.entryOnMain = { ok: true };
    } catch (e) {
      report.entryOnMain = { ok: false, error: errorOf(e) };
    }

    // -- controller: malformed, duplicate and excess requests are refused before sending --
    {
      const c = await PrepWorkerController.start({ mode: "test", chain: "public-test-vectors" });
      const r = {};
      r.badId = await settle(c.prepare("-x", V.saltAHex));
      r.badSalt = await settle(c.prepare("c-0", "abc"));
      r.badType = await settle(c.prepare(42, V.saltAHex));
      const first = c.prepare("c-1", V.saltAHex);
      r.duplicateWhilePending = await settle(c.prepare("c-1", V.saltAHex));
      const burst = [];
      for (let i = 2; i <= 50; i++) burst.push(settle(c.prepare(`c-${i}`, V.saltAHex)));
      r.inFlightAfterBurst = c.inFlight;
      const burstResults = await Promise.all(burst);
      r.burst = {
        prepared: burstResults.filter((x) => x.ok).map((x) => x.value.chainIndex),
        refused: burstResults.filter((x) => !x.ok).map((x) => x.error.code),
      };
      r.first = (await settle(first)).value.chainIndex;
      r.duplicateAfterDone = await settle(c.prepare("c-1", V.saltAHex));
      r.next = (await settle(c.prepare("c-next", V.saltAHex))).value.chainIndex;
      r.closed = await c.close();
      report.controller = r;
    }
    return emit(report);
  }

  // ==== lifecycle ===============================================================================
  if (scenario === "lifecycle") {
    const r = {};
    // Start / close cycles: no thread or handle left behind.
    const before = process
      .getActiveResourcesInfo()
      .filter((x) => /Worker|MessagePort/.test(x)).length;
    r.startMs = [];
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const c = await PrepWorkerController.start({
        mode: "development",
        chain: "random",
        chainLength: 16,
      });
      r.startMs.push(Math.round(performance.now() - t0));
      r[`threadId${k}`] = c.chain.threadId;
      await drive(c, 2, `cyc${k}`);
      r[`closed${k}`] = await c.close();
      r[`state${k}`] = c.state;
      r[`afterClose${k}`] = await settle(c.prepare(`late${k}`, SALT_C));
      r[`closeAgain${k}`] = (await settle(c.close())).ok;
    }
    await new Promise((res) => setImmediate(res));
    r.handlesBefore = before;
    r.handlesAfter = process
      .getActiveResourcesInfo()
      .filter((x) => /Worker|MessagePort/.test(x)).length;

    // Close while busy: the requests already sent finish, then the worker exits.
    {
      const c = await PrepWorkerController.start({
        mode: "development",
        chain: "random",
        chainLength: 16,
      });
      const a = settle(c.prepare("busy-1", SALT_C));
      const b = settle(c.prepare("busy-2", SALT_C));
      const closing = c.close();
      r.closeWhileBusyStateNow = c.state;
      r.refusedWhileClosing = await settle(c.prepare("busy-3", SALT_C));
      const [ra, rb] = await Promise.all([a, b]);
      r.closeWhileBusy = {
        results: [ra.ok && ra.value.chainIndex, rb.ok && rb.value.chainIndex],
        closed: await closing,
        state: c.state,
      };
    }

    // Terminate with requests in flight (sent, unanswered): INDETERMINATE, never completed.
    {
      const c = await PrepWorkerController.start({
        mode: "development",
        chain: "random",
        chainLength: 16,
      });
      const a = settle(c.prepare("term-1", SALT_C));
      const b = settle(c.prepare("term-2", SALT_C));
      await c.terminate();
      r.terminate = {
        results: await Promise.all([a, b]),
        state: c.state,
        after: await settle(c.prepare("term-3", SALT_C)),
        close: await settle(c.close()),
      };
    }
    report.lifecycle = r;
    return emit(report);
  }

  // ==== crash (run on a patched build) ==========================================================
  if (scenario === "crash") {
    const started = await settle(
      PrepWorkerController.start({ mode: "test", chain: "public-test-vectors" }),
    );
    report.started = started.ok;
    if (!started.ok) {
      report.startError = started.error;
      return emit(report);
    }
    const c = started.value;
    const results = await Promise.all([
      settle(c.prepare("x-1", V.saltAHex)),
      settle(c.prepare("x-2", V.saltAHex)),
    ]);
    report.results = results.map((x) => (x.ok ? { ok: true, chainIndex: x.value.chainIndex } : x));
    report.state = c.state;
    report.after = await settle(c.prepare("x-3", V.saltAHex));
    report.close = await settle(c.close());
    await new Promise((res) => setImmediate(res));
    report.workerHandles = process.getActiveResourcesInfo().filter((x) => /Worker/.test(x)).length;
    return emit(report);
  }

  // ==== integrity (run on a tampered build) =====================================================
  if (scenario === "integrity") {
    if (controllerLoadError !== null) {
      report.controller = { ok: false, loadError: controllerLoadError };
    } else {
      report.controller = await settle(
        PrepWorkerController.start({ mode: "test", chain: "public-test-vectors" }),
      );
      if (report.controller.ok) {
        report.controllerClosed = (await report.controller.value.close()).type;
        report.controller = { ok: true };
      }
    }
    // A raw worker on the fixed entry (no controller check in front of it): it must refuse the
    // build by itself. On an intact build it reports `ready` and is shut down.
    const w = rawWorker(CONFIG());
    let rawError = null;
    w.worker.on("error", (e) => {
      rawError = { code: (e && e.code) ?? null };
    });
    w.worker.on("message", (m) => {
      if (m && m.type === "ready") w.worker.postMessage({ type: "shutdown" });
    });
    report.rawExitCode = await w.exit;
    report.rawError = rawError;
    report.rawMessages = w.messages.map((m) =>
      m && (m.type === "ready" || m.type === "closed") ? { type: m.type } : m,
    );
    return emit(report);
  }

  // ==== respond / bench =========================================================================
  if (scenario === "respond" || scenario === "bench") {
    const reps = scenario === "bench" ? Number(process.env.PREP_BENCH_REPS ?? 3) : 1;
    report.node = process.version;
    report.platform = `${process.platform} ${process.arch}`;
    report.memory = { start: mem() };
    const t0 = performance.now();
    const c = await PrepWorkerController.start({
      mode: "development",
      chain: "random",
      chainLength: 4096,
    });
    report.workerStartMs = Math.round(performance.now() - t0);
    report.memory.afterStart = mem();
    report.worker = {};
    let total = 0;
    for (const n of [1, 10, 50]) {
      const runs = [];
      for (let k = 0; k < reps; k++) {
        const stop = gapTicker();
        const start = performance.now();
        const rounds = await drive(c, n, `w${n}-${k}`);
        const wall = performance.now() - start;
        const gaps = stop();
        total += n;
        runs.push({
          wallMs: Math.round(wall),
          latency: stats(rounds.map((r) => r.ms)),
          gaps: stats(gaps),
          gapCount: gaps.length,
          indices: [rounds[0].round.chainIndex, rounds[rounds.length - 1].round.chainIndex],
          consecutive: rounds.every(
            (r, j) => j === 0 || r.round.chainIndex === rounds[j - 1].round.chainIndex + 1,
          ),
        });
      }
      report.worker[n] = runs;
    }
    report.memory.afterWorker = mem();
    report.closed = await c.close();
    report.prepared = total;
    report.memory.afterClose = mem();

    if (scenario === "bench") {
      // In-process baseline: the same preparation on the main thread (P8-4a, synchronous runner).
      const { createOfflineRoundEnvironment } = load("server/src/round/prepare.js");
      const env = createOfflineRoundEnvironment({ mode: "development" });
      const chain = await env.createChain({ length: 4096 });
      report.inProcess = {};
      let id = 0;
      for (const n of [1, 10, 50]) {
        const runs = [];
        for (let k = 0; k < reps; k++) {
          // Sequential, then all n at once (like a naive look-ahead fill).
          for (const mode of ["sequential", "concurrent"]) {
            const stop = gapTicker();
            const start = performance.now();
            const lat = [];
            const one = async () => {
              const t = performance.now();
              await env.prepareScript(chain.chainId, `ip-${id++}`, bridge.hexToBytes(SALT_C));
              lat.push(performance.now() - t);
            };
            if (mode === "sequential") for (let i = 0; i < n; i++) await one();
            else await Promise.all(Array.from({ length: n }, one));
            const wall = performance.now() - start;
            const gaps = stop();
            runs.push({ mode, wallMs: Math.round(wall), latency: stats(lat), gaps: stats(gaps) });
          }
        }
        report.inProcess[n] = runs;
      }
      env.close();
      report.memory.afterInProcess = mem();
    }
    return emit(report);
  }

  throw new Error(`unknown scenario ${scenario}`);
})().catch((e) => {
  process.stderr.write(`probe failed: ${e && e.stack}\n`);
  process.exitCode = 1;
});
