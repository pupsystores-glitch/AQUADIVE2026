// Dev rejection banner — the small dismissible development-only surface for
// engine command rejections (docs/07_UI_ARCHITECTURE.md §12; deferred from
// U4 to U6 by owner decision C3). Sprint 4, Commit U6. New dev-only markup,
// sanctioned by §12 — not part of the byte-identical production UI.
//
// Reads the notification store's bounded rejection history (recorded only
// when the session opts in to diagnostics, and only in DEV builds — the
// production store's `rejections` is always empty). Rendered only under
// `import.meta.env.DEV` (the composition in GameScreen is also gated, so
// production builds compile the banner out, like the rest of the §12
// diagnostics). Dismissing hides the banner until a NEW rejection arrives;
// today's UI disables invalid actions before submit, so a visible rejection
// is a bug indicator, not a UX state.

import { useState } from "react";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import type { RejectionRecord } from "@/ui/store/notification-store";
import { STRINGS } from "@/ui/strings";

const { notifications } = gameSession;

export function DevRejectionBanner() {
  const rejections = useStore(notifications, (n) => n.rejections);
  const [dismissed, setDismissed] = useState<RejectionRecord | null>(null);

  if (!import.meta.env.DEV) return null;
  const latest = rejections.length > 0 ? rejections[0] : null;
  if (latest === null || latest === dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-40 px-4">
      <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/15 px-3 py-1.5 text-[11px] font-semibold text-danger backdrop-blur-sm">
        <span className="truncate">
          {STRINGS.dev.rejection(latest.command.type, latest.reason)}{" "}
          {STRINGS.dev.rejectionCount(rejections.length)}
        </span>
        <button
          onClick={() => setDismissed(latest)}
          aria-label={STRINGS.dev.dismissLabel}
          className="shrink-0 font-bold active:scale-95"
        >
          {STRINGS.dev.dismiss}
        </button>
      </div>
    </div>
  );
}
