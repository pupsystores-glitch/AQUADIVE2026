// UI presentation helpers — user-facing strings/labels derived from
// gameplay values. Moved verbatim from src/lib/abyss-game.ts in the E2
// domain consolidation: the engine emits no user-facing strings (docs/06
// §3), so these live with the React shell, not in src/engine.

export function formatMultiplier(m: number): string {
  return formatMultiplierValue(m) + "×";
}

// The multiplier number alone, for displays that render the "×" sign as a
// separate text node (U6: the shell's `{m.toFixed(2)}×` sites keep their
// DOM text-node structure). Identical digits to formatMultiplier.
export function formatMultiplierValue(m: number): string {
  return m.toFixed(2);
}

// Money display formatting — the U6 consolidation of the shell's scattered
// `.toFixed(2)` money displays (docs/07 §14): identical output, one
// definition. Display only; settlement math lives in src/ui/store (§10).
export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

// Chain tier from bet size
export function chainTier(bet: number): "rope" | "chain" | "heavy" {
  if (bet < 5) return "rope";
  if (bet < 25) return "chain";
  return "heavy";
}
