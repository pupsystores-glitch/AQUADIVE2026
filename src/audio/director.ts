// AudioDirector — engine events and per-frame state → cues (Sprint 5 /
// Phase 7, step A4a; docs/08_AUDIO_FX_ARCHITECTURE.md §3.2, §3.4, §5, §7.4).
//
// The only place that knows which game moment plays which cue. It is game
// logic with no browser code: it sees a narrow engine event source and the
// AudioManager interface, and nothing else. It never touches bus gains,
// mute or the AudioContext (the A4b UI host owns those), never reads money,
// never submits commands and never writes a store.
//
// How a frame works:
//
// - **Event listeners only buffer.** The engine dispatches its events inside
//   `engine.advance()`, before the driver's sink runs, so every event of one
//   rendered frame is buffered before that frame's `update()`. Events that
//   arrive while the director is paused are dropped.
// - **`update(frame)` runs once per rendered frame**, in this order:
//   1. advance the fades and the duck by `frame.dt`;
//   2. collect one-shots: the buffered events in arrival order, then the
//      state edges (goldfish boost, tension thresholds);
//   3. bring the loops in line with `frame.phase` and apply their values;
//   4. play the collected one-shots.
// - **One-shot merging.** Each cue id plays at most once per `update()`.
//   Different cue ids never merge. The merges this can cause are listed in
//   docs/08 §7.4; the only one the engine can produce today is the Dual Bet
//   double cashout in one frame, which plays one `cashout-coins` (Q7,
//   owner-approved for A4a).
// - **Loops follow the phase, not events**, so re-attaching mid-dive
//   rebuilds the rattle and the underwater bed without replaying the splash.
//   The director keeps at most one handle per loop cue, and stops every
//   handle before dropping it (docs/08 §7.2 caller obligation).
// - **A loop starts with its values (A4a.1).** `loop(cue, options)` gets the
//   initial gain, rate and filter, so a voice never starts loud, unfiltered
//   or at the wrong rate (docs/08 §14 risk 15). A bed starts at gain 0.
// - **A bed's fade-in advances only while it is audible (A4a.1).** Its level
//   rises by `dt` only on frames where `handle.isAudible()` is true, so a bed
//   waiting for unlock, decoding or a slot, or held by mute, host suspension,
//   an interruption or a pending or refused resume, makes no fade progress
//   and starts from silence (docs/08 §14 risk 15b).
// - **A loop handle is called only when its value moves past a threshold**
//   (each handle call reschedules automation in the manager). `wake()`
//   re-applies every value: the A4b host calls it on the sound bank's
//   `onReady`, so a loop waiting for its cue starts at once (docs/08 §14
//   risk 13).
//
// Deterministic: no timers, no wall clock, no randomness. Fades and the duck
// advance by `frame.dt` only, so the same event and frame script always
// produces the same cue log.
//
// Total: no entry point throws. Every manager call and every entry point is
// guarded; each failure kind is logged once with `console.error`. An audio
// failure must never stop the render loop (docs/08 §14, A4b R1).
//
// Every number below is a provisional engineering default, pinned by tests
// and tuned by ear in the A6 listening pass. None is a sound-design decision.
//
// Not here: music (Q8 deferred, no MusicController), countdown ticks (Q9
// deferred), bus gains and settings (the A4b host), the unlock, gesture and
// visibility lifecycle (A4b), real assets (A6).
//
// Imports: type-only, from the AudioManager, the manifest and the `@/engine`
// facade (docs/08 §6 import rule).

import type { EngineEventMap, EnginePublicState } from "@/engine";
import type { AudioManager, LoopHandle, LoopOptions, PlayOptions } from "./audio-manager";
import type { CueId, LoopCueId, OneShotCueId } from "./manifest";

// ----- inputs -----

/** The renderer's phase strings (`EnginePublicState["phase"]`), declared here so `src/audio` never imports `src/rendering`. */
export type AudioPhase = "idle" | "diving" | "cashed" | "crashed" | "bonus";

// Compile-time check: AudioPhase and the engine's projected phase stay equal.
type SameType<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const PHASES_MATCH: SameType<AudioPhase, EnginePublicState["phase"]> = true;

