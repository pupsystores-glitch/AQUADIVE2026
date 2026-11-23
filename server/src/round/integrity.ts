// Build integrity of the offline round runtime (P8-4a-1; owner decisions I1 – I4, I8). PLAY MONEY
// ONLY; OFFLINE DEVELOPMENT ONLY. Used by the loader (engine-runtime.ts) and by the build's
// verification step (scripts/engine-integrity.mjs). Errors carry fixed codes only.
//
// Trust anchor (I1). The TRUSTED manifest is a reviewed, Git-tracked file OUTSIDE the generated
// build: <server package>/integrity/engine-manifest.json, i.e. `../integrity/engine-manifest.json`
// relative to the build directory (server/dist). Nothing in the build writes it: the build only
// VERIFIES its output against it and fails otherwise; `engine-integrity.mjs candidate` prints a
// candidate to stdout, and replacing the trusted file is a separate, owner-approved change (I4).
//
// Scope (I2). The protected set is every file of the offline round runtime's module closure in
// the build: the engine bundle (engine/), the loader and pipeline (server/src/round/), the server
// fairness modules (server/src/fairness/ and the bridge server/src/fairness.js) and the compiled
// shared fairness library (src/fairness/). The protected directories must contain exactly the
// manifest's files — a missing, extra, renamed, linked or non-regular file is refused.
//
// Manifest schema v1 (canonical text; anything else is refused):
//
//   {
//     "schema": "aquadive.engine-integrity",
//     "schemaVersion": 1,
//     "algorithm": "sha256",
//     "files": [ { "path": "<posix path in the build>", "bytes": <n>, "sha256": "<64 hex>" }, … ]
//   }
//
// Keys in exactly that order; `files` sorted by path (code-unit order) without duplicates; every
// path matches PROTECTED_PATH; the text is `JSON.stringify(manifest, null, 2)` plus one "\n"
// (LF only), so equal manifests are equal bytes. Digests are SHA-256 of the file's exact bytes,
// computed with the server's verified fairness hash provider.
//
// What it protects (and does not). Before the bundle is loaded, every protected file's bytes are
// hashed and compared; after loading, the module cache is checked so that every protected module
// in it is the manifest's file at its exact path (no other spelling, drive-letter case or
// duplicate instance), and the files are hashed again. This detects compiled artifacts altered
// after a trusted build (a one-byte change, the 200× → 30× clamp edit, changed fairness or round
// code, missing or added modules). It does NOT make check and use atomic: a privileged process
// that swaps a file between the hash and the load, or restores it afterwards, is not detected
// (time-of-check / time-of-use), and code that already runs in this process can change loaded
// modules or JavaScript built-ins. An attacker who can rewrite both the build and the trusted
// manifest defeats it. Read-only deployment images, trusted CI and process isolation are separate
// controls (server/README.md §15).

import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { bytesToHex, sha256, type FairnessHashProvider } from "../fairness";
import { RoundScriptError } from "./errors";

export const INTEGRITY_SCHEMA = "aquadive.engine-integrity";
export const INTEGRITY_SCHEMA_VERSION = 1;
/** The trusted manifest, relative to the server PACKAGE directory (the build's parent). */
export const TRUSTED_MANIFEST_LOCATION = "integrity/engine-manifest.json";
/** Directories (relative to the build) whose files are all protected; flat, files only. */
export const PROTECTED_DIRECTORIES = Object.freeze([
  "engine",
  "server/src/fairness",
  "server/src/round",
  "src/fairness",
] as const);
/** Protected single files outside those directories. */
export const PROTECTED_SINGLE_FILES = Object.freeze(["server/src/fairness.js"] as const);
/** The only path shapes a manifest may name (no traversal, no absolute path, no backslash). */
export const PROTECTED_PATH =
  /^(?:engine\/[a-z0-9-]+\.cjs|server\/src\/fairness\.js|(?:server\/src\/fairness|server\/src\/round|src\/fairness)\/[a-z0-9-]+\.js)$/;
/** Upper bounds: a manifest is small; a protected file is far below this. */
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 256;
const HEX64 = /^[0-9a-f]{64}$/;

export interface IntegrityFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface IntegrityManifest {
  readonly schema: typeof INTEGRITY_SCHEMA;
  readonly schemaVersion: typeof INTEGRITY_SCHEMA_VERSION;
  readonly algorithm: "sha256";
  readonly files: readonly IntegrityFile[];
}

/** Fixed reason codes of `runtime-integrity-failed` (never a path, size or digest). */
export type IntegrityReason =
  | "manifest-missing"
  | "manifest-not-regular"
  | "manifest-malformed"
  | "manifest-not-canonical"
  | "manifest-incomplete"
  | "protected-directory-invalid"
  | "file-missing"
  | "file-not-regular"
  | "file-path-mismatch"
  | "unexpected-file"
  | "size-mismatch"
  | "digest-mismatch"
  | "unexpected-module"
  | "duplicate-module-instance";

