// Multiplier overlay — readout, potential win, spectating hint, countdown
// hint, boost badge (docs/07_UI_ARCHITECTURE.md §13.1). Sprint 4, Commit U6:
// markup verbatim from the component shell.
//
// Reads the round store (phase, multiplier, countdown, boost) and the wallet
// (the slots' participation and roundBet — the LOCKED settlement basis, so
// the shown potential always matches the payout). The potential win is the
// wallet's own rounded-down payout function (M1-D8/D13), never more than the
// wallet would credit at this multiplier. E-X3: it is the sum of each slot's
// separately rounded-down payout — over the slots still riding, or, once
// every slot is settled, over all of them (the single-bet behavior: the line
// keeps following the live multiplier).
//
// Placement (U7 polish, presentation only): the renderer draws the chain
// down the stage's horizontal center (from x = w/2 at the top edge to the
// swaying anchor) and, in idle on tall stages, the surface ship there too.
// The HUD therefore sits in a left lane that ends 3.5rem short of the
// center line, clear of the chain's sway band. The readout keeps its 60 px
// size wherever the lane allows (tablet, desktop) and scales down with the
// stage width (container units; the stage is an @container) on phones so a
// two-digit multiplier still clears the chain. No renderer value is read
// or changed.

import { useMemo } from "react";
import { formatMoney, formatMultiplier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { centsToAmount, payoutCents } from "@/ui/store/payout";
import { STRINGS } from "@/ui/strings";

const { wallet, round } = gameSession;

export function MultiplierOverlay() {
  const phase = useStore(round, (r) => r.phase);
  const multiplier = useStore(round, (r) => r.multiplier);
  const boost = useStore(round, (r) => r.boost); // 0..1 short boost when goldfish
  const countdown = useStore(round, (r) => r.countdownSeconds);
  const slots = useStore(wallet, (w) => w.slots);
  const participating = slots[0].participating || slots[1].participating;

  const inDive = phase === "diving";
  const isIdle = phase === "idle";
  const showCrash = phase === "crashed";

  const potentialWin = useMemo(() => {
    const playing = slots.filter((s) => s.participating);
    const riding = playing.filter((s) => !s.hasCashed);
    let cents = 0n;
    for (const s of riding.length > 0 ? riding : playing) {
      cents += payoutCents(s.roundBet, multiplier) ?? 0n;
    }
    return centsToAmount(cents) ?? 0;
  }, [slots, multiplier]);

  return (
    <div className="pointer-events-none absolute inset-y-0 left-4 right-[calc(50%+3.5rem)] flex flex-col items-start justify-start whitespace-nowrap pt-4 tab:left-6 tab:pt-6">
      <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">
        {STRINGS.hud.multiplierLabel}
      </div>
      <div
        className={`mt-1 text-[length:clamp(2.25rem,calc((50cqw_-_3.5rem)/3.4),3.75rem)] leading-none font-black tabular-nums text-gold multiplier-glow ${
          showCrash ? "crash-shake text-danger" : ""
        }`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatMultiplier(multiplier)}
      </div>
      {inDive && participating && (
        <div className="mt-1 text-xs text-white/70">
          {STRINGS.hud.potentialLabel}
          <span className="font-semibold text-gold">{formatMoney(potentialWin)}</span>
        </div>
      )}
      {inDive && !participating && (
        <div className="mt-1 text-xs text-white/60">{STRINGS.hud.spectating}</div>
      )}
      {isIdle && (
        <div className="mt-1 text-xs text-white/70">
          {STRINGS.hud.countdownPrefix}
          <span className="font-semibold text-gold tabular-nums">
            {countdown.toFixed(1)}
            {STRINGS.hud.secondsSuffix}
          </span>
        </div>
      )}
      {boost > 0.05 && (
        <div className="mt-2 rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-gold">
          {STRINGS.hud.goldenBoost}
        </div>
      )}
    </div>
  );
}
