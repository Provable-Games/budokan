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
import { Leaderboard, Tournament } from "@/generated/models.gen";
import { padAddress, feltToString, getOrdinalSuffix } from "@/lib/utils";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { useGameTokens } from "metagame-sdk";
import { getSubmittableScores } from "@/lib/utils/formatting";
import { useState, useMemo } from "react";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useDojo } from "@/context/dojo";

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
  const { selectedChainConfig } = useDojo();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  const leaderboardSize = Number(tournamentModel?.game_config.prize_spots);

  const { games } = useGameTokens({
    context: {
      id: Number(tournamentModel?.id) ?? 0,
    },
    pagination: {
      pageSize: leaderboardSize || 10,
    },
    sortBy: "score",
    sortOrder: "desc",
    mintedByAddress: padAddress(tournamentAddress),
    includeMetadata: false,
  });

  // Sort games by score (desc) and then by token_id (asc) for equal scores
  const sortedGames = useMemo(() => {
    if (!games) return [];
    return [...games].sort((a, b) => {
      // First sort by score (descending)
      const scoreDiff = Number(b.score) - Number(a.score);
      if (scoreDiff !== 0) return scoreDiff;

      // If scores are equal, sort by token_id (ascending - lower token_id = higher position)
      return Number(a.token_id) - Number(b.token_id);
    });
  }, [games]);

  const submittableScores = getSubmittableScores(sortedGames, leaderboard);

  const handleSubmitScores = async () => {
    setIsSubmitting(true);
    setBatchProgress(null);
    try {
      // Use batched version if there are many scores to submit
      if (submittableScores.length > 10) {
        await submitScoresBatched(
          tournamentModel?.id,
          feltToString(tournamentModel?.metadata.name),
          submittableScores,
          10, // batch size
          (current, total) => setBatchProgress({ current, total })
        );
      } else {
        await submitScores(
          tournamentModel?.id,
          feltToString(tournamentModel?.metadata.name),
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
          <span className="text-center">
            Submitting {submittableScores.length} scores
          </span>
          <div className="space-y-2 px-5 py-2 max-h-[300px] overflow-y-auto">
            {sortedGames?.map((game, index) => (
              <div className="flex flex-row items-center gap-5" key={index}>
                <span className="font-brand w-10">
                  {index + 1}
                  {getOrdinalSuffix(index + 1)}
                </span>
                <span>{game.player_name}</span>
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
