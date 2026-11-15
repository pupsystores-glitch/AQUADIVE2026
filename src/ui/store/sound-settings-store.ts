// Sound settings store — the user's mute and volume preferences
// (docs/07_UI_ARCHITECTURE.md §9; docs/08_AUDIO_FX_ARCHITECTURE.md §3.2).
// Sprint 5 / Phase 7, step A3 (UI-X1, ratified for A3 on 2026-11-15).
//
// Owner decisions recorded for A3 (docs/08 §1.1):
//
// - D1 (Q3): sound is on by default (`muted: false`) and all four volumes
//   default to 1.0. Saved preferences override the defaults. This store
//   plays nothing: playback stays blocked until the user gesture that the
//   AudioManager requires.
// - D3: four channels — `master`, `music`, `ambience`, `sfx` — matching the
//   AudioManager's buses.
// - D4: volumes are finite, linear values in 0..1. No loudness curve. The
//   designed mix gains are applied separately, in A4.
// - D5: a version-1 record with some bad fields keeps its good fields; each
//   bad field falls back to its default. Any other schema version is
//   rejected whole and the defaults apply.
// - D6: no cross-tab synchronization and no debounce. Each change is
//   written to storage at once.
// - D7 is deferred to A5: raising a volume does not change `muted` here.
//
// Persistence: `localStorage` under SOUND_SETTINGS_STORAGE_KEY. Every
// storage access — resolving `localStorage` itself, which can throw in a
// sandboxed or privacy-restricted page, as well as getItem and setItem — is
// inside try/catch. A failure keeps the in-memory settings working and is
// never thrown to the caller.
//
// Subscriber isolation (A3.1): `subscribe` wraps each listener in its own
// try/catch, as the engine event bus and the SoundBank do. A listener that
// throws is logged with console.error and the rest are still notified, in
// order and synchronously. A failing subscriber therefore never aborts a
// change before it is saved, never leaves later subscribers stale, and never
// makes `restore()` throw. Subscribing the same function twice keeps one
// subscription and any of its unsubscribes removes it, as in `createStore`.
// The shared primitive in `./store` is unchanged; other stores keep its
// behavior.
//
// Lifecycle: construction reads nothing and touches no global, so the
// session can build this store at module scope during SSR. `restore()` reads
// the saved record once, on the client. If the user changes a setting before
// `restore()` runs, that change wins and `restore()` does nothing.
//
// Not wired in A3. The session will push these settings into the
// AudioManager in A4, which must also guarantee and test that they are
// applied before the audio unlock or any playback. Nothing here assumes
// `restore()` runs before the first user gesture.
//
// Import rule (docs/07 §6): this module imports only `./store`. It does not
// import `src/audio`. No React, no DOM.

import { createStore, type ReadableStore } from "./store";

/** The localStorage key for the saved record. */
export const SOUND_SETTINGS_STORAGE_KEY = "aquadive.soundSettings";

/** The schema version this build reads and writes. Any other version is rejected (D5). */
export const SOUND_SETTINGS_VERSION = 1;

/** The four volume channels (D3). They match the AudioManager's buses by name. */
export const SOUND_CHANNELS = ["master", "music", "ambience", "sfx"] as const;

export type SoundChannel = (typeof SOUND_CHANNELS)[number];

export interface SoundSettings {
  readonly muted: boolean;
  /** Linear 0..1 (D4). */
  readonly master: number;
  /** Linear 0..1 (D4). */
  readonly music: number;
  /** Linear 0..1 (D4). */
  readonly ambience: number;
  /** Linear 0..1 (D4). */
  readonly sfx: number;
}

/** The defaults (D1): sound on, every volume at 1.0. */
export const DEFAULT_SOUND_SETTINGS: SoundSettings = Object.freeze({
  muted: false,
  master: 1,
  music: 1,
  ambience: 1,
  sfx: 1,
});

