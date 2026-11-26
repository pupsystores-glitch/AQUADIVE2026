// Entry point of the offline Authority child process (Stage 1 — Isolated Authority Host). PLAY
// MONEY ONLY; OFFLINE DEVELOPMENT ONLY. Started only by the development launcher (launcher.ts) as
//
//   <node> <authorityNodeFlags(packageRoot)> <build>/server/src/authority/authority-main.js
//
// with an explicit environment and two inherited one-way pipes: file descriptor 3 (commands in)
// and 4 (replies out). When it is loaded in
// any other way (required as a module) it does nothing.
//
// Before anything else it checks, and otherwise exits with AUTHORITY_EXIT.selfCheck without
// sending a byte:
//
// - NODE_ENV is "development" or "test" (never production) and no other NODE_* variable is set
//   (no NODE_OPTIONS `--require` / `--import`, NODE_PATH, …: protocol.ts isAuthorityEnvironment);
// - `process.execArgv` is EXACTLY the fixed hardening flags for this build's package root (so no
//   `--inspect`, `--require`, `--import`, `--loader`, … and the permission model is on);
// - the permission model is active: no file write, no child process, no addon, no WASI; reads
//   are allowed below the package root; worker threads are allowed (the preparation worker);
// - there is no Node IPC channel (`process.channel`) and no parent `send`.
//
// Then it verifies the build against the TRUSTED integrity manifest, which must name the
// Authority's, the scheduler's and the preparation runtime's files, and the loaded module closure
// of this entry (every module it loaded, transitively, must be a manifest file at its exact path);
// a mismatch exits with AUTHORITY_EXIT.integrity. Only then does it open the pipe, create the
// host (host.ts) and send `ready`. Like every in-process check, these cannot vouch for a patched
// build or a modified Node executable (A-1); they refuse an UNHARDENED LAUNCH of an unmodified
// build. The isolation they give is a separate OS process of the SAME OS user (server README §19).

import { Socket as SocketExport } from "node:net";
import { join as joinExport } from "node:path";
import { createNodeFairnessCrypto } from "../fairness/crypto-node";
import { PREP_PROTECTED_FILES } from "../prep/protocol";
import { REQUIRED_PROTECTED_FILES } from "../round/engine-runtime";
import * as integrity from "../round/integrity";
import { SCHEDULER_PROTECTED_FILES } from "../scheduler/source";
import { AuthorityHost } from "./host";
import {
  AUTHORITY_ENTRY_LOCATION,
  AUTHORITY_EXIT,
  AUTHORITY_PROTECTED_FILES,
  authorityNodeFlags,
  isAuthorityEnvironment,
} from "./protocol";

const Socket = SocketExport;
const join = joinExport;
const { assertLoadedClosure, readTrustedManifest, verifyBuildIntegrity } = integrity;
const exit = process.exit.bind(process);

/** <build> of <build>/server/src/authority/authority-main.js, and the package root above it. */
const buildRoot = (): string => join(__dirname, "..", "..", "..");
const packageRoot = (): string => join(buildRoot(), "..");

/** The launch checks of the file comment. */
function launchIsHardened(): boolean {
  try {
    if (!isAuthorityEnvironment(process.env)) return false;
    const expected = authorityNodeFlags(packageRoot());
    const actual = process.execArgv;
    if (actual.length !== expected.length || actual.some((a, i) => a !== expected[i])) {
      return false;
    }
    const permission = (process as { permission?: { has(scope: string, ref?: string): boolean } })
      .permission;
    if (typeof permission !== "object" || permission === null) return false;
    for (const scope of ["fs.write", "child", "addon", "wasi"]) {
      if (permission.has(scope)) return false;
    }
    if (!permission.has("worker") || !permission.has("fs.read", buildRoot())) return false;
    if (process.channel !== undefined || typeof process.send === "function") return false;
    return true;
  } catch {
    return false;
  }
}

/** The integrity checks of the file comment. */
function buildIsTrusted(): boolean {
  try {
    const root = buildRoot();
    const manifest = readTrustedManifest(root, [
      ...REQUIRED_PROTECTED_FILES,
      ...PREP_PROTECTED_FILES,
      ...SCHEDULER_PROTECTED_FILES,
      ...AUTHORITY_PROTECTED_FILES,
    ]);
    verifyBuildIntegrity(root, manifest, createNodeFairnessCrypto().hash);
    assertLoadedClosure(root, manifest, require.cache, [AUTHORITY_ENTRY_LOCATION]);
    return true;
  } catch {
    return false;
  }
}

function runAuthority(): void {
  if (!launchIsHardened()) return exit(AUTHORITY_EXIT.selfCheck);
  if (!buildIsTrusted()) return exit(AUTHORITY_EXIT.integrity);
  let input: SocketExport;
  let output: SocketExport;
  try {
    input = new Socket({ fd: 3, readable: true, writable: false });
    output = new Socket({ fd: 4, readable: false, writable: true });
  } catch {
    return exit(AUTHORITY_EXIT.channel);
  }
  const host = new AuthorityHost(
    {
      write: (frame) => {
        output.write(frame);
      },
      pending: () => output.writableLength,
      end: () => {
        output.end();
      },
    },
    (code) => exit(code),
  );
  // Anything unexpected fails closed (no stack trace or message leaves the process).
  process.on("uncaughtException", () => host.fail("internal-error", AUTHORITY_EXIT.internal));
  process.on("unhandledRejection", () => host.fail("internal-error", AUTHORITY_EXIT.internal));
  input.on("data", (chunk: Uint8Array) => host.receive(chunk));
  for (const pipe of [input, output]) {
    pipe.on("close", () => host.channelLost());
    pipe.on("error", () => host.channelLost());
  }
  input.on("end", () => host.channelLost());
  host.ready();
}

if (typeof module === "object" && module !== null && require.main === module) runAuthority();
