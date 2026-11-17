// AudioManager stream tests (M-OWN; docs/08 §7.6): the one streamed music
// player. Node environment, over the fake context and the fake media element.
//
// These are simulated tests. They prove the manager's logic: when it creates,
// plays, pauses and releases the element, and how it routes it. They do not
// prove a real browser's playback, autoplay policy, looping or the iOS
// silent switch; those are in the browser measurements of docs/08 §7.6.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  FADE_TIME_CONSTANTS,
  LOOP_VOICES,
  MAX_VOICES,
  ONE_SHOT_VOICES,
  PARAM_TIME_CONSTANT_S,
  STREAM_HOLD_FADE_S,
  STREAM_MAX_RETRIES,
  TAIL_VOICES,
  createAudioManager,
  createBrowserMediaElement,
  type AudioManager,
  type MediaElementLike,
  type ResolvedCue,
  type StreamOptions,
} from "./audio-manager";
import {
  FakeAudioContext,
  fakeBuffer,
  routeOf,
  type FakeAudioContextOptions,
  type FakeGainNode,
} from "./test/fake-audio-context";
import { fakeMediaElements, type FakePlayMode } from "./test/fake-media-element";

type Cue = "clink" | "bed";

const CUES: Readonly<Record<Cue, ResolvedCue>> = {
  clink: { buffer: fakeBuffer(0.2), bus: "sfx", gain: 0.8, priority: 1 },
  bed: { buffer: fakeBuffer(20), bus: "ambience", gain: 1, priority: 3, essential: true },
};

const TRACK: StreamOptions = { url: "test://music", bus: "music", gain: 0.8, loop: true };

const setup = (
  options: {
    context?: FakeAudioContextOptions;
    playMode?: FakePlayMode;
    createMediaElement?: () => MediaElementLike | null;
  } = {},
) => {
  const context = new FakeAudioContext(options.context);
  const media = fakeMediaElements();
  if (options.playMode) media.next.playMode = options.playMode;
  const createMediaElement = vi.fn(options.createMediaElement ?? media.create);
  const onUnlockRequired = vi.fn();
  const audio: AudioManager<Cue> = createAudioManager<Cue>({
    resolveCue: (cue) => CUES[cue] ?? null,
    createContext: () => context,
    onUnlockRequired,
    createMediaElement,
  });
  return { audio, context, media, createMediaElement, onUnlockRequired };
};

/** limiter, then master, music, ambience, sfx: the manager's construction order. */
const busesOf = (context: FakeAudioContext) => {
  const [master, music, ambience, sfx] = context.gains;
  return { master, music, ambience, sfx };
};

/** The stream's own gain node: the one its media source feeds. */
const streamGainOf = (context: FakeAudioContext) =>
  context.mediaSources[0].connections[0] as FakeGainNode;

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

let warns: MockInstance<Console["warn"]>;
let errors: MockInstance<Console["error"]>;
beforeEach(() => {
  warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("stream — lazy creation and loading", () => {
  it("creates no element and no context before the first unlock", () => {
    const { audio, context, media, createMediaElement } = setup();
    audio.stream(TRACK);
    expect(createMediaElement).not.toHaveBeenCalled();
    expect(media.elements).toHaveLength(0);
    expect(context.gains).toHaveLength(0);
    expect(context.mediaSources).toHaveLength(0);
  });

  it("creates the element, sets its source and plays inside the unlock gesture", () => {
    const { audio, context, media } = setup();
    audio.stream(TRACK);
    void audio.unlock(); // everything below happens synchronously, inside the gesture
    expect(media.elements).toHaveLength(1);
    const element = media.elements[0];
    expect(element.src).toBe("test://music");
    expect(element.loop).toBe(true);
    expect(element.preload).toBe("auto");
    expect(element.playCalls).toBe(1);
    expect(element.paused).toBe(false);
    expect(context.mediaSources).toHaveLength(1);
  });

  it("a stream requested after the unlock starts at once", async () => {
    const { audio, media } = setup();
    await audio.unlock();
    expect(media.elements).toHaveLength(0);
    const handle = audio.stream(TRACK);
    expect(media.elements).toHaveLength(1);
    expect(media.elements[0].playCalls).toBe(1);
    expect(handle.isAudible()).toBe(true);
  });

  it("streams: nothing is decoded and no buffer source is used", async () => {
    const { audio, context } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    expect(context.decodes).toHaveLength(0);
    // The only buffer source is the 1-sample unlock prime.
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].buffer?.duration).toBeLessThan(0.001);
  });

  it("does not create the element while muted or host-suspended", async () => {
    const { audio, media } = setup();
    audio.setMuted(true);
    audio.stream(TRACK);
    await audio.unlock();
    expect(media.elements).toHaveLength(0);
    audio.suspend();
    audio.setMuted(false);
    expect(media.elements).toHaveLength(0);
    audio.resume();
    expect(media.elements).toHaveLength(1);
    expect(media.elements[0].paused).toBe(false);
  });
});

