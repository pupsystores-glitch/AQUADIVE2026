// Audio host — the session's audio subsystem (Sprint 5 / Phase 7, step A4b;
// docs/08_AUDIO_FX_ARCHITECTURE.md §3.3, §3.5, §7; docs/07 §6, §8).
//
// The only production UI module that imports `src/audio`. One host per game
// session. It owns, for the session's lifetime:
//
// - the AudioManager (lazy context: none until the first unlock);
// - the SoundBank, late-bound to the manager (docs/08 §7.3 wiring);
// - the AudioDirector, subscribed to the engine event bus at construction
//   and paused at once, so no event is buffered while no canvas is attached;
// - the bridge from the session's sound settings store to the manager: mute
//   and bus gains, applied at construction and on every settings change.
//
// Lifecycle:
//
// - **Construction** touches no global: no AudioContext, no DOM, no storage,
//   no fetch. It is safe at module scope and on the server (SSR).
// - **`attach()`** (client only, from `attachCanvas`): restores the saved
//   settings once and applies them, starts loading the sound bank once,
//   then installs the browser listeners for this attachment — user gestures
//   (`pointerdown`, `keydown`, `touchend`, capture, passive) and visibility
//   (`visibilitychange`, `pagehide`, `pageshow`). Idempotent while attached.
// - **Gesture:** settings are restored and applied first; only then does the
//   gesture call `unlock()`. If the restore or the apply did not succeed,
//   the gesture does not unlock: audio stays silent rather than risk
//   playing at the wrong level (docs/08 §14 risk 14). The gesture listeners
//   stay installed while attached. `unlock()` returns at once once unlocked,
//   so a later gesture re-unlocks after an interruption (the manager re-locks
//   itself) or after a refused resume, with no extra callback. A resume that
//   never settles is not retried: docs/08 §14 risk 17 stays open, and
//   `unlock()` is unchanged.
// - **Visibility:** hidden → `suspend()`; visible again → `resume()` (the
//   manager resumes only if unlocked and not muted). `attach()` applies the
//   current visibility once.
// - **`update()`** once per rendered frame, from the session's driver sink,
//   with the projections the driver already produced (no engine read here).
// - **Detach** removes every listener of the attachment and pauses the
//   director (its loops fade out). The manager, bank and settings bridge
//   survive, so a remount resumes without reloading or re-unlocking.
// - **`dispose()`** ends the audio subsystem for good: director, listeners,
//   settings and bank subscriptions, bank, then manager (bank first, §7.3).
//
// Exception isolation: no method throws. Each failing step is caught and
// logged once per kind with `console.error`. A step's lifecycle flag is set
// only after the step succeeded, so a failed step is retried by the next
// attach (or, for the settings, by the next gesture), and a failed listener
// installation is rolled back completely: an attachment never holds half its
// listeners, and a retry never duplicates one.
//
// AUDIO_MIX holds the designed per-bus mix gains. They are neutral (1.0)
// provisional engineering defaults until the A6 listening pass; they are not
// a sound-design decision. A bus's gain is AUDIO_MIX[bus] × the user's linear
// 0..1 volume (docs/08 §3.5, D4).
//
// Not here: music (Q8), countdown audio (Q9), a sound control (A5), assets
// (A6), any audio-session override (Q15), any browser-specific resume
// workaround (risk 17).

import {
  createAudioManager,
  type AudioBus,
  type AudioContextLike,
  type AudioManager,
  type AudioManagerOptions,
} from "@/audio/audio-manager";
import {
  createAudioDirector,
  type AudioDirector,
  type AudioEventSource,
  type AudioFrame,
} from "@/audio/director";
import { SOUND_MANIFEST, type CueId, type SoundManifest } from "@/audio/manifest";
import {
  createSoundBank,
  type FetchLike,
  type SoundBank,
  type SoundBankOptions,
} from "@/audio/sound-bank";
import type { SoundSettings, SoundSettingsStore } from "@/ui/store/sound-settings-store";

/** The bus each settings channel drives. Settings channels and buses share names (A3, D3). */
const BUSES: readonly AudioBus[] = ["master", "music", "ambience", "sfx"];

/**
 * Designed per-bus mix gains, multiplied with the user's volumes. Neutral
 * provisional engineering defaults, tuned in the A6 listening pass.
 */
export const AUDIO_MIX: Readonly<Record<AudioBus, number>> = Object.freeze({
  master: 1,
  music: 1,
  ambience: 1,
  sfx: 1,
});

/** User gestures that may unlock audio (docs/08 §3.3 step 2). */
export const UNLOCK_GESTURES = ["pointerdown", "keydown", "touchend"] as const;

/** A listener target: `window` or `document` in a browser. */
export interface AudioEventTarget {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void, options?: EventListenerOptions): void;
}

/** The browser surface the host listens to. Either half may be missing (SSR, node tests). */
export interface AudioEnvironment {
  /** Gestures, `pagehide` and `pageshow`. */
  readonly window: AudioEventTarget | null;
  /** `visibilitychange`; `visibilityState` is read when it fires and on attach. */
  readonly document: (AudioEventTarget & { readonly visibilityState?: string }) | null;
}

