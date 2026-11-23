// RoundScript validation, immutability and redaction (P8-4a; K5, K6, K11). Source-level tests.
//
// The real engine output is tested on the compiled build (round-runtime.test.ts). Here a minimal
// but genuine round shape — a 1.00× crash point, which crashes on the first diving step before
// any descent or spawn — exercises every validation rule field by field.
//
// The fixtures are deliberately mutated into invalid shapes (deleted keys, wrong types), which a
// precise type would forbid; hence `any` for the edit callbacks in this file only.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createNodeFairnessCrypto } from "../../src/fairness/crypto-node";
import { SCRIPT_FAILURE_CODES } from "../../src/fairness/audit";
import { EXPECTED_RUNNER_PROFILE } from "../../src/round/engine-types";
import { ROUND_SCRIPT_ERROR_CODES, RoundScriptError } from "../../src/round/errors";
import {
  KNOWN_ANSWER_DIGEST_STATUS,
  ROUND_SCRIPT_KNOWN_ANSWERS,
} from "../../src/round/known-answers";
import {
  ANALYTIC_MAX_DIVE_TICKS,
  ANALYTIC_MAX_TERMINAL_TICK,
  RoundScript,
  buildRoundScript,
  diffRoundScripts,
  parseRoundScript,
  validateRunnerOutput,
} from "../../src/round/round-script";

const { hash } = createNodeFairnessCrypto();
const CHAIN_ID = "ab".repeat(32);
const SALT = "cd".repeat(16);

/** A 1.00× crash round: crash at tick 301, before any descent or spawn. */
const minimalOutput = () => ({
  profile: "aquadive-offline-round-runner",
  profileVersion: 1,
  fv: 1,
  chainIndex: 5,
  outcome: "crash",
  crashAt: 1,
  diveStartTick: 300,
  exitDiveTick: 301,
  impactTick: null,
  terminalTick: 301,
  jackpot: null,
  chests: null,
  samples: { multiplier: [1], boost: [0], worldY: [0] },
  creatures: [] as unknown[],
  final: { worldY: 0, boost: 0, multiplier: 1, nextSpawnAt: 60, nextCreatureId: 1 },
  drawCounts: { crash: 1, jackpot: 0, chests: 0, world: 0 },
});

/** A short floor-shaped round (validation only checks the fixed rules, not the physics). */
const floorOutput = () => {
  const n = 40;
  return {
    ...minimalOutput(),
    outcome: "floor",
    crashAt: 28.5,
    exitDiveTick: 300 + n,
    impactTick: 300 + n,
    terminalTick: 300 + n + 84,
    jackpot: 51.71,
    chests: [1.88, 2.11, 8.74],
    samples: {
      multiplier: Array.from({ length: n }, (_, i) => 1 + i / 100),
      boost: Array.from({ length: n }, (_, i): number => (i === 10 ? 0.8 : 0)),
      worldY: Array.from({ length: n }, (_, i) => i * 100),
    },
    creatures: [
      {
        id: 1,
        kind: "goldfish",
        x: 0.5,
        worldY: 320,
        size: 1,
        phase: 1,
        dir: 1,
        spawnTick: 301,
        consumedTick: 310 as number | null,
      },
    ],
    final: { worldY: 4210, boost: 0.5, multiplier: 51.71, nextSpawnAt: 4500, nextCreatureId: 2 },
    drawCounts: { crash: 2, jackpot: 2, chests: 6, world: 7 },
  };
};

const build = (output: unknown, chainIndex = 5) =>
  buildRoundScript(
    hash,
    { chainId: CHAIN_ID, chainIndex, salt: SALT },
    validateRunnerOutput(output, chainIndex),
  );

const expectInvalid = (fn: () => unknown) => {
  let error: unknown = null;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(RoundScriptError);
  expect(error).toMatchObject({ code: "script-invalid", reason: null, message: "script-invalid" });
  expect((error as Error).cause).toBeUndefined();
};

/** Applies `edit` to a fresh copy of `base` and expects validation to refuse it. */
const refuses = (base: () => Record<string, unknown>, edit: (o: any) => void) => {
  const o = base();
  edit(o);
  expectInvalid(() => build(o));
};

