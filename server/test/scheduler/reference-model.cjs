// TEST ONLY (P8-4b-2): an INDEPENDENT reference model of the offline scheduler's public event log
// and snapshot. It imports nothing of server/src: the timeline durations are the engine's tuning
// values written out here (300 / 84 / 144 / 360 / 132 ticks, zero gap, admission deadline 240),
// the round id and the log digest are recomputed with node:crypto, and the events are built from
// each round's plain outcome facts — never from the scheduler's own code paths.
//
// Facts per round: { outcome, exitDiveTick, crashAt, jackpot, chests, boostTicks }.
"use strict";
const { createHash } = require("node:crypto");

const T = Object.freeze({
  betting: 300,
  impactToBonus: 84,
  crashBanner: 144,
  bonusPick: 360,
  chestResult: 132,
  deadline: 240,
});

const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};
const u64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
};

function roundId(chainId, chainIndex, roundNumber) {
  return sha(
    Buffer.from("AQUADIVE|scheduler|round-id|v1", "utf8"),
    Buffer.from([0]),
    Buffer.from(chainId, "hex"),
    u64(chainIndex),
    u64(roundNumber),
  ).toString("hex");
}

function schedulerSalt(chainId, roundNumber) {
  return sha(
    Buffer.from("AQUADIVE|scheduler|salt|v1", "utf8"),
    Buffer.from([0]),
    Buffer.from(chainId, "hex"),
    u64(roundNumber),
  ).toString("hex");
}

function logDigest(events) {
  let h = sha(Buffer.from("AQUADIVE|scheduler|event-log|v1", "utf8"));
  for (const e of events) h = sha(h, Buffer.from(JSON.stringify(e), "utf8"));
  return h.toString("hex");
}

/** Round-relative end tick. */
const endOf = (f) =>
  f.outcome === "crash"
    ? f.exitDiveTick + T.crashBanner
    : f.exitDiveTick + T.impactToBonus + T.bonusPick + T.chestResult;

/**
 * The event log of a scheduler whose every script arrives in time, over `facts.length` rounds
 * of a chain of `chainLength` links. If `facts.length === chainLength` the log ends with the
 * chain-exhaustion halt; otherwise it stops after the last given round's end (no halt).
 */
function referenceLog(chainId, chainLength, facts) {
  const events = [];
  const push = (tick, type, round, fields) => {
    events.push({ seq: events.length + 1, tick, type, round, ...fields });
  };
  push(0, "scheduler.started", null, { firstOpeningTick: T.deadline });
  let open = T.deadline;
  const opens = [];
  for (let i = 0; i < facts.length; i++) {
    const n = i + 1;
    const f = facts[i];
    const id = roundId(chainId, n, n);
    if (n === 1) push(open, "round.admitted", 1, { roundId: id, chainIndex: 1 });
    opens.push(open);
    push(open, "round.betting", n, { roundId: id, closesAtTick: open + T.betting });
    // Round n + 1's admission (or the exhaustion) at open + 240, inside round n's betting window.
    const admitAt = open + T.deadline;
    if (n < chainLength && n < facts.length) {
      push(admitAt, "round.admitted", n + 1, {
        roundId: roundId(chainId, n + 1, n + 1),
        chainIndex: n + 1,
      });
    } else if (n === chainLength) {
      push(admitAt, "scheduler.halting", null, { reason: "chain-exhausted" });
    }
    push(open + T.betting, "round.dive", n, {});
    const exit = open + f.exitDiveTick;
    for (const b of [...f.boostTicks].sort((a, c) => a - c)) push(open + b, "round.boost", n, {});
    const end = open + endOf(f);
    if (f.outcome === "crash") {
      push(exit, "round.crashed", n, { crashAt: f.crashAt, endsAtTick: end });
    } else {
      push(exit, "round.impact", n, { jackpot: f.jackpot, bonusAtTick: exit + T.impactToBonus });
      const bonus = exit + T.impactToBonus;
      push(bonus, "round.bonus", n, { closesAtTick: bonus + T.bonusPick });
      push(bonus + T.bonusPick, "round.chests", n, { chests: [...f.chests], endsAtTick: end });
    }
    push(end, "round.ended", n, { outcome: f.outcome, reveal: "deferred" });
    if (n === chainLength) {
      push(end, "scheduler.halted", null, { reason: "chain-exhausted", interruptedRound: null });
    }
    open = end;
  }
  // Events of one tick keep their causal order; across ticks the log is sorted by tick (the
  // admission of round n + 1 precedes round n's dive, which the loop above already respects).
  events.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  events.forEach((e, i) => (e.seq = i + 1));
  return { events, opens, end: open, digest: logDigest(events) };
}

