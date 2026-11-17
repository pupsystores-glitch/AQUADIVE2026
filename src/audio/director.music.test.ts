// AudioDirector music tests (M-OWN; docs/08 §7.6): the one music stream, its
// independence from rounds and money, and the duck under crash, cashout and
// jackpot. Node environment, with a recording fake manager.
//
// Simulated: these prove which calls the director makes and when. Whether
// the result sounds smooth is the owner's listening pass.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { EngineEventMap } from "@/engine";
import type { AudioManager, LoopHandle, StreamHandle, StreamOptions } from "./audio-manager";
import {
  DISABLED_BY_DEFAULT,
  HANDLE_EPSILON,
  MUSIC_DUCK,
  MUSIC_DUCK_CUES,
  createAudioDirector,
  createMusicDuck,
  musicDuckLevel,
  type AudioEventSource,
  type AudioFrame,
  type MusicDuckKind,
} from "./director";
import type { CueId } from "./manifest";
import { MUSIC_MAIN } from "./music";

type EventName = keyof EngineEventMap;

class FakeEvents implements AudioEventSource {
  private readonly listeners = new Map<EventName, Set<(payload: never) => void>>();

  on<K extends EventName>(name: K, listener: (payload: EngineEventMap[K]) => void): () => void {
    const set = this.listeners.get(name) ?? new Set();
    this.listeners.set(name, set);
    set.add(listener as (payload: never) => void);
    return () => set.delete(listener as (payload: never) => void);
  }

  emit<K extends EventName>(name: K, payload: EngineEventMap[K]): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      (listener as (payload: EngineEventMap[K]) => void)(payload);
    }
  }
}

/** Records the stream calls; loops and one-shots are accepted and listed by cue. */
class MusicAudio implements AudioManager<CueId> {
  /** `stream <url>`, `gain <x>`, `active <bool>`, `stop`, in call order. */
  readonly music: string[] = [];
  readonly gains: number[] = [];
  readonly plays: CueId[] = [];
  readonly loops: CueId[] = [];
  streams: StreamOptions[] = [];
  /** When set, `stream()` throws. */
  failStream = false;

  unlock(): Promise<void> {
    return Promise.resolve();
  }
  setBusGain(): void {}
  setMuted(): void {}
  play(cue: CueId): void {
    this.plays.push(cue);
  }
  loop(cue: CueId): LoopHandle {
    this.loops.push(cue);
    return {
      setGain: () => {},
      setRate: () => {},
      setFilter: () => {},
      stop: () => {},
      isAudible: () => true,
    };
  }
  stream(options: StreamOptions): StreamHandle {
    if (this.failStream) throw new Error("stream exploded");
    this.streams.push(options);
    this.music.push(`stream ${options.url}`);
    return {
      setGain: (gain) => {
        this.gains.push(gain);
        this.music.push(`gain ${gain.toFixed(4)}`);
      },
      setActive: (active) => this.music.push(`active ${active}`),
      stop: () => this.music.push("stop"),
      isAudible: () => true,
    };
  }
  decode(): Promise<null> {
    return Promise.resolve(null);
  }
  suspend(): void {}
  resume(): void {}
  dispose(): void {}
}

const DT = 0.01;
const TRACK: StreamOptions = { url: "test://music", bus: "music", gain: 1, loop: true };

const frame = (over: Partial<AudioFrame> = {}): AudioFrame => ({
  phase: "idle",
  depthRatio: 0,
  multiplier: 1,
  boost: 0,
  dt: DT,
  ...over,
});

