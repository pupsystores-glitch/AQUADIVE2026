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
// soundtrack would therefore override Q15 for every sound.
//
// LA1 (owner authorization 2026-11-17: the soundtrack must play on iPhone;
// docs/08 §7.6 alternative 2): on iOS and iPadOS the host sets the documented
// Audio Session API, `navigator.audioSession.type = "ambient"` (W3C Audio
// Session draft; Safari 16.4 and later), once, on the client, before any
// sound: at `attach()`/`preload()` and again in `browserMusicElement`. The
// whole page, the soundtrack included, then stays in the "ambient" category:
// it plays with the ringer on, and the silent switch silences everything,
// music too, so Q15 holds. Where the API is missing (iOS before 16.4) no
// element is made and the music stays off there, as before LA1. The session
// is never touched on any other platform, and never set to "playback".
//
// LA1 switches (the two buttons under the balance, `sound-settings-store`):
// SOUND off sets the `sfx` and `ambience` buses to 0; MUSIC off sets the
// `music` bus to 0 and holds the one stream through the director (paused,
// position kept; never requested while off, so nothing is downloaded). The
// master mute and the four volumes keep their meaning. With both switches
// off the manager is muted as well, so the context suspends and nothing
// runs. A switch change made by a button press is applied synchronously,
// inside that press, so iOS accepts the resume and the `play()` it causes.
//
// LA1 loading (the startup screen, `src/ui/startup.ts`): `preload()` starts
// the cue downloads before the canvas attaches, checks Web Audio and codec
// support, and probes the soundtrack with one HEAD request (no body: the
// soundtrack is still streamed only after START GAME). `loading` is a store
// of what has arrived. Bytes are counted by wrapping the bank's fetch, so
// there is still one request per cue. Decoding still waits for the unlock.
// `unlock()` is the explicit gesture path for the START GAME button, and
// `deferGestureUnlock()` (called by the startup) makes page-wide gestures
// wait for it: a tap on the loading screen or on Retry starts no sound.
//
// Not here: adaptive music stems, countdown audio (Q9), volume sliders
// (A5), an audio-session type other than "ambient", media-session metadata
// or controls.

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
  type FetchResponseLike,
  type SoundBank,
  type SoundBankOptions,
} from "@/audio/sound-bank";
import type { SoundSettings, SoundSettingsStore } from "@/ui/store/sound-settings-store";
import { createStore, type ReadableStore } from "@/ui/store/store";

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

/** `navigator` as the host reads it: the platform hints and, on iOS only, the Audio Session API. */
export interface NavigatorHints extends PlatformHints {
  readonly audioSession?: unknown;
}

/**
 * What `prepareAmbientAudioSession` found (LA1):
 * - `not-needed`: not iOS or iPadOS; nothing was read or written;
 * - `ambient`: iOS or iPadOS, and the page's audio session type is "ambient";
 * - `unavailable`: iOS or iPadOS without a usable `navigator.audioSession`.
 */
export type AudioSessionOutcome = "not-needed" | "ambient" | "unavailable";

/**
 * LA1: on iOS and iPadOS, sets the documented `navigator.audioSession.type`
 * to "ambient", so a playing soundtrack keeps the page in the category that
 * obeys the silent switch (Q15). Idempotent. Reads `audioSession` on those
 * devices only. Never throws.
 */
export function prepareAmbientAudioSession(
  nav: NavigatorHints | null | undefined,
): AudioSessionOutcome {
  if (!isSilentSwitchPlatform(nav)) return "not-needed";
  try {
    const session = nav?.audioSession as { type?: unknown } | null | undefined;
    if (typeof session !== "object" || session === null || typeof session.type !== "string") {
      return "unavailable";
    }
    if (session.type !== "ambient") session.type = "ambient";
    return session.type === "ambient" ? "ambient" : "unavailable";
  } catch {
    return "unavailable";
  }
}

const browserNavigator = (): NavigatorHints | undefined =>
  (globalThis as { navigator?: NavigatorHints }).navigator;

