// Independent payout oracle for tests (M1, docs/07_UI_ARCHITECTURE.md
// §23.13 "Floating-point limits on verifying I9"). Never the function under
// test and never `toFixed`: the stake is taken as integer cents and the
// multiplier as the EXACT rational value of its binary double (meaning 2,
// mantissa · 2^e in BigInt), and the payout is ⌊cents × m⌋ in integers.
//
// The wallet settles on the multiplier's shortest decimal (meaning 1). The two
// readings coincide for every unrounded cashout multiplier sampled (§23.16);
// for two-decimal multipliers whose doubles sit below the decimal (1.15,
// 57.29) they differ by design — tests for those use literal integer-cent
// expectations instead of this oracle.

/** The exact value of a finite nonnegative double as num / den. */
export function exactBinary(x: number): { num: bigint; den: bigint } {
  if (!Number.isFinite(x) || x < 0) throw new Error(`exactBinary: ${x}`);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & ((1n << 52n) - 1n);
  let exponent = -1074;
  if (biased !== 0) {
    mantissa |= 1n << 52n;
    exponent = biased - 1075;
  }
  return exponent >= 0
    ? { num: mantissa << BigInt(exponent), den: 1n }
    : { num: mantissa, den: 1n << BigInt(-exponent) };
}

/** ⌊stakeCents × m⌋ with m's exact binary value. */
export function floorCentsBinary(stakeCents: bigint, m: number): bigint {
  const { num, den } = exactBinary(m);
  return (stakeCents * num) / den;
}

/** The expected credit for a whole-cent stake (< 2^51 cents) at multiplier m. */
export function payoutOracle(stake: number, m: number): number {
  const cents = BigInt(Math.round(stake * 100));
  return Number(floorCentsBinary(cents, m)) / 100;
}
