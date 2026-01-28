import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { feltToString, formatNumber, indexAddress } from "@/lib/utils";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { useNavigate } from "react-router-dom";
import Countdown from "@/components/Countdown";
import { Tournament, Prize } from "@/generated/models.gen";
import { TokenMetadata } from "@/lib/types";
import { useDojo } from "@/context/dojo";
import {
  groupPrizesByTokens,
  extractEntryFeePrizes,
} from "@/lib/utils/formatting";
import { TabType } from "@/components/overview/TournamentTabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useUIStore from "@/hooks/useUIStore";
import { Badge } from "@/components/ui/badge";
import { ChainId } from "@/dojo/setup/networks";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { useTournamentPrizeValue } from "@/hooks/useTournamentPrizeValue";
import { Lock } from "lucide-react";

interface TokenTotal {
  tokenAddress: string;
  tokenType: string;
  totalAmount: number;
}

interface Aggregations {
  token_totals?: TokenTotal[];
}

interface TournamentCardProps {
  tournament: Tournament;
  index: number;
  status: TabType;
  prizes: Prize[] | null;
  entryCount: number;
  tokens: TokenMetadata[];
  tokenPrices: TokenPrices;
  pricesLoading: boolean;
  tokenDecimals: Record<string, number>;
  aggregations?: Aggregations;
}

