// Compiled-runtime probe of the offline Isolated Authority Host (Stage 1). TEST ONLY; run by
// authority.test.ts in a fresh Node process. This process plays the UNTRUSTED application
// process: it loads only the build's launcher and protocol modules (never the scheduler), and
// the Authority runs as its child.
//
//   node authority-probe.cjs <server build dir> <scenario> [arg …]
//
// Prints one JSON report on stdout (the `parent` scenario prints one line first, see below).
//
//   replay <A|B>            the public vector chain through the relay (replay clock); every byte
//                           received from the Authority is captured (base64) for the secret scan
//   mutate                  after launch: EventEmitter.prototype.emit, Promise.prototype.then and
//                           JSON.parse patched to observe and replace any worker / script value
//                           (the R-1b residual's attack); then restored and verified
//   inspector               this process's inspector (no Authority worker visible), the
//                           Authority's inspector from outside (process._debugProcess), and the
//                           hardened flags' refusal of node:inspector inside
//   node-options <marker>   NODE_OPTIONS --require / NODE_PATH / NODE_DEBUG set before launch
//   direct <marker>         the entry launched WITHOUT the fixed hardening (each refused)
//   malformed               one raw Authority per malformed frame (fatal, exit 67)
//   commands                invalid, unauthorized and duplicate commands on one raw Authority
//   overflow                more queued commands than allowed (fatal, exit 68)
//   kill                    the Authority is killed (idle and with a request pending)
//   close-pipe              the command pipe is closed (parent disconnect without exit)
//   parent                  launches, starts a real-clock chain, prints {"pid":…} and waits
//   gap <variant>           unavailable (dropped events) | (patched builds) skip | tamper
//   monotonic               the real monotonic clock: round 1 opens and dives; owner stop
//   integrity               start against a tampered build (exit 65, no ready)
//   startup                 the compiled application loads no authority module
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const childProcess = require("node:child_process");

const out = path.resolve(process.argv[2]);
const scenario = process.argv[3];
const arg = process.argv[4];

const counters = { unhandled: 0 };
process.on("unhandledRejection", () => {
  counters.unhandled += 1;
});

// Every byte the Authority sends to this process (tee on its reply pipe; nothing is changed).
const captured = [];
const spawned = [];
const realSpawn = childProcess.spawn;
childProcess.spawn = function teeSpawn(...args) {
  const child = realSpawn.apply(this, args);
  spawned.push(child.pid);
  if (child.stdio && child.stdio[4])
    child.stdio[4].on("data", (d) => captured.push(Buffer.from(d)));
  return child;
};

