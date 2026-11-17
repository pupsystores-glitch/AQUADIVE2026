// Audio in the real screen (Sprint 5 / Phase 7, step A4b; docs/08 §3.3,
// §14 risk 14). jsdom, through the unchanged DOM harness (bootScreen).
//
// The audio listeners live on the real jsdom `window` / `document`; they are
// counted with spies filtered to the audio event types. `AudioContext` is
// stubbed with the existing FakeAudioContext where a test needs a context;
// otherwise jsdom has none and the game runs silent (docs/08 §10). The
// harness's subscription counter and frame queue are used as-is.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext } from "@/audio/test/fake-audio-context";
import { UNLOCK_GESTURES } from "@/ui/audio-host";
import { SOUND_SETTINGS_STORAGE_KEY } from "@/ui/store/sound-settings-store";
import { bootScreen, slotButton } from "@/ui/test/dom-harness";

const AUDIO_TYPES = new Set<string>([
  ...UNLOCK_GESTURES,
  "pagehide",
  "pageshow",
  "visibilitychange",
]);

/** Net audio listeners on window + document (added − removed, by type and function). */
const trackAudioListeners = () => {
  const live = new Set<string>();
  const ids = new WeakMap<object, number>();
  let next = 0;
  const key = (target: string, type: string, fn: unknown) => {
    const f = fn as object;
    if (!ids.has(f)) ids.set(f, next++);
    return `${target}:${type}:${ids.get(f)}`;
  };
  for (const [name, target] of [
    ["window", window],
    ["document", document],
  ] as const) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    vi.spyOn(target, "addEventListener").mockImplementation((type, fn, options) => {
      if (AUDIO_TYPES.has(type)) live.add(key(name, type, fn));
      add(type, fn, options);
    });
    vi.spyOn(target, "removeEventListener").mockImplementation((type, fn, options) => {
      if (AUDIO_TYPES.has(type)) live.delete(key(name, type, fn));
      remove(type, fn, options);
    });
  }
  return { count: () => live.size };
};

const ONE_SET = AUDIO_TYPES.size;

let contexts: FakeAudioContext[];
const stubContext = () => {
  contexts = [];
  vi.stubGlobal(
    "AudioContext",
    class extends FakeAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    },
  );
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("screen audio — listeners follow the canvas mount", () => {
  it("mount installs one audio listener set, unmount removes it; display subscriptions and the frame loop are unchanged", async () => {
    const h = await bootScreen();
    const audio = trackAudioListeners();
    const mounted = h.mount();
    expect(audio.count()).toBe(ONE_SET);
    expect(h.pendingFrames()).toBe(1);
    expect(h.subscriptions.active).toBe(0); // audio adds no display subscription
    mounted.unmount();
    expect(audio.count()).toBe(0);
    expect(h.pendingFrames()).toBe(0);
    h.mount();
    expect(audio.count()).toBe(ONE_SET);
    expect(h.subscriptions.added).toBe(0);
  });

  it("StrictMode's double mount leaves exactly one audio listener set and one frame loop", async () => {
    const h = await bootScreen();
    const audio = trackAudioListeners();
    const mounted = h.mount({ strict: true });
    expect(audio.count()).toBe(ONE_SET);
    expect(h.pendingFrames()).toBe(1);
    mounted.unmount();
    expect(audio.count()).toBe(0);
  });
});

describe("screen audio — the first gesture", () => {
  it("PLACE BET unlocks audio and the bet still lands", async () => {
    stubContext();
    const h = await bootScreen();
    h.mount();
    h.frames(1);
    const before = h.session.wallet.get().balance;
    await h.user.click(slotButton(/^PLACE BET/));
    h.tick();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].state).toBe("running");
    expect(h.session.wallet.get().balance).toBeLessThan(before);
    h.untilState("diving");
    expect(h.pendingFrames()).toBe(1);
  });

  it("a saved mute is applied before that gesture unlocks: the context never runs", async () => {
    localStorage.setItem(
      SOUND_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, muted: true, master: 1, music: 1, ambience: 1, sfx: 1 }),
    );
    stubContext();
    const h = await bootScreen();
    h.mount();
    expect(h.session.soundSettings.get().muted).toBe(true);
    await h.user.click(slotButton(/^PLACE BET/));
    h.tick();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].state).toBe("suspended");
    h.untilState("diving");
  });

  it("without Web Audio (plain jsdom) the game plays a round silently, with one warning", async () => {
    // A6: the production manifest has assets and jsdom serves none, so the
    // asset requests stay pending here. A missing file is covered in
    // audio-host.test.ts and sound-bank.test.ts.
    vi.stubGlobal("fetch", () => new Promise<never>(() => {}));
    const h = await bootScreen({ crashPoint: 2 });
    h.mount();
    await h.user.click(slotButton(/^PLACE BET/));
    h.untilState("diving");
    h.untilState("crashed");
    expect(h.pendingFrames()).toBe(1);
    const audioWarnings = vi
      .mocked(console.warn)
      .mock.calls.filter((c) => String(c[0]).startsWith("[audio]"));
    expect(audioWarnings).toHaveLength(1);
  });
});
