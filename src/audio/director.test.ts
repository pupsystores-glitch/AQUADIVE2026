// AudioDirector tests (Sprint 5 / Phase 7, step A4a; docs/08 §5, §7.4, §11).
// Node environment; no new dependency. Most tests drive the director with a
// recording AudioManager and a small event-source fake defined here. The
// readiness and null-manifest tests use the real AudioManager over the
// shared FakeAudioContext and the real SoundBank, both unchanged. Every
// asset URL is a `test://` fixture; the production files (A6) are checked in
// manifest.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { EngineEventMap, EventBus } from "@/engine";
import {
  createAudioManager,
  type AudioBus,
  type AudioManager,
  type LoopHandle,
  type LoopOptions,
  type PlayOptions,
  type ResolvedCue,
  type StreamHandle,
} from "./audio-manager";
import {
  BED_CROSSFADE_S,
  DETACH_FADE_S,
  DISABLED_BY_DEFAULT,
  DISABLED_CUES_BY_DEFAULT,
  DISABLED_ONE_SHOTS_BY_DEFAULT,
  DUCK,
  FLOOR_THUD_HIT_S,
  FLOOR_THUD_MAX_WAIT_S,
  PHASES_MATCH,
  RATTLE_STOP_FADE_S,
  TENSION_THRESHOLDS,
  chestBurstGain,
  createAudioDirector,
  duckFactor,
  rattleGain,
  rattleRate,
  tensionLevel,
  underwaterFilterHz,
  type AudioDirector,
  type AudioEventSource,
  type AudioFrame,
} from "./director";
import directorSource from "./director.ts?raw";
import { SOUND_MANIFEST, type CueDefinition, type CueId, type SoundManifest } from "./manifest";
import { createSoundBank, type SoundBank } from "./sound-bank";
import {
  FakeAudioContext,
  fakeBuffer,
  type FakeAudioContextOptions,
  type FakeGainNode,
} from "./test/fake-audio-context";
import { FakeFetch, flush } from "./test/fake-fetch";

// ----- fakes -----

type EventName = keyof EngineEventMap;

/** The engine event bus, reduced to what the director uses. Delivers synchronously on `emit`. */
class FakeEvents implements AudioEventSource {
  private readonly listeners = new Map<EventName, Set<(payload: never) => void>>();

  on<K extends EventName>(name: K, listener: (payload: EngineEventMap[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener as (payload: never) => void);
    return () => set.delete(listener as (payload: never) => void);
  }

  emit<K extends EventName>(name: K, payload: EngineEventMap[K]): void {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      (listener as (payload: EngineEventMap[K]) => void)(payload);
    }
  }

  get listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}

const fmt = (value: number) => value.toFixed(3);

interface RecordedLoop {
  readonly id: number;
  readonly cue: CueId;
  readonly options: LoopOptions | undefined;
  stopped: boolean;
  /** What its `isAudible()` answers (A4a.1); a test may switch it. */
  audible: boolean;
}

/** The initial values of a `loop()` call, as they appear on its log line (A4a.1). */
const fmtOptions = (options: LoopOptions | undefined) => {
  if (!options) return "";
  const parts: string[] = [];
  if (options.gain !== undefined) parts.push(`gain=${fmt(options.gain)}`);
  if (options.rate !== undefined) parts.push(`rate=${fmt(options.rate)}`);
  if (options.filterHz !== undefined) parts.push(`filter=${Math.round(options.filterHz)}`);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
};

/** An AudioManager that records every call the director makes, as readable lines. */
class RecordingAudio implements AudioManager<CueId> {
  readonly log: string[] = [];
  readonly loops: RecordedLoop[] = [];
  readonly busCalls: string[] = [];
  /** What a new loop's `isAudible()` answers (A4a.1): true, as a loop that starts at once. */
  audibleByDefault = true;
  /** `isAudible()` calls; they are queries, so they are not in `log`. */
  audibleQueries = 0;

  unlock(): Promise<void> {
    this.log.push("unlock");
    return Promise.resolve();
  }
  setBusGain(bus: AudioBus, gain: number): void {
    this.busCalls.push(`${bus} ${gain}`);
  }
  setMuted(muted: boolean): void {
    this.busCalls.push(`muted ${muted}`);
  }
  play(cue: CueId, opts?: PlayOptions): void {
    this.log.push(opts?.gain !== undefined ? `play ${cue} gain=${fmt(opts.gain)}` : `play ${cue}`);
  }
  /** M-OWN: recorded; these tests create no director with music (see director.music.test.ts). */
  stream(): StreamHandle {
    this.log.push("stream");
    return { setGain: () => {}, setActive: () => {}, stop: () => {}, isAudible: () => false };
  }
  loop(cue: CueId, options?: LoopOptions): LoopHandle {
    const loop: RecordedLoop = {
      id: this.loops.length + 1,
      cue,
      options,
      stopped: false,
      audible: this.audibleByDefault,
    };
    this.loops.push(loop);
    const tag = `#${loop.id} ${cue}`;
    this.log.push(`loop ${cue}#${loop.id}${fmtOptions(options)}`);
    return {
      setGain: (gain) => this.log.push(`${tag} gain ${fmt(gain)}`),
      setRate: (rate) => this.log.push(`${tag} rate ${fmt(rate)}`),
      setFilter: (hz) => this.log.push(`${tag} filter ${Math.round(hz)}`),
      stop: (fadeS) => {
        loop.stopped = true;
        this.log.push(`${tag} stop ${fmt(fadeS)}`);
      },
      isAudible: () => {
        this.audibleQueries++;
        return loop.audible && !loop.stopped;
      },
    };
  }
  decode(): Promise<null> {
    return Promise.resolve(null);
  }
  suspend(): void {
    this.busCalls.push("suspend");
  }
  resume(): void {
    this.busCalls.push("resume");
  }
  dispose(): void {
    this.busCalls.push("dispose");
  }

  plays(): string[] {
    return this.log.filter((line) => line.startsWith("play "));
  }
  /** The latest loop of a cue. */
  latest(cue: CueId): RecordedLoop | undefined {
    return this.loops.filter((loop) => loop.cue === cue).at(-1);
  }
  live(): RecordedLoop[] {
    return this.loops.filter((loop) => !loop.stopped);
  }
  take(): string[] {
    return this.log.splice(0);
  }
}

// ----- script helpers -----

const DT = 1 / 60;

const frame = (over: Partial<AudioFrame> = {}): AudioFrame => ({
  phase: "idle",
  depthRatio: 0,
  multiplier: 1,
  boost: 0,
  dt: DT,
  ...over,
});

const ev = {
  bet: (slot: 0 | 1, amount = 10): EngineEventMap["betPlaced"] => ({ roundId: 1, slot, amount }),
  dive: (): EngineEventMap["diveStarted"] => ({ roundId: 1 }),
  cashout: (slot: 0 | 1, multiplier = 2): EngineEventMap["cashedOut"] => ({
    roundId: 1,
    slot,
    multiplier,
  }),
  crash: (multiplier = 2.5): EngineEventMap["crashed"] => ({ roundId: 1, multiplier }),
  impact: (): EngineEventMap["shipImpact"] => ({ roundId: 1, jackpotMultiplier: 1000 }),
  reveal: (): EngineEventMap["chestsRevealed"] => ({
    roundId: 1,
    chests: [
      { multiplier: 2 },
      { multiplier: 5 },
      { multiplier: 20 },
    ] as unknown as EngineEventMap["chestsRevealed"]["chests"],
  }),
  pick: (chestMultiplier: number): EngineEventMap["chestPicked"] => ({
    roundId: 1,
    chestId: 1,
    chestMultiplier,
    finalMultiplier: 1000 * chestMultiplier,
  }),
};

/**
 * A6.1 and A-OWN: the rattle and the tension creaks are off by default.
 * Every test below that predates them builds its director with both on, so
 * their own behaviour stays pinned; the "chain rattle disabled by default"
 * and "tension creaks disabled by default" blocks test the default.
 */
const RATTLE_ON = { chainRattle: true, tensionCreaks: true } as const;

function setup() {
  const events = new FakeEvents();
  const audio = new RecordingAudio();
  const director = createAudioDirector(events, audio, RATTLE_ON);
  return { events, audio, director };
}

/** A whole crash round, with large frames so the golden log stays short. */
function crashRound(env: { events: FakeEvents; director: AudioDirector }, amount = 10) {
  const { events, director } = env;
  const step = (over: Partial<AudioFrame>) => director.update(frame({ dt: 0.6, ...over }));
  step({ phase: "idle" });
  events.emit("betPlaced", ev.bet(0, amount));
  events.emit("betPlaced", ev.bet(1, amount));
  step({ phase: "idle" });
  events.emit("diveStarted", ev.dive());
  step({ phase: "diving", depthRatio: 0 });
  step({ phase: "diving", depthRatio: 0.5, multiplier: 2.5 });
  events.emit("crashed", ev.crash());
  step({ phase: "crashed", depthRatio: 0.5, multiplier: 2.5 });
  step({ phase: "crashed", depthRatio: 0.5, multiplier: 2.5 });
  step({ phase: "crashed", depthRatio: 0.5, multiplier: 2.5 });
  step({ phase: "idle" });
}