/** What the director reads each rendered frame. Assembled by the A4b host from engine projections. */
export interface AudioFrame {
  readonly phase: AudioPhase;
  /** 0 at the surface, 1 on the sea floor. */
  readonly depthRatio: number;
  readonly multiplier: number;
  /** 0..1; a goldfish pickup is a rising edge. */
  readonly boost: number;
  /** Seconds since the previous rendered frame (the engine's clamped `frameDt`). */
  readonly dt: number;
}

/** The engine event bus as the director sees it. `EventBus<EngineEventMap>` satisfies it. */
export interface AudioEventSource {
  on<K extends keyof EngineEventMap>(
    name: K,
    listener: (payload: EngineEventMap[K]) => void,
  ): () => void;
}

export interface AudioDirector {
  /** Once per rendered frame, after the engine has advanced. Never throws. */
  update(frame: AudioFrame): void;
  /**
   * Canvas detach: stops every loop, drops buffered events and resets the
   * edge trackers. The next `update()` resumes from that frame's state,
   * without replaying anything. Never throws.
   */
  pause(): void;
  /** Re-applies every live loop's values, so a loop waiting for its cue starts now. Never throws. */
  wake(): void;
  /** Unsubscribes, stops every loop. Every later call is a no-op. Never throws. */
  dispose(): void;
}

// ----- provisional values (docs/08 §7.4; tuned in A6) -----

/** Chain-rattle gain: clamp(base + perOctave·log₂ m, base, max). */
export const RATTLE_GAIN = Object.freeze({ base: 0.4, perOctave: 0.2, max: 1 });

/** Chain-rattle playback rate: clamp(base + perOctave·log₂ m, base, max). */
export const RATTLE_RATE = Object.freeze({ base: 0.85, perOctave: 0.1, max: 1.5 });

/** Rattle fade-out when the dive ends, by the phase it ends in. */
export const RATTLE_STOP_FADE_S = Object.freeze({ crashed: 0.03, cashed: 0.15, other: 0.15 });

/** Fade-out of every loop on `pause()` and `dispose()`. */
export const DETACH_FADE_S = 0.05;

/** Ambience crossfade: the old bed stops over this long; the new bed's gain rises linearly over it. */
export const BED_CROSSFADE_S = 1.2;

/** Underwater bed low-pass: SURFACE·(FLOOR/SURFACE)^depth, so 6000 Hz at the surface, 500 Hz on the floor. */
export const UNDERWATER_FILTER_HZ = Object.freeze({ surface: 6000, floor: 500 });

/** Multiplier thresholds for the tension creaks. Each fires once per round, while diving. */
export const TENSION_THRESHOLDS: readonly number[] = Object.freeze([2, 3, 5, 10, 20, 50]);

/** A goldfish pickup: `boost` rose by more than this since the previous frame. */
export const BOOST_EDGE = 0.05;

/** Ambience ducking under crash-boom and jackpot-stinger: ×factor, held, then released linearly. */
export const DUCK = Object.freeze({ factor: 0.5, holdS: 1, releaseS: 0.8 });

/** Chest coin-burst gain by `chestMultiplier`. The lid creak plays at full gain. */
export const CHEST_BURST_GAIN = Object.freeze({
  low: 0.6,
  mid: 0.8,
  high: 1,
  midFrom: 3,
  highFrom: 10,
});

/** A handle value is re-sent only when it moves more than this (filter: relative). */
export const HANDLE_EPSILON = Object.freeze({ gain: 0.005, rate: 0.005, filterRatio: 0.01 });

/** A gain fading onto 0 or 1 is sent once it differs by more than this, so a fade always lands exactly. */
const ENDPOINT_EPSILON = 1e-6;

// ----- pure mappings (exported for tests) -----

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A multiplier the director can use: anything below 1, or not a number, is 1. */
const safeMultiplier = (m: number) => (m >= 1 ? m : 1);

/** A depth in 0..1: NaN and negatives are 0, anything above 1 is 1. */
const safeDepth = (d: number) => (d >= 0 ? Math.min(d, 1) : 0);

export function rattleGain(multiplier: number): number {
  const m = safeMultiplier(multiplier);
  return clamp(
    RATTLE_GAIN.base + RATTLE_GAIN.perOctave * Math.log2(m),
    RATTLE_GAIN.base,
    RATTLE_GAIN.max,
  );
}

export function rattleRate(multiplier: number): number {
  const m = safeMultiplier(multiplier);
  return clamp(
    RATTLE_RATE.base + RATTLE_RATE.perOctave * Math.log2(m),
    RATTLE_RATE.base,
    RATTLE_RATE.max,
  );
}

