// Audio host music tests (M-OWN; docs/08 §7.6). Node env.
//
// The real AudioManager, SoundBank and AudioDirector run over the fakes
// (FakeAudioContext, FakeMediaElement, FakeFetch). The browser is a recording
// fake environment, the engine bus is the real EventBus and the settings
// store is the real one over in-memory storage.
//
// Simulated: no real browser, no real audio and no physical device. The iOS
// tests prove only that the host withholds the media element there; the
// silent-switch behaviour itself can be observed only on a real iPhone.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { STREAM_HOLD_FADE_S } from "@/audio/audio-manager";
import { DISABLED_BY_DEFAULT, MUSIC_DUCK } from "@/audio/director";
import {
  SOUND_MANIFEST,
  type CueDefinition,
  type CueId,
  type SoundManifest,
} from "@/audio/manifest";
import { MUSIC_MAIN } from "@/audio/music";
import { FakeAudioContext, type FakeGainNode } from "@/audio/test/fake-audio-context";
import { FakeFetch } from "@/audio/test/fake-fetch";
import { fakeMediaElements } from "@/audio/test/fake-media-element";
import { EventBus, type EngineEventMap } from "@/engine";
import {
  AUDIO_MIX,
  browserMusicElement,
  createAudioHost,
  isSilentSwitchPlatform,
  type AudioEventTarget,
  type AudioFrameInput,
  type AudioHostOptions,
} from "@/ui/audio-host";
import {
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

  count(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
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

function setup(extra: Partial<AudioHostOptions> = {}, assets = false) {
  const events = new EventBus<EngineEventMap>();
  const data = new Map<string, string>();
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
    manifest: manifestWith((id) => (assets ? { url: `test://${id}` } : null)),
    environment: () => ({ window: win, document: doc }),
    ...extra,
  });
  const frames = (seconds: number, state: Partial<AudioFrameInput["state"]> = {}) => {
    const count = Math.max(1, Math.round(seconds / DT));
    for (let i = 0; i < count; i++) {
      host.update({
        render: { depthRatio: 0 },
        time: { frameDt: DT },
        state: { phase: "idle", multiplier: 1, boost: 0, ...state },
      });
    }
  };
  const emit = <K extends keyof EngineEventMap>(name: K, payload: EngineEventMap[K]) => {
    events.emit(name, payload);
    events.dispatchQueued();
  };
  const gesture = async (type = "pointerdown") => {
    win.dispatch(type);
    await flush();
  };
  /** Attach, render one frame, unlock with a gesture. */
  const start = async () => {
    const detach = host.attach();
    frames(DT);
    await gesture();
    return detach;
  };
  const buses = () => {
    const [master, music, ambience, sfx] = contexts[0].gains;
    return { master, music, ambience, sfx };
  };
  const streamGain = () => contexts[0].mediaSources[0].connections[0] as FakeGainNode;
  return {
    host,
    events,
    store,
    contexts,
    media,
    fetch,
    win,
    doc,
    frames,
    emit,
    gesture,
    start,
    buses,
    streamGain,
  };
}

