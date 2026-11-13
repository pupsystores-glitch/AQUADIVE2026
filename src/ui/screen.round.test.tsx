// Round store DOM tests (Sprint 4, Commit U4b; docs/07_UI_ARCHITECTURE.md
// §11, §17). The real component over a scripted session (jackpot 100×,
// chests 2× / 6.5× / 30×; src/ui/test/). Round and bonus presentation is now
// read from the session-owned round store, written once per driver frame by
// the session's sync. These tests check what is actually rendered, frame by
// frame — not what React batching is assumed to do:
//
// - the bonus picker survives a component remount (unpicked, picked, near
//   the 360-tick deadline, under StrictMode), and never settles twice;
// - ineligible players get no picker after a remount either;
// - repeated remounts leave exactly one sink;
// - the DOM matches the engine at the end of every frame, and frames with no
//   change re-render nothing.
import { Profiler, createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatMultiplier } from "@/game/presentation";
import { bootScreen, type ScreenHarness } from "@/ui/test/dom-harness";

const PICKER = "Pirate Wreck — Pick a Chest";
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const balanceText = () => screen.getByText("Balance").nextSibling?.textContent;
const multiplierText = () => screen.getByText("Multiplier").nextElementSibling?.textContent;
const pickerShown = () => screen.queryByText(PICKER) !== null;
const unpicked = () =>
  screen.queryAllByRole("button", { name: "???" }).map((c) => c.hasAttribute("disabled"));

/** Count chestPicked events (a test listener; the component itself subscribes to nothing). */
const countPicks = (h: ScreenHarness) => {
  const picks: number[] = [];
  h.session.engine.events.on("chestPicked", ({ chestId }) => picks.push(chestId));
  return picks;
};

/** Mount, bet 10, ride to the bonus (jackpot auto-cash ⇒ eligible), one frame in. */
const eligibleBonus = async (strict = false) => {
  const h = await bootScreen();
  const mounted = h.mount({ strict });
  await h.user.click(button("10"));
  await h.user.click(button(/^PLACE BET/));
  h.untilState("bonus");
  h.frames(1);
  expect(pickerShown()).toBe(true);
  expect(balanceText()).toBe("1990.00");
  return { h, mounted };
};

/** Remaining ticks of the engine's single pending timer (the E-X1 pick window while eligible and unpicked). */
const timerTicks = (h: ScreenHarness) => h.session.engine.snapshot().round.timerTicks ?? 0;

