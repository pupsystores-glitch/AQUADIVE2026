// Sealed offline round runner of the server's engine bundle (P8-4a; owner decisions K1, K2, K4,
// K5, K10). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY; not connected to the running server.
//
// `runSeededRound(derivation)` takes ownership of one prepared fv round derivation, binds it with
// the existing `SeededRound.bind`, builds ONE fresh `GameEngine` exclusively from that round's
// `deps`, and plays exactly one round in fixed 60 Hz ticks (`advance(1 / 60)`; the runner checks
// that every call consumes exactly one tick) with no participant, no command, no wallet, no
// network and no wall clock. It stops at the first entry into `crashed` or `bonus` (K4) — the
// same milestone as the P8-3b reference runner — so a second round's crash point is never drawn.
//
// It returns plain, deeply frozen data only: no engine, round, authority, stream, derivation or
// function ever leaves this module, and the engine and the round become unreachable when the call
// returns. The round is disposed on every path (success or failure). The result is the round's
// complete outcome record and is SECRET until the round's reveal (K6); the server validates it
// again (server/src/round/round-script.ts) before anything else may use it.
//
// Fail closed: any unexpected state transition, event, tick count or draw count, a missed
// milestone, or an error from the seeded round throws a `RoundRunnerError` whose message is its
// fixed code (and, for a seeded-round failure, that error's fixed code). It never carries a
// cause, a value, a seed or a draw count, and the runner never returns a partial result.
//
// The engine, its mathematics, its draw order and the seeded-round binding run unchanged (only
// the public barrels `@/engine` and `@/seeded-round` are imported). Synchronous by design: offline
// precomputation only, never on a live 60 Hz loop, an HTTP or WebSocket handler, or startup (K10).

import {
  BETTING_WINDOW_SECONDS,
  GameEngine,
  SHIP_IMPACT_TO_CHESTS_MS,
  SNAPSHOT_SCHEMA_VERSION,
  type Creature,
  type EngineEventMap,
  type EngineStateName,
} from "@/engine";
import { SeededRound, SeededRoundError, type SeededRoundErrorCode } from "@/seeded-round";

/** The derivation type `SeededRound.bind` accepts (no fairness import here; see the README). */
type RoundDerivation = Parameters<typeof SeededRound.bind>[0];

/** One fixed simulation tick; the same double as the engine's internal TICK_SECONDS. */
const TICK = 1 / 60;
/** The engine's own whole-tick quantization of a duration (state-machine.ts `ticksFor`). */
const ticksFor = (ms: number): number => Math.round(ms / 1000 / TICK);
/** Fail-closed guard only: a round reaches its milestone within 1,674 ticks (analytic bound). */
const MAX_TOTAL_TICKS = 2500;

/** The construction profile this runner implements (K12). Recorded in every RoundScript. */
export const ROUND_RUNNER_PROFILE = Object.freeze({
  id: "aquadive-offline-round-runner",
  version: 1,
  fv: 1,
  tickSeconds: TICK,
  bettingTicks: ticksFor(BETTING_WINDOW_SECONDS * 1000),
  impactToBonusTicks: ticksFor(SHIP_IMPACT_TO_CHESTS_MS),
  maxTotalTicks: MAX_TOTAL_TICKS,
  terminal: "first-crashed-or-bonus",
  snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
});

/** Closed set of runner failure codes. */
export type RoundRunnerErrorCode =
  /** `SeededRound.bind` refused the derivation (disposed, already used, or another instance). */
  | "derivation-unusable"
  /** The derivation is not for the profile's fairness version. */
  | "unsupported-fv"
  /** The seeded round failed while the engine drew from it (`reason` holds its fixed code). */
  | "draw-failed"
  /** An `advance(1 / 60)` call did not consume exactly one tick. */
  | "tick-mismatch"
  /** No terminal milestone within MAX_TOTAL_TICKS. */
  | "tick-limit-exceeded"
  /** A state, a transition or an event outside the one-round sequence. */
  | "unexpected-state"
  /** A draw count or an outcome value outside its fixed rule. */
  | "unexpected-draws"
  /** The engine's final snapshot disagrees with what the runner observed. */
  | "snapshot-mismatch"
  /** Anything else. */
  | "runner-failed";

export class RoundRunnerError extends Error {
  readonly code: RoundRunnerErrorCode;
  /** The seeded round's own fixed error code, for `draw-failed` only. */
  readonly reason: SeededRoundErrorCode | null;

