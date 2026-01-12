import { create } from "zustand";
import {
  processTournamentFromSql,
  processPrizesFromSql,
} from "@/lib/utils/formatting";
import { Tournament, Prize } from "@/generated/models.gen";

interface TokenTotal {
  tokenAddress: string;
  tokenType: string;
  totalAmount: number;
  nftCount?: number;
}

interface Aggregations {
  token_totals?: TokenTotal[];
}

export type ProcessedTournament = {
  tournament: Tournament;
  prizes: Prize[];
  entryCount: number;
  aggregations?: Aggregations;
};

export type TournamentTab = "upcoming" | "live" | "ended" | "my";

interface TournamentState {
  // Pagination by tab
  pages: Record<TournamentTab, number>;
  setPage: (tab: TournamentTab, page: number) => void;
  incrementPage: (tab: TournamentTab) => void;
  resetPage: (tab: TournamentTab) => void;
  resetAllPages: () => void;

  // Tournaments data organized by tab
  tournamentsByTab: Record<TournamentTab, ProcessedTournament[]>;
  addTournaments: (
    tab: TournamentTab,
    newTournaments: ProcessedTournament[]
  ) => void;
  setTournaments: (
    tab: TournamentTab,
    tournaments: ProcessedTournament[]
  ) => void;
  clearTournaments: (tab: TournamentTab) => void;
  clearAllTournaments: () => void;

  // Get tournaments for current tab
  getCurrentTabTournaments: (tab: TournamentTab) => ProcessedTournament[];
  getCurrentTabPage: (tab: TournamentTab) => number;

  // Filters and sorting
  sortByTab: Record<TournamentTab, string>;
  setSortBy: (tab: TournamentTab, sortBy: string) => void;

  // Loading state by tab
  isLoadingByTab: Record<TournamentTab, boolean>;
  setIsLoading: (tab: TournamentTab, isLoading: boolean) => void;

  // Process raw tournament data
  processTournamentsFromRaw: (rawTournaments: any[]) => ProcessedTournament[];
}

const useTournamentStore = create<TournamentState>((set, get) => ({
  // Pagination by tab
  pages: {
    upcoming: 0,
    live: 0,
    ended: 0,
    my: 0,
  },
  setPage: (tab, page) =>
    set((state) => ({
      pages: { ...state.pages, [tab]: page },
    })),
  incrementPage: (tab) =>
    set((state) => ({
      pages: { ...state.pages, [tab]: state.pages[tab] + 1 },
    })),
  resetPage: (tab) =>
    set((state) => ({
      pages: { ...state.pages, [tab]: 0 },
    })),
  resetAllPages: () =>
    set({
      pages: { upcoming: 0, live: 0, ended: 0, my: 0 },
    }),

  // Tournaments data organized by tab
  tournamentsByTab: {
    upcoming: [],
    live: [],
    ended: [],
    my: [],
  },
  addTournaments: (tab, newTournaments) =>
    set((state) => {
      // Create a map of existing tournament IDs for quick lookup
      const existingIds = new Set(
        state.tournamentsByTab[tab].map((t) => t.tournament.id)
      );

      // Filter out any tournaments that already exist in the state
      const uniqueNewTournaments = newTournaments.filter(
        (t) => !existingIds.has(t.tournament.id)
      );

      return {
        tournamentsByTab: {
          ...state.tournamentsByTab,
          [tab]: [...state.tournamentsByTab[tab], ...uniqueNewTournaments],
        },
      };
    }),
  setTournaments: (tab, tournaments) =>
    set((state) => ({
      tournamentsByTab: {
        ...state.tournamentsByTab,
        [tab]: tournaments,
      },
    })),
  clearTournaments: (tab) =>
    set((state) => ({
      tournamentsByTab: {
        ...state.tournamentsByTab,
        [tab]: [],
      },
    })),
  clearAllTournaments: () =>
    set({
      tournamentsByTab: {
        upcoming: [],
        live: [],
        ended: [],
        my: [],
      },
    }),

  // Get tournaments for current tab
  getCurrentTabTournaments: (tab) => get().tournamentsByTab[tab],
  getCurrentTabPage: (tab) => get().pages[tab],

  // Filters and sorting
  sortByTab: {
    upcoming: "start_time",
    live: "end_time",
    ended: "end_time",
    my: "start_time",
  },
  setSortBy: (tab, sortBy) =>
    set((state) => ({
      sortByTab: {
        ...state.sortByTab,
        [tab]: sortBy,
      },
    })),

  // Loading state by tab
  isLoadingByTab: {
    upcoming: false,
    live: false,
    ended: false,
    my: false,
  },
  setIsLoading: (tab, isLoading) =>
    set((state) => ({
      isLoadingByTab: {
        ...state.isLoadingByTab,
        [tab]: isLoading,
      },
    })),

  // Process raw tournament data
  processTournamentsFromRaw: (rawTournaments) => {
    if (!rawTournaments || !Array.isArray(rawTournaments)) return [];

    return rawTournaments.map((tournament) => {
      const processedTournament = processTournamentFromSql(tournament);
      const processedPrizes = processPrizesFromSql(
        tournament.prizes,
        tournament.id
      );
      return {
        tournament: processedTournament,
        prizes: processedPrizes!,
        entryCount: Number(tournament.entry_count),
        aggregations: tournament.aggregations,
      };
    });
  },
}));

export default useTournamentStore;
