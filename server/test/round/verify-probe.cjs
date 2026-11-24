// Corpus generator of the P8-4b-1 differential verification test. TEST ONLY; run by
// verify-differential.test.ts in a fresh Node process on a server build:
//
//   node verify-probe.cjs <server build dir> <output dir> <random rounds>
//
// Writes <output dir>/corpus.bin (each script: 4-byte little-endian length, canonical bytes) and
// <output dir>/corpus.json ({ entries: [{ kind, key, digest, bytes }], … }); prints a JSON summary
// on stdout and nothing else. Kinds:
//
//   pin     the 16 replay pins (public fv = 1 vector chain, salts A and B, indices 1 … 8), prepared
//           through the offline environment exactly as the worker prepares them
//   vector  the 45 independent known-answer vectors (dev-v1 and kat-v1 chains): the production
//           runner's output for each, checked against the committed independent record digest,
//           encoded as a RoundScript
//   random  fresh rounds of a random development chain (random salts), prepared in process
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { pathToFileURL } = require("node:url");

const out = path.resolve(process.argv[2]);
const dir = path.resolve(process.argv[3]);
const randomCount = Number(process.argv[4] ?? 0);
const load = (rel) => require(path.join(out, rel));

const bridge = load("server/src/fairness.js");
const { createNodeFairnessCrypto } = load("server/src/fairness/crypto-node.js");
const runtimeModule = load("server/src/round/engine-runtime.js");
const { buildRoundScript } = load("server/src/round/round-script.js");
const { createOfflineRoundEnvironment } = load("server/src/round/prepare.js");

(async () => {
  const crypto = createNodeFairnessCrypto();
  const hash = crypto.hash;
  const entries = [];
  const chunks = [];
  const add = (kind, key, script, extra = {}) => {
    const bytes = script.secretCanonicalBytes();
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length);
    chunks.push(len, Buffer.from(bytes));
    entries.push({ kind, key, digest: script.secretDigest(), bytes: bytes.length, ...extra });
  };

  // ---- 16 replay pins ----------------------------------------------------------------------
  const V = bridge.FAIRNESS_DEV_VECTORS_V1;
  for (const salt of ["A", "B"]) {
    const env = createOfflineRoundEnvironment({ mode: "test", crypto });
    const chain = await env.importPublicTestVectorChain();
    for (let i = 1; i <= 8; i++) {
      const s = await env.prepareScript(
        chain.chainId,
        `pin-${salt}-${i}`,
        bridge.hexToBytes(salt === "A" ? V.saltAHex : V.saltBHex),
      );
      add("pin", `${salt}${i}`, s, { chainIndex: s.public.chainIndex });
    }
    env.close();
  }

  // ---- 45 independent vectors --------------------------------------------------------------
  const runtime = runtimeModule.loadEngineRuntime(crypto);
  const independent = path.join(__dirname, "..", "independent");
  const g = await import(pathToFileURL(path.join(independent, "generate-vectors.mjs")).href);
  const committed = require(path.join(independent, "vectors-v1.json"));
  const { dev, kat, salts } = g.chains();
  for (const v of committed.vectors) {
    const links = v.set === "dev-v1" ? dev : kat;
    const seed = bridge.SecretBytes.fromBytes(new Uint8Array(links[v.index]));
    const derivation = bridge.RoundDerivation.create(hash, {
      fv: 1,
      chainId: new Uint8Array(links[0]),
      chainIndex: v.index,
      salt: new Uint8Array(salts[v.salt]),
      roundSeed: seed,
    });
    seed.dispose();
    const output = runtime.run(derivation);
    const script = buildRoundScript(
      hash,
      {
        chainId: bridge.bytesToHex(new Uint8Array(links[0])),
        chainIndex: v.index,
        salt: bridge.bytesToHex(new Uint8Array(salts[v.salt])),
      },
      output,
    );
    add("vector", `${v.set}:${v.salt}${v.index}`, script, {
      recordDigestMatches: runtimeModule.referenceRecordDigest(hash, output) === v.recordDigest,
    });
  }

  // ---- fresh random rounds -----------------------------------------------------------------
  const t0 = performance.now();
  if (randomCount > 0) {
    const env = createOfflineRoundEnvironment({ mode: "development", crypto });
    const chain = await env.createChain({ length: randomCount });
    for (let i = 1; i <= randomCount; i++) {
      add("random", `r${i}`, await env.prepareScript(chain.chainId, `rnd-${i}`, randomBytes(32)));
    }
    env.close();
  }
  const randomMs = performance.now() - t0;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "corpus.bin"), Buffer.concat(chunks));
  const sizes = entries.map((e) => e.bytes).sort((a, b) => a - b);
  const summary = {
    pins: entries.filter((e) => e.kind === "pin").length,
    vectors: entries.filter((e) => e.kind === "vector").length,
    random: entries.filter((e) => e.kind === "random").length,
    vectorRecordsMatch: entries.filter((e) => e.recordDigestMatches === true).length,
    bytes: { min: sizes[0], median: sizes[sizes.length >> 1], max: sizes[sizes.length - 1] },
    randomMs: Math.round(randomMs),
  };
  fs.writeFileSync(path.join(dir, "corpus.json"), JSON.stringify({ summary, entries }));
  process.stdout.write(JSON.stringify(summary));
})().catch((e) => {
  process.stderr.write(`verify-probe failed: ${e && e.stack}\n`);
  process.exitCode = 1;
});
