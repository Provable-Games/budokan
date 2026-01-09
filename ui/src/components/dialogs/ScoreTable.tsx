import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/table/Pagination";
import { useState, useEffect, useMemo } from "react";
import { BigNumberish, addAddressPadding } from "starknet";
import { useGameTokens, useGameTokensCount } from "metagame-sdk/sql";
import { REFRESH, VERIFIED } from "@/components/Icons";
import { Search, Ban } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useGetTournamentRegistrants } from "@/dojo/hooks/useSqlQueries";
import { useDojo } from "@/context/dojo";

interface ScoreTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  entryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  banRefreshTrigger?: number;
}

export const ScoreTableDialog = ({
  open,
  onOpenChange,
  tournamentId,
  entryCount,
  isStarted,
  isEnded,
  banRefreshTrigger,
}: ScoreTableDialogProps) => {
  const { namespace, selectedChainConfig } = useDojo();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce search query to avoid too many requests
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const {
    games,
    pagination: {
      currentPage,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
      goToPage,
    },
    refetch,
    loading,
  } = useGameTokens({
    context: {
      id: Number(tournamentId),
    },
    pagination: {
      pageSize: 10,
    },
    sortBy: "score",
    sortOrder: "desc",
    mintedByAddress: addAddressPadding(tournamentAddress),
    includeMetadata: true,
    // Pass the player name string directly for server-side search
    playerName: debouncedSearchQuery.trim() || undefined,
  });

  const gameIds = useMemo(
    () => games?.map((game) => Number(game.token_id)) || [],
    [games]
  );

  const { data: registrants } = useGetTournamentRegistrants({
    namespace,
    gameIds,
    active: gameIds.length > 0,
    offset: 0,
    limit: 10,
  });

  // Map registrants to match the order of games
  const orderedRegistrants = useMemo(() => {
    if (!registrants || !games) return [];

    return games.map((game) => {
      const tokenId = Number(game.token_id);
      return (
        registrants.find((reg) => Number(reg.game_token_id) === tokenId) || null
      );
    });
  }, [games, registrants]);

  // Refetch when a ban operation completes
  useEffect(() => {
    if (banRefreshTrigger && banRefreshTrigger > 0 && open) {
      refetch();
    }
  }, [banRefreshTrigger, open]);

  // Get the filtered count based on the same search parameters
  const { count: filteredCount } = useGameTokensCount({
    context: {
      id: Number(tournamentId),
    },
    mintedByAddress: addAddressPadding(tournamentAddress),
    playerName: debouncedSearchQuery.trim() || undefined,
  });

  // Use filtered count if available, otherwise fall back to total entry count
  const totalCount = filteredCount ?? entryCount;

  // Clear search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  // Reset page when search changes
  useEffect(() => {
    // Reset to first page when search query changes
    if (goToPage && debouncedSearchQuery !== undefined) {
      goToPage(0);
    }
  }, [debouncedSearchQuery, goToPage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[600px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 border-b border-border">
          <DialogTitle className="p-4 pb-2">
            {isStarted ? "Scores" : "Entrants"} Table
          </DialogTitle>
          <div className="px-4 pb-2">
            <span className="text-sm text-muted-foreground">
              {loading ? (
                "Loading..."
              ) : (
                <>
                  {totalCount} {totalCount === 1 ? "entry" : "entries"}
                  {searchQuery && ` matching "${searchQuery}"`}
                </>
              )}
            </span>
          </div>
          <div className="px-4 pb-4 flex gap-3">
            <div className="flex-1 flex items-center border rounded border-brand-muted bg-background">
              <Search className="w-4 h-4 ml-3 text-muted-foreground" />
              <Input
                placeholder="Search by player name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            {/* Mobile refresh button */}
            <Button
              onClick={refetch}
              disabled={loading}
              size="xs"
              variant="outline"
              className="sm:hidden"
            >
              <REFRESH className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {/* Desktop refresh button */}
            <Button
              onClick={refetch}
              disabled={loading}
              size="sm"
              variant="outline"
              className="hidden sm:flex items-center gap-2"
            >
              <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Score</TableHead>
                {isEnded && (
                  <TableHead className="text-center">Submitted</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="overflow-y-auto">
              {games && games.length > 0 ? (
                games.map((game, index) => {
                  const globalIndex = currentPage * 10 + index;
                  const playerName = game?.player_name || "";
                  const ownerAddress = game?.owner ?? "0x0";
                  const shortAddress = `${ownerAddress?.slice(
                    0,
                    6
                  )}...${ownerAddress?.slice(-4)}`;
                  const registration = orderedRegistrants[index];
                  const hasSubmitted = registration?.has_submitted === 1;
                  const isBanned = registration?.is_banned === 1;

                  return (
                    <TableRow key={index} className={isBanned ? "opacity-60" : ""}>
                      <TableCell className="text-center font-medium">
                        {globalIndex + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">
                              {playerName || shortAddress}
                            </span>
                            {playerName && (
                              <span className="text-xs text-muted-foreground">
                                {shortAddress}
                              </span>
                            )}
                          </div>
                          {isBanned && (
                            <Ban className="w-4 h-4 text-destructive flex-shrink-0" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {game?.score || 0}
                      </TableCell>
                      {isEnded && (
                        <TableCell className="text-center">
                          {hasSubmitted ? (
                            <div className="inline-flex justify-center w-full">
                              <span className="w-4 h-4 text-brand">
                                <VERIFIED />
                              </span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={isEnded ? 4 : 3}
                    className="text-center text-muted-foreground py-8"
                  >
                    {loading
                      ? "Loading..."
                      : searchQuery
                      ? "No players found matching your search"
                      : "No entries yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalCount > 10 && (
          <div className="flex-shrink-0 p-4 border-t border-border">
            <Pagination
              totalPages={Math.ceil(totalCount / 10)}
              currentPage={currentPage}
              nextPage={nextPage}
              previousPage={previousPage}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