let errors: MockInstance<Console["error"]>;
let warns: MockInstance<Console["warn"]>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  warns = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("audio host music — lazy creation and the user gesture", () => {
  it("construction and attach create no element, no context and no music request", async () => {
    const t = setup({}, true);
    expect(t.media.elements).toHaveLength(0);
    t.host.attach();
    t.frames(1);
    await flush();
    expect(t.media.elements).toHaveLength(0);
    expect(t.contexts).toHaveLength(0);
    // The sound bank never fetches the soundtrack: it is streamed, not decoded.
    expect(t.fetch.requests.map((r) => r.url)).not.toContain(MUSIC_MAIN.url);
  });

  it("the first gesture creates one looping player for the owner's soundtrack and plays it", async () => {
    const t = setup();
    await t.start();
    expect(t.contexts).toHaveLength(1);
    expect(t.media.elements).toHaveLength(1);
    const element = t.media.elements[0];
    expect(element.src).toBe(MUSIC_MAIN.url);
    expect(element.loop).toBe(true);
    expect(element.paused).toBe(false);
    expect(element.playCalls).toBe(1);
    expect(t.contexts[0].mediaSources).toHaveLength(1);
    expect(t.contexts[0].decodes).toHaveLength(0);
  });

  it("a gesture before any frame, then a frame, also starts it", async () => {
    const t = setup();
    t.host.attach();
    await t.gesture("keydown");
    expect(t.media.elements).toHaveLength(0); // the director has not asked yet
    t.frames(DT);
    expect(t.media.elements).toHaveLength(1);
    expect(t.media.elements[0].paused).toBe(false);
  });

  it("a refused play() is retried by the next gesture, with the same player", async () => {
    const t = setup();
    t.media.next.playMode = "refuse";
    await t.start();
    const element = t.media.elements[0];
    expect(element.paused).toBe(true);
    t.frames(0.5);
    expect(element.playCalls).toBe(1);
    element.playMode = "allow";
    await t.gesture("touchend");
    expect(element.paused).toBe(false);
    expect(element.playCalls).toBe(2);
    expect(t.media.elements).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it("many gestures and frames never make a second player or media source", async () => {
    const t = setup();
    await t.start();
    for (let i = 0; i < 10; i++) {
      await t.gesture(i % 2 ? "keydown" : "pointerdown");
      t.frames(0.05);
    }
    expect(t.media.elements).toHaveLength(1);
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].mediaSources).toHaveLength(1);
    expect(t.media.elements[0].playCalls).toBe(1);
  });

  it("music: null plays no music", async () => {
    const t = setup({ music: null });
    await t.start();
    t.frames(0.5);
    expect(t.media.elements).toHaveLength(0);
    expect(t.contexts[0].mediaSources).toHaveLength(0);
  });
});

describe("audio host music — routing, mix and volume settings", () => {
  it("the mix: music 0.5, ambience 0.2 (A-OWN, provisional), sfx 0.7", () => {
    expect(AUDIO_MIX).toEqual({ master: 1, music: 0.5, ambience: 0.2, sfx: 0.7 });
  });

  it("the player feeds the music bus at mix × volume", async () => {
    const t = setup();
    await t.start();
    const { music, ambience, sfx } = t.buses();
    expect(t.streamGain().connections).toEqual([music]);
    expect(t.streamGain().gain.value).toBe(1);
    expect(music.gain.value).toBeCloseTo(0.5);
    expect(ambience.gain.value).toBeCloseTo(0.2);
    expect(sfx.gain.value).toBeCloseTo(0.7);
  });

  it("the music volume moves only the music bus", async () => {
    const t = setup();
    await t.start();
    const { music, ambience, sfx } = t.buses();
    t.store.setVolume("music", 0.4);
    expect(music.gain.value).toBeCloseTo(0.2);
    expect(ambience.gain.value).toBeCloseTo(0.2);
    expect(sfx.gain.value).toBeCloseTo(0.7);
    t.store.setVolume("music", 0);
    expect(music.gain.value).toBe(0);
    expect(t.media.elements[0].paused).toBe(false); // volume 0 is not mute
  });

  it("the sfx and ambience volumes do not move the music bus", async () => {
    const t = setup();
    await t.start();
    const { music } = t.buses();
    t.store.setVolume("sfx", 0.1);
    t.store.setVolume("ambience", 0.9);
    expect(music.gain.value).toBeCloseTo(0.5);
  });

  it("a music volume saved before the session applies before the first sound", async () => {
    const t = setup();
    t.store.setVolume("music", 0.6);
    await t.start();
    expect(t.buses().music.gain.value).toBeCloseTo(0.3);
  });
});

