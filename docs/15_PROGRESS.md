# PROJECT PROGRESS

This document tracks the evolution of the AQUADIVE project.

Rules:

- Update this document only after completing a task.
- Never mark unfinished work as completed.
- Every completed task must include:
  - Task ID
  - Date
  - Summary
  - Files modified
  - Architectural decisions
  - Risks (if any)

Current Status:

Sprint 4 (User Interface, TASK 007) IN PROGRESS — started 2026-08-17. Blueprint `docs/07_UI_ARCHITECTURE.md` approved and binding (U0); Commit U1 delivered and approved (`140790f`). Commit U2 (wallet store, delta V1) committed as `ad30d7a` and pushed to `origin/develop` together with its tracking docs (`f080b03`) and its settlement-exclusivity bug fix (`39f5a9f`); **U2 approved by the owner 2026-11-13**: SSR smoke passed, owner manual gameplay and browser console checks passed with no errors, 151/151 tests green. Accepted limitation: remount coverage is automated (session-level) only — a browser-level React component remount was not manually tested. Engine freeze exception **E-X1** (bonus eligibility and deterministic completion): owner-approved 2026-11-13, validated (all automated gates green; owner manual browser QA passed, 4/4 scenarios), **committed as `897c5be` and pushed to `origin/develop`**. U2 closure docs committed as `9b1071e`. **U3 (UI test harness + DOM characterization pins) committed and pushed as `8e9b21b` (2026-11-13); the owner accepted its validation results.** Suite at 180/180 green across 22 files (151 node + 29 DOM). Real-browser remount still unverified. **U4 architecture approved 2026-11-13 and re-cut into U4a + U4b** (separate gates; dev rejection banner deferred to U6). **U4a (notification store, V2) implemented and validated 2026-11-13; owner manual browser QA passed (5/5); approved by the owner 2026-11-13; committed and pushed to `origin/develop`.** Suite at 212/212 green across 24 files. **U4b (round store) implemented and validated 2026-11-13; committed as `bbdc13443e1b2a8cb29e58a1f24e72f7d44711c2` and pushed to `origin/develop`** (249/249 tests green across 26 files); its manual browser QA is pending. **U5 (bet-input store + action-state derivation, V4) authorized by the owner 2026-11-13 (D1–D12); implemented and validated 2026-11-13; committed as `09cc5af56534766982697f7036efce72f440260d` and pushed to `origin/develop`** (311/311 tests green across 29 files) — a development checkpoint, not fully accepted: U4b and U5 manual browser QA pending. **M1 (Money Integrity — sub-cent / zero-debit betting vulnerability): financial policy approved by the owner 2026-11-13 (M1-D1 to M1-D6); not implemented, vulnerability still open.** Stage M1-0 (decisions + architecture plan, docs only) drafted under TASK 007, refined by a review pass and then reconciled with the security boundary review (2026-11-13); awaiting owner review, not committed. The security boundary review found a second open vulnerability, **V2** (minimum-stake payout rounding), which the owner made a required M1 fix: payouts rounded down to the cent (M1-D7, M1-D8). Provisional plan C3 (M1-D9). Final financial integrity reconciliation (2026-11-13, docs only):
- owner policy M1-D13 to M1-D16 recorded — the payout calculation policy, invalid-multiplier handling, wallet-side integrity in M1, and no push of an unsafe intermediate state;
- proposed: the BigInt payout function, wallet rules W1–W9 and plan **C4** (one atomic integration commit, which replaces C3's publication model);
- Q1 and the numeric envelope stay open.

Engine freeze exception E-X2 is proposed, not approved. M2 (integer minor units) deferred. U6 not started. Renderer and shared floor frozen; engine frozen except for E-X1 (docs/07 §19 gate 4).

**Update 2026-11-14 — supersedes the status statements above as a description of the code.** M1 is implemented in the working tree: E-X2, M1-1, the V2 payout fix, W1–W9 and W10 under R2. It is uncommitted and unpushed. **E-X2 was approved by the owner, as implemented**, and the freeze now allows E-X1 and E-X2 only. Final owner decisions:

- Q1/Q11 = **B-R**: not implemented; minimal design awaiting approval (docs/07 §23.20).
- Q9c = **R2**: implemented.
- Q14 = **S1**: one atomic commit, with no Git operation authorized.

409/409 tests green across 33 files. M1 is **not closed**. See "Stage M1 — implementation" below.

M2 (the rest of integer minor units) is still deferred.

**Reconciliation 2026-11-14 (documentation only) — supersedes the statements above as a description of the repository.**

- **On `origin/develop`:**
  - `e37b81c`: M1, S1.
  - `4440009`: U6 + U7.
  - `e8b1b62`: the M1 test suites.
  - `be10b19`: Dual Bet, E-X3.
- **M1** is **deferred** by the owner to the final stabilization phase. It is not closed. **M2**, which includes B-R, is tracked separately and not started.
- **Freeze:** the approved engine freeze exceptions are E-X1, E-X2 and E-X3. The renderer and the shared floor are frozen.
- **Working tree:** it holds uncommitted renderer changes (chain visuals). They are preserved, but they are not part of any approved exception.

**Reconciliation 2026-11-15 (close-out Step 3) — supersedes the statements above as a description of the repository.** `develop` = `origin/develop` = `81eb985`. Since `be10b19`: `c046b33` (close-out Step 2 docs, QA fixes D1–D4, first part of the renderer work, under the message `Update lockfile`), the web-editor `vite.config.ts` / `package.json` commits `5c5741a` … `2b8d51b`, the repairs `9ef35e9` and `4d44a50`, and `81eb985` (renderer visuals). The owner accepted the visuals and D1–D4, and approved the renderer exception **E-X4**. Approved exceptions: E-X1 to E-X4. Phase 6 is **not closed**.

**Official close-out 2026-11-15 — supersedes the statements above.** **TASK 007 / Sprint 4 / Phase 6 COMPLETED.** OWNER APPROVED — 2026-11-15: gameplay including Dual Bet, mobile gameplay, and the seven-size screenshot matrix (docs/07 §19 gates 7–8). E-X4 and D1–D4 formally ratified. Close-out commits: G1 `6e28ce0`, G2 `9bded6b`, G3 `3346ed8`, G4 (the close-out documentation). 572/572 tests green. M1 stays deferred and not closed; M2 and B-R are not started. Phase 7 is not started. See "Sprint 4 close-out — Step 4" below.

**Sprint 5 / Phase 7 started 2026-11-15 — supersedes "Phase 7 is not started" above.** **TASK 008 (Audio & Visual Effects) is active.** The owner approved the Phase 7 architecture and authorized **P7-0 only**: the blueprint `docs/08_AUDIO_FX_ARCHITECTURE.md` and the tracking updates. No runtime code, dependency or asset is added. A1 is not started. See "TASK 008" below.

**A1 accepted 2026-11-15 — supersedes "A1 is not started" above.** The owner authorized A1 on the P7-0 blueprint (`0e7ff80`). A1, the `AudioManager` core, is committed as `3761062` and pushed to `origin/develop`, and the owner accepted it on its recorded validation evidence. It is not wired, so the app is unchanged. **A2 (sound bank and manifest) is the next step. It is not authorized and not started.** See "Step A1" below.

**A1.1 delivered 2026-11-15.** The owner authorized the `AudioManager` decode interface as its own step before A2. It is committed and pushed and awaits the owner's review. **A2 is still not authorized.** See "Step A1.1" below.

**A1.2 delivered 2026-11-15.** A1.1 is in `ad9e959`. The owner authorized voice pools and protected loops as their own step before A2. It is committed and pushed and awaits the owner's review. **A2 is still not authorized.** See "Step A1.2" below.

**A2 delivered 2026-11-15.** The owner accepted A1.2 at `0de6d73` and authorized A2, the sound bank and manifest. It is committed and pushed and awaits the owner's review. It is not wired, and no asset exists. **A3 is not authorized.** See "Step A2" below.

**A3 delivered 2026-11-15.** A2 is in `03bb7dc`. The owner authorized A3, the sound settings store, with decisions D1–D8 (docs/08 §1.1). It is committed and pushed and awaits the owner's review. It is not wired. **A4 is not authorized.** See "Step A3" below.

**A3.1 delivered 2026-11-15.** The owner accepted A3 (`16a6a40`) with documented limitations and authorized A3.1, the subscriber failure hardening of the sound settings store. It is committed and pushed and awaits the owner's review. It is not wired. **A4 is not authorized.** See "Step A3.1" below.

**A4a delivered 2026-11-15.** A3.1 is in `e70fa22`. After the revised A4 plan, the owner split A4 into A4a and A4b and authorized A4a, the Audio Director core, with Q7, Q8, Q9 and Q15 approved for it. It is committed, not pushed, and awaits the owner's review. It is not wired. **A4b is not authorized.** See "Step A4a" below.

**A4a.1 delivered 2026-11-15.** A4a is in `289b849`. After the read-only A4a.1 design report, the owner approved approach B and authorized A4a.1, the loop startup correction (docs/08 §1.1, decisions 1–8). It is committed and pushed to `origin/develop` and awaits the owner's review. It is not wired. **A4b, the Safari resume retry, music integration and audio asset work are not authorized.** See "Step A4a.1" below.

---

## TASK 008 — Sprint 5: Audio & Visual Effects (Phase 7) (ACTIVE, started 2026-11-15)

### Step P7-0 — Phase 7 architecture blueprint (documentation only) — DONE (`0e7ff80`, 2026-11-15); the owner authorized A1 on it

*(Until the A1 acceptance, 2026-11-15, this heading read "DELIVERED 2026-11-15; AWAITING OWNER REVIEW".)*

- **Task ID:** TASK 008, step P7-0. **Date:** 2026-11-15.
- **Authorization:** the owner approved the *Sprint 5 / Phase 7: Audio & Visual Effects Architecture Proposal* (2026-11-15) as the basis for Phase 7, and authorized P7-0 only.
- **Summary:** the proposal is recorded as `docs/08_AUDIO_FX_ARCHITECTURE.md` without redesign. It covers the current-state audit (§2), the audio and FX architecture (§3–§4), the event mapping (§5), the module layout and interfaces (§6–§7), assets and licensing (§8), performance and browser targets (§9–§10), the test strategy and per-commit gate (§11), the full commit sequence (§12), the proposed exception scopes (§13), risks (§14), the acceptance gates and owner-review points (§15), and the documentation conflicts (§16).
- **Files:** created `docs/08_AUDIO_FX_ARCHITECTURE.md`; modified `docs/04_DEVELOPMENT_ROADMAP.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`, `src/audio/README.md`. No other file.
- **Architectural decisions (owner-approved):** native Web Audio with a lightweight `AudioManager`, no audio dependency; the existing Canvas 2D renderer, no PixiJS, no stack change; event-driven audio and FX; the approved underwater atmosphere preserved; no change to the engine, RNG, money settlement, Dual Bet or gameplay outcomes, so the reserved `goldfishConsumed` / `boostExpired` events stay unbuilt; the sequence P7-0 → A1–A4 → V1–V7 → A6 → A5 → P7-C; one atomic commit per step; the blueprint file name.
- **Accepted in principle, not ratified:** the renderer exception (proposed **E-X5**) and the UI exception (proposed **UI-X1**). Their step-by-step file scopes are documented in docs/08 §13 and must be ratified before those files change.
- **Open owner decisions** (docs/08 §1.3): Q3 default sound state, Q4 sound control, Q5 asset supply and licences, Q6 format, Q7 spectator and Dual Bet audio, Q8 music, Q9 countdown ticks, Q10 the effect list F1–F8, Q11 camera shake and the DOM `crash-shake`, Q12 reduced motion, Q14 device QA, Q15 the iOS silent switch, and the scope part of Q2. Recommended defaults are recorded but are not in force.
- **Corrected:** `src/audio/README.md` named non-existent events (`round:crashed`, `cashout:confirmed`) and claimed "no game state" while planning depth ambience. It now names the real engine events and the per-frame `AudioFrame` (docs/08 §16).
- **Recorded, not changed:** the reserved docs/06 §12 events (unused), and the missing reduced-motion guard on `crashShake` / `goldPulse` (scheduled for V7).
- **Not done (by instruction):** no runtime source change, no dependency, no audio or visual asset, no A1, no Phase 8. No audio asset exists and no licence is cleared.
- **Validation (2026-11-15, on the P7-0 tree):** exactly the six P7-0 files changed (`git status`); `git diff --check` clean; LF line endings in every changed file; `tsc --noEmit` clean; 572/572 tests across 42 files; ESLint 0 errors + 6 pre-existing warnings with end-of-line neutralized (the raw run's 7,470 errors are all CRLF `Delete ␍` on pre-existing working-tree files, recovery item 1); production build passes; `src/engine`, `src/shared`, `src/rendering` and `src/ui` unchanged. `src/audio/README.md` is Prettier-clean. The other five documents are not Prettier-formatted, as their HEAD versions were not (repository convention: compact Markdown tables). SSR smoke not run: no runtime file changed.
- **Risks:** none introduced by this step. Phase 7 risks are in docs/08 §14. The chief one is that Phase 7 cannot ship without step-scoped renderer and UI changes, which are not yet ratified.

### Step A1 — `AudioManager` core — DONE (`3761062`, 2026-11-15); ACCEPTED BY THE OWNER

- **Task ID:** TASK 008, step A1. **Date:** 2026-11-15.
- **Authorization:** the owner authorized A1 after P7-0, and accepted the delivery at `3761062` on its recorded validation evidence (2026-11-15).
- **Summary:** the generic Web Audio core of docs/08 §3.2, §3.3 and §7, with no game knowledge and no dependency.
  - The `AudioContext` is created lazily inside the first `unlock()`, never at module scope or construction (SSR-safe). `AudioContext` / `webkitAudioContext` are feature-detected; with neither, or a throwing constructor, the manager runs silent and logs once.
  - Bus graph: `music` / `ambience` / `sfx` → `master` → `DynamicsCompressor` limiter → output. Gains are clamped to 0..1, non-finite values are ignored, and changes use `setTargetAtTime`.
  - Unlock inside the gesture: `resume()` plus a 1-sample silent buffer (the iOS prime). The context runs only while unlocked, not muted and not host-suspended. An `interrupted` state, or a suspend the manager did not ask for, re-locks it and calls `onUnlockRequired`.
  - Voices: one-shots and loops (`LoopHandle`: gain, rate, low-pass, fade-out stop), at most 16. At the cap the lowest-priority voice is dropped, the oldest on a tie.
  - Cues come from an injected `CueResolver` (the A2 seam). A missing or malformed cue is silent.
  - `navigator.audioSession` is not touched (Q15 open).
- **Files:** created `src/audio/audio-manager.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-manager.test.ts`. No other file. Nothing imports the module yet.
- **Validation (recorded in the commit, 2026-11-15):** `tsc --noEmit` clean; 623/623 tests across 43 files (51 new, the 572 existing unchanged); ESLint 0 errors + 6 pre-existing warnings (end-of-line neutralized), the new files clean raw; production build passes; SSR smoke HTTP 200 with canvas markup; `git diff --check` clean; `src/engine`, `src/shared`, `src/rendering`, `src/ui` and the package files unchanged.
- **Re-verified on `3761062` during the A2 reconciliation (2026-11-15):** `tsc --noEmit` clean; 623/623 tests across 43 files; ESLint 0 errors + 6 warnings; production build passes. Note: inside the agent's sandboxed Bash shell, every suite fails at load (`Cannot read properties of undefined (reading 'config')`), including the frozen `src/shared` suites. The same run in PowerShell is fully green, so this is an environment limit, not a repository fault. Gates are run in PowerShell.
- **Process deviation (recorded for provenance):** the A1 commit did not carry its tracking updates to docs 14/15/16, as U1 did not (see TASK 007). This entry closes that gap. `docs/04_DEVELOPMENT_ROADMAP.md` ("A1 is not started") and `src/audio/README.md` ("No audio code … exist yet") are still stale; they are outside this documentation update and are corrected in a later approved step.
- **Remaining risks:**
  - No decode path. The manager keeps its single context private, and `AudioContextLike` has no `decodeAudioData`, so A2 cannot produce `AudioBuffer`s without a change to `audio-manager.ts`. That change is outside A2's §12 file list and needs the owner's decision.
  - The unlock, interruption and suspend behavior is proven against the fake context only. Real-device proof waits for the device matrix (Q14); audible proof waits for A6.
  - The limiter settings, the 15 ms parameter time constant and the voice-steal fade are untuned engineering defaults until the A6 listening pass.
  - Voice priorities are numbers chosen by the A2 manifest; no tier policy exists yet.
  - *(2026-11-15: the decode risk is resolved by A1.1, below.)*

### Step A1.1 — `AudioManager` decode interface — DELIVERED 2026-11-15; AWAITING OWNER REVIEW

- **Task ID:** TASK 008, step A1.1. **Date:** 2026-11-15.
- **Authorization:** the owner approved a narrowly scoped decode interface after the A1 acceptance and the A2 reconciliation report, as one atomic commit before A2 (docs/08 §1.1). The authorization does not cover A2.
- **Summary** (docs/08 §7.1): `AudioManager.decode(data: ArrayBuffer): Promise<AudioBufferLike | null>`.
  - It uses the manager's single, lazily created context. It never creates a context, never exposes it, and adds no second one.
  - A request made before the first unlock waits. It starts inside `unlock()`, after the iOS prime and `resume()`.
  - It never rejects. It resolves `null` on a decoding error, a synchronous throw, a malformed result, an unsupported environment (no factory result, a throwing factory, or no `decodeAudioData`) and on `dispose()`. Waiting requests settle when the unsupported environment is detected. Waiting and in-flight requests settle on `dispose()`.
  - Each request settles exactly once. The callback-only form (older WebKit), the promise-only form, and both forms together (current browsers) are supported. The first report wins, and a late report, including one after `dispose()`, is ignored.
  - No playback side effect, and no logging of decode failures: the A2 sound bank owns the per-asset failure policy.
  - `AudioContextLike` gains `decodeAudioData`. The fake context records each call as a `FakeDecodeRequest` that the test settles by hand, in a chosen API style (`both` / `promise` / `callback`), with an optional synchronous throw.
- **Files:** modified `src/audio/audio-manager.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/audio-manager.test.ts`; docs `docs/08_AUDIO_FX_ARCHITECTURE.md` (§1.1, §1.3 Q6 note, §7, §7.1, §12 row, §14 risk 12, §18), `docs/04_DEVELOPMENT_ROADMAP.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`, `src/audio/README.md` (status line, which was stale since A1). No other file. Nothing imports the module yet.
- **Validation (2026-11-15, PowerShell, on the A1.1 tree):** `tsc --noEmit` clean; **663/663 tests across 43 files** (40 new; the 623 existing pass unchanged); ESLint 0 errors + 6 pre-existing warnings (end-of-line neutralized), `src/audio` clean raw; `src/audio` Prettier-clean; production build passes; SSR smoke HTTP 200 with canvas markup; `git diff --check` clean; LF in every changed file; `src/engine`, `src/shared`, `src/rendering`, `src/ui`, `src/components`, `src/styles.css`, `src/assets` and the package and lock files unchanged; no dependency added.
- **Mutation check (manual, reverted):** removing the settle-on-dispose, the settle-on-unsupported, or the `started` guard each fails tests (3, 3 and 1). Removing the per-request `settled` flag fails none, because a native promise already ignores a second resolve. The flag is kept as an explicit guard that tests cannot observe; exactly-once behavior is still pinned by the tests.
- **Limitations:**
  - Proven against the fake context only. Real `decodeAudioData` behavior, AAC-LC support included, waits for A2/A6 and the device matrix (Q14).
  - A request made before unlock stays pending until a gesture or `dispose()`. That is by design (no context before a gesture), but A2 must not wait on it before the game can start.
  - The docs are not Prettier-formatted, as at HEAD (repository convention).
- **Voice-cap analysis (owner's instruction, recorded for A2; no code change):** see docs/08 §14 risk 12. Fixed tiers alone do not guarantee that loops survive: an equal-priority newcomer steals the oldest voice, which is usually the loop; a loop refused at a full cap gets an inert handle with no retry; a one-shot tier above the loops steals them; fading voices are not counted toward the cap. To be decided and tested before A2. *(2026-11-15: resolved by A1.2, below.)*

### Step A1.2 — Voice pools and protected loops — DONE (`0de6d73`, 2026-11-15); ACCEPTED BY THE OWNER

*(Until A2, 2026-11-15, this heading read "DELIVERED 2026-11-15; AWAITING OWNER REVIEW". The owner accepted the delivery at `0de6d73` in the A2 authorization.)*

- **Task ID:** TASK 008, step A1.2. **Date:** 2026-11-15.
- **Authorization:** granted by the owner after the A2 architecture report, as one atomic commit before A2 (docs/08 §1.1). It does not cover A2, the sound bank, the manifest or `maxInstances` (deferred).
- **Pre-checks:** every document in `/docs` read in full. `develop` was clean and equal to `origin/develop` at `ad9e959`.
- **Owner decisions taken during the step (2026-11-15):**
  1. The authorization named five A1 tests to update. The fixed pools and the strict cap make 8 A1 tests out of date, and the owner approved rewriting all 8.
  2. The unlock prime is counted in the tail pool. A gesture with both tail slots live skips the prime and still calls `resume()`.
- **Summary** (docs/08 §7.2):
  - **Strict cap.** At most 16 live playback sources: playing, fading, stolen and preempted voices and unlock primes alike.
  - **Fixed pools.** 6 loop, 8 one-shot and 2 tail slots (`LOOP_VOICES`, `ONE_SHOT_VOICES`, `TAIL_VOICES`). They sum to `MAX_VOICES`, so the cap holds by construction. One-shots never take a loop slot.
  - **Slot release.** Only on evidence of the end: `onended`, or `currentTime ≥ endsBy + VOICE_RECLAIM_GRACE_S` (0.1 s), where `endsBy` is the scheduled stop or a one-shot's natural end. `stop()` is never taken as proof. There are no timers: the clock sweep runs on every manager call. A late `onended` is ignored.
  - **One-shot admission.** A1's rule (the lowest priority goes, the oldest on a tie), now within the one-shot pool. A steal needs a free tail slot, where the stolen voice fades. Otherwise the newcomer is dropped.
  - **Pending loops** replace A1's inert handles:
    - a loop waits before unlock, while interrupted, while its cue is unresolvable, or while the loop pool is full;
    - it keeps its gain, rate and filter;
    - it starts in a fixed order: essential first, then priority, then request order;
    - `stop()` cancels it;
    - a handle never has two live sources.
  - **Essential loops** (`ResolvedCue.essential`): never preempted. At a full loop pool, an essential newcomer preempts the weakest non-essential loop (if a tail slot is free). The preempted loop restarts once its old voice has ended.
  - **Teardown.** `dispose()` and an unsupported environment cancel every pending loop.
  - **Unlock.** It first reclaims ended sources by the clock, then primes into a free tail slot.
  - **Validation.** A malformed cue now also needs a buffer with a finite, non-negative duration.
- **UTF-8 repair (comment-only).** At HEAD, 23 comment lines in `audio-manager.ts` held double-encoded UTF-8. The count of 22 in the authorization came from a search for `â€` / `Â`, which misses line 12: it holds only the `→` sequence `â†’`. All 23 are comment lines.
  - 20 are corrected in place. The file matches HEAD byte for byte once comment lines are masked.
  - The other 3 (lines 17, 54 and 519) sat inside the doc comments that A1.2 rewrites: the "Voices" header bullet, the `MAX_VOICES` doc and the prime doc. Their replacements are correctly encoded.
  - No other `src/audio` file or doc was damaged.
- **Test changes.** The 8 owner-approved rewrites each keep their original guarantee, and each test notes its old title:
  1. "allows MAX_VOICES (16)" → "allows ONE_SHOT_VOICES (8) one-shots without stealing".
  2. "higher-priority voice steals the oldest lowest-priority one" → the same within the one-shot pool.
  3. "equal-priority voice steals the oldest" → the same within the one-shot pool.
  4. "the lowest priority goes first" → the same, with an 8-slot fill.
  5. "a newcomer below every playing voice is dropped" → one-shots still dropped; a loop at a full loop pool waits.
  6. "ended and stopping voices free their slots" → ended voices free at once; stopping and stolen voices keep their slot.
  7. "a stolen loop's handle goes inert" → "one-shots never steal a loop" (loop preemption is covered under essential loops).
  8. "a loop requested before unlock is inert" → it waits, and starts at unlock with the settings given meanwhile.
  - **22 new tests:** pool sizes; a 100-sound burst; stop-not-proof; lost and delayed `onended`; clock reclaim of a stopped loop; no reclaim without clock progress; prime in the tail; re-unlock reclaims before priming; 6 pending-loop tests (late cue, fixed order, cancellation, no duplicates across repeated unlock and state changes, interrupted request, unsupported environment); 4 essential-loop tests; crossfades; rapid state changes; deterministic admission; disposal of every pool.
  - A strict-cap assertion checks, after the operations, that at most 16 sources are held, and that every source the fake reports as still physically playing is held.
- **Fake context (additive).** `playStartedAt`, `ended`, `playsUntil`, `isPlaying()`. Existing fields and behavior are unchanged.
- **Files:** modified `src/audio/audio-manager.ts`, `src/audio/audio-manager.test.ts`, `src/audio/test/fake-audio-context.ts`; docs `docs/08` (§1.1, §7, §7.2, §12, §14 risk 12, §18), `docs/04`, `docs/14`, `docs/15`, `docs/16`, `src/audio/README.md`. No other file. Nothing imports the module yet.
- **Validation (2026-11-15, PowerShell, `C:\`, on the A1.2 tree):**

| Gate | Result |
|---|---|
| Vitest, full suite (`--maxWorkers=2`) | **685/685 passed, 43/43 files** (22 new; 8 rewritten as approved; every other test unchanged) |
| `tsc --noEmit` | Clean |
| ESLint, full project, end-of-line neutralized | 0 errors, 6 warnings (pre-existing, shadcn `src/components/ui`) |
| ESLint raw + Prettier, `src/audio` | Clean |
| Production build | Passes |
| SSR smoke (fresh dev server) | HTTP 200, canvas markup, no error strings, no server-log errors |
| `git diff --check` | Clean |
| Freeze | `src/engine`, `src/shared`, `src/rendering`, `src/ui`, `src/components`, `src/routes`, `src/game`, `src/styles.css`, `src/assets`, `src/routeTree.gen.ts`, package and lock files: no diff |

- **Mutation check (manual, reverted; 16 mutants).**
  - **Caught (13):** freeing the slot on `stop()`; reclaiming without the grace; no clock reclaim at all; one-shots in loop slots; restarting a preempted loop while its old voice fades; an uncounted prime; preemptable essential loops; stealing without a tail slot; no precedence sort (caught only after the ordering test was tightened); equal priority unable to steal; non-essential preemption; no sweep before the prime; `onended` without promotion.
  - **Survived (3, cleanup only, not observable):** leaving a cancelled request in the pending list, on `stop()`, on `dispose()` and in an unsupported environment. The `status` guard already stops such a request from ever starting, so the list cleanup only bounds memory.
- **Limitations:**
  - Proven against the fake context only. Real `onended` timing, `currentTime` granularity and the iOS unlock with a skipped prime wait for the device matrix (Q14).
  - A lost `onended` frees its slot at the first manager call after its end plus 0.1 s. A4's per-frame handle updates make that one frame.
  - A pending loop the caller never stops still starts once it fits. The director must stop every handle it drops.
  - The priority and `essential` values are the A2 manifest's to set.
  - The docs are not Prettier-formatted, as at HEAD (repository convention).

### Step A2 — Sound bank and manifest — DELIVERED 2026-11-15; AWAITING OWNER REVIEW

- **Task ID:** TASK 008, step A2. **Date:** 2026-11-15.
- **Authorization:** the owner accepted A1.2 at `0de6d73` and authorized A2 as one atomic commit (docs/08 §1.1). Not authorized: any change to `audio-manager.ts`, any audio file or invented production URL, any decision on Q3–Q12, Q14 or Q15, and A3 onward.
- **Pre-checks:** `develop` was clean and equal to `origin/develop` at `0de6d73`. Read in full: docs 00–06, 08, 14, 16, 17, 18, 99, docs/07 §1–§22, and the TASK 008 section of docs/15. Scanned rather than read line by line, after a search for any audio reference (none found): docs/07 §23 (M1 money integrity) and the pre-Phase-7 history in docs/15. Inspected `audio-manager.ts`, its tests and the fake context before any edit.
- **Interfaces proposed before implementation** (in the session, then built as proposed): docs/08 §7.3.
- **Summary** (docs/08 §7.3):
  - **Manifest** (`manifest.ts`): 15 one-shot and 3 loop cue ids, the docs/08 §8 set. One-shot and loop ids and definitions are separate types. Fields: kind, category (bus), gain, priority tier, `asset`; loops add `essential` and optional loop points. Only the two ambience beds are essential. **Every `asset` is `null`**: no URL, file name or format, so every cue is unavailable and silent. The countdown tick (Q9) and music beds (Q8) are left out. Gains and tiers are untuned engineering defaults. `validateSoundManifest()` checks entries.
  - **SoundBank** (`sound-bank.ts`): fetch, then `AudioManager.decode()` (the single context), then a frozen, cached `ResolvedCue`. `resolve` is the manager's resolver. Loads are deduplicated per cue and never reject. Failures are silent, logged once and not retried. `evict()` and `dispose()` abort fetches, cancel waiting loads and make every stale fetch, body or decode result a no-op. `onReady` lets the caller wake a pending loop. SSR-safe: `fetch` and `AbortController` are read only when a load starts.
- **Interface question raised (not acted on):** the manager has no public refresh, so a pending loop starts at the next manager call after its cue is ready. A2 closes the gap with `onReady` and a caller obligation for A4 (docs/08 §7.3, §14 risk 13). A public `AudioManager.refresh()` is noted as an alternative that needs its own approval. `audio-manager.ts` is unchanged.
- **Files:** created `src/audio/manifest.ts`, `src/audio/sound-bank.ts`, `src/audio/manifest.test.ts`, `src/audio/sound-bank.test.ts`, `src/audio/test/fake-fetch.ts`; modified `docs/08_AUDIO_FX_ARCHITECTURE.md` (status, §1.1, §1.3 Q6 note, §7, §7.3, §12 row, §14 risk 13, §18), `docs/04_DEVELOPMENT_ROADMAP.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`, `src/audio/README.md`. No other file. Nothing outside `src/audio` imports the new modules.
- **Tests (72 new):**
  - Manifest (25): validity; exact, unique ids; kinds; no asset and no URL-like string; only the beds essential; the loops fit `LOOP_VOICES`; buses (no `music` while Q8 is open); tiers and gains; frozen; 14 validator rejections; compile-time kind separation (`@ts-expect-error`).
  - SoundBank, unit (38): SSR safety (no global read at import or construction; fetch read only at load; no fetch; no `AbortController`); loading and caching (frozen, cached object; loop fields; `loadAll`); unavailable cues (no asset, unknown and inherited ids, the real manifest fetches nothing); failures (404, 500, network, body, decode `null`, rejecting decoder, invalid entry, no retry, log once, evict-and-retry); deduplication and concurrency; `onReady` (once, after `resolve` serves the cue, unsubscribe, a throwing listener); evict mid-fetch, mid-body and mid-decode, a stale load against a newer one, a ready cue; dispose with in-flight loads and later calls.
  - Integration with the real AudioManager over the fake context (9): decode with the single context created only by the unlock; one-shot silent until ready; a pending loop started once its buffer arrives, with one source across repeated wake-ups, unlocks and plays; two handles on one cue; failed assets stay silent and never throw; a manager-rejected decode; bank disposal mid-decode revives nothing; manager disposed first; the full manifest with test assets stays within 16 live sources and keeps both essential beds.
- **Validation (2026-11-15, PowerShell, `C:\`, on the A2 tree):**

| Gate | Result |
|---|---|
| Vitest, full suite (`--maxWorkers=2`) | **757/757 passed, 45/45 files** (72 new; the 685 existing unchanged) |
| Audio suites (`src/audio`) | 185/185 across 3 files |
| `tsc --noEmit` | Clean |
| ESLint, full project, end-of-line neutralized | 0 errors, 6 warnings (pre-existing, shadcn `src/components/ui`) |
| ESLint raw + Prettier, `src/audio` | Clean |
| Production build | Passes |
| SSR smoke (fresh dev server, port 5243) | HTTP 200, canvas markup, no error strings; stderr holds only the existing `vite-tsconfig-paths` notice |
| `git diff --check` | Clean |
| Freeze | `src/audio/audio-manager.ts`, `src/audio/audio-manager.test.ts`, `src/audio/test/fake-audio-context.ts`, `src/engine`, `src/shared`, `src/rendering`, `src/ui`, `src/components`, `src/routes`, `src/game`, `src/styles.css`, `src/assets`, `src/routeTree.gen.ts`, package and lock files: no diff. No audio file anywhere in the tree |

- **Mutation check (manual, reverted; 10 mutants).** Caught (9): no guard after the fetch (caught only after a body-read assertion was added); no guard after the body (caught only after a mid-body evict test was added); no guard after the decode; no deduplication; logging every failure; no abort on cancel; retrying failed cues. Survived (1, cleanup only): `dispose()` not clearing the listeners; no load can complete after a dispose, so it only frees memory.
- **Limitations:**
  - Proven against fakes only. Real `fetch`, CORS, caching and decoding, including AAC-LC, wait for A6 and the device matrix (Q14).
  - A pending loop needs a manager call after `onReady` to start (risk 13).
  - No cache budget, automatic eviction or retry policy; memory is one buffer per cue at most.
  - Gains, tiers and loop points are placeholders for the A6 listening pass; no cue is playable until A6.
  - The docs are not Prettier-formatted, as at HEAD (repository convention).
- **Owner decisions still open:** Q2 (UI/renderer scopes), Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q14, Q15. A2 decided none of them.

### Step A4a.1 — Loop startup correction — DELIVERED 2026-11-15; AWAITING OWNER REVIEW

- **Task ID:** TASK 008, step A4a.1. **Date:** 2026-11-15.
- **Authorization:** the owner reviewed the read-only A4a.1 design report and approved approach B (the director owns the fade-in, gated by a voice-start query) with decisions 1–8 (docs/08 §1.1): `LoopOptions` (1); a required, side-effect-free `LoopHandle.isAudible()` (2); the bed fade-in advanced only while it is true (3), pausing through mute, host suspension, interruption and a pending resume (4); a manual-resume mode in the fake context, default unchanged (5); the rattle preemption restart limitation accepted and documented (6); the Safari resume retry deferred, `unlock()` unchanged (7); risk 15b confirmed as a fade-in completing before its voice plays (8). Scope: the files of section 2 of the report. **Not authorized:** A4b, `src/ui`, SoundBank, manifest, `test/fake-fetch.ts`, engine, shared, rendering, wallet, RNG, gameplay, dependencies, assets, the Safari resume retry, music.
- **Defects corrected** (docs/08 §14):
  - **Risk 15:** `loop(cue)` started a fitting voice at once at gain 1, rate 1 and an open filter; the director's first setters followed and ramped over about 15 ms. So beds began loud, the rattle at full gain and rate 1.0 instead of 0.4 and 0.85, and the underwater bed unfiltered instead of at 6000 Hz.
  - **Risk 15b:** the director raised a bed's level every frame whether a voice played or not. A bed waiting for the unlock, decoding or a slot reached level 1 and then started at full level (the A4a risk-13 test did exactly this). Variants: mute and host suspension stop the context while the fade advanced; a refused `resume()` re-locks the manager while the started voices live on, so they jumped to full level at the next unlock.
- **Summary:**
  - `audio-manager.ts`: `loop(cue, options?: LoopOptions)` stores the checked initial `gain`, `rate` and `filterHz` on the request before it can start (the setters' rules: gain 0..1, non-finite → 1; rate clamped, non-finite or ≤ 0 → 1; filter clamped at apply, non-finite → Nyquist). `startVoice` already applies request values as plain node values before `start()`, so the values hold whether the loop starts at once or after the unlock, its cue or a slot. `LoopHandle.isAudible()`: request and voice playing, unlocked, not muted, not host-suspended, `context.state === "running"`, not disposed; no `refresh()`, so no promotion, reclaim, node or automation. The inert handle answers false. Documented as an operational playback/fade predicate, not a measurement of output or bus volume.
  - `director.ts`: the filter depth and the duck are computed before new loops start; each loop starts with its values (beds gain 0; underwater bed the depth's filter; rattle the multiplier's gain and rate), recorded as sent. Step 1 advances a bed's level only while `isAudible()` (guarded: a throw is logged once as `loop audible` and counts as not audible). A finished fade is not queried again. Public API and exported constants unchanged.
  - `test/fake-audio-context.ts` (additive): `resumeMode: "immediate" | "manual"` (default `"immediate"`, the previous behavior), `completeResume()`, `failResume()`, `pendingResumeCount`.
- **Golden logs (requirement: no unintended change):** the only change is the approved API shape. The first-frame setter lines of a new loop fold into its `loop` line (for example `loop ambience-underwater#2 gain=0.000 filter=6000` replaces the line and its `gain 0.000` and `filter 6000` lines); every other line and the order are unchanged, checked against a printed run. The determinism and money-never-read tests use the updated `CRASH_ROUND_LOG` unchanged otherwise.
- **Files:** modified `src/audio/audio-manager.ts`, `src/audio/director.ts`, `src/audio/audio-manager.test.ts`, `src/audio/director.test.ts`, `src/audio/test/fake-audio-context.ts`, `src/audio/README.md`, `docs/08_AUDIO_FX_ARCHITECTURE.md` (status, §1.1, §7, §7.2, §7.4, §12, §14 risks 15, 15b and 17, §18), `docs/04_DEVELOPMENT_ROADMAP.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`. No other file.
- **Tests (44 new; the existing tests pass, with the golden-log lines updated as above, the A4a fully-throwing-handles test listing the new `loop audible` kind, and the A4a risk-13 test commented):**
  - Manager (28): M1 `loop(cue)` and `loop(cue, undefined)` unchanged, no automation; M2 immediate start: values on the nodes at `start()` (recorded by wrapping `start`), no automation before the first setter; M3 validation, 15 cases (clamps, NaN, ±Infinity, non-numbers, `null`); M4–M6 the values applied at a start after unlock, after the cue resolves, after a full loop pool frees a slot; M7 a pending setter overrides an option; M8 `isAudible` false while pending for each cause, true while playing, false after `stop`, dispose and on both inert handles, false after a preemption and true after the restart; M9 false while muted, host-suspended or interrupted and true after unmute, resume, a system resume or a new gesture, plus the run flags counting before `context.state` catches up; M10 false while resume is in progress (manual mode) and after a refused or rejected resume, true once one completes, with no duplicate voice; M11 a pure query (no context, resolve, node, automation, run-state change, promotion or clock reclaim).
  - Director (16): D1 a new loop's first frame sends no setter; D2 the initial values per cue, including a bed started under an active duck; D3 no fade progress while not audible, linear `dt / 1.2` steps once audible, a hold mid-fade, no queries after a complete fade, and the rattle not gated; D4 (real manager and bank, risk 13 test reworked) the bed starts at gain 0 after frames that previously completed its fade, then fades over 1.2 s, with repeated `wake()`; D5 (real manager) no progress before unlock, the voice starts at 0 with no ramp, and the underwater bed's filter and the rattle's gain and rate on the nodes at start; D6 (manual resume) the voice holds at 0 until `completeResume()`, and mute, host suspension, interruption, system resume and a new gesture hold and continue the fade; D7 a refused resume then a later unlock fades in from 0, one voice; D8 repeated `wake()` before and after unlock: one voice, the level unmoved; D9 a pause mid-fade gives a fresh handle at 0; D10 a phase change, a `dispose()` or a `pause()` while pending, and a disposal while the cue decodes: the dropped loop never starts; D11 a throwing `isAudible()` is contained, logged once, the bed stays quiet; D12 the determinism and null-manifest tests pass unchanged.
  - **Adjustments to the proposed matrix:** M8 is split into a lifecycle test and a preemption test; M9 and M10 each gained a case (the run-flag lag, and a resume refused under a started voice). M9's lag case was added after a mutation check showed that dropping the run-flag check survived, because the fake changes `state` synchronously. D9 and D11 use the recording manager; D5–D8 and D10 use the real manager with directly resolved cues, so a frame-level gain is read from the voice's node.
- **Mutation check (manual, reverted):** the director without the `isAudible` gate fails 8 tests; the director passing no options fails 21; the manager ignoring the gain and rate options fails 13; `isAudible` calling `refresh()` fails 3; `isAudible` ignoring `context.state` fails 3; `isAudible` ignoring the run flags fails 1 (the lag case).
- **Validation (2026-11-15, PowerShell, `C:\`):** `tsc --noEmit` clean; **967/967 tests across 47 files** (`npx vitest run --maxWorkers=2`; 44 new; 923 recorded for A4a); ESLint 0 errors + 6 pre-existing warnings with end-of-line neutralized, identical to the pre-change tree (stash comparison); the five changed source and test files clean raw and Prettier-clean; production build passes; dev-server SSR smoke HTTP 200 with canvas markup; `git diff --check` clean; LF in every changed file. A pre-change full run reported one unhandled worker error with 46 of 47 files loaded and 919 passing; the post-change run had none (recorded, not reproduced; the earlier note on worker memory applies).
- **Limitations (remaining):** the rattle restarts without an attack after a preemption (accepted; unreachable today); the bed fade-in runs on frame time and its fade-out on the context clock (from A4a); `isAudible()` reads `context.state`, which may lag a real browser by a frame, so a bed can hold at silence one or two frames longer; a refused resume leaves the started loop voices alive on a non-running context (they stay at their held level, no jump); the Safari resume retry is deferred (docs/08 §14 risk 17); not wired, so no browser behavior is exercised until A4b; the provisional values are untuned (A6).
- **Open for the owner:** review of A4a.1; A4b authorization and its UI scope and import exception; the Safari resume-retry step after device verification (Q14).

### Step A4a — Audio Director core — DELIVERED 2026-11-15; AWAITING OWNER REVIEW

- **Task ID:** TASK 008, step A4a. **Date:** 2026-11-15.
- **Authorization:** after the read-only A4 report and the revised A4 plan, the owner split A4 into A4a (the director core, event-to-cue mapping, loop lifecycle, deduplication, unit tests) and A4b (session integration, settings bridge, gesture and visibility lifecycle, integration tests), and authorized A4a only, as one logical commit on `develop`, not pushed. Decisions approved for A4a: **Q7** (cashout cue for the local player's own slots only; crash and jackpot audible to spectators; identical cashout cues merge within one rendered frame, not across frames), **Q8** (music deferred; no `MusicController`; the `music` bus kept), **Q9** (countdown audio deferred; manifest unchanged), **Q15** (respect the iOS silent switch; no audio-session override). Conditions: deterministic, frame-based scheduling with no timers, wall clock or randomness; one-shot deduplication per cue id per frame, verified not to discard distinct events, with intentional merges documented; a director independent of browser APIs, React, `localStorage` and UI stores; every tuning value provisional. **Not authorized:** A4b, every `src/ui` file, `docs/07`, the AudioManager, SoundBank, manifest, `src/audio/test/*`, engine, shared, rendering, wallet, settlement, components, dependencies, assets.
- **Summary** (docs/08 §7.4): `createAudioDirector(events, audio)` returns `update(frame)`, `pause()`, `wake()` and `dispose()`, none of which throws.
  - Listeners only buffer; `update()` advances fades and the duck by `dt`, collects one-shots (events in arrival order, then the boost and tension edges), reconciles the loops with the phase, then plays.
  - Mapping: bet clinks per slot; unspool and splash; cashout coins (local slots, Q7); snap and boom, thud and stinger (spectators too, Q7); shimmer on `chestsRevealed`; lid creak and a tiered coin burst on `chestPicked`; goldfish chime on the boost edge; tension creaks at 2, 3, 5, 10, 20 and 50×.
  - Loops: the surface bed in `idle`; the underwater bed (depth low-pass) and the rattle (gain and rate from the multiplier) while diving; the underwater bed, filter frozen, in `crashed`, `cashed` and `bonus`. One handle per loop cue; each stopped before it is dropped; handle calls only past a change threshold.
  - Merging: each cue id at most once per `update()`. Intentional merges are listed in docs/08 §7.4: the Dual Bet double cashout (Q7) and several thresholds in one frame (highest only) are reachable; a repeated identical event and two chest picks in one frame are not reachable in today's engine. Distinct cues in the same frame are tested not to merge.
  - `pause()` stops every loop (0.05 s), drops buffered events and resets the edges; `wake()` re-sends loop values so a pending loop starts (risk 13); `dispose()` unsubscribes and stops everything.
  - Every manager call and entry point is guarded; each failure kind is logged once.
  - `AudioPhase` is checked at compile time against `EnginePublicState["phase"]`.
- **Files:** created `src/audio/director.ts`, `src/audio/director.test.ts`; modified `src/audio/README.md`, `docs/08_AUDIO_FX_ARCHITECTURE.md` (status, §1.1, §1.3 Q7/Q8/Q9/Q15, §3.2, §3.4, §5, §6, §7, new §7.4, §11, §12, §14 risks 13–16, §18), `docs/04_DEVELOPMENT_ROADMAP.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`. No other file. Nothing imports the director yet.
- **Tests (85 new):** golden cue logs (a full crash round, a jackpot round with a pick, every mapping row); Dual Bet merging in one frame and no merging across frames; distinct cues in one frame not merged; spectator crash and jackpot; chest tiers; boost edge; tension thresholds (once per round, highest only, reset, no replay after a resume); rattle and filter values with clamps; loop lifecycle over both round paths; crossfade; change thresholds and `wake()`; ducking and overlap; `pause()` and `dispose()`; exception containment with a fully throwing manager and fully throwing handles; pending-loop readiness on the real manager and bank; the null-asset manifest on the real stack (no fetch, no source beyond the unlock prime, no log); determinism with clock, timer and random spies; money never read; import boundaries.
- **Mutation check (manual, reverted):** removing the per-frame merge, the boost baseline, the `wake()` gain re-send, the play guard or the paused-event drop fails 2, 25, 3, 2 and 1 tests. Dropping a phase from `AudioPhase` fails `tsc` in `director.ts`.
- **Validation (2026-11-15, PowerShell, on the A4a tree):** `tsc --noEmit` clean; **923/923 tests across 47 files** (85 new; the 838 existing pass unchanged); ESLint 0 errors + 6 pre-existing warnings (end-of-line neutralized), the new files clean raw; production build passes; SSR smoke HTTP 200 with canvas markup; `git diff --check` clean; LF in every changed file; `src/engine`, `src/shared`, `src/rendering`, `src/ui`, `src/components`, the other `src/audio` modules and the package and lock files unchanged.
- **Limitations:** the provisional values are untuned (A6); a loop that starts at once begins at full cue level for about 15 ms before its first gain ramp, an `AudioManager` limit not fixed here (risk 15); `cashedOut` has no owner field, so Phase 8 must add one (risk 16); events between `pause()` and the next `update()` are dropped (none in practice); not wired, so no browser behavior is exercised until A4b.
- **Open for the owner:** A4b authorization and its UI scope and import exception; the ducking (U3), shimmer (U4) and bed-until-betting (U8) choices, implemented as in the revised plan.### Step A3.1 — Sound settings subscriber failure hardening — DELIVERED 2026-11-15; AWAITING OWNER REVIEW

- **Task ID:** TASK 008, step A3.1. **Date:** 2026-11-15.
- **Authorization:** the owner accepted A3 (`16a6a40`) with documented limitations and authorized A3.1 as a separate, narrowly scoped correction of A3 audit finding M1 (the read-only audit of `16a6a40`; not the deferred money-integrity M1). Allowed: `src/ui/store/sound-settings-store.ts`, its test, and the relevant architecture and progress documents. Not authorized: `src/ui/store/store.ts` unless approved after a STOP, other stores, `session.ts`, the `AudioManager`, SoundBank, manifest, engine, shared, rendering, components, dependencies, assets, A4.
- **Defect:** `change()` called `store.set()`, which runs the listeners synchronously, before `write()`. A listener that threw aborted the change after the snapshot moved but before it was saved, so the saved record went stale, the later listeners were not notified, and the error reached the caller. `restore()` called `store.set()` unguarded, so it threw despite its documented never-throws contract.
- **Assessment (requirement 7):** a safe, narrow fix is possible without changing `store.ts`, so no STOP was needed. The fix belongs to the sound settings store's own `subscribe`, which the store already exposes in place of the primitive's.
- **Fix:** `subscribe` wraps each listener in its own try/catch and logs a failure with `console.error("[ui] a sound settings subscriber failed:", error)`, the pattern of the engine event bus (`src/engine/events.ts`) and the SoundBank's `onReady`. A map from the caller's function to its subscription keeps `createStore`'s Set semantics: a duplicate subscribe is one subscription, and any of its unsubscribes (even a stale one) removes it. `store.set()` can no longer throw for this store, so every writer reaches `write()` and `restore()` cannot throw. Unchanged: synchronous, ordered notification; frozen snapshots; equal-value bailout; one-time `restore()`; the first-change-before-`restore()` write; the write order; D1–D8.
- **Rejected alternatives:** (a) persisting before notifying and wrapping `restore()` in try/catch: it saves the record, but a throwing listener still starves every listener after it (in A4 that could be the `AudioManager` sink, leaving a muted user audible), and the writers would still throw; (b) per-listener isolation in `createStore`: it would change notification for every store, which A3.1 does not authorize. It remains a possible later proposal, which would also remove the duplicated isolation pattern; not proposed for approval here.
- **Files:** modified `src/ui/store/sound-settings-store.ts`, `src/ui/store/sound-settings-store.test.ts`, `docs/08_AUDIO_FX_ARCHITECTURE.md` (status, §1.1, §3.5, §12, §18), `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`. No other file.
- **Tests (10 new, node env):** a throwing subscriber during `setMuted`, `setVolume`, `toggleMuted` and `restore()` (no throw, snapshot applied, record saved, later subscriber notified, the failure logged once); a first change before `restore()` still saved and `restore()` still skipped; the saved record never stale (a new store restores the latest values after five changes past a throwing subscriber); re-entrant updates settle on the latest value, saved and seen by all; valid subscribers still synchronous, ordered, with the frozen snapshot; subscription identity as in `createStore`; an unsubscribed throwing subscriber is neither called nor logged. Against the A3 implementation, the 7 failure-path tests fail and the 3 preservation tests pass.
- **Validation (2026-11-15, PowerShell, `C:\`):**

| Gate | Result |
|---|---|
| Vitest, full suite (`--maxWorkers=2`) | **838/838 passed, 46/46 files** (10 new; the 828 existing unchanged) |
| Sound settings suite | 81/81 |
| `tsc --noEmit` | Clean |
| ESLint, full project, end-of-line neutralized | 0 errors, 6 warnings (pre-existing, shadcn `src/components/ui`): the baseline |
| ESLint raw + Prettier, the two changed files | Clean |
| Production build | Passes |
| SSR smoke (fresh dev server) | HTTP 200, canvas markup, no error strings |
| `git diff --check` | Clean |
| Freeze | `src/ui/store/store.ts`, every other `src/ui` file, `src/audio`, `src/engine`, `src/shared`, `src/rendering`, `src/components`, package and lock files: no diff |

- **Limitations:**
  - A failing subscriber is logged, not rethrown: the caller of a writer or `restore()` no longer sees the error. Visibility is the console only, as for the engine and SoundBank listeners.
  - The isolation covers the sound settings store only. Every other store built on `createStore` still lets a throwing subscriber abort its `set()` and starve the later subscribers.
  - The per-listener isolation pattern now exists in three places (engine event bus, SoundBank, this store). Consolidating it would need a `createStore` change and its own approval.
  - The A3 limitations stand (in-memory storage fake only; not wired; no cross-tab sync).

### Step A3 — Sound settings store — DELIVERED 2026-11-15; AWAITING OWNER REVIEW

- **Task ID:** TASK 008, step A3. **Date:** 2026-11-15.
- **Authorization:** the owner authorized A3 after the A3 pre-implementation architecture report, as one atomic commit (docs/08 §1.1). Decisions: D1 (answers Q3: sound on, volumes 1.0, saved preferences override, playback still waits for the gesture); D2 (UI-X1 ratified for the exact A3 files); D3 (`ambience`); D4 (linear 0..1, no loudness curve, mix gains in A4); D5 (salvage valid version-1 fields, reject other versions); D6 (no cross-tab sync, no debounce); D7 deferred to A5 (volume raise and unmute); D8 approved in principle (session wiring in A4; the `session.ts` audio import exception is ratified in A4). Added requirement: A4 must apply the persisted settings before the unlock or any playback, and test it. Not authorized: `src/ui/session.ts`, the AudioManager, SoundBank, manifest, components, gameplay, renderer, engine, shared modules, dependencies, audio assets, A4, A5.
- **Pre-checks:** `develop` was clean and equal to `origin/develop` at `03bb7dc`. Read docs/08 (§1–§3, §6–§7, §11–§18), docs/07 §6 and §9, `src/ui/README.md`, the existing stores (`store.ts`, `notification-store.ts`, `round-store.ts`, `bet-input-store` tests) and the `AudioManager` bus API before any edit.
- **Summary** (docs/08 §3.5):
  - **Pure helpers:** `isValidVolume`, `clampVolume` (finite input clamped to 0..1, -0 → 0, non-finite → ignored), `parseSoundSettings` (statuses `missing` / `valid` / `salvaged` / `corrupt` / `unsupported-version`; never throws), `serializeSoundSettings`, `sameSoundSettings`.
  - **Store:** `createSoundSettingsStore({ storage? })`, a frozen object with `get`, `subscribe`, `restore`, `setMuted`, `toggleMuted`, `setVolume(channel, value)`. Frozen snapshots; equal-value writes notify nobody. Raising a volume does not change `muted` (D7).
  - **Persistence:** one record `{ version: 1, muted, master, music, ambience, sfx }` under `aquadive.soundSettings`, written at once on each change. Storage is resolved at call time; resolving it, `getItem` and `setItem` are each in try/catch, and a failed write keeps the in-memory change. A read never writes back. A stored volume outside 0..1 takes its default (not clamped).
  - **Lifecycle:** construction reads nothing (SSR-safe). `restore()` runs once and reports what it found, or `skipped`. A user change before `restore()` wins, is saved even when it equals the current value, and makes `restore()` a no-op.
  - Imports only `./store`; nothing imports the new module. Not wired.
- **Files:** created `src/ui/store/sound-settings-store.ts`, `src/ui/store/sound-settings-store.test.ts`; modified `src/ui/README.md` (one table row), `docs/07_UI_ARCHITECTURE.md` (one row in the §9 store table), `docs/08_AUDIO_FX_ARCHITECTURE.md` (status, §1.1, §1.3 Q2 and Q3, §3.2, new §3.5, §12 row, §13.2 row, §14 risk 14, §18), `docs/04_DEVELOPMENT_ROADMAP.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`. No other file.
- **Tests (71 new, node env):** defaults and channels (4); volume helpers and `sameSoundSettings` (4); serialize / parse (24: round-trip, missing, 7 corrupt inputs, 5 unsupported versions, salvage of bad and missing fields, out-of-range and wrong-type volumes, non-boolean `muted`, extra fields, boundaries); construction and SSR safety (4); the global `localStorage` resolver, including a getter that throws (2); `restore()` (16: overrides, single read, no write-back, every status, a throwing resolver and `getItem`, notification, run-once, a user change first, an ignored write first); writers (10: mute and toggle, each channel, clamping, ignored input, D7, equal-value bailout, snapshot identity, unsubscribe); persistence (7: immediate full-record writes, no write for equal values, round-trip across stores, overwriting a corrupt or unsupported record on change, a throwing `setItem`, storage resolved per write, own key only).
- **Validation (2026-11-15, PowerShell, `C:\`, on the A3 tree):**

| Gate | Result |
|---|---|
| Vitest, full suite | **828/828 passed, 46/46 files** (71 new; the 757 existing unchanged). A first run on the same tree had one timeout: `screen.round.test.tsx`, "remount after a pick", at the 5 s default under full parallel load. It passed alone (9/9) and in the clean second full run; no test was changed |
| Sound settings suite | 71/71 |
| `tsc --noEmit` | Clean |
| ESLint, full project, end-of-line neutralized | 0 errors, 6 warnings (pre-existing, shadcn `src/components/ui`) |
| ESLint raw + Prettier, the two new files | Clean |
| Production build | Passes |
| SSR smoke (fresh dev server) | HTTP 200 (port 5244), canvas markup, no error strings; stderr holds only the existing `vite-tsconfig-paths` notice |
| `git diff --check` | Clean |
| Freeze | `src/ui/session.ts`, every other `src/ui` source and test, `src/audio`, `src/engine`, `src/shared`, `src/rendering`, `src/components`, `src/routes`, `src/game`, `src/styles.css`, `src/assets`, `src/routeTree.gen.ts`, package and lock files: no diff. No audio file in the tree |

- **Environment note:** many files in this working tree are CRLF while the index is LF (`git ls-files --eol`), so raw full-project ESLint reports about 7,480 `Delete ␍` Prettier errors that are not in the repository. The gate above neutralizes end-of-line, as in A2. The files A3 touches are LF.
- **Limitations:**
  - Proven against an in-memory storage fake and Node's missing `localStorage`. A real browser's `localStorage`, including private-mode and quota behavior, is not exercised until the settings are wired (A4) and controllable (A5).
  - No effect on sound yet: nothing reads the store until A4, and nothing writes it until A5.
  - A second tab's change is not seen until reload (D6).
  - The docs are not Prettier-formatted, as at HEAD (repository convention).
- **Owner decisions still open:** Q2 (UI/renderer scopes beyond A3), Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q14, Q15; D7 (A5); the `session.ts` audio import exception (D8, at A4).

---

## TASK 007 — Sprint 4: User Interface (COMPLETED 2026-11-15, started 2026-08-17)

Tracking note (process deviation, recorded for provenance): Commit U1 (`140790f`) landed without the per-commit tracking updates to docs 14/15/16 that every prior sprint's commits carried. The gap was caught by the U2 preparation audit (2026-08-17) and closed by this dedicated documentation catch-up commit; the entries below are recorded retroactively from the commit itself and the audit's verification.

### Commit U0 — UI Architecture approval (no separate code commit)

- Date: 2026-08-17
- Summary: `docs/07_UI_ARCHITECTURE.md` (drafted at Sprint 3 close-out, status "proposed") approved by the owner — the §17 U0 step. Approval makes the document the binding contract for the UI layer and ratifies the five sanctioned behavior deltas V1–V5 (§7): session-scoped settlement/wallet (V1), centralized notification timing + dev rejection surface (V2), per-slice store subscriptions (V3), bet-input sanitation (V4), responsive desktop layout (V5). The document predates the restored baseline commit, so no separate commit carries it; its status header was updated to "Approved and binding" in this catch-up.
- Files modified: none at approval time (`docs/07_UI_ARCHITECTURE.md` status header updated in this catch-up commit).
- Architectural decisions: as recorded in the document itself — four-layer `src/ui/` (session → stores → components → strings), hand-rolled store primitive (no state-management dependency), wallet store as the Phase 8 settlement seam, extraction order U1–U7.
- Risks: none to the running game (documentation approval only).

### Commit U1 — Session module + store primitive + useStore hook

- Date: 2026-08-17 (committed as `140790f`; approved by the owner the same day)
- Summary: §17 step U1. `src/ui/session.ts` is the composition root (§8): `createGameSession(deps)` factory (injectable authority, world Rng, and renderer factory — the test seam) plus the production module singleton preserving the SSR-safe module-scope semantics; construction is inert (no DOM, no rAF, no clock — driver starts only on canvas attach). `attachCanvas(canvas, sync)` constructs the per-mount `SceneRenderer`, attaches the driver with frame = resize + render (verbatim from the shell's sink) and sync = the host's public-state mirror, and returns the detach (pauses driver, disposes renderer; everything else survives — docs/06 §13). `src/ui/store/store.ts` is the §9 `createStore` primitive (synchronous snapshot reads, Object.is bailout, subscribe/unsubscribe); `src/ui/hooks/use-store.ts` binds React via `useSyncExternalStore` with selector-level subscription. `AbyssAnchor.tsx` consumes the session (engine/driver/renderer construction and the module-scope singletons left the component); mid-migration seams explicitly documented in-file: settlement listeners and the per-frame HUD mirror remain component-side until U2/U4, and `attachCanvas`'s sync-callback parameter is the transitional seam U4 replaces with the round-store write. No sanctioned delta lands in U1.
- Files modified: new — `src/ui/session.ts`, `src/ui/session.test.ts`, `src/ui/store/store.ts`, `src/ui/store/store.test.ts`, `src/ui/hooks/use-store.ts`, `src/ui/README.md`; modified — `src/components/AbyssAnchor.tsx` (consumes `gameSession`; construction code deleted).
- Architectural decisions: per §8/§9 as specified — factory + module singleton so tests construct deterministic sessions while production initialization order is unchanged (§20 risk 5); the renderer factory is injectable because `SceneRenderer` needs a real 2D context; `attachCanvas` accepts the host sync callback as a documented U1→U4 seam.
- Risks: none open. Validation (per the commit and re-verified by the 2026-08-17 U2 audit): `tsc --noEmit` clean; **93/93 tests green** (10 new: 6 store-primitive semantics — set/subscribe/Object.is bailout incl. NaN, unsubscribe isolation; 4 session tests — inert construction, attach drives resize/frame/sync, optional sync, detach/re-attach remount semantics with engine state surviving); engine/renderer freeze check clean (`140790f` touches only `src/components` and `src/ui`); working tree clean after commit. Manual gameplay pass: owner approved 2026-08-17.

### Sprint 4 close-out — Step 4: official close-out (2026-11-15) — COMPLETED; TASK 007 / SPRINT 4 / PHASE 6 CLOSED

- **Task ID:** TASK 007 (Sprint 4, Phase 6). **Date:** 2026-11-15.
- **Owner acceptance — OWNER APPROVED — 2026-11-15.** The owner completed and approved:
  - manual gameplay QA, including Dual Bet, with BET 1 and BET 2 behaving independently;
  - cashout and gameplay acceptance;
  - mobile gameplay at 375×667 and 390×844;
  - the full seven-size screenshot matrix (375×667, 390×844, 768×1024, 1280×720, 1366×768, 1440×900, 1920×1080);
  - the ship, waterline and chain connection; the anchor descent, landing and slack chain; the illustrated sea floor; the redesigned Bonus Chest.

  This satisfies docs/07 §19 gates 7 and 8. It also records the E-X3 Dual Bet browser QA, which had no owner record until now. It is not to be requested again unless a later change materially affects the approved behavior or visuals.
- **E-X4 ratified** (renderer visuals; docs/07 §19 gate 4). The documented 19-file list was compared with `git diff --name-only be10b19 -- src/rendering src/assets`: an exact match, with no other rendering or asset file and nothing untracked. `src/rendering/render-state.ts`, `src/engine` and `src/shared` show no diff from `be10b19`. Committed parts: `c046b33`, `81eb985`, and the last seven files in G2 `9bded6b`. E-X4 is retrospective and file-limited. It authorizes no further renderer work, and the renderer is frozen again.
- **D1–D4 ratified** as approved QA improvements (docs/07 §15), including the departures recorded there.
- **Commits** (explicit path staging; no amend, rebase, reset, stash or force-push):

| Group | Commit | Message | Files |
|---|---|---|---|
| G1 | `6e28ce0` | `feat(ui): redesigned Bonus Chest` | `src/ui/components/ChestPicker.tsx`, `src/ui/components/icons.tsx` |
| G2 | `9bded6b` | `feat(rendering): slack chain, anchor descent and sea-floor landing (E-X4)` | `src/rendering/draw/chain.ts`, `draw/sea-floor-art.ts`, `draw/sea-floor-art.test.ts`, `layers/actor.ts`, `layers/effects.ts`, `layers/world.ts`, `src/assets/sea-floor.png` |
| G3 | `3346ed8` | `fix(config): move preview options under vite` | `vite.config.ts` |
| G4 | this commit | `docs: Sprint 4 Phase 6 official close-out` | docs 04, 07, 14, 15, 16 |

  G1–G3 commit the owner-approved working-tree content byte for byte; nothing was edited between acceptance and commit. The accepted browser QA therefore still applies, and no check had to be repeated.
- **Quality gates** (run after G1–G3, on `3346ed8`):

| Gate | Result |
|---|---|
| Vitest, full suite | **572/572 passed, 42/42 files** (250 s) |
| `tsc --noEmit` | Clean |
| ESLint, full project, end-of-line neutralized | 0 errors, 6 warnings (pre-existing, shadcn `src/components/ui`) |
| ESLint + Prettier, raw, the 9 changed source files | Clean |
| Production build | Passes |
| SSR smoke (dev server) | HTTP 200, canvas markup present |
| `git diff --check` (G1–G3, and the docs) | Clean |
| Freeze audit | `src/engine`, `src/shared`, `render-state.ts`: no diff since `be10b19`. `src/rendering` + `src/assets`: the 19 E-X4 files only |

  **Test environment findings (not code defects).** On this Windows machine, Vitest must run from a working directory with an uppercase drive letter (`C:\…`). From `c:\…`, all 42 files fail to load with `TypeError: Cannot read properties of undefined (reading 'config')`, because the runner loads twice under two path casings. A one-assertion probe test fails the same way. At default parallelism, forked workers ran out of memory (5 files and 64 tests not run). The recorded result used `npx vitest run --maxWorkers=2` from `C:\Users\…`. Neither finding is a regression, and neither needs a code change.

#### Sprint 4 completion report — FINAL (2026-11-15)

Compared with docs/07 §22 (Definition of Done):

| # | Criterion | Status |
|---|---|---|
| 1 | `src/ui/` per §16; `AbyssAnchor.tsx` deleted; route mounts `GameScreen` | Met (`4440009`). §16 corrected for `scene-fit.ts`, `use-focus-rescue.ts` and `store/payout.ts` |
| 2 | V1–V5 landed; no other behavior change | Met. Every other change is owner-approved: E-X1–E-X4, M1, D1–D4, the Bonus Chest redesign |
| 3 | Money math in one module, settlement session-scoped | Met (`wallet-store.ts` + `payout.ts`, M1-D8) |
| 4–6 | One owner per value; notifications via the store; strings in `strings.ts` | Met in U4–U6 |
| 7 | Mobile layout; desktop owner-approved | Met by owner approval 2026-11-15. Mobile is approved as it now is, not as byte-identical: it changed by owner decision (Dual Bet, `tab`, D1) |
| 8 | Every commit passed the §19 gate | Met for the closed tree. Exceptions recorded, not hidden: `c046b33` and the web-editor commits have no validation run of their own; the close-out gates cover the tree they produced |
| 9 | Test tiers 1–3; final count recorded | Met: **572 tests across 42 files** (83 entering the sprint) |
| 10 | Docs current | Met: 04, 07, 14, 15, 16 updated in G4. `src/ui/README.md` was last updated in `c046b33` |
| 11 | Close-out + retrospective, with the minor-units decision | Met: below. Minor units: M1 deferred, not closed; M2 with B-R tracked separately |

#### Sprint 4 Retrospective

**Accomplished:** the whole docs/07 §17 plan, U0–U7: `AbyssAnchor.tsx` dissolved into a session-owned composition root, framework-agnostic stores (wallet, round, notification, bet input), single-responsibility components, a notification system, a strings seam and the responsive `tab`/`desk` layout. All five sanctioned deltas V1–V5 landed. Beyond the blueprint, under explicit owner approval: bonus eligibility (E-X1), engine-side stake validation (E-X2), Dual Bet with two independent engine slots (E-X3), the M1 money-integrity work (BigInt payout rounded down, wallet rules W1–W11, landed in `e37b81c` and `e8b1b62`), the QA fixes D1–D4, the renderer visuals (E-X4) and the redesigned Bonus Chest. The suite grew from 83 to 572 tests, including the DOM characterization tier. The engine contract stayed intact, and the renderer's `RenderState` contract never changed.

**Lessons learned:**

1. **Freeze exceptions belong before the work.** The renderer visuals started in the working tree under a frozen directory, and E-X4 had to be approved and then ratified after the fact. The work survived because it was kept untouched, hashed before and after every run, and its file list was verified against Git. Next time, the exception and its file list are approved first.
2. **Web-editor commits bypass the gates.** Commits made through the connected editor landed on `develop` with no §19 run and messages that do not describe their content (`c046b33`, `Update lockfile`, holds the close-out Step 2 work). Pushed history is not rewritten (AGENTS.md), so the documents carry the reconciliation instead. Gated work should not be auto-committed from the editor.
3. **Characterization pins paid off again.** The U3 DOM pins and the U2 golden ledgers kept "verbatim" checkable through componentization, Dual Bet and M1.
4. **Layout needs eyes.** Agent-run browser QA found the ship off-canvas on every phone (D1), which no automated test could see. Keeping §19 gates 7–8 manual was correct.
5. **A mid-sprint security review can outgrow its sprint.** M1 roughly doubled Sprint 4's decision load. The numbered decision log (M1-D1 … M1-D16, Q1–Q14) kept it auditable, but M1 still ends the sprint deferred, not closed. Comparable findings should get their own task from the start.
6. **The Windows test environment is fragile.** The intermittent worker crash from Sprint 3 now has two concrete causes: the lowercase drive letter and memory pressure at default parallelism. Both are recorded above.

**Deferred work (tracked, not closed):**

- **M1:** deferred by the owner to the final stabilization phase. It is **not closed**. Its implementation is in Git (`e37b81c`, `e8b1b62`).
- **M2** (integer minor units) and **B-R** (the exact integer-cent ledger): tracked separately, **not started**.
- **Recovery items 1–3** (docs/16): line-ending normalization and `.gitattributes` (`src/rendering/theme.ts` is still CRLF in the index); a stable `main` branch; scaffold leftovers. `4d44a50` resynced `bun.lock`, but item 3 stays open until it is resolved on its own.
- The favicon 404; the Phase 8 limitation of E-X1; jackpot RTP economics (TASK 001).
- `docs/18` asks for a stable `main` that does not exist yet (recovery item 2). This close-out pushes to `develop` only.

**Project status:** Phase 6 is complete. The project is **not production-ready**: M1 is not closed, M2 and B-R are not started, and the platform is still a single-client game with no backend (Phase 8).

**Phase 7 readiness:** Phase 7 (Audio & Visual Effects) is the next planned phase. It is **not started**. Following the Sprint 2–4 pattern, it should begin with a planning step: a blueprint for the Audio Manager and the effects work, including where it may touch the frozen renderer (that needs its own exception), reviewed and approved before any code.

### Sprint 4 close-out — Step 3: visual acceptance, Git reconciliation and final gates (2026-11-15) — superseded by Step 4 (the official close-out)

- **Owner visual acceptance (2026-11-15).** The owner approved the visual implementation as it stands: ship appearance and waterline; the initial anchor position and chain connection; anchor descent and the sea-floor landing animation; the slack-chain animation; the illustrated sea floor; the redesigned Bonus Chest; the existing gameplay presentation. These visuals are not to be redesigned or replaced.
- **Approvals recorded.**
  - **E-X4, renderer visuals** (owner-approved 2026-11-15, recorded retroactively, docs/07 §19 gate 4). Presentation only. Its file list, from `be10b19` to the close-out tree, is 14 renderer source files, 4 renderer tests and `src/assets/sea-floor.png`. `render-state.ts`, `src/engine` and `src/shared` are untouched.
  - **D1–D4 accepted** (docs/07 §15), including the Step 2 scope flags: the D1 zoom-out on short stages, and D2–D4 against the §20 a11y non-goal.
  - Step 2 blockers 1 (D1–D4) and 4 (the renderer work) are resolved.
- **Git history reconciled** (Step 2 recorded `develop` = `be10b19` with everything uncommitted; that was out of date):

| Commit | Date | Content |
|---|---|---|
| `c046b33` | 2026-11-14 | Message `Update lockfile`, but it holds the close-out Step 2 docs (04, 06, 07, 14, 15, 16), the D1–D4 fixes (`scene-fit.ts`, `use-focus-rescue.ts`, `screen.a11y.test.tsx`, `session.ts`, `strings.ts`, `BetControls`, `BettingPanel`, `ChestPicker`) and the first part of the renderer work (`chain`, `ship`, `theme`, layers, `presentation.ts`). Not rewritten: it is pushed (AGENTS.md) |
| `5c5741a`, `95e38ac`, `d26699a`, `9d083bd` | 2026-11-14/15 | Web-editor edits to `vite.config.ts` (net: a top-level `preview` block) |
| `1491b67` … `2b8d51b` (7 commits) | 2026-11-15 | Web-editor edits to `package.json` |
| `9ef35e9` | 2026-11-15 | Repairs the `package.json` scripts block (net since `be10b19`: a `start` script) |
| `4d44a50` | 2026-11-15 | Syncs `bun.lock` with the devDependencies |
| `81eb985` | 2026-11-15 | Renderer visuals: new ship, floating pre-dive anchor, illustrated sea floor (E-X4) |

  None of these commits has a recorded §19 validation run of its own. The gates below cover the current tree.
- **Close-out preparation (this step, uncommitted):**
  1. `src/ui/components/icons.tsx`: the six `prettier/prettier` errors in `TreasureChestArt` fixed by Prettier (line wrapping only; the SVG is unchanged).
  2. `ChestIcon` removed from `icons.tsx`. It was confirmed safe: no importer in `src` (the redesigned `ChestPicker` uses `TreasureChestArt`), no test reference, and `tsc` and the build pass without it.
  3. Documentation reconciled: 04, 07 (§13.3, §15, §19 gate 4), 14, 15, 16.
- **Working tree under test:** `81eb985` plus the uncommitted rest of E-X4 (`chain.ts`, `sea-floor-art.ts` + test, `actor.ts`, `effects.ts`, `world.ts`, `sea-floor.png`), the Bonus Chest redesign (`ChestPicker.tsx`, `icons.tsx`), the `vite.config.ts` fix (moves `preview` under `vite:`, as the config package's header requires) and this step's docs. No gameplay, engine or contract file changed in this step.
- **Quality gates (2026-11-15):**

| Gate | Result |
|---|---|
| Vitest, full suite (PowerShell, `C:\`) | **572/572 passed, 42/42 files** (200 s) |
| `tsc --noEmit` | Clean |
| ESLint, full project, end-of-line neutralized | 0 errors, 6 warnings (pre-existing, shadcn `src/components/ui`) |
| ESLint + Prettier, raw, the 9 changed source files | Clean |
| `git diff --check` | Clean |
| Production build | Passes |
| Freeze audit | `src/engine`, `src/shared`: no diff since `be10b19` (E-X3 is the last change). `render-state.ts` unchanged. `src/rendering`: E-X4 files only |

- **Phase 6 is not closed.** Open: §19 gate 7 (owner manual gameplay on the Dual Bet build, including 375×667 and 390×844); §19 gate 8 (owner approval of the 7-size screenshot matrix: the visual acceptance covers the listed visuals and is not recorded as the matrix approval without the owner's word); the owner's E-X3 browser QA; Git authorization for the close-out commits; the retrospective (docs/07 §22 item 11). Non-blocking items are unchanged (favicon 404, M1 deferred, M2/B-R, recovery items 1–3, the E-X1 Phase 8 limitation). **Phase 7 is not started.**

### Sprint 4 close-out — Step 2: browser QA, QA fixes and quality gates (2026-11-14) — superseded by Step 3 (D1–D4 accepted; committed in `c046b33`)

- **Scope.** TASK 007 / Sprint 4 only. The tree under test is `be10b19` plus the uncommitted Sprint 4 QA fixes below, **plus the owner's uncommitted renderer work** (`src/rendering/draw/chain.ts`, `src/rendering/theme.ts`, untracked `src/rendering/draw/chain.test.ts`). The renderer work was present for every browser run and every gate, and it was not reviewed, changed, staged or stashed. Its SHA-256 hashes were checked before and after and are unchanged. **`be10b19` without the renderer work was not browser-tested separately.**
- **Method.** Agent-run browser QA: headless Chrome driven over the DevTools protocol against `npm run dev` (port 5180). Phones and tablets are emulated with mobile metrics at DPR 2, desktops at DPR 1. Outcomes are forced only by a harness-side `Math.random` wrapper that answers the engine's outcome samplers (crash 2.5×; crash 200× with a 60× jackpot and 2.00× chests). No application code takes part in the forcing. Inputs are real mouse and keyboard events (no touch emulation). **These are agent-run checks. They are not the owner's manual gameplay pass (§19 gate 7) and not the owner's screenshot approval (§19 gate 8).**
- **Earlier QA, collected and evaluated (not repeated).** Two earlier sessions on 2026-11-14 ran the layout probe and the gameplay matrix before and after the fixes, but recorded no report. Their results (375×667, 390×844, 768×1024, 1366×768, 1920×1080) were re-read and evaluated here. The 375×667 and 390×844 gameplay runs had been interrupted (empty result files). Their completed reruns (21:08–21:12, after the last source edit at 19:13) are the recorded results. This step added only the two missing matrix sizes, 1280×720 and 1440×900.
- **Defects confirmed and fixed (uncommitted, `src/ui` only):**
  1. **D1, the surface ship was off-canvas on every phone and portrait-tablet stage.** The frozen renderer draws the idle ship 400 px above the anchor pin (pinned at 55 % of the canvas height), so any stage shorter than about 800 px cut it off. That was 427 px at 375×667, 604 px at 390×844 and 694 px at 768×1024, after Dual Bet. This violated the owner's Dual Bet requirement that the canvas show the ship. **Fix:** `src/ui/scene-fit.ts` (new, pure) plus `session.ts`. Below 820 logical px the session passes the renderer a zoomed-out logical viewport with the same aspect ratio. The backing store stays at native resolution (an exact `length × dpr` product, so the renderer never re-allocates per frame). Canvases 820 px and taller pass through unchanged. No renderer file changed. Evidence: `before-375x667-dive` shows no ship; after the fix, the ship is fully visible at all 7 sizes (layout probe).
  2. **D2, keyboard focus was lost after a bet.** When the focused control disabled itself (PLACE BET → BET LOCKED, CASH OUT → SECURED / WAITING…, stake field locked for the dive), the browser dropped focus to `<body>`. **Fix:** `src/ui/hooks/use-focus-rescue.ts` (new). Each slot panel is a focus scope (`tabIndex={-1}`), and focus moves to the panel instead.
  3. **D3, the chest picker was not reachable by keyboard in time.** **Fix:** the picker is a named group and a focus scope. When it opens while focus is parked, focus moves to the first chest, and it returns when the picker closes. Each chest has a "Chest n of 3" description.
  4. **D4, the stake fields had no accessible name and no visible focus indicator.** **Fix:** `aria-label` "BET n stake" and a gold `focus-within` ring.
  - Tests: `src/ui/scene-fit.test.ts` and `src/ui/screen.a11y.test.tsx` (new). In `src/ui/session.test.ts`, one resize assertion is rewritten for the scene fit. Strings are added in `strings.ts` (`stakeLabel`, `chests.position`), and `src/ui/README.md` is updated.
  - **Scope flags for the owner.** D1 changes the canvas content on phones and portrait tablets (a uniform zoom-out of about 0.52 at 375×667, 0.74 at 390×844 and 0.85 at 768×1024). That departs from §22 item 7 ("mobile byte-identical") and from the §15 note that sizes stay fixed in pixels. D2–D4 touch §20's non-goal "no accessibility overhaul". All four fixes are small and stay inside `src/ui`, but each needs the owner's explicit acceptance (docs/07 §15 note).
- **Browser QA results (after the fixes):**

| Check | 375×667 | 390×844 | 768×1024 | 1280×720 | 1366×768 | 1440×900 | 1920×1080 |
|---|---|---|---|---|---|---|---|
| No horizontal or vertical overflow, no overlapping regions, no off-screen buttons | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Ship fully visible at idle; anchor and chain visible | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Dual Bet: both PLACE BET → both debited (−3.00 for 1 + 2) | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Independent cashout: BET 1 cashes; BET 2 keeps CASH OUT and rides to the crash | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Crash: the uncashed slot loses its stake; the final balance equals start − stakes + the BET 1 win | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Jackpot (60×) → BET 2 auto-cashed, chest picked by keyboard, chest credit once (+60.00) | Pass | Pass | not run | Pass | Pass | Pass | not run |
| Keyboard: Tab order, accessible names, focus kept in the slot after PLACE BET and into the dive | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Console during play | favicon 404 only | favicon 404 only | favicon 404 only | favicon 404 only | favicon 404 only | favicon 404 only | favicon 404 only |

  - Button timeline at every size: `PLACE BET` → `BET LOCKED · DIVE IN` → `CASH OUT · x` → `SECURED +x · WATCHING DIVE…` (the cashed slot, while the other stays `CASH OUT`) → `WAITING…` (crash, impact, bonus) → `PLACE BET`.
  - **Harness notes, evaluated as false alarms.** At 390×844 (1.77 at a sampled 1.7626×) and in the 390 and 1366 jackpot runs, a payout was above `floor(stake × the multiplier sampled after the cashout)`. The multiplier includes a decaying goldfish-boost bonus (`src/engine/simulation.ts`), so it can fall after the cashout tick. The payout used the tick-authoritative value, and the other slot's label (for example `CASH OUT · 3.52` = floor(2 × 1.7626)) is consistent. Where the note shows a win below the later sample, the multiplier simply kept rising.
  - **Console.** The only error is `Failed to load resource: 404` for `/favicon.ico` (no `public/` directory, no icon link). It is logged once per fresh browser profile and was confirmed with `curl`. It is cosmetic and not fixed (adding an asset is outside Sprint 4's scope); the owner decides.
  - **Not covered by this pass:** real devices and touch input; a real-browser remount during Dual Bet; a spectator bonus and the 6 s chest auto-pick in the browser (both are covered by the automated suites, and by the owner's earlier U4b-6 check, which predates Dual Bet); BET 2 cashing before BET 1 (covered by `screen.dual.test.tsx`); quick-bet clicks on `tab`/`desk`; jackpot at 768×1024 and 1920×1080.
- **Quality gates (working tree as above):**

| Gate | Result |
|---|---|
| Vitest, full suite (PowerShell, `C:\`) | **539/539 passed, 39/39 files** (256 s). An earlier Git Bash run that "failed" all 39 files at load is the known lowercase-drive environment issue, not a test result |
| `tsc --noEmit` | Clean |
| ESLint, full project, raw | **Fails, 7,861 problems.** Prettier end-of-line errors from CRLF working-tree files (open recovery item 1) |
| ESLint, end-of-line neutralized | **0 errors, 6 warnings**, all pre-existing (`react-refresh/only-export-components` in shadcn `src/components/ui`). Below the recorded 7 + 6 baseline |
| ESLint, raw, the 10 changed and new `src/ui` files | Clean |
| Production build | Passes (one Nitro config warning: `inlineDynamicImports` ignored) |
| SSR smoke (dev server) | HTTP 200, canvas markup, title present |
| `git diff --check` | Clean outside `src/rendering`. `src/rendering/theme.ts` fails it, because the owner's renderer work rewrote the file with CRLF line endings. Not touched |
| Freeze audit | `src/engine` and `src/shared`: no diff. `src/rendering`: only the owner's pre-existing renderer work. The QA fixes import `MAX_DPR` from `@/rendering/constants` (read-only) |

- **Git.** Nothing staged, committed, pushed or stashed. `develop` = `origin/develop` = `be10b19`.

### Sprint 4 completion report — DRAFT (2026-11-14), awaiting owner acceptance; Phase 6 NOT closed — superseded by the final report in Step 4 (2026-11-15)

Compared with docs/07 §22 (Definition of Done):

| # | Criterion | Status |
|---|---|---|
| 1 | `src/ui/` per §16; `AbyssAnchor.tsx` deleted; the route mounts `GameScreen` | Met in `4440009`. The QA fixes add `src/ui/scene-fit.ts` and `src/ui/hooks/use-focus-rescue.ts` (not in §16; to be recorded on acceptance) |
| 2 | Deltas V1–V5 landed; no other behavior change | V1–V5 landed (V5 with the owner's corrections, §15). Additional changes are owner-approved (E-X1, E-X2, E-X3, M1). The QA fixes D1–D4 are **pending acceptance** |
| 3 | Money math in one module, settlement session-scoped | Met (`wallet-store.ts` + `payout.ts`, M1-D8). Dual Bet settlements verified in the browser at 7 sizes |
| 4–6 | One owner per displayed value; notifications via the store; strings in `strings.ts` | Met in U4–U6 (validated then; not re-audited in this step). The new a11y strings are in `strings.ts` |
| 7 | Mobile byte-identical (screenshot-verified); desktop owner-approved (§19.8) | **Open.** Mobile has changed by owner decision (Dual Bet panel) and by D1 (pending). Agent screenshots exist for all 7 sizes; the **owner's visual approval is required** |
| 8 | Every commit passed the §19 gate | `be10b19` has no recorded validation. The current tree passes gates 1–6 (above). **Gate 7 (owner manual gameplay) and gate 8 (owner screenshot approval) are open** |
| 9 | Test tiers 1–3; final count recorded | Met: 539 tests across 39 files (including the renderer WIP's `chain.test.ts`) |
| 10 | Docs current | Updated in this step (04, 07, 14, 15, 16, `src/ui/README.md`) |
| 11 | Close-out + retrospective in PROGRESS, with the minor-units decision | Minor units: decided (M1 deferred to final stabilization, not closed; M2 with B-R tracked separately). **The retrospective follows the owner's acceptance** |

**Blockers to closing Sprint 4 / Phase 6 (owner actions):**

1. **Acceptance of the QA fixes D1–D4**, including the scope flags above, and Git approval to commit them. Until then, `origin/develop` still hides the ship on phones.
2. **§19 gate 7:** the owner's manual gameplay pass on the Dual Bet build (full loop, plus 375×667 and 390×844).
3. **§19 gate 8:** the owner's approval of the screenshot matrix (7 sizes).
4. **The renderer work in the working tree** (frozen directory, no exception covers it): the owner decides whether it becomes a separately approved exception, stays out of Sprint 4, or is dropped. The browser QA above ran with it present.

**Non-blocking, tracked separately:** the favicon 404; M1 deferred, not closed; M2 / B-R; recovery items 1–3 (line endings, a stable `main`, scaffold leftovers); the Phase 8 limitation of E-X1.

### Engine freeze exception E-X3 — Dual Bet — COMMITTED (`be10b19`) AND PUSHED

- Date: 2026-11-14. Owner-approved engine freeze exception (docs/06 §13.2). The commit message is `feat: update engine and UI state handling` and does not name E-X3. The commit is already on `origin/develop`, so it is not amended (AGENTS.md).
- Summary: the local player holds two independent bets per round, BET 1 and BET 2.
  - **Engine:** `placeBet`/`cashOut` carry a mandatory `slot`. Guards apply per slot, and `invalid-slot` is a new reason. Impact auto-cash is per slot. There is one chest pick per round, applied to every eligible slot. `participants` replaces `participant`, and the snapshot schema is v3.
  - **Wallet:** every M1 rule applies per slot, with per-slot fault isolation. W2 and W3 are amended per slot (docs/07 §23.17).
  - **Session:** `betInputs` per slot, and the in-flight stake reservation on `submit` (docs/07 §8).
  - **UI:** the dual betting panel (docs/07 §13.3, §15).
- Files modified (35):
  - **Engine:** `src/engine/commands.ts`, `events.ts`, `state-machine.ts`, `game-engine.ts`, `index.ts`, plus three engine test files.
  - **UI:** `src/ui/session.ts`, `src/ui/strings.ts`, `src/ui/store/wallet-store.ts`, `src/ui/store/round-store.ts`, and the components `ActionButton`, `BetControls`, `BettingPanel`, `ChestPicker`, `MultiplierOverlay`, `QuickBets`, `action-state.ts`.
  - **Tests and harness:** new `src/ui/session.dual.test.ts`, `src/ui/store/wallet-store.dual.test.ts`, `src/ui/screen.dual.test.tsx`, `src/ui/test/wallet-view.ts`; updated UI suites and harness.
  - **Not touched:** `src/rendering` and `src/shared`.
- Architectural decisions: slot identity lives in the command and event payloads. The engine stays balance-free, and the two-bet affordability is a session-edge reservation. The single-bet behavior is preserved for one slot.
- Validation: **not recorded.** The commit message lists no results, and no test, type-check, build or browser QA run for this commit is documented. Owner browser QA for Dual Bet, at the priority sizes 375×667 and 390×844, is pending.
- Risks: per-slot money paths are new settlement surface. They are covered by the new dual suites, but no run of those suites is recorded here. Phase 8 must carry slot identity into the server bet identity.

### Commit — M1 money-integrity test suites (`e8b1b62`) — COMMITTED AND PUSHED

- Date: 2026-11-14. The M1 test work held back from `e37b81c`: session-level money integration (MT-06 scale runs, invalid stakes, W10/W11 and R2 claim paths), MT-09, MT-10, payout and wallet-store cases, and the binary floor-cents oracle. MT-06 seed 404 is replaced by 505, because 404 has no chest pick, so its path-coverage check could not pass. No assertion was removed.
- Validation (from the commit message): tsc clean, 469/469 tests, lint clean on the changed files, validated in isolation on top of `4440009`.
- M1 remains deferred and **not closed**; this commit adds tests only.

### Commit U6 + U7 — Componentization (V3) and responsive layout (V5) — COMMITTED (`4440009`) AND PUSHED

- Date: 2026-11-14. One combined commit, by the owner's Git decision of 2026-11-14.
- **U6 summary:** `AbyssAnchor.tsx` is split into `src/ui/components/`: `GameScreen`, `TopBar`, `HistoryStrip`, `CanvasStage`, `MultiplierOverlay`, `CrashBanner`, `WinFlash`, `ChestPicker`, `BettingPanel`, `BetControls`, `QuickBets`, `ActionButton`, `icons`, `DevRejectionBanner`. It brings per-slice subscriptions, `src/ui/strings.ts` and `formatMoney`. The route and the DOM harness mount `GameScreen`, and `AbyssAnchor.tsx` is deleted. The 20 characterization pins pass unchanged.
- **U7 summary:** `tab` and `desk` custom variants in `src/styles.css`, a full-width tablet column, and a full-viewport landscape desktop grid with a right betting rail. These are approved departures from docs/07 §15's `lg` and portrait-aspect wording, recorded there.
- Validation (from the commit message): validated on the exact staged tree in an isolated worktree. tsc clean, 427/427 tests, targeted lint clean, production build passes, engine, rendering and shared unchanged.
- Pending: §19 gate 7, the owner's U6 mobile pixel-compare, and gate 8, the U7 screenshot matrix. Neither is recorded as passed.

### Stage M1 — implementation (E-X2 + M1-1 + settlement integrity + R2) — IMPLEMENTED IN THE WORKING TREE 2026-11-14; NOT COMMITTED; NOT CLOSED

*Reconciliation 2026-11-14: committed afterwards as `e37b81c` (S1), with its tests in `e8b1b62`. M1 was then **deferred** by the owner and is **not closed**.*

- Date: 2026-11-14. Nothing staged, committed or pushed. Integration strategy S1 is approved (one atomic commit). Staging, committing and pushing each need the owner's separate authorization.
- Owner decisions, 2026-11-14:
  - Q12 approved: W3 is kept.
  - Q8 approved within its demonstrated domain.
  - **E-X2 approved as implemented**; the exception is not expanded.
  - **Q9c = R2.**
  - **Q1/Q11 = B-R in principle.**
  - **Q14 = S1.**

  Recorded in docs/07 §23.9 and docs/06 §13.1.
- Delivered (working tree):
  - `src/shared/stake.ts` + test, and the engine guard in `src/engine/state-machine.ts` + test (E-X2), with the re-export `src/ui/store/stake.ts` + test;
  - `isPlaceableStake`, shared by `canPlaceBet` and `session.submit` (M1-1);
  - `src/ui/store/payout.ts` + test: the BigInt rounded-down payout for every settlement path and for `potentialWin` (V2);
  - wallet rules W1–W10 in `src/ui/store/wallet-store.ts`;
  - `src/ui/session.money.test.ts`, `src/ui/test/money-oracle.ts`.
- R2 (this pass):
  - `wallet.unresolvedClaims()`: an append-only, frozen, session-lifetime list. Each claim records round, stake, `creditedCents`, event, rule, reason and payload.
  - A faulted round's `crashed` adds no loss entry.
  - No refund, forfeiture or later credit.
  - The read-surface pin now lists `unresolvedClaims`, and the W10 expectations were updated (`creditedCents`; no loss entry). There are 7 new R2 tests. A mutation check caught all 4 mutants.
- Sanctioned test changes, all recorded in docs/07 §23.3:
  - the `0.123` DOM pin was rewritten;
  - one characterization value changed, 5.22 → 5.21 (rounding down, M1-D8);
  - the round-to-nearest oracles were replaced by `payoutOracle`;
  - the engine amount pin was extended in place, and its original assertion is kept.
- Validation (2026-11-14):
  - `tsc --noEmit` clean.
  - 409/409 tests, 33 files.
  - Production build passes.
  - Targeted ESLint with end-of-line neutralized: only the 6 pre-existing `AbyssAnchor.tsx` errors.
  - `git diff --check` clean.
  - Freeze audit: exactly the four E-X2 files.
  - `src/routeTree.gen.ts` untouched.
- Not done:
  - **B-R.** A change to the wallet's read surface cannot be avoided, so the minimal design D1–D6 waits for approval (docs/07 §23.20).
  - Owner browser QA (M1, U4b, U5).
  - The commit.
  - The R2 resolution policy stays a temporary local-demo policy.
- **Roadmap return (2026-11-14):**
  - **Owner direction:** the M1 scope is frozen and B-R moves to M2. No code changed in this pass.
  - **Precision-boundary review:** the current `credited()` is exact below 2^44 units (proven; 0 errors in 1.4 M sampled sums up to 2^45). It is wrong by one cent, up or down, in ≈13% of sampled credits in [2^45, 2^46), and W7 does not catch it.
  - **Proposed:** rule **W11**, an exact-ledger postcondition. A credit is refused into an R2 unresolved claim unless the resulting balance is below 2^44. No ceiling, no rounding change. Not implemented (docs/07 §23.21).
  - **Final validation:** 409/409 tests (33 files), tsc clean, build passes, ESLint at baseline (6 pre-existing `AbyssAnchor.tsx` errors), `diff --check` clean, freeze scope = the four E-X2 files, `routeTree.gen.ts` byte-identical to HEAD.
  - **M1 status:** BLOCKED on the W11 decision. Then browser QA and the S1 commit.
- **W11 — approved and implemented (2026-11-14, owner's final M1 authorization; uncommitted):**
  - `src/ui/store/payout.ts`: `BALANCE_LIMIT_CENTS` (2^44 · 100, exclusive), `amountToCents` (exact, via `String(x)`), and `exactCredit(balance, cents)`. The existing balance, the credit and the result are all checked in integer cents before one exact conversion.
  - `src/ui/store/wallet-store.ts`: the cashout, jackpot and chest credits go through `exactCredit`, and `credited()` is removed.
    - A refusal is rule `W11` and faults the participation (W10).
    - `SettlementFault` gains the optional `unpaidCents` (W11 claims only) and the rule `"W11"`.
    - A jackpot withheld under W11 records its chest delta once, as a follow-up claim. Nothing is credited, and there is no loss entry.
  - Tests (+18, 409 → 427): `payout.test.ts` (+8), `wallet-store.test.ts` (+9), `session.money.test.ts` (+1, real engine landing exactly on 2^44). A mutation check caught all 3 mutants.
  - Validation: 427/427, tsc clean, build passes, changed files lint-clean (6 pre-existing `AbyssAnchor.tsx` errors), `diff --check` clean, freeze = the four E-X2 files, `routeTree.gen.ts` byte-identical.
  - **M1 status:** implementation complete. Awaiting the owner's browser QA and the S1 commit authorization.
- **Browser QA reconciliation (2026-11-14, documentation only):**
  - **Owner-reported:** 10 consolidated browser checks passed. The agent ran no browser test.
  - **Not the same as the detailed checklist.** The 19-item detailed checklist (docs/16: U4b 1–6, U5 1–7, M1 1–6) is not recorded as passed. The 10 checks were not listed item by item, so the remaining items go back to the owner for confirmation (docs/16). The full browser QA gate stays pending.
  - **W11 wording clarified** (docs/07 §23.21; the rule is unchanged). After a withheld jackpot, the first *valid* chest settlement creates the follow-up claim. Invalid chest events create no claim.
  - **Git:** the owner chose one local S1 commit with no push. Nothing is staged or committed; the commit awaits a separate authorization.
- **Browser QA accepted (2026-11-14, documentation only; supersedes the "pending" status above for the current state):**
  - **Owner-confirmed:** all **19/19** detailed browser QA checks passed: U4b 6/6, U5 7/7, M1 6/6 (docs/16). These are owner-performed checks. The agent ran no browser test.
  - The temporary `// @refresh reset` directive is confirmed absent from `src/components/AbyssAnchor.tsx`.
  - S1 readiness re-check: the 27-file manifest is unchanged (`src/routeTree.gen.ts` excluded, byte-identical to HEAD); the frozen directories differ by exactly the four E-X2 files; `git diff --check` clean; nothing staged. No source changed since the W11 validation, so the full suite was not re-run.
  - **M1 status:** browser QA passed. M1 closes with the S1 commit, which awaits the owner's separate authorization (local only, no push).

### Stage M1-0 — Money Integrity decisions and architecture plan (documentation only) — DRAFTED 2026-11-13, RECONCILED WITH THE SECURITY BOUNDARY REVIEW AND THE FINAL FINANCIAL INTEGRITY RECONCILIATION 2026-11-13, AWAITING OWNER REVIEW; NOT COMMITTED

- Date: 2026-11-13. A stage of TASK 007, not a new top-level task. No source, test, configuration or dependency file changed.
- Summary: records the owner's Money Integrity decisions and the plan to implement them. The vulnerability itself is **not fixed**.
  - *Approved policy (owner, 2026-11-13):* M1-D1 bets have at most two decimals of monetary value (increments of 0.01; sub-cent rejected, never rounded; `1.000` is valid — the rule is on the value, not the text); M1-D2 minimum bet 0.01, no new arbitrary maximum; M1-D3 invalid amounts rejected — PLACE BET disabled and the submit path enforcing the same rule independently, editable input kept distinct from an accepted stake; M1-D4 engine freeze exception E-X2 to be *planned* (implementation not approved); M1-D5 integer minor units deferred to a separate task M2; M1-D6 U5 decisions D7 and D11 formally superseded in part, history preserved.
  - *Root cause (verified at `8363b9f`):* no layer checks that a stake is a whole number of cents — the UI asks only affordability (`wallet-store.ts:105-106`), the engine only `amount > 0` (`state-machine.ts:222`) — while the wallet rounds the debit and the payout independently (`wallet-store.ts:150`, `:165`). A stake of `0.005` or less debits 0 and still pays (e.g. `0.004` → 0.20 at 50×). The engine also accepts `+Infinity`.
  - *Plan (proposed, docs/07 §23):* valid-stake predicate `Number.isFinite(a) && a >= 0.01 && +a.toFixed(2) === a` (exact, no tolerance; rationale and rejected alternatives in §23.4); composition of sanitation → stake validity → affordability → round state (§23.5); settlement guarantees and limits on the float architecture, invariants I1–I8 (§23.6); test matrix (§23.7); commit plan (§23.8). *The first draft's plan — stages E-X2 → M1-1 → M1-2 → M1-3 in separate commits, "no atomic landing required" — was revised by the review pass below.*
  - *Review pass (2026-11-13, docs only):*
    - **Q1 (§23.11):** the maximum payout multiplier (25,000) is a property of `LocalRoundAuthority`, not an engine invariant. The live cashout multiplier is limited to ≈ 6.61 by descent tuning alone. Balances accumulate. So a settlement-safety ceiling cannot be finalized in M1. Only a representability bound is derivable (T1: stake < 2^46 units). The draft's 2^51-cent recommendation is withdrawn, and Q1 stays open.
    - **Q2 (§23.12):** ten engine–wallet cases traced. A wallet rule stricter than the engine leaves the engine holding a participant the wallet does not know (zero in, zero out, but not consistent). E-X2 alone fails `src/ui/screen.bet-input.test.tsx:104-114`. Revised plan (proposed): E-X2 and M1-1 in one commit, then M1-2, then M1-3, under conditions K1–K4.
    - **New:** invariant I8; open question Q7 (event and command injection); limitations L1–L6.
  - *Security boundary review (2026-11-13, read-only; probes outside the repository):*
    - Confirmed **V2**. Wins are rounded to the nearest cent, `+(roundBet × m).toFixed(2)`, so a 0.01 stake cashed out just above 1.5× is paid 0.02.
    - Measured return per unit staked: 1.2588 for 0.01 at 1.5×, against 0.9571 for a stake of 1.
    - V2 uses valid stakes only, so it survives E-X2 + M1-1, and I1–I8 all hold while it is exploited.
    - Also classified: V3–V7 (non-finite stakes, forged events, live references, restore, authority outputs). Recommended sequence C3.
  - *Final reconciliation (2026-11-13, documentation only). Owner decisions M1-D7 to M1-D12:*
    - V2 is a required fix inside M1.
    - Nonnegative payouts are rounded down to the cent, with a numerically justified implementation. This supersedes the U2 bit-identical money-math rule for payouts; the original texts are kept, with dated pointers.
    - C3 is the provisional plan, with the wallet non-finite debit, credit, payout and balance protection kept in M1.
    - Stake, balance and payout ceilings stay unresolved.
    - Event emission, restore, live-reference aliasing and network trust boundaries are recorded as known limitations; wallet guards do not authenticate events.
    - E-X2 remains planning-only.
  - *Documented as a result (docs/07):*
    - invariants I9 (settlement) and I10 (finite wallet);
    - §23.13, the payout policy:
      - why `Math.floor(s * m * 100)` fails (0.29 → 0.28; 12,431 errors on a 1.8M-pair grid);
      - why integer stake cents alone fail (1 × 1.15 → 1.14);
      - why the exact binary multiplier semantics fails (1 × 57.29 → 57.28);
      - the proposed exact `BigInt` method on shortest round-trip decimals (0 mismatches);
      - the limits of verifying I9 with floats in JavaScript;
    - §23.14, plan C3 with the open vulnerabilities at each commit boundary, and the M1 closure criteria;
    - §23.15, the recorded limitations;
    - the required V2 test block in §23.7, and the affected U2/U3 expectations in §23.3;
    - new questions Q8–Q10;
    - a formatting fix: Q4 and Q5 had run together on one line.
  - *Final financial integrity reconciliation (2026-11-13, documentation only). Owner decisions M1-D13 to M1-D16, with M1-D10 reaffirmed:*
    - **M1-D13 — payout policy.** The payout is computed from the accepted stake and the authoritative settlement multiplier, and rounded down to the cent. It never exceeds the intended amount. A float product is not a monetary result.
    - **M1-D14 — invalid multipliers.** NaN, ±Infinity and negative multipliers never credit. Nothing is silently converted to zero, and nothing is partially applied.
    - **M1-D15 — wallet-side integrity in M1.** This supersedes C3's P1 deferral.
    - **M1-D16 — publication.** No unsafe intermediate commit is pushed.
  - *Documented as a result (docs/07):*
    - **§23.16:** the four meanings of a multiplier (canonical decimal, exact binary, displayed, authoritative). The engine's rounded `finalMultiplier` is the authoritative chest value and must not be recomputed. The BigInt algorithm, refined.
    - **Probe results** (scratch script, outside the repository): all required cases, jackpot and chest-delta cases, a 1,802,000-pair grid with 0 mismatches, and 139,212 cashout-like samples with 0 decimal-versus-binary differences.
    - **New conversion findings:** `Number(BigInt)` can round **up** above 2^53 cents, and `Number(c)/100` overflows above ≈ 1.8 × 10^306 units.
    - **§23.17:**
      - zero is not a legitimate settlement multiplier on any path;
      - six wallet holes, H1–H6, found by code reading. H1, the `diveStarted` reset that re-enables a credit, is pinned by the U2 test `wallet-store.test.ts:221-228`. H2, a second `shipImpact`, overwrites the jackpot base and inflates the chest delta;
      - identities A–E: idempotency is achievable with the existing `roundId`; authenticity is not;
      - wallet rules W1–W9, proposed. Event identifiers would need a separate freeze exception.
    - **§23.18:** plan C4 — local commits L1–L3, never pushed, then one atomic integration commit, with the risk at each boundary.
    - **§23.19:** the numeric envelope per quantity, and why BigInt does not make the `number` wallet unlimited.
    - **Other edits:** invariants I11 (atomic settlement) and I12 (wallet idempotency); a final-reconciliation test block in §23.7; amended closure criteria; new questions Q11–Q14; dated status notes on Q3, Q8, Q9 and Q10; dated pointers in §23.13 and §23.14.
  - *docs/06 §13.1:* E-X2 is still planning-only, and its scope is unchanged. Event identifiers, a private emitter, restore validation and a multiplier contract are each classified as a separate freeze exception.
- Files modified (working tree only): `docs/06_ENGINE_ARCHITECTURE.md` (§3 notes; new §13.1 — proposed E-X2, with the M1-D12 status), `docs/07_UI_ARCHITECTURE.md` (new §23, including §23.13–§23.19; dated notes in §1 goal 6, §6, §7 V4, §10, §17, §19 gate 4, §20, §22), `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`.
- Architectural decisions: the engine is to become the authoritative stake validator (commands are the future protocol messages) while affordability and all money math stay in the settlement layer; one shared predicate for engine and UI; `isAffordable` (D7) unchanged and composed with the stake check; rejection, never rounding.
- Risks / open: the vulnerability stays exploitable until the implementation stages land. Seven questions await the owner (docs/07 §23.9), notably Q1 (technical stake ceiling — open; any bound needs approval under M1-D2) and Q2 (commit plan, including approval to bundle the M1-1 UI files into the E-X2 commit). *(Reconciliation, 2026-11-13:*
  - *Both V1 and V2 stay exploitable through the normal UI until the stages land. After commit 1 of C3, V2 is still open; M1 must not be marked closed or released there.*
  - *Open questions are now Q1 and Q4–Q10; Q2 and Q3 are partly resolved by M1-D9. (Final reconciliation, 2026-11-13: Q10 is replaced by Q14; Q11–Q13 are added; Q8 and Q9 are partly resolved by M1-D13 and M1-D14.)*
  - *Q1 is reaffirmed open by M1-D10.*
  - *Forged finite events, restore, live references and the network trust boundary are recorded limitations, not fixed by M1.)* E-X2's scope is a candidate only. M1 removes one class of float error; it does not make float accounting exact — that is M2. U4b and U5 manual browser QA are still pending; U6 not started.

### Commit U5 — Bet-input store + action-state derivation (delta V4) — IMPLEMENTED 2026-11-13, COMMITTED AND PUSHED (`09cc5af56534766982697f7036efce72f440260d`); NOT FULLY ACCEPTED (browser QA pending)

- Date: 2026-11-13. Authorized by the owner with decisions D1–D12 (docs/07 §17; corrections C8, C9).
- Summary:
  - *Bet-input store* (`src/ui/store/bet-input-store.ts`, new): session-owned, starts at `DEFAULT_BET`; `set` (quick bets), `input(raw)` (the field), `halve`, `double(balance)` with the shell's arithmetic verbatim; every write sanitized (`sanitizeBetAmount`: non-finite → 0, negative → 0), so the snapshot is always finite and ≥ 0. No React, no subscriptions (D2, D4, D11).
  - *Action state* (`src/ui/components/action-state.ts`, new): pure `actionStateFor(round, wallet, bet)` returning `placeBet{enabled} | betLocked | cashOut | secured | spectating | waiting`, and `canPlaceBet` (the old inline `canBet`). `cashed`/`crashed`/`bonus` → `waiting` (D6, D10).
  - *Config* (`src/game/config.ts`): `BET_CUTOFF_SECONDS = 0.2`, UI-only (D5, D9).
  - *Wallet* (`wallet-store.ts`): exported pure `isAffordable(amount, balance)` = `Number.isFinite(amount) && !(amount <= 0 || amount > balance)`; `canAfford` delegates to it and the action state uses it (D7). No settlement arithmetic touched.
  - *Session* (`session.ts`): `session.betInput`, created after the round store; `submit` unchanged.
  - *Component* (`AbyssAnchor.tsx`): bet read via `useStore(betInput)`; handlers call the store; `placeBet` submits `betInput.get()` through `gameSession.submit` (no pending guard, D8); the five-branch conditional now switches on `action.kind`; the `canBet` line, `useState` and `DEFAULT_BET` import are gone. JSX markup, class strings and button order unchanged.
- Approved behavior changes: the typed bet survives remounts (D4); `canAfford(NaN)` false — a `NaN` placeBet is dropped at submit instead of rejected by the engine (D7); non-finite bet writes → 0 (D2). Preserved: cleared field → 0 (D1), negative clamp, halve floor 1, double cap at balance, quick bets, the 0.2 s cutoff (strict `>`), WAITING… with enabled bet controls in `cashed`/`crashed`/`bonus`, the engine's duplicate-command rejections, all money math. Finding: a number input sanitizes non-finite text (`1e309`, `Infinity`, `abc`) to `""` before `onChange`, in jsdom and per the HTML spec, so through the field such text already produced 0 before U5. D2/D7 are defense in depth for programmatic writes.
- Tests (+62; 311/311 across 29 files): `action-state.test.ts` (13; full cross product 5 phases × 2 × 2 × 12 countdowns × 16 bets × 6 balances against a verbatim transcription of the pre-U5 JSX); `bet-input-store.test.ts` (20; arithmetic against the transcribed shell handlers, sanitation, notifications); `screen.bet-input.test.tsx` (14, DOM: session ownership, field edge cases, the matrix in every phase, UI-only cutoff, double-click PLACE BET / CASH OUT → one debit / one credit); session (+8: ownership, isolation, independence, remount, D7/D8/D9 at the submit edge); wallet (+5: the U2 `canAfford(NaN) === true` pin updated, `isAffordable` equivalence with the original guard on finite values); remount (+2 new, 1 rewritten: the sanctioned `PINNED UNTIL U5` pin — the bet now survives a remount; StrictMode double-mount + remount). The 20 characterization pins pass with unchanged assertions; the two `PINNED UNTIL U5` titles were retitled because U5 keeps their behavior. Mutation check: breaking the cutoff comparison or the non-finite check makes the new tests fail.
- Validation: tsc clean; 311/311; targeted lint — the 5 new files clean raw, EOL-neutralized findings limited to the 6 pre-existing `AbyssAnchor.tsx` JSX-formatting errors; production build passes; SSR smoke passed (port 5231); `git diff --check` clean; freeze check (`src/engine`, `src/rendering`, `src/shared`) empty; `src/routeTree.gen.ts` untouched (SHA-256 unchanged).
- Commit: `refactor(ui): complete U5 bet input store and action state`, `09cc5af56534766982697f7036efce72f440260d`, pushed to `origin/develop` (2026-11-13). 19 files: 5 new (`bet-input-store.ts` + test, `action-state.ts` + test, `screen.bet-input.test.tsx`), 14 modified. Post-commit: 311/311 tests green across 29 files; tsc and production build pass; targeted lint — no new findings; engine/rendering/shared freeze preserved. Status: a committed development checkpoint — not fully accepted, not production-ready.
- Open: U5 manual browser QA (input edge cases, cutoff, double clicks, WAITING… phases, remount) and U4b manual browser QA — neither has passed. **M1 (sub-cent betting vulnerability) remains unresolved**; U5 does not address it, and it requires a separate owner-approved task. U6 not started. *(Update 2026-11-13: the owner approved the M1 policy and placed the work under TASK 007 as stages — see Stage M1-0 above. Still unresolved in code.)*

### Commit U4b — Round store, session-owned — IMPLEMENTED 2026-11-13, COMMITTED AND PUSHED (`bbdc13443e1b2a8cb29e58a1f24e72f7d44711c2`)

- Date: 2026-11-13. The owner approved the U4b plan: C6 (§11 "projected and normalized on write"), C7 (harness subscription constants 3 → 0, StrictMode check replaced by sink and per-frame-write assertions), retiring the `attachCanvas` sync parameter, a synchronous write on attach, and showing a chest picked while unmounted as revealed after the remount.
- Summary:
  - *Store* (`src/ui/store/round-store.ts`, new): framework-free; `createRoundStore(initial)` returns the read-only `store` (`get`/`subscribe`) and the session-private `write`. Participant copied field by field (the engine mutates its own object in place); chests a frozen defensive copy, replaced only when contents change (the engine never mutates its chest array in place — verified by test — but the array comes from the injectable authority and is shared with every `chestsRevealed` listener); unchanged writes keep the snapshot by reference, so quiet frames notify nobody; unchanged sub-objects keep their identity. No event subscriptions, no timers.
  - *Session* (`src/ui/session.ts`): `session.round`; seeded from `engine.getPublicState()` after the wallet and notification stores; `attachCanvas(canvas)` writes once, then attaches the driver with `sync: round.write`. `PublicStateSync` and the sync parameter are removed.
  - *Component* (`AbyssAnchor.tsx`): reads phase, countdown, multiplier, boost, `participant.bonusEligible`, `chests` and `chosenChestId` via `useStore`; the chosen chest is `chests[chosenChestId]`. The five mirrored `useState`s, `chests`/`chosenChest` state, the three chest listeners and the sync callback are deleted; the mount effect only attaches the canvas. JSX and icons byte-identical; bet input and the 0.2 s cutoff unchanged (U5).
- Tests (+37; 212 → 249): `src/ui/store/round-store.test.ts` (17, node — seed, frozen read-only surface, quiet writes, per-field notification, identity reuse, participant copy and in-place change detection, chest defensive copy); `src/ui/session.test.ts` (+11, real engine through the driver — per-frame equality with `getPublicState()` across jackpot+pick and crash rounds, quiet crash frames, single writer, live-participant isolation, chest-array facts, attach-time sync, E-X1 timeout and ineligible paths; the two U1 sync tests rewritten); `src/ui/screen.round.test.tsx` (9, DOM — remount after a pick, near the 360-tick deadline, racing the deadline, StrictMode remount in bonus, ineligible remounts, ten mount cycles, per-frame HUD equality, Profiler-measured zero re-renders on quiet frames). `screen.remount.test.tsx`: the sanctioned `PINNED UNTIL U4` pin rewritten (picker restored, pick credited once) plus C7; `screen.notifications.test.tsx`: C7 constants only. The 20 characterization pins unchanged.
- Validation: tsc clean; 249/249; targeted lint — new files clean raw, EOL-neutralized findings limited to the 6 pre-existing `AbyssAnchor.tsx` JSX-formatting errors; production build passes; SSR smoke passed (port 5223); `git diff --check` clean; freeze check empty; `src/routeTree.gen.ts` untouched (SHA-256 unchanged).
- Committed as `bbdc13443e1b2a8cb29e58a1f24e72f7d44711c2` and pushed to `origin/develop`. The round store has two synchronization paths: the driver's per-frame sync, and one immediate write inside `attachCanvas` (stale `src/ui/session.ts` comments corrected accordingly).
- Open: owner manual browser QA, including a real-browser remount during the bonus phase, is not recorded here. (U5 was authorized afterwards, 2026-11-13 — see above.)

### Commit U4a — Notification store, session-owned (delta V2) — APPROVED 2026-11-13, COMMITTED AND PUSHED

- Date: 2026-11-13. The owner approved the U4 architecture with three decisions: split U4 into U4a (notification store) and U4b (round store) with separate validation and approval gates; defer the visual dev rejection banner to U6 (U4a: dev-only logging + bounded history); U4b must restore the eligible chest picker after a component remount during `bonus`. Recorded in docs/07 §11, §12, §17 with sanctioned corrections C1–C5.
- Summary:
  - *Store* (`src/ui/store/notification-store.ts`): framework-free; subscribed once at session construction (session lifetime). Consumes `wallet.onFlash` — settlement and the decision of *when* to flash stay in the wallet. Durations verbatim (`FLASH_MS`: `CASH_FLASH_MS` 1800, `JACKPOT_FLASH_MS` 2200). At most one pending timer: a re-trigger cancels it and supersedes the flash (a `seq` guard makes a stale callback inert). `bettingOpened`/`diveStarted` clear the flash and cancel the timer. Injectable `NotificationClock` (`now`/`setTimeout`/`clearTimeout`); the production `systemClock` resolves the globals at call time. Read surface `get`/`subscribe` only.
  - *Dev diagnostics:* `commandRejected` is subscribed only when `import.meta.env.DEV` **and** the session opts in; each rejection is logged (`console.warn` by default, injectable) and recorded in a bounded history (`REJECTION_HISTORY_LIMIT` = 20, newest first). The production singleton passes `diagnostics: import.meta.env.DEV`; `createGameSession` defaults to off. The production build contains no diagnostics code (bundle scanned for the log string: 0 hits). No banner (deferred to U6).
  - *Session:* `session.notifications`; new optional deps `notificationClock`, `diagnostics`, `diagnosticsLog`. Wiring order: wallet first, notifications second.
  - *Component* (`AbyssAnchor.tsx`): `cashFlash` is `useStore(notifications, n => n.flash !== null)`; the flash `useState`, the `FLASH_MS` map, the `setTimeout`, and the `onFlash` and flash-only `bettingOpened` subscriptions are deleted. The three chest listeners stay until U4b. Markup unchanged.
- Behavior: identical on the existing timeline (all 20 characterization pins unchanged and green). Intended differences, all within V2: an active flash survives a component remount and keeps its original deadline (C4); the round-transition clears also cancel the timer (C2, unobservable today).
- Tests (+32; 180 → 212): `src/ui/store/notification-store.test.ts` (21, node — construction/subscription count, exact durations and expiry, supersede, repeated triggers, round-transition cancellation, non-clearing events, diagnostics on/off/bounded/default sink, DEV-false gating via `vi.stubEnv`, system clock); `src/ui/session.test.ts` (+6 — real-engine cashout and jackpot paths with a frozen clock, flash survives detach/re-attach, cleared at `bettingOpened`, ledger unchanged, diagnostics through the session, default off); `src/ui/screen.notifications.test.tsx` (5, DOM — one timer and no component flash subscription, remount persistence on the original deadline, expiry while unmounted, StrictMode one flash/one timer, jackpot duration across a remount). `src/ui/screen.remount.test.tsx`: only the `DISPLAY_SUBSCRIPTIONS` constant changes 5 → 3 (C5); its `PINNED UNTIL U4` picker pin is U4b's and stays.
- Files: new `src/ui/store/notification-store.ts`, `src/ui/store/notification-store.test.ts`, `src/ui/screen.notifications.test.tsx`; modified `src/ui/session.ts`, `src/ui/session.test.ts`, `src/components/AbyssAnchor.tsx`, `src/ui/screen.remount.test.tsx`, `src/ui/README.md`, `docs/07_UI_ARCHITECTURE.md`, docs 14/15/16.
- Validation (automated, 2026-11-13): `tsc --noEmit` clean; **212/212 tests green, 24 files**, no console or act warnings; lint with Prettier end-of-line neutralized at the 7 errors + 6 warnings baseline (the 6 `AbyssAnchor.tsx` findings are the pre-existing ones, shifted lines); new files clean under raw lint; production build passes; SSR smoke passed (fresh `vite dev` on port 5214: HTTP 200, canvas markup, title, `PLACE BET`, no error strings); freeze check (`src/engine`, `src/rendering`, `src/shared`) empty; `src/routeTree.gen.ts` byte-identical across build and dev server (SHA-1).
- Owner manual browser QA (2026-11-13) — **passed, 5/5**: (1) a normal cashout shows CASHED OUT, expiring after ≈1,800 ms; (2) the jackpot flash shows and expires after ≈2,200 ms; (3) chest selection updates the balance and the displayed result; (4) no stuck or duplicated flashes across several rounds; (5) no new browser console errors. **U4a approved for commit and push.** Final pre-commit gates re-run the same day: tsc clean, 212/212 tests across 24 files, targeted lint (new files clean raw; EOL-neutralized findings limited to the 6 pre-existing `AbyssAnchor.tsx` JSX-formatting errors), production build passes, SSR smoke passed (port 5215), `git diff --check` clean, freeze check empty, `src/routeTree.gen.ts` byte-identical (SHA-1) and not committed.
- **Still not verified:** a real-browser component remount (not part of the owner's QA scenarios).
- Risks: the flash outliving a remount is new visible behavior (sanctioned, C4); the remount test's subscription constant changed (C5).

### Commit U3 — UI test harness + DOM characterization pins — COMMITTED (`8e9b21b`) AND PUSHED

- Date: 2026-11-13. The owner approved the plan, the four devDependencies, test-only session injection through Vitest module mocking + dynamic imports, a real React unmount/remount test in jsdom and StrictMode double-mount coverage. Committed as `8e9b21b` and pushed to `origin/develop`; the owner accepted the reported validation results the same day.
- Summary:
  - *Dependencies* (devDependencies, exact pins, `package-lock.json`): `jsdom@30.1.3`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/user-event@14.6.8`. The newest releases were skipped because they were inside the project's 24 h release-age guard (`bunfig.toml`): jsdom 31.0.1 (published 2026-11-13; the 31.x major is one week old) and user-event 14.6.9/14.6.10. No peer conflicts (`npm ls` clean; `@testing-library/dom` deduped). The existing `npm audit` findings all concern pre-existing packages; none involve the new ones.
  - *Vitest config:* two projects. `node` (`src/**/*.test.ts`, Node environment — the 151 existing tests, unchanged) and `dom` (`src/**/*.test.tsx`, jsdom). The environment is chosen by file extension.
  - *Harness* (`src/ui/test/`, test-only): `scripted-session.ts` builds a session through the real `createGameSession` with a stub authority (fixed crash point, jackpot 100×, chests 2× / 6.5× / 30×), a constant world Rng and a recording renderer. `session-mock.ts` replaces `@/ui/session`, swapping only `gameSession`. `dom-harness.tsx`: `bootScreen()` = `vi.resetModules` + `vi.doMock` + dynamic import of the screen (a fresh module-scope session per test; a stable graph within the test, so unmount → render is a true remount); a manual rAF queue on a 60 Hz integer-ms grid that also advances fake `setTimeout` time (the flash timers keep their real relation to the round); counters on the component's display subscriptions; a semantic `outline()` (text, buttons, inputs, canvas with disabled state — no class names).
  - *Characterization pins* (`src/ui/screen.characterization.test.tsx`, 20 tests): betting phase (first render, countdown, − / + / quick bets / typed amounts, PLACE BET locking, cutoff), dive (participating, spectating, cashout + flash lifetime), crash (participating, spectating, cashed out before the crash), jackpot + bonus (impact flash, eligible pick, E-X1 timeout auto-pick of chest 0, manual-cashout player and spectator never see the picker).
  - *Remount + StrictMode* (`src/ui/screen.remount.test.tsx`, 9 tests): the real component is unmounted and mounted again over the same session. Covered: resource release and a single re-attach; mid-dive remount (the world does not advance while unmounted, the HUD resumes on the locked bet, the cashout settles once, one history entry); remount with the bet locked; StrictMode double-mount (one live renderer, one rAF loop, five display subscriptions, one frame per rAF); cashout and jackpot + chest rounds under StrictMode settle once; StrictMode unmount + remount mid-dive. **This closes U2's accepted limitation at the automated level:** the real React component is now remounted mid-round in tests. A manual browser remount has still not been run.
- Pinned current behavior scheduled to change (marked `PINNED UNTIL Ux` in the tests): U5 — clearing the bet field makes the bet 0 (the field shows `0`), the 0.2 s cutoff, the bet input resetting to the default on remount; U4 — a remount during `bonus` hides the picker (component-side `chests`), and the round still completes through the E-X1 auto-pick and is credited. Also pinned verbatim: the jackpot flash is still visible when the chest result lands (the banner then shows the chest total), and the multiplier readout keeps the last round's value through the next betting window.
- Files: new `src/ui/test/scripted-session.ts`, `src/ui/test/session-mock.ts`, `src/ui/test/dom-harness.tsx`, `src/ui/screen.characterization.test.tsx`, `src/ui/screen.remount.test.tsx`; modified `vitest.config.ts`, `package.json`, `package-lock.json`. Production source unchanged.
- Validation (automated — complete, 2026-11-13; accepted by the owner): `tsc --noEmit` clean; **180/180 tests green, 22 files** (151 node + 29 DOM; three consecutive full runs identical; no React act or console warnings); production build passes; SSR smoke passed (fresh `vite dev` on port 5213: HTTP 200, canvas markup, title and `PLACE BET · 5.0s`, no error strings); `src/routeTree.gen.ts` byte-identical (SHA-1 before/after); freeze check: `git diff` of `src/engine`, `src/rendering`, `src/shared`, `src/game`, `src/components`, `src/routes` and the production `src/ui` modules is empty.
- Lint (recorded precisely; **full-project lint is not clean**): a raw `eslint .` reports thousands of Prettier end-of-line errors (10,641 errors on 2026-11-13) caused by CRLF working-tree files — open recovery item 1, not code findings. With Prettier end-of-line neutralized (`endOfLine: "auto"`), 7 errors + 6 warnings remain, all pre-existing and equal to the recorded baseline: 6 Prettier JSX-formatting errors in `src/components/AbyssAnchor.tsx`, 1 in `src/routes/index.tsx`, and 6 warnings in shadcn primitives under `src/components/ui/`. U3's new files add no findings, even without the override.
- Coverage boundary: DOM-level React remount and StrictMode coverage is complete (jsdom, real component). **A real-browser remount remains unverified** — no manual browser remount mid-round has been run. (1) Testing Library's async wrapper waits on a `setTimeout(0)` that it flushes only under *Jest* fake timers; the harness stubs a minimal `jest.advanceTimersByTime` global (it advances 0 ms) so user-event works with Vitest's fake timers. (2) A hoisted `vi.mock` factory result is cached across `vi.resetModules`, so the mock is registered per boot with `vi.doMock`. (3) Environment — Git Bash Vitest runner issue on Windows: Vitest fails every file ("failed to find the current suite") when started from a working directory whose drive letter is lowercase (`c:\`), as Git Bash / VS Code may provide. This is pre-existing (reproduced with the original config on node tests). Verified workaround: run Vitest from PowerShell with an uppercase `C:\` working directory, as all earlier validations did.
- Risks: the pins characterize the monolith — U6 must keep them green unchanged; any pin edit outside its `PINNED UNTIL` step is a behavior change and goes back to the owner.

### Commit U2 — Wallet store, session-owned (delta V1) — APPROVED 2026-11-13

- Date: 2026-11-13 (committed as `ad30d7a`; pushed to `origin/develop` with `f080b03` and the fix `39f5a9f` below; **approved by the owner 2026-11-13**)
- Status: complete and approved. Gates passed: 1 tsc, 2 lint at baseline, 3 tests (151/151 at approval, after E-X1), 4 freeze check, 5 build + SSR smoke, 6 console hygiene (owner, browser), 7 manual gameplay (owner, browser). **Documented limitation, accepted by the owner:** remount coverage is automated only (session-level tests in `src/ui/session.test.ts`); a browser-level React component remount mid-round was **not** manually tested.
- Summary: §17 step U2, landing sanctioned delta V1. New `src/ui/store/wallet-store.ts` (`createWalletStore(events)`) is the settlement layer of docs/06 §3 / docs/07 §10 and the single home of money math. The settlement listener bodies moved verbatim from `AbyssAnchor.tsx`, float `toFixed(2)` arithmetic byte-for-byte: `betPlaced` (debit + bet-basis lock from the event payload — Sprint 3 Commit 8 fix preserved), `diveStarted` (clears `hasCashed`), `cashedOut` (credit + `lastWin` + history), `crashed` (loss history when not cashed), `shipImpact` (jackpot base + auto-credit when participating and not cashed + history), `chestPicked` (delta credit over the already-credited jackpot win + history). The shell's `phase === "idle"` reset effect became a `bettingOpened` listener (clears `participating`/`roundBet`/`hasCashed` only; balance, history, `lastWin` and jackpot base carry over). Money state per the §9 writer table — `balance`, `roundBet`, `participating`, `hasCashed`, `lastWin`, `history`, `jackpotMultiplier` — lives in one immutable snapshot, one snapshot write per event. The store exposes a read-only surface (`get`/`subscribe` as `ReadableStore`, `canAfford`, `onFlash`); nothing outside the module can write wallet state. `canAfford` keeps the verbatim pre-U2 predicate (`amount <= 0 || amount > balance` → reject; NaN passes through and the engine rejects it as `invalid-amount` — sanitation is V4/U5). `src/ui/session.ts` constructs the wallet at session construction, subscribed before any component listener and never unsubscribed (V1: a remount can neither reset the wallet nor make it miss an event), exposes it as `session.wallet`, and gains `submit(command)` — the component command edge, dropping an unaffordable `placeBet` and forwarding everything else unchanged (the engine still validates all round-state questions, D4). `src/ui/store/store.ts` gains the `ReadableStore<T>` type; `useStore` accepts it. `AbyssAnchor.tsx` reads all money state via `useStore(wallet, …)` and submits via `gameSession.submit`; every settlement state+ref mirror is deleted (`balance`/`lastWin`/`history`/`hasCashed`/`participating`/`roundBet` state, `roundBetRef`/`hasCashedRef`/`participatingRef`/`betRef`/`jackpotMultRef`, the idle-reset effect) — one-writer rule, §20 risk 3. Shell: 356 lines (418 pre-U2).
- Named mid-migration seams (U2 → U4), documented in-file: (1) flash *triggers* are decided by the wallet (the jackpot flash depends on pre-credit settlement state) and announced via `onFlash`; the flash *timer* and `cashFlash` display state stay component-side (durations unchanged) until the notification store (§12, V2). (2) Display-only state — `chests` (`chestsRevealed`, which carries no money math) and `chosenChest` — stays component-side via thin display subscriptions to `session.engine.events`, which is why `session.engine` remains exposed. (3) `attachCanvas`'s sync-callback parameter remains the U1 seam for the per-frame HUD mirror, replaced by the round-store write in U4.
- Files modified: new — `src/ui/store/wallet-store.ts`, `src/ui/store/wallet-store.test.ts`; modified — `src/ui/session.ts`, `src/ui/session.test.ts`, `src/ui/store/store.ts`, `src/ui/hooks/use-store.ts`, `src/components/AbyssAnchor.tsx`. No engine, renderer, shared, `src/game`, dependency or config change.
- Architectural decisions: wallet subscribes to the narrow `Pick<EventBus, "on">` surface (headless-testable, Phase 8 swap = replace listener bodies, read surface untouched); flash triggering split from flash timing so §12 can absorb timing without touching settlement; flash listeners are notified after the snapshot write so a failing listener cannot interrupt settlement; the affordability check reads the live store balance at submit time instead of the render-closure balance (same predicate, never staler).
- Validation (automated — complete; re-run 2026-11-13 against `ad30d7a`): `tsc --noEmit` clean; **125/125 tests green, 20 files** (32 new: 25 wallet-store — golden ledgers for every settlement path incl. spectator and a multi-round ledger, float pins exact incl. `toFixed` artifacts, per-round resets, history cap, Commit 8 basis-lock replay generalized, atomic single-snapshot updates, snapshot immutability, no-writer surface, `canAfford` predicate, `onFlash` unsubscribe and throwing-listener isolation; 7 session — wallet settles with no component/canvas, unaffordable `placeBet` dropped before the engine, other commands forwarded, basis lock through the real command path, full jackpot round end to end, remount mid-round with the locked bet, events during detach still settled); lint 7 errors + 6 warnings with Prettier end-of-line neutralized — at or below the 9 + 6 baseline, all 7 pre-existing JSX-formatting findings outside U2-changed lines (the CRLF working-tree artifact otherwise inflates the raw count, open recovery item 1); production build passes; freeze check `git diff --stat 9d4a2a6 ad30d7a -- src/engine src/rendering src/shared` empty.
- Validation (2026-11-13, against `897c5be`):
  - *Gate 5 — SSR smoke: PASSED.*
    - A fresh `vite dev` returned HTTP 200 for `/` with `<canvas class="absolute inset-0 h-full w-full">` (`AbyssAnchor.tsx:177`) and the AQUADIVE title.
    - No error strings in the HTML and no server-log errors. The client modules (`AbyssAnchor.tsx`, `session.ts`, `wallet-store.ts`, `routes/index.tsx`) transform with HTTP 200.
    - `src/routeTree.gen.ts` stayed byte-identical (SHA-1 before and after). Its working-tree modification is CRLF-only (recovery item 1) and was left as is.
  - *Re-check:* `tsc --noEmit` clean; 151/151 tests green.
  - *Remount review (code + tests): PASSED at session level.*
    - Wallet listeners subscribe once at session construction and are never unsubscribed. The component's mount effect unsubscribes all five display listeners and detaches the canvas on cleanup, so there are no duplicate listeners, including under StrictMode's double-mount.
    - The settlement listener count is fixed, and the wallet is idempotent against duplicate events, so a remount cannot double-settle.
    - Coverage: `session.test.ts` remount tests (detach/re-attach; unmount mid-dive → remount → cashout against the locked bet; settlement with nothing mounted). These simulate the mount effect through `attachCanvas`/detach. No test mounts the React component, because there is no DOM harness.
  - *Known display gap (U2 → U4 seam, not money):* a remount during `bonus` loses component-side `chests`, so an eligible player's picker stays hidden for that bonus. E-X1's auto-pick (chest 0) still completes the round and the wallet credits it correctly. The U4 round store resolves this.
  - *Full page refresh:* resets the wallet to the default balance (the module singleton is rebuilt). Expected and out of scope — no persistence or reconnect in U2.
- Validation (owner, browser — 2026-11-13, against `897c5be`):
  - *Gate 7 — manual gameplay: PASSED.* The owner reports the manual gameplay checks found no errors.
  - *Gate 6 — console hygiene: PASSED.* The owner reports the browser console checks found no errors.
  - *Remount mid-round (gate 7 U2 focus item): automated coverage only.* The real React remount procedure (temporary `// @refresh reset` during a dive) was **not** run. Remount survival rests on the session-level tests and the code review above. The owner accepted this limitation at approval. U3's DOM harness (docs/07 §17) is the first point where an actual component remount can be tested automatically.
- Approval: **owner approved U2 on 2026-11-13** with the remount limitation above recorded.
- Risks: settlement drift (§20 risk 1) — mitigated by the golden-ledger suite, the session-level remount tests and the owner's gameplay pass. Residual: no test or manual check has yet mounted, unmounted and remounted the real React component mid-round. Carried into the U3 plan as a characterization target.
- Environment note (no code impact): Vitest fails to start ("failed to find the runner") when invoked from a lowercase-drive working directory (`c:\…`, as Git Bash / VS Code may provide) — the module loads twice; run tests from `C:\…`.

### Commit U2 fix — Settlement exclusivity (`39f5a9f`, recorded retroactively)

- Date: 2026-11-13 (committed and pushed as `39f5a9f`; recorded here by the E-X1 commit — it landed without its own tracking update)
- Summary: bug fix inside the U2 wallet store: a participant who cashed out manually and then reached the seabed could still be credited the jackpot and/or the chest delta. The wallet gained `settledBy` (`"cashout" | "jackpot" | null`) and `chestSettled`: a participation settles through exactly one payout path, the chest delta is paid only on top of this wallet's own jackpot auto-credit, at most once per round, and duplicate `cashedOut` / `chestPicked` events credit once. Payout formulas unchanged.
- Files modified: `src/ui/store/wallet-store.ts`, `src/ui/store/wallet-store.test.ts`, `src/ui/session.test.ts`.
- Validation: 134/134 tests green (9 new: 7 wallet exclusivity / idempotency, 2 real-engine session paths).
- Note: at the time the engine still required a pick to leave `bonus`, so spectators and manually cashed-out players could pick, and their pick recorded a chest history entry. E-X1 removed both (below).

### Engine freeze exception E-X1 — Bonus eligibility and deterministic completion — COMMITTED (`897c5be`) AND PUSHED

- Date: 2026-11-13 (owner-approved freeze exception; implemented, validated, manual browser QA passed; committed as `897c5be` with owner authorization and pushed to `origin/develop`)
- Context: under the Sprint 4 engine freeze, `bonus` had no timeout (an unpicked chest waited forever) and every player — including spectators and manual-cashout players, who receive nothing from a chest — had to pick to end the round. The owner approved a scoped exception to the docs/07 §19 gate 4 freeze (recorded in docs/06 §5 and docs/07 §19).
- Summary:
  - *Eligibility.* `ParticipantRoundState.bonusEligible`, set at entry(impact) iff the local participant was auto-cashed at the jackpot (no manual cashout). Spectators and manual-cashout participants are ineligible; `pickChest` from them is rejected (`"not-bonus-eligible"`).
  - *Deterministic timeout.* `BONUS_PICK_WINDOW_MS = 6000` (360 ticks at 60 Hz) in `src/engine/domain/tuning.ts`. Eligible → entry(bonus) schedules the pick window; a pick inside it applies as before (the manual pick wins the boundary tick); on expiry the machine applies **chest 0** through the single shared `applyChest` path — same `chestPicked` event, same `finalMultiplier` math, same CHEST_RESULT interval → betting. Ineligible → entry(bonus) schedules only the CHEST_RESULT interval (132 ticks); no `chestPicked` is ever emitted; `roundEnded { outcome: "jackpot" }`.
  - *Snapshots.* `bonusEligible` rides the participant slice and the pick window rides the existing single pending timer, so a restore mid-window continues to the identical auto-pick. `SNAPSHOT_SCHEMA_VERSION` 1 → 2 (participant shape change); a v1 snapshot is rejected with `snapshot-schema-mismatch` (a v1 bonus snapshot carries `timerTicks: null` and would otherwise hang).
  - *UI.* `AbyssAnchor.tsx` shows the chest picker only when `phase === "bonus"` and `participant.bonusEligible` — manual-cashout players and spectators never see or use it.
  - *Wallet safeguard (final review).* The wallet's `chestPicked` handler now ignores an ineligible pick entirely: only a participating, jackpot-settled (`settledBy === "jackpot"`) round records a chest result (credit, `lastWin`, history entry, `chestSettled`). Spectator / manual-cashout picks no longer write a synthetic chest history entry (defense in depth — the engine no longer emits them). Payout formulas, settlement idempotency, manual-cashout history, jackpot history and eligible chest history unchanged.
- Files modified: `src/engine/state-machine.ts`, `src/engine/game-engine.ts` (schema version), `src/engine/domain/tuning.ts` (`BONUS_PICK_WINDOW_MS`), `src/engine/state-machine.test.ts`, `src/engine/snapshot.test.ts`, `src/engine/game-engine.test.ts`, `src/components/AbyssAnchor.tsx`, `src/ui/store/wallet-store.ts`, `src/ui/store/wallet-store.test.ts`, `src/ui/session.test.ts`, `docs/06_ENGINE_ARCHITECTURE.md` (§5 transitions + E-X1 rules + limitation, §6 round walk-through, event table, §14 snapshot contents), `docs/07_UI_ARCHITECTURE.md` (§19 gate 4 exception), `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md`. No change to `src/rendering`, `src/shared`, `src/game`, dependencies or config.
- Architectural decisions: one pending timer with two meanings in `bonus` (pick window while eligible and unpicked, result interval otherwise) rather than a second timer — keeps the §14 snapshot shape and restore semantics unchanged apart from the participant field; the timeout reuses the manual pick path so settlement cannot diverge between picked and auto-picked rounds; eligibility is recorded once at entry(impact), never recomputed.
- Validation (automated — complete, 2026-11-13): `tsc --noEmit` clean; **151/151 tests green, 20 files** (17 new: 7 state-machine — 360-tick pin, eligible manual pick on the boundary tick, timeout → chest 0 → result interval, manual-cashout ineligible, spectator ineligible, duplicate-pick rejection, per-round eligibility across 4 rounds; 3 snapshot — restore mid pick-window, restore mid-bonus ineligible, v1 rejection; 2 session real-engine — eligible auto-pick credited by the unchanged delta formula, repeated-round ledger; 5 wallet — ineligible spectator / manual-cashout picks ignored, pick before settlement ignored, eligible chest-0 recorded once, no cross-round leak; existing tests updated to the E-X1 rule); ESLint 7 errors + 6 warnings with Prettier end-of-line neutralized — equal to the recorded baseline, zero findings added in changed files (per-file HEAD vs working-tree comparison); production build passes; `git diff --check` clean; freeze check: `src/rendering` and `src/shared` untouched, engine changes limited to the authorized files.
- Validation (manual — complete): owner manual browser QA, all four E-X1 scenarios passed (2026-11-13).
- Risks / limitations: **Local single-player rule, not the Phase 8 multiplayer rule** — whether `bonus` waits for a pick depends on the one local participant's eligibility. In Phase 8 the server-authoritative round must complete `bonus` on its own schedule independent of any single player; per-player eligibility then decides only who may pick and who is credited, and a server-side auto-pick (or per-player default) replaces the local chest-0 rule. The timeout default is a fixed chest 0, not a random pick — to be revisited with the Phase 8 / provably-fair design. Snapshot schema v1 is no longer restorable (no persisted snapshots exist today).

---

Completed Tasks:

---

## TASK 006 — Sprint 3: Game Engine (Completed 2026-08-17)

### Sprint 3 Close-Out Summary

Eight commits over 2026-07-18 → 2026-07-19, each approved individually (Commit 8's approval on 2026-08-17, after the interruption noted below):

1. Commit 1 — `docs/06_ENGINE_ARCHITECTURE.md` blueprint (21 sections, the binding engine contract); sanctioned behavior deltas D1–D5 ratified with its approval.
2. Commit 2 — E1: vitest harness + 26 characterization tests pinning the pure math, outcome distributions and tuning constants before any code moved.
3. Commit 3 — E2: domain consolidation (`src/engine/domain/`, `Rng` service, `RoundAuthority` seam; §4 constants ownership resolved; `src/lib/abyss-game.ts` dissolved).
4. Commit 4 — E3: engine skeleton — fixed 60 Hz tick accumulator + typed EventBus (delta D2).
5. Commit 5 — E4: round state machine, all lifecycle timers as whole-tick counts on the simulation clock (deltas D1 + D3).
6. Commit 6 — E5: simulation systems + tick-boundary command queue (delta D4).
7. Commit 7 — E6: EngineDriver + projections + snapshots (delta D5) — extraction complete; `AbyssAnchor.tsx` a UI shell.
8. Commit 8 — bug fix: bet basis divergence (settlement locks the bet at acceptance) — surfaced by this close-out's own review.

Result: `src/engine` implements docs/06 in full — a deterministic fixed-tick engine behind the `GameEngine`/`EngineDriver` facade, `RoundAuthority` + injected RNG as the entire Phase 8 seam, snapshot/restore, typed events, tick-boundary commands; the renderer contract (docs/05 §4 `RenderState`) stayed byte-compatible throughout. Test suite 0 → 83; lint baseline 33+7 → 9+6; `AbyssAnchor.tsx` 1,415 (pre-Sprint-2) → 419 lines. Phase 5 of the roadmap is complete. Owner's manual gameplay pass (2026-08-17) verified countdown, betting, dive, multiplier growth, cash out, crash, round restart and multi-round stability, including Commit 8's bet-basis behavior.

Provenance note: Windows was reinstalled on the development machine between Commit 8's delivery (2026-07-19) and its approval (2026-08-17). The working tree survived intact; the local Git history did not — the repository was restored as a single baseline commit (`b4c56a2`, remote `pupsystores-glitch/AQUADIVE2026`, branch `develop`). Per-commit provenance for Sprints 1–3 is preserved narratively in this document. A recovery audit (2026-08-17) re-verified the tree against the docs: tsc clean, 83/83 tests green, production build passing, lint at the 9+6 baseline (modulo a CRLF working-tree artifact of the reinstall — normalization pending separate approval).

### Sprint 3 Retrospective

**Accomplished:** the entire §21 extraction plan (E1–E6) plus one exploit fix, every commit individually approved, behavior-preserving modulo the five ratified deltas — each of D1–D5 landing in exactly one identified commit, as planned in the blueprint. The engine is deterministic (full-snapshot determinism checks), React-independent (module-scope driver+engine pair; remounts resume rather than restart), and multiplayer-shaped (RoundAuthority seam, commands as future protocol messages, authority-view snapshots). The game stayed playable after every commit.

**Lessons learned:** (1) Characterization-first paid for itself twice — E1's pins made "verbatim" provable through five extraction commits, and replaying settlement from event payloads alone is precisely what exposed the bet-basis exploit in the close-out review. (2) Enumerating sanctioned deltas up front and ratifying them with the blueprint turned "behavior-preserving" from a hope into a checkable contract: every observed difference was either on the list or a bug. (3) Verbatim extraction preserves bugs by design — close-out reviews must actively hunt for preserved flaws (the bet-basis divergence predated the engine); budget one fix commit per sprint for what they find. (4) The intermittent vitest worker crash was documented as environment flake rather than chased — correctly; it stayed non-reproducible and never affected a gate.

**Technical debt intentionally deferred (all recorded where cited):** jackpot RTP economics flaw preserved on purpose (TASK 001; rebalance is its own approved task); float money math → integer minor units (roadmapped); RNG streams remain unseeded `Math.random` and snapshot RNG positions absent until Phase 8 seeded streams (docs/06 §11/§14); creature `switch` → registry (docs/05 §10); lint baseline 9+6 (pre-existing findings concentrated in the UI shell and ui kit — most dissolve with Sprint 4's extraction); post-restore recovery items awaiting separate approval (CRLF normalization + `.gitattributes`, stable `main` branch on the remote, stale `bun.lock`/`bunfig.toml`/Lovable references).

**Sprint 4 readiness:** READY. The extraction subject is exactly the remaining `AbyssAnchor.tsx` UI shell (session construction, settlement listeners, per-frame HUD mirroring, input → commands, markup); the blueprint `docs/07_UI_ARCHITECTURE.md` is drafted (status: proposed) and its review/approval is Sprint 4's Commit 1; the engine and renderer are read-only contracts for the whole sprint (docs/07 §20 risk 1); 83 tests guard behavior. Risks to plan around: settlement money math still lives in React effects and must move verbatim; the five state+ref mirror pairs invite drift during decomposition; the responsive desktop layout (§15) is the one sanctioned visual change and must land alone.

### Commit 8 — Bug Fix: Bet Basis Divergence (settlement locks the bet at acceptance)

- Date: 2026-07-19
- Summary: Approved fix for the exploit surfaced in the Sprint 3 closeout review. Root cause (pre-existing — verified in the pre-engine code, preserved verbatim through the extraction): the wallet debit used the amount at `placeBet`, but the settlement layer locked its win basis by re-reading the live bet input at `diveStarted`; since the input stays enabled during the locked countdown, raising it after betting moved the win basis above the debited amount. Fix, settlement layer only (§3): the round bet locks in the `betPlaced` listener from the event payload — the exact accepted amount the wallet is debited with, byte-identical to the engine's `participant.betAmount` locked at the accepting tick since E5 — and is never re-read from the input; it clears with the other per-round flags on return to betting. The potential-win display (shown only while participating in a dive) now derives from the same locked value via new `roundBet` state, so display and payout agree by construction; honest-play display is unchanged. No engine, RNG, economics, payout-formula, EventBus or other UI change.
- Files modified: `src/components/AbyssAnchor.tsx` (betPlaced locks `roundBetRef`+`roundBet`; diveStarted re-read deleted; idle reset clears them; `potentialWin` uses the locked bet), `src/engine/state-machine.test.ts` (2 new characterization tests), docs 15/16.
- Architectural decisions: the lock rides the `betPlaced` event payload rather than a facade read — settlement stays purely event-driven (§3), which is exactly the Phase 8 shape (the server's bet-accepted message carries the amount). The engine needed no change: it has held the authoritative locked amount since E5; the bug was settlement ignoring it.
- Risks: none open. Validation: **83/83 tests green** (2 new: locked-amount immutability — later placeBet attempts rejected with the amount unchanged into the dive; settlement replay from event payloads alone proving debit and win share one basis, 5 in → 5 × m out, never 100 × m); tsc clean; lint at the 9+6 baseline (zero new findings); production build passes. One transient full-suite vitest worker crash reproduced the known environment flake (all files fail with no tests); passes repeatedly on re-run and with `--no-file-parallelism`. Manual gameplay pass: owner's review step.

### Commit 7 — E6: EngineDriver + Projections + Snapshots (D5) — extraction complete

- Date: 2026-07-19
- Summary: The final §21 extraction step (**sanctioned delta D5 lands here — the last of the five**). `EngineDriver` (`src/engine/driver.ts`, §13) owns the rAF loop and the wall clock (the single sanctioned `requestAnimationFrame` site in the engine, §4): per frame it feeds the wall delta into `engine.advance()`, then hands the projections to a host-supplied sink — `frame(getRenderState(), getRenderTime())` for the renderer and `sync(getPublicState())` for the HUD. The driver+engine pair is owned per game session at module scope: detach (component unmount) pauses the loop and keeps engine state; re-attach resumes with a fresh wall-clock baseline — remounting no longer restarts the world (§13, the engine-side twin of docs/05 §2.3). Final projections (§14/§15): `getRenderState()` byte-compatible with docs/05 §4 (`shipImpact.elapsed` now `simTime − impactAt` on the simulation clock per §8 — the component's `performance.now()` bookkeeping deleted; the FX lifetime cutoff stays renderer-owned per docs/05 R5, so the field stays non-null until the round's world reset — renderer output byte-equal); `getRenderTime()` (`animTime = simTime`, `frameDt` = clamped last wall delta — the engine still never reads a clock); `getPublicState()` (phase via the fixed §5 map, roundId, countdownSeconds, multiplier, boost, participant, chests, chosenChestId). `snapshot()`/`restore()` (§14): plain JSON `EngineSnapshot { schemaVersion, tickCount, round, world }`, deep-copied both ways; restore is a pure state assignment (no events, no entry actions), discards pending commands + accumulated wall time, and rejects unknown schemas via `engineError` with state untouched (§18 ring 1); RNG stream positions deliberately absent until Phase 8 seeded streams; the Authority/Public secrecy split stays latent (this is the authority view). D5: the component's 100 ms countdown interval deleted (`COUNTDOWN_TICK_MS` removed with its pin); the HUD mirrors public state once per frame (equal-value setState bails → quiet phases re-render nothing). `AbyssAnchor.tsx` is a UI shell — rendering attach, user input → commands (only the §3 wallet affordability check remains; the engine validates the rest, D4), and settlement/display event subscriptions (money math verbatim, §3): **419 lines** (507 pre-E6; 1,415 pre-Sprint-2). Migration seams closed (§20 risk 2): E5's world-read getters gone from the facade, §7 clock constants left the barrel, component rAF loop/`RenderState` assembly/`phaseRef`/`lastTsRef`/`shipImpactRef` deleted.
- Files modified: new — `src/engine/driver.ts`, `src/engine/driver.test.ts`, `src/engine/snapshot.test.ts`; modified — `src/engine/game-engine.ts` (projections, `EnginePublicState`, `EngineSnapshot`, snapshot/restore, lastFrameDt; seam getters removed), `src/engine/state-machine.ts` (`impactAt`, chest/participant getters, `RoundSnapshot` + snapshot/restore), `src/engine/simulation.ts` (`WorldSnapshot` + snapshot/restore), `src/engine/index.ts` (final public surface), `src/engine/game-engine.test.ts` (projection pins; determinism spot-check upgraded to full snapshots), `src/engine/state-machine.test.ts` (reads via projections), `src/components/AbyssAnchor.tsx` (UI shell), `src/game/constants.ts` + `constants.test.ts` (COUNTDOWN_TICK_MS removed), `src/engine/README.md`, docs 15/16.
- Architectural decisions: the driver takes a host-supplied *sink* (render + sync callbacks) instead of importing the renderer — DOM/canvas sizing stays host-side and `src/engine` keeps zero runtime imports from `src/rendering` (§4); `frameDt` is recorded from `advance()`'s input so `getRenderTime()` needs no clock read (§8: the wall clock enters the engine only as a driver-fed delta); `EnginePublicState.phase` uses the renderer Phase vocabulary (the §5 projection) because the HUD is its consumer; snapshot slices live with their owners (`RoundSnapshot` in the machine, `WorldSnapshot` in the simulation) and the facade composes them; the snapshot omits the sub-tick accumulator remainder — §14's categories are the contract, and tick-boundary determinism is what the tests assert.
- Risks: the one intentional projection difference — `RenderState.shipImpact` stays non-null (with growing `elapsed`) after the 1.4 s FX window until the next dive, where the old caller nulled it; the Effects layer's existing lifetime guard makes renderer output identical (verified in its code path; covered by D5/§8's ratified move of FX timing onto the sim clock). Validation gate: `tsc --noEmit` clean; **81/81 tests green** (15 new); lint improved **10+6 → 9+6** (one pre-existing error left with deleted code; zero new findings); production build passes; dev-server SSR smoke test HTTP 200 with canvas markup; determinism spot-check now compares full snapshots. Manual gameplay pass: owner's review step.

### Commit 6 — E5: Simulation Systems + Command Queue (D4)

- Date: 2026-07-18
- Summary: The remaining simulation systems move into the engine (docs/06 §21 step E5; **sanctioned delta D4 lands here**). `DiveSimulation` (`src/engine/simulation.ts`) owns the world — worldY, boost, multiplier, the flat creature array and its spawn cursor (§10) — and the §6.3 diving pipeline moved **verbatim** from the component's `stepSimulation` closure: multiplier from dive-elapsed sim time → boost decay + bonus → crash check (terminal, D3) → descent integration → spawn-ahead creature spawning (world Rng stream, §11) → goldfish collision → boost gain → sea-floor check (terminal). The E3/E4 `divingTick` seam is deleted; entry(diving) resets the world engine-side. The command queue replaces all direct gameplay callbacks (§13): `GameEngine.submit()` queues, and each consumed tick validates + applies queued commands **at the tick boundary, before the machine steps** — `placeBet` / `cashOut` / `pickChest`, with per-reason `commandRejected` events (§18 ring 1) and no listener reentrancy (§12). D4: cashout now uses the tick-authoritative multiplier instead of the component's last-rendered value (≤ one frame difference; the engine value can only be more current). Participant round state (§2) lives in the machine (`betAmount`/`cashedOut`/`cashedOutAt`, cleared at entry(betting), jackpot auto-cash at entry(impact)); settlement stays outside — the affordability check runs wallet-side before submit, the debit rides the new `betPlaced` listener, cashout credit/history/flash ride the `cashedOut` listener, money math verbatim (§3). The component's world refs and pipeline are gone; renderer inputs (worldY, boost, creatures) and the diving HUD values pull engine state per frame (§12 pull model). Rendering and projection logic untouched; the countdown display interval remains until D5 (E6).
- Files modified: `src/engine/simulation.ts` (new), `src/engine/simulation.test.ts` (new), `src/engine/state-machine.ts` (drives the simulation; participant state; `applyCommand`), `src/engine/game-engine.ts` (command queue + world-state getters; `divingTick`/`crashAt`/`diveElapsed` seams removed — crashAt is authority-secret, §14), `src/engine/index.ts` (public surface trimmed to the facade + edges), `src/engine/state-machine.test.ts` (harness drives the real pipeline; command tests), `src/engine/game-engine.test.ts` (D4 boundary + reentrancy tests), `src/components/AbyssAnchor.tsx` (507 lines, was 563), `src/engine/README.md`, docs 15/16.
- Architectural decisions: the simulation is a separate module the state machine drives (systems vs. machine per §9/§5 split); command validation lives with the state it validates against (machine); the facade exposes plain world-state getters as the documented mid-migration seam until E6's projections; the engine barrel no longer exports domain functions (§4 — only the facade surface).
- Risks: behavioral drift — mitigated by moving the pipeline byte-for-byte and rewriting the transition tests to drive the *real* pipeline on deterministic Rngs (66 tests green, incl. new pipeline characterization + command-queue pins); the chest result timer now starts at the tick boundary where the pick applies (≤ one tick shift, within D4's sanctioned scope). Validation: tsc clean; lint at the 10 + 6 baseline (zero new findings); production build passes.

### Commit 5 — E4: Round State Machine (Timers on the Simulation Clock)

- Date: 2026-07-18
- Summary: All phase transitions and round-lifecycle timers move into the engine (docs/06 §21 step E4; **sanctioned deltas D1 + D3 land here**). `RoundStateMachine` (`src/engine/state-machine.ts`) owns the five §5 states, `roundId`, the betting countdown and the single pending state timer — every duration a **whole-tick count** on the simulation clock (§8 quantization; deterministic integers, no float drift): betting 5 s = 300 ticks, crash banner 2.4 s = 144, impact→chests 1.4 s = 84, chest result 2.2 s = 132. Entry actions consult the injected `RoundAuthority` (§16: crashAt at entry(diving), jackpot at entry(impact), chests at entry(bonus)) and emit the §12 events; `ENGINE_STATE_TO_PHASE` is the fixed §5 projection to renderer `Phase` strings (RenderState contract untouched). Timeout→duration map (per §20 risk 3): countdown `setInterval`+`beginDive` → betting countdown ticks (its `phase==="idle"` guard → transitions only exist from `betting`); `CRASH_BANNER_MS` setTimeout → crashed timer (its `phase==="crashed"` re-check → structural: one timer, owned by the current state, cleared on every entry); `SHIP_IMPACT_TO_CHESTS_MS` setTimeout → impact timer (its `"cashed"||"diving"` re-check → structural); `CHEST_RESULT_TO_IDLE_MS` setTimeout (unguarded) → bonus result timer; `bonusTriggered` one-shot flag → structural (diving exited). D1: the multiplier's elapsed time base is now `engine.diveElapsed` (simulation clock) — after a tab-away, multiplier and world freeze together instead of diverging; D3: the diving pipeline (still component-owned, injected `divingTick`) returns a terminal outcome ("crashed"/"seaFloor") and ends its tick — the machine applies the transition; crash and sea-floor can never double-fire. Settlement extracted from the transition code into event listeners (§21 E4): crashed → clamp display + loss history; shipImpact → jackpot credit/flash/FX bookkeeping/history; chestPicked → delta credit/history — **money math verbatim**, engine never touches balances (§3); `RunState` dissolved (bet → settlement-side `roundBetRef`). Deliberately NOT landed: command queue/D4 (`cashOut` stays a direct callback; `pickChest` calls the engine directly — pre-D4 immediate apply + synchronous dispatch, documented seam), D5 (the 100 ms countdown interval remains, but display-only: it mirrors `engine.countdown`), settlement logic changes (none).
- Files modified: new — `src/engine/state-machine.ts`, `src/engine/clock.ts` (§7 constants moved out of the facade), `src/engine/state-machine.test.ts`; modified — `src/engine/game-engine.ts` (machine steps per tick; `authority`+`divingTick` deps; state/countdown/diveElapsed/crashAt getters; `pickChest`), `src/engine/index.ts`, `src/engine/game-engine.test.ts` (reworked for the new deps), `src/components/AbyssAnchor.tsx` (deletions above; §12 event listeners; D1/D3 tick body), `src/game/types.ts` (`RunState` removed), `src/engine/README.md`, docs.
- Architectural decisions: machine timers stored as integer tick counts (whole-tick §8 quantization made literal — deterministic and drift-free); the diving pipeline reports outcomes and the machine applies transitions (keeps transition authority in one place while systems finish migrating in E5); `engine.pickChest` dispatches its events synchronously so today's same-click UI feedback is preserved until D4 formally moves command application to the tick boundary; `crashAt` exposed on the facade only as a mid-migration read for the pipeline body (internal from E5).
- Risks: none open. Validation gate: `tsc --noEmit` clean; **50/50 tests green** (5 new transition-sequence tests on a seeded engine per §20 risk 1: exact tick durations, event payload pins, D3 no-refire, bonus-waits-forever, rejection reporting; accumulator tests reworked for the machine); lint improved **29+6 → 10+6** (19 pre-existing prettier errors left with the deleted transition code; zero new findings); production build passes; dev server smoke-tested (HTTP 200). Manual gameplay pass: owner's review step.

### Commit 4 — E3: Engine Skeleton (Clock + Fixed-Tick Accumulator + Event Bus)

- Date: 2026-07-18
- Summary: The engine owns time (docs/06 §21 step E3; **sanctioned delta D2 lands here** — the only behavior delta of this commit). `GameEngine` facade (`src/engine/game-engine.ts`): fixed 60 Hz simulation ticks (`TICK_SECONDS = 1/60`) consumed from a wall-clock accumulator; catch-up capped at `MAX_TICKS_PER_ADVANCE = 3` (= 0.05 s, the direct translation of the old per-frame `MAX_TICK_SECONDS` clamp) with excess dropped — after a tab switch the world resumes, never fast-forwards; simulation clock `simTime = tickCount × TICK_SECONDS` (§8), now the source of `RenderTime.animTime` (per §8 the accumulated clamped clock *is* simTime after extraction; `swayRef` deleted). Typed `EventBus` (`src/engine/events.ts`, §12): emits queue, dispatch after each completed tick from `advance()`, listener exceptions firewalled (caught + logged, remaining listeners run, §18), reentrant emits deferred to the next dispatch; the §12 event-map payload shapes are finalized (all carry `roundId`), with `EngineCommand` protocol shapes in `src/engine/commands.ts` (§13). No emitters fire yet — they land with their owners (state machine E4, systems/commands E5). Mid-migration seam per §20 risk 2: the per-tick simulation body stays component-owned, injected as `deps.tick` and run once per fixed tick with dt = 1/60; the component rAF now only feeds wall deltas into `engine.advance()` and renders once per frame with the latest state (§7: ticks and frames independent; §21 E3: "driven from the existing component rAF" — the EngineDriver proper lands in E6). Deliberately NOT landed, per scope: D1 (multiplier stays wall-clock — its read moved from the rAF timestamp to `performance.now()` inside the tick, same clock, sub-ms), D3 (tick-body structure untouched, no early exit), D4/D5, state machine, command queue, settlement changes.
- Files modified: new — `src/engine/game-engine.ts`, `src/engine/events.ts`, `src/engine/commands.ts`, `src/engine/game-engine.test.ts`, `src/engine/events.test.ts`; modified — `src/engine/index.ts` (facade exports), `src/components/AbyssAnchor.tsx` (tick body → `stepSimulation` injected into `GameEngine`; rAF loop feeds `advance()`; `animTime: engine.simTime`; `swayRef` removed), `src/engine/README.md`, `docs/16_CURRENT_TASK.md`, `docs/15_PROGRESS.md`.
- Architectural decisions: on hitting the catch-up cap the accumulator is cleared entirely (§7 "excess accumulated time is dropped" — most faithful to the old clamp, which had no accumulator at all); event dispatch runs after each completed tick (not once per advance) so listeners observe every consistent post-tick state; `EngineCommand`/`EngineStateName` defined as types now so the §12 event map is finalized with the bus (§12: "shapes finalized in the extraction commit that lands the bus") while their machinery stays in E4/E5; `frameDt` keeps the old per-frame clamp — it is the renderer's contract input (docs/05 §4), not a simulation input.
- Risks: none open. Validation gate: `tsc --noEmit` clean; **45/45 tests green** (10 new: accumulator tick/cap/remainder semantics, determinism spot-check per §21 gate — identical advance sequences ⇒ identical tick traces — and EventBus order/unsubscribe/firewall/reentrancy); lint **unchanged at the 29+6 baseline** (zero new findings); production build passes; dev server smoke-tested (HTTP 200). One transient full-suite vitest worker crash was observed once and did not reproduce (passes repeatedly, also with `--no-file-parallelism`) — environment flake, not code. Manual gameplay pass: owner's review step.

### Commit 3 — E2: Domain Consolidation

- Date: 2026-07-18
- Summary: The engine's domain layer exists (docs/06 §21 step E2), all formulas/tables/constants moved verbatim (§9), all 26 E1 pins migrated with identical golden values, suite now 35 tests green. (1) Pure math → `src/engine/domain/`: `multiplier.ts` (`multiplierAt`, `timeForMultiplier`), `descent.ts` (`descentSpeed`), `outcomes.ts` (`sampleCrashPoint`, `sampleJackpot`, `rollBonusChests` as pure functions over an injected `Rng`, incl. the pinned TASK 001 flaws), `creatures.ts` (`Creature` + `rollCreature` — the depth-banded kind table and attribute rolls extracted from the component's `spawnCreature` closure and now pinned by new characterization tests, six draws in the original order), `tuning.ts` (gameplay/simulation constants — the future `EngineConfig` surface). (2) `Rng` service (`src/engine/rng.ts`, §11): `Math.random` appears in the engine only inside `createMathRandomRng`; `outcome` and `world` streams are separate instances. (3) `RoundAuthority` seam (`src/engine/round-authority.ts`, §16): `LocalRoundAuthority` binds the outcome distributions to the injected outcome stream; the deferred `sampleJackpot` micro-task folded in per §20 risk 5 with owner sign-off. (4) §4 constants ownership resolved: presentation scalars → `src/rendering/constants.ts`, `BG_*` palette → `src/rendering/theme.ts`, world geometry → `src/shared/world.ts`, `CreatureKind` → `src/shared/creatures.ts`; `src/game/` keeps only UI-shell values, `formatMultiplier`/`chainTier` → `src/game/presentation.ts` (no user-facing strings in the engine, §3); `src/lib/abyss-game.ts` dissolved. (5) Contract types: `Phase`/`RenderCreature` now defined in `src/rendering/render-state.ts` (resolving the R1 relocation note); engine domain types conform to them, keeping the type-import direction engine → rendering (§4). Component: outcome draws go through `roundAuthority`, world draws through `worldRng` (module-scope until E3 injects them), `spawnCreature` closure deleted, temporary `sampleJackpot` export deleted. Zero behavior change — no sanctioned delta lands in E2.
- Files modified: new — `src/engine/{rng,round-authority,index}.ts`, `src/engine/domain/{multiplier,descent,outcomes,creatures,tuning}.ts` (+ 6 engine test files incl. `test/sequence-rng.ts`), `src/shared/{world,creatures}.ts` (+ test), `src/rendering/constants.ts` (+ test), `src/game/presentation.ts` (+ test); modified — `AbyssAnchor.tsx`, `render-state.ts`, `scene-renderer.ts`, `camera.ts`, `theme.ts`, 4 layer/draw modules, `src/game/{config,constants,types}.ts` (+ their tests), 3 READMEs; deleted — `src/lib/abyss-game.ts` (+ test), `src/components/AbyssAnchor.test.ts`.
- Architectural decisions: `src/engine/index.ts` is the engine's public surface until the E3 facade, and deliberately does not export the outcome distributions — outcomes are drawn only through a `RoundAuthority`; `CreatureKind` sits on the shared floor (protocol-shaped, needed by both sides) rather than in either layer; the component's spawn-jitter draw uses the `world` stream for draw discipline; UI flash timings stay in the shell per §8.
- Risks: none open. Validation gate: `tsc --noEmit` clean; 35/35 tests green; production build succeeds; dev server serves the game; lint baseline improved 33+7 → **29+6** (moved/dissolved code took 4 pre-existing prettier errors and E1's temporary export warning with it; new files are clean — no new findings). Manual gameplay pass: owner's review step.

### Commit 2 — E1: Test Harness + Characterization Tests

- Date: 2026-07-18
- Summary: vitest 4 added as a devDependency (approved with the Commit 1 sign-off, per §20 risk 4) with a minimal `vitest.config.ts` (node environment, native tsconfig-paths resolution; kept separate from the app's TanStack Start vite config) and an `npm test` script. 26 characterization tests pin the current behavior before any code moves (§20 risk 1): the pure math in `src/lib/abyss-game.ts` — `multiplierAt` curve values, `timeForMultiplier` values + round-trip, `descentSpeed` values + 640 px/s cap, `formatMultiplier` (including its `toFixed` float artifact), `chainTier` band boundaries; the outcome distributions via stubbed `Math.random` draw sequences (exact branch boundaries and band arithmetic — deterministic, no statistical assertions) plus hard-bounds sampling — `sampleCrashPoint` (3% instant-crash branch, clamp [1.01, 200]), `rollBonusChests` (60/32/8 bands, 2-decimal rounding, ids/opened structure), `sampleJackpot` (50/35/15 bands, [50, 500]); and verbatim-move tripwires pinning every value in `src/game/config.ts` and `src/game/constants.ts` (§9: "all formulas, tables and constants move verbatim"). The known economics flaws (TASK 001) are pinned as-is, deliberately. One non-test source change: `sampleJackpot` in `AbyssAnchor.tsx` gained an `export` keyword (behavior-neutral) so it can be pinned in place before E2 moves it to `RoundAuthority` — this adds one `react-refresh/only-export-components` lint warning that E2 removes with the move.
- Files modified: `package.json`/`package-lock.json` (vitest devDependency + `test` script), `vitest.config.ts` (new), `tsconfig.json` (include `vitest.config.ts`), `src/lib/abyss-game.test.ts` (new), `src/components/AbyssAnchor.test.ts` (new), `src/game/config.test.ts` (new), `src/game/constants.test.ts` (new), `src/components/AbyssAnchor.tsx` (export keyword only), docs tracking updates.
- Architectural decisions: characterization pins golden values of today's implementation (a failing pin means behavior drifted — the offending commit stops); randomized functions are pinned deterministically by stubbing the ambient `Math.random` (the RNG injection seam arrives in E2 — tests will migrate to seeded `Rng` injection then); distribution tests assert exact branch mappings and hard clamp bounds only, never frequencies, so the suite cannot flake; the depth-banded creature kind table cannot be pinned in E1 (it is a closure inside the component) — its characterization lands in the commit that extracts it (E2/E5), pinned at the new location in the same commit.
- Verification: 26/26 tests green; `tsc --noEmit` clean; production build clean; dev-server SSR smoke test HTTP 200 with canvas markup; lint 33 errors + 7 warnings vs the 33 + 6 baseline — the single new warning is the documented `sampleJackpot` export (temporary until E2); zero findings in the new test files. New lint baseline recorded: 33 errors + 7 warnings.
- Risks: none to the running game (the only runtime change is an `export` keyword). The harness itself is new infrastructure; its value depends on E2+ keeping the pins green.

### Commit 1 — Engine Architecture Planning (documentation only)

- Date: 2026-07-18
- Summary: `docs/06_ENGINE_ARCHITECTURE.md` created — the complete Game Engine architecture blueprint (21 sections): engine responsibilities and boundaries (money, wallet, UI, rendering, network all outside), complete round state machine (betting/diving/crashed/impact/bonus with the renderer `Phase` projection map), round lifecycle with the authoritative per-tick pipeline order, fixed 60 Hz tick model with accumulator and preserved catch-up cap, three-clock time management (wall clock confined to the driver), simulation system decomposition (multiplier/descent/spawner/collision/boost, all formulas verbatim), flat entity management (no ECS), RNG boundary (injected `Rng`, outcome vs. world streams; finding recorded: every engine draw is outcome-relevant because goldfish boost affects payout), edge-triggered typed event map, `GameEngine` facade + `EngineDriver` public API with tick-boundary command queue, snapshot model with authority/public secrecy classes, renderer contract obligations (RenderState byte-compatible), backend contract via the `RoundAuthority` seam (local now, remote in Phase 8 — engine core mode-blind), multiplayer readiness, three-ring error handling (validate/assert/firewall; fail-safe = stop), scalability stance, risks/non-goals, and the E0–E6 extraction order with a per-commit validation gate. No code modified.
- Files modified: `docs/06_ENGINE_ARCHITECTURE.md` (new), `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md` (tracking updates).
- Architectural decisions: deterministic fixed-tick simulation on a single engine-owned clock; authority-swappable outcome module (`RoundAuthority`) + injected RNG as the entire Phase 8 seam; commands as queued typed objects that are also the future protocol messages; money kept out of the engine entirely (settlement listener at the event edge); engine lifetime decoupled from React; five sanctioned behavior deltas (D1–D5, §7.1) enumerated as the only permitted differences — ratified by approving the document; `sampleJackpot` micro-task recorded as superseded (destination is now `RoundAuthority`, pending owner sign-off).
- Risks: none to the running game (docs only). Open approval items: vitest devDependency for E1; D1–D5 ratification; `sampleJackpot` fold-in.

---

## TASK 005 — Sprint 2: Rendering Architecture (Completed 2026-07-18)

### Sprint 2 Close-Out Summary

Six commits over 2026-07-17 → 2026-07-18, each approved individually:

1. Commit 1 — `docs/05_RENDERING_ARCHITECTURE.md` blueprint (21 sections, the binding contract).
2. R1 — eight draw helpers → `draw/*.ts` + `theme.ts` color tokens (verbatim, literal-identical).
3. R2 — `camera.ts` (anchor-locked transform + unified culling predicate).
4. R3 — `render-state.ts` + `scene-renderer.ts` + five layers; `drawScene` deleted; component builds `RenderState` from refs.
5. R4 — `assets.ts` AssetManager; module-scope sprite side effect removed.
6. R5 — FX timing handoff completed; dev-only frame-time meter.

Result: `src/rendering` matches §18's target structure exactly; `AbyssAnchor.tsx` (1,415 lines pre-Sprint-2) now holds simulation + UI only and calls one API: `SceneRenderer.frame(RenderState, RenderTime)`. Rendering is a pure `(state, time) → pixels` consumer — no money, no clocks (one sanctioned dev-meter exemption), no RNG below the Effects layer. Phase 4 of the roadmap is complete.

### Sprint 2 Retrospective

**Accomplished:** the entire §19 extraction plan (R1–R5) with zero behavior change across six commits — every commit typechecked, built, stayed at or below the lint baseline (47→33 errors over the sprint), and kept the game playable. The renderer is engine-ready (multiplayer snapshot rendering by construction) and PixiJS-portable at the documented boundary. Four spec-vs-reality gaps were resolved through the doc's own correction rule (§6 culling margins, §18 import allowances ×2, §4/§14/§20 meter clock exemption) — the document stayed authoritative the whole way.

**Lessons learned:** (1) A fixed contract pulls work forward: §4's `RenderState` shape forced the FX-elapsed handoff into R3, shrinking R5 — extraction steps aren't perfectly separable, and recording the scope shift immediately (CURRENT_TASK note) kept later commits honest. (2) "Doc corrected first, in the same commit" scales well: cheap for import-allowance gaps, decisive for the real conflict (meter vs. no-clock rule). (3) Verbatim-move discipline plus a tracked lint baseline is an effective regression tripwire in a project with no test harness. (4) Validation that can't be automated yet (§21 screenshots, gameplay pass) must stay explicitly assigned to the developer per commit, or it silently becomes nobody's job.

**Technical debt intentionally deferred (all recorded in the docs cited):** `sampleJackpot` still in the component (Sprint 1 Step 1.2, own commit); jackpot RTP economics flaw preserved on purpose (TASK 001, rebalance is a separate approved task); creature `switch` → registry (§10, later commit); §7 depth-band palette generalization not implemented (gradient kept verbatim); §14 "do when" optimizations untriggered (gradient caching, wreck pre-render, quality flag); `useSceneRenderer` hook (§17) not built — component owns renderer lifecycle inline until the engine driver exists; FX events ride `RenderState` until the Phase 5 event bus (§17); camera/layers import geometry constants from `src/game` until the engine extraction relocates them (§18 corrections); lint baseline debt (33 prettier errors + 6 warnings, incl. the unused `timeForMultiplier` import); no test harness (golden-image tests unlocked by the layer/state split, planned Phase 5+).

**Sprint 3 readiness:** READY. The engine extraction has a stable output target (`RenderState`), a defined event channel (§17), and a component whose remaining code is exactly the extraction subject (simulation + UI). Risks to plan around: simulation is still interleaved with React state/timers (`setTimeout` phase transitions, `useState`/ref mirrors); money math is float-based (integer minor-units migration is roadmapped); no characterization tests exist — recommend Sprint 3 start with the planning commit plus characterization tests pinning current behavior (including the known economics bug) before moving code.

### Commit 6 — R5: FX timing handoff + frame-time meter

- Date: 2026-07-18
- Summary: The final extraction step (§19 R5). (1) FX timing handoff completed: `draw/impact-fx.ts` no longer imports `SHIP_IMPACT_FX_SECONDS` — the `life = min(1, dt / SHIP_IMPACT_FX_SECONDS)` line moved to the Effects layer (which owns the lifetime per §12's timing contract) and `drawShipImpact` takes `life` as a parameter alongside `dt` (`dt` is still needed raw for bolt rotation). Identical math, identical values; the draw module now holds zero timing knowledge. The `performance.now()` bookkeeping had already moved to the caller in R3 (forced by the fixed §4 contract), as recorded then. (2) Dev-only frame-time meter added to `scene-renderer.ts` (§14 item 8): 120-frame rolling window (fixed `Float64Array` ring — zero steady-state allocation), avg + p95 logged via `console.debug` every 300 frames (~5 s), gated by `import.meta.env.DEV`. Verified compiled out of the production bundle (both call sites eliminated; `import.meta.env` occurs 0 times in output).
- Files modified: `src/rendering/draw/impact-fx.ts`, `src/rendering/layers/effects.ts`, `src/rendering/scene-renderer.ts`, `docs/05_RENDERING_ARCHITECTURE.md` (§4/§14/§20 corrections), `src/rendering/README.md`, tracking docs.
- Architectural decisions: conflict discovered and resolved per the doc's own rule — §14.8/§17 place the frame-time meter inside SceneRenderer, but the §4 hard rule and §20 grep rule banned `performance.now()` under `src/rendering/`, and §14.8's "debug layer" option would break §13's no-canvas-text law. Correction recorded (mirroring §12's RNG exemption): the dev-only meter in `scene-renderer.ts` is the single sanctioned wall-clock read — instrumentation only, never feeds a render path, dead code in production. Meter output is log-only; no public stats getter was added (nothing would consume it yet — no dead API).
- Verification: `tsc --noEmit` clean; production build clean; prod bundle inspected — `frame()` ends at the layer loop, meter calls eliminated; grep rule holds (only the two sanctioned meter lines under `src/rendering/`); lint exactly at the 33 errors + 6 warnings baseline; dev-server SSR smoke test HTTP 200 with canvas markup. §21.5's frame-time number: this commit *introduces* the meter, so it establishes the baseline — the dev-machine reading lands with the developer's manual pass and applies from the next rendering commit onward.
- Risks: none new — parameter-passing refactor with identical arithmetic; meter is dev-only and render-inert. Manual gameplay pass by the developer still required (docs/18_GIT_WORKFLOW.md step 2). With R5, `AbyssAnchor.tsx` contains simulation + UI only and Phase 5 (engine extraction) can proceed against the stable rendering API.

### Commit 5 — R4: AssetManager

- Date: 2026-07-18
- Summary: `src/rendering/assets.ts` created per §15: `AssetHandle { image, ready }`, `AssetManager` with `preload(manifest) → Promise<void>` and `get(key)` (key typed to the manifest, so unknown keys are compile errors), a one-entry V1 manifest (`anchor` → `src/assets/anchor.png`), and eager preload at module init — matching the previous module-scope load, so first-frame behavior is unchanged. `handle.ready` is a getter reproducing the pre-R4 blit predicate exactly (`image.complete && image.naturalWidth > 0`), which also covers the failure policy: a failed load logs once (onerror) and leaves `ready = false` forever; no retries; game keeps running on vector art. The module-scope `ANCHOR_IMAGE` and the `anchor.png` import were deleted from `draw/anchor.ts`; `drawAnchor` now takes an `AssetHandle` as its final parameter (type-only import) and blits only when ready; the Actor layer passes `assets.get("anchor")`. SSR-safe: on the server the handle's image is null and `ready` stays false (previous `typeof window` guard semantics preserved).
- Files modified: `src/rendering/assets.ts` (new), `src/rendering/draw/anchor.ts` (sprite side effect removed; handle parameter), `src/rendering/layers/actor.ts` (import + call site), `src/rendering/README.md`, tracking docs.
- Architectural decisions: none new — §15 implemented as specified; no §18 corrections needed (draw modules and layers were already permitted to import `assets.ts`). `ready` as a live getter (rather than an onload-set flag) was chosen precisely to keep the blit-start frame byte-identical to the old per-frame `complete` poll.
- Verification: `tsc --noEmit` clean; production build clean with the anchor sprite emitted (`anchor-*.png` in `.output/public/assets`); dev-server SSR smoke test HTTP 200 with canvas markup (exercises the module-init SSR path); lint exactly at the 33 errors + 6 warnings baseline — zero findings in rendering files.
- Risks: first-frame behavior was the flagged §20 risk — mitigated by eager module-init preload plus the getter-based ready predicate; load-start timing is unchanged (assets.ts initializes on the same import chain that previously initialized draw/anchor.ts). Manual gameplay pass by the developer still required (docs/18_GIT_WORKFLOW.md step 2).

### Commit 4 — R3: RenderState + SceneRenderer + layers

- Date: 2026-07-18
- Summary: The main extraction step (§19 R3). `src/rendering/render-state.ts` defines the renderer's input contract (`RenderState` with the §4-fixed shape, `RenderCreature` as the §10 `Pick`, `RenderTime { animTime; frameDt }`, and the `RenderLayer` interface). `src/rendering/scene-renderer.ts` is the single public entry point: owns the 2D context, per-frame backing-store/DPR clamp/transform reset (moved verbatim from `drawScene`), the `Camera` (updated once per frame from `RenderState.worldY` before layers render, per §6 — ownership transferred from the component's ref), and the ordered layer list. The `drawScene` body redistributed verbatim into five layers — `layers/background.ts` (depth gradient), `environment.ts` (light rays incl. the `screen` composite save/restore, bubbles), `world.ts` (creatures → surface ship → sea floor, with culling), `actor.ts` (sway math moved as one unit per §20 risk 4; chain → anchor), `effects.ts` (ship-impact FX, clock-free) — statement order preserved exactly. The component's `drawScene` useCallback (with its `[bet]` stale-closure hazard) is deleted; the tick assembles `RenderState` from refs only and calls `resize()` + `frame()`. The ship's inline world position (−180) became `SHIP_WORLD_Y` in `src/game/constants.ts` (§8).
- Files modified: `src/rendering/render-state.ts`, `src/rendering/scene-renderer.ts`, `src/rendering/layers/{background,environment,world,actor,effects}.ts` (new), `src/components/AbyssAnchor.tsx` (drawScene deleted; state assembly in tick), `src/game/constants.ts` (SHIP_WORLD_Y), `docs/05_RENDERING_ARCHITECTURE.md` (§18 corrections), `src/rendering/README.md`, tracking docs.
- Architectural decisions: §18 corrected per the doc's own rule — layers import the geometry constants their moved code already referenced (until the engine extraction); `effects.ts` imports the pure `anchorSwayX`/`anchorPinY` helpers from `layers/actor.ts` (impact FX track the swaying anchor; Master-Rules no-duplication); `render-state.ts` hosts `RenderLayer`; `scene-renderer.ts` re-exports the contract types so the component imports only from it. Ship-impact FX already ride `shipImpact.elapsed` in state (forced by the fixed §4 contract + the renderer no-clock rule); the `performance.now()` bookkeeping stayed in the component, so R5 shrinks to the `SHIP_IMPACT_FX_SECONDS` draw-module import removal + frame-time meter (recorded in CURRENT_TASK.md). §7's depth-band generalization was deliberately NOT implemented — R3 is move-only; bands are a later approved change.
- Verification: `tsc --noEmit` clean; production build clean; dev-server SSR smoke test HTTP 200 with canvas markup; lint 33 errors + 6 warnings vs 38+7 baseline — zero new findings (5 removed errors sat on deleted `drawScene` lines; 3 prettier findings in new files were caught and fixed pre-commit; the now-unused `eslint-disable react-hooks/exhaustive-deps` directive was removed, −1 warning). Draw order verified by statement-order mapping old `drawScene` → layer sequence (§5 canonical order).
- Risks: camera update now happens before the Background/Environment layers instead of after the bubbles — no observable difference (neither layer queries the camera transform; viewport values are identical). `shipScreenY` is computed twice (World, Actor) from the same pure transform — identical result by construction. Manual gameplay pass + §21 screenshot checkpoints by the developer still required.

### Commit 3 — R2: Camera extracted

- Date: 2026-07-18
- Summary: `src/rendering/camera.ts` created (per §6/§19): vertical-only, anchor-locked `Camera` class with `follow`, `setViewport`, `worldToScreenY`, `isVisibleY`, `viewport`. The component's inline `worldToScreen` closure is deleted; the transform formula moved with its exact floating-point expression order preserved (`h * ANCHOR_SCREEN_Y_FRAC + (worldY − (followY + ANCHOR_WORLD_OFFSET_PX))`). The three ad-hoc culling checks (creatures, ship, sea floor) now go through `camera.isVisibleY`.
- Files modified: `src/rendering/camera.ts` (new), `src/components/AbyssAnchor.tsx` (camera ref + 3 call sites), `docs/05_RENDERING_ARCHITECTURE.md` (§6 correction), `src/rendering/README.md`, tracking docs.
- Architectural decisions: §6 corrected per the doc's own conflict rule — the three real culling checks have different margins (creatures ±120 inclusive; ship −120/+80 exclusive; floor bottom-only +100 exclusive), so `isVisibleY` takes independent `marginTop`/`marginBottom` (default symmetric; `Infinity` disables the top bound) with inclusive comparisons. `setViewport` added as owner-side API. Component owns the `Camera` instance (lazy-init ref) until R3's SceneRenderer takes ownership.
- Verification: `tsc --noEmit` clean; production build clean; full lint back at baseline (38 errors + 7 warnings, zero new findings — one new prettier finding in camera.ts was caught and formatted before commit).
- Risks: at exact floating-point boundary equality the ship/floor culls became inclusive where they were exclusive — a measure-zero, visually unobservable unification recorded in §6. Manual gameplay pass by the developer still required (docs/18_GIT_WORKFLOW.md step 2).

### Commit 2 — R1: Pure draw modules extracted

- Date: 2026-07-17
- Summary: The eight canvas draw helpers (`drawShip`, `drawChain`, `drawShipImpact`, `drawAnchor`, `drawCreature`, `drawFish`, `drawSeaFloor`, `drawTreasure`) moved verbatim from the game component into `src/rendering/draw/` (six modules per §18); static color literals became named tokens in `src/rendering/theme.ts` with byte-identical values (alpha-modulated FX colors exposed as functions taking the per-frame alpha; the alpha math stays at call sites). The preloaded anchor sprite moved with `drawAnchor` (AssetManager replaces it in R4). Component now imports the draw functions; `sampleJackpot` (non-rendering, pending Step 1.2 move) and the SVG icon components stayed put. AbyssAnchor.tsx: 1,415 → 683 lines.
- Files modified: `src/rendering/theme.ts`, `src/rendering/draw/{ship,chain,anchor,creatures,sea-floor,impact-fx}.ts` (new), `src/components/AbyssAnchor.tsx` (deletions + 6 imports only), `src/rendering/README.md`, `docs/05_RENDERING_ARCHITECTURE.md` (§18 import-allowance correction recorded during extraction).
- Architectural decisions: §18 corrected per the doc's own rule — draw modules may additionally use type-only imports from `src/lib/abyss-game` and `SHIP_IMPACT_FX_SECONDS` from `src/game/constants` until R5.
- Verification: scripted verbatim check — ordered sequence of all 658 numeric literals identical old→new; string-literal multiset and template-literal colors identical. `tsc --noEmit` clean; production build clean; dev server SSR-renders the game page without errors. Lint improved 49→38 errors (7 warnings unchanged): 11 pre-existing prettier errors sat on moved lines and the new modules are prettier-clean; zero new findings (3 findings inside the untouched `pickChest` block changed message granularity only — git diff confirms no content change there).
- Risks: client-side visual identity still requires the developer's manual gameplay pass (per docs/18_GIT_WORKFLOW.md step 2).

### Commit 1 — Architecture Planning (documentation only)

- Date: 2026-07-17
- Summary: `docs/05_RENDERING_ARCHITECTURE.md` created — the complete rendering architecture blueprint (21 sections): current-pipeline audit, layered SceneRenderer design (Background / Environment / World / Actor / Effects), Camera class, RenderState contract, per-entity renderer specs, DOM-vs-canvas UI boundary, performance strategy with explicit "do when" triggers, AssetManager design, PixiJS migration stance (Canvas 2D retained; no graphics-API abstraction layer), communication model (state pull + FX events, renderer emits nothing), target folder structure, 5-commit extraction order (R1–R5), risks, and per-commit validation protocol. No code modified.
- Files modified: `docs/05_RENDERING_ARCHITECTURE.md` (new), `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md` (tracking updates).
- Architectural decisions: fixed ordered layer list instead of a hierarchical scene graph; renderer as pure `(RenderState, time) → pixels` consumer with a no-clock/no-RNG rule (Effects layer exempted for RNG); vertical-only anchor-locked camera reproducing the current transform bit-for-bit; theme.ts as the white-label color boundary; deliberate refusal to abstract the drawing API before a PixiJS migration.
- Risks: none to the running game (docs only). Sprint 1's deferred `sampleJackpot` move remains pending and is recorded in CURRENT_TASK.md.

---

## TASK 001 — Project Audit

- Date: 2026-07-16
- Summary: Full technical audit of the prototype. Key findings: client-authoritative RNG/economy, jackpot economics far above intended RTP (~1 in 6 rounds reaches the sea floor), 1,400-line game component mixing simulation/rendering/UI, float-based money math, no tests.
- Files modified: none (read-only task).
- Architectural decisions: none (analysis only).
- Risks: jackpot RTP flaw documented; must be preserved during refactor and rebalanced in a separate approved task.

---

## TASK 002 — Architecture Review

- Date: 2026-07-16
- Summary: Complete Architecture Blueprint delivered (Phase 2 deliverable): monorepo layout, framework-agnostic client engine, layered Canvas 2D renderer, event bus, store bridge, protocol-first server boundary with provably-fair RNG, and an 8-milestone strangler-fig migration strategy.
- Files modified: none (design only; blueprint delivered in chat, not yet persisted to /docs).
- Architectural decisions: server-authoritative design; engine outside React; Canvas 2D retained; shared protocol package; money as integer minor units (future step).
- Risks: AQUADIVE_BIBLE.md exists but is empty — content may be missing.

---

## TASK 003 — Project Refactoring Plan

- Date: 2026-07-16
- Summary: Approved 15-step frontend-only refactoring plan (Stages 0–5), each step behavior-preserving and individually revertible; game must remain playable after every step.
- Files modified: none (plan delivered in chat).
- Architectural decisions: verbatim moves over rewrites; characterization tests pin current behavior including known economics bug.
- Risks: two approved corrective micro-deltas deferred to Steps 3.3 and 4.2.

---

## TASK 004 — Foundation Improvements (Sprint 1 — Closed 2026-07-17; Step 1.2 second half deferred)

### Commit 5 — Shared pure utilities

- Date: 2026-07-16
- Summary: `src/shared/utils/` created; `lerpColor` moved verbatim into `src/shared/utils/color.ts` and exported. Scope audit found it is the ONLY function in AbyssAnchor.tsx meeting all purity criteria (no React, no Canvas, no component state, deterministic) — all others are hooks/component methods, canvas draw functions, React icons, or `sampleJackpot` (nondeterministic gameplay economics, excluded twice over). No padding utilities were invented (dead code is forbidden).
- Files modified: `src/shared/utils/color.ts` (new), `src/components/AbyssAnchor.tsx` (imports `lerpColor`).
- Architectural decisions: pure color math sits on the shared dependency floor, usable by rendering and future systems alike.
- Risks: none; tsc clean, lint at baseline.

### Commit 4 — Architectural folder structure

- Date: 2026-07-16
- Summary: Long-term frontend structure prepared: `src/engine`, `src/rendering`, `src/network`, `src/audio`, `src/shared` created, each with a README defining its responsibility, boundaries, and which approved plan steps will populate it. No code moved, no implementations, zero runtime change (documentation files only).
- Files modified: five new `README.md` files (one per folder).
- Architectural decisions: no empty `index.ts` barrels — the project convention (src/lib, src/game) uses direct module imports, and empty barrels would be placeholder code, which the Master Rules forbid; barrels can be added when a folder first exports something. `src/shared` declared the dependency floor (imports from no other layer).
- Risks: none.

### Commit 3 — Static constants extraction

- Date: 2026-07-16
- Summary: Remaining static constants centralized into `src/game/constants.ts` (21 values): player defaults, game-loop/physics limits, golden-boost tuning, countdown tick, rendering/camera constants, ship-impact FX lifetime, and the four background-gradient RGB colors. Byte-identical values; deliberately deduplicated three shared magic numbers (`220` world offset ×3 sites, `1.4`s FX lifetime ×2 sites, bet default ×2 sites). Colors/literals inside standalone draw helpers intentionally deferred to the rendering extraction step; JSX labels deferred to the UI/i18n step.
- Files modified: `src/game/constants.ts` (new), `src/components/AbyssAnchor.tsx` (19 literal sites now reference named constants).
- Architectural decisions: taxonomy split — `config.ts` = gameplay tuning (economics, timings, bets); `constants.ts` = presentation/physics/default constants.
- Risks: none; tsc clean, lint at baseline (47 pre-existing prettier errors + 1 pre-existing hook warning).

### Commit 2 — Type system extraction

- Date: 2026-07-16
- Summary: TypeScript type definitions extracted from the game component into `src/game/types.ts`: `RunState` (moved verbatim) plus `HistoryEntry` and `LastWin` (named versions of previously-inline anonymous `useState` object types). Type-level change only; zero runtime impact.
- Files modified: `src/game/types.ts` (new), `src/components/AbyssAnchor.tsx` (imports the types instead of declaring them).
- Architectural decisions: component-level types live in `src/game/types.ts`; core domain types (`Phase`, `Creature`, `CreatureKind`, `BonusChest`) intentionally remain in `src/lib/abyss-game.ts` until the module reorganization step — no duplicate type sources.
- Risks: none; `tsc --noEmit` clean, lint at baseline. Note: the Write tool silently lost the new file once (suspected antivirus); it was recreated via shell and verified on disk.

### Commit 1 — Step 1.1: Gameplay constants extracted

- Date: 2026-07-16
- Summary: All gameplay tuning constants centralized into a dedicated configuration module. Pure extraction; values byte-identical; no behavior, visual, or rendering change.
- Files modified: `src/game/config.ts` (new), `src/components/AbyssAnchor.tsx` (imports constants instead of hardcoding them).
- Architectural decisions: `src/game/` established as the home of framework-agnostic game modules per the blueprint.
- Risks: none identified; typecheck clean; lint unchanged from baseline (47 pre-existing prettier errors + 1 pre-existing hook warning, both untouched by design).