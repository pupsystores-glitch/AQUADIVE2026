// Loader of the engine bundle's sealed round runner (P8-4a; owner decisions K1, K2, K10, K12).
// PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Nothing in the application startup, the HTTP routes
// or the WebSocket gateway imports this module (a boundary test checks it).
//
// `loadEngineRuntime(crypto)` loads the bundle from ONE fixed location next to the compiled
// server — <build>/engine/engine.cjs, resolved from this file's own compiled location
// (<build>/server/src/round/) — and accepts no path from anyone. Before it hands out a runtime it
// fails closed unless:
//
// 0. (P8-4a-1, integrity.ts) BEFORE the bundle is loaded, the build matches the TRUSTED integrity
//    manifest (<server package>/integrity/engine-manifest.json, outside the build): exactly the
//    protected files, each with its recorded size and SHA-256 (`runtime-integrity-failed`);
// 1. the module exports exactly the approved surface (`ROUND_RUNNER_PROFILE`, `RoundRunnerError`,
//    `runSeededRound`; K2) with the right types;
// 2. its construction profile is exactly the expected one (K12);
// 3. the fairness module the bundle itself required is the server's one instance: every loaded
//    module that exports a `RoundDerivation` or `SecretBytes` exports the bridge's own class
//    (a second copy — another path, or on Windows another drive-letter case — is refused);
// 3a. (P8-4a-1) every loaded protected module is the manifest's file at its exact path (no
//    other spelling, no duplicate instance, nothing unexpected; `runtime-integrity-failed`);
// 4. the known-answer vectors (known-answers.ts) reproduce: the independent values and record
//    digests of the public development and known-answer chains, and the RoundScript digest
//    candidates — REGRESSION checks, not authentication;
// 5. (P8-4a-1) the protected files still match the manifest after loading and the known answers.
//
// Steps 0 and 5 do not make check and use atomic (integrity.ts, server/README.md §15).
//
// Errors carry fixed codes only. Loading runs the bundle's top-level code once per process (the
// module cache keeps one instance). Synchronous: offline precomputation only (K10).

import { join } from "node:path";
import {
  FAIRNESS_DEV_VECTORS_V1,
  RoundDerivation,
  SecretBytes,
  bytesToHex,
  hexToBytes,
  sha256,
  type FairnessHashProvider,
} from "../fairness";
import { isVerifiedFairnessCrypto, type NodeFairnessCrypto } from "../fairness/crypto-node";
import { canonicalJson } from "./canonical";
import {
  assertLoadedClosure,
  readTrustedManifest,
  verifyBuildIntegrity,
  type IntegrityManifest,
} from "./integrity";
import {
  ENGINE_BUNDLE_EXPORTS,
  EXPECTED_RUNNER_PROFILE,
  RUNNER_ERROR_CODES,
  type EngineBundleModule,
  type RunnerOutput,
  type RunnerProfile,
} from "./engine-types";
import { RoundScriptError } from "./errors";
import {
  KNOWN_ANSWER_CHAIN_V1,
  REFERENCE_RECORD_DOMAIN,
  ROUND_SCRIPT_KNOWN_ANSWERS,
  type RoundScriptKnownAnswer,
} from "./known-answers";
import { buildRoundScript, validateRunnerOutput, type RoundScript } from "./round-script";

/** The bundle's path relative to the compiled server build (`ENGINE_BUNDLE` of the build). */
export const ENGINE_BUNDLE_LOCATION = "engine/engine.cjs";

export interface EngineRuntime {
  readonly profile: RunnerProfile;
  /**
   * Plays one round from `derivation` in the sealed runner and returns its validated, detached,
   * deeply frozen result (SECRET until the reveal). Takes ownership of the derivation: it is
   * disposed on every path. Throws `RoundScriptError` (`runner-failed` / `script-invalid`).
   */
  run(derivation: RoundDerivation): RunnerOutput;
}

const verified = new WeakSet<object>();

/** True only for runtimes returned by `loadEngineRuntime`. */
export function isVerifiedEngineRuntime(runtime: unknown): runtime is EngineRuntime {
  return typeof runtime === "object" && runtime !== null && verified.has(runtime);
}