const CRASH_ROUND_LOG = [
  // Baseline frame: the surface bed starts silent (its initial gain, A4a.1) and fades in.
  "loop ambience-surface#1 gain=0.000",
  // Both bets in one frame: both slots play bet-clink-1 (BET-1x2), one play per slot.
  "#1 ambience-surface gain 0.500",
  "play bet-clink-1",
  "play bet-clink-1",
  // Dive: crossfade to the underwater bed, the rattle starts, each with its initial values (A4a.1).
  "#1 ambience-surface stop 1.200",
  "loop ambience-underwater#2 gain=0.000 filter=6000",
  "loop chain-rattle#3 gain=0.400 rate=0.850",
  "play chain-unspool",
  "play water-splash",
  // Deeper, faster, past the first tension threshold.
  "#2 ambience-underwater gain 0.500",
  "#2 ambience-underwater filter 1732",
  "#3 chain-rattle gain 0.664",
  "#3 chain-rattle rate 0.982",
  "play tension-creak-1",
  // Crash: the rattle is cut, the bed ducks (level 1 × 0.5 = unchanged 0.5), filter frozen.
  "#3 chain-rattle stop 0.030",
  "play chain-snap",
  "play crash-boom",
  // Duck held (0.6 s), then released (1.2 s: 0.5 + 0.5 × 0.25).
  "#2 ambience-underwater gain 0.625",
  // Next round's betting: crossfade back to the surface.
  "#2 ambience-underwater stop 1.200",
  "loop ambience-surface#4 gain=0.000",
];

// ----- tests -----

let errorSpy: MockInstance;
let warnSpy: MockInstance;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contract", () => {
  it("accepts the engine EventBus as its event source, and its phase type matches the engine's", () => {
    const asSource = (bus: EventBus<EngineEventMap>): AudioEventSource => bus;
    expect(typeof asSource).toBe("function");
    expect(PHASES_MATCH).toBe(true);
  });

  it("imports only types, and only from the manager, the manifest and the engine facade", () => {
    const code = directorSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const imports = [...code.matchAll(/^import\s.*?from\s+"([^"]+)";/gms)].map((m) => m[0]);
    expect(imports.length).toBe(3);
    for (const line of imports) expect(line.startsWith("import type ")).toBe(true);
    expect(imports.map((line) => line.match(/"([^"]+)"/)![1]).sort()).toEqual([
      "./audio-manager",
      "./manifest",
      "@/engine",
    ]);
    for (const banned of [
      "window",
      "document",
      "localStorage",
      "navigator",
      "AudioContext",
      "setTimeout",
      "setInterval",
      "requestAnimationFrame",
      "Date",
      "performance",
      "Math.random",
      "React",
      "@/ui",
      "@/rendering",
    ]) {
      expect(code.includes(banned), banned).toBe(false);
    }
  });

  it("subscribes only to the events that play cues", () => {
    const { events } = setup();
    expect(events.listenerCount).toBe(7);
  });
});

describe("golden cue log", () => {
  it("a full crash round", () => {
    const env = setup();
    crashRound(env);
    expect(env.audio.log).toEqual(CRASH_ROUND_LOG);
    expect(env.audio.busCalls).toEqual([]);
  });

  it("a jackpot round with a chest pick", () => {
    const env = setup();
    const { events, director, audio } = env;
    const step = (over: Partial<AudioFrame>) => director.update(frame({ dt: 0.6, ...over }));
    step({ phase: "idle" });
    events.emit("betPlaced", ev.bet(0));
    events.emit("diveStarted", ev.dive());
    step({ phase: "diving", depthRatio: 0.2 });
    step({ phase: "diving", depthRatio: 1, multiplier: 1000 });
    audio.take();

    events.emit("shipImpact", ev.impact());
    step({ phase: "cashed", depthRatio: 1, multiplier: 1000 });
    // The bed is at level 1 and ducks to 0.5: the value it already has, so no gain call.
    expect(audio.take()).toEqual([
      "#3 chain-rattle stop 0.150",
      "play floor-thud",
      "play jackpot-stinger",
    ]);

    events.emit("chestsRevealed", ev.reveal());
    step({ phase: "bonus", depthRatio: 1 });
    expect(audio.plays()).toEqual(["play treasure-shimmer"]);
    audio.take();

    events.emit("chestPicked", ev.pick(5));
    step({ phase: "bonus", depthRatio: 1 });
    expect(audio.plays()).toEqual(["play chest-lid-creak", "play chest-coin-burst gain=0.800"]);
  });

  it("every one-shot row of the mapping table", () => {
    const env = setup();
    const { events, director, audio } = env;
    director.update(frame());
    audio.take();
    const row = (emit: () => void, phase: AudioFrame["phase"]) => {
      emit();
      director.update(frame({ phase }));
      return audio.take().filter((line) => line.startsWith("play "));
    };
    expect(row(() => events.emit("betPlaced", ev.bet(0)), "idle")).toEqual(["play bet-clink-1"]);
    expect(row(() => events.emit("betPlaced", ev.bet(1)), "idle")).toEqual(["play bet-clink-1"]);
    expect(row(() => events.emit("diveStarted", ev.dive()), "diving")).toEqual([
      "play chain-unspool",
      "play water-splash",
    ]);
    expect(row(() => events.emit("cashedOut", ev.cashout(0)), "diving")).toEqual([
      "play cashout-coins",
    ]);
    expect(row(() => events.emit("crashed", ev.crash()), "crashed")).toEqual([
      "play chain-snap",
      "play crash-boom",
    ]);
    expect(row(() => events.emit("shipImpact", ev.impact()), "cashed")).toEqual([
      "play floor-thud",
      "play jackpot-stinger",
    ]);
    expect(row(() => events.emit("chestsRevealed", ev.reveal()), "bonus")).toEqual([
      "play treasure-shimmer",
    ]);
    expect(row(() => events.emit("chestPicked", ev.pick(12)), "bonus")).toEqual([
      "play chest-lid-creak",
      "play chest-coin-burst gain=1.000",
    ]);
    // Events with no cue.
    expect(
      row(() => {
        events.emit("bettingOpened", { roundId: 2 });
        events.emit("roundEnded", { roundId: 1, outcome: "crashed" });
        events.emit("stateChanged", { roundId: 1, from: "crashed", to: "betting" });
        events.emit("commandRejected", {
          roundId: 1,
          command: {
            type: "cashOut",
            slot: 0,
          } as unknown as EngineEventMap["commandRejected"]["command"],
          reason: "x",
        });
        events.emit("engineError", { roundId: 1, code: "x" });
      }, "idle"),
    ).toEqual([]);
  });
});

describe("Dual Bet cashouts and merging (Q7)", () => {
  const diving = () => {
    const env = setup();
    env.director.update(frame({ phase: "diving" }));
    env.audio.take();
    return env;
  };

  it("two cashouts in one frame play one cashout cue", () => {
    const { events, director, audio } = diving();
    events.emit("cashedOut", ev.cashout(0));
    events.emit("cashedOut", ev.cashout(1));
    director.update(frame({ phase: "diving" }));
    expect(audio.plays()).toEqual(["play cashout-coins"]);
  });

  it("the same two cashouts on two frames play two cues", () => {
    const { events, director, audio } = diving();
    events.emit("cashedOut", ev.cashout(0));
    director.update(frame({ phase: "diving" }));
    events.emit("cashedOut", ev.cashout(1));
    director.update(frame({ phase: "diving" }));
    expect(audio.plays()).toEqual(["play cashout-coins", "play cashout-coins"]);
  });

  it("different cues in the same frame are never merged", () => {
    const { events, director, audio } = diving();
    // A cashout, a goldfish and a tension threshold on one frame.
    events.emit("cashedOut", ev.cashout(1));
    director.update(frame({ phase: "diving", boost: 0.8, multiplier: 2.2 }));
    expect(audio.plays()).toEqual([
      "play cashout-coins",
      "play goldfish-chime",
      "play tension-creak-1",
    ]);
  });

  it("both bet slots in one frame play two clinks, both bet-clink-1 (BET-1x2)", () => {
    const env = setup();
    env.director.update(frame());
    env.events.emit("betPlaced", ev.bet(1));
    env.events.emit("betPlaced", ev.bet(0));
    env.director.update(frame());
    expect(env.audio.plays()).toEqual(["play bet-clink-1", "play bet-clink-1"]);
  });

  it("a repeated identical event in one frame merges (documented, not reachable in the engine today)", () => {
    const { events, director, audio } = diving();
    events.emit("diveStarted", ev.dive());
    events.emit("diveStarted", ev.dive());
    director.update(frame({ phase: "diving" }));
    expect(audio.plays()).toEqual(["play chain-unspool", "play water-splash"]);
  });

  it("a cashout for a slot that is not local plays nothing", () => {
    const { events, director, audio } = diving();
    events.emit("cashedOut", { roundId: 1, slot: 2 as unknown as 0, multiplier: 2 });
    director.update(frame({ phase: "diving" }));
    expect(audio.plays()).toEqual([]);
  });
});

