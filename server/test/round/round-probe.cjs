// Compiled-runtime probe for offline RoundScript precomputation (P8-4a). TEST ONLY; run by
// round-runtime.test.ts in a fresh Node process:
//
//   node round-probe.cjs <server build dir> <scenario>
//
// The build dir holds the `npm run build` output (tsc + engine/engine.cjs) and the TEST-ONLY
// bundles in qa/ (test/helpers/engine-build.ts). Before anything loads, Math.random and every
// browser global throw on use and are counted; console output is counted too. Every derivation
// and every RoundKeys created anywhere in the process is recorded, so the report can show that
// each one was disposed. Prints one JSON report on stdout and nothing else. Scenarios:
//
//   main     the whole pipeline: loader, known answers, all 16 replay pins through the vault and
//            the production runner, an independent recorder + encoder, reversed order, audit,
//            redaction, reveal verification and tamper detection, chain states, concurrency,
//            injected store / audit failures, disposal, the analytic tick bound
//   digests  the 16 RoundScript digests only (fresh-process reproducibility)
//   load     loadEngineRuntime only (for tampered bundles): { ok, code }
//   fault    an environment over the vector chain, salt A, indices 1 … 8 (for bundles with
//            injected runner faults): per-index result, audit, disposal
//   case     (Windows) the fairness module first loaded under another drive-letter case
//   construction  every route to an OfflineRoundEnvironment with non-verified runtimes, crypto,
//            capabilities and modes (M-2b); legitimate creation, defaults and the public surface
//   startup  loads the compiled application module and reports which modules that loaded
"use strict";
const Module = require("node:module");
const path = require("node:path");
const { inspect } = require("node:util");

const out = path.resolve(process.argv[2]);
const scenario = process.argv[3];

// ---- 1. Poison Math.random and the browser globals; count console output -------------------
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
const errorOf = (e) => ({
  name: e && e.name,
  code: e && e.code,
  reason: e && Object.hasOwn(e, "reason") ? e.reason : undefined,
  message: e && e.message,
});
const capture = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};
const emit = (report) => {
  report.counters = counters;
  process.stdout.write(JSON.stringify(report));
};

// ---- Scenarios that must load something unusual BEFORE the bridge -------------------------
if (scenario === "startup") {
  load("server/src/app.js");
  const loaded = Object.keys(require.cache)
    .filter((f) => f.startsWith(out + path.sep))
    .map(rel)
    .sort();
  emit({
    loaded,
    round: loaded.filter((f) => f.startsWith("server/src/round/")),
    engine: loaded.filter((f) => f.startsWith("engine/")),
    fairness: loaded.filter((f) => /fairness/.test(f)),
  });
  return;
}
if (scenario === "case") {
  // Load the compiled fairness module once under the other drive-letter case (a second,
  // silent module instance on Windows), then the loader under the original path.
  const fairnessPath = path.join(out, "src", "fairness", "index.js");
  const flipped = fairnessPath.replace(/^[A-Za-z]:/, (d) =>
    d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase(),
  );
  const other = require(flipped);
  const bridge = load("server/src/fairness.js");
  const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
  const { loadEngineRuntime } = load("server/src/round/engine-runtime.js");
  let result;
  try {
    loadEngineRuntime(createNodeFairnessCrypto());
    result = { ok: true };
  } catch (e) {
    result = { ok: false, ...errorOf(e) };
  }
  emit({ distinctInstances: other.RoundDerivation !== bridge.RoundDerivation, result });
  return;
}

if (scenario === "case-round") {
  // P8-4a-1: a protected round module (not fairness) first loaded under the other drive-letter
  // case — a second instance the fairness-class check cannot see — then the loader normally.
  // errors.js imports nothing, so no second fairness instance is created by the flipped copy.
  const canonicalPath = path.join(out, "server", "src", "round", "errors.js");
  const flipped = canonicalPath.replace(/^[A-Za-z]:/, (d) =>
    d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase(),
  );
  require(flipped);
  const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
  const { loadEngineRuntime } = load("server/src/round/engine-runtime.js");
  let result;
  try {
    loadEngineRuntime(createNodeFairnessCrypto());
    result = { ok: true };
  } catch (e) {
    result = { ok: false, ...errorOf(e) };
  }
  emit({ flippedDiffers: flipped !== canonicalPath, result });
  return;
}

// ---- 2. The compiled server, its fairness module, and lifecycle instrumentation ------------
const bridge = load("server/src/fairness.js");
const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
const { RoundKeys } = load("server/src/fairness/round-keys.js");
const { assertAuditEvent } = load("server/src/fairness/audit.js");

const derivations = [];
const keysCreated = [];
const secretsCreated = [];
/** One-shot construction faults (the adversarial scenario sets them). */
const faults = { keysCreate: false, secretFromBytes: false };
{
  const create = bridge.RoundDerivation.create;
  bridge.RoundDerivation.create = function (...args) {
    const d = create.apply(this, args);
    derivations.push(d);
    return d;
  };
  const createKeys = RoundKeys.create;
  RoundKeys.create = function (...args) {
    if (faults.keysCreate) {
      faults.keysCreate = false;
      throw new bridge.FairnessError("invalid-salt", "injected construction failure");
    }
    const k = createKeys.apply(this, args);
    keysCreated.push(k);
    return k;
  };
  // Temporary seed copies (L-1): every SecretBytes.fromBytes result, to check its disposal.
  const fromBytes = bridge.SecretBytes.fromBytes;
  bridge.SecretBytes.fromBytes = function (...args) {
    if (faults.secretFromBytes) {
      faults.secretFromBytes = false;
      throw new bridge.FairnessError("invalid-length", "injected construction failure");
    }
    const s = fromBytes.apply(this, args);
    secretsCreated.push(s);
    return s;
  };
}
/** Live SecretBytes.fromBytes copies created since `mark` (an index into secretsCreated). */
const liveSecretsSince = (mark) => secretsCreated.slice(mark).filter((s) => !s.disposed).length;
const disposal = () => ({
  derivations: derivations.length,
  liveDerivations: derivations.filter((d) => !d.disposed).length,
  keys: keysCreated.length,
  liveKeys: keysCreated.filter((k) => !k.disposed).length,
});

const crypto = createNodeFairnessCrypto();
const hash = crypto.hash;
const V = bridge.FAIRNESS_DEV_VECTORS_V1;
const saltHex = (salt) => (salt === "A" ? V.saltAHex : V.saltBHex);
const saltBytes = (salt) => bridge.hexToBytes(saltHex(salt));

/** An audit sink that validates like the development sink and can inject failures. */
function probeSink(failOn = () => false) {
  const events = [];
  return {
    events,
    guarantees: Object.freeze({ durable: false, tamperEvident: false }),
    append(event) {
      assertAuditEvent(event);
      events.push({ ...event });
      if (failOn(event)) throw new Error("injected audit failure");
    },
  };
}

const runtimeModule = load("server/src/round/engine-runtime.js");

if (scenario === "load") {
  let result;
  try {
    runtimeModule.loadEngineRuntime(crypto);
    result = { ok: true };
  } catch (e) {
    result = { ok: false, ...errorOf(e) };
  }
  emit({ result, disposal: disposal() });
  return;
}

const { createOfflineRoundEnvironment, OFFLINE_DISPOSITION } = load("server/src/round/prepare.js");
const roundScript = load("server/src/round/round-script.js");
const canonical = load("server/src/round/canonical.js");
const knownAnswers = load("server/src/round/known-answers.js");
const errorsModule = load("server/src/round/errors.js");
const auditModule = load("server/src/fairness/audit.js");
const loadSecretsMark = secretsCreated.length;
const runtime = runtimeModule.loadEngineRuntime(crypto);
/** The loader's known-answer derivations: seed copies created and still live (L-1). */
const loadSecrets = {
  created: secretsCreated.length - loadSecretsMark,
  live: liveSecretsSince(loadSecretsMark),
};
const PINS = [
  ["A", 1],
  ["A", 2],
  ["A", 3],
  ["A", 4],
  ["A", 5],
  ["A", 6],
  ["A", 7],
  ["A", 8],
  ["B", 1],
  ["B", 2],
  ["B", 3],
  ["B", 4],
  ["B", 5],
  ["B", 6],
  ["B", 7],
  ["B", 8],
];
const direct = (salt, index) => runtimeModule.knownAnswerScript(hash, runtime, { salt, index });

