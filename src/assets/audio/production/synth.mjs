// AQUADIVE sound synthesizer (Phase 7, step A6).
//
// Every AQUADIVE cue is synthesized here from mathematics alone: seeded
// pseudo-random noise, sine partials, filters and a feedback-delay reverb.
// No recording, sample, sample library, third-party sound or AI audio service
// is used, and the script has no dependency beyond Node's standard library.
// The output is deterministic: the same script always writes the same PCM.
//
//   node src/assets/audio/production/synth.mjs <output-dir>
//
// It writes one 48 kHz, mono, 16-bit WAV master per cue and `masters.json`
// (durations, levels and loop points). `encode.ps1` turns the masters into
// the AAC-LC `.m4a` files the game ships. See ../CREDITS.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SR = 48000;
const TAU = Math.PI * 2;

// ----- basics -----

const sec = (s) => Math.round(s * SR);
const dbToLin = (db) => 10 ** (db / 20);
const linToDb = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const zeros = (n) => new Float64Array(n);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Seeded PRNG (mulberry32): the masters are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function add(dst, src, at = 0, gain = 1) {
  for (let i = Math.max(0, -at); i < src.length; i++) {
    const j = at + i;
    if (j >= dst.length) break;
    dst[j] += src[i] * gain;
  }
}

/** Adds `src` into a loop period, wrapping around its end. */
function addWrapped(dst, src, at, gain = 1) {
  const n = dst.length;
  for (let i = 0; i < src.length; i++) dst[(((at + i) % n) + n) % n] += src[i] * gain;
}

const scale = (x, g) => x.map((v) => v * g);
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

function normalize(x, peakDb) {
  const p = peak(x);
  return p > 0 ? scale(x, dbToLin(peakDb) / p) : x;
}

function shape(x, envelope) {
  const y = zeros(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * envelope(i / SR);
  return y;
}

/** Trims to `seconds` with a raised-cosine fade in and out. */
function finish(x, seconds, fadeOutS, fadeInS = 0.001) {
  const n = sec(seconds);
  const y = zeros(n);
  const fin = sec(fadeInS);
  const fout = sec(fadeOutS);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fin) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fin);
    if (i >= n - fout) g *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (n - fout))) / fout);
    y[i] = (x[i] ?? 0) * g;
  }
  y[n - 1] = 0;
  return y;
}

const drive = (x, amount) => x.map((v) => Math.tanh(v * amount) / Math.tanh(amount));

// ----- sources -----

function white(n, rand) {
  const y = zeros(n);
  for (let i = 0; i < n; i++) y[i] = rand() * 2 - 1;
  return y;
}

/** Pink noise (Paul Kellet's filter). */
function pink(n, rand) {
  const y = zeros(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    y[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return y;
}

/** Brown noise (leaky integrator). */
function brown(n, rand) {
  const y = zeros(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s = s * 0.9985 + (rand() * 2 - 1) * 0.04;
    y[i] = s;
  }
  return y;
}

/** A sine whose frequency and amplitude follow functions of time. */
function tone(seconds, freq, amp, phase = 0) {
  const n = sec(seconds);
  const y = zeros(n);
  let ph = phase;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] = Math.sin(ph) * amp(t);
    ph += (TAU * freq(t)) / SR;
  }
  return y;
}

/**
 * A struck resonant body: decaying sine partials `{ f, a, d }` (frequency,
 * amplitude, decay time constant). `attackMs` softens the onset.
 */
function strike(partials, attackMs = 0.3) {
  const longest = partials.reduce((m, p) => Math.max(m, p.d), 0);
  const n = sec(longest * 7 + 0.005);
  const y = zeros(n);
  const attack = Math.max(1, sec(attackMs / 1000));
  for (const p of partials) {
    if (p.f >= SR * 0.45) continue;
    const w = (TAU * p.f) / SR;
    const k = Math.exp(-1 / (p.d * SR));
    let e = p.a;
    const len = Math.min(n, sec(p.d * 7));
    for (let i = 0; i < len; i++) {
      y[i] += e * Math.sin(w * i) * (i < attack ? i / attack : 1);
      e *= k;
    }
  }
  return y;
}

/** A short noise burst with an exponential decay: the contact transient. */
function click(ms, rand) {
  const n = sec((ms * 6) / 1000);
  const y = zeros(n);
  const k = Math.exp(-1 / ((ms / 1000) * SR));
  let e = 1;
  for (let i = 0; i < n; i++) {
    y[i] = (rand() * 2 - 1) * e;
    e *= k;
  }
  return y;
}

/** One air bubble: a damped sine whose pitch rises as it shrinks. */
function bubble(f0, amp, rise = 0.6) {
  const damp = 0.13 * f0 + 0.0072 * f0 ** 1.5;
  const dur = Math.min(0.25, 6 / damp);
  const attack = 0.002;
  return tone(
    dur,
    (t) => f0 * (1 + rise * damp * t * 0.08),
    (t) => amp * Math.exp(-damp * t) * Math.min(1, t / attack),
  );
}

/** A stick-slip impulse train (friction under load): the source of every creak. */
function stickSlip(seconds, rate, amp, rand, jitter = 0.25) {
  const y = zeros(sec(seconds));
  let t = 0.004;
  while (t < seconds) {
    const i = sec(t);
    const a = amp(t) * (0.55 + 0.9 * rand());
    if (i + 2 < y.length) {
      y[i] += a;
      y[i + 1] += a * 0.5;
      y[i + 2] -= a * 0.4;
    }
    t += (1 / rate(t)) * (1 + jitter * (rand() * 2 - 1));
  }
  return y;
}

