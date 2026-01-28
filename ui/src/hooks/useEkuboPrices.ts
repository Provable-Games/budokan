import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useDojo } from "@/context/dojo";
import { ChainId } from "@/dojo/setup/networks";
import { indexAddress } from "@/lib/utils";

export interface TokenPrices {
  [address: string]: number | undefined;
}

interface EkuboPriceProps {
  tokens: string[];
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

const USDC_ADDRESSES = new Set([
  "0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
]);

const CHAIN_ID_DECIMAL = "23448594291968334";
const STANDARD_AMOUNT = "1000000000000000000";
const USDC_QUOTE =
  "0x33068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb";

async function fetchTokenPrice(
  apiBase: string,
  tokenAddress: string,
  timeoutMs: number,
  signal: AbortSignal
): Promise<{ address: string; price: number | undefined; error: boolean }> {
  // USDC always returns 1
  if (USDC_ADDRESSES.has(tokenAddress)) {
    return { address: tokenAddress, price: 1, error: false };
  }

  try {
    const apiUrl = `${apiBase}/${CHAIN_ID_DECIMAL}/${STANDARD_AMOUNT}/${tokenAddress}/${USDC_QUOTE}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Combine caller's abort signal with timeout
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    try {
      const result = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!result.ok) throw new Error(`HTTP ${result.status}`);

      const contentType = result.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Non-JSON response");
      }

      const data = await result.json();
      if (!data.total_calculated) throw new Error("No quote data");

      return {
        address: tokenAddress,
        price: Number(data.total_calculated) / 1e6,
        error: false,
      };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  } catch (err) {
    if (signal.aborted) throw err; // Let caller handle abort
    console.error(`Price fetch failed for ${tokenAddress}:`, err);
    return { address: tokenAddress, price: undefined, error: true };
  }
}

export const useEkuboPrices = ({
  tokens,
  timeoutMs = 10000,
  maxRetries = 5,
  retryDelayMs = 5000,
}: EkuboPriceProps) => {
  const { selectedChainConfig } = useDojo();
  const [prices, setPrices] = useState<TokenPrices>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorTokens, setErrorTokens] = useState<Set<string>>(new Set());
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const retryCountRef = useRef(0);

  const isMainnet = selectedChainConfig.chainId === ChainId.SN_MAIN;
  const apiBase = selectedChainConfig.ekuboPriceAPI;

  // Normalize and dedupe upfront
  const normalizedTokens = useMemo(
    () => [...new Set(tokens.map(indexAddress))],
    [tokens]
  );
  const tokensKey = useMemo(
    () => JSON.stringify([...normalizedTokens].sort()),
    [normalizedTokens]
  );

  // Main effect: fetches all tokens, then retries failures
  useEffect(() => {
    if (normalizedTokens.length === 0) {
      setPrices({});
      setErrorTokens(new Set());
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    retryCountRef.current = 0;

    async function run() {
      setIsLoading(true);

      // Non-mainnet: mock all prices to 1
      if (!isMainnet) {
        const mock: TokenPrices = {};
        normalizedTokens.forEach((addr) => {
          mock[addr] = 1;
        });
        setPrices(mock);
        setErrorTokens(new Set());
        setIsLoading(false);
        return;
      }

      // Initial fetch: all tokens
      let tokensToFetch = [...normalizedTokens];
      const allPrices: TokenPrices = {};

      while (tokensToFetch.length > 0) {
        if (abortController.signal.aborted) return;

        const isRetry = retryCountRef.current > 0;
        if (isRetry) {
          console.log(
            `useEkuboPrices: Retry ${retryCountRef.current}/${maxRetries} for:`,
            tokensToFetch
          );
        } else {
          console.log("useEkuboPrices: Fetching prices for:", tokensToFetch);
        }

        let results: Awaited<ReturnType<typeof fetchTokenPrice>>[];
        try {
          results = await Promise.all(
            tokensToFetch.map((addr) =>
              fetchTokenPrice(apiBase!, addr, timeoutMs, abortController.signal)
            )
          );
        } catch {
          // Aborted — component unmounted or tokens changed
          return;
        }

        if (abortController.signal.aborted) return;

        // Merge results
        const failed: string[] = [];
        results.forEach(({ address, price, error }) => {
          if (price !== undefined) {
            allPrices[address] = price;
          } else if (error) {
            failed.push(address);
          }
        });

        // Update state with what we have so far
        setPrices({ ...allPrices });
        setErrorTokens(new Set(failed));
        setIsLoading(false);

        // Decide whether to retry
        if (failed.length === 0) break; // All done
        if (retryCountRef.current >= maxRetries) {
          console.log(
            `useEkuboPrices: Max retries (${maxRetries}) reached for:`,
            failed
          );
          break;
        }

        // Wait before retrying
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, retryDelayMs);
          // If aborted during wait, resolve immediately
          const onAbort = () => {
            clearTimeout(timer);
            resolve();
          };
          abortController.signal.addEventListener("abort", onAbort, {
            once: true,
          });
        });

        if (abortController.signal.aborted) return;

        retryCountRef.current += 1;
        tokensToFetch = failed;
      }
    }

    run();

    return () => {
      abortController.abort();
    };
  }, [tokensKey, apiBase, isMainnet, timeoutMs, maxRetries, retryDelayMs, fetchTrigger]);

  // Helpers for consumers
  const isTokenLoading = useCallback(
    (tokenAddress: string): boolean => {
      const n = indexAddress(tokenAddress);
      if (!normalizedTokens.includes(n)) return true;
      return isLoading && prices[n] === undefined;
    },
    [normalizedTokens, isLoading, prices]
  );

  const hasTokenError = useCallback(
    (tokenAddress: string): boolean => {
      return errorTokens.has(indexAddress(tokenAddress));
    },
    [errorTokens]
  );

  const isTokenAvailable = useCallback(
    (tokenAddress: string): boolean => {
      const n = indexAddress(tokenAddress);
      return prices[n] !== undefined && !errorTokens.has(n);
    },
    [prices, errorTokens]
  );

  const getPrice = useCallback(
    (tokenAddress: string): number | undefined => {
      return prices[indexAddress(tokenAddress)];
    },
    [prices]
  );

  const refetch = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  return {
    prices,
    isLoading,
    isTokenLoading,
    hasTokenError,
    isTokenAvailable,
    getPrice,
    refetch,
  };
};
