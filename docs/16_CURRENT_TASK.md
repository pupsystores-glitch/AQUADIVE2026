# CURRENT TASK

**TASK 007 — Sprint 4: User Interface (Phase 6). ACTIVE since 2026-08-17.**

Blueprint: `docs/07_UI_ARCHITECTURE.md` — **approved 2026-08-17 and binding** (the §17 U0 step; approval ratified the five §7 sanctioned deltas V1–V5). Extraction commits follow its §17 order, one per approval.

The engine (`src/engine`), renderer (`src/rendering`) and shared floor (`src/shared`) are **read-only contracts** for the whole sprint (docs/07 §20 risk 1, §19 gate 4: `git diff --stat src/engine src/rendering src/shared` must be empty for every Sprint 4 commit). Approved exceptions: **E-X1** (2026-11-13, below), limited to `src/engine/state-machine.ts`, `src/engine/game-engine.ts`, `src/engine/domain/tuning.ts` and their tests; and **E-X2** (engine-side valid-stake enforcement, docs/06 §13.1), **approved by the owner 2026-11-14 exactly as implemented**: `src/shared/stake.ts`, `src/shared/stake.test.ts`, `src/engine/state-machine.ts`, `src/engine/state-machine.test.ts`. The exception is not expanded. *(History: E-X2 was planning-only from 2026-11-13, M1-D4 and M1-D12, until the 2026-11-14 approval.)*

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
| U6–U7 | Pending, per docs/07 §17. Not started |

## Current: return to the approved roadmap — close M1, finish the pending browser QA, then resume Sprint 4

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