/**
 * What a read of the saved record found.
 *
 * - `missing`: no record.
 * - `valid`: a version-1 record whose every field is valid.
 * - `salvaged`: a version-1 record with at least one bad or missing field;
 *   the good fields are kept and the rest are defaults (D5).
 * - `corrupt`: not JSON, or JSON that is not a plain object.
 * - `unsupported-version`: an object whose `version` is not 1 (D5).
 * - `unavailable`: storage is absent or threw.
 */
export type SoundSettingsReadStatus =
  "missing" | "valid" | "salvaged" | "corrupt" | "unsupported-version" | "unavailable";

export interface SoundSettingsRead {
  readonly status: SoundSettingsReadStatus;
  /** Always a complete, valid, frozen settings object. */
  readonly settings: SoundSettings;
}

/** The part of the Web Storage API this store uses. */
export type SoundSettingsStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Returns the storage to use, or null when there is none. Called at the
 * time of each read or write, never at construction. It may throw; the
 * store catches it.
 */
export type SoundSettingsStorageResolver = () => SoundSettingsStorage | null | undefined;

/** Production resolver: the global `localStorage`, read at call time. */
export const browserStorage: SoundSettingsStorageResolver = () =>
  (globalThis as { localStorage?: SoundSettingsStorage }).localStorage ?? null;

// ----- pure helpers -----

/** True for a finite number in 0..1. The only valid volume (D4). */
export function isValidVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * A volume from user input: clamped to 0..1, with -0 read as 0. Returns
 * null for a non-number or a non-finite number, which the writer ignores.
 */
export function clampVolume(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.min(1, Math.max(0, value));
  return clamped === 0 ? 0 : clamped;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const freezeSettings = (settings: SoundSettings): SoundSettings =>
  Object.freeze({
    muted: settings.muted,
    master: settings.master,
    music: settings.music,
    ambience: settings.ambience,
    sfx: settings.sfx,
  });

/**
 * Read a saved record (the raw `getItem` result). Never throws. A stored
 * volume outside 0..1 is a bad field and takes its default (D5); it is not
 * clamped, because no writer of this store produces one.
 */
export function parseSoundSettings(raw: string | null): SoundSettingsRead {
  if (raw === null) return { status: "missing", settings: DEFAULT_SOUND_SETTINGS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: "corrupt", settings: DEFAULT_SOUND_SETTINGS };
  }
  if (!isPlainObject(data)) return { status: "corrupt", settings: DEFAULT_SOUND_SETTINGS };
  if (data.version !== SOUND_SETTINGS_VERSION) {
    return { status: "unsupported-version", settings: DEFAULT_SOUND_SETTINGS };
  }

  let salvaged = typeof data.muted !== "boolean";
  const muted = typeof data.muted === "boolean" ? data.muted : DEFAULT_SOUND_SETTINGS.muted;
  const volume = (channel: SoundChannel): number => {
    const value = data[channel];
    if (isValidVolume(value)) return value === 0 ? 0 : value;
    salvaged = true;
    return DEFAULT_SOUND_SETTINGS[channel];
  };
  const settings = freezeSettings({
    muted,
    master: volume("master"),
    music: volume("music"),
    ambience: volume("ambience"),
    sfx: volume("sfx"),
  });
  return { status: salvaged ? "salvaged" : "valid", settings };
}

/** The saved record for `settings`, as written to storage. */
export function serializeSoundSettings(settings: SoundSettings): string {
  return JSON.stringify({
    version: SOUND_SETTINGS_VERSION,
    muted: settings.muted,
    master: settings.master,
    music: settings.music,
    ambience: settings.ambience,
    sfx: settings.sfx,
  });
}

/** True when both hold the same values. */
export function sameSoundSettings(a: SoundSettings, b: SoundSettings): boolean {
  return (
    a.muted === b.muted &&
    a.master === b.master &&
    a.music === b.music &&
    a.ambience === b.ambience &&
    a.sfx === b.sfx
  );
}

