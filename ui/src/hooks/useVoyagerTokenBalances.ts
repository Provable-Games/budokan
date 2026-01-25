import { useState, useEffect, useCallback, useRef } from "react";
import { addAddressPadding } from "starknet";

export interface VoyagerTokenBalance {
  tokenAddress: string;
  balance: string;
  decimals: number;
  name?: string;
  symbol?: string;
  logo?: string;
  usdBalance?: number;
  formattedBalance?: string;
  isVerified?: boolean;
}

// Raw API response from Voyager
interface VoyagerApiTokenBalance {
  address: string;
  balance: string;
  decimals: string; // Hex string like "0x6"
  name?: string;
  symbol?: string;
  iconLogo?: string;
  usdBalance?: string;
  formattedBalance?: string;
  isVerified?: boolean;
  [key: string]: unknown;
}

interface VoyagerApiResponse {
  erc20TokenBalances: VoyagerApiTokenBalance[];
  verfiedTokensCount?: number;
  totalTokensCount?: number;
  totalUsdValue?: string;
}

interface UseVoyagerTokenBalancesProps {
  walletAddress: string;
  active?: boolean;
}

interface UseVoyagerTokenBalancesResult {
  balances: VoyagerTokenBalance[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  getBalance: (tokenAddress: string) => bigint;
}

// Use proxy URL if configured, otherwise fall back to direct API access
const VOYAGER_PROXY_URL = import.meta.env.VITE_VOYAGER_PROXY_URL;
const VOYAGER_API_KEY = import.meta.env.VITE_VOYAGER_API_KEY;
const VOYAGER_API_BASE_URL =
  import.meta.env.VITE_VOYAGER_API_BASE_URL ||
  "https://api.voyager.online/beta";

export const useVoyagerTokenBalances = ({
  walletAddress,
  active = true,
}: UseVoyagerTokenBalancesProps): UseVoyagerTokenBalancesResult => {
  const [balances, setBalances] = useState<VoyagerTokenBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if we've fetched for the current session (dialog open)
  const hasFetchedRef = useRef(false);

  const fetchBalances = useCallback(async () => {
    // Skip if inactive or no address
    if (!active || !walletAddress) {
      return;
    }

    // Skip if already fetched this session
    if (hasFetchedRef.current) {
      return;
    }

    // When using proxy, API key is not needed in frontend
    if (!VOYAGER_PROXY_URL && !VOYAGER_API_KEY) {
      setError(
        new Error("Either Voyager proxy URL or API key must be configured"),
      );
      return;
    }

    hasFetchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const normalizedAddress = addAddressPadding(walletAddress).toLowerCase();

      // Use proxy URL if configured, otherwise use direct API
      let url: string;
      if (VOYAGER_PROXY_URL) {
        url = `${VOYAGER_PROXY_URL}/api/voyager/contracts/${normalizedAddress}/token-balances`;
      } else {
        url = `${VOYAGER_API_BASE_URL}/contracts/${normalizedAddress}/token-balances`;
      }

      // Build headers - only include API key if not using proxy
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (!VOYAGER_PROXY_URL && VOYAGER_API_KEY) {
        headers["x-api-key"] = VOYAGER_API_KEY;
      }

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
      const mappedItems: VoyagerTokenBalance[] = (
        data.erc20TokenBalances || []
      ).map((item) => {
        // Convert hex decimals to number
        const decimals = parseInt(item.decimals, 16);

        // Parse USD balance if present
        const usdBalance = item.usdBalance
          ? parseFloat(item.usdBalance.replace(/,/g, ""))
          : undefined;

        return {
          tokenAddress: item.address,
          balance: item.balance,
          decimals,
          name: item.name,
          symbol: item.symbol,
          logo: item.iconLogo,
          usdBalance,
          formattedBalance: item.formattedBalance,
          isVerified: item.isVerified,
        };
      });

      setBalances(mappedItems);
    } catch (err) {
      console.error("Error fetching token balances from Voyager:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, active]);

  // Reset fetch flag when dialog closes
  useEffect(() => {
    if (!active) {
      hasFetchedRef.current = false;
    }
  }, [active]);

  // Fetch when active and have address
  useEffect(() => {
    if (active && walletAddress) {
      fetchBalances();
    }
  }, [active, walletAddress, fetchBalances]);

  const refetch = useCallback(() => {
    hasFetchedRef.current = false;
    fetchBalances();
  }, [fetchBalances]);

  // Helper to get balance for a specific token
  const getBalance = useCallback(
    (tokenAddress: string): bigint => {
      const normalizedToken = addAddressPadding(tokenAddress).toLowerCase();
      const tokenBalance = balances.find(
        (b) =>
          addAddressPadding(b.tokenAddress).toLowerCase() === normalizedToken,
      );
      if (!tokenBalance) return 0n;
      try {
        return BigInt(tokenBalance.balance);
      } catch {
        return 0n;
      }
    },
    [balances],
  );

  return {
    balances,
    loading,
    error,
    refetch,
    getBalance,
  };
};
