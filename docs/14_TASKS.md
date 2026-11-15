# TASK LIST

Status:

**TASK 008 is active** — Sprint 5, Phase 7 (Audio & Visual Effects) per `docs/08_AUDIO_FX_ARCHITECTURE.md`, started 2026-11-15. Architecture approved by the owner. **P7-0 and A1 are done and accepted (A1: `3761062`, accepted 2026-11-15). A1.1, the decode interface, is in `ad9e959`. A1.2, voice pools and protected loops, is in `0de6d73`, accepted by the owner. A2, the sound bank and manifest, is authorized and delivered in its own commit, awaiting the owner's review. A3 is next and not authorized.** See TASK 008 below. *(Until A2, 2026-11-15, this read: "A1.2, voice pools and protected loops, is authorized and delivered in its own commit, awaiting the owner's review. A2 is next and not authorized.")* *(Until A1.2, 2026-11-15, this read: "A1.1, the `AudioManager` decode interface, is authorized and delivered in its own commit, awaiting the owner's review. A2 is next and not authorized.")* *(Until A1.1, 2026-11-15, this read: "P7-0 and A1 are done and accepted (A1: `3761062`, accepted 2026-11-15). A2 is next and not authorized.")* *(Until the A1 acceptance, 2026-11-15, this read: "Architecture approved by the owner; **only P7-0 (the blueprint) is authorized.**")* *(Until P7-0, 2026-11-15, this line read: "No task is active. TASK 007 COMPLETED 2026-11-15 (see the close-out update below); Phase 7 planning awaits the owner's instruction.")*

