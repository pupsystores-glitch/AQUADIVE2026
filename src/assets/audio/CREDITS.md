# AQUADIVE audio — credits, provenance and rights

Phase 7, step A6. Owner decision Q5 (2026-11-16): **100% original sound design
created specifically for AQUADIVE.**

Every `.m4a` file directly in this folder was produced on 2026-11-16 by the
workflow below. Two kinds of file are exceptions, and sections 1 to 7 do not
describe them:

- `music-main.mp3`, the owner-supplied soundtrack: section 8.
- Everything in `owner/`, the owner-supplied sound-effect and ambience
  recordings integrated on 2026-11-17 (A-OWN): section 9. Since then the game
  plays **14 owner recordings** and only **4 synthesized A6 files**
  (`crash-boom.m4a`, `tension-creak-1.m4a`, `tension-creak-2.m4a`,
  `chain-rattle.m4a`; the last three are disabled in normal play). The 14 A6
  files the owner recordings replace stay in this folder, unreferenced and
  not bundled, for possible restoration.

This document separates what was **verified** during production from what
**still needs the owner's confirmation**. It grants no licence and makes no
legal claim.

## 1. Summary

| Question                                                                        | Answer                                                                                                                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Third-party recordings, samples or sound libraries used                         | **None**                                                                                                                                     |
| Audio downloaded from the internet                                              | **None**                                                                                                                                     |
| External AI audio-generation service used (text-to-audio, music or voice model) | **None**                                                                                                                                     |
| How the audio was made                                                          | Computed locally by `production/synth.mjs`: seeded pseudo-random noise, sine partials, filters and a feedback-delay reverb. Mathematics only |
| Who wrote the synthesis code                                                    | An AI coding assistant (Claude Code, Anthropic), in the AQUADIVE repository, at the owner's direction, on 2026-11-16                         |
| Encoder                                                                         | The AAC encoder that ships with Windows 11 (Media Foundation), driven by `production/encode.ps1`                                             |
| Delivery format                                                                 | AAC-LC in MPEG-4 (`.m4a`), mono, 48 kHz, 96 kbit/s                                                                                           |
| Listening review by a person                                                    | **Not done yet.** No file has been heard by the owner. Levels and character were checked by measurement only                                 |
| Real-device playback (iPhone Safari, Android Chrome)                            | **Not tested**                                                                                                                               |

## 2. Production workflow

1. **Synthesis.** `node src/assets/audio/production/synth.mjs <dir>` writes one
   48 kHz, mono, 16-bit WAV master per cue and `masters.json`. The script has
   no dependency beyond Node's standard library (Node v24.21.0 was used). Its
   random generator is seeded, so the same script always writes the same
   masters. The masters are not committed; they are reproducible.
2. **Encoding.** `production/encode.ps1` encodes each master with the Windows
   Media Foundation AAC encoder through the WinRT `MediaTranscoder`
   (Windows 11 Pro, build 10.0.26300; Windows PowerShell 5.1). Settings: AAC,
   1 channel, 48 000 Hz, 96 000 bit/s.
3. **Verification.** Each `.m4a` was decoded with `decodeAudioData` in
   headless Chrome 157 and headless Edge 157 (Windows), at 48 kHz and at
   44.1 kHz, and compared with its master (section 5).

Processing inside the synthesizer, for every cue: synthesis → filtering →
reverb (the same reverb design for all cues) → fades to digital silence →
peak normalization → 16-bit TPDF dither. One-shots carry 12 ms of leading
silence, because the Windows encoder mutes about the first 9 ms of a stream
(measured). No other processing, editing or mastering tool was used.

**No sound was heard during production.** The agent that wrote the synthesizer
cannot listen. Balance inside each cue was set from spectral and level
measurements. Whether the result sounds premium is the owner's judgment.

## 3. The cues

Sizes are the exact file sizes in bytes. Durations are the decoded durations
in Chrome. "LUFS" is the master's loudness (ITU-R BS.1770 K-weighting,
ungated). SHA-256 values are the first 16 hex digits of each file's hash.

