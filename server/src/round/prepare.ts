// Offline RoundScript precomputation (P8-4a; owner decisions K6, K7, K8, K10). PLAY MONEY ONLY;
// OFFLINE DEVELOPMENT AND TESTING ONLY. Not connected to the server's startup, HTTP routes,
// WebSocket gateway, cashout processing or any live loop.
//
// Pipeline (one round):
//
//   ChainVault.reserveRound → ChainVault.prepareRound → RoundKeys → sealed in-bundle runner
//   (SeededRound.bind → fresh GameEngine from its deps → fixed 60 Hz ticks to the first entry
//   into crashed / bonus) → validated runner output → immutable RoundScript → audit →
//   offline disposition.
//
// Isolation (K8). An `OfflineRoundEnvironment` owns a PRIVATE development / test
// MemoryChainStore, its vault and its audit sink. Every chain it can reach was created inside it —
// a fresh random development chain (`createChain`) or, in test mode only, the public fv = 1
// development vectors (`importPublicTestVectorChain`) — so no exercise can consume an index of a
// chain meant for live play: there is no way to pass it an outside store or vault.
//
// Offline disposition (K8; NOT the production selective-voiding policy, which stays open as D10 /
// OD-11): a script that was built is classified `completed` with reason `offline-script-built`;
// a reserved index whose preparation failed is classified `aborted` with reason
// `offline-script-failed`. Both are deterministic, fixed, final classifications of the
// development store; `voided` and `indeterminate` are never chosen automatically. If the
// classification itself fails, the index stays open (unrevealable, blocking later reveals: fail
// closed) and the call throws `disposition-failed`.
//
// Failure handling: the RoundKeys (and with them the derivation, its streams and the seeded round)
// are disposed on every path; no partial result is returned; a prepared index is never prepared
// again (a replayed request id is refused before any derivation); every outcome is audited with a
// fixed-code `script-built` / `script-failed` event (K7) that holds no seed, derivation, outcome,
// digest or text.
//
// Private vault (P8-4a acceptance correction M-2). The ChainVault, its store and its audit
// authority are implementation-private: no caller can reserve, prepare, classify or transition
// anything directly, so no caller can choose `completed`, `voided`, `aborted` or `indeterminate`
// after inspecting an outcome. The environment exposes only narrow delegates: `createChain`
// (fresh random development chain), `chainStatus` (read-only), `revealRound` (the vault's
// concluded-only, in-order reveal of an index THIS environment prepared and already classified)
// and, in test mode only, `restrictChainForTest` (one-way to `suspended` / `compromised` with a
// fixed reason code; it changes no round's disposition). This is not a production D10 / OD-11
// policy.
//
// Construction (P8-4a acceptance correction M-2b). The constructor is guarded at run time, not
// only by TypeScript: it requires a module-private capability that only `create` passes, and it
// re-checks the mode, the crypto provider and the engine runtime (`isVerifiedEngineRuntime`)
// itself. A direct `new OfflineRoundEnvironment(...)` from JavaScript, a subclass, or any runtime
// object other than the one `loadEngineRuntime` verified (a selectively throwing wrapper that
// delegates to a real runtime included) is refused with a fixed code before any store exists.
//
// Verification anchor (P8-4a acceptance correction M-1). `verifyScript` trusts only this
// environment's own records: the chain must exist in the private store and must not be
// compromised, the round must already have been revealed through the vault (its verified reveal
// is in the store), and every field of the caller's reveal record must equal the authoritative
// record. The round is then recomputed from the authoritative seed and salt. Verification is
// read-only: it never reveals, records, classifies, transitions or creates anything.

