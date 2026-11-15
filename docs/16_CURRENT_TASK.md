# CURRENT TASK

**TASK 008 — Sprint 5: Audio & Visual Effects (Phase 7) — ACTIVE since 2026-11-15.** Blueprint: `docs/08_AUDIO_FX_ARCHITECTURE.md`. The owner approved the architecture. **P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted; A1.1 is in `ad9e959`; A1.2 is in `0de6d73`, accepted. A2 (sound bank and manifest) is in `03bb7dc`. A3 (sound settings store) is in `16a6a40`, accepted with documented limitations. A3.1 (sound settings subscriber failure hardening) is in `e70fa22`. The owner split A4 into A4a and A4b. A4a (the Audio Director core) is in `289b849` and A4a.1 (the loop startup correction) is in `d8ab112`; both are pushed to `origin/develop`, with no owner acceptance recorded. A4b (the audio session integration) is authorized and delivered in one local commit, not pushed, and awaits the owner's review.** *(Until A4b, 2026-11-15, this read: "A4a.1 (the loop startup correction) is delivered in its own commit and awaits the owner's review. A4b is next and not authorized.")* *(Until A4a.1, 2026-11-15, this read: "A4a (the Audio Director core) is delivered in its own commit, not pushed, and awaits the owner's review. A4b is next and not authorized.")* *(Until A4a, 2026-11-15, this read: "A3.1 (sound settings subscriber failure hardening) is delivered and awaits the owner's review. A4 is next and not authorized.")* *(Until A3.1, 2026-11-15, this read: "A3 (sound settings store) is delivered and awaits the owner's review. A4 is next and not authorized.")* See "Current: Sprint 5 / TASK 008 / Phase 7" below. *(Until A3, 2026-11-15, this read: "A2 (sound bank and manifest) is delivered and awaits the owner's review. A3 is next and not authorized.")* *(Until A2, 2026-11-15, this read: "A1.2 (voice pools and protected loops) is delivered and awaits the owner's review. A2 is next and not authorized.")* *(Until A1.2, 2026-11-15, this read: "A1.1 (the `AudioManager` decode interface) is delivered and awaits the owner's review. A2 is next and not authorized.")* *(Until A1.1, 2026-11-15, this read: "**P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted; A2 is next and not authorized.**")* *(Until the A1 acceptance, 2026-11-15, this read: "The owner approved the architecture; **only P7-0 (the blueprint) is authorized.**")*

*(Until P7-0, 2026-11-15, this line read: "**No task is active.** TASK 007 — Sprint 4: User Interface (Phase 6) — **COMPLETED 2026-11-15** (active since 2026-08-17). The next planned phase is Phase 7 (Audio & Visual Effects). It is not started, and its planning begins only on the owner's instruction." The Sprint 4 paragraphs that follow are kept as the record of TASK 007. Their freeze rules still apply in Phase 7: `src/engine` and `src/shared` take no change, and `src/rendering` stays frozen until the proposed E-X5 scope is ratified for a step, docs/08 §13.)*

Blueprint: `docs/07_UI_ARCHITECTURE.md` — **approved 2026-08-17 and binding** (the §17 U0 step; approval ratified the five §7 sanctioned deltas V1–V5). Extraction commits follow its §17 order, one per approval.

The engine (`src/engine`), renderer (`src/rendering`) and shared floor (`src/shared`) are **read-only contracts** for the whole sprint (docs/07 §20 risk 1, §19 gate 4: `git diff --stat src/engine src/rendering src/shared` must be empty for every Sprint 4 commit). Approved exceptions: **E-X1** (2026-11-13, below), limited to `src/engine/state-machine.ts`, `src/engine/game-engine.ts`, `src/engine/domain/tuning.ts` and their tests; and **E-X2** (engine-side valid-stake enforcement, docs/06 §13.1), **approved by the owner 2026-11-14 exactly as implemented**: `src/shared/stake.ts`, `src/shared/stake.test.ts`, `src/engine/state-machine.ts`, `src/engine/state-machine.test.ts`. The exception is not expanded. *(History: E-X2 was planning-only from 2026-11-13, M1-D4 and M1-D12, until the 2026-11-14 approval.)* **E-X3** (Dual Bet, owner-approved 2026-11-14, docs/06 §13.2; committed in `be10b19`) is limited to `src/engine/commands.ts`, `events.ts`, `state-machine.ts`, `game-engine.ts`, `index.ts` and the tests `state-machine.test.ts`, `game-engine.test.ts`, `snapshot.test.ts`. `src/rendering` and `src/shared` stay frozen. **E-X4** (renderer visuals, owner-approved 2026-11-15, recorded retroactively; docs/07 §19 gate 4) is limited to the presentation-only renderer files listed there and `src/assets/sea-floor.png`. `src/engine` and `src/shared` are not part of it. *(2026-11-15, close-out: E-X4 formally ratified; its 19-file scope was verified and its last part landed in `9bded6b`. It is retrospective and file-limited. The engine, renderer and shared floor are frozen again, and any later change needs its own approved exception.)*

## Sprint 4 progress

