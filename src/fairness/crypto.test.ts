// Published SHA-256 and HMAC-SHA256 vectors (P8-3a §5), run against node:crypto (OpenSSL) and the
// independent test-only pure-TypeScript implementation, plus the provider-validation contract.
import { describe, expect, it } from "vitest";
import {
  assertHashProviderKnownAnswers,
  keyedHmac,
  sha256,
  type FairnessHashProvider,
} from "./crypto.ts";
import { bytesToHex, hexToBytes } from "./encoding.ts";
import { SecretBytes } from "./secret.ts";
import { nodeHashProvider } from "./test/node-provider.ts";
import { referenceHashProvider } from "./test/sha256-reference.ts";
import { FairnessError } from "./version.ts";

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const repeat = (byte: number, n: number) => new Uint8Array(n).fill(byte);

// FIPS 180-2 Appendix B (B.1, B.2, B.3) and the empty-message digest; NIST CSRC examples.
const SHA256_VECTORS: { name: string; data: Uint8Array; out: string }[] = [
  {
    name: "empty",
    data: new Uint8Array(0),
    out: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    name: "B.1 abc",
    data: ascii("abc"),
    out: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  },
  {
    name: "B.2 448-bit",
    data: ascii("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    out: "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  },
  {
    name: "896-bit",
    data: ascii(
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    ),
    out: "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
  },
  {
    name: "B.3 one million 'a'",
    data: repeat(0x61, 1_000_000),
    out: "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
  },
];

// RFC 4231 §4.2 – §4.8 (HMAC-SHA-256 outputs; test case 5 is truncated to 128 bits by the RFC).
const HMAC_VECTORS: { tc: number; key: string; data: string; out: string; truncate?: number }[] = [
  {
    tc: 1,
    key: "0b".repeat(20),
    data: bytesToHex(ascii("Hi There")),
    out: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  },
  {
    tc: 2,
    key: bytesToHex(ascii("Jefe")),
    data: bytesToHex(ascii("what do ya want for nothing?")),
    out: "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  },
  {
    tc: 3,
    key: "aa".repeat(20),
    data: "dd".repeat(50),
    out: "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
  },
  {
    tc: 4,
    key: "0102030405060708090a0b0c0d0e0f10111213141516171819",
    data: "cd".repeat(50),
    out: "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b",
  },
  {
    tc: 5,
    key: "0c".repeat(20),
    data: bytesToHex(ascii("Test With Truncation")),
    out: "a3b6167473100ee06e0c796c2955552b",
    truncate: 16,
  },
  {
    tc: 6,
    key: "aa".repeat(131),
    data: bytesToHex(ascii("Test Using Larger Than Block-Size Key - Hash Key First")),
    out: "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
  },
  {
    tc: 7,
    key: "aa".repeat(131),
    data: bytesToHex(
      ascii(
        "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.",
      ),
    ),
    out: "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
  },
];

const PROVIDERS: [string, FairnessHashProvider][] = [
  ["node:crypto (OpenSSL)", nodeHashProvider],
  ["pure-TypeScript reference", referenceHashProvider],
];

describe.each(PROVIDERS)("published vectors — %s", (_name, provider) => {
  it.each(SHA256_VECTORS)("SHA-256 $name", ({ data, out }) => {
    expect(bytesToHex(provider.sha256(data))).toBe(out);
  });

  it.each(HMAC_VECTORS)("HMAC-SHA256 RFC 4231 test case $tc", ({ key, data, out, truncate }) => {
    const tag = provider.hmacSha256(hexToBytes(key))(hexToBytes(data));
    expect(bytesToHex(truncate ? tag.slice(0, truncate) : tag)).toBe(out);
  });

  it("passes the known-answer self-test", () => {
    expect(() => assertHashProviderKnownAnswers(provider)).not.toThrow();
  });

  it("keyed HMAC is reusable: the same tag for repeated calls", () => {
    const mac = provider.hmacSha256(hexToBytes("0b".repeat(20)));
    const a = bytesToHex(mac(ascii("Hi There")));
    expect(bytesToHex(mac(ascii("Hi There")))).toBe(a);
  });
});

describe("provider validation", () => {
  const broken = (patch: Partial<FairnessHashProvider>): FairnessHashProvider => ({
    ...nodeHashProvider,
    ...patch,
  });

  it("rejects a provider that fails a SHA-256 known answer", () => {
    const p = broken({ sha256: () => new Uint8Array(32) });
    expect(() => assertHashProviderKnownAnswers(p)).toThrow(FairnessError);
  });

  it("rejects a provider that fails an HMAC known answer", () => {
    const p = broken({ hmacSha256: () => () => new Uint8Array(32) });
    expect(() => assertHashProviderKnownAnswers(p)).toThrowError(/crypto-provider-failed/);
  });

  it("rejects a provider that throws", () => {
    const p = broken({
      sha256: () => {
        throw new Error("boom");
      },
    });
    expect(() => assertHashProviderKnownAnswers(p)).toThrowError(/crypto-provider-failed/);
  });

  it("rejects wrong output types and lengths", () => {
    expect(() =>
      sha256(broken({ sha256: () => new Uint8Array(31) }), new Uint8Array(1)),
    ).toThrowError(/crypto-provider-failed/);
    expect(() =>
      sha256(broken({ sha256: () => [1, 2] as unknown as Uint8Array }), new Uint8Array(1)),
    ).toThrowError(/crypto-provider-failed/);
    const key = SecretBytes.fromBytes(new Uint8Array(32).fill(7));
    const mac = keyedHmac(broken({ hmacSha256: () => () => new Uint8Array(33) }), key);
    expect(() => mac(new Uint8Array(1))).toThrowError(/crypto-provider-failed/);
    expect(() =>
      keyedHmac(broken({ hmacSha256: () => null as unknown as () => Uint8Array }), key),
    ).toThrowError(/crypto-provider-failed/);
  });

  it("keyedHmac only accepts a SecretBytes key", () => {
    expect(() =>
      keyedHmac(nodeHashProvider, new Uint8Array(32) as unknown as SecretBytes),
    ).toThrowError(/invalid-bytes/);
  });

  it("keyedHmac hands the provider a copy, never the wrapper's own buffer", () => {
    let received: Uint8Array | null = null;
    const key = SecretBytes.fromBytes(new Uint8Array(32).fill(9));
    keyedHmac(
      broken({
        hmacSha256: (k) => {
          received = k;
          return nodeHashProvider.hmacSha256(k);
        },
      }),
      key,
    );
    (received as unknown as Uint8Array).fill(0);
    expect(key.reveal()[0]).toBe(9);
  });
});
