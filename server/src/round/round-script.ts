// RoundScript: the immutable, validated record of one precomputed round (P8-4a; owner decisions
// K5, K6, K11, K12). PLAY MONEY ONLY; OFFLINE DEVELOPMENT ONLY; never routed, sent or broadcast.
//
// A RoundScript has two parts:
//
// - `public`: metadata that is public-safe before the reveal (script version, runner profile,
//   fv, chain id, chain index, bound salt, status). "Public-safe" is not "published": nothing in
//   P8-4a publishes it (fv = 1 stays INTERNAL AND EXPERIMENTAL).
// - the SECRET content: every outcome-derived fact — outcome kind, crash point, jackpot, chests,
//   every tick index, the per-dive-tick multiplier / boost / worldY samples, every creature's
//   lifecycle, the final world and the draw counts. It is readable only through the explicitly
//   named `secret…()` accessors. JSON.stringify, String(), template literals and Node's
//   util.inspect show the public part and a redaction marker only. This is defense in depth
//   against accidental disclosure, not protection against memory inspection.
//
// Construction validates every field against the engine's fixed rules (tick accounting, the
// analytic tick bound, value ranges, draw-count rules, creature lifecycle) and the canonical
// encoding (canonical.ts). A script holds no seed, key, stream, derivation, RoundKeys or engine.
// The digest (SHA-256 over the canonical bytes, domain-separated) is INTERNAL (K11).
//
// Parsing untrusted bytes (P8-4b-1): `RoundScriptVerification` verifies canonical bytes in
// bounded slices (`step(budget)`), so a caller on an event loop can yield between them;
// `parseRoundScript` is the same verification run to completion. Its atomic head refuses an
// input above MAX_ROUND_SCRIPT_BYTES before copying anything, takes one private copy, prescans
// it (rejection only) and JSON-parses it; every later slice reads only that copy. Nothing is
// returned before every check and the digest succeeded; a failed or cancelled verification
// zeroes its copy.

import { REDACTED, type FairnessHashProvider } from "../fairness";
import {
  CANONICAL_MAX_DEPTH,
  CanonicalCheck,
  canonicalBytes,
  canonicalDigest,
  canonicalJson,
  decodeUtf8,
  prescanCanonical,
  snapshotBytes,
  type CanonicalShapeLimits,
} from "./canonical";
import {
  CREATURE_KINDS,
  EXPECTED_RUNNER_PROFILE,
  type RunnerCreature,
  type RunnerOutput,
} from "./engine-types";
import { RoundScriptError } from "./errors";

/** Version of the RoundScript format (canonical document layout). */
export const ROUND_SCRIPT_VERSION = 1;
/** Status of every P8-4a script: internal, experimental, offline. */
export const ROUND_SCRIPT_STATUS = "experimental-internal-offline";

const P = EXPECTED_RUNNER_PROFILE;
/**
 * The longest possible dive, in ticks: the floor reached with no boost at all (boost only adds
 * speed). Derived analytically from the engine's multiplier and descent formulas; a test
 * recomputes it with the engine's own tick arithmetic.
 */
export const ANALYTIC_MAX_DIVE_TICKS = 1290;
/** The latest possible terminal tick: betting, the longest dive, then impact → bonus. */
export const ANALYTIC_MAX_TERMINAL_TICK =
  P.bettingTicks + ANALYTIC_MAX_DIVE_TICKS + P.impactToBonusTicks;
/** The sea floor (src/shared/world.ts CHAIN_MAX_DEPTH). */
const FLOOR_Y = 4200;
/** The engine's crash-point range (domain/outcomes.ts). */
const CRASH_MIN = 1;
const CRASH_MAX = 200;
/** fv = 1 world draw limit (src/fairness PURPOSE_DRAW_LIMITS_V1.world). */
const WORLD_DRAW_LIMIT = 2048;