import {
  FAIRNESS_DEV_VECTORS_V1,
  FairnessError,
  SecretBytes,
  bytesToHex,
  hexToBytes,
  sha256,
  verifySeedAgainstCommitment,
} from "../fairness";
import { MemoryAuditSink, type AuditSink } from "../fairness/audit";
import { ChainError } from "../fairness/errors";
import { CHAIN_STATE_RULES, assertRequestId } from "../fairness/chain-store";
import { ChainVault, type NewChainOptions } from "../fairness/chain-vault";
import { DEFAULT_CHECKPOINT_INTERVAL, checkpointIndices } from "../fairness/checkpoints";
import {
  createNodeFairnessCrypto,
  isVerifiedFairnessCrypto,
  type NodeFairnessCrypto,
} from "../fairness/crypto-node";
import { MemoryChainStore } from "../fairness/memory-chain-store";
import {
  RECORD_FIELDS,
  chainCommitmentRecord,
  roundRevealRecord,
  type ChainCommitmentRecord,
  type ChainStatusRecord,
  type RoundRevealRecord,
} from "../fairness/records";
import { RoundKeys, assertPublicSalt } from "../fairness/round-keys";
import { isVerifiedEngineRuntime, loadEngineRuntime, type EngineRuntime } from "./engine-runtime";
import { RoundScriptError, type RoundScriptErrorCode } from "./errors";
import { RoundScript, buildRoundScript, diffRoundScripts } from "./round-script";

/** The documented offline-only disposition (K8). Not a production policy. */
export const OFFLINE_DISPOSITION = Object.freeze({
  built: Object.freeze({ disposition: "completed", reasonCode: "offline-script-built" }),
  failed: Object.freeze({ disposition: "aborted", reasonCode: "offline-script-failed" }),
} as const);

/** The audit operation name of a preparation. */
export const PREPARE_OPERATION = "prepare-script";

export interface OfflineRoundEnvironmentOptions {
  /** Required: "development" or "test" (the store also refuses a production NODE_ENV). */
  readonly mode: "development" | "test";
  /** Default: createNodeFairnessCrypto(). Must be verified. */
  readonly crypto?: NodeFairnessCrypto;
  /** Default: a new development MemoryAuditSink. */
  readonly audit?: AuditSink;
  /** Default: loadEngineRuntime(crypto). Must come from loadEngineRuntime. */
  readonly runtime?: EngineRuntime;
}

/** The result of an offline verification after the round's reveal. */
export interface RoundScriptVerification {
  /** True when the candidate's canonical bytes equal the recomputed script's. */
  readonly match: boolean;
  /** Paths of the fields that differ (names only; the round is revealed). */
  readonly alteredFields: readonly string[];
}

/** The one-way, test-only chain restrictions `restrictChainForTest` may apply. */
export const TEST_CHAIN_RESTRICTIONS = Object.freeze(["suspended", "compromised"] as const);
export type TestChainRestriction = (typeof TEST_CHAIN_RESTRICTIONS)[number];

/** The fixed reason code of a test-only chain restriction. */
export const TEST_RESTRICTION_REASON = "offline-test-restriction";

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** A fixed code for an error from the vault, the store or the fairness library. */
const chainReason = (error: unknown): string =>
  error instanceof ChainError || error instanceof FairnessError ? error.code : "unexpected-error";

/**
 * The construction capability (M-2b): a unique, frozen object that never leaves this module — not
 * exported, not stored on an instance, not reachable from the class. `Symbol.for` or any other
 * value a caller can make is not it.
 */
const CONSTRUCT: object = Object.freeze(Object.create(null));

function assertMode(mode: unknown): asserts mode is "development" | "test" {
  if (mode !== "development" && mode !== "test") {
    throw new RoundScriptError("development-only", "unsupported-mode");
  }
}

function assertCrypto(crypto: unknown): asserts crypto is NodeFairnessCrypto {
  if (!isVerifiedFairnessCrypto(crypto)) {
    throw new RoundScriptError("unverified-runtime", "unverified-crypto");
  }
}

export class OfflineRoundEnvironment {
  readonly mode: "development" | "test";
  readonly audit: AuditSink;
  /** Implementation-private (M-2): never exposed, never returned. */
  #vault: ChainVault;
  #store: MemoryChainStore;
  #crypto: NodeFairnessCrypto;
  #runtime: EngineRuntime;
  /** Every request id this environment was asked to prepare (success or failure). */
  #requests = new Set<string>();
  /** Every `chainId:index` this environment reserved for a preparation. */
  #claimed = new Set<string>();
  #closed = false;

