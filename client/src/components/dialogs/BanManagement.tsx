import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { BigNumberish, addAddressPadding } from "starknet";
import { usePlayerTokens } from "@provable-games/denshokan-sdk/react";
import { REFRESH, USER } from "@/components/Icons";
import { useRegistrations } from "@provable-games/budokan-sdk/react";
import { useChainConfig } from "@/context/chain";
import type { Tournament } from "@provable-games/budokan-sdk";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";
import { displayAddress, indexAddress } from "@/lib/utils";
import { getExtensionAddresses } from "@provable-games/metagame-sdk";
import { useOpusTrovesBannableEntries } from "@provable-games/metagame-sdk/react";
import { useAccount, useProvider } from "@starknet-react/core";
import { OpusTrovesPlayerDetails } from "./extensions/OpusTrovesPlayerDetails";
import { useEntityUpdates } from "@/chain/hooks/useEntityUpdates";

interface BanManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  tournamentModel?: Tournament;
  extensionAddress?: string;
  onBanComplete?: () => void;
}

interface PlayerGroup {
  address: string;
  displayName: string;
  entries: {
    gameTokenId: string;
    playerName: string;
    isBanned: boolean;
    isBannable: boolean;
  }[];
}

// Ensure bannable entries (partial) is correct (only 1 bannable entry not all)
export const BanManagementDialog = ({
  open,
  onOpenChange,
  tournamentId,
  tournamentModel,
  extensionAddress,
  onBanComplete,
}: BanManagementDialogProps) => {
  const { selectedChainConfig } = useChainConfig();
  const { address } = useAccount();
  const { provider } = useProvider();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const [bannableEntries, setBannableEntries] = useState<Set<string>>(
    new Set()
  );
  const [isBanning, setIsBanning] = useState(false);
  const { banEntry, checkShouldBan } = useSystemCalls();
  const { waitForBannedEntry } = useEntityUpdates();

  // Fetch all game tokens for this tournament
  const { data: playerTokensResult, refetch, isLoading: loading } = usePlayerTokens(
    open ? addAddressPadding(tournamentAddress) : undefined,
    { gameId: Number(tournamentId), limit: 1000 },
  );
  const games = playerTokensResult?.data ?? null;

  const gameIds = useMemo(
    () => games?.map((game) => Number(game.tokenId)) || [],
    [games]
  );

  const tournamentIdStr = tournamentId ? String(tournamentId) : undefined;

  const { registrations: registrantsResult, refetch: refetchRegistrants } = useRegistrations(
    gameIds.length > 0 ? tournamentIdStr : undefined,
    { limit: 1000 },
  );
  const registrants = registrantsResult?.data ?? null;

  // Get Opus Troves validator address for the current chain
  const opusTrovesValidatorAddress = useMemo(() => {
    const addresses = getExtensionAddresses(selectedChainConfig?.chainId ?? "");
    return addresses.opusTrovesValidator;
  }, [selectedChainConfig?.chainId]);

  // Check if this extension is an Opus Troves validator
  const isOpusTrovesValidatorExtension = useMemo(() => {
    if (!extensionAddress || !opusTrovesValidatorAddress) return false;
    const normalizedExtensionAddress = indexAddress(extensionAddress);
    const normalizedValidatorAddress = indexAddress(opusTrovesValidatorAddress);
    return normalizedExtensionAddress === normalizedValidatorAddress;
  }, [extensionAddress, opusTrovesValidatorAddress]);

  // Parse Opus Troves validator config
  const opusTrovesValidatorConfig = useMemo(() => {
    const entryReq = (tournamentModel as any)?.entryRequirement;
    const reqType = entryReq?.entryRequirementType;
    if (
      !isOpusTrovesValidatorExtension ||
      reqType?.type !== "extension" ||
      !reqType?.config
    ) {
      return null;
    }

    const config = reqType.config;
    if (!config || config.length < 4) return null;

    const assetCount = Number(config[0]);
    const assetAddresses = config.slice(1, assetCount + 1);
    const threshold = BigInt(config[assetCount + 1] || "0");
    const valuePerEntry = BigInt(config[assetCount + 2] || "0");
    const maxEntriesFromConfig = Number(config[assetCount + 3] || "0");

    // Format CASH to USD (18 decimals, 1:1 parity)
    const divisor = 10n ** 18n;
    const formatCashToUSD = (value: bigint) => {
      if (value === 0n) return "0";
      const integerPart = value / divisor;
      const remainder = value % divisor;

      // Format with 2 decimal places
      const decimalPart = (remainder * 100n) / divisor;
      if (decimalPart === 0n) {
        return integerPart.toString();
      }
      return `${integerPart}.${decimalPart.toString().padStart(2, "0")}`;
    };

    return {
      assetCount,
      assetAddresses,
      threshold,
      valuePerEntry,
      maxEntries: maxEntriesFromConfig,
      thresholdUSD: formatCashToUSD(threshold),
      valuePerEntryUSD: formatCashToUSD(valuePerEntry),
      isWildcard: assetCount === 0,
      formatCashToUSD, // Export formatter for use in UI
    };
  }, [isOpusTrovesValidatorExtension, tournamentModel]);

  // Use Opus Troves hook for bannable entries calculation
  const { bannableEntries: opusBannableEntries, troveDebts } =
    useOpusTrovesBannableEntries(
      provider,
      (games || []).map((g) => ({ tokenId: Number(g.tokenId), owner: g.owner })),
      opusTrovesValidatorConfig
        ? {
            assetCount: opusTrovesValidatorConfig.assetCount,
            assetAddresses: opusTrovesValidatorConfig.assetAddresses,
            threshold: opusTrovesValidatorConfig.threshold,
            valuePerEntry: opusTrovesValidatorConfig.valuePerEntry,
            maxEntries: opusTrovesValidatorConfig.maxEntries,
          }
        : undefined,
      isOpusTrovesValidatorExtension && open,
    );

  // Create stable reference for opusBannableEntries to avoid infinite rerenders
  const opusBannableEntriesKey = useMemo(
    () => Array.from(opusBannableEntries).sort().join(","),
    [opusBannableEntries]
  );

  // Calculate bannable entries based on validator type
  useEffect(() => {
    const calculateBannableEntries = async () => {
      if (!open || !extensionAddress || !games || games.length === 0) {
        setBannableEntries(new Set());
        return;
      }

      // For Opus Troves validator, use the hook's result
      if (isOpusTrovesValidatorExtension) {
        setBannableEntries(opusBannableEntries);
        return;
      }

      // For other validators, use the should_ban check per entry
      const bannable = new Set<string>();
      await Promise.all(
        games.map(async (game) => {
          try {
            const owner = game?.owner;
            if (!owner) return;

            const qualification: string[] = [];

            const shouldBan = await checkShouldBan(
              extensionAddress,
              tournamentId,
              game.tokenId.toString(),
              owner,
              qualification
            );

            if (shouldBan) {
              bannable.add(game.tokenId.toString());
            }
          } catch (error) {
            console.error(
              "Error checking ban-ability for game:",
              game.tokenId,
              error
            );
          }
        })
      );

      setBannableEntries(bannable);
    };

    calculateBannableEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    extensionAddress,
    isOpusTrovesValidatorExtension,
    opusBannableEntriesKey,
  ]);

  // Group entries by player address
  const playerGroups = useMemo<PlayerGroup[]>(() => {
    if (!games || !registrants) return [];

    const groups = new Map<string, PlayerGroup>();

    games.forEach((game) => {
      const ownerAddress = game?.owner ?? "0x0";
      const playerName = game?.playerName || "";
      const registration = registrants.find(
        (reg) => Number(reg.gameTokenId) === Number(game.tokenId)
      );
      const isBanned = !!registration?.isBanned;
      const isBannable = bannableEntries.has(game.tokenId.toString());

      // Only include bannable entries that aren't already banned
      if (!isBannable || isBanned) return;

      if (!groups.has(ownerAddress)) {
        groups.set(ownerAddress, {
          address: ownerAddress,
          displayName: playerName || displayAddress(ownerAddress),
          entries: [],
        });
      }

      const group = groups.get(ownerAddress)!;
      group.entries.push({
        gameTokenId: game.tokenId.toString(),
        playerName: playerName || displayAddress(ownerAddress),
        isBanned,
        isBannable,
      });
    });

    // Filter out groups with no bannable entries
    return Array.from(groups.values()).filter(
      (group) => group.entries.length > 0
    );
  }, [games, registrants, bannableEntries]);

  // Handle ban all entries for a player
  const handleBanPlayer = async (playerGroup: PlayerGroup) => {
    if (!extensionAddress) return;

    setIsBanning(true);
    try {
      // Ban all entries for this player
      for (const entry of playerGroup.entries) {
        const qualification: string[] = [];

        await banEntry(tournamentId, entry.gameTokenId, qualification);

        // Try to wait for entity update, but don't fail if it times out
        try {
          await waitForBannedEntry(tournamentId, entry.gameTokenId);
        } catch (waitError) {
          console.warn(`Entity update timeout for entry ${entry.gameTokenId}, continuing...`);
        }
      }

      // Small delay to allow indexer to catch up
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh local data (both games and registrants)
      refetch();
      refetchRegistrants();

      // Call the callback to refresh parent components
      if (onBanComplete) {
        onBanComplete();
      }

      // Close the dialog
      onOpenChange(false);
    } catch (error) {
      console.error("Error banning player entries:", error);
      alert(`Failed to ban entries: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsBanning(false);
    }
  };

  const totalBannableEntries = useMemo(() => {
    return playerGroups.reduce((sum, group) => sum + group.entries.length, 0);
  }, [playerGroups]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[600px] flex flex-col p-0 overflow-hidden max-w-3xl">
        <DialogHeader className="flex-shrink-0 border-b border-border">
          <DialogTitle className="p-4 pb-2">Ban Management</DialogTitle>
          <DialogDescription className="px-4 pb-2">
            {loading ? (
              "Loading..."
            ) : (
              <>
                {totalBannableEntries} bannable{" "}
                {totalBannableEntries === 1 ? "entry" : "entries"} from{" "}
                {playerGroups.length}{" "}
                {playerGroups.length === 1 ? "player" : "players"}
              </>
            )}
          </DialogDescription>
          <div className="px-4 pb-4">
            <Button
              onClick={refetch}
              disabled={loading}
              size="sm"
              variant="outline"
              className="flex items-center gap-2"
            >
              <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {playerGroups.length > 0 ? (
            <div className="space-y-4 p-4">
              {playerGroups.map((playerGroup) => {
                return (
                  <div
                    key={playerGroup.address}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    {/* Player header */}
                    <div className="bg-brand/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5">
                            <USER />
                          </span>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {playerGroup.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {displayAddress(playerGroup.address)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {playerGroup.entries.length}{" "}
                            {playerGroup.entries.length === 1
                              ? "entry"
                              : "entries"}
                          </span>
                          <Button
                            onClick={() => handleBanPlayer(playerGroup)}
                            disabled={!address || isBanning}
                            size="sm"
                            variant="destructive"
                          >
                            Ban All
                          </Button>
                        </div>
                      </div>

                      {/* Show Opus Troves info if applicable */}
                      {isOpusTrovesValidatorExtension &&
                        opusTrovesValidatorConfig &&
                        troveDebts.has(playerGroup.address) && (
                          <OpusTrovesPlayerDetails
                            playerAddress={playerGroup.address}
                            config={opusTrovesValidatorConfig}
                            troveDebt={troveDebts.get(playerGroup.address)!}
                            totalEntriesRegistered={
                              (games ?? []).filter(
                                (g: any) => g?.owner === playerGroup.address
                              ).length
                            }
                          />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {loading ? "Loading..." : "No bannable entries found"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
