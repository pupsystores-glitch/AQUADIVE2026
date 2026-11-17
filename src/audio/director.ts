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
// The continuous chain rattle is off by default (A6.1, owner decision): the
// director starts it only when created with `{ chainRattle: true }`. Its
// manifest entry, asset and every rattle value below are kept unchanged.
// `chain-unspool` and `chain-snap` are one-shots and are not affected.
//
// The tension creaks are off by default too (A-OWN, owner decision 2026-11-17):
// the director plays `tension-creak-1` and `tension-creak-2` only when
// created with `{ tensionCreaks: true }`. The thresholds, the edge tracking
// and both manifest entries and files are kept, so the switch alone restores
// them; with it off no multiplier, phase or event plays either creak.
//
// Sea-floor impact timing (A-OWN.1, owner report 2026-11-17): the engine
// emits `shipImpact` when the ship reaches the floor, but the drawn anchor is
// still sinking its last stretch then; it stands on the sand 0.3–0.7 s later,
// depending on the viewport (`src/rendering/layers/actor.ts`, landing).
// When the frame carries `seaFloor` (the host's landing geometry), the
// `floor-thud` from `shipImpact` waits until the renderer's own impact clock
// reaches the touchdown minus `FLOOR_THUD_HIT_S`, so the recording's hit
// lands on the touchdown. Without `seaFloor` it plays on the event, as
// before. `jackpot-stinger` keeps playing on the event, with the jackpot
// flash. A held thud plays once, at the latest `FLOOR_THUD_MAX_WAIT_S` after
// the event; a pause, a dispose or a new betting window drops it.
//
// Music (M-OWN, docs/08 §7.6): when created with `{ music: track }`, the
// director asks the manager for the one music stream on its first frame and
// keeps that one handle for its whole life. The music follows no phase and no
// event: a round transition never touches it, so it never restarts. Playing
// `crash-boom`, `cashout-coins` or `jackpot-stinger` ducks it (`MUSIC_DUCK`
// below); the duck advances by `frame.dt`. Overlapping ducks use the deepest
// one, and the level never jumps. `pause()` holds the stream (it keeps its
// position), the next `update()` plays on, and `dispose()` stops it. Without
// the option the director plays no music.
//
// Every number below is a provisional engineering default, pinned by tests
// and tuned by ear in the A6 listening pass. None is a sound-design decision.
//
// Not here: adaptive music stems (deferred; no syncGroup, no
// MusicController), countdown ticks (Q9 deferred), bus gains and settings
// (the A4b host), the unlock, gesture and visibility lifecycle (A4b), real
// assets (A6).
//
// Imports: type-only, from the AudioManager, the manifest and the `@/engine`
// facade (docs/08 §6 import rule).

import type { EngineEventMap, EnginePublicState } from "@/engine";
import type {
  AudioManager,
  LoopHandle,
  LoopOptions,
  PlayOptions,
  StreamHandle,
  StreamOptions,
} from "./audio-manager";
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
  /**
   * The anchor's landing on the sea floor (A-OWN.1), for timing `floor-thud`:
   * - an object: the ship has hit the floor; `elapsed` is the renderer's own
   *   impact clock (`RenderState.shipImpact.elapsed`, simulation time) and
   *   `touchdownS` the moment the drawn anchor stands on the sand;
   * - `null`: the host knows the geometry, but the floor is not reached yet;
   * - absent: no geometry (no canvas size), so `floor-thud` plays on the
   *   `shipImpact` event itself, as before A-OWN.1.
   */
  readonly seaFloor?: SeaFloorTiming | null;
}

/** When the drawn anchor lands, on the renderer's impact clock (A-OWN.1). */
export interface SeaFloorTiming {
  /** Seconds since the `shipImpact` event, simulation time. */
  readonly elapsed: number;
  /** Seconds after the event at which the anchor stands on the sand. */
  readonly touchdownS: number;
}

