// Rendering contract types — RenderState / RenderCreature / RenderTime /
// RenderLayer (Sprint 2, Commit R3; docs/05_RENDERING_ARCHITECTURE.md §4).
//
// The renderer is a pure consumer: it receives an immutable-by-convention
// RenderState snapshot plus a RenderTime and produces pixels. It never
// mutates game state, never computes outcomes, never knows money exists.
//
// This module OWNS the contract types (Sprint 3, Commit E2, resolving the
// R1 relocation note): `Phase` and `RenderCreature` are defined here, and
// the engine's domain types conform to them — the one sanctioned type-only
// import direction points engine → rendering (docs/06 §4), never the
// reverse.

import type { CreatureKind } from "@/shared/creatures";
import type { Camera } from "./camera";
import type { FxQuality } from "./fx-queue";

/** Renderer phase strings — engine states map onto these via a fixed projection (docs/06 §5). */
export type Phase = "idle" | "diving" | "cashed" | "crashed" | "bonus";

/** The subset of a creature the renderer is allowed to see (§10). */
export interface RenderCreature {
  kind: CreatureKind;
  x: number; // 0..1 horizontal position
  worldY: number; // absolute depth (pixels in world space)
  size: number;
  phase: number; // anim offset
  dir: 1 | -1;
  consumed?: boolean;
}

/** Per-frame scene snapshot — produced by the caller (component now, engine after Phase 5). */
export interface RenderState {
  readonly phase: Phase;
  /** Anchor depth, world px. */
  readonly worldY: number;
  /** 0..1 of CHAIN_MAX_DEPTH. */
  readonly depthRatio: number;
  /** 0..1 golden boost. */
  readonly boost: number;
  readonly creatures: readonly RenderCreature[];
  readonly crashed: boolean;
  /** Seconds since ship impact (renderer-clock based), or null when no FX is active. */
  readonly shipImpact: { readonly elapsed: number } | null;
  /**
   * E-X7 — chain-snap timing while crashed. Renderer-owned: the engine never
   * sets it. SceneRenderer derives it from the phase transition and the
   * animation clock (layers/chain-snap.ts, ChainSnapClock) when the caller
   * leaves it undefined; a future renderer FX queue (docs/08 V1) may supply it
   * instead, so there is only ever one crash clock.
   */
  readonly chainSnap?: ChainSnapTiming | null;
}

/** When the chain snapped, on the animation clock (E-X7). */
export interface ChainSnapTiming {
  /** animTime of the break (the first rendered crashed frame), seconds. */
  readonly startedAt: number;
  /** animTime − startedAt, seconds, never negative. */
  readonly elapsed: number;
}

/** The only time the renderer ever sees — no wall clocks inside src/rendering (§4). */
export interface RenderTime {
  /** Accumulated simulation-time seconds (dt-clamped); drives sway, rays, bubbles, wiggle. */
  readonly animTime: number;
  /** This frame's clamped dt in seconds. */
  readonly frameDt: number;
}

/**
 * Renderer FX settings handed to every layer (Phase 7 step V2, D-V2-1
 * option E). Renderer-owned and read-only for layers: SceneRenderer keeps one
 * object (set through setMotion / setQuality) and passes the same reference
 * every frame. It is never part of RenderState and the engine never sees it.
 */
export interface FxSettings {
  /** True: no time-driven decorative motion. */
  readonly reducedMotion: boolean;
  /** Render quality (docs/05 §14 item 9). */
  readonly quality: FxQuality;
  /**
   * V6 (F7): the FX queue's active reset entry, or null. SceneRenderer
   * forwards the queue's own entry object each frame (fx-queue.ts
   * FxQueue.active("reset")), so the queue stays the only reset clock.
   * Renderer-owned presentation data, never engine state; optional so FX
   * settings built without it (layer tests, defaults) mean "no reset".
   */
  readonly reset?: { readonly elapsed: number } | null;
}

/**
 * One z-ordered slice of the scene; order in SceneRenderer's array is z-order (§5).
 * SceneRenderer always passes `fx`. It is optional in the type so a layer
 * rendered on its own (the layer tests written before V2) needs no change; a
 * layer that reads it falls back to the renderer's defaults (high, full motion).
 */
export interface RenderLayer {
  readonly name: string;
  render(
    ctx: CanvasRenderingContext2D,
    state: RenderState,
    camera: Camera,
    time: RenderTime,
    fx?: FxSettings,
  ): void;
}
