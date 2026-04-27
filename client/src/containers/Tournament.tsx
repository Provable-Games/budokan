import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProvider } from "@starknet-react/core";
import { addAddressPadding } from "starknet";

import TournamentTimeline from "@/components/TournamentTimeline";
import TournamentDetailHeader from "@/components/tournament/TournamentDetailHeader";
import TournamentDetailInfo from "@/components/tournament/TournamentDetailInfo";
import TournamentDescription from "@/components/tournament/TournamentDescription";
import EntrantsTable, {
  type PositionPrizeDisplay,
} from "@/components/tournament/EntrantsTable";
import PrizeBreakdownDialog from "@/components/tournament/PrizeBreakdownDialog";
import MyEntries from "@/components/tournament/MyEntries";

import { EnterTournamentDialog } from "@/components/dialogs/EnterTournament";
import { ClaimPrizesDialog } from "@/components/dialogs/ClaimPrizes";
import { SubmitScoresDialog } from "@/components/dialogs/SubmitScores";
import { AddPrizesDialog } from "@/components/dialogs/AddPrizes";
import { SettingsDialog } from "@/components/dialogs/Settings";
import GeoBlockedDialog from "@/components/dialogs/GeoBlocked";

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
import type { Leaderboard } from "@/generated/models.gen";

import { useSystemCalls } from "@/chain/hooks/useSystemCalls";
import { useChainConfig } from "@/context/chain";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useTournamentPrizeValue } from "@/hooks/useTournamentPrizeValue";
import { useGetUsernames } from "@/hooks/useController";
import { useGameSetting } from "@/hooks/useDenshokanQueries";
import { useGeoBlock } from "@/hooks/useGeoBlock";
import useUIStore from "@/hooks/useUIStore";

import {
  indexAddress,
  padU64,
  formatNumber,
  calculateDistribution,
} from "@/lib/utils";
import { parseDistribution } from "@/lib/utils/distribution";
import { expandDistributedPrizes } from "@/lib/utils/formatting";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { EXCLUDED_TOURNAMENT_IDS } from "@/lib/constants";
import { ChainId } from "@/chain/setup/networks";
import type { DisplayPrize } from "@/lib/types";

import LoadingPage from "@/containers/LoadingPage";
import NotFound from "@/containers/NotFound";

