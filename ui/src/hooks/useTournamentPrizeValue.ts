import { useMemo } from "react";
import { TokenPrices } from "./useEkuboPrices";
import { Prize } from "@/generated/models.gen";

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
    console.log("useTournamentPrizeValue:", {
      pricesLoading,
      hasPrices: !!tokenPrices,
      priceCount: Object.keys(tokenPrices || {}).length,
      hasAggregations: !!aggregations?.token_totals,
      distributionPrizesCount: distributionPrizes.length,
      tokenDecimals,
    });

    // Return 0 if prices are loading OR if prices object is empty
    if (pricesLoading || !tokenPrices || Object.keys(tokenPrices).length === 0) {
      console.log("Returning 0: prices loading or empty");
      return 0;
    }

    let total = 0;
    let hasAllPrices = true;
    const missingPrices: string[] = [];

    // Calculate USD from aggregated database prizes
    if (aggregations?.token_totals) {
      total += aggregations.token_totals.reduce(
        (sum: number, tokenTotal: TokenTotal) => {
          if (tokenTotal.tokenType === "erc20" && tokenTotal.totalAmount) {
            const price = tokenPrices[tokenTotal.tokenAddress];
            // If any price is missing, mark that we don't have all prices yet
            if (price === undefined) {
              hasAllPrices = false;
              missingPrices.push(tokenTotal.tokenAddress);
              return sum;
            }
            const decimals = tokenDecimals[tokenTotal.tokenAddress] || 18;
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
        const price = tokenPrices[prize.token_address];
        // If any price is missing, mark that we don't have all prices yet
        if (price === undefined) {
          hasAllPrices = false;
          missingPrices.push(prize.token_address);
          return;
        }
        const amount = prize.token_type.variant.erc20.amount || 0;
        const decimals = tokenDecimals[prize.token_address] || 18;

        total += (amount / 10 ** decimals) * price;
      }
    });

    // If we don't have all prices yet, return 0 to avoid showing partial totals
    if (!hasAllPrices) {
      console.log("Returning 0: missing prices for", missingPrices);
      return 0;
    }

    console.log("Calculated total prize value:", total);
    return total;
  }, [
    aggregations?.token_totals,
    tokenPrices,
    pricesLoading,
    tokenDecimals,
    distributionPrizes,
  ]);
};
