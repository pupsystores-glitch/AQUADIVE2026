// Round store — the engine-state mirror (docs/07_UI_ARCHITECTURE.md §11).
// Sprint 4, Commit U4b.
//
// The pull-model boundary (docs/06 §12, delta D5): one writer — the driver's
// per-frame `sync`, wired by the session (src/ui/session.ts) — and a
// read-only surface for components. The engine stays the only authority for
// round and bonus state; this store never interprets, decides or submits
// anything. Framework-free: no React import, ever (§9).
//
// Projected and normalized on write (correction C6 to §11's "stored as
// received"), because two engine facts make a raw mirror unsound:
//
// - `participants` (E-X3: one entry per bet slot) holds the state machine's live objects. The engine flips
//   `cashedOut`, `cashedOutAt` and `bonusEligible` on it in place, so a
//   stored reference would change underneath the snapshot and a reference
//   check would never see the change. It is copied field by field.
// - `getPublicState()` builds a new object every frame. Storing it as
//   received would notify every frame. Instead the previous snapshot is
//   reused when every field is unchanged, so quiet frames notify nobody
//   (§9's equal-value bailout), and unchanged sub-objects keep their
//   identity so reference selectors stay stable.
//
// Chests are projected defensively, not retained. The engine itself never
// mutates a chest array in place (it is reassigned at bonus entry and at
// dive start, and `opened` is never written), but the array is not the
// engine's to vouch for: it is produced by the injectable RoundAuthority and
// handed by reference to every `chestsRevealed` listener. A frozen copy is
// made only when the contents change, and reused otherwise, so the cost is
// one small allocation per round.
//
// Every stored object is frozen: the read surface is read-only at runtime
// as well as in the types.

import type { BonusChest, EnginePublicState } from "@/engine";
import { createStore, type ReadableStore } from "./store";

/** The participant's round state as the UI sees it — an owned copy, never the engine object. */
export interface RoundParticipant {
  readonly betAmount: number;
  readonly cashedOut: boolean;
  readonly cashedOutAt: number | null;
  /** E-X1: auto-cashed at the jackpot — the only participant that may pick a chest. */
  readonly bonusEligible: boolean;
}

export type RoundParticipants = readonly [RoundParticipant | null, RoundParticipant | null];

export type RoundChest = Readonly<BonusChest>;
export type RoundChests = readonly [RoundChest, RoundChest, RoundChest];

/** The mirrored `EnginePublicState` (§11), normalized. */
export interface RoundState {
  readonly phase: EnginePublicState["phase"];
  readonly roundId: number;
  readonly countdownSeconds: number;
  readonly multiplier: number;
  readonly boost: number;
  /** E-X3: per-slot participant state, index = BetSlot. */
  readonly participants: RoundParticipants;
  readonly chests: RoundChests | null;
  readonly chosenChestId: 0 | 1 | 2 | null;
}

/** What components see: read-only. */
export type RoundStore = ReadableStore<RoundState>;

/** What the session keeps: the read surface plus the one write path (the driver's sync). */
export interface RoundStoreHandle {
  readonly store: RoundStore;
  /** Mirror one engine public-state read. Notifies only when a field changed. */
  write(state: EnginePublicState): void;
}

const projectParticipant = (
  source: EnginePublicState["participants"][number],
  previous: RoundParticipant | null,
): RoundParticipant | null => {
  if (source === null) return null;
  if (
    previous !== null &&
    Object.is(previous.betAmount, source.betAmount) &&
    previous.cashedOut === source.cashedOut &&
    Object.is(previous.cashedOutAt, source.cashedOutAt) &&
    previous.bonusEligible === source.bonusEligible
  ) {
    return previous;
  }
  return Object.freeze({
    betAmount: source.betAmount,
    cashedOut: source.cashedOut,
    cashedOutAt: source.cashedOutAt,
    bonusEligible: source.bonusEligible,
  });
};

const projectParticipants = (
  source: EnginePublicState["participants"],
  previous: RoundParticipants | null,
): RoundParticipants => {
  const p0 = projectParticipant(source[0], previous?.[0] ?? null);
  const p1 = projectParticipant(source[1], previous?.[1] ?? null);
  if (previous !== null && previous[0] === p0 && previous[1] === p1) return previous;
  return Object.freeze([p0, p1] as const);
};

const sameChest = (a: RoundChest, b: Readonly<BonusChest>): boolean =>
  a.id === b.id && Object.is(a.multiplier, b.multiplier) && a.opened === b.opened;

const copyChest = (c: Readonly<BonusChest>): RoundChest =>
  Object.freeze({ id: c.id, multiplier: c.multiplier, opened: c.opened });

const projectChests = (
  source: EnginePublicState["chests"],
  previous: RoundChests | null,
): RoundChests | null => {
  if (source === null) return null;
  if (
    previous !== null &&
    sameChest(previous[0], source[0]) &&
    sameChest(previous[1], source[1]) &&
    sameChest(previous[2], source[2])
  ) {
    return previous;
  }
  return Object.freeze([copyChest(source[0]), copyChest(source[1]), copyChest(source[2])] as const);
};

const project = (source: EnginePublicState, previous: RoundState | null): RoundState => {
  const participants = projectParticipants(source.participants, previous?.participants ?? null);
  const chests = projectChests(source.chests, previous?.chests ?? null);
  if (
    previous !== null &&
    previous.phase === source.phase &&
    previous.roundId === source.roundId &&
    Object.is(previous.countdownSeconds, source.countdownSeconds) &&
    Object.is(previous.multiplier, source.multiplier) &&
    Object.is(previous.boost, source.boost) &&
    previous.participants === participants &&
    previous.chests === chests &&
    previous.chosenChestId === source.chosenChestId
  ) {
    return previous;
  }
  return Object.freeze({
    phase: source.phase,
    roundId: source.roundId,
    countdownSeconds: source.countdownSeconds,
    multiplier: source.multiplier,
    boost: source.boost,
    participants,
    chests,
    chosenChestId: source.chosenChestId,
  });
};

/**
 * Create the round store, seeded from one engine public-state read (the
 * session passes `engine.getPublicState()` at construction — a pure read,
 * SSR-safe). No event subscriptions, no timers: nothing to tear down.
 */
export function createRoundStore(initial: EnginePublicState): RoundStoreHandle {
  const store = createStore<RoundState>(project(initial, null));
  return {
    store: { get: store.get, subscribe: store.subscribe },
    // Equal snapshots are returned by reference, and createStore's
    // Object.is bailout then skips the notification.
    write: (state) => store.set(project(state, store.get())),
  };
}
