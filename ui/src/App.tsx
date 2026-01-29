import MobileFooter from "@/components/MobileFooter";
import { Routes, Route, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import useUIStore from "./hooks/useUIStore";
import { getGames } from "./assets/games";
import Header from "@/components/Header";
import LoadingPage from "@/containers/LoadingPage";
import { useResetDojoOnNetworkChange } from "@/dojo/hooks/useResetDojoOnNetworkChange";
import { useSyncNetworkUrl } from "@/dojo/hooks/useSyncNetworkUrl";
import { useSwitchToUrlNetwork } from "@/dojo/hooks/useSwitchToUrlNetwork";
import { useMiniGames } from "metagame-sdk/sql";
import {
  useSubscribeTournamentsQuery,
  useSubscribeMetricsQuery,
} from "./dojo/hooks/useSdkQueries";
import { useDojo } from "./context/dojo";

const NotFound = lazy(() => import("@/containers/NotFound"));
const Overview = lazy(() => {
  const importPromise = import("@/containers/Overview");
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => {}, { timeout: 500 });
  }
  return importPromise;
});
const Tournament = lazy(() => import("@/containers/Tournament"));
const Play = lazy(() => import("@/containers/Play"));
const CreateTournament = lazy(() => import("@/containers/CreateTournament"));

function App() {
  const { namespace } = useDojo();
  const { setGameData, setGameDataLoading } = useUIStore();

  // Network management hooks
  useSwitchToUrlNetwork(); // Switch to network from URL on initial load
  useSyncNetworkUrl(); // Keep URL in sync when network changes
  useResetDojoOnNetworkChange();

  useSubscribeMetricsQuery(namespace);
  useSubscribeTournamentsQuery(namespace);

  const { minigames, loading: minigamesLoading } = useMiniGames({});

  const whitelistedGames = getGames();

  // Create a unified array of all games with flags
  const allGames = useMemo(() => {
    if (!minigames) return [];

    // Define contract addresses to filter out
    const filteredAddresses = [
      // Add contract addresses you want to filter out here
      // TEMP FILTER NEW DM
      "0x079fdfdf5db57b6e1afc91553b21160b9ff126d59ed014299ba5b85fb1ddaa17",
    ];

    // Filter minigames to exclude specific contract addresses
    const filteredMinigames = minigames.filter(
      (game) => !filteredAddresses.includes(game.contract_address),
    );

    // Create maps for faster lookups
    const metadataMap = new Map();
    filteredMinigames.forEach((game) => {
      metadataMap.set(game.contract_address, game);
    });

    const whitelistedMap = new Map();
    whitelistedGames.forEach((game) => {
      whitelistedMap.set(game.contract_address, game);
    });

    // Get whitelisted game names for filtering duplicates
    const whitelistedGameNames = new Set(
      whitelistedGames.map((game) => game.name.toLowerCase()),
    );

    // Filter metadata to exclude games with the same name as whitelisted games
    // (unless they're the exact same contract address)
    const uniqueMetadataMap = new Map();
    metadataMap.forEach((game, address) => {
      const isWhitelisted = whitelistedMap.has(address);
      const hasSameNameAsWhitelisted = whitelistedGameNames.has(
        game.name?.toLowerCase(),
      );

      // Only include if it's whitelisted OR it doesn't share a name with a whitelisted game
      if (isWhitelisted || !hasSameNameAsWhitelisted) {
        uniqueMetadataMap.set(address, game);
      }
    });

    // Collect all unique contract addresses (prioritizing whitelisted)
    const allAddresses = new Set([
      ...whitelistedMap.keys(),
      ...uniqueMetadataMap.keys(),
    ]);

    // Create the unified array
    const games = Array.from(allAddresses).map((address) => {
      const metadata = uniqueMetadataMap.get(address);
      const whitelisted = whitelistedMap.get(address);

      return {
        ...whitelisted,
        ...metadata,
        image: metadata?.image
          ? metadata?.contract_address ===
            "0x04359aee29873cd9603207d29b4140468bac3e042aa10daab2e1a8b2dd60ef7b"
            ? "https://darkshuffle.io/favicon.svg"
            : metadata?.image
          : whitelisted?.image,
        name: whitelisted?.name ? whitelisted?.name : metadata?.name,
        // Add flags
        isWhitelisted: !!whitelisted,
        existsInMetadata: !!metadata,
      };
    });

    // Sort: games with metadata first, then whitelisted-only games
    return games.sort((a, b) => {
      if (a.existsInMetadata && !b.existsInMetadata) return -1;
      if (!a.existsInMetadata && b.existsInMetadata) return 1;
      return 0;
    });
  }, [minigames, whitelistedGames]);

  // Store the stringified version of allGames to detect actual changes
  const allGamesStringified = useMemo(() => {
    try {
      return JSON.stringify(allGames);
    } catch (e) {
      return "";
    }
  }, [allGames]);

  // Store the previous stringified version to compare
  const prevAllGamesStringifiedRef = useRef("");

  // Use a separate effect for loading state
  useEffect(() => {
    setGameDataLoading(minigamesLoading);
  }, [minigamesLoading, setGameDataLoading]);

  // Use a separate effect for setting game data
  useEffect(() => {
    // Only update if allGames has changed (by comparing stringified versions)
    if (
      allGames.length > 0 &&
      allGamesStringified !== prevAllGamesStringifiedRef.current
    ) {
      prevAllGamesStringifiedRef.current = allGamesStringified;
      setGameData(allGames);
    }
  }, [allGamesStringified, allGames, setGameData]);

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-screen h-screen overflow-hidden">
        <Header />
        <main className="flex-1 px-4 pt-4 xl:px-10 xl:pt-10 2xl:px-20 2xl:pt-20 overflow-hidden">
          <Routes>
            <Route
              path="/"
              element={
                <Suspense
                  fallback={<LoadingPage message={`Loading overview...`} />}
                >
                  <Overview />
                </Suspense>
              }
            />
            <Route path="/tournament">
              <Route
                path=":id"
                element={
                  <ErrorBoundary
                    fallback={
                      <Suspense>
                        <NotFound message="Something went wrong rendering the tournament" />
                      </Suspense>
                    }
                  >
                    <TournamentWrapper />
                  </ErrorBoundary>
                }
              />
            </Route>
            <Route
              path="/create-tournament"
              element={
                <Suspense
                  fallback={
                    <LoadingPage message={`Loading create tournament...`} />
                  }
                >
                  <CreateTournament />
                </Suspense>
              }
            />
            <Route
              path="/play"
              element={
                <Suspense fallback={<div>Loading...</div>}>
                  <Play />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <Suspense>
                  <NotFound />
                </Suspense>
              }
            />
          </Routes>
        </main>
        <MobileFooter />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

function TournamentWrapper() {
  const { id } = useParams();
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    try {
      if (id) BigInt(id);
    } catch (error) {
      setHasError(true);
      setErrorMessage(`Invalid tournament ID format: ${id}`);
    }
  }, [id]);

  if (hasError) {
    return (
      <Suspense fallback={<LoadingPage message={`Loading error page...`} />}>
        <NotFound message={errorMessage} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingPage message={`Loading tournament...`} />}>
      <Tournament />
    </Suspense>
  );
}
export default App;
