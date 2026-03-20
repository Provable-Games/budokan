import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";
import { useAccount } from "@starknet-react/core";
import { Leaderboard } from "@/generated/models.gen";
import type { Tournament } from "@provable-games/budokan-sdk";
import { padAddress, feltToString, getOrdinalSuffix } from "@/lib/utils";
import { useConnectToSelectedChain } from "@/chain/hooks/useChain";
import { useTokens } from "@provable-games/denshokan-sdk/react";
import { getSubmittableScores } from "@/lib/utils/formatting";
import { useState, useMemo } from "react";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useChainConfig } from "@/context/chain";
import { useGetTournamentRegistrations } from "@/hooks/useBudokanQueries";

interface SubmitScoresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentModel: Tournament;
  leaderboard: Leaderboard;
}

export function SubmitScoresDialog({
  open,
  onOpenChange,
  tournamentModel,
  leaderboard,
}: SubmitScoresDialogProps) {
  const { address } = useAccount();
  const { connect } = useConnectToSelectedChain();
  const { submitScores, submitScoresBatched } = useSystemCalls();
  const { selectedChainConfig } = useChainConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  // Calculate leaderboard size from entry fee distribution count, or default to 10
  const entryFee = (tournamentModel as any)?.entryFee;
  const leaderboardSize = entryFee && Number(entryFee.distributionCount ?? 0) > 0
    ? Number(entryFee.distributionCount)
    : 10;

  // Fetch extra games beyond leaderboard size to account for banned entries
  const fetchSize = (leaderboardSize || 10) + 10;

  const { data: tokensResult } = useTokens(
    open && tournamentModel?.id
      ? {
          contextId: Number(tournamentModel.id),
          minterAddress: padAddress(tournamentAddress),
          sort: { field: "score", direction: "desc" },
          limit: fetchSize,
        }
      : undefined,
  );

  // Map to GameTokenData shape expected by downstream code
  const sortedGames = useMemo(() => {
    if (!tokensResult?.data) return [];
    return tokensResult.data.map((token: any) => ({
      tokenId: token.tokenId,
      gameId: token.gameId,
      owner: token.owner,
      playerName: token.playerName,
      score: token.score,
      gameOver: token.gameOver,
      lifecycle: { start: 0n, end: 0n },
      metadata: "",
    }));
  }, [tokensResult]);

  // Fetch game IDs for registration data
  const gameIds = useMemo(
    () => sortedGames?.map((game) => Number(game.tokenId)) || [],
    [sortedGames]
  );

  const tournamentId = tournamentModel?.id ? String(tournamentModel.id) : undefined;

  // Fetch registration data to check banned status
  const { data: registrants } = useGetTournamentRegistrations(
    gameIds.length > 0 ? tournamentId : undefined,
    { limit: 1000 },
  );

  // Filter out banned games and take only top leaderboardSize entries
  const nonBannedGames = useMemo(() => {
    if (!sortedGames || !registrants) return sortedGames;

    const filtered = sortedGames.filter((game) => {
      const registration = registrants.find(
        (reg) => Number(reg.gameTokenId) === Number(game.tokenId)
      );
      // Filter out if banned
      return !registration?.isBanned;
    });

    // Take only top leaderboardSize entries to ensure correct number of submissions
    return filtered.slice(0, leaderboardSize);
  }, [sortedGames, registrants, leaderboardSize]);

  const submittableScores = getSubmittableScores(nonBannedGames, leaderboard);

  // Calculate banned count for display
  const bannedCount = (sortedGames?.length || 0) - (nonBannedGames?.length || 0);

  const handleSubmitScores = async () => {
    setIsSubmitting(true);
    setBatchProgress(null);
    try {
      // Use batched version if there are many scores to submit
      if (submittableScores.length > 10) {
        await submitScoresBatched(
          tournamentModel?.id,
          tournamentModel?.name ?? "",
          submittableScores,
          10, // batch size
          (current, total) => setBatchProgress({ current, total })
        );
      } else {
        await submitScores(
          tournamentModel?.id,
          tournamentModel?.name ?? "",
          submittableScores
        );
      }
      setIsSubmitting(false);
      setBatchProgress(null);
      onOpenChange(false); // Close dialog after success
    } catch (error) {
      console.error("Failed to submit scores:", error);
      setIsSubmitting(false);
      setBatchProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Scores</DialogTitle>
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
        <div className="flex flex-col gap-2">
          {bannedCount > 0 && (
            <div className="text-sm text-muted-foreground text-center">
              {bannedCount} banned {bannedCount === 1 ? 'entry' : 'entries'} excluded from submission
            </div>
          )}
          <span className="text-center">
            Submitting {submittableScores.length} scores
          </span>
          <div className="space-y-2 px-5 py-2 max-h-[300px] overflow-y-auto">
            {nonBannedGames?.map((game, index) => (
              <div className="flex flex-row items-center gap-5" key={index}>
                <span className="font-brand w-10">
                  {index + 1}
                  {getOrdinalSuffix(index + 1)}
                </span>
                <span>{game.playerName}</span>
                <p
                  className="flex-1 h-[2px] bg-repeat-x"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, currentColor 1px, transparent 1px)",
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 center",
                  }}
                ></p>
                <span className="font-brand">{game.score}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {address ? (
            <Button
              disabled={!address || isSubmitting}
              onClick={handleSubmitScores}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner />
                  {batchProgress ? (
                    <span>
                      Batch {batchProgress.current}/{batchProgress.total}
                    </span>
                  ) : (
                    <span>Submitting...</span>
                  )}
                </div>
              ) : (
                "Submit"
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