describe("stream — one player, one media source, music-bus routing", () => {
  it("routes element → source → gain → bus → master → limiter → destination", async () => {
    const { audio, context } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    const { master, music } = busesOf(context);
    const source = context.mediaSources[0];
    const gain = streamGainOf(context);
    expect(routeOf(source)).toEqual([
      gain,
      music,
      master,
      context.compressors[0],
      context.destination,
    ]);
    expect(source.connections).toHaveLength(1);
    expect(gain.connections).toEqual([music]);
    expect(gain.gain.value).toBeCloseTo(0.8);
  });

  it("uses the bus it is given", async () => {
    const { audio, context } = setup();
    audio.stream({ ...TRACK, bus: "ambience" });
    await audio.unlock();
    expect(streamGainOf(context).connections).toEqual([busesOf(context).ambience]);
  });

  it("a second stream() returns the same handle and creates nothing", async () => {
    const { audio, context, media } = setup();
    const first = audio.stream(TRACK);
    await audio.unlock();
    const second = audio.stream({ ...TRACK, url: "test://other" });
    expect(second).toBe(first);
    expect(media.elements).toHaveLength(1);
    expect(context.mediaSources).toHaveLength(1);
    expect(media.elements[0].src).toBe("test://music");
  });

  it("never creates a second element or source through mute, visibility, hold and gestures", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    for (let i = 0; i < 5; i++) {
      audio.setMuted(true);
      audio.setMuted(false);
      audio.suspend();
      audio.resume();
      handle.setActive(false);
      handle.setActive(true);
      await audio.unlock();
      audio.stream(TRACK);
    }
    expect(media.elements).toHaveLength(1);
    expect(context.mediaSources).toHaveLength(1);
    expect(media.elements[0].loadCalls).toBe(0); // never reloaded: it keeps its position
    expect(media.elements[0].paused).toBe(false);
  });

  it("rejects malformed options with an inert handle", async () => {
    const { audio, media } = setup();
    await audio.unlock();
    const bad = [
      null,
      {},
      { url: "", bus: "music" },
      { url: "test://x", bus: "master" },
      { url: 5, bus: "music" },
    ] as unknown as StreamOptions[];
    for (const options of bad) {
      const handle = audio.stream(options);
      handle.setGain(1);
      handle.setActive(true);
      expect(handle.isAudible()).toBe(false);
      handle.stop();
    }
    expect(media.elements).toHaveLength(0);
  });
});

describe("stream — gain", () => {
  it("multiplies the handle gain with the stream's own gain, smoothly", async () => {
    const { audio, context } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    context.advance(1);
    handle.setGain(0.5);
    const param = streamGainOf(context).gain;
    expect(param.lastTarget()).toEqual({
      kind: "setTargetAtTime",
      value: 0.8 * 0.5,
      time: 1,
      timeConstant: PARAM_TIME_CONSTANT_S,
    });
  });

  it("clamps to 0..1 and ignores non-numbers", async () => {
    const { audio, context } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const param = streamGainOf(context).gain;
    handle.setGain(7);
    expect(param.value).toBeCloseTo(0.8);
    handle.setGain(-1);
    expect(param.value).toBe(0);
    handle.setGain(0.25);
    handle.setGain(Number.NaN);
    handle.setGain("1" as unknown as number);
    expect(param.value).toBeCloseTo(0.2);
  });

  it("a gain set before the element exists is on the node when it is created", async () => {
    const { audio, context } = setup();
    const handle = audio.stream(TRACK);
    handle.setGain(0.5);
    await audio.unlock();
    expect(streamGainOf(context).gain.value).toBeCloseTo(0.4);
    expect(streamGainOf(context).gain.automation).toHaveLength(0);
  });

  it("the music bus gain is independent of the ambience and sfx buses", async () => {
    const { audio, context } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    const { music, ambience, sfx } = busesOf(context);
    audio.setBusGain("music", 0.3);
    expect(music.gain.value).toBeCloseTo(0.3);
    expect(ambience.gain.value).toBe(1);
    expect(sfx.gain.value).toBe(1);
    audio.setBusGain("sfx", 0.1);
    audio.setBusGain("ambience", 0.2);
    expect(music.gain.value).toBeCloseTo(0.3);
  });
});

