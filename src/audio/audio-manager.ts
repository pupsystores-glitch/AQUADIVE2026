// AudioManager — the native Web Audio core (Sprint 5 / Phase 7, step A1;
// docs/08_AUDIO_FX_ARCHITECTURE.md §3.1–§3.4, §7, §10).
//
// Generic: it knows no game, no engine event and no cue list. It owns, for
// the lifetime of one game session:
//
// - The AudioContext, created lazily inside the first `unlock()` — never at
//   module scope, never at construction (§3.2, §10 SSR rule). The factory
//   resolves `AudioContext` / `webkitAudioContext` at call time. With
//   neither, or when construction throws, the manager stays silent for
//   good, logs once, and every call is a safe no-op (§10 "Safety").
// - The bus graph: `music`, `ambience` and `sfx` gain nodes → `master`
//   gain → limiter (`DynamicsCompressor`) → output (§3.2). Bus gains are
//   clamped to 0..1, stored before the context exists, and applied with
//   `setTargetAtTime` once it does.
// - Voices (A1.2, docs/08 §7.2): one-shots (`play`) and loops (`loop`).
//   Every live playback source counts toward `MAX_VOICES` — playing,
//   fading and stolen voices and the unlock prime — in three fixed pools:
//   `LOOP_VOICES` loops, `ONE_SHOT_VOICES` one-shots and `TAIL_VOICES`
//   tail slots for stolen voices fading out and for primes. A source keeps
//   its slot until it is known to have ended: its `onended`, or the context
//   clock past its scheduled end by `VOICE_RECLAIM_GRACE_S`. Calling
//   `stop()` is never taken as proof. One-shots never take a loop slot. A
//   loop that cannot start yet (before unlock, cue not loaded, pool full)
//   waits as a pending loop and starts once it fits; an essential loop is
//   never preempted. A loop may be given its initial gain, rate and filter
//   (`LoopOptions`, A4a.1): they are on the nodes before its source starts,
//   at once or after waiting. `LoopHandle.isAudible()` (A4a.1) is a pure
//   query: does this loop's voice play on a running context right now.
// - The run state. The context runs only while it is unlocked, not muted
//   and not suspended by the host (§3.3 steps 3–4: visibility / pagehide
//   suspend, visible-again resume "if unlocked and not muted").
// - Unlock (§3.3 step 2, §10): `unlock()` must be called inside a user
//   gesture. It creates or resumes the context and plays a 1-sample silent
//   buffer (the iOS prime) synchronously, inside that gesture. IOS-AUDIO
//   (risk 17): while the manager is unlocked but its resume() has not taken
//   effect (the context is not running although "running" was asked for), a
//   later `unlock()` repeats the prime and the resume inside its gesture.
//   WebKit leaves a resume() outside a user activation pending, and a touch's
//   `pointerdown` is not an activation.
// - Interruption (§3.3 step 5): an iOS `interrupted` state, or a suspend
//   the manager did not ask for, re-locks the manager and calls
//   `onUnlockRequired`, so the host can re-arm its gesture listeners. If the
//   system later resumes the context on its own, the manager accepts it.
//
// - Decoding (A1.1, docs/08 §7): `decode()` turns compressed bytes into a
//   buffer with the same single context, so the A2 sound bank never needs
//   a context of its own. It never creates the context: a request made
//   before the first unlock waits, and starts inside `unlock()`, after the
//   resume. Every request settles exactly once: with the buffer, or `null`
//   on a decoding error, an unsupported environment or `dispose()`. A
//   decoder result that arrives after that is ignored.
//
// - The music stream (M-OWN, docs/08 §7.6): `stream()` plays one long file
//   through one media element and one `MediaElementAudioSourceNode` into a
//   bus. The file is streamed, never decoded into an AudioBuffer, and it
//   takes no slot of the voice pools. The manager holds at most one stream.
//   The element and its node are created lazily, the first time the stream
//   may play: inside `unlock()` (a user gesture) or later. The element plays
//   only while the manager is unlocked, not muted and not host-suspended, and
//   the caller has not held it; otherwise it is paused and keeps its
//   position. A refused `play()` and a loading error are retried inside the
//   next `unlock()` gesture. A stream failure never throws and never affects
//   voices.
//
// Not here (later steps, docs/08 §12): fetching and caching buffers and the
// cue manifest (A2 — injected through `resolveCue`), the gesture and
// visibility listeners and every default sound setting (A4, the session),
// the settings store (A3). The manager is a passive sink for settings.
// It never touches `navigator.audioSession` (Q15 is open; the browser
// default applies).
//
// Clock: only `context.currentTime`. No wall clock, no timers. (A held
// stream's fade ends on the element's own `timeupdate` event.)
// Imports: none (docs/08 §6 import rule).

/** The four gain buses (docs/08 §3.2). `master` sums the other three. */
export type AudioBus = "master" | "music" | "ambience" | "sfx";

/** The buses a voice can play on. */
export type VoiceBus = Exclude<AudioBus, "master">;

/**
 * Voice cap (docs/08 §3.2, §9, §7.2): the most playback sources live at
 * once — playing, fading or stolen voices and unlock primes alike.
 */
export const MAX_VOICES = 16;

/** Loop pool (A1.2, docs/08 §7.2). Only loops use it. */
export const LOOP_VOICES = 6;

/** One-shot pool (A1.2, docs/08 §7.2). Only one-shots use it. */
export const ONE_SHOT_VOICES = 8;

/**
 * Tail pool (A1.2, docs/08 §7.2): stolen or preempted voices while they fade
 * out, and unlock primes. A steal needs a free tail slot.
 */
export const TAIL_VOICES = 2;

/**
 * A source whose scheduled end lies this far behind `currentTime` is known
 * to have ended, even when its `onended` never arrives (A1.2). Covers render
 * quantum granularity and a coarsened `currentTime`.
 */
export const VOICE_RECLAIM_GRACE_S = 0.1;

/** Time constant of every gain, rate and filter change (`setTargetAtTime`), in seconds. */
export const PARAM_TIME_CONSTANT_S = 0.015;

/** A fade reaches about 98 % of its way after this many time constants. */
export const FADE_TIME_CONSTANTS = 4;

/** Fade applied to a voice dropped at the voice cap, in seconds. */
export const VOICE_STEAL_FADE_S = 0.02;

/** Playback-rate bounds for `play` and `LoopHandle.setRate`. */
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 4;

/** Lowest low-pass cutoff `LoopHandle.setFilter` accepts, in Hz. The highest is the context's Nyquist frequency. */
export const MIN_FILTER_HZ = 20;

/** Fade-out of a held stream (`StreamHandle.setActive(false)`) before its element pauses, in seconds. */
export const STREAM_HOLD_FADE_S = 0.05;

/** How many loading errors of a stream are retried, each inside a later `unlock()` gesture. */
export const STREAM_MAX_RETRIES = 2;

/** Limiter settings for the `DynamicsCompressor` after `master` (docs/08 §3.2). */
export const LIMITER_SETTINGS = {
  thresholdDb: -1,
  kneeDb: 0,
  ratio: 20,
  attackS: 0.003,
  releaseS: 0.25,
} as const;

