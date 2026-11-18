# `src/protocol` — AQUADIVE network protocol v1 (DRAFT)

**Status: DRAFT v1 (P8-1, 2026-11-18). Not released, not frozen, not consumed.** The owner authorized P8-1 as a narrowly scoped Phase 8 implementation exception while Phase 7 stays open, and provisionally approved P1-D1 … P1-D13 (docs/09 §35.2) for implementation as draft protocol v1. **None of OD-1 … OD-21 is decided by this library.** AQUADIVE is **PLAY-MONEY ONLY** (owner directive, 2026-11-18).

This is a pure TypeScript contract library. It imports only `zod` (v3 API, the installed 3.25.76) and itself. Nothing in the application imports it yet, so it has no effect on the running game. `index.ts` is the only public surface.

A protocol contract is not its runtime enforcement. **This library does not implement** authentication, sessions, rate limits, WebSocket networking, ordering, replay protection, idempotency storage, ledger transactions, cashout authority, settlement, provable fairness or the RTP fix. It defines and validates the frames that those later milestones will exchange (§16 lists who owns what).

## 1. Files

| File                         | Responsibility                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `version.ts`                 | `PROTOCOL_MAJOR = 1`, `PROTOCOL_STATUS = "draft"`, supported range, `negotiateProtocol`, close code 4001                  |
| `limits.ts`                  | Every size, depth, length and count limit                                                                                 |
| `ids.ts`                     | UUIDs, request ids, BIGINT-safe counters, round numbers, ticks, slots, chest ids, hex                                     |
| `money.ts`                   | Minor-unit amount strings, `parseMinor` / `formatMinor` (`bigint` only), currency codes                                   |
| `multiplier.ts`              | Canonical decimal strings: multipliers and presentation decimals                                                          |
| `errors.ts`                  | The append-only error-code registry (`stored`, `retryable`, `outcome`, `audience`, `carriers`), `classifyRequestResponse` |
| `envelope.ts`                | Client and server envelopes, `seq` rules, catalogue typing helpers                                                        |
| `messages/client.ts`         | Client → server catalogue (strict) and idempotency semantics                                                              |
| `messages/server-public.ts`  | Broadcast catalogue and the DTOs it shares with snapshots                                                                 |
| `messages/server-session.ts` | One-connection catalogue (responses and private state)                                                                    |
| `snapshot.ts`                | `PublicSnapshotV1` (phase-guarded) and `PlayerPrivateStateV1`                                                             |
| `codec.ts`                   | Never-throwing decoders and self-validating encoders for both directions                                                  |
| `test/golden-v1.ts`          | The golden-frame corpus (43 canonical frames, all 33 types)                                                               |
| `test/fuzz.ts`               | Seeded hostile-input generator (no dependency)                                                                            |
| `*.test.ts`                  | Format, message, snapshot, codec, compatibility and security tests                                                        |

## 2. Envelope (P1-D3)

One UTF-8 JSON object per frame.

```jsonc
// client → server: every frame carries a request id
{ "v": 1, "t": "bet.place", "id": "<uuid v4|v7>", "p": { … } }
// server → client
{ "v": 1, "t": "bet.accepted", "seq": 4, "ts": "1731940001200", "re": "<request id>", "p": { … } }
```

- `t`: `namespace.verb`, or a bare connection-level verb (`hello`, `ping`, `welcome`, `pong`, `error`).
- `id`: the client's request id, required on **every** client frame.
- `re`: the request id a response answers. Each server type states its rule: **required** (responses), **forbidden** (broadcasts and unsolicited messages) or **optional** (`error`). Payloads carry no request id.
- `seq`: per connection, `1` on the first server frame, then exactly `+1` (P1-D7).
- `ts`: server wall-clock ms as a decimal string. **Informational only**: never used for ordering, never trusted back.
- Canonical form: fields in schema order, no whitespace. Encoders always produce it; `encode(decode(frame)) === frame` for every canonical frame.

## 3. Audiences (P1-D5)

