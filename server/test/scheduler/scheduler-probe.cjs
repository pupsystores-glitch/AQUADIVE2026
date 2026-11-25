// Compiled-runtime probe of the offline Global Round Scheduler (P8-4b-2). TEST ONLY; run by
// scheduler-worker.test.ts in a fresh Node process (one scheduler per process, by design):
//
//   node scheduler-probe.cjs <server build dir> <scenario> [arg]
//
// The build dir holds the `npm run build` output next to ../integrity/engine-manifest.json.
// Math.random and the browser globals throw on use in this (main) thread and are counted; console
// output is counted. Prints one JSON report on stdout. Scenarios:
//
//   run <A|B> <every|jitter>   the public vector chain through the real worker, SimulatedClock,
//                              to the chain-exhaustion halt; events, digest, snapshots, redaction
//   facts <A|B>                per-round facts of the same chain from the in-process environment
//                              (reference-model input; this process loads the engine bundle)
//   deadline                   the clock passes round 1's admission tick before the worker answers
//   contract                   option / construction / duplicate-instance / source refusals
//   loss <pending|idle>        (patched builds) the worker exits on round 3's request / after
//                              posting round 2: SD-6
//   prepfail                   (patched build) round 1's preparation fails (worker-halted)
//   forge <variant>            H-1: hostile options (getter / Proxy / descriptor trap …) offering a
//                              forged source with chosen outcomes; then the legitimate path
//   clock <variant> <start|run>  L-1: backwards / negative / non-bigint / throwing / overflowing
//                              clock readings at start or with round 1 active and round 2 held
//   async <variant>            L-2: clock failure during an async delivery, stop / close /
//                              worker termination with a request pending, a throwing listener,
//                              (patched build) an internal error during delivery or a poll
//   sealed                     M-1: reflection over the compiled sealed module and its seals
//   r1 <vector>                R-1 / R-1b: same-process code (after the scheduler loaded)
//                              replaces a method, static, prototype or export on the path from
//                              the worker to the disclosure cursor (R-1b: the controller's
//                              verifier, the message parser, the worker entry, class and
//                              environment) to play a chosen outcome (77.77x)
//   r1-unfrozen <vector>       R-1b: the same with classes, prototypes and exports left unfrozen
//                              (Object.freeze skips them): the load-time bindings alone
//   r1-preload <what>          R-1: a one-time capability claimed BEFORE the scheduler loads
//   r1-cache <variant>         R-1 / A-2: module cache deletion, a pre-set process record
//   foreign                    (patched source.js) a seal not made for this source is delivered
//   integrity                  (tampered builds) source start refused
//   closure                    the scheduler's loaded module closure (all protected files)
//   startup                    the compiled application loads no scheduler module
//   bench <rounds>             random chain: processing time per poll, delivery latency, memory
"use strict";
const path = require("node:path");
const { inspect } = require("node:util");

const out = path.resolve(process.argv[2]);
const scenario = process.argv[3];
const arg = process.argv[4];
const arg2 = process.argv[5];

const counters = { mathRandom: 0, browser: {}, console: 0, unhandled: 0 };
// L-2: an asynchronous failure must never become an unhandled rejection (counted, not hidden:
// every report asserts 0).
process.on("unhandledRejection", () => {
  counters.unhandled += 1;
});
Math.random = function poisonedRandom() {
  counters.mathRandom += 1;
  throw new Error("Math.random called");
};
for (const name of ["window", "document", "self", "navigator", "localStorage", "fetch"]) {
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
const relOf = (f) => path.relative(out, f).split(path.sep).join("/");
const emit = (report) => {
  report.counters = counters;
  process.stdout.write(JSON.stringify(report));
};
const errorOf = (e) => ({
  name: e && e.name,
  code: e && e.code,
  reason: e && Object.hasOwn(e, "reason") ? e.reason : undefined,
  message: e && e.message,
});
const attempt = (fn) => {
  try {
    const value = fn();
    return { ok: true, value: value === undefined ? null : String(value) };
  } catch (e) {
    return { ok: false, error: errorOf(e) };
  }
};
const settle = (p) =>
  p.then(
    () => ({ ok: true }),
    (e) => ({ ok: false, error: errorOf(e) }),
  );
const turn = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NS_PER_TICK = 1_000_000_000n / 60n;
/** Exact instant of global tick k from `epoch` (the scheduler's own formula, recomputed). */
const tickNs = (epoch, k) => epoch + (BigInt(k) * 1_000_000_000n) / 60n;

/** A runner output the P8-4a validators accept: a crash round with a chosen crash point. */
const crashOutput = (chainIndex, { crashAt, diveTicks: n }) => {
  const step = n > 1 ? ((crashAt - 1) * 0.999) / n : 0;
  return {
    profile: "aquadive-offline-round-runner",
    profileVersion: 1,
    fv: 1,
    chainIndex,
    outcome: "crash",
    crashAt,
    diveStartTick: 300,
    exitDiveTick: 300 + n,
    impactTick: null,
    terminalTick: 300 + n,
    jackpot: null,
    chests: null,
    samples: {
      multiplier: Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 1 + i * step)),
      boost: new Array(n).fill(0),
      worldY: Array.from({ length: n }, (_, i) => i * (4199 / n)),
    },
    creatures: [],
    final: {
      worldY: (n - 1) * (4199 / n),
      boost: 0,
      multiplier: crashAt,
      nextSpawnAt: 100,
      nextCreatureId: 1,
    },
    drawCounts: { crash: crashAt === 1 ? 1 : 2, jackpot: 0, chests: 0, world: 0 },
  };
};
/** A caller-built sealed script of the build (chosen outcome, chosen chain). */
const forgeSeal = (chainId, n, spec) => {
  const { buildRoundScript } = load("server/src/round/round-script.js");
  const { sealRoundScript } = load("server/src/scheduler/sealed.js");
  const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
  const script = buildRoundScript(
    createNodeFairnessCrypto().hash,
    { chainId, chainIndex: n, salt: "a1".repeat(32) },
    crashOutput(n, spec),
  );
  return { script, sealed: sealRoundScript(script) };
};
/** A forged script of the build with a chosen crash point (R-1 probes). */
const forgeScript = (chainId, n, spec) => {
  const { buildRoundScript } = load("server/src/round/round-script.js");
  const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
  return buildRoundScript(
    createNodeFairnessCrypto().hash,
    { chainId, chainIndex: n, salt: "a1".repeat(32) },
    crashOutput(n, spec),
  );
};
/** Waits (real time) until `cond()` holds or `ms` pass; returns whether it held. */
const until = async (cond, ms = 30_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) return false;
    await sleep(2);
  }
  return true;
};

