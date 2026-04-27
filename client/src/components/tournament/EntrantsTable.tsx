import { useState, useMemo, useEffect, useRef } from "react";
import { BigNumberish } from "starknet";
import { useLiveLeaderboard } from "@provable-games/denshokan-sdk/react";
import { useRegistrations } from "@provable-games/budokan-sdk/react";
import type { Tournament, WSEventMessage } from "@provable-games/budokan-sdk";
import { TableProperties, Ban as BanIcon, Info } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { USER, REFRESH, VERIFIED } from "@/components/Icons";
import Pagination from "@/components/table/Pagination";
import { useGetUsernames } from "@/hooks/useController";
import { useChainConfig } from "@/context/chain";
import {
  MobilePlayerCard,
  PlayerDetails,
} from "@/components/tournament/table/PlayerCard";
import { ScoreTableDialog } from "@/components/dialogs/ScoreTable";
import { BanManagementDialog } from "@/components/dialogs/BanManagement";
import {
  cn,
  displayAddress,
  getOrdinalSuffix,
  indexAddress,
  padAddress,
} from "@/lib/utils";

export interface PositionPrizeDisplay {
  usd: number | null;
  tokenSymbol?: string;
  tokenLogo?: string;
  tokenAmountDisplay?: string;
}

interface EntrantsTableProps {
  tournamentId: BigNumberish;
  entryCount: number;
  tournamentModel: Tournament;
  isStarted: boolean;
  isEnded: boolean;
  prizesByPosition: Map<number, PositionPrizeDisplay>;
  onBanComplete?: () => void;
  lastMessage?: WSEventMessage | null;
  onShowPrizeBreakdown?: () => void;
}

const PAGE_SIZE = 10;

const formatUSDCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
};

const positionLabel = (pos0: number) => {
  if (pos0 === 0) return "🥇";
  if (pos0 === 1) return "🥈";
  if (pos0 === 2) return "🥉";
  const pos = pos0 + 1;
  return `${pos}${getOrdinalSuffix(pos)}`;
};

