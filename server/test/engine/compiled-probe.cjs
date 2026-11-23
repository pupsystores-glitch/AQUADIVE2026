// Compiled-runtime probe for the engine bundle (P8-4-0). TEST ONLY; run by
// engine-bundle.test.ts in a fresh Node process:
//
//   node compiled-probe.cjs <server build dir> <duplicate fairness index.js>
//
// The build dir holds `tsc -p tsconfig.build.json` output plus engine/engine.cjs (production
// bundle) and qa/*.cjs (TEST-ONLY bundles of the original src/seeded-round/test helpers, which
// load the production bundle). Before anything loads, Math.random and every browser global
// throw on use and are counted. Prints one JSON report on stdout and nothing else.
"use strict";
const Module = require("node:module");
const path = require("node:path");
const { inspect } = require("node:util");

const out = path.resolve(process.argv[2]);
const duplicateIndex = path.resolve(process.argv[3]);

// ---- 1. Poison Math.random and the browser globals (before any module is loaded) ----------
const counters = { mathRandom: 0, browser: {} };
Math.random = function poisonedRandom() {
  counters.mathRandom += 1;
  throw new Error("Math.random called");
};
const BROWSER_GLOBALS = [
  "window",
  "document",
  "self",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "HTMLCanvasElement",
  "OffscreenCanvas",
  "CanvasRenderingContext2D",
  "Image",
  "Audio",
  "AudioContext",
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
];
for (const name of BROWSER_GLOBALS) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      counters.browser[name] = (counters.browser[name] ?? 0) + 1;
      throw new Error(`${name} accessed`);
    },
  });
}

// ---- 2. Record every resolved and every executed (compiled) file ---------------------------
const resolved = new Set();
const compiled = [];
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (...args) {
  const f = resolveFilename.apply(this, args);
  resolved.add(f);
  return f;
};
const compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  compiled.push(filename);
  return compile.call(this, content, filename);
};

const load = (rel) => require(path.join(out, rel));
const rel = (f) => path.relative(out, f).split(path.sep).join("/");

// ---- 3. Load the compiled server fairness, the production bundle and the QA bundles --------
const bridge = load("server/src/fairness.js");
const engine = load("engine/engine.cjs");
const fairnessIndex = load("src/fairness/index.js");
const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
const { MemoryChainStore } = load("server/src/fairness/memory-chain-store.js");
const { ChainVault } = load("server/src/fairness/chain-vault.js");
const { checkpointIndices } = load("server/src/fairness/checkpoints.js");
const runner = load("qa/reference-runner.cjs");
const { REPLAY_RECORD_PINS } = load("qa/replay-pins.cjs");
const { INDEPENDENT_OUTCOME_VECTORS } = load("qa/independent-vectors.cjs");

const crypto = createNodeFairnessCrypto();
const hash = crypto.hash;
const V = bridge.FAIRNESS_DEV_VECTORS_V1;
const saltHex = (salt) => (salt === "A" ? V.saltAHex : V.saltBHex);
const input = (lib, salt, index) => ({
  fv: 1,
  chainId: lib.hexToBytes(V.linksHex[0]),
  chainIndex: index,
  salt: lib.hexToBytes(saltHex(salt)),
  roundSeed: lib.SecretBytes.fromBytes(lib.hexToBytes(V.linksHex[index])),
});
const summary = (r) => ({
  recordSha256: r.record.recordSha256,
  outcome: r.record.outcome,
  crashAt: r.record.crashAt,
  crashDraws: r.record.drawCounts.crash,
});

const report = { counters };
report.exports = Object.fromEntries(
  Object.keys(engine)
    .sort()
    .map((k) => [k, typeof engine[k]]),
);

// ---- 4. One fairness instance ---------------------------------------------------------------
report.identity = {
  bridgeRoundDerivationIsCompiledIndex: bridge.RoundDerivation === fairnessIndex.RoundDerivation,
  bridgeSecretBytesIsCompiledIndex: bridge.SecretBytes === fairnessIndex.SecretBytes,
};

// ---- 5. Replay: SeededRound.create inside the bundle, three orders ---------------------------
const pins = REPLAY_RECORD_PINS.map(([salt, index]) => [salt, index]);
const replay = (order) =>
  order.map(([salt, index]) => ({
    key: `${salt}${index}`,
    ...summary(runner.runReferenceRoundFromInput(hash, input(bridge, salt, index))),
  }));
report.replay = {
  pins: REPLAY_RECORD_PINS,
  vectors: INDEPENDENT_OUTCOME_VECTORS,
  forward: replay(pins),
  again: replay(pins),
  reversed: replay([...pins].reverse()),
};

// ---- 6. Bind path: the server's RoundDerivation → the bundle's SeededRound.bind --------------
report.bind = pins.map(([salt, index]) => {
  const derivation = bridge.RoundDerivation.create(hash, input(bridge, salt, index));
  const round = engine.SeededRound.bind(derivation);
  return { key: `${salt}${index}`, ...summary(runner.runReferenceRound(hash, round)) };
});

