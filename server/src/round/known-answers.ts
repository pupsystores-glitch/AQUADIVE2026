// Known-answer vectors of offline RoundScript precomputation (P8-4a, extended in P8-4a-1; owner
// decisions K9, I6). PUBLIC, NON-SECRET development values. Never a production chain or a
// published commitment. Two public chains:
//
// - "dev-v1": the fv = 1 development chain FAIRNESS_DEV_VECTORS_V1 (length 8, salts A and B);
// - "kat-v1": the P8-4a-1 known-answer chain KNOWN_ANSWER_CHAIN_V1 below (2,048 links from a
//   fixed public phrase; salts A and B are the development salts, C its own phrase).
//
// These are REGRESSION checks of the loaded bundle, NOT its authentication: the trusted integrity
// manifest (server/integrity/engine-manifest.json, integrity.ts) is what refuses an altered
// bundle. A bundle edited to reproduce these rounds would pass them.
//
// Provenance (every value copied by a script, as data, from the TEST-ONLY independent generator
// server/test/independent/generate-vectors.mjs and its vectors-v1.json, which import nothing
// from src/ or server/src/; a compiled-runtime test compares this file with the generator):
// - crashAt, crashDraws, outcome, jackpot / chests (floor rounds) and firstCreatures: the
//   independent reference round (reference-round.mjs: spec-only draws, formulas and the diving
//   tick pipeline transcribed from the engine source). For the three P8-4a entries the values
//   are unchanged; their crash-round jackpot / chests are the streams' independent values,
//   which a crash round never draws (not checked).
// - `recordDigest`: SHA-256 over "AQUADIVE-REFERENCE-RECORD\0v1\0" and the canonical JSON of
//   the independent reference record of the whole round (every tick sample, creature, spawn
//   and consumption tick, final world, draw counts). The loader compares the production
//   runner's complete output with it.
// - The "kat-v1" rounds were selected by a fixed rule (the first index per salt and category);
//   the loader runs six of them (the 200× clamp, a crash point above 100×, exactly 1×, the 1.01
//   floor, a tier-3 jackpot floor and repeated goldfish consumption); the tests run all 45.
// - `digestCandidate`: the RoundScript digest of the round (canonical.ts), generated in P8-4a
//   by the sealed runner AND reproduced by an independent recorder and encoder in the tests (see
//   server/README.md §14). CANDIDATES ONLY — NOT OWNER-APPROVED: their acceptance needs a
//   separate review. Never regenerate them to make a test pass.
//
// The loader (engine-runtime.ts) refuses a bundle that does not reproduce every entry.

/** The status of the digest candidates below. */
export const KNOWN_ANSWER_DIGEST_STATUS = "candidate-not-owner-approved";

/**
 * The P8-4a-1 public known-answer chain (I6): links[2048] = SHA-256(seedPhrase),
 * links[i] = SHA-256(links[i + 1]), chainId = links[0]. Salt C = SHA-256(saltCPhrase); salts A
 * and B are FAIRNESS_DEV_VECTORS_V1's. The derivation checks the pinned chain id and salt.
 */
export const KNOWN_ANSWER_CHAIN_V1 = Object.freeze({
  seedPhrase:
    "AQUADIVE fairness fv=1 P8-4a-1 known-answer chain v1. PUBLIC, NOT SECRET. Never use in production.",
  length: 2048,
  chainIdHex: "9ec48dc16af11e1bba7a38b6fd0d09bf0b0064decd15ec0cd0f5b83a9273c14d",
  saltCPhrase:
    "AQUADIVE fairness fv=1 P8-4a-1 known-answer salt C. Fixed test value, not a public beacon value.",
  saltCHex: "f43d2645be9eb40952637861b36635c848e0257844cff955d87650c0b744ef0f",
});

/** Domain tag of the independent reference record digest. */
export const REFERENCE_RECORD_DOMAIN = "AQUADIVE-REFERENCE-RECORD\u0000v1\u0000";

export interface RoundScriptKnownAnswer {
  readonly chain: "dev-v1" | "kat-v1";
  readonly salt: "A" | "B" | "C";
  readonly index: number;
  readonly outcome: "crash" | "floor";
  readonly crashAt: number;
  readonly crashDraws: 1 | 2;
  /** Checked for a floor round only (a crash round's script records null). */
  readonly jackpot: number | null;
  /** Checked for a floor round only (a crash round's script records null). */
  readonly chests: readonly [number, number, number] | null;
  /** The first creatures the world stream rolls (from draw 0), in spawn order. */
  readonly firstCreatures: readonly {
    readonly id: number;
    readonly kind: string;
    readonly x: number;
    readonly worldY: number;
    readonly size: number;
    readonly phase: number;
    readonly dir: 1 | -1;
  }[];
  /** RoundScript digest CANDIDATE (not owner-approved), or null when none is pinned. */
  readonly digestCandidate: string | null;
  /** Independent reference record digest of the whole round (see the file comment). */
  readonly recordDigest: string;
}

