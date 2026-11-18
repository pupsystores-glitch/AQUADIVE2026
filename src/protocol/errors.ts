// Error and rejection code registry (P8-1; docs/09 §35.2 P1-D8, P1-D11).
//
// One code style: lower-case kebab-case, matching the engine's rejection
// reasons (`src/engine/state-machine.ts`). Codes are stable identifiers,
// never user-facing text: wording stays in `src/ui/strings.ts`, and clients
// map a code they do not know to a generic message.
//
// The registry is APPEND-ONLY. A mistaken code is deprecated, never removed
// or re-meant. There is no `DUPLICATE_REQUEST`: a duplicate request is not an
// error, it replays the original final response (P1-D8).
//
// Flags per code:
// - `stored`: the outcome is a business decision recorded in the idempotency
//   record of `(playerId, id)`; a retry with the same id replays it. Codes
//   raised before processing are not stored, so the same id may be retried.
// - `retryable`: a retry with the same request id can succeed later.
// - `audience`: "request" codes answer one request (the frame carries `re`);
//   "connection" codes may also concern the connection as a whole. Every
//   error is a session message (never broadcast).
// - `carriers`: the message types allowed to carry the code.
// - `outcome`: what the code tells a client about the request it answers
//   (`RequestOutcome` below). Only `final` settles the request.
//
// Carrier rule: `bet.rejected` and `bonus.pickRejected` carry ONLY stored,
// final business decisions. Everything transient or indeterminate travels as
// `error`. So a client can treat any code on a `*.rejected` carrier, even one
// it does not know, as final.
//
// The stable wire contract is the code (and the carrier it travels in). The
// codec's failure `detail` strings are diagnostics, not API: they may change
// at any time and must not be parsed or matched by clients or servers.
//
// The registry states the contract. Enforcing it (the idempotency store,
// retention ≥ settlement + 24 h) is P8-10's job, not this library's.

import { z } from "zod";
import { MAX_ERROR_CODE_LENGTH } from "./limits";

/** The session message types that carry an error code. */
export type ErrorCarrier = "bet.rejected" | "bonus.pickRejected" | "error";

/**
 * What a response tells the client about the request it answers.
 *
 * - `final`: the server decided and stored the outcome for `(playerId, id)`.
 *   Resending the same id replays the same response. The request is settled.
 * - `transient`: the server refused THIS delivery before processing it, and
 *   a resend with the SAME id may succeed later. It does NOT prove the request
 *   id never took effect: an earlier delivery of the same id may have been
 *   processed. The request stays unsettled.
 * - `indeterminate`: the response does not tell whether the request took
 *   effect (`internal`, an unknown code, a protocol fault). The request stays
 *   unsettled until a final response or the authoritative private state
 *   (`sync.snapshot.player`) settles it.
 *
 * A missing response (timeout, lost connection) is `indeterminate` too. A
 * client never sends a NEW request id for an unsettled financial request;
 * it may resend only the original id, which the idempotency rule (P1-D8,
 * at most one effect per id) makes safe.
 */
export type RequestOutcome = "final" | "transient" | "indeterminate";

export interface ErrorCodeSpec {
  /** "engine": the engine's own rejection reason; "server": added by the server. */
  readonly origin: "engine" | "server";
  readonly stored: boolean;
  readonly retryable: boolean;
  readonly outcome: RequestOutcome;
  readonly audience: "request" | "connection";
  readonly carriers: readonly ErrorCarrier[];
}

const BET = ["bet.rejected"] as const;
const BONUS = ["bonus.pickRejected"] as const;
const ERROR = ["error"] as const;

const business = <C extends readonly ErrorCarrier[]>(origin: "engine" | "server", carriers: C) =>
  ({
    origin,
    stored: true,
    retryable: false,
    outcome: "final",
    audience: "request",
    carriers,
  }) as const;

/** Refused before processing; a resend with the same id may succeed. Not stored. */
const transient = (audience: "request" | "connection") =>
  ({
    origin: "server",
    stored: false,
    retryable: true,
    outcome: "transient",
    audience,
    carriers: ERROR,
  }) as const;

/** Not stored; does not say whether the request took effect. */
const indeterminate = (audience: "request" | "connection", retryable: boolean) =>
  ({
    origin: "server",
    stored: false,
    retryable,
    outcome: "indeterminate",
    audience,
    carriers: ERROR,
  }) as const;

