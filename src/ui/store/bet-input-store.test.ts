// Bet-input store tests (Sprint 4, Commit U5; docs/07_UI_ARCHITECTURE.md §9,
// §21 tier 2; delta V4). Node env, no React.
//
// The arithmetic is pinned against a verbatim transcription of the pre-U5
// shell handlers, so halve / double / quick-set / typed input produce the
// same values bit for bit (D11: no new rounding). Sanitation pins the one
// sanctioned change (D2): non-finite → 0; the negative clamp and the
// cleared-field → 0 behavior (D1) are preserved.
import { describe, expect, it, vi } from "vitest";
import { QUICK_BETS } from "@/game/config";
import { DEFAULT_BET } from "@/game/constants";
import {
  createBetInputStore,
  parseBetInput,
  sanitizeBetAmount,
  type BetInputStore,
} from "./bet-input-store";

// ----- the pre-U5 handlers, transcribed verbatim from AbyssAnchor.tsx -----
const shell = {
  halve: (b: number) => Math.max(1, +(b / 2).toFixed(2)),
  double: (b: number, balance: number) => Math.min(balance, +(b * 2).toFixed(2)),
  typed: (raw: string) => Math.max(0, +raw),
};

const fresh = (initial = DEFAULT_BET): BetInputStore => createBetInputStore(initial);

describe("bet-input store — initial state and surface", () => {
  it("starts at the given amount (the session passes DEFAULT_BET = 5)", () => {
    expect(fresh().get()).toBe(5);
    expect(fresh(25).get()).toBe(25);
  });

  it("sanitizes the initial amount too", () => {
    expect(fresh(Number.NaN).get()).toBe(0);
    expect(fresh(-3).get()).toBe(0);
  });

  it("exposes get/subscribe and the four betting-panel writers only", () => {
    expect(Object.keys(fresh()).sort()).toEqual([
      "double",
      "get",
      "halve",
      "input",
      "set",
      "subscribe",
    ]);
  });
});

describe("bet-input store — halve (−), verbatim", () => {
  it("halves with two decimals and a floor of 1 (the U3 DOM sequence 5 → 2.5 → 1.25 → 1 → 1)", () => {
    const s = fresh();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s.halve();
      seen.push(s.get());
    }
    expect(seen).toEqual([2.5, 1.25, 1, 1]);
  });

  it("matches the shell's handler on a grid of values, including toFixed artifacts", () => {
    for (const b of [
      0, 0.01, 0.5, 1, 1.25, 1.5, 2.5, 3, 3.33, 5, 7.77, 10, 99.99, 1000, 1234.567,
    ]) {
      const s = fresh(b);
      s.halve();
      expect(s.get(), `halve(${b})`).toBe(shell.halve(b));
    }
  });

  it("raises 0 to 1 (pre-U5 behavior: the floor applies to a cleared field too)", () => {
    const s = fresh();
    s.input("");
    s.halve();
    expect(s.get()).toBe(1);
  });
});

describe("bet-input store — double (+), verbatim", () => {
  it("doubles with two decimals, capped at the caller's balance (5 → 10; 100 → 200 → 400 → 800 → 1000)", () => {
    const s = fresh();
    s.double(1000);
    expect(s.get()).toBe(10);
    s.set(100);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s.double(1000);
      seen.push(s.get());
    }
    expect(seen).toEqual([200, 400, 800, 1000]);
  });

  it("matches the shell's handler on a grid of bets × balances", () => {
    for (const balance of [0, 0.3, 5, 9.99, 1000, 7490]) {
      for (const b of [0, 0.01, 0.15, 1, 1.255, 2.5, 5, 333.33, 1000]) {
        const s = fresh(b);
        s.double(balance);
        expect(s.get(), `double(${b}) at ${balance}`).toBe(shell.double(b, balance));
      }
    }
  });

  it("reads the balance from its argument only — the store holds no wallet state", () => {
    const s = fresh(400);
    s.double(500);
    expect(s.get()).toBe(500);
    s.double(10_000);
    expect(s.get()).toBe(1000);
  });
});

describe("bet-input store — quick-set", () => {
  it("sets each QUICK_BETS value as is", () => {
    const s = fresh();
    for (const v of QUICK_BETS) {
      s.set(v);
      expect(s.get()).toBe(v);
    }
  });
});

