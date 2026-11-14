# src/ui — the UI layer

Contract: `docs/07_UI_ARCHITECTURE.md` (binding). Four layers with strictly
one-way flow: **session** (composition root) → **stores** (framework-free
state) → **components** (disposable views) → **strings** (localization seam).

Import rules (docs/07 §6): this layer imports only its own modules, the
engine facade (`@/engine`), `SceneRenderer` + contract types from
`src/rendering/scene-renderer`, `src/game`, `src/shared`, and the shadcn
primitives. Nothing outside `src/ui` ever imports from it except the route
and (mid-migration) the component shell.

Status — Sprint 4 in progress:

| Module | Landed | Contents |
|---|---|---|
| `session.ts` | U1, U2, U4a, U4b, U5 | `createGameSession` factory + production singleton; engine/driver construction; `attachCanvas(canvas)` (renderer per canvas mount, session survives remounts; synchronizes the round store once, then the driver's sync writes it per frame); owns the wallet store (V1) and the notification store (V2), each subscribed once at construction, the round store (seeded at construction, no subscriptions) and the bet-input store (U5, no subscriptions); `submit(command)` — the component command edge, `placeBet` gated by `wallet.canAfford` |
| `store/store.ts` | U1 | `createStore` — the minimal external store primitive (§9); `ReadableStore` — the read half exposed by single-writer stores |
| `hooks/use-store.ts` | U1 | `useStore` — `useSyncExternalStore` binding with selector-level subscription (accepts any `ReadableStore`) |
| `store/wallet-store.ts` | U2 (`ad30d7a`; approved 2026-11-13); U5 | Settlement layer — all money math (§10); sole writer is engine settlement events; read-only surface `get`/`subscribe`/`canAfford`/`onFlash`. U5: exports the pure `isAffordable(amount, balance)` that `canAfford` and the action state share (non-finite → false) |
| `test/` (test-only) | U3 (`8e9b21b`) | DOM harness: scripted session (`scripted-session.ts`), `@/ui/session` replacement (`session-mock.ts`), `bootScreen()` + manual frame clock + semantic `outline()` (`dom-harness.tsx`). Used by the `*.test.tsx` pins (`screen.characterization.test.tsx`, `screen.remount.test.tsx`), which U6 must keep green against `GameScreen` |
| `store/round-store.ts` | U4b (`bbdc134`; browser QA pending) | `EnginePublicState` mirror (§11, C6): participant copied, chests defensively copied, unchanged writes keep the snapshot (quiet frames notify nobody); frozen read-only surface `get`/`subscribe`; one writer, the driver's sync. Restores the chest picker (unpicked or revealed) after a remount during `bonus` |
| `store/notification-store.ts` | U4a (approved 2026-11-13) | Win flash + its timer (session-owned, consumes `wallet.onFlash`; injectable clock); dev-only `commandRejected` log + bounded history (§12). Dev banner deferred to U6 |
| `store/bet-input-store.ts` | U5 (implemented, awaiting owner review) | Bet amount, session-owned (starts at `DEFAULT_BET`, survives remounts); halve/double/quick-set/typed arithmetic verbatim; every write sanitized (non-finite → 0, negative → 0; a cleared field stays 0) (V4). Subscribes to nothing; `double` takes the balance as an argument |
| `components/action-state.ts` | U5 (implemented, awaiting owner review) | Pure `actionStateFor` / `canPlaceBet` (§13.3): the action-button matrix outside JSX, proven equal to the pre-U5 conditional; uses `BET_CUTOFF_SECONDS` (UI-only) and the wallet's `isAffordable` |
| `components/` (tree) | U6 (implemented, awaiting validation + owner review) | The §13 decomposition, markup verbatim from the shell: `GameScreen` (frame + composition; the route component), `TopBar`, `HistoryStrip`, `CanvasStage` (attach lifecycle), `MultiplierOverlay`, `CrashBanner`, `WinFlash`, `ChestPicker`, `BettingPanel` + `BetControls`/`QuickBets`/`ActionButton`, `icons.tsx`; per-slice `useStore` subscriptions (V3); the dev-only dismissible rejection banner (`DevRejectionBanner`, §12 C3, compiled out of production) |
| `strings.ts` | U6 (implemented, awaiting validation + owner review) | The §14 strings seam: every user-facing string, typed, functions where text interpolates values; text byte-identical. Money displays render via `formatMoney` (new, `src/game/presentation.ts`), multipliers via `formatMultiplier` — identical output, one definition each |
| responsive layout (§15) | U7 (pending) | Desktop breakpoint composition (V5) |

Since U2, all money state and math live in the wallet store; components
only read it via `useStore` and submit commands via `gameSession.submit`.
Since U4a, the win flash and its timer live in the session's notification
store (triggered by `wallet.onFlash`). Since U4b, round and bonus
presentation (`phase`, countdown, multiplier, boost, eligibility, `chests`,
`chosenChestId`) is read from the session's round store; components
subscribe to no engine events, and only `CanvasStage`'s mount effect
attaches the canvas. Since U5, the bet amount is the session's bet-input
store and the action button's state comes from the pure `actionStateFor`.
Since U6, the monolithic shell (`src/components/AbyssAnchor.tsx`) is
deleted: the route mounts `GameScreen`, each §13 component reads exactly
its own store slices (V3), and the only component-local `useState` is the
dev banner's dismissal.

Running the tests on Windows: start Vitest from PowerShell with an
uppercase `C:\` working directory. From Git Bash (lowercase `c:\`) Vitest
fails every file — a pre-existing environment issue, not a test failure.
The DOM tests cover React remount and StrictMode in jsdom; a real-browser
remount has not been verified.