  /**
   * Use `createOfflineRoundEnvironment`. TypeScript's `private` is not a run-time boundary, so
   * this JavaScript constructor itself enforces every invariant (M-2b): it first requires the
   * module-private `CONSTRUCT` capability (only `create` holds it), then re-checks the mode, the
   * crypto provider and — through the loader's own registry, `isVerifiedEngineRuntime` — that the
   * runtime is the very object `loadEngineRuntime` verified. A wrapper, proxy, copy or prototype
   * child of a real runtime is not that object and is refused, so no caller can interpose code
   * that sees an outcome and throws to have it classified `aborted`.
   */
  private constructor(
    capability: unknown,
    mode: unknown,
    crypto: unknown,
    runtime: unknown,
    audit: AuditSink,
  ) {
    if (capability !== CONSTRUCT) {
      throw new RoundScriptError("invalid-request", "construction-refused");
    }
    assertMode(mode);
    assertCrypto(crypto);
    if (!isVerifiedEngineRuntime(runtime)) {
      throw new RoundScriptError("unverified-runtime", "unverified-engine-runtime");
    }
    this.mode = mode;
    this.#crypto = crypto;
    this.#runtime = runtime;
    try {
      // A private store: nothing outside this environment can reach its chains.
      this.#store = new MemoryChainStore({ mode });
      this.#vault = new ChainVault({ crypto, store: this.#store, audit });
    } catch (error) {
      throw new RoundScriptError("development-only", chainReason(error));
    }
    this.audit = audit;
    Object.freeze(this);
  }

  /** @internal Used by createOfflineRoundEnvironment only. */
  static create(options: OfflineRoundEnvironmentOptions): OfflineRoundEnvironment {
    const mode = options?.mode;
    assertMode(mode);
    const crypto = options.crypto ?? createNodeFairnessCrypto();
    assertCrypto(crypto);
    const runtime = options.runtime ?? loadEngineRuntime(crypto);
    return new OfflineRoundEnvironment(
      CONSTRUCT,
      mode,
      crypto,
      runtime,
      options.audit ?? new MemoryAuditSink(),
    );
  }

  /** A fresh, random development chain (the vault's explicit new-chain workflow). */
  createChain(options: NewChainOptions): Promise<ChainCommitmentRecord> {
    this.#assertOpen();
    return this.#vault.createChain(options);
  }

  /** Read-only status of a chain of this environment (the vault's public status record). */
  async chainStatus(chainId: string): Promise<ChainStatusRecord> {
    this.#assertOpen();
    try {
      return await this.#vault.chainStatus(chainId);
    } catch (error) {
      throw new RoundScriptError("chain-unavailable", chainReason(error));
    }
  }

  /**
   * Reveals an index that THIS environment prepared and already classified under the offline
   * disposition, through the vault's own lifecycle (concluded rounds only, every earlier index
   * concluded or revealed, verified against the chain). The environment never classifies a round
   * here; an index it never claimed is refused before the vault is asked.
   */
  async revealRound(chainId: string, index: number): Promise<RoundRevealRecord> {
    this.#assertOpen();
    if (!this.#claimed.has(`${chainId}:${index}`)) {
      throw new RoundScriptError("chain-unavailable", "round-not-prepared");
    }
    try {
      return await this.#vault.revealRound(chainId, index);
    } catch (error) {
      throw new RoundScriptError("chain-unavailable", chainReason(error));
    }
  }