describe("stream — user-gesture unlock and retry", () => {
  it("a refused play() is retried inside the next gesture, not outside one", async () => {
    const { audio, media } = setup({ playMode: "refuse" });
    const handle = audio.stream(TRACK);
    await audio.unlock();
    await flush();
    const element = media.elements[0];
    expect(element.playCalls).toBe(1);
    expect(element.paused).toBe(true);
    expect(handle.isAudible()).toBe(false);

    // Not a gesture: mute and visibility changes do not retry a refused play().
    audio.setMuted(true);
    audio.setMuted(false);
    audio.suspend();
    audio.resume();
    expect(element.playCalls).toBe(1);

    element.playMode = "allow";
    await audio.unlock(); // the next gesture
    expect(element.playCalls).toBe(2);
    expect(element.paused).toBe(false);
    expect(handle.isAudible()).toBe(true);
    expect(media.elements).toHaveLength(1);
  });

  it("keeps retrying on each gesture while the browser refuses", async () => {
    const { audio, media } = setup({ playMode: "refuse" });
    audio.stream(TRACK);
    for (let i = 0; i < 4; i++) {
      await audio.unlock();
      await flush();
    }
    expect(media.elements[0].playCalls).toBe(4);
    expect(media.elements).toHaveLength(1);
    expect(warns).not.toHaveBeenCalled();
  });

  it("a play() that throws is handled the same way", async () => {
    const { audio, media } = setup({ playMode: "throw" });
    const handle = audio.stream(TRACK);
    await audio.unlock();
    expect(handle.isAudible()).toBe(false);
    media.elements[0].playMode = "allow";
    await audio.unlock();
    expect(handle.isAudible()).toBe(true);
  });

  it("works with a play() that returns no promise (older browsers)", async () => {
    const { audio, media } = setup({ playMode: "legacy" });
    const handle = audio.stream(TRACK);
    await audio.unlock();
    expect(media.elements[0].paused).toBe(false);
    expect(handle.isAudible()).toBe(true);
  });

  it("a refused context resume pauses the element; a later gesture starts it", async () => {
    const { audio, context, media } = setup({ context: { rejectResume: true } });
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    expect(element.paused).toBe(true);
    expect(handle.isAudible()).toBe(false);
    context.rejectResume = false;
    await audio.unlock();
    expect(element.paused).toBe(false);
    expect(handle.isAudible()).toBe(true);
    expect(media.elements).toHaveLength(1);
  });

  it("is not audible while the context resume is still pending", async () => {
    const { audio, context } = setup({ context: { resumeMode: "manual" } });
    const handle = audio.stream(TRACK);
    void audio.unlock();
    expect(handle.isAudible()).toBe(false);
    context.completeResume();
    await flush();
    expect(handle.isAudible()).toBe(true);
  });

  it("an AbortError from our own pause() does not block the stream", async () => {
    const { audio, media } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    // The browser rejects a pending play() with AbortError when pause() follows it.
    element.play = () => {
      element.playCalls++;
      element.paused = false;
      return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    audio.setMuted(true);
    audio.setMuted(false);
    await flush();
    audio.setMuted(true);
    audio.setMuted(false); // not a gesture: plays again only if not blocked
    expect(element.playCalls).toBe(3);
  });
});

describe("stream — mute, visibility and interruption", () => {
  it("mute pauses the element and unmute plays it on, without reloading", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    audio.setMuted(true);
    expect(element.paused).toBe(true);
    expect(handle.isAudible()).toBe(false);
    audio.setMuted(false);
    expect(element.paused).toBe(false);
    expect(element.playCalls).toBe(2);
    expect(element.loadCalls).toBe(0);
    expect(element.src).toBe("test://music");
  });

  it("a hidden page pauses the element; a visible one plays it on", async () => {
    const { audio, media } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    audio.suspend();
    expect(element.paused).toBe(true);
    audio.resume();
    expect(element.paused).toBe(false);
    expect(element.loadCalls).toBe(0);
  });

  it("stays paused while hidden even when unmuted", async () => {
    const { audio, media } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    audio.suspend();
    audio.setMuted(true);
    audio.setMuted(false);
    expect(media.elements[0].paused).toBe(true);
  });

  it("an interruption pauses the element; a system resume plays it on", async () => {
    const { audio, context, media, onUnlockRequired } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    context.interrupt();
    expect(onUnlockRequired).toHaveBeenCalledTimes(1);
    expect(element.paused).toBe(true);
    expect(handle.isAudible()).toBe(false);
    context.systemResume();
    expect(element.paused).toBe(false);
    expect(handle.isAudible()).toBe(true);
  });

  it("after an interruption a gesture unlock plays it on", async () => {
    const { audio, context, media } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    context.interrupt();
    await audio.unlock();
    expect(media.elements[0].paused).toBe(false);
    expect(media.elements).toHaveLength(1);
  });

  it("a pause the manager did not ask for waits for the next gesture", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    element.systemPause(); // a media key, or the system
    expect(handle.isAudible()).toBe(false);
    audio.suspend();
    audio.resume();
    expect(element.paused).toBe(true); // respected outside a gesture
    await audio.unlock();
    expect(element.paused).toBe(false);
    expect(handle.isAudible()).toBe(true);
  });

  it("ignores a late pause event once the element plays again", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    audio.setMuted(true);
    audio.setMuted(false);
    element.dispatch("pause"); // the event of the earlier pause() arrives late
    expect(handle.isAudible()).toBe(true);
    audio.suspend();
    audio.resume();
    expect(element.paused).toBe(false);
  });
});

