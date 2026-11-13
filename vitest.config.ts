// Vitest configuration (Sprint 3, Commit E1; docs/06_ENGINE_ARCHITECTURE.md §21).
//
// Deliberately separate from vite.config.ts: the app config wraps
// @lovable.dev/vite-tanstack-config, whose TanStack Start / nitro / SSR
// plugin stack has no place in a unit-test pipeline. Tests only need the
// `@` path alias, resolved natively from tsconfig paths.
//
// Two projects (Sprint 4, Commit U3; docs/07_UI_ARCHITECTURE.md §21):
// - "node": every `*.test.ts` — engine, renderer, stores, session — runs in
//   the Node environment exactly as before U3.
// - "dom": `*.test.tsx` only — the DOM characterization tier, in jsdom.
// The environment is chosen by file extension, never per-file comments, so
// a node test can't silently start running against a DOM.
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
