# AQUADIVE DEVELOPMENT ROADMAP

## Purpose

This document defines the long-term development roadmap for the AQUADIVE platform.

AQUADIVE is not just a game.

It is an enterprise-grade multiplayer HTML5 Crash Game Platform.

Development must follow this roadmap.

Never skip phases.

Never work ahead without approval.

---

## Sprint Log

Sprints are the execution units of this roadmap; each sprint delivers into one or more phases.

- **Sprint 1 — Foundation Improvements (TASK 004): ✅ COMPLETED** (2026-07-17). Config/constants/types extraction, folder structure, shared utilities — feeds Phase 3. (Deferred: `sampleJackpot` move, scheduled as its own commit.)
- **Sprint 2 — Rendering Architecture (TASK 005): ✅ COMPLETED** (2026-07-18). `docs/05_RENDERING_ARCHITECTURE.md` blueprint (Phase 2 rendering deliverable) + extraction commits R1–R5 — delivers Phase 4 in full and advances Phase 3.
- **Sprint 3 — Game Engine (TASK 006): ✅ COMPLETED** (closed 2026-08-17; commits delivered 2026-07-18 → 2026-07-19). `docs/06_ENGINE_ARCHITECTURE.md` blueprint + extraction commits E1–E6 + bet-basis fix — delivers Phase 5 in full and advances Phase 3.
- **Sprint 4 — Phase 6 (User Interface) per `docs/07_UI_ARCHITECTURE.md` (TASK 007): ✅ COMPLETED** (closed 2026-11-15; blueprint approved 2026-08-17). *(Status before the close-out: 🔄 IN PROGRESS.)*
  - U1–U5 are committed. Browser QA for U4b and U5 is pending. *(2026-11-14: the owner reports 10 consolidated checks passed. The full 19-item gate for U4b, U5 and M1 is still pending; see docs/16.)* *(2026-11-14, later: the owner confirms **all 19/19 detailed browser QA checks passed** — U4b 6/6, U5 7/7, M1 6/6. The U4b and U5 browser QA is complete.)*
  - M1 (Money Integrity) is implemented, including W11 (approved and implemented 2026-11-14, docs/07 §23.21). Its browser QA passed (19/19, owner-confirmed 2026-11-14). It is uncommitted and not closed, pending only the owner's separate authorization of the local S1 commit (no push).
  - M2 is deferred. It includes the integer-cent ledger, B-R.
  - Next: U6, then U7, each after owner approval. *(Original line: "Sprint 4 — next: … status: proposed; its review/approval is Sprint 4's Commit 1".)*
  - *Reconciliation (2026-11-14), current state:*
    - **M1** landed as `e37b81c` (S1), with its held-back test suites in `e8b1b62`. The owner then **deferred M1** to the final stabilization phase. It is **not closed**. **M2**, which now includes **B-R**, is tracked separately and not started.
    - **U6 and U7** landed together in `4440009`. U7 includes the owner's two layout corrections (docs/07 §15). The U6 mobile pixel-compare and the U7 screenshot matrix are still pending (docs/07 §19 gates 7–8).
    - **Dual Bet (E-X3)**, an owner-approved engine freeze exception (docs/06 §13.2), landed in `be10b19`. Its owner browser QA is not yet recorded.
    - All of these commits are on `origin/develop`.
    - Next, in the original order: the Sprint 4 close-out. Phase 7 follows only after Sprint 4 closes and the owner approves.
  - *Close-out Step 2 (2026-11-14):* agent-run browser QA at all 7 matrix sizes, four `src/ui` QA fixes (uncommitted) and all automated gates are green. A draft completion report is in docs/15. **Phase 6 stays In Progress until the owner accepts** (QA fixes, §19 gates 7–8, the renderer-work decision).
  - *Close-out Step 3 (2026-11-15):* the owner accepted the visual implementation, the QA fixes D1–D4 and the renderer exception E-X4. Git reconciled: Step 2 landed in `c046b33`, the renderer visuals in `81eb985`; `develop` = `origin/develop` = `81eb985`. **Phase 6 stays In Progress:** §19 gates 7–8, the E-X3 browser QA, Git authorization and the retrospective remain. Phase 7 is not started.
  - *Official close-out (2026-11-15):* **OWNER APPROVED — 2026-11-15**: manual gameplay including Dual Bet (§19 gate 7, which also records the E-X3 browser QA) and the seven-size screenshot matrix (§19 gate 8). E-X4 formally ratified with its 19-file scope verified. Close-out commits G1 `6e28ce0` (Bonus Chest), G2 `9bded6b` (E-X4 renderer, rest), G3 `3346ed8` (`vite.config.ts`) and G4 (this documentation). Final gates: 572/572 tests across 42 files, `tsc` clean, ESLint 0 errors + 6 pre-existing warnings, build passes, SSR smoke 200. **Sprint 4 and Phase 6 are complete.** Still deferred: M1 (not closed), M2 and B-R (not started), recovery items 1–3. Retrospective in docs/15. **Phase 7 is the next planned phase. It is not started.**
