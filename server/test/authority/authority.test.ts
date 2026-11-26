// Offline Isolated Authority Host (Stage 1), compiled run time. PLAY MONEY ONLY; offline only.
//
// Builds the server as `npm run build` does into a temporary directory and runs
// authority-probe.cjs in fresh Node processes. Each probe process plays the UNTRUSTED
// application process; the Authority (scheduler, source, preparation worker, clock) is its child:
//
// - determinism: the public vector chains A / B through the Authority give the pinned event-log
//   digests and exactly the events of the in-process scheduler (scheduler-probe.cjs run), and the
//   independent vectors' outcomes;
// - secrecy: every byte the Authority sent is a valid reply frame; no chain link (round seed),
//   vector seed or salt appears in any encoding; 64-hex values only as public ids and digests;
//   no event is ahead of the tick it was sent at;
// - caller mutations: EventEmitter / Promise / JSON patched after launch see no worker message,
//   script or secret and change nothing; inspector access from outside and inside is refused;
//   NODE_OPTIONS injection never reaches the Authority; unhardened launches are refused;
// - malformed frames, invalid / unauthorized / duplicate commands, queue overflow;
// - Authority killed, parent killed, pipe closed, event gaps, dropped events, tampered events;
// - the real monotonic clock; integrity of the four Authority files; startup isolation.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAIRNESS_DEV_VECTORS_V1 } from "../../src/fairness";
import { FrameDecoder, MAX_REPLY_BYTES } from "../../src/authority/protocol";
import * as tool from "../../scripts/engine-integrity.mjs";
import {
  SERVER,
  TRUSTED_MANIFEST,
  buildServer,
  writeRehashedManifest,
} from "../helpers/engine-build";

const PROBE = fileURLToPath(new URL("./authority-probe.cjs", import.meta.url));
const SCHEDULER_PROBE = fileURLToPath(new URL("../scheduler/scheduler-probe.cjs", import.meta.url));
const ref = createRequire(import.meta.url)("../scheduler/reference-model.cjs");
const VECTORS = JSON.parse(
  readFileSync(join(SERVER, "test", "independent", "vectors-v1.json"), "utf8"),
).vectors;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Report = any;

/** = scheduler-worker.test.ts PINNED_DIGEST (each equals the independent reference model's). */
const PINNED_DIGEST: Record<string, string> = {
  A: "0218d4a2d6fb756bf6ed6083961e8d889b0cefa3f7f1fa0810f212c50180dc38",
  B: "816b34082f68ba57bdd5c4440961c1b9b7a996e00d1b718e2978f9c4d9d6305d",
};
const AUTHORITY_FILES = ["authority-main", "host", "launcher", "protocol"].map(
  (f) => `server/src/authority/${f}.js`,
);

let tmp = "";
let dist = "";

const run = (script: string, buildDir: string, args: string[], env = process.env) => {
  const r = spawnSync(process.execPath, [script, buildDir, ...args], {
    encoding: "utf8",
    timeout: 240_000,
    env,
  });
  const report = JSON.parse(r.stdout);
  expect(report.fatal, r.stdout.slice(0, 2000)).toBeUndefined();
  expect(r.status, r.stderr).toBe(0);
  return report;
};
const probe = (buildDir: string, ...args: string[]): Report => {
  const report = run(PROBE, buildDir, args);
  expect(report.counters).toEqual({ unhandled: 0 });
  return report;
};

const copyOf = (name: string): string => {
  const copy = join(tmp, name, "dist");
  cpSync(dist, copy, { recursive: true });
  cpSync(join(tmp, "integrity"), join(tmp, name, "integrity"), { recursive: true });
  writeFileSync(join(tmp, name, "package.json"), '{ "type": "commonjs" }\n');
  return copy;
};
const patched = (name: string, file: string, anchor: string, replacement: string): string => {
  const copy = copyOf(name);
  const path = join(copy, ...file.split("/"));
  const text = readFileSync(path, "utf8");
  expect(text.split(anchor).length - 1, anchor).toBe(1);
  writeFileSync(path, text.replace(anchor, replacement));
  writeRehashedManifest(copy);
  return copy;
};

