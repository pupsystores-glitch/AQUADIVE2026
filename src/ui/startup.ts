// Startup controller — the premium loading screen's state (LA1, owner
// authorization 2026-11-17; docs/07 §24).
//
// Phases: initializing → loading → ready → playing, with failed (an image
// could not load; Retry) on the side. `initializing` is the server render
// and the moment before hydration: the loading screen is already drawn, so
// no part of the game UI is ever shown half-loaded. `begin()` (the client,
// once, after hydration) starts loading. `ready` shows START GAME; the
// player's press calls `startGame()`, which runs the audio unlock inside that
// gesture and moves to `playing`, where the screen fades out for good.
//
// Readiness is measured, never timed: each task completes on a real signal.
//
// | Task          | Weight | Done when                                              | Blocks READY |
// | ------------- | ------ | ------------------------------------------------------ | ------------ |
// | app           | 5      | the client has hydrated and called `begin()`; the       | yes          |
// |               |        | session, engine and stores exist (module scope)         |              |
// | images        | 55     | each artwork file loaded and decoded (share by count)   | yes          |
// | renderer      | 10     | a frame has been drawn after every image was ready      | yes          |
// | audio support | 2      | Web Audio and codec support checked (no context made)   | grace        |
// | sounds        | 25     | each enabled cue's bytes arrived or failed (by count)   | grace        |
// | music         | 3      | the soundtrack's HEAD probe answered (no download)      | grace        |
//
// Progress = the sum of the completed weights / 100, never lower than
// before. Byte-level progress is not available for images (an `Image` has no
// progress events), so a group advances by completed files. 100 % is shown
// only together with `ready`.
//
// Audio never blocks the game indefinitely: once the visual tasks are done,
// the audio tasks get `AUDIO_GRACE_MS` more. After that they count as done
// ("deferred"): the downloads continue in the background, the sounds start
// when they arrive, and a quiet notice says so. A failed sound, unsupported
// audio or an unavailable soundtrack are notices, never blockers. The
// soundtrack itself is never downloaded here: it streams after START GAME.
//
// Audio starts only at START GAME (or Continue): `begin()` asks the audio
// host to hold page-wide gesture unlocks, and `startGame()` unlocks
// explicitly inside its press, which also releases that hold.
//
// Failures: a failed image moves to `failed` (once no image is still
// loading) with Retry, which reloads only the failed images, and Continue,
// which starts the game on the renderer's vector fallbacks. After
// `SLOW_HINT_MS` without READY a "slow connection" hint and Continue appear,
// so the screen can never trap the player. Every action is idempotent, and
// nothing here creates a session, an engine or a second audio system.
//
// Not driven by the animation loop: progress changes only on load events,
// one frame callback and timers. Import rule: only `./store/store` (types
// for the rest). No React, no DOM, no wall clock (timers are injected).

import type { AudioLoadState } from "./audio-host";
import { createStore, type ReadableStore } from "./store/store";

export type StartupPhase = "initializing" | "loading" | "ready" | "failed" | "playing";

/** A notice about audio; never blocks. In order of importance. */
export type StartupAudioNotice =
  | "audio-unsupported"
  | "sounds-failed"
  | "sounds-deferred"
  | "music-unavailable"
  | "music-withheld";

export interface StartupSnapshot {
  readonly phase: StartupPhase;
  /** 0..1, monotonic. 1 only when `phase` is `ready` or later. */
  readonly progress: number;
  /** Loading has taken longer than `SLOW_HINT_MS`: show the hint and Continue. */
  readonly slow: boolean;
  /** The image keys that failed, while `failed`. */
  readonly failedImages: readonly string[];
  /** The most important audio notice, or null. */
  readonly audioNotice: StartupAudioNotice | null;
}

/** The task weights (sum 100). */
export const STARTUP_WEIGHTS = Object.freeze({
  app: 5,
  images: 55,
  renderer: 10,
  audioSupport: 2,
  sounds: 25,
  music: 3,
});

