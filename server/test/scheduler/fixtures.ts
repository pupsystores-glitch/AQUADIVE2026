// TEST ONLY (P8-4b-2): synthetic RoundScripts for the scheduler core, and a harness that drives
// the pure core exactly as scheduler.ts does (SimulatedClock → ticksElapsed → advanceTo; a source
// result is applied at the tick of its arrival after catching the core up). The scripts follow
// the P8-4a validation rules, not the physics; real rounds come from the worker (probe).
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import { buildRoundScript, type RoundScript } from "../../src/round/round-script";
import type { RunnerOutput } from "../../src/round/engine-types";
import { SimulatedClock, ticksElapsed } from "../../src/scheduler/clock";
import { SchedulerCore, type CoreEffect } from "../../src/scheduler/core";
import type { SourceFailure } from "../../src/scheduler/events";
import { sealRoundScript } from "../../src/scheduler/sealed";

export const hash = createNodeFairnessCrypto().hash;
export const CHAIN_ID = "5c".repeat(32);
export const SALT = "a1".repeat(32);
export const NS_PER_TICK = 1_000_000_000n / 60n; // floor; instants use the exact formula

export interface RoundSpec {
  readonly outcome: "crash" | "floor";
  /** exitDiveTick − 300 (≥ 1; 1 … 1,290). */
  readonly diveTicks: number;
  readonly crashAt: number;
  readonly jackpot?: number;
  readonly chests?: readonly [number, number, number];
  /** Goldfish consumption ticks (round-relative, 301 … exit), in spawn order. */
  readonly goldfish?: readonly number[];
  /** Other creatures (never consumed). */
  readonly others?: number;
}

/** A runner output the P8-4a validators accept, with a recognizable multiplier series. */
export function runnerOutput(chainIndex: number, spec: RoundSpec): RunnerOutput {
  const n = spec.diveTicks;
  const exit = 300 + n;
  const floor = spec.outcome === "floor";
  // Strictly below the crash point after tick 0; each value distinct per tick and round.
  const step = n > 1 ? ((spec.crashAt - 1) * 0.999) / n : 0;
  const multiplier = Array.from({ length: n }, (_, i) =>
    i === 0 ? 1 : 1 + i * step + chainIndex * 1e-9,
  );
  const worldY = Array.from({ length: n }, (_, i) => i * (4199 / n));
  const creatures = [];
  let id = 1;
  for (const t of spec.goldfish ?? []) {
    creatures.push({
      id: id++,
      kind: "goldfish",
      x: 0.5,
      worldY: 100,
      size: 1,
      phase: 1,
      dir: 1 as const,
      spawnTick: t,
      consumedTick: t,
    });
  }
  for (let k = 0; k < (spec.others ?? 0); k++) {
    creatures.push({
      id: id++,
      kind: "kelp",
      x: 0.3,
      worldY: 50,
      size: 1,
      phase: 0.5,
      dir: -1 as const,
      spawnTick: exit,
      consumedTick: null,
    });
  }
  return {
    profile: "aquadive-offline-round-runner",
    profileVersion: 1,
    fv: 1,
    chainIndex,
    outcome: spec.outcome,
    crashAt: spec.crashAt,
    diveStartTick: 300,
    exitDiveTick: exit,
    impactTick: floor ? exit : null,
    terminalTick: floor ? exit + 84 : exit,
    jackpot: floor ? (spec.jackpot ?? 51.71) : null,
    chests: floor ? (spec.chests ?? [1.88, 2.11, 8.74]) : null,
    samples: { multiplier, boost: new Array<number>(n).fill(0), worldY },
    creatures,
    final: {
      worldY: floor ? 4210 : worldY[n - 1]!,
      boost: 0,
      multiplier: floor ? (spec.jackpot ?? 51.71) : spec.crashAt,
      nextSpawnAt: 100,
      nextCreatureId: creatures.length + 1,
    },
    drawCounts: {
      crash: spec.crashAt === 1 ? 1 : 2,
      jackpot: floor ? 2 : 0,
      chests: floor ? 6 : 0,
      world: 7 * creatures.length,
    },
  } as RunnerOutput;
}

export function makeScript(chainIndex: number, spec: RoundSpec, chainId = CHAIN_ID): RoundScript {
  return buildRoundScript(
    hash,
    { chainId, chainIndex, salt: SALT },
    runnerOutput(chainIndex, spec),
  );
}

/** Deterministic pseudo-random specs (LCG; test input only). */
export function specStream(seed: number): (n: number) => RoundSpec {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const cache = new Map<number, RoundSpec>();
  let made = 0;
  return (n: number) => {
    const hit = cache.get(n);
    if (hit) return hit;
    if (n !== made + 1) throw new Error("specs are drawn in order");
    made = n;
    const r = rnd();
    let spec: RoundSpec;
    if (r < 0.04) {
      spec = { outcome: "crash", diveTicks: 1, crashAt: 1 };
    } else if (r < 0.16) {
      const diveTicks = 150 + Math.floor(rnd() * 1141); // 150 … 1290
      const g = Math.floor(rnd() * 3);
      const goldfish = Array.from({ length: g }, (_, k) =>
        Math.min(300 + diveTicks, 301 + Math.floor(((k + rnd()) * diveTicks) / 3)),
      ).sort((a, b) => a - b);
      spec = {
        outcome: "floor",
        diveTicks,
        crashAt: 10 + Math.floor(rnd() * 19000) / 100,
        jackpot: (5000 + Math.floor(rnd() * 45000)) / 100,
        chests: [1, 2, 3].map(() => (100 + Math.floor(rnd() * 4900)) / 100) as unknown as [
          number,
          number,
          number,
        ],
        goldfish,
      };
    } else {
      const diveTicks = 2 + Math.floor(rnd() * 200);
      const g = rnd() < 0.3 ? 1 : 0;
      spec = {
        outcome: "crash",
        diveTicks,
        crashAt: (101 + Math.floor(rnd() * 900)) / 100,
        goldfish: g ? [301 + Math.floor(rnd() * diveTicks)] : [],
      };
    }
    cache.set(n, spec);
    return spec;
  };
}

