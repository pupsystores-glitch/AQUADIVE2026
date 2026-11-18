# `src/fairness` — fairness cryptographic foundation (P8-3a, fv = 1 EXPERIMENTAL)

**Status: P8-3a, internal and experimental (2026-11-18). Accepted by the owner for local development with the limitations in §7, §9, §10 and §11 (docs/09 §38.1); not production fairness certification. Not frozen, not published, not activated, not connected to gameplay.** The owner authorized P8-3a only (seed chain and domain-separated derivation) with decisions D1 – D12 (docs/09 §38). **2026-11-18, P8-3b-0:** the owner authorized the secret lifecycle hardening R1 – R4 (§7) together with P8-3b (`SeededRoundAuthority`, distribution tests; a separate commit); the hardening is implemented and awaits the owner's acceptance. P8-3c (server crypto adapter, chain store) and every later milestone are **not** authorized. AQUADIVE is **PLAY-MONEY ONLY**.

This is a pure TypeScript module. Production files import only each other (relative `./*.ts`), never the engine, UI, rendering, audio, shared floor, protocol, zod, Fastify, Node built-ins or the DOM. Cryptography is injected. Nothing in the application or the server imports it, so it has no effect on the running game. It does not change the engine RNG, any probability, RTP, the wallet or settlement.

Relative imports carry an explicit `.ts` extension so that Node can run the module **unmodified** through its built-in type stripping (no build step). The tests rely on this to compare separate Node processes. The current P8-2 CommonJS server build (`tsc` 5.8.3) rejects these imports (TS5097). A discarded experiment with `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` compiled the module, with output identical to the type-stripped run. That configuration change is a **P8-3c proposal**; the server build is unchanged.

## 1. Files

| File            | Responsibility                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `version.ts`    | The fv = 1 scheme registry: version, field limits, purpose registry with hard draw limits, error codes, `FairnessError` |
| `encoding.ts`   | Canonical binary message encoding, its strict decoder, field validators, hex helpers                                    |
| `crypto.ts`     | The injected provider contract, output validation, known-answer self-test                                               |
| `secret.ts`     | `SecretBytes`, the redacting secret wrapper                                                                             |
| `chain.ts`      | Seed generation, reverse hash chain construction, link and sequence verification                                        |
| `derive.ts`     | `RoundDerivation`: validated per-round context, HMAC-SHA256 block derivation                                            |
| `seeded-rng.ts` | `SeededStream`: one purpose's stream with a hard draw limit; exact 52-bit unit values                                   |
| `vectors.ts`    | Public, non-secret fv = 1 development vectors                                                                           |
| `index.ts`      | The public surface                                                                                                      |
| `*.test.ts`     | Unit, vector, determinism and security tests                                                                            |
| `test/`         | Test-only helpers: node:crypto provider, pure-TypeScript SHA-256 / HMAC, child-process dump script                      |

## 2. Owner decisions applied (D1 – D12)

| #   | Decision                                                                                                               | As implemented                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Scheme A: pre-generated SHA-256 reverse hash chain with an explicit public-salt input; fixed salts in tests; no beacon | §4; the salt is an explicit 16 – 64 byte input; tests use the fixed phrases of `vectors.ts`. No drand, blockchain or other source. The real salt source is an **owner decision (open)** |
| D2  | Inputs fv, chain id, chain index, salt, purpose, per-purpose block counter; no DB round number; length-prefixed binary | §3                                                                                                                                                                                      |
| D3  | No per-round beacon                                                                                                    | None; **OPEN** before any public fairness-version freeze                                                                                                                                |
| D4  | Node.js 22 proposed reference major                                                                                    | Verified only on the installed Node 24.21.0 (§9). Node 22 not run. No cross-engine claim                                                                                                |
| D5  | OD-10b / E-X9 withdrawn                                                                                                | Engine facade untouched                                                                                                                                                                 |
| D6  | Engine, shared, rendering, UI, audio frozen                                                                            | No change there; checked by `security.test.ts`                                                                                                                                          |
| D7  | HMAC-SHA256; Class A p95 ≤ 5 ms (representative), Class B p99 ≤ 20 ms (maximum workload), both provisional             | §10; target observed, gate not verified                                                                                                                                                 |
| D8  | Fast deterministic tests; 10^5 / 10^6 distribution tests in P8-3b                                                      | No distribution test here                                                                                                                                                               |
| D9  | No server adapter or chain store                                                                                       | The node:crypto provider exists only under `test/`                                                                                                                                      |
| D10 | Selective voiding and cashout receipt honesty stay open                                                                | Not addressed; commitments alone do not solve them                                                                                                                                      |
| D11 | fv = 1 internal experimental; no public freeze; redesign not automatically fv = 2                                      | `FAIRNESS_STATUS = "experimental-internal"`                                                                                                                                             |
| D12 | No zod, no frame decoding, no endpoints, no protocol change                                                            | None                                                                                                                                                                                    |

