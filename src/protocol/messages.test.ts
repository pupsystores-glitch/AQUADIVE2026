// Every message type: accept fixtures and reject fixtures (P8-1; docs/20 §5.4 gate 6).
import { describe, expect, it } from "vitest";
import {
  decodeClientFrame,
  decodeServerFrame,
  encodeClientFrame,
  encodeServerFrame,
} from "./codec";
import { CLIENT_PAYLOADS, type ClientMessageType } from "./messages/client";
import { PUBLIC_SERVER_MESSAGES, type PublicServerMessageType } from "./messages/server-public";
import { SESSION_SERVER_MESSAGES, type SessionServerMessageType } from "./messages/server-session";

const ID = "0193f6a2-8000-7000-a000-000000000001";
const ROUND = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";
const BET = "0193f6a2-7c1e-7b20-9c3d-5e6f70819203";
const SESSION = "6b1f0c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const COMMITMENT = { fv: 1, chainIndex: "9999812", hash: HASH };
const SNAPSHOT = {
  schema: "public-snapshot",
  v: 1,
  roundId: ROUND,
  roundNumber: "18446",
  phase: "betting",
  commitment: COMMITMENT,
  betting: { closesAtServerMs: "1731940005123" },
  feed: { players: 0, totalStakeMinor: "0", currency: "AQC", recent: [] },
  serverTimeMs: "1731940000123",
};
const PLAYER = { currency: "AQC", balanceMinor: "100000", ledgerSeq: "39", pendingRequestIds: [] };
const CREATURE = {
  id: 7,
  kind: "goldfish",
  x: "0.5",
  worldY: "1752.25",
  size: "1.25",
  phase: "0",
  dir: 1,
};

type Payload = Record<string, unknown>;
interface Cases {
  readonly accept: readonly Payload[];
  readonly reject: readonly (readonly [string, Payload])[];
}

const with_ = (base: Payload, patch: Payload): Payload => ({ ...base, ...patch });
const without = (base: Payload, key: string): Payload => {
  const copy = { ...base };
  delete copy[key];
  return copy;
};

const helloBase = {
  protocol: { min: 1, max: 1 },
  client: { build: "2026.11.18", platform: "web" },
};
const placeBase = { roundId: ROUND, slot: 0, amountMinor: "500", currency: "AQC" };
const cashBase = { roundId: ROUND, slot: 1 };
const pickBase = { roundId: ROUND, chestId: 2 };