| File                      |   Bytes | Seconds |  LUFS | SHA-256 (first 16) | How it was made                                                                                                                                                                                                                                                                               |
| ------------------------- | ------: | ------: | ----: | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bet-clink-1.m4a`         |   4 733 |   0.320 | −18.3 | `f90ca7ac8bf54559` | One struck metal body: five inharmonic sine partials from 1 180 Hz with short decays, a filtered noise transient and a low body tone; low-passed, short reverb                                                                                                                                |
| `bet-clink-2.m4a`         |   5 536 |   0.384 | −17.3 | `0a483f741c5c285c` | The same design at 1 420 Hz with other partial ratios, answered by a softer second tap 62 ms later                                                                                                                                                                                            |
| `chain-unspool.m4a`       |  16 396 |   1.280 | −17.0 | `bb09eb27d4be315f` | About 25 link strikes that speed up and die away (each a set of decaying partials from a fixed set of ten "links"), over band-passed noise shaped as a turning winch                                                                                                                          |
| `water-splash.m4a`        |  13 293 |   1.024 | −21.9 | `2b4eafe7aa6a35e7` | A noise surge with a falling low-pass, a granular fizz, sixteen synthesized bubbles (damped sines with rising pitch) and a low gulp. Low-passed at 5 kHz: a disturbance heard from just under the surface, matching the V3 release splash                                                     |
| `tension-creak-1.m4a`     |  11 975 |   0.917 | −20.9 | `57a5fa3bbf84fe64` | A stick-slip impulse train (28 → 46 Hz) driving six metal resonances from 118 Hz, with a low groan; dark reverb                                                                                                                                                                               |
| `tension-creak-2.m4a`     |  12 430 |   0.960 | −20.1 | `046888750c9486e5` | The same model under more strain: 40 → 96 Hz, resonances from 173 Hz, ending in a small metallic tick                                                                                                                                                                                         |
| `goldfish-chime.m4a`      |  12 895 |   0.981 | −13.8 | `73f1d53f8596b5e3` | Three soft bell tones (E6, A6, a quiet E7), each four sine partials, with one bubble; reverb                                                                                                                                                                                                  |
| `cashout-coins.m4a`       |  17 663 |   1.365 | −14.1 | `f62a65e1dcca4858` | Eight synthesized coin strikes rising through D major pentatonic, settled by a soft D6 + A6 dyad                                                                                                                                                                                              |
| `chain-snap.m4a`          |   6 536 |   0.469 | −17.7 | `e381b10e8c3ebe36` | Two fracture transients 18 ms apart (noise click plus bright inharmonic partials), a fast downward twang and a 95 Hz thunk; soft saturation                                                                                                                                                   |
| `crash-boom.m4a`          |  29 139 |   2.325 | −20.8 | `a0ca35b9b3682856` | A falling sub tone (78 → 34 Hz), a saturated body tone (228 → 78 Hz), low-passed noise, a pressure wave of filtered noise and eighteen low bubbles; low-passed at 1.8 kHz with a long dark reverb                                                                                             |
| `floor-thud.m4a`          |  11 442 |   0.875 | −22.4 | `2a2efdb7b8e642a3` | Two falling low tones, a soft puff of filtered noise (sand) and a muted three-partial clunk                                                                                                                                                                                                   |
| `jackpot-stinger.m4a`     |  43 931 |   3.520 | −17.2 | `fe97bf11fe10c3ff` | A D add9 swell of additive tones with an opening filter, a rising run of seven bells (D5 → D7), a low D, a noise bloom and a quiet sparkle; long reverb. An original figure; it quotes no existing music                                                                                      |
| `treasure-shimmer.m4a`    |  21 934 |   1.728 | −14.6 | `f9f24bbd5afdb820` | Forty-six small bell grains in D major pentatonic (1.2–4.7 kHz) on a rising arc, with a breath of high noise; reverb                                                                                                                                                                          |
| `chest-lid-creak.m4a`     |  11 469 |   0.875 | −22.9 | `73b9833b332f50e9` | A stick-slip train (38 → 112 Hz) driving five wood-like resonances and a faint hinge resonance, ending in a soft knock                                                                                                                                                                        |
| `chest-coin-burst.m4a`    |  20 761 |   1.621 | −15.6 | `5be16ed1ac9c01c6` | Thirty-six coin strikes, dense at first, a low whoomp and a quick rising run of eight bells                                                                                                                                                                                                   |
| `chain-rattle.m4a`        |  63 212 |   5.120 | −17.9 | `ebf9b8a44f32a85d` | **Loop, 4.8 s period.** About 85 uneven link strikes from the same ten "links", over friction and low thrum noise. No fixed rhythm and no strong pitch, so the game's 0.85–1.5 rate change reads as chain speed                                                                               |
| `ambience-surface.m4a`    | 297 110 |  24.320 | −22.0 | `5f662c8814c4745d` | **Loop, 24 s period.** A soft noise wash, seven swells with moving filters and foam, twenty-two small laps with bubbles, two low hull groans and two faint chain movements                                                                                                                    |
| `ambience-underwater.m4a` | 297 110 |  24.320 | −22.2 | `6e428c2a2fa565a3` | **Loop, 24 s period.** A slowly breathing low rumble (55–230 Hz, softly saturated), a moving band of noise at 150–500 Hz, a thin upper layer, four passing currents, three distant falling tones, one remote groan and sixteen bubbles; dark reverb. About 96 % of its energy is below 500 Hz |

**Totals:** 18 files, **897 565 bytes** (target ≤ 1.5 MB). Decoded as 32-bit
mono: **13 901 752 bytes** at 48 kHz, 12 772 204 bytes at 44.1 kHz (target
≤ 20 MB).

## 4. Loops

Each loop file holds one exactly periodic period, with 0.15 s of the same
periodic signal before it and after it. The manifest sets `loopStart` 0.15 s
and `loopEnd` 0.15 s + the period (4.95 s for the rattle, 24.15 s for the
beds). Because the signal is periodic on both sides of both points, the loop
stays seamless if a decoder shifts the audio by a few milliseconds.

Measured on the audio decoded by Chrome 157 (48 kHz; the 44.1 kHz values are
within 1 dB). Values are relative to the local signal level.

| Loop                  | Loop points inside the buffer, with margin | Step at the loop jump | Typical step between samples | Mismatch of the 0.2 s around both points |
| --------------------- | ------------------------------------------ | --------------------: | ---------------------------: | ---------------------------------------: |
| `chain-rattle`        | Yes                                        |              −10.6 dB |                     −12.5 dB |                                 −30.3 dB |
| `ambience-surface`    | Yes                                        |              −39.8 dB |                     −13.1 dB |                                 −25.5 dB |
| `ambience-underwater` | Yes                                        |              −31.4 dB |                     −30.8 dB |                                 −36.4 dB |

The step at the jump is no larger than an ordinary step between two samples
of the same signal (the rattle's is 1.9 dB above its average step, well inside
its normal range), so the jump adds no click. This is a measurement, not a
listening result.

## 5. Verification results (Chrome 157 and Edge 157, Windows)

- **Decoding:** all 18 files decode; all are AAC-LC (audio object type 2),
  mono, 48 kHz. `canPlayType('audio/mp4; codecs="mp4a.40.2"')` returns
  `"probably"`.
- **Peaks:** the highest decoded peak is **−2.35 dBFS** (at 44.1 kHz). No
  sample reaches full scale. The target was −1 dBFS or lower.
- **Alignment:** every decoded file is aligned with its master to the sample
  (lag 0): Chrome removes the encoder delay.
- **Fidelity:** the difference between decoded audio and master is between
  −23 dB and −42 dB of the signal level.
- **Silence and truncation:** each one-shot starts within 12–37 ms (the
  coin burst by design at 112 ms, after the lid starts to open) and ends in a
  fade to silence inside the file. No file is silent or cut short.

**Not verified:** Safari (macOS and iOS), Firefox, Android Chrome, and any
physical device. Safari's handling of the AAC encoder delay may differ from
Chrome's; the loop margins are there for that case, but it is untested.

## 6. Rights status

### Verified

- The audio contains no third-party sound. Every sample value comes from the
  arithmetic in `production/synth.mjs`, which is in this repository.
- The synthesizer uses no library: only Node.js built-ins (file writing).
- The musical material (a D major pentatonic set, a D add9 chord, rising bell
  figures) was written for this game and copies no existing work.
- No licence with a gambling clause applies to the audio itself, because no
  third-party audio licence applies at all.

### Needs the owner's confirmation

These are open. Nothing below is asserted as cleared.

1. **Authorship and ownership of AI-assisted work.** The synthesis code was
   written by an AI coding assistant, and the audio is that code's output.
   Confirm that the terms of the Claude plan used for this project assign the
   output to you for commercial use, including a real-money gambling product.
   Whether, and how far, AI-assisted material is protected by copyright
   differs between countries; take legal advice if exclusive ownership matters.
2. **The Windows AAC encoder.** The files were encoded with the encoder that
   is part of Windows 11 Pro. Confirm that your Windows licence allows
   commercial use of its output.
3. **AAC patents.** AAC is a patented format with a licensing programme
   (Via Licensing Alliance). Confirm whether distributing AAC-encoded files in
   your product needs a licence. This was not researched or verified here.
4. **Format decision Q6.** AAC-LC `.m4a` was the owner's stated preference
   "subject to verified browser and decoder compatibility". Compatibility is
   verified on desktop Chrome and Edge only (section 5).
5. **Listening acceptance.** The owner has not heard the files.
6. **Real-device acceptance** (iPhone Safari, Android Chrome; docs/08 Q14).

## 7. Reproducing the files

```
node src/assets/audio/production/synth.mjs <masters-dir>
powershell -NoProfile -ExecutionPolicy Bypass -File src/assets/audio/production/encode.ps1 -Masters <masters-dir> -Out src/assets/audio
```

`production/masters.json` records the masters' durations, levels and loop
points from the production run. The WAV masters are identical on every run.
The encoded bytes can differ with the Windows version.

## 8. The main soundtrack: `music-main.mp3` (M-OWN, 2026-11-17)

This file is **not** part of the A6 production above. Sections 1 to 7,
including the statement that no external AI audio-generation service was used,
apply to the 18 `.m4a` cues only.

**Provenance, as recorded by the owner (decision D6):**

> Owner-provided, AI-generated original soundtrack. Commercial-use rights
> pending verification of the generating service's applicable terms.

| Item                    | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| File                    | `src/assets/audio/music-main.mp3`                                                              |
| Supplied by             | The project owner, as `audio--AQUADIVE-Minimal-Loop-Background-Music-Create-a-m.mp3`           |
| How it was made         | Generated by the owner with an AI music-generation service. The service is not recorded here   |
| Bytes                   | 3 527 200, unchanged from the supplied file                                                    |
| SHA-256                 | `03c8dfd16c8a2713775a1fcf3939933bfe6d3fe80aea6730e043e0a74ce81efc`                             |
| Format (measured)       | MPEG-1 Layer III, 192 kbit/s constant, 44.1 kHz, stereo, 146.90 s; ID3v2 tag written by "Lavf" |
| Peak / loudness (meas.) | −2.1 dBFS peak; −22 dBFS RMS over the whole file (Chrome 157 decode)                           |
| Changes made here       | **None.** Not remixed, shortened, split or re-encoded; only copied and renamed                 |
| How the game plays it   | Streamed through one media element with native looping; never decoded as a whole               |

**Not verified, and not claimed:**

- The commercial licence. Whether the generating service's terms allow
  commercial use, and use in a real-money gambling product, has **not** been
  independently verified.
- Copyright ownership. Whether, and how far, AI-generated music is protected
  by copyright differs between countries. Nothing here asserts ownership.
- That the music copies no existing work. It was not checked.
- MP3 patent or licensing questions were not researched.

Local testing is not blocked by these open items (owner decision D6). They
must be settled before a production release.

## 9. Owner-supplied recordings: `owner/` (A-OWN, 2026-11-17)

These files are **not** part of the A6 production. Sections 1 to 7, including
the statement that no third-party recording and no AI audio-generation service
was used, apply only to the 18 synthesized `.m4a` files directly in this
folder. They do not describe anything in `owner/`.

**Provenance, as far as it is known here:** the project owner uploaded these
recordings into the repository on 2026-11-17 (`src/audio/candidates/`) and
asked for them to replace the synthesized cues. **Who made them, how, with
which tools or services, and under which licence is not recorded here.**
Nothing in this section states or implies a licence, an author or ownership.
The MPEG-4 files' metadata names their writing tool (`Lavf60.3.100`,
`Lavf60.16.100`, `Lavf61.7.100`, an FFmpeg muxer; `chain-snap.mp3.m4a`:
`https://clipchamp.com`); that says how a file was saved, not who made the
sound.

