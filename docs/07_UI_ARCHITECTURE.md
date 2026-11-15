# UI ARCHITECTURE

Status: **Approved and binding** (approved 2026-08-17 as Sprint 4's Commit 1 / U0 step; approval ratified the five §7 sanctioned deltas V1–V5)
Scope: The UI layer only (Phase 6 — User Interface). This document changes no code.
Goal: The single source of truth for the Sprint 4 UI extraction. Every UI commit is a mechanical execution step that consults this document; no UI commit should ever need to make an architectural decision.

Precondition: Sprint 4 must not begin until the Sprint 3 close-out is approved (E6 + the bet-basis fix + retrospective, per `docs/16_CURRENT_TASK.md`). This blueprint may be reviewed before that, but Commit U1 may not.

Benchmark: the front ends of production crash games (Aviator, JetX class) — a thin, componentized, responsive shell over an authoritative engine, where every visible number is traceable to engine state or a settlement ledger, and where swapping local settlement for server wallet events (Phase 8) touches one module.

Companion contracts, both binding and untouched by this sprint:

- `docs/05_RENDERING_ARCHITECTURE.md` — the renderer stays a pure `(RenderState, RenderTime) → pixels` consumer.
- `docs/06_ENGINE_ARCHITECTURE.md` — the engine stays the authoritative owner of the round; its facade (`GameEngine`, `EngineDriver`, events, commands, projections) is the fixed input edge of everything designed here. **The engine and renderer are read-only this sprint** (§20 risk 1).

---

## 1. Purpose and Design Goals

Sprint 3 left `src/components/AbyssAnchor.tsx` as a 419-line "UI shell": engine session construction, settlement listeners (all money math), per-frame HUD mirroring, notifications, input handling, and every piece of markup — one file, many responsibilities. Sprint 4 dissolves it into a professional UI framework: a composition root (`GameScreen`), framework-agnostic stores, single-responsibility components, a notification system, and a responsive layout.

Design goals, in priority order:

1. **The settlement layer becomes a module, not a React effect.** Money math (docs/06 §3) moves verbatim into a framework-agnostic wallet store that subscribes to engine events for the lifetime of the game session — not the lifetime of a component mount. This is the Phase 8 seam: server wallet events later replace local computation by swapping this one module.
2. **Session lifetime is fully decoupled from React.** The engine already survives remounts (docs/06 §13); after Sprint 4, so do the wallet, history, and notifications. React components become disposable views over durable session state.
3. **One state, one owner, pull-based.** Every displayed value has exactly one source: engine public state (mirrored per frame) or settlement state (updated per event). Components subscribe to the store slice they render; no value is ever computed in two places (the discipline that caught the bet-basis bug becomes structure).
4. **Single-responsibility components** (Master Rules). Each HUD element, overlay, and control is its own component with a props/store contract, individually testable.
5. **Localization-ready, not localized.** All user-facing strings move to one module (the vision's Localization goal lands as a seam now, an implementation later). The engine already emits no strings (docs/06 §3); after Sprint 4, neither does any component body.
6. **Behavior preservation.** Markup, money math, timings, and interaction behavior move verbatim. The only intended differences are the five sanctioned deltas in §7; approval of this document ratifies them. *(2026-11-13: Money Integrity M1 adds owner-sanctioned changes outside these deltas: stake validation, and payouts rounded down rather than to the nearest cent. Both are recorded in §23.1 and §23.3.)*

## 2. Sprint 4 Objectives

Phase 6 objectives from `docs/04_DEVELOPMENT_ROADMAP.md`, made concrete:

| Roadmap objective | Delivered as |
|---|---|
| UI Architecture | Game session module (§8), store model (§9), component tree (§13), import rules (§6), strings seam (§14) |
| HUD | TopBar, HistoryStrip, MultiplierOverlay, boost badge — store-driven components (§13) |
| Betting Panel | BetControls, QuickBets, ActionButton — the five-state action matrix as a typed derivation (§13.3) |
| Notifications | Event-driven notification store + banner components; `commandRejected` surfaced in dev (§12) |
| Responsive Layout | Mobile layout preserved; desktop breakpoint layout — the one sanctioned visual change (§15) |

Deliverable: Professional UI Framework — `AbyssAnchor.tsx` dissolved into `src/ui/` per §16's target structure, with the game visually and behaviorally identical on mobile viewports.

## 3. Current UI Audit (post-Sprint 3)

What the shell does today, by responsibility (all in `src/components/AbyssAnchor.tsx`):

1. **Session construction** (module scope): `worldRng`, `LocalRoundAuthority`, `GameEngine`, `EngineDriver` — four module-level singletons.
2. **Settlement + display listeners** (mount effect): seven `engine.events.on(...)` subscriptions holding all money math (`betPlaced` debit + bet-basis lock, `cashedOut` credit, `shipImpact` jackpot auto-credit, `chestPicked` delta credit), history recording, and flash timers.
3. **Per-frame HUD sync** (driver sink): `setPhase/setCountdown/setMultiplier/setBoost` once per frame (delta D5).
4. **Canvas stage attach**: `SceneRenderer` construction, resize + frame delegation.
5. **Input → commands**: `placeBet` (with the §3 affordability check), `cashOut`, `pickChest`.
6. **Local UI state**: bet input value, participation/cashed flags (state + ref mirrors), `roundBet` lock, last win, history, chests, flashes.
7. **Markup**: top bar, history strip, multiplier overlay, crash/cashed banners, chest picker, bet controls, quick bets, five-branch action button, two inline SVG icon components.

Numbers: 419 lines; 14 `useState`/`useRef` pairs (5 of them state+ref mirrors of the same fact); 7 event subscriptions; 2 `setTimeout` flash timers; ~30 user-facing string literals; layout fixed at `max-w-md` portrait.

## 4. Problems with the Current Implementation

Defects and structural debts this sprint resolves (each maps to a delta in §7 or a commit in §17):

1. **Settlement lifetime is wrong.** The settlement listeners attach in a mount effect and detach on unmount — but the engine runs at module scope. If the component unmounts mid-round (route change, remount), settlement misses events while the round continues: wallet drift by construction. (V1)
2. **The wallet resets on remount.** `balance`, `history`, `lastWin` are `useState` — a remount resets the player's session money display while the engine world correctly survives (docs/06 §13 made the world durable; the wallet was left behind). (V1)
3. **State + ref mirrors.** `hasCashed`/`hasCashedRef`, `participating`/`participatingRef`, `bet`/`betRef`, `roundBet`/`roundBetRef` — the two-writers pattern docs/06 §20 risk 2 warned about, surviving inside the shell. A store with synchronous reads eliminates every mirror.
4. **Flash timers leak.** `setTimeout(setCashFlash, …)` in listeners fires after unmount and dies with the component; timing state is not owned anywhere. (V2)
5. **`commandRejected` is dropped.** The engine reports every rejected command (docs/06 §12, "UI dev-visible"); the UI subscribes to nothing — silent failures during development. (V2)
6. **Monolithic render.** Every per-frame `multiplier` change re-renders the entire shell — top bar, history, betting panel included. Correct (React bails on equal values) but structurally wasteful and about to get worse with more components. (V3)
7. **Bet input sanitation is implicit.** The handler `Math.max(0, +e.target.value)` clamps negatives but does not reject a non-finite number, and the affordability guard (`!(b <= 0 || b > balance)`) lets `NaN` through to the engine; the betting cutoff is a magic `0.2` inline. (V4) *(Correction C8, U5 — owner decision D3: this item originally claimed that an empty field yields `NaN`. It does not: `+""` is `0`, so a cleared field shows 0 and disables PLACE BET — pinned by U3 and kept by U5, D1. A number input also sanitizes non-finite text such as `1e309` to `""` before `onChange` sees it, so through the field a non-finite value never reached the handler.)*
8. **Not responsive.** `max-w-md` centered column regardless of viewport; desktop shows a phone-shaped strip. (V5)
9. **One file, many responsibilities** — the Master Rules violation the sprint exists to fix.

## 5. Target UI Architecture

Four layers inside `src/ui/`, with strictly one-way flow:

```
            engine events                    engine projections (per frame)
                 │                                      │
        ┌────────▼──────────┐                  ┌────────▼────────┐
        │  SESSION           │  owns            │                 │
        │  session.ts        │─────────────────▶│  STORES         │
        │  engine + driver + │  writes          │  wallet, round, │
        │  renderer attach   │                  │  notifications, │
        └────────┬──────────┘                  │  bet input      │
                 │ submit(command)              └────────┬────────┘
                 │                                       │ subscribe (useStore)
        ┌────────┴───────────────────────────────────────▼────────┐
        │  COMPONENTS  GameScreen → TopBar / HistoryStrip /        │
        │  MultiplierOverlay / Banners / ChestPicker / BettingPanel│
        └────────────────────────────┬────────────────────────────┘
                                     │ reads
                              ┌──────▼──────┐
                              │  STRINGS     │  strings.ts (localization seam)
                              └─────────────┘
```

- **Session** (§8) is the composition root: constructs engine, driver, stores; wires event subscriptions once per session; exposes `attachCanvas` and `submit`.
- **Stores** (§9–§12) are plain TypeScript modules — no React — holding all durable UI-layer state. React binds via `useSyncExternalStore`.
- **Components** (§13) are stateless views: subscribe to store slices, render markup, submit commands. The only `useState` that survives is genuinely ephemeral view state (none identified today — even the bet input becomes a store, §9).
- **Strings** (§14) is the single home of user-facing text.

## 6. UI Boundaries

Import rules (enforceable in review, grep-level), extending docs/05 §18 and docs/06 §4:

- `src/ui` imports only: its own modules, the engine facade (`@/engine` — never engine internals), `SceneRenderer` + contract types from `src/rendering/scene-renderer`, `src/game` (config, constants, presentation, types), `src/shared`, and `src/components/ui` (the shadcn primitives) where a primitive genuinely fits.
- Nothing under `src/engine`, `src/rendering`, `src/shared`, or `src/game` ever imports from `src/ui`. The dependency arrow points one way: UI consumes the platform.
- **Money math exists in exactly one file**: the wallet store (§10). No component computes a balance, win, or delta; components render store values. (`potentialWin` display math — locked bet × live multiplier — is a derived read in the round store, §11, sourced from the same locked value settlement uses.) *(2026-11-13, M1-D8: the payout rounding function of §23.13 is settlement-layer money math. It may live in its own module beside the wallet store. The wallet and the `potentialWin` display both call it, so a payout is still defined in exactly one place.)*
- **No user-facing string literals in components** after U6 (§14); dev-only console output is exempt.
- Wall-clock use in `src/ui`: notification timing only, inside the notification store (§12) — presentation timing is UI-owned per docs/06 §8. No UI code reads engine internals, clocks, or RNG for anything else.
- The affordability check (docs/06 §3 — the one bet validation that is a wallet question) lives in the wallet store, invoked by the session's `submit` path — not in a component.

## 7. Sanctioned Behavior Deltas

The only intended behavior changes of the entire sprint. Approval of this document ratifies them; each is called out again in the commit that lands it. Everything else — markup, money values, timings, interaction states — moves verbatim.

| # | Delta | Today | After | Why sanctioned |
|---|---|---|---|---|
| V1 | Settlement + wallet become session-scoped | Listeners detach on unmount (missable events); balance/history/lastWin reset on remount | Wallet subscribes for the session lifetime; money display survives remount and can never miss an event | Fixes a wallet-drift defect (§4.1–2); the engine-side twin landed in E6 |
| V2 | Notification timing centralized; rejections surfaced | Flash `setTimeout`s live in listeners and die with the component; `commandRejected` ignored | Notification store owns durations (values unchanged: `CASH_FLASH_MS`, `JACKPOT_FLASH_MS`); rejections logged/shown in dev builds only | Fixes timer leaks; makes the engine's error reporting visible (docs/06 §12) |
| V3 | Per-frame sync targets stores, components subscribe to slices | One component re-renders wholesale each frame | Only components whose slice changed re-render (equal-value bailout preserved) | Pure perf/structure; identical pixels |
| V4 | Bet input sanitation | Negatives clamped to 0, non-finite numbers not rejected; a cleared field is 0 (not `NaN` — C8); `canAfford(NaN)` true; cutoff is a magic `0.2` | Every bet-input write sanitized: non-finite → 0, negative → 0, cleared field still 0; one affordability predicate (non-finite → false) shared by `canAfford` and the action state; cutoff named `BET_CUTOFF_SECONDS` with the same value, UI-only (U5, D1–D11) | Defense in depth on a money input; no honest-path change *(2026-11-13: describes U5 as landed. The M1 policy, §23, adds a separate sanctioned behavior change — sub-cent and below-minimum stakes are rejected — approved but not yet implemented.)* |
| V5 | Responsive desktop layout | `max-w-md` phone strip at all widths | ≥ `lg` breakpoint: stage + side panel layout (§15); mobile byte-identical *(as landed in U7, `4440009`, with two owner corrections: `tab` and `desk` variants replace `lg`, and the desktop stage is a full landscape region, not a fixed portrait aspect; §15)* | The Phase 6 "Responsive Layout" objective — the sprint's one visual change |

*Dual Bet (E-X3, owner-approved 2026-11-14, `be10b19`) is an approved gameplay change outside V1–V5. It changes the betting panel's markup on every viewport, including phones (§13.3, §15). The mobile "byte-identical" rule therefore holds for U7 against U6, and not for the post-E-X3 betting panel.*

## 8. The Game Session Module

`src/ui/session.ts` — the composition root; the only place engine construction and event wiring exist.

- Owns, at module scope (preserving today's SSR-safe module-singleton semantics exactly): the `world` Rng, `LocalRoundAuthority`, `GameEngine`, `EngineDriver`, and every store instance.
- Wires, once at construction: the wallet store's settlement subscriptions (§10), the notification store's event subscriptions (§12), the round store as the driver's `sync` sink half (§11). These live for the session — never torn down by React (V1).
- `attachCanvas(canvas: HTMLCanvasElement): () => void` — constructs the `SceneRenderer`, calls `driver.attach` with `frame` = resize + render (verbatim from today's sink) and `sync` = round-store write; returns the detach that disposes the renderer and pauses the driver. The renderer remains per-canvas-mount (it holds the 2D context); everything else survives detach, exactly as the driver already guarantees (docs/06 §13).
- `submit(command: EngineCommand)` — the single command edge for components; routes `placeBet` through the wallet store's affordability check (§6) and everything else straight through. The engine remains the validator of all round-state questions (D4). *(E-X3, `be10b19`: a `placeBet` or `cashOut` without slot 0 or 1 is dropped. Every forwarded `placeBet` stays in flight until the engine answers it with `betPlaced` or `commandRejected`. A bet is forwarded only if it is a placeable stake against the balance minus the other slot's largest stake in flight. So two bets submitted before the next tick can never together exceed the balance, which keeps the engine and the wallet consistent (I8, §23.12). A slot's own repeated submissions are not reserved against each other, because the engine rejects all but one of them.)*
- *E-X3:* the session owns one bet-input store per slot, `betInputs: [slot 0, slot 1]`, replacing the single `betInput`.
- Test seam: the module-scope singleton is assembled by an exported `createGameSession(deps)` factory (engine deps injectable — scripted authority, deterministic Rngs, manual tick driver). Production uses the module singleton; tests construct their own session. This is what makes §21's UI tests deterministic, and it costs nothing at runtime.

## 9. Store Model

Deliberate decision, mirroring the engine's no-ECS and the renderer's no-scene-graph stances: **no state-management dependency.** A minimal hand-rolled external store primitive:

- `createStore<T>(initial)` → `{ get(): T; set(next: T): void; subscribe(fn): () => void }` — synchronous, snapshot-based, ~30 lines, in `src/ui/store/store.ts`. Notification of subscribers only when the snapshot reference changes; writers construct new snapshots (equal-value writes bail, preserving D5's quiet-frame behavior).
- React binding: `useStore(store, selector)` built on `useSyncExternalStore` (React 19, built in) in `src/ui/hooks/use-store.ts`. Selector-level subscription gives V3's re-render granularity.
- Why not zustand/jotai/redux: the need is four small stores with synchronous reads; the settlement store **must** be framework-free for Phase 8 (it becomes the client of the server wallet); a new runtime dependency needs owner approval and buys nothing here but API surface. If the store count or derivation complexity grows materially (Phase 8's live-players lists, Phase 9's admin panel), adopting a library then is a mechanical swap behind `useStore` — recorded as the trigger, not built now.
- Stores never subscribe to stores. Derived values are computed in selectors (cheap, pure) or written by the single owner that already owns the inputs. No derivation graph, no effects system.

The four stores and their single writers:

| Store | Writer | Contents |
|---|---|---|
| `wallet-store` | Engine settlement events only (§10) | `balance`, `roundBet` (locked basis), `participating`, `hasCashed`, `lastWin`, `history`, jackpot base |
| `round-store` | The session's round-store write only, by two paths: the driver's per-frame `sync` and the immediate write when `attachCanvas` attaches (§11) | Mirror of `EnginePublicState`: `phase`, `countdownSeconds`, `multiplier`, `boost`, `chests`, `chosenChestId`, `participant` (whose `bonusEligible` gates the picker since E-X1) |
| `notification-store` | The wallet's flash trigger (`onFlash`), the round-transition events `bettingOpened`/`diveStarted`, its own timer; dev only: `commandRejected` (§12) | The active flash (kind + start + expiry; the amount is the wallet's `lastWin`), dev-only bounded rejection history |
| `bet-input-store` | Betting-panel handlers only (−, +, the field, quick bets); no event or store subscription | The bet input value, always finite and ≥ 0 (session-owned since U5, starts at `DEFAULT_BET`, survives remount like everything else; halve/double/quick-set logic lives here, verbatim; `double` takes the balance as an argument at click time) |

*E-X3 (2026-11-14, `be10b19`):* the wallet's per-round fields (`roundBet`, `participating`, `hasCashed`, the settlement record, the slot's own `win`) move into `slots: [slot 0, slot 1]`. `balance`, `history`, `lastWin` (now the most recent event's combined credit) and the claims list stay shared. The round store mirrors `participants` (two entries) in place of `participant`. There are two bet-input stores, one per slot (`session.betInputs`). The single-writer rules are unchanged.

## 10. The Wallet Store (Settlement Layer)

`src/ui/store/wallet-store.ts` — the settlement layer of docs/06 §3, extracted whole. The heart of the sprint.

- The seven listener bodies move **verbatim**: `betPlaced` (debit + bet-basis lock — the Commit 8 fix preserved exactly: the lock rides the event payload, never the input), `diveStarted` (per-dive display resets), `cashedOut` (credit + history + flash trigger), `crashed` (loss history), `shipImpact` (jackpot auto-credit + history), `chestsRevealed`, `chestPicked` (delta credit + history). Float math with `toFixed(2)` moves byte-for-byte; flash *triggers* delegate to the notification store (§12) while all money math stays here. *(Superseded for payouts by M1-D8, 2026-11-13: wins are to be rounded down to the cent with exact integer arithmetic. The debit and balance expressions are unchanged. See §23.3 and §23.13. Until that stage lands, the code is as U2 recorded.)*
- The state+ref mirrors dissolve: the store's snapshot **is** the synchronous read the refs existed to provide. `participatingRef`/`hasCashedRef`/`roundBetRef`/`jackpotMultRef` all become plain fields with one writer.
- Per-round reset (today's `phase === "idle"` effect) becomes a `bettingOpened` listener — event-driven like everything else, closing the last polling-shaped reset.
- `canAfford(amount)` — the §3 affordability check, consumed by the session's submit path (§8).
- **Phase 8 shape, by construction:** every mutation is a response to an engine event carrying the authoritative values. Swapping to server-authoritative wallets = replacing the listener bodies with server wallet-event application; the store's read surface (and therefore every component) is untouched. Integer-minor-units migration (roadmapped, separate task) now has a one-file blast radius — see §20.
- Testable headless: a scripted event sequence in, a balance ledger out (§21). The Commit 8 replay test generalizes into this store's permanent suite.

## 11. The Round Store (Engine-State Mirror)

`src/ui/store/round-store.ts` — the pull-model boundary (docs/06 §12) with one writer, the session's round-store write, reached by exactly two synchronization paths: driver synchronization during frames, and immediate synchronization when the canvas attaches (below).

- Snapshot = `EnginePublicState`, **projected and normalized on write** (correction C6, U4b), once per frame while attached. No interpretation — the projection map already speaks the UI's vocabulary (docs/06 §13) — but three normalizations: `participant` is copied field by field (the engine mutates its own participant object in place, so a stored reference would change under the snapshot); chests are a frozen defensive copy, made only when their contents change (the engine never mutates its chest array in place, but the array comes from the injectable `RoundAuthority` and is handed by reference to every `chestsRevealed` listener); and a write whose fields are all unchanged keeps the previous snapshot by reference, so quiet frames notify nobody (§9), while unchanged sub-objects keep their identity across a changed write. Stored objects are frozen.
- Synchronization (owner-approved with the U4b plan): seeded once at session construction from `engine.getPublicState()` (a pure read, SSR-safe), then written from `engine.getPublicState()` by exactly two paths. (1) **Driver synchronization during frames:** the driver's `sync`, which the session supplies itself (`attachCanvas(canvas)` no longer takes a host sync callback), runs once per rAF frame while attached, after that frame's `engine.advance()` and event dispatch, so the wallet and notification stores have already seen the frame's events. (2) **Immediate synchronization when attaching the canvas:** `attachCanvas` writes once synchronously, before `driver.attach`, so a remount never shows a stale snapshot if the engine advanced while detached; in production it is a no-op that notifies nobody (the engine advances only inside driver frames, each followed by a sync), and it consumes no tick. No event subscriptions, no timers, no other writer. A pick that the engine applied while the component was unmounted shows as revealed after the remount.
- Derived reads live here as selectors: `potentialWin` (wallet `roundBet` × round `multiplier`, the two locked sources — computed in the screen from both stores, keeping stores independent). *(Correction C9, U5 — owner decision D6: `canBet` is not a round-store selector. It reads three stores — phase and countdown, participation and balance, the bet input — so it lives in the pure `canPlaceBet`/`actionStateFor` derivation, `src/ui/components/action-state.ts`, §13.3; the stores stay independent.)*
- When detached (no canvas), the mirror simply stops updating — identical to today, where the sink is the only writer.
- Lands in **U4b** (§17). Owner decision 2026-11-13: because the store mirrors `EnginePublicState` (whose `chests`, `chosenChestId` and `participant.bonusEligible` are engine state, not event history), the eligible chest picker **must be restored after a React component remount during `bonus`**. The component-side `chests`/`chosenChest` state and its three chest listeners are deleted in the same commit, and the U3 pin `PINNED UNTIL U4` in `src/ui/screen.remount.test.tsx` is updated there (its sanctioned step).

## 12. Notification System

`src/ui/store/notification-store.ts` + banner components — Phase 6's "Notifications" objective, sized to what the game actually shows. Not a toast library: the game's notifications are bespoke full-stage overlays and flashes, already designed; sonner (present in dependencies for shadcn) stays out of the game surface.

- Model: `flash: { kind: "cashFlash" | "jackpotFlash"; seq; startedAt; expiresAt } | null` plus derived banner visibility (`crashBanner` and `chestPicker` remain pure phase deriveds from the round store — they are *state*, not notifications, and get no timers). *(Correction C1, U4a: the flash carries no money payload — the banner's amount is the wallet's `lastWin`, so money keeps exactly one owner, §6.)*
- Writers: the wallet's flash trigger — `cashedOut` → cash flash (duration `CASH_FLASH_MS`), `shipImpact` auto-cash → jackpot flash (`JACKPOT_FLASH_MS`). The wallet decides *when* (the jackpot flash depends on pre-credit settlement state, §10) and announces via `wallet.onFlash`; the store owns duration and timer (session lifetime, V2), values unchanged. At most one pending `setTimeout`: a new trigger cancels the previous timer and supersedes the flash. The round-transition events `bettingOpened` and `diveStarted` — the two events on which the shell cleared its flash — clear the flash **and cancel its timer** (C2). The clock (`now`/`setTimeout`/`clearTimeout`) is injectable for deterministic tests; production reads the globals at call time. The wall clock is sanctioned here per §6.
- Lifetime: an active flash survives a component unmount/remount and expires on its original deadline (wall clock keeps running while unmounted, as the shell's timer did).
- `commandRejected` → dev-only diagnostics, gated by `import.meta.env.DEV` **and** the session's opt-in (the production singleton passes `import.meta.env.DEV`; `createGameSession` defaults to off, so tests opt in explicitly): `console.warn` with command + reason, plus a bounded rejection history (`REJECTION_HISTORY_LIMIT` = 20, newest first) in the store snapshot. Compiled out of production like the renderer's frame meter (docs/05 R5 precedent). **The small dismissible dev banner is deferred to U6** (owner decision 2026-11-13, C3): it is markup, and lands with the components that render the history. Production-facing rejection UX is deliberately deferred — today's UI disables invalid actions before submit, so a user-visible rejection is a bug indicator, not a UX state.
- Extensible by construction for Phase 7/8 consumers (audio cues, "player X cashed out" feeds) — new kinds, same store; recorded, not built.

## 13. Component Decomposition

All markup moves verbatim (class strings byte-identical, mobile) into `src/ui/components/`. The route mounts `GameScreen`; `AbyssAnchor.tsx` is deleted in the final extraction commit (`src/routes/index.tsx` import updated in the same commit).

### 13.1 Screen and HUD

| Component | Renders | Reads |
|---|---|---|
| `GameScreen` | Layout frame; composes everything; owns `attachCanvas` via ref effect | — |
| `TopBar` | Logo block, balance chip | wallet: `balance` |
| `HistoryStrip` | Round-result chips | wallet: `history` |
| `CanvasStage` | The canvas element + attach lifecycle | session: `attachCanvas` |
| `MultiplierOverlay` | Multiplier readout, potential win, spectating hint, countdown hint, boost badge | round: `phase`, `multiplier`, `countdownSeconds`, `boost`; wallet: `participating`, `roundBet` (since E-X3: `slots`, §13.3) |

### 13.2 Overlays

| Component | Renders | Reads |
|---|---|---|
| `CrashBanner` | "CHAIN SNAPPED" card | round: `phase`, `multiplier` |
| `WinFlash` | "CASHED OUT +X" card | notifications: active flash; wallet: `lastWin` |
| `ChestPicker` | Chest overlay + pick buttons | round: `phase`, `chests`, `chosenChestId`; submits `pickChest` |

### 13.3 Betting Panel

| Component | Renders | Reads |
|---|---|---|
| `BettingPanel` | Bottom controls frame; composes the three below | — |
| `BetControls` | −/+ steppers, amount field with tier label (sanitation V4 lands here) | bet-input store; round: `phase` |
| `QuickBets` | The `QUICK_BETS` row | bet-input store; round: `phase` |
| `ActionButton` | The five-state action | derived action state (below) |

The five-branch conditional becomes a typed derivation — `actionStateFor(round, wallet, betInput): ActionState` — a pure function in `src/ui/components/action-state.ts` returning a discriminated union (`placeBet | betLocked | cashOut | secured | spectating | waiting`), unit-tested exhaustively (§21). The component maps state → markup; the decision logic leaves JSX.

**Dual Bet, as landed in E-X3 (`be10b19`).** `BettingPanel` composes two `BetSlotPanel`s, **BET 1** and **BET 2**. Each is a real engine slot with its own stake, PLACE BET and CASH OUT, and no simulated second panel exists. `BetControls`, `QuickBets` and `ActionButton` take a `slot` prop and read that slot's bet-input store and wallet slot. Phones and tablets show the two panels side by side, both always visible, with no collapsed or expandable BET 2. The desktop rail (`desk`) stacks them. On phones each panel is compact, and `QuickBets` is hidden below `tab`, so each panel keeps the stake field, the steppers and the action button. `actionStateFor` is unchanged and is evaluated once per slot, against `balance` and that slot's `participating` and `hasCashed`. The CASH OUT label is the slot's own rounded-down payout, and SECURED shows the slot's own credited win. `MultiplierOverlay`'s potential win is the sum of each slot's separately rounded-down payout: over the slots still riding, or over all participating slots once every slot is settled. `ChestPicker` is shown while any slot is bonus-eligible, and its one pick applies to every eligible slot. The slot heading text is `STRINGS.panel.slotLabel(n)`.

As landed in U5: `actionStateFor({ phase, countdownSeconds }, { balance, participating, hasCashed }, bet)`. Only `placeBet` carries a flag (`enabled`, from `canPlaceBet`: betting window, not participating, `isAffordable(bet, balance)`, countdown strictly above `BET_CUTOFF_SECONDS`); `cashOut` is always enabled, the other four always disabled. The `cashed` (impact), `crashed` and `bonus` phases map to `waiting` with the bet controls still enabled, as before (D10). The bet controls are disabled during `diving` only. The derivation computes no money: label amounts stay display reads. It is proven equal to a verbatim transcription of the pre-U5 JSX over the full input cross product (`action-state.test.ts`).

Icons (`AnchorIcon`, `ChestIcon`) move to `src/ui/components/icons.tsx` unchanged. *(2026-11-15, close-out Step 3: the owner-approved Bonus Chest redesign replaced `ChestIcon` in `ChestPicker` with the illustrated `TreasureChestArt` in the same file. `ChestIcon` had no remaining importer and was removed. `icons.tsx` now exports `AnchorIcon` and `TreasureChestArt`.)*

### 13.4 What stays out

The shadcn library under `src/components/ui/` remains the app-primitive layer; game components use it only where a primitive genuinely matches (none required by this blueprint — the game's controls are bespoke). No new visual design, no theme changes, no animation rework (§20 non-goals).

## 14. Strings and the Localization Seam

`src/ui/strings.ts` — every user-facing string in one typed module: `STRINGS.hud.multiplierLabel`, `STRINGS.actions.cashOut(amount)`, … (functions where text interpolates values, so word order is never hardcoded at call sites — the i18n-proof shape).

- Landing rule: extracted in the same commit as the component that renders them (U6–U7), byte-identical text.
- Money/multiplier display formatting: components render via `formatMultiplier`/`chainTier` (`src/game/presentation.ts`) as today; the scattered `.toFixed(2)` money displays consolidate into a `formatMoney` in the same presentation module — identical output, one definition (Master Rules: no duplicated logic).
- Actual localization (locale files, selection, pluralization) is a roadmapped later task; this seam is its entire prerequisite. The engine's no-strings rule (docs/06 §3) plus this module means localization will touch exactly one layer.

## 15. Responsive Layout (V5)

The sprint's one visual change, landing in the final commit behind screenshot approval:

- **Mobile (< `lg`): byte-identical.** The current `max-w-md` column is the canonical layout; class strings on this path do not change.
- **Desktop (≥ `lg`, 1024 px):** two-region layout — the canvas stage centered at a fixed portrait aspect (the world is designed portrait; docs/05's camera and layers assume a vertical stage), with the betting panel and history in a right-hand side rail (`TopBar` spanning). No canvas-content change: the stage keeps portrait proportions, so `RenderState` consumption and all docs/05 math are untouched — this is CSS-level composition only.
- Breakpoint mechanics: Tailwind responsive variants on the existing classes; components are layout-agnostic (they fill their grid area), so the screen owns the entire responsive decision — one file to review.
- Verification is visual: the §21 screenshot matrix. jsdom cannot assert layout; this commit's gate is explicitly manual.

**As landed (U7, committed with U6 in `4440009`, 2026-11-14), after two owner corrections the same day.** These corrections are approved departures from the text above.

- **Variants.** Two custom variants in `src/styles.css` replace `lg:`.
  - `tab`: ≥ 768 px wide **and** ≥ 600 px tall. The phone column is released to full width, and the betting controls are centered at up to 38rem.
  - `desk`: ≥ 1024 px **and landscape**. A portrait 1024×1366 iPad Pro therefore gets the `tab` column, not the rail.
  - The owner requested this, and it changes 768×1024. Phones (below `tab`) keep the canonical column.
- **Desktop (`desk`).** A full-viewport landscape grid. The canvas stage fills the whole left region with **no aspect lock**: about 67 % of the width at 1024 px, about 73 % at 1280–1440 px, about 76 % at 1920 px. A right rail sized `clamp(21rem, 25vw, 28rem)` stacks TopBar (brand + balance), a wrapping HistoryStrip and the BettingPanel card at its foot.
  - The earlier 9:16 portrait stage is retired, at the owner's direction. This departs from "centered at a fixed portrait aspect" above.
  - The renderer is unchanged. It reads the canvas's CSS size every frame at uniform 1:1 CSS pixels. Positions follow the width, sizes stay fixed in pixels, and there is no `RenderState` change.
- **Ownership.** `GameScreen.tsx` owns the decision, by child position, as specified. Components carry only `tab:` size tokens, and the DOM is identical at every width.
- **After E-X3 (`be10b19`).** The betting panel holds two slot panels (§13.3): side by side on phones and `tab`, stacked in the `desk` rail. Priority sizes for the dual panel are 375×667 and 390×844, with no horizontal overflow, no unnecessary vertical scroll, and a canvas that still shows the ship, chain, obstacles and gameplay without clipping (owner decision, docs/16). No owner verification of these sizes is recorded yet. *(2026-11-15: owner-verified and approved at 375×667 and 390×844, §19 gates 7–8.)*
- **Sprint 4 QA fix D1 — scene fit (2026-11-14; uncommitted, PENDING OWNER ACCEPTANCE).** The frozen renderer draws the idle ship 400 px above the anchor pin, so on stages shorter than about 800 px (every phone, and 768×1024) the ship was off-canvas. `src/ui/scene-fit.ts` makes the session pass the renderer a logical viewport of at least 820 px height, with the same aspect ratio and the backing store at native resolution: a uniform zoom-out below 820 px, unchanged above. The renderer and `RenderState` are unchanged. This departs from "sizes stay fixed in pixels" above, and from §22 item 7, on short stages. The QA fixes D2–D4 (keyboard focus rescue, chest-picker focus, stake-field names) are small `src/ui` changes against §20's a11y non-goal. Both need explicit owner acceptance (docs/15, close-out Step 2). *(2026-11-15: **D1–D4 accepted by the owner** as approved QA improvements, with the departures above. They are in Git since `c046b33`. The renderer work that followed (E-X4, §19 gate 4) adds a renderer presentation offset that keeps the ship in view on short stages, and `81eb985` updated the scene-fit test to the new ship geometry; the owner's visual acceptance of 2026-11-15 covers the result.)*

## 16. Target Folder Structure

```
src/ui/
  session.ts                    # composition root: engine + driver + stores wiring (§8)
  strings.ts                    # user-facing text (§14)
  hooks/
    use-store.ts                # useSyncExternalStore binding + selector (§9)
  store/
    store.ts                    # createStore primitive (§9)
    wallet-store.ts             # settlement layer — all money math (§10)
    round-store.ts              # EnginePublicState mirror (§11)
    notification-store.ts       # flashes + dev rejection surface (§12)
    bet-input-store.ts          # bet amount + stepper/quick-set logic (§9)
  components/
    GameScreen.tsx              # screen composition + responsive layout (§13, §15)
    CanvasStage.tsx
    TopBar.tsx
    HistoryStrip.tsx
    MultiplierOverlay.tsx
    CrashBanner.tsx
    WinFlash.tsx
    ChestPicker.tsx
    BettingPanel.tsx
    BetControls.tsx
    QuickBets.tsx
    ActionButton.tsx
    action-state.ts             # pure action-matrix derivation (§13.3)
    icons.tsx
    DevRejectionBanner.tsx      # dev-only rejection banner (§12, C3; landed in U6)
```

`src/components/AbyssAnchor.tsx` is deleted when `GameScreen` takes over (U6). `src/game/` keeps its role (config, constants, presentation, types) — it is the UI's tuning/presentation dependency, not part of `src/ui`. A `src/ui/README.md` records the layer contract, as every extracted layer has.

*(2026-11-15, close-out correction: the tree as closed also holds `src/ui/scene-fit.ts` (D1, §15) and `src/ui/hooks/use-focus-rescue.ts` (D2), both owner-accepted, plus `src/ui/store/payout.ts` (M1-D8, §22 item 3). `icons.tsx` exports `AnchorIcon` and `TreasureChestArt` (§13.3).)*

## 17. Extraction Order and Estimated Commits

Same discipline as Sprints 2–3: one step per commit, behavior-preserving (modulo §7 deltas, each landing in exactly one identified commit), game playable after every commit, doc corrected first on any conflict. Order chosen so durable state exists before views move, and so UI test tooling exists before markup moves (the E1 precedent):

| Step | Contents | Deltas landing |
|------|----------|----------------|
| U0 | This document (Sprint 4, Commit 1) | — |
| U1 | Session module: `createGameSession` factory + module singleton in `src/ui/session.ts`; store primitive + `useStore` hook; engine/driver/renderer wiring and `attachCanvas` move out of the component (component consumes the session; listeners still component-side) | — |
| U2 | Wallet store: the seven settlement listeners + all money state move to `wallet-store.ts`, subscribed at session scope; component reads via `useStore`; state+ref mirrors deleted; replay/ledger test suite | V1 |
| U3 | UI test harness: jsdom + Testing Library devDependencies (**needs approval**, §20 risk 4); characterization tests pinning the current DOM per phase/participation state against a scripted session — the pins that protect U4–U7 | — |
| U4a | Notification store (§12): flash trigger consumption via `wallet.onFlash`, timer + durations verbatim, supersede, round-transition clears, session-scoped; `commandRejected` dev log + bounded history (no banner); component reads the flash via `useStore` and loses its flash state, timer and the `onFlash`/`bettingOpened` subscriptions | V2 |
| U4b | Round store (§11) as the driver's sync target; component-side HUD mirror and `chests`/`chosenChest` deleted; `attachCanvas` sync parameter retired; eligible chest picker restored after a remount during `bonus` (component still renders everything) | — |
| U5 | Bet-input store + `action-state.ts` derivation, exhaustively tested; input sanitation + `BET_CUTOFF_SECONDS` (decisions D1–D12 below) | V4 |
| U6 | Componentization: `GameScreen` + all §13 components extracted with byte-identical markup; strings module; `formatMoney` consolidation; route flips to `GameScreen`; `AbyssAnchor.tsx` deleted; per-slice subscriptions land; the dev rejection banner (§12, deferred from U4) | V3 |
| U7 | Responsive layout: desktop breakpoint composition per §15; screenshot matrix approval | V5 |

U6 is the largest step; if review size demands, it splits mechanically (HUD+overlays, then betting panel+screen flip) — step boundaries may be re-cut when reality demands, recorded in CURRENT_TASK the moment it happens (Sprint 2 precedent, R5).

**Re-cut (owner-approved 2026-11-13): U4 → U4a + U4b**, each with its own validation and approval gate. U4a (notification store) lands first; U4b (round store) may not start before U4a is approved. State ownership after each step:

| State | After U4a | After U4b |
|---|---|---|
| Active flash + timer | notification store | notification store |
| Dev rejection log + history | notification store (dev only) | notification store (dev only) |
| `phase`, `countdownSeconds`, `multiplier`, `boost`, `participant.bonusEligible` | component (`sync` callback mirror) | round store |
| `chests`, `chosenChest` | component (`diveStarted`/`chestsRevealed`/`chestPicked` listeners) | round store (`chests`, `chosenChestId`) |
| Money (`balance`, `lastWin`, …) | wallet store (unchanged) | wallet store (unchanged) |
| Bet input | component (U5) | component (U5) — session bet-input store after U5 |

Sanctioned corrections recorded with the re-cut (the binding contracts are otherwise unchanged; V2's values and scope are unchanged):

- **C1** (§12): the flash model carries no money payload; the amount displayed is the wallet's `lastWin`.
- **C2** (§12): `bettingOpened`/`diveStarted` cancel the pending flash timer, not only hide the flash, so a stale timer can never clear a later flash. Unobservable on today's timeline (both events follow any flash by more than its duration) — a leak fix within V2.
- **C3** (§12, §17): the dismissible dev rejection banner moves from U4 to U6; U4a lands the dev log and the bounded history only.
- **C4** (§13.2 consequence of V2): an active flash now survives a component remount (it was component state, lost on remount). Not a pinned behavior; covered by U4a's DOM tests.
- **C5** (U3 harness constant, not a pin): the remount tests' `DISPLAY_SUBSCRIPTIONS` drops from 5 to 3 in U4a, because the flash subscriptions are session-owned. The 20 characterization pins are unchanged.
- **C6** (§11, U4b): "stored as received" becomes "projected and normalized on write" — participant copied, chests defensively copied, unchanged writes keep the snapshot by reference (details in §11).
- **C7** (U3 harness constants, not pins, U4b): `DISPLAY_SUBSCRIPTIONS` and the notification tests' subscription constants drop from 3 to 0, because the component no longer subscribes to engine events. The StrictMode "2× added" check, empty at 0, is replaced by sink assertions: one live renderer, one draw and one round-store write per rAF frame.

**U5 decisions (owner-authorized 2026-11-13).** U5 lands V4 with these decisions; values, markup, button order and valid gameplay are unchanged:

- **D1** A cleared field still shows 0 (pre-U5 behavior, pinned by U3). **D2** Non-finite numbers (`NaN`, `±Infinity`) are sanitized to 0 on every bet-input write; the negative clamp is kept. **D3** §4.7's claim that an empty field yields `NaN` was wrong and is corrected (C8).
- **D4** The bet input is session-owned (`session.betInput`), starts at `DEFAULT_BET` and survives React remounts and StrictMode double-mounts. The U3 remount pin `PINNED UNTIL U5` is updated in U5, its sanctioned step.
- **D5** `BET_CUTOFF_SECONDS = 0.2` in `src/game/config.ts`. **D9** The cutoff stays a UI-only restriction: no new session or engine validation.
- **D6** The action state is derived by the pure `actionStateFor`, not by a store (C9). Stores stay independent.
- **D7** One affordability predicate, `isAffordable(amount, balance)` in `wallet-store.ts`, used by both `wallet.canAfford` and the action state. Identical to the old guard for finite amounts; non-finite → false (before U5, `canAfford(NaN)` was true and the engine rejected the bet as `invalid-amount`). Settlement arithmetic and engine rules are unchanged.
- **D8** No pending-submit guard: a repeated click submits again and the engine rejects it (`already-participating`, `already-cashed-out`) — one debit, one credit. **D10** `cashed`/impact keeps mapping to WAITING… with bet controls enabled. **D11** No new decimal rounding or precision rule. **D12** U4b and U5 manual browser QA remain pending.
- **C8** (§4.7, §7 V4 row): the `NaN`-on-empty claim corrected (D3). **C9** (§11): `canBet` moved from "round-store selector" to the pure action-state derivation (D6).

**Supersession note (owner decision M1-D6, 2026-11-13).** The U5 decisions above are kept as the historical record of what U5 landed. Two of them are superseded in part by the Money Integrity policy in §23: **D7** — its non-finite affordability protection stays valid, but affordability is no longer sufficient for a bet to be offered or submitted; **D11** — "no new decimal rounding or precision rule" is superseded for accepted monetary bets (at most two decimals of value, minimum 0.01, enforced by rejection, never by rounding). Details and what remains valid: §23.3. The superseding behavior is approved policy and is **not yet implemented**; the code still behaves as U5 recorded.

**As landed after U5 (reconciliation 2026-11-14, documentation only).** The §17 order is kept. The commits:

| Step | Commit (on `origin/develop`) | Notes |
|---|---|---|
| M1 (S1) | `e37b81c` | E-X2, M1-1, V2, W1–W11 and R2. M1 is **deferred by the owner, not closed** (§23) |
| U6 + U7 | `4440009` | One combined commit, approved by the owner's Git decision of 2026-11-14. This re-cuts "one step per commit" for these two steps only. U6 is as specified (V3, strings, `formatMoney`, route flip, `AbyssAnchor.tsx` deleted, dev banner). U7 is as corrected in §15 |
| M1 test suites | `e8b1b62` | The M1 test work held back from `e37b81c`. MT-06 seed 404 is replaced by 505, with no assertion removed |
| E-X3 Dual Bet | `be10b19` | The owner-approved engine freeze exception (docs/06 §13.2), the per-slot wallet amendment (§23.17), the session in-flight reservation (§8), and the dual betting panel (§13.3, §15). This is an approved change outside the U-steps. It adds no phase and no new step to this table's order |

Still open for these steps: §19 gate 7 (U6 mobile pixel-compare), the §19 gate 8 screenshot matrix (U7), and owner browser QA for Dual Bet. None is recorded as passed.

## 18. Multiplayer and Platform Readiness

What this architecture buys Phase 8+, by construction:

- **Server wallet swap = one module** (§10): the wallet store's listeners become appliers of server wallet events; read surface unchanged; no component touched.
- **Other players are new store data**: live bets/cashouts feeds are new stores + new list components; the session already wires event → store.
- **Reconnect/spectator join**: `restore(snapshot)` (docs/06 §14) + the round store's next sync produces a correct HUD frame with no UI work — the mirror has no history dependence.
- **Auto-cashout** (roadmap): a client-side rule module submitting `cashOut` on a threshold — a session-level concern slotting beside the wallet store, no component change (docs/06 §19 confirmed shape).
- **White-label** (vision): strings (§14) + theme (docs/05) + `EngineConfig` (docs/06 §13) are now the complete skin surface.
- **Admin/analytics** (Phases 8–9): the same event stream the stores consume, consumed elsewhere; nothing UI-side blocks it.

## 19. Validation Strategy

Per-commit validation gate (the UI twin of docs/05 §21 / docs/06 §21):

1. `tsc --noEmit` clean.
2. Lint at the recorded baseline (9 errors + 6 warnings entering the sprint; moved/deleted component code is expected to retire pre-existing findings — the new baseline is recorded in the commit, never worsened).
3. **All tests green** (83 entering the sprint; growing per §21). The engine determinism spot-check stays in force.
4. **Engine/renderer freeze check**: `git diff --stat src/engine src/rendering src/shared` is empty for every Sprint 4 commit. Any needed platform change stops the commit and goes back to the owner (doc corrected first). **Approved exception E-X1** (2026-11-13; bonus eligibility and deterministic completion, docs/06 §5): the E-X1 commit may change only `src/engine/state-machine.ts`, `src/engine/game-engine.ts` (snapshot schema version), `src/engine/domain/tuning.ts` (`BONUS_PICK_WINDOW_MS`) and their engine tests; `src/rendering` and `src/shared` stay untouched. Its UI side: the chest picker is shown only to a bonus-eligible participant (`participant.bonusEligible`) — manual-cashout players and spectators never see or interact with it. **Proposed exception E-X2** (valid-stake enforcement, docs/06 §13.1; planning approved 2026-11-13 under M1-D4): **not approved for implementation** — until the owner approves its exact scope, E-X1 remains the only exception and this gate applies unchanged. *(2026-11-14: **E-X2 approved by the owner**, exactly as implemented. Its files are `src/shared/stake.ts`, `src/shared/stake.test.ts`, `src/engine/state-machine.ts` (the `isValidStake` import and the `applyPlaceBet` amount guard with its comment) and `src/engine/state-machine.test.ts`. For the M1 integration commit, `git diff --stat src/engine src/rendering src/shared` must list exactly these four files. The exception is not expanded: any other engine, rendering or shared-floor change still stops the commit.)* *(2026-11-14: E-X2 landed in `e37b81c`. **Approved exception E-X3** (Dual Bet, owner-approved 2026-11-14, docs/06 §13.2) landed in `be10b19`. Its frozen-directory diff is exactly `src/engine/commands.ts`, `events.ts`, `state-machine.ts`, `game-engine.ts`, `index.ts` and the tests `state-machine.test.ts`, `game-engine.test.ts`, `snapshot.test.ts`; `src/rendering` and `src/shared` are untouched. Approved exceptions are now E-X1, E-X2 and E-X3. Each is limited to its own file list, and any other engine, rendering or shared-floor change still stops the commit.)* *(2026-11-15: **Approved exception E-X4** (renderer visuals, owner-approved 2026-11-15, recorded retroactively). It covers the presentation-only renderer work the owner accepted: ship and waterline, the floating pre-dive anchor and its chain connection, anchor descent and sea-floor landing, the slack chain, and the illustrated sea floor. Its frozen-directory diff, from `be10b19` to the close-out tree, is exactly `src/rendering/assets.ts`, `camera.ts`, `constants.ts`, `scene-renderer.ts`, `theme.ts`, `draw/chain.ts`, `draw/ship.ts`, `draw/sea-floor-art.ts`, `layers/actor.ts`, `layers/background.ts`, `layers/effects.ts`, `layers/environment.ts`, `layers/presentation.ts`, `layers/world.ts`, the tests `draw/chain.test.ts`, `draw/ship.test.ts`, `draw/sea-floor-art.test.ts`, `layers/presentation.test.ts`, and the asset `src/assets/sea-floor.png`. It landed partly in `c046b33` and `81eb985`; the rest is in the working tree. `src/engine` and `src/shared` are untouched by it, and the `RenderState` contract and gameplay are unchanged. Approved exceptions are now E-X1 to E-X4, each limited to its own file list.)* *(2026-11-15, official close-out: **E-X4 formally ratified by the owner.** Scope verified independently at close-out: `git diff --name-only be10b19 -- src/rendering src/assets` lists exactly the 19 files above, with no other rendering or asset file and nothing untracked. The committed part is in `c046b33` and `81eb985`; the last seven files (`draw/chain.ts`, `draw/sea-floor-art.ts`, `draw/sea-floor-art.test.ts`, `layers/actor.ts`, `layers/effects.ts`, `layers/world.ts`, `src/assets/sea-floor.png`) landed in `9bded6b` (close-out commit G2). `src/rendering/render-state.ts`, `src/engine` and `src/shared` show no diff from `be10b19`. E-X4 is a retrospective, file-limited exception. It authorizes no new rendering feature and no later renderer change: from this point the renderer is frozen again, and any further change needs its own approved exception.)*
5. Production build passes; dev-server SSR smoke test (HTTP 200 with canvas markup — the session module-scope construction must stay SSR-safe).
6. Console hygiene (no new warnings; U4 onward, `commandRejected` dev output only when commands are actually rejected).
7. Manual gameplay pass (docs/18 step 2, developer): full loop — bet → dive → cash out → crash round → jackpot round → chest pick → spectate; plus per-commit focus items named in the commit message (U2: balance ledger through every settlement path incl. remount mid-round; U5: input edge cases; U6: pixel-compare against pre-commit screenshots on mobile width). *(2026-11-15: **OWNER APPROVED — 2026-11-15.** The owner completed and approved the manual gameplay pass on the close-out build: the full loop, cashout, Dual Bet with BET 1 and BET 2 behaving independently, and mobile gameplay at 375×667 and 390×844. This also records the owner's E-X3 Dual Bet QA. Gate 7 is satisfied for Sprint 4.)*
8. U7 only: screenshot matrix at 375×667, 390×844, 768×1024, 1280×800, 1440×900 — mobile widths byte-identical to pre-U7 captures; desktop layouts approved by the owner before merge. *(2026-11-14: the pending matrix recorded with U7 in docs/16 is 375×667, 390×844, 768×1024, 1280×720, 1366×768, 1440×900 and 1920×1080. 768×1024 is no longer byte-identical: it takes the `tab` layout at the owner's request (§15). Not yet run. Not recorded as passed.)* *(2026-11-15: **OWNER APPROVED — 2026-11-15.** The owner completed and approved the full seven-size matrix above, together with the current ship, waterline and chain connection, the anchor descent, landing and slack chain, the illustrated sea floor and the redesigned Bonus Chest. The mobile sizes are approved as they now are, not as byte-identical to pre-U7 captures: they changed by owner decision (Dual Bet panel, `tab` at 768×1024, D1). Gate 8 is satisfied for Sprint 4.)*

Money-path verification is test-driven, not manual-only: the U2 replay suite is the gate that the extracted math is the same math (§21).

## 20. Risks and Non-Goals

Risks:

1. **Settlement drift during extraction** — the top risk: money math moving out of the component. Mitigation: the Commit 8 replay-test pattern generalizes *before* the move (U2 lands store + tests in one commit; golden ledger values pinned from event sequences covering every settlement path: loss, cashout, jackpot auto-cash, chest delta, spectator, remount-mid-round). Float results must be bit-identical — the pins assert exact values including `toFixed` artifacts. *(2026-11-13, M1-D8: this applied to the U2 extraction and still applies to the debit and balance arithmetic. For payouts it is superseded by rounding down. The pins whose expected values change are listed in §23.3, and pinning exact values remains the rule.)*
2. **Markup drift during componentization.** Mitigation: U3's DOM characterization pins (asserting rendered text and structure) run before any markup moves; class strings are moved byte-identically (mobile path) and spot-checked by the R1-style literal comparison where practical; U6's manual pass includes screenshot comparison at mobile width.
3. **Two writers mid-migration** (the standing Sprint 2/3 risk): each commit moves a state's ownership *completely* — store becomes the writer and the component mirror is deleted in the same commit; never both.
4. **New devDependencies** (jsdom, @testing-library/react, @testing-library/user-event) need explicit approval — flagged here so U3 isn't blocked silently (vitest/E1 precedent). React 19 requires current Testing Library versions; pinned at install.
5. **Session factory vs. module singleton**: the test seam (§8) must not change production initialization order (module-scope construction is what makes remount-survival work). Mitigation: U1's tests cover construction order and remount semantics explicitly.
6. **Scope creep** — the standing risk, sharpest in a UI sprint: "while we're in there" visual polish, animation changes, new UX states. V5 is the only sanctioned visual change; everything else is byte-identical markup. Redesign is a future approved task.

Non-goals (explicitly out of scope):

- **No integer-minor-units money migration.** It remains a separate roadmapped task — but this sprint reduces it to a one-file change (§10). Recommendation, for owner decision at close-out: schedule it as the task immediately after Sprint 4, while the wallet store is fresh. *(2026-11-13, M1-D5: the migration is designated **M2** and stays deferred — its own architecture review, test plan, approval gate and commit sequence; not part of M1, not started. §23.10.)*
- No localization implementation — only the §14 seam.
- No visual redesign, theme change, animation, or sound (audio is Phase 7).
- No auto-cashout, tournaments, achievements, or social features (recorded shapes only, §18).
- No server, transport, or protocol work (Phase 8); no state-management library (§9 records the adoption trigger).
- No engine or renderer change of any kind (§19 gate 4).
- No accessibility overhaul — semantic buttons and disabled states move as-is; a dedicated a11y pass is a recorded future task.

## 21. Testing Strategy

The suite enters at 83 green (node-env vitest) and grows in four tiers:

1. **Wallet ledger tests (U2, node env — no new deps).** The settlement store driven headless by scripted engine event sequences (reusing the `SequenceRng`/scripted-authority harness): golden balance ledgers for every settlement path; the Commit 8 basis-lock replay generalized; remount-mid-round (unsubscribe never happens — assert by construction: one session-scope subscription, events during a simulated detach still applied); float pins exact.
2. **Pure-logic tests (U1, U4, U5 — node env).** Store primitive semantics (set/subscribe/bailout); notification store with fake timers (flash lifetime, supersede, dev-only rejection gating); `actionStateFor` — the full matrix (phase × participating × hasCashed × canBet), exhaustive, replacing eyeballed JSX branches with proven logic; bet-input store (halve floor at 1, double cap at balance, quick-set, V4 sanitation cases).
3. **DOM characterization + component tests (U3 onward, jsdom — needs approval).** U3 pins the *current* monolith's rendered output per state (a scripted session drives ticks; assertions on roles/text, deliberately not on class names, so verbatim moves keep them green); U6 keeps the same pins running against `GameScreen`, proving the decomposition rendered the same UI; smoke tests per extracted component with store fixtures.
4. **What is deliberately not automated:** visual identity (screenshots, §19.8), canvas output (covered by the frozen renderer's own guarantees), and responsive layout (jsdom has no layout engine — U7 is a manual gate by design).

Engine suite: untouched and green throughout — it is the platform's regression net while the UI moves above it.

## 22. Definition of Done

Sprint 4 is done when all of the following hold:

1. `src/ui/` matches §16 exactly; `AbyssAnchor.tsx` is deleted; the route mounts `GameScreen`.
2. All five §7 deltas landed, each in its named commit; no other behavior change occurred (pins green throughout).
3. Money math exists in exactly one module (`wallet-store.ts`), bit-identical results proven by the ledger suite; settlement subscriptions are session-scoped (wallet survives remount, misses no event). *(2026-11-13, M1-D8: "bit-identical" is superseded for payouts. The settlement-layer payout function of §23.13 may live in its own module beside `wallet-store.ts`, and remains the only place payouts are computed.)*
4. Every displayed value has one owner per §9's writer table; zero state+ref mirrors remain; no component computes money.
5. Notifications (flashes + dev rejection surface) run through the notification store; no `setTimeout` in any component.
6. All user-facing strings live in `strings.ts`; no string literals in component bodies.
7. Mobile layout is byte-identical (screenshot-verified); the desktop layout is owner-approved per §19.8.
8. Every commit passed the §19 gate: tsc clean, lint at/below baseline, all tests green, engine/renderer diff empty, prod build + SSR smoke, manual gameplay pass.
9. Test suite covers §21 tiers 1–3; final count and baseline recorded in PROGRESS.
10. Docs current: 04 (Phase 6 status), 14/15/16 tracking, `src/ui/README.md`, this document corrected wherever reality disagreed (corrections in the conflicting commit, per the standing rule).
11. Sprint 4 close-out + retrospective recorded in PROGRESS (Sprint 2/3 pattern), including the recommendation decision on the minor-units follow-on task (§20).

## 23. Money Integrity — M1 (policy approved 2026-11-13; implemented in the working tree 2026-11-14, uncommitted; NOT closed)

**Current implementation status (2026-11-14). This block supersedes every "not implemented", "not authorized" and "proposed" status line below *as a statement about the code*. Those lines are kept unchanged as the record of the plan at the time they were written.**

| Item | Status in the working tree (uncommitted, unpushed) | Authority |
|---|---|---|
| E-X2 — engine valid-stake enforcement | **Implemented. Approved by the owner 2026-11-14** as implemented: `src/shared/stake.ts`, `src/shared/stake.test.ts`, `src/engine/state-machine.ts`, `src/engine/state-machine.test.ts`, and the UI re-export `src/ui/store/stake.ts`. The freeze exception is not expanded (docs/06 §13.1) | Owner, 2026-11-14 |
| M1-1 — action state and session submit edge | Implemented: `isPlaceableStake` (valid stake ∧ affordable) shared by `canPlaceBet` and `session.submit` | Bundled into the single integration commit (S1) |
| V2 — payout rounding down (§23.16) | Implemented: `src/ui/store/payout.ts`, one BigInt function for cashout, jackpot, chest total and `potentialWin` | Q8 approved 2026-11-14, within its demonstrated domain |
| W1–W9 wallet integrity (§23.17) | Implemented in `src/ui/store/wallet-store.ts`, W3 included | Q12 approved 2026-11-14 |
| W10 / R2 — faulted participation as an unresolved claim | Implemented (2026-11-14): no refund, no forfeiture, no later credit; an append-only, session-lifetime claim list with round, stake, fault and amount already credited; a faulted participation is never recorded as a loss (§23.17) | Q9c, option R2, owner 2026-11-14 |
| B-R — exact integer-cent ledger (Q1/Q11) | **Deferred to M2** (owner, 2026-11-14, roadmap return). Not implemented. The §23.20 design is kept as M2 input. *(Earlier the same day: approved in principle, design pending.)* | Owner, 2026-11-14 |
| W11 — exact-cent credit envelope (§23.21) | **Implemented (2026-11-14), uncommitted**: every credit decided in exact integer cents below 2^44 units; an unrepresentable valid win becomes an R2 claim with rule `W11` and its exact `unpaidCents` | Owner, final M1 authorization, 2026-11-14 |
| Integration commit | Strategy **S1** approved (one atomic commit). **No Git operation authorized**: nothing staged, committed or pushed *(Reconciliation 2026-11-14: S1 landed as `e37b81c`. The held-back M1 test suites landed separately as `e8b1b62`, at the owner's direction. Both are on `origin/develop`.)* | Owner, 2026-11-14 |
| M1 closure | **Not closed.** Implementation complete; awaiting the owner's browser QA and the S1 commit authorization. *(2026-11-14: the owner reports 10 consolidated browser checks passed. That is distinct from the 19-item detailed checklist in docs/16, and the full browser QA gate stays pending. S1 is to be a local commit with no push, still awaiting a separate authorization.)* *(2026-11-14, later: the owner confirms **all 19/19 detailed browser QA checks passed** (U4b 6/6, U5 7/7, M1 6/6). The browser QA gate is closed. M1 closes with the S1 commit, which awaits the owner's separate authorization: local only, no push.)* *(Reconciliation 2026-11-14: the owner then **deferred M1** to the final stabilization phase. This is a scheduling exception: M1 is **not** closed, validated or formally accepted, and all M1 work is preserved. The S1 commit landing does not close it. **M2** (integer minor units, §23.10) and **B-R** (the integer-cent ledger, §23.20, now inside M2) are tracked separately and are not started. Dual Bet amended the wallet rules per slot (§23.17), but that does not change M1's status.)* | Owner, 2026-11-14 (QA; deferral) |

Validation of the working tree (2026-11-14, after W11): `tsc --noEmit` clean; 427/427 tests green across 33 files; production build passes; targeted ESLint with end-of-line neutralized: changed files clean, only the 6 pre-existing `AbyssAnchor.tsx` JSX-formatting errors; `git diff --check` clean; the frozen directories differ only by the four E-X2 files; `src/routeTree.gen.ts` byte-identical to HEAD.

Recorded by stage **M1-0** (documentation only) under TASK 007. This section changes no code. It separates three kinds of statement, and they must not be confused:

- **Approved** — the owner's decisions M1-D1 to M1-D16 (§23.1). Binding policy.
- **Proposed** — the predicate's implementation, the payout-rounding implementation, the stage plan, file scopes and tests (§23.4–§23.8, §23.13, §23.14; refined by §23.16–§23.19 on 2026-11-13). Each stage needs its own owner approval before any code changes.
- **Open** — questions the owner has not decided (§23.9).

M1 is a **sanctioned behavior change**, not a behavior-preserving refactor: stakes that are accepted today will be rejected, and (M1-D8) wins that are rounded to the nearest cent today will be rounded down. It is therefore outside §7's "everything else moves verbatim" rule, outside V4's "no honest-path change" claim and, for payouts, outside the U2 bit-identical money-math rule (§23.3), by explicit owner decision. The vulnerabilities V1 and V2 in §23.2 are **not fixed** by this section.

### 23.1 Approved decisions (owner, 2026-11-13)

- **M1-D1 — Monetary precision.** A bet amount has at most two decimal places of *monetary value*: it must be representable in increments of 0.01. Sub-cent amounts (`0.001`, `0.004`, `0.005`, `0.009`, and any amount with a fractional cent such as `1.005`) are rejected. An invalid stake is never silently rounded into a valid one. The constraint is on the value, not on the text: `1.000` denotes exactly 1.00 and is valid (§23.4).
- **M1-D2 — Minimum bet.** The minimum accepted bet is 0.01. Zero and negative bets are invalid. The maximum stays what it is today — the available balance and the existing game rules; no new arbitrary maximum is introduced without separate approval (see Q1 for the one technical bound that needs a decision).
- **M1-D3 — Invalid bet handling.** Invalid amounts are rejected. PLACE BET is disabled for them, and the submit path independently enforces the same rule. The UI does not normalize a positive invalid amount into an accepted bet. The editable input state and the accepted monetary stake stay distinct. U5's input sanitation (cleared or non-finite → 0) may remain, provided 0 cannot be submitted.
- **M1-D4 — Engine defense in depth.** A separate engine freeze exception, **E-X2**, is to be planned for engine-side finite-value and valid-stake enforcement. Planning is approved; implementation is not. The owner approves the final E-X2 scope before any engine change (docs/06 §13.1).
- **M1-D5 — Integer minor units deferred.** Integer minor-unit accounting is a separate future task, **M2**, with its own architecture review, test plan, approval gate and commit sequence. M1 closes the zero-debit / sub-cent vulnerability first, without a money-representation migration. M2 is not started and is not part of M1 (§23.10).
- **M1-D6 — U5 reconciliation.** The relevant parts of U5 decisions D7 and D11 are formally superseded, with dated notes and the original text preserved (§23.3).

Decisions after the security boundary review (owner, 2026-11-13). The review found a second vulnerability, V2, that M1 as first planned left open (§23.2):

- **M1-D7 — V2 is in M1.** The minimum-stake payout-rounding edge (V2) is a required financial-integrity fix inside M1. It is not a limitation deferred to M2. M1 cannot be marked closed while V2 is open.
- **M1-D8 — Payout rounding policy.** Every nonnegative monetary payout is rounded **down** to the nearest cent. It is never rounded to the nearest cent and never up. The implementation must be numerically justified and must not lose a cent to floating-point error. `Math.floor(stake * multiplier * 100)` is **not** assumed safe: it is shown to fail in §23.13. For payouts, this supersedes the U2 rule that settlement results stay bit-identical to the original float arithmetic (§23.3).
- **M1-D9 — Commit plan C3 (provisional), with wallet finiteness protection kept in M1.** The review's sequence C3 is adopted as the provisional implementation sequence (§23.14). The review proposed moving the wallet guards to a later hardening task. That part is **not** adopted: the essential wallet-side protection against non-finite debits, credits, payouts and balances stays inside M1. Each commit still needs its own approval.
- **M1-D10 — Ceilings stay unresolved.** No technical stake, balance or payout ceiling is adopted. Each needs a supporting mathematical analysis and the owner's approval. Q1 stays open (§23.11).
- **M1-D11 — Known limitations recorded, not fixed.** The following are recorded as known limitations (§23.15):
  - public event emission;
  - snapshot restoration;
  - live-reference aliasing;
  - future network trust boundaries.

  The wallet's guards are local consistency checks. They do **not** authenticate engine events, and no document or test may claim that they do.
- **M1-D12 — E-X2 remains planning only.** E-X2 stays approved for planning only. No engine implementation is authorized (docs/06 §13.1).

Decisions recorded in the final financial integrity reconciliation (owner direction, 2026-11-13). They refine M1-D8 and M1-D9 and do not withdraw any earlier decision. Where they supersede part of an earlier plan, the earlier text stays in place with a dated pointer:

- **M1-D13 — Payout calculation policy.**
  - Valid monetary stakes are whole cents (M1-D1, unchanged).
  - A payout is calculated from the *accepted* stake and the *authoritative settlement multiplier* — never from the displayed multiplier or a recomputed product.
  - Every nonnegative payout is rounded **down** to a whole cent (M1-D8, unchanged).
  - An invalid stake is never silently rounded (M1-D1, M1-D3, unchanged).
  - No payout may exceed its mathematically intended amount.
  - JavaScript's binary floating-point product is **not** an exact decimal monetary result and may not be used as one.
  - The engine's multiplier generation and determinism do not change.
  - The precise arithmetic is *proposed*, and the parts that cannot be finalized yet are marked open (§23.16).
- **M1-D14 — Invalid settlement multipliers.**
  - A `NaN`, `+Infinity`, `-Infinity` or negative multiplier never produces a wallet credit.
  - An invalid multiplier is never silently converted to zero.
  - The wallet balance stays finite and nonnegative.
  - An invalid settlement event does not partially mutate financial state.
  - Valid engine behavior and deterministic replay are preserved.
  - The treatment of zero follows from the analysis in §23.17: zero is not a legitimate settlement multiplier on any existing path.
- **M1-D15 — Wallet-side integrity is part of M1.** This supersedes the deferral of these items to a P1 hardening task in M1-D9 and §23.14. M1 requires:
  - invalid stakes rejected before any wallet debit;
  - no sub-cent debit;
  - no duplicate debit for one accepted participation;
  - no duplicate credit for one settlement;
  - no `NaN` or `Infinity` balance mutation;
  - no negative balance caused by an invalid financial event;
  - no partially applied invalid settlement.

  These are local integrity properties. They do not authenticate events (M1-D11 stands). Analysis and proposed rules are in §23.17.
- **M1-D16 — No unsafe intermediate state is published.** No commit that still contains a known M1 financial-integrity vulnerability may be pushed to `origin/develop` or presented as production-ready.
  - Local implementation commits are permitted.
  - E-X2 keeps its own implementation approval gate (M1-D12).
  - Automated tests must pass before any vulnerability is declared closed.
  - This rejects option (b) of Q10. The revised plan is C4, in §23.18.
- **M1-D10 reaffirmed (2026-11-13).** Q1 stays open. No product-level maximum bet is introduced. BigInt payout arithmetic does not make the `number` wallet safe for unlimited values (§23.19).

### 23.2 Confirmed root cause and current risk (verified against `8363b9f`)

No layer checks that a stake is a whole number of cents, and the debit and the payout round independently:

1. The bet input keeps any finite value ≥ 0 as typed (`src/ui/store/bet-input-store.ts:33-37`; D11).
2. The button and the submit edge ask only `isAffordable`: finite and `0 < amount ≤ balance` (`src/ui/store/wallet-store.ts:105-106`; `src/ui/components/action-state.ts:56-67`; `src/ui/session.ts:143-146`).
3. The engine asks only `amount > 0` (`src/engine/state-machine.ts:222`) and emits `betPlaced` with the amount unchanged (`:229`).
4. The wallet debits `+(balance − amount).toFixed(2)` (`wallet-store.ts:143-153`) and later credits `+(roundBet × m).toFixed(2)` (`:165`, `:186`, `:217-219`).

Computed with the wallet's own expressions (balance 1000):

| Stake | Balance after debit | Actual debit | Win at 2× | Win at 50× | Win at 25,000× |
|---|---|---|---|---|---|
| `0.001` | 1000 | **0** | 0 | 0.05 | 25 |
| `0.004` | 1000 | **0** | 0.01 | 0.20 | 100 |
| `0.005` | 1000 | **0** | 0.01 | 0.25 | 125 |
| `0.009` | 999.99 | 0.01 (over-debit) | 0.02 | 0.45 | 225 |
| `1.005` | 999 | 1.00 (under-debit) | 2.01 | 50.25 | 25,125 |

A stake of `0.005` or less costs nothing and pays real cents: a risk-free bet every round. It is reachable through the real UI — the field is a plain `type="number"` input with no `step` (`src/components/AbyssAnchor.tsx:236-242`), and the existing DOM test places a `0.123` bet (`src/ui/screen.bet-input.test.tsx:104-114`). Related gaps: the engine accepts `+Infinity` (blocked today only by `isAffordable`), and the wallet applies any `betPlaced` payload without checking it. All of this remains true until the stages in §23.8 land.

The security boundary review (2026-11-13) numbers its findings V1–V7. These IDs are local to §23 and unrelated to the sanctioned deltas V1–V5 in §7. The vulnerability above is **V1**. V3–V7 are listed in §23.15.

**V2 — minimum-stake payout rounding (security boundary review, 2026-11-13; confirmed).** Every win is rounded to the *nearest* cent of the float product, `+(roundBet × m).toFixed(2)` (`wallet-store.ts:165`, `:186`, `:217-218`). The debit of a valid stake is exact, so whenever the dropped fraction of a cent is about one half or more, the player gains. At the minimum stake that gain can approach half a cent, which is half of the stake itself:

| Stake × multiplier | Exact decimal product | Credited today | Rounded down (M1-D8) |
|---|---|---|---|
| 0.01 × 1.5 | 0.015 | 0.01 — the double nearest 0.015 lies just below it | 0.01 |
| 0.01 × 1.5000000001 | 0.015000000001 | **0.02** | 0.01 |
| 0.01 × 1.5014 | 0.015014 | **0.02** | 0.01 |
| 0.01 × 2.4999 | 0.024999 | 0.02 | 0.02 |
| 33.33 × 2.005 | 66.82665 | **66.83** | 66.82 |

A 0.01 stake cashed out just above 1.5× and anywhere below 2.5× is paid 0.02, a 2× return on the stake. The review measured the return per unit staked over 20,000 rounds, cashing out at a fixed target:

| Stake | Target | Return per unit staked |
|---|---|---|
| 0.01 | 1.5× | **1.2588** |
| 0.01 | 2.5× | 1.1445 |
| 0.02 | 1.25× | 1.1354 |
| 1 | 1.5× | 0.9571 |
| 10 | 1.5× | 0.9550 |

Every stake in that table is valid under M1-D1/D2, so the stake check does not touch V2. It stays reachable through the normal UI after E-X2 + M1-1. I1–I8 all hold while it is exploited, because I2 constrains only the debit. The original §23.6 text listed payout rounding only as a half-cent-tie question for M2. That understated it; it is corrected there. Raising the minimum stake would remove the edge only above about 0.125, which contradicts M1-D2, so that option was not taken (M1-D7, M1-D8).

### 23.3 Reconciliation of U5 decisions D7 and D11 (M1-D6)

The U5 record in §17 is kept as written. These notes supersede parts of it from 2026-11-13; until M1-1 lands, the code still behaves as U5 recorded.

- **D7 — partly superseded.** *Still valid:* one affordability predicate, `isAffordable`, shared by `wallet.canAfford` and the action state; non-finite → false. *Superseded:* affordability is no longer sufficient for a bet to be offered or submitted. The enable state and the submit edge must both require **valid stake ∧ affordable** (§23.4, §23.5). `isAffordable` itself is proposed to stay unchanged, so its U5 equivalence pins (`src/ui/store/wallet-store.test.ts:618-657`) remain true.
- **D11 — superseded for accepted monetary bets.** *Superseded:* "no new decimal rounding or precision rule" no longer holds for a stake that is placed — M1-D1 is a new precision rule, enforced by rejection. *Still valid:* no new *rounding* (an invalid amount is rejected, never rounded), and the bet input may keep holding the typed value, including a sub-cent one, as an editable state that cannot be submitted.
- **V4 (§7)** — its "no honest-path change" rationale described U5. M1 adds a deliberate change on top (sub-cent stakes rejected); V4's sanitation rules are otherwise unchanged.
- **U2 money-math compatibility rule — superseded for payouts (M1-D8, 2026-11-13).** The U2 rule says money math moves verbatim and float results stay bit-identical, including `toFixed` artifacts. It is recorded in §1 goal 6, §10, §20 risk 1, §22 item 3, docs/06 §3 and the U2 entry in docs/15. Those texts are kept as written, each with a dated pointer here. Until the settlement stage of §23.14 lands, the code still behaves as U2 recorded.
  - *Still valid:*
    - the debit expression `+(balance − amount).toFixed(2)`;
    - the balance update `+(balance ± x).toFixed(2)`, exact below 2^44 (I4);
    - the exclusivity and idempotency guards;
    - the bet-basis lock;
    - money math in one module;
    - pinning exact values in tests.
  - *Superseded:*
    - the payout expression `+(roundBet × m).toFixed(2)`, at all three call sites (`wallet-store.ts:165`, `:186`, `:217-218`);
    - the chest delta's two products (`:217-219`), which become the difference of two rounded-down payouts;
    - the display-only `potentialWin` (`src/components/AbyssAnchor.tsx:105`), which must use the same payout function so the UI never promises more than the wallet credits;
    - every test expectation that encodes round-to-nearest (next table).
  - *Not changed by M1:* float accounting itself. The integer ledger stays M2 (§23.10).

Other records that conflict with M1-D1 to M1-D5 and must be corrected in the stage that changes the behavior (none is changed by M1-0):

| Where | Conflict | Proposed stage |
|---|---|---|
| `src/ui/screen.bet-input.test.tsx:104-114` | Pins that a typed `0.123` is placed and debited (D11) | M1-1: rewritten — field keeps `0.123`, PLACE BET disabled, nothing debited |
| `src/ui/store/bet-input-store.ts:16` (header comment), `bet-input-store.test.ts:124-131` | "No new rounding or precision rule (D11)" | M1-1: comment and titles updated; assertions stay (the input still holds the typed value) |
| `src/ui/session.ts:98-103`, `src/ui/components/action-state.ts:15-18` (comments) | Describe affordability as the only bet check at submit / on the button | M1-1 |
| `src/engine/state-machine.ts:216-218` (comment), docs/06 §3 "Bet-vs-balance check" | Engine validates only round state | E-X2 (docs/06 §3 already annotated) |
| §6 "The affordability check … invoked by the session's `submit` path", §8 `submit`, §13.3 "As landed in U5" | Name affordability as the one validation at the submit edge | Still accurate for today's code; corrected by M1-1 when the stake check lands |
| §12 "today's UI disables invalid actions before submit, so a user-visible rejection is a bug indicator" | Stays true only if the button and submit share one predicate | Preserved by §23.5 |
| `src/ui/store/wallet-store.ts:5-8` and `:47` (comments: "bit-identical by construction", "rounded with toFixed(2) at every mutation") | Describe the superseded U2 payout rule | Settlement commit (§23.14 commit 2): comments updated |
| `src/ui/store/wallet-store.test.ts:92-97` (`33.33 × 2.005` → 66.83, balance 1033.5) and the multi-round ledger at `:270-275` (`cashOut(2.005)` → +66.83, final balance 8798.51) | Pin round-to-nearest. Rounding down gives 66.82, so the balances become 1033.49 and 8798.50 | Settlement commit: sanctioned rewrite of these expected values. The test inputs stay the same |
| `src/ui/session.test.ts:254-255`, `:305`, `:439`, `:519`; `src/ui/screen.remount.test.tsx:102-103`, `:171-172` | Derive the expected win with the oracle `+(10 * m).toFixed(2)` (or `5 * m`) on an unrounded cashout multiplier | Settlement commit: the oracle is replaced by an independent rounded-down oracle (§23.13). Whether each case's value changes depends on its scripted `m`; the oracle changes either way |
| `src/ui/screen.characterization.test.tsx:227-231` (`potential = +(10 * m).toFixed(2)`) and `:257` (literal `CASH OUT · 10.43`) | U3 characterization pin of the potential-win and CASH OUT labels, computed with round-to-nearest | Settlement commit: sanctioned characterization change, recorded like the U4b and U5 remount pins. `10.43` stays only if rounding `10 × m` down at that tick also gives 10.43; this is checked when the test is run, not assumed |

Unaffected by the payout change: pins on integer stakes with two-decimal multipliers (for example 7490, 1990, 2990 and the jackpot/chest ledgers), whose products are exact whole cents, and the `0.1 × 1.15` → 0.11 and `0.3`-chest pins (`wallet-store.test.ts:79-90`, `:168-176`). Rounding down gives the same values there.

No conflict found in: the 20 U3 characterization pins (all bets are whole cents), `action-state.test.ts` (every finite bet in its cross product is a whole-cent value, `:60-77`), the wallet ledger suite (stakes `0.1`, `0.3`, `33.33`, integers), and the engine pin `state-machine.test.ts:219-231`.

### 23.4 The bet-validity contract

**Definition (approved policy, M1-D1/D2).** A number `a` is a *valid stake* iff it is finite and is the canonical double of `k / 100` for some integer `k ≥ 1` — that is, `a` is the IEEE-754 double nearest to a positive whole number of cents.

**Proposed implementation.**

```ts
isValidStake(a) = Number.isFinite(a) && a >= MIN_STAKE /* 0.01 */ && +a.toFixed(2) === a
                  /* plus the technical ceiling, if Q1 adopts one */
```

Why this is exact and needs no tolerance: `Number.prototype.toFixed(2)` is specified on the *exact* value of the double — it picks the integer `n` for which `n / 100` is closest to it (the larger `n` on a tie) — and unary `+` parses that decimal to the nearest double. The round trip therefore returns `a` iff `a` is already the nearest double to a two-decimal value. It is also the wallet's own rounding idiom, so the rule reads: *a valid stake is a fixed point of the wallet's rounding*. `1.000`, `0.010` and `1e-2` are valid because validity looks at the number, never the text.

Alternatives considered and rejected:

- `(a * 100) % 1 === 0` — false rejections: `0.07 × 100 = 7.000000000000001`; likewise `0.29`, `0.57`, `1.15`, `4.35`.
- `Math.abs(a·100 − Math.round(a·100)) < ε` — an epsilon has no safe value: it accepts doubles that are not cent values (`0.1 + 0.2 = 0.30000000000000004` for any ε ≥ ~1e-14), and the gap between adjacent doubles grows with magnitude, so any fixed ε is too loose for small values or too tight for large ones.
- `Math.round(a · 100) / 100 === a` (integer-cent conversion) — equivalent to the proposal for `k < 2^51` (≈ 22.5 trillion): there `a · 100` is within 0.5 of `k`, and `k / 100` is correctly rounded. Above that it falsely rejects valid cent values (measured: about 7% of sampled `k` in `[2^51, 2^52)`). Suitable as M2's conversion step below that bound; not chosen as the validity test.

Consequences of "canonical double":

- A value produced by float arithmetic that merely *looks* like cents is rejected, not rounded: `0.1 + 0.2` is invalid. This is M1-D3 applied to representation. Every stake producer in the UI already yields canonical values: the field's `+raw` parse, the integer `QUICK_BETS`, and `halve`/`double`, which end in `+(…).toFixed(2)` or a balance that is itself `+(…).toFixed(2)` (`bet-input-store.ts:61-62`).
- Spot-check run for M1-0 (2026-11-13, ad-hoc script, not part of the test suite): every `k / 100` for `k ≤ 5,000,000` is accepted; the doubles one step above and below each `k / 100` for `k ≤ 2,000,000` are rejected; `halve` and `double` of every valid stake `k ≤ 2,000,000` are valid.
- **Extremely large finite values.** The predicate decides M1-D1 only where every cent has its own double: below 2^46 currency units (70,368,744,177,664). Above that, adjacent cents collapse onto one double (`9444132641444916 / 100 === 9444132641444917 / 100`), so almost every double passes the round trip; from `1e21` on, `toFixed` returns exponent notation and the round trip is trivially true. In the UI such stakes are unaffordable and never submitted, but the engine has no balance. Whether the predicate carries an explicit *technical* ceiling is question Q1 — **open**; the numeric analysis is in §23.11. M1-D2 forbids a new maximum without approval.

**Input-parser implications.** The parser stays `+raw` with U5's sanitation (`parseBetInput`). No text-level decimal count is added: it would wrongly reject `1.000`, and it could not protect programmatic writes. The field may *display* a sub-cent value the player typed; that is an editable, non-submittable state.

### 23.5 How the checks compose (proposed)

Four questions, four owners, in this order:

| # | Question | Owner | Invalid → |
|---|---|---|---|
| 1 | Is the input a finite number ≥ 0? (sanitation, U5 D1–D3) | bet-input store | written as 0 — sanitation of the *editable* value, never of a stake |
| 2 | Is the amount a valid stake? (M1-D1/D2) | one shared predicate, called by the action state, the session submit edge and (E-X2) the engine | button disabled; submit drops the command; engine rejects `invalid-amount` |
| 3 | Can the player afford it? (D7) | wallet (`isAffordable`) | button disabled; submit drops the command |
| 4 | Is the round state right? (phase, not already participating) | engine | `commandRejected` |

- **Rejection, not normalization.** Step 1 normalizes only what U5 already normalized (cleared, non-finite, negative → 0), and 0 fails step 2. A positive invalid amount is never changed by any layer.
- **Button and submit cannot disagree.** `canPlaceBet` and `session.submit` call the *same* composed predicate (valid stake ∧ affordable) with the same inputs; neither re-implements it. A test asserts equality over the full matrix (§23.7). The betting cutoff stays UI-only (D9), as today.
- **Controls.** Typed value: held as typed; submittable only if valid. Quick bets: integers, always valid stakes; affordability decides. Halve: `max(1, +(b/2).toFixed(2))` — always a valid stake ≥ 1 (unchanged U5 arithmetic, including the floor of 1). Double: `min(balance, +(b·2).toFixed(2))` — valid whenever the result is ≥ 0.01; from 0 it stays 0 and is not submittable. No arithmetic in these handlers changes.
- **Which boundary is authoritative.** *Stake validity:* the engine, once E-X2 lands — commands are the future protocol messages, and in Phase 8 the server must not trust the client. *Affordability:* the session submit edge — the engine never sees a balance (docs/06 §3). The UI enable rule mirrors both. The wallet guard (M1-2) is a tripwire, never the enforcement point: a wallet listener cannot undo an acceptance (§23.12, F1).
- **Can an accepted bet debit zero?** Today yes (§23.2). After the stake check, no: a valid stake is ≥ 0.01 and a canonical cent value, the balance is always a canonical cent value, so `+(balance − stake).toFixed(2)` lowers the balance by exactly the stake (within the magnitude bound in §23.6).
- **If the engine accepts a bet the wallet refuses (M1-2 guard).** The wallet ignores the whole `betPlaced`: no debit, `participating` stays false, `roundBet` stays 0, and the existing guards ignore every later settlement for that round (`wallet-store.ts:164`, `:185`, `:214`). Zero in and zero out is **not** consistency: the engine still holds a participant the wallet does not. A valid re-bet in the same round is rejected `already-participating` while PLACE BET is shown enabled, and the chest picker can open for a pick that pays nothing (§23.12, case 3). It recovers at the next `bettingOpened` without a reset, but it violates I8 (§23.6). It must be unreachable in the normal flow, which holds only if the wallet's `betPlaced` rule is never stricter than the engine's acceptance rule.
- **Risk of a partial fix, and ordering.** *Correction (review, 2026-11-13):* the first M1-0 draft said that no ordering of separate stages creates a financially unsafe commit, so atomic landing was not required. That holds for money on the honest UI path only. Each partial state has a defect:
  - *Wallet rule before engine rule:* makes case 3 reachable.
  - *UI rule without engine rule:* leaves zero-debit bets open to non-UI callers (case 8).
  - *Engine rule without UI rule:* breaks I3 and fails an existing test (§23.8).

  Hence §23.8 lands the engine and UI acceptance edges in one commit, and the wallet tripwire after it.

### 23.6 Settlement arithmetic under M1 — what is and is not guaranteed

Current behavior, preserved verbatim by M1: every balance mutation is `+(x).toFixed(2)` — round to the nearest cent of the float result — applied to the debit, the cashout win, the jackpot win and the chest delta (`wallet-store.ts:150`, `:165-167`, `:186-189`, `:217-221`).

*Superseded in part (M1-D7, M1-D8, 2026-11-13).* The sentence above was written before V2 was found. M1 keeps the debit expression and the `+(balance ± x).toFixed(2)` balance update. It **replaces** the payout expression, which is rounded to the nearest cent today, with a payout rounded down to the cent (§23.13). The chest delta becomes the difference between two rounded-down payouts.

Finiteness and range today:

- Cashout multiplier: the live multiplier `exp(0.085·t)` plus at most 0.4 boost (`src/engine/domain/multiplier.ts:10-14`, `src/engine/simulation.ts:126-136`), strictly below the crash point (`LocalRoundAuthority` caps that at 200, `src/engine/domain/outcomes.ts:22-30`). The binding limit is physical, not the crash cap: the dive reaches the sea floor by tick 1290 (21.5 s) at the latest, so a cashout multiplier is always below ≈ 6.61 (§23.11). That limit comes from tuning and is not a named, enforced cap. The cashout multiplier is **not** rounded to two decimals.
- Jackpot ≤ 500, chest ≤ 50, both rounded to two decimals; `finalMultiplier` ≤ 25,000 (`outcomes.ts:34-55`, `src/engine/state-machine.ts:267`). These are limits of `LocalRoundAuthority`'s distributions, not engine invariants.
- So with a finite stake and the local authority every payout is finite, and the largest is stake × 25,000. Overflow to `Infinity` needs a stake above ≈ 7.19 × 10^303. An injected `RoundAuthority` is checked for neither range nor finiteness, so under it a non-finite payout is possible for **any** stake. The wallet does not check that an event's multiplier is finite (Q3, §23.12 L4).

Invariants M1 can guarantee on the float architecture (to be proven by the §23.7 tests):

- **I1** An accepted stake is a valid stake: finite, ≥ 0.01, whole cents.
- **I2** The debit equals the stake exactly; an accepted bet never debits zero.
- **I3** PLACE BET is enabled iff the submit edge would forward the same amount (same inputs).
- **I4** After every mutation the balance is a finite canonical cent value, for magnitudes below 2^44 (≈ 1.7 × 10^13), where three accumulated half-steps of float error stay under half a cent. This conditions the balance and every operand, not just the stake: wins accumulate, so no per-bet stake ceiling can guarantee it (§23.11).
- **I5** One participation: at most one debit and one settlement path (existing exclusivity, unchanged).
- **I6** An invalid `betPlaced` payload changes nothing in the wallet (M1-2).
- **I7** Engine determinism and replay are unchanged (docs/06 §13.1).
- **I8** (the M1 consistency invariant, §23.12) In the normal authoritative session flow, no engine-accepted participation exists without a corresponding valid, correctly debited wallet stake — and no wallet participation exists without an engine-accepted one.
- **I9** (settlement invariant; added 2026-11-13, M1-D8 — §23.13) For every valid nonnegative stake and finite nonnegative multiplier, the credited payout is finite, nonnegative, representable in cents, and does not exceed the mathematically intended stake-times-multiplier amount. It holds for each settlement path: cashout, jackpot auto-cash, and the chest, where it is checked on the participation's total payout. Its verification limits in JavaScript are stated in §23.13.
- **I10** (finite wallet; added 2026-11-13, M1-D9 — §23.14) The wallet never applies a debit, credit or payout that is not finite, and never writes a balance that is not finite. Such an event changes no balance. This is a local fail-safe. It does not authenticate the event (M1-D11).
  *Extended (M1-D14, M1-D15, 2026-11-13):* it also applies to a negative or zero settlement multiplier, a negative chest delta, and a balance that would become negative (§23.17, W3, W6, W7).
- **I11** (atomic settlement; added 2026-11-13, M1-D14) An event the wallet refuses changes no financial field:
  - balance, `roundBet`, `lastWin`, history and the recorded jackpot payout are all left as they were;
  - the event is not recorded as a zero credit.

  An event the wallet accepts is applied in one snapshot write. The only state a refusal may record is the non-financial fault marker of §23.17, which is an open owner choice (Q9).
- **I12** (wallet idempotency; added 2026-11-13, M1-D15) For one participation, identified by its `roundId` (§23.17):
  - at most one debit;
  - at most one credit per settlement path;
  - a total credit that never exceeds the rounded-down payout of its final authoritative multiplier.

  Repeating any event, including the reset events `bettingOpened` and `diveStarted`, cannot violate this. I12 is idempotency, not authenticity: a forged event sequence for a *new* `roundId` is outside it (M1-D11, §23.15 V4).

Not guaranteed by M1 — these need M2:

- **Exact payout rounding.** A win is the float product rounded to the nearest cent. When the exact decimal product is a half-cent tie, the binary value decides the direction (`+(1.005).toFixed(2)` is 1, not 1.01). A defined rounding policy needs integer arithmetic.
  *Superseded (M1-D7, M1-D8, 2026-11-13).* This item described today's code and treated the issue as a tie-break detail. V2 shows that it gives the player a systematic edge, not just tie-break noise (§23.2). The policy is now defined inside M1: round down to the cent, using exact integer arithmetic on the decimal values (§23.13). What stays for M2 is the integer ledger: balances held as integer cents rather than float values.
- **Exactness at any magnitude**, an integer ledger, and an exact representation of multipliers (the cashout multiplier is an unrounded float).
- M1 does **not** eliminate floating-point accounting risk. It removes the specific class in which the stake itself is not a cent value.

### 23.7 Required test matrix (designed here; not implemented)

Six things are tested separately and must not be conflated:

1. **Valid stakes** — accepted by every layer.
2. **Invalid stakes** — rejected by every layer, never rounded.
3. **Editable but not submittable input states** — what the bet input may hold while the button is disabled.
4. **Engine command payloads** — `placeBet` submitted to the engine directly, bypassing the UI (E-X2).
5. **Engine event payloads** — `betPlaced` (and settlement events) delivered to the wallet directly, bypassing the engine (M1-2).
6. **Monetary settlement results** — balances, wins and history after full rounds.

Value matrix (balance 1000 unless stated):

| Value | Class | Bet input holds | PLACE BET | `session.submit` | Engine `placeBet` (E-X2) | Wallet on `betPlaced` (M1-2) |
|---|---|---|---|---|---|---|
| `0`, `-0` | invalid | 0 | disabled | dropped | rejected `invalid-amount` | ignored |
| `-1` | invalid | 0 (clamp) | disabled | dropped | rejected | ignored |
| `0.001`, `0.004`, `0.005`, `0.009` | invalid (sub-cent) | as typed — editable, not submittable | disabled | dropped | rejected | ignored: no debit, not participating |
| `0.01` | valid (minimum) | 0.01 | enabled | forwarded | accepted | debit exactly 0.01 |
| `0.02`, `0.1`, `0.3`, `1`, `5` | valid | as typed | enabled | forwarded | accepted | debit exact |
| `1.005` | invalid (fractional cent) | as typed | disabled | dropped | rejected | ignored |
| `NaN`, `-Infinity` | invalid | 0 | disabled | dropped | rejected (as today) | ignored |
| `Infinity` | invalid | 0 | disabled | dropped | rejected (**new**: accepted today) | ignored |
| balance − 0.01, balance | valid, affordable | as typed | enabled | forwarded | accepted | debit exact; balance 0.01 / 0 |
| balance + 0.01 | valid stake, **not affordable** | as typed | disabled | dropped | accepted — affordability is not an engine question | Q3 |
| `1e9` | valid stake, not affordable | as typed | disabled | dropped | accepted | Q3 |
| `1e21`, `1e300`, `Number.MAX_VALUE` | per Q1 | as typed | disabled (unaffordable) | dropped | per Q1 | per Q1 |
| `0.1 + 0.2`, `0.01` ± one float step, `1000.0000000000001` | invalid (not canonical) | as written | disabled | dropped | rejected | ignored |
| `0.07`, `0.29`, `0.57`, `1.15`, `4.35`, `8.2`, `999.99` | valid — no false rejection | as typed | enabled | forwarded | accepted | debit exact |
| Text `"1.000"`, `"0.010"`, `"1e-2"`, `"007"`, `"  12  "` | valid values 1, 0.01, 0.01, 7, 12 | the number | enabled | forwarded | — | — |

Scenario tests:

- **Predicate properties:** every `k / 100` in a wide range accepted; neighbors one float step away rejected; `halve`/`double`/quick-set outputs classified as in §23.5.
- **Button ⇔ submit:** over phases × participation × countdowns × the value matrix × balances, `actionStateFor(...).enabled` equals "the session forwards the command" (cutoff excluded — UI-only, D9).
- **Zero-debit regression:** for every invalid value, through the DOM, through `session.submit`, and directly into the engine — balance unchanged, no `betPlaced`, not participating; then a full round to jackpot + chest credits nothing.
- **Repeated cycles:** thousands of bet → settle rounds with valid stakes and scripted multipliers; after each, the balance is a canonical cent value and equals an independently computed integer-cent ledger.
- **Every settlement path** with boundary stakes (0.01 and the full balance): manual cashout, crash (loss), jackpot auto-cash, chest pick, chest timeout (E-X1), spectator.
- **Duplicate events:** repeated `betPlaced`, `cashedOut`, `chestPicked` — one debit, one credit (existing guards; the engine rejects the duplicate command).
- **React remount:** a sub-cent typed value survives the remount still disabled; a valid bet placed before a remount settles once.
- **Deterministic replay:** same snapshot + same commands (including rejected invalid stakes) + same RNG ⇒ identical snapshots and event log; a rejected stake consumes no RNG draw.
- **Consistency cases (§23.12):** for each of the cases listed there, assert the engine participant, the wallet's `participating`/`roundBet`/balance, and the action state together. Every case must hold or fail as the table says:
  - non-UI `session.engine.submit` with invalid stakes;
  - foreign and duplicate `betPlaced`;
  - same-tick command orderings (invalid then valid, valid then invalid, a bet on the last betting tick);
  - restore with a participant.
- **I8 property:** across thousands of scripted rounds through `session.submit` only, after every dispatched tick, "the engine has a participant" equals "the wallet is participating", and the debit equals the engine's `betAmount`.
- **U3 characterization pins:** all 20 pass with unchanged assertions in every stage.
  *Superseded in part (M1-D8, 2026-11-13).* This still holds for commit 1 of §23.14. It no longer holds for the settlement commit: the potential-win and CASH OUT pin (`screen.characterization.test.tsx:227-231`, `:257`) computes round-to-nearest. Its rewrite is a sanctioned characterization change (§23.3). Every other pin must pass unchanged.

**V2 and settlement-integrity tests (required by M1-D7 to M1-D9; designed here, not implemented).** Every expected value comes from an independent integer-cent or exact-rational oracle. No test may use the formula under test, or `toFixed`, as its oracle (§23.13):

- **Minimum-stake payouts:** a 0.01 stake at 1.5×, 1.5014× and 2.4999× pays exactly 0.01, 0.01 and 0.02. Each is ≤ the intended amount, and each case runs through all three settlement paths.
- **Floating-point cent boundaries:** the following stakes at 1× and 2× pay the exact stake and twice the stake — not 0.28 or 0.57 for 0.29, and not 1.14 for 1.15:

  | Stakes |
  |---|
  | `0.07`, `0.29`, `0.57`, `1.15`, `4.35`, `8.2`, `999.99` |

  The following must be exact as well:
  - two-decimal multipliers whose doubles lie below the decimal: `1 × 1.15` → 1.15, `1 × 57.29` → 57.29, `100 × 1.15` → 115;
  - `33.33 × 57.29` → 1909.47;
  - an exhaustive grid of stakes `k / 100` × two-decimal multipliers `M / 100`, checked against `⌊k·M / 100⌋` in integers.
- **Every settlement path:**
  - cashout;
  - jackpot auto-cash;
  - chest pick and chest timeout (E-X1). The chest total is rounded down once, and the delta is that total minus the jackpot payout already credited;
  - loss and spectator, which credit nothing.

  Each path runs with boundary stakes, and the sum of credits per participation equals the rounded-down total.
- **NaN and Infinity:** as a `betPlaced` amount, a `cashedOut` multiplier, a `shipImpact` jackpot multiplier and a `chestPicked` final multiplier. In each case:
  - no balance change, and the balance stays finite (I10);
  - the dev diagnostic fires, if diagnostics are approved with commit 2;
  - no later event in the round can pay that participation (§23.14).

  Also covered: a product of finite values that overflows to `Infinity` is not credited. Example: stake `1e305` × 25,000; overflow starts above about 7.19 × 10^303.
- **Large finite amounts:** stakes and multipliers up to and beyond 2^44, 2^46, 2^53 cents and `1e21`. Below the bounds of §23.11 the payout is the exact rounded-down cent value. Above them, behavior is asserted as documented: finite, never above the intended amount in the integer domain. No new ceiling is enforced (M1-D10).
- **Engine–wallet consistency:** every I8 case of §23.12 still holds with the new payout function and guards. The engine's events, state and snapshots are byte-identical before and after the settlement commit, because the engine computes no payouts. The displayed `potentialWin` equals the credit that cashing out on that tick would produce.
- **Deterministic replay:** the same event stream gives the same ledger, run twice and across a fresh session. The engine replay of §23.7 is unchanged.
- **Statistical edge regression (with a fixed RNG):** the return per unit staked is below 1 for stakes 0.01, 0.02 and 0.10 at the cashout targets the review used. This is a regression signal, not a proof.
- **Affected U2/U3 expectations:** the pins listed in §23.3 are rewritten with their old values recorded in the commit message. Every other U2 ledger pin and U3 pin passes unchanged.
- **Non-number payload (E-X2):** `placeBet { amount: "5" }` is rejected `invalid-amount`. Today it passes `> 0`.

**Final-reconciliation tests (required by M1-D13 to M1-D16, 2026-11-13; designed here, not implemented).** These add to the blocks above. Expected values were computed by the probe of §23.16 and must be re-derived in the suite from an independent integer oracle, never from the function under test.

- **Required payout cases** (one function, every path that applies):

  | Stake × authoritative multiplier | Expected payout | Today (`toFixed`) |
  |---|---|---|
  | 0.01 × 1.5000 | 0.01 | 0.01 |
  | 0.01 × 1.5014 | 0.01 | **0.02** |
  | 0.01 × 2.4999 | 0.02 | 0.02 |
  | 0.29 × 1 | 0.29 | 0.29 (`Math.floor` form: 0.28) |
  | 0.29 × 2 | 0.58 | 0.58 (`Math.floor` form: 0.57) |

- **Jackpot settlement:** 0.29 × 100.57 → 29.16 (today 29.17); 33.33 × 57.29 → 1909.47 (today 1909.48); 10 × 499.99 → 4999.90 (the `Math.floor` form gives 4999.89); 0.01 × 50.01 → 0.50.
- **Chest delta settlement:** the delta is total payout minus the *recorded* jackpot payout (W6):
  - stake 0.01, jackpot 50.01, chest 1.01, final 50.51: jackpot 0.50, total 0.50, delta **0.00** (today 0.01);
  - stake 0.01, jackpot 500, chest 50, final 25,000: delta 245.00;
  - stake 0.29, jackpot 57.29, chest 1.15, final 65.88: delta 2.49 (today 2.50).

  The test uses the engine's `finalMultiplier` as emitted, never `jackpot × chest` recomputed in the wallet.
- **Very large finite values** (behavior asserted as documented in §23.19; no ceiling enforced):
  - payouts at and beyond 2^44 and 2^46 units, 2^53 cents and `1e21`;
  - `Number.MAX_VALUE × 1` — the integer payout is finite, but its conversion is not, so the credit is refused (W7);
  - `1e305 × 25,000`.
- **Decimal boundary cases:**
  - the exhaustive `k/100 × M/100` grid against `⌊k·M/100⌋`;
  - the neighbor doubles one step above and below a cent-exact product;
  - multipliers whose double lies below the decimal (`1.15`, `57.29`);
  - exponent-notation strings (`1e+21`, `5e-7`) through the decomposition.
- **Invalid multipliers** (M1-D14): `NaN`, `+Infinity`, `-Infinity`, `-1`, `-0`, `0` and a non-number, on each of `cashedOut`, `shipImpact` and `chestPicked`. Each must give:
  - a wallet snapshot identical before and after, apart from the Q9 fault marker if chosen (I11);
  - no `lastWin`, no history entry, no flash;
  - a balance that stays finite and nonnegative.
- **Wallet integrity regressions** (H1–H6, §23.17):
  - a repeated `diveStarted` after a cashout, then a second `cashedOut` → one credit (H1);
  - a second `shipImpact` after a jackpot credit, then `chestPicked` → the total equals the rounded-down final payout (H2);
  - a duplicate `betPlaced` → one debit; a sub-cent or non-finite `betPlaced` → no debit (H3);
  - an over-balance `betPlaced` → no debit and no negative balance (H4, if Q12 is approved);
  - `chestPicked` with `final < jackpot` → refused (H5);
  - a settlement event whose `roundId` differs from the participation's → refused (H6).
- **Normal-flow non-interference:** across thousands of scripted rounds through `session.submit` only, no W-rule refusal ever fires, and I8 holds after every dispatched tick. This proves that the guards are never stricter than the engine in the normal flow (K1).
- **Atomic integration (C4, §23.18):** the full suite runs green on the single integration commit before it is pushed.

### 23.8 Proposed implementation stages (none authorized by M1-0)

*Superseded in part (owner decision M1-D9, 2026-11-13, after the security boundary review).* The C1 recommendation below is kept as the record of the review that produced it. Its boundary analysis (K1–K4) and its commit 1 are still in force. Its commit 2 (wallet tripwire) and the claim that C1 completes M1 are superseded: under C1, V2 stays open at every commit. The provisional plan is **C3**, in §23.14.

*Revised in the M1-0 review (2026-11-13).* The first draft recommended Sequence A and said atomic landing was not required. Verified against the code, that is wrong in two ways: E-X2 alone fails an existing test, and a wallet rule landing before the engine rule makes an inconsistent state reachable (§23.5, §23.12). The stage *scopes* E-X2, M1-1, M1-2 and M1-3 are unchanged. What changes is how they are grouped into commits.

**Conditions any commit plan must meet** (derived from §23.12):

- **(K1) Engine never weaker than wallet.** At no commit may the wallet's `betPlaced` rule be stricter than the engine's acceptance rule. M1-2, or any wallet stake or over-balance rule, must therefore never land before the engine guard. Otherwise case 3 becomes reachable.
- **(K2) UI never weaker than engine.** At no commit may the UI enable rule be weaker than the engine's rule. If it is, PLACE BET is offered for a stake the engine silently rejects (I3 broken), and the `0.123` DOM test fails — see the next condition.
- **(K3) Suite green.** Every commit leaves the full suite green. `src/ui/screen.bet-input.test.tsx:104-114` places a `0.123` bet through the real engine (the scripted session uses the actual `createGameSession` and `GameEngine`), so it fails the moment the engine rejects `0.123`.
- **(K4) One predicate.** Engine, session, action state and wallet call one function (Master Rules). The engine may import only its own modules and `src/shared` (docs/06 §4).

**Sequences evaluated:**

| | **A** — E-X2 → M1-1 → M1-2 | **B** — M1-1 → E-X2 → M1-2 | **C** — everything in one commit | **C1 (recommended)** — [E-X2 + M1-1] → M1-2 → M1-3 |
|---|---|---|---|---|
| Interim financial safety | After E-X2: no invalid stake is accepted from any caller | After M1-1: the honest UI path is closed; **non-UI callers still get zero-debit bets** (case 8) | No interim state | After commit 1: closed for every caller; the wallet is unchanged |
| Engine–wallet consistency (I8) in interim | Holds | **Violated for non-UI callers:** the debit is 0 for an accepted 0.004 | Holds | Holds at every commit (K1) |
| UI action availability (I3) in interim | **Broken:** PLACE BET enabled for `0.123`, the click silently rejected (K2) | Holds | Holds | Holds |
| Existing tests | **E-X2 commit fails the `0.123` DOM test (K3).** It must also edit a UI test outside its own scope, and the pin is rewritten twice | Green | Green; pin rewritten once | Green; pin rewritten once (commit 1) |
| Determinism | Unchanged — the predicate is pure, and a rejection takes the existing reject path | Same | Same | Same |
| Freeze exception | Engine and shared files only (+ the UI test, if accepted) | The predicate must first live outside frozen directories; E-X2 must then *move* it into `src/shared` and edit UI imports (otherwise it is duplicated, which is forbidden) | Engine/shared files = E-X2 candidate list, bundled with UI **and settlement** changes | Engine/shared files = exactly the E-X2 candidate list, bundled with the non-frozen M1-1 files; **bundling needs explicit owner approval (Q2)** |
| Rollback | Revert M1-1 before E-X2 | After the move, revert in reverse order only | One revert restores U5 behavior everywhere | Revert commit 2 first (it imports the predicate), then commit 1. Commit 2 alone reverts independently |
| Non-UI bypass in interim | Closed | **Open** | Closed | Closed |
| Invalid historical events | None persisted: the wallet is in memory per session and a reload resets it (§23.12, case 10) | Same | Same | Same |

**Recommendation: C1** — two code commits plus a validation commit:

1. **Commit 1: E-X2 + M1-1.** One commit containing the shared predicate, the engine guard, the session submit edge and the action state.
2. **Commit 2: M1-2.** The wallet tripwire.
3. **Commit 3: M1-3.** Validation.

Commit 1 makes the engine and UI acceptance edges change together. It therefore satisfies K1–K4, never exposes the I3 gap of A or the bypass of B, and rewrites the D11 pin exactly once. Commit 2 changes the settlement file in isolation, where the unchanged ledger suite proves valid settlement is untouched. With the engine guard in place, the wallet tripwire cannot be reached from the engine, so it cannot create case 3. Full **C** is equally safe and an acceptable alternative. It is not recommended only because it mixes the settlement change into the engine-exception commit and leaves a single, larger review. Separate commits are safe **only** under K1–K4. Under them, the engine and wallet changes need not be atomic, but the engine and UI acceptance edges must be.

| | **M1-0** | **Commit 1 — E-X2 + M1-1** | **Commit 2 — M1-2** | **Commit 3 — M1-3** |
|---|---|---|---|---|
| Purpose | Decisions + this plan | Shared predicate; engine rejects invalid stakes; button and submit edge require valid stake ∧ affordable | Wallet tripwire: ignores a `betPlaced` that is not a valid stake (plus Q3 options) | Full matrix, replay, consistency cases, browser QA, acceptance |
| Depends on | — | M1-0 approved; Q1, Q2, Q4 answered; E-X2 scope approved | Commit 1; Q3 answered | All previous |
| Anticipated files | docs 06, 07, 14, 15, 16 | *Frozen (E-X2, docs/06 §13.1):* `src/shared/stake.ts` + `stake.test.ts` (new), `src/engine/state-machine.ts` lines 216-222, `src/engine/state-machine.test.ts`. *Not frozen (M1-1):* `src/ui/store/wallet-store.ts` (composed predicate beside an unchanged `isAffordable`, no settlement change), `src/ui/components/action-state.ts`, `src/ui/session.ts`, comment in `src/ui/store/bet-input-store.ts`, and their tests incl. `src/ui/screen.bet-input.test.tsx`. No markup change: the button already renders `action.enabled` | `src/ui/store/wallet-store.ts` (`betPlaced` listener only), `wallet-store.test.ts` | Tests only (`src/ui/*.test.*`; `src/engine/*.test.ts` only if E-X2's approved scope allows), tracking docs |
| Invariants delivered | — | I1 at every acceptance edge, I2, I3, I7, I8 in the normal flow | I6; closes cases 5 and 6 for foreign events | I1–I8 proven end to end |
| Automated tests | — | Predicate matrix; engine accept/reject and same-tick orderings; replay with rejected stakes; value matrix through DOM and session; button ⇔ submit equality; D11 pin rewritten (sanctioned); 20 U3 pins unchanged | Direct-event matrix (invalid, duplicate, foreign `betPlaced`); ledger suite unchanged | Repeated cycles vs an integer ledger; all settlement paths; the I8 property; remount |
| Manual QA | Owner reads the diff | Gameplay loop (docs/06 §21); type `0.004`, `0.005`, `1.005`, `0.01`, `1.000`; − / + / quick bets; balance-boundary bets | Gameplay loop | Full browser pass, together with the pending U4b and U5 QA |
| Freeze | None touched | **Engine + shared floor within the E-X2 list only — explicit owner approval of the scope and of bundling** | `git diff --stat src/engine src/rendering src/shared` empty | Empty unless E-X2's approved scope includes engine test files |
| Approval | Owner approves the diff, then a docs-only commit | Owner approves scope, then the result | Owner approves start and result | Owner acceptance of M1 |
| Rollback | `git revert` of the docs commit | `git revert` restores U5 behavior in engine and UI together; revert commit 2 first if it landed | `git revert`; independent | n/a (tests and docs) |

Rollbacks are always new revert commits — published history is never rewritten (`AGENTS.md`).

### 23.9 Open questions for the owner

- **Q1 — Technical stake ceiling. OPEN** (M1-D10, 2026-11-13: it stays open, and so do any balance or payout ceilings, until each is supported by mathematical analysis and approved by the owner). *Revised in the review, 2026-11-13: the first draft's recommendation of 2^51 cents is withdrawn as a recommendation; it stays as candidate T2.* Analysis in §23.11. A *settlement-safety* ceiling cannot be finalized in M1, for three reasons: the maximum multiplier is not an engine invariant; the engine never sees the balance; and balances accumulate. Only a *representability* bound on the stake can be derived. If the owner wants one, the mathematically justified candidate is T1: stake < 2^46 units, the domain where M1-D1 is decidable. It would be a technical domain limit, explicitly not a product maximum. Otherwise choose T6: no ceiling, with the large-value behavior recorded as a limitation. Either way it needs approval under M1-D2.
- **Q2 — Commit plan and home of the shared predicate.** Recommended: C1 (§23.8) — `src/shared/stake.ts`, with E-X2 and M1-1 bundled in one commit and M1-2 after it. This needs explicit approval that the E-X2 exception commit may carry the non-frozen M1-1 files. Alternatives: full C; A (only if the owner accepts an E-X2 commit that also edits `src/ui/screen.bet-input.test.tsx` and a temporary I3 gap); B (not recommended — interim bypass, and the predicate has to move).
  *Status (M1-D9, 2026-11-13):* C3 is adopted provisionally (§23.14). Its commit 1 is identical to C1's commit 1, so the home of the predicate (`src/shared/stake.ts`) and the bundling of the M1-1 files into the E-X2 commit still need explicit approval, together with E-X2's scope (M1-D12).
- **Q3 — Scope of the wallet guard (M1-2).** *Resolved in part (M1-D9, 2026-11-13):* the non-finite debit, credit, payout and balance protection is in M1, in the settlement commit of §23.14. The remaining items below are deferred to a separate P1 hardening task, per C3, unless the owner folds them back in:
  - the sub-cent stake tripwire;
  - the duplicate-`betPlaced` guard;
  - diagnostics beyond the non-finite guards.

  Correction from the security boundary review: a `roundId`-keyed dedupe satisfies K1 only when there is no `restore()`, which can rewind `roundId`. None of these guards stops forged *finite* events (§23.15).
  - *Required, per K1:* the wallet's stake rule is exactly the engine's predicate — ignore a `betPlaced` whose amount is not a valid stake. It must not be stricter.
  - *Recommended addition:* ignore a second `betPlaced` while already participating. The engine emits at most one per round, so this can never create case 3, and it closes case 6.
  - *Recommended:* surface every tripwire hit as a dev diagnostic, because a hit means I8 was already broken upstream.
  - *Not recommended:* ignoring a `betPlaced` above the balance. The engine accepts it from non-UI callers, so this would make case 3 reachable. Over-balance stays limitation L2.
  - *Owner choice — non-finite settlement multipliers:* ignoring them prevents an unrecoverable `NaN` balance (L4) but refuses a payout the engine considers won. Recommended: include it, as the fail-safe direction (docs/06 §18).
  - *Owner choice — finite balance in `isAffordable`:* `isAffordable(5, NaN)` is true today, so a non-finite balance makes every bet affordable. Requiring a finite balance changes a U5 D7 predicate.

  *Status (M1-D15, 2026-11-13):* the P1 deferral above is superseded. The sub-cent tripwire, the duplicate-`betPlaced` guard, `roundId` idempotency and the diagnostics are in M1, as W1–W9 (§23.17). The over-balance item ("not recommended" above) is reassessed in §23.17 W3 and is now question Q12. Two items stay open owner choices: a finite balance in `isAffordable` (still open), and the non-finite settlement handling (now Q9).
- **Q4 — Snapshot restore.** Should `restore()` validate `participant.betAmount`? Recommended: no for M1 (snapshots are trusted, authority-produced data; the Phase 8 network edge validates external input) — recorded as a known gap. The wider gap is §23.12 case 9 and L3: the wallet is not part of the engine snapshot, so *any* restored participant, valid or not, is unknown to the wallet. `restore()` has no production caller today.
  *Correction (security boundary review, 2026-11-13; recorded as a known limitation under M1-D11):* restore also produces the **reverse** state, where the wallet is participating and the engine is not. Restore emits no `bettingOpened`, so a later real `shipImpact` can pay a wallet participation the engine does not have. Money moves in that case (the case 4 behavior). Restore can also inject unvalidated multipliers (`jackpotMultiplier = NaN` gives `chestPicked.finalMultiplier = NaN`), crash points and chests. The finiteness guards of the settlement commit stop the non-finite values reaching the balance. They do not stop finite injected values (§23.15).
- **Q5 — Input attributes.** Adding `step="0.01"` / `min="0.01"` to the amount field would give browser-level hints but is a markup change (markup is byte-identical until U6). Recommended: not in M1; decide with U6.
- **Q6 — Rejection feedback.** M1 only disables the button for an invalid amount; it adds no message explaining why. A user-facing hint is new UX and would need its own approval.
- **Q7 — Event and command injection (F3).** `EventBus.emit` is public, and `session.engine` is exposed, so non-UI code can inject `betPlaced`, settlement events or commands (cases 4–6, 8). Recommended: no change in M1. Narrowing these touches the engine API or the session surface, outside E-X2. In local authority mode it is equivalent to client tampering (TASK 001). Revisit with the U6 session surface or Phase 8.
  *Status (M1-D11, 2026-11-13):* recorded as a known limitation, together with live-reference aliasing, `snapshot()` exposing `crashAt`, and `advance(NaN)` (§23.15). Not fixed in M1.
- **Q8 — Payout rounding implementation and the meaning of "intended" (new, 2026-11-13).** M1-D8 fixes the policy: round down. The owner still has to approve:
  - (a) the definition of the intended multiplier. Recommended: the decimal the number denotes, i.e. its shortest round-trip decimal. Rejected alternative: the exact binary value, which loses a cent on two-decimal multipliers;
  - (b) the implementation: exact `BigInt` arithmetic on those decimals, with one function for every settlement path and for the `potentialWin` display.

  Analysis and alternatives are in §23.13. To be approved with the settlement commit.

  *Status (M1-D13, 2026-11-13):* the policy is approved. The implementation details below stay **open** for approval (§23.16):
  - (a) Confirm the canonical decimal (meaning 1) as the intended value for *unrounded* cashout multipliers. There it can pay one cent more than the exact binary product, in a straddle case measured as never occurring on 139,212 cashout-like samples.
  - (b) Approve the BigInt decomposition as the single payout function.
  - (c) Whether the displayed multiplier (round-to-nearest `toFixed(2)`, a presentation value) should change. Recommended: no change in M1; decide with U6.
- **Q9 — Negative or out-of-range finite multipliers (new, 2026-11-13).** I9 covers only nonnegative multipliers. A negative multiplier from an injected authority, a forged event or a restore would make a "payout" negative, which is a debit. Options:
  - (a) the wallet treats a negative multiplier like a non-finite one: refused, with a diagnostic;
  - (b) it stays part of the recorded limitation V7 until a multiplier contract exists.

  Recommended: (a), as the fail-safe direction, if the owner considers it within "essential" protection. It is not part of M1-D9 as decided.

  *Status (M1-D14, 2026-11-13):* resolved for `NaN`, ±Infinity and negative values — they never credit, under option (a). §23.17 shows that zero is not a legitimate settlement multiplier on any path, so W7 refuses it too. Still **open**:
  - (b) whether positive values below 1 (also never produced) are refused. Recommended: no, not in M1. Range belongs to the engine multiplier contract (V7).
  - (c) what a refused settlement leaves behind:
    - (i) nothing: the participation stays open, and a later valid event of that round may pay it;
    - (ii) a non-financial fault marker: no later event of that round may pay it.

    Recommended: (ii) (§23.17).
- **Q10 — Push timing for commit 1 (new, 2026-11-13).** Commit 1 leaves V2 open (§23.14). Pushing it alone publishes that state to the Lovable-connected branch. Options:
  - (a) validate and commit 1 and 2 separately, then push them together;
  - (b) push commit 1 alone and accept the interim state;
  - (c) merge them into one commit, as in the review's C2.

  Recommended: (a).

  *Status (M1-D16, 2026-11-13):* option (b) is **rejected** by the owner. Option (a) still pushes commit 1 as a published history snapshot that contains V2, so under M1-D16 it is not acceptable either. The question is replaced by Q14.
- **Q11 — Payout and balance representability above the exact envelope (new, 2026-11-13).** §23.19 sets out the limits:
  - a payout above 2^46 units has no distinct cent double;
  - `Number(payoutCents)` can round up above 2^53 cents;
  - the balance update is exact only below 2^44.

  Options:
  - (a) record only (the default under M1-D10);
  - (b) refuse a credit whose converted value is not the canonical cent value of the integer payout — a *technical representability bound*, not a product maximum, which needs approval under M1-D10;
  - (c) convert with directed rounding toward zero — never above the intended value, but not a cent value.

  Recommended: (a) for M1, with (b) decided together with Q1. Finiteness (W7) is enforced either way.
- **Q12 — Over-balance `betPlaced` (new, 2026-11-13; reassesses Q3).** M1-D15 requires that no invalid financial event drives the balance negative. A wallet rule that refuses a `betPlaced` above the balance (W3) is stricter than the engine, but only outside the normal flow:
  - Affordability is checked at the session edge, and it still holds when the command applies (F2).
  - It turns the non-UI case from a negative balance into case 3: no money moves, and I8 is broken for runtime-access callers only.

  Recommended: approve W3, and restate K1 as "never stricter than the engine *in the normal authoritative flow*".
- **Q13 — `roundId` keying under `restore()` (new, 2026-11-13).** W4 and W5 bind a participation to its `roundId`. `restore()` can rewind `roundId` (`state-machine.ts:384`). Using "a different `roundId`" rather than "a higher one" keeps a rewound session working, but lets a duplicate `bettingOpened` carrying an *older* id reset the round. Recommended: "different", because restore has no production caller and forged ids are an authenticity question (V4). Revisit in Phase 8.
- **Q14 — Form of the integration commit (new, 2026-11-13; replaces Q10).** Under M1-D16 the options are:
  - S1: one atomic code commit;
  - S3: local working commits, squashed locally before the single push.

  S2 (a series pushed together) publishes unsafe intermediate snapshots. Recommended: S3, or S1 if the owner prefers no local history rewrite (§23.18).

**Owner decisions, 2026-11-14:**

- **Q12 — approved.** W3 (atomic refusal of an over-balance `betPlaced`) and its tests stay.
- **Q8 — approved within its demonstrated domain only.** The BigInt payout function (§23.16) is approved. It is claimed correct only where §23.19 shows it exact: the integer cents at any size, and the converted amount below 2^46 units. No correctness is claimed outside that domain.
- **Q1 / Q11 — option B approved in principle:** exact integer-cent arithmetic for wallet debits and credits, without the full M2 migration. **Not implemented.** Conditions: a legitimate win above the `number` precision range must never be lost, rounded up or discarded silently. Any change to the public balance representation, or any technical limit, needs separate approval. Verified 2026-11-14: a `number` represents every cent value exactly only below 2^46 units (70,368,744,177,664). In 5,000 consecutive cent values just above that, 1,800 do not round-trip. Exact accounting with an unchanged `number` balance therefore needs either a limit or a representation change. Both are pending the owner's choice.
- **Q9c — option (ii) approved in principle; implemented as W10 (§23.17).** Automatic forfeiture of the stake on a technical settlement failure is **not** approved. The resolution policy for faulted rounds (refund, hold or other) is **OPEN**; no refund or forfeiture behavior is implemented.

**Final M1 owner decisions, 2026-11-14 (later the same day).** They refine the entries above, which stay as written:

- **Q1 / Q11 — B-R chosen in principle.** The exact integer-cent ledger must be authoritative. A `number` balance may be used for presentation only, never for settlement, affordability or any other authoritative calculation. Money is never silently rounded or misrepresented. The owner prefers this to a technical balance ceiling that could block legitimate winnings, so T1–T5 are not adopted. Condition: before implementation, every affected consumer is identified, and any public API change or wider M2 migration is presented as a minimal design for approval. **Status: not implemented.** The consumer analysis shows that a read-surface change cannot be avoided, so the design waits for approval (§23.20).
- **Q9c — R2 chosen, as a temporary local-demo policy.** It is not a production dispute-resolution system. On a settlement failure, the stake is neither refunded nor forfeited automatically. An auditable unresolved claim is preserved, with the original stake, round identity, settlement fault and any amount already credited. Later duplicate credits are impossible, and a technical failure is never classified as a player loss. **Status: implemented** (§23.17, W10).
- **E-X2 — approved, as implemented.** This covers the shared predicate, the engine `placeBet` validation, their tests and the UI re-export. The freeze exception is not expanded (§19 gate 4, docs/06 §13.1).
- **Q14 — S1.** The M1 integration lands as **one atomic commit**. This approves the commit strategy only: no staging, commit or push until the owner separately authorizes the Git operation. Under S1 the local working commits L1–L3 of §23.18 are not created.
- **Still open:** Q4 (snapshot restore validation, recommended "no"), Q5, Q6, Q8c (displayed multiplier), Q9b (multipliers in (0, 1)) and Q13 (implemented as "different `roundId`", per the recommendation). None blocks the integration commit. Q2 (bundling) is settled by S1 and the E-X2 approval.

### 23.10 M2 — integer minor units (deferred, not started)

Scope reserved for M2, per M1-D5 and §20's non-goal: balances, stakes, wins and deltas held as integer cents; a defined payout rounding policy; an exact multiplier representation at the settlement boundary; conversion at the display and input edges; migration of the ledger tests' float pins. It needs its own architecture review, test plan, approval gate and commit sequence. Nothing in M1 starts it. M1 is designed not to obstruct it: the valid-stake rule is already "a whole number of cents", so the M2 conversion of an accepted stake is exact.

*Amended (M1-D7, M1-D8, 2026-11-13).* "A defined payout rounding policy" is no longer reserved for M2. M1 defines it (round down) and implements it on the current float ledger (§23.13). M2 inherits that policy unchanged. The integer payout `⌊100 · s̄ · m̄⌋` is already computed in integer cents, so M2 changes the ledger, not the rule.

*Amended (owner, 2026-11-14, roadmap return).* B-R, the authoritative integer-cent wallet ledger (§23.20, design D1–D6), moves back into M2. M2 is still not started and needs its own approval gate.

### 23.11 Numeric bounds — analysis for Q1 (review, 2026-11-13; no bound adopted)

Three different things, which must not be confused:

- **A — Product-level maximum bet.** A game rule. Unchanged by M1-D2: the available balance and the existing game rules. No new value is proposed.
- **B — Technical numeric safety bound on a stake.** The range in which a `number` stake can carry the M1-D1 rule at all.
- **C — Maximum safe payout or settlement amount.** The range in which `stake × multiplier` and the balance arithmetic stay finite and exact to the cent. It depends on the multiplier and on the balance, not only on the stake.

**Facts about doubles** (all values in currency units; spot-checked 2026-11-13 by ad-hoc scripts, not part of the suite):

- Integers are exact up to 2^53 (`Number.MAX_SAFE_INTEGER`). Cent values `k / 100` are not integers. The spacing between doubles near `x` is `2^(⌊log2 x⌋ − 52)`.
- **Distinct cents.** Every cent has its own double iff that spacing is below 0.01, i.e. below **2^46 = 70,368,744,177,664**. Counterexample above it: `9444132641444916 / 100 === 9444132641444917 / 100`.
- **Integer-cent conversion** `Math.round(a × 100)` is exact for `k < 2^51` cents (22,517,998,136,852.48 units). It falsely rejects about 7% of sampled cent values in `[2^51, 2^52)` cents.
- **`MAX_SAFE_INTEGER` cents** = 90,071,992,547,409.91 units: the limit of an M2 ledger in `number` cents. It lies above 2^46, so today's float stakes cannot even represent every cent up to it.
- **Wallet add/subtract** `+(x ± y).toFixed(2)` is provably exact when operands and result are below **2^44 = 17,592,186,044,416**: three roundings add at most 1.5 · 2^-9 < 0.005. No counterexample was found up to 2^45. It fails in `[2^45, 2^46)`, e.g. `+(50589181010783.45 − 1.76).toFixed(2)` = `50589181010781.7` (correct: `…781.69`).
- **Payout** `+(stake × m).toFixed(2)` is finite iff `stake × m ≤ Number.MAX_VALUE`, and is a distinct cent value only below 2^46. Exact decimal rounding is never guaranteed (§23.6).
- For `|x| ≥ 1e21`, `toFixed` returns exponent notation.

**Maximum multiplier under the existing rules** (verified at `8363b9f`):

| Multiplier | Bound | Source | Enforced by the engine? |
|---|---|---|---|
| Cashout (live) | < ≈ 6.61 — `multiplierAt(1289/60)` ≈ 6.2095 plus at most 0.4 boost | Physics: without boost the anchor reaches `CHAIN_MAX_DEPTH` = 4200 on tick 1290 (21.5 s); boost only shortens the dive (`src/engine/domain/descent.ts`, `multiplier.ts:10-14`, `simulation.ts:126-162`, `src/shared/world.ts:7`). A cashout command applies on a diving tick, before the floor | Implicitly, through tuning only. It is not a named cap; a tuning change moves it |
| Crash | Crash point ≤ 200 (local authority). In practice ≤ ≈ 6.62: a crash point above the reachable multiplier never fires, and the dive hits the floor instead | `outcomes.ts:22-30`, `simulation.ts:135` | No |
| Jackpot | ≤ 500.00 | `outcomes.ts:34-41` | No — a `RoundAuthority` output |
| Chest | ≤ 50.00 | `outcomes.ts:43-55` | No — a `RoundAuthority` output |
| Final (jackpot × chest) | ≤ 25,000.00 | `state-machine.ts:267` | No |

So the largest payout multiplier is 25,000, **but only for `LocalRoundAuthority`**. The authority is injectable (docs/06 §16; Phase 8 swaps in `RemoteRoundAuthority`), and nothing checks its outputs for range or finiteness.

**Can a finite stake produce a non-finite payout?** Yes:

- Under the local authority, iff stake > `MAX_VALUE / 25,000` ≈ 7.19 × 10^303.
- Under an unconstrained authority, for every stake: `0.01 × Infinity` is `Infinity`, and `NaN` propagates.
- Today, a non-UI `placeBet` of `Infinity` debits to `-Infinity`, and any later credit gives a `NaN` balance. With a `NaN` balance, `isAffordable(x, NaN)` is true for every positive finite `x` (`wallet-store.ts:105-106`), and the state lasts until a page reload.

**Candidate bounds** (none adopted):

| # | Candidate | Value (units) | Kind | Justification | Limits / counterexample |
|---|---|---|---|---|---|
| T1 | stake < 2^46 | 70,368,744,177,664 | B | The largest range in which M1-D1 is decidable for a double | Does not make settlement exact (wallet arithmetic is exact only below 2^44) |
| T2 | stake < 2^51 cents | 22,517,998,136,852.48 | B | M2's `Math.round(a × 100)` conversion is exact | Arbitrary for M1 itself; the first draft's recommendation, withdrawn |
| T3 | stake ≤ 2^44 | 17,592,186,044,416 | B/C | The debit of such a stake is exact | Says nothing about payouts or the accumulated balance |
| T4 | stake ≤ (2^44 − balance) / Mmax | < 703,687,441.77 for Mmax = 25,000 and balance 0 | C | The first settlement after the bet stays exact | Depends on Mmax (an authority property, not engine-enforced) and on the balance (which the engine never sees), so it cannot be a stake-only rule. Accumulation is still unbounded |
| T5 | stake ≤ `MAX_VALUE` / Mmax | ≈ 7.19 × 10^303 | C (finiteness only) | The payout stays finite | Finite ≠ exact; needs Mmax |
| T6 | none (M1-D2 as is) | — | — | Honest path bounded by affordability in the UI | The engine accepts `1e300`; a non-UI caller then drives the balance to `-1e300` |

**Conclusion.** A universal settlement-safety ceiling (C) **cannot be finalized in M1**, for three reasons:

1. The maximum multiplier is not an engine invariant. 25,000 is a property of one authority's distributions, and the cashout limit is a side effect of tuning.
2. The engine never sees the balance.
3. Balances accumulate, so I4 is a condition on the balance's magnitude that no per-bet ceiling can guarantee.

Only a representability bound (B) is derivable; T1 is its mathematically justified form. T2 and T3 are stricter choices tied to M2's conversion and to the wallet's arithmetic. Q1 stays **open**.

Settlement-safety bounds belong with M2, together with an explicit multiplier contract: a named, enforced multiplier cap and a finiteness check on authority outputs. That contract would be an engine change and is **not** part of E-X2.

### 23.12 Engine–wallet consistency contract — analysis for Q2 (review, 2026-11-13)

Six properties, kept apart:

| Property | Question | Decided by | Today |
|---|---|---|---|
| Command validity | Is the `placeBet` amount a valid stake (§23.4)? | The shared predicate — a pure function of the payload | Not checked (only `> 0`) |
| Engine acceptance | Did the engine apply the command (phase, not yet participating, valid amount)? | `applyPlaceBet` (`state-machine.ts:219-230`) | Participant set, `betPlaced` queued |
| Wallet settlement validity | May the wallet apply this event (participation, exclusivity, payload validity)? | Wallet listener guards (`wallet-store.ts:164`, `:185`, `:208`, `:214`) | `betPlaced` unguarded (`:143-153`) |
| Financial accounting consistency | Engine participation ⇔ wallet participation; debit = stake; at most one settlement | The composition — I2, I5, I8 | Holds only for whole-cent stakes from the UI path |
| UI action availability | Is PLACE BET offered? | `actionStateFor` over wallet, round and input (`action-state.ts:56-87`) | Affordability only |
| Replay and snapshot validity | Do restore and replay reproduce the engine state — and the wallet state? | Engine snapshot (engine only, docs/06 §14); the wallet is not in it | Engine only |

**Runtime trace** (verified at `8363b9f`):

1. **Input:** the bet-input store holds a finite value ≥ 0 (`bet-input-store.ts:33-37`, `:55-62`).
2. **Submission:** the click calls `gameSession.submit({ type: "placeBet", amount: betInput.get() })` (`AbyssAnchor.tsx:63-64`). The session drops the command unless `canAfford` passes; otherwise `engine.submit` queues it (`session.ts:143-146`, `game-engine.ts` `submit`).
3. **Command queue:** on the next consumed tick, `drainCommands` applies the whole batch in submit order **before** `machine.step` (`game-engine.ts` `advance`).
4. **Validation:** `applyPlaceBet` checks phase, then participation, then amount (`state-machine.ts:220-222`).
5. **Acceptance:** the participant is set, and `betPlaced` is *queued*, not delivered (`:223-229`). On rejection, `commandRejected` is queued and the state is untouched.
6. **Dispatch:** after the tick, `events.dispatchQueued()` delivers in emit order, catching listener errors (`events.ts:70-80`). The wallet subscribed first (`session.ts:117`) and debits before any other listener (`wallet-store.ts:143-153`).
7. **Settlement:** `cashedOut` (diving), `shipImpact` (impact) and `chestPicked` (bonus) each pass the wallet's participation and exclusivity guards. `bettingOpened` resets the wallet's per-round flags, and `enterBetting` clears the engine participant (`state-machine.ts:346-355`).
8. **Projection:** the round store syncs after dispatch; the action state reads `wallet.participating` (`action-state.ts:77-85`).

**Structural facts:**

- **F1 — Events are post-tick facts.** A listener cannot veto or undo an acceptance. A command submitted from a listener applies on the next tick, and there is no cancel-bet command. So the wallet cannot restore consistency after the engine accepted something it refuses: **I8 can only be enforced at or before acceptance.**
- **F2 — Affordability cannot be enforced at acceptance.** The engine never sees a balance (docs/06 §3), so affordability is enforced at the session edge, and it stays true until the command applies. Between submit and apply, no balance-changing event can occur while the engine is in `betting`: the only wallet mutation there is `betPlaced`, and the engine emits at most one per round (`already-participating`). A `placeBet` submitted in any other state is rejected `not-in-betting` when it applies.
- **F3 — Events and commands can be injected.** `EventBus.emit` is public (`events.ts:59-62`; documented as engine-internal) and the session exposes `engine` (`session.ts:75`). Any code holding the session can inject events or commands. In local authority mode that equals client tampering, which is already accepted (TASK 001). The real security boundary is the Phase 8 server.

**Cases:**

| # | Case | Engine | Wallet | Participant? engine / wallet / UI | Settlement still possible? | Invariant | Recovery without reset |
|---|---|---|---|---|---|---|---|
| 1 | UI rejects before submit (M1-1) | No command | Unchanged | no / no / PLACE BET disabled | — | Holds | — |
| 2 | Engine rejects (E-X2, phase, duplicate) | Unchanged; `commandRejected` | Unchanged | no / no / PLACE BET — enabled if the UI judged it valid (the A-interim I3 gap) | No | Money holds; I3 broken if the UI enabled it | Immediate |
| 3 | Engine accepts, wallet rejects (a wallet rule stricter than the engine's) | Participant with `betAmount` | No debit; `participating` false; `roundBet` 0 | yes / no / PLACE BET (betting), SPECTATING (diving) | Engine: cashout accepted if submitted directly; jackpot auto-cash sets `bonusEligible`, so the chest picker opens and a pick is applied. Wallet: every one ignored (`:164`, `:185` else-branch, `:214`) | **I8 violated.** No money moves, but a valid re-bet that round is rejected `already-participating` while PLACE BET shows enabled, and a pick pays nothing | Yes — at the next `bettingOpened`; the round is lost to the player |
| 4 | Wallet debits without engine acceptance (foreign `betPlaced`, F3) | No participant | Debited; `participating` true | no / yes / BET LOCKED, then CASH OUT | Cashout: rejected `not-participating`, no credit. Crash: loss recorded. **Jackpot: the wallet credits `roundBet × jackpot`** (`:183-195`) for a participation the engine never had. No chest | **Violated; money moves** | Next `bettingOpened`; the money stays moved |
| 5 | Invalid `betPlaced` payload (`0.004`, `Infinity`, `NaN`) — from the engine before E-X2, or foreign | As per source | Today: debits 0 for `0.004`; `Infinity` → `-Infinity`, then `NaN` after any credit. After M1-2: ignored | yes / yes (today) | Yes — real cents for no stake; `NaN` makes everything affordable | Violated today | A `NaN` balance: no, only a reload |
| 6 | Duplicate `betPlaced` in one round (foreign only; the engine emits ≤ 1) | One participant | Today: debited twice; `roundBet` = the second payload (no guard at `:143-153`) | yes / yes | Settles once, on the second `roundBet` | Violated (debit ≠ stake) | Next round; the extra debit is not returned |
| 7 | Repeated commands near a tick boundary | All commands queued before the tick apply in submit order. The first valid `placeBet` wins; later ones are rejected `already-participating`. Invalid-then-valid: the invalid one is rejected `invalid-amount` and the valid one accepted, because E-X2 keeps the check order. A bet applied on the last betting tick is accepted and the same tick enters `diving`; dispatch order is `betPlaced`, `stateChanged`, `diveStarted` | Exactly one debit | consistent | Yes | Holds | — |
| 8 | Invalid stake from a non-UI caller (`session.engine.submit`) | Today: accepted. After E-X2: rejected | Today: debits 0 for ≤ 0.005 | yes / yes (today) | Yes — the zero-cost bet pays | Violated today ("correctly debited"); holds after E-X2 | — |
| 9 | `restore()` with a participant | Participant restored; `betAmount` unvalidated (`state-machine.ts:382-395`) | Unchanged — the wallet is not in the snapshot, and restore emits no events | yes / no (or stale) | As case 3 | **Violated for any restored participant, valid or not** | Next `bettingOpened`. No production caller today (tests only) |
| 10 | Deterministic replay of a command log | Identical for identical inputs. After E-X2, an invalid stake in an old log is rejected | A pure function of the event stream; a fresh session re-derives it consistently | consistent | As original | Holds within one version; logs from before E-X2 replay differently. None are persisted | — |

**How I8 is enforced in this synchronous architecture.** The *normal authoritative session flow* means: commands only through `session.submit`, events only from the engine, and no `restore()`. In that flow, I8 holds by construction once commit 1 of §23.8 lands, for these reasons:

1. **Equal acceptance sets.** The engine accepts an amount iff the shared predicate holds. The wallet's `betPlaced` stake rule is the same function, so it can never refuse an engine-emitted `betPlaced` (K1). Case 3 becomes unreachable.
2. **Affordability.** It is checked at the only edge that knows the balance, and it still holds when the command applies (F2).
3. **Exact debit.** The engine accepts at most one participation per round and emits exactly one `betPlaced` for it, carrying the accepted amount; the debit equals that stake exactly (I2).
4. **Wallet guards are tripwires** for events that did not come from a valid engine acceptance — foreign emits now, server events in Phase 8. They fail safe (no money moves), but a hit means I8 was already broken upstream. They report the breach; they never repair it, and "zero debit, zero credit" must never be read as consistency.

**Limitations M1 cannot solve:**

- **L1** — F3: cases 4–6 stay reachable by non-UI code. Narrowing `emit` or the session surface is an engine/API change outside E-X2 (Q7).
- **L2** — Affordability cannot be engine-enforced. A non-UI over-balance bet drives the balance negative. A wallet over-balance rule would trade this for case 3. The Phase 8 server wallet is the real fix.
- **L3** — The wallet is not in the engine snapshot, so restore and reconnect leave it unaware (case 9). This is Phase 8 reconnect work.
- **L4** — Non-finite authority multipliers can produce a `NaN` or `Infinity` balance, after which every bet is "affordable". A wallet finiteness guard (Q3) limits the damage; the real fix is a multiplier contract (§23.11).
- **L5** — In local authority mode no client-side check is a security boundary against a modified client (TASK 001).
- **L6** — Float settlement rounding (§23.6) is M2.

*Amendments (security boundary review and M1-D7 to M1-D11, 2026-11-13).*

- **Case 9:** restore can also produce the reverse state, where the wallet participates and the engine does not, and money can then move (Q4 correction).
- **L1, L3:** these widen to the limitations recorded in §23.15. The settlement commit's guards stop only *non-finite* values. Forged or restored *finite* values still move money.
- **L4:** closed for the balance by I10 in the settlement commit. Out-of-range finite multipliers stay open (V7).
- **L6:** narrowed. Payout rounding is defined and fixed in M1 (§23.13). Only the float ledger and its magnitude limits remain for M2.

### 23.13 Payout rounding policy — V2 (owner policy M1-D8, 2026-11-13; implementation proposed, not authorized)

*Refined by §23.16 (M1-D13, 2026-11-13).* The analysis below stands. §23.16 adds three things:

- the distinction between the four meanings of a multiplier, and which one settlement uses;
- the rule that the chest delta subtracts the *recorded* jackpot payout;
- the finding that step 3's `Number(payoutCents) / 100` can round **up** above 2^53 cents and overflow above about 1.8 × 10^306 units, so the conversion is part of the numeric envelope (§23.19).

**The invariant (I9).** For every valid nonnegative stake `s` and every finite nonnegative multiplier `m`, the credited payout must be:

- finite;
- nonnegative;
- representable in cents;
- not greater than the mathematically intended amount `s × m`.

Stated in integer cents: `payoutCents = ⌊100 · s̄ · m̄⌋`, where `s̄` and `m̄` are the intended values of `s` and `m`, as defined below. Per settlement path:

- **Cashout:** `m` is the `cashedOut` multiplier, which is unrounded.
- **Jackpot auto-cash:** `m` is `jackpotMultiplier`, a two-decimal value.
- **Chest:** the participation's total payout is `⌊100 · s̄ · final⌋`. At the pick, the wallet credits that total minus the jackpot payout it has already credited. Both terms are rounded down, so the total credited for the participation is exactly the rounded-down total. Under the local authority, `chest ≥ 1` and so `final ≥ jackpot`, which makes the delta nonnegative.
- **Loss and spectator:** 0.

**What "intended" means — this needs the owner's approval (Q8).** A JavaScript number is a binary double, and most decimal multipliers are not representable: `1.15` is stored as 1.149999999999999911…. There are two candidate meanings:

- **(a) The exact binary value of the doubles. Rejected.** Under (a), rounding down pays 1.14 for 1.00 × 1.15 and 57.28 for 1 × 57.29. That is a systematic cent loss on exactly the two-decimal multipliers the engine produces on purpose: jackpot, chest and final are all `+(…).toFixed(2)` (`outcomes.ts:34-55`, `state-machine.ts:267`). On a grid of 500 stakes × 901 two-decimal multipliers, it lost a cent in 7,200 cases. This is the floating-point cent loss that M1-D8 excludes.
- **(b) The decimal the number denotes: its shortest round-trip decimal, `String(x)` (ECMAScript Number::toString). Recommended.**
  - For every canonical cent value below 2^46, this is exactly the two-decimal value: `1.15`, `57.29`, `0.29`. Below 2^46, distinct cents have distinct doubles, so no shorter decimal can round-trip to the same double.
  - For an unrounded cashout multiplier, it is a 15–17-digit decimal within half a unit in the last place of the binary value.
  - On 41,248 cashout-like samples (`exp(0.085·t)` plus boosts 0–0.4 over every tick up to 1289, × 8 stakes), (a) and (b) gave the same cent amount in every case.

**Why simple float formulas fail.** Measured 2026-11-13 with ad-hoc scripts, not part of the suite. The grid is stakes `k/100` for `k ≤ 2,000` × multipliers `M/100` for `100 ≤ M ≤ 1,000` (1,802,000 pairs), against the integer reference `⌊k·M/100⌋`:

| Formula | Failure | Evidence |
|---|---|---|
| `Math.floor(s * m * 100) / 100` | Loses a cent whenever the product of doubles lands just below a whole cent | `0.29 * 100 = 28.999999999999996` → 0.28; `0.57 × 1` → 0.56; `1.15 × 1` → 1.14; `100 × 1.15` → 114.99; **12,431** errors on the grid |
| `Math.floor(Math.round(s * 100) * m) / 100` (integer stake cents, float multiplier) | Fixes the stake but not the multiplier | `1 × 1.15` → 1.14 (`100 * 1.15 = 114.99999999999999`); **3,450** errors |
| `+(s * m).toFixed(2)` (today) | Rounds to the nearest cent, which is V2 | Pays more than the rounded-down amount in **854,617** of the 1,802,000 grid pairs, and in about half of the cashout-like samples |
| `Math.floor(x + ε)` | No safe ε exists. The spacing of doubles grows with magnitude, and an ε large enough to absorb the error can lift a value that is truly below a cent boundary over it — an overpayment, which violates I9 | — |

**Recommended implementation (proposed; part of the settlement commit's approval, Q8).** Exact integer arithmetic on the decimal values, in one function used by every settlement path and by `potentialWin`:

1. Decompose `s` and `m` into exact decimals (an integer mantissa and a power-of-ten exponent) by parsing `String(x)`. This also handles exponent notation such as `1e+21` and `5e-7`.
2. Multiply the mantissas as `BigInt`, which is exact at any size. Compute `payoutCents = ⌊Ns · Nm · 10^(es + em + 2)⌋` with `BigInt` division. That division truncates, which is the same as rounding down for nonnegative operands.
3. Convert back with `payout = Number(payoutCents) / 100`. The result is the canonical cent double while `payoutCents < 2^53` and the payout is below 2^46 units.
4. Guard (M1-D9, §23.14): no credit if either input or the converted payout is not finite, or if the resulting balance would not be finite.

Checked on all 1,802,000 grid pairs: 0 mismatches. Results for the required probes:

| Stake × multiplier | Payout |
|---|---|
| 0.01 × 1.5 | 0.01 |
| 0.01 × 1.5014 | 0.01 |
| 0.01 × 2.4999 | 0.02 |
| 0.29 × 1 | 0.29 |
| 0.29 × 2 | 0.58 |
| 1 × 1.15 | 1.15 |
| 1 × 57.29 | 57.29 |
| 33.33 × 57.29 | 1909.47 |
| 0.01 × 25,000 | 250 |

`BigInt` is ES2020. The project targets ES2022 (`tsconfig.json`), so no dependency is needed. The cost is one exact multiplication per settlement.

The function lives in a non-frozen settlement-layer module, `src/ui/store/` (name open). It does not go in `src/shared`, which is frozen: the engine never computes a payout (docs/06 §3).

*Narrower alternative.* For multipliers that are canonical two-decimal values (jackpot, chest, final), `M = Math.round(m × 100)` with integer `⌊k·M/100⌋` is exact while `k·M < 2^53`. The cashout multiplier is unrounded, so this cannot be the only path. Two rounding paths would break the one-rule principle.

**Floating-point limits on verifying I9 in JavaScript.**

- **A double comparison is not a valid test.** `payout <= s * m` can pass a real overpayment and fail a correct rounded-down value:
  - `s * m` is itself rounded, and can land on either side of the true product;
  - the payout double does not equal its cent value exactly: `0.07` is stored as 0.07000000000000000666…, slightly above 7 cents.
- **Check in the integer-cent domain, against an independent oracle.** For two-decimal multipliers, use `⌊k·M/100⌋` in integers. For arbitrary doubles, use the exact rational value of the binary number (mantissa · 2^e as `BigInt`), and assert the difference from definition (b) explicitly. Neither `toFixed` nor the function under test may serve as the oracle.
- **`String(x)` determinism.** ECMAScript requires the shortest round-trip digits. Where several shortest candidates exist, it only *recommends*, rather than requires, the one closest to the exact value. V8, SpiderMonkey and JavaScriptCore follow that recommendation. Within one engine the result is deterministic. Across engines it is deterministic in practice. Tests pin the digit strings of the values they use, so a deviation is caught rather than assumed away.
- **Magnitude.** I9 is exact in the integer domain at any size, but the credited double is exact only within bounds:
  - above 2^46 units, distinct cents share one double;
  - above 2^53 cents, `Number(payoutCents)` is inexact;
  - from `1e21` up, `toFixed` uses exponent notation;
  - the balance update `+(balance ± x).toFixed(2)` is exact only below 2^44 (I4).

  These bounds are recorded, not enforced (M1-D10, Q1).
- **Evidence and proof.** The grid and sample counts above are evidence, not proof. The method's correctness is structural: every step is exact integer arithmetic on definition (b). The only float operations are the final correctly rounded `Number(c) / 100` and the unchanged balance update.

**Engine–wallet consistency and determinism.** The engine never computes a payout: events carry multipliers only (docs/06 §3). So the rounding change touches no engine state, event, snapshot or RNG draw. Engine determinism and replay are unchanged, and the wallet stays a pure function of the event stream. On the display side:

- `potentialWin` (`src/components/AbyssAnchor.tsx:105`; shown as "Potential" and on "CASH OUT · …") rounds to the nearest cent today. Left alone, it would show 0.02 and credit 0.01. It must switch to the same function in the same commit. This is one logic line; the markup stays byte-identical.
- `lastWin` and the SECURED label read the wallet's value, so they follow automatically.

### 23.14 Commit plan C3 — provisional (owner decision M1-D9, 2026-11-13; no stage authorized)

*Superseded in part (M1-D15, M1-D16, 2026-11-13).* C3's stage *scopes* stay as the working breakdown. Its publication model and its deferral list are superseded:

- **Publication:** commit 1 contains V2 and the wallet holes, so it may not be pushed by itself, and under M1-D16 it may not appear in published history at all.
- **Deferrals:** the "P1 hardening" items below — the sub-cent tripwire, the duplicate-`betPlaced` guard, `roundId` idempotency and the diagnostics — are folded back into M1 (§23.17, W1–W9).

The provisional plan is now **C4** (§23.18). The text below is kept as the record of C3.

The review's C3 kept C1's commit 1, replaced the wallet-tripwire commit with the V2 fix, and moved the wallet guards to a separate hardening task. The owner adopted C3 with one change: the non-finite wallet protection stays in M1. It joins the V2 fix in the settlement commit, because both change the same listener bodies and the same arithmetic.

| | **Commit 1 — E-X2 + M1-1** (unchanged from C1) | **Commit 2 — M1-2, redefined: settlement integrity** | **Commit 3 — M1-3: validation** |
|---|---|---|---|
| Purpose | Shared stake predicate; the engine rejects invalid stakes; button and submit edge require valid stake ∧ affordable | (a) Payouts rounded down (§23.13) at `wallet-store.ts:165`, `:186`, `:217-219`, plus `potentialWin`. (b) Non-finite protection: a `betPlaced` with a non-finite amount is ignored (no debit, not participating); a non-finite multiplier, payout or resulting balance on `cashedOut`, `shipImpact` or `chestPicked` is not credited, and the participation is marked settled, so no later event can pay it | §23.7 matrix including the V2 block; I1–I10 end to end; replay; consistency cases; browser QA |
| Anticipated files | As §23.8 commit 1 (E-X2 list in docs/06 §13.1 + M1-1 UI and session files) | `src/ui/store/wallet-store.ts`; new payout module + test in `src/ui/store/`; `src/components/AbyssAnchor.tsx:105` (one logic line, markup byte-identical); `wallet-store.test.ts`; the sanctioned oracle and pin rewrites listed in §23.3 (`session.test.ts`, `screen.remount.test.tsx`, `screen.characterization.test.tsx`) | Tests and tracking docs only |
| Engine / freeze | E-X2 list only, bundled with UI — needs explicit approval (Q2, M1-D12) | **None.** `git diff --stat src/engine src/rendering src/shared` is empty | Empty, unless E-X2's approved scope covers engine test files |
| K1 (wallet never stricter than engine) | — | The non-finite `betPlaced` guard is K1-safe **only after commit 1**, because the engine accepts `+Infinity` until then. It must never land before commit 1 | — |
| Rollback | `git revert`; restores U5 behavior in engine and UI together | `git revert`, independent of commit 1, but it **re-opens V2 and the non-finite path** | n/a |
| Approval | E-X2 scope + bundling + start, then result | Q8 (and Q9 if the owner chooses) + start, then result | Owner acceptance of M1 |

**Deferred to a separate P1 hardening task.** Per C3, this is not required to close M1, and the owner may fold it back in:

- the sub-cent stake tripwire on `betPlaced`, which the engine cannot reach after commit 1;
- the duplicate-`betPlaced` guard (case 6, forged events only);
- `roundId`-keyed idempotency;
- diagnostics beyond the non-finite guards.

None of these authenticates an event (M1-D11).

**Consequence of the non-finite credit guard.** When the wallet refuses a non-finite payout, the engine considers the participation won and the wallet credits nothing. That is a settlement disagreement. It is the fail-safe direction (docs/06 §18): no money is created. It is unreachable under `LocalRoundAuthority`, whose outputs are finite by construction, and is reachable only through forged events, an injected authority or `restore()`. It is recorded, not hidden.

**Open financial vulnerabilities at each commit boundary.** Threat models from the review: TM-M1 is the normal browser UI; TM-RT is runtime access in one's own tab; TM-P8 is a future network.

| Boundary | V1 sub-cent zero-debit stake | V2 payout rounding | V3 non-finite stake via a command | Non-finite wallet poisoning (forged event, injected authority, restore) | Known limitations (§23.15) |
|---|---|---|---|---|---|
| Today (`8363b9f`) | **Open** — TM-M1 | **Open** — TM-M1 | **Open** — TM-RT | **Open** | Open |
| After commit 1 | Closed for every command caller | **Open — TM-M1, P0** | Closed | **Open** — TM-RT / TM-P8 | Open |
| After commit 2 | Closed | Closed | Closed | Closed at the wallet (I10) | Open — recorded |
| After commit 3 | Proven | Proven | Proven | Proven | Open — recorded |

**Commit 1 is an intermediate commit that still contains an open financial vulnerability.** V2 (P0) stays reachable through the normal UI, and non-finite wallet poisoning stays reachable through runtime access. Commit 1 introduces neither; both exist at `8363b9f`. But at that point neither may be described as fixed, and M1 may not be marked closed, accepted or released. Pushing commit 1 alone publishes this state to the Lovable-connected branch (`AGENTS.md`). Q10 asks whether to push commits 1 and 2 together; that is recommended. Commit 2 contains no open *M1* vulnerability. What remains after it is the recorded limitations of §23.15, which by M1-D11 are outside M1's fix scope.

**M1 may be marked closed only when all of the following hold:**

1. Commits 1–3 have landed and been approved.
2. V1, V2, V3 and the non-finite wallet paths are closed, and I1–I10 are proven by the §23.7 tests, including the V2 block.
3. The affected U2/U3 expectations have been rewritten as sanctioned, and every other pin passes unchanged.
4. The owner's browser QA has passed.
5. Q1 is either decided or explicitly carried forward by the owner as open with its limitation recorded (M1-D10).
6. The §23.15 limitations are recorded in the closure entry.

*Amended (M1-D15, M1-D16, 2026-11-13).* Criterion 1 now reads: the M1 code has landed as the single integration commit of C4 (§23.18), approved and pushed. Further criteria:

7. W1–W9 are implemented, and I11 and I12 are proven by the final-reconciliation tests (§23.7).
8. Q8, Q9, Q12 and Q13 are decided. Q11 is decided or carried forward as open with its limitation recorded.
9. The numeric envelope of §23.19 is recorded in the closure entry.

### 23.15 Security boundary — recorded limitations (M1-D11, 2026-11-13; not fixed by M1)

From the read-only security boundary review (2026-11-13, against `8363b9f`; probes run outside the repository).

- **TM-M1** is the M1 model: an unmodified client on the normal UI, play money held in memory and reset on reload. No `localStorage`, `sessionStorage` or IndexedDB use was found.
- **TM-RT** is runtime JavaScript in one's own tab (devtools, an extension). In local-authority mode that is self-tampering, already accepted in TASK 001.
- **TM-P8** is the future server-authoritative network.

| ID | Limitation | Evidence | Class | What M1 does |
|---|---|---|---|---|
| V4 | **Public event emission.** `engine.events.emit` is public (`events.ts:59-62`; "engine-internal" only in a comment), and `session.engine` is exposed (`session.ts:75`). Any `betPlaced` or settlement event can be forged | Forged `betPlaced(0.01)` + `cashedOut(1e9)` → **+9,999,999.99**. A duplicate `betPlaced` debits twice | P1 (TM-P8); self-tampering in TM-RT | The settlement commit stops *non-finite* forged values only. Forged *finite* events still move money. No local guard authenticates events |
| V5 | **Live-reference aliasing.** `getPublicState().participant` and `.chests`, and the `chestsRevealed` payload, are the engine's own objects (`game-engine.ts:153-154`, `state-machine.ts:145-156`, `:340`). The driver's `sync` receives the live state (`driver.ts:74`) | Mutating a revealed chest's multiplier changes `finalMultiplier`: **+70,459,999** in one jackpot round. Production UI copies and freezes (`round-store.ts:71-113`) | P2 (API hygiene) | Nothing |
| V6 | **Snapshot restoration.** `restore()` is unvalidated (`state-machine.ts:382-395`, `simulation.ts:111-118`) and leaves the wallet out of sync in both directions (Q4 correction) | `jackpotMultiplier = NaN` → `finalMultiplier = NaN` | P1 (network snapshots) / P2 (wallet not in snapshot, L3) | Non-finite values are stopped at the wallet. Finite injected state and desynchronization remain. No production caller |
| V7 | **Unvalidated authority outputs.** The engine applies any multiplier the `RoundAuthority` returns: NaN, ±Infinity, negative or out of range (`state-machine.ts:289`, `:316`, `:335`) | Read from the code | P1 (TM-P8) | Non-finite values are stopped at the wallet. Negative values: Q9. A multiplier contract is a future engine change, not E-X2 |
| — | `snapshot()` exposes `crashAt` during the dive | Probe | P1 (known §14 split) | Nothing |
| — | `engine.advance(NaN)` freezes the engine permanently | Probe: 0 ticks afterwards | P2 (availability, no money) | Nothing |
| — | **Future network trust boundary (Phase 8).** Needed: a server-authoritative wallet; a deterministic `betId` or `participantId` on `betPlaced`, `cashedOut` and `chestPicked` (snapshot schema v3); an authoritative payout in minor units; and a capability split (subscribe-only `events`, private emitter) or server signing | — | Phase 8 / M2 | Nothing. The integer payout of §23.13 is designed to carry over |
| — | Dev hot-reload (HMR) session teardown | **Unverified** | P2 | Nothing |

**Boundary statement.** The wallet's guards are *local consistency tripwires*. They keep the wallet's own ledger finite and exclusive, and they do not establish where an event came from. The engine's acceptance rule (E-X2) protects the command edge for every caller. Nothing in M1 protects the event edge against forged finite events. That boundary belongs to Phase 8.

### 23.16 Payout calculation — four meanings of a multiplier (M1-D13 approved policy; implementation PROPOSED; parts OPEN)

**Approved (M1-D13):**

- a stake is whole cents;
- the payout is computed from the accepted stake and the authoritative settlement multiplier;
- the payout is rounded down to a whole cent;
- the payout never exceeds the intended amount;
- the binary float product is not a monetary result.

Everything else in this subsection is a proposal, or is marked OPEN.

**Four values that must not be confused:**

| # | Meaning | Example | Role in settlement |
|---|---|---|---|
| 1 | **Canonical decimal** of a finite `number`: its shortest round-trip decimal, `String(x)` | `1.15` → "1.15"; a cashout multiplier → "2.339646851925991" | **The value settlement computes with (proposed).** Below 2^46 a canonical cent value reads back as exactly its two decimals |
| 2 | **Exact binary value** of the double | `1.15` = 1.149999999999999911182158029987… | Never a monetary value. Used only in test oracles, to bound the difference from meaning 1 |
| 3 | **Displayed multiplier**: `formatMultiplier` / `toFixed(2)`, round to nearest (`src/game/presentation.ts:6-8`, `AbyssAnchor.tsx:158`, `:185`, `:198`, `:217`) | a live 1.4951 shows "1.50×" | Presentation only. Never an input to settlement. It may sit up to 0.005 above the authoritative value |
| 4 | **Authoritative settlement multiplier**: the `number` in the settlement event | below | **The only multiplier a payout may use** |

The authoritative multiplier per path (verified at `8363b9f`):

- **Cashout:** `cashedOut.multiplier` = `sim.multiplier` on the tick the command applies (`state-machine.ts:239-242`). It is unrounded, and it is not the value displayed when the button was clicked (existing behavior, D4).
- **Jackpot auto-cash:** `shipImpact.jackpotMultiplier`. It has two decimals and lies in [50, 500] (`outcomes.ts:34-41`).
- **Chest:** `chestPicked.finalMultiplier` = `+(jackpot × chest).toFixed(2)` (`state-machine.ts:267`). The engine rounds this product **to the nearest** cent of a multiplier. That rounding is part of outcome generation: M1-D13 does not change it, and it is not V2. It does not depend on the stake, so it gives no stake-size edge, and it is applied before any money is computed. The wallet must use `finalMultiplier` as emitted, and must **never** recompute `jackpot × chestMultiplier`.

**Intended amount.** `payoutCents = ⌊100 · s̄ · m̄⌋`, where `s̄` is the canonical decimal of the accepted stake (`roundBet`, locked from `betPlaced`) and `m̄` is the canonical decimal of the authoritative multiplier.

*How meanings 1 and 2 relate.* `|m̄ − m| ≤ ulp(m)/2 ≤ m · 2^-53`. So while `s · m < 2^53 / 100` (≈ 9.0 × 10^13 units), the two readings differ by at most one cent. They differ at all only when a whole cent lies between `s · m_binary` and `s̄ · m̄`:

- For two-decimal multipliers this happens on purpose: `1 × 1.15` gives 1.15 under meaning 1 and 1.14 under meaning 2. Meaning 1 is correct.
- For unrounded cashout multipliers it was measured never to happen: 139,212 samples (every tick 1–1289, boosts 0–0.4 in steps of 0.05, 12 stakes from 0.01 to 123,456.78) gave 0 differences.

**OPEN (Q8a):** the owner confirms meaning 1 as "intended" for unrounded multipliers.

**Proposed algorithm.** This refines §23.13. It is one function, used by cashout, jackpot, the chest total and `potentialWin`:

1. **Preconditions.** The stake is a valid stake (I1), and the multiplier passes W7 (§23.17). Otherwise nothing is computed and the event is refused (I11).
2. **Decompose.** Each operand is decomposed from `String(x)` against the grammar `digits[.digits][e±digits]` into `(N: BigInt, e: integer)`. Any other string (`NaN`, `Infinity`, a sign) is refused, never coerced. The decomposition is exact for every finite nonnegative double.
3. **Multiply.** `payoutCents = N_s · N_m · 10^(e_s + e_m + 2)`, using BigInt truncating division when the exponent is negative. That equals rounding down for nonnegative operands.
4. **Convert.** `payout = Number(payoutCents) / 100`. This is the canonical cent double, and so exact in the cent domain, **only while `payoutCents < 100 · 2^46`** (≈ 7.04 × 10^15 cents, below 2^53). Outside that range:
   - `Number(BigInt)` rounds to the nearest double and can round **up**: 2^53 + 3 cents becomes 2^53 + 4;
   - from about 1.8 × 10^306 units, `Number(payoutCents)` is `Infinity` even though the payout itself is finite (`Number.MAX_VALUE × 1` was measured to give `Infinity`).

   W7 refuses a non-finite result. What to do above the cent envelope is **OPEN** (Q11, §23.19).
5. **Chest.** `T = ⌊100 · s̄ · f̄⌋` for the final multiplier. The delta is `T − J`, where `J` is the jackpot payout **recorded** when it was credited (W6). The wallet never re-derives `J` from a mutable `jackpotMultiplier` (H2). If `T < J`, the event is refused (H5). Under the local authority, `final ≥ jackpot`, so `T ≥ J`.

**Probe results** (2026-11-13; scratch script run outside the repository, Node 24; not part of the suite):

| Case | Proposed (1) | Binary (2) | Today `toFixed` | `Math.floor(s·m·100)/100` |
|---|---|---|---|---|
| 0.01 × 1.5000 | 0.01 | 0.01 | 0.01 | 0.01 |
| 0.01 × 1.5014 | 0.01 | 0.01 | **0.02** | 0.01 |
| 0.01 × 2.4999 | 0.02 | 0.02 | 0.02 | 0.02 |
| 0.29 × 1 | 0.29 | 0.28 | 0.29 | **0.28** |
| 0.29 × 2 | 0.58 | 0.57 | 0.58 | **0.57** |
| 1 × 1.15 | 1.15 | 1.14 | 1.15 | **1.14** |
| Jackpot 0.29 × 100.57 | 29.16 | — | **29.17** | 29.16 |
| Jackpot 10 × 499.99 | 4999.90 | — | 4999.90 | **4999.89** |
| Jackpot 33.33 × 57.29 | 1909.47 | 1909.47 | **1909.48** | 1909.47 |
| Chest 0.01 · (50.01 → 50.51) | delta 0.00 | — | **0.01** | — |
| Chest 0.29 · (57.29 → 65.88) | delta 2.49 | — | **2.50** | — |
| Chest 0.01 · (500 → 25,000) | delta 245.00 | — | 245.00 | — |
| Grid `k/100 × M/100`, 1,802,000 pairs | 0 mismatches | — | — | — |
| 1e21 × 1 | `Number(c)/100` = 999999999999999900000 — not `1e21`; outside the envelope | — | — | — |
| `MAX_VALUE` × 1 | conversion → `Infinity`, refused by W7 | — | — | — |

**Wallet and UI consistency (proposed):**

- **Wallet.** It credits the converted payout through the unchanged `+(balance + x).toFixed(2)` update, which is exact below 2^44 (I4). For the chest, it records `J` (in cents) when the jackpot is credited.
- **`potentialWin`** (`AbyssAnchor.tsx:105`) calls the same function with `(roundBet, live multiplier)`. It is the payout at the last synced tick. The credit uses the multiplier of the tick on which the cashout applies (D4), so the two can differ. The label never uses a different rounding rule.
- **`lastWin.amount` and the SECURED label** read the wallet's value. **The balance display** `toFixed(2)` is exact for a canonical cent balance below 2^44.
- **The multiplier labels** (meaning 3) are unchanged. They are presentation and may round up. Changing them is Q8c, recommended for U6.

**OPEN:** Q8a (meaning 1 for unrounded multipliers), Q8b (approval of this function), Q8c (display), Q11 (the envelope). No exactness is claimed outside §23.19's envelope.

### 23.17 Invalid multipliers and wallet-side integrity (M1-D14, M1-D15 approved policy; rules W1–W9 PROPOSED)

**Is zero ever a legitimate settlement multiplier?** No. Verified at `8363b9f`:

| Path | Authoritative multiplier | Range under `LocalRoundAuthority` | Can it be 0? |
|---|---|---|---|
| Cashout | `cashedOut.multiplier` | `multiplierAt(t) = exp(0.085·t) ≥ 1` for `t ≥ 0`, plus a boost ≥ 0 (`multiplier.ts:10-14`) | No |
| Jackpot | `shipImpact.jackpotMultiplier` | [50, 500], two decimals | No |
| Chest | `chestPicked.finalMultiplier` | jackpot × chest, chest ∈ [1, 50] → ≥ 50 | No |
| Crash | `crashed.multiplier` | {1.0} ∪ [1.01, 200]; written to history only, never credited | Not a settlement |
| Loss / spectator | — | Expressed by the *absence* of a credit, never by a 0 multiplier | — |

So a zero multiplier on a settlement event means something upstream is broken. Under W7 it is refused like any other invalid value. It is not paid as zero, and it is not turned into a recorded 0.00 win (M1-D14). Positive values below 1 are not produced either. Refusing them would put a game rule into the wallet, so that stays open (Q9b) and belongs to the engine multiplier contract (V7).

**Six wallet holes found while verifying M1-D15** (code reading at `8363b9f`; none was exploited in the repository):

| ID | Hole | Evidence | Reached by |
|---|---|---|---|
| H1 | `diveStarted` clears `hasCashed`, `settledBy` and `chestSettled`, so a repeated `diveStarted` re-opens a settled participation, and a second `cashedOut` credits again | `wallet-store.ts:155-157`, guard at `:164`. **Pinned as U2 behavior** by `wallet-store.test.ts:221-228` ("diveStarted clears hasCashed") | Duplicate or forged events. The engine emits one `diveStarted` per round |
| H2 | The `shipImpact` else-branch overwrites `jackpotMultiplier` after a jackpot credit. `chestPicked` derives the already-credited jackpot from it, so a second `shipImpact` (jackpot 1) followed by final 500 credits 100s + 499s = 599s instead of 500s | `:196-200`, `:216-219` | Duplicate or forged `shipImpact` |
| H3 | `betPlaced` is unguarded: a duplicate debits twice, and a sub-cent or non-finite amount debits 0 or poisons the balance | `:143-153` (cases 5 and 6) | Engine before E-X2; forged events |
| H4 | An over-balance `betPlaced` drives the balance negative | `:150` (L2) | Non-UI `engine.submit` |
| H5 | `chestPicked` with `final < jackpot` gives a negative delta — a "credit" that debits | `:219-221` | Injected authority, restore, forged events |
| H6 | Settlement events are not checked against the participation's round, so an event carrying another `roundId` pays the current participation | `:159-226` (payload `roundId` unused) | Forged or stale events |

**Five identity notions, kept apart:**

| | Concept | Today | Enough for M1? | Beyond M1 |
|---|---|---|---|---|
| A | **Event idempotency:** applying an event twice has the effect of applying it once | Partial. Exclusivity guards exist, but H1, H2 and H3 break them | **Yes, with the existing payloads**, through W2, W4, W5 and W6, keyed by `roundId` | — |
| B | **Event authenticity:** the event came from the engine (later, the server) | **None.** `EventBus.emit` is public (V4) | **No, and M1 does not claim it.** No wallet rule can establish where an event came from | Phase 8: a server-authoritative wallet, a private emitter or capability split, or signing. Each is an engine/API change |
| C | **Round identity** | `roundId` on every payload (`events.ts:22-41`), +1 per round (`state-machine.ts:348`). Round 1 starts without `bettingOpened`. Unique only within one engine instance; monotonic only without `restore()` (`:384`) | Yes, for one local session (Q13) | Session and server scoping in Phase 8 |
| D | **Bet identity** | No `betId`. The engine holds one participant per round, so `(session, roundId)` identifies the bet | Yes, for single-player local M1 | `betId` / `participantId` on `betPlaced`, `cashedOut` and `chestPicked` (snapshot schema v3): **an engine event and snapshot change, which needs its own owner-approved freeze exception. Not E-X2, not M1** |
| E | **Settlement identity** | No `settlementId`. Derivable as `(roundId, path)` for path ∈ {cashout, jackpot, chest}; the engine emits each at most once per round | Yes, if the wallet records it per `roundId` (W5) | A server `settlementId` (Phase 8) |

**Proposed wallet rules for M1** (settlement layer only — `src/ui/store/wallet-store.ts`; no engine change):

| Rule | Behavior | Closes | Safe in the normal flow (K1)? |
|---|---|---|---|
| W1 | `betPlaced` is refused unless its amount is a valid stake (the shared predicate) | H3 (sub-cent, non-finite); no sub-cent debit | Only **after** E-X2: it is the same function as the engine's |
| W2 | `betPlaced` is refused while already participating | H3 (duplicate debit), case 6 | Yes: the engine emits ≤ 1 per round |
| W3 | `betPlaced` is refused if amount > balance | H4 | Unreachable in the normal flow (F2). For non-UI callers it yields case 3 — no money moves — instead of a negative balance. **Needs approval (Q12)** |
| W4 | A participation is bound to `betPlaced.roundId`. `cashedOut`, `shipImpact` and `chestPicked` apply only when their `roundId` matches | H6 | Yes: the engine settles only its own round |
| W5 | The settlement record (roundId, `settledBy`, recorded jackpot cents `J`, `chestSettled`) is cleared only by a `bettingOpened` whose `roundId` differs from the participation's. `diveStarted` no longer clears the settlement state of the same round | H1 | Yes: the engine clears per round. **Sanctioned rewrite** of the U2 pin `wallet-store.test.ts:221-228` |
| W6 | Chest delta = `T − J`, with `J` recorded at the jackpot credit. Refused if `T < J` | H2, H5 | Yes: under the local authority, `final ≥ jackpot` |
| W7 | Every settlement multiplier must be a `number`, finite and > 0. The computed payout, delta and resulting balance must be finite and ≥ 0. Otherwise the event is refused | M1-D14, I10 | Yes: the local authority's outputs satisfy it |
| W8 | Atomic: validate and compute everything first, then make one snapshot write. A refusal writes no financial field (I11). It is not a zero credit, and it adds no history entry, no `lastWin` and no flash | M1-D14 | Yes |
| W9 | Every refusal emits a development diagnostic (mechanism chosen with the code; no user-facing text, Q6). A refusal is evidence that I8 was already broken upstream; it never repairs it | — | Yes |

**A refused settlement and the participation (OPEN, Q9c).**

- Option (i) leaves the participation open. If the engine itself emitted the invalid multiplier (an injected authority), the engine already treats the participant as cashed out, and a later `shipImpact` would then pay a jackpot the engine never awarded.
- Option (ii) records a **non-financial** fault marker, so no later event of that round may pay the participation. With forged events, (ii) only lets a self-tamperer forfeit their own credit.

Recommended: (ii). Under W8 the marker is the only state a refusal may write. Is it a "partial mutation"? It touches no financial field, but the owner decides. The earlier §23.14 wording, "the participation is marked settled", is clarified by this: it means a fault marker, not a settlement of zero.

*Status (owner, 2026-11-14): (ii) approved in principle and implemented as rule **W10** in `src/ui/store/wallet-store.ts`.*

- **Trigger.** A W6 or W7 refusal of a `cashedOut`, `shipImpact` or `chestPicked` event of the participation's own round, while that event could pay the participation.
- **Not a trigger.** W4 (foreign round), spectators, and participations that are already settled.
- **Effect.** A private fault record holds `roundId`, stake, event, rule, reason and payload. It is not part of the snapshot. Each later settlement event of that round is refused as W10, and its W9 report carries the original fault.
- **What it never does.** It writes no snapshot, moves no money, and applies no refund or forfeiture. The stake stays debited, exactly as it would without the marker.
- **Clearing.** The fault is cleared with the rest of the settlement record: by a `bettingOpened` of a different round, or by the next accepted `betPlaced`.
- **OPEN.** The resolution policy, including how the fault record is kept after the round ends.

*Status (owner decision R2, 2026-11-14): implemented.* This supersedes the clearing rule above for the audit record. The round's *active* marker is still cleared as described.

- **Unresolved claims.** Every fault is also appended, frozen, to a session-lifetime list, read through `wallet.unresolvedClaims()`, oldest first. A claim records `roundId`, `stake`, `creditedCents` (exact cents already credited to that participation: the recorded jackpot payout `J` for a chest fault, otherwise 0), and the faulting event, rule, reason and payload. A round reset never clears the list. The returned list and each claim are frozen, so the read surface cannot alter them.
- **No duplicate credit.** Within the round, W10 refuses every later settlement event. After the round, a late event of the faulted round reaches either a wallet that is not participating, which pays nothing, or a new participation of another round, which W4 refuses. Each faulted participation produces exactly one claim, and a repeated invalid event is a W10 refusal, not a second claim. *(W11 exception, §23.21: a jackpot withheld under W11 gets at most one follow-up claim for its chest delta.)*
- **Not a loss.** The faulted round's `crashed` adds no loss entry to the history strip. The claim is the round's record. Other rounds' losses are recorded as before.
- **Money.** No refund, no forfeiture, and nothing resolves a claim. The stake stays debited.
- **Limits.** The list lives in memory and is lost on a page reload, like the rest of the wallet (§23.12, case 10). It is a local-demo record, not a dispute system, and it does not authenticate events (M1-D11). Under `restore()`, a new participation can reuse a claimed `roundId` (Q13). Claims do not block it, because it is a new, separately debited bet.
- **Display (unchanged, recorded).** After a faulted cashout, the engine treats the participant as cashed out, but the wallet does not. During the rest of the dive the button can still show CASH OUT, and a click is rejected by the engine (`commandRejected`), which moves no money. Unreachable with the local authority. A user-facing state is U6 work.

Tests: `wallet-store.test.ts`, "W10" and "R2".

**Are the existing payloads enough?** For A, C, D and E, within one local single-player session: **yes**. Every payload carries `roundId`, and W2 to W6 need nothing more. For B (authenticity), multi-participant bet identity and server settlement identity: **no**. Those need event identifiers, a private emitter, restore validation or a multiplier contract. Each of them is an engine change that **needs its own owner-approved freeze exception**; none is part of E-X2 or M1.

**What remains until the server-authoritative phase (Phase 8):**

- Forged finite events for a fresh `roundId` still move money (V4).
- Restore can desynchronize the wallet (V6).
- Live-reference aliasing remains (V5).
- Authority outputs are unbounded (V7).
- Affordability cannot be enforced by the engine (L2; W3 only fails safe).

W1–W9 make the wallet's own ledger idempotent, finite, nonnegative and atomic. They do not make it trustworthy against a modified client (L5).

**Amendment for Dual Bet (E-X3, owner-approved 2026-11-14; implemented in `be10b19`).** This is the M1 rule amendment that the Dual Bet decision required (docs/16). It does not reopen or close M1.

- Every per-round field and every rule W1–W11 applies **per bet slot**. Each slot has its own locked bet, settlement record, W10 fault marker and W11 withheld-chest flag. A fault in one slot never blocks or alters the other (per-slot fault isolation).
- **W2** becomes per slot: a second `betPlaced` is refused only for a slot that already participates. The engine emits at most one per slot per round.
- **W3** checks the balance left after the other slot's debit.
- A `betPlaced` or `cashedOut` without a valid slot is refused (W1, W4).
- Each slot's payout is rounded down separately, never on the combined stake (M1-D8, M1-D13 unchanged).
- `shipImpact` auto-settles every payable slot of its round. A valid `chestPicked` settles each jackpot-settled slot.
- `balance`, `history`, `lastWin` (the event's combined credit) and `unresolvedClaims()` stay shared. `WalletRefusal` and `SettlementFault` carry the slot they concern.
- Engine–wallet consistency (I8) for two slots relies on the session's in-flight reservation (§8). The engine still knows no balance.

### 23.18 Revised implementation and commit plan — C4 (M1-D16 approved policy; plan PROPOSED, no stage authorized)

**Why C3's publication model fails M1-D16.** V1, V2 and H1–H6 are independent, and all of them exist at `8363b9f`. Every proper subset of the M1 code change leaves at least one of them open. So any commit that holds only part of M1 is an unsafe state. Pushing such a commit — alone, or as part of a series pushed at once — puts that snapshot into the published history and into Lovable's synced history (`AGENTS.md`), even when the branch head is safe. M1-D16 forbids that, and it cannot be undone after a push, because published history is never rewritten.

| | **S1 — one atomic code commit** | **S2 — local series pushed together** | **S3 — local series, squashed locally, one push** |
|---|---|---|---|
| Unsafe snapshot published | None | **Yes**: the intermediate commits | None |
| Review granularity | One large diff | Per commit | Per commit locally; the final diff is identical to the series |
| E-X2 freeze audit | `git diff --stat <c>^ <c> -- src/engine src/shared` must equal the approved E-X2 list | Per commit | As S1 |
| Rollback after push | One `git revert` restores U5 behavior everywhere | Reverting a subset republishes an unsafe state, so everything must be reverted together | As S1 |
| History rewrite | None | None | Only local, **never-pushed** commits. Permitted, because `AGENTS.md` protects published history. It must never be done after any push |
| Verdict | Acceptable — **chosen by the owner 2026-11-14 (Q14)** | **Rejected under M1-D16** | Recommended at the time (Q14); not chosen |

*2026-11-14, owner decision Q14 = S1.* The steps below are kept as the plan of record. Under S1, step 3's local working commits L1–L3 are not created: the working tree is reviewed as a whole and becomes one commit. Step 5's squash and `git diff L3 <integration>` checks therefore do not apply. Every other gate stays. Staging, committing and pushing each need the owner's separate authorization.

**C4 — gates and steps:**

1. **G0.** The owner approves this M1-0 diff, then a separate docs-only commit. It contains no code.
2. **G1 — separate gates, none bundled into another:**
   - (a) **E-X2 implementation scope** — the gate that M1-D12 keeps closed;
   - (b) the bundling of the M1-1, settlement and wallet files into the integration commit (Q2);
   - (c) answers to Q1 (or carrying it forward), Q4, Q8, Q9, Q11, Q12, Q13 and Q14;
   - (d) authorization to start.
3. **Local working commits — never pushed.** Each one keeps the full suite green (K3):
   - **L1 — E-X2 + M1-1:** the shared predicate, the engine guard, the session edge and the action state, with their tests.
   - **L2 — settlement integrity:** the payout function (§23.16), `potentialWin`, W1–W9 and the sanctioned pin rewrites (§23.3 and W5), with their tests.
   - **L3 — M1-3:** the cross-cutting validation — the full §23.7 matrix, I1–I12, replay and the consistency cases.
4. **G2.** The owner reviews the cumulative diff and the results. Browser QA covers M1 together with the pending U4b and U5 QA, run on the local result.
5. **Integration.**
   - Squash L1–L3 into one commit (S3), or author it directly as S1.
   - Verify `git diff L3 <integration>` is empty.
   - Re-run every gate: tsc, the suite, lint against the baseline, the build, the freeze audit against the approved E-X2 list, and the protected `routeTree.gen.ts` hash.
   - Push **once**, with the owner's approval.
6. **Tracking.** Docs-only commit, after the push.

**Risk at each boundary:**

| Boundary | Where | V1 | V2 | H1–H6 and non-finite paths | §23.15 limitations | May be pushed? |
|---|---|---|---|---|---|---|
| `8363b9f` (today) | Already published | Open | Open | Open | Open | — (M1-D16 cannot retract it; it forbids adding new unsafe published states) |
| After L1 | Local only | Closed | **Open** | **Open** | Open | **No** |
| After L2 | Local only | Closed | Closed | Closed | Open | No: the whole has not been validated yet |
| After L3 + G2 | Integration commit | Proven | Proven | Proven | Recorded | **Yes**, as one commit |

Further risks: a local checkpoint mistakenly pushed (mitigation: no push before G2, and the push is a deliberate owner-approved step); a squash that changes the tree (mitigation: the empty `git diff` check); and a larger single review (mitigation: per-commit local review, plus the path-limited freeze audit). The vulnerability is declared closed only after the integration commit's automated suite, including the §23.7 final-reconciliation block, and the owner's browser QA have both passed.

Determinism and the freeze rules are unchanged:

- The engine changes only within the approved E-X2 list.
- Payout and wallet rules are settlement-layer code.
- The engine's events, state, snapshots and RNG draws are identical for valid inputs (I7).

### 23.19 Numeric safety envelope (analysis; Q1 and Q11 OPEN; M1-D10 reaffirmed)

| Quantity | Exact domain on the `number` wallet | Finite domain | Enforced today | M1 minimum safeguard (proposed) | Left for M2 / later |
|---|---|---|---|---|---|
| **Valid stake** | M1-D1 is decidable below 2^46 units (70,368,744,177,664). The debit is exact below 2^44 (§23.11) | Any finite value | The engine checks only `> 0`; the UI checks affordability | The E-X2 predicate and W1. **No ceiling** (Q1 OPEN; no product maximum, M1-D2) | A representability bound (T1), if the owner adopts one |
| **Wallet balance** | A canonical cent value below 2^44 (17,592,186,044,416), I4 | < `MAX_VALUE` | Nothing | W7: finite and ≥ 0 after every mutation, else refused. **Exactness above 2^44 is not guaranteed and not claimed** | An integer-cent ledger |
| **Payout** | Integer cents exact at **any** size (BigInt). The converted double is the canonical cent value below 2^46 units. `Number(c)` is exact below 2^53 cents and rounds to nearest above it (it can round up). `Number(c)/100` overflows above ≈ 1.8 × 10^306 units | Conversion finite below that | Nothing (float product, round to nearest) | W7 refuses a non-finite payout. Above 2^46 units: Q11 OPEN | An integer ledger; a server payout in minor units |
| **Authoritative multiplier** | Meaning 1 is exact as a decimal | Any finite value | Nothing (V7). Local authority: cashout < ≈ 6.61, jackpot ≤ 500, final ≤ 25,000 | W7: `number`, finite, > 0. **No upper bound** — that would be a multiplier contract, an engine change outside E-X2 | A named multiplier cap and a finiteness check on authority outputs |
| **BigInt ↔ `number`** | `number` → BigInt through `String(x)` decomposition is exact for every finite double. BigInt → `number` is exact only within the payout row's bounds. Mixing the two types in arithmetic throws (`TypeError`), so conversion happens in one helper | — | — | One conversion helper; tests at and beyond 2^44, 2^46, 2^53 cents, `1e21` and `MAX_VALUE` assert the documented behavior | — |
| **Overflow** | — | `s × m` overflow is avoided by BigInt. A balance overflow gives `Infinity` | Nothing | W7 refuses it | — |

**Honest-path reach.** From the default balance of 1,000, at most ×25,000 per round, the balance passes 2^44 only after at least **three** consecutive all-in rounds with near-maximal final multipliers. That is reachable in principle and negligible in practice. It is recorded, not bounded (M1-D10).

**What BigInt does not do.** Exact payout arithmetic removes the float error from the *product*. It does not make the ledger exact, because the balance stays a float, updated by `+(balance ± x).toFixed(2)`, which is exact only below 2^44. It does not stop a large payout losing cent resolution when converted, and it bounds nothing. I4 and I9's credited double therefore stay conditional on the envelope above. **No unlimited-value safety is claimed.**

**M1 minimum safeguards:**

- finite and nonnegative checks at every wallet mutation (W7), applied atomically (W8);
- one exact payout function, with one conversion helper;
- the envelope documented and tested as documented behavior;
- no new ceiling without the owner's approval.

**Left for M2:** an integer-cent ledger, with its own representation bounds and conversion at the display and input edges; settlement-safety bounds together with a multiplier contract (§23.11); and the server-authoritative wallet in Phase 8.

*2026-11-14: B-R (§23.9, §23.20) proposes moving the integer-cent **ledger** into M1, without the rest of M2.*

### 23.20 B-R — exact integer-cent ledger: consumer analysis and minimal design (owner decision Q1/Q11 = B-R in principle, 2026-11-14; design PROPOSED, NOT IMPLEMENTED)

**Why it is not implemented yet.** The owner made B-R conditional: any public API change, or any wider M2 migration, needs a minimal design approved first. The analysis below shows that one public change is unavoidable. The wallet's read surface (`WalletState`, `isAffordable`, the action-state input and the bet input's `double`) exposes the balance only as a `number`. Above 2^46 units no `number` can carry an exact cent balance. So without a new authoritative field, either some decision keeps using an inexact `number`, or some label misstates the amount. No part of B-R has been implemented. A partial version would let the button and the submit edge disagree (I3), so nothing was landed piecemeal.

**Consumers of `number` money values today** (verified in the working tree, 2026-11-14):

| # | Consumer | Kind | Exact today only below | Under B-R |
|---|---|---|---|---|
| 1 | Wallet `betPlaced`: W3 `amount > balance`, debit `+(balance − amount).toFixed(2)` (`wallet-store.ts`) | Decision + mutation | 2^44 units (I4) | `stakeCents > balanceCents`; `balanceCents − stakeCents` |
| 2 | Wallet credits: `credited()` = `+(balance + x).toFixed(2)` of `centsToAmount(payoutCents)` | Mutation | 2^44 (balance), 2^46 (payout) | `balanceCents + payoutCents`. No `number` conversion in the ledger, so Q11's representability limit disappears from settlement |
| 3 | `wallet.canAfford` / `canPlaceStake` → `isAffordable(amount, balance)` (session submit edge) | Decision | 2^46 | `stakeCents ≤ balanceCents` |
| 4 | `canPlaceBet` / `actionStateFor` → `isPlaceableStake(bet, wallet.balance)`; `ActionWalletInput` picks `balance` | Decision (PLACE BET) | 2^46 | The same cents predicate as #3, so I3 holds at every size. `ActionWalletInput` picks `balanceCents` |
| 5 | `betInput.double(balance)` = `Math.min(balance, +(b·2).toFixed(2))`; the caller passes `wallet.balance` (`AbyssAnchor.tsx`) | Edit value (not a decision) | 2^46 | Cap at the largest `number` whose exact decimal is ≤ the balance (rounding toward zero). Today a rounded-up `Number(balance)` can fill the field with an amount above the balance. PLACE BET would still refuse it (#4), so this is fail-closed, but the field is misleading |
| 6 | Balance label `balance.toFixed(2)` | Presentation | 2^46 (wrong digits above); exponent text from 10^21 | `formatCents(balanceCents)`: an exact decimal string from the BigInt |
| 7 | `lastWin.amount` → flash `+x.toFixed(2)`, SECURED label | Presentation | 2^46 | `LastWin` gains `cents: bigint`; labels use `formatCents` |
| 8 | `potentialWin = payoutAmount(roundBet, m)` → Potential and CASH OUT labels | Presentation | 2^46 | `payoutCents` + `formatCents`. It is never compared with anything |
| 9 | `roundBet`, `SettlementFault.stake`, event `amount` | A stake: an engine-accepted `number` | — (a stake's value is its canonical decimal, which `decimalOf` reads exactly at any size) | Unchanged type. The ledger derives `stakeCents` exactly. The engine and events are not touched |
| 10 | `SettlementFault.creditedCents` | Audit | Any | Already BigInt |
| 11 | Tests: the ledger pins on `balance`, the U5 D7 `isAffordable` pins, `money-oracle.ts` | Verification | — | The `balance` pins stay valid as presentation values below 2^46. Decision pins are rewritten for the cents predicate (sanctioned). New pins at 2^44, 2^46, 2^53 cents, 10^21 and beyond |

Not affected: the engine and `src/shared` (the engine never sees a balance, docs/06 §3); event payloads; the history strip (multipliers only); the notification store (it reads no amount); the round store; the stake predicate `isValidStake`.

**Minimal design, for approval:**

- **D1 — Authoritative field.** `WalletState` gains `balanceCents: bigint`, the only balance any decision or mutation reads. `balance: number` stays on the surface and is redefined as presentation only: `Number(balanceCents) / 100`, documented as possibly inexact above 2^46 units and never used for a decision. *Alternative:* remove `balance` entirely. That is stricter, but it rewrites many more tests and every consumer at once.
- **D2 — Predicates.** `isAffordable(amount: number, balanceCents: bigint)` and `isPlaceableStake(amount, balanceCents)` compare in integer cents, with the stake converted exactly through `decimalOf`. These are signature changes, and the U5 D7 pins are rewritten (sanctioned). `ActionWalletInput` picks `balanceCents` instead of `balance`.
- **D3 — Ledger.** The debit, credits, chest delta, W3 and W7 all run on `bigint`. W7 keeps "never below zero" and the multiplier checks. The finite-balance check becomes vacuous for a BigInt balance.
- **D4 — Labels.** One exact formatter, `formatCents(c: bigint): string`, used for the balance, the flash, SECURED, Potential and CASH OUT. Below 2^46 units its output is identical to today's `toFixed(2)` labels, so the 20 characterization pins are expected to stay unchanged. This is to be verified, not assumed.
- **D5 — `double`.** `betInput.double` receives the balance in cents and caps at the largest `number` that does not exceed it. Its arithmetic below 2^46 is unchanged.
- **D6 — `LastWin`** (`src/game/types.ts`) gains `cents: bigint`. `amount` stays as a presentation value.

**What D1–D6 deliberately leave out:** the engine; event payloads and the bet input's `number` type, both of which stay `number` (stakes keep the canonical-decimal meaning of §23.16); a stake ceiling (none, which is the point of B-R); and the server wallet. That is the "wider M2 migration" not proposed here.

**Remaining limitation after B-R (recorded, not a ceiling).** A stake is still a `number` command. Above 2^46 units, not every cent amount can be *staked*, because only the doubles that exist there can be typed. A *balance* or *win* of any size is still held, credited and displayed exactly.

**Decisions needed from the owner to start B-R:**

1. Approve D1 (keep `balance` as presentation only) or the alternative (remove it).
2. Approve the signature changes in D2 and D5, the `LastWin` change in D6, and the sanctioned rewrite of the U5 D7 affordability pins.
3. Confirm that D5's rounding toward zero for the `double` cap is acceptable. It changes only the edit value, never a stake or a balance.

No financial policy is open inside B-R beyond these. Rounding of payouts (down) and stakes (rejected, never rounded) is already decided.

*2026-11-14, roadmap return: B-R is deferred to M2 (§23.10). This design is kept unchanged as M2 input. M1 closes without it only through §23.21.*

### 23.21 M1 closure without B-R — the numeric precision boundary (2026-11-14; rule W11 APPROVED AND IMPLEMENTED, uncommitted)

**Status (owner, final M1 authorization, 2026-11-14): W11 approved and implemented.** This block supersedes the proposal below where they differ; the proposal is kept as the record.

- **Rule.** Every credit (cashout payout, jackpot payout, chest delta) is decided by `exactCredit(balance, cents)` in `src/ui/store/payout.ts`, entirely in integer cents and before any lossy `number` conversion. The existing balance (converted exactly with `amountToCents`, through `String(x)`, never `x * 100`), the credit and the resulting balance must each be exact whole cents in `[0, BALANCE_LIMIT_CENTS)`, where `BALANCE_LIMIT_CENTS = 2^44 · 100` (exclusive). Only then is the result converted once, `Number(next) / 100`. That is exact, because `next < 2^51`. The old `credited()` (`+(balance + x).toFixed(2)`) is removed. The debit is unchanged.
- **Refusal (differs from the proposal).** The refusal is reported as rule **`W11`**, not W7, so a valid but unrepresentable win stays distinguishable from invalid settlement data (W6/W7) and from a loss. It faults the participation under W10. The R2 claim is extended minimally: an optional **`unpaidCents`** field holds the exact cents withheld. It is present only on W11 claims, so W6/W7 claims are unchanged. Nothing is applied, rounded or recorded as a loss. There is no flash, history entry, `lastWin` or settlement flag.
- **Chest after a withheld jackpot (new).** The engine still awards the chest. Its first `chestPicked` adds one follow-up W11 claim, with `event: "chestPicked"`, `creditedCents: 0` and `unpaidCents` = ⌊stake × final⌋ − the withheld jackpot. It credits nothing. The participation's unpaid total is the sum of its claims' `unpaidCents`. A repeated, invalid or below-jackpot chest result adds no claim and is refused as W10. *(Clarified 2026-11-14, wording only; the rule is unchanged: "first" means the first **valid** chest settlement, one whose total ⌊stake × final⌋ is computable and not below the withheld jackpot. Only that event creates the follow-up claim. An invalid chest event creates no claim and does not use up the follow-up. A later valid chest settlement can therefore still create it, once. The engine emits `chestPicked` once per round, so in normal play the first chest event is also the first valid one.)*
- **Consistency.**
  - The engine settles each round exactly once. Later events of a W11 round are W10 refusals.
  - The round's `crashed` adds no loss entry.
  - I8 (participant ⇔ participating, `roundBet` = `betAmount`) holds throughout.
  - The invariant *balance < 2^44* now holds after every mutation.
  - The display limitation recorded under R2 (CASH OUT still shown after a faulted cashout) applies unchanged.
- **Tests.**
  - `payout.test.ts`, "W11": below, at and above 2^44, the existing balance, exactness over 20,000 sampled sums, accumulation, and the §23.21 example.
  - `wallet-store.test.ts`, "W11": each path below, at and above; claims; follow-up chest claim; W10 repeats; no loss entry; distinguishable from W7.
  - `session.money.test.ts`, "W11 … real engine": a scripted authority lands a jackpot exactly on 2^44.
  - A mutation check (inclusive boundary, chest claim dropped, W11 reported as W7) was caught by the tests.
- **Still not done (by design).** No refund or resolution of claims (R2 stays a local-demo policy). No stake ceiling. B-R / the integer-cent ledger is M2.

**Owner direction (2026-11-14).** The M1 scope is frozen. B-R and the authoritative integer-cent ledger move to M2. The implemented protections stay as they are: E-X2, M1-1, the BigInt payout, W1–W10 and R2.

**Finding: the `number` ledger can silently apply a wrong credit.** Without B-R, every credit is `+(balance + win).toFixed(2)`. That is exact only inside the §23.19 envelope. Outside it, the result is finite and nonnegative, so W7 accepts it.

Measured 2026-11-14 on the current `credited()` formula, with canonical cent balances and `win = centsToAmount(payoutCents)`:

| Balance range | Sums tested | Wrong by one cent |
|---|---|---|
| below 2^44 units | 1,000,000 | 0 |
| [2^44, 2^45) | 400,000 | 0 |
| [2^45, 2^46) | 400,000 | **51,768 (≈13%)**: 28,840 too high, 22,928 too low |

For example, 41,543,552,609,738.77 + 654,447.59 is credited as …264,186.37, where the exact sum is …264,186.36. Exactness is **proven** only below 2^44 (I4, §23.11). The sample above 2^44 is evidence, not proof.

- The payout itself stays exact (BigInt). The error is in the ledger addition, and above 2^46 units also in `centsToAmount`.
- The honest path can reach it: from 1,000 at up to ×25,000 per round, it takes three consecutive near-maximal all-in rounds. That is negligible in practice but reachable.
- No wallet test covers a balance above 2^44.
- The result breaks M1-D13 (never above the intended amount) and the closure rule that a valid settlement never silently credits a wrong amount, rounds up or loses winnings.

**Conclusion.** M1 cannot be closed safely on today's ledger as it stands. It can be closed without B-R with one fail-closed rule.

**Proposed rule W11, an exact-ledger postcondition.**

- **Rule.** A credit is applied only if the resulting balance is below 2^44 units (17,592,186,044,416). In that domain the canonical-cent arithmetic is proven exact.
- **Why one check is enough.** The balance starts at 1,000 and a debit never raises it, so the invariant *balance < 2^44* holds after every mutation. Every stake is ≤ the balance (W3, affordability) and every payout is ≤ the resulting balance. So stakes, debits, payouts and labels all stay in the proven domain. That covers the stake predicate's decidability, I4 and `centsToAmount`.
- **On failure.** The credit is refused as W7 ("unrepresentable payout"), and the participation is faulted under W10 / R2:
  - the stake stays debited, and nothing is credited or partially applied;
  - nothing is recorded as a loss;
  - an unresolved claim is appended, and its exact payout can be recomputed with `payoutCents(stake, multiplier)` from the payload.
- **What it is not.** It is not a stake ceiling, a product maximum, a bet rejection or a rounding change. No bet is refused and no payout is reduced. It is a representability guard on the ledger, not a monetary policy. A valid settlement is then either credited exactly or kept as an auditable claim, never silently mis-credited.
- **Scope.**
  - One named constant and one condition in `credited()` in `src/ui/store/wallet-store.ts`, plus its comment.
  - Wallet tests:
    - a credit landing at 2^44 − 0.01 is accepted and exact;
    - one landing at or above 2^44 is refused, with the claim recorded, the balance unchanged and no loss entry;
    - the cashout, jackpot and chest paths are each covered.
  - No engine, `src/shared` or read-surface change. No frozen file is touched.
- **The owner decision it needs.** A win above the envelope becomes an R2 unresolved claim: held, not paid, until M2 or a resolution policy exists. R2 is the approved mechanism (Q9c), but it was approved for invalid settlement data, not for valid wins that cannot be represented. That extension is the open point, so W11 is not implemented.

**Alternatives.**

- Close M1 with the envelope as a documented, accepted limitation. Not recommended: it knowingly keeps a silent one-cent mis-credit, up or down.
- Bring B-R back into M1. The owner rejected this on 2026-11-14.

---

*This document is the single source of architectural truth for the UI layer. If a UI commit discovers a conflict between this document and reality, the commit stops and the document is corrected first (Master Rules: never guess).*