// ----- filters -----

/**
 * State-variable filter (trapezoidal, stable under modulation).
 * `freq` is a number, or a function of the sample index for a moving cutoff.
 */
function svf(x, mode, freq, q = 0.707) {
  const y = zeros(x.length);
  const k = 1 / q;
  const fixed = typeof freq === "number";
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  const set = (f) => {
    const g = Math.tan((Math.PI * Math.min(Math.max(f, 10), SR * 0.45)) / SR);
    a1 = 1 / (1 + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
  };
  if (fixed) set(freq);
  let ic1 = 0;
  let ic2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (!fixed && (i & 15) === 0) set(freq(i));
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    y[i] = mode === "lp" ? v2 : mode === "bp" ? k * v1 : x[i] - k * v1 - v2;
  }
  return y;
}

const lp = (x, f, q) => svf(x, "lp", f, q);
const hp = (x, f, q) => svf(x, "hp", f, q);
const bp = (x, f, q) => svf(x, "bp", f, q);
const lp4 = (x, f) => lp(lp(x, f, 0.54), f, 1.31);

/** A bank of resonances `[frequency, Q, weight]` excited by `x`. */
function resonate(x, modes) {
  const y = zeros(x.length);
  for (const [f, q, w] of modes) add(y, bp(x, f, q), 0, w * q);
  return y;
}

/**
 * Feedback-delay-network reverb (8 lines, Householder mixing, damped).
 * Returns the wet signal only, `tail` seconds longer than the input.
 */
function reverbWet(x, { rt = 1, size = 1, damp = 5000, pre = 0.008, tail = rt * 1.3 } = {}) {
  const lengths = [1423, 1637, 1871, 2063, 2311, 2539, 2803, 3067].map((d) => Math.round(d * size));
  const lines = lengths.map((d) => zeros(d));
  const gains = lengths.map((d) => 10 ** ((-3 * d) / (rt * SR)));
  const idx = new Int32Array(8);
  const state = zeros(8);
  const c = 1 - Math.exp((-TAU * damp) / SR);
  const preN = sec(pre);
  const n = x.length + sec(tail);
  const y = zeros(n);
  const outs = zeros(8);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let l = 0; l < 8; l++) {
      outs[l] = lines[l][idx[l]];
      sum += outs[l];
    }
    const input = i - preN >= 0 && i - preN < x.length ? x[i - preN] : 0;
    const feedback = sum * 0.25;
    let out = 0;
    for (let l = 0; l < 8; l++) {
      const v = (outs[l] - feedback) * gains[l];
      state[l] += c * (v - state[l]);
      lines[l][idx[l]] = input + state[l];
      idx[l] = idx[l] + 1 === lengths[l] ? 0 : idx[l] + 1;
      out += l & 1 ? -outs[l] : outs[l];
    }
    y[i] = out * 0.3;
  }
  return hp(y, 110);
}

/** Dry plus `mix` × wet, with the reverb tail kept. */
function withReverb(x, mix, options) {
  const wet = reverbWet(x, options);
  const y = zeros(wet.length);
  add(y, x);
  add(y, wet, 0, mix);
  return y;
}

/** Reverb for a loop period: the tail wraps, so the result is exactly periodic. */
function withReverbPeriodic(x, mix, options) {
  const n = x.length;
  const tiled = zeros(n * 2);
  tiled.set(x, 0);
  tiled.set(x, n);
  const wet = reverbWet(tiled, { ...options, tail: 0 });
  const y = zeros(n);
  for (let i = 0; i < n; i++) y[i] = x[i] + wet[n + i] * mix;
  return y;
}

/** Makes `x` (period + overlap long) a seamless period with an equal-power crossfade. */
function loopify(x, n) {
  const f = x.length - n;
  const y = x.slice(0, n);
  for (let i = 0; i < f; i++) {
    const t = (Math.PI / 2) * (i / f);
    y[i] = x[i] * Math.sin(t) + x[n + i] * Math.cos(t);
  }
  return y;
}

// ----- shared materials: one sonic world -----

/** D major pentatonic: every tuned element of the game shares it. */
const NOTE = {
  D2: 73.42,
  D3: 146.83,
  A3: 220,
  D4: 293.66,
  Fs4: 369.99,
  A4: 440,
  D5: 587.33,
  E5: 659.26,
  Fs5: 739.99,
  A5: 880,
  B5: 987.77,
  D6: 1174.66,
  E6: 1318.51,
  Fs6: 1479.98,
  A6: 1760,
  B6: 1975.53,
  D7: 2349.32,
  E7: 2637.02,
  Fs7: 2959.96,
  A7: 3520,
  B7: 3951.07,
  D8: 4698.64,
};
const SPARKLE = [
  NOTE.D6,
  NOTE.E6,
  NOTE.Fs6,
  NOTE.A6,
  NOTE.B6,
  NOTE.D7,
  NOTE.E7,
  NOTE.Fs7,
  NOTE.A7,
  NOTE.B7,
  NOTE.D8,
];

/** A small bell: the reward voice (chime, stinger, shimmer). */
const bell = (f, amp = 1, decay = 0.45, attackMs = 3) =>
  strike(
    [
      { f, a: amp, d: decay },
      { f: f * 2.0, a: amp * 0.1, d: decay * 0.55 },
      { f: f * 2.76, a: amp * 0.28, d: decay * 0.45 },
      { f: f * 5.4, a: amp * 0.1, d: decay * 0.2 },
    ],
    attackMs,
  );

