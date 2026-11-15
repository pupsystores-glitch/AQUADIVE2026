# src/audio

Audio system (roadmap Phase 7). Blueprint: `docs/08_AUDIO_FX_ARCHITECTURE.md`.

**Status (2026-11-15, A4a):** `audio-manager.ts` exists: the generic core
(A1), its `decode()` interface (A1.1, docs/08 §7.1) and its voice pools and
protected loops (A1.2, docs/08 §7.2), with the fake context and tests. A2 adds
`manifest.ts` (the typed cue list) and `sound-bank.ts` (fetch, decode through
the manager, cache; docs/08 §7.3), with `test/fake-fetch.ts` and tests. A4a
adds `director.ts`, the Audio Director core (docs/08 §7.4), with tests.
Nothing outside `src/audio` imports any of them yet; the session wiring is
A4b. **No audio asset exists: every manifest entry has `asset: null`, so every
cue is unavailable and silent.** Each later step needs its own owner
authorization.

## Responsibility

Event-driven sound on the native Web Audio API, with no audio dependency
(owner decision, docs/08 §1.1):

- an `AudioManager` with `music` / `ambience` / `sfx` buses into a `master`
  gain and a limiter, a strict 16-source voice cap in fixed loop, one-shot
  and tail pools, pending and essential loops, crossfades, lazy context
  creation and unlock on the first user gesture;
- a `SoundBank` that fetches, decodes (through `AudioManager.decode()`, with
  the manager's single context) and caches buffers, deduplicates loads, and
  cancels them on `evict()` / `dispose()` with stale results ignored; a
  missing or failed asset stays silent and is logged once; its `onReady`
  tells the caller when a pending loop's cue can now start;
- a typed manifest: one-shot and loop cue ids, bus, gain, priority tier,
  essential beds, optional loop points, and an `asset` that stays `null` until
  licensed files are supplied (A6);
- an `AudioDirector` (A4a), the only place that maps engine events and
  per-frame state to cues: deterministic and frame-based, with one-shots
  merged per cue id per frame. There is no `MusicController`: music is
  deferred (Q8), and the `music` bus waits for it;
- depth-based ambience: a low-pass whose cutoff falls as `depthRatio` rises.

Volume and mute settings live in a UI-owned store
(`src/ui/store/sound-settings-store.ts`, A3). The session will push them into
the `AudioManager`, which is a passive sink (A4b). The director never touches
bus gains or mute.

## Boundaries

- **Purely reactive.** The director subscribes to the engine event bus
  (`engine.events`): `bettingOpened`, `betPlaced`, `diveStarted`,
  `cashedOut`, `crashed`, `shipImpact`, `chestsRevealed`, `chestPicked`
  (docs/06 §12). It also reads a narrow per-frame `AudioFrame`
  `{ phase, depthRatio, multiplier, boost, dt }`, which the session will
  assemble from engine public state (A4b). Countdown audio is deferred (Q9).
  Audio owns no game state.
- **Never reads money.** Cues may depend on multipliers and phases, never on
  balances, stakes or wins.
- **Never acts on the game.** No commands, no store writes, no engine change.
  The reserved `goldfishConsumed` / `boostExpired` events stay unbuilt; a
  goldfish pickup is detected as a rising edge of `boost`.
- **Imports:** only its own modules, the type-only `@/engine` facade and
  `src/shared`. Never `src/ui`, `src/rendering` or React. Only
  `src/ui/session.ts` constructs it.
- **SSR-safe:** no `window`, `AudioContext` or `matchMedia` at module scope.
  No sound before a user gesture; silent but playable when Web Audio is
  unavailable or assets are missing.

## Planned contents (docs/08 §6)

`audio-manager.ts` (A1), `sound-bank.ts` and `manifest.ts` (A2, done),
`director.ts` (A4a, done; `music.ts` is dropped, Q8),
`test/fake-audio-context.ts`, `test/fake-fetch.ts` and `*.test.ts`. Licensed
assets and `CREDITS.md` go in `src/assets/audio/` (A6), supplied by the owner;
no asset or licence is cleared yet.
