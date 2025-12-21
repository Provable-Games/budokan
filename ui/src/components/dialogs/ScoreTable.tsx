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
  useExtensionQualification,
  TournamentValidatorInput,
} from "@/dojo/hooks/useExtensionQualification";
import {
  isTournamentValidator,
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
  const [bannedEntries, setBannedEntries] = useState<Set<string>>(
    new Set()
  );
  const { validateEntry, checkRegistrationOnly, checkExtensionValidEntry, getExtensionEntriesLeft } =
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

  // Check which entries can be banned by validating their current qualification
  useEffect(() => {
    const checkBannableEntries = async () => {
      if (
        !open ||
        !extensionRegistrationOnly ||
        !extensionConfig?.address ||
        !games ||
        games.length === 0 ||
        isStarted
      ) {
        setBannableEntries(new Set());
        return;
      }

      const bannable = new Set<string>();
      const banned = new Set<string>();

      // Group games by owner address
      const gamesByOwner = new Map<string, typeof games>();
      games.forEach((game) => {
        const owner = game?.owner;
        if (!owner) return;
        if (!gamesByOwner.has(owner)) {
          gamesByOwner.set(owner, []);
        }
        gamesByOwner.get(owner)?.push(game);
      });

      // Check each unique player's qualification status
      await Promise.all(
        Array.from(gamesByOwner.entries()).map(async ([owner, playerGames]) => {
          try {
            // Get qualification proof for this player
            const qualification = getExtensionProof(
              extensionConfig.address,
              owner,
              {} // Additional context if needed
            );

            // First, check each individual game token to see if it's still valid (not banned)
            const gameValidityChecks = await Promise.all(
              playerGames.map(async (game) => {
                try {
                  // Check if this specific game token is valid
                  const tokenIsValid = await checkExtensionValidEntry(
                    extensionConfig.address,
                    tournamentId,
                    owner,
                    [game.token_id.toString()] // Pass token_id as proof to check this specific entry
                  );
                  return { game, isValid: tokenIsValid };
                } catch {
                  return { game, isValid: false };
                }
              })
            );

            // Separate valid and invalid (banned) tokens
            const currentValidGames = gameValidityChecks
              .filter(({ isValid }) => isValid)
              .map(({ game }) => game);

            // Track banned entries for display
            gameValidityChecks
              .filter(({ isValid }) => !isValid)
              .forEach(({ game }) => banned.add(game.token_id.toString()));

            // Check if player still meets basic requirements
            const playerStillQualifies = await checkExtensionValidEntry(
              extensionConfig.address,
              tournamentId,
              owner,
              qualification
            );

            // If they don't meet basic requirements, all remaining valid entries can be banned
            if (!playerStillQualifies) {
              currentValidGames.forEach(game => bannable.add(game.token_id.toString()));
              return;
            }

            // Check how many entries they can have now
            const entriesLeft = await getExtensionEntriesLeft(
              extensionConfig.address,
              tournamentId,
              owner,
              qualification
            );

            // If entriesLeft is not null and they have more valid entries than allowed
            if (entriesLeft !== null && currentValidGames.length > entriesLeft) {
              // Mark the excess entries as bannable (mark the later ones)
              const excessCount = currentValidGames.length - entriesLeft;
              const sortedGames = [...currentValidGames].sort((a, b) =>
                Number(b.token_id) - Number(a.token_id)
              );
              sortedGames.slice(0, excessCount).forEach(game => {
                bannable.add(game.token_id.toString());
              });
            }
          } catch (error) {
            console.error("Error checking ban-ability for player:", owner, error);
          }
        })
      );

      setBannableEntries(bannable);
      setBannedEntries(banned);
    };

    checkBannableEntries();
  }, [
    open,
    extensionRegistrationOnly,
    extensionConfig?.address,
    games?.length, // Only depend on length, not the array itself
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
  const { data: leaderboards } = useGetTournamentLeaderboards({
    namespace: namespace ?? "",
    tournamentIds: validatorTournaments.map((tournament) =>
      padU64(BigInt(tournament.id))
    ),
    active:
      isTournamentValidatorExtension &&
      !!tournamentValidatorConfig &&
      !isStarted,
  });

  // Validation checking function for each participant
  const getParticipantValidation = useMemo(() => {
    if (
      !hasEntryRequirement ||
      requirementVariant !== "extension" ||
      !isTournamentValidatorExtension ||
      !tournamentValidatorConfig
    ) {
      return new Map<string, { isValid: boolean; reason?: string }>();
    }

    const validationMap = new Map<
      string,
      { isValid: boolean; reason?: string }
    >();

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
  }, [
    hasEntryRequirement,
    requirementVariant,
    isTournamentValidatorExtension,
    tournamentValidatorConfig,
    registrants,
    orderedRegistrants,
    games,
  ]);

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
                  const isBanned = bannedEntries.has(game.token_id.toString());

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
                        bannableEntries.has(game.token_id.toString()) && (
                          <TableCell className="text-center">
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() =>
                                handleBan(game.token_id.toString())
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