// ---- 7. A derivation from a SECOND fairness copy is refused (why one instance matters) -----
{
  const duplicate = require(duplicateIndex);
  const derivation = duplicate.RoundDerivation.create(hash, input(duplicate, "A", 1));
  let refusal = null;
  try {
    engine.SeededRound.bind(derivation);
  } catch (e) {
    refusal = {
      isSeededRoundError: e instanceof engine.SeededRoundError,
      code: e.code,
      message: e.message,
    };
  } finally {
    derivation.dispose();
  }
  report.duplicate = {
    distinctClass: duplicate.RoundDerivation !== bridge.RoundDerivation,
    refusal,
  };
}

// ---- 8. Secrecy of a live compiled round before its reveal ----------------------------------
{
  const round = engine.SeededRound.create(hash, input(bridge, "A", 7));
  const crash = round.authority.sampleCrashPoint();
  const world = [];
  for (let i = 0; i < 25; i++) world.push(round.worldRng.next());
  const secrets = [V.linksHex[7], V.linksHex[7].slice(0, 16), String(crash), String(world[0])];
  const views = [round, round.authority, round.worldRng, round.deps].flatMap((x) => [
    JSON.stringify(x),
    String(x),
    inspect(x, { depth: 10, showHidden: true }),
  ]);
  let error = "";
  try {
    round.authority.sampleCrashPoint();
  } catch (e) {
    error = `${e.message}\n${e.stack}\n${JSON.stringify(e)}`;
  }
  round.dispose();
  report.secrecy = {
    json: JSON.stringify(round),
    leakedViews: views.filter((v) => secrets.some((s) => v.includes(s))).length,
    errorRaised: error.length > 0,
    errorLeaks: secrets.some((s) => error.includes(s)),
  };
}

// ---- 9. LocalRoundAuthority with a fixed LCG: the bundle's engine is deterministic ---------
// D-1: the production bundle does not export LocalRoundAuthority. The constructor comes from a
// TEST-ONLY bundle of its unchanged source module (qa/local-authority.cjs); the engine under
// test is the production bundle's GameEngine.
{
  const { LocalRoundAuthority } = load("qa/local-authority.cjs");
  const lcg = (seed) => {
    let s = seed >>> 0;
    return { next: () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32 };
  };
  const play = () => {
    const e = new engine.GameEngine({
      authority: new LocalRoundAuthority(lcg(7)),
      worldRng: lcg(11),
    });
    let terminal = null;
    e.events.on("crashed", (ev) => (terminal = `crash@${ev.multiplier}`));
    e.events.on(
      "chestsRevealed",
      (ev) => (terminal = `floor:${ev.chests.map((c) => c.multiplier)}`),
    );
    let ticks = 0;
    while (terminal === null && ticks < 20000) {
      e.advance(1 / 60);
      ticks += 1;
    }
    return { terminal, ticks, snapshot: JSON.stringify(e.snapshot()) };
  };
  const a = play();
  const b = play();
  report.local = {
    exportedByProduction: Object.hasOwn(engine, "LocalRoundAuthority"),
    terminal: a.terminal,
    ticks: a.ticks,
    identical: JSON.stringify(a) === JSON.stringify(b),
  };
}

// ---- 9b. Seeded authority only through SeededRound (D-1) ----------------------------------
{
  const round = engine.SeededRound.create(hash, input(bridge, "B", 3));
  const authorityClass = Object.getPrototypeOf(round.authority).constructor;
  report.authorityRoute = {
    functionExports: Object.keys(engine)
      .filter((k) => typeof engine[k] === "function")
      .sort(),
    authorityClassExported: Object.values(engine).includes(authorityClass),
    authorityIsSeeded: authorityClass.name === "SeededRoundAuthority",
    depsAuthorityIsRoundAuthority: round.deps.authority === round.authority,
    // Residual risk, recorded (not fixed): reflection reaches the class from an instance.
    reflectionReachable: typeof authorityClass === "function",
  };
  round.dispose();
}