const VOICE_BUSES: readonly VoiceBus[] = ["music", "ambience", "sfx"];
const BUSES: readonly AudioBus[] = ["master", ...VOICE_BUSES];

// ----- the Web Audio surface the manager uses -----
//
// Structural subsets of the DOM types, so the real AudioContext and the test
// fake (src/audio/test/fake-audio-context.ts) both satisfy them. The real
// context is checked against `AudioContextLike` in `createBrowserAudioContext`.

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(cancelTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  readonly threshold: AudioParamLike;
  readonly knee: AudioParamLike;
  readonly ratio: AudioParamLike;
  readonly attack: AudioParamLike;
  readonly release: AudioParamLike;
}

export interface AudioBufferLike {
  readonly duration: number;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  readonly playbackRate: AudioParamLike;
  onended: ((this: never, event: never) => unknown) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

/**
 * The media element surface the music stream uses (M-OWN). `HTMLAudioElement`
 * satisfies it; the test fake is `src/audio/test/fake-media-element.ts`.
 */
export interface MediaElementLike {
  src: string;
  loop: boolean;
  preload: string;
  readonly paused: boolean;
  /** Current browsers return a promise; older ones return nothing. */
  play(): PromiseLike<void> | void;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  /** "suspended" | "running" | "closed", and "interrupted" on iOS Safari. */
  readonly state: string;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  /** M-OWN: the stream's source node. Optional: without it the stream stays silent. */
  createMediaElementSource?(element: MediaElementLike): AudioNodeLike;
  /**
   * Both forms of the Web Audio API: current browsers return a promise and
   * also call the callbacks; older WebKit only calls the callbacks and
   * returns nothing.
   */
  decodeAudioData(
    audioData: ArrayBuffer,
    successCallback?: (decodedData: AudioBufferLike) => void,
    errorCallback?: (error: unknown) => void,
  ): PromiseLike<AudioBufferLike> | void;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

// ----- public contract (docs/08 §7) -----

/** A cue as the manager plays it. Supplied by the cue resolver (the A2 sound bank). */
export interface ResolvedCue {
  readonly buffer: AudioBufferLike;
  readonly bus: VoiceBus;
  /** The cue's own level, 0..1. Play and loop gains multiply it. */
  readonly gain: number;
  /** Higher survives the voice cap, within the cue's pool. Among waiting loops, higher starts first. */
  readonly priority: number;
  /** Loop points in seconds (loops only), to neutralize encoder padding (docs/08 §3.4). */
  readonly loopStart?: number;
  readonly loopEnd?: number;
  /**
   * Loops only (A1.2, docs/08 §7.2): an essential loop, such as an ambience
   * or music bed, is never preempted. When the loop pool is full it preempts
   * the lowest-priority non-essential loop, and it starts before any waiting
   * non-essential loop. Default: false.
   */
  readonly essential?: boolean;
}

/** Maps a cue to its buffer and settings, or `null` while it is missing or not loaded (then the cue is silent). */
export type CueResolver<CueKey extends string> = (cue: CueKey) => ResolvedCue | null;

export interface PlayOptions {
  /** Playback rate, clamped to MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE. */
  readonly rate?: number;
  /** Gain, clamped to 0..1, multiplied with the cue's gain. */
  readonly gain?: number;
}

/**
 * Initial values of a loop voice (A4a.1, docs/08 §7.2). Each is checked
 * exactly like its `LoopHandle` setter; a missing or invalid value keeps the
 * default. They are on the voice's nodes before its source starts, whether
 * the loop starts at once or after waiting (unlock, decoding, a loop slot).
 * A setter called while the loop waits replaces the value.
 */
export interface LoopOptions {
  /** 0..1, default 1. Multiplied with the cue's gain. A non-finite gain keeps the default. */
  readonly gain?: number;
  /** MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE, default 1. A non-finite or non-positive rate keeps the default. */
  readonly rate?: number;
  /** Low-pass cutoff in Hz, clamped to MIN_FILTER_HZ..Nyquist when applied; default Nyquist (transparent). */
  readonly filterHz?: number;
}

/**
 * Control of one looping voice (A1.2, docs/08 §7.2). While the loop waits to
 * start (pending) the handle keeps its gain, rate and filter and applies them
 * when the voice starts. Every method is a no-op once the loop has stopped.
 */
export interface LoopHandle {
  /** Gain, clamped to 0..1, multiplied with the cue's gain. */
  setGain(gain: number): void;
  /** Playback rate, clamped to MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE. */
  setRate(rate: number): void;
  /** Low-pass cutoff in Hz, clamped to MIN_FILTER_HZ..Nyquist. */
  setFilter(frequencyHz: number): void;
  /** Fade out over `fadeS` seconds (0: at once), then stop. A pending loop is cancelled and never starts. */
  stop(fadeS: number): void;
  /**
   * A4a.1: true while this loop has a started voice and the context is
   * unlocked, not muted, not host-suspended and in state "running". False
   * while the loop is pending (before unlock, cue not loaded, pool full),
   * after a preemption until it restarts, after `stop()`, once disposed, while
   * interrupted, while a resume is in progress or after it was refused, and on
   * the inert handle.
   *
   * An operational predicate for playback and fade progression (the director
   * advances a bed's fade-in only while it is true). It is not a measurement
   * of physical sound output: bus gains, the loop's own gain and the
   * limiter are not considered, and `context.state` may lag the hardware.
   *
   * A pure status query: it never starts a pending loop, reclaims a voice,
   * creates a node or schedules automation.
   */
  isAudible(): boolean;
}

/** A streamed file (M-OWN, docs/08 §7.6): played through a media element, never decoded as a whole. */
export interface StreamOptions {
  /** The file's URL. */
  readonly url: string;
  readonly bus: VoiceBus;
  /** The stream's own level, 0..1, default 1. `StreamHandle.setGain` multiplies it. */
  readonly gain?: number;
  /** Native media-element looping. Default: false. */
  readonly loop?: boolean;
}

/**
 * Control of the stream (M-OWN, docs/08 §7.6). Every method is a no-op once
 * the stream has stopped. No method throws.
 */
export interface StreamHandle {
  /** Gain, clamped to 0..1, multiplied with the stream's own gain. Applied smoothly. */
  setGain(gain: number): void;
  /**
   * false: hold the stream. It fades out over `STREAM_HOLD_FADE_S`, then its
   * element pauses and keeps its position. true: play again from that
   * position. A new stream is active.
   */
  setActive(active: boolean): void;
  /** Ends the stream and releases its element and nodes. A later `stream()` starts a new one. */
  stop(): void;
  /**
   * True while the element was asked to play and is not paused, and the
   * context is unlocked, not muted, not host-suspended and "running". Like
   * `LoopHandle.isAudible()`, a pure status query, not a measurement of sound.
   */
  isAudible(): boolean;
}

export interface AudioManager<CueKey extends string = string> {
  /** Must be called inside a user gesture. Never rejects. */
  unlock(): Promise<void>;
  /** Clamped to 0..1; a non-finite gain is ignored. */
  setBusGain(bus: AudioBus, gain: number): void;
  setMuted(muted: boolean): void;
  /** One-shot. A no-op until unlocked, while muted or suspended, and while the cue is not loaded. */
  play(cue: CueKey, opts?: PlayOptions): void;
  /**
   * Looping voice. It starts at once when it fits. Otherwise (before unlock,
   * while the cue is not loaded, or while the loop pool is full) it waits as
   * a pending loop and starts once it fits, until its handle is stopped or the
   * manager is disposed. The caller stops every handle it no longer wants.
   * Inert once disposed or when Web Audio is unavailable. `options` (A4a.1)
   * are the voice's initial gain, rate and filter; without them it starts at
   * gain 1, rate 1 and a transparent filter, as before.
   */
  loop(cue: CueKey, options?: LoopOptions): LoopHandle;
  /**
   * The streamed file (M-OWN, docs/08 §7.6), for music. The manager holds at
   * most one stream: while one is live, this returns its handle and ignores
   * `options`. The element is created and starts loading only once the
   * stream may play (unlocked, not muted, not host-suspended). Inert once
   * disposed or when Web Audio is unavailable; silent when the environment
   * has no media element or no `createMediaElementSource`.
   */
  stream(options: StreamOptions): StreamHandle;
  /**
   * Decodes compressed audio (for example a fetched `.m4a`) with the
   * manager's single context. Never rejects; resolves `null` on a decoding
   * error, when Web Audio is unavailable, or once disposed. Before the first
   * unlock the request waits for the context; it never creates one. The
   * browser may detach `data`, so pass a buffer that is not reused.
   * Failures are not logged here: the caller owns its failure policy.
   */
  decode(data: ArrayBuffer): Promise<AudioBufferLike | null>;
  /** Host lifecycle: the tab is hidden or the page is hidden. */
  suspend(): void;
  /** Host lifecycle: the page is visible again. Resumes only if unlocked and not muted. */
  resume(): void;
  /** Stops every voice, settles every pending decode with `null` and closes the context. Every later call is a no-op. */
  dispose(): void;
}

export interface AudioManagerOptions<CueKey extends string> {
  resolveCue: CueResolver<CueKey>;
  /** Context factory, called at most once, inside the first `unlock()`. `null` means Web Audio is unavailable. */
  createContext?: () => AudioContextLike | null;
  /** Called when the context is interrupted or suspended by the system, so the host can re-arm its gesture unlock (docs/08 §3.3 step 5). */
  onUnlockRequired?: () => void;
  /**
   * M-OWN: the stream's media element factory, called at most once per
   * stream, when it first may play. `null` means streaming is unavailable
   * (the stream stays silent). Default: `createBrowserMediaElement`.
   */
  createMediaElement?: () => MediaElementLike | null;
}

/**
 * The production media element factory (M-OWN). Resolves `Audio` at call
 * time, so importing this module never touches `window` (SSR). The element
 * is never added to the document.
 */
export function createBrowserMediaElement(): MediaElementLike | null {
  const Ctor = (globalThis as { Audio?: typeof Audio }).Audio;
  if (typeof Ctor !== "function") return null;
  const element: MediaElementLike = new Ctor();
  return element;
}

/**
 * The production context factory. Resolves the constructor at call time, so
 * importing this module never touches `window` (SSR). Returns `null` when the
 * environment has no Web Audio.
 */
export function createBrowserAudioContext(): AudioContextLike | null {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  const context: AudioContextLike = new Ctor();
  return context;
}

export function createAudioManager<CueKey extends string>(
  options: AudioManagerOptions<CueKey>,
): AudioManager<CueKey> {
  return new WebAudioManager(options);
}

// ----- implementation -----

/** The three fixed pools of the voice cap (A1.2, docs/08 §7.2). */
type Pool = "loop" | "oneShot" | "tail";

const POOL_SIZE: Readonly<Record<Pool, number>> = {
  loop: LOOP_VOICES,
  oneShot: ONE_SHOT_VOICES,
  tail: TAIL_VOICES,
};

/** "stopping": its end is scheduled, but it is still live and keeps its slot. */
type VoiceState = "playing" | "stopping" | "ended";

/** One live playback source: a one-shot, a loop, or an unlock prime. */
interface Voice<CueKey extends string> {
  readonly source: AudioBufferSourceNodeLike;
  /** `null` for an unlock prime, which plays straight into the destination. */
  readonly gain: GainNodeLike | null;
  readonly filter: BiquadFilterNodeLike | null;
  /** The cue's gain; voice gains multiply it. */
  readonly baseGain: number;
  readonly priority: number;
  readonly essential: boolean;
  /** Start order, for the oldest-first tie-break at the cap. */
  readonly order: number;
  /** The loop request this voice plays, if any. */
  readonly loop: LoopRequest<CueKey> | null;
  /** The pool whose slot it holds. A stolen or preempted voice moves to the tail. */
  pool: Pool;
  state: VoiceState;
  /**
   * Context time by which the source has ended: its scheduled stop, or a
   * one-shot's natural end. `Infinity` while unknown (a loop not stopped).
   */
  endsBy: number;
}

/** One `loop()` call, from the request until its handle stops. */
interface LoopRequest<CueKey extends string> {
  readonly cue: CueKey;
  /** Request order, the last tie-break among waiting loops. */
  readonly order: number;
  status: "pending" | "playing" | "ended";
  /**
   * The request's live source: the playing voice, or, after a preemption,
   * the old voice still fading in the tail. A pending request with a voice
   * does not start again until that voice has ended (no duplicate source).
   */
  voice: Voice<CueKey> | null;
  /** Settings kept across pending periods, applied when a voice starts. */
  gain: number;
  rate: number;
  /** `null`: the transparent default (Nyquist). */
  filterHz: number | null;
}

interface Graph {
  readonly limiter: DynamicsCompressorNodeLike;
  readonly buses: Readonly<Record<AudioBus, GainNodeLike>>;
}

/** One `decode()` call, from the request until it settles. */
interface DecodeRequest {
  readonly data: ArrayBuffer;
  /** Handed to the context's decoder; false while waiting for the first unlock. */
  started: boolean;
  /** Settles the caller's promise. Only the first call counts. */
  readonly settle: (buffer: AudioBufferLike | null) => void;
}

/** The one `stream()` request, from the call until its handle stops (M-OWN). */
interface Stream {
  readonly url: string;
  readonly bus: VoiceBus;
  /** The stream's own gain; the handle gain multiplies it. */
  readonly baseGain: number;
  readonly loop: boolean;
  /** "idle": no element yet. "failed": a loading error; retried inside a gesture. */
  status: "idle" | "live" | "failed" | "ended";
  /** The caller wants it playing (true) or held (false). */
  active: boolean;
  /** The handle gain, 0..1. */
  level: number;
  element: MediaElementLike | null;
  source: AudioNodeLike | null;
  gain: GainNodeLike | null;
  /** The last request to the element: play (true) or pause (false). */
  wantsPlay: boolean;
  /** `play()` was refused, or the system paused the element: retried inside the next gesture. */
  blocked: boolean;
  /** Context time at which a hold's fade-out ends; `null` while no hold fades. */
  holdUntil: number | null;
  /** Loading errors so far. */
  errors: number;
  /** The element's listeners, kept for removal. */
  listeners: { readonly type: string; readonly listener: () => void }[];
  /** The one handle of this stream. */
  handle: StreamHandle | null;
}

const INERT_STREAM: StreamHandle = Object.freeze({
  setGain: () => {},
  setActive: () => {},
  stop: () => {},
  isAudible: () => false,
});

const INERT_HANDLE: LoopHandle = Object.freeze({
  setGain: () => {},
  setRate: () => {},
  setFilter: () => {},
  stop: () => {},
  isAudible: () => false,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isBus = (bus: unknown): bus is AudioBus => BUSES.includes(bus as AudioBus);

const isVoiceBus = (bus: unknown): bus is VoiceBus => VOICE_BUSES.includes(bus as VoiceBus);

/** A gain from a caller: clamped to 0..1, or `fallback` when missing or non-finite. */
const unitGain = (gain: number | undefined, fallback: number) =>
  typeof gain === "number" && Number.isFinite(gain) ? clamp(gain, 0, 1) : fallback;

/** A decoder result the manager can play: an object with a finite, non-negative duration. */
const isDecodedBuffer = (value: unknown): value is AudioBufferLike => {
  if (typeof value !== "object" || value === null) return false;
  const duration = (value as { duration?: unknown }).duration;
  return typeof duration === "number" && Number.isFinite(duration) && duration >= 0;
};

/**
 * The order in which waiting loops start (A1.2, deterministic): essential
 * first, then higher priority, then the earlier request.
 */
const byLoopPrecedence = (
  a: { readonly request: { readonly order: number }; readonly cue: ResolvedCue },
  b: { readonly request: { readonly order: number }; readonly cue: ResolvedCue },
): number => {
  const essentialA = a.cue.essential === true;
  const essentialB = b.cue.essential === true;
  if (essentialA !== essentialB) return essentialA ? -1 : 1;
  if (a.cue.priority !== b.cue.priority) return a.cue.priority > b.cue.priority ? -1 : 1;
  return a.request.order - b.request.order;
};

const playbackRate = (rate: number | undefined) =>
  typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE)
    : 1;

class WebAudioManager<CueKey extends string> implements AudioManager<CueKey> {
  private readonly resolveCue: CueResolver<CueKey>;
  private readonly createContext: () => AudioContextLike | null;
  private readonly onUnlockRequired: (() => void) | undefined;
  private readonly createMediaElement: () => MediaElementLike | null;

  private context: AudioContextLike | null = null;
  private graph: Graph | null = null;
  private unsupported = false;
  private disposed = false;

  /** A user gesture has unlocked the context, and no interruption has re-locked it since. */
  private unlocked = false;
  /** Re-locked by an interruption; a system resume may unlock it again. */
  private interrupted = false;
  private muted = false;
  private hostSuspended = false;
  /** The run state last requested from the context (resume / suspend). */
  private requested: "running" | "suspended" | null = null;

  private readonly busGains: Record<AudioBus, number> = {
    master: 1,
    music: 1,
    ambience: 1,
    sfx: 1,
  };

  /** Every live source, in every pool. Its size never exceeds MAX_VOICES. */
  private readonly voices = new Set<Voice<CueKey>>();
  private nextOrder = 0;
  /** Loop requests waiting to start, in request order. */
  private readonly pending: LoopRequest<CueKey>[] = [];
  /** Context time of the last clock sweep; a sweep at the same time finds nothing new. */
  private lastSweep = Number.NaN;
  /** Guards against re-entrant promotion of waiting loops. */
  private promoting = false;

  /** Every unsettled `decode()` request, waiting or started, in request order. */
  private readonly decodes = new Set<DecodeRequest>();

  /** The stream (M-OWN): at most one, from `stream()` until its handle stops or `dispose()`. */
  private currentStream: Stream | null = null;
  private readonly streamFailuresLogged = new Set<string>();

  private resumeFailureLogged = false;
  private readonly resolveFailuresLogged = new Set<string>();

  constructor(options: AudioManagerOptions<CueKey>) {
    this.resolveCue = options.resolveCue;
    this.createContext = options.createContext ?? createBrowserAudioContext;
    this.onUnlockRequired = options.onUnlockRequired;
    this.createMediaElement = options.createMediaElement ?? createBrowserMediaElement;
  }

  unlock(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.unlocked && !this.resumeStalled()) {
      // Already unlocked: this gesture retries a refused or failed stream (M-OWN).
      this.syncStream(true);
      return Promise.resolve();
    }
    // Risk 17 (IOS-AUDIO): an earlier unlock() may have run in an event that
    // is not a user activation (a touch's `pointerdown`), so its resume() is
    // still pending and the context still suspended. This gesture repeats the
    // gesture-critical steps below, so the context can start now.
    const context = this.ensureContext();
    if (!context) return Promise.resolve();

    // Everything up to resume() runs synchronously, inside the gesture.
    this.unlocked = true;
    this.interrupted = false;
    this.reclaimEnded(context);
    this.primeOutput(context);
    this.requested = "running";
    let resumed: Promise<void>;
    try {
      resumed = context.resume();
    } catch (error) {
      resumed = Promise.reject(error);
    }
    // Decoding needs the context, not a running one; it starts after the
    // gesture-critical prime and resume. So do the waiting loops.
    this.startWaitingDecodes(context);
    this.promotePending();
    // The stream's play() also runs inside the gesture (M-OWN). It is heard
    // only once the context runs: the element feeds the graph, not the output.
    this.syncStream(true);
    return resumed.then(
      () => this.applyRunState(),
      (error: unknown) => {
        if (this.disposed) return;
        this.unlocked = false;
        this.requested = null;
        this.syncStream();
        this.logResumeFailure(error);
      },
    );
  }

  setBusGain(bus: AudioBus, gain: number): void {
    if (this.disposed || !isBus(bus) || typeof gain !== "number" || !Number.isFinite(gain)) return;
    this.busGains[bus] = clamp(gain, 0, 1);
    if (bus === "master") this.applyMasterGain();
    else if (this.graph) this.rampTo(this.graph.buses[bus].gain, this.busGains[bus]);
  }

  setMuted(muted: boolean): void {
    if (this.disposed) return;
    this.muted = muted === true;
    this.applyMasterGain();
    this.applyRunState();
    this.syncStream();
  }

  play(cue: CueKey, opts?: PlayOptions): void {
    if (!this.audible()) return;
    this.refresh();
    const resolved = this.resolve(cue);
    if (!resolved || !this.admitOneShot(resolved.priority)) return;
    this.startVoice(resolved, "oneShot", null, opts);
  }

  loop(cue: CueKey, options?: LoopOptions): LoopHandle {
    if (this.disposed || this.unsupported) return INERT_HANDLE;
    // A4a.1: the initial values, checked like their setters, are stored on the
    // request before it can start, so they are on the nodes before start().
    const initial = typeof options === "object" && options !== null ? options : undefined;
    const filterHz = initial?.filterHz;
    const request: LoopRequest<CueKey> = {
      cue,
      order: this.nextOrder++,
      status: "pending",
      voice: null,
      gain: unitGain(initial?.gain, 1),
      rate: playbackRate(initial?.rate),
      filterHz: typeof filterHz === "number" && Number.isFinite(filterHz) ? filterHz : null,
    };
    this.pending.push(request);
    this.refresh(); // starts it at once when it fits
    return this.handleFor(request);
  }

  stream(options: StreamOptions): StreamHandle {
    if (this.disposed || this.unsupported) return INERT_STREAM;
    const live = this.currentStream;
    if (live?.handle) return live.handle; // one stream, one element (M-OWN)
    if (
      typeof options !== "object" ||
      options === null ||
      typeof options.url !== "string" ||
      options.url.length === 0 ||
      !isVoiceBus(options.bus)
    ) {
      return INERT_STREAM;
    }
    const stream: Stream = {
      url: options.url,
      bus: options.bus,
      baseGain: unitGain(options.gain, 1),
      loop: options.loop === true,
      status: "idle",
      active: true,
      level: 1,
      element: null,
      source: null,
      gain: null,
      wantsPlay: false,
      blocked: false,
      holdUntil: null,
      errors: 0,
      listeners: [],
      handle: null,
    };
    const handle = this.streamHandleFor(stream);
    stream.handle = handle;
    this.currentStream = stream;
    this.syncStream();
    return handle;
  }

  decode(data: ArrayBuffer): Promise<AudioBufferLike | null> {
    if (this.disposed || this.unsupported) return Promise.resolve(null);
    return new Promise<AudioBufferLike | null>((resolve) => {
      let settled = false;
      const request: DecodeRequest = {
        data,
        started: false,
        settle: (buffer) => {
          if (settled) return;
          settled = true;
          this.decodes.delete(request);
          resolve(buffer);
        },
      };
      this.decodes.add(request);
      if (this.context) this.startDecode(this.context, request);
    });
  }

  suspend(): void {
    if (this.disposed) return;
    this.hostSuspended = true;
    this.applyRunState();
    this.syncStream();
  }

  resume(): void {
    if (this.disposed) return;
    this.hostSuspended = false;
    this.applyRunState();
    this.syncStream();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;
    this.cancelPending();
    for (const voice of [...this.voices]) {
      try {
        voice.source.stop();
      } catch {
        // already stopped
      }
      this.finishVoice(voice);
    }
    this.settleAllDecodes();
    if (this.currentStream) this.endStream(this.currentStream);
    const context = this.context;
    const graph = this.graph;
    this.context = null;
    this.graph = null;
    if (!context) return;
    context.removeEventListener("statechange", this.onStateChange);
    if (graph) {
      for (const bus of BUSES) graph.buses[bus].disconnect();
      graph.limiter.disconnect();
    }
    try {
      context.close().catch(() => {});
    } catch {
      // closing an already-closed context
    }
  }

  // ----- context and graph -----

  private ensureContext(): AudioContextLike | null {
    if (this.context) return this.context;
    if (this.unsupported) return null;
    let context: AudioContextLike | null = null;
    let failure: unknown = null;
    try {
      context = this.createContext();
    } catch (error) {
      failure = error;
    }
    if (!context) {
      this.unsupported = true;
      console.warn("[audio] Web Audio is unavailable; the game runs silent.", failure ?? "");
      // No context will ever exist, so no waiting decode or loop can start.
      this.settleAllDecodes();
      this.cancelPending();
      return null;
    }
    this.context = context;
    this.graph = this.buildGraph(context);
    context.addEventListener("statechange", this.onStateChange);
    return context;
  }

  private buildGraph(context: AudioContextLike): Graph {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_SETTINGS.thresholdDb;
    limiter.knee.value = LIMITER_SETTINGS.kneeDb;
    limiter.ratio.value = LIMITER_SETTINGS.ratio;
    limiter.attack.value = LIMITER_SETTINGS.attackS;
    limiter.release.value = LIMITER_SETTINGS.releaseS;
    limiter.connect(context.destination);

    const master = context.createGain();
    master.gain.value = this.masterLevel();
    master.connect(limiter);

    const bus = (name: VoiceBus) => {
      const node = context.createGain();
      node.gain.value = this.busGains[name];
      node.connect(master);
      return node;
    };
    return {
      limiter,
      buses: { master, music: bus("music"), ambience: bus("ambience"), sfx: bus("sfx") },
    };
  }

  /**
   * The iOS unlock prime: a 1-sample silent buffer played inside the gesture
   * (docs/08 §3.3, §10). It is a live source too, so it holds a tail slot
   * (A1.2, §7.2). With both tail slots live (stolen voices fading, or earlier
   * primes on a context that has not run yet) the prime is skipped; resume()
   * still runs.
   */
  private primeOutput(context: AudioContextLike): void {
    if (!this.hasRoom("tail")) return;
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(context.destination);
      const voice: Voice<CueKey> = {
        source,
        gain: null,
        filter: null,
        baseGain: 0,
        priority: Number.NEGATIVE_INFINITY,
        essential: false,
        order: this.nextOrder++,
        loop: null,
        pool: "tail",
        state: "stopping",
        endsBy: context.currentTime + 1 / context.sampleRate,
      };
      source.onended = () => this.onVoiceEnded(voice);
      source.start(0);
      this.voices.add(voice);
    } catch {
      // The prime is best effort; resume() still runs.
    }
  }

