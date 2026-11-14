# ENGINE ARCHITECTURE

Status: Approved design (Sprint 3, Commit 1)
Scope: Game Engine only. This document changes no code.
Goal: The single source of truth for every future Engine refactor and implementation. Every engine extraction commit is a mechanical execution step that consults this document; no engine commit should ever need to make an architectural decision.

Benchmark: production multiplayer crash games (Aviator, JetX class) — a server-authoritative round engine driving thousands of concurrent clients, where the client engine is a deterministic replica that renders correctly from any snapshot, survives reconnects, and is provably unable to influence outcomes.

Companion contract: `docs/05_RENDERING_ARCHITECTURE.md` (binding, fully implemented). The renderer's input (`RenderState`, `RenderTime`) is fixed; this document designs the system that produces it.

---

## 1. Purpose and Design Goals

The Game Engine is the authoritative owner of everything that *happens* in an AQUADIVE round: time, phases, the world, the multiplier, and outcomes. Today all of that lives inside the React component `AbyssAnchor.tsx`, interleaved with `useState`, refs, `setTimeout` chains and the rAF callback. The engine extracts it into a framework-agnostic module with one input edge (commands), two output edges (events + state snapshots), and no knowledge of React, canvas, or money.

Design goals, in priority order:

1. **Determinism.** Given the same starting snapshot, the same command sequence, and the same RNG stream, the engine produces the identical sequence of states. This is the property that makes replays, characterization tests, server reconciliation, and spectator joins possible. Everything else in this document serves it.
2. **Authority-swappable.** The engine must run in two modes with an identical core: *authority mode* (today — the client decides outcomes) and *replica mode* (Phase 8 — outcomes arrive from the server). The mode boundary is a single module (§16), not a rewrite.
3. **Framework independence.** No React, no DOM, no canvas. The engine is a plain TypeScript object that could run in a Web Worker, in Node on the server, or in a test — unchanged.
4. **Fixed contracts on both sides.** The renderer contract (`RenderState`/`RenderTime`) already exists and does not change. The backend contract (§16) is designed now so Phase 8 plugs in without touching the engine core or the renderer.
5. **Auditable money boundary.** The engine computes multipliers and outcomes; it never touches balances. Money math lives outside (§3), exactly as the renderer never knows money exists.
6. **Behavior preservation.** All gameplay formulas, distributions, tunings — including the known jackpot RTP flaw (TASK 001) — move verbatim. The only behavior changes are the five sanctioned deltas in §7.1, ratified by approval of this document.

## 2. Responsibilities of the Game Engine

The engine owns, exclusively:

- **The simulation clock** — fixed ticks, accumulated simulation time (§7, §8).
- **The round state machine** — all phase transitions, including the timed ones that today live in `setTimeout`/`setInterval` (§5).
- **Round lifecycle** — scheduling the betting window, starting dives, ending rounds, intermissions (§6).
- **World simulation** — anchor descent, creature spawning, goldfish collision, golden-boost gain/decay (§9).
- **The multiplier engine** — the growth curve, the boost bonus, the crash check (§9).
- **Outcome application** — crash point, sea-floor jackpot, bonus chests, via the `RoundAuthority` module (§11, §16).
- **Participant round state** — bet placed this round, cashed-out flag and multiplier, chosen chest. (State about the player's *round*, never their wallet.)
- **Entity management** — the creature collection and its lifecycle (§10).
- **Command validation** — accepting or rejecting player commands against the current state (§13).
- **Event emission** — the typed event stream all other systems observe (§12).
- **State projection** — producing `RenderState`/`RenderTime` for the renderer, the public UI state for the HUD, and serializable snapshots (§14, §15).

## 3. Responsibilities That Belong Outside the Engine

| Concern | Owner | Notes |
|---|---|---|
| Wallet / balance / win math | Settlement layer (UI store now, Wallet Service in Phase 8) | Subscribes to engine events; computes `bet × multiplier` and mutates balance. The float-`toFixed(2)` math moves there verbatim; the integer-minor-units migration is a separate roadmapped task at this boundary and never enters the engine. *(2026-11-13, M1-D8: for payouts, "verbatim" is superseded. Wins are to be rounded down to the cent with exact integer arithmetic in the settlement layer (docs/07 §23.13). The engine is unaffected: it computes no payouts, and its events carry multipliers only.)* |
| Bet-vs-balance check | Settlement layer / UI | The engine validates a bet against *round state* (phase, already participating); whether the player can afford it is a wallet question answered before the command is submitted. *(2026-11-13: stake validity — a well-formed amount, independent of any balance — is proposed as an engine-side check under E-X2, §13.1; proposed, not approved. Affordability stays here.)* *(2026-11-14: E-X2 approved by the owner and implemented, uncommitted; the engine now rejects a stake that is not a valid stake. Affordability still stays here.)* |
| Rendering | `src/rendering` | Pure consumer of `RenderState` per `docs/05`. |
| UI / HUD / banners / history strip | React shell | Derives everything from engine events + public state. The engine emits no user-facing strings — a hard rule that keeps localization (roadmap) entirely outside. |
| Network transport | `src/network` | Protocol messages in/out; no game logic (existing README contract). |
| Asset loading | `src/rendering/assets.ts` | Already law (docs/05 §15). |
| Audio | `src/audio` (Phase 7) | Subscribes to the same event stream as FX. |
| Persistence, analytics, monitoring | Backend phases | Consume the event stream server-side. |
| Provably-fair commitment/verification | Server (Phase 8) + a client verification UI | The engine only *carries* seeds/results (§11). |
| Input handling | DOM → React → engine commands | The engine never reads input devices. |

## 4. Engine Boundaries

Import rules (enforceable in review, grep-level):

- `src/engine` imports only: its own modules, `src/shared`, and — one sanctioned **type-only** import — the renderer contract types (`RenderState`, `RenderCreature`, `RenderTime`) from `src/rendering`, because the engine implements the projection that produces them. No runtime import from `src/rendering` ever.
- No React, no DOM types, no canvas anywhere in `src/engine`. `requestAnimationFrame` and `performance.now()` appear in exactly one file: the driver (§13), which is the engine's edge to the host environment.
- No `Math.random()` anywhere in `src/engine` except the local RNG implementation inside the RNG module (§11).
- No `setTimeout`/`setInterval` anywhere in `src/engine` — all delays are simulation-time durations evaluated on ticks (§8).
- Nothing outside `src/engine` imports engine internals; the facade (§13) is the only public surface, mirroring the `scene-renderer.ts` convention.
- Constants ownership after extraction (resolves the "until the engine extraction relocates them" corrections in docs/05 §6/§18): gameplay tuning and simulation constants (`src/game/config.ts`, most of `src/game/constants.ts`, the pure math in `src/lib/abyss-game.ts`) become engine domain modules; pure presentation constants (`MAX_DPR`, `ANCHOR_SCREEN_Y_FRAC`, `ANCHOR_DRAW_H`, `ANCHOR_RING_Y_FRAC`, `SHIP_IMPACT_FX_SECONDS`, `BG_*`) move under `src/rendering`; world-geometry constants needed by both sides (`CHAIN_MAX_DEPTH`, `ANCHOR_WORLD_OFFSET_PX`, `SHIP_WORLD_Y`) move to the `src/shared` dependency floor. Exact file layout is finalized in the extraction commits; the ownership rule is fixed here.

## 5. Complete Round State Machine

Engine states get honest names; the renderer keeps the existing `Phase` strings via a fixed projection map, so the `RenderState` contract is untouched.

| Engine state | Renderer `Phase` | Meaning |
|---|---|---|
| `betting` | `"idle"` | Betting window open; countdown running; world at surface. |
| `diving` | `"diving"` | Anchor descending; multiplier growing; cashout available. |
| `crashed` | `"crashed"` | Chain snapped; crash banner interval before next round. |
| `impact` | `"cashed"` | Anchor hit the sea floor; jackpot locked; impact FX playing. |
| `bonus` | `"bonus"` | Three chests revealed; waiting for the pick; result interval after. |

Transitions (guard → action → target). All timed transitions are simulation-time durations owned by the state machine; on exit from a state its pending timer is cancelled — this structurally removes today's `setTimeout` race guards (`if (phaseRef.current === ...)`).

```
betting ──[countdown ≤ 0]────────────────────────────▶ diving
          entry(diving): RoundAuthority samples crashAt; world reset;
                          per-round participant flags reset; diveStartedAt := simTime

diving ──[multiplier ≥ crashAt]──────────────────────▶ crashed        (terminal for the tick, §6)
          entry(crashed): clamp multiplier to crashAt; emit crashed;
                          schedule CRASH_BANNER duration → betting

diving ──[worldY ≥ CHAIN_MAX_DEPTH]──────────────────▶ impact         (terminal for the tick, §6)
          entry(impact): RoundAuthority samples jackpot; lock jackpot multiplier;
                          impactAt := simTime; emit shipImpact;
                          schedule SHIP_IMPACT_TO_CHESTS duration → bonus

impact ──[timer]─────────────────────────────────────▶ bonus
          entry(bonus): RoundAuthority rolls chests; emit chestsRevealed

          (E-X1) local participant bonus-eligible ⇒ schedule BONUS_PICK_WINDOW (6 s = 360 ticks)
                 otherwise                         ⇒ schedule CHEST_RESULT duration (no pick, no chestPicked)

bonus ──[pickChest command, eligible] → apply chest ──[CHEST_RESULT duration]──▶ betting
bonus ──[pick window expired, eligible] → apply chest 0 (same path) ──[CHEST_RESULT duration]──▶ betting
bonus ──[timer, not eligible]────────────────────────▶ betting      (E-X1: no chestPicked)

crashed ──[timer]────────────────────────────────────▶ betting
          entry(betting): countdown := BETTING_WINDOW_SECONDS; emit bettingOpened
```

Rules and notes:

- **Manual cashout is not a transition.** It flips the participant's `cashedOut` flag while the state stays `diving` — exactly today's behavior (the anchor keeps descending after cashout).
- **Engine freeze exception E-X1 — bonus eligibility and deterministic completion** (owner-approved 2026-11-13, during the Sprint 4 engine freeze; supersedes the former "`bonus` has no timeout" note, under which an unpicked chest waited forever and spectators / manually cashed-out players had to pick to end the round):
  - *Eligibility.* The local participant is **bonus-eligible** iff it placed a bet this round and was auto-cashed at the jackpot on entry(impact) — i.e. it did **not** cash out manually. Recorded as `ParticipantRoundState.bonusEligible`, set at entry(impact). Spectators (no participant) and manual-cashout participants are ineligible.
  - *Eligible.* entry(bonus) schedules a pick window of `BONUS_PICK_WINDOW_MS` = 6 s = 360 ticks. A `pickChest` inside the window applies as before. If the window expires unpicked, the machine applies **chest 0** through the same apply path (same `chestPicked` event, same `finalMultiplier` math, same settlement), then the CHEST_RESULT interval → betting.
  - *Ineligible.* `pickChest` is rejected (`"not-bonus-eligible"`); no `chestPicked` is ever emitted for the round; entry(bonus) schedules the CHEST_RESULT interval and the round ends (`roundEnded { outcome: "jackpot" }`) with the chests revealed but never opened.
  - Jackpot and cashout settlement calculations are unchanged; the wallet's own exclusivity guards stay in force as defense in depth.
  - **Limitation — not the multiplayer rule.** E-X1 is a *local single-player demo* compatibility fix: whether the bonus phase waits for a pick depends on the one local participant's eligibility. That is **not** the authoritative global rule. In Phase 8 the server-authoritative round must complete the bonus phase on its own schedule, independent of any single player's eligibility; per-player eligibility then decides only who may pick and who is credited, and a server-side auto-pick (or per-player default) replaces the local chest-0 rule.
- **Engine freeze exception E-X3 — Dual Bet** (owner-approved 2026-11-14; committed in `be10b19`; §13.2). The local player holds up to **two independent bets per round**, one per slot (`BetSlot = 0 | 1`). Eligibility above applies **per slot**: at entry(impact) every participating slot that has not cashed out is auto-cashed at the jackpot and becomes bonus-eligible. The bonus phase still has **one** pick per round. It is offered (pick window scheduled) while **any** slot is eligible, and the single `chestPicked` applies to every eligible slot; settlement is per slot, in the wallet. With no eligible slot, the ineligible path above applies unchanged.
- Illegal transitions and commands invalid for the current state are rejected and reported (§12, §18) — never silently applied, never thrown across the tick boundary.
- The `crashed`/`impact` double-fire race that exists today (both conditions can trigger in the same frame because the current tick body has no early exit) is resolved by the terminal-transition rule in §6. Sanctioned delta D3.

## 6. Round Lifecycle

One full round, end to end:

1. **Betting** — countdown from `BETTING_WINDOW_SECONDS`, decremented per tick. `placeBet` commands accepted (one per participant per round; since E-X3, one per **slot** per round, two slots, §13.2). Countdown is *engine state* read by the UI each frame; the UI's 100 ms display interval is deleted (delta D5).
2. **Dive start** — automatic on countdown expiry (rounds run whether or not anyone bet — spectating already exists and stays). `RoundAuthority` fixes `crashAt`; the world resets (worldY = 0, creatures cleared, spawn cursor reset, boost = 0, multiplier = 1).
3. **Per-tick pipeline while `diving`** (fixed order, preserved verbatim from today's tick body):
   1. advance simulation clock
   2. multiplier from dive-elapsed simulation time (`multiplierAt`)
   3. boost decay; boost bonus added to multiplier
   4. crash check (`multiplier ≥ crashAt`) → transition, **end of pipeline for this tick**
   5. descent integration (`descentSpeed(m)` × boost speed factor × dt)
   6. creature spawning (spawn-ahead window, jittered interval)
   7. goldfish collision → boost gain
   8. sea-floor check (`worldY ≥ CHAIN_MAX_DEPTH`) → transition, **end of pipeline for this tick**
   A terminal transition (steps 4, 8) ends the pipeline for that tick. Today the remaining steps still run once after a crash — a measure-zero, invisible difference (next frame's phase check stopped them anyway), removed because it is the source of the §5 double-fire race. Sanctioned delta D3.
4. **Round end, path A: crash** — banner interval, then back to betting. If the participant hadn't cashed out, the settlement layer records the loss (the bet was already debited at `placeBet`).
5. **Round end, path B: jackpot** — jackpot locked and (if participating and not yet cashed) auto-cashed at the jackpot multiplier; impact FX; chests revealed; pick multiplies the jackpot (E-X1: eligible participant only — chest 0 is applied if the 6 s window expires; no pick for ineligible participants or spectators, §5); result interval; back to betting.
6. **Intermission = the next betting window.** There is no separate state; `betting` is both.

Round identity: every round gets a monotonically increasing `roundId`, stamped on all events and snapshots. Today nothing consumes it; multiplayer, history, and provably-fair verification all key on it, so it exists from day one (it costs one integer).

## 7. Fixed Tick Model

- **Tick rate: 60 Hz** (`TICK_SECONDS = 1/60`). Chosen to match the dominant display rate so per-tick integration granularity stays closest to today's per-frame granularity on typical hardware.
- **Accumulator driver.** The driver feeds wall-clock frame deltas into an accumulator; the engine consumes whole ticks: `while (acc ≥ TICK_SECONDS && ticksThisAdvance < MAX_TICKS_PER_ADVANCE) step()`.
- **Catch-up cap preserved.** `MAX_TICKS_PER_ADVANCE = 3` (= 0.05 s), the direct translation of today's `MAX_TICK_SECONDS` clamp. Excess accumulated time is dropped, exactly as the clamp drops it today: after a tab switch the world resumes, it does not fast-forward.
- **Simulation time is tick-derived**: `simTime = tickCount × TICK_SECONDS`. The multiplier, all phase timers, `animTime`, and FX elapsed all read this one clock.
- **Rendering is decoupled.** The driver renders once per rAF with the latest state, at whatever rate the display runs. Ticks and frames are independent; interpolation between ticks is deliberately *not* built now (at 60 Hz ticks the error is ≤ one frame) — reserved for replica mode if server snapshot rates demand it (§17).
- **Determinism statement**: state(n+1) = f(state(n), commandsAppliedAtTickBoundary, rngDraws). No other inputs exist. This is the invariant every engine commit must preserve.

### 7.1 Sanctioned behavior deltas

The only intended behavior changes of the entire engine extraction. Approval of this document ratifies them; each is called out again in the commit that lands it.

| # | Delta | Today | After | Why sanctioned |
|---|---|---|---|---|
| D1 | Multiplier & phase timers move to the simulation clock | Multiplier uses *wall-clock* elapsed while descent uses *clamped* dt — after a tab-away the multiplier (and crash) jump ahead while the world stands still | One clock; multiplier and world can never diverge | The current split is an inconsistency, not a feature; determinism requires one clock |
| D2 | Fixed 60 Hz integration replaces display-rate variable dt | dt = display frame time (≈7 ms at 144 Hz) | dt = 16.6 ms always | Descent is a Riemann sum of a smooth curve; the difference is sub-pixel over a dive, and identical across all devices — an anti-flaw for fairness |
| D3 | Terminal transition ends the tick pipeline | Post-crash steps still run once; crash and floor can double-fire in one frame | Pipeline exits at the transition | Removes a real race; visually unobservable |
| D4 | Commands apply at the next tick boundary | `cashOut` reads the multiplier from the last React render | Cashout uses the tick-authoritative multiplier | ≤ one frame difference; removes a stale-state read (the engine value can only be *more* current) |
| D5 | Countdown/HUD values are per-frame state reads | 100 ms `setInterval` UI updates | UI reads engine state each frame | Cosmetic; smoother, and deletes a timer |

## 8. Time Management

Exactly three clocks exist in the system, each with one owner:

| Clock | Owner | Consumers | Rule |
|---|---|---|---|
| Wall clock (`performance.now`) | Driver only | Feeds the accumulator; measures render `frameDt` | Never visible inside engine logic |
| Simulation clock (`simTime`, tick-derived) | Engine | Multiplier curve, phase timers, countdown, spawn scheduling, boost decay, `animTime`, FX elapsed | The only clock gameplay may read |
| Render time (`RenderTime { animTime, frameDt }`) | Driver assembles from the two above | Renderer | Already law (docs/05 §4) |

Consequences:

- Every `setTimeout`/`setInterval` in the component today (`CRASH_BANNER_MS`, `SHIP_IMPACT_TO_CHESTS_MS`, `CHEST_RESULT_TO_IDLE_MS`, `CASH_FLASH_MS`/`JACKPOT_FLASH_MS`, the countdown interval) is replaced: round-lifecycle delays become state-machine durations on the simulation clock; pure UI flash timings (`CASH_FLASH_MS`, `JACKPOT_FLASH_MS`) stay in the UI shell — they are presentation, not round lifecycle.
- Timer quantization to whole ticks (±16.7 ms vs. today's millisecond timers) is inside human perception threshold and covered by D1.
- **Ship-impact FX elapsed** becomes `simTime − impactAt`, computed by the engine into `RenderState.shipImpact.elapsed`. The `performance.now()` bookkeeping block in the component (the caller-side half of the docs/05 R5 handoff) is deleted; the renderer contract is unchanged.
- `animTime` continues as the accumulated clamped clock — after extraction that is precisely `simTime`, preserving sway/bubble behavior including the "no fast-forward after tab-away" property.

## 9. Simulation Responsibilities

The `diving` pipeline (§6.3) decomposes into five systems. All formulas, tables and constants move **verbatim**; sources named so extraction commits are mechanical:

| System | Owns | Today lives in |
|---|---|---|
| Multiplier | `multiplierAt` curve, boost bonus (`+ boost × BOOST_MULTIPLIER_BONUS`), crash clamp | `abyss-game.ts` + tick body |
| Descent | `descentSpeed(m)` × `(1 + boost × BOOST_SPEED_FACTOR)` × dt integration | `abyss-game.ts` + tick body |
| Spawner | spawn-ahead window (`SPAWN_AHEAD_PX`), jittered interval (`CREATURE_SPAWN_EVERY − rng × SPAWN_JITTER_PX`), depth-banded kind tables, creature attribute rolls | `spawnCreature` + tick body |
| Collision | goldfish pickup (`COLLISION_DY_PX` / `COLLISION_DX_FRAC` against anchor point `worldY + ANCHOR_WORLD_OFFSET_PX`) → boost gain | tick body |
| Boost | gain per goldfish, decay per second, clamp [0, 1] | tick body |

Notes fixed here:

- The engine's anchor position for collision is `worldY + ANCHOR_WORLD_OFFSET_PX` — the *simulation* anchor. The renderer's sway offset is presentation and must never feed back into collision (already law, docs/05 §9). The collision X-window is a fraction of screen width today (`COLLISION_DX_FRAC` vs. creature `x`); it is resolution-independent as written (both sides are 0..1 fractions) and moves as-is.
- The multiplier curve and distributions are *domain* modules (pure functions), separable from the systems that call them — they are what client and server will share in Phase 8. `timeForMultiplier` (currently unused, on the lint baseline) lives there; replica-mode extrapolation (§17) is its intended consumer.
- Physics beyond descent (the roadmap's "Physics" objective) is *this*: descent kinematics, collision, boost. No general physics engine is built — non-goal (§20).

## 10. Entity Management

Deliberate decision, mirroring the renderer's no-scene-graph stance: **a flat, engine-owned creature array — no ECS, no entity framework.**

- Creatures are plain data (`id`, `kind`, `x`, `worldY`, `size`, `phase`, `dir`, `consumed?`), id from a per-engine counter, collection reset at dive start.
- Lifecycle: spawned by the Spawner ahead of the anchor; mutated only by the Collision system (`consumed`); cleared on round reset. Within a round the array grows to a few hundred entries at most (bounded by dive length) — no pruning needed today. The pruning rule from docs/05 §14.4 (drop creatures far above the viewport) is an engine responsibility *when profiling demands it*; recorded, not built.
- Projection: `RenderCreature` (`Pick` of the draw-relevant fields, `readonly`) — the renderer never sees engine-internal fields.
- A second entity kind (e.g., obstacles) = a second flat collection with its own system + projection. If genuinely shared behavior emerges across three-plus kinds, that is the trigger to reconsider — documented so nobody bolts an ECS on casually.

## 11. RNG Boundary

The finding that shapes this section: **every random draw in the engine is outcome-relevant.** Crash point, jackpot, and chests obviously so — but creature spawning too, because goldfish placement → boost → multiplier bonus **and** descent speed → payout and time-to-floor. There is no "cosmetic randomness" in the engine; all cosmetic RNG already lives in the renderer's Effects layer (docs/05 §12) and stays there.

Design:

- One injected `Rng` service (`rng.next(): number` in [0, 1), seedable). Every draw site in the engine calls it; `Math.random` appears only inside the local implementation.
- **Two named streams**, drawn independently: `outcome` (crash point, jackpot, chest values) and `world` (spawn intervals, creature kinds/attributes). Same interface, separate sequences — so a server can disclose the world seed to all clients (identical creatures for every spectator, replayable) while outcome values follow the provably-fair commitment scheme and are disclosed per-event.
- **Authority mode (now):** both streams are `Math.random`-backed. The client-authoritative RNG/economy is a known, accepted flaw (TASK 001) until Phase 8 — the boundary exists so fixing it is a swap, not a refactor.
- **Replica mode (Phase 8):** outcome values arrive as protocol events (the engine never draws them); the world stream is seeded from the server's per-round seed and consumed deterministically by tick order.
- Tests inject a seeded deterministic `Rng` — this plus §7 determinism is what makes characterization and replay tests possible at all.
- Provably-fair commitment (hash of server seed published pre-round, revealed post-round) is server-side Phase 8 design; the engine's only obligation, met by this section, is that outcome consumption is isolated and per-round keyed (`roundId`).

## 12. Engine Events

The event bus is the engine's broadcast edge: typed, synchronous, fire-and-forget. It is how settlement, UI, FX, audio (Phase 7), and analytics (Phase 8+) observe the game without the engine knowing they exist.

Event map (payloads carry `roundId`; shapes finalized in the extraction commit that lands the bus):

| Event | Fired on | Primary consumers |
|---|---|---|
| `bettingOpened` | entry(betting) | UI |
| `betPlaced { amount }` | accepted bet command | Settlement (debit), UI |
| `commandRejected { command, reason }` | any invalid command | UI (dev-visible), monitoring later |
| `diveStarted` | entry(diving) | UI |
| `cashedOut { multiplier }` | accepted cashout | Settlement (credit), UI banner |
| `crashed { multiplier }` | entry(crashed) | Settlement (loss record), UI, history, FX/audio later |
| `shipImpact { jackpotMultiplier }` | entry(impact) | Settlement (jackpot credit), UI, history; FX already ride `RenderState.shipImpact` per docs/05 §17 |
| `chestsRevealed { chests }` | entry(bonus) | UI |
| `chestPicked { chestId, chestMultiplier, finalMultiplier }` | accepted pick, or pick-window expiry (chest 0) — eligible participant only (E-X1, §5); since E-X3 one per round, applying to every eligible slot | Settlement (delta credit), UI, history |
| `roundEnded { outcome }` | entry(betting) from crashed/bonus | History, analytics later |
| `stateChanged { from, to }` | every transition | UI shell, debugging |
| `engineError { code, detail }` | invariant violation (§18) | UI, monitoring later |
| *(reserved)* `goldfishConsumed`, `boostExpired` | collision/boost systems | future FX/audio triggers — the docs/05 §17 event channel |

*E-X3 (2026-11-14, §13.2):* `betPlaced` is `{ roundId, slot, amount }` and `cashedOut` is `{ roundId, slot, multiplier }`, one event per slot. `shipImpact` and `chestPicked` keep their shapes. `commandRejected` gains the reason `"invalid-slot"`.

Rules:

- **Edge-triggered only.** Nothing fires per tick; continuous values (multiplier, countdown, boost) are *state*, read via `getPublicState()` each frame — the same pull model the renderer uses. This keeps the bus quiet enough to serialize wholesale to a server or an analytics sink later.
- **Dispatch happens after the tick completes**, from a per-tick queue — listeners always observe a consistent post-tick engine state, never a mid-pipeline one.
- **Listeners cannot reenter.** Commands submitted from inside a listener are queued for the next tick like any other command (§13) — no reentrancy by construction.
- **Listener exceptions are firewalled** by the bus: caught, logged, remaining listeners still run (§18). A broken FX hook must never kill settlement.
- Events may start *cosmetic or bookkeeping* behavior only; nothing a listener does can influence the simulation mid-round except by submitting commands.

## 13. Engine Public API

One facade, one driver, mirroring the `SceneRenderer` convention (only the facade is imported from outside `src/engine`):

```ts
// Commands — the input edge. These shapes ARE the future protocol messages.
// E-X3 (2026-11-14, §13.2): placeBet and cashOut carry a mandatory slot.
type BetSlot = 0 | 1;
type EngineCommand =
  | { type: "placeBet"; slot: BetSlot; amount: number }
  | { type: "cashOut"; slot: BetSlot }
  | { type: "pickChest"; chestId: 0 | 1 | 2 };

class GameEngine {
  constructor(deps: { rng: Rng; authority: RoundAuthority; config: EngineConfig });

  advance(wallDtSeconds: number): void;      // driver-only: accumulate → step ticks → dispatch events
  submit(command: EngineCommand): void;      // queued; validated + applied at the next tick boundary

  readonly events: EventBus<EngineEventMap>; // subscribe/unsubscribe

  getRenderState(): RenderState;             // projection, docs/05 §4 shape, byte-compatible
  getRenderTime(): RenderTime;               // { animTime: simTime, frameDt }
  getPublicState(): EnginePublicState;       // phase, countdownSeconds, multiplier, boost,
                                             // participants: [slot 0, slot 1], each
                                             //   {betAmount, cashedOut, cashedOutAt, bonusEligible} | null
                                             //   (E-X3; was the single `participant`),
                                             // chests, chosenChestId, roundId
  snapshot(): EngineSnapshot;                // §14
  restore(snapshot: EngineSnapshot): void;   // §14
}
```

- **The driver** (`EngineDriver`, client-side) owns the rAF loop and the wall clock — the two host-environment dependencies. Per frame: `engine.advance(wallDt)` → `renderer.frame(engine.getRenderState(), engine.getRenderTime())` → sync the UI store from `getPublicState()`. The rAF loop leaves the React component; docs/05 §17 ("the rAF loop belongs to the engine driver") is fulfilled.
- **Engine lifetime is decoupled from React.** The driver+engine pair is owned per game session (module/app scope), not per component mount; a thin hook attaches/detaches the canvas and store. Remounting the component no longer restarts the world — the engine-side twin of the renderer's docs/05 §2.3 fix.
- **Command queue.** Commands are validated against the state *at the tick they apply*, not at submit time. Rejections emit `commandRejected` — commands never throw. This single mechanism gives determinism (commands are part of the replayable input log) and is wire-shaped for Phase 8: in replica mode `submit` forwards to the server and the authoritative accept/reject comes back as an event.
- `EngineConfig` carries the tuning currently in `src/game/config.ts`/`constants.ts` (injected, not imported ambient) — the future server-configurable surface (admin panel, Phase 9) and the white-label hook on the gameplay side.

### 13.1 Engine freeze exception E-X2 — valid-stake enforcement (proposed 2026-11-13; APPROVED BY THE OWNER 2026-11-14, AS IMPLEMENTED; committed in `e37b81c`)

*Reconciliation (2026-11-14, documentation only):* E-X2 landed in the M1 S1 commit `e37b81c`, which is on `origin/develop`. In that commit, `src/engine src/rendering src/shared` differ by exactly the four E-X2 files. Where the paragraphs below say "uncommitted", they record the state before that commit.

**Current status (2026-11-14).** The owner explicitly approved the E-X2 change already implemented in the working tree: the shared stake-validation predicate, the engine `placeBet` validation, their tests and the UI re-export. The freeze exception is **not expanded** beyond the files below. The change is uncommitted. Under owner decision Q14 = S1 it lands inside the single atomic M1 integration commit, and only after the owner separately authorizes the Git operation (docs/07 §23.9, §23.18). The status paragraphs that follow ("not approved", "planning only") are kept as the record of 2026-11-13. They no longer describe the authorization.

| File | Implemented change |
|---|---|
| `src/shared/stake.ts` (new) | `MIN_STAKE = 0.01` and `isValidStake(amount: unknown)`: a `number`, finite, ≥ 0.01, and `+amount.toFixed(2) === amount` (docs/07 §23.4). No ceiling (Q1: B-R, docs/07 §23.20) |
| `src/shared/stake.test.ts` (new) | The predicate's matrix |
| `src/engine/state-machine.ts` | One import (`isValidStake` from `@/shared/stake`, line 37). In `applyPlaceBet`, the guard `!(command.amount > 0)` becomes `!isValidStake(command.amount)`, with three comment lines. Reason `invalid-amount`, rejection order and everything else are unchanged |
| `src/engine/state-machine.test.ts` | The existing amount pin is **extended in place**. It is retitled, and it now also rejects `0.005`, `0.123`, `NaN`, `Infinity` and `-1` and asserts that no `betPlaced` is emitted. The original amount-`0` → `invalid-amount` expectation is unchanged. There is also a new `E-X2` block: accepted whole-cent stakes, rejected sub-cent, non-finite and non-number payloads, and replay determinism |
| `src/ui/store/stake.ts` (new; not frozen) | Re-export of `isValidStake` and `MIN_STAKE` for the UI. One predicate (K4) |

Two details differ from the candidate scope's wording below, and the approval covers them as implemented:

- the import line lies outside "lines 216-222 only";
- the existing pin was extended, not left "unmodified". Its original assertion still holds.

Freeze audit: `git diff --stat src/engine src/rendering src/shared` together with the untracked files lists exactly the four frozen-directory files above (verified 2026-11-14).

Status (2026-11-13): the owner approved *planning* this exception on 2026-11-13 (Money Integrity decision M1-D4, docs/07 §23). The owner has **not** approved its implementation scope. Until that approval is recorded here and in docs/07 §19 gate 4, the engine freeze stands unchanged, E-X1 remains the sole approved exception, and nothing in this subsection authorizes a code change. E-X2 does not widen E-X1: E-X1's file list and rules (§5) are untouched.

*Status after the security boundary review (owner decision M1-D12, 2026-11-13).* E-X2 remains approved **for planning only**. No engine implementation is authorized. The owner's other decisions leave E-X2's candidate scope below unchanged:

- C3, the provisional commit plan (M1-D9, docs/07 §23.14), keeps E-X2 + M1-1 as commit 1, exactly as before.
- The V2 payout-rounding fix (M1-D7, M1-D8) needs **no** engine change: the engine computes no payouts, and its events carry multipliers only (§3).
- The wallet's non-finite guards are settlement-layer code.

The following are recorded as known limitations (M1-D11, docs/07 §23.15). They are **not** part of E-X2:

- public `events.emit`;
- `restore()` validation;
- live references returned by `getPublicState()` and the `chestsRevealed` payload;
- `snapshot()` exposing `crashAt`;
- `advance(NaN)`;
- validation of authority outputs.

E-X2 closes the *command* edge for every caller. It does not authenticate events, and no wallet guard does either.

*Status after the final financial integrity reconciliation (owner decisions M1-D13 to M1-D16, 2026-11-13; docs/07 §23.1, §23.16–§23.19).* E-X2 is **still approved for planning only**, and its candidate scope below is unchanged:

- **Payouts (M1-D13).** They are computed in the settlement layer, from the accepted stake and the authoritative multiplier carried by the events, rounded down with exact BigInt arithmetic. The engine's multiplier generation is unchanged, including the `+(jackpot × chest).toFixed(2)` of `finalMultiplier` (`state-machine.ts:267`), and so is determinism. No engine file is added for this.
- **Invalid multipliers and wallet integrity (M1-D14, M1-D15).** Rules W1–W9 are settlement-layer code. They use the `roundId` every event already carries (§12), and they need no new payload field.
- **Out of scope for E-X2.** Event identifiers (`betId`, `participantId`, `settlementId`), a private emitter, `restore()` validation and a multiplier contract are engine changes, and each would need **its own owner-approved freeze exception**. None is part of E-X2 or M1.
- **Publication (M1-D16).** The proposed plan C4 (docs/07 §23.18) develops E-X2 in a local working commit and publishes it only inside one atomic integration commit, together with the UI and settlement changes. E-X2 keeps its own implementation approval gate. The engine and shared-floor part of that integration commit must equal the approved E-X2 file list exactly.

**Why it is needed.** `placeBet` validates the amount with one comparison, `!(command.amount > 0)` → `"invalid-amount"` (`src/engine/state-machine.ts:222`). That guard is correct for what it covers and stays:

| Amount | Today (`state-machine.ts:219-230`) | Required by M1-D1/D2 |
|---|---|---|
| `NaN`, `0`, `-0`, negative, `-Infinity` | rejected, `invalid-amount` | rejected (no change) |
| `+Infinity` | **accepted**; `betPlaced { amount: Infinity }` emitted (`:229`) | rejected |
| positive below 0.01 (`0.001`, `0.004`, `0.005`, `0.009`) | **accepted** | rejected |
| positive with a fractional cent (`1.005`, `0.123`) | **accepted** | rejected |
| finite but beyond exact cent representation (e.g. `1e300`) | **accepted** | open — question Q1, docs/07 §23.9 |

Confirmed gaps: the engine accepts stakes that are not whole cents, and `+Infinity`. The settlement layer then debits `+(balance − amount).toFixed(2)` (`src/ui/store/wallet-store.ts:143-153`), which is a zero debit for `0.001`–`0.005` while the payout `+(roundBet × m).toFixed(2)` (`:165`, `:186`, `:218`) is non-zero from a modest multiplier upward — the M1 vulnerability (docs/07 §23.2). Today only the UI stands between such a command and the engine; commands are the future protocol messages (§13), so the authoritative boundary must not depend on a well-behaved client.

**Intended validation boundary.** The engine becomes the authoritative validator of *stake validity* — a property of the command payload alone — exactly as it is already the validator of every round-state question. `applyPlaceBet` accepts an amount iff the shared valid-stake predicate holds (docs/07 §23.4); anything else is rejected with the **existing** reason `"invalid-amount"`: no new reason code, no new event, no payload change. The check keeps its current position, after `not-in-betting` and `already-participating`, so rejection precedence is unchanged.

**Separation from wallet settlement (unchanged law, §3).** E-X2 adds no balance, no affordability check and no money arithmetic to the engine. Stake validity ("is this a well-formed amount of money") is engine-validated; affordability ("can this player pay it") stays a wallet question answered before submit; debit and credit math stays in the settlement layer. The engine still never sees a balance.

**Why the engine must be the enforcement point** (review, 2026-11-13; docs/07 §23.12). Events are post-tick facts (§12): a listener cannot veto or undo an acceptance, and no command cancels a bet. A settlement layer that refuses an accepted `betPlaced` therefore leaves the engine holding a participant the wallet does not know, and nothing can reconcile them before the round ends. The invariant "no engine-accepted participation without a correctly debited wallet stake" can only be enforced at acceptance. The engine's acceptance rule must never be weaker than any wallet rule on `betPlaced`. E-X2 provides exactly that, and nothing more.

**Candidate scope — every item requires owner approval before any change:**

| File | Change | Note |
|---|---|---|
| `src/shared/stake.ts` (new; name open) | The single valid-stake predicate and the minimum-stake constant | One definition for engine and UI (Master Rules: never duplicate logic). `src/shared` is the dependency floor both layers may import (§4, docs/07 §6) and is itself frozen, so this file is part of the exception. Alternative home: an engine domain module re-exported by the facade — question Q2, docs/07 §23.9 |
| `src/shared/stake.test.ts` (new) | The predicate's test matrix (docs/07 §23.7) | |
| `src/engine/state-machine.ts` | Lines 216-222 only: the amount guard (line 222) calls the shared predicate, and the comment above it (216-218) states that the engine now validates stake validity but still never sees a balance | No other line; reason string unchanged |
| `src/engine/state-machine.test.ts` | New rejection/acceptance cases, including a non-number payload (`amount: "5"`, accepted by today's `> 0`, rejected by the predicate; added 2026-11-13 from the security boundary review) and replay with rejected stakes | The existing pin (`:219-231`, amount `0` → `invalid-amount`) stays valid, unmodified |

Explicitly **not** in the candidate scope: `src/engine/game-engine.ts` (no state shape changes, so no snapshot schema bump), `src/engine/commands.ts`, `src/engine/events.ts`, `src/engine/domain/*`, `src/engine/simulation.ts`, `src/rendering`, and every other file under `src/shared`.

**Test compatibility and commit grouping** (review, 2026-11-13). Landed alone, this scope fails an existing UI test. `src/ui/screen.bet-input.test.tsx:104-114` places a `0.123` bet through the real engine, which would now reject it. It would also leave PLACE BET enabled for stakes the engine silently rejects. docs/07 §23.8 therefore recommends landing E-X2 in **one commit with M1-1** (the non-frozen UI and session edges). That bundles UI files into the commit; it adds **no** engine or shared-floor file to the exception. The bundling itself needs the owner's explicit approval (docs/07 §23.9, Q2). *(2026-11-13, M1-D16: under the proposed plan C4 the published unit is one atomic integration commit, which contains E-X2, M1-1 and the settlement integrity changes. E-X2 + M1-1 exists only as a local, never-pushed working commit (docs/07 §23.18, Q14).)*

**Existing guards to reuse, not duplicate.** The `> 0` comparison is subsumed by the predicate's minimum (0.01) and is replaced, not kept beside it. Duplicate-bet and wrong-phase rejections (`:220-221`) are untouched. Settlement exclusivity and idempotency live in the wallet (docs/07 §10) and are not mirrored in the engine.

**Determinism and replay (§7, §14).** The predicate is a pure function of the command amount: no RNG draw, no clock, no state read. A rejected `placeBet` takes the existing reject path — state untouched, one `commandRejected` queued for post-tick dispatch — so `state(n+1) = f(state(n), commands, rngDraws)` holds unchanged and no RNG stream position moves. Consequences to record with the implementation:

- A command log containing a stake that was accepted before E-X2 and is invalid after it replays differently (rejected; the participant is absent for that round). This is the sanctioned behavior change, not a determinism defect. No such log is persisted today.
- `restore()` assigns `participant.betAmount` without validation (`src/engine/state-machine.ts:382-395`). Snapshots are authority-produced, trusted data (§14); validating them is outside the narrowest scope and is recorded as question Q4 (docs/07 §23.9), not silently added.
- Outcome multipliers are produced by the `RoundAuthority`, not by commands, and are out of E-X2's scope. With `LocalRoundAuthority` they are finite by construction: `sampleCrashPoint` ≤ 200 (`src/engine/domain/outcomes.ts:22-30`), `sampleJackpot` ≤ 500 (`:34-41`), chests ≤ 50 (`:43-55`), `finalMultiplier` ≤ 25,000 (`state-machine.ts:267`). The live cashout multiplier stays below ≈ 6.61, because the dive reaches `CHAIN_MAX_DEPTH` by tick 1290 at the latest. That limit comes from tuning and is not a named cap (docs/07 §23.11). An injected authority is checked for neither range nor finiteness. A multiplier contract — a named cap plus a finiteness check — would be a separate engine change and is **not** part of E-X2 (recorded, not changed).

**Why it remains proposed.** The engine is a frozen, binding contract for Sprint 4 (docs/07 §19 gate 4). The owner's M1-D4 decision approves planning E-X2 and requires a separate, explicit approval of the final implementation scope. The scope above is a candidate for that approval; open questions Q1, Q2 and Q4 must be answered first. Q1 (a technical stake ceiling) remains **open**: no bound is adopted, and the candidates are analyzed in docs/07 §23.11. *(2026-11-13, M1-D10: stake, balance and payout ceilings all stay unresolved until each is supported by mathematical analysis and approved by the owner. E-X2's predicate therefore carries no ceiling unless Q1 is decided first.)*

### 13.2 Engine freeze exception E-X3 — Dual Bet (owner-approved 2026-11-14; committed in `be10b19`)

**Status.** The owner approved E-X3 on 2026-11-14, after the Dual Bet mobile layout decision (docs/16). That decision had recorded that Dual Bet was blocked on a frozen-contract exception plus an M1 rule amendment. E-X3 is the exception. The M1 wallet amendment (W2 and W3 per slot) is recorded in docs/07 §23.17. Both landed in `be10b19`, which is on `origin/develop`; that commit's message (`feat: update engine and UI state handling`) does not name E-X3. The file scope below is recorded from that commit. No separate pre-implementation scope document existed.

**Rule.** The local player holds up to two independent bets per round, one per slot (`BetSlot = 0 | 1`, exported with `BET_SLOTS` from the facade).

- `placeBet { slot, amount }` and `cashOut { slot }` carry a **mandatory** slot. A slot other than 0 or 1 is rejected as `"invalid-slot"`, checked first. After that, every existing guard applies **per slot**: `not-in-betting`, `already-participating` (this slot), `invalid-amount` (E-X2 predicate, unchanged), `not-diving`, `not-participating`, `already-cashed-out`.
- `betPlaced` and `cashedOut` carry the slot (§12). Each manual cashout is its own event.
- entry(impact): every participating slot that has not cashed out is auto-cashed at the jackpot and marked `bonusEligible` (E-X1 per slot, §5).
- Bonus: **one** chest pick per round. The pick window is scheduled while any slot is eligible, and the one `chestPicked` applies to every eligible slot. `pickChest` keeps its shape.
- entry(betting) clears both slots.
- The engine still never sees a balance (§3). It can accept two bets whose sum exceeds the balance, so the session's submit path reserves the other slot's in-flight stake before forwarding a bet (docs/07 §8). Settlement, rounding and fault isolation are per slot, in the wallet (docs/07 §23.17).

**Public state and snapshot.** `EnginePublicState.participant` and `RoundSnapshot.participant` become the per-slot tuple `participants: [slot 0 | null, slot 1 | null]` (type `ParticipantSlots`). `SNAPSHOT_SCHEMA_VERSION` is bumped from 2 to 3. Snapshots are in-memory only, so a v2 snapshot is rejected by `restore()` as a schema mismatch.

**File scope as committed (`be10b19`).** `git diff --stat` over `src/engine src/rendering src/shared` lists exactly these eight engine files, and nothing in `src/rendering` or `src/shared`:

| File | Change |
|---|---|
| `src/engine/commands.ts` | `BetSlot`, `BET_SLOTS`; `slot` on `placeBet` and `cashOut` |
| `src/engine/events.ts` | `slot` on `betPlaced` and `cashedOut`; doc comments on `shipImpact` and `chestPicked` |
| `src/engine/state-machine.ts` | Per-slot `_participants`, `invalid-slot` guard, per-slot place and cashout, per-slot impact auto-cash, any-slot eligibility, snapshot and restore copies |
| `src/engine/game-engine.ts` | `participants` in `EnginePublicState`; schema version 3 |
| `src/engine/index.ts` | Facade exports `BET_SLOTS`, `BetSlot`, `ParticipantSlots` |
| `src/engine/state-machine.test.ts`, `src/engine/game-engine.test.ts`, `src/engine/snapshot.test.ts` | Updated and new slot cases |

Not touched: `src/engine/domain/*`, `src/engine/simulation.ts`, `src/engine/driver.ts`, `src/rendering`, `src/shared`. The exception is not expanded beyond this list.

**Limitations.** E-X3 is a local single-player rule, like E-X1. In Phase 8, slot identity becomes part of the server bet identity (§16, docs/07 §23.12). The recorded validation for `be10b19` is the commit itself: its message records no test, type-check or build results, and no owner browser QA for Dual Bet is recorded yet.

## 14. Snapshot Model

A snapshot is the complete, serializable, plain-data state of the engine — the unit of restore, reconnect, spectator join, replay, and testing.

Contents (exact fields finalized in the extraction commit; categories fixed here):

- `schemaVersion`, `roundId`, `tickCount` (⇒ `simTime`)
- State-machine position: current state + remaining duration of its pending timer (if any) + countdown remaining
- Round data: dive-start sim time, `crashAt`†, jackpot multiplier (once locked), chest values† (once rolled), `impactAt`
- World: `worldY`, boost, spawn cursor (`nextSpawnAt`, next creature id), creature array
- Participant state: bet amount, cashed-out flag + multiplier, bonus eligibility (E-X1, §5), chosen chest. Since E-X3 (§13.2) this is held per bet slot (`participants`, two entries), and the schema version is 3
- RNG stream positions (seeded mode) — so restore + replay continues the identical sequence

† **Secrecy classes.** Fields marked † are *authority-secret*: they exist before they are publicly knowable (`crashAt` from dive start, chest values from reveal). Two snapshot views follow: **AuthoritySnapshot** (everything — local mode, server internal) and **PublicSnapshot** (secrets withheld until their disclosure event). The server broadcasts only PublicSnapshots; a client can never be handed the crash point early. In today's authority-mode client the distinction is latent (one process), but the shape is designed now so Phase 8 does not re-cut the snapshot.

Invariants:

- Plain JSON-serializable data — no functions, no class instances, no DOM handles.
- `RenderState` and `EnginePublicState` are pure projections of (snapshot, simTime); given a snapshot, the first rendered frame is correct by construction — this is the reconnect/spectator-join guarantee of docs/05 §17 made concrete.
- Determinism restated on snapshots: `restore(s)` + identical commands + identical RNG ⇒ identical subsequent snapshots. This is the contract the future test harness asserts.

## 15. Renderer ↔ Engine Contract

Already fixed by docs/05; restated as obligations on the engine:

- The engine produces `RenderState` **byte-compatible** with the docs/05 §4 shape: `phase` (via the §5 projection map), `worldY`, `depthRatio` (= `min(1, worldY / CHAIN_MAX_DEPTH)`), `boost`, `creatures` (projected, readonly), `crashed`, `shipImpact { elapsed } | null` (simulation-clock based, §8).
- Two channels in, zero out (docs/05 §17): per-frame state pull + sparse FX events (reserved events in §12); the renderer emits nothing back. The renderer never imports from `src/engine`; the engine's one type-only import from rendering (§4) points the dependency arrow the safe way.
- The driver is the only mediator: the renderer never schedules itself, the engine never draws. `RenderTime.animTime = simTime` preserves all sway/bubble behavior.
- No money, no bets, no multiplier *values* cross this boundary — unchanged law.

## 16. Backend ↔ Engine Contract

Designed now, implemented in Phase 8. The boundary is the `RoundAuthority` module plus the `RoundService` interface already reserved in `src/network`:

- **`RoundAuthority`** is the only place outcome decisions are made: `sampleCrashPoint`, `sampleJackpot`, `rollBonusChests` (moved verbatim from `abyss-game.ts` / the component). The state machine *asks* the authority at the transition points (§5); it never draws RNG itself.
  - `LocalRoundAuthority` (now): draws from the injected outcome RNG stream. This is today's behavior behind tomorrow's seam.
  - `RemoteRoundAuthority` (Phase 8): returns outcomes received from the server via `RoundService`; the client engine becomes a replica that *applies* outcomes instead of deciding them.
- **Engine core is mode-blind.** State machine, simulation systems, projections, snapshots, events — identical in both modes. The mode is chosen by dependency injection at construction (§13). This is the load-bearing claim of the whole design: Phase 8 swaps two injected modules (`Rng` source, `RoundAuthority`) and adds transport; it does not touch the engine core or the renderer.
- **Protocol direction** (shapes finalized in Phase 8's protocol design, the remaining Phase 2 blueprint portion): client→server = `EngineCommand` messages, unchanged shape; server→client = round lifecycle events (schedule, start, crash, impact, chests, settle) + periodic `PublicSnapshot`s for sync/join. The event names in §12 are chosen to correspond 1:1.
- **Settlement moves server-side entirely** in Phase 8; the client settlement listener degrades to applying server wallet events for display. Because money never entered the engine (§3), this migration doesn't touch it.
- Timing sync (server clock offset estimation, snapshot reconciliation, drift correction) is driver-level replica-mode work, reserved — explicitly *not* designed in detail now (§20 non-goals).

## 17. Multiplayer Readiness

What this architecture already provides for Phase 8, by construction:

- **Spectating is native.** Rounds run with zero participants today (`participating = false` path); "other players watching your round" is the same code path.
- **Participants generalize.** Participant round state is keyed data; the local client instantiates one entry. Other players' bets/cashouts arrive as events and render as UI lists — no engine change.
- **Join-in-progress / reconnect** = `restore(PublicSnapshot)` + render; correct first frame guaranteed (§14).
- **Smooth display between server updates**: the multiplier is an analytic function of dive-elapsed time shared by client and server (domain module, §9), so the client extrapolates the displayed curve between authoritative messages instead of interpolating jerky samples — the standard crash-game technique, enabled by keeping the curve pure and shared. (`timeForMultiplier` is its inverse, kept for this purpose.)
- **Server tick independence.** The server may run its authoritative loop at 10–30 Hz and broadcast sparsely; the client replica still ticks at 60 Hz for smooth world motion. Nothing in the engine assumes tick rate equals frame rate (§7).
- **Determinism + command log** = server-side round replay for dispute resolution and anti-cheat auditing (roadmap) with no additional machinery.
- **Web Worker option preserved**: because the engine is DOM-free with a message-shaped API (`submit` in, events/snapshots out), moving it off the main thread later is a transport change, not a refactor. Not planned; noted as a kept-open door.

## 18. Error Handling Philosophy

Three rings, three policies:

1. **Boundaries validate, never throw.** Every command is checked against the current state; invalid ⇒ `commandRejected` event, engine state untouched. Malformed external input (future: network messages) is rejected at the `src/network` edge before the engine sees it.
2. **Interior asserts invariants.** Inside the tick pipeline, impossible states (negative worldY, multiplier below 1, timer on a state that has none) are programming errors: in dev they throw immediately and loudly; in production they emit `engineError`, **freeze the simulation**, and surface the failure. For a real-money game the fail-safe direction is always *stop* — never guess, never fabricate an outcome, never silently continue a corrupted round. (Client-local mode may then recover by discarding the round to `betting`; a server decides its own recovery policy in Phase 8.)
3. **Neighbors are firewalled.** Event-listener exceptions are caught by the bus and logged; remaining listeners run (§12). Renderer exceptions are the driver's problem and never reach the engine. The engine never wraps its own pipeline in a blanket `try/catch` — that would convert loud programming errors into silent corruption, the worst outcome for auditability.

No user-facing strings anywhere in engine errors — codes + structured detail; the UI/localization layer owns wording (§3).

## 19. Future Scalability

- **Second game on the platform** (vision doc): the honest current answer is that the engine is *AQUADIVE's* engine. The generic parts (fixed-tick loop, event bus, state-machine mechanics, snapshot discipline, RNG service) are built cleanly enough to extract into a platform core **when a second game exists** — extracting a "generic engine" now, against one game, would be speculative abstraction (Master Rules: no placeholder code). The boundary lines drawn here (domain modules vs. systems vs. core mechanics) are what make that later split cheap.
- **Feature growth maps onto existing edges**: auto-cashout = a client-side rule that submits `cashOut` when the public multiplier crosses a threshold (no engine change); tournaments/achievements/analytics = event-stream consumers; admin configuration (Phase 9) = `EngineConfig` served remotely; bonus systems = new authority outcomes + states added to the machine in §5's documented style.
- **Performance**: the simulation is trivially cheap (one entity array, closed-form math — well under 1 ms/tick; the docs/05 frame-time meter already brackets the whole tick+render cost). Disciplines that keep it that way: no per-tick allocation in steady state (reuse the creature array, no closures in the pipeline), snapshots built on demand — never per tick, projections reusing scratch objects once profiling justifies it (same "do when" philosophy as docs/05 §14).
- **What deliberately does not scale-proof now**: no Web Worker move, no interpolation buffers, no multi-round pipelining (crash games run one global round at a time — a design fact, not a limitation).

## 20. Risks and Non-Goals

Risks:

1. **Behavioral drift during extraction** — the top risk, as in Sprint 2, but harder: simulation has no screenshot test. Mitigation: characterization tests *before* moving code (§21 step E1) pinning the pure math (curve values, distribution shapes/bounds, tier tables) and, after the state machine lands, transition-sequence tests on a seeded engine. The five sanctioned deltas (§7.1) are the *only* permitted differences; anything else stops the commit (Master Rules: never guess).
2. **React interleaving during migration.** Mid-extraction, state lives briefly in two places (engine + component refs/`useState`). Mitigation: each commit moves one system *completely* (owner changes, mirror deleted in the same commit); the UI store syncs one way (engine → store) from the first driver commit onward; never two writers.
3. **Timer semantics.** The `setTimeout` chains encode subtle guards (phase re-checks) that the state machine replaces structurally. Mitigation: transition table in §5 is exhaustive; the extraction commit maps every deleted timeout to its state-machine duration and its guard to a transition precondition, in the commit message.
4. **Test harness is a new dependency** (vitest is the natural fit for this Vite project). Adding a devDependency needs explicit approval — flagged here so E1 isn't blocked silently.
5. **The deferred `sampleJackpot` micro-task** (move to `src/lib/abyss-game.ts`) is superseded by this design: its destination is now the engine's `RoundAuthority` domain. Recommendation: fold it into the authority-extraction commit instead of executing the stale plan — needs owner sign-off (recorded in CURRENT_TASK).
6. **Scope creep** — the standing risk: "while we're in there" tuning of curves, RTP, or timings. This document is the contract; economics rebalance remains a separate approved task.

Non-goals of the engine work (explicitly out of scope):

- No server implementation, no transport, no wire-format finalization (Phase 8; protocol design is the remaining Phase 2 deliverable and lands with it).
- No RTP/economics rebalance — the jackpot flaw moves verbatim (TASK 001 decision).
- No integer-minor-units money migration (separate task at the settlement boundary; money never enters the engine).
- No interpolation/prediction buffers, no clock-sync design (replica-mode work).
- No ECS, no general physics, no generic multi-game engine (see §10, §19).
- No UI rework — the React shell keeps its current look and behavior; it just stops simulating.

## 21. Recommended Extraction Strategy (high level)

Same discipline as Sprint 2: one step per commit, behavior-preserving (modulo §7.1 deltas, each landing in exactly one identified commit), game playable after every commit, doc corrected first on any conflict. Order chosen so each commit moves code with fewer dependencies than the next, and so determinism tooling exists before the code it must protect:

| Step | Contents | Sanctioned deltas landing |
|------|----------|---------------------------|
| E0 | This document (Sprint 3, Commit 1) | — |
| E1 | Test harness (vitest, needs approval) + characterization tests pinning current pure math and distributions | — |
| E2 | Domain consolidation: pure math/types/tuning → engine domain modules; `RoundAuthority` seam with `LocalRoundAuthority` (absorbs the `sampleJackpot` move, pending sign-off); `Rng` service injection | — |
| E3 | Engine skeleton: facade, simulation clock + fixed-tick accumulator (driven from the existing component rAF), event bus | D2 |
| E4 | Round state machine: all phase transitions + timers move into the engine; component `setTimeout`/`setInterval` chains deleted; settlement listener extracted from the transition code | D1, D3 |
| E5 | Simulation systems move: descent, spawner, collision, boost, multiplier into the tick pipeline; command queue (`placeBet`/`cashOut`/`pickChest`) replaces direct callbacks | D4 |
| E6 | Driver + projections: `EngineDriver` owns rAF; engine produces `RenderState`/`RenderTime`/public state; component becomes a UI shell (canvas mount + HUD + store subscription); snapshot()/restore() landed and exercised by tests | D5 |

Step boundaries may be re-cut when reality demands (Sprint 2 precedent: R5 shrank because R3's fixed contract pulled work forward) — recorded in CURRENT_TASK the moment it happens. Exact file layout inside `src/engine` (facade, driver, state machine, systems, domain, rng, events, snapshot modules per §4's rules) is finalized in E2–E3, not here.

Per-commit validation gate (the engine twin of docs/05 §21): `tsc --noEmit` clean; lint at recorded baseline; all tests green from E1 onward; manual gameplay pass — full loop: bet → dive → cash out → crash round → jackpot round → chest pick → spectate a round (docs/18 step 2, developer); console hygiene; from E3 onward, a seeded-engine determinism spot-check (same seed + commands ⇒ same snapshot).

---

*This document is the single source of architectural truth for the Game Engine. If an extraction commit discovers a conflict between this document and reality, the commit stops and the document is corrected first (Master Rules: never guess).*