const fail = (reason: IntegrityReason): never => {
  throw new RoundScriptError("runtime-integrity-failed", reason);
};

const posix = (p: string): string => p.split(sep).join("/");
/** Windows file names are case-insensitive: compare module identities case-folded there. */
const fold = (p: string): string => (process.platform === "win32" ? p.toLowerCase() : p);

/** The canonical manifest text (the only accepted serialization). */
export function serializeIntegrityManifest(manifest: IntegrityManifest): string {
  const ordered = {
    schema: manifest.schema,
    schemaVersion: manifest.schemaVersion,
    algorithm: manifest.algorithm,
    files: manifest.files.map((f) => ({ path: f.path, bytes: f.bytes, sha256: f.sha256 })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Parses and validates a manifest's text: the schema above, sorted unique protected paths, and
 * byte-for-byte canonical form (so a duplicate key, reordering, CRLF or extra field is refused).
 * `required` paths (the loader's own core files) must be present.
 */
export function parseIntegrityManifest(
  text: string,
  required: readonly string[] = [],
): IntegrityManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("manifest-malformed");
  }
  const m = raw as Record<string, unknown> | null;
  if (
    m === null ||
    typeof m !== "object" ||
    Array.isArray(m) ||
    Object.keys(m).join(",") !== "schema,schemaVersion,algorithm,files" ||
    m.schema !== INTEGRITY_SCHEMA ||
    m.schemaVersion !== INTEGRITY_SCHEMA_VERSION ||
    m.algorithm !== "sha256" ||
    !Array.isArray(m.files) ||
    m.files.length === 0 ||
    m.files.length > MAX_FILES
  ) {
    return fail("manifest-malformed");
  }
  const files: IntegrityFile[] = [];
  let previous = "";
  for (const entry of m.files as unknown[]) {
    const f = entry as Record<string, unknown> | null;
    if (
      f === null ||
      typeof f !== "object" ||
      Array.isArray(f) ||
      Object.keys(f).join(",") !== "path,bytes,sha256" ||
      typeof f.path !== "string" ||
      !PROTECTED_PATH.test(f.path) ||
      !Number.isSafeInteger(f.bytes) ||
      (f.bytes as number) < 1 ||
      (f.bytes as number) > MAX_FILE_BYTES ||
      typeof f.sha256 !== "string" ||
      !HEX64.test(f.sha256) ||
      !(f.path > previous)
    ) {
      return fail("manifest-malformed");
    }
    previous = f.path;
    files.push(Object.freeze({ path: f.path, bytes: f.bytes as number, sha256: f.sha256 }));
  }
  const manifest: IntegrityManifest = Object.freeze({
    schema: INTEGRITY_SCHEMA,
    schemaVersion: INTEGRITY_SCHEMA_VERSION,
    algorithm: "sha256",
    files: Object.freeze(files),
  });
  if (serializeIntegrityManifest(manifest) !== text) fail("manifest-not-canonical");
  const paths = new Set(files.map((f) => f.path));
  if (required.some((p) => !paths.has(p))) fail("manifest-incomplete");
  return manifest;
}

/** Reads the trusted manifest of the build at `buildRoot` (fixed location, regular file only). */
export function readTrustedManifest(
  buildRoot: string,
  required: readonly string[] = [],
): IntegrityManifest {
  const packageRoot = join(buildRoot, "..");
  const path = join(packageRoot, ...TRUSTED_MANIFEST_LOCATION.split("/"));
  let text: string;
  try {
    const st = lstatSync(path);
    if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_MANIFEST_BYTES) {
      return fail("manifest-not-regular");
    }
    // The manifest must be the file itself, not one reached through a linked directory.
    if (
      realpathSync.native(path) !==
      join(realpathSync.native(packageRoot), ...TRUSTED_MANIFEST_LOCATION.split("/"))
    ) {
      return fail("manifest-not-regular");
    }
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof RoundScriptError) throw error;
    return fail("manifest-missing");
  }
  return parseIntegrityManifest(text, required);
}

/** The protected files present in a build, sorted (refuses links and non-regular entries). */
export function listProtectedFiles(buildRoot: string): string[] {
  const out: string[] = [];
  let realRoot: string;
  try {
    realRoot = realpathSync.native(buildRoot);
  } catch {
    return fail("protected-directory-invalid");
  }
  for (const dir of PROTECTED_DIRECTORIES) {
    const abs = join(buildRoot, ...dir.split("/"));
    let entries;
    try {
      const st = lstatSync(abs);
      if (!st.isDirectory() || st.isSymbolicLink()) return fail("protected-directory-invalid");
      if (posix(relative(realRoot, realpathSync.native(abs))) !== dir) {
        return fail("protected-directory-invalid");
      }
      entries = readdirSync(abs, { withFileTypes: true });
    } catch (error) {
      if (error instanceof RoundScriptError) throw error;
      return fail("protected-directory-invalid");
    }
    for (const e of entries) {
      const path = `${dir}/${e.name}`;
      if (!e.isFile() || !PROTECTED_PATH.test(path)) fail("unexpected-file");
      out.push(path);
    }
  }
  for (const file of PROTECTED_SINGLE_FILES) {
    try {
      lstatSync(join(buildRoot, ...file.split("/")));
      out.push(file);
    } catch {
      // Reported as missing by the verification below.
    }
  }
  return out.sort();
}