export const ERROR_CODES = {
  // Engine rejection reasons (docs/06 §12 – §13.2).
  "not-in-betting": business("engine", BET),
  "already-participating": business("engine", BET),
  "invalid-amount": business("engine", BET),
  "invalid-slot": business("engine", BET),
  "not-diving": business("engine", BET),
  "not-participating": business("engine", BET),
  "already-cashed-out": business("engine", BET),
  "not-in-bonus": business("engine", BONUS),
  "not-bonus-eligible": business("engine", BONUS),
  "chest-already-picked": business("engine", BONUS),
  // Server business rejections, decided by the round or settlement.
  "round-mismatch": business("server", ["bet.rejected", "bonus.pickRejected"] as const),
  "insufficient-funds": business("server", BET),
  "stake-limit": business("server", BET),
  "round-exposure-limit": business("server", BET),
  "round-voided": business("server", ["bet.rejected", "bonus.pickRejected"] as const),
  // The SETTLE-IN barrier (docs/09 §10.4): a bet received before close whose
  // ledger commit did not complete before the dive. A stored final decision:
  // the bet is not in the round, and a resend replays this rejection.
  // Owner condition (docs/09 §36.3): the server may send it ONLY once it can
  // prove the bet was not included AND any debit was rolled back or durably
  // compensated (the void committed). While the transaction's outcome is
  // unknown or reconciliation is incomplete, the request is INDETERMINATE:
  // the server answers `error internal` or nothing, never `commit-timeout`.
  // This library states the rule; enforcing it is the server's (P8-4/P8-10).
  "commit-timeout": business("server", BET),
  // Transient: refused before processing (before the idempotency lookup), not
  // stored. Once processing of a delivery has begun, the server must answer
  // with a stored final outcome or `internal`, never with one of these.
  "server-busy": transient("request"),
  "rate-limited": transient("connection"),
  "auth-required": transient("request"),
  "auth-expired": transient("connection"),
  // Indeterminate: not stored; the response does not settle the request.
  // `idempotency-conflict`: this payload had no effect, but the id already has
  // its own stored outcome (a client defect). `internal`: processing may have
  // failed after the effect committed. Protocol faults: the client's own frame
  // could not be read, so the server cannot say which request it was.
  "idempotency-conflict": indeterminate("request", false),
  "auth-failed": indeterminate("connection", false),
  "protocol-unsupported": indeterminate("connection", false),
  "frame-too-large": indeterminate("connection", false),
  malformed: indeterminate("connection", false),
  "unknown-type": indeterminate("connection", false),
  internal: indeterminate("connection", true),
} as const satisfies Record<string, ErrorCodeSpec>;

type Registry = typeof ERROR_CODES;

export type ErrorCode = keyof Registry;

/** The codes a given carrier may carry. */
export type ErrorCodeFor<C extends ErrorCarrier> = {
  [K in ErrorCode]: C extends Registry[K]["carriers"][number] ? K : never;
}[ErrorCode];

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Any well-formed code, known or not. Client decoding accepts codes added
 * after it was built (P1-D12); server encoding additionally requires a
 * registered code allowed on its carrier (`isErrorCodeAllowed`).
 */
export const WireErrorCodeSchema = z.string().max(MAX_ERROR_CODE_LENGTH).regex(KEBAB);

/** True iff `code` is in the registry. */
export function isRegisteredErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/** The registry entry of a code, or `null` for an unregistered one. */
export function errorCodeSpec(code: unknown): ErrorCodeSpec | null {
  return isRegisteredErrorCode(code) ? ERROR_CODES[code] : null;
}

/** True iff `code` is registered and may travel in `carrier`. */
export function isErrorCodeAllowed(code: unknown, carrier: ErrorCarrier): boolean {
  const spec = errorCodeSpec(code);
  return spec !== null && spec.carriers.includes(carrier);
}

/** The responses that settle a financial request: acceptances and stored rejections. */
const FINAL_RESPONSE_TYPES: ReadonlySet<string> = new Set([
  "bet.accepted",
  "bet.cashedOut",
  "bonus.pickAccepted",
  "bet.rejected",
  "bonus.pickRejected",
]);

/**
 * Classify a decoded response to an idempotent request (`bet.place`,
 * `bet.cashout`, `bonus.pick`), on the client. Conservative by design:
 *
 * - an acceptance, or any code on `bet.rejected` / `bonus.pickRejected`, even
 *   an unknown one → `final` (the carrier rule above);
 * - `error` with a code registered FOR `error` → that code's registered
 *   `outcome` (always `transient` or `indeterminate`, never `final`);
 * - `error` with an unknown code, or with a code that may not travel as
 *   `error` (e.g. a stored business code such as `commit-timeout`, which only
 *   a non-conforming server could send that way) → `indeterminate`, whatever
 *   its `retryable` flag says (the flag then only tells whether resending the
 *   SAME id may help). An `error` frame never settles a request;
 * - anything else → `indeterminate`.
 *
 * It classifies; it does not retry. Matching the response to its request
 * (`re`) is the caller's job, and a request with no response at all is
 * `indeterminate`.
 */
export function classifyRequestResponse(response: {
  readonly t: string;
  readonly p?: unknown;
}): RequestOutcome {
  if (FINAL_RESPONSE_TYPES.has(response.t)) return "final";
  if (response.t !== "error") return "indeterminate";
  const p = response.p;
  const code = typeof p === "object" && p !== null ? (p as { code?: unknown }).code : undefined;
  const spec = errorCodeSpec(code);
  if (spec === null || !spec.carriers.includes("error")) return "indeterminate";
  return spec.outcome === "final" ? "indeterminate" : spec.outcome;
}
