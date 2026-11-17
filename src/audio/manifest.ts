// Sound manifest — the AQUADIVE cue list (Sprint 5 / Phase 7, step A2;
// docs/08_AUDIO_FX_ARCHITECTURE.md §3.2, §6, §7.2, §8).
//
// Typed data only: which cues exist, whether each is a one-shot or a loop,
// the bus it plays on, its level, its priority within its voice pool and,
// for loops, whether it is an essential bed. The generic sound bank
// (`sound-bank.ts`) turns an entry into a `ResolvedCue` once its asset is
// loaded; the AudioManager plays it.
//
// **Assets (A6, A-OWN).** Every cue has a file. Since A-OWN (2026-11-17) the cues
// the owner supplied a recording for play that recording, byte for byte, from
// `src/assets/audio/owner/` (MP3 or AAC-LC `.m4a`, stereo, 44.1 or 48 kHz,
// as supplied). `crash-boom`, `tension-creak-1`, `tension-creak-2` and
// `chain-rattle` have no owner recording and keep the A6 original (AAC-LC
// `.m4a`, mono, 48 kHz, `src/assets/audio/`). The A6 files the owner
// recordings replace stay on disk, unreferenced. Provenance, production
// method and rights status are in `src/assets/audio/CREDITS.md`.
// The files are imported as URLs, so the build fingerprints them like every
// other asset. The contract still allows a `null` asset: such a cue is
// "unavailable", is never fetched, and stays silent.
//
// Not here, because they depend on open owner decisions: a countdown tick
// (Q9) and music beds (Q8). They are added only once those are answered
// (docs/08 §12 note: an open decision shrinks a step, it is never decided
// silently). Which event plays which cue is the A4 director's job (§5).
//
// **Levels (A6, A-OWN).** The A6 one-shot files peak near −2.5 dBFS, so a cue's
// `gain` alone sets its place in the mix. The owner recordings are played
// as supplied (not normalized); each replaced one-shot's gain is set so it
// plays at the integrated loudness its A6 cue had (A6 gain ×
// 10^((A6 LUFS − owner LUFS) / 20), capped at 1; measurements in
// CREDITS.md §9). Two exceptions (A-OWN.1, owner report 2026-11-17): most of
// the energy of the owner `floor-thud` and `water-splash` lies below 120 Hz,
// which phones and laptops barely reproduce, so full-band LUFS matching made
// their audible part about 9 to 13 dB too quiet. `water-splash` (0.32) now
// matches the A6 splash above 150 Hz; `floor-thud` (0.55) puts its hit 6 to
// 8 dB above the `jackpot-stinger` that sounds with it (CREDITS.md §9.6).
// The beds keep gain 1. Every gain is **provisional until the
// owner's listening pass**. The bus mix is `AUDIO_MIX` in
// `src/ui/audio-host.ts`.
// The priority tiers below only order cues inside their own pool (§7.2).
//
// **Loop points (A6, A-OWN).** The A6 `chain-rattle` file holds one seamless
// period with 0.15 s of the same periodic signal before and after it;
// `loopStart` / `loopEnd` select the period, so the loop stays seamless
// whatever delay or padding an AAC decoder adds (docs/08 §3.4). The owner's
// ambience beds are looped as recorded: the underwater bed runs at full
// level edge to edge, so it loops whole (0 to its 60 s length); the surface
// bed fades in over about 20 ms and out over its last 60 ms, so its loop
// skips both fades (0.02 s to 86.79 s). The files are not edited.
//
// Imports: type-only from the AudioManager (docs/08 §6 import rule), and the
// asset URLs.

import ambienceSurfaceUrl from "@/assets/audio/owner/ambience-surface.m4a";
import ambienceUnderwaterUrl from "@/assets/audio/owner/ambience-underwater.m4a";
import betClink1Url from "@/assets/audio/owner/bet-clink-1.mp3";
import betClink2Url from "@/assets/audio/owner/bet-clink-2.mp3";
import cashoutCoinsUrl from "@/assets/audio/owner/cashout-coins.mp3";
import chainRattleUrl from "@/assets/audio/chain-rattle.m4a";
import chainSnapUrl from "@/assets/audio/owner/chain-snap.m4a";
import chainUnspoolUrl from "@/assets/audio/owner/chain-unspool.m4a";
import chestCoinBurstUrl from "@/assets/audio/owner/chest-coin-burst.m4a";
import chestLidCreakUrl from "@/assets/audio/owner/chest-lid-creak.m4a";
import crashBoomUrl from "@/assets/audio/crash-boom.m4a";
import floorThudUrl from "@/assets/audio/owner/floor-thud.mp3";
// A-OWN.2: the owner's recording minus its first 19 MP3 frames (456 ms of digital silence).
import goldfishChimeUrl from "@/assets/audio/owner/goldfish-chime-trimmed.mp3";
import jackpotStingerUrl from "@/assets/audio/owner/jackpot-stinger.m4a";
import tensionCreak1Url from "@/assets/audio/tension-creak-1.m4a";
import tensionCreak2Url from "@/assets/audio/tension-creak-2.m4a";
import treasureShimmerUrl from "@/assets/audio/owner/treasure-shimmer.m4a";
import waterSplashUrl from "@/assets/audio/owner/water-splash.mp3";

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