**What was done to them:** nothing. Each file in `owner/` is a byte-identical
copy of the owner's upload (SHA-256 below, checked by
`src/audio/manifest.test.ts`), renamed to its cue id with the extension that
matches its real format. The uploads carried a double extension
(`*.mp3.m4a` files are MPEG-4 AAC, `*.mp3.mp3` files are MP3); the copies keep
the extension of the real format, which is not a conversion and needed none.
No file was converted, re-encoded, trimmed, normalized, downmixed or
resampled. The uploads themselves stay unchanged in `src/audio/candidates/`
as the backup.

**Delivery format:** as supplied. MP3 and AAC-LC in MPEG-4 both decode with
`decodeAudioData` in every browser the game supports, so re-encoding would
only have cost quality. The files are stereo at 44.1 or 48 kHz; the
`AudioContext` resamples them on decode.

### 9.1 The files

Measured with `decodeAudioData` at 48 kHz in headless Chrome 157 and headless
Edge 157 (Windows); both gave identical results. "LUFS" is integrated loudness
(ITU-R BS.1770-4, K-weighted, gated). Formats come from the files' own frame
headers and MPEG-4 boxes.

| File in the game                | Uploaded as                   |     Bytes | Format                                    | Seconds | Peak dBFS |  LUFS | SHA-256                                                            |
| ------------------------------- | ----------------------------- | --------: | ----------------------------------------- | ------: | --------: | ----: | ------------------------------------------------------------------ |
| `owner/ambience-surface.m4a`    | `ambience-surface.mp3.m4a`    | 1 409 744 | AAC-LC .m4a, 128 kbit/s, 44.1 kHz, stereo |  86.858 |     −17.0 | −32.5 | `25d7a2572a8fcc259044821f08c7a708aba9c0790cc9c23abc09cf4883196ff3` |
| `owner/ambience-underwater.m4a` | `ambience-underwater.mp3.m4a` |   976 819 | AAC-LC .m4a, 129 kbit/s, 44.1 kHz, stereo |  60.000 |     −10.2 | −23.8 | `4a7acce6e4b06db30185aeb6be7ea5503d84070c48c4ee2299e1ba3347605d57` |
| `owner/bet-clink-1.mp3`         | `bet-clink-1.mp3 (2).mp3`     |    53 498 | MP3, 256 kbit/s CBR, 44.1 kHz, stereo     |   1.672 |      −0.2 | −10.4 | `6de2458e9cdb75c50c444ba7949d2d961cc6cfd17c11e993594ede2991b61165` |
| `owner/bet-clink-2.mp3`         | `bet-clink-2.mp3.mp3`         |    98 638 | MP3, 256 kbit/s CBR, 44.1 kHz, stereo     |   3.082 |      −4.2 | −18.6 | `5a029f4f97c5c41439ee1aa36594a61947bf95b4294022c1eaccb501dd6f94a4` |
| `owner/cashout-coins.mp3`       | `cashout-coins.mp3.mp3`       |    54 144 | MP3, 192 kbit/s CBR, 48 kHz, stereo       |   2.256 |      −1.2 | −13.4 | `e87844c5a956ff9c55ef08a66dd36f01bd4867beef1ac5e58d0afe46b9788d02` |
| `owner/chain-snap.m4a`          | `chain-snap.mp3.m4a`          |    54 748 | AAC-LC .m4a, 192 kbit/s, 48 kHz, stereo   |   2.172 |      −5.2 | −19.1 | `6483e380cf46e83058483803e179151d17effc82ccb2a71281ec7e2cbb0e0fbb` |
| `owner/chain-unspool.m4a`       | `chain-unspool.mp3.m4a`       |    30 493 | AAC-LC .m4a, 128 kbit/s, 44.1 kHz, stereo |   1.813 |      −8.1 | −20.7 | `c955377a16d6434e7c8f8598faefdce3edc8eec988e4612ec9829be1c45956a5` |
| `owner/chest-coin-burst.m4a`    | `chest-coin-burst.mp3.m4a`    |    80 569 | AAC-LC .m4a, 129 kbit/s, 44.1 kHz, stereo |   4.859 |      −1.5 | −13.3 | `533ccb4cbfd0827e3872594e96098b6a5d89605dbab67e0c6496912c90dff167` |
| `owner/chest-lid-creak.m4a`     | `chest-lid-creak.mp3.m4a`     |    14 717 | AAC-LC .m4a, 93 kbit/s, 44.1 kHz, stereo  |   1.125 |       0.8 | −16.9 | `ede687e5787a06a4036e160752bf8b5c1bde4804d93ca250611716ec99216ba3` |
| `owner/floor-thud.mp3`          | `floor-thud.mp3.mp3`          |    65 280 | MP3, 256 kbit/s CBR, 48 kHz, stereo       |   2.040 |       0.0 |  −9.7 | `0fd657f52db6a41eed9bca208fd54acc8782f716f404fe7e210996d111ab7b27` |
| `owner/goldfish-chime.mp3`      | `goldfish-chime.mp3.mp3`      |    59 328 | MP3, 192 kbit/s CBR, 48 kHz, stereo       |   2.472 |      −0.7 | −15.3 | `10896aaeed1dbeb52c6af3ac02301eea9dbc465be99dd69b866a04bf15b9da84` |
| `owner/jackpot-stinger.m4a`     | `jackpot-stinger.mp3.m4a`     |    75 647 | AAC-LC .m4a, 127 kbit/s, 44.1 kHz, stereo |   4.626 |      −1.4 | −14.0 | `431e750b3af15d0d990669a2adc8f931654a53786830dea2330c10b2354a98b3` |
| `owner/treasure-shimmer.m4a`    | `treasure-shimmer.mp3.m4a`    |   124 242 | AAC-LC .m4a, 128 kbit/s, 44.1 kHz, stereo |   7.612 |      −1.5 | −13.8 | `4ec352713e0a99419def9299a12418db628f200bc44efcc86a399942545124d8` |
| `owner/water-splash.mp3`        | `water-splash.mp3.mp3`        |   192 768 | MP3, 256 kbit/s CBR, 48 kHz, stereo       |   6.024 |       0.0 |  −7.8 | `27ffe29f4257b2d1acd36feb21867c2aeef46bddcdfba4e614a010c633464d19` |

