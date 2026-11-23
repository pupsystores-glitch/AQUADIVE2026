// Entry of the server's engine bundle (P8-4-0). PLAY MONEY ONLY; not connected.
//
// scripts/build-engine.mjs bundles this file with rolldown into dist/engine/engine.cjs
// (CommonJS). It re-exports a fixed list of runtime values from two public barrels only, never
// from a private module: the existing engine (`@/engine`) and the existing seeded-round binding
// (`@/seeded-round`). Their source is reused unchanged.
//
// - `@/fairness` is NOT bundled. The build keeps it external and points it at the server's own
//   compiled fairness module (dist/src/fairness/index.js), so the bundle and the server share one
//   fairness instance and `SeededRound.bind` accepts the server's `RoundDerivation`.
// - Type-only imports of the rendering layer are erased; no rendering, UI, audio or browser
//   module is bundled (the build refuses any module outside its allow-list).
// - Deliberately not exported: `EngineDriver` (requestAnimationFrame), `createMathRandomRng`
//   (unseeded Math.random), and (owner decision D-1) the two authority constructors
//   `LocalRoundAuthority` (draws outcomes from any stream it is given) and
//   `SeededRoundAuthority` (built only by SeededRound from a round's own purpose streams). A
//   server round obtains its authority and world stream only from `SeededRound.create` /
//   `SeededRound.bind` (`round.deps`). Both classes are still bundled, unchanged, as
//   SeededRound's internals; the tests reach LocalRoundAuthority through a TEST-ONLY bundle.
//
// This file is outside server/tsconfig.json (the engine's type closure needs the frontend's
// configuration); engine/tsconfig.json type-checks it. Nothing in server/src imports the bundle
// yet: round orchestration is P8-4a and later.

export { BET_SLOTS, ENGINE_STATE_TO_PHASE, GameEngine, SNAPSHOT_SCHEMA_VERSION } from "@/engine";
export { OUTCOME_DECISIONS, SeededRound, SeededRoundError } from "@/seeded-round";