/** Bytes of one protected file, refusing links, non-regular files and redirected paths. */
function readProtected(buildRoot: string, realRoot: string, path: string): Uint8Array {
  const abs = join(buildRoot, ...path.split("/"));
  try {
    const st = lstatSync(abs);
    if (!st.isFile() || st.isSymbolicLink()) return fail("file-not-regular");
    if (posix(relative(realRoot, realpathSync.native(abs))) !== path) {
      return fail("file-path-mismatch");
    }
    return new Uint8Array(readFileSync(abs));
  } catch (error) {
    if (error instanceof RoundScriptError) throw error;
    return fail("file-missing");
  }
}

/** A candidate manifest of the build (for the reviewed update workflow; never written here). */
export function computeIntegrityManifest(
  buildRoot: string,
  hash: FairnessHashProvider,
): IntegrityManifest {
  const realRoot = realpathSync.native(buildRoot);
  const files = listProtectedFiles(buildRoot).map((path) => {
    const bytes = readProtected(buildRoot, realRoot, path);
    return Object.freeze({ path, bytes: bytes.length, sha256: bytesToHex(sha256(hash, bytes)) });
  });
  return Object.freeze({
    schema: INTEGRITY_SCHEMA,
    schemaVersion: INTEGRITY_SCHEMA_VERSION,
    algorithm: "sha256",
    files: Object.freeze(files),
  });
}

/**
 * Verifies the build at `buildRoot` against `manifest`: the protected directories hold exactly
 * the manifest's files, and every file's size and SHA-256 match. Throws
 * `runtime-integrity-failed` with a fixed reason; returns nothing.
 */
export function verifyBuildIntegrity(
  buildRoot: string,
  manifest: IntegrityManifest,
  hash: FairnessHashProvider,
): void {
  let realRoot: string;
  try {
    realRoot = realpathSync.native(buildRoot);
  } catch {
    return fail("protected-directory-invalid");
  }
  const expected = manifest.files.map((f) => f.path);
  const present = listProtectedFiles(buildRoot);
  const expectedSet = new Set(expected);
  if (present.some((p) => !expectedSet.has(p))) fail("unexpected-file");
  for (const f of manifest.files) {
    const bytes = readProtected(buildRoot, realRoot, f.path);
    if (bytes.length !== f.bytes) fail("size-mismatch");
    if (bytesToHex(sha256(hash, bytes)) !== f.sha256) fail("digest-mismatch");
  }
}

/** The part of a CommonJS module record this check reads. */
interface LoadedModule {
  readonly filename: string;
  readonly children: readonly LoadedModule[];
}

/**
 * After loading: every module in `cache` that lies in a protected location of the build must be
 * the manifest's file at exactly its path (string-equal), and no protected file may be loaded
 * twice under another spelling (on Windows, another case or drive-letter case). `entries` (the
 * bundle, the loader) must be loaded from their exact manifest paths, and every module they
 * required, transitively, must be a manifest file too — so a bundle that requires anything
 * outside the protected set (another directory of the build, a package) is refused.
 */
export function assertLoadedClosure(
  buildRoot: string,
  manifest: IntegrityManifest,
  cache: Readonly<Record<string, LoadedModule | undefined>>,
  entries: readonly string[],
): void {
  const exact = new Map(manifest.files.map((f) => [join(buildRoot, ...f.path.split("/")), f.path]));
  const folded = new Map([...exact.keys()].map((k) => [fold(k), k]));
  const foldedRoot = fold(join(buildRoot, sep));
  const seen = new Map<string, string>();
  for (const key of Object.keys(cache)) {
    const f = fold(key);
    const target = folded.get(f);
    if (target !== undefined) {
      if (key !== target) fail("duplicate-module-instance");
      if (seen.has(f)) fail("duplicate-module-instance");
      seen.set(f, key);
      continue;
    }
    if (!f.startsWith(foldedRoot)) continue;
    const rel = posix(relative(buildRoot, key));
    const inProtected =
      PROTECTED_DIRECTORIES.some((d) => fold(rel).startsWith(`${d}/`)) ||
      PROTECTED_SINGLE_FILES.some((p) => fold(rel) === p);
    if (inProtected) fail("unexpected-module");
  }
  const visited = new Set<string>();
  const walk = (m: LoadedModule): void => {
    if (visited.has(m.filename)) return;
    visited.add(m.filename);
    if (!exact.has(m.filename)) fail("unexpected-module");
    for (const child of m.children) walk(child);
  };
  for (const path of entries) {
    const entry = cache[join(buildRoot, ...path.split("/"))];
    if (entry === undefined) return fail("unexpected-module");
    walk(entry);
  }
}
