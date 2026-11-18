// Public surface of src/fairness (P8-3a — docs/09 §38, README.md).
//
// A pure, engine-independent cryptographic foundation: SHA-256 reverse hash chain, canonical
// binary encoding, domain-separated HMAC-SHA256 derivation and purpose-separated streams.
// fv = 1 is INTERNAL AND EXPERIMENTAL: not frozen, published or activated, and not connected to
// gameplay. Nothing in the application imports this module. Crypto is injected (crypto.ts).

export {
  DRAWS_PER_BLOCK,
  FAIRNESS_PURPOSES,
  FAIRNESS_STATUS,
  FAIRNESS_VERSION,
  FairnessError,
  HASH_BYTES,
  MAX_BLOCK_COUNTER,
  MAX_CHAIN_INDEX,
  MAX_CHAIN_LENGTH,
  MAX_PURPOSE_BYTES,
  MAX_SALT_BYTES,
  MIN_SALT_BYTES,
  PURPOSE_DRAW_LIMITS_V1,
  SUPPORTED_FAIRNESS_VERSIONS,
  assertSupportedVersion,
  purposeDrawLimit,
  type FairnessErrorCode,
  type FairnessPurpose,
} from "./version.ts";
export {
  DOMAIN_TAG,
  MESSAGE_KIND_STREAM_BLOCK,
  bytesEqual,
  bytesToHex,
  decodeBlockMessage,
  encodeBlockMessage,
  hexToBytes,
  type BlockMessageFields,
} from "./encoding.ts";
export {
  assertHashProviderKnownAnswers,
  keyedHmac,
  sha256,
  type FairnessHashProvider,
  type KeyedHmac,
  type SecureRandomSource,
} from "./crypto.ts";
export { REDACTED, SecretBytes } from "./secret.ts";
export {
  assertChainLength,
  assertNextChainIndex,
  computeRoundSeed,
  createChainCommitment,
  generateChainSeed,
  verifyChainLink,
  verifyRevealSequence,
  verifySeedAgainstCommitment,
  type ChainCommitment,
  type ChainFailureCode,
  type ChainVerification,
  type RevealedSeed,
  type VerifiedAnchor,
} from "./chain.ts";
export {
  RoundDerivation,
  deriveBlock,
  maxBlockCounter,
  type RoundDerivationInput,
} from "./derive.ts";
export { SeededStream, top52, unitFromBlock, type BlockSource } from "./seeded-rng.ts";
export { FAIRNESS_DEV_VECTORS_V1, UNIT_BOUNDARY_VECTORS_V1 } from "./vectors.ts";
