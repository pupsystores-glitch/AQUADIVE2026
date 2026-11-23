// Checkpoint geometry of a reverse hash chain (P8-3c-2; owner-approved interval, provisional).
//
// A chain of length N keeps secret checkpoints x_c at every multiple c of the interval I below
// N, plus x_N itself (the chain seed). Round seed x_j is reconstructed from the nearest
// checkpoint at or above j: x_j = SHA-256^(c − j)(x_c), at most I − 1 hashes (src/fairness
// `computeRoundSeed(provider, x_c, c, j)` computes exactly that). Pure arithmetic, no secrets.

import { ChainError } from "./errors";

/** Owner-approved provisional checkpoint interval (P8-3c): 1,024 links. */
export const DEFAULT_CHECKPOINT_INTERVAL = 1024;

/** Upper bound for a configurable interval (a segment is reconstructed in one bounded walk). */
export const MAX_CHECKPOINT_INTERVAL = 65_536;

export function assertCheckpointInterval(interval: unknown): asserts interval is number {
  if (
    typeof interval !== "number" ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > MAX_CHECKPOINT_INTERVAL
  ) {
    throw new ChainError("invalid-checkpoint", "checkpoint interval is out of range");
  }
}

/** Every checkpoint index of a chain, in descending order (N first). */
export function checkpointIndices(length: number, interval: number): number[] {
  assertCheckpointInterval(interval);
  const out = [length];
  for (let c = Math.floor((length - 1) / interval) * interval; c >= interval; c -= interval) {
    out.push(c);
  }
  return out;
}

/** The checkpoint from which round index `index` (1 … length) is reconstructed. */
export function checkpointAbove(index: number, length: number, interval: number): number {
  assertCheckpointInterval(interval);
  if (!Number.isInteger(index) || index < 1 || index > length) {
    throw new ChainError("invalid-index", "round index is out of range");
  }
  return Math.min(length, Math.ceil(index / interval) * interval);
}
