import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  ARROW_LEFT,
  TROPHY,
  MONEY,
  GIFT,
  SPACE_INVADER_SOLID,
  SLIDERS,
  EXTERNAL_LINK,
} from "@/components/Icons";
import { useNavigate, useParams } from "react-router-dom";
import { useProvider } from "@starknet-react/core";
import TournamentTimeline from "@/components/TournamentTimeline";
import Countdown from "@/components/Countdown";
import { indexAddress, padU64, formatNumber, calculateDistribution } from "@/lib/utils";
import type { DisplayPrize } from "@/lib/types";
import type { Leaderboard } from "@/generated/models.gen";
import { addAddressPadding } from "starknet";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";
import { useChainConfig } from "@/context/chain";
import { expandDistributedPrizes } from "@/lib/utils/formatting";
import { EnterTournamentDialog } from "@/components/dialogs/EnterTournament";
import ScoreTable from "@/components/tournament/table/ScoreTable";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useTournamentPrizeValue } from "@/hooks/useTournamentPrizeValue";
import MyEntries from "@/components/tournament/MyEntries";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
// useGameTokens from denshokan no longer needed for this component
import EntryRequirements from "@/components/tournament/EntryRequirements";
import PrizesContainer from "@/components/tournament/prizes/PrizesContainer";
import { ClaimPrizesDialog } from "@/components/dialogs/ClaimPrizes";
import { SubmitScoresDialog } from "@/components/dialogs/SubmitScores";
import {
  useTournament,
  useTournaments,
  useLeaderboard,
  useRegistrations,
  usePrizes,
  useRewardClaimsSummary,
  useActivityStats,
  useSubscription,
} from "@provable-games/budokan-sdk/react";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { ChainId } from "@/chain/setup/networks";
import NotFound from "@/containers/NotFound";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useUIStore from "@/hooks/useUIStore";
import { useGetUsernames } from "@/hooks/useController";
import { AddPrizesDialog } from "@/components/dialogs/AddPrizes";
import LoadingPage from "@/containers/LoadingPage";
import { Badge } from "@/components/ui/badge";
import { SettingsDialog } from "@/components/dialogs/Settings";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGameSetting } from "@/hooks/useDenshokanQueries";
import { EXCLUDED_TOURNAMENT_IDS } from "@/lib/constants";
import GeoBlockedDialog from "@/components/dialogs/GeoBlocked";
import { useGeoBlock } from "@/hooks/useGeoBlock";