const Tournament = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedChainConfig } = useChainConfig();
  const { getTokenDecimals } = useSystemCalls();
  const { gameData, getGameImage } = useUIStore();
  const { isBlocked: isGeoBlocked } = useGeoBlock();

  const [enterDialogOpen, setEnterDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [submitScoresDialogOpen, setSubmitScoresDialogOpen] = useState(false);
  const [addPrizesDialogOpen, setAddPrizesDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [showGeoBlock, setShowGeoBlock] = useState(false);
  const [prizeBreakdownOpen, setPrizeBreakdownOpen] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>({});
  const [tokenDecimalsLoading, setTokenDecimalsLoading] = useState(false);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const [banRefreshTrigger, setBanRefreshTrigger] = useState(0);

  // ---- Data fetching ----
  const {
    tournament: tournamentData,
    loading: tournamentLoading,
    refetch: refetchTournament,
  } = useTournament(id);
  const tournamentModel = tournamentData;

  const entryCount = Number(tournamentModel?.entryCount ?? 0);

  const { lastMessage } = useSubscription(
    ["tournaments", "registrations", "prizes", "rewards"],
    id ? [id] : undefined,
  );

  const { stats: platformMetrics } = useActivityStats();
  const subscribedPrizeCount = Number(platformMetrics?.totalTournaments ?? 0);

  const { leaderboard: leaderboardModel } = useLeaderboard(id);

  const hasStartedFetch = useRef(false);
  useEffect(() => {
    if (tournamentLoading) {
      hasStartedFetch.current = true;
    } else if (hasStartedFetch.current && !initialLoadDone) {
      setInitialLoadDone(true);
    }
  }, [tournamentLoading, initialLoadDone]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!initialLoadDone) setInitialLoadDone(true);
    }, 20000);
    return () => clearTimeout(timeoutId);
  }, [id]);

  const loading = !initialLoadDone;
  const tournamentId = Number(id || 0);
  const excludedIds =
    EXCLUDED_TOURNAMENT_IDS[selectedChainConfig?.chainId ?? ""] ?? [];
  const tournamentExists =
    !excludedIds.includes(tournamentId) && tournamentData !== null;

  const leaderboardSize =
    Number(tournamentModel?.entryFee?.distributionCount ?? 0) > 0
      ? Number(tournamentModel?.entryFee?.distributionCount)
      : 10;

  const { registrations: registrationsResult } = useRegistrations(id);
  const allRegistrants = registrationsResult?.data ?? null;

  const nonBannedEntryCount = useMemo(() => {
    if (!allRegistrants || allRegistrants.length === 0) return entryCount;
    const bannedCount = allRegistrants.filter((reg) => reg.isBanned).length;
    return entryCount - bannedCount;
  }, [allRegistrants, entryCount]);

  const totalSubmissions = Array.isArray(leaderboardModel)
    ? leaderboardModel.length
    : 0;
  const allSubmitted =
    totalSubmissions === Math.min(nonBannedEntryCount, leaderboardSize);

  const entryFeePrizesCount = useMemo(() => {
    const ef = tournamentModel?.entryFee;
    if (!ef || !ef.amount || entryCount === 0) return 0;
    let count = 0;
    const tournamentCreatorShare = Number(ef.tournamentCreatorShare ?? 0);
    const gameCreatorShare = Number(ef.gameCreatorShare ?? 0);
    const refundShare = Number(ef.refundShare ?? 0);
    const prizePoolBps =
      10000 - tournamentCreatorShare - gameCreatorShare - refundShare;
    const distCount = Number(ef.distributionCount ?? 0);
    if (distCount > 0 && prizePoolBps > 0) count += distCount;
    if (tournamentCreatorShare > 0) count++;
    if (gameCreatorShare > 0) count++;
    if (refundShare > 0) count += entryCount;
    return count;
  }, [tournamentModel?.entryFee, entryCount]);

  const gameAddress = tournamentModel?.gameAddress;
  const gameName = gameData.find(
    (game) => game.contract_address === gameAddress,
  )?.name;

  const durationSeconds = Number(tournamentModel?.schedule?.gameEndDelay ?? 0);

  const registrationType =
    Number(tournamentModel?.schedule?.registrationStartDelay ?? 0) === 0 &&
    Number(tournamentModel?.schedule?.registrationEndDelay ?? 0) === 0
      ? "open"
      : "fixed";

  const hasEntryFee = !!tournamentModel?.entryFee;
  const entryFeeToken = tournamentModel?.entryFee?.tokenAddress;

  const { prizes: sponsoredPrizes, refetch: refetchAggregations } =
    usePrizes(id);

  const aggregations = useMemo(() => {
    if (!sponsoredPrizes) return undefined;
    const map = new Map<
      string,
      {
        tokenAddress: string;
        tokenType: string;
        totalAmount: number;
        nftCount: number;
      }
    >();
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

  const expandedSponsoredPrizes = useMemo(
    () => expandDistributedPrizes(sponsoredPrizes ?? []),
    [sponsoredPrizes],
  );

  const { summary: rewardClaimsSummary } = useRewardClaimsSummary(id);

  const actualClaimablePrizesCount = useMemo(() => {
    if (!tournamentModel) return 0;
    if (rewardClaimsSummary && (rewardClaimsSummary.totalPrizes ?? 0) > 0) {
      return rewardClaimsSummary.totalUnclaimed ?? 0;
    }
    return entryFeePrizesCount + (expandedSponsoredPrizes?.length ?? 0);
  }, [
    tournamentModel,
    rewardClaimsSummary,
    entryFeePrizesCount,
    expandedSponsoredPrizes,
  ]);

  useEffect(() => {
    if (!lastMessage) return;
    const ch = lastMessage.channel;
    if (ch === "tournaments" || ch === "registrations") refetchTournament();
    if (ch === "prizes") refetchAggregations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  useEffect(() => {
    if (subscribedPrizeCount > 0) refetchAggregations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribedPrizeCount]);

  const totalPotentialPrizes =
    entryFeePrizesCount + (aggregations?.total_prizes || 0);

  const allClaimed =
    actualClaimablePrizesCount === 0 &&
    totalPotentialPrizes > 0 &&
    (rewardClaimsSummary?.totalClaimed ?? 0) > 0;

  const claimablePrizesCount = actualClaimablePrizesCount;

  const paidPlaces = Number((tournamentModel as any)?.paidPlaces ?? 0);

  const uniqueTokenAddresses = useMemo(() => {
    const addresses = new Set<string>();
    if (aggregations?.token_totals) {
      aggregations.token_totals.forEach((tokenTotal: any) => {
        if (tokenTotal.tokenAddress) {
          addresses.add(indexAddress(tokenTotal.tokenAddress));
        }
      });
    }
    if (entryFeeToken) addresses.add(indexAddress(entryFeeToken));
    return Array.from(addresses);
  }, [aggregations?.token_totals, entryFeeToken]);

  const tournamentTokens = useMemo(() => {
    if (uniqueTokenAddresses.length === 0) return [];
    return getTokensByAddresses(
      uniqueTokenAddresses,
      selectedChainConfig?.chainId ?? "",
    );
  }, [uniqueTokenAddresses, selectedChainConfig]);

  const { prices: ownPrices, isLoading: ownPricesLoading } = useEkuboPrices({
    tokens: uniqueTokenAddresses,
  });
  const prices = ownPrices;
  const pricesLoading = ownPricesLoading;

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
    const poolAmount =
      poolBps > 0 ? (totalCollected * BigInt(poolBps)) / 10000n : 0n;
    const normalizedAddr = indexAddress(entryFeeToken);
    const decimals = tokenDecimals[normalizedAddr] || 18;
    const price = prices[normalizedAddr] ?? 0;
    return (Number(poolAmount) / 10 ** decimals) * price;
  }, [
    tournamentModel?.entryFee,
    entryFeeToken,
    entryCount,
    tokenDecimals,
    prices,
  ]);

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
    const poolAmount =
      poolBps > 0 ? (totalCollected * BigInt(poolBps)) / 10000n : 0n;
    if (poolAmount === 0n) return [];
    const distCount = Number(ef.distributionCount ?? 0);
    if (distCount <= 0) return [];

    const parsed = parseDistribution(ef.distribution);
    // Percentages of the prize pool, per position. Custom distributions
    // persist their own basis-point shares (sum == 10000), so we convert
    // them directly rather than routing through `calculateDistribution`
    // (which only handles the parametric shapes). Linear / Exponential /
    // Uniform still go through the calculator, which returns percentages
    // scaled to the user-entered weight (contract stores weight × 10).
    let percentages: number[];
    if (parsed.type === "custom") {
      const customWeights =
        parsed.customWeights && parsed.customWeights.length > 0
          ? parsed.customWeights.slice(0, distCount)
          : [];
      if (customWeights.length === distCount) {
        percentages = customWeights.map((bp) => bp / 100);
      } else {
        // Length mismatch with on-chain distribution_count — fall back to
        // a uniform split so the breakdown still renders something sane.
        percentages = calculateDistribution(distCount, 1, 0, 0, 0, "uniform");
      }
    } else {
      const distType =
        parsed.type === "linear" ||
        parsed.type === "exponential" ||
        parsed.type === "uniform"
          ? parsed.type
          : "uniform";
      percentages = calculateDistribution(
        distCount,
        parsed.weight / 10,
        0,
        0,
        0,
        distType,
      );
    }

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
  }, [
    tournamentModel?.entryFee,
    tournamentModel?.id,
    entryFeeToken,
    entryCount,
  ]);

  const totalPrizesValueUSD =
    useTournamentPrizeValue({
      aggregations,
      distributionPrizes: [],
      tokenPrices: prices,
      pricesLoading,
      tokenDecimals,
    }) + entryFeePoolValue;

  // Fetch token decimals for tournament tokens
  useEffect(() => {
    const fetchTokenDecimalsAsync = async () => {
      if (tokenDecimalsLoading || !aggregations?.token_totals) return;
      const tournamentTokenAddresses = new Set<string>();
      aggregations.token_totals.forEach((tokenTotal: any) => {
        if (tokenTotal.tokenAddress && tokenTotal.tokenType === "erc20") {
          tournamentTokenAddresses.add(indexAddress(tokenTotal.tokenAddress));
        }
      });
      if (entryFeeToken) {
        tournamentTokenAddresses.add(indexAddress(entryFeeToken));
      }
      const missingAddresses = Array.from(tournamentTokenAddresses).filter(
        (addr) => !(addr in tokenDecimals),
      );
      if (missingAddresses.length === 0) return;

      setTokenDecimalsLoading(true);
      const decimalsMap: Record<string, number> = { ...tokenDecimals };
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
            return { address: normalizedAddress, decimals: 18 };
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
    if (!tokenDecimalsLoading) fetchTokenDecimalsAsync();
  }, [
    aggregations?.token_totals,
    entryFeeToken,
    tokenDecimalsLoading,
    tokenDecimals,
    getTokenDecimals,
  ]);

  // Fetch creator address from token id
  const { provider } = useProvider();
  useEffect(() => {
    const fetchCreatorAddress = async () => {
      if (
        !tournamentModel?.creatorTokenId ||
        !provider ||
        !selectedChainConfig?.denshokanAddress
      ) {
        return;
      }
      try {
        const tokenId = BigInt(tournamentModel?.creatorTokenId);
        const low = tokenId & ((1n << 128n) - 1n);
        const high = tokenId >> 128n;
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

  const creatorAddresses = useMemo(
    () => (creatorAddress ? [creatorAddress] : []),
    [creatorAddress],
  );
  const { usernames: creatorUsernames } = useGetUsernames(creatorAddresses);
  const creatorUsername = creatorAddress
    ? creatorUsernames?.get(indexAddress(creatorAddress))
    : undefined;

  // ---- Entry fee display ----
  const normalizedEntryFeeToken = entryFeeToken
    ? indexAddress(entryFeeToken)
    : "";
  const entryFeePrice = normalizedEntryFeeToken
    ? prices[normalizedEntryFeeToken]
    : undefined;
  const entryFeeDecimalsResolved =
    tokenDecimals[normalizedEntryFeeToken] || 18;
  const entryFeeHumanAmount = hasEntryFee
    ? Number(tournamentModel?.entryFee?.amount!) /
      10 ** entryFeeDecimalsResolved
    : 0;
  const entryFeeUsdPrice =
    hasEntryFee && entryFeePrice && !isNaN(entryFeePrice)
      ? entryFeeHumanAmount * entryFeePrice
      : null;

  const entryFeeInfo = hasEntryFee
    ? entryFeeUsdPrice != null
      ? {
          type: "usd" as const,
          display: `$${entryFeeUsdPrice.toFixed(2)}`,
        }
      : {
          type: "token" as const,
          display: formatNumber(entryFeeHumanAmount),
        }
    : { type: "free" as const, display: "Free" as const };

  const entryFeeRefundBps = Number(
    tournamentModel?.entryFee?.refundShare ?? 0,
  );

  const entryFeeTokenLogo = entryFeeToken
    ? getTokenLogoUrl(
        selectedChainConfig?.chainId ?? ChainId.SN_MAIN,
        entryFeeToken,
      )
    : undefined;

  // ---- Times & status ----
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

  const registrationEndTime = absoluteTimes?.registrationEndTime;
  const tournamentStartTime = absoluteTimes?.gameStartTime;
  const now = Number(BigInt(Date.now()) / 1000n);
  const hasPreparationPeriod =
    registrationEndTime &&
    tournamentStartTime &&
    registrationEndTime < tournamentStartTime;
  const isInPreparationPeriod = !!(
    hasPreparationPeriod &&
    Number(registrationEndTime) < now &&
    Number(tournamentStartTime) > now
  );
  const isInRegistrationPeriod = !!(
    registrationType === "fixed" &&
    registrationEndTime &&
    Number(registrationEndTime) > now
  );

  const status = useMemo(() => {
    if (isSubmitted) return "finalized" as const;
    if (isEnded && !isSubmitted) return "submission" as const;
    if (isStarted) return "live" as const;
    if (isInPreparationPeriod) return "preparation" as const;
    if (isInRegistrationPeriod) return "registration" as const;
    return "upcoming" as const;
  }, [
    isStarted,
    isEnded,
    isSubmitted,
    isInPreparationPeriod,
    isInRegistrationPeriod,
  ]);

  // ---- Countdown target for current phase ----
  const { countdownTarget, countdownLabel } = useMemo(() => {
    if (!absoluteTimes) return { countdownTarget: null, countdownLabel: "" };
    if (isInRegistrationPeriod) {
      return {
        countdownTarget: Number(registrationEndTime),
        countdownLabel: "Registration Ends",
      };
    }
    if (isInPreparationPeriod) {
      return {
        countdownTarget: absoluteTimes.gameStartTime,
        countdownLabel: "Starts In",
      };
    }
    if (!isStarted) {
      return {
        countdownTarget: absoluteTimes.gameStartTime,
        countdownLabel: "Starts In",
      };
    }
    if (!isEnded) {
      return {
        countdownTarget: absoluteTimes.gameEndTime,
        countdownLabel: "Ends In",
      };
    }
    if (!isSubmitted) {
      return {
        countdownTarget: absoluteTimes.submissionEndTime,
        countdownLabel: "Submission Ends",
      };
    }
    return { countdownTarget: null, countdownLabel: "" };
  }, [
    absoluteTimes,
    isStarted,
    isEnded,
    isSubmitted,
    isInPreparationPeriod,
    isInRegistrationPeriod,
    registrationEndTime,
  ]);

  // ---- Entry requirement extension tournaments ----
  const entryReqType = (tournamentModel?.entryRequirement as any)
    ?.entryRequirementType;
  const isExtensionRequirement = entryReqType?.type === "extension";
  const tournamentIdsQuery = useMemo(() => {
    if (!tournamentModel || !isExtensionRequirement) return [];
    const config = entryReqType?.config;
    if (!config || config.length < 4) return [];
    const tournamentIds = config.slice(3);
    return tournamentIds.map((tid: any) => padU64(BigInt(tid)));
  }, [tournamentModel, isExtensionRequirement, entryReqType]);
  const active = tournamentIdsQuery.length > 0;
  const { tournaments: extensionTournamentsResult } = useTournaments(
    active ? { limit: 100 } : undefined,
  );
  const extensionTournaments = extensionTournamentsResult?.data ?? [];
  const tournamentsData = useMemo(() => {
    if (!extensionTournaments || tournamentIdsQuery.length === 0) return [];
    const idSet = new Set(tournamentIdsQuery.map((tid: string) => tid));
    return extensionTournaments.filter((t) => idSet.has(padU64(BigInt(t.id))));
  }, [extensionTournaments, tournamentIdsQuery]);

  // ---- Game settings ----
  const { data: settingsData } = useGameSetting({
    settingsId: Number(tournamentModel?.gameConfig?.settingsId),
    gameAddress: gameAddress,
    active: !!gameAddress,
  });
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

  // ---- Hero: prize pool tokens ----
  const uniquePrizeTokens = useMemo(() => {
    return tournamentTokens.map((t) => ({
      symbol: t.symbol,
      logoUrl: t.logo_url,
    }));
  }, [tournamentTokens]);

  // ---- Entrants: prizes per position ----
  const prizesByPosition = useMemo(() => {
    const map = new Map<number, PositionPrizeDisplay>();
    const allPrizes = [
      ...entryFeePrizes,
      ...(expandedSponsoredPrizes as DisplayPrize[]),
    ];

    for (const prize of allPrizes) {
      const pAny = prize as any;
      const position = Number(pAny.position ?? pAny.payout_position ?? 0);
      if (position <= 0) continue;

      const tokenAddress = pAny.token_address ?? pAny.tokenAddress;
      if (!tokenAddress) continue;
      const normalized = indexAddress(tokenAddress);

      // Extract amount — support nested CairoCustomEnum and plain object shapes
      const tokenType = pAny.token_type ?? pAny.tokenType;
      let amountStr: string | undefined;
      if (typeof tokenType === "string") {
        amountStr = pAny.amount?.toString();
      } else if (tokenType) {
        amountStr =
          tokenType.variant?.erc20?.amount ??
          tokenType.erc20?.amount ??
          pAny.amount?.toString();
      }

      const meta = tournamentTokens.find(
        (t) => indexAddress(t.token_address) === normalized,
      );
      const decimals = tokenDecimals[normalized] ?? meta?.decimals ?? 18;
      const price = prices[normalized];

      let usd: number | null = null;
      let tokenAmountDisplay: string | undefined;
      if (amountStr) {
        try {
          const amt = Number(BigInt(amountStr)) / 10 ** decimals;
          if (price && !isNaN(price)) usd = amt * price;
          tokenAmountDisplay = `${formatNumber(amt)}${meta?.symbol ? " " + meta.symbol : ""}`;
        } catch {
          // ignore malformed amounts
        }
      } else if (meta?.symbol) {
        tokenAmountDisplay = meta.symbol;
      }

      const existing = map.get(position);
      if (!existing) {
        map.set(position, {
          usd,
          tokenSymbol: meta?.symbol,
          tokenLogo: meta?.logo_url,
          tokenAmountDisplay,
        });
      } else {
        map.set(position, {
          usd:
            existing.usd != null && usd != null
              ? existing.usd + usd
              : (existing.usd ?? usd),
          tokenSymbol: existing.tokenSymbol ?? meta?.symbol,
          tokenLogo: existing.tokenLogo ?? meta?.logo_url,
          tokenAmountDisplay: existing.tokenAmountDisplay,
        });
      }
    }
    return map;
  }, [
    entryFeePrizes,
    expandedSponsoredPrizes,
    tournamentTokens,
    tokenDecimals,
    prices,
  ]);

  // ---- Handlers (geo-guarded) ----
  const guard = (fn: () => void) => () => {
    if (isGeoBlocked) setShowGeoBlock(true);
    else fn();
  };

  // ---- Render ----
  if (loading) {
    return <LoadingPage message={`Loading tournament...`} />;
  }
  if (!tournamentExists || !tournamentModel) {
    return <NotFound message={`Tournament not found: ${id}`} />;
  }

  return (
    <div className="lg:w-[87.5%] xl:w-5/6 2xl:w-3/4 sm:mx-auto flex flex-col gap-4 h-full">
      <TournamentDetailHeader
        tournamentModel={tournamentModel}
        name={tournamentModel?.name ?? ""}
        status={status}
        gameAddress={gameAddress}
        gameName={gameName}
        gameImage={getGameImage(gameAddress ?? "")}
        creatorAddress={creatorAddress}
        creatorUsername={creatorUsername}
        blockExplorerUrl={selectedChainConfig.blockExplorerUrl}
        totalPrizeUsd={totalPrizesValueUSD}
        uniquePrizeTokens={uniquePrizeTokens}
        paidPlaces={paidPlaces}
        tournamentsData={tournamentsData}
        isStarted={isStarted}
        isEnded={isEnded}
        isSubmitted={isSubmitted}
        isInPreparationPeriod={isInPreparationPeriod}
        registrationType={registrationType}
        allSubmitted={allSubmitted}
        allClaimed={allClaimed}
        claimablePrizesCount={claimablePrizesCount}
        onBack={() => navigate("/")}
        onSettings={() => setSettingsDialogOpen(true)}
        onAddPrizes={guard(() => setAddPrizesDialogOpen(true))}
        onEnter={guard(() => setEnterDialogOpen(true))}
        onSubmitScores={() => setSubmitScoresDialogOpen(true)}
        onClaim={guard(() => setClaimDialogOpen(true))}
        timelineSlot={
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
            inline
          />
        }
      />

      <div className="flex flex-col gap-4 overflow-y-auto pt-3 pr-3 pb-5 sm:pb-0">
        <TournamentDetailInfo
          settingsName={settings[0]?.name ?? null}
          registrationType={registrationType}
          entryCount={entryCount}
          entryFeeInfo={entryFeeInfo}
          entryFeeTokenLogo={entryFeeTokenLogo}
          refundBps={entryFeeRefundBps}
          countdownTarget={countdownTarget}
          countdownLabel={countdownLabel}
          onSettingsClick={() => setSettingsDialogOpen(true)}
        />

        <div className="h-px bg-brand/15 w-full" />

        <div className="flex flex-col-reverse md:flex-row gap-5">
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            <TournamentDescription
              tournamentName={tournamentModel?.name ?? ""}
              description={String(tournamentModel?.description ?? "")}
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
              className="w-full sm:w-full"
              prizesByPosition={prizesByPosition}
            />
          </div>
          <div className="w-full md:w-[440px] flex-shrink-0">
            <EntrantsTable
              tournamentId={tournamentModel?.id}
              entryCount={entryCount}
              tournamentModel={tournamentModel}
              isStarted={isStarted}
              isEnded={isEnded}
              prizesByPosition={prizesByPosition}
              onBanComplete={() =>
                setBanRefreshTrigger((prev) => prev + 1)
              }
              lastMessage={lastMessage}
              onShowPrizeBreakdown={() => setPrizeBreakdownOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <EnterTournamentDialog
        open={enterDialogOpen}
        onOpenChange={setEnterDialogOpen}
        hasEntryFee={hasEntryFee}
        entryFeePrice={entryFeePrice}
        tournamentModel={tournamentModel}
        entryCount={entryCount}
        tokens={tournamentTokens}
        tournamentsData={tournamentsData}
        duration={durationSeconds}
        totalPrizesValueUSD={totalPrizesValueUSD}
      />
      <SubmitScoresDialog
        open={submitScoresDialogOpen}
        onOpenChange={setSubmitScoresDialogOpen}
        tournamentModel={tournamentModel}
        leaderboard={
          {
            tournament_id: Number(id ?? 0),
            token_ids: (leaderboardModel ?? []).map((e) => e.tokenId),
          } as Leaderboard
        }
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
      <PrizeBreakdownDialog
        open={prizeBreakdownOpen}
        onOpenChange={setPrizeBreakdownOpen}
        entryFee={tournamentModel?.entryFee as any}
        entryCount={entryCount}
        entryFeePrizes={entryFeePrizes}
        sponsoredPrizes={expandedSponsoredPrizes}
        tournamentTokens={tournamentTokens}
        prices={prices}
        tokenDecimals={tokenDecimals}
        totalPrizeUsd={totalPrizesValueUSD}
        entryFeePoolUsd={entryFeePoolValue}
      />
    </div>
  );
};

export default Tournament;