/** The fixed bundle path: <build>/engine/engine.cjs from <build>/server/src/round/. */
function bundlePath(): string {
  return join(__dirname, "..", "..", "..", ...ENGINE_BUNDLE_LOCATION.split("/"));
}

function loadModule(path: string): { exports: unknown; module: NodeJS.Module | undefined } {
  try {
    // The loader's one load of the bundle, from its fixed location only (K1, K3).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exports: unknown = require(path);
    return { exports, module: require.cache[require.resolve(path)] };
  } catch {
    throw new RoundScriptError("runtime-unavailable");
  }
}

function assertSurface(exports: unknown): asserts exports is EngineBundleModule {
  if (typeof exports !== "object" || exports === null) {
    throw new RoundScriptError("runtime-incompatible");
  }
  const keys = Object.keys(exports).sort();
  const m = exports as Record<string, unknown>;
  if (
    keys.join(",") !== [...ENGINE_BUNDLE_EXPORTS].join(",") ||
    typeof m.runSeededRound !== "function" ||
    typeof m.RoundRunnerError !== "function" ||
    typeof m.ROUND_RUNNER_PROFILE !== "object" ||
    m.ROUND_RUNNER_PROFILE === null ||
    !Object.isFrozen(m.ROUND_RUNNER_PROFILE)
  ) {
    throw new RoundScriptError("runtime-incompatible");
  }
  let profile: string;
  try {
    profile = canonicalJson(m.ROUND_RUNNER_PROFILE);
  } catch {
    throw new RoundScriptError("runtime-incompatible");
  }
  if (profile !== canonicalJson(EXPECTED_RUNNER_PROFILE)) {
    throw new RoundScriptError("runtime-incompatible");
  }
}

/** Every loaded fairness export must be the bridge's own class (one instance per process). */
function assertOneFairnessInstance(bundle: NodeJS.Module | undefined): void {
  const children = bundle?.children ?? [];
  const fairness = children.filter(
    (c) => typeof (c.exports as { RoundDerivation?: unknown })?.RoundDerivation === "function",
  );
  if (bundle === undefined || fairness.length !== 1) {
    throw new RoundScriptError("runtime-duplicate-fairness");
  }
  for (const m of Object.values(require.cache)) {
    const e = m?.exports as { RoundDerivation?: unknown; SecretBytes?: unknown } | undefined;
    if (e === null || typeof e !== "object") continue;
    if (
      (typeof e.RoundDerivation === "function" && e.RoundDerivation !== RoundDerivation) ||
      (typeof e.SecretBytes === "function" && e.SecretBytes !== SecretBytes)
    ) {
      throw new RoundScriptError("runtime-duplicate-fairness");
    }
  }
}

/** The loader's own compiled location in the build. */
export const LOADER_LOCATION = "server/src/round/engine-runtime.js";

/** Files every trusted manifest must name (the runtime cannot load without them). */
export const REQUIRED_PROTECTED_FILES = Object.freeze([
  ENGINE_BUNDLE_LOCATION,
  LOADER_LOCATION,
  "server/src/round/integrity.js",
  "server/src/round/prepare.js",
  "server/src/fairness.js",
  "src/fairness/index.js",
]);

/** The build directory: <build> of <build>/server/src/round/engine-runtime.js. */
function buildRoot(): string {
  return join(__dirname, "..", "..", "..");
}

/** A known answer's round: its public chain, salt and index. */
export type KnownAnswerInput = Pick<RoundScriptKnownAnswer, "salt" | "index"> & {
  /** Default "dev-v1". */
  readonly chain?: RoundScriptKnownAnswer["chain"];
};

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const knownAnswerFailed = (): never => {
  throw new RoundScriptError("runtime-known-answer-failed");
};

/**
 * The public chain id, salt and round seed of a known answer. "kat-v1" is derived from its public
 * phrases (2,048 hashes) and checked against the pinned chain id and salt C.
 */
