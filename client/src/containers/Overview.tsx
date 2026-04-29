import { useState, useRef, useEffect, useMemo } from "react";
import { Filter } from "lucide-react";
import { X, CHEVRON_DOWN } from "@/components/Icons";
import useUIStore from "@/hooks/useUIStore";
import { getTokensByAddresses } from "@/lib/tokenUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import GameIcon from "@/components/icons/GameIcon";
import TournamentTabs from "@/components/overview/TournamentTabs";
import DashboardBanner from "@/components/overview/DashboardBanner";
import FilterPanel from "@/components/overview/FilterPanel";
import {
  useTournaments,
  useTournamentCount,
  useSubscription,
} from "@provable-games/budokan-sdk/react";
import { useTokens } from "@provable-games/denshokan-sdk/react";

import { useChainConfig } from "@/context/chain";
import EmptyResults from "@/components/overview/tournaments/EmptyResults";
import { TournamentCard } from "@/components/overview/TournamanentCard";
import TournamentSkeletons from "@/components/overview/TournamentSkeletons";
import NoAccount from "@/components/overview/tournaments/NoAccount";
import { useAccount, useNetwork } from "@starknet-react/core";
import useTournamentStore, { TournamentTab } from "@/hooks/tournamentStore";
import { EXCLUDED_TOURNAMENT_IDS } from "@/lib/constants";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/chain/hooks/useSystemCalls";

const TAB_TO_PHASE = {
  upcoming: "scheduled",
  live: "live",
  ended: "finalized",
} as const;

const SORT_OPTIONS = {
  upcoming: [
    { value: "start_time", label: "Start Time" },
    { value: "players", label: "Players" },
  ],
  live: [
    { value: "end_time", label: "End Time" },
    { value: "players", label: "Players" },
  ],
  ended: [
    { value: "end_time", label: "End Time" },
    { value: "players", label: "Players" },
    { value: "winners", label: "Winners" },
  ],
  my: [
    { value: "start_time", label: "Start Time" },
    { value: "end_time", label: "End Time" },
  ],
} as const;

