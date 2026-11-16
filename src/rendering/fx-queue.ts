// FX queue — renderer-owned, one-way FX event channel (Phase 7, step V1;
// docs/08 §4.2, docs/05 §12 and §17).
//
// The session forwards engine events through SceneRenderer.trigger(kind);
// the next frame() stamps them on the animation clock (RenderTime.animTime,
// never a wall clock). There are no timers, no loops and no randomness: an
// entry is a `{ kind, startedAt }` pair and everything else is derived from
// the frame's animTime. The queue is the renderer's only FX state and is
// reconstructible: a remount builds a fresh, empty queue (docs/05 §12).
//
// One crash clock (docs/08 §13.4). The `crash` entry never keeps a time of
// its own: each frame it takes `startedAt` from the chain-snap break the
// renderer already latches (ChainSnapClock, or a caller-supplied chainSnap).
// So the crash FX and the E-X7 Chain Snapped animation share one timestamp,
// and a backwards clock or remount re-latch moves both together. A crash
// trigger with no break on the next frame is stale and dropped; repeated
// crash triggers during one crash are ignored.
//
// V1 is infrastructure only: no layer reads the queue yet, the camera shake
// offset is always 0, and the motion and quality flags change nothing. The
// effects that use it (F6 crash, F7 reset dip) belong to V5 and V6.

import { CHAIN_SNAP_SETTLE_SECONDS } from "./layers/chain-snap";

/** FX events the session may trigger (docs/08 §5): `crashed` → crash, `bettingOpened` → reset. */
export type FxKind = "crash" | "reset";

/** Render quality (docs/05 §14 item 9). Behavior-neutral in V1. */
export type FxQuality = "high" | "low";

/** Provisional entry lifetimes in seconds; V5/V6 set the real ones with their effects. */
export const FX_LIFETIME_SECONDS: Readonly<Record<FxKind, number>> = {
  crash: CHAIN_SNAP_SETTLE_SECONDS,
  reset: 0.4,
};

/** An active FX entry, stamped on the animation clock. */
export interface FxEntry {
  readonly kind: FxKind;
  /** animTime the effect started, seconds. */
  readonly startedAt: number;
  /** animTime − startedAt at the last update, seconds, never negative. */
  readonly elapsed: number;
}

interface Slot {
  readonly entry: { kind: FxKind; startedAt: number; elapsed: number };
  pending: boolean;
  active: boolean;
  /** crash only: this break's entry has expired; stays retired until the break ends. */
  retired: boolean;
}

const slot = (kind: FxKind): Slot => ({
  entry: { kind, startedAt: 0, elapsed: 0 },
  pending: false,
  active: false,
  retired: false,
});

export class FxQueue {
  private readonly crash = slot("crash");
  private readonly reset = slot("reset");

  /** Queue an event; it is stamped by the next update(). Unknown kinds are ignored. */
  trigger(kind: FxKind): void {
    if (kind === "crash") {
      if (!this.crash.active) this.crash.pending = true;
    } else if (kind === "reset") {
      this.reset.pending = true;
    }
  }

  /**
   * Once per frame, before any layer renders. `crashStartedAt` is the
   * renderer's chain-snap break time (null when there is no break this frame).
   * A non-finite animTime leaves the queue untouched.
   */
  update(animTime: number, crashStartedAt: number | null): void {
    if (!Number.isFinite(animTime)) return;
    this.updateCrash(animTime, crashStartedAt);
    this.updateReset(animTime);
  }

  /** The active entry of a kind, or null. The returned object is reused across frames. */
  active(kind: FxKind): FxEntry | null {
    const s = kind === "crash" ? this.crash : kind === "reset" ? this.reset : null;
    return s !== null && s.active ? s.entry : null;
  }

  /** Drop every entry and pending trigger. */
  clear(): void {
    for (const s of [this.crash, this.reset]) {
      s.pending = false;
      s.active = false;
      s.retired = false;
    }
  }

  private updateCrash(animTime: number, startedAt: number | null): void {
    const s = this.crash;
    if (startedAt === null || !Number.isFinite(startedAt)) {
      // No break: a pending trigger is stale, and the break that retired the last entry is over.
      s.pending = false;
      s.active = false;
      s.retired = false;
      return;
    }
    if (s.pending && !s.retired) s.active = true;
    s.pending = false;
    if (!s.active) return;
    // The shared timestamp: re-read every frame, never copied into a clock of its own.
    s.entry.startedAt = startedAt;
    s.entry.elapsed = Math.max(0, animTime - startedAt);
    if (s.entry.elapsed >= FX_LIFETIME_SECONDS.crash) {
      s.active = false;
      s.retired = true;
    }
  }

  private updateReset(animTime: number): void {
    const s = this.reset;
    if (s.pending) {
      s.pending = false;
      s.active = true;
      s.entry.startedAt = animTime;
    }
    if (!s.active) return;
    if (animTime < s.entry.startedAt) {
      // Backwards clock: the entry cannot be placed on the new timeline.
      s.active = false;
      return;
    }
    s.entry.elapsed = animTime - s.entry.startedAt;
    if (s.entry.elapsed >= FX_LIFETIME_SECONDS.reset) s.active = false;
  }
}

/**
 * Camera shake offset (screen px, vertical) for this frame. V1 keeps it at
 * exactly 0 — the deterministic damped sine of F6 is V5 (docs/08 §4.2, Q11).
 * Reduced motion always yields 0.
 */
export function cameraShakeOffset(
  _queue: FxQueue,
  _animTime: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  return 0;
}
