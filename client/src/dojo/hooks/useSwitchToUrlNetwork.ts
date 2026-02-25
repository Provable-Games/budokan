import { useEffect, useRef } from "react";
import { useAccount, useNetwork } from "@starknet-react/core";
import { feltToString } from "@/lib/utils";
import { ChainId, getDefaultChainId } from "@/dojo/setup/networks";
import { useSwitchNetwork } from "./useChain";

/**
 * Hook to switch to the network specified in URL on initial wallet connection
 * Only runs ONCE when wallet first connects
 */
export const useSwitchToUrlNetwork = () => {
  const { chain } = useNetwork();
  const { isConnected } = useAccount();
  const { switchToMainnet, switchToSepolia } = useSwitchNetwork();
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run once on initial connection
    if (hasRunRef.current) {
      return;
    }

    // Wait for connection
    if (!isConnected || !chain) {
      return;
    }

    const currentChainId = feltToString(chain.id) as ChainId;
    const targetChainId = getDefaultChainId();

    // Only switch if they don't match and both are mainnet/sepolia
    if (
      currentChainId !== targetChainId &&
      (currentChainId === ChainId.SN_MAIN || currentChainId === ChainId.SN_SEPOLIA) &&
      (targetChainId === ChainId.SN_MAIN || targetChainId === ChainId.SN_SEPOLIA)
    ) {
      hasRunRef.current = true;

      const switchPromise = targetChainId === ChainId.SN_SEPOLIA
        ? switchToSepolia()
        : switchToMainnet();

      switchPromise
        .catch((err) => {
          console.error("[useSwitchToUrlNetwork] Failed to switch network:", err);
          hasRunRef.current = false; // Allow retry on error
        });
    } else {
      hasRunRef.current = true;
    }
  }, [chain, isConnected, switchToMainnet, switchToSepolia]);
};
