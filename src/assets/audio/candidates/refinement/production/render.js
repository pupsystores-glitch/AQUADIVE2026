import * as L from "./lib.js";
const A = "/repo/src/assets/audio/";
const SR = 48000;
const semis = (s) => 2 ** (s / 12);
const rs = (sig, ratio) => L.mapCh(sig, (x) => L.resample(x, ratio));
const eq = (sig, ...ks) => L.mapCh(sig, (x) => L.chain(x, ...ks));
const toStereo = (sig) =>
  sig.ch.length === 2 ? sig : { ...sig, ch: [sig.ch[0], sig.ch[0].slice()] };
function envelopeShape(sig, pts) {
  // pts: [[t, gain]...] linear
  return L.mapCh(sig, (x) =>
    x.map((v, i) => {
      const t = i / sig.sr;
      let k = 0;
      while (k < pts.length - 1 && pts[k + 1][0] <= t) k++;
      if (k >= pts.length - 1) return v * pts[pts.length - 1][1];
      const [t0, g0] = pts[k],
        [t1, g1] = pts[k + 1];
      return v * (g0 + (g1 - g0) * Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
    }),
  );
}
// Deterministic PRNG for reproducible IRs.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
// Small diffuse room IR: decorrelated L/R exponentially-decaying noise, low-passed.
function roomIR(rt60, lpHz, seed, preDelayS = 0.008) {
  const n = Math.round((rt60 + preDelayS) * SR),
    ch = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 77),
      x = new Float32Array(n),
      pd = Math.round(preDelayS * SR);
    for (let i = pd; i < n; i++) x[i] = r() * Math.exp((-6.91 * (i - pd)) / (rt60 * SR));
    ch.push(L.chain(x, L.lp(SR, lpHz), L.lp(SR, lpHz)));
  }
  let e = 0;
  for (const v of ch[0]) e += v * v;
  const g = 1 / Math.sqrt(e);
  return ch.map((x) => x.map((v) => v * g));
}
async function convolve(sig, ir) {
  const s = toStereo(sig),
    n = s.ch[0].length + ir[0].length;
  const oc = new OfflineAudioContext(2, n, SR);
  const b = oc.createBuffer(2, s.ch[0].length, SR);
  s.ch.forEach((x, c) => b.copyToChannel(x, c));
  const ib = oc.createBuffer(2, ir[0].length, SR);
  ir.forEach((x, c) => ib.copyToChannel(x, c));
  const src = oc.createBufferSource();
  src.buffer = b;
  const cv = oc.createConvolver();
  cv.normalize = false;
  cv.buffer = ib;
  src.connect(cv);
  cv.connect(oc.destination);
  src.start();
  const r = await oc.startRendering();
  return {
    sr: SR,
    ch: [new Float32Array(r.getChannelData(0)), new Float32Array(r.getChannelData(1))],
  };
}
// Trim to first -60 dBFS sample minus margin, then pad so the onset sits at `leadS`.
function setLead(sig, leadS = 0.014) {
  let first = Infinity;
  for (const x of sig.ch) {
    const i = x.findIndex((v) => Math.abs(v) >= 0.001);
    if (i >= 0) first = Math.min(first, i);
  }
  const cut = L.slice(sig, Math.max(0, first / SR - 0.002));
  return L.pad(cut, leadS);
}
// Cut after the last -66 dBFS sample, with a short fade so nothing clicks.
function trimTail(sig, fadeS = 0.05) {
  let last = 0;
  for (const x of sig.ch)
    for (let i = x.length - 1; i >= 0; i--)
      if (Math.abs(x[i]) >= 0.0005) {
        last = Math.max(last, i);
        break;
      }
  return L.fadeOut(L.slice(sig, 0, last / SR + 0.01), fadeS);
}
// Match integrated loudness to `targetLufs` but keep sample peak <= ceilDb.
function loudTo(sig, targetLufs, ceilDb = -1) {
  const g = 10 ** ((targetLufs - L.lufs(sig)) / 20);
  const pk = L.peakOf(sig) * g,
    gp = pk > 10 ** (ceilDb / 20) ? 10 ** (ceilDb / 20) / pk : 1;
  return L.gain(sig, g * gp);
}