if (scenario === "vectors") {
  // P8-4a-1 (I5, I6): the production runner against every independent vector, and the loader's
  // known answers against the independent generator they were copied from.
  (async () => {
    const { pathToFileURL } = require("node:url");
    const independent = path.join(__dirname, "..", "independent");
    const g = await import(pathToFileURL(path.join(independent, "generate-vectors.mjs")).href);
    const ref = await import(pathToFileURL(path.join(independent, "reference-round.mjs")).href);
    const committed = require(path.join(independent, "vectors-v1.json"));
    const { dev, kat, salts } = g.chains();
    const strip = (o) => {
      const { profile, profileVersion, fv, chainIndex, ...rest } = o;
      (void profile, void profileVersion, void fv, void chainIndex);
      return JSON.parse(JSON.stringify(rest));
    };
    const firstDiff = (a, b, p = "") => {
      if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return Object.is(a, b) ? null : p;
      }
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const d = firstDiff(a[k], b[k], `${p}.${k}`);
        if (d) return d;
      }
      return null;
    };
    const results = [];
    for (const v of committed.vectors) {
      const links = v.set === "dev-v1" ? dev : kat;
      const seed = bridge.SecretBytes.fromBytes(new Uint8Array(links[v.index]));
      const d = bridge.RoundDerivation.create(hash, {
        fv: 1,
        chainId: new Uint8Array(links[0]),
        chainIndex: v.index,
        salt: new Uint8Array(salts[v.salt]),
        roundSeed: seed,
      });
      seed.dispose();
      const production = strip(runtime.run(d));
      const reference = JSON.parse(
        JSON.stringify(ref.referenceRound(links, v.index, salts[v.salt]).record),
      );
      results.push({
        key: `${v.set}:${v.salt}${v.index}`,
        categories: v.categories,
        digestMatches: g.recordDigest(production) === v.recordDigest,
        serverDigestMatches:
          runtimeModule.referenceRecordDigest(hash, production) === v.recordDigest,
        firstDifference: firstDiff(reference, production),
        samples: production.samples.multiplier.length,
        creatures: production.creatures.length,
        consumed: production.creatures.filter((c) => c.consumedTick !== null).length,
      });
    }
    // "First index" proof of the selection rule: no earlier index of the same salt satisfies the
    // category (crash-only categories from the crash stream alone; the others by full rounds).
    const firstProof = [];
    for (const v of committed.vectors.filter((x) => x.set === "kat-v1")) {
      for (const cat of v.categories) {
        let earlier = 0;
        for (let i = 1; i < v.index; i++) {
          const r = g.CRASH_ONLY.includes(cat)
            ? ref.referenceCrash(kat, i, salts[v.salt])
            : ref.referenceRound(kat, i, salts[v.salt]);
          if (g.CATEGORIES[cat](r)) earlier += 1;
        }
        firstProof.push([`${v.salt}${v.index}`, cat, earlier]);
      }
    }
    const regenerated = g.generate();
    const kaReport = knownAnswers.ROUND_SCRIPT_KNOWN_ANSWERS.map((a) => {
      const v = committed.vectors.find(
        (x) => x.set === a.chain && x.salt === a.salt && x.index === a.index,
      );
      const r = ref.referenceRound(a.chain === "dev-v1" ? dev : kat, a.index, salts[a.salt]).record;
      return {
        key: `${a.chain}:${a.salt}${a.index}`,
        inVectors: v !== undefined,
        recordDigest: v !== undefined && a.recordDigest === v.recordDigest,
        values:
          a.outcome === r.outcome &&
          a.crashAt === r.crashAt &&
          a.crashDraws === r.drawCounts.crash &&
          (a.outcome === "floor"
            ? a.jackpot === r.jackpot && JSON.stringify(a.chests) === JSON.stringify(r.chests)
            : true) &&
          JSON.stringify(a.firstCreatures) ===
            JSON.stringify(
              r.creatures
                .slice(0, 2)
                .map(({ spawnTick, consumedTick, ...c }) => (void spawnTick, void consumedTick, c)),
            ),
      };
    });
    const K = knownAnswers.KNOWN_ANSWER_CHAIN_V1;
    emit({
      count: results.length,
      results,
      firstProof,
      regeneratedEqualsCommitted: JSON.stringify(regenerated) === JSON.stringify(committed),
      knownAnswers: kaReport,
      katChain: {
        chainId: K.chainIdHex === committed.chains["kat-v1"].chainId,
        length: K.length === committed.chains["kat-v1"].length,
        phrase: K.seedPhrase === committed.chains["kat-v1"].seedPhrase,
        saltC: K.saltCHex === committed.chains["kat-v1"].salts.C.hex,
      },
      disposal: disposal(),
    });
  })().catch((e) => {
    process.stderr.write(String(e && e.stack));
    process.exit(1);
  });
  return;
}

if (scenario === "digests") {
  emit({ digests: PINS.map(([s, i]) => [`${s}${i}`, direct(s, i).secretDigest()]) });
  return;
}

if (scenario === "fault") {
  (async () => {
    const sink = probeSink();
    const env = createOfflineRoundEnvironment({ mode: "test", crypto, runtime, audit: sink });
    const chain = await env.importPublicTestVectorChain();
    const results = [];
    for (let i = 1; i <= 8; i++) {
      try {
        const s = await env.prepareScript(chain.chainId, `fault-${i}`, saltBytes("A"));
        results.push({ index: i, ok: true, chainIndex: s.public.chainIndex });
      } catch (e) {
        results.push({ index: i, ok: false, ...errorOf(e) });
      }
    }
    const classified = sink.events
      .filter((e) => e.kind === "round-classified")
      .map((e) => [e.chainIndex, e.code]);
    env.close();
    emit({
      results,
      classified,
      scriptEvents: sink.events
        .filter((e) => e.kind.startsWith("script-"))
        .map((e) => [e.kind, e.chainIndex, e.code]),
      disposal: disposal(),
    });
  })().catch((e) => {
    process.stderr.write(String(e && e.stack));
    process.exit(1);
  });
  return;
}