describe("spectator rounds (Q7)", () => {
  it("a crash with no bet still plays the snap and the boom, and cuts the rattle in 0.03 s", () => {
    const { events, director, audio } = setup();
    director.update(frame());
    events.emit("diveStarted", ev.dive());
    director.update(frame({ phase: "diving" }));
    audio.take();
    events.emit("crashed", ev.crash(1.4));
    director.update(frame({ phase: "crashed" }));
    expect(audio.take()).toEqual([
      `#3 chain-rattle stop ${fmt(RATTLE_STOP_FADE_S.crashed)}`,
      "#2 ambience-underwater gain 0.007",
      "play chain-snap",
      "play crash-boom",
    ]);
  });

  it("a jackpot with no bet still plays the thud and the stinger", () => {
    const { events, director, audio } = setup();
    director.update(frame({ phase: "diving" }));
    events.emit("shipImpact", ev.impact());
    director.update(frame({ phase: "cashed", depthRatio: 1 }));
    expect(audio.plays()).toEqual(["play floor-thud", "play jackpot-stinger"]);
  });
});

describe("chest coin-burst gain tiers", () => {
  it.each([
    [2.99, 0.6],
    [3, 0.8],
    [9.99, 0.8],
    [10, 1],
    [Number.NaN, 0.6],
    [Number.POSITIVE_INFINITY, 1],
  ])("chestMultiplier %s → %s", (m, gain) => {
    expect(chestBurstGain(m)).toBe(gain);
  });
});

describe("goldfish boost edge", () => {
  it("one chime per pickup, none while the boost decays", () => {
    const { director, audio } = setup();
    const step = (boost: number) => director.update(frame({ phase: "diving", boost }));
    step(0);
    step(0.8);
    step(0.79);
    step(0.78);
    step(0.4);
    step(1);
    step(0.99);
    expect(audio.plays()).toEqual(["play goldfish-chime", "play goldfish-chime"]);
  });

  it("no chime on the first frame after creation or after a resume", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", boost: 0.8 }));
    director.pause();
    director.update(frame({ phase: "diving", boost: 0.9 }));
    expect(audio.plays()).toEqual([]);
  });

  it("a non-finite boost is treated as 0", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving" }));
    director.update(frame({ phase: "diving", boost: Number.NaN }));
    director.update(frame({ phase: "diving", boost: Number.POSITIVE_INFINITY }));
    expect(audio.plays()).toEqual([]);
  });
});

describe("tension thresholds", () => {
  it("are the provisional 2, 3, 5, 10, 20, 50", () => {
    expect(TENSION_THRESHOLDS).toEqual([2, 3, 5, 10, 20, 50]);
    expect(tensionLevel(1.99)).toBe(0);
    expect(tensionLevel(2)).toBe(1);
    expect(tensionLevel(49.9)).toBe(5);
    expect(tensionLevel(1e6)).toBe(6);
    expect(tensionLevel(Number.NaN)).toBe(0);
  });

  it("each fires once per round, alternating creaks, only while diving", () => {
    const { director, audio } = setup();
    const step = (phase: AudioFrame["phase"], multiplier: number) =>
      director.update(frame({ phase, multiplier }));
    step("diving", 1);
    step("diving", 2.1);
    step("diving", 2.5);
    step("diving", 3.2);
    step("diving", 3.0); // a dip and a re-cross do not fire again
    step("diving", 3.3);
    step("crashed", 60); // not diving
    step("cashed", 60);
    expect(audio.plays()).toEqual(["play tension-creak-1", "play tension-creak-2"]);
  });

  it("a jump across several thresholds in one frame plays only the highest one's cue", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 1 }));
    director.update(frame({ phase: "diving", multiplier: 12 })); // 2, 3, 5 and 10 at once: level 4
    director.update(frame({ phase: "diving", multiplier: 25 })); // level 5
    expect(audio.plays()).toEqual(["play tension-creak-2", "play tension-creak-1"]);
  });

  it("reset when the next round starts", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 1 }));
    director.update(frame({ phase: "diving", multiplier: 2.5 }));
    director.update(frame({ phase: "crashed", multiplier: 2.5 }));
    director.update(frame({ phase: "idle" }));
    director.update(frame({ phase: "diving", multiplier: 1 }));
    director.update(frame({ phase: "diving", multiplier: 2.5 }));
    expect(audio.plays()).toEqual(["play tension-creak-1", "play tension-creak-1"]);
  });

  it("thresholds already passed when a resume lands mid-dive do not fire", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 1 }));
    director.pause();
    director.update(frame({ phase: "diving", multiplier: 4 }));
    director.update(frame({ phase: "diving", multiplier: 4.5 }));
    director.update(frame({ phase: "diving", multiplier: 5 }));
    expect(audio.plays()).toEqual(["play tension-creak-1"]);
  });
});

describe("chain rattle", () => {
  it.each([
    [1, 0.4, 0.85],
    [2, 0.6, 0.95],
    [8, 1, 1.15],
    [64, 1, 1.45],
    [1000, 1, 1.5],
    [0.5, 0.4, 0.85],
    [Number.NaN, 0.4, 0.85],
    [Number.NEGATIVE_INFINITY, 0.4, 0.85],
    [Number.POSITIVE_INFINITY, 1, 1.5],
  ])("m = %s → gain %s, rate %s", (m, gain, rate) => {
    expect(rattleGain(m)).toBeCloseTo(gain, 10);
    expect(rattleRate(m)).toBeCloseTo(rate, 10);
  });

  it("follows the multiplier on its handle while diving", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 1 }));
    audio.take();
    director.update(frame({ phase: "diving", multiplier: 8 }));
    expect(audio.take().filter((line) => line.includes("chain-rattle"))).toEqual([
      "#2 chain-rattle gain 1.000",
      "#2 chain-rattle rate 1.150",
    ]);
  });
});

describe("underwater filter", () => {
  it.each([
    [0, 6000],
    [0.5, 6000 / Math.sqrt(12)],
    [1, 500],
    [-1, 6000],
    [2, 500],
    [Number.NaN, 6000],
    [Number.POSITIVE_INFINITY, 500],
  ])("depth %s → %s Hz", (d, hz) => {
    expect(underwaterFilterHz(d)).toBeCloseTo(hz, 6);
  });

  it("follows the depth while diving and stays frozen after the dive", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", depthRatio: 0 }));
    director.update(frame({ phase: "diving", depthRatio: 0.5 }));
    director.update(frame({ phase: "crashed", depthRatio: 0.9 }));
    director.update(frame({ phase: "crashed", depthRatio: 1 }));
    expect(audio.log.filter((line) => line.includes("filter"))).toEqual([
      "loop ambience-underwater#1 gain=0.000 filter=6000",
      "#1 ambience-underwater filter 1732",
    ]);
  });

  it("the surface bed never gets a filter", () => {
    const { director, audio } = setup();
    for (let i = 0; i < 10; i++) director.update(frame({ phase: "idle", depthRatio: 0.7 }));
    expect(audio.log.some((line) => line.includes("filter"))).toBe(false);
  });
});

describe("loop lifecycle", () => {
  const paths: AudioFrame["phase"][][] = [
    ["idle", "diving", "crashed", "idle"],
    ["idle", "diving", "cashed", "bonus", "idle"],
  ];

  it.each(paths)("%s → … keeps at most one live handle per loop cue and loses none", (...path) => {
    const { director, audio } = setup();
    for (const phase of [...path, ...path]) {
      for (let i = 0; i < 3; i++) {
        director.update(frame({ phase }));
        const live = audio.live().map((loop) => loop.cue);
        expect(new Set(live).size).toBe(live.length);
      }
    }
    director.dispose();
    expect(audio.live()).toEqual([]);
    expect(audio.loops.length).toBeGreaterThan(0);
  });

  it("each phase wants its loops", () => {
    const { director, audio } = setup();
    const liveFor = (phase: AudioFrame["phase"]) => {
      director.update(frame({ phase }));
      return audio
        .live()
        .map((loop) => loop.cue)
        .sort();
    };
    expect(liveFor("idle")).toEqual(["ambience-surface"]);
    expect(liveFor("diving")).toEqual(["ambience-underwater", "chain-rattle"]);
    expect(liveFor("crashed")).toEqual(["ambience-underwater"]);
    expect(liveFor("idle")).toEqual(["ambience-surface"]);
    expect(liveFor("diving")).toEqual(["ambience-underwater", "chain-rattle"]);
    expect(liveFor("cashed")).toEqual(["ambience-underwater"]);
    expect(liveFor("bonus")).toEqual(["ambience-underwater"]);
  });

  it("the underwater bed is the same handle from the dive until betting opens (U8)", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving" }));
    director.update(frame({ phase: "cashed" }));
    director.update(frame({ phase: "bonus" }));
    expect(audio.loops.filter((loop) => loop.cue === "ambience-underwater").length).toBe(1);
  });

  it("an unknown phase wants no loop", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "idle" }));
    director.update(frame({ phase: "nowhere" as AudioFrame["phase"] }));
    expect(audio.live()).toEqual([]);
  });
});

describe("crossfade", () => {
  it("the old bed stops over 1.2 s; the new bed's gain rises linearly with dt", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "idle", dt: 0.3 }));
    for (let i = 0; i < 4; i++) director.update(frame({ phase: "idle", dt: 0.3 }));
    audio.take();
    director.update(frame({ phase: "diving", dt: 0.3 }));
    expect(audio.take().slice(0, 1)).toEqual([`#1 ambience-surface stop ${fmt(BED_CROSSFADE_S)}`]);
    for (let i = 0; i < 5; i++) director.update(frame({ phase: "diving", dt: 0.3 }));
    expect(audio.log.filter((line) => line.includes("underwater gain"))).toEqual([
      "#2 ambience-underwater gain 0.250",
      "#2 ambience-underwater gain 0.500",
      "#2 ambience-underwater gain 0.750",
      "#2 ambience-underwater gain 1.000",
    ]);
  });

  it("a fade reaches exactly 1 even when its last step is below the change threshold", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "idle", dt: 0 }));
    director.update(frame({ phase: "idle", dt: 0.998 * BED_CROSSFADE_S }));
    director.update(frame({ phase: "idle", dt: 1 }));
    expect(audio.log.filter((line) => line.includes("gain"))).toEqual([
      "loop ambience-surface#1 gain=0.000",
      "#1 ambience-surface gain 0.998",
      "#1 ambience-surface gain 1.000",
    ]);
  });
});

