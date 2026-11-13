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
| `session.ts` | U1, U2, U4a, U4b | `createGameSession` factory + production singleton; engine/driver construction; `attachCanvas(canvas)` (renderer per canvas mount, session survives remounts; synchronizes the round store once, then the driver's sync writes it per frame); owns the wallet store (V1) and the notification store (V2), each subscribed once at construction, and the round store (seeded at construction, no subscriptions); `submit(command)` — the component command edge, `placeBet` gated by `wallet.canAfford` |
| `store/store.ts` | U1 | `createStore` — the minimal external store primitive (§9); `ReadableStore` — the read half exposed by single-writer stores |
| `hooks/use-store.ts` | U1 | `useStore` — `useSyncExternalStore` binding with selector-level subscription (accepts any `ReadableStore`) |
| `store/wallet-store.ts` | U2 (`ad30d7a`; approved 2026-11-13) | Settlement layer — all money math (§10); sole writer is engine settlement events; read-only surface `get`/`subscribe`/`canAfford`/`onFlash` |
| `test/` (test-only) | U3 (`8e9b21b`) | DOM harness: scripted session (`scripted-session.ts`), `@/ui/session` replacement (`session-mock.ts`), `bootScreen()` + manual frame clock + semantic `outline()` (`dom-harness.tsx`). Used by the `*.test.tsx` pins (`screen.characterization.test.tsx`, `screen.remount.test.tsx`), which U6 must keep green against `GameScreen` |
| `store/round-store.ts` | U4b (implemented, awaiting owner review) | `EnginePublicState` mirror (§11, C6): participant copied, chests defensively copied, unchanged writes keep the snapshot (quiet frames notify nobody); frozen read-only surface `get`/`subscribe`; one writer, the driver's sync. Restores the chest picker (unpicked or revealed) after a remount during `bonus` |
| `store/notification-store.ts` | U4a (approved 2026-11-13) | Win flash + its timer (session-owned, consumes `wallet.onFlash`; injectable clock); dev-only `commandRejected` log + bounded history (§12). Dev banner deferred to U6 |
| `store/bet-input-store.ts` | U5 (pending) | Bet amount + stepper/quick-set logic (§9) |
| `components/`, `strings.ts` | U6–U7 (pending) | Component tree (§13), strings seam (§14), responsive layout (§15) |

Since U2, all money state and math live in the wallet store; the component
shell (`src/components/AbyssAnchor.tsx`) only reads it via `useStore` and
submits commands via `gameSession.submit`. Since U4a, the win flash and its
timer live in the session's notification store (triggered by
`wallet.onFlash`); the shell reads it via `useStore`. Since U4b, round and
bonus presentation (`phase`, countdown, multiplier, boost, eligibility,
`chests`, `chosenChestId`) is read from the session's round store; the
shell subscribes to no engine events and its mount effect only attaches
the canvas. The bet input stays component state until U5.

Running the tests on Windows: start Vitest from PowerShell with an
uppercase `C:\` working directory. From Git Bash (lowercase `c:\`) Vitest
fails every file — a pre-existing environment issue, not a test failure.
The DOM tests cover React remount and StrictMode in jsdom; a real-browser
remount has not been verified.
