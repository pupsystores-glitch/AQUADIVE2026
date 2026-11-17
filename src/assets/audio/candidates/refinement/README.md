# A6 refinement candidates (2026-11-17) — NOT integrated

Candidates for four cues. **Nothing here is referenced by the game.** The
production files, `manifest.ts` and all gains are unchanged. Open
`LISTEN.html` in Chrome or Edge to compare each candidate with what the
game plays now.

| Cue               | Status                                                     | File(s)                                                                |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `bet-clink-2`     | 2 candidates, ready for listening                          | `bet-clink-2-candidate-a.m4a` (C5), `bet-clink-2-candidate-b.m4a` (G4) |
| `crash-boom`      | 1 candidate, ready for listening                           | `crash-boom-candidate.m4a`                                             |
| `chest-lid-creak` | 1 candidate, ready for listening                           | `chest-lid-creak-candidate.m4a`                                        |
| `jackpot-stinger` | **No candidate**: needs an external service; prompts below | —                                                                      |

`masters/` holds the 24-bit 48 kHz WAV masters. `production/` holds the
scripts that made them.

## How they were made (provenance)

**Every candidate is derived only from recordings already in this
project. No new third-party audio, sample library or AI generation service
was used.** The derivatives therefore have the **same, still unconfirmed
rights status as the owner uploads they come from** (CREDITS.md §9.5). The
owner's confirmation for those uploads covers these files too; nothing here
adds a licence.

This machine has no ffmpeg, SoX, Python, DAW or audio-generation service.
The work was done in headless Chrome: Web Audio decoding, OfflineAudioContext
convolution, and the project's own JavaScript DSP. That DSP is a 64-tap
Kaiser windowed-sinc resampler for pitch changes, RBJ biquad EQ, envelopes,
and a seeded diffuse-noise room impulse. Encoding used the Windows Media
Foundation AAC encoder (`production/enc.ps1`, the stereo variant of
`../../production/encode.ps1`). This is **editing and layering of real
recordings**. It is not a professional studio recording, and no oscillator
is used as a sound source. **No person has listened to these files yet**:
every statement about their character below comes from measurements.

