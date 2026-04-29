import { REFRESH, TROPHY } from "@/components/Icons";
import { useRegistrationsByOwner } from "@provable-games/budokan-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { BigNumberish } from "starknet";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import EntryCard from "@/components/tournament/myEntries/EntryCard";
import type { Tournament, WSEventMessage } from "@provable-games/budokan-sdk";
import {
  useLiveLeaderboard,
  usePlayerBestRank,
} from "@provable-games/denshokan-sdk/react";
import { useChainConfig } from "@/context/chain";
import {
  cn,
  getOrdinalSuffix,
  padAddress,
} from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PositionPrizeDisplay } from "@/components/tournament/EntrantsTable";

type SortBy = "score" | "newest" | "oldest" | "entry";
type FilterBy = "all" | "active" | "done" | "banned";

interface MyEntriesProps {
  tournamentId: BigNumberish;
  gameAddress: string;
  tournamentModel: Tournament;
  totalEntryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  banRefreshTrigger?: number;
  lastMessage?: WSEventMessage | null;
  className?: string;
  prizesByPosition?: Map<number, PositionPrizeDisplay>;
}

const MyEntries = ({
  tournamentId,
  gameAddress,
  tournamentModel,
  totalEntryCount,
  isStarted,
  isEnded,
  banRefreshTrigger,
  lastMessage,
  className,
  prizesByPosition,
}: MyEntriesProps) => {
  const { address } = useAccount();
  const { selectedChainConfig } = useChainConfig();
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  const {
    entries: ownedEntries,
    isLoading: loading,
    refetch,
  } = useLiveLeaderboard({
    contextId: Number(tournamentId),
    minterAddress: padAddress(tournamentAddress),
    owner: address,
    sort: { field: "score", direction: "desc" },
    limit: 1000,
    enabled: !!address,
    liveScores: true,
    liveGameOver: true,
    liveMints: true,
  });

  const gameTokens = ownedEntries;

  // Source of truth for "which entries does this user have" is current NFT
  // ownership from denshokan (`useLiveLeaderboard` above with owner=address).
  // Registration metadata (ban / submission / entry-number) for the tokens we
  // currently own comes from `useRegistrationsByOwner`, which resolves the
  // gameTokenId set internally — staying correct under transfers regardless
  // of who originally registered. See issue #241.
  const { registrations: myEntriesResult, refetch: refetchRegistrations } =
    useRegistrationsByOwner(tournamentId?.toString(), address, { limit: 1000 });
  const myEntriesRegs = myEntriesResult?.data ?? null;
  const myEntriesCount = gameTokens.length;

  // Normalize a raw token id (decimal or hex string, BigNumberish) to a
  // canonical lowercase 0x-prefixed hex string. Avoids Number() — token ids
  // are felt252-sized and would lose precision.
  const toHexTokenId = (raw: unknown): string => {
    if (raw == null) return "0x0";
    const s = String(raw);
    if (s.startsWith("0x") || s.startsWith("0X")) return s.toLowerCase();
    try {
      return "0x" + BigInt(s).toString(16);
    } catch {
      return s.toLowerCase();
    }
  };

  // Stable refs to refetchers — the WS effect below depends only on
  // `lastMessage`, so refetcher reference churn between renders can't clear
  // pending timers before they fire.
  const refetchRef = useRef(refetch);
  const refetchRegistrationsRef = useRef(refetchRegistrations);
  refetchRef.current = refetch;
  refetchRegistrationsRef.current = refetchRegistrations;

  useEffect(() => {
    if (address) {
      refetch();
      refetchRegistrations();
    }
  }, [address, myEntriesCount, totalEntryCount]);

  // Refetch on budokan WS registration events. Registrations refetch
  // immediately (budokan data is ready). Token refetch is staggered — the
  // denshokan indexer needs time to index the mint, and lag is variable.
  useEffect(() => {
    if (lastMessage?.channel !== "registrations") return;
    refetchRegistrationsRef.current();
    const timers = [1000, 3000, 7000].map((ms) =>
      setTimeout(() => refetchRef.current(), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [lastMessage]);

  useEffect(() => {
    if (banRefreshTrigger && banRefreshTrigger > 0) {
      refetch();
      refetchRegistrations();
    }
  }, [banRefreshTrigger]);

  const handleRefresh = () => {
    refetch();
    refetchRegistrations();
  };

  const hasEntries = !!address && myEntriesCount > 0;

  // Player's best rank across their entries in this tournament
  const { data: bestRank } = usePlayerBestRank(
    hasEntries && isStarted ? address : undefined,
    {
      contextId: Number(tournamentId),
      minterAddress: padAddress(tournamentAddress),
      live: isStarted && !isEnded,
    },
  );

  // ---- Sorting + filtering ----
  const [sortBy, setSortBy] = useState<SortBy>(isStarted ? "score" : "entry");
  const [filterBy, setFilterBy] = useState<FilterBy>("all");

  // Switch default sort when the tournament transitions to started
  useEffect(() => {
    if (isStarted && sortBy === "entry") setSortBy("score");
  }, [isStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleEntries = useMemo(() => {
    // Source of truth: tokens this wallet currently owns (denshokan). For
    // each owned token, look up its registration row by gameTokenId to get
    // ban/submission/entry-number metadata. A freshly-registered token
    // appears as soon as denshokan indexes the mint (typically within a few
    // seconds); previously this used registrations.player_address as source
    // of truth, which mis-attributed transferred tokens.
    if (!gameTokens || gameTokens.length === 0) return [];

    const regsByHexId = new Map<string, any>();
    for (const r of (myEntriesRegs as any[]) ?? []) {
      regsByHexId.set(toHexTokenId(r.gameTokenId ?? r.game_token_id), r);
    }

    const enriched = gameTokens.map((game) => {
      const reg = regsByHexId.get(toHexTokenId(game.tokenId));
      return {
        game,
        registration: reg,
        isBanned: !!reg?.isBanned,
        entryNumber: Number(reg?.entryNumber ?? 0),
      };
    });

    const filtered = enriched.filter(({ game, isBanned }) => {
      if (filterBy === "all") return true;
      if (filterBy === "banned") return isBanned;
      if (filterBy === "done") return !isBanned && game.gameOver;
      if (filterBy === "active") return !isBanned && !game.gameOver;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "score") return (b.game.score ?? 0) - (a.game.score ?? 0);
      if (sortBy === "entry") return a.entryNumber - b.entryNumber;
      const aMinted = a.game.mintedAt ? new Date(a.game.mintedAt).getTime() : 0;
      const bMinted = b.game.mintedAt ? new Date(b.game.mintedAt).getTime() : 0;
      return sortBy === "newest" ? bMinted - aMinted : aMinted - bMinted;
    });

    return sorted;
  }, [gameTokens, myEntriesRegs, filterBy, sortBy]);

  const SORT_LABELS: Record<SortBy, string> = {
    score: "Score",
    entry: "Entry #",
    newest: "Newest",
    oldest: "Oldest",
  };
  const FILTER_LABELS: Record<FilterBy, string> = {
    all: "All",
    active: "Active",
    done: "Done",
    banned: "Banned",
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border border-brand/20 rounded-lg bg-black/30 p-3",
        className,
      )}
    >
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-row items-baseline gap-2">
          <h3 className="font-brand text-base text-brand">My Entries</h3>
          {hasEntries && (
            <span className="text-xs text-brand-muted">({myEntriesCount})</span>
          )}
        </div>
        <div className="flex flex-row items-center gap-1.5">
          {bestRank && (
            <div className="flex flex-col items-center justify-center px-2 py-0.5 rounded-md border border-brand/10 bg-brand/5">
              <div className="flex flex-row items-center gap-1">
                <span className="w-3 h-3 text-brand opacity-70">
                  <TROPHY />
                </span>
                <span className="font-brand font-bold text-xs text-brand">
                  {bestRank.rank}
                  {getOrdinalSuffix(bestRank.rank)}
                </span>
              </div>
              <span className="text-[8px] uppercase tracking-wider text-brand-muted">
                Best Rank
              </span>
            </div>
          )}
          {hasEntries && (
            <>
              {/* Mobile: single combined dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Sort and filter entries"
                    className="sm:hidden relative flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {filterBy !== "all" && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-44 bg-black border-2 border-brand-muted sm:hidden"
                >
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-brand-muted">
                    Sort by
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as SortBy)}
                  >
                    {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
                      <DropdownMenuRadioItem
                        key={key}
                        value={key}
                        className="text-brand cursor-pointer focus:bg-brand/10 focus:text-brand"
                      >
                        {SORT_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator className="bg-brand-muted" />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-brand-muted">
                    Show
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={filterBy}
                    onValueChange={(v) => setFilterBy(v as FilterBy)}
                  >
                    {(Object.keys(FILTER_LABELS) as FilterBy[]).map((key) => (
                      <DropdownMenuRadioItem
                        key={key}
                        value={key}
                        className="text-brand cursor-pointer focus:bg-brand/10 focus:text-brand"
                      >
                        {FILTER_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Desktop: two labeled dropdowns */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Sort entries"
                    className="hidden sm:flex flex-row items-center gap-1.5 h-8 px-2.5 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
                  >
                    <span className="text-[9px] uppercase tracking-wider text-brand-muted">
                      Sort
                    </span>
                    <span className="font-brand text-xs">
                      {SORT_LABELS[sortBy]}
                    </span>
                    <ChevronDown className="h-3 w-3 text-brand-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="hidden sm:block bg-black border-2 border-brand-muted"
                >
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-brand-muted">
                    Sort by
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as SortBy)}
                  >
                    {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
                      <DropdownMenuRadioItem
                        key={key}
                        value={key}
                        className="text-brand cursor-pointer focus:bg-brand/10 focus:text-brand"
                      >
                        {SORT_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Filter entries"
                    className="hidden sm:flex flex-row items-center gap-1.5 h-8 px-2.5 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
                  >
                    <span className="text-[9px] uppercase tracking-wider text-brand-muted">
                      Show
                    </span>
                    <span className="font-brand text-xs">
                      {FILTER_LABELS[filterBy]}
                    </span>
                    <ChevronDown className="h-3 w-3 text-brand-muted" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="hidden sm:block bg-black border-2 border-brand-muted"
                >
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-brand-muted">
                    Show
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={filterBy}
                    onValueChange={(v) => setFilterBy(v as FilterBy)}
                  >
                    {(Object.keys(FILTER_LABELS) as FilterBy[]).map((key) => (
                      <DropdownMenuRadioItem
                        key={key}
                        value={key}
                        className="text-brand cursor-pointer focus:bg-brand/10 focus:text-brand"
                      >
                        {FILTER_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {hasEntries && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Refresh entries"
              className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
            >
              <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {!address ? (
        <p className="text-xs text-brand-muted/60 italic py-3">
          Connect your account to view your entries.
        </p>
      ) : myEntriesCount === 0 ? (
        <p className="text-xs text-brand-muted/60 italic py-3">
          You have no entries in this tournament.
        </p>
      ) : visibleEntries.length === 0 ? (
        <p className="text-xs text-brand-muted/60 italic py-3">
          No entries match the current filter.
        </p>
      ) : (
        <div className="flex flex-row gap-2 overflow-x-auto pb-1">
          {visibleEntries.map(({ game, registration }, index) => (
            <EntryCard
              key={game.tokenId ?? index}
              gameAddress={gameAddress}
              game={game}
              tournamentModel={tournamentModel}
              tournamentId={tournamentId}
              tournamentAddress={tournamentAddress}
              registration={registration}
              isStarted={isStarted}
              isEnded={isEnded}
              prizesByPosition={prizesByPosition}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyEntries;
