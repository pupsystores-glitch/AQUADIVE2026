// Win-flash DOM tests (Sprint 4, Commit U4a; docs/07_UI_ARCHITECTURE.md §12,
// delta V2). The real component over a scripted session: the flash is now
// owned by the session's notification store, so it survives a component
// remount, keeps its original deadline, and is never duplicated by a
// StrictMode double-mount. The frame clock drives the fake setTimeout
// (dom-harness.tsx), so durations are checked on the round timeline.
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { CASH_FLASH_MS, JACKPOT_FLASH_MS } from "@/game/config";
import { bootScreen, slotButton } from "@/ui/test/dom-harness";
import { slot0View } from "@/ui/test/wallet-view";

const FRAMES_PER_SECOND = 60;
const framesFor = (ms: number) => (ms / 1000) * FRAMES_PER_SECOND;
const button = (name: string | RegExp) => slotButton(name);
const flashShown = () => screen.queryByText("CASHED OUT") !== null;

/** Boot, bet 5, dive, cash out on the next tick. Returns the harness and the mounted result. */
const cashOutRound = async (strict = false) => {
  const h = await bootScreen({ crashPoint: 3 });
  const mounted = h.mount({ strict });
  await h.user.click(button(/^PLACE BET/));
  h.untilState("diving");
  h.frames(30);
  await h.user.click(button(/^CASH OUT · /));
  h.tick();
  return { h, mounted };
};

describe("win flash — notification store (U4a)", () => {
  it("the flash is session state: one pending timer, no component flash subscription", async () => {
    const { h } = await cashOutRound();
    expect(flashShown()).toBe(true);
    expect(h.session.notifications.get().flash?.kind).toBe("cashFlash");
    expect(vi.getTimerCount()).toBe(1); // the store's one flash timer
    // The component subscribes to nothing since U4b (C7: was the three chest listeners).
    expect(h.subscriptions.active).toBe(0);
  });

  it("an active flash survives unmount/remount and expires on its original deadline", async () => {
    const { h, mounted } = await cashOutRound();
    h.frames(30); // 0.5 s of the flash elapsed
    mounted.unmount();
    h.frames(30); // 0.5 s more with nothing mounted (wall clock still runs)
    expect(h.session.notifications.get().flash).not.toBeNull();

    h.mount();
    expect(flashShown()).toBe(true); // shown again immediately — not restarted, not lost
    const lastWin = slot0View(h.session.wallet.get()).lastWin!;
    expect(screen.getByText(`+${lastWin.amount.toFixed(2)}`)).toBeTruthy();

    h.frames(framesFor(CASH_FLASH_MS) - 60 - 2); // just before the original deadline
    expect(flashShown()).toBe(true);
    h.frames(3);
    expect(flashShown()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a flash that expired while unmounted is not shown on remount", async () => {
    const { h, mounted } = await cashOutRound();
    mounted.unmount();
    h.frames(framesFor(CASH_FLASH_MS) + 1);
    h.mount();
    expect(flashShown()).toBe(false);
    expect(h.session.notifications.get().flash).toBeNull();
  });

  it("StrictMode: one flash, one timer, expiring after CASH_FLASH_MS", async () => {
    const { h } = await cashOutRound(true);
    expect(screen.getAllByText("CASHED OUT")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(h.subscriptions.active).toBe(0); // C7 (U4b): was 3
    expect(h.renderers.filter((r) => !r.disposed)).toHaveLength(1); // one sink after the double-mount
    h.frames(framesFor(CASH_FLASH_MS) - 2);
    expect(flashShown()).toBe(true);
    h.frames(3);
    expect(flashShown()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("jackpot flash lasts JACKPOT_FLASH_MS and survives a remount during impact", async () => {
    const h = await bootScreen();
    const first = h.mount();
    await h.user.click(button("10"));
    await h.user.click(button(/^PLACE BET/));
    h.until(() => h.session.notifications.get().flash !== null, "the jackpot flash");
    const flash = h.session.notifications.get().flash!;
    expect(flash.kind).toBe("jackpotFlash");
    expect(flash.expiresAt - flash.startedAt).toBe(JACKPOT_FLASH_MS);

    first.unmount();
    h.mount();
    h.frames(1);
    expect(flashShown()).toBe(true);
    expect(screen.getByText("+1000.00")).toBeTruthy();

    h.frames(framesFor(JACKPOT_FLASH_MS) - 4); // still inside the window (one frame was spent above, plus slack)
    expect(flashShown()).toBe(true);
    h.frames(5);
    expect(flashShown()).toBe(false);
    expect(slot0View(h.session.wallet.get()).balance).toBe(1990); // settlement untouched by the flash lifecycle
  });
});
