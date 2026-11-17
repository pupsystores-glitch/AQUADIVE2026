// Fake media element for the music stream tests (M-OWN; docs/08 §7.6).
//
// It implements the structural `MediaElementLike` surface the AudioManager
// uses for its stream, and records what the manager does with it: every
// `play()`, `pause()` and `load()` call, the `src`, and the listeners.
//
// `play()` settles by `playMode`:
// - "allow" (default): the element plays at once and the promise resolves;
// - "refuse": the promise rejects with a `NotAllowedError` (no user
//   activation), and the element stays paused;
// - "throw": `play()` throws synchronously;
// - "legacy": the element plays and `play()` returns nothing (old browsers).
//
// The hooks simulate the browser: `fail()` dispatches `error`, `systemPause()`
// pauses the element without the manager asking (a media key, an iOS
// interruption), and `tick()` dispatches `timeupdate`.
//
// This is a simulation. It proves the manager's logic, not a real browser's
// playback, autoplay policy or looping.

import type { MediaElementLike } from "../audio-manager";

export type FakePlayMode = "allow" | "refuse" | "throw" | "legacy";

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

export class FakeMediaElement implements MediaElementLike {
  src = "";
  loop = false;
  preload = "";
  paused = true;

  playMode: FakePlayMode = "allow";
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  /** Every value `src` had when `load()` was called. */
  readonly loads: string[] = [];

  private readonly listeners = new Map<string, Set<() => void>>();

  play(): Promise<void> | void {
    this.playCalls++;
    if (this.playMode === "throw") throw named("InvalidStateError", "play() failed");
    if (this.playMode === "refuse") {
      return Promise.reject(named("NotAllowedError", "play() needs a user gesture"));
    }
    this.paused = false;
    if (this.playMode === "legacy") return undefined;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls++;
    if (this.paused) return;
    this.paused = true;
    this.dispatch("pause");
  }

  load(): void {
    this.loadCalls++;
    this.loads.push(this.src);
    if (this.src === "") this.paused = true;
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  get listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  // ----- test hooks: the browser acting by itself -----

  /** A loading or decoding error. */
  fail(): void {
    this.paused = true;
    this.dispatch("error");
  }

  /** The system pauses the element (a media key, an interruption). */
  systemPause(): void {
    this.paused = true;
    this.dispatch("pause");
  }

  /** The periodic `timeupdate` of a playing element. */
  tick(): void {
    this.dispatch("timeupdate");
  }
}

/** A factory that records every element it creates. */
export function fakeMediaElements() {
  const elements: FakeMediaElement[] = [];
  /** Applied to each new element before the manager sees it. */
  const next: { playMode: FakePlayMode } = { playMode: "allow" };
  const create = (): FakeMediaElement => {
    const element = new FakeMediaElement();
    element.playMode = next.playMode;
    elements.push(element);
    return element;
  };
  return { elements, next, create };
}