  constructor(code: RoundRunnerErrorCode, reason: SeededRoundErrorCode | null = null) {
    super(reason === null ? code : `${code}: ${reason}`);
    this.name = "RoundRunnerError";
    this.code = code;
    this.reason = reason;
  }
}

/** One creature's lifecycle as observed tick by tick. */
export interface RunnerCreature {
  readonly id: number;
  readonly kind: string;
  readonly x: number;
  readonly worldY: number;
  readonly size: number;
  readonly phase: number;
  readonly dir: 1 | -1;
  /** The tick whose diving step spawned it. */
  readonly spawnTick: number;
  /** The tick whose diving step consumed it (goldfish only), or null. */
  readonly consumedTick: number | null;
}

/** The runner's result: plain, deeply frozen data. SECRET until the round's reveal. */
export interface RoundRunnerOutput {
  readonly profile: string;
  readonly profileVersion: number;
  readonly fv: number;
  readonly chainIndex: number;
  readonly outcome: "crash" | "floor";
  /** The round's crash point (drawn at entry(diving); a floor round never reaches it). */
  readonly crashAt: number;
  /** The tick whose entry action took the crash decision (entry diving). */
  readonly diveStartTick: number;
  /** The first tick that left `diving` (entry crashed, or entry impact). */
  readonly exitDiveTick: number;
  /** The tick that entered `impact`, or null. */
  readonly impactTick: number | null;
  /** The tick that entered `crashed` or `bonus`; the runner stopped there. */
  readonly terminalTick: number;
  readonly jackpot: number | null;
  readonly chests: readonly [number, number, number] | null;
  /**
   * Engine values after every tick whose resulting state was `diving`: index i is tick
   * diveStartTick + i (index 0 is the dive's start, before its first diving step).
   */
  readonly samples: {
    readonly multiplier: readonly number[];
    readonly boost: readonly number[];
    readonly worldY: readonly number[];
  };
  readonly creatures: readonly RunnerCreature[];
  /** The engine's world at the terminal tick (snapshot). */
  readonly final: {
    readonly worldY: number;
    readonly boost: number;
    readonly multiplier: number;
    readonly nextSpawnAt: number;
    readonly nextCreatureId: number;
  };
  /** Draws used per purpose. SECRET until the round's reveal. */
  readonly drawCounts: {
    readonly crash: number;
    readonly jackpot: number;
    readonly chests: number;
    readonly world: number;
  };
}

/** Every engine event; the runner records each one with its own tick counter. */
const EVENT_NAMES = [
  "bettingOpened",
  "betPlaced",
  "commandRejected",
  "diveStarted",
  "cashedOut",
  "crashed",
  "shipImpact",
  "chestsRevealed",
  "chestPicked",
  "roundEnded",
  "stateChanged",
  "engineError",
] as const satisfies readonly (keyof EngineEventMap)[];

type EventName = (typeof EVENT_NAMES)[number];

interface LoggedEvent {
  readonly tick: number;
  readonly name: EventName;
  readonly payload: EngineEventMap[EventName];
}

interface TrackedCreature {
  readonly creature: Creature;
  readonly spawnTick: number;
  consumedTick: number | null;
}