/**
 * The production media element factory for the music (M-OWN, LA1): the
 * browser's `Audio`. On iOS and iPadOS only once the page's audio session is
 * "ambient" (set here if it is not yet); without the Audio Session API it
 * returns `null` there, so that the music stays off and Q15 holds (see the
 * header). Reads `navigator` at call time, never at import.
 */
export const browserMusicElement = (): MediaElementLike | null => {
  if (prepareAmbientAudioSession(browserNavigator()) === "unavailable") return null;
  return createBrowserMediaElement();
};

/** LA1: what this browser can play, checked once by `preload()`. */
export interface AudioSupport {
  /** `AudioContext` or `webkitAudioContext` exists. */
  readonly webAudio: boolean;
  /** MP3 (the soundtrack and some cues). */
  readonly mp3: boolean;
  /** AAC in MP4 (the other cues). */
  readonly aac: boolean;
}

/** Production support check: constructors and `canPlayType`, read at call time. Creates no context. */
export const browserAudioSupport = (): AudioSupport | null => {
  const scope = globalThis as {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
    document?: { createElement?: (tag: string) => { canPlayType?: (type: string) => string } };
  };
  if (typeof scope.document?.createElement !== "function") return null;
  const probe = scope.document.createElement("audio");
  const can = (type: string) =>
    typeof probe.canPlayType === "function" && probe.canPlayType(type) !== "";
  return {
    webAudio:
      typeof scope.AudioContext === "function" || typeof scope.webkitAudioContext === "function",
    mp3: can("audio/mpeg"),
    aac: can('audio/mp4; codecs="mp4a.40.2"'),
  };
};

/**
 * LA1: whether the soundtrack file is reachable, without downloading it.
 * true: found; false: missing (404/410) or the request failed; null: the
 * server does not say (HEAD refused, for example). Never rejects.
 */
export type MusicProbe = (url: string) => Promise<boolean | null>;

