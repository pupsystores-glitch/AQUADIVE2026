// SVG icon components — moved unchanged from the component shell
// (docs/07_UI_ARCHITECTURE.md §13.3). Sprint 4, Commit U6.

export function AnchorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v15" />
      <path d="M8 11h8" />
      <path d="M5 18a7 7 0 0 0 7 4 7 7 0 0 0 7-4" />
    </svg>
  );
}

/**
 * Illustrated treasure chest for the bonus picker: planked wood, gold bands,
 * rivets and a hasp. `open` lifts the lid and spills a gold glow. The middle of
 * the front is left clear for the multiplier label drawn over it. Decorative
 * only (aria-hidden), so the button's accessible name stays its visible text.
 */
export function TreasureChestArt({
  id,
  open = false,
  className,
}: {
  id: string;
  open?: boolean;
  className?: string;
}) {
  const url = (n: string) => `url(#${id}-${n})`;
  const gold = url("gold");
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a4420" />
          <stop offset="0.55" stopColor="#5a2f14" />
          <stop offset="1" stopColor="#331807" />
        </linearGradient>
        <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a5a2c" />
          <stop offset="1" stopColor="#5a2f14" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.45" stopColor="#f3c84a" />
          <stop offset="1" stopColor="#a8701c" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3b0" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#f3c84a" stopOpacity="0.4" />
          <stop offset="1" stopColor="#f3c84a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="60" cy="95" rx="50" ry="4" fill="#000" opacity="0.45" />
      {open && <ellipse cx="60" cy="38" rx="60" ry="36" fill={url("glow")} />}

      {/* lid */}
      <g transform={open ? "translate(0 -12) rotate(-10 10 46)" : undefined}>
        <path
          d="M10 46 V36 Q10 14 60 14 Q110 14 110 36 V46 Z"
          fill={url("lid")}
          stroke="#1f0e04"
          strokeWidth="2"
        />
        <path
          d="M14 30 Q60 22 106 30"
          stroke="#3a1c0a"
          strokeWidth="1.2"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M24 46 V22 Q24 17 30 16 L36 15.5 V46 Z"
          fill={gold}
          stroke="#5a3a0c"
          strokeWidth="1"
        />
        <path
          d="M96 46 V22 Q96 17 90 16 L84 15.5 V46 Z"
          fill={gold}
          stroke="#5a3a0c"
          strokeWidth="1"
        />
        <rect
          x="8"
          y="42"
          width="104"
          height="6"
          rx="2"
          fill={gold}
          stroke="#5a3a0c"
          strokeWidth="1"
        />
        {/* hasp */}
        <path d="M54 38 H66 V50 Q60 54 54 50 Z" fill={gold} stroke="#5a3a0c" strokeWidth="1" />
        <circle cx="60" cy="45" r="1.8" fill="#2a1306" />
      </g>

      {open && (
        <g stroke="#a8701c" strokeWidth="0.8">
          <ellipse cx="60" cy="48" rx="46" ry="6" fill="#f3c84a" stroke="none" />
          <circle cx="38" cy="45" r="4" fill="#ffe27a" />
          <circle cx="52" cy="42.5" r="4" fill="#ffe27a" />
          <circle cx="68" cy="43.5" r="4" fill="#ffe27a" />
          <path d="M84 39 l4 4 -4 4 -4 -4 Z" fill="#5ad0ff" stroke="#1d6f94" />
        </g>
      )}

      {/* body */}
      <rect
        x="12"
        y="48"
        width="96"
        height="42"
        rx="3"
        fill={url("wood")}
        stroke="#1f0e04"
        strokeWidth="2"
      />
      <path d="M14 62 H106 M14 76 H106" stroke="#2a1306" strokeWidth="1.2" opacity="0.8" />
      <path d="M14 63 H106 M14 77 H106" stroke="#a0643a" strokeWidth="0.6" opacity="0.4" />
      <rect x="24" y="48" width="12" height="42" fill={gold} stroke="#5a3a0c" strokeWidth="1" />
      <rect x="84" y="48" width="12" height="42" fill={gold} stroke="#5a3a0c" strokeWidth="1" />
      <rect
        x="10"
        y="86"
        width="100"
        height="5"
        rx="2"
        fill={gold}
        stroke="#5a3a0c"
        strokeWidth="1"
      />
      {[55, 69, 82].map((y) => (
        <g key={y} fill="#fff1a8" stroke="#7a5214" strokeWidth="0.5">
          <circle cx="30" cy={y} r="1.6" />
          <circle cx="90" cy={y} r="1.6" />
        </g>
      ))}
    </svg>
  );
}
