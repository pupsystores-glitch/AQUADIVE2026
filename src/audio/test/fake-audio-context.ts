// Fake AudioContext for the audio tests (Sprint 5 / Phase 7, step A1;
// docs/08_AUDIO_FX_ARCHITECTURE.md §11: node environment, fake context, no
// new dependency).
//
// It implements the structural `AudioContextLike` surface the AudioManager
// uses, and records what the manager does with it:
//
// - every created node, and each node's outgoing connections, so a test can
//   follow a voice's route to the destination (`routeOf`);
// - every parameter automation call; a parameter's `value` settles to the
//   last value or target at once, so tests read the level the manager asked
//   for;
// - every resume / suspend / close call, and the run state.
//
// State changes are synchronous: `resume()` sets "running" and dispatches
// `statechange` before its promise resolves. The hooks `interrupt()`,
// `systemSuspend()` and `systemResume()` simulate the browser changing the
// state by itself (iOS interruption, a phone call ending). `currentTime`
// moves only through `advance()`; playback ends only through `end()`.
//
// Decoding (A1.1) is manual: each `decodeAudioData` call is recorded as a
// `FakeDecodeRequest`, and a test settles it with `succeed()` / `fail()`, or
// drives each reporting channel on its own to test exactly-once settlement.
// `decodeStyle` picks the API form: "both" (current browsers: callbacks and
// a promise), "promise" (callbacks ignored) or "callback" (older WebKit: no
// promise is returned).

import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
} from "../audio-manager";

export type Automation =
  | { readonly kind: "setValueAtTime"; readonly value: number; readonly time: number }
  | {
      readonly kind: "setTargetAtTime";
      readonly value: number;
      readonly time: number;
      readonly timeConstant: number;
    }
  | { readonly kind: "cancelScheduledValues"; readonly time: number };

export class FakeAudioParam implements AudioParamLike {
  readonly automation: Automation[] = [];

  constructor(public value: number) {}

  setValueAtTime(value: number, time: number): this {
    this.automation.push({ kind: "setValueAtTime", value, time });
    this.value = value;
    return this;
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    this.automation.push({ kind: "setTargetAtTime", value, time, timeConstant });
    this.value = value;
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.automation.push({ kind: "cancelScheduledValues", time });
    return this;
  }

  /** The last `setTargetAtTime` call, if any. */
  lastTarget(): Extract<Automation, { kind: "setTargetAtTime" }> | undefined {
    for (let i = this.automation.length - 1; i >= 0; i--) {
      const entry = this.automation[i];
      if (entry.kind === "setTargetAtTime") return entry;
    }
    return undefined;
  }
}

export class FakeAudioNode implements AudioNodeLike {
  readonly connections: FakeAudioNode[] = [];
  disconnectCalls = 0;

  constructor(readonly kind: string) {}

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.connections.push(destination as FakeAudioNode);
    return destination;
  }

  disconnect(): void {
    this.disconnectCalls++;
    this.connections.length = 0;
  }
}

export class FakeGainNode extends FakeAudioNode implements GainNodeLike {
  readonly gain = new FakeAudioParam(1);

  constructor() {
    super("gain");
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode implements BiquadFilterNodeLike {
  type = "lowpass";
  readonly frequency = new FakeAudioParam(350);

  constructor() {
    super("biquad");
  }
}

export class FakeDynamicsCompressorNode
  extends FakeAudioNode
  implements DynamicsCompressorNodeLike
{
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);

  constructor() {
    super("compressor");
  }
}

export class FakeAudioBuffer implements AudioBufferLike {
  readonly duration: number;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.duration = length / sampleRate;
  }
}

/** A buffer of the given duration, independent of any context (AudioBuffers are). */
export const fakeBuffer = (durationS: number, sampleRate = 48_000) =>
  new FakeAudioBuffer(1, Math.max(1, Math.round(durationS * sampleRate)), sampleRate);

export class FakeAudioBufferSourceNode extends FakeAudioNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeAudioParam(1);
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  constructor(private readonly context: FakeAudioContext) {
    super("bufferSource");
  }

  start(when = 0): void {
    if (this.startedAt !== null) throw new Error("InvalidStateError: start() called twice");
    this.startedAt = when;
  }

  stop(when?: number): void {
    if (this.startedAt === null) throw new Error("InvalidStateError: stop() before start()");
    this.stoppedAt = when ?? this.context.currentTime;
  }

  /** Simulates the end of playback (natural end, or a scheduled stop reached). */
  end(): void {
    this.onended?.();
  }
}

/** How `decodeAudioData` reports: see the file header. */
export type FakeDecodeStyle = "both" | "promise" | "callback";

/** One recorded `decodeAudioData` call, settled by the test. */
export class FakeDecodeRequest {
  private resolvePromise: ((buffer: unknown) => void) | null = null;
  private rejectPromise: ((error: unknown) => void) | null = null;
  /** The promise returned to the caller, or `undefined` in the "callback" style. */
  readonly promise: Promise<AudioBufferLike> | undefined;