// ----- the store -----

/**
 * What `restore()` did: the read status when it applied the saved record,
 * or `skipped` when it had already run or the user had already changed a
 * setting.
 */
export type SoundSettingsRestoreResult = SoundSettingsReadStatus | "skipped";

export interface SoundSettingsStore extends ReadableStore<SoundSettings> {
  /**
   * Read the saved record and apply it, once. Call on the client. Notifies
   * only if the settings change. Never throws, even when a subscriber does.
   */
  restore(): SoundSettingsRestoreResult;
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  /**
   * Set one channel's volume. A finite value is clamped to 0..1; a
   * non-finite value is ignored. Does not change `muted` (D7 deferred).
   */
  setVolume(channel: SoundChannel, value: number): void;
}

export interface SoundSettingsOptions {
  /** Where to read and write. Default: the global `localStorage`, resolved at call time. */
  storage?: SoundSettingsStorageResolver;
}

/** Create the sound settings store. Reads and writes nothing until used. */
export function createSoundSettingsStore(options: SoundSettingsOptions = {}): SoundSettingsStore {
  const resolveStorage = options.storage ?? browserStorage;
  const store = createStore<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  // Set by the first restore() and by the first user change.
  let settled = false;

  const read = (): SoundSettingsRead => {
    try {
      const storage = resolveStorage();
      if (!storage) return { status: "unavailable", settings: DEFAULT_SOUND_SETTINGS };
      return parseSoundSettings(storage.getItem(SOUND_SETTINGS_STORAGE_KEY));
    } catch {
      return { status: "unavailable", settings: DEFAULT_SOUND_SETTINGS };
    }
  };

  // One guarded wrapper per subscribed function, with the unsubscribe of its
  // underlying subscription. Keyed by the caller's function so duplicate
  // subscribes and unsubscribes behave as `createStore`'s Set does.
  const subscriptions = new Map<() => void, () => void>();

  const subscribe = (listener: () => void): (() => void) => {
    if (!subscriptions.has(listener)) {
      const guarded = () => {
        try {
          listener();
        } catch (error) {
          console.error("[ui] a sound settings subscriber failed:", error);
        }
      };
      subscriptions.set(listener, store.subscribe(guarded));
    }
    return () => {
      const unsubscribe = subscriptions.get(listener);
      if (!unsubscribe) return;
      subscriptions.delete(listener);
      unsubscribe();
    };
  };

  const write = (settings: SoundSettings) => {
    try {
      resolveStorage()?.setItem(SOUND_SETTINGS_STORAGE_KEY, serializeSoundSettings(settings));
    } catch {
      // Storage is full, blocked or gone. The in-memory settings still apply.
    }
  };

  /** Replace the snapshot if the values differ. Returns whether they did. */
  const apply = (next: SoundSettings): boolean => {
    if (sameSoundSettings(next, store.get())) return false;
    store.set(freezeSettings(next));
    return true;
  };

  // A user change. The first one before restore() also writes when nothing
  // changed, so the saved record matches what the user sees and a later
  // page load does not bring back an older record.
  const change = (patch: Partial<SoundSettings>) => {
    const first = !settled;
    settled = true;
    const changed = apply({ ...store.get(), ...patch });
    if (changed || first) write(store.get());
  };

  return Object.freeze({
    get: store.get,
    subscribe,
    restore: (): SoundSettingsRestoreResult => {
      if (settled) return "skipped";
      settled = true;
      const result = read();
      apply(result.settings);
      return result.status;
    },
    setMuted: (muted: boolean) => {
      if (typeof muted !== "boolean") return;
      change({ muted });
    },
    toggleMuted: () => change({ muted: !store.get().muted }),
    setVolume: (channel: SoundChannel, value: number) => {
      if (!SOUND_CHANNELS.includes(channel)) return;
      const volume = clampVolume(value);
      if (volume === null) return;
      change({ [channel]: volume });
    },
  });
}