// ==== scenario "adversarial" (P8-4a acceptance corrections M-1, M-2, L-1) ======================
if (scenario === "adversarial") {
  (async () => {
    const report = { loadSecrets };
    const result = async (fn) => {
      try {
        return { ok: true, value: await fn() };
      } catch (e) {
        return { ok: false, ...errorOf(e), hasCause: e !== null && "cause" in Object(e) };
      }
    };
    const randomBytes = (n) => new Uint8Array(require("node:crypto").randomBytes(n));

    // ---- M-1. A fabricated chain the environment never had (the audit's exact scenario) -----
    {
      const env = createOfflineRoundEnvironment({ mode: "development", crypto, runtime });
      const n = 4;
      const links = new Array(n + 1);
      links[n] = randomBytes(32);
      for (let i = n - 1; i >= 0; i--) links[i] = bridge.sha256(hash, links[i + 1]);
      const chainId = bridge.bytesToHex(links[0]);
      const salt = randomBytes(32);
      const j = 2;
      const seed = bridge.SecretBytes.fromBytes(links[j]);
      const keys = RoundKeys.create(hash, { chainId, chainIndex: j, salt, roundSeed: seed });
      const output = runtime.run(keys.derivation);
      keys.dispose();
      seed.dispose();
      const script = roundScript.buildRoundScript(
        hash,
        { chainId, chainIndex: j, salt: bridge.bytesToHex(salt) },
        output,
      );
      const fakeReveal = {
        kind: "round-reveal",
        status: "x",
        fv: 1,
        chainId,
        chainLength: n,
        chainIndex: j,
        seed: bridge.bytesToHex(links[j]),
        previousLink: bridge.bytesToHex(links[j - 1]),
        salt: bridge.bytesToHex(salt),
        disposition: "completed",
      };
      // The hashes are internally consistent: x_(j−1) = H(x_j) and H^j(x_j) = x_0.
      const consistent =
        bridge.bytesToHex(bridge.sha256(hash, links[j])) === fakeReveal.previousLink &&
        bridge.verifySeedAgainstCommitment(
          hash,
          { fv: 1, chainId: links[0], length: n },
          { index: j, seed: links[j] },
        ).ok;
      const mark = secretsCreated.length;
      report.fabricated = {
        consistent,
        verify: await result(() => env.verifyScript(script, fakeReveal)),
        chainLengthLie: await result(() =>
          env.verifyScript(script, { ...fakeReveal, chainLength: 999 }),
        ),
        // L-1: the audit's malformed (1-byte) salt in an otherwise valid reveal.
        shortSalt: await result(() => env.verifyScript(script, { ...fakeReveal, salt: "00" })),
        knownToEnv: await result(() => env.chainStatus(chainId)),
        revealViaEnv: await result(() => env.revealRound(chainId, j)),
        liveSecrets: liveSecretsSince(mark),
      };
      env.close();
    }

    // ---- M-1. Real chain: false chain length, other forged fields, not yet revealed ----------
    {
      const sink = probeSink();
      const env = createOfflineRoundEnvironment({ mode: "test", crypto, runtime, audit: sink });
      const { chainId } = await env.importPublicTestVectorChain();
      const s = [];
      for (let i = 1; i <= 4; i++)
        s.push(await env.prepareScript(chainId, `adv-${i}`, saltBytes("A")));
      const reveal1 = await env.revealRound(chainId, 1);
      const reveal2 = await env.revealRound(chainId, 2);
      const statusBefore = await env.chainStatus(chainId);
      const eventsBefore = sink.events.length;
      const mark = secretsCreated.length;
      const keysMark = keysCreated.length;
      const forged = {};
      const variants = {
        chainLength999: { ...reveal2, chainLength: 999 },
        chainLengthShort: { ...reveal2, chainLength: 4 },
        fvOther: { ...reveal2, fv: 2 },
        statusOther: { ...reveal2, status: "x" },
        dispositionVoided: { ...reveal2, disposition: "voided" },
        saltOther: { ...reveal2, salt: V.saltBHex },
        saltShort: { ...reveal2, salt: "00" },
        saltMalformed: { ...reveal2, salt: "zz" },
        saltNull: { ...reveal2, salt: null },
        seedOfRound1: { ...reveal2, seed: reveal1.seed, previousLink: reveal1.previousLink },
        chainIdOther: { ...reveal2, chainId: "ab".repeat(32) },
        indexOther: { ...reveal2, chainIndex: 1 },
        notAnObject: null,
        empty: {},
      };
      for (const [name, r] of Object.entries(variants)) {
        forged[name] = await result(() => env.verifyScript(s[1], r));
      }
      // Index 3 is concluded (completed) but NOT revealed. The caller knows its seed (the public
      // development vectors) and builds a record identical to what a reveal would return: the
      // environment must refuse it and must not reveal or record anything.
      const exactUnrevealed = {
        ...reveal2,
        chainIndex: 3,
        seed: V.linksHex[3],
        previousLink: V.linksHex[2],
      };
      const unrevealed = await result(() => env.verifyScript(s[2], exactUnrevealed));
      const control = await result(() => env.verifyScript(s[1], reveal2));
      const eventsDuringVerify = sink.events.slice(eventsBefore).map((e) => e.kind);
      const statusAfter = await env.chainStatus(chainId);
      report.realChain = {
        forged,
        unrevealed,
        control,
        // Verification is read-only: the reveal frontier and the store did not move, and no
        // audit event was appended by any of the verifications above.
        revealedCountBefore: statusBefore.revealedCount,
        revealedCountAfter: statusAfter.revealedCount,
        lastReservedBefore: statusBefore.lastReservedIndex,
        lastReservedAfter: statusAfter.lastReservedIndex,
        eventsDuringVerify,
        reveal3AfterwardsDisposition: (await env.revealRound(chainId, 3)).disposition,
        liveSecrets: liveSecretsSince(mark),
        liveKeys: keysCreated.slice(keysMark).filter((k) => !k.disposed).length,
      };

      // ---- L-1. Construction faults inside verifyScript: sanitized, everything disposed ------
      const reveal3 = await env.revealRound(chainId, 3);
      const faultMark = secretsCreated.length;
      const faultKeysMark = keysCreated.length;
      faults.keysCreate = true;
      const keysFault = await result(() => env.verifyScript(s[2], reveal3));
      faults.secretFromBytes = true;
      const secretFault = await result(() => env.verifyScript(s[2], reveal3));
      const afterFaults = await result(() => env.verifyScript(s[2], reveal3));
      report.faults = {
        keysFault,
        secretFault,
        afterFaults,
        faultsConsumed: !faults.keysCreate && !faults.secretFromBytes,
        secretsCreated: secretsCreated.length - faultMark,
        liveSecrets: liveSecretsSince(faultMark),
        keysCreated: keysCreated.length - faultKeysMark,
        liveKeys: keysCreated.slice(faultKeysMark).filter((k) => !k.disposed).length,
      };

      // ---- M-1. A compromised chain is never verified, even for a revealed round ------------
      await env.restrictChainForTest(chainId, "compromised");
      report.compromisedVerify = await result(() => env.verifyScript(s[0], reveal1));
      env.close();
    }

    // ---- M-2. The vault is private; selective voiding is not available ----------------------
    {
      const sink = probeSink();
      const env = createOfflineRoundEnvironment({
        mode: "development",
        crypto,
        runtime,
        audit: sink,
      });
      const proto = Object.getPrototypeOf(env);
      const surface = {
        vault: env.vault === undefined && !("vault" in env),
        ownKeys: Reflect.ownKeys(env).map(String).sort(),
        methods: Object.getOwnPropertyNames(proto).sort(),
        frozen: Object.isFrozen(env),
      };
      let assigned = null;
      try {
        env.vault = { classifyRound() {} };
      } catch (e) {
        assigned = e && e.name;
      }
      surface.assignVault = assigned;
      surface.vaultAfterAssign = env.vault === undefined;

      // The audit's selective-voiding attempt: prepare, look at the outcome, then try to keep
      // only the rounds we like (low crashes `completed`, the rest `voided`).
      const { chainId } = await env.createChain({ length: 8 });
      const salt = new Uint8Array(32).fill(7);
      const attempts = [];
      for (let k = 0; k < 4; k++) {
        const script = await env.prepareScript(chainId, `peek-${k}`, salt);
        const o = script.secretContent();
        const wanted = o.outcome === "crash" && o.crashAt < 2 ? "completed" : "voided";
        const tries = {};
        for (const [name, fn] of Object.entries({
          vaultClassify: () =>
            env.vault.classifyRound(chainId, script.public.chainIndex, wanted, "peeked"),
          envClassify: () => env.classifyRound(chainId, script.public.chainIndex, wanted, "peeked"),
          envTransition: () => env.transitionChain(chainId, "suspended", "peeked"),
          envReserve: () => env.reserveRound(chainId, `peek-extra-${k}`),
          envPrepareRound: () => env.prepareRound(chainId, script.public.chainIndex, salt),
          restrictInDevelopment: () => env.restrictChainForTest(chainId, "suspended"),
          // Re-preparing the same request id does not reopen the index.
          replay: () => env.prepareScript(chainId, `peek-${k}`, salt),
        })) {
          const r = await result(fn);
          tries[name] = r.ok ? "accepted" : `${r.name}:${r.code ?? ""}`;
        }
        attempts.push({ index: script.public.chainIndex, wanted, tries });
      }
      // Every index stays as the offline policy classified it: reveal them all in order.
      const dispositions = [];
      for (let i = 1; i <= 4; i++)
        dispositions.push((await env.revealRound(chainId, i)).disposition);
      const next = (await env.prepareScript(chainId, "after-peek", salt)).public.chainIndex;
      report.vaultBypass = {
        surface,
        attempts,
        dispositions,
        classifiedEvents: sink.events
          .filter((e) => e.kind === "round-classified")
          .map((e) => [e.chainIndex, e.code]),
        nextIndex: next,
        // An index this environment never prepared is refused before the vault is asked.
        revealUnprepared: await result(() => env.revealRound(chainId, 7)),
        status: (await env.chainStatus(chainId)).state,
      };
      env.close();
    }

    // ---- M-2. The test-only restriction is one way and fixed ----------------------------------
    {
      const sink = probeSink();
      const env = createOfflineRoundEnvironment({ mode: "test", crypto, runtime, audit: sink });
      const { chainId } = await env.createChain({ length: 8 });
      const restrict = {};
      for (const to of ["active", "retired", "exhausted", "voided", "indeterminate"]) {
        const r = await result(() => env.restrictChainForTest(chainId, to));
        restrict[to] = r.ok ? "accepted" : r.code;
      }
      await env.prepareScript(chainId, "r-1", saltBytes("A"));
      restrict.suspended = (await env.restrictChainForTest(chainId, "suspended")).state;
      const back = await result(() => env.restrictChainForTest(chainId, "active"));
      restrict.backToActive = back.ok ? "accepted" : back.code;
      restrict.prepareWhileSuspended = (
        await result(() => env.prepareScript(chainId, "r-2", saltBytes("A")))
      ).code;
      restrict.revealWhileSuspended = (await env.revealRound(chainId, 1)).disposition;
      restrict.compromised = (await env.restrictChainForTest(chainId, "compromised")).state;
      restrict.reasonCodes = sink.events
        .filter((e) => e.kind === "chain-transition")
        .map((e) => [e.operation, e.code]);
      report.restrict = restrict;
      env.close();
    }

    // ---- L-1. Known-answer derivations dispose their seed copy -------------------------------
    {
      const mark = secretsCreated.length;
      for (const [s, i] of PINS) direct(s, i);
      report.knownAnswerSecrets = {
        created: secretsCreated.length - mark,
        live: liveSecretsSince(mark),
      };
    }
    report.disposal = disposal();
    emit(report);
  })().catch((e) => {
    process.stderr.write(String(e && e.stack));
    process.exit(1);
  });
  return;
}

