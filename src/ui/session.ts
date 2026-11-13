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
// Since U4b the session also owns the round store (§11): seeded here from one
// engine public-state read and written by two paths only: the driver's
// per-frame sync (which attachCanvas supplies itself; the host sync-callback
// parameter is retired) and one immediate write inside attachCanvas. It has
// no event subscriptions and no timers. Components read
// round and bonus presentation state from it and no longer subscribe to the
// engine; the engine stays exposed for tests and diagnostics only.
//
// Since U5 the session also owns the bet-input store (§9, delta V4): created
// at construction at DEFAULT_BET, so the typed amount survives remounts. It
// subscribes to nothing; its only writers are the betting-panel handlers.
// Since M1, submit() routes placeBet through wallet.canPlaceStake (valid
// stake ∧ affordable, docs/07 §23.5), shared with the panel's action state.

import {
  EngineDriver,
  GameEngine,
  LocalRoundAuthority,
  createMathRandomRng,
  type EngineCommand,
  type Rng,
  type RoundAuthority,
} from "@/engine";
import { DEFAULT_BET } from "@/game/constants";
import { SceneRenderer } from "@/rendering/scene-renderer";
import { createBetInputStore, type BetInputStore } from "@/ui/store/bet-input-store";
import {
  createNotificationStore,
  type NotificationClock,
  type NotificationStore,
  type RejectionLogger,
} from "@/ui/store/notification-store";
import { createRoundStore, type RoundStore } from "@/ui/store/round-store";
import { createWalletStore, type WalletRefusal, type WalletStore } from "@/ui/store/wallet-store";

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
  /** Wallet-refusal diagnostics sink (M1, W9). Default console.warn. Effective only with `diagnostics` in DEV builds. */
  walletDiagnosticsLog?: (message: string, refusal: WalletRefusal) => void;
}

export interface GameSession {
  /** The engine facade (docs/06 §13). Exposed for tests and diagnostics; components read stores and send commands through submit(). */
  readonly engine: GameEngine;
  /** The settlement layer (§10): session-scoped, subscribed at construction. */
  readonly wallet: WalletStore;
  /** Win flashes + dev rejection diagnostics (§12): session-scoped, subscribed at construction. */
  readonly notifications: NotificationStore;
  /** The engine public-state mirror (§11): read-only; written only by the session (driver per-frame sync, plus one write on attach). */
  readonly round: RoundStore;
  /** The betting panel's amount field (§9, V4): session-scoped, starts at DEFAULT_BET, independent of every other store. */
  readonly betInput: BetInputStore;
  /** The rAF/wall-clock owner. Exposed for tests; production code attaches only via attachCanvas. */
  readonly driver: EngineDriver;
  /**
   * Construct the renderer for this canvas, write the round store once from
   * the engine's current public state, and start the driver with
   * frame = resize + render and sync = the round-store write. Returns the
   * detach: pauses the driver and disposes the renderer — everything else
   * survives, exactly as the driver guarantees (docs/06 §13). The renderer
   * is per-canvas-mount (it holds the 2D context); the session and its
   * stores are not. Re-attaching replaces the driver's sink, so there is
   * never more than one per-frame writer.
   */
  attachCanvas(canvas: HTMLCanvasElement): () => void;
  /**
   * The single command edge for components (§8). placeBet is dropped unless
   * its amount is a valid stake (M1-D1/D2: whole cents, ≥ 0.01) the wallet
   * can afford — the PLACE BET enable rule's own predicate (M1-D3, §23.5);
   * everything is otherwise forwarded unchanged. The engine remains the validator of all
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
  // W9 (M1): wallet refusals are reported as dev diagnostics, under the same
  // opt-in as the rejection diagnostics; compiled out of production builds.
  const wallet = createWalletStore(engine.events, {
    onRefusal:
      import.meta.env.DEV && deps.diagnostics
        ? (r) =>
            (deps.walletDiagnosticsLog ?? console.warn)(
              `[aquadive] wallet refused ${r.event} (${r.rule}: ${r.reason})`,
              r,
            )
        : undefined,
  });
  // Notifications subscribe second, also for the session's lifetime (V2):
  // flash triggers come from the wallet (after its snapshot is written);
  // the round-transition clears run after the wallet's per-round resets.
  const notifications = createNotificationStore(
    { flashes: wallet, events: engine.events },
    { clock: deps.notificationClock, diagnostics: deps.diagnostics, log: deps.diagnosticsLog },
  );
  // The round store last (§11): seeded from a pure engine read (no DOM, no
  // timers — SSR-safe). It subscribes to no events; written by the driver's per-frame sync
  // (after the frame's events have reached the wallet and
  // the notification store) and once, immediately, inside attachCanvas.
  const round = createRoundStore(engine.getPublicState());
  // The bet input (§9, U5): plain state, no subscriptions — nothing to wire.
  const betInput = createBetInputStore(DEFAULT_BET);
  const driver = new EngineDriver(engine);
  const createRenderer =
    deps.createRenderer ?? ((canvas: HTMLCanvasElement) => new SceneRenderer(canvas));

  return {
    engine,
    wallet,
    notifications,
    round: round.store,
    betInput,
    driver,
    submit: (command) => {
      if (command.type === "placeBet" && !wallet.canPlaceStake(command.amount)) return;
      engine.submit(command);
    },
    attachCanvas: (canvas) => {
      const renderer = createRenderer(canvas);
      // Synchronize once on attach. In production this changes nothing (the
      // engine advances only inside driver frames, each followed by a sync),
      // so it never notifies; it guarantees a remount cannot show a stale
      // frame if the engine was advanced while detached.
      round.write(engine.getPublicState());
      driver.attach({
        frame: (state, time) => {
          renderer.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
          renderer.frame(state, time);
        },
        sync: round.write,
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