- **Sprint 5 — Phase 7 (Audio & Visual Effects) per `docs/08_AUDIO_FX_ARCHITECTURE.md` (TASK 008): 🔄 IN PROGRESS** (started 2026-11-15).
  - *2026-11-15 — architecture approved; P7-0 authorized.* The owner approved the Phase 7 proposal as the basis for development: native Web Audio with a lightweight `AudioManager` (no dependency), the existing Canvas 2D renderer (no PixiJS), event-driven audio and FX, the approved underwater atmosphere preserved, and no change to the engine, RNG, money settlement, Dual Bet or gameplay outcomes. **Only P7-0 (the blueprint) is authorized.**
  - Approved sequence, one atomic commit per step: **P7-0 → A1–A4 → V1–V7 → A6 → A5 → P7-C** (docs/08 §12).
  - The renderer exception (proposed **E-X5**) and the UI exception (proposed **UI-X1**) are accepted in principle only. Their file scopes (docs/08 §13) must be ratified before those files change. `src/engine` and `src/shared` take no Phase 7 change.
  - Open owner decisions: Q3–Q12, Q14, Q15 (docs/08 §1.3), including audio assets and licensing (Q5) and device QA (Q14). No audio asset exists, and no licence is cleared.
  - **Next:** owner review of P7-0, then the owner's authorization of A1. A1 is not started. *(Superseded 2026-11-15: A1, the `AudioManager` core, is done and accepted (`3761062`). A1.1, the `AudioManager` decode interface (docs/08 §7.1), is authorized and delivered in its own commit. **A2 is next and not authorized.**)* *(Superseded 2026-11-15, later: A1.1 is in `ad9e959`. A1.2, voice pools and protected loops (docs/08 §7.2), is authorized and delivered in its own commit. **A2 is next and not authorized.**)* *(Superseded 2026-11-15, A2: the owner accepted A1.2 (`0de6d73`). A2, the sound bank and manifest (docs/08 §7.3), is authorized and delivered in its own commit. It is not wired and adds no asset. **A3 is next and not authorized.**)* *(Superseded 2026-11-15, A3: A2 is in `03bb7dc`. A3, the sound settings store (docs/08 §3.5), is authorized and delivered in its own commit. It is not wired. **A4 is next and not authorized.**)* *(Superseded 2026-11-15, A4a: A3 is in `16a6a40`, accepted with documented limitations, and A3.1 is in `e70fa22`. The owner split A4 into A4a and A4b. A4a, the Audio Director core (docs/08 §7.4), is authorized and delivered in its own commit, not pushed. It is not wired. Q7, Q8, Q9 and Q15 are approved for A4a. **A4b is next and not authorized.**)* *(Superseded 2026-11-15, A4a.1: A4a is in `289b849`. A4a.1, the loop startup correction (docs/08 §7.2, §7.4, §14 risks 15 and 15b), is authorized and delivered in its own commit. It is not wired. The Safari resume retry is deferred (docs/08 §14 risk 17). **A4b is next and not authorized.**)* *(Superseded 2026-11-15, A4b: A4a (`289b849`) and A4a.1 (`d8ab112`) are pushed to `origin/develop`; no owner acceptance of either is recorded. The owner accepted the final A4b architecture report and authorized A4b, the audio session integration (docs/08 §1.1, §7.5). It is delivered in one local commit, not pushed. **Nothing after A4b is authorized.**)*

---

# PHASE 1 — PROJECT DISCOVERY

