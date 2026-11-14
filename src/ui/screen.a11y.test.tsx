// Keyboard accessibility — DOM tests (Sprint 4 QA fix, 2026-11-14).
//
// Browser QA found three keyboard defects: the amount fields had no
// accessible name; focus fell back to the page whenever the focused betting
// control disabled itself (PLACE BET → BET LOCKED, CASH OUT → SECURED /
// WAITING…, the dive locking the stake field); and the timed chest pick was
// unreachable by Tab from the betting panel, with three identical "???"
// chests. These tests pin the fixes. The existing characterization pins are
// untouched: accessible names of buttons are unchanged.
import { describe, expect, it } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { bootScreen, slotBetInput, slotButton, slotPanel } from "@/ui/test/dom-harness";

/** Let MutationObserver callbacks (microtasks) run. */
const flush = () => act(async () => {});
const active = () => document.activeElement;
const chestButtons = () =>
  within(screen.getByRole("group", { name: /pick a chest/i })).getAllByRole("button");

describe("accessible names", () => {
  it("each amount field is named after its slot", async () => {
    const h = await bootScreen();
    h.mount();
    expect(screen.getByRole("spinbutton", { name: "BET 1 stake" })).toBe(slotBetInput(0));
    expect(screen.getByRole("spinbutton", { name: "BET 2 stake" })).toBe(slotBetInput(1));
  });

  it("slot panels are focus targets outside the Tab order", async () => {
    const h = await bootScreen();
    h.mount();
    for (const slot of [0, 1] as const) {
      expect(slotPanel(slot).getAttribute("tabindex")).toBe("-1");
    }
  });
});

describe("focus stays in the slot when its control disables itself", () => {
  it("PLACE BET by keyboard: focus moves to the slot panel, and Tab continues inside it", async () => {
    const h = await bootScreen();
    h.mount();
    slotButton(/^PLACE BET/, 0).focus();
    await h.user.keyboard("{Enter}");
    h.tick();
    await flush();
    expect(slotButton(/^BET LOCKED/, 0).hasAttribute("disabled")).toBe(true);
    expect(active()).toBe(slotPanel(0));
    await h.user.tab();
    expect(slotPanel(0).contains(active())).toBe(true);
    expect(active()).not.toBe(slotPanel(0));
  });

  it("CASH OUT by keyboard on BET 2: focus moves to BET 2's panel; BET 1 is untouched", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(slotButton(/^PLACE BET/, 0));
    await h.user.click(slotButton(/^PLACE BET/, 1));
    h.tick();
    h.untilState("diving");
    h.frames(10);
    slotButton(/^CASH OUT/, 1).focus();
    await h.user.keyboard("{Enter}");
    h.tick();
    await flush();
    expect(slotButton(/^SECURED/, 1).hasAttribute("disabled")).toBe(true);
    expect(active()).toBe(slotPanel(1));
    expect(slotButton(/^CASH OUT/, 0).hasAttribute("disabled")).toBe(false);
  });

  it("the dive locking the focused amount field moves focus to the panel", async () => {
    const h = await bootScreen();
    h.mount();
    slotBetInput(1).focus();
    h.untilState("diving");
    await flush();
    expect(slotBetInput(1).disabled).toBe(true);
    expect(active()).toBe(slotPanel(1));
  });

  it("never takes focus back from an element the player moved to", async () => {
    const h = await bootScreen();
    h.mount();
    slotButton(/^PLACE BET/, 0).focus();
    slotBetInput(1).focus(); // the player moves on
    h.session.submit({ type: "placeBet", slot: 0, amount: 5 });
    h.tick();
    await flush();
    expect(slotButton(/^BET LOCKED/, 0).hasAttribute("disabled")).toBe(true);
    expect(active()).toBe(slotBetInput(1));
  });
});

describe("chest picker keyboard access", () => {
  it("opens with focus on the first chest, describes each chest, keeps focus after the pick and returns it on close", async () => {
    const h = await bootScreen(); // never crashes: rides to the jackpot
    h.mount();
    slotButton(/^PLACE BET/, 0).focus();
    await h.user.keyboard("{Enter}");
    h.tick();
    await flush();
    expect(active()).toBe(slotPanel(0)); // parked on the panel

    h.untilState("bonus");
    h.frames(1);
    await flush();
    const chests = chestButtons();
    expect(chests).toHaveLength(3);
    expect(active()).toBe(chests[0]);
    expect(chests.map((c) => c.getAttribute("aria-description"))).toEqual([
      "Chest 1 of 3",
      "Chest 2 of 3",
      "Chest 3 of 3",
    ]);
    // The accessible names are unchanged (the pins look the chests up by them).
    expect(screen.getAllByRole("button", { name: "???" })).toHaveLength(3);

    await h.user.keyboard("{Enter}");
    h.tick();
    await flush();
    expect(chestButtons().every((c) => c.hasAttribute("disabled"))).toBe(true);
    const picker = screen.getByRole("group", { name: /pick a chest/i });
    expect(active()).toBe(picker);

    h.untilState("betting");
    await flush();
    expect(screen.queryByRole("group", { name: /pick a chest/i })).toBeNull();
    expect(active()).toBe(slotPanel(0)); // returned where it was
  });

  it("does not take focus from a control the player is using", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(slotButton(/^PLACE BET/, 0));
    h.tick();
    h.untilState("impact");
    await flush();
    slotBetInput(1).focus(); // typing the next stake (enabled outside the dive)
    expect(active()).toBe(slotBetInput(1));
    h.untilState("bonus");
    h.frames(1);
    await flush();
    expect(chestButtons()).toHaveLength(3);
    expect(active()).toBe(slotBetInput(1));
  });
});
