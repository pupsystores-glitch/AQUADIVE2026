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

import { REDACTED, type FairnessHashProvider } from "../../../src/fairness";
import { canonicalBytes, canonicalDigest, canonicalJson, decodeCanonical } from "./head-canonical";
import {
  CREATURE_KINDS,
  EXPECTED_RUNNER_PROFILE,
  type RunnerCreature,
  type RunnerOutput,
} from "../../../src/round/engine-types";
import { RoundScriptError } from "../../../src/round/errors";

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

/** Validates the secret part against the engine's fixed rules. */
function validateSecret(s: unknown): asserts s is RoundScriptSecret {
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
  for (let i = 0; i < diveTicks; i++) {
    check(num(multiplier[i], 1, CRASH_MAX) && num(boost[i], 0, 1) && num(worldY[i], 0, FLOOR_Y));
    // After the dive's start (multiplier 1, which a 1.00× crash point equals) the multiplier
    // of every diving tick is below the crash point, and the anchor is above the floor.
    check((i === 0 || multiplier[i]! < v.crashAt) && worldY[i]! < FLOOR_Y);
    if (i > 0) check(worldY[i]! > worldY[i - 1]!);
  }

  // ---- Creatures: ids 1 … n in spawn order, one lifecycle each ----------------------------
  check(Array.isArray(v.creatures));
  v.creatures.forEach((c, i) => validateCreature(c, i + 1, v.exitDiveTick));
  for (let i = 1; i < v.creatures.length; i++) {
    check(v.creatures[i]!.spawnTick >= v.creatures[i - 1]!.spawnTick);
  }

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
 * detail: before the reveal the content is secret.
 */
export function parseRoundScript(
  provider: FairnessHashProvider,
  bytes: Uint8Array,
  expectedDigest?: string,
): RoundScript {
  const doc = decodeCanonical(bytes);
  check(keysAre(doc, ["public", "secret"]));
  const { public: pub, secret } = doc as { public: unknown; secret: unknown };
  validatePublic(pub);
  validateSecret(secret);
  const copy = Uint8Array.from(bytes);
  const digest = canonicalDigest(provider, copy);
  if (expectedDigest !== undefined && digest !== expectedDigest) {
    throw new RoundScriptError("script-digest-mismatch");
  }
  return new RoundScript(CONSTRUCT, deepFreeze(pub), deepFreeze(secret), copy, digest);
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
