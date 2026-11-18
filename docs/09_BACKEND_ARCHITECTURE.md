# BACKEND ARCHITECTURE — Phase 8 (Multiplayer Backend)

**P8-0 PROPOSAL — DOCUMENTATION ONLY — NOT APPROVED — PHASE 8 NOT STARTED.**

- **Date:** 2026-11-18
- **Authorization:** the owner's P8-0 instruction of 2026-11-18. P8-0 is an explicit, documentation-only exception: Phase 8 *planning* may happen while the Phase 7 close-out gates stay open. It does not authorize any Phase 8 implementation.
- **Phase status, unchanged by this document:** Phase 7 is **IN PROGRESS** (TASK 008 active; P7-C not authorized; see `docs/19_PHASE7_CLOSEOUT_READINESS.md`). No Phase 7 gate is waived or completed by P8-0. Phase 8 is **not started**. Phase 2 stays **In Progress**: this document drafts its remaining "server protocol design" portion, and that portion counts as delivered only after the owner accepts it.
- **Scope:** architecture, contracts and a milestone plan for the Phase 8 server-authoritative multiplayer backend. It changes no source file, dependency, build configuration or deployment configuration.
- **Basis:** `AGENTS.md`; every document in `/docs` (00–08, 14–19, 99); the engine source in `src/engine` (`rng.ts`, `round-authority.ts`, `simulation.ts`, `state-machine.ts`, `game-engine.ts`, `domain/*`); `src/shared` (`stake.ts`, `world.ts`); `src/network/README.md`; `src/ui/session.ts` and the wallet-store contract (docs/07 §10, §23); `package.json`, `vite.config.ts`, `bunfig.toml`, `.lovable/`, `src/lib/lovable-error-reporting.ts`. Repository state verified at `HEAD` = `01b061e` (see §33).

Companion contracts, all binding and unchanged: `docs/05_RENDERING_ARCHITECTURE.md` (renderer), `docs/06_ENGINE_ARCHITECTURE.md` (engine; §11 RNG boundary, §14 snapshots, §16 backend contract and §17 multiplayer readiness are this document's starting point), `docs/07_UI_ARCHITECTURE.md` (session, stores, M1 money integrity in §23), `docs/08_AUDIO_FX_ARCHITECTURE.md` (Phase 7).

---

## 0. How to read this document

### 0.1 Decision classes

Every decision below carries one of three labels. Nothing is in force because it appears here.

| Label | Meaning |
|---|---|
| **APPROVED** | Already decided by the owner and recorded elsewhere (cited). Restated, not re-decided. |
| **RECOMMENDED** | This document's proposal. Becomes binding only when the owner approves this document or the milestone that uses it. |
| **OWNER DECISION (OD-n)** | Cannot be settled by engineering judgment. Listed with options and a recommendation in §31. Work that depends on it is blocked until it is answered. |

### 0.2 Evidence labels

- **Verified (code)** — read from the source at `01b061e` during P8-0.
- **Verified (calc)** — computed during P8-0 with a standalone script outside the repository (no repo change). The script restates the code's formulas; it does not import the engine.
- **Recorded** — written in the official records before P8-0 (doc and section cited).
- **Unverified** — an assumption or target. Every performance number in §28 is a target, not a measurement.

### 0.3 Naming

Phase 8 milestones are named **P8-1 … P8-14** to avoid collisions with the money-integrity tasks **M1** / **M2** (docs/07 §23) and with the "blueprint milestones M2 / M4 / M5" quoted in `src/network/README.md` and `src/shared/README.md`. Those blueprint milestones come from TASK 002's chat-delivered blueprint, which was never persisted to `/docs` (docs/15, TASK 002). Where this document conflicts with those README references, this document is the proposal of record; the READMEs are corrected only in the milestone that touches those folders.

### 0.4 Non-claims

This document does **not** claim that AQUADIVE is licensed, certified, audited, compliant or ready for real-money operation. It does not state a target RTP and does not choose one. It does not choose a business model. Real-money operation requires separate legal, regulatory, compliance and independent RNG/game certification work, outside engineering (§30).

---

## 1. Executive summary

**What Phase 8 builds (proposed).** One Node.js service (Fastify + native WebSocket) that runs **one global AQUADIVE round** at a time, decides every outcome itself, accepts and settles every bet itself, and records every financial fact in a **PostgreSQL double-entry ledger in integer minor units**. Clients become **replicas**: they render the round and submit commands; they never decide a multiplier, a crash, a jackpot, a chest or a payout.

**What is reused.** The engine was designed for this (docs/06 §16). Its domain functions (outcome distributions, multiplier curve, descent, creature tables, tuning) and its deterministic fixed-tick simulation run **unchanged** on the server through the public `GameEngine` facade, with two server-side implementations of existing interfaces: a seeded `Rng` and a seeded `RoundAuthority`. No engine, domain or settlement file needs to change for the server to *decide* rounds (§10.2).

**What does not carry over unchanged — two contract gaps found by P8-0.**

1. **Client replica mode needs an engine change.** `RoundAuthority` is synchronous and is called at the transition (`sampleCrashPoint()` at entry(diving), `state-machine.ts:324`). A client cannot be handed the crash point at dive start without disclosing it. docs/06 §16's "swap two injected modules" is therefore true for the *server*, but not sufficient for the *client*: replica mode needs an owner-approved engine freeze exception (proposed **E-X8**, §27.3).
2. **The world stream is outcome-relevant.** Goldfish (world stream) add up to +0.4 to the multiplier and speed the descent (`simulation.ts:126-162`). Whether a round crashes or reaches the sea floor, and the multiplier at any cashout tick, depend on the world seed as well as the crash point. The provably-fair commitment must therefore cover **both** streams (§16).

**The open economic risk.** A conservative calculation from the code (§17.2) shows that a player who never cashes out reaches the sea floor in at least ≈ 14.5 % of rounds and is then paid at least 50× the stake. That alone implies an expected return of **at least ≈ 7.26× the stake for that strategy**, before the jackpot and chest averages are applied. This is recorded as **OPEN HIGH-PRIORITY RISK E-RISK-1**. No RTP is asserted or chosen here; a separate economy-analysis task (**E-A**, §17.4) is proposed. **No real-value operation is possible before E-A is completed and an economic model is approved.**

**Recommended first implementation.** Play-money only; one region; one active round authority with a fenced standby; identity and wallet behind ports so that both business models (independent platform, B2B operator integration) stay open without being built (§4). Protocol and a money-free server skeleton come first; money comes only after the round loop, the protocol and the provably-fair module are proven (§29).

---

## 2. Starting point — what exists today

### 2.1 Contracts the backend inherits (APPROVED, recorded)

| Contract | Where | What it gives Phase 8 |
|---|---|---|
| Determinism: `state(n+1) = f(state(n), commands, rngDraws)` | docs/06 §7 | Server-side precompute, replay, dispute audit, verification |
| Fixed 60 Hz tick, simulation clock only | docs/06 §7–§8 | Tick-indexed timing authority (§11) |
| Two RNG streams, `outcome` and `world` | docs/06 §11; `src/engine/rng.ts` | Separate commitment and disclosure per stream |
| `RoundAuthority` seam (`sampleCrashPoint`, `sampleJackpot`, `rollBonusChests`) | docs/06 §16; `src/engine/round-authority.ts` | Server outcome source without touching the state machine |
| Commands are the future protocol messages | docs/06 §13 | `placeBet {slot, amount}`, `cashOut {slot}`, `pickChest {chestId}` |
| Edge-triggered events, post-tick dispatch | docs/06 §12 | Server event stream ⇄ protocol messages 1:1 |
| Snapshot secrecy classes (AuthoritySnapshot / PublicSnapshot) | docs/06 §14 | Public vs private snapshot contracts (§12) |
| Money never enters the engine | docs/06 §3 | Settlement moves server-side without engine change |
| Valid stake = positive whole cents (`isValidStake`) | `src/shared/stake.ts`; E-X2 | Server-side stake predicate, reused |
| Payouts rounded **down**, exact arithmetic (M1-D13) | docs/07 §23.13, §23.16 | Server payout rule |
| Non-finite / negative multipliers never credit (M1-D14) | docs/07 §23.17 | Server settlement guard |
| Wallet guards are tripwires, not authentication | docs/07 §23.15 | The real boundary is the server (this document) |
| Dual Bet: two slots, per-slot settlement, one chest pick per round | docs/06 §13.2; docs/07 §23.17 | Server bet identity `(round, player, slot)` |
| E-X1 is local-only; the server must run the bonus phase on its own schedule | docs/06 §5 | Global bonus schedule (§15.3) |

### 2.2 Known limitations that become server requirements (Recorded, docs/07 §23.15)

| ID | Limitation today | Phase 8 requirement |
|---|---|---|
| V4 | `events.emit` is public; forged finite events move money locally | Server is the only source of settlement; clients never send events |
| V5 | Live references from `getPublicState()` | Server serializes copies; never hands engine objects to transport |
| V6 | `restore()` unvalidated; wallet not in snapshot | Clients receive validated snapshots; wallet state arrives separately from the server |
| V7 | Authority outputs unvalidated | Server-side multiplier contract: finite, ≥ 1, ≤ named caps (§18.5) |
| — | `snapshot()` exposes `crashAt` | Server sends only PublicSnapshots (§12) |
| — | `advance(NaN)` freezes the engine | Server driver passes only the constant `TICK_SECONDS` (§10.3) |
| L2 | Affordability cannot be engine-enforced | Server ledger enforces affordability atomically (§19) |
| L6 / M2 | Float ledger | Integer minor units in PostgreSQL (§19) |

### 2.3 Facts read from the code (Verified, code)

- Crash point: `r < 0.03 → 1.0`, else `max(1.01, min(0.99 / (1 − u), 200))` — `src/engine/domain/outcomes.ts:21-29`. One or two outcome draws.
- Jackpot: bands 50 % → 50–100×, 35 % → 100–200×, 15 % → 200–500×, `toFixed(2)` — `outcomes.ts:33-40`. Two draws.
- Chests: per chest `r < 0.6 → 1–3×`, `< 0.92 → 3–10×`, else `10–50×`, `toFixed(2)` — `outcomes.ts:42-54`. Six draws.
- Final bonus multiplier: `+(jackpot × chest).toFixed(2)` — `state-machine.ts:302`.
- Multiplier curve `m(t) = e^(0.085·t)` — `domain/multiplier.ts`. Boost adds `boost × 0.4`, boost ∈ [0, 1] — `simulation.ts:126-131`, `domain/tuning.ts`.
- Crash check `m ≥ crashAt` happens **after** the boost bonus is added and **before** descent — `simulation.ts:133-134`. Goldfish therefore make the multiplier reach `crashAt` earlier in time.
- Descent speed `(120 + min(520, m^0.95 · 28)) × (1 + 0.8 · boost)` px/s; sea floor at `CHAIN_MAX_DEPTH` = 4200 — `simulation.ts:137-139`, `src/shared/world.ts`.
- Creature spawning and kinds draw from the world stream, six draws per creature plus one jitter draw — `domain/creatures.ts`, `simulation.ts:141-145`. Goldfish probability is 4 % per creature in every depth band.
- The engine holds **one local participant with two slots** (`participants: [slot 0, slot 1]`, docs/06 §13.2). It has no notion of other players.

### 2.4 Repository and tooling facts relevant to Phase 8 (Verified)

- One package at the repository root (`package.json` name `tanstack_start_ts`), TanStack Start + Vite 8 + React 19. **Two lockfiles** are tracked: `package-lock.json` and `bun.lock` (plus `bunfig.toml`). This is a pre-existing ambiguity about the package manager (OD-3).
- `zod` 3.24 is already a runtime dependency: the protocol schemas need **no new dependency** (§9.1).
- `vitest` 4 is the test runner; Vitest must be run from PowerShell on this machine (recorded tooling note).
- `src/server.ts` is the TanStack Start SSR entry (built by Nitro, default target Cloudflare per the comment in `vite.config.ts`). It is **not** a game server and must not become one (§26).

---

## 3. Phase 8 MVP scope and non-goals (RECOMMENDED)

### 3.1 MVP scope

1. One global round loop, server-authoritative, running the existing engine headless.
2. Protocol v1 over native WebSocket: handshake, versioning, round events, public snapshots, private player state, commands, acknowledgements, errors.
3. Spectating without an account.
4. Accounts and authentication for **play-money** credits (exact identity model: OD-13).
5. PostgreSQL double-entry ledger in integer minor units, play-money currency only (OD-2, OD-15).
6. Bets (Dual Bet: two slots), manual cashout, crash loss, sea-floor jackpot auto-cash, global bonus chest phase, settlement.
7. Provably-fair commitment and post-round verification, including a public verification endpoint and a reference verifier.
8. Reconnect and resynchronization, including mid-round join.
9. Single active round authority with lease + fencing; deterministic, audited recovery.
10. Structured logs, metrics, health/readiness endpoints, an append-only audit trail.
11. The client keeps **local mode** as the default until each network milestone is accepted (§27).

### 3.2 Non-goals for Phase 8 (explicit)

- **Real-money operation** of any kind: deposits, withdrawals, payment providers, KYC/AML, responsible-gambling tooling, jurisdiction licensing (§30). Blocked by E-RISK-1 regardless.
- Any change to outcome distributions, the multiplier curve, tuning or RTP (E-A is separate, §17.4).
- B2B operator integration (designed as a port only, §4).
- Admin panel (Phase 9). Phase 8 exposes only the operational endpoints in §23.
- Multiple games, multiple concurrent rounds, tournaments, chat, achievements, leaderboards, auto-cashout.
- Horizontal scale beyond one active authority; multi-region.
- Microservices, Kubernetes, service mesh.
- Lovable removal (separate track, §26).
- Binary wire formats (JSON first; binary only if measured necessary, §8.10).

---

## 4. Business model alternatives (analysis; OD-1 — not chosen)

### 4.1 The two models

**A. Independent platform.** AQUADIVE owns user accounts, authentication and an internal wallet. Players hold balances with AQUADIVE.

**B. B2B casino integration.** AQUADIVE is a game provider. Operators (casinos) authenticate players and own the wallet; AQUADIVE calls the operator's wallet API to debit stakes and credit wins ("seamless wallet"), or receives transferred funds ("transfer wallet").

### 4.2 Comparison

| Dimension | A — Independent platform | B — B2B operator integration |
|---|---|---|
| **Architecture** | Identity, wallet, payments, back-office all in-house. One ledger is the money source of truth | Game server + round engine + operator gateway. The operator's wallet is the money source of truth; AQUADIVE keeps a *mirror* ledger of game transactions for reconciliation |
| **Authentication** | Own accounts: passwords/OAuth, sessions, MFA, account recovery, abuse handling | Launch token from the operator (per session), validated against the operator; no AQUADIVE passwords. Per-operator trust configuration |
| **Wallet responsibility** | AQUADIVE holds player funds (with real money: safeguarding, segregation, audits) | Operator holds funds. AQUADIVE must never double-debit or lose a credit across an unreliable network |
| **Settlement** | Local ACID transaction: debit, credit, escrow in one PostgreSQL transaction | Distributed: each bet = remote debit call; each win = remote credit call; rollbacks; retries with idempotent transaction IDs; reconciliation reports. Bet acceptance latency includes the operator's API |
| **Security** | Full surface: credential storage, account takeover, payments fraud, multi-accounting | Smaller identity surface; new surface: operator API credentials, request signing, per-operator isolation, replay of operator callbacks |
| **Legal / compliance** | Heaviest: AQUADIVE is the gambling operator (licence per jurisdiction, KYC/AML, RG, data protection, payments) | Game-supplier obligations: supplier licensing in many jurisdictions, game and RNG certification, per-operator contractual requirements. Operator handles player KYC/payments |
| **Integration cost** | High one-time platform cost; no per-partner cost | Moderate core cost; **recurring per-operator cost** (each operator or aggregator API differs); certification per market |
| **Scalability** | Scales with own player base; marketing cost | Scales through partners' traffic; spiky multi-tenant load |
| **White-label** | Natural for "skins" of one platform | Natural: per-operator branding, currency, limits, language (docs/07 §18 skin surface: strings + theme + `EngineConfig`) |

### 4.3 Recommendation (RECOMMENDED; the choice itself is OD-1)

**Build neither fully. Build the round authority once, and put identity and money behind two ports:**

```
IdentityPort  — authenticate(session credential) → PlayerContext { playerId, tenantId, currency, limits }
WalletPort    — reserveStake(betId, amount) / settleWin(betId, amount) / settleLoss(betId) / voidBet(betId)
                every call idempotent on a deterministic transaction id
```

- **Phase 8 implements exactly one adapter for each:** `InternalIdentity` (play-money accounts or guests, OD-13) and `InternalLedgerWallet` (PostgreSQL double-entry, play-money currency).
- **The round authority never calls the database or an operator directly.** It produces decisions; the settlement service applies them through the `WalletPort`. This keeps model B possible: a future `OperatorSeamlessWallet` adapter replaces the local transaction with remote calls plus an outbox (§20.5), without changing the round loop.
- `tenantId` exists in the schema from day one (one tenant, `default`). This is the only multi-tenant cost paid now; it is what makes white-label and operator separation cheap later.
- What is **not** built: payments, KYC, operator adapters, per-tenant configuration UI.

Why this is not over-engineering: the ports are two small interfaces with one implementation each, and they are needed anyway to test the round loop without a database. Why it preserves flexibility: model A adds payment and KYC modules beside `InternalLedgerWallet`; model B adds an operator adapter. Neither requires reopening the round, protocol or ledger design.

**Consequence of OD-1 on the plan:** P8-1 … P8-11 are identical under A and B. The choice must be made before any real-value milestone (none is in Phase 8).

---

## 5. System architecture (RECOMMENDED)

### 5.1 Process model: one service, modular inside

```
                ┌──────────────────────── aquadive-server (Node.js 22 LTS, one process) ───────────────────────┐
 browser ──WSS──▶ Gateway module        Round module                Settlement module         Persistence    │
 (client)       │  ws connections ─────▶ RoundOrchestrator ─decide─▶ SettlementService ──tx──▶ PostgreSQL   │
                │  auth, rate limit      (engine, headless)          WalletPort (internal)      (source of    │
 browser ──HTTPS▶ HTTP API (Fastify)     ProvablyFair (seeds)        BetBook                    truth)        │
                │  /health /ready        LeaseKeeper (fencing) ──────────────────────────────────▶            │
                │  /auth /verify         Clock (monotonic)                                                    │
                │  /rounds/:id                                       Outbox dispatcher ──▶ (Redis, later)     │
                └──────────────────────────────────────────────────────────────────────────────────────────────┘
                   standby instance: same binary, LeaseKeeper waiting; gateway may serve read-only/spectators
```

- **One deployable service** with internal modules and enforced import boundaries (§6.3). Modules: `gateway`, `http`, `round`, `fairness`, `settlement`, `ledger`, `identity`, `persistence`, `ops`.
- **One active round authority per game instance** (game = AQUADIVE, one global round). A standby process runs the same binary and takes over only through the lease protocol (§21).
- **Why not microservices now (RECOMMENDED: no).** The money-critical path is bet → ledger → acknowledgement inside one round tick. Splitting gateway, round and wallet into services adds network hops, partial failure modes and distributed transactions to exactly the path that must be atomic, for a load one process handles. The module boundaries in §6.3 are drawn so that the gateway can later be split out (horizontal WebSocket fan-out, §22) and the wallet can be replaced by an operator adapter (§4) — the two splits with a real trigger. Trigger to split: measured gateway CPU or connection limits (§28), not anticipation.

### 5.2 Request paths

| Path | Flow | Durability before acknowledgement |
|---|---|---|
| Spectate | client ⇄ gateway ⇄ round (broadcast) | None needed |
| Place bet | client → gateway (validate, auth, rate limit) → round (phase check at receipt tick) → settlement (ledger tx) → round (accept) → client ack | Ledger transaction committed |
| Cash out | client → gateway → round (decide tick + multiplier at receipt) → settlement (ledger tx) → client ack | Cashout row + ledger entries committed |
| Crash / floor / bonus | round → settlement (batch tx) → broadcast | Round result row committed before `round.ended` |
| Verify | HTTP GET → persistence (revealed seeds only) | Read-only |

### 5.3 Technology (RECOMMENDED; each new dependency is OD-4/milestone-gated)

| Concern | Recommendation | Note |
|---|---|---|
| Runtime | Node.js 22 LTS | Same JS engine family as Chrome (V8) for the reference verifier (§16.9) |
| HTTP | Fastify 5 | Schema-first, pino logging built in, low overhead |
| WebSocket | `@fastify/websocket` (wraps `ws`) | Native protocol; §7 |
| Validation | `zod` (already a dependency) | Shared client/server schemas |
| PostgreSQL client | `pg` (node-postgres) with explicit transactions; SQL migrations as plain files | No ORM for the ledger: every statement must be reviewable |
| Redis | `ioredis` — **only from P8-12**, if needed | §22 |
| Crypto | Node `crypto` (HMAC-SHA256, SHA-256, `randomBytes`) | No third-party crypto |
| Passwords (if model A accounts) | Argon2id (`argon2` package) | OD-13 |
| Tests | Vitest (existing); real PostgreSQL in CI | §28 |

No package is added by P8-0.

---

## 6. Monorepo and package boundaries (RECOMMENDED; layout is OD-3)

### 6.1 Constraint

The repository is a Lovable-connected single package at the root. Lovable expects the web app at the root and syncs the connected branch (AGENTS.md). `package.json`, the lockfiles, `vite.config.ts` and `AGENTS.md` must not change in P8-0, and any later change to them is an owner decision with a Lovable compatibility check.

### 6.2 Target layout (staged)

**Stage S1 — no root change (recommended start, P8-1 … P8-11).**

```
/                          ← web app, unchanged (Lovable root)
├── src/
│   ├── engine/            ← unchanged; consumed by the server through its facade + domain
│   ├── shared/            ← dependency floor; unchanged except protocol-adjacent additions by approval
│   ├── protocol/          ← NEW (P8-1): wire types, zod schemas, codec, error codes, version constants
│   ├── fairness/          ← NEW (P8-3): pure seed derivation, SeededRng, SeededRoundAuthority, verifier
│   ├── network/           ← WsRoundService, replica adapters (P8-6); README already reserves this
│   └── ui/ …              ← unchanged until P8-6/P8-10
└── server/                ← NEW (P8-2): own package.json + lockfile, own tsconfig, own build
    ├── src/{gateway,http,round,settlement,ledger,identity,persistence,ops}/
    ├── migrations/        ← plain SQL, numbered
    └── test/
```

- `server/` is an **independent package**, not a workspace member, so the root `package.json` and lockfiles stay untouched. It consumes `src/engine`, `src/shared`, `src/protocol` and `src/fairness` by path (TypeScript `paths` in `server/tsconfig.json` mapping `@/*` → `../src/*`) and bundles them in its own build.
- `src/protocol` and `src/fairness` live under `src/` because both the client and the server import them and both must be pure (no Node, no DOM imports).

**Stage S2 — workspaces (after the Lovable independence decision, OD-17).** Move `src/engine`, `src/shared`, `src/protocol`, `src/fairness` into `packages/game-core`, `packages/protocol`, `packages/fairness`; the web app into `apps/web`; the server into `apps/server`. This is a mechanical move with its own commit and needs a root `package.json` change, so it is deferred.

### 6.3 Import rules (enforceable by lint in P8-2)

| Module | May import | Must not import |
|---|---|---|
| `src/protocol` | `src/shared`, `zod` | engine internals, `src/ui`, React, DOM, Node |
| `src/fairness` | `src/engine` facade types + `Rng`/`RoundAuthority` interfaces + `domain/outcomes` (read-only use), `src/shared` | Node `crypto` directly (crypto is injected, §16.6), DOM |
| `server/src/round` | engine facade, `src/fairness`, `src/protocol` types | `pg`, `ledger`, gateway sockets |
| `server/src/settlement` | `ledger` via `WalletPort`, `src/protocol` types | engine, sockets |
| `server/src/ledger` | `pg` | engine, round, gateway |
| `server/src/gateway` | `src/protocol`, round/settlement **interfaces** | `pg`, engine internals |
| client `src/ui`, `src/network` | `src/protocol`, `src/fairness` (verifier only) | `server/` (never) |

The server importing `src/engine/domain/*` crosses docs/06 §4's "facade is the only public surface" rule. Only `src/fairness` needs it (to bind `sampleCrashPoint`, `sampleJackpot`, `rollBonusChests` to per-purpose streams, §16.5). **OD-10b:** either approve this read-only use, or export these three functions (or a `createRoundAuthority(rngs)` factory) from the engine facade in a one-line freeze exception. Recommended: the facade export (keeps §4's rule intact).

