// Fake fetch and fake decoder for the sound-bank tests (Sprint 5 / Phase 7,
// step A2; docs/08_AUDIO_FX_ARCHITECTURE.md §11: node environment, no new
// dependency).
//
// - `FakeFetch` records every request. A test settles each one by hand:
//   `ok()` (an OK response with the given bytes), `status()` (a non-OK
//   response, such as a missing file), `networkError()`, or `bodyError()`
//   (OK headers, then a failing body). By default an aborted request rejects
//   with an `AbortError`, as the platform's fetch does; with
//   `honorAbort: false` it ignores the signal, so a test can deliver a late
//   response after an abort.
// - `ManualDecoder` stands in for `AudioManager.decode()`: each call is a
//   request that the test resolves with a buffer or `null`, or rejects (a
//   foreign decoder; the AudioManager's own never rejects).
//
// No URL here or in the tests points at a real asset: they use the
// `test://` scheme.

import type { AudioBufferLike } from "../audio-manager";
import type { FetchLike, FetchResponseLike } from "../sound-bank";

const okResponse = (bytes: ArrayBuffer): FetchResponseLike => ({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve(bytes),
});

/** Distinct bytes per call, so a test can tell which buffer reached the decoder. */
let nextByte = 1;
export const fakeBytes = (): ArrayBuffer => {
  const bytes = new Uint8Array([nextByte++ % 256, 0, 0, 0]);
  return bytes.buffer;
};

export class FakeFetchRequest {
  private resolvePromise: (response: FetchResponseLike) => void = () => {};
  private rejectPromise: (error: unknown) => void = () => {};
  readonly promise: Promise<FetchResponseLike>;

  constructor(
    readonly url: string,
    readonly signal: AbortSignal | undefined,
    honorAbort: boolean,
  ) {
    this.promise = new Promise<FetchResponseLike>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
    if (honorAbort && signal) {
      signal.addEventListener("abort", () =>
        this.rejectPromise(new DOMException("The operation was aborted.", "AbortError")),
      );
    }
  }

  /** How often the response body was read (`arrayBuffer()`). */
  bodyReads = 0;

  get aborted(): boolean {
    return this.signal?.aborted === true;
  }

  ok(bytes: ArrayBuffer = fakeBytes()): void {
    const response = okResponse(bytes);
    this.resolvePromise({
      ...response,
      arrayBuffer: () => {
        this.bodyReads++;
        return response.arrayBuffer();
      },
    });
  }

  /** OK headers now; the body arrives when the returned function is called. */
  okWithDeferredBody(): (bytes?: ArrayBuffer) => void {
    let release: (bytes: ArrayBuffer) => void = () => {};
    const body = new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
    this.resolvePromise({
      ok: true,
      status: 200,
      arrayBuffer: () => {
        this.bodyReads++;
        return body;
      },
    });
    return (bytes = fakeBytes()) => release(bytes);
  }

  status(code: number): void {
    this.resolvePromise({
      ok: false,
      status: code,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
  }

  networkError(error: unknown = new TypeError("Failed to fetch")): void {
    this.rejectPromise(error);
  }

  bodyError(error: unknown = new TypeError("body stream failed")): void {
    this.resolvePromise({ ok: true, status: 200, arrayBuffer: () => Promise.reject(error) });
  }
}

export class FakeFetch {
  readonly requests: FakeFetchRequest[] = [];

  constructor(private readonly options: { readonly honorAbort?: boolean } = {}) {}

  readonly fetch: FetchLike = (url, init) => {
    const request = new FakeFetchRequest(url, init?.signal, this.options.honorAbort ?? true);
    this.requests.push(request);
    return request.promise;
  };

  /** The requests for one URL, in call order. */
  for(url: string): FakeFetchRequest[] {
    return this.requests.filter((request) => request.url === url);
  }
}

export class ManualDecodeRequest {
  private resolvePromise: (buffer: AudioBufferLike | null) => void = () => {};
  private rejectPromise: (error: unknown) => void = () => {};
  readonly promise: Promise<AudioBufferLike | null>;

  constructor(readonly data: ArrayBuffer) {
    this.promise = new Promise<AudioBufferLike | null>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  succeed(buffer: AudioBufferLike): void {
    this.resolvePromise(buffer);
  }

  fail(): void {
    this.resolvePromise(null);
  }

  reject(error: unknown = new Error("decoder exploded")): void {
    this.rejectPromise(error);
  }
}

export class ManualDecoder {
  readonly requests: ManualDecodeRequest[] = [];

  readonly decode = (data: ArrayBuffer): Promise<AudioBufferLike | null> => {
    const request = new ManualDecodeRequest(data);
    this.requests.push(request);
    return request.promise;
  };
}

/** Lets every pending promise continuation run (the bank's load steps are async). */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