## 3. Canonical message encoding (fv = 1, kind 0x01 stream block)

All integers are unsigned big-endian. Lengths are in bytes.

| Offset     | Size | Field                                                                   |
| ---------- | ---- | ----------------------------------------------------------------------- |
| 0          | 1    | tag length = 17                                                         |
| 1          | 17   | tag, ASCII `AQUADIVE-FAIRNESS`                                          |
| 18         | 1    | fv = 0x01                                                               |
| 19         | 1    | kind = 0x01 (stream block)                                              |
| 20         | 1    | chain id length = 32                                                    |
| 21         | 32   | chain id = terminating hash x_0                                         |
| 53         | 4    | chain index j, u32, 1 … 4,294,967,295                                   |
| 57         | 1    | salt length S, 16 … 64                                                  |
| 58         | S    | salt                                                                    |
| 58 + S     | 1    | purpose length P, 1 … 32                                                |
| 59 + S     | P    | purpose, ASCII, `^[a-z][a-z0-9-]*$`                                     |
| 59 + S + P | 4    | block counter, u32, 0 … 4,294,967,295 (further limited per purpose, §5) |

Total length 63 + S + P (80 … 159 bytes).

**No collisions.** The field order is fixed and every field is either fixed-width or carries a one-byte length prefix, so a byte string parses in at most one way. `decodeBlockMessage` is the strict inverse: it rejects a wrong tag, version or kind, out-of-range lengths, truncation and trailing bytes. The tests cover the classic collisions of naive concatenation (moving bytes between salt and purpose, swapping index and counter, purpose prefixes) and a seeded sweep of 4,000 near-colliding tuples.

**Rejection.** `encodeBlockMessage` validates every field before writing and never truncates, pads or coerces. Non-integers, negative values, values ≥ 2^32, `bigint`s, `NaN`, wrong byte lengths, non-ASCII or upper-case purposes, separators and NUL bytes throw `FairnessError` with a stable `code` (`unsupported-version`, `invalid-chain-id`, `invalid-chain-index`, `invalid-salt`, `invalid-purpose`, `invalid-counter`).

## 4. Hash chain (D1)

- Seed: x_N = 32 bytes from an injected `SecureRandomSource` (`generateChainSeed`). The source's buffer is copied into a `SecretBytes` and zeroed. Wrong types, lengths, exceptions and an all-zero result are rejected. There is no fallback source of any kind, and there is no `Math.random`.
- Links: x_i = SHA-256(x_(i+1)) for i = N − 1 … 0. **Chain id** = x_0 (public, never a round seed). Round j (1 … N) uses x_j.
- Direction: a revealed x_j verifies iff SHA-256(x_j) = x_(j−1) (`verifyChainLink`). The reverse direction fails.
- Sequences: `verifyRevealSequence` accepts exactly anchor + 1, anchor + 2, … (the default anchor is x_0) and reports `duplicate-index`, `missing-index`, `non-monotonic-index`, `index-out-of-range`, `malformed-seed`, `broken-link` or `malformed-commitment` with the position. Verification of untrusted data returns a result and never throws.
- `verifySeedAgainstCommitment` checks one x_j against x_0 with j hashes.
- `assertNextChainIndex(lastUsed, next, length)` is a pure check on caller-supplied state. **This module keeps no durable index:** an in-memory counter gives no uniqueness across a process restart. That requires persistence (P8-7).
- Limits: chain length 1 … 2^32 − 1. `computeRoundSeed` costs N − j hashes and is for development only. Checkpointed, encrypted storage is P8-3c / P8-7 (docs/09 §34.12 E3).