/**
 * The longest canonical RoundScript the validators below can accept is shorter than this (a
 * schema-derived upper bound of 148,738 bytes, recomputed by round-verification.test.ts from these
 * rules: every field at its longest text, every array at its longest length). Larger inputs are
 * refused before any copy.
 */
export const MAX_ROUND_SCRIPT_BYTES = 196_608;
/** Operations per verification slice unless the caller chooses another budget. */
export const DEFAULT_VERIFICATION_BUDGET = 512;
/**
 * Rejection-only prescan bounds (canonical.ts `prescanCanonical`). Each is at least the most the
 * validators accept (tests prove it): nesting — the canonical depth rule alone allows 9; array
 * elements — the longest array is a sample series of ≤ ANALYTIC_MAX_DIVE_TICKS; object members —
 * the widest object has 12 keys; containers — a document has at most 303.
 */
export const ROUND_SCRIPT_SHAPE_LIMITS: CanonicalShapeLimits = Object.freeze({
  maxNesting: CANONICAL_MAX_DEPTH + 1,
  maxArrayElements: ANALYTIC_MAX_DIVE_TICKS,
  maxObjectMembers: 16,
  maxContainers: 512,
});

export interface RoundScriptPublic {
  readonly scriptVersion: number;
  readonly status: typeof ROUND_SCRIPT_STATUS;
  readonly profile: string;
  readonly profileVersion: number;
  readonly fv: number;
  /** x_0 as lower-case hex. */
  readonly chainId: string;
  readonly chainIndex: number;
  /** The salt bound to the index, lower-case hex. */
  readonly salt: string;
}

/** Everything outcome-derived. SECRET until the round's reveal. */
export type RoundScriptSecret = Omit<
  RunnerOutput,
  "profile" | "profileVersion" | "fv" | "chainIndex"
>;

const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const CONSTRUCT = Symbol("RoundScript.construct");

