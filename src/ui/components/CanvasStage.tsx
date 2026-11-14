// Canvas stage — the canvas element + attach lifecycle
// (docs/07_UI_ARCHITECTURE.md §13.1). Sprint 4, Commit U6.
//
// The session constructs the renderer, synchronizes the round store once,
// and drives frame + round-store sync per rAF (§8, §11). The cleanup
// detaches: one attach, one detach per mount, so StrictMode's double-mount
// and repeated remounts leave exactly one sink. Subscribes to no store —
// nothing re-renders it.

import { useEffect, useRef } from "react";
import { gameSession } from "@/ui/session";

export function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return gameSession.attachCanvas(canvas);
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
