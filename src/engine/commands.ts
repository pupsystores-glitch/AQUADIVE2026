// EngineCommand — the engine's input edge (docs/06_ENGINE_ARCHITECTURE.md
// §13). These shapes ARE the future protocol messages (client → server,
// Phase 8). Defined in E3 so the event map's `commandRejected` payload is
// finalized together with the bus (§12: "shapes finalized in the extraction
// commit that lands the bus"); the command QUEUE that consumes these lands
// in E5.
//
// E-X3 (Dual Bet, owner-approved 2026-11-14): a player holds up to two
// independent bets per round. `placeBet` and `cashOut` carry a mandatory
// `slot`; `pickChest` stays per round (one chest, applied to every
// eligible slot).

/** A bet slot: the player's first (0) or second (1) independent bet. */
export type BetSlot = 0 | 1;

/** Both slots, in order. */
export const BET_SLOTS: readonly BetSlot[] = [0, 1];

export type EngineCommand =
  | { type: "placeBet"; slot: BetSlot; amount: number }
  | { type: "cashOut"; slot: BetSlot }
  | { type: "pickChest"; chestId: 0 | 1 | 2 };