/** One chain link's resonances; a chain is a fixed set of links. */
function linkProfile(rand) {
  const f0 = 620 + rand() * 1500;
  const ratios = [
    1,
    1.47 + rand() * 0.3,
    2.3 + rand() * 0.5,
    3.4 + rand() * 0.7,
    4.9 + rand() * 1.0,
    6.8 + rand() * 1.2,
  ];
  return ratios.map((ratio, i) => ({
    f: f0 * ratio,
    a: (0.5 + rand() * 0.5) / (1 + i * 0.45),
    d: Math.max(0.008, (0.05 - 0.006 * i) * (0.6 + rand() * 0.8)),
  }));
}

const CHAIN_LINKS = (() => {
  const rand = rng(7001);
  return Array.from({ length: 10 }, () => linkProfile(rand));
})();

/** One link striking its neighbor. */
function clank(rand, bright = 1) {
  const profile = CHAIN_LINKS[Math.floor(rand() * CHAIN_LINKS.length)];
  const detune = 0.97 + rand() * 0.06;
  const y = strike(
    profile.map((p) => ({ ...p, f: p.f * detune })),
    0.25,
  );
  add(y, bp(click(1.6, rand), 3200, 0.8), 0, 0.45 * bright);
  return y;
}

/** One coin landing on others. */
function coin(f0, rand, amp = 1) {
  const y = strike(
    [
      { f: f0, a: amp, d: 0.15 * (0.7 + 0.6 * rand()) },
      { f: f0 * (1.52 + 0.1 * rand()), a: amp * 0.65, d: 0.11 * (0.7 + 0.6 * rand()) },
      { f: f0 * (2.21 + 0.15 * rand()), a: amp * 0.4, d: 0.08 },
      { f: f0 * (2.93 + 0.2 * rand()), a: amp * 0.25, d: 0.055 },
      { f: f0 * 3.9, a: amp * 0.12, d: 0.035 },
    ],
    0.2,
  );
  add(y, bp(click(1.2, rand), 5200, 0.9), 0, 0.3 * amp);
  return y;
}

// ----- one-shots -----

function betClink(variant) {
  const rand = rng(variant === 1 ? 1101 : 1102);
  const out = zeros(sec(0.4));
  const base = variant === 1 ? 1180 : 1420;
  const ratios = variant === 1 ? [1, 2.31, 3.82, 5.47, 7.1] : [1, 2.14, 3.57, 5.21, 6.6];
  const amps = [1, 0.55, 0.32, 0.16, 0.08];
  const decays = [0.085, 0.06, 0.04, 0.025, 0.015];
  const hit = (at, gain, detune) => {
    add(
      out,
      strike(ratios.map((r, i) => ({ f: base * r * detune, a: amps[i], d: decays[i] }))),
      at,
      gain,
    );
    add(out, bp(click(1.5, rand), 2600, 1.1), at, 0.5 * gain);
    add(out, strike([{ f: variant === 1 ? 210 : 250, a: 0.5, d: 0.03 }], 1), at, gain);
  };
  hit(sec(0.004), 1, 1);
  // The second slot answers with a softer double tap, so the two bets stay distinct.
  if (variant === 2) hit(sec(0.066), 0.5, 1.06);
  const y = withReverb(lp(out, 6500), 0.12, { rt: 0.25, damp: 4500 });
  return finish(y, variant === 1 ? 0.3 : 0.36, 0.08);
}

function chainUnspool() {
  const rand = rng(1201);
  const dur = 1.25;
  const out = zeros(sec(dur));
  const level = (t) => smooth(t / 0.12) * (1 - smooth((t - 0.72) / 0.42));
  let t = 0.015;
  while (t < 1.1) {
    add(out, clank(rand), sec(t), level(t) * (0.45 + 0.55 * rand()));
    t += lerp(0.085, 0.032, smooth(t / 0.5)) * (0.7 + 0.6 * rand());
  }
  // The winch turning: a low, even mechanical movement under the links.
  const winch = shape(bp(white(sec(dur), rand), 160, 1.2), (s) => {
    return level(s) * (1 + 0.6 * Math.sin(TAU * 24 * s)) * 0.5;
  });
  add(out, winch);
  add(
    out,
    shape(bp(white(sec(dur), rand), 2400, 0.9), (s) => level(s) * 0.06),
  );
  const y = withReverb(lp(out, 8000), 0.15, { rt: 0.35, damp: 5000 });
  return finish(y, dur, 0.2);
}

function waterSplash() {
  // V3 option A: the anchor is already under water. This is a disturbance at
  // the hawse hole and the waterline, heard from just below the surface.
  const rand = rng(1301);
  const dur = 1.0;
  const n = sec(dur);
  const out = zeros(n);
  const surge = svf(pink(n, rand), "lp", (i) => lerp(2800, 600, smooth(i / (0.7 * SR))), 0.8);
  add(
    out,
    shape(
      hp(surge, 180),
      (t) => Math.sin((Math.PI / 2) * clamp01(t / 0.045)) ** 2 * Math.exp(-t / 0.22),
    ),
    0,
    5,
  );
  const grain = lp(
    white(n, rand).map((v) => Math.abs(v)),
    35,
  );
  const fizz = lp(hp(white(n, rand), 2500), 6000);
  add(
    out,
    fizz.map((v, i) => v * grain[i] * 2 * smooth(i / (0.08 * SR)) * Math.exp(-i / (0.3 * SR))),
    0,
    0.35,
  );
  for (let b = 0; b < 16; b++) {
    const at = 0.04 + 0.7 * rand() ** 1.6;
    add(out, bubble(350 + 1150 * rand(), 0.12 + 0.2 * rand()), sec(at));
  }
  add(
    out,
    tone(
      0.2,
      (t) => lerp(150, 95, t / 0.2),
      (t) => 0.45 * Math.min(1, t / 0.01) * Math.exp(-t / 0.07),
    ),
    sec(0.02),
  );
  const y = withReverb(lp(out, 5000), 0.15, { rt: 0.5, damp: 3500 });
  return finish(y, dur, 0.3, 0.004);
}

