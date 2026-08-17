// Store primitive tests (Sprint 4, Commit U1; docs/07_UI_ARCHITECTURE.md
// §9, §21 tier 2): set/subscribe/bailout semantics — the contract every
// Sprint 4 store builds on.
import { describe, expect, it, vi } from "vitest";
import { createStore } from "./store";

describe("createStore — the minimal external store primitive (§9)", () => {
  it("get() returns the initial snapshot before any write", () => {
    const store = createStore({ n: 1 });
    expect(store.get()).toEqual({ n: 1 });
  });

  it("set() replaces the snapshot synchronously; listeners observe the new snapshot", () => {
    const store = createStore(0);
    let seen = -1;
    store.subscribe(() => {
      seen = store.get();
    });
    store.set(42);
    expect(store.get()).toBe(42);
    expect(seen).toBe(42);
  });

  it("notifies every subscriber once per accepted write", () => {
    const store = createStore("a");
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);
    store.set("b");
    store.set("c");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("bails without notifying when the snapshot reference is unchanged (Object.is)", () => {
    const snapshot = { n: 1 };
    const store = createStore(snapshot);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(snapshot); // same reference — the D5 quiet-frame bailout
    expect(listener).not.toHaveBeenCalled();
    store.set({ n: 1 }); // new snapshot, equal value — writers construct new snapshots to signal change
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("bailout uses Object.is: NaN → NaN is a quiet write", () => {
    const store = createStore(NaN);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(NaN);
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribe stops notifications and leaves other subscribers intact", () => {
    const store = createStore(0);
    const removed = vi.fn();
    const kept = vi.fn();
    const unsubscribe = store.subscribe(removed);
    store.subscribe(kept);
    unsubscribe();
    store.set(1);
    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });
});