/** The engine event bus as the director sees it. `EventBus<EngineEventMap>` satisfies it. */
export interface AudioEventSource {
  on<K extends keyof EngineEventMap>(
    name: K,
    listener: (payload: EngineEventMap[K]) => void,
  ): () => void;
}

/**
 * Director options (A6.1). Every field defaults to the shipped behaviour.
 */
export interface AudioDirectorOptions {
  /**
   * Whether the continuous `chain-rattle` loop plays while diving. Default
   * false (A6.1, owner decision): the cue, its asset, its gain and rate
   * curves and its stop fades are kept for possible future use, but the
   * director never starts it unless this is true.
   */
  readonly chainRattle?: boolean;
  /**
   * Whether the tension creaks play at the multiplier thresholds. Default
   * false (A-OWN, owner decision 2026-11-17): the cues, their assets and
   * `TENSION_THRESHOLDS` are kept for possible future use, but the director
   * never plays either creak unless this is true.
   */
  readonly tensionCreaks?: boolean;
  /**
   * The soundtrack to stream (M-OWN). Default: none, so the director plays
   * no music. The audio host passes `MUSIC_MAIN` (`music.ts`).
   */
  readonly music?: StreamOptions | null;
}

/** Loop cues the director never plays unless enabled through its options (A6.1). */
export const DISABLED_BY_DEFAULT: readonly LoopCueId[] = Object.freeze(["chain-rattle"]);

/** One-shot cues the director never plays unless enabled through its options (A-OWN). */
export const DISABLED_ONE_SHOTS_BY_DEFAULT: readonly OneShotCueId[] = Object.freeze([
  "tension-creak-1",
  "tension-creak-2",
]);

/**
 * Every cue a default director never plays: the audio host neither fetches
 * nor decodes these (A6.1, A-OWN).
 */
export const DISABLED_CUES_BY_DEFAULT: readonly CueId[] = Object.freeze([
  ...DISABLED_BY_DEFAULT,
  ...DISABLED_ONE_SHOTS_BY_DEFAULT,
]);