const Tournament = () => {
  const { id } = useParams<{ id: string }>();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { selectedChainConfig } = useChainConfig();
  const { getTokenDecimals } = useSystemCalls();
  const { gameData, getGameImage } = useUIStore();
  const [enterDialogOpen, setEnterDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [submitScoresDialogOpen, setSubmitScoresDialogOpen] = useState(false);
  const [addPrizesDialogOpen, setAddPrizesDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [showGeoBlock, setShowGeoBlock] = useState(false);
  const { isBlocked: isGeoBlocked } = useGeoBlock();
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {},
  );
  const [tokenDecimalsLoading, setTokenDecimalsLoading] = useState(false);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const [banRefreshTrigger, setBanRefreshTrigger] = useState(0);

  // Fetch tournament data via new SDK hook
  const {
    tournament: tournamentData,
    loading: tournamentLoading,
    refetch: refetchTournament,
  } = useTournament(id);

  const tournamentModel = tournamentData;

  // Entry count from SDK data
  const entryCount = Number(tournamentModel?.entryCount ?? 0);

  // Subscribe to tournament updates via WebSocket
  const { lastMessage } = useSubscription(["tournaments", "registrations", "leaderboards", "prizes", "rewards"], id ? [id] : undefined);

  // Platform metrics for prize count tracking
  const { stats: platformMetrics } = useActivityStats();
  console.log(platformMetrics);
  const subscribedPrizeCount = Number(platformMetrics?.totalTournaments ?? 0);

  // Fetch leaderboard via new SDK hook (returns a single Leaderboard object)
  const { leaderboard: leaderboardModel } = useLeaderboard(id);

  // Mark initial load done once the first fetch completes (loading goes false after being true)
  const hasStartedFetch = useRef(false);
  useEffect(() => {
    if (tournamentLoading) {
      hasStartedFetch.current = true;
    } else if (hasStartedFetch.current && !initialLoadDone) {
      setInitialLoadDone(true);
    }
  }, [tournamentLoading, initialLoadDone]);

  // Fallback timeout in case the fetch never completes
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!initialLoadDone) {
        setInitialLoadDone(true);
      }
    }, 20000);
    return () => clearTimeout(timeoutId);
  }, [id]);

  // Derive loading and existence from query state — no effect-based sync needed
  const loading = !initialLoadDone;
  const tournamentId = Number(id || 0);
  const excludedIds = EXCLUDED_TOURNAMENT_IDS[selectedChainConfig?.chainId ?? ""] ?? [];
  const tournamentExists = !excludedIds.includes(tournamentId) && tournamentData !== null;

  // Get leaderboard size from distribution_count if specified, otherwise default to 10
  const leaderboardSize =
    Number(tournamentModel?.entryFee?.distributionCount ?? 0) > 0
      ? Number(tournamentModel?.entryFee?.distributionCount)
      : 10;

  // Fetch registrations via new SDK hook
  const { registrations: registrationsResult } =
    useRegistrations(id);
  const allRegistrants = registrationsResult?.data ?? null;

  // Calculate non-banned entry count
  const nonBannedEntryCount = useMemo(() => {
    if (!allRegistrants || allRegistrants.length === 0) return entryCount;

    const bannedCount = allRegistrants.filter((reg) => reg.isBanned).length;

    return entryCount - bannedCount;
  }, [allRegistrants, entryCount]);

  const totalSubmissions = Array.isArray(leaderboardModel)
    ? leaderboardModel.length
    : 0;

  // Check if all non-banned games have been submitted
  const allSubmitted =
    totalSubmissions === Math.min(nonBannedEntryCount, leaderboardSize);

  // Calculate entry fee prize breakdown using plain SDK data
  const entryFeePrizesCount = useMemo(() => {
    const ef = tournamentModel?.entryFee;
    if (!ef || !ef.amount || entryCount === 0) return 0;
    let count = 0;
    // Distribution positions
    const distCount = Number(ef.distributionCount ?? 0);
    if (distCount > 0) count += distCount;
    // Creator shares (if non-zero)
    if (Number(ef.tournamentCreatorShare ?? 0) > 0) count++;
    if (Number(ef.gameCreatorShare ?? 0) > 0) count++;
    return count;
  }, [tournamentModel?.entryFee, entryCount]);

  const gameAddress = tournamentModel?.gameAddress;
  const gameName = gameData.find(
    (game) => game.contract_address === gameAddress,
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
  }, [tournamentModel?.description]);

  const durationSeconds = Number(
    tournamentModel?.schedule?.gameEndDelay ?? 0,
  );

  const registrationType =
    Number(tournamentModel?.schedule?.registrationStartDelay ?? 0) === 0 &&
    Number(tournamentModel?.schedule?.registrationEndDelay ?? 0) === 0
      ? "open"
      : "fixed";

  const hasEntryFee = !!tournamentModel?.entryFee;

  const entryFeeToken = tournamentModel?.entryFee?.tokenAddress;

  // Fetch ALL sponsored prizes via SDK hook
  const { prizes: sponsoredPrizes, loading: sponsoredPrizesLoading, refetch: refetchAggregations } = usePrizes(id);

  // Aggregate prizes client-side to match the expected { token_totals, total_prizes } shape
  const aggregationsLoading = sponsoredPrizesLoading;
  const aggregations = useMemo(() => {
    if (!sponsoredPrizes) return undefined;
    const map = new Map<string, { tokenAddress: string; tokenType: string; totalAmount: number; nftCount: number }>();
    for (const p of sponsoredPrizes) {
      const key = `${p.tokenAddress}_${p.tokenType}`;
      const existing = map.get(key);
      const isErc20 = p.tokenType === "erc20";
      const amount = isErc20 ? Number(p.amount ?? 0) : 0;
      if (existing) {
        existing.totalAmount += amount;
        if (!isErc20) existing.nftCount++;
      } else {
        map.set(key, {
          tokenAddress: p.tokenAddress,
          tokenType: p.tokenType,
          totalAmount: amount,
          nftCount: isErc20 ? 0 : 1,
        });
      }
    }
    return {
      token_totals: Array.from(map.values()),
      total_prizes: sponsoredPrizes.length,
    };
  }, [sponsoredPrizes]);

  // Expand distributed sponsored prizes into individual positions
  const expandedSponsoredPrizes = useMemo(
    () => expandDistributedPrizes(sponsoredPrizes ?? []),
    [sponsoredPrizes],
  );

  console.log(expandedSponsoredPrizes)

  // Fetch reward claims summary via new SDK hook
  const { summary: rewardClaimsSummary } = useRewardClaimsSummary(id);

  // Calculate actual claimable prizes from summary
  const actualClaimablePrizesCount = useMemo(() => {
    if (!tournamentModel) return 0;
    // Only trust the summary if the API actually tracked prizes (totalPrizes > 0).
    // The reward-claims/summary endpoint returns all zeros when the API hasn't
    // indexed the tournament's prizes yet — in that case fall through to local count.
    if (rewardClaimsSummary && (rewardClaimsSummary.totalPrizes ?? 0) > 0) {
      return rewardClaimsSummary.totalUnclaimed ?? 0;
    }
    // Fallback: estimate from entry fee prizes + sponsored prizes
    return entryFeePrizesCount + (expandedSponsoredPrizes?.length ?? 0);
  }, [
    tournamentModel,
    rewardClaimsSummary,
    entryFeePrizesCount,
    expandedSponsoredPrizes,
  ]);

  // useEffect(() => {

  // Note: We no longer use reward claims aggregations since we calculate
  // actual claimable count directly from filtered prizes

  // Refetch data when WebSocket messages arrive.
  useEffect(() => {
    if (!lastMessage) return;
    const ch = lastMessage.channel;
    if (ch === "tournaments" || ch === "registrations") {
      refetchTournament();
    }
    if (ch === "prizes") {
      refetchAggregations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  // Refetch prize aggregations when subscribedPrizeCount changes
  useEffect(() => {
    if (subscribedPrizeCount > 0) {
      refetchAggregations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribedPrizeCount]);

  // Calculate total potential prizes including both entry fees and sponsored prizes
  const totalPotentialPrizes =
    entryFeePrizesCount + (aggregations?.total_prizes || 0);

  // Determine if all prizes have been claimed using actual claimable count.
  // Require totalClaimed > 0 so we don't show "Prizes Claimed" when the
  // summary API returns 0/0 (no claims tracked yet).
  const allClaimed =
    actualClaimablePrizesCount === 0 &&
    totalPotentialPrizes > 0 &&
    (rewardClaimsSummary?.totalClaimed ?? 0) > 0;

  // Use the actual claimable count (after filtering 0-amount prizes)
  const claimablePrizesCount = actualClaimablePrizesCount;

  // Use paidPlaces from API (computed server-side from prize positions + entry fee distribution)
  const paidPlaces = Number((tournamentModel as any)?.paidPlaces ?? 0);

  // Extract unique token addresses for fetching token data (normalized)
  const uniqueTokenAddresses = useMemo(() => {
    const addresses = new Set<string>();

    // From aggregated data
    if (aggregations?.token_totals) {
      aggregations.token_totals.forEach((tokenTotal: any) => {
        if (tokenTotal.tokenAddress) {
          addresses.add(indexAddress(tokenTotal.tokenAddress));
        }
      });
    }

    // Add entry fee token
    if (entryFeeToken) {
      addresses.add(indexAddress(entryFeeToken));
    }

    return Array.from(addresses);
  }, [aggregations?.token_totals, entryFeeToken]);

  // Get token data for all unique addresses in this tournament from static tokens
  const tournamentTokens = useMemo(() => {
    if (uniqueTokenAddresses.length === 0) return [];
    return getTokensByAddresses(
      uniqueTokenAddresses,
      selectedChainConfig?.chainId ?? "",
    );
  }, [uniqueTokenAddresses, selectedChainConfig]);

  // Fetch prices for all ERC20 tokens
  const { prices: ownPrices, isLoading: ownPricesLoading } = useEkuboPrices({
    tokens: uniqueTokenAddresses,
  });

  // Use prop prices if provided, otherwise use own prices
  const prices = ownPrices;
  const pricesLoading = ownPricesLoading;

  // Compute entry fee pool value (USD) from SDK data
  const entryFeePoolValue = useMemo(() => {
    const ef = tournamentModel?.entryFee;
    if (!ef || !entryFeeToken || entryCount === 0) return 0;
    const amount = BigInt(ef.amount ?? "0");
    if (amount === 0n) return 0;
    const totalCollected = amount * BigInt(entryCount);
    const creatorShare = Number(ef.tournamentCreatorShare ?? 0);
    const gameShare = Number(ef.gameCreatorShare ?? 0);
    const refundShare = Number(ef.refundShare ?? 0);
    const poolBps = 10000 - creatorShare - gameShare - refundShare;
    const poolAmount = poolBps > 0 ? (totalCollected * BigInt(poolBps)) / 10000n : 0n;
    const normalizedAddr = indexAddress(entryFeeToken);
    const decimals = tokenDecimals[normalizedAddr] || 18;
    const price = prices[normalizedAddr] ?? 0;
    return (Number(poolAmount) / 10 ** decimals) * price;
  }, [tournamentModel?.entryFee, entryFeeToken, entryCount, tokenDecimals, prices]);

  // Build entry fee prizes as DisplayPrize[] for PrizesContainer position breakdown
  const entryFeePrizes: DisplayPrize[] = useMemo(() => {
    const ef = tournamentModel?.entryFee;
    if (!ef || !entryFeeToken || entryCount === 0) return [];
    const amount = BigInt(ef.amount ?? "0");
    if (amount === 0n) return [];
    const totalCollected = amount * BigInt(entryCount);
    const creatorShare = Number(ef.tournamentCreatorShare ?? 0);
    const gameShare = Number(ef.gameCreatorShare ?? 0);
    const refundShare = Number(ef.refundShare ?? 0);
    const poolBps = 10000 - creatorShare - gameShare - refundShare;
    const poolAmount = poolBps > 0 ? (totalCollected * BigInt(poolBps)) / 10000n : 0n;
    if (poolAmount === 0n) return [];

    const distCount = Number(ef.distributionCount ?? 0);
    if (distCount <= 0) return [];

    // Parse distribution type from the raw Cairo enum
    let distType: "linear" | "exponential" | "uniform" = "uniform";
    let weight = 10;
    const dist = ef.distribution as any;
    if (dist) {
      if (dist.variant?.Linear !== undefined) {
        distType = "linear";
        weight = Number(dist.variant.Linear);
      } else if (dist.variant?.Exponential !== undefined) {
        distType = "exponential";
        weight = Number(dist.variant.Exponential);
      } else if (dist.variant?.Uniform !== undefined) {
        distType = "uniform";
      } else if (dist.Linear !== undefined) {
        distType = "linear";
        weight = Number(dist.Linear);
      } else if (dist.Exponential !== undefined) {
        distType = "exponential";
        weight = Number(dist.Exponential);
      } else if (dist.Uniform !== undefined) {
        distType = "uniform";
      }
    }

    const percentages = calculateDistribution(
      distCount,
      weight / 10,
      0, 0, 0,
      distType,
    );

    return percentages.map((pct, i) => {
      const posAmount = (poolAmount * BigInt(Math.floor(pct * 100))) / 10000n;
      return {
        id: 0,
        context_id: Number(tournamentModel?.id ?? 0),
        tournament_id: Number(tournamentModel?.id ?? 0),
        payout_position: i + 1,
        token_address: entryFeeToken,
        token_type: { variant: { erc20: { amount: posAmount.toString() } } },
        position: i + 1,
        type: "entry_fee",
        sponsor_address: "",
      } as unknown as DisplayPrize;
    });
  }, [tournamentModel?.entryFee, tournamentModel?.id, entryFeeToken, entryCount]);

  // Calculate total value in USD using aggregated data + entry fee pool
  const totalPrizesValueUSD = useTournamentPrizeValue({
    aggregations,
    distributionPrizes: [],
    tokenPrices: prices,
    pricesLoading,
    tokenDecimals,
  }) + entryFeePoolValue;

  // Fetch token decimals only for tokens used in this tournament (normalized addresses)
  useEffect(() => {
    const fetchTokenDecimals = async () => {
      if (tokenDecimalsLoading || !aggregations?.token_totals) return;

      // Collect unique normalized token addresses from tournament prizes
      const tournamentTokenAddresses = new Set<string>();

      // Add tokens from aggregated prize data
      aggregations.token_totals.forEach((tokenTotal: any) => {
        if (tokenTotal.tokenAddress && tokenTotal.tokenType === "erc20") {
          tournamentTokenAddresses.add(indexAddress(tokenTotal.tokenAddress));
        }
      });

      // Add entry fee token if exists
      if (entryFeeToken) {
        tournamentTokenAddresses.add(indexAddress(entryFeeToken));
      }

      // Filter to only include addresses we don't already have decimals for
      const missingAddresses = Array.from(tournamentTokenAddresses).filter(
        (addr) => !(addr in tokenDecimals),
      );

      if (missingAddresses.length === 0) return;

      setTokenDecimalsLoading(true);
      const decimalsMap: Record<string, number> = { ...tokenDecimals };

      // Fetch decimals in parallel (use original address for RPC call, normalized for storage)
      const decimalsPromises = missingAddresses.map(
        async (normalizedAddress) => {
          try {
            const decimals = await getTokenDecimals(normalizedAddress);
            return { address: normalizedAddress, decimals };
          } catch (error) {
            console.error(
              `Failed to fetch decimals for token ${normalizedAddress}:`,
              error,
            );
            return { address: normalizedAddress, decimals: 18 }; // Default to 18
          }
        },
      );

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
    tokenDecimalsLoading,
    tokenDecimals,
    getTokenDecimals,
  ]);

  // Fetch creator address from creator token ID
  const { provider } = useProvider();
  useEffect(() => {
    const fetchCreatorAddress = async () => {
      if (
        !tournamentModel?.creatorTokenId ||
        !provider ||
        !selectedChainConfig?.denshokanAddress
      )
        return;

      try {
        // Convert token ID to Uint256 format (low, high)
        const tokenId = BigInt(tournamentModel?.creatorTokenId);
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
    tournamentModel?.creatorTokenId,
    provider,
    selectedChainConfig?.denshokanAddress,
  ]);

  // Fetch creator username
  const creatorAddresses = useMemo(() => {
    return creatorAddress ? [creatorAddress] : [];
  }, [creatorAddress]);

  const { usernames: creatorUsernames } = useGetUsernames(creatorAddresses);

  const normalizedEntryFeeToken = entryFeeToken
    ? indexAddress(entryFeeToken)
    : "";
  const entryFeePrice = normalizedEntryFeeToken
    ? prices[normalizedEntryFeeToken]
    : undefined;

  const entryFeeTokenSymbol = tournamentTokens.find(
    (t) => indexAddress(t.token_address) === normalizedEntryFeeToken,
  )?.symbol;

  const entryFeeInfo = hasEntryFee
    ? (() => {
        const entryFeeDecimals = tokenDecimals[normalizedEntryFeeToken] || 18;
        const amount = Number(tournamentModel?.entryFee?.amount!);
        const humanAmount = amount / 10 ** entryFeeDecimals;

        if (!entryFeePrice || isNaN(entryFeePrice)) {
          return { type: "token" as const, display: formatNumber(humanAmount) };
        }

        return {
          type: "usd" as const,
          display: `$${(humanAmount * entryFeePrice).toFixed(2)}`,
        };
      })()
    : { type: "free" as const, display: "Free" };

  const entryFeeTokenLogo = entryFeeToken
    ? getTokenLogoUrl(
        selectedChainConfig?.chainId ?? ChainId.SN_MAIN,
        entryFeeToken,
      )
    : undefined;

  // Use pre-computed timestamps from SDK (already absolute Unix seconds)
  const absoluteTimes = tournamentModel
    ? {
        gameStartTime: Number(tournamentModel.gameStartTime ?? 0),
        gameEndTime: Number(tournamentModel.gameEndTime ?? 0),
        submissionEndTime: Number(tournamentModel.submissionEndTime ?? 0),
        registrationStartTime: tournamentModel.registrationStartTime
          ? Number(tournamentModel.registrationStartTime)
          : 0,
        registrationEndTime: tournamentModel.registrationEndTime
          ? Number(tournamentModel.registrationEndTime)
          : 0,
      }
    : null;

  const nowSeconds = Math.floor(Date.now() / 1000);

  const isStarted = (absoluteTimes?.gameStartTime ?? Infinity) < nowSeconds;
  const isEnded = (absoluteTimes?.gameEndTime ?? Infinity) < nowSeconds;
  const isSubmitted =
    (absoluteTimes?.submissionEndTime ?? Infinity) < nowSeconds;

  // Detect preparation period (break between registration end and tournament start)
  const registrationEndTime = absoluteTimes?.registrationEndTime;
  const tournamentStartTime = absoluteTimes?.gameStartTime;
  const now = Number(BigInt(Date.now()) / 1000n);
  const hasPreparationPeriod =
    registrationEndTime &&
    tournamentStartTime &&
    registrationEndTime < tournamentStartTime;
  const isInPreparationPeriod =
    hasPreparationPeriod &&
    Number(registrationEndTime) < now &&
    Number(tournamentStartTime) > now;

  // Check if we're in the registration period for fixed registration tournaments
  const isInRegistrationPeriod =
    registrationType === "fixed" &&
    registrationEndTime &&
    Number(registrationEndTime) > now;

  const status = useMemo(() => {
    if (isSubmitted) return "finalized";
    if (isEnded && !isSubmitted) return "submission";
    if (isStarted) return "live";
    if (isInPreparationPeriod) return "preparation";
    if (isInRegistrationPeriod) return "registration";
    return "upcoming";
  }, [
    isStarted,
    isEnded,
    isSubmitted,
    isInPreparationPeriod,
    isInRegistrationPeriod,
  ]);

  // handle fetching of tournament data if there is a tournament validator extension requirement

  // SDK entryRequirement is { entryLimit, entryRequirementType: { type, address?, config? } }
  const entryReqType = (tournamentModel?.entryRequirement as any)
    ?.entryRequirementType;
  const isExtensionRequirement = entryReqType?.type === "extension";

  const tournamentIdsQuery = useMemo(() => {
    if (!tournamentModel || !isExtensionRequirement) return [];

    // Check if this extension is a tournament validator by looking at the config format
    // Tournament validator config: [qualifier_type, qualifying_mode, top_positions, ...tournament_ids]
    const config = entryReqType?.config;
    if (!config || config.length < 4) return [];

    // Extract tournament IDs (skip first 3 elements: qualifier_type, qualifying_mode, top_positions)
    const tournamentIds = config.slice(3);
    return tournamentIds.map((id: any) => padU64(BigInt(id)));
  }, [tournamentModel, isExtensionRequirement, entryReqType]);

  const active = tournamentIdsQuery.length > 0;
  const { tournaments: extensionTournamentsResult } = useTournaments(active ? {
    limit: 100,
  } : undefined);
  const extensionTournaments = extensionTournamentsResult?.data ?? [];

  // Filter extension tournaments client-side by IDs from the extension config
  const tournamentsData = useMemo(() => {
    if (!extensionTournaments || tournamentIdsQuery.length === 0) return [];
    const idSet = new Set(tournamentIdsQuery.map((tid: string) => tid));
    return extensionTournaments.filter((t) => idSet.has(padU64(BigInt(t.id))));
  }, [extensionTournaments, tournamentIdsQuery]);

  const { data: settingsData } = useGameSetting({
    settingsId: Number(tournamentModel?.gameConfig?.settingsId),
    gameAddress: gameAddress,
    active: !!gameAddress,
  });
  // Map SDK shape to legacy GameSettings shape and wrap in array for backward compatibility
  const settings = useMemo(() => {
    if (!settingsData) return [];
    return [
      {
        settings_id: settingsData.id,
        game_address: settingsData.gameAddress,
        name: settingsData.name,
        description: settingsData.description,
        settings: settingsData.settings,
      },
    ];
  }, [settingsData]);

  if (loading) {
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
              <div className="flex flex-col gap-1">
                <span>{gameName ? gameName : "Unknown"}</span>
                {gameAddress && (
                  <a
                    href={`${selectedChainConfig.blockExplorerUrl}/contract/${gameAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-xs hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {gameAddress.slice(0, 6)}...{gameAddress.slice(-4)}
                    <span className="w-3 h-3">
                      <EXTERNAL_LINK />
                    </span>
                  </a>
                )}
              </div>
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
              onClick={() => {
                if (isGeoBlocked) {
                  setShowGeoBlock(true);
                } else {
                  setAddPrizesDialogOpen(true);
                }
              }}
            >
              <GIFT />{" "}
              <span className="hidden sm:block 3xl:text-lg">Add Prizes</span>
            </Button>
          )}
          {(registrationType === "fixed" &&
            !isStarted &&
            !isInPreparationPeriod) ||
          (registrationType === "open" && !isEnded) ? (
            <Button
              className="uppercase [&_svg]:w-6 [&_svg]:h-6 overflow-visible whitespace-nowrap"
              onClick={() => {
                if (isGeoBlocked) {
                  setShowGeoBlock(true);
                } else {
                  setEnterDialogOpen(true);
                }
              }}
            >
              <span className="hidden sm:block flex-shrink-0">
                <SPACE_INVADER_SOLID />
              </span>

              <span className="flex-shrink-0">Enter</span>
              <span className="hidden sm:block flex-shrink-0 px-1">|</span>
              <span className="hidden sm:flex items-center gap-2 font-bold text-xs sm:text-base 3xl:text-lg flex-shrink-0">
                {entryFeeInfo.type === "token" && entryFeeTokenLogo && (
                  <img
                    src={entryFeeTokenLogo}
                    alt={entryFeeTokenSymbol ?? ""}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex-shrink-0"
                  />
                )}
                <span className="flex-shrink-0">{entryFeeInfo.display}</span>
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
              onClick={() => {
                if (isGeoBlocked) {
                  setShowGeoBlock(true);
                } else {
                  setClaimDialogOpen(true);
                }
              }}
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
            leaderboard={{
              tournament_id: Number(id ?? 0),
              token_ids: (leaderboardModel ?? []).map((e) => e.tokenId),
            } as Leaderboard}
          />
          <ClaimPrizesDialog
            open={claimDialogOpen}
            onOpenChange={setClaimDialogOpen}
            tournamentModel={tournamentModel}
            prices={prices}
            entryCount={entryCount}
          />
          {tournamentModel && (
            <AddPrizesDialog
              open={addPrizesDialogOpen}
              onOpenChange={setAddPrizesDialogOpen}
              tournamentId={tournamentModel.id}
              tournamentName={tournamentModel?.name ?? ""}
              tournament={tournamentModel}
            />
          )}
          <SettingsDialog
            open={settingsDialogOpen}
            onOpenChange={setSettingsDialogOpen}
            game={gameAddress ?? ""}
            settings={settings[0]}
          />
          <GeoBlockedDialog
            open={showGeoBlock}
            onOpenChange={setShowGeoBlock}
          />
        </div>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto pb-5 pr-2 sm:pr-0 sm:pb-0">
        <div className="flex flex-col gap-1 sm:gap-2">
          <div className="flex flex-row items-center h-8 sm:h-12 justify-between">
            <div className="flex flex-row gap-5 min-w-0 flex-1">
              <span className="font-brand text-xl xl:text-2xl 2xl:text-4xl 3xl:text-5xl truncate">
                {tournamentModel?.name ?? ""}
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
              {isInRegistrationPeriod ? (
                <Countdown
                  targetTimestamp={Number(registrationEndTime)}
                  label="Registration Ends In"
                />
              ) : isInPreparationPeriod ? (
                <Countdown
                  targetTimestamp={absoluteTimes?.gameStartTime ?? 0}
                  label="Starts In"
                />
              ) : !isStarted ? (
                <Countdown
                  targetTimestamp={absoluteTimes?.gameStartTime ?? 0}
                  label="Starts In"
                />
              ) : !isEnded ? (
                <Countdown
                  targetTimestamp={absoluteTimes?.gameEndTime ?? 0}
                  label="Ends In"
                />
              ) : !isSubmitted ? (
                <Countdown
                  targetTimestamp={absoluteTimes?.submissionEndTime ?? 0}
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
                /[#*\-[>|`]|\n/.test(tournamentModel?.description ?? "")
                  ? ""
                  : "h-6"
              }`}
            >
              {/[#*\-[>|`]|\n/.test(tournamentModel?.description ?? "") ? (
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
                    {tournamentModel?.description &&
                      tournamentModel?.description
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
                createdTime={Number(tournamentModel?.createdAt ?? 0)}
                startTime={absoluteTimes?.gameStartTime ?? 0}
                duration={durationSeconds ?? 0}
                submissionPeriod={Number(
                  tournamentModel?.schedule?.submissionDuration ?? 0,
                )}
                registrationStartTime={
                  absoluteTimes?.registrationStartTime ?? 0
                }
                registrationEndTime={absoluteTimes?.registrationEndTime ?? 0}
                pulse={true}
              />
            </div>
            <PrizesContainer
              tournamentId={tournamentModel?.id}
              tokens={tournamentTokens}
              tokenDecimals={tokenDecimals}
              entryFeePrizes={entryFeePrizes}
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
              lastMessage={lastMessage}
            />
            <MyEntries
              tournamentId={tournamentModel?.id}
              gameAddress={tournamentModel?.gameAddress}
              tournamentModel={tournamentModel}
              totalEntryCount={entryCount}
              isStarted={isStarted}
              isEnded={isEnded}
              banRefreshTrigger={banRefreshTrigger}
              lastMessage={lastMessage}
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
                {tournamentModel?.description || ""}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tournament;
