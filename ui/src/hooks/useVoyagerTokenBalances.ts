import { useState, useEffect, useCallback } from "react";
import { addAddressPadding } from "starknet";

export interface VoyagerTokenBalance {
  tokenAddress: string;
  balance: string;
  symbol?: string;
  name?: string;
  decimals: number;
  logo?: string;
  usdBalance?: number;
}

interface VoyagerErc20BalanceItem {
  name: string;
  address: string;
  balance: string;
  usdBalance: string;
  usdFormattedBalance: string;
  decimals: string;
  symbol: string;
  formattedBalance: string;
  iconLogo: string;
  isVerified: boolean;
}

interface VoyagerApiResponse {
  erc20TokenBalances: VoyagerErc20BalanceItem[];
  verfiedTokensCount: number;
  totalTokensCount: number;
  totalUsdValue: string;
}

interface UseVoyagerTokenBalancesProps {
  ownerAddress: string;
  active?: boolean;
}

interface UseVoyagerTokenBalancesResult {
  balances: VoyagerTokenBalance[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Use proxy URL where API key is hidden server-side
const VOYAGER_PROXY_URL = import.meta.env.VITE_VOYAGER_PROXY_URL;

export const useVoyagerTokenBalances = ({
  ownerAddress,
  active = true,
}: UseVoyagerTokenBalancesProps): UseVoyagerTokenBalancesResult => {
  const [balances, setBalances] = useState<VoyagerTokenBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalances = useCallback(async () => {
    // Skip if inactive
    if (!active || !ownerAddress) {
      return;
    }

    // Proxy URL is required (API key is hidden server-side)
    if (!VOYAGER_PROXY_URL) {
      setError(new Error("Voyager proxy URL must be configured"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Normalize address
      const normalizedOwner = addAddressPadding(ownerAddress).toLowerCase();

      // Use proxy URL (API key is hidden server-side)
      const url = `${VOYAGER_PROXY_URL}/api/voyager/contracts/${normalizedOwner}/token-balances`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(
          `Voyager API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: VoyagerApiResponse = await response.json();

      // Map the API response to match our interface
      const mappedBalances: VoyagerTokenBalance[] = (
        data.erc20TokenBalances || []
      ).map((item) => {
        // decimals comes as hex string like "0x6"
        const decimals = parseInt(item.decimals, 16) || 18;
        const usdBalance = item.usdBalance
          ? parseFloat(item.usdBalance)
          : undefined;

        return {
          tokenAddress: item.address,
          balance: item.balance,
          symbol: item.symbol,
          name: item.name,
          decimals,
          logo: item.iconLogo,
          usdBalance,
        };
      });

      setBalances(mappedBalances);
    } catch (err) {
      console.error("Error fetching token balances from Voyager:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [ownerAddress, active]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const refetch = useCallback(() => {
    fetchBalances();
  }, [fetchBalances]);

  return {
    balances,
    loading,
    error,
    refetch,
  };
};