// ==== scenario "construction" (P8-4a acceptance correction M-2b) ===============================
// The audit's bypass: `new OfflineRoundEnvironment(mode, crypto, wrapper, sink)` from JavaScript
// with a wrapper runtime that delegates to the real one and throws on unwanted outcomes, so they
// are classified `aborted`. Every route to an environment is tried with every non-verified
// runtime; each refusal must carry the code AND fixed reason of the invariant it enforces.
if (scenario === "construction") {
  (async () => {
    const prepareModule = load("server/src/round/prepare.js");
    const { OfflineRoundEnvironment } = prepareModule;
    const report = {};
    const result = async (fn) => {
      try {
        const value = await fn();
        return { ok: true, isEnv: value instanceof OfflineRoundEnvironment };
      } catch (e) {
        return { ok: false, ...errorOf(e), hasCause: e !== null && "cause" in Object(e) };
      }
    };
    const low = (o) => o.outcome === "crash" && o.crashAt < 2;
    const calls = { wrapper: 0, forged: 0 };

    // ---- Runtimes that are not the loader's verified object ---------------------------------
    const runtimes = {
      // The audit's exploit: delegates to the REAL runtime, throws on any unwanted outcome.
      selectiveWrapper: Object.freeze({
        profile: runtime.profile,
        run(d) {
          calls.wrapper += 1;
          const o = runtime.run(d);
          if (!low(o)) throw new Error("unwanted outcome");
          return o;
        },
      }),
      // Same method signatures, its own implementation.
      forged: Object.freeze({
        profile: runtime.profile,
        run(d) {
          calls.forged += 1;
          d.dispose();
          throw new Error("forged runner");
        },
      }),
      frozenCopy: Object.freeze({ ...runtime }),
      prototypeChild: Object.create(runtime),
      proxy: new Proxy(runtime, {}),
      boundDelegate: Object.freeze({ profile: runtime.profile, run: runtime.run.bind(runtime) }),
    };
    report.runtimeShapes = Object.fromEntries(
      Object.entries(runtimes).map(([n, r]) => [
        n,
        typeof r.run === "function" && r.profile === runtime.profile,
      ]),
    );
    report.verifiedFlags = {
      real: runtimeModule.isVerifiedEngineRuntime(runtime),
      ...Object.fromEntries(
        Object.entries(runtimes).map(([n, r]) => [n, runtimeModule.isVerifiedEngineRuntime(r)]),
      ),
    };

    // ---- 1. Direct JavaScript construction (the audit's exact call and variants) -------------
    const sink = probeSink();
    const ctor = {};
    for (const [name, r] of Object.entries(runtimes)) {
      ctor[`legacy:${name}`] = await result(
        () => new OfflineRoundEnvironment("development", crypto, r, sink),
      );
    }
    // Invalid capabilities with otherwise VALID arguments (verified crypto, the real runtime, a
    // supported mode): the capability alone is what refuses them.
    const tokens = {
      undefined: undefined,
      null: null,
      emptyObject: {},
      frozenNullProto: Object.freeze(Object.create(null)),
      symbolFor: Symbol.for("OfflineRoundEnvironment.construct"),
      symbol: Symbol("construct"),
      theClass: OfflineRoundEnvironment,
      theModule: prepareModule,
      crypto,
      runtime,
      string: "CONSTRUCT",
    };
    for (const [name, t] of Object.entries(tokens)) {
      ctor[`token:${name}`] = await result(
        () => new OfflineRoundEnvironment(t, "development", crypto, runtime, sink),
      );
    }
    ctor.reflectConstruct = await result(() =>
      Reflect.construct(OfflineRoundEnvironment, [{}, "test", crypto, runtimes.selectiveWrapper]),
    );
    ctor.subclass = await result(() => {
      class Sub extends OfflineRoundEnvironment {
        constructor() {
          super(undefined, "development", crypto, runtimes.selectiveWrapper, sink);
        }
      }
      return new Sub();
    });
    {
      const real = createOfflineRoundEnvironment({ mode: "development", crypto, runtime });
      ctor.instanceConstructor = await result(
        () => new real.constructor("development", crypto, runtimes.selectiveWrapper, sink),
      );
      real.close();
    }
    report.direct = ctor;

    // ---- 2. The factory and the static create with each non-verified runtime ----------------
    // The capability is valid here, so these reach the constructor's own runtime check.
    const factory = {};
    for (const [name, r] of Object.entries(runtimes)) {
      factory[`factory:${name}`] = await result(() =>
        createOfflineRoundEnvironment({ mode: "development", crypto, runtime: r, audit: sink }),
      );
      factory[`static:${name}`] = await result(() =>
        OfflineRoundEnvironment.create({ mode: "test", crypto, runtime: r, audit: sink }),
      );
    }
    report.factory = factory;

    // ---- 3. Unverified crypto providers (with and without a supplied runtime) ---------------
    const cryptos = {
      copy: { ...crypto },
      fields: { hash: crypto.hash, random: crypto.random },
      prototypeChild: Object.create(crypto),
      proxy: new Proxy(crypto, {}),
    };
    const cryptoResults = {};
    for (const [name, c] of Object.entries(cryptos)) {
      cryptoResults[`withRuntime:${name}`] = await result(() =>
        createOfflineRoundEnvironment({ mode: "development", crypto: c, runtime, audit: sink }),
      );
      cryptoResults[`defaultRuntime:${name}`] = await result(() =>
        createOfflineRoundEnvironment({ mode: "test", crypto: c, audit: sink }),
      );
    }
    report.crypto = cryptoResults;

    // ---- 4. Unsupported modes ----------------------------------------------------------------
    const modes = {};
    for (const [name, m] of Object.entries({
      production: "production",
      capitalised: "Development",
      empty: "",
      undefined: undefined,
      object: { toString: () => "test" },
    })) {
      modes[name] = await result(() =>
        createOfflineRoundEnvironment({ mode: m, crypto, runtime, audit: sink }),
      );
    }
    modes.noOptions = await result(() => createOfflineRoundEnvironment(undefined));
    report.modes = modes;
    report.refusalEvents = sink.events.length;

    // ---- 5. The selective-abort exploit cannot be staged: 30 attempts, every route ----------
    {
      const routes = [
        () => new OfflineRoundEnvironment("development", crypto, runtimes.selectiveWrapper, sink),
        () =>
          createOfflineRoundEnvironment({
            mode: "development",
            crypto,
            runtime: runtimes.selectiveWrapper,
          }),
        () =>
          OfflineRoundEnvironment.create({
            mode: "development",
            crypto,
            runtime: runtimes.selectiveWrapper,
          }),
      ];
      let constructed = 0;
      const codes = new Set();
      for (let k = 0; k < 30; k++) {
        const r = await result(routes[k % routes.length]);
        if (r.ok) constructed += 1;
        else codes.add(`${r.code}:${r.reason}`);
      }
      report.exploit = { attempts: 30, constructed, codes: [...codes].sort(), calls: { ...calls } };
    }

    // ---- 6. Legitimate creation: 30 rounds, every one classified `completed` ----------------
    {
      const okSink = probeSink();
      const env = createOfflineRoundEnvironment({
        mode: "development",
        crypto,
        runtime,
        audit: okSink,
      });
      const { chainId } = await env.createChain({ length: 32 });
      const salt = new Uint8Array(32).fill(9);
      let lowCount = 0;
      for (let k = 0; k < 30; k++) {
        const s = await env.prepareScript(chainId, `legit-${k}`, salt);
        if (low(s.secretContent())) lowCount += 1;
      }
      // `env.audit` is a write-only log with no link to the store or vault: a caller may append
      // well-formed but FALSE events (the documented limitation: not durable, not
      // tamper-evident), and they change no authoritative state.
      const statusBefore = await env.chainStatus(chainId);
      const forgedEvents = [];
      for (const [kind, code] of [
        ["round-classified", "voided"],
        ["round-classified", "aborted"],
        ["chain-transition", "compromised"],
      ]) {
        const r = await result(() =>
          env.audit.append({ kind, operation: "forged", chainId, chainIndex: 1, code }),
        );
        forgedEvents.push(r.ok ? "appended" : r.code);
      }
      const statusAfter = await env.chainStatus(chainId);
      const dispositions = {};
      const secrets = [];
      for (let i = 1; i <= 30; i++) {
        const rv = await env.revealRound(chainId, i);
        dispositions[rv.disposition] = (dispositions[rv.disposition] ?? 0) + 1;
        secrets.push(rv.seed);
      }
      const auditText = JSON.stringify(okSink.events);
      report.auditSink = {
        forgedEvents,
        stateUnchanged: JSON.stringify(statusBefore) === JSON.stringify(statusAfter),
        state: statusAfter.state,
        guarantees: env.audit.guarantees,
        // No revealed seed and no salt ever appeared in an event the environment wrote.
        seedsInAudit: secrets.filter((s) => auditText.includes(s)).length,
        saltInAudit: auditText.includes(bridge.bytesToHex(salt)),
        environmentKeys: [
          ...new Set(okSink.events.filter((e) => e.operation !== "forged").map((e) => e.kind)),
        ].sort(),
      };
      report.legitimate = {
        mode: env.mode,
        dispositions,
        classified: okSink.events.filter(
          (e) => e.kind === "round-classified" && e.operation !== "forged",
        ).length,
        scriptBuilt: okSink.events.filter((e) => e.kind === "script-built").length,
        scriptFailed: okSink.events.filter((e) => e.kind === "script-failed").length,
        lowCount,
        status: (await env.chainStatus(chainId)).state,
      };
      env.close();
    }

    // ---- 6b. The bundle's exports replaced AFTER verification (follow-up to M-2b) ----------
    // The same selective wrapper, installed on the module the loader required. The verified
    // runtime bound its function at load, so the replacement is never reached.
    {
      const enginePath = path.join(out, "engine", "engine.cjs");
      const engineExports = require(enginePath);
      const original = engineExports.runSeededRound;
      const originalError = engineExports.RoundRunnerError;
      let replacedCalls = 0;
      engineExports.runSeededRound = (d) => {
        replacedCalls += 1;
        const o = original(d);
        if (!low(o)) throw new originalError("runner-failed");
        return o;
      };
      engineExports.RoundRunnerError = class Forged extends Error {};
      const replaced =
        engineExports.runSeededRound !== original &&
        require.cache[require.resolve(enginePath)].exports === engineExports;
      const okSink = probeSink();
      const env = createOfflineRoundEnvironment({
        mode: "development",
        crypto,
        runtime,
        audit: okSink,
      });
      const { chainId } = await env.createChain({ length: 32 });
      const salt = new Uint8Array(32).fill(3);
      let built = 0;
      let failed = 0;
      for (let k = 0; k < 30; k++) {
        const r = await result(() => env.prepareScript(chainId, `export-${k}`, salt));
        if (r.ok) built += 1;
        else failed += 1;
      }
      const dispositions = {};
      for (let i = 1; i <= 30; i++) {
        const d = (await env.revealRound(chainId, i)).disposition;
        dispositions[d] = (dispositions[d] ?? 0) + 1;
      }
      const callsDuringRounds = replacedCalls;
      // A runtime loaded AFTER the replacement runs the replaced export: its known answers decide
      // (the wrapper only throws on non-low outcomes, and A7 is a 28.9× floor round).
      let lateLoad;
      try {
        runtimeModule.loadEngineRuntime(crypto);
        lateLoad = { ok: true };
      } catch (e) {
        lateLoad = { ok: false, ...errorOf(e) };
      }
      engineExports.runSeededRound = original;
      engineExports.RoundRunnerError = originalError;
      report.exportReplacement = {
        replaced,
        built,
        failed,
        dispositions,
        callsDuringRounds,
        callsDuringLateLoad: replacedCalls - callsDuringRounds,
        lateLoad,
      };
      env.close();
    }

    // ---- 7. Defaults (no crypto, no runtime) and the development / test distinction ---------
    {
      const testEnv = createOfflineRoundEnvironment({ mode: "test" });
      const vectors = await testEnv.importPublicTestVectorChain();
      const a1 = await testEnv.prepareScript(vectors.chainId, "default-a1", saltBytes("A"));
      const devEnv = createOfflineRoundEnvironment({ mode: "development" });
      const devChain = await devEnv.createChain({ length: 4 });
      report.defaults = {
        testMode: testEnv.mode,
        devMode: devEnv.mode,
        a1DigestEqualsDirect: a1.secretDigest() === direct("A", 1).secretDigest(),
        testRestrict: (await testEnv.restrictChainForTest(vectors.chainId, "suspended")).state,
        devImport: await result(() => devEnv.importPublicTestVectorChain()),
        devRestrict: await result(() => devEnv.restrictChainForTest(devChain.chainId, "suspended")),
        devChainState: (await devEnv.chainStatus(devChain.chainId)).state,
      };
      testEnv.close();
      devEnv.close();
    }

    // ---- 8. Surface: no capability, store, vault or disposition control is reachable --------
    {
      const env = createOfflineRoundEnvironment({ mode: "test", crypto, runtime });
      const proto = Object.getPrototypeOf(env);
      const fake = Object.create(OfflineRoundEnvironment.prototype);
      const fakeCalls = {};
      for (const m of ["prepareScript", "createChain", "chainStatus", "revealRound", "close"]) {
        const r = await result(() => fake[m]("x", "y", new Uint8Array(32)));
        fakeCalls[m] = r.ok ? "accepted" : r.name;
      }
      const text = `${JSON.stringify(env)} ${inspect(env, { showHidden: true, depth: 5 })}`;
      report.surface = {
        moduleExports: Object.keys(prepareModule).sort(),
        classStatics: Object.getOwnPropertyNames(OfflineRoundEnvironment).sort(),
        classSymbols: Object.getOwnPropertySymbols(OfflineRoundEnvironment).length,
        ownKeys: Reflect.ownKeys(env).map(String).sort(),
        methods: Object.getOwnPropertyNames(proto).sort(),
        frozen: Object.isFrozen(env),
        hidden: ["vault", "store", "crypto", "runtime", "requests", "claimed", "construct"].filter(
          (k) => k in env || env[k] !== undefined,
        ),
        disposition: ["classifyRound", "transitionChain", "reserveRound", "prepareRound"].filter(
          (k) => k in env,
        ),
        text,
        fakeCalls,
      };
      env.close();
    }
    report.disposal = disposal();
    emit(report);
  })().catch((e) => {
    process.stderr.write(String(e && e.stack));
    process.exit(1);
  });
  return;
}