describe("validateRunnerOutput / buildRoundScript", () => {
  it("accepts a genuine 1.00× crash round and a floor-shaped round", () => {
    expect(build(minimalOutput()).secretContent().outcome).toBe("crash");
    expect(build(floorOutput()).secretContent().outcome).toBe("floor");
  });

  it.each([
    ["an extra key", (o: any) => (o.extra = 1)],
    ["a missing key", (o: any) => delete o.final],
    ["another profile", (o: any) => (o.profile = "other")],
    ["another profile version", (o: any) => (o.profileVersion = 2)],
    ["another fv", (o: any) => (o.fv = 2)],
    ["another chain index", (o: any) => (o.chainIndex = 6)],
    ["an unknown outcome", (o: any) => (o.outcome = "void")],
    ["a betting period other than 300 ticks", (o: any) => (o.diveStartTick = 299)],
    ["a crash tick that is not the terminal tick", (o: any) => (o.terminalTick = 302)],
    ["an impact tick on a crash round", (o: any) => (o.impactTick = 301)],
    ["a jackpot on a crash round", (o: any) => (o.jackpot = 60)],
    ["chests on a crash round", (o: any) => (o.chests = [1, 2, 3])],
    ["a crash point below 1", (o: any) => (o.crashAt = 0.99)],
    [
      "a crash point between 1 and 1.01",
      (o: any) => ((o.crashAt = 1.005), (o.drawCounts.crash = 2)),
    ],
    ["a crash point above 200", (o: any) => (o.crashAt = 200.5)],
    [
      "one crash draw without a 1.00× crash",
      (o: any) => ((o.crashAt = 1.5), (o.final.multiplier = 1.5)),
    ],
    ["jackpot draws on a crash round", (o: any) => (o.drawCounts.jackpot = 2)],
    ["world draws that are not seven per creature", (o: any) => (o.drawCounts.world = 1)],
    ["a sample series of the wrong length", (o: any) => o.samples.boost.push(0)],
    ["a dive start that is not (1, 0, 0)", (o: any) => (o.samples.multiplier[0] = 1.001)],
    ["a NaN sample", (o: any) => (o.samples.worldY[0] = Number.NaN)],
    ["a negative-zero sample", (o: any) => (o.samples.boost[0] = -0)],
    ["a final multiplier other than the crash point", (o: any) => (o.final.multiplier = 1.2)],
    ["a final worldY other than the last sample", (o: any) => (o.final.worldY = 1)],
    ["a creature counter that does not match", (o: any) => (o.final.nextCreatureId = 2)],
    ["a fractional tick", (o: any) => ((o.exitDiveTick = 300.5), (o.terminalTick = 300.5))],
  ])("refuses a crash round with %s", (_name, edit) => {
    refuses(minimalOutput as () => Record<string, unknown>, edit);
  });

  it.each([
    ["a terminal tick other than impact + 84", (o: any) => (o.terminalTick += 1)],
    [
      "a dive longer than the analytic bound",
      (o: any) => {
        const n = ANALYTIC_MAX_DIVE_TICKS + 1;
        o.exitDiveTick = o.impactTick = 300 + n;
        o.terminalTick = 300 + n + 84;
        o.samples = {
          multiplier: Array.from({ length: n }, () => 1),
          boost: Array.from({ length: n }, () => 0),
          worldY: Array.from({ length: n }, (_, i) => i),
        };
      },
    ],
    [
      "a jackpot with three decimals",
      (o: any) => ((o.jackpot = 51.715), (o.final.multiplier = 51.715)),
    ],
    ["a jackpot out of range", (o: any) => ((o.jackpot = 40), (o.final.multiplier = 40))],
    ["two chests", (o: any) => o.chests.pop()],
    ["a chest out of range", (o: any) => (o.chests[1] = 50.01)],
    ["a missing jackpot", (o: any) => (o.jackpot = null)],
    ["a final multiplier other than the jackpot", (o: any) => (o.final.multiplier = 1)],
    ["a final worldY above the floor", (o: any) => (o.final.worldY = 4100)],
    ["six chest draws missing", (o: any) => (o.drawCounts.chests = 0)],
    ["a worldY that does not increase", (o: any) => (o.samples.worldY[5] = o.samples.worldY[4])],
    ["a sample at or above the crash point", (o: any) => (o.samples.multiplier[5] = 28.5)],
    ["a boost above 1", (o: any) => (o.samples.boost[10] = 1.2)],
    ["an unknown creature kind", (o: any) => (o.creatures[0].kind = "shark")],
    ["a creature id out of order", (o: any) => (o.creatures[0].id = 2)],
    ["a creature x out of range", (o: any) => (o.creatures[0].x = 0.95)],
    ["a creature dir of 0", (o: any) => (o.creatures[0].dir = 0)],
    ["a creature spawned during betting", (o: any) => (o.creatures[0].spawnTick = 300)],
    ["a creature spawned after the dive", (o: any) => (o.creatures[0].spawnTick = 341)],
    ["a creature consumed before it spawned", (o: any) => (o.creatures[0].consumedTick = 300)],
    ["a non-goldfish consumed", (o: any) => (o.creatures[0].kind = "kelp")],
    ["an extra creature field", (o: any) => (o.creatures[0].consumed = true)],
  ])("refuses a floor round with %s", (_name, edit) => {
    refuses(floorOutput as () => Record<string, unknown>, edit);
  });

  it("refuses runner output that is not plain data (getter, class instance)", () => {
    const withGetter = minimalOutput() as Record<string, unknown>;
    Object.defineProperty(withGetter, "crashAt", { get: () => 1, enumerable: true });
    expectInvalid(() => validateRunnerOutput(withGetter, 5));
    const withClass = { ...minimalOutput(), final: new (class F {})() };
    expectInvalid(() => validateRunnerOutput(withClass, 5));
  });

  it("buildRoundScript validates output that did not come from validateRunnerOutput", () => {
    const pub = { chainId: CHAIN_ID, chainIndex: 5, salt: SALT };
    const raw = floorOutput() as never;
    expect(buildRoundScript(hash, pub, raw).secretDigest()).toBe(
      build(floorOutput()).secretDigest(),
    );
    const bad = floorOutput();
    bad.drawCounts.world = 8;
    expectInvalid(() => buildRoundScript(hash, pub, bad as never));
    const getter = minimalOutput() as Record<string, unknown>;
    Object.defineProperty(getter, "crashAt", { get: () => 1, enumerable: true });
    expectInvalid(() => buildRoundScript(hash, pub, getter as never));
  });

  it("returns a detached copy: changing the input afterwards changes nothing", () => {
    const raw = minimalOutput();
    const out = validateRunnerOutput(raw, 5);
    raw.samples.multiplier[0] = 99;
    expect(out.samples.multiplier[0]).toBe(1);
    expect(Object.isFrozen(out.samples.multiplier)).toBe(true);
  });

  it("refuses malformed public metadata", () => {
    const output = validateRunnerOutput(minimalOutput(), 5);
    const bad = [
      { chainId: "AB".repeat(32), chainIndex: 5, salt: SALT },
      { chainId: CHAIN_ID, chainIndex: 5, salt: "cd".repeat(15) },
      { chainId: CHAIN_ID, chainIndex: 5, salt: "cd".repeat(65) },
      { chainId: CHAIN_ID, chainIndex: 0, salt: SALT },
    ];
    for (const pub of bad) expectInvalid(() => buildRoundScript(hash, pub, output));
    // chain index of the metadata and of the runner output must agree
    expectInvalid(() =>
      buildRoundScript(hash, { chainId: CHAIN_ID, chainIndex: 6, salt: SALT }, output),
    );
  });
});