// ---- 9c. EventBus listener errors: the actual stderr output discloses no secret ------------
// Every listener of every engine event throws an Error that carries the live round, its
// authority, world stream, deps and the server derivation (one listener throws the round
// itself). The EventBus firewall logs each with console.error; the real console writes to
// process.stderr, whose write is captured (and swallowed, so the probe's stderr stays empty).
{
  const EVENTS = [
    "bettingOpened",
    "betPlaced",
    "commandRejected",
    "diveStarted",
    "cashedOut",
    "crashed",
    "shipImpact",
    "chestsRevealed",
    "chestPicked",
    "roundEnded",
    "stateChanged",
    "engineError",
  ];
  const REVEALING = new Set([
    "crashed",
    "shipImpact",
    "chestsRevealed",
    "chestPicked",
    "roundEnded",
  ]);
  const seedHex = V.linksHex[7];
  const reference = runner.runReferenceRoundFromInput(hash, input(bridge, "A", 7)).record;

  const derivation = bridge.RoundDerivation.create(hash, input(bridge, "A", 7));
  const round = engine.SeededRound.bind(derivation);
  const game = new engine.GameEngine(round.deps);

  const thrown = [];
  const calls = [];
  const stderr = [];
  let revealed = false;
  let terminal = null;
  const realError = console.error;
  const realWrite = process.stderr.write;
  process.stderr.write = function captureStderr(chunk, ...rest) {
    stderr.push({ index: calls.length, text: String(chunk) });
    const callback = rest.find((r) => typeof r === "function");
    if (callback) callback();
    return true;
  };
  console.error = function captureError(...args) {
    calls.push({ args, preReveal: !revealed });
    return realError.apply(this, args);
  };
  try {
    for (const name of EVENTS) {
      game.events.on(name, (payload) => {
        if (REVEALING.has(name)) revealed = true;
        if (name === "stateChanged" && payload.to !== "betting" && payload.to !== "diving") {
          revealed = true;
        }
        if (name === "crashed") terminal = `crash@${payload.multiplier}`;
        if (name === "chestsRevealed") terminal = "floor";
        const error = Object.assign(new Error(`listener failed on ${name}`), {
          round,
          authority: round.authority,
          worldRng: round.worldRng,
          deps: round.deps,
          derivation,
        });
        thrown.push(error);
        throw error;
      });
    }
    game.events.on("diveStarted", () => {
      thrown.push(round);
      throw round;
    });
    for (let ticks = 0; terminal === null && ticks < 20000; ticks++) game.advance(1 / 60);
  } finally {
    console.error = realError;
    process.stderr.write = realWrite;
  }
  round.dispose();
  derivation.dispose();

  const textOf = (pre) =>
    stderr
      .filter((s) => !pre || (calls[s.index] && calls[s.index].preReveal))
      .map((s) => s.text)
      .join("");
  const all = textOf(false);
  const pre = textOf(true);
  const secretsAnywhere = [
    seedHex,
    seedHex.slice(0, 16),
    seedHex.slice(-16),
    reference.recordSha256,
    "drawsUsed",
    "secretDrawCounts",
    "drawCounts",
    JSON.stringify(reference.drawCounts),
  ];
  const secretsBeforeReveal = [String(reference.crashAt), reference.crashAt.toFixed(2)];
  if (reference.jackpot !== null) secretsBeforeReveal.push(String(reference.jackpot));
  report.eventBus = {
    terminal,
    listenerCalls: thrown.length,
    calls: calls.map((c, i) => ({
      argCount: c.args.length,
      prefix: c.args[0],
      event: c.args[1],
      isThrownValue: c.args[2] === thrown[i],
      preReveal: c.preReveal,
    })),
    stderrBytes: all.length,
    sealedMarkers: all.split(fairnessIndex.REDACTED).length - 1,
    leaks: [
      ...secretsAnywhere.filter((s) => all.includes(s)),
      ...secretsBeforeReveal.filter((s) => pre.includes(s)).map((s) => `before reveal: ${s}`),
    ],
  };
}

// ---- 10. Vault path: reserve → prepare → RoundKeys.derivation → SeededRound.bind ------------
(async () => {
  const vaultRuns = [];
  for (const salt of ["A", "B"]) {
    const store = new MemoryChainStore({ mode: "test" });
    const checkpoints = new Map(
      checkpointIndices(V.chainLength, 3).map((c) => [
        c,
        bridge.SecretBytes.fromBytes(bridge.hexToBytes(V.linksHex[c])),
      ]),
    );
    await store.createChain({
      commitment: { fv: V.fv, chainId: bridge.hexToBytes(V.linksHex[0]), length: V.chainLength },
      checkpointInterval: 3,
      checkpoints,
    });
    for (const cp of checkpoints.values()) cp.dispose();
    const vault = new ChainVault({ crypto, store });
    for (let i = 1; i <= V.chainLength; i++) {
      const r = await vault.reserveRound(V.linksHex[0], `${salt}-${i}`);
      const keys = await vault.prepareRound(
        V.linksHex[0],
        r.chainIndex,
        bridge.hexToBytes(saltHex(salt)),
      );
      const round = engine.SeededRound.bind(keys.derivation);
      vaultRuns.push({
        key: `${salt}${r.chainIndex}`,
        ...summary(runner.runReferenceRound(hash, round)),
      });
      keys.dispose();
    }
    vault.dispose();
  }
  report.vault = vaultRuns;
  // Everything that was resolved and executed, at the end of the run.
  report.loaded = {
    compiled: compiled.map((f) => (f.startsWith(out + path.sep) ? rel(f) : f)),
    resolved: [...resolved].map((f) => (f.startsWith(out + path.sep) ? rel(f) : f)).sort(),
  };
  report.counters = counters;
  process.stdout.write(JSON.stringify(report));
})().catch((e) => {
  process.stderr.write(String(e && e.stack));
  process.exit(1);
});
