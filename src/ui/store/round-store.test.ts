// Round store unit tests (Sprint 4, Commit U4b; docs/07_UI_ARCHITECTURE.md
// §9, §11, correction C6). Pure node tests against hand-built
// EnginePublicState values: projection, normalization, identity reuse and
// notification bailout. The real-engine wiring is covered in
// src/ui/session.test.ts; the DOM behavior in src/ui/screen.round.test.tsx.
import { describe, expect, it, vi } from "vitest";
import type { BonusChest, EnginePublicState, ParticipantRoundState } from "@/engine";
import { createRoundStore } from "./round-store";

const chests = (): [BonusChest, BonusChest, BonusChest] => [
  { id: 0, multiplier: 2, opened: false },
  { id: 1, multiplier: 6.5, opened: false },
  { id: 2, multiplier: 30, opened: false },
];

const participant = (over: Partial<ParticipantRoundState> = {}): ParticipantRoundState => ({
  betAmount: 10,
  cashedOut: false,
  cashedOutAt: null,
  bonusEligible: false,
  ...over,
});

const state = (over: Partial<EnginePublicState> = {}): EnginePublicState => ({
  phase: "idle",
  roundId: 1,
  countdownSeconds: 5,
  multiplier: 1,
  boost: 0,
  participants: [null, null],
  chests: null,
  chosenChestId: null,
  ...over,
});

describe("createRoundStore — seed and surface", () => {
  it("is seeded from the initial public state, field for field", () => {
    const { store } = createRoundStore(state({ countdownSeconds: 4.5, roundId: 3 }));
    expect(store.get()).toEqual(state({ countdownSeconds: 4.5, roundId: 3 }));
  });

  it("exposes only get/subscribe; the snapshot and its sub-objects are frozen", () => {
    const { store } = createRoundStore(
      state({ participants: [participant(), null], chests: chests() }),
    );
    expect(Object.keys(store).sort()).toEqual(["get", "subscribe"]);
    const s = store.get();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.participants[0])).toBe(true);
    expect(Object.isFrozen(s.chests)).toBe(true);
    expect(s.chests!.every((c) => Object.isFrozen(c))).toBe(true);
    expect(() => {
      (s as { phase: string }).phase = "diving";
    }).toThrow(TypeError);
  });

  it("copies only the public fields (an engine object with extra fields does not leak them)", () => {
    const extra = { ...participant(), secret: 1 } as unknown as ParticipantRoundState;
    const { store } = createRoundStore(state({ participants: [extra, null] }));
    expect(Object.keys(store.get().participants[0]!).sort()).toEqual([
      "betAmount",
      "bonusEligible",
      "cashedOut",
      "cashedOutAt",
    ]);
  });
});

describe("createRoundStore — writes, identity and notification", () => {
  it("an unchanged write keeps the snapshot by reference and notifies nobody", () => {
    const p = participant();
    const c = chests();
    const { store, write } = createRoundStore(state({ participants: [p, null], chests: c }));
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);
    // A fresh public-state object each time, as getPublicState() builds per frame.
    for (let i = 0; i < 5; i++) write(state({ participants: [p, null], chests: c }));
    // Equal values from different source objects are still unchanged.
    write(state({ participants: [participant(), null], chests: chests() }));
    expect(store.get()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    ["phase", { phase: "diving" }],
    ["roundId", { roundId: 2 }],
    ["countdownSeconds", { countdownSeconds: 4.98 }],
    ["multiplier", { multiplier: 1.01 }],
    ["boost", { boost: 0.4 }],
    ["chosenChestId", { chests: chests(), chosenChestId: 1 }],
  ] as const)("a change to %s produces a new snapshot and notifies once", (_, change) => {
    const { store, write } = createRoundStore(state({ chests: chests() }));
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);
    write(state({ chests: chests(), ...change }));
    expect(store.get()).not.toBe(before);
    expect(store.get()).toMatchObject(change);
    expect(listener).toHaveBeenCalledTimes(1);
    write(state({ chests: chests(), ...change })); // the same values again: quiet
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unchanged sub-objects keep their identity across a changed write", () => {
    const { store, write } = createRoundStore(
      state({
        phase: "bonus",
        participants: [participant({ bonusEligible: true }), null],
        chests: chests(),
      }),
    );
    const before = store.get();
    write(
      state({
        phase: "bonus",
        participants: [participant({ bonusEligible: true }), null],
        chests: chests(),
        chosenChestId: 2,
      }),
    );
    const after = store.get();
    expect(after).not.toBe(before);
    expect(after.participants[0]).toBe(before.participants[0]);
    expect(after.chests).toBe(before.chests);
  });
});

