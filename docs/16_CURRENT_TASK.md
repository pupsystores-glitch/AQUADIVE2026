# CURRENT TASK

**TASK 008 — Sprint 5: Audio & Visual Effects (Phase 7) — ACTIVE since 2026-11-15.** Blueprint: `docs/08_AUDIO_FX_ARCHITECTURE.md`. The owner approved the architecture. **2026-11-17, R1 + V4: the owner visually approved CH1 and F8 and returned to the official Phase 7 roadmap. R1 reconciled these records with Git (`develop` = `origin/develop` = `d1ccb9b`; see "R1" below): every step up to CH1 is committed and pushed, some of it in combined commits. V4 (F5 landing silt plume) is authorized (D1–D4) and, since 2026-11-18, visually accepted by the owner exactly as implemented; it is committed locally, not pushed (see "V4" below).** **2026-11-18, V5: R1 (`cede9be`, docs only) and V4 (`9bc714d`) are committed locally, not pushed. The owner authorized V5 (F6 crash visual effects, D1–D5; D1 option A: no Canvas camera shake); since 2026-11-18 it is visually approved by the owner with final values (including the cached-vignette refinement) and committed locally as `feat(rendering): add accepted crash FX (V5)`, not pushed; physical-device performance validation is pending (see "V5" below).** **2026-11-18, V6: the owner accepted the V5 commit `dfe3342`, ratified two extra renderer files for V6 only and authorized F7 (round-reset fade: start slightly darkened → fade smoothly to normal); since 2026-11-18 it is visually approved by the owner as final and committed locally as `feat(rendering): add approved round reset transition (V6)`, not pushed; physical-device performance verification is pending (see "V6" below).** *(Until the V6 acceptance this sentence ended: "it is delivered in the working tree, uncommitted and not staged, and awaits the owner's visual acceptance (see \"V6\" below). V7 is not started.")* **2026-11-18, V7: the owner authorized V7 (reduced motion) after the V6 commit `232c554`; since 2026-11-18 it is visually approved by the owner (OS-follow behaviour; Q12's in-app toggle stays open) and committed locally as `feat(a11y): honor reduced motion preferences (V7)`, not pushed; physical-device validation is pending (see "V7" below). Phase 7 closeout (P7-C) is not authorized.** *(Until the V7 acceptance this sentence ended: "it is delivered in the working tree, uncommitted and not staged, and awaits the owner's review (see \"V7\" below). Phase 7 closeout is not started.")* *(Until the V5 acceptance this sentence ended: "it is delivered in the working tree, uncommitted and not staged, and awaits the owner's visual acceptance. V6 and V7 are not started.")* *(Until the V4 acceptance this sentence read: "V4 (F5 landing silt plume) is authorized (D1–D4), delivered in the working tree, uncommitted, and awaits the owner's visual acceptance. No Git operation and no V5 work until then.")* The status sentences that follow are the history up to R1; where they say "working tree", "uncommitted" or "not pushed" for a step listed in R1, R1 supersedes them. **P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted; A1.1 is in `ad9e959`; A1.2 is in `0de6d73`, accepted. A2 (sound bank and manifest) is in `03bb7dc`. A3 (sound settings store) is in `16a6a40`, accepted with documented limitations. A3.1 (sound settings subscriber failure hardening) is in `e70fa22`. The owner split A4 into A4a and A4b. A4a (the Audio Director core) is in `289b849` and A4a.1 (the loop startup correction) is in `d8ab112`; both are pushed to `origin/develop`, with no owner acceptance recorded. A4b (the audio session integration) is authorized and delivered in one local commit, not pushed, and awaits the owner's review.** **2026-11-16: E-X7 (Chain Snapped) is fully accepted by the owner; V1 (FX queue, camera shake hook, motion flag) is authorized and delivered in the working tree, uncommitted, and awaits the owner's review. V2 is not authorized.** **2026-11-16, later: V1 is committed as `a9bdf35`; V2 (F1 marine snow, F2 depth vignette) and the test-only correction D-T1 are authorized and delivered in the working tree, uncommitted, and await the owner's visual acceptance. V3 is not authorized.** **2026-11-16, closeout: the owner visually accepted the refined V2; separate V2 and D-T1 commits are prepared, not executed and not pushed. V3 is not authorized.** **2026-11-16, V3: V2 and D-T1 are committed locally (`3878865`, `0bd6ee2`), not pushed. The owner authorized V3 (F3 anchor wake, F4 release splash, Q10/V3 decisions 1–10); it is delivered in the working tree, uncommitted, and awaits the owner's visual acceptance. V4 is not authorized.** **2026-11-16, V3 closeout: the owner visually accepted V3; it is committed locally, not pushed. Owner priority change: A6 (licensed sound assets and final mix), then A5 (sound controls), with audio validation and listening QA, come before V4–V7, which are deferred, not cancelled. Next: a read-only A6 + A5 audit and completion plan; neither step is authorized for implementation. V4 is not started.** *(Until A4b, 2026-11-15, this read: "A4a.1 (the loop startup correction) is delivered in its own commit and awaits the owner's review. A4b is next and not authorized.")* *(Until A4a.1, 2026-11-15, this read: "A4a (the Audio Director core) is delivered in its own commit, not pushed, and awaits the owner's review. A4b is next and not authorized.")* *(Until A4a, 2026-11-15, this read: "A3.1 (sound settings subscriber failure hardening) is delivered and awaits the owner's review. A4 is next and not authorized.")* *(Until A3.1, 2026-11-15, this read: "A3 (sound settings store) is delivered and awaits the owner's review. A4 is next and not authorized.")* See "Current: Sprint 5 / TASK 008 / Phase 7" below. *(Until A3, 2026-11-15, this read: "A2 (sound bank and manifest) is delivered and awaits the owner's review. A3 is next and not authorized.")* *(Until A2, 2026-11-15, this read: "A1.2 (voice pools and protected loops) is delivered and awaits the owner's review. A2 is next and not authorized.")* *(Until A1.2, 2026-11-15, this read: "A1.1 (the `AudioManager` decode interface) is delivered and awaits the owner's review. A2 is next and not authorized.")* *(Until A1.1, 2026-11-15, this read: "**P7-0 (`0e7ff80`) and A1 (`3761062`) are done and accepted; A2 is next and not authorized.**")* *(Until the A1 acceptance, 2026-11-15, this read: "The owner approved the architecture; **only P7-0 (the blueprint) is authorized.**")*

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

## Also current: P8-0 — Phase 8 backend architecture planning — PROPOSAL DELIVERED (2026-11-18, documentation only, uncommitted), AWAITING THE OWNER'S REVIEW

*A separate documentation-only exception. It does not replace or edit the P7-C readiness-audit section below, and TASK 008 / Phase 7 remain the active task and phase.*

- **Authorization (owner, 2026-11-18):** P8-0 only — Phase 8 architecture planning as an explicit documentation-only exception while the Phase 7 close-out gates remain open. Phase 7 stays **IN PROGRESS**; no Phase 7 gate is waived or completed. **Phase 8 implementation is not authorized and not started.**
- **Deliverable:** `docs/09_BACKEND_ARCHITECTURE.md` (P8-0 PROPOSAL, not approved). Tracking lines in docs 04, 14 and 15.
- **Key findings:** E-RISK-1 (economy, OPEN, HIGH PRIORITY; conservative lower bound ≈ 7.26× the stake per round for a never-cash-out player; no RTP asserted or chosen; future task E-A proposed); client replica mode needs an engine exception (proposed E-X8); the world stream is outcome-relevant and must be committed.
- **Owner decisions needed:** OD-1 … OD-21 (docs/09 §31.3), first OD-1 (business model direction), OD-2 (play-money only), OD-3 (layout and package manager), OD-16 (authorize E-A).
- **Git:** verified before any change: branch `develop`, `HEAD` `01b061e`, five local commits ahead of `origin/develop` `d1ccb9b`, not pushed. P8-0 adds `docs/09` (untracked) and edits docs 04, 14, 15, 16 only. Nothing staged, committed or pushed.
- **Stop condition:** await the owner's review. No source change, staging, commit, push or Phase 8 milestone without the owner's approval.

## Also current: P8-0 review — architecture review and E-A preliminary — DELIVERED (2026-11-18, read-only, uncommitted), AWAITING THE OWNER'S REVIEW

- **Authorization (owner, 2026-11-18):** a narrowly scoped read-only verification. The owner has **not** approved the 21 P8-0 decisions. P8-1 is **not** authorized.
- **Report:** `docs/20_P8-0_REVIEW_AND_EA_PRELIMINARY.md`.
- **Key results:** E-RISK-1 is far larger than recorded in P8-0: never-cash-out return ≥ 117.4× (rigorous), ≈ 130.5× (estimate); P(floor) = 0.1612; every cashout rule is capped at 0.9603. Architecture: corrections K1–K14 (not applied to docs/09); OD-10b unnecessary; E-X8 not ready; new risks (selective voiding, receipt lag, construction-pinned fairness reference).
- **P8-1 blockers needing the owner:** B1 phase gate (Phase 7 still open); B2 commit the pending documentation first; B3 approve P1-D1 … P1-D13.
- **Git:** unchanged: `HEAD` `01b061e`, five local commits not pushed; nothing staged or committed.
- **Stop condition:** await the owner's review.

## Also current: P8-0E — P8-0 review acceptance and safe roadmap preparation — DELIVERED (2026-11-18, documentation only, uncommitted), AWAITING THE OWNER'S REVIEW

- **Owner decision (2026-11-18):** the review's economic findings are acknowledged (≈ 130.5×, ≥ 117.4× rigorous, P(floor) ≈ 16.12 %, under the documented assumptions). **The existing economic model is NOT approved for real-money operation. AQUADIVE stays PLAY-MONEY ONLY** until a separately authorized economic redesign, independent verification and the applicable compliance reviews are complete. Game mathematics are not modified.
- **Delivered:** the evidence in `qa/p8-0-review/` (local, Git-ignored); docs/09 errata (banner, pointers, §34 C1 – C12, §35 P8-1 table; original text unchanged); a proposed sequence of separate documentation-only commits (not executed).
- **Gates:** Phase 7 **IN PROGRESS**, TASK 008 stays the active task, P7-C not closed. Phase 8 **planning authorized, implementation not authorized**. **P8-1 may start only with an explicit owner phase-gate exception** while Phase 7 is open (docs/09 §35.1), plus approval of P1-D1 … P1-D13 and the documentation commits first. Full E-A not started. OD-1 … OD-21 not approved.
- **Git:** `HEAD` `01b061e`, five local commits not pushed; nothing staged, committed or pushed.
- **Stop condition:** await the owner's review.

## Also current: P8-1 — Versioned network protocol contracts (DRAFT v1) — DELIVERED (2026-11-18, working tree, unstaged and uncommitted), AWAITING THE OWNER'S REVIEW

*A narrowly scoped Phase 8 implementation exception. It does not replace or edit the sections above or below; TASK 008 / Phase 7 remain the active task and phase.*

- **Authorization (owner, 2026-11-18):** after reviewing the P8-0E documentation closeout (committed locally as `c110202`, `a96da57`, `6f2e2a7`, `c11ab64`), the owner authorized P8-1 only and provisionally approved P1-D1 … P1-D13 (docs/09 §35.2) for implementation as **DRAFT protocol v1**. OD-1 … OD-21 are **not** approved; the protocol is **not** frozen or released; no Phase 7 gate is waived. AQUADIVE stays **PLAY-MONEY ONLY**.
- **Delivered:** `src/protocol/` — a pure TypeScript library (zod only) defining the v1 draft envelopes, the full message catalogue (client, public, session, incl. `sync.snapshot`), identifiers, money and multiplier formats, the error registry, idempotency semantics, compatibility rules and a never-throwing codec; tests, a golden-frame corpus and a seeded fuzz generator. `src/protocol/README.md` is the as-implemented protocol documentation (envelopes, audiences, every message type, formats, errors, versioning, idempotency, deviations from docs/09 §8, deferred runtime responsibilities, measured performance).
- **Not implemented (by design):** authentication, sessions, rate limits, WebSocket networking, ordering, replay protection, idempotency storage, ledger, settlement, cashout authority, provable fairness. The protocol does not change or fix the game's economics (E-RISK-1).
- **Isolation:** nothing in the app imports the protocol; no engine, shared, rendering, UI, audio, dependency, lockfile or configuration change; the production build output is compared with `c11ab64` (docs/15 P8-1 entry).
- **Git:** verified before any change: branch `develop`, `HEAD` `c11ab64`, nine local commits ahead of `origin/develop`, clean tree. P8-1 adds untracked `src/protocol/` and edits docs 04, 14, 15, 16 only. **Nothing staged, committed or pushed.**
- **Stop condition:** await the owner's review. No staging, commit, push, P8-2 or any other milestone without the owner's approval.

### P8-1 acceptance refinement (owner decisions, 2026-11-18) — DONE IN THE WORKING TREE, AWAITING THE OWNER'S REVIEW OF THE FINAL REPORT

- **Owner decisions:** retain zod v3; tiered performance budget **OWNER-APPROVED PROVISIONAL** (docs/09 §36.2); clarify retryability before the first network client; preserve all security validation and canonical serialization; keep P8-1 uncommitted until the final report is reviewed. P8-1 only; the Phase 8 architecture as a whole is not approved; Phase 7 is not complete.
- **Changed:** `src/protocol/errors.ts` (typed `outcome` per code, carrier rule, `server-busy` `error`-only, new stored code `commit-timeout`, `classifyRequestResponse`), `index.ts` exports, comments in `codec.ts` and `messages/server-session.ts`, `security.test.ts` (stored-code list), new `errors.test.ts`, `README.md` (§9, §9.1, §11, §14, §16, §17, §19). docs/09 §36 added. No golden frame changed.
- **Performance:** measured, but not under controlled conditions (battery, owner's dev server running) → the tiered gate is **NOT VERIFIED** (docs/15).
- **Git:** `HEAD` `c11ab64`; nothing staged, committed or pushed.
- **Stop condition:** await the owner's review of the final report.

### P8-1 owner acceptance (2026-11-18) — ACCEPTED; ONE ISOLATED LOCAL COMMIT, NOT PUSHED

- **Decision:** P8-1 Draft v1 accepted after a final safety verification; `commit-timeout` approved only as a proven-final rejection (bet provably not included, debit rolled back or durably compensated), otherwise indeterminate (docs/09 §36.3). Performance gate **NOT VERIFIED**.
- **Final review fix:** an `error` frame never classifies as `final` (`classifyRequestResponse`); 2 tests added. Wire format unchanged.
- **Git:** one local P8-1 commit on `develop` on top of `c11ab64`; **not pushed**.
- **Stop condition:** P8-2 is not authorized. Await the owner.

## Also current: P8-2 — Server skeleton — ACCEPTED FOR LOCAL DEVELOPMENT ONLY (2026-11-18), COMMITTED LOCALLY, NOT PUSHED

*A narrowly scoped Phase 8 implementation exception. It does not replace or edit the sections above or below; TASK 008 / Phase 7 remain the active task and phase.*

- **Authorization (owner, 2026-11-18):** P8-2 only, with decisions A–D (docs/09 §37): A optional welcome snapshot (an explicitly approved P8-1 Draft v1 exception), B zod 3.25.76 consumed from the original protocol source with verified, deterministic resolution, C root ESLint unchanged, D npm and the pinned dependencies. No P8-3 or other milestone.
- **Delivered:** the protocol amendment (`src/protocol/messages/server-session.ts`, golden corpus, tests, README §20) and the independent package `server/` (`server/README.md` is the as-implemented record): health endpoints, configuration, logging with redaction, graceful shutdown, and a WebSocket gateway that performs `hello` → `welcome` only (no snapshot, no player) and refuses every other request before processing.
- **Not implemented (by design):** rounds, authentication, sessions, `sync.request`, `pong`, broadcasts, wallet, ledger, settlement, fairness, database, metrics. The game is not connected to the server.
- **Isolation:** no engine, shared, rendering, UI, audio, asset, root dependency, lockfile, configuration or deployment change; production build output unchanged against `402376c` (docs/15).
- **Acceptance (owner, 2026-11-18):** accepted for local development only, **not production-ready**; dependencies and the welcome amendment ratified (docs/09 §37). Security review and the temporary refusal semantics: `server/README.md` §11.
- **Git:** two isolated local commits on `develop` on top of `402376c`: the protocol amendment `060b18e`, then the server skeleton. **Not pushed.**
- **Stop condition:** P8-3 is not authorized. Await the owner.

## Also current: P8-3a — Fairness cryptographic foundation — ACCEPTED FOR LOCAL DEVELOPMENT (2026-11-18), COMMITTED LOCALLY, NOT PUSHED

*A narrowly scoped Phase 8 implementation exception. It does not replace or edit the sections above or below; TASK 008 / Phase 7 remain the active task and phase.*

- **Authorization (owner, 2026-11-18):** after the P8-3 readiness and zod security report, **P8-3a only** (seed chain and domain-separated cryptographic derivation) with decisions D1 – D12 (docs/09 §38). A development-only foundation; **not** approval to activate a publicly committed fairness scheme. P8-3b, P8-3c, P8-4 and later are not authorized.
- **Delivered:** `src/fairness/` (pure, engine-independent, injected crypto; `README.md` is the as-implemented record with the byte-level specification), its tests, test-only helpers, and one `.gitignore` rule for the local evidence folder `qa/p8-3-fairness/`. Docs 04, 09 (§38 + two pointers), 14, 15, 16.
- **Not implemented (by design):** `SeededRoundAuthority`, distribution tests, full-round verifier, server crypto adapter, chain store, persistence, endpoints, message handlers, gameplay wiring, beacon. Engine RNG, probabilities, RTP, wallet and settlement unchanged.
- **Owner acceptance (2026-11-18, docs/09 §38.1):** approved for local development with documented limitations; not production fairness certification. D7 Class A p95 ≤ 5 ms and Class B p99 ≤ 20 ms: target observed, gate not verified. Event-loop rule recorded.
- **Open:** secret lifecycle hardening, CommonJS server build of `.ts` imports (P8-3c proposal), public-salt source (D1), per-round beacon (D3), Node 22 reference run (D4; floor ≥ 22.18.0), D7 performance gate under controlled conditions, selective voiding and cashout receipt honesty (D10), zod S-1 (D12), E-RISK-1. fv = 1 stays internal and experimental (D11).
- **Git:** verified before any change: branch `develop`, `HEAD` `fd292bc`, twelve local commits ahead of `origin/develop`, clean tree, nothing staged. After the owner's acceptance: one isolated local commit `feat(fairness): add cryptographic seed foundation (P8-3a)` on top of `fd292bc`. **Not pushed.**
- **Stop condition:** P8-3b and P8-3c are not authorized. Await the owner. No push.

## Also current: P8-3b-0 + P8-3b — Secret lifecycle hardening and seeded round authority — ACCEPTED FOR LOCAL DEVELOPMENT (2026-11-19), COMMITTED LOCALLY, NOT PUSHED

*A narrowly scoped Phase 8 implementation exception. It does not replace or edit the sections above or below; TASK 008 / Phase 7 remain the active task and phase.*

- **Authorization (owner, 2026-11-18):** after the P8-3b implementation-readiness report, P8-3b-0 (secret lifecycle hardening R1 – R4) and P8-3b (seeded round authority and deterministic verification) with decisions D-B1 – D-B10 (docs/09 §39). Both stay unstaged and uncommitted until the owner's final review. P8-3c, P8-4 and later are not authorized.
- **Delivered:** P8-3b-0 in `src/fairness/` (four sources, `lifecycle.test.ts`, README §7); P8-3b as the new module `src/seeded-round/` (binding, authority, typed errors, redaction, README, tests, test-only reference runner and vectors); the `security.test.ts` boundary amendment; one `.gitignore` rule for `qa/p8-3b-authority/`. Docs 04, 09 (§39 + two pointers), 14, 15, 16.
- **Status:** **P8-3a completed** (`7124ec9`). **P8-3b-0 and P8-3b accepted for local development (2026-11-19); not production fairness certification.** **P8-3c not started. P8-4 not started.**
- **Not implemented (by design):** production RoundScript, reveal mechanism, public snapshots, broadcasting, endpoints, persistence, wallet or settlement processing, chain-index skipping or round voiding, server crypto adapter, chain store. Engine, probabilities, RTP and tuning unchanged.
- **Open:** remaining secret-lifecycle limitations (caller disposal, `KeyObject` lifetime, no guaranteed erasure), Node 22.18+ verification, zod S-1, E-RISK-1, public salt selection, fairness-version freeze, operational selective-voiding controls, controlled performance validation (D7 not verified), Phase 7 audio licensing, physical-device QA.
- **Git:** verified before any change: branch `develop`, `HEAD` `7124ec9`, 13 local commits ahead of `origin/develop`, clean tree, nothing staged. After the owner's acceptance: two isolated local commits on top of `7124ec9`: `afc54c8` `fix(fairness): harden secret lifecycle (P8-3b-0)`, then `feat(fairness): add seeded round authority and distribution tests (P8-3b)`. **Not pushed.**
- **Stop condition:** no push; P8-3c is not authorized.

## Current: P7-C READINESS AUDIT — NOT FINAL CLOSEOUT (2026-11-18, documentation only, uncommitted)

- **Authorization (owner, 2026-11-18):** after the V7 commit, a comprehensive Phase 7 closeout audit, documentation only. No commit, staging, push, merge or implementation; P7-C itself is not authorized.
- **Report:** `docs/19_PHASE7_CLOSEOUT_READINESS.md` (milestone matrix, audio rights matrix, device checklist, performance tiers, A5 / Q12, boundaries, gate matrix, remaining-work plan, owner decisions).
- **Git:** V7 committed locally as `01b061e`; five local commits (R1 `cede9be`, V4 `9bc714d`, V5 `dfe3342`, V6 `232c554`, V7 `01b061e`) ahead of `origin/develop` `d1ccb9b`; not pushed.
- **Result:** Phase 7 is **not** ready for P7-C. Blocked: audio commercial rights (no documentation for any shipped file) and physical-device QA (Q14 open). Not verified: performance (no GPU or device data). Undecided: the Q12 in-app toggle and the A5 volume sliders (neither waived). TASK 008 stays active.
- **Next:** the owner's review of the report and the decisions in its §14. **Stop condition:** no Git or implementation action without the owner's approval.

## V7 — reduced motion — VISUALLY APPROVED BY THE OWNER (2026-11-18); COMMITTED LOCALLY (`01b061e`), NOT PUSHED

- **Owner acceptance (2026-11-18):** **V7 — REDUCED MOTION: VISUALLY APPROVED BY THE OWNER**, exactly as implemented (OS-follow: detection, propagation to `SceneRenderer.setMotion`, live changes, listener cleanup and remount, SSR-safe initialization, CSS guards, each effect's existing reduced-motion behaviour). No source or visual value changed. **Not closed:** Q12's in-app "Reduce effects" toggle (open with A5). **Still pending:** physical-device validation. *(Until the acceptance this heading read: "Current: V7 — reduced motion — DELIVERED (2026-11-18, WORKING TREE, UNCOMMITTED, NOT STAGED), AWAITING THE OWNER'S REVIEW".)*
- **Final validation (2026-11-18):** as in docs/15, "V7": `tsc`, Vitest 1629/1629, changed-file ESLint and Prettier, build, SSR smoke and `git diff --check` pass; real-game browser checks re-run on the final tree (10/10 configurations (7 desktop sizes + 3 mobile-emulated with touch): the preference reaches the renderer before the first frame, live changes both ways, reload with reduce already set, a change while another tab was in front; 0 `setMotion` calls over about 120 idle frames; 0 page or console errors; computed DOM animations match the guards (`goldPulse` / `crashShake` in normal motion, `none` with the still glow under reduce). In 8 of 10 the `crash-shake` class had already left the multiplier when the harness sampled it 120 ms after detecting the crash (the class lasts only for the `crashed` phase; `MultiplierOverlay.tsx` unchanged since V6), so in this run the class-present-and-animation-`none` observation comes from 1280×720 and 1920×1080, as it did from all 10 in the earlier run and from `reduced-motion.css.test.ts`).
- **Authorization (owner, 2026-11-18):** the official V7 scope only (docs/08 §12, §13.2): `src/ui/session.ts` (`matchMedia` → `setMotion`), `src/styles.css` (guards) + tests. Any further production file needs a new scope request.
- **Delivered:** M `src/ui/session.ts` (`matchMedia` → `setMotion`), M `src/styles.css` (`prefers-reduced-motion` guards for `goldPulse` / `crashShake`); C `src/ui/session.motion.test.ts` (20 tests), C `src/ui/reduced-motion.css.test.ts` (6 tests); `.gitignore` (`qa/v7-reduced-motion/`); docs 08, 14, 15, 16. `attachCanvas` resolves `matchMedia("(prefers-reduced-motion: reduce)")` once per attach (never at session construction, so the server never touches `window`; injectable as `GameSessionDeps.reducedMotion`), calls the renderer's existing `setMotion({ reducedMotion })` before the first frame, and keeps it current through exactly one `change` listener per attached renderer (legacy `addListener` fallback for Safari < 14), removed by that attachment's detach. No per-frame work, no timer, polling or React state; without `window` or `matchMedia`, or if they throw, nothing is called and the renderer keeps full motion. The renderer and every effect are unchanged: each effect's approved reduced-motion behaviour (§4.3) now simply reaches the live game. CSS: under `prefers-reduced-motion: reduce` the multiplier's `goldPulse` stops and keeps goldPulse's resting glow as a still `text-shadow`, and `crash-shake` does not run; the normal-motion rules are byte-identical (Q11's "keep `crash-shake`" holds for normal motion).
- **Validation (2026-11-18):** `tsc` clean; Vitest 1629/1629 across 73 files (`--maxWorkers=2`; 26 new); ESLint and Prettier clean on the changed TypeScript files (`src/styles.css` already fails Prettier at HEAD, its existing style is kept); build and SSR smoke pass. Deterministic renderer harness, V7 working tree vs the V6 commit `232c554`, seven sizes × 8 effect scenes: normal 56/56 and reduced 56/56 frames pixel-identical (the renderer is unchanged). Real game in headless Chrome, 7 desktop sizes + 3 mobile-emulated (touch): the preference reaches the renderer before the first frame, live changes both ways, reload with reduce set, a change while the tab was hidden; 0 `setMotion` calls during idle frames; 0 console errors; the computed DOM animations match the guards. Frame cost (software raster) V6 vs V7 within noise in both modes; no device data.
- **Git:** committed locally as one commit, `feat(a11y): honor reduced motion preferences (V7)`, on top of V6 `232c554`; not pushed. V6 `232c554`, V5 `dfe3342`, V4 `9bc714d` and R1 `cede9be` unchanged. *(Until the acceptance: "V7 is unstaged and uncommitted; no push.")*
- **Open, for the owner:** the in-app reduced-motion override (Q12, open with A5) is not built — the OS setting alone decides; pre-existing and unchanged: the top-left multiplier stays gold at a crash in both modes (`text-gold` wins over `text-danger`; the CHAIN SNAPPED panel and the canvas mark the crash); CH1's chest-card hover transitions and the Radix/Tailwind utility animations are outside the V7 scope and unchanged; no physical-device test.
- **Next:** the Phase 7 closeout readiness audit (documentation only). P7-C is not authorized. *(Until the acceptance: "the owner's review of `qa/v7-reduced-motion/V7-compare.html`. No staging, commit or Phase 7 closeout until then.")*

## V6 — F7 round-reset fade — VISUALLY APPROVED BY THE OWNER (2026-11-18) — FINAL; COMMITTED LOCALLY, NOT PUSHED

- **Owner acceptance (2026-11-18):** V6 is visually approved as final: trigger `bettingOpened` through the existing FX queue; 0.40 s; colour `rgb(2, 12, 34)`; initial opacity 0.14; envelope 0.14 × (1 − t / 0.40)²; starts darkened and returns smoothly to normal; High = Low; off under reduced motion; no Canvas camera shake; no new clock or scheduler; the surface presentation unchanged. A subtle fade, not a full scene crossfade, as the owner understands and accepts. No source or visual value changed. **Still pending:** physical-device performance verification. *(Until the acceptance this heading read: "Current: V6 … DELIVERED (2026-11-18, WORKING TREE, UNCOMMITTED, NOT STAGED), AWAITING THE OWNER'S VISUAL ACCEPTANCE".)*
- **Git:** one local commit, `feat(rendering): add approved round reset transition (V6)`; not pushed. `qa/v4-silt-plume/`, `qa/v5-crash-fx/` and `qa/v6-reset-transition/` stay local and ignored.

- **Authorization (owner, 2026-11-18):** F7 only. **Trigger:** `bettingOpened` → the V1 FX queue's reset entry, stamped on the first frame of the surface view. **Animation:** starts darkened and fades to normal — opacity 0.14 on the first reset frame, then 0.14 · (1 − t / 0.40)² (quadratic ease-out, zero slope at the end), exactly 0 from 0.40 s; no fade-in, no second dip, no crossfade. **Colour:** `rgb(2, 12, 34)`. **Drawing:** one solid `fillRect` over the canvas viewport at that `globalAlpha`, last in the Effects layer, betting view only; the DOM controls above the canvas are not touched. High = Low; reduced motion: nothing. The two-file architecture extension is ratified for V6 only: `render-state.ts` (optional read-only `FxSettings.reset`) and `scene-renderer.ts` (`reset: null` and the handoff after `fx.update`). Any further production file needs a new scope request.
- **Delivered:** M `src/rendering/render-state.ts`, `scene-renderer.ts`, `layers/effects.ts`; C `layers/reset-fade.test.ts`; M `fx-queue.test.ts`, `scene-renderer.test.ts`; `.gitignore`; docs 08, 14, 15, 16. **Timing:** the FX queue is the only reset clock. `SceneRenderer` forwards the queue's own active reset entry to the layers as `FxSettings.reset` (`readonly reset?: { readonly elapsed: number } | null`; renderer-owned, never engine state) right after `fx.update(...)`; no second clock, timer or per-frame copy.
- **Validation (2026-11-18):** `tsc` clean; Vitest 1603/1603 across 71 files (`--maxWorkers=2`; 18 new in `layers/reset-fade.test.ts`, the V1 draw-equivalence pin in `fx-queue.test.ts` and two V2 settings pins in `scene-renderer.test.ts` updated for the visible reset); ESLint and Prettier clean on the changed files; build and SSR smoke pass. Deterministic harness against the V5 commit at seven sizes × High / Low / reduced: 399/399 unaffected frames pixel-identical; reset frames equal the V5 frame plus the fill at the envelope opacity (≤ 1.44 / 255 per channel from the computed blend); +0.4 s and later identical. Real game, seven sizes: one reset run per `bettingOpened` (9/9), first frame at elapsed 0, none on the initial load, no fade frame outside the betting view. Fill cost (software raster, headless Chrome): 0.14 ms (375×667) to 1.58 ms (1920×1080) mean, p95 0.3–2.3 ms; no device data. The first brightness step at the cut drops from ≈ +50 to ≈ +40 mean luma: softened, still visible.
- **Git (at delivery):** nothing staged or committed; no push. V5 `dfe3342`, V4 `9bc714d` and R1 `cede9be` unchanged.
- **Open, for the owner:** visual acceptance; whether the softening is enough (not a crossfade); physical-device performance; OS reduced motion reaches the renderer only with V7.
- **Next (at delivery):** the owner's visual review of `qa/v6-reset-transition/V6-compare.html`. No commit and no V7 until then. *(Superseded by the acceptance above.)*

## V5 — F6 crash visual effects — VISUALLY APPROVED BY THE OWNER (2026-11-18) — FINAL VALUES; COMMITTED LOCALLY, NOT PUSHED

- **Owner acceptance (2026-11-18):** V5 is visually approved with final values, including the optimized cached-vignette implementation: 12 High / 6 Low metallic fragments, the current steel-blue colours, the current deterministic movement and lifetime, the current subtle dark-blue vignette pulse, the full-resolution cached pulse bitmap (1:1 copy, resize/DPR handling, cache size limit, gradient fallback), one subtle static fading accent under reduced motion, no additional Canvas camera shake, the DOM multiplier `crash-shake` and E-X7 chain snapping unchanged. No source or visual value changed. **Still pending:** physical-device performance validation (all V5 timings are software-rasterized headless Chrome on the desktop). *(Until the acceptance this heading read: "Current: V5 … DELIVERED (2026-11-18, WORKING TREE, UNCOMMITTED, NOT STAGED), AWAITING THE OWNER'S VISUAL ACCEPTANCE".)*
- **Git:** one local commit, `feat(rendering): add accepted crash FX (V5)`; not pushed. `qa/v5-crash-fx/` and `qa/v4-silt-plume/` stay local and ignored.

- **Authorization (owner, 2026-11-18):** V5 with decisions **D1** (option A: no additional Canvas camera shake; the reserved hook stays at 0; the DOM multiplier `crash-shake` unchanged; no viewport movement), **D2** (≤ 12 High / ≤ 6 Low metallic fragments, short deterministic outward motion, subtle steel-blue and metallic highlights, controlled fade, no sparks or explosion), **D3** (a subtle, brief dark-blue vignette pulse on the break that never obscures the anchor, chain or multiplier), **D4** (reduced motion: no moving fragments, no shake, no animated pulse; at most one static accent that fades) and **D5** (E-X7, the DOM crash-shake, V1, V2, V3, V4 and CH1 preserved). The E-X7 snapped-chain animation is unchanged.
- **Delivered:** C `src/rendering/draw/crash-fx.ts`, `crash-fx.test.ts`; M `src/rendering/layers/effects.ts`; Phase 7 docs. Within the ratified §13.1 V5 scope; no file outside it. Spec: docs/08 §4.3 "F6 as implemented"; record: docs/15, "V5".
- **Validation (2026-11-18):** `tsc` clean; Vitest 1578/1578 across 70 files; ESLint and Prettier clean on the changed source; build and SSR smoke pass; 231/231 unaffected frames pixel-identical to the V4 commit at seven sizes (High, Low, reduced motion); shake offset 0 on every frame; real-game screenshots at seven sizes. Review: `qa/v5-crash-fx/V5-compare.html` (local, untracked, not staged).
- **Performance refinement (owner authorization, 2026-11-18; working tree, uncommitted, not staged):** the visual design is kept (12 High / 6 Low fragments, the pulse, reduced motion, no Canvas shake, the DOM `crash-shake` and E-X7 unchanged). The vignette pulse is now rasterized once per canvas pixel size into a cached offscreen bitmap and copied 1:1 with the pulse strength as `globalAlpha`; rebuilt on resize or DPR change, kept per canvas context (WeakMap), direct gradient fill without a document or above 3840×2160 device px. Files: M `src/rendering/draw/crash-fx.ts`, `crash-fx.test.ts` (7 new tests); `.gitignore` gains `qa/v5-crash-fx/`. Software-raster headless Chrome, High, mean: vignette 14.97 → 1.47 ms at 1920×1080 DPR 1, 63.84 → 6.29 ms at DPR 2, 9.91 → 1.03 ms at 390×844 DPR 2; whole-frame increment over V4 +14.87 → +2.24 ms (1920×1080 DPR 1), +72.44 → +9.73 ms (DPR 2). Visual difference from V5 before: at most 1/255 per channel, only on pulse frames, none in the clear zone; 231/231 unaffected frames identical to V4. Record: docs/15, "V5 performance refinement". Review: `qa/v5-crash-fx/V5-compare.html`, "Performance" view.
- **Validation after the refinement (2026-11-18):** `tsc` clean; Vitest 1585/1585 across 70 files (`--maxWorkers=2`); ESLint and Prettier clean on the three source files; `git diff --check` clean; build and SSR smoke pass; 447 frames compared (7 sizes DPR 1 + 390×844 / 1920×1080 DPR 2), 0 unexpected; shake offset 0 on every frame; real-game screenshots at seven sizes.
- **Open, for the owner:**
  - visual acceptance of the provisional values (fragment size, count and reach; pulse strength 0.26 and length 0.6 s; the reduced-motion glint). The fragments are small at desktop sizes.
  - physical-device performance (not measured; all numbers are software-rasterized headless Chrome). The bitmap costs w × h × 4 bytes per canvas (≈ 5.3 MB at 390×844 DPR 2, ≈ 33 MB at 1920×1080 DPR 2) while the renderer lives; its first build (one gradient fill) lands on the first pulse frame after load or resize.
  - *(Resolved by the refinement: "whether `qa/v5-crash-fx/` should get its own `.gitignore` rule" — it has one now; and the pulse cost item, now measured before/after above.)*
- **Next:** *(resolved 2026-11-18: the owner's visual acceptance, above.)*

## V4 — F5 landing silt plume — VISUALLY ACCEPTED BY THE OWNER (2026-11-18); COMMITTED LOCALLY, NOT PUSHED

- **Owner acceptance (2026-11-18):** V4 is visually approved exactly as implemented — touchdown-synchronized appearance, ≈ 1.0 s lifetime, at most 12 High / 6 Low puffs, one static fading puff under reduced motion, the current sand colour, opacity, movement and spread. These values are final; no source or visual value changed. The `particles.test.ts` adjustment below is authorized. **Still pending:** physical-device performance validation. *(Until the acceptance this heading read: "Current: V4 … DELIVERED (2026-11-17, WORKING TREE, UNCOMMITTED), AWAITING THE OWNER'S VISUAL ACCEPTANCE".)*
- **Git:** R1 committed first as its own documentation-only commit; then one local V4 commit, `feat(rendering): add accepted landing silt plume (V4)`, not pushed. `qa/v4-silt-plume/` (≈ 87 MB of review captures) is ignored by a one-line `.gitignore` rule and stays local.

- **Authorization (owner, 2026-11-17):** V4 with decisions **D1** (start when the anchor visually touches the sand, the same instant as the corrected floor-thud, not at the earlier `shipImpact`), **D2** (lifetime ≈ 1.0 s instead of 1.5 s, provisional until visual approval; the chest overlay appears 1.4 s after impact), **D3** (jackpot sea-floor landing only) and **D4** (a narrow `SILT_FX_THEME` token). File scope ratified: C `src/rendering/draw/landing-fx.ts`, `landing-fx.test.ts`; M `src/rendering/layers/actor.ts` (touchdown helper export only), `layers/effects.ts`, `theme.ts` (token only), Phase 7 docs. No dependency, engine event, RNG, wallet or settlement change.
- **Delivered:** the files above, plus three lines in `src/rendering/draw/particles.test.ts` (the V3 test "leaves the jackpot impact burst exactly as before" now expects the plume under the burst on jackpot frames). That test file is **outside the ratified list**; reported to the owner. Record: docs/15, "V4"; spec: docs/08 §4.3 "F5 as implemented".
- **Touchdown:** `anchorTouchdown(camera)` in `actor.ts` runs the existing `applyLanding` on a scratch pose from the pinned diving pose and returns its drop time and the sand point under the tip (`seaFloorRestPoint`). No second landing formula; the drawn landing is unchanged. A test pins it equal to `anchorTouchdownSeconds` (the audio host's floor-thud timing) at all seven sizes.
- **Validation (2026-11-18):** `tsc` clean; Vitest 1551/1551 across 69 files (`--maxWorkers=2`); ESLint and Prettier clean on the changed files (`theme.ts` keeps its stored CRLF baseline); build and SSR smoke pass; 231/231 unaffected frames pixel-identical to `HEAD` at seven sizes (High, Low, reduced motion); real-game screenshots at seven sizes at +0.1 / +0.5 / +0.9 s; plume cost about 0.4–0.8 ms p95 at 1920×1080 and 1.1 ms p95 at 390×844 DPR 2 (software-rasterized headless Chrome). Details: docs/15, "V4".
- **Open:** physical-device performance (not measured); the 390×844 DPR 2 timing (1.1 ms p95, not shown below 1 ms). *(Until the acceptance this also listed the visual acceptance of the provisional values and the out-of-scope test edit; both are resolved by the owner.)*
- *(Until the acceptance: "**Next:** the owner's visual acceptance. **Stop condition:** no staging, commit, push, merge, rebase or reset; V5 not started.")*

## R1 — Phase 7 documentation reconciliation with Git (2026-11-17, documentation only)

- **Verified before any change:** branch `develop`; `HEAD` `d1ccb9b` = `origin/develop`; the only local changes were these four documents.
- **Pushed history:** A4b `f668d49`; E-X6 `2c4d4bf`; E-X7 `c66c279`; V1 `a9bdf35`; V2 `3878865`; D-T1 `0bd6ee2`; V3 `a9e9fdd`; **A6, A6.1, A-OWN (with A-OWN.1 and A-OWN.2), M-OWN and IOS-AUDIO `6133636`**; **LA1 `b5701c6`**; **CH1 and BET-1x2 `d1ccb9b`**. The sections below headed "WORKING TREE, UNCOMMITTED", "COMMITTED LOCALLY" or "NOT PUSHED" (LA1, A-OWN, M-OWN, A6.1, A6, V3, V2, V1, E-X7, E-X6) are historical for their Git status; their other content stands.
- **Historical exception:** `6133636` and `d1ccb9b` each combine several logical steps, against the one-commit-per-step plan (docs/08 §12). They are pushed, so they are not rewritten, amended, squashed, reset or rebased (AGENTS.md).
- **Owner acceptance:** CH1 and F8, visually approved 2026-11-17 (below).
- **A5:** the SOUND and MUSIC switches (LA1) satisfy the sound-control interface the owner currently requests and are recorded as implemented. Optional volume sliders and the in-app reduced-motion toggle stay open and are tracked separately. Neither the complete audio QA nor the licensing work is closed.
- **Still pending:** listening acceptance of A6, A-OWN, M-OWN and BET-1x2; the physical-iPhone test (LA1, IOS-AUDIO); physical-device and performance QA (Q14); rights confirmations (CREDITS §6, §8, §9.5); ratification of the LA1 `src/rendering/assets.ts` loader change.

## CH1 — premium bonus chests and centred multiplier reveal — VISUALLY APPROVED BY THE OWNER (2026-11-17); COMMITTED IN `d1ccb9b`, PUSHED

- **Owner acceptance (2026-11-17):** CH1 is visually approved for design and behaviour as reviewed: the three chests, their colours and positions, the selected-chest opening, the centred gold multiplier, the reveal animations and gold FX, and settlement behaviour are approved as implemented and are to be preserved unchanged. The open question below about the outer chests' three-quarter view is resolved: they stay as implemented. Not covered: a physical-device check and performance measurement (none recorded). *(Until the approval this heading read: "Current: CH1 … DELIVERED (2026-11-17, WORKING TREE, UNCOMMITTED), AWAITING THE OWNER'S VISUAL ACCEPTANCE".)*
- **Git (verified 2026-11-17):** CH1 is in `d1ccb9b` ("feat(ui): add animated chest reveal and audio polish", made outside this agent's sessions, co-authored with Copilot), on `origin/develop`. That commit also contains **BET-1x2**: BET 2 plays the approved `bet-clink-1` (one play per slot per frame); `bet-clink-2` is kept behind `{ betClink2: true }` and not loaded (`src/audio/director.ts`, director and host tests). BET-1x2 is not recorded in docs 08, 14 or 15. It cannot be split out without rewriting pushed history, which AGENTS.md forbids.

- **Authorization (2026-11-17):** the owner's treasure chest redesign instruction, with three reference images (red front-on, blue and green three-quarter). Conflicts were reported before any code and the owner chose to proceed as a new step: CH1 supersedes the 2026-11-15 acceptance that the Bonus Chest is "not to be redesigned", and pulls F8 (chest burst) forward out of V6, which stays deferred with F7 only. Art method: hand-built SVG (owner choice), no image assets. The uncommitted audio work in the tree (`src/audio/director*`, `src/ui/audio-host*.test.ts`) is not part of CH1 and was not touched.
- **Delivered:** C `src/ui/components/TreasureChestArt.tsx`, `ChestReveal.tsx`, `ChestBurst.tsx`, `chest-fx.ts`, `src/ui/screen.chests.test.tsx`; M `src/ui/components/ChestPicker.tsx`, `icons.tsx` (old chest art removed), `src/ui/strings.ts` (`chests.revealCaption`), `src/styles.css` (CH1 block), `src/ui/screen.characterization.test.tsx` (one outline pin: the two new reveal text nodes).
- **Behavior:** chest colours by id (1 ruby, 2 sapphire, 3 emerald); the outer chests are drawn in a three-quarter view facing the centre. The picked chest (the engine's `chosenChestId`) pops, gets a gold halo and a 12-glint burst, and its lid flips open onto a treasure heap with glow and rays; the other two stay closed, dimmed and scaled back. The multiplier appears large and centred in gold (gradient text, glow, rays, one shine sweep, 4 sparkles) inside a `role="status"` region; the chest's label plate shows "+m×" as before (accessible names unchanged). Everything is one-shot within the 2.2 s result window. Under `prefers-reduced-motion` there are no glints or animations; the open state shows statically.
- **Validation:** `tsc` clean; Vitest 1521/1521 across 68 files (`--maxWorkers=2`), including 5 new CH1 tests (each chest opens only itself, the status region shows its value, the glint cap); ESLint 0 problems and Prettier clean on the changed TS/TSX files (`styles.css` was already not Prettier-clean at HEAD); build passes. Headless Chrome (dev server, real clicks, seabed rounds forced by test-page instrumentation): 1280×720 picks 1/2/3, 375×667 picks 1/2/3, 390×844 with reduced motion; correct chest opened every time, the other two closed, value centred, no horizontal overflow.
- **Open, for the owner:** visual acceptance on a real phone; whether the outer chests should stay three-quarter or all face front; the CH1 commit (kept apart from the audio work).
- **Next:** owner review. **Stop condition:** no Git operation.

## Current: LA1 — loading screen, SOUND/MUSIC switches, iPhone music — DELIVERED (2026-11-17, WORKING TREE, UNCOMMITTED), AWAITING THE OWNER'S iPHONE TEST

- **Authorization (2026-11-17):** the owner's LA1 instruction: a premium measured loading screen with START GAME, two independent audio buttons under the balance (SOUND: effects + ocean ambience; MUSIC: `music-main.mp3` only), and an audible soundtrack on iPhone Safari while keeping the silent-mode policy where technically possible, without undocumented APIs. No gameplay, RNG, wallet, settlement or artwork change. No Git operation.
- **Delivered:** startup controller and screen (docs/07 §24); `soundOn`/`musicOn` in the existing settings store; host bus mapping, `preload()`, `unlock()`, `deferGestureUnlock()`, loading store; director `setMusicEnabled`; iOS `navigator.audioSession.type = "ambient"` (docs/08 §7.6 "LA1"); session `whenFrameRendered`; image loader status/retry. Record: docs/15, "LA1".
- **Validation:** `tsc` clean; Vitest 1506/1506 across 67 files (`--maxWorkers=2`); ESLint 0 problems and Prettier clean on the 23 LA1 files; build passes; SSR smoke passes (HTTP 200, canvas, loading screen at 0 %, inert game). Headless Chrome (dev server, real clicks and taps): desktop 15/15, phone sizes 8/8, failures 6/6, slow network 3/3, backgrounding 3/3, scripts-fail fallback 1/1, emulated iPhone 3/3 and 3/3. **Not tested on a physical iPhone.**
- **Open, for the owner:** (1) the iPhone test (steps in the LA1 report); (2) with "ambient", Silent Mode silences the soundtrack too, and other apps' audio mixes under the game instead of pausing; (3) iOS before 16.4 gets no music (notice shown); (4) `src/rendering/assets.ts` (loader only) needs ratification as a renderer exception; (5) "Continue anyway" after a failed texture starts on vector fallbacks; (6) the header is 24 px taller on phones.
- **Next:** the owner's iPhone test and acceptance. **Stop condition:** no Git operation; do not start A5 or V4–V7.

## Current: A-OWN — owner-supplied sound effects and ambience integrated — DELIVERED (2026-11-17, WORKING TREE, UNCOMMITTED), AWAITING THE OWNER'S LISTENING FEEDBACK

- **Authorization (2026-11-17):** the owner's audio integration instruction: integrate every validated owner upload, disable `tension-creak-1`, `tension-creak-2` and `chain-rattle` in normal play, keep `chain-unspool` and `chain-snap`, `AUDIO_MIX.ambience` 0.20 (provisional), keep `music-main.mp3` and its streaming unchanged. No staging, commit, push or merge. A5 and V4–V7 are not started.
- **Delivered:** 14 owner recordings, byte-identical to the uploads, in `src/assets/audio/owner/` (uploads kept unchanged in `src/audio/candidates/`); manifest URLs, loudness-matched provisional gains and the beds' loop points; the director's `{ tensionCreaks }` option (default off) and `DISABLED_CUES_BY_DEFAULT`, which the host does not load; `AUDIO_MIX.ambience` 0.2; `CREDITS.md` §9. No upload for `crash-boom`, so the A6 boom stays. Record: docs/15, "A-OWN".
- **Validation:** `tsc` clean; Vitest 1376/1376 across 59 files (`--maxWorkers=2`); ESLint at baseline (changed files clean); Prettier clean on changed files; build passes; SSR smoke passes; in the real game (dev server, headless Chrome 157, real clicks, 13 rounds) every mapped owner file played on its event, no creak or rattle was fetched or played, one context, one music element, no duplicate fetch.
- **Open, for the owner:** (1) listening feedback; (2) the surface bed is about 20 dB quieter in the game than the A6 bed was (measured about −50 dBFS RMS with music and sfx at 0); (3) the 14 files exceed the docs/08 §9 budgets (3.29 MB download, about 68 MiB decoded, mostly the two stereo beds), which also departs from M-OWN D7; (4) file-level observations in CREDITS §9.4 (clipping in `water-splash` and `floor-thud`, 470 ms lead-in on `goldfish-chime`); (5) the rights of the recordings are unknown (CREDITS §9.5); (6) no Safari, Firefox or physical-device test.
- **Git:** kept apart from A6, A6.1 and M-OWN. The tracked-file diff before A-OWN is in `.git/aquadive-pre-a-own-baseline.patch` and the A-OWN delta alone in `.git/aquadive-a-own.patch` (both local, untracked); the A-OWN files are listed in docs/15.
- **A-OWN.1 (2026-11-17, owner report: sea-floor thud inaudible, splash missing):** delivered in the working tree. `floor-thud` now lands on the drawn anchor's touchdown (it played up to 0.7 s early, under the jackpot stinger) and plays at 0.55; `water-splash` at 0.32. Record: docs/15, "A-OWN.1"; CREDITS §9.6.
- **A-OWN.2 (2026-11-17, owner report: goldfish chime too late):** delivered in the working tree. The upload's 456 ms of leading silence is cut at MP3 frame boundaries (no re-encode) in `owner/goldfish-chime-trimmed.mp3`; pickup → audible 477–483 ms before, 21–25 ms after (real game, Chrome and Edge). Record: docs/15, "A-OWN.2"; CREDITS §9.7.
- **Next:** the owner's gameplay listening feedback. **Stop condition:** no Git operation; do not start A5 or V4–V7.

## Current: M-OWN — main soundtrack, streamed — DELIVERED (2026-11-17, WORKING TREE, UNCOMMITTED), AWAITING THE OWNER'S LISTENING ACCEPTANCE

- **Authorization (2026-11-17):** owner decisions D1–D9 after the M-OWN technical report (docs/08 §1.1). The owner-supplied MP3 is the selected main soundtrack. No staging, commit, push or merge. A5 and the visual phases are not started. The three-stem adaptive music (M1–M3) is deferred.
- **Delivered:** `src/assets/audio/music-main.mp3` (the owner's bytes; SHA-256 verified; the copy in `src/audio/` removed); `AudioManager.stream()` (one media element, one source node, the `music` bus, native looping, lazy creation inside the first unlock gesture); the director's music stream and ducking; `AUDIO_MIX.music` 0.5; the provenance record (CREDITS §8). Record: docs/15, "M-OWN".
- **Validation:** `tsc` clean; Vitest 1339/1339 across 59 files (`--maxWorkers=2`); ESLint at baseline (changed files clean); build passes; SSR smoke passes; in the real game in headless Chrome 157 and Edge 157: one context, one player, one media source, no restart across rounds, ducking seen, no console error.
- **Open, for the owner:** (1) listening acceptance; (2) the loop point has a measured 20–25 ms gap in Chrome and Edge — reported, no other looping strategy implemented (D2); (3) Q15: the design cannot respect the iOS silent switch, so music is off on iOS and iPadOS until the owner selects an alternative (docs/08 §7.6); (4) commercial-use rights of the soundtrack are not verified (D6); (5) no physical-device test was done.
- **Git:** kept apart from A6 and A6.1. A snapshot of the working tree before M-OWN is in `.git/aquadive-a6-baseline.patch` (local, untracked), so the three pieces can be committed separately.
- **Next:** the owner's listening pass. **Stop condition:** no Git operation; do not start A5 or the visual phases; do not change the looping strategy or the iOS behaviour without an owner decision.

## Current: A6.1 — continuous chain rattle disabled by default DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED)

- **Authorization (2026-11-16):** owner music architecture decisions 1–9 (docs/08 §1.1); Q8's deferral superseded; A6.1 only.
- **Delivered:** the director plays no `chain-rattle` unless built with `{ chainRattle: true }`; the host does not load it. Manifest entry, file, values and rattle tests kept. Details in `docs/15_PROGRESS.md`.
- **Git:** A6.1 is kept apart from the A6 asset work, which still awaits the owner's listening acceptance; nothing staged or committed.
- **Next:** the owner's review. **Stop condition:** do not stage, commit or push; do not start M1, M2, M3 or A5.

## Current: A6 — Original sound design DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING THE OWNER'S LISTENING APPROVAL

- **Authorization (2026-11-16):** owner decision Q5, 100% original sound design; A6 production and integration (docs/08 §1.1). No Git operation before the listening acceptance. A5 and V4–V7 are not started.
- **Delivered:** 18 original cues in `src/assets/audio/` (local synthesis, AAC-LC `.m4a`, mono, 48 kHz; 897 565 bytes; about 13.9 MB decoded), `CREDITS.md`, the production scripts, the manifest wiring (URLs, gains, loop points), `AUDIO_MIX` (ambience 0.5, sfx 0.7), the test fixtures and the documents. Record: docs/15, "A6".
- **Validation:** `tsc` clean; Vitest 1208/1208; ESLint at baseline; build passes; SSR smoke passes; every file decodes in Chrome and Edge; all 18 cues play in the real game in headless Chrome.
- **Open:** the owner's listening pass; real-device listening (iPhone Safari, Android Chrome); the rights confirmations in `src/assets/audio/CREDITS.md` §6; Q6 stays pending device validation.
- **Next:** the owner's listening approval. **Stop condition:** do not stage, commit or push; do not start A5; do not resume V4–V7.

## Current: V3 — F3 anchor wake and F4 release splash OWNER-ACCEPTED (2026-11-16); COMMITTED LOCALLY, NOT PUSHED. NEXT: A6 + A5 AUDIO AUDIT (READ-ONLY)

*(Heading until the closeout: "Current: V3 — F3 anchor wake and F4 release splash DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING OWNER VISUAL ACCEPTANCE".)*

- **Closeout (2026-11-16):** the owner visually accepted F3 and F4 (option A) exactly as implemented; all V3 values are final. One local commit, `feat(rendering): add anchor wake and release splash (V3)`, with exactly the nine V3 files; not pushed, not merged.
- **Owner priority change** (2026-11-16, at the V3 closeout): the remaining audio work comes next — **A6** (licensed sound assets and final mix), then **A5** (sound controls UI), with the audio validation and listening QA — and **V4–V7 are deferred until it is complete; they are not cancelled**, and their scopes, effects and open decisions are unchanged. A6 and A5 are **not authorized for implementation**: a read-only audit and an A6 + A5 completion plan come first.

- **Authorization (2026-11-16, Q10/V3 decisions 1–10; docs/08 §1.1):** F3 approved; F4 option A (the anchor stays where it rests; a subtle disturbance at the hawse hole and the waterline); no droplets or other new effects over the hull above the water, only the faint upper half of the ripple; pure depth-driven rendering, no FX event, no session or FX-queue change; waterline option A (`WATERLINE` exported from `draw/ship.ts`, ship drawing unchanged); both effects end at once on crash, cashout/landing and bonus; F3 fades in over `launchProgress` 0.5 → 1; reduced motion hides both; Low uses the reduced counts. Not authorized: engine, RNG, wallet, settlement, shared contracts, session, audio, FX queue, camera, E-X6/E-X7, V1/V2 values, anchor or chain drawing, dependencies. No stage, commit, push or merge. V4 not started.
- **Repository state at the start:** `HEAD` = `0bd6ee2` (D-T1) on `3878865` (V2), both local; `origin/develop` = `a9bdf35` (V1). Tree clean.
- **Delivered:** `src/rendering/draw/particles.ts` (F3 and F4 appended; V1/V2 code and values untouched), `draw/particles.test.ts` (22 tests appended, including the Effects-layer integration), `layers/effects.ts` (F3/F4 first, diving only; the jackpot block unchanged), `theme.ts` (`WAKE_FX_THEME`; CRLF kept), `draw/ship.ts` (`export` of `WATERLINE` and its comment only), docs 08 and 14–16. Values: docs/08 §4.3 "as implemented" rows. Record: docs/15, "V3".
- **Validation:** `tsc` clean; Vitest 1180/1180 across 56 files (`--maxWorkers=2`); ESLint and Prettier clean on the changed LF files; production build passes. Visual QA (headless Chrome, real `SceneRenderer` and assets, `HEAD` vs working tree): 210 must-match frames 0 px different (pre-dive, betting view with a stale depth, dive at 0, crash, cashout, jackpot, reduced motion; seven sizes × High / Low / reduced). Real-game screenshots at 390×844, 375×667 and 1920×1080.
- **Provisional tuning during V3 (inside the authorized limits):** the first QA showed F3 bubbles hidden on the chain links and F4 rings invisible on the white hull, so the side offset went 2–7 → 7–12 px and the ring became a water blue at peak 0.5 / 0.4 (visible ≈ 0.36 / 0.29). Counts, sizes, bubble alpha, timing and geometry unchanged.
- **Next:** the read-only A6 + A5 audit and completion plan (docs/08 §7.3, §8, §12, §13.2, §15.1). **Stop condition:** do not push; do not implement A6 or A5 before the owner approves the plan's inputs and scope; do not start V4. *(Until the closeout: "the owner's visual review of V3. **Stop condition:** do not stage, commit or push; do not start V4.")*

## V2 — F1 marine snow and F2 depth vignette OWNER-ACCEPTED (2026-11-16); COMMITTED LOCALLY (`3878865`, D-T1 `0bd6ee2`), NOT PUSHED

*(Heading until V3: "Current: V2 — F1 marine snow and F2 depth vignette OWNER-ACCEPTED (2026-11-16); GIT CLOSEOUT PREPARED, NOT COMMITTED".)*

- **Authorization (2026-11-16):** Q10 for F1 and F2 only; D-V2-1 to D-V2-7 (docs/08 §1.1); test-only correction D-T1; no engine, shared, audio, wallet, ship, anchor, chain, sea-floor or `layers/background.ts` change; no dependency; no Git operation.
- **Delivered (V2):** `src/rendering/draw/particles.ts` (new), `draw/particles.test.ts` (new), `layers/environment.ts`, `theme.ts`, `render-state.ts` (FX argument), `scene-renderer.ts` (forwarding), `scene-renderer.test.ts` (V2 block), `fx-queue.test.ts` (one superseded V1 pin), docs 08 and 14–16. Both effects are absent at `depthRatio` 0; all values provisional. Record: docs/15, "V2".
- **Delivered (D-T1, separate):** `layers/chain-snap.test.ts`, "never stretches": about 2.4 s → 0.2 s, same tolerances.
- **Repository note:** V1 was already committed as `a9bdf35` when the step began (not by this agent); the working tree holds V2 and D-T1 only.
- **V2 refinement (2026-11-16, owner-requested; values still provisional, D-V2-6):** the first V2 values were barely perceptible, so the owner set a "Balanced" provisional set. F1: alpha 0.18–0.40, radius 1.1–2.2 CSS px, full visibility at `depthRatio` 0.10 (caps 48/24, motion, parallax and reduced motion unchanged). F2: up to 0.60, full at 0.45, clear centre 0.30, p^1.6 falloff, tone rgb(0, 3, 10). Changed: `draw/particles.ts` (constants, profile, `DEPTH_VIGNETTE_FALLOFF`), `theme.ts` (`DEPTH_VIGNETTE_TONE`), `draw/particles.test.ts` (values; no assertion removed). Full record: docs/15, "V2 refinement".
- **Accepted (owner, 2026-11-16):** the refined values are visually approved and final (D-V2-6 closed for F1 and F2). Record: docs/15, "V2 — owner visual acceptance".
- **Next:** the owner's go-ahead for the two prepared commits (V2, then D-T1). **Stop condition:** do not push; do not start V3. *(Until the acceptance: "Next: the owner's visual review of the refined V2. Stop condition: do not stage, commit or push; do not start V3.")*

## V1 — FX queue, camera shake hook and motion flag DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING OWNER REVIEW

- **Authorization (2026-11-16):** the owner accepted E-X7 and authorized V1 (docs/08 §1.1): infrastructure only, no visible effect; one crash timestamp shared with E-X7; no engine, shared, audio, E-X6 or E-X7 change; no Git operation.
- **Delivered:** `src/rendering/fx-queue.ts` (new), `fx-queue.test.ts` (new), `camera.ts`, `scene-renderer.ts`, `scene-renderer.test.ts` (V1 block appended), `src/ui/session.ts`, `src/ui/session.fx.test.ts` (new), docs 08 and 14–16. The queue's crash entry reads the E-X7 chain-snap break time every frame; the camera shake offset is 0; reduced motion defaults to false; quality defaults to `"high"`; the session forwards `crashed` / `bettingOpened`. Draw-call equivalence with the pre-V1 renderer verified. Record: docs/15, "V1".
- **Repository note:** during the step the owner committed the E-X6/E-X7 work as `c66c279` (local, not pushed). V1 is uncommitted and unstaged on top of it.
- **Next:** the owner's review of V1. **Stop condition:** do not stage, commit or push; do not start V2.

## E-X7 — Chain Snapped animation DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), VISUALLY REVIEWED AND FULLY ACCEPTED BY THE OWNER 2026-11-16

*(Until the acceptance this heading read "Current: E-X7 … AWAITING OWNER VISUAL REVIEW", and its last bullet read as below.)*

- **Authorization (2026-11-16):** rendering-only exception E-X7 (docs/08 §13.4); 2.4 s engine crash timing unchanged; no UI, engine, shared, audio, anchor-drawing, ship or asset change.
- **Delivered:** the chain breaks four links above the anchor at the first rendered crashed frame; anchor and links fall away (or land near the floor); the upper chain recoils, whips and settles by 2.3 s. Files: `render-state.ts`, `scene-renderer.ts`, `scene-renderer.test.ts` (new), `layers/actor.ts`, `layers/chain-snap.ts` (new), `layers/chain-snap.test.ts` (new), `draw/chain.ts`, `draw/chain.test.ts`, docs 08, 14–16. Record: docs/15, "E-X7".
- **Coexists with** the uncommitted E-X6 S3 refinement below (untouched).
- **Next:** the owner's visual review. **Stop condition:** do not commit or push; no V1 or other Phase 7 work.

## Current: E-X6 — Ship visual replacement, S3 refinement DELIVERED, S4 lamp CANCELLED AND REMOVED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING OWNER REVIEW

*(Until the S4 cancellation this heading read: "E-X6 — Ship visual replacement, S3 refinement + S4 amber lamp DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING OWNER REVIEW".)*

- **S4 cancelled (owner, 2026-11-16):** the amber lamp — drawing, glow, blink logic, constants and tests — is removed from `src/rendering/draw/ship.ts` and `draw/ship.test.ts`; no lamp asset ever existed. The flag stays cancelled (S5). Kept: S1, S2, S2.1 and S3 with its refinement (shine 0.50 above / 0.35 below the water, 7 s cycle). Uncommitted changes against `2c4d4bf`: the S3 refinement in those two files and docs 14–16.
- **Next:** the owner's review. **Stop condition:** do not commit or push; do not start S6.

*(Bullets of the S3 refinement + S4 delivery, kept as written; the S4 parts are superseded:)*

*(Until this step the heading read: "E-X6 — Ship visual replacement, S3 shine overlay DELIVERED (2026-11-16, WORKING TREE, UNCOMMITTED), AWAITING OWNER REVIEW". S1–S3 and S2.1 were since committed in `2c4d4bf` and pushed — not by this agent; `HEAD` = `origin/develop` = `2c4d4bf`.)*

- **Authorization (2026-11-16):** S3 refinement (shine peak 0.50 above the water surface, 0.35 below, same 7 s phase) and S4 (exactly one amber lamp at the reference position, one on/off cycle every 2 s: lit 0.00–0.15 s, held to 0.85 s, out by 1.10 s, off to 2.00 s). Scope: the ship-rendering files and tests in `src/rendering`, `src/assets` if needed, docs 14–16.
- **Delivered:** `src/rendering/draw/ship.ts` and `draw/ship.test.ts` only. Lamp at source (1444, 463), radius 25, on the stern rail post mapped from the reference — **not** at the end post near (1570, 505); see docs/15, "E-X6 S3 refinement + S4".
- **Next:** the owner's review. **Stop condition:** do not commit or push; do not start S6.

*(Previous S3 bullets, kept as written:)*

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
