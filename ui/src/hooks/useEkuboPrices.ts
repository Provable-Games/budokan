import { useState, useEffect, useCallback } from "react";
import { useDojo } from "@/context/dojo";
import { ChainId } from "@/dojo/setup/networks";

export interface TokenPrices {
  [address: string]: number | undefined;
}

interface TokenLoadingStates {
  [address: string]: boolean;
}

interface TokenErrorStates {
  [address: string]: boolean;
}

interface PriceResult {
  tokenAddress: string;
  price: number | undefined;
  timedOut: boolean;
  error: boolean;
}

interface EkuboPriceProps {
  tokens: string[]; // Array of token addresses
  timeoutMs?: number; // Optional timeout parameter
}

export const useEkuboPrices = ({
  tokens,
  timeoutMs = 10000,
}: EkuboPriceProps) => {
  const { selectedChainConfig } = useDojo();
  const [prices, setPrices] = useState<TokenPrices>({});
  const [isLoading, setIsLoading] = useState(true);

  // Initialize loading states to true for all tokens
  const [tokenLoadingStates, setTokenLoadingStates] =
    useState<TokenLoadingStates>(() =>
      tokens.reduce((acc, address) => ({ ...acc, [address]: true }), {})
    );

  const [tokenErrorStates, setTokenErrorStates] = useState<TokenErrorStates>(
    () => tokens.reduce((acc, address) => ({ ...acc, [address]: false }), {})
  );

  const isMainnet = selectedChainConfig.chainId === ChainId.SN_MAIN;
  // Convert chainId to decimal format for API request
  const chainIdDecimal = "23448594291968334";
  // Standard amount: 1 token with 18 decimals (10^18)
  const standardAmount = "1000000000000000000";
  // Sort token addresses to ensure consistent key regardless of order
  const tokensKey = JSON.stringify([...tokens].sort());

  // Safe check if a token is available (has price, not loading, no error)
  const isTokenAvailable = useCallback(
    (tokenAddress: string): boolean => {
      // If the token isn't in our list, it's not available
      if (!tokens.includes(tokenAddress)) return false;

      // If it's loading, it's not available yet
      if (tokenLoadingStates[tokenAddress] === true) return false;

      // If it has an error, it's not available
      if (tokenErrorStates[tokenAddress] === true) return false;

      // If it doesn't have a price, it's not available
      if (prices[tokenAddress] === undefined) return false;

      // Otherwise, it's available
      return true;
    },
    [tokens, tokenLoadingStates, tokenErrorStates, prices]
  );

  // Helper function that considers a token loading if it's marked as loading
  const isTokenLoading = useCallback(
    (tokenAddress: string): boolean => {
      // If the token isn't in our list, consider it loading
      if (!tokens.includes(tokenAddress)) return true;

      return tokenLoadingStates[tokenAddress] === true;
    },
    [tokens, tokenLoadingStates]
  );

  // Helper function to check if a token has an error
  const hasTokenError = useCallback(
    (tokenAddress: string): boolean => {
      // If the token isn't in our list, it doesn't have an error yet
      if (!tokens.includes(tokenAddress)) return false;

      return tokenErrorStates[tokenAddress] === true;
    },
    [tokens, tokenErrorStates]
  );

  // Safe getter that only returns a price if the token is available
  const getPrice = useCallback(
    (tokenAddress: string): number | undefined => {
      if (!isTokenAvailable(tokenAddress)) {
        return undefined;
      }

      return prices[tokenAddress];
    },
    [isTokenAvailable, prices]
  );

  useEffect(() => {
    // Skip if no tokens
    if (!tokens || tokens.length === 0) {
      setIsLoading(false);
      setPrices({});
      setTokenLoadingStates({});
      setTokenErrorStates({});
      return;
    }

    console.log("useEkuboPrices: Fetching prices for token addresses:", tokens);

    // Reset all states when tokens change
    setIsLoading(true);

    // Initialize all tokens as loading and not in error state
    setTokenLoadingStates(
      tokens.reduce((acc, address) => ({ ...acc, [address]: true }), {})
    );

    setTokenErrorStates(
      tokens.reduce((acc, address) => ({ ...acc, [address]: false }), {})
    );

    const fetchPrices = async () => {
      try {
        if (!isMainnet) {
          // For non-mainnet, set all token prices to 1
          const mockPrices = tokens.reduce(
            (acc, address) => ({ ...acc, [address]: 1 }),
            {}
          );
          setPrices(mockPrices);

          // Set all tokens as loaded and not in error
          setTokenLoadingStates(
            tokens.reduce((acc, address) => ({ ...acc, [address]: false }), {})
          );
          setIsLoading(false);
          return;
        }

        const pricePromises = tokens.map(async (tokenAddress) => {
          // Manual override for USDC - always return price of 1
          if (
            tokenAddress ===
              "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb" ||
            tokenAddress ===
              "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8"
          ) {
            return { tokenAddress, price: 1, timedOut: false, error: false };
          }

          // Create a timeout promise
          const timeoutPromise = new Promise<PriceResult>((resolve) => {
            setTimeout(() => {
              resolve({
                tokenAddress,
                price: undefined,
                timedOut: true,
                error: true,
              });
            }, timeoutMs);
          });

          // Create the fetch promise
          const fetchPromise = (async () => {
            try {
              if (!chainIdDecimal) {
                throw new Error("Chain ID not available");
              }

              // Quoter API format: /{chainId}/{amount}/{tokenAddress}/{quoteToken}
              const apiUrl = `${selectedChainConfig.ekuboPriceAPI!}/${chainIdDecimal}/${standardAmount}/${tokenAddress}/0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb`;

              console.log(`Fetching price from quoter API: ${apiUrl}`);

              const result = await fetch(apiUrl);

              if (!result.ok) {
                throw new Error(`HTTP error! status: ${result.status}`);
              }

              const contentType = result.headers.get("content-type");
              if (!contentType || !contentType.includes("application/json")) {
                throw new Error("API did not return JSON");
              }

              const quoteResponse = await result.json();

              console.log(`Fetched quote for ${tokenAddress}:`, quoteResponse);

              // The quoter returns the amount of USDC we'd get for the input amount
              // USDC has 6 decimals, so divide by 10^6 to get the dollar price
              if (!quoteResponse.total_calculated) {
                throw new Error("No quote data available");
              }

              // Convert the quote amount (in USDC smallest unit) to dollar price
              const price = Number(quoteResponse.total_calculated) / 1e6;
              return { tokenAddress, price, timedOut: false, error: false };
            } catch (error) {
              console.error(`Error fetching ${tokenAddress} price:`, error);
              return {
                tokenAddress,
                price: undefined,
                timedOut: false,
                error: true,
              };
            }
          })();

          // Race between the timeout and the fetch
          return Promise.race([fetchPromise, timeoutPromise]);
        });

        const results = await Promise.all(pricePromises);
        const newPrices: TokenPrices = {};
        const newLoadingStates: TokenLoadingStates = {};
        const newErrorStates: TokenErrorStates = {};

        // Process all results at once to avoid multiple re-renders
        results.forEach(({ tokenAddress, price, error }) => {
          newPrices[tokenAddress] = price;
          newLoadingStates[tokenAddress] = false;
          newErrorStates[tokenAddress] = error;
        });

        console.log("useEkuboPrices: Fetched prices:", newPrices);

        setPrices(newPrices); // Replace entirely instead of merging
        setTokenLoadingStates(newLoadingStates);
        setTokenErrorStates(newErrorStates);
      } catch (error) {
        console.error("Error fetching prices:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrices();
  }, [
    tokensKey,
    selectedChainConfig.ekuboPriceAPI,
    isMainnet,
    timeoutMs,
    selectedChainConfig.chainId,
  ]); // Added chainId to dependencies

  return {
    prices,
    isLoading,
    isTokenLoading,
    hasTokenError,
    isTokenAvailable,
    getPrice,
  };
};
