// Audio host LA1 tests: the SOUND and MUSIC switches, the iOS "ambient"
// audio session, the startup loading state and the explicit unlock.
// Node env.
//
// The real AudioManager, SoundBank and AudioDirector run over the fakes
// (FakeAudioContext, FakeMediaElement, FakeFetch); the settings store is the
// real one over in-memory storage.
//
// Simulated: no real browser, no real audio and no physical device. The iOS
// tests prove which audio-session value the host sets and when it makes a
// player; what an iPhone then plays with the ringer on or in Silent Mode can
// only be observed on the device.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { STREAM_HOLD_FADE_S, createAudioManager } from "@/audio/audio-manager";
import {
  SOUND_MANIFEST,
  type CueDefinition,
  type CueId,
  type SoundManifest,
} from "@/audio/manifest";
import { MUSIC_MAIN } from "@/audio/music";
import { FakeAudioContext } from "@/audio/test/fake-audio-context";
import { FakeFetch } from "@/audio/test/fake-fetch";
import { FakeMediaElement, fakeMediaElements } from "@/audio/test/fake-media-element";
import { EventBus, type EngineEventMap } from "@/engine";
import {
  AUDIO_MIX,
  browserAudioSupport,
  browserMusicElement,
  busLevel,
  createAudioHost,
  managerMuted,
  prepareAmbientAudioSession,
  type AudioEventTarget,
  type AudioFrameInput,
  type AudioHostOptions,
} from "@/ui/audio-host";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_SETTINGS_STORAGE_KEY,
  createSoundSettingsStore,
  type SoundSettingsStorage,
} from "@/ui/store/sound-settings-store";

