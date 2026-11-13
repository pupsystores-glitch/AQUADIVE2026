// React remount + StrictMode regression tests (Sprint 4, Commit U3;
// docs/07_UI_ARCHITECTURE.md §8, §20 risk 5, delta V1).
//
// U2 verified remount survival at session level only (src/ui/session.test.ts
// simulates the mount effect through attachCanvas/detach); the owner
// accepted that no test or manual check had mounted the real component.
// These tests do: the actual React component is unmounted and mounted
// again in jsdom over the same module-scope session — exactly what a
// production remount does (the session module is not re-evaluated) — and
// under React.StrictMode, whose development double-mount runs every effect's
// cleanup + setup once more.
//
// Pins marked "PINNED UNTIL Ux" record documented current behavior that a
// later step is sanctioned to change (docs/07 §7, §17); they are updated in
// that step's commit, and only there.
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { bootScreen } from "@/ui/test/dom-harness";

/**
 * The component's display subscriptions (AbyssAnchor mount effect): the three
 * chest-display engine events. U4a moved wallet.onFlash and the flash-only
 * bettingOpened listener into the session-owned notification store (was 5).
 */
const DISPLAY_SUBSCRIPTIONS = 3;

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const balanceText = () => screen.getByText("Balance").nextSibling?.textContent;
const betInput = () => screen.getByRole("spinbutton") as HTMLInputElement;

