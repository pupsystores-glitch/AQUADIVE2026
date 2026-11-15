// AudioManager tests (Sprint 5 / Phase 7, step A1;
// docs/08_AUDIO_FX_ARCHITECTURE.md §11: lazy creation, unlock, gain
// clamping, mute, suspend/resume on visibility, voice cap and stealing,
// missing-asset tolerance, dispose; plus SSR safety, unsupported
// environments and the iOS interruption path, §3.3, §10). Node environment,
// with the hand-rolled fake context — no new dependency.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FADE_TIME_CONSTANTS,
  LIMITER_SETTINGS,
  LOOP_VOICES,
  MAX_PLAYBACK_RATE,
  MAX_VOICES,
  MIN_FILTER_HZ,
  MIN_PLAYBACK_RATE,
  ONE_SHOT_VOICES,
  PARAM_TIME_CONSTANT_S,
  TAIL_VOICES,
  VOICE_RECLAIM_GRACE_S,
  VOICE_STEAL_FADE_S,
  createAudioManager,
  createBrowserAudioContext,
  type AudioManager,
  type LoopHandle,
  type ResolvedCue,
} from "./audio-manager";
import {
  FakeAudioContext,
  fakeBuffer,
  routeOf,
  type FakeAudioContextOptions,
  type FakeAudioBufferSourceNode,
  type FakeGainNode,
} from "./test/fake-audio-context";

type Cue = "clink" | "boom" | "whisper" | "rattle" | "bed" | "drone" | "missing";

const CUES: Readonly<Partial<Record<Cue, ResolvedCue>>> = {
  clink: { buffer: fakeBuffer(0.2), bus: "sfx", gain: 0.8, priority: 1 },
  boom: { buffer: fakeBuffer(1.5), bus: "sfx", gain: 1, priority: 5 },
  whisper: { buffer: fakeBuffer(0.5), bus: "sfx", gain: 0.5, priority: 0 },
  rattle: {
    buffer: fakeBuffer(30),
    bus: "ambience",
    gain: 0.5,
    priority: 3,
    loopStart: 0.05,
    loopEnd: 29.95,
  },
  // A1.2: an essential bed (ambience or music) and a plain, non-essential loop.
  bed: { buffer: fakeBuffer(20), bus: "music", gain: 0.6, priority: 2, essential: true },
  drone: { buffer: fakeBuffer(10), bus: "ambience", gain: 0.4, priority: 1 },
};

const setup = (
  options: {
    context?: FakeAudioContextOptions;
    cues?: Readonly<Partial<Record<string, ResolvedCue>>>;
  } = {},
) => {
  const context = new FakeAudioContext(options.context);
  const cues = options.cues ?? CUES;
  const resolveCue = vi.fn((cue: Cue) => cues[cue] ?? null);
  const createContext = vi.fn(() => context);
  const onUnlockRequired = vi.fn();
  const audio: AudioManager<Cue> = createAudioManager<Cue>({
    resolveCue,
    createContext,
    onUnlockRequired,
  });
  return { audio, context, resolveCue, createContext, onUnlockRequired };
};

/** The bus graph, in construction order: limiter, then master, music, ambience, sfx. */
const graphOf = (context: FakeAudioContext) => {
  const [master, music, ambience, sfx] = context.gains;
  return { limiter: context.compressors[0], master, music, ambience, sfx };
};

/** Voice sources, without the 1-sample unlock primes. */
const voiceSources = (context: FakeAudioContext): FakeAudioBufferSourceNode[] =>
  context.sources.filter((source) => !context.buffers.includes(source.buffer as never));

const voiceGainOf = (source: FakeAudioBufferSourceNode) => source.connections[0] as FakeGainNode;

/** The 1-sample unlock primes. */
const primesOf = (context: FakeAudioContext): FakeAudioBufferSourceNode[] =>
  context.sources.filter((source) => context.buffers.includes(source.buffer as never));

/**
 * Sources the manager still holds a slot for (A1.2): started, and still
 * carrying the manager's `onended`, which it clears only when it releases one.
 */
const heldSources = (context: FakeAudioContext): FakeAudioBufferSourceNode[] =>
  context.sources.filter((source) => source.startedAt !== null && source.onended !== null);

/**
 * The strict cap (A1.2): at most MAX_VOICES held sources, and every source
 * still physically playing is held — no slot is freed while its source plays.
 */
const expectStrictCap = (context: FakeAudioContext) => {
  expect(heldSources(context).length).toBeLessThanOrEqual(MAX_VOICES);
  for (const source of context.sources) {
    if (source.isPlaying()) expect(source.onended).not.toBeNull();
  }
};

const silenceConsole = () => ({
  warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
  error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SSR safety and lazy creation", () => {
  it("touches no browser API when the module is imported, or before unlock", async () => {
    const keys = ["window", "document", "AudioContext", "webkitAudioContext"] as const;
    const saved = keys.map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    const touched: string[] = [];
    for (const key of keys) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get() {
          touched.push(key);
          return undefined;
        },
      });
    }
    try {
      vi.resetModules();
      const fresh = await import("./audio-manager");
      const audio = fresh.createAudioManager<string>({ resolveCue: () => null });
      audio.setBusGain("sfx", 0.5);
      audio.setMuted(true);
      audio.play("anything");
      audio.loop("anything").setGain(1);
      audio.suspend();
      audio.resume();
      audio.dispose();
      expect(touched).toEqual([]);
    } finally {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });

  it("creates no context before the first unlock, whatever is called", () => {
    const { audio, createContext, resolveCue } = setup();
    audio.setBusGain("music", 0.3);
    audio.setMuted(false);
    audio.play("clink");
    const handle = audio.loop("rattle");
    handle.setGain(0.5);
    handle.setRate(1.2);
    handle.setFilter(800);
    handle.stop(1);
    audio.suspend();
    audio.resume();
    expect(createContext).not.toHaveBeenCalled();
    expect(resolveCue).not.toHaveBeenCalled();
  });

  it("creates the context once, inside the first unlock", async () => {
    const { audio, context, createContext } = setup();
    await audio.unlock();
    await audio.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resumeCalls).toBe(1);
    expect(context.state).toBe("running");
  });
});

describe("unlock and the bus graph", () => {
  it("routes music, ambience and sfx through master and the limiter to the output", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const { limiter, master, music, ambience, sfx } = graphOf(context);
    expect(context.compressors).toHaveLength(1);
    expect(routeOf(limiter)).toEqual([context.destination]);
    expect(routeOf(master)).toEqual([limiter, context.destination]);
    for (const bus of [music, ambience, sfx]) {
      expect(routeOf(bus)).toEqual([master, limiter, context.destination]);
      expect(bus.gain.value).toBe(1);
    }
    expect(master.gain.value).toBe(1);
    expect(limiter.threshold.value).toBe(LIMITER_SETTINGS.thresholdDb);
    expect(limiter.knee.value).toBe(LIMITER_SETTINGS.kneeDb);
    expect(limiter.ratio.value).toBe(LIMITER_SETTINGS.ratio);
    expect(limiter.attack.value).toBe(LIMITER_SETTINGS.attackS);
    expect(limiter.release.value).toBe(LIMITER_SETTINGS.releaseS);
  });

  it("primes the output with a 1-sample silent buffer inside the gesture", () => {
    const { audio, context } = setup();
    void audio.unlock(); // not awaited: everything below happened synchronously
    expect(context.resumeCalls).toBe(1);
    expect(context.sources).toHaveLength(1);
    const prime = context.sources[0];
    expect(context.buffers).toEqual([prime.buffer]);
    expect(context.buffers[0]).toMatchObject({ numberOfChannels: 1, length: 1 });
    expect(context.buffers[0].sampleRate).toBe(context.sampleRate);
    expect(prime.connections).toEqual([context.destination]);
    expect(prime.startedAt).toBe(0);
    prime.end();
    expect(prime.connections).toEqual([]);
  });

  it("plays a cue issued right after the gesture, before resume() settles", () => {
    const { audio, context } = setup();
    void audio.unlock();
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);
  });

  it("never rejects, and stays locked, when resume() is refused; the next gesture retries", async () => {
    const { warn } = silenceConsole();
    const { audio, context } = setup({ context: { rejectResume: true } });
    await expect(audio.unlock()).resolves.toBeUndefined();
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);

    await audio.unlock();
    expect(context.resumeCalls).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1); // logged once

    context.rejectResume = false;
    await audio.unlock();
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);
  });
});