**Totals:** 14 files, **3 290 635 bytes**. Decoded as 32-bit float at 48 kHz,
stereo: about **68.4 MiB** (the two beds alone are 53.8 MiB).

### 9.2 Cue mapping

Every upload maps to exactly one cue by its name; no two uploads share a cue,
and no two are identical (all SHA-256 values differ). One upload,
`bet-clink-1.mp3 (2).mp3`, carries a browser "duplicate download" suffix; it
is the only `bet-clink-1` file supplied, so the mapping is unambiguous.

| Cue                   | Event that plays it                       | File                                      |
| --------------------- | ----------------------------------------- | ----------------------------------------- |
| `bet-clink-1`         | BET 1 placed                              | `owner/bet-clink-1.mp3`                   |
| `bet-clink-2`         | BET 2 placed                              | `owner/bet-clink-2.mp3`                   |
| `chain-unspool`       | Dive start (chain release)                | `owner/chain-unspool.m4a`                 |
| `water-splash`        | Dive start (water disturbance)            | `owner/water-splash.mp3`                  |
| `goldfish-chime`      | Goldfish pickup                           | `owner/goldfish-chime-trimmed.mp3` (§9.7) |
| `cashout-coins`       | Cash out (either slot)                    | `owner/cashout-coins.mp3`                 |
| `chain-snap`          | Crash (chain breaks)                      | `owner/chain-snap.m4a`                    |
| `floor-thud`          | Ship reaches the seabed                   | `owner/floor-thud.mp3`                    |
| `jackpot-stinger`     | Jackpot                                   | `owner/jackpot-stinger.m4a`               |
| `treasure-shimmer`    | Bonus chests revealed                     | `owner/treasure-shimmer.m4a`              |
| `chest-lid-creak`     | Chest picked (lid)                        | `owner/chest-lid-creak.m4a`               |
| `chest-coin-burst`    | Chest picked (coins)                      | `owner/chest-coin-burst.m4a`              |
| `ambience-surface`    | Bed while betting (loop)                  | `owner/ambience-surface.m4a`              |
| `ambience-underwater` | Bed during and after the dive (loop)      | `owner/ambience-underwater.m4a`           |
| `crash-boom`          | Crash (impact)                            | `crash-boom.m4a` (A6, kept)               |
| `tension-creak-1`     | **Disabled** (was: multiplier thresholds) | `tension-creak-1.m4a` (A6, kept)          |
| `tension-creak-2`     | **Disabled** (was: multiplier thresholds) | `tension-creak-2.m4a` (A6, kept)          |
| `chain-rattle`        | **Disabled** (was: loop while diving)     | `chain-rattle.m4a` (A6, kept)             |

