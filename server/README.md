# `server/` — AQUADIVE backend skeleton (P8-2)

**Status: P8-2 skeleton, 2026-11-18. Accepted by the owner for local development only. Not production-ready. Not connected to the game. Play money only.** Security review: §11.

**P8-3c, 2026-11-19 (local development only; accepted for local development on 2026-11-23, committed locally, not pushed):** the package also compiles the shared fairness library and contains a node:crypto fairness adapter, a chain vault and a development-only in-memory chain store (`src/fairness.ts`, `src/fairness/`; §12). None of it is imported by the entrypoint, the HTTP routes or the WebSocket gateway: the running server behaves exactly as in P8-2.

A Fastify service with health endpoints and a WebSocket endpoint that performs the protocol v1 (DRAFT) `hello` → `welcome` handshake and nothing else. There is no round engine, no authentication, no wallet, no ledger, no database and no money. The running game does not talk to it: the frontend stays in local demo mode.

The owner authorized P8-2 as a narrowly scoped Phase 8 implementation exception (2026-11-18) while Phase 7 stays open. Design: `docs/09_BACKEND_ARCHITECTURE.md` §29 P8-2, §8.3–§8.4, §9.1, §9.5, §23.2, §23.4; owner decisions A–D: docs/09 §37.

## 1. What it does, and what it does not

| Does                                                                                                             | Does not                                                       |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /health/live`, `GET /health/ready`                                                                          | Run rounds, ticks, crashes, bonuses or any game state          |
| WebSocket `GET /ws`: Origin check, connection limits, hello timeout, frame-size and frame-rate limits, heartbeat | Authenticate anyone (`auth.resume` is refused)                 |
| `hello` → `welcome` with the negotiated protocol, a fresh connection id, the server time and 60 Hz               | Send a round snapshot (none exists) or private player state    |
| Refuse every other request with an `error` frame before processing                                               | Place, cash out, pick, settle, pay or store anything           |
| Close connections with documented codes; graceful shutdown                                                       | `sync.request` handling, `pong`, broadcasts (later milestones) |

## 2. Layout

| Path                                 | Responsibility                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/main.ts`                        | Executable entrypoint: environment → config, build, listen, signals                |
| `src/app.ts`                         | `buildApp(config)`: the Fastify instance without listening (used by tests)         |
| `src/config.ts`                      | Environment parsing and validation                                                 |
| `src/protocol.ts`                    | The only bridge to the shared protocol `../src/protocol` (public index only)       |
| `src/http/health.ts`                 | Health routes                                                                      |
| `src/http/error-handlers.ts`         | Fixed-body HTTP error and not-found handling                                       |
| `src/ops/logger.ts`                  | Fastify's built-in pino logger options: redaction, path-only request URLs          |
| `src/ops/readiness.ts`               | Ready / draining state                                                             |
| `src/ops/shutdown.ts`                | Graceful shutdown with a grace period                                              |
| `src/gateway/server.ts`              | Upgrade admission (draining, Origin, capacity) and connection wiring               |
| `src/gateway/connection.ts`          | One connection's lifecycle and frame pipeline                                      |
| `src/gateway/handshake.ts`           | `hello` → `welcome` (pure)                                                         |
| `src/gateway/request-policy.ts`      | The refusal code for each non-hello request                                        |
| `src/gateway/rate-limit.ts`          | Token bucket on a monotonic clock                                                  |
| `src/gateway/connection-registry.ts` | Live connections; total and per-address bounds                                     |
| `src/gateway/origin-policy.ts`       | Exact-match Origin allow-list                                                      |
| `src/gateway/close-codes.ts`         | WebSocket close codes used                                                         |
| `src/gateway/socket.ts`              | The typed subset of a `ws` socket the gateway uses (`ws` has no type declarations) |
| `src/fairness.ts`                    | P8-3c: the only bridge to the shared fairness library `../src/fairness/index.ts`   |
| `src/fairness/`                      | P8-3c: node:crypto adapter, chain vault, chain store, records, audit (§12)         |
| `test/`                              | Unit, real-socket integration, hostile-input, lifecycle and boundary tests         |
| `test/fairness/`                     | P8-3c: build equivalence, adapter, store, vault, failure, secret-handling tests    |

## 3. Commands (npm, inside `server/`)

