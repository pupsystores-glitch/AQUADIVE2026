// SceneRenderer — the renderer's single public entry point (Sprint 2,
// Commit R3; docs/05_RENDERING_ARCHITECTURE.md §4). Owns the 2D context,
// backing-store sizing, DPR clamp, per-frame clear/transform reset, the
// Camera, and the ordered layer list (order in the array IS z-order, §5).
//
// frame(state, time) renders one complete frame and is idempotent for
// identical inputs (modulo the Effects layer's permitted RNG, §12). The
// renderer never schedules itself — the rAF loop stays with the caller
// (§17). resize() is explicit: no hidden reads of `window` in draw paths;
// the caller forwards CSS size + devicePixelRatio each frame, preserving
// the previous per-frame resize check exactly.

import { Camera } from "./camera";
import { MAX_DPR } from "./constants";
import { cameraShakeOffset, FxQueue, type FxEntry, type FxKind, type FxQuality } from "./fx-queue";
import { actorLayer } from "./layers/actor";
import { ChainSnapClock } from "./layers/chain-snap";
import { backgroundLayer } from "./layers/background";
import { effectsLayer } from "./layers/effects";
import { environmentLayer } from "./layers/environment";
import { presentationOffsetY, presentState } from "./layers/presentation";
import { worldLayer } from "./layers/world";
import type { FxSettings, RenderLayer, RenderState, RenderTime } from "./render-state";

// The component may only import from this module (§18); the contract types
// are re-exported here so callers never reach into src/rendering internals.
// SHIP_IMPACT_FX_SECONDS rides along for the caller-side half of the FX
// timing handoff (R5): the caller stops reporting `shipImpact` once the FX
// lifetime has elapsed.
export type {
  ChainSnapTiming,
  Phase,
  RenderCreature,
  RenderState,
  RenderTime,
} from "./render-state";
export type { FxEntry, FxKind, FxQuality } from "./fx-queue";
export { SHIP_IMPACT_FX_SECONDS } from "./constants";

// Dev-only frame-time meter (§14 item 8, landed in R5). The wall-clock read
// below is the single sanctioned exemption from the §4 no-clock rule
// (correction recorded during R5): it measures the renderer's own cost,
// never feeds any render path, and is dead code in production builds.
const METER_WINDOW = 120; // frames in the rolling window
const METER_LOG_EVERY = 300; // log cadence in frames (~5 s at 60 FPS)

export class SceneRenderer {
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly camera = new Camera();
  private readonly frameMs = new Float64Array(METER_WINDOW);
  private frameCount = 0;
  // E-X7 chain-snap clock and the reused crashed-frame view (no per-frame allocation).
  private readonly chainSnapClock = new ChainSnapClock();
  private readonly snapView: { -readonly [K in keyof RenderState]: RenderState[K] } = {
    phase: "crashed",
    worldY: 0,
    depthRatio: 0,
    boost: 0,
    creatures: [],
    crashed: true,
    shipImpact: null,
    chainSnap: null,
  };
  // V1 (docs/08 §4.2): the FX queue and the motion / quality flags. The
  // queue's crash entry reads the chain-snap break above — one crash clock.
  private readonly fx = new FxQueue();
  // V2 (D-V2-1): the same flags, held in one reused object that every layer
  // receives read-only as its FX argument. No second store.
  private readonly fxFlags: { -readonly [K in keyof FxSettings]: FxSettings[K] } = {
    reducedMotion: false,
    quality: "high",
  };

