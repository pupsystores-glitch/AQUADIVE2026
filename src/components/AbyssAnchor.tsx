import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUICK_BETS } from "@/game/config";
import { DEFAULT_BET } from "@/game/constants";
import { chainTier, formatMultiplier } from "@/game/presentation";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";

// The game session (docs/07_UI_ARCHITECTURE.md §8): engine, driver, the
// wallet, notification and round stores and renderer attachment live in
// src/ui/session.ts, owned at module scope — remounting the component
// resumes the world, the wallet, an active win flash and the round/bonus
// presentation (including the chest picker) instead of restarting them
// (docs/06 §13; deltas V1, V2; U4b).
const { wallet, notifications, round } = gameSession;

// The UI shell (E6): rendering and user input only. The simulation, round
// lifecycle and all projections live in the engine; all money state and
// math live in the session's wallet store (U2); the per-frame engine
// public-state mirror is the session's round store (U4b). This component
// subscribes to no engine events: it reads the stores via useStore and
// submits typed commands through the session (§8).
export default function AbyssAnchor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Settlement state (§10): one owner, the wallet store; read-only here.
  // roundBet is this round's locked bet (the betPlaced amount the wallet
  // was debited with), so the shown potential always matches the payout.
  const balance = useStore(wallet, (w) => w.balance);
  const lastWin = useStore(wallet, (w) => w.lastWin);
  const history = useStore(wallet, (w) => w.history);
  const hasCashed = useStore(wallet, (w) => w.hasCashed);
  const participating = useStore(wallet, (w) => w.participating);
  const roundBet = useStore(wallet, (w) => w.roundBet);
  // Win flash (§12): owned by the notification store — trigger, duration,
  // supersede and round-transition clears all live there (V2).
  const cashFlash = useStore(notifications, (n) => n.flash !== null);

  // Round and bonus presentation (§11): one owner, the round store — the
  // engine's public state mirrored once per frame by the driver's sync.
  // Selectors return primitives or references the store keeps stable while
  // unchanged, so quiet frames re-render nothing.
  const phase = useStore(round, (r) => r.phase);
  const multiplier = useStore(round, (r) => r.multiplier);
  const boost = useStore(round, (r) => r.boost); // 0..1 short boost when goldfish
  const countdown = useStore(round, (r) => r.countdownSeconds);
  const bonusEligible = useStore(round, (r) => r.participant?.bonusEligible ?? false);
  const chests = useStore(round, (r) => r.chests);
  const chosenChestId = useStore(round, (r) => r.chosenChestId);
  // The chosen chest is engine state (chosenChestId), not event history, so
  // a remount after a pick shows it revealed again.
  const chosenChest = chests !== null && chosenChestId !== null ? chests[chosenChestId] : null;

  // Bet input: component state until U5's bet-input store.
  const [bet, setBet] = useState(DEFAULT_BET);

  // ----- user input → session commands (§8) -----
  // The engine validates every command against round state at the tick it
  // applies (D4) and rejects invalid ones; the wallet question (§3: can the
  // player afford the bet?) is answered on the session's submit path.
  const placeBet = useCallback(() => {
    gameSession.submit({ type: "placeBet", amount: bet });
  }, [bet]);

  const cashOut = useCallback(() => {
    gameSession.submit({ type: "cashOut" });
  }, []);

  const pickChest = useCallback((id: 0 | 1 | 2) => {
    gameSession.submit({ type: "pickChest", chestId: id });
  }, []);

  // ----- session attach: canvas only -----
  // The session constructs the renderer, synchronizes the round store once,
  // and drives frame + round-store sync per rAF (docs/07 §8, §11). The
  // cleanup detaches: one attach, one detach per mount, so StrictMode's
  // double-mount and repeated remounts leave exactly one sink.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return gameSession.attachCanvas(canvas);
  }, []);

  // ----- UI -----
  const inDive = phase === "diving";
  const isIdle = phase === "idle";
  const showCrash = phase === "crashed";
  const showBonus = phase === "bonus";
  // E-X1 (docs/06 §5): only a bonus-eligible participant (auto-cashed at the
  // jackpot) sees and can use the picker; manual-cashout players and
  // spectators never do — the engine completes their bonus phase itself.
  const showChestPicker = showBonus && bonusEligible;
  const canBet = isIdle && !participating && bet > 0 && bet <= balance && countdown > 0.2;

  // Displayed only while participating in a dive; based on the LOCKED bet
  // (the settlement basis), not the live input — display and payout agree.
  const potentialWin = useMemo(() => +(roundBet * multiplier).toFixed(2), [roundBet, multiplier]);

  return (
    <div className="relative mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-background text-foreground">
      {/* TOP BAR */}
      <header className="z-20 flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-gold/40 bg-card text-gold">
            <AnchorIcon className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground">REAL-TIME</div>
            <div className="-mt-0.5 text-sm font-bold tracking-[0.25em] text-gold">AQUADIVE</div>
          </div>
        </div>
        <div className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs">
          <span className="text-muted-foreground">Balance </span>
          <span className="font-semibold text-gold">{balance.toFixed(2)}</span>
        </div>
      </header>

      {/* HISTORY STRIP */}
      <div className="z-20 flex gap-1.5 overflow-x-auto px-4 pb-2">
        {history.length === 0 && (
          <span className="text-[11px] text-muted-foreground/70">No rounds yet</span>
        )}
        {history.map((h, i) => (
          <span
            key={i}
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              h.crashed
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-success/30 bg-success/10 text-success"
            }`}
          >
            {h.mult.toFixed(2)}×
          </span>
        ))}
      </div>

      {/* CANVAS STAGE */}
      <div className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Multiplier overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-start pt-6">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Multiplier</div>
          <div
            className={`mt-1 text-6xl font-black tabular-nums text-gold multiplier-glow ${
              showCrash ? "crash-shake text-danger" : ""
            }`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatMultiplier(multiplier)}
          </div>
          {inDive && participating && (
            <div className="mt-1 text-xs text-white/70">
              Potential <span className="font-semibold text-gold">{potentialWin.toFixed(2)}</span>
            </div>
          )}
          {inDive && !participating && (
            <div className="mt-1 text-xs text-white/60">Spectating this dive</div>
          )}
          {isIdle && (
            <div className="mt-1 text-xs text-white/70">
              Next dive in <span className="font-semibold text-gold tabular-nums">{countdown.toFixed(1)}s</span>
            </div>
          )}
          {boost > 0.05 && (
            <div className="mt-2 rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-gold">
              GOLDEN BOOST
            </div>
          )}
        </div>

        {/* Crash banner */}
        {showCrash && (
          <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-6 text-center">
            <div className="mx-auto inline-block rounded-xl border border-danger/40 bg-danger/15 px-6 py-3 backdrop-blur-sm">
              <div className="text-xs tracking-[0.3em] text-danger/90">CHAIN SNAPPED</div>
              <div className="mt-1 text-3xl font-black text-danger">{multiplier.toFixed(2)}×</div>
            </div>
          </div>
        )}

        {/* Cashed banner */}
        {cashFlash && lastWin && (
          <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 px-6 text-center">
            <div className="mx-auto inline-block rounded-xl border border-success/40 bg-success/15 px-6 py-3 backdrop-blur-sm">
              <div className="text-xs tracking-[0.3em] text-success">CASHED OUT</div>
              <div className="mt-1 text-3xl font-black text-success">
                +{lastWin.amount.toFixed(2)}
              </div>
              <div className="text-xs text-white/70">at {lastWin.mult.toFixed(2)}×</div>
            </div>
          </div>
        )}

        {/* Bonus chests */}
        {showChestPicker && chests && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-end bg-black/40 pb-8 backdrop-blur-sm">
            <div className="mb-3 text-xs uppercase tracking-[0.3em] text-gold">Pirate Wreck — Pick a Chest</div>
            <div className="flex gap-4 px-6">
              {chests.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pickChest(c.id)}
                  disabled={!!chosenChest}
                  className="group flex h-24 w-20 flex-col items-center justify-end rounded-lg border border-gold/40 bg-gradient-to-b from-[#3a2410] to-[#1a0e06] p-2 transition-transform active:scale-95 disabled:opacity-50"
                >
                  <ChestIcon className="h-10 w-10 text-gold transition-transform group-hover:-translate-y-1" />
                  <div className="mt-1 text-[10px] text-gold/70">
                    {chosenChest?.id === c.id ? `+${c.multiplier.toFixed(2)}×` : "???"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROLS */}
      <div className="z-20 border-t border-border bg-card/80 px-4 pt-3 pb-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setBet((b) => Math.max(1, +(b / 2).toFixed(2)))}
            className="h-10 w-10 rounded-md border border-border bg-secondary text-lg font-bold text-foreground active:scale-95 disabled:opacity-50"
            disabled={inDive}
          >−</button>
          <div className="flex flex-1 flex-col items-center rounded-md border border-border bg-secondary py-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bet · {chainTier(bet)}</div>
            <input
              type="number"
              value={bet}
              onChange={(e) => setBet(Math.max(0, +e.target.value))}
              disabled={inDive}
              className="w-full bg-transparent text-center text-lg font-bold tabular-nums text-gold outline-none"
            />
          </div>
          <button
            onClick={() => setBet((b) => Math.min(balance, +(b * 2).toFixed(2)))}
            className="h-10 w-10 rounded-md border border-border bg-secondary text-lg font-bold text-foreground active:scale-95 disabled:opacity-50"
            disabled={inDive}
          >+</button>
        </div>
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          {QUICK_BETS.map((v) => (
            <button
              key={v}
              onClick={() => setBet(v)}
              disabled={inDive}
              className={`rounded-md border py-1.5 text-xs font-semibold tabular-nums transition ${
                bet === v
                  ? "border-gold/60 bg-gold/15 text-gold"
                  : "border-border bg-secondary text-muted-foreground"
              } disabled:opacity-50`}
            >
              {v}
            </button>
          ))}
        </div>

        {inDive && participating && !hasCashed ? (
          <button
            onClick={cashOut}
            className="w-full rounded-xl border border-success/40 bg-gradient-to-b from-success to-success/70 py-4 text-lg font-black tracking-wider text-background shadow-[0_0_30px_-8px] shadow-success active:scale-[0.98]"
          >
            CASH OUT · {potentialWin.toFixed(2)}
          </button>
        ) : inDive && participating && hasCashed ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-success/30 bg-success/10 py-4 text-sm font-bold tracking-widest text-success"
          >
            SECURED +{lastWin?.amount.toFixed(2)} · WATCHING DIVE…
          </button>
        ) : inDive && !participating ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-border bg-secondary py-4 text-sm font-bold tracking-widest text-muted-foreground"
          >
            SPECTATING · NEXT ROUND SOON
          </button>
        ) : isIdle && participating ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-gold/30 bg-gold/10 py-4 text-sm font-bold tracking-widest text-gold"
          >
            BET LOCKED · DIVE IN {countdown.toFixed(1)}s
          </button>
        ) : (
          <button
            onClick={placeBet}
            disabled={!canBet || showBonus || showCrash}
            className="w-full rounded-xl border border-gold/40 bg-gradient-to-b from-gold to-gold-deep py-4 text-lg font-black tracking-wider text-background shadow-[0_0_30px_-8px] shadow-gold disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
          >
            {isIdle ? `PLACE BET · ${countdown.toFixed(1)}s` : "WAITING…"}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Icon components
// ============================================================

function AnchorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v15" />
      <path d="M8 11h8" />
      <path d="M5 18a7 7 0 0 0 7 4 7 7 0 0 0 7-4" />
    </svg>
  );
}

function ChestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1H4v-1Z" opacity="0.7" />
      <path d="M4 12h16v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7Z" />
      <rect x="10" y="13" width="4" height="4" rx="0.5" fill="#1a0e06" />
    </svg>
  );
}