describe("component remount over the same session", () => {
  it("unmount pauses the session and releases every component resource; remount reattaches once", async () => {
    const h = await bootScreen();
    const first = h.mount();
    expect(h.renderers).toHaveLength(1);
    expect(h.pendingFrames()).toBe(1);
    expect(h.subscriptions.active).toBe(DISPLAY_SUBSCRIPTIONS);

    first.unmount();
    expect(h.renderers[0].disposed).toBe(true);
    expect(h.pendingFrames()).toBe(0); // the driver loop stopped
    expect(h.session.driver.running).toBe(false);
    expect(h.subscriptions.active).toBe(0);

    h.mount();
    expect(h.renderers).toHaveLength(2); // a new renderer for the new canvas
    expect(h.renderers[1].disposed).toBe(false);
    expect(h.pendingFrames()).toBe(1); // exactly one loop
    expect(h.subscriptions.active).toBe(DISPLAY_SUBSCRIPTIONS);
  });

  it("remount mid-dive: the world does not advance while unmounted; the HUD resumes on the locked bet and the cashout settles exactly once", async () => {
    const h = await bootScreen({ crashPoint: 3 });
    const first = h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    const ticksAtUnmount = h.session.engine.tickCount;
    const walletAtUnmount = h.session.wallet.get();

    first.unmount();
    h.frames(120); // two seconds of wall time with nothing attached
    expect(h.session.engine.tickCount).toBe(ticksAtUnmount); // paused, not reset or fast-forwarded
    expect(h.session.wallet.get()).toBe(walletAtUnmount); // the same snapshot: nothing settled or reset

    h.mount();
    expect(balanceText()).toBe("990.00"); // the wallet survived the remount (V1)
    h.frames(1); // first frame after attach: zero delta, HUD sync
    expect(h.session.engine.tickCount).toBe(ticksAtUnmount);
    const m = h.session.engine.getPublicState().multiplier;
    expect(screen.getByText("Multiplier").nextElementSibling?.textContent).toBe(`${m.toFixed(2)}×`);
    const potential = (+(10 * m).toFixed(2)).toFixed(2);
    expect(button(`CASH OUT · ${potential}`).hasAttribute("disabled")).toBe(false);

    await h.user.click(button(/^CASH OUT · /));
    h.tick();
    const { lastWin, balance, history } = h.session.wallet.get();
    expect(lastWin!.amount).toBe(+(10 * lastWin!.mult).toFixed(2)); // against the locked 10, not the input
    expect(balance).toBe(+(990 + lastWin!.amount).toFixed(2));
    expect(balanceText()).toBe(balance.toFixed(2));
    expect(button(`SECURED +${lastWin!.amount.toFixed(2)} · WATCHING DIVE…`)).toBeTruthy();

    h.untilState("betting");
    expect(h.session.wallet.get().balance).toBe(balance); // credited once
    expect(history).toHaveLength(1);
    expect(h.session.wallet.get().history).toEqual([{ mult: lastWin!.mult, crashed: false }]); // one entry for the round
  });

  it("remount while the bet is locked in the betting window: BET LOCKED and the debit survive", async () => {
    const h = await bootScreen();
    const first = h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.tick();
    expect(button(/^BET LOCKED · DIVE IN /)).toBeTruthy();

    first.unmount();
    h.mount();
    h.frames(1);
    expect(balanceText()).toBe("995.00");
    expect(button(/^BET LOCKED · DIVE IN /).hasAttribute("disabled")).toBe(true);
    h.untilState("diving");
    h.frames(1);
    expect(button(/^CASH OUT · /).hasAttribute("disabled")).toBe(false);
  });

  it("PINNED UNTIL U5: the bet input is component state and resets to the default on remount; the locked bet is unaffected", async () => {
    const h = await bootScreen();
    const first = h.mount();
    await h.user.click(button("25"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(10);

    first.unmount();
    h.mount();
    h.frames(1);
    expect(betInput().value).toBe("5"); // DEFAULT_BET again
    const m = h.session.engine.getPublicState().multiplier;
    expect(button(`CASH OUT · ${(+(25 * m).toFixed(2)).toFixed(2)}`)).toBeTruthy(); // still the locked 25
  });

  it("PINNED UNTIL U4 (known U2 → U4 seam): remount during the bonus hides the picker — the round still completes through the E-X1 auto-pick and is credited", async () => {
    const h = await bootScreen();
    const first = h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("bonus");
    h.frames(1);
    expect(screen.getByText("Pirate Wreck — Pick a Chest")).toBeTruthy();

    first.unmount();
    h.mount();
    h.frames(1);
    // The engine still has the chests and the player is still eligible, but
    // the revealed chests were component state: the picker stays hidden.
    expect(h.session.engine.getPublicState().chests).not.toBeNull();
    expect(h.session.engine.getPublicState().participant?.bonusEligible).toBe(true);
    expect(screen.queryByText("Pirate Wreck — Pick a Chest")).toBeNull();
    expect(screen.queryByRole("button", { name: "???" })).toBeNull();
    expect(balanceText()).toBe("1990.00");

    h.untilState("betting");
    h.frames(1);
    expect(balanceText()).toBe("2990.00"); // chest 0 auto-applied: 1990 + (10 × 200 − 10 × 100)
    expect(h.session.wallet.get().history).toEqual([
      { mult: 200, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });
});

describe("React.StrictMode (development double-mount)", () => {
  it("the double-mount leaves exactly one renderer, one rAF loop and one set of display subscriptions", async () => {
    const h = await bootScreen();
    h.mount({ strict: true });
    // mount → cleanup → mount: the first attach was fully undone.
    expect(h.renderers).toHaveLength(2);
    expect(h.renderers.map((r) => r.disposed)).toEqual([true, false]);
    expect(h.pendingFrames()).toBe(1);
    expect(h.session.driver.running).toBe(true);
    expect(h.subscriptions.added).toBe(2 * DISPLAY_SUBSCRIPTIONS);
    expect(h.subscriptions.removed).toBe(DISPLAY_SUBSCRIPTIONS);
    expect(h.subscriptions.active).toBe(DISPLAY_SUBSCRIPTIONS);

    h.frames(5);
    expect(h.renderers[0].frames).toBe(0); // the discarded renderer never draws
    expect(h.renderers[1].frames).toBe(5); // one frame per rAF, not two
  });

  it("a cashout round under StrictMode settles once: one credit, one history entry, one flash", async () => {
    const h = await bootScreen({ crashPoint: 3 });
    h.mount({ strict: true });
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    await h.user.click(button(/^CASH OUT · /));
    h.tick();

    const { lastWin, balance } = h.session.wallet.get();
    expect(balance).toBe(+(995 + lastWin!.amount).toFixed(2));
    expect(balanceText()).toBe(balance.toFixed(2));
    expect(screen.getAllByText("CASHED OUT")).toHaveLength(1);

    h.untilState("betting");
    expect(h.session.wallet.get().balance).toBe(balance);
    expect(h.session.wallet.get().history).toEqual([{ mult: lastWin!.mult, crashed: false }]);
  });

  it("a jackpot + chest round under StrictMode settles once on every path", async () => {
    const h = await bootScreen();
    h.mount({ strict: true });
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("bonus");
    h.frames(1);
    expect(balanceText()).toBe("1990.00");
    const chests = screen.getAllByRole("button", { name: "???" });
    expect(chests).toHaveLength(3); // one picker, not two

    await h.user.click(chests[2]);
    h.tick();
    expect(button("+30.00×")).toBeTruthy();
    expect(balanceText()).toBe("30990.00"); // 1990 + (10 × 3000 − 10 × 100)

    h.untilState("betting");
    expect(h.session.wallet.get().balance).toBe(30990);
    expect(h.session.wallet.get().history).toEqual([
      { mult: 3000, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("StrictMode unmount releases everything; a StrictMode remount mid-dive resumes and settles once", async () => {
    const h = await bootScreen({ crashPoint: 3 });
    const first = h.mount({ strict: true });
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(20);

    first.unmount();
    expect(h.renderers.every((r) => r.disposed)).toBe(true);
    expect(h.pendingFrames()).toBe(0);
    expect(h.subscriptions.active).toBe(0);

    h.mount({ strict: true });
    expect(h.renderers.filter((r) => !r.disposed)).toHaveLength(1);
    expect(h.pendingFrames()).toBe(1);
    expect(h.subscriptions.active).toBe(DISPLAY_SUBSCRIPTIONS);
    h.frames(1);
    expect(balanceText()).toBe("995.00");

    await h.user.click(button(/^CASH OUT · /));
    h.tick();
    const { lastWin, balance } = h.session.wallet.get();
    expect(balance).toBe(+(995 + lastWin!.amount).toFixed(2));
    h.untilState("betting");
    expect(h.session.wallet.get().history).toEqual([{ mult: lastWin!.mult, crashed: false }]);
    expect(h.session.wallet.get().balance).toBe(balance);
  });
});
