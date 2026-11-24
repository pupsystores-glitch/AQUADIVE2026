// The offline preparation worker's message contract (P8-4b-0), on the TypeScript source. Pure:
// no worker, no engine. The compiled run time is tested by prep-worker.test.ts.
import { describe, expect, it } from "vitest";
import {
  MAX_IN_FLIGHT_LIMIT,
  PrepWorkerError,
  WORKER_FAILURE_CODES,
  parseMainMessage,
  parseWorkerConfig,
  parseWorkerMessage,
} from "../../src/prep/protocol";
import { ROUND_SCRIPT_ERROR_CODES } from "../../src/round/errors";

const HEX64 = "ab".repeat(32);
const SALT = "cd".repeat(32);
const config = (over: Record<string, unknown> = {}) => ({
  protocol: 1,
  mode: "development",
  chain: "random",
  chainLength: 1024,
  maxInFlight: 2,
  ...over,
});
const refused = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(PrepWorkerError);
    expect((e as PrepWorkerError).code).toBe("invalid-request");
    expect((e as PrepWorkerError).reason).toBe("contract-violation");
    return true;
  }
  return false;
};

describe("worker configuration", () => {
  it("accepts exactly the contract and freezes it", () => {
    const c = parseWorkerConfig(config());
    expect(c).toEqual(config());
    expect(Object.isFrozen(c)).toBe(true);
    expect(
      parseWorkerConfig(config({ mode: "test", chain: "public-test-vectors", chainLength: 8 })),
    ).toMatchObject({ chain: "public-test-vectors" });
    expect(MAX_IN_FLIGHT_LIMIT).toBe(2);
  });

  it.each([
    ["extra runtime", config({ runtime: {} })],
    ["extra path", config({ path: "/x" })],
    ["extra entry", config({ entry: "x.js" })],
    ["production", config({ mode: "production" })],
    ["vectors outside test", config({ chain: "public-test-vectors", chainLength: 8 })],
    ["vectors wrong length", config({ mode: "test", chain: "public-test-vectors" })],
    ["unknown chain", config({ chain: "live" })],
    ["length 0", config({ chainLength: 0 })],
    ["length too large", config({ chainLength: 65_537 })],
    ["fractional length", config({ chainLength: 1.5 })],
    ["maxInFlight 0", config({ maxInFlight: 0 })],
    ["maxInFlight 3", config({ maxInFlight: 3 })],
    ["protocol 2", config({ protocol: 2 })],
    ["missing key", { protocol: 1, mode: "development", chain: "random", chainLength: 8 }],
    ["array", []],
    ["null", null],
    ["class instance", Object.assign(new (class X {})(), config())],
  ])("refuses %s", (_name, value) => {
    expect(refused(() => parseWorkerConfig(value))).toBe(true);
  });

  it("refuses getters and symbol keys", () => {
    const getter = config();
    Object.defineProperty(getter, "mode", { get: () => "development", enumerable: true });
    expect(refused(() => parseWorkerConfig(getter))).toBe(true);
    expect(refused(() => parseWorkerConfig({ ...config(), [Symbol("x")]: 1 }))).toBe(true);
  });
});

describe("main → worker messages", () => {
  it("accepts prepare and shutdown only, with exact keys", () => {
    expect(parseMainMessage({ type: "prepare", requestId: "r-1", saltHex: SALT })).toEqual({
      type: "prepare",
      requestId: "r-1",
      saltHex: SALT,
    });
    expect(parseMainMessage({ type: "shutdown" })).toEqual({ type: "shutdown" });
  });

  it.each([
    ["chain index", { type: "prepare", requestId: "r", saltHex: SALT, chainIndex: 1 }],
    ["chain id", { type: "prepare", requestId: "r", saltHex: SALT, chainId: HEX64 }],
    ["upper-case salt", { type: "prepare", requestId: "r", saltHex: SALT.toUpperCase() }],
    ["short salt", { type: "prepare", requestId: "r", saltHex: "ab".repeat(15) }],
    ["long salt", { type: "prepare", requestId: "r", saltHex: "ab".repeat(65) }],
    ["odd salt", { type: "prepare", requestId: "r", saltHex: `${SALT}a` }],
    ["bad id", { type: "prepare", requestId: "-r", saltHex: SALT }],
    ["long id", { type: "prepare", requestId: "r".repeat(129), saltHex: SALT }],
    ["no salt", { type: "prepare", requestId: "r" }],
    ["shutdown extra", { type: "shutdown", force: true }],
    ["eval", { type: "eval", code: "1" }],
    ["load", { type: "load", path: "/x" }],
    ["string", "prepare"],
    ["null", null],
  ])("refuses %s", (_name, value) => {
    expect(refused(() => parseMainMessage(value))).toBe(true);
  });
});

