// IOS-AUDIO regression (docs/08 §14 risk 17): the complete silence on iPhone.
//
// A tap on a touch screen dispatches `pointerdown` first and `touchend` last.
// Under the HTML user-activation rules only a mouse `pointerdown` activates;
// a touch activates on `touchend`. WebKit leaves an AudioContext.resume()
// made outside an activation pending: the context stays "suspended" and no
// `statechange` fires. Before the fix, the host's `pointerdown` unlock marked
// the manager unlocked, so the `touchend` unlock returned at once and no
// resume ever ran inside a real activation: every sound stayed silent.
//
// The fake context's "activation" resume mode models that rule. These tests
// drive the real host, manager, sound bank and director.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SOUND_MANIFEST,
  type CueDefinition,
  type CueId,
  type SoundManifest,
} from "@/audio/manifest";
import { FakeAudioContext, fakeBuffer } from "@/audio/test/fake-audio-context";
import { FakeFetch } from "@/audio/test/fake-fetch";
import { EventBus, type EngineEventMap } from "@/engine";
import { createAudioHost, type AudioEnvironment, type AudioFrameInput } from "@/ui/audio-host";
import { createSoundSettingsStore } from "@/ui/store/sound-settings-store";

class FakeTarget {
  readonly listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

/** Only `bet-clink-1` has an asset, so the test decodes one file. */
const betOnlyManifest = (): SoundManifest<CueId> => {
  const manifest = {} as Record<CueId, CueDefinition>;
  for (const [id, definition] of Object.entries(SOUND_MANIFEST) as [CueId, CueDefinition][]) {
    manifest[id] = { ...definition, asset: id === "bet-clink-1" ? { url: "test://bet" } : null };
  }
  return manifest;
};

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const frame: AudioFrameInput = {
  render: { depthRatio: 0 },
  time: { frameDt: 1 / 60 },
  state: { phase: "idle", multiplier: 1, boost: 0 },
};

function setup() {
  const events = new EventBus<EngineEventMap>();
  const contexts: FakeAudioContext[] = [];
  const fetch = new FakeFetch();
  const win = new FakeTarget();
  const doc = new FakeTarget();
  let activation = false;
  const host = createAudioHost({
    events,
    settings: createSoundSettingsStore({ storage: () => null }),
    createContext: () => {
      const context = new FakeAudioContext({ resumeMode: "activation" });
      context.userActivation = activation;
      contexts.push(context);
      return context;
    },
    fetch: fetch.fetch,
    manifest: betOnlyManifest(),
    music: null,
    environment: (): AudioEnvironment => ({ window: win, document: doc }),
  });
  /** Dispatches one gesture event, with or without user activation. */
  const fire = (type: string, activates: boolean) => {
    activation = activates;
    for (const context of contexts) context.userActivation = activates;
    win.dispatch(type);
    activation = false;
    for (const context of contexts) context.userActivation = false;
  };
  return {
    host,
    events,
    contexts,
    fetch,
    /** A finger tap: `pointerdown` (no activation), then `touchend` (activation). */
    touchTap: () => {
      fire("pointerdown", false);
      fire("touchend", true);
    },
    /** A mouse click: `pointerdown` activates. */
    mouseDown: () => fire("pointerdown", true),
    /** The started voice sources, without the 1-sample unlock primes. */
    voices: (context: FakeAudioContext) =>
      context.sources.filter(
        (source) => source.startedAt !== null && !context.buffers.includes(source.buffer as never),
      ),
    bet: () => {
      events.emit("betPlaced", { roundId: 1, slot: 0, amount: 1 });
      events.dispatchQueued();
      host.update(frame);
    },
  };
}

/** Loads and decodes the bet cue through the real bank and manager. */
const loadBet = async (t: ReturnType<typeof setup>) => {
  t.fetch.for("test://bet")[0].ok();
  await flush();
  t.contexts[0].decodes.at(-1)!.succeed(fakeBuffer(0.3));
  await flush();
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("IOS-AUDIO: touch unlock (risk 17)", () => {
  it("one finger tap starts the context: the touchend gesture resumes it", async () => {
    const t = setup();
    t.host.attach();
    t.touchTap();
    await flush();
    expect(t.contexts).toHaveLength(1); // one context, ever
    expect(t.contexts[0].state).toBe("running");
    expect(t.contexts[0].resumeCalls).toBe(2); // pointerdown (pending), touchend (runs)
  });

  it("after a tap, BET 1 plays through the sfx bus on a running context", async () => {
    const t = setup();
    t.host.attach();
    t.host.update(frame);
    t.touchTap();
    await loadBet(t);
    t.bet();
    const context = t.contexts[0];
    expect(context.state).toBe("running");
    expect(t.voices(context)).toHaveLength(1);
  });

  it("later taps on a running context resume nothing again", async () => {
    const t = setup();
    t.host.attach();
    t.touchTap();
    await flush();
    t.touchTap();
    t.touchTap();
    await flush();
    expect(t.contexts[0].resumeCalls).toBe(2);
    expect(t.contexts).toHaveLength(1);
  });

  it("a mouse click still unlocks on pointerdown alone (desktop unchanged)", async () => {
    const t = setup();
    t.host.attach();
    t.mouseDown();
    await flush();
    expect(t.contexts[0].state).toBe("running");
    expect(t.contexts[0].resumeCalls).toBe(1);
  });
});