## 5. Derivation and streams

```
block(purpose, c) = HMAC-SHA256(key = x_j, msg = encode(fv, x_0, j, salt, purpose, c))
draw k of purpose = top52(word (k mod 4) of block(purpose, ⌊k / 4⌋)) / 2^52
```

- A block is read as four big-endian 64-bit words. A draw keeps the top 52 bits of its word: `hi32 · 2^20 + (lo32 >>> 12)`. The value is an integer below 2^52 divided by 2^52, which is exact in binary64. Every value lies in [0, 1 − 2^−52], so it is strictly below 1, uses only integer arithmetic, and is identical on every conforming engine.
- Each purpose has its own block counter starting at 0, so one purpose's draw count never shifts another's values.
- Hard per-round draw limits (fv = 1): **crash 2, jackpot 2, chests 6, world 2,048**. The first three equal the engine's exact draw counts (`sampleCrashPoint` 1 – 2, `sampleJackpot` 2, `rollBonusChests` 6). For `world`, the analytic bound is about 1,071 and the measured maximum 861 per round (3,000 natural and 3,000 forced-floor rounds of the real engine, `qa/p8-3-fairness/engine-draws`). The next draw after a limit throws `draw-limit-exceeded`, and so does every later one. A stream never wraps, repeats or falls back. Block counters above the limit are rejected the same way.
- `RoundDerivation.create` validates and copies all inputs once and prepares the HMAC key once. It rejects the terminating hash as a round seed. Each purpose's stream opens once per context (`purpose-already-open`). It does **not** check that the seed belongs to the chain; that is the chain verifier's job.
- `SeededStream.next(): number` has the shape of the engine's `Rng` contract without importing the engine. Wiring it into a `RoundAuthority` is P8-3b.
- Purposes: `crash`, `jackpot`, `chests`, `world`. Any other syntactically valid identifier throws `unknown-purpose`.

## 6. Injected cryptography

```ts
interface FairnessHashProvider {
  sha256(data: Uint8Array): Uint8Array;
  hmacSha256(key: Uint8Array): (message: Uint8Array) => Uint8Array; // copy the key if retained
}
interface SecureRandomSource {
  randomBytes(length: number): Uint8Array;
}
```

Every output is checked to be a 32-byte `Uint8Array` (`crypto-provider-failed` otherwise). `assertHashProviderKnownAnswers` runs FIPS 180-2 B.1, the empty-message digest and RFC 4231 test cases 1 – 2. The interface is synchronous. A future browser verifier would wrap async WebCrypto by precomputing the needed blocks. The key-prepared HMAC form exists because Node's `createHmac` with a raw key costs several times more per call than with a reused `KeyObject`.

## 7. Secret handling (defense in depth only)

`SecretBytes` holds its bytes in a private field. JSON, `String()`, template literals, concatenation, `util.inspect` and `util.format`, `Object.entries`, spreading, `Reflect.ownKeys`, `structuredClone` and error messages show `[redacted secret]` or nothing. Its constructor refuses use outside `fromBytes` at runtime too. `reveal()` returns a caller-owned copy, `equals` is constant-time, and `dispose()` zeroes the wrapper's own buffer. `RoundDerivation` serializes only its public fields; the stream zeroes each cached block when it moves on.

