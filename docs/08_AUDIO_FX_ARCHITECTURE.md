# AQUADIVE — AUDIO & VISUAL EFFECTS ARCHITECTURE (Phase 7)

**Sprint 5 / Phase 7 / TASK 008.** This is the Phase 7 blueprint, written in step **P7-0**.

**Status (2026-11-15, A1.2):** the owner approved the architecture as the basis for Phase 7. P7-0 (`0e7ff80`), A1 (`3761062`) and A1.1 (`ad9e959`) are done. **A1.2, voice pools and protected loops (§7.2), is authorized and delivered in its own commit.** A2 and every later step need their own explicit authorization. *(Until A1.2 this read: "P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted. **A1.1, the decode interface (§7.1), is authorized and delivered in its own commit.**")* *(Until A1.1 this read: "the owner … authorized **P7-0 only** (this document and the tracking updates). **No implementation step is authorized.** A1 and every later step need their own explicit authorization.")*

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

### 1.2 What the owner did not approve [OWNER]

- **The renderer and UI exceptions** (§13) are accepted **in principle only**. Each one's exact file-level scope must be documented and **explicitly ratified before those files are changed**. Until then, `src/rendering` stays frozen (docs/07 §19 gate 4), and the Phase 6 UI stays as approved.
- **The 16 owner-decision questions** (§1.3) are **not approved by default**, except where the owner's authorization answered them. A recommended default in this document is **not** a decision.
- **No audio assets exist**, and **no licence is cleared**. Nothing in this document claims otherwise.

### 1.3 Decision register

Status values: **Approved** (the owner decided), **Open** (the owner has not decided; the recommended default is shown and is not in force).

