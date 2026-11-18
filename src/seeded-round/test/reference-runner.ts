// TEST AND QA ONLY: the deterministic reference-round runner (P8-3b; owner decision D-B3).
// Not a production API; production RoundScript construction is P8-4.
//
// It plays exactly one round on a FRESH GameEngine from the public `@/engine` barrel with a
// SeededRound's dependencies, in fixed 60 Hz ticks (advance(1/60) consumes exactly one tick; the
// runner checks that on every call), with no participant, no command, no wallet, no network and
// no wall clock. It only observes the engine — events, projections and the final snapshot — and
// duplicates none of its logic. It stops at the round's terminal milestone:
//
//   - crash:  the tick that enters `crashed`;
//   - floor:  the tick that enters `bonus`, i.e. where the engine rolls and reveals the chests
//             (impact + SHIP_IMPACT_TO_CHESTS_MS, the existing chest-generation timing).
//
// Any error (exhaustion, a broken provider, a missed milestone) propagates: no partial record is
// returned, the engine is discarded and the round is disposed. The returned record is the full
// AUTHORITY record and is SECRET until the round's reveal (D-B4).

import { GameEngine, type BonusChest, type Creature, type WorldSnapshot } from "@/engine";
import { bytesToHex, sha256, type FairnessHashProvider } from "@/fairness";
import { SeededRound } from "../index";

/** One fixed simulation tick; the same double as the engine's internal TICK_SECONDS (1 / 60). */
const TICK = 1 / 60;
/** Safety bound only: a round reaches its milestone within ≈ 1,700 ticks. */
const MAX_TICKS = 20_000;

export interface GoldfishFact {
  readonly id: number;
  /** Creature x in [0.1, 0.9]. */
  readonly x: number;
  readonly worldY: number;
  /** Tick at which the engine marked it consumed, or null. */
  readonly consumedTick: number | null;
}

/** The authority record of one reference round. SECRET until the round's reveal. */
export interface ReferenceRoundRecord {
  readonly fv: number;
  readonly chainIndex: number;
  readonly outcome: "crash" | "floor";
  readonly crashAt: number;
  /** The tick whose entry action took the crash decision (entry diving). */
  readonly diveStartTick: number;
  readonly terminalTick: number;
  readonly impactTick: number | null;
  /** The engine's locked multiplier at the terminal tick (crash clamp or jackpot). */
  readonly terminalMultiplier: number;
  readonly jackpot: number | null;
  readonly chests: readonly [number, number, number] | null;
  readonly creaturesSpawned: number;
  readonly goldfish: readonly GoldfishFact[];
  readonly world: {
    readonly worldY: number;
    readonly boost: number;
    readonly multiplier: number;
    readonly nextSpawnAt: number;
    readonly nextCreatureId: number;
    /** SHA-256 of the canonical JSON of the final creature array. */
    readonly creaturesSha256: string;
  };
  readonly drawCounts: { crash: number; jackpot: number; chests: number; world: number };
  /** SHA-256 of the canonical JSON of every field above, in this order. */
  readonly recordSha256: string;
}