```sh
npm ci                # clean install from package-lock.json
npm run typecheck     # tsc -p tsconfig.json (sources, tests, Vitest config)
npm test              # vitest run (server tests only)
npm run build         # clean, then tsc -p tsconfig.build.json → dist/
npm start             # node dist/server/src/main.js
npm run dev           # tsx watch src/main.ts
```

The root `package.json`, lockfiles, Vite, Vitest and TypeScript configurations are untouched; the root test suite and build ignore this folder.

## 4. Configuration (environment variables)

| Variable                              | Default                              | Range / rule                                                                    |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `AQUADIVE_SERVER_HOST`                | `127.0.0.1`                          | IP literal or `localhost`; **loopback only** unless the next variable is `true` |
| `AQUADIVE_SERVER_ALLOW_NON_LOOPBACK`  | `false`                              | `true` / `false`                                                                |
| `AQUADIVE_SERVER_PORT`                | `8790`                               | 0 – 65535 (0 = ephemeral)                                                       |
| `AQUADIVE_LOG_LEVEL`                  | `info`                               | `fatal` `error` `warn` `info` `debug` `trace` `silent`                          |
| `AQUADIVE_WS_ALLOWED_ORIGINS`         | _(empty: no browser origin allowed)_ | comma-separated canonical `http(s)://host[:port]` origins, exact match          |
| `AQUADIVE_WS_MAX_CONNECTIONS`         | `1000`                               | 1 – 100000                                                                      |
| `AQUADIVE_WS_MAX_CONNECTIONS_PER_IP`  | `32`                                 | 1 – 100000, ≤ the total                                                         |
| `AQUADIVE_WS_HELLO_TIMEOUT_MS`        | `5000`                               | 50 – 60000                                                                      |
| `AQUADIVE_WS_MESSAGE_RATE_PER_SECOND` | `30`                                 | 1 – 1000                                                                        |
| `AQUADIVE_WS_MESSAGE_BURST`           | `60`                                 | 1 – 10000, ≥ the rate                                                           |
| `AQUADIVE_WS_HEARTBEAT_INTERVAL_MS`   | `10000`                              | 50 – 300000                                                                     |
| `AQUADIVE_SHUTDOWN_GRACE_MS`          | `10000`                              | 0 – 120000                                                                      |

