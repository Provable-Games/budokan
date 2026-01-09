import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  ARROW_LEFT,
  TROPHY,
  MONEY,
  GIFT,
  SPACE_INVADER_SOLID,
  SLIDERS,
} from "@/components/Icons";
import { useNavigate, useParams } from "react-router-dom";
import { useProvider } from "@starknet-react/core";
import TournamentTimeline from "@/components/TournamentTimeline";
import Countdown from "@/components/Countdown";
import {
  feltToString,
  formatTime,
  indexAddress,
  padAddress,
  padU64,
} from "@/lib/utils";
import { addAddressPadding } from "starknet";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import {
  Tournament as TournamentModel,
  EntryCount,
  Leaderboard,
  getModelsMapping,
  PrizeMetrics,
} from "@/generated/models.gen";
import { useDojo } from "@/context/dojo";
import {
  extractEntryFeePrizes,
  processTournamentFromSql,
} from "@/lib/utils/formatting";
import { EnterTournamentDialog } from "@/components/dialogs/EnterTournament";
import ScoreTable from "@/components/tournament/table/ScoreTable";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useTournamentPrizeValue } from "@/hooks/useTournamentPrizeValue";
import MyEntries from "@/components/tournament/MyEntries";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { useGameTokens } from "metagame-sdk";
import EntryRequirements from "@/components/tournament/EntryRequirements";
import PrizesContainer from "@/components/tournament/prizes/PrizesContainer";
import { ClaimPrizesDialog } from "@/components/dialogs/ClaimPrizes";
import { SubmitScoresDialog } from "@/components/dialogs/SubmitScores";
import {
  useGetTournamentPrizesAggregations,
  useGetTournamentRewardClaimsAggregations,
  useGetTournaments,
  useGetTournamentsCount,
  useGetTournamentLeaderboards,
  useGetTournamentRegistrants,
} from "@/dojo/hooks/useSqlQueries";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import NotFound from "@/containers/NotFound";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useUIStore from "@/hooks/useUIStore";
import { useGetUsernames } from "@/hooks/useController";
import { AddPrizesDialog } from "@/components/dialogs/AddPrizes";
import { Skeleton } from "@/components/ui/skeleton";
import LoadingPage from "@/containers/LoadingPage";
import { Badge } from "@/components/ui/badge";
import { SettingsDialog } from "@/components/dialogs/Settings";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSettings } from "metagame-sdk/sql";
import { getEntityIdFromKeys } from "@dojoengine/utils";
import useModel from "@/dojo/hooks/useModel";
import { TOURNAMENT_VERSION_KEY } from "@/lib/constants";