class FakeTarget implements AudioEventTarget {
  readonly listeners = new Map<string, Set<() => void>>();
  visibilityState = "visible";

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

const manifestWith = (asset: (id: CueId) => CueDefinition["asset"]): SoundManifest<CueId> => {
  const manifest = {} as Record<CueId, CueDefinition>;
  for (const [id, definition] of Object.entries(SOUND_MANIFEST) as [CueId, CueDefinition][]) {
    manifest[id] = { ...definition, asset: asset(id) };
  }
  return manifest;
};

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const DT = 0.01;
/** The cues the host loads: every manifest cue but the rattle, the two creaks and (BET-1x2) bet-clink-2. */
const LOADED = Object.keys(SOUND_MANIFEST).length - 4;

function setup(
  extra: Partial<AudioHostOptions> = {},
  options: { assets?: boolean; saved?: object } = {},
) {
  const events = new EventBus<EngineEventMap>();
  const data = new Map<string, string>();
  if (options.saved) data.set(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify(options.saved));
  const storage: SoundSettingsStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  const store = createSoundSettingsStore({ storage: () => storage });
  const contexts: FakeAudioContext[] = [];
  const media = fakeMediaElements();
  const fetch = new FakeFetch();
  const win = new FakeTarget();
  const doc = new FakeTarget();
  const probes: string[] = [];
  const host = createAudioHost({
    events,
    settings: store,
    createContext: () => {
      const context = new FakeAudioContext();
      contexts.push(context);
      return context;
    },
    createMediaElement: media.create,
    fetch: fetch.fetch,
    manifest: manifestWith((id) => (options.assets ? { url: `test://${id}` } : null)),
    environment: () => ({ window: win, document: doc }),
    prepareAudioSession: () => "not-needed",
    audioSupport: () => ({ webAudio: true, mp3: true, aac: true }),
    probeMusic: (url) => {
      probes.push(url);
      return Promise.resolve(true);
    },
    ...extra,
  });
  const frames = (seconds: number) => {
    const count = Math.max(1, Math.round(seconds / DT));
    for (let i = 0; i < count; i++) {
      host.update({
        render: { depthRatio: 0 },
        time: { frameDt: DT },
        state: { phase: "idle", multiplier: 1, boost: 0 },
      } satisfies AudioFrameInput);
    }
  };
  const gesture = async () => {
    win.dispatch("pointerdown");
    await flush();
  };
  const start = async () => {
    const detach = host.attach();
    frames(DT);
    await gesture();
    return detach;
  };
  const buses = () => {
    const [master, music, ambience, sfx] = contexts[0].gains;
    return {
      master: master.gain.value,
      music: music.gain.value,
      ambience: ambience.gain.value,
      sfx: sfx.gain.value,
    };
  };
  /** Lets a held stream finish its fade and pause. */
  const settleHold = () => {
    contexts[0].advance(STREAM_HOLD_FADE_S * 2);
    for (const element of media.elements) element.tick();
  };
  return {
    host,
    events,
    store,
    data,
    contexts,
    media,
    fetch,
    win,
    probes,
    frames,
    gesture,
    start,
    buses,
    settleHold,
  };
}

let errors: MockInstance<Console["error"]>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ----- the four states -----

describe("LA1 switches — the four SOUND × MUSIC states", () => {
  it("pure mapping: busLevel and managerMuted", () => {
    const s = DEFAULT_SOUND_SETTINGS;
    expect(busLevel("music", s)).toBe(AUDIO_MIX.music);
    expect(busLevel("sfx", { ...s, soundOn: false })).toBe(0);
    expect(busLevel("ambience", { ...s, soundOn: false })).toBe(0);
    expect(busLevel("music", { ...s, soundOn: false })).toBe(AUDIO_MIX.music);
    expect(busLevel("music", { ...s, musicOn: false })).toBe(0);
    expect(busLevel("sfx", { ...s, musicOn: false })).toBe(AUDIO_MIX.sfx);
    expect(busLevel("master", { ...s, soundOn: false, musicOn: false })).toBe(1);
    expect(managerMuted(s)).toBe(false);
    expect(managerMuted({ ...s, soundOn: false })).toBe(false);
    expect(managerMuted({ ...s, musicOn: false })).toBe(false);
    expect(managerMuted({ ...s, soundOn: false, musicOn: false })).toBe(true);
    expect(managerMuted({ ...s, muted: true })).toBe(true);
  });

  it("SOUND ON / MUSIC ON: the provisional mix 0.5 / 0.2 / 0.7, the soundtrack plays", async () => {
    const t = setup();
    await t.start();
    expect(t.buses()).toEqual({ master: 1, music: 0.5, ambience: 0.2, sfx: 0.7 });
    expect(t.media.elements).toHaveLength(1);
    expect(t.media.elements[0].paused).toBe(false);
    expect(t.contexts[0].state).toBe("running");
  });

  it("SOUND ON / MUSIC OFF: effects and ambience only; the soundtrack pauses, keeping its place", async () => {
    const t = setup();
    await t.start();
    t.store.toggleSwitch("musicOn");
    t.settleHold();
    expect(t.buses()).toEqual({ master: 1, music: 0, ambience: 0.2, sfx: 0.7 });
    const element = t.media.elements[0];
    expect(element.paused).toBe(true);
    t.frames(1);
    expect(element.paused).toBe(true); // frames do not play it on
    expect(element.loadCalls).toBe(0);
    expect(t.contexts[0].state).toBe("running");
  });

  it("SOUND OFF / MUSIC ON: the soundtrack only", async () => {
    const t = setup();
    await t.start();
    t.store.toggleSwitch("soundOn");
    expect(t.buses()).toEqual({ master: 1, music: 0.5, ambience: 0, sfx: 0 });
    expect(t.media.elements[0].paused).toBe(false);
    expect(t.contexts[0].state).toBe("running");
  });

  it("SOUND OFF / MUSIC OFF: silent; the context suspends and the soundtrack pauses", async () => {
    const t = setup();
    await t.start();
    t.store.toggleSwitch("soundOn");
    t.store.toggleSwitch("musicOn");
    expect(t.buses()).toEqual({ master: 0, music: 0, ambience: 0, sfx: 0 });
    expect(t.contexts[0].state).toBe("suspended");
    expect(t.media.elements[0].paused).toBe(true);
    // The store's own master mute is untouched.
    expect(t.store.get().muted).toBe(false);
  });

  it("back to ON / ON from silence: the same player plays on, no second player or source", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    t.store.toggleSwitch("soundOn");
    t.store.toggleSwitch("musicOn");
    t.store.toggleSwitch("musicOn");
    t.store.toggleSwitch("soundOn");
    expect(t.buses()).toEqual({ master: 1, music: 0.5, ambience: 0.2, sfx: 0.7 });
    expect(t.contexts[0].state).toBe("running");
    expect(element.paused).toBe(false);
    expect(t.media.elements).toHaveLength(1);
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].mediaSources).toHaveLength(1);
  });

  it("the switches keep the user's volumes: they apply again when a switch comes back on", async () => {
    const t = setup();
    await t.start();
    t.store.setVolume("music", 0.4);
    t.store.setVolume("sfx", 0.5);
    t.store.toggleSwitch("musicOn");
    t.store.toggleSwitch("soundOn");
    t.store.toggleSwitch("musicOn");
    t.store.toggleSwitch("soundOn");
    expect(t.buses().music).toBeCloseTo(0.2);
    expect(t.buses().sfx).toBeCloseTo(0.35);
    expect(t.store.get()).toMatchObject({ music: 0.4, sfx: 0.5, ambience: 1, master: 1 });
  });

  it("MUSIC never moves the effects or ambience buses, and SOUND never moves the music bus", async () => {
    const t = setup();
    await t.start();
    for (let i = 0; i < 4; i++) {
      t.store.toggleSwitch("musicOn");
      expect(t.buses().sfx).toBeCloseTo(0.7);
      expect(t.buses().ambience).toBeCloseTo(0.2);
    }
    for (let i = 0; i < 4; i++) {
      t.store.toggleSwitch("soundOn");
      expect(t.buses().music).toBeCloseTo(0.5);
    }
  });

  it("a master mute silences everything whatever the switches say", async () => {
    const t = setup();
    await t.start();
    t.store.setMuted(true);
    expect(t.buses().master).toBe(0);
    expect(t.media.elements[0].paused).toBe(true);
  });
});

