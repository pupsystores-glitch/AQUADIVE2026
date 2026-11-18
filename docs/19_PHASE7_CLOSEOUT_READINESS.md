# AQUADIVE — Phase 7 Closeout Readiness Report

**P7-C READINESS AUDIT — NOT FINAL CLOSEOUT.**

- **Date:** 2026-11-18
- **Scope:** TASK 008, Sprint 5, Phase 7 (Audio & Visual Effects), as planned in `docs/08_AUDIO_FX_ARCHITECTURE.md` §12 and §15.
- **Basis:** the Git history from `0ebe7c9` (the Phase 6 close-out) to `HEAD`, the working tree, docs 04, 08, 14, 15 and 16, `src/assets/audio/CREDITS.md`, the production build output, and the validation runs listed in §2.
- **Status of this document:** a documentation-only audit artifact. It is not committed. It closes nothing. It does not mark TASK 008 or Phase 7 complete, and it does not replace any historical record.

Evidence labels used throughout:

- **Recorded**: written in the official records (docs 08, 14, 15, 16, CREDITS) before this audit.
- **Owner-stated 2026-11-18**: stated by the owner in the instruction that authorized this audit, and not recorded anywhere before it.
- **Verified here**: checked again during this audit (command output, file contents or build output).

---

## 1. Executive summary

Phase 7 is **implemented, but it cannot be closed yet.**

Every planned engineering step exists in Git: the audio stack (A1–A4b), the visual-effects track (V1–V7), the owner audio (A6, A-OWN, M-OWN), the loading screen and sound switches (LA1), and the premium chests (CH1). The full automated suite passes (1,629 / 1,629 tests). Phase 7 never touched the engine, the RNG, the wallet, settlement or bet validation: `git diff 0ebe7c9 HEAD -- src/engine src/shared` and the money-path files are empty. The owner has visually approved V2–V7, E-X7 and CH1.

Three gates in `docs/08` §15 still block the close-out:

1. **Audio commercial rights (BLOCKED).** Every audio file the game ships has rights that are not verified. The owner reports that the music and sound effects are AI-generated, but the generating services and their terms are not recorded. The synthesized A6 files carry their own open items: the terms for AI-assistant output, the Windows encoder, and AAC patents.
2. **Physical-device QA (BLOCKED).** The test devices (Q14) have not been named, and no physical iPhone or Android test has been recorded. Every device result so far comes from headless Chrome emulation.
3. **Performance (NOT VERIFIED).** No GPU or phone measurement exists. In software rasterization, some effects exceed the desktop "< 1 ms p95" FX target. The audio decode budget (about 20 MB) is exceeded about 3.4 times.

Two owner decisions are also needed: whether the in-app "Reduce effects" toggle (Q12) and the volume sliders (A5) are required or waived, and which crash sound and jackpot stinger to accept.

---

## 2. Current repository and Git status

Verified here, after the V7 commit:

| Item | State |
|---|---|
| Branch | `develop`, tracking `origin/develop` |
| `HEAD` | `01b061e` — `feat(a11y): honor reduced motion preferences (V7)` |
| `origin/develop` | `d1ccb9b` (CH1) |
| Local-only commits (5) | R1 `cede9be`, V4 `9bc714d`, V5 `dfe3342`, V6 `232c554`, V7 `01b061e` |
| Staged changes | None |
| Working tree | Only the uncommitted audit documentation: this file, plus the readiness notes in docs 14 and 16 |
| QA folders | `qa/v4-silt-plume/`, `qa/v5-crash-fx/`, `qa/v6-reset-transition/` and `qa/v7-reduced-motion/` are ignored (`git status --porcelain --ignored` reports `!!`). No file under `qa/` is tracked, and none appears in the build output |
| `main` branch | None. The remote has only `develop` (recovery item 2, docs/16) |

**V7 final validation (2026-11-18, against the committed tree):**

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean |
| Vitest, `--maxWorkers=2` | **1,629 / 1,629 passed, 73 files** (153 s) |
| ESLint, changed TypeScript files | 0 problems |
| Prettier, changed TypeScript files | Clean. `src/styles.css` also failed Prettier at `232c554`, before V7; its existing style is kept |
| Production build (`vite build`) | Passes |
| SSR smoke (dev server) | HTTP 200, canvas markup, loading screen at `initializing`, no server error |
| `git diff --check` / `--cached --check` | Clean |
| Engine / shared / renderer / audio / assets / `package.json` diff in V7 | Empty |
| Real-game browser re-run (headless Chrome, 7 desktop sizes + 3 mobile-emulated) | **10 / 10 pass.** The preference reaches the renderer before the first frame; live changes work both ways; reload with reduce set; a change while another tab was in front; 0 `setMotion` calls during idle frames; 0 page or console errors; computed animations match the guards. In 8 / 10 the short-lived `crash-shake` class had already gone when sampled 120 ms after the crash (a sampling-timing effect; `MultiplierOverlay.tsx` is unchanged since V6) |
| Deterministic renderer comparison | Not re-run. V7 changes no file under `src/rendering`, so the earlier 112 / 112 identical frames (56 normal + 56 reduced) still hold by construction |

