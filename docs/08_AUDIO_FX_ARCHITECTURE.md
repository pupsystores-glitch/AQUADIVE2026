# AQUADIVE — AUDIO & VISUAL EFFECTS ARCHITECTURE (Phase 7)

**Sprint 5 / Phase 7 / TASK 008.** This is the Phase 7 blueprint, written in step **P7-0**.

**Status (2026-11-15, A4b):** the owner approved the architecture as the basis for Phase 7. P7-0 (`0e7ff80`), A1 (`3761062`, accepted), A1.1 (`ad9e959`), A1.2 (`0de6d73`, accepted), A2 (`03bb7dc`), A3 (`16a6a40`, accepted with documented limitations), A3.1 (`e70fa22`), A4a (`289b849`) and A4a.1 (`d8ab112`) are done and pushed to `origin/develop`; no owner acceptance is recorded for A1.1, A2, A3.1, A4a or A4a.1. **A4b, the audio session integration (§7.5), is authorized and delivered in one local commit, not pushed.** Every later step needs its own explicit authorization. *(Until A4b this read: "**Status (2026-11-15, A4a.1):** … A3.1 (`e70fa22`) and A4a (`289b849`) are done. The owner split A4 into A4a and A4b (§12). **A4a.1, the loop startup correction (§7.2, §7.4, §14 risks 15 and 15b), is authorized and delivered in its own commit.** A4b and every later step need their own explicit authorization.")* *(Until A4a.1 this read: "… and A3.1 (`e70fa22`) are done. The owner split A4 into A4a and A4b (§12). **A4a, the Audio Director core (§7.4), is authorized and delivered in its own commit.**")* *(Until A4a this read: "P7-0 (`0e7ff80`), A1 (`3761062`), A1.1 (`ad9e959`), A1.2 (`0de6d73`, accepted) and A2 (`03bb7dc`) are done. **A3, the sound settings store (§3.5), is authorized and delivered in its own commit.** The owner accepted A3 (`16a6a40`) with documented limitations; **A3.1, its subscriber failure hardening (§3.5), is authorized and delivered in its own commit.** A4 and every later step need their own explicit authorization.")* *(Until A3 this read: "P7-0 (`0e7ff80`), A1 (`3761062`), A1.1 (`ad9e959`) and A1.2 (`0de6d73`, accepted) are done. **A2, the sound bank and manifest (§7.3), is authorized and delivered in its own commit.** A3 and every later step need their own explicit authorization.")* *(Until A2 this read: "P7-0 (`0e7ff80`), A1 (`3761062`) and A1.1 (`ad9e959`) are done. **A1.2, voice pools and protected loops (§7.2), is authorized and delivered in its own commit.** A2 and every later step need their own explicit authorization.")* *(Until A1.2 this read: "P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted. **A1.1, the decode interface (§7.1), is authorized and delivered in its own commit.**")* *(Until A1.1 this read: "the owner … authorized **P7-0 only** (this document and the tracking updates). **No implementation step is authorized.** A1 and every later step need their own explicit authorization.")*

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
- **A4b, the audio session integration** (owner authorization, 2026-11-15, after accepting the final read-only A4b architecture report): §7.5. Approved: D1–D9 and D11 as proposed; **D10** with a condition: jsdom's unsupported-Web-Audio console warnings are tolerated only while the existing tests stay green and the warnings hide no unexpected failure. Implemented: one `AudioHost` per `GameSession`; `src/ui/audio-host.ts` as the sole production UI module importing `src/audio` (the import exception, ratified); manager, bank and director owned by the host; settings restored and applied before the first unlock; the director constructed and subscribed at session construction, then paused; attach-scoped listeners with complete detach cleanup; idempotent loading and attach/detach; frames through the existing driver sink, reusing the public state passed to `sync`; complete exception isolation; neutral provisional `AUDIO_MIX`; an audio-only `GameSession.dispose()`.

  Mandatory corrections: (1) `GameSession.dispose()` is documented as disposing the audio subsystem only; (2) partial host initialization failures leave no duplicate subscription or listener and no invalid lifecycle flag, with deterministic failure-and-retry tests; (3) every audio call from the driver sink is isolated; (4) risk 17 stays open: no browser-specific resume workaround, `AudioManager` unchanged; (5) the session stays SSR-safe; (6) the DOM harness, its subscription counts and every existing assertion are unchanged; (7) stale Phase 7 statuses are corrected from owner decisions and Git evidence only.

  Scope (A4b, ratified; UI-X1 for A4b): C `src/ui/audio-host.ts`, `src/ui/audio-host.test.ts`, `src/ui/session.audio.test.ts`, `src/ui/screen.audio.test.tsx`; M `src/ui/session.ts`, `src/ui/README.md`, `src/audio/README.md`, `docs/04`, `docs/07`, this document, `docs/14`, `docs/15`, `docs/16`. **Not authorized:** `AudioManager`, director, SoundBank, manifest, `src/audio/test/*`; engine, wallet, settlement, RNG, rendering, gameplay; `CanvasStage`, the UI test harnesses, existing assertions; dependencies, package files, assets; A5, A6, visual work, PixiJS, music, Safari-specific fixes.
- **E-X7 accepted** (owner, 2026-11-16): the Chain Snapped animation (§13.4) was visually reviewed and fully accepted, together with the E-X6 ship work, exactly as implemented. Both stay unchanged by V1.
- **V1, FX queue, camera shake hook and motion flag** (owner authorization, 2026-11-16, returning to the approved roadmap): infrastructure only, **no visible effect**. Implemented: a renderer-owned FX queue (`src/rendering/fx-queue.ts`) on the animation clock; `SceneRenderer.trigger(kind)` for `"crash"` / `"reset"`; `setMotion({ reducedMotion })` (default false); `setQuality("high" | "low")` (default `"high"`, behavior-neutral); a camera shake offset hook (`Camera.setShake`) held at exactly 0; the session forwards `crashed` → `trigger("crash")` and `bettingOpened` → `trigger("reset")`. **One crash clock:** the queue's crash entry takes its `startedAt` every frame from the E-X7 chain-snap break (§13.4), so no second crash timer exists. Not in V1: any visible effect, the Canvas shake animation (V5), a UI toggle, OS `matchMedia` (V7), any change to the DOM `crash-shake`, the engine, shared contracts, audio, E-X6 or E-X7.
- **V2, F1 marine snow and F2 depth vignette** (owner authorization, 2026-11-16, after approving the V2 architecture proposal). Decisions: **Q10** approved for F1 and F2 only (F3–F8 keep their own approvals). **D-V2-1** option E: the renderer's FX settings reach every layer as one reused, read-only extra argument (`RenderLayer.render(ctx, state, camera, time, fx)`, `FxSettings` in `render-state.ts`); they are never part of `RenderState` and no engine-owned state changes. **D-V2-2** the vignette is drawn at the end of the Environment layer; `layers/background.ts` is unchanged. **D-V2-3** under reduced motion the snow has no time-driven sinking or sway; the static composition keeps a reduced (halved) parallax. **D-V2-4** both effects are exactly absent at `depthRatio` 0 (no draw call). **D-V2-5** fixed caps: 48 specks on High, 24 on Low. **D-V2-6** every intensity and motion value is provisional until the owner's visual review. **D-V2-7** no commit of V2 without separate owner approval. **D-T1** a test-only runtime correction in `layers/chain-snap.test.ts` ("never stretches"), separately identified. Implemented in `src/rendering/draw/particles.ts` (§4.3, §7). Since V2 the V1 flags are no longer inert: `quality` and `reducedMotion` shape F1 only. No second settings store and no second crash timer exist; V1's queue, E-X7 and E-X6 are unchanged.
- **V2 accepted** (owner, 2026-11-16): the refined "Balanced" F1 marine snow and F2 depth vignette (§4.3, the "as implemented" rows) were visually reviewed and approved exactly as implemented. D-V2-6 is closed for F1 and F2: those values are final, and no visual parameter changed at closeout. D-V2-7: separate V2 and D-T1 commits are prepared and await the owner's go-ahead; no push. V3 is not authorized. *(Git, at the start of V3: V2 and D-T1 are committed locally as `3878865` and `0bd6ee2`, not pushed — `develop` is two commits ahead of `origin/develop`.)*
- **V3, F3 anchor wake and F4 release splash** (owner authorization, 2026-11-16, approving the V3 architecture proposal; decisions Q10/V3 1–10): **F3 approved** — a deterministic, depth-driven underwater bubble trail; **F4 option A** — the anchor already rests under water and is not moved; the release is a subtle disturbance at the hawse hole and the waterline; **above the water** no droplets or other new effects over the hull, only the faint upper half of the waterline ripple; **trigger** pure depth-driven rendering — no new FX event, no session or FX-queue change; **waterline option A** — `WATERLINE` exported from `draw/ship.ts`, ship drawing unchanged; **scope** `draw/particles.ts` + test, `layers/effects.ts`, `theme.ts`, `draw/ship.ts` (the export only), docs 08 and 14–16; **crash, cashout/landing and bonus** end both effects at once, E-X7 and the jackpot burst unchanged; **F3 launch** fade-in over `launchProgress` 0.5 → 1; **reduced motion** hides F3 and F4, Low uses the reduced counts; **every new visual value is provisional** until the owner's review; no commit or push without separate authorization. Implemented in `src/rendering/draw/particles.ts` and `src/rendering/layers/effects.ts` (§4.3 "as implemented" rows). Delivered in the working tree, uncommitted; V4 not started.
- **V3 accepted** (owner, 2026-11-16): F3 anchor wake and F4 release splash (option A) were visually reviewed and approved exactly as implemented. The §4.3 F3 and F4 "as implemented" values are final; no visual parameter changed at closeout. Committed locally as `feat(rendering): add anchor wake and release splash (V3)`, not pushed. V4 is not started.
- **Owner priority change** (2026-11-16, at the V3 closeout): the remaining audio work comes next — **A6** (licensed sound assets and final mix), then **A5** (sound controls UI), with the audio validation and listening QA — and **V4–V7 are deferred until it is complete; they are not cancelled**, and their scopes, effects and open decisions are unchanged. A6 and A5 are **not authorized for implementation**: a read-only audit and an A6 + A5 completion plan come first.
- **A6, original sound design and production** (owner authorization and decision Q5, 2026-11-16): **100% original sound design created specifically for AQUADIVE**; no placeholder audio. Authorized: producing the 18 cues of the existing manifest (ids unchanged) from an authorized, documented workflow; `src/assets/audio/CREDITS.md`; wiring URLs, gains and loop points into `manifest.ts`; replacing the tests that assumed a null-asset production manifest with explicit no-asset fixtures; a measured `AUDIO_MIX` proposal. Scope: `src/assets/audio/`, `src/audio/manifest.ts`, `src/audio/manifest.test.ts`, `src/audio/director.test.ts` (fixture only), `src/audio/README.md`, `src/ui/audio-host.ts` (`AUDIO_MIX` only), `src/ui/audio-host.test.ts`, `src/ui/session.audio.test.ts`, and the Phase 7 documents. **Not authorized:** `director.ts` and `audio-manager.ts` (a later tuning is a separate A6.1), A5, V4–V7, music (Q8), countdown ticks (Q9), any gameplay, wallet, RNG, shared or rendering change, and any staging, commit or push before the owner's listening acceptance. **Delivered in the working tree (§8, "A6 as delivered"); awaiting the owner's listening approval.** Two test files outside the named scope had one test each corrected, as the fixture rule requires: `src/audio/sound-bank.test.ts` and `src/ui/screen.audio.test.tsx`; `src/ui/session.audio.test.ts` needed no change.
- **Music architecture decisions and A6.1** (owner, 2026-11-16, after the adaptive music architecture proposal):
  1. **Chain rattle:** approved — the continuous `chain-rattle` loop is disabled by default; its manifest entry, audio file, parameters and implementation are kept for possible future use. Implemented as **A6.1**.
  2. **Shared-clock synchronized loops:** approved in principle — an opt-in `syncGroup`; implementation needs its own **M1** authorization.
  3. **Music architecture:** approved in principle — a dedicated `MusicController` with three synchronized stems, `music-tide`, `music-current` and `music-abyss`.
  4. **Cashout behaviour (revised):** music follows the game phase and the depth, not whether the player has a live bet. No `atStake` in `MusicFrame`. Existing cashout events may briefly duck the music so reward sounds stay audible, equally for partial and complete cashouts.
  5. **Memory:** a provisional 28 MB decoded-audio ceiling for the three-stem design; final approval needs mobile performance and memory testing. The 16-voice cap stays.
  6. **Audio format:** approved — mono, 48 kHz, synchronized 24-second musical periods.
  7. **Musical identity:** a creative starting point — D modal, 80 BPM, cinematic underwater ambience, a restrained pulse and gradual depth-based layering. Final quality needs the owner's listening acceptance.
  8. **Production:** option B first — original in-repository synthesis candidates, presented for listening before they count as final. No composer and no external AI music service without separate approval.
  9. **Q8:** the earlier music deferral is superseded. A6.1, M1, M2 and M3 are separate controlled steps, each needing its own authorization. Only A6.1 is authorized.

