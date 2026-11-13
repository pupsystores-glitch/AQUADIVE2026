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
| `session.ts` | U1, U2 | `createGameSession` factory + production singleton; engine/driver construction; `attachCanvas` (renderer per canvas mount, session survives remounts); owns the wallet store, subscribed once at construction (V1); `submit(command)` — the component command edge, `placeBet` gated by `wallet.canAfford` |
| `store/store.ts` | U1 | `createStore` — the minimal external store primitive (§9); `ReadableStore` — the read half exposed by single-writer stores |
| `hooks/use-store.ts` | U1 | `useStore` — `useSyncExternalStore` binding with selector-level subscription (accepts any `ReadableStore`) |
| `store/wallet-store.ts` | U2 (`ad30d7a`; approved 2026-11-13) | Settlement layer — all money math (§10); sole writer is engine settlement events; read-only surface `get`/`subscribe`/`canAfford`/`onFlash` |
| `store/round-store.ts` | U4 (pending) | `EnginePublicState` mirror (§11) |
| `store/notification-store.ts` | U4 (pending) | Flashes + dev rejection surface (§12) |
| `store/bet-input-store.ts` | U5 (pending) | Bet amount + stepper/quick-set logic (§9) |
| `components/`, `strings.ts` | U6–U7 (pending) | Component tree (§13), strings seam (§14), responsive layout (§15) |

Since U2, all money state and math live in the wallet store; the component
shell (`src/components/AbyssAnchor.tsx`) only reads it via `useStore` and
submits commands via `gameSession.submit`. Until U4, the shell still owns
the per-frame HUD mirror (via `attachCanvas`'s sync-callback seam, replaced
by the round-store write), the win-flash timer (triggered by
`wallet.onFlash`, moving to the notification store), and the display-only
`chests` / `chosenChest` state (subscribed on `gameSession.engine.events`).
