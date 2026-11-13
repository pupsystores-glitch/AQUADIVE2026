// createStore — the minimal external store primitive (docs/07_UI_ARCHITECTURE.md §9).
//
// Deliberate decision, mirroring the engine's no-ECS and the renderer's
// no-scene-graph stances: no state-management dependency. Stores are plain
// TypeScript — no React — so the settlement layer stays framework-free for
// Phase 8. Semantics fixed by §9:
//
// - Synchronous, snapshot-based: get() always returns the current snapshot
//   (the synchronous read the component's state+ref mirrors existed to
//   provide — see §10).
// - Writers construct new snapshots; subscribers are notified only when the
//   snapshot reference changes. Equal-value writes bail without notifying,
//   preserving delta D5's quiet-frame behavior once the round store lands.
// - React binds via useStore (src/ui/hooks/use-store.ts); nothing here may
//   ever import React.

export interface Store<T> {
  /** Current snapshot — synchronous read. */
  get(): T;
  /** Replace the snapshot. Bails silently when `next` is the current snapshot (Object.is). */
  set(next: T): void;
  /** Subscribe to snapshot changes. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/**
 * The read half of a store — what a store with a single private writer
 * exposes (e.g. the wallet store, whose only writer is engine settlement
 * events, §9). Everything React needs to bind (useStore).
 */
export type ReadableStore<T> = Pick<Store<T>, "get" | "subscribe">;

export function createStore<T>(initial: T): Store<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => snapshot,
    set: (next) => {
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