const main = async () => {
  if (scenario === "r1-unfrozen") {
    // TEST ONLY (R-1b): the load-time BINDING layer on its own. Before any module of the build
    // loads, Object.freeze skips classes, prototypes and CommonJS exports objects (every other
    // object is still frozen), so each replacement of the `r1` vectors takes effect and only the
    // bindings can keep it from being reached.
    const freeze = Object.freeze;
    const isExports = (o) => Object.values(require.cache).some((m) => m && m.exports === o);
    const isPrototype = (o) =>
      Object.hasOwn(o, "constructor") &&
      typeof o.constructor === "function" &&
      o.constructor.prototype === o;
    Object.freeze = (o) =>
      typeof o === "function" ||
      (o !== null && typeof o === "object" && (isExports(o) || isPrototype(o)))
        ? o
        : freeze(o);
  }

  if (scenario === "startup") {
    load("server/src/app.js");
    const loaded = Object.keys(require.cache)
      .filter((f) => f.startsWith(out + path.sep))
      .map(relOf);
    return emit({
      loaded: loaded.length,
      scheduler: loaded.filter((f) => f.includes("scheduler")),
    });
  }

  if (scenario === "closure") {
    load("server/src/scheduler/scheduler.js");
    const manifest = JSON.parse(
      require("node:fs").readFileSync(
        path.join(out, "..", "integrity", "engine-manifest.json"),
        "utf8",
      ),
    );
    const protectedPaths = new Set(manifest.files.map((f) => f.path));
    const loaded = Object.keys(require.cache)
      .filter((f) => f.startsWith(out + path.sep))
      .map(relOf)
      .sort();
    return emit({ loaded, unprotected: loaded.filter((p) => !protectedPaths.has(p)) });
  }

  if (scenario === "facts") {
    // Reference-model input: the same public chain and salt, prepared in process.
    const bridge = load("server/src/fairness.js");
    const { createOfflineRoundEnvironment } = load("server/src/round/prepare.js");
    const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
    const V = bridge.FAIRNESS_DEV_VECTORS_V1;
    const env = createOfflineRoundEnvironment({ mode: "test", crypto: createNodeFairnessCrypto() });
    const chain = await env.importPublicTestVectorChain();
    const salt = bridge.hexToBytes(arg === "B" ? V.saltBHex : V.saltAHex);
    const facts = [];
    for (let i = 1; i <= 8; i++) {
      const s = (await env.prepareScript(chain.chainId, `facts-${i}`, salt)).secretContent();
      facts.push({
        outcome: s.outcome,
        exitDiveTick: s.exitDiveTick,
        crashAt: s.crashAt,
        jackpot: s.jackpot,
        chests: s.chests,
        boostTicks: s.creatures
          .filter((c) => c.kind === "goldfish" && c.consumedTick !== null)
          .map((c) => c.consumedTick),
        terminalTick: s.terminalTick,
      });
    }
    env.close();
    return emit({ chainId: chain.chainId, facts });
  }

  if (scenario === "async" && arg === "listener-throws") {
    // The source's own backstop: a listener that throws (no scheduler involved). R-1: only a
    // process that has NOT loaded scheduler.js can claim the binder, and then scheduler.js can
    // no longer load (fail closed).
    const { PrepWorkerRoundSource, claimSourceBinder } = load("server/src/scheduler/source.js");
    const bind = claimSourceBinder();
    const r = { variant: arg };
    r.schedulerLoad = attempt(() => load("server/src/scheduler/scheduler.js"));
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    let seen = null;
    const access = bind(source, (event) => {
      seen = event;
      throw new Error("listener exploded");
    });
    r.bindAgain = attempt(() => bind(source, () => {}));
    access.request(1);
    r.settled = await until(() => seen !== null && source.state === "closed");
    r.kind = seen && seen.kind;
    r.sealState = seen && seen.kind === "prepared" ? seen.sealed.state : null;
    r.sourceState = source.state;
    await sleep(300);
    await source.close();
    return emit(r);
  }

  if (scenario === "r1-preload") {
    // R-1: code that runs BEFORE the scheduler loads and claims a one-time capability can only
    // prevent the scheduler (each later module fails to load): it never obtains a scheduler.
    const r = { variant: arg };
    if (arg === "sealing") {
      const sealed = load("server/src/scheduler/sealed.js");
      r.claim = attempt(() => typeof sealed.claimSourceSealing());
      r.sourceLoad = attempt(() => load("server/src/scheduler/source.js"));
    } else if (arg === "opener") {
      const sealed = load("server/src/scheduler/sealed.js");
      r.claim = attempt(() => typeof sealed.claimSealedRoundOpener());
      r.sourceLoad = attempt(() => load("server/src/scheduler/source.js"));
    } else {
      const src = load("server/src/scheduler/source.js");
      r.claim = attempt(() => typeof src.claimSourceBinder());
    }
    r.schedulerLoad = attempt(() => load("server/src/scheduler/scheduler.js"));
    return emit(r);
  }

  // A build whose scheduler modules cannot even be loaded (e.g. a missing file) fails closed
  // here: nothing can start. Reported, never worked around.
  let modules;
  try {
    modules = {
      ...load("server/src/scheduler/clock.js"),
      ...load("server/src/scheduler/source.js"),
      ...load("server/src/scheduler/scheduler.js"),
    };
  } catch (e) {
    if (scenario !== "integrity") throw e;
    return emit({ loadError: { code: e && e.code } });
  }
  const { SimulatedClock, PrepWorkerRoundSource, GlobalRoundScheduler } = modules;

  /** Polls until the requested script is no longer pending (real time; the clock stays put). */
  const awaitDelivery = async (s, limitMs = 30_000) => {
    const t0 = Date.now();
    while (s.residency().next === "requested" && s.state !== "halted") {
      if (Date.now() - t0 > limitMs) throw new Error("delivery timeout");
      await turn();
    }
  };

  /** Drives a scheduler on `clock` to its halt; returns the poll count. */
  const drive = async (s, clock, mode, limitTicks = 200_000) => {
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    let polls = 0;
    const snapshots = [];
    while (s.state !== "halted") {
      if (mode === "every") clock.advanceNs(NS_PER_TICK + 1n);
      else clock.advanceNs(1n + BigInt(Math.floor(rnd() * 200 * 16_666_667)));
      s.poll();
      polls += 1;
      if (polls % 97 === 0) snapshots.push(s.snapshot());
      await awaitDelivery(s);
      if (s.snapshot().tick > limitTicks) throw new Error("no halt");
    }
    return { polls, snapshots };
  };

  if (scenario === "run") {
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
      vectorSalt: arg,
    });
    const clock = new SimulatedClock(5_000_000_000n);
    const s = GlobalRoundScheduler.create({ clock, source, eventCapacity: 4096 });
    const texts = [
      JSON.stringify(s),
      String(s),
      inspect(s, { depth: 9 }),
      JSON.stringify(source),
      inspect(source),
    ];
    s.start();
    await awaitDelivery(s);
    const { polls, snapshots } = await drive(s, clock, arg2);
    texts.push(JSON.stringify(s), inspect(s, { depth: 9 }));
    const report = {
      chain: source.chain,
      events: s.events(),
      digest: s.digest,
      snapshot: s.snapshot(),
      snapshots,
      polls,
      texts,
      afterHalt: {
        poll: attempt(() => s.poll()),
        start: attempt(() => s.start()),
        second: attempt(() => GlobalRoundScheduler.create({ clock, source })),
      },
    };
    await s.close();
    report.sourceState = source.state;
    return emit(report);
  }

  if (scenario === "deadline") {
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const clock = new SimulatedClock(1n);
    const s = GlobalRoundScheduler.create({ clock, source });
    s.start();
    // Round 1's script is requested at tick 0; the clock reaches tick 240 before it can arrive.
    clock.advanceNs(240n * NS_PER_TICK + 1_000n);
    s.poll();
    const halted = s.snapshot();
    await new Promise((r) => setTimeout(r, 1500)); // the late script arrives meanwhile
    s.poll();
    const report = { halted, after: s.snapshot(), events: s.events(), residency: s.residency() };
    await s.close();
    return emit(report);
  }

  if (scenario === "contract") {
    const r = {};
    const refuse = async (options) => {
      const x = await settle(PrepWorkerRoundSource.start(options));
      return x.ok ? "STARTED" : `${x.error.code}:${x.error.reason}`;
    };
    r.sourceOptions = [];
    for (const options of [
      null,
      [],
      { mode: "test", chain: "public-test-vectors", path: "x.js" },
      { mode: "test", chain: "public-test-vectors", chainIndex: 3 },
      { mode: "test", chain: "public-test-vectors", salt: "ab".repeat(32) },
      { mode: "test", chain: "public-test-vectors", vectorSalt: "C" },
      { mode: "test", chain: "public-test-vectors", chainLength: 8 },
      { mode: "test", chain: "random", vectorSalt: "A" },
      { mode: "test", chain: "other" },
      { mode: "production", chain: "random" },
      { mode: "development", chain: "public-test-vectors" },
      { mode: "test", chain: "random", maxInFlight: 2 },
    ]) {
      r.sourceOptions.push(await refuse(options));
    }
    process.env.NODE_ENV = "production";
    r.productionSource = await refuse({ mode: "test", chain: "public-test-vectors" });
    process.env.NODE_ENV = "test";
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const clock = new SimulatedClock(0n);
    process.env.NODE_ENV = "production";
    r.productionScheduler = attempt(() => GlobalRoundScheduler.create({ clock, source }));
    process.env.NODE_ENV = "test";
    const fake = Object.create(PrepWorkerRoundSource.prototype);
    r.fakeSource = attempt(() => GlobalRoundScheduler.create({ clock, source: fake }));
    r.newSource = attempt(() => new PrepWorkerRoundSource({}, {}, null));
    r.newScheduler = attempt(() => new GlobalRoundScheduler({}, { clock, source }));
    r.badClock = attempt(() => GlobalRoundScheduler.create({ clock: { nowNs: 1 }, source }));
    r.publicRequest = typeof source.request;
    const s = GlobalRoundScheduler.create({ clock, source });
    r.pollBeforeStart = attempt(() => s.poll());
    r.duplicate = attempt(() => GlobalRoundScheduler.create({ clock, source }));
    const other = await PrepWorkerRoundSource.start({ mode: "test", chain: "public-test-vectors" });
    r.duplicateOtherSource = attempt(() => GlobalRoundScheduler.create({ clock, source: other }));
    // R-1: a source has no public claim; the binder was claimed by scheduler.js as it loaded.
    r.publicClaim = typeof source.claim;
    r.claimAgain = attempt(() => modules.claimSourceBinder());
    await other.close();
    s.start();
    r.startTwice = attempt(() => s.start());
    r.texts = [JSON.stringify(s), String(s), inspect(s), JSON.stringify(source), inspect(source)];
    r.keys = Object.keys(s);
    await s.close();
    r.closedState = s.state;
    return emit(r);
  }

  if (scenario === "forge") {
    // H-1 regression (P8-4b-2 corrections): a caller-controlled options object that shows the
    // approved source to the first reads and a FORGED source (caller-built seals with chosen
    // outcomes on a fake chain) to every later one. Before the correction `create` re-read
    // `options.source` after the check and played the forged rounds (99.99x, then 1.00x).
    const FORGED_CHAIN = "66".repeat(32);
    const CHOSEN = [null, { crashAt: 99.99, diveTicks: 60 }, { crashAt: 1, diveTicks: 1 }];
    let forgedRequests = 0;
    const forged = {
      chain: Object.freeze({ chainId: FORGED_CHAIN, chainLength: 2, fv: 1 }),
      state: "ready",
      claim: (listener) => (n) => {
        forgedRequests += 1;
        const { sealed } = forgeSeal(FORGED_CHAIN, n, CHOSEN[n]);
        setImmediate(() => listener({ kind: "prepared", roundNumber: n, sealed }));
      },
      checkHealth: () => false,
      close: async () => undefined,
      terminate: async () => undefined,
    };
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const clock = new SimulatedClock(0n);
    let sourceReads = 0;
    const swap = () => (++sourceReads <= 2 ? source : forged);
    const hostile = {
      getter: () => ({
        clock,
        get source() {
          return swap();
        },
      }),
      proxy: () =>
        new Proxy(
          { clock, source },
          { get: (t, k) => (k === "source" ? swap() : Reflect.get(t, k)) },
        ),
      descriptor: () =>
        new Proxy(
          { clock, source },
          {
            getOwnPropertyDescriptor: (t, k) =>
              k === "source"
                ? { value: swap(), writable: true, enumerable: true, configurable: true }
                : Reflect.getOwnPropertyDescriptor(t, k),
            get: (t, k) => (k === "source" ? swap() : Reflect.get(t, k)),
          },
        ),
      "clock-getter": () => ({
        get clock() {
          return clock;
        },
        source,
      }),
      "clock-proxy": () => ({ clock: new Proxy(clock, {}), source }),
      "source-proxy": () => ({ clock, source: new Proxy(source, {}) }),
      "capacity-getter": () => ({
        clock,
        source,
        get eventCapacity() {
          return 4096;
        },
      }),
      "throwing-keys": () =>
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error("hostile ownKeys");
            },
          },
        ),
    };
    const r = { variant: arg };
    const created = attempt(() => (r.instance = GlobalRoundScheduler.create(hostile[arg]())));
    r.hostile = created.ok ? { ok: true } : created;
    r.sourceReads = sourceReads;
    const s = created.ok ? r.instance : GlobalRoundScheduler.create({ clock, source });
    delete r.instance;
    r.legitimate = !created.ok;
    r.chain = s.chain;
    s.start();
    for (let k = 0; k < 6000 && s.state !== "halted"; k++) {
      clock.advanceNs(NS_PER_TICK + 1n);
      s.poll();
      await awaitDelivery(s);
      if (!created.ok && s.events().some((e) => e.type === "round.ended")) break;
    }
    r.forgedRequests = forgedRequests;
    r.crashed = s.events().filter((e) => e.type === "round.crashed" || e.type === "round.impact");
    r.admitted = s
      .events()
      .filter((e) => e.type === "round.admitted")
      .map((e) => ({ round: e.round, roundId: e.roundId }));
    r.claimAgain = attempt(() => modules.claimSourceBinder());
    await s.close();
    await source.close();
    return emit(r);
  }

  if (scenario === "clock") {
    // L-1: an invalid reading at start, or with round 1 active and round 2's script held.
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const EPOCH = 1_000_000_000n;
    let now = EPOCH;
    let bad = null;
    const BAD = {
      backwards: () => now - 1n,
      negative: () => -5n,
      number: () => 123,
      undefined: () => undefined,
      throw: () => {
        throw new Error("clock exploded");
      },
      overflow: () => now + 10n ** 30n,
    };
    const clock = { nowNs: () => (bad === null ? now : BAD[bad]()) };
    const s = GlobalRoundScheduler.create({ clock, source });
    const r = { variant: arg, at: arg2 };
    if (arg2 === "start") {
      bad = arg;
      r.call = attempt(() => s.start());
    } else {
      s.start();
      await awaitDelivery(s);
      now = tickNs(EPOCH, 300); // round 1 opened at 240; round 2 was requested then
      s.poll();
      await awaitDelivery(s);
      r.before = { snapshot: s.snapshot(), residency: s.residency() };
      bad = arg;
      r.call = attempt(() => s.poll());
    }
    r.halted = s.snapshot();
    r.events = s.events();
    r.residency = s.residency();
    r.state = s.state;
    // A restored clock, later polls, a second start, late results: nothing revives.
    bad = null;
    now = tickNs(EPOCH, 5000);
    r.pollAfter = attempt(() => s.poll());
    r.startAfter = attempt(() => s.start());
    await sleep(300);
    r.pollAfterWait = attempt(() => s.poll());
    r.after = s.snapshot();
    r.eventsAfter = s.events().length;
    r.residencyAfter = s.residency();
    await s.close();
    r.sourceState = source.state;
    return emit(r);
  }

  if (scenario === "async") {
    const r = { variant: arg };
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const EPOCH = 1_000_000_000n;
    let now = EPOCH;
    let throwing = false;
    const clock = {
      nowNs: () => {
        if (throwing) throw new Error("clock exploded");
        return now;
      },
    };
    const s = GlobalRoundScheduler.create({ clock, source });
    s.start();
    if (arg === "delivery-clock-throws") {
      // Round 1's result settles while the clock is broken: the failure happens inside the
      // asynchronous delivery (no caller).
      throwing = true;
      r.settled = await until(() => s.state === "halted");
    } else if (arg === "stop-pending") {
      s.stop();
      r.settled = true;
    } else if (arg === "close-pending") {
      await s.close(); // the worker drains: round 1's result settles during the close
      r.settled = true;
    } else if (arg === "terminate-pending") {
      await source.terminate(); // the worker is gone with round 1's request pending
      r.settled = await until(() => s.state === "halted");
    } else if (arg === "internal-delivery" || arg === "internal-poll") {
      // (patched core.js) an unexpected TypeError inside the core.
      await awaitDelivery(s);
      now = tickNs(EPOCH, 300);
      s.poll(); // round 1 opens; round 2 is requested
      globalThis.__p84b2Throw = arg === "internal-delivery" ? "deliver" : "advanceTo";
      if (arg === "internal-poll") {
        now = tickNs(EPOCH, 301);
        r.call = attempt(() => s.poll());
      }
      r.settled = await until(() => s.state === "halted");
      globalThis.__p84b2Throw = undefined;
    }
    const halted = s.snapshot();
    const count = s.events().length;
    await sleep(1500); // any late result arrives meanwhile
    throwing = false;
    now = tickNs(EPOCH, 6000);
    r.pollAfter = attempt(() => s.poll());
    r.halted = halted;
    r.unchanged = JSON.stringify(s.snapshot()) === JSON.stringify(halted);
    r.eventsAdded = s.events().length - count;
    r.events = s.events().map((e) => `${e.tick}:${e.type}`);
    r.residency = s.residency();
    r.state = s.state;
    await s.close();
    r.sourceState = source.state;
    return emit(r);
  }

  /** Plays rounds 1 and 2 of the public vector chain (or halts); the outcomes and halts. */
  const playTwo = async (s, clock) => {
    s.start();
    for (let k = 0; k < 4000 && s.state !== "halted"; k++) {
      clock.advanceNs(NS_PER_TICK + 1n);
      s.poll();
      await awaitDelivery(s);
      if (s.events().some((e) => e.type === "round.ended" && e.round === 2)) break;
    }
    const events = s.events();
    return {
      outcomes: events
        .filter((e) => e.type === "round.crashed" || e.type === "round.impact")
        .map((e) => ({ round: e.round, crashAt: e.crashAt ?? null, jackpot: e.jackpot ?? null })),
      admitted: events.filter((e) => e.type === "round.admitted").map((e) => e.round),
      failures: events.filter((e) => e.type === "source.failed").map((e) => e.failure),
      halts: events.filter((e) => e.type === "scheduler.halted").map((e) => e.reason),
    };
  };

  if (scenario === "r1" || scenario === "r1-unfrozen") {
    // R-1 regression: the attacker runs AFTER the scheduler modules loaded and replaces an
    // ordinary object reachable from the modules' exports (no built-in, except "weakset").
    // Before the correction every vector below played the chosen 77.77x. "r1-unfrozen": the same
    // vectors with classes, prototypes and exports left unfrozen (see the top of main).
    const CHOSEN = { crashAt: 77.77, diveTicks: 60 };
    const sealedModule = load("server/src/scheduler/sealed.js");
    const coreModule = load("server/src/scheduler/core.js");
    const disclosureModule = load("server/src/scheduler/disclosure.js");
    const sourceModule = load("server/src/scheduler/source.js");
    const eventsModule = load("server/src/scheduler/events.js");
    const controllerModule = load("server/src/prep/controller.js");
    const rs = load("server/src/round/round-script.js");
    const testSeal = sealedModule.sealRoundScript;
    const forged = (chainId, n) => forgeScript(chainId, n, CHOSEN);
    const r = { vector: arg, armed: false, armError: null, forgedUsed: 0 };
    const arm = (fn) => {
      try {
        fn();
        r.armed = true;
      } catch (e) {
        r.armError = e instanceof TypeError ? "TypeError" : errorOf(e);
      }
    };
    const set = (obj, key, value) => {
      obj[key] = value;
      if (obj[key] !== value) throw new TypeError("not replaced");
    };
    const substitute = (sealed) => {
      r.forgedUsed += 1;
      const a = sealed.admission;
      sealed.discard();
      return testSeal(forged(a.chainId, a.chainIndex));
    };
    const capture = function (listener) {
      r.forgedUsed += 1;
      const chainId = this.chain.chainId;
      return (n) =>
        setImmediate(() =>
          listener({ kind: "prepared", roundNumber: n, sealed: testSeal(forged(chainId, n)) }),
        );
    };
    const fakeController = (c) => ({
      chain: c.chain,
      get state() {
        return c.state;
      },
      prepare: (id) => {
        r.forgedUsed += 1;
        const n = Number(id.slice("sched-round-".length));
        return Promise.resolve({
          requestId: id,
          chainIndex: n,
          script: forged(c.chain.chainId, n),
        });
      },
      close: () => c.close(),
      terminate: () => c.terminate(),
    });
    const PWC = controllerModule.PrepWorkerController;
    const origStart = PWC.start;
    let forgedSource = null;
    const FORGED_CHAIN = "66".repeat(32);
    const makeForgedSource = () => ({
      chain: Object.freeze({ chainId: FORGED_CHAIN, chainLength: 2, fv: 1 }),
      state: "ready",
      claim: capture,
      checkHealth: () => false,
      close: async () => undefined,
      terminate: async () => undefined,
    });
    const P = PrepWorkerRoundSource.prototype;
    // R-1b helpers. A forged script for the real document's round (its chain id and index), as
    // canonical text, bytes and digest; nothing here patches a shared built-in.
    const canonicalModule = load("server/src/round/canonical.js");
    const protocolModule = load("server/src/prep/protocol.js");
    const integrityModule = load("server/src/round/integrity.js");
    const threads = require("node:worker_threads");
    const RSV = rs.RoundScriptVerification;
    const textOf = (bytes) => Buffer.from(bytes).toString("latin1");
    const isDocument = (text) => text.startsWith('{"public":');
    const forgedLike = (script) => {
      r.forgedUsed += 1;
      return forged(script.public.chainId, script.public.chainIndex);
    };
    const forgedFor = (text) => {
      const doc = JSON.parse(text);
      const script = forgedLike({ public: doc.public });
      const bytes = script.secretCanonicalBytes();
      return { text: textOf(bytes), bytes, digest: script.secretDigest() };
    };
    // Worker-side substitution (R-1b "worker-entry", "worker-class", "node-options"): code that
    // runs inside the preparation worker before its entry and replaces every `prepared` result
    // with a forged one. Uses counted on a marker file (the worker cannot reach this report).
    let evilFiles = null;
    const evil = () => {
      if (evilFiles !== null) return evilFiles;
      const fs = require("node:fs");
      const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "aquadive-r1b-"));
      const marker = path.join(dir, "used");
      fs.writeFileSync(marker, "");
      const code = (realEntry) =>
        [
          '"use strict";',
          'const { isMainThread, parentPort } = require("node:worker_threads");',
          'const path = require("node:path");',
          `const OUT = ${JSON.stringify(out)};`,
          `const crashOutput = ${crashOutput.toString()};`,
          "if (!isMainThread) {",
          "  const post = parentPort.postMessage;",
          "  parentPort.postMessage = function (message, transfer) {",
          '    if (message === null || typeof message !== "object" || message.type !== "prepared") {',
          "      return post.call(this, message, transfer);",
          "    }",
          '    const rs = require(path.join(OUT, "server/src/round/round-script.js"));',
          '    const crypto = require(path.join(OUT, "server/src/fairness/crypto-node.js"));',
          '    const doc = JSON.parse(Buffer.from(message.bytes).toString("latin1"));',
          "    const script = rs.buildRoundScript(",
          "      crypto.createNodeFairnessCrypto().hash,",
          "      doc.public,",
          `      crashOutput(doc.public.chainIndex, ${JSON.stringify(CHOSEN)}),`,
          "    );",
          "    const bytes = script.secretCanonicalBytes();",
          `    require("node:fs").appendFileSync(${JSON.stringify(marker)}, "x");`,
          "    return post.call(this, { ...message, bytes, digest: script.secretDigest() }, [",
          "      bytes.buffer,",
          "    ]);",
          "  };",
          "}",
          realEntry === null ? "" : `require(${JSON.stringify(realEntry)});`,
          "",
        ].join("\n");
      const preload = path.join(dir, "preload.cjs");
      const entry = path.join(dir, "entry.cjs");
      fs.writeFileSync(preload, code(null));
      fs.writeFileSync(entry, code(path.join(out, "server", "src", "prep", "prep-worker.js")));
      evilFiles = { dir, marker, preload, entry };
      return evilFiles;
    };
    const vectors = {
      // The original R-1 exploit and two ways to install it.
      "claim-proto": () => set(P, "claim", capture),
      "claim-define": () => Object.defineProperty(P, "claim", { value: capture }),
      "claim-setproto": () => {
        const evil = Object.create(Object.getPrototypeOf(P), { claim: { value: capture } });
        if (!Reflect.setPrototypeOf(P, evil)) throw new TypeError("setPrototypeOf refused");
      },
      // Seal creation, delivery and opening.
      "seal-export": () => set(sealedModule, "sealRoundScript", (s) => substitute(testSeal(s))),
      "seal-static": () => set(sealedModule.SealedRound, "seal", (s) => substitute(testSeal(s))),
      "seal-hasinstance": () =>
        Object.defineProperty(sealedModule.SealedRound, Symbol.hasInstance, { value: () => true }),
      "core-deliver": () => {
        const orig = coreModule.SchedulerCore.prototype.deliver;
        set(coreModule.SchedulerCore.prototype, "deliver", function (sealed) {
          return orig.call(this, substitute(sealed));
        });
      },
      "core-export": () => {
        const C = coreModule.SchedulerCore;
        set(
          coreModule,
          "SchedulerCore",
          class extends C {
            deliver(sealed) {
              return super.deliver(substitute(sealed));
            }
          },
        );
      },
      "disclosure-open": () => {
        const RD = disclosureModule.RoundDisclosure;
        const orig = RD.open;
        set(RD, "open", (sealed, id, idx) => orig.call(RD, substitute(sealed), id, idx));
      },
      "disclosure-export": () => {
        const RD = disclosureModule.RoundDisclosure;
        set(disclosureModule, "RoundDisclosure", {
          open: (sealed, id, idx) => RD.open(substitute(sealed), id, idx),
        });
      },
      "event-log": () => {
        const orig = eventsModule.EventLog.prototype.append;
        set(eventsModule.EventLog.prototype, "append", function (t, type, round, fields) {
          if (type === "round.crashed") fields = { ...fields, crashAt: CHOSEN.crashAt };
          return orig.call(this, t, type, round, fields);
        });
      },
      // Consumption points of the preparation and RoundScript modules (bound at load).
      "secret-content": () => {
        const orig = rs.RoundScript.prototype.secretContent;
        let inside = false;
        set(rs.RoundScript.prototype, "secretContent", function () {
          if (inside) return orig.call(this);
          inside = true;
          try {
            r.forgedUsed += 1;
            return orig.call(forged(this.public.chainId, this.public.chainIndex));
          } finally {
            inside = false;
          }
        });
      },
      "controller-prepare": () =>
        set(PWC.prototype, "prepare", function (id) {
          return fakeController(this).prepare(id);
        }),
      "controller-start": () =>
        set(PWC, "start", async (o) => fakeController(await origStart.call(PWC, o))),
      "controller-export": () =>
        set(controllerModule, "PrepWorkerController", {
          start: async (o) => fakeController(await origStart.call(PWC, o)),
        }),
      // Source substitution (H-1 style forged source) through the approval check.
      "approved-export": () => {
        forgedSource = makeForgedSource();
        set(sourceModule, "isApprovedSource", () => true);
      },
      weakset: () => {
        // A shared built-in (out of the in-process boundary): the brand check consults none.
        forgedSource = makeForgedSource();
        const orig = WeakSet.prototype.has;
        set(WeakSet.prototype, "has", function (v) {
          return v === forgedSource ? true : orig.call(this, v);
        });
      },
      "verify-export": () => set(sourceModule, "verifySchedulerBuild", () => undefined),
      // ---- R-1b: the controller's verifier path (prep/controller.js → round-script.js →
      // canonical.js, the worker message parser, the worker thread itself). Before the R-1b
      // correction every vector below played the chosen 77.77x (except "integrity-export",
      // which only shows whether a replaced export is reached).
      "verification-step": () => {
        const orig = RSV.prototype.step;
        set(RSV.prototype, "step", function (budget) {
          const script = orig.call(this, budget);
          return script === null ? null : forgedLike(script);
        });
      },
      "verification-export": () =>
        set(rs, "RoundScriptVerification", {
          begin: (hash, bytes, digest) => {
            const v = RSV.begin(hash, bytes, digest);
            return {
              step: (budget) => {
                const script = v.step(budget);
                return script === null ? null : forgedLike(script);
              },
              cancel: () => v.cancel(),
            };
          },
        }),
      "verification-begin": () => {
        const orig = RSV.begin;
        set(RSV, "begin", (hash, bytes, _digest) => {
          const f = forgedFor(textOf(bytes));
          return orig.call(RSV, hash, f.bytes, f.digest);
        });
      },
      "canonical-check": () => {
        const CC = canonicalModule.CanonicalCheck;
        set(canonicalModule, "CanonicalCheck", {
          parse: (text) => CC.parse(isDocument(text) ? forgedFor(text).text : text),
        });
      },
      "canonical-value": () => {
        const getter = Object.getOwnPropertyDescriptor(
          canonicalModule.CanonicalCheck.prototype,
          "value",
        ).get;
        Object.defineProperty(canonicalModule.CanonicalCheck.prototype, "value", {
          configurable: true,
          get() {
            const value = getter.call(this);
            return value !== null && typeof value === "object" && "public" in value
              ? JSON.parse(forgedFor(JSON.stringify(value)).text)
              : value;
          },
        });
      },
      "decode-utf8": () => {
        const orig = canonicalModule.decodeUtf8;
        set(canonicalModule, "decodeUtf8", (bytes) => {
          const text = orig(bytes);
          return isDocument(text) ? forgedFor(text).text : text;
        });
      },
      "parse-message": () => {
        const orig = protocolModule.parseWorkerMessage;
        set(protocolModule, "parseWorkerMessage", (raw) => {
          const message = orig(raw);
          if (message.type !== "prepared") return message;
          const f = forgedFor(textOf(message.bytes));
          return Object.freeze({ ...message, bytes: f.bytes, digest: f.digest });
        });
      },
      "worker-entry": () =>
        set(
          controllerModule,
          "PREP_WORKER_ENTRY",
          path.relative(path.join(out, "server", "src", "prep"), evil().entry),
        ),
      "worker-class": () => {
        const W = threads.Worker;
        const entry = evil().entry;
        set(
          threads,
          "Worker",
          class extends W {
            constructor(_file, options) {
              super(entry, options);
            }
          },
        );
      },
      "node-options": () => {
        process.env.NODE_OPTIONS = `--require "${evil().preload.split(path.sep).join("/")}"`;
        if (!process.env.NODE_OPTIONS.includes("preload")) throw new TypeError("not set");
      },
      "integrity-export": () => {
        const orig = integrityModule.verifyBuildIntegrity;
        set(integrityModule, "verifyBuildIntegrity", (...args) => {
          r.forgedUsed += 1; // reached: counted (the check itself still runs)
          return orig(...args);
        });
      },
    };
    if (!Object.hasOwn(vectors, arg)) throw new Error(`unknown vector ${arg}`);
    arm(vectors[arg]);
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const clock = new SimulatedClock(1_000_000_000n);
    try {
      const s = GlobalRoundScheduler.create({ clock, source: forgedSource ?? source });
      Object.assign(r, await playTwo(s, clock));
      await s.close();
    } catch (e) {
      r.createError = errorOf(e);
    }
    await source.close();
    if (evilFiles !== null) {
      const fs = require("node:fs");
      r.forgedUsed += fs.readFileSync(evilFiles.marker, "utf8").length; // worker-side uses
      fs.rmSync(evilFiles.dir, { recursive: true, force: true });
    }
    return emit(r);
  }

  if (scenario === "r1-cache") {
    // R-1 / A-2: a fresh copy of the scheduler modules (module cache entries deleted) is still
    // the same process: the process-wide record refuses a second scheduler.
    const r = { variant: arg };
    const clock = new SimulatedClock(1_000_000_000n);
    const schedulerFiles = Object.keys(require.cache).filter((f) =>
      f.startsWith(path.join(out, "server", "src", "scheduler") + path.sep),
    );
    const reload = () => {
      for (const f of schedulerFiles) delete require.cache[f];
      return {
        ...load("server/src/scheduler/source.js"),
        ...load("server/src/scheduler/scheduler.js"),
      };
    };
    const MARK = Symbol.for("aquadive.offline-global-round-scheduler.v1");
    if (arg === "after-create") {
      const source = await PrepWorkerRoundSource.start({
        mode: "test",
        chain: "public-test-vectors",
      });
      const first = GlobalRoundScheduler.create({ clock, source });
      const fresh = reload();
      r.freshClass = fresh.GlobalRoundScheduler !== GlobalRoundScheduler;
      const other = await fresh.PrepWorkerRoundSource.start({
        mode: "test",
        chain: "public-test-vectors",
      });
      r.second = attempt(() => fresh.GlobalRoundScheduler.create({ clock, source: other }));
      r.crossSource = attempt(() => fresh.GlobalRoundScheduler.create({ clock, source }));
      r.otherState = other.state;
      await other.close();
      Object.assign(r, await playTwo(first, clock));
      await first.close();
      await source.close();
    } else if (arg === "fresh-first") {
      // No scheduler yet: the fresh copy is the process's first (and only) scheduler.
      const fresh = reload();
      const source = await fresh.PrepWorkerRoundSource.start({
        mode: "test",
        chain: "public-test-vectors",
      });
      // A source of the other module instance is not approved (a different private brand).
      r.staleSource = attempt(() => GlobalRoundScheduler.create({ clock, source }));
      const s = fresh.GlobalRoundScheduler.create({ clock, source });
      // The ORIGINAL module instance (its own `created` is still false) is refused as well.
      const original = await PrepWorkerRoundSource.start({
        mode: "test",
        chain: "public-test-vectors",
      });
      r.originalAfter = attempt(() => GlobalRoundScheduler.create({ clock, source: original }));
      await original.close();
      Object.assign(r, await playTwo(s, clock));
      await s.close();
      await source.close();
    } else {
      // "preset": code that set the record first only prevents the scheduler (fail closed).
      Object.defineProperty(process, MARK, { value: true });
      const source = await PrepWorkerRoundSource.start({
        mode: "test",
        chain: "public-test-vectors",
      });
      r.second = attempt(() => GlobalRoundScheduler.create({ clock, source }));
      r.sourceState = source.state;
      await source.close();
    }
    return emit(r);
  }

  if (scenario === "foreign") {
    // (patched source.js) the source delivers a seal NOT made for it: never admitted or opened.
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const clock = new SimulatedClock(1_000_000_000n);
    const s = GlobalRoundScheduler.create({ clock, source });
    const r = await playTwo(s, clock);
    r.state = s.state;
    r.residency = s.residency();
    await sleep(300);
    r.sourceState = source.state;
    await s.close();
    return emit(r);
  }

  if (scenario === "sealed") {
    // M-1 in compiled CommonJS: the opener is reachable from no property, symbol or export.
    load("server/src/scheduler/scheduler.js"); // loads disclosure.js, which claims the opener
    const sealedPath = require.resolve(path.join(out, "server/src/scheduler/sealed.js"));
    const sealedModule = require(sealedPath);
    const { SealedRound } = sealedModule;
    const { script, sealed } = forgeSeal("5c".repeat(32), 1, { crashAt: 2.5, diveTicks: 30 });
    const r = {
      exports: Object.keys(sealedModule).sort(),
      classKeys: Reflect.ownKeys(SealedRound).map(String).sort(),
      classSymbols: Object.getOwnPropertySymbols(SealedRound).map(String),
      protoKeys: Reflect.ownKeys(SealedRound.prototype).map(String),
      protoSymbols: Object.getOwnPropertySymbols(SealedRound.prototype).map(String),
      sealKeys: Reflect.ownKeys(sealed).map(String),
      sealSymbols: Object.getOwnPropertySymbols(sealed).length,
      claim: attempt(() => sealedModule.claimSealedRoundOpener()),
      claimAgain: attempt(() => sealedModule.claimSealedRoundOpener()),
    };
    // Every reachable function and accessor, called with the seal: none hands out the script.
    let leaked = 0;
    for (const target of [SealedRound, SealedRound.prototype, sealed, sealedModule]) {
      for (const key of Reflect.ownKeys(target)) {
        const d = Reflect.getOwnPropertyDescriptor(target, key);
        for (const fn of [d.value, d.get]) {
          if (typeof fn !== "function" || fn === SealedRound || key === "discard") continue;
          try {
            const v = fn.call(sealed, sealed);
            if (v === script || typeof v === "function") leaked += 1;
          } catch {
            // refused
          }
        }
      }
    }
    r.leaked = leaked;
    r.stateAfterProbes = sealed.state;
    // A fresh module instance (module cache entry deleted): its own opener, its own brand.
    delete require.cache[sealedPath];
    const freshModule = require(sealedPath);
    const freshOpen = freshModule.claimSealedRoundOpener();
    r.freshOpensOriginal = attempt(() => freshOpen(sealed));
    r.freshInstanceOf = sealed instanceof freshModule.SealedRound;
    r.stateAfterFresh = sealed.state;
    return emit(r);
  }

  if (scenario === "loss" || scenario === "prepfail") {
    const source = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    });
    const clock = new SimulatedClock(0n);
    const s = GlobalRoundScheduler.create({ clock, source });
    s.start();
    // Wait (real time) for whatever the patched worker does, then drive tick by tick.
    for (let k = 0; k < 20_000 && s.state !== "halted"; k++) {
      clock.advanceNs(NS_PER_TICK + 1n);
      s.poll();
      const t0 = Date.now();
      while (
        s.residency().next === "requested" &&
        s.state !== "halted" &&
        Date.now() - t0 < 10_000
      ) {
        await turn();
      }
      // Give a worker exit (no pending request) time to reach the controller.
      if (k % 50 === 0) await new Promise((r) => setTimeout(r, 5));
    }
    const report = { events: s.events(), snapshot: s.snapshot(), sourceState: source.state };
    await s.close().catch(() => undefined);
    return emit(report);
  }

  if (scenario === "integrity") {
    let source = null;
    const start = await PrepWorkerRoundSource.start({
      mode: "test",
      chain: "public-test-vectors",
    }).then(
      (s) => {
        source = s;
        return { ok: true };
      },
      (e) => ({ ok: false, error: errorOf(e) }),
    );
    const create =
      source === null
        ? null
        : attempt(() => GlobalRoundScheduler.create({ clock: new SimulatedClock(0n), source }));
    if (source !== null) await source.close();
    return emit({ start, create });
  }

  if (scenario === "bench") {
    const rounds = Number(arg ?? 40);
    const source = await PrepWorkerRoundSource.start({
      mode: "development",
      chain: "random",
      chainLength: rounds,
    });
    const clock = new SimulatedClock(0n);
    const s = GlobalRoundScheduler.create({ clock, source, eventCapacity: 1024 });
    const mb = (x) => Math.round((x / 1048576) * 10) / 10;
    const memory = [];
    const pollMs = [];
    const waitMs = [];
    s.start();
    let lastRound = -1;
    while (s.state !== "halted") {
      clock.advanceNs(10n * NS_PER_TICK);
      const t0 = performance.now();
      s.poll();
      pollMs.push(performance.now() - t0);
      const w0 = performance.now();
      const before = s.residency().next;
      await awaitDelivery(s);
      if (before === "requested") waitMs.push(performance.now() - w0);
      const snap = s.snapshot();
      if (snap.lastRound !== lastRound && snap.lastRound % 10 === 0) {
        lastRound = snap.lastRound;
        const m = process.memoryUsage();
        memory.push({ round: snap.lastRound, heapMB: mb(m.heapUsed), rssMB: mb(m.rss) });
      }
    }
    const stats = (xs) => {
      const a = [...xs].sort((p, q) => p - q);
      const q = (p) => a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)];
      const r3 = (v) => Math.round(v * 1000) / 1000;
      return { n: a.length, p50: r3(q(0.5)), p99: r3(q(0.99)), max: r3(a[a.length - 1]) };
    };
    const report = {
      snapshot: s.snapshot(),
      poll: stats(pollMs),
      delivery: stats(waitMs),
      memory,
      events: s.events().length,
      eventTotal: s.snapshot().lastSeq,
    };
    await s.close();
    return emit(report);
  }

  throw new Error(`unknown scenario ${scenario}`);
};

main().then(
  () => process.exit(0),
  (e) => {
    process.stdout.write(
      JSON.stringify({ fatal: errorOf(e), stack: String(e && e.stack), counters }),
    );
    process.exit(1);
  },
);