describe("unsupported environments", () => {
  it("runs silent when the factory finds no Web Audio, and logs once", async () => {
    const { warn } = silenceConsole();
    const createContext = vi.fn(() => null);
    const audio = createAudioManager<Cue>({ resolveCue: () => CUES.clink ?? null, createContext });
    await expect(audio.unlock()).resolves.toBeUndefined();
    await audio.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => {
      audio.setBusGain("sfx", 0.5);
      audio.setMuted(true);
      audio.play("clink");
      const handle = audio.loop("rattle");
      handle.setGain(1);
      handle.setRate(2);
      handle.setFilter(500);
      handle.stop(0.5);
      audio.suspend();
      audio.resume();
      audio.dispose();
    }).not.toThrow();
  });

  it("runs silent when constructing the context throws", async () => {
    const { warn } = silenceConsole();
    const audio = createAudioManager<Cue>({
      resolveCue: () => null,
      createContext: () => {
        throw new Error("NotSupportedError: too many contexts");
      },
    });
    await expect(audio.unlock()).resolves.toBeUndefined();
    await audio.unlock();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("uses the default browser factory when none is injected (none in Node)", async () => {
    const { warn } = silenceConsole();
    const audio = createAudioManager<Cue>({ resolveCue: () => null });
    await audio.unlock();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("createBrowserAudioContext prefers AudioContext, falls back to webkitAudioContext, else null", () => {
    expect(createBrowserAudioContext()).toBeNull();

    vi.stubGlobal("webkitAudioContext", FakeAudioContext);
    expect(createBrowserAudioContext()).toBeInstanceOf(FakeAudioContext);

    class Standard extends FakeAudioContext {}
    vi.stubGlobal("AudioContext", Standard);
    expect(createBrowserAudioContext()).toBeInstanceOf(Standard);
  });
});

describe("bus gains", () => {
  it("clamps to 0..1 and ignores non-finite values", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const { music, ambience, sfx } = graphOf(context);
    audio.setBusGain("music", 1.7);
    audio.setBusGain("ambience", -0.4);
    audio.setBusGain("sfx", 0.35);
    expect(music.gain.value).toBe(1);
    expect(ambience.gain.value).toBe(0);
    expect(sfx.gain.value).toBe(0.35);

    const before = sfx.gain.automation.length;
    audio.setBusGain("sfx", Number.NaN);
    audio.setBusGain("sfx", Number.POSITIVE_INFINITY);
    expect(sfx.gain.automation).toHaveLength(before);
    expect(sfx.gain.value).toBe(0.35);
  });

  it("ignores an unknown bus", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const counts = context.gains.map((node) => node.gain.automation.length);
    audio.setBusGain("voice" as never, 0.2);
    expect(context.gains.map((node) => node.gain.automation.length)).toEqual(counts);
  });

  it("stores gains set before unlock and applies them when the graph is built", async () => {
    const { audio, context } = setup();
    audio.setBusGain("master", 0.6);
    audio.setBusGain("music", 0.25);
    audio.setBusGain("sfx", 2);
    await audio.unlock();
    const { master, music, ambience, sfx } = graphOf(context);
    expect(master.gain.value).toBe(0.6);
    expect(music.gain.value).toBe(0.25);
    expect(ambience.gain.value).toBe(1);
    expect(sfx.gain.value).toBe(1);
  });

  it("changes a live gain smoothly with setTargetAtTime from the current time", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    context.advance(2.5);
    audio.setBusGain("music", 0.4);
    const { music } = graphOf(context);
    expect(music.gain.automation).toEqual([
      { kind: "cancelScheduledValues", time: 2.5 },
      { kind: "setValueAtTime", value: 1, time: 2.5 },
      { kind: "setTargetAtTime", value: 0.4, time: 2.5, timeConstant: PARAM_TIME_CONSTANT_S },
    ]);
  });
});

describe("mute", () => {
  it("silences master, suspends the context and drops one-shots; unmute restores both", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setBusGain("master", 0.7);
    const { master } = graphOf(context);

    audio.setMuted(true);
    expect(master.gain.value).toBe(0);
    expect(context.suspendCalls).toBe(1);
    expect(context.state).toBe("suspended");
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(0);

    audio.setBusGain("master", 0.5); // remembered, still silent while muted
    expect(master.gain.value).toBe(0);

    audio.setMuted(false);
    expect(master.gain.value).toBe(0.5);
    expect(context.state).toBe("running");
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);
  });

  it("muted before unlock: the gesture still resumes the context, which then suspends", async () => {
    const { audio, context, onUnlockRequired } = setup();
    audio.setMuted(true);
    await audio.unlock();
    expect(context.resumeCalls).toBe(1);
    expect(context.suspendCalls).toBe(1);
    expect(context.state).toBe("suspended");
    expect(graphOf(context).master.gain.value).toBe(0);
    expect(onUnlockRequired).not.toHaveBeenCalled(); // a suspend the manager asked for

    audio.setMuted(false);
    expect(context.state).toBe("running");
  });

  it("keeps loops while muted; they carry on when unmuted", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setMuted(true);
    audio.loop("rattle");
    const [source] = voiceSources(context);
    expect(source.loop).toBe(true);
    expect(source.startedAt).not.toBeNull();
    audio.setMuted(false);
    expect(source.stoppedAt).toBeNull();
  });

  it("repeating the same setting issues no extra resume or suspend", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setMuted(false);
    audio.setMuted(false);
    expect(context.resumeCalls).toBe(1);
    audio.setMuted(true);
    audio.setMuted(true);
    expect(context.suspendCalls).toBe(1);
  });
});

describe("suspend and resume (visibility, pagehide)", () => {
  it("suspend() suspends the context and drops one-shots; resume() resumes it", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.suspend();
    expect(context.state).toBe("suspended");
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(0);
    audio.resume();
    expect(context.state).toBe("running");
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);
  });

  it("resume() does not resume while muted", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setMuted(true);
    audio.suspend();
    audio.resume();
    expect(context.state).toBe("suspended");
    expect(context.resumeCalls).toBe(1); // the unlock only
  });

  it("unmuting while the page is hidden keeps the context suspended", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setMuted(true);
    audio.suspend();
    audio.setMuted(false);
    expect(context.state).toBe("suspended");
    audio.resume();
    expect(context.state).toBe("running");
  });

  it("a gesture while hidden unlocks, then the context stays suspended", async () => {
    const { audio, context } = setup();
    audio.suspend();
    await audio.unlock();
    expect(context.state).toBe("suspended");
    audio.resume();
    expect(context.state).toBe("running");
  });

  it("never resumes a locked context", async () => {
    const { audio, context } = setup({ context: { rejectResume: true } });
    silenceConsole();
    await audio.unlock();
    const calls = context.resumeCalls;
    audio.suspend();
    audio.resume();
    expect(context.resumeCalls).toBe(calls);
  });
});

