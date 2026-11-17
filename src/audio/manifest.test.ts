// Sound manifest tests (Sprint 5 / Phase 7, step A2; docs/08 §7.2, §8).
// The real manifest is valid and complete; the validator catches every
// malformed entry; the types keep one-shots and loops apart. Since A6 every
// cue has an asset: the files in `src/assets/audio/` are checked here too
// (container, codec, duration, loop points, download and memory budgets).
// Since A-OWN, 14 cues play the owner's recordings from
// `src/assets/audio/owner/`; those are pinned byte for byte.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOOP_VOICES, type VoiceBus } from "./audio-manager";
import {
  CUE_IDS,
  CUE_PRIORITY,
  LOOP_CUES,
  ONE_SHOT_CUES,
  SOUND_MANIFEST,
  SURFACE_LOOP_S,
  UNDERWATER_LOOP_S,
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

  it("assigns each cue its own local .m4a or .mp3 asset, named after the cue (A6, A-OWN)", () => {
    const urls = CUE_IDS.map((id) => manifest[id].asset?.url ?? "");
    CUE_IDS.forEach((id, i) => {
      // The bundler may add a path and a content hash; the cue id and the extension stay.
      expect(urls[i]).toMatch(new RegExp(`(^|/)${id}(-[\\w-]+)?\\.(m4a|mp3)$`));
    });
    expect(new Set(urls).size).toBe(CUE_IDS.length);
    expect(JSON.stringify(SOUND_MANIFEST)).not.toMatch(/https?:|\.ogg|\.wav|candidates/);
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

  it("uses the named priority tiers, and audible gains no louder than the file", () => {
    const tiers = Object.values(CUE_PRIORITY) as number[];
    for (const id of CUE_IDS) {
      expect(tiers).toContain(manifest[id].priority);
      expect(manifest[id].gain).toBeGreaterThan(0);
      expect(manifest[id].gain).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the A6 gains of the cues that keep their A6 file (provisional until the listening pass)", () => {
    // The owner recordings' gains are loudness-matched; see "the asset files" below.
    const gain = (id: CueId) => manifest[id].gain;
    expect(gain("crash-boom")).toBe(1);
    expect(gain("tension-creak-1")).toBe(0.7);
    expect(gain("tension-creak-2")).toBe(0.7);
    expect(gain("chain-rattle")).toBe(0.45);
  });

  it("gives every loop its loop points (A6 rattle period; the owner beds between their edges, A-OWN)", () => {
    const points: Record<LoopCueId, readonly [number, number]> = {
      "chain-rattle": [0.15, 0.15 + 4.8],
      "ambience-surface": [0.02, 86.79],
      "ambience-underwater": [0, 60],
    };
    for (const id of LOOP_CUES) {
      const { loopStart, loopEnd } = SOUND_MANIFEST[id];
      expect(loopStart).toBeCloseTo(points[id][0], 9);
      expect(loopEnd).toBeCloseTo(points[id][1], 9);
    }
    expect(SURFACE_LOOP_S).toEqual({ start: 0.02, end: 86.79 });
    expect(UNDERWATER_LOOP_S).toEqual({ start: 0, end: 60 });
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

// ----- the asset files themselves (A6, A-OWN) -----

const AUDIO_DIR = join(process.cwd(), "src", "assets", "audio");

/**
 * The owner-supplied recordings (A-OWN, 2026-11-17), one per replaced cue.
 * `upload` is the file as the owner uploaded it, kept unchanged in
 * `src/audio/candidates/`; `file` is the byte-identical copy the game plays.
 * `seconds` is the decoded length in Chrome 157 and Edge 157; `lufs` the
 * integrated loudness measured there (BS.1770, CREDITS.md §9); `a6` the
 * replaced A6 cue's gain and loudness, from which the provisional gain follows.
 */
const OWNER: Partial<
  Record<
    CueId,
    {
      readonly upload: string;
      readonly file: string;
      readonly sha256: string;
      readonly format: "mp3" | "m4a";
      readonly sampleRate: 44100 | 48000;
      readonly seconds: number;
      readonly lufs: number;
      readonly a6?: { readonly gain: number; readonly lufs: number };
      /**
       * A-OWN.2: `file` is the upload minus its first `bytes` (whole MP3
       * frames of leading silence); the byte-identical copy stays at
       * `original`, unreferenced.
       */
      readonly trim?: {
        readonly original: string;
        readonly sha256: string;
        readonly bytes: number;
      };
    }
  >
> = {
  "bet-clink-1": {
    upload: "bet-clink-1.mp3 (2).mp3",
    file: "bet-clink-1.mp3",
    sha256: "6de2458e9cdb75c50c444ba7949d2d961cc6cfd17c11e993594ede2991b61165",
    format: "mp3",
    sampleRate: 44100,
    seconds: 1.672,
    lufs: -10.39,
    a6: { gain: 0.5, lufs: -18.25 },
  },
  "bet-clink-2": {
    upload: "bet-clink-2.mp3.mp3",
    file: "bet-clink-2.mp3",
    sha256: "5a029f4f97c5c41439ee1aa36594a61947bf95b4294022c1eaccb501dd6f94a4",
    format: "mp3",
    sampleRate: 44100,
    seconds: 3.082,
    lufs: -18.65,
    a6: { gain: 0.5, lufs: -17.31 },
  },
  "chain-unspool": {
    upload: "chain-unspool.mp3.m4a",
    file: "chain-unspool.m4a",
    sha256: "c955377a16d6434e7c8f8598faefdce3edc8eec988e4612ec9829be1c45956a5",
    format: "m4a",
    sampleRate: 44100,
    seconds: 1.813,
    lufs: -20.66,
    a6: { gain: 0.55, lufs: -17.01 },
  },
  "water-splash": {
    upload: "water-splash.mp3.mp3",
    file: "water-splash.mp3",
    sha256: "27ffe29f4257b2d1acd36feb21867c2aeef46bddcdfba4e614a010c633464d19",
    format: "mp3",
    sampleRate: 48000,
    seconds: 6.024,
    lufs: -7.81,
    a6: { gain: 0.9, lufs: -21.85 },
  },
  "goldfish-chime": {
    upload: "goldfish-chime.mp3.mp3",
    file: "goldfish-chime-trimmed.mp3",
    sha256: "5594407eed1b555212e64cff3b6da7fe57c68662f7e1c147534785f1a13de78f",
    format: "mp3",
    sampleRate: 48000,
    seconds: 2.016,
    lufs: -15.3,
    a6: { gain: 0.45, lufs: -13.82 },
    trim: {
      original: "goldfish-chime.mp3",
      sha256: "10896aaeed1dbeb52c6af3ac02301eea9dbc465be99dd69b866a04bf15b9da84",
      bytes: 19 * 576, // 19 frames of 1152 samples at 48 kHz: 456 ms
    },
  },
  "cashout-coins": {
    upload: "cashout-coins.mp3.mp3",
    file: "cashout-coins.mp3",
    sha256: "e87844c5a956ff9c55ef08a66dd36f01bd4867beef1ac5e58d0afe46b9788d02",
    format: "mp3",
    sampleRate: 48000,
    seconds: 2.256,
    lufs: -13.41,
    a6: { gain: 0.7, lufs: -14.06 },
  },
  "chain-snap": {
    upload: "chain-snap.mp3.m4a",
    file: "chain-snap.m4a",
    sha256: "6483e380cf46e83058483803e179151d17effc82ccb2a71281ec7e2cbb0e0fbb",
    format: "m4a",
    sampleRate: 48000,
    seconds: 2.172,
    lufs: -19.14,
    a6: { gain: 0.9, lufs: -17.65 },
  },
  "floor-thud": {
    upload: "floor-thud.mp3.mp3",
    file: "floor-thud.mp3",
    sha256: "0fd657f52db6a41eed9bca208fd54acc8782f716f404fe7e210996d111ab7b27",
    format: "mp3",
    sampleRate: 48000,
    seconds: 2.04,
    lufs: -9.69,
    a6: { gain: 1, lufs: -22.37 },
  },
  "jackpot-stinger": {
    upload: "jackpot-stinger.mp3.m4a",
    file: "jackpot-stinger.m4a",
    sha256: "431e750b3af15d0d990669a2adc8f931654a53786830dea2330c10b2354a98b3",
    format: "m4a",
    sampleRate: 44100,
    seconds: 4.626,
    lufs: -13.99,
    a6: { gain: 0.9, lufs: -17.23 },
  },
  "treasure-shimmer": {
    upload: "treasure-shimmer.mp3.m4a",
    file: "treasure-shimmer.m4a",
    sha256: "4ec352713e0a99419def9299a12418db628f200bc44efcc86a399942545124d8",
    format: "m4a",
    sampleRate: 44100,
    seconds: 7.612,
    lufs: -13.76,
    a6: { gain: 0.4, lufs: -14.59 },
  },
  "chest-lid-creak": {
    upload: "chest-lid-creak.mp3.m4a",
    file: "chest-lid-creak.m4a",
    sha256: "ede687e5787a06a4036e160752bf8b5c1bde4804d93ca250611716ec99216ba3",
    format: "m4a",
    sampleRate: 44100,
    seconds: 1.125,
    lufs: -16.93,
    a6: { gain: 1, lufs: -22.85 },
  },
  "chest-coin-burst": {
    upload: "chest-coin-burst.mp3.m4a",
    file: "chest-coin-burst.m4a",
    sha256: "533ccb4cbfd0827e3872594e96098b6a5d89605dbab67e0c6496912c90dff167",
    format: "m4a",
    sampleRate: 44100,
    seconds: 4.859,
    lufs: -13.29,
    a6: { gain: 0.8, lufs: -15.61 },
  },
  "ambience-surface": {
    upload: "ambience-surface.mp3.m4a",
    file: "ambience-surface.m4a",
    sha256: "25d7a2572a8fcc259044821f08c7a708aba9c0790cc9c23abc09cf4883196ff3",
    format: "m4a",
    sampleRate: 44100,
    seconds: 86.858,
    lufs: -32.55,
  },
  "ambience-underwater": {
    upload: "ambience-underwater.mp3.m4a",
    file: "ambience-underwater.m4a",
    sha256: "4a7acce6e4b06db30185aeb6be7ea5503d84070c48c4ee2299e1ba3347605d57",
    format: "m4a",
    sampleRate: 44100,
    seconds: 60,
    lufs: -23.8,
  },
};

/**
 * A-OWN.1: the two owner one-shots whose gain is set from their level above
 * 150 Hz (what phones and laptops reproduce), not from full-band loudness.
 */
const SPEAKER_BAND_GAINS: Partial<Record<CueId, number>> = {
  "floor-thud": 0.55,
  "water-splash": 0.32,
};

/** The cues that keep their A6 original: no owner recording was supplied. */
const A6_KEPT: readonly CueId[] = [
  "tension-creak-1",
  "tension-creak-2",
  "crash-boom",
  "chain-rattle",
];

/** The cues a default director never plays, so the audio host never loads them (A6.1, A-OWN). */
const NOT_LOADED: readonly CueId[] = ["chain-rattle", "tension-creak-1", "tension-creak-2"];

/** The path, under `src/assets/audio/`, of the file a cue plays. */
const filePath = (id: CueId) => {
  const owner = OWNER[id];
  return owner ? join("owner", owner.file) : `${id}.m4a`;
};

/** The facts of one AAC `.m4a` file, read from its MPEG-4 boxes. */
function readM4a(bytes: Buffer) {
  const box = (name: string) => bytes.indexOf(name, 0, "latin1");
  // mdhd (version 0): version and flags, created, modified, timescale, duration.
  const mdhd = box("mdhd");
  const timescale = mdhd < 0 ? 0 : bytes.readUInt32BE(mdhd + 16);
  const duration = mdhd < 0 ? 0 : bytes.readUInt32BE(mdhd + 20);
  // esds → DecoderSpecificInfo (tag 5): object type (5 bits), sample rate index (4), channels (4).
  const esds = box("esds");
  let objectType = 0;
  let sampleRate = 0;
  let channels = 0;
  for (let i = esds + 8; esds >= 0 && i < esds + 64; i++) {
    if (bytes[i] !== 0x05) continue;
    let j = i + 1;
    while (bytes[j] & 0x80) j++;
    const a = bytes[j + 1];
    const b = bytes[j + 2];
    objectType = a >> 3;
    sampleRate = [96000, 88200, 64000, 48000, 44100, 32000, 24000][((a & 7) << 1) | (b >> 7)] ?? 0;
    channels = (b >> 3) & 15;
    break;
  }
  return {
    container: bytes.toString("latin1", 4, 8) === "ftyp" ? "m4a" : "unknown",
    codec: objectType === 2 ? "AAC-LC" : `object type ${objectType}`,
    channels,
    sampleRate,
    seconds: timescale > 0 ? duration / timescale : 0,
  };
}

/** The facts of one MPEG-1 Layer III file, from its frame headers (no ID3 tag expected). */
function readMp3(bytes: Buffer) {
  const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const RATES = [44100, 48000, 32000];
  let frames = 0;
  let sampleRate = 0;
  let channels = 0;
  let codec = "unknown";
  for (let p = 0; p + 4 <= bytes.length;) {
    const h = bytes.readUInt32BE(p);
    if (h >>> 21 !== 0x7ff) break; // not a frame header: stop
    const version = (h >> 19) & 3;
    const layer = (h >> 17) & 3;
    codec = version === 3 && layer === 1 ? "MPEG-1 Layer III" : "other";
    sampleRate = RATES[(h >> 10) & 3];
    channels = ((h >> 6) & 3) === 3 ? 1 : 2;
    const bitrate = BITRATES[(h >> 12) & 15];
    p += Math.floor((144000 * bitrate) / sampleRate) + ((h >> 9) & 1);
    frames++;
  }
  return {
    container: frames > 0 ? "mp3" : "unknown",
    codec,
    channels,
    sampleRate,
    seconds: sampleRate > 0 ? (frames * 1152) / sampleRate : 0,
  };
}

const read = (id: CueId) => {
  const path = join(AUDIO_DIR, filePath(id));
  const exists = existsSync(path);
  const bytes = exists ? readFileSync(path) : Buffer.alloc(0);
  const facts = OWNER[id]?.format === "mp3" ? readMp3(bytes) : readM4a(bytes);
  return { exists, bytes, size: bytes.length, ...facts };
};

/** The allowed length of each A6 original's file, in seconds (the A6 brief). */
const A6_DURATION_S: Partial<Record<CueId, readonly [number, number]>> = {
  "tension-creak-1": [0.4, 1.0],
  "tension-creak-2": [0.4, 1.0],
  "crash-boom": [1.0, 2.5],
  "chain-rattle": [2, 6],
};

describe("the asset files (A6, A-OWN)", () => {
  const files = Object.fromEntries(CUE_IDS.map((id) => [id, read(id)])) as Record<
    CueId,
    ReturnType<typeof read>
  >;

  it("gives every cue either an owner recording or its kept A6 original, never both or neither", () => {
    const owner = CUE_IDS.filter((id) => OWNER[id]);
    expect(owner).toHaveLength(14);
    expect([...owner, ...A6_KEPT].sort()).toEqual([...CUE_IDS].sort());
  });

  it.each(CUE_IDS.filter((id) => OWNER[id]))(
    "%s plays the owner's recording, byte for byte as uploaded, and the upload is kept",
    (id) => {
      const owner = OWNER[id]!;
      const played = files[id];
      expect(played.exists).toBe(true);
      expect(createHash("sha256").update(played.bytes).digest("hex")).toBe(owner.sha256);
      const upload = join(process.cwd(), "src", "audio", "candidates", owner.upload);
      expect(existsSync(upload)).toBe(true);
      const uploaded = readFileSync(upload);
      if (owner.trim) {
        // A-OWN.2: a frame-exact cut of the upload; the untouched copy is kept.
        expect(uploaded.subarray(owner.trim.bytes).equals(played.bytes)).toBe(true);
        const original = readFileSync(join(AUDIO_DIR, "owner", owner.trim.original));
        expect(createHash("sha256").update(original).digest("hex")).toBe(owner.trim.sha256);
        expect(original.equals(uploaded)).toBe(true);
      } else {
        expect(uploaded.equals(played.bytes)).toBe(true);
      }
      expect(SOUND_MANIFEST[id].asset?.url).toMatch(
        new RegExp(`(^|/)owner/${id}(-[\\w-]+)?\\.${owner.format}$`),
      );
    },
  );

  it.each(CUE_IDS.filter((id) => OWNER[id]))(
    "%s is a stereo file whose extension matches its real format and length",
    (id) => {
      const owner = OWNER[id]!;
      const file = files[id];
      expect(file.container).toBe(owner.format);
      expect(file.codec).toBe(owner.format === "mp3" ? "MPEG-1 Layer III" : "AAC-LC");
      expect(file.channels).toBe(2);
      expect(file.sampleRate).toBe(owner.sampleRate);
      // The container length includes the AAC encoder delay; the decoded length does not.
      expect(Math.abs(file.seconds - owner.seconds)).toBeLessThan(0.05);
    },
  );

  it.each(A6_KEPT)(
    "%s keeps its A6 original: a mono 48 kHz AAC-LC .m4a of the planned length",
    (id) => {
      const file = files[id];
      expect(file.exists).toBe(true);
      expect(file.container).toBe("m4a");
      expect(file.codec).toBe("AAC-LC");
      expect(file.channels).toBe(1);
      expect(file.sampleRate).toBe(48000);
      const [min, max] = A6_DURATION_S[id]!;
      expect(file.seconds).toBeGreaterThanOrEqual(min);
      expect(file.seconds).toBeLessThanOrEqual(max);
      expect(SOUND_MANIFEST[id].asset?.url).toMatch(new RegExp(`(^|/)${id}(-[\\w-]+)?\\.m4a$`));
      expect(SOUND_MANIFEST[id].asset?.url).not.toMatch(/owner\//);
    },
  );

  it("keeps the replaced A6 originals on disk, unreferenced", () => {
    for (const id of CUE_IDS.filter((cue) => OWNER[cue])) {
      expect(existsSync(join(AUDIO_DIR, `${id}.m4a`))).toBe(true);
    }
  });

  it.each(CUE_IDS.filter((id) => OWNER[id]?.a6 && !SPEAKER_BAND_GAINS[id]))(
    "%s plays at its A6 cue's loudness: A6 gain × 10^((A6 LUFS − owner LUFS)/20), capped at 1",
    (id) => {
      const { lufs, a6 } = OWNER[id]!;
      const matched = Math.min(
        1,
        Math.round(a6!.gain * 10 ** ((a6!.lufs - lufs) / 20) * 100) / 100,
      );
      expect(SOUND_MANIFEST[id].gain).toBe(matched);
    },
  );

  it("A-OWN.1: floor-thud and water-splash use speaker-band gains, not full-band LUFS matching", () => {
    // Both files hold most of their energy below 120 Hz (CREDITS.md §9.6).
    expect(SOUND_MANIFEST["floor-thud"].gain).toBe(SPEAKER_BAND_GAINS["floor-thud"]);
    expect(SOUND_MANIFEST["water-splash"].gain).toBe(SPEAKER_BAND_GAINS["water-splash"]);
    expect(Object.keys(SPEAKER_BAND_GAINS).sort()).toEqual(["floor-thud", "water-splash"]);
  });

  it("keeps the owner beds at gain 1: the ambience bus alone lowers them", () => {
    expect(SOUND_MANIFEST["ambience-surface"].gain).toBe(1);
    expect(SOUND_MANIFEST["ambience-underwater"].gain).toBe(1);
  });

  it.each(LOOP_CUES)("%s holds its loop points inside the decoded file", (id) => {
    const { loopStart = -1, loopEnd = -1 } = SOUND_MANIFEST[id];
    expect(loopStart).toBeGreaterThanOrEqual(0);
    const seconds = OWNER[id]?.seconds ?? files[id].seconds;
    expect(loopEnd).toBeLessThanOrEqual(seconds);
    if (!OWNER[id]) {
      // A6 loops: a margin on both sides of the period.
      expect(loopStart).toBeGreaterThanOrEqual(0.1);
      expect(seconds - loopEnd).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("download size of the cues the game loads: 3.32 MB (3.17 MiB), over the 1.5 MB docs/08 §9 budget (reported, owner decision pending)", () => {
    const loaded = CUE_IDS.filter((id) => !NOT_LOADED.includes(id));
    const total = loaded.reduce((sum, id) => sum + files[id].size, 0);
    expect(total).toBeGreaterThan(1.5 * 1024 * 1024);
    expect(total).toBeLessThanOrEqual(3.3 * 1024 * 1024); // no silent growth
  });

  it("decoded size of the cues the game loads, at 48 kHz: about 69 MB, over the 20 MB docs/08 §9 budget (reported, owner decision pending)", () => {
    const loaded = CUE_IDS.filter((id) => !NOT_LOADED.includes(id));
    const bytes = loaded.reduce(
      (sum, id) => sum + (OWNER[id]?.seconds ?? files[id].seconds) * files[id].channels * 48000 * 4,
      0,
    );
    expect(bytes).toBeGreaterThan(20 * 1024 * 1024);
    expect(bytes).toBeLessThanOrEqual(70 * 1024 * 1024); // no silent growth
  });

  it("has a CREDITS.md entry for every cue's file, and for every owner upload", () => {
    const credits = readFileSync(join(AUDIO_DIR, "CREDITS.md"), "utf8");
    for (const id of CUE_IDS) expect(credits).toContain(`\`${filePath(id).replace(/\\/g, "/")}\``);
    for (const id of CUE_IDS.filter((cue) => OWNER[cue])) {
      expect(credits).toContain(OWNER[id]!.sha256);
      expect(credits).toContain(OWNER[id]!.upload);
      if (OWNER[id]!.trim) expect(credits).toContain(OWNER[id]!.trim!.sha256);
    }
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
