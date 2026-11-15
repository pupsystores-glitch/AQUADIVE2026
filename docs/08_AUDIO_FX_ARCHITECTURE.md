# AQUADIVE — AUDIO & VISUAL EFFECTS ARCHITECTURE (Phase 7)

**Sprint 5 / Phase 7 / TASK 008.** This is the Phase 7 blueprint, written in step **P7-0**.

**Status (2026-11-15, A4a.1):** the owner approved the architecture as the basis for Phase 7. P7-0 (`0e7ff80`), A1 (`3761062`), A1.1 (`ad9e959`), A1.2 (`0de6d73`, accepted), A2 (`03bb7dc`), A3 (`16a6a40`, accepted with documented limitations), A3.1 (`e70fa22`) and A4a (`289b849`) are done. The owner split A4 into A4a and A4b (§12). **A4a.1, the loop startup correction (§7.2, §7.4, §14 risks 15 and 15b), is authorized and delivered in its own commit.** A4b and every later step need their own explicit authorization. *(Until A4a.1 this read: "… and A3.1 (`e70fa22`) are done. The owner split A4 into A4a and A4b (§12). **A4a, the Audio Director core (§7.4), is authorized and delivered in its own commit.**")* *(Until A4a this read: "P7-0 (`0e7ff80`), A1 (`3761062`), A1.1 (`ad9e959`), A1.2 (`0de6d73`, accepted) and A2 (`03bb7dc`) are done. **A3, the sound settings store (§3.5), is authorized and delivered in its own commit.** The owner accepted A3 (`16a6a40`) with documented limitations; **A3.1, its subscriber failure hardening (§3.5), is authorized and delivered in its own commit.** A4 and every later step need their own explicit authorization.")* *(Until A3 this read: "P7-0 (`0e7ff80`), A1 (`3761062`), A1.1 (`ad9e959`) and A1.2 (`0de6d73`, accepted) are done. **A2, the sound bank and manifest (§7.3), is authorized and delivered in its own commit.** A3 and every later step need their own explicit authorization.")* *(Until A2 this read: "P7-0 (`0e7ff80`), A1 (`3761062`) and A1.1 (`ad9e959`) are done. **A1.2, voice pools and protected loops (§7.2), is authorized and delivered in its own commit.** A2 and every later step need their own explicit authorization.")* *(Until A1.2 this read: "P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted. **A1.1, the decode interface (§7.1), is authorized and delivered in its own commit.**")* *(Until A1.1 this read: "the owner … authorized **P7-0 only** (this document and the tracking updates). **No implementation step is authorized.** A1 and every later step need their own explicit authorization.")*

**Source of truth:** the *Sprint 5 / Phase 7: Audio & Visual Effects Architecture Proposal* (2026-11-15), audited against the repository at `0ebe7c9`. This document records it without redesign. Where the owner's authorization narrows it, the narrowing is marked **[OWNER]**.

**Legend:**
- **[FACT]** — confirmed in the repository at `0ebe7c9`.
- **[REC]** — the agent's recommendation. It is not approved unless §1 says so.
- **[OWNER]** — an owner decision recorded on 2026-11-15.

This blueprint sits beside the binding contracts `docs/05_RENDERING_ARCHITECTURE.md`, `docs/06_ENGINE_ARCHITECTURE.md` and `docs/07_UI_ARCHITECTURE.md`. It does not amend them. On any conflict, the commit stops and the documents are corrected first, with the owner's approval.

---

## 1. Approval record and owner decisions

### 1.1 What the owner approved (2026-11-15) [OWNER]

- **Technology:** the native Web Audio API with a lightweight, hand-rolled `AudioManager`. No audio dependency.
- **Rendering:** the existing Canvas 2D renderer. **No PixiJS**, and no change to the technology stack.
- **Model:** event-driven audio and visual effects.
- **Atmosphere:** the approved underwater atmosphere is preserved. The Sprint 4 visuals accepted on 2026-11-15 (ship, waterline, chain, anchor, descent, landing, slack chain, sea floor, Bonus Chest) are not redesigned.
- **No change** to the Game Engine, RNG, money settlement, Dual Bet or gameplay outcomes.
- **Sequence:** P7-0 → A1–A4 → V1–V7 → A6 → A5 → P7-C (§12).
- **Git:** one atomic commit per approved implementation step.
- **Blueprint file name:** `docs/08_AUDIO_FX_ARCHITECTURE.md`.
- **A1.1, the `AudioManager` decode interface** (owner authorization, 2026-11-15): a separate atomic step between A1 and A2. It adds `decode()` to the `AudioManager` (§7.1) so the A2 sound bank decodes with the manager's single context. Scope: `src/audio/audio-manager.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-manager.test.ts`, and the architecture and tracking documents. Not in scope: the sound bank, the manifest, audio files, licences, and every engine, RNG, settlement, rendering, gameplay or UI file. It does not authorize A2.
- **A1.2, voice pools and protected loops** (owner authorization, 2026-11-15, after the A2 architecture report): a separate atomic step before A2 (§7.2). Approved:
  - the 6 loop / 8 one-shot / 2 steal-tail pools, under a strict cap of 16 live sources;
  - pending loops instead of permanently inert handles;
  - essential-loop protection, deterministic admission, pending-loop cancellation and disposal cleanup;
  - rewriting the A1 tests that encode the old voice policy, keeping their safety guarantees. The authorization named five tests. The design makes 8 out of date, and the owner approved all 8 on 2026-11-15;
  - counting the unlock prime in the tail pool (owner decision, 2026-11-15; see §7.2);
  - correcting the damaged UTF-8 comment lines in `audio-manager.ts`, comment-only.

  **Deferred:** `maxInstances` (per-cue limits) needs its own approved step. Scope: `src/audio/audio-manager.ts`, `src/audio/audio-manager.test.ts`, `src/audio/test/fake-audio-context.ts`, and the architecture and tracking documents. Not in scope: the sound bank, the manifest, A2, and every engine, shared, rendering, UI, gameplay, RNG, settlement, dependency or asset file.
- **A2, the sound bank and manifest** (owner authorization, 2026-11-15, after accepting A1.2 at `0de6d73`): §7.3. Approved scope: a typed manifest and a SoundBank that reuse `AudioManager.decode()` and its single, lazy context, with typed cue ids and metadata, asynchronous loading, caching, deduplication, controlled failures, pending-loop resolution without duplicate sources, explicit cleanup and generation guards, and tests. Files: new modules and tests in `src/audio`, and the architecture and tracking documents. **Not authorized:** any change to `audio-manager.ts` (an insufficient API stops the step for a separate proposal); any audio file, download, generated asset or invented production URL; deciding Q3–Q12, Q14 or Q15; the director, music controller, settings, UI, renderer effects, gameplay wiring and A3 onward; every engine, shared, rendering, UI, RNG, settlement or dependency file.
- **A3, the sound settings store** (owner authorization, 2026-11-15, after the A3 pre-implementation architecture report): §3.5. Owner decisions:
  - **D1 — approved (answers Q3):** sound is on by default (`muted: false`), all four volumes default to `1.0`, and saved preferences override the defaults. Playback stays blocked until the required user gesture.
  - **D2 — approved:** UI-X1 is ratified for the exact A3 files (§13.2), including the `src/ui/README.md` update and one store-table row in `docs/07_UI_ARCHITECTURE.md` §9.
  - **D3 — approved:** `ambience` joins the sound settings (§3.2).
  - **D4 — approved:** the store holds finite, linear 0–1 values. The designed mix gains are applied separately, in A4. No loudness curve in A3.
  - **D5 — approved:** a malformed version-1 record keeps its individually valid fields; invalid fields fall back to the defaults. Unsupported schema versions are rejected.
  - **D6 — approved:** cross-tab synchronization and debounced persistence are out of scope.
  - **D7 — deferred to A5:** whether raising a volume unmutes.
  - **D8 — approved in principle:** the session applies the settings to the `AudioManager` in A4. The `src/ui/session.ts` audio import exception must be ratified explicitly in A4; A3 does not implement it.
  - **Safety requirement for A4:** `restore()` is not assumed to run before the first user gesture. A4 must guarantee, and test, that the persisted mute and volume settings are applied before the audio unlock or any playback (§14 risk 14).

- **A3.1, sound settings subscriber failure hardening** (owner authorization, 2026-11-15, after accepting A3 at `16a6a40` with documented limitations): §3.5. Corrects A3 audit finding M1 (the read-only audit of `16a6a40`; not the deferred money-integrity M1): a throwing subscriber aborted `setMuted` / `setVolume` / `toggleMuted` before the change was saved, and made `restore()` throw. Fixed inside the sound settings store; `src/ui/store/store.ts` (`createStore`) and every other store are unchanged. D1–D8 are unchanged. Scope: M `src/ui/store/sound-settings-store.ts`, `src/ui/store/sound-settings-store.test.ts`, and the architecture and progress documents. **Not authorized:** `store.ts`, other stores, `session.ts`, the `AudioManager`, SoundBank, manifest, engine, shared, rendering, components, dependencies, assets, A4.

  Scope (A3): C `src/ui/store/sound-settings-store.ts`, C `src/ui/store/sound-settings-store.test.ts`; M `src/ui/README.md`, `docs/07_UI_ARCHITECTURE.md` (§9 table row only), and the architecture and tracking documents. **Not authorized:** `src/ui/session.ts`, the `AudioManager`, the SoundBank, the manifest, components, gameplay, renderer, engine, shared modules, dependencies, audio assets; A4, A5, the director, the music controller and any playback wiring.

- **A4a, the Audio Director core** (owner authorization, 2026-11-15, after the revised A4 plan): §7.4. The owner split A4 into two stages. Each needs its own explicit authorization, one logical commit and every validation gate:
  - **A4a:** the director core, the deterministic event-to-cue mapping, the loop lifecycle, one-shot merging and unit tests;
  - **A4b:** session integration, the settings bridge, the browser gesture and visibility lifecycle, and integration tests. **Not authorized.**

  Owner decisions, approved for A4a:
  - **Q7:** the cashout cue plays only for the local player's own slots. Crash and jackpot are audible to spectators. Identical cashout cues within the same rendered frame merge; cues on different frames never merge.
  - **Q8:** music playback and music cue assets are deferred. No `MusicController` and no `music.ts` are created. The `music` bus stays in the `AudioManager` for later use.
  - **Q9:** countdown tick audio is deferred. The manifest is not changed for countdown cues, and `AudioFrame` has no `countdownSeconds`.
  - **Q15:** the iOS silent switch is respected. No audio-session override is introduced; `navigator.audioSession` is never touched.

  Conditions of the authorization:
  - one-shot deduplication per cue id per frame, verified not to discard semantically distinct events, with every intentional merge documented (§7.4);
  - deterministic, frame-based scheduling, with no timers, wall clock or randomness;
  - a director independent of browser APIs, React, `localStorage` and UI stores;
  - every mixing, ducking, filtering and tension value is a **provisional engineering default, not a sound-design decision** (§7.4), tuned in A6;
  - MusicController, countdown audio, real assets and the browser unlock integration are deferred.

  Scope (A4a): C `src/audio/director.ts`, C `src/audio/director.test.ts`; M `src/audio/README.md`, this document, `docs/04`, `docs/14`, `docs/15`, `docs/16`. **Not authorized:** A4b; every `src/ui` file (including `session.ts` and the proposed `audio-host.ts`), `docs/07` and the proposed import exception; `audio-manager.ts`, `sound-bank.ts`, `manifest.ts`, `src/audio/test/*`; engine, shared, rendering, wallet, settlement and components; dependencies and assets.