const load = (rel) => require(path.join(out, rel));
/** Loaded on first use (the `startup` scenario must load nothing of the Authority first). */
const protocolOf = () => load("server/src/authority/protocol.js");
const emit = (report) => {
  report.counters = counters;
  report.spawned = spawned.length;
  process.stdout.write(JSON.stringify(report));
};
const errorOf = (e) => ({ name: e && e.name, code: e && e.code, reason: e && e.reason });
const settle = (p) =>
  p.then(
    (value) => ({ ok: true, value }),
    (e) => ({ ok: false, error: errorOf(e) }),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const replayOptions = (salt, eventCapacity = 4096) => ({
  mode: "test",
  chain: "public-test-vectors",
  clock: "replay",
  chainLength: null,
  vectorSalt: salt,
  eventCapacity,
});

/** Reads every event until the Authority's scheduler has halted and the cursor caught up. */
const drain = async (relay, limitMs = 120_000) => {
  const t0 = Date.now();
  const events = [];
  const batches = [];
  for (;;) {
    const b = await relay.events();
    events.push(...b.events);
    batches.push({
      tick: b.tick,
      n: b.events.length,
      maxTick: Math.max(-1, ...b.events.map((e) => e.tick)),
    });
    const s = await relay.snapshot();
    if (s.snapshot.state === "halted" && relay.cursor === s.snapshot.lastSeq) {
      return { events, batches, snapshot: s.snapshot, authorityDigest: s.digest };
    }
    if (Date.now() - t0 > limitMs) throw new Error("no halt");
    await sleep(5);
  }
};

/** A raw Authority on the fixed launch: frames are sent unchecked (hostile-parent position). */
const rawAuthority = () => {
  const { authorityLaunch } = load("server/src/authority/launcher.js");
  const spec = authorityLaunch();
  const child = childProcess.spawn(spec.command, [...spec.args], {
    cwd: spec.cwd,
    env: { ...spec.env },
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const protocol = protocolOf();
  const decoder = new protocol.FrameDecoder(protocol.MAX_REPLY_BYTES);
  const frames = [];
  let wake = null;
  child.stdio[4].on("data", (d) => {
    for (const body of decoder.push(d)) frames.push(JSON.parse(Buffer.from(body).toString("utf8")));
    if (wake) wake();
  });
  child.stdio[3].on("error", () => {});
  const exited = new Promise((r) => child.once("exit", (code) => r(code)));
  const raw = {
    child,
    frames,
    exited,
    writeRaw: (buf) => child.stdio[3].write(buf),
    body: (text) => {
      const b = Buffer.from(text, "utf8");
      const h = Buffer.alloc(4);
      h.writeUInt32BE(b.length);
      child.stdio[3].write(Buffer.concat([h, b]));
    },
    send: (o) => raw.body(JSON.stringify(o)),
    /** The next frame (or null after `ms`). */
    next: async (ms = 30_000) => {
      const t0 = Date.now();
      while (frames.length === 0) {
        if (Date.now() - t0 > ms) return null;
        await new Promise((r) => {
          wake = r;
          setTimeout(r, 50);
        });
        wake = null;
      }
      return frames.shift();
    },
  };
  return raw;
};
const START = (id, extra = {}) => ({
  v: 1,
  id,
  op: "start",
  mode: "test",
  chain: "public-test-vectors",
  clock: "replay",
  chainLength: null,
  vectorSalt: "A",
  eventCapacity: 4096,
  ...extra,
});

/** Raw: reads all events after halt; returns the events and the Authority's digest. */
const rawDrain = async (raw, firstId) => {
  let id = firstId;
  const events = [];
  for (;;) {
    raw.send({ v: 1, id: id++, op: "snapshot" });
    const s = await raw.next();
    if (s.type !== "result") return { error: s, events };
    raw.send({ v: 1, id: id++, op: "events", after: events.length, limit: 256 });
    const e = await raw.next();
    if (e.type !== "result") return { error: e, events };
    events.push(...e.result.events);
    if (s.result.snapshot.state === "halted" && events.length === s.result.snapshot.lastSeq) {
      return { events, digest: s.result.digest, nextId: id };
    }
    await sleep(10);
  }
};

const main = async () => {
  if (scenario === "startup") {
    load("server/src/app.js");
    const loaded = Object.keys(require.cache)
      .filter((f) => f.startsWith(out + path.sep))
      .map((f) => path.relative(out, f).split(path.sep).join("/"));
    return emit({
      loaded: loaded.length,
      authority: loaded.filter((f) => f.includes("authority/")),
    });
  }

  const { AuthorityRelay } = load("server/src/authority/launcher.js");

  if (scenario === "replay") {
    const relay = await AuthorityRelay.launch();
    const started = await relay.start(replayOptions(arg));
    const r = await drain(relay);
    const texts = [JSON.stringify(relay), String(relay)];
    await relay.shutdown();
    // The parent's view of its loaded modules: no scheduler, source, worker or round code.
    const loaded = Object.keys(require.cache)
      .filter((f) => f.startsWith(out + path.sep))
      .map((f) => path.relative(out, f).split(path.sep).join("/"));
    return emit({
      started,
      ...r,
      relayDigest: relay.digest,
      state: relay.state,
      exit: relay.exit,
      texts,
      loaded,
      captured: Buffer.concat(captured).toString("base64"),
    });
  }

  if (scenario === "mutate") {
    const relay = await AuthorityRelay.launch();
    // The R-1b residual's attack, now from the untrusted process: shared built-ins rewritten
    // AFTER everything loaded, to observe and replace any worker message, script or outcome.
    const EventEmitter = require("node:events");
    const seen = { emits: 0, prepared: 0, scripts: 0, replaced: 0, thens: 0, parses: 0, texts: [] };
    const looksSecret = (v) =>
      v !== null &&
      typeof v === "object" &&
      (v.type === "prepared" ||
        "bytes" in v ||
        "script" in v ||
        "secretContent" in v ||
        "sealed" in v);
    const forged = Object.freeze({ type: "prepared", crashAt: 77.77 });
    const orig = {
      emit: EventEmitter.prototype.emit,
      then: Promise.prototype.then,
      parse: JSON.parse,
    };
    EventEmitter.prototype.emit = function patchedEmit(name, ...args) {
      seen.emits += 1;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (Buffer.isBuffer(a)) seen.texts.push(a.toString("latin1"));
        if (looksSecret(a)) {
          seen.prepared += 1;
          args[i] = forged; // would play 77.77x in-process (R-1b residual)
          seen.replaced += 1;
        }
      }
      return orig.emit.call(this, name, ...args);
    };
    Promise.prototype.then = function patchedThen(onFulfilled, onRejected) {
      seen.thens += 1;
      const wrapped =
        typeof onFulfilled === "function"
          ? (v) => {
              if (looksSecret(v)) {
                seen.scripts += 1;
                seen.replaced += 1;
                return onFulfilled(forged);
              }
              return onFulfilled(v);
            }
          : onFulfilled;
      return orig.then.call(this, wrapped, onRejected);
    };
    JSON.parse = function patchedParse(text, ...rest) {
      seen.parses += 1;
      seen.texts.push(String(text));
      const v = orig.parse.call(this, text, ...rest);
      if (looksSecret(v)) seen.replaced += 1;
      return v;
    };
    let during;
    try {
      await relay.start(replayOptions("A"));
      during = await drain(relay);
    } finally {
      EventEmitter.prototype.emit = orig.emit;
      Promise.prototype.then = orig.then;
      JSON.parse = orig.parse;
    }
    // Verified with the built-ins restored: the Authority's own state.
    const after = await relay.snapshot();
    await relay.shutdown();
    return emit({
      events: during.events,
      authorityDigest: after.digest,
      relayDigest: relay.digest,
      halted: after.snapshot.halted,
      seen: { ...seen, texts: undefined },
      observed: Buffer.from(seen.texts.join("\n"), "latin1").toString("base64"),
      captured: Buffer.concat(captured).toString("base64"),
      exit: relay.exit,
    });
  }

  if (scenario === "inspector") {
    const inspector = require("node:inspector");
    const http = require("node:http");
    const relay = await AuthorityRelay.launch();
    await relay.start(replayOptions("A"));
    const report = {};
    // 1. This process's inspector: its worker threads and globals (the in-process E2 attack).
    const session = new inspector.Session();
    session.connect();
    const post = (method, params = {}) =>
      new Promise((resolve) =>
        session.post(method, params, (err, res) => resolve(err ? { error: err.message } : res)),
      );
    const attached = [];
    session.on("NodeWorker.attachedToWorker", (m) => attached.push(m.params.workerInfo.url));
    await post("NodeWorker.enable", { waitForDebuggerOnStart: false });
    await sleep(300);
    report.workers = attached;
    const g = await post("Runtime.evaluate", {
      expression:
        "JSON.stringify(Object.getOwnPropertyNames(globalThis).filter((k) => /scheduler|authority|prep|round|secret/i.test(k)))",
    });
    report.globals = g.result && g.result.value;
    session.disconnect();
    // 2. The Authority's inspector from outside (same OS user): process._debugProcess.
    const probePort = () =>
      new Promise((resolve) => {
        const req = http.get(
          { host: "127.0.0.1", port: 9229, path: "/json/list", timeout: 1000 },
          (res) => {
            let body = "";
            res.on("data", (d) => (body += d));
            res.on("end", () =>
              resolve({ listening: true, mentionsAuthority: body.includes("authority-main") }),
            );
          },
        );
        req.on("error", (e) => resolve({ listening: false, code: e.code }));
        req.on("timeout", () => {
          req.destroy();
          resolve({ listening: false, code: "timeout" });
        });
      });
    report.portBefore = await probePort();
    try {
      process._debugProcess(relay.pid);
      report.debugProcess = "returned";
    } catch (e) {
      report.debugProcess = e.code || e.message;
    }
    await sleep(1000);
    report.portAfter = await probePort();
    report.aliveAfter = alive(relay.pid);
    report.stateAfter = relay.state;
    // 3. Inside: the hardened flags refuse node:inspector (and child processes, file writes, eval).
    const { authorityLaunch } = load("server/src/authority/launcher.js");
    const spec = authorityLaunch();
    const flags = spec.args.slice(0, -1);
    const inside = childProcess.spawnSync(
      spec.command,
      [
        ...flags,
        "-e",
        'const r={};for(const [k,f] of Object.entries({inspector:()=>require("node:inspector").open(0),child:()=>require("node:child_process").spawnSync(process.execPath,["-v"]),write:()=>require("node:fs").writeFileSync("x.txt","x"),evaluate:()=>new Function("return 1")()})){try{f();r[k]="ALLOWED"}catch(e){r[k]=e.code||e.name}}process.stdout.write(JSON.stringify(r))',
      ],
      { cwd: spec.cwd, env: { ...spec.env }, encoding: "utf8", timeout: 30_000 },
    );
    report.inside = JSON.parse(inside.stdout || "{}");
    const r = await drain(relay);
    report.authorityDigest = r.authorityDigest;
    report.relayDigest = relay.digest;
    await relay.shutdown();
    report.exit = relay.exit;
    return emit(report);
  }

  if (scenario === "node-options") {
    const marker = arg;
    fs.writeFileSync(
      `${marker}.cjs`,
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
    );
    process.env.NODE_OPTIONS = `--require ${JSON.stringify(`${marker}.cjs`)}`;
    process.env.NODE_PATH = path.dirname(marker);
    process.env.NODE_DEBUG = "module";
    process.env.NODE_ENV = "test";
    const relay = await AuthorityRelay.launch();
    await relay.start(replayOptions("A"));
    const r = await drain(relay);
    await relay.shutdown();
    return emit({
      authorityDigest: r.authorityDigest,
      relayDigest: relay.digest,
      markerRan: fs.existsSync(marker),
      exit: relay.exit,
    });
  }

  if (scenario === "direct") {
    // The entry launched by a parent that does NOT use the fixed hardening: each is refused
    // (exit 64) before anything is started. (NODE_OPTIONS code itself runs before any entry.)
    const marker = arg;
    fs.writeFileSync(
      `${marker}.cjs`,
      `require("node:fs").appendFileSync(${JSON.stringify(marker)}, "x");\n`,
    );
    const { authorityLaunch } = load("server/src/authority/launcher.js");
    const spec = authorityLaunch();
    const entry = spec.args.at(-1);
    const flags = spec.args.slice(0, -1);
    const run = (args, env) =>
      new Promise((resolve) => {
        const c = realSpawn(spec.command, args, {
          cwd: spec.cwd,
          env,
          stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        let bytes = 0;
        c.stdio[4].on("data", (d) => (bytes += d.length));
        c.stdio[3].on("error", () => {});
        const timer = setTimeout(() => c.kill(), 20_000);
        c.once("exit", (code) => {
          clearTimeout(timer);
          resolve({ code, bytes });
        });
      });
    const env = { ...spec.env };
    const r = {};
    r.noFlags = await run([entry], env);
    r.noPermission = await run(
      [...flags.filter((f) => f !== "--permission" && !f.startsWith("--allow-")), entry],
      env,
    );
    r.inspect = await run(["--inspect=0", ...flags, entry], env);
    r.require = await run([...flags, "--require", `${marker}.cjs`, entry], env);
    r.nodeOptions = await run([...flags, entry], {
      ...env,
      NODE_OPTIONS: `--require ${JSON.stringify(`${marker}.cjs`)}`,
    });
    r.nodeDebug = await run([...flags, entry], { ...env, NODE_DEBUG: "module" });
    r.production = await run([...flags, entry], { NODE_ENV: "production" });
    r.widerRead = await run([flags[0], `--allow-fs-read=*`, ...flags.slice(2), entry], env);
    r.markerRuns = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").length : 0;
    // The fixed launch itself starts (control).
    r.hardened = await new Promise((resolve) => {
      const raw = rawAuthority();
      raw.next().then(async (f) => {
        raw.child.kill();
        resolve({ ready: f && f.type, code: await raw.exited });
      });
    });
    return emit(r);
  }

  if (scenario === "malformed") {
    const json = (o) => Buffer.from(JSON.stringify(o), "utf8");
    const frame = (b) => {
      const h = Buffer.alloc(4);
      h.writeUInt32BE(b.length);
      return Buffer.concat([h, b]);
    };
    const cases = {
      "zero-length": Buffer.from([0, 0, 0, 0]),
      "over-bound": Buffer.from([0, 0, 0x04, 0x01]), // 1025: refused before any body byte
      "max-u32": Buffer.from([0xff, 0xff, 0xff, 0xff]),
      "invalid-utf8": frame(Buffer.from([0x7b, 0xc3, 0x28, 0x7d])),
      "not-json": frame(Buffer.from("{v:1}", "utf8")),
      array: frame(json([1, 2, 3])),
      whitespace: frame(Buffer.from('{"v": 1,"id":1,"op":"snapshot"}', "utf8")),
      "duplicate-key": frame(Buffer.from('{"v":1,"id":1,"id":2,"op":"snapshot"}', "utf8")),
      "escaped-key": frame(Buffer.from('{"v":1,"\\u0069d":1,"op":"snapshot"}', "utf8")),
      version: frame(json({ v: 2, id: 1, op: "snapshot" })),
      "id-zero": frame(json({ v: 1, id: 0, op: "snapshot" })),
      "id-string": frame(json({ v: 1, id: "1", op: "snapshot" })),
      "id-fraction": frame(json({ v: 1, id: 1.5, op: "snapshot" })),
      "envelope-order": frame(json({ id: 1, v: 1, op: "snapshot" })),
      "no-op": frame(json({ v: 1, id: 1 })),
      "nul-bytes": frame(Buffer.alloc(16)),
    };
    const results = {};
    for (const [name, bytes] of Object.entries(cases)) {
      const raw = rawAuthority();
      const ready = await raw.next();
      raw.writeRaw(bytes);
      const reply = await raw.next(10_000);
      results[name] = { ready: ready && ready.type, reply, code: await raw.exited };
    }
    // During a running chain: the scheduler stops for good, the process exits.
    const raw = rawAuthority();
    await raw.next();
    raw.send(START(1));
    const started = await raw.next();
    raw.writeRaw(Buffer.from([0, 0, 0, 3, 0x7b, 0x7b, 0x7b]));
    const reply = await raw.next(10_000);
    results.running = {
      started: started.type,
      reply,
      code: await raw.exited,
      alive: alive(raw.child.pid),
    };
    return emit({ results });
  }

  if (scenario === "commands") {
    const raw = rawAuthority();
    const replies = [];
    const ask = async (o) => {
      if (Buffer.isBuffer(o)) raw.writeRaw(o);
      else raw.send(o);
      const f = await raw.next();
      replies.push(f);
      return f;
    };
    replies.push(await raw.next()); // ready
    await ask({ v: 1, id: 1, op: "events", after: 0, limit: 10 }); // not-started
    await ask({ v: 1, id: 2, op: "reveal", round: 1 }); // unknown-op
    await ask({ v: 1, id: 3, op: "deliver", script: "00".repeat(64) }); // unknown-op
    await ask({ ...START(4), salt: "ab".repeat(32) }); // invalid-arguments (extra key)
    await ask(START(5, { clock: "replay", chain: "random" })); // refused: replay needs vectors
    await ask(START(5)); // id-not-increasing (duplicate id)
    const started = await ask(START(6));
    await ask(START(7)); // already-started
    await ask({ v: 1, id: 8, op: "events", after: 1_000_000, limit: 10 }); // invalid-cursor
    const drained = await rawDrain(raw, 9);
    // The ninth rejection is fatal.
    const fatalFrame = await ask({ v: 1, id: drained.nextId, op: "inspect" });
    const code = await raw.exited;
    return emit({
      replies,
      started,
      events: drained.events,
      digest: drained.digest,
      fatalFrame,
      code,
    });
  }

  if (scenario === "overflow") {
    const raw = rawAuthority();
    await raw.next();
    const frames = [
      START(1),
      ...Array.from({ length: 9 }, (_, i) => ({ v: 1, id: i + 2, op: "snapshot" })),
    ];
    const bufs = frames.map((o) => {
      const b = Buffer.from(JSON.stringify(o), "utf8");
      const h = Buffer.alloc(4);
      h.writeUInt32BE(b.length);
      return Buffer.concat([h, b]);
    });
    raw.writeRaw(Buffer.concat(bufs)); // one chunk: start is still running when they queue
    const replies = [];
    for (;;) {
      const f = await raw.next(10_000);
      if (f === null) break;
      replies.push(f);
      if (f.type === "fatal") break;
    }
    return emit({ replies, code: await raw.exited });
  }

  if (scenario === "kill") {
    const relay = await AuthorityRelay.launch();
    const started = await relay.start({
      mode: "test",
      chain: "random",
      clock: "monotonic",
      chainLength: 4,
      vectorSalt: null,
      eventCapacity: null,
    });
    const before = await relay.snapshot();
    // A request in flight when the Authority dies: rejected, never answered by anyone else.
    const pending = settle(relay.events());
    process.kill(relay.pid);
    const pendingResult = await pending;
    await relay.exited();
    const r = {
      started,
      before: before.snapshot.state,
      pending: pendingResult,
      state: relay.state,
      exit: relay.exit,
      alive: alive(relay.pid),
      after: await settle(relay.snapshot()),
      stopAfter: await settle(relay.stop()),
      relaunch: await settle(AuthorityRelay.launch()),
    };
    await sleep(1500); // no automatic restart happens later either
    r.spawnedLater = spawned.length;
    return emit(r);
  }

  if (scenario === "close-pipe") {
    const raw = rawAuthority();
    await raw.next();
    raw.send(START(1));
    const started = await raw.next();
    raw.child.stdio[3].end(); // the application disconnects (the process itself stays alive)
    const t0 = Date.now();
    const code = await raw.exited;
    return emit({ started: started.type, code, ms: Date.now() - t0, alive: alive(raw.child.pid) });
  }

  if (scenario === "parent") {
    const relay = await AuthorityRelay.launch();
    await relay.start({
      mode: "test",
      chain: "random",
      clock: "monotonic",
      chainLength: 4,
      vectorSalt: null,
      eventCapacity: null,
    });
    process.stdout.write(`${JSON.stringify({ pid: relay.pid })}\n`);
    setInterval(() => {}, 1000); // waits until killed
    return;
  }

  if (scenario === "gap") {
    const relay = await AuthorityRelay.launch();
    await relay.start(replayOptions("A", arg === "unavailable" ? 16 : 4096));
    if (arg === "unavailable") {
      // The relay does not read while the bounded log (16 events) drops older ones.
      for (;;) {
        await sleep(100);
        const { snapshot } = await relay.snapshot();
        if (snapshot.state === "halted") break;
      }
    }
    const result = await settle(drain(relay));
    await relay.exited();
    return emit({
      result: result.ok ? { ok: true } : result,
      state: relay.state,
      cursor: relay.cursor,
      exit: relay.exit,
      later: await settle(relay.snapshot()),
    });
  }

  if (scenario === "monotonic") {
    const relay = await AuthorityRelay.launch();
    const t0 = Date.now();
    await relay.start({
      mode: "development",
      chain: "random",
      clock: "monotonic",
      chainLength: 3,
      vectorSalt: null,
      eventCapacity: null,
    });
    const events = [];
    const ticks = [];
    while (!events.some((e) => e.type === "round.dive") && Date.now() - t0 < 30_000) {
      await sleep(250);
      const b = await relay.events();
      events.push(...b.events);
      ticks.push({ ms: Date.now() - t0, tick: b.tick });
    }
    const stopped = await relay.stop();
    const b = await relay.events();
    events.push(...b.events);
    const { snapshot, digest } = await relay.snapshot();
    await relay.shutdown();
    return emit({
      events,
      ticks,
      stopped,
      snapshot,
      digest,
      relayDigest: relay.digest,
      exit: relay.exit,
    });
  }

  if (scenario === "integrity") {
    const raw = rawAuthority();
    const first = await raw.next(15_000);
    if (first !== null) raw.child.kill(); // an accepted build: stop it (control case)
    const code = await raw.exited;
    return emit({ first, code });
  }

  throw new Error(`unknown scenario ${scenario}`);
};

main().catch((e) => {
  process.stdout.write(JSON.stringify({ fatal: String((e && e.stack) || e), counters }));
  process.exitCode = 1;
});
