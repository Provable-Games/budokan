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
import { Tournament, PrizeClaim } from "@/generated/models.gen";
import { feltToString, formatNumber, getOrdinalSuffix } from "@/lib/utils";
import {
  extractEntryFeePrizes,
  getClaimablePrizes,
  expandDistributedPrizes,
  formatRewardTypes,
} from "@/lib/utils/formatting";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import {
  getTokenLogoUrl,
  getTokenSymbol,
  getTokenDecimals,
} from "@/lib/tokensMeta";
import { useDojo } from "@/context/dojo";
import { LoadingSpinner } from "@/components/ui/spinner";
import {
  useGetTournamentPrizeClaims,
  useGetAllTournamentPrizes,
} from "@/dojo/hooks/useSqlQueries";
import { Prize } from "@/generated/models.gen";

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

  const sponsoredPrizes = (sponsoredPrizesData || []) as Prize[];

  // Fetch claimed prizes using SQL query
  const { data: prizeClaimsData } = useGetTournamentPrizeClaims({
    namespace,
    tournamentId: Number(tournamentModel?.id),
    active: !!tournamentModel?.id && open,
  });

  const claimedPrizes: PrizeClaim[] = (prizeClaimsData || []) as PrizeClaim[];

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

  // Calculate which prizes are claimable (using old format for filtering)
  const { claimablePrizes } = useMemo(
    () => getClaimablePrizes(allPrizes, claimedPrizes),
    [allPrizes, claimedPrizes]
  );

  // Convert claimable prizes to new RewardType format
  const claimableRewardTypes = useMemo(
    () => formatRewardTypes(claimablePrizes),
    [claimablePrizes]
  );

  console.log(claimableRewardTypes);

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

  const sortedClaimablePrizes = useMemo(() => {
    return [...claimablePrizes].sort((a: any, b: any) => {
      // Sort by position, with 0 (non-distributed sponsored prizes) at the end
      const posA = Number(a.position) || Number.MAX_SAFE_INTEGER;
      const posB = Number(b.position) || Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });
  }, [claimablePrizes]);

  console.log(sortedClaimablePrizes);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Distribute Prizes ({sortedClaimablePrizes.length} unclaimed)
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
        <div className="space-y-2 px-5 py-2 max-h-[500px] overflow-y-auto">
          {sortedClaimablePrizes.map((prize: any, index: number) => {
            // Handle both SDK format (variant.erc20) and SQL format (token_type string)
            const isErc20 =
              prize.token_type?.variant?.erc20 || prize.token_type === "erc20";
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
              prices[getTokenSymbol(chainId, prize.token_address) ?? ""] ?? 0;

            // Determine prize label
            let prizeLabel = "";
            if (prize.type === "entry_fee_game_creator") {
              prizeLabel = "Game Creator Share";
            } else if (prize.type === "entry_fee_tournament_creator") {
              prizeLabel = "Tournament Creator Share";
            } else if (prize.type === "entry_fee") {
              prizeLabel = `${prize.position}${getOrdinalSuffix(
                prize.position
              )} Place`;
            } else if (prize.type === "sponsored_distributed") {
              prizeLabel = `${prize.position}${getOrdinalSuffix(
                prize.position
              )} Place (Prize #${prize.id})`;
            } else {
              prizeLabel = `Sponsored Prize #${prize.id}`;
            }

            return (
              <div
                className="flex flex-row items-center justify-between"
                key={index}
              >
                <span className="text-brand-muted">{prizeLabel}</span>
                <div className="flex flex-row items-center gap-2">
                  {isErc20 ? (
                    <>
                      <span>{formatNumber(prizeAmount)}</span>
                      <img
                        src={getTokenLogoUrl(chainId, prize.token_address)}
                        className="w-6 h-6"
                        alt="token"
                      />
                      <span className="text-neutral">
                        ~${(prizeAmount * tokenPrice).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>NFT</span>
                      <img
                        src={getTokenLogoUrl(chainId, prize.token_address)}
                        className="w-6 h-6"
                        alt="token"
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
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
