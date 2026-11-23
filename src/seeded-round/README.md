# `src/seeded-round` — seeded round authority (P8-3b, fv = 1 EXPERIMENTAL)

**Status: P8-3b, implemented on 2026-11-18 under the owner's authorization (decisions D-B1 – D-B10, docs/09 §39); accepted for local development on 2026-11-19 (not production fairness certification), committed locally, not pushed.** Not connected to the game, the server or any network. fv = 1 stays **internal and experimental**: not frozen, published or activated. P8-3c (server crypto adapter, chain store), P8-4 (round orchestrator, production RoundScript) and every later milestone are **not** authorized. AQUADIVE is **PLAY-MONEY ONLY**.

This module binds the P8-3a cryptographic streams (`src/fairness`) to the engine's existing `RoundAuthority` and `GameEngineDeps` contracts (`src/engine`). It is a separate layer (D-B1), so `src/fairness` stays engine-independent. It changes no engine file, probability, draw site, state-machine timing, payout, RTP or tuning. Nothing in the application or the running server imports it. Since P8-4-0 (engine build integration, local development only, not production activation; status and decisions in `server/README.md` §13 and docs/09 §41) the server's build bundles it, unchanged and through this public barrel only, from `server/engine/entry.ts` into `server/dist/engine/engine.cjs`. That bundle exists but the running server does not load it. Since P8-4a (offline RoundScript precomputation; `server/README.md` §14) the bundle exports only its sealed round runner, `server/engine/round-runner.ts`, which is the one server file that imports this barrel; nothing of this module is exported from the bundle (owner decisions D-1, K2). The runner obtains a round's authority and world stream only through `SeededRound.bind` and builds one fresh `GameEngine` from that round's `deps`.

## 1. Files

| File              | Responsibility                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `seeded-round.ts` | `SeededRound`: owns one `RoundDerivation`, opens its four purpose streams once, exposes `GameEngineDeps`, disposal |
| `authority.ts`    | `SeededRoundAuthority`: the engine's `RoundAuthority` over three existing `LocalRoundAuthority` instances          |
| `purpose-rng.ts`  | `PurposeRng`: one purpose stream as the engine's `Rng`; typed exhaustion; redacted serialization                   |
| `lifecycle.ts`    | `RoundLifecycle`: the shared live → failed → disposed state of one round                                           |
| `errors.ts`       | `SeededRoundError` and its closed set of codes                                                                     |
| `secrecy.ts`      | Redaction constants (the inspect hook, the shared redaction marker)                                                |
| `index.ts`        | The public surface                                                                                                 |
| `*.test.ts`       | Binding, replay, draw order, exhaustion, distributions, full-engine regression, dev chain, security                |
| `test/`           | Test-only: reference runner, development chain, independent vectors, replay pins, statistics helpers               |

## 2. Imports and boundaries (D-B1)

Production files import only `@/engine` (the public barrel), `@/fairness` (its public barrel) and each other. Tests use the same barrels plus the test-only node:crypto provider of `src/fairness/test/`. No private engine or fairness module is imported anywhere in this directory. `security.test.ts` enforces this, and `src/fairness/security.test.ts` was amended to allow exactly this module, through the barrel only.

## 3. Binding

```ts
const round = SeededRound.create(provider, { fv, chainId, chainIndex, salt, roundSeed });
const engine = new GameEngine(round.deps); // { authority, worldRng }: the existing GameEngineDeps
// … the engine runs unchanged …
round.dispose();
```