describe("interruption (iOS) and re-locking", () => {
  it("an interrupted context re-locks, asks for a new gesture, and drops one-shots", async () => {
    const { audio, context, onUnlockRequired } = setup();
    await audio.unlock();
    context.interrupt();
    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(0);

    await audio.unlock(); // the re-armed gesture
    expect(context.state).toBe("running");
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);
    expect(context.sources.length - voiceSources(context).length).toBe(2); // primed twice
  });

  it("a suspend the manager did not ask for also re-locks", async () => {
    const { audio, context, onUnlockRequired } = setup();
    await audio.unlock();
    context.systemSuspend();
    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
    context.systemSuspend(); // no state change, no second notification
    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
  });

  it("accepts a system resume after an interruption", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    context.interrupt();
    context.systemResume();
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);
  });

  it("a system resume after an interruption while muted is suspended again", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setMuted(true);
    context.interrupt();
    context.systemResume();
    expect(context.state).toBe("suspended");
  });

  it("firewalls an onUnlockRequired that throws", async () => {
    const { error } = silenceConsole();
    const context = new FakeAudioContext();
    const audio = createAudioManager<Cue>({
      resolveCue: () => null,
      createContext: () => context,
      onUnlockRequired: () => {
        throw new Error("host bug");
      },
    });
    await audio.unlock();
    expect(() => context.interrupt()).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("one-shots", () => {
  it("routes a voice through its own gain to the cue's bus, at cue gain × play gain", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.play("clink", { gain: 0.5, rate: 1.25 });
    const [source] = voiceSources(context);
    const { sfx, master, limiter } = graphOf(context);
    expect(source.buffer).toBe(CUES.clink?.buffer);
    expect(source.loop).toBe(false);
    expect(source.startedAt).toBe(0);
    expect(source.playbackRate.value).toBe(1.25);
    expect(voiceGainOf(source).gain.value).toBeCloseTo(0.4, 12);
    expect(routeOf(source)).toEqual([
      voiceGainOf(source),
      sfx,
      master,
      limiter,
      context.destination,
    ]);
  });

  it("clamps play gain and rate; ignores non-finite or non-positive options", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.play("boom", { gain: 3, rate: 10 });
    audio.play("boom", { gain: -1, rate: 0.01 });
    audio.play("boom", { gain: Number.NaN, rate: -2 });
    const [loud, quiet, fallback] = voiceSources(context);
    expect(voiceGainOf(loud).gain.value).toBe(1);
    expect(loud.playbackRate.value).toBe(MAX_PLAYBACK_RATE);
    expect(voiceGainOf(quiet).gain.value).toBe(0);
    expect(quiet.playbackRate.value).toBe(MIN_PLAYBACK_RATE);
    expect(voiceGainOf(fallback).gain.value).toBe(1);
    expect(fallback.playbackRate.value).toBe(1);
  });

  it("frees its nodes when playback ends", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.play("clink");
    const [source] = voiceSources(context);
    const gain = voiceGainOf(source);
    source.end();
    expect(source.connections).toEqual([]);
    expect(gain.connections).toEqual([]);
    expect(source.onended).toBeNull();
  });
});

describe("missing and malformed cues", () => {
  it("a cue the resolver does not have stays silent", async () => {
    const { audio, context, resolveCue } = setup();
    await audio.unlock();
    expect(() => audio.play("missing")).not.toThrow();
    const handle = audio.loop("missing");
    expect(() => {
      handle.setGain(1);
      handle.setRate(1);
      handle.setFilter(1000);
      handle.stop(0);
    }).not.toThrow();
    expect(resolveCue).toHaveBeenCalledWith("missing");
    expect(voiceSources(context)).toHaveLength(0);
  });

  it("a resolver that throws is firewalled: the cue stays silent and is logged once", async () => {
    const { error } = silenceConsole();
    const context = new FakeAudioContext();
    const audio = createAudioManager<Cue>({
      resolveCue: () => {
        throw new Error("bank bug");
      },
      createContext: () => context,
    });
    await audio.unlock();
    audio.play("clink");
    audio.play("clink");
    audio.loop("clink");
    expect(voiceSources(context)).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("a cue with an unknown bus, a non-finite gain or a non-finite priority stays silent", async () => {
    const buffer = fakeBuffer(1);
    const { audio, context } = setup({
      cues: {
        clink: { buffer, bus: "master" as never, gain: 1, priority: 1 },
        boom: { buffer, bus: "sfx", gain: Number.NaN, priority: 1 },
        whisper: { buffer, bus: "sfx", gain: 1, priority: Number.POSITIVE_INFINITY },
      },
    });
    await audio.unlock();
    audio.play("clink");
    audio.play("boom");
    audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(0);
  });
});

describe("loops", () => {
  it("loops between the cue's loop points, through a transparent low-pass, on its bus", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.loop("rattle");
    const [source] = voiceSources(context);
    const gain = voiceGainOf(source);
    const [filter] = context.filters;
    const { ambience, master, limiter } = graphOf(context);
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBe(0.05);
    expect(source.loopEnd).toBe(29.95);
    expect(filter.type).toBe("lowpass");
    expect(filter.frequency.value).toBe(context.sampleRate / 2);
    expect(gain.gain.value).toBe(0.5);
    expect(routeOf(source)).toEqual([gain, filter, ambience, master, limiter, context.destination]);
  });

  it("ignores invalid loop points and loops the whole buffer", async () => {
    const { audio, context } = setup({
      cues: {
        rattle: {
          buffer: fakeBuffer(10),
          bus: "ambience",
          gain: 1,
          priority: 1,
          loopStart: 5,
          loopEnd: 2,
        },
      },
    });
    await audio.unlock();
    audio.loop("rattle");
    const [source] = voiceSources(context);
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBe(0);
    expect(source.loopEnd).toBe(0);
  });

  it("the handle changes gain, rate and filter smoothly, clamped", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const handle = audio.loop("rattle");
    const [source] = voiceSources(context);
    const gain = voiceGainOf(source);
    const [filter] = context.filters;
    context.advance(1);

    handle.setGain(0.5);
    expect(gain.gain.lastTarget()).toEqual({
      kind: "setTargetAtTime",
      value: 0.25, // cue gain 0.5 × 0.5
      time: 1,
      timeConstant: PARAM_TIME_CONSTANT_S,
    });
    handle.setGain(4);
    expect(gain.gain.value).toBe(0.5);

    handle.setRate(1.5);
    expect(source.playbackRate.lastTarget()?.value).toBe(1.5);
    handle.setRate(100);
    expect(source.playbackRate.value).toBe(MAX_PLAYBACK_RATE);

    handle.setFilter(900);
    expect(filter.frequency.lastTarget()?.value).toBe(900);
    handle.setFilter(1);
    expect(filter.frequency.value).toBe(MIN_FILTER_HZ);
    handle.setFilter(1e9);
    expect(filter.frequency.value).toBe(context.sampleRate / 2);

    const counts = [gain.gain, source.playbackRate, filter.frequency].map(
      (p) => p.automation.length,
    );
    handle.setGain(Number.NaN);
    handle.setRate(0);
    handle.setFilter(Number.NaN);
    expect(
      [gain.gain, source.playbackRate, filter.frequency].map((p) => p.automation.length),
    ).toEqual(counts);
  });

  it("stop(fadeS) fades out, then stops at the end of the fade; the handle goes inert", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const handle = audio.loop("rattle");
    const [source] = voiceSources(context);
    const gain = voiceGainOf(source);
    context.advance(3);
    handle.stop(2);
    expect(gain.gain.lastTarget()).toEqual({
      kind: "setTargetAtTime",
      value: 0,
      time: 3,
      timeConstant: 2 / FADE_TIME_CONSTANTS,
    });
    expect(source.stoppedAt).toBe(5);

    const count = gain.gain.automation.length;
    handle.setGain(1);
    handle.stop(1);
    expect(gain.gain.automation).toHaveLength(count);
    expect(source.stoppedAt).toBe(5);

    source.end();
    expect(source.connections).toEqual([]);
    expect(context.filters[0].connections).toEqual([]);
  });

  it("stop(0) or an invalid fade stops at once", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.loop("rattle").stop(0);
    audio.loop("rattle").stop(Number.NaN);
    const [first, second] = voiceSources(context);
    expect(first.stoppedAt).toBe(0);
    expect(second.stoppedAt).toBe(0);
  });

  // A1.2 rewrite (owner-approved): until A1.1 this read "a loop requested
  // before unlock is inert, and stays so after unlock". The kept guarantee:
  // nothing plays, and no context exists, before the gesture; a stopped
  // handle never plays. A1.2 adds: the loop waits, and starts at unlock.
  it("a loop requested before unlock waits; it starts at unlock with the settings given meanwhile", async () => {
    const { audio, context, createContext, resolveCue } = setup();
    const handle = audio.loop("rattle");
    handle.setGain(0.5);
    handle.setRate(1.5);
    handle.setFilter(900);
    expect(createContext).not.toHaveBeenCalled();
    expect(resolveCue).not.toHaveBeenCalled();

    await audio.unlock();
    const [source] = voiceSources(context);
    expect(voiceSources(context)).toHaveLength(1);
    expect(source.loop).toBe(true);
    expect(voiceGainOf(source).gain.value).toBe(0.25); // cue gain 0.5 × 0.5
    expect(source.playbackRate.value).toBe(1.5);
    expect(context.filters[0].frequency.value).toBe(900);

    const cancelled = setup();
    const never = cancelled.audio.loop("rattle");
    never.stop(0); // stopped before unlock: it never plays
    await cancelled.audio.unlock();
    expect(voiceSources(cancelled.context)).toHaveLength(0);
  });
});