describe("audio host music — rounds and ducking", () => {
  const crash: EngineEventMap["crashed"] = { roundId: 1, multiplier: 2 };
  const cashout: EngineEventMap["cashedOut"] = { roundId: 1, slot: 0, multiplier: 2 };
  const impact: EngineEventMap["shipImpact"] = { roundId: 1, jackpotMultiplier: 1000 };

  it("whole rounds never restart, pause or reload the soundtrack", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    for (let round = 0; round < 3; round++) {
      t.frames(0.2, { phase: "idle" });
      t.emit("betPlaced", { roundId: round, slot: 0, amount: 10 });
      t.emit("diveStarted", { roundId: round });
      t.frames(0.5, { phase: "diving", multiplier: 2 });
      t.emit("cashedOut", cashout);
      t.frames(0.3, { phase: "cashed", multiplier: 2 });
      t.emit("crashed", crash);
      t.frames(4, { phase: "crashed" });
    }
    expect(t.media.elements).toHaveLength(1);
    expect(element.playCalls).toBe(1);
    expect(element.pauseCalls).toBe(0);
    expect(element.loadCalls).toBe(0);
    expect(element.src).toBe(MUSIC_MAIN.url);
    expect(errors).not.toHaveBeenCalled();
  });

  it.each([
    ["crash", "crashed", crash],
    ["cashout", "cashedOut", cashout],
    ["jackpot", "shipImpact", impact],
  ] as const)(
    "%s ducks the player's gain to its factor and back to 1",
    async (kind, name, payload) => {
      const shape = MUSIC_DUCK[kind];
      const t = setup();
      await t.start();
      t.emit(name, payload);
      t.frames(shape.attackS + 0.05);
      expect(t.streamGain().gain.value).toBeCloseTo(shape.factor, 6);
      t.frames(shape.holdS + shape.releaseS + 0.1);
      expect(t.streamGain().gain.value).toBe(1);
      // The duck is on the player, not on the bus the settings drive.
      expect(t.buses().music.gain.value).toBeCloseTo(0.5);
    },
  );

  it("overlapping ducks use the deepest one", async () => {
    const t = setup();
    await t.start();
    t.emit("cashedOut", cashout);
    t.frames(0.3);
    t.emit("crashed", crash);
    t.frames(0.3);
    expect(t.streamGain().gain.value).toBeCloseTo(0.4, 6);
  });

  it("every duck step is applied as a smooth ramp, never a jump", async () => {
    const t = setup();
    await t.start();
    t.emit("crashed", crash);
    t.frames(4);
    const automation = t.streamGain().gain.automation;
    expect(automation.length).toBeGreaterThan(0);
    for (const entry of automation) expect(entry.kind).not.toBe("linearRamp");
    // rampTo: cancel, hold the current value, then approach the target.
    expect(automation.filter((entry) => entry.kind === "setTargetAtTime").length).toBe(
      automation.length / 3,
    );
  });
});

describe("audio host music — mute, visibility, detach and remount", () => {
  it("mute pauses the soundtrack and unmute plays it on", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    t.store.setMuted(true);
    expect(element.paused).toBe(true);
    t.frames(0.5);
    expect(element.paused).toBe(true);
    t.store.setMuted(false);
    expect(element.paused).toBe(false);
    expect(element.loadCalls).toBe(0);
    expect(t.media.elements).toHaveLength(1);
  });

  it("starting muted creates no player until unmuted", async () => {
    const t = setup();
    t.store.setMuted(true);
    await t.start();
    t.frames(0.5);
    expect(t.media.elements).toHaveLength(0);
    t.store.setMuted(false);
    expect(t.media.elements).toHaveLength(1);
    expect(t.media.elements[0].paused).toBe(false);
  });

  it("a hidden tab pauses it; a visible one plays it on", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    t.doc.visibilityState = "hidden";
    t.doc.dispatch("visibilitychange");
    expect(element.paused).toBe(true);
    t.doc.visibilityState = "visible";
    t.doc.dispatch("visibilitychange");
    expect(element.paused).toBe(false);
    t.win.dispatch("pagehide");
    expect(element.paused).toBe(true);
    t.win.dispatch("pageshow");
    expect(element.paused).toBe(false);
    expect(element.loadCalls).toBe(0);
  });

  it("an interruption pauses it and re-arms; the next gesture plays it on", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    t.contexts[0].interrupt();
    expect(element.paused).toBe(true);
    await t.gesture();
    expect(element.paused).toBe(false);
    expect(t.media.elements).toHaveLength(1);
  });

  it("detach fades and pauses it; remount plays the same player on", async () => {
    const t = setup();
    const detach = await t.start();
    const element = t.media.elements[0];
    detach();
    expect(t.streamGain().gain.value).toBe(0); // fading out
    t.contexts[0].advance(STREAM_HOLD_FADE_S * 2);
    element.tick();
    expect(element.paused).toBe(true);

    t.host.attach();
    expect(element.paused).toBe(true); // attached, but no frame yet
    t.frames(DT);
    expect(element.paused).toBe(false);
    expect(t.streamGain().gain.value).toBe(1);
    expect(element.loadCalls).toBe(0);
    expect(t.media.elements).toHaveLength(1);
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].mediaSources).toHaveLength(1);
  });

  it("ten detach and remount cycles keep one player and no stray listener", async () => {
    const t = setup();
    let detach = await t.start();
    const element = t.media.elements[0];
    for (let i = 0; i < 10; i++) {
      detach();
      t.contexts[0].advance(1);
      element.tick();
      detach = t.host.attach();
      t.frames(0.05);
    }
    expect(t.media.elements).toHaveLength(1);
    expect(element.listenerCount).toBe(3);
    expect(element.paused).toBe(false);
    detach();
    expect(t.win.count() + t.doc.count()).toBe(0);
  });

  it("frames while detached do not play it", async () => {
    const t = setup();
    const detach = await t.start();
    const element = t.media.elements[0];
    detach();
    t.contexts[0].advance(1);
    element.tick();
    t.frames(0.5);
    expect(element.paused).toBe(true);
  });
});

