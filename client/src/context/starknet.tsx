"use client";
import { useMemo } from "react";
import { Chain } from "@starknet-react/chains";
import {
  jsonRpcProvider,
  StarknetConfig,
  argent,
  braavos,
} from "@starknet-react/core";
import React from "react";
import { ChainId, CHAINS, getDefaultChainId } from "@/dojo/setup/networks";
import { initializeController } from "@/dojo/setup/controllerSetup";
import { manifests } from "@/dojo/setup/config";

// Initialize controller outside component - always mainnet
const initController = () => {
  try {
    const chainRpcUrls: { rpcUrl: string }[] = Object.values(CHAINS)
      .map((chain) => ({
        rpcUrl: chain?.chain?.rpcUrls.default.http[0] ?? "",
      }));

    return initializeController(
      chainRpcUrls,
      ChainId.SN_MAIN,
      manifests[ChainId.SN_MAIN]
    );
  } catch (error) {
    console.error(
      "Failed to initialize controller:",
      error
    );
    return undefined;
  }
};

// Initialize controller once
const controller = initController();

export function StarknetProvider({ children }: { children: React.ReactNode }) {
  const defaultChainId = getDefaultChainId();

  // Create provider with memoization
  const provider = jsonRpcProvider({
    rpc: (chain: Chain) => {
      switch (chain) {
        case CHAINS[ChainId.SN_MAIN].chain:
          return {
            nodeUrl: CHAINS[ChainId.SN_MAIN].chain?.rpcUrls.default.http[0],
          };
        case CHAINS[ChainId.SN_SEPOLIA].chain:
          return {
            nodeUrl: CHAINS[ChainId.SN_SEPOLIA].chain?.rpcUrls.default.http[0],
          };
        default:
          throw new Error(`Unsupported chain: ${chain.network}`);
      }
    },
  });

  // Prepare chains based on environment
  const chains = useMemo(() => {
    // Put the default chain first in the array
    // This ensures useNetwork() returns the correct chain when no wallet is connected
    const defaultChain = CHAINS[defaultChainId]?.chain;
    const otherChains = Object.values(CHAINS)
      .filter((config) => config.chainId !== defaultChainId)
      .map((config) => config.chain!)
      .filter(Boolean);

    return [defaultChain!, ...otherChains];
  }, [defaultChainId]);

  // Combine all available connectors
  const connectors = useMemo(() => {
    const availableConnectors = [];

    if (controller) {
      availableConnectors.push(controller);
      availableConnectors.push(argent());
      availableConnectors.push(braavos());
    }

    return availableConnectors.filter(Boolean);
  }, []);

  // Get default provider chain
  const defaultChain = CHAINS[defaultChainId]?.chain;

  if (!defaultChain) {
    console.error(`No chain configuration found for ${defaultChainId}`);
    return null;
  }


  return (
    <StarknetConfig
      autoConnect
      chains={chains}
      connectors={connectors}
      provider={provider}
    >
      {children}
    </StarknetConfig>
  );
}
