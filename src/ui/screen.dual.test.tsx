// E-X3 Dual Bet — DOM tests (owner-approved 2026-11-14). The two betting
// panels are real engine slots: each places, locks and cashes out on its
// own, through the session's command edge. Controls are found with the
// strict slot-scoped helpers (dom-harness.tsx): a query for one slot can
// never be satisfied by the other slot's panel.
import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { bootScreen, slotBetInput, slotButton, slotPanel } from "@/ui/test/dom-harness";
import { payoutOracle } from "@/ui/test/money-oracle";

const balanceText = () => screen.getByText("Balance").nextSibling?.textContent;

describe("dual bet panels", () => {
  it("both panels render side by side with their own stake and an enabled PLACE BET", async () => {
    const h = await bootScreen();
    h.mount();
    for (const slot of [0, 1] as const) {
      const panel = slotPanel(slot);
      expect(within(panel).getByText(`BET ${slot + 1}`)).toBeTruthy();
      expect(slotBetInput(slot).value).toBe("5");
      expect(slotButton(/^PLACE BET · /, slot).hasAttribute("disabled")).toBe(false);
    }
  });

  it("each panel's stake is its own: editing BET 2 leaves BET 1 unchanged", async () => {
    const h = await bootScreen();
    h.mount();
    fireEvent.change(slotBetInput(1), { target: { value: "12.5" } });
    expect(slotBetInput(1).value).toBe("12.5");
    expect(slotBetInput(0).value).toBe("5");
    await h.user.click(slotButton("25", 0));
    expect(slotBetInput(0).value).toBe("25");
    expect(h.session.betInputs.map((b) => b.get())).toEqual([25, 12.5]);
  });

  it("BET 2 alone places a real engine bet; BET 1 stays open for its own bet", async () => {
    const h = await bootScreen();
    h.mount();
    fireEvent.change(slotBetInput(1), { target: { value: "7" } });
    await h.user.click(slotButton(/^PLACE BET/, 1));
    h.tick();
    expect(h.session.engine.getPublicState().participants[1]?.betAmount).toBe(7);
    expect(h.session.engine.getPublicState().participants[0]).toBeNull();
    expect(slotButton(/^BET LOCKED/, 1).hasAttribute("disabled")).toBe(true);
    expect(slotButton(/^PLACE BET/, 0).hasAttribute("disabled")).toBe(false);
    expect(balanceText()).toBe("993.00");
  });

  it("both bets ride; each CASH OUT is independent, shows its own payout, and settles only its slot", async () => {
    const h = await bootScreen(); // never crashes: rides to the sea floor
    h.mount();
    fireEvent.change(slotBetInput(0), { target: { value: "10" } });
    fireEvent.change(slotBetInput(1), { target: { value: "20" } });
    await h.user.click(slotButton(/^PLACE BET/, 0));
    await h.user.click(slotButton(/^PLACE BET/, 1));
    h.tick();
    expect(balanceText()).toBe("970.00");

    h.untilState("diving");
    h.frames(30);
    const m1 = h.session.round.get().multiplier;
    expect(slotButton(/^CASH OUT · /, 0).textContent).toBe(
      `CASH OUT · ${payoutOracle(10, m1).toFixed(2)}`,
    );
    expect(slotButton(/^CASH OUT · /, 1).textContent).toBe(
      `CASH OUT · ${payoutOracle(20, m1).toFixed(2)}`,
    );
    // The overlay's potential is the sum of both slots' separately rounded-down payouts.
    expect(screen.getByText("Potential").textContent).toBe(
      `Potential ${(payoutOracle(10, m1) + payoutOracle(20, m1)).toFixed(2)}`,
    );

    await h.user.click(slotButton(/^CASH OUT · /, 1));
    h.tick();
    const w = h.session.wallet.get();
    const win1 = w.slots[1].win!;
    expect(w.slots[1].settledBy).toBe("cashout");
    expect(w.slots[0].settledBy).toBeNull();
    expect(slotButton(`SECURED +${win1.amount.toFixed(2)} · WATCHING DIVE…`, 1)).toBeTruthy();
    expect(slotButton(/^CASH OUT · /, 0).hasAttribute("disabled")).toBe(false); // BET 1 still live

    h.frames(20);
    await h.user.click(slotButton(/^CASH OUT · /, 0));
    h.tick();
    const after = h.session.wallet.get();
    expect(after.slots[0].settledBy).toBe("cashout");
    expect(after.slots[0].win!.mult).toBeGreaterThan(win1.mult); // later tick, higher multiplier
    expect(slotButton(/^SECURED \+/, 0)).toBeTruthy();
    expect(after.balance).toBe(
      +(970 + payoutOracle(20, win1.mult) + payoutOracle(10, after.slots[0].win!.mult)).toFixed(2),
    );
  });

  it("a slot riding to the sea floor gets the chest picker; one pick pays it, the cashed slot keeps its cashout", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(slotButton(/^PLACE BET/, 0));
    await h.user.click(slotButton(/^PLACE BET/, 1));
    h.tick();
    h.untilState("diving");
    h.frames(10);
    await h.user.click(slotButton(/^CASH OUT · /, 0));
    h.tick();
    h.untilState("bonus");
    h.frames(1);
    const chests = screen.getAllByRole("button", { name: "???" });
    expect(chests).toHaveLength(3);
    const beforePick = h.session.wallet.get().balance;
    await h.user.click(chests[1]);
    h.tick();
    const w = h.session.wallet.get();
    expect(w.slots[0].chestSettled).toBe(false);
    expect(w.slots[1].chestSettled).toBe(true);
    expect(w.balance).toBeGreaterThan(beforePick);
  });

  it("insufficient balance for the second bet: BET 2's PLACE BET disables once BET 1 has taken the balance", async () => {
    const h = await bootScreen();
    h.mount();
    fireEvent.change(slotBetInput(0), { target: { value: "998" } });
    await h.user.click(slotButton(/^PLACE BET/, 0));
    h.tick();
    expect(balanceText()).toBe("2.00");
    expect(slotButton(/^PLACE BET/, 1).hasAttribute("disabled")).toBe(true); // stake 5 > 2
    fireEvent.change(slotBetInput(1), { target: { value: "2" } });
    expect(slotButton(/^PLACE BET/, 1).hasAttribute("disabled")).toBe(false);
  });
});