const ev = {
  bet: (amount: number): EngineEventMap["betPlaced"] => ({ roundId: 1, slot: 0, amount }),
  dive: (): EngineEventMap["diveStarted"] => ({ roundId: 1 }),
  cashout: (slot: 0 | 1 = 0): EngineEventMap["cashedOut"] => ({ roundId: 1, slot, multiplier: 2 }),
  crash: (): EngineEventMap["crashed"] => ({ roundId: 1, multiplier: 2.5 }),
  impact: (): EngineEventMap["shipImpact"] => ({ roundId: 1, jackpotMultiplier: 1000 }),
  pick: (chestMultiplier: number) =>
    ({ roundId: 1, chestIndex: 0, chestMultiplier }) as unknown as EngineEventMap["chestPicked"],
};

function setup(music: StreamOptions | null | "omitted" = TRACK) {
  const events = new FakeEvents();
  const audio = new MusicAudio();
  const director = createAudioDirector(events, audio, music === "omitted" ? {} : { music });
  /** Runs `seconds` of frames in `phase`. */
  const run = (seconds: number, over: Partial<AudioFrame> = {}) => {
    const frames = Math.round(seconds / DT);
    for (let i = 0; i < frames; i++) director.update(frame(over));
  };
  return { events, audio, director, run };
}

/** The level the director last sent, or 1 before any call. */
const level = (audio: MusicAudio) => audio.gains.at(-1) ?? 1;

let errors: MockInstance<Console["error"]>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("music duck — values and pure envelope", () => {
  it("pins the owner's provisional values (D4)", () => {
    expect(MUSIC_DUCK).toEqual({
      crash: { factor: 0.4, attackS: 0.08, holdS: 1.6, releaseS: 1.5 },
      cashout: { factor: 0.55, attackS: 0.05, holdS: 0.9, releaseS: 1 },
      jackpot: { factor: 0.35, attackS: 0.1, holdS: 2.8, releaseS: 2 },
    });
  });

  it("ducks on crash, cashout and jackpot only (D5)", () => {
    expect(MUSIC_DUCK_CUES).toEqual({
      "crash-boom": "crash",
      "cashout-coins": "cashout",
      "jackpot-stinger": "jackpot",
    });
    expect("chest-coin-burst" in MUSIC_DUCK_CUES).toBe(false);
  });

  it("attack, hold and release are linear and continuous", () => {
    const shape = MUSIC_DUCK.crash;
    expect(musicDuckLevel(shape, 1, 0)).toBe(1);
    expect(musicDuckLevel(shape, 1, 0.04)).toBeCloseTo(0.7);
    expect(musicDuckLevel(shape, 1, 0.08)).toBeCloseTo(0.4);
    expect(musicDuckLevel(shape, 1, 1)).toBe(0.4);
    expect(musicDuckLevel(shape, 1, 0.08 + 1.6)).toBeCloseTo(0.4);
    expect(musicDuckLevel(shape, 1, 0.08 + 1.6 + 0.75)).toBeCloseTo(0.7);
    expect(musicDuckLevel(shape, 1, 0.08 + 1.6 + 1.5)).toBe(1);
    expect(musicDuckLevel(shape, 1, 99)).toBe(1);
    expect(musicDuckLevel(shape, 1, Number.NaN)).toBe(1);
    expect(musicDuckLevel(shape, 1, -1)).toBe(1);
  });

  it("has no jump anywhere: a fine sweep moves by small steps only", () => {
    for (const kind of Object.keys(MUSIC_DUCK) as MusicDuckKind[]) {
      const shape = MUSIC_DUCK[kind];
      const step = 0.001;
      const steepest = ((1 - shape.factor) / shape.attackS) * step;
      let previous = musicDuckLevel(shape, 1, 0);
      for (let t = step; t < 8; t += step) {
        const now = musicDuckLevel(shape, 1, t);
        expect(Math.abs(now - previous)).toBeLessThanOrEqual(steepest + 1e-9);
        expect(now).toBeGreaterThanOrEqual(shape.factor - 1e-12);
        expect(now).toBeLessThanOrEqual(1);
        previous = now;
      }
    }
  });

  it("overlapping ducks use the deepest active attenuation", () => {
    const duck = createMusicDuck();
    duck.trigger("cashout");
    duck.advance(0.5);
    expect(duck.level()).toBeCloseTo(0.55);
    duck.trigger("crash");
    duck.advance(0.5);
    expect(duck.level()).toBeCloseTo(0.4);
    duck.trigger("jackpot");
    duck.advance(0.5);
    expect(duck.level()).toBeCloseTo(0.35);
    // Past the crash and cashout envelopes, the jackpot still holds.
    duck.advance(2.2);
    expect(duck.level()).toBeCloseTo(0.35);
    duck.advance(10);
    expect(duck.level()).toBe(1);
  });

  it("a shallower duck never lifts a deeper one", () => {
    const duck = createMusicDuck();
    duck.trigger("jackpot");
    duck.advance(1);
    duck.trigger("cashout");
    for (let i = 0; i < 150; i++) {
      duck.advance(0.01);
      expect(duck.level()).toBeCloseTo(0.35);
    }
  });

  it("a second trigger of the same kind restarts from the current level, without a jump", () => {
    const duck = createMusicDuck();
    duck.trigger("crash");
    duck.advance(0.08 + 1.6 + 0.75); // halfway through the release
    const before = duck.level();
    expect(before).toBeCloseTo(0.7);
    duck.trigger("crash");
    expect(duck.level()).toBeCloseTo(before);
    duck.advance(0.04);
    expect(duck.level()).toBeCloseTo(0.55);
    duck.advance(0.04);
    expect(duck.level()).toBeCloseTo(0.4);
    duck.advance(1.6 + 1.5);
    expect(duck.level()).toBe(1);
  });

  it("is deterministic, ignores bad time steps, and resets", () => {
    const script = (duck: ReturnType<typeof createMusicDuck>) => {
      const out: number[] = [];
      duck.trigger("cashout");
      for (let i = 0; i < 300; i++) {
        if (i === 40) duck.trigger("crash");
        if (i === 90) duck.trigger("jackpot");
        duck.advance(1 / 60);
        out.push(duck.level());
      }
      return out;
    };
    expect(script(createMusicDuck())).toEqual(script(createMusicDuck()));

    const duck = createMusicDuck();
    duck.trigger("crash");
    duck.advance(0.5);
    for (const bad of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY]) duck.advance(bad);
    expect(duck.level()).toBeCloseTo(0.4);
    duck.trigger("nope" as MusicDuckKind);
    duck.reset();
    expect(duck.level()).toBe(1);
  });
});