// The seven voice-cap tests below are A1.2 rewrites (owner-approved): A1's
// single 16-voice pool became three fixed pools under a strict cap. Each
// keeps its original guarantee at pool scale; each notes what it read before.
describe("voice cap: pools and stealing (A1.2)", () => {
  /** Unlocks, then ends the unlock prime, so both tail slots are free. */
  const unlocked = async () => {
    const harness = setup();
    await harness.audio.unlock();
    for (const prime of primesOf(harness.context)) prime.end();
    return harness;
  };

  const fill = async (cue: Cue = "clink") => {
    const harness = await unlocked();
    for (let i = 0; i < ONE_SHOT_VOICES; i++) harness.audio.play(cue);
    return harness;
  };

  it("the cap of 16 is three fixed pools: 6 loops, 8 one-shots, 2 tail slots", () => {
    expect(MAX_VOICES).toBe(16);
    expect([LOOP_VOICES, ONE_SHOT_VOICES, TAIL_VOICES]).toEqual([6, 8, 2]);
    expect(LOOP_VOICES + ONE_SHOT_VOICES + TAIL_VOICES).toBe(MAX_VOICES);
  });

  // Was: "allows MAX_VOICES (16) voices without stealing".
  it("allows ONE_SHOT_VOICES (8) one-shots without stealing", async () => {
    const { context } = await fill();
    const sources = voiceSources(context);
    expect(sources).toHaveLength(ONE_SHOT_VOICES);
    expect(sources.every((source) => source.stoppedAt === null)).toBe(true);
  });

  // Was: "at the cap, a higher-priority voice steals the oldest lowest-priority one".
  it("at a full one-shot pool, a higher-priority one-shot steals the oldest lowest-priority one", async () => {
    const { audio, context } = await fill();
    context.advance(0.05); // the clinks (0.2 s) are still playing
    audio.play("boom");
    const sources = voiceSources(context);
    expect(sources).toHaveLength(ONE_SHOT_VOICES + 1);
    expect(sources[0].stoppedAt).toBe(0.05 + VOICE_STEAL_FADE_S);
    expect(voiceGainOf(sources[0]).gain.lastTarget()?.value).toBe(0);
    expect(sources.slice(1).every((source) => source.stoppedAt === null)).toBe(true);
    expectStrictCap(context);
  });

  // Was: "an equal-priority voice steals the oldest".
  it("an equal-priority one-shot steals the oldest", async () => {
    const { audio, context } = await fill();
    audio.play("clink");
    const sources = voiceSources(context);
    expect(sources).toHaveLength(ONE_SHOT_VOICES + 1);
    expect(sources[0].stoppedAt).not.toBeNull();
    expect(sources[1].stoppedAt).toBeNull();
  });

  // Was: "the lowest priority goes first, whatever its age" (16-voice fill).
  it("the lowest priority goes first, whatever its age", async () => {
    const { audio, context } = await unlocked();
    audio.play("boom");
    audio.play("whisper");
    for (let i = 0; i < ONE_SHOT_VOICES - 2; i++) audio.play("clink");
    audio.play("boom");
    const sources = voiceSources(context);
    expect(sources[1].stoppedAt).not.toBeNull(); // the whisper
    expect(sources.filter((source) => source.stoppedAt !== null)).toHaveLength(1);
  });

  // Was: "a newcomer below every playing voice is dropped" — including a
  // loop, which got an inert handle. One-shots are still dropped; a loop at a
  // full loop pool now waits, and starts once a loop slot frees.
  it("a one-shot below every playing one-shot is dropped; a loop at a full loop pool waits", async () => {
    const { audio, context } = await fill();
    audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES);
    expect(voiceSources(context).every((source) => source.stoppedAt === null)).toBe(true);

    const loops = Array.from({ length: LOOP_VOICES }, () => audio.loop("rattle"));
    const late = audio.loop("drone");
    late.setGain(0.5);
    const loopSources = () => voiceSources(context).filter((source) => source.loop);
    expect(loopSources()).toHaveLength(LOOP_VOICES);
    loops[0].stop(0);
    loopSources()[0].end();
    expect(loopSources()).toHaveLength(LOOP_VOICES + 1);
    const lateSource = loopSources()[LOOP_VOICES];
    expect(lateSource.buffer).toBe(CUES.drone?.buffer);
    expect(voiceGainOf(lateSource).gain.value).toBe(0.2); // cue gain 0.4 × 0.5
  });

  // Was: "ended and stopping voices free their slots". An ended voice still
  // frees its slot at once; a stopping or stolen voice no longer does: it
  // keeps its slot until it is known to have ended (strict cap).
  it("an ended voice frees its slot at once; a stopping or stolen voice keeps it until it has ended", async () => {
    const { audio, context } = await fill();
    voiceSources(context)[3].end();
    audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES + 1);
    expect(voiceSources(context).every((source) => source.stoppedAt === null)).toBe(true);

    const harness = await unlocked();
    const loops = Array.from({ length: LOOP_VOICES }, () => harness.audio.loop("rattle"));
    loops[0].stop(5); // still fading out
    harness.audio.loop("drone");
    const loopSources = voiceSources(harness.context).filter((source) => source.loop);
    expect(loopSources).toHaveLength(LOOP_VOICES); // the drone waits
    expect(loopSources.filter((source) => source.stoppedAt !== null)).toEqual([loopSources[0]]);
    expectStrictCap(harness.context);
  });

  // Was: "a stolen loop's handle goes inert" (16 one-shots stole a
  // priority-0 loop). One-shots can no longer touch a loop at all; a loop
  // preempted by an essential loop is covered under "essential loops".
  it("one-shots never steal a loop, whatever its priority", async () => {
    const harness = setup({
      cues: { ...CUES, rattle: { ...(CUES.rattle as ResolvedCue), priority: 0 } },
    });
    await harness.audio.unlock();
    const handle = harness.audio.loop("rattle");
    for (let i = 0; i < MAX_VOICES; i++) harness.audio.play("boom");
    const [loopSource] = voiceSources(harness.context);
    expect(loopSource.loop).toBe(true);
    expect(loopSource.stoppedAt).toBeNull();
    const gain = voiceGainOf(loopSource);
    const count = gain.gain.automation.length;
    handle.setGain(1);
    expect(gain.gain.automation.length).toBeGreaterThan(count); // still controlled
    expectStrictCap(harness.context);
  });
});