  // Canonical layer order, bottom → top (§5).
  private readonly layers: readonly RenderLayer[] = [
    backgroundLayer,
    environmentLayer,
    worldLayer,
    actorLayer,
    effectsLayer,
  ];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  /** Explicit viewport update: CSS pixel size + raw devicePixelRatio (clamped to MAX_DPR here). */
  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, MAX_DPR);
  }

  /** Render one complete frame from a state snapshot + render clock. */
  frame(state: RenderState, time: RenderTime) {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    const meterStart = import.meta.env.DEV ? performance.now() : 0;
    const { width: w, height: h, dpr } = this;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Camera is updated once per frame from RenderState.worldY before any
    // layer renders (§6); layers never write to it.
    // While betting is open the layers draw the surface view
    // (layers/presentation.ts); in every other phase `view` is `state`.
    const view = this.withChainSnap(presentState(state), time.animTime);
    // V1: stamp queued FX on this frame's animTime; the crash entry shares the break time.
    this.fx.update(time.animTime, view.chainSnap?.startedAt ?? null);
    this.camera.setViewport(w, h);
    this.camera.follow(view.worldY);
    this.camera.setPresentationOffset(presentationOffsetY(view.worldY, w, h));
    this.camera.setShake(cameraShakeOffset(this.fx, time.animTime, this.fxFlags.reducedMotion));

    for (const layer of this.layers) {
      layer.render(ctx, view, this.camera, time, this.fxFlags);
    }

    if (import.meta.env.DEV) this.recordFrameTime(performance.now() - meterStart);
  }

  /**
   * V1: queue an FX event (docs/08 §5). Fire-and-forget: it is stamped on the
   * next frame's animTime and never throws. A repeated crash trigger during
   * one break is ignored. No visible effect reads the queue in V1.
   */
  trigger(kind: FxKind) {
    this.fx.trigger(kind);
  }

  /** V1: the reduced-motion flag (default false). Since V2 it stops the marine snow's time-driven motion (F1). */
  setMotion(opts: { readonly reducedMotion: boolean }) {
    this.fxFlags.reducedMotion = opts?.reducedMotion === true;
  }

  /** V1: render quality (default "high"); other values are ignored. Since V2 "low" halves the marine snow and drops its parallax (F1). */
  setQuality(quality: FxQuality) {
    if (quality === "high" || quality === "low") this.fxFlags.quality = quality;
  }

  /** V1 diagnostics and tests: the active FX entry of a kind, as of the last frame. */
  activeFx(kind: FxKind): FxEntry | null {
    return this.fx.active(kind);
  }

  /** V1 diagnostics and tests: the current flags and the last frame's camera shake offset. */
  fxSettings(): { reducedMotion: boolean; quality: FxQuality; shakeOffset: number } {
    return {
      reducedMotion: this.fxFlags.reducedMotion,
      quality: this.fxFlags.quality,
      shakeOffset: this.camera.shakeOffset,
    };
  }

  /**
   * E-X7: the state with renderer-owned chain-snap timing while crashed. A
   * caller-supplied `chainSnap` wins, so the renderer never runs a second
   * crash clock. Outside crashed the state passes through untouched; while
   * crashed it is copied into one reused object. Since V1 this break time is
   * also the FX queue's crash timestamp (frame()).
   */
  private withChainSnap(state: RenderState, animTime: number): RenderState {
    const timing = this.chainSnapClock.update(state.phase, animTime);
    if (timing === null || state.chainSnap !== undefined) return state;
    const v = this.snapView;
    v.phase = state.phase;
    v.worldY = state.worldY;
    v.depthRatio = state.depthRatio;
    v.boost = state.boost;
    v.creatures = state.creatures;
    v.crashed = state.crashed;
    v.shipImpact = state.shipImpact;
    v.chainSnap = timing;
    return v;
  }

  /** Dev-only: rolling avg + p95 of frame() cost, logged every METER_LOG_EVERY frames. */
  private recordFrameTime(ms: number) {
    this.frameMs[this.frameCount % METER_WINDOW] = ms;
    this.frameCount++;
    if (this.frameCount % METER_LOG_EVERY !== 0) return;
    const n = Math.min(this.frameCount, METER_WINDOW);
    const sorted = Array.from(this.frameMs.subarray(0, n)).sort((a, b) => a - b);
    const avg = sorted.reduce((sum, v) => sum + v, 0) / n;
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
    console.debug(
      `[rendering] frame ${avg.toFixed(2)} ms avg / ${p95.toFixed(2)} ms p95 (${n}-frame window)`,
    );
  }

  /** Release the canvas/context references. */
  dispose() {
    this.canvas = null;
    this.ctx = null;
    this.fx.clear();
  }
}
