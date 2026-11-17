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
//   itself) or after a refused resume, with no extra callback. IOS-AUDIO
//   (docs/08 §14 risk 17, resolved): on a touch screen `pointerdown` is not
//   a user activation, so its resume() stays pending in WebKit; the
//   `touchend` of the same tap calls `unlock()` again, and the manager
//   repeats the resume inside that activation.
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
// AUDIO_MIX holds the designed per-bus mix gains (A6). They are set from the
// measured levels of the A6 assets and stay provisional until the owner's
// listening pass. A bus's gain is AUDIO_MIX[bus] × the user's linear 0..1
// volume (docs/08 §3.5, D4).
//
// A6.1 and A-OWN: the director plays no `chain-rattle` and no tension creak
// (`tension-creak-1`, `tension-creak-2`) by default, so the host never
// fetches or decodes them: `loadAll` gets the manifest's cues minus the
// director's DISABLED_CUES_BY_DEFAULT. The manifest entries and files stay.
//
// Music (M-OWN, docs/08 §7.6): the host gives the director the soundtrack
// (`MUSIC_MAIN`) and gives the manager the media element factory. The
// director asks for the one stream on its first frame; the manager creates
// the element, and so starts the download, only inside or after the first
// unlock gesture. Nothing else here changes for music: the settings bridge
// already drives the `music` bus, and visibility, mute, detach and dispose
// reach the stream through the manager and the director.
//
// Q15 (the iOS silent switch is respected) and music: on iOS and iPadOS a
// playing media element moves the whole page to the system's "playback"
// audio category, which ignores the silent switch, even when the element is
// routed into Web Audio (docs/08 §7.6, "iOS silent switch"). The streamed
// soundtrack would therefore override Q15 for every sound. Until the owner
// decides otherwise, `browserMusicElement` returns no element on those
// devices: the music stays off there, and effects and ambience behave
// exactly as before. No audio-session API is touched.
//
// Not here: adaptive music stems, countdown audio (Q9), a sound control
// (A5), any audio-session override (Q15), media-session metadata or
// controls.

import {
  createAudioManager,
  createBrowserMediaElement,
  type AudioBus,
  type AudioContextLike,
  type AudioManager,
  type AudioManagerOptions,
  type MediaElementLike,
} from "@/audio/audio-manager";
import {
  DISABLED_CUES_BY_DEFAULT,
  createAudioDirector,
  type AudioDirector,
  type AudioEventSource,
  type AudioFrame,
} from "@/audio/director";
import { SOUND_MANIFEST, type CueId, type SoundManifest } from "@/audio/manifest";
import { anchorTouchdownSeconds } from "@/ui/anchor-touchdown";
import { MUSIC_MAIN, type MusicTrack } from "@/audio/music";
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
 * Designed per-bus mix gains, multiplied with the user's volumes (A6;
 * provisional until the owner's listening pass).
 *
 * - `sfx` 0.7 (−3 dB): the crash plays the snap and the boom together, each
 *   file peaking near −2.5 dBFS; this keeps their sum off the limiter.
 * - `ambience` 0.2 (−14 dB): owner decision 2026-11-17 (A-OWN), the ocean was
 *   too loud at 0.5. The owner-supplied beds measure −32.6 LUFS (surface)
 *   and −23.8 LUFS (underwater), so they sit near −46.6 and −37.8 LUFS in
 *   the game. Provisional until the owner's listening approval.
 * - `music` 0.5 (−6 dB): the owner's starting level for the streamed
 *   soundtrack (M-OWN, D4); provisional until the listening pass.
 */
