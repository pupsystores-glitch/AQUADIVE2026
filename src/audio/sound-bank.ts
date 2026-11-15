// SoundBank — fetch, decode and cache cue buffers (Sprint 5 / Phase 7, step
// A2; docs/08_AUDIO_FX_ARCHITECTURE.md §3.2, §6, §7.1, §7.2).
//
// Generic over the cue ids of a manifest; it knows no game. For each cue:
//
//   manifest entry ──load()──▶ fetch(asset.url) ──▶ decoder.decode(bytes)
//                  ──▶ a frozen `ResolvedCue`, cached, served by `resolve`.
//
// - **One context.** Decoding goes through the injected decoder, which is the
//   AudioManager's own `decode()` (docs/08 §7.1). The bank never creates,
//   holds or reaches an `AudioContext`. A load started before the first
//   unlock fetches its bytes, then waits inside `decode()` until the unlock.
// - **`resolve` is the AudioManager's `CueResolver`.** Synchronous, pure, no
//   allocation: it returns the cached `ResolvedCue` of a ready cue, or `null`.
//   A loop requested while its cue is still loading waits in the manager as a
//   pending loop (docs/08 §7.2), and starts once it resolves.
// - **Waking pending loops.** The manager re-resolves its pending loops on
//   its next call (`play`, `loop`, any `LoopHandle` method, unlock, a voice
//   ending); it has no public refresh. `onReady` tells the caller the moment
//   a cue becomes playable, so the caller (the A4 director) can make that
//   call at once, typically a handle update it makes every frame anyway. The
//   manager's request guards make the loop start exactly once, with one live
//   source (docs/08 §7.2), however often it is woken.
// - **Deduplication.** A cue has at most one cache entry. Concurrent loads of
//   it share one fetch, one decode and one promise.
// - **Failure policy** (the image AssetManager's, docs/05 §15): a cue with no
//   asset is "unavailable" and is never fetched; a network error, a non-OK
//   response (a missing file), a decoding failure or an invalid manifest
//   entry leaves the cue "failed". It stays silent, is logged once, and is
//   not retried. `evict()` then `load()` is the explicit retry.
// - **Cleanup and stale results.** `evict()` drops one cue, `dispose()` all of
//   them. Either aborts the in-flight fetch (when `AbortController` exists),
//   settles the waiting load with "cancelled", and makes every later result
//   of that load a no-op: each async step checks that its own cache entry is
//   still the current one, so a stale completion can never refill the cache.
//   A voice already playing a buffer keeps it until the voice ends; the
//   manager owns voices.
// - **Every promise resolves; none rejects.**
//
// SSR: importing or constructing the bank touches no global. `fetch` and
// `AbortController` are read when a load starts, never at module scope.
//
// Wiring (A4, `src/ui/session.ts`; not done here). The manager needs the
// resolver and the bank needs the decoder, so one of them is late-bound:
//
//   const audio = createAudioManager<CueId>({ resolveCue: (cue) => bank.resolve(cue) });
//   const bank = createSoundBank({ manifest: SOUND_MANIFEST, decoder: audio });
//
// Dispose the bank before the manager: a manager disposed first settles the
// bank's waiting decodes with `null`, which the bank reports as failures.
//
// Imports: its own modules only (docs/08 §6 import rule).

import type { AudioBufferLike, AudioManager, CueResolver, ResolvedCue } from "./audio-manager";
import { cueDefinitionProblems, type CueDefinition, type SoundManifest } from "./manifest";

/**
 * Where a cue stands:
 * - "unavailable": not in the manifest, or no asset assigned (every cue until A6);
 * - "unloaded": has an asset, not requested (or evicted);
 * - "loading": fetching, or decoding (a decode waits for the first unlock);
 * - "ready": decoded and cached; `resolve` serves it;
 * - "failed": the fetch, the decode or the manifest entry failed; silent until evicted.
 */
export type CueStatus = "unavailable" | "unloaded" | "loading" | "ready" | "failed";

/** How a `load()` ended. "cancelled": the cue was evicted or the bank disposed first. */
export type CueLoadResult = "ready" | "failed" | "unavailable" | "cancelled";

