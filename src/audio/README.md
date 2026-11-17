# src/audio

Audio system (roadmap Phase 7). Blueprint: `docs/08_AUDIO_FX_ARCHITECTURE.md`.

**Status (2026-11-15, A4b):** `audio-manager.ts` exists: the generic core
(A1), its `decode()` interface (A1.1, docs/08 §7.1) and its voice pools and
protected loops (A1.2, docs/08 §7.2), with the fake context and tests. A2 adds
`manifest.ts` (the typed cue list) and `sound-bank.ts` (fetch, decode through
the manager, cache; docs/08 §7.3), with `test/fake-fetch.ts` and tests. A4a
adds `director.ts`, the Audio Director core (docs/08 §7.4), with tests. A4a.1
corrects loop startup: `loop(cue, options)` takes the initial gain, rate and
filter, and the director fades a bed in only while its `LoopHandle.isAudible()`
is true (docs/08 §7.2, §7.4).
A4b (2026-11-15) wires them: `src/ui/audio-host.ts`, the only production UI
module that imports `src/audio`, constructs the manager, bank and director
for each game session (docs/08 §7.5); no module here changed in A4b.

**A6 (2026-11-16, working tree, awaiting the owner's listening approval):**
every cue has an original sound made for AQUADIVE. The 18 files are in
`src/assets/audio/` (AAC-LC `.m4a`, mono, 48 kHz; 897 565 bytes in total;
about 13.9 MB decoded). `manifest.ts` imports their URLs and sets each cue's
gain and each loop's loop points; `AUDIO_MIX` in `src/ui/audio-host.ts` holds
the bus mix. Gains and mix are provisional until the listening pass.
Provenance and rights status: `src/assets/audio/CREDITS.md`. `director.ts`,
`audio-manager.ts` and `sound-bank.ts` are unchanged. Each later step needs
its own owner authorization.

**M-OWN (2026-11-17, working tree, awaiting the owner's listening
acceptance):** the main soundtrack. `music.ts` holds `MUSIC_MAIN`, the
owner-supplied `src/assets/audio/music-main.mp3` (3 527 200 bytes, unchanged).
`AudioManager.stream()` plays it through **one** `HTMLAudioElement` and
**one** `MediaElementAudioSourceNode` into the `music` bus: streamed, never
decoded as a whole, outside the 16-voice pools, with native looping. The
director starts it once, keeps it across rounds and ducks it under crash,
cashout and jackpot. `AUDIO_MIX.music` is 0.5. On iOS and iPadOS the host
gives the manager no media element, so the music stays off there and the
silent switch is still respected (Q15); see docs/08 §7.6. The three-stem
adaptive music plan (M1–M3) is deferred and not built.

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
  essential beds, loop points, and an `asset` URL for every cue (A6). A cue
  with a `null` asset is still allowed: it is unavailable and silent;
- an `AudioDirector` (A4a), the only place that maps engine events and
  per-frame state to cues: deterministic and frame-based, with one-shots
  merged per cue id per frame. The continuous `chain-rattle` loop is off
  by default (A6.1) and plays only with `{ chainRattle: true }`; the
  tension creaks likewise (A-OWN, `{ tensionCreaks: true }`). The host
  loads none of the three. The director also owns the one music stream and its
  ducking (M-OWN). There is no `MusicController`: the three-stem adaptive
  music (M1–M3) is deferred;
- depth-based ambience: a low-pass whose cutoff falls as `depthRatio` rises.

Volume and mute settings live in a UI-owned store
(`src/ui/store/sound-settings-store.ts`, A3). The audio host pushes them into
the `AudioManager`, a passive sink, before the first unlock and on every
change (A4b). The director never touches
bus gains or mute.

## Boundaries

- **Purely reactive.** The director subscribes to the engine event bus
  (`engine.events`): `bettingOpened`, `betPlaced`, `diveStarted`,
  `cashedOut`, `crashed`, `shipImpact`, `chestsRevealed`, `chestPicked`
  (docs/06 §12). It also reads a narrow per-frame `AudioFrame`
  `{ phase, depthRatio, multiplier, boost, dt }`, which the audio host
  assembles in the session's driver sink from the frame's projections (A4b). Countdown audio is deferred (Q9).
  Audio owns no game state.
- **Never reads money.** Cues may depend on multipliers and phases, never on
  balances, stakes or wins.
- **Never acts on the game.** No commands, no store writes, no engine change.
  The reserved `goldfishConsumed` / `boostExpired` events stay unbuilt; a
  goldfish pickup is detected as a rising edge of `boost`.
- **Imports:** only its own modules, the type-only `@/engine` facade and
  `src/shared`. Never `src/ui`, `src/rendering` or React. Only
  `src/ui/audio-host.ts` constructs it, for the session (A4b).
- **SSR-safe:** no `window`, `AudioContext` or `matchMedia` at module scope.
  No sound before a user gesture; silent but playable when Web Audio is
  unavailable or assets are missing.

## Planned contents (docs/08 §6)

`audio-manager.ts` (A1), `sound-bank.ts` and `manifest.ts` (A2, done),
`director.ts` (A4a, done; `music.ts` is dropped, Q8),
`test/fake-audio-context.ts`, `test/fake-fetch.ts` and `*.test.ts`. The
assets, `CREDITS.md` and the production scripts (`production/synth.mjs`,
`production/encode.ps1`) are in `src/assets/audio/` (A6). The rights items
that still need the owner's confirmation are listed in `CREDITS.md` §6.