describe("worker → main messages", () => {
  const ready = { type: "ready", protocol: 1, threadId: 3, chainId: HEX64, chainLength: 8, fv: 1 };
  const prepared = {
    type: "prepared",
    requestId: "r-1",
    chainIndex: 1,
    digest: HEX64,
    bytes: new Uint8Array([123, 125]),
  };
  const failed = {
    type: "failed",
    requestId: "r-1",
    code: "runner-failed",
    reason: "guard",
    indexState: "consumed",
    chainIndex: 4,
  };

  it("accepts the contract", () => {
    expect(parseWorkerMessage(ready)).toEqual(ready);
    expect(parseWorkerMessage(prepared)).toEqual(prepared);
    expect(parseWorkerMessage(failed)).toEqual(failed);
    expect(
      parseWorkerMessage({ ...failed, indexState: "untouched", chainIndex: null, reason: null }),
    ).toMatchObject({ indexState: "untouched" });
    expect(parseWorkerMessage({ type: "rejected", code: "invalid-message" })).toBeTruthy();
    expect(
      parseWorkerMessage({ type: "fatal", code: "startup-failed", reason: "x", detail: null }),
    ).toBeTruthy();
    expect(
      parseWorkerMessage({
        type: "closed",
        prepared: 1,
        failed: 0,
        lastReservedIndex: 1,
        revealedCount: 0,
        chainState: "active",
      }),
    ).toBeTruthy();
  });

  it.each([
    ["ready from the main thread id", { ...ready, threadId: 0 }],
    ["ready with a seed", { ...ready, seed: HEX64 }],
    ["prepared with a seed", { ...prepared, seed: HEX64 }],
    ["prepared with keys", { ...prepared, keys: {} }],
    ["prepared with a public part", { ...prepared, public: {} }],
    ["prepared bytes as array", { ...prepared, bytes: [123, 125] }],
    ["prepared bytes as Buffer", { ...prepared, bytes: Buffer.from([123, 125]) }],
    ["prepared index 0", { ...prepared, chainIndex: 0 }],
    ["prepared bad digest", { ...prepared, digest: "x" }],
    ["failed unknown code", { ...failed, code: "settled" }],
    ["failed free-text reason", { ...failed, reason: "crash at 2.31x" }],
    ["failed consumed without index", { ...failed, chainIndex: null }],
    ["failed untouched with index", { ...failed, indexState: "untouched" }],
    ["failed voided", { ...failed, indexState: "voided" }],
    [
      "fatal free text",
      { type: "fatal", code: "startup-failed", reason: "Error: x", detail: null },
    ],
    ["unknown type", { type: "completed", requestId: "r-1" }],
  ])("refuses %s", (_name, value) => {
    expect(refused(() => parseWorkerMessage(value))).toBe(true);
  });

  it("worker failure codes extend the round codes with fixed worker codes only", () => {
    expect(WORKER_FAILURE_CODES.slice(0, ROUND_SCRIPT_ERROR_CODES.length)).toEqual([
      ...ROUND_SCRIPT_ERROR_CODES,
    ]);
    expect(WORKER_FAILURE_CODES.slice(ROUND_SCRIPT_ERROR_CODES.length)).toEqual([
      "backpressure",
      "worker-halted",
      "shutting-down",
      "unexpected-error",
    ]);
  });
});

describe("PrepWorkerError", () => {
  it("keeps only fixed reason codes and never data", () => {
    const e = new PrepWorkerError("worker-lost", "crash at 2.31x", {
      indeterminate: true,
      chainIndex: 1.5,
    });
    expect(e.reason).toBeNull();
    expect(e.message).toBe("worker-lost");
    expect(e.indeterminate).toBe(true);
    expect(e.chainIndex).toBeNull();
    const f = new PrepWorkerError("preparation-failed", "runner-failed", {
      indexState: "consumed",
      chainIndex: 3,
    });
    expect(f.message).toBe("preparation-failed: runner-failed");
    expect(f).toMatchObject({ indeterminate: false, indexState: "consumed", chainIndex: 3 });
  });
});
