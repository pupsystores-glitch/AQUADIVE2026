// Build integrity tool of the offline round runtime (P8-4a-1; owner decisions I1, I2, I4).
// PLAY MONEY ONLY; not connected to the running server.
//
//   node scripts/engine-integrity.mjs verify    [distDir]   (the last step of `npm run build`)
//   node scripts/engine-integrity.mjs candidate [distDir]   (prints a candidate; writes nothing)
//
// `verify` recomputes the build's manifest from the files themselves and requires its canonical
// text to equal the TRUSTED manifest, integrity/engine-manifest.json (reviewed, Git-tracked,
// outside the build), byte for byte. It does not run any code of the build it checks: hashing is
// node:crypto, the rules are the ones below (a test keeps them equal to src/round/integrity.ts).
// On a mismatch it prints the affected paths (no digest), removes <dist>/engine/engine.cjs so
// that no unverified bundle stays behind, and exits 1.
//
// `candidate` prints the build's manifest to stdout and NEVER writes the trusted file. Updating
// the trusted manifest is a deliberate, separately owner-approved change (I4): build a clean
// checkout, run `candidate`, review the difference to the tracked file, and only after the owner's
// approval replace integrity/engine-manifest.json with it in its own reviewed change. Never
// regenerate it to make a failing build or test pass.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
export const TRUSTED_MANIFEST = join(SERVER_DIR, "integrity", "engine-manifest.json");
export const SCHEMA = "aquadive.engine-integrity";
export const SCHEMA_VERSION = 1;
export const PROTECTED_DIRECTORIES = [
  "engine",
  "server/src/authority",
  "server/src/fairness",
  "server/src/prep",
  "server/src/round",
  "server/src/scheduler",
  "src/fairness",
];
export const PROTECTED_SINGLE_FILES = ["server/src/fairness.js"];
export const PROTECTED_PATH =
  /^(?:engine\/[a-z0-9-]+\.cjs|server\/src\/fairness\.js|(?:server\/src\/authority|server\/src\/fairness|server\/src\/prep|server\/src\/round|server\/src\/scheduler|src\/fairness)\/[a-z0-9-]+\.js)$/;
const BUNDLE = ["engine", "engine.cjs"];

const posix = (p) => p.split(sep).join("/");

class IntegrityToolError extends Error {}
const refuse = (message) => {
  throw new IntegrityToolError(message);
};

/** Protected files of a build, sorted; refuses links, non-regular entries and odd names. */
export function listProtectedFiles(dist) {
  const realRoot = realpathSync.native(dist);
  const out = [];
  for (const dir of PROTECTED_DIRECTORIES) {
    const abs = join(dist, ...dir.split("/"));
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      refuse(`protected directory missing: ${dir}`);
    }
    if (!st.isDirectory() || st.isSymbolicLink()) refuse(`not a plain directory: ${dir}`);
    if (posix(relative(realRoot, realpathSync.native(abs))) !== dir) refuse(`redirected: ${dir}`);
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const path = `${dir}/${e.name}`;
      if (!e.isFile() || !PROTECTED_PATH.test(path)) refuse(`unexpected entry: ${path}`);
      out.push(path);
    }
  }
  for (const file of PROTECTED_SINGLE_FILES) {
    try {
      const st = lstatSync(join(dist, ...file.split("/")));
      if (!st.isFile() || st.isSymbolicLink()) refuse(`not a regular file: ${file}`);
      out.push(file);
    } catch (e) {
      if (e instanceof IntegrityToolError) throw e;
      refuse(`missing: ${file}`);
    }
  }
  return out.sort();
}

/** The build's manifest in canonical text (the only accepted serialization). */
export function candidateManifestText(dist) {
  const realRoot = realpathSync.native(dist);
  const files = listProtectedFiles(dist).map((path) => {
    const abs = join(dist, ...path.split("/"));
    if (posix(relative(realRoot, realpathSync.native(abs))) !== path) refuse(`redirected: ${path}`);
    const bytes = readFileSync(abs);
    return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const manifest = { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, algorithm: "sha256", files };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Paths whose entries differ between two manifest texts (no digest is reported). */
function differingPaths(trustedText, candidateText) {
  const entries = (text) => {
    try {
      return new Map(JSON.parse(text).files.map((f) => [f.path, `${f.bytes}:${f.sha256}`]));
    } catch {
      return null;
    }
  };
  const a = entries(trustedText);
  const b = entries(candidateText);
  if (a === null) return ["(the trusted manifest is malformed)"];
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  return paths
    .filter((p) => a.get(p) !== b.get(p))
    .map((p) => (!a.has(p) ? `unexpected: ${p}` : !b.has(p) ? `missing: ${p}` : `changed: ${p}`));
}

/** Verifies `dist` against the trusted manifest. Returns the list of problems (empty = ok). */
export function verifyAgainstTrusted(dist, trustedPath = TRUSTED_MANIFEST) {
  let trusted;
  try {
    const st = lstatSync(trustedPath);
    if (!st.isFile() || st.isSymbolicLink()) return ["the trusted manifest is not a regular file"];
    trusted = readFileSync(trustedPath, "utf8");
  } catch {
    return ["the trusted manifest is missing"];
  }
  let candidate;
  try {
    candidate = candidateManifestText(dist);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
  if (candidate === trusted) return [];
  const paths = differingPaths(trusted, candidate);
  return paths.length > 0 ? paths : ["the trusted manifest is not in canonical form"];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, distArg] = process.argv.slice(2);
  const dist = distArg ?? join(SERVER_DIR, "dist");
  if (command === "candidate") {
    try {
      process.stdout.write(candidateManifestText(dist));
    } catch (e) {
      console.error(`engine integrity: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  } else if (command === "verify") {
    const problems = verifyAgainstTrusted(dist);
    if (problems.length === 0) {
      console.log("engine integrity: build matches integrity/engine-manifest.json");
    } else {
      rmSync(join(dist, ...BUNDLE), { force: true });
      console.error(
        "engine integrity: the build does NOT match the trusted manifest " +
          "integrity/engine-manifest.json; the engine bundle was removed.\n" +
          problems.map((p) => `  ${p}`).join("\n") +
          "\nA legitimate change needs a separately owner-approved manifest update " +
          "(node scripts/engine-integrity.mjs candidate); never regenerate it to pass a build.",
      );
      process.exitCode = 1;
    }
  } else {
    console.error("usage: node scripts/engine-integrity.mjs verify|candidate [distDir]");
    process.exitCode = 2;
  }
}