### 6.4 Code reuse summary

| Reused unchanged | Added beside it | Changed only by an owner-approved exception |
|---|---|---|
| `domain/*`, `simulation.ts`, `state-machine.ts`, `game-engine.ts`, `events.ts`, `commands.ts`, `rng.ts` interface, `round-authority.ts` interface, `src/shared/stake.ts`, `world.ts` | `SeededRng`, `SeededRoundAuthority`, `RoundScript` precompute, server driver, protocol schemas | Client replica mode (E-X8, §27.3); facade export of outcome functions (OD-10b) |

---

## 7. Transport: native WebSocket versus Socket.io (RECOMMENDED: native)

| Criterion | Native WebSocket (`ws` via `@fastify/websocket`) | Socket.io |
|---|---|---|
| Wire protocol | RFC 6455 only; our own versioned envelope | Engine.IO + Socket.IO framing on top; client must use the Socket.io client |
| Fallbacks | None (all target browsers support WebSocket) | HTTP long-polling fallback — unnecessary, and it complicates sticky sessions |
| Rooms / broadcast | Implemented by us (one global round: trivial) | Built in |
| Acknowledgements | Implemented by us (`reqId` → `ack`, needed anyway for idempotency) | Built in, but not idempotent across reconnects |
| Reconnect | Implemented by us with resync semantics we control | Built in, but its buffering can replay stale commands after reconnect — dangerous for cashouts |
| Bundle size (client) | 0 (browser API) | ≈ 10–15 kB min+gz client library |
| Horizontal scale | Our own fan-out (Redis pub/sub or direct, §22) | Redis adapter available |
| Performance | Lower overhead; path to `uWebSockets.js` if measured necessary | Extra framing and allocations |
| Interop | Any client, any language, load-testing tools speak it directly | Requires Socket.io-aware tools |
| Security review | Smaller surface | Larger surface (polling transport, adapter) |

**Recommendation: native WebSocket.** The features Socket.io adds are either unnecessary (fallbacks, rooms for a single global round) or must be re-implemented with stricter semantics anyway (idempotent acknowledgements, resync after reconnect). Its automatic buffering of emits during a disconnect is a hazard for a crash game: a buffered `cashOut` delivered seconds later must be judged at its server receipt time, which is what our protocol does explicitly.

---

## 8. Protocol v1 (RECOMMENDED; the remaining Phase 2 "server protocol design" portion)

### 8.1 Principles

1. **Server-authoritative.** Client messages are *requests*; the server answers with an acknowledgement and broadcasts facts. A client never sends an event, a multiplier, a payout, a balance, a timestamp the server trusts, or an outcome.
2. **Commands keep the engine's shapes** (docs/06 §13): `placeBet {slot, amount}`, `cashOut {slot}`, `pickChest {chestId}`, with an added request id, round id and integer amount.
3. **Event names correspond 1:1 to engine events** (docs/06 §16).
4. **Money on the wire is integer minor units as a decimal string** (`"amountMinor": "1250"`). Never a float, never a JSON number for money (JSON numbers lose integers above 2^53 and invite float parsing).
5. **Multipliers on the wire are decimal strings** produced by one shared formatter, plus the authoritative tick. Display multipliers are derived on the client from the shared curve; *settlement* multipliers are only ever server-sent.
6. **Every message is validated by a zod schema** at both ends; unknown message types are rejected; unknown fields are rejected (`.strict()`).
7. **Versioned from the first byte.**

### 8.2 Envelope

```jsonc
// every frame is one UTF-8 JSON object
{
  "v": 1,                 // protocol major version (integer)
  "t": "bet.place",       // message type (namespace.verb)
  "id": "01JD…",          // client: request id (ULID/UUIDv4), required on commands; server: message id
  "seq": 1842,            // server → client only: per-connection sequence, strictly increasing
  "ts": "1731940000123",  // server → client only: server wall-clock ms (informational; never trusted back)
  "p": { … }              // payload, schema per type
}
```

- Max frame size: **4 KiB** client → server, **64 KiB** server → client (snapshots). Larger frames close the connection with code 1009.
- `seq` lets the client detect gaps (§13.3).

### 8.3 Version negotiation

- The client sends `hello { protocol: { min: 1, max: 1 }, client: { build, platform } }` as its first frame, within 5 s of connect.
- The server answers `welcome { protocol: 1, … }` or `error { code: "PROTOCOL_UNSUPPORTED", supported: {min, max} }` and closes with 4001.
- **Compatibility rule:** within a major version, the server may add optional payload fields and new message types only behind a client-announced capability (`hello.capabilities: ["x"]`); the client ignores message types it did not request. A breaking change bumps `v`; the server supports `v` and `v−1` during a documented deprecation window (OD-default: 30 days).
- The protocol version is independent of the engine snapshot schema version (`SNAPSHOT_SCHEMA_VERSION` = 3) and of the fairness scheme version (`fv`, §16).

### 8.4 Connection lifecycle

```
connect (WSS, Origin checked) → hello → [auth.resume | anonymous] → welcome{snapshot}
  → steady state (broadcasts + commands) → ping/pong every 10 s → close
server close codes: 1000 normal · 1001 going away (deploy, includes retryAfterMs) · 1008 policy · 1009 too big
                    4001 protocol unsupported · 4003 auth failed/expired · 4008 rate limited · 4009 superseded (newer session)
```

- **One active authenticated session per player** (OD-default). A new login supersedes the old connection (4009). Spectator connections are unlimited per IP up to the rate limits (§9.5).

### 8.5 Client → server messages

