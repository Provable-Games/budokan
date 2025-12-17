import Pagination from "@/components/table/Pagination";
import { USER, REFRESH } from "@/components/Icons";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect } from "react";
import { TableProperties } from "lucide-react";
import { BigNumberish } from "starknet";
import { useGameTokens } from "metagame-sdk";
import { useGetUsernames } from "@/hooks/useController";
import { MobilePlayerCard } from "@/components/tournament/table/PlayerCard";
import {
  TournamentCard,
  TournamentCardHeader,
  TournamentCardContent,
  TournamentCardTitle,
  TournamentCardMetric,
  TournamentCardSwitch,
} from "@/components/tournament/containers/TournamentCard";
import ScoreRow from "@/components/tournament/table/ScoreRow";
import EntrantRow from "@/components/tournament/table/EntrantRow";
import { padAddress } from "@/lib/utils";
import { ScoreTableDialog } from "@/components/dialogs/ScoreTable";
import { useGetTournamentRegistrants } from "@/dojo/hooks/useSqlQueries";
import { useDojo } from "@/context/dojo";
import { Tournament } from "@/generated/models.gen";

interface ScoreTableProps {
  tournamentId: BigNumberish;
  entryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  tournamentModel?: Tournament;
  tournamentsData?: Tournament[];
}

const ScoreTable = ({
  tournamentId,
  entryCount,
  isStarted,
  isEnded,
  tournamentModel,
  tournamentsData = [],
}: ScoreTableProps) => {
  const { namespace, selectedChainConfig } = useDojo();
  const [showScores, setShowScores] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  const {
    games,
    pagination: {
      currentPage,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    },
    refetch,
    loading,
  } = useGameTokens({
    context: {
      id: Number(tournamentId),
    },
    pagination: {
      pageSize: 10,
    },
    sortBy: "score",
    sortOrder: "desc",
    mintedByAddress: padAddress(tournamentAddress),
    includeMetadata: true,
  });

  const gameIds = useMemo(
    () => games?.map((game) => Number(game.token_id)) || [],
    [games]
  );

  const { data: registrants } = useGetTournamentRegistrants({
    namespace,
    gameIds,
    active: gameIds.length > 0,
    offset: 0,
    limit: 10,
  });

  // Map registrants to match the order of games
  const orderedRegistrants = useMemo(() => {
    if (!registrants || !games) return [];

    return games.map((game) => {
      const tokenId = Number(game.token_id);
      return (
        registrants.find((reg) => Number(reg.game_token_id) === tokenId) || null
      );
    });
  }, [games, registrants]);

  const ownerAddresses = useMemo(
    () => games?.map((game) => game?.owner ?? "0x0"),
    [games]
  );
  const { usernames } = useGetUsernames(ownerAddresses ?? []);

  useEffect(() => {
    if (games.length > 0 && !hasInitialized) {
      setShowScores(true);
      setHasInitialized(true);
    }
  }, [games, hasInitialized]);

  useEffect(() => {
    refetch();
  }, [entryCount]);

  return (
    <TournamentCard showCard={showScores}>
      <TournamentCardHeader>
        <TournamentCardTitle>
          {isStarted ? "Scores" : "Entrants"}
        </TournamentCardTitle>
        {showScores && entryCount > 10 && (
          <Pagination
            totalPages={Math.ceil(entryCount / 10)}
            currentPage={currentPage}
            nextPage={nextPage}
            previousPage={previousPage}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
          />
        )}
        <div className="flex flex-row items-center gap-2">
          {/* Desktop refresh button */}
          <Button
            onClick={refetch}
            disabled={loading}
            size="sm"
            variant="outline"
            className="hidden sm:flex"
          >
            <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {showScores && (
            <>
              {/* Mobile buttons together */}
              <div className="flex sm:hidden">
                <Button
                  onClick={refetch}
                  disabled={loading}
                  size="xs"
                  variant="outline"
                >
                  <REFRESH
                    className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                  />
                </Button>
                {entryCount > 0 && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setShowTableDialog(true)}
                  >
                    <TableProperties className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {/* Desktop table button */}
              {entryCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTableDialog(true)}
                  className="hidden sm:flex"
                >
                  <TableProperties className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
          <TournamentCardSwitch
            checked={showScores}
            onCheckedChange={setShowScores}
            showSwitch={entryCount > 0}
            notShowingSwitchLabel="No scores"
            checkedLabel="Hide"
            uncheckedLabel="Show Scores"
          />
          <TournamentCardMetric icon={<USER />} metric={entryCount} />
        </div>
      </TournamentCardHeader>
      <TournamentCardContent showContent={showScores}>
        {/* {!loading ? ( */}
        <div className="flex flex-row py-2">
          {[0, 1].map((colIndex) => (
            <div
              key={colIndex}
              className={`flex flex-col w-1/2 relative ${
                colIndex === 0 ? "pr-3" : "pl-3"
              }`}
            >
              {colIndex === 0 && games.length > 5 && (
                <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-brand/25 h-full" />
              )}
              {games?.slice(colIndex * 5, colIndex * 5 + 5).map((_, index) => (
                <>
                  {isStarted ? (
                    <ScoreRow
                      key={index}
                      index={index}
                      colIndex={colIndex}
                      currentPage={currentPage}
                      game={games?.[index + colIndex * 5]}
                      registration={orderedRegistrants?.[index + colIndex * 5]}
                      usernames={usernames}
                      isEnded={isEnded}
                      setSelectedPlayer={setSelectedPlayer}
                      setIsMobileDialogOpen={setIsMobileDialogOpen}
                    />
                  ) : (
                    <EntrantRow
                      key={index}
                      game={games?.[index + colIndex * 5]}
                      index={index}
                      colIndex={colIndex}
                      currentPage={currentPage}
                      setSelectedPlayer={setSelectedPlayer}
                      setIsMobileDialogOpen={setIsMobileDialogOpen}
                      usernames={usernames}
                    />
                  )}
                </>
              ))}
            </div>
          ))}
        </div>
        {/* ) : (
          <TableSkeleton entryCount={entryCount} offset={offset} />
        )} */}
      </TournamentCardContent>

      {/* Mobile dialog for player details */}
      <MobilePlayerCard
        open={isMobileDialogOpen}
        onOpenChange={setIsMobileDialogOpen}
        selectedPlayer={selectedPlayer}
        usernames={usernames}
        ownerAddress={ownerAddresses?.[selectedPlayer?.index ?? 0]}
        isEnded={isEnded}
      />

      {/* Table dialog for scores */}
      <ScoreTableDialog
        open={showTableDialog}
        onOpenChange={setShowTableDialog}
        tournamentId={tournamentId}
        entryCount={entryCount}
        isStarted={isStarted}
        isEnded={isEnded}
        tournamentModel={tournamentModel}
        tournamentsData={tournamentsData}
      />
    </TournamentCard>
  );
};

export default ScoreTable;
