import { Button } from "@/components/ui/button";
import { ARROW_LEFT } from "@/components/Icons";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useGetTournaments } from "@/hooks/useBudokanQueries";
// import TournamentGames from "@/components/play/TournamentGames";
import type { Tournament } from "@provable-games/budokan-sdk";
import { Card } from "@/components/ui/card";

const Play = () => {
  const navigate = useNavigate();
  const [selectedTournament, setSelectedTournament] = useState<Tournament>();

  const { data: tournaments } = useGetTournaments({
    limit: 100,
    offset: 0,
    active: true,
  });

  const tournamentsData = tournaments.map((tournament) => ({
    tournament,
    prizes: [],
    entryCount: tournament.entryCount ?? 0,
  }));

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-80px)] w-3/4 mx-auto">
      <div className="space-y-5">
        <div className="flex flex-row justify-between items-center">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ARROW_LEFT />
            Home
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-row items-center h-12 justify-between">
          <div className="flex flex-row gap-5">
            <span className="font-brand text-4xl font-bold">
              Game Simulator
            </span>
          </div>
        </div>
        <Card variant="outline" className="h-auto w-full">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-between h-24">
              <span className="font-brand text-2xl">Tournaments</span>
              <div className="flex flex-row gap-2 overflow-x-auto pb-2">
                {tournamentsData?.map((tournament) => {
                  return (
                    <Button
                      key={tournament.tournament.id}
                      variant={
                        selectedTournament?.id === tournament.tournament.id
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        setSelectedTournament(tournament.tournament)
                      }
                    >
                      <div className="flex flex-row items-center gap-2">
                        <p>
                          {tournament.tournament.name}
                        </p>
                        -<p>{Number(tournament.tournament.id).toString()}</p>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
            {/* {selectedTournament && (
              <>
                <div className="w-full h-0.5 bg-brand/25" />
                <TournamentGames tournament={selectedTournament} />
              </>
            )} */}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Play;
