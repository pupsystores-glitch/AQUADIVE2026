// DOM characterization pins for the game screen (Sprint 4, Commit U3;
// docs/07_UI_ARCHITECTURE.md §17 U3, §20 risk 2, §21 tier 3).
//
// These pin the rendered output of the game screen (the AbyssAnchor.tsx
// shell until U6; src/ui/components/GameScreen.tsx since U6's verbatim
// decomposition) per phase and participation state, driven by a scripted
// session (fixed crash point, jackpot 100×, chests 2× / 6.5× / 30×) and a
// manual 60 Hz frame clock (src/ui/test/dom-harness.tsx). They protect
// U4–U7: U6 must keep every pin green against GameScreen. Assertions use visible text,
// roles and disabled state only — never class names — so a verbatim
// markup move keeps them green.
//
// Behavior pinned here that a later step is sanctioned to change is marked
// "PINNED UNTIL Ux" (docs/07 §7). Those pins are expected to be updated in
// that step's commit, and only there.
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { CASH_FLASH_MS } from "@/game/config";
import {
  bootScreen,
  outline,
  slotButton,
  querySlotButton,
  slotBetInput,
  slotPanel,
} from "@/ui/test/dom-harness";
import { payoutOracle } from "@/ui/test/money-oracle";
import { slot0View } from "@/ui/test/wallet-view";

const FRAMES_PER_SECOND = 60;

const button = (name: string | RegExp) => slotButton(name);
const queryButton = (name: string | RegExp) => querySlotButton(name);
const betInput = () => slotBetInput();
/** The balance pill's value ("Balance" label + amount). */
const balanceText = () => screen.getByText("Balance").nextSibling?.textContent;
/** The bet-controls row: −, the bet input, +. */
const stepButtons = () => [button("−"), button("+")];
const quickBetButtons = () => ["1", "5", "10", "25", "100"].map((v) => button(v));
/** The multiplier readout under the "Multiplier" label. */
const multiplierText = () => screen.getByText("Multiplier").nextElementSibling?.textContent;
/** The engine's current multiplier, formatted the way the HUD shows it. */
const shown = (m: number) => m.toFixed(2);