  constructor(
    readonly data: ArrayBuffer,
    readonly style: FakeDecodeStyle,
    private readonly successCallback: ((buffer: AudioBufferLike) => void) | undefined,
    private readonly errorCallback: ((error: unknown) => void) | undefined,
  ) {
    if (style !== "callback") {
      this.promise = new Promise<AudioBufferLike>((resolve, reject) => {
        this.resolvePromise = resolve as (buffer: unknown) => void;
        this.rejectPromise = reject;
      });
      // A rejection nobody listens to must not fail the test run.
      this.promise.catch(() => {});
    }
  }

  /** Reports a decoded buffer through every channel of the style. */
  succeed(buffer: unknown = fakeBuffer(1)): void {
    if (this.style !== "promise") this.callSuccess(buffer);
    if (this.style !== "callback") this.resolve(buffer);
  }

  /** Reports a decoding error through every channel of the style. */
  fail(error: unknown = new Error("EncodingError: unable to decode audio data")): void {
    if (this.style !== "promise") this.callError(error);
    if (this.style !== "callback") this.reject(error);
  }

  // Single channels, for exactly-once tests.
  callSuccess(buffer: unknown): void {
    this.successCallback?.(buffer as AudioBufferLike);
  }

  callError(error: unknown): void {
    this.errorCallback?.(error);
  }

  resolve(buffer: unknown): void {
    this.resolvePromise?.(buffer);
  }

  reject(error: unknown): void {
    this.rejectPromise?.(error);
  }
}

export interface FakeAudioContextOptions {
  /** Initial state; a real context created outside a gesture starts "suspended". */
  readonly state?: string;
  readonly sampleRate?: number;
  /** When true, `resume()` rejects and the state does not change. */
  readonly rejectResume?: boolean;
  /** The `decodeAudioData` API form; "both" by default. */
  readonly decodeStyle?: FakeDecodeStyle;
  /** When true, `decodeAudioData` throws synchronously. */
  readonly throwOnDecode?: boolean;
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate: number;
  state: string;
  readonly destination = new FakeAudioNode("destination");

  rejectResume: boolean;
  decodeStyle: FakeDecodeStyle;
  throwOnDecode: boolean;
  readonly decodes: FakeDecodeRequest[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;

  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly compressors: FakeDynamicsCompressorNode[] = [];
  readonly sources: FakeAudioBufferSourceNode[] = [];
  readonly buffers: FakeAudioBuffer[] = [];

  private readonly stateListeners = new Set<() => void>();

  constructor(options: FakeAudioContextOptions = {}) {
    this.state = options.state ?? "suspended";
    this.sampleRate = options.sampleRate ?? 48_000;
    this.rejectResume = options.rejectResume ?? false;
    this.decodeStyle = options.decodeStyle ?? "both";
    this.throwOnDecode = options.throwOnDecode ?? false;
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    const node = new FakeDynamicsCompressorNode();
    this.compressors.push(node);
    return node;
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode(this);
    this.sources.push(node);
    return node;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer;
  }

  decodeAudioData(
    audioData: ArrayBuffer,
    successCallback?: (decodedData: AudioBufferLike) => void,
    errorCallback?: (error: unknown) => void,
  ): Promise<AudioBufferLike> | void {
    if (this.throwOnDecode) throw new TypeError("decodeAudioData: invalid argument");
    const request = new FakeDecodeRequest(
      audioData,
      this.decodeStyle,
      successCallback,
      errorCallback,
    );
    this.decodes.push(request);
    return request.promise;
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.state === "closed") return Promise.reject(new Error("InvalidStateError: closed"));
    if (this.rejectResume) return Promise.reject(new Error("NotAllowedError: no user gesture"));
    this.setState("running");
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspendCalls++;
    if (this.state === "closed") return Promise.reject(new Error("InvalidStateError: closed"));
    this.setState("suspended");
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls++;
    this.setState("closed");
    return Promise.resolve();
  }

  addEventListener(type: "statechange", listener: () => void): void {
    if (type === "statechange") this.stateListeners.add(listener);
  }

  removeEventListener(type: "statechange", listener: () => void): void {
    if (type === "statechange") this.stateListeners.delete(listener);
  }

  get stateListenerCount(): number {
    return this.stateListeners.size;
  }

  // ----- test hooks: the browser changing the state by itself -----

  /** iOS Safari: a phone call or Siri interrupts the session. */
  interrupt(): void {
    this.setState("interrupted");
  }

  systemSuspend(): void {
    this.setState("suspended");
  }

  systemResume(): void {
    this.setState("running");
  }

  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  private setState(state: string): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of [...this.stateListeners]) listener();
  }
}

/** The chain of nodes a node feeds, following the first connection at each step. */
export function routeOf(node: FakeAudioNode): FakeAudioNode[] {
  const route: FakeAudioNode[] = [];
  const seen = new Set<FakeAudioNode>();
  let current: FakeAudioNode | undefined = node.connections[0];
  while (current && !seen.has(current)) {
    seen.add(current);
    route.push(current);
    current = current.connections[0];
  }
  return route;
}
