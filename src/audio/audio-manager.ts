// AudioManager â€” the native Web Audio core (Sprint 5 / Phase 7, step A1;
// docs/08_AUDIO_FX_ARCHITECTURE.md Â§3.1â€“Â§3.4, Â§7, Â§10).
//
// Generic: it knows no game, no engine event and no cue list. It owns, for
// the lifetime of one game session:
//
// - The AudioContext, created lazily inside the first `unlock()` â€” never at
//   module scope, never at construction (Â§3.2, Â§10 SSR rule). The factory
//   resolves `AudioContext` / `webkitAudioContext` at call time. With
//   neither, or when construction throws, the manager stays silent for
//   good, logs once, and every call is a safe no-op (Â§10 "Safety").
// - The bus graph: `music`, `ambience` and `sfx` gain nodes â†’ `master`
//   gain â†’ limiter (`DynamicsCompressor`) â†’ output (Â§3.2). Bus gains are
//   clamped to 0..1, stored before the context exists, and applied with
//   `setTargetAtTime` once it does.
// - Voices: one-shots (`play`) and loops (`loop`), at most `MAX_VOICES`
//   at once. At the cap the lowest-priority voice is dropped â€” the oldest
//   one on a tie; a newcomer below every playing voice is the one dropped.
// - The run state. The context runs only while it is unlocked, not muted
//   and not suspended by the host (Â§3.3 steps 3â€“4: visibility / pagehide
//   suspend, visible-again resume "if unlocked and not muted").
// - Unlock (Â§3.3 step 2, Â§10): `unlock()` must be called inside a user
//   gesture. It creates or resumes the context and plays a 1-sample silent
//   buffer (the iOS prime) synchronously, inside that gesture.
// - Interruption (Â§3.3 step 5): an iOS `interrupted` state, or a suspend
//   the manager did not ask for, re-locks the manager and calls
//   `onUnlockRequired`, so the host can re-arm its gesture listeners. If the
//   system later resumes the context on its own, the manager accepts it.
//
// - Decoding (A1.1, docs/08 Â§7): `decode()` turns compressed bytes into a
//   buffer with the same single context, so the A2 sound bank never needs
//   a context of its own. It never creates the context: a request made
//   before the first unlock waits, and starts inside `unlock()`, after the
//   resume. Every request settles exactly once: with the buffer, or `null`
//   on a decoding error, an unsupported environment or `dispose()`. A
//   decoder result that arrives after that is ignored.
//
// Not here (later steps, docs/08 Â§12): fetching and caching buffers and the
// cue manifest (A2 â€” injected through `resolveCue`), the gesture and
// visibility listeners and every default sound setting (A4, the session),
// the settings store (A3). The manager is a passive sink for settings.
// It never touches `navigator.audioSession` (Q15 is open; the browser
// default applies).
//
// Clock: only `context.currentTime`. No wall clock, no timers.
// Imports: none (docs/08 Â§6 import rule).

/** The four gain buses (docs/08 Â§3.2). `master` sums the other three. */
export type AudioBus = "master" | "music" | "ambience" | "sfx";

/** The buses a voice can play on. */
export type VoiceBus = Exclude<AudioBus, "master">;

/** Voice cap (docs/08 Â§3.2, Â§9). Loops count toward it. */
export const MAX_VOICES = 16;

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

/** Limiter settings for the `DynamicsCompressor` after `master` (docs/08 Â§3.2). */
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

// ----- public contract (docs/08 Â§7) -----

/** A cue as the manager plays it. Supplied by the cue resolver (the A2 sound bank). */
export interface ResolvedCue {
  readonly buffer: AudioBufferLike;
  readonly bus: VoiceBus;
  /** The cue's own level, 0..1. Play and loop gains multiply it. */
  readonly gain: number;
  /** Higher survives the voice cap. */
  readonly priority: number;
  /** Loop points in seconds (loops only), to neutralize encoder padding (docs/08 Â§3.4). */
  readonly loopStart?: number;
  readonly loopEnd?: number;
}

/** Maps a cue to its buffer and settings, or `null` while it is missing or not loaded (then the cue is silent). */
export type CueResolver<CueKey extends string> = (cue: CueKey) => ResolvedCue | null;

export interface PlayOptions {
  /** Playback rate, clamped to MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE. */
  readonly rate?: number;
  /** Gain, clamped to 0..1, multiplied with the cue's gain. */
  readonly gain?: number;
}

