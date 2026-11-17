// Sound settings store tests (Sprint 5 / Phase 7, step A3; docs/08 §11:
// persistence round-trip, corrupt storage, a storage API that throws).
// Node env, no React, no DOM. Storage is an in-memory fake.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_CHANNELS,
  SOUND_SETTINGS_STORAGE_KEY,
  SOUND_SETTINGS_VERSION,
  SOUND_SWITCHES,
  browserStorage,
  clampVolume,
  createSoundSettingsStore,
  isValidVolume,
  parseSoundSettings,
  sameSoundSettings,
  serializeSoundSettings,
  switchShown,
  type SoundSettings,
  type SoundSettingsStorage,
} from "./sound-settings-store";

// ----- fake storage -----

interface FakeStorage extends SoundSettingsStorage {
  data: Map<string, string>;
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
}

function fakeStorage(initial?: Record<string, string>): FakeStorage {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

const withRecord = (record: unknown) =>
  fakeStorage({ [SOUND_SETTINGS_STORAGE_KEY]: JSON.stringify(record) });

const storeOn = (storage: SoundSettingsStorage | null) =>
  createSoundSettingsStore({ storage: () => storage });

const saved = (storage: FakeStorage) => {
  const raw = storage.data.get(SOUND_SETTINGS_STORAGE_KEY);
  return raw === undefined ? undefined : (JSON.parse(raw) as unknown);
};

// LA1: a full version-1 record now carries the two switches.
const v1 = (fields: Partial<Record<keyof SoundSettings | "version", unknown>> = {}) => ({
  version: 1,
  muted: false,
  soundOn: true,
  musicOn: true,
  master: 1,
  music: 1,
  ambience: 1,
  sfx: 1,
  ...fields,
});

// ----- defaults (D1, D3) -----

describe("sound settings — defaults (D1) and channels (D3)", () => {
  it("defaults to sound on with every volume at 1.0", () => {
    expect(DEFAULT_SOUND_SETTINGS).toEqual({
      muted: false,
      soundOn: true,
      musicOn: true,
      master: 1,
      music: 1,
      ambience: 1,
      sfx: 1,
    });
    expect(Object.isFrozen(DEFAULT_SOUND_SETTINGS)).toBe(true);
  });

  it("has exactly the four channels master, music, ambience, sfx", () => {
    expect([...SOUND_CHANNELS]).toEqual(["master", "music", "ambience", "sfx"]);
  });

  it("a new store starts at the defaults", () => {
    expect(storeOn(fakeStorage()).get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("uses a stable storage key and schema version 1", () => {
    expect(SOUND_SETTINGS_STORAGE_KEY).toBe("aquadive.soundSettings");
    expect(SOUND_SETTINGS_VERSION).toBe(1);
  });
});

// ----- pure helpers -----

describe("sound settings — volume helpers (D4)", () => {
  it("isValidVolume accepts only finite numbers in 0..1", () => {
    for (const ok of [0, -0, 0.25, 0.5, 1]) expect(isValidVolume(ok)).toBe(true);
    for (const bad of [
      -0.01,
      1.01,
      Number.NaN,
      Infinity,
      -Infinity,
      "0.5",
      null,
      undefined,
      true,
      {},
    ]) {
      expect(isValidVolume(bad)).toBe(false);
    }
  });

  it("clampVolume clamps finite input, maps -0 to 0, rejects the rest", () => {
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-3)).toBe(0);
    expect(Object.is(clampVolume(-0), 0)).toBe(true);
    expect(clampVolume(Number.NaN)).toBeNull();
    expect(clampVolume(Infinity)).toBeNull();
    expect(clampVolume(-Infinity)).toBeNull();
    expect(clampVolume("1")).toBeNull();
  });

  it("stores linear values as given: no loudness curve", () => {
    const store = storeOn(fakeStorage());
    store.setVolume("music", 0.5);
    expect(store.get().music).toBe(0.5);
  });

  it("sameSoundSettings compares every field", () => {
    expect(sameSoundSettings(DEFAULT_SOUND_SETTINGS, { ...DEFAULT_SOUND_SETTINGS })).toBe(true);
    expect(
      sameSoundSettings(DEFAULT_SOUND_SETTINGS, { ...DEFAULT_SOUND_SETTINGS, muted: true }),
    ).toBe(false);
    for (const channel of SOUND_CHANNELS) {
      expect(
        sameSoundSettings(DEFAULT_SOUND_SETTINGS, { ...DEFAULT_SOUND_SETTINGS, [channel]: 0.5 }),
      ).toBe(false);
    }
  });
});

describe("sound settings — serialize / parse", () => {
  it("serializes a version-1 record with all seven fields", () => {
    const settings: SoundSettings = {
      muted: true,
      soundOn: false,
      musicOn: true,
      master: 0.8,
      music: 0.3,
      ambience: 0.6,
      sfx: 0,
    };
    expect(JSON.parse(serializeSoundSettings(settings))).toEqual({ version: 1, ...settings });
  });

  it("round-trips through parse as valid", () => {
    const settings: SoundSettings = {
      muted: true,
      soundOn: false,
      musicOn: true,
      master: 0.8,
      music: 0.3,
      ambience: 0.6,
      sfx: 0,
    };
    const read = parseSoundSettings(serializeSoundSettings(settings));
    expect(read.status).toBe("valid");
    expect(read.settings).toEqual(settings);
    expect(Object.isFrozen(read.settings)).toBe(true);
  });

  it("null is missing → defaults", () => {
    expect(parseSoundSettings(null)).toEqual({
      status: "missing",
      settings: DEFAULT_SOUND_SETTINGS,
    });
  });

  it.each([
    ["not JSON", "{oops"],
    ["empty string", ""],
    ["JSON null", "null"],
    ["JSON number", "42"],
    ["JSON string", '"muted"'],
    ["JSON boolean", "true"],
    ["JSON array", "[1,2,3]"],
  ])("%s is corrupt → defaults", (_label, raw) => {
    expect(parseSoundSettings(raw)).toEqual({
      status: "corrupt",
      settings: DEFAULT_SOUND_SETTINGS,
    });
  });

  it.each([
    ["missing version", { muted: true, master: 0.2, music: 0.2, ambience: 0.2, sfx: 0.2 }],
    ["version 0", v1({ version: 0, muted: true })],
    ["version 2", v1({ version: 2, muted: true })],
    ["version '1' (string)", v1({ version: "1", muted: true })],
    ["version 1.5", v1({ version: 1.5, muted: true })],
  ])("%s is rejected whole (D5) → defaults", (_label, record) => {
    expect(parseSoundSettings(JSON.stringify(record))).toEqual({
      status: "unsupported-version",
      settings: DEFAULT_SOUND_SETTINGS,
    });
  });

  it("salvages valid fields from a version-1 record with bad fields (D5)", () => {
    const read = parseSoundSettings(
      JSON.stringify({ version: 1, muted: "yes", master: 0.4, music: 7, ambience: null, sfx: 0.2 }),
    );
    expect(read.status).toBe("salvaged");
    expect(read.settings).toEqual({
      muted: false,
      soundOn: true,
      musicOn: true,
      master: 0.4,
      music: 1,
      ambience: 1,
      sfx: 0.2,
    });
    expect(Object.isFrozen(read.settings)).toBe(true);
  });

  it("salvages a version-1 record with missing fields", () => {
    const read = parseSoundSettings(JSON.stringify({ version: 1, muted: true }));
    expect(read.status).toBe("salvaged");
    expect(read.settings).toEqual({ ...DEFAULT_SOUND_SETTINGS, muted: true });
  });

  it.each([
    ["negative", -0.1],
    ["above 1", 1.0001],
    ["a string", "0.5"],
    ["a boolean", false],
  ])("a stored volume that is %s takes its default; it is not clamped", (_label, bad) => {
    const read = parseSoundSettings(JSON.stringify(v1({ sfx: bad, music: 0.5 })));
    expect(read.status).toBe("salvaged");
    expect(read.settings.sfx).toBe(1);
    expect(read.settings.music).toBe(0.5);
  });

  it("a stored muted that is not a boolean takes its default", () => {
    for (const bad of [1, 0, "true", null]) {
      const read = parseSoundSettings(JSON.stringify(v1({ muted: bad, master: 0.3 })));
      expect(read.status).toBe("salvaged");
      expect(read.settings.muted).toBe(false);
      expect(read.settings.master).toBe(0.3);
    }
  });

  it("ignores unknown extra fields in a version-1 record", () => {
    const read = parseSoundSettings(JSON.stringify(v1({ master: 0.7, extra: "x" } as never)));
    expect(read.status).toBe("valid");
    expect(read.settings).toEqual({ ...DEFAULT_SOUND_SETTINGS, master: 0.7 });
    expect(Object.keys(read.settings).sort()).toEqual([
      "ambience",
      "master",
      "music",
      "musicOn",
      "muted",
      "sfx",
      "soundOn",
    ]);
  });

  it("reads the boundary volumes 0 and 1 as valid", () => {
    const read = parseSoundSettings(
      JSON.stringify(v1({ master: 0, music: 1, ambience: 0, sfx: 1 })),
    );
    expect(read.status).toBe("valid");
    expect(read.settings).toEqual({
      ...DEFAULT_SOUND_SETTINGS,
      master: 0,
      music: 1,
      ambience: 0,
      sfx: 1,
    });
  });
});

// ----- the store: construction and SSR safety -----

describe("sound settings store — construction (SSR safety)", () => {
  it("construction touches no storage", () => {
    const resolver = vi.fn(() => fakeStorage());
    createSoundSettingsStore({ storage: resolver });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("the default resolver works without a localStorage global (node, SSR)", () => {
    expect("localStorage" in globalThis).toBe(false);
    expect(browserStorage()).toBeNull();
    const store = createSoundSettingsStore();
    expect(store.restore()).toBe("unavailable");
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
    store.setMuted(true);
    expect(store.get().muted).toBe(true);
  });

  it("exposes the read surface and the writers only, frozen", () => {
    const store = storeOn(fakeStorage());
    expect(Object.keys(store).sort()).toEqual([
      "get",
      "restore",
      "setMuted",
      "setSwitch",
      "setVolume",
      "subscribe",
      "toggleMuted",
      "toggleSwitch",
    ]);
    expect(Object.isFrozen(store)).toBe(true);
    expect("set" in store).toBe(false);
  });

  it("every snapshot is frozen", () => {
    const store = storeOn(fakeStorage());
    store.setVolume("sfx", 0.3);
    expect(Object.isFrozen(store.get())).toBe(true);
  });
});

describe("sound settings store — the global localStorage resolver", () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("reads and writes the global localStorage at call time, not at construction", () => {
    const store = createSoundSettingsStore();
    const storage = withRecord(v1({ master: 0.25 }));
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    expect(store.restore()).toBe("valid");
    expect(store.get().master).toBe(0.25);
    store.setVolume("music", 0.5);
    expect(saved(storage)).toEqual(v1({ master: 0.25, music: 0.5 }));
  });

  it("a localStorage getter that throws (blocked storage) is unavailable, never thrown", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
    const store = createSoundSettingsStore();
    expect(() => store.restore()).not.toThrow();
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(() => store.setMuted(true)).not.toThrow();
    expect(store.get().muted).toBe(true);
  });
});

// ----- restore -----

describe("sound settings store — restore()", () => {
  it("saved preferences override the defaults (D1)", () => {
    const storage = withRecord(
      v1({ muted: true, master: 0.5, music: 0.2, ambience: 0.4, sfx: 0.9 }),
    );
    const store = storeOn(storage);
    expect(store.restore()).toBe("valid");
    expect(store.get()).toEqual({
      ...DEFAULT_SOUND_SETTINGS,
      muted: true,
      master: 0.5,
      music: 0.2,
      ambience: 0.4,
      sfx: 0.9,
    });
  });

  it("reads the record from the storage key once", () => {
    const storage = withRecord(v1({ master: 0.5 }));
    const store = storeOn(storage);
    store.restore();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledWith(SOUND_SETTINGS_STORAGE_KEY);
  });

  it("writes nothing to storage, even for a corrupt or unsupported record", () => {
    for (const raw of [
      "{oops",
      JSON.stringify(v1({ version: 9 })),
      JSON.stringify(v1({ sfx: 5 })),
    ]) {
      const storage = fakeStorage({ [SOUND_SETTINGS_STORAGE_KEY]: raw });
      storeOn(storage).restore();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.data.get(SOUND_SETTINGS_STORAGE_KEY)).toBe(raw);
    }
  });

  it("missing record → defaults, status missing", () => {
    const store = storeOn(fakeStorage());
    expect(store.restore()).toBe("missing");
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("corrupt record → defaults, status corrupt", () => {
    const store = storeOn(fakeStorage({ [SOUND_SETTINGS_STORAGE_KEY]: "not json" }));
    expect(store.restore()).toBe("corrupt");
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("unsupported version → defaults, status unsupported-version (D5)", () => {
    const store = storeOn(withRecord(v1({ version: 2, muted: true, master: 0.1 })));
    expect(store.restore()).toBe("unsupported-version");
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("partially bad version-1 record → its good fields, status salvaged (D5)", () => {
    const store = storeOn(withRecord(v1({ muted: true, master: Number.NaN as never, music: 0.3 })));
    // NaN serializes as null in JSON.
    expect(store.restore()).toBe("salvaged");
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, muted: true, music: 0.3 });
  });

  it("no storage (resolver returns null or undefined) → unavailable", () => {
    expect(storeOn(null).restore()).toBe("unavailable");
    expect(createSoundSettingsStore({ storage: () => undefined }).restore()).toBe("unavailable");
  });

  it("a resolver that throws → unavailable, never thrown", () => {
    const store = createSoundSettingsStore({
      storage: () => {
        throw new Error("blocked");
      },
    });
    expect(store.restore()).toBe("unavailable");
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("a getItem that throws → unavailable, never thrown", () => {
    const storage = fakeStorage();
    storage.getItem.mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const store = storeOn(storage);
    expect(store.restore()).toBe("unavailable");
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("notifies once when the saved record differs from the defaults", () => {
    const store = storeOn(withRecord(v1({ muted: true })));
    const listener = vi.fn();
    store.subscribe(listener);
    store.restore();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify, and keeps the snapshot, when the saved record equals the defaults", () => {
    const store = storeOn(withRecord(v1()));
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.restore()).toBe("valid");
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toBe(before);
  });

  it("runs once: a second call is skipped and reads nothing", () => {
    const storage = withRecord(v1({ master: 0.5 }));
    const store = storeOn(storage);
    store.restore();
    storage.data.set(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify(v1({ master: 0.1 })));
    expect(store.restore()).toBe("skipped");
    expect(store.get().master).toBe(0.5);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it("a user change before restore() wins; restore() is skipped and reads nothing", () => {
    const storage = withRecord(v1({ muted: false, master: 0.2 }));
    const store = storeOn(storage);
    store.setMuted(true);
    expect(store.restore()).toBe("skipped");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, muted: true });
    expect(saved(storage)).toEqual(v1({ muted: true }));
  });

  it("a first change before restore() that equals the current value still saves it", () => {
    const storage = withRecord(v1({ master: 0.2 }));
    const store = storeOn(storage);
    store.setVolume("master", 1);
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(saved(storage)).toEqual(v1());
  });

  it("an ignored (invalid) write before restore() does not block restore()", () => {
    const store = storeOn(withRecord(v1({ master: 0.2 })));
    store.setVolume("master", Number.NaN);
    store.setMuted("yes" as unknown as boolean);
    expect(store.restore()).toBe("valid");
    expect(store.get().master).toBe(0.2);
  });
});

// ----- writers and persistence -----

describe("sound settings store — writers", () => {
  it("setMuted and toggleMuted change only muted", () => {
    const store = storeOn(fakeStorage());
    store.setVolume("music", 0.4);
    store.setMuted(true);
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, music: 0.4, muted: true });
    store.toggleMuted();
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, music: 0.4, muted: false });
    store.toggleMuted();
    expect(store.get().muted).toBe(true);
  });

  it("setVolume changes only its channel, for each of the four channels", () => {
    for (const channel of SOUND_CHANNELS) {
      const store = storeOn(fakeStorage());
      store.setVolume(channel, 0.35);
      expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, [channel]: 0.35 });
    }
  });

  it("setVolume clamps finite values to 0..1 and stores -0 as 0", () => {
    const store = storeOn(fakeStorage());
    store.setVolume("sfx", 4);
    expect(store.get().sfx).toBe(1);
    store.setVolume("sfx", -2);
    expect(store.get().sfx).toBe(0);
    store.setVolume("sfx", 0.5);
    store.setVolume("sfx", -0);
    expect(Object.is(store.get().sfx, 0)).toBe(true);
  });

  it("setVolume ignores non-finite values and unknown channels", () => {
    const storage = fakeStorage();
    const store = storeOn(storage);
    const before = store.get();
    store.setVolume("music", Number.NaN);
    store.setVolume("music", Infinity);
    store.setVolume("music", -Infinity);
    store.setVolume("music", "0.5" as unknown as number);
    store.setVolume("voice" as never, 0.5);
    store.setVolume("muted" as never, 0);
    expect(store.get()).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("setMuted ignores a non-boolean", () => {
    const store = storeOn(fakeStorage());
    store.setMuted(1 as unknown as boolean);
    store.setMuted(undefined as unknown as boolean);
    expect(store.get().muted).toBe(false);
  });

  it("raising a volume does not unmute (D7 deferred to A5)", () => {
    const store = storeOn(fakeStorage());
    store.setMuted(true);
    store.setVolume("master", 0);
    store.setVolume("master", 0.8);
    expect(store.get().muted).toBe(true);
  });

  it("muting keeps every volume", () => {
    const store = storeOn(fakeStorage());
    store.setVolume("ambience", 0.2);
    store.setMuted(true);
    store.setMuted(false);
    expect(store.get().ambience).toBe(0.2);
  });

  it("notifies once per change and not for an equal-value write", () => {
    const store = storeOn(fakeStorage());
    store.restore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setVolume("music", 0.5);
    store.setVolume("music", 0.5);
    store.setMuted(false);
    store.setVolume("sfx", 3);
    store.setVolume("sfx", 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("each change makes a new snapshot; an equal write keeps it", () => {
    const store = storeOn(fakeStorage());
    const a = store.get();
    store.setMuted(true);
    const b = store.get();
    expect(b).not.toBe(a);
    store.setMuted(true);
    expect(store.get()).toBe(b);
  });

  it("unsubscribe stops notifications", () => {
    const store = storeOn(fakeStorage());
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.setMuted(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("sound settings store — persistence", () => {
  it("writes the full version-1 record on every change, at once (no debounce, D6)", () => {
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    store.setVolume("master", 0.6);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(saved(storage)).toEqual(v1({ master: 0.6 }));
    store.setMuted(true);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(saved(storage)).toEqual(v1({ master: 0.6, muted: true }));
  });

  it("does not write for an equal-value change after restore()", () => {
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    store.setMuted(false);
    store.setVolume("sfx", 1);
    store.setVolume("sfx", 7);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("round-trips: a new store restores what the previous one saved", () => {
    const storage = fakeStorage();
    const first = storeOn(storage);
    first.restore();
    first.setMuted(true);
    first.setVolume("master", 0.7);
    first.setVolume("music", 0.25);
    first.setVolume("ambience", 0);
    first.setVolume("sfx", 0.9);

    const second = storeOn(storage);
    expect(second.get()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(second.restore()).toBe("valid");
    expect(second.get()).toEqual(first.get());
  });

  it("a later change overwrites a corrupt or unsupported record with a valid one", () => {
    for (const raw of ["{oops", JSON.stringify(v1({ version: 2 }))]) {
      const storage = fakeStorage({ [SOUND_SETTINGS_STORAGE_KEY]: raw });
      const store = storeOn(storage);
      store.restore();
      store.setVolume("music", 0.5);
      expect(saved(storage)).toEqual(v1({ music: 0.5 }));
    }
  });

  it("a setItem that throws (quota, blocked) keeps the in-memory change and never throws", () => {
    const storage = fakeStorage();
    storage.setItem.mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const store = storeOn(storage);
    store.restore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.setMuted(true)).not.toThrow();
    expect(() => store.setVolume("sfx", 0.1)).not.toThrow();
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, muted: true, sfx: 0.1 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("resolves the storage at each write (storage that appears later is used)", () => {
    let current: FakeStorage | null = null;
    const store = createSoundSettingsStore({ storage: () => current });
    expect(store.restore()).toBe("unavailable");
    store.setMuted(true);
    current = fakeStorage();
    store.setVolume("music", 0.5);
    expect(saved(current)).toEqual(v1({ muted: true, music: 0.5 }));
  });

  it("only ever uses its own storage key", () => {
    const storage = fakeStorage({ other: "keep" });
    const store = storeOn(storage);
    store.restore();
    store.setMuted(true);
    for (const [key] of storage.setItem.mock.calls) expect(key).toBe(SOUND_SETTINGS_STORAGE_KEY);
    expect(storage.data.get("other")).toBe("keep");
  });
});

// ----- subscriber failures (A3.1) -----

describe("sound settings store — a throwing subscriber (A3.1)", () => {
  const boom = () => {
    throw new Error("subscriber failed");
  };

  // Each test installs its own console.error spy; the log is the reported failure.
  const silenceErrors = () => vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setMuted: does not throw, saves the change and notifies the later subscribers", () => {
    const errors = silenceErrors();
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    const after = vi.fn();
    store.subscribe(boom);
    store.subscribe(after);
    expect(() => store.setMuted(true)).not.toThrow();
    expect(store.get().muted).toBe(true);
    expect(saved(storage)).toEqual(v1({ muted: true }));
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it("setVolume: does not throw, saves the change and notifies the later subscribers", () => {
    const errors = silenceErrors();
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    const after = vi.fn();
    store.subscribe(boom);
    store.subscribe(after);
    expect(() => store.setVolume("music", 0.3)).not.toThrow();
    expect(store.get().music).toBe(0.3);
    expect(saved(storage)).toEqual(v1({ music: 0.3 }));
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("toggleMuted: does not throw, saves the change and notifies the later subscribers", () => {
    const errors = silenceErrors();
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    const after = vi.fn();
    store.subscribe(boom);
    store.subscribe(after);
    expect(() => store.toggleMuted()).not.toThrow();
    expect(store.get().muted).toBe(true);
    expect(saved(storage)).toEqual(v1({ muted: true }));
    expect(() => store.toggleMuted()).not.toThrow();
    expect(saved(storage)).toEqual(v1({ muted: false }));
    expect(after).toHaveBeenCalledTimes(2);
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it("a first change before restore() is still saved, and restore() is still skipped", () => {
    silenceErrors();
    const storage = withRecord(v1({ master: 0.2 }));
    const store = storeOn(storage);
    store.subscribe(boom);
    expect(() => store.setVolume("sfx", 0.4)).not.toThrow();
    expect(saved(storage)).toEqual(v1({ sfx: 0.4 }));
    expect(store.restore()).toBe("skipped");
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, sfx: 0.4 });
  });

  it("restore(): does not throw, applies the record once and notifies the later subscribers", () => {
    const errors = silenceErrors();
    const storage = withRecord(v1({ muted: true, ambience: 0.5 }));
    const store = storeOn(storage);
    const after = vi.fn();
    store.subscribe(boom);
    store.subscribe(after);
    let result: unknown;
    expect(() => {
      result = store.restore();
    }).not.toThrow();
    expect(result).toBe("valid");
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, muted: true, ambience: 0.5 });
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(store.restore()).toBe("skipped");
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("never leaves the saved record stale: a new store restores the latest values", () => {
    silenceErrors();
    const storage = fakeStorage();
    const first = storeOn(storage);
    first.restore();
    first.subscribe(boom);
    first.setMuted(true);
    first.setVolume("master", 0.7);
    first.setVolume("music", 0.25);
    first.toggleMuted();
    first.setVolume("sfx", 0);
    expect(saved(storage)).toEqual(v1({ muted: false, master: 0.7, music: 0.25, sfx: 0 }));

    const second = storeOn(storage);
    expect(second.restore()).toBe("valid");
    expect(second.get()).toEqual(first.get());
  });

  it("re-entrant updates still settle on the latest value, saved and seen by everyone", () => {
    silenceErrors();
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    store.subscribe(boom);
    // Muting forces the master volume to 0, from inside the notification.
    store.subscribe(() => {
      if (store.get().muted && store.get().master !== 0) store.setVolume("master", 0);
    });
    const seen: SoundSettings[] = [];
    store.subscribe(() => seen.push(store.get()));
    store.setMuted(true);
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, muted: true, master: 0 });
    expect(saved(storage)).toEqual(v1({ muted: true, master: 0 }));
    expect(seen.at(-1)).toBe(store.get());
  });

  it("valid subscribers are unchanged: synchronous, in order, with the new frozen snapshot", () => {
    const store = storeOn(fakeStorage());
    store.restore();
    const order: string[] = [];
    store.subscribe(() => order.push(`a:${store.get().sfx}`));
    store.subscribe(() => order.push(`b:${store.get().sfx}`));
    store.setVolume("sfx", 0.6);
    expect(order).toEqual(["a:0.6", "b:0.6"]);
    expect(Object.isFrozen(store.get())).toBe(true);
  });

  it("keeps createStore's subscription identity: one entry per function, any unsubscribe removes it", () => {
    const store = storeOn(fakeStorage());
    store.restore();
    const listener = vi.fn();
    const offA = store.subscribe(listener);
    const offB = store.subscribe(listener);
    store.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    offA();
    store.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
    offB();
    const offC = store.subscribe(listener);
    offA(); // a stale unsubscribe still removes the function, as Set.delete would
    store.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    offC();
  });

  it("an unsubscribed throwing subscriber is no longer called or logged", () => {
    const errors = silenceErrors();
    const store = storeOn(fakeStorage());
    store.restore();
    const off = store.subscribe(boom);
    off();
    store.setMuted(true);
    expect(errors).not.toHaveBeenCalled();
  });
});

// ----- LA1: the SOUND and MUSIC switches -----

describe("sound settings — LA1 switches", () => {
  it("both switches default to on and are listed in order", () => {
    expect([...SOUND_SWITCHES]).toEqual(["soundOn", "musicOn"]);
    expect(DEFAULT_SOUND_SETTINGS.soundOn).toBe(true);
    expect(DEFAULT_SOUND_SETTINGS.musicOn).toBe(true);
  });

  it("a version-1 record written before LA1 (no switches) is valid, with both on", () => {
    const pre = { version: 1, muted: false, master: 1, music: 0.4, ambience: 1, sfx: 1 };
    const read = parseSoundSettings(JSON.stringify(pre));
    expect(read.status).toBe("valid");
    expect(read.settings).toEqual({ ...DEFAULT_SOUND_SETTINGS, music: 0.4 });
  });

  it("a switch of the wrong type is a bad field: salvaged, default on, the rest kept", () => {
    const read = parseSoundSettings(
      JSON.stringify(v1({ soundOn: "no", musicOn: false, sfx: 0.2 })),
    );
    expect(read.status).toBe("salvaged");
    expect(read.settings.soundOn).toBe(true);
    expect(read.settings.musicOn).toBe(false);
    expect(read.settings.sfx).toBe(0.2);
  });

  it("sameSoundSettings compares the switches", () => {
    for (const name of SOUND_SWITCHES) {
      expect(
        sameSoundSettings(DEFAULT_SOUND_SETTINGS, { ...DEFAULT_SOUND_SETTINGS, [name]: false }),
      ).toBe(false);
    }
  });

  it("setSwitch changes one switch only, persists it, and never touches mute or volumes", () => {
    const storage = fakeStorage();
    const store = storeOn(storage);
    store.restore();
    store.setVolume("music", 0.3);
    store.setSwitch("musicOn", false);
    expect(store.get()).toEqual({ ...DEFAULT_SOUND_SETTINGS, music: 0.3, musicOn: false });
    expect(saved(storage)).toEqual(v1({ music: 0.3, soundOn: true, musicOn: false }));
    store.setSwitch("soundOn", false);
    expect(store.get()).toMatchObject({ muted: false, soundOn: false, musicOn: false, music: 0.3 });
  });

  it("setSwitch ignores unknown names and non-boolean values", () => {
    const store = storeOn(fakeStorage());
    store.restore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setSwitch("master" as never, false);
    store.setSwitch("soundOn", "off" as never);
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("the four states: toggling each switch independently", () => {
    const store = storeOn(fakeStorage());
    store.restore();
    const state = () => [store.get().soundOn, store.get().musicOn];
    expect(state()).toEqual([true, true]);
    store.toggleSwitch("musicOn");
    expect(state()).toEqual([true, false]);
    store.toggleSwitch("soundOn");
    expect(state()).toEqual([false, false]);
    store.toggleSwitch("musicOn");
    expect(state()).toEqual([false, true]);
    store.toggleSwitch("soundOn");
    expect(state()).toEqual([true, true]);
    expect(store.get().muted).toBe(false);
  });

  it("switchShown: a button shows on only when its switch is on and the master mute is off", () => {
    const on = DEFAULT_SOUND_SETTINGS;
    expect(switchShown(on, "soundOn")).toBe(true);
    expect(switchShown({ ...on, musicOn: false }, "musicOn")).toBe(false);
    expect(switchShown({ ...on, muted: true }, "soundOn")).toBe(false);
    expect(switchShown({ ...on, muted: true }, "musicOn")).toBe(false);
  });

  it("while muted, a press unmutes, turns that switch on and the other off (what you see is what plays)", () => {
    const store = storeOn(fakeStorage());
    store.restore();
    store.setMuted(true);
    store.toggleSwitch("musicOn");
    expect(store.get()).toMatchObject({ muted: false, soundOn: false, musicOn: true });
    expect(switchShown(store.get(), "musicOn")).toBe(true);
    expect(switchShown(store.get(), "soundOn")).toBe(false);
    store.setMuted(true);
    store.toggleSwitch("soundOn");
    expect(store.get()).toMatchObject({ muted: false, soundOn: true, musicOn: false });
  });

  it("the switches persist across a reload (a new store over the same storage)", () => {
    const storage = fakeStorage();
    const first = storeOn(storage);
    first.restore();
    first.toggleSwitch("soundOn");
    const second = storeOn(storage);
    expect(second.restore()).toBe("valid");
    expect(second.get()).toMatchObject({ soundOn: false, musicOn: true });
  });
});
