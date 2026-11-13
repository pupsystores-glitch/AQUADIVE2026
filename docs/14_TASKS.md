# TASK LIST

Status:

TASK 007 active — Sprint 4 (Phase 6, User Interface per `docs/07_UI_ARCHITECTURE.md`, approved and binding). U1 completed and committed (`140790f`). Commit U2 (wallet store, delta V1) committed as `ad30d7a`, pushed with its fix `39f5a9f`, and approved by the owner 2026-11-13 (remount covered by automated tests only — accepted limitation). Engine freeze exception E-X1 (bonus eligibility + deterministic 360-tick completion) committed and pushed as `897c5be`. U3 (UI test harness + DOM characterization pins) committed and pushed as `8e9b21b`; validation results accepted by the owner 2026-11-13. U4 architecture approved 2026-11-13 and re-cut into U4a (notification store) + U4b (round store), separate gates; dev rejection banner deferred to U6. U4a implemented and validated 2026-11-13; owner manual browser QA passed (5/5 checks) and U4a approved by the owner 2026-11-13; committed and pushed to `origin/develop` (`feat(ui): add session-owned notification store (U4a)`). U4b (round store): plan approved by the owner 2026-11-13; implemented and validated 2026-11-13 (249/249 tests green, 20 U3 pins unchanged); committed and pushed as `bbdc134` — owner manual browser QA pending. U5 (bet-input store + action-state derivation, V4): authorized by the owner 2026-11-13 (decisions D1–D12); implemented and validated 2026-11-13 (311/311 tests green across 29 files, 20 U3 pins unchanged); committed and pushed to `origin/develop` as `09cc5af56534766982697f7036efce72f440260d` (19 files: 5 new, 14 modified; no new lint findings; engine/rendering/shared freeze preserved) — a development checkpoint, not fully accepted: U4b and U5 manual browser QA pending. M1 (sub-cent betting vulnerability) unresolved — requires a separate owner-approved task. U6 not started

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

Active (started 2026-08-17) — Blueprint `docs/07_UI_ARCHITECTURE.md` approved 2026-08-17 (the U0 step; approval made it binding and ratified deltas V1–V5). Commit U1 (session module: `createGameSession` + module singleton, store primitive, `useStore` hook) completed, committed as `140790f` and approved 2026-08-17. Commit U2 (wallet store, delta V1) committed as `ad30d7a` (2026-11-13) and pushed to `origin/develop` with its tracking docs `f080b03` and settlement-exclusivity fix `39f5a9f`: automated validation complete (tsc clean, 125/125 tests green at U2, lint within baseline, production build passes, freeze check clean); SSR smoke passed, owner manual gameplay and browser console checks passed with no errors (151/151 tests green at approval); **approved by the owner 2026-11-13**, with one accepted limitation — React remount coverage is automated (session-level) only; a browser-level component remount was not manually tested. Engine freeze exception E-X1 (owner-approved 2026-11-13; docs/06 §5, docs/07 §19 gate 4): bonus eligibility for jackpot auto-cashed participants only, 6 s / 360-tick pick window with chest 0 on expiry, ineligible bonus completes without a pick, snapshot schema v2 — implemented and validated (151/151 tests green, all gates clean), owner manual browser QA passed (4/4 scenarios); committed as `897c5be` and pushed to `origin/develop`. U2 closure docs committed as `9b1071e`. U3 (UI test harness + DOM characterization pins) committed and pushed to `origin/develop` as `8e9b21b` (2026-11-13); the owner accepted its validation results: 180/180 tests green across 22 files, tsc and production build pass, DOM-level React remount and StrictMode coverage complete, production source unchanged. Open: a real-browser remount is still unverified; full-project lint is not clean (CRLF end-of-line noise plus the pre-existing 7 errors + 6 warnings). U4 architecture approved by the owner 2026-11-13 and re-cut into U4a (notification store, V2) and U4b (round store; must restore the eligible chest picker after a remount during `bonus`), each with its own validation and approval gate; the visual dev rejection banner is deferred to U6 (docs/07 §17, corrections C1–C5). U4a implemented and validated 2026-11-13 (212/212 tests green; 20 U3 pins unchanged); owner manual browser QA passed 5/5 (cash flash ≈1,800 ms, jackpot flash ≈2,200 ms, chest selection updates balance and result, no stuck or duplicated flashes across rounds, no new console errors); **approved by the owner 2026-11-13**, committed and pushed to `origin/develop`. Real-browser remount still unverified. U4b (round store): plan approved by the owner 2026-11-13; implemented and validated 2026-11-13 (249/249 tests green, 20 U3 pins unchanged); committed and pushed as `bbdc134` — owner manual browser QA pending. U5 (bet-input store + action-state derivation, V4): authorized by the owner 2026-11-13 (decisions D1–D12); implemented and validated 2026-11-13 (311/311 tests green across 29 files, 20 U3 pins unchanged); committed and pushed to `origin/develop` as `09cc5af56534766982697f7036efce72f440260d` (19 files: 5 new, 14 modified; no new lint findings; engine/rendering/shared freeze preserved) — a development checkpoint, not fully accepted: U4b and U5 manual browser QA pending. M1 (sub-cent betting vulnerability) unresolved — requires a separate owner-approved task. U6 not started

---

Only one task may be active at a time.