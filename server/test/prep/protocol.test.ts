// The offline preparation worker's message contract (P8-4b-0), on the TypeScript source. Pure:
// no worker, no engine. The compiled run time is tested by prep-worker.test.ts.
import { describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MAX_IN_FLIGHT_LIMIT,
  MAX_SCRIPT_BYTES,
  PrepWorkerError,
  WORKER_FAILURE_CODES,
  parseMainMessage,
  parseWorkerConfig,
  parseWorkerMessage,
} from "../../src/prep/protocol";
import { ROUND_SCRIPT_ERROR_CODES } from "../../src/round/errors";
import { MAX_ROUND_SCRIPT_BYTES } from "../../src/round/round-script";

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

  describe("prepared bytes (P8-4b-1: a deliberate narrowing of the P8-4b-0 contract)", () => {
    // P8-4b-0 accepted any plain Uint8Array of 2 … 4 MiB. Since P8-4b-1 the bytes must also be
    // the whole of their own non-shared, fixed-length ArrayBuffer — exactly what a transfer of
    // the worker's fresh copy yields — and at most the proved 196,608 bytes.
    const view = (buffer: ArrayBufferLike, offset = 0, length?: number) => {
      const v = new Uint8Array(buffer, offset, length);
      v.fill(0x20);
      return v;
    };
    const withBytes = (bytes: unknown) => ({ ...prepared, bytes });

    it("accepts a whole plain buffer up to the proved cap", () => {
      expect(MAX_SCRIPT_BYTES).toBe(196_608);
      expect(MAX_SCRIPT_BYTES).toBe(MAX_ROUND_SCRIPT_BYTES);
      for (const n of [2, 1000, MAX_SCRIPT_BYTES]) {
        expect(parseWorkerMessage(withBytes(view(new ArrayBuffer(n)))).type).toBe("prepared");
      }
      // what the worker's transfer yields
      const sent = Uint8Array.from([123, 125]);
      const received = structuredClone({ ...prepared, bytes: sent }, { transfer: [sent.buffer] });
      expect(parseWorkerMessage(received).type).toBe("prepared");
    });

    it.each([
      ["a SharedArrayBuffer view", () => view(new SharedArrayBuffer(64))],
      [
        "a growable SharedArrayBuffer view",
        () => {
          const sab = new (SharedArrayBuffer as any)(64, { maxByteLength: 128 });
          return view(sab);
        },
      ],
      [
        "a resizable ArrayBuffer view",
        () => view(new (ArrayBuffer as any)(64, { maxByteLength: 128 })),
      ],
      [
        "a length-tracking view",
        () => new Uint8Array(new (ArrayBuffer as any)(64, { maxByteLength: 128 })),
      ],
      ["an offset view", () => view(new ArrayBuffer(64), 1)],
      ["a partial view", () => view(new ArrayBuffer(64), 0, 63)],
      ["an inner view", () => view(new ArrayBuffer(64), 8, 16)],
      ["one byte over the cap", () => view(new ArrayBuffer(MAX_SCRIPT_BYTES + 1))],
      ["the old 4 MiB maximum", () => view(new ArrayBuffer(4 * 1024 * 1024))],
      ["one byte", () => view(new ArrayBuffer(1))],
      [
        "a detached buffer",
        () => {
          const v = view(new ArrayBuffer(64));
          structuredClone(v.buffer, { transfer: [v.buffer] });
          return v;
        },
      ],
      [
        "a view with a lying length",
        () => {
          const v = view(new ArrayBuffer(MAX_SCRIPT_BYTES + 64));
          Object.defineProperty(v, "length", { value: 64 });
          Object.defineProperty(v, "byteLength", { value: 64 });
          return v;
        },
      ],
    ])("refuses %s", (_name, make) => {
      expect(refused(() => parseWorkerMessage(withBytes(make())))).toBe(true);
    });
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
