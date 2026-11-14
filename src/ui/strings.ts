// User-facing strings — the localization seam (docs/07_UI_ARCHITECTURE.md
// §14). Sprint 4, Commit U6.
//
// Every user-facing string lives here, in one typed module; components
// render STRINGS values and never hardcode text (§6). Where text
// interpolates values the entry is a function, so word order is never
// hardcoded at a call site — the i18n-proof shape. Values are passed
// pre-formatted (formatMoney / formatMultiplier / toFixed, from
// src/game/presentation.ts and the call sites), keeping formatting and
// wording separately replaceable.
//
// Exception — DOM structure preservation: where the shell rendered a value
// and literal text as separate JSX children (e.g. `{m}×`, `+{amount}`,
// `Bet · {tier}`), the DOM holds separate text nodes. Those entries are
// fixed text parts (prefix / suffix) and the component renders the value as
// its own child, so the text-node structure is unchanged (U3 pins, §21).
//
// Extracted byte-identically from the component shell in U6 (§14 landing
// rule): rendered text is unchanged. Dev-only diagnostics strings (the §12
// rejection banner, compiled out of production) live under `dev`.

export const STRINGS = {
  units: {
    /** Multiplier sign, rendered as its own text node after the value. */
    multiplierSign: "×",
  },
  topBar: {
    tagline: "REAL-TIME",
    title: "AQUADIVE",
    /** Trailing space: the balance value follows in the same line. */
    balanceLabel: "Balance ",
  },
  history: {
    empty: "No rounds yet",
  },
  hud: {
    multiplierLabel: "Multiplier",
    /** Trailing space: the potential-win amount follows in the same line. */
    potentialLabel: "Potential ",
    spectating: "Spectating this dive",
    /** Trailing space: the countdown value follows in the same line. */
    countdownPrefix: "Next dive in ",
    /** Rendered as its own text node after the countdown value. */
    secondsSuffix: "s",
    goldenBoost: "GOLDEN BOOST",
  },
  crash: {
    title: "CHAIN SNAPPED",
  },
  winFlash: {
    title: "CASHED OUT",
    /** Rendered as its own text node before the amount. */
    amountPrefix: "+",
    /** Trailing space; the multiplier value and sign follow as separate text nodes. */
    atPrefix: "at ",
  },
  chests: {
    title: "Pirate Wreck — Pick a Chest",
    hidden: "???",
    revealed: (multiplier: string) => `+${multiplier}`,
    /** Accessible description telling the three chests apart (QA fix; not rendered as text). */
    position: (n: number, of: number) => `Chest ${n} of ${of}`,
  },
  panel: {
    decrease: "−",
    increase: "+",
    /** Trailing space; the chain tier follows as a separate text node. */
    betLabelPrefix: "Bet · ",
    /** E-X3: a bet slot's panel heading and accessible name (1-based). */
    slotLabel: (n: number) => `BET ${n}`,
    /** Accessible name of a slot's amount field (QA fix; not rendered as text). */
    stakeLabel: (n: number) => `BET ${n} stake`,
  },
  actions: {
    cashOut: (amount: string) => `CASH OUT · ${amount}`,
    secured: (amount: string) => `SECURED +${amount} · WATCHING DIVE…`,
    spectating: "SPECTATING · NEXT ROUND SOON",
    betLocked: (seconds: string) => `BET LOCKED · DIVE IN ${seconds}s`,
    placeBet: (seconds: string) => `PLACE BET · ${seconds}s`,
    waiting: "WAITING…",
  },
  /** Dev-only diagnostics (§12). Never rendered in production builds. */
  dev: {
    rejection: (command: string, reason: string) => `REJECTED ${command} · ${reason}`,
    rejectionCount: (count: number) => `×${count}`,
    dismiss: "✕",
    dismissLabel: "Dismiss rejection banner",
  },
} as const;
