// Fairness audit trail (P8-3c-2).
//
// The vault appends one event per reservation, salt binding, derivation, classification, reveal,
// state change and refused or failed operation. Events have a fixed allow-listed shape: a kind,
// the public chain id, a public round index, and a short code (an error code, a disposition, a
// state). There is no free-text field, so no secret material can be placed in an event.
//
// MemoryAuditSink is a DEVELOPMENT sink: an in-process array. It is neither durable nor
// tamper-evident (any code in the process can drop it, and it ends with the process). A durable,
// append-only audit log is P8-7 and does not exist.

import { ChainError } from "./errors";

export type AuditEventKind =
  | "chain-created"
  | "chain-transition"
  | "index-reserved"
  | "reservation-replayed"
  | "salt-bound"
  | "derivation-issued"
  | "round-classified"
  | "reveal-recorded"
  | "reveal-replayed"
  | "seeds-precomputed"
  | "operation-failed"
  // P8-4a (owner decision K7): offline RoundScript preparation. `code` is null for
  // `script-built` and a fixed RoundScriptError code for `script-failed`; like every event they
  // hold no seed, derivation, outcome, digest or text.
  | "script-built"
  | "script-failed";

export const AUDIT_EVENT_KINDS: readonly AuditEventKind[] = Object.freeze([
  "chain-created",
  "chain-transition",
  "index-reserved",
  "reservation-replayed",
  "salt-bound",
  "derivation-issued",
  "round-classified",
  "reveal-recorded",
  "reveal-replayed",
  "seeds-precomputed",
  "operation-failed",
  "script-built",
  "script-failed",
]);

/** What a producer supplies. */
export interface AuditEventInput {
  readonly kind: AuditEventKind;
  /** The vault operation that produced the event. */
  readonly operation: string;
  readonly chainId: string | null;
  readonly chainIndex: number | null;
  /** A short kebab-case code: error code, disposition, state or count label. */
  readonly code: string | null;
}

/** A stored event: the input plus sequence number and time. */
export interface AuditEvent extends AuditEventInput {
  readonly seq: number;
  /** Milliseconds since the Unix epoch, from the sink's clock. */
  readonly at: number;
}

export interface AuditSink {
  /** Durable and tamper-evident sinks can say so; the development sink cannot. */
  readonly guarantees: { readonly durable: boolean; readonly tamperEvident: boolean };
  append(event: AuditEventInput): void | Promise<void>;
}

const CODE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const CHAIN_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The only codes a `script-failed` event may carry (P8-4a, K7): exactly the RoundScriptError
 * codes of server/src/round/errors.ts (a test keeps both lists equal).
 */
export const SCRIPT_FAILURE_CODES: readonly string[] = Object.freeze([
  "runtime-unavailable",
  "runtime-incompatible",
  "runtime-duplicate-fairness",
  "runtime-known-answer-failed",
  "unverified-runtime",
  "runner-failed",
  "script-invalid",
  "script-digest-mismatch",
  "chain-unavailable",
  "request-replayed",
  "disposition-failed",
  "audit-failed",
  "reveal-mismatch",
  "environment-closed",
  "development-only",
  "invalid-request",
]);

/** P8-4a script events: one operation, and a code from a fixed set (K7). */
const scriptEventOk = (event: AuditEventInput): boolean => {
  if (event.kind !== "script-built" && event.kind !== "script-failed") return true;
  if (event.operation !== "prepare-script") return false;
  return event.kind === "script-built"
    ? event.code === null && event.chainId !== null && event.chainIndex !== null
    : event.code !== null && SCRIPT_FAILURE_CODES.includes(event.code);
};

/** Validates an event's shape; refuses anything outside the allow-list. */
export function assertAuditEvent(event: AuditEventInput): void {
  const keys = Object.keys(event ?? {}).sort();
  const ok =
    keys.join(",") === "chainId,chainIndex,code,kind,operation" &&
    AUDIT_EVENT_KINDS.includes(event.kind) &&
    CODE_PATTERN.test(event.operation) &&
    (event.chainId === null || CHAIN_ID_PATTERN.test(event.chainId)) &&
    (event.chainIndex === null || (Number.isInteger(event.chainIndex) && event.chainIndex >= 0)) &&
    (event.code === null || CODE_PATTERN.test(event.code)) &&
    scriptEventOk(event);
  if (!ok) throw new ChainError("audit-failed", "audit event is malformed");
}

/** In-memory development sink. NOT durable, NOT tamper-evident. */
export class MemoryAuditSink implements AuditSink {
  readonly guarantees = Object.freeze({ durable: false, tamperEvident: false });
  #events: AuditEvent[] = [];
  #clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.#clock = clock;
    Object.freeze(this);
  }

  append(event: AuditEventInput): void {
    assertAuditEvent(event);
    this.#events.push(
      Object.freeze({
        seq: this.#events.length + 1,
        at: this.#clock(),
        kind: event.kind,
        operation: event.operation,
        chainId: event.chainId,
        chainIndex: event.chainIndex,
        code: event.code,
      }),
    );
  }

  /** A frozen copy of every event so far, in order. */
  events(): readonly AuditEvent[] {
    return Object.freeze([...this.#events]);
  }
}