function knownAnswerChain(
  provider: FairnessHashProvider,
  input: KnownAnswerInput,
): { chainIdHex: string; saltHex: string; seed: Uint8Array } {
  const V = FAIRNESS_DEV_VECTORS_V1;
  const index = input.index;
  if ((input.chain ?? "dev-v1") === "dev-v1") {
    if (input.salt === "C" || !Number.isInteger(index) || index < 1 || index > V.chainLength) {
      return knownAnswerFailed();
    }
    return {
      chainIdHex: V.linksHex[0]!,
      saltHex: input.salt === "A" ? V.saltAHex : V.saltBHex,
      seed: hexToBytes(V.linksHex[index]!),
    };
  }
  const K = KNOWN_ANSWER_CHAIN_V1;
  if (!Number.isInteger(index) || index < 1 || index > K.length) return knownAnswerFailed();
  let link = sha256(provider, ascii(K.seedPhrase)); // links[length]
  let seed: Uint8Array | null = null;
  for (let i = K.length; i > 0; i--) {
    if (i === index) seed = link.slice();
    link = sha256(provider, link); // links[i − 1]
  }
  if (seed === null || bytesToHex(link) !== K.chainIdHex) return knownAnswerFailed();
  let saltHex: string;
  if (input.salt === "C") {
    saltHex = bytesToHex(sha256(provider, ascii(K.saltCPhrase)));
    if (saltHex !== K.saltCHex) return knownAnswerFailed();
  } else {
    saltHex = input.salt === "A" ? V.saltAHex : V.saltBHex;
  }
  return { chainIdHex: K.chainIdHex, saltHex, seed };
}

/**
 * The public derivation input for one known answer. The derivation keys its HMAC at creation and
 * keeps no reference to the seed, so the temporary seed copy and its source buffer are disposed /
 * zeroed in `finally`, on success and on failure (L-1).
 */
export function knownAnswerDerivation(
  provider: FairnessHashProvider,
  answer: KnownAnswerInput,
): RoundDerivation {
  let seedBytes: Uint8Array | null = null;
  let roundSeed: SecretBytes | null = null;
  try {
    const chain = knownAnswerChain(provider, answer);
    seedBytes = chain.seed;
    roundSeed = SecretBytes.fromBytes(seedBytes);
    return RoundDerivation.create(provider, {
      fv: FAIRNESS_DEV_VECTORS_V1.fv,
      chainId: hexToBytes(chain.chainIdHex),
      chainIndex: answer.index,
      salt: hexToBytes(chain.saltHex),
      roundSeed,
    });
  } finally {
    roundSeed?.dispose();
    seedBytes?.fill(0);
  }
}

/** The runner output and RoundScript of one known answer (public chains only). */
export function knownAnswerRun(
  provider: FairnessHashProvider,
  runtime: EngineRuntime,
  answer: KnownAnswerInput,
): { output: RunnerOutput; script: RoundScript } {
  const chain = knownAnswerChain(provider, answer);
  chain.seed.fill(0);
  const output = runtime.run(knownAnswerDerivation(provider, answer));
  const script = buildRoundScript(
    provider,
    { chainId: chain.chainIdHex, chainIndex: answer.index, salt: chain.saltHex },
    output,
  );
  return { output, script };
}

/** The RoundScript of one known answer (public chains only). */
export function knownAnswerScript(
  provider: FairnessHashProvider,
  runtime: EngineRuntime,
  answer: KnownAnswerInput,
): RoundScript {
  return knownAnswerRun(provider, runtime, answer).script;
}

/**
 * The digest the independent reference computes for a whole round (known-answers.ts): SHA-256
 * over REFERENCE_RECORD_DOMAIN and the canonical JSON of the runner output without its profile
 * fields and chain index. Public development rounds only.
 */
export function referenceRecordDigest(
  provider: FairnessHashProvider,
  output: RunnerOutput,
): string {
  const { profile, profileVersion, fv, chainIndex, ...record } = output;
  void profile;
  void profileVersion;
  void fv;
  void chainIndex;
  return bytesToHex(sha256(provider, ascii(REFERENCE_RECORD_DOMAIN + canonicalJson(record))));
}

/**
 * Throws unless `script` matches every independent value (and digest candidate) of `answer`
 * and, given the runner `output`, the independent record digest of the whole round.
 */