describe("bet-input store — typed input (V4 sanitation)", () => {
  it("valid typed amounts pass through unchanged — no new rounding (D11)", () => {
    const s = fresh();
    for (const raw of ["42", "1500", "0", "0.5", "0.123", "1e3", "007", "  12  ", "999.999"]) {
      s.input(raw);
      expect(s.get(), raw).toBe(shell.typed(raw));
    }
    s.input("0.123");
    expect(s.get()).toBe(0.123);
  });

  it('a cleared field is 0, exactly as before U5 (D1) — `+""` is 0, never NaN (D3)', () => {
    expect(shell.typed("")).toBe(0); // the pre-U5 handler: the documented NaN never happened
    const s = fresh();
    s.input("");
    expect(s.get()).toBe(0);
    expect(Object.is(s.get(), 0)).toBe(true);
  });

  it("negative input is clamped to 0, as before", () => {
    const s = fresh();
    for (const raw of ["-1", "-0.01", "-1e9", "-0"]) {
      s.input(raw);
      expect(Object.is(s.get(), 0), raw).toBe(true);
      expect(shell.typed(raw)).toBe(0);
    }
  });

  it("non-finite input becomes 0 — the sanctioned V4 change (D2)", () => {
    const cases: Array<[string, number]> = [
      ["abc", Number.NaN],
      ["1e309", Number.POSITIVE_INFINITY],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-1e309", Number.NEGATIVE_INFINITY],
      ["NaN", Number.NaN],
    ];
    for (const [raw, before] of cases) {
      // What the pre-U5 handler produced (NaN or Infinity; -Infinity was clamped to 0)…
      expect(shell.typed(raw)).toBe(Math.max(0, before));
      // …and what it produces now.
      const s = fresh();
      s.input(raw);
      expect(s.get(), raw).toBe(0);
    }
  });

  it("every writer keeps the snapshot finite and ≥ 0", () => {
    const s = fresh();
    s.set(Number.NaN);
    expect(s.get()).toBe(0);
    s.set(Number.POSITIVE_INFINITY);
    expect(s.get()).toBe(0);
    s.set(-5);
    expect(s.get()).toBe(0);
    s.set(10);
    s.double(Number.POSITIVE_INFINITY); // a non-finite cap cannot leak in either
    expect(s.get()).toBe(20);
    s.double(Number.NaN);
    expect(s.get()).toBe(0);
  });
});

describe("sanitizeBetAmount / parseBetInput (pure)", () => {
  it("sanitizeBetAmount: finite ≥ 0 unchanged; negatives → 0; non-finite → 0", () => {
    for (const v of [0, 0.01, 1, 5, 2.5, 1000, Number.MAX_VALUE])
      expect(sanitizeBetAmount(v)).toBe(v);
    for (const v of [-0, -1, -Number.MAX_VALUE, Number.NaN, Infinity, -Infinity]) {
      expect(Object.is(sanitizeBetAmount(v), 0), String(v)).toBe(true);
    }
  });

  it("parseBetInput: the shell's Math.max(0, +raw) for finite results, else 0", () => {
    for (const raw of ["", "0", "5", "2.5", "-3", "1e3", " 7 "]) {
      expect(parseBetInput(raw)).toBe(shell.typed(raw));
    }
    expect(parseBetInput("1e309")).toBe(0);
    expect(parseBetInput("x")).toBe(0);
  });
});

describe("bet-input store — notifications", () => {
  it("notifies once per changed write; an equal write is quiet", () => {
    const s = fresh();
    const notify = vi.fn();
    s.subscribe(notify);
    s.set(5); // unchanged
    expect(notify).not.toHaveBeenCalled();
    s.set(10);
    expect(notify).toHaveBeenCalledTimes(1);
    s.halve(); // 5
    s.halve(); // 2.5
    expect(notify).toHaveBeenCalledTimes(3);
    s.set(1);
    s.halve(); // floor: stays 1 → quiet
    expect(notify).toHaveBeenCalledTimes(4);
    s.input("abc"); // → 0
    s.input("1e309"); // → 0 again: quiet
    expect(notify).toHaveBeenCalledTimes(5);
  });

  it("unsubscribe stops delivery", () => {
    const s = fresh();
    const notify = vi.fn();
    const off = s.subscribe(notify);
    off();
    s.set(25);
    expect(notify).not.toHaveBeenCalled();
  });

  it("two stores are independent", () => {
    const a = fresh();
    const b = fresh();
    a.set(100);
    expect(b.get()).toBe(DEFAULT_BET);
  });
});