const CLIENT_CASES = {
  hello: {
    accept: [helloBase, with_(helloBase, { protocol: { min: 1, max: 3 } })],
    reject: [
      ["min > max", with_(helloBase, { protocol: { min: 2, max: 1 } })],
      ["major 0", with_(helloBase, { protocol: { min: 0, max: 1 } })],
      ["capabilities (not in v1)", with_(helloBase, { capabilities: ["x"] })],
      ["build with spaces", with_(helloBase, { client: { build: "a b", platform: "web" } })],
      [
        "extra client field",
        with_(helloBase, { client: { build: "1", platform: "web", ua: "x" } }),
      ],
      ["missing client", without(helloBase, "client")],
    ],
  },
  "auth.resume": {
    accept: [{ ticket: "q7Lk2V9xPz4mN8bR1cT6yW" }],
    reject: [
      ["short ticket", { ticket: "abc" }],
      ["ticket with padding", { ticket: "q7Lk2V9xPz4mN8bR1cT6yW==" }],
      ["ticket number", { ticket: 1 }],
      ["extra field", { ticket: "q7Lk2V9xPz4mN8bR1cT6yW", token: "x" }],
    ],
  },
  "bet.place": {
    accept: [placeBase, with_(placeBase, { slot: 1, amountMinor: "1" })],
    reject: [
      ["slot 2", with_(placeBase, { slot: 2 })],
      ["slot -1", with_(placeBase, { slot: -1 })],
      ["slot 0.5", with_(placeBase, { slot: 0.5 })],
      ["slot string", with_(placeBase, { slot: "0" })],
      ["slot boolean", with_(placeBase, { slot: true })],
      ["zero stake", with_(placeBase, { amountMinor: "0" })],
      ["number stake", with_(placeBase, { amountMinor: 500 })],
      ["float stake", with_(placeBase, { amountMinor: "5.00" })],
      ["lower-case currency", with_(placeBase, { currency: "aqc" })],
      ["missing currency", without(placeBase, "currency")],
      ["client-sent multiplier", with_(placeBase, { multiplier: "2" })],
      ["client-sent playerId", with_(placeBase, { playerId: ROUND })],
      ["bad round id", with_(placeBase, { roundId: "R" })],
    ],
  },
  "bet.cashout": {
    accept: [cashBase],
    reject: [
      ["slot 2", with_(cashBase, { slot: 2 })],
      ["client-sent tick", with_(cashBase, { tick: 912 })],
      ["client-sent multiplier", with_(cashBase, { multiplier: "3.64" })],
      ["missing slot", without(cashBase, "slot")],
    ],
  },
  "bonus.pick": {
    accept: [pickBase, with_(pickBase, { chestId: 0 })],
    reject: [
      ["chest 3", with_(pickBase, { chestId: 3 })],
      ["chest string", with_(pickBase, { chestId: "2" })],
      ["client-sent chests", with_(pickBase, { chests: ["1", "2", "3"] })],
    ],
  },
  "sync.request": {
    accept: [{}, { lastSeq: 0 }, { lastSeq: 1841, roundId: ROUND }],
    reject: [
      ["negative lastSeq", { lastSeq: -1 }],
      ["fractional lastSeq", { lastSeq: 1.5 }],
      ["extra field", { since: 1 }],
    ],
  },
  ping: {
    accept: [{ clientTs: 0 }, { clientTs: 1731940000123 }],
    reject: [
      ["fractional", { clientTs: 1.5 }],
      ["string", { clientTs: "1" }],
      ["unsafe", { clientTs: 2 ** 53 }],
      ["missing", {}],
    ],
  },
} satisfies Record<ClientMessageType, Cases>;

const betAccepted = {
  betId: BET,
  roundId: ROUND,
  slot: 0,
  amountMinor: "500",
  currency: "AQC",
  balanceMinor: "99500",
};
const cashedOut = {
  betId: BET,
  roundId: ROUND,
  slot: 1,
  tick: 912,
  multiplier: "3.6411",
  payoutMinor: "728",
  currency: "AQC",
  balanceMinor: "100028",
};
const settled = {
  betId: BET,
  roundId: ROUND,
  slot: 0,
  finalMultiplier: "159.24",
  payoutMinor: "79620",
  currency: "AQC",
  balanceMinor: "179648",
};
const sync = { roundId: ROUND, tick: 433, multiplier: "1.8461", boost: "0.79", worldY: "1532.25" };
const endedCrash = {
  roundId: ROUND,
  outcome: "crash",
  terminalTick: 913,
  crashMultiplier: "3.64",
  reveal: { serverSeed: HASH },
};