---

## 3. Phase 7 milestone matrix

"Pushed" means the commit is on `origin/develop`. "Device" means a physical-device test. No row has one.

| Step | Requirement (docs/08 §12 unless noted) | Implementation | Commit | Pushed | Owner acceptance | Automated verification | Device | Remaining |
|---|---|---|---|---|---|---|---|---|
| P7-0 | Blueprint and tracking docs | Done | `0e7ff80` | Yes | The owner authorized A1 on it | n/a | n/a | — |
| A1 | `AudioManager` core | Done | `3761062` (docs `c58ab0b`) | Yes | **Accepted** 2026-11-15 | 623 tests at the time | No | — |
| A1.1 | Decode interface | Done | `ad9e959` | Yes | None recorded | 663 | No | Acceptance |
| A1.2 | Voice pools, 16-source cap | Done | `0de6d73` | Yes | **Accepted** 2026-11-15 | 685 | No | `maxInstances` deferred |
| A2 | Sound bank and manifest | Done | `03bb7dc` | Yes | None recorded | 757 | No | Acceptance |
| A3 | Sound settings store | Done | `16a6a40` | Yes | **Accepted with documented limitations** | 828 | No | — |
| A3.1 | Subscriber failure hardening | Done | `e70fa22` | Yes | None recorded | 838 | No | Acceptance |
| A4a | Audio director core | Done | `289b849` | Yes | None recorded | 923 | No | Acceptance |
| A4a.1 | Loop startup correction | Done | `d8ab112` | Yes | None recorded | 967 | No | Safari resume retry deferred (§14 risk 17) |
| A4b | Session integration | Done | `f668d49` | Yes | docs/16 heading: "accepted and pushed per the owner"; docs/14 records no acceptance | 1,013 | No | Make the records agree (P7-C) |
| E-X6 | Ship artwork, shine, pickup flight (owner side task) | Done; S4 lamp and S5 flag cancelled | `2c4d4bf` | Yes | S2.1 accepted in principle. The owner lists the ship and lighting as approved (owner-stated 2026-11-18). docs/14 still reads "awaiting owner review" for S1, S2 and the S3 refinement | Recorded per sub-step | No | S6 (final QA, reduced motion, performance) never authorized; reconcile the records |
| E-X7 | Chain-snap animation | Done | `c66c279` | Yes | **Fully accepted** 2026-11-16 | Recorded | No | — |
| V1 | FX queue, shake hook, motion and quality flags | Done | `a9bdf35` | Yes | None recorded (no visible change, by design) | 1,129; draw-call equivalence | No | — |
| V2 | F1 marine snow, F2 depth vignette | Done | `3878865` | Yes | **Accepted** 2026-11-16 (refined values) | 1,158 | No | Device performance |
| D-T1 | Faster chain-snap test (test only) | Done | `0bd6ee2` | Yes | Authorized with V2 | — | n/a | — |
| V3 | F3 anchor wake, F4 release splash | Done | `a9e9fdd` | Yes | **Accepted** 2026-11-16 | 1,180; pixel-identical outside F3 and F4 | No | Device performance |
| V4 | F5 landing silt plume | Done | `9bc714d` | **No** | **Accepted** 2026-11-18 | 1,551; 231 / 231 frames | No | Device performance |
| V5 | F6 crash FX (no camera shake, Q11 option A) | Done | `dfe3342` | **No** | **Approved** 2026-11-18, including the cached vignette | 1,585; 231 / 231 frames | No | Device performance |
| V6 | F7 round-reset fade | Done | `232c554` | **No** | **Approved** 2026-11-18 | 1,603; 399 / 399 frames | No | Device performance |
| V7 | Reduced motion, canvas and CSS | Done (OS-follow) | `01b061e` | **No** | **Visually approved** 2026-11-18 (OS-follow behaviour) | 1,629; 112 / 112 frames; browser checks (§2) | No | The Q12 in-app toggle is not built (§9); device check |
| A6 | Original sound assets and mix | Done; 14 of its 18 cues were later replaced by A-OWN | `6133636` (combined) | Yes | **No listening acceptance** of the 4 A6 files still shipped | 1,208 at the time | No | `crash-boom` listening; rights (CREDITS §6) |
| A6.1 | Chain rattle off by default | Done | `6133636` | Yes | Owner decision implemented | Tests | n/a | — |
| A-OWN, .1, .2 | Owner SFX and ambience; thud, splash and goldfish fixes | Done | `6133636` | Yes | Owner-stated 2026-11-18: BET 1, ocean ambience, goldfish timing, floor thud, water splash and chest opening approved. The other cues: none recorded | 1,376 at the time; every cue played in the real game | No | Listening for the rest (§5); rights (CREDITS §9.5) |
| M-OWN | Streamed main soundtrack | Done | `6133636` | Yes | Owner-stated 2026-11-18: soundtrack approved | 1,339 at the time | No | 20–25 ms gap at the loop point; rights (CREDITS §8) |
| IOS-AUDIO | WebKit unlock retry; DEV diagnostics panel | Done | `6133636` | Yes | None | Tests; WebKit behaviour cannot be reproduced in Chrome | **No — required** | iPhone test |
| LA1 | Loading screen; SOUND and MUSIC switches; iPhone music | Done | `b5701c6` | Yes | Owner-stated 2026-11-18: the SOUND and MUSIC buttons are owner-approved | 1,506 at the time; emulated iPhone 3/3 + 3/3 | **No — required** | iPhone test; ratify the `src/rendering/assets.ts` loader change |
| CH1 + F8 | Premium chests, centred multiplier, chest burst | Done | `d1ccb9b` (combined with BET-1x2) | Yes | **Approved** 2026-11-17 | 1,521 at the time | No | Device check |
| BET-1x2 | BET 2 plays the BET 1 sound | Done | `d1ccb9b` | Yes | Owner-stated 2026-11-18: BET 1 approved for both buttons | Director and host tests | No | — |
| R1 | Reconcile the records with Git (docs only) | Done | `cede9be` | **No** | Owner-authorized | n/a | n/a | — |
| A5 | Sound control | Partial: the sound-control interface is LA1's switches (R1, owner, 2026-11-17) | `b5701c6` | Yes | The switches are owner-approved | Tests | No | Volume sliders and the in-app reduce-motion toggle: undecided (§9) |
| M1–M3 (music) | Shared-clock loops, `MusicController`, stems | Not built | — | — | **Deferred by the owner** 2026-11-17 (M-OWN D9) | — | — | Out of Phase 7 unless reinstated |
| P7-C | Phase 7 close-out | **Not started; not authorized** | — | — | — | — | — | All §15 gates (§11 below) |

