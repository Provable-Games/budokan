import { DOLLAR, REFRESH } from "@/components/Icons";
import { useGameTokens } from "@/hooks/useDenshokanQueries";
import { useGetTournamentRegistrations } from "@/hooks/useBudokanQueries";
import { useEffect, useState, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { BigNumberish } from "starknet";
import EntryCard from "@/components/tournament/myEntries/EntryCard";
import { Tournament } from "@/generated/models.gen";
import { Button } from "@/components/ui/button";
import {
  TournamentCard,
  TournamentCardTitle,
  TournamentCardHeader,
  TournamentCardContent,
  TournamentCardMetric,
  TournamentCardSwitch,
} from "./containers/TournamentCard";

interface MyEntriesProps {
  tournamentId: BigNumberish;
  gameAddress: string;
  tournamentModel: Tournament;
  totalEntryCount: number;
  banRefreshTrigger?: number;
}

const MyEntries = ({
  tournamentId,
  gameAddress,
  tournamentModel,
  totalEntryCount,
  banRefreshTrigger,
}: MyEntriesProps) => {
  const { address } = useAccount();
  const [showMyEntries, setShowMyEntries] = useState(false);

  const {
    data: ownedGames,
    refetch,
    loading,
  } = useGameTokens({
    owner: address ?? "0x0",
    gameId: Number(tournamentId),
    limit: 1000,
    active: !!address,
  });

  const gameTokens = ownedGames ?? [];
  const myEntriesCount = gameTokens.length;

  const { data: myEntries, refetch: refetchRegistrations } = useGetTournamentRegistrations(
    tournamentId?.toString(),
    {
      playerAddress: address,
      limit: 1000,
    },
  );

  const processedEntries = useMemo(() => {
    if (!myEntries || myEntries.length === 0) return [];
    const processed = myEntries.map((entry: any) => ({
      ...entry,
      game_token_id: Number(entry.game_token_id),
    }));
    return processed;
  }, [myEntries]);

  useEffect(() => {
    if (address) {
      setShowMyEntries(myEntriesCount > 0);
      refetch();
      refetchRegistrations();
    } else {
      setShowMyEntries(false);
    }
  }, [address, myEntriesCount, totalEntryCount]);

  useEffect(() => {
    refetch();
    refetchRegistrations();
  }, [totalEntryCount]);

  // Refetch when a ban operation completes
  useEffect(() => {
    if (banRefreshTrigger && banRefreshTrigger > 0) {
      refetch();
      refetchRegistrations();
    }
  }, [banRefreshTrigger]);

  const handleRefresh = () => {
    refetch();
    refetchRegistrations();
  };

  return (
    <TournamentCard showCard={showMyEntries}>
      <TournamentCardHeader>
        <TournamentCardTitle>My Entries</TournamentCardTitle>
        <div className="flex flex-row items-center gap-2">
          {/* Desktop refresh button */}
          <Button
            onClick={handleRefresh}
            disabled={loading}
            size="sm"
            variant="outline"
            className="hidden sm:flex"
          >
            <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {/* Mobile refresh button */}
          {showMyEntries && (
            <Button
              onClick={handleRefresh}
              disabled={loading}
              size="xs"
              variant="outline"
              className="flex sm:hidden"
            >
              <REFRESH className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
          <TournamentCardSwitch
            checked={showMyEntries}
            onCheckedChange={setShowMyEntries}
            showSwitch={address ? myEntriesCount > 0 : false}
            notShowingSwitchLabel={
              address ? "No Entries" : "No Account Connected"
            }
            checkedLabel="Hide"
            uncheckedLabel="Show Entries"
          />
          <TournamentCardMetric icon={<DOLLAR />} metric={myEntriesCount} />
        </div>
      </TournamentCardHeader>
      <TournamentCardContent showContent={showMyEntries}>
        <div className="p-2 h-full">
          <div className="flex flex-row gap-5 overflow-x-auto pb-2 h-full">
            {gameTokens.map((game, index) => {
              const registration = processedEntries.find(
                (entry) => entry.game_token_id === Number(game.token_id)
              );
              return (
                <EntryCard
                  key={index}
                  gameAddress={gameAddress}
                  game={game}
                  tournamentModel={tournamentModel}
                  registration={registration}
                />
              );
            })}
          </div>
        </div>
      </TournamentCardContent>
    </TournamentCard>
  );
};

export default MyEntries;