| Candidate                   | Source recording(s)                                                                                     | Processing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bet-clink-2-candidate-a`   | `owner/bet-clink-1.mp3` (approved BET 1)                                                                | Re-pitched +3 semitones (fundamental 439 → 522 Hz, C5: the music's tonic, which peaks at 264/521/1043 Hz); onset aligned at 14 ms; 80 ms tail fade; loudness-matched to BET 1, peak −1 dBFS                                                                                                                                                                                                                                                                                                                                                                                 |
| `bet-clink-2-candidate-b`   | `owner/bet-clink-1.mp3`                                                                                 | Re-pitched −2 semitones (439 → 391 Hz, G4: the dominant); otherwise the same as A                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `crash-boom-candidate`      | `owner/bet-clink-1.mp3`, `owner/floor-thud.mp3`, `owner/chain-unspool.m4a`, `owner/chest-lid-creak.m4a` | Four layers. (1) **Steel clang:** the BET 1 metal strike re-pitched −21 st (its partials become a heavy body ringing at 130 Hz and 1.1 kHz), held to 0.9 s. (2) **Mechanical thud:** floor-thud from its hit, high-passed at 75 Hz (no sub), over in 0.4 s. (3) **Metal stress:** the chain's grinding section re-pitched −24 st, band-limited 180 Hz–2.5 kHz, gone by 1.1 s. (4) **Hull groan:** the lid creak re-pitched −12 st, low-passed at 900 Hz. Then a 4.5 kHz low-pass for the underwater feel, +3 dB at 400 Hz for phones, and a 0.5 s dark room at about −15 dB |
| `chest-lid-creak-candidate` | `owner/chest-lid-creak.m4a`                                                                             | Re-pitched ×0.9 (−1.8 st, 10 % slower: a heavier, calmer lid). High-pass at 60 Hz (the sub clunks). Squeak bands cut (−4 dB at 1.4 kHz, −7 dB at 2.1 kHz, −6 dB shelf above 3 kHz, low-pass at 7 kHz). Wood warmth +1.5 dB at 230 Hz. A 35 ms soft attack (the upload starts at full level on sample 0). A 0.35 s wooden-room tail at about −13 dB. Level matched to the current lid in the phone band                                                                                                                                                                      |

## Measurements (decoded `.m4a`, Chrome 157 and Edge 157 identical)

BS.1770-4 integrated loudness. "150 Hz HP" and "phone" are the same
measure after a 150 Hz or a 300 Hz 4th-order high-pass (with a 10 kHz
roll-off for phone), approximating laptop and phone speakers.

| File                          | Seconds | Peak dBFS | Clipped |  LUFS | 150 Hz HP | Phone | Lead-in to −40 dBFS | Envelope peak | −20 dB after peak | Spectral centroid |
| ----------------------------- | ------: | --------: | ------: | ----: | --------: | ----: | ------------------: | ------------: | ----------------: | ----------------: |
| BET 1 `owner/bet-clink-1.mp3` |   1.672 |      −0.2 |       0 | −10.4 |     −10.6 | −11.9 |             26.6 ms |        0.06 s |            0.35 s |            515 Hz |
| BET 2 current                 |   3.082 |      −4.2 |       0 | −18.7 |     −20.0 | −23.1 |             50.1 ms |        0.13 s |            0.96 s |            418 Hz |
| **BET 2 candidate A**         |   1.387 |      −0.9 |       0 | −11.2 |     −11.3 | −12.0 |             26.9 ms |        0.09 s |            0.30 s |            607 Hz |
| **BET 2 candidate B**         |   1.835 |      −0.9 |       0 | −10.5 |     −10.7 | −12.7 |             27.6 ms |        0.07 s |            0.38 s |            461 Hz |
| crash-boom current (A6 synth) |   2.325 |      −2.5 |       0 | −19.2 |     −24.0 | −26.9 |             12.6 ms |        0.08 s |            1.38 s |            143 Hz |
| **crash-boom candidate**      |   1.365 |      −3.0 |       0 | −15.5 |     −19.3 | −21.1 |             14.9 ms |        0.04 s |            0.81 s |            374 Hz |
| chest-lid-creak current       |   1.125 |  **+0.8** |  **12** | −17.0 |     −20.0 | −23.0 |          **1.7 ms** |        0.01 s |            0.63 s |            306 Hz |
| **chest-lid-creak candidate** |   1.024 |      −2.0 |       0 | −15.1 |     −18.3 | −23.1 |             22.8 ms |        0.14 s |            0.80 s |            245 Hz |

All candidates are AAC-LC `.m4a`, 48 kHz, stereo, 128 kbit/s. Their onsets
sit 14–16 ms in (to −60 dBFS), after the encoder's muted first ~9 ms.
Tails fade below −83 dBFS, so nothing clicks. No clipping, no DC offset.

| File                            |  Bytes | SHA-256                                                            |
| ------------------------------- | -----: | ------------------------------------------------------------------ |
| `bet-clink-2-candidate-a.m4a`   | 23 342 | `10c206ca87c06c0cd6594192fd540b78a4da9967630ac2331e41c0e21167e00c` |
| `bet-clink-2-candidate-b.m4a`   | 30 585 | `243c21dc242a7026ea2861959a04063d7df387365fc74cdb21c01d51dec6d7ab` |
| `crash-boom-candidate.m4a`      | 23 061 | `95c1bac659a4a75d9897c98a896c1ac438884f8166efe57194872bfeca239de1` |
| `chest-lid-creak-candidate.m4a` | 17 396 | `3679d14645503ee30a1835307e73c14d2fae47eb3c20fb2609dcc32fc1683786` |

### In-game comparisons (sfx bus 0.7, music 0.5, ambience 0.2)

**BET.** At the gains in the last column, both candidates play at BET 1's
in-game loudness (−27.5 LUFS). The current BET 2 plays at −26.6 LUFS with
gain 0.58, but is 1.9 dB weaker than BET 1 on a phone (−30.9 vs −29.0).

| Sound         | In-game LUFS | Phone | Above the surface bed (phone) | Gain if integrated |
| ------------- | -----------: | ----: | ----------------------------: | -----------------: |
| BET 1         |        −27.5 | −29.0 |                       16.1 dB |        0.20 (kept) |
| BET 2 current |        −26.6 | −30.9 |                       15.7 dB |               0.58 |
| Candidate A   |        −27.5 | −28.3 |                       16.1 dB |               0.22 |
| Candidate B   |        −27.5 | −29.7 |                       15.0 dB |               0.20 |

**Crash diagnosis: where the explosion character came from.** The game
starts `chain-snap` and `crash-boom` on the same frame, both at gain 1.
Measured on the combined signal:

- It comes from **the old `crash-boom` itself**. That file is 77 % of the
  combined energy, and 99–100 % of everything below 1 kHz. 40 % of its
  energy lies below 60 Hz, with spectral peaks at 35–41 Hz, and it takes
  1.4 s to fall 20 dB. A sub-bass thump followed by a long low rumble is the
  defining profile of an explosion.
- **The combination makes it worse.** `chain-snap` is almost entirely
  8–12 kHz crackle (73 %) with almost no body. Over the rumble, that
  crackle reads as debris.
- **It is not excessive gain.** The combined peak is −4.8 dBFS before the
  limiter, so the −1 dB limiter never engages, and nothing distorts.

| Crash as played (snap + body, through the game's limiter) |  LUFS | Phone | < 60 Hz share | Peak before limiter | Above ducked music + ambience (phone) |
| --------------------------------------------------------- | ----: | ----: | ------------: | ------------------: | ------------------------------------: |
| current                                                   | −17.6 | −23.7 |          37 % |           −4.8 dBFS |                                7.2 dB |
| **candidate**                                             | −17.7 | −22.0 |           1 % |           −4.4 dBFS |                           **12.5 dB** |

The candidate keeps manifest gain **1**: the same overall loudness as
today, 1.7 dB more on phones, and essentially no sub-bass.

**Chest.** The lid lives at 120 Hz–1 kHz. The coin burst and the shimmer
have no energy below 1 kHz (more than 100 dB down in the 0–0.8 s window),
and they dominate above 4 kHz. So **they do not mask one another**: the only
shared band is 2–4 kHz, where the candidate is deliberately quieter (−5 dB
under the big-prize coins, −11 dB under the shimmer). The lid's competitor
in the phone band is the music (250 Hz–1 kHz). The candidate is matched to
the current lid there and keeps gain **0.51**. Against coins + shimmer +
music + ambience it sits 0.9 dB lower relative to the whole than the
current lid (−5.4 vs −4.5 dB, big prize). The current lid's higher figure
comes from its 1–4 kHz squeaks.

## Jackpot: limitation and external brief

A premium, cinematic musical stinger needs composition, real or
high-quality sampled instruments, and mixing. None of that exists on this
machine: no instrument samples, no DAW, no generation service. Assembling
one from re-pitched effect recordings, or from oscillators, would be exactly
the kind of basic synthetic result that was rejected before. **So no jackpot
candidate is offered.** Generate it with a music/SFX service whose terms
allow commercial use in a real-money game, then drop the file into this
folder for the same measurements.

**Constraints for any jackpot file:**

- 3.5–5 s, with the main resolution by about 2.5 s.
- Tonal centre **C**, matching `music-main.mp3`, whose spectral peaks are 64, 264, 521 and 1043 Hz.
- Energy mostly at 200 Hz–4 kHz. Nothing essential below 120 Hz, which phones don't play and where `floor-thud` sits at the same moment.
- Starts on its first note within 30 ms: no silent lead-in.
- Natural decay to silence. Peak ≤ −1 dBFS. WAV 48 kHz, or high-bitrate AAC/MP3.

**Prompt (primary):**

> Short cinematic underwater treasure-discovery stinger, about 4 seconds,
> in C major. A soft, warm swell of low strings and a gentle choir-like pad
> opens immediately, then a slow, rising three-note motif on a glassy
> celesta or soft bell, resolving on a warm, open C major add9 chord that
> rings out and decays naturally. Mysterious, elegant and wondrous, like
> lantern light finding a sunken chest in deep water. Restrained, not
> triumphant. No drums, no brass fanfare, no casino or slot-machine sounds,
> no coins, no arcade chiptune, no vocals with words. Clean, polished
> mix, moderate loudness, gentle high end, subtle underwater reverb.

**Alternative (more mysterious):**

> 4-second orchestral discovery cue, C major. A hushed harp glissando
> rises into a sustained, warm string chord with a soft glass-harmonica
> shimmer on top; one gentle low-octave bell tone marks the resolution at
> 2 seconds, then everything decays naturally into calm. Deep-sea, awe,
> quiet treasure. No percussion hits, no brass, no jingles, no
> slot-machine bells, not bright or loud.

**Negative prompt / avoid:** casino, slot machine, coin shower, arcade,
8-bit, chiptune, fanfare, trumpet, cheering, applause, drum hit,
whoosh-boom, dubstep, harsh highs, childish, cartoon.

## Fallback prompts for the other three

Use these if the candidates above do not pass the listening review.

**BET 2:**

> Single short premium metallic confirmation tap, about 0.6 s: a small
> solid brass or steel token placed onto a metal tray. A clean natural
> transient and a short, warm ring that decays within half a second.
> Slightly higher and brighter than a deep brass clink, but soft and
> refined. No click, no beep, no arcade or UI blip, no coins jingling.

**Crash (heard together with a separate chain-snap):**

> Heavy underwater metal-stress impact, about 1.2 s: a large steel
> structure strained and struck deep under water. A dull, heavy metallic
> clank with a short hull groan and a brief pressure resonance, muffled by
> the water, decaying naturally within one second. Mid-low weight that
> still reads on phone speakers. No explosion, no boom, no sub-bass
> rumble, no gunshot crack, no debris, no distortion, no long reverb tail.

**Chest lid:**

> Old wooden treasure-chest lid opening smoothly, about 1 s: a soft wooden
> lid lifting on its hinges with gentle, low hinge friction and one subtle
> natural creak, ending in a soft settle. Warm and satisfying. No sharp
> squeak, no horror-door creak, no cartoon effect, no harsh high
> frequencies, no metallic clank.

## Reproducing

`production/` holds the scripts. They need Node 24, Chrome or Edge, and
Windows PowerShell 5.1. The harness writes its WAVs under its own
`out/wav/`; copy them to `masters/` and encode:

```
node production/server.mjs render.js       # writes out/wav/*.wav (run from production/)
powershell -NoProfile -ExecutionPolicy Bypass -File production/enc.ps1 -Masters <wav dir> -Out . -Bitrate 128000 -Channels 2
```

`server.mjs` has the repository path hard-coded (`REPO`). The room
impulses use a seeded generator, so a re-run reproduces the masters
except for the 1-LSB TPDF dither.

## If a candidate is approved (not done)

Integrating one means:

- Point the cue's import in `src/audio/manifest.ts` at the file.
- Set its gain from the tables above.
- Add the provenance and SHA-256 to `CREDITS.md` and the `manifest.test.ts` hash table.
- Re-run the in-game timing checks.

None of this has been done.
