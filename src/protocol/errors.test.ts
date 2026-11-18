// Retryability contract: final, transient and indeterminate outcomes (P8-1 acceptance
// refinement; docs/09 §35.2 P1-D8, P1-D11).
import { describe, expect, it } from "vitest";
import { decodeServerFrame, encodeServerFrame } from "./codec";
import {
  classifyRequestResponse,
  ERROR_CODES,
  isErrorCodeAllowed,
  type ErrorCarrier,
  type RequestOutcome,
} from "./errors";
import { GOLDEN_V1 } from "./test/golden-v1";

const golden = (name: string) => GOLDEN_V1.find((g) => g.name === name)!.frame;
const REJECTED_CARRIERS: readonly ErrorCarrier[] = ["bet.rejected", "bonus.pickRejected"];
const specs = Object.entries(ERROR_CODES);
const codesWith = (outcome: RequestOutcome) =>
  specs
    .filter(([, s]) => s.outcome === outcome)
    .map(([c]) => c)
    .sort();

describe("registry: every code has one consistent outcome", () => {
  it("final ⇔ stored, and final codes are never retryable", () => {
    for (const [code, s] of specs) {
      expect({ code, final: s.outcome === "final" }).toEqual({ code, final: s.stored });
      if (s.outcome === "final")
        expect({ code, retryable: s.retryable }).toEqual({ code, retryable: false });
    }
  });

  it("transient codes are exactly the pre-processing refusals a resend can overcome", () => {
    expect(codesWith("transient")).toEqual(
      ["auth-expired", "auth-required", "rate-limited", "server-busy"].sort(),
    );
    for (const code of codesWith("transient")) {
      const s = ERROR_CODES[code as keyof typeof ERROR_CODES];
      expect({ code, stored: s.stored, retryable: s.retryable }).toEqual({
        code,
        stored: false,
        retryable: true,
      });
    }
  });

  it("internal is indeterminate (it may follow a committed effect), not transient", () => {
    expect(ERROR_CODES.internal.outcome).toBe("indeterminate");
    expect(ERROR_CODES["idempotency-conflict"].outcome).toBe("indeterminate");
    expect(codesWith("indeterminate")).toEqual(
      [
        "auth-failed",
        "frame-too-large",
        "idempotency-conflict",
        "internal",
        "malformed",
        "protocol-unsupported",
        "unknown-type",
      ].sort(),
    );
  });

  it("rejection carriers carry only final codes; error carries only non-final codes", () => {
    for (const [code, s] of specs) {
      for (const carrier of s.carriers) {
        const expectFinal = REJECTED_CARRIERS.includes(carrier);
        expect({ code, carrier, final: s.outcome === "final" }).toEqual({
          code,
          carrier,
          final: expectFinal,
        });
      }
    }
  });

  it("server-busy travels only as error; the SETTLE-IN barrier uses the stored commit-timeout", () => {
    expect(isErrorCodeAllowed("server-busy", "error")).toBe(true);
    expect(isErrorCodeAllowed("server-busy", "bet.rejected")).toBe(false);
    expect(ERROR_CODES["commit-timeout"]).toMatchObject({
      stored: true,
      retryable: false,
      outcome: "final",
      carriers: ["bet.rejected"],
    });
  });
});

