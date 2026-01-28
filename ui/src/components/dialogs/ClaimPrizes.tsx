import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useAccount } from "@starknet-react/core";
import { Tournament, RewardClaim } from "@/generated/models.gen";
import { feltToString, formatNumber, getOrdinalSuffix, indexAddress } from "@/lib/utils";
import {
  extractEntryFeePrizes,
  getClaimablePrizes,
  expandDistributedPrizes,
  formatRewardTypes,
  processPrizeFromSql,
} from "@/lib/utils/formatting";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import {
  getTokenLogoUrl,
  getTokenDecimals,
} from "@/lib/tokensMeta";
import { useDojo } from "@/context/dojo";
import { LoadingSpinner } from "@/components/ui/spinner";
import {
  useGetTournamentRewardClaims,
  useGetAllTournamentPrizes,
} from "@/dojo/hooks/useSqlQueries";

interface ClaimPrizesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentModel: Tournament;
  prices: TokenPrices;
  entryCount?: number;
}

export function ClaimPrizesDialog({
  open,
  onOpenChange,
  tournamentModel,
  prices,
  entryCount,
}: ClaimPrizesDialogProps) {
  const { address } = useAccount();
  const { connect } = useConnectToSelectedChain();
  const { claimPrizes, claimPrizesBatched } = useSystemCalls();
  const { selectedChainConfig, namespace } = useDojo();
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const chainId = selectedChainConfig?.chainId ?? "";

  // Fetch ALL sponsored prizes from database
  const { data: sponsoredPrizesData } = useGetAllTournamentPrizes({
    namespace,
    tournamentId: Number(tournamentModel?.id),
    active: !!tournamentModel?.id && open,
  });

  // Process SQL prizes to proper Prize objects with CairoCustomEnum structures
  const sponsoredPrizes = useMemo(
    () => (sponsoredPrizesData || []).map(processPrizeFromSql),
    [sponsoredPrizesData]
  );

  // Fetch claimed rewards using SQL query
  const { data: rewardClaimsData } = useGetTournamentRewardClaims({
    namespace,
    tournamentId: Number(tournamentModel?.id),
    active: !!tournamentModel?.id && open,
  });

  const claimedRewards: RewardClaim[] = (rewardClaimsData ||
    []) as RewardClaim[];

  const leaderboardSize =
    tournamentModel?.entry_fee?.Some?.distribution_positions?.isSome()
      ? Number(tournamentModel.entry_fee.Some.distribution_positions.Some)
      : entryCount;

  // Calculate entry fee prizes based on tournament settings
  const { tournamentCreatorShare, gameCreatorShare, distributionPrizes } =
    useMemo(
      () =>
        extractEntryFeePrizes(
          tournamentModel?.id,
          tournamentModel?.entry_fee,
          BigInt(entryCount || 0),
          leaderboardSize
        ),
      [tournamentModel?.id, tournamentModel?.entry_fee, entryCount]
    );

  // Expand distributed sponsored prizes into individual positions
  const expandedSponsoredPrizes = useMemo(
    () => expandDistributedPrizes(sponsoredPrizes),
    [sponsoredPrizes]
  );

  // Combine all prizes: entry fee prizes + expanded sponsored prizes
  const allPrizes = useMemo(() => {
    return [
      ...distributionPrizes,
      ...tournamentCreatorShare,
      ...gameCreatorShare,
      ...expandedSponsoredPrizes,
    ];
  }, [
    distributionPrizes,
    tournamentCreatorShare,
    gameCreatorShare,
    expandedSponsoredPrizes,
  ]);

  // Calculate which prizes are claimable (using new RewardClaim format for filtering)
  const { claimablePrizes } = useMemo(
    () => getClaimablePrizes(allPrizes, claimedRewards),
    [allPrizes, claimedRewards]
  );

  const handleClaimPrizes = async () => {
    setIsProcessing(true);
    setBatchProgress(null);

    try {
      // Use batched version if there are many prizes to claim
      if (claimableRewardTypes.length > 20) {
        await claimPrizesBatched(
          tournamentModel?.id,
          feltToString(tournamentModel?.metadata.name),
          claimableRewardTypes,
          20, // batch size
          (current, total) => setBatchProgress({ current, total })
        );
      } else {
        await claimPrizes(
          tournamentModel?.id,
          feltToString(tournamentModel?.metadata.name),
          claimableRewardTypes
        );
      }
      onOpenChange(false); // Close dialog after success
    } finally {
      setIsProcessing(false);
      setBatchProgress(null);
    }
  };

  // Helper function to get prize amount
  const getPrizeAmount = (prize: any): bigint => {
    const isErc20 =
      prize.token_type?.variant?.erc20 || prize.token_type === "erc20";

    if (!isErc20) return 1n; // NFTs are considered non-zero

    const amount =
      prize.token_type?.variant?.erc20?.amount ||
      prize["token_type.erc20.amount"] ||
      "0";

    return BigInt(amount);
  };

  // Filter out prizes with 0 value
  // UI now matches contract's basis point truncation, so 0 amount means truly unclaimable
  const nonZeroPrizes = useMemo(() => {
    return claimablePrizes.filter((prize: any) => getPrizeAmount(prize) > 0n);
  }, [claimablePrizes]);

  // Convert non-zero claimable prizes to new RewardType format
  const claimableRewardTypes = useMemo(
    () => formatRewardTypes(nonZeroPrizes),
    [nonZeroPrizes]
  );

  // Group prizes by position for better display
  const groupedPrizes = useMemo(() => {
    const groups: Record<
      string,
      { position: number; label: string; prizes: any[] }
    > = {};

    nonZeroPrizes.forEach((prize: any) => {
      let groupKey: string;
      let groupLabel: string;
      let position: number;

      if (prize.type === "entry_fee_game_creator") {
        groupKey = "game_creator";
        groupLabel = "Game Creator Share";
        position = Number.MAX_SAFE_INTEGER - 1;
      } else if (prize.type === "entry_fee_tournament_creator") {
        groupKey = "tournament_creator";
        groupLabel = "Tournament Creator Share";
        position = Number.MAX_SAFE_INTEGER - 2;
      } else if (
        prize.type === "entry_fee" ||
        prize.type === "sponsored_distributed"
      ) {
        groupKey = `position_${prize.position}`;
        groupLabel = `${prize.position}${getOrdinalSuffix(
          prize.position
        )} Place`;
        position = Number(prize.position);
      } else {
        groupKey = "sponsored_other";
        groupLabel = "Sponsored Prizes";
        position = Number.MAX_SAFE_INTEGER;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { position, label: groupLabel, prizes: [] };
      }
      groups[groupKey].prizes.push(prize);
    });

    // Sort groups by position
    return Object.values(groups).sort((a, b) => a.position - b.position);
  }, [nonZeroPrizes]);

  // Calculate total prize count for dialog title
  const totalPrizeCount = groupedPrizes.reduce(
    (sum, group) => sum + group.prizes.length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Distribute Prizes ({totalPrizeCount} unclaimed)
          </DialogTitle>
        </DialogHeader>
        {batchProgress && (
          <div className="bg-brand/10 border border-brand p-4 rounded-lg mx-5">
            <div className="flex items-center gap-3">
              <LoadingSpinner />
              <div>
                <p className="font-semibold">Processing Transactions</p>
                <p className="text-sm text-muted-foreground">
                  Batch {batchProgress.current} of {batchProgress.total} -
                  Please do not close this window
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-4 px-5 py-2 max-h-[500px] overflow-y-auto">
          {groupedPrizes.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-2">
              <div className="font-semibold text-brand border-b border-brand/20 pb-1">
                {group.label}
              </div>
              <div className="space-y-1 pl-3">
                {group.prizes.map((prize: any, prizeIndex: number) => {
                  // Handle both SDK format (variant.erc20) and SQL format (token_type string)
                  const isErc20 =
                    prize.token_type?.variant?.erc20 ||
                    prize.token_type === "erc20";
                  const tokenDecimals = getTokenDecimals(
                    chainId,
                    prize.token_address
                  );
                  const prizeAmount = isErc20
                    ? Number(
                        prize.token_type?.variant?.erc20?.amount ||
                          prize["token_type.erc20.amount"] ||
                          0
                      ) /
                      10 ** tokenDecimals
                    : 0;
                  const tokenPrice =
                    prices[indexAddress(prize.token_address ?? "")] ?? 0;

                  // Determine prize source label
                  let sourceLabel = "";
                  if (prize.type === "entry_fee") {
                    sourceLabel = "Entry Fee Pool";
                  } else if (prize.type === "sponsored_distributed") {
                    sourceLabel = `Prize Pool #${prizeIndex + 1}`;
                  } else if (
                    prize.type === "entry_fee_game_creator" ||
                    prize.type === "entry_fee_tournament_creator"
                  ) {
                    sourceLabel = "Entry Fee Pool";
                  } else {
                    sourceLabel = `Prize #${prizeIndex + 1}`;
                  }

                  return (
                    <div
                      className="flex flex-row items-center justify-between text-sm"
                      key={prizeIndex}
                    >
                      <span className="text-muted-foreground">
                        {sourceLabel}
                      </span>
                      <div className="flex flex-row items-center gap-2">
                        {isErc20 ? (
                          <>
                            <span>{formatNumber(prizeAmount)}</span>
                            <img
                              src={getTokenLogoUrl(
                                chainId,
                                prize.token_address
                              )}
                              className="w-5 h-5"
                              alt="token"
                            />
                            <span className="text-neutral text-xs">
                              ~${(prizeAmount * tokenPrice).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>NFT</span>
                            <img
                              src={getTokenLogoUrl(
                                chainId,
                                prize.token_address
                              )}
                              className="w-5 h-5"
                              alt="token"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {address ? (
            <Button
              disabled={!address || isProcessing}
              onClick={handleClaimPrizes}
            >
              {isProcessing ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner />
                  {batchProgress ? (
                    <span>
                      Batch {batchProgress.current}/{batchProgress.total}
                    </span>
                  ) : (
                    <span>Processing...</span>
                  )}
                </div>
              ) : (
                "Distribute"
              )}
            </Button>
          ) : (
            <Button onClick={() => connect()}>Connect Wallet</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