describe("handle updates", () => {
  it("a quiet frame makes no handle call, and a change below the threshold sends nothing", () => {
    const { director, audio } = setup();
    for (let i = 0; i < 100; i++)
      director.update(frame({ phase: "diving", multiplier: 2, depthRatio: 0.5 }));
    audio.take();
    director.update(frame({ phase: "diving", multiplier: 2.001, depthRatio: 0.502 }));
    director.update(frame({ phase: "diving", multiplier: 2, depthRatio: 0.5 }));
    expect(audio.log).toEqual([]);
  });

  it("wake() re-applies every live loop's values", () => {
    const { director, audio } = setup();
    for (let i = 0; i < 100; i++)
      director.update(frame({ phase: "diving", multiplier: 2, depthRatio: 0.5 }));
    audio.take();
    director.wake();
    expect(audio.log).toEqual([
      "#2 chain-rattle gain 0.600",
      "#2 chain-rattle rate 0.950",
      "#1 ambience-underwater gain 1.000",
      "#1 ambience-underwater filter 1732",
    ]);
  });

  it("wake() before any frame does nothing", () => {
    const { director, audio } = setup();
    director.wake();
    expect(audio.log).toEqual([]);
  });
});

describe("ducking", () => {
  it.each([
    [0, 0.5],
    [0.99, 0.5],
    [1, 0.5],
    [1.4, 0.75],
    [1.8, 1],
    [5, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NaN, 1],
    [-1, 1],
  ])("duckFactor(%s) = %s", (t, factor) => {
    expect(duckFactor(t)).toBeCloseTo(factor, 10);
  });

  it("only the ambience ducks: ×0.5, held, then released", () => {
    const { events, director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 2 }));
    for (let i = 0; i < 10; i++)
      director.update(frame({ phase: "diving", multiplier: 2, dt: 0.2 }));
    audio.take();
    events.emit("crashed", ev.crash());
    director.update(frame({ phase: "crashed", dt: 0.2 }));
    for (let i = 0; i < 10; i++) director.update(frame({ phase: "crashed", dt: 0.2 }));
    // t = 0 … 1.0: held at 0.5; then a linear release over 0.8 s.
    expect(audio.log.filter((line) => line.includes("gain"))).toEqual([
      "#1 ambience-underwater gain 0.500", // t = 0
      "#1 ambience-underwater gain 0.625", // t = 1.2
      "#1 ambience-underwater gain 0.750", // t = 1.4
      "#1 ambience-underwater gain 0.875", // t = 1.6
      "#1 ambience-underwater gain 1.000", // t = 1.8
    ]);
    expect(DUCK).toEqual({ factor: 0.5, holdS: 1, releaseS: 0.8 });
  });

  it("overlapping ducks restart the hold and never go below ×0.5", () => {
    const { events, director, audio } = setup();
    director.update(frame({ phase: "crashed" }));
    for (let i = 0; i < 10; i++) director.update(frame({ phase: "crashed", dt: 0.2 }));
    audio.take();
    const gains: number[] = [];
    const record = () => {
      for (const line of audio.take()) {
        const match = line.match(/underwater gain ([\d.]+)/);
        if (match) gains.push(Number(match[1]));
      }
    };
    for (let i = 0; i < 12; i++) {
      if (i === 0 || i === 7) events.emit("crashed", ev.crash());
      director.update(frame({ phase: "crashed", dt: 0.2 }));
      record();
    }
    expect(Math.min(...gains)).toBe(0.5);
    // The first duck releases at t = 1.2 (0.625); the second lands at t = 1.4: back to 0.5, held again.
    expect(gains).toEqual([0.5, 0.625, 0.5]);
  });
});

describe("pause()", () => {
  it("stops every handle, drops buffered events, and the next frame resumes mid-dive without a splash", () => {
    const { events, director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 3 }));
    events.emit("diveStarted", ev.dive()); // buffered, then dropped by the pause
    director.pause();
    expect(audio.live()).toEqual([]);
    expect(audio.log.filter((line) => line.includes("stop"))).toEqual([
      `#2 chain-rattle stop ${fmt(DETACH_FADE_S)}`,
      `#1 ambience-underwater stop ${fmt(DETACH_FADE_S)}`,
    ]);
    events.emit("cashedOut", ev.cashout(0)); // while paused: dropped
    audio.take();
    director.update(frame({ phase: "diving", multiplier: 3.5, depthRatio: 0.5 }));
    expect(audio.take()).toEqual([
      "loop ambience-underwater#3 gain=0.000 filter=1732",
      "loop chain-rattle#4 gain=0.761 rate=1.031",
    ]);
  });

  it("after a pause in an outcome phase, the bed's filter is taken from the first frame", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "crashed", depthRatio: 0 }));
    director.pause();
    audio.take();
    director.update(frame({ phase: "crashed", depthRatio: 1 }));
    expect(audio.log).toContain("loop ambience-underwater#2 gain=0.000 filter=500");
  });

  it("is idempotent", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving" }));
    director.pause();
    director.pause();
    expect(audio.log.filter((line) => line.includes("stop")).length).toBe(2);
  });
});

describe("dispose()", () => {
  it("removes every listener, stops every loop, and every later call does nothing", () => {
    const { events, director, audio } = setup();
    director.update(frame({ phase: "diving" }));
    director.dispose();
    expect(events.listenerCount).toBe(0);
    expect(audio.live()).toEqual([]);
    audio.take();
    events.emit("crashed", ev.crash());
    director.update(frame({ phase: "crashed" }));
    director.wake();
    director.pause();
    director.dispose();
    expect(audio.log).toEqual([]);
  });
});

describe("exception containment", () => {
  const boom = () => {
    throw new Error("audio exploded");
  };

  /** Every manager method throws. */
  const throwingManager = (): AudioManager<CueId> => ({
    unlock: boom,
    setBusGain: boom,
    setMuted: boom,
    play: boom,
    loop: boom,
    stream: boom,
    decode: boom,
    suspend: boom,
    resume: boom,
    dispose: boom,
  });

  /** Loops start, but every handle method throws. */
  const throwingHandles = (): AudioManager<CueId> => ({
    ...throwingManager(),
    play: () => {},
    loop: () => ({ setGain: boom, setRate: boom, setFilter: boom, stop: boom, isAudible: boom }),
  });

  const fullScript = (director: AudioDirector, events: FakeEvents) => {
    for (let i = 0; i < 5; i++) {
      events.emit("betPlaced", ev.bet(0));
      director.update(frame({ phase: "idle" }));
      events.emit("diveStarted", ev.dive());
      director.update(frame({ phase: "diving", multiplier: 3, boost: i % 2 }));
      director.wake();
      events.emit("crashed", ev.crash());
      director.update(frame({ phase: "crashed" }));
      director.pause();
    }
    director.dispose();
  };

  it("a manager whose every method throws: no entry point throws, each failure kind is logged once", () => {
    const events = new FakeEvents();
    const director = createAudioDirector(events, throwingManager(), RATTLE_ON);
    expect(() => fullScript(director, events)).not.toThrow();
    const kinds = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(kinds.sort()).toEqual([
      "[audio] director: loop start failed; audio continues.",
      "[audio] director: play failed; audio continues.",
    ]);
  });

  it("handles whose every method throws: contained, each kind logged once", () => {
    const events = new FakeEvents();
    const director = createAudioDirector(events, throwingHandles(), RATTLE_ON);
    expect(() => fullScript(director, events)).not.toThrow();
    const kinds = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(kinds.sort()).toEqual([
      "[audio] director: loop audible failed; audio continues.", // A4a.1
      "[audio] director: loop filter failed; audio continues.",
      "[audio] director: loop gain failed; audio continues.",
      "[audio] director: loop rate failed; audio continues.",
      "[audio] director: loop stop failed; audio continues.",
    ]);
  });

  it("one failing cue does not stop the cues after it", () => {
    const audio = new RecordingAudio();
    const play = audio.play.bind(audio);
    audio.play = (cue, opts) => (cue === "chain-snap" ? boom() : play(cue, opts));
    const events = new FakeEvents();
    const director = createAudioDirector(events, audio, RATTLE_ON);
    director.update(frame({ phase: "diving" }));
    events.emit("crashed", ev.crash());
    director.update(frame({ phase: "crashed" }));
    expect(audio.plays()).toEqual(["play crash-boom"]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("an event source whose subscribe throws, or a frame of garbage, does not throw", () => {
    const events: AudioEventSource = { on: boom };
    const audio = new RecordingAudio();
    const director = createAudioDirector(events, audio, RATTLE_ON);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const garbage = {
      phase: undefined,
      depthRatio: "deep",
      multiplier: null,
      boost: {},
      dt: Number.NaN,
    } as unknown as AudioFrame;
    expect(() => director.update(garbage)).not.toThrow();
    expect(() => director.update(null as unknown as AudioFrame)).not.toThrow();
    expect(() => director.update(frame({ phase: "diving" }))).not.toThrow();
    expect(audio.live().length).toBe(2);
  });
});

describe("determinism", () => {
  it("the same script gives the same cue log, with no clock, timer or randomness", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const perf = vi.spyOn(performance, "now");
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const interval = vi.spyOn(globalThis, "setInterval");
    const first = setup();
    crashRound(first);
    const second = setup();
    crashRound(second);
    expect(second.audio.log).toEqual(first.audio.log);
    expect(first.audio.log).toEqual(CRASH_ROUND_LOG);
    for (const spy of [random, now, perf, timeout, interval]) expect(spy).not.toHaveBeenCalled();
  });
});

describe("money is never read", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, 1e12])(
    "a bet amount of %s changes nothing",
    (amount) => {
      const env = setup();
      crashRound(env, amount);
      expect(env.audio.log).toEqual(CRASH_ROUND_LOG);
    },
  );
});

