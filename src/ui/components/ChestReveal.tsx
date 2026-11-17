// Chest reveal — the picked chest's multiplier, large and centred over the
// stage in polished gold (CH1, owner instruction 2026-11-17). Pure
// presentation of the engine's chosen chest: the value is the engine's
// `chests[chosenChestId].multiplier`, formatted like every other multiplier.
//
// Layers, back to front: a soft gold glow, a slow fan of light rays, the
// caption, the value (gold gradient text with a one-time shine sweep) and
// four sparkles (F8's remaining glints, chest-fx.ts). Motion is the
// `.chest-reveal*` CSS in styles.css: a scale-in timed to land as the lid
// clears; under reduced motion the value simply appears.

import { formatMultiplier } from "@/game/presentation";
import { STRINGS } from "@/ui/strings";
import { REVEAL_SPARKLE_LAYOUT } from "./chest-fx";

export function ChestReveal({ multiplier }: { multiplier: number }) {
  const value = formatMultiplier(multiplier);
  return (
    <div className="chest-reveal relative flex flex-col items-center px-6 text-center">
      <div
        aria-hidden="true"
        className="chest-reveal-glow pointer-events-none absolute left-1/2 top-1/2 h-[220%] w-[150%] -translate-x-1/2 -translate-y-1/2"
      />
      <div
        aria-hidden="true"
        className="chest-reveal-rays pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(150%,34rem)] -translate-x-1/2 -translate-y-1/2"
      />
      <div className="chest-reveal-caption relative text-[10px] font-semibold uppercase tracking-[0.35em] text-gold/90 @lg:text-xs">
        {STRINGS.chests.revealCaption}
      </div>
      <div className="relative mt-1">
        <div
          data-text={value}
          className="chest-reveal-value font-black leading-none tracking-tight tabular-nums text-[length:clamp(3rem,min(17cqw,15dvh),7.5rem)]"
        >
          {value}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {REVEAL_SPARKLE_LAYOUT.map((style, i) => (
            <span key={i} className="chest-glint chest-glint--twinkle" style={style} />
          ))}
        </div>
      </div>
    </div>
  );
}