describe("audio host music — failures and disposal", () => {
  it("a soundtrack that fails to load never disturbs the game or the effects", async () => {
    const t = setup({}, true);
    await t.start();
    const element = t.media.elements[0];
    element.fail();
    expect(() => {
      t.frames(0.5);
      t.emit("crashed", { roundId: 1, multiplier: 2 });
      t.frames(1, { phase: "crashed" });
      t.store.setMuted(true);
      t.store.setMuted(false);
    }).not.toThrow();
    expect(errors).not.toHaveBeenCalled();
    expect(warns).toHaveBeenCalledTimes(1);
    // The sound bank still loads its cues.
    expect(t.fetch.requests.length).toBeGreaterThan(0);
    // A later gesture retries the load.
    await t.gesture();
    expect(element.loadCalls).toBe(1);
    expect(element.paused).toBe(false);
  });

  it("a media element factory that throws leaves the game silent of music only", async () => {
    const t = setup({
      createMediaElement: () => {
        throw new Error("no Audio");
      },
    });
    await t.start();
    expect(() => t.frames(0.5)).not.toThrow();
    expect(errors).not.toHaveBeenCalled();
    expect(t.contexts[0].mediaSources).toHaveLength(0);
  });

  it("dispose releases the player, its listeners and its nodes, and closes the context", async () => {
    const t = setup();
    await t.start();
    const element = t.media.elements[0];
    const source = t.contexts[0].mediaSources[0];
    t.host.dispose();
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(element.listenerCount).toBe(0);
    expect(source.connections).toHaveLength(0);
    expect(t.contexts[0].closeCalls).toBe(1);
    expect(t.win.count() + t.doc.count()).toBe(0);
    // Nothing comes back.
    t.host.attach();
    t.frames(0.2);
    await t.gesture();
    expect(element.playCalls).toBe(1);
    expect(t.media.elements).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it("dispose before any gesture creates nothing", () => {
    const t = setup();
    t.host.attach();
    t.frames(0.1);
    t.host.dispose();
    expect(t.media.elements).toHaveLength(0);
    expect(t.contexts).toHaveLength(0);
  });
});

describe("audio host music — what did not change", () => {
  it("the chain rattle stays disabled: never fetched, never looped (A6.1)", async () => {
    const t = setup({}, true);
    await t.start();
    t.emit("diveStarted", { roundId: 1 });
    t.frames(1, { phase: "diving", multiplier: 5 });
    await flush();
    expect(DISABLED_BY_DEFAULT).toEqual(["chain-rattle"]);
    const urls = t.fetch.requests.map((r) => r.url);
    expect(urls).not.toContain("test://chain-rattle");
    expect(urls).toContain("test://ambience-surface");
    expect(urls).toContain("test://ambience-underwater");
    // A-OWN: the two tension creaks are not fetched either.
    expect(urls).not.toContain("test://tension-creak-1");
    expect(urls).not.toContain("test://tension-creak-2");
    expect(urls).toHaveLength(Object.keys(SOUND_MANIFEST).length - 3);
  });

  it("one context for the session, with music playing", async () => {
    const t = setup();
    const detach = await t.start();
    detach();
    t.host.attach();
    await t.gesture();
    t.frames(0.2);
    expect(t.contexts).toHaveLength(1);
  });
});

describe("audio host music — Q15 on iOS and iPadOS without the Audio Session API (simulated; LA1 cases in audio-host.switches.test.ts)", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IPAD_DESKTOP =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
  const CHROME_WIN =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
  const ANDROID =
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36";

  it("recognizes iPhone, iPad and iPod, including an iPad in desktop mode", () => {
    expect(
      isSilentSwitchPlatform({ userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 }),
    ).toBe(true);
    expect(isSilentSwitchPlatform({ userAgent: IPHONE.replace("iPhone;", "iPad;") })).toBe(true);
    expect(isSilentSwitchPlatform({ userAgent: IPHONE.replace("iPhone;", "iPod touch;") })).toBe(
      true,
    );
    expect(
      isSilentSwitchPlatform({ userAgent: IPAD_DESKTOP, platform: "MacIntel", maxTouchPoints: 5 }),
    ).toBe(true);
    // Chrome and Firefox on iOS are WebKit too, and say iPhone.
    expect(
      isSilentSwitchPlatform({ userAgent: IPHONE.replace("Version/18.0", "CriOS/157.0") }),
    ).toBe(true);
  });

  it("does not match a Mac, Windows, Android or missing hints", () => {
    expect(
      isSilentSwitchPlatform({ userAgent: IPAD_DESKTOP, platform: "MacIntel", maxTouchPoints: 0 }),
    ).toBe(false);
    expect(isSilentSwitchPlatform({ userAgent: IPAD_DESKTOP, platform: "MacIntel" })).toBe(false);
    expect(
      isSilentSwitchPlatform({ userAgent: CHROME_WIN, platform: "Win32", maxTouchPoints: 10 }),
    ).toBe(false);
    expect(
      isSilentSwitchPlatform({ userAgent: ANDROID, platform: "Linux armv81", maxTouchPoints: 5 }),
    ).toBe(false);
    expect(isSilentSwitchPlatform({})).toBe(false);
    expect(isSilentSwitchPlatform(null)).toBe(false);
    expect(isSilentSwitchPlatform(undefined)).toBe(false);
  });

  it("browserMusicElement gives no element on an iPhone without navigator.audioSession and never constructs Audio there", () => {
    const made: unknown[] = [];
    class FakeAudio {
      constructor() {
        made.push(this);
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("navigator", { userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 });
    expect(browserMusicElement()).toBeNull();
    expect(made).toHaveLength(0);
    vi.stubGlobal("navigator", { userAgent: CHROME_WIN, platform: "Win32", maxTouchPoints: 0 });
    expect(browserMusicElement()).toBe(made[0]);
  });

  it("without an Audio global (SSR, node) it gives no element and does not throw", () => {
    expect(browserMusicElement()).toBeNull();
  });

  it("on an iPhone without navigator.audioSession the host plays no music; effects and ambience are untouched, quietly", async () => {
    vi.stubGlobal("navigator", { userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 });
    vi.stubGlobal(
      "Audio",
      class {
        constructor() {
          throw new Error("Audio must not be constructed on iOS");
        }
      },
    );
    const t = setup({ createMediaElement: undefined }, true);
    await t.start();
    t.emit("crashed", { roundId: 1, multiplier: 2 });
    t.frames(1, { phase: "crashed" });
    await t.gesture();
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].mediaSources).toHaveLength(0);
    // Every cue but the rattle and the two creaks (A6.1, A-OWN).
    expect(t.fetch.requests.length).toBe(Object.keys(SOUND_MANIFEST).length - 3);
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  });

  it("off iOS the host never touches navigator.audioSession (LA1: only iOS sets it, to ambient)", async () => {
    const session = { type: "auto" };
    const reads: string[] = [];
    const nav = new Proxy(
      { userAgent: CHROME_WIN, platform: "Win32", maxTouchPoints: 0, audioSession: session },
      {
        get(target, key) {
          reads.push(String(key));
          return Reflect.get(target, key);
        },
      },
    );
    vi.stubGlobal("navigator", nav);
    vi.stubGlobal("Audio", class {});
    browserMusicElement();
    const t = setup();
    await t.start();
    t.frames(0.5);
    t.host.dispose();
    expect(reads).not.toContain("audioSession");
    expect(reads).not.toContain("mediaSession");
    expect(session.type).toBe("auto");
  });
});
