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
| `session.ts` | U1 | `createGameSession` factory + production singleton; engine/driver construction; `attachCanvas` (renderer per canvas mount, session survives remounts) |
| `store/store.ts` | U1 | `createStore` — the minimal external store primitive (§9) |
| `hooks/use-store.ts` | U1 | `useStore` — `useSyncExternalStore` binding with selector-level subscription |
| `store/wallet-store.ts` | U2 (pending) | Settlement layer — all money math (§10) |
| `store/round-store.ts` | U4 (pending) | `EnginePublicState` mirror (§11) |
| `store/notification-store.ts` | U4 (pending) | Flashes + dev rejection surface (§12) |
| `store/bet-input-store.ts` | U5 (pending) | Bet amount + stepper/quick-set logic (§9) |
| `components/`, `strings.ts` | U6–U7 (pending) | Component tree (§13), strings seam (§14), responsive layout (§15) |

Until U2/U4, the settlement listeners and per-frame HUD mirror remain in
`src/components/AbyssAnchor.tsx`; `attachCanvas`'s sync-callback parameter
is that transition's seam and is replaced by the round-store write in U4.
