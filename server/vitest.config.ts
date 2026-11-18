// Vitest configuration for the server package (P8-2).
//
// Independent of the root vitest.config.ts (which runs src/** only). Tests
// load the shared protocol source from ../src/protocol; `resolve.alias` pins
// its bare `zod` import to THIS package's copy, so the tests never fall back to
// the root's node_modules and never load two zod instances (a test checks it).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverZod = fileURLToPath(new URL("./node_modules/zod/index.js", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^zod$/, replacement: serverZod }],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
