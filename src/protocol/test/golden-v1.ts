// Golden-frame corpus, protocol v1 DRAFT (P8-1; docs/09 §35.2 P1-D12).
//
// Canonical frames, byte for byte: fields in schema order, no whitespace,
// canonical values. `compat.test.ts` requires every frame to decode and to
// re-encode to exactly the same string, and every message type to appear.
//
// While v1 is a draft these frames may change with the schemas. From the
// first network client release on, a frame here may only be added, never
// edited or removed, within major 1 (P1-D12); a breaking change starts a
// `golden-v2.ts`. Values are illustrative (one jackpot round, one player, two
// slots, after docs/09 §8.8); payouts follow ⌊stakeMinor × m̄⌋.

export interface GoldenFrame {
  readonly name: string;
  readonly direction: "client" | "server";
  readonly frame: string;
}

// Identifiers: request ids are UUIDv4/v7, server ids UUIDv7.
const REQ_HELLO = "3f8e2b9a-1c4d-4e5f-8a6b-7c8d9e0f1a2b";
const REQ_AUTH = "3f8e2b9a-1c4d-4e5f-9a6b-7c8d9e0f1a2c";
const REQ_BET0 = "0193f6a2-8000-7000-a000-000000000001";
const REQ_BET1 = "0193f6a2-8000-7000-a000-000000000002";
const REQ_CASH = "0193f6a2-8000-7000-a000-000000000003";
const REQ_PICK = "0193f6a2-8000-7000-a000-000000000004";
const REQ_SYNC = "0193f6a2-8000-7000-a000-000000000005";
const REQ_PING = "0193f6a2-8000-7000-a000-000000000006";
const ROUND = "0193f6a2-7c1e-7a10-8b2c-4d5e6f708192";
const BET0 = "0193f6a2-7c1e-7b20-9c3d-5e6f70819203";
const BET1 = "0193f6a2-7c1e-7c30-ad4e-6f7081920314";
const SESSION = "6b1f0c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SEED = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

const COMMITMENT = `{"fv":1,"chainIndex":"9999812","hash":"${HASH}"}`;
const CREATURE_GOLDFISH = `{"id":7,"kind":"goldfish","x":"0.5","worldY":"1752.25","size":"1.25","phase":"3.141592653589793","dir":1}`;
const CREATURE_KELP = `{"id":8,"kind":"kelp","x":"0.1","worldY":"1801.5","size":"0.8","phase":"0","dir":-1}`;
const FEED_SUMMARY = `{"players":1,"totalStakeMinor":"700","currency":"AQC","recent":[{"alias":"reef_runner","slot":0,"amountMinor":"500","currency":"AQC"}]}`;

const SNAPSHOT_BETTING =
  `{"schema":"public-snapshot","v":1,"roundId":"${ROUND}","roundNumber":"18446","phase":"betting",` +
  `"commitment":${COMMITMENT},"betting":{"closesAtServerMs":"1731940005123"},` +
  `"feed":{"players":0,"totalStakeMinor":"0","currency":"AQC","recent":[]},"serverTimeMs":"1731940000123"}`;

const SNAPSHOT_DIVING =
  `{"schema":"public-snapshot","v":1,"roundId":"${ROUND}","roundNumber":"18446","phase":"diving",` +
  `"commitment":${COMMITMENT},"dive":{"startServerMs":"1731940005423","tick":433,"multiplier":"1.8461",` +
  `"boost":"0.79","worldY":"1532.25"},"world":{"fromTick":433,"creatures":[${CREATURE_GOLDFISH},${CREATURE_KELP}]},` +
  `"feed":${FEED_SUMMARY},"serverTimeMs":"1731940012640"}`;

const SNAPSHOT_REVEAL =
  `{"schema":"public-snapshot","v":1,"roundId":"${ROUND}","roundNumber":"18446","phase":"reveal",` +
  `"commitment":${COMMITMENT},"impact":{"tick":1206,"jackpotMultiplier":"142.18"},` +
  `"bonus":{"pickClosesAtServerMs":"1731940032000","chests":["2.31","7.04","1.12"]},` +
  `"feed":${FEED_SUMMARY},"serverTimeMs":"1731940032100"}`;