describe("bonus chest picker across remounts (U4b)", () => {
  it("remount after a pick: the chosen chest stays revealed, every chest stays disabled, nothing settles twice", async () => {
    const { h, mounted } = await eligibleBonus();
    const picks = countPicks(h);
    await h.user.click(screen.getAllByRole("button", { name: "???" })[2]);
    h.tick();
    expect(button("+30.00×").hasAttribute("disabled")).toBe(true);
    expect(balanceText()).toBe("30990.00"); // 1990 + (10 × 3000 − 10 × 100)
    const walletAfterPick = h.session.wallet.get();

    mounted.unmount();
    h.mount();
    // The remount render itself shows the revealed state (from the store).
    expect(pickerShown()).toBe(true);
    expect(button("+30.00×").hasAttribute("disabled")).toBe(true);
    expect(unpicked()).toEqual([true, true]);
    expect(balanceText()).toBe("30990.00");

    h.frames(1);
    expect(h.session.wallet.get()).toBe(walletAfterPick); // the remount settled nothing
    // A second pick is impossible from the UI (disabled) and rejected by the engine.
    h.session.submit({ type: "pickChest", chestId: 0 });
    h.tick();
    expect(picks).toEqual([2]);
    expect(h.session.wallet.get()).toBe(walletAfterPick);

    h.untilState("betting");
    h.frames(1);
    expect(pickerShown()).toBe(false);
    expect(balanceText()).toBe("30990.00");
    expect(h.session.wallet.get().history).toEqual([
      { mult: 3000, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("remount near the 360-tick deadline: the picker returns enabled, and the timeout still applies chest 0 exactly once", async () => {
    const { h, mounted } = await eligibleBonus();
    const picks = countPicks(h);
    h.until(() => timerTicks(h) <= 3, "the last ticks of the pick window");
    expect(h.session.engine.getPublicState().chosenChestId).toBeNull();

    mounted.unmount();
    h.frames(60); // nothing attached: the window does not run down while unmounted
    expect(timerTicks(h)).toBeLessThanOrEqual(3);
    expect(timerTicks(h)).toBeGreaterThan(0);

    h.mount();
    expect(unpicked()).toEqual([false, false, false]);
    h.until(() => h.session.engine.getPublicState().chosenChestId !== null, "the auto-pick");
    expect(h.session.engine.getPublicState().chosenChestId).toBe(0);
    expect(button("+2.00×").hasAttribute("disabled")).toBe(true); // revealed in the same frame
    expect(balanceText()).toBe("2990.00"); // 1990 + (10 × 200 − 10 × 100)

    h.untilState("betting");
    h.frames(1);
    expect(picks).toEqual([0]);
    expect(balanceText()).toBe("2990.00");
    expect(h.session.wallet.get().history).toEqual([
      { mult: 200, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("remount on the last tick of the window, then pickChest(1): the pick applies before the deadline step, chest 1 wins, credited once, and the timeout applies nothing", async () => {
    // Engine ordering (game-engine.ts advance(); state-machine.ts step()):
    // every tick drains the queued commands *before* the machine steps, and
    // the bonus step auto-applies chest 0 only while no chest is chosen. So
    // with one tick left (timerTicks === 1), a pickChest queued now is
    // applied on that final tick, ahead of the decrement that would expire
    // the window — the last valid opportunity.
    const { h, mounted } = await eligibleBonus();
    const picks = countPicks(h);
    const rejected: unknown[] = [];
    h.session.engine.events.on("commandRejected", (e) => rejected.push(e));
    h.until(() => timerTicks(h) <= 3, "the final ticks of the pick window");
    expect(timerTicks(h)).toBeGreaterThan(1);
    expect(h.session.engine.getPublicState().chosenChestId).toBeNull();

    mounted.unmount();
    h.mount(); // attaching syncs the store immediately; it consumes no tick
    expect(unpicked()).toEqual([false, false, false]);
    // On the uninterrupted frame grid the window's last frame consumes two
    // ticks (2 → 0), so "one tick left" is never observable between frames.
    // The remount realigns it without touching engine timing: the driver's
    // first frame after attach advances 0 s (wall-clock baseline reset), and
    // the following frames then step the window 3 → 2 → 1 one tick each.
    // Stop on the first frame end with one tick left or a chest chosen, and
    // prove it is the former (anything else would be the auto-pick winning).
    h.until(
      () => timerTicks(h) <= 1 || h.session.engine.getPublicState().chosenChestId !== null,
      "the last tick of the pick window",
    );
    expect(h.session.engine.getPublicState().chosenChestId).toBeNull();
    expect(timerTicks(h)).toBe(1);
    expect(picks).toEqual([]);
    expect(unpicked()).toEqual([false, false, false]);

    const ticksBefore = h.session.engine.tickCount;
    await h.user.click(screen.getAllByRole("button", { name: "???" })[1]);
    expect(h.session.engine.tickCount).toBe(ticksBefore); // the click only queued the command
    h.tick(); // the final tick: drain pickChest(1), then step

    expect(rejected).toEqual([]);
    expect(picks).toEqual([1]);
    expect(h.session.engine.getPublicState().chosenChestId).toBe(1);
    expect(timerTicks(h)).toBeGreaterThan(1); // now the result interval, not an expired window
    expect(button("+6.50×").hasAttribute("disabled")).toBe(true); // revealed in the same frame
    expect(unpicked()).toEqual([true, true]);
    expect(balanceText()).toBe("7490.00"); // 1990 + (10 × 650 − 10 × 100)
    const walletAfterPick = h.session.wallet.get();
    expect(walletAfterPick.balance).toBe(7490);

    h.untilState("betting");
    h.frames(1);
    expect(picks).toEqual([1]); // the window's expiry never applied chest 0
    expect(rejected).toEqual([]);
    expect(h.session.engine.getPublicState().chosenChestId).toBe(1); // still chest 1: nothing overwrote it
    expect(h.session.wallet.get().balance).toBe(7490);
    expect(balanceText()).toBe("7490.00");
    expect(h.session.wallet.get().history).toEqual([
      { mult: 650, crashed: false },
      { mult: 100, crashed: false },
    ]);
  });

  it("StrictMode remount during the bonus: one picker, restored; a pick is credited once", async () => {
    const { h, mounted } = await eligibleBonus(true);
    const picks = countPicks(h);
    mounted.unmount();
    h.mount({ strict: true });
    expect(screen.getAllByText(PICKER)).toHaveLength(1);
    expect(unpicked()).toEqual([false, false, false]);
    expect(h.renderers.filter((r) => !r.disposed)).toHaveLength(1);
    expect(h.pendingFrames()).toBe(1);

    await h.user.click(screen.getAllByRole("button", { name: "???" })[0]);
    h.tick();
    expect(button("+2.00×").hasAttribute("disabled")).toBe(true);
    expect(balanceText()).toBe("2990.00");
    h.untilState("betting");
    expect(picks).toEqual([0]);
    expect(h.session.wallet.get().balance).toBe(2990);
  });

  it("a manual-cashout player gets no picker after a remount, and a pick cannot credit", async () => {
    const h = await bootScreen();
    const first = h.mount();
    await h.user.click(button(/^PLACE BET/));
    h.untilState("diving");
    h.frames(30);
    await h.user.click(button(/^CASH OUT · /));
    h.tick();
    h.untilState("bonus");
    h.frames(1);
    const wallet = h.session.wallet.get();

    first.unmount();
    h.mount();
    h.frames(1);
    expect(h.session.engine.getPublicState().chests).not.toBeNull();
    expect(pickerShown()).toBe(false);
    expect(unpicked()).toEqual([]);
    h.session.submit({ type: "pickChest", chestId: 2 }); // not reachable from the UI; the engine rejects it
    h.untilState("betting");
    expect(h.session.wallet.get().balance).toBe(wallet.balance);
    expect(h.session.engine.getPublicState().chosenChestId).toBeNull();
  });

  it("a spectator gets no picker after a remount during the bonus", async () => {
    const h = await bootScreen();
    const first = h.mount();
    h.untilState("bonus");
    first.unmount();
    h.mount();
    h.frames(1);
    expect(pickerShown()).toBe(false);
    expect(button("WAITING…").hasAttribute("disabled")).toBe(true);
  });
});

describe("sink lifecycle (U4b)", () => {
  it("ten mount/unmount cycles (plain and StrictMode) leave one renderer, one rAF and one sink; the last unmount leaves nothing pending", async () => {
    const h = await bootScreen();
    for (let i = 0; i < 10; i++) {
      const m = h.mount({ strict: i % 2 === 1 });
      h.frames(2);
      m.unmount();
      expect(h.pendingFrames()).toBe(0);
      expect(h.session.driver.running).toBe(false);
      expect(h.renderers.every((r) => r.disposed)).toBe(true);
    }
    h.mount();
    expect(h.renderers.filter((r) => !r.disposed)).toHaveLength(1);
    expect(h.pendingFrames()).toBe(1);
    expect(h.subscriptions.active).toBe(0);

    const reads = vi.spyOn(h.session.engine, "getPublicState");
    const before = h.renderers.map((r) => r.frames);
    h.frames(10);
    expect(reads).toHaveBeenCalledTimes(10); // one round-store write per frame
    const drawn = h.renderers.map((r, i) => r.frames - before[i]);
    expect(drawn.reduce((a, b) => a + b, 0)).toBe(10); // one draw per frame, on the live renderer only
    expect(drawn[drawn.length - 1]).toBe(10);
  });
});

describe("frame-accurate synchronization (U4b)", () => {
  it("at the end of every frame the HUD shows the engine's state of that frame", async () => {
    const h = await bootScreen();
    h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    // One h.frames(1) per iteration: each is its own act() scope, i.e. one
    // rAF callback followed by React's flush — the DOM is read after it.
    // Direct element reads keep ~2,000 per-frame checks cheap.
    const readout = screen.getByText("Multiplier").nextElementSibling!;
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      h.frames(1);
      const s = h.session.engine.getPublicState();
      seen.add(s.phase);
      expect(readout.textContent).toBe(formatMultiplier(s.multiplier));
      if (s.phase === "idle") {
        expect(document.body.textContent).toContain(
          `Next dive in ${s.countdownSeconds.toFixed(1)}s`,
        );
      }
      expect(document.body.textContent?.includes(PICKER)).toBe(
        s.phase === "bonus" && s.participant?.bonusEligible === true,
      );
      if (s.phase === "bonus") break;
    }
    expect([...seen]).toEqual(["idle", "diving", "cashed", "bonus"]);
    expect(unpicked()).toEqual([false, false, false]);

    // The pick: the reveal and the credit land in the same frame.
    await h.user.click(screen.getAllByRole("button", { name: "???" })[1]);
    let frames = 0;
    while (h.session.engine.getPublicState().chosenChestId === null) {
      expect(screen.queryByRole("button", { name: "+6.50×" })).toBeNull();
      h.frames(1);
      frames++;
      expect(frames).toBeLessThan(5);
    }
    expect(button("+6.50×").hasAttribute("disabled")).toBe(true);
    expect(balanceText()).toBe("7490.00");
    expect(multiplierText()).toBe(formatMultiplier(650));
  }, 30_000); // ~2,000 frames, each its own act() + DOM read (≈5 s locally)

  it("frames with no change re-render nothing; a changing field re-renders once per frame", async () => {
    const h = await bootScreen({ crashPoint: 3 });
    let commits = 0;
    render(
      createElement(Profiler, { id: "screen", onRender: () => commits++ }, createElement(h.Screen)),
    );
    h.untilState("crashed"); // spectating: no flash, no settlement
    h.frames(2);

    commits = 0;
    const held = h.session.round.get();
    h.frames(30); // the crash banner: the engine locks every public field
    expect(h.session.engine.state).toBe("crashed");
    expect(h.session.round.get()).toBe(held);
    expect(commits).toBe(0);

    h.untilState("betting");
    h.frames(1);
    commits = 0;
    h.frames(6); // the countdown moves every frame that consumes a tick
    expect(commits).toBeGreaterThan(0);
    expect(commits).toBeLessThanOrEqual(6);
  });
});