| Union                  | Audience                                           | Types                                                                                                      |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ClientMessage`        | client → server                                    | 7 request types                                                                                            |
| `PublicServerMessage`  | broadcast to every connection, spectators included | 12 types                                                                                                   |
| `SessionServerMessage` | one connection only                                | 14 types: `welcome`, `auth.ok`, `sync.snapshot`, `pong`, `error`, every `bet.*`, `bonus.pick*`, `wallet.*` |

`encodePublicServerFrame` (the broadcast path) accepts only `PublicServerMessageInput`: passing a session message is a **type error** (proved by `@ts-expect-error` lines that `tsc` checks) and is also refused at runtime. A cast can defeat a type, so P8-5's runtime allow-list builders (docs/09 §12.4) remain required.

## 4. Message catalogue (P1-D13)

### Client → server (strict: an unknown field anywhere rejects the frame)

| Type           | Payload                                                             | Answered by                                 |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `hello`        | `{ protocol: { min, max }, client: { build, platform } }`           | `welcome` / `error`                         |
| `auth.resume`  | `{ ticket }` (one-time WebSocket ticket, base64url, 22 – 256 chars) | `auth.ok` / `error`                         |
| `bet.place`    | `{ roundId, slot, amountMinor, currency }`                          | `bet.accepted` / `bet.rejected`             |
| `bet.cashout`  | `{ roundId, slot }`                                                 | `bet.cashedOut` / `bet.rejected`            |
| `bonus.pick`   | `{ roundId, chestId }`                                              | `bonus.pickAccepted` / `bonus.pickRejected` |
| `sync.request` | `{ lastSeq?, roundId? }`                                            | `sync.snapshot`                             |
| `ping`         | `{ clientTs }` (client's own clock, integer ms, echoed only)        | `pong`                                      |

No client schema contains a field that carries server authority (multiplier, payout, balance, tick, player or bet id, seed, crash, jackpot, chests; tested). **Not in v1:** bet cancellation (OD-19; addable as a new type), auto-cashout, chat.

### Public (broadcast; `re` forbidden)

| Type            | Payload                                                                                                                                                                                | Sent at                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `round.betting` | `{ roundId, roundNumber, commitment: { fv, chainIndex, hash }, closesAtServerMs, bettingMs }`                                                                                          | entry(betting)                  |
| `round.dive`    | `{ roundId, startServerMs }`                                                                                                                                                           | entry(diving)                   |
| `round.world`   | `{ roundId, fromTick, creatures: [{ id, kind, x, worldY, size, phase, dir }] }`                                                                                                        | ahead of need (W-A, OD-5)       |
| `round.sync`    | `{ roundId, tick, multiplier, boost, worldY }`                                                                                                                                         | uniform cadence while diving    |
| `round.boost`   | `{ roundId, tick, creatureId }`                                                                                                                                                        | goldfish consumed (server fact) |
| `round.crashed` | `{ roundId, tick, multiplier }`                                                                                                                                                        | entry(crashed)                  |
| `round.impact`  | `{ roundId, tick, jackpotMultiplier }`                                                                                                                                                 | entry(impact)                   |
| `round.bonus`   | `{ roundId, pickClosesAtServerMs, pickWindowMs }` — **no chest values**                                                                                                                | entry(bonus)                    |
| `round.chests`  | `{ roundId, chests: [m0, m1, m2] }`                                                                                                                                                    | when the pick window closes     |
| `round.ended`   | crash: `{ roundId, outcome, terminalTick, crashMultiplier, reveal: { serverSeed } }`; jackpot: `{ roundId, outcome, terminalTick, jackpotMultiplier, chests, reveal: { serverSeed } }` | after the settlement commits    |
| `feed.bets`     | `{ roundId, entries: [{ alias, slot, amountMinor, currency, cashoutMultiplier? }] }` (≤ 50)                                                                                            | batched                         |
| `server.notice` | `{ kind: "drain" \| "maintenance", retryAfterMs? }`                                                                                                                                    | before a planned shutdown       |

Creature ids are **server** ids (the engine restarts its ids per fresh engine, docs/09 §34.10 A4). `round.sync` and `round.world` carry what both client replica options of docs/09 §34.11 need.

### Session (one connection)

| Type                 | `re`     | Payload                                                                                                                                        |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome`            | required | `{ protocol, sessionId, serverTimeMs, tickHz, snapshot, player? }`                                                                             |
| `auth.ok`            | required | `{ player }`                                                                                                                                   |
| `sync.snapshot`      | required | `{ snapshot, player? }` — `player` for authenticated sessions (there is no replay buffer, so lost private acknowledgements are recovered here) |
| `pong`               | required | `{ clientTs, serverTimeMs }`                                                                                                                   |
| `bet.accepted`       | required | `{ betId, roundId, slot, amountMinor, currency, balanceMinor }`                                                                                |
| `bet.rejected`       | required | `{ roundId, slot, code }`                                                                                                                      |
| `bet.cashedOut`      | required | `{ betId, roundId, slot, tick, multiplier, payoutMinor, currency, balanceMinor }`                                                              |
| `bet.lost`           | —        | `{ betId, roundId, slot }`                                                                                                                     |
| `bet.jackpot`        | —        | `{ betId, roundId, slot, jackpotMultiplier, bonusEligible: true }`                                                                             |
| `bet.settled`        | —        | `{ betId, roundId, slot, finalMultiplier, payoutMinor, currency, balanceMinor }`                                                               |
| `bonus.pickAccepted` | required | `{ roundId, chestId }`                                                                                                                         |
| `bonus.pickRejected` | required | `{ roundId, code }`                                                                                                                            |
| `wallet.balance`     | —        | `{ balanceMinor, currency, ledgerSeq }`                                                                                                        |
| `error`              | optional | `{ code, retryable }`                                                                                                                          |