const PLAYER_DIVING =
  `{"currency":"AQC","balanceMinor":"100028","ledgerSeq":"41","round":{"roundId":"${ROUND}","bets":[` +
  `{"state":"open","slot":0,"betId":"${BET0}","amountMinor":"500"},` +
  `{"state":"cashedOut","slot":1,"betId":"${BET1}","amountMinor":"200","tick":912,"multiplier":"3.6411","payoutMinor":"728"}` +
  `]},"pendingRequestIds":[]}`;

const PLAYER_BONUS =
  `{"currency":"AQC","balanceMinor":"100028","ledgerSeq":"41","round":{"roundId":"${ROUND}","bets":[` +
  `{"state":"jackpotPending","slot":0,"betId":"${BET0}","amountMinor":"500","jackpotMultiplier":"142.18","bonusEligible":true},` +
  `{"state":"cashedOut","slot":1,"betId":"${BET1}","amountMinor":"200","tick":912,"multiplier":"3.6411","payoutMinor":"728"}` +
  `],"pick":2},"pendingRequestIds":["${REQ_PICK}"]}`;

const PLAYER_IDLE = `{"currency":"AQC","balanceMinor":"100000","ledgerSeq":"39","pendingRequestIds":[]}`;

const client = (name: string, frame: string): GoldenFrame => ({ name, direction: "client", frame });
const server = (name: string, frame: string): GoldenFrame => ({ name, direction: "server", frame });

