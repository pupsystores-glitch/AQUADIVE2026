// Bet input + action state through the real component (Sprint 4, Commit U5;
// docs/07_UI_ARCHITECTURE.md §9, §13.3, §21 tier 3; delta V4).
//
// The screen is booted over a scripted session (src/ui/test/dom-harness.tsx);
// assertions use visible text, roles and disabled state plus the session's
// stores. Covers: the bet input as session state, sanitation edge cases at
// the field, the action matrix in every phase (D10 included), the UI-only
// cutoff (D9), and duplicate clicks without a pending-submit guard (D8).
//
// Note on non-finite input at the DOM: an <input type="number"> sanitizes a
// value that is not a valid finite floating-point number (e.g. "1e309",
// "Infinity", "abc") to "" before onChange sees it — in jsdom as in the
// HTML spec — so through the field such input arrives as "" → 0, which was
// already the pre-U5 result. The store-level non-finite sanitation (D2) is
// covered in src/ui/store/bet-input-store.test.ts.
import { describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { bootScreen, type ScreenHarness } from "@/ui/test/dom-harness";
import { payoutOracle } from "@/ui/test/money-oracle";

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const queryButton = (name: string | RegExp) => screen.queryByRole("button", { name });
const betInput = () => screen.getByRole("spinbutton") as HTMLInputElement;
const balanceText = () => screen.getByText("Balance").nextSibling?.textContent;
const tier = () => screen.getByText(/^Bet ·/).textContent;
const betControls = () => [
  button("−"),
  button("+"),
  ...["1", "5", "10", "25", "100"].map((v) => button(v)),
];
const expectBetControlsEnabled = (enabled: boolean) => {
  for (const b of betControls()) expect(b.hasAttribute("disabled")).toBe(!enabled);
  expect(betInput().disabled).toBe(!enabled);
};
/** Record the engine events a test cares about. */
const record = (h: ScreenHarness, names: Array<"betPlaced" | "cashedOut" | "commandRejected">) => {
  const log: Array<{ name: string; reason?: string }> = [];
  for (const name of names)
    h.session.engine.events.on(name, (p) =>
      log.push({ name, reason: (p as { reason?: string }).reason }),
    );
  return log;
};

describe("the bet input is session state (U5, §9)", () => {
  it("every control writes the session's bet-input store; the field and tier label render it", async () => {
    const h = await bootScreen();
    h.mount();
    expect(h.session.betInput.get()).toBe(5);
    await h.user.click(button("+"));
    expect(h.session.betInput.get()).toBe(10);
    await h.user.click(button("−"));
    expect(h.session.betInput.get()).toBe(5);
    await h.user.click(button("100"));
    expect(h.session.betInput.get()).toBe(100);
    await h.user.clear(betInput());
    await h.user.type(betInput(), "42");
    expect(h.session.betInput.get()).toBe(42);
    expect(betInput().value).toBe("42");
    expect(tier()).toBe("Bet · heavy");
  });

  it("a direct store write re-renders the field and the tier label", async () => {
    const h = await bootScreen();
    h.mount();
    act(() => h.session.betInput.set(25));
    expect(betInput().value).toBe("25");
    expect(tier()).toBe("Bet · heavy");
  });
});

describe("bet input edge cases at the field (V4)", () => {
  it("D1: a cleared field shows 0 and disables PLACE BET; − then raises it to 1", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.clear(betInput());
    expect(betInput().value).toBe("0");
    expect(h.session.betInput.get()).toBe(0);
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(true);
    await h.user.click(button("−"));
    expect(betInput().value).toBe("1");
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(false);
  });

  it('non-finite text reaches the handler as "" and becomes 0 — never NaN or Infinity in the field', async () => {
    const h = await bootScreen();
    h.mount();
    for (const raw of ["1e309", "Infinity", "abc"]) {
      fireEvent.change(betInput(), { target: { value: raw } });
      expect(betInput().value, raw).toBe("0");
      expect(Number.isFinite(h.session.betInput.get())).toBe(true);
      expect(h.session.betInput.get()).toBe(0);
      expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(true);
    }
  });

  it("negative input is clamped to 0, as before", async () => {
    const h = await bootScreen();
    h.mount();
    fireEvent.change(betInput(), { target: { value: "-5" } });
    expect(betInput().value).toBe("0");
    expect(h.session.betInput.get()).toBe(0);
  });

  // Sanctioned rewrite (M1-D1, M1-D3; D11 superseded in part, docs/07 §23.3).
  // Before M1 this pinned that a typed 0.123 was placed and debited 0.12.
  it("M1: a sub-cent amount stays in the field as typed — never rounded — but PLACE BET is disabled and nothing is debited", async () => {
    const h = await bootScreen();
    h.mount();
    const log = record(h, ["betPlaced", "commandRejected"]);
    for (const raw of ["0.123", "0.001", "0.004", "0.005", "0.009", "1.005"]) {
      fireEvent.change(betInput(), { target: { value: raw } });
      expect(betInput().value, raw).toBe(raw);
      expect(h.session.betInput.get(), raw).toBe(+raw);
      expect(button(/^PLACE BET/).hasAttribute("disabled"), raw).toBe(true);
      fireEvent.click(button(/^PLACE BET/));
      h.session.submit({ type: "placeBet", amount: h.session.betInput.get() }); // the submit edge independently
      h.tick();
    }
    expect(log).toEqual([]);
    expect(h.session.wallet.get()).toMatchObject({
      balance: 1000,
      roundBet: 0,
      participating: false,
    });
    expect(balanceText()).toBe("1000.00");
  });

  it("M1: whole-cent values are placeable, including the minimum and text forms like 1.000 and 1e-2", async () => {
    for (const [raw, amount] of [
      ["0.01", 0.01],
      ["1.000", 1],
      ["1e-2", 0.01],
      ["0.29", 0.29],
    ] as const) {
      const h = await bootScreen();
      const view = h.mount();
      fireEvent.change(betInput(), { target: { value: raw } });
      expect(button("PLACE BET · 5.0s").hasAttribute("disabled"), raw).toBe(false);
      await h.user.click(button(/^PLACE BET/));
      h.tick();
      expect(h.session.wallet.get().roundBet, raw).toBe(amount);
      expect(h.session.wallet.get().balance, raw).toBe((100_000 - Math.round(amount * 100)) / 100);
      view.unmount();
    }
  });

  it("D7: a bet equal to the balance is placeable; a cent more is not", async () => {
    const h = await bootScreen();
    h.mount();
    fireEvent.change(betInput(), { target: { value: "1000.01" } });
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(true);
    fireEvent.change(betInput(), { target: { value: "1000" } });
    expect(button("PLACE BET · 5.0s").hasAttribute("disabled")).toBe(false);
  });
});