- **A4a.1, the loop startup correction** (owner authorization, 2026-11-15, after the read-only A4a.1 design report; approach B): §7.2, §7.4, §14 risks 15 and 15b. Owner decisions:
  1. Approved: `loop(cue, options?)` takes optional `LoopOptions`, the initial `gain`, `rate` and `filterHz`.
  2. Approved: a required, side-effect-free `LoopHandle.isAudible()`, with the meaning in §7.2.
  3. Approved: the director advances a bed's fade-in only while `isAudible()` is true.
  4. Approved: the fade-in pauses during mute, host suspension, an interruption and a pending resume, and continues safely when playback resumes.
  5. Approved: a manual-resume mode in the fake context for deterministic tests; its default behavior is unchanged.
  6. Accepted: the non-essential chain-rattle preemption restart limitation stays documented and is not part of the correction (§7.4).
  7. Deferred: the Safari resume retry is a separate issue (§14 risk 17). `unlock()` is unchanged and no unverified browser workaround is introduced.
  8. Confirmed: risk 15b is a fade-in completing before its voice actually begins playback.

  Scope (A4a.1): M `src/audio/audio-manager.ts`, `src/audio/director.ts`, `src/audio/audio-manager.test.ts`, `src/audio/director.test.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/README.md`, `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16`. **Not authorized:** A4b; every `src/ui` file; `sound-bank.ts`, `manifest.ts`, `test/fake-fetch.ts`; engine, shared, rendering, wallet, RNG and gameplay; dependencies and assets; the Safari resume retry; music integration.

### 1.2 What the owner did not approve [OWNER]

- **The renderer and UI exceptions** (§13) are accepted **in principle only**. Each one's exact file-level scope must be documented and **explicitly ratified before those files are changed**. Until then, `src/rendering` stays frozen (docs/07 §19 gate 4), and the Phase 6 UI stays as approved.
- **The 16 owner-decision questions** (§1.3) are **not approved by default**, except where the owner's authorization answered them. A recommended default in this document is **not** a decision.
- **No audio assets exist**, and **no licence is cleared**. Nothing in this document claims otherwise.

### 1.3 Decision register

Status values: **Approved** (the owner decided), **Open** (the owner has not decided; the recommended default is shown and is not in force).

