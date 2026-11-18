// TEST ONLY: prints a deterministic JSON digest of fairness outputs, so determinism.test.ts can
// compare independent executions (separate Node processes) byte for byte.
// Run directly with Node's type stripping: node src/fairness/test/vector-dump.ts <provider>
// where <provider> is "node" (node:crypto) or "reference" (pure-TypeScript SHA-256).
import { createChainCommitment, computeRoundSeed } from "../chain.ts";
import type { FairnessHashProvider } from "../crypto.ts";
import { RoundDerivation } from "../derive.ts";
import { bytesToHex, hexToBytes } from "../encoding.ts";
import { SecretBytes } from "../secret.ts";
import { FAIRNESS_DEV_VECTORS_V1 as V } from "../vectors.ts";
import { FAIRNESS_PURPOSES, PURPOSE_DRAW_LIMITS_V1 } from "../version.ts";
import { nodeHashProvider } from "./node-provider.ts";
import { referenceHashProvider } from "./sha256-reference.ts";

/** Every draw of every purpose at its full limit, for every round index of the dev chain. */
export function dumpAll(provider: FairnessHashProvider): string {
  const seed = SecretBytes.fromBytes(hexToBytes(V.seedHex));
  const commitment = createChainCommitment(provider, seed, V.chainLength);
  const rounds: Record<string, Record<string, string>> = {};
  for (let index = 1; index <= V.chainLength; index++) {
    for (const saltHex of [V.saltAHex, V.saltBHex]) {
      const d = RoundDerivation.create(provider, {
        fv: 1,
        chainId: commitment.chainId,
        chainIndex: index,
        salt: hexToBytes(saltHex),
        roundSeed: computeRoundSeed(provider, seed, V.chainLength, index),
      });
      const perPurpose: Record<string, string> = {};
      for (const purpose of FAIRNESS_PURPOSES) {
        const stream = d.openStream(purpose);
        const bytes = new Uint8Array(PURPOSE_DRAW_LIMITS_V1[purpose] * 8);
        const view = new DataView(bytes.buffer);
        for (let k = 0; k < PURPOSE_DRAW_LIMITS_V1[purpose]; k++)
          view.setFloat64(8 * k, stream.next(), false);
        perPurpose[purpose] = bytesToHex(provider.sha256(bytes));
      }
      rounds[`${index}:${saltHex.slice(0, 8)}`] = perPurpose;
    }
  }
  return JSON.stringify({ chainId: bytesToHex(commitment.chainId), rounds });
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1]?.replace(/\\/g, "/").endsWith("test/vector-dump.ts");
if (isMain) {
  const which = process.argv[2] === "reference" ? referenceHashProvider : nodeHashProvider;
  process.stdout.write(dumpAll(which));
}