| # | Question | Status | Recommended default [REC] | Blocks |
|---|---|---|---|---|
| Q1 | Audio technology | **Approved** — native Web Audio, no dependency (not Howler.js) | — | — |
| Q2 | Renderer and UI exceptions; zero engine change | **Partly approved.** Zero engine change: **approved** (no `goldfishConsumed` / `boostExpired` event is added). Renderer and UI exceptions: **approved in principle**; file scopes **not ratified** (§13) | Ratify each step's scope from §13 before that step starts | A3, A4, A5, V1–V7 |
| Q3 | Default sound state | **Open** | On after the first user gesture | A4 wiring defaults, A5 |
| Q4 | Sound control | **Open** | A single mute button in TopBar | A5 |
| Q5 | Asset supply and allowed licences | **Open** | The owner supplies or commissions the files. Allowed: CC0, royalty-free commercial; CC-BY only with a credit entry. Not allowed: any NC licence. Every EULA checked for a gambling clause | A6 |
| Q6 | Audio format | **Open.** Owner's planning preference (2026-11-15): AAC-LC in `.m4a`, subject to browser compatibility validation. Not a decision | `.m4a` (AAC-LC) only | A2 manifest shape, A6 |
| Q7 | Spectator and Dual Bet audio | **Open** | Crash and jackpot play for everyone; cashout only for the player's own slots; two cashouts in the same tick play one cue | A4 |
| Q8 | Music | **Open** | Ambience plus a minimal music bed | A4 (`music.ts`), A6 |
| Q9 | Countdown ticks for the last 3 s | **Open** | — (no recommendation; the owner's preference) | A4 |
| Q10 | Effect list F1–F8, one by one; chain tension audio-only | **Open** | Approve F1–F8 as specified in §4.3; chain tension audio-only | V2–V6 (each effect's own step) |
| Q11 | Camera shake on crash (≤ 6 px, ≈ 300 ms); keep the DOM `crash-shake` | **Open** | — (owner's preference; both are specified as optional in V1/V5) | V1, V5 |
| Q12 | Reduced motion: follow the OS and offer an in-app toggle | **Open** | Follow the OS setting; an in-app "Reduce effects" toggle together with Q4 | V1, V7, A5 |
| Q13 | Blueprint name | **Approved** — `docs/08_AUDIO_FX_ARCHITECTURE.md` | — | — |
| Q14 | Device QA: which iOS and Android devices | **Open** | — (only the owner can answer) | A-track device gate, V-track performance gate, P7-C |
| Q15 | iOS silent switch | **Open** | Respect it (do not set `navigator.audioSession.type = "playback"`) | A1/A4 behavior on iOS |
| Q16 | Order: A5 after A6; V1–V7 while assets are sourced | **Approved** — the sequence in §1.1 | — | — |

**Decisions the owner flagged for confirmation:** audio assets (Q5), licensing (Q5), device QA (Q14), and user-facing behavior (Q3, Q4, Q7, Q9, Q11, Q12, Q15). These stay **Open** until the owner answers them.

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
- **`MusicController`:** a small state machine for phases (surface, dive, outcome stinger, reset) with crossfades.
- **Sound settings:** a UI-owned store (`master`, `music`, `sfx`, `muted`), persisted in `localStorage` inside try/catch. The session pushes it into the `AudioManager`, which is a passive sink.

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
- **Per-frame input is a narrow `AudioFrame`** [REC]: `{ phase, depthRatio, multiplier, boost, countdownSeconds }`, assembled in the session's driver sink from data the engine already projects.
- **Mixing defaults** [REC] (tuned by ear in A6):
  - Ambience low, SFX dominant, music bed under −18 dBFS.
  - Music and ambience duck by about 6 dB under outcome stingers.
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
| `bettingOpened` (BETTING / RESET) | Crossfade to the surface bed: waves, hull creak, calm music | F7 reset dip |
| `countdownSeconds` crosses 3, 2, 1 (state edge) | Soft tick (only if Q9 = yes) | — |
| `betPlaced { slot }` | Muted "clink"; slot 1 pitched differently | — |
| `diveStarted` (DIVE) | Chain unspool, then splash. Crossfade to underwater ambience and dive music | F4 splash |
| Per frame while diving | Chain-rattle loop: rate and gain follow the multiplier. Ambience low-pass follows `depthRatio`. Tension creaks at fixed multiplier thresholds | F1, F2, F3 |
| `boost` rising edge | Soft goldfish chime | (existing halo) |
| `cashedOut { slot }` (own slots only, Q7) | Coin chime | (existing WinFlash) |
| `crashed` (CRASH) | Metallic snap and muffled boom. Loops cut, music ducks | F6 |
| `shipImpact` (RESULTS) | Sand thud, jackpot stinger, treasure shimmer | (existing FX + landing) and F5 |
| `chestsRevealed` | Reveal shimmer | — |
| `chestPicked` | Lid creak and coin burst, tiered by `chestMultiplier` | F8 |
| `commandRejected`, `engineError` | None | None |

---

## 6. Module and folder structure [REC]

```
src/audio/
  README.md               (corrected contract — P7-0)
  audio-manager.ts        context, buses, unlock, visibility, voices
  sound-bank.ts           fetch / decode / cache, failure policy
  manifest.ts             cue → url, bus, gain, loop points, priority
  music.ts                phase music state machine
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
  loop(cue: CueKey): LoopHandle; // { setGain, setRate, setFilter, stop(fadeS) }; pending until it fits (A1.2, §7.2)
  decode(data: ArrayBuffer): Promise<AudioBufferLike | null>; // A1.1, §7.1; never rejects
  suspend(): void;
  resume(): void;
  dispose(): void;
}

// src/audio/director.ts
function createAudioDirector(
  events: EventBus<EngineEventMap>,
  audio: AudioManager,
): {
  update(frame: AudioFrame): void; // called by the session's driver sink
  pause(): void; // on canvas detach
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
- **Director:** deterministic full-round scripts using the existing `src/ui/test/scripted-session.ts` and `SequenceRng`. Each round path asserts a golden cue log: crash, cashout, jackpot + pick, chest-0 timeout, spectator, Dual Bet. Also the boost edge and countdown ticks.
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
| A2 | `feat(audio): sound bank and manifest` | C `src/audio/sound-bank.ts`, `src/audio/manifest.ts` + tests | None | Authorization; Q6 (format shapes the manifest) |
| A3 | `feat(ui): sound settings store` | C `src/ui/store/sound-settings-store.ts` + test | None | Authorization; UI scope ratification (new file in `src/ui`); Q3 (default) |
| A4 | `feat(audio): director, music and session wiring` | C `src/audio/director.ts`, `src/audio/music.ts` + tests; M `src/ui/session.ts` | None (no assets yet) | Authorization; UI scope (`session.ts`); Q3, Q7, Q8, Q9, Q15 |
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
| A3 | C `src/ui/store/sound-settings-store.ts`, C `src/ui/store/sound-settings-store.test.ts` |
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