const EntrantsTable = ({
  tournamentId,
  entryCount,
  tournamentModel,
  isStarted,
  isEnded,
  prizesByPosition,
  onBanComplete,
  lastMessage,
  onShowPrizeBreakdown,
}: EntrantsTableProps) => {
  const { selectedChainConfig } = useChainConfig();
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [localBanRefreshTrigger, setLocalBanRefreshTrigger] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Ban button visibility
  const entryReq = (tournamentModel as any)?.entryRequirement;
  const reqType = entryReq?.entryRequirementType;
  const requirementVariant = reqType?.type as string | undefined;
  const extensionConfig =
    requirementVariant === "extension"
      ? { address: reqType?.address, config: reqType?.config }
      : undefined;
  const showBanButton =
    !isStarted &&
    !!entryReq &&
    requirementVariant === "extension" &&
    !!extensionConfig?.address &&
    entryCount > 0;

  // Live leaderboard — server-paginated by score. The SDK handles efficient
  // updates: WS score/game_over events patch in place; mint events trigger a
  // debounced refetch. `enabled` stays on so the WS mint subscription is
  // active before the first entry — otherwise the very first entrant could
  // never trigger a liveMints refetch.
  const {
    entries: pageEntries,
    total: leaderboardTotal,
    isLoading: tokensLoading,
    refetch: refetchTokens,
  } = useLiveLeaderboard({
    contextId: Number(tournamentId),
    minterAddress: padAddress(tournamentAddress),
    sort: { field: "score", direction: "desc" },
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
    enabled: !!tournamentId,
    liveScores: isStarted,
    liveGameOver: isStarted,
  });

  // Registrations: instant source for ban/submission status, and used to
  // surface pending entries during the window between budokan seeing the
  // registration and denshokan indexing the corresponding mint.
  const { registrations: registrantsResult, refetch: refetchRegistrations } =
    useRegistrations(tournamentId?.toString(), { limit: 1000 });
  const registrants = registrantsResult?.data ?? null;

  // Normalize a raw token id to a canonical lowercase 0x-prefixed hex string.
  // Avoids Number() — token ids are felt252-sized and would lose precision.
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

  const regByHexId = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of (registrants as any[]) ?? []) {
      map.set(toHexTokenId(r.gameTokenId), r);
    }
    return map;
  }, [registrants]);

  // Total trusts whichever source has more rows — registrations land
  // instantly, so during indexer lag they may exceed the leaderboard count.
  const registrantsCount = registrants?.length ?? 0;
  const totalEntries = Math.max(
    leaderboardTotal ?? 0,
    registrantsCount,
    entryCount,
  );
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;
  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const previousPage = () => setCurrentPage((p) => Math.max(p - 1, 1));

  // Build the displayed rows for the current page. The leaderboard provides
  // the score-ranked spine; on the last page we supplement with registrations
  // budokan knows about but denshokan hasn't indexed yet (so a brand-new
  // entry isn't invisible while waiting for indexer catch-up). Older
  // unindexed entries — those that should be on earlier leaderboard pages —
  // aren't recoverable without fetching all leaderboard pages, but in
  // practice unindexed entries are always the most recent ones.
  const gameTokens = useMemo(() => {
    const baseRows = pageEntries.map((entry) => {
      const reg = regByHexId.get(toHexTokenId(entry.tokenId));
      return {
        ...entry,
        playerName: entry.playerName || reg?.playerName || "",
        isBanned: !!reg?.isBanned,
        hasSubmitted: !!reg?.hasSubmitted,
        entryNumber: Number(reg?.entryNumber ?? 0),
      };
    });

    const isLastPage = currentPage >= totalPages;
    const unindexedCount = Math.max(
      0,
      registrantsCount - (leaderboardTotal ?? 0),
    );
    if (!isLastPage || unindexedCount === 0) return baseRows;

    // Pick the most-recent registrations not on the current leaderboard page,
    // capped at the count of unindexed rows. Restore entry-number order so
    // they slot in at the bottom in the order they were created.
    const presentTokenIds = new Set(
      baseRows.map((r) => toHexTokenId(r.tokenId)),
    );
    const supplemental = ((registrants as any[]) ?? [])
      .filter(
        (reg) => !presentTokenIds.has(toHexTokenId(reg.gameTokenId)),
      )
      .sort(
        (a, b) => Number(b.entryNumber ?? 0) - Number(a.entryNumber ?? 0),
      )
      .slice(0, unindexedCount)
      .reverse()
      .map((reg) => ({
        tokenId: toHexTokenId(reg.gameTokenId),
        score: 0,
        playerName: reg.playerName ?? "",
        owner: reg.playerAddress ?? "0x0",
        gameOver: false,
        rank: 0,
        mintedAt: new Date().toISOString(),
        entryNumber: Number(reg.entryNumber ?? 0),
        isBanned: !!reg.isBanned,
        hasSubmitted: !!reg.hasSubmitted,
      }));

    return [...baseRows, ...supplemental];
  }, [
    pageEntries,
    regByHexId,
    registrants,
    registrantsCount,
    leaderboardTotal,
    currentPage,
    totalPages,
  ]);

  const ownerAddresses = useMemo(
    () => gameTokens.map((g: any) => g?.owner ?? "0x0"),
    [gameTokens],
  );
  const { usernames } = useGetUsernames(ownerAddresses);

  // Track which page `pageEntries` actually corresponds to. Between clicking
  // a new page and the fetch resolving, `useLiveLeaderboard` keeps the
  // previous page's rows in `pageEntries`. We can't gate on `tokensLoading`
  // here — when `currentPage` changes, the fetch effect runs *after* commit,
  // so for the first render the loading flag is still false even though the
  // displayed rows belong to the previous page.
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  useEffect(() => {
    if (!tokensLoading) setLoadedPage(currentPage);
  }, [tokensLoading, currentPage]);
  const isPageStale = loadedPage !== currentPage;
  const displayRows = isPageStale ? [] : gameTokens;

  // Stable refs to refetchers — the WS effect below depends only on
  // `lastMessage`, so refetcher reference churn between renders can't clear
  // pending timers before they fire.
  const refetchTokensRef = useRef(refetchTokens);
  const refetchRegistrationsRef = useRef(refetchRegistrations);
  refetchTokensRef.current = refetchTokens;
  refetchRegistrationsRef.current = refetchRegistrations;

  // Refetch on budokan WS registration events. Registrations refetch
  // immediately (budokan data is ready) and that drives the pre-start view
  // directly. Token refetch is staggered — the denshokan indexer needs time
  // to index the mint, and lag is variable.
  useEffect(() => {
    if (lastMessage?.channel !== "registrations") return;
    refetchRegistrationsRef.current();
    const timers = [1000, 3000, 7000].map((ms) =>
      setTimeout(() => refetchTokensRef.current(), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [lastMessage]);

  const gameAddress = tournamentModel?.gameAddress;

  return (
    <div className="flex flex-col gap-2 border border-brand/20 rounded-lg bg-black/30 p-3">
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-row items-baseline gap-2">
          <h3 className="font-brand text-base text-brand">
            {isStarted ? "Scores" : "Entrants"}
          </h3>
          {totalEntries > 0 && (
            <span className="text-xs text-brand-muted">({totalEntries})</span>
          )}
        </div>
        <div className="flex flex-row items-center gap-1.5">
          <button
            onClick={refetchTokens}
            disabled={tokensLoading}
            aria-label="Refresh scores"
            className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
          >
            <REFRESH
              className={`h-4 w-4 ${tokensLoading ? "animate-spin" : ""}`}
            />
          </button>
          {onShowPrizeBreakdown && (
            <button
              onClick={onShowPrizeBreakdown}
              aria-label="Prize breakdown"
              className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
            >
              <Info className="h-4 w-4" />
            </button>
          )}
          {entryCount > 0 && (
            <button
              onClick={() => setShowTableDialog(true)}
              aria-label="Open score table"
              className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
            >
              <TableProperties className="h-4 w-4" />
            </button>
          )}
          {showBanButton && (
            <button
              onClick={() => setShowBanDialog(true)}
              aria-label="Ban management"
              className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
            >
              <BanIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex flex-col divide-y divide-brand/10">
        {/* Column headers */}
        <div className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-brand-muted/70">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">{isStarted ? "Score" : "Status"}</span>
          <span className="text-right min-w-[60px]">Prize</span>
        </div>

        {/* Rows */}
        {totalEntries === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-1">
            <span className="text-sm text-brand-muted/60 font-semibold">
              No entrants yet
            </span>
            <span className="text-xs text-brand-muted/40">
              Be the first to enter this tournament
            </span>
          </div>
        ) : (
          Array.from({ length: PAGE_SIZE }).map((_, i) => {
            const game = displayRows[i];
            const pos0 = (currentPage - 1) * PAGE_SIZE + i;
            const prize = prizesByPosition.get(pos0 + 1);

            if (!game) {
              // Two placeholder modes:
              //  - Page transition (isPageStale): pulsing skeleton bars to
              //    signal a loading state.
              //  - Last-page tail (e.g. page 3 has 2 entries, slots 3–10
              //    are empty): static dashes at low opacity.
              if (isPageStale) {
                return (
                  <div
                    key={`skeleton-${i}`}
                    className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 animate-pulse"
                  >
                    <span className="text-xs text-brand-muted/40 font-brand">
                      {positionLabel(pos0)}
                    </span>
                    <div className="h-3 w-24 max-w-full rounded bg-brand-muted/20" />
                    <div className="h-3 w-10 rounded bg-brand-muted/20 ml-auto" />
                    <div className="h-3 w-12 rounded bg-brand-muted/15 ml-auto" />
                  </div>
                );
              }
              return (
                <div
                  key={`empty-${i}`}
                  className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 opacity-30"
                >
                  <span className="text-xs text-brand-muted font-brand">
                    {positionLabel(pos0)}
                  </span>
                  <span className="text-xs text-brand-muted">—</span>
                  <span className="text-xs text-right text-brand-muted">—</span>
                  <PrizeCell prize={prize} />
                </div>
              );
            }

            const displayName =
              game.playerName ||
              usernames?.get(indexAddress(game.owner ?? "0x0")) ||
              displayAddress(game.owner ?? "");
            const isBanned = !!(game as any).isBanned;
            const hasSubmitted = !!(game as any).hasSubmitted;
            const isTopThree = pos0 < 3;

            const rowContent = (
              <>
                <span
                  className={cn(
                    "font-brand text-sm",
                    isTopThree ? "text-brand" : "text-brand-muted",
                  )}
                >
                  {positionLabel(pos0)}
                </span>
                <div className="flex flex-row items-center gap-1.5 min-w-0">
                  <span className="w-5 h-5 flex-shrink-0 text-brand-muted">
                    <USER />
                  </span>
                  <span
                    className={cn(
                      "text-xs truncate",
                      isBanned ? "text-destructive/70" : "text-neutral",
                    )}
                  >
                    {displayName}
                  </span>
                  {isBanned && (
                    <BanIcon className="w-3 h-3 text-destructive flex-shrink-0" />
                  )}
                  {hasSubmitted && (
                    <span className="w-4 h-4 flex-shrink-0 text-success">
                      <VERIFIED />
                    </span>
                  )}
                </div>
                <div className="flex flex-row items-center justify-end gap-1 min-w-[40px]">
                  {isStarted ? (
                    <span className="font-brand text-sm text-brand">
                      {game.score ?? 0}
                    </span>
                  ) : game.gameOver ? (
                    <span className="text-[10px] uppercase tracking-wider text-success">
                      Done
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-brand-muted/60">
                      Active
                    </span>
                  )}
                </div>
                <PrizeCell prize={prize} highlight={isTopThree} />
              </>
            );

            return (
              <div key={game.tokenId ?? i} className="contents">
                {/* Desktop: hover card */}
                <HoverCard openDelay={80} closeDelay={0}>
                  <HoverCardTrigger asChild>
                    <div
                      className={cn(
                        "hidden sm:grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 rounded border border-transparent transition-all duration-200 cursor-pointer hover:bg-brand/10 hover:border-brand/20",
                        isBanned && "opacity-60",
                        isTopThree && "bg-brand/[0.03]",
                      )}
                    >
                      {rowContent}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent
                    align="center"
                    side="top"
                    className="py-4 px-0 text-sm z-50"
                  >
                    <PlayerDetails
                      username={displayName}
                      isStarted={isStarted}
                      isEnded={isEnded}
                      hasSubmitted={hasSubmitted}
                      isBanned={isBanned}
                      gameAddress={gameAddress}
                      tokenId={game.tokenId?.toString()}
                    />
                  </HoverCardContent>
                </HoverCard>

                {/* Mobile: tap to open dialog */}
                <div
                  className={cn(
                    "sm:hidden grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 rounded border border-transparent transition-all duration-200 cursor-pointer hover:bg-brand/10",
                    isBanned && "opacity-60",
                  )}
                  onClick={() => {
                    setSelectedPlayer({ game, index: i, registration: game });
                    setIsMobileDialogOpen(true);
                  }}
                >
                  {rowContent}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalEntries > PAGE_SIZE && (
        <div className="flex flex-row items-center justify-end pt-2 border-t border-brand/10">
          <Pagination
            totalPages={totalPages}
            currentPage={currentPage}
            nextPage={nextPage}
            previousPage={previousPage}
            hasNextPage={hasNextPage && !isPageStale}
            hasPreviousPage={hasPreviousPage && !isPageStale}
          />
        </div>
      )}

      {/* Dialogs */}
      <MobilePlayerCard
        open={isMobileDialogOpen}
        onOpenChange={setIsMobileDialogOpen}
        selectedPlayer={selectedPlayer}
        usernames={usernames}
        ownerAddress={ownerAddresses?.[selectedPlayer?.index ?? 0]}
        isStarted={isStarted}
        isEnded={isEnded}
        gameAddress={gameAddress}
      />

      <ScoreTableDialog
        open={showTableDialog}
        onOpenChange={setShowTableDialog}
        tournamentId={tournamentId}
        entryCount={totalEntries}
        isStarted={isStarted}
        isEnded={isEnded}
        banRefreshTrigger={localBanRefreshTrigger}
        prizesByPosition={prizesByPosition}
      />

      {showBanButton && (
        <BanManagementDialog
          open={showBanDialog}
          onOpenChange={setShowBanDialog}
          tournamentId={tournamentId}
          tournamentModel={tournamentModel}
          extensionAddress={extensionConfig?.address}
          onBanComplete={() => {
            refetchTokens();
            refetchRegistrations();
            setLocalBanRefreshTrigger((prev) => prev + 1);
            onBanComplete?.();
          }}
        />
      )}
    </div>
  );
};

const PrizeCell = ({
  prize,
  highlight,
}: {
  prize?: PositionPrizeDisplay;
  highlight?: boolean;
}) => {
  if (!prize) {
    return (
      <span className="text-xs text-brand-muted/30 text-right min-w-[60px]">
        —
      </span>
    );
  }
  return (
    <div className="flex flex-row items-center justify-end gap-1 min-w-[60px]">
      {prize.tokenLogo && (
        <img
          src={prize.tokenLogo}
          alt=""
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
        />
      )}
      {prize.usd != null ? (
        <span
          className={cn(
            "font-brand text-xs font-bold",
            highlight ? "text-brand" : "text-brand-muted",
          )}
        >
          {formatUSDCompact(prize.usd)}
        </span>
      ) : (
        <span className="font-brand text-xs text-brand-muted">
          {prize.tokenAmountDisplay ?? prize.tokenSymbol ?? "?"}
        </span>
      )}
    </div>
  );
};

export default EntrantsTable;