**Historical exception (recorded in R1):** `6133636` and `d1ccb9b` each combine several logical steps. Both are pushed, so they stay as they are (AGENTS.md).

---

## 4. Verified owner-accepted features

These are accepted in the records, or by the owner's statement of 2026-11-18, and are to be preserved unchanged:

- **Visual:** E-X6 ship and lighting (owner-stated; see the record gap in §3); E-X7 chain snap; V2 marine snow and depth vignette; V3 anchor wake and release splash; V4 landing silt plume; V5 crash FX with the cached vignette; V6 round-reset fade; V7 OS reduced-motion follow; CH1 chests, chest opening and the centred gold multiplier, with F8.
- **Audio** (owner-stated 2026-11-18, not recorded before): the BET 1 sound on both bet buttons; the ocean ambience; the soundtrack; the goldfish timing correction (A-OWN.2); the floor-thud and water-splash corrections (A-OWN.1); the chest-opening sound.
- **UI:** the SOUND and MUSIC buttons under the balance (LA1).
- **Disabled by owner decision:** `chain-rattle` (A6.1), `tension-creak-1` and `tension-creak-2` (A-OWN), `bet-clink-2` (BET-1x2).

**Clarification needed:** the records do not say whether "the chest-opening sound" means `chest-lid-creak`, `chest-coin-burst`, or both (both play on a chest pick).

---

## 5. Unverified functionality

- **Listening acceptance** has not been recorded for: `crash-boom` (the A6 synthesized boom, still in use), `jackpot-stinger`, `chain-snap`, `chain-unspool`, `cashout-coins`, `treasure-shimmer`, and `chest-coin-burst` if it is not the approved chest sound.
- **Crash sound.** A crash plays `chain-snap` (owner file) with `crash-boom` (A6 synthesized). The owner supplied no `crash-boom` file. One derived candidate, `src/assets/audio/candidates/refinement/crash-boom-candidate.m4a`, exists. It is unreferenced and has not been listened to. **Status: in use, provisional, no listening acceptance.**
- **Jackpot stinger.** It plays the owner's `owner/jackpot-stinger.m4a`. The refinement README notes that no derived candidate could be made without an external service. **Status: in use, no listening acceptance; no alternative exists.**
- **Gains and mix.** Every manifest gain and `AUDIO_MIX` (music 0.5, ambience 0.2, sfx 0.7) is recorded as provisional.
- **Known audio observations** (recorded, unchanged): a 20–25 ms gap at the music loop point (Chrome and Edge); the surface bed sits about 20 dB below the earlier A6 bed; `CREDITS.md` §9.4 records clipping in the uploaded `water-splash` and `floor-thud` files and +0.8 dBFS on `chest-lid-creak`.
- **iOS behaviour.** `navigator.audioSession.type = "ambient"`. Silent Mode also silences the music, iOS before 16.4 gets no music, and the WebKit unlock retry (IOS-AUDIO) is unverified. None of this has been tested on an iPhone.
- **Formats (Q6).** MP3 and AAC-LC decode in desktop Chrome 157 and Edge 157 only. Safari, Firefox and phones are not verified.
- **Desktop Firefox and Safari.** No test is recorded.
- **Seven-size screenshot matrix and full gameplay loop** (`docs/08` §11.2, required before P7-C). Agent captures exist for each V-step. The owner has not yet approved a whole-Phase-7 matrix or full-loop pass.