/**
 * The public snapshot reduced from the events with tick ≤ `tick` (the core's `snapshot()` after
 * processing `tick`). While diving, `multiplier` is the live sample of that tick: the model
 * marks it "live" (the caller checks it against the script).
 */
function reduceSnapshot(events, tick) {
  let state = "created";
  let round = null;
  let lastRound = 0;
  let halting = null;
  let halted = null;
  let lost = false;
  let lastSeq = 0;
  for (const e of events) {
    if (e.tick > tick) break;
    lastSeq = e.seq;
    switch (e.type) {
      case "scheduler.started":
        state = "running";
        break;
      case "round.betting":
        lastRound = e.round;
        round = {
          number: e.round,
          roundId: e.roundId,
          chainIndex: e.round,
          openedAtTick: e.tick,
          bettingClosesAtTick: e.closesAtTick,
          phase: "betting",
          phaseStartTick: e.tick,
          phaseEndsAtTick: e.closesAtTick,
          multiplier: null,
          crashAt: null,
          jackpot: null,
          chests: null,
          boosts: 0,
          reveal: lost ? "unavailable" : "deferred",
        };
        break;
      case "round.dive":
        Object.assign(round, {
          phase: "diving",
          phaseStartTick: e.tick,
          phaseEndsAtTick: null,
          multiplier: "live",
        });
        break;
      case "round.boost":
        round.boosts += 1;
        break;
      case "round.crashed":
        Object.assign(round, {
          phase: "crashed",
          phaseStartTick: e.tick,
          phaseEndsAtTick: e.endsAtTick,
          multiplier: e.crashAt,
          crashAt: e.crashAt,
        });
        break;
      case "round.impact":
        Object.assign(round, {
          phase: "impact",
          phaseStartTick: e.tick,
          phaseEndsAtTick: e.bonusAtTick,
          multiplier: e.jackpot,
          jackpot: e.jackpot,
        });
        break;
      case "round.bonus":
        Object.assign(round, {
          phase: "bonus",
          phaseStartTick: e.tick,
          phaseEndsAtTick: e.closesAtTick,
        });
        break;
      case "round.chests":
        Object.assign(round, {
          phase: "chests",
          phaseStartTick: e.tick,
          phaseEndsAtTick: e.endsAtTick,
          chests: [...e.chests],
        });
        break;
      case "round.ended":
        round = null;
        break;
      case "source.failed":
        if (e.failure === "lost") {
          lost = true;
          if (round !== null) round.reveal = "unavailable";
        }
        break;
      case "scheduler.halting":
        state = "halting";
        halting = { reason: e.reason, sinceTick: e.tick };
        break;
      case "scheduler.halted":
        state = "halted";
        round = null;
        halted = { reason: e.reason, tick: e.tick, interruptedRound: e.interruptedRound };
        break;
      default:
        break;
    }
  }
  return {
    schema: "aquadive.scheduler.snapshot",
    version: 1,
    state,
    tick,
    lastSeq,
    lastRound,
    round: round === null ? null : { ...round },
    halting,
    halted,
  };
}

module.exports = { T, roundId, schedulerSalt, logDigest, referenceLog, reduceSnapshot, endOf };
