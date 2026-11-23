// DEVELOPMENT-ONLY in-memory chain store (P8-3c-2).
//
// Implements the ChainStore rules (chain-store.ts) for ONE running process. It makes no durable
// or transactional claim: everything, including the secret checkpoints and the last reserved
// index, is lost when the process ends. After a restart the previous chains are simply unknown
// (`unknown-chain`); nothing reconstructs or reuses lost state, and a new chain can only come from
// the explicit new-chain workflow (ChainVault.createChain). Durable recovery is P8-7.
//
// It refuses to run in production: the caller must state a development mode, and the store
// refuses whenever NODE_ENV is anything but unset, "development" or "test".
//
// Each method runs synchronously to completion inside its returned promise, so every single call
// is atomic with respect to concurrent callers on the event loop (two concurrent reservations can
// never receive the same index). Multi-step sequences are not transactions.

import {
  FairnessError,
  HASH_BYTES,
  MAX_SALT_BYTES,
  MIN_SALT_BYTES,
  SecretBytes,
  assertChainLength,
  assertSupportedVersion,
  bytesEqual,
  bytesToHex,
} from "../fairness";
import {
  CHAIN_STATE_RULES,
  CHAIN_TRANSITIONS,
  assertChainIdHex,
  assertDisposition,
  assertReasonCode,
  assertRequestId,
  type ChainSnapshot,
  type ChainState,
  type ChainStore,
  type DispositionEntry,
  type IndexSnapshot,
  type NewChainInput,
  type RevealNeighbours,
  type RoundDisposition,
  type StoreGuarantees,
  type StoreResult,
} from "./chain-store";
import { assertCheckpointInterval, checkpointIndices } from "./checkpoints";
import { ChainError } from "./errors";

/** Longest chain this store accepts (16,384 checkpoints at the default interval). */
export const MEMORY_STORE_MAX_CHAIN_LENGTH = 2 ** 24;

export type DevelopmentMode = "development" | "test";

/** NODE_ENV values under which the development store may run (unset counts as development). */
const ALLOWED_NODE_ENV: readonly (string | undefined)[] = [undefined, "", "development", "test"];

export interface MemoryChainStoreOptions {
  /** Explicit acknowledgement that this is a development or test process. */
  readonly mode: DevelopmentMode;
  /** The environment to check (default: process.env). */
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

const GUARANTEES: StoreGuarantees = Object.freeze({
  durable: false,
  crossProcessIndexUniqueness: false,
  multiStepTransactions: false,
  productionUse: false,
});

interface IndexRecord {
  readonly index: number;
  readonly requestId: string;
  salt: Uint8Array | null;
  issued: boolean;
  disposition: RoundDisposition | null;
  readonly history: DispositionEntry[];
  seed: Uint8Array | null;
  previousLink: Uint8Array | null;
}

interface ChainRecord {
  readonly chainId: string;
  readonly chainIdBytes: Uint8Array;
  readonly fv: number;
  readonly length: number;
  readonly interval: number;
  state: ChainState;
  lastReserved: number;
  readonly checkpoints: Map<number, SecretBytes>;
  readonly indices: Map<number, IndexRecord>;
  readonly requests: Map<string, number>;
  /** Reserved indices that are neither classified nor revealed. */
  readonly open: Set<number>;
  /** Revealed indices, ascending. */
  readonly revealed: number[];
}

const INSPECT = Symbol.for("nodejs.util.inspect.custom");

export class MemoryChainStore implements ChainStore {
  readonly guarantees: StoreGuarantees = GUARANTEES;
  #chains = new Map<string, ChainRecord>();
  #closed = false;

  constructor(options: MemoryChainStoreOptions) {
    assertDevelopmentUse(options);
    Object.freeze(this);
  }

