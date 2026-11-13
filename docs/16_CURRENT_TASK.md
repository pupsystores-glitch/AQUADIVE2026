# CURRENT TASK

**TASK 007 — Sprint 4: User Interface (Phase 6). ACTIVE since 2026-08-17.**

Blueprint: `docs/07_UI_ARCHITECTURE.md` — **approved 2026-08-17 and binding** (the §17 U0 step; approval ratified the five §7 sanctioned deltas V1–V5). Extraction commits follow its §17 order, one per approval.

The engine (`src/engine`), renderer (`src/rendering`) and shared floor (`src/shared`) are **read-only contracts** for the whole sprint (docs/07 §20 risk 1, §19 gate 4: `git diff --stat src/engine src/rendering src/shared` must be empty for every Sprint 4 commit). **Sole approved exception: E-X1** (2026-11-13, below) — limited to `src/engine/state-machine.ts`, `src/engine/game-engine.ts`, `src/engine/domain/tuning.ts` and their tests.

## Sprint 4 progress

| Step | Status |
|---|---|
| U0 — blueprint approval | Done 2026-08-17 (deltas V1–V5 ratified) |
| U1 — session module + store primitive + `useStore` | Done — committed `140790f`, approved 2026-08-17 (validation: tsc clean, 93/93 tests green, freeze check clean) |
| U2 — wallet store (delta V1) | **Done — committed `ad30d7a` + fix `39f5a9f` (settlement exclusivity), pushed; approved by the owner 2026-11-13.** SSR smoke passed; owner manual gameplay and browser console checks passed with no errors; 151/151 tests green. Limitation accepted at approval: remount verified by automated session-level tests only — no browser-level React remount was manually tested |
| E-X1 — engine freeze exception: bonus eligibility + deterministic completion | **Committed `897c5be`, pushed to `origin/develop` (2026-11-13).** All automated gates green (tsc clean, 151/151 tests, lint at baseline 7 + 6, build passes, `diff --check` clean, freeze check within the exception); owner manual browser QA passed, 4/4 scenarios |
| U3 — UI test harness + DOM characterization pins | **Implemented and validated 2026-11-13; not committed — awaiting owner review.** 180/180 tests green (29 new DOM tests); production source unchanged. Details in `docs/15_PROGRESS.md` |
| U4–U7 | Pending, per docs/07 §17 |

## Current: U3 — implemented, awaiting owner review

The owner approved the U3 plan and its devDependencies on 2026-11-13. U3 is implemented and validated; **its commit and push are not authorized yet**.

- Delivered (uncommitted): the jsdom + Testing Library devDependencies (exact pins), a two-project Vitest config (`node` for `*.test.ts`, `dom` for `*.test.tsx`), the DOM harness in `src/ui/test/`, 20 characterization pins (`src/ui/screen.characterization.test.tsx`) and 9 remount + StrictMode tests (`src/ui/screen.remount.test.tsx`).
- Validation: tsc clean, 180/180 tests, lint at the 7 + 6 baseline, build, SSR smoke, freeze check empty, `src/routeTree.gen.ts` byte-identical.
- U2's remount limitation is now covered by an automated real-component remount in jsdom; a manual browser remount has still not been run.
- Run tests from a `C:\` (uppercase) working directory: a lowercase drive letter makes Vitest fail every file (pre-existing environment issue).
- Next: owner review → U3 commit authorization → U4.

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

**Next:** owner review of U3 (see "Current" above), then U4 (docs/07 §17).

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
