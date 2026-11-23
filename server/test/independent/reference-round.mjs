// TEST ONLY (P8-4a-1, owner decisions I5, I6). INDEPENDENT reference of one fv = 1 offline round.
// Never bundled, never imported by server/src or src/; it imports nothing from src/ or server/src/.
//
// Provenance. Draw blocks: ./spec-impl.mjs (the P8-3a spec-only fv = 1 message layout and top-52
// extraction) on node:crypto. Outcome formulas, the world draw order and the diving tick pipeline
// are TRANSCRIBED by reading the engine source (read-only) at f62ccee / 011facc, where it is
// unchanged since 7124ec9:
//
//   src/engine/domain/outcomes.ts    sampleCrashPoint, sampleJackpot, rollBonusChests
//   src/engine/domain/creatures.ts   rollCreature (draws: kind, x, worldY, size, phase, dir)
//   src/engine/domain/multiplier.ts  multiplierAt
//   src/engine/domain/descent.ts     descentSpeed
//   src/engine/simulation.ts         tick(): multiplier → boost decay + bonus → crash check →
//                                    descent → spawner → goldfish collision → sea floor
//   src/engine/state-machine.ts      betting countdown, entry(diving) draws the crash point,
//                                    entry(impact) the jackpot, entry(bonus) the chests
//   src/engine/game-engine.ts        simTime = ticks × TICK_SECONDS, ticks counted from 1
//   src/engine/domain/tuning.ts, src/shared/world.ts, src/engine/clock.ts   constants
//
// What this is evidence of, and what it is not. It is a second, separately written
// implementation of the same rules: if the engine bundle's mathematics, draw order or tick
// pipeline change (for example the 200× crash clamp edited to 30×), its records stop matching.
// It does not prove the rules themselves correct, and it is a REGRESSION reference, not an
// integrity check of the bundle (that is server/integrity/engine-manifest.json).
//
// Each purpose (crash, jackpot, chests, world) reads its own stream from draw 0 (docs/09 §16.4).
// All arithmetic follows the engine's operation order so that every double is identical.

import { createHash, createHmac } from "node:crypto";
import { message, top52 } from "./spec-impl.mjs";

// ---- constants (transcribed) -------------------------------------------------------------------
const TICK = 1 / 60; //                                     clock.ts TICK_SECONDS
const BETTING_TICKS = Math.round((5 * 1000) / 1000 / TICK); // BETTING_WINDOW_SECONDS = 5
const IMPACT_TO_BONUS_TICKS = Math.round(1400 / 1000 / TICK); // SHIP_IMPACT_TO_CHESTS_MS
const CHAIN_MAX_DEPTH = 4200;
const ANCHOR_WORLD_OFFSET_PX = 220;
const CREATURE_SPAWN_EVERY = 52;
const SPAWN_AHEAD_PX = 900;
const SPAWN_JITTER_PX = 18;
const INITIAL_SPAWN_DEPTH_PX = 120;
const DIVE_SPAWN_DEPTH_PX = 60;
const COLLISION_DY_PX = 28;
const COLLISION_DX_FRAC = 0.18;
const BOOST_DECAY_PER_SECOND = 0.6;
const BOOST_MULTIPLIER_BONUS = 0.4;
const BOOST_GAIN_PER_GOLDFISH = 0.8;
const BOOST_SPEED_FACTOR = 0.8;
const TWO_52 = 4503599627370496;

export const REFERENCE_CONSTANTS = Object.freeze({ TICK, BETTING_TICKS, IMPACT_TO_BONUS_TICKS });

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
export const sha256 = (b) => new Uint8Array(createHash("sha256").update(b).digest());
const hmac = (k, b) => new Uint8Array(createHmac("sha256", k).update(b).digest());
export const hex = (b) => Buffer.from(b).toString("hex");

/** A public hash chain from a phrase: links[length] = SHA-256(phrase), links[i] = H(links[i+1]). */
export function phraseChain(phrase, length) {
  const links = new Array(length + 1);
  links[length] = sha256(enc(phrase));
  for (let i = length - 1; i >= 0; i--) links[i] = sha256(links[i + 1]);
  return links;
}
export const phraseSalt = (phrase) => sha256(enc(phrase));