export const GOLDEN_V1: readonly GoldenFrame[] = [
  // Client → server.
  client(
    "hello",
    `{"v":1,"t":"hello","id":"${REQ_HELLO}","p":{"protocol":{"min":1,"max":1},"client":{"build":"2026.11.18+c11ab64","platform":"web"}}}`,
  ),
  client(
    "auth.resume",
    `{"v":1,"t":"auth.resume","id":"${REQ_AUTH}","p":{"ticket":"q7Lk2V9xPz4mN8bR1cT6yW"}}`,
  ),
  client(
    "bet.place slot 0",
    `{"v":1,"t":"bet.place","id":"${REQ_BET0}","p":{"roundId":"${ROUND}","slot":0,"amountMinor":"500","currency":"AQC"}}`,
  ),
  client(
    "bet.place slot 1",
    `{"v":1,"t":"bet.place","id":"${REQ_BET1}","p":{"roundId":"${ROUND}","slot":1,"amountMinor":"200","currency":"AQC"}}`,
  ),
  client(
    "bet.cashout",
    `{"v":1,"t":"bet.cashout","id":"${REQ_CASH}","p":{"roundId":"${ROUND}","slot":1}}`,
  ),
  client(
    "bonus.pick",
    `{"v":1,"t":"bonus.pick","id":"${REQ_PICK}","p":{"roundId":"${ROUND}","chestId":2}}`,
  ),
  client(
    "sync.request",
    `{"v":1,"t":"sync.request","id":"${REQ_SYNC}","p":{"lastSeq":1841,"roundId":"${ROUND}"}}`,
  ),
  client("sync.request empty", `{"v":1,"t":"sync.request","id":"${REQ_SYNC}","p":{}}`),
  client("ping", `{"v":1,"t":"ping","id":"${REQ_PING}","p":{"clientTs":1731940000123}}`),

  // Server → client, session.
  server(
    "welcome spectator",
    `{"v":1,"t":"welcome","seq":1,"ts":"1731940000123","re":"${REQ_HELLO}","p":{"protocol":1,"sessionId":"${SESSION}","serverTimeMs":"1731940000123","tickHz":60,"snapshot":${SNAPSHOT_BETTING}}}`,
  ),
  server(
    "welcome player",
    `{"v":1,"t":"welcome","seq":1,"ts":"1731940000123","re":"${REQ_HELLO}","p":{"protocol":1,"sessionId":"${SESSION}","serverTimeMs":"1731940000123","tickHz":60,"snapshot":${SNAPSHOT_BETTING},"player":${PLAYER_IDLE}}}`,
  ),
  // Added by the P8-2 exception (2026-11-18): the server has no authoritative
  // round to report, so the welcome carries no snapshot (and, unauthenticated,
  // no player).
  server(
    "welcome without a round",
    `{"v":1,"t":"welcome","seq":1,"ts":"1731940000123","re":"${REQ_HELLO}","p":{"protocol":1,"sessionId":"${SESSION}","serverTimeMs":"1731940000123","tickHz":60}}`,
  ),
  server(
    "auth.ok",
    `{"v":1,"t":"auth.ok","seq":2,"ts":"1731940000180","re":"${REQ_AUTH}","p":{"player":${PLAYER_IDLE}}}`,
  ),
  server(
    "bet.accepted slot 0",
    `{"v":1,"t":"bet.accepted","seq":4,"ts":"1731940001200","re":"${REQ_BET0}","p":{"betId":"${BET0}","roundId":"${ROUND}","slot":0,"amountMinor":"500","currency":"AQC","balanceMinor":"99500"}}`,
  ),
  server(
    "bet.accepted slot 1",
    `{"v":1,"t":"bet.accepted","seq":5,"ts":"1731940001900","re":"${REQ_BET1}","p":{"betId":"${BET1}","roundId":"${ROUND}","slot":1,"amountMinor":"200","currency":"AQC","balanceMinor":"99300"}}`,
  ),
  server(
    "bet.rejected",
    `{"v":1,"t":"bet.rejected","seq":6,"ts":"1731940005500","re":"${REQ_BET0}","p":{"roundId":"${ROUND}","slot":0,"code":"not-in-betting"}}`,
  ),
  server(
    "bet.cashedOut",
    `{"v":1,"t":"bet.cashedOut","seq":90,"ts":"1731940020640","re":"${REQ_CASH}","p":{"betId":"${BET1}","roundId":"${ROUND}","slot":1,"tick":912,"multiplier":"3.6411","payoutMinor":"728","currency":"AQC","balanceMinor":"100028"}}`,
  ),
  server(
    "bet.lost",
    `{"v":1,"t":"bet.lost","seq":91,"ts":"1731940020660","p":{"betId":"${BET0}","roundId":"${ROUND}","slot":0}}`,
  ),
  server(
    "bet.jackpot",
    `{"v":1,"t":"bet.jackpot","seq":120,"ts":"1731940025530","p":{"betId":"${BET0}","roundId":"${ROUND}","slot":0,"jackpotMultiplier":"142.18","bonusEligible":true}}`,
  ),
  server(
    "bonus.pickAccepted",
    `{"v":1,"t":"bonus.pickAccepted","seq":123,"ts":"1731940028000","re":"${REQ_PICK}","p":{"roundId":"${ROUND}","chestId":2}}`,
  ),
  server(
    "bonus.pickRejected",
    `{"v":1,"t":"bonus.pickRejected","seq":124,"ts":"1731940028200","re":"${REQ_PICK}","p":{"roundId":"${ROUND}","code":"chest-already-picked"}}`,
  ),
  server(
    "bet.settled",
    `{"v":1,"t":"bet.settled","seq":126,"ts":"1731940032050","p":{"betId":"${BET0}","roundId":"${ROUND}","slot":0,"finalMultiplier":"159.24","payoutMinor":"79620","currency":"AQC","balanceMinor":"179648"}}`,
  ),
  server(
    "wallet.balance",
    `{"v":1,"t":"wallet.balance","seq":127,"ts":"1731940032060","p":{"balanceMinor":"179648","currency":"AQC","ledgerSeq":"42"}}`,
  ),
  server(
    "sync.snapshot diving",
    `{"v":1,"t":"sync.snapshot","seq":60,"ts":"1731940012640","re":"${REQ_SYNC}","p":{"snapshot":${SNAPSHOT_DIVING},"player":${PLAYER_DIVING}}}`,
  ),
  server(
    "sync.snapshot reveal",
    `{"v":1,"t":"sync.snapshot","seq":125,"ts":"1731940032100","re":"${REQ_SYNC}","p":{"snapshot":${SNAPSHOT_REVEAL},"player":${PLAYER_BONUS}}}`,
  ),
  server(
    "pong",
    `{"v":1,"t":"pong","seq":3,"ts":"1731940000150","re":"${REQ_PING}","p":{"clientTs":1731940000123,"serverTimeMs":"1731940000150"}}`,
  ),
  server(
    "error idempotency-conflict",
    `{"v":1,"t":"error","seq":7,"ts":"1731940001950","re":"${REQ_BET1}","p":{"code":"idempotency-conflict","retryable":false}}`,
  ),
  server(
    "error rate-limited",
    `{"v":1,"t":"error","seq":8,"ts":"1731940002000","p":{"code":"rate-limited","retryable":true}}`,
  ),

  // Server → client, public.
  server(
    "round.betting",
    `{"v":1,"t":"round.betting","seq":2,"ts":"1731940000123","p":{"roundId":"${ROUND}","roundNumber":"18446","commitment":${COMMITMENT},"closesAtServerMs":"1731940005123","bettingMs":5000}}`,
  ),
  server(
    "round.dive",
    `{"v":1,"t":"round.dive","seq":9,"ts":"1731940005423","p":{"roundId":"${ROUND}","startServerMs":"1731940005423"}}`,
  ),
  server(
    "round.world",
    `{"v":1,"t":"round.world","seq":40,"ts":"1731940012600","p":{"roundId":"${ROUND}","fromTick":430,"creatures":[${CREATURE_GOLDFISH},${CREATURE_KELP}]}}`,
  ),
  server(
    "round.sync",
    `{"v":1,"t":"round.sync","seq":61,"ts":"1731940012640","p":{"roundId":"${ROUND}","tick":433,"multiplier":"1.8461","boost":"0.79","worldY":"1532.25"}}`,
  ),
  server(
    "round.sync boost residue",
    `{"v":1,"t":"round.sync","seq":80,"ts":"1731940019000","p":{"roundId":"${ROUND}","tick":815,"multiplier":"3.1724","boost":"5.551115123125783e-17","worldY":"2701.875"}}`,
  ),
  server(
    "round.boost",
    `{"v":1,"t":"round.boost","seq":59,"ts":"1731940012590","p":{"roundId":"${ROUND}","tick":430,"creatureId":7}}`,
  ),
  server(
    "round.crashed",
    `{"v":1,"t":"round.crashed","seq":92,"ts":"1731940020680","p":{"roundId":"${ROUND}","tick":913,"multiplier":"3.64"}}`,
  ),
  server(
    "round.crashed instant",
    `{"v":1,"t":"round.crashed","seq":10,"ts":"1731940005440","p":{"roundId":"${ROUND}","tick":1,"multiplier":"1"}}`,
  ),
  server(
    "round.impact",
    `{"v":1,"t":"round.impact","seq":119,"ts":"1731940025520","p":{"roundId":"${ROUND}","tick":1206,"jackpotMultiplier":"142.18"}}`,
  ),
  server(
    "round.bonus",
    `{"v":1,"t":"round.bonus","seq":121,"ts":"1731940026920","p":{"roundId":"${ROUND}","pickClosesAtServerMs":"1731940032000","pickWindowMs":6000}}`,
  ),
  server(
    "round.chests",
    `{"v":1,"t":"round.chests","seq":125,"ts":"1731940032000","p":{"roundId":"${ROUND}","chests":["2.31","7.04","1.12"]}}`,
  ),
  server(
    "round.ended jackpot",
    `{"v":1,"t":"round.ended","seq":128,"ts":"1731940032100","p":{"roundId":"${ROUND}","outcome":"jackpot","terminalTick":1206,"jackpotMultiplier":"142.18","chests":["2.31","7.04","1.12"],"reveal":{"serverSeed":"${SEED}"}}}`,
  ),
  server(
    "round.ended crash",
    `{"v":1,"t":"round.ended","seq":93,"ts":"1731940023100","p":{"roundId":"${ROUND}","outcome":"crash","terminalTick":913,"crashMultiplier":"3.64","reveal":{"serverSeed":"${SEED}"}}}`,
  ),
  server(
    "feed.bets",
    `{"v":1,"t":"feed.bets","seq":11,"ts":"1731940002250","p":{"roundId":"${ROUND}","entries":[{"alias":"reef_runner","slot":0,"amountMinor":"500","currency":"AQC"},{"alias":"kelp-7","slot":1,"amountMinor":"200","currency":"AQC","cashoutMultiplier":"3.6411"}]}}`,
  ),
  server(
    "server.notice drain",
    `{"v":1,"t":"server.notice","seq":200,"ts":"1731940100000","p":{"kind":"drain","retryAfterMs":15000}}`,
  ),
  server(
    "server.notice maintenance",
    `{"v":1,"t":"server.notice","seq":201,"ts":"1731940100500","p":{"kind":"maintenance"}}`,
  ),
];