---

## 6. Audio licensing and provenance matrix

**Gate status: BLOCKED — RIGHTS VERIFICATION PENDING for every file the game ships.**

`CREDITS.md` itself states that it "grants no licence and makes no legal claim". The owner states (2026-11-18) that the owner-supplied music and sound effects are AI-generated. That is not yet recorded in `CREDITS.md`, and no source service is named for any file.

### 6.1 Files shipped in the production build (verified in `.output/public`)

| Cue | File | Origin (recorded) | Owner-supplied | AI-generated | Source service | Commercial use | Redistribution in a commercial (real-money) game | Proof on file | Status |
|---|---|---|---|---|---|---|---|---|---|
| `music` | `music-main.mp3` | Owner upload, unchanged (CREDITS §8) | Yes | **Yes** (recorded, D6) | **Not recorded** | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `ambience-surface` | `owner/ambience-surface.m4a` | Owner upload, byte-identical (§9) | Yes | Yes (owner-stated 2026-11-18) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `ambience-underwater` | `owner/ambience-underwater.m4a` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `bet-clink-1` (both slots) | `owner/bet-clink-1.mp3` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `bet-clink-2` (disabled, still shipped) | `owner/bet-clink-2.mp3` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `cashout-coins` | `owner/cashout-coins.mp3` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `chain-snap` | `owner/chain-snap.m4a` | Owner upload. Metadata names `https://clipchamp.com` as the writing tool | Yes | Yes (owner-stated) | Not recorded; **Clipchamp involvement unexplained** | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `chain-unspool` | `owner/chain-unspool.m4a` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `chest-coin-burst` | `owner/chest-coin-burst.m4a` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `chest-lid-creak` | `owner/chest-lid-creak.m4a` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `floor-thud` | `owner/floor-thud.mp3` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `goldfish-chime` | `owner/goldfish-chime-trimmed.mp3` | Lossless frame-boundary trim of the owner upload (A-OWN.2) | Derived | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `jackpot-stinger` | `owner/jackpot-stinger.m4a` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `treasure-shimmer` | `owner/treasure-shimmer.m4a` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `water-splash` | `owner/water-splash.mp3` | Owner upload | Yes | Yes (owner-stated) | Not recorded | Not verified | Not verified | None | **RIGHTS VERIFICATION PENDING** |
| `crash-boom` | `crash-boom.m4a` | Local synthesis by `production/synth.mjs`, code written by Claude Code (CREDITS §1–§7) | No | Made by AI-written code. No AI audio service, sample or recording was used | None (local maths; Windows Media Foundation AAC encoder) | Not verified (CREDITS §6 items 1–3) | Not verified | Reproducible from the repository | **RIGHTS VERIFICATION PENDING** |
| `tension-creak-1` / `-2` (disabled, still shipped) | `tension-creak-1.m4a`, `tension-creak-2.m4a` | As `crash-boom` | No | As `crash-boom` | As `crash-boom` | Not verified | Not verified | Reproducible | **RIGHTS VERIFICATION PENDING** |
| `chain-rattle` (disabled, still shipped) | `chain-rattle.m4a` | As `crash-boom` | No | As `crash-boom` | As `crash-boom` | Not verified | Not verified | Reproducible | **RIGHTS VERIFICATION PENDING** |

The four disabled cues are never fetched at runtime, but they are emitted into the bundle (the manifest imports their URLs), so they are distributed with the product.

### 6.2 Tracked in the repository, not shipped

- 14 superseded A6 `.m4a` files in `src/assets/audio/`, kept for restoration (CREDITS §1–§7 status).
- `src/assets/audio/owner/goldfish-chime.mp3`, the untrimmed original.
- `src/audio/candidates/`: the owner's 14 original uploads, kept as the backup.
- `src/assets/audio/candidates/refinement/`: four derived candidates and their WAV masters. They have the same unconfirmed status as their source uploads.

If the repository is ever public or shared, these are distributed too. They need the same clearance, or removal by the owner's decision.

### 6.3 What the owner must supply to resolve this gate

For **each AI service** used to make the music or any sound effect:

1. The service's name and the product or model used.
2. The account plan or tier at the time each file was generated (free and paid tiers often differ on commercial rights).
3. The service's terms of service, as a dated copy or the version in force on the generation date, showing:
   - commercial use of the output;
   - redistribution of the output inside a commercial product;
   - no exclusion for gambling, casino or real-money gaming;
   - who owns the output, and any attribution requirement.
