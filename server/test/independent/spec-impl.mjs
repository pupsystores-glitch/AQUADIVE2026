// TEST ONLY (P8-4a-1, owner decision I5). Never bundled, never imported by server/src or src/.
//
// Provenance: copied VERBATIM (below this header) from the Git-ignored P8-3a QA file
// qa/p8-3-fairness/independent/spec-impl.mjs (git blob 4af5b75180732e16c05b1dc6b7d593dfe8af253a),
// reviewed 2026-11-23: it imports nothing (no node: module, no src/, no server/src/), and it
// implements the fv = 1 message layout and top-52-bit draw extraction from the byte layout in
// src/fairness/README.md §3 – §5. The P8-3a gate checked it against node:crypto (OpenSSL) and
// Chrome WebCrypto (BoringSSL).
//
// INDEPENDENT re-implementation of the fv = 1 fairness derivation, written from the byte layout
// in src/fairness/README.md §3 – §5 only. It imports nothing from src/fairness. Async, so it runs
// unchanged on node:crypto (OpenSSL) and on browser WebCrypto (BoringSSL in Chrome).
//
// computeVectorSet(h) — h = { sha256(bytes) -> Promise<bytes>, hmac(key, bytes) -> Promise<bytes> }
// returns a JSON-safe object of every development vector (hex strings and numbers).

const enc = (s) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};
const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const lp = (b) => cat(new Uint8Array([b.length]), b);

export const PHRASES = {
  seed: "AQUADIVE fairness fv=1 development vector chain seed. PUBLIC, NOT SECRET. Never use in production.",
  saltA: "AQUADIVE fairness fv=1 development salt A. Fixed test value, not a public beacon value.",
  saltB: "AQUADIVE fairness fv=1 development salt B. Fixed test value, not a public beacon value.",
};
export const CHAIN_LENGTH = 8;
export const LIMITS = { crash: 2, jackpot: 2, chests: 6, world: 2048 };

export function message(fv, chainId, index, salt, purpose, counter) {
  return cat(lp(enc("AQUADIVE-FAIRNESS")), new Uint8Array([fv, 0x01]), lp(chainId), u32(index), lp(salt), lp(enc(purpose)), u32(counter));
}

export function top52(block, w) {
  const o = w * 8;
  let hi = 0;
  for (let i = 0; i < 4; i++) hi = hi * 256 + block[o + i];
  let lo = 0;
  for (let i = 4; i < 8; i++) lo = lo * 256 + block[o + i];
  return hi * 1048576 + Math.floor(lo / 4096);
}

export async function computeVectorSet(h) {
  const seed = await h.sha256(enc(PHRASES.seed));
  const saltA = await h.sha256(enc(PHRASES.saltA));
  const saltB = await h.sha256(enc(PHRASES.saltB));
  // links[i] = x_i; x_8 = seed
  const links = new Array(CHAIN_LENGTH + 1);
  links[CHAIN_LENGTH] = seed;
  for (let i = CHAIN_LENGTH - 1; i >= 0; i--) links[i] = await h.sha256(links[i + 1]);
  const chainId = links[0];
  const block = (index, salt, purpose, counter, id = chainId) => h.hmac(links[index], message(1, id, index, salt, purpose, counter));
  const draws = async (index, salt, purpose, n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const b = await block(index, salt, purpose, Math.floor(k / 4));
      const v = top52(b, k % 4);
      out.push({ u52: String(v), value: v / 4503599627370496 });
    }
    return out;
  };
  const altChainId = await h.sha256(chainId);
  return {
    seedHex: hex(seed),
    saltAHex: hex(saltA),
    saltBHex: hex(saltB),
    chainLength: CHAIN_LENGTH,
    linksHex: links.map(hex),
    messageIndex3SaltACrash0Hex: hex(message(1, chainId, 3, saltA, "crash", 0)),
    blocksIndex3SaltA: {
      crash0: hex(await block(3, saltA, "crash", 0)),
      jackpot0: hex(await block(3, saltA, "jackpot", 0)),
      chests0: hex(await block(3, saltA, "chests", 0)),
      chests1: hex(await block(3, saltA, "chests", 1)),
      world0: hex(await block(3, saltA, "world", 0)),
      world1: hex(await block(3, saltA, "world", 1)),
      world511: hex(await block(3, saltA, "world", 511)),
    },
    variants: {
      saltB_index3_crash0: hex(await block(3, saltB, "crash", 0)),
      index4_saltA_crash0: hex(await block(4, saltA, "crash", 0)),
      altChainId_index3_saltA_crash0: hex(await block(3, saltA, "crash", 0, altChainId)),
      altChainIdHex: hex(altChainId),
    },
    drawsIndex3SaltA: {
      crash: await draws(3, saltA, "crash", LIMITS.crash),
      jackpot: await draws(3, saltA, "jackpot", LIMITS.jackpot),
      chests: await draws(3, saltA, "chests", LIMITS.chests),
      worldFirst8: await draws(3, saltA, "world", 8),
    },
  };
}