describe("stream — hold and resume (detach and remount)", () => {
  it("a hold fades out, then pauses on the element's timeupdate after the fade", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    context.advance(2);
    handle.setActive(false);
    const param = streamGainOf(context).gain;
    expect(param.lastTarget()).toEqual({
      kind: "setTargetAtTime",
      value: 0,
      time: 2,
      timeConstant: STREAM_HOLD_FADE_S / FADE_TIME_CONSTANTS,
    });
    expect(element.paused).toBe(false); // still fading
    context.advance(STREAM_HOLD_FADE_S / 2);
    element.tick();
    expect(element.paused).toBe(false);
    context.advance(STREAM_HOLD_FADE_S);
    element.tick();
    expect(element.paused).toBe(true);
    expect(element.pauseCalls).toBe(1);
    expect(handle.isAudible()).toBe(false);
  });

  it("playing on after a hold resumes the same element and restores the gain", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    handle.setActive(false);
    context.advance(1);
    element.tick();
    expect(element.paused).toBe(true);
    handle.setActive(true);
    expect(element.paused).toBe(false);
    expect(element.loadCalls).toBe(0);
    expect(media.elements).toHaveLength(1);
    expect(context.mediaSources).toHaveLength(1);
    expect(streamGainOf(context).gain.value).toBeCloseTo(0.8);
  });

  it("playing on during the fade cancels the hold: the element never pauses", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    handle.setActive(false);
    handle.setActive(true);
    context.advance(1);
    element.tick();
    expect(element.paused).toBe(false);
    expect(element.pauseCalls).toBe(0);
    expect(element.playCalls).toBe(1);
    expect(streamGainOf(context).gain.value).toBeCloseTo(0.8);
  });

  it("a gain set during a hold is kept and applied when the stream plays on", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    handle.setActive(false);
    handle.setGain(0.5);
    expect(streamGainOf(context).gain.value).toBe(0); // the fade-out owns the gain
    context.advance(1);
    media.elements[0].tick();
    handle.setGain(0.25);
    expect(streamGainOf(context).gain.value).toBe(0);
    handle.setActive(true);
    expect(streamGainOf(context).gain.value).toBeCloseTo(0.8 * 0.25);
  });

  it("a hold while muted pauses at once, and stays held after unmute", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    audio.setMuted(true);
    handle.setActive(false);
    audio.setMuted(false);
    expect(element.paused).toBe(true);
    await audio.unlock(); // a gesture does not override a hold
    expect(element.paused).toBe(true);
    handle.setActive(true);
    expect(element.paused).toBe(false);
  });

  it("a held stream that never played creates no element", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    handle.setActive(false);
    await audio.unlock();
    expect(media.elements).toHaveLength(0);
    handle.setActive(true);
    expect(media.elements).toHaveLength(1);
  });
});