  /**
   * TEST MODE ONLY: moves a chain one way to `suspended` or `compromised` (fixed reason code), so
   * tests can exercise the fail-closed paths. It changes no round's disposition and can never
   * make a chain derive again.
   */
  async restrictChainForTest(
    chainId: string,
    to: TestChainRestriction,
  ): Promise<ChainStatusRecord> {
    this.#assertOpen();
    if (this.mode !== "test") throw new RoundScriptError("development-only");
    if (!TEST_CHAIN_RESTRICTIONS.includes(to)) throw new RoundScriptError("invalid-request");
    try {
      return await this.#vault.transitionChain(chainId, to, TEST_RESTRICTION_REASON);
    } catch (error) {
      throw new RoundScriptError("chain-unavailable", chainReason(error));
    }
  }

  /**
   * TEST MODE ONLY: the public, non-secret fv = 1 development-vector chain
   * (FAIRNESS_DEV_VECTORS_V1, length 8) in this environment's private store, for known answers.
   */
  async importPublicTestVectorChain(): Promise<ChainCommitmentRecord> {
    this.#assertOpen();
    if (this.mode !== "test") throw new RoundScriptError("development-only");
    const V = FAIRNESS_DEV_VECTORS_V1;
    const checkpoints = new Map(
      checkpointIndices(V.chainLength, DEFAULT_CHECKPOINT_INTERVAL).map((c) => [
        c,
        SecretBytes.fromBytes(hexToBytes(V.linksHex[c]!)),
      ]),
    );
    try {
      const snapshot = await this.#store.createChain({
        commitment: Object.freeze({
          fv: V.fv,
          chainId: hexToBytes(V.linksHex[0]!),
          length: V.chainLength,
        }),
        checkpointInterval: DEFAULT_CHECKPOINT_INTERVAL,
        checkpoints,
      });
      await this.#audit("chain-created", "import-test-vectors", snapshot.chainId, null, null);
      return chainCommitmentRecord(snapshot);
    } finally {
      for (const cp of checkpoints.values()) cp.dispose();
    }
  }

  /**
   * Reserves the next index of `chainId` for `requestId`, prepares its keys with `salt`, runs the
   * sealed runner and returns the round's RoundScript (SECRET content until the reveal). Throws
   * `RoundScriptError` with a fixed code; never returns a partial result.
   */
  async prepareScript(chainId: string, requestId: string, salt: Uint8Array): Promise<RoundScript> {
    this.#assertOpen();
    try {
      assertRequestId(requestId);
      assertPublicSalt(salt);
    } catch {
      await this.#auditFailure(null, null, "invalid-request");
      throw new RoundScriptError("invalid-request");
    }

    // 1. Reservation. A request id is used at most once per environment (this environment owns
    //    its store, so the set is authoritative): a replay is refused before the vault is asked,
    //    and an index another call already claimed is never touched again.
    if (this.#requests.has(requestId)) {
      await this.#auditFailure(chainId, null, "request-replayed");
      throw new RoundScriptError("request-replayed");
    }
    this.#requests.add(requestId);
    let index: number | undefined;
    try {
      const reservation = await this.#vault.reserveRound(chainId, requestId);
      index = reservation.chainIndex;
      const claim = `${chainId}:${index}`;
      const state = await this.#store.getIndex(chainId, index);
      if (
        this.#claimed.has(claim) ||
        state.requestId !== requestId ||
        state.saltHex !== null ||
        state.derivationIssued ||
        state.disposition !== null
      ) {
        await this.#auditFailure(chainId, index, "request-replayed");
        throw new RoundScriptError("request-replayed");
      }
      this.#claimed.add(claim);
    } catch (error) {
      if (error instanceof RoundScriptError) throw error;
      const failure = new RoundScriptError("chain-unavailable", chainReason(error));
      // Reserved, then the check failed: this call's index is concluded as aborted.
      if (index !== undefined) throw await this.#fail(chainId, index, failure);
      await this.#auditFailure(chainId, null, failure.code);
      throw failure;
    }

    // 2. – 4. Keys, sealed run, script. Any failure: dispose, classify aborted, audit, throw.
    let keys: RoundKeys | null = null;
    let script: RoundScript;
    try {
      try {
        keys = await this.#vault.prepareRound(chainId, index, salt);
      } catch (error) {
        throw new RoundScriptError("chain-unavailable", chainReason(error));
      }
      const pub = { chainId: keys.chainId, chainIndex: keys.chainIndex, salt: keys.salt };
      const output = this.#runtime.run(keys.derivation); // disposes the derivation
      script = buildRoundScript(this.#crypto.hash, pub, output);
    } catch (error) {
      keys?.dispose();
      const failure =
        error instanceof RoundScriptError ? error : new RoundScriptError("script-invalid");
      throw await this.#fail(chainId, index, failure);
    } finally {
      keys?.dispose();
    }

    // 5. Offline disposition, then the audit record.
    try {
      await this.#vault.classifyRound(
        chainId,
        index,
        OFFLINE_DISPOSITION.built.disposition,
        OFFLINE_DISPOSITION.built.reasonCode,
      );
    } catch (error) {
      // completed was refused: the index stays as the store has it (fail closed).
      await this.#auditFailure(chainId, index, "disposition-failed");
      throw new RoundScriptError("disposition-failed", chainReason(error));
    }
    try {
      await this.#audit("script-built", PREPARE_OPERATION, chainId, index, null);
    } catch {
      throw new RoundScriptError("audit-failed");
    }
    return script;
  }

  /**
   * OFFLINE VERIFICATION after the round's reveal. The trust anchor is this environment's own
   * private records, never the caller's (M-1): the script's chain must exist here and must not
   * be compromised; its index must already be revealed through the vault (`revealRound`); every
   * field of `reveal` must equal the authoritative reveal record (fv, chain id, chain length,
   * index, seed, previous link, salt, disposition, status). The round is then recomputed from the
   * AUTHORITATIVE seed and salt and compared by canonical bytes. Every refusal is the same
   * `reveal-mismatch` (an unknown chain, an unrevealed round and a forged field are
   * indistinguishable). Read-only: nothing is revealed, recorded, classified or created.
   */
  async verifyScript(
    candidate: RoundScript,
    reveal: RoundRevealRecord,
  ): Promise<RoundScriptVerification> {
    this.#assertOpen();
    if (!(candidate instanceof RoundScript)) throw new RoundScriptError("script-invalid");
    const hash = this.#crypto.hash;
    const pub = candidate.public;

    // 1. The authoritative reveal record of the script's round, from the private store.
    let authoritative: RoundRevealRecord;
    try {
      const chain = await this.#store.getChain(pub.chainId);
      const index = await this.#store.getIndex(pub.chainId, pub.chainIndex);
      if (
        !CHAIN_STATE_RULES[chain.state].reveal ||
        index.reveal === null ||
        index.saltHex === null ||
        index.disposition === null ||
        index.disposition === "indeterminate"
      ) {
        throw new Error("not revealed");
      }
      authoritative = roundRevealRecord(chain, index);
    } catch {
      throw new RoundScriptError("reveal-mismatch");
    }
    this.#assertOpen();

    // 2. The caller's record must be exactly the authoritative one, and belong to the script.
    if (
      reveal === null ||
      typeof reveal !== "object" ||
      RECORD_FIELDS["round-reveal"].some(
        (f) =>
          (reveal as unknown as Record<string, unknown>)[f] !==
          (authoritative as unknown as Record<string, unknown>)[f],
      ) ||
      authoritative.fv !== pub.fv ||
      authoritative.chainId !== pub.chainId ||
      authoritative.chainIndex !== pub.chainIndex
    ) {
      throw new RoundScriptError("reveal-mismatch");
    }

    // 3. Defence in depth: the authoritative seed against the authoritative commitment.
    //    x_(j−1) = SHA-256(x_j), and SHA-256^j(x_j) = x_0 (j hashes; offline verification only).
    let seed: Uint8Array | null = null;
    let salt: Uint8Array;
    try {
      seed = hexToBytes(authoritative.seed);
      salt = hexToBytes(authoritative.salt!);
      if (bytesToHex(sha256(hash, seed)) !== authoritative.previousLink) throw new Error("link");
      const onChain = verifySeedAgainstCommitment(
        hash,
        {
          fv: authoritative.fv,
          chainId: hexToBytes(authoritative.chainId),
          length: authoritative.chainLength,
        },
        { index: authoritative.chainIndex, seed },
      );
      if (!onChain.ok) throw new Error("chain");
    } catch {
      seed?.fill(0);
      throw new RoundScriptError("reveal-mismatch");
    }

    // 4. Recompute. Every fallible construction is inside the guarded scope; the temporary seed
    //    copy and the RoundKeys are disposed on every path (L-1). Construction failures map to
    //    the sanitized `reveal-mismatch`; runner / script failures keep their fixed codes.
    let roundSeed: SecretBytes | null = null;
    let keys: RoundKeys | null = null;
    let expected: RoundScript;
    try {
      try {
        roundSeed = SecretBytes.fromBytes(seed);
        keys = RoundKeys.create(hash, {
          chainId: authoritative.chainId,
          chainIndex: authoritative.chainIndex,
          salt,
          roundSeed,
        });
      } catch {
        throw new RoundScriptError("reveal-mismatch");
      }
      const output = this.#runtime.run(keys.derivation);
      expected = buildRoundScript(
        hash,
        { chainId: keys.chainId, chainIndex: keys.chainIndex, salt: keys.salt },
        output,
      );
    } catch (error) {
      throw error instanceof RoundScriptError ? error : new RoundScriptError("reveal-mismatch");
    } finally {
      keys?.dispose();
      roundSeed?.dispose();
      seed.fill(0);
    }
    const a = expected.secretCanonicalBytes();
    const b = candidate.secretCanonicalBytes();
    const match = a.length === b.length && a.every((x, i) => x === b[i]);
    return Object.freeze({
      match,
      alteredFields: Object.freeze(match ? [] : diffRoundScripts(expected, candidate)),
    });
  }

  /** Disposes the vault's cached secrets and closes the private store. Idempotent. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#vault.dispose();
    this.#store.close();
  }

  toJSON(): { environment: string; mode: string } {
    return { environment: "OfflineRoundEnvironment", mode: this.mode };
  }

  [INSPECT](): string {
    return `OfflineRoundEnvironment(${this.mode}) [secrets redacted]`;
  }

  #assertOpen(): void {
    if (this.#closed) throw new RoundScriptError("environment-closed");
  }

  /** Failure after a reservation: classify aborted (offline), audit, return the error to throw. */
  async #fail(
    chainId: string,
    index: number,
    failure: RoundScriptError,
  ): Promise<RoundScriptError> {
    let result = failure;
    try {
      await this.#vault.classifyRound(
        chainId,
        index,
        OFFLINE_DISPOSITION.failed.disposition,
        OFFLINE_DISPOSITION.failed.reasonCode,
      );
    } catch (error) {
      result = new RoundScriptError("disposition-failed", chainReason(error));
    }
    await this.#auditFailure(chainId, index, result.code);
    return result;
  }

  async #audit(
    kind: "chain-created" | "script-built" | "script-failed",
    operation: string,
    chainId: string | null,
    chainIndex: number | null,
    code: string | null,
  ): Promise<void> {
    await this.audit.append({ kind, operation, chainId, chainIndex, code });
  }

  /** Audits a failure (fixed code only). A failed audit never replaces the original error. */
  async #auditFailure(
    chainId: string | null,
    chainIndex: number | null,
    code: RoundScriptErrorCode,
  ): Promise<void> {
    try {
      const id = typeof chainId === "string" && /^[0-9a-f]{64}$/.test(chainId) ? chainId : null;
      await this.#audit("script-failed", PREPARE_OPERATION, id, chainIndex, code);
    } catch {
      // The original error matters more than a failed audit of it.
    }
  }
}

/** Creates an isolated offline environment (see the file comment). */
export function createOfflineRoundEnvironment(
  options: OfflineRoundEnvironmentOptions,
): OfflineRoundEnvironment {
  return OfflineRoundEnvironment.create(options);
}
