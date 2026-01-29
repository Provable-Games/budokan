import { useMemo } from "react";
import { TokenPrices } from "./useEkuboPrices";
import { Prize } from "@/generated/models.gen";
import { indexAddress } from "@/lib/utils";

interface TokenTotal {
  tokenAddress: string;
  tokenType: string;
  totalAmount: number;
}

interface Aggregations {
  token_totals?: TokenTotal[];
}

interface UseTournamentPrizeValueParams {
  aggregations?: Aggregations;
  distributionPrizes: Prize[];
  tokenPrices: TokenPrices;
  pricesLoading: boolean;
  tokenDecimals: Record<string, number>;
}

/**
 * Hook to calculate total tournament prize value in USD
 *
 * Combines:
 * - Aggregated database prizes (subscribed prizes)
 * - Entry fee distribution prizes (calculated from entry fees)
 *
 * Returns 0 if any required price is missing to avoid showing partial totals
 */
export const useTournamentPrizeValue = ({
  aggregations,
  distributionPrizes,
  tokenPrices,
  pricesLoading,
  tokenDecimals,
}: UseTournamentPrizeValueParams): number => {
  return useMemo(() => {
    // Return 0 if prices are loading OR if prices object is empty
    if (
      pricesLoading ||
      !tokenPrices ||
      Object.keys(tokenPrices).length === 0
    ) {
      return 0;
    }

    let total = 0;

    // Calculate USD from aggregated database prizes
    if (aggregations?.token_totals) {
      total += aggregations.token_totals.reduce(
        (sum: number, tokenTotal: TokenTotal) => {
          if (tokenTotal.tokenType === "erc20" && tokenTotal.totalAmount) {
            const normalizedAddress = indexAddress(tokenTotal.tokenAddress);
            const price = tokenPrices[normalizedAddress];
            // Skip tokens without prices
            if (price === undefined) {
              return sum;
            }
            const decimals = tokenDecimals[normalizedAddress] || 18;
            const amount = tokenTotal.totalAmount;

            return sum + (amount / 10 ** decimals) * price;
          }
          return sum;
        },
        0
      );
    }

    // Calculate USD from entry fee prizes (ERC20 only)
    // Only include distributionPrizes - not creator/game shares as those are fees, not prizes
    distributionPrizes.forEach((prize) => {
      if (prize.token_type?.variant?.erc20) {
        const normalizedAddress = indexAddress(prize.token_address);
        const price = tokenPrices[normalizedAddress];
        // Skip tokens without prices
        if (price === undefined) {
          return;
        }
        const amount = prize.token_type.variant.erc20.amount || 0;
        const decimals = tokenDecimals[normalizedAddress] || 18;

        total += (amount / 10 ** decimals) * price;
      }
    });

    return total;
  }, [
    aggregations?.token_totals,
    tokenPrices,
    pricesLoading,
    tokenDecimals,
    distributionPrizes,
  ]);
};
