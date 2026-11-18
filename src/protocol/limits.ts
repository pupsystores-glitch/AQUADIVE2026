// Protocol size, depth, length and count limits (P8-1; docs/09 §35.2 P1-D4).
//
// Every limit a schema or the codec enforces is named here, once. The values
// are draft choices (P1-D2); each bounds the work a hostile frame can cause.

/** Largest client → server frame, in UTF-8 bytes, checked before parsing. */
export const MAX_CLIENT_FRAME_BYTES = 4 * 1024;

/** Largest server → client frame, in UTF-8 bytes (snapshots fit with room). */
export const MAX_SERVER_FRAME_BYTES = 64 * 1024;

/**
 * Deepest container nesting in a frame: the envelope is depth 1, its payload
 * depth 2. Six fits the deepest v1 message (a snapshot's creature or feed
 * entry, a private bet), deviating from docs/09 §9.1's four by approval.
 */
export const MAX_NESTING_DEPTH = 6;

/** Longest message type string (`namespace.verb`). */
export const MAX_TYPE_LENGTH = 32;

/** Longest error code string. */
export const MAX_ERROR_CODE_LENGTH = 48;

/** Most digits of a money amount in minor units: every value fits a signed 64-bit `BIGINT`. */
export const MAX_MINOR_DIGITS = 18;

/** Most digits of an unsigned 63-bit counter string (round number, chain index, ledger sequence). */
export const MAX_COUNTER_DIGITS = 19;

/** Most digits of a server wall-clock millisecond string (below 2^53, i.e. exact as a number). */
export const MAX_SERVER_TIME_DIGITS = 16;

/** Longest multiplier string (a double ≥ 1 below 10^21 prints in at most 22 characters). */
export const MAX_MULTIPLIER_LENGTH = 24;

/** Longest presentation decimal string (boost, world positions, creature attributes). */
export const MAX_DECIMAL_LENGTH = 32;

/** Largest tick index: dive ticks are JSON integers 0 … 2^31 − 1. */
export const MAX_TICK = 2 ** 31 - 1;

/** Largest per-round creature id (server ids, never the engine's). */
export const MAX_CREATURE_ID = 2 ** 31 - 1;

/** Largest duration field, in milliseconds (one day). */
export const MAX_DURATION_MS = 86_400_000;

/** Largest `seq` value and largest `ping.clientTs`: exact JSON integers. */
export const MAX_SAFE_COUNTER = Number.MAX_SAFE_INTEGER;

/** Largest fairness scheme version `fv`. */
export const MAX_FAIRNESS_VERSION = 65_535;

/** Largest announced server tick rate. */
export const MAX_TICK_HZ = 240;

/** Client build string length bounds. */
export const MAX_CLIENT_BUILD_LENGTH = 64;

/** Client platform string length bound. */
export const MAX_CLIENT_PLATFORM_LENGTH = 32;

/** One-time WebSocket ticket length bounds (docs/09 §9.3). */
export const MIN_TICKET_LENGTH = 22;
export const MAX_TICKET_LENGTH = 256;

/** Longest public player alias. */
export const MAX_ALIAS_LENGTH = 24;

/** Most entries in one `feed.bets` batch. */
export const MAX_FEED_ENTRIES = 50;

/** Most recent feed entries in a public snapshot. */
export const MAX_SNAPSHOT_FEED_ENTRIES = 20;

/** Most creatures in one `round.world` frame or snapshot world disclosure. */
export const MAX_CREATURES_PER_FRAME = 64;

/** Most pending request ids in a player's private state. */
export const MAX_PENDING_REQUEST_IDS = 8;

/** Largest number of players a snapshot's feed summary may report. */
export const MAX_FEED_PLAYERS = 10_000_000;

/** Upper bound of a world depth decimal, in world pixels. */
export const MAX_WORLD_Y_PX = 1_000_000;

/** Upper bound of a creature's size factor. */
export const MAX_CREATURE_SIZE = 16;

/** Upper bound of a creature's animation phase, in radians. */
export const MAX_CREATURE_PHASE = 2 * Math.PI;