describe("director — the one music stream", () => {
  it("plays no music without the option, or with null", () => {
    for (const option of ["omitted", null] as const) {
      const { audio, events, run } = setup(option);
      run(0.1);
      events.emit("crashed", ev.crash());
      run(0.5, { phase: "crashed" });
      expect(audio.music).toEqual([]);
    }
  });

  it("asks for the stream once, on its first frame, with the track it was given", () => {
    const { audio, director } = setup(MUSIC_MAIN);
    expect(audio.music).toEqual([]); // nothing at construction
    director.update(frame());
    expect(audio.streams).toEqual([MUSIC_MAIN]);
    expect(MUSIC_MAIN).toMatchObject({ id: "music-main", bus: "music", loop: true, gain: 1 });
    expect(typeof MUSIC_MAIN.url).toBe("string");
    expect(MUSIC_MAIN.url).toContain("music-main");
  });

  it("starts in any phase: the music does not wait for a round", () => {
    for (const phase of ["idle", "diving", "cashed", "crashed", "bonus"] as const) {
      const { audio, director } = setup();
      director.update(frame({ phase }));
      expect(audio.music).toEqual(["stream test://music"]);
    }
  });

  it("round transitions never restart, hold or stop it", () => {
    const { audio, events, run } = setup();
    for (let round = 0; round < 3; round++) {
      run(0.2, { phase: "idle" });
      events.emit("betPlaced", ev.bet(10));
      run(0.2, { phase: "idle" });
      events.emit("diveStarted", ev.dive());
      run(1, { phase: "diving", multiplier: 3, depthRatio: 0.5 });
      events.emit("cashedOut", ev.cashout());
      run(0.5, { phase: "cashed", multiplier: 3 });
      events.emit("crashed", ev.crash());
      run(4, { phase: "crashed" });
      events.emit("shipImpact", ev.impact());
      run(6, { phase: "bonus" });
    }
    expect(audio.streams).toHaveLength(1);
    const lifecycle = audio.music.filter((line) => !line.startsWith("gain "));
    expect(lifecycle).toEqual(["stream test://music"]);
  });

  it("does not depend on bet amounts: the same round with any stake makes the same calls", () => {
    const script = (amount: number) => {
      const { audio, events, run } = setup();
      run(0.1);
      events.emit("betPlaced", ev.bet(amount));
      run(0.1);
      events.emit("diveStarted", ev.dive());
      run(0.5, { phase: "diving", multiplier: 2 });
      events.emit("cashedOut", ev.cashout());
      run(2.5, { phase: "cashed" });
      return audio.music;
    };
    expect(script(1)).toEqual(script(1_000_000));
  });

  it("keeps the chain rattle disabled with music on (A6.1)", () => {
    const { audio, events, run } = setup();
    events.emit("diveStarted", ev.dive());
    run(1, { phase: "diving", multiplier: 5 });
    expect(DISABLED_BY_DEFAULT).toEqual(["chain-rattle"]);
    expect(audio.loops).not.toContain("chain-rattle");
    expect(audio.loops).toContain("ambience-underwater");
    expect(audio.plays).toContain("chain-unspool");
  });
});