const PUBLIC_CASES = {
  "round.betting": {
    accept: [
      {
        roundId: ROUND,
        roundNumber: "1",
        commitment: COMMITMENT,
        closesAtServerMs: "1",
        bettingMs: 5000,
      },
    ],
    reject: [
      [
        "round number 0",
        {
          roundId: ROUND,
          roundNumber: "0",
          commitment: COMMITMENT,
          closesAtServerMs: "1",
          bettingMs: 5000,
        },
      ],
      [
        "numeric round number",
        {
          roundId: ROUND,
          roundNumber: 1,
          commitment: COMMITMENT,
          closesAtServerMs: "1",
          bettingMs: 5000,
        },
      ],
      [
        "uppercase hash",
        {
          roundId: ROUND,
          roundNumber: "1",
          commitment: { ...COMMITMENT, hash: HASH.toUpperCase() },
          closesAtServerMs: "1",
          bettingMs: 5000,
        },
      ],
      [
        "negative duration",
        {
          roundId: ROUND,
          roundNumber: "1",
          commitment: COMMITMENT,
          closesAtServerMs: "1",
          bettingMs: -1,
        },
      ],
    ],
  },
  "round.dive": {
    accept: [{ roundId: ROUND, startServerMs: "1731940005423" }],
    reject: [["numeric time", { roundId: ROUND, startServerMs: 1731940005423 }]],
  },
  "round.world": {
    accept: [
      { roundId: ROUND, fromTick: 0, creatures: [] },
      { roundId: ROUND, fromTick: 430, creatures: [CREATURE] },
    ],
    reject: [
      [
        "unknown kind",
        { roundId: ROUND, fromTick: 0, creatures: [{ ...CREATURE, kind: "shark" }] },
      ],
      ["x out of range", { roundId: ROUND, fromTick: 0, creatures: [{ ...CREATURE, x: "1.5" }] }],
      ["dir 0", { roundId: ROUND, fromTick: 0, creatures: [{ ...CREATURE, dir: 0 }] }],
      [
        "too many creatures",
        { roundId: ROUND, fromTick: 0, creatures: Array.from({ length: 65 }, () => CREATURE) },
      ],
    ],
  },
  "round.sync": {
    accept: [sync, with_(sync, { boost: "5.551115123125783e-17", multiplier: "1" })],
    reject: [
      ["multiplier below 1", with_(sync, { multiplier: "0.99" })],
      ["non-canonical multiplier", with_(sync, { multiplier: "1.50" })],
      ["boost above 1", with_(sync, { boost: "1.5" })],
      ["numeric worldY", with_(sync, { worldY: 1532.25 })],
      ["negative tick", with_(sync, { tick: -1 })],
    ],
  },
  "round.boost": {
    accept: [{ roundId: ROUND, tick: 430, creatureId: 7 }],
    reject: [["fractional creature id", { roundId: ROUND, tick: 430, creatureId: 7.5 }]],
  },
  "round.crashed": {
    accept: [
      { roundId: ROUND, tick: 913, multiplier: "3.64" },
      { roundId: ROUND, tick: 1, multiplier: "1" },
    ],
    reject: [["exponent multiplier", { roundId: ROUND, tick: 1, multiplier: "1e0" }]],
  },
  "round.impact": {
    accept: [{ roundId: ROUND, tick: 1206, jackpotMultiplier: "142.18" }],
    reject: [["missing jackpot", { roundId: ROUND, tick: 1206 }]],
  },
  "round.bonus": {
    accept: [{ roundId: ROUND, pickClosesAtServerMs: "1731940032000", pickWindowMs: 6000 }],
    reject: [
      ["fractional window", { roundId: ROUND, pickClosesAtServerMs: "1", pickWindowMs: 0.5 }],
    ],
  },
  "round.chests": {
    accept: [{ roundId: ROUND, chests: ["2.31", "7.04", "1.12"] }],
    reject: [
      ["two chests", { roundId: ROUND, chests: ["2.31", "7.04"] }],
      ["four chests", { roundId: ROUND, chests: ["2.31", "7.04", "1.12", "1"] }],
      ["numeric chest", { roundId: ROUND, chests: [2.31, "7.04", "1.12"] }],
    ],
  },
  "round.ended": {
    accept: [
      endedCrash,
      {
        roundId: ROUND,
        outcome: "jackpot",
        terminalTick: 1206,
        jackpotMultiplier: "142.18",
        chests: ["2.31", "7.04", "1.12"],
        reveal: { serverSeed: HASH },
      },
    ],
    reject: [
      ["unknown outcome", with_(endedCrash, { outcome: "void" })],
      ["crash without multiplier", without(endedCrash, "crashMultiplier")],
      ["short seed", with_(endedCrash, { reveal: { serverSeed: "ab" } })],
      [
        "jackpot without chests",
        with_(endedCrash, { outcome: "jackpot", jackpotMultiplier: "142.18" }),
      ],
    ],
  },
  "feed.bets": {
    accept: [
      { roundId: ROUND, entries: [] },
      {
        roundId: ROUND,
        entries: [
          {
            alias: "kelp-7",
            slot: 1,
            amountMinor: "200",
            currency: "AQC",
            cashoutMultiplier: "3.6411",
          },
        ],
      },
    ],
    reject: [
      [
        "alias with spaces",
        { roundId: ROUND, entries: [{ alias: "a b", slot: 0, amountMinor: "1", currency: "AQC" }] },
      ],
      [
        "too many entries",
        {
          roundId: ROUND,
          entries: Array.from({ length: 51 }, () => ({
            alias: "a",
            slot: 0,
            amountMinor: "1",
            currency: "AQC",
          })),
        },
      ],
    ],
  },
  "server.notice": {
    accept: [{ kind: "drain", retryAfterMs: 15000 }, { kind: "maintenance" }],
    reject: [["unknown kind", { kind: "reboot" }]],
  },
} satisfies Record<PublicServerMessageType, Cases>;

