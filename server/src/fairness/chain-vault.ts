// Chain vault: the only owner of unrevealed chain secrets on the server (P8-3c-2).
//
// The vault creates chains (explicit new-chain workflow), reserves round indices, prepares one
// RoundKeys per reserved index, records classifications and verified reveals, and precomputes
// upcoming round seeds off the live event loop. It keeps the chain seed, the checkpoints and every
// unrevealed round seed private: they exist only as `SecretBytes` (redacted in JSON, string
// conversion and inspection) and short-lived buffers that are zeroed after use. Callers receive
// allow-listed records (records.ts) and RoundKeys, never seed material; a reveal returns only the
// revealed seed x_j and its predecessor.
//
// Every state change goes through the ChainStore (atomic per call) and is appended to the audit
// sink; every refused or failed operation is audited with its error code. Failure policy:
// - nothing is ever rolled back into a reusable state: a reserved index stays reserved, a bound
//   salt stays bound, an issued derivation stays issued;
// - a retry of an ambiguous step is answered idempotently (same request id → same index, same
//   salt → same binding, same reveal → same record);
// - a reveal that does not verify, or that contradicts recorded data, marks the chain
//   compromised.
//
// Cached secrets (P8-3c-3). The precompute cache is an optimization, never an authority: the store
// decides every state. The vault drops (disposes) a chain's cached seeds whenever it observes that
// the chain may no longer derive (compromised, suspended, retired: from its own transitions, from
// every chain snapshot it reads, and from every refusal or integrity error the store returns for
// that chain). Each drop advances the chain's cache epoch; a precompute that yielded while the
// epoch moved, or while the vault was disposed, discards its staged seeds instead of installing
// them. A vault learns of an out-of-band change (another vault, an operator) only on its next
// interaction with that chain; until then its cached seeds stay in memory (best effort: dispose()
// zeroes the vault's buffers, but JavaScript cannot guarantee erasure of engine-internal copies).
//
// Event loop: every hash walk (chain creation, precomputation, seed reconstruction from a
// checkpoint, long reveal verification) runs in slices of at most HASH_SLICE_LINKS hashes and
// yields between slices. Without precomputation, preparing or revealing a round reconstructs its
// seed from the nearest checkpoint (at most interval − 1 = 1,023 hashes at the default interval,
// in slices); `precompute` moves that work ahead of the round. P8-3c adds no scheduler, worker
// pool or background job. The vault is not connected to the server application, the gateway or
// gameplay.

import {
  FAIRNESS_VERSION,
  FairnessError,
  SecretBytes,
  assertChainLength,
  computeRoundSeed,
  createChainCommitment,
  generateChainSeed,
} from "../fairness";
import { MemoryAuditSink, type AuditEventInput, type AuditSink } from "./audit";
import {
  CHAIN_STATE_RULES,
  assertChainIdHex,
  type ChainSnapshot,
  type ChainState,
  type ChainStore,
  type RoundDisposition,
} from "./chain-store";
import {
  DEFAULT_CHECKPOINT_INTERVAL,
  assertCheckpointInterval,
  checkpointAbove,
  checkpointIndices,
} from "./checkpoints";
import { isVerifiedFairnessCrypto, type NodeFairnessCrypto } from "./crypto-node";
import { ChainError } from "./errors";
import {
  chainCommitmentRecord,
  chainStatusRecord,
  roundDispositionRecord,
  roundReservationRecord,
  roundRevealRecord,
  type ChainCommitmentRecord,
  type ChainStatusRecord,
  type RoundDispositionRecord,
  type RoundReservationRecord,
  type RoundRevealRecord,
} from "./records";
import { verifyRevealCandidate } from "./reveal";
import { RoundKeys, assertPublicSalt } from "./round-keys";

/** Hashes per uninterrupted slice of chain creation and precomputation. */
export const HASH_SLICE_LINKS = 256;

/** Most round seeds the vault caches per chain through `precompute`. */
export const MAX_PRECOMPUTED_SEEDS = 4096;

export interface ChainVaultOptions {
  /** Must come from createNodeFairnessCrypto (verified). */
  readonly crypto: NodeFairnessCrypto;
  readonly store: ChainStore;
  /** Default: a new development MemoryAuditSink. */
  readonly audit?: AuditSink;
  /** Yields to the event loop between hash slices. Default: setImmediate. */
  readonly yieldSlice?: () => Promise<void>;
}

export interface NewChainOptions {
  readonly length: number;
  /** Default: DEFAULT_CHECKPOINT_INTERVAL (1,024, provisional). */
  readonly checkpointInterval?: number;
}