describe("RoundScript", () => {
  it("is immutable, deeply frozen and constructible only through the module", () => {
    const s = build(floorOutput());
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.public)).toBe(true);
    expect(Object.isFrozen(s.secretContent().creatures[0])).toBe(true);
    expect(Object.isFrozen(s.secretContent().samples.worldY)).toBe(true);
    expect(() => {
      (s.secretContent().samples.worldY as number[])[0] = 1;
    }).toThrow(TypeError);
    expect(
      () => new RoundScript(Symbol("x"), s.public, s.secretContent(), new Uint8Array(), ""),
    ).toThrow("script-invalid");
    const bytes = s.secretCanonicalBytes();
    bytes[0] = 0;
    expect(s.secretCanonicalBytes()[0]).toBe("{".charCodeAt(0));
  });

  it("renders public metadata only (JSON, String, template, inspect)", () => {
    const s = build(floorOutput());
    const secrets = ["28.5", "51.71", "4210", "8.74", "4500", s.secretDigest(), '"world":7'];
    const views = [
      JSON.stringify(s),
      String(s),
      `${s}`,
      inspect(s),
      inspect(s, { depth: Infinity, showHidden: true }),
      inspect({ nested: [s] }, { depth: Infinity }),
    ];
    for (const v of views) for (const x of secrets) expect(v).not.toContain(x);
    expect(JSON.parse(JSON.stringify(s))).toEqual({ ...s.public, secret: "[redacted secret]" });
    expect(String(s)).toBe("RoundScript(fv 1, chain index 5) [redacted secret]");
  });

  it("encodes deterministically: same content, same bytes and digest; any change, another digest", () => {
    const a = build(floorOutput());
    const b = build(floorOutput());
    expect(a.secretCanonicalBytes()).toEqual(b.secretCanonicalBytes());
    expect(a.secretDigest()).toBe(b.secretDigest());
    expect(a.secretDigest()).toMatch(/^[0-9a-f]{64}$/);
    const changed = floorOutput();
    changed.samples.boost[3] = 0.25;
    expect(build(changed).secretDigest()).not.toBe(a.secretDigest());
  });

  it("parses its own canonical bytes back; a digest check refuses any change", () => {
    const s = build(floorOutput());
    const again = parseRoundScript(hash, s.secretCanonicalBytes(), s.secretDigest());
    expect(again.secretDigest()).toBe(s.secretDigest());
    expect(diffRoundScripts(s, again)).toEqual([]);
    const text = new TextDecoder()
      .decode(s.secretCanonicalBytes())
      .replace('"size":1,', '"size":1.1,');
    const tampered = parseRoundScript(hash, new TextEncoder().encode(text));
    expect(diffRoundScripts(s, tampered)).toEqual(["secret.creatures[0].size"]);
    let error: unknown = null;
    try {
      parseRoundScript(hash, new TextEncoder().encode(text), s.secretDigest());
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({
      code: "script-digest-mismatch",
      message: "script-digest-mismatch",
    });
  });

  it("diffRoundScripts names array length changes and nested fields, never values", () => {
    const a = build(floorOutput());
    const o = floorOutput();
    o.creatures.push({ ...o.creatures[0]!, id: 2, kind: "kelp", consumedTick: null });
    o.final.nextCreatureId = 3;
    o.drawCounts.world = 14;
    const b = build(o);
    expect(diffRoundScripts(a, b)).toEqual([
      "secret.creatures.length",
      "secret.creatures[1]",
      "secret.drawCounts.world",
      "secret.final.nextCreatureId",
    ]);
  });
});

