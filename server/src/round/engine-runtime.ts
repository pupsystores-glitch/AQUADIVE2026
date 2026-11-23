// Loader of the engine bundle's sealed round runner (P8-4a; owner decisions K1, K2, K10, K12).
// PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Nothing in the application startup, the HTTP routes
// or the WebSocket gateway imports this module (a boundary test checks it).
//
// `loadEngineRuntime(crypto)` loads the bundle from ONE fixed location next to the compiled
// server — <build>/engine/engine.cjs, resolved from this file's own compiled location
// (<build>/server/src/round/) — and accepts no path from anyone. Before it hands out a runtime it
// fails closed unless:
//
// 1. the module exports exactly the approved surface (`ROUND_RUNNER_PROFILE`, `RoundRunnerError`,
//    `runSeededRound`; K2) with the right types;
// 2. its construction profile is exactly the expected one (K12);
// 3. the fairness module the bundle itself required is the server's one instance: every loaded
//    module that exports a `RoundDerivation` or `SecretBytes` exports the bridge's own class
//    (a second copy — another path, or on Windows another drive-letter case — is refused);
// 4. the known-answer vectors (known-answers.ts) reproduce: the independent outcome values and
//    the RoundScript digest candidates of the public fv = 1 development chain.
//
// Errors carry fixed codes only. Loading runs the bundle's top-level code once per process (the
// module cache keeps one instance). Synchronous: offline precomputation only (K10).

import { join } from "node:path";
import {
  FAIRNESS_DEV_VECTORS_V1,
  RoundDerivation,
  SecretBytes,
  hexToBytes,
  type FairnessHashProvider,
} from "../fairness";
import { isVerifiedFairnessCrypto, type NodeFairnessCrypto } from "../fairness/crypto-node";
import { canonicalJson } from "./canonical";
import {
  ENGINE_BUNDLE_EXPORTS,
  EXPECTED_RUNNER_PROFILE,
  RUNNER_ERROR_CODES,
  type EngineBundleModule,
  type RunnerOutput,
  type RunnerProfile,
} from "./engine-types";
import { RoundScriptError } from "./errors";
import { ROUND_SCRIPT_KNOWN_ANSWERS, type RoundScriptKnownAnswer } from "./known-answers";
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

/**
 * The public fv = 1 development-vector derivation input for one known answer. The derivation
 * keys its HMAC at creation and keeps no reference to the seed, so the temporary seed copy and
 * its source buffer are disposed / zeroed in `finally`, on success and on failure (L-1).
 */
export function knownAnswerDerivation(
  provider: FairnessHashProvider,
  answer: Pick<RoundScriptKnownAnswer, "salt" | "index">,
): RoundDerivation {
  const V = FAIRNESS_DEV_VECTORS_V1;
  let seedBytes: Uint8Array | null = null;
  let roundSeed: SecretBytes | null = null;
  try {
    seedBytes = hexToBytes(V.linksHex[answer.index]!);
    roundSeed = SecretBytes.fromBytes(seedBytes);
    return RoundDerivation.create(provider, {
      fv: V.fv,
      chainId: hexToBytes(V.linksHex[0]!),
      chainIndex: answer.index,
      salt: hexToBytes(answer.salt === "A" ? V.saltAHex : V.saltBHex),
      roundSeed,
    });
  } finally {
    roundSeed?.dispose();
    seedBytes?.fill(0);
  }
}

/** The RoundScript of one known answer (public development vectors only). */
export function knownAnswerScript(
  provider: FairnessHashProvider,
  runtime: EngineRuntime,
  answer: Pick<RoundScriptKnownAnswer, "salt" | "index">,
): RoundScript {
  const V = FAIRNESS_DEV_VECTORS_V1;
  const output = runtime.run(knownAnswerDerivation(provider, answer));
  return buildRoundScript(
    provider,
    {
      chainId: V.linksHex[0]!,
      chainIndex: answer.index,
      salt: answer.salt === "A" ? V.saltAHex : V.saltBHex,
    },
    output,
  );
}

/** Throws unless `script` matches every independent value (and digest candidate) of `answer`. */
export function assertKnownAnswer(script: RoundScript, answer: RoundScriptKnownAnswer): void {
  const s = script.secretContent();
  const ok =
    s.outcome === answer.outcome &&
    s.crashAt === answer.crashAt &&
    s.drawCounts.crash === answer.crashDraws &&
    (answer.outcome === "floor"
      ? s.jackpot === answer.jackpot &&
        s.chests !== null &&
        s.chests.every((c, i) => c === answer.chests[i])
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
    (answer.digestCandidate === null || script.secretDigest() === answer.digestCandidate);
  if (!ok) throw new RoundScriptError("runtime-known-answer-failed");
}

/**
 * Loads, verifies and returns the sealed runner. Throws `RoundScriptError` with a fixed code:
 * `unverified-runtime` (crypto), `runtime-unavailable`, `runtime-incompatible`,
 * `runtime-duplicate-fairness` or `runtime-known-answer-failed`.
 */
export function loadEngineRuntime(crypto: NodeFairnessCrypto): EngineRuntime {
  if (!isVerifiedFairnessCrypto(crypto)) throw new RoundScriptError("unverified-runtime");
  const { exports, module } = loadModule(bundlePath());
  assertSurface(exports);
  assertOneFairnessInstance(module);
  // Bound ONCE, here, before the known answers run (P8-4a acceptance follow-up to M-2b). The
  // module's exports object is writable: a lookup per round would let any in-process code that
  // replaced `runSeededRound` after verification interpose a function that sees each outcome and
  // throws to have it classified `aborted`. The known answers and every later round use exactly
  // these references; replacing the export afterwards is never reached.
  const runSeededRound = exports.runSeededRound;
  const RunnerError = exports.RoundRunnerError;

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
    let script: RoundScript;
    try {
      script = knownAnswerScript(crypto.hash, runtime, answer);
    } catch {
      throw new RoundScriptError("runtime-known-answer-failed");
    }
    assertKnownAnswer(script, answer);
  }
  verified.add(runtime);
  return runtime;
}
