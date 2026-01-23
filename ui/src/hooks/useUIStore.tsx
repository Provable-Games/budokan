import { create } from "zustand";
import { GameMetadata } from "metagame-sdk";
import { TabType } from "@/components/overview/TournamentTabs";

export interface GameData extends GameMetadata {
  isWhitelisted: boolean;
  existsInMetadata: boolean;
  disabled?: boolean;
}

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
