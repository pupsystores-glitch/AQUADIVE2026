// Test helpers for the server fairness modules (P8-3c). DEVELOPMENT DATA ONLY: the chain below is
// the public, non-secret fv = 1 development vector chain (src/fairness/vectors.ts, x_0 … x_8).
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  SecretBytes,
  hexToBytes,
  type ChainCommitment,
} from "../../src/fairness";
import { MemoryAuditSink, type AuditEventInput, type AuditSink } from "../../src/fairness/audit";
import type {
  ChainSnapshot,
  ChainState,
  ChainStore,
  IndexSnapshot,
  NewChainInput,
  RevealNeighbours,
  RoundDisposition,
  StoreResult,
} from "../../src/fairness/chain-store";
import { ChainVault } from "../../src/fairness/chain-vault";
import { checkpointIndices } from "../../src/fairness/checkpoints";
import { MemoryChainStore } from "../../src/fairness/memory-chain-store";
import { nodeCrypto } from "./fairness-crypto";

export { expectCode, nodeCrypto, renderings } from "./fairness-crypto";

export const DEV = V;
/** x_0 of the development chain (public chain id). */
export const DEV_CHAIN_ID = V.linksHex[0];
export const saltA = (): Uint8Array => hexToBytes(V.saltAHex);
export const saltB = (): Uint8Array => hexToBytes(V.saltBHex);

export const newStore = (): MemoryChainStore => new MemoryChainStore({ mode: "test" });

export function devCommitment(): ChainCommitment {
  return { fv: V.fv, chainId: hexToBytes(V.linksHex[0]), length: V.chainLength };
}

/** The development chain's checkpoints for `interval` (fresh SecretBytes; the caller disposes). */
export function devCheckpoints(interval: number): Map<number, SecretBytes> {
  return new Map(
    checkpointIndices(V.chainLength, interval).map((c) => [
      c,
      SecretBytes.fromBytes(hexToBytes(V.linksHex[c])),
    ]),
  );
}

export function devChainInput(interval: number): NewChainInput {
  return {
    commitment: devCommitment(),
    checkpointInterval: interval,
    checkpoints: devCheckpoints(interval),
  };
}

/** A store holding the development chain (length 8) with the given checkpoint interval. */
export async function devStore(interval = 3, store: ChainStore = newStore()): Promise<ChainStore> {
  const input = devChainInput(interval);
  await store.createChain(input);
  for (const cp of input.checkpoints.values()) cp.dispose();
  return store;
}

export function newVault(
  store: ChainStore,
  options: { audit?: AuditSink; yieldSlice?: () => Promise<void> } = {},
): ChainVault {
  return new ChainVault({ crypto: nodeCrypto, store, ...options });
}

type Method = keyof Omit<ChainStore, "guarantees" | "close">;

interface Fault {
  /** "before": throw without calling the store. "after": call it, then throw (ambiguous). */
  readonly when: "before" | "after";
  remaining: number;
}

/** A ChainStore wrapper that injects failures and corrupts checkpoints on request. */
export class FaultyStore implements ChainStore {
  readonly inner: ChainStore;
  readonly guarantees: ChainStore["guarantees"];
  #faults = new Map<Method, Fault>();
  #corrupt = new Set<number>();

  constructor(inner: ChainStore) {
    this.inner = inner;
    this.guarantees = inner.guarantees;
  }

  fail(method: Method, when: "before" | "after" = "before", times = 1): void {
    this.#faults.set(method, { when, remaining: times });
  }

  /** readCheckpoint(c) returns x_c with one bit flipped. */
  corruptCheckpoint(c: number): void {
    this.#corrupt.add(c);
  }

  async #call<T>(method: Method, run: () => Promise<T>): Promise<T> {
    const fault = this.#faults.get(method);
    if (fault && fault.remaining > 0) {
      fault.remaining--;
      if (fault.when === "before") throw new Error(`injected ${method} failure`);
      await run();
      throw new Error(`injected ${method} failure after the store call`);
    }
    return run();
  }

  createChain(input: NewChainInput): Promise<ChainSnapshot> {
    return this.#call("createChain", () => this.inner.createChain(input));
  }
  getChain(chainId: string): Promise<ChainSnapshot> {
    return this.#call("getChain", () => this.inner.getChain(chainId));
  }
  transitionChain(chainId: string, to: ChainState, reason: string): Promise<ChainSnapshot> {
    return this.#call("transitionChain", () => this.inner.transitionChain(chainId, to, reason));
  }
  reserveIndex(chainId: string, requestId: string): Promise<StoreResult<IndexSnapshot>> {
    return this.#call("reserveIndex", () => this.inner.reserveIndex(chainId, requestId));
  }
  getIndex(chainId: string, index: number): Promise<IndexSnapshot> {
    return this.#call("getIndex", () => this.inner.getIndex(chainId, index));
  }
  bindSalt(chainId: string, index: number, salt: Uint8Array): Promise<StoreResult<IndexSnapshot>> {
    return this.#call("bindSalt", () => this.inner.bindSalt(chainId, index, salt));
  }
  markDerivationIssued(chainId: string, index: number): Promise<IndexSnapshot> {
    return this.#call("markDerivationIssued", () =>
      this.inner.markDerivationIssued(chainId, index),
    );
  }
  classifyRound(
    chainId: string,
    index: number,
    disposition: RoundDisposition,
    reason: string,
  ): Promise<StoreResult<IndexSnapshot>> {
    return this.#call("classifyRound", () =>
      this.inner.classifyRound(chainId, index, disposition, reason),
    );
  }
  revealNeighbours(chainId: string, index: number): Promise<RevealNeighbours> {
    return this.#call("revealNeighbours", () => this.inner.revealNeighbours(chainId, index));
  }
  recordReveal(
    chainId: string,
    index: number,
    seed: Uint8Array,
    previousLink: Uint8Array,
  ): Promise<StoreResult<IndexSnapshot>> {
    return this.#call("recordReveal", () =>
      this.inner.recordReveal(chainId, index, seed, previousLink),
    );
  }
  readCheckpoint(chainId: string, c: number): Promise<SecretBytes> {
    return this.#call("readCheckpoint", async () => {
      const cp = await this.inner.readCheckpoint(chainId, c);
      if (!this.#corrupt.has(c)) return cp;
      const bytes = cp.reveal();
      cp.dispose();
      bytes[0] ^= 1;
      const bad = SecretBytes.fromBytes(bytes);
      bytes.fill(0);
      return bad;
    });
  }
  close(): void {
    this.inner.close();
  }
}

/** An audit sink that fails for chosen event kinds (a fixed number of times). */
export class FailingAudit implements AuditSink {
  readonly guarantees = { durable: false, tamperEvident: false };
  readonly inner = new MemoryAuditSink();
  #failures = new Map<AuditEventInput["kind"], number>();

  failOn(kind: AuditEventInput["kind"], times = 1): void {
    this.#failures.set(kind, times);
  }

  append(event: AuditEventInput): void {
    const left = this.#failures.get(event.kind) ?? 0;
    if (left > 0) {
      this.#failures.set(event.kind, left - 1);
      throw new Error("injected audit failure");
    }
    this.inner.append(event);
  }
}
