# src/audio

Audio system (roadmap Phase 7). Blueprint: `docs/08_AUDIO_FX_ARCHITECTURE.md`.

**Status (2026-11-15, P7-0):** architecture approved by the owner. **No audio
code and no audio asset exist yet.** The modules below are planned for steps
A1–A6, and each one needs its own owner authorization.

## Responsibility

Event-driven sound on the native Web Audio API, with no audio dependency
(owner decision, docs/08 §1.1):

- an `AudioManager` with `music` / `ambience` / `sfx` buses into a `master`
  gain and a limiter, a voice cap, crossfades, lazy context creation and
  unlock on the first user gesture;
- a `SoundBank` that fetches, decodes and caches buffers; a missing or failed
  asset stays silent and is logged once;
- an `AudioDirector`, the only place that maps engine events and per-frame
  state to cues, and a `MusicController` for the phase music;
- depth-based ambience: a low-pass whose cutoff falls as `depthRatio` rises.

Volume and mute settings live in a UI-owned store
(`src/ui/store/sound-settings-store.ts`, planned for A3). The session pushes
them into the `AudioManager`, which is a passive sink.

## Boundaries

- **Purely reactive.** The director subscribes to the engine event bus
  (`engine.events`): `bettingOpened`, `betPlaced`, `diveStarted`,
  `cashedOut`, `crashed`, `shipImpact`, `chestsRevealed`, `chestPicked`
  (docs/06 §12). It also reads a narrow per-frame `AudioFrame`
  `{ phase, depthRatio, multiplier, boost, countdownSeconds }`, which the
  session assembles from engine public state. Audio owns no game state.
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

`audio-manager.ts` (A1), `sound-bank.ts` and `manifest.ts` (A2), `director.ts`
and `music.ts` (A4), `test/fake-audio-context.ts` and `*.test.ts`. Licensed
assets and `CREDITS.md` go in `src/assets/audio/` (A6), supplied by the owner;
no asset or licence is cleared yet.