/** Production probe: one HEAD request (no body). */
export const browserMusicProbe: MusicProbe = (url) => {
  const scope = globalThis as {
    fetch?: (url: string, init: { method: string }) => Promise<{ ok: boolean; status: number }>;
  };
  if (typeof scope.fetch !== "function") return Promise.resolve(null);
  try {
    return scope.fetch(url, { method: "HEAD" }).then(
      (response) => {
        if (response.ok) return true;
        return response.status === 404 || response.status === 410 ? false : null;
      },
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
};

/**
 * LA1: the soundtrack's readiness for the startup screen.
 * - `none`: the host has no soundtrack;
 * - `withheld`: iOS or iPadOS without the Audio Session API (Q15 keeps it off);
 * - `unsupported`: the browser cannot play MP3 or has no Web Audio;
 * - `pending`: not checked yet;
 * - `available` / `unavailable`: the probe's answer (`available` also when the
 *   server would not say).
 */
export type MusicReadiness =
  "none" | "withheld" | "unsupported" | "pending" | "available" | "unavailable";

/** LA1: what the startup screen knows about the audio downloads. */
export interface AudioLoadState {
  /** `preload()` (or the first attach) has started the downloads. */
  readonly started: boolean;
  /** Cue files to download: the enabled cues that have an asset. */
  readonly cues: number;
  /** Cue files whose bytes have arrived. */
  readonly fetched: number;
  /** Cue files that failed to download. */
  readonly failed: number;
  readonly music: MusicReadiness;
  /**
   * `pending` until checked; `unknown`: no DOM to check with; `unsupported`:
   * no Web Audio, or neither codec.
   */
  readonly support: "pending" | "unknown" | "supported" | "unsupported";
}

const INITIAL_LOAD_STATE: AudioLoadState = Object.freeze({
  started: false,
  cues: 0,
  fetched: 0,
  failed: 0,
  music: "pending",
  support: "pending",
});

/** The global `fetch`, read at call time, as the sound bank reads it. */
const globalFetch = (): FetchLike | null => {
  const scope = globalThis as { fetch?: FetchLike };
  if (typeof scope.fetch !== "function") return null;
  return (url, init) => scope.fetch!(url, init);
};

/** LA1: a bus's gain: the mix × the user's volume, or 0 while its switch is off. */
export function busLevel(bus: AudioBus, settings: SoundSettings): number {
  if (bus === "music" && !settings.musicOn) return 0;
  if ((bus === "sfx" || bus === "ambience") && !settings.soundOn) return 0;
  return AUDIO_MIX[bus] * settings[bus];
}

/** LA1: the manager is muted by the master mute, and also when both switches are off. */
export const managerMuted = (settings: SoundSettings): boolean =>
  settings.muted || (!settings.soundOn && !settings.musicOn);

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
  /** LA1: the iOS audio session step. Default: `prepareAmbientAudioSession(navigator)`. */
  readonly prepareAudioSession?: () => AudioSessionOutcome;
  /** LA1: the support check. Default: `browserAudioSupport`. */
  readonly audioSupport?: () => AudioSupport | null;
  /** LA1: the soundtrack probe. Default: `browserMusicProbe` (one HEAD request). */
  readonly probeMusic?: MusicProbe;
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
  /**
   * LA1, client only: start the cue downloads (once), prepare the iOS audio
   * session, check support and probe the soundtrack (once). Creates no
   * context and plays nothing. Idempotent. Never throws.
   */
  preload(): void;
  /**
   * LA1: the gesture path, for a button's own handler (START GAME): restore
   * and apply the settings, then unlock, exactly as a listened gesture does.
   * Call it inside the user gesture. Also ends `deferGestureUnlock()`, so
   * later page-wide gestures re-unlock after an interruption as before.
   * Never throws.
   */
  unlock(): void;
  /**
   * LA1: until the next `unlock()`, page-wide gestures (taps on the startup
   * screen, Retry) do not unlock audio, so nothing of the round running
   * under the startup screen is heard before START GAME. Never throws.
   */
  deferGestureUnlock(): void;
  /** LA1: the downloads' progress, for the startup screen. */
  readonly loading: ReadableStore<AudioLoadState>;
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
  /** LA1: the soundtrack, or null. */
  const music = options.music === undefined ? MUSIC_MAIN : options.music;

  // ----- LA1: download progress -----

  const loading = createStore<AudioLoadState>(INITIAL_LOAD_STATE);
  const patchLoading = (patch: Partial<AudioLoadState>) => {
    loading.set(Object.freeze({ ...loading.get(), ...patch }));
  };
  /** Per counted cue: its download's outcome so far. */
  const cueDownloads = new Map<CueId, "pending" | "fetched" | "failed">();
  /** The counted cues of each URL (two cues may share a file). */
  const cuesByUrl = new Map<string, CueId[]>();
  const markDownload = (cues: readonly CueId[] | undefined, outcome: "fetched" | "failed") => {
    if (!cues) return;
    let changed = false;
    for (const cue of cues) {
      if (cueDownloads.get(cue) !== "pending") continue;
      cueDownloads.set(cue, outcome);
      changed = true;
    }
    if (!changed) return;
    let fetched = 0;
    let failed = 0;
    for (const outcome of cueDownloads.values()) {
      if (outcome === "fetched") fetched++;
      else if (outcome === "failed") failed++;
    }
    patchLoading({ fetched, failed });
  };
  /**
   * The bank's fetch, counting arrived bytes per URL. Same requests, same
   * responses: only `arrayBuffer()` is observed. Without a fetch it fails as
   * the bank's own default does.
   */
  const trackedFetch: FetchLike = (url, init) => {
    const fetchAsset = options.fetch ?? globalFetch();
    const cues = cuesByUrl.get(url);
    if (!fetchAsset) {
      markDownload(cues, "failed");
      return Promise.reject(new Error("fetch is unavailable"));
    }
    let request: Promise<FetchResponseLike>;
    try {
      request = fetchAsset(url, init);
    } catch (error) {
      markDownload(cues, "failed");
      return Promise.reject(error);
    }
    return request.then(
      (response): FetchResponseLike => {
        if (!response.ok) {
          markDownload(cues, "failed");
          return response;
        }
        return {
          ok: response.ok,
          status: response.status,
          arrayBuffer: () =>
            response.arrayBuffer().then(
              (bytes) => {
                markDownload(cues, "fetched");
                return bytes;
              },
              (error: unknown) => {
                markDownload(cues, "failed");
                throw error;
              },
            ),
        };
      },
      (error: unknown) => {
        markDownload(cues, "failed");
        throw error;
      },
    );
  };

  guard("construct", () => {
    const makeManager = options.createManager ?? createAudioManager;
    const makeBank = options.createBank ?? createSoundBank;
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
    // LA1: the counted downloads: every loaded cue that has a file.
    for (const cue of loadCues) {
      const url = manifest[cue]?.asset?.url;
      if (typeof url !== "string") continue;
      cueDownloads.set(cue, "pending");
      cuesByUrl.set(url, [...(cuesByUrl.get(url) ?? []), cue]);
    }
    const sounds = makeBank({
      manifest,
      decoder: audio,
      fetch: trackedFetch,
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
      // LA1: unmute first, so a switch turned on inside a press resumes in that gesture.
      audio.setMuted(managerMuted(current));
      for (const bus of BUSES) audio.setBusGain(bus, busLevel(bus, current));
      director?.setMusicEnabled?.(current.musicOn);
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
      const cues = loadCues;
      sounds.loadAll(cues).then(
        (results) => {
          // LA1: a cue that ended without a download (invalid entry, cancelled) is settled too.
          results.forEach((result, i) => {
            if (result !== "ready") markDownload([cues[i]], "failed");
          });
        },
        (error: unknown) => report("bank load", error),
      );
      loadStarted = true;
      patchLoading({ started: true, cues: cueDownloads.size });
    });
  };

  // ----- LA1: iOS audio session, support check, soundtrack probe -----

  let sessionOutcome: AudioSessionOutcome | null = null;
  const prepareSessionOnce = () => {
    if (sessionOutcome !== null) return;
    guard("audio session", () => {
      const prepare =
        options.prepareAudioSession ?? (() => prepareAmbientAudioSession(browserNavigator()));
      sessionOutcome = prepare();
    });
  };

  let checked = false;
  const checkOnce = () => {
    if (checked || disposed) return;
    checked = true;
    let support: AudioSupport | null = null;
    guard("support check", () => {
      support = (options.audioSupport ?? browserAudioSupport)();
    });
    const found = support as AudioSupport | null;
    const playable = found === null || (found.webAudio && (found.mp3 || found.aac));
    patchLoading({ support: found === null ? "unknown" : playable ? "supported" : "unsupported" });
    if (!music) {
      patchLoading({ music: "none" });
      return;
    }
    if (sessionOutcome === "unavailable") {
      patchLoading({ music: "withheld" });
      return;
    }
    if (found !== null && (!found.webAudio || !found.mp3)) {
      patchLoading({ music: "unsupported" });
      return;
    }
    guard("music probe", () => {
      (options.probeMusic ?? browserMusicProbe)(music.url).then(
        (reachable) => {
          if (!disposed) patchLoading({ music: reachable === false ? "unavailable" : "available" });
        },
        () => {
          if (!disposed) patchLoading({ music: "unavailable" });
        },
      );
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

  const unlockNow = () => {
    if (disposed) return;
    prepareSessionOnce(); // LA1: the iOS session is "ambient" before the context exists
    guard("unlock", () => {
      // Settings first (docs/08 §14 risk 14): no unlock unless they are restored and applied.
      if (!restoreOnce() || !applySettings()) return;
      manager?.unlock().then(undefined, (error: unknown) => report("unlock", error));
    });
  };

  /** LA1: false while the startup screen holds page-wide gestures back (until START GAME). */
  let gesturesUnlock = true;
  const onGesture = () => {
    if (gesturesUnlock) unlockNow();
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
        prepareSessionOnce();
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
    preload() {
      if (disposed) return;
      prepareSessionOnce();
      loadOnce();
      checkOnce();
    },
    unlock() {
      gesturesUnlock = true;
      unlockNow();
    },
    deferGestureUnlock() {
      if (!disposed) gesturesUnlock = false;
    },
    loading,
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
