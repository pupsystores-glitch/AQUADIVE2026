// REGRESSION PINS (P8-3b): canonical reference-round record hashes for the P8-3a development
// chain (FAIRNESS_DEV_VECTORS_V1), rounds 1 … 8 per salt. PUBLIC, NON-SECRET development values.
//
// These are produced by the reference runner itself, so they are NOT an independent oracle (that
// is `independent-vectors.ts`). They pin the complete record — outcome, terminal tick, goldfish,
// final world, draw counts — so that any change to the engine, the binding, the stream wiring
// or the runner shows up as a failed replay test. Never regenerate them to make a test pass
// without the owner's approval of the change that moved them.

export const REPLAY_RECORD_PINS: readonly (readonly ["A" | "B", number, string])[] = [
  ["A", 1, "97727a163ff31b75d8687951a870dcc1da69089bc4cc165be9695f714ac3e31d"],
  ["A", 2, "c5c0d316aeacb3c9743bf6eeef42567566f70b282f99acb7738c15ab590c201f"],
  ["A", 3, "3cf114c33199ef0ef98ec65b74e18816da6889a83ef94a15eff219af4d811908"],
  ["A", 4, "28a503d47c642661660ec9686f4e815cd123a2b72d72aafa0b3be53f624b3bc0"],
  ["A", 5, "17e2787113c29a323e1b37bf59c25287f5ae371fbed002a1f9fe118841345d42"],
  ["A", 6, "c367a5f80c87d3ef9d429354122a4884fdc7de17a0391f70140c3dc6496d6ef9"],
  ["A", 7, "c9042f5446a548f8fdc7b9371f7b8bce86a70d71ba9f3f6300281f5c437053ea"],
  ["A", 8, "bd58fca6bc68ee7fd826843fcb12bd92d149da9afa2bfb5835d58761970f5907"],
  ["B", 1, "7ed768fe29947ef3f78919ec87f8a759ea6c9d98b019fe9bf59a0e92c012e6f7"],
  ["B", 2, "029396889515feeca63525517f00e008b085081dd93145a97217c29caed8b7e1"],
  ["B", 3, "10ad9cf58ba3ffa44eaa5ed473ae5e2e644fbb00455f6991a9f830de54f4bd8f"],
  ["B", 4, "5670afbcd6b9856b33bca80118f8acb7eec79097cb19f85899f6b29a1f8c336e"],
  ["B", 5, "d6eb61526493365e457a7a2bc8cfcac3270b022b4accc092169b23d0d4d2e3db"],
  ["B", 6, "88b087193b0c860d68679cf585a5f2e343f30151fa5e011dafb864b58a97e95f"],
  ["B", 7, "93270eb0d1b4e17231565bf4adae19154f7cd911896e53db621844346648e1f0"],
  ["B", 8, "ead2f4afe52d1860c825b97ec49a5d895c24c8d766eb3f177a273e0b66af3206"],
];