describe("analytic tick bound and fixed constants", () => {
  it("the longest dive is the boost-free floor dive: 1,290 ticks (engine tick arithmetic)", () => {
    // Transcribed from src/engine (simulation.ts, domain/multiplier.ts, domain/descent.ts,
    // game-engine.ts): simTime = ticks · (1/60); diveElapsed = simTime − diveStartedAt; with no
    // boost the speed is minimal at every tick, so this dive is the longest possible one.
    const TICK = 1 / 60;
    const diveStartedAt = 300 * TICK;
    let worldY = 0;
    let ticks = 300;
    let dive = 0;
    for (;;) {
      ticks++;
      dive++;
      const m = 1 + (Math.exp(0.085 * (ticks * TICK - diveStartedAt)) - 1);
      worldY += (120 + Math.min(520, Math.pow(m, 0.95) * 28)) * TICK;
      if (worldY >= 4200) break;
    }
    expect(dive).toBe(ANALYTIC_MAX_DIVE_TICKS);
    expect(ANALYTIC_MAX_TERMINAL_TICK).toBe(300 + 1290 + 84);
    expect(ANALYTIC_MAX_TERMINAL_TICK).toBeLessThan(EXPECTED_RUNNER_PROFILE.maxTotalTicks);
  });

  it("the audit's fixed script-failure codes are exactly the RoundScriptError codes", () => {
    expect([...SCRIPT_FAILURE_CODES].sort()).toEqual([...ROUND_SCRIPT_ERROR_CODES].sort());
  });

  it("errors carry a fixed reason code or none, and never a cause", () => {
    expect(new RoundScriptError("runner-failed", "tick-mismatch").message).toBe(
      "runner-failed: tick-mismatch",
    );
    // Anything that is not a short kebab-case code is dropped.
    for (const reason of ["crash at 1.45", "A".repeat(10), { x: 1 }, 7, "x".repeat(70)]) {
      const e = new RoundScriptError("runner-failed", reason);
      expect(e.reason).toBeNull();
      expect(e.message).toBe("runner-failed");
      expect(e.cause).toBeUndefined();
    }
  });

  it("the digest candidates are labelled as not owner-approved", () => {
    expect(KNOWN_ANSWER_DIGEST_STATUS).toBe("candidate-not-owner-approved");
    // Only the P8-4a A1 / B1 rounds carry a RoundScript digest candidate; the P8-4a-1
    // known-answer rounds are checked by their independent record digest instead.
    expect(
      ROUND_SCRIPT_KNOWN_ANSWERS.map((k) => [
        `${k.chain}:${k.salt}${k.index}`,
        k.digestCandidate !== null,
      ]),
    ).toEqual([
      ["dev-v1:A1", true],
      ["dev-v1:B1", true],
      ["dev-v1:A7", false],
      ["kat-v1:A145", false],
      ["kat-v1:B212", false],
      ["kat-v1:A9", false],
      ["kat-v1:C200", false],
      ["kat-v1:B72", false],
      ["kat-v1:A1", false],
    ]);
    for (const k of ROUND_SCRIPT_KNOWN_ANSWERS) expect(k.recordDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(ROUND_SCRIPT_KNOWN_ANSWERS[0]!.firstCreatures[0])).toBe(true);
  });
});