const fail = (code: RoundRunnerErrorCode): never => {
  throw new RoundRunnerError(code);
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Plays one seeded round from `derivation` and returns its outcome record (SECRET until the
 * round's reveal). Takes ownership: the derivation is bound and disposed with the round on every
 * path. Throws `RoundRunnerError` and never returns a partial result.
 */
export function runSeededRound(derivation: RoundDerivation): RoundRunnerOutput {
  let round: SeededRound;
  try {
    round = SeededRound.bind(derivation);
  } catch {
    // bind disposed a RoundDerivation it refused; a foreign object stays with its owner.
    throw new RoundRunnerError("derivation-unusable");
  }
  try {
    if (round.fv !== ROUND_RUNNER_PROFILE.fv) fail("unsupported-fv");
    return play(round);
  } catch (error) {
    if (error instanceof RoundRunnerError) throw error;
    if (error instanceof SeededRoundError) {
      throw new RoundRunnerError("draw-failed", error.code);
    }
    throw new RoundRunnerError("runner-failed");
  } finally {
    round.dispose();
  }
}

function play(round: SeededRound): RoundRunnerOutput {
  // The only GameEngine construction: a fresh engine over this round's own dependencies.
  const engine = new GameEngine(round.deps);
  const roundId = engine.getPublicState().roundId;
  if (engine.tickCount !== 0 || engine.state !== "betting") fail("unexpected-state");

  // The runner's own tick counter: listeners record it, independently of engine.tickCount.
  let tick = 0;
  const events: LoggedEvent[] = [];
  for (const name of EVENT_NAMES) {
    // Listeners only append (they never throw, so the EventBus firewall never logs).
    engine.events.on(name, (payload) => {
      events.push({ tick, name, payload });
    });
  }

  const multiplier: number[] = [];
  const boost: number[] = [];
  const worldY: number[] = [];
  const tracked = new Map<number, TrackedCreature>();
  const pending: TrackedCreature[] = [];
  let liveCreatures: readonly Creature[] | null = null;
  let seen = 0;
  const states: EngineStateName[] = [];

  for (;;) {
    if (tick >= MAX_TOTAL_TICKS) fail("tick-limit-exceeded");
    const before = engine.tickCount;
    // Counted first: the tick's events are dispatched inside advance().
    tick++;
    engine.advance(TICK);
    if (engine.tickCount !== before + 1 || engine.tickCount !== tick) fail("tick-mismatch");
    const state = engine.state;
    states.push(state);

    // Creature lifecycle, observed through the render projection. Its `creatures` is the
    // engine's live Creature array (getRenderState passes it through); it is replaced, never
    // reused, when the world resets at entry(diving).
    const render = engine.getRenderState();
    const live = render.creatures as readonly Creature[];
    if (live !== liveCreatures) {
      liveCreatures = live;
      seen = 0;
    }
    for (; seen < live.length; seen++) {
      const c = live[seen];
      if (tracked.has(c.id)) fail("unexpected-state");
      const entry: TrackedCreature = { creature: c, spawnTick: tick, consumedTick: null };
      tracked.set(c.id, entry);
      pending.push(entry);
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].creature.consumed === true) {
        pending[i].consumedTick = tick;
        pending.splice(i, 1);
      }
    }

    if (state === "diving") {
      multiplier.push(engine.getPublicState().multiplier);
      boost.push(render.boost);
      worldY.push(render.worldY);
    }
    if (state === "crashed" || state === "bonus") break;
  }

  return deepFreeze(
    record(round, engine, roundId, tick, states, events, {
      samples: { multiplier, boost, worldY },
      tracked,
    }),
  );
}

