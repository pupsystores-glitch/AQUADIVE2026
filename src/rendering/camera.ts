// Camera — vertical-only, anchor-locked world→screen transform
// (Sprint 2, Commit R2; docs/05_RENDERING_ARCHITECTURE.md §6).
// The transform reproduces the component's former inline closure bit-for-bit:
//   screenY = h * ANCHOR_SCREEN_Y_FRAC + (worldY − (followY + ANCHOR_WORLD_OFFSET_PX))
// X is untransformed by design; the camera stays vertical-only until a
// feature demands otherwise.
//
// Presentation offset (docs/05 §6 extension point: an additive offset applied
// inside worldToScreenY): the pre-dive view shifts the world down on short
// viewports so the surface ship is fully visible (layers/presentation.ts).
// It is 0 during normal diving, which leaves the transform bit-identical.
//
// Shake offset (docs/05 §6 reserved `shake`, docs/08 §4.2; V1): a second
// additive screen-Y offset, set once per frame by SceneRenderer from the FX
// queue. V1 always sets 0, so the transform is unchanged; the deterministic
// crash shake (F6) is V5.

import { ANCHOR_WORLD_OFFSET_PX } from "@/shared/world";
import { ANCHOR_SCREEN_Y_FRAC } from "./constants";

export class Camera {
  private followY = 0;
  private offsetY = 0;
  private shakeY = 0;

  readonly viewport = { w: 0, h: 0 };

  /** Owner-only: update the viewport size (CSS pixels) before rendering. */
  setViewport(w: number, h: number) {
    this.viewport.w = w;
    this.viewport.h = h;
  }

  /** Owner-only: anchor-locked follow — the world scrolls past the pinned anchor. */
  follow(worldY: number) {
    this.followY = worldY;
  }

  /** Owner-only: additive screen-Y offset for the pre-dive presentation (0 = none). */
  setPresentationOffset(dy: number) {
    this.offsetY = dy;
  }

  /** Owner-only: additive screen-Y shake offset (0 = none; a non-finite value is treated as 0). */
  setShake(dy: number) {
    this.shakeY = Number.isFinite(dy) ? dy : 0;
  }

  /** The current shake offset (screen px). */
  get shakeOffset(): number {
    return this.shakeY;
  }

  worldToScreenY(worldY: number): number {
    return (
      this.viewport.h * ANCHOR_SCREEN_Y_FRAC +
      (worldY - (this.followY + ANCHOR_WORLD_OFFSET_PX)) +
      this.offsetY +
      this.shakeY
    );
  }

  /**
   * Culling predicate: is a world-Y position within the viewport plus margins?
   * Margins are independent per edge (§6 correction, R2); pass `Infinity` to
   * disable a bound. Comparisons are inclusive.
   */
  isVisibleY(worldY: number, marginTop: number, marginBottom: number = marginTop): boolean {
    const sy = this.worldToScreenY(worldY);
    return sy >= -marginTop && sy <= this.viewport.h + marginBottom;
  }
}