describe("director — ducking", () => {
  const cases: readonly [MusicDuckKind, (events: FakeEvents) => void, CueId][] = [
    ["crash", (events) => events.emit("crashed", ev.crash()), "crash-boom"],
    ["cashout", (events) => events.emit("cashedOut", ev.cashout()), "cashout-coins"],
    ["jackpot", (events) => events.emit("shipImpact", ev.impact()), "jackpot-stinger"],
  ];

  it.each(cases)("%s: attack to the factor, hold, release back to exactly 1", (kind, emit, cue) => {
    const shape = MUSIC_DUCK[kind];
    const { audio, events, run, director } = setup();
    run(0.1);
    expect(audio.gains).toEqual([]); // no duck, no call
    emit(events);
    director.update(frame());
    expect(audio.plays).toContain(cue);
    expect(audio.gains).toEqual([]); // the attack starts from the current level

    run(shape.attackS);
    expect(level(audio)).toBeCloseTo(shape.factor, 6);
    const afterAttack = audio.gains.length;
    run(shape.holdS - 0.05);
    expect(audio.gains.length).toBe(afterAttack); // holding: nothing re-sent
    expect(level(audio)).toBeCloseTo(shape.factor, 6);
    run(0.05 + shape.releaseS / 2);
    expect(level(audio)).toBeCloseTo((1 + shape.factor) / 2, 1);
    run(shape.releaseS / 2 + 0.05);
    expect(level(audio)).toBe(1);
    const settled = audio.gains.length;
    run(1);
    expect(audio.gains.length).toBe(settled);
  });

  it.each(cases)("%s: every step is small and in one direction per stage", (kind, emit) => {
    const shape = MUSIC_DUCK[kind];
    const { audio, events, run, director } = setup();
    director.update(frame());
    emit(events);
    run(shape.attackS + shape.holdS + shape.releaseS + 0.5);
    const sent = [1, ...audio.gains];
    const steepest = ((1 - shape.factor) / shape.attackS) * DT;
    const bottom = sent.indexOf(Math.min(...sent));
    for (let i = 1; i < sent.length; i++) {
      const delta = sent[i] - sent[i - 1];
      expect(Math.abs(delta)).toBeLessThanOrEqual(steepest + HANDLE_EPSILON.gain + 1e-9);
      if (i <= bottom) expect(delta).toBeLessThanOrEqual(0);
      else expect(delta).toBeGreaterThanOrEqual(0);
    }
    expect(Math.min(...sent)).toBeCloseTo(shape.factor, 6);
    expect(sent.at(-1)).toBe(1);
  });

  it("overlap: a crash during a cashout duck goes to the deeper level, then releases once", () => {
    const { audio, events, run, director } = setup();
    director.update(frame());
    events.emit("cashedOut", ev.cashout());
    run(0.5, { phase: "cashed" });
    expect(level(audio)).toBeCloseTo(0.55, 6);
    events.emit("crashed", ev.crash());
    run(0.5, { phase: "crashed" });
    expect(level(audio)).toBeCloseTo(0.4, 6);
    run(5, { phase: "crashed" });
    expect(level(audio)).toBe(1);
    expect(Math.min(...audio.gains)).toBeCloseTo(0.4, 6);
  });

  it("overlap: crash and jackpot in one frame use the jackpot's deeper level", () => {
    const { audio, events, run, director } = setup();
    director.update(frame());
    events.emit("crashed", ev.crash());
    events.emit("shipImpact", ev.impact());
    run(1, { phase: "bonus" });
    expect(level(audio)).toBeCloseTo(0.35, 6);
  });

  it("two cashouts in one frame duck once (one merged cue)", () => {
    const one = setup();
    one.director.update(frame());
    one.events.emit("cashedOut", ev.cashout(0));
    one.run(3, { phase: "cashed" });
    const two = setup();
    two.director.update(frame());
    two.events.emit("cashedOut", ev.cashout(0));
    two.events.emit("cashedOut", ev.cashout(1));
    two.run(3, { phase: "cashed" });
    expect(two.audio.gains).toEqual(one.audio.gains);
  });

  it("a second crash during the release continues from the current level", () => {
    const { audio, events, run } = setup();
    events.emit("crashed", ev.crash());
    run(0.08 + 1.6 + 0.75, { phase: "crashed" });
    const before = level(audio);
    expect(before).toBeGreaterThan(0.6);
    const sentBefore = audio.gains.length;
    events.emit("crashed", ev.crash());
    run(0.02, { phase: "crashed" });
    for (const gain of audio.gains.slice(sentBefore)) expect(gain).toBeLessThanOrEqual(before);
    run(0.1, { phase: "crashed" });
    expect(level(audio)).toBeCloseTo(0.4, 6);
  });

  it("no other sound ducks the music: bets, the dive, chests and the coin burst", () => {
    const { audio, events, run } = setup();
    run(0.1);
    events.emit("betPlaced", ev.bet(10));
    run(0.1);
    events.emit("diveStarted", ev.dive());
    run(1, { phase: "diving", multiplier: 60, boost: 1 });
    events.emit("chestPicked", ev.pick(50));
    run(2, { phase: "bonus" });
    expect(audio.plays).toContain("chest-coin-burst");
    expect(audio.plays).toContain("water-splash");
    expect(audio.gains).toEqual([]);
  });

  it("is deterministic: the same script makes the same calls", () => {
    const script = () => {
      const { audio, events, run } = setup();
      run(0.3);
      events.emit("diveStarted", ev.dive());
      run(0.7, { phase: "diving", multiplier: 2 });
      events.emit("cashedOut", ev.cashout());
      run(0.4, { phase: "diving", multiplier: 3 });
      events.emit("crashed", ev.crash());
      run(4, { phase: "crashed" });
      return audio.music;
    };
    expect(script()).toEqual(script());
  });

  it("uses no timer and no wall clock", () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    const now = vi.spyOn(Date, "now");
    const perf = vi.spyOn(performance, "now");
    const { events, run } = setup();
    events.emit("crashed", ev.crash());
    run(4, { phase: "crashed" });
    for (const spy of [timeout, interval, now, perf]) expect(spy).not.toHaveBeenCalled();
  });
});