/** The subset of a fetch `Response` the bank reads. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** The subset of `fetch` the bank calls. */
export type FetchLike = (
  url: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/** The decoding seam: the AudioManager satisfies it (docs/08 §7.1). */
export type AudioDecoder = Pick<AudioManager, "decode">;

export interface SoundBankOptions<CueId extends string> {
  readonly manifest: SoundManifest<CueId>;
  /** The AudioManager (its `decode()`): the single context decodes every cue. */
  readonly decoder: AudioDecoder;
  /** Defaults to the global `fetch`, read when a load starts. */
  readonly fetch?: FetchLike;
}

export interface SoundBank<CueId extends string> {
  /** The AudioManager's cue resolver: the cached cue when ready, otherwise `null`. Synchronous, no allocation. */
  readonly resolve: CueResolver<CueId>;
  /** Fetches, decodes and caches one cue. Deduplicated; never rejects. */
  load(cue: CueId): Promise<CueLoadResult>;
  /** Loads several cues (default: every manifest cue). Results in input order. */
  loadAll(cues?: readonly CueId[]): Promise<readonly CueLoadResult[]>;
  status(cue: CueId): CueStatus;
  /** Called once each time a cue becomes ready. Returns the unsubscribe. Listener errors are caught and logged. */
  onReady(listener: (cue: CueId) => void): () => void;
  /** Drops a cue's cache entry and cancels its in-flight load. A failed cue may then be loaded again. */
  evict(cue: CueId): void;
  /** Cancels every load, clears the cache and the listeners. Every later call is a no-op. */
  dispose(): void;
}

export function createSoundBank<CueId extends string>(
  options: SoundBankOptions<CueId>,
): SoundBank<CueId> {
  return new CachingSoundBank(options);
}

// ----- implementation -----

/** One cue's cache entry, from its `load()` until it is evicted or the bank is disposed. */
interface Entry {
  status: "loading" | "ready" | "failed";
  /** The cue as the manager plays it; set once ready. */
  resolved: ResolvedCue | null;
  /** Aborts the in-flight fetch; `null` once the fetch is done or without `AbortController`. */
  abort: AbortController | null;
  /** The shared result of every `load()` of this entry. */
  readonly result: Promise<CueLoadResult>;
  /** Settles `result`; only the first call counts. */
  readonly settle: (result: CueLoadResult) => void;
}

const settled = (result: CueLoadResult) => Promise.resolve(result);

/** The global `fetch`, read at call time (SSR: never at module scope). */
const globalFetch = (): FetchLike | null => {
  const scope = globalThis as { fetch?: FetchLike };
  if (typeof scope.fetch !== "function") return null;
  // Called as a method of the global object, as the platform expects.
  return (url, init) => scope.fetch!(url, init);
};

const newAbortController = (): AbortController | null =>
  typeof globalThis.AbortController === "function" ? new AbortController() : null;

/** The `ResolvedCue` the manager plays: frozen, built once per ready cue. */
const toResolvedCue = (definition: CueDefinition, buffer: AudioBufferLike): ResolvedCue => {
  if (definition.kind === "oneShot") {
    return Object.freeze({
      buffer,
      bus: definition.category,
      gain: definition.gain,
      priority: definition.priority,
    });
  }
  const { loopStart, loopEnd } = definition;
  return Object.freeze({
    buffer,
    bus: definition.category,
    gain: definition.gain,
    priority: definition.priority,
    essential: definition.essential,
    ...(loopStart !== undefined && loopEnd !== undefined ? { loopStart, loopEnd } : {}),
  });
};

class CachingSoundBank<CueId extends string> implements SoundBank<CueId> {
  private readonly manifest: SoundManifest<CueId>;
  private readonly decoder: AudioDecoder;
  private readonly fetchOverride: FetchLike | undefined;

  private readonly entries = new Map<CueId, Entry>();
  private readonly listeners = new Set<(cue: CueId) => void>();
  private readonly failuresLogged = new Set<CueId>();
  private disposed = false;

  constructor(options: SoundBankOptions<CueId>) {
    this.manifest = options.manifest;
    this.decoder = options.decoder;
    this.fetchOverride = options.fetch;
  }

  readonly resolve: CueResolver<CueId> = (cue) => this.entries.get(cue)?.resolved ?? null;

  load(cue: CueId): Promise<CueLoadResult> {
    if (this.disposed) return settled("cancelled");
    const existing = this.entries.get(cue);
    if (existing) {
      if (existing.status === "loading") return existing.result;
      return settled(existing.status);
    }
    const definition = this.definitionOf(cue);
    if (!definition || definition.asset === null) return settled("unavailable");

    const entry = this.createEntry();
    this.entries.set(cue, entry);
    const problems = cueDefinitionProblems(cue, definition);
    if (problems.length > 0) {
      this.fail(cue, entry, "has an invalid manifest entry", problems.join("; "));
    } else {
      void this.fetchAndDecode(cue, definition, entry);
    }
    return entry.result;
  }

  loadAll(cues: readonly CueId[] = Object.keys(this.manifest) as CueId[]) {
    return Promise.all(cues.map((cue) => this.load(cue)));
  }

  status(cue: CueId): CueStatus {
    const entry = this.entries.get(cue);
    if (entry) return entry.status;
    const definition = this.definitionOf(cue);
    return !definition || definition.asset === null ? "unavailable" : "unloaded";
  }

  onReady(listener: (cue: CueId) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  evict(cue: CueId): void {
    const entry = this.entries.get(cue);
    if (!entry) return;
    this.entries.delete(cue);
    this.cancel(entry);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const entries = [...this.entries.values()];
    this.entries.clear();
    this.listeners.clear();
    for (const entry of entries) this.cancel(entry);
  }

  // ----- loading -----

  /** The manifest's own entry for `cue`; never an inherited property. */
  private definitionOf(cue: string): CueDefinition | null {
    return Object.hasOwn(this.manifest, cue) ? this.manifest[cue as CueId] : null;
  }

  private createEntry(): Entry {
    let resolveResult: (result: CueLoadResult) => void = () => {};
    const result = new Promise<CueLoadResult>((resolve) => {
      resolveResult = resolve;
    });
    let done = false;
    return {
      status: "loading",
      resolved: null,
      abort: null,
      result,
      settle: (value) => {
        if (done) return;
        done = true;
        resolveResult(value);
      },
    };
  }

  /** True while `entry` is still `cue`'s live entry: the guard every async step checks. */
  private isCurrent(cue: CueId, entry: Entry): boolean {
    return !this.disposed && this.entries.get(cue) === entry;
  }

  private async fetchAndDecode(cue: CueId, definition: CueDefinition, entry: Entry) {
    const url = definition.asset!.url;
    let data: ArrayBuffer;
    try {
      const fetchAsset = this.fetchOverride ?? globalFetch();
      if (!fetchAsset) throw new Error("fetch is unavailable");
      entry.abort = newAbortController();
      const response = await fetchAsset(
        url,
        entry.abort ? { signal: entry.abort.signal } : undefined,
      );
      if (!this.isCurrent(cue, entry)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.arrayBuffer();
    } catch (error) {
      if (this.isCurrent(cue, entry)) this.fail(cue, entry, "could not be fetched", error);
      return;
    }
    if (!this.isCurrent(cue, entry)) return;
    entry.abort = null;

    let buffer: AudioBufferLike | null;
    try {
      buffer = await this.decoder.decode(data);
    } catch (error) {
      // The AudioManager's decode never rejects; a foreign decoder might.
      if (this.isCurrent(cue, entry)) this.fail(cue, entry, "could not be decoded", error);
      return;
    }
    if (!this.isCurrent(cue, entry)) return;
    if (!buffer) {
      this.fail(cue, entry, "could not be decoded", "");
      return;
    }
    entry.resolved = toResolvedCue(definition, buffer);
    entry.status = "ready";
    this.notifyReady(cue);
    entry.settle("ready");
  }

  private fail(cue: CueId, entry: Entry, reason: string, detail: unknown): void {
    entry.status = "failed";
    entry.abort = null;
    if (!this.failuresLogged.has(cue)) {
      this.failuresLogged.add(cue);
      console.warn(`[audio] sound "${cue}" ${reason}; it stays silent.`, detail);
    }
    entry.settle("failed");
  }

  /** Aborts a dropped entry's fetch and settles its waiting loads; its later results are ignored. */
  private cancel(entry: Entry): void {
    const abort = entry.abort;
    entry.abort = null;
    try {
      abort?.abort();
    } catch {
      // aborting is best effort; the generation guard ignores the result anyway
    }
    entry.settle("cancelled");
  }

  private notifyReady(cue: CueId): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(cue);
      } catch (error) {
        console.error(`[audio] an onReady listener failed for "${cue}":`, error);
      }
    }
  }
}
