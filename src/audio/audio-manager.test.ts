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
  MAX_PLAYBACK_RATE,
  MAX_VOICES,
  MIN_FILTER_HZ,
  MIN_PLAYBACK_RATE,
  PARAM_TIME_CONSTANT_S,
  VOICE_STEAL_FADE_S,
  createAudioManager,
  createBrowserAudioContext,
  type AudioManager,
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

type Cue = "clink" | "boom" | "whisper" | "rattle" | "missing";

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

  it("a loop requested before unlock is inert, and stays so after unlock", async () => {
    const { audio, context } = setup();
    const handle = audio.loop("rattle");
    await audio.unlock();
    handle.setGain(1);
    handle.stop(0);
    expect(voiceSources(context)).toHaveLength(0);
  });
});

describe("voice cap", () => {
  const fill = async (cue: Cue = "clink") => {
    const harness = setup();
    await harness.audio.unlock();
    for (let i = 0; i < MAX_VOICES; i++) harness.audio.play(cue);
    return harness;
  };

  it("allows MAX_VOICES (16) voices without stealing", async () => {
    const { context } = await fill();
    expect(MAX_VOICES).toBe(16);
    const sources = voiceSources(context);
    expect(sources).toHaveLength(16);
    expect(sources.every((source) => source.stoppedAt === null)).toBe(true);
  });

  it("at the cap, a higher-priority voice steals the oldest lowest-priority one", async () => {
    const { audio, context } = await fill();
    context.advance(1);
    audio.play("boom");
    const sources = voiceSources(context);
    expect(sources).toHaveLength(17);
    expect(sources[0].stoppedAt).toBe(1 + VOICE_STEAL_FADE_S);
    expect(voiceGainOf(sources[0]).gain.lastTarget()?.value).toBe(0);
    expect(sources.slice(1).every((source) => source.stoppedAt === null)).toBe(true);
  });

  it("an equal-priority voice steals the oldest", async () => {
    const { audio, context } = await fill();
    audio.play("clink");
    const sources = voiceSources(context);
    expect(sources).toHaveLength(17);
    expect(sources[0].stoppedAt).not.toBeNull();
    expect(sources[1].stoppedAt).toBeNull();
  });

  it("the lowest priority goes first, whatever its age", async () => {
    const harness = setup();
    await harness.audio.unlock();
    harness.audio.play("boom");
    harness.audio.play("whisper");
    for (let i = 0; i < MAX_VOICES - 2; i++) harness.audio.play("clink");
    harness.audio.play("boom");
    const sources = voiceSources(harness.context);
    expect(sources[1].stoppedAt).not.toBeNull(); // the whisper
    expect(sources.filter((source) => source.stoppedAt !== null)).toHaveLength(1);
  });

  it("a newcomer below every playing voice is dropped", async () => {
    const { audio, context } = await fill();
    audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(16);
    expect(voiceSources(context).every((source) => source.stoppedAt === null)).toBe(true);
    const handle = audio.loop("whisper");
    handle.setGain(1);
    expect(voiceSources(context)).toHaveLength(16);
  });

  it("ended and stopping voices free their slots", async () => {
    const { audio, context } = await fill();
    voiceSources(context)[3].end();
    audio.play("whisper");
    expect(voiceSources(context)).toHaveLength(17);
    expect(voiceSources(context).every((source) => source.stoppedAt === null)).toBe(true);

    const harness = setup();
    await harness.audio.unlock();
    const handle = harness.audio.loop("rattle");
    for (let i = 0; i < MAX_VOICES - 1; i++) harness.audio.play("clink");
    handle.stop(5); // still fading out
    harness.audio.play("whisper");
    const fresh = voiceSources(harness.context);
    expect(fresh).toHaveLength(17);
    expect(fresh.filter((source) => source.stoppedAt !== null)).toEqual([fresh[0]]);
  });

  it("a stolen loop's handle goes inert", async () => {
    const harness = setup({
      cues: { ...CUES, rattle: { ...(CUES.rattle as ResolvedCue), priority: 0 } },
    });
    await harness.audio.unlock();
    const handle = harness.audio.loop("rattle");
    for (let i = 0; i < MAX_VOICES; i++) harness.audio.play("clink");
    const [loopSource] = voiceSources(harness.context);
    expect(loopSource.stoppedAt).not.toBeNull();
    const gain = voiceGainOf(loopSource);
    const count = gain.gain.automation.length;
    handle.setGain(1);
    expect(gain.gain.automation).toHaveLength(count);
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
});
