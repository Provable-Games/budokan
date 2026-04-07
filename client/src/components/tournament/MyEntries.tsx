import { DOLLAR, REFRESH } from "@/components/Icons";
import { useRegistrations } from "@provable-games/budokan-sdk/react";
import { useEffect, useState, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { BigNumberish } from "starknet";
import EntryCard from "@/components/tournament/myEntries/EntryCard";
import type { Tournament, WSEventMessage } from "@provable-games/budokan-sdk";
import { useLiveLeaderboard } from "@provable-games/denshokan-sdk/react";
import { useChainConfig } from "@/context/chain";
import { padAddress } from "@/lib/utils";
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
  isStarted: boolean;
  isEnded: boolean;
  banRefreshTrigger?: number;
  lastMessage?: WSEventMessage | null;
}

const MyEntries = ({
  tournamentId,
  gameAddress,
  tournamentModel,
  totalEntryCount,
  isStarted,
  isEnded,
  banRefreshTrigger,
  lastMessage,
}: MyEntriesProps) => {
  const { address } = useAccount();
  const { selectedChainConfig } = useChainConfig();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const [showMyEntries, setShowMyEntries] = useState(false);

  const {
    entries: ownedEntries,
    isLoading: loading,
    refetch,
  } = useLiveLeaderboard({
    contextId: Number(tournamentId),
    minterAddress: padAddress(tournamentAddress),
    owner: address,
    sort: { field: "score", direction: "desc" },
    limit: 1000,
    enabled: !!address,
    liveScores: true,
    liveGameOver: true,
    liveMints: true,
  });

  const gameTokens = useMemo(() => ownedEntries, [ownedEntries]);
  const myEntriesCount = gameTokens.length;

  const { registrations: myEntriesResult, refetch: refetchRegistrations } = useRegistrations(
    tournamentId?.toString(),
    {
      playerAddress: address,
      limit: 1000,
    },
  );
  const myEntries = myEntriesResult?.data ?? null;

  const processedEntries = useMemo(() => {
    if (!myEntries || myEntries.length === 0) return [];
    return myEntries.map((entry: any) => ({
      ...entry,
      gameTokenId: Number(entry.gameTokenId ?? entry.game_token_id),
    }));
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

  // Refetch registrations on budokan WS registration events
  useEffect(() => {
    if (lastMessage?.channel === "registrations") {
      refetchRegistrations();
    }
  }, [lastMessage, refetchRegistrations]);

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
                (entry) => entry.gameTokenId === Number(game.tokenId)
              );
              return (
                <EntryCard
                  key={index}
                  gameAddress={gameAddress}
                  game={game}
                  tournamentModel={tournamentModel}
                  registration={registration}
                  isStarted={isStarted}
                  isEnded={isEnded}
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
