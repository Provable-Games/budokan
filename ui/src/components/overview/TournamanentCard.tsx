import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { feltToString, formatTime } from "@/lib/utils";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { SOLID_CLOCK, USER, CALENDAR } from "@/components/Icons";
import { useNavigate } from "react-router-dom";
import { Tournament, Prize } from "@/generated/models.gen";
import { TokenMetadata } from "@/lib/types";
import { useDojo } from "@/context/dojo";
import {
  groupPrizesByTokens,
  calculateTotalValue,
  countTotalNFTs,
  extractEntryFeePrizes,
} from "@/lib/utils/formatting";
import { TabType } from "@/components/overview/TournamentTabs";
import { Skeleton } from "@/components/ui/skeleton";
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
}

export const TournamentCard = ({
  tournament,
  index,
  status,
  prizes,
  entryCount,
  tokens,
  tokenPrices,
  pricesLoading,
  tokenDecimals,
}: TournamentCardProps) => {
  const { selectedChainConfig } = useDojo();
  const navigate = useNavigate();
  const { gameData, getGameImage } = useUIStore();

  const entryFeeToken = tournament?.entry_fee.Some?.token_address;
  const entryFeeTokenSymbol = tokens.find(
    (t) => t.token_address === entryFeeToken
  )?.symbol;

  // Use distribution_positions from entry fee if available, otherwise use entry count
  const leaderboardSize = tournament?.entry_fee?.Some?.distribution_positions?.isSome()
    ? Number(tournament.entry_fee.Some.distribution_positions.Some)
    : entryCount;

  const { distributionPrizes } = extractEntryFeePrizes(
    tournament?.id,
    tournament?.entry_fee,
    entryCount,
    leaderboardSize
  );

  const allPrizes = [...distributionPrizes, ...(prizes ?? [])];

  const groupedPrizes = groupPrizesByTokens(allPrizes, tokens);

  const totalPrizesValueUSD = calculateTotalValue(
    groupedPrizes,
    tokenPrices,
    tokenDecimals
  );
  const totalPrizeNFTs = countTotalNFTs(groupedPrizes);

  // Get unique ERC20 tokens from prizes for display
  const uniqueErc20Tokens = useMemo(() => {
    const tokenMap = new Map<
      string,
      { address: string; symbol: string; logo?: string }
    >();

    Object.entries(groupedPrizes).forEach(([, prize]) => {
      if (prize.type === "erc20") {
        const token = tokens.find((t) => t.token_address === prize.address);
        if (token && !tokenMap.has(token.token_address)) {
          const logo = getTokenLogoUrl(
            selectedChainConfig.chainId ?? ChainId.SN_MAIN,
            token.token_address
          );
          tokenMap.set(token.token_address, {
            address: token.token_address,
            symbol: token.symbol,
            logo,
          });
        }
      }
    });

    return Array.from(tokenMap.values());
  }, [groupedPrizes, tokens, selectedChainConfig.chainId]);

  const startDate = new Date(Number(tournament.schedule.game.start) * 1000);
  const endDate = new Date(Number(tournament.schedule.game.end) * 1000);
  const duration =
    Number(tournament.schedule.game.end) -
    Number(tournament.schedule.game.start);
  const currentDate = new Date();
  const currentTimestamp = Math.floor(currentDate.getTime() / 1000);
  const startsInSeconds = (startDate.getTime() - currentDate.getTime()) / 1000;
  const startsIn = formatTime(startsInSeconds);
  const endsInSeconds = (endDate.getTime() - currentDate.getTime()) / 1000;
  const endsIn = formatTime(endsInSeconds);

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
  const submissionEnd = submissionDuration ? gameEnd + submissionDuration : null;

  const getTournamentStatus = () => {
    // Registration phase
    if (registrationStart && registrationEnd) {
      if (currentTimestamp < registrationStart) {
        return { text: "Upcoming", variant: "outline" as const };
      }
      if (currentTimestamp >= registrationStart && currentTimestamp < registrationEnd) {
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
    if (submissionEnd && currentTimestamp >= gameEnd && currentTimestamp < submissionEnd) {
      return { text: "Submission", variant: "warning" as const };
    }

    // Tournament ended
    return { text: "Ended", variant: "destructive" as const };
  };

  const tournamentStatus = getTournamentStatus();

  const gameAddress = tournament.game_config.address;
  const gameName = gameData.find(
    (game) => game.contract_address === gameAddress
  )?.name;
  const gameImage = getGameImage(gameAddress);

  const hasEntryFee = tournament?.entry_fee.isSome();

  const entryFee = tournament?.entry_fee.isSome()
    ? (() => {
        const entryFeeDecimals = tokenDecimals[entryFeeToken ?? ""] || 18;
        return (
          Number(
            BigInt(tournament?.entry_fee.Some?.amount!) /
              10n ** BigInt(entryFeeDecimals)
          ) * Number(tokenPrices[entryFeeTokenSymbol ?? ""] ?? 0)
        ).toFixed(2);
      })()
    : "Free";

  const renderDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return (
        <div className="flex flex-row items-center gap-0.5">
          <span>{days}</span>
          <span>D</span>
        </div>
      );
    } else if (hours > 0) {
      return (
        <div className="flex flex-row items-center gap-0.5">
          <span>{hours}</span>
          <span>H</span>
        </div>
      );
    } else if (minutes > 0) {
      return (
        <div className="flex flex-row items-center gap-0.5">
          <span>{minutes}</span>
          <span>min{minutes > 1 ? "s" : ""}</span>
        </div>
      );
    } else {
      return (
        <div className="flex flex-row items-center gap-0.5">
          <span>{seconds}</span>
          <span>sec{seconds > 1 ? "s" : ""}</span>
        </div>
      );
    }
  };

  const isRestricted = tournament?.entry_requirement.isSome();
  const hasEntryLimit =
    Number(tournament?.entry_requirement?.Some?.entry_limit) > 0;
  const entryLimit = tournament?.entry_requirement?.Some?.entry_limit;
  const requirementVariant =
    tournament?.entry_requirement.Some?.entry_requirement_type?.activeVariant();
  const tournamentRequirementVariant =
    tournament?.entry_requirement.Some?.entry_requirement_type?.variant?.tournament?.activeVariant();

  const renderTimeClass = (time: number) => {
    if (time > 3600) {
      return "text-success";
    } else {
      return "text-warning";
    }
  };

  return (
    <Card
      variant="outline"
      interactive={true}
      onClick={() => {
        navigate(`/tournament/${Number(tournament.id).toString()}`);
      }}
      className="h-32 sm:h-48 animate-in fade-in zoom-in duration-300 ease-out"
    >
      <div className="flex flex-col justify-between h-full">
        <div className="flex flex-col gap-2">
          <div className="flex flex-row justify-between text-lg 2xl:text-xl h-6">
            <p className="truncate w-2/3 font-brand">
              {feltToString(tournament?.metadata?.name!)}
            </p>
            <div className="flex flex-row gap-2 w-1/3 justify-end">
              <Tooltip delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="flex flex-row items-center">
                    <span className="w-6">
                      <SOLID_CLOCK />
                    </span>
                    <span className="text-sm tracking-tight">
                      {renderDuration(duration)}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>Duration</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="flex flex-row items-center">
                    <span className="w-7">
                      <USER />
                    </span>
                    <span>{entryCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>Entries</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="hidden sm:block w-full h-0.5 bg-brand/25" />
        </div>
        <div className="flex flex-row items-center">
          <div className="relative w-3/4">
            <div className="flex flex-row sm:flex-wrap items-center gap-2 overflow-x-auto sm:overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* Tournament Status */}
              <Tooltip delayDuration={50}>
              <TooltipTrigger asChild>
                <div className="flex-shrink-0">
                  <Badge variant={tournamentStatus.variant} className="text-xs p-1 rounded-md">
                    {tournamentStatus.text}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                <p>Tournament Status: {tournamentStatus.text}</p>
              </TooltipContent>
            </Tooltip>

            {/* Restricte Access */}
            {isRestricted && (
              <Tooltip delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="text-xs p-1 rounded-md">
                      Restricted
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <span>
                    {requirementVariant === "allowlist" ? (
                      "Allowlist"
                    ) : requirementVariant === "token" ? (
                      "Token"
                    ) : requirementVariant === "tournament" ? (
                      <span>
                        Tournament{" "}
                        <span className="capitalize">
                          {tournamentRequirementVariant}
                        </span>
                      </span>
                    ) : (
                      "Unknown"
                    )}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Limited Entry */}
            {hasEntryLimit && (
              <Tooltip delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="text-xs p-1 rounded-md">
                      {Number(entryLimit) === 1
                        ? `${Number(entryLimit)} entry`
                        : `${Number(entryLimit)} entries`}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>
                    {Number(entryLimit) === 1
                      ? `${Number(entryLimit)} entry`
                      : `${Number(entryLimit)} entries`}{" "}
                    per qualification
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Start Date - for ended tournaments */}
            {status === "ended" && (
              <Tooltip delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="text-xs p-1 rounded-md flex items-center gap-1">
                      <span className="w-4 h-4">
                        <CALENDAR />
                      </span>
                      {startDate.toLocaleDateString(undefined, {
                        month: "numeric",
                        day: "numeric",
                      })}/{startDate.getFullYear().toString().slice(-2)}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  <p>
                    Started: {startDate.toLocaleDateString(undefined, {
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
            )}
            </div>
          </div>

          <div className="flex flex-row w-1/4 justify-end sm:px-2">
            <Tooltip delayDuration={50}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center">
                  <TokenGameIcon key={index} image={gameImage} size={"md"} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" sideOffset={-10}>
                {gameName ? gameName : "Unknown"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-row items-center justify-center gap-5 w-full mx-auto">
          {/* Time Status */}
          {status === "upcoming" ? (
            <div className="flex flex-row items-center gap-2">
              <span className="text-brand-muted">Starts In:</span>
              <span className={renderTimeClass(startsInSeconds)}>
                {startsIn}
              </span>
            </div>
          ) : status === "live" ? (
            <div className="flex flex-row items-center gap-2">
              <span className="text-brand-muted">Ends In:</span>
              <span className={renderTimeClass(endsInSeconds)}>{endsIn}</span>
            </div>
          ) : (
            <></>
          )}
          <div className="flex flex-row items-center gap-2">
            <span className="text-brand-muted">Fee:</span>
            {pricesLoading ? (
              <Skeleton className="h-6 w-16 bg-brand/20" />
            ) : hasEntryFee ? (
              <div className="flex flex-col items-center gap-1">
                {entryFeeTokenSymbol && (
                  <Tooltip delayDuration={50}>
                    <TooltipTrigger asChild>
                      <div className="relative hidden sm:block">
                        {(() => {
                          const entryFeeTokenLogo = getTokenLogoUrl(
                            selectedChainConfig.chainId ?? ChainId.SN_MAIN,
                            entryFeeToken ?? ""
                          );
                          return entryFeeTokenLogo ? (
                            <img
                              src={entryFeeTokenLogo}
                              alt={entryFeeTokenSymbol}
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-xs">
                              {entryFeeTokenSymbol.slice(0, 1)}
                            </div>
                          );
                        })()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      <p>{entryFeeTokenSymbol}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <span>${entryFee}</span>
              </div>
            ) : (
              <span>FREE</span>
            )}
          </div>
          <div className="flex flex-row items-center gap-2">
            <span className="text-brand-muted">Pot:</span>
            {pricesLoading ? (
              <Skeleton className="h-6 w-16 bg-brand/20" />
            ) : totalPrizesValueUSD > 0 || totalPrizeNFTs > 0 ? (
              <div className="flex flex-col items-center gap-1">
                {uniqueErc20Tokens.length > 0 && (
                  <div className="hidden sm:flex flex-row gap-1 items-center">
                    {uniqueErc20Tokens.slice(0, 3).map((token, idx) => (
                      <Tooltip key={idx} delayDuration={50}>
                        <TooltipTrigger asChild>
                          <div className="relative">
                            {token.logo ? (
                              <img
                                src={token.logo}
                                alt={token.symbol}
                                className="w-5 h-5 rounded-full"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center text-xs">
                                {token.symbol.slice(0, 1)}
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center">
                          <p>{token.symbol}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {uniqueErc20Tokens.length > 3 && (
                      <span className="text-xs text-brand-muted">
                        +{uniqueErc20Tokens.length - 3}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-row items-center gap-2">
                  {totalPrizesValueUSD > 0 && (
                    <span>${totalPrizesValueUSD.toFixed(2)}</span>
                  )}
                  {totalPrizeNFTs > 0 && (
                    <span>
                      {totalPrizeNFTs} NFT{totalPrizeNFTs === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span>No Prizes</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