function tensionCreak(variant) {
  const rand = rng(variant === 1 ? 1401 : 1402);
  const dur = variant === 1 ? 0.85 : 0.88;
  const swell = (t) => Math.sin(Math.PI * clamp01(t / (dur * 0.95))) ** 0.8;
  const train =
    variant === 1
      ? stickSlip(dur, (t) => lerp(28, 46, smooth(t / dur)), swell, rand, 0.22)
      : stickSlip(
          dur,
          (t) => lerp(40, 96, (t / dur) ** 2),
          (t) => swell(t) * lerp(0.6, 1, t / dur),
          rand,
          0.18,
        );
  const modes =
    variant === 1
      ? [
          [118, 40, 1],
          [196, 45, 0.9],
          [283, 35, 0.8],
          [431, 30, 0.6],
          [655, 22, 0.35],
          [1040, 15, 0.15],
        ]
      : [
          [173, 40, 1],
          [312, 40, 0.9],
          [498, 35, 0.75],
          [771, 28, 0.5],
          [1210, 20, 0.3],
          [1890, 12, 0.12],
        ];
  const out = resonate(train, modes);
  const groan = variant === 1 ? 59 : 86.5;
  for (const [harmonic, share] of [
    [1, 0.1],
    [2, 0.07],
  ]) {
    add(
      out,
      tone(dur, () => groan * harmonic, swell),
      0,
      peak(out) * share,
    );
  }
  add(
    out,
    shape(bp(white(sec(dur), rand), 500, 1), (t) => swell(t)),
    0,
    peak(out) * 0.05,
  );
  if (variant === 2) {
    // The strain peaks in a small metallic tick: the chain is close to its limit.
    const ping = strike([
      { f: 1630, a: 1, d: 0.07 },
      { f: 2590, a: 0.6, d: 0.05 },
      { f: 3810, a: 0.3, d: 0.03 },
    ]);
    add(out, ping, sec(0.68), peak(out) * 0.35);
  }
  const y = withReverb(lp(out, variant === 1 ? 3200 : 4200), 0.3, {
    rt: 1.0,
    damp: 2500,
    size: 1.3,
  });
  return finish(y, dur + 0.05, 0.25, 0.006);
}

function goldfishChime() {
  const out = zeros(sec(1.0));
  add(out, bubble(720, 0.1), sec(0.002));
  add(out, bell(NOTE.E6, 0.8, 0.4), sec(0.01));
  add(out, bell(NOTE.A6, 0.7, 0.42), sec(0.092));
  add(out, bell(NOTE.E7, 0.28, 0.3), sec(0.176));
  const y = withReverb(lp(out, 9000), 0.25, { rt: 0.9, damp: 6000 });
  return finish(y, 0.95, 0.35);
}

function cashoutCoins() {
  const rand = rng(1601);
  const out = zeros(sec(1.4));
  const pitches = [NOTE.D7, NOTE.Fs7, NOTE.E7, NOTE.A7, NOTE.Fs7, NOTE.B7, NOTE.A7, NOTE.D8];
  const times = [0.008, 0.07, 0.128, 0.19, 0.247, 0.318, 0.398, 0.492];
  pitches.forEach((f, i) => {
    const at = times[i] + (rand() - 0.5) * 0.012;
    add(
      out,
      coin(f * (0.99 + 0.02 * rand()), rand),
      sec(Math.max(0.004, at)),
      lerp(0.9, 0.6, i / 7),
    );
  });
  add(out, strike([{ f: 190, a: 0.35, d: 0.05 }], 1.5), sec(0.004));
  // A soft dyad settles the cascade: the win is confirmed, calmly.
  add(out, bell(NOTE.D6, 0.42, 0.5, 6), sec(0.42));
  add(out, bell(NOTE.A6, 0.3, 0.5, 6), sec(0.42));
  const y = withReverb(lp(out, 10000), 0.2, { rt: 0.8, damp: 6000 });
  return finish(y, 1.35, 0.4);
}

function chainSnap() {
  const rand = rng(1701);
  const out = zeros(sec(0.5));
  const fracture = (at, gain, detune) => {
    add(out, hp(click(2.2, rand), 1500), at, 0.9 * gain);
    add(
      out,
      strike([
        { f: 2140 * detune, a: 1, d: 0.11 },
        { f: 3390 * detune, a: 0.8, d: 0.08 },
        { f: 5270 * detune, a: 0.5, d: 0.05 },
        { f: 7400 * detune, a: 0.3, d: 0.03 },
        { f: 1290 * detune, a: 0.6, d: 0.14 },
      ]),
      at,
      gain,
    );
  };
  fracture(sec(0.003), 1, 1);
  fracture(sec(0.021), 0.45, 1.19);
  // The tension leaving the chain: a fast downward twang and a low thunk.
  add(
    out,
    tone(
      0.3,
      (t) => 240 + 700 * Math.exp(-t / 0.035),
      (t) => 0.75 * Math.min(1, t / 0.002) * Math.exp(-t / 0.07),
    ),
    sec(0.003),
  );
  add(out, strike([{ f: 95, a: 0.8, d: 0.06 }], 2), sec(0.003));
  const y = withReverb(drive(lp(normalize(out, -3), 9000), 1.4), 0.15, { rt: 0.45, damp: 4000 });
  return finish(y, 0.45, 0.15, 0.0005);
}