/** How long audio may keep READY waiting once the visual tasks are done. */
export const AUDIO_GRACE_MS = 8000;

/** After this long without READY, the slow hint and Continue appear. */
export const SLOW_HINT_MS = 12000;

/** The image loader surface (`assets` in src/rendering/assets.ts). */
export interface StartupImages {
  keys(): readonly string[];
  status(key: string): "loading" | "ready" | "failed";
  subscribe(listener: () => void): () => void;
  retry(key: string): void;
}

/** The audio host surface the startup uses. */
export interface StartupAudio {
  preload(): void;
  unlock(): void;
  /** Holds page-wide gesture unlocks until `unlock()` (START GAME). Optional for test doubles. */
  deferGestureUnlock?(): void;
  readonly loading: ReadableStore<AudioLoadState>;
}

export interface StartupTimers {
  set(callback: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

export interface StartupDeps {
  readonly images: StartupImages;
  readonly audio: StartupAudio;
  /** The session's one-shot frame callback. */
  readonly whenFrameRendered: (callback: () => void) => () => void;
  /** Default: the global setTimeout / clearTimeout, read at call time. */
  readonly timers?: StartupTimers;
}

export interface Startup extends ReadableStore<StartupSnapshot> {
  /** Client only, after hydration. Starts loading once. Never throws. */
  begin(): void;
  /** `failed` only: reload the failed images. */
  retry(): void;
  /**
   * The START GAME press (or Continue): unlock audio inside this gesture, then
   * `playing`. Allowed when `ready`, `failed`, or `slow`. Never throws.
   */
  startGame(): void;
}

const browserTimers: StartupTimers = {
  set: (callback, ms) => globalThis.setTimeout(callback, ms),
  clear: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

const INITIAL: StartupSnapshot = Object.freeze({
  phase: "initializing",
  progress: 0,
  slow: false,
  failedImages: Object.freeze([]) as readonly string[],
  audioNotice: null,
});

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

export function createStartup(deps: StartupDeps): Startup {
  const timers = deps.timers ?? browserTimers;
  const store = createStore<StartupSnapshot>(INITIAL);

  let begun = false;
  let rendered = false;
  let waitingFrame: (() => void) | null = null;
  let audioDeferred = false;
  let graceTimer: unknown = null;
  let slowTimer: unknown = null;
  let slow = false;
  const cleanups: (() => void)[] = [];

  const safely = (step: () => void) => {
    try {
      step();
    } catch (error) {
      console.error("[ui] startup step failed; loading continues.", error);
    }
  };

  const clearTimers = () => {
    if (graceTimer !== null) timers.clear(graceTimer);
    if (slowTimer !== null) timers.clear(slowTimer);
    graceTimer = null;
    slowTimer = null;
  };

  const stopWatching = () => {
    clearTimers();
    waitingFrame?.();
    waitingFrame = null;
    for (const cleanup of cleanups.splice(0)) safely(cleanup);
  };

  const imageStatuses = () => {
    const keys = deps.images.keys();
    let ready = 0;
    let loading = 0;
    const failed: string[] = [];
    for (const key of keys) {
      const status = deps.images.status(key);
      if (status === "ready") ready++;
      else if (status === "loading") loading++;
      else failed.push(key);
    }
    return { total: keys.length, ready, loading, failed };
  };

  const audioState = (): AudioLoadState => deps.audio.loading.get();

  const audioSettled = (audio: AudioLoadState) =>
    audioDeferred ||
    (audio.started &&
      audio.support !== "pending" &&
      audio.music !== "pending" &&
      audio.fetched + audio.failed >= audio.cues);

  const noticeOf = (audio: AudioLoadState): StartupAudioNotice | null => {
    if (audio.support === "unsupported") return "audio-unsupported";
    if (audio.failed > 0) return "sounds-failed";
    if (audioDeferred && audio.fetched + audio.failed < audio.cues) return "sounds-deferred";
    if (audio.music === "unavailable" || audio.music === "unsupported") return "music-unavailable";
    if (audio.music === "withheld") return "music-withheld";
    return null;
  };

  const compute = () => {
    const current = store.get();
    if (!begun || current.phase === "playing") return;
    const images = imageStatuses();
    const audio = audioState();
    const visualsReady = images.total === images.ready && rendered;

    // The renderer task: one frame drawn once every image is ready.
    if (images.total === images.ready && !rendered && !waitingFrame) {
      waitingFrame = deps.whenFrameRendered(() => {
        waitingFrame = null;
        rendered = true;
        compute();
      });
    }
    // The audio grace starts once the visuals are done.
    if (visualsReady && !audioDeferred && graceTimer === null && !audioSettled(audio)) {
      graceTimer = timers.set(() => {
        graceTimer = null;
        audioDeferred = true;
        compute();
      }, AUDIO_GRACE_MS);
    }

    const w = STARTUP_WEIGHTS;
    const share = (done: number, total: number) => (total <= 0 ? 1 : Math.min(1, done / total));
    const soundsDone =
      audioDeferred || (audio.started && audio.fetched + audio.failed >= audio.cues);
    let sum = w.app;
    sum += w.images * share(images.ready, images.total);
    if (rendered && images.total === images.ready) sum += w.renderer;
    if (audioDeferred || audio.support !== "pending") sum += w.audioSupport;
    sum += soundsDone
      ? w.sounds
      : audio.started
        ? w.sounds * share(audio.fetched + audio.failed, audio.cues)
        : 0;
    if (audioDeferred || audio.music !== "pending") sum += w.music;

    const allDone = visualsReady && audioSettled(audio);
    const failedNow = images.failed.length > 0 && images.loading === 0;
    const phase: StartupPhase = allDone ? "ready" : failedNow ? "failed" : "loading";
    // 100 % only with READY; never move backwards.
    const raw = allDone ? 1 : Math.min(0.99, sum / 100);
    const progress = Math.max(current.progress, raw);
    const failedImages = phase === "failed" ? images.failed : INITIAL.failedImages;
    const audioNotice = noticeOf(audio);

    if (phase === "ready") clearTimers();
    if (
      phase === current.phase &&
      progress === current.progress &&
      slow === current.slow &&
      sameList(failedImages, current.failedImages) &&
      audioNotice === current.audioNotice
    ) {
      return;
    }
    store.set(Object.freeze({ phase, progress, slow, failedImages, audioNotice }));
  };

  return {
    get: store.get,
    subscribe: store.subscribe,
    begin() {
      if (begun) return;
      begun = true;
      // No sound before START GAME: a tap on this screen (or Retry) must not
      // unlock the audio of the round running underneath.
      safely(() => deps.audio.deferGestureUnlock?.());
      safely(() => cleanups.push(deps.images.subscribe(compute)));
      safely(() => cleanups.push(deps.audio.loading.subscribe(compute)));
      safely(() => deps.audio.preload());
      slowTimer = timers.set(() => {
        slowTimer = null;
        const phase = store.get().phase;
        if (phase === "loading" || phase === "failed") {
          slow = true;
          compute();
        }
      }, SLOW_HINT_MS);
      store.set(Object.freeze({ ...INITIAL, phase: "loading" }));
      safely(compute);
    },
    retry() {
      if (store.get().phase !== "failed") return;
      safely(() => {
        for (const key of store.get().failedImages) deps.images.retry(key);
      });
      safely(compute);
    },
    startGame() {
      const current = store.get();
      const allowed =
        current.phase === "ready" ||
        current.phase === "failed" ||
        (current.phase === "loading" && current.slow);
      if (!allowed) return;
      // Inside the press: the audio unlock must run in this user gesture.
      safely(() => deps.audio.unlock());
      stopWatching();
      store.set(Object.freeze({ ...current, phase: "playing" }));
    },
  };
}