export const TournamentCard = ({
  tournament,
  index: _index,
  status,
  prizes,
  entryCount,
  tokens,
  tokenPrices,
  pricesLoading,
  tokenDecimals,
  aggregations,
}: TournamentCardProps) => {
  const { selectedChainConfig } = useDojo();
  const navigate = useNavigate();
  const { gameData, getGameImage } = useUIStore();

  const entryFeeToken = tournament?.entry_fee.Some?.token_address;
  const entryFeeTokenSymbol = tokens.find(
    (t) => indexAddress(t.token_address) === indexAddress(entryFeeToken ?? ""),
  )?.symbol;

  // Use distribution_positions from entry fee if available, otherwise use entry count
  const leaderboardSize =
    tournament?.entry_fee?.Some?.distribution_positions?.isSome()
      ? Number(tournament.entry_fee.Some.distribution_positions.Some)
      : entryCount;

  const { distributionPrizes } = extractEntryFeePrizes(
    tournament?.id,
    tournament?.entry_fee,
    entryCount,
    leaderboardSize,
  );

  const allPrizes = [...distributionPrizes, ...(prizes ?? [])];

  const groupedPrizes = groupPrizesByTokens(allPrizes, tokens);

  // Calculate total prize value using the hook
  const totalPrizesValueUSD = useTournamentPrizeValue({
    aggregations,
    distributionPrizes,
    tokenPrices,
    pricesLoading,
    tokenDecimals,
  });

  // Get unique tokens from all prizes (ERC20 + ERC721) for logo display
  const uniquePrizeTokens = useMemo(() => {
    const tokenMap = new Map<
      string,
      { address: string; symbol: string; logo?: string; type: string }
    >();

    Object.entries(groupedPrizes).forEach(([, prize]) => {
      const token = tokens.find(
        (t) => indexAddress(t.token_address) === indexAddress(prize.address),
      );
      if (token && !tokenMap.has(token.token_address)) {
        const logo = getTokenLogoUrl(
          selectedChainConfig.chainId ?? ChainId.SN_MAIN,
          token.token_address,
        );
        tokenMap.set(token.token_address, {
          address: token.token_address,
          symbol: token.symbol,
          logo,
          type: prize.type,
        });
      }
    });

    return Array.from(tokenMap.values());
  }, [groupedPrizes, tokens, selectedChainConfig.chainId]);

  console.log(uniquePrizeTokens);

  const startDate = new Date(Number(tournament.schedule.game.start) * 1000);
  const currentDate = new Date();
  const currentTimestamp = Math.floor(currentDate.getTime() / 1000);

  // Determine tournament status based on schedule
  const registrationStart = tournament?.schedule?.registration?.isSome()
    ? Number(tournament.schedule.registration.Some?.start)
    : null;
  const registrationEnd = tournament?.schedule?.registration?.isSome()
    ? Number(tournament.schedule.registration.Some?.end)
    : null;
  const gameStart = Number(tournament?.schedule?.game?.start ?? 0);
  const gameEnd = Number(tournament?.schedule?.game?.end ?? 0);
  const submissionDuration = tournament?.schedule?.submission_duration
    ? Number(tournament.schedule.submission_duration)
    : null;
  const submissionEnd = submissionDuration
    ? gameEnd + submissionDuration
    : null;

  const getTournamentStatus = () => {
    // Registration phase
    if (registrationStart && registrationEnd) {
      if (currentTimestamp < registrationStart) {
        return { text: "Upcoming", variant: "outline" as const };
      }
      if (
        currentTimestamp >= registrationStart &&
        currentTimestamp < registrationEnd
      ) {
        return { text: "Registration", variant: "success" as const };
      }
    }

    // Game hasn't started yet
    if (currentTimestamp < gameStart) {
      return { text: "Upcoming", variant: "outline" as const };
    }

    // Game is live
    if (currentTimestamp >= gameStart && currentTimestamp < gameEnd) {
      return { text: "Live", variant: "success" as const };
    }

    // Submission phase
    if (
      submissionEnd &&
      currentTimestamp >= gameEnd &&
      currentTimestamp < submissionEnd
    ) {
      return { text: "Submission", variant: "warning" as const };
    }

    // Tournament ended
    return { text: "Ended", variant: "destructive" as const };
  };

  const tournamentStatus = getTournamentStatus();

  const gameAddress = tournament.game_config.address;
  const gameName = gameData.find(
    (game) => game.contract_address === gameAddress,
  )?.name;
  const gameImage = getGameImage(gameAddress);

  const hasEntryFee = tournament?.entry_fee.isSome();

  const entryFeeInfo = useMemo(() => {
    if (!tournament?.entry_fee.isSome()) {
      return { type: "free" as const };
    }

    const normalizedEntryFeeToken = indexAddress(entryFeeToken ?? "");
    const entryFeeDecimals = tokenDecimals[normalizedEntryFeeToken] || 18;
    const entryFeePrice = entryFeeToken
      ? tokenPrices[normalizedEntryFeeToken]
      : undefined;

    const amount = Number(tournament?.entry_fee.Some?.amount!);
    const humanAmount = amount / 10 ** entryFeeDecimals;

    // Return token amount if price is not available
    if (!entryFeePrice || isNaN(entryFeePrice)) {
      return {
        type: "token" as const,
        tokenAmount: formatNumber(humanAmount),
        symbol: entryFeeTokenSymbol ?? "",
      };
    }

    return {
      type: "usd" as const,
      usdAmount: (humanAmount * entryFeePrice).toFixed(2),
    };
  }, [
    tournament?.entry_fee,
    entryFeeToken,
    entryFeeTokenSymbol,
    tokenDecimals,
    tokenPrices,
  ]);

  const isRestricted = tournament?.entry_requirement.isSome();

  // Compute countdown info once for reuse
  const countdownInfo = useMemo(() => {
    const isSubmissionPhase =
      submissionEnd &&
      currentTimestamp >= gameEnd &&
      currentTimestamp < submissionEnd;

    if (isSubmissionPhase) {
      return { targetTimestamp: submissionEnd!, label: "Submit" };
    }
    if (currentTimestamp >= gameStart && currentTimestamp < gameEnd) {
      return { targetTimestamp: gameEnd, label: "Ends" };
    }
    if (currentTimestamp < gameStart) {
      return { targetTimestamp: gameStart, label: "Starts" };
    }
    return null;
  }, [submissionEnd, currentTimestamp, gameEnd, gameStart]);

  return (
    <Card
      variant="outline"
      interactive={true}
      onClick={() => {
        navigate(`/tournament/${Number(tournament.id).toString()}`);
      }}
      className="h-36 sm:h-44 w-full whitespace-normal animate-in fade-in zoom-in duration-300 ease-out overflow-hidden"
    >
      <div className="flex flex-col h-full">
        {/* Zone A — Header Bar */}
        <div className="flex flex-row justify-between items-center gap-2">
          <div className="flex flex-row items-center gap-1.5 min-w-0 flex-1">
            <Badge
              variant={tournamentStatus.variant}
              className="text-[10px] sm:text-xs px-1.5 py-0 sm:py-0.5 rounded-md h-5 flex-shrink-0"
            >
              {tournamentStatus.text}
            </Badge>
            {isRestricted && (
              <Lock className="w-3 h-3 text-brand-muted flex-shrink-0" />
            )}
            <p className="truncate min-w-0 font-brand text-sm sm:text-base">
              {feltToString(tournament?.metadata?.name!)}
            </p>
          </div>
          <div className="flex-shrink-0">
            <Tooltip delayDuration={50}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center">
                  <TokenGameIcon image={gameImage} size={"xs"} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" sideOffset={-10}>
                {gameName ? gameName : "Unknown"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-brand/15 my-0.5 sm:my-1" />

        {/* Zone B — Hero Area (Prize Pool) */}
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 overflow-hidden">
          {totalPrizesValueUSD > 0 || uniquePrizeTokens.length > 0 ? (
            <>
              <div className="flex flex-row items-center gap-1">
                {uniquePrizeTokens.length > 0 && (
                  <div className="flex flex-row items-center">
                    {uniquePrizeTokens.slice(0, 3).map((token, idx) => (
                      <Tooltip key={idx} delayDuration={50}>
                        <TooltipTrigger asChild>
                          <div
                            className="relative rounded-full border border-background"
                            style={{
                              marginLeft: idx > 0 ? "-4px" : 0,
                              zIndex: 3 - idx,
                            }}
                          >
                            {token.logo ? (
                              <img
                                src={token.logo}
                                alt={token.symbol}
                                className="w-4 h-4 sm:w-6 sm:h-6 rounded-full"
                              />
                            ) : (
                              <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-brand/20 flex items-center justify-center text-[7px] sm:text-[10px]">
                                {token.symbol.slice(0, 2)}
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          <p>{token.symbol}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {uniquePrizeTokens.length > 3 && (
                      <div
                        className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-brand/20 flex items-center justify-center text-[7px] sm:text-[10px] border border-background"
                        style={{ marginLeft: "-4px", zIndex: 0 }}
                      >
                        +{uniquePrizeTokens.length - 3}
                      </div>
                    )}
                  </div>
                )}
                {totalPrizesValueUSD > 0 && (
                  <span className="font-brand text-lg sm:text-2xl text-brand">
                    ${formatNumber(totalPrizesValueUSD)}
                  </span>
                )}
              </div>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted">
                Prize Pool
              </span>
            </>
          ) : !hasEntryFee ? (
            <>
              <span className="font-brand text-lg sm:text-2xl text-success">
                FREE
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted">
                Prize Pool
              </span>
            </>
          ) : (
            <>
              <span className="font-brand text-lg sm:text-2xl text-brand-muted">
                -
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted">
                Prize Pool
              </span>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-brand/15 my-0.5 sm:my-1" />

        {/* Zone C — Footer Bar */}
        <div className="flex flex-row justify-between items-center">
          {/* Entry Fee */}
          <div className="flex flex-col items-center">
            <span className="text-xs sm:text-sm font-medium">
              {hasEntryFee ? (
                entryFeeInfo.type === "usd" ? (
                  `$${entryFeeInfo.usdAmount}`
                ) : entryFeeInfo.type === "token" ? (
                  <span className="flex items-center gap-0.5">
                    {(() => {
                      const entryFeeTokenLogo = getTokenLogoUrl(
                        selectedChainConfig.chainId ?? ChainId.SN_MAIN,
                        entryFeeToken ?? "",
                      );
                      return entryFeeTokenLogo ? (
                        <Tooltip delayDuration={50}>
                          <TooltipTrigger asChild>
                            <img
                              src={entryFeeTokenLogo}
                              alt={entryFeeTokenSymbol ?? ""}
                              className="w-3.5 h-3.5 rounded-full"
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" align="center">
                            <p>{entryFeeTokenSymbol}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : null;
                    })()}
                    {entryFeeInfo.tokenAmount}
                  </span>
                ) : (
                  "FREE"
                )
              ) : (
                <span className="text-success">FREE</span>
              )}
            </span>
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted">
              Entry
            </span>
          </div>

          {/* Entries Count */}
          <div className="flex flex-col items-center">
            <span className="text-xs sm:text-sm font-medium">{entryCount}</span>
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted">
              Entries
            </span>
          </div>

          {/* Timing */}
          <div className="flex flex-col items-center">
            {countdownInfo ? (
              <>
                <div className="sm:hidden">
                  <Countdown
                    targetTimestamp={countdownInfo.targetTimestamp}
                    label={countdownInfo.label}
                    labelPosition="horizontal"
                    size="xs"
                  />
                </div>
                <div className="hidden sm:block">
                  <Countdown
                    targetTimestamp={countdownInfo.targetTimestamp}
                    label={countdownInfo.label}
                    labelPosition="horizontal"
                    size="sm"
                  />
                </div>
              </>
            ) : status === "ended" ? (
              <>
                <Tooltip delayDuration={50}>
                  <TooltipTrigger asChild>
                    <span className="text-xs sm:text-sm font-medium">
                      {startDate.toLocaleDateString(undefined, {
                        month: "numeric",
                        day: "numeric",
                      })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center">
                    <p>
                      Started:{" "}
                      {startDate.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      {startDate.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted">
                  Ended
                </span>
              </>
            ) : (
              <span className="text-xs sm:text-sm text-brand-muted">-</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
