import { useEffect, useRef } from "react";
import { useNetwork } from "@starknet-react/core";
import { useDojoStore } from "@/dojo/hooks/useDojoStore";
import { useNavigate } from "react-router-dom";

/**
 * Hook to reset the Dojo store when the network changes
 * This ensures queries are refetched with new network data
 */
export const useResetDojoOnNetworkChange = () => {
  const { chain } = useNetwork();
  const navigate = useNavigate();
  const previousChainRef = useRef<string | undefined>(chain?.id.toString());
  const state = useDojoStore((state) => state);

  useEffect(() => {
    if (chain) {
      const currentChainId = chain.id.toString();

      // Check if chain has changed
      if (
        previousChainRef.current &&
        previousChainRef.current !== currentChainId
      ) {
        console.log(
          `Network changed from ${previousChainRef.current} to ${currentChainId}`
        );

        // Reset the entities store to an empty object
        state.resetStore();

        // Navigate to homepage
        navigate("/", { replace: true });
      }

      // Update the previous chain ref
      previousChainRef.current = currentChainId;
    }
  }, [chain, navigate, state]);
};
