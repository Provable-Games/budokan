import { TROPHY } from "@/components/Icons";
import PrizeDisplay from "@/components/tournament/prizes/Prize";
import { useState, useEffect, useMemo } from "react";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import { PositionPrizes, DisplayPrize, TokenMetadata } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { indexAddress } from "@/lib/utils";
import { useNftTokenUris } from "@/hooks/useNftTokenUris";
import NftPreview from "@/components/tournament/prizes/NftPreview";
import { expandDistributedPrize } from "@/lib/utils/prizeDistribution";
import {
  TournamentCard,
  TournamentCardContent,
  TournamentCardHeader,
  TournamentCardMetric,
  TournamentCardSwitch,
  TournamentCardTitle,
} from "@/components/tournament/containers/TournamentCard";
import { Button } from "@/components/ui/button";
import { PrizesTableDialog } from "@/components/dialogs/PrizesTable";
import { SponsorsDialog } from "@/components/dialogs/Sponsors";
import { TableProperties, Users } from "lucide-react";
import { useGetTournamentPrizes } from "@/dojo/hooks/useSqlQueries";
import { useDojo } from "@/context/dojo";
import { BigNumberish } from "starknet";

interface PrizesContainerProps {
  tournamentId?: BigNumberish;
  tokens: TokenMetadata[];
  tokenDecimals: Record<string, number>;
  entryFeePrizes?: DisplayPrize[];
  prices?: TokenPrices;
  pricesLoading?: boolean;
  aggregations: any;
  aggregationsLoading: boolean;
  totalPrizesValueUSD: number;
  paidPlaces: number;
  subscibedPrizeCount: number;
}

