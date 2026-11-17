import * as L from "./lib.js";
const A = "/repo/src/assets/audio/";
const P = new URLSearchParams(location.search);
// Candidate source: wav masters (scratch) or encoded m4a (repo refinement folder).
const EXT = (window.__ext = (await (await fetch("/cfg.json")).json()).ext);
const C = EXT === "wav" ? "/out/wav/" : A + "candidates/refinement/";
const SFX = 0.7,
  MUSIC = 0.5,
  AMB = 0.2;
const pick = (m) => {
  const { bandsPct, topPeaksHz, ...r } = m;
  return {
    ...r,
    bands: Object.values(bandsPct)
      .map((v) => Math.round(v))
      .join("/"),
    peaks: topPeaksHz.slice(0, 4).join(","),
  };
};
// Speaker-band level of `target` vs `masker` over the target's active window (dB difference).
function smr(target, masker, from, to, filt = L.speaker) {
  const lt = L.lufs(L.slice(filt(target), from, to)),
    lm = L.lufs(L.slice(filt(masker), from, to));
  return L.r1(lt - lm);
}
// Per-band (octave-ish) level difference between two signals over a window.
function bandDiff(a, b, from, to) {
  const sa = L.spectrum(a, from, to),
    sb = L.spectrum(b, from, to);
  const ea = (() => {
    let t = 0;
    const s = L.slice(a, from, to);
    for (const x of s.ch) for (const v of x) t += v * v;
    return t;
  })();
  const eb = (() => {
    let t = 0;
    const s = L.slice(b, from, to);
    for (const x of s.ch) for (const v of x) t += v * v;
    return t;
  })();
  const o = {};
  for (const k of Object.keys(sa.bandsPct))
    o[k] = L.r1(10 * Math.log10((sa.bandsPct[k] * ea + 1e-12) / (sb.bandsPct[k] * eb + 1e-12)));
  return o;
}
export async function run() {
  const out = { ext: EXT, files: {}, checks: {} };
  const get = async (p) => L.decode(p);
  const cand = {
    "bet-clink-2-candidate-a": await get(C + "bet-clink-2-candidate-a." + EXT),
    "bet-clink-2-candidate-b": await get(C + "bet-clink-2-candidate-b." + EXT),
    "crash-boom-candidate": await get(C + "crash-boom-candidate." + EXT),
    "chest-lid-creak-candidate": await get(C + "chest-lid-creak-candidate." + EXT),
  };
  for (const [k, s] of Object.entries(cand)) out.files[k] = pick(L.measure(s));
  const bet1 = await get(A + "owner/bet-clink-1.mp3"),
    bet2 = await get(A + "owner/bet-clink-2.mp3");
  const snap = await get(A + "owner/chain-snap.m4a"),
    boom = await get(A + "crash-boom.m4a");
  const lid = await get(A + "owner/chest-lid-creak.m4a"),
    coins = await get(A + "owner/chest-coin-burst.m4a"),
    shimmer = await get(A + "owner/treasure-shimmer.m4a");
  const music = await get(A + "music-main.mp3"),
    amb = await get(A + "owner/ambience-underwater.m4a"),
    ambS = await get(A + "owner/ambience-surface.m4a");
  out.files["bet-clink-1 (ref)"] = pick(L.measure(bet1));
  out.files["bet-clink-2 (current)"] = pick(L.measure(bet2));
  out.files["crash-boom (current)"] = pick(L.measure(boom));
  out.files["chest-lid-creak (current)"] = pick(L.measure(lid));

  // Crash as played: snap + boom, both gain 1 on sfx 0.7, through the limiter.
  const crashMix = async (b) => {
    const m = L.mix(48000, [
      { sig: snap, gain: SFX },
      { sig: b, gain: SFX },
    ]);
    const lim = await L.limiter(m);
    const r = pick(L.measure(lim));
    let e = 0;
    for (const x of b.ch) for (const v of x) e += v * v;
    e *= SFX * SFX;
    let es = 0;
    for (const x of snap.ch) for (const v of x) es += v * v;
    es *= SFX * SFX;
    if (b.ch.length === 1) e *= 2; // mono boom plays on both speakers
    return {
      ...r,
      bodyEnergySharePct: L.r1((100 * e) / (e + es)),
      preLimiterPeakDb: L.r1(L.db(L.peakOf(m))),
    };
  };
  out.checks.crashCombinedOld = await crashMix(boom);
  out.checks.crashCombinedNew = await crashMix(cand["crash-boom-candidate"]);
  // Sub-bass share (<60 Hz) and decay of the body alone.
  // Crash vs the ducked music bed (music ×0.4 during the crash duck) in the speaker band.
  const musicSeg = L.slice(music, 30, 33);
  const ducked = (g) => L.gain(musicSeg, MUSIC * g);
  const ambSeg = L.gain(L.slice(amb, 10, 13), AMB);
  const bed = (g) =>
    L.mix(
      48000,
      [
        { sig: ducked(g), gain: 1 },
        { sig: ambSeg, gain: 1 },
      ],
      3 * 48000,
    );
  out.checks.crashOverBed_150HP = {
    old: smr(L.gain(boom, SFX), bed(0.4), 0, 0.8),
    new: smr(L.gain(cand["crash-boom-candidate"], SFX), bed(0.4), 0, 0.8),
  };
  out.checks.crashOverBed_phone = {
    old: smr(L.gain(boom, SFX), bed(0.4), 0, 0.8, L.phone),
    new: smr(L.gain(cand["crash-boom-candidate"], SFX), bed(0.4), 0, 0.8, L.phone),
  };

  // BET: at the bet gains (bet1 0.2; candidates at the gain that matches bet1's in-game LUFS) over surface bed + full music.
  const bedSurface = L.mix(
    48000,
    [
      { sig: L.gain(musicSeg, MUSIC), gain: 1 },
      { sig: L.gain(L.slice(ambS, 10, 13), AMB), gain: 1 },
    ],
    3 * 48000,
  );
  const b1 = L.lufs(bet1);
  out.checks.bet = {};
  for (const [k, s] of [
    ["bet-clink-1", bet1],
    ["bet-clink-2 current", bet2],
    ["cand-a", cand["bet-clink-2-candidate-a"]],
    ["cand-b", cand["bet-clink-2-candidate-b"]],
  ]) {
    const g =
      k === "bet-clink-2 current"
        ? 0.58
        : k === "bet-clink-1"
          ? 0.2
          : Math.min(1, 0.2 * 10 ** ((b1 - L.lufs(s)) / 20));
    out.checks.bet[k] = {
      gain: +g.toFixed(3),
      inGameLufs: L.r1(L.lufs(s) + L.db(g * SFX)),
      inGamePhone: L.r1(L.lufs(L.phone(s)) + L.db(g * SFX)),
      overBed150: smr(L.gain(s, g * SFX), bedSurface, 0, 0.4),
      overBedPhone: smr(L.gain(s, g * SFX), bedSurface, 0, 0.4, L.phone),
    };
  }

  // CHEST: lid (gain chosen to match current lid in-game LUFS), coin burst (0.61 × 0.6..1), shimmer (0.36) already ringing.
  const lidNew = cand["chest-lid-creak-candidate"];
  // The candidate is level-matched to the current lid in the phone band, so it keeps gain 0.51.
  const lidGain = 0.51;
  out.checks.chest = { recommendedLidGain: +lidGain.toFixed(3) };
  for (const [name, l, g] of [
    ["current", lid, 0.51],
    ["candidate", lidNew, lidGain],
  ]) {
    for (const burst of [0.6, 1]) {
      // shimmer started 1.0 s before the pick
      const lidS = L.gain(l, g * SFX),
        coinS = L.gain(coins, 0.61 * burst * SFX),
        shimS = L.slice(L.gain(shimmer, 0.36 * SFX), 1.0);
      const others = L.mix(
        48000,
        [
          { sig: coinS },
          { sig: shimS },
          { sig: L.gain(L.slice(amb, 20, 26), AMB) },
          { sig: L.gain(L.slice(music, 40, 46), MUSIC) },
        ],
        5 * 48000,
      );
      const withoutLid = others;
      out.checks.chest[`${name} burst×${burst}`] = {
        lidOverOthers_150HP_first0p6s: smr(lidS, withoutLid, 0, 0.6),
        lidOverOthers_phone_first0p6s: smr(lidS, withoutLid, 0, 0.6, L.phone),
        lidVsCoins_bandDiffDb_0to0p8: bandDiff(lidS, coinS, 0, 0.8),
        lidVsShimmer_bandDiffDb_0to0p8: bandDiff(lidS, shimS, 0, 0.8),
      };
    }
  }
  // Music key / spectral fit: where each candidate's tonal peaks sit vs the music's peaks.
  out.checks.musicPeaks = L.spectrum(music).topPeaksHz;
  return out;
}