  // ----- decoding -----

  private startWaitingDecodes(context: AudioContextLike): void {
    for (const request of [...this.decodes]) {
      if (!request.started) this.startDecode(context, request);
    }
  }

  /**
   * Hands one request to the decoder. The callbacks and the returned promise
   * may both report (current browsers), or only the callbacks (older
   * WebKit); the request's `settle` keeps the first report.
   */
  private startDecode(context: AudioContextLike, request: DecodeRequest): void {
    request.started = true;
    const decoded = (buffer: unknown) => request.settle(isDecodedBuffer(buffer) ? buffer : null);
    const failed = () => request.settle(null);
    try {
      if (typeof context.decodeAudioData !== "function") {
        failed();
        return;
      }
      const result = context.decodeAudioData(request.data, decoded, failed);
      if (result && typeof result.then === "function") result.then(decoded, failed);
    } catch {
      failed();
    }
  }

  /** Settles every unsettled request with `null`; a decoder result after this is ignored. */
  private settleAllDecodes(): void {
    for (const request of [...this.decodes]) request.settle(null);
  }

  // ----- run state -----

  private audible(): boolean {
    return this.context !== null && this.unlocked && !this.muted && !this.hostSuspended;
  }

  private masterLevel(): number {
    return this.muted ? 0 : this.busGains.master;
  }