// ==== scenario "main" ===========================================================================
const internals = { ...load("qa/game-engine.cjs"), ...load("qa/seeded-round.cjs") };
const referenceRunner = load("qa/reference-runner.cjs");
const { REPLAY_RECORD_PINS } = load("qa/replay-pins.cjs");
const { INDEPENDENT_OUTCOME_VECTORS } = load("qa/independent-vectors.cjs");
const { LocalRoundAuthority } = load("qa/local-authority.cjs");
const engine = load("engine/engine.cjs");

const input = (salt, index) => ({
  fv: 1,
  chainId: bridge.hexToBytes(V.linksHex[0]),
  chainIndex: index,
  salt: saltBytes(salt),
  roundSeed: bridge.SecretBytes.fromBytes(bridge.hexToBytes(V.linksHex[index])),
});
const utf8 = (s) => new TextEncoder().encode(s);
const hashJson = (value) => bridge.bytesToHex(bridge.sha256(hash, utf8(JSON.stringify(value))));

/** The P8-3b reference record, rebuilt from a production RoundScript (same field order). */
function referenceRecordFrom(script) {
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
    // The reference runner's key order (secretContent() is in canonical, sorted key order).
    drawCounts: {
      crash: s.drawCounts.crash,
      jackpot: s.drawCounts.jackpot,
      chests: s.drawCounts.chests,
      world: s.drawCounts.world,
    },
  };
  return { ...body, recordSha256: hashJson(body) };
}

/**
 * INDEPENDENT recorder and encoder: plays the round with the TEST-ONLY GameEngine and
 * SeededRound (separate bundles of the unchanged source), observes it only through engine
 * snapshots (not the runner's render-projection path), and writes the canonical text by hand
 * in the documented key order — no code from round-runner.ts, round-script.ts or canonical.ts.
 */
