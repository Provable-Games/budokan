import Pagination from "@/components/table/Pagination";
import { USER, REFRESH } from "@/components/Icons";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect } from "react";
import { TableProperties } from "lucide-react";
import { BigNumberish } from "starknet";
import { useLiveLeaderboard } from "@provable-games/denshokan-sdk/react";
import { useGetTournamentRegistrations } from "@/hooks/useBudokanQueries";
import { useGetUsernames } from "@/hooks/useController";
import { MobilePlayerCard } from "@/components/tournament/table/PlayerCard";
import {
  TournamentCard,
  TournamentCardHeader,
  TournamentCardContent,
  TournamentCardTitle,
  TournamentCardMetric,
  TournamentCardSwitch,
} from "@/components/tournament/containers/TournamentCard";
import ScoreRow from "@/components/tournament/table/ScoreRow";
import EntrantRow from "@/components/tournament/table/EntrantRow";
import { padAddress } from "@/lib/utils";
import { ScoreTableDialog } from "@/components/dialogs/ScoreTable";
import { BanManagementDialog } from "@/components/dialogs/BanManagement";
import { useChainConfig } from "@/context/chain";
import type { Tournament, WSEventMessage } from "@provable-games/budokan-sdk";
import { Ban } from "lucide-react";

interface ScoreTableProps {
  tournamentId: BigNumberish;
  entryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  tournamentModel?: Tournament;
  onBanComplete?: () => void;
  lastMessage?: WSEventMessage | null;
}

