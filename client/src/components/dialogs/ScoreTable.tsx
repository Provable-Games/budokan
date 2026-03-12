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
import { useGameTokens } from "@/hooks/useDenshokanQueries";
import { REFRESH, VERIFIED } from "@/components/Icons";
import { Search, Ban } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useGetTournamentRegistrations } from "@/hooks/useBudokanQueries";
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
  const { selectedChainConfig } = useDojo();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce search query to avoid too many requests
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  const {
    data: allGames,
    refetch,
    loading,
  } = useGameTokens({
    owner: addAddressPadding(tournamentAddress),
    gameId: Number(tournamentId),
    limit: 1000,
    active: open,
  });

  // Client-side search filtering
  const filteredGames = useMemo(() => {
    if (!allGames) return [];
    const query = debouncedSearchQuery.trim().toLowerCase();
    if (!query) return allGames;
    return allGames.filter((game: any) =>
      (game.player_name || game.playerName || "").toLowerCase().includes(query),
    );
  }, [allGames, debouncedSearchQuery]);

  // Client-side pagination
  const games = useMemo(
    () => filteredGames.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [filteredGames, currentPage],
  );

  const totalPages = Math.ceil(filteredGames.length / pageSize);
  const hasNextPage = currentPage < totalPages - 1;
  const hasPreviousPage = currentPage > 0;
  const nextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
  const previousPage = () => setCurrentPage((p) => Math.max(0, p - 1));
  const gameIds = useMemo(
    () => games?.map((game) => Number(game.token_id)) || [],
    [games]
  );

  const tournamentIdStr = tournamentId ? String(tournamentId) : undefined;

  const { data: registrants } = useGetTournamentRegistrations(
    gameIds.length > 0 ? tournamentIdStr : undefined,
    { limit: 1000 },
  );

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

  // Derive count from filtered games
  const totalCount = filteredGames.length || entryCount;

  // Clear search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearchQuery]);

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
                  const globalIndex = currentPage * pageSize + index;
                  const playerName = game?.player_name || "";
                  const ownerAddress = game?.owner ?? "0x0";
                  const shortAddress = `${ownerAddress?.slice(
                    0,
                    6
                  )}...${ownerAddress?.slice(-4)}`;
                  const registration = orderedRegistrants[index];
                  const hasSubmitted = !!registration?.has_submitted;
                  const isBanned = !!registration?.is_banned;

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
        {totalCount > pageSize && (
          <div className="flex-shrink-0 p-4 border-t border-border">
            <Pagination
              totalPages={totalPages}
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
