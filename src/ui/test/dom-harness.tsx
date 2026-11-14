// DOM test harness (Sprint 4, Commit U3; docs/07_UI_ARCHITECTURE.md §17 U3,
// §21 tier 3). Test-only.
//
// bootScreen() gives each test a fresh module graph, a scripted session and
// a deterministic host:
// - Session injection: vi.resetModules() + vi.doMock("@/ui/session") →
//   session-mock.ts + dynamic import of the screen, so the component's
//   module-scope `gameSession` is the scripted session armed here. Test
//   files must import the screen only through bootScreen() — a static
//   import would bind the production singleton. Within one boot the module graph is stable, so
//   unmount → render again is a true component remount over the same
//   session, as in production.
// - Clock: requestAnimationFrame is a manual queue; one frame() fires it
//   with an integer-ms timestamp on a 60 Hz grid and advances the fake
//   setTimeout clock by the same delta. The wall clock moves only when a
//   test steps frames, so the flash timers keep their real relation to
//   the round timeline.
// - Assertions use visible text, roles and disabled state, plus a semantic
//   outline (outline()) that ignores class names and wrappers. U6 moved the
//   markup into GameScreen (byte-identically); these pins stay green
//   unchanged, proving the decomposition rendered the same UI (§21 tier 3).

import { StrictMode, createElement, type ComponentType } from "react";
import { act, cleanup, render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onTestFinished, vi } from "vitest";
import type { EngineStateName } from "@/engine";
import type { GameSession } from "@/ui/session";
import {
  armScriptedSession,
  takeBuiltSession,
  type RendererRecord,
  type ScriptedSessionOptions,
} from "./scripted-session";

/** Hard cap on frames per wait, so a wait that can never succeed fails fast instead of hanging. */
const MAX_WAIT_FRAMES = 20000;

/** Live count of the subscriptions a component added to the session (display listeners). */
export interface SubscriptionCounter {
  added: number;
  removed: number;
  readonly active: number;
}

export interface ScreenHarness {
  session: GameSession;
  renderers: RendererRecord[];
  /** Display subscriptions added through engine.events.on / wallet.onFlash after boot (the component's). */
  subscriptions: SubscriptionCounter;
  /** User-event instance (no artificial delays; works with the fake timers). */
  user: ReturnType<typeof userEvent.setup>;
  /** Mount the screen (optionally under React.StrictMode). Call again after unmount() to remount. */
  mount(options?: { strict?: boolean }): RenderResult;
  /** Number of pending rAF callbacks — 1 while a driver loop runs, 0 when paused. */
  pendingFrames(): number;
  /** Step n display frames (60 Hz). A single frame may consume zero or two ticks (integer-ms timestamps). */
  frames(n: number): void;
  /** Step frames until the engine has consumed at least one more tick — i.e. a submitted command has applied (D4). */
  tick(): void;
  /** Step frames until the engine is in `state`. */
  untilState(state: EngineStateName): void;
  /** Step frames until `predicate` holds. */
  until(predicate: () => boolean, what: string): void;
}

export async function bootScreen(
  options: ScriptedSessionOptions = {},
): Promise<ScreenHarness & { Screen: ComponentType }> {
  // Teardown per test, registered by the harness itself (no setup file, so
  // the harness is self-contained): test globals are off, so Testing
  // Library's auto-cleanup is not registered. Unmount first, then restore
  // the host.
  onTestFinished(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock("@/ui/session");
  });

  // ----- deterministic host -----
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  // Testing Library's async wrapper (used by every user-event call) ends by
  // awaiting a setTimeout(0), which it only flushes when it detects *Jest*
  // fake timers via a global `jest`. Without this shim, user-event hangs
  // under vitest's fake setTimeout. It advances 0 ms: the frame clock is
  // unaffected.
  vi.stubGlobal("jest", { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });

  // ----- fresh module graph with the scripted session -----
  // vi.doMock (not a hoisted vi.mock): a hoisted factory's result is cached
  // across vi.resetModules, a doMock registered per boot is re-evaluated.
  vi.resetModules();
  vi.doMock("@/ui/session", () => import("./session-mock"));
  armScriptedSession(options);
  const Screen = (await import("@/ui/components/GameScreen")).default;
  const { session, renderers } = takeBuiltSession();

  const subscriptions = trackSubscriptions(session);

  let frameIndex = 0;
  let nowMs = 0;
  const stepOne = () => {
    frameIndex++;
    const ts = Math.round((frameIndex * 1000) / 60);
    const dt = ts - nowMs;
    nowMs = ts;
    const callbacks = [...pending.values()];
    pending.clear();
    for (const cb of callbacks) cb(ts);
    vi.advanceTimersByTime(dt);
  };
  const until = (predicate: () => boolean, what: string) => {
    act(() => {
      for (let i = 0; i < MAX_WAIT_FRAMES && !predicate(); i++) stepOne();
    });
    if (!predicate())
      throw new Error(`Timed out after ${MAX_WAIT_FRAMES} frames waiting for ${what}`);
  };

  return {
    Screen,
    session,
    renderers,
    subscriptions,
    user: userEvent.setup({ delay: null }),
    mount: ({ strict = false } = {}) =>
      render(
        strict ? createElement(StrictMode, null, createElement(Screen)) : createElement(Screen),
      ),
    pendingFrames: () => pending.size,
    frames: (n) => {
      act(() => {
        for (let i = 0; i < n; i++) stepOne();
      });
    },
    tick: () => {
      const before = session.engine.tickCount;
      until(() => session.engine.tickCount > before, "the next engine tick");
    },
    untilState: (state) => until(() => session.engine.state === state, `engine state "${state}"`),
    until,
  };
}

// Wrap the two subscription entry points the component uses. The wallet's
// own settlement listeners were attached at construction, before this runs,
// so only the component's display subscriptions are counted.
function trackSubscriptions(session: GameSession): SubscriptionCounter {
  const counter = {
    added: 0,
    removed: 0,
    get active() {
      return counter.added - counter.removed;
    },
  };
  const counted = (off: () => void) => {
    counter.added++;
    let done = false;
    return () => {
      if (!done) {
        done = true;
        counter.removed++;
      }
      off();
    };
  };
  const events = session.engine.events;
  const on = events.on.bind(events);
  events.on = ((name, listener) => counted(on(name, listener))) as typeof events.on;
  const wallet = session.wallet as { onFlash: GameSession["wallet"]["onFlash"] };
  const onFlash = wallet.onFlash;
  wallet.onFlash = (listener) => counted(onFlash(listener));
  return counter;
}

// ----- semantic outline -----

/**
 * The screen's visible content in document order, without class names,
 * styles or wrapper elements: one line per text node; buttons, inputs and
 * the canvas as one tagged line each (with disabled state); SVG icons
 * skipped. This is the "rendered text and structure" pin of docs/07 §20
 * risk 2: a verbatim markup move keeps it identical.
 */
export function outline(root: HTMLElement): string[] {
  const lines: string[] = [];
  const squash = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = squash(node.textContent);
      if (text) lines.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "svg") return;
    if (tag === "canvas") {
      lines.push("[canvas]");
      return;
    }
    if (tag === "button") {
      const b = el as HTMLButtonElement;
      lines.push(`[button${b.disabled ? " disabled" : ""}] ${squash(b.textContent)}`);
      return;
    }
    if (tag === "input") {
      const i = el as HTMLInputElement;
      lines.push(`[input ${i.type}${i.disabled ? " disabled" : ""}] ${i.value}`);
      return;
    }
    el.childNodes.forEach(walk);
  };
  walk(root);
  return lines;
}
