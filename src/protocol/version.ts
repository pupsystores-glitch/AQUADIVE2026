// Protocol version and negotiation (P8-1; docs/09 §35.2 P1-D2, P1-D12).
//
// Protocol v1 is a DRAFT. Until the first network client is released (no
// earlier than P8-6), any part of it may change without a version bump. The
// compatibility rules of P1-D12 bind only from that release, which must be
// an explicit, owner-approved step: nothing in this library declares it.
//
// The protocol major is independent of the engine snapshot schema version
// and of the fairness scheme version `fv` (docs/09 §8.3).

/** The one protocol major this library implements. */
export const PROTOCOL_MAJOR = 1 as const;

/** Draft: changeable without a version bump until the first client release. */
export const PROTOCOL_STATUS = "draft" as const;

/** The protocol majors this library can speak, inclusive. */
export const SUPPORTED_PROTOCOL: Readonly<ProtocolRange> = {
  min: PROTOCOL_MAJOR,
  max: PROTOCOL_MAJOR,
};

/** The largest protocol major a `hello` may announce. */
export const MAX_PROTOCOL_MAJOR = 255;

/** WebSocket close code after `protocol-unsupported` (docs/09 §8.4). */
export const PROTOCOL_UNSUPPORTED_CLOSE_CODE = 4001;

/** An inclusive range of protocol majors, as `hello.protocol` announces it. */
export interface ProtocolRange {
  readonly min: number;
  readonly max: number;
}

/**
 * P1-D12: the highest major both sides support, or `null` when the ranges do
 * not overlap (the server then answers `protocol-unsupported` and closes with
 * `PROTOCOL_UNSUPPORTED_CLOSE_CODE`).
 */
export function negotiateProtocol(
  offered: ProtocolRange,
  supported: ProtocolRange = SUPPORTED_PROTOCOL,
): number | null {
  const high = Math.min(offered.max, supported.max);
  const low = Math.max(offered.min, supported.min);
  return Number.isInteger(high) && Number.isInteger(low) && high >= low ? high : null;
}