export interface AudioDirector {
  /** Once per rendered frame, after the engine has advanced. Never throws. */
  update(frame: AudioFrame): void;
  /**
   * Canvas detach: stops every loop, holds the music, drops buffered events
   * and resets the edge trackers. The next `update()` resumes from that
   * frame's state, without replaying anything; the music plays on from where
   * it was held. Never throws.
   */
  pause(): void;
  /** Re-applies every live loop's values, so a loop waiting for its cue starts now. Never throws. */
  wake(): void;
  /** Unsubscribes, stops every loop and the music. Every later call is a no-op. Never throws. */
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

/**
 * Where the impact lies inside the owner's `floor-thud` recording, in seconds
 * (A-OWN.1, measured: the low hit starts 0.29–0.30 s into the file). The
 * director starts the cue this long before the drawn anchor touches the sand,
 * so the hit lands on the touchdown.
 */
export const FLOOR_THUD_HIT_S = 0.3;

/** A held `floor-thud` plays at the latest this long after `shipImpact` (A-OWN.1 safety net). */
export const FLOOR_THUD_MAX_WAIT_S = 1;

/** A goldfish pickup: `boost` rose by more than this since the previous frame. */
export const BOOST_EDGE = 0.05;

/** Ambience ducking under crash-boom and jackpot-stinger: ×factor, held, then released linearly. */
export const DUCK = Object.freeze({ factor: 0.5, holdS: 1, releaseS: 0.8 });

/** The outcomes that duck the music (M-OWN, owner decision D5). */
export type MusicDuckKind = "crash" | "cashout" | "jackpot";

export interface MusicDuckShape {
  /** The gain factor while held, 0..1. */
  readonly factor: number;
  readonly attackS: number;
  readonly holdS: number;
  readonly releaseS: number;
}

/**
 * Music ducking (M-OWN, owner decision D4; provisional): a linear attack down
 * to ×factor, a hold, then a linear release back to 1.
 */
export const MUSIC_DUCK: Readonly<Record<MusicDuckKind, MusicDuckShape>> = Object.freeze({
  crash: Object.freeze({ factor: 0.4, attackS: 0.08, holdS: 1.6, releaseS: 1.5 }),
  cashout: Object.freeze({ factor: 0.55, attackS: 0.05, holdS: 0.9, releaseS: 1 }),
  jackpot: Object.freeze({ factor: 0.35, attackS: 0.1, holdS: 2.8, releaseS: 2 }),
});

/**
 * The cue whose play triggers each music duck (D5). No other cue ducks the
 * music; `chest-coin-burst` in particular does not.
 */
export const MUSIC_DUCK_CUES: Readonly<Partial<Record<OneShotCueId, MusicDuckKind>>> =
  Object.freeze({
    "crash-boom": "crash",
    "cashout-coins": "cashout",
    "jackpot-stinger": "jackpot",
  });

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

/**
 * The level of one music duck `elapsedS` after its trigger, when it started
 * from level `from`. Continuous in `elapsedS`; 1 once the release has ended.
 */
export function musicDuckLevel(shape: MusicDuckShape, from: number, elapsedS: number): number {
  if (!(elapsedS >= 0)) return 1;
  const { factor, attackS, holdS, releaseS } = shape;
  if (elapsedS < attackS) return from + (factor - from) * (elapsedS / attackS);
  const held = elapsedS - attackS;
  if (held < holdS) return factor;
  const released = held - holdS;
  if (released >= releaseS) return 1;
  return factor + (1 - factor) * (released / releaseS);
}

export interface MusicDuck {
  /** An outcome sound plays now. */
  trigger(kind: MusicDuckKind): void;
  /** Moves every active duck on by `dt` seconds. A non-finite or non-positive `dt` is 0. */
  advance(dt: number): void;
  /** The music gain factor now, 0..1: the deepest active duck, or 1. */
  level(): number;
  /** Drops every duck: the level is 1. */
  reset(): void;
}

const MUSIC_DUCK_KINDS: readonly MusicDuckKind[] = ["crash", "cashout", "jackpot"];

/**
 * The music duck as a small deterministic state machine: one envelope per
 * kind, moved only by `advance(dt)`. A second trigger of a kind restarts its
 * envelope from its current level, so the level never jumps. The level is
 * the lowest of the three: overlapping events use the deepest attenuation.
 */
export function createMusicDuck(): MusicDuck {
  /** Per kind: where its envelope started and how long ago. Inactive kinds are absent. */
  const active = new Map<MusicDuckKind, { from: number; elapsed: number }>();

  const levelOf = (kind: MusicDuckKind): number => {
    const duck = active.get(kind);
    return duck ? musicDuckLevel(MUSIC_DUCK[kind], duck.from, duck.elapsed) : 1;
  };

  return {
    trigger(kind) {
      if (!MUSIC_DUCK_KINDS.includes(kind)) return;
      active.set(kind, { from: levelOf(kind), elapsed: 0 });
    },
    advance(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      for (const kind of MUSIC_DUCK_KINDS) {
        const duck = active.get(kind);
        if (!duck) continue;
        duck.elapsed += dt;
        const shape = MUSIC_DUCK[kind];
        if (duck.elapsed >= shape.attackS + shape.holdS + shape.releaseS) active.delete(kind);
      }
    },
    level() {
      let level = 1;
      for (const kind of MUSIC_DUCK_KINDS) level = Math.min(level, levelOf(kind));
      return level;
    },
    reset() {
      active.clear();
    },
  };
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

/**
 * The loops each phase wants, before options. Unknown phases want none.
 * `chain-rattle` is dropped here unless `AudioDirectorOptions.chainRattle` (A6.1).
 */
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
  options: AudioDirectorOptions = {},
): AudioDirector {
  // A6.1: the phase table with the disabled loops removed, fixed at construction.
  const rattleEnabled = options.chainRattle === true;
  const creaksEnabled = options.tensionCreaks === true;
  const loopsByPhase = {} as Record<AudioPhase, readonly LoopCueId[]>;
  for (const phase of Object.keys(LOOPS_BY_PHASE) as AudioPhase[]) {
    loopsByPhase[phase] = LOOPS_BY_PHASE[phase].filter(
      (cue) => rattleEnabled || !DISABLED_BY_DEFAULT.includes(cue),
    );
  }

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
  /** A-OWN.1: seconds a `shipImpact` thud has waited for the anchor's touchdown; null: none waits. */
  let thudWait: number | null = null;

  // Music (M-OWN): one stream handle for the director's life, and its duck.
  const track = options.music ?? null;
  const musicDuck = createMusicDuck();
  let music: {
    readonly handle: StreamHandle;
    /** The gain last sent to the handle; undefined: send the next one. */
    gain: number | undefined;
    /** Held by `pause()`; the next frame plays on. */
    held: boolean;
  } | null = null;

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
    musicDuck.reset();
    thudWait = null;
  };

