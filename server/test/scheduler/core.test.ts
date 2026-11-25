// Offline Global Round Scheduler, pure core (P8-4b-2). PLAY MONEY ONLY; offline only.
//
// Every expectation is an independent known answer where one exists: the timeline constants are
// recomputed from the engine source; event logs, round ids, digests and snapshots come from
// reference-model.cjs (node:crypto, no scheduler code); clock arithmetic is checked by brute force.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  MAX_GLOBAL_TICK,
  SimulatedClock,
  createMonotonicClock,
  tickInstantNs,
  ticksElapsed,
} from "../../src/scheduler/clock";
import { SchedulerCore, deriveRoundId } from "../../src/scheduler/core";
import { RoundDisclosure } from "../../src/scheduler/disclosure";
import { EventLog, SchedulerError } from "../../src/scheduler/events";
import * as sealedModule from "../../src/scheduler/sealed";
import { SealedRound, claimSealedRoundOpener, sealRoundScript } from "../../src/scheduler/sealed";
import {
  ADMISSION_DEADLINE_TICKS,
  BETTING_TICKS,
  BONUS_PICK_TICKS,
  CHEST_RESULT_TICKS,
  CRASH_BANNER_TICKS,
  IMPACT_TO_BONUS_TICKS,
  INTER_ROUND_GAP_TICKS,
  MAX_ROUND_TICKS,
  MIN_ROUND_TICKS,
} from "../../src/scheduler/timeline";
import {
  CHAIN_ID,
  NS_PER_TICK,
  everyTick,
  factsOf,
  hash,
  instantOf,
  jittered,
  makeScript,
  runHarness,
  specStream,
  type RoundSpec,
} from "./fixtures";

const ref = createRequire(import.meta.url)("./reference-model.cjs");
const REPO = join(__dirname, "..", "..", "..");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// R-1: this file's module graph does not load source.ts, so the source sealing capability is
// claimed HERE, before any test runs (the M-1 reflection test calls every export and must find
// it already claimed, as in the build, where source.ts claims it as it loads).
const sealing = sealedModule.claimSourceSealing();

const CRASH: RoundSpec = { outcome: "crash", diveTicks: 37, crashAt: 2.37, goldfish: [320] };
const FLOOR: RoundSpec = {
  outcome: "floor",
  diveTicks: 400,
  crashAt: 9.5,
  jackpot: 123.45,
  chests: [3.33, 44.44, 1.11],
  goldfish: [350, 350, 700],
};
const ONE: RoundSpec = { outcome: "crash", diveTicks: 1, crashAt: 1 };
const LONGEST: RoundSpec = {
  outcome: "floor",
  diveTicks: 1290,
  crashAt: 199.5,
  jackpot: 499.99,
  chests: [49.99, 1, 25.5],
  goldfish: [301, 1590],
};

/** Runs `specs` as a whole chain (chain length = specs.length) with timely scripts. */
const runChain = (
  specs: readonly RoundSpec[],
  polls?: (epoch: bigint, last: number) => Iterable<bigint>,
) => {
  const epoch = 1_000_000_007n;
  const model = ref.referenceLog(CHAIN_ID, specs.length, specs.map(factsOf));
  const r = runHarness({
    chainLength: specs.length,
    specOf: (n) => specs[n - 1]!,
    polls: (polls ?? everyTick)(epoch, model.end + 5),
    epochNs: epoch,
    eventCapacity: 65_536,
  });
  return { ...r, model, epoch };
};

describe("timeline constants (SD-3) — recomputed from the engine source", () => {
  it("300 / 84 / 144 / 360 / 132 ticks, zero gap, from tuning.ts and the engine's ticksFor", () => {
    const tuning = readFileSync(join(REPO, "src", "engine", "domain", "tuning.ts"), "utf8");
    const sm = readFileSync(join(REPO, "src", "engine", "state-machine.ts"), "utf8");
    const clock = readFileSync(join(REPO, "src", "engine", "clock.ts"), "utf8");
    expect(sm).toContain(
      "const ticksFor = (ms: number): number => Math.round(ms / 1000 / TICK_SECONDS);",
    );
    expect(clock).toContain("export const TICK_SECONDS = 1 / 60;");
    const value = (name: string) => {
      const m = tuning.match(new RegExp(`export const ${name} = ([0-9_]+);`));
      expect(m, name).not.toBeNull();
      return Number(m![1]!.replaceAll("_", ""));
    };
    const ticksFor = (ms: number) => Math.round(ms / 1000 / (1 / 60));
    expect(BETTING_TICKS).toBe(ticksFor(value("BETTING_WINDOW_SECONDS") * 1000));
    expect(IMPACT_TO_BONUS_TICKS).toBe(ticksFor(value("SHIP_IMPACT_TO_CHESTS_MS")));
    expect(CRASH_BANNER_TICKS).toBe(ticksFor(value("CRASH_BANNER_MS")));
    expect(BONUS_PICK_TICKS).toBe(ticksFor(value("BONUS_PICK_WINDOW_MS")));
    expect(CHEST_RESULT_TICKS).toBe(ticksFor(value("CHEST_RESULT_TO_IDLE_MS")));
    expect([BETTING_TICKS, IMPACT_TO_BONUS_TICKS, CRASH_BANNER_TICKS, BONUS_PICK_TICKS]).toEqual([
      300, 84, 144, 360,
    ]);
    expect(CHEST_RESULT_TICKS).toBe(132);
    expect(INTER_ROUND_GAP_TICKS).toBe(0);
    // The engine's state machine: one shared result timer after the pick, the banner after a crash.
    expect(sm).toContain("this.timerTicks = ticksFor(CRASH_BANNER_MS);");
    expect(sm).toContain("this.timerTicks = ticksFor(SHIP_IMPACT_TO_CHESTS_MS);");
    expect(sm).toContain("ticksFor(BONUS_PICK_WINDOW_MS)");
    expect(sm).toContain("this.timerTicks = ticksFor(CHEST_RESULT_TO_IDLE_MS);");
    // Shortest and longest rounds; the deadline lies inside the fixed betting window.
    expect(MIN_ROUND_TICKS).toBe(300 + 1 + 144);
    expect(MAX_ROUND_TICKS).toBe(300 + 1290 + 84 + 360 + 132);
    expect(ADMISSION_DEADLINE_TICKS).toBe(ref.T.deadline);
    expect(ADMISSION_DEADLINE_TICKS).toBeLessThanOrEqual(BETTING_TICKS);
  });
});