describe("betting phase", () => {
  it("first render: balance, empty history, idle HUD and an enabled PLACE BET at the full countdown", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    // Before any frame: the component's initial state (phase idle, 5.0 s).
    const initial = outline(container);
    expect(initial).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "1000.00",
        "[button] ",
        "[button] ",
        "No rounds yet",
        "[canvas]",
        "Multiplier",
        "1.00×",
        "Next dive in",
        "5.0",
        "s",
        "BET 1",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button] PLACE BET · 5.0s",
        "BET 2",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button] PLACE BET · 5.0s",
      ]
    `);

    h.frames(1); // the first frame contributes zero wall delta (driver baseline)
    expect(outline(container)).toEqual(initial);
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(false);
  });

  it("the countdown runs down on the HUD and on the PLACE BET label", async () => {
    const h = await bootScreen();
    h.mount();
    h.frames(1 + FRAMES_PER_SECOND); // baseline frame + 1 s
    expect(screen.getByText("Next dive in").textContent).toBe("Next dive in 4.0s");
    expect(button("PLACE BET · 4.0s").hasAttribute("disabled")).toBe(false);
  });

  it("− halves the bet with a floor of 1; the tier label follows the bet", async () => {
    const h = await bootScreen();
    h.mount();
    expect(betInput().value).toBe("5");
    expect(within(slotPanel(0)).getByText(/^Bet ·/).textContent).toBe("Bet · chain");

    await h.user.click(button("−"));
    expect(betInput().value).toBe("2.5");
    expect(within(slotPanel(0)).getByText(/^Bet ·/).textContent).toBe("Bet · rope");

    await h.user.click(button("−"));
    expect(betInput().value).toBe("1.25");
    await h.user.click(button("−")); // 0.63 → floored to 1
    expect(betInput().value).toBe("1");
    await h.user.click(button("−"));
    expect(betInput().value).toBe("1");
  });

  it("+ doubles the bet, capped at the balance", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(button("+"));
    expect(betInput().value).toBe("10");
    await h.user.click(button("100"));
    await h.user.click(button("+"));
    expect(betInput().value).toBe("200");
    expect(within(slotPanel(0)).getByText(/^Bet ·/).textContent).toBe("Bet · heavy");
    await h.user.click(button("+"));
    await h.user.click(button("+"));
    expect(betInput().value).toBe("800");
    await h.user.click(button("+")); // 1600 → capped at the 1000 balance
    expect(betInput().value).toBe("1000");
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(false); // bet == balance is affordable
  });

  it("quick bets set the amount", async () => {
    const h = await bootScreen();
    h.mount();
    for (const [label, tier] of [
      ["1", "rope"],
      ["10", "chain"],
      ["25", "heavy"],
      ["5", "chain"],
    ] as const) {
      await h.user.click(button(label));
      expect(betInput().value).toBe(label);
      expect(within(slotPanel(0)).getByText(/^Bet ·/).textContent).toBe(`Bet · ${tier}`);
    }
  });

  it("typed amounts: valid enables PLACE BET; above the balance or 0 disables it", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.clear(betInput());
    await h.user.type(betInput(), "42");
    expect(betInput().value).toBe("42");
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(false);

    await h.user.clear(betInput());
    await h.user.type(betInput(), "1500");
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(true);

    await h.user.clear(betInput());
    await h.user.type(betInput(), "0");
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(true);
  });

  // Was "PINNED UNTIL U5 (V4)". U5 kept this behavior by owner decision (D1):
  // a cleared field is 0, not NaN (the pre-U5 docs were wrong, D3). Assertions unchanged.
  it("V4 (D1, kept in U5): clearing the field makes the bet 0 — the field shows 0, tier rope, PLACE BET disabled", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.clear(betInput());
    expect(betInput().value).toBe("0");
    expect(within(slotPanel(0)).getByText(/^Bet ·/).textContent).toBe("Bet · rope");
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(true);
  });

  // Was "PINNED UNTIL U5". U5 named the literal BET_CUTOFF_SECONDS (D5) with
  // the same value; the assertions keep the literal 0.2 on purpose.
  it("V4 (BET_CUTOFF_SECONDS, U5): PLACE BET disables once the countdown is at or below 0.2 s", async () => {
    const h = await bootScreen();
    h.mount();
    const countdown = () => h.session.engine.getPublicState().countdownSeconds;
    h.until(() => countdown() <= 0.25, "countdown ≤ 0.25 s");
    expect(countdown()).toBeGreaterThan(0.2);
    expect(button(/^PLACE BET · /).hasAttribute("disabled")).toBe(false);

    h.until(() => countdown() <= 0.2, "countdown ≤ 0.2 s");
    expect(h.session.engine.state).toBe("betting");
    expect(button(/^PLACE BET · /).hasAttribute("disabled")).toBe(true);
  });

  it("placing a bet debits the balance and locks the action button; bet controls stay enabled while betting", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    h.frames(1);
    await h.user.click(button("PLACE BET · 5.0s"));
    h.tick(); // the command applies on the next tick (D4)

    expect(balanceText()).toBe("995.00");
    const locked = button(/^BET LOCKED · DIVE IN \d\.\ds$/);
    expect(locked.hasAttribute("disabled")).toBe(true);
    for (const b of [...stepButtons(), ...quickBetButtons()])
      expect(b.hasAttribute("disabled")).toBe(false);
    expect(betInput().disabled).toBe(false);
    expect(screen.getByText("No rounds yet")).toBeTruthy();
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "995.00",
        "[button] ",
        "[button] ",
        "No rounds yet",
        "[canvas]",
        "Multiplier",
        "1.00×",
        "Next dive in",
        "5.0",
        "s",
        "BET 1",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] BET LOCKED · DIVE IN 5.0s",
        "BET 2",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button] PLACE BET · 5.0s",
      ]
    `);
  });
});