  private applyMasterGain(): void {
    if (this.graph) this.rampTo(this.graph.buses.master.gain, this.masterLevel());
  }

  /** Brings the context to the state the flags ask for. Only an unlocked context is ever resumed outside `unlock()`. */
  private applyRunState(): void {
    const context = this.context;
    if (!context || this.disposed || !this.unlocked) return;
    const wanted = this.muted || this.hostSuspended ? "suspended" : "running";
    if (wanted === this.requested) return;
    this.requested = wanted;
    try {
      if (wanted === "running") context.resume().catch((error) => this.logResumeFailure(error));
      else context.suspend().catch(() => {});
    } catch (error) {
      this.logResumeFailure(error);
    }
  }

  private readonly onStateChange = (): void => {
    const context = this.context;
    if (!context || this.disposed) return;
    const state = context.state;
    if (state === "interrupted" || (state === "suspended" && this.requested === "running")) {
      if (!this.unlocked) return;
      this.unlocked = false;
      this.interrupted = true;
      this.requested = null;
      this.syncStream();
      try {
        this.onUnlockRequired?.();
      } catch (error) {
        console.error("[audio] onUnlockRequired failed:", error);
      }
    } else if (state === "running" && this.interrupted) {
      // The system resumed the context by itself after an interruption.
      this.interrupted = false;
      this.unlocked = true;
      this.requested = "running";
      this.applyRunState();
      this.refresh();
      this.syncStream();
    }
  };

