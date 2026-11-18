// Security tests (P8-1; docs/20 §5.3). Tests 2 – 4 (money, multipliers, field values) live in
// money.test.ts, multiplier.test.ts, ids.test.ts and messages.test.ts; this file holds 1 and 5 – 10
// plus the import boundary of docs/20 §5.4 gate 3.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import {
  decodeClientFrame,
  decodeServerFrame,
  encodeClientFrame,
  encodePublicServerFrame,
  encodeServerFrame,
  type ServerMessage,
} from "./codec";
import { ERROR_CODES, isErrorCodeAllowed } from "./errors";
import {
  CLIENT_PAYLOADS,
  IDEMPOTENT_CLIENT_TYPES,
  idempotencyDecision,
  idempotencyFingerprint,
  isIdempotentMessage,
  type ClientMessage,
} from "./messages/client";
import { PUBLIC_SERVER_MESSAGES, type PublicServerMessageInput } from "./messages/server-public";
import { SESSION_SERVER_MESSAGES, type SessionServerMessageInput } from "./messages/server-session";
import { PublicSnapshotSchema } from "./snapshot";
import { fuzzInputs } from "./test/fuzz";
import { GOLDEN_V1 } from "./test/golden-v1";

const ID = "0193f6a2-8000-7000-a000-000000000001";
const ROUND = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";
const golden = (name: string) => GOLDEN_V1.find((g) => g.name === name)!.frame;

// ---------------------------------------------------------------------------
// Schema walker (test-only zod v3 introspection): every field path of a schema.

interface Def {
  typeName: string;
  [k: string]: unknown;
}

function fieldPaths(schema: ZodTypeAny, prefix = ""): string[] {
  const def = schema._def as Def;
  switch (def.typeName) {
    case "ZodObject": {
      const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
      return Object.entries(shape).flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        return [path, ...fieldPaths(v, path)];
      });
    }
    case "ZodOptional":
    case "ZodNullable":
      return fieldPaths(def.innerType as ZodTypeAny, prefix);
    case "ZodEffects":
      return fieldPaths(def.schema as ZodTypeAny, prefix);
    case "ZodBranded":
      return fieldPaths(def.type as ZodTypeAny, prefix);
    case "ZodArray":
      return fieldPaths(def.type as ZodTypeAny, `${prefix}[]`);
    case "ZodTuple":
      return (def.items as ZodTypeAny[]).flatMap((item) => fieldPaths(item, `${prefix}[]`));
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      const options = (def.options as ZodTypeAny[] | Map<unknown, ZodTypeAny>) ?? [];
      const list = Array.isArray(options) ? options : [...options.values()];
      return [...new Set(list.flatMap((o) => fieldPaths(o, prefix)))];
    }
    default:
      return [];
  }
}

const leafNames = (paths: string[]) => paths.map((p) => p.split(".").pop()!.replace(/\[\]$/, ""));

// ---------------------------------------------------------------------------

// A client accepts error codes newer than its registry, and their `retryable` flag as sent
// (P1-D12); a server encoder emits only registered codes with registered flags. Those two
// encode refusals are the intended asymmetry, not a decoder defect.
const TOLERATED_ON_DECODE_ONLY = /^p\.(code|retryable):/;