/** The independent per-round facts the reference model needs (no RoundScript involved). */
export const factsOf = (spec: RoundSpec) => ({
  outcome: spec.outcome,
  exitDiveTick: 300 + spec.diveTicks,
  crashAt: spec.crashAt,
  jackpot: spec.outcome === "floor" ? (spec.jackpot ?? 51.71) : null,
  chests: spec.outcome === "floor" ? (spec.chests ?? [1.88, 2.11, 8.74]) : null,
  boostTicks: [...(spec.goldfish ?? [])].sort((a, b) => a - b),
});

// ---- Harness: the driver's algorithm on a SimulatedClock ---------------------------------------

export interface HarnessOptions {
  readonly chainLength: number;
  readonly specOf: (n: number) => RoundSpec;
  /** Wall instants (ns, increasing) at which the driver polls. */
  readonly polls: Iterable<bigint>;
  /** Preparation latency of round n in ns (null: the script never arrives). */
  readonly latencyNs?: (n: number) => bigint | null;
  /** Source failures at wall instants. */
  readonly failures?: readonly { readonly atNs: bigint; readonly failure: SourceFailure }[];
  /** Replace the delivered script of round n (contract tests). */
  readonly scriptOf?: (n: number) => RoundScript;
  readonly eventCapacity?: number;
  readonly epochNs?: bigint;
  /** Called after every poll with the core (invariant checks). */
  readonly onPoll?: (core: SchedulerCore) => void;
}

export interface HarnessResult {
  readonly core: SchedulerCore;
  readonly requested: number[];
  readonly delivered: number[];
}

/**
 * Runs the core like scheduler.ts: start at epoch; a `prepare` effect sends a request at the
 * current wall instant; its result arrives `latencyNs` later and is applied at that instant
 * (catch up, then deliver); polls catch up to their instant. Events with equal instants: results
 * and failures before the poll (each catches up first, so the order does not matter).
 */
export function runHarness(o: HarnessOptions): HarnessResult {
  const epoch = o.epochNs ?? 1_000_000_007n;
  const clock = new SimulatedClock(epoch);
  const core = new SchedulerCore({
    chain: { chainId: CHAIN_ID, chainLength: o.chainLength, fv: 1 },
    hash,
    ...(o.eventCapacity === undefined ? {} : { eventCapacity: o.eventCapacity }),
  });
  const requested: number[] = [];
  const delivered: number[] = [];
  const arrivals: { at: bigint; n: number }[] = [];
  const latency = o.latencyNs ?? (() => 5n * NS_PER_TICK);
  const failures = [...(o.failures ?? [])];
  const apply = (effects: readonly CoreEffect[]) => {
    for (const e of effects) {
      if (e.type !== "prepare") continue;
      requested.push(e.roundNumber);
      const l = latency(e.roundNumber);
      if (l !== null) arrivals.push({ at: clock.nowNs() + l, n: e.roundNumber });
    }
  };
  const tick = () => ticksElapsed(epoch, clock.nowNs());
  apply(core.start());
  const polls = o.polls[Symbol.iterator]();
  let nextPoll = polls.next();
  for (;;) {
    arrivals.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    failures.sort((a, b) => (a.atNs < b.atNs ? -1 : a.atNs > b.atNs ? 1 : 0));
    const candidates: bigint[] = [];
    if (arrivals.length > 0) candidates.push(arrivals[0]!.at);
    if (failures.length > 0) candidates.push(failures[0]!.atNs);
    if (!nextPoll.done) candidates.push(nextPoll.value);
    if (candidates.length === 0 || core.state === "halted") break;
    const at = candidates.reduce((a, b) => (b < a ? b : a));
    if (at > clock.nowNs()) clock.setNs(at);
    if (arrivals.length > 0 && arrivals[0]!.at === at) {
      const { n } = arrivals.shift()!;
      apply(core.advanceTo(tick()));
      const script = o.scriptOf ? o.scriptOf(n) : makeScript(n, o.specOf(n));
      delivered.push(n);
      apply(core.deliver(sealRoundScript(script)));
    } else if (failures.length > 0 && failures[0]!.atNs === at) {
      const f = failures.shift()!;
      apply(core.advanceTo(tick()));
      apply(core.sourceFailed(f.failure));
    } else {
      nextPoll = polls.next();
      apply(core.advanceTo(tick()));
      o.onPoll?.(core);
    }
  }
  return { core, requested, delivered };
}

/** The wall instant of global tick k (exact formula, independent of the core). */
export const instantOf = (epoch: bigint, k: number): bigint =>
  epoch + (BigInt(k) * 1_000_000_000n) / 60n;

/** Polls at every tick instant 0 … last. */
export function* everyTick(epoch: bigint, last: number): Generator<bigint> {
  for (let k = 0; k <= last; k++) yield instantOf(epoch, k);
}

/** Polls at irregular, non-tick-aligned instants: gaps of 1 ns … maxGapTicks ticks (LCG). */
export function* jittered(epoch: bigint, last: number, maxGapTicks: number, seed: number) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const end = instantOf(epoch, last);
  let t = epoch;
  while (t < end) {
    t += 1n + BigInt(Math.floor(rnd() * maxGapTicks * 16_666_667));
    yield t < end ? t : end;
  }
}
