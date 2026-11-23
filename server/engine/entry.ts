// Entry of the server's engine bundle (P8-4-0; export surface hardened in P8-4a). PLAY MONEY
// ONLY; OFFLINE DEVELOPMENT ONLY; not connected to the running server.
//
// scripts/build-engine.mjs bundles this file with rolldown into dist/engine/engine.cjs
// (CommonJS). Since P8-4a (owner decisions K1, K2) the bundle exports ONLY the sealed round
// runner (round-runner.ts): `runSeededRound`, its error class and its construction profile.
//
// - Deliberately not exported (K2): `GameEngine`, `SeededRound` and everything else of the
//   engine and the seeded-round binding. Both are still bundled, unchanged, as the runner's
//   internals; no engine, round, authority, stream or derivation object leaves the bundle. The
//   tests reach `GameEngine`, `SeededRound` and `LocalRoundAuthority` through TEST-ONLY bundles
//   of the same unchanged source, built in the tests' temporary directories and never shipped.
// - Never bundled or exported: `EngineDriver` (requestAnimationFrame), `createMathRandomRng`
//   (unseeded Math.random) and every rendering, UI, audio or browser module (the build refuses
//   any module outside its allow-list).
// - `@/fairness` is NOT bundled. The build keeps it external and points it at the server's own
//   compiled fairness module (dist/src/fairness/index.js), so the bundle and the server share one
//   fairness instance and `SeededRound.bind` accepts the server's `RoundDerivation`.
//
// This file and round-runner.ts are outside server/tsconfig.json (the engine's type closure
// needs the frontend's configuration); engine/tsconfig.json type-checks them. Only
// server/src/round/engine-runtime.ts loads the built bundle, and nothing in the application
// startup, the HTTP routes or the WebSocket gateway reaches that loader.

export { ROUND_RUNNER_PROFILE, RoundRunnerError, runSeededRound } from "./round-runner";