describe("createRoundStore — mutable participant data (C6)", () => {
  it("the stored participant is a copy: mutating the source afterwards cannot change the stored snapshot", () => {
    const live = participant();
    const { store } = createRoundStore(state({ phase: "diving", participants: [live, null] }));
    const held = store.get();
    expect(held.participants[0]).not.toBe(live);

    // What the engine does at impact: flip fields on its own object in place.
    live.cashedOut = true;
    live.cashedOutAt = 100;
    live.bonusEligible = true;
    expect(held.participants[0]).toEqual({
      betAmount: 10,
      cashedOut: false,
      cashedOutAt: null,
      bonusEligible: false,
    });
    expect(store.get()).toBe(held);
  });

  it("an in-place change on the SAME source object is detected on the next write", () => {
    const live = participant();
    const { store, write } = createRoundStore(
      state({ phase: "diving", participants: [live, null] }),
    );
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);

    live.cashedOut = true;
    live.cashedOutAt = 100;
    live.bonusEligible = true;
    write(state({ phase: "diving", participants: [live, null] })); // same reference, new contents

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().participants[0]).not.toBe(before.participants[0]);
    expect(store.get().participants[0]).toEqual({
      betAmount: 10,
      cashedOut: true,
      cashedOutAt: 100,
      bonusEligible: true,
    });
    expect(before.participants[0]?.bonusEligible).toBe(false);
  });

  it("participant null ⇄ object transitions notify", () => {
    const { store, write } = createRoundStore(state());
    const listener = vi.fn();
    store.subscribe(listener);
    write(state({ participants: [participant(), null] }));
    expect(store.get().participants[0]).toEqual(participant());
    write(state({ participants: [null, null] }));
    expect(store.get().participants[0]).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("createRoundStore — chest reference safety", () => {
  it("chests are a defensive frozen copy, never the source array or its objects", () => {
    const source = chests();
    const { store } = createRoundStore(state({ phase: "bonus", chests: source }));
    const held = store.get().chests!;
    expect(held).not.toBe(source);
    held.forEach((c, i) => expect(c).not.toBe(source[i]));
    expect(held).toEqual(source);

    source[1].multiplier = 999;
    source[2].opened = true;
    expect(held[1].multiplier).toBe(6.5);
    expect(held[2].opened).toBe(false);
  });

  it("an equal-content array (same or new reference) keeps the stored copy; changed contents replace it", () => {
    const source = chests();
    const { store, write } = createRoundStore(state({ phase: "bonus", chests: source }));
    const held = store.get().chests;
    write(state({ phase: "bonus", chests: source }));
    write(state({ phase: "bonus", chests: chests() }));
    expect(store.get().chests).toBe(held);

    source[0].opened = true; // an in-place change is seen on the next write
    write(state({ phase: "bonus", chests: source }));
    expect(store.get().chests).not.toBe(held);
    expect(store.get().chests![0].opened).toBe(true);
    expect(held![0].opened).toBe(false);
  });

  it("a new round's chests replace the old copy; chests → null clears it", () => {
    const { store, write } = createRoundStore(state({ phase: "bonus", chests: chests() }));
    const first = store.get().chests;
    const next = chests();
    next[0].multiplier = 3;
    write(state({ phase: "bonus", roundId: 2, chests: next }));
    expect(store.get().chests).not.toBe(first);
    expect(store.get().chests![0].multiplier).toBe(3);
    write(state({ phase: "diving", roundId: 2, chests: null }));
    expect(store.get().chests).toBeNull();
  });
});