describe("1 — the codec never throws (10^5 seeded hostile inputs per direction)", () => {
  it.each([
    ["client decoder", decodeClientFrame, 0x5eed0001],
    ["server decoder", decodeServerFrame, 0x5eed0002],
  ] as const)(
    "%s",
    (_name, decode, seed) => {
      let accepted = 0;
      let index = 0;
      const problems: string[] = [];
      for (const input of fuzzInputs(seed, 100_000)) {
        let result: ReturnType<typeof decode>;
        try {
          result = decode(input);
        } catch (error) {
          throw new Error(`decoder threw on input ${index} of seed ${seed}: ${String(error)}`);
        }
        if (result.ok) {
          accepted++;
          // Whatever decodes is valid: it re-encodes.
          const encoded =
            "id" in result.msg
              ? encodeClientFrame(result.msg)
              : encodeServerFrame(result.msg as ServerMessage);
          if (!encoded.ok && !TOLERATED_ON_DECODE_ONLY.test(encoded.detail)) {
            problems.push(`${index}: ${encoded.detail}`);
          }
        } else if (typeof result.code !== "string" || typeof result.detail !== "string") {
          problems.push(`${index}: malformed failure`);
        }
        index++;
      }
      expect(problems).toEqual([]);
      expect(accepted).toBeGreaterThan(0);
    },
    120_000,
  );

  it("the fuzz corpus is deterministic", () => {
    const a = [...fuzzInputs(7, 50)].map(String);
    const b = [...fuzzInputs(7, 50)].map(String);
    expect(a).toEqual(b);
  });
});

describe("5 — direction: server-only types sent by a client are rejected", () => {
  const serverTypes = [
    ...Object.keys(PUBLIC_SERVER_MESSAGES),
    ...Object.keys(SESSION_SERVER_MESSAGES),
  ];

  it.each(serverTypes)("%s", (t) => {
    expect(decodeClientFrame(`{"v":1,"t":"${t}","id":"${ID}","p":{}}`)).toMatchObject({
      ok: false,
      code: "unknown-type",
    });
  });

  it("client types are unknown to a client decoder", () => {
    for (const t of Object.keys(CLIENT_PAYLOADS)) {
      expect(decodeServerFrame(`{"v":1,"t":"${t}","seq":1,"ts":"1","p":{}}`)).toMatchObject({
        ok: false,
        code: "unknown-type",
      });
    }
  });
});

describe("6 — structural: no client schema carries server authority", () => {
  const AUTHORITY = [
    /^multiplier/i,
    /^payout/i,
    /^balance/i,
    /^tick$/,
    /^playerId$/,
    /^betId$/,
    /seed/i,
    /^crash/i,
    /^jackpot/i,
    /^chests$/,
    /^outcome$/,
    /^seq$/,
    /^ts$/,
  ];

  it.each(Object.entries(CLIENT_PAYLOADS))("%s", (_t, schema) => {
    for (const name of leafNames(fieldPaths(schema))) {
      for (const pattern of AUTHORITY) expect(name).not.toMatch(pattern);
    }
  });
});

// Committed field allow-list of every public schema. A change here is a protocol change: it
// must be reviewed for secrecy (docs/09 §12.4) and, after the first release, for compatibility.
const PUBLIC_ALLOW_LIST: Record<string, string[]> = {
  "round.betting": [
    "roundId",
    "roundNumber",
    "commitment",
    "commitment.fv",
    "commitment.chainIndex",
    "commitment.hash",
    "closesAtServerMs",
    "bettingMs",
  ],
  "round.dive": ["roundId", "startServerMs"],
  "round.world": [
    "roundId",
    "fromTick",
    "creatures",
    "creatures[].id",
    "creatures[].kind",
    "creatures[].x",
    "creatures[].worldY",
    "creatures[].size",
    "creatures[].phase",
    "creatures[].dir",
  ],
  "round.sync": ["roundId", "tick", "multiplier", "boost", "worldY"],
  "round.boost": ["roundId", "tick", "creatureId"],
  "round.crashed": ["roundId", "tick", "multiplier"],
  "round.impact": ["roundId", "tick", "jackpotMultiplier"],
  "round.bonus": ["roundId", "pickClosesAtServerMs", "pickWindowMs"],
  "round.chests": ["roundId", "chests"],
  "round.ended": [
    "roundId",
    "outcome",
    "terminalTick",
    "crashMultiplier",
    "reveal",
    "reveal.serverSeed",
    "jackpotMultiplier",
    "chests",
  ],
  "feed.bets": [
    "roundId",
    "entries",
    "entries[].alias",
    "entries[].slot",
    "entries[].amountMinor",
    "entries[].currency",
    "entries[].cashoutMultiplier",
  ],
  "server.notice": ["kind", "retryAfterMs"],
  snapshot: [
    "schema",
    "v",
    "roundId",
    "roundNumber",
    "phase",
    "commitment",
    "commitment.fv",
    "commitment.chainIndex",
    "commitment.hash",
    "betting",
    "betting.closesAtServerMs",
    "dive",
    "dive.startServerMs",
    "dive.tick",
    "dive.multiplier",
    "dive.boost",
    "dive.worldY",
    "world",
    "world.fromTick",
    "world.creatures",
    "world.creatures[].id",
    "world.creatures[].kind",
    "world.creatures[].x",
    "world.creatures[].worldY",
    "world.creatures[].size",
    "world.creatures[].phase",
    "world.creatures[].dir",
    "crash",
    "crash.tick",
    "crash.multiplier",
    "impact",
    "impact.tick",
    "impact.jackpotMultiplier",
    "bonus",
    "bonus.pickClosesAtServerMs",
    "bonus.chests",
    "feed",
    "feed.players",
    "feed.totalStakeMinor",
    "feed.currency",
    "feed.recent",
    "feed.recent[].alias",
    "feed.recent[].slot",
    "feed.recent[].amountMinor",
    "feed.recent[].currency",
    "feed.recent[].cashoutMultiplier",
    "serverTimeMs",
  ],
};

