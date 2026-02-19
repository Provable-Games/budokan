import { ReactNode, useState, useEffect, useMemo } from "react";
import { useNetwork } from "@starknet-react/core";
import {
  initMetagame,
  MetagameProvider as MetagameSDKProvider,
} from "metagame-sdk";
import { feltToString } from "@/lib/utils";
import { ChainId, CHAINS } from "@/dojo/setup/networks";
import { manifests } from "@/dojo/setup/config";

export const MetagameProvider = ({ children }: { children: ReactNode }) => {
  const [metagameClient, setMetagameClient] = useState<any>(undefined);
  const { chain } = useNetwork();

  const chainId = useMemo(() => feltToString(chain.id), [chain.id]);

  useEffect(() => {
    const selectedChainConfig = CHAINS[chainId as ChainId];
    const manifest = manifests[chainId as ChainId];

    if (!manifest || !selectedChainConfig) {
      console.error(`No config found for chain ID: ${chainId}`);
      setMetagameClient(undefined);
      return;
    }

    // Initialize Metagame SDK
    initMetagame({
      toriiUrl: selectedChainConfig.toriiUrl!,
      worldAddress: manifest.world.address ?? "",
      tokenAddress: selectedChainConfig.denshokanAddress,
    })
      .then(setMetagameClient)
      .catch((error) => {
        console.error(
          `Failed to initialize Metagame SDK for chain ${chainId}:`,
          error
        );
        setMetagameClient(undefined);
      });
  }, [chain.id]);

  if (!metagameClient) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Initializing Metagame SDK...</p>
        </div>
      </div>
    );
  }

  return (
    <MetagameSDKProvider metagameClient={metagameClient}>
      {children}
    </MetagameSDKProvider>
  );
};