describe("strict cap: every live source counts (A1.2)", () => {
  it("a concurrent SFX burst over playing loops never exceeds the cap", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    for (let i = 0; i < LOOP_VOICES; i++) audio.loop(i % 2 ? "bed" : "rattle");
    const order: Cue[] = ["clink", "boom", "whisper"];
    for (let i = 0; i < 100; i++) {
      audio.play(order[i % 3]);
      expectStrictCap(context);
      if (i % 10 === 0) context.advance(0.01);
    }
    expect(heldSources(context).length).toBe(MAX_VOICES);
    expect(
      voiceSources(context).filter((source) => source.loop && source.stoppedAt === null),
    ).toHaveLength(LOOP_VOICES);
  });

  it("calling stop() is not proof: a stolen voice keeps its tail slot, so a full tail blocks the next steal", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    for (const prime of primesOf(context)) prime.end();
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("clink");
    audio.play("boom");
    audio.play("boom"); // two steals: the tail is full
    expect(voiceSources(context).filter((source) => source.stoppedAt !== null)).toHaveLength(2);
    audio.play("boom"); // no tail slot: dropped, nothing else is stopped
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES + 2);
    expect(heldSources(context)).toHaveLength(ONE_SHOT_VOICES + TAIL_VOICES);

    voiceSources(context)[0].end(); // the first stolen voice reports its end
    audio.play("boom");
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES + 3);
    expectStrictCap(context);
  });

  it("a lost onended: the clock frees the slot VOICE_RECLAIM_GRACE_S after the scheduled end, never before", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    for (const prime of primesOf(context)) prime.end();
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("clink"); // 0.2 s each; onended withheld
    const clinks = voiceSources(context);

    context.advance(0.2 + VOICE_RECLAIM_GRACE_S - 0.01);
    audio.play("whisper"); // below every clink: dropped, the slots are still held
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES);
    expect(heldSources(context)).toHaveLength(ONE_SHOT_VOICES);

    context.advance(0.02); // past 0.2 s + grace
    audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES + 1);
    expect(heldSources(context)).toHaveLength(1);
    for (const clink of clinks) expect(clink.connections).toEqual([]);

    clinks[0].end(); // the delayed onended, after the clock reclaimed it: no effect
    expect(heldSources(context)).toHaveLength(1);
    expectStrictCap(context);
  });

  it("a stopped loop without onended is reclaimed by the clock after its fade, and a waiting loop starts", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const loops = Array.from({ length: LOOP_VOICES }, () => audio.loop("rattle"));
    const waiting = audio.loop("drone");
    loops[0].stop(1);
    context.advance(1 + VOICE_RECLAIM_GRACE_S / 2);
    waiting.setGain(1); // any manager call sweeps; still within the grace
    expect(voiceSources(context).filter((source) => source.loop)).toHaveLength(LOOP_VOICES);
    context.advance(VOICE_RECLAIM_GRACE_S);
    waiting.setGain(1);
    const loopSources = voiceSources(context).filter((source) => source.loop);
    expect(loopSources).toHaveLength(LOOP_VOICES + 1);
    expect(loopSources.at(-1)?.buffer).toBe(CUES.drone?.buffer);
    expectStrictCap(context);
  });

  it("without clock progress nothing is reclaimed, however often the manager is called", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    for (const prime of primesOf(context)) prime.end();
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("boom");
    for (let i = 0; i < 50; i++) audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(ONE_SHOT_VOICES);
    expect(heldSources(context)).toHaveLength(ONE_SHOT_VOICES);
  });

  it("the unlock prime holds a tail slot; with the tail full a gesture skips the prime and still resumes", async () => {
    silenceConsole();
    const { audio, context } = setup({ context: { rejectResume: true } });
    await audio.unlock();
    await audio.unlock();
    await audio.unlock();
    expect(context.resumeCalls).toBe(3);
    expect(primesOf(context)).toHaveLength(TAIL_VOICES); // the third gesture skipped it
    expect(heldSources(context)).toHaveLength(TAIL_VOICES);

    context.rejectResume = false;
    await audio.unlock();
    expect(context.resumeCalls).toBe(4);
    expect(context.state).toBe("running");
    audio.play("clink");
    expect(voiceSources(context)).toHaveLength(1);

    context.advance(1 / context.sampleRate + VOICE_RECLAIM_GRACE_S); // the primes have played
    audio.play("clink");
    expect(heldSources(context)).toHaveLength(2); // the primes are released; two clinks remain
    expectStrictCap(context);
  });

  it("a re-unlock first reclaims tail sources that have ended without onended, so it still primes", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    for (const prime of primesOf(context)) prime.end();
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("whisper");
    audio.play("boom");
    audio.play("boom"); // the tail holds two stolen whispers; their onended is lost
    context.advance(VOICE_STEAL_FADE_S + VOICE_RECLAIM_GRACE_S);
    context.interrupt();
    await audio.unlock(); // the re-armed gesture
    expect(primesOf(context)).toHaveLength(2);
    expect(context.state).toBe("running");
    expectStrictCap(context);
  });
});

describe("pending loops (A1.2)", () => {
  it("a waiting loop starts when its cue becomes resolvable", async () => {
    let bed: ResolvedCue | null = null;
    const context = new FakeAudioContext();
    const audio = createAudioManager<"bed">({
      resolveCue: () => bed,
      createContext: () => context,
    });
    await audio.unlock();
    const handle = audio.loop("bed");
    handle.setFilter(500);
    expect(voiceSources(context)).toHaveLength(0);
    bed = CUES.bed ?? null; // the sound bank finished decoding
    handle.setFilter(500); // the next manager call starts it
    expect(voiceSources(context)).toHaveLength(1);
    expect(context.filters[0].frequency.value).toBe(500);
  });

  it("waiting loops start in a fixed order: essential first, then higher priority, then the earlier request", async () => {
    const cues: Partial<Record<string, ResolvedCue>> = {
      ...CUES,
      clink: { buffer: fakeBuffer(1), bus: "sfx", gain: 1, priority: 9 }, // a non-essential loop, high priority
      whisper: { buffer: fakeBuffer(1), bus: "ambience", gain: 1, priority: 0, essential: true },
    };
    const { audio, context } = setup({ cues });
    await audio.unlock();
    const blockers = Array.from({ length: LOOP_VOICES }, () => audio.loop("bed")); // essential: never preempted
    audio.loop("drone"); // non-essential, priority 1
    audio.loop("clink"); // non-essential, priority 9
    audio.loop("whisper"); // essential, priority 0
    audio.loop("drone"); // non-essential, priority 1, later
    const started: unknown[] = [];
    for (const blocker of blockers.slice(0, 4)) {
      const before = voiceSources(context).length;
      blocker.stop(0);
      voiceSources(context)
        .filter((source) => source.stoppedAt !== null && !source.ended)
        .forEach((source) => source.end());
      const fresh = voiceSources(context).slice(before);
      expect(fresh).toHaveLength(1); // exactly the next loop in order, and no preemption churn
      started.push(fresh[0].buffer);
    }
    expect(voiceSources(context).filter((source) => source.stoppedAt === null)).toHaveLength(
      LOOP_VOICES,
    );
    expect(started).toEqual([
      cues.whisper?.buffer,
      cues.clink?.buffer,
      cues.drone?.buffer,
      cues.drone?.buffer,
    ]);
  });

  it("stop() cancels a waiting loop: it never starts, before or after unlock", async () => {
    const { audio, context } = setup();
    const before = audio.loop("rattle");
    before.stop(1);
    await audio.unlock();
    const loops = Array.from({ length: LOOP_VOICES }, () => audio.loop("rattle"));
    const after = audio.loop("drone");
    after.stop(0);
    loops[0].stop(0);
    voiceSources(context)[0].end();
    expect(voiceSources(context).some((source) => source.buffer === CUES.drone?.buffer)).toBe(
      false,
    );
    expect(voiceSources(context)).toHaveLength(LOOP_VOICES);
    after.setGain(1);
    expect(voiceSources(context)).toHaveLength(LOOP_VOICES);
  });

  it("never creates a duplicate source: repeated calls, unlocks and state changes start a waiting loop once", async () => {
    const { audio, context } = setup();
    const handle = audio.loop("rattle");
    await audio.unlock();
    await audio.unlock();
    for (let i = 0; i < 20; i++) {
      handle.setGain(i / 20);
      handle.setRate(1 + i / 40);
      audio.setMuted(i % 2 === 0);
      audio.suspend();
      audio.resume();
    }
    context.interrupt();
    await audio.unlock();
    context.systemResume();
    expect(voiceSources(context)).toHaveLength(1);
    expectStrictCap(context);
  });

  it("a loop requested while interrupted starts at the re-unlock", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    context.interrupt();
    const handle = audio.loop("bed");
    expect(voiceSources(context)).toHaveLength(0);
    await audio.unlock();
    expect(voiceSources(context)).toHaveLength(1);
    handle.stop(0);
    expect(voiceSources(context)[0].stoppedAt).toBe(0);
  });

  it("when Web Audio is unavailable, waiting loops are cancelled and later loops are inert", async () => {
    silenceConsole();
    const audio = createAudioManager<Cue>({
      resolveCue: () => CUES.rattle ?? null,
      createContext: () => null,
    });
    const waiting = audio.loop("rattle");
    await audio.unlock();
    expect(() => {
      waiting.setGain(1);
      waiting.stop(0);
      audio.loop("rattle").setGain(1);
    }).not.toThrow();
  });
});

