import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { addAddressPadding } from "starknet";
import { ExternalLink, ArrowLeft, Trophy, Users, Flag, Hourglass, CheckCircle2 } from "lucide-react";

import {
  usePlayerStats,
  usePlayerTournamentCount,
  usePlayerTournaments,
} from "@provable-games/budokan-sdk/react";

import { useChainConfig } from "@/context/chain";
import { useGetUsernames } from "@/hooks/useController";
import StatChip from "@/components/shared/StatChip";
import { Button } from "@/components/ui/button";
import { TournamentCard } from "@/components/overview/TournamanentCard";
import TournamentSkeletons from "@/components/overview/TournamentSkeletons";
import EmptyResults from "@/components/overview/tournaments/EmptyResults";

import { displayAddress, indexAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";

import NotFound from "@/containers/NotFound";

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

  const queryAddress = useMemo(
    () => (normalizedAddress ? indexAddress(normalizedAddress) : undefined),
    [normalizedAddress],
  );

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

  // Stats
  const { stats: playerStats } = usePlayerStats(queryAddress);
  const { count: liveCount } = usePlayerTournamentCount(queryAddress, "live");
  const { count: submissionCount } = usePlayerTournamentCount(
    queryAddress,
    "submission",
  );
  const { count: finalizedCount } = usePlayerTournamentCount(
    queryAddress,
    "finalized",
  );

  // Tournament list
  const [activeTab, setActiveTab] = useState<ProfileTab>("all");

  const phaseFilter =
    activeTab === "live"
      ? "live"
      : activeTab === "completed"
        ? "finalized"
        : undefined;

  const { tournaments: tournamentsResult, loading: tournamentsLoading } =
    usePlayerTournaments(queryAddress, {
      phase: phaseFilter,
      limit: 24,
    });
  const playerTournaments = useMemo(
    () => tournamentsResult?.data ?? [],
    [tournamentsResult],
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

  const totalEntries = playerStats?.totalTournaments ?? 0;
  const totalSubmissions = playerStats?.totalSubmissions ?? 0;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatChip
          icon={<Users className="w-full h-full" />}
          value={totalEntries}
          label="Entries"
          accent="brand"
        />
        <StatChip
          icon={<Flag className="w-full h-full" />}
          value={liveCount ?? 0}
          label="Live"
          accent="success"
        />
        <StatChip
          icon={<Hourglass className="w-full h-full" />}
          value={submissionCount ?? 0}
          label="Submitting"
          accent="warning"
        />
        <StatChip
          icon={<CheckCircle2 className="w-full h-full" />}
          value={finalizedCount ?? 0}
          label="Finalized"
          accent="muted"
        />
        <StatChip
          icon={<Trophy className="w-full h-full" />}
          value={totalSubmissions}
          label="Submissions"
          accent="muted"
        />
      </div>

      {/* Tournament history section */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-3 border-b border-brand/15 pb-2">
          <div className="flex flex-row gap-2">
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
          <span className="text-[10px] uppercase tracking-wider text-brand-muted">
            {playerTournaments.length} shown
          </span>
        </div>

        {tournamentsLoading && playerTournaments.length === 0 ? (
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
      {!tournamentsLoading && totalEntries === 0 && (
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
