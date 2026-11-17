// Dev audio diagnostics panel — TEMPORARY, development-only (IOS-AUDIO,
// docs/08 §14 risk 17). Shown only in DEV builds with `?audiodebug=1`; the
// composition in GameScreen is gated on import.meta.env.DEV as well, so
// production builds compile it out.
//
// Rendered into document.body through a portal, after mount (client only),
// so the game's DOM, layout and SSR markup are unchanged. It reads the
// recorder in src/ui/audio-diagnostics.ts. Its one action, "Play BET 1",
// plays the approved BET 1 cue through the normal manager; mute and the
// unlock rules still apply. No game state, wallet or engine is touched.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { audioDiagnostics } from "@/ui/audio-diagnostics-instance";

export function DevAudioDiagnostics() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!import.meta.env.DEV || !audioDiagnostics) return;
    const remove = audioDiagnostics.install();
    setMounted(true);
    return remove;
  }, []);

  useEffect(() => {
    if (!mounted || !open || !audioDiagnostics) return;
    const diagnostics = audioDiagnostics;
    const refresh = () => setText(diagnostics.report());
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, [mounted, open]);

  if (!import.meta.env.DEV || !audioDiagnostics || !mounted) return null;
  const diagnostics = audioDiagnostics;

  const copy = () => {
    const report = diagnostics.report();
    const clipboard = (globalThis as { navigator?: Navigator }).navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      clipboard.writeText(report).then(
        () => setCopied("copied"),
        () => setCopied("copy blocked: select the text below instead"),
      );
    } else {
      setCopied("no clipboard here: select the text below instead");
    }
  };

  const panel = (
    <div
      data-testid="dev-audio-diagnostics"
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        top: 8,
        zIndex: 2147483647,
        maxHeight: open ? "70dvh" : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
        borderRadius: 8,
        background: "rgba(0, 0, 0, 0.88)",
        color: "#e6f6ff",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <strong style={{ alignSelf: "center", marginRight: "auto" }}>
          Audio diagnostics (DEV)
        </strong>
        <button
          type="button"
          onClick={() => setText(`${diagnostics.testSound()}\n\n${diagnostics.report()}`)}
          style={buttonStyle}
        >
          Play BET 1
        </button>
        <button type="button" onClick={copy} style={buttonStyle}>
          Copy report
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} style={buttonStyle}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {copied && <div>{copied}</div>}
      {open && (
        <textarea
          readOnly
          value={text}
          aria-label="Audio diagnostics report"
          style={{
            flex: 1,
            minHeight: "40dvh",
            width: "100%",
            resize: "none",
            background: "transparent",
            color: "inherit",
            font: "inherit",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 4,
            padding: 4,
          }}
        />
      )}
    </div>
  );
  return createPortal(panel, document.body);
}

const buttonStyle = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.4)",
  background: "rgba(255,255,255,0.12)",
  color: "inherit",
  font: "inherit",
} as const;