const isTarget = (value: unknown): value is AudioEventTarget =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as AudioEventTarget).addEventListener === "function" &&
  typeof (value as AudioEventTarget).removeEventListener === "function";

/** Production environment: the globals, read at attach time, never at import. */
export const browserAudioEnvironment = (): AudioEnvironment => {
  const scope = globalThis as { window?: unknown; document?: unknown };
  return {
    window: isTarget(scope.window) ? scope.window : null,
    document: isTarget(scope.document)
      ? (scope.document as AudioEventTarget & { visibilityState?: string })
      : null,
  };
};

/** The settings surface the host uses: read, subscribe, and the one-time restore. */
export type AudioSettingsSource = Pick<SoundSettingsStore, "get" | "subscribe" | "restore">;

/** The projections of one rendered frame, as the driver already produced them. */
export interface AudioFrameInput {
  readonly render: { readonly depthRatio: number };
  readonly time: { readonly frameDt: number };
  readonly state: {
    readonly phase: AudioFrame["phase"];
    readonly multiplier: number;
    readonly boost: number;
  };
}

export interface AudioHostOptions {
  /** The engine event bus (`engine.events`). */
  readonly events: AudioEventSource;
  /** The session's sound settings store. */
  readonly settings: AudioSettingsSource;
  /** Context factory for the manager. Default: the browser's, at the first unlock. */
  readonly createContext?: () => AudioContextLike | null;
  /** Fetch for the sound bank. Default: the global `fetch`, read when a load starts. */
  readonly fetch?: FetchLike;
  /** Default: the real manifest (every asset `null` until A6). */
  readonly manifest?: SoundManifest<CueId>;
  /** Default: `browserAudioEnvironment`, resolved on each attach. */
  readonly environment?: () => AudioEnvironment | null;
  /** Test seams: replace a component, for example to inject failures. */
  readonly createManager?: (options: AudioManagerOptions<CueId>) => AudioManager<CueId>;
  readonly createBank?: (options: SoundBankOptions<CueId>) => SoundBank<CueId>;
  readonly createDirector?: (events: AudioEventSource, audio: AudioManager<CueId>) => AudioDirector;
}

export interface AudioHost {
  /**
   * Client-side start for one canvas attachment: restore and apply the
   * settings (once), start loading (once), install this attachment's
   * listeners. Idempotent while attached. Returns the detach (one-shot;
   * any detach of the current attachment detaches). Never throws.
   */
  attach(): () => void;
  /** One rendered frame → the director. A no-op while detached or disposed. Never throws. */
  update(input: AudioFrameInput): void;
  /** Ends the audio subsystem. Idempotent; every later call is a no-op. Never throws. */
  dispose(): void;
}