describe("encoder: transient codes cannot pose as a final rejection", () => {
  it("refuses bet.rejected server-busy and accepts bet.rejected commit-timeout", () => {
    const busy = decodeServerFrame(golden("bet.rejected").replace("not-in-betting", "server-busy"));
    expect(busy.ok).toBe(true);
    if (busy.ok)
      expect(encodeServerFrame(busy.msg)).toMatchObject({ ok: false, code: "malformed" });

    const timeoutFrame = golden("bet.rejected").replace("not-in-betting", "commit-timeout");
    const timeout = decodeServerFrame(timeoutFrame);
    expect(timeout.ok).toBe(true);
    if (timeout.ok)
      expect(encodeServerFrame(timeout.msg)).toEqual({ ok: true, frame: timeoutFrame });
  });

  it("commit-timeout cannot be emitted as error; the unresolved SETTLE-IN path is internal", () => {
    // Owner condition (docs/09 §36.3): commit-timeout only after confirmed rollback
    // or durable compensation. Until then the server answers `error internal`.
    const asError = decodeServerFrame(
      golden("error idempotency-conflict").replace("idempotency-conflict", "commit-timeout"),
    );
    expect(asError.ok).toBe(true);
    if (asError.ok)
      expect(encodeServerFrame(asError.msg)).toMatchObject({ ok: false, code: "malformed" });
    expect(isErrorCodeAllowed("commit-timeout", "error")).toBe(false);
    expect(isErrorCodeAllowed("commit-timeout", "bonus.pickRejected")).toBe(false);

    const unresolved = golden("error idempotency-conflict")
      .replace("idempotency-conflict", "internal")
      .replace('"retryable":false', '"retryable":true');
    const decoded = decodeServerFrame(unresolved);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(encodeServerFrame(decoded.msg)).toEqual({ ok: true, frame: unresolved });
      expect(classifyRequestResponse(decoded.msg)).toBe("indeterminate");
    }
  });

  it("emits error frames only with the registered retryable flag", () => {
    const frame = golden("error idempotency-conflict")
      .replace("idempotency-conflict", "server-busy")
      .replace('"retryable":false', '"retryable":true');
    const decoded = decodeServerFrame(frame);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(encodeServerFrame(decoded.msg)).toEqual({ ok: true, frame });
    const lying = decodeServerFrame(frame.replace('"retryable":true', '"retryable":false'));
    if (lying.ok) expect(encodeServerFrame(lying.msg)).toMatchObject({ ok: false });
  });
});

describe("client classification of responses to idempotent requests", () => {
  const classify = (frame: string) => {
    const d = decodeServerFrame(frame);
    if (!d.ok) throw new Error(`golden frame failed to decode: ${d.code}`);
    return classifyRequestResponse(d.msg);
  };

  it("acceptances and stored rejections are final", () => {
    for (const name of [
      "bet.accepted slot 0",
      "bet.cashedOut",
      "bonus.pickAccepted",
      "bet.rejected",
      "bonus.pickRejected",
    ])
      expect({ name, outcome: classify(golden(name)) }).toEqual({ name, outcome: "final" });
  });

  it("an UNKNOWN code on a rejection carrier is still final (carrier rule)", () => {
    expect(classify(golden("bet.rejected").replace("not-in-betting", "future-code"))).toBe("final");
    expect(
      classify(golden("bonus.pickRejected").replace("chest-already-picked", "future-code")),
    ).toBe("final");
  });

  it("error frames take the registered outcome", () => {
    expect(classify(golden("error idempotency-conflict"))).toBe("indeterminate");
    expect(classify(golden("error rate-limited"))).toBe("transient");
    const errorWith = (code: string, retryable: boolean) =>
      golden("error idempotency-conflict")
        .replace("idempotency-conflict", code)
        .replace('"retryable":false', `"retryable":${retryable}`);
    expect(classify(errorWith("server-busy", true))).toBe("transient");
    expect(classify(errorWith("internal", true))).toBe("indeterminate");
  });

  it("an UNKNOWN code on error is indeterminate, even when it claims to be retryable", () => {
    const frame = golden("error idempotency-conflict")
      .replace("idempotency-conflict", "future-transient")
      .replace('"retryable":false', '"retryable":true');
    expect(classify(frame)).toBe("indeterminate");
  });

  it("an error frame never settles a request, even with a stored business code", () => {
    // Client decoding is tolerant, so a non-conforming server could send a final
    // code as `error`. The carrier rule makes that indeterminate, never final.
    const errorWith = (code: string) =>
      golden("error idempotency-conflict").replace("idempotency-conflict", code);
    for (const code of ["commit-timeout", "not-in-betting", "insufficient-funds", "round-voided"])
      expect({ code, outcome: classify(errorWith(code)) }).toEqual({
        code,
        outcome: "indeterminate",
      });
    for (const code of Object.keys(ERROR_CODES))
      expect(classifyRequestResponse({ t: "error", p: { code, retryable: true } })).not.toBe(
        "final",
      );
  });

  it("anything that is not a response to a financial request is indeterminate", () => {
    expect(classifyRequestResponse({ t: "pong", p: {} })).toBe("indeterminate");
    expect(classifyRequestResponse({ t: "future.type" })).toBe("indeterminate");
    expect(classifyRequestResponse({ t: "error", p: null })).toBe("indeterminate");
    expect(classifyRequestResponse({ t: "error", p: { code: "__proto__" } })).toBe("indeterminate");
    expect(classifyRequestResponse({ t: "error", p: { code: "constructor" } })).toBe(
      "indeterminate",
    );
  });
});