export function assertKnownAnswer(
  script: RoundScript,
  answer: RoundScriptKnownAnswer,
  output?: RunnerOutput,
  provider?: FairnessHashProvider,
): void {
  const s = script.secretContent();
  const ok =
    s.outcome === answer.outcome &&
    s.crashAt === answer.crashAt &&
    s.drawCounts.crash === answer.crashDraws &&
    (answer.outcome === "floor"
      ? answer.chests !== null &&
        s.jackpot === answer.jackpot &&
        s.chests !== null &&
        s.chests.every((c, i) => c === answer.chests![i])
      : s.jackpot === null && s.chests === null) &&
    answer.firstCreatures.every((c, i) => {
      const o = s.creatures[i];
      return (
        o !== undefined &&
        o.id === c.id &&
        o.kind === c.kind &&
        o.x === c.x &&
        o.worldY === c.worldY &&
        o.size === c.size &&
        o.phase === c.phase &&
        o.dir === c.dir
      );
    }) &&
    (answer.digestCandidate === null || script.secretDigest() === answer.digestCandidate) &&
    (output === undefined ||
      (provider !== undefined && referenceRecordDigest(provider, output) === answer.recordDigest));
  if (!ok) throw new RoundScriptError("runtime-known-answer-failed");
}

/**
 * Loads, verifies and returns the sealed runner. Throws `RoundScriptError` with a fixed code:
 * `unverified-runtime` (crypto), `runtime-integrity-failed`, `runtime-unavailable`,
 * `runtime-incompatible`, `runtime-duplicate-fairness` or `runtime-known-answer-failed`.
 */
export function loadEngineRuntime(crypto: NodeFairnessCrypto): EngineRuntime {
  if (!isVerifiedFairnessCrypto(crypto)) throw new RoundScriptError("unverified-runtime");
  // 0. The build against the TRUSTED manifest, before any bundle byte runs (P8-4a-1).
  const root = buildRoot();
  const manifest: IntegrityManifest = readTrustedManifest(root, REQUIRED_PROTECTED_FILES);
  verifyBuildIntegrity(root, manifest, crypto.hash);

  const { exports: bundleExports, module } = loadModule(bundlePath());
  assertSurface(bundleExports);
  assertOneFairnessInstance(module);
  // 3a. Every loaded protected module is the manifest's file at its exact path.
  assertLoadedClosure(root, manifest, require.cache, [ENGINE_BUNDLE_LOCATION, LOADER_LOCATION]);
  // Bound ONCE, here, before the known answers run (P8-4a acceptance follow-up to M-2b). The
  // module's exports object is writable: a lookup per round would let any in-process code that
  // replaced `runSeededRound` after verification interpose a function that sees each outcome and
  // throws to have it classified `aborted`. The known answers and every later round use exactly
  // these references; replacing the export afterwards is never reached.
  const runSeededRound = bundleExports.runSeededRound;
  const RunnerError = bundleExports.RoundRunnerError;

  const runtime: EngineRuntime = Object.freeze({
    profile: EXPECTED_RUNNER_PROFILE,
    run(derivation: RoundDerivation): RunnerOutput {
      if (!(derivation instanceof RoundDerivation)) {
        throw new RoundScriptError("runner-failed", "derivation-unusable");
      }
      const chainIndex = derivation.chainIndex;
      let raw: unknown;
      try {
        raw = runSeededRound(derivation);
      } catch (error) {
        const code =
          error instanceof RunnerError && RUNNER_ERROR_CODES.includes(error.code)
            ? error.code
            : "runner-failed";
        throw new RoundScriptError("runner-failed", code);
      } finally {
        // The runner disposed it with the round; a refused bind leaves it to its owner.
        derivation.dispose();
      }
      return validateRunnerOutput(raw, chainIndex);
    },
  });

  for (const answer of ROUND_SCRIPT_KNOWN_ANSWERS) {
    let run: { output: RunnerOutput; script: RoundScript };
    try {
      run = knownAnswerRun(crypto.hash, runtime, answer);
    } catch {
      throw new RoundScriptError("runtime-known-answer-failed");
    }
    assertKnownAnswer(run.script, answer, run.output, crypto.hash);
  }
  // 5. The protected files again (not atomic with step 0; see integrity.ts).
  verifyBuildIntegrity(root, manifest, crypto.hash);
  assertLoadedClosure(root, manifest, require.cache, [ENGINE_BUNDLE_LOCATION, LOADER_LOCATION]);
  verified.add(runtime);
  return runtime;
}
