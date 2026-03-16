import { useMemo } from "react";
import { useOpusTroveDebts } from "../useOpusTroveDebts";
import { findAllBannableEntries } from "@/lib/utils";
import type { OpusTrovesValidatorConfig } from "@/lib/utils";

interface Game {
  token_id: number | bigint;
  owner?: string;
}

interface UseOpusTrovesBannableEntriesParams {
  games: Game[];
  config: OpusTrovesValidatorConfig;
  enabled: boolean;
}

interface UseOpusTrovesBannableEntriesResult {
  bannableEntries: Set<string>;
  troveDebts: Map<string, bigint>;
  isLoading: boolean;
  playerGroups: Map<string, Game[]>;
}

/**
 * Hook to calculate bannable entries for Opus Troves extension.
 * Uses metagame-sdk's findAllBannableEntries for the core math.
 */
export const useOpusTrovesBannableEntries = ({
  games,
  config,
  enabled,
}: UseOpusTrovesBannableEntriesParams): UseOpusTrovesBannableEntriesResult => {
  // Group games by player
  const playerGroups = useMemo(() => {
    const groups = new Map<string, Game[]>();
    games.forEach((game) => {
      const owner = game?.owner;
      if (!owner) return;
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner)!.push(game);
    });
    return groups;
  }, [games]);

  // Get unique player addresses
  const playerAddresses = useMemo(
    () => Array.from(playerGroups.keys()),
    [playerGroups],
  );

  // Fetch trove debts for all players (RPC calls — stays in budokan)
  const { debts: troveDebts, isLoading } = useOpusTroveDebts({
    userAddresses: playerAddresses,
    assetAddresses: config.assetAddresses,
    enabled: enabled && playerAddresses.length > 0,
  });

  // Calculate bannable entries using SDK math
  const bannableEntries = useMemo(() => {
    if (!enabled || isLoading) return new Set<string>();

    const players = new Map<string, { debt: bigint; registeredTokenIds: string[] }>();
    for (const [owner, ownerGames] of playerGroups.entries()) {
      players.set(owner, {
        debt: troveDebts.get(owner) ?? 0n,
        registeredTokenIds: ownerGames.map((g) => g.token_id.toString()),
      });
    }

    return findAllBannableEntries(players, config);
  }, [enabled, isLoading, playerGroups, troveDebts, config]);

  return {
    bannableEntries,
    troveDebts,
    isLoading,
    playerGroups,
  };
};