// ----- the real AudioManager and SoundBank (unchanged), over the fake context -----

/** The real manifest, with a `test://` fixture asset on every cue. */
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

function realStack(manifest: SoundManifest<CueId>) {
  const context = new FakeAudioContext();
  const fetch = new FakeFetch();
  let bank: SoundBank<CueId> | null = null;
  const audio = createAudioManager<CueId>({
    resolveCue: (cue) => bank?.resolve(cue) ?? null,
    createContext: () => context,
  });
  bank = createSoundBank({ manifest, decoder: audio, fetch: fetch.fetch });
  const events = new FakeEvents();
  const director = createAudioDirector(events, audio, RATTLE_ON);
  return { context, fetch, bank, audio, events, director };
}

const settle = async () => {
  for (let i = 0; i < 6; i++) await flush();
};

describe("pending-loop readiness (docs/08 §14 risk 13)", () => {
  async function bedWaitingForItsCue(wakeOnReady: boolean) {
    const stack = realStack(withTestAssets());
    if (wakeOnReady) stack.bank.onReady(() => stack.director.wake());
    await stack.audio.unlock();
    // Several frames while the bed waits for its cue. Until A4a.1 its fade-in
    // completed here and it later started at full level (docs/08 §14 risk
    // 15b); now its level holds at 0 until its voice plays.
    stack.director.update(frame({ phase: "idle", dt: 0 }));
    for (let i = 0; i < 3; i++)
      stack.director.update(frame({ phase: "idle", dt: BED_CROSSFADE_S }));
    const loopSources = () => stack.context.sources.filter((source) => source.loop);
    expect(loopSources()).toEqual([]);

    void stack.bank.load("ambience-surface");
    await settle();
    stack.fetch.for("test://ambience-surface")[0].ok();
    await settle();
    expect(loopSources()).toEqual([]);
    stack.context.decodes[0].succeed(fakeBuffer(20));
    await settle();
    expect(stack.bank.status("ambience-surface")).toBe("ready");
    return { stack, loopSources };
  }

  it("a bed starts on the wake() that follows its cue becoming ready", async () => {
    const { loopSources } = await bedWaitingForItsCue(true);
    expect(loopSources().length).toBe(1);
    expect(loopSources()[0].isPlaying()).toBe(true);
  });

  it("D4: that bed starts at gain 0, not at the level its pending frames would have reached, then fades in over 1.2 s (risk 15b)", async () => {
    const { stack, loopSources } = await bedWaitingForItsCue(true);
    const [source] = loopSources();
    const gain = source.connections[0] as FakeGainNode;
    expect(gain.gain.value).toBe(0);
    stack.director.wake();
    stack.director.wake();
    expect(loopSources()).toHaveLength(1); // repeated wake(): one voice
    const levels: number[] = [];
    for (let i = 0; i < 4; i++) {
      stack.director.update(frame({ phase: "idle", dt: 0.3 }));
      levels.push(Number(gain.gain.value.toFixed(3)));
    }
    expect(levels).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("without the wake, a quiet frame does not start it (why A4b must wire onReady → wake)", async () => {
    const { stack, loopSources } = await bedWaitingForItsCue(false);
    stack.director.update(frame({ phase: "idle", dt: 0 }));
    expect(loopSources()).toEqual([]);
    stack.director.wake();
    expect(loopSources().length).toBe(1);
  });
});

describe("null-asset manifest (a cue list with no asset)", () => {
  it("full rounds make no fetch, start no source and log nothing", async () => {
    const stack = realStack(withoutAssets());
    await stack.audio.unlock();
    const primed = stack.context.sources.length; // the unlock prime only
    expect(primed).toBe(1);
    const results = await stack.bank.loadAll();
    expect(results.every((result) => result === "unavailable")).toBe(true);

    crashRound(stack);
    const step = (over: Partial<AudioFrame>, emit?: () => void) => {
      emit?.();
      stack.director.update(frame(over));
    };
    step({ phase: "idle" }, () => stack.events.emit("betPlaced", ev.bet(0)));
    step({ phase: "diving" }, () => stack.events.emit("diveStarted", ev.dive()));
    step({ phase: "diving", boost: 0.8, multiplier: 30, depthRatio: 1 });
    step({ phase: "cashed", depthRatio: 1 }, () => stack.events.emit("shipImpact", ev.impact()));
    step({ phase: "bonus" }, () => stack.events.emit("chestsRevealed", ev.reveal()));
    step({ phase: "bonus" }, () => stack.events.emit("chestPicked", ev.pick(20)));
    step({ phase: "idle" });
    stack.director.wake();
    stack.director.pause();
    stack.director.dispose();

    expect(stack.fetch.requests).toEqual([]);
    expect(stack.context.sources.length).toBe(primed);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    stack.bank.dispose();
    stack.audio.dispose();
  });
});

// ----- loop startup (A4a.1, docs/08 §7.4, §14 risks 15 and 15b) -----

describe("loop startup values (A4a.1)", () => {
  it("D1: a new loop carries its values on loop(); its first frame sends no setter call", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "diving", multiplier: 3, depthRatio: 0.3 }));
    expect(audio.log).toEqual([
      `loop ambience-underwater#1 gain=0.000 filter=${Math.round(underwaterFilterHz(0.3))}`,
      `loop chain-rattle#2 gain=${fmt(rattleGain(3))} rate=${fmt(rattleRate(3))}`,
    ]);
  });

  it("D2: beds start at gain 0, the underwater bed with the current depth's filter, the rattle with the multiplier's gain and rate", () => {
    const { director, audio } = setup();
    director.update(frame({ phase: "idle", depthRatio: 0.7 }));
    expect(audio.latest("ambience-surface")?.options).toEqual({ gain: 0 });
    director.update(frame({ phase: "diving", depthRatio: 0.5, multiplier: 4 }));
    expect(audio.latest("ambience-underwater")?.options).toEqual({
      gain: 0,
      filterHz: underwaterFilterHz(0.5),
    });
    expect(audio.latest("chain-rattle")?.options).toEqual({
      gain: rattleGain(4),
      rate: rattleRate(4),
    });
    // A bed started while the duck is active still starts silent.
    director.pause();
    director.update(frame({ phase: "crashed", depthRatio: 1 }));
    expect(audio.latest("ambience-underwater")?.options).toEqual({ gain: 0, filterHz: 500 });
  });

  it("D3: a bed's fade-in advances only on frames where it is audible, in linear dt / 1.2 steps", () => {
    const { director, audio } = setup();
    audio.audibleByDefault = false;
    const step = () => director.update(frame({ phase: "idle", dt: 0.3 }));
    for (let i = 0; i < 6; i++) step();
    expect(audio.take()).toEqual(["loop ambience-surface#1 gain=0.000"]); // no fade progress
    const bed = audio.latest("ambience-surface") as RecordedLoop;
    bed.audible = true;
    step();
    step();
    bed.audible = false; // muted, suspended, interrupted or resuming mid-fade: held
    for (let i = 0; i < 3; i++) step();
    bed.audible = true;
    step();
    step();
    expect(audio.take()).toEqual([
      "#1 ambience-surface gain 0.250",
      "#1 ambience-surface gain 0.500",
      "#1 ambience-surface gain 0.750",
      "#1 ambience-surface gain 1.000",
    ]);
    // A complete fade is final: no more queries, nothing changes.
    const queries = audio.audibleQueries;
    bed.audible = false;
    for (let i = 0; i < 5; i++) step();
    expect(audio.audibleQueries).toBe(queries);
    expect(audio.take()).toEqual([]);
  });

  it("D3: the rattle is not gated: it follows the multiplier whether or not it is audible", () => {
    const { director, audio } = setup();
    audio.audibleByDefault = false;
    director.update(frame({ phase: "diving", multiplier: 1 }));
    audio.take();
    director.update(frame({ phase: "diving", multiplier: 8 }));
    expect(audio.take().filter((line) => line.includes("chain-rattle"))).toEqual([
      "#2 chain-rattle gain 1.000",
      "#2 chain-rattle rate 1.150",
    ]);
  });

  it("D9: a pause mid-fade, then update(): a fresh handle starting at 0, fading from 0", () => {
    const { director, audio } = setup();
    const step = () => director.update(frame({ phase: "idle", dt: 0.6 }));
    step();
    step();
    director.pause();
    step();
    step();
    expect(audio.log).toEqual([
      "loop ambience-surface#1 gain=0.000",
      "#1 ambience-surface gain 0.500",
      `#1 ambience-surface stop ${fmt(DETACH_FADE_S)}`,
      "loop ambience-surface#2 gain=0.000",
      "#2 ambience-surface gain 0.500",
    ]);
  });

  it("D11: an isAudible() that throws is contained, logged once, and the bed stays quiet", () => {
    const audio = new RecordingAudio();
    const loop = audio.loop.bind(audio);
    audio.loop = (cue, options) => ({
      ...loop(cue, options),
      isAudible: () => {
        throw new Error("audible exploded");
      },
    });
    const events = new FakeEvents();
    const director = createAudioDirector(events, audio, RATTLE_ON);
    for (let i = 0; i < 10; i++) director.update(frame({ phase: "idle", dt: 0.3 }));
    events.emit("diveStarted", ev.dive());
    director.update(frame({ phase: "diving" }));
    director.update(frame({ phase: "diving" }));
    expect(audio.log.filter((line) => line.includes("gain "))).toEqual([]); // no bed fade, ever
    expect(audio.plays()).toEqual(["play chain-unspool", "play water-splash"]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toBe(
      "[audio] director: loop audible failed; audio continues.",
    );
  });
});

