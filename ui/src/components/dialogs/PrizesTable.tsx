import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import { PositionPrizes, DisplayPrize, TokenMetadata } from "@/lib/types";
import { formatNumber, getOrdinalSuffix, indexAddress } from "@/lib/utils";
import { expandDistributedPrize } from "@/lib/utils/prizeDistribution";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { useDojo } from "@/context/dojo";
import { calculatePrizeValue } from "@/lib/utils/formatting";
import { useState, useMemo } from "react";
import {
  useGetTournamentPrizes,
  useGetTournamentPrizesAggregations,
} from "@/dojo/hooks/useSqlQueries";
import { BigNumberish } from "starknet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNftTokenUris } from "@/hooks/useNftTokenUris";
import NftPreview from "@/components/tournament/prizes/NftPreview";
import { NftDetailsDialog } from "@/components/tournament/prizes/NftDetailsDialog";
import { TokenUri } from "@/lib/types";

interface PrizesTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupedPrizes: PositionPrizes;
  prices: TokenPrices;
  tokens: TokenMetadata[];
  tokenDecimals: Record<string, number>;
  tournamentId?: BigNumberish;
  entryFeePrizes?: DisplayPrize[];
}

export const PrizesTableDialog = ({
  open,
  onOpenChange,
  groupedPrizes: containerGroupedPrizes,
  prices,
  tokens,
  tokenDecimals,
  tournamentId,
  entryFeePrizes = [],
}: PrizesTableDialogProps) => {
  const { selectedChainConfig, namespace } = useDojo();
  const chainId = selectedChainConfig?.chainId ?? "";
  const [currentPage, setCurrentPage] = useState(0);
  const positionsPerPage = 5;

  // NFT details dialog state
  const [selectedNft, setSelectedNft] = useState<{
    tokenUri: TokenUri | null;
    tokenId: bigint;
    symbol: string;
  } | null>(null);

  // Fetch aggregations to get total positions
  const { data: aggregations } = useGetTournamentPrizesAggregations({
    namespace,
    tournamentId: tournamentId ?? 0,
    active: !!tournamentId && open,
  });

  // Initial position range calculation (we'll fetch a wider range if we detect distributed prizes)
  const startPosition = currentPage * positionsPerPage + 1;
  // If aggregations shows position 0, assume it's a distributed prize and fetch more
  const hasDistributedPrize = (aggregations?.lowest_prize_position ?? 0) === 0;
  const endPosition = hasDistributedPrize
    ? Math.max(startPosition + positionsPerPage - 1, 50) // Fetch up to 50 positions for distributed prizes
    : Math.min(
        startPosition + positionsPerPage - 1,
        aggregations?.lowest_prize_position || 5
      );

  // Fetch paginated prizes
  const { data: prizesData, loading: prizesLoading } = useGetTournamentPrizes({
    namespace,
    tournamentId: tournamentId ?? 0,
    active: !!tournamentId && open,
    startPosition: hasDistributedPrize ? 0 : startPosition,
    endPosition,
  });

  // Calculate total positions for pagination (from aggregations)
  const totalPositions = useMemo(() => {
    // Get the lowest position from aggregations
    let dbLowestPosition = aggregations?.lowest_prize_position || 0;

    // If the lowest position is 0 (distributed prize), check the fetched data for distribution_count
    if (dbLowestPosition === 0 && prizesData && prizesData.length > 0) {
      const distributedPrize = prizesData.find(
        (p: any) => p.position === 0 || p.payout_position === 0
      );
      if (distributedPrize) {
        const distributionCount = Number(
          distributedPrize["token_type.erc20.distribution_count.Some"] ?? 0
        );
        dbLowestPosition = distributionCount;
      }
    }

    const entryFeeLowestPosition =
      entryFeePrizes.length > 0
        ? Math.max(
            ...entryFeePrizes.map((p) => Number((p as any).position ?? 0))
          )
        : 0;
    return Math.max(dbLowestPosition, entryFeeLowestPosition);
  }, [aggregations?.lowest_prize_position, entryFeePrizes, prizesData]);

  const totalPages = Math.ceil(totalPositions / positionsPerPage);
  const actualEndPosition = Math.min(
    startPosition + positionsPerPage - 1,
    totalPositions
  );

  // Extract NFT info for fetching token URIs
  const nftPrizes = useMemo(() => {
    const prizes = open
      ? prizesData || []
      : Object.values(containerGroupedPrizes).flatMap((p) => Object.values(p));
    const nfts: { address: string; tokenId: bigint }[] = [];

    [...prizes, ...entryFeePrizes].forEach((prize: any) => {
      const isErc721 =
        prize.token_type?.variant?.erc721 ||
        prize.token_type === "erc721" ||
        prize.type === "erc721";
      if (isErc721) {
        const tokenId =
          prize.token_type?.variant?.erc721?.id ||
          prize["token_type.erc721.id"] ||
          prize.value;

        if (tokenId) {
          if (Array.isArray(tokenId)) {
            tokenId.forEach((id: bigint) => {
              nfts.push({
                address: prize.token_address || prize.address,
                tokenId: id,
              });
            });
          } else {
            nfts.push({
              address: prize.token_address || prize.address,
              tokenId: BigInt(tokenId),
            });
          }
        }
      }
    });
    return nfts;
  }, [open, prizesData, containerGroupedPrizes, entryFeePrizes]);

  // Fetch NFT token URIs
  const { tokenUris, loading: nftUrisLoading } = useNftTokenUris(nftPrizes);

  // Process prizes data into grouped format
  const groupedPrizes: PositionPrizes = useMemo(() => {
    if (!open) return containerGroupedPrizes; // Use container data when not fetching

    const currentPagePrizes = prizesData || [];

    // Filter entry fee prizes that match current position range
    const relevantEntryFeePrizes = entryFeePrizes.filter(
      (p) =>
        Number(p.position ?? 0) >= startPosition &&
        Number(p.position ?? 0) <= actualEndPosition
    );

    // If we have no prizes at all, return empty
    if (currentPagePrizes.length === 0 && relevantEntryFeePrizes.length === 0) {
      return {};
    }

    // Expand distributed prizes (payout_position = 0) into individual position prizes
    const expandedDatabasePrizes = currentPagePrizes.flatMap(
      expandDistributedPrize
    );
    const expandedEntryFeePrizes = relevantEntryFeePrizes.flatMap(
      expandDistributedPrize
    );

    // Combine expanded prizes and filter for current page position range
    const combinedPrizes = [
      ...expandedEntryFeePrizes,
      ...expandedDatabasePrizes,
    ].filter((p) => {
      const pos = Number(p.position ?? p.payout_position ?? 0);
      return pos >= startPosition && pos <= actualEndPosition;
    });

    return combinedPrizes.reduce((acc: PositionPrizes, prize: any) => {
      const position = prize.position ?? prize.payout_position;
      if (!acc[position]) acc[position] = {};

      const isErc20 =
        prize.token_type?.variant?.erc20 || prize.token_type === "erc20";
      const isErc721 =
        prize.token_type?.variant?.erc721 || prize.token_type === "erc721";
      const tokenType = isErc20 ? "erc20" : isErc721 ? "erc721" : "erc20";
      const tokenKey = `${prize.token_address}_${tokenType}`;

      if (tokenType === "erc20") {
        // For ERC20, sum the amounts
        const amount = BigInt(
          prize.token_type?.variant?.erc20?.amount ||
            prize["token_type.erc20.amount"] ||
            0
        );

        if (acc[position][tokenKey]) {
          acc[position][tokenKey].value =
            (acc[position][tokenKey].value as bigint) + amount;
        } else {
          acc[position][tokenKey] = {
            type: "erc20",
            payout_position: position,
            address: prize.token_address,
            value: amount,
          };
        }
      } else {
        // For ERC721, collect token IDs into an array
        const tokenId = BigInt(
          prize.token_type?.variant?.erc721?.token_id ||
            prize["token_type.erc721.id"] ||
            0
        );

        if (acc[position][tokenKey]) {
          // Add to existing array
          const currentValue = acc[position][tokenKey].value;
          if (Array.isArray(currentValue)) {
            acc[position][tokenKey].value = [...currentValue, tokenId];
          } else {
            acc[position][tokenKey].value = [currentValue as bigint, tokenId];
          }
        } else {
          // Create new entry with single token ID
          acc[position][tokenKey] = {
            type: "erc721",
            payout_position: position,
            address: prize.token_address,
            value: tokenId,
          };
        }
      }

      return acc;
    }, {});
  }, [
    open,
    containerGroupedPrizes,
    prizesData,
    entryFeePrizes,
    startPosition,
    actualEndPosition,
  ]);

  // Filter out prizes with 0 value
  const filteredGroupedPrizes: PositionPrizes = useMemo(() => {
    const filtered: PositionPrizes = {};

    Object.entries(groupedPrizes).forEach(([position, prizes]) => {
      const nonZeroPrizes: any = {};

      Object.entries(prizes).forEach(([tokenKey, prize]) => {
        if (prize.type === "erc20") {
          // Filter out ERC20 prizes with 0 amount
          if ((prize.value as bigint) > 0n) {
            nonZeroPrizes[tokenKey] = prize;
          }
        } else {
          // Keep all NFT prizes
          nonZeroPrizes[tokenKey] = prize;
        }
      });

      // Only include positions that have at least one non-zero prize
      if (Object.keys(nonZeroPrizes).length > 0) {
        filtered[position] = nonZeroPrizes;
      }
    });

    return filtered;
  }, [groupedPrizes]);

  return (
    <>
      <NftDetailsDialog
        open={!!selectedNft}
        onOpenChange={(open) => !open && setSelectedNft(null)}
        tokenUri={selectedNft?.tokenUri || null}
        tokenId={selectedNft?.tokenId || 0n}
        symbol={selectedNft?.symbol || "NFT"}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-[600px] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="p-4">Prize Distribution</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex flex-col min-h-0">
            {/* Prize list */}
            <div className="flex-1 overflow-y-auto">
              {/* Mobile view - card layout */}
              <div className="sm:hidden">
                {prizesLoading ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={index}
                        className="border border-brand/20 rounded-lg p-3"
                      >
                        <Skeleton className="h-5 w-20 mb-2" />
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    {Object.entries(filteredGroupedPrizes)
                      .sort((a, b) => Number(a[0]) - Number(b[0]))
                      .map(([position, prizes]) => {
                        // Calculate total value for this position
                        let totalPositionValue = 0;
                        const prizeRows: JSX.Element[] = [];

                        Object.entries(prizes).forEach(([key, prize]) => {
                          const token = tokens.find(
                            (t) => t.token_address === prize.address
                          );
                          const symbol = token?.symbol || key;
                          const decimals = tokenDecimals[prize.address] || 18;

                          if (prize.type === "erc20") {
                            const value = calculatePrizeValue(
                              prize,
                              prize.address,
                              prices,
                              tokenDecimals
                            );
                            totalPositionValue += value;

                            prizeRows.push(
                              <div
                                key={`${position}-${key}`}
                                className="flex items-center gap-2 text-sm"
                              >
                                <span>
                                  {formatNumber(
                                    Number(prize.value) / 10 ** decimals
                                  )}
                                </span>
                                {getTokenLogoUrl(chainId, prize.address) ? (
                                  <img
                                    src={getTokenLogoUrl(
                                      chainId,
                                      prize.address
                                    )}
                                    className="w-4 h-4 rounded-full"
                                    alt={symbol}
                                  />
                                ) : null}
                                <span className="text-xs text-muted-foreground">
                                  {token?.symbol || symbol}
                                </span>
                              </div>
                            );
                          } else {
                            // One row per NFT
                            const nftToken = tokens.find(
                              (t) =>
                                indexAddress(t.token_address) ===
                                indexAddress(prize.address)
                            );
                            const nftSymbol = nftToken?.symbol || "NFT";
                            const tokenIds = Array.isArray(prize.value)
                              ? prize.value
                              : [prize.value];

                            tokenIds.forEach((tokenId) => {
                              const nftTokenUri =
                                tokenUris[`${prize.address}_${tokenId}`];
                              prizeRows.push(
                                <div
                                  key={`${position}-${key}-${tokenId}`}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <NftPreview
                                    tokenUri={nftTokenUri}
                                    tokenId={tokenId}
                                    symbol={nftSymbol}
                                    size="sm"
                                    loading={nftUrisLoading}
                                    showTooltip={false}
                                    onClick={() =>
                                      setSelectedNft({
                                        tokenUri: nftTokenUri,
                                        tokenId,
                                        symbol: nftSymbol,
                                      })
                                    }
                                  />
                                  <span className="text-xs">1 {nftSymbol}</span>
                                </div>
                              );
                            });
                          }
                        });

                        return (
                          <div
                            key={position}
                            className="border border-brand/20 rounded-lg p-3"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-bold text-brand">
                                {position}
                                <sup>
                                  {getOrdinalSuffix(Number(position))}
                                </sup>{" "}
                                Place
                              </div>
                              {totalPositionValue > 0 && (
                                <span className="text-brand-muted">
                                  ${totalPositionValue.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              {prizeRows}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Desktop view - table layout */}
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Position</TableHead>
                    <TableHead>Prize</TableHead>
                    <TableHead className="text-right">Value (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prizesLoading
                    ? Array.from({ length: 5 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Skeleton className="h-5 w-12" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5 w-32" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Skeleton className="h-5 w-20 ml-auto" />
                          </TableCell>
                        </TableRow>
                      ))
                    : Object.entries(filteredGroupedPrizes)
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([position, prizes]) => {
                          // Calculate total value for this position
                          let totalPositionValue = 0;
                          const prizeRows: JSX.Element[] = [];

                          Object.entries(prizes).forEach(([key, prize]) => {
                            const token = tokens.find(
                              (t) => t.token_address === prize.address
                            );
                            const symbol = token?.symbol || key;
                            const decimals = tokenDecimals[prize.address] || 18;

                            if (prize.type === "erc20") {
                              const value = calculatePrizeValue(
                                prize,
                                prize.address,
                                prices,
                                tokenDecimals
                              );
                              totalPositionValue += value;

                              prizeRows.push(
                                <div
                                  key={`${position}-${key}`}
                                  className="flex items-center gap-2"
                                >
                                  <span>{`${formatNumber(
                                    Number(prize.value) / 10 ** decimals
                                  )}`}</span>
                                  {getTokenLogoUrl(chainId, prize.address) ? (
                                    <img
                                      src={getTokenLogoUrl(
                                        chainId,
                                        prize.address
                                      )}
                                      className="w-5 h-5 rounded-full"
                                      alt={symbol}
                                    />
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      {token?.symbol || symbol}
                                    </span>
                                  )}
                                </div>
                              );
                            } else {
                              // One row per NFT
                              const nftToken = tokens.find(
                                (t) =>
                                  indexAddress(t.token_address) ===
                                  indexAddress(prize.address)
                              );
                              const nftSymbol = nftToken?.symbol || "NFT";
                              const tokenIds = Array.isArray(prize.value)
                                ? prize.value
                                : [prize.value];

                              tokenIds.forEach((tokenId) => {
                                prizeRows.push(
                                  <div
                                    key={`${position}-${key}-${tokenId}`}
                                    className="flex items-center gap-2"
                                  >
                                    <NftPreview
                                      tokenUri={
                                        tokenUris[`${prize.address}_${tokenId}`]
                                      }
                                      tokenId={tokenId}
                                      symbol={nftSymbol}
                                      size="sm"
                                      loading={nftUrisLoading}
                                    />
                                    <span>1 {nftSymbol}</span>
                                  </div>
                                );
                              });
                            }
                          });

                          return (
                            <TableRow key={position}>
                              <TableCell className="font-medium">
                                {position}
                                <sup>{getOrdinalSuffix(Number(position))}</sup>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  {prizeRows}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {totalPositionValue > 0 ? (
                                  <span>${totalPositionValue.toFixed(2)}</span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-brand/20">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Prev</span>
                </Button>

                <span className="text-sm text-muted-foreground">
                  Page {currentPage + 1} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={currentPage >= totalPages - 1}
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
