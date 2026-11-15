// E-X6 S2.1 — goldfish collection flight (presentation only). A consumed
// goldfish flies from its own position into the anchor as drawn and shrinks
// away over PICKUP_FLIGHT_PX of dive depth. These tests pin: the progress
// boundaries; that the flight starts no earlier than the engine's own
// consumption (driven through the real DiveSimulation — test-only engine
// imports); snapshot replay; convergence on the rendered anchor; continuity
// at the start; multi-fish pickups; the catch-up skip limit; and that every
// other creature is drawn exactly as before.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TICKS_PER_ADVANCE, TICK_SECONDS } from "@/engine/clock";
import type { Creature } from "@/engine/domain/creatures";
import { descentSpeed } from "@/engine/domain/descent";
import { multiplierAt } from "@/engine/domain/multiplier";
import { BOOST_SPEED_FACTOR, COLLISION_DY_PX, COLLISION_DX_FRAC } from "@/engine/domain/tuning";
import { DiveSimulation, type WorldSnapshot } from "@/engine/simulation";
import { ANCHOR_WORLD_OFFSET_PX } from "@/shared/world";

// Only the creature draw is observed. The tested depths keep the ship culled
// and the sea floor off screen (its artwork never loads under Node), so the
// World layer's other draws are never reached; the floor fallback is stubbed
// as a guard.
vi.mock("../draw/creatures", () => ({ drawCreature: vi.fn() }));
vi.mock("../draw/sea-floor", () => ({ drawSeaFloor: vi.fn() }));

import { Camera } from "../camera";
import { PICKUP_FLIGHT_PX, PICKUP_START_DY_PX } from "../constants";
import { drawCreature } from "../draw/creatures";
import type { Phase, RenderCreature, RenderState } from "../render-state";
import { anchorPose, landingSeconds } from "./actor";
import { pickupBlend, pickupProgress, pickupScale, presentationOffsetY } from "./presentation";
import { worldLayer } from "./world";
import worldSource from "./world.ts?raw";
import presentationSource from "./presentation.ts?raw";

const draw = vi.mocked(drawCreature);
const ctx = {} as CanvasRenderingContext2D;
const W = 1089;
const H = 820;

/** Max dive speed (px/s): descent cap at full boost. */
const MAX_SPEED = descentSpeed(1e6) * (1 + BOOST_SPEED_FACTOR);

function cameraAt(worldY: number, w = W, h = H): Camera {
  const camera = new Camera();
  camera.setViewport(w, h);
  camera.follow(worldY);
  camera.setPresentationOffset(presentationOffsetY(worldY, w, h));
  return camera;
}

function stateAt(
  worldY: number,
  creatures: readonly RenderCreature[],
  phase: Phase = "diving",
): RenderState {
  return {
    phase,
    worldY,
    depthRatio: 0,
    boost: 0,
    creatures,
    crashed: false,
    shipImpact: null,
  };
}

function goldfish(worldY: number, consumed: boolean, x = 0.5, phase = 0.3): RenderCreature {
  return { kind: "goldfish", x, worldY, size: 1, phase, dir: 1, consumed };
}

/** The pre-S2.1 creature draw, verbatim. */
function legacyX(c: RenderCreature, animTime: number, w = W) {
  return c.x * w + Math.sin(animTime * 0.6 + c.phase) * 12 * c.dir;
}

/** A sim whose world is exactly `creatures` at depth `worldY`, with no further spawns. */
function simWith(worldY: number, creatures: Creature[], boost = 0): DiveSimulation {
  const sim = new DiveSimulation({ next: () => 0.5 });
  sim.restore({
    worldY,
    boost,
    multiplier: 1,
    nextSpawnAt: 1e9,
    nextCreatureId: 100,
    creatures,
  });
  return sim;
}

const engineFish = (id: number, worldY: number, x = 0.5): Creature => ({
  id,
  kind: "goldfish",
  x,
  worldY,
  size: 1,
  phase: 0.3,
  dir: 1,
});

beforeEach(() => draw.mockClear());

describe("pickup constants", () => {
  it("mirrors the engine's collision distance and uses the approved flight length", () => {
    expect(PICKUP_START_DY_PX).toBe(COLLISION_DY_PX);
    expect(PICKUP_FLIGHT_PX).toBe(56);
  });
});

