// RNG exhaustion (P8-3b; owner decision D-B8): exceeding a purpose's hard draw limit throws a
// deterministic typed error, fails the round, never wraps, reuses a value or falls back to
// Math.random, and the reference runner returns no partial record.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FAIRNESS_DEV_VECTORS_V1 as V,
  FairnessError,
  PURPOSE_DRAW_LIMITS_V1,
  SecretBytes,
  hexToBytes,
  type RoundDerivationInput,
} from "@/fairness";
import { nodeHashProvider as p } from "@/fairness/test/node-provider";
import { SeededRound, SeededRoundError } from "./index";
import { runReferenceRound } from "./test/reference-runner";

const input = (index = 3): RoundDerivationInput => ({
  fv: 1,
  chainId: hexToBytes(V.linksHex[0]),
  chainIndex: index,
  salt: hexToBytes(V.saltAHex),
  roundSeed: SecretBytes.fromBytes(hexToBytes(V.linksHex[index])),
});
const failure = (fn: () => unknown): SeededRoundError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof SeededRoundError) return e;
    throw e;
  }
  throw new Error("expected a SeededRoundError");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("world stream at its hard limit", () => {
  const LIMIT = PURPOSE_DRAW_LIMITS_V1.world;

  it("draws exactly the limit, then throws draw-limit-exceeded and fails the round", () => {
    const random = vi.spyOn(Math, "random");
    const round = SeededRound.create(p, input());
    const seen = new Set<number>();
    for (let i = 0; i < LIMIT; i++) seen.add(round.worldRng.next());
    expect(seen.size).toBe(LIMIT); // no value repeated within the round
    const e = failure(() => round.worldRng.next());
    expect(e.code).toBe("draw-limit-exceeded");
    expect(e.message).toBe(
      `draw-limit-exceeded: purpose world exceeded its draw limit of ${LIMIT}`,
    );
    expect(e.cause).toBeInstanceOf(FairnessError);
    expect(round.status).toBe("failed");
    // Never wraps or recovers: every later draw of any purpose is refused.
    for (let i = 0; i < 3; i++)
      expect(failure(() => round.worldRng.next()).code).toBe("round-failed");
    expect(failure(() => round.authority.sampleCrashPoint()).code).toBe("round-failed");
    expect(round.secretDrawCounts().world).toBe(LIMIT);
    expect(random).not.toHaveBeenCalled();
  });

  it("the failure is deterministic: same inputs, same error at the same draw", () => {
    // Bounded on purpose: a defect that never throws (a wrap or a fallback value) must fail this
    // test after LIMIT + 16 draws, not spin forever (Vitest cannot interrupt a synchronous loop).
    const MAX_ATTEMPTS = LIMIT + 16;
    const at = (): [number, string, string] => {
      const round = SeededRound.create(p, input());
      let n = 0;
      try {
        while (n < MAX_ATTEMPTS) {
          round.worldRng.next();
          n++;
        }
      } catch (e) {
        return [n, (e as SeededRoundError).code, (e as Error).message];
      }
      return [n, "no error", "the stream never refused a draw"];
    };
    const first = at();
    expect(first).toEqual([
      LIMIT,
      "draw-limit-exceeded",
      `draw-limit-exceeded: purpose world exceeded its draw limit of ${LIMIT}`,
    ]);
    expect(at()).toEqual(first);
  });
});

describe("outcome purposes: the limits equal the engine's exact usage", () => {
  it("crash 2 (or 1), jackpot 2 and chests 6 draws exhaust nothing; reuse is refused first", () => {
    const round = SeededRound.create(p, input());
    round.authority.sampleCrashPoint();
    round.authority.sampleJackpot();
    round.authority.rollBonusChests();
    expect(round.secretDrawCounts()).toMatchObject({
      crash: PURPOSE_DRAW_LIMITS_V1.crash,
      jackpot: PURPOSE_DRAW_LIMITS_V1.jackpot,
      chests: PURPOSE_DRAW_LIMITS_V1.chests,
    });
    // A second decision would need draws beyond the limit; the one-time rule refuses it first.
    expect(failure(() => round.authority.rollBonusChests()).code).toBe("outcome-already-consumed");
  });
});

describe("the reference runner on exhaustion", () => {
  it("throws the typed error, returns no partial record, discards the engine and disposes the round", () => {
    const random = vi.spyOn(Math, "random");
    const round = SeededRound.create(p, input(7)); // a floor round: ≈ 820 world draws when fresh
    for (let i = 0; i < PURPOSE_DRAW_LIMITS_V1.world - 100; i++) round.worldRng.next();
    let result: unknown = "none";
    const e = failure(() => {
      result = runReferenceRound(p, round);
    });
    expect(e.code).toBe("draw-limit-exceeded");
    expect(result).toBe("none");
    expect(round.status).toBe("disposed");
    expect(failure(() => round.worldRng.next()).code).toBe("round-disposed");
    expect(random).not.toHaveBeenCalled();
  });

  it("is deterministic: the same exhausted round fails identically every time", () => {
    const attempt = () => {
      const round = SeededRound.create(p, input(7));
      for (let i = 0; i < PURPOSE_DRAW_LIMITS_V1.world - 100; i++) round.worldRng.next();
      const e = failure(() => runReferenceRound(p, round));
      return [e.code, e.message];
    };
    expect(attempt()).toEqual(attempt());
  });

  it("a round is single-use: the runner refuses a round that was already used", () => {
    const round = SeededRound.create(p, input(3));
    round.authority.sampleCrashPoint();
    expect(failure(() => runReferenceRound(p, round)).code).toBe("outcome-already-consumed");
    expect(round.status).toBe("disposed");
  });
});