const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const CHAIN_ID_PATTERN = /^[0-9a-f]{64}$/;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Store refusals and integrity errors after which a chain's cached seeds are dropped: the chain
 * may be compromised, may no longer derive, or is no longer known to the store.
 */
const EVICTING_CODES: ReadonlySet<string> = new Set([
  "invalid-chain-state",
  "reveal-conflict",
  "reveal-verification-failed",
  "unknown-chain",
  "store-closed",
]);

export class ChainVault {
  readonly audit: AuditSink;
  #crypto: NodeFairnessCrypto;
  #store: ChainStore;
  #yield: () => Promise<void>;
  #cache = new Map<string, Map<number, SecretBytes>>();
  /** Advances every time a chain's cache is dropped (see "Cached secrets" above). */
  #epochs = new Map<string, number>();
  #disposed = false;

  constructor(options: ChainVaultOptions) {
    if (!isVerifiedFairnessCrypto(options?.crypto)) {
      throw new ChainError("unverified-crypto", "the vault needs verified crypto providers");
    }
    this.#crypto = options.crypto;
    this.#store = options.store;
    this.audit = options.audit ?? new MemoryAuditSink();
    this.#yield = options.yieldSlice ?? yieldToEventLoop;
    Object.freeze(this);
  }

  /**
   * The explicit new-chain workflow: draws a fresh chain seed from the secure random source,
   * computes the checkpoints and the chain id in yielding slices, and stores them. Never
   * reconstructs, imports or reuses an earlier chain.
   */
  createChain(options: NewChainOptions): Promise<ChainCommitmentRecord> {
    return this.#run("create-chain", null, null, async () => {
      const length = options?.length;
      const interval = options?.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL;
      try {
        assertChainLength(length);
      } catch {
        throw new ChainError("invalid-chain-length", "chain length is out of range");
      }
      assertCheckpointInterval(interval);
      const hash = this.#crypto.hash;
      const checkpoints = new Map<number, SecretBytes>();
      try {
        const indices = checkpointIndices(length, interval);
        let top = generateChainSeed(this.#crypto.random);
        let topIndex = length;
        checkpoints.set(length, top);
        for (const c of indices.slice(1)) {
          top = await this.#walkDown(top, topIndex, c);
          checkpoints.set(c, top);
          topIndex = c;
          await this.#yield();
        }
        const x1 = await this.#walkDown(top, topIndex, 1);
        let chainId: Uint8Array;
        try {
          chainId = createChainCommitment(hash, x1, 1).chainId;
        } finally {
          x1.dispose();
        }
        const snapshot = await this.#store.createChain({
          commitment: Object.freeze({ fv: FAIRNESS_VERSION, chainId, length }),
          checkpointInterval: interval,
          checkpoints,
        });
        await this.#record("chain-created", "create-chain", snapshot.chainId, null, null);
        return chainCommitmentRecord(snapshot);
      } finally {
        for (const cp of checkpoints.values()) cp.dispose();
      }
    });
  }

  chainStatus(chainId: string): Promise<ChainStatusRecord> {
    return this.#run("chain-status", chainId, null, async () =>
      chainStatusRecord(await this.#getChain(chainId)),
    );
  }

  transitionChain(chainId: string, to: ChainState, reasonCode: string): Promise<ChainStatusRecord> {
    return this.#run("transition-chain", chainId, null, async () => {
      let snapshot: ChainSnapshot;
      try {
        snapshot = this.#observe(await this.#store.transitionChain(chainId, to, reasonCode));
      } catch (err) {
        // A refused transition (for example out of `compromised`) still tells us to look.
        await this.#refresh(chainId);
        throw err;
      }
      await this.#record("chain-transition", "transition-chain", chainId, null, snapshot.state);
      return chainStatusRecord(snapshot);
    });
  }

  /** Reserves the next round index for `requestId` (idempotent per request id). */
  reserveRound(chainId: string, requestId: string): Promise<RoundReservationRecord> {
    return this.#run("reserve-round", chainId, null, async () => {
      const { value, replayed } = await this.#store.reserveIndex(chainId, requestId);
      await this.#record(
        replayed ? "reservation-replayed" : "index-reserved",
        "reserve-round",
        chainId,
        value.index,
        null,
      );
      return roundReservationRecord(value);
    });
  }

  /**
   * Prepares the one RoundKeys of a reserved index. The salt is bound to the index first and can
   * never change afterwards. The caller owns and disposes the result. A second preparation of
   * the same index throws `derivation-already-issued`.
   */
  prepareRound(chainId: string, index: number, salt: Uint8Array): Promise<RoundKeys> {
    return this.#run("prepare-round", chainId, index, async () => {
      assertPublicSalt(salt);
      const chain = await this.#getChain(chainId);
      const epoch = this.#epoch(chainId);
      const bound = await this.#store.bindSalt(chainId, index, salt);
      if (!bound.replayed) await this.#record("salt-bound", "prepare-round", chainId, index, null);
      const seed = await this.#seed(chain, index);
      let keys: RoundKeys;
      try {
        // The cache was dropped while this call yielded: the chain may have stopped deriving.
        // Fail closed before building keys (the store's issue check stays the authority; a
        // same-salt retry is allowed).
        if (this.#epoch(chainId) !== epoch) {
          throw new ChainError("invalid-chain-state", "the chain changed during preparation");
        }
        keys = RoundKeys.create(this.#crypto.hash, {
          chainId,
          chainIndex: index,
          salt,
          roundSeed: seed,
        });
      } finally {
        seed.dispose();
      }
      try {
        await this.#store.markDerivationIssued(chainId, index);
        await this.#record("derivation-issued", "prepare-round", chainId, index, null);
      } catch (err) {
        keys.dispose();
        throw err;
      }
      return keys;
    });
  }

  /**
   * Records a round's classification (evidence only; no settlement rule). `indeterminate` is not
   * a conclusion: it keeps the round unrevealable and blocks every later reveal until a final
   * classification (completed, aborted, voided) replaces it, once. The vault never resolves an
   * indeterminate round by itself.
   */
  classifyRound(
    chainId: string,
    index: number,
    disposition: RoundDisposition,
    reasonCode: string,
  ): Promise<RoundDispositionRecord> {
    return this.#run("classify-round", chainId, index, async () => {
      const { value, replayed } = await this.#store.classifyRound(
        chainId,
        index,
        disposition,
        reasonCode,
      );
      if (!replayed) {
        await this.#record("round-classified", "classify-round", chainId, index, disposition);
      }
      // Classification is allowed in every state, so it alone says nothing about the chain: if
      // this vault holds cached seeds for it, look at the chain state once (best effort).
      if (this.#cache.has(chainId)) await this.#refresh(chainId);
      return roundDispositionRecord(value);
    });
  }

  /**
   * Reveals the seed of a concluded round after verifying it against the revealed chain.
   * Repeating a reveal returns the same record; contradicting data marks the chain compromised.
   */
  revealRound(chainId: string, index: number): Promise<RoundRevealRecord> {
    return this.#run("reveal-round", chainId, index, async () => {
      const chain = await this.#getChain(chainId);
      const current = await this.#store.getIndex(chainId, index);
      if (current.disposition === null) {
        throw new ChainError("round-not-concluded", `index ${index} is not classified`);
      }
      // An unresolved round is not concluded: refused before any seed is reconstructed. Later
      // indices are refused by the store's atomic ordering check (`reveal-order-violation`).
      if (current.disposition === "indeterminate") {
        throw new ChainError("round-not-concluded", `index ${index} is indeterminate`);
      }
      if (!CHAIN_STATE_RULES[chain.state].reveal) {
        throw new ChainError("invalid-chain-state", `cannot reveal in state ${chain.state}`);
      }
      const seed = await this.#seed(chain, index);
      const seedBytes = seed.reveal();
      seed.dispose();
      let previousLink: Uint8Array | null = null;
      try {
        const neighbours = await this.#store.revealNeighbours(chainId, index);
        try {
          previousLink = await verifyRevealCandidate(
            this.#crypto.hash,
            { chainIndex: index, seed: seedBytes, neighbours },
            this.#yield,
          );
        } catch (err) {
          if (err instanceof ChainError && err.code === "reveal-verification-failed") {
            await this.#compromise(chainId);
          }
          throw err;
        }
        let result: Awaited<ReturnType<ChainStore["recordReveal"]>>;
        try {
          result = await this.#store.recordReveal(chainId, index, seedBytes, previousLink);
        } catch (err) {
          // The store found contradicting data and marked the chain compromised: drop the cache
          // now (before anything else can run) and record the transition the store made.
          if (err instanceof ChainError && err.code === "reveal-conflict") {
            this.#evictChain(chainId);
            await this.#recordStoreCompromise(chainId);
          }
          throw err;
        }
        const { value, replayed } = result;
        this.#evict(chainId, index);
        await this.#record(
          replayed ? "reveal-replayed" : "reveal-recorded",
          "reveal-round",
          chainId,
          index,
          null,
        );
        return roundRevealRecord(await this.#getChain(chainId), value);
      } finally {
        seedBytes.fill(0);
        previousLink?.fill(0);
      }
    });
  }

  /**
   * Precomputes the round seeds `fromIndex … fromIndex + count − 1` in yielding slices, so that
   * preparing and revealing those rounds needs no hashing on the live event loop. Revealed
   * indices are skipped. Returns the number of seeds added to the cache. Not a scheduler: the
   * caller decides when to run it.
   *
   * Seeds are staged privately while the walk yields and installed only if, after the last
   * yield, the vault is not disposed, the chain may still derive and its cache epoch has not
   * moved; otherwise every staged seed is disposed and the call fails closed.
   */
  precompute(chainId: string, fromIndex: number, count: number): Promise<number> {
    return this.#run("precompute", chainId, null, async () => {
      const chain = await this.#getChain(chainId);
      if (!CHAIN_STATE_RULES[chain.state].derive) {
        throw new ChainError("invalid-chain-state", `cannot precompute in state ${chain.state}`);
      }
      const epoch = this.#epoch(chainId);
      const to = fromIndex + count - 1;
      if (
        !Number.isInteger(fromIndex) ||
        !Number.isInteger(count) ||
        fromIndex < 1 ||
        count < 1 ||
        to > chain.length ||
        (this.#cache.get(chainId)?.size ?? 0) + count > MAX_PRECOMPUTED_SEEDS
      ) {
        throw new ChainError("invalid-precompute-range", "precompute range is out of bounds");
      }
      const revealed = new Set<number>();
      for (let i = fromIndex; i <= Math.min(to, chain.lastReservedIndex); i++) {
        if ((await this.#store.getIndex(chainId, i)).reveal !== null) revealed.add(i);
      }
      const c = checkpointAbove(to, chain.length, chain.checkpointInterval);
      const checkpoint = await this.#store.readCheckpoint(chainId, c);
      let x: SecretBytes;
      try {
        x = await this.#walkDown(checkpoint, c, to);
      } finally {
        checkpoint.dispose();
      }
      const staged = new Map<number, SecretBytes>();
      let added = 0;
      try {
        for (let i = to; i >= fromIndex; i--) {
          if (!revealed.has(i)) staged.set(i, copySecret(x));
          if (i > fromIndex) {
            const next = computeRoundSeed(this.#crypto.hash, x, i, i - 1);
            x.dispose();
            x = next;
            if ((to - i + 1) % HASH_SLICE_LINKS === 0) await this.#yield();
          }
        }
        x.dispose();
        // Re-validate after the last yield; from here to the install nothing awaits.
        const now = await this.#getChain(chainId);
        if (this.#disposed) throw new ChainError("vault-disposed", "the vault was disposed");
        if (!CHAIN_STATE_RULES[now.state].derive || this.#epoch(chainId) !== epoch) {
          throw new ChainError("invalid-chain-state", "the chain changed during precompute");
        }
        const cache = this.#cache.get(chainId) ?? new Map<number, SecretBytes>();
        let fresh = 0;
        for (const i of staged.keys()) if (!cache.has(i)) fresh++;
        if (cache.size + fresh > MAX_PRECOMPUTED_SEEDS) {
          throw new ChainError("invalid-precompute-range", "precompute range is out of bounds");
        }
        for (const [i, secret] of staged) {
          if (cache.has(i)) continue;
          cache.set(i, secret);
          staged.delete(i);
          added++;
        }
        this.#cache.set(chainId, cache);
      } finally {
        x.dispose();
        for (const secret of staged.values()) secret.dispose();
        staged.clear();
      }
      await this.#record("seeds-precomputed", "precompute", chainId, fromIndex, null);
      return added;
    });
  }

  /** Disposes every cached secret; later operations throw `vault-disposed`. Idempotent. */
  dispose(): void {
    this.#disposed = true;
    for (const chainId of [...this.#cache.keys()]) this.#evictChain(chainId);
  }

  toJSON(): { vault: string } {
    return { vault: "ChainVault" };
  }

  [INSPECT](): string {
    return "ChainVault [secrets redacted]";
  }

  /** Runs an operation; audits any failure with its error code, then rethrows it unchanged. */
  async #run<T>(
    operation: string,
    chainId: string | null,
    index: number | null,
    body: () => Promise<T>,
  ): Promise<T> {
    try {
      if (this.#disposed) throw new ChainError("vault-disposed", "the vault was disposed");
      return await body();
    } catch (err) {
      const code =
        err instanceof ChainError || err instanceof FairnessError ? err.code : "unexpected-error";
      // Synchronously, before the audit can yield: a refusal or integrity error for a chain
      // drops that chain's cached seeds.
      if (
        err instanceof ChainError &&
        EVICTING_CODES.has(err.code) &&
        typeof chainId === "string" &&
        CHAIN_ID_PATTERN.test(chainId)
      ) {
        this.#evictChain(chainId);
      }
      try {
        await this.audit.append({
          kind: "operation-failed",
          operation,
          chainId: typeof chainId === "string" && CHAIN_ID_PATTERN.test(chainId) ? chainId : null,
          chainIndex: Number.isInteger(index) && (index as number) >= 0 ? index : null,
          code,
        });
      } catch {
        // The original error matters more than a failed audit of it.
      }
      throw err;
    }
  }

  async #record(
    kind: AuditEventInput["kind"],
    operation: string,
    chainId: string,
    chainIndex: number | null,
    code: string | null,
  ): Promise<void> {
    try {
      await this.audit.append({ kind, operation, chainId, chainIndex, code });
    } catch {
      throw new ChainError("audit-failed", `audit of ${operation} failed`);
    }
  }

  /** Reads the chain and applies its state to the cache (`#observe`). */
  async #getChain(chainId: string): Promise<ChainSnapshot> {
    return this.#observe(await this.#store.getChain(chainId));
  }

  /** Drops the chain's cached seeds when its state no longer allows derivation. */
  #observe(snapshot: ChainSnapshot): ChainSnapshot {
    if (!CHAIN_STATE_RULES[snapshot.state].derive) this.#evictChain(snapshot.chainId);
    return snapshot;
  }

  /** Best-effort state check that never fails the caller; refusals still drop the cache. */
  async #refresh(chainId: string): Promise<void> {
    try {
      await this.#getChain(chainId);
    } catch (err) {
      if (err instanceof ChainError && EVICTING_CODES.has(err.code)) this.#evictChain(chainId);
    }
  }

  #epoch(chainId: string): number {
    return this.#epochs.get(chainId) ?? 0;
  }

  /** Audits a compromise the store itself recorded (`reveal-conflict`), if the store confirms it. */
  async #recordStoreCompromise(chainId: string): Promise<void> {
    try {
      if ((await this.#getChain(chainId)).state === "compromised") {
        await this.#record("chain-transition", "reveal-round", chainId, null, "compromised");
      }
    } catch {
      // Unreachable store or failed audit: the reveal still fails closed with reveal-conflict.
    }
  }

  /** x_index as a fresh SecretBytes the caller disposes (cache, else from a checkpoint). */
  async #seed(chain: ChainSnapshot, index: number): Promise<SecretBytes> {
    const cached = this.#cache.get(chain.chainId)?.get(index);
    if (cached) return copySecret(cached);
    const c = checkpointAbove(index, chain.length, chain.checkpointInterval);
    const checkpoint = await this.#store.readCheckpoint(chain.chainId, c);
    try {
      // Up to interval − 1 hashes: walked in yielding slices, never in one block.
      return await this.#walkDown(checkpoint, c, index);
    } finally {
      checkpoint.dispose();
    }
  }

  /** x_target from x_topIndex (target ≤ topIndex), hashing in yielding slices. Fresh result. */
  async #walkDown(top: SecretBytes, topIndex: number, target: number): Promise<SecretBytes> {
    let current = copySecret(top);
    let index = topIndex;
    while (index > target) {
      const next = Math.max(target, index - HASH_SLICE_LINKS);
      const link = computeRoundSeed(this.#crypto.hash, current, index, next);
      current.dispose();
      current = link;
      index = next;
      if (index > target) await this.#yield();
    }
    return current;
  }

  async #compromise(chainId: string): Promise<void> {
    this.#evictChain(chainId);
    try {
      await this.#store.transitionChain(chainId, "compromised", "reveal-verification-failed");
      await this.#record("chain-transition", "reveal-round", chainId, null, "compromised");
    } catch {
      // Already compromised or unreachable: the reveal still fails closed.
    }
  }

  #evict(chainId: string, index: number): void {
    const cache = this.#cache.get(chainId);
    cache?.get(index)?.dispose();
    cache?.delete(index);
  }

  #evictChain(chainId: string): void {
    assertChainIdHex(chainId);
    this.#epochs.set(chainId, this.#epoch(chainId) + 1);
    const cache = this.#cache.get(chainId);
    if (!cache) return;
    for (const secret of cache.values()) secret.dispose();
    this.#cache.delete(chainId);
  }
}

function copySecret(secret: SecretBytes): SecretBytes {
  const tmp = secret.reveal();
  try {
    return SecretBytes.fromBytes(tmp);
  } finally {
    tmp.fill(0);
  }
}
