// Sound manifest — the AQUADIVE cue list (Sprint 5 / Phase 7, step A2;
// docs/08_AUDIO_FX_ARCHITECTURE.md §3.2, §6, §7.2, §8).
//
// Typed data only: which cues exist, whether each is a one-shot or a loop,
// the bus it plays on, its level, its priority within its voice pool and,
// for loops, whether it is an essential bed. The generic sound bank
// (`sound-bank.ts`) turns an entry into a `ResolvedCue` once its asset is
// loaded; the AudioManager plays it.
//
// **No asset exists and no licence is cleared (docs/08 §1.2, §8).** Every
// entry's `asset` is `null`: no URL, no file name and no audio format is
// recorded here, because Q5 (asset supply and licences) and Q6 (format) are
// open. A cue with a `null` asset is "unavailable": the bank never fetches
// it, and it stays silent. A6 fills `asset` in with owner-supplied, licensed
// files; nothing else changes.
//
// Not here, because they depend on open owner decisions: a countdown tick
// (Q9) and music beds (Q8). They are added only once those are answered
// (docs/08 §12 note: an open decision shrinks a step, it is never decided
// silently). Which event plays which cue is the A4 director's job (§5).
//
// Values are engineering defaults, untuned until the A6 listening pass:
// every cue gain is 1 (the mix lives in the bus gains), and the priority
// tiers below only order cues inside their own pool (§7.2).
//
// Imports: type-only, from the AudioManager (docs/08 §6 import rule).

import type { VoiceBus } from "./audio-manager";

/** Priority tiers (docs/08 §7.2). Higher survives the one-shot cap, and among waiting loops starts first. */
export const CUE_PRIORITY = {
  /** Texture: may be dropped first in a burst. */
  detail: 1,
  /** Direct feedback to a player action or a world event. */
  action: 2,
  /** Round outcomes: crash, jackpot, cashout. */
  outcome: 3,
} as const;

/** The one-shot cues (`AudioManager.play`), from docs/08 §8. */
export const ONE_SHOT_CUES = [
  "bet-clink-1",
  "bet-clink-2",
  "chain-unspool",
  "water-splash",
  "tension-creak-1",
  "tension-creak-2",
  "goldfish-chime",
  "cashout-coins",
  "chain-snap",
  "crash-boom",
  "floor-thud",
  "jackpot-stinger",
  "treasure-shimmer",
  "chest-lid-creak",
  "chest-coin-burst",
] as const;

/** The looping cues (`AudioManager.loop`), from docs/08 §8. */
export const LOOP_CUES = ["chain-rattle", "ambience-surface", "ambience-underwater"] as const;

export type OneShotCueId = (typeof ONE_SHOT_CUES)[number];
export type LoopCueId = (typeof LOOP_CUES)[number];
export type CueId = OneShotCueId | LoopCueId;

/** Every cue, one-shots first. */
export const CUE_IDS: readonly CueId[] = [...ONE_SHOT_CUES, ...LOOP_CUES];

/**
 * Where a cue's compressed audio comes from. A6 only: the URL of an
 * owner-supplied, licensed file (docs/08 §8). No entry has one yet.
 */
export interface CueAsset {
  readonly url: string;
}

interface CueDefinitionBase {
  /** The bus the cue plays on (docs/08 §3.2). */
  readonly category: VoiceBus;
  /** The cue's own level, 0..1; play and loop gains multiply it. */
  readonly gain: number;
  /** Finite; ordering within the cue's own voice pool only (docs/08 §7.2). */
  readonly priority: number;
  /** `null`: no licensed asset assigned, so the cue is unavailable and silent. */
  readonly asset: CueAsset | null;
}

export interface OneShotCueDefinition extends CueDefinitionBase {
  readonly kind: "oneShot";
}

export interface LoopCueDefinition extends CueDefinitionBase {
  readonly kind: "loop";
  /** An ambience or music bed that is never preempted (docs/08 §7.2). */
  readonly essential: boolean;
  /** Loop points in seconds, to neutralize encoder padding (docs/08 §3.4). Both or neither; 0 ≤ start < end. */
  readonly loopStart?: number;
  readonly loopEnd?: number;
}

export type CueDefinition = OneShotCueDefinition | LoopCueDefinition;

/** A manifest: one definition per cue id. Kind-specific fields are checked by `validateSoundManifest`. */
export type SoundManifest<Id extends string> = Readonly<Record<Id, CueDefinition>>;

const oneShot = (category: VoiceBus, priority: number): OneShotCueDefinition => ({
  kind: "oneShot",
  category,
  gain: 1,
  priority,
  asset: null,
});

const loop = (category: VoiceBus, priority: number, essential: boolean): LoopCueDefinition => ({
  kind: "loop",
  category,
  gain: 1,
  priority,
  essential,
  asset: null,
});