const invalid = (): never => {
  throw new RoundScriptError("script-invalid");
};
const check = (ok: boolean): void => {
  if (!ok) invalid();
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const keysAre = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
  isObject(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const int = (v: unknown, min: number, max: number): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const num = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && !Object.is(v, -0) && v >= min && v <= max;
const twoDecimals = (v: number) => +v.toFixed(2) === v;
const HEX64 = /^[0-9a-f]{64}$/;
const SALT_HEX = /^(?:[0-9a-f]{2}){16,64}$/;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/** A fresh, detached plain copy: refuses getters, prototypes, −0, NaN, … (canonical subset). */
const plainCopy = (value: unknown): unknown => JSON.parse(canonicalJson(value));

function validatePublic(p: unknown): asserts p is RoundScriptPublic {
  check(
    keysAre(p, [
      "scriptVersion",
      "status",
      "profile",
      "profileVersion",
      "fv",
      "chainId",
      "chainIndex",
      "salt",
    ]),
  );
  const v = p as Record<string, unknown>;
  check(v.scriptVersion === ROUND_SCRIPT_VERSION && v.status === ROUND_SCRIPT_STATUS);
  check(v.profile === P.id && v.profileVersion === P.version && v.fv === P.fv);
  check(typeof v.chainId === "string" && HEX64.test(v.chainId));
  check(int(v.chainIndex, 1, Number.MAX_SAFE_INTEGER));
  check(typeof v.salt === "string" && SALT_HEX.test(v.salt));
}

function validateCreature(c: unknown, id: number, exitDiveTick: number): void {
  check(
    keysAre(c, ["id", "kind", "x", "worldY", "size", "phase", "dir", "spawnTick", "consumedTick"]),
  );
  const v = c as unknown as RunnerCreature;
  check(v.id === id && CREATURE_KINDS.includes(v.kind));
  // rollCreature: x = 0.1 + r·0.8, size = 0.8 + r·0.6, phase = r·2π, dir = ±1.
  check(num(v.x, 0.1, 0.9) && num(v.size, 0.8, 1.4) && num(v.phase, 0, 2 * Math.PI));
  check(num(v.worldY, 0, FLOOR_Y + 2000) && (v.dir === 1 || v.dir === -1));
  check(int(v.spawnTick, P.bettingTicks + 1, exitDiveTick));
  if (v.consumedTick !== null) {
    check(v.kind === "goldfish" && int(v.consumedTick, v.spawnTick, exitDiveTick));
  }
}

/** What the per-tick and per-creature checks need from the validated head of the secret part. */
interface SecretContext {
  readonly v: RoundScriptSecret;
  readonly floor: boolean;
  readonly diveTicks: number;
}

/**
 * Validates the secret part against the engine's fixed rules. The rules are split into a head,
 * one step per dive tick, one step per creature and a tail, so that RoundScriptVerification can
 * run them in slices; run in this order they are exactly the P8-4a checks.
 */
function validateSecret(s: unknown): asserts s is RoundScriptSecret {
  const ctx = validateSecretHead(s);
  for (let i = 0; i < ctx.diveTicks; i++) validateSampleAt(ctx, i);
  for (let i = 0; i < ctx.v.creatures.length; i++) validateCreatureAt(ctx, i);
  validateSecretTail(ctx);
}

function validateSecretHead(s: unknown): SecretContext {
  check(
    keysAre(s, [
      "outcome",
      "crashAt",
      "diveStartTick",
      "exitDiveTick",
      "impactTick",
      "terminalTick",
      "jackpot",
      "chests",
      "samples",
      "creatures",
      "final",
      "drawCounts",
    ]),
  );
  const v = s as unknown as RoundScriptSecret;
  const floor = v.outcome === "floor";
  check(v.outcome === "crash" || floor);

  // ---- Tick accounting: betting, the dive, then the terminal milestone -------------------
  check(v.diveStartTick === P.bettingTicks);
  check(int(v.exitDiveTick, P.bettingTicks + 1, P.bettingTicks + ANALYTIC_MAX_DIVE_TICKS));
  if (floor) {
    check(v.impactTick === v.exitDiveTick);
    check(v.terminalTick === v.exitDiveTick + P.impactToBonusTicks);
  } else {
    check(v.impactTick === null && v.terminalTick === v.exitDiveTick);
  }
  check(int(v.terminalTick, 1, Math.min(ANALYTIC_MAX_TERMINAL_TICK, P.maxTotalTicks)));

  // ---- Outcomes ---------------------------------------------------------------------------
  check(num(v.crashAt, CRASH_MIN, CRASH_MAX) && (v.crashAt === 1 || v.crashAt >= 1.01));
  if (floor) {
    check(num(v.jackpot, 50, 500) && twoDecimals(v.jackpot as number));
    check(Array.isArray(v.chests) && v.chests.length === 3);
    for (const c of v.chests ?? []) check(num(c, 1, 50) && twoDecimals(c));
  } else {
    check(v.jackpot === null && v.chests === null);
  }

  // ---- Per-dive-tick samples: index i is tick diveStartTick + i ---------------------------
  const diveTicks = v.exitDiveTick - v.diveStartTick;
  check(keysAre(v.samples, ["multiplier", "boost", "worldY"]));
  const { multiplier, boost, worldY } = v.samples;
  for (const series of [multiplier, boost, worldY]) {
    check(Array.isArray(series) && series.length === diveTicks);
  }
  check(multiplier[0] === 1 && boost[0] === 0 && worldY[0] === 0);
  // (The per-tick checks: validateSampleAt.) The creature list must be an array before its
  // per-creature checks run; every check here is a pure predicate, so the order is immaterial.
  check(Array.isArray(v.creatures));
  return { v, floor, diveTicks };
}

/** Dive tick `i` (index i is tick diveStartTick + i). */
function validateSampleAt({ v }: SecretContext, i: number): void {
  const { multiplier, boost, worldY } = v.samples;
  check(num(multiplier[i], 1, CRASH_MAX) && num(boost[i], 0, 1) && num(worldY[i], 0, FLOOR_Y));
  // After the dive's start (multiplier 1, which a 1.00× crash point equals) the multiplier
  // of every diving tick is below the crash point, and the anchor is above the floor.
  check((i === 0 || multiplier[i]! < v.crashAt) && worldY[i]! < FLOOR_Y);
  if (i > 0) check(worldY[i]! > worldY[i - 1]!);
}

/** Creature `i`: ids 1 … n in spawn order, one lifecycle each (creature i − 1 checked before). */
function validateCreatureAt({ v }: SecretContext, i: number): void {
  validateCreature(v.creatures[i], i + 1, v.exitDiveTick);
  if (i > 0) check(v.creatures[i]!.spawnTick >= v.creatures[i - 1]!.spawnTick);
}

function validateSecretTail({ v, floor, diveTicks }: SecretContext): void {
  const { worldY } = v.samples;

  // ---- The final world (the engine snapshot at the terminal tick) -------------------------
  check(keysAre(v.final, ["worldY", "boost", "multiplier", "nextSpawnAt", "nextCreatureId"]));
  const f = v.final;
  check(num(f.worldY, 0, FLOOR_Y * 2) && num(f.boost, 0, 1) && num(f.nextSpawnAt, 0, 1e7));
  check(f.nextCreatureId === v.creatures.length + 1);
  check(f.multiplier === (floor ? v.jackpot : v.crashAt));
  if (floor) check(f.worldY >= FLOOR_Y && f.worldY > worldY[diveTicks - 1]!);
  else check(f.worldY === worldY[diveTicks - 1]);

  // ---- Draw counts: the fixed rules of the unchanged outcome functions --------------------
  check(keysAre(v.drawCounts, ["crash", "jackpot", "chests", "world"]));
  const d = v.drawCounts;
  check(d.crash === 2 || (d.crash === 1 && v.crashAt === 1));
  check(floor ? d.jackpot === 2 && d.chests === 6 : d.jackpot === 0 && d.chests === 0);
  check(int(d.world, 0, WORLD_DRAW_LIMIT) && d.world === 7 * v.creatures.length);
}

/**
 * Validates an untrusted runner result (from the bundle) and returns a fresh, detached, deeply
 * frozen copy. Throws `script-invalid` (no detail) on any deviation.
 */
export function validateRunnerOutput(raw: unknown, expectedChainIndex: number): RunnerOutput {
  const copy = plainCopy(raw);
  check(
    keysAre(copy, [
      "profile",
      "profileVersion",
      "fv",
      "chainIndex",
      "outcome",
      "crashAt",
      "diveStartTick",
      "exitDiveTick",
      "impactTick",
      "terminalTick",
      "jackpot",
      "chests",
      "samples",
      "creatures",
      "final",
      "drawCounts",
    ]),
  );
  const v = copy as unknown as RunnerOutput;
  check(v.profile === P.id && v.profileVersion === P.version && v.fv === P.fv);
  check(v.chainIndex === expectedChainIndex);
  const { profile: _p, profileVersion: _v, fv: _f, chainIndex: _c, ...secret } = v;
  validateSecret(secret);
  deepFreeze(v);
  validatedOutputs.add(v);
  return v;
}

/**
 * Results that `validateRunnerOutput` produced: detached, deeply frozen and fully validated, so
 * `buildRoundScript` need not copy and validate them a second time. Anything else is validated.
 */
const validatedOutputs = new WeakSet<object>();

export class RoundScript {
  readonly public: RoundScriptPublic;
  #secret: RoundScriptSecret;
  #bytes: Uint8Array;
  #digest: string;

  /** Built by `buildRoundScript` / `parseRoundScript` only. */
  constructor(
    token: symbol,
    pub: RoundScriptPublic,
    secret: RoundScriptSecret,
    bytes: Uint8Array,
    digest: string,
  ) {
    if (token !== CONSTRUCT) throw new RoundScriptError("script-invalid");
    this.public = pub;
    this.#secret = secret;
    this.#bytes = bytes;
    this.#digest = digest;
    Object.freeze(this);
  }

  /** SECRET before the reveal: the deeply frozen outcome content. */
  secretContent(): RoundScriptSecret {
    return this.#secret;
  }

  /** SECRET before the reveal (K11, internal): SHA-256 over the canonical bytes, hex. */
  secretDigest(): string {
    return this.#digest;
  }

  /** SECRET before the reveal: a fresh copy of the canonical encoding. */
  secretCanonicalBytes(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }

  /** Public metadata only. */
  toJSON(): RoundScriptPublic & { secret: string } {
    return { ...this.public, secret: REDACTED };
  }

  toString(): string {
    return `RoundScript(fv ${this.public.fv}, chain index ${this.public.chainIndex}) ${REDACTED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }
}

/** The canonical document: `{ public, secret }`. */
const documentOf = (pub: RoundScriptPublic, secret: RoundScriptSecret) => ({ public: pub, secret });

/**
 * Builds the RoundScript of a runner result. `pub` is the round's public metadata (from its
 * RoundKeys). An `output` that did not come from `validateRunnerOutput` is validated (and
 * copied) here first.
 */
export function buildRoundScript(
  provider: FairnessHashProvider,
  pub: Omit<RoundScriptPublic, "scriptVersion" | "status" | "profile" | "profileVersion" | "fv">,
  input: RunnerOutput,
): RoundScript {
  const output = validatedOutputs.has(input) ? input : validateRunnerOutput(input, pub.chainIndex);
  const publicPart = deepFreeze(
    plainCopy({
      scriptVersion: ROUND_SCRIPT_VERSION,
      status: ROUND_SCRIPT_STATUS,
      profile: output.profile,
      profileVersion: output.profileVersion,
      fv: output.fv,
      chainId: pub.chainId,
      chainIndex: pub.chainIndex,
      salt: pub.salt,
    }),
  );
  validatePublic(publicPart);
  check(output.chainIndex === publicPart.chainIndex);
  const { profile: _p, profileVersion: _v, fv: _f, chainIndex: _c, ...rest } = output;
  // Every member is a frozen, validated part of `output`; only this wrapper is new.
  const secret = Object.freeze(rest) as RoundScriptSecret;
  const bytes = canonicalBytes(documentOf(publicPart, secret));
  return new RoundScript(CONSTRUCT, publicPart, secret, bytes, canonicalDigest(provider, bytes));
}

/**
 * Parses canonical RoundScript bytes (for example a stored copy) and validates them fully.
 * With `expectedDigest`, refuses any alteration (`script-digest-mismatch`). Errors carry no
 * detail: before the reveal the content is secret. Synchronous: RoundScriptVerification run to
 * completion in one call.
 */
export function parseRoundScript(
  provider: FairnessHashProvider,
  bytes: Uint8Array,
  expectedDigest?: string,
): RoundScript {
  return RoundScriptVerification.begin(provider, bytes, expectedDigest).step(
    Number.POSITIVE_INFINITY,
  )!;
}

export type RoundScriptVerificationState = "running" | "verified" | "failed" | "cancelled";

// Phases of a verification, in order.
const PHASE_CANONICAL = 0; // the canonical check, one value or container end per operation
const PHASE_DOCUMENT = 1; // document keys, public part, head of the secret part (one operation)
const PHASE_SAMPLES = 2; // one dive tick per operation
const PHASE_CREATURES = 3; // one creature per operation
const PHASE_TAIL = 4; // final world and draw counts (one operation)
const PHASE_FREEZE = 5; // one object or array frozen per operation
const PHASE_DIGEST = 6; // the digest over the private copy and the result (one operation)

/**
 * The verification of untrusted canonical RoundScript bytes, in slices (P8-4b-1).
 *
 * `begin(provider, bytes, expectedDigest?)` is the atomic head: it refuses an input longer than
 * MAX_ROUND_SCRIPT_BYTES before copying or allocating anything, takes ONE private copy, runs the
 * rejection-only prescan on it, decodes it (strict UTF-8) and JSON-parses it. `step(budget)` then
 * performs at most `budget` operations of the remaining checks and returns null until the last
 * one; the step that completes them computes the digest over the private copy, compares it with
 * `expectedDigest` and returns the deeply frozen RoundScript — nothing is exposed before that.
 * Every check is the one `parseRoundScript` has always run, with the same errors (`script-invalid`,
 * then `script-digest-mismatch`), whatever the budget.
 *
 * A failed step (it throws) or `cancel()` ends the verification and zeroes the private copy; a
 * completed one hands the copy to the RoundScript. The decoded text and parsed values are
 * JavaScript strings and numbers that cannot be zeroed; they become unreachable. Everything a
 * verification holds is SECRET before the reveal: it shows its state only.
 */
export class RoundScriptVerification {
  readonly #provider: FairnessHashProvider;
  readonly #expectedDigest: string | undefined;
  #copy: Uint8Array | null;
  #check: CanonicalCheck | null;
  #state: RoundScriptVerificationState = "running";
  #phase = PHASE_CANONICAL;
  #pub: RoundScriptPublic | null = null;
  #secret: RoundScriptSecret | null = null;
  #context: SecretContext | null = null;
  #index = 0;
  #freeze: object[] = [];

  /** Use `RoundScriptVerification.begin`. */
  private constructor(
    token: symbol,
    provider: FairnessHashProvider,
    copy: Uint8Array,
    check: CanonicalCheck,
    expectedDigest: string | undefined,
  ) {
    if (token !== CONSTRUCT) throw new RoundScriptError("script-invalid");
    this.#provider = provider;
    this.#copy = copy;
    this.#check = check;
    this.#expectedDigest = expectedDigest;
    Object.freeze(this);
  }

  /** The atomic head (see the class comment). Throws `script-invalid`. */
  static begin(
    provider: FairnessHashProvider,
    bytes: Uint8Array,
    expectedDigest?: string,
  ): RoundScriptVerification {
    const copy = snapshotBytes(bytes, MAX_ROUND_SCRIPT_BYTES);
    try {
      if (!prescanCanonical(copy, ROUND_SCRIPT_SHAPE_LIMITS)) invalid();
      const check = CanonicalCheck.parse(decodeUtf8(copy));
      return new RoundScriptVerification(CONSTRUCT, provider, copy, check, expectedDigest);
    } catch (error) {
      copy.fill(0);
      throw error;
    }
  }

  get state(): RoundScriptVerificationState {
    return this.#state;
  }

  /**
   * Performs at most `budget` (≥ 1; `Infinity` runs to the end) operations. Returns the verified
   * RoundScript from the step that completes the verification, null before. Throws the
   * verification's error (and ends it), or `invalid-request` once it has ended.
   */
  step(budget: number = DEFAULT_VERIFICATION_BUDGET): RoundScript | null {
    if (this.#state !== "running") {
      throw new RoundScriptError("invalid-request", "verification-ended");
    }
    if (!(typeof budget === "number" && budget >= 1)) {
      throw new RoundScriptError("invalid-request", "invalid-budget");
    }
    try {
      return this.#run(budget);
    } catch (error) {
      this.#end("failed");
      throw error;
    }
  }

  /** Ends a running verification without a result and zeroes its private copy. */
  cancel(): void {
    if (this.#state === "running") this.#end("cancelled");
  }

  toJSON(): { verification: string; state: RoundScriptVerificationState } {
    return { verification: "RoundScriptVerification", state: this.#state };
  }

  toString(): string {
    return `RoundScriptVerification(${this.#state}) ${REDACTED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }

  #run(budget: number): RoundScript | null {
    let used = 0;
    for (;;) {
      if (used >= budget) return null;
      switch (this.#phase) {
        case PHASE_CANONICAL: {
          const canonical = this.#check!;
          const before = canonical.operations;
          const done = canonical.step(budget - used);
          used += canonical.operations - before;
          if (!done) return null;
          this.#phase = PHASE_DOCUMENT;
          break;
        }
        case PHASE_DOCUMENT: {
          used += 1;
          const doc = this.#check!.value;
          this.#check = null;
          check(keysAre(doc, ["public", "secret"]));
          const { public: pub, secret } = doc as { public: unknown; secret: unknown };
          this.#pub = pub as RoundScriptPublic;
          this.#secret = secret as RoundScriptSecret;
          validatePublic(this.#pub);
          this.#context = validateSecretHead(this.#secret);
          this.#phase = PHASE_SAMPLES;
          this.#index = 0;
          break;
        }
        case PHASE_SAMPLES: {
          const ctx = this.#context!;
          while (this.#index < ctx.diveTicks) {
            if (used >= budget) return null;
            used += 1;
            validateSampleAt(ctx, this.#index);
            this.#index += 1;
          }
          this.#phase = PHASE_CREATURES;
          this.#index = 0;
          break;
        }
        case PHASE_CREATURES: {
          const ctx = this.#context!;
          while (this.#index < ctx.v.creatures.length) {
            if (used >= budget) return null;
            used += 1;
            validateCreatureAt(ctx, this.#index);
            this.#index += 1;
          }
          this.#phase = PHASE_TAIL;
          break;
        }
        case PHASE_TAIL: {
          used += 1;
          validateSecretTail(this.#context!);
          this.#freeze = [this.#pub!, this.#secret!];
          this.#phase = PHASE_FREEZE;
          break;
        }
        case PHASE_FREEZE: {
          // deepFreeze, iteratively: JSON.parse output is a tree of fresh plain objects and
          // arrays that only this verification references.
          const stack = this.#freeze;
          while (stack.length > 0) {
            if (used >= budget) return null;
            used += 1;
            const node = stack.pop()!;
            const children = Array.isArray(node) ? node : Object.values(node);
            for (const child of children) {
              if (child !== null && typeof child === "object") stack.push(child as object);
            }
            Object.freeze(node);
          }
          this.#phase = PHASE_DIGEST;
          break;
        }
        default: {
          // PHASE_DIGEST: the digest of exactly the bytes that were validated (the private copy).
          used += 1;
          const copy = this.#copy!;
          const digest = canonicalDigest(this.#provider, copy);
          if (this.#expectedDigest !== undefined && digest !== this.#expectedDigest) {
            throw new RoundScriptError("script-digest-mismatch");
          }
          const script = new RoundScript(CONSTRUCT, this.#pub!, this.#secret!, copy, digest);
          this.#copy = null; // owned by the script now
          this.#end("verified");
          return script;
        }
      }
    }
  }

  #end(state: RoundScriptVerificationState): void {
    this.#state = state;
    this.#copy?.fill(0);
    this.#copy = null;
    this.#check = null;
    this.#pub = null;
    this.#secret = null;
    this.#context = null;
    this.#freeze = [];
  }
}

/**
 * The paths of every field that differs between two scripts (for example
 * `secret.samples.multiplier[412]`, `public.salt`), in document order. Names only, never values.
 * For OFFLINE VERIFICATION AFTER THE REVEAL: a path list of a secret script is itself outcome
 * information (it shows array lengths), so never call this on an unrevealed round.
 */
export function diffRoundScripts(expected: RoundScript, candidate: RoundScript): string[] {
  const paths: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length);
      if (a.length !== b.length) paths.push(`${path}.length`);
      for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (isObject(a) && isObject(b)) {
      for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        walk(a[k], b[k], `${path}.${k}`);
      }
      return;
    }
    if (!Object.is(a, b)) paths.push(path);
  };
  walk(expected.public, candidate.public, "public");
  walk(expected.secretContent(), candidate.secretContent(), "secret");
  return paths;
}
