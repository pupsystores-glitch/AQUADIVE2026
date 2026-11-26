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

*2026-11-18, P8-2 (implementation exception): the owner authorized **P8-2 — Server skeleton** only, with decisions A–D (docs/09 §37), including a narrowly scoped protocol exception (optional `welcome.snapshot`). The deliverable is the independent npm package `server/` (Fastify health endpoints and the WebSocket `hello` → `welcome` handshake; no game, no money, not connected to the game). It is delivered in the working tree, **unstaged and uncommitted**, and awaits the owner's review. Protocol v1 stays a **DRAFT**; Phase 7 stays **In Progress**; Phase 8 is not complete; P8-3 is not authorized. AQUADIVE stays **play-money only**.*

*2026-11-18, P8-2 final acceptance: the owner accepted P8-2 for **local development only** (not production-ready) after a final security and regression review, ratified the dependencies and the welcome amendment (docs/09 §37), and authorized two isolated local commits: the protocol amendment (`060b18e`) and the server skeleton. Not pushed. Protocol v1 stays a **DRAFT**; Phase 7 stays **In Progress**; P8-3 is not authorized.*

*2026-11-18, P8-3a (implementation exception): after the P8-3 readiness and zod security report, the owner authorized **P8-3a only — seed chain and domain-separated cryptographic derivation** — with decisions D1 – D12 (docs/09 §38). P8-3 is split into P8-3a, P8-3b (`SeededRoundAuthority`, distribution tests) and P8-3c (server crypto adapter, chain store); only P8-3a is authorized. The deliverable is the pure module `src/fairness/` (fv = 1 **internal and experimental**: not frozen, published or activated; nothing in the app or the server imports it). Owner final acceptance (same day): **approved for local development** with documented limitations (D7 Class A / Class B targets observed but not verified, open secret-lifecycle hardening, Node 22 untested; docs/09 §38.1); not production fairness certification; one isolated local commit, **not pushed**. P8-3b and P8-3c are not authorized. P8-3 is **not** complete; Phase 7 stays **In Progress**; Phase 8 is not complete; E-RISK-1 stays open. AQUADIVE stays **play-money only**.*

*2026-11-18, P8-3b-0 + P8-3b (implementation exception): after the P8-3b implementation-readiness report, the owner authorized two work packages with decisions D-B1 – D-B10 (docs/09 §39): **P8-3b-0 — secret lifecycle hardening** (R1 – R4 in `src/fairness/`; no algorithm, encoding, vector or limit change) and **P8-3b — seeded round authority and deterministic verification** (the new binding module `src/seeded-round/`, a test-only reference runner on the real engine, fixed-seed replay, draw-order, exhaustion and distribution tests; 100,000- and 1,000,000-round full-engine QA). Both were **accepted by the owner for local development on 2026-11-19** (not production fairness certification) and committed locally as two isolated commits (`afc54c8` P8-3b-0, then P8-3b), **not pushed**. Status: **P8-3a completed** (committed `7124ec9`); **P8-3b-0 and P8-3b accepted for local development**; **P8-3c not started**; **P8-4 not started**. No engine, shared, rendering, UI, audio, protocol or server change; nothing in the game or the server uses the new module. P8-3 is **not** complete; Phase 7 stays **In Progress**; Phase 8 is not complete; E-RISK-1 stays open. AQUADIVE stays **play-money only**.*

*2026-11-19, P8-3c (implementation exception, local development only): after the P8-3c architecture and security readiness report, the owner authorized three isolated work packages with the decisions of docs/09 §40: **P8-3c-0 — CommonJS fairness build integration** (two import-extension options in `server/tsconfig.json`, one relative bridge to the public fairness barrel), **P8-3c-1 — Node.js cryptographic adapter** (verified node:crypto SHA-256 / HMAC-SHA256 / randomBytes) and **P8-3c-2 — development chain vault and in-memory store** (checkpointed chain secrets, monotonic idempotent index reservation, one-time round keys, verified reveals, allow-listed records, an in-memory audit sink; development-only, refuses production). A narrow, conditional Zod S-1 gate exception covers this offline infrastructure only; S-1 stays open. **Accepted by the owner for local development on 2026-11-23** (not production fairness certification) and committed locally as three isolated commits (`965487c` P8-3c-0, `2bf7f01` P8-3c-1, then P8-3c-2), **not pushed**. Nothing in the running server, the gateway or the game uses it; no engine, seeded-round, shared, rendering, UI, audio, protocol or `src/fairness` production change. D7 stays **NOT VERIFIED**; durable recovery is P8-7; P8-4 is not authorized. Phase 7 stays **In Progress**; Phase 8 is not complete. AQUADIVE stays **play-money only**.*

