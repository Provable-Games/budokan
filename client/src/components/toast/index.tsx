import { useToast } from "@/hooks/useToast";
import { XShareButton } from "@/components/ui/button";
import { formatTime, roundUSDPrice } from "@/lib/utils";

interface TournamentEntryParams {
  tournamentName: string;
  game: string;
  entryFeeUsdCost?: number;
  hasEntryFee: boolean;
  startsIn: number;
  duration: number;
  prizeTotalUsd: number;
}

interface TournamentCreationParams {
  tournamentName: string;
  tournamentId: string;
  game: string;
  entryFeeUsdCost?: number;
  hasEntryFee: boolean;
  startsIn: number;
  duration: number;
}

interface PrizeAdditionParams {
  tournamentName: string;
  prizeTotalUsd: number;
}

interface ToastMessages {
  showTournamentEntry: (params: TournamentEntryParams) => void;
  showTournamentCreation: (params: TournamentCreationParams) => void;
  showScoreSubmission: (tournamentName: string) => void;
  showPrizeAddition: (tournamentName: PrizeAdditionParams) => void;
  showPrizeDistribution: (tournamentName: string) => void;
}

export const useToastMessages = (): ToastMessages => {
  const { toast } = useToast();

  const showTournamentEntry: ToastMessages["showTournamentEntry"] = ({
    tournamentName,
    game,
    entryFeeUsdCost,
    hasEntryFee,
    startsIn,
    duration,
    prizeTotalUsd,
  }) => {
    toast({
      title: "Entered Tournament!",
      description: (
        <div className="flex flex-col gap-1">
          <p>Entered tournament {tournamentName}</p>
          <XShareButton
            text={[
              `I just entered the ${game} "${tournamentName}" tournament on Budokan, the premier onchain gaming arena.`,
              "",
              `🎫 ${
                hasEntryFee
                  ? `Entry fee: $${roundUSDPrice(entryFeeUsdCost!)}`
                  : "Free"
              }`,
              `💰 Total Prizes: $${roundUSDPrice(prizeTotalUsd)}`,
              `🏁 ${
                startsIn <= 0 ? "Started" : `Starts in: ${formatTime(startsIn)}`
              }`,
              `⏳ ${
                startsIn <= 0
                  ? `Ends in: ${formatTime(duration + startsIn)}`
                  : `Live for: ${formatTime(duration)}`
              }`,
              "",
              `Join the fun now at @budokan_gg for a chance to win exciting prizes!`,
            ].join("\n")}
            className="w-fit"
          />
        </div>
      ),
    });
  };

  const showTournamentCreation: ToastMessages["showTournamentCreation"] = ({
    tournamentName,
    game,
    hasEntryFee,
    entryFeeUsdCost,
    startsIn,
    duration,
    tournamentId,
  }) => {
    toast({
      title: "Created Tournament!",
      description: (
        <div className="flex flex-col gap-1">
          <p>Created tournament {tournamentName}</p>
          <XShareButton
            text={[
              `I just created the "${tournamentName}" tournament on Budokan, the premier onchain gaming arena.`,
              "",
              `🆔 Tournament ID: ${tournamentId}`,
              `🎮 ${game}`,
              `🎫 ${
                hasEntryFee
                  ? `Entry fee: $${roundUSDPrice(entryFeeUsdCost!)}`
                  : "Free Entry"
              }`,
              `⏳ ${
                startsIn <= 0
                  ? `Ends in: ${formatTime(duration + startsIn)}`
                  : `Live for: ${formatTime(duration)}`
              }`,
              "",
              `Join the fun now at @budokan_gg!`,
            ].join("\n")}
            className="w-fit"
          />
        </div>
      ),
    });
  };

  const showScoreSubmission: ToastMessages["showScoreSubmission"] = (
    tournamentName
  ) => {
    toast({
      title: "Submitted Scores!",
      description: `Submitted scores for the "${tournamentName}" tournament`,
    });
  };

  const showPrizeAddition: ToastMessages["showPrizeAddition"] = ({
    tournamentName,
    prizeTotalUsd,
  }) => {
    toast({
      title: "Added Prize!",
      description: (
        <div className="flex flex-col gap-1">
          <p>Added prize to the "{tournamentName}" tournament</p>
          <XShareButton
            text={[
              `I just added $${prizeTotalUsd} to the prize pool for the "${tournamentName}" tournament on Budokan, the premier onchain gaming arena.`,
              "",
              `Join the fun now at @budokan_gg!`,
            ].join("\n")}
            className="w-fit"
          />
        </div>
      ),
    });
  };

  const showPrizeDistribution: ToastMessages["showPrizeDistribution"] = (
    tournamentName
  ) => {
    toast({
      title: "Distributed Prizes!",
      description: `Distributed prizes for the "${tournamentName}" tournament`,
    });
  };

  return {
    showTournamentEntry,
    showTournamentCreation,
    showScoreSubmission,
    showPrizeAddition,
    showPrizeDistribution,
  };
};
