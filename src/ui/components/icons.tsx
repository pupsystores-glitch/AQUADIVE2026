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

export function ChestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v1H4v-1Z" opacity="0.7" />
      <path d="M4 12h16v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7Z" />
      <rect x="10" y="13" width="4" height="4" rx="0.5" fill="#1a0e06" />
    </svg>
  );
}