function independentDigest(salt, index) {
  const round = internals.SeededRound.create(hash, input(salt, index));
  const game = new internals.GameEngine(round.deps);
  let crash = null;
  let jackpot = null;
  let chests = null;
  game.events.on("crashed", (e) => (crash = e.multiplier));
  game.events.on("shipImpact", (e) => (jackpot = e.jackpotMultiplier));
  game.events.on("chestsRevealed", (e) => (chests = e.chests.map((c) => c.multiplier)));
  const M = [];
  const B = [];
  const Y = [];
  const seen = new Map();
  let t = 0;
  let diveStart = null;
  let exitDive = null;
  for (;;) {
    game.advance(1 / 60);
    t += 1;
    const snap = game.snapshot();
    for (const c of snap.world.creatures) {
      if (!seen.has(c.id)) seen.set(c.id, { ...c, spawnTick: t, consumedTick: null });
      const f = seen.get(c.id);
      if (c.consumed && f.consumedTick === null) f.consumedTick = t;
    }
    const st = game.state;
    if (st === "diving") {
      if (diveStart === null) diveStart = t;
      M.push(snap.world.multiplier);
      B.push(snap.world.boost);
      Y.push(snap.world.worldY);
    } else if (diveStart !== null && exitDive === null) {
      exitDive = t;
    }
    if (st === "crashed" || st === "bonus") break;
    if (t > 5000) throw new Error("independent recorder: no milestone");
  }
  const snap = game.snapshot();
  const counts = round.secretDrawCounts();
  round.dispose();
  const floor = chests !== null;
  const n = (x) => (x === null ? "null" : String(x));
  const arr = (xs) => `[${xs.map(n).join(",")}]`;
  const creatures = [...seen.values()]
    .sort((a, b) => a.id - b.id)
    .map(
      (c) =>
        `{"consumedTick":${n(c.consumedTick)},"dir":${c.dir},"id":${c.id},"kind":"${c.kind}",` +
        `"phase":${n(c.phase)},"size":${n(c.size)},"spawnTick":${c.spawnTick},` +
        `"worldY":${n(c.worldY)},"x":${n(c.x)}}`,
    );
  const w = snap.world;
  const text =
    `{"public":{"chainId":"${V.linksHex[0]}","chainIndex":${index},"fv":1,` +
    `"profile":"aquadive-offline-round-runner","profileVersion":1,"salt":"${saltHex(salt)}",` +
    `"scriptVersion":1,"status":"experimental-internal-offline"},` +
    `"secret":{"chests":${floor ? arr(chests) : "null"},` +
    `"crashAt":${n(floor ? snap.round.crashAt : crash)},"creatures":[${creatures.join(",")}],` +
    `"diveStartTick":${diveStart},"drawCounts":{"chests":${counts.chests},"crash":${counts.crash},` +
    `"jackpot":${counts.jackpot},"world":${counts.world}},"exitDiveTick":${exitDive},` +
    `"final":{"boost":${n(w.boost)},"multiplier":${n(w.multiplier)},` +
    `"nextCreatureId":${w.nextCreatureId},"nextSpawnAt":${n(w.nextSpawnAt)},"worldY":${n(w.worldY)}},` +
    `"impactTick":${floor ? exitDive : "null"},"jackpot":${n(jackpot)},` +
    `"outcome":"${floor ? "floor" : "crash"}",` +
    `"samples":{"boost":${arr(B)},"multiplier":${arr(M)},"worldY":${arr(Y)}},` +
    `"terminalTick":${t}}}`;
  const tagged = utf8("AQUADIVE-ROUNDSCRIPT\u0000v1\u0000" + text);
  return { digest: bridge.bytesToHex(bridge.sha256(hash, tagged)), length: text.length };
}

/** Every string rendering of a value an accident could produce. */
const views = (x) => [
  JSON.stringify(x),
  String(x),
  `${x}`,
  inspect(x, { depth: Infinity, showHidden: true, getters: true }),
  inspect(x, { depth: Infinity, colors: false, customInspect: false, showHidden: true }),
  JSON.stringify(Object.getOwnPropertyNames(x)),
];

/** Distinctive secret strings of a script (and its round seed). */
function secretsOf(script, seedHex) {
  const s = script.secretContent();
  const xs = [
    script.secretDigest(),
    String(s.crashAt),
    s.crashAt.toFixed(4),
    String(s.final.nextSpawnAt),
    String(s.samples.worldY[Math.min(50, s.samples.worldY.length - 1)]),
    String(s.samples.multiplier[s.samples.multiplier.length - 1]),
    JSON.stringify(s.drawCounts),
    `"terminalTick":${s.terminalTick}`,
  ];
  if (s.creatures[0]) xs.push(String(s.creatures[0].x));
  if (s.jackpot !== null) xs.push(String(s.jackpot));
  if (seedHex) xs.push(seedHex, seedHex.slice(0, 16));
  return xs.filter((x) => x.length >= 4);
}