/** A counted draw stream of one purpose (four 52-bit draws per HMAC block). */
function stream(links, index, salt, purpose) {
  let k = 0;
  let block = null;
  const next = () => {
    if (k % 4 === 0) block = hmac(links[index], message(1, links[0], index, salt, purpose, k / 4));
    return top52(block, k++ % 4) / TWO_52;
  };
  return { next, count: () => k };
}

// ---- outcome formulas (transcribed) ------------------------------------------------------------
function crashPoint(next) {
  const r = next();
  if (r < 0.03) return { value: 1.0, branch: "exact-1x" };
  const u = next();
  const m = 0.99 / (1 - u);
  const branch = m > 200 ? "clamp-200" : m < 1.01 ? "floor-1.01" : "curve";
  return { value: Math.max(1.01, Math.min(m, 200)), branch };
}
function jackpot(next) {
  const r = next();
  let m;
  let tier;
  if (r < 0.5) ((m = 50 + next() * 50), (tier = 1));
  else if (r < 0.85) ((m = 100 + next() * 100), (tier = 2));
  else ((m = 200 + next() * 300), (tier = 3));
  return { value: +m.toFixed(2), tier };
}
function chests(next) {
  const tiers = [];
  const roll = () => {
    const r = next();
    if (r < 0.6) return (tiers.push("small"), 1 + next() * 2);
    if (r < 0.92) return (tiers.push("medium"), 3 + next() * 7);
    return (tiers.push("rare"), 10 + next() * 40);
  };
  const values = [+roll().toFixed(2), +roll().toFixed(2), +roll().toFixed(2)];
  return { values, tiers };
}
function creatureKind(depthRatio, r) {
  if (depthRatio < 0.25) {
    return r < 0.35
      ? "fishSchool"
      : r < 0.55
        ? "seahorse"
        : r < 0.72
          ? "jellyfish"
          : r < 0.88
            ? "kelp"
            : r < 0.96
              ? "fishSchool"
              : "goldfish";
  }
  if (depthRatio < 0.6) {
    return r < 0.25
      ? "fishSchool"
      : r < 0.45
        ? "octopus"
        : r < 0.6
          ? "jellyfish"
          : r < 0.75
            ? "manta"
            : r < 0.88
              ? "sealion"
              : r < 0.96
                ? "kelp"
                : "goldfish";
  }
  return r < 0.2
    ? "octopus"
    : r < 0.4
      ? "sealion"
      : r < 0.62
        ? "whale"
        : r < 0.78
          ? "anglerfish"
          : r < 0.9
            ? "manta"
            : r < 0.96
              ? "jellyfish"
              : "goldfish";
}
function rollCreature(worldY, id, next) {
  const depthRatio = Math.min(1, worldY / CHAIN_MAX_DEPTH);
  const kind = creatureKind(depthRatio, next());
  return {
    id,
    kind,
    x: 0.1 + next() * 0.8,
    worldY: worldY + 200 + next() * 80,
    size: 0.8 + next() * 0.6,
    phase: next() * Math.PI * 2,
    dir: next() < 0.5 ? 1 : -1,
  };
}
const multiplierAt = (t) => 1 + (Math.exp(0.085 * t) - 1);
const descentSpeed = (m) => 120 + Math.min(520, Math.pow(m, 0.95) * 28);

/**
 * The crash point of a round from its crash stream alone (what the crash-only categories need):
 * `{ record: { crashAt }, branches: { crash } }`, the same shape as `referenceRound`'s parts.
 */
export function referenceCrash(links, index, salt) {
  const c = crashPoint(stream(links, index, salt, "crash").next);
  return { record: { crashAt: c.value }, branches: { crash: c.branch } };
}

/**
 * The complete record of one round from a fresh engine, in the runner's output shape: from the
 * first tick to the first entry into `crashed` or `bonus`. `links` is a public chain (index 0 is
 * the chain id), `salt` the round salt bytes. `branches` names the formula branches taken.
 */
