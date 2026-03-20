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
 * Hook to calculate sponsored prize value in USD from aggregated database data.
 *
 * Entry fee prize value should be calculated separately using
 * calculateTotalPrizeValueUSD from metagame-sdk.
 */
export const useTournamentPrizeValue = ({
  aggregations,
  distributionPrizes,
  tokenPrices,
  pricesLoading,
  tokenDecimals,
}: UseTournamentPrizeValueParams): number => {
  return useMemo(() => {
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
            if (price === undefined) return sum;
            const decimals = tokenDecimals[normalizedAddress] || 18;
            const amount = tokenTotal.totalAmount;
            return sum + (amount / 10 ** decimals) * price;
          }
          return sum;
        },
        0
      );
    }

    // Calculate USD from distribution prizes (ERC20 only)
    distributionPrizes.forEach((prize) => {
      if (prize.token_type?.variant?.erc20) {
        const normalizedAddress = indexAddress(prize.token_address);
        const price = tokenPrices[normalizedAddress];
        if (price === undefined) return;
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