export function underwaterFilterHz(depthRatio: number): number {
  const { surface, floor } = UNDERWATER_FILTER_HZ;
  return surface * Math.pow(floor / surface, safeDepth(depthRatio));
}

export function chestBurstGain(chestMultiplier: number): number {
  const g = CHEST_BURST_GAIN;
  if (chestMultiplier >= g.highFrom) return g.high;
  if (chestMultiplier >= g.midFrom) return g.mid;
  return g.low;
}

/** The ambience duck factor `elapsedS` after the last ducking cue. */
export function duckFactor(elapsedS: number): number {
  if (!(elapsedS >= 0)) return 1;
  if (elapsedS < DUCK.holdS) return DUCK.factor;
  const release = (elapsedS - DUCK.holdS) / DUCK.releaseS;
  if (release >= 1) return 1;
  return DUCK.factor + (1 - DUCK.factor) * release;
}

/** How many tension thresholds a multiplier has reached. */
export function tensionLevel(multiplier: number): number {
  const m = safeMultiplier(multiplier);
  let level = 0;
  while (level < TENSION_THRESHOLDS.length && m >= TENSION_THRESHOLDS[level]) level++;
  return level;
}

// ----- event and phase tables (docs/08 §5) -----

/** Cues whose play ducks the ambience. */
const DUCKING_CUES: ReadonlySet<OneShotCueId> = new Set<OneShotCueId>([
  "crash-boom",
  "jackpot-stinger",
]);

/** The loops each phase wants. Unknown phases want none. */
const LOOPS_BY_PHASE: Readonly<Record<AudioPhase, readonly LoopCueId[]>> = {
  idle: ["ambience-surface"],
  diving: ["ambience-underwater", "chain-rattle"],
  crashed: ["ambience-underwater"],
  cashed: ["ambience-underwater"],
  bonus: ["ambience-underwater"],
};

/** Fixed order for stopping loops, so the cue log is deterministic. */
const LOOP_ORDER: readonly LoopCueId[] = [
  "chain-rattle",
  "ambience-underwater",
  "ambience-surface",
];

const isBed = (cue: LoopCueId) => cue !== "chain-rattle";

/** One buffered engine event, in arrival order. */
type BufferedEvent = {
  [K in keyof EngineEventMap]: { readonly name: K; readonly payload: EngineEventMap[K] };
}[keyof EngineEventMap];

/** The events the director listens to. Every other event plays nothing. */
const LISTENED: readonly (keyof EngineEventMap)[] = [
  "betPlaced",
  "diveStarted",
  "cashedOut",
  "crashed",
  "shipImpact",
  "chestsRevealed",
  "chestPicked",
];

interface OneShot {
  readonly cue: OneShotCueId;
  readonly opts?: PlayOptions;
}

/** The one-shots one event plays (docs/08 §5). The bet amount is never read. */
function cuesFor(event: BufferedEvent): readonly OneShot[] {
  switch (event.name) {
    case "betPlaced":
      // Local slots are literal 0 and 1 (`BET_SLOTS` is a value import).
      if (event.payload.slot === 0) return [{ cue: "bet-clink-1" }];
      if (event.payload.slot === 1) return [{ cue: "bet-clink-2" }];
      return [];
    case "diveStarted":
      return [{ cue: "chain-unspool" }, { cue: "water-splash" }];
    case "cashedOut":
      // Q7: only the local player's own slots. In Phase 7 every cashout is local.
      return event.payload.slot === 0 || event.payload.slot === 1 ? [{ cue: "cashout-coins" }] : [];
    case "crashed":
      // Q7: plays for spectators too.
      return [{ cue: "chain-snap" }, { cue: "crash-boom" }];
    case "shipImpact":
      // Q7: plays for spectators too. The shimmer waits for chestsRevealed (U4).
      return [{ cue: "floor-thud" }, { cue: "jackpot-stinger" }];
    case "chestsRevealed":
      return [{ cue: "treasure-shimmer" }];
    case "chestPicked":
      return [
        { cue: "chest-lid-creak" },
        { cue: "chest-coin-burst", opts: { gain: chestBurstGain(event.payload.chestMultiplier) } },
      ];
    default:
      return [];
  }
}

// ----- implementation -----