function crashBoom() {
  const rand = rng(1801);
  const n = sec(1.6);
  const out = zeros(n);
  const sub = tone(
    1.6,
    (t) => 34 + 44 * Math.exp(-t / 0.18),
    (t) => Math.min(1, t / 0.008) * Math.exp(-t / 0.55),
  );
  add(out, drive(sub, 2.2), 0, 0.8);
  // The body of the impact, between 100 and 450 Hz: what a small speaker carries.
  const body = tone(
    1.2,
    (t) => 78 + 150 * Math.exp(-t / 0.09),
    (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.3),
  );
  add(out, drive(body, 2.5), 0, 0.75);
  add(
    out,
    shape(lp4(white(n, rand), 450), (t) => Math.min(1, t / 0.005) * Math.exp(-t / 0.3)),
    0,
    7,
  );
  const wave = svf(pink(n, rand), "lp", (i) => lerp(900, 200, smooth(i / (1.2 * SR))), 0.9);
  add(
    out,
    shape(hp(wave, 80), (t) => smooth(t / 0.06) * Math.exp(-t / 0.5)),
    0,
    5,
  );
  for (let b = 0; b < 18; b++) {
    add(out, bubble(120 + 300 * rand(), 0.12 + 0.16 * rand(), 0.3), sec(0.1 + 1.1 * rand() ** 1.4));
  }
  const y = withReverb(lp(out, 1800), 0.5, { rt: 2.4, damp: 1400, size: 1.6, tail: 1.0 });
  return finish(y, 2.3, 0.9, 0.002);
}

function floorThud() {
  const rand = rng(1901);
  const n = sec(0.8);
  const out = zeros(n);
  const body = tone(
    0.8,
    (t) => 48 + 50 * Math.exp(-t / 0.05),
    (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.16),
  );
  add(out, drive(body, 1.6), 0, 0.8);
  const knock = tone(
    0.5,
    (t) => 105 + 120 * Math.exp(-t / 0.04),
    (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.12),
  );
  add(out, drive(knock, 2), 0, 0.6);
  const sand = svf(pink(n, rand), "lp", (i) => lerp(1500, 400, smooth(i / (0.4 * SR))), 0.7);
  add(
    out,
    shape(hp(sand, 150), (t) => smooth(t / 0.025) * Math.exp(-t / 0.2)),
    0,
    4,
  );
  add(
    out,
    strike(
      [
        { f: 310, a: 0.5, d: 0.06 },
        { f: 505, a: 0.35, d: 0.045 },
        { f: 790, a: 0.2, d: 0.03 },
      ],
      1.5,
    ),
    sec(0.004),
  );
  const y = withReverb(lp(out, 2600), 0.25, { rt: 0.7, damp: 1800, size: 1.2 });
  return finish(y, 0.85, 0.3, 0.002);
}

function jackpotStinger() {
  const rand = rng(2001);
  const dur = 3.5;
  const n = sec(dur);
  const out = zeros(n);
  // A warm D add9 swell: the discovery opens, it does not shout.
  const pad = zeros(n);
  const chord = [NOTE.D3, NOTE.A3, NOTE.D4, NOTE.Fs4, NOTE.A4, NOTE.E5];
  chord.forEach((f, c) => {
    for (const cents of [-4, 4]) {
      const fd = f * 2 ** (cents / 1200);
      for (let h = 1; h <= 8; h++) {
        const w = (TAU * fd * h) / SR;
        const a = 1 / h ** 1.5 / (1 + c * 0.25);
        const phase = rand() * TAU;
        for (let i = 0; i < n; i++) pad[i] += a * Math.sin(w * i + phase);
      }
    }
  });
  const padEnv = (t) =>
    Math.sin((Math.PI / 2) * clamp01((t - 0.04) / 0.32)) ** 2 *
    (t < 1.5 ? 1 : Math.exp(-(t - 1.5) / 0.6));
  const padFiltered = svf(
    shape(pad, padEnv),
    "lp",
    (i) => {
      const t = i / SR;
      return t < 0.9 ? lerp(600, 3200, smooth(t / 0.9)) : lerp(3200, 900, smooth((t - 0.9) / 2));
    },
    0.9,
  );
  add(out, padFiltered, 0, 0.19);
  // A rising run of bells over the chord.
  const run = [NOTE.D5, NOTE.Fs5, NOTE.A5, NOTE.D6, NOTE.Fs6, NOTE.A6, NOTE.D7];
  run.forEach((f, i) => {
    add(out, bell(f, i === run.length - 1 ? 0.75 : 0.5 + 0.03 * i, 0.9, 4), sec(0.14 + 0.082 * i));
  });
  // The weight underneath: a low D and a soft bloom of water.
  const low = tone(
    1.4,
    (t) => NOTE.D2 + 16 * Math.exp(-t / 0.05),
    (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.6),
  );
  add(out, drive(low, 1.8), sec(0.02), 0.7);
  add(
    out,
    shape(lp(pink(sec(1), rand), 1200), (t) => smooth(t / 0.1) * Math.exp(-t / 0.3)),
    sec(0.02),
    0.9,
  );
  for (let g = 0; g < 26; g++) {
    const at = 0.7 + 1.6 * rand();
    const f = SPARKLE[5 + Math.floor(rand() * 6)];
    add(out, bell(f, 0.05 + 0.05 * rand(), 0.2, 2), sec(at));
  }
  const y = withReverb(out, 0.35, { rt: 2.0, damp: 5500, size: 1.4, tail: 0.2 });
  return finish(y, dur, 0.8, 0.004);
}