4. A per-file list mapping each file above to its service, the generation date and the account. These records stay with the owner; they do not need to be committed.
5. Confirmation that no third-party audio, voice or copyrighted reference was uploaded as an input to the generator.

For **`chain-snap.m4a`**: what Clipchamp was used for (export only, or Clipchamp stock audio or effects). If stock content was used, its licence.

For the **A6 synthesized files** (CREDITS §6):

6. Confirmation that the terms of the Claude plan used assign the output to the owner for commercial use, including a real-money gambling product.
7. Confirmation that the Windows licence allows commercial use of the Media Foundation encoder's output.
8. A position on AAC and MP3 patent licensing for distributed files (CREDITS §6 item 3; §8). It was not researched here.

For **all of them**:

9. Legal advice, where the owner wants it, on how far AI-generated audio is protected by copyright in the target markets. CREDITS asserts no ownership.
10. Owner sign-off that every licence is approved (`docs/08` §15 item 7). Each item is then recorded in `CREDITS.md`, with the source, licence, URL and date per `docs/08` §8.

---

## 7. Physical-device QA checklist

**Gate status: BLOCKED.** Q14, the device list, is open, and no physical-device test is recorded for any Phase 7 step.

Legend: **Sim** = automated or emulated check recorded (headless Chrome, CDP emulation); **Phys** = physical-device test; **—** = none.

### 7.1 iPhone Safari

| Item | Sim | Phys | Defect found |
|---|---|---|---|
| Startup loading screen | Done (LA1: emulated iPhone 3/3) | **Pending** | — |
| START GAME audio unlock | Done (LA1, emulated; WebKit unlock rules cannot be reproduced in Chrome, per the IOS-AUDIO record) | **Pending** | — |
| Main soundtrack playback | Done in Chrome only; iOS uses the `ambient` session (LA1) | **Pending** | — |
| SOUND and MUSIC independent controls | Done (LA1 tests and browser checks) | **Pending** | — |
| Audio resume after backgrounding | Done (LA1 backgrounding 3/3, desktop) | **Pending** | — |
| Screen lock and interruption recovery | — | **Pending** | — |
| Silent Mode | — (by design, `ambient` also silences music) | **Pending** | — |
| Audio Session API compatibility (iOS 16.4+; earlier gets no music) | Unit tests only | **Pending** | — |
| Touch interactions | Done (touch emulation, V7 and LA1) | **Pending** | — |
| Treasure chest selection | Done (CH1 at 375×667 and 390×844, emulated) | **Pending** | — |
| Reduced Motion system setting | Done (V7, CDP-emulated media feature) | **Pending** | — |

### 7.2 Android Chrome

| Item | Sim | Phys | Defect found |
|---|---|---|---|
| Loading behaviour | Done (desktop and mobile-emulated) | **Pending** | — |
| Sound and music playback | Done (desktop Chrome) | **Pending** | — |
| Game input responsiveness | Done (emulated taps) | **Pending** | — |
| Reduced Motion | Done (emulated) | **Pending** | — |
| Animation smoothness | — | **Pending** | — |
| Crash FX | Done (V5, software raster) | **Pending** | — |
| Seabed and chest reveal | Done (CH1, V4) | **Pending** | — |
| Frame pacing and rendering performance | — (no GPU or device measurement) | **Pending** | — |

### 7.3 Desktop

| Item | Sim | Phys | Defect found |
|---|---|---|---|
| Chrome and Edge | Done (audio decode Chrome and Edge 157; game checks in headless Chrome) | Owner's browser review done for the visual approvals; no structured pass recorded | — |
| Firefox and Safari (`docs/08` §10 targets) | — | **Pending** | — |
| Keyboard accessibility | Partly (LA1: Enter on START GAME; Phase 6 DOM tests) | **Pending** | — |
| Focus behaviour (`inert` game until START GAME) | Done (LA1 tests) | **Pending** | — |
| Audio settings persistence | Done (A3 store and LA1 switch tests) | **Pending** | — |
| Normal vs Reduced Motion comparison | Done (V7: 112 / 112 deterministic frames; owner reviewed `V7-compare.html`) | Owner's visual review only | — |

**Recorded pre-existing observations (not defects found on a device):** the top-left multiplier stays gold at a crash in both motion modes, because `text-gold` wins over `text-danger`; the header is 24 px taller on phones since LA1; "Continue anyway" after a failed texture starts on vector fallbacks.

---

## 8. Performance and memory assessment

**Gate status: NOT VERIFIED.**

### 8.1 Targets

- `docs/05` §14: 60 FPS (16.6 ms) on a mid-range Android phone, with the render half at most 6 ms.
- `docs/08` §9:
  - added FX cost (F1–F7) under 1 ms p95 on the dev machine;
  - zero steady-state allocations;
  - at most 16 voices;
  - about 20 MB decoded audio;
  - about 1.5 MB of audio on first load;
  - music lazy-loaded.