No owner recording was supplied for `crash-boom`, `tension-creak-1`,
`tension-creak-2` or `chain-rattle`. The disabled three are never fetched,
decoded or played in normal play (A6.1, A-OWN).

### 9.3 Levels in the game (provisional)

The recordings are played as supplied. So that the mix the owner has been
hearing keeps its balance, each replaced one-shot's manifest `gain` is set to
play at the loudness its A6 cue had: A6 gain × 10^((A6 LUFS − owner LUFS) / 20),
rounded to 0.01 and capped at 1. The beds keep gain 1; the ambience bus
(`AUDIO_MIX.ambience`, now 0.2) alone sets their level. **Every value is
provisional until the owner's listening pass.**

| Cue                | A6 gain | A6 LUFS | Owner LUFS |               New gain |
| ------------------ | ------: | ------: | ---------: | ---------------------: |
| `bet-clink-1`      |    0.50 |   −18.3 |      −10.4 |                   0.20 |
| `bet-clink-2`      |    0.50 |   −17.3 |      −18.6 |                   0.58 |
| `chain-unspool`    |    0.55 |   −17.0 |      −20.7 |                   0.84 |
| `water-splash`     |    0.90 |   −21.9 |       −7.8 | 0.18 → **0.32** (§9.6) |
| `goldfish-chime`   |    0.45 |   −13.8 |      −15.3 |                   0.53 |
| `cashout-coins`    |    0.70 |   −14.1 |      −13.4 |                   0.65 |
| `chain-snap`       |    0.90 |   −17.7 |      −19.1 |               **1.00** |
| `floor-thud`       |    1.00 |   −22.4 |       −9.7 | 0.23 → **0.55** (§9.6) |
| `jackpot-stinger`  |    0.90 |   −17.2 |      −14.0 |                   0.62 |
| `treasure-shimmer` |    0.40 |   −14.6 |      −13.8 |                   0.36 |
| `chest-lid-creak`  |    1.00 |   −22.9 |      −16.9 |                   0.51 |
| `chest-coin-burst` |    0.80 |   −15.6 |      −13.3 |                   0.61 |