const SESSION_CASES = {
  welcome: {
    accept: [
      { protocol: 1, sessionId: SESSION, serverTimeMs: "1", tickHz: 60, snapshot: SNAPSHOT },
      {
        protocol: 1,
        sessionId: SESSION,
        serverTimeMs: "1",
        tickHz: 60,
        snapshot: SNAPSHOT,
        player: PLAYER,
      },
      // No authoritative round to report (P8-2 exception: `snapshot` is optional).
      { protocol: 1, sessionId: SESSION, serverTimeMs: "1", tickHz: 60 },
    ],
    reject: [
      [
        "null snapshot",
        { protocol: 1, sessionId: SESSION, serverTimeMs: "1", tickHz: 60, snapshot: null },
      ],
      [
        "tick rate 0",
        { protocol: 1, sessionId: SESSION, serverTimeMs: "1", tickHz: 0, snapshot: SNAPSHOT },
      ],
    ],
  },
  "auth.ok": {
    accept: [{ player: PLAYER }],
    reject: [["negative balance", { player: { ...PLAYER, balanceMinor: "-1" } }]],
  },
  "sync.snapshot": {
    accept: [{ snapshot: SNAPSHOT }, { snapshot: SNAPSHOT, player: PLAYER }],
    reject: [
      ["snapshot of the wrong schema", { snapshot: { ...SNAPSHOT, schema: "engine-snapshot" } }],
    ],
  },
  pong: {
    accept: [{ clientTs: 1731940000123, serverTimeMs: "1731940000150" }],
    reject: [["numeric server time", { clientTs: 1, serverTimeMs: 1 }]],
  },
  "bet.accepted": {
    accept: [betAccepted],
    reject: [
      ["zero stake", with_(betAccepted, { amountMinor: "0" })],
      ["missing currency", without(betAccepted, "currency")],
    ],
  },
  "bet.rejected": {
    accept: [{ roundId: ROUND, slot: 0, code: "not-in-betting" }],
    reject: [
      ["SCREAMING_CASE code", { roundId: ROUND, slot: 0, code: "NOT_IN_BETTING" }],
      ["empty code", { roundId: ROUND, slot: 0, code: "" }],
    ],
  },
  "bet.cashedOut": {
    accept: [cashedOut],
    reject: [
      ["numeric payout", with_(cashedOut, { payoutMinor: 728 })],
      ["float payout", with_(cashedOut, { payoutMinor: "728.22" })],
      ["exponent multiplier", with_(cashedOut, { multiplier: "3.6411e0" })],
    ],
  },
  "bet.lost": {
    accept: [{ betId: BET, roundId: ROUND, slot: 0 }],
    reject: [["missing bet id", { roundId: ROUND, slot: 0 }]],
  },
  "bet.jackpot": {
    accept: [
      { betId: BET, roundId: ROUND, slot: 0, jackpotMultiplier: "142.18", bonusEligible: true },
    ],
    reject: [
      [
        "not eligible",
        { betId: BET, roundId: ROUND, slot: 0, jackpotMultiplier: "142.18", bonusEligible: false },
      ],
    ],
  },
  "bet.settled": {
    accept: [settled, with_(settled, { payoutMinor: "0" })],
    reject: [["final multiplier below 1", with_(settled, { finalMultiplier: "0.5" })]],
  },
  "bonus.pickAccepted": {
    accept: [{ roundId: ROUND, chestId: 2 }],
    reject: [["chest 3", { roundId: ROUND, chestId: 3 }]],
  },
  "bonus.pickRejected": {
    accept: [{ roundId: ROUND, code: "chest-already-picked" }],
    reject: [["missing code", { roundId: ROUND }]],
  },
  "wallet.balance": {
    accept: [{ balanceMinor: "0", currency: "AQC", ledgerSeq: "0" }],
    reject: [["numeric ledger sequence", { balanceMinor: "0", currency: "AQC", ledgerSeq: 0 }]],
  },
  error: {
    accept: [{ code: "rate-limited", retryable: true }],
    reject: [["retryable not boolean", { code: "rate-limited", retryable: "yes" }]],
  },
} satisfies Record<SessionServerMessageType, Cases>;