describe("pickupProgress / pickupBlend / pickupScale", () => {
  // Fish world Y is relative to the anchor's collision point (depth + offset).
  const fishAhead = (worldY: number, ahead: number) => worldY + ANCHOR_WORLD_OFFSET_PX + ahead;

  it("is 0 at (and before) the consumption distance and 1 after the flight", () => {
    const d = 1000;
    expect(pickupProgress(fishAhead(d, PICKUP_START_DY_PX), d)).toBe(0);
    expect(pickupProgress(fishAhead(d, PICKUP_START_DY_PX + 40), d)).toBe(0);
    expect(pickupProgress(fishAhead(d, PICKUP_START_DY_PX - PICKUP_FLIGHT_PX / 2), d)).toBeCloseTo(
      0.5,
      12,
    );
    expect(pickupProgress(fishAhead(d, PICKUP_START_DY_PX - PICKUP_FLIGHT_PX), d)).toBe(1);
    expect(pickupProgress(fishAhead(d, -500), d)).toBe(1);
    expect(pickupProgress(NaN, d)).toBe(0);
  });

  it("is monotonic in depth", () => {
    const fy = 2000;
    let prev = -1;
    for (let d = 1700; d < 1850; d += 0.5) {
      const p = pickupProgress(fy, d);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("blends from rest to rest and shrinks smoothly to nothing", () => {
    expect(pickupBlend(0)).toBe(0);
    expect(pickupBlend(1)).toBe(1);
    expect(pickupScale(0)).toBe(1);
    expect(pickupScale(1)).toBe(0);
    // Zero slope at both ends: no jolt at the start, no pop at the end.
    const eps = 1e-4;
    expect(pickupBlend(eps) / eps).toBeLessThan(1e-3);
    expect((1 - pickupBlend(1 - eps)) / eps).toBeLessThan(1e-3);
    expect(pickupScale(1 - eps) / eps).toBeLessThan(1e-3);
    let prevScale = 2;
    for (let p = 0; p <= 1; p += 0.01) {
      const s = pickupScale(p);
      expect(s).toBeLessThanOrEqual(prevScale);
      prevScale = s;
    }
  });
});

describe("engine-authoritative start (real DiveSimulation)", () => {
  // Dive-elapsed times giving slow (m = 1), mid and capped descent speeds.
  const SPEEDS: Array<[string, number, number]> = [
    ["slow", 0, 0],
    ["mid", 20, 0.4],
    ["max", 60, 1],
  ];

  it.each(SPEEDS)(
    "%s: progress is 0 until the consuming tick and at most one tick's travel after it",
    (_, elapsed, boost) => {
      const startY = 1000;
      const fishY = startY + ANCHOR_WORLD_OFFSET_PX + 200;
      const sim = simWith(startY, [engineFish(1, fishY)], boost);
      let consumedAt = -1;
      for (let i = 0; i < 2000 && consumedAt < 0; i++) {
        const before = sim.worldY;
        sim.tick(elapsed, TICK_SECONDS, Infinity);
        const fish = sim.creatures[0];
        if (fish.consumed) {
          consumedAt = i;
          // The previous frame (depth `before`) would have shown progress 0.
          expect(pickupProgress(fishY, before)).toBe(0);
          const p = pickupProgress(fishY, sim.worldY);
          expect(p).toBeGreaterThan(0);
          expect(p).toBeLessThanOrEqual((sim.worldY - before) / PICKUP_FLIGHT_PX + 1e-12);
        } else {
          // Not consumed → the renderer's start condition is not yet met either.
          expect(fishY - (sim.worldY + ANCHOR_WORLD_OFFSET_PX)).toBeGreaterThanOrEqual(
            COLLISION_DY_PX,
          );
        }
      }
      expect(consumedAt).toBeGreaterThan(0);
    },
  );

  it("rendering never mutates creatures or engine state, and creates no extra rewards", () => {
    const startY = 1500;
    const fishY = startY + ANCHOR_WORLD_OFFSET_PX + 60;
    const a = simWith(startY, [engineFish(1, fishY)]);
    const b = simWith(startY, [engineFish(1, fishY)]);
    for (let i = 0; i < 120; i++) {
      a.tick(10, TICK_SECONDS, Infinity);
      b.tick(10, TICK_SECONDS, Infinity);
      const frozen = a.creatures.map((c) => Object.freeze({ ...c }));
      const before = JSON.stringify(a.snapshot());
      worldLayer.render(ctx, stateAt(a.worldY, frozen), cameraAt(a.worldY), {
        animTime: i / 60,
        frameDt: 1 / 60,
      });
      expect(JSON.stringify(a.snapshot())).toBe(before);
    }
    // Rendered and unrendered sims are identical: same boost, same depth.
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

describe("snapshot restoration and deterministic replay", () => {
  it("a restored world shows the same flight, frame for frame", () => {
    const startY = 800;
    const fishY = startY + ANCHOR_WORLD_OFFSET_PX + 40;
    const live = simWith(startY, [engineFish(1, fishY)]);
    // Run until the fish is mid-flight.
    while (!(pickupProgress(fishY, live.worldY) > 0.2)) live.tick(5, TICK_SECONDS, Infinity);
    const snap: WorldSnapshot = live.snapshot();
    const restored = new DiveSimulation({ next: () => 0.5 });
    restored.restore(snap);

    const run = (sim: DiveSimulation) => {
      const frames: unknown[] = [];
      for (let i = 0; i < 30; i++) {
        sim.tick(5, TICK_SECONDS, Infinity);
        draw.mockClear();
        worldLayer.render(ctx, stateAt(sim.worldY, sim.creatures), cameraAt(sim.worldY), {
          animTime: 3 + i / 60,
          frameDt: 1 / 60,
        });
        frames.push(draw.mock.calls.map((c) => c.slice(1)));
      }
      return frames;
    };
    expect(run(restored)).toEqual(run(live));
  });

  it("identical render inputs give identical draws", () => {
    const worldY = 1200;
    const creatures = [goldfish(worldY + ANCHOR_WORLD_OFFSET_PX + 5, true)];
    const time = { animTime: 7.25, frameDt: 1 / 60 };
    worldLayer.render(ctx, stateAt(worldY, creatures), cameraAt(worldY), time);
    const first = draw.mock.calls.map((c) => c.slice(1));
    draw.mockClear();
    worldLayer.render(ctx, stateAt(worldY, creatures), cameraAt(worldY), time);
    expect(draw.mock.calls.map((c) => c.slice(1))).toEqual(first);
  });
});

describe("flight path", () => {
  const VIEWPORTS: Array<[number, number]> = [
    [375 / 0.84, 427 / 0.84],
    [907, 820],
    [1422, 1046],
  ];

  it.each(VIEWPORTS)("%d×%d: converges on the rendered anchor and shrinks to nothing", (w, h) => {
    const fishY = 2000 + ANCHOR_WORLD_OFFSET_PX + PICKUP_START_DY_PX;
    const fish = goldfish(fishY, true, 0.5 + COLLISION_DX_FRAC * 0.9);
    let prevDist = Infinity;
    let prevSize = Infinity;
    // 1 px of depth per frame, at a fixed animation time so the anchor holds still.
    for (let k = 1; k < PICKUP_FLIGHT_PX; k++) {
      const worldY = 2000 + k;
      const camera = cameraAt(worldY, w, h);
      draw.mockClear();
      worldLayer.render(ctx, stateAt(worldY, [fish]), camera, { animTime: 4, frameDt: 1 / 60 });
      expect(draw).toHaveBeenCalledTimes(1);
      const [, kind, x, y, size, , consumed] = draw.mock.calls[0];
      expect(kind).toBe("goldfish");
      expect(consumed).toBe(false);
      const a = anchorPose(worldY, camera, 4, -1);
      const dist = Math.hypot(x - a.x, y - a.y);
      expect(dist).toBeLessThanOrEqual(prevDist + 1e-9);
      expect(size).toBeLessThanOrEqual(prevSize);
      prevDist = dist;
      prevSize = size;
    }
    expect(prevDist).toBeLessThan(0.5);
    expect(prevSize).toBeLessThan(0.01);
    // Flight complete → nothing is drawn.
    draw.mockClear();
    const end = 2000 + PICKUP_FLIGHT_PX;
    worldLayer.render(ctx, stateAt(end, [fish]), cameraAt(end, w, h), {
      animTime: 4,
      frameDt: 1 / 60,
    });
    expect(draw).not.toHaveBeenCalled();
  });

  it("tracks the swaying anchor, not a fixed point", () => {
    const worldY = 2000;
    const fish = goldfish(worldY + ANCHOR_WORLD_OFFSET_PX + PICKUP_START_DY_PX - 50, true);
    for (const t of [0, 1.1, 2.3]) {
      const camera = cameraAt(worldY);
      draw.mockClear();
      worldLayer.render(ctx, stateAt(worldY, [fish]), camera, { animTime: t, frameDt: 1 / 60 });
      const [, , x, y] = draw.mock.calls[0];
      const a = anchorPose(worldY, camera, t, -1);
      const e = pickupBlend(pickupProgress(fish.worldY, worldY));
      expect(x).toBeCloseTo(legacyX(fish, t) + (a.x - legacyX(fish, t)) * e, 9);
      expect(y).toBeCloseTo(
        camera.worldToScreenY(fish.worldY) + (a.y - camera.worldToScreenY(fish.worldY)) * e,
        9,
      );
    }
  });

  it("starts without a visible jump at normal speeds (incl. the wiggle)", () => {
    // Engine step at m = 1 with no boost: 148 px/s → 2.47 px per tick.
    const step = descentSpeed(multiplierAt(0)) * TICK_SECONDS;
    for (const t of [0, 0.9, 3.3, 11.7]) {
      for (const xFrac of [0.5 - COLLISION_DX_FRAC * 0.95, 0.5, 0.5 + COLLISION_DX_FRAC * 0.95]) {
        // Worst case: consumed on the tick that crossed the threshold by a full step.
        const worldY = 3000;
        const fishY = worldY + ANCHOR_WORLD_OFFSET_PX + PICKUP_START_DY_PX - step;
        const fish = goldfish(fishY, true, xFrac);
        const camera = cameraAt(worldY);
        draw.mockClear();
        worldLayer.render(ctx, stateAt(worldY, [fish]), camera, { animTime: t, frameDt: 1 / 60 });
        const [, , x, y, size] = draw.mock.calls[0];
        // Where the fish would have been drawn without the flight.
        expect(Math.abs(x - legacyX(fish, t))).toBeLessThan(1);
        expect(Math.abs(y - camera.worldToScreenY(fishY))).toBeLessThan(1);
        expect(size).toBeGreaterThan(0.999);
      }
    }
  });
});

describe("multiple fish and other creatures", () => {
  it("flies every consumed goldfish at once, each on its own progress", () => {
    const worldY = 2500;
    const base = worldY + ANCHOR_WORLD_OFFSET_PX;
    const fish = [
      goldfish(base + 20, true, 0.45, 0.1),
      goldfish(base + 5, true, 0.55, 1.7),
      goldfish(base - 20, true, 0.5, 2.9),
    ];
    worldLayer.render(ctx, stateAt(worldY, fish), cameraAt(worldY), {
      animTime: 2,
      frameDt: 1 / 60,
    });
    expect(draw).toHaveBeenCalledTimes(3);
    const sizes = draw.mock.calls.map((c) => c[4]);
    for (let i = 0; i < fish.length; i++) {
      expect(sizes[i]).toBeCloseTo(pickupScale(pickupProgress(fish[i].worldY, worldY)), 12);
      expect(draw.mock.calls[i][6]).toBe(false);
    }
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
  });

  it("two goldfish consumed on the same engine tick both fly", () => {
    const startY = 1000;
    const y = startY + ANCHOR_WORLD_OFFSET_PX + 40;
    const sim = simWith(startY, [engineFish(1, y, 0.4), engineFish(2, y, 0.6)]);
    while (!sim.creatures[0].consumed) sim.tick(0, TICK_SECONDS, Infinity);
    expect(sim.creatures[1].consumed).toBe(true);
    sim.tick(0, TICK_SECONDS, Infinity);
    worldLayer.render(ctx, stateAt(sim.worldY, sim.creatures), cameraAt(sim.worldY), {
      animTime: 1,
      frameDt: 1 / 60,
    });
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls.every((c) => c[6] === false && c[4] > 0)).toBe(true);
  });

  it("draws every other creature exactly as before", () => {
    const worldY = 2000;
    const base = worldY + ANCHOR_WORLD_OFFSET_PX;
    const creatures: RenderCreature[] = [
      { kind: "fishSchool", x: 0.3, worldY: base - 100, size: 1.2, phase: 0.4, dir: -1 },
      { kind: "octopus", x: 0.7, worldY: base + 60, size: 0.9, phase: 2.1, dir: 1 },
      goldfish(base + 150, false, 0.52, 0.8), // not yet consumed
      // A consumed non-goldfish (the engine never does this) stays hidden as before.
      { kind: "seahorse", x: 0.5, worldY: base, size: 1, phase: 0, dir: 1, consumed: true },
      { kind: "sealion", x: 0.2, worldY: base + 2000, size: 1, phase: 0, dir: 1 }, // culled
    ];
    const camera = cameraAt(worldY);
    const t = 5.5;
    worldLayer.render(ctx, stateAt(worldY, creatures), camera, { animTime: t, frameDt: 1 / 60 });
    const expected = creatures
      .filter((c) => camera.isVisibleY(c.worldY, 120))
      .map((c) => [
        ctx,
        c.kind,
        legacyX(c, t),
        camera.worldToScreenY(c.worldY),
        c.size,
        t + c.phase,
        c.consumed === true,
      ]);
    expect(draw.mock.calls).toEqual(expected);
  });

  it.each<Phase>(["crashed", "cashed", "bonus"])(
    "%s: a consumed goldfish is hidden as before (the depth no longer moves)",
    (phase) => {
      const worldY = 2000;
      const fish = goldfish(worldY + ANCHOR_WORLD_OFFSET_PX + 5, true);
      const camera = cameraAt(worldY);
      worldLayer.render(ctx, stateAt(worldY, [fish], phase), camera, {
        animTime: 1,
        frameDt: 1 / 60,
      });
      expect(draw.mock.calls).toEqual([
        [ctx, "goldfish", legacyX(fish, 1), camera.worldToScreenY(fish.worldY), 1, 1.3, true],
      ]);
    },
  );
});

describe("catch-up frames (documented limitation)", () => {
  it("a 3-tick catch-up frame at full speed and boost can skip the whole flight", () => {
    const maxFrameTravel = MAX_TICKS_PER_ADVANCE * MAX_SPEED * TICK_SECONDS;
    expect(maxFrameTravel).toBeCloseTo(57.6, 9);
    expect(maxFrameTravel).toBeGreaterThan(PICKUP_FLIGHT_PX);

    // Fish 0.5 px past the consumption threshold before the frame.
    const startY = 3000;
    const fishY = startY + ANCHOR_WORLD_OFFSET_PX + COLLISION_DY_PX + 0.5;
    const sim = simWith(startY, [engineFish(1, fishY)], 1);
    for (let i = 0; i < MAX_TICKS_PER_ADVANCE; i++) sim.tick(60, TICK_SECONDS, Infinity);
    expect(sim.creatures[0].consumed).toBe(true); // reward applied by the engine
    expect(pickupProgress(fishY, sim.worldY)).toBe(1); // no flight frame left
    worldLayer.render(ctx, stateAt(sim.worldY, sim.creatures), cameraAt(sim.worldY), {
      animTime: 1,
      frameDt: 0.05,
    });
    expect(draw).not.toHaveBeenCalled();
  });

  it("at 60 fps (one tick per frame) even the fastest flight shows at least two frames", () => {
    const perFrame = (MAX_SPEED * TICK_SECONDS) / PICKUP_FLIGHT_PX;
    // Worst start progress is one full tick; frames continue while p < 1.
    const worstStart = perFrame;
    const visibleFrames = Math.ceil((1 - worstStart) / perFrame);
    expect(visibleFrames).toBeGreaterThanOrEqual(2);
  });

  it("a 2-tick catch-up frame at full speed still shows the flight", () => {
    expect(2 * MAX_SPEED * TICK_SECONDS).toBeLessThan(PICKUP_FLIGHT_PX);
  });
});

describe("anchorPose reuse safety", () => {
  it("the World layer's anchor read leaves the Actor layer's pose unchanged", () => {
    const worldY = 2000;
    const camera = cameraAt(worldY);
    const t = 6.1;
    const state = stateAt(worldY, [goldfish(worldY + ANCHOR_WORLD_OFFSET_PX, true)]);
    const reference = { ...anchorPose(worldY, camera, t, landingSeconds(state)) };
    // A different pose in between (a launch pose), then the World layer's call.
    anchorPose(20, cameraAt(20), 1.3, -1);
    worldLayer.render(ctx, state, camera, { animTime: t, frameDt: 1 / 60 });
    expect(draw).toHaveBeenCalledTimes(1);
    expect({ ...anchorPose(worldY, camera, t, landingSeconds(state)) }).toEqual(reference);
  });

  it("reads the anchor at most once per frame and only with a fish in flight", () => {
    // Static source check: one anchorPose call site, behind the lazy guard.
    expect(worldSource.match(/anchorPose\(/g)).toHaveLength(1);
    expect(worldSource).toMatch(/if \(anchorX !== anchorX\)/);
  });
});

describe("no new loops or timers", () => {
  it.each([
    ["world.ts", worldSource],
    ["presentation.ts", presentationSource],
  ])("%s schedules nothing", (_, src) => {
    expect(src).not.toMatch(
      /requestAnimationFrame|setTimeout|setInterval|performance\.now|Date\.now/,
    );
  });
});
