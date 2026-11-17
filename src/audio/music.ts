// Music — the main soundtrack (M-OWN; docs/08 §7.6).
//
// Data only: `MUSIC_MAIN`, the one soundtrack, as a stream for
// `AudioManager.stream()`. The file is the owner-supplied MP3, byte for byte
// (provenance and rights status: `src/assets/audio/CREDITS.md` §8).
//
// It is **not** a cue of the sound manifest, on purpose: the sound bank
// fetches and decodes every manifest cue into memory, and the soundtrack
// must be streamed, never decoded as a whole. Looping is the media element's
// native `loop`; the file is not cut, remixed or re-encoded.
//
// When it plays and how it ducks is the director's job (`director.ts`); the
// audio host hands the track to the director (`src/ui/audio-host.ts`).
//
// Imports: the asset URL, and a type from the AudioManager (docs/08 §6
// import rule).

import musicMainUrl from "@/assets/audio/music-main.mp3";

import type { StreamOptions } from "./audio-manager";

/** A soundtrack: a stream with a name. */
export interface MusicTrack extends StreamOptions {
  readonly id: string;
}

/** AQUADIVE's main background soundtrack (owner-supplied; `CREDITS.md` §8). */
export const MUSIC_MAIN: MusicTrack = Object.freeze({
  id: "music-main",
  url: musicMainUrl,
  bus: "music",
  gain: 1,
  loop: true,
});