describe("7 — secrecy: public schemas match the committed allow-list", () => {
  const publicSchemas: Record<string, ZodTypeAny> = {
    ...Object.fromEntries(
      Object.entries(PUBLIC_SERVER_MESSAGES).map(([t, spec]) => [t, spec.payload]),
    ),
    snapshot: PublicSnapshotSchema,
  };

  it("lists exactly the public types and the snapshot", () => {
    expect(Object.keys(publicSchemas).sort()).toEqual(Object.keys(PUBLIC_ALLOW_LIST).sort());
  });

  it.each(Object.keys(PUBLIC_ALLOW_LIST))("%s", (name) => {
    expect(fieldPaths(publicSchemas[name]).sort()).toEqual([...PUBLIC_ALLOW_LIST[name]].sort());
  });

  it("no public type before round.ended carries crashAt, terminalTick, a seed, a balance or a player id", () => {
    for (const [name, schema] of Object.entries(publicSchemas)) {
      const names = leafNames(fieldPaths(schema));
      expect(names.some((n) => /crashAt|player(Id)?$|balance|secret|privateState/i.test(n))).toBe(
        false,
      );
      if (name !== "round.ended") {
        expect(names.some((n) => /terminalTick|seed|reveal/i.test(n))).toBe(false);
      }
    }
  });

  it("chest values appear only in round.chests, round.ended and a reveal-phase snapshot", () => {
    for (const [name, schema] of Object.entries(publicSchemas)) {
      const hasChests = leafNames(fieldPaths(schema)).includes("chests");
      expect(hasChests).toBe(["round.chests", "round.ended", "snapshot"].includes(name));
    }
    // round.bonus has no value field at all; the snapshot's chests are phase-guarded (snapshot.test.ts).
    expect(fieldPaths(PUBLIC_SERVER_MESSAGES["round.bonus"].payload)).toEqual([
      "roundId",
      "pickClosesAtServerMs",
      "pickWindowMs",
    ]);
  });

  it("a server cannot encode a hidden value into a public frame", () => {
    const bonus = decodeServerFrame(golden("round.bonus"));
    if (!bonus.ok) throw new Error("golden round.bonus does not decode");
    const leak = { ...bonus.msg, p: { ...bonus.msg.p, chests: ["2.31", "7.04", "1.12"] } };
    expect(encodePublicServerFrame(leak as never)).toMatchObject({
      ok: false,
      detail: "p.chests: field not in schema",
    });
  });
});