function treasureShimmer() {
  const rand = rng(2101);
  const dur = 1.7;
  const n = sec(dur);
  const out = zeros(n);
  const arc = (t) => Math.sin(Math.PI * clamp01(t / 1.35)) ** 1.3;
  for (let g = 0; g < 46; g++) {
    const t = 0.02 + 1.25 * rand();
    const index = Math.floor(clamp01(t / 1.3 + (rand() - 0.5) * 0.7) * (SPARKLE.length - 1));
    const f = SPARKLE[index];
    const grain = strike(
      [
        { f, a: 1, d: 0.16 + 0.14 * rand() },
        { f: f * 2.76, a: 0.2, d: 0.07 },
      ],
      2,
    );
    add(out, grain, sec(t), arc(t) * (0.4 + 0.6 * rand()));
  }
  add(
    out,
    shape(lp(hp(white(n, rand), 5000), 9000), (t) => arc(t)),
    0,
    0.12,
  );
  const y = withReverb(out, 0.4, { rt: 1.4, damp: 7000, size: 1.2, tail: 0.3 });
  return finish(y, dur, 0.5, 0.01);
}

function chestLidCreak() {
  const rand = rng(2201);
  const dur = 0.85;
  const env = (t) => smooth(t / 0.08) * (1 - 0.5 * smooth((t - 0.45) / 0.2)) * (t < 0.64 ? 1 : 0);
  const train = stickSlip(dur, (t) => lerp(38, 112, clamp01(t / 0.62) ** 1.6), env, rand, 0.2);
  // Old, dense wood: broad, short resonances, and a faint hinge above them.
  const out = resonate(train, [
    [340, 16, 1],
    [610, 20, 0.9],
    [1120, 20, 0.7],
    [1850, 16, 0.4],
    [2700, 12, 0.25],
  ]);
  add(out, bp(train, 2900, 25), 0, 25 * 0.12);
  const level = peak(out);
  // The lid meets its stop.
  const knock = strike(
    [
      { f: 170, a: 1, d: 0.05 },
      { f: 410, a: 0.6, d: 0.03 },
      { f: 820, a: 0.3, d: 0.015 },
    ],
    0.8,
  );
  add(out, knock, sec(0.66), level * 0.22);
  add(out, lp(click(2, rand), 1800), sec(0.66), level * 0.15);
  const y = withReverb(lp(out, 6000), 0.15, { rt: 0.4, damp: 3500 });
  return finish(y, dur, 0.1, 0.004);
}

function chestCoinBurst() {
  const rand = rng(2301);
  const dur = 1.6;
  const out = zeros(sec(dur));
  add(
    out,
    tone(
      0.4,
      (t) => 60 + 50 * Math.exp(-t / 0.06),
      (t) => 0.5 * Math.min(1, t / 0.006) * Math.exp(-t / 0.11),
    ),
    sec(0.1),
  );
  for (let c = 0; c < 36; c++) {
    const at = 0.11 + 1.1 * rand() ** 1.9;
    const tuned = rand() < 0.35;
    const f = tuned ? SPARKLE[5 + Math.floor(rand() * 6)] : 2600 + 2900 * rand();
    add(out, coin(f, rand), sec(at), (0.35 + 0.65 * rand()) * lerp(1, 0.55, (at - 0.11) / 1.1));
  }
  // The treasure catches the light: a quick rising sparkle through the coins.
  [NOTE.D6, NOTE.Fs6, NOTE.A6, NOTE.B6, NOTE.D7, NOTE.Fs7, NOTE.A7, NOTE.D8].forEach((f, i) => {
    add(out, bell(f, 0.22, 0.3, 2), sec(0.15 + 0.055 * i));
  });
  const y = withReverb(lp(out, 11000), 0.22, { rt: 0.9, damp: 6500 });
  return finish(y, dur, 0.5, 0.004);
}

// ----- loops -----

/**
 * A loop file: the seamless period with `margin` seconds of the same periodic
 * signal before and after it. Any window one period long therefore loops
 * without a seam, whatever delay or padding an AAC decoder adds.
 */
function loopFile(period, margin = 0.15) {
  const n = period.length;
  const m = sec(margin);
  const y = zeros(n + 2 * m);
  for (let i = 0; i < y.length; i++) y[i] = period[(((i - m) % n) + n) % n];
  const fade = sec(0.004);
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    y[i] *= g;
    y[y.length - 1 - i] *= g;
  }
  return { samples: y, loopStart: margin, loopEnd: margin + n / SR };
}

function chainRattle() {
  const rand = rng(3001);
  const seconds = 4.8;
  const n = sec(seconds);
  const period = zeros(n);
  // Links passing the hawse hole: an uneven run, never a fixed rhythm, with no
  // strong pitch, so the director's 0.85–1.5 rate change reads as chain speed.
  let t = 0;
  while (t < seconds - 0.02) {
    const accent = rand() < 0.14 ? 1 : 0.35 + 0.45 * rand();
    addWrapped(period, clank(rand, 0.8), sec(t), accent);
    t += 0.056 * (0.55 + 0.9 * rand());
  }
  const overlap = sec(0.4);
  const motion = (i) => {
    const p = (TAU * i) / n;
    return (
      0.6 + 0.2 * Math.sin(3 * p + 0.4) + 0.12 * Math.sin(7 * p + 1.9) + 0.08 * Math.sin(11 * p)
    );
  };
  const friction = bp(white(n + overlap, rand), 2200, 0.8).map((v, i) => v * motion(i));
  const thrum = bp(white(n + overlap, rand), 180, 1.1).map((v, i) => v * motion(i + n / 3));
  const level = peak(period);
  add(period, loopify(friction, n), 0, level * 0.07);
  add(period, loopify(thrum, n), 0, level * 0.4);
  const tiled = zeros(n * 2);
  tiled.set(period, 0);
  tiled.set(period, n);
  const filtered = lp(tiled, 7500).slice(n);
  return loopFile(withReverbPeriodic(filtered, 0.14, { rt: 0.5, damp: 4500 }));
}