(async () => {
  const report = {};
  const errorsSeen = [];
  const note = (e) => {
    if (e) errorsSeen.push(e);
    return e === null ? null : errorOf(e);
  };

  // ---- Export surface and profile ----------------------------------------------------------
  report.exports = Object.fromEntries(
    Object.keys(engine)
      .sort()
      .map((k) => [k, typeof engine[k]]),
  );
  report.profile = {
    bundle: canonical.canonicalJson(engine.ROUND_RUNNER_PROFILE),
    expected: canonical.canonicalJson(
      load("server/src/round/engine-types.js").EXPECTED_RUNNER_PROFILE,
    ),
    runtimeFrozen: Object.isFrozen(runtime),
    verified: runtimeModule.isVerifiedEngineRuntime(runtime),
    fakeVerified: runtimeModule.isVerifiedEngineRuntime({ ...runtime }),
  };

  // ---- Known answers vs the independent vectors --------------------------------------------
  // The P8-3b vectors and the independent recorder cover the development chain; the "kat-v1"
  // known answers (P8-4a-1) are checked against their generator in the "vectors" scenario.
  report.knownAnswers = knownAnswers.ROUND_SCRIPT_KNOWN_ANSWERS.filter(
    (a) => a.chain === "dev-v1",
  ).map((a) => {
    const v = INDEPENDENT_OUTCOME_VECTORS.find((x) => x.salt === a.salt && x.index === a.index);
    const script = direct(a.salt, a.index);
    return {
      key: `${a.salt}${a.index}`,
      matchesVector:
        a.crashAt === v.crashAt &&
        a.crashDraws === v.crashDraws &&
        a.jackpot === v.jackpot &&
        JSON.stringify(a.chests) === JSON.stringify(v.chests) &&
        JSON.stringify(a.firstCreatures) === JSON.stringify(v.world.creatures),
      outcome: script.secretContent().outcome,
      digest: script.secretDigest(),
      digestCandidate: a.digestCandidate,
      independentDigest: independentDigest(a.salt, a.index).digest,
    };
  });
  report.knownAnswerStatus = knownAnswers.KNOWN_ANSWER_DIGEST_STATUS;

  // ---- All 16 replay pins through the vault pipeline and the production runner -------------
  const pinMap = new Map(REPLAY_RECORD_PINS.map(([s, i, h]) => [`${s}${i}`, h]));
  const envs = {};
  const scripts = new Map();
  report.pins = [];
  for (const salt of ["A", "B"]) {
    const sink = probeSink();
    const env = createOfflineRoundEnvironment({ mode: "test", crypto, runtime, audit: sink });
    const chain = await env.importPublicTestVectorChain();
    envs[salt] = { env, sink, chainId: chain.chainId };
    for (let i = 1; i <= 8; i++) {
      const script = await env.prepareScript(chain.chainId, `pin-${salt}-${i}`, saltBytes(salt));
      scripts.set(`${salt}${i}`, script);
      const rebuilt = referenceRecordFrom(script);
      const reference = referenceRunner.runReferenceRoundFromInput(hash, input(salt, i)).record;
      report.pins.push({
        key: `${salt}${i}`,
        chainIndex: script.public.chainIndex,
        pin: pinMap.get(`${salt}${i}`),
        rebuiltRecordSha256: rebuilt.recordSha256,
        referenceRecordSha256: reference.recordSha256,
        sameRecord: JSON.stringify(rebuilt) === JSON.stringify(reference),
        digest: script.secretDigest(),
        directDigest: direct(salt, i).secretDigest(),
        independentDigest: independentDigest(salt, i).digest,
        outcome: script.secretContent().outcome,
        terminalTick: script.secretContent().terminalTick,
        samples: script.secretContent().samples.multiplier.length,
        bytes: script.secretCanonicalBytes().length,
      });
    }
  }
  // Reversed order (runtime, no chain needed): same digests.
  report.reversed = [...PINS].reverse().map(([s, i]) => [`${s}${i}`, direct(s, i).secretDigest()]);

  // ---- Production runner output is plain frozen data; no object of the round escapes --------
  {
    const raw = engine.runSeededRound(bridge.RoundDerivation.create(hash, input("A", 7)));
    const problems = [];
    const walk = (v, p) => {
      if (typeof v === "function") problems.push(`${p}: function`);
      if (v === null || typeof v !== "object") return;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== Array.prototype) problems.push(`${p}: class`);
      if (!Object.isFrozen(v)) problems.push(`${p}: not frozen`);
      for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`);
    };
    walk(raw, "output");
    let refusal = null;
    try {
      engine.runSeededRound({ fv: 1, chainIndex: 1, openStream() {}, dispose() {} });
    } catch (e) {
      refusal = errorOf(e);
    }
    report.production = { problems, keys: Object.keys(raw).sort(), foreignDerivation: refusal };
  }

  // ---- Audit trail of one environment ------------------------------------------------------
  report.audit = envs.A.sink.events.map((e) => [e.kind, e.operation, e.chainIndex, e.code]);

  // ---- Reveal → offline verification, and tamper detection ---------------------------------
  {
    const { env, chainId } = envs.A;
    const reveal7 = await env.revealRound(chainId, 7);
    const reveal6 = await env.revealRound(chainId, 6);
    const s7 = scripts.get("A7");
    const ok = await env.verifyScript(s7, reveal7);
    const wrongRound = note(await capture(() => env.verifyScript(s7, reveal6)));
    const forged = note(
      await capture(() =>
        env.verifyScript(s7, {
          ...reveal7,
          seed: reveal6.seed,
          previousLink: reveal6.previousLink,
        }),
      ),
    );
    const badLink = note(
      await capture(() => env.verifyScript(s7, { ...reveal7, previousLink: reveal6.previousLink })),
    );
    // A seed that is not on the chain at all (its own link is consistent).
    const offChainSeed = bridge.hexToBytes("11".repeat(32));
    const offChain = note(
      await capture(() =>
        env.verifyScript(s7, {
          ...reveal7,
          seed: "11".repeat(32),
          previousLink: bridge.bytesToHex(bridge.sha256(hash, offChainSeed)),
        }),
      ),
    );
    const otherSalt = note(await capture(() => env.verifyScript(s7, { ...reveal7, salt: null })));
    // Tampered copies: valid shape, altered values.
    const text = new TextDecoder().decode(s7.secretCanonicalBytes());
    const s = s7.secretContent();
    const sub = (t, a, b) => {
      if (t.split(a).length !== 2) throw new Error(`tamper anchor not unique: ${a}`);
      return t.replace(a, b);
    };
    // One multiplier sample, nudged by one part in 10^9 (still in range, still below crashAt).
    const multipliers = s.samples.multiplier;
    const k = 100;
    const list = (xs) => `"multiplier":[${xs.map(String).join(",")}]`;
    const nudged = multipliers.map((m, i) => (i === k ? m * (1 + 1e-9) : m));
    const c5 = s.creatures[4];
    const variants = {
      multiplierSample: sub(text, list(multipliers), list(nudged)),
      salt: sub(text, `"salt":"${s7.public.salt}"`, `"salt":"${"00".repeat(32)}"`),
      creatureSize: sub(text, `"size":${c5.size}`, `"size":${c5.size === 1 ? 1.1 : 1}`),
      chest: sub(
        text,
        `"chests":[${s.chests.join(",")}]`,
        `"chests":[${[...s.chests].reverse().join(",")}]`,
      ),
    };
    const tamper = {};
    for (const [name, t] of Object.entries(variants)) {
      const bytes = utf8(t);
      const parsed = roundScript.parseRoundScript(hash, bytes);
      const withDigest = note(
        await capture(() => roundScript.parseRoundScript(hash, bytes, s7.secretDigest())),
      );
      const v = await env.verifyScript(parsed, reveal7);
      tamper[name] = { match: v.match, alteredFields: v.alteredFields, withDigest };
    }
    tamper.sampleIndex = k;
    // Structurally invalid copies are refused outright.
    const invalid = {
      negativeZero: sub(text, `"worldY":[0,`, `"worldY":[-0,`),
      nan: sub(text, `"crashAt":${s.crashAt}`, `"crashAt":NaN`),
      whitespace: text.replace('{"public"', '{ "public"'),
      extraKey: text.replace('{"public"', '{"extra":1,"public"'),
      reorderedKeys: text.replace(
        `"scriptVersion":1,"status":"experimental-internal-offline"`,
        `"status":"experimental-internal-offline","scriptVersion":1`,
      ),
      outOfRange: sub(text, `"diveStartTick":300`, `"diveStartTick":299`),
      tickBound: sub(
        text,
        `"terminalTick":${s.terminalTick}`,
        `"terminalTick":${s.terminalTick + 1}`,
      ),
    };
    const invalidResults = {};
    for (const [name, t] of Object.entries(invalid)) {
      invalidResults[name] = note(await capture(() => roundScript.parseRoundScript(hash, utf8(t))));
    }
    const roundTrip = roundScript.parseRoundScript(
      hash,
      s7.secretCanonicalBytes(),
      s7.secretDigest(),
    );
    report.verify = {
      ok,
      wrongRound,
      forged,
      badLink,
      offChain,
      otherSalt,
      tamper,
      invalid: invalidResults,
      roundTripDigest: roundTrip.secretDigest() === s7.secretDigest(),
      roundTripVerifies: (await env.verifyScript(roundTrip, reveal7)).match,
    };
  }

  // ---- Chain states: unavailable, suspended, compromised, exhausted, closed ----------------
  // Test mode: the one-way chain restriction is a test-mode-only delegate (M-2).
  {
    const sink = probeSink();
    const env = createOfflineRoundEnvironment({
      mode: "test",
      crypto,
      runtime,
      audit: sink,
    });
    const salt = saltBytes("A");
    const suspended = (await env.createChain({ length: 16 })).chainId;
    await env.restrictChainForTest(suspended, "suspended");
    const compromised = (await env.createChain({ length: 16 })).chainId;
    await env.restrictChainForTest(compromised, "compromised");
    const short = (await env.createChain({ length: 2 })).chainId;
    const states = {
      unknownChain: note(await capture(() => env.prepareScript("ab".repeat(32), "u-1", salt))),
      malformedChainId: note(await capture(() => env.prepareScript("not-a-chain", "u-2", salt))),
      suspended: note(await capture(() => env.prepareScript(suspended, "s-1", salt))),
      compromised: note(await capture(() => env.prepareScript(compromised, "c-1", salt))),
      badSalt: note(await capture(() => env.prepareScript(short, "b-1", new Uint8Array(4)))),
      badRequestId: note(await capture(() => env.prepareScript(short, "has space", salt))),
    };
    await env.prepareScript(short, "e-1", salt);
    await env.prepareScript(short, "e-2", salt);
    states.exhausted = note(await capture(() => env.prepareScript(short, "e-3", salt)));
    states.replayedRequest = note(await capture(() => env.prepareScript(short, "e-1", salt)));
    // Suspended / compromised DURING the preparation (after the reservation): an audit hook
    // changes the chain state synchronously when the index is reserved.
    const midChain = {};
    for (const to of ["suspended", "compromised"]) {
      const hookSink = probeSink();
      const env2 = createOfflineRoundEnvironment({
        mode: "test",
        crypto,
        runtime,
        audit: hookSink,
      });
      const id = (await env2.createChain({ length: 16 })).chainId;
      let fired = false;
      hookSink.append = ((append) =>
        function (event) {
          append.call(this, event);
          if (event.kind === "index-reserved" && !fired) {
            fired = true;
            void env2.restrictChainForTest(id, to).catch(() => {});
          }
        })(hookSink.append);
      const error = note(await capture(() => env2.prepareScript(id, "m-1", salt)));
      midChain[to] = {
        error,
        classified: hookSink.events
          .filter((e) => e.kind === "round-classified")
          .map((e) => [e.chainIndex, e.code]),
        scriptFailed: hookSink.events.filter((e) => e.kind === "script-failed").map((e) => e.code),
      };
      env2.close();
    }
    states.midChain = midChain;
    env.close();
    states.closed = note(await capture(() => env.prepareScript(short, "z-1", salt)));
    states.closedVerify = note(await capture(() => env.verifyScript(scripts.get("A1"), {})));
    states.failedEvents = sink.events
      .filter((e) => e.kind === "script-failed")
      .map((e) => [e.chainIndex, e.code]);
    report.states = states;
  }

  // ---- Concurrency: parallel preparations on one development chain -------------------------
  {
    const sink = probeSink();
    const env = createOfflineRoundEnvironment({
      mode: "development",
      crypto,
      runtime,
      audit: sink,
    });
    const id = (await env.createChain({ length: 64 })).chainId;
    const N = 24;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => env.prepareScript(id, `conc-${i}`, saltBytes("B"))),
    );
    const ok = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const same = await Promise.allSettled([
      env.prepareScript(id, "same-id", saltBytes("A")),
      env.prepareScript(id, "same-id", saltBytes("A")),
    ]);
    // Reveal every index in order and verify each script offline.
    const verified = [];
    for (const s of [...ok].sort((a, b) => a.public.chainIndex - b.public.chainIndex)) {
      const reveal = await env.revealRound(id, s.public.chainIndex);
      verified.push((await env.verifyScript(s, reveal)).match);
    }
    report.concurrency = {
      fulfilled: ok.length,
      indices: ok.map((s) => s.public.chainIndex).sort((a, b) => a - b),
      distinctDigests: new Set(ok.map((s) => s.secretDigest())).size,
      sameRequest: same.map((r) => (r.status === "fulfilled" ? "ok" : errorOf(r.reason).code)),
      verified,
      built: sink.events.filter((e) => e.kind === "script-built").length,
    };
    env.close();
  }

  // ---- Failure injection through the audit sink --------------------------------------------
  {
    const inject = {};
    const cases = {
      derivationIssued: (e) => e.kind === "derivation-issued",
      roundClassified: (e) => e.kind === "round-classified" && e.code === "completed",
      scriptBuilt: (e) => e.kind === "script-built",
      everything: (e) =>
        e.kind === "derivation-issued" ||
        e.kind.startsWith("script-") ||
        e.kind === "round-classified",
    };
    for (const [name, failOn] of Object.entries(cases)) {
      const sink = probeSink(failOn);
      const env = createOfflineRoundEnvironment({ mode: "test", crypto, runtime, audit: sink });
      const id = (await env.importPublicTestVectorChain()).chainId;
      const before = disposal();
      const error = note(await capture(() => env.prepareScript(id, `inj-${name}`, saltBytes("A"))));
      const after = disposal();
      inject[name] = {
        error,
        classified: sink.events.filter((e) => e.kind === "round-classified").map((e) => e.code),
        scriptEvents: sink.events
          .filter((e) => e.kind.startsWith("script-"))
          .map((e) => [e.kind, e.code]),
        newDerivations: after.derivations - before.derivations,
        liveDerivations: after.liveDerivations,
        liveKeys: after.liveKeys,
      };
      env.close();
    }
    // A runtime that did not come from the loader, and an invalid mode.
    inject.fakeRuntime = errorOf(
      await capture(() =>
        createOfflineRoundEnvironment({ mode: "test", crypto, runtime: { ...runtime } }),
      ),
    );
    inject.productionMode = errorOf(
      await capture(() => createOfflineRoundEnvironment({ mode: "production", crypto, runtime })),
    );
    const env = createOfflineRoundEnvironment({ mode: "development", crypto, runtime });
    inject.importInDevelopment = errorOf(await capture(() => env.importPublicTestVectorChain()));
    env.close();
    // NODE_ENV=production: the development store refuses, so the environment does.
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    inject.nodeEnvProduction = errorOf(
      await capture(() => createOfflineRoundEnvironment({ mode: "test", crypto, runtime })),
    );
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    report.inject = inject;
  }

  // ---- Audit codes: the fixed list equals the error codes; free text is refused -------------
  {
    const refused = (event) => {
      try {
        auditModule.assertAuditEvent(event);
        return false;
      } catch {
        return true;
      }
    };
    const base = {
      kind: "script-failed",
      operation: "prepare-script",
      chainId: null,
      chainIndex: null,
    };
    report.auditRules = {
      codes: [...auditModule.SCRIPT_FAILURE_CODES].sort(),
      freeCode: refused({ ...base, code: "crash-at-1-45" }),
      nullFailure: refused({ ...base, code: null }),
      builtWithCode: refused({
        ...base,
        kind: "script-built",
        chainId: V.linksHex[0],
        chainIndex: 1,
        code: "x",
      }),
      otherOperation: refused({ ...base, operation: "prepare-round", code: "script-invalid" }),
      accepted: !refused({ ...base, code: "script-invalid" }),
    };
    report.errorCodes = Object.keys(errorsModule).sort();
  }

  // ---- Redaction: renderings of scripts, environments, the runtime and every error ----------
  {
    const leaks = [];
    for (const [key, script] of scripts) {
      const index = script.public.chainIndex;
      const secrets = secretsOf(
        script,
        key.startsWith("A") || key.startsWith("B") ? V.linksHex[index] : null,
      );
      for (const v of views(script)) {
        for (const x of secrets) if (v.includes(x)) leaks.push(`${key}: ${x.slice(0, 12)}`);
      }
    }
    const all = [...scripts.values()].flatMap((s) => secretsOf(s, null));
    const errorTexts = errorsSeen.flatMap((e) => [
      e.message,
      e.stack,
      JSON.stringify(e),
      inspect(e, { depth: Infinity, showHidden: true }),
    ]);
    for (const t of errorTexts)
      for (const x of all) if (t.includes(x)) leaks.push(`error: ${x.slice(0, 12)}`);
    const otherTexts = [
      ...views(envs.A.env),
      ...views(runtime),
      JSON.stringify(envs.A.sink.events),
      JSON.stringify(envs.B.sink.events),
    ];
    for (const t of otherTexts)
      for (const x of all) if (t.includes(x)) leaks.push(`other: ${x.slice(0, 12)}`);
    const s7 = scripts.get("A7");
    report.redaction = {
      leaks,
      json: JSON.stringify(s7),
      string: String(s7),
      inspect: inspect(s7),
      ownKeys: Reflect.ownKeys(s7).map(String),
      frozen:
        Object.isFrozen(s7) && Object.isFrozen(s7.public) && Object.isFrozen(s7.secretContent()),
      deepFrozen:
        Object.isFrozen(s7.secretContent().samples.boost) &&
        Object.isFrozen(s7.secretContent().creatures[0]),
      bytesAreCopies: s7.secretCanonicalBytes() !== s7.secretCanonicalBytes(),
      errorCount: errorsSeen.length,
      errorsWithCause: errorsSeen.filter((e) => e.cause !== undefined).length,
    };
  }

  // ---- The analytic tick bound, through the TEST-ONLY engine with a goldfish-free world -----
  {
    const constant = (v) => ({ next: () => v });
    const game = new internals.GameEngine({
      // crash: r = u = 0.999 → 0.99 / 0.001 → clamped to 200 (never reached); world: r = 0 →
      // never a goldfish (no boost), x = 0.1.
      authority: new LocalRoundAuthority(constant(0.999)),
      worldRng: constant(0),
    });
    let impact = null;
    let bonus = null;
    game.events.on("shipImpact", () => (impact = game.tickCount));
    game.events.on("chestsRevealed", () => (bonus = game.tickCount));
    while (bonus === null && game.tickCount < 5000) game.advance(1 / 60);
    report.bound = {
      impactTick: impact,
      terminalTick: bonus,
      analyticMaxDiveTicks: roundScript.ANALYTIC_MAX_DIVE_TICKS,
      analyticMaxTerminalTick: roundScript.ANALYTIC_MAX_TERMINAL_TICK,
    };
  }

  for (const { env } of Object.values(envs)) env.close();
  report.offlineDisposition = OFFLINE_DISPOSITION;
  report.disposal = disposal();
  report.loaded = Object.keys(require.cache)
    .filter((f) => f.startsWith(out + path.sep))
    .map(rel)
    .sort();
  // P8-4a-1: the protected modules this whole run loaded (the runtime closure) and the bundle.
  {
    const { PROTECTED_PATH } = load("server/src/round/integrity.js");
    report.closure = report.loaded.filter((p) => PROTECTED_PATH.test(p));
    report.bundleSha256 = require("node:crypto")
      .createHash("sha256")
      .update(require("node:fs").readFileSync(path.join(out, "engine", "engine.cjs")))
      .digest("hex");
  }
  emit(report);
})().catch((e) => {
  process.stderr.write(String(e && e.stack));
  process.exit(1);
});