describe("director — detach, remount and disposal", () => {
  it("pause() holds the stream; the next frame plays on with the same stream", () => {
    const { audio, director, run } = setup();
    run(0.1);
    director.pause();
    director.pause();
    expect(audio.music).toEqual(["stream test://music", "active false"]);
    run(0.1);
    expect(audio.music).toEqual([
      "stream test://music",
      "active false",
      "active true",
      "gain 1.0000",
    ]);
    expect(audio.streams).toHaveLength(1);
  });

  it("pause() before the first frame holds nothing and creates nothing", () => {
    const { audio, director } = setup();
    director.pause();
    expect(audio.music).toEqual([]);
    director.update(frame());
    expect(audio.music).toEqual(["stream test://music"]);
  });

  it("a duck does not survive a detach: the music comes back at full level", () => {
    const { audio, events, director, run } = setup();
    events.emit("crashed", ev.crash());
    run(0.5, { phase: "crashed" });
    expect(level(audio)).toBeCloseTo(0.4, 6);
    director.pause();
    run(0.1, { phase: "crashed" });
    expect(level(audio)).toBe(1);
  });

  it("events during a detach duck nothing", () => {
    const { audio, events, director, run } = setup();
    run(0.1);
    director.pause();
    events.emit("crashed", ev.crash());
    run(1);
    expect(audio.gains).toEqual([1]);
  });

  it("many detach and remount cycles keep one stream", () => {
    const { audio, director, run } = setup();
    for (let i = 0; i < 10; i++) {
      run(0.05);
      director.pause();
    }
    expect(audio.streams).toHaveLength(1);
    expect(audio.music.filter((line) => line === "active false")).toHaveLength(10);
    expect(audio.music.filter((line) => line === "active true")).toHaveLength(9);
  });

  it("dispose() stops the stream once; later calls do nothing", () => {
    const { audio, events, director, run } = setup();
    run(0.1);
    director.dispose();
    director.dispose();
    events.emit("crashed", ev.crash());
    run(1);
    director.pause();
    expect(audio.music).toEqual(["stream test://music", "stop"]);
  });

  it("dispose() before the first frame stops nothing", () => {
    const { audio, director } = setup();
    director.dispose();
    expect(audio.music).toEqual([]);
  });
});