describe("essential loops (A1.2)", () => {
  const fullOf = async (cue: Cue) => {
    const harness = setup();
    await harness.audio.unlock();
    for (const prime of primesOf(harness.context)) prime.end();
    const handles: LoopHandle[] = [];
    for (let i = 0; i < LOOP_VOICES; i++) handles.push(harness.audio.loop(cue));
    return { ...harness, handles };
  };

  it("at a full loop pool an essential loop preempts the weakest non-essential loop, which waits and restarts after its old voice has ended", async () => {
    const { audio, context, handles } = await fullOf("drone");
    handles[0].setGain(0.5);
    context.advance(0.5);
    audio.loop("bed");
    const sources = voiceSources(context);
    expect(sources).toHaveLength(LOOP_VOICES + 1);
    const old = sources[0];
    expect(old.stoppedAt).toBe(0.5 + VOICE_STEAL_FADE_S); // the oldest drone fades out in the tail
    expect(sources.at(-1)?.buffer).toBe(CUES.bed?.buffer);

    const automations = voiceGainOf(old).gain.automation.length;
    handles[0].setGain(0.8); // the old voice is no longer controlled
    expect(voiceGainOf(old).gain.automation).toHaveLength(automations);

    handles[1].stop(0);
    voiceSources(context)[1].end(); // a loop slot frees while the old voice still fades
    expect(voiceSources(context)).toHaveLength(LOOP_VOICES + 1); // no duplicate for handle 0
    old.end();
    const restarted = voiceSources(context).at(-1);
    expect(voiceSources(context)).toHaveLength(LOOP_VOICES + 2);
    expect(restarted?.buffer).toBe(CUES.drone?.buffer);
    expect(voiceGainOf(restarted as FakeAudioBufferSourceNode).gain.value).toBeCloseTo(0.32, 12); // 0.4 × 0.8
    expectStrictCap(context);
  });

  it("an essential loop is never preempted: an essential newcomer at a pool of essential loops waits", async () => {
    const { audio, context } = await fullOf("bed");
    audio.loop("bed");
    expect(voiceSources(context)).toHaveLength(LOOP_VOICES);
    expect(voiceSources(context).every((source) => source.stoppedAt === null)).toBe(true);
  });

  it("a non-essential loop never preempts, whatever its priority", async () => {
    const harness = setup({
      cues: { ...CUES, rattle: { ...(CUES.rattle as ResolvedCue), priority: 100 } },
    });
    await harness.audio.unlock();
    for (let i = 0; i < LOOP_VOICES; i++) harness.audio.loop("drone");
    harness.audio.loop("rattle");
    expect(voiceSources(harness.context)).toHaveLength(LOOP_VOICES);
    expect(voiceSources(harness.context).every((source) => source.stoppedAt === null)).toBe(true);
  });

  it("preemption needs a free tail slot; otherwise the essential loop waits until one frees", async () => {
    const { audio, context } = await fullOf("drone");
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("clink");
    audio.play("boom");
    audio.play("boom"); // the tail is full of stolen clinks
    audio.loop("bed");
    expect(voiceSources(context).some((source) => source.buffer === CUES.bed?.buffer)).toBe(false);
    voiceSources(context)
      .filter((source) => !source.loop && source.stoppedAt !== null)[0]
      .end(); // a tail slot frees
    expect(voiceSources(context).some((source) => source.buffer === CUES.bed?.buffer)).toBe(true);
    expectStrictCap(context);
  });
});

describe("crossfades and rapid state changes (A1.2)", () => {
  it("a crossfade keeps the old loop's slot until it has ended; rapid crossfades wait instead of exceeding the pool", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    let current = audio.loop("bed");
    for (let i = 0; i < 10; i++) {
      current.stop(1.5);
      current = audio.loop(i % 2 ? "bed" : "drone");
      expectStrictCap(context);
    }
    expect(voiceSources(context).filter((source) => source.loop)).toHaveLength(LOOP_VOICES);
    context.advance(1.5 + VOICE_RECLAIM_GRACE_S);
    current.setGain(1); // the faded loops are reclaimed; the waiting ones start
    const live = voiceSources(context).filter((source) => source.loop && source.stoppedAt === null);
    expect(live.length).toBeGreaterThanOrEqual(1);
    expect(heldSources(context).length).toBeLessThanOrEqual(LOOP_VOICES + TAIL_VOICES);
    expectStrictCap(context);
  });

  it("rapid mute, suspend, interruption and unlock changes keep the run state and the cap consistent", async () => {
    const { audio, context, onUnlockRequired } = setup();
    await audio.unlock();
    const bed = audio.loop("bed");
    for (let i = 0; i < 12; i++) {
      audio.setMuted(i % 3 === 0);
      if (i % 4 === 0) audio.suspend();
      else audio.resume();
      audio.play("clink");
      if (i === 5) context.interrupt();
      if (i === 7) await audio.unlock();
      context.advance(0.05);
      expectStrictCap(context);
    }
    audio.setMuted(false);
    audio.resume();
    expect(context.state).toBe("running");
    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
    expect(voiceSources(context).filter((source) => source.loop)).toHaveLength(1);
    bed.stop(0);
  });

  it("admission is deterministic: the same call sequence gives the same voices", async () => {
    const run = async () => {
      const { audio, context } = setup();
      await audio.unlock();
      const script: Array<() => void> = [
        () => audio.loop("drone"),
        () => audio.play("clink"),
        () => audio.play("whisper"),
        () => audio.loop("bed"),
        () => audio.play("boom"),
      ];
      for (let i = 0; i < 60; i++) {
        script[i % script.length]();
        if (i % 7 === 0) context.advance(0.03);
      }
      return context.sources.map((source) => [source.buffer, source.startedAt, source.stoppedAt]);
    };
    expect(await run()).toEqual(await run());
  });
});

describe("dispose", () => {
  it("stops every voice, frees the graph, closes the context and unsubscribes", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.play("clink");
    audio.loop("rattle");
    expect(context.stateListenerCount).toBe(1);
    audio.dispose();
    for (const source of voiceSources(context)) {
      expect(source.stoppedAt).not.toBeNull();
      expect(source.connections).toEqual([]);
    }
    const { limiter, master, music, ambience, sfx } = graphOf(context);
    for (const node of [limiter, master, music, ambience, sfx])
      expect(node.connections).toEqual([]);
    expect(context.closeCalls).toBe(1);
    expect(context.state).toBe("closed");
    expect(context.stateListenerCount).toBe(0);
  });

  it("makes every later call a no-op, and is idempotent", async () => {
    const { audio, context, createContext } = setup();
    await audio.unlock();
    const handle = audio.loop("rattle");
    audio.dispose();
    audio.dispose();
    expect(context.closeCalls).toBe(1);

    const sources = context.sources.length;
    const automations = context.gains.map((node) => node.gain.automation.length);
    await audio.unlock();
    audio.play("clink");
    audio.loop("rattle");
    handle.setGain(1);
    audio.setBusGain("sfx", 0.2);
    audio.setMuted(true);
    audio.suspend();
    audio.resume();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(sources);
    expect(context.gains.map((node) => node.gain.automation.length)).toEqual(automations);
    expect(context.resumeCalls).toBe(1);
    expect(context.suspendCalls).toBe(0);
  });

  it("before unlock: nothing to close, and no context is ever created", async () => {
    const { audio, createContext } = setup();
    audio.dispose();
    await audio.unlock();
    expect(createContext).not.toHaveBeenCalled();
  });

  it("releases every pool and cancels waiting loops; late onended calls and old handles do nothing (A1.2)", async () => {
    const { audio, context } = setup();
    const early = audio.loop("bed"); // waiting for unlock
    await audio.unlock();
    const loops = Array.from({ length: LOOP_VOICES }, () => audio.loop("drone"));
    const waiting = audio.loop("drone"); // waiting for a loop slot
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("clink");
    audio.play("boom"); // a stolen clink fades in the tail
    loops[1].stop(2); // a stopping loop
    const before = context.sources.length;

    audio.dispose();
    expect(heldSources(context)).toHaveLength(0);
    for (const source of context.sources) {
      expect(source.stoppedAt).not.toBeNull();
      expect(source.connections).toEqual([]);
    }
    expect(() => {
      for (const source of context.sources) source.end();
      early.setGain(1);
      waiting.setRate(2);
      loops[0].stop(0);
    }).not.toThrow();
    expect(context.sources).toHaveLength(before);
  });
});