describe("stream — failures never disturb the rest", () => {
  it("a loading error is logged once and voices keep playing", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    media.elements[0].fail();
    media.elements[0].fail();
    expect(warns).toHaveBeenCalledTimes(1);
    expect(String(warns.mock.calls[0][0])).toContain("could not be loaded");
    expect(handle.isAudible()).toBe(false);
    const before = context.sources.length;
    audio.play("clink");
    audio.loop("bed");
    expect(context.sources.length).toBe(before + 2);
    // Every handle method stays safe.
    handle.setGain(0.5);
    handle.setActive(false);
    handle.setActive(true);
  });

  it("a loading error is retried inside a gesture, with a reload, a bounded number of times", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    for (let attempt = 1; attempt <= STREAM_MAX_RETRIES; attempt++) {
      element.fail();
      audio.setMuted(true);
      audio.setMuted(false); // not a gesture: no retry
      expect(element.loadCalls).toBe(attempt - 1);
      await audio.unlock();
      expect(element.loadCalls).toBe(attempt);
      expect(element.loads[attempt - 1]).toBe("test://music");
      expect(handle.isAudible()).toBe(true);
    }
    element.fail(); // one more than the retry budget
    await audio.unlock();
    await audio.unlock();
    expect(element.loadCalls).toBe(STREAM_MAX_RETRIES);
    expect(handle.isAudible()).toBe(false);
    expect(media.elements).toHaveLength(1);
    expect(warns).toHaveBeenCalledTimes(1);
  });

  it("no media element (the factory returns null): silent, quiet, and voices play", async () => {
    const { audio, context, createMediaElement } = setup({ createMediaElement: () => null });
    const handle = audio.stream(TRACK);
    await audio.unlock();
    expect(createMediaElement).toHaveBeenCalledTimes(1);
    expect(context.mediaSources).toHaveLength(0);
    expect(handle.isAudible()).toBe(false);
    expect(warns).not.toHaveBeenCalled();
    handle.setGain(1);
    handle.setActive(true);
    await audio.unlock();
    expect(createMediaElement).toHaveBeenCalledTimes(1);
    audio.play("clink");
    expect(context.sources.length).toBe(2);
  });

  it("a factory that throws is logged once", async () => {
    const { audio } = setup({
      createMediaElement: () => {
        throw new Error("no Audio");
      },
    });
    const handle = audio.stream(TRACK);
    await audio.unlock();
    expect(handle.isAudible()).toBe(false);
    expect(warns).toHaveBeenCalledTimes(1);
  });

  it("a context without createMediaElementSource never creates an element", async () => {
    const { audio, context, createMediaElement } = setup();
    (context as { createMediaElementSource?: unknown }).createMediaElementSource = undefined;
    const handle = audio.stream(TRACK);
    await audio.unlock();
    expect(createMediaElement).not.toHaveBeenCalled();
    expect(handle.isAudible()).toBe(false);
  });

  it("a failing createMediaElementSource releases the element and is logged once", async () => {
    const { audio, context, media } = setup();
    context.throwOnMediaSource = true;
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    expect(element.listenerCount).toBe(0);
    expect(element.src).toBe("");
    expect(element.playCalls).toBe(0);
    expect(handle.isAudible()).toBe(false);
    expect(warns).toHaveBeenCalledTimes(1);
    audio.play("clink");
    expect(context.sources.length).toBe(2);
  });

  it("an element whose methods throw never throws out of the manager", async () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    element.pause = () => {
      throw new Error("pause failed");
    };
    expect(() => {
      audio.setMuted(true);
      audio.setMuted(false);
      audio.suspend();
      audio.resume();
      handle.setActive(false);
      handle.stop();
      audio.dispose();
    }).not.toThrow();
  });

  it("is inert when Web Audio is unavailable", async () => {
    const media = fakeMediaElements();
    const audio = createAudioManager<Cue>({
      resolveCue: () => null,
      createContext: () => null,
      createMediaElement: media.create,
    });
    const early = audio.stream(TRACK);
    await audio.unlock();
    const late = audio.stream(TRACK);
    for (const handle of [early, late]) {
      handle.setGain(1);
      handle.setActive(true);
      expect(handle.isAudible()).toBe(false);
    }
    expect(media.elements).toHaveLength(0);
  });
});

