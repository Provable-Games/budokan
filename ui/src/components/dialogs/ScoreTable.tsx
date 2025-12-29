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
import {
  useGetTournamentRegistrants,
  useGetTournamentLeaderboards,
} from "@/dojo/hooks/useSqlQueries";
import { useDojo } from "@/context/dojo";
import { Tournament } from "@/generated/models.gen";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { indexAddress, padU64 } from "@/lib/utils";
import {
  getExtensionAddresses,
  getExtensionProof,
} from "@/lib/extensionConfig";
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
  const [extensionRegistrationOnly, setExtensionRegistrationOnly] =
    useState(false);
  const [bannableEntries, setBannableEntries] = useState<Set<string>>(
    new Set()
  );
  const { banEntry, checkRegistrationOnly, checkShouldBan } =
    useSystemCalls();

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
  const requirementVariant =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.activeVariant();
  const extensionConfig =
    tournamentModel?.entry_requirement.Some?.entry_requirement_type?.variant
      ?.extension;

  // Get extension addresses for the current chain
  const extensionAddresses = useMemo(
    () => getExtensionAddresses(selectedChainConfig?.chainId ?? ""),
    [selectedChainConfig?.chainId]
  );

  // Check if extension requires registration period by calling the contract
  useEffect(() => {
    const checkExtensionRegistrationRequirement = async () => {
      if (
        hasEntryRequirement &&
        requirementVariant === "extension" &&
        extensionConfig?.address
      ) {
        const requiresReg = await checkRegistrationOnly(
          extensionConfig.address
        );
        console.log(
          "Extension registration_only check:",
          extensionConfig.address,
          "result:",
          requiresReg
        );
        setExtensionRegistrationOnly(requiresReg);
      } else {
        setExtensionRegistrationOnly(false);
      }
    };

    checkExtensionRegistrationRequirement();
  }, [
    hasEntryRequirement,
    requirementVariant,
    extensionConfig?.address,
    checkRegistrationOnly,
  ]);

  // Check which entries can be banned using the should_ban extension method
  useEffect(() => {
    const checkBannableEntries = async () => {
      console.log("checkBannableEntries called", {
        open,
        extensionRegistrationOnly,
        extensionAddress: extensionConfig?.address,
        gamesLength: games?.length,
        isStarted,
      });

      if (
        !open ||
        !extensionConfig?.address ||
        !games ||
        games.length === 0 ||
        isStarted
      ) {
        console.log("checkBannableEntries early return - conditions not met");
        setBannableEntries(new Set());
        return;
      }

      console.log("Starting ban checks for", games.length, "games");
      const bannable = new Set<string>();

      // Check each game token to see if it should be banned
      await Promise.all(
        games.map(async (game) => {
          try {
            const owner = game?.owner;
            if (!owner) {
              console.log("Game", game.token_id, "has no owner, skipping");
              return;
            }

            // Get qualification proof for this player
            const qualification = getExtensionProof(
              extensionConfig.address,
              owner,
              {} // Additional context if needed
            );

            console.log(
              `Checking game token ${game.token_id} (owner: ${owner}) with qualification:`,
              qualification
            );

            // Check if this game token should be banned
            // Signature: should_ban(tournament_id, game_token_id, current_owner, qualification)
            const shouldBan = await checkShouldBan(
              extensionConfig.address,
              tournamentId,
              game.token_id.toString(),
              owner,
              qualification
            );

            console.log(
              `Game token ${game.token_id} (owner: ${owner}) shouldBan: ${shouldBan}`
            );

            if (shouldBan) {
              bannable.add(game.token_id.toString());
            }
          } catch (error) {
            console.error(
              "Error checking ban-ability for game:",
              game.token_id,
              error
            );
          }
        })
      );

      console.log("Bannable entries:", Array.from(bannable));
      setBannableEntries(bannable);
    };

    checkBannableEntries();
  }, [
    open,
    extensionRegistrationOnly,
    extensionConfig?.address,
    games,
    tournamentId,
    isStarted,
  ]);

  // Check if this extension is a tournament validator
  const isTournamentValidatorExtension = useMemo(() => {
    if (!extensionConfig?.address || !extensionAddresses.tournamentValidator)
      return false;
    const normalizedExtensionAddress = indexAddress(extensionConfig.address);
    const normalizedValidatorAddress = indexAddress(
      extensionAddresses.tournamentValidator
    );
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionConfig?.address, extensionAddresses.tournamentValidator]);

  // Parse tournament validator config: [qualifier_type, qualifying_mode, top_positions, ...tournament_ids]
  const tournamentValidatorConfig = useMemo(() => {
    if (!isTournamentValidatorExtension || !extensionConfig?.config)
      return null;

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
      tournamentValidatorConfig.tournamentIds.some(
        (id: any) => BigInt(t.id) === id
      )
    );
  }, [tournamentValidatorConfig, tournamentsData]);

  // Fetch leaderboards for required tournaments (for win checking)
  const { data: _leaderboards } = useGetTournamentLeaderboards({
    namespace: namespace ?? "",
    tournamentIds: validatorTournaments.map((tournament) =>
      padU64(BigInt(tournament.id))
    ),
    active:
      isTournamentValidatorExtension &&
      !!tournamentValidatorConfig &&
      !isStarted,
  });

  // Handle ban action
  const handleBan = async (gameTokenId: string, ownerAddress: string) => {
    try {
      if (!extensionConfig?.address) return;

      // Get qualification proof for the player
      const qualification = getExtensionProof(
        extensionConfig.address,
        ownerAddress,
        {} // Additional context if needed
      );

      // Call ban_entry with the qualification proof
      await banEntry(tournamentId, gameTokenId, qualification);
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
                {!isStarted &&
                  hasEntryRequirement &&
                  requirementVariant === "extension" &&
                  extensionRegistrationOnly &&
                  bannableEntries.size > 0 && (
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
                  const isBanned = registration?.is_banned === 1;
                  const isBannable = bannableEntries.has(game.token_id.toString());

                  return (
                    <TableRow
                      key={index}
                      className={isBanned ? "opacity-50 line-through" : ""}
                    >
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
                      {!isStarted &&
                        hasEntryRequirement &&
                        requirementVariant === "extension" &&
                        extensionRegistrationOnly &&
                        isBannable && (
                          <TableCell className="text-center">
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() =>
                                handleBan(game.token_id.toString(), ownerAddress)
                              }
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
                      isEnded
                        ? 4
                        : !isStarted &&
                          hasEntryRequirement &&
                          requirementVariant === "extension" &&
                          extensionRegistrationOnly &&
                          bannableEntries.size > 0
                        ? 4
                        : 3
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