const SERVER_CASES: Record<string, Cases> = { ...PUBLIC_CASES, ...SESSION_CASES };
const SERVER_SPECS = { ...PUBLIC_SERVER_MESSAGES, ...SESSION_SERVER_MESSAGES };

const clientFrame = (t: string, p: Payload) => JSON.stringify({ v: 1, t, id: ID, p });
const serverMessage = (t: string, p: Payload) => {
  const re = SERVER_SPECS[t as keyof typeof SERVER_SPECS].re === "required" ? { re: ID } : {};
  return { v: 1, t, seq: 1, ts: "1731940000123", ...re, p };
};

describe("fixture coverage", () => {
  it("covers every client and server message type", () => {
    expect(Object.keys(CLIENT_CASES).sort()).toEqual(Object.keys(CLIENT_PAYLOADS).sort());
    expect(Object.keys(SERVER_CASES).sort()).toEqual(Object.keys(SERVER_SPECS).sort());
    for (const cases of [...Object.values(CLIENT_CASES), ...Object.values(SERVER_CASES)]) {
      expect(cases.accept.length).toBeGreaterThan(0);
      expect(cases.reject.length).toBeGreaterThan(0);
    }
  });
});

describe.each(Object.entries(CLIENT_CASES))("client %s", (t, cases: Cases) => {
  it.each(cases.accept.map((p, i) => [i, p] as const))(
    "accepts fixture %i and re-encodes it",
    (_i, p) => {
      const decoded = decodeClientFrame(clientFrame(t, p));
      expect(decoded).toMatchObject({ ok: true });
      if (decoded.ok) expect(encodeClientFrame(decoded.msg)).toMatchObject({ ok: true });
    },
  );

  it.each(cases.reject)("rejects: %s", (_name, p) => {
    expect(decodeClientFrame(clientFrame(t, p))).toMatchObject({ ok: false, code: "malformed" });
    expect(encodeClientFrame({ v: 1, t, id: ID, p } as never)).toMatchObject({ ok: false });
  });
});

describe.each(Object.entries(SERVER_CASES))("server %s", (t, cases: Cases) => {
  it.each(cases.accept.map((p, i) => [i, p] as const))(
    "accepts fixture %i and round-trips it",
    (_i, p) => {
      const encoded = encodeServerFrame(serverMessage(t, p) as never);
      expect(encoded).toMatchObject({ ok: true });
      if (!encoded.ok) return;
      const decoded = decodeServerFrame(encoded.frame);
      expect(decoded).toMatchObject({ ok: true });
      if (decoded.ok) expect(encodeServerFrame(decoded.msg)).toEqual(encoded);
    },
  );

  it.each(cases.reject)("rejects: %s", (_name, p) => {
    expect(decodeServerFrame(JSON.stringify(serverMessage(t, p)))).toMatchObject({
      ok: false,
      code: "malformed",
    });
    expect(encodeServerFrame(serverMessage(t, p) as never)).toMatchObject({ ok: false });
  });
});
