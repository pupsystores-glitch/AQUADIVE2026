// IOS-AUDIO: the temporary dev-only audio diagnostics recorder.
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
import {
  audioDiagnosticsEnabled,
  createAudioDiagnostics,
  DIAGNOSTIC_TEST_CUE,
} from "@/ui/audio-diagnostics";
import { createAudioHost, type AudioEnvironment } from "@/ui/audio-host";
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

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const betOnly = (): SoundManifest<CueId> => {
  const manifest = {} as Record<CueId, CueDefinition>;
  for (const [id, definition] of Object.entries(SOUND_MANIFEST) as [CueId, CueDefinition][]) {
    manifest[id] = {
      ...definition,
      asset: id === DIAGNOSTIC_TEST_CUE ? { url: "test://bet" } : null,
    };
  }
  return manifest;
};

function setup(resumeMode: "immediate" | "activation" = "immediate") {
  const contexts: FakeAudioContext[] = [];
  const fetch = new FakeFetch();
  const win = new FakeTarget();
  const settings = createSoundSettingsStore({ storage: () => null });
  const diagnostics = createAudioDiagnostics({
    createContext: () => {
      const context = new FakeAudioContext({ resumeMode });
      contexts.push(context);
      return context;
    },
    fetch: fetch.fetch,
    createMediaElement: () => null,
    platform: { userAgent: "iPhone", maxTouchPoints: 5 },
    now: () => 0,
  });
  const host = createAudioHost({
    events: new EventBus<EngineEventMap>(),
    settings,
    manifest: betOnly(),
    music: null,
    environment: (): AudioEnvironment => ({ window: win, document: null }),
    ...diagnostics.hostOptions,
  });
  return { diagnostics, host, contexts, fetch, win, settings };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("IOS-AUDIO diagnostics", () => {
  it("is enabled only by ?audiodebug=1", () => {
    expect(audioDiagnosticsEnabled("?audiodebug=1")).toBe(true);
    expect(audioDiagnosticsEnabled("?audiodebug=0")).toBe(false);
    expect(audioDiagnosticsEnabled("")).toBe(false);
    expect(audioDiagnosticsEnabled(undefined)).toBe(false);
  });

  it("creates no context of its own and records the one the manager creates", async () => {
    const t = setup();
    t.host.attach();
    expect(t.contexts).toHaveLength(0);
    expect(t.diagnostics.snapshot().contextState).toMatch(/^none/);
    t.win.dispatch("pointerdown");
    await flush();
    const s = t.diagnostics.snapshot();
    expect(t.contexts).toHaveLength(1);
    expect(s.contextsCreated).toBe(1);
    expect(s.contextState).toBe("running");
    expect(s.unlockCalls).toBe(1);
    expect(s.resumesResolved).toBe(1);
    expect(s.applied).toMatchObject({ muted: false, master: 1, sfx: 0.7 });
    expect(s.iosOrIpados).toBe(true);
  });

  it("the BET 1 test plays through the manager once the cue is decoded", async () => {
    const t = setup();
    t.host.attach();
    t.win.dispatch("pointerdown");
    t.fetch.for("test://bet")[0].ok();
    await flush();
    t.contexts[0].decodes.at(-1)!.succeed(fakeBuffer(0.3));
    await flush();
    expect(t.diagnostics.snapshot().files).toContainEqual({
      cue: DIAGNOSTIC_TEST_CUE,
      bank: "ready",
      http: "HTTP 200",
    });
    expect(t.diagnostics.testSound()).toMatch(/source started/);
    expect(t.diagnostics.snapshot().decodesOk).toBe(1);
  });

  it("the BET 1 test respects mute", async () => {
    const t = setup();
    t.host.attach();
    t.settings.setMuted(true);
    t.win.dispatch("pointerdown");
    t.fetch.for("test://bet")[0].ok();
    await flush();
    t.contexts[0].decodes.at(-1)!.succeed(fakeBuffer(0.3));
    await flush();
    const before = t.contexts[0].sources.length;
    expect(t.diagnostics.testSound()).toMatch(/silent: muted/);
    expect(t.contexts[0].sources.length).toBe(before);
  });

  it("shows a pending resume and its completion in a later gesture", async () => {
    const t = setup("activation");
    t.host.attach();
    t.win.dispatch("pointerdown"); // a touch: no activation
    await flush();
    expect(t.diagnostics.snapshot()).toMatchObject({
      resumesPending: 1,
      contextState: "suspended",
    });
    t.contexts[0].userActivation = true;
    t.win.dispatch("touchend");
    await flush();
    expect(t.diagnostics.snapshot()).toMatchObject({
      resumesPending: 0,
      resumesResolved: 2,
      contextState: "running",
    });
    expect(t.diagnostics.report()).toContain("AudioContext: running");
  });

  it("reports why music is off on iOS (Q15)", async () => {
    const t = createAudioDiagnostics({
      createMediaElement: () => null,
      platform: { userAgent: "iPhone" },
    });
    expect(t.hostOptions.createMediaElement!()).toBeNull();
    expect(t.snapshot().music).toMatch(/Q15/);
  });
});