describe("the action matrix in every phase (§13.3, D10)", () => {
  it("participant, cashout → impact → bonus: CASH OUT, SECURED, then WAITING… with bet controls enabled outside the dive", async () => {
    const h = await bootScreen(); // never crashes: the dive reaches the sea floor
    h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.tick();
    expect(button(/^BET LOCKED · DIVE IN /).hasAttribute("disabled")).toBe(true);
    expectBetControlsEnabled(true);

    h.untilState("diving");
    h.frames(30);
    expect(button(/^CASH OUT · /).hasAttribute("disabled")).toBe(false);
    expectBetControlsEnabled(false);
    await h.user.click(button(/^CASH OUT · /));
    h.tick();
    expect(button(/^SECURED \+/).hasAttribute("disabled")).toBe(true);
    expectBetControlsEnabled(false);

    h.untilState("impact"); // phase "cashed"
    h.frames(1);
    expect(h.session.round.get().phase).toBe("cashed");
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expectBetControlsEnabled(true); // D10: preserved

    h.untilState("bonus");
    h.frames(1);
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expectBetControlsEnabled(true);
  });

  it("spectator: SPECTATING during the dive, WAITING… at impact and bonus", async () => {
    const h = await bootScreen();
    h.mount();
    h.untilState("diving");
    h.frames(1);
    expect(button("SPECTATING · NEXT ROUND SOON").hasAttribute("disabled")).toBe(true);
    h.untilState("impact");
    h.frames(1);
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expectBetControlsEnabled(true);
  });

  it("crash: WAITING… disabled with bet controls enabled, then PLACE BET again in the next window", async () => {
    const h = await bootScreen({ crashPoint: 1.5 });
    h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.untilState("crashed");
    h.frames(1);
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
    expectBetControlsEnabled(true);
    h.untilState("betting");
    h.frames(1);
    expect(button(/^PLACE BET · /).hasAttribute("disabled")).toBe(false);
  });

  it("a bet changed while BET LOCKED changes the field only — the locked basis and the potential stay on the accepted bet", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.tick();
    await h.user.click(button("100"));
    expect(betInput().value).toBe("100");
    expect(h.session.wallet.get().roundBet).toBe(10);
    h.untilState("diving");
    h.frames(30);
    const m = h.session.engine.getPublicState().multiplier;
    expect(button(`CASH OUT · ${payoutOracle(10, m).toFixed(2)}`)).toBeTruthy();
  });
});