/** Where a cue's compressed audio comes from: the URL of its file (A6; `src/assets/audio/CREDITS.md`). */
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
  /** `null`: no asset assigned, so the cue is unavailable and silent. */
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

const oneShot = (
  category: VoiceBus,
  priority: number,
  url: string,
  gain: number,
): OneShotCueDefinition => ({
  kind: "oneShot",
  category,
  gain,
  priority,
  asset: { url },
});

const loop = (
  category: VoiceBus,
  priority: number,
  essential: boolean,
  url: string,
  gain: number,
  loopStart: number,
  loopEnd: number,
): LoopCueDefinition => ({
  kind: "loop",
  category,
  gain,
  priority,
  essential,
  loopStart,
  loopEnd,
  asset: { url },
});

/** The A6 rattle file starts its seamless period here, in seconds (see the header). */
const LOOP_LEAD_S = 0.15;

/** The owner's surface bed, looped between its edge fades (A-OWN; seconds, see the header). */
export const SURFACE_LOOP_S = Object.freeze({ start: 0.02, end: 86.79 });

/** The owner's underwater bed, looped whole (A-OWN; seconds, see the header). */
export const UNDERWATER_LOOP_S = Object.freeze({ start: 0, end: 60 });

const { detail, action, outcome } = CUE_PRIORITY;

/**
 * The AQUADIVE manifest. The mapped type makes every one-shot id a one-shot
 * definition and every loop id a loop definition, at compile time.
 */
export const SOUND_MANIFEST: Readonly<
  { [Id in OneShotCueId]: OneShotCueDefinition } & { [Id in LoopCueId]: LoopCueDefinition }
> = Object.freeze({
  // Betting (§5 `betPlaced`): a muted clink, one per bet slot.
  "bet-clink-1": oneShot("sfx", action, betClink1Url, 0.2),
  "bet-clink-2": oneShot("sfx", action, betClink2Url, 0.58),
  // Dive start (§5 `diveStarted`).
  "chain-unspool": oneShot("sfx", action, chainUnspoolUrl, 0.84),
  // A-OWN.1: speaker-band level, not full-band LUFS (see the header).
  "water-splash": oneShot("sfx", action, waterSplashUrl, 0.32),
  // During the dive: tension creaks at multiplier thresholds (disabled by
  // default since A-OWN: the director never plays them and the host never loads
  // them), the goldfish pickup.
  "tension-creak-1": oneShot("sfx", detail, tensionCreak1Url, 0.7),
  "tension-creak-2": oneShot("sfx", detail, tensionCreak2Url, 0.7),
  "goldfish-chime": oneShot("sfx", action, goldfishChimeUrl, 0.53),
  // Outcomes (§5 `cashedOut`, `crashed`, `shipImpact`).
  "cashout-coins": oneShot("sfx", outcome, cashoutCoinsUrl, 0.65),
  "chain-snap": oneShot("sfx", outcome, chainSnapUrl, 1),
  "crash-boom": oneShot("sfx", outcome, crashBoomUrl, 1),
  // A-OWN.1: audible over the jackpot stinger at the touchdown (see the header).
  "floor-thud": oneShot("sfx", action, floorThudUrl, 0.55),
  "jackpot-stinger": oneShot("sfx", outcome, jackpotStingerUrl, 0.62),
  // Bonus (§5 `shipImpact`, `chestsRevealed`, `chestPicked`).
  "treasure-shimmer": oneShot("sfx", detail, treasureShimmerUrl, 0.36),
  "chest-lid-creak": oneShot("sfx", action, chestLidCreakUrl, 0.51),
  "chest-coin-burst": oneShot("sfx", outcome, chestCoinBurstUrl, 0.61),
  // Loops: the chain rattle follows the dive (disabled by default since A6.1);
  // the two beds must never drop out.
  "chain-rattle": loop("sfx", action, false, chainRattleUrl, 0.45, LOOP_LEAD_S, LOOP_LEAD_S + 4.8),
  "ambience-surface": loop(
    "ambience",
    outcome,
    true,
    ambienceSurfaceUrl,
    1,
    SURFACE_LOOP_S.start,
    SURFACE_LOOP_S.end,
  ),
  "ambience-underwater": loop(
    "ambience",
    outcome,
    true,
    ambienceUnderwaterUrl,
    1,
    UNDERWATER_LOOP_S.start,
    UNDERWATER_LOOP_S.end,
  ),
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
