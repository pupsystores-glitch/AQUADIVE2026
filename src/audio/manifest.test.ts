// Sound manifest tests (Sprint 5 / Phase 7, step A2; docs/08 §7.2, §8).
// The real manifest is valid, complete and asset-free; the validator catches
// every malformed entry; the types keep one-shots and loops apart.
import { describe, expect, it } from "vitest";
import { LOOP_VOICES, type VoiceBus } from "./audio-manager";
import {
  CUE_IDS,
  CUE_PRIORITY,
  LOOP_CUES,
  ONE_SHOT_CUES,
  SOUND_MANIFEST,
  cueDefinitionProblems,
  validateSoundManifest,
  type CueId,
  type LoopCueId,
  type OneShotCueDefinition,
  type SoundManifest,
} from "./manifest";

const manifest: SoundManifest<CueId> = SOUND_MANIFEST;

describe("the AQUADIVE manifest", () => {
  it("is valid", () => {
    expect(validateSoundManifest(SOUND_MANIFEST)).toEqual([]);
  });

  it("defines exactly the listed cues, each once", () => {
    expect(new Set(CUE_IDS).size).toBe(CUE_IDS.length);
    expect(Object.keys(SOUND_MANIFEST).sort()).toEqual([...CUE_IDS].sort());
    expect(CUE_IDS).toEqual([...ONE_SHOT_CUES, ...LOOP_CUES]);
  });

  it("keeps one-shots and loops apart", () => {
    for (const id of ONE_SHOT_CUES) expect(manifest[id].kind).toBe("oneShot");
    for (const id of LOOP_CUES) expect(manifest[id].kind).toBe("loop");
  });

  it("assigns no asset to any cue: none is licensed, so none is playable (docs/08 §8)", () => {
    for (const id of CUE_IDS) expect(manifest[id].asset).toBeNull();
    expect(JSON.stringify(SOUND_MANIFEST)).not.toMatch(/https?:|\.m4a|\.mp3|\.ogg|\.wav|\/assets/);
  });

  it("marks only the two ambience beds essential", () => {
    const essential = LOOP_CUES.filter((id) => SOUND_MANIFEST[id].essential);
    expect(essential).toEqual(["ambience-surface", "ambience-underwater"]);
    expect(SOUND_MANIFEST["chain-rattle"].essential).toBe(false);
  });

  it("fits the loop pool: every loop, and so every essential loop, can play at once (§7.2)", () => {
    expect(LOOP_CUES.length).toBeLessThanOrEqual(LOOP_VOICES);
  });

  it("uses only the voice buses, and no music bus while Q8 is open", () => {
    const buses = new Set<VoiceBus>(CUE_IDS.map((id) => manifest[id].category));
    expect([...buses].sort()).toEqual(["ambience", "sfx"]);
  });

  it("uses the named priority tiers and unit gains", () => {
    const tiers = Object.values(CUE_PRIORITY) as number[];
    for (const id of CUE_IDS) {
      expect(tiers).toContain(manifest[id].priority);
      expect(manifest[id].gain).toBe(1);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(SOUND_MANIFEST)).toBe(true);
  });
});

describe("validateSoundManifest", () => {
  const oneShot = { kind: "oneShot", category: "sfx", gain: 1, priority: 1, asset: null };
  const loop = { ...oneShot, kind: "loop", essential: false };

  it("accepts valid entries, with and without assets and loop points", () => {
    expect(
      validateSoundManifest({
        a: oneShot,
        b: { ...oneShot, asset: { url: "test://b" } },
        c: loop,
        d: { ...loop, loopStart: 0, loopEnd: 1.5 },
      }),
    ).toEqual([]);
  });

  it.each([
    ["not an object", null, "not an object"],
    ["an unknown kind", { ...oneShot, kind: "stinger" }, "unknown kind"],
    ["an unknown category", { ...oneShot, category: "master" }, "unknown category"],
    ["a gain above 1", { ...oneShot, gain: 1.5 }, "gain"],
    ["a negative gain", { ...oneShot, gain: -0.1 }, "gain"],
    ["a non-finite priority", { ...oneShot, priority: Number.NaN }, "priority"],
    ["an empty asset url", { ...oneShot, asset: { url: "" } }, "asset"],
    ["an asset without url", { ...oneShot, asset: {} }, "asset"],
    ["a loop without essential", { ...loop, essential: undefined }, "essential"],
    ["a loop with one loop point", { ...loop, loopStart: 0.1 }, "loop points"],
    ["reversed loop points", { ...loop, loopStart: 2, loopEnd: 1 }, "loop points"],
    ["a negative loop start", { ...loop, loopStart: -1, loopEnd: 1 }, "loop points"],
    ["a one-shot marked essential", { ...oneShot, essential: true }, "loops only"],
    ["a one-shot with loop points", { ...oneShot, loopStart: 0, loopEnd: 1 }, "loops only"],
  ])("rejects %s", (_, entry, problem) => {
    const problems = cueDefinitionProblems("cue", entry);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toContain(problem);
  });
});

describe("types (checked by tsc)", () => {
  it("rejects loop fields on a one-shot and one-shot ids as loops", () => {
    const clink = SOUND_MANIFEST["bet-clink-1"];
    // @ts-expect-error a one-shot definition cannot be essential
    const essentialOneShot: OneShotCueDefinition = { ...clink, essential: true };
    // @ts-expect-error a one-shot id is not a loop id
    const notALoop: LoopCueId = "bet-clink-1";
    expect([essentialOneShot, notALoop]).toHaveLength(2);
  });
});
