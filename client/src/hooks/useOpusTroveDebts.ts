import { useState, useEffect } from "react";
import { useProvider } from "@starknet-react/core";
import { getUserTotalTroveDebt } from "@provable-games/metagame-sdk/rpc";

interface UseOpusTroveDebtsParams {
  userAddresses: string[];
  assetAddresses: string[]; // For future filtering by asset type
  enabled: boolean;
}

interface UseOpusTroveDebtsResult {
  debts: Map<string, bigint>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch Opus Trove debt for multiple user addresses.
 * Uses metagame-sdk/rpc for the Opus contract calls.
 *
 * Returns a map of user address -> total debt across all troves.
 */
export const useOpusTroveDebts = ({
  userAddresses,
  assetAddresses,
  enabled,
}: UseOpusTroveDebtsParams): UseOpusTroveDebtsResult => {
  const [debts, setDebts] = useState<Map<string, bigint>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { provider } = useProvider();

  useEffect(() => {
    const fetchDebts = async () => {
      if (!enabled || !provider || userAddresses.length === 0) {
        setDebts(new Map());
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const debtsMap = new Map<string, bigint>();

        await Promise.all(
          userAddresses.map(async (userAddress) => {
            try {
              // TODO: If assetAddresses is specified (not wildcard), filter troves by asset type
              const totalDebt = await getUserTotalTroveDebt(provider, userAddress);
              debtsMap.set(userAddress, totalDebt);
            } catch (err) {
              console.error("Error fetching trove debt for", userAddress, err);
              debtsMap.set(userAddress, 0n);
            }
          })
        );

        setDebts(debtsMap);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDebts();
  }, [enabled, provider, userAddresses.join(","), assetAddresses.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { debts, isLoading, error };
};
