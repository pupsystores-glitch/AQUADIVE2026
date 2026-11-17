// Audio host tests (Sprint 5 / Phase 7, step A4b; docs/08 §3.3, §3.5, §7,
// §14 risks 13, 14 and 17). Node env.
//
// The real AudioManager, SoundBank and AudioDirector run over the existing
// fakes (FakeAudioContext, FakeFetch), unchanged. The browser is a recording
// fake environment, the engine bus is the real EventBus, and the settings
// store is the real one over in-memory storage. Failures are injected
// through the host's factory seams, never by changing an audio module.

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  createAudioManager,
  type AudioManager,
  type AudioManagerOptions,
} from "@/audio/audio-manager";
import {
  DISABLED_BY_DEFAULT,
  DISABLED_CUES_BY_DEFAULT,
  type AudioDirector,
  type AudioEventSource,
  type AudioFrame,
} from "@/audio/director";
import {
  SOUND_MANIFEST,
  type CueDefinition,
  type CueId,
  type SoundManifest,
} from "@/audio/manifest";
import { createSoundBank, type SoundBank, type SoundBankOptions } from "@/audio/sound-bank";
import { FakeAudioContext, fakeBuffer } from "@/audio/test/fake-audio-context";
import { FakeFetch } from "@/audio/test/fake-fetch";
import { EventBus, type EngineEventMap } from "@/engine";
import { CHAIN_MAX_DEPTH } from "@/shared/world";
import { anchorTouchdownSeconds } from "@/ui/anchor-touchdown";
import {
  AUDIO_MIX,
  UNLOCK_GESTURES,
  createAudioHost,
  type AudioEnvironment,
  type AudioEventTarget,
  type AudioFrameInput,
  type AudioHostOptions,
} from "@/ui/audio-host";
import {
  SOUND_SETTINGS_STORAGE_KEY,
  createSoundSettingsStore,
  type SoundSettingsStorage,
} from "@/ui/store/sound-settings-store";

// ----- fakes -----