  async createChain(input: NewChainInput): Promise<ChainSnapshot> {
    this.#live();
    const { commitment, checkpointInterval, checkpoints } = input ?? ({} as NewChainInput);
    try {
      assertSupportedVersion(commitment?.fv);
      assertChainLength(commitment.length);
    } catch {
      throw new ChainError("invalid-chain-length", "commitment is malformed");
    }
    if (!(commitment.chainId instanceof Uint8Array) || commitment.chainId.length !== HASH_BYTES) {
      throw new ChainError("invalid-chain-id", "chain id must be 32 bytes");
    }
    if (commitment.length > MEMORY_STORE_MAX_CHAIN_LENGTH) {
      throw new ChainError("invalid-chain-length", "chain is too long for the in-memory store");
    }
    assertCheckpointInterval(checkpointInterval);
    const chainId = bytesToHex(commitment.chainId);
    if (this.#chains.has(chainId)) throw new ChainError("chain-exists", "chain already stored");

    const expected = checkpointIndices(commitment.length, checkpointInterval);
    if (!(checkpoints instanceof Map) || checkpoints.size !== expected.length) {
      throw new ChainError("invalid-checkpoint", "checkpoint set is incomplete");
    }
    const copies = new Map<number, SecretBytes>();
    try {
      for (const c of expected) {
        const cp = checkpoints.get(c);
        if (!(cp instanceof SecretBytes) || cp.length !== HASH_BYTES) {
          throw new ChainError("invalid-checkpoint", "checkpoint set is incomplete");
        }
        const tmp = cp.reveal();
        try {
          copies.set(c, SecretBytes.fromBytes(tmp));
        } finally {
          tmp.fill(0);
        }
      }
    } catch (err) {
      for (const cp of copies.values()) cp.dispose();
      throw err;
    }

    const record: ChainRecord = {
      chainId,
      chainIdBytes: Uint8Array.from(commitment.chainId),
      fv: commitment.fv,
      length: commitment.length,
      interval: checkpointInterval,
      state: "active",
      lastReserved: 0,
      checkpoints: copies,
      indices: new Map(),
      requests: new Map(),
      open: new Set(),
      revealed: [],
    };
    this.#chains.set(chainId, record);
    return chainSnapshot(record);
  }

  async getChain(chainId: string): Promise<ChainSnapshot> {
    return chainSnapshot(this.#chain(chainId));
  }

  async transitionChain(
    chainId: string,
    to: ChainState,
    reasonCode: string,
  ): Promise<ChainSnapshot> {
    const chain = this.#chain(chainId);
    assertReasonCode(reasonCode);
    if (!CHAIN_TRANSITIONS[chain.state].includes(to)) {
      throw new ChainError("invalid-transition", `chain cannot go from ${chain.state} to ${to}`);
    }
    chain.state = to;
    return chainSnapshot(chain);
  }

  async reserveIndex(chainId: string, requestId: string): Promise<StoreResult<IndexSnapshot>> {
    const chain = this.#chain(chainId);
    assertRequestId(requestId);
    const held = chain.requests.get(requestId);
    if (held !== undefined) {
      return { value: indexSnapshot(chain, this.#index(chain, held)), replayed: true };
    }
    if (!CHAIN_STATE_RULES[chain.state].reserve) {
      if (chain.state === "exhausted")
        throw new ChainError("chain-exhausted", "chain is exhausted");
      throw new ChainError("invalid-chain-state", `cannot reserve in state ${chain.state}`);
    }
    const index = chain.lastReserved + 1;
    if (index > chain.length) {
      // Unreachable while the state is kept correctly; fail closed regardless.
      throw new ChainError("chain-exhausted", "chain is exhausted");
    }
    const record: IndexRecord = {
      index,
      requestId,
      salt: null,
      issued: false,
      disposition: null,
      history: [],
      seed: null,
      previousLink: null,
    };
    chain.lastReserved = index;
    chain.indices.set(index, record);
    chain.requests.set(requestId, index);
    chain.open.add(index);
    if (index === chain.length) chain.state = "exhausted";
    return { value: indexSnapshot(chain, record), replayed: false };
  }

  async getIndex(chainId: string, index: number): Promise<IndexSnapshot> {
    const chain = this.#chain(chainId);
    return indexSnapshot(chain, this.#index(chain, index));
  }

  async bindSalt(
    chainId: string,
    index: number,
    salt: Uint8Array,
  ): Promise<StoreResult<IndexSnapshot>> {
    const chain = this.#chain(chainId);
    const record = this.#index(chain, index);
    if (
      !(salt instanceof Uint8Array) ||
      salt.length < MIN_SALT_BYTES ||
      salt.length > MAX_SALT_BYTES
    ) {
      throw new FairnessError("invalid-salt", "salt must be 16 to 64 bytes");
    }
    if (record.salt !== null) {
      if (bytesEqual(record.salt, salt)) {
        return { value: indexSnapshot(chain, record), replayed: true };
      }
      throw new ChainError("salt-conflict", `index ${index} is bound to a different salt`);
    }
    this.#assertDerivable(chain, record);
    record.salt = Uint8Array.from(salt);
    return { value: indexSnapshot(chain, record), replayed: false };
  }

  async markDerivationIssued(chainId: string, index: number): Promise<IndexSnapshot> {
    const chain = this.#chain(chainId);
    const record = this.#index(chain, index);
    this.#assertDerivable(chain, record);
    if (record.salt === null) throw new ChainError("salt-not-bound", `index ${index} has no salt`);
    if (record.issued) {
      throw new ChainError("derivation-already-issued", `index ${index} was already derived`);
    }
    record.issued = true;
    return indexSnapshot(chain, record);
  }

  async classifyRound(
    chainId: string,
    index: number,
    disposition: RoundDisposition,
    reasonCode: string,
  ): Promise<StoreResult<IndexSnapshot>> {
    const chain = this.#chain(chainId);
    const record = this.#index(chain, index);
    assertDisposition(disposition);
    assertReasonCode(reasonCode);
    if (disposition === "completed" && !record.issued) {
      throw new ChainError("invalid-disposition", "a round without outcomes cannot be completed");
    }
    const current = record.disposition;
    const last = record.history.at(-1);
    if (current === disposition && last?.reasonCode === reasonCode) {
      return { value: indexSnapshot(chain, record), replayed: true };
    }
    if (current !== null && !(current === "indeterminate" && disposition !== "indeterminate")) {
      throw new ChainError("disposition-conflict", `index ${index} is already classified`);
    }
    record.disposition = disposition;
    record.history.push(Object.freeze({ disposition, reasonCode }));
    chain.open.delete(index);
    return { value: indexSnapshot(chain, record), replayed: false };
  }

  async revealNeighbours(chainId: string, index: number): Promise<RevealNeighbours> {
    const chain = this.#chain(chainId);
    this.#index(chain, index);
    const seedHex = (r: number) => bytesToHex(chain.indices.get(r)?.seed as Uint8Array);
    const list = chain.revealed;
    const firstNotBelow = lowerBound(list, index);
    const r = list[firstNotBelow] === index ? firstNotBelow + 1 : firstNotBelow;
    const below: RevealNeighbours["below"] =
      firstNotBelow > 0
        ? { index: list[firstNotBelow - 1], linkHex: seedHex(list[firstNotBelow - 1]) }
        : { index: 0, linkHex: chain.chainId };
    const above: RevealNeighbours["above"] =
      r < list.length ? { index: list[r], seedHex: seedHex(list[r]) } : null;
    return Object.freeze({ below: Object.freeze(below), above: above && Object.freeze(above) });
  }

  async recordReveal(
    chainId: string,
    index: number,
    seed: Uint8Array,
    previousLink: Uint8Array,
  ): Promise<StoreResult<IndexSnapshot>> {
    const chain = this.#chain(chainId);
    const record = this.#index(chain, index);
    if (!CHAIN_STATE_RULES[chain.state].reveal) {
      throw new ChainError("invalid-chain-state", `cannot reveal in state ${chain.state}`);
    }
    for (const bytes of [seed, previousLink]) {
      if (!(bytes instanceof Uint8Array) || bytes.length !== HASH_BYTES) {
        throw new FairnessError("invalid-bytes", "reveal data must be 32-byte links");
      }
    }
    if (record.seed !== null && record.previousLink !== null) {
      if (bytesEqual(record.seed, seed) && bytesEqual(record.previousLink, previousLink)) {
        return { value: indexSnapshot(chain, record), replayed: true };
      }
      this.#compromise(chain);
      throw new ChainError("reveal-conflict", `index ${index} was revealed with different data`);
    }
    if (record.disposition === null) {
      throw new ChainError("round-not-concluded", `index ${index} is not classified`);
    }
    for (const open of chain.open) {
      if (open < index) {
        throw new ChainError("reveal-order-violation", `an earlier index is still open`);
      }
    }
    const below = index === 1 ? chain.chainIdBytes : chain.indices.get(index - 1)?.seed;
    const aboveLink = chain.indices.get(index + 1)?.previousLink;
    if (
      (below && !bytesEqual(below, previousLink)) ||
      (aboveLink && !bytesEqual(aboveLink, seed))
    ) {
      this.#compromise(chain);
      throw new ChainError("reveal-conflict", `index ${index} contradicts a recorded neighbour`);
    }
    record.seed = Uint8Array.from(seed);
    record.previousLink = Uint8Array.from(previousLink);
    chain.open.delete(index);
    insertSorted(chain.revealed, index);
    return { value: indexSnapshot(chain, record), replayed: false };
  }

  async readCheckpoint(chainId: string, checkpointIndex: number): Promise<SecretBytes> {
    const chain = this.#chain(chainId);
    if (!CHAIN_STATE_RULES[chain.state].reveal) {
      throw new ChainError("invalid-chain-state", `cannot read secrets in state ${chain.state}`);
    }
    const cp = chain.checkpoints.get(checkpointIndex);
    if (!cp) throw new ChainError("invalid-checkpoint", "no checkpoint at this index");
    const tmp = cp.reveal();
    try {
      return SecretBytes.fromBytes(tmp);
    } finally {
      tmp.fill(0);
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const chain of this.#chains.values()) {
      for (const cp of chain.checkpoints.values()) cp.dispose();
      chain.checkpoints.clear();
    }
    this.#chains.clear();
  }

  toJSON(): { store: string; guarantees: StoreGuarantees } {
    return { store: "MemoryChainStore", guarantees: GUARANTEES };
  }

  [INSPECT](): string {
    return "MemoryChainStore [development only; secrets redacted]";
  }

  #live(): void {
    if (this.#closed) throw new ChainError("store-closed", "the store was closed");
  }

  #chain(chainId: string): ChainRecord {
    this.#live();
    assertChainIdHex(chainId);
    const chain = this.#chains.get(chainId);
    if (!chain) throw new ChainError("unknown-chain", "chain is not in this store");
    return chain;
  }

  #index(chain: ChainRecord, index: number): IndexRecord {
    if (!Number.isInteger(index) || index < 1 || index > chain.length) {
      throw new ChainError("invalid-index", "round index is out of range");
    }
    const record = chain.indices.get(index);
    if (!record) throw new ChainError("index-not-reserved", `index ${index} is not reserved`);
    return record;
  }

  #assertDerivable(chain: ChainRecord, record: IndexRecord): void {
    if (!CHAIN_STATE_RULES[chain.state].derive) {
      throw new ChainError("invalid-chain-state", `cannot derive in state ${chain.state}`);
    }
    if (record.disposition !== null || record.seed !== null) {
      throw new ChainError("disposition-conflict", `index ${record.index} is already concluded`);
    }
  }

  #compromise(chain: ChainRecord): void {
    chain.state = "compromised";
  }
}

/** Throws `development-store-refused` unless this is explicitly a development or test process. */
export function assertDevelopmentUse(options: MemoryChainStoreOptions): void {
  const mode = options?.mode;
  if (mode !== "development" && mode !== "test") {
    throw new ChainError("development-store-refused", "the in-memory store is development-only");
  }
  const env = options.environment ?? process.env;
  if (!ALLOWED_NODE_ENV.includes(env.NODE_ENV)) {
    throw new ChainError("development-store-refused", "refused outside development and test");
  }
}

function chainSnapshot(chain: ChainRecord): ChainSnapshot {
  return Object.freeze({
    chainId: chain.chainId,
    fv: chain.fv,
    length: chain.length,
    checkpointInterval: chain.interval,
    state: chain.state,
    lastReservedIndex: chain.lastReserved,
    revealedCount: chain.revealed.length,
  });
}

function indexSnapshot(chain: ChainRecord, record: IndexRecord): IndexSnapshot {
  return Object.freeze({
    chainId: chain.chainId,
    index: record.index,
    requestId: record.requestId,
    saltHex: record.salt && bytesToHex(record.salt),
    derivationIssued: record.issued,
    disposition: record.disposition,
    dispositionHistory: Object.freeze([...record.history]),
    reveal:
      record.seed && record.previousLink
        ? Object.freeze({
            seedHex: bytesToHex(record.seed),
            previousLinkHex: bytesToHex(record.previousLink),
          })
        : null,
  });
}

/** The first position in ascending `list` whose value is ≥ `value`. */
function lowerBound(list: readonly number[], value: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function insertSorted(list: number[], value: number): void {
  list.splice(lowerBound(list, value), 0, value);
}