const ScoreTable = ({
  tournamentId,
  entryCount,
  isStarted,
  isEnded,
  tournamentModel,
  onBanComplete,
  lastMessage,
}: ScoreTableProps) => {
  const { selectedChainConfig } = useChainConfig();
  const [showScores, setShowScores] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [localBanRefreshTrigger, setLocalBanRefreshTrigger] = useState(0);
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  // Check if this tournament has extension requirements that support banning
  const entryReq = (tournamentModel as any)?.entryRequirement;
  const hasEntryRequirement = !!entryReq;
  const reqType = entryReq?.entryRequirementType;
  const requirementVariant = reqType?.type as string | undefined;
  const extensionConfig =
    requirementVariant === "extension"
      ? { address: reqType?.address, config: reqType?.config }
      : undefined;

  // Only show ban button if:
  // 1. Tournament hasn't started
  // 2. Has extension requirement
  // 3. Has entries to potentially ban
  const showBanButton =
    !isStarted &&
    hasEntryRequirement &&
    requirementVariant === "extension" &&
    extensionConfig?.address &&
    entryCount > 0;

  const [currentPage, setCurrentPageNum] = useState(1);
  const pageSize = 10;

  // 1. Leaderboard with server-side pagination — this drives the view
  const {
    entries: pageEntries,
    total: leaderboardTotal,
    isLoading: tokensLoading,
    refetch: refetchTokens,
  } = useLiveLeaderboard({
    contextId: Number(tournamentId),
    minterAddress: padAddress(tournamentAddress),
    sort: { field: "score", direction: "desc" },
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    enabled: entryCount > 0,
    liveScores: isStarted,
    liveGameOver: isStarted,
  });

  const totalEntries = leaderboardTotal || entryCount;
  const totalPages = Math.ceil(totalEntries / pageSize);
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;
  const nextPage = () => setCurrentPageNum((p) => Math.min(p + 1, totalPages));
  const previousPage = () => setCurrentPageNum((p) => Math.max(p - 1, 1));

  // 2. Fetch registrations for the current page's tokens (for isBanned, hasSubmitted)
  const pageTokenIds = useMemo(
    () => pageEntries.map((e) => e.tokenId),
    [pageEntries],
  );
  const {
    data: registrants,
    refetch: refetchRegistrations,
  } = useGetTournamentRegistrations(
    pageTokenIds.length > 0 ? tournamentId?.toString() : undefined,
    { limit: 1000 },
  );

  // 3. Enrich leaderboard entries with registration metadata
  const gameTokens = useMemo(() => {
    if (!pageEntries.length) return [];

    const regMap = new Map(
      ((registrants as any[]) ?? []).map((r: any) => {
        const raw = (r.gameTokenId)?.toString();
        const hex = raw?.startsWith("0x") ? raw : "0x" + BigInt(raw ?? 0).toString(16);
        return [hex, r];
      }),
    );

    return pageEntries.map((entry) => {
      const reg = regMap.get(entry.tokenId);
      return {
        ...entry,
        playerName: entry.playerName || reg?.playerName || "",
        lifecycle: { start: 0n, end: 0n },
        metadata: "",
        isBanned: !!reg?.isBanned,
        hasSubmitted: !!reg?.hasSubmitted,
      };
    });
  }, [pageEntries, registrants]);

  const ownerAddresses = useMemo(
    () => gameTokens.map((game: any) => game?.owner ?? "0x0"),
    [gameTokens],
  );
  const { usernames } = useGetUsernames(ownerAddresses);

  useEffect(() => {
    if (gameTokens.length > 0 && !hasInitialized) {
      setShowScores(true);
      setHasInitialized(true);
    }
  }, [gameTokens, hasInitialized]);

  // Refetch registrations on budokan WS events (bans, submissions)
  useEffect(() => {
    if (lastMessage?.channel === "registrations") {
      refetchRegistrations();
    }
  }, [lastMessage, refetchRegistrations]);

  const loading = tokensLoading;

  return (
    <TournamentCard showCard={showScores}>
      <TournamentCardHeader>
        <TournamentCardTitle>
          {isStarted ? "Scores" : "Entrants"}
        </TournamentCardTitle>
        {showScores && totalEntries > pageSize && (
          <Pagination
            totalPages={totalPages}
            currentPage={currentPage}
            nextPage={nextPage}
            previousPage={previousPage}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
          />
        )}
        <div className="flex flex-row items-center gap-2">
          {/* Desktop refresh button */}
          <Button
            onClick={refetchTokens}
            disabled={loading}
            size="sm"
            variant="outline"
            className="hidden sm:flex"
          >
            <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {showScores && (
            <>
              {/* Mobile buttons together */}
              <div className="flex sm:hidden">
                <Button
                  onClick={refetchTokens}
                  disabled={loading}
                  size="xs"
                  variant="outline"
                >
                  <REFRESH
                    className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                  />
                </Button>
                {entryCount > 0 && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setShowTableDialog(true)}
                  >
                    <TableProperties className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {/* Desktop table button */}
              {entryCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTableDialog(true)}
                  className="hidden sm:flex"
                >
                  <TableProperties className="w-4 h-4" />
                </Button>
              )}
              {/* Desktop ban management button */}
              {showBanButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBanDialog(true)}
                  className="hidden sm:flex"
                >
                  <Ban className="w-4 h-4" />
                </Button>
              )}
              {/* Mobile ban management button */}
              {showBanButton && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setShowBanDialog(true)}
                  className="flex sm:hidden"
                >
                  <Ban className="w-3 h-3" />
                </Button>
              )}
            </>
          )}
          <TournamentCardSwitch
            checked={showScores}
            onCheckedChange={setShowScores}
            showSwitch={entryCount > 0}
            notShowingSwitchLabel="No scores"
            checkedLabel="Hide"
            uncheckedLabel="Show Scores"
          />
          <TournamentCardMetric icon={<USER />} metric={totalEntries} />
        </div>
      </TournamentCardHeader>
      <TournamentCardContent showContent={showScores}>
        <div className="flex flex-row py-2">
          {[0, 1].map((colIndex) => (
            <div
              key={colIndex}
              className={`flex flex-col w-1/2 relative ${
                colIndex === 0 ? "pr-3" : "pl-3"
              }`}
            >
              {colIndex === 0 && gameTokens.length > 5 && (
                <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-brand/25 h-full" />
              )}
              {gameTokens
                .slice(colIndex * 5, colIndex * 5 + 5)
                .map((_, index) => {
                  const game = gameTokens[index + colIndex * 5];
                  if (!game) return null;
                  return isStarted ? (
                    <ScoreRow
                      key={game.tokenId}
                      index={index}
                      colIndex={colIndex}
                      currentPage={currentPage}
                      game={game}
                      registration={game}
                      usernames={usernames}
                      isStarted={isStarted}
                      isEnded={isEnded}
                      gameAddress={tournamentModel?.gameAddress}
                      setSelectedPlayer={setSelectedPlayer}
                      setIsMobileDialogOpen={setIsMobileDialogOpen}
                    />
                  ) : (
                    <EntrantRow
                      key={game.tokenId}
                      game={game}
                      index={index}
                      colIndex={colIndex}
                      currentPage={currentPage}
                      setSelectedPlayer={setSelectedPlayer}
                      setIsMobileDialogOpen={setIsMobileDialogOpen}
                      usernames={usernames}
                      registration={game}
                    />
                  );
                })}
            </div>
          ))}
        </div>
      </TournamentCardContent>

      {/* Mobile dialog for player details */}
      <MobilePlayerCard
        open={isMobileDialogOpen}
        onOpenChange={setIsMobileDialogOpen}
        selectedPlayer={selectedPlayer}
        usernames={usernames}
        ownerAddress={ownerAddresses?.[selectedPlayer?.index ?? 0]}
        isStarted={isStarted}
        isEnded={isEnded}
        gameAddress={tournamentModel?.gameAddress}
      />

      {/* Table dialog for scores */}
      <ScoreTableDialog
        open={showTableDialog}
        onOpenChange={setShowTableDialog}
        tournamentId={tournamentId}
        entryCount={totalEntries}
        isStarted={isStarted}
        isEnded={isEnded}
        banRefreshTrigger={localBanRefreshTrigger}
      />

      {/* Ban management dialog */}
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
            if (onBanComplete) {
              onBanComplete();
            }
          }}
        />
      )}
    </TournamentCard>
  );
};

export default ScoreTable;
