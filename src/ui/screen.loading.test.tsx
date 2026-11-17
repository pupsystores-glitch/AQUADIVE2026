// LA1 in the DOM: the SOUND and MUSIC buttons under the balance (through the
// unchanged screen harness, bootScreen) and the loading screen (rendered on
// its own over a real startup controller with fake loaders). jsdom.
//
// Simulated: no real browser layout, no real audio. Layout, touch and the
// fade are checked in a real browser separately (see the LA1 report).

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioLoadState } from "@/ui/audio-host";
import { createStartup, type Startup, type StartupTimers } from "@/ui/startup";
import { SOUND_SETTINGS_STORAGE_KEY } from "@/ui/store/sound-settings-store";
import { createStore } from "@/ui/store/store";
import { bootScreen } from "@/ui/test/dom-harness";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const soundButton = () => screen.getByRole("button", { name: "Sound effects" });
const musicButton = () => screen.getByRole("button", { name: "Music" });
const pressed = (el: HTMLElement) => el.getAttribute("aria-pressed");

describe("LA1 — SOUND and MUSIC buttons under the balance", () => {
  it("two icon buttons, in an 'Audio' group inside the top bar, both ON by default", async () => {
    const h = await bootScreen();
    h.mount();
    const group = screen.getByRole("group", { name: "Audio" });
    expect(group.closest("header")).not.toBeNull();
    expect(pressed(soundButton())).toBe("true");
    expect(pressed(musicButton())).toBe("true");
    // Icon-only: no visible text takes up space.
    expect(soundButton().textContent).toBe("");
    expect(musicButton().textContent).toBe("");
    expect(soundButton().getAttribute("type")).toBe("button");
  });

  it("the four states, each button independent, persisted at once", async () => {
    const h = await bootScreen();
    h.mount();
    const state = () => [pressed(soundButton()), pressed(musicButton())];
    const saved = () => JSON.parse(localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY) ?? "null");
    await h.user.click(musicButton());
    expect(state()).toEqual(["true", "false"]);
    expect(saved()).toMatchObject({ soundOn: true, musicOn: false });
    await h.user.click(soundButton());
    expect(state()).toEqual(["false", "false"]);
    expect(saved()).toMatchObject({ soundOn: false, musicOn: false });
    await h.user.click(musicButton());
    expect(state()).toEqual(["false", "true"]);
    await h.user.click(soundButton());
    expect(state()).toEqual(["true", "true"]);
    expect(saved()).toMatchObject({
      muted: false,
      soundOn: true,
      musicOn: true,
      master: 1,
      music: 1,
    });
  });

  it("keyboard: Enter and Space toggle a focused button", async () => {
    const h = await bootScreen();
    h.mount();
    soundButton().focus();
    await h.user.keyboard("{Enter}");
    expect(pressed(soundButton())).toBe("false");
    await h.user.keyboard(" ");
    expect(pressed(soundButton())).toBe("true");
    musicButton().focus();
    await h.user.keyboard(" ");
    expect(pressed(musicButton())).toBe("false");
  });

  it("touch: a tap toggles (pointer + click events)", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.pointer({ keys: "[TouchA]", target: musicButton() });
    expect(pressed(musicButton())).toBe("false");
  });

  it("saved switches are shown after a reload (restored when the canvas attaches)", async () => {
    localStorage.setItem(
      SOUND_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        muted: false,
        soundOn: false,
        musicOn: true,
        master: 1,
        music: 1,
        ambience: 1,
        sfx: 1,
      }),
    );
    const h = await bootScreen();
    h.mount();
    expect(pressed(soundButton())).toBe("false");
    expect(pressed(musicButton())).toBe("true");
  });

  it("a remount keeps the state (session-scoped store)", async () => {
    const h = await bootScreen();
    const first = h.mount();
    await h.user.click(musicButton());
    first.unmount();
    h.mount();
    expect(pressed(musicButton())).toBe("false");
    expect(pressed(soundButton())).toBe("true");
  });

  it("master mute: both show OFF; a press unmutes and plays exactly what the buttons show", async () => {
    const h = await bootScreen();
    h.mount();
    act(() => h.session.soundSettings.setMuted(true));
    expect(pressed(soundButton())).toBe("false");
    expect(pressed(musicButton())).toBe("false");
    await h.user.click(musicButton());
    expect(h.session.soundSettings.get()).toMatchObject({
      muted: false,
      musicOn: true,
      soundOn: false,
    });
    expect(pressed(musicButton())).toBe("true");
    expect(pressed(soundButton())).toBe("false");
  });

  it("toggling never touches the wallet or the round", async () => {
    const h = await bootScreen();
    h.mount();
    const balance = h.session.wallet.get().balance;
    const ticks = h.session.engine.tickCount;
    await h.user.click(soundButton());
    await h.user.click(musicButton());
    expect(h.session.wallet.get().balance).toBe(balance);
    expect(h.session.engine.tickCount).toBe(ticks);
  });
});

// ----- the loading screen -----

class ManualTimers implements StartupTimers {
  private readonly pending = new Map<number, () => void>();
  private next = 1;
  set(callback: () => void) {
    const id = this.next++;
    this.pending.set(id, callback);
    return id;
  }
  clear(id: unknown) {
    this.pending.delete(id as number);
  }
  fireAll() {
    for (const [id, callback] of [...this.pending]) {
      this.pending.delete(id);
      callback();
    }
  }
}