Integers must be canonical (`8790`, not `08790` or `8790.0`). An unknown `AQUADIVE_*` variable is an error. Invalid configuration exits with code 1 and one JSON line on stderr that names each variable and the kind of problem, **never the value**. The announced tick rate is fixed at 60 Hz (the engine's rate), not configurable.

Example (local development against a Vite dev server on port 5173):

```sh
AQUADIVE_WS_ALLOWED_ORIGINS=http://localhost:5173 npm run dev
```

## 5. HTTP

| Route               | Answer                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `GET /health/live`  | `200 {"status":"live"}`                                                                   |
| `GET /health/ready` | `200 {"status":"ready"}`; `503 {"status":"draining"}` once shutdown began                 |
| anything else       | `404 {"error":"not-found"}`; other failures `{"error":"<kind>"}` with no message or stack |

Every response has `cache-control: no-store` and `x-content-type-options: nosniff`. Request bodies are limited to 1 KiB (no route takes one), requests time out after 10 s, keep-alive after 5 s. "Ready" means only "accepts new WebSocket connections": there is no database or round to be ready for yet.

## 6. WebSocket `/ws`

### 6.1 Upgrade admission (HTTP, before any WebSocket exists)

| Condition                                                                   | Answer |
| --------------------------------------------------------------------------- | ------ |
| Draining                                                                    | `503`  |
| `Origin` header missing, repeated, `null`, or not exactly an allowed origin | `403`  |
| Total or per-address connection limit reached                               | `503`  |

The Origin check stops cross-site use of the socket from browsers. Any non-browser client can send any Origin, so it is **not authentication**.

### 6.2 Frame pipeline

Socket options: `maxPayload` = 4 KiB (the protocol's client frame limit), permessage-deflate off. Then, for every inbound frame (`src/gateway/connection.ts`):

| Step                                                                                                                                                         | Failure → answer, close code                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Size (by `ws`, from the frame header, before the body is buffered)                                                                                           | close `1009`                                                                                                      |
| Valid UTF-8 text, correctly masked frames (by `ws`)                                                                                                          | close `1007` / `1002`                                                                                             |
| Rate: token bucket, 30 / s, burst 60, **before decoding**                                                                                                    | `error rate-limited`, close `4008`                                                                                |
| Text frames only                                                                                                                                             | `error malformed`, close `1003`                                                                                   |
| `decodeClientFrame` (protocol library): size, UTF-8, nesting ≤ 6, JSON, `__proto__` / `constructor` / `prototype` keys, version, strict envelope and payload | `error <code>`: `protocol-unsupported` → `4001`; `frame-too-large` → `1009`; `malformed`, `unknown-type` → `1008` |
| Before the handshake, anything but `hello`                                                                                                                   | close `1008` ("hello required"), no frame                                                                         |
| `hello` with no common protocol major (`negotiateProtocol`)                                                                                                  | `error protocol-unsupported` (`re` = hello id), close `4001`                                                      |
| No `hello` within 5 s                                                                                                                                        | close `1008` ("hello timeout")                                                                                    |
| A second `hello`                                                                                                                                             | `error malformed`, close `1008`                                                                                   |
| Any other valid request after the handshake                                                                                                                  | refused, see 6.4; **the connection stays open**                                                                   |

A peer that does not answer a WebSocket ping within one heartbeat interval is disconnected. A closing socket that does not finish the close handshake within 2 s is destroyed. On shutdown every connection is closed with `1001`, and shutdown waits for them (bounded by the grace period).

### 6.3 The welcome

```jsonc
{
  "v": 1,
  "t": "welcome",
  "seq": 1,
  "ts": "<send time ms>",
  "re": "<hello id>",
  "p": {
    "protocol": 1,
    "sessionId": "<fresh UUID v4>",
    "serverTimeMs": "<build time ms>",
    "tickHz": 60,
  },
}
```

- `sessionId` identifies **this connection** only. No player, account or authenticated session exists.
- **No `snapshot`:** the server has no authoritative round to report (protocol amendment, `src/protocol/README.md` §20). Nothing is invented: no round id, number, commitment, phase or game state.
- **No `player`:** private state is never sent to an unauthenticated connection.
- A welcome without a snapshot authorizes no `bet.place`, `bet.cashout` or `bonus.pick`.

### 6.4 Refused requests

| Request                                  | Answer (`error`, `re` = the request id)                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `bet.place`, `bet.cashout`, `bonus.pick` | `auth-required` (money commands need an authenticated session; none can exist) |
| `auth.resume`, `sync.request`, `ping`    | `server-busy` (not available on this server yet)                               |

Both codes are registered as **transient**: refused before processing, not stored, the same id may be resent. Nothing is looked up, stored or forwarded. The protocol registry has no dedicated "not available" code; adding one would be a further protocol change (an owner decision, see §10).

**These are temporary P8-2 skeleton responses, not permanent contract behavior.** They describe this skeleton only. Each request type gets its real behavior in its own milestone (identity P8-8, resync P8-5 / P8-6, `ping` / `pong` with the client network mode). A client must not treat `server-busy` here as real load, or `auth-required` as the server's lasting answer to a money command. No network client may be built against this skeleton (§11.3).

## 7. Logging

Fastify's built-in pino logger (no separate dependency), JSON lines to stdout. Redacted: `authorization`, `cookie`, `sec-websocket-protocol` headers, and `ticket`, `token`, `password` fields at the top level or one level down. Request URLs are logged as the path only (no query string). The gateway never logs frame contents; it logs connection ids, close codes and decode failure codes with their safe `detail` (a schema path and issue kind, never input values). The logs include pino's default `pid` and `hostname`.

## 8. Dependency resolution (owner condition, Decision B)

The server consumes the original `../src/protocol` source; nothing is copied. Its bare `zod` import must resolve to **this package's** `zod` 3.25.76, never to the root's `node_modules`, and only one `zod` instance may load:

| Stage                      | How `zod` imported by `../src/protocol/*.ts` resolves                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type-check (`tsc`)         | `tsconfig.json` `paths.zod` → `./node_modules/zod` for every file                                                                                                                                                                                               |
| Build                      | `tsc -p tsconfig.build.json` emits CommonJS for the server **and** the protocol into `dist/` (`dist/server/src/**`, `dist/src/protocol/**`). Node's lookup from `dist/src/protocol/` walks up to `server/node_modules` before any directory outside the package |
| Run (`npm start`)          | as built: every bare import resolves inside `server/`                                                                                                                                                                                                           |
| Dev (`npm run dev`, `tsx`) | `tsx` applies `tsconfig.json` `paths`, so the protocol source gets `server/node_modules/zod`                                                                                                                                                                    |
| Tests (Vitest)             | `vitest.config.ts` `resolve.alias` pins `zod` to `server/node_modules/zod`                                                                                                                                                                                      |

CommonJS output keeps the protocol's extensionless relative imports valid at run time without touching the shared source. Verified in a clean temporary copy holding only the root `package.json`, `src/protocol/` and `server/` with no `node_modules` anywhere (P8-2 report: `npm ci`, type-check, build, 135 tests, a runtime probe listing one `zod` package root inside `server/node_modules`, and the built entrypoint serving health and a handshake). `test/boundaries.test.ts` re-checks the single instance on every run.

`dist/` is Git-ignored (the root `.gitignore` `dist` rule). The root ESLint configuration lints `server/` unchanged; its root-level `dist` ignore does not cover `server/dist/`, whose built files are linted with no finding.

## 9. Dependencies (owner Decision D; exact versions, `package-lock.json`)

| Package              | Version | Kind                                                                                                          |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `fastify`            | 5.12.8  | runtime (brings pino 10.4.0 as its logger)                                                                    |
| `@fastify/websocket` | 11.3.7  | runtime (brings `ws` 8.23.0)                                                                                  |
| `zod`                | 3.25.76 | runtime (the protocol's validator)                                                                            |
| `typescript`         | 5.8.3   | dev                                                                                                           |
| `tsx`                | 4.23.15 | dev (brings esbuild 0.28.2)                                                                                   |
| `vitest`             | 4.1.12  | dev (brings vite 8.3.8)                                                                                       |
| `@types/node`        | 22.20.1 | dev, type declarations only (needed for Node and Fastify types; not in the owner's list, see the P8-2 report) |

npm 11 reports that esbuild's `postinstall` script is not covered by `allowScripts` and skips it; `tsx` works without it (esbuild's platform binary comes from its optional dependency). No database, Redis, JWT, ORM, Docker, payment, wallet or round engine.

Vitest is 4.1.12 rather than the root's 4.1.10: 4.1.12 fixes two `@vitest/mocker` advisories (GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8) and stays within the approved 4.1.x. `npm audit` (2026-11-18) still reports:

- **`zod` 3.25.76 (production), GHSA-mrhx-c7xc-m3w5, high:** memory exhaustion while validating oversized collections; fixed only in zod ≥ 4.6.6, a breaking major the owner has not approved. Review: §11.1.
- **`picomatch` (dev only, via Vitest / Vite), high, ReDoS:** no patched release exists. Review: §11.2.

## 10. Limitations and open items

- Not production-ready: no TLS, no authentication, no metrics endpoint, no per-address connection-rate limit (docs/09 §9.5 "20 / min", only concurrent bounds here), no slow-consumer back-pressure, no load test (docs/09 §29's 5,000-connection target is not measured).
- Windows: `SIGTERM` cannot be delivered to a Node process, so graceful shutdown is tested in process (`createShutdown`); the `SIGINT` / `SIGTERM` handlers in `main.ts` are not exercised by the tests.
- Owner decisions: a dedicated "not available" error code instead of `server-busy` for `auth.resume` / `sync.request` / `ping`; the import rules of docs/09 §6.3 are enforced by a test, not a lint rule (the root ESLint configuration stays unchanged).
- Not done: physical-device testing, production load testing, any deployment.

## 11. Security review (P8-2 final acceptance, 2026-11-18)

Scope: the server as committed, for **local development only**. This review does **not** claim zero vulnerabilities or production security readiness. `npm audit` (2026-11-18): 6 high findings, of which **1 in production dependencies** (zod) and 5 dev-only packages that all trace back to one picomatch advisory.

### 11.1 zod 3.25.76: GHSA-mrhx-c7xc-m3w5 (high, CVSS 4.0 8.2, availability only)

| Item                       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advisory                   | zod array parsing records a validation issue for **every failing element**, with no cap or early stop. Memory and time grow with the number of failing elements; a large enough array can exhaust memory. Advisory range `< 4.6.6`; patched in 4.6.6 (zod 4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Affected dependency        | `zod` 3.25.76, a direct production dependency (the protocol's validator). The root application installs the same version; it does not use the protocol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Confirmed in 3.25.76       | Yes. Measured: `z.array(z.string())` on 2,047 failing elements → 2,047 issues; `.max(32)` does **not** stop it (2,048 issues). A `.max()` bound on an array is therefore no mitigation by itself                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Exploit preconditions here | An unauthenticated client would need a client→server schema that contains an array, and a frame large enough to hold many elements                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Existing mitigations       | (1) The client frame is capped at **4 KiB** before `JSON.parse` and validation (`ws` maxPayload, then the codec), so at most about 2,047 elements fit. (2) **No client→server schema contains an array, set, record or tuple**; arrays exist only in server→client schemas, which this server encodes from its own data. Measured: every hostile 4 KiB array frame (array as payload, as an unknown key, in a known field, as the envelope `t`, top-level, arrays of objects) is refused `malformed` after a **single** type issue, at about 90–370 µs per decode on this laptop (battery). (3) Strict schemas, nesting ≤ 6, prototype-key scan. (4) A token bucket per connection (30 / s, burst 60) applied before decoding, plus total and per-address connection bounds |
| Remaining risk             | Not zero. (a) A future client→server schema that adds an array becomes exposed up to the frame cap; the cap, not `.max()`, is the real bound. (b) The decode cost of hostile maximum-size frames (≈ 0.1–0.4 ms) times the allowed rate and connection count is CPU load that has not been load-tested. (c) A future network client using zod 3 to decode server frames with arrays (snapshots, feeds) is exposed to a hostile or impersonated server up to the server-frame cap                                                                                                                                                                                                                                                                                             |
| Future remediation options | (1) Upgrade to zod ≥ 4.6.6 (breaking; schema and codec review; a protocol-validation architecture decision). (2) Use the `zod/v4` engine shipped inside 3.x only if a release with the fix exists (to be verified). (3) Pre-validate array lengths before zod (structural scan in the codec). (4) Lower the frame cap for message types that need less. None is applied in P8-2 by owner direction                                                                                                                                                                                                                                                                                                                                                                          |
| Mandatory next review gate | **Before any client→server schema gains an array or collection field, before the frame cap is raised, and in any case before P8-3 or any later milestone starts.** Production exposure also needs a load test at the docs/09 §29 target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Probe: `qa/p8-2-server/final-2026-11-18/zod-advisory-probe.ts` (local QA evidence, Git-ignored).

### 11.2 picomatch 4.0.7: GHSA-fc5q-39xc-vjpf (high, ReDoS, dev only)

ReDoS through repeated single-branch extglobs, range `<= 4.0.7`; 4.0.7 is the latest release, so no patched version exists. It is installed only through dev tooling (Vitest 4.1.12, Vite 8.3.8, tinyglobby, fdir), never in the built server or its runtime dependencies (`npm audit --omit=dev` reports only zod). It evaluates only glob patterns from this package's own configuration, never network input. npm's suggested "fix" (Vitest 3.1.4) is a downgrade outside the approved 4.1.x and is not applied. Remaining risk: a hostile glob in project configuration, which is equivalent to code access. Review again when picomatch publishes a fix or when Vitest changes.

### 11.3 Refusal semantics (§6.4)

Verified on the built server against the protocol's own client decoder and `classifyRequestResponse`: each of the six refused request types returns exactly one `error` frame, with `re` = the request id, the next `seq`, payload `{ code, retryable: true }` only, and outcome **transient**. The connection stays open. Only `welcome` and `error` frames are ever sent. The refusal path is a static table lookup: no lookup, storage, forwarding, round, wallet, ledger or identity logic runs. The registry contract (`src/protocol/README.md` §9.1) makes these answers conservative: "this delivery was refused before processing; keep the request unsettled; resend only the same id". A client therefore never treats a refused bet as accepted or as finally rejected.

Limitations: `server-busy` is semantically imprecise (nothing is busy; the service does not exist yet). A well-behaved client following the contract will back off and retry indefinitely. This is harmless to the server (rate limit, connection bounds), but it is why **no network client may be built against this skeleton**. Before P8-6 each request type needs its real behavior, or the owner authorizes a dedicated code.

## 12. Fairness infrastructure (P8-3c, local development only)

**Status: delivered 2026-11-19; accepted for local development on 2026-11-23 (not production fairness certification); committed locally, not pushed. Not connected to the running server, the gateway or the game. Not production fairness. fv = 1 internal and experimental.** Owner decisions: `docs/09_BACKEND_ARCHITECTURE.md` §40. Local evidence: `qa/p8-3c-server-fairness/` (Git-ignored). Measurements: docs/15.

### 12.1 Build integration (P8-3c-0)

`tsconfig.json` adds `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` (owner-approved), so `tsc` compiles the shared fairness source unchanged: its explicit relative `.ts` imports are emitted as `./x.js` into `dist/src/fairness/`. `src/fairness.ts` is the only bridge: it re-exports a named list from `../../src/fairness/index.ts` (the public barrel), never a private module, never through `@/`. Neither option changes the output of extensionless imports: the 31 P8-2 output files are byte-identical; 20 files are added. `test/fairness/build.test.ts` builds the server into a temporary directory and checks the emitted specifiers, the single compiled copy, the unchanged `main.ts` closure, and that the compiled code loads no `.ts` file and reproduces the full development dump. `npm start` is unchanged and loads no fairness module.

### 12.2 node:crypto adapter (P8-3c-1)

`src/fairness/crypto-node.ts` implements the library's injected `FairnessHashProvider` (SHA-256; HMAC-SHA256 with the key prepared once per round as a `KeyObject`) and `SecureRandomSource` (`randomBytes`). `createNodeFairnessCrypto()` returns it only after `assertFairnessCryptoReady`: the published SHA-256 / HMAC-SHA256 known answers, the fv = 1 development vectors end to end (chain link, round seed, three derived blocks), the HMAC key-copy contract (the provider must not keep the caller's key buffer) and random-source sanity (type, length, not all zero, two draws differ). Failures throw `crypto-provider-failed` or `secure-random-failed`; there is no fallback and no `Math.random`. Every Node `Buffer` is copied into a plain `Uint8Array` and zeroed; the `KeyObject` exists only in the prepared closure.

### 12.3 Chain vault and development store (P8-3c-2)

| Module                  | Responsibility                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `errors.ts`             | `ChainError` with a closed code set; messages carry no secret                                                             |
| `checkpoints.ts`        | Checkpoint geometry: x_N and every multiple of the interval (default 1,024, provisional)                                  |
| `chain-store.ts`        | The `ChainStore` interface, chain states and transitions, dispositions, stated guarantees                                 |
| `memory-chain-store.ts` | **Development-only** in-memory store: refuses production; volatile, single-process, not transactional                     |
| `chain-vault.ts`        | The only owner of chain secrets: new-chain workflow, reservation, round keys, classification, verified reveal, precompute |
| `round-keys.ts`         | `RoundKeys`: the one `RoundDerivation` of a reserved index; disposal; public-only serialization                           |
| `reveal.ts`             | Verification of a revealed seed against the revealed chain, in yielding slices                                            |
| `records.ts`            | Allow-listed public records (commitment, status, reservation, disposition, reveal)                                        |
| `audit.ts`              | Allow-listed audit events; `MemoryAuditSink` (neither durable nor tamper-evident)                                         |

**Round lifecycle.** `createChain({ length })` draws a fresh secure seed and stores the checkpoints → `reserveRound(chainId, requestId)` → `prepareRound(chainId, index, salt)` returns `RoundKeys` (the caller disposes them) → `classifyRound(chainId, index, disposition, reasonCode)` → `revealRound(chainId, index)`. `precompute(chainId, from, count)` caches upcoming seeds ahead of time.

**Rules.**

- Reservation is monotonic and keyed by a request id: a retry returns the same index; an index is never released or reused.
- The public salt is bound to the index before derivation and never changes (`salt-conflict`): a failed preparation cannot be retried with another salt.
- A derivation is issued once per index (`derivation-already-issued`).
- Dispositions `completed` (needs an issued derivation), `aborted`, `voided` and `indeterminate` are evidence only, with reason codes and history; `indeterminate` may be resolved once; final values never change. No settlement or payout rule exists here.
- A reveal needs the round classified and every earlier reserved index classified or revealed, because revealing x_j discloses all earlier seeds (`reveal-order-violation`). Unreserved (future) indices cannot be revealed. A repeated reveal returns the same record; a reveal that fails verification or contradicts recorded data moves the chain to `compromised`.
- The store compares and records but never hashes; the vault verifies every link before it records a reveal.

**Chain states.**

| State                                            | Reserve | Derive | Reveal / read secrets | Explicit transitions to               |
| ------------------------------------------------ | ------- | ------ | --------------------- | ------------------------------------- |
| `active`                                         | yes     | yes    | yes                   | `suspended`, `retired`, `compromised` |
| `suspended`                                      | no      | no     | yes                   | `active`, `retired`, `compromised`    |
| `exhausted` (automatic, at the last reservation) | no      | yes    | yes                   | `retired`, `compromised`              |
| `retired`                                        | no      | no     | yes                   | `compromised`                         |
| `compromised`                                    | no      | no     | no                    | none                                  |

Classification is recorded in every state.

**Failures and restart.** Nothing is rolled back into a reusable state. A failure before a reservation reserves nothing. A failure after it (an ambiguous result) is retried with the same request id and receives the same index. A failure while preparing round secrets returns no keys; the salt stays bound and a same-salt retry succeeds. If an issued derivation cannot be delivered, its keys are disposed and the index must be classified. A failure during a reveal records nothing; the retry succeeds or replays. **After a process restart every earlier chain is `unknown-chain`**: the in-memory store cannot recover, does not pretend to, and a new chain needs the explicit `createChain` workflow. Durable recovery, cross-process uniqueness and encrypted checkpoints are P8-7 (recorded as `it.todo` contract requirements in `test/fairness/memory-chain-store.test.ts`).

**Production refusal.** `new MemoryChainStore({ mode })` requires `mode` `development` or `test` and refuses unless `NODE_ENV` is unset, `development` or `test`. Its `guarantees` state `durable`, `crossProcessIndexUniqueness`, `multiStepTransactions` and `productionUse` as `false`.

### 12.4 Secret handling (defense in depth)

Chain seeds, checkpoints and unrevealed round seeds exist only as `SecretBytes` or short-lived buffers that are zeroed after use. The vault, the store and `RoundKeys` serialize and inspect as redacted markers; records and audit events have fixed allow-listed fields with no free text; errors carry codes and public indices only. Tests render every object the vault produces (JSON, `String`, template literals, `util.inspect` with hidden fields, keys, error messages and stacks) and find no chain link before its reveal, and only the revealed links after it. Disposed secrets, disposed round keys, a disposed vault and a closed store refuse every later use. **Not protected:** memory inspection, heap snapshots, debuggers, the OpenSSL key behind a `KeyObject` (released by the garbage collector), engine-internal copies and deliberate extraction. Erasure is best effort.

### 12.5 Event loop and performance

Every hash walk (chain creation, precompute, seed reconstruction from a checkpoint, long reveal verification) runs in slices of at most 256 links and yields between slices. With precomputed seeds, preparing and revealing a round needs no hashing beyond the reveal's one-link check (p99 ≈ 0.2 – 0.3 ms measured). Measurements on battery with other load are **informational only; D7 stays NOT VERIFIED** (docs/15). The slice size (measured p99 ≈ 2.04 – 2.10 ms against the provisional 2 ms target) and the checkpoint interval are open tuning decisions. No scheduler, worker pool or background job exists.

### 12.6 Zod S-1: limited gate exception (owner, 2026-11-19)

§11.1 made the zod review a mandatory gate "before P8-3 or any later milestone starts". The owner granted a **narrow exception for this offline, development-only fairness infrastructure only**, conditional on: no new WebSocket handler, no new HTTP endpoint, no frontend network client, no untrusted protocol message decoding, no zod schema change, no expansion of production network exposure, and no connection to the live server lifecycle. P8-3c meets every condition: the fairness modules import neither zod nor the protocol (a source-rule test), the startup / HTTP / gateway import closure never reaches them (a boundary test), and the built entrypoint loads no fairness module (a run-time probe). No dependency changed. **S-1 is not resolved.** It remains mandatory before a new browser network client, before expanding the affected untrusted decoding paths, and before production readiness.

### 12.7 Limitations and open items

- Development only: no durable store, no encryption at rest, no KMS, no PostgreSQL or Redis, no tamper-evident audit, no cross-process index uniqueness (P8-7).
- No round orchestration, no `SeededRoundAuthority` binding, no `GameEngine` on the server, no endpoint, message handler, public commitment or verifier (P8-4 and later).
- Open: public salt source, fv = 1 freeze, Node 22 verification, controlled performance validation (D7), slice size and checkpoint interval, selective-voiding operations, Zod S-1.
