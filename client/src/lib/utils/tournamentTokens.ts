import { Tournament, Prize } from "@/generated/models.gen";
import { TokenMetadata } from "@/lib/types";
import { extractEntryFeePrizes, groupPrizesByTokens } from "./formatting";
import { indexAddress } from "@/lib/utils";

export interface TournamentWithPrizes {
  tournament: Tournament;
  prizes: Prize[] | null;
  entryCount: number;
}

/**
 * Extract unique ERC20 token symbols from all tournaments for price fetching
 */
export function extractUniqueTokenSymbols(
  tournaments: TournamentWithPrizes[],
  tokens: TokenMetadata[]
): string[] {
  const uniqueSymbols = new Set<string>();

  tournaments.forEach(({ tournament, prizes, entryCount }) => {
    // Get entry fee token if it exists
    const entryFeeToken = tournament?.entry_fee.Some?.token_address;
    if (entryFeeToken) {
      const entryFeeTokenSymbol = tokens.find(
        (t) => indexAddress(t.token_address) === indexAddress(entryFeeToken)
      )?.symbol;
      if (entryFeeTokenSymbol) {
        uniqueSymbols.add(entryFeeTokenSymbol);
      }
    }

    // Get distribution prizes from entry fees
    const { distributionPrizes } = extractEntryFeePrizes(
      tournament?.id,
      tournament?.entry_fee,
      entryCount,
      3 // Default prize positions
    );

    // Combine all prizes
    const allPrizes = [...distributionPrizes, ...(prizes ?? [])];

    // Group prizes and extract ERC20 tokens
    const groupedPrizes = groupPrizesByTokens(allPrizes, tokens);

    // Add all ERC20 token symbols
    Object.entries(groupedPrizes).forEach(([tokenSymbol, prize]) => {
      if (prize.type === "erc20") {
        uniqueSymbols.add(tokenSymbol);
      }
    });
  });

  return Array.from(uniqueSymbols);
}