  /** Starts the one music stream, or plays on after a hold, and sends the duck level. */
  const runMusic = () => {
    if (!track) return;
    if (!music) {
      guard("music start", () => {
        // A new stream is active at gain 1.
        music = { handle: audio.stream(track), gain: 1, held: false };
      });
    }
    const live = music;
    if (!live) return;
    if (live.held && guard("music resume", () => live.handle.setActive(true))) live.held = false;
    const level = musicDuck.level();
    const last = live.gain;
    const moved =
      last === undefined ||
      Math.abs(level - last) > HANDLE_EPSILON.gain ||
      // A release always lands on exactly 1, whatever rounding the frames left.
      (level === 1 && last !== 1);
    if (moved && guard("music gain", () => live.handle.setGain(level))) live.gain = level;
  };

  const holdMusic = () => {
    const live = music;
    if (!live || live.held) return;
    guard("music hold", () => live.handle.setActive(false));
    live.held = true;
    live.gain = undefined; // re-sent on the next frame
  };

  const stopMusic = () => {
    const live = music;
    music = null;
    if (live) guard("music stop", () => live.handle.stop());
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
    const wanted = loopsByPhase[phase] ?? [];

    // 1. Time: the duck and the bed fade-ins advance by dt; a bed only while audible (A4a.1).
    duckElapsed += dt;
    musicDuck.advance(dt);
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
    for (const event of batch) {
      for (const shot of cuesFor(event)) {
        // A-OWN.1: with the landing geometry known, the thud waits for the touchdown.
        if (shot.cue === "floor-thud" && frame.seaFloor !== undefined) thudWait = 0;
        else add(shot);
      }
    }
    if (thudWait !== null) {
      const floor = frame.seaFloor;
      if (phase === "idle") {
        thudWait = null; // a new round opened: the impact is over
      } else if (
        floor === undefined ||
        thudWait >= FLOOR_THUD_MAX_WAIT_S ||
        (floor !== null &&
          Number.isFinite(floor.elapsed) &&
          Number.isFinite(floor.touchdownS) &&
          floor.elapsed >= floor.touchdownS - FLOOR_THUD_HIT_S)
      ) {
        add({ cue: "floor-thud" });
        thudWait = null;
      } else {
        thudWait += dt;
      }
    }

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
        // Several thresholds in one frame: only the highest one's cue (A-OWN: only when enabled).
        if (creaksEnabled) add({ cue: reached % 2 === 1 ? "tension-creak-1" : "tension-creak-2" });
        tension = reached;
      }
    }
    previousBoost = boost;
    for (const shot of plays) {
      if (DUCKING_CUES.has(shot.cue)) duckElapsed = 0;
      const musicDuckKind = MUSIC_DUCK_CUES[shot.cue];
      if (musicDuckKind) musicDuck.trigger(musicDuckKind);
    }

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

    // The music: independent of the phase, so no round transition restarts it.
    runMusic();

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
        holdMusic();
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
        stopMusic();
      });
    },
  };
}
