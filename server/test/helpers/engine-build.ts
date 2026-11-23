// TEST ONLY: builds the server as `npm run build` does into a temporary directory, plus the
// TEST-ONLY bundles the compiled-runtime probes use (P8-4-0, P8-4a). Never shipped.
//
// - `buildServer(tmp)`: `tsc -p tsconfig.build.json --outDir <tmp>/dist`, then
//   `node scripts/build-engine.mjs <tmp>/dist` (the production engine bundle).
// - `buildQaBundles(dist)`: TEST-ONLY bundles in <dist>/qa/ of the UNCHANGED source the production
//   bundle no longer exports (owner decision K2): `game-engine.cjs` (src/engine/game-engine.ts),
//   `seeded-round.cjs` (the src/seeded-round barrel) and the original src/seeded-round/test helpers
//   (reference runner, replay pins, independent vectors), one multi-entry build with shared
//   chunks, so the reference runner and the probe see the same classes. `@/fairness` stays
//   external (the server's compiled copy), like in the production bundle. Plus
//   `local-authority.cjs` (src/engine/round-authority.ts alone).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { REPO_DIR, buildEngineBundle } from "../../scripts/build-engine.mjs";

export const SERVER = fileURLToPath(new URL("../..", import.meta.url));
const TSC = join(SERVER, "node_modules", "typescript", "bin", "tsc");
export const SEEDED_TEST = join(REPO_DIR, "src", "seeded-round", "test");

/** Builds the server into `<tmp>/dist` and returns that path. */
export function buildServer(tmp: string): string {
  const dist = join(tmp, "dist");
  // The build lives outside server/, so state the module format the server package declares.
  writeFileSync(join(tmp, "package.json"), '{ "type": "commonjs" }\n');
  const tsc = spawnSync(process.execPath, [TSC, "-p", "tsconfig.build.json", "--outDir", dist], {
    cwd: SERVER,
    encoding: "utf8",
    timeout: 180_000,
  });
  expect(tsc.status, `${tsc.stdout}${tsc.stderr}`).toBe(0);
  const cli = spawnSync(process.execPath, [join("scripts", "build-engine.mjs"), dist], {
    cwd: SERVER,
    encoding: "utf8",
    timeout: 120_000,
  });
  expect(cli.status, `${cli.stdout}${cli.stderr}`).toBe(0);
  return dist;
}

/** Builds the TEST-ONLY bundles into `<dist>/qa/`; returns the local-authority module list. */
export async function buildQaBundles(dist: string): Promise<readonly string[]> {
  await buildEngineBundle({
    dist,
    dir: "qa",
    input: {
      "game-engine": join(REPO_DIR, "src", "engine", "game-engine.ts"),
      "seeded-round": join(REPO_DIR, "src", "seeded-round", "index.ts"),
      "reference-runner": join(SEEDED_TEST, "reference-runner.ts"),
      "replay-pins": join(SEEDED_TEST, "replay-pins.ts"),
      "independent-vectors": join(SEEDED_TEST, "independent-vectors.ts"),
    },
    allowTestModules: true,
  });
  const [local] = await buildEngineBundle({
    dist,
    dir: "qa",
    input: { "local-authority": join(REPO_DIR, "src", "engine", "round-authority.ts") },
  });
  return local!.modules;
}
