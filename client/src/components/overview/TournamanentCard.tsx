import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatNumber, indexAddress } from "@/lib/utils";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { useNavigate } from "react-router-dom";
import Countdown from "@/components/Countdown";
import type { Tournament, Prize } from "@provable-games/budokan-sdk";
import { TokenMetadata } from "@/lib/types";
import { useChainConfig } from "@/context/chain";
import { TabType } from "@/components/overview/TournamentTabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useUIStore from "@/hooks/useUIStore";
import { Badge } from "@/components/ui/badge";
import { ChainId } from "@/chain/setup/networks";
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
  const { selectedChainConfig } = useChainConfig();
  const navigate = useNavigate();
  const { gameData, getGameImage } = useUIStore();

  const entryFeeData = tournament.entryFee;
  // Fall back to flat summary fields when full JSONB isn't available (e.g. list endpoint)
  const entryFeeToken = entryFeeData?.tokenAddress ?? tournament.entryFeeToken ?? null;
  const entryFeeAmount = entryFeeData?.amount ?? tournament.entryFeeAmount ?? null;
  const entryFeeTokenSymbol = tokens.find(
    (t) => indexAddress(t.token_address) === indexAddress(entryFeeToken ?? ""),
  )?.symbol;

  // Compute entry fee pool value directly from SDK data
  const entryFeePoolValue = useMemo(() => {
    if (!entryFeeToken || !entryFeeAmount || entryCount === 0) return 0;
    const amount = BigInt(entryFeeAmount);
    if (amount === 0n) return 0;
    const totalCollected = amount * BigInt(entryCount);
    const creatorShare = Number(entryFeeData?.tournamentCreatorShare ?? 0);
    const gameShare = Number(entryFeeData?.gameCreatorShare ?? 0);
    const refundShare = Number(entryFeeData?.refundShare ?? 0);
    const poolBps = 10000 - creatorShare - gameShare - refundShare;
    const poolAmount = poolBps > 0 ? (totalCollected * BigInt(poolBps)) / 10000n : 0n;
    const normalizedAddr = indexAddress(entryFeeToken);
    const decimals = tokenDecimals[normalizedAddr] || 18;
    const price = tokenPrices[normalizedAddr] ?? 0;
    return (Number(poolAmount) / 10 ** decimals) * price;
  }, [entryFeeData, entryFeeToken, entryFeeAmount, entryCount, tokenDecimals, tokenPrices]);

  // Calculate total prize value from aggregations + entry fee pool
  const totalPrizesValueUSD = useTournamentPrizeValue({
    aggregations,
    distributionPrizes: [],
    tokenPrices,
    pricesLoading,
    tokenDecimals,
  }) + entryFeePoolValue;

  // Get unique tokens for logo display
  const uniquePrizeTokens = useMemo(() => {
    const tokenSet = new Map<string, { address: string; symbol: string; logo?: string; type: string }>();
    // From entry fee
    if (entryFeeToken) {
      const token = tokens.find((tk) => indexAddress(tk.token_address) === indexAddress(entryFeeToken));
      if (token) {
        tokenSet.set(token.token_address, {
          address: token.token_address,
          symbol: token.symbol,
          logo: getTokenLogoUrl(selectedChainConfig.chainId ?? ChainId.SN_MAIN, token.token_address),
          type: "erc20",
        });
      }
    }
    // From aggregation prize data
    if (aggregations?.token_totals) {
      for (const total of aggregations.token_totals) {
        const token = tokens.find((tk) => indexAddress(tk.token_address) === indexAddress(total.tokenAddress));
        if (token && !tokenSet.has(token.token_address)) {
          tokenSet.set(token.token_address, {
            address: token.token_address,
            symbol: token.symbol,
            logo: getTokenLogoUrl(selectedChainConfig.chainId ?? ChainId.SN_MAIN, token.token_address),
            type: total.tokenType,
          });
        }
      }
    }
    return Array.from(tokenSet.values());
  }, [entryFeeToken, tokens, aggregations, selectedChainConfig.chainId]);


  // Use pre-computed timestamps from SDK
  const gameStart = Number(tournament.gameStartTime ?? 0);
  const gameEnd = Number(tournament.gameEndTime ?? 0);
  const registrationStart = tournament.registrationStartTime ? Number(tournament.registrationStartTime) : null;
  const registrationEnd = tournament.registrationEndTime ? Number(tournament.registrationEndTime) : null;
  const submissionEnd = tournament.submissionEndTime ? Number(tournament.submissionEndTime) : null;

  const startDate = new Date(gameStart * 1000);
  const currentDate = new Date();
  const currentTimestamp = Math.floor(currentDate.getTime() / 1000);

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

  const gameAddress = tournament.gameAddress;
  const gameName = gameData.find(
    (game) => game.contract_address === gameAddress,
  )?.name;
  const gameImage = getGameImage(gameAddress);

  const hasEntryFee = !!entryFeeToken && !!entryFeeAmount;

  const entryFeeInfo = useMemo(() => {
    if (!entryFeeToken || !entryFeeAmount) {
      return { type: "free" as const };
    }

    const normalizedEntryFeeToken = indexAddress(entryFeeToken);
    const entryFeeDecimals = tokenDecimals[normalizedEntryFeeToken] || 18;
    const entryFeePrice = tokenPrices[normalizedEntryFeeToken];

    const amount = Number(entryFeeAmount);
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
    entryFeeToken,
    entryFeeAmount,
    entryFeeTokenSymbol,
    tokenDecimals,
    tokenPrices,
  ]);

  const isRestricted = !!tournament.entryRequirement;

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
              {tournament.name ?? tournament.metadata?.name}
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
