// World layer — creatures, surface ship, sea floor/wreck/treasure
// (Sprint 2, Commit R3; docs/05_RENDERING_ARCHITECTURE.md §5 layer 3, §8,
// §10, §11). Bodies moved verbatim from the component's drawScene; draw
// order within the layer is preserved exactly: creatures → surface ship →
// sea floor (§5 — the floor draws before the Actor layer so the anchor
// visibly lands on top). The ship's formerly-inline world position (−180)
// is now the named constant SHIP_WORLD_Y (§8).

import { ANCHOR_WORLD_OFFSET_PX, CHAIN_MAX_DEPTH, SHIP_WORLD_Y } from "@/shared/world";
import { assets } from "../assets";
import { SHIP_CHAIN_ATTACH_DY, SHIP_CULL_MARGIN_TOP } from "../constants";
import { drawCreature } from "../draw/creatures";
import { drawSeaFloor } from "../draw/sea-floor";
import { drawSeaFloorArt, seaFloorArtTopExtent } from "../draw/sea-floor-art";
import { drawShip } from "../draw/ship";
import type { RenderLayer } from "../render-state";
import { anchorPose, landingSeconds } from "./actor";
import { launchProgress, pickupBlend, pickupProgress, pickupScale } from "./presentation";

export const worldLayer: RenderLayer = {
  name: "world",
  render(ctx, state, camera, time) {
    const { w, h } = camera.viewport;

    // Draw creatures (behind anchor). E-X6 S2.1: while diving, a goldfish the
    // engine has consumed flies from its own (wiggling) position into the
    // anchor as drawn this frame and shrinks away (layers/presentation.ts
    // pickupProgress). The anchor's position is read once, only when such a
    // fish is in flight; its numbers are copied out at once because
    // anchorPose reuses its result object (every field it returns is
    // recomputed on each call, so this extra call leaves the Actor and
    // Effects layers' poses unchanged).
    let anchorX = NaN;
    let anchorY = NaN;
    for (const c of state.creatures) {
      if (!camera.isVisibleY(c.worldY, 120)) continue;
      const sy = camera.worldToScreenY(c.worldY);
      const sx = c.x * w + Math.sin(time.animTime * 0.6 + c.phase) * 12 * c.dir;
      if (c.consumed === true && c.kind === "goldfish" && state.phase === "diving") {
        const p = pickupProgress(c.worldY, state.worldY);
        if (p >= 1) continue;
        if (anchorX !== anchorX) {
          const pose = anchorPose(state.worldY, camera, time.animTime, landingSeconds(state));
          anchorX = pose.x;
          anchorY = pose.y;
        }
        const e = pickupBlend(p);
        drawCreature(
          ctx,
          c.kind,
          sx + (anchorX - sx) * e,
          sy + (anchorY - sy) * e,
          c.size * pickupScale(p),
          time.animTime + c.phase,
          false,
        );
        continue;
      }
      drawCreature(ctx, c.kind, sx, sy, c.size, time.animTime + c.phase, c.consumed === true);
    }

    // Surface ship (only visible near surface)
    const shipScreenY = camera.worldToScreenY(SHIP_WORLD_Y);
    if (camera.isVisibleY(SHIP_WORLD_Y, SHIP_CULL_MARGIN_TOP, 80)) {
      // The ship's floating motion settles as the anchor launches (Actor layer).
      const motion = 1 - launchProgress(state.worldY, w, h);
      drawShip(
        ctx,
        w / 2,
        shipScreenY,
        time.animTime,
        w,
        SHIP_CHAIN_ATTACH_DY,
        motion,
        assets.get("ship"),
        assets.get("shipShine"),
      );
    }

    // Sea floor + shipwreck — drawn BEFORE the anchor so the anchor visibly lands on top.
    // The illustrated floor (draw/sea-floor-art.ts) reaches well above the floor
    // line, so it is culled with its own margin; the procedural floor is the
    // fallback while the artwork is not loaded.
    const floorWorldY = CHAIN_MAX_DEPTH + ANCHOR_WORLD_OFFSET_PX;
    const floorScreenY = camera.worldToScreenY(floorWorldY);
    const floorArt = assets.get("seaFloor");
    const drewArt =
      floorArt.ready &&
      camera.isVisibleY(floorWorldY, Infinity, seaFloorArtTopExtent(w, h) + 20) &&
      drawSeaFloorArt(ctx, w, h, floorScreenY, floorArt);
    if (!drewArt && !floorArt.ready && camera.isVisibleY(floorWorldY, Infinity, 100)) {
      drawSeaFloor(ctx, w, h, floorScreenY);
    }
  },
};
