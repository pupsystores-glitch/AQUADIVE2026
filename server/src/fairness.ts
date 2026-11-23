// The server's single bridge to the shared fairness library (P8-3c-0).
//
// `src/fairness` (P8-3a / P8-3b-0; fv = 1 INTERNAL AND EXPERIMENTAL) is consumed from its
// original source through its public barrel `index.ts` only: never copied, never through a
// private module, never through an `@/` alias. This file is the only server module that reaches
// it; server/test/boundaries.test.ts and src/fairness/security.test.ts enforce both rules. The
// server's fairness modules (server/src/fairness/) import from here.
//
// Build: the fairness source uses explicit relative `.ts` imports. The server's tsc build accepts
// them (`allowImportingTsExtensions`) and emits them as `.js` (`rewriteRelativeImportExtensions`)
// into dist/src/fairness/, so the built server never loads a `.ts` file at run time.
//
// Not connected: nothing in the application startup (main.ts, app.ts), the HTTP routes or the
// WebSocket gateway imports this bridge or server/src/fairness (a boundary test checks it).

export {
  FAIRNESS_DEV_VECTORS_V1,
  FAIRNESS_PURPOSES,
  FAIRNESS_STATUS,
  FAIRNESS_VERSION,
  FairnessError,
  HASH_BYTES,
  MAX_SALT_BYTES,
  MIN_SALT_BYTES,
  PURPOSE_DRAW_LIMITS_V1,
  REDACTED,
  RoundDerivation,
  SecretBytes,
  assertChainLength,
  assertHashProviderKnownAnswers,
  assertSupportedVersion,
  bytesEqual,
  bytesToHex,
  computeRoundSeed,
  createChainCommitment,
  deriveBlock,
  generateChainSeed,
  hexToBytes,
  sha256,
  verifyChainLink,
  verifySeedAgainstCommitment,
  type ChainCommitment,
  type FairnessErrorCode,
  type FairnessHashProvider,
  type KeyedHmac,
  type SecureRandomSource,
} from "../../src/fairness/index.ts";
