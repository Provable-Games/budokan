import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNetwork } from "@starknet-react/core";
import { CHAINS, ChainId, getDefaultChainId } from "@/chain/setup/networks";
import { createDenshokanClient, type DenshokanClient, type DenshokanClientConfig } from "@provable-games/denshokan-sdk";
import { DenshokanProvider as SdkDenshokanProvider, useDenshokanClient } from "@provable-games/denshokan-sdk/react";

export function DenshokanProvider({ children }: { children: ReactNode }) {
  const { chain } = useNetwork();

  const client = useMemo(() => {
    let chainId = getDefaultChainId();
    if (chain) {
      const matched = Object.entries(CHAINS).find(
        ([, cfg]) => cfg.chain && BigInt(cfg.chain.id) === BigInt(chain.id),
      );
      if (matched) chainId = matched[0] as ChainId;
    }

    const chainConfig = CHAINS[chainId];
    const sdkChain = chainId === ChainId.SN_MAIN ? "mainnet" : "sepolia";

    const config: DenshokanClientConfig = {
      chain: sdkChain,
      apiUrl: chainConfig.denshokanApiUrl,
      rpcUrl: chainConfig.rpcUrl,
      denshokanAddress: chainConfig.denshokanAddress,
    };

    return createDenshokanClient(config);
  }, [chain]);

  return (
    <SdkDenshokanProvider client={client}>
      {children}
    </SdkDenshokanProvider>
  );
}

// Re-export the SDK hook so existing imports from "@/context/denshokan" still work
export { useDenshokanClient };
