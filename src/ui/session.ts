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
// Since U2 the session also owns the wallet store (§10): its settlement
// subscriptions are wired once, here at construction — the session's
// lifetime, never a component mount's (delta V1) — and submit() is the
// command edge, routing placeBet through the wallet's affordability check.
//
// Since U4a the session also owns the notification store (§12): the win
// flash and its timer, subscribed here at construction for the session's
// lifetime (delta V2), plus the dev-only rejection diagnostics.
//
// Mid-migration status (U4a, §17): the per-frame HUD mirror and display-only
// chest state (chests, chosen chest) are still component-side.
// attachCanvas therefore accepts the host's sync callback, and the engine
// stays exposed for the component's display subscriptions; U4b replaces
// both with the round store (§11).

import {
  EngineDriver,
  GameEngine,
  LocalRoundAuthority,
  createMathRandomRng,
  type EngineCommand,
  type EnginePublicState,
  type Rng,
  type RoundAuthority,
} from "@/engine";
import { SceneRenderer } from "@/rendering/scene-renderer";
import {
  createNotificationStore,
  type NotificationClock,
  type NotificationStore,
  type RejectionLogger,
} from "@/ui/store/notification-store";
import { createWalletStore, type WalletStore } from "@/ui/store/wallet-store";

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
  /** Notification timing clock (§12). Default: the system clock. */
  notificationClock?: NotificationClock;
  /** Dev rejection diagnostics (§12). Default off; effective only in DEV builds. The production singleton passes import.meta.env.DEV. */
  diagnostics?: boolean;
  /** Diagnostics sink. Default console.warn. */
  diagnosticsLog?: RejectionLogger;
}

export interface GameSession {
  /** The engine facade (docs/06 §13). Mid-migration surface: the component shell still subscribes to display-only events until U4; commands go through submit(). */
  readonly engine: GameEngine;
  /** The settlement layer (§10): session-scoped, subscribed at construction. */
  readonly wallet: WalletStore;
  /** Win flashes + dev rejection diagnostics (§12): session-scoped, subscribed at construction. */
  readonly notifications: NotificationStore;
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
  /**
   * The single command edge for components (§8). placeBet is dropped unless
   * the wallet can afford it (§6 — the one wallet question); everything is
   * otherwise forwarded unchanged. The engine remains the validator of all
   * round-state questions (D4).
   */
  submit(command: EngineCommand): void;
}

/**
 * Assemble a session from injected deps (§8 test seam). Production uses
 * the module singleton below; tests construct their own session — this is
 * what makes the §21 UI tests deterministic, and it costs nothing at
 * runtime.
 */
export function createGameSession(deps: GameSessionDeps): GameSession {
  const engine = new GameEngine({ authority: deps.authority, worldRng: deps.worldRng });
  // Settlement subscribes first and for the session's lifetime (V1): its
  // listeners precede any component listener on every event, and nothing
  // ever unsubscribes them.
  const wallet = createWalletStore(engine.events);
  // Notifications subscribe second, also for the session's lifetime (V2):
  // flash triggers come from the wallet (after its snapshot is written);
  // the round-transition clears run after the wallet's per-round resets.
  const notifications = createNotificationStore(
    { flashes: wallet, events: engine.events },
    { clock: deps.notificationClock, diagnostics: deps.diagnostics, log: deps.diagnosticsLog },
  );
  const driver = new EngineDriver(engine);
  const createRenderer =
    deps.createRenderer ?? ((canvas: HTMLCanvasElement) => new SceneRenderer(canvas));

  return {
    engine,
    wallet,
    notifications,
    driver,
    submit: (command) => {
      if (command.type === "placeBet" && !wallet.canAfford(command.amount)) return;
      engine.submit(command);
    },
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
  diagnostics: import.meta.env.DEV,
});
