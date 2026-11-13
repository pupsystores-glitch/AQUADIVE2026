// UI-shell tuning for Abyss Anchor.
//
// After the E2 domain consolidation (docs/06_ENGINE_ARCHITECTURE.md §4)
// this module keeps only values owned by the React shell: betting-panel
// quick-picks, the history strip, and pure UI flash timings (presentation,
// not round lifecycle — docs/06 §8). Gameplay tuning moved to
// src/engine/domain/tuning.ts; world geometry to src/shared/world.ts;
// presentation constants to src/rendering. Values byte-identical.

// ----- Betting panel -----

/** Quick-select bet amounts shown under the bet input. */
export const QUICK_BETS = [1, 5, 10, 25, 100] as const;

/**
 * UI-only betting cutoff (seconds): PLACE BET is offered only while the
 * betting countdown is strictly above this value (U5, delta V4 — formerly
 * the inline `0.2` in the shell). A presentation restriction, not a round
 * rule: the engine accepts a bet until betting closes (docs/06 §5), and
 * neither the session nor the engine enforces this cutoff.
 */
export const BET_CUTOFF_SECONDS = 0.2;

// ----- Round history -----

/** Max number of past-round results kept in the history strip. */
export const HISTORY_LIMIT = 12;

// ----- UI flash timings (ms) -----

/** How long the green "CASHED OUT" flash stays visible after a manual cashout. */
export const CASH_FLASH_MS = 1800;

/** How long the "CASHED OUT" flash stays visible after a sea-floor jackpot. */
export const JACKPOT_FLASH_MS = 2200;