describe("clock arithmetic (bigint, no accumulation)", () => {
  it("tickInstantNs / ticksElapsed agree with brute force around every boundary", () => {
    const epoch = 123_456_789n;
    for (let k = 0; k < 4000; k++) {
      const at = tickInstantNs(epoch, k);
      expect(at).toBe(epoch + (BigInt(k) * 1_000_000_000n) / 60n);
      expect(ticksElapsed(epoch, at)).toBe(k);
      expect(ticksElapsed(epoch, at - 1n)).toBe(k - 1);
      expect(ticksElapsed(epoch, tickInstantNs(epoch, k + 1) - 1n)).toBe(k);
    }
    expect(ticksElapsed(epoch, epoch - 1n)).toBe(-1);
  });

  it("no drift: tick 10⁹'s instant is exact, unlike accumulated float deltas", () => {
    const epoch = 5n;
    const k = 1_000_000_000;
    expect(tickInstantNs(epoch, k)).toBe(5n + 16_666_666_666_666_666n);
    expect(ticksElapsed(epoch, 5n + 16_666_666_666_666_666n)).toBe(k);
    let float = 0;
    for (let i = 0; i < 1_000_000; i++) float += 1 / 60;
    expect(float).not.toBe(1_000_000 / 60); // what the scheduler never does
    expect(tickInstantNs(0n, 1_000_000)).toBe((1_000_000n * 1_000_000_000n) / 60n);
  });

  it("refuses invalid ticks, instants and backward clocks", () => {
    const err = (fn: () => unknown) => {
      try {
        fn();
        return null;
      } catch (e) {
        expect(e).toBeInstanceOf(SchedulerError);
        return (e as SchedulerError).message;
      }
    };
    expect(err(() => tickInstantNs(0n, -1))).toBe("invalid-argument: invalid-tick");
    expect(err(() => tickInstantNs(0n, 1.5))).toBe("invalid-argument: invalid-tick");
    expect(err(() => ticksElapsed(0n, 1 as never))).toBe("invalid-argument: invalid-instant");
    expect(err(() => ticksElapsed(0n, 10n ** 40n))).toBe("invalid-argument: tick-overflow");
    const c = new SimulatedClock(10n);
    expect(err(() => c.setNs(9n))).toBe("invalid-argument: clock-backwards");
    expect(err(() => c.advanceNs(-1n))).toBe("invalid-argument: clock-backwards");
    c.advanceNs(5n);
    expect(c.nowNs()).toBe(15n);
    expect(MAX_GLOBAL_TICK).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("the real monotonic adapter reads hrtime and never goes backwards (not wired anywhere)", () => {
    const real = createMonotonicClock();
    const a = real.nowNs();
    const b = real.nowNs();
    expect(typeof a).toBe("bigint");
    expect(b >= a).toBe(true);
  });
});

describe("one round: exact phase boundaries (independent reference model)", () => {
  it.each([
    ["crash with a goldfish", [CRASH]],
    ["floor with goldfish (two on one tick)", [FLOOR]],
    ["immediate 1.00× crash", [ONE]],
    ["longest floor round (1,290 dive ticks; goldfish on the first and the exit tick)", [LONGEST]],
  ])("%s: the log equals the reference", (_name, specs) => {
    const { core, model } = runChain(specs as RoundSpec[]);
    expect(core.events()).toEqual(model.events);
    expect(core.digest).toBe(model.digest);
    expect(core.state).toBe("halted");
  });

  it("the immediate 1.00× crash: dive at 540, crash 1.00 at 541, end at 685", () => {
    const { core } = runChain([ONE]);
    const at = (type: string) => core.events().find((e) => e.type === type)!;
    expect(at("round.betting")).toMatchObject({ tick: 240, closesAtTick: 540 });
    expect(at("round.dive").tick).toBe(540);
    expect(at("round.crashed")).toMatchObject({ tick: 541, crashAt: 1, endsAtTick: 685 });
    expect(at("round.ended")).toMatchObject({ tick: 685, outcome: "crash", reveal: "deferred" });
  });

  it("the longest floor round lasts 2,166 ticks: impact 1830, bonus 1914, chests 2274, end 2406", () => {
    const { core } = runChain([LONGEST]);
    const at = (type: string) => core.events().find((e) => e.type === type)!;
    expect(at("round.impact")).toMatchObject({
      tick: 240 + 1590,
      jackpot: 499.99,
      bonusAtTick: 1914,
    });
    expect(at("round.bonus")).toMatchObject({ tick: 1914, closesAtTick: 2274 });
    expect(at("round.chests")).toMatchObject({
      tick: 2274,
      chests: [49.99, 1, 25.5],
      endsAtTick: 2406,
    });
    expect(at("round.ended").tick).toBe(240 + MAX_ROUND_TICKS);
    const boosts = core
      .events()
      .filter((e) => e.type === "round.boost")
      .map((e) => e.tick);
    expect(boosts).toEqual([240 + 301, 240 + 1590]);
    // The exit tick's goldfish is disclosed before the impact of the same tick.
    const exitEvents = core
      .events()
      .filter((e) => e.tick === 1830)
      .map((e) => e.type);
    expect(exitEvents).toEqual(["round.boost", "round.impact"]);
  });

  it("goldfish consumption: one boost per consumption, at its own tick only", () => {
    const { core } = runChain([FLOOR]);
    const boosts = core.events().filter((e) => e.type === "round.boost");
    expect(boosts.map((e) => e.tick)).toEqual([590, 590, 940]);
    for (const b of boosts) expect(Object.keys(b)).toEqual(["seq", "tick", "type", "round"]);
  });

  it("the snapshot one tick before, at and after every transition equals the reduced events", () => {
    for (const spec of [CRASH, FLOOR, ONE, LONGEST]) {
      const epoch = 1_000_000_007n;
      const model = ref.referenceLog(CHAIN_ID, 1, [factsOf(spec)]);
      const script = makeScript(1, spec);
      const samples = script.secretContent().samples.multiplier;
      const transitions: number[] = [...new Set<number>(model.events.map((e: Any) => e.tick))];
      const probes = new Set<number>();
      const lastTick = Math.max(...transitions); // the halt: the core processes nothing after it
      for (const t of transitions) {
        for (const d of [-1, 0, 1]) if (t + d >= 0 && t + d <= lastTick) probes.add(t + d);
      }
      const checked: number[] = [];
      runHarness({
        chainLength: 1,
        specOf: () => spec,
        polls: everyTick(epoch, model.end + 2),
        epochNs: epoch,
        onPoll: (core) => {
          const t = core.tick;
          if (!probes.has(t)) return;
          checked.push(t);
          const expected = ref.reduceSnapshot(model.events, t);
          const actual: Any = JSON.parse(JSON.stringify(core.snapshot()));
          if (expected.round?.multiplier === "live") {
            expect(actual.round.multiplier).toBe(samples[t - expected.round.openedAtTick - 300]);
            expected.round.multiplier = actual.round.multiplier;
          }
          expect(actual, `tick ${t}`).toEqual(expected);
        },
      });
      expect(checked.length).toBe(probes.size);
    }
  });
});

/** Every number in a JSON value (recursively). */
const numbersIn = (v: unknown): number[] =>
  typeof v === "number"
    ? [v]
    : v !== null && typeof v === "object"
      ? Object.values(v).flatMap(numbersIn)
      : [];

describe("secret disclosure boundary", () => {
  /** Every public byte at tick t: the snapshot and every event so far, serialized. */
  const publicText = (core: SchedulerCore) =>
    JSON.stringify(core.snapshot()) + JSON.stringify(core.events());

  it("no future multiplier sample, crash point, jackpot, chest or boost appears before its tick", () => {
    const spec: RoundSpec = {
      outcome: "floor",
      diveTicks: 90,
      crashAt: 17.123456789,
      jackpot: 377.77,
      chests: [41.41, 23.45, 38.88],
      goldfish: [350, 389],
    };
    const script = makeScript(1, spec);
    const samples = script.secretContent().samples.multiplier;
    const epoch = 1_000_000_007n;
    const open = 240;
    const exit = open + 300 + 90;
    let boostsSeen = 0;
    runHarness({
      chainLength: 1,
      specOf: () => spec,
      scriptOf: () => makeScript(1, spec),
      polls: everyTick(epoch, exit + 84 + 360 + 132 + 2),
      epochNs: epoch,
      onPoll: (core) => {
        const t = core.tick;
        const text = publicText(core);
        // Future samples (index > the current dive tick) never appear; samples are distinct.
        const current = t - open - 300;
        for (let i = Math.max(1, current + 1); i < samples.length; i++) {
          expect(text.includes(JSON.stringify(samples[i])), `sample ${i} at ${t}`).toBe(false);
        }
        // A floor round never discloses its crash point (only the jackpot).
        expect(text.includes("17.123456789")).toBe(false);
        expect(text.includes("377.77")).toBe(t >= exit);
        for (const c of ["41.41", "23.45", "38.88"]) expect(text.includes(c)).toBe(t >= exit + 444);
        const boosts = core.events().filter((e) => e.type === "round.boost").length;
        expect(boosts).toBe((t >= open + 350 ? 1 : 0) + (t >= open + 389 ? 1 : 0));
        boostsSeen = boosts;
        // The end of the dive, the end of the round and the digest are never public early.
        if (t < exit) {
          expect(core.snapshot().round?.phaseEndsAtTick ?? null).toBe(
            t < open ? null : t < open + 300 ? open + 300 : null,
          );
          const nums = numbersIn([core.snapshot(), core.events()]);
          for (const secret of [exit, exit + 84, exit + 444, exit + 576]) {
            expect(nums.includes(secret), `tick ${secret} at ${t}`).toBe(false);
          }
          expect(text.includes(script.secretDigest())).toBe(false);
        }
      },
    });
    expect(boostsSeen).toBe(2);
  });

  it("SealedRound: public metadata only; opened exactly once; discarded seals never open", () => {
    const script = makeScript(1, FLOOR);
    const sealed = sealRoundScript(script);
    const secretBits = ["123.45", "44.44", script.secretDigest(), "9.5"];
    for (const text of [
      JSON.stringify(sealed),
      String(sealed),
      `${sealed}`,
      inspect(sealed, { depth: 9 }),
    ]) {
      for (const s of secretBits) expect(text.includes(s), text).toBe(false);
      expect(text).toContain("[redacted secret]");
    }
    expect(Object.keys(sealed)).toEqual(["admission"]);
    expect(sealed.admission).toEqual({
      chainId: CHAIN_ID,
      chainIndex: 1,
      fv: 1,
      scriptVersion: 1,
      status: "experimental-internal-offline",
    });
    expect(Object.isFrozen(sealed.admission)).toBe(true);
    // The only opener is the disclosure cursor's (claimed as disclosure.ts loaded).
    expect(RoundDisclosure.open(sealed, CHAIN_ID, 1)).toBeInstanceOf(RoundDisclosure);
    expect(sealed.state).toBe("opened");
    expect(() => RoundDisclosure.open(sealed, CHAIN_ID, 1)).toThrow(
      "sealed-misuse: already-opened",
    );
    const dropped = sealRoundScript(makeScript(2, CRASH));
    dropped.discard();
    expect(dropped.state).toBe("discarded");
    expect(() => RoundDisclosure.open(dropped, CHAIN_ID, 2)).toThrow(
      "sealed-misuse: already-discarded",
    );
    expect(() => sealRoundScript({} as never)).toThrow("sealed-misuse: not-a-script");
    expect(() => new (SealedRound as Any)(Symbol("x"), script)).toThrow("construction-refused");
  });

  it("M-1: no property, symbol or export reaches the opener; it cannot be claimed again", () => {
    const script = makeScript(1, CRASH);
    const sealed = sealRoundScript(script);
    const INSPECT = Symbol.for("nodejs.util.inspect.custom");
    expect(Reflect.ownKeys(SealedRound).sort()).toEqual(["length", "name", "prototype", "seal"]);
    expect(Object.getOwnPropertySymbols(SealedRound)).toEqual([]);
    expect(Reflect.ownKeys(SealedRound.prototype)).toEqual([
      "constructor",
      "state",
      "discard",
      "toJSON",
      "toString",
      INSPECT,
    ]);
    expect(Object.getOwnPropertySymbols(SealedRound.prototype)).toEqual([INSPECT]);
    expect(Reflect.ownKeys(sealed)).toEqual(["admission"]);
    expect(Object.getOwnPropertySymbols(sealed)).toEqual([]);
    expect(Object.keys(sealedModule).sort()).toEqual([
      "SealedRound",
      "claimSealedRoundOpener",
      "claimSourceSealing",
      "sealRoundScript",
    ]);
    // Every reachable function, called with the seal, hands out no script.
    const reachable: unknown[] = [];
    for (const target of [SealedRound, SealedRound.prototype, sealed, sealedModule]) {
      for (const key of Reflect.ownKeys(target)) {
        const d = Reflect.getOwnPropertyDescriptor(target, key)!;
        // A module namespace's export accessors return the exports themselves: call the exports.
        const fns = target === sealedModule ? [Reflect.get(target, key)] : [d.value, d.get];
        for (const fn of fns) {
          if (typeof fn !== "function" || fn === SealedRound) continue;
          try {
            reachable.push(fn.call(sealed, sealed));
          } catch (e) {
            reachable.push((e as Error).message);
          }
        }
      }
    }
    expect(reachable.some((v) => v === script || v instanceof Function)).toBe(false);
    // The disclosure module claimed the opener as it loaded: every later claim is refused.
    expect(() => claimSealedRoundOpener()).toThrow("sealed-misuse: opener-claimed");
    expect(() => claimSealedRoundOpener()).toThrow("sealed-misuse: opener-claimed");
    // The probes above changed nothing except discard() (one of the reachable methods).
    expect(sealed.state).toBe("discarded");
    const fresh = sealRoundScript(makeScript(1, CRASH));
    expect(fresh.state).toBe("sealed");
    expect(RoundDisclosure.open(fresh, CHAIN_ID, 1)).toBeInstanceOf(RoundDisclosure);
    expect(fresh.state).toBe("opened");
  });

  it("R-1: source seals are bound to one origin; test seals and other origins never match", () => {
    // `sealing` was claimed as this file loaded (its module graph does not load source.ts); in
    // the build, source.ts claims it as it loads (isolation / worker tests).
    expect(() => sealedModule.claimSourceSealing()).toThrow("sealed-misuse: sealing-claimed");
    expect(Object.isFrozen(sealing)).toBe(true);
    const origin = Object.freeze({});
    const other = Object.freeze({});
    const own = sealing.seal(makeScript(1, CRASH), origin);
    const test = sealRoundScript(makeScript(1, CRASH));
    expect(sealing.sealedBy(own, origin)).toBe(true);
    expect(sealing.sealedBy(own, other)).toBe(false);
    expect(sealing.sealedBy(test, origin)).toBe(false);
    // Neither the public view nor any key of the seal shows the origin.
    expect(Reflect.ownKeys(own)).toEqual(["admission"]);
    expect(JSON.stringify(own)).toBe(JSON.stringify(test));
    // Look-alikes: a copy, a prototype child, a Proxy of the real seal.
    for (const fake of [
      { ...own },
      Object.create(own),
      new Proxy(own, {}),
      Object.create(SealedRound.prototype),
      null,
      undefined,
      "sealed",
    ]) {
      expect(sealing.sealedBy(fake, origin)).toBe(false);
    }
    for (const bad of [null, undefined, 1, "x"]) {
      expect(() => sealing.seal(makeScript(1, CRASH), bad as never)).toThrow(
        "sealed-misuse: invalid-origin",
      );
    }
    expect(() => sealing.seal({} as never, origin)).toThrow("sealed-misuse: not-a-script");
    // Only an UNOPENED seal matches: opened or discarded seals never do.
    expect(RoundDisclosure.open(own, CHAIN_ID, 1)).toBeInstanceOf(RoundDisclosure);
    expect(sealing.sealedBy(own, origin)).toBe(false);
    const dropped = sealing.seal(makeScript(2, CRASH), origin);
    dropped.discard();
    expect(sealing.sealedBy(dropped, origin)).toBe(false);
  });

  it("R-1: the pure modules' classes, prototypes and statics cannot be replaced", () => {
    for (const [i, target] of [
      SealedRound,
      SealedRound.prototype,
      RoundDisclosure,
      RoundDisclosure.prototype,
      SchedulerCore,
      SchedulerCore.prototype,
      EventLog,
      EventLog.prototype,
      SchedulerError,
      SchedulerError.prototype,
      SimulatedClock,
      SimulatedClock.prototype,
    ].entries()) {
      expect(Object.isFrozen(target), `target ${i}`).toBe(true);
    }
    const original = SchedulerCore.prototype.deliver;
    expect(() => {
      (SchedulerCore.prototype as Any).deliver = () => [];
    }).toThrow(TypeError);
    expect(() => {
      (RoundDisclosure as Any).open = () => null;
    }).toThrow(TypeError);
    expect(() => Object.setPrototypeOf(SealedRound.prototype, {})).toThrow(TypeError);
    expect(() => {
      (SealedRound as Any)[Symbol.hasInstance] = () => true;
    }).toThrow(TypeError);
    expect(SchedulerCore.prototype.deliver).toBe(original);
    // A SchedulerError is still an ordinary error (its own name, code and reason).
    const e = new SchedulerError("invalid-state", "x");
    expect([e.name, e.code, e.reason, e.message]).toEqual([
      "SchedulerError",
      "invalid-state",
      "x",
      "invalid-state: x",
    ]);
  });

  it("RoundDisclosure: strictly the next tick; no other read; redacted; released at the end", () => {
    const d = RoundDisclosure.open(sealRoundScript(makeScript(4, CRASH)), CHAIN_ID, 4);
    expect(() => d.advance(1)).toThrow("invalid-argument: tick-sequence");
    expect(d.advance(0)).toEqual([{ kind: "betting", closesAt: 300 }]);
    expect(() => d.advance(0)).toThrow("tick-sequence");
    expect(() => d.advance(5)).toThrow("tick-sequence");
    const methods = Object.getOwnPropertyNames(RoundDisclosure.prototype).sort();
    expect(methods).toEqual(
      ["advance", "constructor", "ended", "release", "tick", "toJSON", "toString", "view"].sort(),
    );
    for (const text of [JSON.stringify(d), String(d), inspect(d, { depth: 9 })]) {
      expect(text).not.toContain("2.37");
      expect(text).not.toContain("337"); // the exit tick
    }
    let r = 0;
    while (!d.ended) d.advance(++r);
    expect(r).toBe(337 + 144);
    expect(() => d.advance(r + 1)).toThrow("invalid-state: round-ended");
    // A seal of another round or chain is refused (and discarded unopened).
    const other = sealRoundScript(makeScript(5, CRASH));
    expect(() => RoundDisclosure.open(other, CHAIN_ID, 6)).toThrow(
      "contract-violation: index-sequence",
    );
    expect(other.state).toBe("discarded");
  });

  it("the core, its errors and the event log never print secrets", () => {
    const { core } = runChain([FLOOR]);
    for (const text of [JSON.stringify(core), String(core), inspect(core, { depth: 9 })]) {
      expect(text).toMatch(
        /^(\{"scheduler":"SchedulerCore".*\}|SchedulerCore\(halted, tick \d+\)|\[object Object\])$/,
      );
    }
    const e = new SchedulerError("contract-violation", "value 1.23");
    expect(e.message).toBe("contract-violation");
    expect(e.reason).toBeNull();
    const log = new EventLog(hash, 16);
    expect(JSON.stringify(log)).toBe('{"log":"EventLog","total":0,"dropped":0}');
  });
});

describe("determinism, drift and lateness over many rounds", () => {
  it("10,000 rounds: exact boundaries, no drift, one round at a time, log = reference", () => {
    const N = 10_000;
    const spec = specStream(0x5eed);
    const specs = Array.from({ length: N }, (_, i) => spec(i + 1));
    const model = ref.referenceLog(CHAIN_ID, N, specs.map(factsOf));
    const epoch = 999_999_937n;
    let maxResidency = 0;
    let polls = 0;
    const { core, requested, delivered } = runHarness({
      chainLength: N,
      specOf: (n) => specs[n - 1]!,
      polls: jittered(epoch, model.end + 3, 200, 7),
      latencyNs: (n) => BigInt(1 + (n % 30)) * NS_PER_TICK + 123n,
      epochNs: epoch,
      eventCapacity: 1024,
      onPoll: (c) => {
        polls += 1;
        maxResidency = Math.max(maxResidency, c.residency().total);
      },
    });
    expect(core.state).toBe("halted");
    expect(core.snapshot().halted).toEqual({
      reason: "chain-exhausted",
      tick: model.end,
      interruptedRound: null,
    });
    expect(core.digest).toBe(model.digest);
    expect(core.eventTotal).toBe(model.events.length);
    expect(core.events()).toEqual(model.events.slice(-1024)); // bounded retention
    expect(core.eventsDropped).toBe(model.events.length - 1024);
    // Every round requested and delivered exactly once, in order; never more than 2 held.
    expect(requested).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(delivered).toEqual(requested);
    expect(maxResidency).toBe(2);
    expect(polls).toBeGreaterThan(N);
    // Exact boundaries: opening n + 1 = opening n + duration n (independent sum, integers).
    let open = 240;
    for (let i = 0; i < N; i++) {
      expect(model.opens[i]).toBe(open);
      open += ref.endOf(factsOf(specs[i]!));
    }
    expect(model.end).toBe(open);
    // The scheduled instant of the final tick is exact.
    expect(instantOf(epoch, model.end)).toBe(epoch + (BigInt(open) * 1_000_000_000n) / 60n);
  }, 120_000);

  it("identical logs under every-tick, jittered, sparse and single-jump polling", () => {
    const spec = specStream(42);
    const specs = Array.from({ length: 300 }, (_, i) => spec(i + 1));
    const runs = [
      runChain(specs),
      runChain(specs, (e, last) => jittered(e, last, 230, 1)),
      runChain(specs, (e, last) => jittered(e, last, 17, 2)),
    ];
    for (const r of runs) {
      expect(r.core.digest).toBe(r.model.digest);
      expect(r.core.eventTotal).toBe(r.model.events.length);
    }
    // Lateness changes nothing as long as a request is sent within 240 ticks of its opening
    // tick; one poll at the very end is a stall of the whole timeline, which halts at round 1's
    // admission deadline instead (fail closed; see the stall test below).
    const epoch = 1_000_000_007n;
    const model = runs[0]!.model;
    const single = runHarness({
      chainLength: specs.length,
      specOf: (n) => specs[n - 1]!,
      polls: [instantOf(epoch, model.end + 1)],
      epochNs: epoch,
    });
    expect(single.core.snapshot().halted).toMatchObject({ reason: "admission-deadline-missed" });
  });

  it("a stall past the admission deadline halts (fail closed) — it never changes an outcome", () => {
    const specs = [CRASH, CRASH, CRASH];
    const epoch = 1_000_000_007n;
    // Round 2's script takes 300 ticks: past its deadline (round 1 opens at 240; deadline 480).
    const r = runHarness({
      chainLength: 3,
      specOf: (n) => specs[n - 1]!,
      polls: everyTick(epoch, 2000),
      latencyNs: (n) => (n === 2 ? 300n * NS_PER_TICK : 5n * NS_PER_TICK),
      epochNs: epoch,
    });
    const types = r.core.events().map((e) => `${e.tick}:${e.type}`);
    expect(types).toContain("480:scheduler.halting");
    expect(r.core.snapshot().halting).toEqual({
      reason: "admission-deadline-missed",
      sinceTick: 480,
    });
    // Round 1 plays to its end exactly as the reference; then the halt; round 2 never opens.
    const one = ref.referenceLog(CHAIN_ID, 1, [factsOf(CRASH)]).events;
    const played = r.core.events().filter((e) => e.round === 1 && e.type !== "round.admitted");
    expect(played).toEqual(
      one
        .filter((e: Any) => e.round === 1 && e.type !== "round.admitted")
        .map((e: Any) => ({ ...e, seq: expect.any(Number) })),
    );
    const last = r.core.events().at(-1)!;
    expect(last).toMatchObject({
      type: "scheduler.halted",
      tick: 240 + 300 + 37 + 144,
      reason: "admission-deadline-missed",
      interruptedRound: null,
    });
    expect(r.core.snapshot().lastRound).toBe(1);
    expect(r.core.discarded).toBe(1); // round 2 arrived late: discarded unopened
    expect(r.requested).toEqual([1, 2]);
  });
});

describe("admission, failures and halts", () => {
  const epoch = 1_000_000_007n;
  const base = (over: Partial<Parameters<typeof runHarness>[0]>) =>
    runHarness({
      chainLength: 5,
      specOf: (n) => [CRASH, FLOOR, CRASH, CRASH, CRASH][n - 1]!,
      polls: everyTick(epoch, 4000),
      epochNs: epoch,
      ...over,
    });
  const kinds = (core: SchedulerCore) => core.events().map((e) => `${e.tick}:${e.type}:${e.round}`);

  it("round 1 must be held before tick 240; arriving at 240 is too late (halt at 240, no round)", () => {
    const late = base({ latencyNs: (n) => (n === 1 ? instantOf(0n, 240) : 1n) });
    expect(kinds(late.core)).toEqual([
      "0:scheduler.started:null",
      "240:scheduler.halting:null",
      "240:scheduler.halted:null",
    ]);
    expect(late.core.snapshot().halted).toEqual({
      reason: "admission-deadline-missed",
      tick: 240,
      interruptedRound: null,
    });
    const ok = base({ latencyNs: (n) => (n === 1 ? instantOf(0n, 240) - 1n : 1n) });
    expect(kinds(ok.core).slice(0, 3)).toEqual([
      "0:scheduler.started:null",
      "240:round.admitted:1",
      "240:round.betting:1",
    ]);
  });

  it("a never-arriving script halts at its deadline; the active round finishes first", () => {
    const r = base({ latencyNs: (n) => (n === 3 ? null : 1n) });
    const t = kinds(r.core);
    const open2 = 240 + 300 + 37 + 144;
    expect(t).toContain(`${open2 + 240}:scheduler.halting:null`);
    const end2 = open2 + 300 + 400 + 576;
    expect(t.slice(-2)).toEqual([`${end2}:round.ended:2`, `${end2}:scheduler.halted:null`]);
    expect(r.requested).toEqual([1, 2, 3]); // no retry
  });

  it("a preparation failure halts after the active round; nothing is retried", () => {
    const r = base({ failures: [{ atNs: instantOf(epoch, 700), failure: "preparation-failed" }] });
    expect(kinds(r.core)).toContain("700:source.failed:null");
    expect(r.core.snapshot().halted).toMatchObject({
      reason: "preparation-failed",
      interruptedRound: null,
    });
    expect(r.requested).toEqual([1, 2]);
    expect(
      r.core
        .events()
        .filter((e) => e.type === "round.ended")
        .map((e) => e.reveal),
    ).toEqual(["deferred"]);
  });

  it("worker loss (SD-6): the active round finishes with its reveal unavailable, then halt", () => {
    const r = base({ failures: [{ atNs: instantOf(epoch, 1000), failure: "lost" }] });
    const ended = r.core.events().filter((e) => e.type === "round.ended");
    expect(ended.map((e) => [e.round, e.reveal])).toEqual([
      [1, "deferred"],
      [2, "unavailable"],
    ]);
    expect(r.core.snapshot()).toMatchObject({
      state: "halted",
      halted: { reason: "source-lost", interruptedRound: null },
      lastRound: 2,
    });
    // Round 3 had been admitted (held) before the loss: it is discarded, never opened.
    expect(r.core.discarded).toBe(1);
  });

  it("worker loss before the first round halts at once", () => {
    const r = base({
      failures: [{ atNs: instantOf(epoch, 10), failure: "lost" }],
      latencyNs: () => null,
    });
    expect(kinds(r.core)).toEqual([
      "0:scheduler.started:null",
      "10:source.failed:null",
      "10:scheduler.halting:null",
      "10:scheduler.halted:null",
    ]);
  });

  it("contract violations halt immediately and interrupt the active round", () => {
    // A script of the wrong index, of another chain, and an undelivered-request duplicate.
    for (const [name, scriptOf] of [
      ["wrong index", (n: number) => makeScript(n === 2 ? 3 : n, CRASH)],
      ["wrong chain", (n: number) => makeScript(n, CRASH, n === 2 ? "77".repeat(32) : CHAIN_ID)],
    ] as const) {
      const r = base({ scriptOf });
      expect(r.core.snapshot().halted, name).toEqual({
        reason: "source-contract-violation",
        tick: 244, // round 2 requested at 240, 5 × floor(1e9 / 60) ns later: tick 244
        interruptedRound: 1,
      });
      expect(
        r.core.events().some((e) => e.type === "round.ended"),
        name,
      ).toBe(false);
    }
    const r = base({ failures: [{ atNs: instantOf(epoch, 300), failure: "contract-violation" }] });
    expect(r.core.snapshot().halted).toEqual({
      reason: "source-contract-violation",
      tick: 300,
      interruptedRound: 1,
    });
    // A delivery nobody requested.
    const core = new SchedulerCore({ chain: { chainId: CHAIN_ID, chainLength: 5, fv: 1 }, hash });
    core.start();
    core.advanceTo(10);
    core.deliver(sealRoundScript(makeScript(1, CRASH)));
    expect(() => core.deliver(sealRoundScript(makeScript(1, CRASH)))).not.toThrow();
    expect(core.snapshot().halted).toMatchObject({ reason: "source-contract-violation", tick: 10 });
  });

  it("chain exhaustion (SD-10): plays the last index, halts at its end, never requests past it", () => {
    const r = runHarness({
      chainLength: 3,
      specOf: (n) => [CRASH, ONE, FLOOR][n - 1]!,
      polls: everyTick(epoch, 5000),
      epochNs: epoch,
    });
    expect(r.requested).toEqual([1, 2, 3]);
    expect(r.core.events()).toEqual(
      ref.referenceLog(CHAIN_ID, 3, [CRASH, ONE, FLOOR].map(factsOf)).events,
    );
  });

  it("owner stop is an immediate halt; later deliveries are discarded; nothing restarts", () => {
    const core = new SchedulerCore({ chain: { chainId: CHAIN_ID, chainLength: 9, fv: 1 }, hash });
    expect(core.start()).toEqual([{ type: "prepare", roundNumber: 1 }]);
    core.advanceTo(100);
    core.deliver(sealRoundScript(makeScript(1, CRASH)));
    expect(core.advanceTo(400)).toEqual([{ type: "prepare", roundNumber: 2 }]);
    expect(core.stop()).toEqual([{ type: "halted", reason: "owner-stopped" }]);
    expect(core.snapshot().halted).toEqual({
      reason: "owner-stopped",
      tick: 400,
      interruptedRound: 1,
    });
    const late = sealRoundScript(makeScript(2, CRASH));
    expect(core.deliver(late)).toEqual([]);
    expect(late.state).toBe("discarded");
    expect(core.advanceTo(10_000)).toEqual([]);
    expect(core.tick).toBe(400);
    expect(() => core.start()).toThrow("invalid-state: halted");
  });

  it.each(["clock-failed", "internal-error"] as const)(
    "driver fault %s: immediate halt at the last processed tick; held seal discarded unopened",
    (reason) => {
      const core = new SchedulerCore({ chain: { chainId: CHAIN_ID, chainLength: 9, fv: 1 }, hash });
      expect(() => core.fault(reason)).toThrow("invalid-state: created");
      core.start();
      core.advanceTo(100);
      core.deliver(sealRoundScript(makeScript(1, CRASH)));
      expect(core.advanceTo(400)).toEqual([{ type: "prepare", roundNumber: 2 }]);
      const held = sealRoundScript(makeScript(2, CRASH));
      core.deliver(held);
      expect(core.residency()).toEqual({ active: 1, next: "held", total: 2 });
      expect(() => core.fault("other" as never)).toThrow("invalid-failure");
      expect(core.fault(reason)).toEqual([{ type: "halted", reason }]);
      expect(held.state).toBe("discarded");
      expect(core.residency()).toEqual({ active: 0, next: "none", total: 0 });
      expect(core.snapshot().halted).toEqual({ reason, tick: 400, interruptedRound: 1 });
      expect(core.events().at(-1)).toMatchObject({
        tick: 400,
        type: "scheduler.halted",
        reason,
        interruptedRound: 1,
      });
      // Never "completed": round 1 has no round.ended event.
      expect(core.events().some((e) => e.type === "round.ended")).toBe(false);
      expect(core.fault(reason)).toEqual([]); // idempotent
      expect(core.advanceTo(10_000)).toEqual([]);
      expect(core.tick).toBe(400);
    },
  );

  it("no outcome-dependent abandonment: halts depend on timing only, never on the script", () => {
    // The same late arrival for a crash script and for a floor script: the same halt, same tick,
    // and the late script is never opened either way.
    const halts = [CRASH, FLOOR].map((late) => {
      const r = runHarness({
        chainLength: 3,
        specOf: (n) => (n === 2 ? late : CRASH),
        polls: everyTick(epoch, 3000),
        latencyNs: (n) => (n === 2 ? 241n * NS_PER_TICK : NS_PER_TICK),
        epochNs: epoch,
      });
      return [r.core.snapshot().halted, r.core.discarded, r.core.events().length];
    });
    expect(halts[0]).toEqual(halts[1]);
  });

  it("residency: active + held/admitted + requested ≤ 2 at every tick", () => {
    let max = 0;
    const seen = new Set<string>();
    base({
      onPoll: (c) => {
        const r = c.residency();
        max = Math.max(max, r.total);
        seen.add(`${r.active}/${r.next}`);
        expect(r.total).toBeLessThanOrEqual(2);
      },
    });
    expect(max).toBe(2);
    expect([...seen].sort()).toEqual(
      ["0/requested", "0/held", "1/requested", "1/held", "1/admitted", "1/none", "0/none"].sort(),
    );
  });
});

describe("events, ids and retention", () => {
  it("round ids are the domain-separated SHA-256 of the public metadata (node:crypto)", () => {
    for (const [i, n] of [
      [1, 1],
      [7, 7],
      [65_536, 65_536],
      [Number.MAX_SAFE_INTEGER, 1],
    ]) {
      expect(deriveRoundId(hash, CHAIN_ID, i!, n!)).toBe(ref.roundId(CHAIN_ID, i, n));
    }
    expect(() => deriveRoundId(hash, "AB".repeat(32), 1, 1)).toThrow("invalid-chain-id");
    expect(() => deriveRoundId(hash, CHAIN_ID, 0, 1)).toThrow("invalid-index");
    const ids = new Set(
      Array.from({ length: 5000 }, (_, k) => deriveRoundId(hash, CHAIN_ID, k + 1, k + 1)),
    );
    expect(ids.size).toBe(5000);
  });

  it("sequence numbers increase by one; ticks never decrease; one active round at a time", () => {
    const spec = specStream(9);
    const { core } = runChain(Array.from({ length: 200 }, (_, i) => spec(i + 1)));
    const events = core.events();
    let open: number | null = null;
    events.forEach((e, i) => {
      expect(e.seq).toBe(i + 1);
      if (i > 0) expect(e.tick).toBeGreaterThanOrEqual(events[i - 1]!.tick);
      if (e.type === "round.betting") {
        expect(open).toBeNull();
        expect(e.round).toBe(events.slice(0, i).filter((x) => x.type === "round.ended").length + 1);
        open = e.round;
      }
      if (e.type === "round.ended") {
        expect(e.round).toBe(open);
        open = null;
      }
      expect(Object.isFrozen(e)).toBe(true);
    });
  });

  it("bounded retention: the log keeps `capacity` events, the digest covers all", () => {
    const log = new EventLog(hash, 16);
    for (let i = 0; i < 100; i++) log.append(i, "round.dive", i);
    expect(log.total).toBe(100);
    expect(log.dropped).toBe(84);
    expect(log.since().map((e) => e.seq)).toEqual(Array.from({ length: 16 }, (_, i) => 85 + i));
    expect(log.since(95).map((e) => e.seq)).toEqual([96, 97, 98, 99, 100]);
    const events = Array.from({ length: 100 }, (_, i) => ({
      seq: i + 1,
      tick: i,
      type: "round.dive",
      round: i,
    }));
    expect(log.digest).toBe(ref.logDigest(events));
    expect(() => new EventLog(hash, 15)).toThrow("invalid-capacity");
    expect(() => new EventLog(hash, 65_537)).toThrow("invalid-capacity");
    expect(() => log.append(5, "round.dive", 1)).toThrow("event-order");
    expect(() => log.append(200, "round.crashed", 1, { crashAt: 2 })).toThrow("invalid-event");
  });

  it("memory stays bounded over 3,000 rounds (log capacity, no retained scripts)", () => {
    const spec = specStream(77);
    const specs = Array.from({ length: 3000 }, (_, i) => spec(i + 1));
    const epoch = 1_000_000_007n;
    const model = ref.referenceLog(CHAIN_ID, 3000, specs.map(factsOf));
    const heap: number[] = [];
    const { core } = runHarness({
      chainLength: 3000,
      specOf: (n) => specs[n - 1]!,
      polls: jittered(epoch, model.end + 1, 120, 3),
      epochNs: epoch,
      eventCapacity: 256,
      onPoll: (c) => {
        if (c.snapshot().lastRound % 500 === 0) heap.push(process.memoryUsage().heapUsed);
      },
    });
    expect(core.digest).toBe(model.digest);
    expect(core.events().length).toBe(256);
    // No growth trend beyond noise (no script, seal or event is retained per round).
    const mb = heap.map((h) => h / 1048576);
    expect(Math.max(...mb) - Math.min(...mb)).toBeLessThan(200);
  }, 60_000);
});

describe("argument validation", () => {
  it("refuses malformed options, ticks, failures and seals", () => {
    const ok = { chain: { chainId: CHAIN_ID, chainLength: 2, fv: 1 }, hash };
    for (const bad of [
      null,
      {},
      { ...ok, chain: { ...ok.chain, chainId: "x" } },
      { ...ok, chain: { ...ok.chain, chainLength: 0 } },
      { ...ok, chain: { ...ok.chain, fv: 2 } },
      { ...ok, hash: {} },
    ]) {
      expect(() => new SchedulerCore(bad as never)).toThrow("invalid-argument: invalid-options");
    }
    expect(() => new SchedulerCore({ ...ok, eventCapacity: 3 })).toThrow("invalid-capacity");
    const core = new SchedulerCore(ok);
    expect(() => core.advanceTo(1)).toThrow("invalid-state: created");
    expect(() => core.deliver({} as never)).toThrow("invalid-state: created");
    core.start();
    expect(() => core.advanceTo(1.5)).toThrow("invalid-tick");
    expect(() => core.advanceTo(Number.MAX_SAFE_INTEGER + 2)).toThrow("invalid-tick");
    expect(() => core.sourceFailed("other" as never)).toThrow("invalid-failure");
    expect(() => core.deliver({ admission: {} } as never)).toThrow("sealed-misuse: not-sealed");
    const opened = sealRoundScript(makeScript(1, CRASH));
    RoundDisclosure.open(opened, CHAIN_ID, 1);
    expect(() => core.deliver(opened)).toThrow("sealed-misuse: not-sealed");
    expect(core.advanceTo(0)).toEqual([]); // a stale poll is a no-op
  });
});