const Overview = () => {
  const { selectedChainConfig } = useChainConfig();
  const { address } = useAccount();
  const { chain } = useNetwork();
  const { getTokenDecimals } = useSystemCalls();
  const {
    selectedTab,
    setSelectedTab,
    gameFilters,
    setGameFilters,
    gameData,
    getGameImage,
    filters,
    setFilter,
  } = useUIStore();

  const totalActiveFilters =
    gameFilters.length +
    (filters.entryFee !== "any" ? 1 : 0) +
    (filters.hasPrizes ? 1 : 0) +
    (filters.entryRequirement !== "any" ? 1 : 0) +
    (filters.registration !== "any" ? 1 : 0);

  // Use the tournament store with tab-specific data
  const {
    getCurrentTabPage,
    incrementPage,
    resetPage,
    getCurrentTabTournaments,
    addTournaments,
    setTournaments,
    clearTournaments,
    clearAllTournaments,
    sortByTab,
    setSortBy,
    isLoadingByTab,
    setIsLoading,
    processTournamentsFromMapped,
  } = useTournamentStore();

  const [hasSelectedInitialTab, setHasSelectedInitialTab] = useState(false);

  useEffect(() => {
    if (chain) {
      clearAllTournaments();
      setHasSelectedInitialTab(false); // Reset to allow tab reselection on chain change
    }
  }, [chain]);

  const { lastMessage } = useSubscription(["tournaments", "registrations", "prizes"]);

  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {},
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);

  const {
    count: upcomingTournamentsCount,
    refetch: refetchUpcomingTournamentsCount,
  } = useTournamentCount("scheduled");

  const { count: liveTournamentsCount } = useTournamentCount("live");

  const { count: endedTournamentsCount } = useTournamentCount("finalized");

  // "My Tournaments" sources truth from current NFT ownership (denshokan),
  // not from indexed registrations.player_address. The contract keys
  // registrations by token_id only — address attribution becomes stale the
  // moment a token is transferred. See issue #241.
  //
  // Query denshokan for tokens this wallet currently owns that were minted
  // by the Budokan contract on this chain. Filtering by minterAddress is
  // exact (per-chain deployment), unspoofable, and keys off the same chain
  // config the rest of the app uses. Each token's `contextId` is the
  // tournament id it was minted for.
  const budokanAddress = selectedChainConfig?.budokanAddress;
  const { data: playerTokensResult } = useTokens(
    address && address !== "0x0" && budokanAddress
      ? {
          owner: address,
          minterAddress: budokanAddress,
          hasContext: true,
          limit: 1000,
        }
      : undefined,
  );

  const myTournamentIds = useMemo(() => {
    if (!playerTokensResult?.data) return null; // null → still loading
    const ids = new Set<string>();
    for (const token of playerTokensResult.data) {
      if (token.contextId) ids.add(String(token.contextId));
    }
    return [...ids];
  }, [playerTokensResult]);

  const myTournamentsCount = myTournamentIds?.length ?? null;

  const tournamentCounts = useMemo(() => {
    return {
      upcoming: upcomingTournamentsCount ?? 0,
      live: liveTournamentsCount ?? 0,
      ended: endedTournamentsCount ?? 0,
      my: myTournamentsCount ?? 0,
    };
  }, [
    upcomingTournamentsCount,
    liveTournamentsCount,
    endedTournamentsCount,
    myTournamentsCount,
  ]);

  // Get current tab's data
  const currentPage = getCurrentTabPage(selectedTab as TournamentTab);
  const rawCurrentTournaments = getCurrentTabTournaments(
    selectedTab as TournamentTab,
  );

  // Client-side filtering layered on top of API-fetched tournaments. The API
  // only supports gameAddress server-side, so the rest run here. Counts in the
  // tab badges and dashboard chips still reflect unfiltered totals — see the
  // pill-row "X of Y shown" affordance for the filtered subset.
  const currentTournaments = useMemo(() => {
    return rawCurrentTournaments.filter((item: any) => {
      const t = item.tournament;
      if (!t) return false;

      // Entry Fee
      if (filters.entryFee !== "any") {
        const hasFee =
          !!(t.entryFeeToken && t.entryFeeAmount && BigInt(t.entryFeeAmount) > 0n) ||
          !!(t.entryFee?.tokenAddress && t.entryFee?.amount && BigInt(t.entryFee.amount) > 0n);
        if (filters.entryFee === "free" && hasFee) return false;
        if (filters.entryFee === "paid" && !hasFee) return false;
      }

      // Has Prizes
      if (filters.hasPrizes) {
        const aggHasPrizes =
          !!item.aggregations?.token_totals?.some(
            (tt: any) => Number(tt.totalAmount ?? 0) > 0 || tt.tokenType !== "erc20",
          );
        const distCount = Number(t.entryFee?.distributionCount ?? 0);
        const entryFeePool =
          !!(t.entryFee?.amount && BigInt(t.entryFee.amount) > 0n) &&
          (item.entryCount ?? 0) > 0 &&
          distCount > 0;
        if (!aggHasPrizes && !entryFeePool) return false;
      }

      // Entry Requirement
      if (filters.entryRequirement !== "any") {
        const restricted = !!t.entryRequirement || !!t.hasEntryRequirement;
        if (filters.entryRequirement === "open" && restricted) return false;
        if (filters.entryRequirement === "restricted" && !restricted) return false;
      }

      // Registration window
      if (filters.registration !== "any") {
        const startDelay = Number(t.schedule?.registrationStartDelay ?? 0);
        const endDelay = Number(t.schedule?.registrationEndDelay ?? 0);
        const isOpen = startDelay === 0 && endDelay === 0;
        if (filters.registration === "open" && !isOpen) return false;
        if (filters.registration === "fixed" && isOpen) return false;
      }

      return true;
    });
  }, [rawCurrentTournaments, filters]);
  const currentSortBy = sortByTab[selectedTab as TournamentTab];
  const isCurrentTabLoading = isLoadingByTab[selectedTab as TournamentTab];

  // Set default sort when tab changes
  useEffect(() => {
    const defaultSort = SORT_OPTIONS[selectedTab][0].value;
    // Only set if there's no sort value for this tab yet
    if (!currentSortBy) {
      setSortBy(selectedTab as TournamentTab, defaultSort);
    }
  }, [selectedTab, setSortBy]);

  // Reset data when filters change
  useEffect(() => {
    clearTournaments(selectedTab as TournamentTab);
    resetPage(selectedTab as TournamentTab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [gameFilters, clearTournaments, resetPage, selectedTab]);

  const removeGameFilter = (filter: string) => {
    setGameFilters(gameFilters.filter((f) => f !== filter));
  };

  const activePills = useMemo(() => {
    const pills: {
      key: string;
      label: string;
      icon?: React.ReactNode;
      onRemove: () => void;
    }[] = [];

    gameFilters.forEach((address) => {
      const game = gameData.find((g) => g.contract_address === address);
      pills.push({
        key: `game:${address}`,
        label: game?.name ?? "Unknown",
        icon: <GameIcon image={getGameImage(address)} size={5} />,
        onRemove: () => removeGameFilter(address),
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
        label:
          filters.entryRequirement === "open" ? "Open Entry" : "Gated",
        onRemove: () => setFilter("entryRequirement", "any"),
      });
    }

    if (filters.registration !== "any") {
      pills.push({
        key: "registration",
        label:
          filters.registration === "open"
            ? "Open Window"
            : "Fixed Window",
        onRemove: () => setFilter("registration", "any"),
      });
    }

    return pills;
  }, [
    gameFilters,
    gameData,
    getGameImage,
    filters,
    setFilter,
  ]);

  // Prevent initial double loading by controlling when to fetch
  const shouldFetch = useMemo(() => {
    // Pagination is keyed off the raw (unfiltered) loaded set — client-side
    // filters reduce the visible list, but the API only knows about gameAddress.
    const hasEnoughData =
      rawCurrentTournaments.length >= (currentPage + 1) * 12;

    return currentPage === 0 || (currentPage > 0 && !hasEnoughData);
  }, [currentPage, rawCurrentTournaments.length, selectedTab]);

  // Use this to conditionally fetch data
  const isListTab = ["upcoming", "live", "ended"].includes(selectedTab);
  const {
    tournaments: tournamentsResult,
    loading: tournamentsLoading,
  } = useTournaments(
    isListTab && shouldFetch
      ? {
          phase: TAB_TO_PHASE[selectedTab as keyof typeof TAB_TO_PHASE],
          gameAddress: gameFilters[0],
          sort: currentSortBy as any,
          offset: currentPage * 12,
          limit: 12,
          excludeIds: (EXCLUDED_TOURNAMENT_IDS[selectedChainConfig?.chainId ?? ""] ?? []).map(String),
          includePrizeSummary: "summary",
        }
      : undefined,
  );
  const tournaments = useMemo(() => tournamentsResult?.data ?? [], [tournamentsResult]);

  useEffect(() => {
    if (lastMessage) {
      const timer = setTimeout(() => {
        refetchUpcomingTournamentsCount();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [lastMessage, refetchUpcomingTournamentsCount]);

  // Live count among my tournaments — runs whenever we have ids, regardless
  // of which tab is selected, because the badge on the "my" tab needs it for
  // auto-tab-selection.
  const { tournaments: myLiveResult } = useTournaments(
    myTournamentIds && myTournamentIds.length > 0
      ? { tournamentIds: myTournamentIds, phase: "live", limit: 1 }
      : undefined,
  );
  const myLiveTournamentsCount =
    myTournamentIds === null
      ? null
      : myTournamentIds.length === 0
        ? 0
        : (myLiveResult?.total ?? null);

  // List of my tournaments — same `useTournaments` shape as the other tabs,
  // just narrowed to the ids derived from current NFT ownership.
  const { tournaments: myTournamentsResult, loading: myTournamentsLoading } =
    useTournaments(
      selectedTab === "my" &&
        shouldFetch &&
        myTournamentIds &&
        myTournamentIds.length > 0
        ? {
            tournamentIds: myTournamentIds,
            sort: currentSortBy as any,
            offset: currentPage * 12,
            limit: 12,
            includePrizeSummary: "summary",
          }
        : undefined,
    );
  const myTournaments = useMemo(() => myTournamentsResult?.data ?? [], [myTournamentsResult]);

  // Extract unique token addresses from all accumulated tournaments (not just current page).
  // Use the raw set so prices/decimals stay loaded for items hidden by client filters
  // (filters can be toggled, the data shouldn't refetch).
  const uniqueTokenAddresses = useMemo(() => {
    const addresses = new Set<string>();

    rawCurrentTournaments.forEach((item: any) => {
      // Extract from entry fees (SDK returns entryFee as plain object)
      if (item.tournament?.entryFee?.tokenAddress) {
        addresses.add(item.tournament.entryFee.tokenAddress);
      }
      // Extract from prizes
      if (item.prizes && Array.isArray(item.prizes)) {
        item.prizes.forEach((prize: any) => {
          if (prize?.token_address) {
            addresses.add(prize.token_address);
          }
        });
      }
      // Extract from aggregations
      if (
        item.aggregations?.token_totals &&
        Array.isArray(item.aggregations.token_totals)
      ) {
        item.aggregations.token_totals.forEach((tokenTotal: any) => {
          if (tokenTotal?.tokenAddress) {
            addresses.add(tokenTotal.tokenAddress);
          }
        });
      }
    });

    return Array.from(addresses);
  }, [rawCurrentTournaments]);

  // Get token metadata for all unique addresses from static lists
  const tokensArray = useMemo(() => {
    return getTokensByAddresses(
      uniqueTokenAddresses,
      selectedChainConfig?.chainId ?? "",
    );
  }, [uniqueTokenAddresses, selectedChainConfig?.chainId]);

  // Extract unique token addresses for price fetching
  const allUniqueTokens = useMemo(() => {
    return tokensArray
      .map((t: any) => t.token_address)
      .filter((addr: any) => addr);
  }, [tokensArray]);

  // Fetch prices for all unique token addresses at once
  const { prices: tokenPrices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: allUniqueTokens,
  });

  // Extract unique ERC20 token addresses for decimal fetching
  const allUniqueTokenAddresses = useMemo(() => {
    const uniqueAddresses = new Set<string>();
    if (tokensArray && Array.isArray(tokensArray)) {
      tokensArray.forEach((token: any) => {
        if (token?.token_address && token?.token_type === "erc20") {
          uniqueAddresses.add(token.token_address);
        }
      });
    }
    return Array.from(uniqueAddresses);
  }, [tokensArray]);

  // Fetch decimals for all unique tokens
  useEffect(() => {
    const fetchDecimals = async () => {
      // Filter to only fetch decimals we don't have yet
      const missingAddresses = allUniqueTokenAddresses.filter(
        (addr) => !(addr in tokenDecimals),
      );

      try {
        // Fetch decimals in parallel
        const decimalsPromises = missingAddresses.map(async (address) => {
          try {
            const decimals = await getTokenDecimals(address);
            return { address, decimals };
          } catch (error) {
            console.error(
              `Failed to fetch decimals for token ${address}:`,
              error,
            );
            return { address, decimals: 18 }; // Default to 18
          }
        });

        const results = await Promise.all(decimalsPromises);

        // Use functional update to avoid depending on tokenDecimals
        setTokenDecimals((prev) => {
          const newDecimals = { ...prev };
          results.forEach(({ address, decimals }) => {
            newDecimals[address] = decimals;
          });
          return newDecimals;
        });
      } catch (error) {
        console.error("Error fetching token decimals:", error);
      }
    };

    fetchDecimals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUniqueTokenAddresses.join(",")]); // Use join to create stable dependency

  // Process and store tournaments when data is loaded
  useEffect(() => {
    // Set loading state based on current tab's loading status
    setIsLoading(
      selectedTab as TournamentTab,
      tournamentsLoading || myTournamentsLoading,
    );

    // Only process data if we're not loading
    if (!tournamentsLoading && !myTournamentsLoading) {
      const rawTournaments = selectedTab === "my" ? myTournaments : tournaments;

      console.log(`[Overview] tab=${selectedTab} loading=${tournamentsLoading} raw=`, rawTournaments);

      // Make sure we have data and we're on the right page
      if (
        rawTournaments &&
        Array.isArray(rawTournaments) &&
        rawTournaments.length > 0
      ) {
        const processedTournaments = processTournamentsFromMapped(rawTournaments);
        console.log(`[Overview] processed=`, processedTournaments);

        // For first page, replace all tournaments
        // For subsequent pages, add only new tournaments
        if (currentPage === 0) {
          setTournaments(selectedTab as TournamentTab, processedTournaments);
        } else {
          addTournaments(selectedTab as TournamentTab, processedTournaments);
        }
      } else if (currentPage === 0) {
        console.log(`[Overview] tab=${selectedTab} no data, clearing`);
        // If there are no results for the first page, clear the tournaments
        setTournaments(selectedTab as TournamentTab, []);
      }
    }
  }, [
    tournaments,
    myTournaments,
    tournamentsLoading,
    myTournamentsLoading,
    currentPage,
    selectedTab,
    setTournaments,
    addTournaments,
    setIsLoading,
    processTournamentsFromMapped,
  ]);

  // Infinite scroll implementation with debounce to prevent multiple triggers
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        // Clear any existing timeout to prevent multiple triggers
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const hasMoreToLoad =
          tournamentCounts[selectedTab] > rawCurrentTournaments.length;
        const hasFullPage =
          rawCurrentTournaments.length > 0 && rawCurrentTournaments.length % 12 === 0;
        const isNotInitialLoad = currentPage > 0;

        if (
          entries[0].isIntersecting &&
          !isCurrentTabLoading &&
          hasMoreToLoad &&
          hasFullPage &&
          isNotInitialLoad
        ) {
          // Use a timeout to debounce the page increment
          timeoutId = setTimeout(() => {
            incrementPage(selectedTab as TournamentTab);
          }, 300);
        }
      },
      { threshold: 0.1 },
    );

    // Only observe if we meet all conditions
    if (
      loadingRef.current &&
      !isCurrentTabLoading &&
      tournamentCounts[selectedTab] > rawCurrentTournaments.length &&
      rawCurrentTournaments.length > 0 &&
      currentPage > 0
    ) {
      observer.observe(loadingRef.current);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      observer.disconnect();
    };
  }, [
    isCurrentTabLoading,
    tournamentCounts,
    selectedTab,
    rawCurrentTournaments.length,
    currentPage,
    incrementPage,
  ]);

  // Add this effect to handle the first page scroll
  useEffect(() => {
    const handleScroll = () => {
      if (
        scrollContainerRef.current &&
        currentPage === 0 &&
        !isCurrentTabLoading &&
        tournamentCounts[selectedTab] > rawCurrentTournaments.length &&
        rawCurrentTournaments.length > 0 &&
        rawCurrentTournaments.length % 12 === 0
      ) {
        const { scrollTop, scrollHeight, clientHeight } =
          scrollContainerRef.current;

        // If we're near the bottom (within 100px)
        if (scrollTop + clientHeight >= scrollHeight - 100) {
          incrementPage(selectedTab as TournamentTab);
        }
      }
    };

    if (scrollContainerRef.current) {
      scrollContainerRef.current.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.removeEventListener("scroll", handleScroll);
      }
    };
  }, [
    currentPage,
    isCurrentTabLoading,
    tournamentCounts,
    selectedTab,
    rawCurrentTournaments.length,
    incrementPage,
  ]);

  // Auto-select tab based on tournament availability
  // Priority: my (if connected & has live tournaments) > live > upcoming > ended
  useEffect(() => {
    // Determine best tab based on available data
    let bestTab: TournamentTab | null = null;

    // If user is connected and has live tournaments they're registered for
    if (
      address &&
      myLiveTournamentsCount != null &&
      myLiveTournamentsCount > 0
    ) {
      bestTab = "my";
    }
    // Otherwise check live tournaments
    else if (liveTournamentsCount != null && liveTournamentsCount > 0) {
      bestTab = "live";
    }
    // Then upcoming
    else if (
      upcomingTournamentsCount != null &&
      upcomingTournamentsCount > 0
    ) {
      bestTab = "upcoming";
    }
    // Then ended
    else if (endedTournamentsCount != null && endedTournamentsCount > 0) {
      bestTab = "ended";
    }
    // Default to upcoming if we have data but no tournaments
    else if (
      liveTournamentsCount != null ||
      upcomingTournamentsCount != null ||
      endedTournamentsCount != null
    ) {
      bestTab = "upcoming";
    }

    // Only set tab if:
    // 1. We haven't selected yet, OR
    // 2. We have a better tab than current (e.g., "my" is better than "live")
    const shouldUpdateTab =
      !hasSelectedInitialTab ||
      (bestTab && bestTab === "my" && selectedTab !== "my");

    if (bestTab && shouldUpdateTab) {
      setSelectedTab(bestTab);
      setHasSelectedInitialTab(true);
    }
  }, [
    address,
    myLiveTournamentsCount,
    liveTournamentsCount,
    upcomingTournamentsCount,
    endedTournamentsCount,
    hasSelectedInitialTab,
  ]);

  return (
    <div className="lg:w-[87.5%] xl:w-5/6 2xl:w-3/4 sm:mx-auto flex flex-row gap-5 h-full">
      <div className="flex flex-col gap-2 sm:gap-3 w-full p-1 sm:p-2">
        <DashboardBanner
          liveCount={liveTournamentsCount ?? 0}
          upcomingCount={upcomingTournamentsCount ?? 0}
          endedCount={endedTournamentsCount ?? 0}
          myLiveCount={myLiveTournamentsCount ?? 0}
        />
        <div className="flex flex-row items-center justify-between gap-3 w-full border-b-4 border-brand h-[44px] 3xl:h-[52px]">
          {/* Hide TournamentTabs on mobile when selectedTab is "my" */}
          <div className={selectedTab === "my" ? "hidden sm:block" : "block"}>
            <TournamentTabs
              selectedTab={selectedTab}
              setSelectedTab={setSelectedTab}
              upcomingTournamentsCount={upcomingTournamentsCount ?? undefined}
              liveTournamentsCount={liveTournamentsCount ?? undefined}
              endedTournamentsCount={endedTournamentsCount ?? undefined}
              myTournamentsCount={myLiveTournamentsCount ?? undefined}
            />
          </div>

          {/* Show a title when on "my" tab on mobile */}
          {selectedTab === "my" && (
            <div className="sm:hidden font-brand text-xl">My Tournaments</div>
          )}
          <div className="flex flex-row gap-2 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  aria-label="Open filters"
                  className="inline-flex items-center gap-2 h-9 rounded-md border border-brand/20 bg-brand/5 px-3 text-xs sm:text-sm font-semibold uppercase tracking-wider text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {totalActiveFilters > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-brand text-black px-1 text-[10px] font-bold leading-none">
                      {totalActiveFilters}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[320px] p-4 max-h-[70vh] overflow-y-auto bg-black border border-brand/40"
              >
                <FilterPanel />
              </PopoverContent>
            </Popover>
            <span className="hidden 2xl:block text-[10px] uppercase tracking-wider text-brand-muted">
              Sort By
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-between gap-2 h-9 rounded-md border border-brand/20 bg-brand/5 px-3 min-w-[120px] text-xs sm:text-sm font-semibold uppercase tracking-wider text-brand hover:bg-brand/10 hover:border-brand/40 transition-colors">
                <span>
                  {
                    SORT_OPTIONS[selectedTab].find(
                      (option) => option.value === currentSortBy,
                    )?.label
                  }
                </span>
                <span className="w-4 h-4 text-brand-muted">
                  <CHEVRON_DOWN />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-black border-2 border-brand-muted">
                <DropdownMenuLabel className="text-brand">
                  Options
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-brand-muted" />
                {SORT_OPTIONS[selectedTab].map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="text-brand cursor-pointer"
                    onClick={() =>
                      setSortBy(selectedTab as TournamentTab, option.value)
                    }
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex flex-col overflow-hidden">
          <div
            className={`
            transition-[height] duration-300 ease-in-out
            ${activePills.length > 0 ? "h-[44px] sm:h-[48px] mb-1" : "h-0"}
          `}
          >
            {activePills.length > 0 && (
              <div className="flex flex-row items-center gap-2 px-1 h-[44px] sm:h-[48px] overflow-x-auto w-full">
                <span className="text-[10px] uppercase tracking-wider text-brand-muted flex-shrink-0 hidden sm:inline">
                  Filters
                </span>
                {activePills.map((pill) => (
                  <div
                    key={pill.key}
                    className="inline-flex items-center gap-2 h-8 rounded-md border border-brand/25 bg-brand/10 pl-1.5 pr-2 shrink-0"
                  >
                    {pill.icon}
                    <span className="text-xs sm:text-sm font-semibold tracking-wide text-brand truncate max-w-[160px]">
                      {pill.label}
                    </span>
                    <button
                      className="w-4 h-4 text-brand-muted hover:text-brand transition-colors flex-shrink-0"
                      onClick={pill.onRemove}
                      aria-label={`Remove ${pill.label} filter`}
                    >
                      <X />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div
            ref={scrollContainerRef}
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-2 sm:gap-4 transition-all duration-300 ease-in-out sm:py-2 overflow-y-auto"
          >
            {selectedTab === "my" && !address ? (
              <NoAccount />
            ) : isCurrentTabLoading && currentPage === 0 ? (
              <TournamentSkeletons
                tournamentsCount={tournamentCounts[selectedTab]}
              />
            ) : (console.log(`[Overview] render: tab=${selectedTab} currentTournaments.length=${currentTournaments.length} isLoading=${isCurrentTabLoading}`), currentTournaments.length > 0) ? (
              <>
                {currentTournaments.map((tournament, index) => (
                  <TournamentCard
                    key={`${tournament.tournament.id}-${index}`}
                    tournament={tournament.tournament}
                    index={index}
                    status={selectedTab}
                    prizes={tournament.prizes}
                    entryCount={tournament.entryCount}
                    tokens={tokensArray}
                    tokenPrices={tokenPrices}
                    pricesLoading={pricesLoading}
                    tokenDecimals={tokenDecimals}
                    aggregations={tournament.aggregations}
                  />
                ))}

                {isCurrentTabLoading && currentPage > 0 && (
                  <TournamentSkeletons
                    tournamentsCount={tournamentCounts[selectedTab]}
                    count={12}
                  />
                )}
              </>
            ) : (
              <EmptyResults gameFilters={gameFilters} />
            )}
          </div>
          <div ref={loadingRef} className="w-full h-10 flex justify-center">
            {isCurrentTabLoading && currentPage === 0
              ? null
              : isCurrentTabLoading && <LoadingSpinner className="w-5 h-5" />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