function record(
  round: SeededRound,
  engine: GameEngine,
  roundId: number,
  terminalTick: number,
  states: readonly EngineStateName[],
  events: readonly LoggedEvent[],
  observed: {
    samples: RoundRunnerOutput["samples"];
    tracked: ReadonlyMap<number, TrackedCreature>;
  },
): RoundRunnerOutput {
  const P = ROUND_RUNNER_PROFILE;
  const terminalState = states[states.length - 1];
  const outcome = terminalState === "crashed" ? "crash" : "floor";

  // ---- The exact one-round event sequence, each event at the runner's own tick -------------
  const at = (i: number, name: EventName, t: number): EngineEventMap[EventName] => {
    const e = events[i];
    if (e === undefined || e.name !== name || e.tick !== t) fail("unexpected-state");
    if ((e.payload as { roundId: number }).roundId !== roundId) fail("unexpected-state");
    return e.payload;
  };
  const changed = (i: number, t: number, from: EngineStateName, to: EngineStateName) => {
    const p = at(i, "stateChanged", t) as EngineEventMap["stateChanged"];
    if (p.from !== from || p.to !== to) fail("unexpected-state");
  };
  const diveStartTick = P.bettingTicks;
  changed(0, diveStartTick, "betting", "diving");
  at(1, "diveStarted", diveStartTick);
  let exitDiveTick: number;
  let impactTick: number | null = null;
  let crashAt: number;
  let jackpot: number | null = null;
  let chests: [number, number, number] | null = null;
  if (outcome === "crash") {
    exitDiveTick = terminalTick;
    changed(2, terminalTick, "diving", "crashed");
    crashAt = (at(3, "crashed", terminalTick) as EngineEventMap["crashed"]).multiplier;
    if (events.length !== 4) fail("unexpected-state");
  } else {
    exitDiveTick = terminalTick - P.impactToBonusTicks;
    impactTick = exitDiveTick;
    changed(2, impactTick, "diving", "impact");
    jackpot = (at(3, "shipImpact", impactTick) as EngineEventMap["shipImpact"]).jackpotMultiplier;
    changed(4, terminalTick, "impact", "bonus");
    const revealed = (at(5, "chestsRevealed", terminalTick) as EngineEventMap["chestsRevealed"])
      .chests;
    if (events.length !== 6 || revealed.length !== 3) fail("unexpected-state");
    revealed.forEach((c, i) => {
      if (c.id !== i || c.opened !== false) fail("unexpected-state");
    });
    chests = [revealed[0].multiplier, revealed[1].multiplier, revealed[2].multiplier];
    crashAt = Number.NaN; // read from the snapshot below
  }

  // ---- The per-tick states: betting, then diving, then the terminal phase -----------------
  states.forEach((s, i) => {
    const t = i + 1;
    const expected: EngineStateName =
      t < diveStartTick
        ? "betting"
        : t < exitDiveTick
          ? "diving"
          : outcome === "crash"
            ? "crashed"
            : t < terminalTick
              ? "impact"
              : "bonus";
    if (s !== expected) fail("unexpected-state");
  });
  const { samples } = observed;
  const diveTicks = exitDiveTick - diveStartTick;
  if (
    diveTicks < 1 ||
    samples.multiplier.length !== diveTicks ||
    samples.boost.length !== diveTicks ||
    samples.worldY.length !== diveTicks
  ) {
    fail("unexpected-state");
  }

  // ---- The engine's own final snapshot must agree with the observations -------------------
  const snap = engine.snapshot();
  if (snap.tickCount !== terminalTick || snap.round.roundId !== roundId) fail("snapshot-mismatch");
  if (outcome === "floor") crashAt = snap.round.crashAt;
  else if (snap.round.crashAt !== crashAt) fail("snapshot-mismatch");
  const world = snap.world;
  const creatures: RunnerCreature[] = [...observed.tracked.values()]
    .sort((a, b) => a.creature.id - b.creature.id)
    .map((t) => ({
      id: t.creature.id,
      kind: t.creature.kind,
      x: t.creature.x,
      worldY: t.creature.worldY,
      size: t.creature.size,
      phase: t.creature.phase,
      dir: t.creature.dir,
      spawnTick: t.spawnTick,
      consumedTick: t.consumedTick,
    }));
  if (world.creatures.length !== creatures.length) fail("snapshot-mismatch");
  world.creatures.forEach((c, i) => {
    const o = creatures[i];
    if (
      c.id !== o.id ||
      c.kind !== o.kind ||
      c.x !== o.x ||
      c.worldY !== o.worldY ||
      c.size !== o.size ||
      c.phase !== o.phase ||
      c.dir !== o.dir ||
      (c.consumed === true) !== (o.consumedTick !== null)
    ) {
      fail("snapshot-mismatch");
    }
  });
  if (world.nextCreatureId !== creatures.length + 1) fail("snapshot-mismatch");

  // ---- Draw counts: the fixed rules of the unchanged outcome functions --------------------
  const counts = round.secretDrawCounts();
  const crashOk = counts.crash === 2 || (counts.crash === 1 && crashAt === 1);
  const perOutcome =
    outcome === "crash"
      ? counts.jackpot === 0 && counts.chests === 0
      : counts.jackpot === 2 && counts.chests === 6;
  // Every spawn is one creature roll (six draws) plus one jitter draw.
  if (!crashOk || !perOutcome || counts.world !== 7 * creatures.length) fail("unexpected-draws");
  const lockedAt = outcome === "crash" ? crashAt : jackpot;
  if (world.multiplier !== lockedAt) fail("snapshot-mismatch");

  return {
    profile: P.id,
    profileVersion: P.version,
    fv: round.fv,
    chainIndex: round.chainIndex,
    outcome,
    crashAt,
    diveStartTick,
    exitDiveTick,
    impactTick,
    terminalTick,
    jackpot,
    chests,
    samples: {
      multiplier: [...samples.multiplier],
      boost: [...samples.boost],
      worldY: [...samples.worldY],
    },
    creatures,
    final: {
      worldY: world.worldY,
      boost: world.boost,
      multiplier: world.multiplier,
      nextSpawnAt: world.nextSpawnAt,
      nextCreatureId: world.nextCreatureId,
    },
    drawCounts: {
      crash: counts.crash,
      jackpot: counts.jackpot,
      chests: counts.chests,
      world: counts.world,
    },
  };
}