// ----- the real AudioManager over the fake context, with cues resolved at once -----

/** One buffer per loop cue, so a test can tell the voices apart. */
const LOOP_BUFFERS = new Map<CueId, ReturnType<typeof fakeBuffer>>([
  ["ambience-surface", fakeBuffer(20)],
  ["ambience-underwater", fakeBuffer(21)],
  ["chain-rattle", fakeBuffer(5)],
]);

/** The real manager, with every loop cue resolvable at once (no bank); one-shots are missing. */
function directStack(
  options: FakeAudioContextOptions = {},
  directorOptions: Parameters<typeof createAudioDirector>[2] = RATTLE_ON,
) {
  const context = new FakeAudioContext(options);
  const audio = createAudioManager<CueId>({
    resolveCue: (cue): ResolvedCue | null => {
      const buffer = LOOP_BUFFERS.get(cue);
      if (!buffer) return null;
      return {
        buffer,
        bus: cue === "chain-rattle" ? "sfx" : "ambience",
        gain: 1,
        priority: 2,
        essential: cue !== "chain-rattle",
      };
    },
    createContext: () => context,
  });
  const events = new FakeEvents();
  const director = createAudioDirector(events, audio, directorOptions);
  const sourcesOf = (cue: CueId) =>
    context.sources.filter((source) => source.buffer === LOOP_BUFFERS.get(cue));
  /** The cue's live voice gain value, rounded; undefined without a live voice. */
  const gainOf = (cue: CueId) => {
    const source = sourcesOf(cue).find((s) => s.onended !== null);
    const node = source?.connections[0] as FakeGainNode | undefined;
    return node ? Number(node.gain.value.toFixed(3)) : undefined;
  };
  /** Runs frames of `phase`, returning the cue's gain after each. */
  const run = (cue: CueId, frames: number, dt: number, phase: AudioFrame["phase"] = "idle") =>
    Array.from({ length: frames }, () => {
      director.update(frame({ phase, dt }));
      return gainOf(cue);
    });
  return { context, audio, events, director, sourcesOf, gainOf, run };
}