**Draw counts are secret before the reveal (P8-3b, D-B4).** `SeededStream.toJSON()` shows `drawsUsed`, and a draw count leaks outcome information (one crash draw means a 1.00× crash; the world count tracks the dive length). The method is unchanged for compatibility; a live stream must therefore never reach a public message, snapshot or log.

**Lifecycle hardening (P8-3b-0, owner decision D-B2; requirements R1 – R4).** No algorithm, encoding, domain separation, purpose, draw limit or output changed; the vector corpus and the full per-purpose dump are byte-identical before and after (docs/15).

| #   | Requirement                              | As implemented                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Clear temporary revealed HMAC key copies | `keyedHmac` zeroes the copy it hands the provider in `finally` (also when the provider throws); `RoundDerivation.create` zeroes its seed probe in `finally`. A provider must copy a key it keeps (contract, §6; node:crypto `createSecretKey` and the test-only reference HMAC do)                                                                                       |
| R2  | `RoundDerivation` disposal               | `dispose()` is idempotent: it drops the prepared HMAC function, zeroes the context's copies of the chain id and salt, and disposes every stream it opened. Afterwards `block`, `openStream` and `next()` on its streams throw `secret-disposed` (before any other check); `fv`, `chainIndex` and `toJSON()` stay available. `deriveBlock` disposes its temporary context |
| R3  | `SeededStream` disposal                  | `dispose()` is idempotent: it zeroes the cached block and drops the block source; later `next()` throws `secret-disposed` (also after exhaustion). `drawsUsed` stays readable to its owner                                                                                                                                                                               |
| R4  | Clear intermediate chain links           | The chain iteration zeroes each superseded link as soon as its successor exists (they are the seeds of later rounds); `computeRoundSeed` also zeroes the final link after wrapping it. Caller-supplied buffers (a revealed seed under verification) are never modified                                                                                                   |

Tests: `lifecycle.test.ts` (19 tests) observes the buffers the module hands out or allocates.

**Not protected:** memory inspection, heap snapshots, debuggers (browser devtools display private fields), copies made by `reveal()` or held by the crypto provider (for example, the OpenSSL key behind a `KeyObject`, which is released only when the garbage collector frees it), copies the JavaScript engine itself makes (strings, JIT spills, moved heap objects), a caller that never calls `dispose()`, and deliberate extraction. **Zeroing is best effort. JavaScript cannot guarantee that memory is wiped.**

**Still open (before production server integration):**

- Not retaining secret derived blocks longer than necessary is now bounded by `dispose()`; whether a caller disposes promptly is the caller's responsibility.
- Never log, transmit or persist unrevealed secret material (draw counts included, D-B4).
- Review secret handling in Node.js and in the future server crypto adapter (P8-3c), including `KeyObject` lifetime.

These are defense in depth. None of them makes memory erasure a guarantee.

## 8. Development vectors (`vectors.ts`)

They are public, non-secret and fixed. Each derives from an ASCII phrase (seed x_8 = SHA-256(phrase), chain length 8, salts A and B the same way). They cover the links x_0 … x_8, the canonical message, blocks for every purpose (including world block 511, the last one allowed), single-field variants (salt, index, chain id), the first draws of every purpose, and unit-conversion boundaries. **They are not a production chain and never a published commitment.**

## 9. Verification evidence (2026-11-18)

- Published vectors: SHA-256 (empty, FIPS 180-2 B.1, B.2, B.3 one million `a`, 896-bit) and HMAC-SHA256 RFC 4231 test cases 1 – 7, on node:crypto (OpenSSL 3.5.8) and on the test-only pure-TypeScript implementation.
- Independent implementations of the fairness derivation:
  1. this module on OpenSSL;
  2. this module on pure-TypeScript SHA-256 / HMAC;
  3. a separate spec-only re-implementation (`qa/p8-3-fairness/independent/spec-impl.mjs`, which imports nothing from here) on OpenSSL, which generated `vectors.ts`, and the same file on headless Chrome 157 WebCrypto (BoringSSL).

  All agree byte for byte. Caveat: one author wrote all of them. Chrome and Node are both V8, so this is **not** a cross-engine determinism result (WebKit and Firefox were not run).