// ----- decode (A1.1, docs/08 §7) -----

/** Lets every pending promise callback and timer of the current turn run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Watches a decode promise without awaiting it. A rejection leaves it unsettled, which fails the test. */
const track = <T>(promise: Promise<T>) => {
  const state: { settled: boolean; value: T | undefined; calls: number } = {
    settled: false,
    value: undefined,
    calls: 0,
  };
  promise.then(
    (value) => {
      state.settled = true;
      state.value = value;
      state.calls++;
    },
    () => {},
  );
  return state;
};

const bytes = (size = 16) => new ArrayBuffer(size);

describe("decode: before the first unlock", () => {
  it("waits for the context and never creates one", async () => {
    const { audio, context, createContext } = setup();
    const result = track(audio.decode(bytes()));
    await flush();
    expect(result.settled).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    expect(context.decodes).toHaveLength(0);
  });

  it("starts inside unlock, after the resume, with the caller's bytes", async () => {
    const { audio, context } = setup();
    const data = bytes();
    const result = track(audio.decode(data));
    let resumesAtDecode = -1;
    const decodeAudioData = context.decodeAudioData.bind(context);
    vi.spyOn(context, "decodeAudioData").mockImplementation((...args) => {
      resumesAtDecode = context.resumeCalls;
      return decodeAudioData(...args);
    });
    const unlocked = audio.unlock();
    expect(context.decodes).toHaveLength(1);
    expect(context.decodes[0].data).toBe(data);
    expect(resumesAtDecode).toBe(1);
    await unlocked;

    const buffer = fakeBuffer(2);
    context.decodes[0].succeed(buffer);
    await flush();
    expect(result.value).toBe(buffer);
  });

  it("starts every waiting request in request order; each settles with its own buffer", async () => {
    const { audio, context } = setup();
    const first = bytes(8);
    const second = bytes(32);
    const a = track(audio.decode(first));
    const b = track(audio.decode(second));
    await audio.unlock();
    expect(context.decodes.map((request) => request.data)).toEqual([first, second]);
    expect(context.decodes[0].data).toBe(first);
    expect(context.decodes[1].data).toBe(second);

    const bufferB = fakeBuffer(3);
    const bufferA = fakeBuffer(1);
    context.decodes[1].succeed(bufferB);
    await flush();
    expect(b.value).toBe(bufferB);
    expect(a.settled).toBe(false);
    context.decodes[0].succeed(bufferA);
    await flush();
    expect(a.value).toBe(bufferA);
  });

  it("decodes even when the unlock's resume is refused (the context exists)", async () => {
    const { warn } = silenceConsole();
    const { audio, context } = setup({ context: { rejectResume: true } });
    const result = track(audio.decode(bytes()));
    await audio.unlock();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(context.decodes).toHaveLength(1);
    const buffer = fakeBuffer(1);
    context.decodes[0].succeed(buffer);
    await flush();
    expect(result.value).toBe(buffer);
  });

  it("hands a request to the decoder once, even across a re-unlock", async () => {
    const { audio, context } = setup();
    void audio.decode(bytes());
    await audio.unlock();
    context.interrupt();
    await audio.unlock();
    expect(context.decodes).toHaveLength(1);
  });

  it("touches no browser API before unlock (SSR)", async () => {
    const keys = ["window", "document", "AudioContext", "webkitAudioContext"] as const;
    const saved = keys.map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    const touched: string[] = [];
    for (const key of keys) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get() {
          touched.push(key);
          return undefined;
        },
      });
    }
    try {
      const audio = createAudioManager<string>({ resolveCue: () => null });
      const result = track(audio.decode(bytes()));
      await flush();
      expect(touched).toEqual([]);
      expect(result.settled).toBe(false);
      audio.dispose();
      await flush();
      expect(result.settled).toBe(true);
      expect(result.value).toBeNull();
    } finally {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });
});

describe("decode: after unlock", () => {
  it("starts at once with the single context and resolves the buffer", async () => {
    const { audio, context, createContext } = setup();
    await audio.unlock();
    const result = track(audio.decode(bytes()));
    expect(context.decodes).toHaveLength(1);
    const buffer = fakeBuffer(4);
    context.decodes[0].succeed(buffer);
    await flush();
    expect(result.value).toBe(buffer);
    expect(result.calls).toBe(1);
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("decodes while muted, host-suspended or interrupted", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.setMuted(true);
    audio.suspend();
    context.interrupt();
    const result = track(audio.decode(bytes()));
    const buffer = fakeBuffer(1);
    context.decodes[0].succeed(buffer);
    await flush();
    expect(result.value).toBe(buffer);
  });

  it("a decoded buffer plays through the cue resolver", async () => {
    const context = new FakeAudioContext();
    let decoded: ResolvedCue | null = null;
    const audio = createAudioManager<"splash">({
      resolveCue: () => decoded,
      createContext: () => context,
    });
    await audio.unlock();
    const pending = audio.decode(bytes());
    const buffer = fakeBuffer(0.4);
    context.decodes[0].succeed(buffer);
    const result = await pending;
    expect(result).toBe(buffer);
    if (!result) throw new Error("expected a decoded buffer");
    decoded = { buffer: result, bus: "sfx", gain: 1, priority: 1 };
    audio.play("splash");
    const voices = voiceSources(context);
    expect(voices).toHaveLength(1);
    expect(voices[0].buffer).toBe(buffer);
    expect(routeOf(voices[0]).at(-1)).toBe(context.destination);
  });

  it("does not change playback state: no voice, no resume, no gain change", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const sources = context.sources.length;
    const automations = context.gains.map((node) => node.gain.automation.length);
    void audio.decode(bytes());
    context.decodes[0].succeed();
    await flush();
    expect(context.sources).toHaveLength(sources);
    expect(context.gains.map((node) => node.gain.automation.length)).toEqual(automations);
    expect(context.resumeCalls).toBe(1);
    expect(context.suspendCalls).toBe(0);
  });
});