*2026-11-23, P8-4-0 (implementation exception, local development only — not production activation): the owner authorized **P8-4-0 — engine build integration**: the existing engine (`src/engine`) and seeded-round binding (`src/seeded-round`), unchanged, are bundled by the server's build into one CommonJS file, `server/dist/engine/engine.cjs`, that shares the server's single compiled fairness instance. Final hardening under owner decisions D-1 – D-3 (docs/09 §41): the authority constructors are no longer exported (seeded authority only through `SeededRound`), the bundle check is syntax-aware and fails closed. The bundle **exists but the running Fastify server does not load it**; no round orchestration, RoundScript, betting, endpoint or handler. Status: acceptance gates passed 2026-11-23 under the owner's authorization; committed locally as one isolated commit `build(server): integrate and harden engine bundle (P8-4-0)` on top of `aea9bcd`, not pushed. **P8-4a is not authorized.** Zod S-1, E-RISK-1, D7, durable secret persistence and the payout policy stay open. Phase 7 stays **In Progress**; Phase 8 is not complete. AQUADIVE stays **play-money only**.*

*2026-11-23, P8-4a (implementation exception, OFFLINE DEVELOPMENT ONLY — not production activation): after the P8-4a read-only architecture review, the owner authorized a narrow, uncommitted implementation of **P8-4a — offline deterministic RoundScript precomputation** under decisions K1 – K12 (docs/09 §42): a sealed round runner inside the engine bundle (whose exports shrink to that runner), a loader with fail-closed checks, an immutable redacted `RoundScript` with canonical encoding and an internal digest, an isolated offline environment over development chains with a documented offline-only disposition, fixed-code audit events and verification after a reveal. Delivered 2026-11-23; after the acceptance corrections M-1, M-2, M-2b (run-time construction guard) and L-1, **accepted for local development only** and committed locally as one isolated commit `feat(server): add offline RoundScript precomputation (P8-4a)` on top of `f62ccee`, not pushed. **M-3 (build-integrity verification) stays unresolved and blocks any live scheduler activation**; the A1 / B1 digest candidates are not independently owner-approved; P8-7 stays open. Not connected to the server's startup, routes, gateway or any live loop. P8-4b and every later milestone are **not** authorized; D7, D10 / OD-11, OD-5, OD-9, Zod S-1 and E-RISK-1 stay open; Phase 7 stays **In Progress**; AQUADIVE stays **play-money only**.*

*2026-11-23 / 24, P8-4a-1 (implementation exception, OFFLINE DEVELOPMENT ONLY — not production activation): the owner authorized **P8-4a-1 — build integrity hardening** under decisions I1 – I9 (docs/09 §43): a reviewed, Git-tracked trusted manifest of the offline round runtime, verification before and after loading, build-time verification that fails closed, expanded independent known answers and `.gitattributes`. Delivered uncommitted for review; after an independent final acceptance review **accepted for local development only (2026-11-24)** and committed locally as one isolated commit `feat(server): add build integrity verification (P8-4a-1)` on top of `011facc`, not pushed. **M-3 is addressed within the trusted-build model only** — the in-process check verifies itself and is no defence against deliberate tampering of the deployed build, same-process code, TOCTOU or a rewritten manifest (docs/09 §43). Linux reproducibility and Node 22 remain unverified; the live scheduler and P8-4b are **not** authorized; AQUADIVE stays **play-money only**.*

*2026-11-24, P8-4b-0 (implementation exception, OFFLINE DEVELOPMENT ONLY — not production activation): the owner authorized **P8-4b-0 — an offline preparation worker** (`worker_threads`) and, in its final hardening, the expansion of the trusted integrity manifest to the worker's three compiled files (29 → 32 files; docs/09 §44). Delivered and reviewed; after a final acceptance re-verification **ACCEPTED FOR OFFLINE LOCAL DEVELOPMENT ONLY (2026-11-24)** and committed locally as one isolated commit `feat(server): add isolated round preparation worker (P8-4b-0)` on top of `7ecfe67`, not pushed; P8-4b-1 and the live scheduler are **not** authorized. No scheduler, network integration, settlement or durable storage; D7 **NOT VERIFIED**; `MemoryChainStore` is not durable (P8-7); D10 / OD-11, C4 / OD-8, A-1 and A-2 stay open; AQUADIVE stays **play-money only**.*