`chain-snap` would need 1.07 and is capped at 1, so it plays about 0.5 LU
quieter than the A6 snap. In the game the owner beds sit near −46.6 LUFS
(surface) and −37.8 LUFS (underwater) at full user volume: the surface bed is
about 10 dB quieter in the file than the A6 surface bed it replaces.

### 9.4 Observations from the measurements (nothing changed; for the owner)

- `water-splash.mp3`: hard clipping in the file itself (4 910 samples at full
  scale, 160 flat-topped runs), and a 1.04 s silent gap inside the 6.0 s file.
- `floor-thud.mp3`: light clipping in the file (64 samples at full scale).
- `chest-lid-creak.m4a`: decodes to +0.8 dBFS (12 samples above full scale,
  AAC overshoot). At its gain of 0.51 on the 0.7 sfx bus it plays at about
  −8 dBFS, so it does not clip in the game.
- `goldfish-chime.mp3`: 470 ms of silence before the sound starts, so the
  chime is heard about half a second after the pickup. _(Corrected by
  A-OWN.2, §9.7: the game now plays a frame-trimmed derivative.)_
- `chain-snap.m4a`: the same signal on both channels (mono in stereo); the
  file ends while the sound is still at about −46 dBFS, which may be heard as
  a cut-off tail.
- `chest-coin-burst.m4a`: a 0.59 s silent gap inside the file; its edit list
  is unusual (a 1 ms empty edit), but Chrome and Edge decode it normally.