/** Every chain link (x_1 … x_8 = round seeds), the seed and the salts of the vector chain. */
const SECRETS: string[] = [
  ...FAIRNESS_DEV_VECTORS_V1.linksHex.slice(1),
  FAIRNESS_DEV_VECTORS_V1.seedHex,
  FAIRNESS_DEV_VECTORS_V1.saltAHex,
  FAIRNESS_DEV_VECTORS_V1.saltBHex,
];
/** True if `bytes` contains a secret as hex (either case), base64 (both alphabets) or raw. */
const leaks = (bytes: Buffer): string[] => {
  const text = bytes.toString("latin1");
  const found: string[] = [];
  for (const hex of SECRETS) {
    const raw = Buffer.from(hex, "hex");
    const forms = [
      hex,
      hex.toUpperCase(),
      raw.toString("base64").slice(0, 40),
      raw.toString("base64url").slice(0, 40),
    ];
    if (forms.some((f) => text.includes(f)) || bytes.includes(raw)) found.push(hex.slice(0, 8));
  }
  return found;
};
/** The Authority's reply frames, decoded from the captured bytes (all must be valid frames). */
const framesOf = (base64: string): Report[] => {
  const decoder = new FrameDecoder(MAX_REPLY_BYTES);
  return decoder
    .push(Buffer.from(base64, "base64"))
    .map((b) => JSON.parse(Buffer.from(b).toString("utf8")));
};
/** Every 64-hex string in a value tree, with the key it sits under. */
const hexValues = (v: unknown, key = "", out: [string, string][] = []): [string, string][] => {
  if (typeof v === "string" && /^[0-9a-f]{64}$/i.test(v)) out.push([key, v]);
  else if (Array.isArray(v)) for (const x of v) hexValues(x, key, out);
  else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) hexValues(x, k, out);
  }
  return out;
};
const outcomesOf = (events: Report[]) =>
  events
    .filter((e) => e.type === "round.crashed" || e.type === "round.impact")
    .map((e) => ({ round: e.round, crashAt: e.crashAt ?? null, jackpot: e.jackpot ?? null }));
const vectorOutcomes = (salt: string) =>
  VECTORS.filter((v: Report) => v.set === "dev-v1" && v.salt === salt).map((v: Report) => ({
    round: v.index,
    crashAt: v.outcome === "crash" ? v.crashAt : null,
    jackpot: v.outcome === "crash" ? null : v.jackpot,
  }));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "aquadive-stage1-authority-"));
  dist = buildServer(tmp);
}, 300_000);

