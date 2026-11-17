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
//
// E-X3 (Dual Bet, 2026-11-14): one bet-input store per slot (`betInputs`),
// and submit() keeps every forwarded placeBet in flight until the engine
// answers it (betPlaced or commandRejected). The engine accepts at most one
// bet per slot, so the most two slots can be debited is the largest stake in
// flight for each; a bet is forwarded only if it fits the balance next to
// the OTHER slot's largest stake in flight. Two bets submitted before the
// next tick can therefore never together exceed the balance (the engine
// knows no balance; without this it would accept both and the wallet would
// refuse the second under W3, splitting engine and wallet — I8). A slot's
// own repeated submissions are not reserved against each other: the engine
// rejects all but one, so single-slot behavior is unchanged.
//
// Since A4b (Phase 7, docs/08 §3.3, §7) the session also owns the sound
// settings store and one audio host (src/ui/audio-host.ts, the only UI
// module that imports src/audio). The host is constructed here, last — its
// director subscribes to the engine bus after every settlement listener and
// is paused at once — and touches no global until a canvas attaches.
// attachCanvas attaches it (settings restore + apply, one bank load,
// gesture and visibility listeners) before the driver starts, and the
// driver's sync hands it the frame's projections after the round-store
// write: the public state already passed to sync, plus the render state and
// time the frame callback received, so no extra engine read is made. The
// host never throws, so audio cannot stop the rAF loop or settlement.
// dispose() ends the audio subsystem only.
//
// Since V1 (Phase 7, docs/08 §4.2, §5) the session also forwards two engine
// events to the attached renderer's FX queue: `crashed` → trigger("crash")
// and `bettingOpened` → trigger("reset"). The two listeners are subscribed
// once, at construction, after the audio host (every earlier listener keeps
// its order); they reach only the renderer currently attached, never throw,
// and forward nothing while no canvas is attached. V1 adds no visible effect.
//
// LA1 (the startup screen, src/ui/startup.ts): whenFrameRendered(callback)
// calls back once, after the next frame the attached renderer has drawn.
// The startup screen uses it once to know the first playable frame is on
// the canvas. The frame sink checks one array length per frame; no loading
// progress runs through the animation loop.

import {
  BET_SLOTS,
  EngineDriver,
  GameEngine,
  LocalRoundAuthority,
  createMathRandomRng,
  type EngineCommand,
  type Rng,
  type RoundAuthority,
} from "@/engine";
import { DEFAULT_BET } from "@/game/constants";
import { SceneRenderer, type RenderState, type RenderTime } from "@/rendering/scene-renderer";
import { createAudioHost, type AudioHost, type AudioHostOptions } from "@/ui/audio-host";
import { audioDiagnostics } from "@/ui/audio-diagnostics-instance";
import { fitScene, type SceneViewport } from "@/ui/scene-fit";
import { createBetInputStore, type BetInputStore } from "@/ui/store/bet-input-store";
import {
  createNotificationStore,
  type NotificationClock,
  type NotificationStore,
  type RejectionLogger,
} from "@/ui/store/notification-store";
import { createRoundStore, type RoundStore } from "@/ui/store/round-store";
import {
  createSoundSettingsStore,
  type SoundSettingsStorageResolver,
  type SoundSettingsStore,
} from "@/ui/store/sound-settings-store";
import {
  createWalletStore,
  isPlaceableStake,
  type WalletRefusal,
  type WalletStore,
} from "@/ui/store/wallet-store";

/**
 * The renderer surface the session drives — SceneRenderer in production,
 * injectable for headless tests (§8 test seam). `trigger` (V1, the FX event
 * channel) is optional so a test renderer may omit it.
 */