/** A slow, wooden or metallic groan of a hull under load. */
function hullGroan(rand, seconds, lowHz) {
  const swell = (t) => Math.sin(Math.PI * clamp01(t / seconds)) ** 1.2;
  const train = stickSlip(seconds, (t) => lerp(17, 29, smooth(t / seconds)), swell, rand, 0.3);
  return resonate(train, [
    [lowHz, 18, 1],
    [lowHz * 1.86, 16, 0.8],
    [lowHz * 2.93, 14, 0.5],
    [lowHz * 4.6, 10, 0.25],
  ]);
}

function ambienceSurface() {
  const rand = rng(4001);
  const seconds = 24;
  const n = sec(seconds);
  const period = zeros(n);
  // The open sea: a steady, soft wash.
  const overlap = sec(2);
  const wash = hp(lp(pink(n + overlap, rand), 1800), 120);
  add(period, loopify(wash, n), 0, 0.28);
  // Swells: each rises, opens, and draws back.
  for (let w = 0; w < 7; w++) {
    const at = (w * seconds) / 7 + (rand() - 0.5) * 1.2;
    const len = 5 + rand() * 1.2;
    const m = sec(len);
    const top = 2000 + 900 * rand();
    const body = svf(
      pink(m, rand),
      "lp",
      (i) => {
        const p = i / m;
        return p < 0.35
          ? lerp(500, top, smooth(p / 0.35))
          : lerp(top, 650, smooth((p - 0.35) / 0.65));
      },
      0.8,
    );
    const env = (t) => {
      const p = t / len;
      return p < 0.36
        ? Math.sin((Math.PI / 2) * (p / 0.36)) ** 2
        : Math.cos((Math.PI / 2) * ((p - 0.36) / 0.64)) ** 2;
    };
    addWrapped(period, shape(hp(body, 150), env), sec(at), 1.5 * (0.7 + 0.3 * rand()));
    const foam = shape(lp(hp(white(m, rand), 3000), 7500), (t) => {
      const p = t / len;
      return smooth((p - 0.25) / 0.15) * Math.exp(-Math.max(0, p - 0.4) / 0.2);
    });
    addWrapped(period, foam, sec(at), 0.05);
  }
  // Water lapping at the hull.
  for (let l = 0; l < 22; l++) {
    const at = rand() * seconds;
    const slap = shape(bp(white(sec(0.16), rand), 520 + 420 * rand(), 1.4), (t) => {
      return smooth(t / 0.015) * Math.exp(-t / 0.04);
    });
    const gain = 0.12 + 0.14 * rand();
    addWrapped(period, slap, sec(at), gain * 1.6);
    const count = 1 + Math.floor(rand() * 3);
    for (let b = 0; b < count; b++) {
      addWrapped(period, bubble(500 + 900 * rand(), gain * 0.5), sec(at + 0.03 + 0.12 * rand()));
    }
  }
  // The vessel, restrained: two hull groans and two faint movements of the chain.
  const level = rms(period);
  for (const [at, hz] of [
    [6.4, 142],
    [17.9, 128],
  ]) {
    const groan = lp(hullGroan(rand, 1.3, hz), 1400);
    addWrapped(period, normalize(groan, 0), sec(at), level * 1.1);
  }
  for (const at of [12.3, 21.1]) {
    const ting = withReverb(lp(clank(rand, 0.5), 4500), 0.3, { rt: 0.6, damp: 3500 });
    addWrapped(period, normalize(ting, 0), sec(at), level * 0.7);
    addWrapped(period, normalize(ting, 0), sec(at + 0.19), level * 0.35);
  }
  return loopFile(withReverbPeriodic(period, 0.1, { rt: 0.8, damp: 5000 }));
}

