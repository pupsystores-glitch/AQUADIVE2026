// CH1 (owner instruction 2026-11-17): the premium chest presentation.
// Picking any chest opens exactly that chest, the other two stay closed,
// and the chosen chest's multiplier appears large and centred in a polite
// status region. The F8 glints stay within their cap. Driven by the same
// scripted session as the characterization pins (chests 2× / 6.5× / 30×).
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { bootScreen, slotButton } from "@/ui/test/dom-harness";
import {
  CHEST_BURST_LAYOUT,
  CHEST_GLINT_CAP,
  REVEAL_SPARKLE_LAYOUT,
} from "@/ui/components/chest-fx";

const SCRIPTED_CHESTS = ["2.00×", "6.50×", "30.00×"] as const;

const picker = () => screen.getByRole("group", { name: /pick a chest/i });
const chestButtons = () => within(picker()).getAllByRole("button");
/** Whether a chest button's art is drawn open. */
const isOpen = (b: HTMLElement) => b.querySelector("svg.chest-art")?.hasAttribute("data-open");

async function reachBonus() {
  const h = await bootScreen();
  h.mount();
  await h.user.click(slotButton("10"));
  await h.user.click(slotButton(/^PLACE BET/));
  h.untilState("bonus");
  h.frames(1);
  return h;
}

describe("bonus chest presentation (CH1)", () => {
  it("before the pick: three closed chests, an empty reveal and no glints", async () => {
    await reachBonus();
    const chests = chestButtons();
    expect(chests).toHaveLength(3);
    expect(chests.map(isOpen)).toEqual([false, false, false]);
    // Three distinct art instances (unique gradient ids per chest).
    const ids = chests.map((b) => b.querySelector("linearGradient")?.id);
    expect(new Set(ids).size).toBe(3);
    expect(within(picker()).getByRole("status").textContent).toBe("");
    expect(picker().querySelectorAll(".chest-glint")).toHaveLength(0);
  });

  for (const id of [0, 1, 2] as const) {
    it(`picking chest ${id + 1} opens only that chest and centres its multiplier`, async () => {
      const h = await reachBonus();
      await h.user.click(chestButtons()[id]);
      h.tick(); // the command applies on the next tick (D4)

      expect(h.session.engine.getPublicState().chosenChestId).toBe(id);
      const chests = chestButtons();
      expect(chests.map(isOpen)).toEqual([0, 1, 2].map((i) => i === id));
      expect(chests[id].textContent).toBe(`+${SCRIPTED_CHESTS[id]}`);
      expect(chests.filter((_, i) => i !== id).map((b) => b.textContent)).toEqual(["???", "???"]);
      expect(within(picker()).getByRole("status").textContent).toBe(
        `Bonus multiplier${SCRIPTED_CHESTS[id]}`,
      );
      // The burst sits on the chosen chest only.
      expect(chests[id].querySelectorAll(".chest-glint")).toHaveLength(CHEST_BURST_LAYOUT.length);
      for (const [i, b] of chests.entries()) {
        if (i !== id) expect(b.querySelectorAll(".chest-glint")).toHaveLength(0);
      }
    });
  }

  it("keeps every glint of one opening within the F8 cap", async () => {
    expect(CHEST_BURST_LAYOUT.length + REVEAL_SPARKLE_LAYOUT.length).toBe(CHEST_GLINT_CAP);
    expect(CHEST_GLINT_CAP).toBeLessThanOrEqual(16);
    const h = await reachBonus();
    await h.user.click(chestButtons()[2]);
    h.tick();
    expect(picker().querySelectorAll(".chest-glint").length).toBeLessThanOrEqual(CHEST_GLINT_CAP);
  });
});