  /**
   * Risk 17 (IOS-AUDIO): the manager is unlocked and asked the context to
   * run, but the context is not running. WebKit leaves a resume() made
   * outside a user activation pending, with the state "suspended" and no
   * `statechange`. A mute or a host suspend asks for "suspended", so it is
   * never mistaken for a stalled resume.
   */
  private resumeStalled(): boolean {
    const context = this.context;
    if (!context || this.requested !== "running") return false;
    return context.state !== "running" && context.state !== "closed";
  }

  private logResumeFailure(error: unknown): void {
    if (this.resumeFailureLogged) return;
    this.resumeFailureLogged = true;
    console.warn("[audio] the audio context could not be resumed; staying silent.", error);
  }

  // ----- the music stream (M-OWN, docs/08 §7.6) -----

  private logStreamFailure(kind: string, error: unknown): void {
    if (this.streamFailuresLogged.has(kind)) return;
    this.streamFailuresLogged.add(kind);
    console.warn(`[audio] stream: ${kind}; the stream stays silent.`, error ?? "");
  }

  /**
   * Brings the stream's element in line with the run state: play while the
   * caller wants it and the manager is audible, pause otherwise. Never throws.
   * `inGesture`: called from `unlock()`, so a refused `play()` and a loading
   * error may be retried.
   */
  private syncStream(inGesture = false): void {
    const stream = this.currentStream;
    if (!stream || stream.status === "ended") return;
    try {
      const context = this.context;
      const graph = this.graph;
      if (!context || !graph) return;
      if (stream.active && this.audible()) {
        if (stream.status === "failed" && !this.reloadStream(stream, inGesture)) return;
        if (stream.status === "idle" && !this.buildStream(stream, context, graph)) return;
        const element = stream.element;
        if (!element || !stream.gain) return;
        if (stream.holdUntil !== null) {
          // A hold was fading out: fade back in.
          stream.holdUntil = null;
          this.rampTo(stream.gain.gain, stream.baseGain * stream.level);
        }
        if (!stream.wantsPlay) {
          // Outside a gesture a blocked stream waits: only a gesture may retry it.
          if (!stream.blocked || inGesture) this.playStream(stream, element);
        } else if (inGesture && element.paused) {
          this.playStream(stream, element);
        }
        return;
      }
      const element = stream.element;
      if (!element || !stream.wantsPlay) return;
      if (!stream.active && this.audible() && context.state === "running") {
        // Held while sounding: fade out first; `timeupdate` pauses it after the fade.
        const now = context.currentTime;
        if (stream.holdUntil === null) {
          stream.holdUntil = now + STREAM_HOLD_FADE_S;
          if (stream.gain) {
            const param = stream.gain.gain;
            param.cancelScheduledValues(now);
            param.setValueAtTime(param.value, now);
            param.setTargetAtTime(0, now, STREAM_HOLD_FADE_S / FADE_TIME_CONSTANTS);
          }
        }
        if (now < stream.holdUntil) return;
      }
      stream.wantsPlay = false;
      stream.holdUntil = null;
      element.pause();
    } catch (error) {
      this.logStreamFailure("a media element call failed", error);
    }
  }