const PrizesContainer = ({
  tournamentId,
  tokens,
  tokenDecimals,
  entryFeePrizes = [],
  prices,
  pricesLoading,
  aggregations,
  aggregationsLoading,
  totalPrizesValueUSD,
  paidPlaces,
  subscibedPrizeCount,
}: PrizesContainerProps) => {
  const { namespace } = useDojo();
  const [showPrizes, setShowPrizes] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showSponsorsDialog, setShowSponsorsDialog] = useState(false);

  // Always fetch top 5 positions for container view
  const {
    data: prizesData,
    loading: prizesLoading,
    refetch: refetchPrizes,
  } = useGetTournamentPrizes({
    namespace,
    tournamentId: tournamentId ?? 0,
    active: !!tournamentId,
    startPosition: 1,
    endPosition: 5,
  });

  useEffect(() => {
    refetchPrizes();
  }, [subscibedPrizeCount]);

  // Process prizes data into grouped format (including entry fee prizes for current page)
  const groupedPrizes: PositionPrizes = useMemo(() => {
    if (!prizesData && entryFeePrizes.length === 0) return {};

    // Combine paginated prizes with entry fee prizes that fit in current page
    const currentPagePrizes = prizesData || [];

    // Filter entry fee prizes for top 5 positions
    const relevantEntryFeePrizes = entryFeePrizes.filter(
      (p) => Number(p.position ?? 0) >= 1 && Number(p.position ?? 0) <= 5,
    );

    // Expand distributed prizes (payout_position = 0) into individual position prizes
    const expandedDatabasePrizes = currentPagePrizes.flatMap((prize) =>
      expandDistributedPrize(prize),
    );

    const expandedEntryFeePrizes = relevantEntryFeePrizes.flatMap((prize) =>
      expandDistributedPrize(prize),
    );

    // Combine expanded prizes and filter for top 5 positions
    const combinedPrizes = [
      ...expandedEntryFeePrizes,
      ...expandedDatabasePrizes,
    ].filter((p) => {
      const pos = Number(p.position ?? p.payout_position ?? 0);
      return pos >= 1 && pos <= 5;
    });

    return combinedPrizes.reduce((acc: PositionPrizes, prize: any) => {
      // Use position field (for DisplayPrize) or payout_position (for SQL data)
      const position = prize.position ?? prize.payout_position ?? 0;
      if (!position || position === 0) return acc; // This should now be rare as distributed prizes are expanded

      const positionKey = position.toString();
      if (!acc[positionKey]) acc[positionKey] = {};

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
            0,
        );

        if (acc[positionKey][tokenKey]) {
          acc[positionKey][tokenKey].value =
            (acc[positionKey][tokenKey].value as bigint) + amount;
        } else {
          acc[positionKey][tokenKey] = {
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
            0,
        );

        if (acc[positionKey][tokenKey]) {
          // Add to existing array
          const currentValue = acc[positionKey][tokenKey].value;
          if (Array.isArray(currentValue)) {
            acc[positionKey][tokenKey].value = [...currentValue, tokenId];
          } else {
            acc[positionKey][tokenKey].value = [
              currentValue as bigint,
              tokenId,
            ];
          }
        } else {
          // Create new entry with single token ID
          acc[positionKey][tokenKey] = {
            type: "erc721",
            payout_position: position,
            address: prize.token_address,
            value: tokenId,
          };
        }
      }

      return acc;
    }, {});
  }, [prizesData, entryFeePrizes]);

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

  // Get prize information - count actual non-zero prizes after filtering
  // This ensures the count matches what users can actually claim
  const totalPrizes = useMemo(() => {
    return Object.values(filteredGroupedPrizes).reduce((total, prizes) => {
      return total + Object.keys(prizes).length;
    }, 0);
  }, [filteredGroupedPrizes]);

  const prizesExist = totalPrizes > 0;

  // Calculate total NFTs from aggregated data + entry fee NFTs
  const dbNFTs =
    aggregations?.token_totals?.reduce((count: number, tokenTotal: any) => {
      return (
        count +
        (tokenTotal.tokenType === "erc721"
          ? Number(tokenTotal.nftCount || 0)
          : 0)
      );
    }, 0) || 0;

  const entryFeeNFTs = entryFeePrizes.filter(
    (p) => p.token_type?.variant?.erc721,
  ).length;
  const totalPrizeNFTs = dbNFTs + entryFeeNFTs;

  // Get NFT symbol for total display - use the first NFT collection found
  const nftSymbol = useMemo(() => {
    // Look through filteredGroupedPrizes to find the first NFT
    const firstNftPrize = Object.values(filteredGroupedPrizes)
      .flatMap((prizes) => Object.values(prizes))
      .find((prize) => prize.type === "erc721");

    if (firstNftPrize) {
      const nftToken = tokens.find(
        (t) =>
          indexAddress(t.token_address) === indexAddress(firstNftPrize.address),
      );
      return nftToken?.symbol || "NFT";
    }
    return "NFT";
  }, [filteredGroupedPrizes, tokens]);

  // Collect all NFT prizes for token URI fetching (used in header display)
  const allNftPrizes = useMemo(() => {
    const nfts: { address: string; tokenId: bigint }[] = [];
    Object.values(filteredGroupedPrizes).forEach((prizes) => {
      Object.values(prizes).forEach((prize) => {
        if (prize.type === "erc721") {
          if (Array.isArray(prize.value)) {
            prize.value.forEach((tokenId) => {
              nfts.push({ address: prize.address, tokenId });
            });
          } else {
            nfts.push({ address: prize.address, tokenId: prize.value });
          }
        }
      });
    });
    return nfts;
  }, [filteredGroupedPrizes]);

  const { tokenUris, loading: nftUrisLoading } = useNftTokenUris(allNftPrizes);

  useEffect(() => {
    setShowPrizes(prizesExist);
  }, [prizesExist]);

  return (
    <TournamentCard
      showCard={showPrizes}
      className={showPrizes ? "!h-auto sm:!h-full" : "h-[60px] 3xl:h-[80px]"}
    >
      <TournamentCardHeader>
        <TournamentCardTitle>
          <div className="flex flex-row items-center gap-2">
            <span className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
              Prizes
            </span>
            {pricesLoading ? (
              <Skeleton className="h-6 w-24 bg-brand/10" />
            ) : (
              <>
                {totalPrizesValueUSD > 0 && (
                  <span className="font-brand text-md xl:text-lg 2xl:text-xl 3xl:text-2xl text-brand-muted">
                    ${totalPrizesValueUSD.toFixed(2)}
                  </span>
                )}
                {totalPrizesValueUSD > 0 && totalPrizeNFTs > 0 && (
                  <span className="text-brand/25 hidden sm:inline">|</span>
                )}
                {totalPrizeNFTs > 0 && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <div className="flex -space-x-2">
                      {allNftPrizes.slice(0, 3).map((nft, idx) => (
                        <NftPreview
                          key={idx}
                          tokenUri={tokenUris[`${nft.address}_${nft.tokenId}`]}
                          tokenId={nft.tokenId}
                          symbol={nftSymbol}
                          size="sm"
                          loading={nftUrisLoading}
                          showTooltip={true}
                        />
                      ))}
                    </div>
                    {totalPrizeNFTs > 3 && (
                      <div
                        className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-[10px] border border-background"
                        style={{ marginLeft: "-4px", zIndex: 0 }}
                      >
                        +{totalPrizeNFTs - 3}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </TournamentCardTitle>
        <div className="flex flex-row items-center gap-2">
          {prizesExist && (
            <>
              {/* Mobile sponsors button */}
              <Button
                variant="outline"
                size="xs"
                onClick={() => setShowSponsorsDialog(true)}
                className="sm:hidden"
                title="View Sponsors"
              >
                <Users className="w-3 h-3" />
              </Button>
              {/* Desktop sponsors button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSponsorsDialog(true)}
                className="hidden sm:flex"
                title="View Sponsors"
              >
                <Users className="w-4 h-4" />
              </Button>
              {/* Mobile table button */}
              <Button
                variant="outline"
                size="xs"
                onClick={() => setShowTableDialog(true)}
                className="sm:hidden"
                title="View Full Table"
              >
                <TableProperties className="w-3 h-3" />
              </Button>
              {/* Desktop table button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTableDialog(true)}
                className="hidden sm:flex"
                title="View Full Table"
              >
                <TableProperties className="w-4 h-4" />
              </Button>
            </>
          )}
          <TournamentCardSwitch
            checked={showPrizes}
            onCheckedChange={setShowPrizes}
            showSwitch={prizesExist}
            notShowingSwitchLabel="No prizes"
            checkedLabel="Hide"
            uncheckedLabel="Show Prizes"
          />
          <TournamentCardMetric icon={<TROPHY />} metric={paidPlaces} />
        </div>
      </TournamentCardHeader>
      <TournamentCardContent
        showContent={showPrizes}
        className="!h-auto sm:!h-[100px]"
      >
        <div className="p-1 sm:p-4 h-full">
          {prizesExist && (
            <div className="flex flex-row gap-2 sm:gap-3 overflow-x-auto w-full h-full items-center">
              {pricesLoading || prizesLoading || aggregationsLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-lg border border-brand/20 w-fit flex-shrink-0"
                  >
                    <Skeleton className="h-6 w-6 sm:h-8 sm:w-8 rounded-full" />
                    <Skeleton className="h-4 w-16 sm:h-6 sm:w-20 bg-brand/10" />
                  </div>
                ))
              ) : (
                <>
                  {Object.entries(filteredGroupedPrizes)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([position, prizes], index) => (
                      <PrizeDisplay
                        key={index}
                        position={Number(position)}
                        prizes={prizes}
                        prices={prices || {}}
                        tokens={tokens}
                        tokenDecimals={tokenDecimals}
                        tokenUris={tokenUris}
                        nftUrisLoading={nftUrisLoading}
                      />
                    ))}
                </>
              )}
            </div>
          )}
        </div>
      </TournamentCardContent>
      {/* Table dialog would need to be updated to fetch all prizes */}
      <PrizesTableDialog
        open={showTableDialog}
        onOpenChange={setShowTableDialog}
        groupedPrizes={filteredGroupedPrizes}
        prices={prices || {}}
        tokens={tokens}
        tokenDecimals={tokenDecimals}
        tournamentId={tournamentId}
        entryFeePrizes={entryFeePrizes}
      />
      <SponsorsDialog
        open={showSponsorsDialog}
        onOpenChange={setShowSponsorsDialog}
        prices={prices || {}}
        tokenDecimals={tokenDecimals}
        tournamentId={tournamentId}
      />
    </TournamentCard>
  );
};

export default PrizesContainer;