Status: ✅ Completed

Objectives

- Understand the existing project.
- Analyze the current architecture.
- Identify strengths.
- Identify weaknesses.
- Identify technical debt.
- Produce a complete audit.

Deliverable

Project Audit Report.

---

# PHASE 2 — SYSTEM ARCHITECTURE

Status: 🔄 In Progress (Architecture Blueprint delivered in TASK 002; the rendering portion is persisted as `docs/05_RENDERING_ARCHITECTURE.md` — Sprint 2, Commit 1. Remaining portions, e.g. server protocol design, are persisted as their phases activate. *2026-11-18, P8-0 (documentation only): the server protocol design portion is drafted as a proposal in `docs/09_BACKEND_ARCHITECTURE.md` §8 and §12. It is not accepted, so Phase 2 stays In Progress.*)

Objectives

- Design the target architecture.
- Design scalable systems.
- Define responsibilities.
- Define project modules.
- Create migration strategy.

Deliverable

Complete Architecture Blueprint.

---

# PHASE 3 — CORE REFACTOR

Status: 🔄 In Progress (advanced by Sprints 1–3; the game component is now a UI shell — the remaining split is the Phase 6 UI extraction)

Objectives

- Split large components.
- Create modular architecture.
- Improve maintainability.
- Preserve existing gameplay.

Deliverable

Clean project structure.

---

# PHASE 4 — RENDERING ENGINE

Status: ✅ Completed (Sprint 2, TASK 005 — commits R1–R5, 2026-07-18)

All objectives delivered per `docs/05_RENDERING_ARCHITECTURE.md`: SceneRenderer (scene manager), Camera, five-layer model, AssetManager, RenderState contract, theme boundary, dev frame-time meter.

Objectives

- Rendering architecture
- Scene Manager
- Camera
- Layers
- Asset Manager

Deliverable

Professional rendering system.

---

# PHASE 5 — GAME ENGINE

Status: ✅ Completed (Sprint 3, TASK 006 — commits E1–E6 + bet-basis fix, closed 2026-08-17)

All objectives delivered per `docs/06_ENGINE_ARCHITECTURE.md`: fixed 60 Hz tick GameEngine facade, RoundStateMachine, DiveSimulation, typed EventBus, tick-boundary command queue, EngineDriver, snapshot/restore, RNG + RoundAuthority seams.

Objectives

- State Machine
- Round Engine
- Event System
- Multiplier Engine
- Physics
- Game Loop

Deliverable

Production-ready Game Engine.

---

# PHASE 6 — USER INTERFACE

Status: ✅ Completed (2026-11-15; Sprint 4, TASK 007, per `docs/07_UI_ARCHITECTURE.md`. U1–U7, Dual Bet (E-X3), the QA fixes D1–D4, the renderer visuals (E-X4) and the Bonus Chest redesign are committed; owner acceptance of §19 gates 7–8 recorded 2026-11-15. M1 remains deferred and not closed. *Reconciled 2026-11-14: this line read "Pending", which was stale. Before the 2026-11-15 close-out it read "🔄 In Progress … Sprint 4 close-out is pending gates 7–8".*)

Objectives

- UI Architecture
- HUD
- Betting Panel
- Notifications
- Responsive Layout

Deliverable

Professional UI Framework.

---

# PHASE 7 — AUDIO & VISUAL EFFECTS

Status: 🔄 In Progress (Sprint 5, TASK 008, started 2026-11-15, per `docs/08_AUDIO_FX_ARCHITECTURE.md`. Architecture approved by the owner 2026-11-15. P7-0, A1, A1.1, A1.2, A2, A3, A3.1, A4a and A4a.1 are done and pushed; A4b, the audio session integration, is authorized and delivered in one local commit, not pushed, awaiting the owner's review. A5, A6, V1–V7 and P7-C each need their own authorization. *(Until A4b, 2026-11-15, this read: "P7-0, A1, A1.1, A1.2, A2, A3, A3.1, A4a and A4a.1 are done; A4b, A5, A6, V1–V7 and P7-C each need their own authorization.")* *(Until A4a.1, 2026-11-15, this read: "P7-0, A1, A1.1, A1.2, A2, A3, A3.1 and A4a are done.")* *(Until A4a, 2026-11-15, this read: "P7-0, A1, A1.1, A1.2, A2 and A3 are done; A4–A6, V1–V7 and P7-C each need their own authorization.")* *(Until A3, 2026-11-15, this read: "P7-0, A1, A1.1, A1.2 and A2 are done; A3–A6, V1–V7 and P7-C each need their own authorization.")* *(Until A2, 2026-11-15, this read: "P7-0, A1, A1.1 and A1.2 are done; A2–A6, V1–V7 and P7-C each need their own authorization.")* *(Until A1.2, 2026-11-15, this read: "P7-0, A1 and A1.1 are done.")* *(Until A1.1, 2026-11-15, this read: "P7-0, the blueprint, is the only authorized step. A1–A6, V1–V7 and P7-C each need their own authorization.")* *Previous status: "Pending (next planned phase after Phase 6; not started. Planning begins only on the owner's instruction.)"*)