- `docs/08` §15 item 5: the owner approves the frame-meter numbers on a mid-range Android device (Q14).

### 8.2 Evidence, by tier

| Tier | What exists |
|---|---|
| 1. Unit and simulated-browser | FX caps, determinism, zero-allocation designs (reused typed arrays, cached gradients and bitmaps), the 16-voice cap (A1.2), the reduced-motion paths, and "no per-frame work" for V7. All covered by tests |
| 2. Software-rasterized desktop (headless Chrome) | V3: +0.04–0.06 ms. V4 plume: ≈ 0.4 ms p95 at 1920×1080 DPR 1, 0.8 ms at DPR 2, 1.1 ms at 390×844 DPR 2. V5 cached vignette: ≈ 1.5 ms mean at 1920×1080 DPR 1, ≈ 6.3 ms at DPR 2. V6 reset fill: 0.14–1.58 ms mean, p95 0.3–2.3 ms. V7: within noise of V6. Whole frames at 1920×1080 take ≈ 106 ms in this mode, so the absolute numbers are not representative |
| 3. GPU-rendered desktop | **None recorded.** The V5 notes say the timing harness forces software rasterization |
| 4. iPhone or Android | **None** |

### 8.3 Against the targets

| Target | Assessment |
|---|---|
| Render ≤ 6 ms on mid-range Android (`docs/05`) | **NOT VERIFIED.** No device data. Software-raster desktop timings cannot be turned into a phone FPS figure |
| FX < 1 ms p95 on the dev machine (`docs/08` §9) | **Not met in software rasterization** for the V5 vignette pulse (≈ 1.5 ms mean, ≈ 6.3 ms at DPR 2) and the V6 fill at large sizes (p95 up to 2.3 ms). Not shown below 1 ms for V4 at 390×844 DPR 2. **GPU unmeasured.** These effects are transient (≤ 0.7 s around a crash or reset), not steady-state |
| 16 voices | **PASS** (A1.2, tests) |
| Decoded audio ≈ 20 MB | **Exceeded:** about 68 MiB decoded for the cues the game loads, mostly the two stereo ambience beds (53.8 MiB; CREDITS §9.1) |
| First-load audio ≈ 1.5 MB | **Exceeded:** about 3.21 MB for the 14 cues loaded at startup (verified here from the build output). Total audio in the bundle is 6.92 MB, including the streamed 3.53 MB soundtrack and the 4 disabled cues |
| Music lazy-loaded | **PASS** (streamed through one media element, created inside the unlock gesture) |
| Memory (heap) | **NOT VERIFIED.** No heap measurement is recorded. Decoded audio alone is about 68 MiB, a risk on low-memory phones |
| Loading performance | **NOT VERIFIED.** Recorded checks run against the dev server, which serves unbundled modules. `vite preview` returns 500 because the build targets Cloudflare, so the production bundle has not been load-tested locally |

The DPR cap stays at 2 (`MAX_DPR`). The V5 vignette's cost scales with the number of device pixels, so DPR 2 phones are where to measure first.

---

## 9. A5 and Q12: unresolved requirements