describe("bed fade-in follows actual playback (A4a.1, real manager)", () => {
  it("D5: frames before unlock make no progress; after unlock the voice starts at 0 and fades from the next frame", async () => {
    const s = directStack();
    s.director.update(frame({ phase: "idle", dt: 0 }));
    for (let i = 0; i < 3; i++) s.director.update(frame({ phase: "idle", dt: BED_CROSSFADE_S }));
    expect(s.sourcesOf("ambience-surface")).toEqual([]);
    await s.audio.unlock();
    const [bed] = s.sourcesOf("ambience-surface");
    expect(bed.isPlaying()).toBe(true);
    expect(s.gainOf("ambience-surface")).toBe(0);
    expect((bed.connections[0] as FakeGainNode).gain.automation).toEqual([]); // started at 0, no ramp from 1
    expect(s.run("ambience-surface", 4, 0.3)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("D5: the underwater bed and the rattle start with their filter, gain and rate on the nodes", async () => {
    const s = directStack();
    await s.audio.unlock();
    s.director.update(frame({ phase: "diving", depthRatio: 0.5, multiplier: 4 }));
    const [bed] = s.sourcesOf("ambience-underwater");
    const [rattle] = s.sourcesOf("chain-rattle");
    const bedGain = bed.connections[0] as FakeGainNode;
    const bedFilter = bedGain.connections[0] as unknown as { frequency: { value: number } };
    expect(bedGain.gain.value).toBe(0);
    expect(bedFilter.frequency.value).toBeCloseTo(underwaterFilterHz(0.5), 6);
    expect((rattle.connections[0] as FakeGainNode).gain.value).toBeCloseTo(rattleGain(4), 12);
    expect(rattle.playbackRate.value).toBeCloseTo(rattleRate(4), 12);
    expect(rattle.playbackRate.automation).toEqual([]);
  });

  it("D6: while a resume is in progress the voice holds at 0; the fade starts once the context runs", async () => {
    const s = directStack({ resumeMode: "manual" });
    const unlocking = s.audio.unlock();
    expect(s.run("ambience-surface", 5, 0.3)).toEqual([0, 0, 0, 0, 0]); // the voice exists, the context does not run
    expect(s.context.pendingResumeCount).toBe(1);
    s.context.completeResume();
    await unlocking;
    expect(s.run("ambience-surface", 4, 0.3)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("D6: mute, host suspension and an interruption hold the fade mid-way; it continues when playback resumes", async () => {
    const s = directStack();
    await s.audio.unlock();
    const fade = (frames: number) => s.run("ambience-surface", frames, 0.12);
    const fading = fade(3); // the baseline frame, then two steps
    s.audio.setMuted(true);
    const muted = fade(3);
    s.audio.setMuted(false);
    const unmuted = fade(1);
    s.audio.suspend();
    const hostSuspended = fade(3);
    s.audio.resume();
    const hostResumed = fade(1);
    s.context.interrupt();
    const interrupted = fade(3);
    s.context.systemResume();
    const systemResumed = fade(1);
    s.context.interrupt();
    const interruptedAgain = fade(2);
    await s.audio.unlock(); // a new gesture
    const unlockedAgain = fade(1);
    expect({
      fading,
      muted,
      unmuted,
      hostSuspended,
      hostResumed,
      interrupted,
      systemResumed,
      interruptedAgain,
      unlockedAgain,
    }).toEqual({
      fading: [0, 0.1, 0.2],
      muted: [0.2, 0.2, 0.2], // held
      unmuted: [0.3],
      hostSuspended: [0.3, 0.3, 0.3], // held
      hostResumed: [0.4],
      interrupted: [0.4, 0.4, 0.4], // held
      systemResumed: [0.5],
      interruptedAgain: [0.5, 0.5], // held
      unlockedAgain: [0.6],
    });
    expect(s.sourcesOf("ambience-surface")).toHaveLength(1);
  });

  it("D7: a refused resume, then a later unlock: the bed fades in from 0 and never jumps", async () => {
    const s = directStack({ rejectResume: true });
    s.director.update(frame({ phase: "idle", dt: 0 })); // the bed waits for unlock
    await s.audio.unlock(); // starts its voice, then the resume is refused
    expect(s.sourcesOf("ambience-surface")).toHaveLength(1);
    expect(s.run("ambience-surface", 6, 0.3)).toEqual([0, 0, 0, 0, 0, 0]);
    s.context.rejectResume = false;
    await s.audio.unlock();
    expect(s.run("ambience-surface", 4, 0.3)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(s.sourcesOf("ambience-surface")).toHaveLength(1);
  });

  it("D8: repeated wake() never duplicates a voice nor moves the fade", async () => {
    const s = directStack();
    s.director.update(frame({ phase: "idle", dt: 0 }));
    for (let i = 0; i < 3; i++) s.director.wake();
    expect(s.sourcesOf("ambience-surface")).toEqual([]);
    await s.audio.unlock();
    for (let i = 0; i < 3; i++) s.director.wake();
    expect(s.sourcesOf("ambience-surface")).toHaveLength(1);
    expect(s.gainOf("ambience-surface")).toBe(0);
    expect(s.run("ambience-surface", 1, 0.3)).toEqual([0.25]);
    for (let i = 0; i < 3; i++) s.director.wake();
    expect(s.gainOf("ambience-surface")).toBe(0.25);
    expect(s.run("ambience-surface", 1, 0.3)).toEqual([0.5]);
    expect(s.sourcesOf("ambience-surface")).toHaveLength(1);
  });

  it("D10: a bed dropped by a phase change while pending never starts", async () => {
    const s = directStack();
    s.director.update(frame({ phase: "idle" }));
    s.director.update(frame({ phase: "diving" })); // the waiting surface bed is stopped
    await s.audio.unlock();
    expect(s.sourcesOf("ambience-surface")).toEqual([]);
    expect(s.sourcesOf("ambience-underwater")).toHaveLength(1);
    expect(s.sourcesOf("chain-rattle")).toHaveLength(1);
  });

  it("D10: dispose() while pending: the loop never starts; pause() while pending: only the new handle starts", async () => {
    const disposed = directStack();
    disposed.director.update(frame({ phase: "idle" }));
    disposed.director.dispose();
    await disposed.audio.unlock();
    expect(disposed.context.sources.filter((source) => source.loop)).toEqual([]);

    const paused = directStack();
    paused.director.update(frame({ phase: "idle" }));
    paused.director.pause();
    paused.director.update(frame({ phase: "idle" }));
    await paused.audio.unlock();
    expect(paused.sourcesOf("ambience-surface")).toHaveLength(1);
    expect(paused.gainOf("ambience-surface")).toBe(0);
  });

  it("D10: a director disposed while its bed waits for decoding never starts it when the cue becomes ready", async () => {
    const stack = realStack(withTestAssets());
    stack.bank.onReady(() => stack.director.wake());
    await stack.audio.unlock();
    stack.director.update(frame({ phase: "idle" }));
    stack.director.dispose();
    void stack.bank.load("ambience-surface");
    await settle();
    stack.fetch.for("test://ambience-surface")[0].ok();
    await settle();
    stack.context.decodes[0].succeed(fakeBuffer(20));
    await settle();
    expect(stack.bank.status("ambience-surface")).toBe("ready");
    expect(stack.context.sources.filter((source) => source.loop)).toEqual([]);
  });
});

// ----- A6.1: the continuous chain rattle is off by default -----

describe("chain rattle disabled by default (A6.1)", () => {
  function defaultSetup(options?: Parameters<typeof createAudioDirector>[2]) {
    const events = new FakeEvents();
    const audio = new RecordingAudio();
    const director =
      options === undefined
        ? createAudioDirector(events, audio)
        : createAudioDirector(events, audio, options);
    return { events, audio, director };
  }

  /**
   * The default crash-round log: without the rattle (its lines go, and the
   * next handle takes its number) and, since A-OWN, without the tension creak.
   */
  const CRASH_ROUND_LOG_NO_RATTLE = [
    "loop ambience-surface#1 gain=0.000",
    "#1 ambience-surface gain 0.500",
    "play bet-clink-1",
    "play bet-clink-1",
    "#1 ambience-surface stop 1.200",
    "loop ambience-underwater#2 gain=0.000 filter=6000",
    "play chain-unspool",
    "play water-splash",
    "#2 ambience-underwater gain 0.500",
    "#2 ambience-underwater filter 1732",
    "play chain-snap",
    "play crash-boom",
    "#2 ambience-underwater gain 0.625",
    "#2 ambience-underwater stop 1.200",
    "loop ambience-surface#3 gain=0.000",
  ];

  it("lists chain-rattle as the only loop disabled by default", () => {
    expect(DISABLED_BY_DEFAULT).toEqual(["chain-rattle"]);
    expect(Object.isFrozen(DISABLED_BY_DEFAULT)).toBe(true);
  });

  it("keeps the rattle's manifest entry and asset", () => {
    const rattle = SOUND_MANIFEST["chain-rattle"];
    expect(rattle.kind).toBe("loop");
    expect(rattle.category).toBe("sfx");
    expect(rattle.asset).not.toBeNull();
  });

  it("a full crash round: every other cue as before, and no rattle loop", () => {
    const env = defaultSetup();
    crashRound(env);
    expect(env.audio.log).toEqual(CRASH_ROUND_LOG_NO_RATTLE);
    expect(env.audio.log.some((line) => line.includes("chain-rattle"))).toBe(false);
    // Differs from the all-on golden log only by the rattle's and the creak's lines.
    const withRattle = setup();
    crashRound(withRattle);
    expect(
      withRattle.audio.log.filter(
        (line) => !line.includes("chain-rattle") && !line.includes("tension-creak"),
      ),
    ).toEqual(
      CRASH_ROUND_LOG_NO_RATTLE.map((line) =>
        line === "loop ambience-surface#3 gain=0.000" ? "loop ambience-surface#4 gain=0.000" : line,
      ),
    );
  });

  it("chain-unspool and chain-snap still play", () => {
    const { events, audio, director } = defaultSetup();
    director.update(frame({ phase: "idle" }));
    events.emit("diveStarted", ev.dive());
    director.update(frame({ phase: "diving" }));
    events.emit("crashed", ev.crash());
    director.update(frame({ phase: "crashed" }));
    expect(audio.plays()).toEqual([
      "play chain-unspool",
      "play water-splash",
      "play chain-snap",
      "play crash-boom",
    ]);
  });

  it("diving wants only the underwater bed, whatever the multiplier, across pause and wake", () => {
    const { audio, director } = defaultSetup();
    for (const multiplier of [1, 2, 10, 1000]) {
      director.update(frame({ phase: "diving", multiplier, depthRatio: 0.5 }));
    }
    director.wake();
    director.pause();
    director.update(frame({ phase: "diving", multiplier: 5 }));
    director.dispose();
    expect(audio.log.some((line) => line.includes("chain-rattle"))).toBe(false);
    expect(audio.latest("chain-rattle")).toBeUndefined();
  });

  it("{ chainRattle: false } is the default; { chainRattle: true } restores the rattle", () => {
    const off = defaultSetup({ chainRattle: false });
    const def = defaultSetup();
    crashRound(off);
    crashRound(def);
    expect(off.audio.log).toEqual(def.audio.log);
    const on = defaultSetup({ chainRattle: true, tensionCreaks: true });
    crashRound(on);
    expect(on.audio.log).toEqual(CRASH_ROUND_LOG);
    const rattleOnly = defaultSetup({ chainRattle: true });
    crashRound(rattleOnly);
    expect(rattleOnly.audio.log).toEqual(
      CRASH_ROUND_LOG.filter((line) => !line.includes("tension-creak")),
    );
  });

  it("the real manager starts the underwater bed and no rattle voice while diving", async () => {
    const stack = directStack({}, {});
    await stack.audio.unlock();
    stack.director.update(frame({ phase: "idle" }));
    stack.events.emit("diveStarted", ev.dive());
    for (let i = 0; i < 5; i++) stack.director.update(frame({ phase: "diving", multiplier: 3 }));
    expect(stack.sourcesOf("ambience-underwater")).toHaveLength(1);
    expect(stack.sourcesOf("chain-rattle")).toHaveLength(0);
  });
});

// ----- A-OWN: the tension creaks are off by default -----

describe("tension creaks disabled by default (A-OWN)", () => {
  function defaultSetup(options?: Parameters<typeof createAudioDirector>[2]) {
    const events = new FakeEvents();
    const audio = new RecordingAudio();
    const director =
      options === undefined
        ? createAudioDirector(events, audio)
        : createAudioDirector(events, audio, options);
    return { events, audio, director };
  }

  /** Every threshold, one at a time, then a jump past all of them, in two rounds. */
  function climb(env: { director: AudioDirector }) {
    const step = (phase: AudioFrame["phase"], multiplier = 1) =>
      env.director.update(frame({ phase, multiplier }));
    step("idle");
    for (const m of [1, ...TENSION_THRESHOLDS, 1e6]) step("diving", m);
    step("crashed", 1e6);
    step("idle");
    step("diving", 1);
    step("diving", 1e6); // every threshold in one frame
    step("cashed", 1e6);
    step("bonus", 1e6);
  }

  it("lists both creaks (and, since BET-1x2, bet-clink-2) as the one-shots disabled by default, and the host's skip list holds every disabled cue", () => {
    expect(DISABLED_ONE_SHOTS_BY_DEFAULT).toEqual([
      "tension-creak-1",
      "tension-creak-2",
      "bet-clink-2",
    ]);
    expect(Object.isFrozen(DISABLED_ONE_SHOTS_BY_DEFAULT)).toBe(true);
    expect([...DISABLED_CUES_BY_DEFAULT].sort()).toEqual(
      ["chain-rattle", "tension-creak-1", "tension-creak-2", "bet-clink-2"].sort(),
    );
    expect(Object.isFrozen(DISABLED_CUES_BY_DEFAULT)).toBe(true);
  });

  it("keeps both creaks' manifest entries and assets, and the thresholds", () => {
    for (const id of DISABLED_ONE_SHOTS_BY_DEFAULT) {
      expect(SOUND_MANIFEST[id].kind).toBe("oneShot");
      expect(SOUND_MANIFEST[id].asset).not.toBeNull();
    }
    expect(TENSION_THRESHOLDS).toEqual([2, 3, 5, 10, 20, 50]);
  });

  it("no multiplier, threshold, jump or phase plays a creak", () => {
    const env = defaultSetup();
    climb(env);
    expect(env.audio.log.some((line) => line.includes("tension-creak"))).toBe(false);
    expect(env.audio.latest("tension-creak-1")).toBeUndefined();
    expect(env.audio.latest("tension-creak-2")).toBeUndefined();
  });

  it("no engine event plays a creak, and every other cue of a full crash round still plays", () => {
    const env = defaultSetup();
    crashRound(env);
    expect(env.audio.plays()).toEqual([
      "play bet-clink-1",
      "play bet-clink-1",
      "play chain-unspool",
      "play water-splash",
      "play chain-snap",
      "play crash-boom",
    ]);
  });

  it("a goldfish pickup on the frame that crosses a threshold still chimes", () => {
    const { audio, director } = defaultSetup();
    director.update(frame({ phase: "diving", multiplier: 1, boost: 0 }));
    director.update(frame({ phase: "diving", multiplier: 2.5, boost: 1 }));
    expect(audio.plays()).toEqual(["play goldfish-chime"]);
  });

  it("{ tensionCreaks: false } is the default; { tensionCreaks: true } restores them exactly", () => {
    const off = defaultSetup({ tensionCreaks: false });
    const def = defaultSetup();
    climb(off);
    climb(def);
    expect(off.audio.log).toEqual(def.audio.log);
    const on = defaultSetup({ tensionCreaks: true });
    climb(on);
    expect(on.audio.plays()).toEqual([
      "play tension-creak-1",
      "play tension-creak-2",
      "play tension-creak-1",
      "play tension-creak-2",
      "play tension-creak-1",
      "play tension-creak-2",
      "play tension-creak-2", // second round: every threshold at once, level 6
    ]);
    // Everything but the creaks is identical.
    expect(on.audio.log.filter((line) => !line.includes("tension-creak"))).toEqual(def.audio.log);
  });
});

// ----- A-OWN.1: the sea-floor thud lands on the anchor's touchdown -----

describe("floor-thud timed on the anchor's touchdown (A-OWN.1)", () => {
  /** A dive to the floor; returns a stepper that advances the impact clock by DT per frame. */
  function impactRound(touchdownS: number) {
    const { events, audio, director } = setup();
    director.update(frame({ phase: "diving", depthRatio: 1, multiplier: 1000, seaFloor: null }));
    audio.take();
    let elapsed = 0;
    const step = (phase: AudioFrame["phase"] = "cashed") => {
      director.update(
        frame({ phase, depthRatio: 1, multiplier: 1000, seaFloor: { elapsed, touchdownS } }),
      );
      elapsed += DT;
    };
    return { events, audio, director, step, elapsedNow: () => elapsed };
  }

  it("the jackpot stinger plays on the event; the thud waits for touchdown − FLOOR_THUD_HIT_S", () => {
    const r = impactRound(0.6);
    r.events.emit("shipImpact", ev.impact());
    r.step();
    expect(r.audio.plays()).toEqual(["play jackpot-stinger"]);
    r.audio.take();
    let frames = 0;
    while (!r.audio.plays().includes("play floor-thud") && frames < 200) {
      r.step();
      frames++;
    }
    // It starts on the first frame whose impact clock reached 0.6 − 0.3 s.
    expect(FLOOR_THUD_HIT_S).toBe(0.3);
    expect(r.elapsedNow() - DT).toBeGreaterThanOrEqual(0.6 - FLOOR_THUD_HIT_S - 1e-9);
    expect(r.elapsedNow() - DT).toBeLessThan(0.6 - FLOOR_THUD_HIT_S + DT);
    expect(r.audio.plays()).toEqual(["play floor-thud"]);
    // Exactly once.
    r.audio.take();
    for (let i = 0; i < 120; i++) r.step();
    expect(r.audio.plays()).toEqual([]);
  });

  it("a touchdown at or before the hit offset plays the thud on the event frame", () => {
    const r = impactRound(0.3);
    r.events.emit("shipImpact", ev.impact());
    r.step();
    // Same frame; the held thud is added after the event's own cues.
    expect(r.audio.plays()).toEqual(["play jackpot-stinger", "play floor-thud"]);
  });

  it("without landing geometry the thud plays on the event, as before", () => {
    const { events, audio, director } = setup();
    director.update(frame({ phase: "diving", depthRatio: 1, multiplier: 1000 }));
    audio.take();
    events.emit("shipImpact", ev.impact());
    director.update(frame({ phase: "cashed", depthRatio: 1, multiplier: 1000 }));
    expect(audio.plays()).toEqual(["play floor-thud", "play jackpot-stinger"]);
  });

  it("a floor not reached yet (null) holds the thud, at most FLOOR_THUD_MAX_WAIT_S", () => {
    const { events, audio, director } = setup();
    director.update(frame({ phase: "diving", depthRatio: 1, seaFloor: null }));
    events.emit("shipImpact", ev.impact());
    let frames = 0;
    do {
      director.update(frame({ phase: "cashed", depthRatio: 1, seaFloor: null }));
      frames++;
    } while (!audio.plays().includes("play floor-thud") && frames < 500);
    expect(frames * DT).toBeGreaterThanOrEqual(FLOOR_THUD_MAX_WAIT_S);
    expect(frames * DT).toBeLessThan(FLOOR_THUD_MAX_WAIT_S + 2 * DT);
  });

  it("a pause or a new betting window drops a held thud; the next round times its own", () => {
    const paused = impactRound(0.7);
    paused.events.emit("shipImpact", ev.impact());
    paused.step();
    paused.director.pause();
    for (let i = 0; i < 60; i++) paused.step();
    expect(paused.audio.plays()).toEqual(["play jackpot-stinger"]);

    const next = impactRound(0.7);
    next.events.emit("shipImpact", ev.impact());
    next.step();
    next.step("idle");
    for (let i = 0; i < 60; i++) next.step("idle");
    expect(next.audio.plays().filter((line) => line === "play floor-thud")).toEqual([]);
    // Repeated rounds: each impact plays its own thud once.
    for (let round = 0; round < 3; round++) {
      next.events.emit("shipImpact", ev.impact());
      for (let i = 0; i < 40; i++) next.step();
      next.step("idle");
    }
    expect(next.audio.plays().filter((line) => line === "play floor-thud")).toHaveLength(3);
  });

  it("a held thud is not merged with nor blocked by the chest cues that follow", () => {
    const r = impactRound(0.7);
    r.events.emit("shipImpact", ev.impact());
    r.step();
    for (let i = 0; i < 10; i++) r.step();
    r.events.emit("chestsRevealed", ev.reveal());
    for (let i = 0; i < 30; i++) r.step("bonus");
    expect(r.audio.plays()).toEqual([
      "play jackpot-stinger",
      "play treasure-shimmer",
      "play floor-thud",
    ]);
  });
});

describe("BET-1x2 — both bet buttons play the approved BET 1 clink", () => {
  const defaults = () => {
    const events = new FakeEvents();
    const audio = new RecordingAudio();
    const director = createAudioDirector(events, audio);
    director.update(frame());
    audio.take();
    return { events, audio, director };
  };

  it("BET 1 and BET 2 each play bet-clink-1; neither plays bet-clink-2", () => {
    const env = defaults();
    env.events.emit("betPlaced", ev.bet(0));
    env.director.update(frame());
    env.events.emit("betPlaced", ev.bet(1));
    env.director.update(frame());
    expect(env.audio.plays()).toEqual(["play bet-clink-1", "play bet-clink-1"]);
  });

  it("same cue, same parameters: no gain, rate or other option on either play", () => {
    const env = defaults();
    env.events.emit("betPlaced", ev.bet(0));
    env.events.emit("betPlaced", ev.bet(1));
    env.director.update(frame());
    const lines = env.audio.take().filter((l) => l.startsWith("play "));
    expect(lines).toEqual(["play bet-clink-1", "play bet-clink-1"]);
  });

  it("two bets in one frame are two play requests; a duplicate event of one slot is still merged", () => {
    const env = defaults();
    env.events.emit("betPlaced", ev.bet(0));
    env.events.emit("betPlaced", ev.bet(1));
    env.events.emit("betPlaced", ev.bet(1));
    env.director.update(frame());
    expect(env.audio.plays()).toEqual(["play bet-clink-1", "play bet-clink-1"]);
  });

  it("the clink plays on the frame the bet lands, not later", () => {
    const env = defaults();
    env.events.emit("betPlaced", ev.bet(1));
    env.director.update(frame({ dt: 0 }));
    expect(env.audio.plays()).toEqual(["play bet-clink-1"]);
  });

  it("a rejected or invalid bet plays nothing", () => {
    const env = defaults();
    for (const slot of [0, 1] as const) {
      env.events.emit("commandRejected", {
        roundId: 1,
        command: {
          type: "placeBet",
          slot,
          amount: 10,
        } as unknown as EngineEventMap["commandRejected"]["command"],
        reason: "insufficient",
      });
    }
    env.events.emit("betPlaced", { roundId: 1, slot: 2, amount: 10 } as never);
    env.director.update(frame());
    expect(env.audio.plays()).toEqual([]);
  });

  it("rollback: { betClink2: true } restores bet-clink-2 for BET 2 only", () => {
    const events = new FakeEvents();
    const audio = new RecordingAudio();
    const director = createAudioDirector(events, audio, { betClink2: true });
    director.update(frame());
    audio.take();
    events.emit("betPlaced", ev.bet(0));
    events.emit("betPlaced", ev.bet(1));
    director.update(frame());
    expect(audio.plays()).toEqual(["play bet-clink-1", "play bet-clink-2"]);
  });

  it("bet-clink-2 is not loaded by default, but its manifest entry is kept", () => {
    expect(DISABLED_ONE_SHOTS_BY_DEFAULT).toContain("bet-clink-2");
    expect(DISABLED_CUES_BY_DEFAULT).toContain("bet-clink-2");
    expect(DISABLED_CUES_BY_DEFAULT).not.toContain("bet-clink-1");
    expect(SOUND_MANIFEST["bet-clink-2"].asset).not.toBeNull();
  });
});
