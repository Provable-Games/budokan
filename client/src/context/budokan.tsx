import { useMemo } from "react";
import { BudokanProvider as SdkBudokanProvider, useBudokanClient } from "@provable-games/budokan-sdk/react";
import type { BudokanClientConfig } from "@provable-games/budokan-sdk";
import { useNetwork } from "@starknet-react/core";
import { CHAINS, ChainId, getDefaultChainId } from "@/chain/setup/networks";

export { useBudokanClient };

export function BudokanProvider({ children }: { children: React.ReactNode }) {
  const { chain } = useNetwork();

  const config = useMemo<BudokanClientConfig>(() => {
    // Resolve chain ID from connected wallet or default
    let chainId = getDefaultChainId();
    if (chain) {
      const matched = Object.entries(CHAINS).find(
        ([, cfg]) => cfg.chain && BigInt(cfg.chain.id) === BigInt(chain.id),
      );
      if (matched) chainId = matched[0] as ChainId;
    }

    const chainConfig = CHAINS[chainId];
    const sdkChain = chainId === ChainId.SN_MAIN ? "mainnet" : "sepolia";

    return {
      chain: sdkChain,
      apiBaseUrl: chainConfig.budokanApiUrl ?? "",
      rpcUrl: chainConfig.rpcUrl ?? "",
      budokanAddress: chainConfig.budokanAddress ?? "",
    };
  }, [chain]);

  return (
    <SdkBudokanProvider config={config}>
      {children}
    </SdkBudokanProvider>
  );
}