const Tournament = () => {
  const { id } = useParams<{ id: string }>();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { namespace, selectedChainConfig } = useDojo();
  const { getTokenDecimals } = useSystemCalls();
  const { gameData, getGameImage } = useUIStore();
  const [enterDialogOpen, setEnterDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [submitScoresDialogOpen, setSubmitScoresDialogOpen] = useState(false);
  const [addPrizesDialogOpen, setAddPrizesDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tournamentExists, setTournamentExists] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {}
  );
  const [tokenDecimalsLoading, setTokenDecimalsLoading] = useState(false);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const [banRefreshTrigger, setBanRefreshTrigger] = useState(0);
  const { data: tournamentsCount } = useGetTournamentsCount({
    namespace: namespace,
  });

  // Fetch tournament data from SQL
  const { data: tournamentSqlData, loading: tournamentSqlLoading } =
    useGetTournaments({
      namespace: namespace,
      gameFilters: [],
      status: "tournaments",
      tournamentIds: id ? [padU64(BigInt(id))] : [],
      active: !!id,
      limit: 1,
    });

  // Process the tournament data from SQL
  const tournamentModel = useMemo(() => {
    if (!tournamentSqlData || tournamentSqlData.length === 0) return null;
    return processTournamentFromSql(tournamentSqlData[0]);
  }, [tournamentSqlData]) as TournamentModel | null;

  // Get entry count from SQL data
  const entryCountModel = useMemo(() => {
    if (!tournamentSqlData || tournamentSqlData.length === 0) return null;
    return {
      tournament_id: tournamentSqlData[0].id,
      count: tournamentSqlData[0].entry_count || 0,
    };
  }, [tournamentSqlData]) as EntryCount | null;

  const tournamentEntityId = useMemo(
    () => getEntityIdFromKeys([BigInt(id!)]),
    [id]
  );

  const subscribedEntryCountModel = useModel(
    tournamentEntityId,
    getModelsMapping(namespace).EntryCount
  ) as unknown as EntryCount;

  const subscribedEntryCount = Number(subscribedEntryCountModel?.count) ?? 0;

  const entryCount =
    subscribedEntryCount > 0
      ? subscribedEntryCount
      : Number(entryCountModel?.count) ?? 0;

  console.log(entryCount, subscribedEntryCount, entryCountModel);

  const prizeMetricsEntityId = getEntityIdFromKeys([
    BigInt(TOURNAMENT_VERSION_KEY),
  ]);

  const subscribedPrizesMetricsModel = useModel(
    prizeMetricsEntityId,
    getModelsMapping(namespace).PrizeMetrics
  ) as unknown as PrizeMetrics;

  console.log("subscribed prize metrics", subscribedPrizesMetricsModel);

  const subscribedPrizeCount =
    Number(subscribedPrizesMetricsModel?.total_prizes) ?? 0;

  // Fetch leaderboard from SQL
  const { data: leaderboardData } = useGetTournamentLeaderboards({
    namespace,
    tournamentIds: id ? [padU64(BigInt(id))] : [],
    active: !!id,
    limit: 1,
  });

  const leaderboardModel = useMemo(() => {
    if (!leaderboardData || leaderboardData.length === 0) return null;
    const lb = leaderboardData[0];
    return {
      tournament_id: lb.tournament_id,
      token_ids: lb.token_ids ? JSON.parse(lb.token_ids) : [],
    };
  }, [leaderboardData]) as Leaderboard | null;

  useEffect(() => {
    let timeoutId: number;

    const checkTournament = async () => {
      const tournamentId = Number(id || 0);

      // If we have the tournament count, we can check immediately
      if (tournamentsCount !== undefined) {
        setTournamentExists(tournamentId <= tournamentsCount);
        setLoading(false);
      } else {
        // Set a timeout to consider the tournament as "not found" if data doesn't load within 5 seconds
        timeoutId = window.setTimeout(() => {
          setTournamentExists(false);
          setLoading(false);
        }, 20000);
      }
    };

    checkTournament();

    // Clean up the timeout if the component unmounts or dependencies change
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [id, tournamentsCount]);

  // Get leaderboard size from distribution_positions if specified, otherwise use entry count
  const leaderboardSize =
    tournamentModel?.entry_fee?.Some?.distribution_positions?.isSome()
      ? Number(tournamentModel.entry_fee.Some.distribution_positions.Some)
      : Number(entryCountModel?.count ?? 0);

  // Fetch registration data to check for banned entries
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const { games: allTournamentGames } = useGameTokens({
    context: {
      id: Number(tournamentModel?.id) ?? 0,
    },
    pagination: {
      pageSize: Math.max(entryCount, leaderboardSize) + 10, // Fetch all entries with buffer
    },
    sortBy: "score",
    sortOrder: "desc",
    mintedByAddress: padAddress(tournamentAddress),
    includeMetadata: false,
  });

  // Get game IDs for registration check
  const allGameIds = useMemo(
    () => allTournamentGames?.map((game) => Number(game.token_id)) || [],
    [allTournamentGames]
  );

  // Fetch registrations to check banned status
  const { data: allRegistrants } = useGetTournamentRegistrants({
    namespace,
    gameIds: allGameIds,
    active: allGameIds.length > 0 && !!tournamentModel?.id,
    limit: 1000,
  });

  // Calculate non-banned entry count
  const nonBannedEntryCount = useMemo(() => {
    if (!allRegistrants || allRegistrants.length === 0) return entryCount;

    const bannedCount = allRegistrants.filter(
      (reg) => reg.is_banned === 1
    ).length;

    return entryCount - bannedCount;
  }, [allRegistrants, entryCount]);

  const totalSubmissions = leaderboardModel?.token_ids.length ?? 0;

  // Check if all non-banned games have been submitted
  const allSubmitted =
    totalSubmissions === Math.min(nonBannedEntryCount, leaderboardSize);

  // Calculate total potential prizes based on entry fees
  const { tournamentCreatorShare, gameCreatorShare, distributionPrizes } =
    extractEntryFeePrizes(
      tournamentModel?.id ?? 0,
      tournamentModel?.entry_fee!,
      entryCount,
      leaderboardSize
    );

  const entryFeePrizesCount =
    distributionPrizes.length +
    tournamentCreatorShare.length +
    gameCreatorShare.length;

  const gameAddress = tournamentModel?.game_config?.address;
  const gameName = gameData.find(
    (game) => game.contract_address === gameAddress
  )?.name;

  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!textRef.current) return;

    // Function to check overflow
    const checkOverflow = () => {
      if (textRef.current) {
        // Check both horizontal overflow and if text is clipped vertically
        const isTextOverflowing =
          textRef.current.scrollWidth > textRef.current.clientWidth ||
          textRef.current.scrollHeight > textRef.current.clientHeight;
        setIsOverflowing(isTextOverflowing);
      }
    };

    // Initial check
    checkOverflow();

    // Use ResizeObserver for more efficient monitoring
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(textRef.current);

    // Monitor content changes with MutationObserver
    const mutationObserver = new MutationObserver(checkOverflow);
    mutationObserver.observe(textRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [tournamentModel?.metadata.description]);

  const durationSeconds = Number(
    BigInt(tournamentModel?.schedule?.game?.end ?? 0n) -
      BigInt(tournamentModel?.schedule?.game?.start ?? 0n)
  );

  const registrationType = tournamentModel?.schedule.registration.isNone()
    ? "open"
    : "fixed";

  const hasEntryFee = tournamentModel?.entry_fee.isSome();

  const entryFeeToken = tournamentModel?.entry_fee.Some?.token_address;

  const tournamentId = tournamentModel?.id;

  // Fetch aggregated data
  const {
    data: aggregations,
    loading: aggregationsLoading,
    refetch: refetchAggregations,
  } = useGetTournamentPrizesAggregations({
    namespace,
    tournamentId: tournamentId ?? 0,
    active: !!tournamentId,
  });

  // useEffect(() => {

  // Fetch reward claims aggregations to track claimed vs unclaimed prizes
  const { data: claimsAggregations, refetch: refetchClaimsAggregations } =
    useGetTournamentRewardClaimsAggregations({
      namespace,
      tournamentId: tournamentId ?? 0,
      active: !!tournamentId,
    });

  console.log(claimsAggregations);

  // Refetch prize aggregations when subscribedPrizeCount changes
  useEffect(() => {
    if (subscribedPrizeCount > 0) {
      refetchAggregations();
      refetchClaimsAggregations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribedPrizeCount]);

  // Calculate total potential prizes including both entry fees and sponsored prizes
  const totalPotentialPrizes =
    entryFeePrizesCount + (aggregations?.total_prizes || 0);

  // Determine if all prizes have been claimed using aggregations
  const allClaimed = claimsAggregations
    ? claimsAggregations.total_unclaimed === 0 && totalPotentialPrizes > 0
    : false;

  // Calculate number of claimable prizes for display
  const claimablePrizesCount = claimsAggregations
    ? claimsAggregations.total_unclaimed
    : 0;

  // Calculate paid places based on entry fee and prizes
  // Note: We use aggregations for prize count since we don't have full Prize objects here
  // This is a simplified calculation - it counts entry fee positions + bonus prizes
  const paidPlaces = useMemo(() => {
    const positions = new Set<number>();

    // Add entry fee distribution positions
    if (
      tournamentModel?.entry_fee?.isSome() &&
      tournamentModel.entry_fee.Some?.distribution_positions?.isSome()
    ) {
      const distributionCount = Number(
        tournamentModel.entry_fee.Some.distribution_positions.Some
      );
      for (let i = 1; i <= distributionCount; i++) {
        positions.add(i);
      }
    }

    // Add bonus prize positions from aggregations
    // Check if there's a distributed prize (position 0) that expands into multiple positions
    const distributedPrizeCount = aggregations?.distributed_prize_count || 0;
    if (distributedPrizeCount > 0) {
      // Add positions 1 through distribution_count
      for (let i = 1; i <= distributedPrizeCount; i++) {
        positions.add(i);
      }
    } else {
      // No distributed prize, use lowest_prize_position for regular prizes
      const lowestPrizePosition = aggregations?.lowest_prize_position || 0;
      if (lowestPrizePosition > 0) {
        for (let i = 1; i <= lowestPrizePosition; i++) {
          positions.add(i);
        }
      }
    }

    return positions.size;
  }, [
    tournamentModel?.entry_fee,
    aggregations?.distributed_prize_count,
    aggregations?.lowest_prize_position,
  ]);

  // Extract unique token addresses for fetching token data
  const uniqueTokenAddresses = useMemo(() => {
    const addresses = new Set<string>();

    // From aggregated data
    if (aggregations?.token_totals) {
      aggregations.token_totals.forEach((tokenTotal: any) => {
        if (tokenTotal.tokenAddress) {
          addresses.add(tokenTotal.tokenAddress);
        }
      });
    }

    // Add entry fee token
    if (entryFeeToken) {
      addresses.add(entryFeeToken);
    }

    return Array.from(addresses);
  }, [aggregations?.token_totals, entryFeeToken]);

  // Get token data for all unique addresses in this tournament from static tokens
  const tournamentTokens = useMemo(() => {
    if (uniqueTokenAddresses.length === 0) return [];
    return getTokensByAddresses(
      uniqueTokenAddresses,
      selectedChainConfig?.chainId ?? ""
    );
  }, [uniqueTokenAddresses, selectedChainConfig]);

  // Fetch prices for all ERC20 tokens
  const {
    prices: ownPrices,
    isLoading: ownPricesLoading,
    isTokenLoading,
  } = useEkuboPrices({
    tokens: uniqueTokenAddresses,
  });

  console.log(ownPrices);

  // Use prop prices if provided, otherwise use own prices
  const prices = ownPrices;
  const pricesLoading = ownPricesLoading;

  // Calculate total value in USD using aggregated data
  const totalPrizesValueUSD = useTournamentPrizeValue({
    aggregations,
    distributionPrizes,
    tokenPrices: prices,
    pricesLoading,
    tokenDecimals,
  });

  console.log(distributionPrizes, prices);

  console.log(totalPrizesValueUSD);

  // Fetch token decimals only for tokens used in this tournament
  useEffect(() => {
    const fetchTokenDecimals = async () => {
      if (tokenDecimalsLoading || !aggregations?.token_totals) return;

      // Collect unique token addresses from tournament prizes
      const tournamentTokenAddresses = new Set<string>();

      // Add tokens from aggregated prize data
      aggregations.token_totals.forEach((tokenTotal: any) => {
        if (tokenTotal.tokenAddress && tokenTotal.tokenType === "erc20") {
          tournamentTokenAddresses.add(tokenTotal.tokenAddress);
        }
      });

      // Add entry fee token if exists
      if (entryFeeToken) {
        tournamentTokenAddresses.add(entryFeeToken);
      }

      // Add tokens from entry fee prizes
      [
        ...distributionPrizes,
        ...tournamentCreatorShare,
        ...gameCreatorShare,
      ].forEach((prize) => {
        if (prize.token_type?.variant?.erc20 && prize.token_address) {
          tournamentTokenAddresses.add(prize.token_address);
        }
      });

      // Filter to only include addresses we don't already have decimals for
      const missingAddresses = Array.from(tournamentTokenAddresses).filter(
        (addr) => !(addr in tokenDecimals)
      );

      if (missingAddresses.length === 0) return;

      setTokenDecimalsLoading(true);
      const decimalsMap: Record<string, number> = { ...tokenDecimals };

      // Fetch decimals in parallel
      const decimalsPromises = missingAddresses.map(async (address) => {
        try {
          const decimals = await getTokenDecimals(address);
          return { address, decimals };
        } catch (error) {
          console.error(
            `Failed to fetch decimals for token ${address}:`,
            error
          );
          return { address, decimals: 18 }; // Default to 18
        }
      });

      const results = await Promise.all(decimalsPromises);
      results.forEach(({ address, decimals }) => {
        decimalsMap[address] = decimals;
      });

      setTokenDecimals(decimalsMap);
      setTokenDecimalsLoading(false);
    };

    if (!tokenDecimalsLoading) {
      fetchTokenDecimals();
    }
  }, [
    aggregations?.token_totals,
    entryFeeToken,
    distributionPrizes,
    tournamentCreatorShare,
    gameCreatorShare,
    tokenDecimalsLoading,
    tokenDecimals,
    getTokenDecimals,
  ]);

  // Fetch creator address from creator token ID
  const { provider } = useProvider();
  useEffect(() => {
    const fetchCreatorAddress = async () => {
      if (
        !tournamentModel?.creator_token_id ||
        !provider ||
        !selectedChainConfig?.denshokanAddress
      )
        return;

      try {
        // Convert token ID to Uint256 format (low, high)
        const tokenId = BigInt(tournamentModel.creator_token_id);
        const low = tokenId & ((1n << 128n) - 1n);
        const high = tokenId >> 128n;

        // Call owner_of on the Denshokan contract
        const result = await provider.callContract({
          contractAddress: selectedChainConfig.denshokanAddress,
          entrypoint: "owner_of",
          calldata: [low.toString(), high.toString()],
        });

        if (result && result.length > 0) {
          setCreatorAddress(addAddressPadding(result[0]));
        }
      } catch (error) {
        console.error("Failed to fetch creator address:", error);
      }
    };

    fetchCreatorAddress();
  }, [
    tournamentModel?.creator_token_id,
    provider,
    selectedChainConfig?.denshokanAddress,
  ]);

  // Fetch creator username
  const creatorAddresses = useMemo(() => {
    return creatorAddress ? [creatorAddress] : [];
  }, [creatorAddress]);

  const { usernames: creatorUsernames } = useGetUsernames(creatorAddresses);

  const entryFeePrice = entryFeeToken ? prices[entryFeeToken] : undefined;
  const entryFeeLoading = entryFeeToken ? isTokenLoading(entryFeeToken) : false;

  const entryFee = hasEntryFee
    ? (() => {
        const entryFeeDecimals = tokenDecimals[entryFeeToken ?? ""] || 18;
        const amount = Number(tournamentModel?.entry_fee.Some?.amount!);
        const humanAmount = amount / 10 ** entryFeeDecimals;

        // Return "0.00" if price is not available yet
        if (!entryFeePrice || isNaN(entryFeePrice)) {
          return "0.00";
        }

        return (humanAmount * entryFeePrice).toFixed(2);
      })()
    : "Free";

  const isStarted =
    Number(tournamentModel?.schedule.game.start) <
    Number(BigInt(Date.now()) / 1000n);

  const isEnded =
    Number(tournamentModel?.schedule.game.end) <
    Number(BigInt(Date.now()) / 1000n);

  const isSubmitted =
    Number(
      BigInt(tournamentModel?.schedule.game.end ?? 0n) +
        BigInt(tournamentModel?.schedule.submission_duration ?? 0n)
    ) < Number(BigInt(Date.now()) / 1000n);

  // Detect preparation period (break between registration end and tournament start)
  const registrationEndTime = tournamentModel?.schedule.registration?.Some?.end;
  const tournamentStartTime = tournamentModel?.schedule.game.start;
  const now = Number(BigInt(Date.now()) / 1000n);
  const hasPreparationPeriod = registrationEndTime && registrationEndTime < tournamentStartTime;
  const isInPreparationPeriod =
    hasPreparationPeriod &&
    Number(registrationEndTime) < now &&
    Number(tournamentStartTime) > now;

  const startsIn =
    Number(tournamentModel?.schedule.game.start) -
    Number(BigInt(Date.now()) / 1000n);
  const endsIn =
    Number(tournamentModel?.schedule.game.end) -
    Number(BigInt(Date.now()) / 1000n);
  const submissionEndsIn =
    Number(
      BigInt(tournamentModel?.schedule.game.end ?? 0n) +
        BigInt(tournamentModel?.schedule.submission_duration ?? 0n)
    ) - Number(BigInt(Date.now()) / 1000n);

  const status = useMemo(() => {
    if (isSubmitted) return "finalized";
    if (isEnded && !isSubmitted) return "submission";
    if (isStarted) return "live";
    if (isInPreparationPeriod) return "preparation";
    return "upcoming";
  }, [isStarted, isEnded, isSubmitted, isInPreparationPeriod]);

  // handle fetching of tournament data if there is a tournament validator extension requirement

  const extensionRequirement =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.extension;

  const tournamentIdsQuery = useMemo(() => {
    if (!tournamentModel || !extensionRequirement) return [];

    // Check if this extension is a tournament validator by looking at the config format
    // Tournament validator config: [qualifier_type, ...tournament_ids]
    const config = extensionRequirement.config;
    if (!config || config.length < 2) return [];

    // Extract tournament IDs (skip first element which is qualifier_type)
    const tournamentIds = config.slice(1);
    return tournamentIds.map((id: any) => padU64(BigInt(id)));
  }, [tournamentModel, extensionRequirement]);

  const { data: tournaments } = useGetTournaments({
    namespace: namespace,
    gameFilters: [],
    limit: 100,
    status: "tournaments",
    tournamentIds: tournamentIdsQuery,
    active: tournamentIdsQuery.length > 0,
  });

  const tournamentsData = useMemo(() => {
    if (!tournaments) return [];
    return tournaments.map((tournament) => ({
      ...processTournamentFromSql(tournament),
      entry_count: tournament.entry_count,
    }));
  }, [tournaments]);

  const { settings } = useSettings({
    gameAddresses: gameAddress ? [gameAddress] : [],
    settingsIds: [Number(tournamentModel?.game_config?.settings_id)],
  });

  if (loading || tournamentSqlLoading) {
    return <LoadingPage message={`Loading tournament...`} />;
  }

  if (!tournamentExists || !tournamentModel) {
    return <NotFound message={`Tournament not found: ${id}`} />;
  }

  return (
    <div className="lg:w-[87.5%] xl:w-5/6 2xl:w-3/4 sm:mx-auto flex flex-col gap-5 h-full">
      <div className="flex flex-row items-center justify-between h-12">
        <Button
          variant="outline"
          className="px-2"
          onClick={() => navigate("/")}
        >
          <ARROW_LEFT />
          <span className="hidden sm:block">Back</span>
        </Button>
        <div className="flex flex-row items-center gap-2 sm:gap-5">
          <span className="text-brand uppercase font-brand text-lg sm:text-2xl">
            {status}
          </span>
          <Tooltip delayDuration={50}>
            <TooltipTrigger asChild>
              <div
                className="flex items-center justify-center cursor-pointer"
                onClick={() => setSettingsDialogOpen(true)}
              >
                <TokenGameIcon
                  image={getGameImage(gameAddress ?? "")}
                  size={"md"}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="center"
              sideOffset={5}
              className="bg-black text-neutral border border-brand-muted px-2 py-1 rounded text-sm z-50"
            >
              {gameName ? gameName : "Unknown"}
            </TooltipContent>
          </Tooltip>
          {settings[0] && (
            <div
              className="hidden sm:flex h-10 text-brand flex-row items-center gap-1 w-full border-2 border-brand-muted p-2 bg-black rounded-lg hover:cursor-pointer"
              onClick={() => setSettingsDialogOpen(true)}
            >
              <span className="w-8">
                <SLIDERS />
              </span>
              <span className="hidden sm:block text-xs">
                {settings[0].name}
              </span>
            </div>
          )}
          <EntryRequirements
            tournamentModel={tournamentModel}
            tournamentsData={tournamentsData}
          />
          {!isEnded && (
            <Button
              variant="outline"
              onClick={() => setAddPrizesDialogOpen(true)}
            >
              <GIFT />{" "}
              <span className="hidden sm:block 3xl:text-lg">Add Prizes</span>
            </Button>
          )}
          {(registrationType === "fixed" && !isStarted && !isInPreparationPeriod) ||
          (registrationType === "open" && !isEnded) ? (
            <Button
              className="uppercase [&_svg]:w-6 [&_svg]:h-6"
              onClick={() => setEnterDialogOpen(true)}
            >
              <span className="hidden sm:block">
                <SPACE_INVADER_SOLID />
              </span>

              <span>Enter</span>
              <span className="hidden sm:block">|</span>
              <span className="hidden sm:block font-bold text-xs sm:text-base 3xl:text-lg">
                {hasEntryFee ? (
                  entryFeeLoading ? (
                    <Skeleton className="bg-neutral w-10 h-6" />
                  ) : (
                    `$${entryFee}`
                  )
                ) : (
                  "Free"
                )}
              </span>
            </Button>
          ) : isEnded && !isSubmitted ? (
            <Button
              className="uppercase"
              onClick={() => setSubmitScoresDialogOpen(true)}
              disabled={allSubmitted}
            >
              <TROPHY />
              {allSubmitted ? "Submitted" : "Submit Scores"}
            </Button>
          ) : isSubmitted ? (
            <Button
              className="uppercase"
              onClick={() => setClaimDialogOpen(true)}
              disabled={allClaimed || claimablePrizesCount === 0}
            >
              <MONEY />
              {allClaimed ? (
                <span className="hidden sm:block">Prizes Claimed</span>
              ) : claimablePrizesCount === 0 ? (
                <span className="hidden sm:block">No Prizes</span>
              ) : (
                <>
                  <span className="hidden sm:block">Send Prizes |</span>
                  <span className="font-bold">{claimablePrizesCount}</span>
                </>
              )}
            </Button>
          ) : (
            <></>
          )}
          <EnterTournamentDialog
            open={enterDialogOpen}
            onOpenChange={setEnterDialogOpen}
            hasEntryFee={hasEntryFee}
            entryFeePrice={entryFeePrice}
            tournamentModel={tournamentModel}
            entryCount={entryCount}
            // gameCount={gameCount}
            tokens={tournamentTokens}
            tournamentsData={tournamentsData}
            duration={durationSeconds}
            totalPrizesValueUSD={totalPrizesValueUSD}
          />
          <SubmitScoresDialog
            open={submitScoresDialogOpen}
            onOpenChange={setSubmitScoresDialogOpen}
            tournamentModel={tournamentModel}
            leaderboard={leaderboardModel!}
          />
          <ClaimPrizesDialog
            open={claimDialogOpen}
            onOpenChange={setClaimDialogOpen}
            tournamentModel={tournamentModel}
            prices={prices}
            entryCount={entryCount}
          />
          <AddPrizesDialog
            open={addPrizesDialogOpen}
            onOpenChange={setAddPrizesDialogOpen}
            tournamentId={tournamentModel?.id}
            tournamentName={feltToString(tournamentModel?.metadata?.name ?? "")}
          />
          <SettingsDialog
            open={settingsDialogOpen}
            onOpenChange={setSettingsDialogOpen}
            game={gameAddress ?? ""}
            settings={settings[0]}
          />
        </div>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto pb-5 pr-2 sm:pr-0 sm:pb-0">
        <div className="flex flex-col gap-1 sm:gap-2">
          <div className="flex flex-row items-center h-8 sm:h-12 justify-between">
            <div className="flex flex-row gap-5 min-w-0 flex-1">
              <span className="font-brand text-xl xl:text-2xl 2xl:text-4xl 3xl:text-5xl truncate">
                {feltToString(tournamentModel?.metadata?.name ?? "")}
              </span>
              <div className="flex flex-row items-center gap-4 text-brand-muted 3xl:text-lg flex-shrink-0">
                {creatorAddress && (
                  <div className="hidden sm:flex flex-row gap-2">
                    <span>Creator:</span>
                    <span className="text-brand">
                      {creatorUsernames?.get(indexAddress(creatorAddress)) || (
                        <>
                          {creatorAddress.slice(0, 6)}...
                          {creatorAddress.slice(-4)}
                        </>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex flex-row gap-2 hidden sm:flex">
                  <span>Paid Places:</span>
                  <span className="text-brand">
                    {paidPlaces > 0 ? paidPlaces : "-"}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs p-1 rounded-md sm:hidden text-brand"
                >
                  {paidPlaces > 0 ? `${paidPlaces} Paid Places` : "No Prizes"}
                </Badge>
                <div className="flex flex-row gap-2 hidden sm:flex">
                  <span>Registration:</span>
                  <span className="text-brand">
                    {registrationType.charAt(0).toUpperCase() +
                      registrationType.slice(1)}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs p-1 rounded-md sm:hidden text-brand"
                >
                  Open
                </Badge>
              </div>
            </div>
            <div className="hidden sm:flex flex-row 3xl:text-lg">
              {isInPreparationPeriod ? (
                <Countdown
                  targetTimestamp={Number(tournamentModel?.schedule.game.start)}
                  label="Starts In"
                />
              ) : !isStarted ? (
                <Countdown
                  targetTimestamp={Number(tournamentModel?.schedule.game.start)}
                  label="Starts In"
                />
              ) : !isEnded ? (
                <Countdown
                  targetTimestamp={Number(tournamentModel?.schedule.game.end)}
                  label="Ends In"
                />
              ) : !isSubmitted ? (
                <Countdown
                  targetTimestamp={Number(
                    BigInt(tournamentModel?.schedule.game.end ?? 0n) +
                      BigInt(
                        tournamentModel?.schedule.submission_duration ?? 0n
                      )
                  )}
                  label="Submission Ends In"
                />
              ) : (
                <></>
              )}
            </div>
          </div>
          <div className="flex flex-row items-center justify-between gap-4">
            <div
              className={`relative overflow-hidden flex-1 min-w-0 ${
                tournamentModel?.metadata?.description?.startsWith("#")
                  ? ""
                  : "h-6"
              }`}
            >
              {tournamentModel?.metadata?.description?.startsWith("#") ? (
                <Button
                  onClick={() => setIsDescriptionDialogOpen(true)}
                  variant="outline"
                  size="sm"
                >
                  View Full Description
                </Button>
              ) : (
                <div className="flex flex-row items-center gap-4">
                  <p
                    ref={textRef}
                    className={`${
                      isExpanded
                        ? "whitespace-pre-wrap text-xs sm:text-base"
                        : "overflow-hidden text-ellipsis whitespace-nowrap text-xs sm:text-sm xl:text-base 3xl:text-lg"
                    } flex-1`}
                  >
                    {tournamentModel?.metadata?.description &&
                      tournamentModel?.metadata?.description
                        ?.replace("Opus.Cash", "https://opus.money")
                        .split(/(https?:\/\/[^\s]+?)([.,;:!?])?(?=\s|$)/g)
                        .map((part: string, i: number, arr: string[]) => {
                          if (part && part.match(/^https?:\/\//)) {
                            // This is a URL
                            return (
                              <a
                                key={i}
                                href={part}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-muted hover:underline"
                              >
                                {part}
                              </a>
                            );
                          } else if (
                            i > 0 &&
                            arr[i - 1] &&
                            typeof arr[i - 1] === "string" &&
                            arr[i - 1].match(/^https?:\/\//) &&
                            part &&
                            /^[.,;:!?]$/.test(part)
                          ) {
                            // This is punctuation that followed a URL
                            return part;
                          } else {
                            // This is regular text
                            return part;
                          }
                        })}
                  </p>
                  {isOverflowing && (
                    <button
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="text-brand hover:text-brand-muted font-bold text-sm sm:text-base flex-shrink-0"
                    >
                      {isExpanded ? "See Less" : "See More"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-5 sm:gap-10">
          <div className="flex flex-col sm:flex-row sm:h-[150px] 3xl:h-[200px] gap-5">
            <div className="sm:w-1/2 flex justify-center items-center pt-4 sm:pt-0">
              <TournamentTimeline
                type={registrationType}
                createdTime={Number(tournamentModel?.created_at ?? 0)}
                startTime={Number(tournamentModel?.schedule.game.start ?? 0)}
                duration={durationSeconds ?? 0}
                submissionPeriod={Number(
                  tournamentModel?.schedule.submission_duration ?? 0
                )}
                registrationStartTime={Number(
                  tournamentModel?.schedule.registration.Some?.start ?? 0
                )}
                registrationEndTime={Number(
                  tournamentModel?.schedule.registration.Some?.end ?? 0
                )}
                pulse={true}
              />
            </div>
            <PrizesContainer
              tournamentId={tournamentModel?.id}
              tokens={tournamentTokens}
              tokenDecimals={tokenDecimals}
              entryFeePrizes={[
                ...distributionPrizes,
                ...tournamentCreatorShare,
                ...gameCreatorShare,
              ]}
              prices={prices}
              pricesLoading={pricesLoading}
              aggregations={aggregations}
              aggregationsLoading={aggregationsLoading}
              totalPrizesValueUSD={totalPrizesValueUSD}
              subscibedPrizeCount={subscribedPrizeCount}
              paidPlaces={paidPlaces}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-5">
            <ScoreTable
              tournamentId={tournamentModel?.id}
              entryCount={entryCount}
              isStarted={isStarted}
              isEnded={isEnded}
              tournamentModel={tournamentModel}
              onBanComplete={() => setBanRefreshTrigger((prev) => prev + 1)}
            />
            <MyEntries
              tournamentId={tournamentModel?.id}
              gameAddress={tournamentModel?.game_config?.address}
              tournamentModel={tournamentModel}
              totalEntryCount={entryCount}
              banRefreshTrigger={banRefreshTrigger}
            />
          </div>
        </div>
      </div>
      <Dialog
        open={isDescriptionDialogOpen}
        onOpenChange={setIsDescriptionDialogOpen}
      >
        <DialogContent className="bg-black border border-brand p-6 rounded-lg max-w-[90vw] sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <h3 className="font-brand text-xl text-brand">Description</h3>
            <div className="w-full h-0.5 bg-brand/25" />
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {tournamentModel?.metadata?.description || ""}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tournament;