describe("LA1 switches — the soundtrack's lifecycle", () => {
  it("MUSIC saved OFF: no player and no download until it is turned on, then exactly one", async () => {
    const t = setup(
      {},
      {
        saved: {
          version: 1,
          muted: false,
          soundOn: true,
          musicOn: false,
          master: 1,
          music: 1,
          ambience: 1,
          sfx: 1,
        },
      },
    );
    await t.start();
    t.frames(1);
    await t.gesture();
    expect(t.media.elements).toHaveLength(0);
    expect(t.buses().music).toBe(0);
    t.store.toggleSwitch("musicOn"); // the press: the element plays inside it
    expect(t.media.elements).toHaveLength(1);
    expect(t.media.elements[0].src).toBe(MUSIC_MAIN.url);
    expect(t.media.elements[0].paused).toBe(false);
    expect(t.buses().music).toBeCloseTo(0.5);
  });

  it("many OFF/ON presses keep one player that is never reloaded or restarted", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    for (let i = 0; i < 10; i++) {
      t.store.toggleSwitch("musicOn");
      t.settleHold();
      t.store.toggleSwitch("musicOn");
      t.frames(0.1);
    }
    expect(t.media.elements).toHaveLength(1);
    expect(t.contexts[0].mediaSources).toHaveLength(1);
    expect(element.loadCalls).toBe(0);
    expect(element.paused).toBe(false);
  });

  it("rounds never restart it after a toggle", async () => {
    const t = setup();
    await t.start();
    t.store.toggleSwitch("musicOn");
    t.store.toggleSwitch("musicOn");
    const element = t.media.elements[0];
    const plays = element.playCalls;
    for (let round = 1; round <= 3; round++) {
      t.events.emit("betPlaced", { roundId: round, slot: 0, amount: 10 });
      t.events.emit("diveStarted", { roundId: round });
      t.events.emit("crashed", { roundId: round, multiplier: 2 });
      t.events.dispatchQueued();
      t.frames(0.5);
    }
    expect(element.playCalls).toBe(plays);
    expect(t.media.elements).toHaveLength(1);
  });

  it("MUSIC OFF survives a detach and remount: the remount does not play it", async () => {
    const t = setup();
    const detach = await t.start();
    t.store.toggleSwitch("musicOn");
    t.settleHold();
    detach();
    t.host.attach();
    t.frames(0.5);
    expect(t.media.elements[0].paused).toBe(true);
    t.store.toggleSwitch("musicOn");
    expect(t.media.elements[0].paused).toBe(false);
  });

  it("the switches persist: a new host over the same storage restores them before the unlock", async () => {
    const first = setup();
    await first.start();
    first.store.toggleSwitch("soundOn");
    const saved = JSON.parse(first.data.get(SOUND_SETTINGS_STORAGE_KEY)!);
    expect(saved).toMatchObject({ version: 1, soundOn: false, musicOn: true });
    const second = setup({}, { saved });
    await second.start();
    expect(second.buses()).toEqual({ master: 1, music: 0.5, ambience: 0, sfx: 0 });
  });
});

