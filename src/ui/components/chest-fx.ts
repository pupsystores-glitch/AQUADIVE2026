// Chest burst layout (CH1; docs/08 §4.3 F8, pulled forward by the owner on
// 2026-11-17). F8's cap is 16 gold glints for the whole opening: 12 burst
// from the chosen chest and 4 twinkle on the revealed multiplier. Positions
// are fixed (no randomness), so the burst is the same every time and in
// every test. Motion is CSS (`.chest-glint`, styles.css): transform and
// opacity only, and the glints are not shown under reduced motion.

import type { CSSProperties } from "react";

/** F8 cap: gold glints alive during one chest opening (docs/08 §4.3, §8 particle caps). */
export const CHEST_GLINT_CAP = 16;

/** Glints bursting from the opened chest. */
export const CHEST_BURST_GLINTS = 12;

/** Glints twinkling on the centred multiplier. */
export const REVEAL_SPARKLES = CHEST_GLINT_CAP - CHEST_BURST_GLINTS;

/** Delay before the burst, so it lands as the lid clears (ms). */
const BURST_DELAY_MS = 300;
/** Stagger between consecutive glints (ms). */
const BURST_STAGGER_MS = 28;

/** CSS custom properties read by the `chestGlint` keyframes. */
export type GlintStyle = CSSProperties & Record<`--glint-${string}`, string>;

/**
 * The burst fans upward and outward from the chest's opening: angles spread
 * over the upper 260°, two alternating reach rings, sizes alternating.
 */
export const CHEST_BURST_LAYOUT: readonly GlintStyle[] = Array.from(
  { length: CHEST_BURST_GLINTS },
  (_, i) => {
    const deg = -130 + (260 / (CHEST_BURST_GLINTS - 1)) * i;
    const rad = (deg * Math.PI) / 180;
    const reach = i % 2 === 0 ? 62 : 44; // % of the chest's width
    return {
      "--glint-x": `${(Math.sin(rad) * reach).toFixed(1)}cqw`,
      "--glint-y": `${(-Math.cos(rad) * reach * 0.8).toFixed(1)}cqw`,
      "--glint-s": i % 3 === 0 ? "1.25" : "0.85",
      "--glint-delay": `${BURST_DELAY_MS + i * BURST_STAGGER_MS}ms`,
    };
  },
);

/** Sparkles on the multiplier: its four corners, staggered after the value lands. */
export const REVEAL_SPARKLE_LAYOUT: readonly GlintStyle[] = [
  { left: "4%", top: "8%", "--glint-delay": "820ms", "--glint-s": "1.1" },
  { left: "92%", top: "18%", "--glint-delay": "980ms", "--glint-s": "0.8" },
  { left: "86%", top: "82%", "--glint-delay": "1140ms", "--glint-s": "1" },
  { left: "10%", top: "76%", "--glint-delay": "1300ms", "--glint-s": "0.75" },
].slice(0, REVEAL_SPARKLES);
