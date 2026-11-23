// TEST ONLY (P8-3c test 16): one process of the restart test. Prints JSON, never seed material.
//   create          → new development chain, reserve 3 rounds, print the public chain id
//   resume <chain>  → a fresh process tries to continue that chain, then makes a new one
import { ChainVault } from "../../../src/fairness/chain-vault";
import { createNodeFairnessCrypto } from "../../../src/fairness/crypto-node";
import { MemoryChainStore } from "../../../src/fairness/memory-chain-store";

const code = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return "UNEXPECTED-SUCCESS";
  } catch (e) {
    return (e as { code?: string }).code ?? "no-code";
  }
};

async function main(): Promise<void> {
  const store = new MemoryChainStore({ mode: "test" });
  const vault = new ChainVault({ crypto: createNodeFairnessCrypto(), store });
  const salt = new Uint8Array(32).fill(1);
  if (process.argv[2] === "create") {
    const c = await vault.createChain({ length: 64, checkpointInterval: 16 });
    const reserved: number[] = [];
    for (const id of ["a", "b", "c"])
      reserved.push((await vault.reserveRound(c.chainId, id)).chainIndex);
    process.stdout.write(JSON.stringify({ chainId: c.chainId, reserved }));
  } else {
    const chainId = process.argv[3] as string;
    const result = {
      reserve: await code(() => vault.reserveRound(chainId, "d")),
      prepare: await code(() => vault.prepareRound(chainId, 1, salt)),
      reveal: await code(() => vault.revealRound(chainId, 1)),
      status: await code(() => vault.chainStatus(chainId)),
      freshChainId: "",
      freshFirstIndex: 0,
    };
    const fresh = await vault.createChain({ length: 64, checkpointInterval: 16 });
    result.freshChainId = fresh.chainId;
    result.freshFirstIndex = (await vault.reserveRound(fresh.chainId, "a")).chainIndex;
    process.stdout.write(JSON.stringify(result));
  }
  store.close();
  vault.dispose();
}

void main();