export const AUDIO_MIX: Readonly<Record<AudioBus, number>> = Object.freeze({
  master: 1,
  music: 0.5,
  ambience: 0.2,
  sfx: 0.7,
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

/** The part of `navigator` that tells an iPhone or iPad from other devices. */
export interface PlatformHints {
  readonly userAgent?: string;
  readonly platform?: string;
  readonly maxTouchPoints?: number;
}

/**
 * True on iOS and iPadOS: the devices with a silent switch (or the matching
 * silent mode) that Q15 respects. Every browser there is WebKit. An iPad in
 * desktop mode reports a Mac with a touch screen.
 */
export function isSilentSwitchPlatform(hints: PlatformHints | null | undefined): boolean {
  if (!hints) return false;
  const userAgent = typeof hints.userAgent === "string" ? hints.userAgent : "";
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  const mac = hints.platform === "MacIntel" || /Macintosh/.test(userAgent);
  return mac && typeof hints.maxTouchPoints === "number" && hints.maxTouchPoints > 1;
}

/**
 * The production media element factory for the music (M-OWN): the browser's
 * `Audio`, except on iOS and iPadOS, where it returns `null` so that the
 * music stays off and Q15 holds (see the header). Reads `navigator` at call
 * time, never at import.
 */
export const browserMusicElement = (): MediaElementLike | null => {
  const hints = (globalThis as { navigator?: PlatformHints }).navigator;
  return isSilentSwitchPlatform(hints) ? null : createBrowserMediaElement();
};

/** The settings surface the host uses: read, subscribe, and the one-time restore. */
export type AudioSettingsSource = Pick<SoundSettingsStore, "get" | "subscribe" | "restore">;

/** The projections of one rendered frame, as the driver already produced them. */
export interface AudioFrameInput {
  readonly render: {
    readonly depthRatio: number;
    /** A-OWN.1: the dive depth and the impact clock, for the sea-floor thud's timing. */
    readonly worldY?: number;
    readonly shipImpact?: { readonly elapsed: number } | null;
  };
  readonly time: { readonly frameDt: number };
  readonly state: {
    readonly phase: AudioFrame["phase"];
    readonly multiplier: number;
    readonly boost: number;
  };
  /**
   * A-OWN.1: the scene size given to `SceneRenderer.resize` this frame. With
   * it, `floor-thud` is timed on the drawn anchor's touchdown
   * (`anchor-touchdown.ts`); without it, it plays on `shipImpact` itself.
   */
  readonly viewport?: { readonly width: number; readonly height: number };
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
  /** Default: the real manifest, with the A6 assets. */
  readonly manifest?: SoundManifest<CueId>;
  /** Default: `browserAudioEnvironment`, resolved on each attach. */
  readonly environment?: () => AudioEnvironment | null;
  /** The soundtrack (M-OWN). Default: `MUSIC_MAIN`. `null`: no music. */
  readonly music?: MusicTrack | null;
  /** The music's media element factory. Default: `browserMusicElement`, resolved at the first unlock. */
  readonly createMediaElement?: () => MediaElementLike | null;
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
  /** The cues the host loads: the manifest minus the director's disabled cues (A6.1, A-OWN). */
  let loadCues: readonly CueId[] = [];
  guard("construct", () => {
    const makeManager = options.createManager ?? createAudioManager;
    const makeBank = options.createBank ?? createSoundBank;
    const music = options.music === undefined ? MUSIC_MAIN : options.music;
    const makeDirector =
      options.createDirector ??
      ((events: AudioEventSource, cueAudio: AudioManager<CueId>) =>
        createAudioDirector(events, cueAudio, { music }));
    // Late-bound resolver: the manager needs the bank, the bank the manager (§7.3).
    let resolveBank: SoundBank<CueId> | null = null;
    const audio = makeManager({
      resolveCue: (cue) => (resolveBank ? resolveBank.resolve(cue) : null),
      createContext: options.createContext,
      createMediaElement: options.createMediaElement ?? browserMusicElement,
    });
    manager = audio;
    const manifest = options.manifest ?? SOUND_MANIFEST;
    loadCues = (Object.keys(manifest) as CueId[]).filter(
      (cue) => !DISABLED_CUES_BY_DEFAULT.includes(cue),
    );
    const sounds = makeBank({
      manifest,
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
      sounds.loadAll(loadCues).then(undefined, (error: unknown) => report("bank load", error));
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
    seaFloor: undefined,
  };
  /** A-OWN.1: the reused landing timing handed to the director. */
  const seaFloor: { elapsed: number; touchdownS: number } = { elapsed: 0, touchdownS: 0 };
  /** The landing timing for this input: absent without geometry, null before the floor. */
  const seaFloorFor = (input: AudioFrameInput): AudioFrame["seaFloor"] => {
    const { viewport, render } = input;
    if (!viewport || render.worldY === undefined) return undefined;
    const impact = render.shipImpact;
    if (!impact) return null;
    const touchdown = anchorTouchdownSeconds(viewport.width, viewport.height, render.worldY);
    if (touchdown === null) return undefined;
    seaFloor.elapsed = impact.elapsed;
    seaFloor.touchdownS = touchdown;
    return seaFloor;
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
        frame.seaFloor = seaFloorFor(input);
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