afterAll(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("deterministic replay through the isolated Authority (vectors A / B unchanged)", () => {
  it.each(["A", "B"])(
    "salt %s: pinned digest, = the in-process scheduler's events, = independent outcomes",
    (salt) => {
      const r = probe(dist, "replay", salt);
      const inProcess = run(SCHEDULER_PROBE, dist, ["run", salt, "every"]);
      expect(r.authorityDigest).toBe(PINNED_DIGEST[salt]);
      expect(r.relayDigest).toBe(PINNED_DIGEST[salt]); // recomputed by the application side
      expect(inProcess.digest).toBe(PINNED_DIGEST[salt]);
      expect(r.events).toEqual(inProcess.events);
      expect(outcomesOf(r.events)).toEqual(vectorOutcomes(salt));
      expect(r.started.chain).toEqual(inProcess.chain);
      expect(r.snapshot.halted).toEqual(inProcess.snapshot.halted);
      for (const e of r.events.filter((x: Report) => x.type === "round.betting")) {
        expect(e.roundId).toBe(ref.roundId(r.started.chain.chainId, e.round, e.round));
      }
      expect(r.exit).toEqual({ code: 0, signal: null });
      expect(r.state).toBe("closed");
      expect(r.spawned).toBe(1);
      // The application process loaded only the launcher and the protocol of the build.
      expect(r.loaded.sort()).toEqual([
        "server/src/authority/launcher.js",
        "server/src/authority/protocol.js",
      ]);
      expect(r.texts).toEqual(['{"relay":"AuthorityRelay","state":"ready"}', "[object Object]"]);
    },
  );

  it("secrecy: every byte received is a valid frame; no seed, link or salt; only public ids", () => {
    const r = probe(dist, "replay", "A");
    const bytes = Buffer.from(r.captured, "base64");
    expect(bytes.length).toBeGreaterThan(1000);
    expect(leaks(bytes)).toEqual([]);
    const frames = framesOf(r.captured);
    expect(frames[0]).toEqual({ v: 1, type: "ready" });
    expect(new Set(frames.map((f) => f.type))).toEqual(new Set(["ready", "result"]));
    const roundIds = new Set(
      r.events.filter((e: Report) => e.roundId).map((e: Report) => e.roundId as string),
    );
    for (const [key, value] of hexValues(frames)) {
      if (key === "roundId") expect(roundIds.has(value)).toBe(true);
      else if (key === "chainId") expect(value).toBe(FAIRNESS_DEV_VECTORS_V1.linksHex[0]);
      else expect(key).toBe("digest"); // the public event-log digest
    }
    // Only tick-public data: no event is ahead of the tick its reply was sent at.
    for (const f of frames.filter((x) => x.result?.events)) {
      for (const e of f.result.events) expect(e.tick).toBeLessThanOrEqual(f.result.tick);
    }
    for (const b of r.batches) expect(b.maxTick).toBeLessThanOrEqual(b.tick);
    // Snapshots carry the current tick's multiplier only (never a future sample or end tick
    // while diving): the scheduler's own public snapshot, unchanged by the Authority.
    for (const f of frames.filter((x) => x.result?.snapshot?.round?.phase === "diving")) {
      expect(f.result.snapshot.round.phaseEndsAtTick).toBeNull();
      expect(f.result.snapshot.round.crashAt).toBeNull();
    }
  });
});

describe("mutations of the application process cannot forge or read Authority secrets", () => {
  it("EventEmitter.prototype.emit, Promise.prototype.then, JSON.parse patched after launch", () => {
    const r = probe(dist, "mutate");
    // The same patch played a chosen 77.77x in-process (R-1b residual, server README §18).
    expect(r.seen.emits).toBeGreaterThan(10);
    expect(r.seen.thens).toBeGreaterThan(10);
    expect(r.seen.parses).toBeGreaterThan(10);
    expect(r.seen).toMatchObject({ prepared: 0, scripts: 0, replaced: 0 });
    expect(leaks(Buffer.from(r.observed, "base64"))).toEqual([]);
    expect(leaks(Buffer.from(r.captured, "base64"))).toEqual([]);
    expect(r.authorityDigest).toBe(PINNED_DIGEST.A); // read with the built-ins restored
    expect(r.relayDigest).toBe(PINNED_DIGEST.A);
    expect(outcomesOf(r.events)).toEqual(vectorOutcomes("A"));
    expect(JSON.stringify(r.events)).not.toContain("77.77");
    expect(r.halted).toMatchObject({ reason: "chain-exhausted" });
  });

  it("inspector: none of the Authority is visible here; refused from outside and inside", () => {
    const r = probe(dist, "inspector");
    expect(r.workers).toEqual([]); // the preparation worker is not a thread of this process
    expect(r.globals).toBe("[]");
    // process._debugProcess: refused (Windows) or a no-op SIGUSR1 (--disable-sigusr1); either
    // way no inspector of the Authority opens.
    expect(r.portAfter.listening && r.portAfter.mentionsAuthority).toBe(false);
    expect(r.aliveAfter).toBe(true);
    expect(r.stateAfter).toBe("ready");
    expect(r.inside).toEqual({
      inspector: "ERR_ACCESS_DENIED",
      child: "ERR_ACCESS_DENIED",
      write: "ERR_ACCESS_DENIED",
      evaluate: "EvalError",
    });
    expect(r.authorityDigest).toBe(PINNED_DIGEST.A);
    expect(r.relayDigest).toBe(PINNED_DIGEST.A);
    expect(r.exit).toEqual({ code: 0, signal: null });
  });

  it("NODE_OPTIONS --require, NODE_PATH, NODE_DEBUG set before launch never reach it", () => {
    const marker = join(tmp, "node-options-marker");
    const r = probe(dist, "node-options", marker);
    expect(r.markerRan).toBe(false);
    expect(r.authorityDigest).toBe(PINNED_DIGEST.A);
    expect(r.exit).toEqual({ code: 0, signal: null });
  });

  it("a launch without the fixed hardening is refused before anything starts", () => {
    // The marker sits inside the readable package root: injected code then runs before the
    // entry (a same-user launch limit, server README §19) — and the Authority still refuses.
    const marker = join(tmp, "direct-marker");
    const r = probe(dist, "direct", marker);
    for (const k of [
      "noFlags",
      "noPermission",
      "inspect",
      "nodeDebug",
      "production",
      "widerRead",
    ]) {
      expect(r[k], k).toEqual({ code: 64, bytes: 0 });
    }
    for (const k of ["require", "nodeOptions"]) {
      // Refused either by the self-check (64) or because the permission model stopped the
      // injected module's file write first (1): never `ready`, never a byte.
      expect([1, 64], k).toContain(r[k].code);
      expect(r[k].bytes, k).toBe(0);
    }
    expect(r.hardened).toEqual({ ready: "ready", code: null });
  });
});

describe("IPC validation: malformed frames, invalid and unauthorized commands", () => {
  it("every malformed frame is fatal: fatal frame, exit 67, nothing else", () => {
    const r = probe(dist, "malformed");
    const expected: Record<string, string> = {
      "zero-length": "frame-empty",
      "over-bound": "frame-too-large",
      "max-u32": "frame-too-large",
    };
    expect(Object.keys(r.results)).toHaveLength(17);
    for (const [name, x] of Object.entries<Report>(r.results)) {
      expect(x.reply, name).toEqual({
        v: 1,
        type: "fatal",
        code: expected[name] ?? "frame-invalid",
      });
      expect(x.code, name).toBe(67);
    }
    expect(r.results.running).toMatchObject({ started: "result", alive: false });
  });

  it("invalid, unauthorized and duplicate commands are rejected without effect; bounded", () => {
    const r = probe(dist, "commands");
    const codes = r.replies.map((f: Report) =>
      f.type === "rejected" ? `${f.re}:${f.code}${f.reason ? `:${f.reason}` : ""}` : f.type,
    );
    expect(codes).toEqual([
      "ready",
      "1:not-started",
      "2:unknown-op", // reveal
      "3:unknown-op", // deliver (a script)
      "4:invalid-arguments", // a caller-chosen salt
      "5:refused:replay-test-vectors-only",
      "5:id-not-increasing", // duplicate id
      "result", // the legitimate start
      "7:already-started",
      "8:invalid-cursor",
      "fatal",
    ]);
    // The rejections changed nothing: the chain plays exactly the pinned vectors.
    expect(r.digest).toBe(PINNED_DIGEST.A);
    expect(outcomesOf(r.events)).toEqual(vectorOutcomes("A"));
    expect(r.fatalFrame).toEqual({ v: 1, type: "fatal", code: "too-many-rejections" });
    expect(r.code).toBe(68);
  });

  it("more commands queued than allowed is fatal (exit 68)", () => {
    const r = probe(dist, "overflow");
    expect(r.replies).toEqual([{ v: 1, type: "fatal", code: "queue-overflow" }]);
    expect(r.code).toBe(68);
  });
});

describe("fail closed on process loss or IPC failure; never restarted", () => {
  it("the Authority is killed: pending and later calls rejected, no relaunch", () => {
    const r = probe(dist, "kill");
    expect(r.started.state).toBe("running");
    expect(r.pending.error).toMatchObject({ code: "authority-lost" });
    expect(r.state).toBe("lost");
    expect(r.alive).toBe(false);
    for (const k of ["after", "stopAfter"])
      expect(r[k].error, k).toMatchObject({ code: "authority-lost" });
    expect(r.relaunch.error).toMatchObject({ code: "duplicate-instance" });
    expect(r.spawned).toBe(1);
    expect(r.spawnedLater).toBe(1);
  });

  it("the command pipe closes (parent disconnect): the Authority exits 66", () => {
    const r = probe(dist, "close-pipe");
    expect(r).toMatchObject({ started: "result", code: 66, alive: false });
  });

  it("the application process is killed: its Authority exits on its own", async () => {
    const parent = spawn(process.execPath, [PROBE, dist, "parent"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pid = await new Promise<number>((resolve, reject) => {
      let text = "";
      parent.stdout!.on("data", (d) => {
        text += d;
        const line = text.split("\n")[0]!;
        if (text.includes("\n")) resolve(JSON.parse(line).pid);
      });
      parent.once("exit", () => reject(new Error(`parent exited: ${text}`)));
    });
    expect(alive(pid)).toBe(true);
    parent.kill("SIGKILL");
    const t0 = Date.now();
    while (alive(pid) && Date.now() - t0 < 15_000) await new Promise((r) => setTimeout(r, 50));
    expect(alive(pid)).toBe(false);
  }, 60_000);

  it("events dropped before the relay read them: sequence gap, Authority killed", () => {
    const r = probe(dist, "gap", "unavailable");
    expect(r.result.error).toMatchObject({ code: "sequence-gap", reason: "events-unavailable" });
    expect(r.state).toBe("failed");
    expect(r.cursor).toBe(0);
    expect(r.exit.code).not.toBe(0);
    expect(r.later.error).toMatchObject({ code: "sequence-gap" });
  });

  it.each([
    [
      "skip",
      "const batch = retained.slice(0, n);",
      "const batch = retained.slice(0, n).filter((e) => e.seq !== 5);",
      "out-of-sequence",
    ],
    [
      "tamper",
      "const batch = retained.slice(0, n);",
      'const batch = retained.slice(0, n).map((e) => e.type === "round.crashed" ? { ...e, crashAt: 77.77 } : e);',
      "digest-mismatch",
    ],
  ])("(patched host) %s: the relay fails closed (%s)", (name, anchor, replacement, reason) => {
    const copy = patched(`gap-${name}`, "server/src/authority/host.js", anchor, replacement);
    const r = probe(copy, "gap", name);
    expect(r.result.error).toMatchObject({ code: "sequence-gap", reason });
    expect(r.state).toBe("failed");
    expect(r.exit.code).not.toBe(0);
  });
});

describe("the real monotonic clock (development random chain)", () => {
  it("round 1 opens at tick 240 and dives at 540; an owner stop halts it, interrupted", () => {
    const r = probe(dist, "monotonic");
    const log = r.events.map((e: Report) => `${e.tick}:${e.type}`);
    expect(log.slice(0, 5)).toEqual([
      "0:scheduler.started",
      "240:round.admitted",
      "240:round.betting",
      "480:round.admitted",
      "540:round.dive",
    ]);
    // The owner stop arrives in real time, a few ticks into the dive (round 1's own events, a
    // boost or its crash, may come first); the halt is the last event.
    const halt = r.events.at(-1);
    expect(halt).toMatchObject({ type: "scheduler.halted", reason: "owner-stopped" });
    expect(halt.tick).toBeGreaterThanOrEqual(540);
    for (const e of r.events.slice(5, -1))
      expect(["round.boost", "round.crashed"]).toContain(e.type);
    for (let i = 1; i < r.ticks.length; i++) {
      expect(r.ticks[i].tick).toBeGreaterThanOrEqual(r.ticks[i - 1].tick);
    }
    // ≈ 9 s of real time for 540 ticks (60 Hz): the Authority's own clock, not the caller's.
    expect(r.ticks.at(-1).ms).toBeGreaterThan(8_000);
    expect(r.stopped).toBe("halted");
    expect(r.snapshot.halted).toEqual({
      reason: "owner-stopped",
      tick: halt.tick,
      interruptedRound: 1,
    });
    expect(r.digest).toBe(r.relayDigest);
    expect(r.exit).toEqual({ code: 0, signal: null });
  }, 60_000);
});

describe("integrity (src/authority is protected: owner-approved Stage 1 expansion)", () => {
  it("the trusted manifest names the four Authority files; a clean build starts", () => {
    const m = JSON.parse(readFileSync(TRUSTED_MANIFEST, "utf8"));
    expect(m.files).toHaveLength(44);
    expect(
      m.files
        .map((f: Report) => f.path)
        .filter((p: string) => p.startsWith("server/src/authority/")),
    ).toEqual(AUTHORITY_FILES);
    expect(probe(dist, "integrity")).toMatchObject({ first: { v: 1, type: "ready" } });
    expect(tool.verifyAgainstTrusted(dist)).toEqual([]);
  });

  it.each(AUTHORITY_FILES)("one changed byte of %s: no ready, exit 65; CLI refuses", (file) => {
    const copy = copyOf(`flip-${file.split("/").pop()}`);
    const path = join(copy, ...file.split("/"));
    const bytes = readFileSync(path);
    // One letter of the header comment ("Stage 1"): the module still loads, only integrity refuses.
    const at = bytes.indexOf("Stage 1");
    expect(at).toBeGreaterThan(0);
    bytes[at] = bytes[at]! ^ 0x20;
    writeFileSync(path, bytes);
    expect(probe(copy, "integrity")).toMatchObject({ first: null, code: 65 });
    const cli = spawnSync(
      process.execPath,
      [join(SERVER, "scripts", "engine-integrity.mjs"), "verify", copy],
      { encoding: "utf8", timeout: 60_000 },
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain(`changed: ${file}`);
  });

  it("an extra file in the Authority directory is refused", () => {
    const copy = copyOf("extra-authority");
    writeFileSync(join(copy, "server", "src", "authority", "extra.js"), '"use strict";\n');
    expect(probe(copy, "integrity")).toMatchObject({ first: null, code: 65 });
  });

  it("the compiled application startup loads no Authority module", () => {
    const r = run(PROBE, dist, ["startup"], {
      ...process.env,
      NODE_PATH: join(SERVER, "node_modules"),
    });
    expect(r.loaded).toBeGreaterThan(5);
    expect(r.authority).toEqual([]);
  });
});
