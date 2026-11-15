// SoundBank tests (Sprint 5 / Phase 7, step A2; docs/08 §3.2, §7.1, §7.2,
// §11). Success, failure, deduplication and concurrency, eviction and
// disposal with stale completions, SSR safety, and integration with the real
// AudioManager over the fake context. Node environment; no new dependency.
// Every asset URL is a `test://` fixture: no real asset exists (docs/08 §8).
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  LOOP_VOICES,
  MAX_VOICES,
  createAudioManager,
  type AudioManager,
  type LoopHandle,
} from "./audio-manager";
import {
  CUE_IDS,
  LOOP_CUES,
  ONE_SHOT_CUES,
  SOUND_MANIFEST,
  type CueDefinition,
  type CueId,
  type SoundManifest,
} from "./manifest";
import { createSoundBank, type SoundBank } from "./sound-bank";
import { FakeAudioContext, fakeBuffer, routeOf } from "./test/fake-audio-context";
import { FakeFetch, ManualDecoder, fakeBytes, flush } from "./test/fake-fetch";

type Cue = "clink" | "boom" | "bed" | "rattle" | "silent" | "broken";

const TEST_MANIFEST: SoundManifest<Cue> = {
  clink: {
    kind: "oneShot",
    category: "sfx",
    gain: 0.8,
    priority: 2,
    asset: { url: "test://clink" },
  },
  boom: { kind: "oneShot", category: "sfx", gain: 1, priority: 3, asset: { url: "test://boom" } },
  bed: {
    kind: "loop",
    category: "ambience",
    gain: 0.5,
    priority: 3,
    essential: true,
    loopStart: 0.05,
    loopEnd: 19.95,
    asset: { url: "test://bed" },
  },
  rattle: {
    kind: "loop",
    category: "sfx",
    gain: 1,
    priority: 2,
    essential: false,
    asset: { url: "test://rattle" },
  },
  silent: { kind: "oneShot", category: "sfx", gain: 1, priority: 1, asset: null },
  // Invalid on purpose: a gain above 1.
  broken: {
    kind: "oneShot",
    category: "sfx",
    gain: 2,
    priority: 1,
    asset: { url: "test://broken" },
  },
};

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const setup = (options: { honorAbort?: boolean } = {}) => {
  const fetch = new FakeFetch({ honorAbort: options.honorAbort });
  const decoder = new ManualDecoder();
  const bank: SoundBank<Cue> = createSoundBank({
    manifest: TEST_MANIFEST,
    decoder,
    fetch: fetch.fetch,
  });
  return { bank, fetch, decoder };
};

/** Fetches `cue` successfully and decodes it to `buffer`. */
const deliver = async (
  env: ReturnType<typeof setup>,
  url: string,
  buffer = fakeBuffer(1),
): Promise<void> => {
  env.fetch.for(url).at(-1)!.ok();
  await flush();
  env.decoder.requests.at(-1)!.succeed(buffer);
  await flush();
};

