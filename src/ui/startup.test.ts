// Startup controller tests (LA1). Node env, fakes only: an image loader, an
// audio host surface, a frame callback and manual timers. These prove the
// state machine, the measured progress model and the failure paths; the
// rendered screen is covered in screen.loading.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioLoadState } from "@/ui/audio-host";
import {
  AUDIO_GRACE_MS,
  SLOW_HINT_MS,
  STARTUP_WEIGHTS,
  createStartup,
  type StartupTimers,
} from "@/ui/startup";
import { createStore } from "@/ui/store/store";

class FakeImages {
  readonly statuses = new Map<string, "loading" | "ready" | "failed">();
  readonly retries: string[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(keys: readonly string[]) {
    for (const key of keys) this.statuses.set(key, "loading");
  }
  keys() {
    return [...this.statuses.keys()];
  }
  status(key: string) {
    return this.statuses.get(key) ?? "failed";
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  retry(key: string) {
    this.retries.push(key);
    this.set(key, "loading");
  }
  set(key: string, status: "loading" | "ready" | "failed") {
    this.statuses.set(key, status);
    for (const listener of [...this.listeners]) listener();
  }
  listenerCount() {
    return this.listeners.size;
  }
}

class ManualTimers implements StartupTimers {
  private now = 0;
  private next = 1;
  private readonly pending = new Map<number, { at: number; callback: () => void }>();
  set(callback: () => void, ms: number) {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, callback });
    return id;
  }
  clear(id: unknown) {
    this.pending.delete(id as number);
  }
  advance(ms: number) {
    this.now += ms;
    for (const [id, timer] of [...this.pending]) {
      if (timer.at <= this.now) {
        this.pending.delete(id);
        timer.callback();
      }
    }
  }
  count() {
    return this.pending.size;
  }
}

const IMAGES = ["anchor", "seaFloor", "ship", "shipShine"];

