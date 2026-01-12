import { DOLLAR, REFRESH } from "@/components/Icons";
import { useGameTokens, useGameTokensCount } from "metagame-sdk/sql";
import { useEffect, useState, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { useGetMyTournamentEntries } from "@/dojo/hooks/useSqlQueries";
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
import { padAddress } from "@/lib/utils";
import { useDojo } from "@/context/dojo";

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
  const { namespace, selectedChainConfig } = useDojo();
  const { address } = useAccount();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const [showMyEntries, setShowMyEntries] = useState(false);

  const { count: myEntriesCount, refetch: refetchMyEntriesCount } =
    useGameTokensCount({
      context: {
        id: Number(tournamentId),
      },
      owner: address ?? "0x0",
      mintedByAddress: padAddress(tournamentAddress),
    });

  const { games: ownedGames, refetch, loading } = useGameTokens({
    context: {
      id: Number(tournamentId) ?? 0,
    },
    owner: address ?? "0x0",
    mintedByAddress: padAddress(tournamentAddress),
    includeMetadata: true,
    sortBy: "token_id",
    sortOrder: "desc",
    limit: 1000,
  });

  const tokenIds = useMemo(
    () => ownedGames?.map((game) => game.token_id) || [],
    [ownedGames]
  );

  const { data: myEntries } = useGetMyTournamentEntries({
    namespace,
    tournamentId,
    tokenIds: tokenIds,
    active: tokenIds.length > 0 && Number(tournamentId) > 0,
    limit: 1000,
  });

  const processedEntries = useMemo(() => {
    if (!myEntries || myEntries.length === 0) return [];
    // Sort entries by their score in descending order
    const processedEntries = myEntries.map((entry) => ({
      ...entry,
      game_token_id: Number(entry.game_token_id),
    }));
    return processedEntries;
  }, [myEntries]);

  useEffect(() => {
    if (address) {
      setShowMyEntries(myEntriesCount > 0);
      refetchMyEntriesCount();
      refetch();
    } else {
      setShowMyEntries(false);
    }
  }, [address, myEntriesCount, totalEntryCount]);

  useEffect(() => {
    refetchMyEntriesCount();
    refetch();
  }, [totalEntryCount]);

  // Refetch when a ban operation completes
  useEffect(() => {
    if (banRefreshTrigger && banRefreshTrigger > 0) {
      refetchMyEntriesCount();
      refetch();
    }
  }, [banRefreshTrigger]);

  const handleRefresh = () => {
    refetchMyEntriesCount();
    refetch();
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
            {ownedGames?.map((game, index) => {
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
