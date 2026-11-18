// TEST AND QA ONLY: small, dependency-free statistics for the P8-3b distribution tests.
//
// The tests use fixed, declared seeds, so every statistic is a fixed number and a test either
// always passes or always fails. Thresholds are set at about 5 standard deviations (two-sided
// p ≈ 6 × 10^-7) so that a correct implementation passes for any reasonable seed choice, while an
// implementation error of the size these tests target (a wrong stream, a shifted draw, a wrong
// band) moves the statistic by far more.

/** z-score of `count` successes in `n` trials against probability `p`. */
export function zProportion(count: number, n: number, p: number): number {
  return (count - n * p) / Math.sqrt(n * p * (1 - p));
}

/** z-score of a sample mean against `mu` for a distribution with standard deviation `sigma`. */
export function zMean(values: readonly number[], mu: number, sigma: number): number {
  return (mean(values) - mu) / (sigma / Math.sqrt(values.length));
}

export function mean(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function variance(values: readonly number[]): number {
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return s / (values.length - 1);
}

/** Pearson correlation of two equally long samples. */
export function pearson(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** Pearson chi-square statistic of observed counts against expected counts. */
export function chiSquare(observed: readonly number[], expected: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < observed.length; i++) s += (observed[i] - expected[i]) ** 2 / expected[i];
  return s;
}

/**
 * Upper critical value of chi-square with `df` degrees of freedom at the normal quantile `z`
 * (Wilson–Hilferty approximation; accurate to well under 1 % for df ≥ 3).
 */
export function chiSquareCritical(df: number, z: number): number {
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}

/** Chi-square independence statistic of a contingency table (rows × columns of counts). */
export function chiSquareIndependence(table: readonly (readonly number[])[]): {
  stat: number;
  df: number;
} {
  const rows = table.map((r) => r.reduce((x, y) => x + y, 0));
  const cols = table[0].map((_, j) => table.reduce((x, r) => x + r[j], 0));
  const n = rows.reduce((x, y) => x + y, 0);
  let stat = 0;
  for (let i = 0; i < table.length; i++) {
    for (let j = 0; j < cols.length; j++) {
      const e = (rows[i] * cols[j]) / n;
      stat += (table[i][j] - e) ** 2 / e;
    }
  }
  return { stat, df: (table.length - 1) * (cols.length - 1) };
}

/** The 5-sigma bound used throughout (two-sided p ≈ 5.7 × 10^-7). */
export const Z_BOUND = 5;
