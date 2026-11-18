// Gateway building blocks in isolation: rate limit, registry, origin policy, handshake, refusals.
import { describe, expect, it } from "vitest";
import { ConnectionRegistry } from "../src/gateway/connection-registry";
import { answerHello } from "../src/gateway/handshake";
import { OriginPolicy } from "../src/gateway/origin-policy";
import { TokenBucket } from "../src/gateway/rate-limit";
import { REFUSALS } from "../src/gateway/request-policy";
import {
  decodeClientFrame,
  encodeServerFrame,
  errorCodeSpec,
  type ClientMessageOf,
} from "../src/protocol";
import { helloFrame } from "./helpers/client";

describe("TokenBucket", () => {
  it("allows a burst, then the refill rate", () => {
    let now = 0;
    const bucket = new TokenBucket(10, 3, () => now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now += 100; // 10 / s → one token
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);
    now += 10_000; // refills to the burst, not beyond
    expect(Array.from({ length: 4 }, () => bucket.take())).toEqual([true, true, true, false]);
  });

  it("a clock that goes backwards adds no tokens", () => {
    let now = 1000;
    const bucket = new TokenBucket(10, 1, () => now);
    expect(bucket.take()).toBe(true);
    now = 0;
    expect(bucket.take()).toBe(false);
  });

  it("rejects invalid parameters", () => {
    expect(() => new TokenBucket(0, 1)).toThrow(RangeError);
    expect(() => new TokenBucket(1, 0)).toThrow(RangeError);
  });
});

describe("ConnectionRegistry", () => {
  it("bounds the total and each address, and releases on removal", () => {
    const r = new ConnectionRegistry<object>(3, 2);
    const [a1, a2, a3, b1, b2] = [{}, {}, {}, {}, {}];
    expect(r.add("a", a1)).toBe(true);
    expect(r.add("a", a2)).toBe(true);
    expect(r.check("a")).toBe("address-full");
    expect(r.add("a", a3)).toBe(false);
    expect(r.add("b", b1)).toBe(true);
    expect(r.check("c")).toBe("server-full");
    expect(r.add("b", b2)).toBe(false);
    r.remove("a", a1);
    r.remove("a", a1); // idempotent
    expect(r.size).toBe(2);
    expect(r.check("a")).toBe("ok");
    r.remove("a", a2);
    r.remove("b", b1);
    expect([r.size, r.addressCount]).toEqual([0, 0]);
  });

  it("never registers the same connection twice", () => {
    const r = new ConnectionRegistry<object>(5, 5);
    const c = {};
    expect(r.add("a", c)).toBe(true);
    expect(r.add("a", c)).toBe(false);
    expect(r.size).toBe(1);
  });
});

describe("OriginPolicy", () => {
  const policy = new OriginPolicy(["http://localhost:5173"]);

  it.each([
    ["http://localhost:5173", true],
    [undefined, false],
    ["", false],
    ["null", false],
    ["http://localhost:51730", false],
    ["http://localhost:5173.evil.test", false],
    ["https://localhost:5173", false],
    ["http://LOCALHOST:5173", false],
    [["http://localhost:5173", "http://localhost:5173"], false],
  ])("allows(%j) = %s", (origin, expected) => {
    expect(policy.allows(origin as string | string[] | undefined)).toBe(expected);
  });

  it("an empty list allows nothing", () => {
    expect(new OriginPolicy([]).allows("http://localhost:5173")).toBe(false);
  });
});

describe("answerHello", () => {
  const facts = {
    connectionId: "6b1f0c2e-3d4a-4b5c-8d6e-7f8091a2b3c4",
    nowMs: 1731940000123,
    tickHz: 60,
  };
  const hello = (min: number, max: number) => {
    const d = decodeClientFrame(helloFrame(undefined, min, max));
    if (!d.ok || d.msg.t !== "hello") throw new Error("bad hello fixture");
    return d.msg as ClientMessageOf<"hello">;
  };

  it("builds a valid welcome with no snapshot and no player", () => {
    const msg = hello(1, 3);
    const answer = answerHello(msg, facts);
    if (answer.kind !== "welcome") throw new Error("expected welcome");
    expect(answer.protocol).toBe(1);
    expect(answer.welcome).toEqual({
      v: 1,
      t: "welcome",
      re: msg.id,
      p: {
        protocol: 1,
        sessionId: facts.connectionId,
        serverTimeMs: "1731940000123",
        tickHz: 60,
      },
    });
    const encoded = encodeServerFrame({ ...answer.welcome, seq: 1, ts: "1731940000123" });
    expect(encoded.ok).toBe(true);
  });

  it("no common version → unsupported", () => {
    expect(answerHello(hello(2, 5), facts)).toEqual({ kind: "unsupported" });
  });
});

describe("REFUSALS", () => {
  it("covers every request type except hello with a transient error code", () => {
    expect(Object.keys(REFUSALS).sort()).toEqual(
      ["auth.resume", "bet.cashout", "bet.place", "bonus.pick", "ping", "sync.request"].sort(),
    );
    for (const code of Object.values(REFUSALS)) {
      expect(errorCodeSpec(code)).toMatchObject({
        outcome: "transient",
        stored: false,
        carriers: ["error"],
      });
    }
  });

  it("money commands are refused as unauthenticated", () => {
    expect([REFUSALS["bet.place"], REFUSALS["bet.cashout"], REFUSALS["bonus.pick"]]).toEqual([
      "auth-required",
      "auth-required",
      "auth-required",
    ]);
  });
});