export async function run() {
  const out = {};
  const bet1 = await L.decode(A + "owner/bet-clink-1.mp3");
  const bet1Lufs = L.lufs(bet1);

  // ---------- BET 2: the approved BET 1 strike, re-pitched (sinc resampling) ----------
  for (const [name, st] of [
    ["bet-clink-2-candidate-a", 3],
    ["bet-clink-2-candidate-b", -2],
  ]) {
    let s = rs(bet1, semis(st));
    s = setLead(s, 0.014);
    s = trimTail(s, 0.08);
    s = loudTo(s, bet1Lufs, -1);
    await L.saveWav(name, s);
    out[name] = {
      semitones: st,
      fundamentalHz: Math.round(439 * semis(st)),
      lufs: L.r1(L.lufs(s)),
    };
  }

  // ---------- CRASH: deep metal stress + underwater mechanical impact ----------
  const thud = await L.decode(A + "owner/floor-thud.mp3");
  const unspool = await L.decode(A + "owner/chain-unspool.m4a");
  const creak = await L.decode(A + "owner/chest-lid-creak.m4a");
  // L1 clang: the real metal strike of BET 1 pitched down 21 semitones (439 Hz -> 130 Hz;
  // its 3.7 kHz partial -> 1.1 kHz). A heavy steel body ringing at its own inharmonic
  // partials: the pressure resonance comes from a real object, not a filter. Held to 0.9 s.
  let clang = L.slice(bet1, 0.015);
  clang = rs(clang, semis(-21));
  clang = eq(clang, L.hp(SR, 70), L.hp(SR, 70), L.peaking(SR, 1100, 3, 1.2), L.lp(SR, 4000));
  clang = envelopeShape(clang, [
    [0, 1],
    [0.08, 0.85],
    [0.4, 0.3],
    [0.75, 0.06],
    [0.95, 0],
  ]);
  // L2 thud: floor-thud from just before its hit, sub removed (HP 75 Hz x2), weight at 140 Hz,
  // over in 0.4 s. Gives the mechanical "body" without a boom.
  let thudL = L.slice(thud, 0.27, 0.9);
  thudL = eq(thudL, L.hp(SR, 75), L.hp(SR, 75), L.peaking(SR, 140, 4, 1.2), L.lp(SR, 2500));
  thudL = envelopeShape(thudL, [
    [0, 0],
    [0.005, 1],
    [0.15, 0.5],
    [0.4, 0],
  ]);
  // L3 metal stress: the chain's grinding section pitched down two octaves — a slow, heavy
  // metallic strain — band-limited to 180-2500 Hz, under the clang, gone by 1.1 s.
  let stress = L.slice(unspool, 0.15, 0.85);
  stress = rs(stress, 0.25);
  stress = eq(
    stress,
    L.hp(SR, 180),
    L.hp(SR, 180),
    L.lp(SR, 2500),
    L.lp(SR, 2500),
    L.peaking(SR, 600, 3, 0.8),
  );
  stress = envelopeShape(stress, [
    [0, 0],
    [0.03, 1],
    [0.35, 0.6],
    [0.8, 0.2],
    [1.1, 0],
  ]);
  // L4 hull groan: the lid creak's wooden groan an octave down, sub removed, squeaks gone.
  let groan = rs(creak, 0.5);
  groan = eq(groan, L.hp(SR, 80), L.hp(SR, 80), L.lp(SR, 900), L.lp(SR, 900));
  groan = envelopeShape(groan, [
    [0, 0],
    [0.05, 1],
    [0.5, 0.5],
    [1.0, 0],
  ]);
  const norm = (s) => L.gain(s, 1 / L.peakOf(s));
  let crash = L.mix(SR, [
    { sig: toStereo(norm(clang)), gain: 1.0 },
    { sig: toStereo(norm(thudL)), gain: 0.7 },
    { sig: toStereo(norm(stress)), gain: 0.4, at: 0.015 },
    { sig: toStereo(norm(groan)), gain: 0.25, at: 0.04 },
  ]);
  // Underwater: soften the top, small dark space (RT60 0.5 s) at about -15 dB.
  // A broad +3 dB at 400 Hz fills the band phone speakers reproduce.
  crash = eq(crash, L.lp(SR, 4500), L.highShelf(SR, 2500, -3), L.peaking(SR, 400, 3, 0.9));
  const wetC = await convolve(crash, roomIR(0.5, 1800, 11));
  crash = L.mix(SR, [
    { sig: crash, gain: 1 },
    { sig: wetC, gain: 0.18 },
  ]);
  crash = setLead(crash, 0.014);
  crash = trimTail(crash, 0.25);
  // Level: the old file's -19.2 LUFS was mostly inaudible sub-bass; this one is set so that,
  // at the same manifest gain (1), it is louder than the old one where phones play (300 Hz+).
  crash = loudTo(crash, -15.5, -1);
  await L.saveWav("crash-boom-candidate", crash);
  out.crash = { lufs: L.r1(L.lufs(crash)) };

  // ---------- CHEST: the owner's lid creak, smoothed ----------
  // Slightly slower (x0.9, -1.8 st): a heavier, calmer lid.
  let lid = rs(creak, 0.9);
  // Squeaks (1-4 kHz) tamed, top rolled off, sub clunks removed, a little wood warmth.
  lid = eq(
    lid,
    L.hp(SR, 60),
    L.hp(SR, 60),
    L.peaking(SR, 1400, -4, 1.4),
    L.peaking(SR, 2100, -7, 1.6),
    L.highShelf(SR, 3000, -6),
    L.lp(SR, 7000),
    L.lowShelf(SR, 110, -2),
    L.peaking(SR, 230, 1.5, 1),
  );
  // The upload starts at full level on its first sample: give it a 35 ms soft attack.
  lid = L.pad(lid, 0.014);
  lid = envelopeShape(lid, [
    [0, 0],
    [0.014, 0],
    [0.05, 1],
    [10, 1],
  ]);
  // A small wooden room (RT60 0.35 s, dark) smooths the bursts and gives a natural tail.
  const wetL = await convolve(lid, roomIR(0.35, 2500, 5, 0.006));
  lid = L.mix(SR, [
    { sig: toStereo(lid), gain: 1 },
    { sig: wetL, gain: 0.22 },
  ]);
  lid = trimTail(lid, 0.12);
  // Level: match the current lid in the phone band (300 Hz HP), where it competes with the
  // music; the removed sub would otherwise make a full-band match play quieter on phones.
  const phoneGain = 10 ** ((L.lufs(L.phone(creak)) - L.lufs(L.phone(lid))) / 20);
  lid = L.gain(lid, Math.min(phoneGain, 10 ** (-1 / 20) / L.peakOf(lid)));
  await L.saveWav("chest-lid-creak-candidate", lid);
  out.lid = { lufs: L.r1(L.lufs(lid)) };
  return out;
}