  /** Creates the element, its one source node and its gain. False: streaming is unavailable. */
  private buildStream(stream: Stream, context: AudioContextLike, graph: Graph): boolean {
    let element: MediaElementLike | null = null;
    let failure: unknown = null;
    try {
      element =
        typeof context.createMediaElementSource === "function" ? this.createMediaElement() : null;
    } catch (error) {
      failure = error;
    }
    if (!element || typeof context.createMediaElementSource !== "function") {
      // No element is the environment's or the host's answer (no `Audio`, or
      // music held back on purpose): silent, and logged only if it threw.
      this.endStream(stream);
      if (failure !== null) this.logStreamFailure("streaming is unavailable", failure);
      return false;
    }
    stream.element = element;
    try {
      element.preload = "auto";
      element.loop = stream.loop;
      const listen = (type: string, listener: () => void) => {
        element.addEventListener(type, listener);
        stream.listeners.push({ type, listener });
      };
      listen("error", () => this.onStreamError(stream));
      listen("pause", () => this.onStreamPaused(stream));
      listen("timeupdate", () => this.syncStream());
      // One source node per element, for the element's whole life.
      const source = context.createMediaElementSource(element);
      stream.source = source;
      const gain = context.createGain();
      stream.gain = gain;
      gain.gain.value = stream.baseGain * stream.level;
      source.connect(gain);
      gain.connect(graph.buses[stream.bus]);
      element.src = stream.url;
      stream.status = "live";
      return true;
    } catch (error) {
      this.endStream(stream);
      this.logStreamFailure("the media element could not be set up", error);
      return false;
    }
  }

  /** After a loading error: loads again, inside a gesture only, at most STREAM_MAX_RETRIES times. */
  private reloadStream(stream: Stream, inGesture: boolean): boolean {
    const element = stream.element;
    if (!inGesture || !element || stream.errors > STREAM_MAX_RETRIES) return false;
    stream.status = "live";
    element.load();
    return true;
  }

  private playStream(stream: Stream, element: MediaElementLike): void {
    stream.wantsPlay = true;
    stream.blocked = false;
    const refused = (error: unknown) => {
      if (stream.status === "ended" || !stream.wantsPlay) return; // our own pause() aborted it
      if ((error as { name?: unknown } | null)?.name === "AbortError") return;
      // No user activation yet (NotAllowedError) or no playable source: the next gesture retries.
      stream.blocked = true;
      stream.wantsPlay = false;
    };
    try {
      const result = element.play();
      if (result && typeof result.then === "function") result.then(undefined, refused);
    } catch (error) {
      refused(error);
    }
  }

  private onStreamError(stream: Stream): void {
    if (stream.status !== "live") return;
    stream.status = "failed";
    stream.errors++;
    stream.wantsPlay = false;
    stream.holdUntil = null;
    this.logStreamFailure("the file could not be loaded", stream.url);
  }

