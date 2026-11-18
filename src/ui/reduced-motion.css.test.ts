// V7 (Phase 7; docs/08 §2.4, §12, §16): the reduced-motion guards in
// src/styles.css. Under `prefers-reduced-motion: reduce` the multiplier's
// goldPulse stops and keeps its resting glow as a still text-shadow, and the
// crash-shake does not run; the normal-motion rules stay byte-identical.
// Every infinite animation in the stylesheet is guarded, and the CH1 chest
// guards are unchanged. Read from disk: Vitest's CSS handling empties `?raw`
// stylesheet imports.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tsx = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** The bodies of every `@media (prefers-reduced-motion: reduce) { … }` block (brace-matched). */
function reducedBlocks(source: string): string[] {
  const out: string[] = [];
  const head = "@media (prefers-reduced-motion: reduce) {";
  let from = 0;
  for (;;) {
    const at = source.indexOf(head, from);
    if (at < 0) return out;
    let depth = 1;
    let i = at + head.length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
    }
    out.push(source.slice(at + head.length, i - 1));
    from = i;
  }
}

/** The declarations of `selector { … }` inside a block (first match), normalized. */
function rule(block: string, selector: string): string | null {
  const re = new RegExp(
    `(^|[\\s,}])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
  );
  const m = re.exec(block);
  return m ? m[2].replace(/\s+/g, " ").trim() : null;
}

const GOLD_REST =
  "0 0 12px color-mix(in oklab, var(--gold) 60%, transparent), 0 0 32px color-mix(in oklab, var(--gold-deep) 30%, transparent)";

describe("V7 reduced-motion guards (styles.css)", () => {
  const blocks = reducedBlocks(css);
  const v7 = blocks.find((b) => rule(b, ".multiplier-glow") !== null) ?? "";

  it("guards the multiplier's goldPulse: no animation, the resting glow kept still", () => {
    expect(v7).not.toBe("");
    expect(rule(v7, ".multiplier-glow")).toBe(`animation: none; text-shadow: ${GOLD_REST};`);
    // The still glow is exactly goldPulse's resting (0% / 100%) frame.
    expect(css).toContain(`0%, 100% { text-shadow: ${GOLD_REST}; }`);
  });

  it("guards the crash-shake: no animation (the crash markup is unchanged)", () => {
    expect(rule(v7, ".crash-shake")).toBe("animation: none;");
    expect(tsx("./components/MultiplierOverlay.tsx")).toContain(
      'showCrash ? "crash-shake text-danger" : ""',
    );
  });

  it("leaves the normal-motion rules byte-identical", () => {
    expect(css).toContain(
      ".multiplier-glow {\n  animation: goldPulse 2.4s ease-in-out infinite;\n}",
    );
    expect(css).toContain(".crash-shake {\n  animation: crashShake 0.35s ease-in-out 2;\n}");
    // The guard is only inside the media query: outside it no rule sets animation: none on them.
    const outside = blocks.reduce((s, b) => s.replace(b, ""), css);
    expect(rule(outside, ".multiplier-glow")).toBe(
      "animation: goldPulse 2.4s ease-in-out infinite;",
    );
    expect(rule(outside, ".crash-shake")).toBe("animation: crashShake 0.35s ease-in-out 2;");
  });

  it("every infinite CSS animation is stopped under reduced motion", () => {
    const infinite = [...css.matchAll(/([^{}]+)\{[^}]*animation:[^;}]*infinite[^}]*\}/g)].map((m) =>
      m[1].trim(),
    );
    expect(infinite).toEqual([".multiplier-glow"]);
    for (const selector of infinite) {
      expect(blocks.some((b) => /animation: none/.test(rule(b, selector) ?? ""))).toBe(true);
    }
  });

  it("keeps the CH1 chest guards (F8 off, still reveal) exactly as approved", () => {
    const ch1 = blocks.find((b) => b.includes(".chest-glint")) ?? "";
    expect(ch1).toContain(".chest-glint,\n  .chest-reveal-value::after {\n    display: none;\n  }");
    expect(ch1).toContain(
      ".chest-pick-pop {\n    animation: none;\n    transform: scale(1.1) translateY(-3%);\n  }",
    );
    expect(blocks).toHaveLength(2); // CH1's block and V7's, nothing else
  });

  it("the loading screen keeps its motion-reduce utilities", () => {
    const src = tsx("./components/LoadingScreen.tsx");
    expect(src).toContain("motion-reduce:transition-none");
    expect(src).toContain("motion-reduce:animate-none");
  });
});