// ----- iOS: the ambient audio session -----

describe("LA1 iOS — the documented Audio Session API keeps Q15 with music on", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const CHROME_WIN =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";

  it("prepareAmbientAudioSession: iOS with the API → ambient; without → unavailable; elsewhere → untouched", () => {
    const session = { type: "auto" };
    expect(prepareAmbientAudioSession({ userAgent: IPHONE, audioSession: session })).toBe(
      "ambient",
    );
    expect(session.type).toBe("ambient");
    expect(prepareAmbientAudioSession({ userAgent: IPHONE, audioSession: session })).toBe(
      "ambient",
    );
    expect(prepareAmbientAudioSession({ userAgent: IPHONE })).toBe("unavailable");
    expect(prepareAmbientAudioSession({ userAgent: IPHONE, audioSession: null })).toBe(
      "unavailable",
    );
    const other = { type: "auto" };
    expect(prepareAmbientAudioSession({ userAgent: CHROME_WIN, audioSession: other })).toBe(
      "not-needed",
    );
    expect(other.type).toBe("auto");
    expect(prepareAmbientAudioSession(null)).toBe("not-needed");
  });

  it("a session that refuses the value, or throws, is unavailable and never throws", () => {
    const stuck = {
      get type() {
        return "auto";
      },
      set type(_value: string) {
        // ignores the write
      },
    };
    expect(prepareAmbientAudioSession({ userAgent: IPHONE, audioSession: stuck })).toBe(
      "unavailable",
    );
    const hostile = {
      get type(): string {
        throw new Error("no");
      },
    };
    expect(prepareAmbientAudioSession({ userAgent: IPHONE, audioSession: hostile })).toBe(
      "unavailable",
    );
  });

  it("browserMusicElement on an iPhone with the API: sets ambient, then makes the player", () => {
    const session = { type: "auto" };
    vi.stubGlobal("navigator", {
      userAgent: IPHONE,
      platform: "iPhone",
      maxTouchPoints: 5,
      audioSession: session,
    });
    vi.stubGlobal("Audio", FakeMediaElement);
    const element = browserMusicElement();
    expect(element).toBeInstanceOf(FakeMediaElement);
    expect(session.type).toBe("ambient");
  });

  it("browserMusicElement on an iPhone without the API (iOS < 16.4): no player, as before LA1", () => {
    vi.stubGlobal("navigator", { userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 });
    vi.stubGlobal("Audio", FakeMediaElement);
    expect(browserMusicElement()).toBeNull();
  });

  it("the host sets ambient at attach, before the first gesture creates the context", async () => {
    const session = { type: "auto" };
    vi.stubGlobal("navigator", {
      userAgent: IPHONE,
      platform: "iPhone",
      maxTouchPoints: 5,
      audioSession: session,
    });
    vi.stubGlobal("Audio", FakeMediaElement);
    const seen: string[] = [];
    const t = setup({
      prepareAudioSession: undefined,
      createMediaElement: undefined,
      createContext: () => {
        seen.push(`context with session ${session.type}`);
        const context = new FakeAudioContext();
        t.contexts.push(context);
        return context;
      },
    });
    t.host.attach();
    expect(session.type).toBe("ambient");
    t.frames(DT);
    await t.gesture();
    expect(seen).toEqual(["context with session ambient"]);
    // One context, one player, playing; effects run through the same context.
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].mediaSources).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('on iOS it is never set to anything but ambient (never "playback")', async () => {
    const writes: string[] = [];
    let type = "auto";
    const session = {
      get type() {
        return type;
      },
      set type(value: string) {
        writes.push(value);
        type = value;
      },
    };
    vi.stubGlobal("navigator", {
      userAgent: IPHONE,
      platform: "iPhone",
      maxTouchPoints: 5,
      audioSession: session,
    });
    vi.stubGlobal("Audio", FakeMediaElement);
    const t = setup({ prepareAudioSession: undefined, createMediaElement: undefined });
    await t.start();
    t.store.toggleSwitch("musicOn");
    t.store.toggleSwitch("musicOn");
    t.host.dispose();
    expect(writes).toEqual(["ambient"]);
  });
});

