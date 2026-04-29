import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { addAddressPadding } from "starknet";
import {
  ExternalLink,
  ArrowLeft,
  Users,
  Flag,
  Hourglass,
  CheckCircle2,
  Filter,
} from "lucide-react";

import { useTournaments } from "@provable-games/budokan-sdk/react";
import { useTokens } from "@provable-games/denshokan-sdk/react";

import { useChainConfig } from "@/context/chain";
import { useGetUsernames } from "@/hooks/useController";
import StatChip from "@/components/shared/StatChip";
import { Button } from "@/components/ui/button";
import { TournamentCard } from "@/components/overview/TournamanentCard";
import TournamentSkeletons from "@/components/overview/TournamentSkeletons";
import EmptyResults from "@/components/overview/tournaments/EmptyResults";
import FilterPanel from "@/components/overview/FilterPanel";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHEVRON_DOWN, X } from "@/components/Icons";

import { displayAddress, indexAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";
import useUIStore from "@/hooks/useUIStore";
import { useFilterPills } from "@/hooks/useFilterPills";
import { matchesTournamentFilters } from "@/lib/utils/tournamentFilters";

import NotFound from "@/containers/NotFound";

const SORT_OPTIONS = [
  { value: "start_time", label: "Start Time" },
  { value: "end_time", label: "End Time" },
  { value: "players", label: "Players" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

type ProfileTab = "all" | "live" | "completed";

const Profile = () => {
  const { address: rawAddress } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { address: connectedAddress } = useAccount();
  const { selectedChainConfig } = useChainConfig();
  const { getTokenDecimals } = useSystemCalls();

  // Validate address format
  const normalizedAddress = useMemo(() => {
    if (!rawAddress) return null;
    try {
      return addAddressPadding(rawAddress);
    } catch {
      return null;
    }
  }, [rawAddress]);

  const isOwnProfile =
    !!connectedAddress &&
    !!normalizedAddress &&
    indexAddress(connectedAddress) === indexAddress(normalizedAddress);

  // Username resolution
  const addressList = useMemo(
    () => (normalizedAddress ? [normalizedAddress] : []),
    [normalizedAddress],
  );
  const { usernames } = useGetUsernames(addressList);
  const username = normalizedAddress
    ? usernames?.get(indexAddress(normalizedAddress))
    : undefined;

  // Source of truth: tournaments are derived from currently-owned Budokan
  // NFTs (denshokan), not indexed registrations.player_address. The contract
  // keys registrations by token_id only — address attribution becomes stale
  // the moment a token is transferred. See PR #242 for the equivalent change
  // on the Overview "my" tab.
  const budokanAddress = selectedChainConfig?.budokanAddress;
  const { data: playerTokensResult, isLoading: tokensLoading } = useTokens(
    normalizedAddress && budokanAddress
      ? {
          owner: normalizedAddress,
          minterAddress: budokanAddress,
          hasContext: true,
          limit: 1000,
        }
      : undefined,
  );

  const myTournamentIds = useMemo(() => {
    if (!playerTokensResult?.data) return null; // null → still loading
    const ids = new Set<string>();
    for (const token of playerTokensResult.data) {
      if (token.contextId) ids.add(String(token.contextId));
    }
    return [...ids];
  }, [playerTokensResult]);

  const totalEntries = myTournamentIds?.length ?? 0;
  const hasTournaments = (myTournamentIds?.length ?? 0) > 0;

  // Per-phase counts. Each is a 1-result query whose `total` field gives the
  // count without paying for the full list. Skip when there are no ids.
  const { tournaments: liveResult } = useTournaments(
    hasTournaments
      ? { tournamentIds: myTournamentIds!, phase: "live", limit: 1 }
      : undefined,
  );
  const { tournaments: submissionResult } = useTournaments(
    hasTournaments
      ? { tournamentIds: myTournamentIds!, phase: "submission", limit: 1 }
      : undefined,
  );
  const { tournaments: finalizedResult } = useTournaments(
    hasTournaments
      ? { tournamentIds: myTournamentIds!, phase: "finalized", limit: 1 }
      : undefined,
  );

  const liveCount = liveResult?.total ?? 0;
  const submissionCount = submissionResult?.total ?? 0;
  const finalizedCount = finalizedResult?.total ?? 0;

  // Tournament list — same shape as the Overview "my" tab.
  const [activeTab, setActiveTab] = useState<ProfileTab>("all");
  const [sortBy, setSortBy] = useState<SortValue>("start_time");
  const phaseFilter =
    activeTab === "live"
      ? "live"
      : activeTab === "completed"
        ? "finalized"
        : undefined;

  // Game filter is server-side; rest are client-side (mirrors Overview)
  const { gameFilters, filters } = useUIStore();
  const activePills = useFilterPills();

  const { tournaments: tournamentsResult, loading: tournamentsLoading } =
    useTournaments(
      hasTournaments
        ? {
            tournamentIds: myTournamentIds!,
            phase: phaseFilter,
            sort: sortBy,
            gameAddress: gameFilters[0],
            limit: 24,
            includePrizeSummary: "summary",
          }
        : undefined,
    );

  const rawPlayerTournaments = useMemo(
    () => tournamentsResult?.data ?? [],
    [tournamentsResult],
  );

  // Apply client-side filters layered on top of the server-side query
  const playerTournaments = useMemo(
    () =>
      rawPlayerTournaments.filter((t) => {
        const aggregationTokenTotals = t.prizeAggregation?.map((p) => ({
          tokenAddress: p.tokenAddress,
          tokenType: p.tokenType,
          totalAmount: p.totalAmount,
        }));
        return matchesTournamentFilters(
          t,
          t.entryCount ?? 0,
          aggregationTokenTotals,
          filters,
        );
      }),
    [rawPlayerTournaments, filters],
  );

  // Token data for tournament cards (mirrors Overview's pattern)
  const uniqueTokenAddresses = useMemo(() => {
    const addresses = new Set<string>();
    playerTournaments.forEach((t) => {
      if (t.entryFeeToken) addresses.add(t.entryFeeToken);
      if (t.prizeAggregation) {
        t.prizeAggregation.forEach((p) => {
          if (p.tokenAddress) addresses.add(p.tokenAddress);
        });
      }
    });
    return Array.from(addresses);
  }, [playerTournaments]);

  const tokensArray = useMemo(
    () =>
      getTokensByAddresses(
        uniqueTokenAddresses,
        selectedChainConfig?.chainId ?? "",
      ),
    [uniqueTokenAddresses, selectedChainConfig?.chainId],
  );

  const allUniqueTokens = useMemo(
    () => tokensArray.map((t) => t.token_address).filter(Boolean),
    [tokensArray],
  );

  const { prices: tokenPrices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: allUniqueTokens,
  });

  const erc20Addresses = useMemo(
    () =>
      tokensArray
        .filter((t) => t.token_type === "erc20" && t.token_address)
        .map((t) => t.token_address),
    [tokensArray],
  );

  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (erc20Addresses.length === 0) return;
    let cancelled = false;
    (async () => {
      const missing = erc20Addresses.filter(
        (addr) => !(addr in tokenDecimals),
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
      setTokenDecimals((prev) => {
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
  }, [erc20Addresses.join(",")]);

  if (!rawAddress || !normalizedAddress) {
    return <NotFound message="Invalid profile address" />;
  }

  const displayName = username ?? displayAddress(normalizedAddress);
  const initials = (username ?? normalizedAddress.slice(2, 4)).slice(0, 2).toUpperCase();
  const explorerUrl = selectedChainConfig?.blockExplorerUrl
    ? `${selectedChainConfig.blockExplorerUrl}/contract/${normalizedAddress}`
    : null;

  const isLoadingProfile = tokensLoading && myTournamentIds === null;

  return (
    <div className="lg:w-[87.5%] xl:w-5/6 2xl:w-3/4 sm:mx-auto flex flex-col gap-4 h-full overflow-y-auto pb-6 pr-2">
      {/* Profile header */}
      <div className="flex flex-row items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="px-2 flex-shrink-0"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex flex-row items-center gap-3 sm:gap-4 flex-1 min-w-0">
          {/* Avatar */}
          <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-brand/10 border border-brand/30 font-brand text-base sm:text-xl text-brand uppercase">
            {initials}
          </div>

          {/* Identity */}
          <div className="flex flex-col min-w-0 gap-1">
            <div className="flex flex-row items-center gap-2 min-w-0">
              <span className="font-brand text-xl sm:text-2xl xl:text-3xl truncate text-brand">
                {displayName}
              </span>
              {isOwnProfile && (
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider flex-shrink-0",
                    "bg-brand/15 text-brand border-brand/40",
                  )}
                >
                  You
                </span>
              )}
            </div>
            <div className="flex flex-row items-center gap-2 text-[11px] text-brand-muted font-mono">
              <span className="truncate">
                {displayAddress(normalizedAddress)}
              </span>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-muted hover:text-brand transition-colors flex-shrink-0"
                  aria-label="View on explorer"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip
          icon={<Users className="w-full h-full" />}
          value={totalEntries}
          label="Entries"
          accent="brand"
        />
        <StatChip
          icon={<Flag className="w-full h-full" />}
          value={liveCount}
          label="Live"
          accent="success"
        />
        <StatChip
          icon={<Hourglass className="w-full h-full" />}
          value={submissionCount}
          label="Submitting"
          accent="warning"
        />
        <StatChip
          icon={<CheckCircle2 className="w-full h-full" />}
          value={finalizedCount}
          label="Finalized"
          accent="muted"
        />
      </div>

      {/* Tournament history section */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-3 border-b border-brand/15 pb-3">
          <div className="flex flex-row gap-2 flex-wrap">
            {(
              [
                { id: "all", label: "All" },
                { id: "live", label: "Live" },
                { id: "completed", label: "Completed" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "inline-flex items-center h-9 rounded-md border px-3 text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors",
                  activeTab === t.id
                    ? "bg-brand/15 border-brand/50 text-brand shadow-[0_0_0_1px_rgba(225,249,128,0.15)]"
                    : "bg-brand/5 border-brand/15 text-brand-muted hover:text-brand hover:bg-brand/10 hover:border-brand/30",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-row gap-2 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  aria-label="Open filters"
                  className="inline-flex items-center gap-2 h-9 rounded-md border border-brand/20 bg-brand/5 px-3 text-xs sm:text-sm font-semibold uppercase tracking-wider text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activePills.length > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-brand text-black px-1 text-[10px] font-bold leading-none">
                      {activePills.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[320px] p-4 max-h-[70vh] overflow-y-auto bg-black border border-brand/40"
              >
                <FilterPanel />
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-between gap-2 h-9 rounded-md border border-brand/20 bg-brand/5 px-3 min-w-[120px] text-xs sm:text-sm font-semibold uppercase tracking-wider text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors">
                <span>
                  {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                </span>
                <span className="w-4 h-4 text-brand-muted">
                  <CHEVRON_DOWN />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-black border-2 border-brand-muted">
                <DropdownMenuLabel className="text-brand">
                  Options
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-brand-muted" />
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="text-brand cursor-pointer"
                    onClick={() => setSortBy(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active filter pills */}
        {activePills.length > 0 && (
          <div className="flex flex-row items-center gap-2 px-1 overflow-x-auto w-full">
            <span className="text-[10px] uppercase tracking-wider text-brand-muted flex-shrink-0 hidden sm:inline">
              Filters
            </span>
            {activePills.map((pill) => (
              <div
                key={pill.key}
                className="inline-flex items-center gap-2 h-8 rounded-md border border-brand/25 bg-brand/10 pl-1.5 pr-2 shrink-0"
              >
                {pill.icon}
                <span className="text-xs sm:text-sm font-semibold tracking-wide text-brand truncate max-w-[160px]">
                  {pill.label}
                </span>
                <button
                  className="w-4 h-4 text-brand-muted hover:text-brand transition-colors flex-shrink-0"
                  onClick={pill.onRemove}
                  aria-label={`Remove ${pill.label} filter`}
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}

        {(isLoadingProfile || (tournamentsLoading && playerTournaments.length === 0)) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-2 sm:gap-4">
            <TournamentSkeletons tournamentsCount={6} count={6} />
          </div>
        ) : playerTournaments.length === 0 ? (
          <EmptyResults gameFilters={[]} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-2 sm:gap-4">
            {playerTournaments.map((t, idx) => {
              const aggregations = t.prizeAggregation
                ? {
                    token_totals: t.prizeAggregation.map((p) => ({
                      tokenAddress: p.tokenAddress,
                      tokenType: p.tokenType,
                      totalAmount: Number(p.totalAmount ?? 0),
                    })),
                  }
                : undefined;
              return (
                <TournamentCard
                  key={`${t.id}-${idx}`}
                  tournament={t}
                  index={idx}
                  status="my"
                  prizes={null}
                  entryCount={t.entryCount ?? 0}
                  tokens={tokensArray}
                  tokenPrices={tokenPrices}
                  pricesLoading={pricesLoading}
                  tokenDecimals={tokenDecimals}
                  aggregations={aggregations}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Subtle helper for empty profiles */}
      {!isLoadingProfile && totalEntries === 0 && (
        <div className="text-center py-8">
          <p className="text-brand-muted text-sm">
            {isOwnProfile
              ? "You haven't entered any tournaments yet."
              : "This player hasn't entered any tournaments yet."}
          </p>
          {isOwnProfile && (
            <Button
              size="sm"
              className="uppercase mt-3"
              onClick={() => navigate("/")}
            >
              Browse Tournaments
            </Button>
          )}
        </div>
      )}

    </div>
  );
};

export default Profile;