  /** A pause the manager did not ask for (the system, a media key): the next gesture plays again. */
  private onStreamPaused(stream: Stream): void {
    const element = stream.element;
    if (stream.status !== "live" || !stream.wantsPlay || !element || !element.paused) return;
    stream.wantsPlay = false;
    stream.blocked = true;
  }

  /** Releases the element, its listeners and its nodes. The stream never plays again. */
  private endStream(stream: Stream): void {
    stream.status = "ended";
    stream.wantsPlay = false;
    stream.holdUntil = null;
    if (this.currentStream === stream) this.currentStream = null;
    const { element, source, gain } = stream;
    stream.element = null;
    stream.source = null;
    stream.gain = null;
    const release = (step: () => void) => {
      try {
        step();
      } catch {
        // releasing is best effort
      }
    };
    if (element) {
      for (const { type, listener } of stream.listeners.splice(0)) {
        release(() => element.removeEventListener(type, listener));
      }
      release(() => element.pause());
      // Drops the network request and the decoder.
      release(() => element.removeAttribute("src"));
      release(() => element.load());
    }
    if (source) release(() => source.disconnect());
    if (gain) release(() => gain.disconnect());
  }

  private streamHandleFor(stream: Stream): StreamHandle {
    return {
      setGain: (gain) => {
        if (stream.status === "ended" || typeof gain !== "number" || !Number.isFinite(gain)) {
          return;
        }
        stream.level = clamp(gain, 0, 1);
        // A hold's fade-out owns the gain until the stream is active again.
        if (stream.gain && stream.holdUntil === null && stream.active) {
          this.rampTo(stream.gain.gain, stream.baseGain * stream.level);
        }
      },
      setActive: (active) => {
        if (stream.status === "ended") return;
        const next = active === true;
        if (next === stream.active) return;
        stream.active = next;
        if (next && stream.gain && stream.holdUntil === null) {
          // Back from a completed hold: the gain was faded to 0.
          this.rampTo(stream.gain.gain, stream.baseGain * stream.level);
        }
        this.syncStream();
      },
      stop: () => {
        if (stream.status !== "ended") this.endStream(stream);
      },
      isAudible: () =>
        !this.disposed &&
        stream.status === "live" &&
        stream.wantsPlay &&
        stream.element !== null &&
        !stream.element.paused &&
        this.audible() &&
        this.context !== null &&
        this.context.state === "running",
    };
  }

  // ----- voices (A1.2, docs/08 §7.2) -----

  private resolve(cue: CueKey): ResolvedCue | null {
    let resolved: ResolvedCue | null;
    try {
      resolved = this.resolveCue(cue);
    } catch (error) {
      if (!this.resolveFailuresLogged.has(cue)) {
        this.resolveFailuresLogged.add(cue);
        console.error(`[audio] resolving cue "${cue}" failed; it stays silent.`, error);
      }
      return null;
    }
    // A malformed cue stays silent, like a missing one. The buffer needs a
    // finite duration: a one-shot's end time is derived from it (A1.2).
    if (!resolved || !isDecodedBuffer(resolved.buffer) || !isVoiceBus(resolved.bus)) return null;
    if (!Number.isFinite(resolved.gain) || !Number.isFinite(resolved.priority)) return null;
    return resolved;
  }

  /** Live sources holding a slot of `pool`. */
  private used(pool: Pool): number {
    let count = 0;
    for (const voice of this.voices) if (voice.pool === pool) count++;
    return count;
  }

  private hasRoom(pool: Pool): boolean {
    return this.used(pool) < POOL_SIZE[pool];
  }

  /** Reclaims the sources the clock shows have ended, then starts the waiting loops that now fit. */
  private refresh(): void {
    const context = this.context;
    if (!context || this.disposed) return;
    this.reclaimEnded(context);
    this.promotePending();
  }

  /**
   * The fallback for an `onended` that is late or never arrives: frees the
   * slot of every source whose scheduled end lies `VOICE_RECLAIM_GRACE_S` or
   * more behind `currentTime`. The context clock has then rendered past that
   * end, so the source no longer plays. A suspended context's clock stands
   * still, so nothing is reclaimed early while it is suspended.
   */
  private reclaimEnded(context: AudioContextLike): void {
    const now = context.currentTime;
    // Every end time is set at or after the time it is set, and the grace is
    // positive, so a second sweep at the same clock time finds nothing new.
    if (now === this.lastSweep) return;
    this.lastSweep = now;
    for (const voice of this.voices) {
      if (now >= voice.endsBy + VOICE_RECLAIM_GRACE_S) this.finishVoice(voice);
    }
  }

  /**
   * Makes room in the one-shot pool for a newcomer of `priority`. When the
   * pool is full, the lowest-priority one-shot (the oldest on a tie) is
   * stolen if the newcomer is not below it and a tail slot is free. False:
   * the newcomer is dropped.
   */
  private admitOneShot(priority: number): boolean {
    if (this.hasRoom("oneShot")) return true;
    if (!this.hasRoom("tail")) return false;
    const victim = this.weakest("oneShot", false);
    if (!victim || priority < victim.priority) return false;
    this.retire(victim);
    return true;
  }

  /**
   * Makes room in the loop pool. When it is full, only an essential loop may
   * make room: it preempts the weakest non-essential playing loop, if a tail
   * slot is free. That loop's request waits again and restarts once its old
   * voice has ended. False: the loop keeps waiting. Nothing else ever stops a
   * loop, so an essential loop is never preempted.
   */
  private admitLoop(cue: ResolvedCue): boolean {
    if (this.hasRoom("loop")) return true;
    if (cue.essential !== true || !this.hasRoom("tail")) return false;
    const victim = this.weakest("loop", true);
    if (!victim) return false;
    this.retire(victim);
    const request = victim.loop;
    if (request && request.status === "playing") {
      request.status = "pending";
      this.pending.push(request);
    }
    return true;
  }

  /** The lowest-priority playing voice of `pool`, the oldest on a tie; optionally only non-essential ones. */
  private weakest(pool: Pool, nonEssentialOnly: boolean): Voice<CueKey> | null {
    let victim: Voice<CueKey> | null = null;
    for (const voice of this.voices) {
      if (voice.pool !== pool || voice.state !== "playing") continue;
      if (nonEssentialOnly && voice.essential) continue;
      if (
        !victim ||
        voice.priority < victim.priority ||
        (voice.priority === victim.priority && voice.order < victim.order)
      ) {
        victim = voice;
      }
    }
    return victim;
  }

  /** A stolen or preempted voice moves to the tail and fades out. It keeps that slot until it has ended. */
  private retire(voice: Voice<CueKey>): void {
    voice.pool = "tail";
    this.stopVoice(voice, VOICE_STEAL_FADE_S);
  }

  /**
   * Starts every waiting loop that fits, in a fixed order: essential first,
   * then higher priority, then the earlier request. A loop whose cue is not
   * resolvable yet, or whose previous voice is still fading, keeps waiting.
   */
  private promotePending(): void {
    if (this.promoting || this.pending.length === 0) return;
    if (!this.context || !this.graph || this.disposed || !this.unlocked) return;
    this.promoting = true;
    try {
      const ready: { request: LoopRequest<CueKey>; cue: ResolvedCue }[] = [];
      for (const request of this.pending) {
        if (request.voice) continue;
        const cue = this.resolve(request.cue);
        if (cue) ready.push({ request, cue });
      }
      ready.sort(byLoopPrecedence);
      for (const { request, cue } of ready) {
        if (request.status === "pending" && this.admitLoop(cue)) this.startLoop(request, cue);
      }
    } finally {
      this.promoting = false;
    }
  }

