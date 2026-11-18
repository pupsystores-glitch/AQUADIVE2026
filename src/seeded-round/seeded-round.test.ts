// SeededRound and SeededRoundAuthority (P8-3b; owner decisions D-B1, D-B8, D-B9).
// Binding: each purpose stream opened once, wired to the right decision; one-time decisions in the
// engine's order; ownership and disposal of the derivation; no Math.random anywhere.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameEngine, LocalRoundAuthority, type Rng } from "@/engine";
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  FairnessError,
  RoundDerivation,
  SecretBytes,
  hexToBytes,
  type RoundDerivationInput,
} from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { SeededRound, SeededRoundAuthority, SeededRoundError } from "./index";

const input = (index = 3, saltHex: string = V.saltAHex): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: index,
  salt: hexToBytes(saltHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[index])),
});
/** The same purpose stream, opened from an independent derivation of the same inputs. */
const reference = (purpose: "crash" | "jackpot" | "chests" | "world", index = 3): Rng =>
  RoundDerivation.create(p, input(index)).openStream(purpose);
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof SeededRoundError || e instanceof FairnessError) return e.code;
    throw e;
  }
  return "no error";
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("binding: one derivation, four purpose streams, the engine's contracts", () => {
  it("exposes GameEngineDeps: a SeededRoundAuthority and the world stream", () => {
    const round = SeededRound.create(p, input());
    expect(round.deps.authority).toBeInstanceOf(SeededRoundAuthority);
    expect(round.authority).toBe(round.deps.authority);
    expect(round.worldRng).toBe(round.deps.worldRng);
    expect(Object.isFrozen(round.deps)).toBe(true);
    expect(round.fv).toBe(1);
    expect(round.chainIndex).toBe(3);
    expect(round.status).toBe("live");
    expect(() => new GameEngine(round.deps)).not.toThrow();
  });

  it("worldRng is the world stream (P8-3a vectors)", () => {
    const round = SeededRound.create(p, input());
    for (const d of V.drawsIndex3SaltA.worldFirst8) expect(round.worldRng.next()).toBe(d.value);
  });

  it("each decision is the engine's own function over its own purpose stream", () => {
    for (let index = 1; index <= V.chainLength; index++) {
      const round = SeededRound.create(p, input(index));
      expect(round.authority.sampleCrashPoint()).toBe(
        new LocalRoundAuthority(reference("crash", index)).sampleCrashPoint(),
      );
      expect(round.authority.sampleJackpot()).toBe(
        new LocalRoundAuthority(reference("jackpot", index)).sampleJackpot(),
      );
      expect(round.authority.rollBonusChests()).toEqual(
        new LocalRoundAuthority(reference("chests", index)).rollBonusChests(),
      );
    }
  });

  it("purpose streams are independent of each other's draw counts", () => {
    // Drawing world values first, or many of them, never changes the outcome decisions.
    const a = SeededRound.create(p, input());
    const b = SeededRound.create(p, input());
    for (let i = 0; i < 1000; i++) b.worldRng.next();
    expect(b.authority.sampleCrashPoint()).toBe(a.authority.sampleCrashPoint());
    expect(b.authority.sampleJackpot()).toBe(a.authority.sampleJackpot());
    expect(b.authority.rollBonusChests()).toEqual(a.authority.rollBonusChests());
  });

  it("never calls Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    const round = SeededRound.create(p, input());
    round.authority.sampleCrashPoint();
    round.authority.sampleJackpot();
    round.authority.rollBonusChests();
    for (let i = 0; i < 100; i++) round.worldRng.next();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("one-time decisions in the engine's order (D-B9)", () => {
  it("accepts crash → jackpot → chests once each", () => {
    const round = SeededRound.create(p, input());
    expect(() => round.authority.sampleCrashPoint()).not.toThrow();
    expect(() => round.authority.sampleJackpot()).not.toThrow();
    expect(() => round.authority.rollBonusChests()).not.toThrow();
    expect(round.status).toBe("live");
  });

  it.each([
    ["sampleCrashPoint", 1],
    ["sampleJackpot", 2],
    ["rollBonusChests", 3],
  ] as const)("a second %s throws outcome-already-consumed and fails the round", (method, n) => {
    const round = SeededRound.create(p, input());
    const calls = [
      () => round.authority.sampleCrashPoint(),
      () => round.authority.sampleJackpot(),
      () => round.authority.rollBonusChests(),
    ];
    for (let i = 0; i < n; i++) calls[i]();
    expect(code(() => round.authority[method]())).toBe("outcome-already-consumed");
    expect(round.status).toBe("failed");
    expect(code(() => round.worldRng.next())).toBe("round-failed");
    expect(code(() => round.authority[method]())).toBe("round-failed");
  });

  it("refuses a decision ahead of the engine's order and fails the round", () => {
    const a = SeededRound.create(p, input());
    expect(code(() => a.authority.sampleJackpot())).toBe("outcome-out-of-order");
    expect(a.status).toBe("failed");
    expect(code(() => a.authority.sampleCrashPoint())).toBe("round-failed");

    const b = SeededRound.create(p, input());
    b.authority.sampleCrashPoint();
    expect(code(() => b.authority.rollBonusChests())).toBe("outcome-out-of-order");
    expect(b.status).toBe("failed");
  });

  it("a crash round needs only the crash decision (the engine never asks for more)", () => {
    const round = SeededRound.create(p, input());
    round.authority.sampleCrashPoint();
    const counts = round.secretDrawCounts();
    expect(counts.jackpot).toBe(0);
    expect(counts.chests).toBe(0);
  });
});

describe("ownership and disposal of the derivation (D-B2, D-B8)", () => {
  it("refuses a disposed derivation", () => {
    const d = RoundDerivation.create(p, input());
    d.dispose();
    expect(code(() => SeededRound.bind(d))).toBe("derivation-unusable");
  });

  it("refuses a derivation with an open purpose stream, and disposes it", () => {
    const d = RoundDerivation.create(p, input());
    d.openStream("chests");
    expect(code(() => SeededRound.bind(d))).toBe("derivation-unusable");
    expect(d.disposed).toBe(true);
  });

  it("one derivation backs at most one round", () => {
    const d = RoundDerivation.create(p, input());
    const first = SeededRound.bind(d);
    expect(code(() => SeededRound.bind(d))).toBe("derivation-unusable");
    // The refused second bind disposed the shared derivation, so the first round cannot continue.
    expect(code(() => first.authority.sampleCrashPoint())).toBe("round-failed");
  });

  it("refuses something that is not a RoundDerivation", () => {
    expect(code(() => SeededRound.bind({} as RoundDerivation))).toBe("derivation-unusable");
  });

  it("invalid derivation inputs fail with the fairness module's typed errors", () => {
    expect(code(() => SeededRound.create(p, { ...input(), fv: 2 }))).toBe("unsupported-version");
    expect(code(() => SeededRound.create(p, { ...input(), salt: new Uint8Array(3) }))).toBe(
      "invalid-salt",
    );
  });

  it("dispose() is idempotent, disposes the derivation and refuses every later draw", () => {
    const d = RoundDerivation.create(p, input());
    const round = SeededRound.bind(d);
    round.worldRng.next();
    round.dispose();
    round.dispose();
    expect(round.status).toBe("disposed");
    expect(d.disposed).toBe(true);
    expect(code(() => round.worldRng.next())).toBe("round-disposed");
    expect(code(() => round.authority.sampleCrashPoint())).toBe("round-disposed");
  });

  it("a failed round can still be disposed", () => {
    const round = SeededRound.create(p, input());
    round.authority.sampleCrashPoint();
    expect(code(() => round.authority.sampleCrashPoint())).toBe("outcome-already-consumed");
    round.dispose();
    expect(round.status).toBe("disposed");
    expect(code(() => round.worldRng.next())).toBe("round-disposed");
  });
});

describe("secret draw counts (D-B4)", () => {
  it("count every purpose's draws, frozen, and stay readable after dispose", () => {
    const round = SeededRound.create(p, input());
    expect(round.secretDrawCounts()).toEqual({ crash: 0, jackpot: 0, chests: 0, world: 0 });
    round.authority.sampleCrashPoint();
    round.authority.sampleJackpot();
    round.authority.rollBonusChests();
    for (let i = 0; i < 9; i++) round.worldRng.next();
    const counts = round.secretDrawCounts();
    expect(Object.isFrozen(counts)).toBe(true);
    expect(counts).toEqual({ crash: 2, jackpot: 2, chests: 6, world: 9 });
    round.dispose();
    expect(round.secretDrawCounts()).toEqual(counts);
  });
});
