import { useState, useRef, useEffect, useMemo } from "react";
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
import GameFilters from "@/components/overview/GameFilters";
import GameIcon from "@/components/icons/GameIcon";
import TournamentTabs from "@/components/overview/TournamentTabs";
import {
  useGetUpcomingTournamentsCount,
  useGetLiveTournamentsCount,
  useGetEndedTournamentsCount,
  useGetTournaments,
  useGetMyTournaments,
  useGetMyTournamentsCount,
  useGetMyLiveTournamentsCount,
} from "@/dojo/hooks/useSqlQueries";
import { useGameTokens } from "metagame-sdk";
import {
  bigintToHex,
  indexAddress,
  stringToFelt,
  padAddress,
  padU64,
} from "@/lib/utils";
import { useDojo } from "@/context/dojo";
import EmptyResults from "@/components/overview/tournaments/EmptyResults";
import { TournamentCard } from "@/components/overview/TournamanentCard";
import TournamentSkeletons from "@/components/overview/TournamentSkeletons";
import NoAccount from "@/components/overview/tournaments/NoAccount";
import { useAccount, useNetwork } from "@starknet-react/core";
import { useDojoStore } from "@/dojo/hooks/useDojoStore";
import { ParsedEntity } from "@dojoengine/sdk";
import { SchemaType } from "@/generated/models.gen";
import useTournamentStore, { TournamentTab } from "@/hooks/tournamentStore";
import {
  STARTING_TOURNAMENT_ID,
  EXCLUDED_TOURNAMENT_IDS,
} from "@/lib/constants";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";

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
  const { namespace, selectedChainConfig } = useDojo();
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
  } = useUIStore();

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
    processTournamentsFromRaw,
  } = useTournamentStore();

  const tournamentAddress = selectedChainConfig.budokanAddress!;

  const [hasSelectedInitialTab, setHasSelectedInitialTab] = useState(false);

  useEffect(() => {
    if (chain) {
      clearAllTournaments();
      setHasSelectedInitialTab(false); // Reset to allow tab reselection on chain change
    }
  }, [chain]);

  const isMainnet = useMemo(() => {
    return bigintToHex(BigInt(chain?.id)) === stringToFelt("SN_MAIN");
  }, [chain]);

  const subscribedTournaments = useDojoStore((state) =>
    state.getEntitiesByModel(namespace, "Tournament")
  );

  const subscribedTournamentsKey = useMemo(() => {
    // Just use the length and a simple hash of IDs
    return `${subscribedTournaments.length}-${subscribedTournaments
      .map((t) => t.entityId.toString())
      .join(",")}`;
  }, [subscribedTournaments]);

  const [prevSubscribedTournaments, setPrevSubscribedTournaments] = useState<
    ParsedEntity<SchemaType>[] | null
  >(null);

  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {}
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const currentTime = useMemo(() => {
    return BigInt(Date.now()) / 1000n;
  }, []);

  const fromTournamentId = useMemo(() => {
    return isMainnet ? padU64(BigInt(STARTING_TOURNAMENT_ID)) : undefined;
  }, [isMainnet]);

  const {
    data: upcomingTournamentsCount,
    refetch: refetchUpcomingTournamentsCount,
  } = useGetUpcomingTournamentsCount({
    namespace: namespace,
    currentTime: currentTime,
    fromTournamentId: fromTournamentId,
  });

  console.log(upcomingTournamentsCount);

  const { data: liveTournamentsCount } = useGetLiveTournamentsCount({
    namespace: namespace,
    currentTime: currentTime,
    fromTournamentId: fromTournamentId,
    excludedTournamentIds: EXCLUDED_TOURNAMENT_IDS,
  });

  const { data: endedTournamentsCount } = useGetEndedTournamentsCount({
    namespace: namespace,
    currentTime: currentTime,
    fromTournamentId: fromTournamentId,
    excludedTournamentIds: EXCLUDED_TOURNAMENT_IDS,
  });

  const queryAddress = useMemo(() => {
    if (!address || address === "0x0") return null;
    return indexAddress(address);
  }, [address]);

  const gameAddresses = useMemo(() => {
    return gameData?.map((game) => padAddress(game.contract_address));
  }, [gameData]);

  const { games: gameTokens } = useGameTokens({
    mintedByAddress: padAddress(tournamentAddress),
    owner: address,
    includeMetadata: false,
  });

  const gameTokenIds = useMemo(() => {
    return gameTokens?.map((game) => padU64(BigInt(game.token_id)));
  }, [gameTokens]);

  const { data: myTournamentsCount } = useGetMyTournamentsCount({
    namespace: namespace,
    address: queryAddress,
    gameAddresses: gameAddresses ?? [],
    tokenIds: gameTokenIds,
    fromTournamentId: fromTournamentId,
  });

  const { data: myLiveTournamentsCount } = useGetMyLiveTournamentsCount({
    namespace: namespace,
    address: queryAddress,
    gameAddresses: gameAddresses ?? [],
    tokenIds: gameTokenIds,
    fromTournamentId: fromTournamentId,
    currentTime: currentTime,
  });

  const tournamentCounts = useMemo(() => {
    return {
      upcoming: upcomingTournamentsCount,
      live: liveTournamentsCount,
      ended: endedTournamentsCount,
      my: myTournamentsCount,
    };
  }, [
    upcomingTournamentsCount,
    liveTournamentsCount,
    endedTournamentsCount,
    myTournamentsCount,
  ]);

  // Get current tab's data
  const currentPage = getCurrentTabPage(selectedTab as TournamentTab);
  const currentTournaments = getCurrentTabTournaments(
    selectedTab as TournamentTab
  );
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

  // Prevent initial double loading by controlling when to fetch
  const shouldFetch = useMemo(() => {
    // Only fetch if:
    // 1. We're on the first page (always fetch first page)
    // 2. OR we're on a subsequent page AND we don't have enough data yet
    const hasEnoughData =
      currentTournaments.length >= (currentPage + 1) * 12 ||
      currentTournaments.length === tournamentCounts[selectedTab];

    return currentPage === 0 || (currentPage > 0 && !hasEnoughData);
  }, [currentPage, currentTournaments.length, tournamentCounts, selectedTab]);

  // Use this to conditionally fetch data
  const {
    data: tournaments,
    loading: tournamentsLoading,
    // refetch: refetchTournaments,
  } = useGetTournaments({
    namespace: namespace,
    currentTime,
    gameFilters: gameFilters,
    offset: currentPage * 12,
    limit: 12,
    status: selectedTab,
    sortBy: currentSortBy,
    fromTournamentId: fromTournamentId,
    excludedTournamentIds: EXCLUDED_TOURNAMENT_IDS,
    // Only activate the query for the appropriate tabs and when we need to fetch
    active: ["upcoming", "live", "ended"].includes(selectedTab) && shouldFetch,
  });

  useEffect(() => {
    if (
      prevSubscribedTournaments !== null &&
      prevSubscribedTournaments !== subscribedTournaments
    ) {
      const timer = setTimeout(() => {
        refetchUpcomingTournamentsCount();
      }, 1000);

      return () => clearTimeout(timer);
    }

    setPrevSubscribedTournaments(subscribedTournaments);
  }, [subscribedTournamentsKey, prevSubscribedTournaments]);

  const { data: myTournaments, loading: myTournamentsLoading } =
    useGetMyTournaments({
      namespace: namespace,
      address: queryAddress,
      gameAddresses: gameAddresses,
      tokenIds: gameTokenIds,
      gameFilters: gameFilters,
      limit: 12,
      offset: currentPage * 12,
      active: selectedTab === "my",
      sortBy: currentSortBy,
      fromTournamentId: fromTournamentId,
    });

  // Extract unique token addresses from tournaments
  const uniqueTokenAddresses = useMemo(() => {
    const currentData = selectedTab === "my" ? myTournaments : tournaments;
    const addresses = new Set<string>();

    if (currentData && Array.isArray(currentData)) {
      currentData.forEach((item: any) => {
        // Extract from entry fees
        if (item.tournament?.entry_fee?.Some?.token_address) {
          addresses.add(item.tournament.entry_fee.Some.token_address);
        }
        // Extract from prizes
        if (item.prizes && Array.isArray(item.prizes)) {
          item.prizes.forEach((prize: any) => {
            if (prize?.token_address) {
              addresses.add(prize.token_address);
            }
          });
        }
      });
    }

    return Array.from(addresses);
  }, [selectedTab, tournaments, myTournaments]);

  // Get token metadata for all unique addresses from static lists
  const tokensArray = useMemo(() => {
    return getTokensByAddresses(
      uniqueTokenAddresses,
      selectedChainConfig?.chainId ?? ""
    );
  }, [uniqueTokenAddresses, selectedChainConfig?.chainId]);

  // Extract unique token symbols for price fetching
  const allUniqueTokens = useMemo(() => {
    return tokensArray.map((t: any) => t.symbol).filter((s: any) => s);
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
        (addr) => !(addr in tokenDecimals)
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
              error
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
      tournamentsLoading || myTournamentsLoading
    );

    // Only process data if we're not loading
    if (!tournamentsLoading && !myTournamentsLoading) {
      const rawTournaments = selectedTab === "my" ? myTournaments : tournaments;

      // Make sure we have data and we're on the right page
      if (
        rawTournaments &&
        Array.isArray(rawTournaments) &&
        rawTournaments.length > 0
      ) {
        const processedTournaments = processTournamentsFromRaw(rawTournaments);

        // For first page, replace all tournaments
        // For subsequent pages, add only new tournaments
        if (currentPage === 0) {
          setTournaments(selectedTab as TournamentTab, processedTournaments);
        } else {
          addTournaments(selectedTab as TournamentTab, processedTournaments);
        }
      } else if (currentPage === 0) {
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
    processTournamentsFromRaw,
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
          tournamentCounts[selectedTab] > currentTournaments.length;
        const hasFullPage =
          currentTournaments.length > 0 && currentTournaments.length % 12 === 0;
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
      { threshold: 0.1 }
    );

    // Only observe if we meet all conditions
    if (
      loadingRef.current &&
      !isCurrentTabLoading &&
      tournamentCounts[selectedTab] > currentTournaments.length &&
      currentTournaments.length > 0 &&
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
    currentTournaments.length,
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
        tournamentCounts[selectedTab] > currentTournaments.length &&
        currentTournaments.length > 0 &&
        currentTournaments.length % 12 === 0
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
    currentTournaments.length,
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
      myLiveTournamentsCount !== undefined &&
      myLiveTournamentsCount > 0
    ) {
      bestTab = "my";
    }
    // Otherwise check live tournaments
    else if (liveTournamentsCount !== undefined && liveTournamentsCount > 0) {
      bestTab = "live";
    }
    // Then upcoming
    else if (
      upcomingTournamentsCount !== undefined &&
      upcomingTournamentsCount > 0
    ) {
      bestTab = "upcoming";
    }
    // Then ended
    else if (endedTournamentsCount !== undefined && endedTournamentsCount > 0) {
      bestTab = "ended";
    }
    // Default to upcoming if we have data but no tournaments
    else if (
      liveTournamentsCount !== undefined ||
      upcomingTournamentsCount !== undefined ||
      endedTournamentsCount !== undefined
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
    <div className="flex flex-row gap-5 h-full">
      <GameFilters />
      <div className="flex flex-col gap-2 sm:gap-0 w-full sm:w-4/5 p-1 sm:p-2">
        <div className="flex flex-row items-center justify-between w-full border-b-4 border-brand h-[44px] 3xl:h-[52px]">
          {/* Hide TournamentTabs on mobile when selectedTab is "my" */}
          <div className={selectedTab === "my" ? "hidden sm:block" : "block"}>
            <TournamentTabs
              selectedTab={selectedTab}
              setSelectedTab={setSelectedTab}
              upcomingTournamentsCount={upcomingTournamentsCount}
              liveTournamentsCount={liveTournamentsCount}
              endedTournamentsCount={endedTournamentsCount}
              myTournamentsCount={myLiveTournamentsCount}
            />
          </div>

          {/* Show a title when on "my" tab on mobile */}
          {selectedTab === "my" && (
            <div className="sm:hidden font-brand text-xl">My Tournaments</div>
          )}
          <div className="flex flex-row gap-4 items-center">
            <span className="hidden 2xl:block">Sort By:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="bg-black border-2 border-brand-muted px-2 min-w-[100px] h-8">
                <div className="flex flex-row items-center justify-between capitalize text-sm 2xl:text-base w-full sm:gap-2">
                  {
                    SORT_OPTIONS[selectedTab].find(
                      (option) => option.value === currentSortBy
                    )?.label
                  }
                  <span className="w-6">
                    <CHEVRON_DOWN />
                  </span>
                </div>
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
            ${gameFilters.length > 0 ? "h-[60px] 2xl:h-[72px] sm:py-2" : "h-0"}
          `}
          >
            {gameFilters.length > 0 && (
              <div className="flex flex-row items-center gap-2 sm:gap-4 px-2 sm:p-4 h-[60px] 2xl:h-[72px] overflow-x-auto w-full">
                {gameFilters.map((filter) => (
                  <div
                    key={filter}
                    className="flex flex-row items-center gap-2 sm:gap-4 bg-black border-2 border-brand-muted py-2 px-4 shrink-0"
                  >
                    <GameIcon image={getGameImage(filter)} />
                    <span className="text-lg 2xl:text-2xl font-brand">
                      {
                        gameData.find(
                          (game) => game.contract_address === filter
                        )?.name!
                      }
                    </span>
                    <span
                      className="w-4 h-4 sm:w-6 sm:h-6 text-brand-muted cursor-pointer"
                      onClick={() => removeGameFilter(filter)}
                    >
                      <X />
                    </span>
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
            ) : currentTournaments.length > 0 ? (
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
