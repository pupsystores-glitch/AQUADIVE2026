# P8-0 ARCHITECTURE REVIEW AND E-A PRELIMINARY ECONOMY VERIFICATION

**READ-ONLY REVIEW — DOCUMENTATION ONLY — NOTHING HERE IS APPROVED — PHASE 8 NOT STARTED — PHASE 7 IN PROGRESS.**

- **Date:** 2026-11-18
- **Authorization:** the owner's instruction "P8-0 Architecture Review and E-A Economy Verification" (2026-11-18): a narrowly scoped, read-only technical verification. It authorizes no implementation, no P8-1 source code and no Git operation.
- **Subject:** `docs/09_BACKEND_ARCHITECTURE.md` (P8-0 PROPOSAL, not approved). docs/09 is **not edited** by this review; every correction to it is recorded here (§4) for the owner to accept or reject.
- **Not changed:** no source, test, dependency, build, deployment, `AGENTS.md` or configuration file. The economy analysis ran outside the repository (§9).

Evidence labels:

| Label | Meaning |
|---|---|
| **FACT (code)** | Read from the source at `HEAD` `01b061e` |
| **FACT (run)** | Observed by running the real repository code, unmodified, outside the repository |
| **MATH** | Derived, with every assumption named. "Rigorous" means a proof from the code under the stated model, not a sample |
| **ESTIMATE** | Monte Carlo or numerical; reported with its standard error (SE) |
| **RECOMMENDATION** | This review's proposal; binding only on the owner's approval |
| **OWNER DECISION** | Needs the owner |

---

## 1. Repository state (FACT)

- Branch `develop`, `HEAD` = `01b061e` (V7). Five local commits ahead of `origin/develop` (`d1ccb9b`): R1 `cede9be`, V4 `9bc714d`, V5 `dfe3342`, V6 `232c554`, V7 `01b061e`. Not pushed.
- Uncommitted and preserved unchanged: `docs/04`, `docs/14`, `docs/15`, `docs/16` (P7-C audit and P8-0 entries), untracked `docs/09_BACKEND_ARCHITECTURE.md` and `docs/19_PHASE7_CLOSEOUT_READINESS.md`.
- This review adds this file and appends one clearly separated entry each to docs 14, 15 and 16. Nothing is staged, committed or pushed.

---

## 2. Economy verification — E-A preliminary

### 2.1 Facts from the code (FACT, code)

