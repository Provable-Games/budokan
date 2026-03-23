import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
} from "react";
import {
  ChainConfig,
  ChainId,
  getDefaultChainId,
} from "@/chain/setup/networks";
import { useNetwork } from "@starknet-react/core";
import { CHAINS } from "@/chain/setup/networks";
import { feltToString } from "@/lib/utils";
import { makeAppConfig } from "@/chain/setup/config";

interface ChainContextType {
  selectedChainConfig: ChainConfig;
  namespace: string;
}

export const ChainContext = createContext<ChainContextType | null>(null);

export const ChainContextProvider = ({ children }: { children: ReactNode }) => {
  const currentValue = useContext(ChainContext);
  const { chain } = useNetwork();

  if (currentValue) {
    throw new Error("ChainContextProvider can only be used once");
  }

  const chainId = useMemo(() => {
    if (chain?.id) {
      return feltToString(chain.id);
    }
    return getDefaultChainId();
  }, [chain]);

  const selectedChainConfig = useMemo(() => {
    return CHAINS[chainId! as ChainId];
  }, [chainId]);

  const appConfig = useMemo(() => {
    return makeAppConfig(chainId! as ChainId);
  }, [chainId]);

  return (
    <ChainContext.Provider
      value={{
        selectedChainConfig,
        namespace: appConfig.namespace,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
};

export const useChainConfig = () => {
  const context = useContext(ChainContext);

  if (!context) {
    throw new Error("The `useChainConfig` hook must be used within a `ChainContextProvider`");
  }

  return context;
};