describe("dive phase", () => {
  it("participating: live multiplier, potential win and CASH OUT on the locked bet; bet controls disabled", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);

    const m = h.session.engine.getPublicState().multiplier;
    const potential = payoutOracle(10, m).toFixed(2);
    expect(m).toBeGreaterThan(1);
    expect(multiplierText()).toBe(`${shown(m)}×`);
    expect(screen.getByText("Potential").textContent).toBe(`Potential ${potential}`);
    expect(button(`CASH OUT · ${potential}`).hasAttribute("disabled")).toBe(false);
    for (const b of [...stepButtons(), ...quickBetButtons()])
      expect(b.hasAttribute("disabled")).toBe(true);
    expect(betInput().disabled).toBe(true);
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "990.00",
        "[button] ",
        "[button] ",
        "No rounds yet",
        "[canvas]",
        "Multiplier",
        "1.04×",
        "Potential",
        "10.43",
        "BET 1",
        "[button disabled] −",
        "Bet ·",
        "chain",
        "[input number disabled] 10",
        "[button disabled] +",
        "[button disabled] 1",
        "[button disabled] 5",
        "[button disabled] 10",
        "[button disabled] 25",
        "[button disabled] 100",
        "[button] CASH OUT · 10.43",
        "BET 2",
        "[button disabled] −",
        "Bet ·",
        "chain",
        "[input number disabled] 5",
        "[button disabled] +",
        "[button disabled] 1",
        "[button disabled] 5",
        "[button disabled] 10",
        "[button disabled] 25",
        "[button disabled] 100",
        "[button disabled] SPECTATING · NEXT ROUND SOON",
      ]
    `);
  });

  it("spectating: no potential, a disabled SPECTATING button", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    h.untilState("diving");
    h.frames(30);
    expect(screen.getByText("Spectating this dive")).toBeTruthy();
    expect(screen.queryByText("Potential")).toBeNull();
    expect(button("SPECTATING · NEXT ROUND SOON").hasAttribute("disabled")).toBe(true);
    expect(queryButton(/^CASH OUT/)).toBeNull();
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "1000.00",
        "[button] ",
        "[button] ",
        "No rounds yet",
        "[canvas]",
        "Multiplier",
        "1.04×",
        "Spectating this dive",
        "BET 1",
        "[button disabled] −",
        "Bet ·",
        "chain",
        "[input number disabled] 5",
        "[button disabled] +",
        "[button disabled] 1",
        "[button disabled] 5",
        "[button disabled] 10",
        "[button disabled] 25",
        "[button disabled] 100",
        "[button disabled] SPECTATING · NEXT ROUND SOON",
        "BET 2",
        "[button disabled] −",
        "Bet ·",
        "chain",
        "[input number disabled] 5",
        "[button disabled] +",
        "[button disabled] 1",
        "[button disabled] 5",
        "[button disabled] 10",
        "[button disabled] 25",
        "[button disabled] 100",
        "[button disabled] SPECTATING · NEXT ROUND SOON",
      ]
    `);
  });

  it("cash out: win flash, SECURED button, balance credit and a history entry; the flash ends after CASH_FLASH_MS", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    await h.user.click(button(/^CASH OUT · /));
    h.tick(); // the command applies on the next tick (D4)

    const { lastWin, balance } = slot0View(h.session.wallet.get());
    expect(lastWin).not.toBeNull();
    const win = lastWin!.amount.toFixed(2);
    expect(balanceText()).toBe(balance.toFixed(2));
    expect(balance).toBe(+(995 + lastWin!.amount).toFixed(2));
    expect(screen.getByText("CASHED OUT")).toBeTruthy();
    expect(screen.getByText(`+${win}`)).toBeTruthy();
    expect(screen.getByText(`at ${lastWin!.mult.toFixed(2)}×`)).toBeTruthy();
    expect(button(`SECURED +${win} · WATCHING DIVE…`).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("No rounds yet")).toBeNull();
    // Sanctioned characterization change (M1-D8, docs/07 §23.3): the credit is
    // rounded down — was 5.22 / balance 1000.22 under round-to-nearest. The
    // Potential label (5.22) is the payout at the later live multiplier (D4).
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "1000.21",
        "[button] ",
        "[button] ",
        "1.04",
        "×",
        "[canvas]",
        "Multiplier",
        "1.04×",
        "Potential",
        "5.22",
        "CASHED OUT",
        "+",
        "5.21",
        "at",
        "1.04",
        "×",
        "BET 1",
        "[button disabled] −",
        "Bet ·",
        "chain",
        "[input number disabled] 5",
        "[button disabled] +",
        "[button disabled] 1",
        "[button disabled] 5",
        "[button disabled] 10",
        "[button disabled] 25",
        "[button disabled] 100",
        "[button disabled] SECURED +5.21 · WATCHING DIVE…",
        "BET 2",
        "[button disabled] −",
        "Bet ·",
        "chain",
        "[input number disabled] 5",
        "[button disabled] +",
        "[button disabled] 1",
        "[button disabled] 5",
        "[button disabled] 10",
        "[button disabled] 25",
        "[button disabled] 100",
        "[button disabled] SPECTATING · NEXT ROUND SOON",
      ]
    `);

    // The flash timer runs on the frame clock: visible just before
    // CASH_FLASH_MS, gone after it. The SECURED state stays.
    const flashFrames = (CASH_FLASH_MS / 1000) * FRAMES_PER_SECOND;
    h.frames(flashFrames - 2);
    expect(screen.queryByText("CASHED OUT")).not.toBeNull();
    h.frames(3);
    expect(h.session.engine.state).toBe("diving");
    expect(screen.queryByText("CASHED OUT")).toBeNull();
    expect(button(`SECURED +${win} · WATCHING DIVE…`)).toBeTruthy();
  });
});

describe("crash", () => {
  it("participating: CHAIN SNAPPED banner at the crash multiplier, WAITING…, a crashed history entry; then a fresh betting window", async () => {
    const h = await bootScreen({ crashPoint: 1.5 });
    const { container } = h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.untilState("crashed");
    h.frames(1);

    const m = h.session.engine.getPublicState().multiplier;
    expect(screen.getByText("CHAIN SNAPPED")).toBeTruthy();
    expect(screen.getAllByText(`${shown(m)}×`).length).toBeGreaterThanOrEqual(2); // readout, banner (+ history)
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expect(balanceText()).toBe("995.00");
    expect(slot0View(h.session.wallet.get()).history).toEqual([{ mult: m, crashed: true }]);
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "995.00",
        "[button] ",
        "[button] ",
        "1.50",
        "×",
        "[canvas]",
        "Multiplier",
        "1.50×",
        "CHAIN SNAPPED",
        "1.50",
        "×",
        "BET 1",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
        "BET 2",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
      ]
    `);

    h.untilState("betting");
    h.frames(1);
    expect(screen.queryByText("CHAIN SNAPPED")).toBeNull();
    expect(button(/^PLACE BET · /).hasAttribute("disabled")).toBe(false);
    expect(balanceText()).toBe("995.00");
    expect(screen.queryByText("No rounds yet")).toBeNull();
  });

  it("spectating: the crash still enters the history; the balance is untouched", async () => {
    const h = await bootScreen({ crashPoint: 1.5 });
    h.mount();
    h.untilState("crashed");
    h.frames(1);
    expect(screen.getByText("CHAIN SNAPPED")).toBeTruthy();
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expect(balanceText()).toBe("1000.00");
    expect(slot0View(h.session.wallet.get()).history).toHaveLength(1);
  });

  it("cashed out before the crash: the banner shows, but the round keeps only its cashout entry", async () => {
    const h = await bootScreen({ crashPoint: 3 });
    h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    await h.user.click(button(/^CASH OUT · /));
    h.untilState("crashed");
    h.frames(1);
    const { lastWin, history } = slot0View(h.session.wallet.get());
    expect(screen.getByText("CHAIN SNAPPED")).toBeTruthy();
    expect(history).toEqual([{ mult: lastWin!.mult, crashed: false }]);
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
  });
});