describe("D9: the cutoff is a UI-only restriction", () => {
  it("the button disables at BET_CUTOFF_SECONDS while the engine would still accept the bet", async () => {
    const h = await bootScreen();
    h.mount();
    const log = record(h, ["betPlaced", "commandRejected"]);
    const countdown = () => h.session.engine.getPublicState().countdownSeconds;
    h.until(() => countdown() <= 0.2, "countdown ≤ 0.2 s");
    expect(h.session.engine.state).toBe("betting");
    expect(button(/^PLACE BET · /).hasAttribute("disabled")).toBe(true);
    await h.user.click(button(/^PLACE BET · /)); // a disabled button submits nothing
    h.tick();
    expect(log).toEqual([]);

    // The same command through the session edge is accepted: no new validation.
    h.session.submit({ type: "placeBet", amount: 5 });
    h.tick();
    expect(log).toEqual([{ name: "betPlaced", reason: undefined }]);
    expect(balanceText()).toBe("995.00");
  });
});

describe("D8: duplicate clicks, no pending-submit guard", () => {
  it("double-clicking PLACE BET before the tick debits once; the engine rejects the repeat", async () => {
    const h = await bootScreen();
    h.mount();
    h.frames(1);
    const log = record(h, ["betPlaced", "commandRejected"]);
    await h.user.click(button("PLACE BET · 5.0s"));
    await h.user.click(button("PLACE BET · 5.0s")); // still enabled: the bet applies on the next tick (D4)
    h.tick();
    expect(log).toEqual([
      { name: "betPlaced", reason: undefined },
      { name: "commandRejected", reason: "already-participating" },
    ]);
    expect(h.session.wallet.get()).toMatchObject({ balance: 995, roundBet: 5 });
    expect(balanceText()).toBe("995.00");
    expect(button(/^BET LOCKED · /)).toBeTruthy();
  });

  it("double-clicking CASH OUT before the tick credits once, records one history entry and shows one flash", async () => {
    const h = await bootScreen({ crashPoint: 3 });
    h.mount();
    const log = record(h, ["cashedOut", "commandRejected"]);
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    await h.user.click(button(/^CASH OUT · /));
    await h.user.click(button(/^CASH OUT · /));
    h.tick();
    expect(log).toEqual([
      { name: "cashedOut", reason: undefined },
      { name: "commandRejected", reason: "already-cashed-out" },
    ]);
    const { lastWin, balance } = h.session.wallet.get();
    expect(balance).toBe(+(995 + lastWin!.amount).toFixed(2));
    expect(screen.getAllByText("CASHED OUT")).toHaveLength(1);
    expect(queryButton(/^CASH OUT · /)).toBeNull();

    h.untilState("betting");
    expect(h.session.wallet.get().balance).toBe(balance);
    expect(h.session.wallet.get().history).toEqual([{ mult: lastWin!.mult, crashed: false }]);
  });
});