describe("director — a music failure never disturbs the rest", () => {
  it("a throwing stream() is logged once; cues and loops go on, and it is retried", () => {
    const { audio, events, director, run } = setup();
    audio.failStream = true;
    expect(() => {
      run(0.1);
      events.emit("crashed", ev.crash());
      run(0.5, { phase: "crashed" });
      director.pause();
      run(0.1);
    }).not.toThrow();
    expect(audio.plays).toContain("crash-boom");
    expect(audio.loops).toContain("ambience-surface");
    expect(errors).toHaveBeenCalledTimes(1);
    audio.failStream = false;
    director.update(frame());
    expect(audio.streams).toHaveLength(1);
    director.dispose();
  });

  it("a throwing handle never throws out of the director", () => {
    const events = new FakeEvents();
    const boom = () => {
      throw new Error("handle exploded");
    };
    const audio = new MusicAudio();
    audio.stream = () => ({ setGain: boom, setActive: boom, stop: boom, isAudible: boom });
    const director = createAudioDirector(events, audio, { music: TRACK });
    expect(() => {
      director.update(frame());
      events.emit("crashed", ev.crash());
      for (let i = 0; i < 50; i++) director.update(frame({ phase: "crashed" }));
      director.pause();
      director.update(frame());
      director.dispose();
    }).not.toThrow();
    expect(audio.plays).toContain("crash-boom");
  });
});
