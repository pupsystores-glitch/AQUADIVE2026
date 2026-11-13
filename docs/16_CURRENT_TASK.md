# CURRENT TASK

**TASK 007 — Sprint 4: User Interface (Phase 6). ACTIVE since 2026-08-17.**

Blueprint: `docs/07_UI_ARCHITECTURE.md` — **approved 2026-08-17 and binding** (the §17 U0 step; approval ratified the five §7 sanctioned deltas V1–V5). Extraction commits follow its §17 order, one per approval.

The engine (`src/engine`), renderer (`src/rendering`) and shared floor (`src/shared`) are **read-only contracts** for the whole sprint (docs/07 §20 risk 1, §19 gate 4: `git diff --stat src/engine src/rendering src/shared` must be empty for every Sprint 4 commit). **Sole approved exception: E-X1** (2026-11-13, below) — limited to `src/engine/state-machine.ts`, `src/engine/game-engine.ts`, `src/engine/domain/tuning.ts` and their tests.

## Sprint 4 progress

| Step | Status |
|---|---|
| U0 — blueprint approval | Done 2026-08-17 (deltas V1–V5 ratified) |
| U1 — session module + store primitive + `useStore` | Done — committed `140790f`, approved 2026-08-17 (validation: tsc clean, 93/93 tests green, freeze check clean) |
| U2 — wallet store (delta V1) | **Committed `ad30d7a` + fix `39f5a9f` (settlement exclusivity), pushed to `origin/develop`.** Automated validation complete. Browser remount mid-round, SSR smoke and console hygiene **not recorded as passed; owner approval of U2 pending** |
| E-X1 — engine freeze exception: bonus eligibility + deterministic completion | **Implemented and validated, not yet committed.** All automated gates green (tsc clean, 151/151 tests, lint at baseline 7 + 6, build passes, `diff --check` clean, freeze check within the exception); **owner manual browser QA passed — 4/4 scenarios (2026-11-13)**. Commit awaits owner authorization |
| U3–U7 | Pending, per docs/07 §17. U3 NOT STARTED — must not begin until U2 is approved |

## Current: E-X1 commit authorization, then U2 approval

E-X1 (details in `docs/15_PROGRESS.md`, rules in docs/06 §5): only a participant auto-cashed at the jackpot is bonus-eligible; it gets a 6 s / 360-tick pick window, and on expiry chest 0 is applied through the normal pick path. Spectators and manual-cashout players cannot pick, never see the picker, and their bonus phase ends after the result interval with no `chestPicked`; the wallet ignores any ineligible pick (no credit, no history entry). Snapshot schema bumped to v2.

**Phase 8 limitation (open):** E-X1 is a local single-player rule. A server-authoritative multiplayer round must complete `bonus` on its own schedule, independent of any one player's eligibility; per-player eligibility then gates only picking and crediting, and a server-side auto-pick / per-player default replaces the local chest-0 rule. This must be redesigned, not inherited, in Phase 8.

Remaining before U2 can be approved (docs/07 §19):

- Gate 5 (partial): production build passes; dev-server SSR smoke (HTTP 200 with canvas markup) not yet run.
- Gate 6: console hygiene in the browser.
- Gate 7: manual gameplay pass — bet → dive → cash out → crash round → jackpot round → chest pick → spectate — with the U2 focus: balance ledger through every settlement path, **including a browser remount mid-round** (the wallet must neither reset nor miss an event).
- Then: owner approval of U2 (the U2 commits are already pushed).

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