interface LiveLoop {
  readonly cue: LoopCueId;
  readonly handle: LoopHandle;
  /** Bed fade-in, 0..1, advanced only while the handle is audible (A4a.1); the rattle is always 1. */
  level: number;
  /** The values last sent to the handle; undefined until sent. */
  gain?: number;
  rate?: number;
  filter?: number;
}

export function createAudioDirector(
  events: AudioEventSource,
  audio: AudioManager<CueId>,
): AudioDirector {
  const logged = new Set<string>();
  const report = (kind: string, error: unknown) => {
    if (logged.has(kind)) return;
    logged.add(kind);
    console.error(`[audio] director: ${kind} failed; audio continues.`, error);
  };
  /** Runs one step; a throw is logged once per kind. Returns false when it threw. */
  const guard = (kind: string, step: () => void): boolean => {
    try {
      step();
      return true;
    } catch (error) {
      report(kind, error);
      return false;
    }
  };

  let disposed = false;
  let paused = false;
  let buffer: BufferedEvent[] = [];
  const loops = new Map<LoopCueId, LiveLoop>();

  // Edge trackers. `baseline` makes the next frame record state without playing edges.
  let baseline = true;
  let previousBoost = 0;
  let tension = 0;
  /** The depth the underwater filter follows; frozen outside the dive. */
  let filterDepth: number | null = null;
  let duckElapsed = Number.POSITIVE_INFINITY;

  const unsubscribers: (() => void)[] = [];
  for (const name of LISTENED) {
    guard("subscribe", () => {
      unsubscribers.push(
        events.on(name, (payload) => {
          if (disposed || paused) return;
          buffer.push({ name, payload } as BufferedEvent);
        }),
      );
    });
  }

  const resetEdges = () => {
    baseline = true;
    previousBoost = 0;
    tension = 0;
    filterDepth = null;
    duckElapsed = Number.POSITIVE_INFINITY;
  };

  const stopLoop = (live: LiveLoop, fadeS: number) => {
    loops.delete(live.cue);
    guard("loop stop", () => live.handle.stop(fadeS));
  };

  const stopAll = (fadeS: number) => {
    for (const cue of LOOP_ORDER) {
      const live = loops.get(cue);
      if (live) stopLoop(live, fadeS);
    }
  };

  const fadeFor = (cue: LoopCueId, phase: AudioPhase): number => {
    if (isBed(cue)) return BED_CROSSFADE_S;
    if (phase === "crashed") return RATTLE_STOP_FADE_S.crashed;
    if (phase === "cashed") return RATTLE_STOP_FADE_S.cashed;
    return RATTLE_STOP_FADE_S.other;
  };

  const sendGain = (live: LiveLoop, gain: number) => {
    const last = live.gain;
    const moved =
      last === undefined ||
      Math.abs(gain - last) > HANDLE_EPSILON.gain ||
      ((gain === 0 || gain === 1) && Math.abs(gain - last) > ENDPOINT_EPSILON);
    if (moved && guard("loop gain", () => live.handle.setGain(gain))) live.gain = gain;
  };

  const sendRate = (live: LiveLoop, rate: number) => {
    const last = live.rate;
    if (last !== undefined && Math.abs(rate - last) <= HANDLE_EPSILON.rate) return;
    if (guard("loop rate", () => live.handle.setRate(rate))) live.rate = rate;
  };

  const sendFilter = (live: LiveLoop, hz: number) => {
    const last = live.filter;
    if (last !== undefined && Math.abs(hz - last) <= last * HANDLE_EPSILON.filterRatio) return;
    if (guard("loop filter", () => live.handle.setFilter(hz))) live.filter = hz;
  };

  /** A4a.1: the handle's playback predicate; a throw counts as not audible, so the bed stays quiet. */
  const audible = (live: LiveLoop): boolean => {
    let result = false;
    guard("loop audible", () => {
      result = live.handle.isAudible() === true;
    });
    return result;
  };

  /**
   * Starts one loop with its initial values (A4a.1) and records them as sent,
   * so the same frame makes no redundant handle call.
   */
  const startLoop = (cue: LoopCueId, multiplier: number, depth: number) => {
    const options: LoopOptions =
      cue === "chain-rattle"
        ? { gain: rattleGain(multiplier), rate: rattleRate(multiplier) }
        : cue === "ambience-underwater"
          ? { gain: 0, filterHz: underwaterFilterHz(depth) }
          : { gain: 0 };
    const handle = audio.loop(cue, options);
    loops.set(cue, {
      cue,
      handle,
      level: isBed(cue) ? 0 : 1,
      gain: options.gain,
      rate: options.rate,
      filter: options.filterHz,
    });
  };

  const runFrame = (frame: AudioFrame) => {
    const dt = Number.isFinite(frame.dt) && frame.dt > 0 ? frame.dt : 0;
    const phase = frame.phase;
    const multiplier = frame.multiplier;
    const boost = Number.isFinite(frame.boost) ? frame.boost : 0;
    const wanted = LOOPS_BY_PHASE[phase] ?? [];

    // 1. Time: the duck and the bed fade-ins advance by dt; a bed only while audible (A4a.1).
    duckElapsed += dt;
    for (const live of loops.values()) {
      if (isBed(live.cue) && live.level < 1 && audible(live)) {
        live.level = Math.min(1, live.level + dt / BED_CROSSFADE_S);
      }
    }

    // 2. One-shots, merged per cue id: buffered events, then state edges.
    const plays: OneShot[] = [];
    const seen = new Set<OneShotCueId>();
    const add = (shot: OneShot) => {
      if (seen.has(shot.cue)) return;
      seen.add(shot.cue);
      plays.push(shot);
    };
    const batch = buffer;
    buffer = [];
    for (const event of batch) for (const shot of cuesFor(event)) add(shot);

    const reached = phase === "diving" ? tensionLevel(multiplier) : 0;
    if (baseline) {
      // First frame after creation or a pause: record, never replay.
      baseline = false;
      tension = reached;
      filterDepth = null;
    } else {
      if (boost - previousBoost > BOOST_EDGE) add({ cue: "goldfish-chime" });
      if (phase === "idle") {
        tension = 0;
      } else if (reached > tension) {
        // Several thresholds in one frame: only the highest one's cue.
        add({ cue: reached % 2 === 1 ? "tension-creak-1" : "tension-creak-2" });
        tension = reached;
      }
    }
    previousBoost = boost;
    for (const shot of plays) if (DUCKING_CUES.has(shot.cue)) duckElapsed = 0;

    // 3. Loops: stop the unwanted (fixed order), start the missing, apply values.
    for (const cue of LOOP_ORDER) {
      const live = loops.get(cue);
      if (live && !wanted.includes(cue)) stopLoop(live, fadeFor(cue, phase));
    }
    // The filter depth and the duck come first: a new loop starts with them (A4a.1).
    if (phase === "diving" || filterDepth === null) filterDepth = safeDepth(frame.depthRatio);
    const depth = filterDepth;
    const duck = duckFactor(duckElapsed);
    for (const cue of wanted) {
      if (loops.has(cue)) continue;
      guard("loop start", () => startLoop(cue, multiplier, depth));
    }

    for (const cue of wanted) {
      const live = loops.get(cue);
      if (!live) continue;
      if (cue === "chain-rattle") {
        sendGain(live, rattleGain(multiplier));
        sendRate(live, rattleRate(multiplier));
      } else {
        sendGain(live, live.level * duck);
        if (cue === "ambience-underwater") sendFilter(live, underwaterFilterHz(filterDepth));
      }
    }

    // 4. Play.
    for (const shot of plays) {
      guard("play", () => (shot.opts ? audio.play(shot.cue, shot.opts) : audio.play(shot.cue)));
    }
  };

  return {
    update(frame) {
      if (disposed) return;
      guard("update", () => {
        paused = false;
        runFrame(frame);
      });
    },
    pause() {
      if (disposed) return;
      guard("pause", () => {
        paused = true;
        buffer = [];
        stopAll(DETACH_FADE_S);
        resetEdges();
      });
    },
    wake() {
      if (disposed) return;
      guard("wake", () => {
        for (const cue of LOOP_ORDER) {
          const live = loops.get(cue);
          if (!live) continue;
          const { handle, gain, rate, filter } = live;
          if (gain !== undefined) guard("loop gain", () => handle.setGain(gain));
          if (rate !== undefined) guard("loop rate", () => handle.setRate(rate));
          if (filter !== undefined) guard("loop filter", () => handle.setFilter(filter));
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      guard("dispose", () => {
        for (const unsubscribe of unsubscribers.splice(0)) guard("unsubscribe", unsubscribe);
        buffer = [];
        stopAll(DETACH_FADE_S);
      });
    },
  };
}