export function createAudioHost(options: AudioHostOptions): AudioHost {
  const logged = new Set<string>();
  const report = (kind: string, error: unknown) => {
    if (logged.has(kind)) return;
    logged.add(kind);
    console.error(`[audio] host: ${kind} failed; the game continues.`, error);
  };
  /** Runs a step; a throw is logged once per kind. Returns whether it succeeded. */
  const guard = (kind: string, step: () => void): boolean => {
    try {
      step();
      return true;
    } catch (error) {
      report(kind, error);
      return false;
    }
  };

  const settings = options.settings;
  const resolveEnvironment = options.environment ?? browserAudioEnvironment;

  // ----- construction: no global is touched -----

  let manager: AudioManager<CueId> | null = null;
  let bank: SoundBank<CueId> | null = null;
  let director: AudioDirector | null = null;
  guard("construct", () => {
    const makeManager = options.createManager ?? createAudioManager;
    const makeBank = options.createBank ?? createSoundBank;
    const makeDirector = options.createDirector ?? createAudioDirector;
    // Late-bound resolver: the manager needs the bank, the bank the manager (§7.3).
    let resolveBank: SoundBank<CueId> | null = null;
    const audio = makeManager({
      resolveCue: (cue) => (resolveBank ? resolveBank.resolve(cue) : null),
      createContext: options.createContext,
    });
    manager = audio;
    const sounds = makeBank({
      manifest: options.manifest ?? SOUND_MANIFEST,
      decoder: audio,
      fetch: options.fetch,
    });
    resolveBank = sounds;
    bank = sounds;
    const cues = makeDirector(options.events, audio);
    director = cues;
    cues.pause(); // nothing is buffered until a canvas is attached
  });

  let disposed = false;

  // ----- settings bridge -----

  /** The settings snapshot last applied in full, or null. */
  let applied: SoundSettings | null = null;
  const applySettings = (): boolean => {
    const audio = manager;
    if (!audio) return false;
    const current = settings.get();
    if (current === applied) return true;
    applied = null;
    const ok = guard("apply settings", () => {
      audio.setMuted(current.muted);
      for (const bus of BUSES) audio.setBusGain(bus, AUDIO_MIX[bus] * current[bus]);
    });
    if (ok) applied = current;
    return ok;
  };

  let unsubscribeSettings: (() => void) | null = null;
  guard("settings subscribe", () => {
    unsubscribeSettings = settings.subscribe(() => {
      applySettings();
    });
  });
  applySettings();

  /** Restore the saved settings once; set only after a restore that returned. */
  let restored = false;
  const restoreOnce = (): boolean => {
    if (restored) return true;
    if (guard("settings restore", () => settings.restore())) restored = true;
    return restored;
  };

  // ----- sound bank -----

  let unsubscribeReady: (() => void) | null = null;
  guard("bank onReady", () => {
    const sounds = bank;
    if (!sounds) return;
    // A cue became ready: re-send the loops' values so a waiting loop starts now (§14 risk 13).
    unsubscribeReady = sounds.onReady(() => {
      if (!disposed) guard("wake", () => director?.wake());
    });
  });

  /** Loading starts once per host; set only after `loadAll()` returned. */
  let loadStarted = false;
  const loadOnce = () => {
    const sounds = bank;
    if (loadStarted || !sounds) return;
    guard("bank load", () => {
      sounds.loadAll().then(undefined, (error: unknown) => report("bank load", error));
      loadStarted = true;
    });
  };

  // ----- browser listeners (per attachment) -----

  interface Installed {
    readonly target: AudioEventTarget;
    readonly type: string;
    readonly listener: () => void;
  }
  let installed: Installed[] = [];
  let environment: AudioEnvironment | null = null;

  const onGesture = () => {
    if (disposed) return;
    guard("unlock", () => {
      // Settings first (docs/08 §14 risk 14): no unlock unless they are restored and applied.
      if (!restoreOnce() || !applySettings()) return;
      manager?.unlock().then(undefined, (error: unknown) => report("unlock", error));
    });
  };

  const isHidden = () => environment?.document?.visibilityState === "hidden";

  const syncVisibility = () => {
    if (disposed) return;
    guard("visibility", () => {
      if (isHidden()) manager?.suspend();
      else manager?.resume();
    });
  };

  const onPageHide = () => {
    if (disposed) return;
    guard("visibility", () => manager?.suspend());
  };

  const removeListeners = () => {
    for (const { target, type, listener } of installed.splice(0)) {
      guard("remove listener", () => target.removeEventListener(type, listener, { capture: true }));
    }
    environment = null;
  };

  /** Installs every listener, or none: a failure rolls back the ones added. */
  const installListeners = () => {
    if (installed.length > 0) return;
    let env: AudioEnvironment | null;
    try {
      env = resolveEnvironment();
    } catch (error) {
      report("environment", error);
      return;
    }
    if (!env) return;
    const { window: win, document: doc } = env;
    const wanted: { target: AudioEventTarget | null; type: string; listener: () => void }[] = [
      ...UNLOCK_GESTURES.map((type) => ({ target: win, type, listener: onGesture })),
      { target: doc, type: "visibilitychange", listener: syncVisibility },
      { target: win, type: "pagehide", listener: onPageHide },
      { target: win, type: "pageshow", listener: syncVisibility },
    ];
    environment = env;
    const added: Installed[] = [];
    const ok = guard("add listener", () => {
      for (const { target, type, listener } of wanted) {
        if (!target) continue;
        target.addEventListener(type, listener, { capture: true, passive: true });
        added.push({ target, type, listener });
      }
    });
    installed = added;
    if (!ok) {
      removeListeners();
      return;
    }
    syncVisibility();
  };

  // ----- attachment -----

  let attached = false;
  /** Increments per attachment; a detach from an earlier attachment does nothing. */
  let attachment = 0;

  const detach = () => {
    if (!attached) return;
    attached = false;
    removeListeners();
    guard("pause", () => director?.pause());
  };

  // One reused frame object: no per-frame allocation.
  const frame: { -readonly [K in keyof AudioFrame]: AudioFrame[K] } = {
    phase: "idle",
    depthRatio: 0,
    multiplier: 1,
    boost: 0,
    dt: 0,
  };

  return {
    attach() {
      if (disposed) return () => {};
      if (!attached) {
        attached = true;
        attachment++;
        restoreOnce();
        applySettings();
        loadOnce();
        installListeners();
      }
      const mine = attachment;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        if (mine === attachment) detach();
      };
    },
    update(input) {
      if (disposed || !attached || !director) return;
      const cues = director;
      guard("update", () => {
        frame.phase = input.state.phase;
        frame.multiplier = input.state.multiplier;
        frame.boost = input.state.boost;
        frame.depthRatio = input.render.depthRatio;
        frame.dt = input.time.frameDt;
        cues.update(frame);
      });
    },
    dispose() {
      if (disposed) return;
      detach();
      disposed = true;
      guard("dispose director", () => director?.dispose());
      guard("settings unsubscribe", () => unsubscribeSettings?.());
      guard("bank unsubscribe", () => unsubscribeReady?.());
      // Bank before manager: a manager disposed first fails the bank's waiting decodes (§7.3).
      guard("dispose bank", () => bank?.dispose());
      guard("dispose manager", () => manager?.dispose());
      unsubscribeSettings = null;
      unsubscribeReady = null;
    },
  };
}