- **M-OWN, the main soundtrack** (owner decisions D1–D9, 2026-11-17, after the M-OWN technical report): the owner-supplied MP3 is AQUADIVE's main background soundtrack, and a controlled streaming implementation is authorized.
  - **D1 Architecture:** one streaming `HTMLAudioElement` through one `MediaElementAudioSourceNode` into the existing `music` bus, as an extension of the `AudioManager`. One `AudioContext`, the four buses, the 16-voice pool and its guarantees, the director and host ownership, SSR safety and the gesture rule are preserved. The MP3 is never decoded into an `AudioBuffer`.
  - **D2 Looping:** native media-element looping first; no remix, cut, split or re-encode; measure and document; a gap or click is reported before any other strategy; no automatic crossfade players.
  - **D3 File:** the exact bytes, as `src/assets/audio/music-main.mp3`, SHA-256 `03c8dfd16c8a2713775a1fcf3939933bfe6d3fe80aea6730e043e0a74ce81efc`.
  - **D4 Mix (provisional):** `AUDIO_MIX.music` 0.5; ambience and SFX unchanged; ducking crash ×0.40 (80 ms attack, 1.6 s hold, 1.5 s release), cashout ×0.55 (50 ms, 0.9 s, 1.0 s), jackpot ×0.35 (100 ms, 2.8 s, 2.0 s); overlaps use the deepest attenuation; the music volume stays independent.
  - **D5 Duck scope:** crash, cashout and jackpot only; nothing for `chest-coin-burst`; no gameplay or payout change.
  - **D6 Provenance:** "Owner-provided, AI-generated original soundtrack. Commercial-use rights pending verification of the generating service's applicable terms." Nothing is claimed as verified; local testing is not blocked.
  - **D7 Budgets:** the decoded SFX and ambience budget is preserved; the music is streamed; its 3.53 MB lazy download is recorded separately.
  - **D8 iOS silent mode: not approved to change.** Q15 stays binding. Research first; implement the browser-safe portion only; if the design cannot satisfy Q15, stop and report alternatives. No audio-session hack, no lock-screen metadata, no media-session controls.
  - **D9 Git and scope:** nothing staged, committed, pushed or merged; A6 and A6.1 stay identifiable; the ocean ambience and the disabled chain rattle are preserved; the three-stem adaptive music (`syncGroup`, M1–M3) is deferred.
  - **Delivered in the working tree (§7.6); awaiting the owner's listening acceptance.** Result on D8: the design cannot satisfy Q15 on iOS, so music is off on iOS and iPadOS and the alternatives are in §7.6.

- **A-OWN, owner-supplied sound effects and ambience** (owner audio integration instruction, 2026-11-17): integrate every validated owner upload into its existing cue (ids, event mappings and timing unchanged; the existing `AudioManager`, `SoundBank`, `AudioDirector`, `AudioHost` and `SOUND_MANIFEST`); keep the uploads as the backup; no synthetic replacement. **Disable `tension-creak-1` and `tension-creak-2`** in normal play, not fetched or decoded, ids and files kept; **keep `chain-rattle` disabled**; `chain-unspool` and `chain-snap` stay active. **`AUDIO_MIX.ambience` 0.20**, provisional; music and sfx mix, user settings and `music-main.mp3` unchanged. No engine, RNG, wallet, settlement, rendering or gameplay change; no Git operation; A5 and V4–V7 not started. **Delivered in the working tree (§8, "A-OWN as delivered"); awaiting the owner's listening feedback.** The beds exceed the §9 decoded budget that M-OWN D7 preserved; reported, not reduced.

- **LA1, premium loading screen, dual audio controls and iPhone music** (owner authorization, 2026-11-17): a measured startup screen (INITIALIZING → LOADING → READY → START GAME → PLAYING), two independent switches under the balance (SOUND: effects and both ocean beds; MUSIC: `music-main.mp3` only), and an audible soundtrack on iPhone Safari. The owner asked for a technically supported way to play music on iPhone while keeping the silent-mode policy, without undocumented APIs.
  - **Implemented (working tree, uncommitted):** on iOS and iPadOS only, `navigator.audioSession.type = "ambient"` (the documented W3C Audio Session API; Safari 16.4 and later; alternative 2 of §7.6), set once before the first AudioContext. Music then plays with the ringer on, and Silent Mode silences everything, music included, so Q15 holds. iOS before 16.4 (no API): music stays off, with a notice on the loading screen. The session is never set to "playback" and is untouched elsewhere. Details: §7.6 "LA1".
  - **Switches:** `soundOn` and `musicOn` in the existing sound settings store (same version-1 record; the master mute and the four volumes keep their meaning). SOUND off → `sfx` and `ambience` buses 0; MUSIC off → `music` bus 0 and the one stream held (paused, never requested while off). Both off → the manager is muted too (context suspended). Mix (0.5 / 0.2 / 0.7) and ducking unchanged.
  - **Device-dependent, needs the owner's iPhone test and approval:** the "ambient" category also lets the player's own music app keep playing under the game (it mixes instead of interrupting), and Silent Mode silences the soundtrack too. If the owner wants the soundtrack audible in Silent Mode, that is §7.6 alternative 4 and changes Q15.

- **V4 accepted** (owner, 2026-11-18): F5, the landing silt plume, was visually reviewed and approved exactly as implemented (§4.3 "F5 as implemented": touchdown-synchronized start, ≈ 1.0 s lifetime, ≤ 12 High / ≤ 6 Low puffs, one static fading puff under reduced motion, the current sand colour, opacity, movement and spread). These values are final; no source or visual value changed at acceptance. The `src/rendering/draw/particles.test.ts` adjustment is authorized. Physical-device performance validation is still pending.

- **V5, F6 crash visual effects** (owner authorization, 2026-11-18): the approved E-X7 snapped-chain animation stays unchanged; V5 adds a restrained accent at the chain-breaking moment. **D1 camera shake: option A** — no additional Canvas camera shake; the reserved hook is not activated and its offset stays 0; the multiplier/DOM `crash-shake` is kept exactly as implemented; no viewport movement (Q11). **D2 metallic fragments:** ≤ 12 High, ≤ 6 Low; short, deterministic outward motion; subtle steel-blue and metallic highlights; controlled fade; no exaggerated sparks or explosion. **D3 dark vignette pulse:** subtle, dark blue, brief, synchronized with the break; never obscures the anchor, the chain or the multiplier. **D4 reduced motion:** no moving fragments, no shake, no animated pulse; at most one subtle static break accent that fades. **D5 preserve:** E-X7, the DOM crash-shake, V1 queue, V2, V3, V4 and CH1. Synchronized to the visual chain break (the E-X7 clock, no second crash clock); deterministic; no `Math.random`, `shadowBlur` or filters. Scope: the ratified §13.1 V5 row. **Delivered in the working tree, uncommitted and not staged (§4.3 "F6 as implemented"); awaiting the owner's visual acceptance.**

- **V5 accepted** (owner, 2026-11-18): F6, the crash visual effects, was visually reviewed and **approved with final values**, including the optimized cached-vignette implementation (§4.3 "F6 as implemented"): 12 metallic fragments on High and 6 on Low; the current steel-blue fragment colours; the current deterministic fragment movement and lifetime; the current subtle dark-blue vignette pulse; the full-resolution cached pulse bitmap, copied 1:1, rebuilt on resize and DPR changes, with the existing cache size limit and gradient fallback; under reduced motion one subtle static fading accent; no additional Canvas camera shake; the DOM multiplier `crash-shake` and the E-X7 chain-snap animation unchanged. No source or visual value changed at acceptance. **Physical-device performance validation is still pending**: every V5 timing so far comes from software-rasterized headless Chrome on the desktop, not from an iPhone, an Android device or a GPU-rasterized browser.

- **V6, F7 round-reset fade** (owner authorization, 2026-11-18, after the V5 closeout): F7 only; F8 was delivered in CH1. The approved direction, *start slightly darkened → fade smoothly to normal*, replaces the fade-to-dark dip of §4.3. **Trigger:** `bettingOpened` → the V1 FX queue's reset entry, stamped on the first frame of the surface view. **Animation:** starts darkened and fades to normal — opacity 0.14 on the first reset frame, then 0.14 · (1 − t / 0.40)² (quadratic ease-out, zero slope at the end), exactly 0 from 0.40 s; no fade-in, no second dip, no crossfade. **Colour:** `rgb(2, 12, 34)`. **Drawing:** one solid `fillRect` over the canvas viewport at that `globalAlpha`, last in the Effects layer, betting view only; the DOM controls above the canvas are not touched. High = Low; reduced motion: nothing. **Timing:** the FX queue is the only reset clock. `SceneRenderer` forwards the queue's own active reset entry to the layers as `FxSettings.reset` (`readonly reset?: { readonly elapsed: number } | null`; renderer-owned, never engine state) right after `fx.update(...)`; no second clock, timer or per-frame copy. **Ratified file scope (V6 only):** M `src/rendering/render-state.ts` (the optional `reset` field), M `src/rendering/scene-renderer.ts` (`reset: null` initial value and the one-line handoff), M `src/rendering/layers/effects.ts` (F7), plus tests and Phase 7 docs. **Status:** delivered in the working tree, uncommitted and not staged, awaiting the owner's visual acceptance.

- **V6 accepted** (owner, 2026-11-18): F7, the round-reset transition, was visually reviewed and **approved — final**; its appearance, timing and animation are final (§4.3 "F7 as implemented"): trigger `bettingOpened` through the existing FX queue; 0.40 s; colour `rgb(2, 12, 34)`; initial opacity 0.14; envelope 0.14 × (1 − t / 0.40)²; starts darkened and returns smoothly to normal; High = Low; off under reduced motion; no Canvas camera shake; no new clock or scheduler; the surface presentation unchanged. The owner understands and accepts that F7 is a subtle fade, not a full scene crossfade. No source or visual value changed at acceptance. Committed locally as `feat(rendering): add approved round reset transition (V6)`, not pushed. **Physical-device performance verification is still pending**: every V6 timing so far comes from software-rasterized headless Chrome on the desktop.

- **V7, reduced motion** (owner authorization, 2026-11-18, after the V6 closeout; official scope §12 / §13.2 only): `attachCanvas` resolves `matchMedia("(prefers-reduced-motion: reduce)")` once per attach (never at session construction, so the server never touches `window`; injectable as `GameSessionDeps.reducedMotion`), calls the renderer's existing `setMotion({ reducedMotion })` before the first frame, and keeps it current through exactly one `change` listener per attached renderer (legacy `addListener` fallback for Safari < 14), removed by that attachment's detach. No per-frame work, no timer, polling or React state; without `window` or `matchMedia`, or if they throw, nothing is called and the renderer keeps full motion. The renderer and every effect are unchanged: each effect's approved reduced-motion behaviour (§4.3) now simply reaches the live game. CSS: under `prefers-reduced-motion: reduce` the multiplier's `goldPulse` stops and keeps goldPulse's resting glow as a still `text-shadow`, and `crash-shake` does not run; the normal-motion rules are byte-identical (Q11's "keep `crash-shake`" holds for normal motion). Files: M `src/ui/session.ts` (`matchMedia` → `setMotion`), M `src/styles.css` (`prefers-reduced-motion` guards for `goldPulse` / `crashShake`); C `src/ui/session.motion.test.ts` (20 tests), C `src/ui/reduced-motion.css.test.ts` (6 tests); `.gitignore` (`qa/v7-reduced-motion/`); docs 08, 14, 15, 16. The in-app override of Q12 stays open (with A5). *(Until the acceptance this bullet ended: "Delivered in the working tree, uncommitted and not staged; awaiting the owner's review.")*