Objectives

- Audio Manager
- Sound Effects
- Music
- Particle Effects
- Camera Effects

Deliverable

Immersive player experience.

---

# PHASE 8 — MULTIPLAYER BACKEND

Status: Pending — **not started.** *2026-11-18, P8-0: the owner authorized Phase 8 architecture planning as an explicit documentation-only exception while the Phase 7 close-out gates stay open. The proposal is `docs/09_BACKEND_ARCHITECTURE.md` (P8-0 PROPOSAL, not approved). It authorizes no implementation; every milestone P8-1 … P8-14 (docs/09 §29) and the economy analysis E-A (docs/09 §17.4) needs its own authorization. Phase 7 remains In Progress; no Phase 7 gate is waived. Open high-priority risk E-RISK-1 (the economy, docs/09 §17) is recorded.*

*2026-11-18, P8-0E (documentation only): Phase 8 **planning** is authorized; Phase 8 **implementation** is not. Phase 7 remains **In Progress** and P7-C is not closed. P8-1 adds source files, so it would need an explicit owner **phase-gate exception** while Phase 7 is open ("Never skip phases", above), or the Phase 7 close first (docs/09 §35.1). Neither has been granted, and P8-1 has not started. E-RISK-1 is corrected to **Critical**: the never-cash-out return is ≈ 130.5× (≥ 117.4× rigorous) (docs/20 §2, docs/09 §34.1). **Owner directive:** the existing economic model is not approved for real-money operation, and AQUADIVE stays **play-money only** until a separately authorized economic redesign, independent verification and the applicable compliance reviews are complete.*

*2026-11-18, P8-1 (implementation exception): after the P8-0E documentation commits (`c110202`, `a96da57`, `6f2e2a7`, `c11ab64`), the owner authorized **P8-1 — Versioned Network Protocol Contracts** as a narrowly scoped Phase 8 implementation exception while Phase 7 remains open, and provisionally approved P1-D1 … P1-D13 (docs/09 §35.2) for implementation as **DRAFT protocol v1**. No Phase 7 gate is waived. The deliverable is the pure library `src/protocol/` (zod only; nothing in the app imports it; production build output unchanged). It is delivered in the working tree, **unstaged and uncommitted**, and awaits the owner's review. Protocol v1 stays a draft and is not released. OD-1 … OD-21 are not approved. No other Phase 8 milestone is authorized; Phase 8 as a phase is otherwise not started. AQUADIVE stays **play-money only**.*

*2026-11-18, P8-1 acceptance: the owner accepted P8-1 Draft v1 after a final safety verification and authorized one isolated local commit (not pushed). The performance gate stays **NOT VERIFIED**. Protocol v1 stays a draft; Phase 7 stays **In Progress**; P8-2 is not authorized.*

Objectives

- WebSocket
- Fastify
- Redis
- PostgreSQL
- Authentication
- Wallet
- Round Engine

Deliverable

Server-authoritative multiplayer backend.

---

# PHASE 9 — ADMIN PLATFORM

Status: Pending

Objectives

- Dashboard
- Live Players
- Live Rounds
- Monitoring
- Configuration
- Logs

Deliverable

Professional Admin Panel.

---

# PHASE 10 — PRODUCTION

Status: Pending

Objectives

- Testing
- Security
- Docker
- CI/CD
- Monitoring
- Deployment

Deliverable

Production-ready release.