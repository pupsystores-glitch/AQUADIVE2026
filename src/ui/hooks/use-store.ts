// useStore — the React binding for the external store primitive
// (docs/07_UI_ARCHITECTURE.md §9), built on useSyncExternalStore (React 19,
// built in). Selector-level subscription gives delta V3's re-render
// granularity: a component re-renders only when its selected value changes
// (useSyncExternalStore compares selected snapshots with Object.is).
//
// Selector contract: selectors must be cheap, pure, and return a stable
// value for an unchanged snapshot — select primitives or references held
// inside the snapshot. A selector that constructs a fresh object per call
// would defeat the equality bailout and re-render on every store write.

import { useSyncExternalStore } from "react";
import type { Store } from "@/ui/store/store";

export function useStore<T, S>(store: Store<T>, selector: (snapshot: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    // Server snapshot: stores live at module scope with their initial
    // values, so the SSR read is the same synchronous selector call.
    () => selector(store.get()),
  );
}