- Independent executions: two separate Node processes running this source through type stripping produce byte-identical output, equal to the in-process result, covering every draw of every purpose for all 8 indices and both salts.
- Mutation check: 9 injected defects (byte order, missing length prefix, a 53rd bit, an off-by-one limit, reversed link direction, unbound index, removed redaction, `Math.random`, accepted all-zero random). Every one failed the suite.
- Runtime: Node 24.21.0 only. The proposed Node 22 reference major (D4) is **not verified by execution**. A Node 22 reference floor must be at least **22.18.0**, the first 22.x release that runs `.ts` files with default type stripping (`determinism.test.ts` spawns `node file.ts`). Production code uses only ECMAScript built-ins (`Uint8Array`, `DataView`, `Symbol`, private class fields), all present in Node 22. The test helpers use `node:crypto` APIs that also exist in Node 22.

## 10. Performance (D7, provisional; not a passed gate)

Workloads (`qa/p8-3-fairness/bench/bench.ts`). One round covers context creation, HMAC key preparation, one SHA-256 link check, opening four streams, and crash 2, jackpot 2 and chests 6 draws, plus:

- **W-floor-max** (the representative round): world 864 draws, 220 HMACs;
- **W-limit**: world 2,048 draws, 516 HMACs;
- **W-median**: world 360 draws, 94 HMACs.

Each run is 1,000 warm-up rounds, then 3 × 5,000 measured rounds with a fresh seed per round, on node:crypto with a `KeyObject` per round. Hardware: AMD Ryzen 5 5500U, 12 logical CPUs, Node 24.21.0. Conditions: **on battery, with the owner's `vite dev` running (≈ 1.3 cores)**. Results are recorded in docs/15 (P8-3a entry). They are reproducible across runs but were not taken under controlled conditions (AC power, idle machine). **The D7 gate is therefore not claimed as passed.**

Owner decisions at acceptance (2026-11-18, docs/09 §38.1). These are provisional engineering targets, not production-certified limits:

| Class                              | Workload                       | Target      | Observed (9 runs, uncontrolled) | Status                                 |
| ---------------------------------- | ------------------------------ | ----------- | ------------------------------- | -------------------------------------- |
| A — representative demanding round | ≈ 220 HMAC blocks              | p95 ≤ 5 ms  | p95 3.71 – 3.99 ms              | Target observed, gate **not verified** |
| B — maximum permitted workload     | world 2,048, ≈ 516 HMAC blocks | p99 ≤ 20 ms | p99 10.28 – 15.70 ms            | Target observed, gate **not verified** |

Verification needs a controlled benchmark on the chosen reference hardware.

**Event-loop rule.** Never run the full maximum-workload derivation inside a live 60 Hz game tick, a WebSocket message handler, the cashout receipt path or a time-critical betting / settlement barrier. An unavoidable synchronous slice on the live event loop targets p99 ≤ 2 ms (provisional). Prefer precomputation before live gameplay or a worker thread. The measured 64-block slice (p99 1.35 – 1.86 ms) is a benchmark example, not an approved scheduling granularity. This module implements neither strategy.

## 11. Limitations and open items

- The remaining secret-handling items (§7, "Still open"), controlled performance verification (§10) and the CommonJS server build of this source (P8-3c proposal) are open. R1 – R4 are implemented (P8-3b-0, awaiting the owner's acceptance).
- The public-salt source (D1), the fairness-version freeze (D11), the per-round beacon (D3), the Node reference version (D4), OD-5 world disclosure and OD-18 float determinism of the engine path are open.
- No `SeededRoundAuthority`, distribution test, verifier for a full round, server adapter, chain store, persistence, endpoint or message handler exists.
- Selective voiding and cashout receipt honesty (D10) are open high-priority risks; cryptographic commitments alone do not solve them.
- The zod advisory review (D12, S-1) stays open and separate. This module does not touch zod.
