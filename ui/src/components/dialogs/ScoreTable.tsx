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
import { Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useGetTournamentRegistrants, useGetTournamentLeaderboards, useGetTournament } from "@/dojo/hooks/useSqlQueries";
import { useDojo } from "@/context/dojo";
import { Tournament } from "@/generated/models.gen";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { useMemo } from "react";
import { indexAddress, padU64 } from "@/lib/utils";
import { useExtensionQualification, TournamentValidatorInput } from "@/dojo/hooks/useExtensionQualification";
import { isTournamentValidator } from "@/lib/extensionConfig";
import { useAccount } from "@starknet-react/core";

interface ScoreTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  entryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  tournamentModel?: Tournament;
  tournamentsData?: Tournament[];
}

export const ScoreTableDialog = ({
  open,
  onOpenChange,
  tournamentId,
  entryCount,
  isStarted,
  isEnded,
  tournamentModel,
  tournamentsData = [],
}: ScoreTableDialogProps) => {
  const { namespace, selectedChainConfig } = useDojo();
  const { address } = useAccount();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const [searchQuery, setSearchQuery] = useState("");
  const { validateEntry } = useSystemCalls();

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

  // Parse tournament validator config if this tournament has extension requirements
  const hasEntryRequirement = tournamentModel?.entry_requirement.isSome();
  const requirementVariant = tournamentModel?.entry_requirement.Some?.entry_requirement_type?.activeVariant();
  const extensionConfig = tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant?.extension;

  // Check if this extension is a tournament validator
  const isTournamentValidatorExtension = useMemo(() => {
    if (!extensionConfig?.address || !selectedChainConfig?.tournamentValidatorAddress) return false;
    const normalizedExtensionAddress = indexAddress(extensionConfig.address);
    const normalizedValidatorAddress = indexAddress(selectedChainConfig.tournamentValidatorAddress);
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionConfig?.address, selectedChainConfig?.tournamentValidatorAddress]);

  // Parse tournament validator config: [qualifier_type, qualifying_mode, top_positions, ...tournament_ids]
  const tournamentValidatorConfig = useMemo(() => {
    if (!isTournamentValidatorExtension || !extensionConfig?.config) return null;

    const config = extensionConfig.config;
    if (!config || config.length < 3) return null;

    const qualifierType = config[0]; // "0" = participated, "1" = won
    const qualifyingMode = config[1];
    const topPositions = config[2];
    const tournamentIds = config.slice(3);

    return {
      requirementType: qualifierType === "1" ? "won" : "participated",
      qualifyingMode: Number(qualifyingMode),
      topPositions: Number(topPositions),
      tournamentIds: tournamentIds.map((id: any) => BigInt(id)),
    };
  }, [isTournamentValidatorExtension, extensionConfig?.config]);

  // Get tournament data for validator extensions
  const validatorTournaments = useMemo(() => {
    if (!tournamentValidatorConfig) return [];
    return tournamentsData.filter((t) =>
      tournamentValidatorConfig.tournamentIds.some((id: any) => BigInt(t.id) === id)
    );
  }, [tournamentValidatorConfig, tournamentsData]);

  // Fetch leaderboards for required tournaments (for win checking)
  const { data: leaderboards } = useGetTournamentLeaderboards({
    namespace: namespace ?? "",
    tournamentIds: validatorTournaments.map((tournament) => padU64(BigInt(tournament.id))),
    active: isTournamentValidatorExtension && !!tournamentValidatorConfig && !isStarted,
  });

  // Validation checking function for each participant
  const getParticipantValidation = useMemo(() => {
    if (!hasEntryRequirement || requirementVariant !== "extension" || !isTournamentValidatorExtension || !tournamentValidatorConfig) {
      return new Map<string, { isValid: boolean; reason?: string }>();
    }

    const validationMap = new Map<string, { isValid: boolean; reason?: string }>();

    // For each participant (game token), check if they meet the entry requirements
    if (!registrants || !orderedRegistrants) return validationMap;

    orderedRegistrants.forEach((registration, index) => {
      if (!registration) return;

      const gameTokenId = registration.game_token_id;
      const game = games?.[index];
      if (!game) return;

      // Get the owner of this game token
      const ownerAddress = game.owner;

      // Check if this participant meets entry requirements
      // For now, mark all as needing validation (actual validation would require checking their historical data)
      validationMap.set(gameTokenId, {
        isValid: true, // Will be updated with actual validation
        reason: "Validation pending",
      });
    });

    return validationMap;
  }, [hasEntryRequirement, requirementVariant, isTournamentValidatorExtension, tournamentValidatorConfig, registrants, orderedRegistrants, games]);

  // Handle ban action
  const handleBan = async (gameTokenId: string) => {
    try {
      // Call validate_entry with empty proof to ban the participant
      await validateEntry(tournamentId, gameTokenId, []);
      // Refresh the data
      refetch();
    } catch (error) {
      console.error("Error banning participant:", error);
    }
  };

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
                {!isStarted && hasEntryRequirement && isTournamentValidatorExtension && (
                  <TableHead className="text-center">Actions</TableHead>
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

                  return (
                    <TableRow key={index}>
                      <TableCell className="text-center font-medium">
                        {globalIndex + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {playerName || shortAddress}
                          </span>
                          {playerName && (
                            <span className="text-xs text-muted-foreground">
                              {shortAddress}
                            </span>
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
                      {!isStarted && hasEntryRequirement && isTournamentValidatorExtension && (
                        <TableCell className="text-center">
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => handleBan(game.token_id.toString())}
                            disabled={!address}
                          >
                            Ban
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={
                      isEnded ? 4 :
                      (!isStarted && hasEntryRequirement && isTournamentValidatorExtension) ? 4 : 3
                    }
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