`bet.jackpot` + `bet.settled` encode the draft "one settlement per bet at bonus resolution" (OD-20, not decided).

## 5. Snapshots

`PublicSnapshotV1` (`schema: "public-snapshot"`, `v: 1`, its own version) is built from an allow-list, never from the engine's `EngineSnapshot` (which exposes `crashAt`). The phase decides which sections may exist:

| phase   | betting  | dive     | world    | crash    | impact   | bonus    | bonus.chests  |
| ------- | -------- | -------- | -------- | -------- | -------- | -------- | ------------- |
| betting | required | —        | —        | —        | —        | —        | —             |
| diving  | —        | required | optional | —        | —        | —        | —             |
| crashed | —        | optional | optional | required | —        | —        | —             |
| impact  | —        | optional | optional | —        | required | —        | —             |
| bonus   | —        | optional | optional | —        | required | required | **forbidden** |
| reveal  | —        | optional | optional | —        | required | required | required      |

No world data before the dive: disclosing the world at betting open is the rejected option W-C (docs/09 §16.7). `PlayerPrivateStateV1` = `{ currency, balanceMinor, ledgerSeq, round?: { roundId, bets (≤ 2, one per slot, by state open / cashedOut / lost / jackpotPending / jackpotSettled / voided), pick? }, pendingRequestIds (≤ 8) }`; it travels only in session messages.

## 6. Identifiers (P1-D6)

| Field                                            | Format                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `roundId`, `betId`, `sessionId`                  | lower-case canonical RFC 9562 UUID, any version (server-generated)             |
| request `id`, `re`                               | lower-case canonical UUID, **version 4 or 7 only**; ULIDs are not accepted     |
| `roundNumber`                                    | decimal string, 1 … 2^63 − 1 (fits `BIGINT`)                                   |
| `chainIndex`, `ledgerSeq`                        | decimal string, 0 … 2^63 − 1                                                   |
| `tick`, `fromTick`, `terminalTick`               | JSON integer 0 … 2^31 − 1, dive tick (0 = dive start)                          |
| `slot` / `chestId`                               | JSON integer 0 – 1 / 0 – 2                                                     |
| `creatureId`                                     | JSON integer 0 … 2^31 − 1, server id                                           |
| server times (`ts`, `*ServerMs`, `serverTimeMs`) | decimal string of ms, ≤ 16 digits; durations (`*Ms`) are JSON integers ≤ 1 day |
| `hash`, `serverSeed`                             | 64 lower-case hex digits                                                       |

## 7. Money (P1-D9)

Integer **minor units** as canonical decimal strings: digits only, no sign, no leading zero, no exponent, no whitespace, at most 18 digits (always fits PostgreSQL `BIGINT`). Stakes `^[1-9][0-9]{0,17}$`; balances, payouts and totals `^(0|[1-9][0-9]{0,17})$`. Converted with `parseMinor` / `formatMinor`, **`bigint` only**; money is never a JSON number or a float. Every amount travels with a currency code `^[A-Z][A-Z0-9]{2,7}$` (for example `AQC`, a play-money unit). The format implies no real-money semantics. Currency exponents (OD-15) are currency metadata outside v1.

## 8. Multipliers and decimals (P1-D10)

A wire decimal is the canonical string of an IEEE-754 double: what `String(x)` prints, the shortest decimal that round-trips. It is valid iff `String(Number(s)) === s`, `Number(s)` is finite and the value is in range. Multipliers also have **no exponent** and are **≥ 1**. `"1.50"`, `"1e0"`, `"NaN"`, `"Infinity"`, `"0.99"` are rejected; `"2.3"` is canonical, `"2.30"` is not.

