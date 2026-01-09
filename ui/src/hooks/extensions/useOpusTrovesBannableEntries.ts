import { useMemo } from "react";
import { useOpusTroveDebts } from "../useOpusTroveDebts";

interface OpusTrovesConfig {
  assetAddresses: string[];
  threshold: bigint;
  valuePerEntry: bigint;
  maxEntries: number;
}

interface Game {
  token_id: number | bigint;
  owner?: string;
}

interface UseOpusTrovesBannableEntriesParams {
  games: Game[];
  config: OpusTrovesConfig;
  enabled: boolean;
}

interface UseOpusTrovesBannableEntriesResult {
  bannableEntries: Set<string>;
  troveDebts: Map<string, bigint>;
  isLoading: boolean;
  playerGroups: Map<string, Game[]>;
}

/**
 * Hook to calculate bannable entries for Opus Troves extension
 *
 * Logic:
 * - Proportional mode (valuePerEntry > 0): entries based on (debt - threshold) / valuePerEntry
 * - Fixed mode (valuePerEntry = 0): if debt >= threshold, allow maxEntries
 * - Cap at maxEntries if specified
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
      if (!groups.has(owner)) {
        groups.set(owner, []);
      }
      groups.get(owner)!.push(game);
    });
    return groups;
  }, [games]);

  // Get unique player addresses
  const playerAddresses = useMemo(
    () => Array.from(playerGroups.keys()),
    [playerGroups]
  );

  // Fetch trove debts for all players
  const { debts: troveDebts, isLoading } = useOpusTroveDebts({
    userAddresses: playerAddresses,
    assetAddresses: config.assetAddresses,
    enabled: enabled && playerAddresses.length > 0,
  });

  // Calculate bannable entries
  const bannableEntries = useMemo(() => {
    const bannable = new Set<string>();

    if (!enabled || isLoading) {
      return bannable;
    }

    // Calculate bannable entries for each player
    for (const [owner, ownerGames] of playerGroups.entries()) {
      const debt = troveDebts.get(owner) || 0n;
      const threshold = config.threshold;
      const valuePerEntry = config.valuePerEntry;

      let totalEntriesAllowed = 0;

      if (valuePerEntry > 0n) {
        // Proportional mode: entries based on CASH borrowed per entry value
        if (debt > threshold) {
          totalEntriesAllowed = Number((debt - threshold) / valuePerEntry);
        }
      } else {
        // Fixed mode: if debt meets threshold, allow maxEntries
        if (debt >= threshold && config.maxEntries > 0) {
          totalEntriesAllowed = config.maxEntries;
        }
      }

      // Cap at max entries if specified
      if (config.maxEntries > 0) {
        totalEntriesAllowed = Math.min(
          totalEntriesAllowed,
          config.maxEntries
        );
      }

      const totalEntriesRegistered = ownerGames.length;
      const bannableCount = Math.max(
        0,
        totalEntriesRegistered - totalEntriesAllowed
      );

      // Mark the first N entries as bannable (sorted by token_id)
      if (bannableCount > 0) {
        const sortedGames = [...ownerGames].sort((a, b) => {
          const aId = typeof a.token_id === 'bigint' ? Number(a.token_id) : a.token_id;
          const bId = typeof b.token_id === 'bigint' ? Number(b.token_id) : b.token_id;
          return aId - bId;
        });
        for (let i = 0; i < bannableCount; i++) {
          bannable.add(sortedGames[i].token_id.toString());
        }
      }
    }

    return bannable;
  }, [enabled, isLoading, playerGroups, troveDebts, config]);

  return {
    bannableEntries,
    troveDebts,
    isLoading,
    playerGroups,
  };
};
