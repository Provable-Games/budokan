import { StarknetDomain } from "starknet";
import { ChainId, CHAINS } from "@/dojo/setup/networks";

export const namespace: Record<ChainId, string> = {
  [ChainId.SN_MAIN]: "budokan_relayer_0_0_12",
  [ChainId.SN_SEPOLIA]: "budokan_relayer_0_0_10",
};

export const isChainIdSupported = (chainId: ChainId): boolean => {
  return Object.keys(CHAINS).includes(chainId);
};

// starknet domain
export const makeStarknetDomain = (chainId: ChainId): StarknetDomain => ({
  name: "Budokan",
  version: "0.1.0",
  chainId: CHAINS[chainId].chainId,
  revision: "1",
});

//------------------------

export interface DojoAppConfig {
  selectedChainId: ChainId;
  namespace: string;
  starknetDomain: StarknetDomain;
}

export const makeDojoAppConfig = (chainId: ChainId): DojoAppConfig => {
  return {
    selectedChainId: chainId,
    namespace: namespace[chainId],
    starknetDomain: makeStarknetDomain(chainId),
  };
};