function fakeStartup() {
  const statuses = new Map<string, "loading" | "ready" | "failed">([
    ["anchor", "loading"],
    ["ship", "loading"],
  ]);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const loading = createStore<AudioLoadState>({
    started: false,
    cues: 2,
    fetched: 0,
    failed: 0,
    music: "pending",
    support: "pending",
  });
  const calls: string[] = [];
  let frame: (() => void) | null = null;
  const timers = new ManualTimers();
  const startup: Startup = createStartup({
    images: {
      keys: () => [...statuses.keys()],
      status: (k) => statuses.get(k) ?? "failed",
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      retry: (k) => {
        calls.push(`retry ${k}`);
        statuses.set(k, "loading");
        notify();
      },
    },
    audio: {
      loading,
      preload: () => {
        calls.push("preload");
        loading.set({ ...loading.get(), started: true, support: "supported" });
      },
      unlock: () => calls.push("unlock"),
    },
    whenFrameRendered: (cb) => {
      frame = cb;
      return () => (frame = null);
    },
    timers,
  });
  const image = (k: string, s: "loading" | "ready" | "failed") => {
    statuses.set(k, s);
    notify();
  };
  const finish = () => {
    image("anchor", "ready");
    image("ship", "ready");
    loading.set({ ...loading.get(), fetched: 2, music: "available" });
    const f = frame;
    frame = null;
    f?.();
  };
  return { startup, calls, image, finish, timers, loading };
}

async function mountLoading(t: ReturnType<typeof fakeStartup>) {
  vi.resetModules();
  vi.doMock("@/ui/startup-instance", () => ({ gameStartup: t.startup }));
  const { LoadingScreen } = await import("@/ui/components/LoadingScreen");
  return { LoadingScreen, view: render(createElement(LoadingScreen)) };
}

describe("LA1 — the loading screen", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.doUnmock("@/ui/startup-instance");
  });

  it("server markup is the loading screen at 0 % (no game UI exposed before hydration)", async () => {
    const t = fakeStartup();
    vi.resetModules();
    vi.doMock("@/ui/startup-instance", () => ({ gameStartup: t.startup }));
    const { LoadingScreen } = await import("@/ui/components/LoadingScreen");
    const html = renderToString(createElement(LoadingScreen));
    expect(html).toContain('data-phase="initializing"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain("AQUADIVE");
    expect(html).not.toContain("START GAME");
    // The no-JavaScript fallback: a reload hint that CSS alone reveals.
    expect(html).toContain("loading-stall-hint");
    expect(html).toContain('href="/"');
    expect(t.calls).toEqual([]); // begin() runs only after hydration
  });

  it("after hydration the stall hint is gone (loading has begun)", async () => {
    const t = fakeStartup();
    await mountLoading(t);
    expect(screen.queryByText("The game is taking too long to start.")).toBeNull();
  });

  it("mount begins loading once; the bar follows real progress; START GAME only when READY", async () => {
    const t = fakeStartup();
    await mountLoading(t);
    expect(t.calls).toEqual(["preload"]);
    const bar = screen.getByRole("progressbar", { name: "Loading AQUADIVE" });
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThan(100);
    expect(screen.queryByRole("button", { name: "START GAME" })).toBeNull();
    act(() => t.image("anchor", "ready"));
    const mid = Number(bar.getAttribute("aria-valuenow"));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    act(() => t.finish());
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    const start = screen.getByRole("button", { name: "START GAME" });
    expect(document.activeElement).toBe(start);
  });

  it("START GAME unlocks audio inside the press, then fades out and unmounts", async () => {
    vi.useFakeTimers();
    const t = fakeStartup();
    await mountLoading(t);
    act(() => t.finish());
    fireEvent.click(screen.getByRole("button", { name: "START GAME" }));
    expect(t.calls).toEqual(["preload", "unlock"]);
    const overlay = screen.getByTestId("loading-screen");
    expect(overlay.getAttribute("data-phase")).toBe("playing");
    expect(overlay.className).toContain("opacity-0");
    expect(overlay.className).toContain("pointer-events-none");
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });

  it("a remount after PLAYING renders nothing", async () => {
    const t = fakeStartup();
    const { LoadingScreen, view } = await mountLoading(t);
    act(() => t.finish());
    fireEvent.click(screen.getByRole("button", { name: "START GAME" }));
    view.unmount();
    render(createElement(LoadingScreen));
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });

  it("a failed texture shows Retry and Continue; Retry reloads only the failed image", async () => {
    const t = fakeStartup();
    await mountLoading(t);
    act(() => {
      t.image("anchor", "ready");
      t.image("ship", "failed");
    });
    expect(screen.getByText("Some game graphics could not be loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(t.calls).toContain("retry ship");
    expect(screen.queryByRole("button", { name: "RETRY" })).toBeNull();
    act(() => t.image("ship", "failed"));
    fireEvent.click(screen.getByRole("button", { name: "Continue anyway" }));
    expect(t.calls).toContain("unlock");
    expect(screen.getByTestId("loading-screen").getAttribute("data-phase")).toBe("playing");
  });

  it("a slow load shows the hint and Continue (never a trap)", async () => {
    const t = fakeStartup();
    await mountLoading(t);
    act(() => t.timers.fireAll());
    expect(screen.getByText("Slow connection — still loading…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue anyway" })).toBeTruthy();
  });

  it("an audio problem is a quiet notice and START GAME still appears", async () => {
    const t = fakeStartup();
    await mountLoading(t);
    act(() => {
      t.loading.set({ ...t.loading.get(), failed: 1 });
      t.finish();
    });
    expect(screen.getByText("Some sounds could not be loaded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "START GAME" })).toBeTruthy();
  });
});
