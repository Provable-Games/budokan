import { useEffect } from "react";
import { useNetwork } from "@starknet-react/core";
import { useNavigate, useLocation } from "react-router-dom";
import { feltToString } from "@/lib/utils";
import { ChainId } from "@/dojo/setup/networks";

/**
 * Hook to keep URL network parameter in sync with wallet network
 * Updates URL immediately when network changes
 */
export const useSyncNetworkUrl = () => {
  const { chain } = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!chain) return;

    const chainId = feltToString(chain.id) as ChainId;

    // Always update URL to match current network for mainnet and sepolia
    if (chainId === ChainId.SN_MAIN || chainId === ChainId.SN_SEPOLIA) {
      // Use a small delay to ensure React Router is ready
      const timeoutId = setTimeout(() => {
        const currentParams = new URLSearchParams(window.location.search);
        const currentNetworkParam = currentParams.get("network");

        // Determine what the network param should be
        const expectedNetworkParam = chainId === ChainId.SN_SEPOLIA ? "sepolia" : null;

        // Only update if the URL doesn't match the expected state
        if (currentNetworkParam !== expectedNetworkParam) {
          const params = new URLSearchParams(window.location.search);
          if (chainId === ChainId.SN_SEPOLIA) {
            params.set("network", "sepolia");
          } else {
            params.delete("network");
          }

          const newSearch = params.toString();
          const newUrl = newSearch ? `${location.pathname}?${newSearch}` : location.pathname;

          navigate(newUrl, { replace: true });
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [chain, navigate, location.pathname]);
};