function ambienceUnderwater() {
  const rand = rng(5001);
  const seconds = 24;
  const n = sec(seconds);
  const overlap = sec(2);
  const total = n + overlap;
  const period = zeros(n);
  const cycle = (i, turns, phase = 0) => Math.sin((TAU * turns * i) / n + phase);
  // The weight of the water: a deep, slowly breathing rumble. The soft
  // saturation adds harmonics at 100–300 Hz, so a phone speaker still carries it.
  const deep = hp(lp4(brown(total, rand), 230), 55).map((v, i) => {
    return v * (1 + 0.3 * cycle(i, 2) + 0.15 * cycle(i, 3, 1.3));
  });
  add(period, loopify(drive(normalize(deep, -6), 1.8), n), 0, 0.8);
  // Pressure: a band of moving water between 150 and 500 Hz.
  const mid = svf(
    bp(pink(total, rand), 280, 0.7),
    "lp",
    (i) => 385 + 135 * cycle(i, 5, 0.7),
    0.9,
  ).map((v, i) => v * (1 + 0.25 * cycle(i, 4, 2.1)));
  add(period, loopify(normalize(mid, -6), n), 0, 1.3);
  // A thin layer of upper water, so the bed still lives when the filter is open.
  const upper = hp(lp(pink(total, rand), 2400), 600).map(
    (v, i) => v * (1 + 0.3 * cycle(i, 3, 0.2)),
  );
  add(period, loopify(normalize(upper, -6), n), 0, 0.2);
  // Currents passing.
  for (let c = 0; c < 4; c++) {
    const len = 5.5;
    const m = sec(len);
    const centre = 320 + 420 * rand();
    const body = bp(pink(m, rand), centre, 1.2);
    const env = (t) => Math.sin(Math.PI * clamp01(t / len)) ** 2;
    addWrapped(period, normalize(shape(body, env), -6), sec(c * 6 + rand() * 3), 0.2);
  }
  // Distant resonance: slow, low tones far away, and one remote groan of metal.
  const far = { rt: 4.5, damp: 1200, size: 1.8, tail: 5 };
  for (const [at, hz, fall] of [
    [2.5, 98, 0.94],
    [10.2, 146.8, 0.955],
    [17.6, 73.4, 0.96],
  ]) {
    const len = 3.6;
    const env = (t) => Math.sin(Math.PI * clamp01(t / len)) ** 1.6;
    const moan = zeros(sec(len));
    [1, 2, 3, 4].forEach((h, k) => {
      add(
        moan,
        tone(
          len,
          (t) => hz * h * lerp(1, fall, t / len),
          (t) => env(t) / (k + 1) ** 1.3,
        ),
      );
    });
    addWrapped(period, normalize(reverbWet(moan, far), -6), sec(at), 0.28);
  }
  const groan = reverbWet(lp(hullGroan(rand, 1.8, 176), 900), far);
  addWrapped(period, normalize(groan, -6), sec(21.3), 0.16);
  // Subtle movement: a few bubbles rising somewhere in the dark.
  for (let b = 0; b < 16; b++) {
    const blip = reverbWet(bubble(300 + 650 * rand(), 1), { rt: 1.5, damp: 2500, size: 1.4 });
    addWrapped(period, normalize(blip, -6), sec(rand() * seconds), 0.05 + 0.05 * rand());
  }
  return loopFile(withReverbPeriodic(period, 0.2, { rt: 2.5, damp: 1800, size: 1.6 }));
}

// ----- measurement and output -----

/** Loudness in LUFS (ITU-R BS.1770 K-weighting at 48 kHz, ungated). */
function loudness(x) {
  const stage = (input, b, a) => {
    const y = zeros(input.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < input.length; i++) {
      const v = b[0] * input[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1;
      x1 = input[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    return y;
  };
  const shelved = stage(
    x,
    [1.53512485958697, -2.69169618940638, 1.19839281085285],
    [-1.69065929318241, 0.73248077421585],
  );
  const weighted = stage(shelved, [1, -2, 1], [-1.99004745483398, 0.99007225036621]);
  const ms = weighted.reduce((s, v) => s + v * v, 0) / weighted.length;
  return -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));
}

function wav(samples) {
  const rand = rng(9001);
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    // TPDF dither, except on digital silence, so fades end at exactly zero.
    const dither = samples[i] === 0 ? 0 : rand() - rand();
    const v = Math.round(samples[i] * 32767 + dither);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, v)), 44 + i * 2);
  }
  return data;
}

/** Master peak in dBFS. The AAC encoder adds overshoot; −1 dBFS is checked on the decoded files. */
const ONE_SHOT_PEAK_DB = -2.5;
const LOOP_PEAK_DB = { "chain-rattle": -3, "ambience-surface": -7, "ambience-underwater": -7 };

/**
 * Silence before every one-shot. The Windows AAC encoder mutes roughly the
 * first 9 ms of a stream and fades in (measured on the decoded files), which
 * would cut a transient that starts at once. 12 ms keeps every attack intact.
 */
const ONE_SHOT_LEAD_S = 0.012;

function withLead(samples) {
  const lead = sec(ONE_SHOT_LEAD_S);
  const y = zeros(samples.length + lead);
  y.set(samples, lead);
  return y;
}

export const CUES = {
  "bet-clink-1": () => betClink(1),
  "bet-clink-2": () => betClink(2),
  "chain-unspool": chainUnspool,
  "water-splash": waterSplash,
  "tension-creak-1": () => tensionCreak(1),
  "tension-creak-2": () => tensionCreak(2),
  "goldfish-chime": goldfishChime,
  "cashout-coins": cashoutCoins,
  "chain-snap": chainSnap,
  "crash-boom": crashBoom,
  "floor-thud": floorThud,
  "jackpot-stinger": jackpotStinger,
  "treasure-shimmer": treasureShimmer,
  "chest-lid-creak": chestLidCreak,
  "chest-coin-burst": chestCoinBurst,
  "chain-rattle": chainRattle,
  "ambience-surface": ambienceSurface,
  "ambience-underwater": ambienceUnderwater,
};

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: node synth.mjs <output-dir>");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const report = {};
  for (const [id, render] of Object.entries(CUES)) {
    const result = render();
    const loop = result instanceof Float64Array ? null : result;
    const raw = loop ? loop.samples : withLead(result);
    const samples = normalize(raw, loop ? LOOP_PEAK_DB[id] : ONE_SHOT_PEAK_DB);
    writeFileSync(join(outDir, `${id}.wav`), wav(samples));
    report[id] = {
      seconds: +(samples.length / SR).toFixed(4),
      samples: samples.length,
      peakDb: +linToDb(peak(samples)).toFixed(2),
      rmsDb: +linToDb(rms(samples)).toFixed(2),
      lufs: +loudness(samples).toFixed(2),
      ...(loop ? { loopStart: loop.loopStart, loopEnd: loop.loopEnd } : {}),
    };
    console.log(id.padEnd(22), JSON.stringify(report[id]));
  }
  writeFileSync(join(outDir, "masters.json"), JSON.stringify(report, null, 2) + "\n");
}

main();
