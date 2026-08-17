# CURRENT TASK

**No task active. Sprint 3 (TASK 006 — Game Engine, Phase 5) is CLOSED (2026-08-17).**

Commit 8 (bet-basis fix) was approved 2026-08-17 after the owner's manual gameplay pass: countdown, betting, dive, multiplier growth, cash out, crash, round restart and multi-round stability all verified in the browser, including Commit 8's bet-basis behavior. The Sprint 3 close-out summary and retrospective are recorded in `docs/15_PROGRESS.md`. Phase 5 of `docs/04_DEVELOPMENT_ROADMAP.md` is complete.

Close-out validation (2026-08-17, post-restore environment — git 2.55.0 / Node 24.19.0 / npm 11.17.0): `tsc --noEmit` clean; **83/83 tests green**; production build passes; lint at the 9 + 6 baseline (modulo the CRLF reinstall artifact listed under recovery items).

## Next: Sprint 4 — User Interface (Phase 6). MUST NOT BEGIN WITHOUT APPROVAL.

- Blueprint: `docs/07_UI_ARCHITECTURE.md` (status: proposed). Sprint 4's Commit 1 is the review/approval of that document — approval makes it binding and ratifies its five sanctioned deltas (§7). Extraction commits follow per its §17 order, one per approval.
- The engine (`src/engine`) and renderer (`src/rendering`) are **read-only contracts** for the whole sprint (docs/07 §20 risk 1).

## Open recovery items (post-Windows-reinstall; each needs its own approval and its own commit)

1. **Line-ending normalization**: 11 working-tree files are CRLF (reinstall artifact; causes 426 phantom prettier errors on `src/components/AbyssAnchor.tsx`); normalize to LF and add a `.gitattributes` enforcing LF so it cannot recur.
2. **Stable `main` branch**: the remote has only `develop`; `docs/18_GIT_WORKFLOW.md` requires a stable `main`.
3. **Scaffold leftovers**: stale `bun.lock` / `bunfig.toml` (the project is standardized on npm) and outdated Lovable references in `AGENTS.md` (the repository is now `pupsystores-glitch/AQUADIVE2026`).

Standing rules (unchanged):

- One step per commit; behavior-preserving unless a delta is explicitly sanctioned and ratified; game playable after every commit.
- Per-commit validation gate: `tsc --noEmit` clean; lint at the recorded baseline (9 + 6); all tests green; manual gameplay pass; console hygiene.
- Follow `docs/18_GIT_WORKFLOW.md`: verify → commit → push → wait for approval.
- `docs/05_RENDERING_ARCHITECTURE.md` and `docs/06_ENGINE_ARCHITECTURE.md` are binding contracts — on any conflict with reality, the commit stops and the document is corrected first.