function setup() {
  const images = new FakeImages(IMAGES);
  const loading = createStore<AudioLoadState>({
    started: false,
    cues: 0,
    fetched: 0,
    failed: 0,
    music: "pending",
    support: "pending",
  });
  const calls: string[] = [];
  const audio = {
    loading,
    preload: () => {
      calls.push("preload");
      loading.set({ ...loading.get(), started: true, cues: 4, support: "supported" });
    },
    unlock: () => calls.push("unlock"),
    deferGestureUnlock: () => calls.push("defer"),
  };
  let frameCallbacks: (() => void)[] = [];
  const whenFrameRendered = (callback: () => void) => {
    frameCallbacks.push(callback);
    return () => {
      frameCallbacks = frameCallbacks.filter((c) => c !== callback);
    };
  };
  const timers = new ManualTimers();
  const startup = createStartup({ images, audio, whenFrameRendered, timers });
  const renderFrame = () => {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    for (const callback of callbacks) callback();
  };
  const audioPatch = (patch: Partial<AudioLoadState>) =>
    loading.set({ ...loading.get(), ...patch });
  const allImages = () => {
    for (const key of IMAGES) images.set(key, "ready");
  };
  const allAudio = () => audioPatch({ fetched: 4, music: "available" });
  return {
    startup,
    images,
    audio,
    calls,
    timers,
    renderFrame,
    audioPatch,
    allImages,
    allAudio,
    pendingFrames: () => frameCallbacks.length,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("startup — phases", () => {
  it("weights sum to 100", () => {
    const sum = Object.values(STARTUP_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("initializing until begin (the server render), with nothing started", () => {
    const t = setup();
    expect(t.startup.get()).toMatchObject({ phase: "initializing", progress: 0 });
    expect(t.calls).toEqual([]);
    expect(t.images.listenerCount()).toBe(0);
  });

  it("INITIALIZING → LOADING → READY → PLAYING on real signals only", () => {
    const t = setup();
    t.startup.begin();
    expect(t.startup.get().phase).toBe("loading");
    expect(t.calls).toEqual(["defer", "preload"]);
    t.allImages();
    expect(t.startup.get().phase).toBe("loading"); // no frame drawn yet
    t.allAudio();
    expect(t.startup.get().phase).toBe("loading");
    t.renderFrame();
    expect(t.startup.get()).toMatchObject({ phase: "ready", progress: 1 });
    t.startup.startGame();
    expect(t.calls).toEqual(["defer", "preload", "unlock"]);
    expect(t.startup.get().phase).toBe("playing");
  });

  it("waits for the frame drawn AFTER the images, not an earlier one", () => {
    const t = setup();
    t.startup.begin();
    expect(t.pendingFrames()).toBe(0); // not asked for before the images are ready
    t.allAudio();
    t.allImages();
    expect(t.pendingFrames()).toBe(1);
    t.renderFrame();
    expect(t.startup.get().phase).toBe("ready");
  });

  it("begin is idempotent: one preload, one subscription each", () => {
    const t = setup();
    t.startup.begin();
    t.startup.begin();
    expect(t.calls).toEqual(["defer", "preload"]);
    expect(t.images.listenerCount()).toBe(1);
  });

  it("startGame does nothing while plainly loading, and only once", () => {
    const t = setup();
    t.startup.begin();
    t.startup.startGame();
    expect(t.startup.get().phase).toBe("loading");
    expect(t.calls).toEqual(["defer", "preload"]);
    t.allImages();
    t.allAudio();
    t.renderFrame();
    t.startup.startGame();
    t.startup.startGame();
    expect(t.calls).toEqual(["defer", "preload", "unlock"]);
  });

  it("playing releases every subscription and timer", () => {
    const t = setup();
    t.startup.begin();
    t.allImages();
    t.allAudio();
    t.renderFrame();
    t.startup.startGame();
    expect(t.images.listenerCount()).toBe(0);
    expect(t.timers.count()).toBe(0);
    t.images.set("anchor", "failed");
    expect(t.startup.get().phase).toBe("playing");
  });
});

describe("startup — progress", () => {
  it("advances by completed tasks, monotonic, and never shows 100 % before READY", () => {
    const t = setup();
    t.startup.begin();
    const seen: number[] = [t.startup.get().progress];
    const record = () => seen.push(t.startup.get().progress);
    // app 5 + audio support 2
    expect(t.startup.get().progress).toBeCloseTo(0.07);
    t.images.set("anchor", "ready");
    record();
    t.audioPatch({ fetched: 2 });
    record();
    t.images.set("seaFloor", "ready");
    t.images.set("ship", "ready");
    t.images.set("shipShine", "ready");
    record();
    t.audioPatch({ fetched: 3, failed: 1, music: "available" });
    record();
    expect(t.startup.get().progress).toBeLessThan(1);
    expect(t.startup.get().progress).toBeCloseTo(0.9);
    t.renderFrame();
    record();
    expect(t.startup.get().progress).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it("every task done but no frame yet stays below 100 %", () => {
    const t = setup();
    t.startup.begin();
    t.allImages();
    t.allAudio();
    expect(t.startup.get().progress).toBeLessThan(1);
    expect(t.startup.get().phase).toBe("loading");
  });
});

describe("startup — audio never blocks indefinitely", () => {
  it("visuals done, audio slow: READY after the grace, with a 'still loading' notice", () => {
    const t = setup();
    t.startup.begin();
    t.allImages();
    t.renderFrame();
    expect(t.startup.get().phase).toBe("loading");
    t.timers.advance(AUDIO_GRACE_MS - 1);
    expect(t.startup.get().phase).toBe("loading");
    t.timers.advance(1);
    expect(t.startup.get()).toMatchObject({
      phase: "ready",
      progress: 1,
      audioNotice: "sounds-deferred",
    });
  });

  it("failed sounds do not block: READY with a quiet notice", () => {
    const t = setup();
    t.startup.begin();
    t.allImages();
    t.renderFrame();
    t.audioPatch({ fetched: 1, failed: 3, music: "available" });
    expect(t.startup.get()).toMatchObject({ phase: "ready", audioNotice: "sounds-failed" });
  });

  it("an unavailable soundtrack does not block", () => {
    const t = setup();
    t.startup.begin();
    t.allImages();
    t.renderFrame();
    t.audioPatch({ fetched: 4, music: "unavailable" });
    expect(t.startup.get()).toMatchObject({ phase: "ready", audioNotice: "music-unavailable" });
  });

  it("unsupported audio is the first notice", () => {
    const t = setup();
    t.startup.begin();
    t.audioPatch({ support: "unsupported", failed: 4, music: "unsupported" });
    t.allImages();
    t.renderFrame();
    expect(t.startup.get()).toMatchObject({ phase: "ready", audioNotice: "audio-unsupported" });
  });

  it("a preload that throws still reaches READY after the grace", () => {
    const t = setup();
    t.audio.preload = () => {
      throw new Error("boom");
    };
    t.startup.begin();
    t.allImages();
    t.renderFrame();
    t.timers.advance(AUDIO_GRACE_MS);
    expect(t.startup.get().phase).toBe("ready");
  });
});

describe("startup — failures, Retry and the escape hatch", () => {
  it("a failed image: FAILED once nothing is still loading, with the failed keys", () => {
    const t = setup();
    t.startup.begin();
    t.images.set("ship", "failed");
    expect(t.startup.get().phase).toBe("loading"); // others still loading
    t.images.set("anchor", "ready");
    t.images.set("seaFloor", "ready");
    t.images.set("shipShine", "ready");
    expect(t.startup.get()).toMatchObject({ phase: "failed", failedImages: ["ship"] });
    expect(t.startup.get().progress).toBeLessThan(1);
  });

  it("Retry reloads only the failed images and can then reach READY", () => {
    const t = setup();
    t.startup.begin();
    t.allAudio();
    t.images.set("anchor", "ready");
    t.images.set("seaFloor", "failed");
    t.images.set("ship", "ready");
    t.images.set("shipShine", "failed");
    t.startup.retry();
    expect(t.images.retries).toEqual(["seaFloor", "shipShine"]);
    expect(t.startup.get().phase).toBe("loading");
    t.images.set("seaFloor", "ready");
    t.images.set("shipShine", "ready");
    t.renderFrame();
    expect(t.startup.get().phase).toBe("ready");
  });

  it("Retry outside FAILED does nothing", () => {
    const t = setup();
    t.startup.begin();
    t.startup.retry();
    expect(t.images.retries).toEqual([]);
  });

  it("Continue from FAILED starts the game (vector fallbacks) and unlocks audio", () => {
    const t = setup();
    t.startup.begin();
    for (const key of IMAGES) t.images.set(key, "failed");
    t.startup.startGame();
    expect(t.calls).toContain("unlock");
    expect(t.startup.get().phase).toBe("playing");
  });

  it("a slow load shows the hint after SLOW_HINT_MS and allows Continue", () => {
    const t = setup();
    t.startup.begin();
    t.timers.advance(SLOW_HINT_MS - 1);
    expect(t.startup.get().slow).toBe(false);
    t.timers.advance(1);
    expect(t.startup.get()).toMatchObject({ phase: "loading", slow: true });
    t.startup.startGame();
    expect(t.startup.get().phase).toBe("playing");
  });

  it("the slow hint never appears once READY", () => {
    const t = setup();
    t.startup.begin();
    t.allImages();
    t.allAudio();
    t.renderFrame();
    t.timers.advance(SLOW_HINT_MS * 2);
    expect(t.startup.get()).toMatchObject({ phase: "ready", slow: false });
  });

  it("a throwing frame subscription or image loader never throws out of begin", () => {
    const t = setup();
    t.images.subscribe = () => {
      throw new Error("nope");
    };
    expect(() => t.startup.begin()).not.toThrow();
    expect(t.startup.get().phase).toBe("loading");
  });
});