describe("decode: unsupported environments", () => {
  it("settles waiting requests with null when the factory finds no Web Audio", async () => {
    const { warn } = silenceConsole();
    const createContext = vi.fn(() => null);
    const audio = createAudioManager<Cue>({ resolveCue: () => null, createContext });
    const a = track(audio.decode(bytes()));
    const b = track(audio.decode(bytes()));
    await audio.unlock();
    await flush();
    expect(a.settled && b.settled).toBe(true);
    expect(a.value).toBeNull();
    expect(b.value).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    await expect(audio.decode(bytes())).resolves.toBeNull();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("settles waiting requests with null when constructing the context throws", async () => {
    silenceConsole();
    const audio = createAudioManager<Cue>({
      resolveCue: () => null,
      createContext: () => {
        throw new Error("NotSupportedError: too many contexts");
      },
    });
    const result = track(audio.decode(bytes()));
    await audio.unlock();
    await flush();
    expect(result.settled).toBe(true);
    expect(result.value).toBeNull();
    await expect(audio.decode(bytes())).resolves.toBeNull();
  });

  it("with the default factory and no Web Audio (Node), resolves null at unlock", async () => {
    silenceConsole();
    const audio = createAudioManager<Cue>({ resolveCue: () => null });
    const result = track(audio.decode(bytes()));
    await audio.unlock();
    await flush();
    expect(result.settled).toBe(true);
    expect(result.value).toBeNull();
  });

  it("resolves null when the context has no decodeAudioData", async () => {
    const { audio, context } = setup();
    Object.defineProperty(context, "decodeAudioData", { value: undefined });
    const waiting = track(audio.decode(bytes()));
    await audio.unlock();
    await flush();
    expect(waiting.settled).toBe(true);
    expect(waiting.value).toBeNull();
    await expect(audio.decode(bytes())).resolves.toBeNull();
  });
});

describe("decode: dispose", () => {
  it("settles a request still waiting for unlock with null, and never creates a context", async () => {
    const { audio, context, createContext } = setup();
    const result = track(audio.decode(bytes()));
    audio.dispose();
    await flush();
    expect(result.settled).toBe(true);
    expect(result.value).toBeNull();
    await audio.unlock();
    expect(createContext).not.toHaveBeenCalled();
    expect(context.decodes).toHaveLength(0);
  });

  it("settles an in-flight request with null at once, and ignores the late result", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const ok = track(audio.decode(bytes()));
    const bad = track(audio.decode(bytes()));
    audio.dispose();
    await flush();
    expect(ok.settled && bad.settled).toBe(true);
    expect(ok.value).toBeNull();
    expect(bad.value).toBeNull();

    expect(() => {
      context.decodes[0].succeed(fakeBuffer(1));
      context.decodes[1].fail();
    }).not.toThrow();
    await flush();
    expect(ok.value).toBeNull();
    expect(ok.calls).toBe(1);
    expect(bad.value).toBeNull();
    expect(bad.calls).toBe(1);
  });

  it("resolves null after dispose without calling the decoder", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    audio.dispose();
    await expect(audio.decode(bytes())).resolves.toBeNull();
    expect(context.decodes).toHaveLength(0);
  });

  it("a request settled before dispose keeps its buffer", async () => {
    const { audio, context } = setup();
    await audio.unlock();
    const pending = audio.decode(bytes());
    const buffer = fakeBuffer(1);
    context.decodes[0].succeed(buffer);
    await expect(pending).resolves.toBe(buffer);
    audio.dispose();
    await expect(pending).resolves.toBe(buffer);
  });
});

describe("decode: errors", () => {
  it("resolves null on a decoding error, and logs nothing (the caller owns its failure policy)", async () => {
    const { warn, error } = silenceConsole();
    const { audio, context } = setup();
    await audio.unlock();
    const result = track(audio.decode(bytes()));
    context.decodes[0].fail();
    await flush();
    expect(result.settled).toBe(true);
    expect(result.value).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("resolves null when decodeAudioData throws synchronously", async () => {
    const { audio } = setup({ context: { throwOnDecode: true } });
    await audio.unlock();
    await expect(audio.decode(bytes())).resolves.toBeNull();
  });

  it("a waiting request whose decoder throws at unlock resolves null; unlock still succeeds", async () => {
    const { audio, context } = setup({ context: { throwOnDecode: true } });
    const result = track(audio.decode(bytes()));
    await expect(audio.unlock()).resolves.toBeUndefined();
    await flush();
    expect(result.settled).toBe(true);
    expect(result.value).toBeNull();
    expect(context.state).toBe("running");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a non-object", 42],
    ["an object without a duration", {}],
    ["a NaN duration", { duration: Number.NaN }],
    ["an infinite duration", { duration: Number.POSITIVE_INFINITY }],
    ["a negative duration", { duration: -1 }],
  ])("resolves null when the decoder reports %s", async (_label, value) => {
    const { audio, context } = setup();
    await audio.unlock();
    const pending = audio.decode(bytes());
    context.decodes[0].callSuccess(value);
    context.decodes[0].resolve(value);
    await expect(pending).resolves.toBeNull();
  });
});

describe("decode: decodeAudioData API forms", () => {
  it("callback-only (older WebKit): no promise is returned; the success callback settles", async () => {
    const { audio, context } = setup({ context: { decodeStyle: "callback" } });
    await audio.unlock();
    const pending = audio.decode(bytes());
    expect(context.decodes[0].promise).toBeUndefined();
    const buffer = fakeBuffer(1);
    context.decodes[0].succeed(buffer);
    await expect(pending).resolves.toBe(buffer);
  });

  it("callback-only: the error callback settles with null", async () => {
    const { audio, context } = setup({ context: { decodeStyle: "callback" } });
    await audio.unlock();
    const pending = audio.decode(bytes());
    context.decodes[0].fail();
    await expect(pending).resolves.toBeNull();
  });

  it("promise-based, callbacks ignored: the resolved promise settles", async () => {
    const { audio, context } = setup({ context: { decodeStyle: "promise" } });
    await audio.unlock();
    const pending = audio.decode(bytes());
    const buffer = fakeBuffer(1);
    context.decodes[0].succeed(buffer);
    await expect(pending).resolves.toBe(buffer);
  });

  it("promise-based: a rejected promise settles with null", async () => {
    const { audio, context } = setup({ context: { decodeStyle: "promise" } });
    await audio.unlock();
    const pending = audio.decode(bytes());
    context.decodes[0].fail();
    await expect(pending).resolves.toBeNull();
  });

  it("both forms (current browsers): callbacks and promise report the same buffer, settled once", async () => {
    const { audio, context } = setup({ context: { decodeStyle: "both" } });
    await audio.unlock();
    const result = track(audio.decode(bytes()));
    const buffer = fakeBuffer(1);
    context.decodes[0].succeed(buffer);
    await flush();
    expect(result.value).toBe(buffer);
    expect(result.calls).toBe(1);
  });
});

describe("decode: exactly-once settlement", () => {
  const started = async () => {
    const harness = setup({ context: { decodeStyle: "both" } });
    await harness.audio.unlock();
    const result = track(harness.audio.decode(bytes()));
    return { ...harness, result, request: harness.context.decodes[0] };
  };

  it("the success callback wins over a later, different promise result", async () => {
    const { result, request } = await started();
    const first = fakeBuffer(1);
    request.callSuccess(first);
    request.resolve(fakeBuffer(2));
    await flush();
    expect(result.value).toBe(first);
    expect(result.calls).toBe(1);
  });

  it("an error callback wins over a later promise success", async () => {
    const { result, request } = await started();
    request.callError(new Error("EncodingError"));
    request.resolve(fakeBuffer(2));
    await flush();
    expect(result.settled).toBe(true);
    expect(result.value).toBeNull();
    expect(result.calls).toBe(1);
  });

  it("a resolved promise wins over a later error callback", async () => {
    const { result, request } = await started();
    const buffer = fakeBuffer(1);
    request.resolve(buffer);
    await flush();
    request.callError(new Error("late"));
    await flush();
    expect(result.value).toBe(buffer);
    expect(result.calls).toBe(1);
  });

  it("a success callback wins over a later promise rejection", async () => {
    const { result, request } = await started();
    const buffer = fakeBuffer(1);
    request.callSuccess(buffer);
    request.reject(new Error("late"));
    await flush();
    expect(result.value).toBe(buffer);
    expect(result.calls).toBe(1);
  });

  it("a callback fired twice keeps the first buffer", async () => {
    const { result, request } = await started();
    const first = fakeBuffer(1);
    request.callSuccess(first);
    request.callSuccess(fakeBuffer(2));
    await flush();
    expect(result.value).toBe(first);
    expect(result.calls).toBe(1);
  });

  it("a settled request is released: dispose afterwards does not touch it", async () => {
    const { audio, result, request } = await started();
    const buffer = fakeBuffer(1);
    request.succeed(buffer);
    await flush();
    audio.dispose();
    await flush();
    expect(result.value).toBe(buffer);
    expect(result.calls).toBe(1);
  });

  it("never rejects, whatever the decoder does", async () => {
    const outcomes = await Promise.allSettled(
      (["both", "promise", "callback"] as const).flatMap((decodeStyle) => {
        const { audio, context } = setup({ context: { decodeStyle } });
        void audio.unlock();
        const pending = [audio.decode(bytes()), audio.decode(bytes())];
        context.decodes[0].fail(new Error("EncodingError"));
        context.decodes[1].fail("not even an Error");
        return pending;
      }),
    );
    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(outcomes.map((outcome) => (outcome.status === "fulfilled" ? outcome.value : 0))).toEqual(
      [null, null, null, null, null, null],
    );
  });
});
