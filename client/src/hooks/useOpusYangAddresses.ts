import { useState, useEffect } from "react";
import { useProvider } from "@starknet-react/core";
import { getOpusYangAddresses } from "@provable-games/metagame-sdk/rpc";

interface UseOpusYangAddressesParams {
  chainId: string;
  enabled?: boolean;
}

interface UseOpusYangAddressesResult {
  yangAddresses: string[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Live list of Opus collateral (yang) addresses from the Sentinel contract.
 *
 * Only queries on mainnet (Opus is mainnet-only). Returns an empty list on
 * other chains or if the call fails.
 */
export const useOpusYangAddresses = ({
  chainId,
  enabled = true,
}: UseOpusYangAddressesParams): UseOpusYangAddressesResult => {
  const { provider } = useProvider();
  const [yangAddresses, setYangAddresses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !provider || chainId !== "SN_MAIN") {
      setYangAddresses([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getOpusYangAddresses(provider)
      .then((addresses) => {
        if (cancelled) return;
        setYangAddresses(addresses);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error fetching Opus yang addresses:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, provider, chainId]);

  return { yangAddresses, isLoading, error };
};