// ----- the startup loading state and the explicit unlock -----

describe("LA1 loading — what the startup screen reads", () => {
  it("before preload: nothing started, nothing checked", () => {
    const t = setup({}, { assets: true });
    expect(t.host.loading.get()).toEqual({
      started: false,
      cues: 0,
      fetched: 0,
      failed: 0,
      music: "pending",
      support: "pending",
    });
    expect(t.fetch.requests).toHaveLength(0);
  });

  it("preload starts one request per enabled cue, counts arrived bytes, probes the soundtrack once", async () => {
    const t = setup({}, { assets: true });
    t.host.preload();
    t.host.preload();
    await flush();
    expect(t.fetch.requests).toHaveLength(LOADED);
    expect(t.probes).toEqual([MUSIC_MAIN.url]);
    expect(t.host.loading.get()).toMatchObject({
      started: true,
      cues: LOADED,
      fetched: 0,
      music: "available",
      support: "supported",
    });
    t.fetch.requests[0].ok();
    t.fetch.requests[1].status(404);
    t.fetch.requests[2].networkError();
    await flush();
    expect(t.host.loading.get()).toMatchObject({ fetched: 1, failed: 2 });
    // Attaching later starts no second download.
    t.host.attach();
    await flush();
    expect(t.fetch.requests).toHaveLength(LOADED);
    // No context, no player, no soundtrack request before the gesture.
    expect(t.contexts).toHaveLength(0);
    expect(t.media.elements).toHaveLength(0);
    expect(t.fetch.requests.map((r) => r.url)).not.toContain(MUSIC_MAIN.url);
  });

  it("a missing soundtrack is reported, and the game's audio carries on", async () => {
    const t = setup({ probeMusic: () => Promise.resolve(false) }, { assets: true });
    t.host.preload();
    await flush();
    expect(t.host.loading.get().music).toBe("unavailable");
  });

  it("no Web Audio: unsupported; no MP3: the soundtrack is unsupported", async () => {
    const a = setup({ audioSupport: () => ({ webAudio: false, mp3: true, aac: true }) });
    a.host.preload();
    expect(a.host.loading.get()).toMatchObject({ support: "unsupported", music: "unsupported" });
    const b = setup({ audioSupport: () => ({ webAudio: true, mp3: false, aac: true }) });
    b.host.preload();
    expect(b.host.loading.get()).toMatchObject({ support: "supported", music: "unsupported" });
  });

  it("iOS without the API: the soundtrack is reported as withheld (Q15)", () => {
    const t = setup({ prepareAudioSession: () => "unavailable" });
    t.host.preload();
    expect(t.host.loading.get().music).toBe("withheld");
  });

  it("browserAudioSupport reads constructors and canPlayType without making a context", () => {
    expect(browserAudioSupport()).toBeNull(); // node: no document
    let constructed = 0;
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          constructed++;
        }
      },
    );
    vi.stubGlobal("document", {
      createElement: () => ({
        canPlayType: (type: string) => (type === "audio/mpeg" ? "maybe" : ""),
      }),
    });
    expect(browserAudioSupport()).toEqual({ webAudio: true, mp3: true, aac: false });
    expect(constructed).toBe(0);
  });

  it("unlock() is the gesture path: settings first, then one context", async () => {
    const t = setup(
      {},
      {
        saved: {
          version: 1,
          muted: false,
          soundOn: false,
          musicOn: true,
          master: 1,
          music: 1,
          ambience: 1,
          sfx: 1,
        },
      },
    );
    t.host.attach();
    t.frames(DT);
    t.host.unlock();
    await flush();
    expect(t.contexts).toHaveLength(1);
    expect(t.buses()).toEqual({ master: 1, music: 0.5, ambience: 0, sfx: 0 });
    t.host.unlock();
    await flush();
    expect(t.contexts).toHaveLength(1);
    expect(t.media.elements).toHaveLength(1);
  });

  it("after dispose, preload and unlock do nothing", async () => {
    const t = setup({}, { assets: true });
    t.host.dispose();
    t.host.preload();
    t.host.unlock();
    await flush();
    expect(t.fetch.requests).toHaveLength(0);
    expect(t.contexts).toHaveLength(0);
  });
});