describe("8 — prototype keys are rejected and never reach a prototype", () => {
  const frames = [
    `{"v":1,"t":"ping","id":"${ID}","p":{"clientTs":1},"__proto__":{"polluted":true}}`,
    `{"v":1,"t":"ping","id":"${ID}","p":{"clientTs":1,"__proto__":{"polluted":true}}}`,
    `{"v":1,"t":"hello","id":"${ID}","p":{"protocol":{"min":1,"max":1,"__proto__":{"polluted":true}},"client":{"build":"1","platform":"web"}}}`,
    `{"v":1,"t":"ping","id":"${ID}","p":{"clientTs":1,"constructor":{"prototype":{"polluted":true}}}}`,
    `{"v":1,"t":"ping","id":"${ID}","p":{"clientTs":1},"prototype":1}`,
    `{"v":1,"t":"sync.request","id":"${ID}","p":{"lastSeq":1,"x":[{"__proto__":1}]}}`,
  ];

  it.each(frames)("%s", (frame) => {
    expect(decodeClientFrame(frame)).toMatchObject({
      ok: false,
      code: "malformed",
      detail: "forbidden key",
    });
    const server = frame
      .replace(`"id":"${ID}"`, `"seq":1,"ts":"1"`)
      .replace('"t":"ping"', '"t":"round.boost"');
    expect(decodeServerFrame(server)).toMatchObject({ ok: false, code: "malformed" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("decoded objects have the plain object prototype", () => {
    const decoded = decodeClientFrame(golden("hello"));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(Object.getPrototypeOf(decoded.msg)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(decoded.msg.p)).toBe(Object.prototype);
    }
  });

  it("an escaped __proto__ key is still caught (JSON.parse unescapes it)", () => {
    const frame = `{"v":1,"t":"ping","id":"${ID}","p":{"clientTs":1,"\\u005f_proto__":{"polluted":true}}}`;
    expect(decodeClientFrame(frame)).toMatchObject({ ok: false, detail: "forbidden key" });
  });
});

describe("9 — audience: the broadcast path accepts public messages only", () => {
  it("is enforced by the type system (checked by tsc) and at runtime", () => {
    const broadcast = (msg: PublicServerMessageInput) => encodePublicServerFrame(msg);
    const decoded = decodeServerFrame(golden("welcome player"));
    if (!decoded.ok || decoded.msg.t !== "welcome")
      throw new Error("golden welcome does not decode");
    const welcome = decoded.msg;
    // @ts-expect-error — a SessionServerMessage is not a PublicServerMessage.
    expect(broadcast(welcome)).toMatchObject({ ok: false, code: "unknown-type" });
    const balance: SessionServerMessageInput = {
      v: 1,
      t: "wallet.balance",
      seq: 1,
      ts: "1",
      p: { balanceMinor: "0", currency: "AQC", ledgerSeq: "0" },
    };
    // @ts-expect-error — nor is any other session message, e.g. a private balance.
    expect(broadcast(balance)).toMatchObject({ ok: false, code: "unknown-type" });
    const sync = decodeServerFrame(golden("round.sync"));
    if (sync.ok && sync.msg.t === "round.sync") expect(broadcast(sync.msg).ok).toBe(true);
  });
});

describe("10 — idempotency semantics (fixtures for P8-10)", () => {
  it("covers exactly bet.place, bet.cashout and bonus.pick", () => {
    expect([...IDEMPOTENT_CLIENT_TYPES].sort()).toEqual(["bet.cashout", "bet.place", "bonus.pick"]);
  });

  it("registry flags: business rejections are stored and final; pre-processing errors are not stored", () => {
    const stored = Object.entries(ERROR_CODES)
      .filter(([, s]) => s.stored)
      .map(([c]) => c)
      .sort();
    expect(stored).toEqual(
      [
        "already-cashed-out",
        "already-participating",
        "chest-already-picked",
        "commit-timeout",
        "insufficient-funds",
        "invalid-amount",
        "invalid-slot",
        "not-bonus-eligible",
        "not-diving",
        "not-in-betting",
        "not-in-bonus",
        "not-participating",
        "round-exposure-limit",
        "round-mismatch",
        "round-voided",
        "stake-limit",
      ].sort(),
    );
    for (const [code, spec] of Object.entries(ERROR_CODES)) {
      if (spec.stored)
        expect({ code, retryable: spec.retryable }).toEqual({ code, retryable: false });
      expect(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(code)).toBe(true);
    }
    for (const code of [
      "malformed",
      "rate-limited",
      "auth-required",
      "server-busy",
      "protocol-unsupported",
      "idempotency-conflict",
    ]) {
      expect(ERROR_CODES[code as keyof typeof ERROR_CODES].stored).toBe(false);
    }
    expect(Object.keys(ERROR_CODES)).not.toContain("duplicate-request");
    expect(isErrorCodeAllowed("idempotency-conflict", "error")).toBe(true);
    expect(isErrorCodeAllowed("idempotency-conflict", "bet.rejected")).toBe(false);
  });

  const decodeIdempotent = (frame: string) => {
    const d = decodeClientFrame(frame);
    if (!d.ok || !isIdempotentMessage(d.msg as ClientMessage))
      throw new Error("not an idempotent request");
    return d.msg as Parameters<typeof idempotencyFingerprint>[0];
  };

  it("the same canonical payload is the same request, whatever the key order or whitespace", () => {
    const a = decodeIdempotent(golden("bet.place slot 0"));
    const b = decodeIdempotent(
      `{"p":{"currency":"AQC","slot":0,"amountMinor":"500","roundId":"${ROUND}"},"t":"bet.place","v":1,"id":"${a.id}"}`,
    );
    expect(idempotencyFingerprint(b)).toBe(idempotencyFingerprint(a));
    expect(idempotencyDecision(idempotencyFingerprint(a), b)).toBe("replay");
  });

  it("a different payload under the same id is a conflict", () => {
    const a = decodeIdempotent(golden("bet.place slot 0"));
    for (const changed of [
      golden("bet.place slot 0").replace('"slot":0', '"slot":1'),
      golden("bet.place slot 0").replace('"500"', '"501"'),
      golden("bet.place slot 0").replace('"AQC"', '"AQD"'),
    ]) {
      expect(idempotencyDecision(idempotencyFingerprint(a), decodeIdempotent(changed))).toBe(
        "conflict",
      );
    }
    // A different type with an equal payload shape is a different request too.
    const cash = decodeIdempotent(golden("bet.cashout"));
    expect(idempotencyFingerprint(cash)).not.toBe(idempotencyFingerprint(a));
  });

  it("ping, hello and sync.request have no idempotency semantics", () => {
    for (const name of ["ping", "hello", "sync.request"]) {
      const d = decodeClientFrame(golden(name));
      expect(d.ok && isIdempotentMessage(d.msg)).toBe(false);
    }
  });
});

describe("import boundary (docs/20 §5.4 gate 3)", () => {
  const protocolDir = dirname(fileURLToPath(import.meta.url));
  const srcDir = resolve(protocolDir, "..");

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });

  const specifiers = (file: string) =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g,
      ),
    ].map((m) => m[1]);

  it("protocol source imports only zod and itself; tests add vitest and node built-ins", () => {
    for (const file of walk(protocolDir)) {
      const isTest = file.endsWith(".test.ts");
      for (const spec of specifiers(file)) {
        if (spec.startsWith(".")) {
          const target = resolve(dirname(file), spec);
          expect(relative(protocolDir, target).startsWith("..")).toBe(false);
        } else if (isTest) {
          expect(["zod", "vitest", "node:fs", "node:path", "node:url"]).toContain(spec);
        } else {
          expect(spec).toBe("zod");
        }
      }
    }
  });

  it("nothing outside src/protocol imports it yet", () => {
    for (const file of walk(srcDir)) {
      if (file.startsWith(protocolDir + sep)) continue;
      for (const spec of specifiers(file)) {
        expect(spec.startsWith("@/protocol")).toBe(false);
        if (spec.startsWith("."))
          expect(resolve(dirname(file), spec).startsWith(protocolDir)).toBe(false);
      }
    }
  });
});