/** A recording event target: `window` or `document`. */
class FakeTarget implements AudioEventTarget {
  readonly listeners = new Map<string, Set<() => void>>();
  added = 0;
  removed = 0;
  /** Throw on the n-th addEventListener call (1-based), once. */
  failOnAdd: number | null = null;
  visibilityState = "visible";

  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void {
    this.added++;
    if (this.failOnAdd !== null && this.added === this.failOnAdd) {
      this.failOnAdd = null;
      throw new Error("addEventListener refused");
    }
    expect(options).toEqual({ capture: true, passive: true });
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void, options?: EventListenerOptions): void {
    expect(options).toEqual({ capture: true });
    if (this.listeners.get(type)?.delete(listener)) this.removed++;
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

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const reads: string[] = [];
  const storage: SoundSettingsStorage = {
    getItem: (key) => {
      reads.push(key);
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return { storage, reads, data };
};

const record = (settings: Partial<Record<string, unknown>>) =>
  JSON.stringify({
    version: 1,
    muted: false,
    master: 1,
    music: 1,
    ambience: 1,
    sfx: 1,
    ...settings,
  });

/** The real manifest with a `test://` asset on every cue. */
const withTestAssets = (): SoundManifest<CueId> => {
  const manifest = {} as Record<CueId, CueDefinition>;
  for (const [id, definition] of Object.entries(SOUND_MANIFEST) as [CueId, CueDefinition][]) {
    manifest[id] = { ...definition, asset: { url: `test://${id}` } };
  }
  return manifest;
};

/** The real manifest with every asset removed: an explicit no-asset fixture (the production manifest has assets since A6). */
const withoutAssets = (): SoundManifest<CueId> => {
  const manifest = {} as Record<CueId, CueDefinition>;
  for (const [id, definition] of Object.entries(SOUND_MANIFEST) as [CueId, CueDefinition][]) {
    manifest[id] = { ...definition, asset: null };
  }
  return manifest;
};

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

type Call = { readonly method: string; readonly args: readonly unknown[] };

/** Wraps the real manager and records every call, in order. */
const recordingManager = (calls: Call[], failures: Partial<Record<string, number>> = {}) => {
  return (options: AudioManagerOptions<CueId>): AudioManager<CueId> => {
    const real = createAudioManager<CueId>(options);
    const wrap =
      <K extends keyof AudioManager<CueId>>(method: K) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        if ((failures[method] ?? 0) > 0) {
          failures[method]!--;
          throw new Error(`${method} failed`);
        }
        return (real[method] as (...a: unknown[]) => unknown)(...args);
      };
    return {
      unlock: wrap("unlock"),
      setBusGain: wrap("setBusGain"),
      setMuted: wrap("setMuted"),
      play: wrap("play"),
      loop: wrap("loop"),
      stream: wrap("stream"),
      decode: (data) => real.decode(data),
      suspend: wrap("suspend"),
      resume: wrap("resume"),
      dispose: wrap("dispose"),
    } as AudioManager<CueId>;
  };
};

interface SetupOptions {
  stored?: string;
  assets?: boolean;
  /** Use the host's default manifest: the production one, with its real asset URLs (A6). */
  production?: boolean;
  managerFailures?: Partial<Record<string, number>>;
  extra?: Partial<AudioHostOptions>;
  settingsOverride?: (
    store: ReturnType<typeof createSoundSettingsStore>,
  ) => AudioHostOptions["settings"];
}

function setup(opts: SetupOptions = {}) {
  const events = new EventBus<EngineEventMap>();
  const mem = memoryStorage(
    opts.stored === undefined ? {} : { [SOUND_SETTINGS_STORAGE_KEY]: opts.stored },
  );
  const store = createSoundSettingsStore({ storage: () => mem.storage });
  const contexts: FakeAudioContext[] = [];
  const fetch = new FakeFetch();
  const win = new FakeTarget();
  const doc = new FakeTarget();
  let envResolutions = 0;
  const calls: Call[] = [];
  const order: string[] = [];
  const host = createAudioHost({
    events,
    settings: opts.settingsOverride ? opts.settingsOverride(store) : store,
    createContext: () => {
      const context = new FakeAudioContext();
      contexts.push(context);
      return context;
    },
    fetch: fetch.fetch,
    manifest: opts.production ? undefined : opts.assets ? withTestAssets() : withoutAssets(),
    environment: (): AudioEnvironment => {
      envResolutions++;
      return { window: win, document: doc };
    },
    createManager: (options) => {
      const manager = recordingManager(calls, opts.managerFailures)(options);
      const dispose = manager.dispose;
      manager.dispose = () => {
        order.push("manager.dispose");
        dispose();
      };
      return manager;
    },
    createBank: (options) => {
      const bank = createSoundBank(options);
      const dispose = bank.dispose.bind(bank);
      bank.dispose = () => {
        order.push("bank.dispose");
        dispose();
      };
      return bank;
    },
    ...opts.extra,
  });
  return {
    host,
    events,
    store,
    mem,
    contexts,
    fetch,
    win,
    doc,
    calls,
    order,
    envResolutions: () => envResolutions,
    gesture: (type: (typeof UNLOCK_GESTURES)[number] = "pointerdown") => win.dispatch(type),
    emit: <K extends keyof EngineEventMap>(name: K, payload: EngineEventMap[K]) => {
      events.emit(name, payload);
      events.dispatchQueued();
    },
  };
}

const input = (over: Partial<AudioFrameInput["state"]> = {}, dt = 1 / 60): AudioFrameInput => ({
  render: { depthRatio: 0 },
  time: { frameDt: dt },
  state: { phase: "idle", multiplier: 1, boost: 0, ...over },
});

const methods = (calls: readonly Call[]) => calls.map((c) => c.method);

let errors: MockInstance<Console["error"]>;
let warns: MockInstance<Console["warn"]>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  warns = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ----- construction -----

describe("audio host — construction (SSR-safe)", () => {
  it("touches no context, storage, fetch or environment; applies the defaults to the manager", () => {
    const t = setup({ assets: true, stored: record({ muted: true }) });
    expect(t.contexts).toHaveLength(0);
    expect(t.mem.reads).toHaveLength(0);
    expect(t.fetch.requests).toHaveLength(0);
    expect(t.envResolutions()).toBe(0);
    expect(methods(t.calls)).toEqual([
      "setMuted",
      "setBusGain",
      "setBusGain",
      "setBusGain",
      "setBusGain",
    ]);
    expect(t.calls[0].args).toEqual([false]);
  });

  it("the director subscribes at construction and is paused: events before an attach play nothing", async () => {
    const t = setup();
    t.emit("diveStarted", { roundId: 1 });
    t.host.attach();
    t.host.update(input({ phase: "diving" }));
    expect(t.calls.filter((c) => c.method === "play")).toEqual([]);
    // After the attach, events reach the director.
    t.emit("betPlaced", { roundId: 1, slot: 0, amount: 1 });
    t.host.update(input({ phase: "diving" }));
    expect(t.calls.filter((c) => c.method === "play").map((c) => c.args[0])).toEqual([
      "bet-clink-1",
    ]);
  });

  it("works with no browser at all (SSR / node): attach installs nothing and never throws", () => {
    const t = setup({ extra: { environment: () => ({ window: null, document: null }) } });
    const detach = t.host.attach();
    t.host.update(input());
    detach();
    t.host.dispose();
    expect(errors).not.toHaveBeenCalled();
  });
});

// ----- settings before unlock (docs/08 §14 risk 14) -----

describe("audio host — settings are restored and applied before the first unlock", () => {
  it("a persisted mute and volumes are applied on attach, before any gesture can unlock", async () => {
    const t = setup({ stored: record({ muted: true, master: 0.5, sfx: 0.25 }) });
    t.host.attach();
    expect(t.mem.reads).toEqual([SOUND_SETTINGS_STORAGE_KEY]);
    expect(t.store.get().muted).toBe(true);
    const unlockAt = () => methods(t.calls).indexOf("unlock");
    expect(unlockAt()).toBe(-1);
    const muteAt = t.calls.findIndex((c) => c.method === "setMuted" && c.args[0] === true);
    expect(muteAt).toBeGreaterThan(0);
    expect(t.calls).toContainEqual({
      method: "setBusGain",
      args: ["master", 0.5 * AUDIO_MIX.master],
    });
    expect(t.calls).toContainEqual({ method: "setBusGain", args: ["sfx", 0.25 * AUDIO_MIX.sfx] });

    t.gesture();
    expect(unlockAt()).toBeGreaterThan(muteAt);
    await flush();
    // Muted: the unlocked context is suspended again, and nothing plays.
    expect(t.contexts).toHaveLength(1);
    expect(t.contexts[0].state).toBe("suspended");
    t.emit("betPlaced", { roundId: 1, slot: 0, amount: 1 });
    t.host.update(input());
    expect(t.contexts[0].sources.filter((s) => s.buffer && s.buffer.duration > 0.01)).toEqual([]);
  });

  it("a setting changed later is applied at once", () => {
    const t = setup();
    t.host.attach();
    t.calls.length = 0;
    t.store.setVolume("ambience", 0.3);
    expect(t.calls).toContainEqual({
      method: "setBusGain",
      args: ["ambience", AUDIO_MIX.ambience * 0.3],
    });
    t.store.setMuted(true);
    expect(t.calls).toContainEqual({ method: "setMuted", args: [true] });
  });

  it("a restore that throws blocks the unlock; a later gesture restores, applies, then unlocks", async () => {
    let failures = 1;
    const t = setup({
      stored: record({ muted: true }),
      settingsOverride: (store) => ({
        get: store.get,
        subscribe: store.subscribe,
        restore: () => {
          if (failures-- > 0) throw new Error("restore failed");
          return store.restore();
        },
      }),
    });
    t.host.attach();
    expect(t.store.get().muted).toBe(false);
    t.gesture(); // the retry inside the gesture succeeds
    expect(t.store.get().muted).toBe(true);
    const muteAt = t.calls.findIndex((c) => c.method === "setMuted" && c.args[0] === true);
    expect(methods(t.calls).indexOf("unlock")).toBeGreaterThan(muteAt);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("a restore that keeps throwing never unlocks: silent rather than at the wrong level", () => {
    const t = setup({
      settingsOverride: (store) => ({
        get: store.get,
        subscribe: store.subscribe,
        restore: () => {
          throw new Error("restore failed");
        },
      }),
    });
    t.host.attach();
    t.gesture();
    t.gesture("keydown");
    expect(methods(t.calls)).not.toContain("unlock");
    expect(t.contexts).toHaveLength(0);
    expect(errors).toHaveBeenCalledTimes(1); // logged once per kind
  });

  it("an apply that throws blocks the unlock; the next gesture re-applies, then unlocks", () => {
    // Construction applies once (fails), attach applies again (fails), the gesture succeeds.
    const t = setup({ stored: record({ muted: true }), managerFailures: { setMuted: 2 } });
    t.host.attach();
    expect(methods(t.calls)).not.toContain("unlock");
    t.gesture();
    const calls = methods(t.calls);
    expect(calls.lastIndexOf("setMuted")).toBeLessThan(calls.indexOf("unlock"));
    expect(t.calls.filter((c) => c.method === "setMuted").at(-1)!.args).toEqual([true]);
    expect(t.calls.filter((c) => c.method === "unlock")).toHaveLength(1);
  });

  it("every gesture after the first calls unlock() without re-applying unchanged settings (risk 17 unchanged)", () => {
    const t = setup();
    t.host.attach();
    t.gesture();
    const applied = t.calls.filter((c) => c.method === "setMuted").length;
    t.gesture("keydown");
    t.gesture("touchend");
    expect(t.calls.filter((c) => c.method === "unlock")).toHaveLength(3);
    expect(t.calls.filter((c) => c.method === "setMuted")).toHaveLength(applied);
    expect(t.contexts).toHaveLength(1);
  });
});

// ----- loading -----

/** The cues the host loads: every manifest cue except the director's disabled cues (A6.1, A-OWN). */
const LOADED_CUES = (Object.keys(SOUND_MANIFEST) as CueId[]).filter(
  (cue) => !DISABLED_CUES_BY_DEFAULT.includes(cue),
);

describe("audio host — loading is idempotent", () => {
  it("each cue is requested once across attach, detach, re-attach and a StrictMode double mount", async () => {
    const t = setup({ assets: true });
    const a = t.host.attach();
    t.host.attach(); // idempotent while attached
    a();
    const b = t.host.attach();
    b();
    t.host.attach();
    await flush();
    const urls = t.fetch.requests.map((r) => r.url);
    expect(urls).toHaveLength(LOADED_CUES.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("by default the host loads the production manifest: every enabled cue's own file, once (A6, A6.1)", async () => {
    const t = setup({ production: true });
    t.host.attach();
    await flush();
    const urls = t.fetch.requests.map((r) => r.url);
    const expected = LOADED_CUES.map((cue) => (SOUND_MANIFEST[cue] as CueDefinition).asset?.url);
    expect([...urls].sort()).toEqual([...expected].sort());
    expect(new Set(urls).size).toBe(LOADED_CUES.length);
  });

  it("missing production files leave the host silent: one warning per cue, no error, no retry (A6)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = setup({ production: true });
    const detach = t.host.attach();
    await flush();
    for (const request of t.fetch.requests) request.status(404);
    await flush();
    expect(warn).toHaveBeenCalledTimes(LOADED_CUES.length);
    detach();
    t.host.attach();
    await flush();
    expect(t.fetch.requests).toHaveLength(LOADED_CUES.length);
    expect(errors).not.toHaveBeenCalled();
  });

  it("never fetches the disabled tension creaks, whose manifest entries and files stay (A-OWN)", async () => {
    expect(DISABLED_CUES_BY_DEFAULT).toContain("tension-creak-1");
    expect(DISABLED_CUES_BY_DEFAULT).toContain("tension-creak-2");
    const creakUrls = (["tension-creak-1", "tension-creak-2"] as const).map(
      (cue) => SOUND_MANIFEST[cue].asset?.url,
    );
    for (const url of creakUrls) expect(url).toBeTruthy();
    const t = setup({ production: true });
    const detach = t.host.attach();
    await flush();
    detach();
    t.host.attach();
    t.gesture("pointerdown");
    await flush();
    const urls = t.fetch.requests.map((r) => r.url);
    for (const url of creakUrls) expect(urls).not.toContain(url);
    expect(urls).toHaveLength(LOADED_CUES.length);
  });

  it("loads exactly the 14 enabled cues: every cue but the rattle, the two creaks and (BET-1x2) bet-clink-2", () => {
    expect(LOADED_CUES).toHaveLength(14);
    expect(LOADED_CUES).not.toContain("chain-rattle");
    expect(LOADED_CUES).not.toContain("tension-creak-1");
    expect(LOADED_CUES).not.toContain("tension-creak-2");
    expect(LOADED_CUES).not.toContain("bet-clink-2");
    expect(LOADED_CUES).toContain("bet-clink-1");
  });

  it("never fetches the disabled chain-rattle, whose manifest entry and file stay (A6.1)", async () => {
    expect(DISABLED_BY_DEFAULT).toEqual(["chain-rattle"]);
    expect(LOADED_CUES).toHaveLength(Object.keys(SOUND_MANIFEST).length - 4); // BET-1x2: bet-clink-2 too
    expect(LOADED_CUES).toContain("chain-unspool");
    expect(LOADED_CUES).toContain("chain-snap");
    const rattleUrl = SOUND_MANIFEST["chain-rattle"].asset?.url;
    expect(rattleUrl).toBeTruthy();
    const t = setup({ production: true });
    const detach = t.host.attach();
    await flush();
    detach();
    t.host.attach();
    await flush();
    const urls = t.fetch.requests.map((r) => r.url);
    expect(urls).not.toContain(rattleUrl);
    expect(urls).toContain(SOUND_MANIFEST["chain-unspool"].asset?.url);
    expect(urls).toContain(SOUND_MANIFEST["chain-snap"].asset?.url);
  });

  it("with a no-asset manifest nothing is fetched", async () => {
    const t = setup();
    t.host.attach();
    await flush();
    expect(t.fetch.requests).toHaveLength(0);
  });

  it("a loadAll that throws is retried by the next attach, without duplicate requests", async () => {
    let failures = 1;
    const t = setup({
      assets: true,
      extra: {
        createBank: (options: SoundBankOptions<CueId>): SoundBank<CueId> => {
          const bank = createSoundBank(options);
          const loadAll = bank.loadAll.bind(bank);
          bank.loadAll = (cues) => {
            if (failures-- > 0) throw new Error("loadAll failed");
            return loadAll(cues);
          };
          return bank;
        },
      },
    });
    const detach = t.host.attach();
    await flush();
    expect(t.fetch.requests).toHaveLength(0);
    detach();
    t.host.attach();
    t.host.attach();
    await flush();
    expect(t.fetch.requests).toHaveLength(LOADED_CUES.length);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("onReady wakes the director: a bed waiting for its cue starts as soon as it is ready (risk 13)", async () => {
    const t = setup({ assets: true });
    t.host.attach();
    t.gesture();
    await flush();
    t.host.update(input({ phase: "idle" }));
    const loops = () => t.contexts[0].sources.filter((s) => s.loop);
    expect(loops()).toHaveLength(0);
    t.fetch.for("test://ambience-surface")[0].ok();
    await flush();
    t.contexts[0].decodes.at(-1)!.succeed(fakeBuffer(20));
    await flush();
    expect(loops()).toHaveLength(1); // started by wake(), before any further frame
    expect(loops()[0].isPlaying()).toBe(true);
  });
});

// ----- browser listeners -----

describe("audio host — attach-scoped browser listeners", () => {
  const expected = { window: UNLOCK_GESTURES.length + 2, document: 1 };

  it("attach installs each listener once; detach removes every one", () => {
    const t = setup();
    const detach = t.host.attach();
    expect(t.win.count()).toBe(expected.window);
    expect(t.doc.count()).toBe(expected.document);
    expect([...t.win.listeners.keys()].sort()).toEqual(
      [...UNLOCK_GESTURES, "pagehide", "pageshow"].sort(),
    );
    t.host.attach();
    expect(t.win.added).toBe(expected.window);
    detach();
    expect(t.win.count()).toBe(0);
    expect(t.doc.count()).toBe(0);
    detach(); // one-shot
    expect(t.win.removed).toBe(expected.window);
  });

  it("StrictMode order (attach, detach, attach) leaves exactly one set; a stale detach cannot detach the newer attachment", () => {
    const t = setup();
    const first = t.host.attach();
    first();
    const second = t.host.attach();
    first(); // stale
    expect(t.win.count()).toBe(expected.window);
    expect(t.doc.count()).toBe(expected.document);
    second();
    expect(t.win.count() + t.doc.count()).toBe(0);
  });

  it("a listener that fails to install rolls back the attachment's listeners; the next attach installs each exactly once", () => {
    const t = setup();
    t.win.failOnAdd = 3;
    const detach = t.host.attach();
    expect(t.win.count()).toBe(0);
    expect(t.doc.count()).toBe(0);
    expect(errors).toHaveBeenCalledTimes(1);
    // The attachment still runs frames (the first one ends the director's pause, §7.4).
    t.host.update(input());
    t.emit("betPlaced", { roundId: 1, slot: 1, amount: 1 });
    t.host.update(input());
    expect(t.calls.filter((c) => c.method === "play").map((c) => c.args[0])).toEqual([
      "bet-clink-1", // BET-1x2: slot 1 plays the BET 1 recording
    ]);
    detach();
    t.host.attach();
    expect(t.win.count()).toBe(expected.window);
    expect(t.doc.count()).toBe(expected.document);
    for (const set of [...t.win.listeners.values(), ...t.doc.listeners.values()])
      expect(set.size).toBe(1);
  });

  it("an environment that throws installs nothing and is retried on the next attach", () => {
    let failures = 1;
    const win = new FakeTarget();
    const t = setup({
      extra: {
        environment: () => {
          if (failures-- > 0) throw new Error("no environment");
          return { window: win, document: null };
        },
      },
    });
    const detach = t.host.attach();
    expect(win.count()).toBe(0);
    detach();
    t.host.attach();
    expect(win.count()).toBe(UNLOCK_GESTURES.length + 2);
  });

  it("visibility: hidden suspends, visible resumes, pagehide suspends; attach applies the current visibility", () => {
    const t = setup();
    t.doc.visibilityState = "hidden";
    t.host.attach();
    expect(methods(t.calls).at(-1)).toBe("suspend");
    t.doc.visibilityState = "visible";
    t.doc.dispatch("visibilitychange");
    expect(methods(t.calls).at(-1)).toBe("resume");
    t.win.dispatch("pagehide");
    expect(methods(t.calls).at(-1)).toBe("suspend");
    t.win.dispatch("pageshow");
    expect(methods(t.calls).at(-1)).toBe("resume");
  });

  it("a hidden tab suspends the unlocked context and resumes it when visible", async () => {
    const t = setup();
    t.host.attach();
    t.gesture();
    await flush();
    const context = t.contexts[0];
    expect(context.state).toBe("running");
    t.doc.visibilityState = "hidden";
    t.doc.dispatch("visibilitychange");
    expect(context.state).toBe("suspended");
    t.doc.visibilityState = "visible";
    t.doc.dispatch("visibilitychange");
    await flush();
    expect(context.state).toBe("running");
  });

  it("listeners do nothing after detach", () => {
    const t = setup();
    t.host.attach()();
    t.calls.length = 0;
    t.gesture();
    expect(t.calls).toEqual([]);
  });
});

// ----- frames and isolation -----

describe("audio host — frames and exception isolation", () => {
  it("update maps the projections onto one AudioFrame per call, reusing one object", () => {
    const frames: unknown[] = [];
    const t = setup({
      extra: {
        createDirector: (): AudioDirector => ({
          update: (f) => frames.push(f),
          pause: () => {},
          wake: () => {},
          dispose: () => {},
        }),
      },
    });
    t.host.update(input()); // detached: ignored
    expect(frames).toHaveLength(0);
    t.host.attach();
    t.host.update({
      render: { depthRatio: 0.4 },
      time: { frameDt: 0.02 },
      state: { phase: "diving", multiplier: 2.5, boost: 0.3 },
    });
    expect(frames).toEqual([
      { phase: "diving", depthRatio: 0.4, multiplier: 2.5, boost: 0.3, dt: 0.02 },
    ]);
    t.host.update(input());
    expect(frames[0]).toBe(frames[1]);
  });

  it("A-OWN.1: hands the director the landing timing from the scene size and the impact clock", () => {
    const seen: (AudioFrame["seaFloor"] | "absent")[] = [];
    const t = setup({
      extra: {
        createDirector: (): AudioDirector => ({
          update: (f) =>
            seen.push(f.seaFloor === undefined ? "absent" : f.seaFloor && { ...f.seaFloor }),
          pause: () => {},
          wake: () => {},
          dispose: () => {},
        }),
      },
    });
    t.host.attach();
    const state = { phase: "cashed", multiplier: 100, boost: 0 } as const;
    const time = { frameDt: 1 / 60 };
    // No scene size: no timing, so the thud plays on the event (legacy).
    t.host.update({
      render: { depthRatio: 1, worldY: CHAIN_MAX_DEPTH, shipImpact: { elapsed: 0 } },
      time,
      state,
    });
    // A scene size, before the floor: null (wait).
    const viewport = { width: 1280, height: 800 };
    t.host.update({
      render: { depthRatio: 1, worldY: CHAIN_MAX_DEPTH, shipImpact: null },
      time,
      state,
      viewport,
    });
    // On the floor: the renderer's clock and this scene's touchdown.
    t.host.update({
      render: { depthRatio: 1, worldY: CHAIN_MAX_DEPTH, shipImpact: { elapsed: 0.25 } },
      time,
      state,
      viewport,
    });
    expect(seen).toEqual([
      "absent",
      null,
      { elapsed: 0.25, touchdownS: anchorTouchdownSeconds(1280, 800, CHAIN_MAX_DEPTH) },
    ]);
  });

  it("a director that throws on every call never throws out of the host, and is logged once per kind", () => {
    const boom = () => {
      throw new Error("director failed");
    };
    const t = setup({
      extra: {
        createDirector: (): AudioDirector => ({
          update: boom,
          pause: boom,
          wake: boom,
          dispose: boom,
        }),
      },
    });
    const detach = t.host.attach();
    for (let i = 0; i < 5; i++) expect(() => t.host.update(input())).not.toThrow();
    expect(() => detach()).not.toThrow();
    expect(() => t.host.dispose()).not.toThrow();
    const kinds = errors.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("a construction failure leaves a silent, inert host that never throws", () => {
    const t = setup({
      extra: {
        createManager: () => {
          throw new Error("no manager");
        },
      },
    });
    expect(() => {
      const detach = t.host.attach();
      t.gesture();
      t.host.update(input());
      detach();
      t.host.dispose();
    }).not.toThrow();
  });

  it("a manager whose unlock rejects or throws does not escape the gesture listener", async () => {
    const t = setup({
      extra: {
        createManager: (options: AudioManagerOptions<CueId>) => {
          const manager = createAudioManager(options);
          manager.unlock = () => Promise.reject(new Error("rejected"));
          return manager;
        },
      },
    });
    t.host.attach();
    expect(() => t.gesture()).not.toThrow();
    await flush();
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("Web Audio unavailable: the game runs silent; only the manager's one warning is logged", () => {
    const t = setup({ extra: { createContext: () => null } });
    t.host.attach();
    t.gesture();
    t.gesture();
    t.emit("betPlaced", { roundId: 1, slot: 0, amount: 1 });
    expect(() => t.host.update(input())).not.toThrow();
    expect(warns).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });
});

// ----- dispose -----

describe("audio host — dispose", () => {
  it("removes listeners, unsubscribes the director and the settings bridge, disposes the bank before the manager", () => {
    const events = new EventBus<EngineEventMap>();
    const counted: AudioEventSource = {
      on: (name, listener) => {
        active++;
        const off = events.on(name, listener);
        return () => {
          active--;
          off();
        };
      },
    };
    let active = 0;
    const t = setup({ extra: { events: counted } });
    expect(active).toBeGreaterThan(0);
    t.host.attach();
    t.host.dispose();
    t.host.dispose(); // idempotent
    expect(active).toBe(0);
    expect(t.win.count() + t.doc.count()).toBe(0);
    expect(t.order).toEqual(["bank.dispose", "manager.dispose"]);
    t.calls.length = 0;
    t.store.setMuted(true);
    const detach = t.host.attach();
    t.gesture();
    t.host.update(input());
    detach();
    expect(t.calls).toEqual([]);
    expect(t.win.count()).toBe(0);
  });

  it("closes the context once it exists", async () => {
    const t = setup();
    t.host.attach();
    t.gesture();
    await flush();
    t.host.dispose();
    expect(t.contexts[0].closeCalls).toBe(1);
  });
});