/** Control of one looping voice. Every method is a no-op once the voice has stopped or was never started. */
export interface LoopHandle {
  /** Gain, clamped to 0..1, multiplied with the cue's gain. */
  setGain(gain: number): void;
  /** Playback rate, clamped to MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE. */
  setRate(rate: number): void;
  /** Low-pass cutoff in Hz, clamped to MIN_FILTER_HZ..Nyquist. */
  setFilter(frequencyHz: number): void;
  /** Fade out over `fadeS` seconds (0: at once), then stop. */
  stop(fadeS: number): void;
}

export interface AudioManager<CueKey extends string = string> {
  /** Must be called inside a user gesture. Never rejects. */
  unlock(): Promise<void>;
  /** Clamped to 0..1; a non-finite gain is ignored. */
  setBusGain(bus: AudioBus, gain: number): void;
  setMuted(muted: boolean): void;
  /** One-shot. A no-op until unlocked, while muted or suspended, and while the cue is not loaded. */
  play(cue: CueKey, opts?: PlayOptions): void;
  /** Looping voice. Before unlock, or while the cue is not loaded, the returned handle is inert. */
  loop(cue: CueKey): LoopHandle;
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
  /** Called when the context is interrupted or suspended by the system, so the host can re-arm its gesture unlock (docs/08 Â§3.3 step 5). */
  onUnlockRequired?: () => void;
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

type VoiceState = "playing" | "stopping" | "ended";

interface Voice {
  readonly source: AudioBufferSourceNodeLike;
  readonly gain: GainNodeLike;
  readonly filter: BiquadFilterNodeLike | null;
  /** The cue's gain; voice gains multiply it. */
  readonly baseGain: number;
  readonly priority: number;
  /** Start order, for the oldest-first tie-break at the cap. */
  readonly order: number;
  state: VoiceState;
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

const INERT_HANDLE: LoopHandle = Object.freeze({
  setGain: () => {},
  setRate: () => {},
  setFilter: () => {},
  stop: () => {},
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

const playbackRate = (rate: number | undefined) =>
  typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE)
    : 1;

class WebAudioManager<CueKey extends string> implements AudioManager<CueKey> {
  private readonly resolveCue: CueResolver<CueKey>;
  private readonly createContext: () => AudioContextLike | null;
  private readonly onUnlockRequired: (() => void) | undefined;

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

  private readonly voices = new Set<Voice>();
  private nextOrder = 0;

  /** Every unsettled `decode()` request, waiting or started, in request order. */
  private readonly decodes = new Set<DecodeRequest>();

  private resumeFailureLogged = false;
  private readonly resolveFailuresLogged = new Set<string>();

  constructor(options: AudioManagerOptions<CueKey>) {
    this.resolveCue = options.resolveCue;
    this.createContext = options.createContext ?? createBrowserAudioContext;
    this.onUnlockRequired = options.onUnlockRequired;
  }

  unlock(): Promise<void> {
    if (this.disposed || this.unlocked) return Promise.resolve();
    const context = this.ensureContext();
    if (!context) return Promise.resolve();

    // Everything up to resume() runs synchronously, inside the gesture.
    this.unlocked = true;
    this.interrupted = false;
    this.primeOutput(context);
    this.requested = "running";
    let resumed: Promise<void>;
    try {
      resumed = context.resume();
    } catch (error) {
      resumed = Promise.reject(error);
    }
    // Decoding needs the context, not a running one; it starts after the
    // gesture-critical prime and resume.
    this.startWaitingDecodes(context);
    return resumed.then(
      () => this.applyRunState(),
      (error: unknown) => {
        if (this.disposed) return;
        this.unlocked = false;
        this.requested = null;
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
  }

  play(cue: CueKey, opts?: PlayOptions): void {
    if (!this.audible()) return;
    this.startVoice(cue, false, opts);
  }

  loop(cue: CueKey): LoopHandle {
    const voice = this.startVoice(cue, true);
    return voice ? this.handleFor(voice) : INERT_HANDLE;
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
  }

  resume(): void {
    if (this.disposed) return;
    this.hostSuspended = false;
    this.applyRunState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;
    for (const voice of [...this.voices]) {
      try {
        voice.source.stop();
      } catch {
        // already stopped
      }
      this.finishVoice(voice);
    }
    this.settleAllDecodes();
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
      // No context will ever exist, so no waiting decode can start.
      this.settleAllDecodes();
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

  /** The iOS unlock prime: a 1-sample silent buffer played inside the gesture (docs/08 Â§3.3, Â§10). */
  private primeOutput(context: AudioContextLike): void {
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(context.destination);
      source.onended = () => source.disconnect();
      source.start(0);
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
    }
  };

  private logResumeFailure(error: unknown): void {
    if (this.resumeFailureLogged) return;
    this.resumeFailureLogged = true;
    console.warn("[audio] the audio context could not be resumed; staying silent.", error);
  }

  // ----- voices -----

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
    // A malformed cue stays silent, like a missing one.
    if (!resolved || !resolved.buffer || !isVoiceBus(resolved.bus)) return null;
    if (!Number.isFinite(resolved.gain) || !Number.isFinite(resolved.priority)) return null;
    return resolved;
  }

  private startVoice(cue: CueKey, looping: boolean, opts?: PlayOptions): Voice | null {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph || this.disposed || !this.unlocked) return null;
    const resolved = this.resolve(cue);
    if (!resolved) return null;
    const priority = resolved.priority;
    if (!this.admit(priority)) return null;

    const baseGain = clamp(resolved.gain, 0, 1);
    const source = context.createBufferSource();
    source.buffer = resolved.buffer;
    source.playbackRate.value = playbackRate(opts?.rate);
    const gain = context.createGain();
    gain.gain.value = baseGain * unitGain(opts?.gain, 1);
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
      filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = context.sampleRate / 2;
      gain.connect(filter);
      filter.connect(graph.buses[resolved.bus]);
    } else {
      gain.connect(graph.buses[resolved.bus]);
    }

    const voice: Voice = {
      source,
      gain,
      filter,
      baseGain,
      priority,
      order: this.nextOrder++,
      state: "playing",
    };
    source.onended = () => this.finishVoice(voice);
    try {
      source.start();
    } catch {
      this.finishVoice(voice);
      return null;
    }
    this.voices.add(voice);
    return voice;
  }

  /** Makes room for a voice of `priority`; false when the newcomer is the voice to drop. */
  private admit(priority: number): boolean {
    let playing = 0;
    let victim: Voice | null = null;
    for (const voice of this.voices) {
      if (voice.state !== "playing") continue;
      playing++;
      if (
        !victim ||
        voice.priority < victim.priority ||
        (voice.priority === victim.priority && voice.order < victim.order)
      ) {
        victim = voice;
      }
    }
    if (playing < MAX_VOICES || !victim) return true;
    if (priority < victim.priority) return false;
    this.stopVoice(victim, VOICE_STEAL_FADE_S);
    return true;
  }

  private stopVoice(voice: Voice, fadeS: number): void {
    const context = this.context;
    if (voice.state !== "playing" || !context) return;
    voice.state = "stopping";
    const fade = Number.isFinite(fadeS) && fadeS > 0 ? fadeS : 0;
    const now = context.currentTime;
    if (fade > 0) {
      const param = voice.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(0, now, fade / FADE_TIME_CONSTANTS);
    }
    try {
      voice.source.stop(now + fade);
    } catch {
      this.finishVoice(voice);
    }
  }

  private finishVoice(voice: Voice): void {
    if (voice.state === "ended") return;
    voice.state = "ended";
    this.voices.delete(voice);
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.filter?.disconnect();
  }

  private handleFor(voice: Voice): LoopHandle {
    const live = () => voice.state === "playing" && this.context !== null;
    return {
      setGain: (gain) => {
        if (!live() || typeof gain !== "number" || !Number.isFinite(gain)) return;
        this.rampTo(voice.gain.gain, voice.baseGain * clamp(gain, 0, 1));
      },
      setRate: (rate) => {
        if (!live() || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return;
        this.rampTo(voice.source.playbackRate, clamp(rate, MIN_PLAYBACK_RATE, MAX_PLAYBACK_RATE));
      },
      setFilter: (frequencyHz) => {
        const context = this.context;
        if (!live() || !context || !voice.filter) return;
        if (typeof frequencyHz !== "number" || !Number.isFinite(frequencyHz)) return;
        this.rampTo(
          voice.filter.frequency,
          clamp(frequencyHz, MIN_FILTER_HZ, context.sampleRate / 2),
        );
      },
      stop: (fadeS) => this.stopVoice(voice, fadeS),
    };
  }

  /** A smooth parameter change from the current value (docs/08 Â§3.2: `setTargetAtTime`). */
  private rampTo(param: AudioParamLike, value: number): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, PARAM_TIME_CONSTANT_S);
  }
}