- **Four streams, each opened once.** `crash`, `jackpot` and `chests` back three `LocalRoundAuthority` instances (the engine's own outcome functions, unchanged); `world` is the engine's `worldRng`. Each purpose has its own block counter, so the crash point's 1 or 2 draws never shift any other value.
- **One derivation, one round.** `SeededRound.bind(derivation)` takes ownership. A disposed derivation, or one with any purpose already opened, is disposed and refused (`derivation-unusable`), so a seed and its derivation never back a second, financially distinct round.
- **One-time decisions in the engine's order (D-B9).** `sampleCrashPoint` → `sampleJackpot` → `rollBonusChests`, each at most once. A repeat throws `outcome-already-consumed`; a decision ahead of the engine's order throws `outcome-out-of-order`. Either fails the round. `LocalRoundAuthority` and the engine state machine are unchanged.
- **Exhaustion (D-B8).** Exceeding a purpose's hard draw limit (fv = 1: crash 2, jackpot 2, chests 6, world 2,048) throws `SeededRoundError("draw-limit-exceeded")` and fails the round. Nothing wraps, repeats or falls back to `Math.random`. Every later draw of any purpose throws `round-failed`. The engine that saw the error must be discarded. Automatic chain-index skipping and round voiding are **not** implemented (separate authorization).
- **Disposal.** `dispose()` is idempotent and disposes the derivation (P8-3b-0: zeroes the cached blocks and the context's input copies, drops the prepared key; best effort). Every later draw throws `round-disposed`.
- **No rewind.** `EngineSnapshot` holds no stream position, and `GameEngine.restore()` does not move a stream. A restored engine keeps drawing from where the stream is, so its continuation differs. Snapshot/restore is never used as an RNG rewind (`replay.test.ts`).

## 4. Confidentiality (D-B4)

Before the round's reveal, every outcome-relevant fact is **secret**: the seed and blocks, drawn values, outcomes, and **every purpose's draw count**. One crash draw means a 1.00× crash. The jackpot and chest counts say whether the floor was reached. The world count tracks the dive's length.

- Streams, the authority and the lifecycle live in private fields. `JSON.stringify`, `String()`, template literals, `util.inspect` / `util.format` and key enumeration show only public facts: `{ fv, chainIndex }` for a round, `{ purpose }` for a stream, the class name for the authority. That also holds when they sit inside a `GameEngine`.
- Draw counts are readable only through the explicitly named `secretDrawCounts()`, which is for the round's owner (an authority process, the reference runner, a post-reveal verifier). It is not a public API. Never put its result in a public message, snapshot or log before the reveal.
- `SeededRoundError` messages name the purpose or decision and public constants only (draw limits), never a seed, a value, an outcome or a live count.
- Not implemented here (out of scope): a reveal mechanism, public snapshots, broadcasting, endpoints, persistence, wallet or settlement.
- `src/fairness`'s `SeededStream.toJSON()` still shows `drawsUsed` (P8-3a behaviour, unchanged for compatibility). This module never lets a stream object escape.

Redaction is defense in depth. It does not protect against memory inspection or a caller that deliberately reads the secret accessor.

## 5. Reference runner (test only, D-B3)

`test/reference-runner.ts` plays one round on a **fresh real `GameEngine`** (public barrel) with a `SeededRound`'s deps. It runs in fixed 60 Hz ticks: `advance(1/60)`, checked to consume exactly one tick per call. There are no participants, commands, wallet, network or wall clock. It only observes events, projections and the final snapshot, and duplicates no engine logic. It stops at the terminal milestone:

- the tick that enters `crashed`; or
- the tick that enters `bonus`, where the engine rolls and reveals the chests. That is impact + 84 ticks (`SHIP_IMPACT_TO_CHESTS_MS`), the existing chest-generation timing.

It returns an authority record: outcome, crash point, dive-start / impact / terminal ticks, terminal multiplier, jackpot, chests, goldfish (id, x, depth, consumption tick), final world state with a creature hash, per-purpose draw counts, and a canonical SHA-256 over all of it. On any error it returns nothing, discards the engine and disposes the round. It is **not** a production API; production `RoundScript` construction is P8-4.

## 6. Development vectors (D-B10)

All seeds and salts used here are **public, non-secret development values**:

- the P8-3a chain (`FAIRNESS_DEV_VECTORS_V1`, 8 rounds × 2 salts);
- the P8-3b development chain (`test/dev-chain.ts`): seed = SHA-256 of a fixed phrase marked "PUBLIC, NOT SECRET", built once per test and checked against `createChainCommitment` / `computeRoundSeed` / `verifyRevealSequence`.

`test/independent-vectors.ts` holds the crash point, crash draw count, jackpot, chests and first two creatures of all 16 P8-3a rounds. It was generated by `qa/p8-3b-authority/independent/gen-outcome-vectors.mjs`, which imports nothing from `src/`. Blocks come from the P8-3a spec-only implementation; the outcome and creature formulas were transcribed from the engine source. `test/replay-pins.ts` pins the complete record hashes. Those pins are produced by the runner itself, so they are regression pins, not an independent oracle. No production chain is created or stored. fv = 1 is not frozen.

## 7. Tests

| File                        | Covers                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seeded-round.test.ts`      | Binding, stream wiring, purpose independence, one-time decisions and order, ownership and disposal, secret counts, no `Math.random`                                         |
| `replay.test.ts`            | Pinned record hashes; identical inputs → identical records; any replay order; independent vectors (outcomes, first creatures); snapshot/restore is not a rewind             |
| `draw-order.test.ts`        | Negative tests: swapped purpose streams, one shared outcome stream, reversed words, one-draw offset, wrong world order. Each fails the vectors                              |
| `exhaustion.test.ts`        | World limit 2,048 exactly, typed and deterministic failure, no wrap / reuse / fallback, failed round refuses everything, runner returns no partial record                   |
| `distribution.test.ts`      | 100,000 rounds: crash atoms, tail 0.9603 / x and goodness of fit; jackpot and chest bands, rounding edges and means; world uniformity (100,000 draws); purpose independence |
| `engine-regression.test.ts` | 600 real-engine rounds: draw-count invariants, terminal timing, crash cap, goldfish collision and appearance, coarse floor rate                                             |
| `dev-chain.test.ts`         | The development chain is a genuine fv = 1 chain                                                                                                                             |
| `security.test.ts`          | Import boundary, forbidden facilities, isolation from the app and the server, redaction, secret-accessor surface, error messages                                            |

The 100,000- and 1,000,000-round **full-engine** analyses run separately as QA (`qa/p8-3b-authority/analysis/`, Git-ignored; results in docs/15).

## 8. Limitations and open items

- Remaining secret-handling items: provider `KeyObject` lifetime, prompt disposal by callers, the P8-3c server review (`src/fairness/README.md` §7). JavaScript memory erasure is best effort, never a guarantee.
- Node 22.18+ is **not verified** (only Node 24.21.0 was run). The CommonJS server build is unchanged.
- No reveal mechanism, public salt source, fairness-version freeze, selective-voiding controls or production chain storage.
- The full-engine path is deterministic on one Node / V8 build. Cross-engine float determinism of `Math.exp` / `Math.pow` (docs/09 §16.9, OD-18) is untouched.
- Performance figures are informational (uncontrolled conditions); they say nothing about production server throughput. The D7 gate stays **not verified**.
- E-RISK-1 (the economy) is unchanged; nothing here makes the game suitable for real money.