  /** Starts one admitted loop request. A request has at most one live voice at a time. */
  private startLoop(request: LoopRequest<CueKey>, cue: ResolvedCue): void {
    const index = this.pending.indexOf(request);
    if (index >= 0) this.pending.splice(index, 1);
    const voice = this.startVoice(cue, "loop", request);
    // A source that refuses to start never will: the request ends, as in A1.
    request.status = voice ? "playing" : "ended";
    request.voice = voice;
  }

  private cancelPending(): void {
    for (const request of this.pending) request.status = "ended";
    this.pending.length = 0;
  }

  /** Creates and starts one admitted voice. Its slot was made free by the caller. */
  private startVoice(
    resolved: ResolvedCue,
    pool: "loop" | "oneShot",
    request: LoopRequest<CueKey> | null,
    opts?: PlayOptions,
  ): Voice<CueKey> | null {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph) return null;
    const looping = pool === "loop";
    const baseGain = clamp(resolved.gain, 0, 1);
    const rate = request ? request.rate : playbackRate(opts?.rate);
    const source = context.createBufferSource();
    source.buffer = resolved.buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = baseGain * (request ? request.gain : unitGain(opts?.gain, 1));
    source.connect(gain);

    let filter: BiquadFilterNodeLike | null = null;
    if (looping) {
      source.loop = true;
      const { loopStart, loopEnd } = resolved;
      if (
        typeof loopStart === "number" &&
        typeof loopEnd === "number" &&
        Number.isFinite(loopStart) &&
        Number.isFinite(loopEnd) &&
        loopStart >= 0 &&
        loopEnd > loopStart
      ) {
        source.loopStart = loopStart;
        source.loopEnd = loopEnd;
      }
      const nyquist = context.sampleRate / 2;
      filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value =
        request && request.filterHz !== null
          ? clamp(request.filterHz, MIN_FILTER_HZ, nyquist)
          : nyquist;
      gain.connect(filter);
      filter.connect(graph.buses[resolved.bus]);
    } else {
      gain.connect(graph.buses[resolved.bus]);
    }

    const voice: Voice<CueKey> = {
      source,
      gain,
      filter,
      baseGain,
      priority: resolved.priority,
      essential: looping && resolved.essential === true,
      order: this.nextOrder++,
      loop: request,
      pool,
      state: "playing",
      // A one-shot ends by itself when its buffer has played (its rate is
      // fixed); a loop only once it is stopped.
      endsBy: looping
        ? Number.POSITIVE_INFINITY
        : context.currentTime + resolved.buffer.duration / rate,
    };
    source.onended = () => this.onVoiceEnded(voice);
    try {
      source.start();
    } catch {
      // Never started, so never live: it takes no slot.
      this.finishVoice(voice);
      return null;
    }
    this.voices.add(voice);
    return voice;
  }

  /** `onended`: the browser reports that the source has ended. Its slot frees at once. */
  private onVoiceEnded(voice: Voice<CueKey>): void {
    this.finishVoice(voice);
    this.promotePending();
  }

  /**
   * Schedules the end of a playing voice, with a fade. Scheduling proves
   * nothing: the voice stays live and keeps its slot until it has ended
   * (its `onended`, or the clock past `endsBy`, see `reclaimEnded`).
   */
  private stopVoice(voice: Voice<CueKey>, fadeS: number): void {
    const context = this.context;
    if (voice.state !== "playing" || !context) return;
    voice.state = "stopping";
    const fade = Number.isFinite(fadeS) && fadeS > 0 ? fadeS : 0;
    const now = context.currentTime;
    if (fade > 0 && voice.gain) {
      const param = voice.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(0, now, fade / FADE_TIME_CONSTANTS);
    }
    try {
      voice.source.stop(now + fade);
      voice.endsBy = Math.min(voice.endsBy, now + fade);
    } catch {
      // Only a source that never started refuses stop(); it cannot play past now.
      voice.endsBy = Math.min(voice.endsBy, now);
    }
  }

  /** Releases a source known to have ended (or every source, on dispose), and frees its slot. */
  private finishVoice(voice: Voice<CueKey>): void {
    if (voice.state === "ended") return;
    voice.state = "ended";
    this.voices.delete(voice);
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain?.disconnect();
    voice.filter?.disconnect();
    const request = voice.loop;
    if (request && request.voice === voice) {
      request.voice = null;
      // A loop that ends without being stopped stays ended (as in A1). A
      // preempted, pending request may now start again.
      if (request.status === "playing") request.status = "ended";
    }
  }

  private handleFor(request: LoopRequest<CueKey>): LoopHandle {
    /** The voice the handle controls: only while the request is playing. */
    const playing = () => (request.status === "playing" ? request.voice : null);
    return {
      setGain: (gain) => {
        if (request.status === "ended" || typeof gain !== "number" || !Number.isFinite(gain)) {
          return;
        }
        request.gain = clamp(gain, 0, 1);
        this.refresh();
        const voice = playing();
        if (voice?.gain) this.rampTo(voice.gain.gain, voice.baseGain * request.gain);
      },
      setRate: (rate) => {
        if (request.status === "ended" || typeof rate !== "number") return;
        if (!Number.isFinite(rate) || rate <= 0) return;
        request.rate = clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE);
        this.refresh();
        const voice = playing();
        if (voice) this.rampTo(voice.source.playbackRate, request.rate);
      },
      setFilter: (frequencyHz) => {
        if (request.status === "ended" || typeof frequencyHz !== "number") return;
        if (!Number.isFinite(frequencyHz)) return;
        request.filterHz = frequencyHz;
        this.refresh();
        const voice = playing();
        const context = this.context;
        if (voice?.filter && context) {
          this.rampTo(
            voice.filter.frequency,
            clamp(frequencyHz, MIN_FILTER_HZ, context.sampleRate / 2),
          );
        }
      },
      stop: (fadeS) => {
        if (request.status === "ended") return;
        const voice = playing();
        request.status = "ended";
        const index = this.pending.indexOf(request);
        if (index >= 0) this.pending.splice(index, 1);
        // A preempted request's old voice keeps fading in the tail, as before.
        if (voice) this.stopVoice(voice, fadeS);
        this.refresh();
      },
      // A4a.1: reads state only; no refresh(), so a pending loop is never promoted here.
      isAudible: () =>
        !this.disposed &&
        request.status === "playing" &&
        request.voice !== null &&
        request.voice.state === "playing" &&
        this.audible() &&
        this.context !== null &&
        this.context.state === "running",
    };
  }

  /** A smooth parameter change from the current value (docs/08 §3.2: `setTargetAtTime`). */
  private rampTo(param: AudioParamLike, value: number): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, PARAM_TIME_CONSTANT_S);
  }
}
