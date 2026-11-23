// Allow-listed fairness records (P8-3c-2).
//
// Builders that copy ONLY named public fields out of store snapshots into frozen plain objects
// of strings, numbers and nulls. They are the only shape the vault returns to callers. A record
// never contains an unrevealed seed, a checkpoint, a draw count or any other private store state:
// a reveal record carries exactly the revealed seed x_j and its predecessor x_(j−1), both public
// once the reveal is recorded.
//
// "Public-safe" is not "published": fv = 1 is INTERNAL AND EXPERIMENTAL, and no record is
// published, broadcast or served by an endpoint (public fairness is not activated).

import { FAIRNESS_STATUS } from "../fairness";
import type { ChainSnapshot, IndexSnapshot, RoundDisposition } from "./chain-store";

type Status = typeof FAIRNESS_STATUS;

export interface ChainCommitmentRecord {
  readonly kind: "chain-commitment";
  readonly status: Status;
  readonly fv: number;
  readonly chainId: string;
  readonly length: number;
}

export interface ChainStatusRecord {
  readonly kind: "chain-status";
  readonly status: Status;
  readonly chainId: string;
  readonly state: string;
  readonly lastReservedIndex: number;
  readonly revealedCount: number;
}

export interface RoundReservationRecord {
  readonly kind: "round-reservation";
  readonly status: Status;
  readonly chainId: string;
  readonly chainIndex: number;
}

export interface RoundDispositionRecord {
  readonly kind: "round-disposition";
  readonly status: Status;
  readonly chainId: string;
  readonly chainIndex: number;
  readonly disposition: RoundDisposition;
  readonly reasonCode: string;
}

export interface RoundRevealRecord {
  readonly kind: "round-reveal";
  readonly status: Status;
  readonly fv: number;
  readonly chainId: string;
  readonly chainLength: number;
  readonly chainIndex: number;
  /** x_j, the round seed. */
  readonly seed: string;
  /** x_(j−1) = SHA-256(x_j) (the chain id for j = 1). */
  readonly previousLink: string;
  /** The bound public salt, or null if the round was never derived. */
  readonly salt: string | null;
  readonly disposition: RoundDisposition;
}

export type FairnessRecord =
  | ChainCommitmentRecord
  | ChainStatusRecord
  | RoundReservationRecord
  | RoundDispositionRecord
  | RoundRevealRecord;

/** The exact field set of every record kind. */
export const RECORD_FIELDS: Readonly<Record<FairnessRecord["kind"], readonly string[]>> =
  Object.freeze({
    "chain-commitment": Object.freeze(["kind", "status", "fv", "chainId", "length"]),
    "chain-status": Object.freeze([
      "kind",
      "status",
      "chainId",
      "state",
      "lastReservedIndex",
      "revealedCount",
    ]),
    "round-reservation": Object.freeze(["kind", "status", "chainId", "chainIndex"]),
    "round-disposition": Object.freeze([
      "kind",
      "status",
      "chainId",
      "chainIndex",
      "disposition",
      "reasonCode",
    ]),
    "round-reveal": Object.freeze([
      "kind",
      "status",
      "fv",
      "chainId",
      "chainLength",
      "chainIndex",
      "seed",
      "previousLink",
      "salt",
      "disposition",
    ]),
  });

/** Freezes a record after checking its fields against the allow-list and its value types. */
function seal<T extends FairnessRecord>(record: T): T {
  const allowed = RECORD_FIELDS[record.kind];
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || keys.some((k) => !allowed.includes(k))) {
    throw new TypeError(`record ${record.kind} has fields outside its allow-list`);
  }
  for (const value of Object.values(record)) {
    if (value !== null && typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`record ${record.kind} has a non-primitive field`);
    }
  }
  return Object.freeze(record);
}

export function chainCommitmentRecord(chain: ChainSnapshot): ChainCommitmentRecord {
  return seal({
    kind: "chain-commitment",
    status: FAIRNESS_STATUS,
    fv: chain.fv,
    chainId: chain.chainId,
    length: chain.length,
  });
}

export function chainStatusRecord(chain: ChainSnapshot): ChainStatusRecord {
  return seal({
    kind: "chain-status",
    status: FAIRNESS_STATUS,
    chainId: chain.chainId,
    state: chain.state,
    lastReservedIndex: chain.lastReservedIndex,
    revealedCount: chain.revealedCount,
  });
}

export function roundReservationRecord(index: IndexSnapshot): RoundReservationRecord {
  return seal({
    kind: "round-reservation",
    status: FAIRNESS_STATUS,
    chainId: index.chainId,
    chainIndex: index.index,
  });
}

export function roundDispositionRecord(index: IndexSnapshot): RoundDispositionRecord {
  const last = index.dispositionHistory.at(-1);
  if (index.disposition === null || !last) {
    throw new TypeError("round has no disposition");
  }
  return seal({
    kind: "round-disposition",
    status: FAIRNESS_STATUS,
    chainId: index.chainId,
    chainIndex: index.index,
    disposition: index.disposition,
    reasonCode: last.reasonCode,
  });
}

export function roundRevealRecord(chain: ChainSnapshot, index: IndexSnapshot): RoundRevealRecord {
  if (index.reveal === null || index.disposition === null) {
    throw new TypeError("round is not revealed");
  }
  return seal({
    kind: "round-reveal",
    status: FAIRNESS_STATUS,
    fv: chain.fv,
    chainId: chain.chainId,
    chainLength: chain.length,
    chainIndex: index.index,
    seed: index.reveal.seedHex,
    previousLink: index.reveal.previousLinkHex,
    salt: index.saltHex,
    disposition: index.disposition,
  });
}
