// Game session — the composition root (docs/07_UI_ARCHITECTURE.md §8).
//
// The only place engine construction and (from U2/U4 on) session-scope
// event wiring exist. Owns, at module scope — preserving the SSR-safe
// module-singleton semantics the component shell established: the `world`
// Rng, the LocalRoundAuthority (carrying the `outcome` Rng stream,
// docs/06 §11/§16), the GameEngine, and the EngineDriver. Construction
// touches no DOM, no rAF, no wall clock — the driver starts only when a
// canvas attaches — so importing this module on the server is safe, and
// remounting a component never restarts the world (docs/06 §13).
//
// Mid-migration status (U1, §17): the settlement listeners and the
// per-frame HUD mirror are still component-side. attachCanvas therefore
// accepts the host's sync callback; U4 replaces it with the round-store
// write (§11) and U2 moves the settlement subscriptions here (§10), after
// which the component consumes stores and submit() only.

import {
  EngineDriver,
  GameEngine,
  LocalRoundAuthority,
  createMathRandomRng,
  type EnginePublicState,
  type Rng,
  type RoundAuthority,
} from "@/engine";
import { SceneRenderer } from "@/rendering/scene-renderer";

/**
 * Per-frame public-state sync (docs/06 delta D5). Transitional seam: the
 * component's HUD mirror until the round store becomes the sink half (U4).
 */
export type PublicStateSync = (state: EnginePublicState) => void;

/** The renderer surface the session drives — SceneRenderer in production, injectable for headless tests (§8 test seam). */
export type CanvasRenderer = Pick<SceneRenderer, "resize" | "frame" | "dispose">;

/** Engine deps injectable per §8: scripted authority, deterministic Rngs, and (because SceneRenderer needs a real 2D context) the renderer factory. */
export interface GameSessionDeps {
  authority: RoundAuthority;
  worldRng: Rng;
  /** Test seam only — production omits it and gets the real SceneRenderer. */
  createRenderer?: (canvas: HTMLCanvasElement) => CanvasRenderer;
}

export interface GameSession {
  /** The engine facade (docs/06 §13). Mid-migration surface: components still subscribe to events and submit commands directly; U2 narrows this to submit(). */
  readonly engine: GameEngine;
  /** The rAF/wall-clock owner. Exposed for tests; production code attaches only via attachCanvas. */
  readonly driver: EngineDriver;
  /**
   * Construct the renderer for this canvas and start the driver with
   * frame = resize + render and sync = the host's public-state mirror.
   * Returns the detach: pauses the driver and disposes the renderer —
   * everything else survives, exactly as the driver guarantees
   * (docs/06 §13). The renderer is per-canvas-mount (it holds the 2D
   * context); the session is not.
   */
  attachCanvas(canvas: HTMLCanvasElement, sync?: PublicStateSync): () => void;
}

/**
 * Assemble a session from injected deps (§8 test seam). Production uses
 * the module singleton below; tests construct their own session — this is
 * what makes the §21 UI tests deterministic, and it costs nothing at
 * runtime.
 */
export function createGameSession(deps: GameSessionDeps): GameSession {
  const engine = new GameEngine({ authority: deps.authority, worldRng: deps.worldRng });
  const driver = new EngineDriver(engine);
  const createRenderer =
    deps.createRenderer ?? ((canvas: HTMLCanvasElement) => new SceneRenderer(canvas));

  return {
    engine,
    driver,
    attachCanvas: (canvas, sync) => {
      const renderer = createRenderer(canvas);
      driver.attach({
        frame: (state, time) => {
          renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
          renderer.frame(state, time);
        },
        sync,
      });
      return () => {
        driver.detach();
        renderer.dispose();
      };
    },
  };
}

// The production singleton. The two engine RNG streams (docs/06 §11, §16):
// outcome draws go through the RoundAuthority; world draws (creature rolls,
// spawn jitter) through the injected `world` stream.
export const gameSession: GameSession = createGameSession({
  authority: new LocalRoundAuthority(createMathRandomRng()),
  worldRng: createMathRandomRng(),
});