- `ambience-surface.m4a`: fades in over about 20 ms and out over its last
  60 ms. The loop runs from 0.02 s to 86.79 s, so it skips both fades; the
  join has not been judged by ear.
- `ambience-underwater.m4a`: full level edge to edge with a small sample step
  at the join (0.12 × the median step), so it loops whole, 0 to 60 s.
- Size: the 14 files are 3.29 MB to download (the docs/08 §9 budget is
  1.5 MB) and about 68 MiB decoded (budget 20 MB), mostly the two long stereo
  beds. Reported, not reduced: reducing it would mean shortening, downmixing
  or re-encoding the owner's recordings.

### 9.6 A-OWN.1: the sea-floor thud and the dive splash (2026-11-17)

**Owner report:** at the sea-floor impact `floor-thud` could not be heard,
only the treasure sounds; `water-splash` also seemed missing. Neither
recording was changed; the corrections are in playback timing and gain.

**Root cause, `floor-thud` (three parts, measured):**

1. **Timing.** The thud played on the engine's `shipImpact` event. At that
   moment the drawn anchor is still sinking its last stretch: it stands on
   the sand 0.30–0.70 s later, depending on the canvas size (renderer
   `applyLanding`), and tips onto its side 0.75 s after that. The sound came
   before the visible contact, and the visible contact had no sound of its
   own.
