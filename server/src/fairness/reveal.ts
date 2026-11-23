// Reveal verification (P8-3c-2).
//
// Before the vault records a reveal of x_j it checks the seed against links that are already
// trusted: the nearest revealed index below (or the chain id x_0) must equal SHA-256^(j − r)(x_j),
// and the nearest revealed index above, if any, must hash down to x_j. Normally reveals are
// consecutive and this costs one hash; a gap (rounds classified but not yet revealed) costs one
// hash per skipped link, computed in slices that yield to the event loop so a long gap never
// blocks it. A mismatch means the vault's secret material is corrupt: the caller fails closed.
//
// Every intermediate link here is at or below x_j, so none of it is secret once x_j is revealed;
// superseded buffers are still zeroed.

import { bytesEqual, hexToBytes, sha256, type FairnessHashProvider } from "../fairness";
import type { RevealNeighbours } from "./chain-store";
import { ChainError } from "./errors";

/** Hashes per uninterrupted slice of a long verification walk. */
export const VERIFY_SLICE_LINKS = 256;

export interface RevealCandidate {
  readonly chainIndex: number;
  /** The candidate x_j (a copy the caller owns). */
  readonly seed: Uint8Array;
  readonly neighbours: RevealNeighbours;
}

/** SHA-256 applied `times` times to a copy of `start`, yielding every VERIFY_SLICE_LINKS. */
async function hashForward(
  provider: FairnessHashProvider,
  start: Uint8Array,
  times: number,
  yieldSlice: () => Promise<void>,
): Promise<Uint8Array> {
  let x = Uint8Array.from(start);
  for (let i = 0; i < times; i++) {
    const next = sha256(provider, x);
    x.fill(0);
    x = next;
    if ((i + 1) % VERIFY_SLICE_LINKS === 0) await yieldSlice();
  }
  return x;
}

/**
 * Verifies a candidate seed against its revealed neighbours and returns its predecessor
 * x_(j−1) = SHA-256(x_j). Throws `reveal-verification-failed` on any mismatch.
 */
export async function verifyRevealCandidate(
  provider: FairnessHashProvider,
  candidate: RevealCandidate,
  yieldSlice: () => Promise<void>,
): Promise<Uint8Array> {
  const { chainIndex, seed, neighbours } = candidate;
  const { below, above } = neighbours;
  if (below.index >= chainIndex || (above !== null && above.index <= chainIndex)) {
    throw new ChainError("reveal-verification-failed", "reveal neighbours are inconsistent");
  }
  const previousLink = sha256(provider, seed);
  const atBelow = await hashForward(
    provider,
    previousLink,
    chainIndex - 1 - below.index,
    yieldSlice,
  );
  const belowOk = bytesEqual(atBelow, hexToBytes(below.linkHex));
  atBelow.fill(0);
  let aboveOk = true;
  if (above !== null) {
    const fromAbove = await hashForward(
      provider,
      hexToBytes(above.seedHex),
      above.index - chainIndex,
      yieldSlice,
    );
    aboveOk = bytesEqual(fromAbove, seed);
    fromAbove.fill(0);
  }
  if (!belowOk || !aboveOk) {
    previousLink.fill(0);
    throw new ChainError(
      "reveal-verification-failed",
      `index ${chainIndex} does not link to the revealed chain`,
    );
  }
  return previousLink;
}
