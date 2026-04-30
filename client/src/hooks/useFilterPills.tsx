import { useMemo } from "react";
import GameIcon from "@/components/icons/GameIcon";
import useUIStore from "@/hooks/useUIStore";

export interface FilterPill {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onRemove: () => void;
}

/**
 * Builds the active-filter pill list from the shared UI store. Used by
 * Overview's tournament grid and Profile's tournament history so both
 * surfaces present and remove filters identically.
 */
export const useFilterPills = (): FilterPill[] => {
  const {
    gameFilters,
    setGameFilters,
    gameData,
    getGameImage,
    filters,
    setFilter,
  } = useUIStore();

  return useMemo(() => {
    const pills: FilterPill[] = [];

    gameFilters.forEach((address) => {
      const game = gameData.find((g) => g.contract_address === address);
      pills.push({
        key: `game:${address}`,
        label: game?.name ?? "Unknown",
        icon: <GameIcon image={getGameImage(address)} size={5} />,
        onRemove: () =>
          setGameFilters(gameFilters.filter((f) => f !== address)),
      });
    });

    if (filters.entryFee !== "any") {
      pills.push({
        key: "entryFee",
        label: filters.entryFee === "free" ? "Free Entry" : "Paid Entry",
        onRemove: () => setFilter("entryFee", "any"),
      });
    }

    if (filters.hasPrizes) {
      pills.push({
        key: "hasPrizes",
        label: "Has Prizes",
        onRemove: () => setFilter("hasPrizes", false),
      });
    }

    if (filters.entryRequirement !== "any") {
      pills.push({
        key: "entryRequirement",
        label: filters.entryRequirement === "open" ? "Open Entry" : "Gated",
        onRemove: () => setFilter("entryRequirement", "any"),
      });
    }

    if (filters.registration !== "any") {
      pills.push({
        key: "registration",
        label:
          filters.registration === "open" ? "Open Window" : "Fixed Window",
        onRemove: () => setFilter("registration", "any"),
      });
    }

    return pills;
  }, [gameFilters, gameData, getGameImage, filters, setFilter, setGameFilters]);
};