TASK 007 history: TASK 007 active — Sprint 4 (Phase 6, User Interface per `docs/07_UI_ARCHITECTURE.md`, approved and binding). U1 completed and committed (`140790f`). Commit U2 (wallet store, delta V1) committed as `ad30d7a`, pushed with its fix `39f5a9f`, and approved by the owner 2026-11-13 (remount covered by automated tests only — accepted limitation). Engine freeze exception E-X1 (bonus eligibility + deterministic 360-tick completion) committed and pushed as `897c5be`. U3 (UI test harness + DOM characterization pins) committed and pushed as `8e9b21b`; validation results accepted by the owner 2026-11-13. U4 architecture approved 2026-11-13 and re-cut into U4a (notification store) + U4b (round store), separate gates; dev rejection banner deferred to U6. U4a implemented and validated 2026-11-13; owner manual browser QA passed (5/5 checks) and U4a approved by the owner 2026-11-13; committed and pushed to `origin/develop` (`feat(ui): add session-owned notification store (U4a)`). U4b (round store): plan approved by the owner 2026-11-13; implemented and validated 2026-11-13 (249/249 tests green, 20 U3 pins unchanged); committed and pushed as `bbdc134` — owner manual browser QA pending. U5 (bet-input store + action-state derivation, V4): authorized by the owner 2026-11-13 (decisions D1–D12); implemented and validated 2026-11-13 (311/311 tests green across 29 files, 20 U3 pins unchanged); committed and pushed to `origin/develop` as `09cc5af56534766982697f7036efce72f440260d` (19 files: 5 new, 14 modified; no new lint findings; engine/rendering/shared freeze preserved) — a development checkpoint, not fully accepted: U4b and U5 manual browser QA pending. M1 (Money Integrity — the sub-cent / zero-debit betting vulnerability): **financial policy approved by the owner 2026-11-13 (decisions M1-D1 to M1-D6); not implemented — the vulnerability is still open.** Stage M1-0 (decisions + architecture plan, documentation only; docs/07 §23, docs/06 §13.1) is drafted under TASK 007, refined by a review pass on 2026-11-13 (numeric bounds, engine–wallet consistency), and awaits the owner's review of the diff — not committed. Engine freeze exception E-X2 (engine-side valid-stake enforcement) is proposed only: its implementation scope is not approved. M1-1, M1-2 and M1-3 are proposed stages, none authorized. The recommended commit plan (proposed) lands E-X2 and M1-1 together in one commit, then M1-2, then M1-3 (docs/07 §23.8). Q1 (technical stake ceiling) remains open. M2 (integer minor units) is deferred and not started. Final M1-0 reconciliation (2026-11-13, documentation only), after the read-only security boundary review:
  - The review found **V2**, an edge from minimum-stake payout rounding. Payouts are rounded to the nearest cent, so a 0.01 stake cashed just above 1.5× is paid 0.02. It uses valid stakes only and survives the original M1 plan. It is still open.
  - The owner decided that V2 is a required fix inside M1 (M1-D7), with payouts rounded down to the cent using a numerically justified implementation (M1-D8). That supersedes the U2 bit-identical money-math rule for payouts.
  - Review sequence **C3** is adopted provisionally (M1-D9): commit 1 E-X2 + M1-1; commit 2 settlement integrity (V2 fix plus wallet non-finite debit, credit, payout and balance protection, kept in M1); commit 3 validation (docs/07 §23.14). Commit 1 alone would still contain an open financial vulnerability: V2 through the normal UI.
  - Stake, balance and payout ceilings stay unresolved (M1-D10). Event emission, snapshot restore, live-reference aliasing and network trust boundaries are recorded as known limitations; wallet guards do not authenticate events (M1-D11). E-X2 remains planning-only (M1-D12).
  - M1 may not be marked closed before commits 1–3 land and the closure criteria in docs/07 §23.14 are met.
  - Final financial integrity reconciliation (2026-11-13, documentation only). **Approved owner policy:**
    - M1-D13: payouts from the accepted stake and the authoritative settlement multiplier, rounded down, never above the intended amount; the binary float product is not a monetary result.
    - M1-D14: a NaN, ±Infinity or negative multiplier never credits; nothing is silently converted to zero, and nothing is partially applied.
    - M1-D15: wallet-side integrity is in M1 — no sub-cent, duplicate or invalid debit; no duplicate credit; no non-finite or negative balance. This supersedes C3's P1 deferral.
    - M1-D16: no commit with a known M1 vulnerability is pushed or presented as production-ready.
    - M1-D10 is reaffirmed: Q1 stays open.
  - **Proposed, not authorized:**
    - the BigInt payout function (docs/07 §23.16);
    - wallet rules W1–W9, closing holes H1–H6 (§23.17);
    - plan **C4**: local working commits L1–L3, never pushed, then one atomic integration commit pushed once after owner review and browser QA (§23.18; this supersedes C3's publication model);
    - the numeric envelope (§23.19).
  - E-X2 is still planning-only. **Open:** Q1, Q2, Q4, Q8a–c, Q9b–c, Q11–Q14. Still pending: U4b/U5 browser QA.
- **Update 2026-11-14 — current status; it supersedes the 2026-11-13 lines above as a description of the code.**
  - **Implemented in the working tree, uncommitted:** E-X2 (**approved by the owner as implemented**; the exception is not expanded), M1-1, the BigInt payout (Q8 approved), W1–W9 (Q12 approved), and W10 under **R2**, which keeps auditable unresolved claims (Q9c).
  - **Not implemented:** **B-R** (Q1/Q11, approved in principle). Its minimal design waits for the owner's approval (docs/07 §23.20).
  - **Q14 = S1:** one atomic commit. No staging, commit or push is authorized yet.
  - Tests: 409/409 green.
  - M1 is not closed. Remaining: the B-R approval and implementation, the owner's browser QA (M1, U4b, U5), and the Git authorization.
- **Update 2026-11-14 — roadmap return (owner):** the M1 scope is frozen and **B-R is deferred to M2**. The precision-boundary review found that the `number` ledger silently mis-credits by a cent above 2^44 units. M1 is **BLOCKED** on the owner's decision on the proposed fail-closed rule **W11** (docs/07 §23.21; not implemented). Then come the browser QA for M1, U4b and U5, and the S1 commit. Final validation is green: 409/409 tests, tsc, build, lint at baseline, freeze scope, routeTree unchanged.
- **Update 2026-11-14 — W11 approved (final M1 authorization) and implemented, uncommitted.** Every credit is decided in exact integer cents below the exclusive 2^44-unit envelope. A valid win outside it becomes an R2 unresolved claim, with rule `W11` and the exact `unpaidCents`, and a withheld jackpot's chest becomes one follow-up claim (docs/07 §23.21). No engine, rendering or shared file changed. Validation: 427/427 tests, tsc, build, lint at baseline, freeze scope, routeTree unchanged. M1 implementation is complete. Remaining: the owner's browser QA (M1, U4b, U5) and the S1 commit authorization.
- **Update 2026-11-14 — browser QA reconciliation:** the owner reports 10 consolidated browser checks passed. That is distinct from the 19-item detailed checklist in docs/16, which is not recorded as passed. The remaining detailed items await the owner's confirmation, and the full QA gate stays pending. The S1 commit is to be local, with no push, and awaits a separate authorization. The W11 wording is clarified in docs/07 §23.21: the first *valid* chest settlement after a withheld jackpot creates the follow-up claim.
- **Update 2026-11-14 — browser QA accepted (owner):** the owner confirms **all 19/19 detailed browser QA checks passed** (U4b 6/6, U5 7/7, M1 6/6). These are owner-performed checks; the agent ran no browser test. The temporary `// @refresh reset` line is confirmed absent from `src/components/AbyssAnchor.tsx`. The U4b and U5 browser QA is complete. M1's only remaining step is the owner's separate authorization of the single local S1 commit (27 files, `src/routeTree.gen.ts` excluded; no push). Nothing is staged or committed.
- **Update 2026-11-14 — reconciliation (documentation only; supersedes the Git status above):**
  - **M1:** S1 landed as `e37b81c`, and its held-back test suites as `e8b1b62`. The owner **deferred M1** to the final stabilization phase. It is **not closed**, validated or formally accepted, and its work is preserved.
  - **M2 and B-R:** tracked separately, not started.
  - **U6 + U7:** landed in one commit, `4440009`. U6 delivered componentization (V3). U7 delivered the responsive layout (V5) with the owner's `tab`/`desk` and full-landscape desktop corrections (docs/07 §15). Pending: the U6 mobile pixel-compare and the U7 screenshot matrix (docs/07 §19 gates 7–8).
  - **E-X3 — Dual Bet:** an owner-approved engine freeze exception (docs/06 §13.2), with the per-slot wallet amendment (docs/07 §23.17). Landed in `be10b19`. Owner browser QA is not recorded.
  - **Git:** all four commits are on `origin/develop`.
  - **Working tree:** uncommitted renderer changes (`src/rendering/draw/chain.ts`, `src/rendering/theme.ts`, untracked `src/rendering/draw/chain.test.ts`) are preserved untouched. They are outside every approved freeze exception (docs/07 §19 gate 4).
  - **Next:** the Sprint 4 close-out. Step 1 is this documentation reconciliation.
- **Update 2026-11-14 — close-out Step 2 (uncommitted):** agent-run browser QA at all 7 matrix sizes passes after four `src/ui`-only QA fixes (D1 scene fit, ship visible on phones; D2–D4 keyboard focus and accessible names). 539/539 tests, `tsc` clean, lint 0 + 6 (end-of-line neutralized), build passes. **Awaiting owner acceptance:** D1–D4, §19 gates 7–8, and a decision on the uncommitted renderer work. Details in `docs/15_PROGRESS.md`.
- **Update 2026-11-15 — close-out Step 3 (uncommitted):** the owner accepted the visual implementation (ship and waterline, pre-dive anchor and chain, descent and sea-floor landing, slack chain, illustrated sea floor, redesigned Bonus Chest, gameplay presentation), the QA fixes D1–D4, and the renderer exception **E-X4** (docs/07 §19 gate 4). Git reconciled: Step 2's work is in `c046b33` (message `Update lockfile`), followed by web-editor config commits, `9ef35e9`, `4d44a50` and the renderer commit `81eb985`; `develop` = `origin/develop` = `81eb985`. `icons.tsx` Prettier errors fixed and the unused `ChestIcon` removed. **Phase 6 not closed:** §19 gates 7–8, E-X3 browser QA, Git authorization and the retrospective remain.
- **Update 2026-11-15 — official close-out: TASK 007 COMPLETED.** OWNER APPROVED — 2026-11-15: manual gameplay including Dual Bet (independent BET 1 / BET 2, cashout, mobile at 375×667 and 390×844; docs/07 §19 gate 7, which also records the E-X3 browser QA), the seven-size screenshot matrix (gate 8), and the current ship, chain, anchor landing, sea floor and Bonus Chest. **E-X4 formally ratified** (19 files, scope verified against `git diff --name-only be10b19 -- src/rendering src/assets`; retrospective and file-limited). D1–D4 ratified. Commits: G1 `6e28ce0` (Bonus Chest), G2 `9bded6b` (E-X4 rest), G3 `3346ed8` (`vite.config.ts`), G4 (this documentation). Gates: 572/572 tests across 42 files, `tsc` clean, ESLint 0 errors + 6 pre-existing warnings (end-of-line neutralized), build passes, `git diff --check` clean, SSR smoke 200, engine/shared freeze clean. **Sprint 4 / Phase 6 completed.** Deferred: M1 (not closed), M2 and B-R (not started), recovery items 1–3. **Phase 7 not started.**

*(Previous summary: U6 and U7 committed (`4440009`); Dual Bet E-X3 committed (`be10b19`); M1 deferred, not closed; visuals, D1–D4 and E-X4 accepted 2026-11-15; Phase 6 close-out pending gates 7–8)*

TASK 007 COMPLETED 2026-11-15 — U1–U7, E-X1–E-X4, D1–D4 and the Bonus Chest committed; owner acceptance of gates 7–8 recorded; M1 deferred, not closed; M2 and B-R not started

---

TASK 001

Project Audit

Status:

Completed (2026-07-16)

---

TASK 002

Architecture Review

Status:

Completed (2026-07-16) — Architecture Blueprint delivered

---

TASK 003

Project Refactoring Plan

Status:

Completed (2026-07-16) — 15-step frontend migration plan approved

---

TASK 004

Foundation Improvements (Sprint 1)

Status:

Closed (2026-07-17) — Commits 1–5 delivered; remaining half of Step 1.2 (`sampleJackpot` move) deferred, to be scheduled as its own commit

---

TASK 005

Sprint 2 — Rendering Architecture

Status:

Completed (2026-07-18) — Commits 1–6 delivered (planning + R1–R5); rendering architecture fully implemented; Phase 4 complete. Close-out recorded in PROGRESS.md, awaiting approval

---

TASK 006

Sprint 3 — Game Engine (Phase 5)

Status:

Completed (2026-08-17) — Commits 1–8 delivered and approved (blueprint, E1–E6 extraction, bet-basis fix; Commit 8 approved 2026-08-17 after the owner's manual gameplay pass). Engine extraction complete; Phase 5 complete. Close-out summary and retrospective recorded in `docs/15_PROGRESS.md`

---

TASK 007

Sprint 4 — User Interface (Phase 6)

Status:

**Completed 2026-11-15** (active since 2026-08-17) — Blueprint `docs/07_UI_ARCHITECTURE.md` approved 2026-08-17 (the U0 step; approval made it binding and ratified deltas V1–V5). Commit U1 (session module: `createGameSession` + module singleton, store primitive, `useStore` hook) completed, committed as `140790f` and approved 2026-08-17. Commit U2 (wallet store, delta V1) committed as `ad30d7a` (2026-11-13) and pushed to `origin/develop` with its tracking docs `f080b03` and settlement-exclusivity fix `39f5a9f`: automated validation complete (tsc clean, 125/125 tests green at U2, lint within baseline, production build passes, freeze check clean); SSR smoke passed, owner manual gameplay and browser console checks passed with no errors (151/151 tests green at approval); **approved by the owner 2026-11-13**, with one accepted limitation — React remount coverage is automated (session-level) only; a browser-level component remount was not manually tested. Engine freeze exception E-X1 (owner-approved 2026-11-13; docs/06 §5, docs/07 §19 gate 4): bonus eligibility for jackpot auto-cashed participants only, 6 s / 360-tick pick window with chest 0 on expiry, ineligible bonus completes without a pick, snapshot schema v2 — implemented and validated (151/151 tests green, all gates clean), owner manual browser QA passed (4/4 scenarios); committed as `897c5be` and pushed to `origin/develop`. U2 closure docs committed as `9b1071e`. U3 (UI test harness + DOM characterization pins) committed and pushed to `origin/develop` as `8e9b21b` (2026-11-13); the owner accepted its validation results: 180/180 tests green across 22 files, tsc and production build pass, DOM-level React remount and StrictMode coverage complete, production source unchanged. Open: a real-browser remount is still unverified; full-project lint is not clean (CRLF end-of-line noise plus the pre-existing 7 errors + 6 warnings). U4 architecture approved by the owner 2026-11-13 and re-cut into U4a (notification store, V2) and U4b (round store; must restore the eligible chest picker after a remount during `bonus`), each with its own validation and approval gate; the visual dev rejection banner is deferred to U6 (docs/07 §17, corrections C1–C5). U4a implemented and validated 2026-11-13 (212/212 tests green; 20 U3 pins unchanged); owner manual browser QA passed 5/5 (cash flash ≈1,800 ms, jackpot flash ≈2,200 ms, chest selection updates balance and result, no stuck or duplicated flashes across rounds, no new console errors); **approved by the owner 2026-11-13**, committed and pushed to `origin/develop`. Real-browser remount still unverified. U4b (round store): plan approved by the owner 2026-11-13; implemented and validated 2026-11-13 (249/249 tests green, 20 U3 pins unchanged); committed and pushed as `bbdc134` — owner manual browser QA pending. U5 (bet-input store + action-state derivation, V4): authorized by the owner 2026-11-13 (decisions D1–D12); implemented and validated 2026-11-13 (311/311 tests green across 29 files, 20 U3 pins unchanged); committed and pushed to `origin/develop` as `09cc5af56534766982697f7036efce72f440260d` (19 files: 5 new, 14 modified; no new lint findings; engine/rendering/shared freeze preserved) — a development checkpoint, not fully accepted: U4b and U5 manual browser QA pending. M1 (Money Integrity — the sub-cent / zero-debit betting vulnerability): **financial policy approved by the owner 2026-11-13 (decisions M1-D1 to M1-D6); not implemented — the vulnerability is still open.** Stage M1-0 (decisions + architecture plan, documentation only; docs/07 §23, docs/06 §13.1) is drafted under TASK 007, refined by a review pass on 2026-11-13 (numeric bounds, engine–wallet consistency), and awaits the owner's review of the diff — not committed. Engine freeze exception E-X2 (engine-side valid-stake enforcement) is proposed only: its implementation scope is not approved. M1-1, M1-2 and M1-3 are proposed stages, none authorized. The recommended commit plan (proposed) lands E-X2 and M1-1 together in one commit, then M1-2, then M1-3 (docs/07 §23.8). Q1 (technical stake ceiling) remains open. M2 (integer minor units) is deferred and not started. Final M1-0 reconciliation (2026-11-13, documentation only), after the read-only security boundary review:
  - The review found **V2**, an edge from minimum-stake payout rounding. Payouts are rounded to the nearest cent, so a 0.01 stake cashed just above 1.5× is paid 0.02. It uses valid stakes only and survives the original M1 plan. It is still open.
  - The owner decided that V2 is a required fix inside M1 (M1-D7), with payouts rounded down to the cent using a numerically justified implementation (M1-D8). That supersedes the U2 bit-identical money-math rule for payouts.
  - Review sequence **C3** is adopted provisionally (M1-D9): commit 1 E-X2 + M1-1; commit 2 settlement integrity (V2 fix plus wallet non-finite debit, credit, payout and balance protection, kept in M1); commit 3 validation (docs/07 §23.14). Commit 1 alone would still contain an open financial vulnerability: V2 through the normal UI.
  - Stake, balance and payout ceilings stay unresolved (M1-D10). Event emission, snapshot restore, live-reference aliasing and network trust boundaries are recorded as known limitations; wallet guards do not authenticate events (M1-D11). E-X2 remains planning-only (M1-D12).
  - M1 may not be marked closed before commits 1–3 land and the closure criteria in docs/07 §23.14 are met.
  - Final financial integrity reconciliation (2026-11-13, documentation only). **Approved owner policy:**
    - M1-D13: payouts from the accepted stake and the authoritative settlement multiplier, rounded down, never above the intended amount; the binary float product is not a monetary result.
    - M1-D14: a NaN, ±Infinity or negative multiplier never credits; nothing is silently converted to zero, and nothing is partially applied.
    - M1-D15: wallet-side integrity is in M1 — no sub-cent, duplicate or invalid debit; no duplicate credit; no non-finite or negative balance. This supersedes C3's P1 deferral.
    - M1-D16: no commit with a known M1 vulnerability is pushed or presented as production-ready.
    - M1-D10 is reaffirmed: Q1 stays open.
  - **Proposed, not authorized:**
    - the BigInt payout function (docs/07 §23.16);
    - wallet rules W1–W9, closing holes H1–H6 (§23.17);
    - plan **C4**: local working commits L1–L3, never pushed, then one atomic integration commit pushed once after owner review and browser QA (§23.18; this supersedes C3's publication model);
    - the numeric envelope (§23.19).
  - E-X2 is still planning-only. **Open:** Q1, Q2, Q4, Q8a–c, Q9b–c, Q11–Q14. Still pending: U4b/U5 browser QA.
- **Update 2026-11-14 — current status; it supersedes the 2026-11-13 lines above as a description of the code.**
  - **Implemented in the working tree, uncommitted:** E-X2 (**approved by the owner as implemented**; the exception is not expanded), M1-1, the BigInt payout (Q8 approved), W1–W9 (Q12 approved), and W10 under **R2**, which keeps auditable unresolved claims (Q9c).
  - **Not implemented:** **B-R** (Q1/Q11, approved in principle). Its minimal design waits for the owner's approval (docs/07 §23.20).
  - **Q14 = S1:** one atomic commit. No staging, commit or push is authorized yet.
  - Tests: 409/409 green.
  - M1 is not closed. Remaining: the B-R approval and implementation, the owner's browser QA (M1, U4b, U5), and the Git authorization.
- **Update 2026-11-14 — roadmap return (owner):** the M1 scope is frozen and **B-R is deferred to M2**. The precision-boundary review found that the `number` ledger silently mis-credits by a cent above 2^44 units. M1 is **BLOCKED** on the owner's decision on the proposed fail-closed rule **W11** (docs/07 §23.21; not implemented). Then come the browser QA for M1, U4b and U5, and the S1 commit. Final validation is green: 409/409 tests, tsc, build, lint at baseline, freeze scope, routeTree unchanged.
- **Update 2026-11-14 — W11 approved (final M1 authorization) and implemented, uncommitted.** Every credit is decided in exact integer cents below the exclusive 2^44-unit envelope. A valid win outside it becomes an R2 unresolved claim, with rule `W11` and the exact `unpaidCents`, and a withheld jackpot's chest becomes one follow-up claim (docs/07 §23.21). No engine, rendering or shared file changed. Validation: 427/427 tests, tsc, build, lint at baseline, freeze scope, routeTree unchanged. M1 implementation is complete. Remaining: the owner's browser QA (M1, U4b, U5) and the S1 commit authorization.
- **Update 2026-11-14 — browser QA reconciliation:** the owner reports 10 consolidated browser checks passed. That is distinct from the 19-item detailed checklist in docs/16, which is not recorded as passed. The remaining detailed items await the owner's confirmation, and the full QA gate stays pending. The S1 commit is to be local, with no push, and awaits a separate authorization. The W11 wording is clarified in docs/07 §23.21: the first *valid* chest settlement after a withheld jackpot creates the follow-up claim.
- **Update 2026-11-14 — browser QA accepted (owner):** the owner confirms **all 19/19 detailed browser QA checks passed** (U4b 6/6, U5 7/7, M1 6/6). These are owner-performed checks; the agent ran no browser test. The temporary `// @refresh reset` line is confirmed absent from `src/components/AbyssAnchor.tsx`. The U4b and U5 browser QA is complete. M1's only remaining step is the owner's separate authorization of the single local S1 commit (27 files, `src/routeTree.gen.ts` excluded; no push). Nothing is staged or committed.
- **Update 2026-11-14 — reconciliation (documentation only; supersedes the Git status above):**
  - **M1:** S1 landed as `e37b81c`, and its held-back test suites as `e8b1b62`. The owner **deferred M1** to the final stabilization phase. It is **not closed**, validated or formally accepted, and its work is preserved.
  - **M2 and B-R:** tracked separately, not started.
  - **U6 + U7:** landed in one commit, `4440009`. U6 delivered componentization (V3). U7 delivered the responsive layout (V5) with the owner's `tab`/`desk` and full-landscape desktop corrections (docs/07 §15). Pending: the U6 mobile pixel-compare and the U7 screenshot matrix (docs/07 §19 gates 7–8).
  - **E-X3 — Dual Bet:** an owner-approved engine freeze exception (docs/06 §13.2), with the per-slot wallet amendment (docs/07 §23.17). Landed in `be10b19`. Owner browser QA is not recorded.
  - **Git:** all four commits are on `origin/develop`.
  - **Working tree:** uncommitted renderer changes (`src/rendering/draw/chain.ts`, `src/rendering/theme.ts`, untracked `src/rendering/draw/chain.test.ts`) are preserved untouched. They are outside every approved freeze exception (docs/07 §19 gate 4).
  - **Next:** the Sprint 4 close-out. Step 1 is this documentation reconciliation.
- **Update 2026-11-14 — close-out Step 2:** browser QA at 7 sizes and QA fixes D1–D4; committed in `c046b33`.
- **Update 2026-11-15 — close-out Step 3:** owner visual acceptance; D1–D4 and E-X4 approved; Git reconciled to `81eb985`. Phase 6 not closed (see the status block above).
- **Update 2026-11-15 — official close-out: TASK 007 COMPLETED.** OWNER APPROVED — 2026-11-15: manual gameplay including Dual Bet (independent BET 1 / BET 2, cashout, mobile at 375×667 and 390×844; docs/07 §19 gate 7, which also records the E-X3 browser QA), the seven-size screenshot matrix (gate 8), and the current ship, chain, anchor landing, sea floor and Bonus Chest. **E-X4 formally ratified** (19 files, scope verified against `git diff --name-only be10b19 -- src/rendering src/assets`; retrospective and file-limited). D1–D4 ratified. Commits: G1 `6e28ce0` (Bonus Chest), G2 `9bded6b` (E-X4 rest), G3 `3346ed8` (`vite.config.ts`), G4 (this documentation). Gates: 572/572 tests across 42 files, `tsc` clean, ESLint 0 errors + 6 pre-existing warnings (end-of-line neutralized), build passes, `git diff --check` clean, SSR smoke 200, engine/shared freeze clean. **Sprint 4 / Phase 6 completed.** Deferred: M1 (not closed), M2 and B-R (not started), recovery items 1–3. **Phase 7 not started.**

*(Previous summary: U6 and U7 committed (`4440009`); Dual Bet E-X3 committed (`be10b19`); M1 deferred, not closed; visuals, D1–D4 and E-X4 accepted 2026-11-15; Phase 6 close-out pending gates 7–8)*

TASK 007 COMPLETED 2026-11-15 — U1–U7, E-X1–E-X4, D1–D4 and the Bonus Chest committed; owner acceptance of gates 7–8 recorded; M1 deferred, not closed; M2 and B-R not started

---

TASK 008

Sprint 5 — Audio & Visual Effects (Phase 7)

Status:

**Active since 2026-11-15.** Blueprint `docs/08_AUDIO_FX_ARCHITECTURE.md`.

- **2026-11-15 — architecture approved (owner).** Native Web Audio with a lightweight `AudioManager`, no dependency; the existing Canvas 2D renderer, no PixiJS; event-driven audio and FX; the approved underwater atmosphere preserved; no change to the engine, RNG, money settlement, Dual Bet or gameplay outcomes. One atomic commit per approved step.
- **Steps** (docs/08 §12), in the approved order:

| Step | Scope | Status |
|---|---|---|
| P7-0 | Blueprint `docs/08` + tracking docs + `src/audio/README.md` | **Done** — committed `0e7ff80` (2026-11-15); the owner authorized A1 on it |
| A1 | `AudioManager` core + fake `AudioContext` + tests | **Done — committed `3761062`, pushed; accepted by the owner 2026-11-15** on the recorded validation evidence (docs/15, "Step A1"). 623/623 tests across 43 files (51 new). Not wired; the app is unchanged |
| A1.1 | `AudioManager.decode()` + fake decoder + tests (docs/08 §7.1) | **Authorized 2026-11-15; committed `ad9e959`, pushed.** 663/663 tests across 43 files (40 new). Not wired; the app is unchanged |
| A1.2 | Voice pools (6 loop / 8 one-shot / 2 tail), strict 16-source cap, pending and essential loops (docs/08 §7.2) | **Done — committed `0de6d73`, pushed; accepted by the owner 2026-11-15.** 685/685 tests across 43 files (22 new, 8 rewritten as owner-approved). Not wired; the app is unchanged. `maxInstances` deferred |
| A2 | Sound bank + manifest (docs/08 §7.3) | **Authorized 2026-11-15; delivered in its own commit, pushed — awaiting owner review.** 757/757 tests across 45 files (72 new). Typed manifest of 15 one-shots and 3 loops (two essential beds), every `asset` `null`; SoundBank decoding through `AudioManager.decode()`. `audio-manager.ts` unchanged. Not wired; the app is unchanged. Tick (Q9) and music (Q8) left out *(Until A2 this row read: "**Next. Not authorized, not started.** Q6 open (owner's planning preference: AAC-LC `.m4a`, subject to browser validation). The decode blocker is resolved by A1.1, and the voice-cap policy for loops by A1.2 (docs/08 §14 risk 12) *(Until A1.2 this read: "Before A2: analyze and test the voice-cap policy for loops (docs/08 §14 risk 12)")* *(Until A1.1 this read: "Blocker: the `AudioManager` exposes no way to decode audio with its single context; the proposed decode seam changes `audio-manager.ts`, outside A2's §12 file list, and awaits the owner's decision (docs/16)")*")* |
| A3 | Sound settings store (`src/ui`) | Not authorized; UI scope not ratified; Q3 open |
| A4 | Director, music, session wiring | Not authorized; UI scope not ratified; Q3, Q7, Q8, Q9, Q15 open |
| V1 | FX queue, camera shake, motion flag | Not authorized; renderer + UI scope not ratified; Q11, Q12 open |
| V2 | F1 marine snow, F2 depth vignette | Not authorized; renderer scope not ratified; Q10 open |
| V3 | F3 anchor wake, F4 entry splash | Not authorized; renderer scope not ratified; Q10 open |
| V4 | F5 landing silt plume | Not authorized; renderer scope not ratified; Q10 open |
| V5 | F6 crash effect + camera shake | Not authorized; renderer scope not ratified; Q10, Q11 open |
| V6 | F7 round-reset dip, F8 chest burst | Not authorized; renderer + UI scope not ratified; Q10 open |
| V7 | Reduced motion (canvas + CSS) | Not authorized; UI scope not ratified; Q11, Q12 open |
| A6 | Licensed sound assets + mix | Not authorized; **Q5 open: no asset supplied, no licence cleared** |
| A5 | Sound control (TopBar) | Not authorized; UI scope not ratified; Q4, Q12 open |
| P7-C | Phase 7 close-out | Not authorized; device QA (Q14) open |

- **Exceptions:** the renderer exception (proposed **E-X5**) and the UI exception (proposed **UI-X1**) are accepted in principle only. Their file scopes (docs/08 §13) must be ratified before those files change. `src/engine` and `src/shared` take no change. `src/ui/store/wallet-store.ts` is excluded (M1 deferred, not closed).
- **Owner decisions** (docs/08 §1.3): approved — Q1, Q13, Q16 and the zero-engine-change part of Q2. Open — the renderer/UI scopes of Q2, and Q3–Q12, Q14, Q15. The recommended defaults are not in force.
- **Next:** the owner's review of A2; the UI scope ratification for A3 (docs/08 §13.2) and Q3; then the owner's authorization of A3. Nothing after A2 is started. *(Until A2, 2026-11-15, this read: "the owner's review of A1.2; Q6; then the owner's authorization of A2. Nothing after A1.2 is started.")* *(Until A1.2, 2026-11-15, this read: "the owner's review of A1.1; the voice-cap analysis for loops (docs/08 §14 risk 12) and Q6; then the owner's authorization of A2. Nothing after A1.1 is started.")* *(Until A1.1, 2026-11-15, this read: "the owner's decision on the A2 decode seam and on Q6, then the owner's authorization of A2. Nothing after A1 is started.")* *(Until the A1 acceptance, 2026-11-15, this read: "owner review of P7-0; then the owner's authorization of A1. Nothing after P7-0 is started.")*

---

Only one task may be active at a time.
