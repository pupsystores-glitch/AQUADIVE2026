// Game session tests (Sprint 4, Commit U1; docs/07_UI_ARCHITECTURE.md §8,
// §20 risk 5): construction order and remount semantics. The session is
// assembled by createGameSession with injected deps — scripted authority,
// deterministic Rng, and a recording renderer factory (SceneRenderer needs
// a real 2D context, so headless tests inject the renderer seam). The rAF
// host is stubbed exactly as in the driver's own tests: fire(ts) drives
// frames with explicit timestamps.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RoundAuthority } from "@/engine";
import { createGameSession, type CanvasRenderer } from "./session";

const stubAuthority = (): RoundAuthority => ({
  sampleCrashPoint: () => 2,
  sampleJackpot: () => 100,
  rollBonusChests: () => [
    { id: 0, multiplier: 2, opened: false },
    { id: 1, multiplier: 6.5, opened: false },
    { id: 2, multiplier: 30, opened: false },
  ],
});

// ----- stubbed rAF + window host -----
const host = globalThis as unknown as {
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  window?: { devicePixelRatio: number };
};
let pending: Map<number, FrameRequestCallback>;
let nextId: number;

beforeEach(() => {
  pending = new Map();
  nextId = 1;
  host.requestAnimationFrame = (cb) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  host.cancelAnimationFrame = (id) => {
    pending.delete(id);
  };
  // The session's frame callback reads window.devicePixelRatio (verbatim
  // from the component shell); node has no window, so the test provides it.
  host.window = { devicePixelRatio: 2 };
});

afterEach(() => {
  delete host.requestAnimationFrame;
  delete host.cancelAnimationFrame;
  delete host.window;
});

/** Fire all pending rAF callbacks with the given timestamp (ms). */
const fire = (tsMs: number) => {
  const callbacks = [...pending.values()];
  pending.clear();
  for (const cb of callbacks) cb(tsMs);
};

// ----- recording renderer seam -----
interface RendererRecord {
  renderer: CanvasRenderer;
  resizes: Array<[number, number, number]>;
  frames: number;
  disposed: boolean;
}

const makeHarness = () => {
  const renderers: RendererRecord[] = [];
  const session = createGameSession({
    authority: stubAuthority(),
    worldRng: { next: () => 0.5 },
    createRenderer: () => {
      const record: RendererRecord = {
        resizes: [],
        frames: 0,
        disposed: false,
        renderer: {
          resize: (w, h, dpr) => record.resizes.push([w, h, dpr]),
          frame: () => {
            record.frames++;
          },
          dispose: () => {
            record.disposed = true;
          },
        },
      };
      renderers.push(record);
      return record.renderer;
    },
  });
  const canvas = { clientWidth: 375, clientHeight: 667 } as HTMLCanvasElement;
  return { session, renderers, canvas };
};

describe("createGameSession — construction order (§8, §20 risk 5)", () => {
  it("construction is inert: no renderer, no rAF, no ticks — SSR-safe module-scope assembly", () => {
    const { session, renderers } = makeHarness();
    expect(renderers).toHaveLength(0);
    expect(pending.size).toBe(0);
    expect(session.driver.running).toBe(false);
    expect(session.engine.tickCount).toBe(0);
  });

  it("attachCanvas constructs the renderer, starts the driver, and drives resize + frame + sync per rAF frame", () => {
    const { session, renderers, canvas } = makeHarness();
    const syncs: string[] = [];
    session.attachCanvas(canvas, (s) => syncs.push(s.phase));

    expect(renderers).toHaveLength(1);
    expect(session.driver.running).toBe(true);

    fire(1000); // first frame after attach: zero wall delta
    fire(1100);
    expect(renderers[0].frames).toBe(2);
    expect(renderers[0].resizes[0]).toEqual([375, 667, 2]); // CSS size + window.devicePixelRatio
    expect(syncs).toHaveLength(2);
    expect(syncs[0]).toBe("idle"); // betting → renderer Phase "idle" (docs/06 §5 projection)
    expect(session.engine.tickCount).toBeGreaterThan(0); // 100 ms advanced = 6 ticks
  });

  it("sync is optional: attach without it still renders", () => {
    const { session, renderers, canvas } = makeHarness();
    session.attachCanvas(canvas);
    fire(1000);
    fire(1016);
    expect(renderers[0].frames).toBe(2);
  });
});

describe("createGameSession — remount semantics (§8, §20 risk 5)", () => {
  it("detach pauses the driver and disposes the renderer; engine state survives; re-attach resumes with a new renderer", () => {
    const { session, renderers, canvas } = makeHarness();

    const detach = session.attachCanvas(canvas);
    fire(1000);
    fire(1500); // 0.5 s wall time → ticks advance
    const ticksBeforeDetach = session.engine.tickCount;
    expect(ticksBeforeDetach).toBeGreaterThan(0);

    detach();
    expect(session.driver.running).toBe(false);
    expect(renderers[0].disposed).toBe(true);
    expect(session.engine.tickCount).toBe(ticksBeforeDetach); // pause, never reset

    // Remount: a new renderer for the new canvas mount; the world resumes.
    session.attachCanvas(canvas);
    expect(renderers).toHaveLength(2);
    expect(renderers[1].disposed).toBe(false);

    fire(9000); // fresh wall-clock baseline: first frame contributes zero delta
    expect(session.engine.tickCount).toBe(ticksBeforeDetach);
    fire(9100);
    expect(session.engine.tickCount).toBeGreaterThan(ticksBeforeDetach);
  });
});