- **V7 accepted** (owner, 2026-11-18): **V7 — REDUCED MOTION: VISUALLY APPROVED BY THE OWNER**, exactly as implemented: the OS `prefers-reduced-motion` detection, its propagation to `SceneRenderer.setMotion`, live preference changes, listener cleanup and remount behaviour, SSR-safe initialization, the CSS guards for `goldPulse` / `crashShake`, and every effect's existing reduced-motion behaviour (§4.3). No source or visual value changed at acceptance. Committed locally as `feat(a11y): honor reduced motion preferences (V7)`, not pushed. **The approval covers the OS-follow behaviour only: it does not close Q12's separate in-app "Reduce effects" toggle, which stays open with A5. Physical-device validation is still pending**: every V7 browser check so far is headless Chrome with an emulated media feature.

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
| Q4 | Sound control | **Answered for LA1 (owner, 2026-11-17):** two icon buttons under the balance, SOUND (effects + ambience) and MUSIC (soundtrack), independent and persisted; no master-mute button. Volume sliders (A5) stay open. *(Until LA1 this read "Open".)* **R1 reconciliation (owner, 2026-11-17):** the SOUND and MUSIC switches, implemented in LA1 and committed in `b5701c6` (pushed), satisfy the sound-control interface the owner currently requests; A5's sound-control part is recorded as implemented by them. Still separately tracked and unresolved: optional volume sliders and the in-app reduced-motion toggle (Q12). This closes neither the complete audio QA (listening, physical devices) nor the licensing and rights work. | A single mute button in TopBar | A5 |
| Q5 | Asset supply and allowed licences | **Approved (owner, 2026-11-16): 100% original sound design created specifically for AQUADIVE.** Delivered in A6 by local synthesis (§8). The rights items in `src/assets/audio/CREDITS.md` §6 still need the owner's confirmation. *(Until A6 this read "Open".)* | The owner supplies or commissions the files. Allowed: CC0, royalty-free commercial; CC-BY only with a credit entry. Not allowed: any NC licence. Every EULA checked for a gambling clause | A6 |
| Q6 | Audio format | **Open, pending device validation.** A6 delivers AAC-LC `.m4a` (the owner's preferred delivery format, 2026-11-16, "subject to verified browser and decoder compatibility"); decoding is verified in desktop Chrome 157 and Edge 157 only. Safari, Firefox and phones are not verified. Owner's planning preference (2026-11-15): AAC-LC in `.m4a`, subject to browser compatibility validation. Not a decision. *(A2: the manifest records no URL, file name or extension, so its shape does not depend on Q6; §7.3.)* | `.m4a` (AAC-LC) only | A6 |
| Q7 | Spectator and Dual Bet audio | **Approved for A4a (owner, 2026-11-15):** the cashout cue plays only for the local player's own slots; crash and jackpot are audible to spectators; identical cashout cues within the same rendered frame merge, never across frames (§7.4). *(Until A4a this read "Open".)* | Crash and jackpot play for everyone; cashout only for the player's own slots; two cashouts in the same tick play one cue | — |
| Q8 | Music | **Superseded (owner, 2026-11-16):** music is approved in principle as a `MusicController` with three synchronized stems; A6.1, M1, M2 and M3 are separate steps, each needing authorization (§1.1). *(Until 2026-11-16 this read as follows.)* **Approved for A4a (owner, 2026-11-15):** music playback and music cue assets are deferred; no `MusicController` or `music.ts` is created; the `music` bus stays available for later use. *(Until A4a this read "Open".)* | Ambience plus a minimal music bed | A later music step (with A6) |
| Q9 | Countdown ticks for the last 3 s | **Approved for A4a (owner, 2026-11-15):** countdown tick audio is deferred; the manifest is not changed for countdown cues. *(Until A4a this read "Open".)* | — (no recommendation; the owner's preference) | A later step, if the owner asks for it |
| Q10 | Effect list F1–F8, one by one; chain tension audio-only | **Partly approved** — F1 and F2 approved 2026-11-16 (V2); F3 and F4 (option A) approved 2026-11-16 (V3) and visually accepted the same day; F8 delivered in CH1 and visually approved by the owner 2026-11-17; **F5 approved for V4 (owner, 2026-11-17: D1 timing on the drawn touchdown, D2 ≈ 1.0 s lifetime provisional, D3 jackpot landing only, D4 `SILT_FX_THEME`); visually accepted by the owner 2026-11-18, exactly as implemented (values final)** *(until the acceptance: "delivered in the working tree, awaiting the owner's visual acceptance")*; **F6 approved for V5 (owner, 2026-11-18: D1 no Canvas camera shake, D2 ≤ 12 High / ≤ 6 Low metal fragments, D3 dark-blue vignette pulse, D4 reduced motion, D5 existing FX preserved); visually approved by the owner 2026-11-18, exactly as implemented, including the cached-vignette refinement (values final)** *(until the acceptance: "delivered in the working tree, uncommitted, awaiting the owner's visual acceptance")*; **F7 approved for V6 (owner, 2026-11-18: start darkened → fade to normal over 0.40 s, `rgb(2, 12, 34)`, opacity 0.14 → 0, High = Low, off under reduced motion); visually approved by the owner 2026-11-18, exactly as implemented (values final)** *(until the acceptance: "delivered in the working tree, uncommitted, awaiting the owner's visual acceptance")* *(until V6: "F7 open, subject to its own approval"; until V5: "F6–F7 open"; until V4: "F5–F7 open"; until CH1's approval: "F5–F8 open")* | Approve F1–F8 as specified in §4.3; chain tension audio-only | V2–V6 (each effect's own step) |
| Q11 | Camera shake on crash (≤ 6 px, ≈ 300 ms); keep the DOM `crash-shake` | **Answered (owner, 2026-11-18, V5 decision D1, option A): no additional Canvas camera shake.** The reserved hook (`cameraShakeOffset`, `Camera.setShake`) is not activated and stays at exactly 0; no viewport movement; the DOM multiplier `crash-shake` is kept exactly as implemented. *(Until V5: "Open"; V1, 2026-11-16: only the offset hook exists, held at 0; the DOM `crash-shake` is unchanged.)* | — (owner's preference; both are specified as optional in V1/V5) | V5 |
| Q12 | Reduced motion: follow the OS and offer an in-app toggle | **Partly implemented (V7, 2026-11-18; visually approved by the owner 2026-11-18; committed locally): the OS setting is followed** (`matchMedia` → `setMotion`, live changes, canvas and DOM). **The in-app toggle stays Open** (with A5); the V7 approval does not close it; until it exists the OS setting alone decides. *(Until the V7 acceptance: "(V7, 2026-11-18, working tree)".)* *(Until V7: "Open"; V1, 2026-11-16: only the internal flag exists, default false; no toggle, no `matchMedia`.)* | Follow the OS setting; an in-app "Reduce effects" toggle together with Q4 | V7, A5 |
| Q13 | Blueprint name | **Approved** — `docs/08_AUDIO_FX_ARCHITECTURE.md` | — | — |
| Q14 | Device QA: which iOS and Android devices | **Open** | — (only the owner can answer) | A-track device gate, V-track performance gate, P7-C |
| Q15 | iOS silent switch | **Approved for A4a (owner, 2026-11-15):** respect it. **LA1 (owner, 2026-11-17):** the soundtrack must play on iPhone; implemented by setting `navigator.audioSession.type = "ambient"` on iOS/iPadOS only, which keeps the silent switch in force for every sound (§7.6 "LA1"); device acceptance pending. *(Until A4a this read "Open". Until LA1 it ended: "no audio-session override is introduced".)* | Respect it (do not set `navigator.audioSession.type = "playback"`) | — (A4b must not add an override either) |
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
| | *F1 as implemented (V2, 2026-11-16; refined and **accepted by the owner** the same day, values final — first values: alpha 0.06–0.15, radius 0.8–1.6 px, full at 0.12):* 48 specks on High / 24 on Low (the first half of the same table); alpha 0.18–0.40 × a smoothstep depth fade (0 at `depthRatio` 0, full at 0.10); radius 1.1–2.2 CSS px; sinking 3–6 px/s; sway 2–6 px at 0.25–0.6 rad/s; parallax factor 0.25–0.50 against the dive on High, none on Low | Environment (after the bubbles) | Speck table built once from an integer hash and a low-discrepancy sequence; one reused layout buffer; wrap area = viewport + 4 px margin | No time-driven motion; parallax halved (High) or none (Low) |
| F2 | **Depth vignette:** edge darkening that grows with `depthRatio` | Background or Environment | One cached radial gradient | Kept (not motion) |
| | *F2 as implemented (V2, 2026-11-16; refined and **accepted by the owner** the same day, values final — first values: 0.45, full at 0.7, clear centre 0.45, quadratic, tone `BG_BOTTOM_ABYSS`):* corner darkening up to 0.60 × smoothstep(`depthRatio` / 0.45); nothing inside 0.30 of the half-viewport, p^1.6 rise to the corners; tone `DEPTH_VIGNETTE_TONE` = rgb(0, 3, 10) (dark blue, never black) | Environment, last (D-V2-2) | One unit-space radial gradient cached per canvas context (`WeakMap`), stretched to the viewport by the transform, so a resize never recreates it; strength is one `globalAlpha` | Kept (not motion) |
| F3 | **Anchor wake:** at most 16 tiny bubbles in world space along the anchor column | Effects | Anchored in world Y, so they stream upward at descent speed by construction. No multiplier in the renderer | Hidden |
| | *F3 as implemented (V3, 2026-11-16; **accepted by the owner 2026-11-16, final**; until then "provisional, owner review pending"):* emission every 20 world px of dive depth (bubble k at depth 20·k, k ≥ 1), each living 320 px of further descent, so at most 16 alive on High; Low keeps every other emission (8). On screen a bubble sits 8 px above the chain's end at the ring plus its age × (1 + its own rise 0.15–0.45), so it is left behind in the water and rises a little; the per-bubble rise breaks the regular grid that would strobe at ≈ 19 px/frame (full speed and boost). Horizontally on the current chain line, 7–12 px to one side (alternating), with a 1.4 px wobble driven by its age. Radius 0.9–1.85 px growing ×1.18 over its life (≤ 2.2 px); alpha 0.28–0.42 × a life envelope (smooth fade-in over the first 20 %, (1 − life)^1.5 fade-out) × a launch fade (smoothstep over `launchProgress` 0.5 → 1); while the ship is in view, faded out 2–12 px under the water surface and never drawn above it | Effects (first, diving only) | Pure function of `worldY`, the anchor pose and the launch progress; no state, timer or randomness; one reused layout buffer, one constant fill style | Hidden |
| F4 | **Water-entry splash** at the waterline as the dive starts | Effects | Pure function of `worldY` crossing the waterline | Hidden |
| | *F4 as implemented (V3, option A, 2026-11-16; **accepted by the owner 2026-11-16, final**; until then "provisional, owner review pending"):* progress p = `worldY` / 120 over the first 120 world px (≈ 0.81 s at the initial 148 px/s), exactly absent at `worldY` 0 and from 120 on. Two flat rings (height 0.2 × width) centred on the drawn waterline above the hawse hole — `waterSurfaceAt` reproduces the ship's surface polyline exactly — growing from 4 px to 30 / 46 px wide (× `shipScale`), ring 2 starting at p 0.25, each over 0.75 of p, peak alpha 0.5 / 0.4 × an envelope (visible maxima ≈ 0.36 / 0.29), stroke 1.1 px in a water blue (`WAKE_FX_THEME.ripple`, rgb(78, 136, 196)); the lower half at the ring alpha, the upper half (above the water, over the hull) at 0.45 of it. Up to 8 bubbles on High / 4 on Low (0.9–1.9 px, alpha 0.30–0.42) rise from just under the hole to the surface and are never drawn at or above it | Effects (after F3, diving only) | Pure function of `worldY`, the pose's hawse hole, the ship's waterline (`WATERLINE`, exported) and scale, and the animation clock for the surface wave; reused ring and bubble buffers | Hidden |
| F5 | **Silt plume** at touchdown: at most 12 soft puffs fading over ≈ 1.5 s | Effects | `shipImpact.elapsed` plus a small exported touchdown helper from `layers/actor.ts` | Single static fade |
| | *F5 as implemented (V4, 2026-11-17; owner decisions D1–D4; **visually accepted by the owner 2026-11-18, final** — touchdown-synchronized start, ≈ 1.0 s lifetime, at most 12 High / 6 Low puffs, one static fading puff under reduced motion, the colour, opacity, movement and spread below are accepted as implemented; physical-device performance validation is still pending; until the acceptance: "provisional, awaiting the owner's visual acceptance"):* starts when the drawn anchor stands on the sand, `anchorTouchdown(camera).seconds` after `shipImpact` (0.3–0.7 s by viewport; computed by `applyLanding` itself on a scratch pose, and equal to the audio host's `anchorTouchdownSeconds`, on which the `floor-thud` hit is timed), at the sand point under the anchor's tip; lives 1.0 s (D2, owner-revised from ≈ 1.5 s so that most of it shows before the chest overlay at 1.4 s after impact). 12 puffs on High / 6 on Low (the first half of the same table; sides alternate, so both halves are balanced); each a flat ellipse (height 0.55 × width) whose horizontal radius grows from 7–11 to 18–30 px, pushed 16–60 px sideways (ease-out) from 1–7 px beside the contact, rising 3–14 px (√ of its life) from 2–5 px above the sand; birth delays 0–0.12 s; peak alpha 0.36–0.52 × an envelope (smooth fade-in over the first 12 % of its life, (1 − life)^1.1 fade-out); each puff is a soft radial gradient (stops 1 / 0.7 / 0.25 / 0 at 0 / 0.35 / 0.7 / 1 of its radius). Colour `SILT_FX_THEME` rgb(208, 200, 178). *(First-pass values, raised the same day before the owner's review because the plume was barely perceptible in zoomed captures: alpha 0.20–0.34, radius 5–9 → 14–24 px, flatness 0.6, fade (1 − life)^1.6, static puff 16 px at 0.24, tone rgb(196, 190, 170).)* Only on the jackpot landing: never on a crash (also when the snapped anchor lands on the sand), a cashout, betting or diving | Effects (first in the jackpot block, under the burst) | Pure function of the time since touchdown, the contact point and the FX settings; puff table built once from an integer hash; one reused layout buffer; one unit-space radial gradient cached per canvas context and placed per puff by the transform; no `shadowBlur`, no filter, no randomness | One static puff (radius 20 px, 4 px above the contact), alpha 0.40 → 0 linearly over the life, no drift or growth |
| F6 | **Crash:** at most 24 metal fragments at the chain break, a short dark vignette pulse, a camera shake of at most 6 px for ≈ 300 ms | Effects + Camera | FX queue, triggered by `crashed` | No shake, no pulse |
| | *F6 as implemented (V5, 2026-11-18; owner decisions D1–D5; **visually approved by the owner 2026-11-18 — final values**, including the cached-vignette refinement; physical-device performance validation is still pending; until the acceptance: "provisional, awaiting the owner's visual acceptance"):* **no camera shake** (D1: the shake hook stays 0, the DOM `crash-shake` unchanged). **Clock:** the E-X7 chain-snap clock itself — `RenderState.chainSnap.elapsed`, 0 on the first frame the chain is drawn broken, the same timestamp the FX queue's crash entry reads; no second crash clock; a remount mid-crash (settled result, elapsed ≥ 2.3 s) shows nothing. **Place:** the E-X7 split point — the upper chain's free end at elapsed 0 (`layoutUpperChain(0, …)` on the prepared break record, cached per break in `layers/effects.ts`; equal within 0.5 px to the detached links' far joint, tested at seven sizes). **Fragments** (D2): 12 High / 6 Low (the first half of the same table), none under reduced motion; directions on the golden angle (± 0.2 rad), so every prefix spreads round the break; each a steel shard 2.4–4.4 × 1.0–1.5 px, body rgb(112, 138, 168) at peak alpha 0.70–0.90 and an upper-edge highlight rgb(214, 228, 244) whose alpha follows the shard's tilt (0.2–1 × the body alpha); thrown 14–34 px outward with water drag (τ 0.09–0.15 s), sinking 3–9 px (quadratic), spinning 5–11 rad/s with decay (τ 0.35 s); each lives 0.50–0.70 s and fades as (1 − life)^1.4. **Vignette pulse** (D3): an aspect-matched radial gradient, clear inside unit radius 0.55 (1 = mid-edge), profile p^1.6 to the corners, tone rgb(2, 12, 34); strength rises from 0 to 0.26 over 0.07 s and eases out quadratically to 0 at 0.6 s (at mid-edge ≤ 0.09). The anchor, the break and the screen centre stay inside the clear zone; the DOM multiplier sits above the canvas. **Reduced motion** (D4): no fragments, no pulse; one static glint (radius 10 px, rgb(196, 214, 236), soft radial) at the break, alpha 0.30 → 0 linearly over 0.6 s. Nothing is drawn from 0.7 s on. | Effects (first, on crashed frames only) | Pure function of the chain-snap elapsed, the break point, the viewport and the FX settings; fragment table built once from an integer hash; one reused layout buffer; two unit-space gradients cached per canvas context; the pulse rasterized once per canvas pixel size into a cached offscreen bitmap and copied 1:1 at the pulse strength (V5 performance refinement, 2026-11-18; rebuilt on resize/DPR; direct gradient fill without a document or above 3840 × 2160 device px); no `shadowBlur`, no filter, no randomness. Colours are module constants in `draw/crash-fx.ts` (`theme.ts` is outside the ratified V5 scope) | One static fading glint at the break; no shake, no pulse, no fragments |
| F7 | **Round-reset dip:** a fade to dark of ≈ 400 ms when betting reopens, replacing today's hard cut from the sea floor to the surface | Effects | FX queue, triggered by `bettingOpened` | Plain crossfade |
| | *F7 as implemented (V6, 2026-11-18; owner authorization; **visually approved by the owner 2026-11-18 — final**, a subtle fade, not a full scene crossfade; physical-device performance verification is still pending; until the acceptance: "provisional, awaiting the owner's visual acceptance"):* **Trigger:** `bettingOpened` → the V1 FX queue's reset entry, stamped on the first frame of the surface view. **Animation:** starts darkened and fades to normal — opacity 0.14 on the first reset frame, then 0.14 · (1 − t / 0.40)² (quadratic ease-out, zero slope at the end), exactly 0 from 0.40 s; no fade-in, no second dip, no crossfade. **Colour:** `rgb(2, 12, 34)`. **Drawing:** one solid `fillRect` over the canvas viewport at that `globalAlpha`, last in the Effects layer, betting view only; the DOM controls above the canvas are not touched. High = Low; reduced motion: nothing. **Timing:** the FX queue is the only reset clock. `SceneRenderer` forwards the queue's own active reset entry to the layers as `FxSettings.reset` (`readonly reset?: { readonly elapsed: number } | null`; renderer-owned, never engine state) right after `fx.update(...)`; no second clock, timer or per-frame copy. | Effects (last, betting view only) | Pure function of the reset entry's `elapsed` and the FX settings; one `save` / `globalAlpha` / `fillStyle` / `fillRect` / `restore` per frame; no gradient, bitmap, blur, shadow, particles or randomness; constants `RESET_FADE_*` in `layers/effects.ts` | Nothing (off) |
| F8 | **Chest burst:** at most 16 gold glints when the chest opens | **DOM / CSS** in `ChestPicker` (it sits above the canvas) | `transform` / `opacity` animations only | Off |
| | *F8 as implemented (CH1, 2026-11-17, pulled forward from V6 by the owner; **visually approved by the owner 2026-11-17, final**; until then "awaiting visual acceptance"):* 12 glints burst from the chosen chest (fixed fan over the upper 260°, 300 ms delay, 28 ms stagger, 900 ms each) and 4 twinkle on the centred multiplier: 16 in total (`CHEST_GLINT_CAP`, `src/ui/components/chest-fx.ts`) | DOM / CSS in `ChestBurst` / `ChestReveal` (inside `ChestPicker`) | `transform` / `opacity` only, one-shot | Off (`prefers-reduced-motion`) |

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
| Per frame while diving | Chain-rattle loop: rate and gain follow the multiplier *(A6.1: off by default, owner decision 2026-11-16; kept behind `{ chainRattle: true }`)*. Ambience low-pass follows `depthRatio`. Tension creaks at fixed multiplier thresholds | F1, F2, F3 |
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

**Import rule (to ratify with A1):** `src/audio` may import only its own modules, the type-only `@/engine` facade and `src/shared`. It never imports `src/ui`, `src/rendering` or React. Only `src/ui/session.ts` constructs it. *(A4b, 2026-11-15: the session constructs it through `src/ui/audio-host.ts`, the only production UI module that imports `src/audio`; §7.5, docs/07 §6.)*

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

// src/rendering/scene-renderer.ts (additions — V1, as implemented 2026-11-16)
trigger(kind: FxKind): void; // "crash" | "reset"; fire-and-forget, stamped on the next frame's animTime
setMotion(opts: { reducedMotion: boolean }): void; // default false; behavior-neutral in V1; since V2 it stops F1's time-driven motion
setQuality(quality: FxQuality): void; // "high" (default) | "low"; behavior-neutral in V1; since V2 "low" halves F1 and drops its parallax
activeFx(kind: FxKind): FxEntry | null; // diagnostics/tests: { kind, startedAt, elapsed }, reused object
fxSettings(): { reducedMotion: boolean; quality: FxQuality; shakeOffset: number };

// src/rendering/camera.ts (V1)
setShake(dy: number): void; // additive screen-Y offset in worldToScreenY; non-finite → 0; V1 always 0
readonly shakeOffset: number;
```

*(Until V1 the `setMotion` line read `setMotion(opts: { reduced: boolean }): void;`; the owner's V1 authorization names the field `reducedMotion`.)*

**V1 queue rules** (`src/rendering/fx-queue.ts`): at most one entry per kind. A trigger is stamped by the next `frame()`. **reset:** `startedAt` = that frame's `animTime`; a re-trigger restarts it; removed after `FX_LIFETIME_SECONDS.reset` (0.4 s, provisional for F7) or when the clock moves backwards. **crash:** holds no time of its own — every frame its `startedAt` is the chain-snap break time (`RenderState.chainSnap.startedAt`, renderer-latched or caller-supplied); a trigger with no break on that frame is stale and dropped; repeated triggers during one break are ignored; removed after `FX_LIFETIME_SECONDS.crash` (= the 2.3 s E-X7 settle time, provisional for F6) and retired until the break ends. Non-finite `animTime` leaves the queue untouched. `cameraShakeOffset(queue, animTime, reducedMotion)` returns 0 (V5 adds the damped sine; reduced motion stays 0). The queue is per renderer, so a remount starts empty (docs/05 §12). *Since V6:* each frame, right after `update`, `SceneRenderer` hands the layers the queue's own active reset entry (the same object, no copy) as `FxSettings.reset`, or null; F7 reads only its `elapsed`.

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
- **Assets (A6, 2026-11-16).** Every cue's `asset` is the URL of its own `.m4a` file in `src/assets/audio/`, imported so the build fingerprints it. Each cue has its own `gain` (the files peak near −2.5 dBFS, so the gain sets the cue's place in the mix), and each loop has `loopStart` 0.15 s and `loopEnd` 0.15 s + its period (§8). A cue with a `null` asset is still valid and *unavailable*: never fetched, never playable, silent. *(Until A6 this read: "**No asset.** Every `asset` is `null`: no URL, file name or extension is recorded (Q5, Q6 open). … A6 fills `asset` in with owner-supplied, licensed files.")*
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
| The multiplier reaches a new tension threshold while diving | `tension-creak-1` (odd levels) or `tension-creak-2` (even levels). *A-OWN (owner, 2026-11-17): off by default; only with `{ tensionCreaks: true }`* |
| `bettingOpened`, `roundEnded`, `stateChanged`, `commandRejected`, `engineError` | None (not subscribed) |

**Loops by phase.** Loops follow the phase, not events.
- `idle`: `ambience-surface`, with no filter.
- `diving`: `ambience-underwater`, its low-pass following the depth, and `chain-rattle`, its gain and rate following the multiplier.
- **A6.1 (owner, 2026-11-16): the rattle is off by default.** `createAudioDirector(events, audio, options?)` drops `chain-rattle` from the diving loops unless `options.chainRattle` is true. `DISABLED_BY_DEFAULT` (`["chain-rattle"]`) lists it, and the A4b host passes the manifest's cues minus that list to `loadAll`, so the rattle is never fetched or decoded. Its manifest entry, file, gain and rate curves and stop fades are unchanged and still tested with the rattle on. `chain-unspool` and `chain-snap` are one-shots and are not affected.
- **A-OWN.1 (owner report, 2026-11-17): the sea-floor thud is timed on the anchor's touchdown.** `AudioFrame.seaFloor` (from the host: the renderer's impact clock and the touchdown computed for the canvas size by `src/ui/anchor-touchdown.ts`) holds the `shipImpact` thud until `elapsed ≥ touchdownS − FLOOR_THUD_HIT_S` (0.3 s); at most `FLOOR_THUD_MAX_WAIT_S` (1 s); without `seaFloor` it plays on the event. `jackpot-stinger` stays on the event.
- **A-OWN (owner, 2026-11-17): the tension creaks are off by default.** `options.tensionCreaks` (default false) gates both creaks; the threshold tracking still runs, so turning it on restores the old behaviour exactly. `DISABLED_ONE_SHOTS_BY_DEFAULT` lists them, and `DISABLED_CUES_BY_DEFAULT` (the rattle and both creaks) is what the host leaves out of `loadAll`.
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

### 7.5 Audio session integration (A4b) [OWNER]

**Scope.** `src/ui/audio-host.ts` is the only production `src/ui` module that imports `src/audio` (the import exception, docs/07 §6). One `AudioHost` per `GameSession`. It owns the `AudioManager`, the `SoundBank` and the `AudioDirector`; the session owns the sound settings store and passes it in. No `src/audio` module changed in A4b.

**Construction (SSR-safe).** `createAudioHost({ events, settings, … })` creates the manager (no context), the bank (the late-bound resolver of §7.3) and the director, which subscribes to the engine bus at once and is **paused** at once, so nothing is buffered while no canvas is attached. It subscribes to the settings store and to the bank's `onReady` (→ `director.wake()`, §14 risk 13), and applies the current settings. It reads no `window`, `document`, storage, `fetch` or `AudioContext`. The session constructs it last, after every settlement listener.

**Settings bridge.** `setMuted(muted)` and `setBusGain(bus, AUDIO_MIX[bus] × volume)` for `master`, `music`, `ambience` and `sfx`, at construction and on every settings change. `AUDIO_MIX` (A6, 2026-11-16) is `master` 1, `music` 1, `ambience` 0.5, `sfx` 0.7, set from the measured levels of the A6 files (§8) and **provisional until the owner's listening pass**. *(Until A6: `1.0` on every bus, neutral provisional engineering defaults.)* *(M-OWN set `music` 0.5; A-OWN, 2026-11-17, set `ambience` 0.2 at the owner's request.)*

**Attach** (from `attachCanvas`, before the driver starts; idempotent while attached):
1. `restore()` the saved settings, once per host;
2. apply them;
3. `bank.loadAll()`, once per host (the bank also deduplicates; with the null manifest nothing is fetched);
4. install the listeners, capture and passive: `pointerdown`, `keydown`, `touchend`, `pagehide` and `pageshow` on `window`, `visibilitychange` on `document` (all or none), then apply the current visibility.

**Gesture → unlock.** The handler restores (if not yet done) and applies the settings, and calls `unlock()` **only if both succeeded**, so a persisted mute or volume is on the manager before the context exists (§14 risk 14). The gesture listeners stay installed while attached: `unlock()` returns at once once unlocked, and a later gesture re-unlocks after an interruption (the manager re-locks itself) or a refused resume. `onUnlockRequired` is not needed. **Risk 17 stays open:** no resume retry, `unlock()` unchanged.

**Visibility.** `visibilitychange` to hidden, or `pagehide` → `suspend()`; visible again, or `pageshow` → `resume()` (the manager resumes only if unlocked and not muted).

**Frames.** The driver sink's `frame` keeps the `RenderState` and `RenderTime` it receives; `sync` writes the round store, then calls `host.update({ render, time, state })` with the public state `sync` was given. The host fills one reused `AudioFrame` (`phase`, `multiplier` and `boost` from the public state; `depthRatio` from the render state; `dt` = `frameDt`) and calls `director.update()`. **No extra engine read.** The first frame after an attach ends the director's pause.

**Detach** removes every listener of the attachment and pauses the director (its loops fade out over `DETACH_FADE_S`). The manager, the bank, the decoded cues and the unlock survive. A detach from an earlier attachment cannot detach a newer one (React StrictMode order).

**`GameSession.dispose()`** disposes the **audio subsystem only**: the director (its seven listeners), the browser listeners, the settings and `onReady` subscriptions, the bank, then the manager (bank first, §7.3). Idempotent. The engine, driver, stores, `submit` and `attachCanvas` keep working; a later attach renders silently.

**Exception isolation.** No host method throws. Each step is guarded and logged once per kind with `console.error`. A step's lifecycle flag (restored, applied snapshot, load started, listeners installed) is set **only after the step succeeded**, so a failure is retried by the next attach (or, for the settings, the next gesture) and never leaves a duplicate. A failed listener installation is rolled back completely. The sink also wraps `host.update()` in a try/catch, so audio can never stop `requestAnimationFrame` or reach settlement.

**Limitations.** Silent until A6 (every asset is `null`). Events between an attach and its first frame are dropped (§7.4; that frame advances zero time). jsdom has no Web Audio: the manager logs one warning per session on the first gesture (D10, tolerated). Proven against fakes and jsdom only; no real-browser or device check yet (Q14).

### 7.6 Main soundtrack: the music stream (M-OWN) [OWNER]

**Scope.** One soundtrack, `MUSIC_MAIN` (`src/audio/music.ts`), streamed. The earlier three-stem plan (decisions 2–8 of 2026-11-16) is deferred and not built.

**Graph.** `HTMLAudioElement` (never in the document) → `MediaElementAudioSourceNode` → stream gain → `music` bus → `master` → limiter → output. The stream gain is `track.gain × handle gain` (the duck). The `music` bus gain is `AUDIO_MIX.music × the user's music volume`, so the settings and the duck never touch the same node.

**`AudioManager.stream(options)`** returns a `StreamHandle` (`setGain`, `setActive`, `stop`, `isAudible`).

- **One stream.** While one is live, `stream()` returns the same handle. One element has one source node for its whole life.
- **Lazy.** No element and no request exist until the stream may play: inside `unlock()` (the user gesture) or later. `play()` is called inside that gesture. The element feeds the graph, not the output, so it is heard only once the context runs.
- **Run state.** The element plays while the manager is unlocked, not muted and not host-suspended, and the caller has not held it. Otherwise it is paused and keeps its position. Mute, a hidden page, an interruption and a refused context resume all pause it.
- **Hold** (`setActive(false)`, canvas detach): the gain fades to 0 over `STREAM_HOLD_FADE_S` (50 ms); the element then pauses on its own `timeupdate` event (no timer). `setActive(true)` plays on from the same position.
- **Retry.** A refused `play()` (no user activation), a pause the manager did not ask for (a media key, the system) and a loading error are retried inside the next `unlock()` gesture; loading at most `STREAM_MAX_RETRIES` (2) times. Outside a gesture they wait.
- **Failure.** No stream call throws. A loading error is logged once with `console.warn`. Without a media element, or without `createMediaElementSource`, the stream is silent. Voices are never affected.
- **Release.** `stop()` and `dispose()` pause the element, remove its listeners, drop its `src`, call `load()` and disconnect both nodes.
- **Not used.** No `navigator.audioSession`, no `navigator.mediaSession`, no second context, no decode of the file.

**Director.** With `{ music: track }` it requests the stream once, on its first frame, in any phase, and keeps the handle. No phase or event touches it, so a round transition cannot restart it. `pause()` holds it; the next `update()` plays on; `dispose()` stops it. It reads no bet, balance or result.

**Ducking** (`MUSIC_DUCK`, provisional). The duck of a kind starts when its cue plays: `crash-boom` → crash, `cashout-coins` → cashout, `jackpot-stinger` → jackpot.

| Kind    | Factor | Attack | Hold  | Release |
| ------- | ------ | ------ | ----- | ------- |
| crash   | ×0.40  | 80 ms  | 1.6 s | 1.5 s   |
| cashout | ×0.55  | 50 ms  | 0.9 s | 1.0 s   |
| jackpot | ×0.35  | 100 ms | 2.8 s | 2.0 s   |

Attack and release are linear and advance by `frame.dt`. The level is the lowest of the active kinds. A second trigger of a kind continues from its current level. The director sends a level when it moves by more than 0.005 and always lands on exactly 1; the manager applies each with `setTargetAtTime` (15 ms), so a long frame cannot make a step. The ambience duck (§7.4) is unchanged.

**iOS silent switch (Q15, D8).** Findings, from WebKit's bug tracker and source:

- Web Audio alone is in the system's "ambient" category and obeys the silent switch; audio and video elements are in "playback" and ignore it (WebKit bugs 237322 and 252746, statements by WebKit engineers).
- The category is chosen for the whole page: if any audible media element plays, "playback"; if only Web Audio plays, "ambient" (`MediaSessionManagerCocoa::updateSessionState`).
- An element that feeds a `MediaElementAudioSourceNode` still counts as an audio element (`HTMLMediaElement::mediaType` does not look at the source node).
- So on iOS the streamed soundtrack would move every sound of the game, effects and ambience included, to "playback": the silent switch would stop working. That overrides Q15.
- The only documented control is `navigator.audioSession.type` (Safari 16.4 and later). D8 excludes changing the audio session without an owner decision.

**Implemented (the browser-safe portion):** `browserMusicElement` in the host returns no element on iPhone, iPad and iPod, including an iPad in desktop mode. The music is off there; effects and ambience are exactly as before; no audio-session API is touched. This is derived from source reading, not from a device test.

**Alternatives for the owner (none implemented):**

1. Keep music off on iOS and iPadOS (the current state).
2. Set `navigator.audioSession.type = "ambient"` on iOS: the documented API; music would play and the silent switch would silence everything. It changes the audio session, so it needs the owner's approval, and a device test.
3. On iOS only, decode the soundtrack into an `AudioBuffer` and loop it in Web Audio: stays "ambient" with no session change, but holds about 56 MB of decoded audio, which D1 and D7 exclude.
4. Change Q15 and let music, and with it all sound, ignore the silent switch on iOS.

**LA1 (owner, 2026-11-17): alternative 2 implemented.** The owner required the soundtrack on iPhone and asked for a supported way to keep Q15.

- **What runs:** `prepareAmbientAudioSession` (audio host) sets `navigator.audioSession.type = "ambient"` on iOS and iPadOS, once, at the first attach (before any gesture, so before the AudioContext exists), and again in `browserMusicElement` before the element is made. It reads `audioSession` on those devices only. Without the API (iOS before 16.4) no element is made: music stays off there, as before.
- **Why it satisfies Q15:** the API exists to choose the page's audio category; "ambient" is the category that obeys the silent switch and mixes with other audio. WebKit applies the page's type as a category override in place of the automatic choice (source reading, as for the findings above; not yet observed on a device), so a playing soundtrack no longer moves the page to "playback", and the silent switch silences the soundtrack, the effects and the ambience alike. Web Audio alone was already ambient, so the effects behave as before.
- **Implications for the owner (device-dependent):** (1) in Silent Mode the soundtrack is silent too; (2) "ambient" mixes with other apps' audio, so a podcast or music app keeps playing under the game instead of being paused; (3) audio stops when the screen locks (ambient does not play in the background), which matches the existing visibility suspend; (4) nothing here was observed on a physical iPhone: Chrome has no Audio Session API, so the real-browser checks used a stub and prove only the call order. The owner's iPhone test is the acceptance gate.
- **Unchanged:** one AudioContext, one media element and one `MediaElementAudioSourceNode`, created inside the START GAME press; native loop; the mix and the ducks; visibility, interruption and retry handling (§7.6 above). Never "playback", no `mediaSession`.
- **The MUSIC switch:** off holds the stream through the director (`setMusicEnabled(false)`: fade, pause on `timeupdate`, position kept) and zeroes the `music` bus; off from the start means the stream is never requested, so the 3.53 MB file is not downloaded. On plays the same element on, synchronously inside the press (iOS accepts the `play()`).

**Loop, measured (D2).** Headless Chrome 157 and Edge 157, Windows, three passes each, recording the element's output through an `AudioWorklet`: at the native loop point there is a quiet gap of 20–25 ms (below −66 dBFS) that contains 3–9 ms of digital silence. No click: the largest sample step in the recording is the music's own. The file has no leading or trailing silence, and its last 2 s are about 5 dB quieter than its first 2 s, so the level rises at the wrap. Whether this is audible is for the owner's listening pass. No other strategy is implemented.

**Budgets (D7).** The decoded SFX and ambience budget is unchanged. The music is a separate lazy download of 3 527 200 bytes after the first gesture, by one ranged request. A full decode would hold 56 409 040 bytes; streaming avoids it.

**Limitations.** Verified in desktop Chrome and Edge only (headless). Not tested: Safari, Firefox, Android, any physical device. Chrome may list the tab in its media controls, and a hardware media key can pause the music; it plays on at the next gesture. A soundtrack served from another origin would need CORS headers and `crossOrigin`; the asset is same-origin today.

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
- **A-OWN as delivered (2026-11-17, working tree, awaiting the owner's listening feedback).** 14 cues play the owner's recordings, byte-identical copies in `src/assets/audio/owner/` (MP3 or AAC-LC `.m4a`, stereo, 44.1 or 48 kHz, as supplied); `crash-boom`, both creaks and the rattle keep their A6 files. Replaced one-shots are loudness-matched to their A6 cues; the beds keep gain 1 and loop between their edges (surface 0.02–86.79 s, underwater 0–60 s). Totals for the cues the game loads: 3.32 MB download and about 69 MiB decoded at 48 kHz, over the §9 targets. Measurements, mapping, levels and the rights status: `src/assets/audio/CREDITS.md` §9. Q6 note: MP3 is now delivered alongside `.m4a`; both decode in Chrome 157 and Edge 157; Safari, Firefox and phones are still not verified.
- **A6 as delivered (2026-11-16, working tree, awaiting the owner's listening approval).** Owner decision Q5: 100% original sound design. The 18 cues are computed by `src/assets/audio/production/synth.mjs` (Node standard library only: seeded noise, sine partials, filters, a feedback-delay reverb), with no recording, sample, library or AI audio service, and encoded by `production/encode.ps1` with the Windows Media Foundation AAC encoder: AAC-LC, mono, 48 kHz, 96 kbit/s. Totals: **897 565 bytes** (target 1.5 MB) and **about 13.9 MB decoded** at 48 kHz (target 20 MB). Verified by decoding every file in headless Chrome 157 and Edge 157: all decode; highest peak −2.35 dBFS; no clipping; sample-aligned with the masters; loop jumps no larger than an ordinary sample step. In the real game (dev server, headless Chrome, real clicks) all 18 cues started on their events over crash, cash-out, and jackpot-plus-chest rounds. **Not done:** no person has listened to the files, and no Safari, Firefox or physical-device test was run. Per-cue provenance, measurements and the rights items that need the owner's confirmation are in `src/assets/audio/CREDITS.md`. Manifest gains: clinks 0.5; unspool 0.55; splash 0.9; creaks 0.7; chime 0.45; cashout 0.7; snap 0.9; boom 1; thud 1; stinger 0.9; shimmer 0.4; lid 1; coin burst 0.8; rattle 0.45; beds 1. **Director:** no change was needed to make every cue play; its values (§7.4) stay provisional, and any tuning after the listening pass is a separate A6.1. *(Until A6 the next bullet was the rule in force.)*
- **The agent generates no assets** and invents no file names, sources or licences. *(Superseded for A6 by the owner's Q5 decision, 2026-11-16: the agent produced the assets by local synthesis under the owner's explicit authorization. It still invents no licence, source or ownership claim.)* The code works silently when manifest entries are missing, so engineering (A1–A4, V1–V7) does not wait for assets. A6 cannot start until the owner supplies files and approves their licences.

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

*(Owner priority change, 2026-11-16, at the V3 closeout: the order after V3 is now **A6 → A5 → V4 → V5 → V6 → V7 → P7-C**. V4–V7 are deferred, not cancelled; every row below is unchanged. A5 still follows A6.)*

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
| A4b | `feat(ui): audio session integration (A4b)` | Ratified 2026-11-15: C `src/ui/audio-host.ts`, `src/ui/audio-host.test.ts`, `src/ui/session.audio.test.ts`, `src/ui/screen.audio.test.tsx`; M `src/ui/session.ts`, `src/ui/README.md`, `src/audio/README.md`, `docs/04`, `docs/07`, `docs/08`, `docs/14`, `docs/15`, `docs/16` | None (no assets yet) | — (authorized 2026-11-15, §1.1; import exception ratified; settings before unlock implemented, §7.5). *Until A4b the scope read "Proposed, not ratified", without `screen.audio.test.tsx`, blocked by the authorization, the UI scope, the import exception and risk 14* |
| V1 | `feat(rendering): FX queue, camera shake, motion flag` | As implemented 2026-11-16: C `src/rendering/fx-queue.ts`, `src/rendering/fx-queue.test.ts`, `src/ui/session.fx.test.ts`; M `src/rendering/scene-renderer.ts`, `src/rendering/camera.ts`, `src/rendering/scene-renderer.test.ts` (V1 block added), `src/ui/session.ts`, `docs/08`, `docs/14`, `docs/15`, `docs/16` | None | — (authorized 2026-11-16, §1.1; committed `a9bdf35`, on `origin/develop` — R1, verified 2026-11-17; until then "working tree, uncommitted"). *Until V1: "C `src/rendering/fx-queue.ts` + test; M `scene-renderer.ts`, `camera.ts`, `src/ui/session.ts` · Blocked by: Authorization; renderer + UI scope; Q11, Q12"* |
| V2 | `feat(rendering): marine snow and depth vignette` | C `src/rendering/draw/particles.ts` + test; as implemented 2026-11-16: M `src/rendering/layers/environment.ts`, `src/rendering/theme.ts`, `src/rendering/render-state.ts` (FX argument), `src/rendering/scene-renderer.ts` (forwarding), `src/rendering/scene-renderer.test.ts`, `src/rendering/fx-queue.test.ts` (the V1 "flags are inert" pin, superseded by V2); `layers/background.ts` **not** modified (D-V2-2) | F1, F2 | **Authorized 2026-11-16**; refined values **visually accepted by the owner 2026-11-16**; committed `3878865` (D-T1 `0bd6ee2`), on `origin/develop` — R1, verified 2026-11-17 *(until then: "delivered in the working tree, uncommitted (commit prepared, not executed)")* |
| V3 | `feat(rendering): anchor wake and entry splash` | As implemented 2026-11-16: M `src/rendering/draw/particles.ts`, `src/rendering/draw/particles.test.ts` (F3, F4 and the Effects-layer tests), `src/rendering/layers/effects.ts`, `src/rendering/theme.ts` (`WAKE_FX_THEME`), `src/rendering/draw/ship.ts` (`WATERLINE` export only), `docs/08`, `docs/14`, `docs/15`, `docs/16` | F3, F4 | **Authorized 2026-11-16** (Q10/V3); **visually accepted by the owner 2026-11-16** (values final); committed `a9e9fdd`, on `origin/develop` — R1, verified 2026-11-17 *(until then: "committed locally, not pushed")*. *(Until the closeout: "delivered in the working tree, uncommitted; values provisional, owner visual review pending.")* *Until V3: "M `src/rendering/draw/particles.ts`, `src/rendering/layers/effects.ts` + tests · Blocked by: Authorization; renderer scope; Q10 (F3, F4)"* |
| V4 | `feat(rendering): landing silt plume` | C `src/rendering/draw/landing-fx.ts`, `src/rendering/draw/landing-fx.test.ts`; M `src/rendering/layers/actor.ts` (touchdown helper export only), `src/rendering/layers/effects.ts`, `src/rendering/theme.ts` (`SILT_FX_THEME` only), `docs/08`, `docs/14`, `docs/15`, `docs/16`. **Outside the ratified list, reported to the owner:** `src/rendering/draw/particles.test.ts` (the V3 jackpot-burst reference now includes the plume under the burst; 3 lines) | F5 | **Authorized 2026-11-17 (owner decisions D1–D4; file scope ratified); visually accepted by the owner 2026-11-18 (values final); the `particles.test.ts` adjustment authorized by the owner; committed locally as `feat(rendering): add accepted landing silt plume (V4)`, not pushed.** Physical-device performance validation pending. *(Until the acceptance: "delivered in the working tree, uncommitted; awaiting the owner's visual acceptance".)* *(Until V4: "Authorization; renderer scope; Q10 (F5)")* |
| V5 | `feat(rendering): crash effect and camera shake` | As implemented 2026-11-18: C `src/rendering/draw/crash-fx.ts`, `src/rendering/draw/crash-fx.test.ts`; M `src/rendering/layers/effects.ts`; docs 08, 14, 15, 16. No camera shake (Q11 answered: option A), so `camera.ts`, `fx-queue.ts` and `scene-renderer.ts` are unchanged | F6 | **Authorized 2026-11-18 (owner decisions D1–D5); visually approved by the owner 2026-11-18 (values final, including the cached-vignette refinement); committed locally as `feat(rendering): add accepted crash FX (V5)`, not pushed.** Physical-device performance validation pending. *(Until the acceptance: "delivered in the working tree, uncommitted, not staged; awaiting the owner's visual acceptance".)* *(Until V5: "Authorization; renderer scope; Q10 (F6), Q11")* |
| V6 | `feat(rendering): round-reset fade (V6)` | As implemented 2026-11-18: M `src/rendering/render-state.ts` (`FxSettings.reset`), `src/rendering/scene-renderer.ts` (reset handoff), `src/rendering/layers/effects.ts` (F7); C `src/rendering/layers/reset-fade.test.ts`; M `src/rendering/fx-queue.test.ts`, `src/rendering/scene-renderer.test.ts`; `.gitignore` (`qa/v6-reset-transition/`); docs 08, 14, 15, 16. No UI file: F8 was delivered in CH1 | F7 | **Authorized 2026-11-18 (owner; the two extra renderer files ratified for V6 only); visually approved by the owner 2026-11-18 (values final); committed locally as `feat(rendering): add approved round reset transition (V6)`, not pushed.** Physical-device performance verification pending. *(Until the acceptance: "delivered, uncommitted, awaiting visual acceptance".)* *(until V6: "`feat: round-reset transition and chest burst` · M `src/rendering/layers/effects.ts`, `src/ui/components/ChestPicker.tsx`, `src/styles.css` + tests · F7, F8 · Authorization; renderer + UI scope; Q10 (F7, F8)")* |
| V7 | `feat(a11y): reduced motion` | M `src/styles.css` (guards), `src/ui/session.ts` (matchMedia → renderer) + tests | Motion reduced when the OS asks | **Authorized 2026-11-18 (owner); visually approved by the owner 2026-11-18 (OS-follow behaviour, exactly as implemented); committed locally as `feat(a11y): honor reduced motion preferences (V7)`, not pushed.** Physical-device validation pending; the Q12 in-app toggle stays open. *(Until the acceptance: "delivered in the working tree, uncommitted and not staged; awaiting the owner's review".)* As implemented: M `src/ui/session.ts` (`matchMedia` → `setMotion`), M `src/styles.css` (`prefers-reduced-motion` guards for `goldPulse` / `crashShake`); C `src/ui/session.motion.test.ts` (20 tests), C `src/ui/reduced-motion.css.test.ts` (6 tests); `.gitignore` (`qa/v7-reduced-motion/`); docs 08, 14, 15, 16. Q11 answered (V5: `crash-shake` kept in normal motion); Q12 partly (OS only). *(Until V7: "Authorization; UI scope; Q11 (keep `crash-shake`?), Q12")* |
| A6 | `feat(audio): licensed sound assets and mix` | C `src/assets/audio/*`, `src/assets/audio/CREDITS.md`; M `src/audio/manifest.ts` | **Sound** | Authorization; **Q5 (assets supplied, licences approved)**; Q6, Q8. **R1 (verified 2026-11-17):** A6, A6.1, A-OWN (with A-OWN.1, A-OWN.2), M-OWN and IOS-AUDIO are committed together in `6133636` (pushed), not as this row's single commit; listening and device acceptance and the rights confirmations (CREDITS §6, §8, §9.5) remain open |
| A5 | `feat(ui): sound control` | C `src/ui/components/SoundControl.tsx` + DOM test; M `src/ui/components/TopBar.tsx`, `src/ui/strings.ts` | Sound toggle | Authorization; UI scope; Q4, Q12. **R1 (owner, 2026-11-17):** the sound-control interface the owner requests is implemented by LA1's SOUND and MUSIC switches (`src/ui/components/SoundToggles.tsx`, in `b5701c6`, pushed), not by this row's planned `SoundControl.tsx`. Open and tracked separately: optional volume sliders; the in-app reduced-motion toggle (Q12) |
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
| V1 | **Authorized 2026-11-16.** C `src/rendering/fx-queue.ts`, C `src/rendering/fx-queue.test.ts`; M `src/rendering/scene-renderer.ts` (`trigger`, `setMotion`, `setQuality`, `activeFx`, `fxSettings`), M `src/rendering/camera.ts` (`setShake` offset), M `src/rendering/scene-renderer.test.ts` (one V1 test block appended; the E-X7 tests are unchanged). `render-state.ts` is not changed by V1 |
| V2 | **Authorized 2026-11-16.** C `src/rendering/draw/particles.ts`, C `src/rendering/draw/particles.test.ts`; M `src/rendering/layers/environment.ts`, M `src/rendering/theme.ts` (FX colour tokens only), M `src/rendering/render-state.ts` (`FxSettings`, the `RenderLayer` FX argument only), M `src/rendering/scene-renderer.ts` (reused FX settings object, forwarding only); tests: M `src/rendering/scene-renderer.test.ts`, M `src/rendering/fx-queue.test.ts`. `src/rendering/layers/background.ts` is **not** modified (D-V2-2). *(Until 2026-11-16 this row listed `layers/background.ts` and not `render-state.ts` / `scene-renderer.ts`.)* Separately, D-T1: M `src/rendering/layers/chain-snap.test.ts` (test only) |
| V3 | M `src/rendering/draw/particles.ts`, M `src/rendering/draw/particles.test.ts`, M `src/rendering/layers/effects.ts` |
| V4 | C `src/rendering/draw/landing-fx.ts`, C `src/rendering/draw/landing-fx.test.ts`; M `src/rendering/layers/actor.ts` (**touchdown helper export only**; no drawing change), M `src/rendering/layers/effects.ts` |
| V5 | C `src/rendering/draw/crash-fx.ts`, C `src/rendering/draw/crash-fx.test.ts`; M `src/rendering/layers/effects.ts` |
| V6 | M `src/rendering/layers/effects.ts` (F7); **ratified 2026-11-18 for V6 only:** M `src/rendering/render-state.ts` (the optional read-only `FxSettings.reset` entry), M `src/rendering/scene-renderer.ts` (`reset: null` and the handoff after `fx.update`) *(until V6: "M `src/rendering/layers/effects.ts` (F7)")* |

**Excluded from E-X5:** `src/rendering/render-state.ts` (except V6's ratified `FxSettings.reset` field); `draw/chain.ts`, `draw/anchor.ts`, `draw/ship.ts`, `draw/sea-floor.ts`, `draw/sea-floor-art.ts`, `draw/creatures.ts`, `draw/impact-fx.ts`; `layers/world.ts`, `layers/presentation.ts`; `assets.ts`, `constants.ts`; every existing renderer test except as named above. Changing one of them needs a separate decision.

### 13.2 UI exception — proposed **UI-X1** (Phase 7 touches to the approved Phase 6 UI)

| Step | Proposed file scope |
|---|---|
| A3 | **Ratified 2026-11-15 (D2).** C `src/ui/store/sound-settings-store.ts`, C `src/ui/store/sound-settings-store.test.ts`; M `src/ui/README.md`; M `docs/07_UI_ARCHITECTURE.md` (one row in the §9 store table) |
| A4 | **A4b, ratified 2026-11-15:** C `src/ui/audio-host.ts` (director, unlock and visibility wiring, settings bridge), `src/ui/audio-host.test.ts`, `src/ui/session.audio.test.ts`, `src/ui/screen.audio.test.tsx`; M `src/ui/session.ts` (construct the host, driver-sink `AudioFrame`), `src/ui/README.md`, `docs/07`. *Until A4b: "M `src/ui/session.ts` (construct the director, unlock and visibility wiring, driver-sink `AudioFrame`); M or C session tests for the wiring"* |
| V1 | **Authorized 2026-11-16.** M `src/ui/session.ts` (forward `crashed` / `bettingOpened` to `SceneRenderer.trigger`; `CanvasRenderer` gains an optional `trigger`), C `src/ui/session.fx.test.ts` |
| V6 | None — F8 was delivered in CH1 (2026-11-17); V6 is F7 only and touches no UI file *(until V6: "M `src/ui/components/ChestPicker.tsx` (F8 only), M `src/styles.css` (F8 keyframes) + DOM test")* |
| V7 | **Authorized 2026-11-18.** M `src/styles.css` (`prefers-reduced-motion` guards for `crashShake` / `goldPulse`), M `src/ui/session.ts` (`matchMedia` → `setMotion`); tests: C `src/ui/session.motion.test.ts`, C `src/ui/reduced-motion.css.test.ts`. No other production file |
| A5 | C `src/ui/components/SoundControl.tsx` + DOM test; M `src/ui/components/TopBar.tsx`, M `src/ui/strings.ts` |

**Excluded from UI-X1:** `src/ui/store/wallet-store.ts` (M1 deferred, not closed) and every other money path; `bet-input-store.ts`, `round-store.ts`, `notification-store.ts`, `payout.ts`, `stake.ts`; layout and responsive structure (`GameScreen.tsx`, `scene-fit.ts`); `src/components/AbyssAnchor.tsx`. The approved Phase 6 behavior, layout and visuals stay as approved. The existing DOM characterization pins stay green; any pin that would change stops the commit.

### 13.3 Not an exception

- `src/engine` and `src/shared`: **no change in Phase 7** [OWNER]. There is no exception to request.
- `src/audio` and `src/assets/audio`: new Phase 7 territory, not frozen. Each step still changes only the files listed in §12 for it.

### 13.4 Ratified renderer exception — **E-X7** (Chain Snapped animation, 2026-11-16) [OWNER]

A strictly rendering-only exception to the Phase 7 renderer restrictions, ratified by the owner's E-X7 implementation authorization. It is not part of E-X5 and does not start V1.

- **Scope:** `src/rendering/render-state.ts`, `scene-renderer.ts`, `layers/actor.ts`, `layers/chain-snap.ts` (new), `layers/chain-snap.test.ts` (new), `draw/chain.ts`, `draw/chain.test.ts`, narrowly scoped tests of the changed renderer contract (`scene-renderer.test.ts`, new), and docs 08, 14–16. **Excluded:** `src/engine`, `src/shared`, `src/ui`, `src/audio`, `draw/anchor.ts`, `draw/ship.ts` and every image asset.
- **Behavior:** on entering `crashed` the chain breaks four links above the anchor (fewer on a short chain). The anchor and those links fall away (water drag; near the sea floor the existing landing); the upper chain recoils, a wave runs up it, it swings with decreasing amplitude and hangs still by 2.3 s. The engine's 2.4 s crashed phase, the crack overlay, crash audio, the CHAIN SNAPPED banner, the jackpot landing and every other phase are unchanged.
- **Crash clock and V1:** `RenderState.chainSnap` (optional, `{ startedAt, elapsed }` in `animTime`) is renderer-owned; the engine never sets it. `SceneRenderer` latches it on the first rendered crashed frame (up to one frame after the engine transition — not claimed synchronous), resets it on leaving `crashed`, and shows the settled result after a remount mid-crash or a backwards clock. A caller-supplied `chainSnap` wins over the renderer's own clock. F6's fragments, if approved, would anchor to the same break.
- **As built in V1 (2026-11-16):** the direction is reversed from the plan written here before V1 ("V1's FX queue … can stamp the crash once and the latch in `SceneRenderer.withChainSnap` is removed"). The latch **stays** the single crash clock, and the FX queue's crash entry reads its `startedAt` from it every frame. Reason: the smallest change, with the accepted E-X7 behavior (remount mid-crash, backwards clock, latch on the first rendered crashed frame, caller-supplied `chainSnap`) preserved exactly and no dependency on the trigger arriving. Verified by draw-call equivalence through the real layers (docs/15, "V1").
- **Status:** visually reviewed and **fully accepted by the owner, 2026-11-16**.

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
13. **A pending loop waits for the next manager call** (recorded in A2, 2026-11-15, §7.3). When a cue finishes loading, the manager is not told; the loop starts at its next call. The bank's `onReady` lets A4 make that call at once. If A4 neglects it, a bed starts late, up to the next handle update or play. Mitigation: A4's per-frame handle updates, and a test in A4 that a bed starts on the frame its cue becomes ready. A public `AudioManager.refresh()` is the alternative; it needs its own approval. *(A4a, 2026-11-15: the director's `wake()` re-sends every loop value and starts a waiting loop at once, tested on the real manager and bank (§7.4). Wiring `onReady → wake()` is A4b's.)* *(A4b, 2026-11-15: wired in the audio host, §7.5, and tested on the real manager and bank.)*
14. **Settings may be restored after the first gesture** (owner requirement, A3, 2026-11-15, §3.5). Nothing guarantees that `restore()` runs before the first user gesture. If the session unlocks audio first and applies the settings later, a muted user could hear sound briefly, or at the wrong volume. A4 must apply the persisted mute and volumes to the `AudioManager` before the unlock or any playback, and test it. *(A4a does not touch settings; this stays an A4b requirement.)* *(A4b, 2026-11-15: implemented, §7.5. The host restores and applies the settings on attach, and a gesture unlocks only after both succeeded; tested at host, session and DOM level.)*
15. **A loop that starts at once begins at full cue level for about 15 ms** (recorded in A4a, 2026-11-15, §7.4). `AudioManager.loop()` has no initial gain, so the director's first `setGain` follows the start and ramps. It is silent with the null manifest, and is masked at the dive start by the splash. Mitigation: judge it in the A6 listening pass. The fix is an initial gain for `loop()`, an `AudioManager` change that needs its own approval. *(Resolved in A4a.1, 2026-11-15: `loop(cue, options)` puts the initial gain, rate and filter on the nodes before the source starts, §7.2.)*
    **15b. A bed's fade-in could complete before its voice played** (recorded in A4a.1, 2026-11-15; reading confirmed by the owner). The director raised a bed's level every frame, whether a voice played or not. A bed waiting for the unlock, decoding or a slot, or held by mute, host suspension, an interruption or a refused resume, could reach level 1 and then start or resume at full level. *Resolved in A4a.1: the fade advances only while `isAudible()` is true (§7.2, §7.4).*
16. **Remote cashouts would play the local cue** (recorded in A4a, 2026-11-15). `cashedOut` carries no owner, and in Phase 7 every cashout is local. Phase 8 must add an ownership field before remote cashouts reach the event bus.
17. **A resume that never settles is not retried** (recorded in A4a.1, 2026-11-15; deferred by the owner as a separate issue). `unlock()` marks the manager unlocked before `resume()` settles and returns early on later calls. If WebKit leaves the promise pending, or never reaches `"running"` without a `statechange`, no later gesture calls `resume()` again, and the game stays silent. A4a.1 does not change `unlock()`. With the `isAudible()` gate, the beds then simply hold at silence, and fade in from 0 once the context runs. Its own step, after device verification (Q14); the manual-resume fake can model it. *(A4b, 2026-11-15: **still open.** The host adds no resume workaround and `unlock()` is unchanged; a later gesture re-calls `unlock()`, which returns at once while the manager believes it is unlocked.)* *(IOS-AUDIO, 2026-11-17: **found to cause the complete silence on iPhone; fixed in code, awaiting the owner's device check.** A finger tap dispatches `pointerdown` before `touchend`. Under the HTML user-activation rules only a mouse `pointerdown` activates; a touch activates on `touchend`. The host's `pointerdown` listener ran `unlock()` first, outside an activation, so WebKit left its resume() pending; the `touchend` unlock then returned at once, and no resume ever ran inside an activation. Desktop was unaffected because a mouse `pointerdown` activates. Fix: `unlock()` no longer returns early while the manager asked for "running" and the context is not running (not muted, not host-suspended); it repeats the prime and the resume inside the new gesture. Still one context. Regression tests: `audio-manager.test.ts` (IOS-AUDIO block), `src/ui/audio-host.ios-unlock.test.ts`; the fake context gained an "activation" resume mode. Temporary DEV-only diagnostics: `src/ui/audio-diagnostics.ts` and `DevAudioDiagnostics.tsx`, shown with `?audiodebug=1`.)*

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
| `crashShake` / `goldPulse` in `src/styles.css` have no reduced-motion guard | **Recorded.** Fixed in V7, under UI-X1 (§13.2) — delivered 2026-11-18, visually approved by the owner 2026-11-18, committed locally *(until the acceptance: "delivered 2026-11-18 in the working tree, awaiting the owner's review")* |

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
- **2026-11-15 — A4b.** The owner accepted the final A4b architecture report and authorized the audio session integration (§1.1: D1–D9, D11, D10 conditional, seven mandatory corrections). Added §7.5, the A4b bullet in §1.1, the import note in §6, the ratified A4b rows in §12 and §13.2, and the A4b notes on §14 risks 13, 14 and 17 (17 stays open). Corrected the status line from Git evidence: A4a and A4a.1 are pushed; acceptance is recorded only where the owner gave it.
- **2026-11-16 — E-X7 accepted; V1.** The owner visually reviewed and fully accepted E-X7 (and the E-X6 ship work) and authorized V1, infrastructure only (§1.1). Added the E-X7 acceptance and the V1 bullet in §1.1; V1 notes on Q11 and Q12 in §1.3 (both stay Open); the implemented V1 interface and queue rules in §7 (`setMotion` field renamed `reducedMotion` per the authorization); the V1 rows in §12, §13.1 and §13.2 with the actual files; the "As built in V1" note in §13.4 (the chain-snap latch stays the single crash clock and the queue reads it). No visible change. V2 is not authorized.
- **2026-11-16 — V3 accepted; audio priority.** The owner visually accepted V3 (F3, F4 option A) exactly as implemented; the §4.3 F3/F4 rows are final, Q10 records the acceptance, and the §12 V3 row is committed locally. Owner priority change: A6, then A5, with the audio validation and listening QA, before V4–V7, which are deferred, not cancelled (§1.1, §12). A6 and A5 are not authorized for implementation; a read-only audit and completion plan come first. No source file changed at closeout.
- **2026-11-16 — A6.** Owner decision Q5 (100% original sound design) and authorization of A6 asset production and integration. Added the A6 bullet in §1.1, Q5 and Q6 in §1.3, the assets note in §7.3, `AUDIO_MIX` in §7.5 and "A6 as delivered" in §8. `director.ts`, `audio-manager.ts` and `sound-bank.ts` are unchanged. Working tree only; awaiting the owner's listening approval. A5 and V4–V7 are not started.
- **2026-11-16 — Music decisions; A6.1.** The owner reviewed the adaptive music architecture proposal and recorded decisions 1–9 (§1.1); Q8's deferral is superseded (§1.3). A6.1 authorized and implemented: the continuous chain rattle is off by default, and the host no longer loads it (§5 loops by phase). M1, M2, M3 and A5 are not authorized.
- **2026-11-17 — M-OWN, main soundtrack.** The owner selected the supplied MP3 as the main soundtrack and recorded decisions D1–D9 (§1.1). Added §7.6: `AudioManager.stream()`, the director's music stream and ducking, the iOS silent-switch findings and alternatives, the measured loop behaviour and the budgets. `AUDIO_MIX.music` is 0.5 (§7.5 value superseded). Q8: the three-stem plan (M1–M3) is deferred; Q15 is unchanged and binding, and music is off on iOS and iPadOS until the owner selects an alternative. The Q8 and Q15 rows of §1.3 are not rewritten; this entry and §7.6 are the record.
- **2026-11-17 — A-OWN, owner-supplied sound effects and ambience.** 14 owner recordings replace their A6 cues (§8); the tension creaks are off by default and not loaded (§5); `AUDIO_MIX.ambience` is 0.2 (§7.5 value superseded). The §9 budgets are exceeded by the owner beds; reported for the owner.
- **2026-11-17 — LA1, loading screen, audio switches and iPhone music.** Added the LA1 bullet in §1.1, the LA1 paragraph in §7.6 (alternative 2 implemented), and updated Q4 and Q15 in §1.3. The startup screen and the switches are specified in docs/07 §24. `src/rendering/assets.ts` (loader only) changed; its ratification as a renderer exception is pending (docs/07 §24).
- **2026-11-17 — R1, Phase 7 documentation reconciliation (documentation only).** The owner confirmed CH1 and F8 visually and asked that the Phase 7 records match the Git history (`develop` = `origin/develop` = `d1ccb9b`, verified before any change). Recorded: A6, A6.1, A-OWN (A-OWN.1, A-OWN.2), M-OWN and IOS-AUDIO in `6133636`; LA1 in `b5701c6`; CH1 and BET-1x2 in `d1ccb9b`; V1 `a9bdf35`, V2 `3878865`, D-T1 `0bd6ee2` and V3 `a9e9fdd` pushed (§12 rows). Historical exception: some pushed commits combine several logical steps; pushed history is not rewritten (AGENTS.md). Q4 / A5: the SOUND and MUSIC switches are the implemented sound control; volume sliders and the in-app reduced-motion toggle (Q12) stay open; audio QA and licensing are not closed. Physical-device and rights gates stay pending.
- **2026-11-17 — V4, F5 landing silt plume.** The owner authorized V4 with decisions D1 (start on the drawn touchdown, the floor-thud timing, not at `shipImpact`), D2 (≈ 1.0 s lifetime, provisional), D3 (jackpot landing only) and D4 (`SILT_FX_THEME`), and ratified its file scope. Added the "F5 as implemented" row in §4.3, F5 in Q10, and the V4 row in §12. Values provisional until the owner's visual acceptance.
- **2026-11-18 — V4 accepted.** The owner visually reviewed and approved F5 exactly as implemented (touchdown-synchronized start, ≈ 1.0 s lifetime, ≤ 12 High / ≤ 6 Low puffs, one static fading puff under reduced motion, the current sand colour, opacity, movement and spread); the §4.3 F5 row is final and D2 is no longer provisional. The out-of-scope `src/rendering/draw/particles.test.ts` adjustment is authorized. No source or visual value changed at acceptance. Committed locally as one V4 commit, not pushed; physical-device performance validation stays pending. The V4 review captures in `qa/v4-silt-plume/` stay local and are ignored by Git.
- **2026-11-18 — V5, F6 crash visual effects.** The owner authorized V5 with decisions D1 (option A: no Canvas camera shake), D2 (≤ 12 / 6 fragments), D3 (dark-blue vignette pulse), D4 (reduced motion) and D5 (existing FX preserved). Added the V5 bullet in §1.1, the "F6 as implemented" row in §4.3, F6 in Q10, Q11 answered (option A), and the V5 row in §12. Values provisional until the owner's visual acceptance; working tree only.
- **2026-11-18 — V5 performance refinement.** Owner-authorized, no visual redesign: the F6 vignette pulse is drawn from a cached full-size offscreen bitmap (one gradient rasterization per canvas pixel size) instead of a per-frame full-viewport gradient fill; visual difference ≤ 1/255 per channel. §4.3 "F6 as implemented" updated. Record: docs/15, "V5 performance refinement". Working tree only; V5 still awaits the owner's visual acceptance.
- **2026-11-18 — V5 accepted.** The owner visually reviewed and approved F6 with final values, including the cached-vignette refinement (12 High / 6 Low steel-blue fragments, their deterministic movement and lifetime, the subtle dark-blue pulse from the full-resolution cached bitmap copied 1:1 with the existing resize/DPR handling, cache limit and gradient fallback, the static fading accent under reduced motion, no Canvas camera shake, the DOM `crash-shake` and E-X7 unchanged). The §4.3 F6 row is final. No source or visual value changed at acceptance. Committed locally as one V5 commit, not pushed; physical-device performance validation stays pending. The review captures in `qa/v5-crash-fx/` stay local and are ignored by Git.
- **2026-11-18 — V6, F7 round-reset fade.** The owner accepted the V5 commit `dfe3342`, ratified two extra renderer files for V6 only (`render-state.ts`: optional `FxSettings.reset`; `scene-renderer.ts`: the reset handoff) and authorized F7 as *start slightly darkened → fade smoothly to normal* (0.40 s, `rgb(2, 12, 34)`, opacity 0.14 → 0). Added the V6 bullet in §1.1, the Q10 status, the §4.3 "F7 as implemented" row, the V6 rows in §12 and §13.1 and §13.2, and the §7 note. Validation: `tsc` clean; Vitest 1603/1603 across 71 files (`--maxWorkers=2`; 18 new in `layers/reset-fade.test.ts`, the V1 draw-equivalence pin in `fx-queue.test.ts` and two V2 settings pins in `scene-renderer.test.ts` updated for the visible reset); ESLint and Prettier clean on the changed files; build and SSR smoke pass. Deterministic harness against the V5 commit at seven sizes × High / Low / reduced: 399/399 unaffected frames pixel-identical; reset frames equal the V5 frame plus the fill at the envelope opacity (≤ 1.44 / 255 per channel from the computed blend); +0.4 s and later identical. Real game, seven sizes: one reset run per `bettingOpened` (9/9), first frame at elapsed 0, none on the initial load, no fade frame outside the betting view. Fill cost (software raster, headless Chrome): 0.14 ms (375×667) to 1.58 ms (1920×1080) mean, p95 0.3–2.3 ms; no device data. The first brightness step at the cut drops from ≈ +50 to ≈ +40 mean luma: softened, still visible. Delivered in the working tree, uncommitted and not staged; review captures in `qa/v6-reset-transition/` (local, ignored).
- **2026-11-18 — V6 accepted.** The owner visually reviewed and approved F7 as final (trigger `bettingOpened` through the existing FX queue; 0.40 s; colour `rgb(2, 12, 34)`; initial opacity 0.14; envelope 0.14 × (1 − t / 0.40)²; starts darkened and returns smoothly to normal; High = Low; off under reduced motion; no Canvas camera shake; no new clock or scheduler; the surface presentation unchanged); a subtle fade, not a full scene crossfade, as the owner understands and accepts. Added the "V6 accepted" bullet in §1.1; the Q10 status, the §4.3 F7 row and the §12 V6 row record the acceptance. No source or visual value changed at acceptance. Committed locally as `feat(rendering): add approved round reset transition (V6)`, not pushed; physical-device performance verification pending.
- **2026-11-18 — V7, reduced motion.** The owner committed V6 (`232c554`) and authorized V7 within its documented scope. Added the V7 bullet in §1.1, the Q12 status, and the V7 rows in §12, §13.2 and §16. `tsc` clean; Vitest 1629/1629 across 73 files (`--maxWorkers=2`; 26 new); ESLint and Prettier clean on the changed TypeScript files (`src/styles.css` already fails Prettier at HEAD, its existing style is kept); build and SSR smoke pass. Deterministic renderer harness, V7 working tree vs the V6 commit `232c554`, seven sizes × 8 effect scenes: normal 56/56 and reduced 56/56 frames pixel-identical (the renderer is unchanged). Real game in headless Chrome, 7 desktop sizes + 3 mobile-emulated (touch): the preference reaches the renderer before the first frame, live changes both ways, reload with reduce set, a change while the tab was hidden; 0 `setMotion` calls during idle frames; 0 console errors; the computed DOM animations match the guards. Frame cost (software raster) V6 vs V7 within noise in both modes; no device data. Working tree only.
- **2026-11-18 — V7 accepted.** The owner visually reviewed and approved V7 — Reduced Motion, exactly as implemented (OS-follow only). Added the "V7 accepted" bullet in §1.1; the Q12 status, the §12 V7 row and the §16 row record the acceptance. No source or visual value changed at acceptance. Final validation before the commit: `tsc` clean; Vitest 1629/1629 across 73 files (`--maxWorkers=2`); ESLint and Prettier clean on the changed TypeScript files; build and SSR smoke pass; `git diff --check` clean; real-game browser checks re-run on the final tree (10/10 configurations (7 desktop sizes + 3 mobile-emulated with touch): the preference reaches the renderer before the first frame, live changes both ways, reload with reduce already set, a change while another tab was in front; 0 `setMotion` calls over about 120 idle frames; 0 page or console errors; computed DOM animations match the guards (`goldPulse` / `crashShake` in normal motion, `none` with the still glow under reduce). In 8 of 10 the `crash-shake` class had already left the multiplier when the harness sampled it 120 ms after detecting the crash (the class lasts only for the `crashed` phase; `MultiplierOverlay.tsx` unchanged since V6), so in this run the class-present-and-animation-`none` observation comes from 1280×720 and 1920×1080, as it did from all 10 in the earlier run and from `reduced-motion.css.test.ts`). Committed locally as `feat(a11y): honor reduced motion preferences (V7)`, not pushed. Q12's in-app toggle stays open with A5; physical-device validation pending.
