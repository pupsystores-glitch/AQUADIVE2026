// Per-connection frame rate limit: a token bucket (P8-2; docs/09 §9.5).
//
// The bucket starts full (`burst` tokens) and refills at `ratePerSecond`
// tokens per second up to `burst`. Each inbound frame takes one token before
// it is decoded, so even malformed frames are limited. Time comes from a
// monotonic clock (milliseconds), never from wall-clock time.

export type MonotonicClock = () => number;

export const monotonicNow: MonotonicClock = () => performance.now();

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    private readonly now: MonotonicClock = monotonicNow,
  ) {
    if (!(ratePerSecond > 0) || !(burst >= 1)) throw new RangeError("invalid token bucket");
    this.tokens = burst;
    this.last = now();
  }

  /** Take one token; false when the bucket is empty (the frame exceeds the limit). */
  take(): boolean {
    const t = this.now();
    const elapsed = Math.max(0, t - this.last);
    this.last = t;
    this.tokens = Math.min(this.burst, this.tokens + (elapsed * this.ratePerSecond) / 1000);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