/**
 * The AQUADIVE manifest. The mapped type makes every one-shot id a one-shot
 * definition and every loop id a loop definition, at compile time.
 */
export const SOUND_MANIFEST: Readonly<
  { [Id in OneShotCueId]: OneShotCueDefinition } & { [Id in LoopCueId]: LoopCueDefinition }
> = Object.freeze({
  // Betting (§5 `betPlaced`): a muted clink, one per bet slot.
  "bet-clink-1": oneShot("sfx", CUE_PRIORITY.action),
  "bet-clink-2": oneShot("sfx", CUE_PRIORITY.action),
  // Dive start (§5 `diveStarted`).
  "chain-unspool": oneShot("sfx", CUE_PRIORITY.action),
  "water-splash": oneShot("sfx", CUE_PRIORITY.action),
  // During the dive: tension creaks at multiplier thresholds, the goldfish pickup.
  "tension-creak-1": oneShot("sfx", CUE_PRIORITY.detail),
  "tension-creak-2": oneShot("sfx", CUE_PRIORITY.detail),
  "goldfish-chime": oneShot("sfx", CUE_PRIORITY.action),
  // Outcomes (§5 `cashedOut`, `crashed`, `shipImpact`).
  "cashout-coins": oneShot("sfx", CUE_PRIORITY.outcome),
  "chain-snap": oneShot("sfx", CUE_PRIORITY.outcome),
  "crash-boom": oneShot("sfx", CUE_PRIORITY.outcome),
  "floor-thud": oneShot("sfx", CUE_PRIORITY.action),
  "jackpot-stinger": oneShot("sfx", CUE_PRIORITY.outcome),
  // Bonus (§5 `shipImpact`, `chestsRevealed`, `chestPicked`).
  "treasure-shimmer": oneShot("sfx", CUE_PRIORITY.detail),
  "chest-lid-creak": oneShot("sfx", CUE_PRIORITY.action),
  "chest-coin-burst": oneShot("sfx", CUE_PRIORITY.outcome),
  // Loops: the chain rattle follows the dive; the two beds must never drop out.
  "chain-rattle": loop("sfx", CUE_PRIORITY.action, false),
  "ambience-surface": loop("ambience", CUE_PRIORITY.outcome, true),
  "ambience-underwater": loop("ambience", CUE_PRIORITY.outcome, true),
});

const VOICE_BUSES: readonly VoiceBus[] = ["music", "ambience", "sfx"];

/**
 * The problems with one manifest entry, as readable strings; empty when it is
 * valid. The sound bank refuses to load an invalid entry (it stays silent).
 */
export function cueDefinitionProblems(id: string, definition: unknown): string[] {
  const problems: string[] = [];
  if (typeof definition !== "object" || definition === null) {
    return [`${id}: not an object`];
  }
  const entry = definition as Partial<Record<string, unknown>>;
  if (entry.kind !== "oneShot" && entry.kind !== "loop") problems.push(`${id}: unknown kind`);
  if (!VOICE_BUSES.includes(entry.category as VoiceBus)) problems.push(`${id}: unknown category`);
  const gain = entry.gain;
  if (typeof gain !== "number" || !Number.isFinite(gain) || gain < 0 || gain > 1) {
    problems.push(`${id}: gain must be a number in 0..1`);
  }
  if (typeof entry.priority !== "number" || !Number.isFinite(entry.priority)) {
    problems.push(`${id}: priority must be a finite number`);
  }
  const asset = entry.asset;
  if (asset !== null) {
    const url = typeof asset === "object" ? (asset as { url?: unknown }).url : undefined;
    if (typeof url !== "string" || url.length === 0) {
      problems.push(`${id}: asset must be null or { url: non-empty string }`);
    }
  }
  if (entry.kind === "loop") {
    if (typeof entry.essential !== "boolean") problems.push(`${id}: essential must be a boolean`);
    const { loopStart, loopEnd } = entry;
    if (loopStart !== undefined || loopEnd !== undefined) {
      const valid =
        typeof loopStart === "number" &&
        typeof loopEnd === "number" &&
        Number.isFinite(loopStart) &&
        Number.isFinite(loopEnd) &&
        loopStart >= 0 &&
        loopEnd > loopStart;
      if (!valid) problems.push(`${id}: loop points need 0 ≤ loopStart < loopEnd, both finite`);
    }
  } else if (entry.kind === "oneShot") {
    for (const field of ["essential", "loopStart", "loopEnd"]) {
      if (field in entry) problems.push(`${id}: ${field} is for loops only`);
    }
  }
  return problems;
}

/** Every problem in a manifest; empty when it is valid. */
export function validateSoundManifest(manifest: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(manifest).flatMap((id) => cueDefinitionProblems(id, manifest[id]));
}
