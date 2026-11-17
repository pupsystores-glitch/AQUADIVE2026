// Loading screen — the premium full-screen startup (LA1, owner authorization
// 2026-11-17; docs/07 §24). Renders the startup controller's state
// (src/ui/startup.ts); it decides nothing itself.
//
// - Server-rendered: the first paint is this near-black screen at 0 %, so
//   the game UI underneath (kept `inert` by the route until `playing`) is
//   never seen half-loaded, and there is no white flash.
// - `begin()` runs once after hydration. The bar is a CSS transform on one
//   element; its smooth motion is a CSS transition between real progress
//   values, so nothing here runs per frame.
// - `ready`: START GAME. Its press calls `startGame()`, which unlocks audio
//   inside that gesture. `failed`: Retry, and Continue. After a long wait:
//   a slow-connection hint and Continue. Audio problems are a quiet notice.
// - `playing`: the screen fades out (0.5 s) and unmounts; a remount after
//   that renders nothing.
// - Scripts that never load (no hydration): the server markup carries a
//   reload hint that CSS alone reveals after 15 s, and a <noscript> line, so
//   even then the screen is never a dead end.
//
// Minimal DOM and CSS, no image asset: the brand is text and the inline
// anchor glyph. Reduced motion: no transitions.

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/ui/hooks/use-store";
import { gameStartup } from "@/ui/startup-instance";
import { STRINGS } from "@/ui/strings";
import { AnchorIcon } from "./icons";

const FADE_MS = 500;

export function LoadingScreen() {
  const phase = useStore(gameStartup, (s) => s.phase);
  const progress = useStore(gameStartup, (s) => s.progress);
  const slow = useStore(gameStartup, (s) => s.slow);
  const notice = useStore(gameStartup, (s) => s.audioNotice);
  const playing = phase === "playing";
  // Already playing at mount (a remount): never show the screen again.
  const [gone, setGone] = useState(playing);
  const startRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    gameStartup.begin();
  }, []);

  useEffect(() => {
    if (!playing || gone) return;
    const id = setTimeout(() => setGone(true), FADE_MS + 50);
    return () => clearTimeout(id);
  }, [playing, gone]);

  useEffect(() => {
    if (phase === "ready") startRef.current?.focus({ preventScroll: true });
  }, [phase]);

  if (gone) return null;

  const { loading } = STRINGS;
  const percent = Math.floor(progress * 100);
  const canContinue = phase === "failed" || (phase === "loading" && slow);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loading-title"
      data-testid="loading-screen"
      data-phase={phase}
      className={
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020407] px-4 text-center" +
        " transition-opacity duration-500 ease-out motion-reduce:transition-none" +
        (playing ? " pointer-events-none opacity-0" : " opacity-100")
      }
    >
      <AnchorIcon className="h-7 w-7 text-gold/80" />
      <h1
        id="loading-title"
        className="mt-4 pl-[0.35em] text-2xl font-bold tracking-[0.35em] text-gold sm:text-3xl"
      >
        {loading.title}
      </h1>
      <p className="mt-1 pl-[0.4em] text-[10px] tracking-[0.4em] text-muted-foreground">
        {loading.tagline}
      </p>

      <div
        role="progressbar"
        aria-label={loading.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-10 h-[3px] w-48 overflow-hidden rounded-full bg-white/10 sm:w-64"
      >
        <div
          className="h-full w-full origin-left rounded-full bg-gold transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <div className="mt-3 h-4 text-[11px] tabular-nums tracking-widest text-muted-foreground">
        {loading.percent(percent)}
      </div>

      {/* The action area keeps its height in every phase: no layout shift. */}
      <div className="mt-8 flex min-h-24 flex-col items-center gap-3">
        {(phase === "ready" || playing) && (
          <button
            ref={startRef}
            type="button"
            onClick={() => gameStartup.startGame()}
            className={
              "animate-in fade-in-0 rounded-full border border-gold/60 bg-gold/10 px-9 py-3 pl-[calc(2.25rem+0.3em)]" +
              " text-sm font-semibold tracking-[0.3em] text-gold transition-colors duration-200" +
              " touch-manipulation hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2" +
              " focus-visible:ring-gold/70 motion-reduce:animate-none"
            }
          >
            {loading.start}
          </button>
        )}
        {phase === "failed" && (
          <>
            <p className="text-xs text-muted-foreground">{loading.failed}</p>
            <button
              type="button"
              onClick={() => gameStartup.retry()}
              className={
                "rounded-full border border-gold/60 bg-gold/10 px-7 py-2.5 pl-[calc(1.75rem+0.3em)] text-xs" +
                " font-semibold tracking-[0.3em] text-gold hover:bg-gold/20 focus-visible:outline-none" +
                " focus-visible:ring-2 focus-visible:ring-gold/70"
              }
            >
              {loading.retry}
            </button>
          </>
        )}
        {phase === "loading" && slow && (
          <p className="text-xs text-muted-foreground">{loading.slow}</p>
        )}
        {phase === "initializing" && (
          // Before hydration only. If the scripts never load, CSS alone shows
          // this after 15 s (`.loading-stall-hint`), and the link reloads.
          <p className="loading-stall-hint text-xs text-muted-foreground">
            {loading.stalled}{" "}
            <a href="/" className="text-gold underline underline-offset-4">
              {loading.reload}
            </a>
            <noscript> {loading.noScript}</noscript>
          </p>
        )}
        {canContinue && (
          <button
            type="button"
            onClick={() => gameStartup.startGame()}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
          >
            {loading.continueAnyway}
          </button>
        )}
      </div>

      <p aria-live="polite" className="mt-2 h-4 max-w-xs text-[11px] text-muted-foreground/80">
        {notice ? loading.notice[notice] : ""}
      </p>
    </div>
  );
}