describe("LA1 — no sound before START GAME", () => {
  it("while deferred, page-wide gestures unlock nothing; unlock() does, and re-arms them", async () => {
    const t = setup();
    t.host.deferGestureUnlock();
    t.host.attach();
    t.frames(DT);
    await t.gesture(); // a tap on the loading screen, or on Retry
    t.win.dispatch("touchend");
    t.win.dispatch("keydown");
    await flush();
    expect(t.contexts).toHaveLength(0);
    expect(t.media.elements).toHaveLength(0);
    t.host.unlock(); // START GAME
    await flush();
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].state).toBe("running");
    expect(t.media.elements[0].paused).toBe(false);
    // Later gestures re-unlock after an interruption, as before LA1.
    t.contexts[0].interrupt();
    await t.gesture();
    expect(t.contexts[0].state).toBe("running");
    expect(t.contexts).toHaveLength(1);
  });

  it("without deferGestureUnlock (no startup screen) the first gesture unlocks, as before", async () => {
    const t = setup();
    await t.start();
    expect(t.contexts).toHaveLength(1);
  });
});

describe("BET-1x2 — bet sounds through the real host", () => {
  /** The real manager, with its play() calls recorded. */
  const recording = () => {
    const plays: string[] = [];
    const createManager: AudioHostOptions["createManager"] = (options) => {
      const real = createAudioManager(options);
      const play: typeof real.play = (cue, opts) => {
        plays.push(cue);
        real.play(cue, opts);
      };
      // Every other member is the real manager's, bound to it.
      return new Proxy(real, {
        get: (target, key) => {
          if (key === "play") return play;
          const value = Reflect.get(target, key, target) as unknown;
          return typeof value === "function" ? (value as () => unknown).bind(target) : value;
        },
      });
    };
    return { plays, createManager };
  };
  const bet = (t: ReturnType<typeof setup>, slot: 0 | 1) => {
    t.events.emit("betPlaced", { roundId: 1, slot, amount: 10 });
    t.events.dispatchQueued();
    t.frames(DT);
  };

  it("never fetches bet-clink-2; fetches bet-clink-1 once", async () => {
    const t = setup({}, { assets: true });
    t.host.preload();
    await flush();
    const urls = t.fetch.requests.map((r) => r.url);
    expect(urls).not.toContain("test://bet-clink-2");
    expect(urls.filter((u) => u === "test://bet-clink-1")).toHaveLength(1);
  });

  it("BET 1 and BET 2 both request bet-clink-1, one play each", async () => {
    const r = recording();
    const t = setup({ createManager: r.createManager });
    await t.start();
    bet(t, 0);
    bet(t, 1);
    expect(r.plays).toEqual(["bet-clink-1", "bet-clink-1"]);
  });

  it("SOUND OFF silences both bet sounds (sfx bus 0); MUSIC OFF leaves them as they are", async () => {
    const r = recording();
    const t = setup({ createManager: r.createManager });
    await t.start();
    t.store.toggleSwitch("musicOn"); // MUSIC OFF
    bet(t, 0);
    bet(t, 1);
    expect(t.buses().sfx).toBeCloseTo(0.7);
    expect(r.plays).toEqual(["bet-clink-1", "bet-clink-1"]);
    t.store.toggleSwitch("musicOn"); // MUSIC ON
    expect(t.buses().sfx).toBeCloseTo(0.7);
    t.store.toggleSwitch("soundOn"); // SOUND OFF
    bet(t, 0);
    bet(t, 1);
    expect(t.buses().sfx).toBe(0);
    expect(t.buses().music).toBeCloseTo(0.5);
  });
});
