import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import {
  useActivityStats,
  useTournaments,
  usePlayerTournamentCount,
} from "@provable-games/budokan-sdk/react";
import type { Tournament } from "@provable-games/budokan-sdk";

import Countdown from "@/components/Countdown";
import GameIcon from "@/components/icons/GameIcon";
import { Button } from "@/components/ui/button";
import { GLOBE, FLAG, TROPHY, SPACE_INVADER_SOLID } from "@/components/Icons";
import { Trophy, Users, Coins, Gamepad2 } from "lucide-react";

import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";
import useUIStore from "@/hooks/useUIStore";
import { useChainConfig } from "@/context/chain";
import { useTournamentPrizeValue } from "@/hooks/useTournamentPrizeValue";
import StatChip from "@/components/shared/StatChip";

import { cn, formatNumber, indexAddress } from "@/lib/utils";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { ChainId } from "@/chain/setup/networks";
import { EXCLUDED_TOURNAMENT_IDS } from "@/lib/constants";

const formatUSDCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
};

const formatCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

interface DashboardBannerProps {
  liveCount: number;
  upcomingCount: number;
  endedCount: number;
  myLiveCount: number;
}

const DashboardBanner = ({
  liveCount,
  upcomingCount,
  endedCount,
  myLiveCount,
}: DashboardBannerProps) => {
  const navigate = useNavigate();
  const { address } = useAccount();
  const { gameData, getGameImage } = useUIStore();
  const { selectedChainConfig } = useChainConfig();
  const { getTokenDecimals } = useSystemCalls();

  const { stats: platformStats } = useActivityStats();

  const excludeIds = useMemo(
    () =>
      (
        EXCLUDED_TOURNAMENT_IDS[selectedChainConfig?.chainId ?? ""] ?? []
      ).map(String),
    [selectedChainConfig?.chainId],
  );

  // Fetch the busiest live tournament for the hero
  const { tournaments: liveResult } = useTournaments({
    phase: "live",
    sort: "players",
    limit: 1,
    excludeIds,
    includePrizeSummary: "summary",
  });
  const liveFeatured = liveResult?.data?.[0];

  // Fall back to the next upcoming tournament when nothing is live
  const { tournaments: upcomingResult } = useTournaments(
    !liveFeatured
      ? {
          phase: "scheduled",
          sort: "start_time",
          limit: 1,
          excludeIds,
          includePrizeSummary: "summary",
        }
      : undefined,
  );
  const upcomingFeatured = upcomingResult?.data?.[0];

  const featured: Tournament | undefined = liveFeatured ?? upcomingFeatured;
  const isLiveFeature = !!liveFeatured;

  // Build aggregations + token list for the featured tournament
  const featuredAggregations = useMemo(() => {
    const agg = (featured as any)?.prizeAggregation;
    if (!agg || !Array.isArray(agg)) return undefined;
    return {
      token_totals: agg.map((p: any) => ({
        tokenAddress: p.tokenAddress,
        tokenType: p.tokenType,
        totalAmount: Number(p.totalAmount ?? 0),
      })),
    };
  }, [featured]);

  const featuredTokenAddresses = useMemo(() => {
    if (!featured) return [];
    const set = new Set<string>();
    if (featured.entryFeeToken) set.add(indexAddress(featured.entryFeeToken));
    if (featuredAggregations?.token_totals) {
      featuredAggregations.token_totals.forEach((t) => {
        if (t.tokenAddress) set.add(indexAddress(t.tokenAddress));
      });
    }
    return Array.from(set);
  }, [featured, featuredAggregations]);

  const { prices: featuredPrices, isLoading: featuredPricesLoading } =
    useEkuboPrices({ tokens: featuredTokenAddresses });

  const [featuredDecimals, setFeaturedDecimals] = useState<
    Record<string, number>
  >({});
  useEffect(() => {
    if (featuredTokenAddresses.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = featuredTokenAddresses.filter(
        (addr) => !(addr in featuredDecimals),
      );
      if (missing.length === 0) return;
      const results = await Promise.all(
        missing.map(async (addr) => {
          try {
            return { addr, decimals: await getTokenDecimals(addr) };
          } catch {
            return { addr, decimals: 18 };
          }
        }),
      );
      if (cancelled) return;
      setFeaturedDecimals((prev) => {
        const next = { ...prev };
        results.forEach(({ addr, decimals }) => {
          next[addr] = decimals;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredTokenAddresses.join(",")]);

  // Entry fee pool USD (mirrors TournamentCard logic)
  const entryFeePoolValue = useMemo(() => {
    if (!featured) return 0;
    const ef = featured.entryFee;
    const token = ef?.tokenAddress ?? featured.entryFeeToken ?? null;
    const amountStr = ef?.amount ?? featured.entryFeeAmount ?? null;
    const entryCount = featured.entryCount ?? 0;
    if (!token || !amountStr || entryCount === 0) return 0;
    const amount = BigInt(amountStr);
    if (amount === 0n) return 0;
    const totalCollected = amount * BigInt(entryCount);
    const creatorShare = Number(ef?.tournamentCreatorShare ?? 0);
    const gameShare = Number(ef?.gameCreatorShare ?? 0);
    const refundShare = Number(ef?.refundShare ?? 0);
    const poolBps = 10000 - creatorShare - gameShare - refundShare;
    const poolAmount =
      poolBps > 0 ? (totalCollected * BigInt(poolBps)) / 10000n : 0n;
    const normalized = indexAddress(token);
    const decimals = featuredDecimals[normalized] || 18;
    const price = featuredPrices[normalized] ?? 0;
    return (Number(poolAmount) / 10 ** decimals) * price;
  }, [featured, featuredDecimals, featuredPrices]);

  const featuredPrizeUsd =
    useTournamentPrizeValue({
      aggregations: featuredAggregations,
      distributionPrizes: [],
      tokenPrices: featuredPrices,
      pricesLoading: featuredPricesLoading,
      tokenDecimals: featuredDecimals,
    }) + entryFeePoolValue;

  const featuredTokenLogos = useMemo(() => {
    if (!featured || featuredTokenAddresses.length === 0) return [];
    const tokenMetas = getTokensByAddresses(
      featuredTokenAddresses,
      selectedChainConfig?.chainId ?? "",
    );
    return tokenMetas
      .map((t) => ({
        symbol: t.symbol,
        logoUrl: getTokenLogoUrl(
          selectedChainConfig?.chainId ?? ChainId.SN_MAIN,
          t.token_address,
        ),
      }))
      .slice(0, 4);
  }, [featured, featuredTokenAddresses, selectedChainConfig?.chainId]);

  // My status
  const queryAddress = useMemo(() => {
    if (!address || address === "0x0") return undefined;
    return indexAddress(address);
  }, [address]);
  const { count: mySubmissionCount } = usePlayerTournamentCount(
    queryAddress,
    "submission",
  );

  const showMyStatus =
    !!address && (myLiveCount > 0 || (mySubmissionCount ?? 0) > 0);

  const featuredGameName = featured
    ? gameData.find((g) => g.contract_address === featured.gameAddress)?.name
    : undefined;

  const featuredCountdown = useMemo(() => {
    if (!featured) return null;
    const now = Math.floor(Date.now() / 1000);
    const start = Number(featured.gameStartTime ?? 0);
    const end = Number(featured.gameEndTime ?? 0);
    if (now < start) return { target: start, label: "Starts In" };
    if (now < end) return { target: end, label: "Ends In" };
    return null;
  }, [featured]);

  const handleEnter = () => {
    if (!featured) return;
    navigate(`/tournament/${Number(featured.id).toString()}`);
  };

  const totalTournaments = platformStats?.totalTournaments ?? null;
  const totalPrizes = platformStats?.totalPrizes ?? null;
  const totalRegistrations = platformStats?.totalRegistrations ?? null;
  const gamesCount = gameData?.length ?? 0;

  return (
    <section className="flex flex-col gap-3 mb-1">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-stretch">
        {/* Featured tournament hero */}
        <div className="relative overflow-hidden rounded-xl border border-brand/20 bg-gradient-to-r from-brand/[0.08] via-brand/[0.04] to-transparent backdrop-blur-sm">
          {featured ? (
            <button
              onClick={handleEnter}
              className="group flex flex-row items-center gap-3 sm:gap-4 w-full text-left p-3 sm:p-4 hover:bg-brand/5 transition-colors"
            >
              {/* Game icon */}
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-black/40 border border-brand/15">
                <GameIcon image={getGameImage(featured.gameAddress)} size={10} />
              </div>

              {/* Identity + countdown stacked */}
              <div className="flex flex-col min-w-0 flex-1 gap-1">
                <div className="flex flex-row items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider flex-shrink-0",
                      isLiveFeature
                        ? "bg-success/15 text-success border-success/40"
                        : "bg-brand/10 text-brand border-brand/30",
                    )}
                  >
                    {isLiveFeature ? (
                      <span className="relative flex w-1.5 h-1.5">
                        <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-60 animate-ping" />
                        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
                      </span>
                    ) : null}
                    {isLiveFeature ? "Live" : "Up Next"}
                  </span>
                  <span className="font-brand text-base sm:text-lg xl:text-xl text-brand truncate">
                    {featured.name}
                  </span>
                </div>
                <div className="flex flex-row items-center gap-3 text-[11px] text-brand-muted font-mono">
                  {featuredGameName && (
                    <span className="text-brand/80 font-semibold truncate max-w-[120px]">
                      {featuredGameName}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>{featured.entryCount} entered</span>
                  </span>
                  {featuredCountdown && (
                    <span className="hidden sm:flex items-center gap-1">
                      <span className="uppercase tracking-wider opacity-60">
                        {featuredCountdown.label}
                      </span>
                      <Countdown
                        targetTimestamp={featuredCountdown.target}
                        size="xs"
                        labelPosition="horizontal"
                      />
                    </span>
                  )}
                </div>
              </div>

              {/* Prize pool + CTA */}
              <div className="flex flex-row items-center gap-3 sm:gap-4 flex-shrink-0">
                <div className="flex flex-col items-end leading-none">
                  {featuredTokenLogos.length > 0 && (
                    <div className="hidden sm:flex flex-row items-center mb-1.5">
                      {featuredTokenLogos.map((tk, i) => (
                        <img
                          key={`${tk.symbol}-${i}`}
                          src={tk.logoUrl}
                          alt={tk.symbol}
                          className="w-7 h-7 rounded-full border-2 border-black bg-black/40"
                          style={{ marginLeft: i === 0 ? 0 : -10 }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="font-brand font-extrabold text-lg sm:text-2xl xl:text-3xl text-brand leading-none">
                    {featuredPrizeUsd > 0
                      ? formatUSDCompact(featuredPrizeUsd)
                      : "—"}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-brand-muted mt-1">
                    Prize Pool
                  </span>
                </div>
                <Button
                  size="sm"
                  className="uppercase whitespace-nowrap pointer-events-none"
                >
                  <SPACE_INVADER_SOLID />
                  <span className="hidden sm:inline">View</span>
                </Button>
              </div>
            </button>
          ) : (
            <div className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="flex flex-col gap-1">
                <span className="font-brand text-base sm:text-lg text-brand">
                  No tournaments running right now
                </span>
                <span className="text-xs text-brand-muted">
                  Be the first to host one — set up your prize pool and rules
                  in minutes.
                </span>
              </div>
              <Button
                size="sm"
                className="uppercase whitespace-nowrap"
                onClick={() => navigate("/create-tournament")}
              >
                <TROPHY />
                <span className="hidden sm:inline">Create</span>
              </Button>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 lg:max-w-[280px]">
          <StatChip
            icon={<FLAG />}
            value={liveCount}
            label="Live"
            accent="success"
          />
          <StatChip
            icon={<GLOBE />}
            value={upcomingCount}
            label="Upcoming"
            accent="brand"
          />
          <StatChip
            icon={<Trophy className="w-full h-full" />}
            value={
              totalTournaments != null
                ? formatCount(totalTournaments)
                : formatCount(endedCount)
            }
            label="Hosted"
            accent="muted"
          />
          <StatChip
            icon={<Gamepad2 className="w-full h-full" />}
            value={gamesCount}
            label="Games"
            accent="muted"
          />
        </div>
      </div>

      {/* My status callout */}
      {showMyStatus && address && (
        <button
          onClick={() => navigate(`/profile/${address}`)}
          className="group flex flex-row items-center justify-between gap-3 rounded-md border border-brand/25 bg-brand/[0.08] px-3 py-2 text-left hover:bg-brand/[0.12] hover:border-brand/40 transition-colors"
        >
          <div className="flex flex-row items-center gap-3 min-w-0">
            <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand/15 text-brand [&_svg]:w-4 [&_svg]:h-4">
              <SPACE_INVADER_SOLID />
            </span>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-brand text-sm sm:text-base text-brand truncate">
                Your tournaments
              </span>
              <span className="text-[11px] text-brand-muted truncate">
                {myLiveCount > 0 && (
                  <>
                    <span className="text-brand font-semibold">
                      {myLiveCount}
                    </span>{" "}
                    live
                  </>
                )}
                {myLiveCount > 0 && (mySubmissionCount ?? 0) > 0 && " · "}
                {(mySubmissionCount ?? 0) > 0 && (
                  <>
                    <span className="text-warning font-semibold">
                      {mySubmissionCount}
                    </span>{" "}
                    awaiting submission
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex flex-row items-center gap-1.5 text-[11px] uppercase tracking-wider text-brand-muted group-hover:text-brand transition-colors">
            View
            <span aria-hidden>→</span>
          </div>
        </button>
      )}

      {/* Lifetime prize stat - only when we have data and there's headroom */}
      {totalPrizes != null && totalPrizes > 0 && (
        <div className="hidden xl:flex flex-row items-center gap-2 text-[11px] text-brand-muted">
          <Coins className="w-3.5 h-3.5 text-brand/60" />
          <span>
            <span className="text-brand font-semibold">
              {formatNumber(totalPrizes)}
            </span>{" "}
            prizes awarded across{" "}
            <span className="text-brand font-semibold">
              {formatNumber(totalRegistrations ?? 0)}
            </span>{" "}
            entries
          </span>
        </div>
      )}
    </section>
  );
};

export default DashboardBanner;