- **Settlement consistency:** a settlement multiplier is the server's double written this way, the same decimal `src/ui/store/payout.ts` reads with `String(m)`. So `payoutMinor = ⌊stakeMinor × m̄⌋` is checkable from the wire, exactly, with `multiplierDecimal`. Cross-check against the real `payoutCents`: 1,000,000 random pairs, 0 mismatches; 20 of them are committed fixtures.
- **Format only:** the protocol exports no payout function and encodes no cap. Which value is paid and how it is rounded is **OD-7** (P-A / P-B / P-C). Two-decimal values (jackpot, chests, final) are valid as they are. The library does not change or fix the game's economics (E-RISK-1, docs/09 §34.1).
- **Floating point:** `Number(s)` and `String(x)` are exact inverses on canonical strings in every conforming engine, and nothing here does arithmetic on doubles. Values from `Math.exp` / `Math.pow` may differ across engines in the last bit (OD-18). The wire carries the server's value, so clients never recompute a settlement value. A double ≥ 10^21 would print with an exponent and is refused (unreachable: today's maximum is 25,000).
- **Presentation decimals** (`boost` ∈ [0, 1], `worldY`, creature `x`, `size`, `phase`) follow the same canonical rule in a stated range, and **may** carry an exponent where `String` prints one: boost decays towards 0 and can leave a residue such as `5.551115123125783e-17`.

## 9. Errors (P1-D11)

One lower-case kebab-case registry (`ERROR_CODES`), **append-only**; codes are never user-facing text (wording stays in `src/ui/strings.ts`). There is no `DUPLICATE_REQUEST`: a duplicate replays the original response.

| Code                                                                                                                                 | Origin | Stored | Retryable | Outcome       | Audience   | Carriers                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | --------- | ------------- | ---------- | ------------------------------------ |
| `not-in-betting`, `already-participating`, `invalid-amount`, `invalid-slot`, `not-diving`, `not-participating`, `already-cashed-out` | engine | yes    | no        | final         | request    | `bet.rejected`                       |
| `not-in-bonus`, `not-bonus-eligible`, `chest-already-picked`                                                                         | engine | yes    | no        | final         | request    | `bonus.pickRejected`                 |
| `round-mismatch`, `round-voided`                                                                                                     | server | yes    | no        | final         | request    | `bet.rejected`, `bonus.pickRejected` |
| `insufficient-funds`, `stake-limit`, `round-exposure-limit`, `commit-timeout`                                                        | server | yes    | no        | final         | request    | `bet.rejected`                       |
| `server-busy`, `auth-required`                                                                                                       | server | no     | yes       | transient     | request    | `error`                              |
| `rate-limited`, `auth-expired`                                                                                                       | server | no     | yes       | transient     | connection | `error`                              |
| `idempotency-conflict`                                                                                                               | server | no     | no        | indeterminate | request    | `error`                              |
| `internal`                                                                                                                           | server | no     | yes       | indeterminate | connection | `error`                              |
| `auth-failed`, `protocol-unsupported`, `frame-too-large`, `malformed`, `unknown-type`                                                | server | no     | no        | indeterminate | connection | `error`                              |

**What is stable.** The error **code**, and the carrier it travels in, are part of the wire contract (append-only). The codec's failure **`detail`** strings (`DecodeFailure.detail`, `EncodeFailure.detail`) are diagnostics only: their wording may change in any release, and no client or server may parse or match them. Only this library's own tests compare them.

A client **accepts** any well-formed code, including codes added after it was built, and maps unknown ones to a generic message. A server encoder **emits** only registered codes, on an allowed carrier, with the registered `retryable` flag. Server inbound validation stays strict (§10); the tolerance is client-side only.

### 9.1 Retryability contract (P8-1 acceptance refinement, 2026-11-18)

Every response to a financial request (`bet.place`, `bet.cashout`, `bonus.pick`) falls in exactly one of three classes (`RequestOutcome`; `classifyRequestResponse` computes it on the client):

| Class           | Responses                                                                                                                                                                                                                            | What it proves                                                                                                                                                      | Client duty                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `final`         | `bet.accepted`, `bet.cashedOut`, `bonus.pickAccepted`; `bet.rejected` / `bonus.pickRejected` with **any** code, unknown included                                                                                                     | The server decided and stored the outcome of `(playerId, id)`. A resend of the same id replays the same response                                                    | The request is settled. Never resend it                                                                              |
| `transient`     | `error` with a registered transient code (`server-busy`, `rate-limited`, `auth-required`, `auth-expired`)                                                                                                                            | **This delivery** was refused before processing. It does **not** prove the request id never took effect: an earlier delivery of the same id may have been processed | Keep the request unsettled. Resend only the **same id**, after back-off or re-authentication, or reconcile first     |
| `indeterminate` | `error` with `internal`, `idempotency-conflict` or a protocol-fault code; `error` with an **unknown** code (whatever its `retryable` says) or a code not registered for `error`; **no response at all** (timeout, closed connection) | Nothing about the request's effect                                                                                                                                  | Keep the request unsettled. Reconcile through the authoritative private state; a resend may use only the **same id** |

