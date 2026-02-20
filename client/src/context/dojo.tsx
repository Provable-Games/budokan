import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { SDK, init } from "@dojoengine/sdk";
import { SchemaType } from "@/generated/models.gen";
import {
  DojoChainConfig,
  ChainId,
  getDefaultChainId,
} from "@/dojo/setup/networks";
import { useNetwork } from "@starknet-react/core";
import { CHAINS } from "@/dojo/setup/networks";
import { feltToString } from "@/lib/utils";
import { makeDojoAppConfig } from "@/dojo/setup/config";

interface DojoContextType {
  sdk: SDK<SchemaType>;
  selectedChainConfig: DojoChainConfig;
  namespace: string;
}

export const DojoContext = createContext<DojoContextType | null>(null);

export const DojoContextProvider = ({ children }: { children: ReactNode }) => {
  const [sdk, setSdk] = useState<SDK<SchemaType> | undefined>(undefined);
  const currentValue = useContext(DojoContext);
  const { chain } = useNetwork();

  if (currentValue) {
    throw new Error("DojoProvider can only be used once");
  }

  const chainId = useMemo(() => {
    // If wallet is connected, use wallet's chain
    if (chain?.id) {
      return feltToString(chain.id);
    }
    // Otherwise, use URL parameter or environment default
    return getDefaultChainId();
  }, [chain]);

  // Get the chain config for the current chain
  const selectedChainConfig = useMemo(() => {
    return CHAINS[chainId! as ChainId];
  }, [chainId]);

  const appConfig = useMemo(() => {
    return makeDojoAppConfig(chainId! as ChainId);
  }, [chainId]);

  // Reset SDK when chain changes
  useEffect(() => {
    setSdk(undefined);

    init<SchemaType>({
      client: {
        toriiUrl: selectedChainConfig.toriiUrl!,
        worldAddress: "0x0",
      },
      domain: {
        name: "WORLD_NAME",
        version: "1.0",
        chainId: chainId || "KATANA",
        revision: "1",
      },
    })
      .then(setSdk)
      .catch((error) => {
        console.error(`Failed to initialize SDK for chain ${chainId}:`, error);
      });
  }, [selectedChainConfig, chainId]);

  const isLoading = sdk === undefined;

  // Don't render until SDK is loaded
  if (isLoading) {
    return null;
  }

  return (
    <DojoContext.Provider
      value={{
        sdk,
        selectedChainConfig,
        namespace: appConfig.namespace,
      }}
    >
      {children}
    </DojoContext.Provider>
  );
};

export const useDojo = () => {
  const context = useContext(DojoContext);

  if (!context) {
    throw new Error("The `useDojo` hook must be used within a `DojoProvider`");
  }

  return context;
};
