// Shared DSP for the harness. All signals are arrays of Float32Array channels.
export const log = (m) => fetch("/log", { method: "POST", body: String(m) });
export const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
export const r1 = (x, d = 1) => (Number.isFinite(x) ? +x.toFixed(d) : x);

let ctx;
export async function decode(url) {
  ctx ??= new AudioContext({ sampleRate: 48000 });
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch " + url + " " + res.status);
  const ab = await res.arrayBuffer();
  const b = await ctx.decodeAudioData(ab);
  const ch = [];
  for (let c = 0; c < b.numberOfChannels; c++) ch.push(new Float32Array(b.getChannelData(c)));
  return { sr: b.sampleRate, ch, bytes: ab.byteLength };
}

// RBJ biquad, direct form I, in place on a copy.
export function biquad(x, k) {
  const y = new Float32Array(x.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  const { b0, b1, b2, a1, a2 } = k;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
function norm(b0, b1, b2, a0, a1, a2) {
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
export function hp(fs, fc, Q = Math.SQRT1_2) {
  const w = (2 * Math.PI * fc) / fs,
    c = Math.cos(w),
    al = Math.sin(w) / (2 * Q);
  return norm((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
}
export function lp(fs, fc, Q = Math.SQRT1_2) {
  const w = (2 * Math.PI * fc) / fs,
    c = Math.cos(w),
    al = Math.sin(w) / (2 * Q);
  return norm((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
}
export function peaking(fs, fc, gainDb, Q) {
  const A = 10 ** (gainDb / 40),
    w = (2 * Math.PI * fc) / fs,
    c = Math.cos(w),
    al = Math.sin(w) / (2 * Q);
  return norm(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
}
export function highShelf(fs, fc, gainDb, Q = Math.SQRT1_2) {
  const A = 10 ** (gainDb / 40),
    w = (2 * Math.PI * fc) / fs,
    c = Math.cos(w),
    al = Math.sin(w) / (2 * Q),
    s = 2 * Math.sqrt(A) * al;
  return norm(
    A * (A + 1 + (A - 1) * c + s),
    -2 * A * (A - 1 + (A + 1) * c),
    A * (A + 1 + (A - 1) * c - s),
    A + 1 - (A - 1) * c + s,
    2 * (A - 1 - (A + 1) * c),
    A + 1 - (A - 1) * c - s,
  );
}
export function lowShelf(fs, fc, gainDb, Q = Math.SQRT1_2) {
  const A = 10 ** (gainDb / 40),
    w = (2 * Math.PI * fc) / fs,
    c = Math.cos(w),
    al = Math.sin(w) / (2 * Q),
    s = 2 * Math.sqrt(A) * al;
  return norm(
    A * (A + 1 - (A - 1) * c + s),
    2 * A * (A - 1 - (A + 1) * c),
    A * (A + 1 - (A - 1) * c - s),
    A + 1 + (A - 1) * c + s,
    -2 * (A - 1 + (A + 1) * c),
    A + 1 + (A - 1) * c - s,
  );
}
export const chain = (x, ...ks) => ks.reduce((s, k) => biquad(s, k), x);
export const mapCh = (sig, f) => ({ ...sig, ch: sig.ch.map(f) });

// ITU-R BS.1770-4 integrated loudness (pyloudnorm coefficients).
export function lufs(sig) {
  const { sr } = sig;
  const shelf = highShelf(sr, 1681.974450955533, 3.999843853973347, 0.7071752369554196);
  const hpk = hp(sr, 38.13547087602444, 0.5003270373238773);
  const k = sig.ch.map((x) => chain(x, shelf, hpk));
  const block = Math.round(0.4 * sr),
    hop = Math.round(0.1 * sr);
  const z = [];
  const n = k[0].length;
  if (n < block) {
    // short: one block over the whole thing
    let s = 0;
    for (const x of k) {
      let m = 0;
      for (const v of x) m += v * v;
      s += m / n;
    }
    return -0.691 + 10 * Math.log10(s);
  }
  for (let st = 0; st + block <= n; st += hop) {
    let s = 0;
    for (const x of k) {
      let m = 0;
      for (let i = st; i < st + block; i++) m += x[i] * x[i];
      s += m / block;
    }
    z.push(s);
  }
  const L = (s) => -0.691 + 10 * Math.log10(s);
  const abs = z.filter((s) => L(s) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((s) => L(s) > rel);
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}
// Short-term max (3 s window) is meaningless for one-shots; use momentary max (400 ms).
export function momentaryMax(sig) {
  const { sr } = sig;
  const shelf = highShelf(sr, 1681.974450955533, 3.999843853973347, 0.7071752369554196);
  const hpk = hp(sr, 38.13547087602444, 0.5003270373238773);
  const k = sig.ch.map((x) => chain(x, shelf, hpk));
  const block = Math.round(0.4 * sr),
    hop = Math.round(0.01 * sr);
  let best = 0;
  for (let st = 0; st + block <= k[0].length; st += hop) {
    let s = 0;
    for (const x of k) {
      let m = 0;
      for (let i = st; i < st + block; i++) m += x[i] * x[i];
      s += m / block;
    }
    best = Math.max(best, s);
  }
  return -0.691 + 10 * Math.log10(best);
}

export const speaker = (sig) => mapCh(sig, (x) => chain(x, hp(sig.sr, 150), hp(sig.sr, 150)));
// Small phone speaker: 4th-order HP at 300 Hz plus gentle top roll-off at 10 kHz.
export const phone = (sig) =>
  mapCh(sig, (x) => chain(x, hp(sig.sr, 300), hp(sig.sr, 300), lp(sig.sr, 10000)));

export function mono(sig) {
  const n = sig.ch[0].length,
    m = new Float32Array(n);
  for (const x of sig.ch) for (let i = 0; i < n; i++) m[i] += x[i] / sig.ch.length;
  return m;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len,
      wr = Math.cos(a),
      wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j],
          ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
export const BANDS = [0, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000, 24000];
// Energy share per band (%), spectral centroid, and 3 strongest peaks (Hz).
export function spectrum(sig, from = 0, to = Infinity) {
  const x = mono(sig),
    sr = sig.sr,
    N = 8192;
  const a = Math.max(0, Math.round(from * sr)),
    b = Math.min(x.length, Math.round(to * sr));
  const acc = new Float64Array(N / 2);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  for (let st = a; st < b; st += N / 2) {
    const re = new Float32Array(N),
      im = new Float32Array(N);
    for (let i = 0; i < N && st + i < b; i++) re[i] = x[st + i] * win[i];
    fft(re, im);
    for (let i = 0; i < N / 2; i++) acc[i] += re[i] * re[i] + im[i] * im[i];
  }
  let tot = 0,
    cen = 0;
  const bands = new Array(BANDS.length - 1).fill(0);
  for (let i = 1; i < N / 2; i++) {
    const f = (i * sr) / N;
    tot += acc[i];
    cen += acc[i] * f;
    for (let k = 0; k < bands.length; k++)
      if (f >= BANDS[k] && f < BANDS[k + 1]) {
        bands[k] += acc[i];
        break;
      }
  }
  const peaks = [];
  for (let i = 3; i < N / 2 - 3; i++) {
    if (acc[i] > acc[i - 1] && acc[i] >= acc[i + 1] && acc[i] > acc[i - 3] && acc[i] > acc[i + 3])
      peaks.push([(i * sr) / N, acc[i]]);
  }
  peaks.sort((p, q) => q[1] - p[1]);
  const out = {};
  bands.forEach((e, k) => (out[`${BANDS[k]}-${BANDS[k + 1]}`] = r1((100 * e) / tot)));
  return {
    bandsPct: out,
    centroidHz: Math.round(cen / tot),
    topPeaksHz: peaks.slice(0, 6).map((p) => Math.round(p[0])),
  };
}

// 10 ms RMS envelope (dB) of the mono mix.
export function envelope(sig, winS = 0.01) {
  const x = mono(sig),
    w = Math.round(winS * sig.sr),
    e = [];
  for (let st = 0; st < x.length; st += w) {
    let m = 0,
      n = 0;
    for (let i = st; i < Math.min(x.length, st + w); i++) {
      m += x[i] * x[i];
      n++;
    }
    e.push(db(Math.sqrt(m / n)));
  }
  return e;
}

export function measure(sig, extra = {}) {
  const n = sig.ch[0].length,
    sr = sig.sr;
  let peak = 0,
    clipped = 0,
    first40 = -1,
    first60 = -1,
    last60 = -1,
    dc = 0;
  for (const x of sig.ch)
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
      if (a >= 0.9999) clipped++;
      if (a >= 0.01 && (first40 < 0 || i < first40)) first40 = i;
      if (a >= 0.001 && (first60 < 0 || i < first60)) first60 = i;
      if (a >= 0.001 && i > last60) last60 = i;
      dc += x[i];
    }
  const env = envelope(sig);
  let pk = -Infinity,
    pkAt = 0;
  env.forEach((v, i) => {
    if (v > pk) {
      pk = v;
      pkAt = i;
    }
  });
  const after = (dB) => {
    for (let i = env.length - 1; i > pkAt; i--) if (env[i] > pk - dB) return (i + 1) * 0.01;
    return pkAt * 0.01;
  };
  const firstAbove = (dB) => env.findIndex((v) => v > pk - dB) * 0.01;
  let sumsq = 0;
  for (const x of sig.ch) for (const v of x) sumsq += v * v;
  const rms = Math.sqrt(sumsq / (n * sig.ch.length));
  return {
    sampleRate: sr,
    channels: sig.ch.length,
    durationS: r1(n / sr, 3),
    bytes: sig.bytes,
    peakDbfs: r1(db(peak), 2),
    clippedSamples: clipped,
    dcOffset: +(dc / (n * sig.ch.length)).toExponential(2),
    crestDb: r1(db(peak) - db(rms)),
    lufs: r1(lufs(sig)),
    momentaryMaxLufs: r1(momentaryMax(sig)),
    lufs150HzHP: r1(lufs(speaker(sig))),
    lufsPhone300HzHP: r1(lufs(phone(sig))),
    leadInMs_to_minus60dBFS: r1((first60 / sr) * 1000),
    leadInMs_to_minus40dBFS: r1((first40 / sr) * 1000),
    envelopePeakAtS: r1(pkAt * 0.01, 2),
    attackS_minus20dB_to_peak: r1(pkAt * 0.01 - firstAbove(20), 2),
    decayEnd_minus20dB_S: r1(after(20), 2),
    decayEnd_minus40dB_S: r1(after(40), 2),
    lastSampleAboveMinus60dBFS_S: r1(last60 / sr, 3),
    tailLevelLast50ms_dBFS: r1(Math.max(...env.slice(-5)), 1),
    ...spectrum(sig),
    ...extra,
  };
}

// Windowed-sinc (Kaiser, 64 taps per side) resampler by ratio: out[i] = x(i * ratio).
// ratio > 1 raises pitch/shortens. Anti-alias cutoff applied when ratio > 1.
function bessel0(x) {
  let s = 1,
    t = 1;
  for (let k = 1; k < 30; k++) {
    t *= (x / (2 * k)) ** 2;
    s += t;
  }
  return s;
}
export function resample(x, ratio, taps = 64, beta = 9) {
  const outN = Math.floor(x.length / ratio),
    y = new Float32Array(outN);
  const cut = Math.min(1, 1 / ratio) * 0.97,
    i0b = bessel0(beta);
  for (let i = 0; i < outN; i++) {
    const t = i * ratio,
      c = Math.floor(t);
    let s = 0;
    for (let k = c - taps + 1; k <= c + taps; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = t - k,
        u = d / taps;
      if (Math.abs(u) >= 1) continue;
      const w = bessel0(beta * Math.sqrt(1 - u * u)) / i0b;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * cut * d) / (Math.PI * cut * d);
      s += x[k] * cut * sinc * w;
    }
    y[i] = s;
  }
  return y;
}

export async function saveWav(name, sig, bits = 24) {
  const n = sig.ch[0].length,
    f = new Float32Array(n * sig.ch.length);
  sig.ch.forEach((x, c) => f.set(x, c * n));
  await fetch(
    `/wav?name=${encodeURIComponent(name)}&sr=${sig.sr}&ch=${sig.ch.length}&bits=${bits}`,
    { method: "POST", body: f.buffer },
  );
}

export function gain(sig, g) {
  return mapCh(sig, (x) => x.map((v) => v * g));
}
export function mix(sr, parts, len) {
  // parts: [{sig, gain, at}]
  const n = len ?? Math.max(...parts.map((p) => Math.round((p.at ?? 0) * sr) + p.sig.ch[0].length));
  const chs = Math.max(...parts.map((p) => p.sig.ch.length));
  const out = Array.from({ length: chs }, () => new Float32Array(n));
  for (const p of parts) {
    const off = Math.round((p.at ?? 0) * sr);
    for (let c = 0; c < chs; c++) {
      const x = p.sig.ch[Math.min(c, p.sig.ch.length - 1)];
      for (let i = 0; i < x.length && off + i < n; i++) out[c][off + i] += x[i] * (p.gain ?? 1);
    }
  }
  return { sr, ch: out };
}
// The game's master limiter (thr -1 dB, knee 0, 20:1, 3 ms / 250 ms), rendered by Chrome itself.
export async function limiter(sig) {
  const n = sig.ch[0].length;
  const oc = new OfflineAudioContext(sig.ch.length, n, sig.sr);
  const b = oc.createBuffer(sig.ch.length, n, sig.sr);
  sig.ch.forEach((x, c) => b.copyToChannel(x, c));
  const s = oc.createBufferSource();
  s.buffer = b;
  const k = oc.createDynamicsCompressor();
  k.threshold.value = -1;
  k.knee.value = 0;
  k.ratio.value = 20;
  k.attack.value = 0.003;
  k.release.value = 0.25;
  s.connect(k);
  k.connect(oc.destination);
  s.start();
  let maxRed = 0;
  const r = await oc.startRendering();
  maxRed = k.reduction;
  const ch = [];
  for (let c = 0; c < r.numberOfChannels; c++) ch.push(new Float32Array(r.getChannelData(c)));
  return { sr: sig.sr, ch, finalReductionDb: maxRed };
}
export function fadeIn(sig, s) {
  const n = Math.round(s * sig.sr);
  return mapCh(sig, (x) => {
    const y = x.slice();
    for (let i = 0; i < n && i < y.length; i++) y[i] *= Math.sin((0.5 * Math.PI * i) / n) ** 2;
    return y;
  });
}
export function fadeOut(sig, s) {
  const n = Math.round(s * sig.sr);
  return mapCh(sig, (x) => {
    const y = x.slice(),
      L = y.length;
    for (let i = 0; i < n && i < L; i++) y[L - 1 - i] *= Math.sin((0.5 * Math.PI * i) / n) ** 2;
    return y;
  });
}
export function slice(sig, fromS, toS) {
  const a = Math.round(fromS * sig.sr),
    b = toS == null ? undefined : Math.round(toS * sig.sr);
  return mapCh(sig, (x) => x.slice(a, b));
}
export function pad(sig, leadS) {
  const n = Math.round(leadS * sig.sr);
  return mapCh(sig, (x) => {
    const y = new Float32Array(x.length + n);
    y.set(x, n);
    return y;
  });
}
export function peakOf(sig) {
  let p = 0;
  for (const x of sig.ch) for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}