| Item | Source | Status | Explicitly waived? |
|---|---|---|---|
| Sound control (A5's planned `SoundControl.tsx` in TopBar) | `docs/08` §12 | **Superseded:** the LA1 SOUND and MUSIC switches implement the sound-control interface the owner requests (R1, owner, 2026-11-17). They are owner-approved and must not be rebuilt | Superseded (the planned component), not waived |
| Volume sliders | A5, Q4 ("Volume sliders (A5) stay open") | **Open, deferred.** Recorded as "optional"; never approved and never waived | **No** |
| In-app "Reduce effects" toggle | Q12 ("follow the OS and offer an in-app toggle"), A5 | **Open.** V7 implements the OS-follow half only, owner-approved 2026-11-18. This approval does not close the toggle | **No** |
| `docs/08` §15 item 4: "Reduced motion is honored in both the canvas and the DOM. Mute and volume persist." | DoD | Reduced motion (OS): **met**. Mute: the switches persist. **Volume:** stored and persisted, but no UI can change it | — |
| "Raising a volume does not unmute" (A3 D7, deferred to A5) | A3 | Open; only relevant if sliders are built | No |

**Owner decision required:** for each of the two open items, either **waive** it for Phase 7 (record the waiver, and P7-C proceeds without it) or **authorize** it as a step.

### 9.1 Narrow proposal if the in-app toggle is required (not implemented)

- **Behaviour:** a persisted preference, "Reduce effects: follow system / on". The effective flag is `OS reduce OR in-app on`. It is passed to the existing `SceneRenderer.setMotion` through the existing V7 path. No new motion system.
- **Files (to be ratified):**
  - C a small preference store with a test, or one field in the existing settings store (owner's choice; the sound settings store is single-purpose today, so a separate store is cleaner);
  - M `src/ui/session.ts` (combine the two sources);
  - M `src/styles.css` (mirror the V7 guards under a root attribute such as `[data-reduce-effects]`);
  - M the control's host component and `src/ui/strings.ts`;
  - DOM tests.
- **Known limit, needing a decision:** the loading screen's and CH1's Tailwind `motion-reduce:` utilities and CH1's own `@media` guards follow only the OS media query. Making the toggle cover them too means touching CH1's approved CSS (guards only, no visual change in normal motion), or accepting that the toggle covers only the canvas and the V7 guards.
- **Placement:** a UI decision for the owner. The approved SOUND and MUSIC buttons must not be redesigned, so a third control needs an approved place.

---

## 10. Security and architecture regression findings

Verified from Git, not from the records:

| Check | Result |
|---|---|
| `src/engine`, `src/shared` (state machine, RNG `rng.ts`, `round-authority.ts`, bet validation `shared/stake.ts`) | **No diff** `0ebe7c9..HEAD` |
| Wallet, payout, stake, bet-input, round stores | **No diff.** The only new store is `sound-settings-store.ts` |
| Settlement and Dual Bet | Unchanged. V7's test "engine states, multipliers, wallet and round store are identical with reduced motion off, on or flipping" passes |
| Dependencies | No change to `package.json` in Phase 7 |
| Architecture | TypeScript, Canvas 2D (no PixiJS) and native Web Audio are kept. `src/ui/audio-host.ts` is the only UI module that imports `src/audio` |

**Phase 7 scope deviations to ratify or record (no behaviour risk found):**

1. `src/ui/components/GameScreen.tsx` is excluded from UI-X1 (`docs/08` §13.2) but was changed in `6133636` (IOS-AUDIO). The change mounts `DevAudioDiagnostics` behind `import.meta.env.DEV`, so production compiles it out. Its comment calls it "temporary", which conflicts with `docs/02` ("never create temporary solutions"). Decide: keep it as a sanctioned dev tool, or remove it in its own step.
2. `src/rendering/assets.ts`: the LA1 loader change (`b5701c6`) still awaits ratification as a renderer exception (recorded).
3. `src/routes/index.tsx` was changed by LA1 (`inert` wrapper and loading screen); it is not in any ratified list.
4. Combined commits `6133636` and `d1ccb9b` (historical exception, R1). `d1ccb9b` was made outside the agent sessions, co-authored with Copilot.

**Unrelated architectural risks (outside Phase 7; not expanded here):**

- M1 money integrity is deferred, not closed; M2 and B-R (integer-cent ledger) are not started.
- There is no stable `main` branch (recovery item 2; `docs/18` requires one).
- CRLF and scaffold leftovers (recovery items 1 and 3).
- The build targets Cloudflare, so the production bundle cannot be served locally (`vite preview` returns 500).

**Record inconsistencies to fix in P7-C:**

- The Phase 7 status line in `docs/04` still stops at "A4b … not pushed".
- The `docs/14` "Owner decisions" and "Next (A4b)" bullets are from 2026-11-15.
- The E-X6 rows in `docs/14` still say "awaiting owner review".
- A4b's acceptance differs between `docs/14` and `docs/16`.
- `docs/08` §8's first bullet still says the repository contains no audio assets.
- `docs/08` §9 says "No measurement exists yet".
- `CREDITS.md` §9.5 does not yet record the owner's 2026-11-18 statement that the owner audio is AI-generated.

---

## 11. Phase 7 closeout gate matrix

| Gate | Status | Basis |
|---|---|---|
| Architecture and implementation | **PARTIAL** | All planned V- and A-track steps are built, and engine and money are untouched. Open: A5 sliders and the Q12 toggle are undecided; three scope deviations to ratify (§10); records to reconcile |
| Automated testing | **PASS** | 1,629 / 1,629 tests; `tsc`, build and SSR smoke pass; changed-file lint is clean; deterministic renderer comparisons per V-step |
| Owner visual acceptance | **PARTIAL** | V2–V7, E-X7 and CH1 approved; E-X6 approved by owner statement, records stale. Owner approval of the seven-size screenshot matrix and the full gameplay loop for Phase 7 as a whole (`docs/08` §11.2, §15.1) is not recorded |
| Audio quality acceptance | **PARTIAL** | Owner-stated approvals for BET 1, ambience, soundtrack, goldfish, thud, splash and chest opening. No acceptance for `crash-boom`, `jackpot-stinger`, `chain-snap`, `chain-unspool`, `cashout-coins`, `treasure-shimmer`; the music loop gap is open |
| Audio commercial rights | **BLOCKED** | No rights documentation for any shipped file (§6) |
| Physical-device QA | **BLOCKED** | Q14 devices not named; no physical test recorded (§7) |
| Accessibility and Q12 | **PARTIAL** | OS reduced motion done and approved; the in-app toggle and volume control are undecided; keyboard and focus not tested on a device |
| Performance | **NOT VERIFIED** | No GPU or device data; FX target exceeded in software rasterization; audio budgets exceeded (§8) |
| Git and release readiness | **PARTIAL** | Clean history and no staged changes; 5 commits local only; no `main`; push not authorized |

**Overall: Phase 7 is NOT ready for P7-C.** Do not create a P7-C completion commit.

---

## 12. Prioritized remaining-work plan

Owner-side items do not need agent work. Agent items each need their own authorization.

1. **Owner: name the devices (Q14).** One iPhone (iOS ≥ 16.4) and one mid-range Android phone at minimum. *(Unblocks 4 and 5.)*
2. **Owner: supply the rights documentation** (§6.3) for every shipped file. Decide whether the tracked-but-unshipped files (§6.2) stay in the repository.
3. **Owner: decide A5 and Q12.** Waive or authorize the in-app "Reduce effects" toggle and the volume sliders (§9).
4. **Owner (with an agent-prepared run sheet, if wanted): physical-device QA** on the §7 checklist. The DEV panel at `?audiodebug=1` over LAN (`vite dev --host`) gives in-device diagnostics.
5. **Owner and agent: device performance capture** with the existing frame meter on the named Android phone, normal and reduced motion, at DPR 2. Include a crash (V5) and a reset (V6).
6. **Owner: the remaining listening pass.** Decide `crash-boom` (keep the A6 boom, try the unreferenced candidate, or supply a new file) and `jackpot-stinger`. Accept or tune the provisional gains. Accept or reject the 20–25 ms music loop gap.
7. **Owner: decide on the audio budget exceedance** (about 68 MiB decoded, 3.21 MB first load): accept it, or authorize a separate optimization step (for example mono or shorter ambience beds). Not to be done without approval.
8. **Owner: ratify or reject the scope deviations** (§10, items 1–3). Decide whether disabled cues should keep shipping in the bundle.
9. **Agent, only if authorized in 3: the Q12 toggle step**, scoped as in §9.1.
10. **Agent, after 1–8: P7-C**, documentation only (`docs/04`, `docs/08`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md`): reconcile the records listed in §10 and record each gate's evidence.

---

## 13. Proposed future Git and release sequence (not executed)

1. Owner review of this audit (uncommitted). Optionally authorize a docs-only commit of it.
2. **Push authorization**, if and when the owner chooses: `git push origin develop` would publish R1, V4, V5, V6 and V7. This branch is connected to Lovable, so the commits would sync into the Lovable editor. Each commit has passed its own gate. No force push, rebase or amend.
3. Device QA (§12, items 4 and 5) against the pushed or LAN-served build.
4. Any authorized follow-up steps (Q12 toggle, audio decisions), each as one commit on `develop`.
5. P7-C, a documentation-only commit, after every §11 gate is PASS or explicitly waived by the owner.
6. Separately, recovery item 2: create a stable `main` from a verified `develop` commit, and only then any release merge or tag. Not part of Phase 7.

---

## 14. Decisions required from the owner

1. **Q14:** which iPhone and Android devices define the device gate.
2. **Rights:** supply the §6.3 documentation, or decide which assets to replace.
3. **Q12:** in-app "Reduce effects" toggle: required (authorize the §9.1 step and its placement) or waived for Phase 7.
4. **A5:** volume sliders: required or waived.
5. **Crash sound:** keep `crash-boom.m4a` (A6), audition the unreferenced candidate, or supply a file.
6. **Jackpot stinger:** accept the current owner file, or supply another.
7. **Chest-opening sound:** confirm which cue(s) the approval covers (`chest-lid-creak`, `chest-coin-burst`, or both).
8. **Audio budgets:** accept about 68 MiB decoded and 3.21 MB first load, or authorize an optimization step.
9. **Music:** accept the 20–25 ms loop gap; confirm that the iOS "ambient" trade-off is acceptable (Silent Mode mutes music; iOS < 16.4 gets no music).
10. **Q6:** confirm MP3 and AAC-LC as the delivery formats after the device tests.
11. **Scope ratification:** the LA1 `src/rendering/assets.ts` loader; the `src/routes/index.tsx` LA1 change; the DEV-only `GameScreen.tsx` diagnostics mount, and whether its "temporary" panel stays.
12. **Bundle content:** keep or exclude the four disabled cues from the production bundle.
13. **Screenshot matrix and full gameplay loop:** schedule the owner's whole-Phase-7 approval (`docs/08` §15.1).
14. **Push:** whether and when to push the five local commits.

**Recommended next authorized task:** the owner's decision on items 3 and 4 (Q12 toggle and volume sliders). They are the only remaining items that could need implementation, and they determine whether one more code step precedes P7-C. In parallel, items 1 and 2 (devices and rights documentation) are owner-side and gate everything else.