*2026-11-24, P8-4b-1 (implementation exception, OFFLINE DEVELOPMENT ONLY — not production activation): the owner authorized **P8-4b-1 — hardened and bounded RoundScript verification** (docs/09 §45): one private copy before any read, a proved byte cap (196,608 B), a rejection-only prescan, verification resumable in bounded slices (`RoundScriptVerification`) used by the preparation controller through one serial event queue, plus the P8-4b-0 lifecycle fixes (halt mirroring, start timeout, bounded request ids). Trusted manifest: 32 files, 5 entries changed (owner-approved), bundle unchanged. After an independent acceptance audit **ACCEPTED FOR OFFLINE LOCAL DEVELOPMENT ONLY (2026-11-24)** and committed locally as one isolated commit `perf(server): harden and optimize RoundScript verification (P8-4b-1)` on top of `2994be1`, not pushed. The Global Scheduler and live scheduling are **not** authorized; D7 stays **NOT VERIFIED**; `MemoryChainStore` is not durable (P8-7); D10 / OD-11, C4 / OD-8, A-1 and A-2 stay open; AQUADIVE stays **play-money only**.*

*2026-11-25, P8-4b-2 (implementation exception, OFFLINE DEVELOPMENT ONLY — not production activation): the owner authorized **P8-4b-2 — the offline deterministic Global Round Scheduler** under decisions SD-1 … SD-10 (docs/09 §46). Implemented 2026-11-25; the independent acceptance audit concluded **ACCEPT ONLY AFTER SPECIFIC CORRECTIONS**; the owner-authorized security corrections H-1 (options read once: no source substitution), M-1 (module-private seal opener), L-1 (clock safety) and L-2 (contained asynchronous failures) are applied. Status: **IMPLEMENTED, SECURITY CORRECTIONS APPLIED, BUT NOT YET FINALLY ACCEPTED OR COMMITTED** (uncommitted, not pushed). Trusted manifest still 40 files, 5 scheduler entries changed (`421ca5ed…`), bundle unchanged. No reveal protocol (P8-4b-3 not authorized), network, betting or settlement; not production-ready. D7 (**NOT VERIFIED**), D10 / OD-11, P8-7, A-1 / A-2, F-1 / F-2 / F-4, SD-9 / F-6 and C4 / OD-8 stay open; AQUADIVE stays **play-money only**. The owner later committed P8-4b-2 as `5d90e5f`. R-1 (a replaced source `claim` let same-process code play a chosen 77.77×) was then remediated under an R-1-only authorization in `server/src/scheduler` (one-time binder, source-authenticated seals, frozen modules, references bound at load, process-wide one-scheduler record; docs/09 §46). **R-1b** (forged results through the controller's verifier path: RoundScript verification, canonical check, message parser, worker entry / class / environment) was then remediated under an R-1b authorization in `server/src/prep` and `server/src/round` (references bound at load, module-private worker entry, explicit worker environment, frozen modules); its candidate `d2704520…` supersedes the R-1 candidate `24d3b8df…`. After independent re-verification the owner approved the R-1 / R-1b checkpoint: candidate `d2704520…` installed as the trusted manifest; **R-1 and R-1b REMEDIATED FOR OFFLINE DEVELOPMENT**. Shared-built-in patches remain a limit only process isolation removes: the isolated authority process is the owner-approved direction — **Stage 1 — Isolated Authority Host (offline development)** is the next planned work package, **not implemented and not authorized**. Offline development only; P8-4b-2 is **not production-ready**.*

*2026-11-26, Stage 1 (implementation exception, OFFLINE DEVELOPMENT ONLY — not production activation): the owner authorized **Stage 1 — Isolated Authority Host** on baseline `e403f35` (docs/09 §47). The offline Global Round Scheduler, its preparation worker, verification, seals, disclosure, chain and clock now run in a dedicated Node.js child process (the Authority, `server/src/authority/`), launched with the Node permission model, a fixed environment and two one-way pipes; the application process holds only a relay that retrieves tick-public events by sequence number over a strictly validated, bounded IPC protocol, and fails closed on any loss or violation (no restart). Vectors A / B unchanged. Trusted manifest `b44264d2…` (44 files) installed (owner-approved) and verified. Status: **IMPLEMENTED; ACCEPTED WITH CONDITIONS FOR OFFLINE LOCAL DEVELOPMENT ONLY** (owner, 2026-11-27; server Vitest 986 passed + 5 todo, 0 failed; root Vitest 2,586 passed, 0 failed; scoped ESLint on the 15 Stage 1 code files 0 errors / 0 warnings, full-project ESLint not completed; one local checkpoint commit authorized, not pushed). **Not production-ready.** Same-OS-user isolation only: a separate OS user / supervisor (Stage 2) is required before any network activation and is not authorized; P8-4b-3, live gameplay and production stay out of scope; AQUADIVE stays **play-money only**.*

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