export function referenceRound(links, index, salt) {
  const crashS = stream(links, index, salt, "crash");
  const jackpotS = stream(links, index, salt, "jackpot");
  const chestsS = stream(links, index, salt, "chests");
  const worldS = stream(links, index, salt, "world");

  // Betting: the countdown reaches 0 on tick BETTING_TICKS, whose step enters diving.
  const diveStartTick = BETTING_TICKS;
  const crash = crashPoint(crashS.next); // entry(diving)
  const diveStart = diveStartTick * TICK;

  // entry(diving) world reset; the creature id counter starts at 1 in a fresh engine.
  let worldY = 0;
  let boost = 0;
  let multiplier = 1;
  let nextSpawnAt = DIVE_SPAWN_DEPTH_PX;
  let nextCreatureId = 1;
  void INITIAL_SPAWN_DEPTH_PX; // the construction value, replaced by the dive reset
  const creatures = [];
  const samples = { multiplier: [1], boost: [0], worldY: [0] };

  let outcome = null;
  let exitDiveTick = null;
  for (let t = diveStartTick + 1; t <= diveStartTick + 5000 && outcome === null; t++) {
    let m = multiplierAt(t * TICK - diveStart);
    if (boost > 0) {
      boost = Math.max(0, boost - TICK * BOOST_DECAY_PER_SECOND);
      m += boost * BOOST_MULTIPLIER_BONUS;
    }
    if (m >= crash.value) {
      outcome = "crash";
      exitDiveTick = t;
      break;
    }
    multiplier = m;
    const speed = descentSpeed(m) * (1 + boost * BOOST_SPEED_FACTOR);
    worldY += speed * TICK;
    while (worldY + SPAWN_AHEAD_PX > nextSpawnAt) {
      const c = rollCreature(nextSpawnAt, nextCreatureId++, worldS.next);
      creatures.push({ ...c, spawnTick: t, consumedTick: null });
      nextSpawnAt += CREATURE_SPAWN_EVERY - worldS.next() * SPAWN_JITTER_PX;
    }
    const anchorWorldY = worldY + ANCHOR_WORLD_OFFSET_PX;
    for (const c of creatures) {
      if (c.consumedTick !== null) continue;
      const dy = Math.abs(c.worldY - anchorWorldY);
      if (
        dy < COLLISION_DY_PX &&
        Math.abs(c.x - 0.5) < COLLISION_DX_FRAC &&
        c.kind === "goldfish"
      ) {
        c.consumedTick = t;
        boost = Math.min(1, boost + BOOST_GAIN_PER_GOLDFISH);
      }
    }
    if (worldY >= CHAIN_MAX_DEPTH) {
      outcome = "floor";
      exitDiveTick = t;
      break;
    }
    samples.multiplier.push(multiplier);
    samples.boost.push(boost);
    samples.worldY.push(worldY);
  }
  if (outcome === null) throw new Error("reference: no terminal milestone");

  let jp = null;
  let ch = null;
  let finalMultiplier;
  let impactTick = null;
  let terminalTick;
  if (outcome === "crash") {
    finalMultiplier = crash.value; // entry(crashed) locks the crash point
    terminalTick = exitDiveTick;
  } else {
    impactTick = exitDiveTick;
    jp = jackpot(jackpotS.next); // entry(impact)
    finalMultiplier = jp.value;
    terminalTick = impactTick + IMPACT_TO_BONUS_TICKS;
    ch = chests(chestsS.next); // entry(bonus)
  }
  return {
    record: {
      outcome,
      crashAt: crash.value,
      diveStartTick,
      exitDiveTick,
      impactTick,
      terminalTick,
      jackpot: jp === null ? null : jp.value,
      chests: ch === null ? null : ch.values,
      samples,
      creatures,
      final: { worldY, boost, multiplier: finalMultiplier, nextSpawnAt, nextCreatureId },
      drawCounts: {
        crash: crashS.count(),
        jackpot: jackpotS.count(),
        chests: chestsS.count(),
        world: worldS.count(),
      },
    },
    branches: {
      crash: crash.branch,
      jackpot: jp === null ? null : jp.tier,
      chests: ch === null ? null : ch.tiers,
      goldfishConsumed: creatures.filter((c) => c.consumedTick !== null).length,
    },
  };
}