export type CanvasRenderer = Pick<SceneRenderer, "resize" | "frame" | "dispose"> &
  Partial<Pick<SceneRenderer, "trigger">>;

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
  /** A4b test seam: audio host options (context factory, fetch, manifest, environment, component factories). Default: the browser's, resolved lazily. */
  audio?: Omit<AudioHostOptions, "events" | "settings">;
  /** A4b test seam: sound settings storage. Default: the global `localStorage`, resolved at call time. */
  soundSettingsStorage?: SoundSettingsStorageResolver;
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
  /** E-X3: each bet slot's amount field (§9, V4), index = BetSlot: session-scoped, starts at DEFAULT_BET, independent of every other store. */
  readonly betInputs: readonly [BetInputStore, BetInputStore];
  /** The rAF/wall-clock owner. Exposed for tests; production code attaches only via attachCanvas. */
  readonly driver: EngineDriver;
  /** A4b: mute and volumes (docs/08 §3.5): session-scoped; restored on the first attach; the audio host applies every change. */
  readonly soundSettings: SoundSettingsStore;
  /** A4b: the audio subsystem (src/ui/audio-host.ts). Exposed for tests; attached only via attachCanvas. */
  readonly audio: AudioHost;
  /**
   * A4b: disposes the AUDIO SUBSYSTEM ONLY (tests, HMR): the director's
   * subscriptions, the browser listeners, the sound bank and the
   * AudioManager (its context is closed). Idempotent. The engine, driver,
   * wallet, notifications, round and bet-input stores, submit() and
   * attachCanvas() keep working; a later attachCanvas renders silently.
   */
  dispose(): void;
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
   * LA1: calls back once, right after the next frame a renderer has drawn
   * (no canvas attached: after the first frame once one is). Returns the
   * cancel. A throwing callback is logged and does not affect the frame.
   */
  whenFrameRendered(callback: () => void): () => void;
  /**
   * The single command edge for components (§8). placeBet is dropped unless
   * its slot is 0 or 1 and its amount is a valid stake (M1-D1/D2: whole
   * cents, ≥ 0.01) the wallet can afford once the stakes still in flight are
   * reserved (E-X3) — the PLACE BET enable rule's own predicate (M1-D3,
   * §23.5); everything is otherwise forwarded unchanged. The engine remains the validator of all
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
  const betInputs = [createBetInputStore(DEFAULT_BET), createBetInputStore(DEFAULT_BET)] as const;
  // E-X3: forwarded placeBet commands not yet answered. Each one the engine
  // applies is answered by exactly one betPlaced (matched by slot and
  // amount) or commandRejected (which carries the command itself).
  type PlaceBet = EngineCommand & { type: "placeBet" };
  const inFlight: PlaceBet[] = [];
  const release = (match: (c: PlaceBet) => boolean) => {
    const i = inFlight.findIndex(match);
    if (i >= 0) inFlight.splice(i, 1);
  };
  engine.events.on("betPlaced", ({ slot, amount }) =>
    release((c) => c.slot === slot && Object.is(c.amount, amount)),
  );
  engine.events.on("commandRejected", ({ command }) => {
    if (command.type === "placeBet") release((c) => c === command);
  });
  /** The largest stake in flight for the other slot — what it may still debit. */
  const otherSlotReserve = (slot: PlaceBet["slot"]) =>
    inFlight.reduce((max, c) => (c.slot !== slot && c.amount > max ? c.amount : max), 0);
  const driver = new EngineDriver(engine);
  const createRenderer =
    deps.createRenderer ?? ((canvas: HTMLCanvasElement) => new SceneRenderer(canvas));
  // A4b: sound settings (no storage read until restore) and the audio host,
  // last: its director's listeners follow every settlement listener. Pure
  // construction — no context, DOM, storage or fetch (SSR-safe).
  const soundSettings = createSoundSettingsStore({ storage: deps.soundSettingsStorage });
  const audio = createAudioHost({ ...deps.audio, events: engine.events, settings: soundSettings });
  // V1 (docs/08 §4.2, §5): forward `crashed` / `bettingOpened` to the attached
  // renderer's FX queue. Subscribed once, here, after the audio host, so every
  // earlier listener keeps its order; the renderer stamps the event on its next
  // frame. Nothing is forwarded while no canvas is attached, and a renderer
  // failure never reaches the engine bus.
  let fxTarget: CanvasRenderer | null = null;
  const forwardFx = (kind: "crash" | "reset") => {
    try {
      fxTarget?.trigger?.(kind);
    } catch {
      // FX are presentation only; dropping one is harmless.
    }
  };
  engine.events.on("crashed", () => forwardFx("crash"));
  engine.events.on("bettingOpened", () => forwardFx("reset"));
  // LA1: one-shot callbacks after the next drawn frame.
  const frameWaiters: (() => void)[] = [];
  const notifyFrameWaiters = () => {
    for (const callback of frameWaiters.splice(0)) {
      try {
        callback();
      } catch (error) {
        console.error("[ui] a frame-rendered callback failed:", error);
      }
    }
  };

  return {
    engine,
    wallet,
    notifications,
    round: round.store,
    betInputs,
    driver,
    soundSettings,
    audio,
    dispose: () => audio.dispose(),
    whenFrameRendered: (callback) => {
      frameWaiters.push(callback);
      return () => {
        const i = frameWaiters.indexOf(callback);
        if (i >= 0) frameWaiters.splice(i, 1);
      };
    },
    submit: (command) => {
      if (command.type === "placeBet") {
        if (!BET_SLOTS.includes(command.slot)) return;
        // The other slot's stake in flight is already spent from this bet's point of view.
        const available = +(wallet.get().balance - otherSlotReserve(command.slot)).toFixed(2);
        if (!isPlaceableStake(command.amount, available)) return;
        inFlight.push(command);
      } else if (command.type === "cashOut" && !BET_SLOTS.includes(command.slot)) {
        return;
      }
      engine.submit(command);
    },
    attachCanvas: (canvas) => {
      const renderer = createRenderer(canvas);
      fxTarget = renderer;
      // Synchronize once on attach. In production this changes nothing (the
      // engine advances only inside driver frames, each followed by a sync),
      // so it never notifies; it guarantees a remount cannot show a stale
      // frame if the engine was advanced while detached.
      round.write(engine.getPublicState());
      // Scene fit (Sprint 4 QA fix): short canvases get a zoomed-out logical
      // viewport so the idle ship and the anchor both stay on screen
      // (src/ui/scene-fit.ts). Memoized on the measured inputs, so a steady
      // size costs one comparison per frame.
      let fitKey = "";
      let fit: SceneViewport = { width: 0, height: 0, dpr: 1 };
      // A4b: audio attaches before the first frame (settings restored and
      // applied before any gesture can unlock). It never throws.
      const detachAudio = audio.attach();
      // The frame's render projections, handed to audio in sync (no extra engine read).
      let audioRender: RenderState | null = null;
      let audioTime: RenderTime | null = null;
      driver.attach({
        frame: (state, time) => {
          audioRender = state;
          audioTime = time;
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;
          const ratio = window.devicePixelRatio || 1;
          const key = `${w}x${h}@${ratio}`;
          if (key !== fitKey) {
            fitKey = key;
            fit = fitScene(w, h, ratio);
          }
          renderer.resize(fit.width, fit.height, fit.dpr);
          renderer.frame(state, time);
          if (frameWaiters.length > 0) notifyFrameWaiters();
        },
        sync: (state) => {
          round.write(state);
          // After the round store: audio cannot delay or break the HUD write.
          if (audioRender && audioTime) {
            try {
              // A-OWN.1: the scene size, so the sea-floor thud lands on the anchor's touchdown.
              audio.update({ render: audioRender, time: audioTime, state, viewport: fit });
            } catch {
              // The host never throws; this keeps rAF safe even if it did.
            }
          }
        },
      });
      return () => {
        if (fxTarget === renderer) fxTarget = null;
        driver.detach();
        renderer.dispose();
        detachAudio();
      };
    },
  };
}

// The production singleton. The two engine RNG streams (docs/06 §11, §16):
// outcome draws go through the RoundAuthority; world draws (creature rolls,
// spawn jitter) through the injected `world` stream.
//
// IOS-AUDIO (temporary): with `?audiodebug=1` in a DEV build, the audio
// host runs through the diagnostics recorder's seams, which change no
// behaviour (src/ui/audio-diagnostics.ts). Otherwise `audioDiagnostics` is
// null and nothing changes.
export const gameSession: GameSession = createGameSession({
  authority: new LocalRoundAuthority(createMathRandomRng()),
  worldRng: createMathRandomRng(),
  diagnostics: import.meta.env.DEV,
  ...(audioDiagnostics ? { audio: audioDiagnostics.hostOptions } : {}),
});
