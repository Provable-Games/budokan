import { create } from "zustand";
import { TabType } from "@/components/overview/TournamentTabs";

export interface GameMetadata {
  contract_address: string;
  name: string;
  image: string;
  description?: string;
  color?: string;
}

export interface GameData extends GameMetadata {
  isWhitelisted: boolean;
  existsInMetadata: boolean;
  disabled?: boolean;
}

export type EntryFeeFilter = "any" | "free" | "paid";
export type EntryRequirementFilter = "any" | "open" | "restricted";
export type RegistrationFilter = "any" | "open" | "fixed";

export interface OverviewFilters {
  entryFee: EntryFeeFilter;
  hasPrizes: boolean;
  entryRequirement: EntryRequirementFilter;
  registration: RegistrationFilter;
}

const DEFAULT_FILTERS: OverviewFilters = {
  entryFee: "any",
  hasPrizes: false,
  entryRequirement: "any",
  registration: "any",
};

type State = {
  gameFilters: string[];
  setGameFilters: (value: string[]) => void;
  gameData: GameData[];
  setGameData: (value: GameData[]) => void;
  gameDataLoading: boolean;
  setGameDataLoading: (value: boolean) => void;
  getGameImage: (gameAddress: string) => string;
  getGameName: (gameAddress: string) => string;
  selectedTab: TabType;
  setSelectedTab: (value: TabType) => void;
  filters: OverviewFilters;
  setFilter: <K extends keyof OverviewFilters>(
    key: K,
    value: OverviewFilters[K],
  ) => void;
  resetFilters: () => void;
};

const useUIStore = create<State>((set, get) => ({
  gameFilters: [],
  setGameFilters: (value: string[]) => set({ gameFilters: value }),
  gameData: [],
  setGameData: (value: GameData[]) => set({ gameData: value }),
  gameDataLoading: true,
  setGameDataLoading: (value: boolean) => set({ gameDataLoading: value }),
  selectedTab: "upcoming",
  setSelectedTab: (value: TabType) => set({ selectedTab: value }),
  filters: DEFAULT_FILTERS,
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () =>
    set({ gameFilters: [], filters: { ...DEFAULT_FILTERS } }),
  getGameImage: (gameAddress: string) => {
    const { gameData } = get();
    const game = gameData.find((game) => game.contract_address === gameAddress);
    return game?.image || "";
  },
  getGameName: (gameAddress: string) => {
    const { gameData } = get();
    const game = gameData.find((game) => game.contract_address === gameAddress);
    return game?.name || "";
  },
}));

export default useUIStore;