describe("stream — disposal without leaks", () => {
  it("stop() releases the element, its listeners and its nodes", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    const source = context.mediaSources[0];
    const gain = streamGainOf(context);
    expect(element.listenerCount).toBe(3);
    handle.stop();
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(element.loads.at(-1)).toBe(""); // load() after removing src drops the download
    expect(element.listenerCount).toBe(0);
    expect(source.connections).toHaveLength(0);
    expect(gain.connections).toHaveLength(0);
    expect(handle.isAudible()).toBe(false);
    // Every later call is a no-op.
    handle.setGain(1);
    handle.setActive(true);
    handle.stop();
    element.tick();
    expect(element.playCalls).toBe(1);
  });

  it("after stop() a new stream() makes a new player; the old handle stays dead", async () => {
    const { audio, context, media } = setup();
    const first = audio.stream(TRACK);
    await audio.unlock();
    first.stop();
    const second = audio.stream(TRACK);
    expect(second).not.toBe(first);
    expect(media.elements).toHaveLength(2);
    expect(context.mediaSources).toHaveLength(2);
    expect(media.elements[0].paused).toBe(true);
    expect(media.elements[1].paused).toBe(false);
    first.setActive(false);
    expect(second.isAudible()).toBe(true);
  });

  it("dispose() releases the stream and closes the one context", async () => {
    const { audio, context, media } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const element = media.elements[0];
    audio.dispose();
    expect(element.paused).toBe(true);
    expect(element.src).toBe("");
    expect(element.listenerCount).toBe(0);
    expect(context.mediaSources[0].connections).toHaveLength(0);
    expect(context.closeCalls).toBe(1);
    expect(handle.isAudible()).toBe(false);
    handle.setActive(true);
    handle.setGain(1);
    expect(element.playCalls).toBe(1);
    expect(audio.stream(TRACK).isAudible()).toBe(false);
    expect(media.elements).toHaveLength(1);
  });

  it("dispose() before the first unlock leaves nothing behind", () => {
    const { audio, media } = setup();
    const handle = audio.stream(TRACK);
    audio.dispose();
    handle.setActive(true);
    expect(media.elements).toHaveLength(0);
  });
});

describe("stream — the voice pools are untouched", () => {
  it("the caps are unchanged", () => {
    expect(MAX_VOICES).toBe(16);
    expect(LOOP_VOICES + ONE_SHOT_VOICES + TAIL_VOICES).toBe(MAX_VOICES);
  });

  it("with the stream playing, every loop and one-shot slot is still admitted", async () => {
    const { audio, context } = setup();
    audio.stream(TRACK);
    await audio.unlock();
    context.sources[0].end(); // the unlock prime has ended
    for (let i = 0; i < LOOP_VOICES; i++) audio.loop("bed");
    for (let i = 0; i < ONE_SHOT_VOICES; i++) audio.play("clink");
    const started = context.sources.filter((source) => source.startedAt !== null);
    expect(started).toHaveLength(1 + LOOP_VOICES + ONE_SHOT_VOICES);
    // The stream is a media element source, never a buffer source.
    expect(context.mediaSources).toHaveLength(1);
  });

  it("stopping the stream frees no voice slot and stops no voice", async () => {
    const { audio, context } = setup();
    const handle = audio.stream(TRACK);
    await audio.unlock();
    const loop = audio.loop("bed");
    handle.stop();
    expect(loop.isAudible()).toBe(true);
    expect(context.sources.at(-1)?.stoppedAt).toBeNull();
  });
});

describe("stream — SSR", () => {
  it("createBrowserMediaElement returns null without an Audio global", () => {
    expect(typeof (globalThis as { Audio?: unknown }).Audio).toBe("undefined");
    expect(createBrowserMediaElement()).toBeNull();
  });

  it("createBrowserMediaElement constructs Audio only when called", () => {
    const made: unknown[] = [];
    class FakeAudio {
      constructor() {
        made.push(this);
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    try {
      expect(made).toHaveLength(0);
      expect(createBrowserMediaElement()).toBe(made[0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
