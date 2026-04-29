import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn, formatNumber, indexAddress } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
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
import { ChainId } from "@/chain/setup/networks";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { useTournamentPrizeValue } from "@/hooks/useTournamentPrizeValue";
import { QUESTION } from "@/components/Icons";
import { Lock, Ticket, Users, Clock, CalendarDays } from "lucide-react";

// Compact countdown — shows the two largest non-zero units, e.g. "6d 3h",
// "3h 12m", "12m 45s". Falls back to "0s" when the target is reached.
const CompactCountdown = ({ target }: { target: number }) => {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, target - Math.floor(Date.now() / 1000)),
  );

  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, target - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  let text: string;
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${minutes}m`;
  else if (minutes > 0) text = `${minutes}m ${seconds}s`;
  else text = `${seconds}s`;

  return <>{text}</>;
};

type StatusKey =
  | "upcoming"
  | "registration"
  | "live"
  | "submission"
  | "ended";

const STATUS_STYLES: Record<
  StatusKey,
  { label: string; className: string; pulse?: boolean }
> = {
  upcoming: {
    label: "Upcoming",
    className: "bg-neutral/10 text-neutral border-neutral/30",
  },
  registration: {
    label: "Registration",
    className: "bg-brand/10 text-brand border-brand/30",
  },
  live: {
    label: "Live",
    className: "bg-success/15 text-success border-success/40",
    pulse: true,
  },
  submission: {
    label: "Submission",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  ended: {
    label: "Ended",
    className: "bg-brand-muted/15 text-brand-muted border-brand-muted/30",
  },
};

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
  prizes: _prizes,
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

  const statusKey: StatusKey = (() => {
    if (registrationStart && registrationEnd) {
      if (currentTimestamp < registrationStart) return "upcoming";
      if (
        currentTimestamp >= registrationStart &&
        currentTimestamp < registrationEnd
      ) {
        return "registration";
      }
    }
    if (currentTimestamp < gameStart) return "upcoming";
    if (currentTimestamp >= gameStart && currentTimestamp < gameEnd) return "live";
    if (
      submissionEnd &&
      currentTimestamp >= gameEnd &&
      currentTimestamp < submissionEnd
    ) {
      return "submission";
    }
    return "ended";
  })();

  const statusStyle = STATUS_STYLES[statusKey];

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
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider flex-shrink-0",
                statusStyle.className,
              )}
            >
              {statusStyle.pulse && (
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-60 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
                </span>
              )}
              {statusStyle.label}
            </span>
            {isRestricted && (
              <Lock className="w-3 h-3 text-brand-muted flex-shrink-0" />
            )}
            <p className="truncate min-w-0 font-brand text-sm sm:text-base">
              {tournament.name ?? (tournament.metadata as any)?.name}
            </p>
          </div>
          <Tooltip delayDuration={50}>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-md overflow-hidden bg-black/40 border border-brand/20 text-brand/40">
                {gameImage ? (
                  <img
                    src={gameImage}
                    alt={gameName ?? "Game logo"}
                    width={32}
                    height={32}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="w-2/3 h-2/3">
                    <QUESTION />
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" sideOffset={-10}>
              {gameName ? gameName : "Unknown"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-brand/15 my-0.5 sm:my-1" />

        {/* Zone B — Hero Area (Prize Pool) */}
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 overflow-hidden">
          {totalPrizesValueUSD > 0 ? (
            <>
              <div className="flex flex-row items-center gap-2">
                {uniquePrizeTokens.length > 0 && (
                  <div className="flex flex-row items-center">
                    {uniquePrizeTokens.slice(0, 3).map((token, idx) => (
                      <Tooltip key={idx} delayDuration={50}>
                        <TooltipTrigger asChild>
                          <div
                            className="relative rounded-full"
                            style={{
                              marginLeft: idx > 0 ? "-8px" : 0,
                              zIndex: 3 - idx,
                            }}
                          >
                            {token.logo ? (
                              <img
                                src={token.logo}
                                alt={token.symbol}
                                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-black bg-black/40"
                              />
                            ) : (
                              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-black bg-brand-muted/20 flex items-center justify-center text-[10px] font-bold text-brand">
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
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-black bg-neutral/20 flex items-center justify-center text-[10px] font-bold text-neutral"
                        style={{ marginLeft: "-8px", zIndex: 0 }}
                      >
                        +{uniquePrizeTokens.length - 3}
                      </div>
                    )}
                  </div>
                )}
                {totalPrizesValueUSD > 0 && (
                  <span className="font-brand font-extrabold text-lg sm:text-2xl text-brand leading-none">
                    ${formatNumber(totalPrizesValueUSD)}
                  </span>
                )}
              </div>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted leading-none mt-1">
                Prize Pool
              </span>
            </>
          ) : (
            <>
              <span className="font-brand text-lg sm:text-2xl text-brand-muted leading-none">
                -
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-brand-muted leading-none mt-1">
                Prize Pool
              </span>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-brand/15 my-0.5 sm:my-1" />

        {/* Zone C — Footer (no chip frame, just icon + value + micro-label) */}
        <div className="grid grid-cols-3 gap-1">
          {/* Entry Fee */}
          <div className="flex flex-col items-center justify-center">
            <div className="flex flex-row items-center gap-1 min-w-0">
              {hasEntryFee && entryFeeInfo.type === "token" ? (
                (() => {
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
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center">
                        <p>{entryFeeTokenSymbol}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Ticket className="w-3.5 h-3.5 text-brand opacity-70 flex-shrink-0" />
                  );
                })()
              ) : (
                <Ticket
                  className={cn(
                    "w-3.5 h-3.5 flex-shrink-0",
                    hasEntryFee ? "text-brand opacity-70" : "text-brand-muted opacity-70",
                  )}
                />
              )}
              <span
                className={cn(
                  "font-brand font-bold text-xs sm:text-sm truncate",
                  hasEntryFee ? "text-brand" : "text-brand-muted",
                )}
              >
                {hasEntryFee
                  ? entryFeeInfo.type === "usd"
                    ? `$${entryFeeInfo.usdAmount}`
                    : entryFeeInfo.type === "token"
                      ? entryFeeInfo.tokenAmount
                      : "Free"
                  : "Free"}
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-brand-muted leading-none mt-0.5">
              Entry
            </span>
          </div>

          {/* Players */}
          <div className="flex flex-col items-center justify-center">
            <div className="flex flex-row items-center gap-1">
              <Users className="w-3.5 h-3.5 text-brand opacity-70 flex-shrink-0" />
              <span className="font-brand font-bold text-xs sm:text-sm text-brand leading-none">
                {entryCount}
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-brand-muted leading-none mt-0.5">
              Players
            </span>
          </div>

          {/* Timing */}
          <div className="flex flex-col items-center justify-center">
            {countdownInfo ? (
              <>
                <div className="flex flex-row items-center gap-1 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-brand opacity-70 flex-shrink-0" />
                  <span className="font-brand font-bold text-xs sm:text-sm text-brand leading-none truncate">
                    <CompactCountdown
                      target={countdownInfo.targetTimestamp}
                    />
                  </span>
                </div>
                <span className="text-[9px] uppercase tracking-wider text-brand-muted leading-none mt-0.5">
                  {countdownInfo.label === "Submit"
                    ? "Submit"
                    : countdownInfo.label === "Ends"
                      ? "Ends In"
                      : "Starts In"}
                </span>
              </>
            ) : status === "ended" ? (
              <Tooltip delayDuration={50}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center">
                    <div className="flex flex-row items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5 text-brand-muted opacity-70 flex-shrink-0" />
                      <span className="font-brand font-bold text-xs sm:text-sm text-brand-muted leading-none">
                        {startDate.toLocaleDateString(undefined, {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-brand-muted leading-none mt-0.5">
                      Ended
                    </span>
                  </div>
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
            ) : (
              <>
                <span className="font-brand font-bold text-xs sm:text-sm text-brand-muted leading-none">
                  —
                </span>
                <span className="text-[9px] uppercase tracking-wider text-brand-muted leading-none mt-0.5">
                  Schedule
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