Rules:

1. **Carrier rule.** `bet.rejected` and `bonus.pickRejected` carry only stored, final decisions; transient and indeterminate conditions travel only as `error`. That is why an unknown code on a rejection carrier is safe to treat as final, and why these payloads need no `retryable` field. (Before this refinement `server-busy` was also allowed on `bet.rejected`; see §14.)
2. **`retryable` on `error`** means only "a resend with the **same** request id may succeed later". It never says whether the original request took effect.
3. **The original request id must be reused.** A client never sends a new id for a financial request that is still unsettled: a new id is a new financial intent, and needs a new player action after the old one is settled. Resending the original id is safe because at most one effect exists per id (P1-D8): if an earlier delivery was processed, the server replays its stored final response; if none was, the resend is processed once.
4. **A missing response does not prove rejection.** The future runtime (P8-6 client, P8-10 idempotency store) must reconcile an unsettled request through authoritative state, `sync.request` → `sync.snapshot.player` (the player's bets per slot, `pendingRequestIds`), or through idempotent replay of the original id, before it shows the player an outcome.
5. **Server duty.** A transient code may be sent only **before** a delivery is processed (before the idempotency lookup). Once processing has begun, the server answers with a stored final outcome, or with `internal` (indeterminate). The SETTLE-IN barrier (docs/09 §10.4) therefore answers `bet.rejected commit-timeout`, a stored final decision, and never `server-busy`. **Owner condition (2026-11-18):** `commit-timeout` may be sent **only** once the server can prove the bet was not included **and** any debit was rolled back or durably compensated. While the transaction's outcome is unknown or reconciliation is incomplete, the request is indeterminate: answer `error internal` (or nothing), never a final rejection. Runtime enforcement is deferred to the server milestones (P8-4, P8-10).
6. **An `error` frame never settles a request.** `classifyRequestResponse` returns `indeterminate` for an `error` whose code is not registered for the `error` carrier (for example `commit-timeout` sent as `error`), even though such a code is final on its own carrier. Server encoders refuse those frames.
7. **No automatic duplicate.** This library classifies responses; it contains no retry logic. A future automatic resend is allowed only with the original id, bounded, and must stop at the first `final` response.

## 10. Validation pipeline (P1-D4)

Decoders (`decodeClientFrame`, `decodeServerFrame`) **never throw**; they return `{ ok: true, msg }` or `{ ok: false, code, detail, ignorable }`. Order: input kind (string or UTF-8 bytes) → **byte size before decoding or parsing** (≤ 4 KiB client → server, ≤ 64 KiB server → client) → valid UTF-8 / no lone surrogate → **nesting ≤ 6 by a string-aware scan before `JSON.parse`** → `JSON.parse` in try/catch → **`__proto__` / `constructor` / `prototype` keys anywhere are rejected** → `v` (an integer ≠ 1 → `protocol-unsupported`) → envelope → type (unknown → `unknown-type`, `ignorable` at a client) → payload. Failure details name a schema path and an issue kind, never input values. Client inbound is strict; client-side decoding of server frames strips unknown fields. Encoders validate their own output: the server encoder also refuses any field its schema does not list, at any depth (allow-list; nothing is silently stripped). Limits live in `limits.ts`.

## 11. Idempotency (P1-D8)

- Scope `(playerId, id)` for `bet.place`, `bet.cashout`, `bonus.pick` (`IDEMPOTENT_CLIENT_TYPES`). **At most one effect per id.**
- Same id and same canonical payload (`idempotencyFingerprint`: type + payload in schema order; key order and whitespace of the original frames do not matter) → the original final response again (same `t`, `re`, `p`; new `seq`). Different payload → `idempotency-conflict`, which is itself not stored (`idempotencyDecision`).
- **Stored:** acceptances and business rejections (`stored: true` in the registry; exactly the `final` codes). **Not stored** (the same id may be retried): `malformed`, `rate-limited`, `auth-required`, `server-busy`, protocol errors. Not stored does not mean "had no effect": see §9.1 for what each response proves and why a client resends only the original id.
- Minimum retention: until the round is settled plus 24 h. **Enforcement (the store, retention, per-player serialization) is P8-10's**, not this library's.

## 12. Sequencing and resynchronization (P1-D7)

`classifySeq(previous, received)` → `"next" | "gap" | "stale"`. On a gap (or 2 s without `round.sync` while diving) the client sends `sync.request` and rebuilds from `sync.snapshot`; there is no replay buffer. A new connection restarts `seq`. Within a round, public messages follow engine order (docs/09 §8.9): `round.betting` < `round.dive` < (`round.crashed` | `round.impact` < `round.bonus` < `round.chests`) < `round.ended`. Ordering is a server duty, not a schema property; so is "a rejection caused by the crash never reaches a client before the public `round.crashed`" (docs/09 §34.4 F3).

## 13. Versioning and compatibility (P1-D2, P1-D12)

- `hello { protocol: { min, max } }`; the server picks the highest common major (`negotiateProtocol`) or answers `protocol-unsupported` and closes with 4001.
- **v1 is a draft.** Until the first network client release (no earlier than P8-6) anything may change without a bump, and the golden corpus changes with the schemas. Declaring v1 released is a separate, owner-approved step; nothing here declares it.
- **From the release on, within major 1:** allowed: new optional fields in server → client payloads, new server → client types (clients skip them), new client → server types, new error codes. Forbidden: removing, renaming or retyping a field, changing a meaning, changing the money or multiplier format, adding a value to an existing enum (other than error codes), or rejecting a previously valid client message (except a documented security fix). A breaking change → major + 1, with v and v − 1 served for a deprecation window (length not fixed here; docs/09 default 30 days).
- Enforced by the golden-frame corpus (`test/golden-v1.ts`): every frame must decode and re-encode byte for byte, and every type must appear. After the release, frames may only be added.

## 14. Deviations from docs/09 §8 (approved with P1-D1 … P1-D13 unless marked "P8-1 choice")

| docs/09                                                                                                     | Here                                                                                                                            | Source                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| §8.2 `id` = request id from the client, message id from the server; responses repeat `reqId` in the payload | Client `id` only; server responses use envelope `re`; no server message id; no `reqId` in payloads                              | P1-D3 (C12 I1)                                                                       |
| §8.1.6 unknown fields rejected at both ends; §8.3 capability-gated additions (`hello.capabilities`)         | Strict server inbound, tolerant client decoding; `capabilities` dropped from `hello`                                            | P1-D4, P1-D12 (C12 I2)                                                               |
| §8.6 `welcome` listed as public                                                                             | Session message; `auth.ok`, `sync.snapshot`, `pong` defined                                                                     | P1-D5, P1-D13 (C7, C8)                                                               |
| §8.7 SCREAMING_CASE server codes, `DUPLICATE_REQUEST`                                                       | One kebab-case registry; `DUPLICATE_REQUEST` removed; `not-in-bonus`, `chest-already-picked` added                              | P1-D11 (C9 I3, C12 I5)                                                               |
| §8.7 code list                                                                                              | Also `auth-failed`, `frame-too-large`, `unknown-type`                                                                           | P8-1 choice (codec outcomes and an invalid ticket needed codes)                      |
| §9.1 money `^[1-9][0-9]{0,15}$`                                                                             | Stakes ≤ 18 digits, amounts may be 0                                                                                            | P1-D9 (C9 I6)                                                                        |
| §9.1 depth > 4 rejected                                                                                     | Depth ≤ 6                                                                                                                       | P1-D4                                                                                |
| §8.2 request ids ULID or UUIDv4                                                                             | UUID v4 or v7 only                                                                                                              | P1-D6                                                                                |
| §8.2 `id` "required on commands"                                                                            | Required on every client frame                                                                                                  | P1-D3                                                                                |
| §8.6 `round.betting.opensAtTick`, `round.dive.startTick` / `world`                                          | Dropped: ticks are dive ticks (0 = dive start), world data travels in `round.world`                                             | P8-1 choice                                                                          |
| §8.6 `round.ended.reveal { serverSeed, worldSeed, … }`                                                      | `reveal { serverSeed }`: the world seed derives from the round seed (docs/09 §16.4); scheme-specific fields are additive (OD-6) | P8-1 choice                                                                          |
| §8.6 amounts without a currency                                                                             | Every amount travels with `currency`                                                                                            | P1-D9                                                                                |
| §12.2 `boost`, `worldY` as strings                                                                          | Canonical decimal strings, exponent allowed where `String` prints one                                                           | P8-1 choice (boost residues)                                                         |
| §10.4, §20 table: SETTLE-IN barrier answers `bet.rejected SERVER_BUSY`                                      | `bet.rejected commit-timeout` (stored, final); `server-busy` is `error`-only and transient (§9.1)                               | P8-1 acceptance refinement; owner-approved 2026-11-18 with the §9.1 rule 5 condition |

## 15. Open decisions this draft encodes as recommendations (none decided)

OD-5 (W-A `round.world` streaming), OD-6 (commitment `{ fv, chainIndex, hash }`, reveal `{ serverSeed }`), OD-7 (multiplier format is neutral; no payout rule), OD-9 (chest values hidden until `round.chests`), OD-11 (no voided outcome in `round.ended` yet; draft-changeable), OD-19 (no cancellation), OD-20 (`bet.jackpot` + `bet.settled`), docs/09 §34.4 F1 (first-boundary cashout: the schema neither allows nor forbids it; the round module decides). Pre-dive creatures: the engine spawns creatures before the dive, but the snapshot forbids world data during betting (W-C); how the network client renders the pre-dive scene is a P8-6 design item.

## 16. Deferred runtime responsibilities

| Responsibility                                                                                                                                                                                              | Milestone                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| WebSocket transport, origin checks, close codes, hello timeout, frame-size enforcement at the socket                                                                                                        | P8-2                                 |
| Provably-fair seeds, commitments, reveals and verification                                                                                                                                                  | P8-3                                 |
| Round orchestration, receipt ticks, ordering guarantees (§8.9), crash-before-rejection (F3)                                                                                                                 | P8-4, P8-5                           |
| Allow-list snapshot and broadcast builders; sending `round.sync` uniformly (no timing side channel)                                                                                                         | P8-5                                 |
| Broadcast cost: `seq` differs per connection, so validate an immutable shared payload once and add each connection's `seq` safely, rather than re-encoding it per socket (see §17). Not implemented in P8-1 | P8-5                                 |
| Reconciling unsettled financial requests (§9.1): resend the original id only, `sync.snapshot.player` as the authority; the idempotency store that makes resends safe                                        | P8-6, P8-10                          |
| Client network mode, resync on `seq` gaps, pre-dive scene                                                                                                                                                   | P8-6                                 |
| Identity, tickets, sessions, `auth-*`                                                                                                                                                                       | P8-8                                 |
| Idempotency store and retention, ledger, settlement, multiplier guard (docs/09 §18.5)                                                                                                                       | P8-9, P8-10                          |
| Rate limits                                                                                                                                                                                                 | P8-2, P8-13                          |
| Declaring v1 released (freeze; P1-D12 starts to bind)                                                                                                                                                       | owner decision, no earlier than P8-6 |

## 17. Performance (docs/20 §5.4 gate 8; tiered budget OWNER-APPROVED PROVISIONAL)

### 17.1 Budget (owner, 2026-11-18; docs/09 §36.2)

The single "p99 < 50 µs per message" target is replaced by three tiers, measured on the full decode (`decodeClientFrame` / `decodeServerFrame`). **Provisional, not production certification.**

| Tier                      | Frames                                                 | Target                                                                                                                                      |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — client → server       | every client request, `bet.place` / `bet.cashout` too  | p99 < 50 µs                                                                                                                                 |
| 2 — small server → client | server frames ≤ 0.5 KB                                 | p50 < 50 µs and p99 < 200 µs                                                                                                                |
| 3 — bulk and snapshot     | `welcome`, `sync.snapshot`, `round.world`, `feed.bets` | p50 < 300 µs at golden-frame sizes; mean < 3 ms at the maximum schema size (64 creatures, 20 snapshot feed entries, 50 `feed.bets` entries) |

p95 and p99 are reported for every tier. No Tier 3 p99 threshold is **not** permission for unbounded blocking or allocation: every limit in `limits.ts` stays in force.

### 17.2 Acceptance measurement (2026-11-18): gate NOT VERIFIED

Harness `qa/p8-1-protocol/bench/` (local, Git-ignored): the real codec bundled outside the repository, Node 24.21, AMD Ryzen 5 5500U (6C/12T), Windows "Balanced". Per frame, five runs interleaved across frames; each run gc, 2,000 warm-up calls, 5,000 individually timed calls (p50/p95/p99), 5,000 batched calls (mean). Medians over runs.

| Run          | Conditions                                                                                     | Tier 1                           | Tier 2                                    | Tier 3                                                 |
| ------------ | ---------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `accept-1`   | battery (discharging, 35 %) for most of the run, AC at the end; owner's `vite dev` ≈ 1.4 cores | **fails** 9 / 9: p99 59 – 156 µs | 27 / 28 pass (`round.betting` p99 201 µs) | passes; mean at max ≤ 1.44 ms                          |
| `accept-2`   | AC power; owner's `vite dev` ≈ 1.55 cores (competing load)                                     | passes 9 / 9: p99 16 – 39 µs     | passes 28 / 28: p50 ≤ 21 µs, p99 ≤ 61 µs  | passes: golden p50 ≤ 78 µs; mean at max 0.26 – 0.98 ms |
| `maxstrings` | as `accept-2`; maximum counts **and** long canonical strings (up to 13.8 KB)                   | —                                | —                                         | passes: mean 0.32 – 0.97 ms                            |

**Verdict: NOT VERIFIED.** The targets pass only on AC power, and even then with a competing process (the owner's dev server, not stopped). On battery, Tier 1 fails. The two runs differ by 2 – 4×. A pass needs AC power and no competing load (docs/09 §36.2).

**Tail at maximum size.** p99 ≈ 13 – 14 ms (≈ 14 × p95) in every run at maximum size. A probe (`tailprobe.mjs`) ties it to garbage collection: 88 young-generation collections averaging ≈ 16 ms during 5,000 decodes of the maximum snapshot. The fix belongs to P8-5 / P8-6 (validate a broadcast once; bound snapshot sizes in practice), not to this draft.

### 17.3 First measurement (P8-1 delivery, 2026-11-18; historical, against the former 50 µs target)

Measured 2026-11-18 on the dev machine (AMD Ryzen 5 5500U, Node 24.21, the real codec bundled outside the repository), per call after warm-up, 20,000 calls per frame, two runs (ranges cover both; the second run was 30 – 40 % faster, machine-load variance). Target then: p99 < 50 µs per message (superseded by §17.1).

| Frames                                                                              | decode p50                         | decode p99                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Client requests (`bet.place`, `bet.cashout`, `bonus.pick`, `ping`, `hello`, …)      | 5 – 12 µs                          | 9 – 37 µs — **within target in both runs**                 |
| Small server messages (`round.sync`, `round.crashed`, `bet.*`, `wallet.balance`, …) | 6 – 22 µs                          | 12 – 78 µs — within target in run 2, partly above in run 1 |
| `round.world` (2 creatures), `feed.bets` (2 entries)                                | 19 – 39 µs                         | 78 – 115 µs — above target                                 |
| `welcome` (≈ 0.7 KB)                                                                | 31 – 54 µs                         | 72 – 141 µs — above target                                 |
| `sync.snapshot` (≈ 1.2 KB)                                                          | 75 – 122 µs                        | 205 – 407 µs — above target                                |
| Hostile frames (oversize, deep nesting)                                             | ≈ 0.2 µs (rejected before parsing) | < 0.5 µs                                                   |

zod v3 validation dominates (for the largest snapshot ≈ 100 µs of ≈ 147 µs; `JSON.parse` ≈ 13 µs). The server's inbound path (client requests) meets the target; server → client decoding runs on clients, a few frames per second. The broadcast path is the one to design for (§16). Numbers vary with machine load and are not a CI gate.

## 18. Build isolation: the Tailwind source scan

`src/styles.css` declares `@source "../src"`, so Tailwind v4 scans **every file under `src/`, this folder included (comments and this README too)**, for class names, and emits CSS for any word that is a utility. During P8-1 the word "lower" + "case" written as one word produced the matching `text-transform` utility rule and changed the production stylesheet's hash, and with it the hashes of the JS, router, manifest and SSR files that reference it. The protocol text therefore avoids Tailwind utility names (it writes "lower-case"). The production build output must stay identical to the pre-P8-1 build until something actually consumes the protocol. A durable fix (an `@source not` rule for `src/protocol` in `src/styles.css`, a UI file) is an owner decision, not part of P8-1.

## 19. Tests

`errors.test.ts` covers the retryability contract (§9.1): outcome consistency of every registry entry, the carrier rule, the encoder refusing a transient code on `bet.rejected`, and the conservative classification of unknown codes. `money`, `multiplier`, `ids`, `envelope`, `codec`, `messages`, `snapshot`, `compat` and `security` (`*.test.ts`) cover docs/20 §5.3 tests 1 – 10 and §5.4 gates 3 and 6: 10^5 seeded hostile inputs per direction never throw; every type has accept and reject fixtures; the golden corpus round-trips byte for byte; public schemas match a committed field allow-list; prototype keys never reach a prototype; the audience separation is a compile-time error; idempotency fixtures; and an import-boundary check (protocol source imports only `zod`; nothing outside `src/protocol` imports it).