| Item | Code | Fact |
|---|---|---|
| Crash point | `domain/outcomes.ts:22-30` | `r < 0.03 → 1.00`; else `max(1.01, min(0.99/(1−u), 200))` |
| Multiplier curve | `domain/multiplier.ts:10-14` | `1 + (e^{0.085t} − 1)` = `e^{0.085t}`; `t` = dive-elapsed simulation time |
| Dive time base | `state-machine.ts:193`, `game-engine.ts:115` | `t = ticks·(1/60) − diveStartedAt`; dive tick *k* has `t ≈ k/60` |
| Boost | `simulation.ts:129-131, 153-157`, `tuning.ts` | Pickup: `b = min(1, b + 0.8)`; decay 0.6/s, applied **before** use, so the bonus is at most `0.4 × 0.99 = 0.396` |
| Tick order | `simulation.ts:126-163` | multiplier + bonus → crash check `m ≥ crashAt` → descent → spawn → collision → floor check `worldY ≥ 4200` |
| Descent | `domain/descent.ts`, `simulation.ts:139` | `(120 + min(520, 28·m^0.95)) × (1 + 0.8b)` px/s |
| Spawning | `simulation.ts:143-146`, `domain/creatures.ts` | Interval `52 − 18U` px, i.e. **34–52 px (mean 43)**; creature `y = spawnY + 200 + 80U`, `x = 0.1 + 0.8U`; 6 draws + 1 jitter draw per creature |
| Goldfish | `domain/creatures.ts:194-239` | `r ≥ 0.96` in all three depth bands → 4 % of creatures |
| Pickup window | `simulation.ts:149-158` | `|y − (worldY + 220)| < 28` and `|x − 0.5| < 0.18` → 45 % of goldfish are on the anchor's line; the anchor moves 2–9 px per tick, so it cannot skip a 56 px window |
| Jackpot | `outcomes.ts:34-41` | 50 % U[50,100], 35 % U[100,200], 15 % U[200,500], `toFixed(2)` → mean 142.5 |
| Chests | `outcomes.ts:43-55` | each i.i.d.: 60 % U[1,3], 32 % U[3,10], 8 % U[10,50], `toFixed(2)` → mean 5.68 |
| Final | `state-machine.ts:302` | `+(jackpot × chest).toFixed(2)`; unpicked → chest 0 (E-X1, `:209`) |
| Floor auto-cash | `state-machine.ts:349-366` | every open slot is cashed at the jackpot and becomes bonus-eligible |
| Settlement | `ui/store/payout.ts:55-63`, `wallet-store.ts` | gross payout `⌊100 · s̄ · m̄⌋` cents (exact, rounded down; `m̄` = the double's shortest decimal); stake debited at `betPlaced` |
| Independence | `rng.ts`, `round-authority.ts`, `game-engine.ts:99-106` | crash/jackpot/chests read the `outcome` stream; creatures read the `world` stream. The world path does not depend on `crashAt`; `crashAt` only stops it |

All returns below are **gross** (stake included): RTP 1.00 = break-even.

### 2.2 Mathematical results (MATH, rigorous unless marked)

Model assumption **A0** (not guaranteed by the code): `Math.random` behaves as i.i.d. U[0,1). Everything in this section holds under A0 and the current tuning.

1. **Crash tail.** P(crashAt = 1.00) = 0.03; P(crashAt = 1.01) = 0.97 × (1 − 0.99/1.01) = 0.019208; **P(crashAt > x) = 0.9603 / x for 1.01 ≤ x < 200**; P(crashAt = 200) = 0.004802. Median ≈ 1.92.
2. **No-goldfish dive** (FACT, run on the real `DiveSimulation`): floor on dive tick **1290**, `m₁₂₉₀ = 6.218321…` (`m₁₂₈₉ = 6.209518…`).
3. **Boost only shortens the dive.** `descentSpeed` is non-decreasing and the boosted speed factor is ≥ 1, so per tick the boosted descent is ≥ the unboosted one (also in floating point: rounding is monotone). Hence every floor tick is ≤ 1290 and every multiplier checked against `crashAt` is ≤ `m₁₂₉₀ + 0.396` = **M_max = 6.614321**.
4. **Fastest conceivable dive.** With the maximal boost on every tick, the floor is reached no earlier than tick 782, so the path maximum is ≥ `e^{0.085·782/60}` = **M_min = 3.0278**.
5. **Floor probability.** The round reaches the floor iff `crashAt > M`, where `M` is the path's maximum multiplier. With 4 ≤ M ≤ 6.62: **P(floor | path) = 0.9603 / M**, so **P(floor) = 0.9603 · E[1/M] ∈ [0.14518, 0.31716]**.
6. **Floor payout.** `E[J] = 142.5 ± 0.005`, `E[C] = 5.68 ± 0.005` (each `toFixed(2)` moves a value by ≤ 0.005), J and C independent: **E[F] ∈ [808.654, 810.146]** (≈ 809.40). Minimum F = 50.00. Maximum F = 25,000.
7. **Never cash out (hold to floor).** RTP = 0.9603 · E[1/M] · E[F] **∈ [117.40×, 256.95×] — rigorous.**
8. **Any cashout rule is capped at 0.9603.** For any stopping rule τ that uses path information (even perfect foresight of the world path) but not `crashAt`, the cashout part of the return is `E[m_τ · 0.9603 / max_{i≤τ} m_i] ≤ 0.9603`. The only way to beat 0.9603 is to reach the floor.
9. **First-boundary cashout = exactly 1.00×.** A cashout applied at the first dive boundary uses `sim.multiplier = 1` (reset at entry(diving)) and succeeds even in an instant-crash round (FACT, run: `cashedOut 1` then `crashed 1` on tick 301). RTP of that strategy: exactly 1.0000. Not profitable; it only removes the 3 % instant-crash loss.
10. **Informed chest pick.** `E[max of 3 chests] = 11.232` (numerical integration; sampled 11.228). A player who can read the three values (they are in the `chestsRevealed` payload and in public state today) gets `E[F] ≈ 1,600.6`, about **2×** the uninformed pick.

### 2.3 Estimates (ESTIMATE)

2,400,000 world paths through the **real** `DiveSimulation` (crash and outcome randomness integrated exactly per path, §9):

| Quantity | Estimate | SE / range |
|---|---|---|
| P(floor) | **0.161239** (1 in 6.20) | SE 0.000004 |
| E[M] (path max) | 5.964 | observed range 4.592 – 6.606 |
| Floor tick | mean 1255.9 | observed range 1056 – 1290 |
| Goldfish consumed per full dive | mean 1.75; 0: 17.2 %, 1: 30.5 %, 2: 26.9 %, 3: 15.6 %, 4: 6.7 %, ≥ 5: 3.1 % | — |
| P(floor), counterfactual without goldfish | 0.15443 | exact (`0.9603 / 6.2183`) |
| **RTP, never cash out** | **130.5×** | path SE 0.003; E[F] bracket → 130.39 – 130.63 |
| RTP, never cash out, informed chest pick | ≈ 258× | — |
| Path maximum attained before the floor tick | 0 of 2,400,000 paths | empirical only — not proved |

End-to-end confirmation (FACT, run + ESTIMATE): the real `GameEngine`, `LocalRoundAuthority` and the real wallet store (M1 payout rule, E-X1 default chest, E-X3 Dual Bet), driven with `advance(TICK_SECONDS)` for **1,200,000 rounds** (12 seeded batches). Slot 0 stakes 1.00 and never cashes out; slot 1 stakes 1.00 and cashes out at the first tick ≥ 2.

| Quantity | End-to-end | Path estimate |
|---|---|---|
| P(floor) | 0.16143 (SE 0.00034) | 0.16124 |
| Slot 0, never cash out | **130.35×** (SE 0.77) | 130.51× |
| Slot 1, target 2 | 0.9613 (SE 0.0009) | 0.9591 (2.4 SE apart: within sampling variation, not investigated further) |
| Instant crashes | 2.971 % | 3 % |
| Floor rounds settled with the default chest 0 | 193,717 of 193,717 | — |
| Engine rejections / wallet refusals | 0 / 0 | — |
| Wallet balance change = sum of per-event payouts minus stakes | exact, every batch | — |

### 2.4 Return by player strategy (ESTIMATE; gross, per unit stake, one slot)

"Target *x*": cash out at the first tick whose multiplier is ≥ *x* (applied at the next boundary at that tick's value, D4). If the floor comes first, the bet is auto-cashed at the jackpot.

| Strategy | Stake 100.00 | Stake 1.00 | Stake 0.01 |
|---|---|---|---|
| Cash at first boundary (m = 1.00) | 1.0000 (exact) | 1.0000 | 1.0000 |
| Target 1.01 | 0.9602 | 0.9590 | 0.9492 |
| Target 1.5 | 0.9603 | 0.9589 | 0.6299 |
| Target 2 | 0.9603 | 0.9591 | 0.9502 |
| Target 3 | 0.9603 | 0.9595 | 0.9547 |
| Target 4 | 0.9603 | 0.9597 | 0.9566 |
| Target 5 | 1.007 | 1.006 | — |
| Target 5.5 | 5.59 | 5.59 | — |
| Target 5.8 | 30.0 | 30.0 | — |
| Target 6.0 | 65.7 | 65.7 | — |
| Target 6.2 | 104.5 | 104.5 | — |
| Target 6.5 | 130.4 | 130.4 | — |
| **Never cash out** | **130.5** | **130.5** | 130.5 |

- Targets ≤ 4 behave like a classic crash game with a **3.97 % edge** (0.9603). Rounding down costs up to 1 cent per bet, which dominates at stake 0.01.
- Above ≈ 5.5 the floor takes over. **The best response is to never cash out, on both slots.** Dual Bet is linear: two held slots return ≈ 2 × 130.5 stakes.
- **House break-even:** with every other bet at ≈ 0.96, the game pays out more than it takes as soon as more than **≈ 0.03 %** of all stake is held to the floor (`0.0397 / (130.5 − 0.96)`).
- Per-round SD of the never-cash-out return ≈ 690 stakes; maximum single-round payout 25,000 stakes per bet.

### 2.5 Verdict on the reported claim (docs/09 §17.2)

| docs/09 statement | Verdict |
|---|---|
| "At least ≈ 7.26× the stake" for a never-cash-out player | **True as a lower bound, but materially understated.** Rigorous lower bound **117.4×**; estimate **130.5×** — about 18× the reported figure. The open risk E-RISK-1 is far larger than recorded |
| The bound's arithmetic | `0.97 × 0.99 / 6.62 × 50 = 7.253`. A lower bound should be rounded down: **≥ 7.25×** (or ≥ 7.259× with the exact supremum 6.6143) |
| "P(crashAt > x) = 0.97 × 0.99 / x for 1.01 ≤ x ≤ 200" | Valid for **x < 200**; at x = 200 the probability is 0 (clamp) |
| Floor threshold "≈ 6.2183, boost adds at most 0.4, never exceeds ≈ 6.6183" | Correct and conservative; the tight supremum is 6.6143 |
| Dependence on unguaranteed assumptions | Only A0 (uniform RNG model) and the current tuning. The bound also assumes the bet is accepted and held, and that the wallet credits the win (true below the W11 envelope of 2^44 units) |
| "~1 in 6 rounds reaches the floor" (TASK 001) | Confirmed: 1 in 6.20 |
| "Goldfish make the multiplier reach crashAt earlier" | True, but their net effect is to **raise** the floor probability (0.1544 → 0.1612), because the shorter dive lowers the path maximum |

**Root cause (MATH).** The crash distribution puts ≈ 15–16 % of its mass above the highest multiplier a dive can reach (≈ 6.6). In a classic crash game that tail pays nothing unless the player cashes out. Here it is converted into an automatic payout averaging ≈ 809×. No crash-point retuning alone fixes this while the floor pays ≥ 50×. Remedies belong to E-A9 and are not proposed here.

### 2.6 What this preliminary analysis does not settle (for the full E-A)

- Cross-engine float behaviour (OD-18) and A0 itself (V8's `Math.random` is not a certified RNG).
- The economy of any rebalanced model, including how much world-path disclosure (W-A/W-B) is worth to a player under it (§3.4).
- Minimum-stake rounding (stake 0.01 loses up to 33 % at some targets).
- Liability and ruin metrics (E-A8), and the economics of OD-7 (P-A/P-B/P-C rounding).
- A proof that the path maximum is always the floor-tick value (observed in 2.4 M paths; not needed for any result above).

**No target RTP is chosen and no gameplay value is changed.** The current economy must not be operated with anything of value.

---

## 3. Architecture review of P8-0 (RECOMMENDATION)

Verdicts: **Sound** · **Sound with amendments** · **Not ready**.

### 3.1 Precomputed server-side RoundScript (§10.2) — Sound with amendments

- **A1 — Pin the reference construction.** The dive time base is `ticks·(1/60) − diveStartedAt`, a floating-point difference that depends on the engine's absolute tick count. FACT (run): 1,204 of 1,290 dive-tick times differ in the last bits between a dive starting at tick 300 and one starting at tick 500,000. A RoundScript is therefore a function of the seeds **and** of how the engine was constructed and advanced. The fairness specification (`fv`) must define the reference: a fresh engine per round, a 300-tick betting countdown (`BETTING_WINDOW_SECONDS` = 5), `advance(TICK_SECONDS)` per tick. `BETTING_WINDOW_SECONDS`, `TICK_SECONDS` and every tuning constant become fairness-relevant: changing one requires a new `fv`.
- **A2 — Run the precompute to entry(bonus).** Chests are rolled at entry(bonus), 84 ticks after impact (`state-machine.ts:371-372`), not at impact as §10.2 implies.
- **A3 — Cost is small.** ESTIMATE: a full 1,290-tick dive takes ≈ 0.6–0.7 ms in Node on this machine (2.4 M paths). The < 50 ms target is easily met.
- **A4 —** Creature ids restart at 1 in each fresh engine (a long-lived client engine continues them). Protocol creature ids must be server ids.

### 3.2 Reusing the engine unchanged on the server (§6, §10) — Sound with amendments

- **B1 — OD-10b / E-X9 is unnecessary.** Per-purpose streams need no domain import and no facade change. Three facade-exported `LocalRoundAuthority` instances, each over its own seeded stream (crash, jackpot, chests), give the same separation: `SeededRoundAuthority` delegates `sampleCrashPoint()` to the first, `sampleJackpot()` to the second and `rollBonusChests()` to the third. Recommendation: withdraw OD-10b.
- **B2 — Type-level coupling to the renderer.** `state-machine.ts:44` has `import type { Phase } from "@/rendering/scene-renderer"`, the full canvas renderer, which pulls in asset imports (`.png`, `import.meta`) and DOM types. Runtime bundling erases it, but a server `tsc` must then include the DOM lib and `vite/client` types. Options: accept that in `server/tsconfig.json`, or a one-line engine freeze exception to import `Phase` from `@/rendering/render-state` (where it is defined, as `game-engine.ts:19` already does). **OWNER DECISION** before P8-2/P8-3; the one-line exception is recommended.
- **B3 —** The engine's public `events.emit`, the live references from `getPublicState()`, and `snapshot()` exposing `crashAt` are harmless inside the authority process, provided the RoundScript copies values and nothing passes engine objects to transport (as docs/09 states).

### 3.3 Client replica mode E-X8 (§27.3) — Not ready

- **C1 — The R-A scope is understated.** With the recommended world disclosure W-A (server streams creatures), the client must **not** draw world randomness and must not run its own collision or boost; it must take creatures and boost facts from the server. That changes `simulation.ts` (spawner and collision), not only "state machine + facade". R-A as scoped works only with W-B, which docs/09 rejects.
- **C2 —** R-A must also define: displaying multipliers above an unknown crash point and snapping back on `round.crashed`; holding at the floor until `round.impact`; jumping forward when the server is ahead; and the long-lived client engine's different floating-point time base (A1).
- **Recommendation:** do not approve E-X8 now. Before P8-6, run a design spike comparing a correctly scoped R-A against R-B, a client replica driver that projects server samples into `RenderState` (it needs `multiplierAt`/`descentSpeed` exported from the facade, or no extrapolation). Make P8-1 carry what both need: tick-stamped samples (`tick, multiplier, boost, worldY`), creature DTOs and boost facts. **E-X8 does not block P8-1.**

### 3.4 World RNG secrecy and goldfish determinism (§15.1, §16.7) — Sound; disclosure needs E-A input

- **D1 — The world stream is materially outcome-relevant** (ESTIMATE): P(floor | path) ranges over ≈ 0.145 – 0.209 across observed paths. Disclosing world information before betting would let a player select rounds. **W-C must stay rejected.**
- **D2 — W-B discloses M at dive start; W-A discloses the path ≈ 900 px ahead** (≈ 3–7 s; the whole remainder near the floor). Under the current economy, foresight adds nothing: holding dominates, and §2.2 item 8 caps every cashout rule at 0.9603. Under a rebalanced model whose floor value approaches the path-maximum range (≈ 4.6–6.6), knowing M becomes a profitable hold-or-cash signal. **The choice of OD-5 must be re-checked against the model E-A proposes.**
- **D3 —** Server-emitted `round.boost` facts plus the reference verifier (OD-18 option (a)) remain the right approach to goldfish determinism.

### 3.5 Provably-fair commitment and verification (§16) — Sound with amendments

The reverse hash chain with a public future salt and HMAC per-purpose derivation is the established pattern and is internally consistent (commitment of round *j* = `x_{j−1}` = the previous reveal). Gaps:

- **E1 — Selective voiding.** The authority knows every future outcome (the chain), and §21.4 voids a `diving` round with refunds after a failure. A malicious or pressured operator can turn a known floor round (≈ 809× per open bet) into a refund by forcing a failover. Provable fairness does not detect this. Required: an outcome-independent incident policy, a public void log listing each voided round's revealed outcome, and void-rate monitoring split by outcome. **OWNER DECISION** (extends OD-11).
- **E2 — Cashout honesty is not provable.** The commitment proves outcomes, not that a cashout's receipt tick was assigned honestly. State this limitation; consider server-signed `bet.cashedOut` receipts carrying the receipt tick.
- **E3 — Chain storage.** Deriving `x_j` from `x_N` costs N − j hashes (up to 10⁷). The storage design needs checkpoints (for example every 10⁴ links, encrypted).
- **E4 —** The reference computation must include the construction pinned in A1.
- **E5 —** Betting cannot open until the public salt exists; the chain-activation runbook must say so.

### 3.6 Cashout receipt-tick policy (§11.3) — Sound with amendments

The rule "received in (T_{k−1}, T_k] → boundary k at m_{k−1}, succeeds iff k − 1 < terminalTick" matches the engine (D4), including a cashout at boundary `terminalTick`. Missing edge cases:

- **F1 — First boundary.** A cashout received before dive tick 1 succeeds at exactly 1.00×, even in an instant-crash round (§2.2 item 9). Define it explicitly (allow, for parity with the engine, or reject until tick 1). **OWNER DECISION** (economic effect: none beyond removing the 3 % instant-crash loss for that bet).
- **F2 — Receipt time is not arrival time.** It is captured when JavaScript reads the frame, after any event-loop delay. Server lag near a crash therefore turns into player losses. Required: a `receipt_lag` metric; a policy for rounds with lag above a threshold (flag, void, or hold the crash broadcast); and keeping the precompute and other heavy work off the gateway's event loop (a worker thread for socket reading is an option). Extends **OD-8**.
- **F3 — Order of rejections.** A rejection whose reason is the crash must never reach a client before the public `round.crashed`.
- **F4 — Zero ledger legs.** When payout = stake (m = 1.00, or tiny stakes after rounding down, for example stake 0.01 at any m < 2), the house leg `−(payout − stake)` is 0 and violates `amount_minor <> 0` (§19.2). Zero legs must be omitted.

### 3.7 PostgreSQL ledger and fencing (§19–§21) — Sound with amendments

- **G1 — Lock modes.** `FOR SHARE` on the single lease row in every money transaction, plus a renewing `UPDATE` every second, creates lock queueing and MultiXact churn on one hot row. Specify instead: money transactions take `FOR KEY SHARE` and check the epoch; renewal is a non-key `UPDATE` (compatible with `KEY SHARE`); acquisition takes `SELECT … FOR UPDATE` first (which conflicts with `KEY SHARE`, so fencing still holds). Load-test in P8-7.
- **G2 — Idempotency key collision.** "One tx per round (`loss:{roundId}`), chunked if large" reuses one unique key for several transactions. Use `loss:{roundId}:{chunk}` or per-bet keys.
- **G3 — Closing the betting window.** Prefer a database-enforced close (each bet transaction locks the `rounds` row in a share mode and requires `state = 'betting'`; dive start updates the state) over the SETTLE-IN compensating voids. Every accepted bet is then exactly pre-dive by construction.
- **G4 — Self-fencing must also stop broadcasts.** A paused process that wakes up may emit round ticks before its renewal loop notices the lost lease. Gate every broadcast tick on monotonic time since the last successful renewal, not only database writes.
- **G5 —** Double entry, append-only privileges, integer `BIGINT` money, deterministic keys, conditional state updates and reconciliation are sound.

### 3.8 Reconnect and public-snapshot confidentiality (§12–§13) — Sound with amendments

- **H1 —** `welcome` is listed as a public broadcast but carries `PlayerPrivateState`. It is a session message.
- **H2 —** `sync.request` is acknowledged by `sync.snapshot`, which §8.6 never defines. It must carry the PublicSnapshot and, for authenticated sessions, `PlayerPrivateState`, because there is no replay buffer and private acknowledgements lost in a gap must be recoverable.
- **H3 —** The allow-list snapshot builders, the uniform `round.sync` stream and the hidden chest values until the window closes are correct and necessary. FACT: today `chestsRevealed` and the public state carry all three chest values; an informed pick doubles E[F] (§2.2 item 10).

### 3.9 Protocol versioning and idempotency (§8, §20.1) — Sound with amendments

- **I1 —** `id` means "request id" from the client and "message id" from the server, while responses repeat `reqId` in the payload. Use a separate envelope correlation field.
- **I2 —** Strict unknown-field rejection in both directions conflicts with "add optional fields within a major version", unless every optional field is capability-gated. Recommended: strict server-side inbound validation; tolerant client-side decoding (strip unknown fields, ignore unknown types).
- **I3 —** `DUPLICATE_REQUEST` is listed as an error but defined as "success with the original payload". Remove the code; a duplicate replays the original response.
- **I4 —** Undefined: the same request id with a different payload; which results are stored for replay; the retention window. See P1-D8.
- **I5 —** The "engine-compatible" codes omit `not-in-bonus` and `chest-already-picked` (FACT, `state-machine.ts`). Engine codes are kebab-case and server codes SCREAMING_CASE; pick one style.
- **I6 —** The money pattern `^[1-9][0-9]{0,15}$` cannot express zero (payouts, balances) and is narrower than PostgreSQL `BIGINT`. See P1-D9.
- **I7 —** No client exists yet. Protocol v1 can stay a **draft**, changeable without a version bump, until the first network client is released. This makes most owner decisions non-blocking for P8-1 (§5.5).

### 3.10 Separating the backend from Lovable (§26) — Sound with amendments

- **J1 —** A separate deployment of a long-running Node service is correct. The Lovable/Cloudflare SSR app cannot host the round authority.
- **J2 — FACT (config):** the root `tsconfig.json` and `vitest.config.ts` include only `src/**`, so a `server/` package is not type-checked or tested by the root. The root `eslint.config.js`, however, lints `**/*.{ts,tsx}` with browser globals and would lint `server/`. P8-2 needs either an ignore entry in the root ESLint config (a Lovable-root file, so an **OWNER DECISION**) or must accept root lint over `server/`.
- **J3 —** `src/protocol/` (P8-1) sits inside the root `tsc`, Vitest and ESLint scope, so P8-1 needs no configuration change.
- **J4 —** The Lovable editor can modify `server/`, `src/protocol` or `src/engine`; keep the review rule from docs/09 §26.2.

---

## 4. Corrections register for docs/09 (not applied; for the owner)

| # | docs/09 | Correction |
|---|---|---|
| K1 | §1, §17.2, §32 R-1; docs 14/15/16 P8-0 entries | E-RISK-1 magnitude: lower bound ≥ 7.25× → rigorous ≥ **117.4×**, estimate **130.5×** (§2) |
| K2 | §17.2 item 3 | Tail formula valid for 1.01 ≤ x **<** 200 |
| K3 | §16.1 | Spawn interval 34–52 px (mean 43), not "≈ 43–52" |
| K4 | §10.2 | Precompute through entry(bonus); pin the reference construction (A1, A2) |
| K5 | §6.3, OD-10b, E-X9 | Unnecessary (B1) |
| K6 | §1, §6.4 "no engine file needs to change" | True at runtime; type-check needs DOM + `vite/client` types or a one-line exception (B2) |
| K7 | §27.3 R-A scope | Must include `simulation.ts` under W-A (C1) |
| K8 | §8.6 | `welcome` is a session message; define `sync.snapshot`, `pong`, `auth.ok` (H1, H2) |
| K9 | §8.7 | Add `not-in-bonus`, `chest-already-picked`; remove `DUPLICATE_REQUEST`; one naming style (I3, I5) |
| K10 | §8.1.6 vs §8.3 | Strict inbound, tolerant client decoding (I2) |
| K11 | §19.2–§19.3 | Omit zero legs (F4); chunk keys (G2) |
| K12 | §21.2 | Lock modes (G1); broadcast self-fence (G4) |
| K13 | §21.4 | Selective-void abuse (E1) |
| K14 | §29 P8-1 dependencies | OD-7 and OD-19 do not block P8-1 (§5.5) |

---

## 5. P8-1 readiness — Versioned Network Protocol Contracts

### 5.1 Proposed decisions (each needs the owner's approval)

| ID | Decision |
|---|---|
| **P1-D1** Location | `src/protocol/`: pure TypeScript; imports only `zod` (3.25.76 installed, `^3.24.2` declared; v3 API). No import of `src/engine`, `src/ui`, `src/rendering`, React, DOM or Node APIs. Nothing in the app imports it, so the production bundle is unchanged |
| **P1-D2** Status | Protocol major version `1`, status **draft**. It may change without a version bump until the first network client is released (no earlier than P8-6). The compatibility rules (P1-D12) bind from that release |
| **P1-D3** Envelope | One UTF-8 JSON object per frame. Client→server: `{ v: 1, t, id, p }`. Server→client: `{ v: 1, t, seq, ts, re?, p }`. `t` = `namespace.verb`; `id` = client request id; `re` = the request id a response answers (absent on broadcasts); `seq` = per-connection counter; `ts` = server wall-clock ms as a decimal string, informational only, never used for ordering or trusted back |
| **P1-D4** Validation | `decodeClientFrame(raw)` and `decodeServerFrame(raw)` **never throw**; each returns `{ ok: true, msg }` or `{ ok: false, code, detail }`. Order: byte size (≤ 4 KiB client→server, ≤ 64 KiB server→client) **before** `JSON.parse`; parse in try/catch; depth ≤ 6; envelope schema; per-type schema. Server inbound: `.strict()`, unknown types rejected. Client decoding: unknown fields stripped, unknown types reported as ignorable. Encoders validate their own output before serializing |
| **P1-D5** Audiences | Three typed unions: `ClientMessage`, `PublicServerMessage` (broadcast), `SessionServerMessage` (one session). `welcome`, `sync.snapshot`, `auth.ok`, `pong`, `error` and every `bet.*`, `bonus.pick*` and `wallet.*` message are session messages. The gateway will only be able to broadcast a `PublicServerMessage` (enforced by the type system) |
| **P1-D6** Identifiers | `roundId`, `betId`: canonical lowercase UUID strings (server-generated). `roundNumber`: decimal string of a positive integer (bigint). Request `id`: canonical lowercase UUID (v4 or v7). `tick`: integer, 0 ≤ tick ≤ 2³¹ − 1, dive tick index (0 = dive start). `chestId` ∈ {0, 1, 2}; `slot` ∈ {0, 1} as JSON integers |
| **P1-D7** Sequencing | `seq` starts at 1 for the first server frame of a connection and increases by exactly 1. A gap means resynchronize (`sync.request`). A new connection restarts `seq`. Within a round, public messages follow engine order (docs/09 §8.9) |
| **P1-D8** Idempotency | Scope `(playerId, id)` for `bet.place`, `bet.cashout`, `bonus.pick`. **At most one effect per id.** The same id with the same canonical payload returns the original final response again (same `t`, `re`, `p`; new `seq`). The same id with a different payload → `idempotency-conflict` (not stored). **Stored:** acceptances and business rejections decided by the round or settlement (`not-in-betting`, `insufficient-funds`, `already-cashed-out`, …). **Not stored** (the same id may be retried): `malformed`, `rate-limited`, `auth-required`, `server-busy` raised before processing, protocol errors. Minimum retention: until the round is settled plus 24 h (server-enforced from P8-10). Each error code's `stored` and `retryable` flags are part of the error registry |
| **P1-D9** Money | Integer minor units as canonical decimal strings: no sign, no leading zero, no exponent, no whitespace, ≤ 18 digits (all fit in PostgreSQL `BIGINT`). Stakes: `^[1-9][0-9]{0,17}$`. Balances and payouts: `^(0\|[1-9][0-9]{0,17})$`. Parsed and produced as `bigint` only; never a JSON number, never a float. Every amount travels with a currency code `^[A-Z][A-Z0-9]{2,7}$`. Currency exponents (OD-15) are currency metadata, outside P8-1 |
| **P1-D10** Multipliers | Decimal strings only. Settlement multipliers are the **shortest round-trip decimal of the server's double** (`String(m)`, the same decimal `payout.ts` uses), so a client can check `payoutMinor = ⌊stakeMinor × m̄⌋`. Rule: `String(Number(s)) === s`, no exponent, value ≥ 1. The protocol encodes no economic cap. Whatever OD-7 decides, the format carries it |
| **P1-D11** Errors | One code style: lowercase kebab-case, matching the engine (`not-in-betting`, …, plus server codes such as `round-mismatch`, `insufficient-funds`, `stake-limit`, `idempotency-conflict`, `rate-limited`, `auth-required`, `auth-expired`, `protocol-unsupported`, `malformed`, `server-busy`, `round-voided`, `internal`). The registry is append-only. Codes are never user-facing text (wording stays in `src/ui/strings.ts`). Clients map unknown codes to a generic message |
| **P1-D12** Compatibility | `hello { protocol: { min, max } }`; the server picks the highest common major or answers `protocol-unsupported` and closes with 4001. Within a released major version, **allowed:** new optional fields in server→client payloads; new server→client types (clients ignore unknown ones); new client→server types; new error codes. **Forbidden:** removing, renaming or retyping a field, changing a meaning, changing a money or multiplier format, or rejecting a previously valid client message (except a documented security fix). A breaking change → major + 1, with the server supporting v and v − 1 for a deprecation window. Enforced by a committed golden-frame corpus |
| **P1-D13** Catalogue (v1 draft) | Client: `hello`, `auth.resume`, `bet.place`, `bet.cashout`, `bonus.pick`, `sync.request`, `ping`. Public: `round.betting`, `round.dive`, `round.world`, `round.sync`, `round.boost`, `round.crashed`, `round.impact`, `round.bonus` (no chest values), `round.chests`, `round.ended`, `feed.bets`, `server.notice`. Session: `welcome`, `auth.ok`, `sync.snapshot`, `pong`, `bet.accepted`, `bet.rejected`, `bet.cashedOut`, `bet.lost`, `bet.jackpot`, `bet.settled`, `bonus.pickAccepted`, `bonus.pickRejected`, `wallet.balance`, `error`. **Not in v1:** bet cancellation (OD-19; addable later as a new type), auto-cashout, chat. `round.sync` and `round.world` carry what both replica options need (C2): `tick`, `multiplier`, `boost`, `worldY`, creature DTOs with server ids |

### 5.2 Exact file scope

| Change | Path |
|---|---|
| Create | `src/protocol/version.ts` — `PROTOCOL_MAJOR = 1`, `PROTOCOL_STATUS = "draft"`, supported range |
| Create | `src/protocol/limits.ts` — frame sizes, depth, string lengths |
| Create | `src/protocol/ids.ts` — UUID, round number, tick, slot, chest id schemas and branded types |
| Create | `src/protocol/money.ts` — minor-unit string schemas, `parseMinor` / `formatMinor` (`bigint` only), currency code |
| Create | `src/protocol/multiplier.ts` — canonical decimal schema and round-trip check |
| Create | `src/protocol/errors.ts` — error-code registry with `stored`, `retryable` and audience flags |
| Create | `src/protocol/envelope.ts` — client and server envelopes |
| Create | `src/protocol/messages/client.ts`, `messages/server-public.ts`, `messages/server-session.ts` |
| Create | `src/protocol/snapshot.ts` — `PublicSnapshotV1`, `PlayerPrivateStateV1` |
| Create | `src/protocol/codec.ts` — never-throwing decode/encode for both directions |
| Create | `src/protocol/index.ts` (the only public surface), `src/protocol/README.md` |
| Create | Tests: `src/protocol/{money,multiplier,ids,envelope,codec,messages,snapshot,compat,security}.test.ts`, `src/protocol/test/golden-v1.ts` (golden frames), `src/protocol/test/fuzz.ts` (seeded generator; no new dependency) |
| Modify | `docs/14_TASKS.md`, `docs/15_PROGRESS.md`, `docs/16_CURRENT_TASK.md` (tracking); a short "as implemented" protocol note: an addendum to docs/09 §8, or a new doc, per the owner's choice |
| **Unchanged** | `src/engine`, `src/shared` (including `src/shared/README.md`, which docs/09 proposed to touch: not needed), `src/ui`, `src/rendering`, `src/audio`, `src/network`, `package.json`, both lockfiles, `bunfig.toml`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `AGENTS.md`. No `server/` directory |

### 5.3 Security tests (required)

1. **Codec never throws** for 10⁵ seeded random inputs: random bytes, invalid UTF-8, truncated JSON, `1e309`, `-0`, deep nesting, 4 KiB + 1 bytes (rejected before parsing), very long strings.
2. **Money:** `"-1"`, `"+1"`, `"01"`, `"1e3"`, `"1.0"`, `" 1"`, `"1 "`, `"0"` (as a stake), 19+ digits, `"9223372036854775808"`, JSON number `100`, `null`, booleans → rejected; accepted values round-trip through `bigint` exactly.
3. **Multipliers:** exponent forms, `"NaN"`, `"Infinity"`, non-canonical `"1.50"`, values below 1 → rejected.
4. **Fields:** `slot` 2, −1, 0.5, `"0"`, `true`; `chestId` 3; unknown fields on client messages; missing `id`; `v` ≠ 1 → rejected with the right codes.
5. **Direction:** server-only types sent by a client (`round.crashed`, `bet.cashedOut`, `wallet.balance`, …) → rejected.
6. **Structural:** no client schema contains a field that carries server authority (`multiplier`, `payout*`, `balance*`, `tick`, `playerId`, `betId`, `seed`, `crash*`, `jackpot*`, `chests`).
7. **Secrecy:** every public schema matches a committed field allow-list snapshot. No public type before `round.ended` can carry `crashAt`, `terminalTick`, a seed, or chest values (except `round.chests`).
8. **Prototype keys:** `__proto__`, `constructor` and `prototype` keys are rejected and never reach a decoded object's prototype.
9. **Audience:** a type-level test proves that a `SessionServerMessage` cannot be passed where a `PublicServerMessage` is required.
10. **Idempotency semantics:** a pure fixture test of the registry (stored/retryable flags) and of canonical payload equality, used by P8-10.

### 5.4 Acceptance gates

1. `git diff --stat` and the untracked files list exactly the §5.2 scope.
2. No new dependency; `package.json` and both lockfiles byte-identical.
3. Nothing outside `src/protocol` imports it (grep); `src/protocol` imports nothing but `zod` and itself (grep test).
4. The production build output (`.output/public` file list and hashes) is identical to `HEAD`, which proves no runtime impact on the game.
5. `tsc --noEmit` clean; the full Vitest suite green (1,629 existing tests plus the new ones; run from PowerShell); changed-file ESLint and Prettier clean; `vite build` passes; `git diff --check` clean.
6. Every message type has at least one accept fixture and its reject fixtures; the golden corpus satisfies `encode(decode(frame)) === frame`.
7. §5.3 passes in full.
8. Decode-plus-validate cost is measured and reported (target p99 < 50 µs per message on this machine). Informational, not a CI gate (timing gates are flaky).
9. The README documents the envelope, the audiences, idempotency, money and multiplier formats, and the compatibility rules. Deviations from docs/09 §8 are listed.
10. The owner reviews and approves before any commit.

### 5.5 Which owner decisions block P8-1

**Blocking (needed before P8-1 starts):**

- **B1 — Phase gate.** docs/04 says "Never skip phases"; Phase 7 is In Progress, and P7-C is blocked on rights and device QA (docs/19). Starting P8-1 needs the owner's explicit authorization to begin Phase 8 implementation while Phase 7 stays open (as P8-0 was authorized for planning only), or Phase 7 must close first.
- **B2 — Commit hygiene.** The working tree holds uncommitted documentation for three separate steps (P7-C audit, P8-0, this review), and P8-1 must edit docs 14/15/16 again. Unless these are committed first, as their own documentation commits, P8-1's commit would mix unrelated changes. The owner decides whether and how to commit them (no push implied).
- **B3 — P8-1 contract.** Approval of P1-D1 … P1-D13, including the deviations from docs/09 §8 (I1–I6).

**Not blocking (safe to defer; the draft status P1-D2 and the additive rules P1-D12 absorb them):** OD-1, OD-2 (play money is the stated preference), OD-3 (only `src/protocol/` placement is needed now, and it lies inside the existing root), OD-4, OD-5 (`round.world` follows the W-A recommendation; W-B would be additive), OD-6 (`commitment { fv, hash, chainIndex }`; scheme-specific fields additive), **OD-7** (format-neutral, P1-D10), OD-8, OD-9 (encodes the recommended rule; per-player permutations would be additive), OD-10 / E-X8, OD-10b (moot, B1 above), OD-11 … OD-18, **OD-19** (cancellation addable as a new type), OD-20 (`bet.jackpot` and `bet.settled` are draft), OD-21.

### 5.6 Git commit boundary

- Preceded by the documentation commits of B2, if the owner authorizes them.
- **Exactly one commit:** `feat(protocol): add versioned protocol v1 contracts (P8-1)`, containing only the §5.2 files plus its tracking-doc lines.
- Local only. Push only on the owner's separate instruction (the branch syncs to Lovable).
- Rollback: revert the commit; nothing consumes the protocol yet.

---

## 6. Open risks

| # | Risk | Severity | Status |
|---|---|---|---|
| R1 | **E-RISK-1:** never-cash-out return ≈ 130.5× (≥ 117.4× rigorous) | **Critical** for any real value; contained by play money | Open; full E-A needed |
| R2 | Selective voiding of known floor rounds (E1) | High (real value) | New; policy needed |
| R3 | Server event-loop lag decides cashouts (F2) | Medium–High | New; OD-8 extension |
| R4 | Engine construction and float time base are part of the fairness reference (A1) | Medium | New; spec item for P8-3 |
| R5 | E-X8 scope understated (C1) | High for P8-6 | New; design spike |
| R6 | Cross-engine float divergence (OD-18) | Medium | Unchanged |
| R7 | Lease-row lock contention (G1) | Medium | New; P8-7 load test |
| R8 | Local mode exposes chest values (informed pick ≈ 2× E[F]) | Low (local, play money) | Recorded; fixed by design on the server |
| R9 | Root ESLint covers `server/` (J2) | Low | New; P8-2 decision |
| R10 | Minimum-stake rounding (stake 0.01 returns 0.63–0.95 on cashouts) | Low (economic) | New; E-A / OD-12 |

---

## 7. Owner decisions

**Needed now for P8-1:** B1 (phase gate), B2 (documentation commits), B3 (P1-D1 … P1-D13).

**Raised by this review, not blocking P8-1:**

- **OD-16 (re-raised):** authorize the full E-A, given the corrected magnitude.
- Accept or reject the corrections register (§4), and whether docs/09 should be amended or kept as the historical proposal with this review as its errata.
- The selective-void policy (E1, extends OD-11).
- The first-boundary cashout rule (F1).
- A receipt-lag policy (F2, extends OD-8).
- B2 of §3.2: the one-line type-import exception, or DOM types in the server's type-check.
- Withdraw OD-10b (B1 of §3.2).
- The E-X8 design spike before P8-6 (C1–C2).
- The root ESLint scope for `server/` (J2), at P8-2.

None of the 21 P8-0 decisions is treated as approved by this review.

---

## 8. Phase and task status (unchanged)

Phase 7 **IN PROGRESS** (TASK 008 active; P7-C not authorized). Phase 8 **NOT STARTED**. Phase 2 **In Progress**. No milestone, gate or historical decision is changed by this document.

---

## 9. Method and reproducibility

- **Harness (outside the repository, scratchpad):** the repository's real modules (`GameEngine`, `LocalRoundAuthority`, `DiveSimulation`, the outcome functions, `payoutCents`, `createWalletStore`) bundled read-only with the installed `rolldown` (alias `@` → `src`). No repository file was modified or generated. Seeded xoshiro128** streams with 53-bit doubles model A0.
- **Rigorous bounds:** the no-goldfish dive on the real `DiveSimulation`; the monotonicity argument of §2.2 item 3; the fastest-dive bound with permanent maximal boost.
- **Path Monte Carlo:** 2.4 M full dives (12 seeded batches). Per path, the crash probability and E[F] are integrated exactly (P(survive m) = 0.9603/m for m ≥ 1.01, 0.97 below), so the only sampling error is over world paths.
- **Independent restatement:** the dive rewritten from the formulas without engine imports agrees with the real `DiveSimulation` **bit for bit** on 20,000 paths (every tick multiplier and floor tick).
- **Outcome sampling:** 4 M draws of the real `sampleJackpot` / `rollBonusChests`: E[J] = 142.513, E[C] = 5.674, E[F] = 808.44 ± 0.77 (analytic 809.40); E[max of 3] = 11.228 (analytic 11.232).
- **End-to-end:** see §2.3.
- The scripts are not committed. They can be copied to `qa/p8-0-review/` (untracked, like the Phase 7 harnesses) if the owner wants them kept.

*This review is documentation only. It approves nothing, starts nothing, and leaves every historical decision unchanged.*