describe("SSR safety", () => {
  it("imports and constructs without touching fetch, AbortController or window", () => {
    const fetchSpy = vi.fn();
    const abortSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("AbortController", abortSpy);
    expect(typeof window).toBe("undefined");
    const bank = createSoundBank({ manifest: TEST_MANIFEST, decoder: new ManualDecoder() });
    for (const cue of Object.keys(TEST_MANIFEST) as Cue[]) {
      expect(bank.resolve(cue)).toBeNull();
      bank.status(cue);
    }
    bank.onReady(() => {})();
    bank.evict("clink");
    bank.dispose();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalled();
  });

  it("reads the global fetch only when a load starts", async () => {
    const fetch = new FakeFetch();
    vi.stubGlobal("fetch", vi.fn(fetch.fetch));
    const decoder = new ManualDecoder();
    const bank = createSoundBank({ manifest: TEST_MANIFEST, decoder });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const result = bank.load("clink");
    expect(globalThis.fetch).toHaveBeenCalledWith("test://clink", expect.anything());
    fetch.requests[0].ok();
    await flush();
    decoder.requests[0].succeed(fakeBuffer(1));
    await expect(result).resolves.toBe("ready");
  });

  it("without fetch, a load fails safely and is logged once", async () => {
    vi.stubGlobal("fetch", undefined);
    const bank = createSoundBank({ manifest: TEST_MANIFEST, decoder: new ManualDecoder() });
    await expect(bank.load("clink")).resolves.toBe("failed");
    await expect(bank.load("clink")).resolves.toBe("failed");
    expect(bank.resolve("clink")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("without AbortController, loads still work", async () => {
    vi.stubGlobal("AbortController", undefined);
    const env = setup();
    const result = env.bank.load("clink");
    expect(env.fetch.requests[0].signal).toBeUndefined();
    await deliver(env, "test://clink");
    await expect(result).resolves.toBe("ready");
  });
});

describe("loading", () => {
  it("fetches, decodes and caches a one-shot", async () => {
    const env = setup();
    expect(env.bank.status("clink")).toBe("unloaded");
    const result = env.bank.load("clink");
    expect(env.bank.status("clink")).toBe("loading");
    expect(env.fetch.requests.map((r) => r.url)).toEqual(["test://clink"]);
    const bytes = fakeBytes();
    env.fetch.requests[0].ok(bytes);
    await flush();
    expect(env.decoder.requests).toHaveLength(1);
    expect(env.decoder.requests[0].data).toBe(bytes);
    expect(env.bank.resolve("clink")).toBeNull(); // still decoding
    const buffer = fakeBuffer(0.3);
    env.decoder.requests[0].succeed(buffer);
    await expect(result).resolves.toBe("ready");
    expect(env.bank.status("clink")).toBe("ready");
    const resolved = env.bank.resolve("clink");
    expect(resolved).toEqual({ buffer, bus: "sfx", gain: 0.8, priority: 2 });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(env.bank.resolve("clink")).toBe(resolved); // cached, no allocation per call
  });

  it("carries a loop's essential flag and loop points", async () => {
    const env = setup();
    void env.bank.load("bed");
    const buffer = fakeBuffer(20);
    await deliver(env, "test://bed", buffer);
    expect(env.bank.resolve("bed")).toEqual({
      buffer,
      bus: "ambience",
      gain: 0.5,
      priority: 3,
      essential: true,
      loopStart: 0.05,
      loopEnd: 19.95,
    });
  });

  it("omits loop points a loop does not define", async () => {
    const env = setup();
    void env.bank.load("rattle");
    await deliver(env, "test://rattle");
    const resolved = env.bank.resolve("rattle")!;
    expect(resolved.essential).toBe(false);
    expect("loopStart" in resolved).toBe(false);
    expect("loopEnd" in resolved).toBe(false);
  });

  it("a ready cue loads again at once, without a new fetch", async () => {
    const env = setup();
    void env.bank.load("clink");
    await deliver(env, "test://clink");
    await expect(env.bank.load("clink")).resolves.toBe("ready");
    expect(env.fetch.requests).toHaveLength(1);
  });

  it("loadAll loads every manifest cue by default, results in order", async () => {
    const env = setup();
    const all = env.bank.loadAll();
    expect(env.fetch.requests.map((r) => r.url).sort()).toEqual(
      ["test://bed", "test://boom", "test://clink", "test://rattle"].sort(),
    );
    for (const request of env.fetch.requests) request.ok();
    await flush();
    for (const request of env.decoder.requests) request.succeed(fakeBuffer(1));
    await expect(all).resolves.toEqual([
      "ready",
      "ready",
      "ready",
      "ready",
      "unavailable",
      "failed",
    ]);
  });

  it("loadAll takes a subset", async () => {
    const env = setup();
    const some = env.bank.loadAll(["silent", "clink"]);
    await deliver(env, "test://clink");
    await expect(some).resolves.toEqual(["unavailable", "ready"]);
  });
});

describe("unavailable cues", () => {
  it("a cue with no asset is never fetched, never logged, never playable", async () => {
    const env = setup();
    expect(env.bank.status("silent")).toBe("unavailable");
    await expect(env.bank.load("silent")).resolves.toBe("unavailable");
    expect(env.fetch.requests).toHaveLength(0);
    expect(env.bank.resolve("silent")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("an id outside the manifest, inherited keys included, is unavailable", async () => {
    const env = setup();
    for (const id of ["nope", "toString", "__proto__"] as unknown as Cue[]) {
      expect(env.bank.status(id)).toBe("unavailable");
      await expect(env.bank.load(id)).resolves.toBe("unavailable");
      expect(env.bank.resolve(id)).toBeNull();
    }
    expect(env.fetch.requests).toHaveLength(0);
  });

  it("with the real manifest, every cue is unavailable and nothing is fetched (A2: no assets)", async () => {
    const fetch = new FakeFetch();
    const decoder = new ManualDecoder();
    const bank = createSoundBank({ manifest: SOUND_MANIFEST, decoder, fetch: fetch.fetch });
    const results = await bank.loadAll();
    expect(results).toHaveLength(CUE_IDS.length);
    expect(new Set(results)).toEqual(new Set(["unavailable"]));
    for (const id of CUE_IDS) {
      expect(bank.status(id)).toBe("unavailable");
      expect(bank.resolve(id)).toBeNull();
    }
    expect(fetch.requests).toHaveLength(0);
    expect(decoder.requests).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  it.each([
    ["a missing file (404)", (env: ReturnType<typeof setup>) => env.fetch.requests[0].status(404)],
    ["a server error (500)", (env: ReturnType<typeof setup>) => env.fetch.requests[0].status(500)],
    ["a network error", (env: ReturnType<typeof setup>) => env.fetch.requests[0].networkError()],
    ["a failing body", (env: ReturnType<typeof setup>) => env.fetch.requests[0].bodyError()],
  ])("%s leaves the cue failed, silent and logged once", async (_, failFetch) => {
    const env = setup();
    const result = env.bank.load("clink");
    failFetch(env);
    await expect(result).resolves.toBe("failed");
    expect(env.bank.status("clink")).toBe("failed");
    expect(env.bank.resolve("clink")).toBeNull();
    expect(env.decoder.requests).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"clink"');
  });

  it("is not retried: a failed cue loads as failed, without a new fetch", async () => {
    const env = setup();
    const first = env.bank.load("clink");
    env.fetch.requests[0].status(404);
    await first;
    await expect(env.bank.load("clink")).resolves.toBe("failed");
    expect(env.fetch.requests).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a decoding failure (null) leaves the cue failed", async () => {
    const env = setup();
    const result = env.bank.load("boom");
    env.fetch.requests[0].ok();
    await flush();
    env.decoder.requests[0].fail();
    await expect(result).resolves.toBe("failed");
    expect(env.bank.resolve("boom")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a decoder that rejects leaves the cue failed, and the load still resolves", async () => {
    const env = setup();
    const result = env.bank.load("boom");
    env.fetch.requests[0].ok();
    await flush();
    env.decoder.requests[0].reject();
    await expect(result).resolves.toBe("failed");
  });

  it("an invalid manifest entry fails without a fetch", async () => {
    const env = setup();
    await expect(env.bank.load("broken")).resolves.toBe("failed");
    expect(env.fetch.requests).toHaveLength(0);
    expect(env.bank.status("broken")).toBe("failed");
    expect(String(warn.mock.calls[0][0])).toContain("invalid manifest entry");
  });

  it("evict, then load, is the explicit retry; the failure is still logged only once", async () => {
    const env = setup();
    const first = env.bank.load("clink");
    env.fetch.requests[0].status(404);
    await first;
    env.bank.evict("clink");
    expect(env.bank.status("clink")).toBe("unloaded");
    const retry = env.bank.load("clink");
    env.fetch.requests[1].networkError();
    await expect(retry).resolves.toBe("failed");
    expect(warn).toHaveBeenCalledTimes(1);
    env.bank.evict("clink");
    const third = env.bank.load("clink");
    await deliver(env, "test://clink");
    await expect(third).resolves.toBe("ready");
  });
});

describe("deduplication and concurrency", () => {
  it("concurrent loads of one cue share one fetch, one decode and one result", async () => {
    const env = setup();
    const a = env.bank.load("clink");
    const b = env.bank.load("clink");
    const c = env.bank.loadAll(["clink", "clink"]);
    expect(a).toBe(b);
    expect(env.fetch.requests).toHaveLength(1);
    await deliver(env, "test://clink");
    expect(env.decoder.requests).toHaveLength(1);
    await expect(Promise.all([a, b, c])).resolves.toEqual(["ready", "ready", ["ready", "ready"]]);
  });

  it("loads of different cues run in parallel and may finish in any order", async () => {
    const env = setup();
    const clink = env.bank.load("clink");
    const boom = env.bank.load("boom");
    env.fetch.for("test://boom")[0].ok();
    await flush();
    env.decoder.requests[0].succeed(fakeBuffer(1.5));
    await expect(boom).resolves.toBe("ready");
    expect(env.bank.status("clink")).toBe("loading");
    env.fetch.for("test://clink")[0].ok();
    await flush();
    env.decoder.requests[1].succeed(fakeBuffer(0.2));
    await expect(clink).resolves.toBe("ready");
  });

  it("a failure of one cue does not affect another", async () => {
    const env = setup();
    const clink = env.bank.load("clink");
    const boom = env.bank.load("boom");
    env.fetch.for("test://clink")[0].status(404);
    await deliver(env, "test://boom");
    await expect(Promise.all([clink, boom])).resolves.toEqual(["failed", "ready"]);
  });
});

describe("onReady", () => {
  it("fires once per cue that becomes ready, after resolve serves it", async () => {
    const env = setup();
    const seen: (string | null)[] = [];
    env.bank.onReady((cue) => seen.push(cue, env.bank.resolve(cue) ? "resolved" : null));
    void env.bank.load("clink");
    void env.bank.load("clink");
    await deliver(env, "test://clink");
    expect(seen).toEqual(["clink", "resolved"]);
  });

  it("does not fire for failed or unavailable cues", async () => {
    const env = setup();
    const listener = vi.fn();
    env.bank.onReady(listener);
    const failed = env.bank.load("clink");
    env.fetch.requests[0].status(404);
    await failed;
    await env.bank.load("silent");
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes", async () => {
    const env = setup();
    const listener = vi.fn();
    const off = env.bank.onReady(listener);
    off();
    off();
    void env.bank.load("clink");
    await deliver(env, "test://clink");
    expect(listener).not.toHaveBeenCalled();
  });

  it("a listener that throws is logged and does not stop the others or the load", async () => {
    const env = setup();
    const after = vi.fn();
    env.bank.onReady(() => {
      throw new Error("listener broke");
    });
    env.bank.onReady(after);
    const result = env.bank.load("clink");
    await deliver(env, "test://clink");
    await expect(result).resolves.toBe("ready");
    expect(after).toHaveBeenCalledWith("clink");
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("evict", () => {
  it("mid-fetch: aborts the fetch, cancels the load, ignores a late response", async () => {
    const env = setup({ honorAbort: false });
    const ready = vi.fn();
    env.bank.onReady(ready);
    const result = env.bank.load("clink");
    const request = env.fetch.requests[0];
    env.bank.evict("clink");
    expect(request.aborted).toBe(true);
    await expect(result).resolves.toBe("cancelled");
    expect(env.bank.status("clink")).toBe("unloaded");
    request.ok(); // the late response
    await flush();
    expect(request.bodyReads).toBe(0); // a stale response's body is never read
    expect(env.decoder.requests).toHaveLength(0);
    expect(env.bank.resolve("clink")).toBeNull();
    expect(ready).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("mid-fetch with a fetch that honours the abort: no failure is logged", async () => {
    const env = setup();
    const result = env.bank.load("clink");
    env.bank.evict("clink");
    await expect(result).resolves.toBe("cancelled");
    await flush();
    expect(warn).not.toHaveBeenCalled();
    expect(env.bank.status("clink")).toBe("unloaded");
  });

  it("mid-body: bytes that arrive after the evict are never decoded", async () => {
    const env = setup();
    const result = env.bank.load("clink");
    const releaseBody = env.fetch.requests[0].okWithDeferredBody();
    await flush();
    expect(env.fetch.requests[0].bodyReads).toBe(1);
    env.bank.evict("clink");
    await expect(result).resolves.toBe("cancelled");
    releaseBody();
    await flush();
    expect(env.decoder.requests).toHaveLength(0);
    expect(env.bank.resolve("clink")).toBeNull();
    expect(env.bank.status("clink")).toBe("unloaded");
  });

  it("mid-decode: the late buffer never refills the cache", async () => {
    const env = setup();
    const ready = vi.fn();
    env.bank.onReady(ready);
    const result = env.bank.load("bed");
    env.fetch.requests[0].ok();
    await flush();
    env.bank.evict("bed");
    await expect(result).resolves.toBe("cancelled");
    env.decoder.requests[0].succeed(fakeBuffer(20));
    await flush();
    expect(env.bank.resolve("bed")).toBeNull();
    expect(env.bank.status("bed")).toBe("unloaded");
    expect(ready).not.toHaveBeenCalled();
  });

  it("a stale load cannot overwrite the cue's next load", async () => {
    const env = setup({ honorAbort: false });
    void env.bank.load("clink");
    env.bank.evict("clink");
    const second = env.bank.load("clink");
    expect(env.fetch.requests).toHaveLength(2);
    // The first, stale fetch completes after the second started.
    env.fetch.requests[0].ok();
    await flush();
    expect(env.decoder.requests).toHaveLength(0);
    const fresh = fakeBuffer(0.4);
    env.fetch.requests[1].ok();
    await flush();
    env.decoder.requests[0].succeed(fresh);
    await expect(second).resolves.toBe("ready");
    expect(env.bank.resolve("clink")!.buffer).toBe(fresh);
  });

  it("a ready cue: resolve stops serving it, and a new load fetches again", async () => {
    const env = setup();
    void env.bank.load("clink");
    await deliver(env, "test://clink");
    env.bank.evict("clink");
    expect(env.bank.resolve("clink")).toBeNull();
    expect(env.bank.status("clink")).toBe("unloaded");
    void env.bank.load("clink");
    expect(env.fetch.requests).toHaveLength(2);
  });

  it("an unknown or unloaded cue is a no-op", () => {
    const env = setup();
    env.bank.evict("clink");
    env.bank.evict("nope" as Cue);
    expect(env.bank.status("clink")).toBe("unloaded");
  });
});

describe("dispose", () => {
  it("cancels every in-flight load and ignores every late result", async () => {
    const env = setup({ honorAbort: false });
    const ready = vi.fn();
    env.bank.onReady(ready);
    const fetching = env.bank.load("clink");
    const decoding = env.bank.load("bed");
    env.fetch.for("test://bed")[0].ok();
    await flush();
    const loaded = env.bank.load("boom");
    await deliver(env, "test://boom");
    await expect(loaded).resolves.toBe("ready");
    ready.mockClear();

    env.bank.dispose();
    await expect(Promise.all([fetching, decoding])).resolves.toEqual(["cancelled", "cancelled"]);
    expect(env.fetch.for("test://clink")[0].aborted).toBe(true);
    // Late results after the dispose.
    env.fetch.for("test://clink")[0].ok();
    env.decoder.requests[0].succeed(fakeBuffer(20));
    await flush();
    expect(env.decoder.requests).toHaveLength(2); // bed and boom only; clink never decoded
    for (const cue of ["clink", "bed", "boom"] as Cue[]) {
      expect(env.bank.resolve(cue)).toBeNull();
    }
    expect(ready).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("every later call is a no-op", async () => {
    const env = setup();
    env.bank.dispose();
    env.bank.dispose();
    await expect(env.bank.load("clink")).resolves.toBe("cancelled");
    await expect(env.bank.loadAll(["clink", "silent"])).resolves.toEqual([
      "cancelled",
      "cancelled",
    ]);
    const listener = vi.fn();
    env.bank.onReady(listener)();
    env.bank.evict("clink");
    expect(env.fetch.requests).toHaveLength(0);
    expect(env.bank.resolve("clink")).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });
});

// ----- integration with the AudioManager (A1–A1.2) -----

/** The real wiring of docs/08 §6 (A4 will do this in the session): one manager, one bank, one context. */
const integrate = <Id extends string>(manifest: SoundManifest<Id>) => {
  const context = new FakeAudioContext();
  const createContext = vi.fn(() => context);
  const fetch = new FakeFetch();
  const audio: AudioManager<Id> = createAudioManager<Id>({
    resolveCue: (cue) => bank.resolve(cue),
    createContext,
  });
  const bank: SoundBank<Id> = createSoundBank({ manifest, decoder: audio, fetch: fetch.fetch });
  /** Voice sources, without the 1-sample unlock primes. */
  const voices = () =>
    context.sources.filter((source) => !context.buffers.includes(source.buffer as never));
  const live = () => context.sources.filter((source) => source.isPlaying());
  return { context, createContext, fetch, audio, bank, voices, live };
};

/** Completes the fake context's oldest unsettled decode for `url`'s bytes. */
const fetchThenDecode = async (
  env: { readonly fetch: FakeFetch; readonly context: FakeAudioContext },
  url: string,
  buffer = fakeBuffer(1),
) => {
  env.fetch.for(url).at(-1)!.ok();
  await flush();
  env.context.decodes.at(-1)!.succeed(buffer);
  await flush();
};

describe("integration with the AudioManager", () => {
  it("decodes with the manager's single context, created only by the unlock", async () => {
    const env = integrate(TEST_MANIFEST);
    const result = env.bank.load("clink");
    env.fetch.requests[0].ok();
    await flush();
    // Bytes are in, but no context exists before a gesture: the decode waits.
    expect(env.createContext).not.toHaveBeenCalled();
    expect(env.bank.status("clink")).toBe("loading");
    await env.audio.unlock();
    expect(env.createContext).toHaveBeenCalledTimes(1);
    expect(env.context.decodes).toHaveLength(1);
    env.context.decodes[0].succeed(fakeBuffer(0.2));
    await expect(result).resolves.toBe("ready");
    void env.bank.load("boom");
    await fetchThenDecode(env, "test://boom");
    await env.audio.unlock();
    expect(env.createContext).toHaveBeenCalledTimes(1);
  });

  it("a one-shot is silent until its cue is ready, then plays on its bus", async () => {
    const env = integrate(TEST_MANIFEST);
    await env.audio.unlock();
    env.audio.play("clink");
    expect(env.voices()).toHaveLength(0);
    void env.bank.load("clink");
    await fetchThenDecode(env, "test://clink");
    env.audio.play("clink");
    expect(env.voices()).toHaveLength(1);
    const [source] = env.voices();
    expect(source.loop).toBe(false);
    const route = routeOf(source);
    expect(route[0].kind).toBe("gain");
    expect(route[1]).toBe(env.context.gains[3]); // the sfx bus
  });

  it("a pending loop starts once its buffer arrives, with one source however often it is woken", async () => {
    const env = integrate(TEST_MANIFEST);
    const handles: LoopHandle[] = [];
    env.bank.onReady((cue) => {
      if (cue === "bed") handles.forEach((handle) => handle.setGain(0.7)); // the A4 nudge
    });
    const bed = env.audio.loop("bed"); // before unlock and before loading
    handles.push(bed);
    void env.bank.load("bed");
    await env.audio.unlock();
    expect(env.voices()).toHaveLength(0); // pending: the cue is still loading
    await fetchThenDecode(env, "test://bed", fakeBuffer(20));
    expect(env.voices()).toHaveLength(1);
    const [source] = env.voices();
    expect(source.loop).toBe(true);
    expect([source.loopStart, source.loopEnd]).toEqual([0.05, 19.95]);
    expect(routeOf(source)[0]).toMatchObject({ kind: "gain" });
    expect((routeOf(source)[0] as unknown as { gain: { value: number } }).gain.value).toBeCloseTo(
      0.5 * 0.7,
    );
    // Further wake-ups, unlocks, plays and state changes add no source.
    bed.setGain(0.4);
    bed.setRate(1.1);
    bed.setFilter(800);
    await env.audio.unlock();
    env.audio.play("silent");
    env.context.advance(5);
    bed.setGain(0.5);
    expect(env.voices()).toHaveLength(1);
    bed.stop(0);
    expect(env.voices().filter((s) => s.isPlaying())).toHaveLength(0);
  });

  it("two handles waiting on one cue each get exactly one source", async () => {
    const env = integrate(TEST_MANIFEST);
    await env.audio.unlock();
    const a = env.audio.loop("rattle");
    const b = env.audio.loop("rattle");
    env.bank.onReady(() => a.setGain(1));
    void env.bank.load("rattle");
    await fetchThenDecode(env, "test://rattle", fakeBuffer(10));
    expect(env.voices()).toHaveLength(2);
    b.setGain(1);
    a.setGain(1);
    expect(env.voices()).toHaveLength(2);
  });

  it("a failed asset never breaks play or loop: they stay silent and safe", async () => {
    const env = integrate(TEST_MANIFEST);
    await env.audio.unlock();
    const bed = env.audio.loop("bed");
    const result = env.bank.load("bed");
    env.fetch.requests[0].status(404);
    await expect(result).resolves.toBe("failed");
    expect(() => {
      env.audio.play("bed");
      env.audio.play("silent");
      env.audio.play("broken");
      bed.setGain(0.5);
      bed.stop(0.2);
    }).not.toThrow();
    expect(env.voices()).toHaveLength(0);
  });

  it("a decode the manager rejects (corrupt bytes) leaves the cue failed", async () => {
    const env = integrate(TEST_MANIFEST);
    await env.audio.unlock();
    const result = env.bank.load("boom");
    env.fetch.requests[0].ok();
    await flush();
    env.context.decodes[0].fail();
    await expect(result).resolves.toBe("failed");
  });

  it("disposing the bank mid-decode: the late buffer revives nothing, the waiting loop stays silent", async () => {
    const env = integrate(TEST_MANIFEST);
    await env.audio.unlock();
    const bed = env.audio.loop("bed");
    const result = env.bank.load("bed");
    env.fetch.requests[0].ok();
    await flush();
    env.bank.dispose();
    await expect(result).resolves.toBe("cancelled");
    env.context.decodes[0].succeed(fakeBuffer(20));
    await flush();
    bed.setGain(1);
    env.audio.play("clink");
    expect(env.voices()).toHaveLength(0);
    expect(env.bank.resolve("bed")).toBeNull();
  });

  it("a manager disposed first settles the bank's waiting decodes as failures (dispose the bank first)", async () => {
    const env = integrate(TEST_MANIFEST);
    const result = env.bank.load("clink");
    env.fetch.requests[0].ok();
    await flush();
    env.audio.dispose();
    await expect(result).resolves.toBe("failed");
  });

  it("the full manifest keeps the pool contract: at most 16 live sources, both beds kept", async () => {
    const withTestAssets = Object.fromEntries(
      CUE_IDS.map((id) => [id, { ...SOUND_MANIFEST[id], asset: { url: `test://${id}` } }]),
    ) as Record<CueId, CueDefinition>;
    const env = integrate<CueId>(withTestAssets);
    await env.audio.unlock();
    const loading = env.bank.loadAll();
    for (const request of env.fetch.requests) request.ok();
    await flush();
    for (const decode of env.context.decodes) decode.succeed(fakeBuffer(5));
    await expect(loading).resolves.toEqual(CUE_IDS.map(() => "ready"));

    const loops = LOOP_CUES.map((id) => env.audio.loop(id));
    for (let round = 0; round < 4; round++) {
      for (const id of ONE_SHOT_CUES) env.audio.play(id);
    }
    expect(env.live().length).toBeLessThanOrEqual(MAX_VOICES);
    const liveLoops = env.live().filter((source) => source.loop);
    expect(liveLoops.length).toBeLessThanOrEqual(LOOP_VOICES);
    expect(liveLoops).toHaveLength(LOOP_CUES.length);
    const beds = liveLoops.filter((source) => routeOf(source).includes(env.context.gains[2]));
    expect(beds).toHaveLength(2); // both essential ambience beds, on the ambience bus
    loops.forEach((handle) => handle.stop(0));
  });
});