| # | Question | Status | Recommended default [REC] | Blocks |
|---|---|---|---|---|
| Q1 | Audio technology | **Approved** — native Web Audio, no dependency (not Howler.js) | — | — |
| Q2 | Renderer and UI exceptions; zero engine change | **Partly approved.** Zero engine change: **approved** (no `goldfishConsumed` / `boostExpired` event is added). Renderer and UI exceptions: **approved in principle**; file scopes **not ratified** (§13), except UI-X1 for A3 (ratified 2026-11-15, D2) | Ratify each step's scope from §13 before that step starts | A3, A4, A5, V1–V7 |
| Q3 | Default sound state | **Approved (A3, D1, 2026-11-15):** sound on by default (`muted: false`), every volume `1.0`, saved preferences override the defaults; playback still waits for the user gesture. *(Until A3 this read "Open".)* | On after the first user gesture | — |
| Q4 | Sound control | **Open** | A single mute button in TopBar | A5 |
| Q5 | Asset supply and allowed licences | **Open** | The owner supplies or commissions the files. Allowed: CC0, royalty-free commercial; CC-BY only with a credit entry. Not allowed: any NC licence. Every EULA checked for a gambling clause | A6 |
| Q6 | Audio format | **Open.** Owner's planning preference (2026-11-15): AAC-LC in `.m4a`, subject to browser compatibility validation. Not a decision. *(A2: the manifest records no URL, file name or extension, so its shape does not depend on Q6; §7.3.)* | `.m4a` (AAC-LC) only | A6 |
| Q7 | Spectator and Dual Bet audio | **Approved for A4a (owner, 2026-11-15):** the cashout cue plays only for the local player's own slots; crash and jackpot are audible to spectators; identical cashout cues within the same rendered frame merge, never across frames (§7.4). *(Until A4a this read "Open".)* | Crash and jackpot play for everyone; cashout only for the player's own slots; two cashouts in the same tick play one cue | — |
| Q8 | Music | **Approved for A4a (owner, 2026-11-15):** music playback and music cue assets are deferred; no `MusicController` or `music.ts` is created; the `music` bus stays available for later use. *(Until A4a this read "Open".)* | Ambience plus a minimal music bed | A later music step (with A6) |
| Q9 | Countdown ticks for the last 3 s | **Approved for A4a (owner, 2026-11-15):** countdown tick audio is deferred; the manifest is not changed for countdown cues. *(Until A4a this read "Open".)* | — (no recommendation; the owner's preference) | A later step, if the owner asks for it |
| Q10 | Effect list F1–F8, one by one; chain tension audio-only | **Open** | Approve F1–F8 as specified in §4.3; chain tension audio-only | V2–V6 (each effect's own step) |
| Q11 | Camera shake on crash (≤ 6 px, ≈ 300 ms); keep the DOM `crash-shake` | **Open** | — (owner's preference; both are specified as optional in V1/V5) | V1, V5 |
| Q12 | Reduced motion: follow the OS and offer an in-app toggle | **Open** | Follow the OS setting; an in-app "Reduce effects" toggle together with Q4 | V1, V7, A5 |
| Q13 | Blueprint name | **Approved** — `docs/08_AUDIO_FX_ARCHITECTURE.md` | — | — |
| Q14 | Device QA: which iOS and Android devices | **Open** | — (only the owner can answer) | A-track device gate, V-track performance gate, P7-C |
| Q15 | iOS silent switch | **Approved for A4a (owner, 2026-11-15):** respect it; no audio-session override is introduced. *(Until A4a this read "Open".)* | Respect it (do not set `navigator.audioSession.type = "playback"`) | — (A4b must not add an override either) |
| Q16 | Order: A5 after A6; V1–V7 while assets are sourced | **Approved** — the sequence in §1.1 | — | — |

**Decisions the owner flagged for confirmation:** audio assets (Q5), licensing (Q5), device QA (Q14), and user-facing behavior (Q3, Q4, Q7, Q9, Q11, Q12, Q15). These stay **Open** until the owner answers them. *(Q3 was answered in A3, D1. Q7, Q8, Q9 and Q15 were answered for A4a, 2026-11-15.)*

---

## 2. Current-state audit [FACT]

Confirmed at `0ebe7c9`. Test counts come from docs/15 (572/572 across 42 files at the Sprint 4 close-out).

### 2.1 Rendering

- **Engine and structure.** Canvas 2D only. No PixiJS or WebGL dependency in `package.json`. One `SceneRenderer` (`src/rendering/scene-renderer.ts`) with five layers in z-order: background, environment, world, actor, effects.
- **Contract.** The renderer is a pure consumer of `RenderState` and `RenderTime { animTime, frameDt }`. It reads no wall clock except the dev-only frame meter (rolling average and p95, logged to the console). There is no `Math.random()` outside the Effects layer (docs/05 §12).
- **`RenderState`.** Fields: `phase`, `worldY`, `depthRatio`, `boost`, `creatures`, `crashed`, `shipImpact: { elapsed } | null`. It carries no multiplier, no money and **no crash timestamp**.
- **Existing effects:** 24 deterministic bubbles at alpha 0.18; 4 light rays that fade with depth; the anchor boost halo (`shadowBlur`); the crash crack overlay on the anchor; the ship-impact jackpot FX (pink flash, lightning, sparkles, ring; `Math.random`; 1.4 s); the anchor landing (drop, topple, bounce, slack-chain coil), a pure function of `shipImpact.elapsed` (`layers/actor.ts`).
- **Camera.** Vertical only, with a presentation-offset extension. `shake` and `zoom` are reserved in docs/05 §6 and **not implemented**.
- **Assets.** The image AssetManager holds two images (`anchor.png`, `sea-floor.png`).
- **Freeze.** The renderer is **frozen again** since the E-X4 ratification (docs/07 §19 gate 4). Any change needs its own approved exception.

### 2.2 Engine and events

- **Engine.** Fixed 60 Hz ticks. The event bus is typed, edge-triggered and dispatched after each tick. Listener errors are firewalled (docs/06 §12, §18).
- **Events.** `bettingOpened`, `betPlaced { slot, amount }`, `commandRejected`, `diveStarted`, `cashedOut { slot, multiplier }`, `crashed { multiplier }`, `shipImpact { jackpotMultiplier }`, `chestsRevealed`, `chestPicked`, `roundEnded`, `stateChanged { from, to }`, `engineError`.
- **Reserved, never implemented:** `goldfishConsumed`, `boostExpired` (docs/06 §12). Phase 7 does not implement them (§1.1).
- **Driver.** `EngineDriver` owns rAF. When the tab is hidden, rAF stops and the world pauses with no fast-forward. When the canvas is detached, the engine does not advance.
- **Consumers.** The session wires the wallet, notification and round stores at module scope. That construction is SSR-safe: no DOM, no timers.

### 2.3 Audio

- **No audio code and no audio asset exist.** `src/audio/` held only a README before P7-0.
- That README was out of date. It named events `round:crashed` and `cashout:confirmed`, which do not exist, and it said "no game state" while its own depth-based ambience needs per-frame state. P7-0 corrects it (§16).

### 2.4 UI motion

- `src/styles.css` has `goldPulse` (the multiplier and the chosen chest) and `crashShake` (the multiplier readout).
- **Neither is guarded by `prefers-reduced-motion`.** There is no reduced-motion handling anywhere in the code.
- The app uses no `localStorage`.

### 2.5 Constraints

- **Performance budget (docs/05 §14):** at most 6 ms of render per frame on a mid-range Android phone; no new steady-state `shadowBlur`; zero per-frame allocation as the target; DPR capped at 2.
- **Phase 6 is closed and owner-approved.** M1 is deferred and **not closed**, so Phase 7 must not touch `src/ui/store/wallet-store.ts`.
- **Lovable sync (AGENTS.md):** every pushed commit must leave the app working. Published history is never rewritten.

---

## 3. Audio architecture

### 3.1 Technology [OWNER]

The native Web Audio API with a thin, hand-rolled `AudioManager`. No dependency.

| Option | Verdict |
|---|---|
| Web Audio, hand-rolled | **Approved.** The needed surface is small: buses, buffers, loops, crossfades, unlock. It adds no bytes, gives full control of lifecycle and SSR safety, and can be tested with a small fake context. It follows the project's "no state library / no PixiJS" precedent. |
| Howler.js | Not adopted. Its main value is the HTML5 Audio fallback, which modern browsers do not need. It would add a dependency and a second lifecycle model. |
| Tone.js | Not adopted. Built for synthesis and sequencing; oversized. |

### 3.2 Modules [REC]

- **`AudioManager`** (generic; no game knowledge):
  - Owns the `AudioContext`, created lazily on the first unlock. Never at module scope.
  - Bus graph: `music`, `ambience` and `sfx` gain nodes → `master` gain → limiter (`DynamicsCompressor`) → output.
  - Plays one-shot and looping voices. Voice cap: 16. At the cap it drops the lowest-priority voice.
  - Crossfades with `setTargetAtTime`.
- **`SoundBank`:** fetch → `decodeAudioData` → a cache of `AudioBuffer`s keyed by cue. A missing or failed asset stays silent and is logged once, the same failure policy as the image AssetManager (docs/05 §15).
- **`AudioDirector`** (game-specific): the **only** place that maps engine events and per-frame state to cues. It subscribes to `engine.events` at session scope, like the wallet and notification stores.
- **`MusicController`:** a small state machine for phases (surface, dive, outcome stinger, reset) with crossfades. *(Deferred by the owner for A4a, Q8: not built. The `music` bus stays available.)*
- **Sound settings:** a UI-owned store (`master`, `music`, `ambience`, `sfx`, `muted`), persisted in `localStorage` inside try/catch. The session pushes it into the `AudioManager`, which is a passive sink. Built in A3 (§3.5). *(A3, D3: `ambience` added. Until A3 the list read `master`, `music`, `sfx`, `muted`.)*

### 3.3 Lifecycle [REC]

1. **Session construction:** nothing touches the DOM. SSR stays safe.
2. **`attachCanvas` (client only):**
   - The session installs one-time `pointerdown` / `keydown` / `touchend` capture listeners.
   - On the first gesture it creates or resumes the context. On iOS it also plays a 1-sample silent buffer inside the gesture handler. Then it removes the listeners.
   - The first gesture is usually PLACE BET, so its cue plays one tick later.
3. **`visibilitychange` hidden, or `pagehide`:** `ctx.suspend()`. This matches the engine pausing when rAF stops.
4. **Visible again:** resume the context if it is unlocked and not muted.
5. **iOS `interrupted` state** (phone call, Siri): on `statechange`, re-arm the gesture unlock.
6. **Canvas detach:** the director fades out its loops, because the world stops advancing.
7. **Dispose** (tests and HMR): unsubscribe, stop voices, `ctx.close()`.

### 3.4 Rules

- **Audio never reads money** [REC, follows from §1.1]. Cue choice may use multipliers and phases. Never balances, stakes or wins.
- **No engine change** [OWNER]. The goldfish pickup is detected as a rising edge of `boost` in public state. The reserved `goldfishConsumed` event is not needed and is not added.
- **Per-frame input is a narrow `AudioFrame`** [OWNER, A4a]: `{ phase, depthRatio, multiplier, boost, dt }`, assembled in the session's driver sink from data the engine already projects (A4b). *(Until A4a this read `{ phase, depthRatio, multiplier, boost, countdownSeconds }`. `countdownSeconds` is dropped because Q9 is deferred; `dt`, the engine's clamped frame delta, is added so fades advance by frame time, never by a clock.)*
- **Mixing defaults** [REC] (tuned by ear in A6):
  - Ambience low, SFX dominant, music bed under −18 dBFS.
  - Music and ambience duck by about 6 dB under outcome stingers. *(A4a: the ambience only, because there is no music yet (Q8); values in §7.4.)*
  - Underwater ambience runs through a `BiquadFilter` low-pass whose cutoff falls as `depthRatio` rises ("darker and more muffled with depth").
- **Memory** [REC]:
  - Decoded PCM is large: about 350 KB/s for stereo at 44.1 kHz.
  - Loops are short (20–40 s), seamless and preferably mono.
  - Gapless looping uses `AudioBufferSourceNode.loop` with `loopStart` / `loopEnd` stored in the manifest, which neutralizes encoder padding.
  - Targets: about 20 MB decoded in total; about 1.5 MB compressed on first load; music lazy-loaded after unlock.
- **Format** [REC; Q6 open]: AAC-LC `.m4a` as the single format. Opus could follow later behind `canPlayType`. **Device verification is part of the A-track gate; it is not claimed to work on every device.**
- **Accessibility** [REC]:
  - Mute and per-bus volumes, persisted.
  - No sound before a user gesture (browsers require this anyway).
  - A "Reduce effects" option also removes stingers and keeps dynamics calm (Q12 open).
  - Sound never carries information the UI does not also show.

### 3.5 Sound settings store (A3) [OWNER]

`src/ui/store/sound-settings-store.ts`. The owner's decisions D1–D8 are in §1.1.

- **Shape:** `{ muted, master, music, ambience, sfx }`. The four channel names match the `AudioManager` buses (D3). Every snapshot is frozen.
- **Defaults (D1):** `muted: false`, every volume `1.0`. Saved preferences override them. The store plays nothing; playback still waits for the user gesture.
- **Values (D4):** linear and finite in 0..1. User input is clamped to 0..1; a non-finite value or an unknown channel is ignored. No loudness curve. The designed mix gains are A4's.
- **Writers:** `setMuted`, `toggleMuted`, `setVolume(channel, value)`, and `restore()`. Equal-value writes keep the snapshot and notify nobody (docs/07 §9). Raising a volume does not change `muted` (D7 is deferred to A5).
- **Subscriber isolation (A3.1):** `subscribe` wraps each listener in its own try/catch, as the engine event bus and the SoundBank's `onReady` do. A listener that throws is logged with `console.error`, and the other listeners are still notified, synchronously and in order. So a failing subscriber cannot stop a change from being saved, cannot leave later subscribers stale, and cannot make `restore()` throw. Subscribing the same function twice keeps one subscription, and any of its unsubscribes removes it, as in `createStore`. The shared `createStore` primitive is unchanged, and so is every other store's notification behavior. *(Until A3.1, a throwing subscriber propagated out of the writer before `write()` ran, and out of `restore()`.)*
- **Persistence:** one `localStorage` record under `aquadive.soundSettings`: `{ version: 1, muted, master, music, ambience, sfx }`. Each change writes the whole record at once: no debounce, no cross-tab sync (D6). Resolving `localStorage`, `getItem` and `setItem` are each inside try/catch. A failed write keeps the in-memory change and never throws.
- **Reading (D5):** a missing record, unparseable JSON, a non-object, or a `version` other than `1` gives the defaults. A version-1 record keeps each valid field; each invalid or missing field takes its default. A stored volume outside 0..1 is invalid; it is not clamped. A read never writes back, so a record from another version is left untouched until the user changes a setting.
- **Lifecycle:** construction reads no storage and touches no global (SSR-safe). `restore()` reads the record once, on the client, and returns what it found (`missing`, `valid`, `salvaged`, `corrupt`, `unsupported-version`, `unavailable`, or `skipped`). If the user changes a setting before `restore()`, that change wins, is saved, and `restore()` is skipped.
- **Import rule:** the store imports only `./store`. It does not import `src/audio`.
- **Not wired in A3.** In A4 the session pushes these settings into the `AudioManager` (D8) and must apply them before the audio unlock or any playback, whether or not `restore()` has already run (§14 risk 14).

---

## 4. Visual-effects architecture

### 4.1 Technology [OWNER]

Stay on Canvas 2D and extend the existing Environment and Effects layers. PixiJS is not justified: the docs/05 §16 triggers (heavy particles, shaders) are not met by subtle effects, and a migration would put the owner-approved E-X4 visuals at risk.

### 4.2 Infrastructure [REC]

- **FX queue** (designed in docs/05 §12, never built): a `{ kind, startedAt }` list stamped in `animTime`.
  - `SceneRenderer.trigger(kind)` is called by the session, which forwards engine events.
  - This is the docs/05 §17 event channel, and it stays one-way.
  - It is the only renderer-owned mutable state, and it is reconstructible: losing it on a remount is acceptable.
  - It is the clean way to time a crash FX without an engine change.
- **Camera shake:** the reserved `shake` (docs/05 §6), implemented as an additive offset inside `worldToScreenY`. Deterministic in time: a damped sine, not random. (Q11 open.)
- **`quality` / `reducedMotion` flags** on `SceneRenderer` (reserved in docs/05 §14 item 9).
  - The UI reads `matchMedia('(prefers-reduced-motion: reduce)')` and the user setting, then passes the result in.
  - The renderer still never reads `window`.
- **New particles are deterministic:** hash functions of index, `worldY`, `animTime` and viewport, like the existing bubbles. The `Math.random` exemption stays limited to the existing impact FX.

### 4.3 Proposed effects [REC; each needs owner approval, Q10]

Each effect is subtle and adds to the scene without replacing anything.

| # | Effect | Layer | Mechanism | Reduced motion |
|---|---|---|---|---|
| F1 | **Marine snow:** at most 48 dim specks, alpha ≈ 0.06–0.15, scrolling slower than the world (parallax factor < 1) | Environment | Stateless; makes the descent readable as motion | Static, drift halved |
| F2 | **Depth vignette:** edge darkening that grows with `depthRatio` | Background or Environment | One cached radial gradient | Kept (not motion) |
| F3 | **Anchor wake:** at most 16 tiny bubbles in world space along the anchor column | Effects | Anchored in world Y, so they stream upward at descent speed by construction. No multiplier in the renderer | Hidden |
| F4 | **Water-entry splash** at the waterline as the dive starts | Effects | Pure function of `worldY` crossing the waterline | Hidden |
| F5 | **Silt plume** at touchdown: at most 12 soft puffs fading over ≈ 1.5 s | Effects | `shipImpact.elapsed` plus a small exported touchdown helper from `layers/actor.ts` | Single static fade |
| F6 | **Crash:** at most 24 metal fragments at the chain break, a short dark vignette pulse, a camera shake of at most 6 px for ≈ 300 ms | Effects + Camera | FX queue, triggered by `crashed` | No shake, no pulse |
| F7 | **Round-reset dip:** a fade to dark of ≈ 400 ms when betting reopens, replacing today's hard cut from the sea floor to the surface | Effects | FX queue, triggered by `bettingOpened` | Plain crossfade |
| F8 | **Chest burst:** at most 16 gold glints when the chest opens | **DOM / CSS** in `ChestPicker` (it sits above the canvas) | `transform` / `opacity` animations only | Off |

**Explicitly excluded:** sunlight, caustics, extra bubble density, bloom, jackpot zoom (it would change the approved responsive framing), and **any change to the chain, anchor, ship or sea-floor drawing**. Chain tension is expressed through **audio only**, to protect the E-X4 chain.

**Timing and sync:** events are dispatched inside `engine.advance()` in the same rAF callback that renders. FX are stamped on the next `frame()`, at most one frame late. Audio starts at `ctx.currentTime`. Output latency is the device's (Bluetooth adds 150–300 ms and cannot be fixed).

---

## 5. Event → audio / effect mapping [REC]

| Trigger (engine source) | Audio | Visual |
|---|---|---|
| `bettingOpened` (BETTING / RESET) | Crossfade to the surface bed: waves, hull creak *(A4a: driven by the phase `idle`; no music, Q8)* | F7 reset dip |
| `countdownSeconds` crosses 3, 2, 1 (state edge) | *Deferred (Q9, A4a): none* | — |
| `betPlaced { slot }` | Muted "clink"; slot 1 pitched differently | — |
| `diveStarted` (DIVE) | Chain unspool, then splash. Crossfade to underwater ambience *(A4a: no dive music, Q8)* | F4 splash |
| Per frame while diving | Chain-rattle loop: rate and gain follow the multiplier. Ambience low-pass follows `depthRatio`. Tension creaks at fixed multiplier thresholds | F1, F2, F3 |
| `boost` rising edge | Soft goldfish chime | (existing halo) |
| `cashedOut { slot }` (own slots only, Q7) | Coin chime; both slots in one frame play one chime (Q7) | (existing WinFlash) |
| `crashed` (CRASH) | Metallic snap and muffled boom, also for spectators (Q7). The rattle is cut and the ambience ducks *(A4a: no music, Q8)* | F6 |
| `shipImpact` (RESULTS) | Sand thud and jackpot stinger, also for spectators (Q7). The rattle stops and the ambience ducks. *(A4a: the shimmer plays on `chestsRevealed` only, so it does not play twice.)* | (existing FX + landing) and F5 |
| `chestsRevealed` | Reveal shimmer | — |
| `chestPicked` | Lid creak and coin burst, tiered by `chestMultiplier` | F8 |
| `commandRejected`, `engineError` | None | None |

**A4a:** the implemented mapping, the loops by phase, the merging rules and the provisional values are in §7.4.

---

## 6. Module and folder structure [REC]

```
src/audio/
  README.md               (corrected contract — P7-0)
  audio-manager.ts        context, buses, unlock, visibility, voices
  sound-bank.ts           fetch / decode / cache, failure policy
  manifest.ts             cue → url, bus, gain, loop points, priority
  (music.ts)              deferred (Q8, A4a): not created
  director.ts             events + AudioFrame → cues (imports @/engine facade types only)
  test/fake-audio-context.ts
  *.test.ts
src/assets/audio/         licensed files + CREDITS.md   (A6, owner-supplied)
src/rendering/
  fx-queue.ts             (new) FX list
  draw/particles.ts       (new) marine snow, wake: pure, deterministic
  draw/landing-fx.ts      (new) silt plume
  draw/crash-fx.ts        (new) fragments, vignette pulse
  camera.ts, scene-renderer.ts, layers/environment.ts, layers/background.ts,
  layers/effects.ts, layers/actor.ts (touchdown helper export only), theme.ts
src/ui/
  session.ts              audio director + unlock/visibility wiring, FX forwarding, motion flag
  store/sound-settings-store.ts (new)
  components/SoundControl.tsx (new), TopBar.tsx, ChestPicker.tsx (F8), strings.ts
src/styles.css            reduced-motion guards for crashShake / goldPulse
```

**Import rule (to ratify with A1):** `src/audio` may import only its own modules, the type-only `@/engine` facade and `src/shared`. It never imports `src/ui`, `src/rendering` or React. Only `src/ui/session.ts` constructs it.

---

## 7. Public interfaces and lifecycle contracts [REC]

```ts
// src/audio/audio-manager.ts
interface AudioManager {
  unlock(): Promise<void>; // must be called inside a user gesture
  setBusGain(bus: "master" | "music" | "ambience" | "sfx", gain: number): void; // clamped 0..1
  setMuted(muted: boolean): void;
  play(cue: CueKey, opts?: { rate?: number; gain?: number }): void; // no-op until unlocked / loaded
  loop(cue: CueKey, options?: LoopOptions): LoopHandle; // options { gain, rate, filterHz } (A4a.1); handle { setGain, setRate, setFilter, stop(fadeS), isAudible() }; pending until it fits (A1.2, §7.2)
  decode(data: ArrayBuffer): Promise<AudioBufferLike | null>; // A1.1, §7.1; never rejects
  suspend(): void;
  resume(): void;
  dispose(): void;
}

// src/audio/sound-bank.ts (A2, §7.3)
interface SoundBank<CueId> {
  readonly resolve: CueResolver<CueId>; // passed to createAudioManager; sync, cached, no allocation
  load(cue: CueId): Promise<CueLoadResult>; // "ready" | "failed" | "unavailable" | "cancelled"; never rejects
  loadAll(cues?: readonly CueId[]): Promise<readonly CueLoadResult[]>;
  status(cue: CueId): CueStatus; // "unavailable" | "unloaded" | "loading" | "ready" | "failed"
  onReady(listener: (cue: CueId) => void): () => void;
  evict(cue: CueId): void;
  dispose(): void;
}

// src/audio/director.ts (A4a, §7.4)
function createAudioDirector(
  events: AudioEventSource, // EventBus<EngineEventMap> satisfies it
  audio: AudioManager<CueId>,
): {
  update(frame: AudioFrame): void; // once per rendered frame, from the session's driver sink (A4b)
  pause(): void; // on canvas detach
  wake(): void; // re-sends every loop value, so a pending loop starts (bank onReady; §14 risk 13)
  dispose(): void;
};

// src/rendering/scene-renderer.ts (additions — V1, needs the renderer exception)
trigger(fx: FxKind): void; // "crash" | "reset"; fire-and-forget
setMotion(opts: { reduced: boolean }): void;
```

**Invariants:**

- Audio and FX never submit commands and never mutate stores.
- Listener exceptions are already firewalled by the bus.
- `RenderState`, `EnginePublicState` and the engine API stay **unchanged**.

### 7.1 Decode interface (A1.1) [OWNER]

`AudioManager.decode(data: ArrayBuffer): Promise<AudioBufferLike | null>` turns compressed bytes into a playable buffer with the manager's **single** `AudioContext`. The A2 sound bank fetches the bytes, calls `decode()`, and caches the result. It never creates or reaches a context of its own.

- **One context.** `decode()` never creates the context, never exposes it, and adds no second one.
- **Before the first unlock** the request waits. It starts inside `unlock()`, right after the iOS prime and `resume()`, so the gesture-critical work runs first. If no gesture ever comes, the request stays pending until `dispose()`.
- **Never rejects.** It resolves the buffer, or `null`:
  - on a decoding error, a synchronous throw from `decodeAudioData`, or a result that is not a buffer with a finite, non-negative duration;
  - when Web Audio is unavailable: the factory returns `null` or throws, or the context has no `decodeAudioData`. Waiting requests settle at that moment; later calls resolve `null` at once;
  - on `dispose()`: every waiting and in-flight request settles with `null` at once; later calls resolve `null`.
- **Exactly once.** The manager passes callbacks **and** follows a returned promise, so the callback-only form (older WebKit), the promise-only form and the both-forms behavior of current browsers all work. The first report wins; a later report, including one after `dispose()`, is ignored.
- **No playback side effect.** Decoding creates no voice and changes no gain or run state. It works while muted, host-suspended or interrupted.
- **Failure policy:** the manager does not log decode failures, because it does not know which asset failed. The sound bank logs each failed asset once (§3.2).
- **The caller's bytes:** browsers may detach the `ArrayBuffer`, so the caller passes a buffer it does not reuse.
- **Abstraction:** `AudioContextLike` gains `decodeAudioData(data, success?, error?)`, which returns a promise-like or nothing. The test fake records each call as a request that the test settles by hand.

### 7.2 Voice pools and protected loops (A1.2) [OWNER]

This replaces A1's single 16-voice policy. It resolves risk 12 (§14).

**Strict cap.** At most `MAX_VOICES` = 16 playback sources are live at any moment. A source is live from `start()` until it is known to have ended. Every kind counts:

- playing voices;
- fading voices (a stopped loop during its fade);
- stolen and preempted voices;
- the 1-sample unlock prime.

**Three fixed pools.** Each slot holds one live source. The pools sum to 16, so the cap holds by construction.

| Pool | Constant | Slots | Holds |
|---|---|---|---|
| Loop | `LOOP_VOICES` | 6 | Loops, including stopped loops while they fade |
| One-shot | `ONE_SHOT_VOICES` | 8 | One-shots |
| Tail | `TAIL_VOICES` | 2 | Stolen and preempted voices while they fade out, and unlock primes |

A one-shot never takes a loop slot, and a loop never takes a one-shot slot.

**When a slot frees.** A slot frees only on evidence that its source has ended. Calling `stop()` is never proof. There are two kinds of evidence:

1. the source's `onended`;
2. the context clock: `currentTime ≥ endsBy + VOICE_RECLAIM_GRACE_S` (0.1 s). `endsBy` is the scheduled stop time, or for a one-shot its start plus `duration / rate`. Once the clock is past it, the context has rendered past the end, so the source no longer plays. The grace covers render-quantum granularity and a coarsened `currentTime`.

- A suspended context's clock stands still, so nothing is reclaimed while it is muted, hidden or interrupted.
- There are no timers. The clock check runs on every manager call: `play`, `loop`, every handle method, `unlock` and a system resume. So when an `onended` is lost, the slot frees at the first call after its end plus the grace. (A4's per-frame handle updates make that one frame.)
- A late `onended` after a clock reclaim is ignored. A slot is never freed twice.

**One-shot admission (deterministic).**

- A free one-shot slot: the one-shot plays.
- A full pool: the lowest-priority one-shot (the oldest on a tie) is stolen, if the newcomer's priority is not lower and a tail slot is free. The stolen voice moves to the tail and fades over `VOICE_STEAL_FADE_S`.
- Otherwise the newcomer is dropped.

**Pending loops.** `loop()` always returns a working handle. It is inert only after `dispose()`, or when Web Audio is unavailable. The loop starts at once when it fits. Otherwise it is **pending**:

- before the first unlock, or while the context is interrupted;
- while its cue cannot be resolved, for example while the A2 sound bank is still decoding;
- while the loop pool is full.

A pending handle keeps its gain, rate and filter and applies them when the loop starts. `stop()` cancels it, so it never starts. Waiting loops start in a fixed order: essential first, then higher priority, then the earlier request. A handle has at most one live source at a time.

**Initial values (A4a.1).** `loop(cue, options?)` takes optional `LoopOptions { gain?, rate?, filterHz? }`. Each is checked exactly like its setter:
- `gain`: clamped to 0..1, multiplied with the cue's gain; non-finite keeps the default 1;
- `rate`: clamped to `MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE`; non-finite or not positive keeps the default 1;
- `filterHz`: clamped to `MIN_FILTER_HZ`..Nyquist when applied; non-finite keeps the default, Nyquist (transparent).

The values are stored on the request, so they are on the voice's nodes as plain values, with no automation, before `start()`, whether the loop starts at once or after waiting for the unlock, its cue or a slot. A setter called while the loop waits replaces the value. Without options, `loop(cue)` behaves exactly as before.

**`isAudible()` (A4a.1).** True while the loop's request and its voice are playing, the manager is unlocked, not muted and not host-suspended, and the context's state is `"running"`. False while the loop is pending (any cause), after a preemption until its restart, after `stop()`, once disposed, while interrupted, while a resume is in progress or after one was refused, and on the inert handle.
- It is an **operational predicate for playback and fade progression, not a measurement of physical sound output or of the effective bus volume**: bus gains, the loop's own gain and the limiter are not considered, and `context.state` may lag the hardware by a frame. The run flags count at once, before `context.state` catches up with a `suspend()`.
- It is a pure status query: it never refreshes, so it never starts a pending loop, reclaims a voice, creates a node or schedules automation.

**Essential loops.** `ResolvedCue.essential`: the A2 manifest marks ambience and music beds.

- An essential loop is never preempted. One-shots never affect any loop.
- When the loop pool is full, an essential newcomer preempts the lowest-priority non-essential playing loop (the oldest on a tie), if a tail slot is free. Otherwise it waits.
- The preempted voice fades out in the tail. Its handle becomes pending again and restarts only after its old voice has ended, so the handle never has two live sources.
- A non-essential loop never preempts.

**Crossfades.** A stopped loop keeps its loop slot during its fade. So at most 6 loops are live at once, fading ones included, and further crossfade partners wait.

**Unlock prime** (owner decision, 2026-11-15). The prime holds a tail slot. If both tail slots are live when a gesture arrives (two stolen voices still fading, or two earlier primes on a context that has not run yet), that gesture skips the prime; `resume()` still runs. Each unlock first reclaims ended sources by the clock, so a tail slot freed during an interruption is used. **Limitation:** on the supported iOS 16+, `resume()` inside the gesture is what unlocks, but no real device has confirmed it yet (Q14).

**Dispose.** It cancels every pending loop, then stops and releases every source in every pool.

**Caller obligations (A4).** Stop every handle you no longer want: a pending loop still starts when it fits, even much later. Set `essential` only on beds that must never drop out.

**Not in A1.2:** `maxInstances` and other per-cue limits (deferred by the owner), and the priority and `essential` values themselves (A2 manifest).

### 7.3 Sound bank and manifest (A2) [OWNER]

Two modules. `manifest.ts` is game-specific data. `sound-bank.ts` is generic over the cue ids of any manifest. Neither changes `audio-manager.ts`; both use its public API only.

**Manifest (`src/audio/manifest.ts`).**

- **Cue ids.** `ONE_SHOT_CUES` (15) and `LOOP_CUES` (3) are `as const` lists. `CueId` is their union; `OneShotCueId` and `LoopCueId` keep the two kinds apart. A mapped type makes every one-shot id a `OneShotCueDefinition` and every loop id a `LoopCueDefinition`, so a one-shot cannot carry loop fields (compile-time, tested with `@ts-expect-error`).
- **Entry fields.** `kind` (`"oneShot"` | `"loop"`), `category` (the voice bus: `sfx`, `ambience` or `music`), `gain` (0..1), `priority` (a `CUE_PRIORITY` tier: detail 1, action 2, outcome 3) and `asset` (`{ url }` or `null`). Loops also have `essential` and optional `loopStart` / `loopEnd` (both or neither, 0 ≤ start < end).
- **The cue list** is the §8 required set: bet clinks ×2, chain unspool, water splash, tension creaks ×2, goldfish chime, cashout coins, chain snap, crash boom, floor thud, jackpot stinger, treasure shimmer, chest lid creak and chest coin burst (one-shots); the chain rattle and the surface and underwater ambience beds (loops). **Only the two beds are essential.**
- **Left out, because they depend on open decisions:** the countdown tick (Q9) and every music bed (Q8). No cue uses the `music` bus. They are added once those questions are answered.
- **No asset.** Every `asset` is `null`: no URL, file name or extension is recorded (Q5, Q6 open). A cue with no asset is *unavailable*: never fetched, never playable, silent. A6 fills `asset` in with owner-supplied, licensed files.
- **Values are engineering defaults**, untuned until A6: every cue gain is 1 (the mix lives in the bus gains), and the tiers only order cues inside their own pool. No cue defines loop points yet; they depend on the real files.
- **Validation.** `validateSoundManifest()` / `cueDefinitionProblems()` are pure checks. The real manifest is tested to be valid. The bank refuses to load an invalid entry.

**SoundBank (`src/audio/sound-bank.ts`).**

- **Pipeline.** `load(cue)` → `fetch(asset.url)` → `decoder.decode(bytes)` → a frozen `ResolvedCue`, cached. The decoder is the AudioManager's own `decode()` (§7.1), so the single context decodes everything; the bank never creates, holds or reaches a context. A load started before the first unlock fetches its bytes, then waits inside `decode()` until the unlock.
- **`resolve` is the manager's `CueResolver`.** Synchronous and pure, with no allocation per call: it returns the cached object of a ready cue, or `null`.
- **Deduplication.** A cue has at most one cache entry. Concurrent loads share one fetch, one decode and one promise. Loads of different cues run in parallel.
- **Results.** Every promise resolves; none rejects. `load()` resolves `"ready"`, `"failed"`, `"unavailable"` (no asset, or not in the manifest; inherited keys such as `toString` included) or `"cancelled"` (evicted or disposed first).
- **Failure policy** (docs/05 §15). A network error, a non-OK response such as a missing file, a failing body, a decode `null` (or a rejecting foreign decoder), a missing `fetch`, or an invalid manifest entry leaves the cue `"failed"`: silent, logged once per cue (`console.warn`), not retried. `evict()` then `load()` is the explicit retry. An unavailable cue is expected until A6 and is not logged.
- **Cleanup.** `evict(cue)` drops one cache entry; `dispose()` drops all of them and the `onReady` listeners. Either aborts the in-flight fetch (when `AbortController` exists) and settles the waiting load with `"cancelled"`. After `dispose()` every call is a no-op and `load()` resolves `"cancelled"`. A voice already playing a buffer keeps it until the voice ends: the manager owns voices.
- **Stale completions.** Each async step (after the fetch, after the body, after the decode) checks that its cache entry is still the cue's current entry and that the bank is not disposed. A stale response's body is never read, stale bytes are never decoded, and a stale buffer never refills the cache or fires `onReady`. A load started after an evict cannot be overwritten by the earlier one.
- **Waking pending loops.** The manager re-resolves its pending loops only on its next call (`play`, `loop`, any `LoopHandle` method, unlock, a voice ending); it has no public refresh, and A2 does not add one. `onReady(listener)` fires once each time a cue becomes ready, after `resolve` serves it, so the caller can make that call at once. The manager's request guards then start the loop exactly once, with one live source, however often it is woken (tested against the real manager). Listener errors are caught and logged.
- **SSR.** No global is read at import or construction. `fetch` and `AbortController` are read when a load starts. Without `AbortController` loads still work, guarded by the entry checks alone.
- **Wiring (A4).** The manager needs the resolver and the bank needs the decoder, so one is late-bound: `createAudioManager({ resolveCue: (cue) => bank.resolve(cue) })`, then `createSoundBank({ manifest, decoder: audio })`. Dispose the bank before the manager: a manager disposed first settles the bank's waiting decodes with `null`, which the bank reports as failures.

**Pool contract.** The bank adds no voice and no playback path; the 6 / 8 / 2 pools and the strict 16-source cap of §7.2 hold unchanged. With test assets on every manifest cue, all three loops plus a 60-play one-shot burst stay at or below 16 live sources, and both essential beds keep playing.

**Caller obligations (A4).** On `onReady`, make a manager call that refreshes the pending loops (a per-frame handle update does). Stop every loop handle you no longer want, as before. Dispose the bank before the manager.

**Limitations.**

- Proven against fakes only: the fake fetch and decoder, and the real AudioManager over the fake context. Real `fetch`, CORS, caching headers and real decoding wait for A6 and the device matrix (Q14).
- A pending loop starts at the first manager call after its cue is ready, not by itself. `onReady` closes that gap only when the caller acts on it. A public `AudioManager.refresh()` would remove the obligation; it would change `audio-manager.ts` and needs its own approval. **Proposed only, not implemented.**
- No per-cue retry policy, no cache budget and no automatic eviction. Memory is bounded by the manifest (one buffer per cue); `evict()` is the release.
- Two cues with the same URL would load it twice. No current cue has a URL, so this is moot until A6.
- `maxInstances` stays deferred (§7.2).

### 7.4 Audio director (A4a) [OWNER]

**Scope.** `src/audio/director.ts` is the only module that maps engine events and per-frame state to cues. It is game logic with no browser code. It imports only types: from the `AudioManager`, the manifest and the `@/engine` facade (a test checks this). It never touches bus gains, mute, the context or the unlock, never reads money, never submits commands and never writes a store. Nothing imports it until A4b.

**Interface.** As in §7. `AudioFrame` is `{ phase, depthRatio, multiplier, boost, dt }` (§3.4). The director declares `AudioPhase` itself and checks at compile time that it equals `EnginePublicState["phase"]`, so `src/audio` never imports `src/rendering`. None of the four methods throws.

**One frame.** The event listeners only buffer. Events that arrive while the director is paused are dropped. Each `update()`:
1. advances the duck by `frame.dt`, and each bed's fade-in by `frame.dt` only while its handle `isAudible()` (A4a.1);
2. collects the one-shots: first the buffered events, in arrival order, then the state edges (goldfish boost, tension thresholds);
3. stops the loops the phase no longer wants (in a fixed order), starts the missing ones with their initial values (A4a.1), and sends each loop's values that changed;
4. plays the collected one-shots.

**Deterministic.** No timers, no wall clock, no randomness. Fades and the duck advance by `frame.dt` only, so the same event and frame script gives the same cue log. A test runs a script twice with `Math.random`, `Date.now`, `performance.now`, `setTimeout` and `setInterval` spied; none is called.

**Event mapping.**

| Source | One-shots |
|---|---|
| `betPlaced` slot 0 / slot 1 | `bet-clink-1` / `bet-clink-2`. The amount is never read |
| `diveStarted` | `chain-unspool`, `water-splash` |
| `cashedOut`, slot 0 or 1 | `cashout-coins` (Q7). Any other slot plays nothing |
| `crashed` (spectators too) | `chain-snap`, `crash-boom`; ducks the ambience |
| `shipImpact` (spectators too) | `floor-thud`, `jackpot-stinger`; ducks the ambience |
| `chestsRevealed` | `treasure-shimmer` |
| `chestPicked` | `chest-lid-creak` (gain 1), `chest-coin-burst` (gain by `chestMultiplier`) |
| `boost` rises by more than `BOOST_EDGE` | `goldfish-chime` |
| The multiplier reaches a new tension threshold while diving | `tension-creak-1` (odd levels) or `tension-creak-2` (even levels) |
| `bettingOpened`, `roundEnded`, `stateChanged`, `commandRejected`, `engineError` | None (not subscribed) |

**Loops by phase.** Loops follow the phase, not events.
- `idle`: `ambience-surface`, with no filter.
- `diving`: `ambience-underwater`, its low-pass following the depth, and `chain-rattle`, its gain and rate following the multiplier.
- `crashed`, `cashed` (the engine's `impact`) and `bonus`: `ambience-underwater`, its filter frozen at the last dive depth (after a pause, at the first frame's depth). The bed is the same handle from the dive until betting opens.
- The director keeps at most one handle per loop cue, and stops every handle before it drops it.
- A handle is called only when its value moves by more than `HANDLE_EPSILON`; a fade onto 0 or 1 still lands exactly. A quiet frame makes no handle call.

**Loop startup (A4a.1; §14 risks 15 and 15b).**
- A new loop gets its values on `loop(cue, options)`: the beds gain 0; the underwater bed also the current depth's filter; the rattle the multiplier's gain and rate. The director records them as sent, so the loop's first frame makes no setter call.
- A bed's level rises by `dt / BED_CROSSFADE_S` only on frames where `isAudible()` is true. The frame that starts a voice does not advance it, so the fade begins on the next frame. A bed waiting for the unlock, its cue or a slot, or held by mute, host suspension, an interruption or a pending or refused resume, keeps its level and continues from it: it never starts loud and never jumps. A finished fade is not queried again.
- `isAudible()` is guarded: a throw is logged once (`loop audible`) and counts as not audible, so the bed stays quiet.
- The rattle is not gated. Ducking is unchanged: a bed's gain is its level × the duck.

**Merging (one-shot deduplication).** Each cue id plays at most once per `update()`. Different cue ids never merge, and the same cue on the next frame plays again. The intentional merges:

| Case | Result | Reachable in the engine today |
|---|---|---|
| Dual Bet: both slots cash out in the same frame | One `cashout-coins` (Q7, owner-approved) | Yes |
| Several tension thresholds reached in one frame | Only the highest threshold's creak | Yes: a fast multiplier, or a catch-up frame |
| Two goldfish pickups between two frames | One chime: the boost edge sees one rise (§14 risk 10) | Yes, rarely |
| The same event delivered twice in one frame | One play of each of its cues | No: each round emits `diveStarted`, `crashed`, `shipImpact`, `chestsRevealed` and `chestPicked` at most once |
| Two `chestPicked` in one frame | One lid creak and one coin burst, at the first pick's gain | No: one pick per round |

Verified **not** merged (tests): both bet clinks in one frame; the crash pair, the jackpot pair and the chest pair; a cashout, a goldfish chime and a tension creak in the same frame; two cashouts on two frames.

**Provisional values.** Exported constants, pinned by tests. They are engineering defaults, **not sound-design decisions**, and are tuned by ear in the A6 listening pass.

| Constant | Value |
|---|---|
| `RATTLE_GAIN` | clamp(0.4 + 0.2·log₂ m, 0.4, 1.0) |
| `RATTLE_RATE` | clamp(0.85 + 0.1·log₂ m, 0.85, 1.5) |
| `RATTLE_STOP_FADE_S` | crash 0.03 s · impact 0.15 s · other 0.15 s |
| `DETACH_FADE_S` | 0.05 s, every loop, on `pause()` and `dispose()` |
| `BED_CROSSFADE_S` | 1.2 s: the old bed `stop(1.2)`; the new bed's gain rises linearly with `dt` over 1.2 s |
| `UNDERWATER_FILTER_HZ` | 6000·(1/12)^depth: 6000 Hz at the surface, 500 Hz on the floor |
| `TENSION_THRESHOLDS` | 2, 3, 5, 10, 20, 50×; each once per round, only while diving; reset when the phase returns to `idle` |
| `BOOST_EDGE` | a rise of more than 0.05 between frames |
| `DUCK` | ×0.5 (−6 dB) on the ambience only; held 1.0 s; linear release over 0.8 s; a new duck restarts the hold and never goes below ×0.5 |
| `CHEST_BURST_GAIN` | m < 3: 0.6 · 3 ≤ m < 10: 0.8 · m ≥ 10: 1.0 |
| `HANDLE_EPSILON` | gain 0.005 · rate 0.005 · filter 1 % |

Input hygiene: a multiplier below 1 or not a number counts as 1; a depth is clamped to 0..1 (NaN is 0); a non-finite boost is 0; a negative or non-finite `dt` is 0; an unknown phase wants no loop.

**Lifecycle.**
- `pause()` (canvas detach) stops every loop with a 0.05 s fade, drops buffered events and resets the edge trackers. The next `update()` resumes from that frame. Mid-dive, it rebuilds the rattle and the underwater bed. It plays no splash, no creak for a threshold already passed and no chime.
- `wake()` re-sends every live loop's values. Each handle call refreshes the manager, so a loop waiting for its cue starts at once (§14 risk 13). A4b calls it from the bank's `onReady`. Tested on the real manager and bank.
- `dispose()` removes all seven listeners and stops every loop. Every later call does nothing.

**Exception containment.** Every manager call, every listener and every entry point is guarded. Each failure kind (`play`, `loop start`, `loop gain`, `loop rate`, `loop filter`, `loop stop`, `loop audible` (A4a.1), `subscribe`, `update`, …) is logged once with `console.error`. A failing cue does not stop the cues after it. The engine bus also firewalls listeners. The render-loop guards around the director's callers belong to the A4b host.

**Null assets.** With the real manifest (every `asset` `null`) and the real manager and bank, full rounds make no fetch, start no source beyond the unlock prime, and log nothing. The game stays playable and silent.

**Implemented as in the revised A4 plan; open to the owner's change:** ducking in A4a (U3); the shimmer on `chestsRevealed` only (U4); the underwater bed until betting opens (U8).

**Limitations.**
- **Loop start level** (§14 risks 15 and 15b): *resolved in A4a.1* (loop startup above). *(Until A4a.1 this recorded that a loop started at once began at full cue level, rate 1 and an open filter for about 15 ms before the director's first ramp, an `AudioManager` change left unauthorized.)*
- **Rattle restart after preemption** (accepted by the owner for A4a.1). A preempted non-essential loop restarts at its stored gain, with no attack. It cannot happen today: there are three loop cues and six loop slots, and both beds are essential.
- **Two clocks.** A bed's fade-in runs on frame time; its fade-out (`stop(1.2)`) runs on the context clock and freezes while the context is suspended. From A4a, unchanged.
- **Cashout ownership.** `cashedOut` has no owner field. Every Phase 7 cashout is the local player's; Phase 8 must add ownership before remote cashouts reach this bus (§14 risk 16).
- **Events between `pause()` and the next `update()` are dropped.** The driver's first frame after an attach advances zero time, so no event is lost in practice.
- **Goldfish edge:** two pickups between frames, or a pickup at a boost near 1, give one chime or none (§14 risk 10).

---

## 8. Assets and licensing

- **[FACT]** The repository contains **no audio assets**. **No licence has been reviewed or cleared.**
- **[REC] Required set:**
  - about 16 SFX: clink ×2, unspool, splash, rattle loop, creak ×2, chime, coin chime, snap, boom, thud, stinger, shimmer, lid creak, coin burst, tick (tick only if Q9 = yes);
  - two ambience loops: surface, underwater;
  - one or two short music beds: calm, dive (only if Q8 includes music).
- **Sourcing [REC; Q5 open]:** the owner provides or commissions the files. The licence must allow commercial use **in a real-money gambling product**.
  - CC0, or a royalty-free commercial licence. Check each EULA's gambling clause.
  - No NC licences. CC-BY only with a credits entry.
  - Every file gets a row in `src/assets/audio/CREDITS.md`: source, licence, URL, date.
- **The agent generates no assets** and invents no file names, sources or licences. The code works silently when manifest entries are missing, so engineering (A1–A4, V1–V7) does not wait for assets. A6 cannot start until the owner supplies files and approves their licences.

---

## 9. Performance targets [REC]

These are targets to verify, not measurements. No measurement exists yet.

| Area | Target |
|---|---|
| Added render cost (F1–F7 together) | Under 1 ms p95 on the dev machine (existing frame meter, recorded per V-commit). Total render stays within docs/05's 6 ms on the owner's mid-range Android device (Q14) |
| Allocation | Zero steady-state per-frame allocations. Particle data in reused `Float64Array`s |
| Canvas | No new steady-state `shadowBlur`. At most 2 new gradients per frame, cached when they do not change |
| Particle caps | 48 / 16 / 12 / 24 / 16 (F1 / F3 / F5 / F6 / F8) |
| Audio | At most 16 voices. About 20 MB decoded. About 1.5 MB on first load. Music lazy-loaded |
| Degradation | `quality: "low"` halves the particle counts and drops F1 parallax |

---

## 10. Browser compatibility [REC]

- **Supported targets:** Safari iOS 16+, Chrome Android, and current desktop Chrome, Edge, Firefox and Safari.
- **iOS Safari:** unlock inside the gesture with the silent-buffer prime; handle the `interrupted` state; respect the ringer/silent switch by default (Q15 open) — do not set `navigator.audioSession.type = "playback"`.
- **Android Chrome:** gesture unlock; suspend when the tab is hidden.
- **Safety:** feature-detect `AudioContext` / `webkitAudioContext`. If neither exists, the game runs silent.
- **SSR:** no `window`, `AudioContext` or `matchMedia` at module scope. The SSR smoke-test gate stays.
- **Device matrix (manual; devices to be named by the owner, Q14):** iPhone Safari, Android Chrome, desktop Chrome / Firefox / Safari / Edge, plus a Bluetooth headset, background/foreground, and a return from the lock screen.

---

## 11. Testing strategy [REC]

- **AudioManager** (node env, fake `AudioContext`, **no new dependency**): lazy creation, unlock, gain clamping, mute, suspend/resume on visibility, voice cap and stealing, missing-asset tolerance, dispose.
- **Director:** deterministic full-round scripts using the existing `src/ui/test/scripted-session.ts` and `SequenceRng`. Each round path asserts a golden cue log: crash, cashout, jackpot + pick, chest-0 timeout, spectator, Dual Bet. Also the boost edge and countdown ticks. *(A4a: the director's unit tests drive it with a recording manager and scripted events and frames, §7.4; the full-round session scripts are A4b. Countdown ticks are deferred, Q9.)*
- **Sound settings store:** persistence round-trip, corrupt storage, a storage API that throws.
- **Renderer FX:** pure-function tests in the style of `layers/presentation.test.ts`: particle positions for a given (state, time); FX queue trigger → expiry → removal; shake offset of 0 under reduced motion; unchanged output when no FX is active.
- **DOM:** SoundControl's accessible name, state and toggle; F8 absent under reduced motion.

### 11.1 Per-commit validation gate (every A, V and P7-C commit)

1. `tsc --noEmit` clean.
2. ESLint at the recorded baseline (0 errors + 6 pre-existing warnings at the Sprint 4 close-out), never worsened.
3. All tests green. The 572 existing tests stay unchanged and green; new suites are added.
4. Production build passes.
5. Dev-server SSR smoke test: HTTP 200 with canvas markup.
6. `git diff --check` clean.
7. **Engine and shared freeze:** `git diff --stat src/engine src/shared` is **empty** for every Phase 7 commit.
8. **Renderer scope:** the commit's `src/rendering` diff lists exactly the files ratified for that step (§13.1). No ratified scope means no renderer change.
9. **UI scope:** the commit's `src/ui` and `src/styles.css` diff lists exactly the files ratified for that step (§13.2). `src/ui/store/wallet-store.ts` never appears (M1 is deferred, not closed).
10. **No new dependency** in `package.json` or a lockfile unless the owner approved it beforehand.
11. Console hygiene: no new warnings.
12. Manual gates for the step (§11.2).

### 11.2 Manual gates

- **A-track:** a listening pass per commit once sound is audible (A6 onward); the device matrix (§10) before P7-C.
- **V-track:** a visual pass per commit; the frame-meter numbers recorded in the commit's docs/15 entry; the seven-size screenshot matrix (375×667, 390×844, 768×1024, 1280×720, 1366×768, 1440×900, 1920×1080) before P7-C.
- **Every commit:** the full gameplay loop stays playable (docs/18 step 2).

---

## 12. Implementation sequence and atomic commit plan

**[OWNER]** Approved sequence: **P7-0 → A1 → A2 → A3 → A4 → V1 → V2 → V3 → V4 → V5 → V6 → V7 → A6 → A5 → P7-C.**

Each step is one commit, followed by verify → commit → push → wait for approval (docs/18). The game stays playable after each one. **Only P7-0 is authorized.** Every later step needs:

1. the owner's explicit authorization of that step;
2. for any step that changes `src/rendering`, `src/ui` or `src/styles.css`, the owner's **ratification of its exact file scope** (§13) before any of those files is changed;
3. the answers to the Open decisions listed in its "Blocked by" column.

| # | Commit | Files (create **C** / modify **M**) | Visible change | Blocked by |
|---|---|---|---|---|
| **P7-0** | `docs: Phase 7 audio & FX blueprint` | C `docs/08_AUDIO_FX_ARCHITECTURE.md`; M `docs/04`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md` | None | — (authorized 2026-11-15) |
| A1 | `feat(audio): AudioManager core` | C `src/audio/audio-manager.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-manager.test.ts` | None (not wired) | Authorization; import rule (§6) |
| A1.1 | `feat(audio): AudioManager decode interface (A1.1)` | M `src/audio/audio-manager.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-manager.test.ts`; M `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md` | None (not wired) | — (authorized 2026-11-15, §1.1; inserted before A2) |
| A1.2 | `feat(audio): voice pools and protected loops (A1.2)` | M `src/audio/audio-manager.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-manager.test.ts`; M `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md` | None (not wired) | — (authorized 2026-11-15, §1.1; inserted before A2) |
| A2 | `feat(audio): sound bank and manifest (A2)` | C `src/audio/sound-bank.ts`, `src/audio/manifest.ts`, `src/audio/sound-bank.test.ts`, `src/audio/manifest.test.ts`, `src/audio/test/fake-fetch.ts`; M `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md` | None (not wired) | — (authorized 2026-11-15, §1.1). Q6 no longer blocks it: the manifest records no format (§7.3) |
| A3 | `feat(ui): sound settings store (A3)` | C `src/ui/store/sound-settings-store.ts`, `src/ui/store/sound-settings-store.test.ts`; M `src/ui/README.md`, `docs/07` (§9 table row), `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16` | None (not wired) | — (authorized 2026-11-15, §1.1; UI-X1 ratified for A3; Q3 answered by D1) |
| A3.1 | `fix(ui): isolate sound settings subscriber failures (A3.1)` | M `src/ui/store/sound-settings-store.ts`, `src/ui/store/sound-settings-store.test.ts`; M `docs/08`, `docs/14`, `docs/15`, `docs/16` | None (not wired) | — (authorized 2026-11-15, §1.1; within the A3 files of UI-X1) |
| A4a | `feat(audio): audio director core (A4a)` | C `src/audio/director.ts`, `src/audio/director.test.ts`; M `src/audio/README.md`, `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16` | None (not wired) | — (authorized 2026-11-15, §1.1; Q7, Q8, Q9 and Q15 approved for A4a) |
| A4a.1 | `fix(audio): loop startup values and audible-gated bed fade-in (A4a.1)` | M `src/audio/audio-manager.ts`, `src/audio/director.ts`, `src/audio/audio-manager.test.ts`, `src/audio/director.test.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/README.md`, `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16` | None (not wired) | — (authorized 2026-11-15, §1.1; approach B) |
| A4b | `feat(ui): audio session integration (A4b)` | Proposed, not ratified: C `src/ui/audio-host.ts`, `src/ui/audio-host.test.ts`, `src/ui/session.audio.test.ts`; M `src/ui/session.ts`, `docs/07` §6, `src/ui/README.md`, `src/audio/README.md`, `docs/08`, `docs/04`, `docs/14`, `docs/15`, `docs/16` | None (no assets yet) | Authorization; UI scope (§13.2) and the import exception; settings before unlock (§14 risk 14) |
| V1 | `feat(rendering): FX queue, camera shake, motion flag` | C `src/rendering/fx-queue.ts` + test; M `src/rendering/scene-renderer.ts`, `src/rendering/camera.ts`, `src/ui/session.ts` | None | Authorization; renderer + UI scope; Q11, Q12 |
| V2 | `feat(rendering): marine snow and depth vignette` | C `src/rendering/draw/particles.ts` + test; M `src/rendering/layers/environment.ts`, `src/rendering/layers/background.ts`, `src/rendering/theme.ts` | F1, F2 | Authorization; renderer scope; Q10 (F1, F2) |
| V3 | `feat(rendering): anchor wake and entry splash` | M `src/rendering/draw/particles.ts`, `src/rendering/layers/effects.ts` + tests | F3, F4 | Authorization; renderer scope; Q10 (F3, F4) |
| V4 | `feat(rendering): landing silt plume` | C `src/rendering/draw/landing-fx.ts` + test; M `src/rendering/layers/actor.ts` (helper export only), `src/rendering/layers/effects.ts` | F5 | Authorization; renderer scope; Q10 (F5) |
| V5 | `feat(rendering): crash effect and camera shake` | C `src/rendering/draw/crash-fx.ts` + test; M `src/rendering/layers/effects.ts` | F6 | Authorization; renderer scope; Q10 (F6), Q11 |
| V6 | `feat: round-reset transition and chest burst` | M `src/rendering/layers/effects.ts`, `src/ui/components/ChestPicker.tsx`, `src/styles.css` + tests | F7, F8 | Authorization; renderer + UI scope; Q10 (F7, F8) |
| V7 | `feat(a11y): reduced motion` | M `src/styles.css` (guards), `src/ui/session.ts` (matchMedia → renderer) + tests | Motion reduced when the OS asks | Authorization; UI scope; Q11 (keep `crash-shake`?), Q12 |
| A6 | `feat(audio): licensed sound assets and mix` | C `src/assets/audio/*`, `src/assets/audio/CREDITS.md`; M `src/audio/manifest.ts` | **Sound** | Authorization; **Q5 (assets supplied, licences approved)**; Q6, Q8 |
| A5 | `feat(ui): sound control` | C `src/ui/components/SoundControl.tsx` + DOM test; M `src/ui/components/TopBar.tsx`, `src/ui/strings.ts` | Sound toggle | Authorization; UI scope; Q4, Q12 |
| P7-C | `docs: Phase 7 close-out` | M `docs/04`, `docs/14`, `docs/15`, `docs/16`, `docs/08` | None | All Phase 7 gates (§15); Q14 device QA |

**Notes:**

- A5 lands after A6, so the app never ships a control that controls nothing.
- *(A4a, 2026-11-15: the owner split the A4 row, which read "`feat(audio): director, music and session wiring` · C `src/audio/director.ts`, `src/audio/music.ts` + tests; M `src/ui/session.ts`", into A4a and A4b. `music.ts` is dropped, because Q8 defers music.)*
- V1–V7 do not depend on assets, so they can proceed while the owner sources them.
- "+ tests" means new test files beside the module, named `*.test.ts` / `*.test.tsx`. Their exact names are part of each step's scope ratification.
- If an Open decision removes an effect or cue (for example Q9 = no, or F4 rejected under Q10), the step shrinks; it is never silently replaced by something else.

---

## 13. Proposed freeze exceptions (accepted in principle; not ratified)

**[OWNER]** Both exceptions are accepted in principle. **Neither is ratified.** A file listed below may be changed only after the owner ratifies the scope **for the step that changes it**. The lists below are the proposal for ratification. Any file not listed stops the commit and goes back to the owner.

### 13.1 Renderer exception — proposed **E-X5** (Phase 7 FX)

Follows the E-X1–E-X4 precedent (docs/07 §19 gate 4). Presentation only. `src/rendering/render-state.ts` is **not** in scope: `RenderState` stays unchanged.

| Step | Proposed file scope |
|---|---|
| V1 | C `src/rendering/fx-queue.ts`, C `src/rendering/fx-queue.test.ts`; M `src/rendering/scene-renderer.ts` (`trigger`, `setMotion`, quality flag), M `src/rendering/camera.ts` (`shake` offset) |
| V2 | C `src/rendering/draw/particles.ts`, C `src/rendering/draw/particles.test.ts`; M `src/rendering/layers/environment.ts`, M `src/rendering/layers/background.ts`, M `src/rendering/theme.ts` (FX colour tokens only) |
| V3 | M `src/rendering/draw/particles.ts`, M `src/rendering/draw/particles.test.ts`, M `src/rendering/layers/effects.ts` |
| V4 | C `src/rendering/draw/landing-fx.ts`, C `src/rendering/draw/landing-fx.test.ts`; M `src/rendering/layers/actor.ts` (**touchdown helper export only**; no drawing change), M `src/rendering/layers/effects.ts` |
| V5 | C `src/rendering/draw/crash-fx.ts`, C `src/rendering/draw/crash-fx.test.ts`; M `src/rendering/layers/effects.ts` |
| V6 | M `src/rendering/layers/effects.ts` (F7) |

**Excluded from E-X5:** `src/rendering/render-state.ts`; `draw/chain.ts`, `draw/anchor.ts`, `draw/ship.ts`, `draw/sea-floor.ts`, `draw/sea-floor-art.ts`, `draw/creatures.ts`, `draw/impact-fx.ts`; `layers/world.ts`, `layers/presentation.ts`; `assets.ts`, `constants.ts`; every existing renderer test except as named above. Changing one of them needs a separate decision.

### 13.2 UI exception — proposed **UI-X1** (Phase 7 touches to the approved Phase 6 UI)

| Step | Proposed file scope |
|---|---|
| A3 | **Ratified 2026-11-15 (D2).** C `src/ui/store/sound-settings-store.ts`, C `src/ui/store/sound-settings-store.test.ts`; M `src/ui/README.md`; M `docs/07_UI_ARCHITECTURE.md` (one row in the §9 store table) |
| A4 | M `src/ui/session.ts` (construct the director, unlock and visibility wiring, driver-sink `AudioFrame`); M or C session tests for the wiring |
| V1 | M `src/ui/session.ts` (forward `crashed` / `bettingOpened` to `SceneRenderer.trigger`) |
| V6 | M `src/ui/components/ChestPicker.tsx` (F8 only), M `src/styles.css` (F8 keyframes) + DOM test |
| V7 | M `src/styles.css` (`prefers-reduced-motion` guards for `crashShake` / `goldPulse`), M `src/ui/session.ts` (`matchMedia` → `setMotion`) + tests |
| A5 | C `src/ui/components/SoundControl.tsx` + DOM test; M `src/ui/components/TopBar.tsx`, M `src/ui/strings.ts` |

**Excluded from UI-X1:** `src/ui/store/wallet-store.ts` (M1 deferred, not closed) and every other money path; `bet-input-store.ts`, `round-store.ts`, `notification-store.ts`, `payout.ts`, `stake.ts`; layout and responsive structure (`GameScreen.tsx`, `scene-fit.ts`); `src/components/AbyssAnchor.tsx`. The approved Phase 6 behavior, layout and visuals stay as approved. The existing DOM characterization pins stay green; any pin that would change stops the commit.

### 13.3 Not an exception

- `src/engine` and `src/shared`: **no change in Phase 7** [OWNER]. There is no exception to request.
- `src/audio` and `src/assets/audio`: new Phase 7 territory, not frozen. Each step still changes only the files listed in §12 for it.

---

## 14. Risks and trade-offs

1. **Renderer freeze.** Phase 7 cannot be delivered without renderer changes. Mitigation: the step-scoped E-X5 (§13.1), ratified per step.
2. **Touching the approved Phase 6 UI** (TopBar, ChestPicker, `styles.css`, strings, session). Mitigation: the step-scoped UI-X1 (§13.2), the DOM characterization pins, and the screenshot matrix.
3. **Autoplay and unlock edge cases, especially on iOS.** Mitigation: re-arm the unlock and stay silent rather than fail. They can be fully proven only on real devices (Q14).
4. **Audible output cannot be unit-tested.** The cue logic is tested; the mix is a manual gate.
5. **Decoded-audio memory.** Mitigation: short mono loops, the budget in §9, lazy music loading.
6. **FX lost on remount.** Accepted under docs/05 §12.
7. **Visual drift from the approved atmosphere.** Mitigation: every effect is opt-in (Q10), capped and screenshot-gated. Chain, anchor, ship and sea-floor drawing are not touched.
8. **Asset licensing in a gambling context.** Mitigation: the credits ledger and owner sign-off (Q5). No asset is committed without both.
9. **Scope creep into Phase 8.** None is proposed: no networking, server, auth or multiplayer.
10. **Trade-off — goldfish detection from the `boost` edge** instead of an engine event: two pickups in quick succession while boost is already rising sound as one. Accepted to keep the engine unchanged [OWNER: no engine change].
11. **Assets may arrive late.** V1–V7 proceed without them (§12). If they do not arrive, A6 and A5 wait, and the app ships silent but complete.
12. **The voice cap can silence loops** (analysis recorded in A1.1, 2026-11-15; to analyze and test before A2, at the owner's instruction). Fixed priority tiers alone do not keep ambience and music loops safe under the A1 policy:
    - A newcomer **equal** to the lowest playing priority steals the **oldest** voice at that priority. Loops are usually the oldest, so a same-tier newcomer steals a loop.
    - A loop started at a full cap, below every playing voice, is dropped and gets an inert handle. Nothing retries it, so it stays silent until the caller starts it again.
    - Any one-shot tier set above the loop tier (for example, stingers) steals loops during a burst.
    - Fading ("stopping") voices do not count toward the cap, so the real node count can briefly go above 16.

    Strictly higher loop tiers do stop one-shots from stealing loops. They do not cover the cases above. The policy needs a decision before A2 fixes the manifest's priorities. No change is made in A1.1.

    **Resolved by A1.2 (2026-11-15, §7.2).** One-shots and loops have separate pools, so no one-shot can steal a loop, whatever the tiers. A loop that cannot start waits as a pending loop and starts once it fits, instead of getting an inert handle. Fading and stolen voices keep their slots until they have ended, so the real source count never exceeds 16. An essential loop is never preempted.
13. **A pending loop waits for the next manager call** (recorded in A2, 2026-11-15, §7.3). When a cue finishes loading, the manager is not told; the loop starts at its next call. The bank's `onReady` lets A4 make that call at once. If A4 neglects it, a bed starts late, up to the next handle update or play. Mitigation: A4's per-frame handle updates, and a test in A4 that a bed starts on the frame its cue becomes ready. A public `AudioManager.refresh()` is the alternative; it needs its own approval. *(A4a, 2026-11-15: the director's `wake()` re-sends every loop value and starts a waiting loop at once, tested on the real manager and bank (§7.4). Wiring `onReady → wake()` is A4b's.)*
14. **Settings may be restored after the first gesture** (owner requirement, A3, 2026-11-15, §3.5). Nothing guarantees that `restore()` runs before the first user gesture. If the session unlocks audio first and applies the settings later, a muted user could hear sound briefly, or at the wrong volume. A4 must apply the persisted mute and volumes to the `AudioManager` before the unlock or any playback, and test it. *(A4a does not touch settings; this stays an A4b requirement.)*
15. **A loop that starts at once begins at full cue level for about 15 ms** (recorded in A4a, 2026-11-15, §7.4). `AudioManager.loop()` has no initial gain, so the director's first `setGain` follows the start and ramps. It is silent with the null manifest, and is masked at the dive start by the splash. Mitigation: judge it in the A6 listening pass. The fix is an initial gain for `loop()`, an `AudioManager` change that needs its own approval. *(Resolved in A4a.1, 2026-11-15: `loop(cue, options)` puts the initial gain, rate and filter on the nodes before the source starts, §7.2.)*
    **15b. A bed's fade-in could complete before its voice played** (recorded in A4a.1, 2026-11-15; reading confirmed by the owner). The director raised a bed's level every frame, whether a voice played or not. A bed waiting for the unlock, decoding or a slot, or held by mute, host suspension, an interruption or a refused resume, could reach level 1 and then start or resume at full level. *Resolved in A4a.1: the fade advances only while `isAudible()` is true (§7.2, §7.4).*
16. **Remote cashouts would play the local cue** (recorded in A4a, 2026-11-15). `cashedOut` carries no owner, and in Phase 7 every cashout is local. Phase 8 must add an ownership field before remote cashouts reach the event bus.
17. **A resume that never settles is not retried** (recorded in A4a.1, 2026-11-15; deferred by the owner as a separate issue). `unlock()` marks the manager unlocked before `resume()` settles and returns early on later calls. If WebKit leaves the promise pending, or never reaches `"running"` without a `statechange`, no later gesture calls `resume()` again, and the game stays silent. A4a.1 does not change `unlock()`. With the `isAudible()` gate, the beds then simply hold at silence, and fade in from 0 once the context runs. Its own step, after device verification (Q14); the manual-resume fake can model it.

---

## 15. Definition of Done and acceptance gates

1. All approved effects and cues are delivered as specified here. No change to `src/engine` or `src/shared`. The renderer and UI diffs equal the ratified file lists (§13).
2. `RenderState`, the engine API, round timing, Dual Bet, settlement and Bonus Chest behavior are unchanged. The 572 existing tests stay green, and new suites cover §11.
3. No `AudioContext` exists before a user gesture. The game is silent but fully playable when audio is unsupported or assets are missing. Audio suspends when the tab is hidden and stops when the canvas is detached.
4. Reduced motion is honored in both the canvas and the DOM. Mute and volume persist.
5. Frame-meter numbers are recorded per V-commit. The owner approves them on a mid-range Android device (Q14).
6. The owner passes the device matrix and approves the listening pass, the seven-size screenshot matrix, and the full gameplay loop.
7. `src/assets/audio/CREDITS.md` covers every asset, and the owner has approved every licence.
8. The docs are current: `docs/04`, `docs/08`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md`.

### 15.1 Owner-review requirements

| Point | What the owner reviews | Required before |
|---|---|---|
| After P7-0 | This blueprint and the tracking updates | A1 authorization |
| Before each step | The step's authorization; for renderer/UI steps, the exact file scope (§13) | That step's first file change |
| Before A3 / A4 | Q3, Q7, Q8, Q9, Q15 | The defaults coded into the store and the director |
| Before V1–V7 | Q10 (per effect), Q11, Q12 | The matching V-step |
| Before A6 | Q5 (files supplied, licences approved), Q6, Q8 | Any asset in the repository |
| Before A5 | Q4, Q12 | The sound control |
| Before P7-C | Device matrix (Q14), listening pass, screenshot matrix, performance on Android, full gameplay loop | Phase 7 close-out |

---

## 16. Documentation conflicts recorded in P7-0

| Conflict | Resolution |
|---|---|
| `src/audio/README.md` named events `round:crashed` and `cashout:confirmed`, which do not exist | **Corrected in P7-0.** The README now names the real `engine.events` names (§2.2) |
| The README's "no game state" rule contradicted its depth-based ambience, which needs per-frame state | **Corrected in P7-0.** Audio reads a narrow per-frame `AudioFrame` (§3.4) and owns no game state |
| docs/06 §12 reserves `goldfishConsumed` / `boostExpired`, still unbuilt | **Recorded, not changed.** They stay reserved and unused; Phase 7 makes no engine change (§1.1). docs/06 is outside the P7-0 file scope |
| `crashShake` / `goldPulse` in `src/styles.css` have no reduced-motion guard | **Recorded.** Fixed in V7, under UI-X1 (§13.2) |

docs/05 §6 (`shake`, `zoom` reserved), §12 (FX list), §14 item 9 (`quality` flag) and §17 (event channel) already anticipate the V-track. This blueprint uses them as designed and does not amend docs/05. Jackpot `zoom` stays unimplemented (§4.3).

---

## 17. Governance and stop rules

- **Only one task is active:** TASK 008, Phase 7. Only P7-0 is authorized.
- **After P7-0:** do not start A1, do not install dependencies, do not change runtime source code, do not generate audio or visual assets, do not begin Phase 8. Wait for the owner's authorization of A1.
- Every step: one commit, normal push to `origin/develop`, no force-push, no history rewrite (AGENTS.md), no unrelated files staged.
- If anything in the code contradicts this document, the step stops and the document is corrected first, with the owner's approval.

---

## 18. Change log

- **2026-11-15 — P7-0.** Blueprint created from the owner-approved proposal. Records the approved direction (§1.1), the boundaries (§1.2), the decision register (§1.3), the commit plan (§12), the proposed exception scopes (§13) and the acceptance gates (§15). No implementation.
- **2026-11-15 — A1.1.** The owner authorized the decode interface as a separate step before A2 (§1.1). Added §7.1 and the `decode()` line in §7, the A1.1 row in §12, the owner's Q6 planning preference in §1.3 (Q6 stays Open), and risk 12, the voice-cap analysis, in §14. A2 is not authorized.
- **2026-11-15 — A1.2.** The owner authorized voice pools and protected loops as a separate step before A2 (§1.1). Added §7.2, the A1.2 row in §12, the resolution note on risk 12 in §14, and a note on `loop()` in §7. `maxInstances` is deferred. A2 is not authorized.
- **2026-11-15 — A2.** The owner accepted A1.2 (`0de6d73`) and authorized the sound bank and manifest (§1.1). Added §7.3, the `SoundBank` interface in §7, the A2 row in §12 (with its exact file list), a note on Q6 in §1.3 (Q6 stays Open), and risk 13 in §14. `audio-manager.ts` is unchanged. No asset, URL or format is recorded. Q3–Q12, Q14 and Q15 stay Open. A3 is not authorized.
- **2026-11-15 — A3.** The owner authorized the sound settings store after the A3 pre-implementation report (§1.1, D1–D8). Added §3.5, `ambience` in §3.2 (D3), the A3 bullet in §1.1, Q3 answered in §1.3 (D1), the UI-X1 ratification for A3 in §1.3 Q2 and §13.2 (D2), the A3 row in §12 (with its exact file list), and risk 14 in §14. D7 is deferred to A5. Not wired; no audio file changed. Q4–Q12, Q14 and Q15 stay Open. A4 is not authorized.
- **2026-11-15 — A3.1.** The owner accepted A3 (`16a6a40`) with documented limitations and authorized the subscriber failure hardening (A3 audit finding M1 (the read-only audit of `16a6a40`; not the deferred money-integrity M1)). Added the A3.1 bullet in §1.1, the subscriber isolation bullet in §3.5, and the A3.1 row in §12. `createStore` and the other stores are unchanged. A4 is not authorized.
- **2026-11-15 — A4a.** The owner split A4 into A4a and A4b, and authorized A4a, the Audio Director core, after the revised A4 plan (§1.1). Q7, Q8, Q9 and Q15 are recorded as owner-approved for A4a in §1.1 and §1.3. Added §7.4 (the director: mapping, loops by phase, merging table, provisional values, lifecycle, containment, limitations), the director interface in §7, the A4a and A4b rows in §12, the notes on risk 13 and 14 and the new risks 15 and 16 in §14. Updated §3.2 (MusicController deferred), §3.4 (`AudioFrame` narrowed), §5 (mapping notes), §6 (`music.ts` dropped) and §11. `audio-manager.ts`, `sound-bank.ts`, `manifest.ts` and every `src/ui` file are unchanged. A4b is not authorized.
- **2026-11-15 — A4a.1.** The owner approved approach B of the read-only A4a.1 design report and authorized the loop startup correction (§1.1, decisions 1–8). Added `LoopOptions` and `isAudible()` to §7 and §7.2; the loop startup rules, the `loop audible` failure kind, and the rattle-restart and two-clock limitations to §7.4; the A4a.1 row in §12; the resolution of risk 15, the new risk 15b (resolved) and the new risk 17 (Safari resume retry, deferred) in §14. Updated the §7.4 frame steps 1 and 3. `sound-bank.ts`, `manifest.ts`, `unlock()` and every `src/ui` file are unchanged. A4b is not authorized.