describe("jackpot and bonus chests", () => {
  it("auto-cash at the sea floor: jackpot flash, balance credit, WAITING… during impact", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("impact");
    h.frames(1);

    expect(balanceText()).toBe("1990.00"); // 990 + 10 × 100
    expect(screen.getByText("CASHED OUT")).toBeTruthy();
    expect(screen.getByText("+1000.00")).toBeTruthy();
    expect(screen.getByText("at 100.00×")).toBeTruthy();
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "1990.00",
        "[button] ",
        "[button] ",
        "100.00",
        "×",
        "[canvas]",
        "Multiplier",
        "100.00×",
        "CASHED OUT",
        "+",
        "1000.00",
        "at",
        "100.00",
        "×",
        "BET 1",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 10",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
        "BET 2",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
      ]
    `);
  });

  it("eligible player picks a chest: the picker opens, the pick reveals its multiplier, every chest disables, the delta is credited", async () => {
    const h = await bootScreen();
    const { container } = h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("bonus");
    h.frames(1);

    expect(screen.getByText("Pirate Wreck — Pick a Chest")).toBeTruthy();
    const chests = screen.getAllByRole("button", { name: "???" });
    expect(chests).toHaveLength(3);
    for (const c of chests) expect(c.hasAttribute("disabled")).toBe(false);
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "1990.00",
        "[button] ",
        "[button] ",
        "100.00",
        "×",
        "[canvas]",
        "Multiplier",
        "100.00×",
        "CASHED OUT",
        "+",
        "1000.00",
        "at",
        "100.00",
        "×",
        "Pirate Wreck — Pick a Chest",
        "[button] ???",
        "[button] ???",
        "[button] ???",
        "BET 1",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 10",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
        "BET 2",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
      ]
    `);

    await h.user.click(chests[1]);
    h.tick(); // the command applies on the next tick (D4)
    expect(button("+6.50×").hasAttribute("disabled")).toBe(true);
    expect(
      screen.getAllByRole("button", { name: "???" }).map((c) => c.hasAttribute("disabled")),
    ).toEqual([true, true]);
    expect(balanceText()).toBe("7490.00"); // 1990 + (10 × 650 − 10 × 100)
    expect(slot0View(h.session.wallet.get()).history).toEqual([
      { mult: 650, crashed: false },
      { mult: 100, crashed: false },
    ]);
    expect(outline(container)).toMatchInlineSnapshot(`
      [
        "REAL-TIME",
        "AQUADIVE",
        "Balance",
        "7490.00",
        "[button] ",
        "[button] ",
        "650.00",
        "×",
        "100.00",
        "×",
        "[canvas]",
        "Multiplier",
        "650.00×",
        "CASHED OUT",
        "+",
        "6500.00",
        "at",
        "650.00",
        "×",
        "Pirate Wreck — Pick a Chest",
        "[button disabled] ???",
        "[button disabled] +6.50×",
        "[button disabled] ???",
        "BET 1",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 10",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
        "BET 2",
        "[button] −",
        "Bet ·",
        "chain",
        "[input number] 5",
        "[button] +",
        "[button] 1",
        "[button] 5",
        "[button] 10",
        "[button] 25",
        "[button] 100",
        "[button disabled] WAITING…",
      ]
    `);

    h.untilState("betting");
    h.frames(1);
    expect(screen.queryByText("Pirate Wreck — Pick a Chest")).toBeNull();
    expect(balanceText()).toBe("7490.00");
    expect(button(/^PLACE BET · /).hasAttribute("disabled")).toBe(false);
  });

  it("E-X1 timeout: an eligible player who never picks gets chest 0 (2×) applied and credited; the picker shows it, then the round ends", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.untilState("bonus");
    h.frames(1);

    // Most of the 6 s / 360-tick window: still open, nothing picked.
    h.frames(330);
    expect(h.session.engine.state).toBe("bonus");
    expect(
      screen.getAllByRole("button", { name: "???" }).map((c) => c.hasAttribute("disabled")),
    ).toEqual([false, false, false]);

    h.until(() => h.session.engine.getPublicState().chosenChestId !== null, "the auto-pick");
    h.frames(1);
    expect(h.session.engine.getPublicState().chosenChestId).toBe(0);
    const revealed = button("+2.00×");
    expect(revealed.hasAttribute("disabled")).toBe(true);
    expect(within(revealed.parentElement!).getAllByRole("button")[0]).toBe(revealed); // chest 0 is the first
    expect(balanceText()).toBe("2990.00"); // 1990 + (10 × 200 − 10 × 100)

    h.untilState("betting");
    h.frames(1);
    expect(screen.queryByText("Pirate Wreck — Pick a Chest")).toBeNull();
    expect(balanceText()).toBe("2990.00");
    expect(slot0View(h.session.wallet.get()).history).toEqual([
      { mult: 200, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("E-X1: a player who cashed out manually never sees the picker; the bonus completes with no chest credit", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    await h.user.click(button(/^CASH OUT · /));
    h.tick(); // the command applies on the next tick (D4)
    const afterCashout = slot0View(h.session.wallet.get()).balance;

    h.untilState("bonus");
    h.frames(1);
    expect(h.session.engine.getPublicState().chests).not.toBeNull(); // the chests exist — only the picker is withheld
    expect(screen.queryByText("Pirate Wreck — Pick a Chest")).toBeNull();
    expect(screen.queryByRole("button", { name: "???" })).toBeNull();
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);

    h.untilState("betting");
    h.frames(1);
    expect(balanceText()).toBe(afterCashout.toFixed(2));
  });

  it("E-X1: a spectator never sees the picker; the bonus completes and only the jackpot result is recorded", async () => {
    const h = await bootScreen();
    h.mount();
    h.untilState("bonus");
    h.frames(1);
    expect(screen.queryByText("Pirate Wreck — Pick a Chest")).toBeNull();
    expect(screen.queryByRole("button", { name: "???" })).toBeNull();
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);

    h.untilState("betting");
    h.frames(1);
    expect(balanceText()).toBe("1000.00");
    expect(slot0View(h.session.wallet.get()).history).toEqual([{ mult: 100, crashed: false }]);
    expect(screen.getAllByText("100.00×")).toHaveLength(2); // the readout (still at the jackpot) and the history strip entry
  });
});