| Step | Status |
|---|---|
| U0 — blueprint approval | Done 2026-08-17 (deltas V1–V5 ratified) |
| U1 — session module + store primitive + `useStore` | Done — committed `140790f`, approved 2026-08-17 (validation: tsc clean, 93/93 tests green, freeze check clean) |
| U2 — wallet store (delta V1) | **Done — committed `ad30d7a` + fix `39f5a9f` (settlement exclusivity), pushed; approved by the owner 2026-11-13.** SSR smoke passed; owner manual gameplay and browser console checks passed with no errors; 151/151 tests green. Limitation accepted at approval: remount verified by automated session-level tests only — no browser-level React remount was manually tested |
| E-X1 — engine freeze exception: bonus eligibility + deterministic completion | **Committed `897c5be`, pushed to `origin/develop` (2026-11-13).** All automated gates green (tsc clean, 151/151 tests, lint at baseline 7 + 6, build passes, `diff --check` clean, freeze check within the exception); owner manual browser QA passed, 4/4 scenarios |
| U3 — UI test harness + DOM characterization pins | **Done — committed `8e9b21b`, pushed to `origin/develop` (2026-11-13); validation results accepted by the owner.** 180/180 tests green across 22 files (29 new DOM tests); production source unchanged. Details in `docs/15_PROGRESS.md` |
| U4a — notification store (delta V2) | **Done — approved by the owner 2026-11-13 (manual browser QA 5/5); committed and pushed to `origin/develop`.** 212/212 tests green across 24 files; production source changes limited to `src/ui` + `AbyssAnchor.tsx`. Details in `docs/15_PROGRESS.md` |
| U4b — round store | **Implemented and validated 2026-11-13; committed as `bbdc13443e1b2a8cb29e58a1f24e72f7d44711c2` and pushed to `origin/develop`.** Plan approved by the owner 2026-11-13 (C6, C7, `attachCanvas` sync parameter retired, synchronous write on attach, revealed chest restored after remount). 249/249 tests green across 26 files; the 20 characterization pins unchanged; one sanctioned remount pin updated. Details in `docs/15_PROGRESS.md`. *(2026-11-14: owner-confirmed browser QA passed, 6/6.)* |
| U5 — bet-input store + action-state derivation (delta V4) | **Implemented and validated 2026-11-13 under the owner's U5 authorization (decisions D1–D12, docs/07 §17); committed as `09cc5af56534766982697f7036efce72f440260d` and pushed to `origin/develop`. Development checkpoint — not fully accepted.** 311/311 tests green across 29 files; the 20 characterization pins pass with unchanged assertions; one sanctioned remount pin updated. Manual browser QA pending; M1 (sub-cent betting) unresolved. *(2026-11-14: owner-confirmed browser QA passed, U5 7/7; M1 implemented, awaiting the S1 commit.)* |
| M1-0 — Money Integrity decisions + architecture plan (docs only) | **Drafted 2026-11-13, refined by a review pass, and reconciled with the security boundary review the same day; awaiting the owner's review of the documentation diff. Not staged, not committed.** Policy M1-D1 to M1-D16 approved by the owner 2026-11-13 (docs/07 §23.1). Final financial integrity reconciliation drafted 2026-11-13 |
| E-X2 — engine freeze exception: valid-stake enforcement | **Implemented and approved by the owner 2026-11-14, as implemented; uncommitted** (docs/06 §13.1). Four frozen-directory files plus the UI re-export; exception not expanded. *(Until 2026-11-14: planning only, M1-D4 / M1-D12.)* |
| M1-1 (UI + session stake validation), M1-2 (redefined: settlement integrity — V2 payouts rounded down + wallet non-finite protection), M1-3 (validation + QA) | Proposed stages, **not authorized**. Provisional plan **C3** (M1-D9, docs/07 §23.14): commit 1 E-X2 + M1-1 → commit 2 M1-2 → commit 3 M1-3. **Commit 1 alone still leaves V2 open.** M1 closes only after commit 3 and the §23.14 closure criteria. *(2026-11-13, M1-D15/M1-D16: C3's publication model is superseded by the proposed plan **C4** (§23.18). The stages become local working commits L1–L3, never pushed, published as one atomic integration commit. The M1-scope wallet rules W1–W9 (§23.17) join L2.)* *(2026-11-14: superseded. M1-1 and the settlement integrity work are implemented in the working tree, and under Q14 = S1 they land as one atomic commit, with no L1–L3 working commits. See "Current" below.)* |
| M1 owner decisions 2026-11-14 | Q12 approved (W3 kept). Q8 approved within its demonstrated domain. Q9c (ii) approved in principle → **W10 fault marker implemented, uncommitted**; no refund or forfeiture; the resolution policy is OPEN. Q1/Q11 option B approved in principle, **not implemented**: it needs the owner's choice between a technical limit and a balance-representation change (docs/07 §23.9). 402/402 tests, `tsc` clean |
| M1 final owner decisions 2026-11-14 | **Q1/Q11 = B-R** (exact integer-cent ledger, `number` balance for presentation only): **not implemented**, minimal design awaiting approval (docs/07 §23.20). **Q9c = R2**: **implemented**, as auditable unresolved claims with no loss classification. **E-X2 approved.** **Q14 = S1** (one atomic commit; no Git operation authorized yet). 409/409 tests, `tsc` clean, build passes |
| M1 roadmap return 2026-11-14 | Owner: M1 scope frozen; **B-R moved to M2**. Precision-boundary review: M1 is **BLOCKED** on one decision, the proposed fail-closed rule **W11** (docs/07 §23.21, not implemented). Final validation green (below) |
| M1 W11 — exact-cent credit envelope 2026-11-14 | **Approved by the owner (final M1 authorization) and implemented, uncommitted.** Credits decided in exact cents below 2^44 units; an unrepresentable valid win becomes an R2 claim (rule `W11`, exact `unpaidCents`), and the chest of a withheld jackpot becomes one follow-up claim (docs/07 §23.21). 427/427 tests, `tsc` clean, build passes |
| M2 — integer minor units | Deferred, not started (docs/07 §23.10). **Now also holds B-R**, the integer-cent wallet ledger (owner, 2026-11-14) |
| U6 — componentization (delta V3) | **Implemented 2026-11-14 under the owner's resume-at-U6 authorization (M1 deferred by the owner the same day, not closed, M1 work preserved). Automated validation green; committed locally together with U7 as one U6/U7 commit (owner Git approval 2026-11-14), not pushed.** All §13 components + `GameScreen`, `strings.ts`, `formatMoney`, per-slice subscriptions (V3), the dev rejection banner (§12 C3); route flipped to `GameScreen`; `AbyssAnchor.tsx` **deleted**. *(2026-11-14: automated validation green: `tsc` clean; focused UI suites 155/155 across 14 files, including the characterization pins and remount/StrictMode; targeted lint clean; production build passes; SSR smoke passes; freeze dirs unchanged. The deferred M1 suites were not run or modified. Owner mobile pixel-compare (§19 gate 7) pending.)* *(Reconciliation 2026-11-14: committed as `4440009`, on `origin/develop`; it is no longer local-only. Gate 7 is still pending.)* Details below |
| U7 — responsive layout (delta V5) | **Implemented 2026-11-14; committed locally in the combined U6/U7 commit, not pushed.** `GameScreen.tsx` only (§15): `lg:`-prefixed tokens appended to the frame and stage; mobile tokens and DOM unchanged. *(Superseded the same day by the owner's desktop layout correction:)* at ≥ 1024 px the frame is a full-viewport landscape grid. The canvas stage fills the whole left region (no aspect lock; about 73 % of the width at 1280 to 1440 px). A right rail sized `clamp(21rem, 25vw, 28rem)` stacks TopBar (brand + balance), a wrapping HistoryStrip, and the BettingPanel card at its foot. The earlier 9:16 portrait stage is retired, which departs from docs/07 §15's "fixed portrait aspect" wording at the owner's direction. Renderer unchanged: positions follow the width and sizes stay fixed in pixels. *(Second owner correction, the same day: the layout was too narrow on large iPads.)* Two custom variants were added in `src/styles.css`. `tab` (≥ 768 px wide and ≥ 600 px tall) widens the phone column to full width, with the betting controls centered at up to 38rem *(corrected 2026-11-14 from "40rem" to match `GameScreen.tsx`)*. `desk` (≥ 1024 px **and landscape**) replaces `lg:`, so a portrait iPad Pro (1024×1366) gets the full-width tablet column instead of the side rail. This changes 768×1024 at the owner's request; phones are unchanged. `tsc` clean, 78/78 screen + component tests, lint + Prettier clean, build passes. **Pending: the owner's §19 gate 8 screenshot matrix** (375×667, 390×844, 768×1024, 1280×720, 1366×768, 1440×900, 1920×1080) *(Reconciliation 2026-11-14: committed in `4440009`, on `origin/develop`. The departures from docs/07 §15 are recorded there as approved. Gate 8 is still pending.)* |
| Dual Bet — mobile layout decision (owner, 2026-11-14) | **Recorded only. Not authorized, not started.** BET 1 and BET 2 sit side by side directly below a slightly shorter canvas, with no collapsed or expandable BET 2. Both PLACE BET buttons are always visible while betting is open, and both CASH OUT buttons are visible and independent during the dive. Each panel has a compact stake input and essential controls. Priority sizes are 375×667 and 390×844, with no horizontal overflow and no unnecessary vertical scroll. The canvas must still show the ship, chain, obstacles and gameplay without clipping. The wide desktop layout is kept. This supersedes the earlier expandable-BET 2 design. **Blocked on the gameplay architecture:** the engine accepts one bet per round (`placeBet { amount }` / `cashOut` carry no slot, `src/engine/commands.ts`), and wallet rule W2 forbids a second `betPlaced` while participating (M1, docs/07 §23.17). Dual Bet therefore needs a frozen-contract exception plus an M1 rule amendment, both owner-approved, before any UI work. No non-functional second panel is to be built *(Superseded 2026-11-14: the owner approved both, as E-X3 and the per-slot W2/W3 amendment. See the next row.)* |
| E-X3 — Dual Bet (engine freeze exception + M1 per-slot amendment + dual panel) | **Owner-approved 2026-11-14; committed in `be10b19`, on `origin/develop`.** This implements the layout decision above: BET 1 and BET 2 side by side on phones and `tab`, stacked in the `desk` rail, both real engine slots. Engine (docs/06 §13.2): `slot` on `placeBet`/`cashOut`/`betPlaced`/`cashedOut`, `invalid-slot`, per-slot impact auto-cash, one chest pick for all eligible slots, `participants`, snapshot v3. Wallet (docs/07 §23.17): every rule per slot, per-slot fault isolation, W2/W3 per slot. Session (docs/07 §8): `betInputs`, in-flight stake reservation. UI (docs/07 §13.3): `BetSlotPanel` ×2, `slot` props, quick bets hidden below `tab`. **Validation not recorded** (the commit message has none). **Pending:** owner browser QA, including 375×667 and 390×844 (no overflow, no unnecessary scroll, canvas unclipped) |
| Sprint 4 close-out (Steps 1–4) | **Completed 2026-11-15.** Owner approved gates 7–8 (gameplay incl. Dual Bet, mobile, seven-size matrix); E-X4 and D1–D4 ratified; G1 `6e28ce0`, G2 `9bded6b`, G3 `3346ed8`, G4 docs; 572/572 tests. **TASK 007 / Phase 6 closed.** M1 deferred, not closed |

## Current: E-X6 — Ship visual replacement, S3 shine overlay DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING OWNER REVIEW

*(Until S3 this heading read: "E-X6 — Ship visual replacement, S1 + S2 DELIVERED (2026-11-15, WORKING TREE, UNCOMMITTED), AWAITING OWNER REVIEW". The S1 + S2 bullets below are kept as written.)*

- **S3 authorization (2026-11-16):** the owner approved the S3 read-only plan and authorized S3 only, with the file scope `src/assets/ship-shine.png` (new), `src/rendering/assets.ts`, `draw/ship.ts`, `draw/ship.test.ts`, `layers/world.ts` and docs 14, 15, 16. S1, S2 and S2.1 (goldfish collection flight, accepted in principle with its high-speed skipped-flight limitation) are preserved.
- **S3 delivered:** the owner's shine overlay (Desktop `8E50C2C2-F33D-42D2-9DF3-3410A6E2D70F.png`, SHA-256 `41d8e481…2a7a`) copied byte for byte to `src/assets/ship-shine.png`, drawn directly over the base artwork in the same rectangle and transform (normal source-over), before the unchanged underwater tint, at `shineAlpha(t)`: a 7 s cycle (smoothstep 0 → 0.35 over 1.6 s, hold 0.6 s, smoothstep back to 0 over 2.2 s, rest 2.6 s), clock offset 5.5 s. Full record: docs/15, "E-X6 S3".
- **Final ship design (owner, 2026-11-16):** no flag (S5 cancelled); one amber lamp only, at the far-right rear railing, one on/off cycle every 2 s (S4, not authorized); all other external lamps cancelled; the shine overlay stays; floating behaviour and chain-hole alignment unchanged.
- **Next:** the owner's review of S3. **Stop condition:** do not commit or push; do not start S4 or S6.

- **Context:** an independent, owner-controlled renderer task outside the TASK 008 audio sequence. The owner stated on 2026-11-15 that **A4b is completed, accepted and pushed**; verified `HEAD` = `origin/develop` = `f668d4979d99a99ee75800fb602a06be69d12384` before planning.
- **Exception E-X6** (owner-accepted 2026-11-15, file-limited). S1 + S2 scope, authorized as one local milestone: `src/assets/ship.png` (owner-supplied, untouched), `src/rendering/assets.ts`, `src/rendering/draw/ship.ts`, `src/rendering/draw/ship.test.ts`, `src/rendering/layers/world.ts`, `src/rendering/layers/presentation.ts`, `src/rendering/layers/presentation.test.ts`, `src/rendering/constants.ts`, and docs 14, 15, 16. `src/engine`, `src/shared`, `src/audio`, the wallet, chain physics and gameplay take no change.
- **Owner decisions:** Option B base artwork (the flag-free, lamp-free `ship.png`, which the shine overlay is registered to); D1 shine → S3; D2 flag → S5; D3 keep `WATERLINE = 20`; D4 measured scaling; D5 true on/off lamps → S4; D6 reduced motion deferred; D7 no commit, no push.
- **Delivered:** S1 (the artwork drawn in the unchanged float transform, its measured hole (876.7, 677.4) exactly on the chain attachment, a one-time underwater tint, vector fallback) and S2 (viewport-aware rest position, rest chain 92 / 78, cull margin 135). Full record: docs/15, "E-X6 S1 + S2".
- **Next:** the owner's review (code, tests, screenshots) and the decisions listed in docs/15 under "Open for the owner". S3–S6 are not authorized.
- **Stop condition:** do not commit or push; do not start S3, S4, S5 or S6.

## Previous: Sprint 5 / TASK 008 / Phase 7 — A4b (accepted and pushed per the owner, 2026-11-15; heading until E-X6: "A4b DELIVERED (2026-11-15, LOCAL COMMIT, NOT PUSHED), AWAITING OWNER REVIEW")

- **A4b (2026-11-15):** the owner accepted the final A4b architecture report (D1–D9, D11; D10 conditional) and authorized the audio session integration as one atomic local commit, with seven mandatory corrections (docs/08 §1.1).
  - **Delivered:** `src/ui/audio-host.ts`, one `AudioHost` per session and the only UI module that imports `src/audio`. It owns the AudioManager, SoundBank and director; restores and applies the sound settings before the first unlock; installs attach-scoped gesture and visibility listeners, all or none; loads the bank once; receives each frame from the driver sink with no extra engine read; isolates every audio call. `GameSession.dispose()` disposes the audio subsystem only. `AUDIO_MIX` is neutral (1.0) and provisional. The game stays silent: no asset exists (A6).
  - **Not changed:** `AudioManager`, director, SoundBank, manifest, the audio and UI test utilities, `CanvasStage`, the engine, wallet, rendering and every existing assertion. Risk 17 stays open.
  - **Validation:** 1013/1013 tests across 50 files (46 new); `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200. Full record: docs/15, "Step A4b".
  - **Status corrections (Git evidence, 2026-11-15):** A4a (`289b849`) and A4a.1 (`d8ab112`) are on `origin/develop`; the A4a records said "not pushed". No owner acceptance of A1.1, A2, A3.1, A4a or A4a.1 is recorded; A1, A1.2 and A3 (with limitations) are accepted.
- **Next:** the owner's review of A4b and the decision to push it.
- **Stop condition (A4b):** do not push; do not start A5, A6, V1–V7, music, PixiJS or a Safari-specific fix. Wait for the owner's explicit instruction.

*(The A4a.1 record follows, as it stood before A4b; A4a.1 has since been pushed as `d8ab112`, with no owner acceptance recorded.)*

### A4a.1 — DELIVERED (2026-11-15)

- **A4a.1 (2026-11-15):** after the read-only A4a.1 design report, the owner approved approach B and authorized the loop startup correction (docs/08 §1.1, decisions 1–8).
  - **Delivered:** `loop(cue, options?)` with the initial gain, rate and filter, checked like the setters and on the nodes before the source starts, at once or after waiting; a required, pure `LoopHandle.isAudible()` (an operational playback predicate, not a measure of output); the director starts every loop with its values and advances a bed's fade-in only while it is audible, so it holds through pending, mute, host suspension, interruption and a pending or refused resume. The fake context gains a manual-resume mode (default unchanged). Not wired; the app is unchanged.
  - **Not changed:** `unlock()` (the Safari resume retry is deferred, docs/08 §14 risk 17); the accepted rattle-restart limitation.
  - **Validation:** 967/967 tests across 47 files (44 new); `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200. Full record: docs/15, "Step A4a.1".
- **Next:** the owner's review of A4a.1; then A4b on the owner's authorization only, with its UI scope and import exception ratified.
- **Stop condition (A4a.1):** do not start A4b, the Safari resume retry, music integration or audio asset work; do not change any `src/ui` file, the SoundBank or the manifest. Wait for the owner's explicit approval.

*(The A4a record follows, as it stood before A4a.1.)*

### A4a


- **A4a (2026-11-15):** after the revised A4 plan, the owner split A4 into A4a (the Audio Director core) and A4b (session integration), and authorized A4a only.
  - **Decided for A4a:** Q7 (cashout cue only for the local player's own slots; crash and jackpot audible to spectators; identical cashout cues merge within one rendered frame, never across frames); Q8 (music deferred, no `MusicController`, the `music` bus kept); Q9 (countdown audio deferred, manifest unchanged); Q15 (respect the iOS silent switch, no audio-session override).
  - **Delivered:** `src/audio/director.ts` and its test (85 tests): deterministic, frame-based mapping of engine events and `AudioFrame` state to cues; loops by phase; one-shot merging per cue id per frame, with every intentional merge documented (docs/08 §7.4); totality and exception containment; `wake()` for pending loops (risk 13). Every value is provisional. Not wired; the app is unchanged.
  - **Validation:** 923/923 tests across 47 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200. Full record: docs/15, "Step A4a".
- **Next:** the owner's review of A4a; then A4b on the owner's authorization only, with its UI scope and import exception ratified.
- **Stop condition (A4a):** do not start A4b or any later step, change any `src/ui` file (including `session.ts`), create `audio-host.ts`, wire audio or settings, change the `AudioManager`, SoundBank or manifest, add audio files, install dependencies, or push without the owner's instruction. Wait for the owner's explicit approval.

*(The A3.1 record follows, as it stood before A4a.)*

- **A3.1 (2026-11-15):** the owner accepted A3 (`16a6a40`) with documented limitations and authorized a narrow correction of A3 audit finding M1 (the read-only audit of `16a6a40`; not the deferred money-integrity M1). The sound settings store's `subscribe` now isolates each listener in its own try/catch and logs failures, so a throwing subscriber cannot stop a change from being saved, starve later subscribers, or make `restore()` throw. `createStore` and every other store are unchanged; D1–D8 unchanged. 10 new tests; 838/838 across 46 files. Not wired. Full record: docs/15, "Step A3.1".
- **Next:** the owner's review of A3.1; then A4 as listed below, on the owner's authorization only.
- **Stop condition (A3.1):** do not start A4 or any later step, change `src/ui/store/store.ts` or any other store, change `src/ui/session.ts`, wire audio or settings, change the `AudioManager`, SoundBank or manifest, add audio files, or install dependencies. Wait for the owner's explicit approval.

*(The A3 record follows, as it stood before A3.1.)*

Blueprint and full record: `docs/08_AUDIO_FX_ARCHITECTURE.md` (§7.1 for A1.1, §7.2 for A1.2, §7.3 for A2, §3.5 for A3); progress entries in `docs/15_PROGRESS.md`, "TASK 008" ("Step P7-0", "Step A1", "Step A1.1", "Step A1.2", "Step A2", "Step A3").

- **A3 (2026-11-15):** the owner authorized the sound settings store after the A3 pre-implementation report, with decisions D1–D8 (docs/08 §1.1). The authorization does not state an acceptance of A2 (`03bb7dc`).
  - **Decided:** D1 (Q3): sound on by default, all four volumes 1.0, saved preferences override, playback still waits for the gesture. D2: UI-X1 ratified for the exact A3 files. D3: `ambience` added. D4: linear 0..1, no loudness curve. D5: salvage valid version-1 fields, reject other versions. D6: no cross-tab sync, no debounce. D8 (in principle): the session applies the settings in A4; the `session.ts` audio import exception is ratified in A4.
  - **Deferred:** D7, whether raising a volume unmutes, to A5. Today it does not.
  - **Delivered:** `src/ui/store/sound-settings-store.ts` (pure helpers, the store, persistence) and its test (71 tests). `src/ui/README.md` and one docs/07 §9 table row. Not wired; the app is unchanged.
  - **Validation:** 828/828 tests across 46 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200.
- **For A4 (owner requirement):** `restore()` may run after the first user gesture. A4 must apply the persisted mute and volumes to the `AudioManager` before the unlock or any playback, and test it (docs/08 §14 risk 14). A4 also needs the explicit ratification of the `src/ui/session.ts` audio import exception (D8).
- **Open decisions** (docs/08 §1.3): Q2 scopes (beyond A3), Q4–Q12, Q14, Q15; D7.
- **Next:** the owner's review of A3; then, for A4, the UI scope ratification (`session.ts`, docs/08 §13.2), the audio import exception (D8), Q7, Q8, Q9, Q15, and the owner's authorization.
- **Stop condition (A3):** do not start A4 or any later step, change `src/ui/session.ts`, wire audio or settings into the session, change the `AudioManager`, SoundBank or manifest, add audio files, install dependencies, or change gameplay, engine, renderer, UI components, RNG or settlement logic. Wait for the owner's explicit approval.

*(The A2 record follows, as it stood before A3.)*

- **A2 (2026-11-15):** the owner accepted A1.2 at `0de6d73` and authorized the sound bank and manifest.
  - **Delivered:**
    - `manifest.ts`: 15 one-shot and 3 loop cue ids, typed apart; bus, gain, priority tier, essential flag (the two ambience beds only), optional loop points. **Every `asset` is `null`**, so every cue is unavailable and silent. The tick (Q9) and music (Q8) are left out.
    - `sound-bank.ts`: fetch, then `AudioManager.decode()`, then a cached, frozen cue for the manager's resolver. Deduplicated loads that never reject; failures silent, logged once, not retried; `evict()` / `dispose()` with aborts and generation guards; `onReady` to wake pending loops.
    - `audio-manager.ts` is unchanged.
  - **Tests:** 72 new, including 9 integration tests against the real AudioManager.
  - **Validation:** 757/757 tests across 45 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200.
  - Committed and pushed. Not wired; the app is unchanged.
- **For the owner:** a pending loop starts at the next manager call after its cue is ready. A2 relies on `onReady` plus an A4 caller obligation (docs/08 §14 risk 13). A public `AudioManager.refresh()` is the alternative. It is proposed only and needs its own approval.
- **Open decisions** (docs/08 §1.3): Q2 scopes, Q3–Q12, Q14, Q15. A2 decided none of them.
- **Next:** the owner's review of A2; then, for A3, the UI scope ratification (docs/08 §13.2), Q3, and the owner's authorization.
- **Stop condition (A2):** do not start A3 or any later step, wire audio into the session, add or download audio files or licences, invent asset URLs, change `audio-manager.ts`, install dependencies, or change gameplay, engine, renderer, UI, RNG or settlement logic. Wait for the owner's explicit approval.

*(The A1.2 record follows, as it stood before A2.)*

- **A1.2 (2026-11-15):** the owner authorized voice pools and protected loops as their own step before A2, after the A2 architecture report.
  - **Delivered:**
    - a strict cap of 16 live sources in fixed pools (6 loop, 8 one-shot, 2 tail), with the unlock prime counted in the tail;
    - a slot frees only on `onended` or the context clock past the scheduled end plus 0.1 s, never on `stop()`;
    - pending loops instead of inert handles;
    - essential loops that are never preempted;
    - deterministic admission, pending-loop cancellation and disposal cleanup;
    - 20 damaged UTF-8 comment lines corrected in place; the 3 others were inside comments that A1.2 rewrote.
  - **Tests:** 8 A1 tests rewritten (the owner approved all 8; the authorization had named 5) and 22 new.
  - **Validation:** 685/685 tests across 43 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200.
  - Committed and pushed. Not wired; the app is unchanged. **This resolves the voice-cap item below (docs/08 §14 risk 12).**
- **Stop condition (A1.2):** do not start A2, implement the sound bank or manifest, implement `maxInstances` (deferred), add audio files or licences, install dependencies, or change gameplay, engine, renderer, UI, RNG or settlement logic. Wait for the owner's explicit approval.

*(The A1.1 record follows, as it stood before A1.2.)*

- **A1.1 (2026-11-15):** the owner authorized the decode interface as its own step before A2. `AudioManager.decode(data)` decodes with the single context, waits for the first unlock without creating a context, never rejects, and settles exactly once, with `null` on errors, on unsupported environments and on `dispose()`. Committed and pushed. 663/663 tests across 43 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200. Not wired; the app is unchanged. **This resolves the A2 decode blocker below.**
- **Before A2 (owner's instructions):** analyze and test the voice-cap policy for ambience and music loops (docs/08 §14 risk 12; fixed tiers alone are not enough). Q6 stays Open; the owner's planning preference is AAC-LC `.m4a`, subject to browser validation. The proposed manifest rules are provisionally acceptable and do **not** authorize A2.
- **Stop condition (A1.1):** do not start A2, implement the sound bank or manifest, add audio files or licences, install dependencies, or change gameplay, engine, renderer, UI, RNG or settlement logic. Wait for the owner's explicit approval.
- **Corrected in A1.1:** the stale `docs/04` and `src/audio/README.md` status lines noted below.

*(The A1 acceptance record follows, as it stood before A1.1.)*

- **Done:** P7-0, the blueprint (`0e7ff80`). A1, the `AudioManager` core (`3761062`, pushed): accepted by the owner 2026-11-15 on its recorded validation evidence. 623/623 tests across 43 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings; build passes; SSR smoke 200. Not wired; the app is unchanged.
- **Next: A2, sound bank and manifest (docs/08 §12). Not authorized, not started.**
- **A2 blocker, awaiting the owner:** the `AudioManager` keeps its single `AudioContext` private and offers no decode, so the sound bank cannot turn fetched bytes into `AudioBuffer`s. The proposed fix is an explicit `decode()` seam on the `AudioManager`. A decode requested before the first unlock waits until the context exists, so no second context is created and nothing reaches into private fields. It changes `src/audio/audio-manager.ts`, which is outside A2's §12 file list. It therefore needs the owner's decision and an A2 scope amendment (and a matching docs/08 §7 amendment) before any file changes. **Proposed, not approved.**
- **Also needed before A2:** Q6, the audio format, which shapes the manifest.
- **Stale, to correct in a later approved step:** `docs/04_DEVELOPMENT_ROADMAP.md` still says "A1 is not started", and `src/audio/README.md` still says no audio code exists.
- **Stop condition:** do not start A2, change `audio-manager.ts`, install dependencies, add sound assets, or change gameplay, engine, renderer, UI, RNG or settlement logic.

*(The P7-0 record follows, as it stood when P7-0 was delivered.)*

- **Owner approval (2026-11-15):** the Phase 7 architecture, as proposed. Native Web Audio with a lightweight `AudioManager` and no dependency; the existing Canvas 2D renderer, no PixiJS; event-driven audio and FX; the approved underwater atmosphere preserved; **no change** to the engine, RNG, money settlement, Dual Bet or gameplay outcomes; one atomic commit per approved step.
- **Approved sequence:** P7-0 → A1 → A2 → A3 → A4 → V1 → V2 → V3 → V4 → V5 → V6 → V7 → A6 → A5 → P7-C (docs/08 §12).
- **Authorized:** P7-0 only — `docs/08` created; `docs/04`, `docs/14`, `docs/15`, `docs/16` and `src/audio/README.md` updated.
- **Accepted in principle, not ratified:** the renderer exception (proposed **E-X5**) and the UI exception (proposed **UI-X1**). Their per-step file scopes are in docs/08 §13. No file in `src/rendering`, `src/ui` or `src/styles.css` changes until its step's scope is ratified.
- **Open owner decisions** (docs/08 §1.3): Q2 (scopes), Q3, Q4, Q5 (assets and licences), Q6, Q7, Q8, Q9, Q10 (effects F1–F8), Q11, Q12, Q14 (device QA), Q15. The recommended defaults in docs/08 are not in force.
- **Facts to keep in view:** no audio code and no audio asset exist; no licence is cleared; M1 is deferred and not closed, so `src/ui/store/wallet-store.ts` is outside Phase 7.
- **Stop condition:** do not start A1, install dependencies, change runtime source, generate audio or visual assets, or begin Phase 8.
- **Next:** the owner reviews P7-0, then authorizes A1 (or amends the plan). Recommended first answers: Q6 (needed for A2's manifest) and Q3, Q7, Q8, Q9, Q15 (needed for A3–A4).

## Previous: Sprint 4 / TASK 007 / Phase 6 — OFFICIALLY CLOSED (2026-11-15)

Full record: `docs/15_PROGRESS.md`, "Sprint 4 close-out — Step 4", with the final completion report and the Sprint 4 retrospective.

- **OWNER APPROVED — 2026-11-15:** manual gameplay QA including Dual Bet; BET 1 and BET 2 independent; cashout and gameplay; mobile gameplay at 375×667 and 390×844; the seven-size screenshot matrix; the ship, waterline and chain connection; the anchor descent, landing and slack chain; the illustrated sea floor; the redesigned Bonus Chest. This satisfies docs/07 §19 gates 7 and 8 and records the E-X3 browser QA. It is not to be requested again unless a later change materially affects the approved behavior or visuals.
- **Ratified:** E-X4 (scope verified: exactly the 19 files in docs/07 §19 gate 4), and D1–D4.
- **Close-out commits on `develop`:**
  - G1 `6e28ce0` `feat(ui): redesigned Bonus Chest`
  - G2 `9bded6b` `feat(rendering): slack chain, anchor descent and sea-floor landing (E-X4)`
  - G3 `3346ed8` `fix(config): move preview options under vite`
  - G4: this documentation commit, `docs: Sprint 4 Phase 6 official close-out`
- **Final gates (after G1–G3):** 572/572 tests across 42 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings (end-of-line neutralized), the changed source files clean raw; production build passes; SSR smoke HTTP 200 with canvas markup; `git diff --check` clean; `src/engine`, `src/shared` and `render-state.ts` unchanged since `be10b19`.
- **Deferred, still tracked:** M1 (deferred to final stabilization, **not closed**); M2 and B-R (not started); recovery items 1–3 below; the favicon 404; the E-X1 Phase 8 limitation.
- **Next:** Phase 7 planning, on the owner's instruction only. **Phase 7 is not started.** The project is not production-ready.

## Previous: Sprint 4 close-out — Step 3, visual acceptance, Git reconciliation and final gates (2026-11-15); superseded by the official close-out

Nothing is staged, committed, pushed or stashed by this step. `develop` = `origin/develop` = `81eb985`. Full record: `docs/15_PROGRESS.md`, "Sprint 4 close-out — Step 3".

- **Owner visual acceptance (2026-11-15).** Accepted as they are: the ship and waterline; the initial anchor position and chain connection; anchor descent and the sea-floor landing; the slack chain; the illustrated sea floor; the redesigned Bonus Chest; the existing gameplay presentation. They are not to be redesigned or replaced.
- **Recorded by owner approval:** the renderer exception **E-X4** (docs/07 §19 gate 4) and the QA fixes **D1–D4** as accepted (docs/07 §15). This resolves Step 2 blockers 1 (D1–D4) and 4 (the renderer work).
- **Git reconciliation.** Step 2's "`develop` = `be10b19`, all uncommitted" is superseded. Since `be10b19`:
  - `c046b33` (2026-11-14, message `Update lockfile`) holds the close-out Step 2 docs, the D1–D4 fixes and the first part of the renderer work. The message does not describe the content, and the commit stays as is, because pushed history is not rewritten (AGENTS.md).
  - `5c5741a` … `2b8d51b` (2026-11-14/15, web-editor commits): `vite.config.ts` and `package.json` edits. Net effect: a `start` script and a `preview` block.
  - `9ef35e9`, `4d44a50`: `package.json` scripts repair and `bun.lock` sync.
  - `81eb985`: renderer visuals (new ship, floating pre-dive anchor, illustrated sea floor).
  - All of these are on `origin/develop`. None has a recorded §19 validation run of its own; the Step 3 gates below cover the current tree.
- **Working tree (uncommitted):** the rest of the E-X4 renderer work (slack chain, descent and landing, sea-floor art, an updated `sea-floor.png`), the Bonus Chest redesign (`ChestPicker.tsx`, `icons.tsx`, with the six Prettier errors fixed and the unused `ChestIcon` removed), and a `vite.config.ts` fix that moves `preview` under `vite:` as the config package requires. Plus this step's documentation.
- **Gates (2026-11-15, working tree):** 572/572 tests across 42 files; `tsc` clean; ESLint 0 errors and 6 pre-existing warnings (end-of-line neutralized); the changed files are lint- and Prettier-clean raw; `git diff --check` clean; production build passes.
- **Still open before Phase 6 can close:** (1) §19 gate 7, the owner's manual gameplay pass on the Dual Bet build, including 375×667 and 390×844; (2) §19 gate 8, the owner's approval of the 7-size screenshot matrix (the 2026-11-15 visual acceptance covers the listed visuals; it is not recorded as the matrix approval unless the owner says so); (3) the owner's E-X3 Dual Bet browser QA; (4) Git authorization for the close-out commits; (5) the Sprint 4 retrospective (docs/07 §22 item 11), after acceptance.
- **Next:** owner review of this step and the proposed commit groups. **Phase 7 is not started.**

## Previous: Sprint 4 close-out — Step 2, browser QA + QA fixes + quality gates done; AWAITING OWNER ACCEPTANCE (2026-11-14)

*Superseded 2026-11-15 by Step 3 above. D1–D4 and the renderer work were accepted; the Git status below was already out of date (`c046b33` holds this step's work).*

Nothing is staged, committed, pushed or stashed. `develop` = `origin/develop` = `be10b19`. Full record: `docs/15_PROGRESS.md`, "Sprint 4 close-out — Step 2", and the draft Sprint 4 completion report.

- **Browser QA (agent-run, headless Chrome):** Dual Bet, independent cashouts, wallet settlement, crash, jackpot and keyboard chest pick, layout and keyboard access, at 375×667, 390×844, 768×1024, 1280×720, 1366×768, 1440×900 and 1920×1080. **All executed checks pass** after the fixes. Not run: jackpot at 768×1024 and 1920×1080, real devices and touch, a real-browser remount during Dual Bet. Console: one cosmetic `/favicon.ico` 404.
- **Defects fixed (uncommitted, `src/ui` only):** D1, ship off-canvas on phones and portrait tablets (host-side scene fit, renderer untouched); D2, focus lost after PLACE BET / CASH OUT; D3, chest picker not keyboard-reachable; D4, unnamed stake fields with no focus ring. **D1 changes the mobile canvas (a zoom-out), and D2–D4 touch the §20 a11y non-goal. Both need the owner's acceptance.**
- **Gates:** 539/539 tests across 39 files; `tsc` clean; ESLint 0 errors + 6 pre-existing warnings with end-of-line neutralized (the raw run fails on the CRLF artifact, recovery item 1); changed files lint-clean raw; build passes; SSR smoke 200; engine and shared unchanged; the owner's renderer work untouched (hashes verified).
- **Blockers to closing Phase 6 (owner):** (1) accept D1–D4 and approve their commit; (2) §19 gate 7, manual gameplay; (3) §19 gate 8, screenshot approval; (4) decide on the uncommitted renderer work (frozen directory, no exception).
- **Next:** owner review and explicit acceptance. **Phase 7 is not started** and starts only after Phase 6 is accepted.

## Previous: Sprint 4 close-out — Step 1, documentation reconciliation (2026-11-14)

*Superseded by Step 2 above. Its "Next" was carried out as Step 2.*

Documentation only. No application code changed. Nothing is staged, committed or pushed by this step.

**Repository state (verified with `git`):** `develop` and `origin/develop` are both at `be10b19`. Sprint 4 commits since U5:

| Commit | Content |
|---|---|
| `e37b81c` | M1 (S1): E-X2, M1-1, V2, W1–W11, R2 |
| `4440009` | U6 + U7 (one combined commit) |
| `e8b1b62` | The deferred M1 test suites (469/469 recorded in its message) |
| `be10b19` | Dual Bet E-X3 (message: `feat: update engine and UI state handling`) |

**Status by item:**

- **U6:** delivered. Pending: §19 gate 7, the owner's mobile pixel-compare.
- **U7:** delivered, with the owner's two layout corrections, recorded as approved in docs/07 §15. Pending: §19 gate 8, the screenshot matrix.
- **E-X3 Dual Bet:** approved and delivered (docs/06 §13.2, docs/07 §8, §13.3, §15, §23.17). Pending: owner browser QA. No validation run is recorded for `be10b19`.
- **M1:** **deferred** to the final stabilization phase. It is **not closed**, validated or formally accepted. The S1 commit does not close it.
- **M2:** tracked separately, not started. **B-R** is inside M2.
- **Approved freeze exceptions:** E-X1, E-X2, E-X3, each limited to its file list.
- **Working tree, preserved untouched:** uncommitted renderer changes in `src/rendering/draw/chain.ts` and `src/rendering/theme.ts`, plus the untracked `src/rendering/draw/chain.test.ts`. They lie in the frozen renderer, and no approved exception covers them. Under §19 gate 4 they cannot be committed without an owner decision. This step does not review, stage or change them.

**Next:** the owner reviews this reconciliation. Further close-out steps follow only on the owner's approval, in the original roadmap order. No new phase or feature is introduced.

## Previous: U6 componentization — implemented and validated 2026-11-14, committed locally with U7

*Superseded 2026-11-14 by the reconciliation above. U6/U7 is `4440009`, and it is pushed. The deferred M1 tests landed as `e8b1b62`, and Dual Bet E-X3 as `be10b19`.*

Owner decisions 2026-11-14 (resume-at-U6 instruction): **M1 is deferred** to the final stabilization phase — an owner-authorized scheduling exception; M1 is **not** closed, validated or formally accepted, and all completed M1 work is preserved. (The M1 implementation was committed as `e37b81c`; seven M1 test files — `screen.bet-input.test.tsx`, `screen.remount.test.tsx`, `session.money.test.ts`, `session.test.ts`, `store/payout.test.ts`, `store/wallet-store.test.ts`, `test/money-oracle.ts` — still hold uncommitted work that must be preserved and kept out of any U6 commit. `src/routeTree.gen.ts` is stat-dirty only and stays untouched.) Sprint 4 resumes at **U6** per docs/07 §17.

**U6 delivered (2026-11-14 — validated; committed locally with U7, not pushed):**

- `src/ui/components/`: `GameScreen.tsx` (frame + composition, route component), `TopBar.tsx`, `HistoryStrip.tsx`, `CanvasStage.tsx` (attach lifecycle), `MultiplierOverlay.tsx`, `CrashBanner.tsx`, `WinFlash.tsx`, `ChestPicker.tsx`, `BettingPanel.tsx`, `BetControls.tsx`, `QuickBets.tsx`, `ActionButton.tsx`, `icons.tsx`, `DevRejectionBanner.tsx` — markup, class strings and button order verbatim from `AbyssAnchor.tsx`; per-slice `useStore` subscriptions (delta V3; identical pixels).
- `src/ui/strings.ts` (§14): every user-facing string, typed, functions where text interpolates; text byte-identical. Dev-only strings under `dev`.
- `formatMoney` added to `src/game/presentation.ts`; the scattered money `.toFixed(2)` displays consolidated; inline `toFixed(2) + "×"` multiplier displays consolidated onto the existing `formatMultiplier` (identical output).
- Dev rejection banner (§12, C3, deferred from U4): dismissible, reads the notification store's bounded rejection history, rendered under `import.meta.env.DEV` only (compiled out of production). The dev-only logging/history from U4a is preserved.
- Route migration: `src/routes/index.tsx` mounts `GameScreen`; `src/ui/test/dom-harness.tsx` boots `GameScreen` (the §21 pins now run against it). `src/components/AbyssAnchor.tsx` is **deleted** after the replacement passed validation.
- Not touched: `src/engine`, `src/rendering`, `src/shared` (frozen), `src/routeTree.gen.ts`, and the seven M1 test files above. No new features; no visual redesign (the U7 layout follows in the same commit).

**Validation done:** `tsc --noEmit`, the test suites (including the 20 characterization pins against `GameScreen` and remount/StrictMode), production build, targeted lint and freeze audit, run on the exact staged contents in an isolated worktree. **Still pending:** owner manual browser QA with mobile pixel-compare (§19 gate 7) and the U7 screenshot matrix (§19 gate 8).

**Next:** the deferred M1 test changes as a separate local commit, then Dual Bet E-X3 (owner-approved 2026-11-14).

## Previous: return to the approved roadmap — close M1, finish the pending browser QA, then resume Sprint 4

*Superseded 2026-11-14 by the owner's M1 deferral and the resume-at-U6 authorization above. M1's S1 commit landed as `e37b81c`; M1 remains not closed.*

Status on 2026-11-14. Nothing is staged, committed or pushed.

**Status by category:**

- **M1, implemented and validated (uncommitted):**
  - E-X2 (approved);
  - M1-1;
  - the BigInt rounded-down payout (V2);
  - W1–W10;
  - R2 unresolved claims;
  - **W11** (approved and implemented 2026-11-14, docs/07 §23.21): the exact-cent credit envelope below 2^44 units;
  - the sanctioned test rewrites.
- **M1, pending acceptance:**
  1. ~~The owner's manual browser QA for M1: **partially confirmed** (below). The full gate is pending.~~ **Done (2026-11-14): the owner confirms all 19/19 detailed checks passed (below).**
  2. A separate, explicit authorization to perform the S1 commit. *(Owner, 2026-11-14: S1 is to be one **local** commit, with **no push**. That is not yet authorization to commit.)*
- **Deferred to M2 (not started):** B-R / the authoritative integer-cent ledger (docs/07 §23.20 design kept as input), and the rest of §23.10.
- **U4b and U5:** committed and pushed. Manual browser QA **passed** (owner-confirmed 2026-11-14: U4b 6/6, U5 7/7). *(Earlier the same day: partially confirmed, still pending.)*
- **Browser QA accepted (2026-11-14, owner-confirmed):** the owner confirms that **all 19/19 detailed checks passed**: U4b 6/6, U5 7/7, M1 6/6. These are owner-performed browser checks; the agent ran no browser test. The browser QA gate for U4b, U5 and M1 is **closed**. The temporary `// @refresh reset` line is confirmed absent from `src/components/AbyssAnchor.tsx`. The paragraph below records the earlier, partial status.
- **Browser QA status (2026-11-14, owner-reported; superseded by the 19/19 acceptance above):** the owner reports that **10 consolidated browser checks passed**. This is **not** a pass of the 19-item detailed checklist below (U4b 1–6, U5 1–7, M1 1–6). The 10 checks were not listed item by item, so no detailed item is recorded as passed on their strength. The detailed items still awaiting the owner's confirmation are in the reconciliation list after the checklist. The full browser QA gate for U4b, U5 and M1 stays **pending** until the owner confirms them. No browser test was run by the agent.
- **U6:** not started. It starts only after M1 closes and the owner authorizes it.
- **Still open, not blocking:** the R2 resolution policy; Q4, Q5, Q6, Q8c, Q9b, Q13.

**Final validation (2026-11-14, working tree, after W11):**

| Check | Result |
|---|---|
| Tests | 427/427 green across 33 files (Vitest from PowerShell; 18 new W11 tests) |
| TypeScript | `tsc --noEmit` clean |
| Build | Production build passes |
| ESLint | Changed and new files, end-of-line neutralized: clean, apart from the 6 pre-existing `AbyssAnchor.tsx` errors |
| `git diff --check` | Clean |
| Freeze audit | Exactly the four E-X2 files |
| `src/routeTree.gen.ts` | Byte-identical to HEAD (stat-dirty only) |
| Engine–wallet consistency, idempotency, faulted rounds (W10 / R2 / W11) | Covered by green tests, including a real-engine round landing exactly on 2^44 |

**Manual browser QA checklist** (run in `npm run dev` with the console open):

- **Remount procedure.** Temporarily add `// @refresh reset` to `src/components/AbyssAnchor.tsx` and save the file at the moment named in the check. Remove the line afterwards.
- **U4b — round store:**
  1. Phase label, countdown, multiplier and boost update smoothly through a full round.
  2. Bet and reach impact without cashing out. The chest picker appears; a pick updates the balance and the result once.
  3. Remount while the chest picker is visible. The picker reappears and still works, and the pick credits once.
  4. Remount after a chest is revealed. The revealed chest is still shown.
  5. Remount mid-dive, then cash out. Exactly one credit, against the locked bet.
  6. As a spectator (no bet), go through a bonus. No picker appears and the round completes.
- **U5 — bet input and action state:**
  1. Clear the field. PLACE BET is disabled and no error appears.
  2. Type decimals (1.50, 0.01). PLACE BET is enabled; −, + and the quick bets behave as before.
  3. Type a negative value, then a value above the balance. PLACE BET is disabled.
  4. PLACE BET disables in the last 0.2 s of the countdown.
  5. Double-click PLACE BET: one debit. Double-click CASH OUT: one credit.
  6. During impact, crash and bonus the button reads WAITING…, and the bet controls stay enabled.
  7. Type a bet, then remount. The typed bet survives.
- **M1 — money integrity:**
  1. Bets of 0.005, 0.001, 0.123 and 1.234: PLACE BET is disabled, Enter does nothing and the balance is unchanged.
  2. Bet 0.01 and cash out just above 1.5×. The credit is 0.01, not 0.02.
  3. Bet 1 and cash out. The SECURED amount and the balance change both equal stake × the secured multiplier, rounded **down** to the cent.
  4. Jackpot, then chest. The total equals the rounded-down final payout, and the balance rises once per payout.
  5. A bet exactly equal to the balance is accepted; a bet 0.01 above it is disabled.
  6. About 10 rounds with no console errors. Balance labels always show two decimals.

**Reconciliation with the owner's 10 consolidated checks (2026-11-14).** The owner reported 10 passed checks without listing them. None of the 19 items above can be shown to be *clearly* covered, so none is recorded as passed. To close the gate, the owner confirms each item, or names the items the 10 checks already covered:

*Resolved later on 2026-11-14: the owner confirms every item below passed (19/19).*

- [x] U4b-1 · [x] U4b-2 · [x] U4b-3 (remount, picker visible) · [x] U4b-4 (remount, chest revealed) · [x] U4b-5 (remount mid-dive, one credit) · [x] U4b-6 (spectator bonus)
- [x] U5-1 · [x] U5-2 · [x] U5-3 · [x] U5-4 (0.2 s cutoff) · [x] U5-5 (double-click) · [x] U5-6 (WAITING…) · [x] U5-7 (remount, typed bet)
- [x] M1-1 (sub-cent rejected) · [x] M1-2 (0.01 at 1.5× → 0.01) · [x] M1-3 (round-down) · [x] M1-4 (jackpot + chest) · [x] M1-5 (bet = balance) · [x] M1-6 (10 rounds, two decimals)

The four remount items (U4b-3, U4b-4, U4b-5, U5-7) need the temporary `// @refresh reset` line. It must be removed before the S1 commit: `AbyssAnchor.tsx` is in the commit manifest. *(2026-11-14: confirmed absent from the working tree; the file's only diff is the M1 `payoutAmount` change.)*

**S1 commit readiness (2026-11-14, after the QA acceptance):** READY for one local atomic commit, pending the owner's authorization. Manifest: 27 files (19 modified, 8 new), `src/routeTree.gen.ts` excluded (byte-identical to HEAD, line-ending stat only). The frozen directories differ by exactly the four E-X2 files. `git diff --check` clean; nothing staged. No push.

**Next step in the original Sprint 4 roadmap:** after M1 closes, **U6 (componentization**, docs/07 §17). Its plan goes to the owner for approval before any code. **U7** (responsive layout) follows.

## Previous: M1 — implemented in the working tree except B-R; awaiting the B-R design approval, browser QA and Git authorization

*Superseded 2026-11-14 by the roadmap return above: B-R is deferred to M2, and blocker 1 below is replaced by the W11 decision.*

Status on 2026-11-14. Nothing is staged, committed or pushed. `src/routeTree.gen.ts` is untouched.

- **Implemented (uncommitted):**
  - E-X2 (approved): the shared predicate and the engine guard.
  - M1-1: the action state and the session submit edge share `isPlaceableStake`.
  - V2: the BigInt rounded-down payout, used for every settlement path and for `potentialWin`.
  - Wallet rules W1–W9, W3 included.
  - W10 under R2: faulted participations are kept as auditable unresolved claims (`wallet.unresolvedClaims()`), never refunded, forfeited, credited again or recorded as a loss.
  - Sanctioned test rewrites: the `0.123` DOM pin, one characterization value (5.22 → 5.21, M1-D8), the round-to-nearest oracles (replaced by `money-oracle.ts`), and the wallet read-surface pin.
- **Not implemented: B-R.** A read-surface change cannot be avoided. The minimal design D1–D6 and three approval points are in docs/07 §23.20.
- **Validation (2026-11-14):**
  - `tsc --noEmit` clean.
  - 409/409 tests green across 33 files, 7 of them new R2 tests.
  - A mutation check of the R2 rules: all 4 mutants caught.
  - Production build passes.
  - Targeted ESLint with end-of-line neutralized: only the 6 pre-existing `AbyssAnchor.tsx` errors.
  - `git diff --check` clean.
  - Freeze audit: exactly the four E-X2 files.
- **Blockers to M1 closure:**
  1. The owner approves or amends the B-R design (§23.20), and B-R is implemented and validated. Alternatively, the owner decides to close M1 with the `number` ledger and its recorded 2^44 / 2^46 envelope.
  2. Owner manual browser QA for M1, together with the pending U4b and U5 QA.
  3. The owner authorizes staging, the single S1 commit and the push.
- **Still open, not blocking:** the R2 resolution policy (temporary local-demo policy); Q4, Q5, Q6, Q8c, Q9b, Q13.

## Previous: M1-0 — Money Integrity decisions and architecture plan (documentation only)

*The status lines in this section describe 2026-11-13. "Not implemented", "not authorized" and "planning-only" were true then. For the current state, see the section above.*

- Scope: documentation only, under TASK 007. Edited: `docs/06_ENGINE_ARCHITECTURE.md`, `docs/07_UI_ARCHITECTURE.md`, `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, this file. No source, test, configuration or dependency file changed; nothing staged, committed or pushed.
- Approved by the owner 2026-11-13 (policy, docs/07 §23.1): **M1-D1** bets have at most two decimals of monetary value, sub-cent amounts rejected and never rounded; **M1-D2** minimum bet 0.01, no new arbitrary maximum; **M1-D3** invalid amounts rejected, PLACE BET disabled, the submit path enforcing the same rule; **M1-D4** engine exception E-X2 to be planned; **M1-D5** integer minor units deferred to M2; **M1-D6** U5 decisions D7 and D11 superseded in part, with dated notes (docs/07 §17, §23.3).
- **Not done, not claimed:** the M1 vulnerability is **not fixed** — a stake of `0.005` or less still debits nothing and still pays (docs/07 §23.2). V2, the minimum-stake payout-rounding edge, is **not fixed** either. M1 is approved policy, not implemented. E-X2 is not approved for implementation. M2 is not underway. No manual browser QA has passed for U4b or U5.
- Proposed (each stage needs its own approval):
  - the valid-stake predicate (docs/07 §23.4);
  - the commit plan: E-X2 + M1-1 in one commit, then M1-2, then M1-3, under conditions K1–K4 (docs/07 §23.8 — revised by the review pass; the first draft's separate E-X2 → M1-1 → M1-2 commits are withdrawn);
  - the E-X2 candidate file scope (docs/06 §13.1);
  - the test matrix (docs/07 §23.7).
- Review pass (2026-11-13), docs only:
  - numeric bounds analysis (docs/07 §23.11) — no ceiling adopted;
  - engine–wallet consistency contract with invariant I8, ten traced cases and limitations L1–L6 (docs/07 §23.12).
- Open questions for the owner (docs/07 §23.9):
  - Q1 technical stake ceiling (**open**; candidates T1–T6);
  - Q2 commit plan and approval to bundle the M1-1 files into the E-X2 commit;
  - Q3 scope of the wallet guard;
  - Q4 snapshot restore validation;
  - Q5 input `step`/`min` attributes;
  - Q6 user-facing rejection hint;
  - Q7 event and command injection (now a recorded limitation, M1-D11);
  - Q8 payout implementation and the meaning of "intended" (new);
  - Q9 negative or out-of-range multipliers (new);
  - Q10 push timing for C3 commit 1 (new).
  - Q2 and Q3 are partly resolved by M1-D9.
- Security boundary review (2026-11-13, read-only):
  - confirmed a second open vulnerability, **V2** — minimum-stake payout rounding;
  - a 0.01 stake cashed just above 1.5× is paid 0.02;
  - measured return per unit staked: 1.2588, against 0.9571 for a stake of 1;
  - V2 uses valid stakes only, so it survives E-X2 + M1-1.
- Final reconciliation (2026-11-13, docs only) — owner decisions (docs/07 §23.1):
  - **M1-D7:** V2 is a required fix inside M1.
  - **M1-D8:** nonnegative payouts are rounded down to the cent, with a numerically justified implementation. `Math.floor(s * m * 100)` is shown to be unsafe. This supersedes the U2 bit-identical rule for payouts (docs/07 §23.3, §23.13).
  - **M1-D9:** C3 is the provisional plan, with the wallet non-finite debit, credit, payout and balance protection kept in M1 (§23.14).
  - **M1-D10:** stake, balance and payout ceilings stay unresolved.
  - **M1-D11:** event emission, restore, live-reference aliasing and network trust boundaries are recorded limitations; wallet guards do not authenticate events (§23.15).
  - **M1-D12:** E-X2 remains planning-only.
- Added in the reconciliation:
  - invariants I9 (settlement) and I10 (finite wallet);
  - the V2 test block (docs/07 §23.7);
  - the list of affected U2/U3 expectations (§23.3);
  - questions Q8 (payout implementation and the meaning of "intended"), Q9 (negative multipliers) and Q10 (push timing for commit 1).
- **Open financial vulnerability at an intermediate commit:** after C3 commit 1, V2 is still open through the normal UI, and non-finite wallet poisoning is still open through runtime access. Both exist today; neither is introduced by commit 1.
- Final financial integrity reconciliation (2026-11-13, docs only).
  - **Approved owner policy** (docs/07 §23.1):
    - **M1-D13:** payout policy — computed from the accepted stake × the authoritative settlement multiplier, rounded down to the cent, never above the intended amount; the binary product is not a monetary result.
    - **M1-D14:** NaN, ±Infinity and negative multipliers never credit; nothing is silently zeroed; nothing is partially applied.
    - **M1-D15:** the wallet-side integrity guards are in M1.
    - **M1-D16:** no unsafe intermediate commit is pushed or presented as production-ready.
    - M1-D10 is reaffirmed.
  - **Proposed** (not authorized):
    - the BigInt payout function and the four multiplier meanings (§23.16);
    - wallet rules W1–W9, closing holes H1–H6 (§23.17). H1 and H2 are duplicate-credit paths in today's wallet, and H1 is pinned by a U2 test that would get a sanctioned rewrite;
    - plan **C4**: local L1–L3, then one atomic integration commit, pushed once after G2 (§23.18);
    - the numeric envelope (§23.19).
  - E-X2 remains **planning-only**. Event identifiers and the other engine changes are classified as separate future freeze exceptions.
  - **Open:** Q1, Q2, Q4, Q8a–c, Q9b–c, Q11 (representability above the envelope), Q12 (over-balance `betPlaced`), Q13 (`roundId` keying under restore), Q14 (S1 or S3). Q10 is replaced by Q14 (M1-D16 rejects pushing commit 1 alone).
  - **Under C4, no intermediate state is pushed.** The published `8363b9f` still contains V1, V2 and H1–H6.
- Next steps:
  1. The owner reviews the M1-0 diff.
  2. If approved, a separate documentation-only commit.
  3. Owner decisions on Q1, Q2 (bundling), Q4–Q9 and Q11–Q14, and on E-X2's scope (the separate G1 gate, docs/07 §23.18).

  **No implementation stage may start before that.** Still pending independently: U4b and U5 manual browser QA. **U6 is not started.**

## Previous: U5 — committed and pushed (`09cc5af`), browser QA pending, not fully accepted

- Authorized by the owner 2026-11-13 with decisions D1–D12 (recorded in docs/07 §17, corrections C8, C9).
- Delivered (committed `09cc5af56534766982697f7036efce72f440260d`, `refactor(ui): complete U5 bet input store and action state`, pushed to `origin/develop`; 19 files: 5 new, 14 modified): `src/ui/store/bet-input-store.ts` (session-owned bet amount, `DEFAULT_BET` initial, verbatim halve/double/quick-set/typed arithmetic, every write sanitized: non-finite → 0, negative → 0, cleared field still 0); `src/ui/components/action-state.ts` (pure `actionStateFor` + `canPlaceBet`); `BET_CUTOFF_SECONDS = 0.2` in `src/game/config.ts`; `isAffordable` in `wallet-store.ts`, shared by `canAfford` and the action state (non-finite → false); `session.betInput`; `AbyssAnchor.tsx` reads the bet via `useStore`, drives the action button from `actionStateFor`, and has no `useState` left. JSX markup, class strings and button order unchanged; `submit` unchanged.
- Approved behavior changes: (1) the typed bet survives a remount (D4); (2) `canAfford(NaN)` is now false, so a `NaN` placeBet is dropped at submit instead of being rejected by the engine as `invalid-amount` (D7); (3) non-finite bet-input writes become 0 (D2). Through the real number field, non-finite text already arrived as `""` → 0 before U5 (the input sanitizes it), so (2) and (3) are defense in depth with no observable change in normal play.
- Validation: tsc clean; 311/311 tests (29 files; +62: action-state 13, bet-input store 20, DOM bet-input 14, session +8, wallet +5, remount +2); the 20 characterization pins pass with unchanged assertions (two `PINNED UNTIL U5` titles retitled, since U5 keeps their behavior); the sanctioned `PINNED UNTIL U5` remount pin rewritten (the bet now survives); mutation check — breaking the cutoff comparison or the non-finite check fails the new tests; targeted lint: EOL-neutralized findings limited to the 6 pre-existing `AbyssAnchor.tsx` JSX-formatting errors, the 5 new files clean raw; production build passes; SSR smoke passed (port 5231: HTTP 200, canvas markup, bet field at 5); `git diff --check` clean; freeze check empty; `src/routeTree.gen.ts` untouched (SHA-256 unchanged).
- Pending: **U4b manual browser QA** (including a real-browser remount during the bonus phase) and **U5 manual browser QA** (bet-input edge cases: clear the field, type decimals, negative and very large values; − / + / quick bets; PLACE BET enable/disable at the cutoff; double-click PLACE BET and CASH OUT; WAITING… during impact/crash/bonus with bet controls enabled; the typed bet surviving a `// @refresh reset` remount). Neither has passed.
- Post-commit: 311/311 tests green across 29 files; tsc and production build pass; targeted lint — no new findings; engine/rendering/shared freeze preserved.
- Open security item: **M1 — sub-cent betting vulnerability, unresolved.** U5 does not address it; it requires a separate owner-approved task.
- Next: owner manual browser QA for U4b and U5, and an owner decision on the M1 task. **U6 is not started** until the owner says so.
- Update 2026-11-13: the owner decided on M1 — policy M1-D1 to M1-D6 approved, the work staged under TASK 007 (see "Current" above). U5's D7 and D11 are superseded in part (docs/07 §17 supersession note, §23.3). The browser QA items above are still pending.

## Previous: U4b — committed and pushed (`bbdc134`)

- Delivered (committed `bbdc13443e1b2a8cb29e58a1f24e72f7d44711c2`, pushed to `origin/develop`): `src/ui/store/round-store.ts` (session-owned `EnginePublicState` mirror, projected and normalized on write — C6); session wiring (`session.round`; seeded at construction; `attachCanvas(canvas)` writes once on attach and makes the round-store write the driver's sync; the host sync parameter is retired); `AbyssAnchor.tsx` reads phase, countdown, multiplier, boost, eligibility, chests and the chosen chest via `useStore` — its five mirrored `useState`s, `chests`/`chosenChest` state, the three chest listeners and the sync callback are gone; JSX byte-identical.
- Validation: tsc clean; 249/249 tests (26 files); the 20 characterization pins unchanged; only the sanctioned `PINNED UNTIL U4` remount pin rewritten; C7 constants 3 → 0 with sink/per-frame-write assertions; targeted lint: new files clean raw, EOL-neutralized findings limited to the 6 pre-existing `AbyssAnchor.tsx` JSX-formatting errors; production build passes; SSR smoke passed (port 5223); `git diff --check` clean; freeze check empty; `src/routeTree.gen.ts` untouched.
- The round store is synchronized by two paths: the driver's per-frame sync, and one immediate write inside `attachCanvas`.
- Open: owner manual browser QA is not recorded here, including a **real-browser remount during the bonus phase** (the `// @refresh reset` procedure in the U2 closure below). U5 was authorized by the owner on 2026-11-13 (above).

## Previous: U4a — approved, committed and pushed

The owner approved the U4 architecture on 2026-11-13 with three decisions: (1) U4 splits into **U4a** (notification store) and **U4b** (round store), with separate validation and approval gates; (2) the visual dev rejection banner is **deferred to U6** — U4a lands dev-only logging and a bounded rejection history; (3) U4b must restore the eligible chest picker after a React component remount during `bonus`. Recorded in docs/07 §11, §12, §17 (re-cut table + corrections C1–C5).

- Delivered: `src/ui/store/notification-store.ts` (session-owned; consumes `wallet.onFlash`; durations verbatim; one timer, supersede on re-trigger; `bettingOpened`/`diveStarted` clear and cancel; injectable clock; dev-only `commandRejected` log + bounded history); session wiring (`session.notifications`, `notificationClock`/`diagnostics`/`diagnosticsLog` deps; the production singleton passes `import.meta.env.DEV`); `AbyssAnchor.tsx` reads the flash via `useStore` — its flash state, `setTimeout`, `onFlash` and flash-only `bettingOpened` subscriptions are gone.
- Validation: tsc clean; 212/212 tests; the 20 characterization pins unchanged and green; lint at the 7 + 6 baseline (EOL neutralized), new files clean raw; production build passes and contains no diagnostics code; SSR smoke passed; freeze check empty; `src/routeTree.gen.ts` byte-identical.
- Owner manual browser QA passed 5/5 (2026-11-13): cash flash ≈1,800 ms, jackpot flash ≈2,200 ms, chest selection updates balance and result, no stuck or duplicated flashes across rounds, no new console errors. Final gates re-run before the commit, all green. A real-browser remount is still unverified.
- Next: U4b architecture plan for owner review. **U4b implementation is not authorized.**

## U3 closure (2026-11-13)

- Committed and pushed as `8e9b21b`. The owner accepted the reported validation results.
- Delivered: the jsdom + Testing Library devDependencies (exact pins), a two-project Vitest config (`node` for `*.test.ts`, `dom` for `*.test.tsx`), the DOM harness in `src/ui/test/`, 20 characterization pins (`src/ui/screen.characterization.test.tsx`) and 9 remount + StrictMode tests (`src/ui/screen.remount.test.tsx`).
- Validation: **180/180 tests green across 22 files**; `tsc --noEmit` clean; production build passes; SSR smoke passed; freeze check empty; `src/routeTree.gen.ts` byte-identical.
- Remount: DOM-level React remount and StrictMode coverage is complete (real component, jsdom). This closes U2's accepted limitation at the automated level. **A real-browser remount remains unverified.**
- Lint: **full-project lint is not clean.** The raw run is dominated by Prettier end-of-line errors from CRLF working-tree files (recovery item 1). With end-of-line neutralized, 7 pre-existing errors + 6 pre-existing warnings remain — the recorded baseline; U3 added none.
- Environment: Git Bash Vitest runner issue on Windows — a lowercase drive letter in the working directory (`c:\`) makes Vitest fail every file (pre-existing). Verified workaround: run Vitest from PowerShell in `C:\…`.

## U2 closure (approved 2026-11-13)

Owner approval: 2026-11-13. Recorded basis:

- Gate 5 SSR smoke: passed (details below).
- Gate 6 console hygiene: passed. The owner's browser console checks found no errors.
- Gate 7 manual gameplay: passed. The owner's manual gameplay checks found no errors.
- Automated: 151/151 tests green, `tsc --noEmit` clean.
- E-X1: committed and pushed as `897c5be`.
- **Limitation (accepted by the owner):** React remount coverage is automated only, through the session-level remount tests in `src/ui/session.test.ts`. A browser-level React component remount mid-round was **not** manually tested. The `// @refresh reset` procedure below was not run. It is kept for reference and for any later re-check.

U2 validation run (2026-11-13, against `897c5be`) — kept for reference:

- **Gate 5 — SSR smoke: PASSED.** A fresh `vite dev` (port 5211) served `GET /` with HTTP 200 and the expected markup: `<canvas class="absolute inset-0 h-full w-full">` (from `AbyssAnchor.tsx:177`) and `<title>AQUADIVE — Real-Time Crash Game</title>`. The HTML had no error/exception strings and the server log had no errors. The client modules (`AbyssAnchor.tsx`, `session.ts`, `wallet-store.ts`, `routes/index.tsx`) transform with HTTP 200. `src/routeTree.gen.ts` stayed byte-identical (SHA-1 checked before and after). Note: a stale dev server from an earlier session was still listening on port 5199 and was left running; the smoke result comes from the fresh server only.
- **Gate 6 — Console hygiene: PASSED (owner, 2026-11-13).** The agent environment has no browser tooling, so the owner ran this check; the browser console showed no errors.
- **Automated re-check: PASSED.** `tsc --noEmit` clean, 151/151 tests green (20 files).
- **Remount: code review and automated coverage done.** The browser-level check was not run; see the limitation above. Details below.

Remount review (component remount, not page refresh):

- *Wallet balance and settlement state survive a remount.* The wallet listeners subscribe once, at session construction (`src/ui/session.ts`), on a module singleton. They are never unsubscribed, so an unmount can neither reset the wallet nor cause it to miss an event.
- *Subscriptions stay active, without duplicates.* The component's mount effect (`AbyssAnchor.tsx`) attaches the canvas and five display listeners. Its cleanup detaches the canvas and unsubscribes all five, so mount/unmount cycles (including React StrictMode's dev double-mount) stay balanced. Display listeners are never added twice.
- *No duplicate settlement.* The settlement listener count is fixed at construction, and the wallet is idempotent against duplicate `cashedOut` / `chestPicked` events (`39f5a9f`, tested). A remount cannot add a second settlement listener.
- *Automated coverage* (`src/ui/session.test.ts`, session level; there is no React/DOM test harness):
  - detach/re-attach keeps engine state (U1);
  - unmount mid-dive, remount, then cash out credits against the locked bet with the wallet snapshot unchanged;
  - events that fire while nothing is mounted are still settled.
  - These simulate the component's mount effect through `attachCanvas`/detach; **no test mounts the actual React component**.
- *Known display gap, not money-related (a named U2 → U4 seam):* `chests`, `chosenChest` and `cashFlash` are component `useState`.
  - A remount **during `bonus`** loses `chests`, so an eligible player's picker stays hidden for the rest of that bonus.
  - E-X1's 6 s auto-pick (chest 0) still completes the round, and the wallet credits it correctly.
  - The round store (U4) fixes this. Not a U2 blocker: settlement is unaffected.
  - Also a known U2 → U4 seam: the flash `setTimeout` is not cleared on unmount (harmless under React 18).
- *Full page refresh is out of scope:* it rebuilds the module singleton, so the balance returns to the default. This is expected; persistence and reconnect are not part of U2.

Manual browser checks as planned before approval. Outcome: items 1 and 3 done; item 2 was **not run** and was accepted by the owner as covered by automated tests only.

1. **Gate 6:** console hygiene, as above. Passed.
2. **Gate 7, remount mid-round.** Not run (reference procedure).
   - How to remount without refreshing: in `npm run dev`, temporarily add the line `// @refresh reset` to `src/components/AbyssAnchor.tsx`, then save the file during a dive.
     - Fast Refresh then remounts the component: `useState` is reset and effects are cleaned up and re-run. The session module (`src/ui/session.ts`) is not re-executed.
     - A plain save without that line keeps state and only re-runs effects, so it is not a full remount.
     - Remove the line afterwards; it is a QA-only edit and must not be committed.
     - A full page reload (F5) is a refresh, not a remount, and does not count.
   - Pass criteria:
     - balance and the round bet are unchanged right after the remount;
     - a later cashout or crash settles exactly once, against the locked bet;
     - the history gets exactly one entry for the round;
     - the HUD resumes (phase, multiplier, countdown).
   - Caveat: if HMR does a full reload instead (session module invalidated, balance back to the default), the check is not valid. Report that instead of a failure.
3. Then: owner approval of U2. Done 2026-11-13. The U2 commits were already pushed.

E-X1 (details in `docs/15_PROGRESS.md`, rules in docs/06 §5): only a participant auto-cashed at the jackpot is bonus-eligible; it gets a 6 s / 360-tick pick window, and on expiry chest 0 is applied through the normal pick path. Spectators and manual-cashout players cannot pick, never see the picker, and their bonus phase ends after the result interval with no `chestPicked`; the wallet ignores any ineligible pick (no credit, no history entry). Snapshot schema bumped to v2.

**Phase 8 limitation (open):** E-X1 is a local single-player rule. A server-authoritative multiplayer round must complete `bonus` on its own schedule, independent of any one player's eligibility; per-player eligibility then gates only picking and crediting, and a server-side auto-pick / per-player default replaces the local chest-0 rule. This must be redesigned, not inherited, in Phase 8.

Gate 7 coverage: the owner's E-X1 browser QA (4/4 scenarios passed) covered bonus-path gameplay. The owner's later manual gameplay checks (2026-11-13) found no errors and are the recorded gate 7 pass. The remount mid-round focus item rests on automated coverage only (limitation above).

**Next:** U4b planning (see "Current" above; docs/07 §17).

Delivered in `ad30d7a` (details in `docs/15_PROGRESS.md`): `src/ui/store/wallet-store.ts` (settlement listeners, money state, `canAfford`, `onFlash`; read-only surface), session-owned and subscribed at construction (V1); `session.submit(command)` with the affordability check; component reads via `useStore`, state+ref mirrors deleted; 32 new tests (25 wallet ledger/replay, 7 session wiring + remount). Named U2 → U4 seams: flash timer/`cashFlash`, `chests` and `chosenChest` stay component-side via display subscriptions on `session.engine.events`; `attachCanvas` keeps the sync callback.

## U2 scope as approved (preparation audit, 2026-08-17) — kept for reference

- New `src/ui/store/wallet-store.ts`: the seven settlement listener bodies move verbatim from `AbyssAnchor.tsx` (`betPlaced` debit + bet-basis lock from the event payload, `diveStarted`, `cashedOut`, `crashed`, `shipImpact`, `chestsRevealed`, `chestPicked`); per-round reset becomes a `bettingOpened` listener; money state (`balance`, `roundBet`, `participating`, `hasCashed`, `lastWin`, `history`, jackpot base) moves per the §9 writer table; `canAfford(amount)`.
- `session.ts` wires the wallet subscriptions once at construction (session lifetime — V1) and gains `submit(command)` routing `placeBet` through the affordability check.
- Component reads via `useStore`; the state+ref mirrors are deleted in the same commit (one-writer rule, §20 risk 3).
- Ledger/replay test suite (node env, no new dependencies — §21 tier 1): golden ledgers for every settlement path, Commit 8 basis-lock replay generalized, float pins exact.
- Named mid-migration seam (the U1 sync-callback pattern): flash timers and display-only state (`cashFlash`, `chests`, `chosenChest`) stay component-side with thin display subscriptions until U4's notification/round stores.
- U2 manual-pass focus (§19.7): balance ledger through every settlement path, including remount mid-round.

## Open recovery items (post-Windows-reinstall; each needs its own approval and its own commit)

1. **Line-ending normalization**: 11 working-tree files are CRLF (reinstall artifact; causes 426 phantom prettier errors on `src/components/AbyssAnchor.tsx`); normalize to LF and add a `.gitattributes` enforcing LF so it cannot recur. Note: U2 edits `AbyssAnchor.tsx` heavily — the owner should decide this item's order relative to U2.
2. **Stable `main` branch**: the remote has only `develop`; `docs/18_GIT_WORKFLOW.md` requires a stable `main`.
3. **Scaffold leftovers**: stale `bun.lock` / `bunfig.toml` (the project is standardized on npm) and outdated Lovable references in `AGENTS.md` (the repository is now `pupsystores-glitch/AQUADIVE2026`).

Standing rules (unchanged):

- One step per commit; behavior-preserving unless a delta is explicitly sanctioned and ratified; game playable after every commit.
- Per-commit validation gate (docs/07 §19): `tsc --noEmit` clean; lint at the recorded baseline (9 + 6, modulo the CRLF artifact above); all tests green (151 after E-X1); engine/renderer freeze check; production build + SSR smoke; console hygiene; manual gameplay pass.
- Follow `docs/18_GIT_WORKFLOW.md`: verify → commit → push → wait for approval.
- `docs/05_RENDERING_ARCHITECTURE.md`, `docs/06_ENGINE_ARCHITECTURE.md` and `docs/07_UI_ARCHITECTURE.md` are binding contracts — on any conflict with reality, the commit stops and the document is corrected first.