| Type | Payload | Phase rule (server receipt tick) | Ack |
|---|---|---|---|
| `hello` | `{protocol:{min,max}, client:{build, platform}, capabilities?: string[]}` | any | `welcome` / `error` |
| `auth.resume` | `{ticket}` (one-time WS ticket, §9.3) | any | `auth.ok {player}` / `error AUTH_*` |
| `bet.place` | `{roundId, slot: 0\|1, amountMinor, currency}` | betting phase of `roundId` | `bet.accepted` / `bet.rejected` |
| `bet.cashout` | `{roundId, slot: 0\|1}` | diving phase of `roundId` | `bet.cashedOut` / `bet.rejected` |
| `bonus.pick` | `{roundId, chestId: 0\|1\|2}` | bonus pick window of `roundId`, eligible player | `bonus.pickAccepted` / `bonus.pickRejected` |
| `sync.request` | `{lastSeq?, roundId?}` | any | `sync.snapshot` |
| `ping` | `{clientTs}` (client's own clock, echoed only) | any | `pong` |

Not in v1 (OD-19): bet cancellation, auto-cashout, chat. Bet cancellation does not exist in the engine (no cancel command, docs/07 §23.12 F1) and is excluded by default.

### 8.6 Server → client messages

**Public (broadcast to every connection):**

| Type | Payload (abridged) | Sent |
|---|---|---|
| `welcome` | `{protocol, serverTime, sessionId, player?: PlayerPrivateState, snapshot: PublicSnapshot, tickHz: 60}` | after `hello` |
| `round.betting` | `{roundId, roundNumber, commitment: {fv, chainIndex, hash}, opensAtTick, closesAt (server ms), bettingMs}` | entry(betting) |
| `round.dive` | `{roundId, startServerMs, startTick, world: WorldDisclosure}` | entry(diving) |
| `round.world` | `{roundId, fromTick, creatures: CreatureDTO[]}` | ahead of need, if OD-5 = stream (§16.7) |
| `round.sync` | `{roundId, tick, multiplier, boost, worldY}` | 10 Hz while diving (OD-default) |
| `round.boost` | `{roundId, tick, creatureId}` | on goldfish consumption (server fact) |
| `round.crashed` | `{roundId, tick, multiplier}` | entry(crashed) |
| `round.impact` | `{roundId, tick, jackpotMultiplier}` | entry(impact) |
| `round.bonus` | `{roundId, pickClosesAtServerMs, pickWindowMs}` | entry(bonus) — **chest values are not sent** |
| `round.chests` | `{roundId, chests: [m0, m1, m2]}` | when the pick window closes (§15.4) |
| `round.ended` | `{roundId, outcome: "crash"\|"jackpot", terminalTick, crashMultiplier?, jackpot?, chests?, reveal: {serverSeed, worldSeed, …}}` | after the round result is committed |
| `feed.bets` | `{roundId, entries: [{alias, slot, amountMinor, cashoutMultiplier?}]}` | batched ≤ 4 Hz, capped list (privacy: alias only) |
| `server.notice` | `{kind: "drain"\|"maintenance", retryAfterMs?}` | before planned shutdown |

**Private (to the owning player only):**

| Type | Payload |
|---|---|
| `bet.accepted` | `{reqId, betId, roundId, slot, amountMinor, balanceMinor}` |
| `bet.rejected` | `{reqId, roundId, slot, code}` |
| `bet.cashedOut` | `{reqId, betId, roundId, slot, tick, multiplier, payoutMinor, balanceMinor}` |
| `bet.lost` | `{betId, roundId, slot}` |
| `bet.jackpot` | `{betId, roundId, slot, jackpotMultiplier, bonusEligible: true}` |
| `bonus.pickAccepted` / `bonus.pickRejected` | `{reqId, roundId, chestId}` / `{reqId, roundId, code}` |
| `bet.settled` | `{betId, roundId, slot, finalMultiplier, payoutMinor, balanceMinor}` |
| `wallet.balance` | `{balanceMinor, currency, ledgerSeq}` |
| `error` | `{reqId?, code, retryable}` |

### 8.7 Error and rejection codes (stable strings; never user-facing text)

Engine-compatible: `not-in-betting`, `already-participating`, `invalid-amount`, `invalid-slot`, `not-diving`, `not-participating`, `already-cashed-out`, `not-bonus-eligible` (docs/06 §12–§13.2). Server additions: `ROUND_MISMATCH`, `INSUFFICIENT_FUNDS`, `STAKE_LIMIT`, `ROUND_EXPOSURE_LIMIT`, `DUPLICATE_REQUEST` (returns the original result), `RATE_LIMITED`, `AUTH_REQUIRED`, `AUTH_EXPIRED`, `PROTOCOL_UNSUPPORTED`, `MALFORMED`, `SERVER_BUSY`, `ROUND_VOIDED`, `INTERNAL`. Wording stays in `src/ui/strings.ts` (docs/07 §14).

### 8.8 Example sequence (one jackpot round, one player, two slots)

```
S→ round.betting {roundId: R, commitment: {fv:1, chainIndex: 9_999_812, hash: "ab…"}}
C→ bet.place {id: q1, roundId: R, slot: 0, amountMinor: "500", currency: "AQC"}
S→ bet.accepted {reqId: q1, betId: B0, balanceMinor: "99500"}
C→ bet.place {id: q2, roundId: R, slot: 1, amountMinor: "200", currency: "AQC"}
S→ bet.accepted {reqId: q2, betId: B1, balanceMinor: "99300"}
S→ round.dive {roundId: R, startTick: 0, world: {…}}
S→ round.sync ×N (10 Hz)
C→ bet.cashout {id: q3, roundId: R, slot: 1}
S→ bet.cashedOut {reqId: q3, betId: B1, tick: 912, multiplier: "3.6411", payoutMinor: "728", balanceMinor: "100028"}
S→ round.impact {tick: 1206, jackpotMultiplier: "142.18"}
S→ bet.jackpot {betId: B0, bonusEligible: true}
S→ round.bonus {pickClosesAtServerMs: …, pickWindowMs: 6000}
C→ bonus.pick {id: q4, roundId: R, chestId: 2}
S→ bonus.pickAccepted {reqId: q4}
S→ round.chests {chests: ["2.31", "7.04", "1.12"]}
S→ bet.settled {betId: B0, finalMultiplier: "159.24", payoutMinor: "79620", balanceMinor: "179648"}
S→ round.ended {outcome: "jackpot", reveal: {serverSeed: "…", worldSeed: "…"}}
```

(Values illustrative. The settlement multiplier precision and rounding are OD-7.)

### 8.9 Sequencing and ordering guarantees

- Per connection, server messages are delivered in `seq` order (single socket, TCP).
- Within a round, public facts are emitted in engine order: `round.betting` < `round.dive` < (`round.crashed` | `round.impact` < `round.bonus` < `round.chests`) < `round.ended`.
- A private `bet.*` message for a decision taken at tick *k* is sent after the public `round.sync` for tick ≥ *k−1* and before `round.ended`.
- `round.ended` is sent only after the round's settlement transaction has committed (§18.3).

### 8.10 Encoding and bandwidth (Unverified estimates)

JSON, permessage-deflate **off** by default (CPU and compression-oracle concerns; enable only after measurement). Estimated steady-state per spectator while diving: 10 × `round.sync` (~90 B) + feed batches ≈ 1–3 kB/s. A binary codec is a later, measured optimization behind the same schemas.

---

## 9. Message validation and authentication (RECOMMENDED)

### 9.1 Validation pipeline (gateway, before any module sees a message)

1. Frame size ≤ 4 KiB; UTF-8; `JSON.parse` in a try/catch; reject depth > 4.
2. Envelope schema (`v`, `t`, `id`, `p`), `.strict()`.
3. Per-type payload schema (zod, from `src/protocol`). `amountMinor` must match `^[1-9][0-9]{0,15}$` (positive integer, ≤ 16 digits) and is parsed with `BigInt`.
4. Semantic checks that need no state: `slot ∈ {0,1}`, `chestId ∈ {0,1,2}`, currency allowed for the tenant.
5. Authentication state: money commands require an authenticated session.
6. Rate limit (§9.5).
7. Only then is a typed command handed to the round module, stamped with the **server receipt time** (monotonic, §11.1) and the player context.

The engine's own validation (E-X2 `isValidStake` on the major-unit amount derived from `amountMinor`, phase guards) runs again inside the round module. Defence in depth: the gateway's checks never replace the engine's.

### 9.2 Identity models (OD-13)

| Option | Description | Fit |
|---|---|---|
| I-1 Guest (device-bound play-money) | Anonymous account created on first visit, token in an `HttpOnly` cookie | Lowest friction; no recovery; abuse via account farming |
| I-2 Email + password | Argon2id hashes, email verification, reset flow | Model A; more surface |
| I-3 OAuth / OIDC (Google, Apple) | Delegated identity | Model A; less credential risk |
| I-4 Operator launch token | B2B; validated against operator | Model B (later) |

Recommended for Phase 8: **I-1 plus I-3**, behind `IdentityPort`; I-2 only if required. I-4 is a later adapter.

### 9.3 Session and WebSocket authentication

- HTTP login issues a server-side session (opaque 256-bit token, stored **hashed** in PostgreSQL, `HttpOnly; Secure; SameSite=Lax` cookie, 24 h idle / 7 d absolute).
- **WebSocket ticket:** the client calls `POST /ws-ticket` (cookie-authenticated, CSRF-protected), receives a one-time, 30-second, single-use ticket, and sends it in `auth.resume` over the open socket. Tokens never appear in URLs (no query-string tokens: they leak into logs and proxies).
- The `Origin` header is checked against an allow-list at upgrade (cross-site WebSocket hijacking).
- Session revocation closes live sockets (4003) within 1 s.
- No JWTs in Phase 8 (revocation and key rotation cost; opaque sessions are simpler and sufficient for one service). Revisit if gateways split out.

### 9.4 Authorization

- Spectators: receive public messages only.
- Players: may only act on their own bets; `betId`/`playerId` are never taken from the client.
- Ops endpoints (§23) on a separate port/interface, not exposed publicly, authenticated by mTLS or a network policy (OD-4).

### 9.5 Rate limits (initial, RECOMMENDED; tune after load tests)

| Scope | Limit | On exceed |
|---|---|---|
| New connections per IP | 20 / min | HTTP 429 at upgrade |
| Frames per connection | 30 / s burst 60 | `RATE_LIMITED`, then close 4008 |
| `bet.place` per player per round | 2 accepted + 10 attempts | `RATE_LIMITED` |
| `bet.cashout` per slot per round | 5 attempts (first valid wins) | ignored after acceptance |
| `/ws-ticket` per session | 10 / min | 429 |
| Unauthenticated `hello` timeout | 5 s | close 1008 |

In P8 MVP (single process) limits live in memory; with multiple gateways they move to Redis (§22).

---

## 10. Server-authoritative round lifecycle (RECOMMENDED)

### 10.1 Components

- **`RoundOrchestrator`** — owns the global timeline: betting window, dive, terminal transition, bonus pick window, settlement barrier, next round. It is the server's only writer of round state.
- **`RoundScript`** — the precomputed, secret, deterministic run of one round (§10.2).
- **`BetBook`** — the round's bets for **all** players and both slots, keyed `(roundId, playerId, slot)`. Lives beside the engine because the engine holds only one local participant (§2.3).
- **`SettlementService`** — turns orchestrator decisions into ledger transactions via `WalletPort`.
- **`FairnessService`** — seeds, commitments, reveals (§16).

### 10.2 Engine reuse on the server: the precomputed `RoundScript`

A round's outcome is a pure function of its seeds: no player command influences the world (cashouts flip a flag; they do not change the simulation, docs/06 §5 "manual cashout is not a transition"). Therefore:

1. At round creation, the server builds a fresh `GameEngine` with `world = SeededRng(worldSeed)` and `authority = SeededRoundAuthority(outcomeSeed)` (§16.5), **no participants**.
2. It advances the engine **one tick at a time** with `advance(TICK_SECONDS)` (the only `advance` argument the server ever passes; no wall clock, no `NaN` path) through the betting countdown and the dive until `crashed` or `shipImpact` fires.
3. It records, per dive tick *k*: the tick-authoritative multiplier `m_k` (`getPublicState().multiplier`), boost, `worldY`, and goldfish consumption events; plus `terminalTick`, the outcome kind, `crashAt` or the jackpot, and the three chest values.
4. The script is stored **in memory only** for the live round and is reproducible from the seeds at any time (recovery, audit, verification). Its secret parts are never logged or persisted before reveal (§16.8).

Cost: ≤ 300 betting ticks + ≤ 1290 dive ticks of closed-form math per round (docs/06 §19: "well under 1 ms/tick") — Unverified, to be measured in P8-4 (target: precompute < 50 ms).

**Why precompute rather than run live:** the live loop then cannot diverge from the verifiable record; timing jitter or a slow event loop cannot change an outcome; recovery is "rebuild the script from the seeds"; and verification uses exactly the code that decided the round. The engine is used unchanged through its public facade.

**What the server does not use from the engine:** its local participant slots, its E-X1 local bonus rule, its countdown as the source of wall-clock timing. The orchestrator owns those globally (§10.4).

### 10.3 Server tick scheduler

- Round time is tick-indexed: dive tick *k* has the scheduled wall instant `T_k = T_dive + k × 16.667 ms` on the **monotonic** clock (`process.hrtime.bigint()`).
- The scheduler wakes on a timer (target 4 ms granularity), computes the current tick from monotonic time, and processes every tick it has passed **in order** — it never drops ticks (unlike the client driver's catch-up cap, which exists for tab-switch behaviour, docs/06 §7).
- Ticks are processed by looking up the `RoundScript`; there is no live simulation step to be late.
- Event-loop lag is measured continuously (§23). If lag exceeds a threshold (OD-default 250 ms), the orchestrator stops accepting new bets for the next round and alerts; an in-flight round continues on schedule because decisions are tick-indexed by receipt time (§11).

### 10.4 Global timeline (default durations from `domain/tuning.ts`; changing any is an owner decision)

```
BETTING   ─ bettingMs = 5000 (BETTING_WINDOW_SECONDS) ─┐
SETTLE-IN ─ barrier ≤ 300 ms: wait for in-flight bet commits (bets received before close) ─┐
DIVING    ─ until terminalTick (script) ─┬─ crash → CRASHED (CRASH_BANNER_MS = 2400) ─┐
                                         └─ floor → IMPACT (SHIP_IMPACT_TO_CHESTS_MS = 1400)
                                                  → BONUS (pick window BONUS_PICK_WINDOW_MS = 6000, global)
                                                  → REVEAL (CHEST_RESULT_TO_IDLE_MS = 2200) ─┤
SETTLE-OUT ─ commit round settlement; then round.ended + seed reveal ─────────────────────────┘
NEXT ROUND ─ new commitment published with round.betting
```

- **SETTLE-IN (new):** a bet received before close is accepted only if its ledger transaction commits before the dive starts. The barrier bounds the wait (OD-default 300 ms); a bet whose commit has not completed by then is rejected `SERVER_BUSY` and its transaction is rolled back or, if it committed late, voided by a compensating transaction (§20.4). This keeps "every accepted bet is debited before the dive" exact.
- **The bonus phase always runs its pick window on the server** when the round reached the floor, regardless of any single player (the E-X1 limitation recorded in docs/06 §5).

### 10.5 Phase gates for commands (server receipt tick decides)

| Command | Accepted iff |
|---|---|
| `bet.place` | `roundId` = current round, phase = BETTING at receipt, receipt ≤ close instant, stake valid, within limits, affordable (ledger) |
| `bet.cashout` | `roundId` current, phase = DIVING, bet open for that slot, receipt boundary tick ≤ `terminalTick` (§11.3) |
| `bonus.pick` | `roundId` current, phase = BONUS, receipt before `pickClosesAt`, player has ≥ 1 eligible slot, no earlier accepted pick |

---

## 11. Crash and cashout timing authority (RECOMMENDED; the latency policy is OD-8)

### 11.1 Clocks

| Clock | Owner | Used for |
|---|---|---|
| Server monotonic (`hrtime`) | Orchestrator | Tick schedule, receipt times, all ordering decisions |
| Server wall (UTC, NTP-disciplined) | Server | Human-readable timestamps, logs, `ts` field. **Never** for ordering |
| Client clock | Client | Display only; offset estimated from `ping`/`pong` |

### 11.2 Receipt time

A command's receipt time is the monotonic instant the gateway finished reading its frame, captured **before** validation, queueing or any `await`. It is recorded with the decision (`receivedMonoNs`, `boundaryTick`).

### 11.3 Cashout ordering rule (mirrors engine delta D4)

The engine applies commands at the next tick boundary, **before** that tick's step, using the last completed tick's multiplier (docs/06 §7.1 D4; `simulation.ts` `multiplier` getter). The server applies the same rule to wall-clock receipt:

- A cashout received in `(T_{k−1}, T_k]` is applied at boundary *k* with multiplier `m_{k−1}`.
- It succeeds iff tick *k−1* was not terminal, i.e. **`k − 1 < terminalTick`**. A cashout whose boundary is the terminal tick itself (`k = terminalTick`) still succeeds at `m_{k−1}`, exactly as the engine would apply a command drained before the crash tick's step.
- On the floor tick, a manual cashout at boundary `terminalTick` is a manual cashout (not bonus-eligible), matching the engine's per-slot rule (docs/06 §13.2).

Ties are impossible to resolve unfairly: two cashouts with the same boundary get the same multiplier; ordering inside a tick does not change any amount.

### 11.4 Latency policy (OD-8)

| Option | Rule | Trade-off |
|---|---|---|
| L-0 (recommended) | Server receipt only; no compensation | Simple, auditable, not manipulable; high-latency players are disadvantaged (industry norm) |
| L-1 | Grace: accept a cashout received ≤ *g* ms after the terminal instant if the client's last acknowledged `round.sync` predates the crash | Fairer feel; manipulable by delaying acks; complicates audit |
| L-2 | Client-timestamped cashouts | **Rejected:** a client clock is attacker-controlled |

### 11.5 Disclosure of the crash

- The crash is first disclosed by `round.crashed`, sent at the terminal tick. `round.sync` cadence, payload size and timing **must not** change before the crash (no "last sync skipped", no earlier flush): the sync stream is generated from the script uniformly up to and including the terminal tick, so its timing carries no information (timing side channel, §24).
- The gateway never knows `terminalTick` in advance; it relays what the orchestrator emits each tick.

### 11.6 Client display synchronization

The client estimates server time offset with an NTP-style filter over `ping`/`pong` (min-RTT sample of the last 8). It extrapolates the displayed multiplier from the shared curve between `round.sync` messages (docs/06 §17) and snaps to server values on each sync. The displayed value is presentation; the settlement value is always the server's `bet.cashedOut.multiplier`.

---

## 12. Public and private snapshot contracts (RECOMMENDED)

### 12.1 Classes (extends docs/06 §14 secrecy classes)

| Class | Audience | Contains | Never contains |
|---|---|---|---|
| **AuthoritySnapshot** | Server memory only | Everything, incl. seeds, `crashAt`, `terminalTick`, jackpot and chest values before disclosure | — |
| **PublicSnapshot** | Every connection | Round id/number, phase, commitment, betting close instant, dive start, current tick, multiplier, boost, `worldY`, disclosed world data (§16.7), disclosed outcome facts (crash multiplier after crash, jackpot after impact, chests after window close), public bet feed summary | `crashAt`, `terminalTick`, unrevealed jackpot/chests, seeds before reveal, other players' identities beyond alias |
| **PlayerPrivateState** | The owning player | Balance, own bets per slot (state, stake, cashout tick/multiplier, eligibility, own pick), pending request ids | Other players' private data |

### 12.2 PublicSnapshot schema (v1, abridged)

```ts
interface PublicSnapshotV1 {
  schema: "public-snapshot"; v: 1;
  roundId: string; roundNumber: string;            // bigint as string
  phase: "betting" | "diving" | "crashed" | "impact" | "bonus" | "reveal";
  commitment: { fv: number; chainIndex: string; hash: string };
  betting?: { closesAtServerMs: string };
  dive?: { startServerMs: string; tick: number; multiplier: string; boost: string; worldY: string };
  world?: WorldDisclosure;                           // §16.7
  crash?: { tick: number; multiplier: string };       // only after crash
  impact?: { tick: number; jackpotMultiplier: string };// only after impact
  bonus?: { pickClosesAtServerMs: string; chests?: [string, string, string] }; // chests only after window
  feed: { players: number; totalStakeMinor: string; recent: FeedEntry[] };
  serverTimeMs: string;
}
```

### 12.3 Relation to the engine snapshot

The client engine's `EngineSnapshot` (schema v3) is **not** sent over the wire. In replica mode the client builds its engine state from a PublicSnapshot plus deterministic world data (§27.3). Keeping the wire schema separate means engine schema bumps do not break the protocol and secrets cannot leak through a forgotten engine field (docs/07 §23.15: `snapshot()` exposes `crashAt`).

### 12.4 Rule: snapshot builders are allow-lists

PublicSnapshots are built field by field from an allow-list and validated by the outbound schema before send; a unit test asserts that a PublicSnapshot built at every phase of a scripted round contains no field outside the schema and no value equal to an undisclosed secret.

---

## 13. Reconnect and synchronization (RECOMMENDED)

### 13.1 Reconnect flow

1. Client reconnects with exponential backoff and jitter (0.5 s → 8 s cap).
2. `hello` → `auth.resume` (new ticket via HTTP; the cookie session survives) → `welcome { snapshot, player }`.
3. The client discards its replica state and rebuilds from the snapshot (docs/06 §17: join-in-progress = restore + render).
4. **Pending requests:** the client re-sends any unacknowledged command **with the same `id`**. The server's idempotency store (§20.1) returns the original result if it was processed, or processes it now **judged at its new receipt time** (a stale cashout is not back-dated).
5. Private state in `welcome.player` is authoritative; the client wallet store replaces its balance and slot state with it (docs/07 §18: server wallet swap = one module).

### 13.2 Mid-round join

A spectator or player joining during a dive receives the PublicSnapshot at the current tick and the world disclosure needed to render (§16.7). They may not bet in the current round (phase rule) but see it correctly from the first frame.

### 13.3 Gap detection

If the client sees a `seq` gap, or no `round.sync` for 2 s while diving, it sends `sync.request` and resumes from the returned snapshot. The server keeps no per-connection replay buffer in Phase 8 (snapshots are cheap; buffers are memory and complexity).

### 13.4 Server restart

Clients receive `server.notice {drain}` (planned) or a dropped socket (unplanned), and reconnect. Round continuity across authority failure is governed by §21.4.

---

## 14. Dual Bet handling (RECOMMENDED; preserves E-X3 semantics, APPROVED)

- **Bet identity:** `betId` (UUIDv7, server-generated) with the natural unique key `(roundId, playerId, slot)`. A player has at most two bets per round, one per slot.
- Each slot is independent for placement, cashout, crash loss and settlement — as E-X3 and the per-slot wallet amendment (docs/07 §23.17) define locally.
- **Affordability across slots** is exact on the server: each `bet.place` is its own ledger transaction under the player's account row lock (§20.2), so two simultaneous bets can never together exceed the balance. The client's in-flight reservation (docs/07 §8) remains a UX convenience only.
- **Jackpot:** at the floor tick, every open slot is auto-cashed at the jackpot and becomes bonus-eligible (E-X1 per slot).
- **Bonus:** one pick per **player** per round, applied to all of that player's eligible slots (E-X3: one pick per round applies to every eligible slot). Per-slot payouts are computed and rounded separately (per-slot settlement, docs/07 §23.17).
- **Limits:** per-slot stake limits and per-player per-round limits are tenant configuration (OD-12; Q1 remains open).

---

## 15. Goldfish, jackpot and bonus chest handling (RECOMMENDED)

### 15.1 Goldfish

Goldfish placement and consumption are server facts derived from the world stream and the simulation (`simulation.ts:141-158`). They change the multiplier path (+ up to 0.4) and the descent speed, hence the floor-reach tick and every cashout multiplier. They are therefore **outcome-relevant** and covered by the commitment (§16.2). The server emits `round.boost {tick, creatureId}` at consumption so that every client shows the same boost, even if its local float simulation drifts (§16.9).

### 15.2 Jackpot

- Drawn from the outcome stream's `jackpot` purpose (§16.5) at round creation (inside the precompute), disclosed by `round.impact`.
- **Exposure:** a floor round pays every open stake at ≥ 50× and up to 500× × chest (≤ 50×). Round liability is unbounded by design today. A per-round exposure cap or per-bet maximum win is an economic control decided only after E-A (OD-12). Until then the server enforces **only play-money** operation.

### 15.3 Bonus phase (global, replaces the local E-X1 rule on the server)

- Entered only on floor rounds, on the server's schedule, for everyone.
- Pick window = 6 s (`BONUS_PICK_WINDOW_MS`), global.
- Eligibility per slot as in §14. Ineligible players and spectators see the phase but cannot pick.
- **Default on expiry:** chest 0 for players who did not pick (preserves E-X1's default; OD-9 may choose otherwise).

### 15.4 Chest values: one triple per round, revealed after the window (OD-9)

Today the `chestsRevealed` event carries all three values at bonus entry (docs/06 §12); the UI hides them, but the client holds them. In multiplayer this would let any client (or a colluding group) pick the best chest. Recommended rule:

- One chest triple per round (outcome stream `chests` purpose), committed with the round.
- `round.bonus` carries **no values**. Picks are recorded privately during the window.
- At window close, `round.chests` reveals all three values to everyone; each player's settlement uses their own pick.
- Expected value is unchanged by the pick rule (values are i.i.d. and hidden), so this is a security fix, not an economic change. Alternative per-player chest permutations (OD-9 option) are unnecessary once values are hidden until close.

### 15.5 Final multiplier

`finalMultiplier = +(jackpot × chest).toFixed(2)` (`state-machine.ts:302`) is the engine's definition and is reused verbatim. The payout derived from it follows §18.4 and OD-7.

### 15.6 Settlement timing for jackpot bets (OD-20)

Today the client credits the jackpot at impact and the chest delta at the pick (docs/07 §10). Recommended for the server: **one settlement per bet at bonus resolution** using the final multiplier (one credit, one transaction, no partial state across a failure between impact and pick). The UI shows "jackpot locked" at impact. This changes when the balance moves (a presentation change), not how much.

---

## 16. Outcome RNG and provably-fair design (RECOMMENDED; open choices in §16.10)

### 16.1 Investigation of the existing streams (Verified, code)

| Stream | Draw sites | Draws per round | Outcome relevance |
|---|---|---|---|
| `outcome` | `sampleCrashPoint` (entry diving), `sampleJackpot` (entry impact), `rollBonusChests` (entry bonus) | 1–2 + (2 + 6 if floor) | Directly: crash point, jackpot, chests |
| `world` | `rollCreature` (6 draws per creature), spawn jitter (1 per creature) | ≈ 7 × (creatures spawned); creatures spawn every ≈ 43–52 world px up to 900 px ahead | **Indirectly but materially:** goldfish (4 % of creatures) → boost → multiplier path (+ ≤ 0.4) and descent speed → whether the floor is reached, the floor tick, and every cashout multiplier |

Consequences:

1. The outcome stream alone does not determine the round. **Crash vs floor is a function of `crashAt` and the world path**: the floor is reached iff `crashAt` exceeds the maximum multiplier the path attains before tick `terminalTick`. That maximum depends on goldfish timing.
2. Because one sequential `outcome` stream serves three purposes, the crash point's variable draw count (1 or 2) shifts the positions of the jackpot and chest draws. A verifier must replay the exact draw order. Per-purpose sub-streams remove this coupling (§16.5) without changing any distribution.
3. Today both streams are `Math.random` (`rng.ts`): not seedable, not committable, not verifiable — the accepted TASK 001 flaw.

### 16.2 Requirements

| # | Requirement |
|---|---|
| F1 | Every bit of randomness that can affect any payout — crash point, jackpot, chests **and the world stream** — is fixed by a commitment published **before** betting opens for that round |
| F2 | No secret (seed or derived value) is disclosed before its disclosure event; the commitment reveals nothing (preimage-resistant) |
| F3 | After the round, anyone can verify: (a) the revealed seed matches the commitment; (b) re-running the reference computation from the seeds reproduces every outcome fact, including the terminal tick and the multiplier at every tick |
| F4 | The server cannot choose seeds round by round after seeing bets (pre-generated chain, §16.3) |
| F5 | Verification does not depend on the client's local RNG or on `Math.random` |
| F6 | All terminal events (crash, impact, chests, settlement) are produced only by the server |
| F7 | Seeds are generated by a CSPRNG, stored encrypted, accessible only to the authority process, rotated by chain |

### 16.3 Scheme: pre-committed reverse hash chain + public salt (recommended; OD-6)

- Generate a 256-bit random `x_N` with a CSPRNG. Compute the chain backwards: `x_{i} = SHA-256(x_{i+1})` for `i = N−1 … 0`.
- **Chain commitment:** publish `x_0` (the *terminating hash*, never used as a round seed), the chain length `N` and the scheme version `fv`, with a timestamp, on the verification page and in `audit_log`, **before** the chain's first round.
- **Use order:** round *j* of the chain (j = 1, 2, …) uses seed `s_round = x_j`. Seeds are therefore used in the reverse order of their generation, and every revealed seed satisfies `SHA-256(x_j) = x_{j−1}`: anyone can check the whole chain link by link back to the published `x_0`, so the server cannot have changed any seed after the chain was committed.
- **Per-round commitment:** `round.betting.commitment.hash = SHA-256(s_round) = x_{j−1}` — published before bets. It equals the previous round's revealed seed, so it is checkable both before (it matches what was revealed last round) and after (the new reveal hashes to it).
- **Public salt:** to prove the operator did not search for a favourable chain, the chain commitment also names a **future public randomness value** (e.g. a specified future block hash of a public blockchain, or a drand beacon round) that did not exist when `x_0` was published. Every derivation includes it (§16.4). Choice of salt source: OD-6.
- **Chain length:** OD-default 10,000,000 rounds (≈ 4 years at 1 round / 12 s). Rotation: a new chain is generated and committed before the current one runs out, or immediately after any suspected compromise (§16.8).

Alternative (OD-6 option B): per-round random server seed with `H(seed)` published at betting open, mixed with **client seeds** from the first *n* bettors (common in some crash games). It adds player contribution but makes the outcome depend on who bet first, complicates spectator verification, and the server still sees client seeds before close. Recommended: option A (hash chain + public salt), which is the established pattern for single global crash rounds.

### 16.4 Derivation

All values are derived with HMAC-SHA256 keyed by the round seed, domain-separated by scheme version, round number, purpose and counter:

```
block(purpose, i) = HMAC-SHA256(key = s_round,
                                msg = "AQUADIVE|fv=1|" + salt + "|" + roundNumber + "|" + purpose + "|" + i)
u(purpose, k)     = top 52 bits of 64-bit word (k mod 4) of block(purpose, ⌊k/4⌋), / 2^52   ∈ [0, 1)
                    (each 256-bit block = four big-endian 64-bit words; draw k is the k-th next() of that purpose)
purposes          = "crash" | "jackpot" | "chests" | "world"
```

- 52 bits per draw gives an exactly representable double in [0, 1), matching `Rng.next()`'s contract.
- Each purpose has its own counter, so the crash point's 1-or-2 draws never shift the jackpot or chest draws.
- `worldSeed` for disclosure = `HMAC-SHA256(s_round, "AQUADIVE|fv=1|" + salt + "|" + roundNumber + "|world-seed")`, so disclosing the world seed early (if OD-5 chooses that) never discloses `s_round`.

### 16.5 Server bindings (no engine change)

- `SeededRng(purposeStream)` implements the existing `Rng` interface (`next(): number`).
- `SeededRoundAuthority` implements the existing `RoundAuthority` interface: `sampleCrashPoint()` = `domain.sampleCrashPoint(rngCrash)`, `sampleJackpot()` = `domain.sampleJackpot(rngJackpot)`, `rollBonusChests()` = `domain.rollBonusChests(rngChests)`. The domain functions run **unchanged**; only the stream each one reads is separated (§6.3, OD-10b on the import path).
- The world stream feeds `DiveSimulation` via the engine constructor, exactly as today.
- `src/fairness` is pure: crypto (HMAC, SHA-256) is injected so the same module runs in Node (server) and in the browser verifier (WebCrypto, async → the verifier precomputes the needed blocks first).

### 16.6 Nonce usage

The "nonce" is the pair `(roundNumber, purpose-counter)`. `roundNumber` is a strictly increasing `bigint` assigned by PostgreSQL under the authority lease (§21). A round number is never reused, even for voided rounds (a voided round's seed is still revealed).

### 16.7 World-stream disclosure (OD-5)

| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| W-A Stream entities (recommended) | Server sends creatures in `round.world` ≥ 900 px (the existing `SPAWN_AHEAD_PX`) ahead of the anchor, plus `round.boost` facts; world seed revealed only after the round | Discloses nothing earlier than the client already shows today (creatures are pre-spawned 900 px ahead); client float drift cannot cause a visible disagreement; no cross-engine determinism requirement for live play | More bandwidth during the dive (≈ 20–25 creatures per 1,000 px; small) |
| W-B Disclose the world seed at dive start | Client simulates the world locally | Minimal bandwidth | Any client can compute the whole multiplier path and the floor threshold of the round before it happens (partial information about the outcome: "if crashAt > m_max, floor"); requires bit-identical float behaviour across browsers to agree with the server |
| W-C Disclose at betting open | — | — | Rejected: discloses the floor threshold before bets |

### 16.8 Secret storage and handling

- Chains are generated offline or by the authority at chain creation with `crypto.randomBytes(32)`.
- Stored in PostgreSQL **encrypted** (AES-256-GCM, envelope key from a KMS or an injected secret, OD-4); decrypted only in the authority process; never logged (pino redaction paths for `seed`, `s_round`, `worldSeed`, `script`).
- Only the revealed seeds table is readable by the verification endpoint.
- Insider threat: anyone with the decrypted chain can predict outcomes. Controls: least-privilege DB roles, KMS access logging, no seeds in backups unencrypted, two-person rule for chain generation (process, OD-4), immediate chain rotation on suspicion, and a public notice.
- Compromise response: stop betting, void the current round (refund), rotate the chain, publish an incident notice.

### 16.9 Verification and float determinism (risk; OD-18)

- The outcome purposes (crash, jackpot, chests) are simple arithmetic on `u` values and are exactly reproducible in any IEEE-754 environment.
- The world path is not: `multiplierAt` uses `Math.exp` and `descentSpeed` uses `Math.pow`. ECMAScript does not require these to be correctly rounded, so engines (V8, JavaScriptCore, SpiderMonkey) may differ in the last bit. Over ~1,290 ticks a 1-ulp difference could, in principle, flip a goldfish collision (`dy < 28`) or a floor/crash boundary, changing the outcome in an independent re-run.
- **Mitigation options:** (a) declare the **reference verifier** = the published `src/fairness` + engine code run in Node.js (V8, pinned version), and publish the per-tick record (`m_k`, boost, `worldY`) so third-party verifiers can check the path step by step; (b) replace `Math.exp`/`Math.pow` in the engine domain with a deterministic, correctly-rounded or table-free pure-JS implementation (an engine change, **not proposed now**: it could change today's values in the last bit and would need its own owner-approved exception and characterization review); (c) change the game design so that the terminal outcome kind does not depend on the float path (an economic/design change — E-A territory).
- Recommended for Phase 8: (a), plus a cross-engine determinism test (P8-3) that runs the precompute in Node and in Chromium/WebKit/Firefox for ≥ 100,000 seeds and reports any divergence. The result decides whether (b) or (c) must be raised.

### 16.10 Unresolved fairness design choices

| ID | Choice | Recommendation |
|---|---|---|
| OD-5 | World disclosure W-A / W-B | W-A |
| OD-6 | Scheme A (chain + public salt) vs B (client-seed mixing); salt source | A; salt source to choose (drand or a named public block) |
| OD-18 | Float determinism mitigation | (a) now; (b)/(c) only if the P8-3 test finds divergence |
| — | Chain length and rotation cadence | 10 M rounds; rotate on schedule or suspicion |
| — | Whether to publish the per-tick record for every round or on demand | On demand via `/verify/:roundNumber` |
| — | Fairness scheme versioning (`fv`) and migration of in-flight chains | `fv` in every commitment; a new `fv` starts a new chain |

---

## 17. Critical economy review — OPEN HIGH-PRIORITY RISK E-RISK-1

### 17.1 Status

**OPEN. HIGH PRIORITY. NOT RESOLVED BY PHASE 8.** Recorded since TASK 001 ("jackpot economics far above intended RTP (~1 in 6 rounds reaches the sea floor)", docs/15) and carried verbatim through the engine extraction on purpose (docs/06 §1, §20). P8-0 does **not** assert an RTP, does **not** select a target RTP and does **not** change `src/engine`, outcome distributions or settlement.

### 17.2 Conservative evidence (Verified, code + calc)

The following uses only facts read from the code and worst-case (smallest) values; it is a lower bound for **one strategy**, not an RTP of the game.

1. **Floor threshold.** Without boost, the anchor reaches `CHAIN_MAX_DEPTH` = 4200 on dive tick 1290, where the tick's multiplier is ≈ 6.2183 (Verified, calc: standalone restatement of `simulation.ts` order, dt = 1/60; consistent with docs/07 §23.11's "tick 1290", "< ≈ 6.61"). Boost adds at most 0.4 and only shortens the dive. So the multiplier checked against `crashAt` during any dive never exceeds ≈ 6.6183 < 6.62.
2. **Therefore** every round with `crashAt > 6.62` reaches the floor.
3. **Crash distribution.** For `1.01 ≤ x ≤ 200`, `P(crashAt > x) = 0.97 × 0.99 / x` (from `outcomes.ts:21-29`: 3 % instant crash, else `0.99/(1−u)` with `u` uniform). So `P(crashAt > 6.62) ≈ 0.97 × 0.1495 ≈ 0.1451`.
4. **Minimum floor payout.** A floor round auto-cashes an open bet at the jackpot (≥ 50×) and multiplies by a chest (≥ 1×), so the final multiplier is ≥ 50×.
5. **Lower bound.** A player who places a bet and never cashes out manually receives, in expectation, **at least 0.145 × 50 ≈ 7.26× the stake per round** (Verified, calc).

This bound ignores: rounds with `crashAt ≤ 6.62` that still reach the floor (path-dependent, raising the floor probability toward TASK 001's "~1 in 6"); the jackpot's mean (142.5× from the band means) and the chest's mean (5.68× per chest from the band means), both computed from the code but **not** combined into a claim here because the combination, rounding (`toFixed(2)`), boost dynamics and pick behaviour must be verified by E-A. Whatever the exact figure, the conservative bound alone shows the current economy returns far more than the stake under a trivial strategy. **The game in its current economic form must not be operated with anything of value.**

### 17.3 What Phase 8 does about it (RECOMMENDED)

- Phase 8 reuses the distributions verbatim (no silent rebalance).
- Phase 8 operates **play-money only** (OD-2), so the flaw inflates virtual balances but cannot cause financial loss.
- The server enforces a configurable kill-switch for jackpot rounds and per-round exposure metrics (§23) so that observed RTP is measured from day one — measurement only, no automatic economic action.
- Any real-value milestone is blocked until E-A is complete and the owner approves an economic model.

### 17.4 Proposed future task E-A — Economy analysis (separate; not authorized; OD-16)

Goal: a mathematically verified description of the current economy and a proposal (for owner approval) of a sustainable economic model.

| Step | Content |
|---|---|
| E-A1 | **Derive all outcome probabilities analytically** from the code: crash point distribution (incl. the 3 % branch and both clamps), jackpot band distribution, chest distribution, final multiplier distribution including `toFixed(2)` rounding |
| E-A2 | **Floor-reaching probability**: exact (or bounded) probability that a round reaches the floor, as a function of `crashAt` and the world path, including goldfish density per depth band, collision windows and boost decay |
| E-A3 | **Jackpot and chest multipliers**: the conditional distribution of payout for floor rounds, including the global bonus rule (§15) and the default chest on expiry |
| E-A4 | **Goldfish boost effects**: the distribution of the multiplier path and of the multiplier at each tick; effect on cashout strategies and on floor timing |
| E-A5 | **Player strategies**: RTP per strategy — fixed-target cashout at *x* for a grid of *x*, never-cashout (hold to floor), Dual Bet combinations (one early, one held), and the best response to the economy |
| E-A6 | **Deterministic simulation**: ≥ 10^8 seeded rounds using the real engine (via the server precompute, §10.2) with seeded streams; confidence intervals; reproducible seeds published with the report |
| E-A7 | **Independent mathematical check**: an analytic or numerical-integration computation independent of the engine code, compared with E-A6 within the confidence interval; any disagreement blocks the report |
| E-A8 | **Risk metrics**: variance, maximum round liability, ruin probability for bankroll scenarios, exposure caps |
| E-A9 | **Model proposal**: options (e.g. retuned crash distribution, jackpot probability decoupled from the float path, capped jackpot, house edge on the floor path), each with its full RTP derivation — **for the owner's decision; not implemented by E-A** |

Deliverable: `docs/10_ECONOMY_ANALYSIS.md` (proposed name) plus a reproducible simulation script outside production code. E-A changes no engine, distribution or settlement file. Implementation of any approved model is a further, separate engine freeze exception.

---

## 18. Financial safety model (RECOMMENDED)

### 18.1 Invariants (each has an automated test and a production check)

| # | Invariant |
|---|---|
| FI-1 | The server alone decides outcomes and multipliers; no client value enters a payout |
| FI-2 | The server alone accepts bets and settles them; every accepted bet has exactly one committed debit equal to its stake |
| FI-3 | Every bet ends in exactly one terminal settlement state: `cashed`, `lost`, `jackpot-settled` or `voided` (refund). No bet is settled twice |
| FI-4 | Every ledger transaction is balanced: the sum of its entries is zero, per currency |
| FI-5 | No player balance is ever negative; balance = sum of the account's entries at all times |
| FI-6 | Money is integer minor units (`BIGINT`) everywhere; no float touches a balance, stake or payout |
| FI-7 | Payout = `floor(stake × settlementMultiplier)` with exact arithmetic; never above the intended amount (M1-D13); non-finite, < 1 or above-cap multipliers never credit (M1-D14) |
| FI-8 | Every financial operation is idempotent on a deterministic key and atomic (one PostgreSQL transaction) |
| FI-9 | PostgreSQL is the only durable financial source of truth; Redis and memory never are |
| FI-10 | Only the lease-holding authority (current fencing epoch) can create rounds, accept bets or settle (§21) |
| FI-11 | Every outcome is reproducible from committed seeds; every settlement references its round and decision tick |

### 18.2 Decision vs application

The orchestrator **decides** (pure, in memory, from the script and receipt tick). The settlement service **applies** through `WalletPort` inside one transaction that also records the decision (bet state change + ledger entries). An acknowledgement is sent only after commit. If the commit fails, no acknowledgement is sent and the decision is retried idempotently or the bet stays in its previous state.

### 18.3 Round settlement barrier

At the terminal transition the orchestrator emits the settlement batch (all open bets → `lost` on crash; all open slots → `jackpot-pending` on floor). `round.ended` and the seed reveal are sent only after the batch commits. If the batch cannot commit (database down), the round stays in `SETTLE-OUT`, betting for the next round does not open, and the incident path (§21.4) applies.

### 18.4 Payout arithmetic (OD-7)

The engine's cashout multiplier is a double (`m_{k−1}` incl. boost) and the final bonus multiplier is a two-decimal value. Options:

| Option | Settlement multiplier | Payout |
|---|---|---|
| P-A | The exact double, as in M1 (docs/07 §23.16 BigInt over its exact rational value) | `floor(stake_minor × exact(m))` |
| P-B (recommended to evaluate) | The multiplier **truncated to 2 decimals**, which is what the player sees | `floor(stake_minor × trunc2(m) × 100 / 100)` in integer arithmetic |
| P-C | Fixed-point at 10^-4 | `floor(stake_minor × trunc4(m))` |

P-B makes the displayed and paid multipliers identical and is never above P-A; it changes the economics slightly (E-A must include it). The choice is the owner's.

### 18.5 Multiplier contract (server-side guard)

Before any credit: the settlement multiplier must be finite, ≥ 1.00, ≤ the named cap for its kind (cashout ≤ 6.62 under current tuning, jackpot ≤ 500, final ≤ 25,000 — current maxima from docs/06 §13.1), and equal to the value recomputed from the script for that bet's tick. A violation **halts settlement for the round**, raises a critical alert, and leaves the bet unsettled (never credits, never silently converts). This is a server-side check; it does not change the engine.

---

## 19. PostgreSQL schema and transaction boundaries (RECOMMENDED; DDL sketch, not migrations)

### 19.1 Conventions

- PostgreSQL ≥ 16. All money `BIGINT` minor units with a `currency` code; `CHECK` constraints on signs.
- IDs: UUIDv7 for entities (time-ordered), `BIGINT` sequences for round numbers and ledger sequence.
- `tenant_id` on every business table (one tenant in Phase 8).
- Timestamps `timestamptz` (wall clock; informational). Ordering uses round ticks and sequences, not timestamps.
- Two DB roles: `aquadive_app` (DML on business tables, **no** UPDATE/DELETE on ledger tables), `aquadive_migrate` (DDL). The verification endpoint uses a read-only role limited to public views.

### 19.2 Tables

```sql
-- identity
players            (id uuid pk, tenant_id text, kind text check (kind in ('guest','oauth','password','operator')),
                    external_ref text, alias text, status text, created_at timestamptz)
sessions           (id uuid pk, player_id uuid fk, token_hash bytea unique, expires_at, revoked_at)
ws_tickets         (ticket_hash bytea pk, session_id uuid fk, expires_at, used_at)

-- currency and accounts
currencies         (code text pk, minor_exponent smallint, is_play_money boolean)
accounts           (id uuid pk, tenant_id text, owner_kind text check (owner_kind in ('player','house','escrow')),
                    player_id uuid null fk, currency text fk,
                    balance_minor bigint not null default 0,
                    projected boolean not null,               -- player accounts: true; house/escrow: false (§20.3)
                    check (owner_kind <> 'player' or balance_minor >= 0),
                    unique (tenant_id, owner_kind, player_id, currency))

-- ledger (append-only)
ledger_transactions(id uuid pk, seq bigserial unique, tenant_id, kind text,   -- bet_stake|cashout|loss|jackpot|void|grant
                    idempotency_key text not null unique, round_id uuid null, bet_id uuid null,
                    authority_epoch bigint not null, created_at)
ledger_entries     (id bigserial pk, tx_id uuid fk, account_id uuid fk, currency text,
                    amount_minor bigint not null check (amount_minor <> 0))
-- deferred constraint trigger: per tx_id and currency, sum(amount_minor) = 0
-- triggers + privileges: no UPDATE/DELETE on ledger_transactions / ledger_entries

-- fairness
seed_chains        (id uuid pk, fv smallint, length bigint, first_hash bytea, salt_source text, salt_value text null,
                    encrypted_seed_material bytea, key_ref text, created_at, committed_at, retired_at)
round_reveals      (round_id uuid pk, server_seed bytea, world_seed bytea, revealed_at)     -- public view

-- rounds
authority_lease    (game text pk, holder text, epoch bigint not null, expires_at timestamptz)
rounds             (id uuid pk, tenant_id, round_number bigint unique, chain_id uuid fk, chain_index bigint,
                    commitment bytea not null, authority_epoch bigint not null,
                    state text check (state in ('betting','diving','bonus','settling','settled','voided')),
                    outcome text null, terminal_tick int null, crash_multiplier text null,
                    jackpot_multiplier text null, chests text[] null,
                    betting_closes_at timestamptz, dive_started_at timestamptz, ended_at timestamptz,
                    unique (chain_id, chain_index))

-- bets
bets               (id uuid pk, tenant_id, round_id uuid fk, player_id uuid fk, slot smallint check (slot in (0,1)),
                    stake_minor bigint check (stake_minor > 0), currency text,
                    state text check (state in ('open','cashed','lost','jackpot_pending','settled','voided')),
                    received_mono_ns bigint, cashout_boundary_tick int null, cashout_multiplier text null,
                    bonus_eligible boolean default false, chest_id smallint null,
                    final_multiplier text null, payout_minor bigint null,
                    stake_tx uuid fk, settle_tx uuid null fk,
                    unique (round_id, player_id, slot))
bonus_picks        (round_id uuid, player_id uuid, chest_id smallint, received_mono_ns bigint, defaulted boolean,
                    primary key (round_id, player_id))

-- idempotency, outbox, audit
idempotency        (player_id uuid, request_id text, command text, result jsonb, created_at,
                    primary key (player_id, request_id))
outbox             (id bigserial pk, topic text, payload jsonb, created_at, published_at null)
audit_log          (id bigserial pk, at timestamptz, actor text, action text, subject text, detail jsonb)  -- append-only
```

### 19.3 Transaction boundaries

| Operation | One transaction contains | Isolation / locking |
|---|---|---|
| Place bet | idempotency insert; `SELECT … FOR UPDATE` player account; balance check; insert `ledger_transactions` (`bet_stake`, key `stake:{betId}`); entries player −stake / escrow +stake; update projected balance; insert `bets` (`open`); outbox row | READ COMMITTED + row lock; unique `(round, player, slot)` |
| Cash out | idempotency insert; `UPDATE bets SET state='cashed', … WHERE id=$1 AND state='open'` (0 rows → already settled); tx `cashout:{betId}`; entries escrow −stake, house −(payout−stake), player +payout; projected balance; outbox | Conditional update is the double-settlement guard |
| Crash loss | one tx per round (`loss:{roundId}`), chunked if large: `UPDATE bets SET state='lost' WHERE round_id=$1 AND state='open' RETURNING …`; entries escrow −Σ, house +Σ; round → `settled` | Conditional update + unique key |
| Floor | `UPDATE bets SET state='jackpot_pending', bonus_eligible=true WHERE round_id=$1 AND state='open'` (no money moves) | — |
| Bonus settle | per player or batched: `UPDATE bets SET state='settled', … WHERE state='jackpot_pending'`; tx `jackpot:{betId}` per bet; entries escrow −stake, house −(payout−stake), player +payout | Same pattern |
| Void round | tx `void:{betId}` per open/pending bet: escrow −stake, player +stake; round → `voided` | Recovery only (§21.4) |
| Round create | `UPDATE authority_lease … WHERE epoch=$epoch` (fencing check) + insert `rounds` | Fails if epoch is stale |

Every transaction that writes rounds, bets or ledger rows also asserts the fencing epoch (§21.2).

---

## 20. Idempotency and concurrency (RECOMMENDED)

### 20.1 Idempotency keys

- Client commands: `(playerId, requestId)` in `idempotency`; the stored result is returned verbatim on retry (`DUPLICATE_REQUEST` semantics are success with the original payload).
- Ledger: `ledger_transactions.idempotency_key` is derived deterministically from the business fact (`stake:{betId}`, `cashout:{betId}`, `loss:{roundId}`, `jackpot:{betId}`, `void:{betId}`), so a retried settlement can never create a second transaction, whoever retries it.
- Bets: natural key `(roundId, playerId, slot)`.
- Rounds: `round_number` unique; `(chain_id, chain_index)` unique.

### 20.2 Per-player serialization

Inside the authority process, commands of one player are processed by a per-player FIFO (a promise chain keyed by `playerId`), so a player's two slots and repeated requests never race each other in the application. The database row lock is the second line of defence (multiple processes, recovery).

### 20.3 Hot accounts

`house` and `escrow` accounts would be written by every bet and settlement: a single hot row. They are **unprojected** (`projected = false`): only entries are inserted; their balances are materialized asynchronously by a reconciliation job (§23.3). Player accounts are projected under row lock. Lock order is always: player account → (no other row locks). This removes deadlocks by construction.

### 20.4 Failure windows and their resolution

| Window | Effect | Resolution |
|---|---|---|
| Bet commit completes after the SETTLE-IN barrier | Debited bet the round did not include | Barrier detects (`bets.state='open'` but not in the round's accepted set) → `void:{betId}` refund + `bet.rejected SERVER_BUSY` |
| Process dies after commit, before ack | Client unsure | Client retries with the same `requestId` → stored result |
| Process dies after in-memory decision, before commit | Decision lost; no money moved | Client retries; judged at new receipt time; or round recovery (§21.4) |
| Duplicate socket delivery | — | Idempotency |
| Two processes believe they are authority | Split brain | Fencing epoch rejects the stale writer's transactions (§21.2) |

### 20.5 Outbox

Messages that announce committed facts (`bet.accepted`, `round.ended`, feed entries) are written to `outbox` in the same transaction and published by a dispatcher. In the single-process MVP the dispatcher publishes in-process after commit; the table guarantees nothing is announced for an uncommitted fact and nothing committed is silently unannounced (on restart, unpublished rows are sent). For a future operator wallet (model B), the outbox also drives remote wallet calls with retries.

---

## 21. Authority leadership, split-brain prevention and recovery (RECOMMENDED)

### 21.1 Why PostgreSQL, not Redis, for leadership

Leadership protects money writes, and PostgreSQL is where those writes happen. A lease in PostgreSQL plus a fencing epoch checked **inside the same transactions** gives a correctness guarantee; Redis-based locks (including Redlock) do not, because a paused process can still write after its lock expired unless the store itself checks a fencing token.

### 21.2 Lease and fencing

- `authority_lease(game='aquadive', holder, epoch, expires_at)`.
- **Acquire:** `UPDATE authority_lease SET holder=$me, epoch=epoch+1, expires_at=now()+'5s' WHERE game='aquadive' AND (expires_at < now() OR holder=$me) RETURNING epoch`.
- **Renew** every 1 s with `WHERE holder=$me AND epoch=$epoch`.
- **Self-fence:** if a renewal has not succeeded for 3 s (TTL − margin), the authority stops scheduling, stops accepting commands and exits (the gateway closes sockets with 1001). It never resumes without re-acquiring with a new epoch.
- **Fencing check:** every round/bet/ledger transaction includes `SELECT 1 FROM authority_lease WHERE game='aquadive' AND epoch=$epoch AND holder=$me FOR SHARE` (or a trigger on `rounds.authority_epoch`); a stale epoch aborts the transaction.
- Standby polls the lease every 1 s and acquires only after expiry.
- Clock dependence: `now()` is the database's clock only; process clocks are not compared.

### 21.3 Deterministic recovery state

On acquiring the lease, the new authority reads the last round with state ∉ {`settled`, `voided`}. Because outcomes are a function of the committed chain seed, it can rebuild that round's `RoundScript` exactly.

### 21.4 In-flight round policy (OD-11)

| Round state at failure | Recommended action |
|---|---|
| `betting` | Void the round: refund every bet (`void:{betId}`); reveal its seed; start a new round with the next chain index |
| `diving` | **Void**: bets already `cashed` stand (they were committed); every `open` bet is refunded. Players could not act during the outage, so resuming the dive would be unfair. The seed is revealed so anyone can see what the round would have been |
| `bonus` / `settling` | Complete deterministically: the outcome is already disclosed (floor reached); apply recorded picks, default the rest to chest 0, settle; reveal |
| Settlement batch partially committed | Re-run: idempotency keys make every step safe to repeat |

Alternative (OD-11 option): resume a `diving` round from the script at the current wall time. Not recommended (unfair to players who were disconnected; complicates audit). Every recovery action writes an `audit_log` row with the epoch, round, and the decision taken.

### 21.5 Planned deploys

`server.notice {drain}` → stop opening new rounds after the current one settles → release the lease explicitly → standby acquires immediately. Zero voided rounds for planned deploys.

---

## 22. Redis responsibilities and failure recovery (RECOMMENDED; Redis is OD-14)

### 22.1 Phase 8 MVP: no Redis

One authority process serves all WebSocket connections up to the measured single-node limit (§28). Redis adds a dependency, an operational surface and failure modes that the MVP does not need. The architecture keeps a `Fanout` interface (in-process implementation) so Redis can be introduced in P8-12 without touching the round or settlement modules.

### 22.2 When Redis is introduced (trigger: one node cannot hold the connections)

| Responsibility | Redis feature | Source of truth |
|---|---|---|
| Fan-out of public round messages from the authority to N gateways | Pub/Sub (or Streams for gap-free delivery) | The authority (messages are regenerable from state) |
| Gateway → authority command forwarding | Streams with consumer group, or direct internal WebSocket/HTTP to the authority (recommended: direct, fewer hops) | PostgreSQL (results) |
| Rate-limit counters across gateways | `INCR` + TTL | None (ephemeral) |
| Presence / online counts | Sets with TTL | None |
| Public history cache (last N rounds) | Lists | PostgreSQL |

Redis **never** holds: balances, bets, idempotency results of record, seeds, the round script, the authority lease.

### 22.3 Redis failure behaviour

- Fan-out down → gateways cannot relay rounds; they send `server.notice` and close spectator sockets (clients reconnect to the authority's own gateway or wait). Bets are not affected if command forwarding is direct.
- Rate-limit store down → gateways fall back to per-process limits (stricter).
- On recovery, gateways resubscribe and push a fresh PublicSnapshot to every connection.
- No financial state is lost, because none is in Redis.

---

## 23. Metrics, logs and operational requirements (RECOMMENDED)

### 23.1 Metrics (Prometheus format on the ops port)

| Area | Metric |
|---|---|
| Round loop | `round_duration_seconds`, `tick_lag_ms` (scheduled vs processed, histogram), `event_loop_lag_ms`, `round_precompute_ms`, `rounds_voided_total` |
| Gateway | `ws_connections`, `ws_messages_in/out_total{type}`, `ws_rejected_total{code}`, `ws_send_buffer_bytes` (slow consumers) |
| Bets | `bet_accept_latency_ms`, `cashout_latency_ms`, `bets_total{result}`, `duplicate_requests_total` |
| Ledger | `ledger_tx_latency_ms{kind}`, `ledger_tx_failures_total{kind}`, `reconciliation_diff_minor` (**must be 0**), `negative_balance_detected_total` (**must be 0**) |
| Authority | `lease_renew_failures_total`, `authority_epoch`, `self_fence_total` |
| Economy (measurement only) | `stake_minor_total`, `payout_minor_total`, `observed_rtp_rolling{window}`, `round_liability_minor` (max potential payout at floor), `floor_rounds_total` |
| Fairness | `verification_requests_total`, `chain_remaining_rounds` |

### 23.2 Logs

- pino JSON to stdout; one line per event; fields `roundId`, `roundNumber`, `betId`, `requestId`, `playerRef` (a keyed hash, not the raw id), `epoch`, `code`.
- **Redaction:** seeds, scripts, session tokens, tickets, passwords, `Authorization`/`Cookie` headers. A test asserts redaction.
- No outcome value is logged before its disclosure event.
- Retention and privacy: OD-21 (data protection review).

### 23.3 Reconciliation and audit

- Every minute: for each projected account, `balance_minor = Σ entries`; globally per currency `Σ entries = 0`; every `settled` bet has exactly one `settle_tx`; no `open` bet in a `settled`/`voided` round. Any difference raises a critical alert and **stops new rounds** (fail-safe direction: stop, docs/06 §18).
- `audit_log` records authority acquisitions, self-fences, voids, chain creation/commitment/rotation, configuration changes, kill-switch toggles.

### 23.4 Health

`/health/live` (process up), `/health/ready` (DB reachable, lease state known, migrations current). The standby reports ready-but-not-authority.

### 23.5 Alerts (initial)

Reconciliation diff ≠ 0; negative balance; lease lost; tick lag p99 > 50 ms; settlement batch failure; multiplier-contract violation (§18.5); verification mismatch; chain < 30 days remaining.

### 23.6 Operational controls (no admin UI in Phase 8)

Kill-switches by configuration + restart or ops endpoint: stop new bets; stop new rounds after current; disable jackpot payouts (void floor rounds) — **any economic kill-switch use is an owner decision**, logged in `audit_log`.

---

## 24. Security threat model (RECOMMENDED)

Assets: player balances and ledger integrity; outcome secrecy (seeds, scripts); fairness credibility; player identity and sessions; availability of the round.

| STRIDE | Threat | Control |
|---|---|---|
| Spoofing | Stolen session cookie / ticket | `HttpOnly; Secure; SameSite`, hashed tokens, short ticket TTL, single use, origin check, revoke on logout, one active session per player |
| Spoofing | Forged server messages to the client (MITM) | TLS only (WSS/HTTPS), HSTS |
| Tampering | Client sends a multiplier, payout, balance or event | Not in the protocol; strict schemas reject unknown fields; the server computes everything |
| Tampering | Replay of a command | Idempotency per `(player, requestId)`; phase/round checks; receipt-time judgement |
| Tampering | Concurrent bets to overdraw | Row lock + check in one transaction; per-player FIFO |
| Tampering | Double settlement via races or retries | Conditional state updates; deterministic ledger idempotency keys; unique constraints |
| Tampering | Stale authority writes after failover | Fencing epoch in every transaction |
| Tampering | Ledger rows altered | Append-only privileges + triggers; reconciliation; audit |
| Repudiation | Player disputes a cashout | Stored receipt time, boundary tick, multiplier, seed reveal, per-tick record; deterministic replay |
| Info disclosure | Crash point leaked through snapshots | Allow-list builders + tests (§12.4) |
| Info disclosure | Timing side channel before the crash | Uniform sync stream; gateway does not know the terminal tick (§11.5) |
| Info disclosure | World seed reveals the floor threshold | W-A streaming (OD-5) |
| Info disclosure | Chest values before picks / collusion | Values revealed only after the pick window (§15.4) |
| Info disclosure | Seed theft (insider, backup, logs) | Encryption at rest, KMS, redaction, least privilege, rotation, incident procedure (§16.8) |
| Info disclosure | Compression oracle | permessage-deflate off by default |
| Denial of service | Connection / message floods, oversized frames, slowloris | Rate limits, frame caps, handshake timeout, per-IP caps, backpressure: close slow consumers above a send-buffer limit |
| Denial of service | Event-loop blocking (heavy JSON, regex) | Bounded payloads, no user-controlled regex, precompute off the tick path |
| Elevation | Ops endpoints exposed | Separate interface, network policy/mTLS, no public route |
| Abuse | Bots, multi-accounting, bonus abuse | Out of MVP scope beyond rate limits; business policy (OD-1) |
| Supply chain | Malicious dependency | Minimal dependencies; lockfile; `bunfig.toml`-style release-age guard (already present for bun) or `npm` equivalent; audit in CI |

Out of scope: physical security, payment fraud (no payments), regulatory controls (§30).

---

## 25. Testing requirements (RECOMMENDED)

| Level | What | Gate |
|---|---|---|
| Unit | Protocol schemas (accept/reject matrices), codec round-trips, rate limiter, PF derivation test vectors (fixed seeds → fixed `u` values → fixed outcomes), multiplier contract, payout arithmetic (all OD-7 options) | Every milestone |
| Determinism | Precompute twice → identical script; `SeededRoundAuthority` reproduces published vectors; precompute = live loop record | P8-3, P8-4 |
| Cross-engine | Precompute in Node vs Chromium/WebKit/Firefox for ≥ 100,000 seeds; divergence report (OD-18) | P8-3 |
| Ledger property tests | Random sequences of bets/cashouts/crashes/voids/retries → FI-3, FI-4, FI-5 always hold (needs a property-testing library or a seeded generator; dependency is milestone-gated) | P8-9, P8-10 |
| Integration (real PostgreSQL) | Every transaction in §19.3, including conflict and retry paths | P8-7+ |
| Concurrency | 2 slots × 100 parallel requests per player; duplicate request storms; cashout racing the terminal tick | P8-10 |
| Failover / chaos | Kill authority in each round phase; partition DB; pause process past lease TTL (fencing) | P8-11 |
| Security | Fuzz the gateway with malformed frames; auth bypass attempts; snapshot secrecy test; log redaction test; Origin check | Per milestone (§29) |
| Client | Existing 1,629 tests stay green; new replica-mode tests with a scripted server | P8-6+ |
| Load / soak | §28 targets; 24 h soak with synthetic players | P8-13 |

The existing local-mode suite remains the regression net for gameplay: local mode is not removed.

---

## 26. Deployment target and Lovable independence (RECOMMENDED; OD-4, OD-17)

### 26.1 Current Lovable dependencies (Verified)

| Dependency | Where | Role |
|---|---|---|
| Lovable Git sync | `AGENTS.md` LOVABLE block; the connected branch | Commits sync into the Lovable editor; history must not be rewritten |
| `@lovable.dev/vite-tanstack-config` 2.7.1 (devDependency) | `vite.config.ts` | Wraps TanStack Start, React, Tailwind, tsconfig paths, Nitro (build-only, Cloudflare default target), dev component tagger, env injection, error-logger plugins, sandbox detection |
| `bunfig.toml` release-age excludes | `@lovable.dev/*` packages | Supply-chain guard exceptions for Lovable packages |
| `.lovable/project.json`, `.lovable/plan.md` | repo | Lovable project template metadata and an old plan |
| `src/lib/lovable-error-reporting.ts` | app | Reports errors to `window.__lovableEvents` when present |
| Cloudflare/Wrangler artefacts | `.wrangler/` (ignored), Nitro target | The SSR app's default build target |

### 26.2 Implications for the backend

- The game server is a **long-running stateful Node process** with an in-memory round loop, WebSocket connections and a PostgreSQL pool. It cannot run inside the Lovable-built SSR bundle or on Cloudflare Workers' request model. (Cloudflare Durable Objects could host a WebSocket authority, but that is a different programming and persistence model; not recommended for a PostgreSQL-ledger design.)
- **Recommended:** the frontend stays where it is (Lovable / its current host); the backend deploys **separately** as a container (Docker image built from `server/`) to a container host with managed PostgreSQL in the same region (examples: Fly.io, Render, Railway, AWS ECS + RDS, a VPS with Docker; OD-4). WebSocket on `api.<domain>`, frontend on `<domain>`; CORS and Origin allow-lists; cookies scoped to the parent domain (`SameSite=Lax`).
- Lovable's editor will see `server/` once committed. Lovable-initiated edits could touch it. Mitigation: document in `server/README.md` that the folder is not Lovable-managed; review every Lovable-originated commit touching `server/`, `src/protocol`, `src/fairness` or `src/engine`; optionally a separate repository for `server/` (OD-3 option).

### 26.3 Lovable independence track (separate roadmap track, not Phase 8; OD-17)

| Step | Content | Risk |
|---|---|---|
| L-0 | Inventory (this section) | — |
| L-1 | Decide whether to keep Lovable as the editor/host | Owner decision |
| L-2 | Replace `@lovable.dev/vite-tanstack-config` with an explicit `vite.config.ts` listing the same plugins (TanStack Start, React, Tailwind, tsconfig paths, Nitro with an explicit target) and verify byte-equivalent output | Build drift; one commit |
| L-3 | Remove `lovable-error-reporting.ts` or replace it with the project's own error reporting | Lose Lovable error feed |
| L-4 | Choose the frontend host and Nitro target explicitly; CI/CD of our own | Deployment change |
| L-5 | Disconnect Lovable sync (only after L-2..L-4), keeping the full Git history | Irreversible for Lovable project history |

None of these is executed or authorized by P8-0. `vite.config.ts`, `package.json`, the lockfiles, `AGENTS.md` and deployment configuration are untouched.

---

## 27. Incremental migration from local mode to network mode (RECOMMENDED)

### 27.1 Modes

| Mode | Authority | Wallet | Use |
|---|---|---|---|
| `local` (default today) | `LocalRoundAuthority` (Math.random) | Local wallet store | Development, offline demo, the regression suite |
| `network-spectate` | Server | None (read-only) | First network milestone |
| `network` | Server | Server (`wallet.balance`, `bet.*`) | Play-money multiplayer |

Mode selection: one build-time environment value plus a development-only query override; the session (`src/ui/session.ts`, the composition root, docs/07 §8) constructs either the local or the network graph. Components do not know the mode.

### 27.2 Steps (strangler fig, each independently shippable)

1. Server runs rounds with nobody connected (P8-4).
2. Clients can spectate the server round behind a flag; local mode stays default (P8-5, P8-6).
3. Play-money betting on the server behind a flag (P8-10).
4. Network mode becomes the default for the hosted build only after P8-13's load and security gates and the owner's approval; local mode stays for development and tests.

### 27.3 Client replica mode — the engine contract gap (proposed exception E-X8; OD-10)

**Finding (Verified, code):** the client state machine calls `authority.sampleCrashPoint()` synchronously at entry(diving) (`state-machine.ts:324`) and `sampleJackpot()` / `rollBonusChests()` synchronously at entry(impact)/entry(bonus) (`:351`, `:372`). A `RemoteRoundAuthority` cannot answer at dive start without the crash point being on the client — which F2 (§16.2) forbids. The client simulation can also reach the floor before the server's `round.impact` arrives.

Options:

| Option | Description | Engine change |
|---|---|---|
| R-A (recommended to design in P8-6) | **Replica inputs:** the engine accepts server facts as tick-stamped inputs (`serverCrash {tick, multiplier}`, `serverImpact {tick, jackpot}`, `serverChests {chests}`), its crash check is disabled while the crash point is unknown, and reaching the floor locally waits (holds the anchor) until the server's impact fact. The world is fed from `round.world` (W-A) | Yes — new engine freeze exception E-X8 (state machine + facade), mode-blind core preserved, local mode unchanged |
| R-B | Client does not run the state machine in network mode: a client-side replica driver renders from server snapshots and the world stream, using the engine's projection only | Smaller engine change (exporting projection pieces) but a second client code path |
| R-C | Pure snapshot interpolation, no local simulation | No engine change; jerky world, larger bandwidth; loses docs/06 §17's design |

R-A keeps docs/06's "one engine core, two modes" goal and is the honest completion of the §16 contract. It must be specified and approved before P8-6 starts; P8-0 does not authorize it.

### 27.4 Client wallet in network mode

The wallet store's listeners are replaced by appliers of server messages (`bet.accepted`, `bet.cashedOut`, `bet.settled`, `wallet.balance`), as docs/07 §10 and §18 planned. M1's local guards remain as tripwires. M2 / B-R (integer-cent client ledger) becomes largely moot for network mode — the server ledger is integer — but the client must parse `amountMinor` strings exactly (BigInt) and format them for display; that work is part of P8-10.

---

## 28. Performance requirements (Unverified targets; to be measured)

| Metric | Phase 8 MVP target (single node, 2 vCPU, 4 GB) |
|---|---|
| Concurrent WebSocket connections | 5,000 spectators + 1,000 active players per node |
| Tick scheduler lag | p99 < 10 ms, max < 50 ms at target load |
| `round.sync` fan-out | 10 Hz to all connections within one tick (16.7 ms) p99 |
| Bet acknowledgement (server-side, receipt → ack) | p50 < 20 ms, p99 < 100 ms |
| Cashout acknowledgement | p50 < 20 ms, p99 < 100 ms |
| Ledger transaction | p99 < 20 ms (same-region managed PostgreSQL) |
| Round precompute | < 50 ms |
| Memory per connection | < 50 kB |
| Settlement batch (1,000 bets) | < 500 ms |
| Recovery (lease expiry → new authority ready) | < 10 s |

If measured capacity is below target, the first remedy is profiling; the second is the gateway split with Redis fan-out (P8-12); `uWebSockets.js` is a later option.

---

## 29. Phase 8 milestone plan (RECOMMENDED; nothing authorized)

Order principle: **protocol and money-free skeleton first; fairness and the round loop proven before any ledger; money last, play-money only.** Each milestone is one isolated commit (or a pre-agreed, documented split), keeps the game playable in local mode, and needs its own owner authorization. E-A (§17.4) runs as a separate track and blocks no play-money milestone, but blocks any real-value work.

### P8-1 — Protocol package

1. **Goal:** typed, validated, versioned protocol v1 shared by client and server.
2. **Dependencies:** approval of this document (§8, §12); OD-7 for multiplier string format (format only).
3. **File scope:** C `src/protocol/{version.ts, envelope.ts, messages.client.ts, messages.server.ts, snapshot.ts, errors.ts, money.ts, codec.ts, index.ts, README.md}` + tests; M `src/shared/README.md` (planned-contents line only). No engine, UI, rendering, audio change.
4. **Contracts:** §8.2–§8.7 envelope and catalogue; `amountMinor` decimal-string rule; strict schemas; codec never throws (returns a typed error).
5. **Acceptance:** every message type has accept and reject fixtures; round-trip encode/decode identity; `tsc`, full Vitest suite, lint, build green; no new dependency.
6. **Security tests:** fuzz decode with random/oversized/deep JSON; unknown fields rejected; money strings with sign, exponent, leading zeros, > 16 digits rejected.
7. **Performance:** decode + validate p99 < 50 µs per message (Node, micro-benchmark).
8. **Rollback:** revert the commit (no consumer yet).
9. **Owner decisions:** approve §8; OD-19 (bet cancel excluded).
10. **Commit:** `feat(protocol): add versioned protocol v1 schemas (P8-1)`.

### P8-2 — Server skeleton (no game, no money)

1. **Goal:** a runnable Fastify service with health, config, logging, graceful shutdown, and a WebSocket endpoint that performs `hello`/`welcome` only.
2. **Dependencies:** P8-1; OD-3 (layout), OD-4 (runtime/host for later; local only now); dependency approval for `fastify`, `@fastify/websocket`, `pino` (bundled), build tool.
3. **File scope:** C `server/{package.json, lockfile, tsconfig.json, README.md, src/main.ts, src/config.ts, src/http/health.ts, src/gateway/{server.ts, connection.ts, handshake.ts, rate-limit.ts}, src/ops/{logger.ts, metrics.ts}, test/*}`. No root file change.
4. **Contracts:** §6.3 import rules (lint rule in `server/`); §8.3–§8.4 handshake and close codes; §9.1 steps 1–3, §9.5 limits; redaction list.
5. **Acceptance:** `server` builds and starts; `/health/*` respond; handshake accepts v1, rejects others (4001); frame limits enforced; SIGTERM drains; root app tests/build unchanged and green.
6. **Security tests:** Origin check, oversized frame (1009), handshake timeout, flood → 4008, log redaction test.
7. **Performance:** 5,000 idle connections on a dev machine with < 50 kB each (indicative).
8. **Rollback:** delete `server/` (independent package).
9. **Owner decisions:** OD-3, new dependencies.
10. **Commit:** `feat(server): add Fastify/WebSocket skeleton with handshake (P8-2)`.

### P8-3 — Provably-fair module

1. **Goal:** seed chain, derivation, seeded streams, `SeededRoundAuthority`, reference verifier.
2. **Dependencies:** P8-1; OD-5, OD-6, OD-10b (facade export or read-only domain import), OD-18 approach.
3. **File scope:** C `src/fairness/{chain.ts, derive.ts, seeded-rng.ts, seeded-authority.ts, verify.ts, vectors.ts, README.md}` + tests; C `server/src/fairness/{chain-store.ts, crypto-node.ts}`; if OD-10b = facade export: M `src/engine/index.ts` (one export line, owner-approved exception E-X9).
4. **Contracts:** §16.3–§16.6; per-purpose streams; `Rng`/`RoundAuthority` interfaces unchanged; domain functions unchanged.
5. **Acceptance:** published test vectors reproduce; distributions of `SeededRoundAuthority` over 10^6 rounds match `LocalRoundAuthority`'s analytic distributions within tolerance (no distribution change); verifier recomputes a full round; cross-engine report produced.
6. **Security tests:** commitment never equals or leaks derived values; chain link checks; wrong seed fails verification; redaction.
7. **Performance:** derivation for one round's draws < 1 ms.
8. **Rollback:** revert; nothing consumes it yet.
9. **Owner decisions:** OD-5, OD-6, OD-10b, OD-18.
10. **Commit:** `feat(fairness): add hash-chain seeds and seeded round authority (P8-3)`.

### P8-4 — Headless round orchestrator (in memory, no money, no clients)

1. **Goal:** the server runs the global round loop continuously from seeds.
2. **Dependencies:** P8-2, P8-3.
3. **File scope:** C `server/src/round/{orchestrator.ts, round-script.ts, scheduler.ts, clock.ts, bet-book.ts (no money), timeline.ts}` + tests.
4. **Contracts:** §10, §11 (receipt-tick rule implemented and tested with synthetic commands), global bonus schedule (§15.3); engine used only through its facade with `advance(TICK_SECONDS)`.
5. **Acceptance:** 10,000 consecutive rounds without drift; live record equals precompute; scripted cashout timing tests at boundaries `terminalTick−1`, `terminalTick`, `terminalTick+1`; no engine file changed.
6. **Security tests:** script never serialized or logged; no secret in any emitted structure before disclosure.
7. **Performance:** precompute < 50 ms; tick lag p99 < 10 ms idle.
8. **Rollback:** revert; server returns to skeleton.
9. **Owner decisions:** OD-8 (latency policy), OD-9 (bonus rules), timeline durations (defaults).
10. **Commit:** `feat(server): add server-authoritative round orchestrator (P8-4)`.

### P8-5 — Spectator broadcast

1. **Goal:** clients can watch the server round over WebSocket.
2. **Dependencies:** P8-4.
3. **File scope:** C `server/src/gateway/{broadcast.ts, snapshot-builder.ts, sync.ts}` + tests.
4. **Contracts:** §8.6 public messages, §12 PublicSnapshot allow-list, §13 resync, §11.5 uniform sync stream, OD-5 world disclosure.
5. **Acceptance:** a scripted test client follows 1,000 rounds and reconstructs every public fact; mid-round join renders the correct tick.
6. **Security tests:** snapshot secrecy test at every phase; timing uniformity test of `round.sync` up to the crash.
7. **Performance:** fan-out to 5,000 simulated connections within one tick p99.
8. **Rollback:** revert; disable the WS round channel.
9. **Owner decisions:** OD-5 confirmation.
10. **Commit:** `feat(server): broadcast public round state to spectators (P8-5)`.

### P8-6 — Client network spectate mode (behind a flag)

1. **Goal:** the existing client renders the server round; local mode remains the default.
2. **Dependencies:** P8-5; **approval of engine freeze exception E-X8** (§27.3, OD-10).
3. **File scope:** C `src/network/{ws-round-service.ts, replica-authority.ts, clock-sync.ts}` + tests; M `src/ui/session.ts` (mode selection); M engine files named by the approved E-X8 scope only.
4. **Contracts:** §27; renderer contract unchanged (docs/05); audio/FX unchanged (event-driven).
5. **Acceptance:** local mode pixel- and test-identical; network spectate shows the same round on two browsers; reconnect works; full suite green.
6. **Security tests:** client never receives secrets (inspect all frames); malformed server frames rejected without crash.
7. **Performance:** no frame-time regression vs local mode on the existing frame-time meter.
8. **Rollback:** flag off (default); revert commit.
9. **Owner decisions:** OD-10 (E-X8 scope).
10. **Commit:** `feat(network): add network spectate mode behind a flag (P8-6)`.

### P8-7 — PostgreSQL foundation and authority lease

1. **Goal:** durable rounds, commitments, reveals; lease with fencing.
2. **Dependencies:** P8-4; OD-4 (managed PostgreSQL), dependency approval for `pg`.
3. **File scope:** C `server/migrations/0001_*.sql … ` (rounds, seed_chains, round_reveals, authority_lease, audit_log), `server/src/persistence/*`, `server/src/round/lease.ts` + integration tests.
4. **Contracts:** §19 (non-money tables), §21.
5. **Acceptance:** two processes: exactly one authority; kill/pause tests show fencing; rounds persisted; reveal published after end.
6. **Security tests:** stale-epoch write rejected; seeds encrypted at rest; read-only role cannot read secrets.
7. **Performance:** lease renew p99 < 10 ms; round insert < 5 ms.
8. **Rollback:** migrations are additive; revert code; drop schema in non-production.
9. **Owner decisions:** OD-4, OD-11.
10. **Commit:** `feat(server): persist rounds and add fenced authority lease (P8-7)`.

### P8-8 — Identity

1. **Goal:** play-money accounts and WebSocket authentication.
2. **Dependencies:** P8-7; OD-1 direction, OD-13.
3. **File scope:** C `server/src/identity/*`, `server/src/http/{auth.ts, ws-ticket.ts}`, migrations (players, sessions, ws_tickets) + tests.
4. **Contracts:** §9.2–§9.4; `IdentityPort`.
5. **Acceptance:** login/guest → ticket → authenticated socket; revocation closes sockets; spectators unaffected.
6. **Security tests:** token-in-URL absent; ticket reuse rejected; CSRF on `/ws-ticket`; session fixation; brute-force limits.
7. **Performance:** ticket issue p99 < 20 ms.
8. **Rollback:** revert; spectate-only remains.
9. **Owner decisions:** OD-13, OD-21 (data protection).
10. **Commit:** `feat(server): add play-money identity and WebSocket auth (P8-8)`.

### P8-9 — Ledger core (no gameplay wiring)

1. **Goal:** double-entry play-money ledger with invariants and reconciliation.
2. **Dependencies:** P8-7; OD-2, OD-15, OD-7 (for later payout use).
3. **File scope:** C migrations (currencies, accounts, ledger_transactions, ledger_entries, idempotency, outbox), `server/src/ledger/*`, `server/src/settlement/wallet-port.ts`, `internal-ledger-wallet.ts`, reconciliation job + tests.
4. **Contracts:** §18.1 FI-4..FI-9, §19, §20.
5. **Acceptance:** property tests hold over 10^5 random operation sequences; append-only enforced; reconciliation 0.
6. **Security tests:** UPDATE/DELETE on ledger denied for the app role; negative balance impossible under concurrency.
7. **Performance:** ledger tx p99 < 20 ms at 500 tx/s.
8. **Rollback:** not wired; revert.
9. **Owner decisions:** OD-2, OD-15.
10. **Commit:** `feat(server): add double-entry play-money ledger (P8-9)`.

### P8-10 — Bets, cashout, Dual Bet, jackpot, bonus, settlement

1. **Goal:** play-money betting end to end, server-authoritative.
2. **Dependencies:** P8-6, P8-8, P8-9; OD-7, OD-8, OD-9, OD-12, OD-20.
3. **File scope:** C `server/src/settlement/{service.ts, barrier.ts, multiplier-contract.ts}`, M `server/src/round/{orchestrator.ts, bet-book.ts}`, `server/src/gateway/commands.ts`; client: M `src/ui/store/wallet-store.ts` (network appliers, behind the mode), M `src/ui/session.ts`, C `src/network/ws-wallet.ts` + tests. Each client file named needs the owner's scope ratification (M1 is deferred and not closed; `wallet-store.ts` is excluded from Phase 7 scopes).
4. **Contracts:** §10.4–§10.5, §11.3, §14, §15, §18, §19.3, §20.
5. **Acceptance:** FI-1..FI-11 tests; boundary cashout tests; Dual Bet per-slot settlement; jackpot single settlement; reconciliation 0 after 10^5 simulated rounds with synthetic players; local mode unchanged.
6. **Security tests:** concurrent overdraw, duplicate settlement, replayed requests, forged fields, cashout after crash, pick before/after window, chest secrecy.
7. **Performance:** §28 bet/cashout targets at 1,000 active players (synthetic).
8. **Rollback:** network betting flag off; settlement code inert; ledger keeps history.
9. **Owner decisions:** OD-7, OD-8, OD-9, OD-12, OD-20.
10. **Commit:** `feat(server): add server-authoritative play-money betting and settlement (P8-10)`.

### P8-11 — Recovery and failover

1. **Goal:** deterministic, audited recovery in every round phase.
2. **Dependencies:** P8-10; OD-11.
3. **File scope:** C `server/src/round/recovery.ts`, M `lease.ts`, `orchestrator.ts`, chaos tests.
4. **Contracts:** §21.3–§21.5.
5. **Acceptance:** kill tests in each phase match §21.4; no double settlement; audit rows present; planned deploy voids nothing.
6. **Security tests:** split-brain simulation (paused leader resumes) produces zero accepted stale writes.
7. **Performance:** takeover < 10 s.
8. **Rollback:** revert to P8-10 behaviour (manual recovery runbook).
9. **Owner decisions:** OD-11.
10. **Commit:** `feat(server): add deterministic round recovery and failover (P8-11)`.

### P8-12 — Horizontal gateways with Redis fan-out (conditional)

1. **Goal:** more connections than one node holds.
2. **Dependencies:** P8-11; measured need (§28); OD-14; dependency approval for `ioredis`.
3. **File scope:** C `server/src/fanout/{redis-fanout.ts, inproc-fanout.ts}`, M gateway wiring + tests.
4. **Contracts:** §22.
5. **Acceptance:** N gateways show identical public streams; Redis outage behaves as §22.3.
6. **Security tests:** Redis unauthenticated access impossible (TLS + ACL); no financial data in Redis (scan test).
7. **Performance:** linear connection scaling to N = 3.
8. **Rollback:** single-node mode (in-process fan-out).
9. **Owner decisions:** OD-14.
10. **Commit:** `feat(server): add Redis fan-out for multiple gateways (P8-12)`.

### P8-13 — Observability, load and security hardening

1. **Goal:** production-grade operations for play-money launch.
2. **Dependencies:** P8-11 (P8-12 if built).
3. **File scope:** M `server/src/ops/*`; C dashboards/alerts as code, load-test scripts (outside production code), `server/RUNBOOK.md`.
4. **Contracts:** §23, §24, §28.
5. **Acceptance:** all §28 targets met or documented with owner-accepted deviations; 24 h soak clean; alert drills.
6. **Security tests:** independent security review of the diff since P8-1; dependency audit.
7. **Performance:** §28.
8. **Rollback:** configuration-only changes reverted.
9. **Owner decisions:** go/no-go for hosted play-money network mode.
10. **Commit:** `chore(server): add observability, runbook and load-test gates (P8-13)`.

### P8-14 — Phase 8 close-out (P8-C)

Documentation and acceptance only: gate matrix, owner acceptance, retrospective; no feature work. Commit: `docs: close Phase 8 (P8-C)`.

### Track E-A (parallel, separate authorization)

See §17.4. Commit: `docs: add economy analysis (E-A)` plus a simulation script outside production code.

---

## 30. Compliance statement

AQUADIVE is not licensed, certified or approved for real-money gambling in any jurisdiction, and nothing in this document makes it so. Real-money operation (under model A or B) requires, at least: legal advice per target jurisdiction; operator or supplier licensing; independent game and RNG certification by an accredited test laboratory; KYC/AML and responsible-gambling controls (model A); data-protection compliance; payment-provider compliance (model A); contractual and certification requirements of each operator (model B); and the resolution of E-RISK-1. These are separate workstreams outside Phase 8 engineering.

---

## 31. Decision register

### 31.1 Approved (restated; not changed by P8-0)

Server-authoritative target (docs/01, docs/03, docs/06 §16); money never in the engine (docs/06 §3); two RNG streams (docs/06 §11); snapshot secrecy classes (docs/06 §14); valid stake predicate (E-X2); payouts rounded down, exact arithmetic, invalid multipliers never credit (M1-D13, M1-D14); Dual Bet semantics (E-X3); E-X1 is local-only and the server runs the bonus phase on its own schedule (docs/06 §5); Phase 8 objectives WebSocket, Fastify, Redis, PostgreSQL, Authentication, Wallet, Round Engine (docs/04); P8-0 is documentation-only (owner, 2026-11-18).

### 31.2 Recommended by this document (binding only on approval)

Native WebSocket (§7); one Fastify service, modular, no microservices (§5); protocol v1 envelope and catalogue (§8); opaque sessions + one-time WS tickets (§9); precomputed `RoundScript` with the unchanged engine (§10.2); receipt-tick cashout rule mirroring D4 (§11.3); public/private snapshot allow-lists (§12); hash-chain provably-fair scheme with HMAC derivation and per-purpose streams (§16); ledger design (§18–§20); PostgreSQL lease with fencing, no Redis locks (§21); no Redis in the MVP (§22); Stage S1 layout with `server/` as an independent package (§6); separate backend deployment (§26); milestone order P8-1 … P8-14 (§29).

### 31.3 Owner decisions required

| ID | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| OD-1 | Business model | A independent / B B2B / ports-first | Ports-first; choose A or B before any real-value work | Real-value work |
| OD-2 | Currency of Phase 8 | Play-money only / real money | **Play-money only** (E-RISK-1, §30) | P8-9 |
| OD-3 | Repository layout and package manager | S1 `server/` independent package / workspaces now / separate repo; npm vs bun (two lockfiles today) | S1; pick one package manager for `server/` (npm, matching `package-lock.json`) | P8-2 |
| OD-4 | Backend hosting, managed PostgreSQL, secrets/KMS | Fly.io / Render / Railway / AWS / VPS | A container host + managed PostgreSQL in one region, with a KMS or secret manager | P8-7 |
| OD-5 | World-stream disclosure | W-A stream / W-B seed at dive start | W-A | P8-3, P8-5 |
| OD-6 | Provably-fair scheme and public salt source | A chain + salt (drand / named block) / B client-seed mixing | A; salt source to pick | P8-3 |
| OD-7 | Settlement multiplier precision | P-A exact double / P-B truncate to 2 decimals / P-C 10^-4 | Evaluate P-B in E-A; decide before P8-10 | P8-10 |
| OD-8 | Latency policy for cashouts | L-0 none / L-1 grace | L-0 | P8-4 |
| OD-9 | Multiplayer bonus rules | Shared triple revealed after window, default chest 0 / per-player permutation / other default | Shared triple, reveal after window, chest 0 default | P8-4 |
| OD-10 | Client replica-mode engine exception E-X8 | R-A / R-B / R-C | R-A (specify before P8-6) | P8-6 |
| OD-10b | Server access to outcome domain functions | Facade export (E-X9, one line) / read-only domain import | Facade export | P8-3 |
| OD-11 | In-flight round policy after authority failure | Void + refund / resume | Void + refund for betting/diving; complete for bonus | P8-7, P8-11 |
| OD-12 | Stake limits, max win, round exposure caps | Values from E-A | Decide after E-A; Q1 stays open until then | P8-10 |
| OD-13 | Identity methods | Guest / OAuth / email+password / operator | Guest + OAuth | P8-8 |
| OD-14 | Redis | MVP / deferred to P8-12 | Deferred | P8-12 |
| OD-15 | Play-money currency definition | Code, minor exponent, starting grant, top-up rule | `AQC`, exponent 2, grant policy to define | P8-9 |
| OD-16 | Authorize economy analysis E-A | Yes / later | Yes, in parallel with P8-1..P8-5 | Real-value work |
| OD-17 | Lovable independence track timing | Now / after Phase 8 / never | After the Phase 7 close-out, as its own track | Stage S2 |
| OD-18 | Float determinism approach | Reference verifier / deterministic math (engine change) / design change | Reference verifier + cross-engine test first | P8-3 |
| OD-19 | Bet cancellation | Excluded / allowed during betting | Excluded in v1 | P8-1 |
| OD-20 | Jackpot settlement timing | One settlement at bonus resolution / two-step (impact + chest) | One settlement | P8-10 |
| OD-21 | Data protection and log retention | Retention periods, player-data handling | Legal review | P8-8 |

---

## 32. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | **E-RISK-1**: economy returns far more than the stake under a trivial strategy (§17.2) | **High** | Play-money only; E-A; no real-value work until an approved model |
| R-2 | Client replica mode needs an engine change (§27.3) | High | E-X8 specified and approved before P8-6; local mode untouched |
| R-3 | Cross-engine float divergence breaks third-party verification (§16.9) | Medium | Reference verifier; cross-engine test; escalate to OD-18 (b)/(c) if needed |
| R-4 | Secret leakage (seed, crash point) via snapshot, logs, timing or insiders | High | §12.4, §11.5, §16.8, redaction tests |
| R-5 | Split-brain double settlement | High | Fencing epoch in every transaction (§21) |
| R-6 | Lovable edits touching server or protocol code | Medium | Review rule, README notice, optional separate repo (§26.2) |
| R-7 | Two lockfiles / unclear package manager | Medium | OD-3 |
| R-8 | Unbounded jackpot liability in multiplayer | High (real money) / Low (play-money) | OD-12 after E-A; liability metric (§23) |
| R-9 | Scope creep into admin, payments or real money | Medium | §3.2 non-goals; one milestone at a time |
| R-10 | Phase 7 gates remain open while Phase 8 planning proceeds | Low (documentation only) | P8-0 changes no source; Phase 7 records preserved |

---

## 33. Repository state at P8-0 (Verified)

- Branch `develop`, `HEAD` = `01b061e` (`feat(a11y): honor reduced motion preferences (V7)`), five local commits ahead of `origin/develop` (`d1ccb9b`): R1 `cede9be`, V4 `9bc714d`, V5 `dfe3342`, V6 `232c554`, V7 `01b061e`. Not pushed by P8-0.
- Uncommitted before P8-0 and preserved: `docs/14_TASKS.md`, `docs/16_CURRENT_TASK.md` (the P7-C readiness-audit entries) and the untracked `docs/19_PHASE7_CLOSEOUT_READINESS.md`.
- P8-0 adds this file and appends clearly separated P8-0 entries to docs 04, 14, 15 and 16. No source, dependency, build, deployment, `AGENTS.md`, `vite.config.ts`, `package.json` or lockfile change. Nothing staged, committed or pushed.

---

*This document is a proposal. It becomes the backend's architectural source of truth only when the owner approves it. Until then Phase 8 is not started, and no milestone in §29 may begin without its own authorization.*
