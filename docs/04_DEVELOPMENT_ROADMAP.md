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
- **Sprint 4 — Phase 6 (User Interface) per `docs/07_UI_ARCHITECTURE.md` (TASK 007): 🔄 IN PROGRESS** (blueprint approved 2026-08-17).
  - U1–U5 are committed. Browser QA for U4b and U5 is pending. *(2026-11-14: the owner reports 10 consolidated checks passed. The full 19-item gate for U4b, U5 and M1 is still pending; see docs/16.)* *(2026-11-14, later: the owner confirms **all 19/19 detailed browser QA checks passed** — U4b 6/6, U5 7/7, M1 6/6. The U4b and U5 browser QA is complete.)*
  - M1 (Money Integrity) is implemented, including W11 (approved and implemented 2026-11-14, docs/07 §23.21). Its browser QA passed (19/19, owner-confirmed 2026-11-14). It is uncommitted and not closed, pending only the owner's separate authorization of the local S1 commit (no push).
  - M2 is deferred. It includes the integer-cent ledger, B-R.
  - Next: U6, then U7, each after owner approval. *(Original line: "Sprint 4 — next: … status: proposed; its review/approval is Sprint 4's Commit 1".)*

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

Status: 🔄 In Progress (Architecture Blueprint delivered in TASK 002; the rendering portion is persisted as `docs/05_RENDERING_ARCHITECTURE.md` — Sprint 2, Commit 1. Remaining portions, e.g. server protocol design, are persisted as their phases activate)

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

Status: Pending

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

Status: Pending

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

Status: Pending

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