/** CANDIDATE, NOT OWNER-APPROVED (P8-4a, generated 2026-11-23). */
const DIGEST_A1 = "1e8adf849d36618b2f3850727763aba45a784eeb0de67318fb603f7b3f0f13ac";
/** CANDIDATE, NOT OWNER-APPROVED (P8-4a, generated 2026-11-23). */
const DIGEST_B1 = "6f68e59e7e6f11e896446919adbba9a8257fb411ee4bc5d9b4cb98b86d198a17";
const DIGEST_A7 = null;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

export const ROUND_SCRIPT_KNOWN_ANSWERS: readonly RoundScriptKnownAnswer[] = deepFreeze([
  {
    chain: "dev-v1",
    salt: "A",
    index: 1,
    outcome: "crash",
    crashAt: 1.4536530041616833,
    crashDraws: 2,
    jackpot: 258.9,
    chests: [1.39, 2.75, 6.02],
    firstCreatures: [
      {
        id: 1,
        kind: "fishSchool",
        x: 0.39442933065353303,
        worldY: 314.4302781990531,
        size: 1.3190205537855717,
        phase: 2.867380720252473,
        dir: -1,
      },
      {
        id: 2,
        kind: "jellyfish",
        x: 0.1740215954004004,
        worldY: 362.88830972191965,
        size: 0.9082822640719401,
        phase: 4.176833938734226,
        dir: 1,
      },
    ],
    digestCandidate: DIGEST_A1,
    recordDigest: "2e2afdd7ed87e0520995ff1fc4559b8151373d8d6b924cc9ebb45c1cbe86ec19",
  },
  {
    chain: "dev-v1",
    salt: "B",
    index: 1,
    outcome: "crash",
    crashAt: 1.465958209315236,
    crashDraws: 2,
    jackpot: 187.38,
    chests: [2.87, 1.53, 5.07],
    firstCreatures: [
      {
        id: 1,
        kind: "fishSchool",
        x: 0.27785286978657525,
        worldY: 296.50275716628687,
        size: 0.9263822725163923,
        phase: 4.166133274222335,
        dir: 1,
      },
      {
        id: 2,
        kind: "fishSchool",
        x: 0.49614542625533264,
        worldY: 306.2299533797358,
        size: 1.3072177198310195,
        phase: 4.6038995762851185,
        dir: -1,
      },
    ],
    digestCandidate: DIGEST_B1,
    recordDigest: "309cbccbc10c027e824122467aa5e2fa99fc7a78c2087dbf820360b59c5fdff1",
  },
  {
    chain: "dev-v1",
    salt: "A",
    index: 7,
    outcome: "floor",
    crashAt: 28.892756556956154,
    crashDraws: 2,
    jackpot: 51.71,
    chests: [1.88, 2.11, 8.74],
    firstCreatures: [
      {
        id: 1,
        kind: "kelp",
        x: 0.8827584364268125,
        worldY: 337.82587165961843,
        size: 1.211199975895731,
        phase: 1.986696740533386,
        dir: -1,
      },
      {
        id: 2,
        kind: "seahorse",
        x: 0.8890498395875334,
        worldY: 382.0166796059582,
        size: 1.354788668926518,
        phase: 4.704067288713565,
        dir: -1,
      },
    ],
    // K9 asks for A1 / B1 candidates only; A7 (the floor round) is checked by value.
    digestCandidate: DIGEST_A7,
    recordDigest: "5f6a008234b1a32af4ac364bc8d2f257d92ce7b149ac2aca626fe2fe49b72c01",
  },
  {
    // crash-clamp-200
    chain: "kat-v1",
    salt: "A",
    index: 145,
    outcome: "floor",
    crashAt: 200,
    crashDraws: 2,
    jackpot: 95.05,
    chests: [47.54, 2.59, 2.24],
    firstCreatures: [
      {
        id: 1,
        kind: "fishSchool",
        x: 0.8755071416671119,
        worldY: 329.1675454307832,
        size: 1.2071521873079132,
        phase: 0.3534360272957276,
        dir: 1,
      },
      {
        id: 2,
        kind: "fishSchool",
        x: 0.7830600077803341,
        worldY: 323.22362493350585,
        size: 1.3029882117872196,
        phase: 1.788563299239924,
        dir: 1,
      },
    ],
    digestCandidate: null,
    recordDigest: "82ebadaface581ebf08e74052ac18830f42f972dc89e30c454584829a3fb60cd",
  },
  {
    // crash-over-100
    chain: "kat-v1",
    salt: "B",
    index: 212,
    outcome: "floor",
    crashAt: 108.83722642972546,
    crashDraws: 2,
    jackpot: 176.47,
    chests: [6.45, 9.15, 2.8],
    firstCreatures: [
      {
        id: 1,
        kind: "fishSchool",
        x: 0.7674765018146349,
        worldY: 337.99957459937633,
        size: 1.2920829530516291,
        phase: 2.699320754545655,
        dir: -1,
      },
      {
        id: 2,
        kind: "fishSchool",
        x: 0.12813652271013237,
        worldY: 351.74696214736935,
        size: 0.844978397067149,
        phase: 0.04322023121858289,
        dir: 1,
      },
    ],
    digestCandidate: null,
    recordDigest: "6880b6e7882599effdc60374b6636e9cbe4142a76e18c868083cda61cc658371",
  },
  {
    // crash-exact-1x
    chain: "kat-v1",
    salt: "A",
    index: 9,
    outcome: "crash",
    crashAt: 1,
    crashDraws: 1,
    jackpot: null,
    chests: null,
    firstCreatures: [],
    digestCandidate: null,
    recordDigest: "ef4d5f5f1d6d4db6a2559579d4fec1c4be058d267bbf816a3492147e5829363b",
  },
  {
    // crash-floor-1.01
    chain: "kat-v1",
    salt: "C",
    index: 200,
    outcome: "crash",
    crashAt: 1.01,
    crashDraws: 2,
    jackpot: null,
    chests: null,
    firstCreatures: [
      {
        id: 1,
        kind: "kelp",
        x: 0.6005381029888899,
        worldY: 310.61432692455196,
        size: 0.8104682773763063,
        phase: 3.9379522275082066,
        dir: -1,
      },
      {
        id: 2,
        kind: "jellyfish",
        x: 0.23428253870925372,
        worldY: 341.3702799881443,
        size: 1.1968773137891011,
        phase: 2.7157194073387676,
        dir: 1,
      },
    ],
    digestCandidate: null,
    recordDigest: "92cacd5b4bffc934eaebb4caa2d10cd31a2d4787726340d304d6a122b728dfc2",
  },
  {
    // floor-jackpot-tier-3
    chain: "kat-v1",
    salt: "B",
    index: 72,
    outcome: "floor",
    crashAt: 12.95605691678788,
    crashDraws: 2,
    jackpot: 408.94,
    chests: [1.37, 1.06, 5.31],
    firstCreatures: [
      {
        id: 1,
        kind: "fishSchool",
        x: 0.26429618910050157,
        worldY: 334.62889065401015,
        size: 0.8611099598281471,
        phase: 0.3267489739357976,
        dir: -1,
      },
      {
        id: 2,
        kind: "seahorse",
        x: 0.2994081898097518,
        worldY: 342.5255261139382,
        size: 1.1600499062641796,
        phase: 4.070096360932118,
        dir: -1,
      },
    ],
    digestCandidate: null,
    recordDigest: "1179e839ca5bbbc84b8c1c375f9140903299517f4c92e9f1c9127b80e8a50ad2",
  },
  {
    // goldfish-consumed, goldfish-consumed-twice
    chain: "kat-v1",
    salt: "A",
    index: 1,
    outcome: "crash",
    crashAt: 3.4536515375540455,
    crashDraws: 2,
    jackpot: null,
    chests: null,
    firstCreatures: [
      {
        id: 1,
        kind: "jellyfish",
        x: 0.12815261297234068,
        worldY: 274.6018173358777,
        size: 1.118148835962259,
        phase: 5.906003334980007,
        dir: -1,
      },
      {
        id: 2,
        kind: "jellyfish",
        x: 0.1873102977123045,
        worldY: 371.79419554187234,
        size: 1.146174362935564,
        phase: 4.877558893422159,
        dir: 1,
      },
    ],
    digestCandidate: null,
    recordDigest: "0fa58a667ee007b8c32a5a283b8338cbff838c415093239aac0e4322fd583f9f",
  },
] satisfies RoundScriptKnownAnswer[]);