export interface ReferenceRoundResult {
  readonly record: ReferenceRoundRecord;
  /** The engine's final world snapshot (plain data copy). */
  readonly finalWorld: WorldSnapshot;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const hashJson = (provider: FairnessHashProvider, value: unknown) =>
  bytesToHex(sha256(provider, utf8(JSON.stringify(value))));

/**
 * Plays one reference round with `round` and disposes it (success or failure). The round must be
 * fresh: the runner takes ownership.
 */
export function runReferenceRound(
  provider: FairnessHashProvider,
  round: SeededRound,
): ReferenceRoundResult {
  try {
    return play(provider, round);
  } finally {
    round.dispose();
  }
}

/** Convenience: create the round from its derivation input, then run it. */
export function runReferenceRoundFromInput(
  provider: FairnessHashProvider,
  input: Parameters<typeof SeededRound.create>[1],
): ReferenceRoundResult {
  return runReferenceRound(provider, SeededRound.create(provider, input));
}

interface Observed {
  diveStartTick: number | null;
  crashAt: number | null;
  impactTick: number | null;
  jackpot: number | null;
  chests: [BonusChest, BonusChest, BonusChest] | null;
  terminal: "crash" | "floor" | null;
}

function play(provider: FairnessHashProvider, round: SeededRound): ReferenceRoundResult {
  const engine = new GameEngine(round.deps);
  const obs: Observed = {
    diveStartTick: null,
    crashAt: null,
    impactTick: null,
    jackpot: null,
    chests: null,
    terminal: null,
  };
  engine.events.on("diveStarted", () => (obs.diveStartTick = engine.tickCount));
  engine.events.on("crashed", (e) => {
    obs.crashAt = e.multiplier;
    obs.terminal = "crash";
  });
  engine.events.on("shipImpact", (e) => {
    obs.impactTick = engine.tickCount;
    obs.jackpot = e.jackpotMultiplier;
  });
  engine.events.on("chestsRevealed", (e) => {
    obs.chests = e.chests;
    obs.terminal = "floor";
  });

  const goldfish = new Map<number, { x: number; worldY: number; consumedTick: number | null }>();
  const pending: { id: number; creature: { consumed?: boolean } }[] = [];
  let creatures: readonly unknown[] | null = null;
  let seen = 0;

  for (;;) {
    const before = engine.tickCount;
    engine.advance(TICK);
    const tick = engine.tickCount;
    if (tick !== before + 1) {
      throw new Error(`reference runner: advance consumed ${tick - before} ticks`);
    }

    // Goldfish facts, observed through the render projection. Its `creatures` is the engine's
    // live Creature array (getRenderState passes it through), typed for the renderer without ids.
    const live = engine.getRenderState().creatures as readonly Creature[];
    if (live !== creatures) {
      creatures = live;
      seen = 0;
    }
    for (; seen < live.length; seen++) {
      const c = live[seen];
      if (c.kind === "goldfish") {
        goldfish.set(c.id, { x: c.x, worldY: c.worldY, consumedTick: null });
        pending.push({ id: c.id, creature: c });
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].creature.consumed) {
        const fact = goldfish.get(pending[i].id);
        if (fact) fact.consumedTick = tick;
        pending.splice(i, 1);
      }
    }

    if (obs.terminal !== null) break;
    if (tick >= MAX_TICKS) throw new Error("reference runner: no terminal milestone reached");
  }

  const snap = engine.snapshot();
  const world = snap.world;
  const counts = round.secretDrawCounts();
  if (obs.diveStartTick === null) throw new Error("reference runner: the dive never started");

  const body = {
    fv: round.fv,
    chainIndex: round.chainIndex,
    outcome: obs.terminal,
    // A floor round never emits `crashed`; its crash point is in the authority snapshot.
    crashAt: obs.crashAt ?? snap.round.crashAt,
    diveStartTick: obs.diveStartTick,
    terminalTick: engine.tickCount,
    impactTick: obs.impactTick,
    terminalMultiplier: world.multiplier,
    jackpot: obs.jackpot,
    chests:
      obs.chests === null
        ? null
        : ([obs.chests[0].multiplier, obs.chests[1].multiplier, obs.chests[2].multiplier] as const),
    creaturesSpawned: world.nextCreatureId - 1,
    goldfish: [...goldfish.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, g]) => ({ id, x: g.x, worldY: g.worldY, consumedTick: g.consumedTick })),
    world: {
      worldY: world.worldY,
      boost: world.boost,
      multiplier: world.multiplier,
      nextSpawnAt: world.nextSpawnAt,
      nextCreatureId: world.nextCreatureId,
      creaturesSha256: hashJson(provider, world.creatures),
    },
    drawCounts: {
      crash: counts.crash,
      jackpot: counts.jackpot,
      chests: counts.chests,
      world: counts.world,
    },
  };
  const record: ReferenceRoundRecord = { ...body, recordSha256: hashJson(provider, body) };
  return { record, finalWorld: world };
}