2. **Gain.** 72 % of the file's energy is below 60 Hz and 89 % below 120 Hz,
   which phones and laptops barely reproduce. The full-band loudness match of
   §9.3 therefore set its gain to 0.23, about 13 dB too low for the part a
   speaker plays.
3. **Masking.** `jackpot-stinger` starts on the same event, and its energy
   lies at 250 Hz–2 kHz, where the thud's only speaker-audible content is.
   Rendered through a 150 Hz high-pass (the speaker band), the thud was at
   best level with the stinger (−25 vs −24 dBFS) and then 9–20 dB below it.

Also checked: the file decodes in Chrome and Edge; it starts after 10 ms
(no excessive leading silence; its hit lies 0.29–0.30 s into the file, after
a rising onset); no voice is dropped (at most 4 of the 8 one-shot voices
were busy during the sequence, and no voice was stolen).

**Root cause, `water-splash`:** gain only. 81 % of its energy is below
120 Hz; the full-band match set 0.18, which put its speaker band at the
level of the music bed (about −26 dBFS). Its timing is right: the drawn
release splash starts on the same frame as `diveStarted`.

**Corrections:**

- `floor-thud` now starts when the renderer's own impact clock reaches the
  anchor's touchdown minus 0.30 s, so the recording's hit lands on the
  touchdown. The touchdown is computed for the actual canvas size
  (`src/ui/anchor-touchdown.ts`, checked against the renderer's `anchorPose`
  by its test). `jackpot-stinger` still plays on the event, with the jackpot
  flash. Gain 0.23 → **0.55**: the hit is 4–8 dB above the stinger in the
  speaker band at the touchdown; in-game about −18 LUFS and −8.3 dBFS peak,
  2–3 LU above the other outcome cues.
- `water-splash`: gain 0.18 → **0.32**, matching the A6 splash above 150 Hz;
  about 3–6 dB above the music bed.

Both values are provisional until the owner's listening pass.

### 9.7 A-OWN.2: the goldfish chime's lead-in (2026-11-17)

**Owner report:** `goldfish-chime` plays much too late after the pickup.

**Root cause: silence inside the recording, not scheduling.** The upload
holds 475 ms of digital silence (below −90 dBFS) before the bell's attack:
the first sample at −40 dBFS lies at 475.4 ms, the 5 ms envelope reaches
−6 dB of its peak at 485 ms (Chrome 157 and Edge 157 decode it identically).
The game path itself is immediate: the goldfish collision sets `boost` in
the engine tick, and the same `requestAnimationFrame` callback renders the
frame, then the director sees the rising edge and `AudioManager.play` calls
`start(0)` on the already decoded buffer. Measured in the real game: 1.5–7.4 ms
from the pickup tick to `start()`, always the same frame; no chime dropped or
stolen (one-shot cap 8).

**Correction:** `owner/goldfish-chime-trimmed.mp3` is the upload with its
first 19 MP3 frames (19 × 576 bytes, 19 × 1152 samples = 456 ms) removed. No
re-encode: the file is constant 192 kbit/s with no tag or Xing header, and
every frame's `main_data_begin` is 0 (no bit reservoir), so frames 19–102
decode exactly as before. The decoded sound is the original shifted by
456.0 ms, with the same peak (−3.25 dBFS) and envelope; its first 5 ms stay
at −101 dBFS, so no fade is needed and nothing clicks. The ending is
untouched. The gain (0.53) is unchanged: BS.1770 gating already excluded the
removed silence. `owner/goldfish-chime.mp3` stays byte-identical to the
upload, unreferenced.

| File                               |  Bytes | Seconds | First −40 dBFS sample | SHA-256                                                            |
| ---------------------------------- | -----: | ------: | --------------------: | ------------------------------------------------------------------ |
| `owner/goldfish-chime-trimmed.mp3` | 48 384 |   2.016 |               19.4 ms | `5594407eed1b555212e64cff3b6da7fe57c68662f7e1c147534785f1a13de78f` |

**Pickup to the first audible sample, in the real game** (headless Chrome 157
and Edge 157, 36 pickups; not counting the device's output latency, which
Chrome reported as 40–48 ms in headless mode for every sound alike):
before 476.9–482.8 ms, after **21.1–24.9 ms**.

### 9.5 Rights status

**Not verified, and not claimed.** Who made these recordings, whether any
third-party material, sound library or AI generation service was involved,
and whether they may be used commercially (including in a real-money gambling
product) are unknown here. The owner must confirm these points before a
production release.
