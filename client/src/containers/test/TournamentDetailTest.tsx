import TournamentScenarioView from "./TournamentScenarioView";
import { scenarios } from "./tournamentScenarios";

export default function TournamentDetailTest() {
  return (
    <div className="overflow-y-auto h-full">
      <div className="flex flex-col gap-16 py-6">
        {scenarios.map((s) => (
          <TournamentScenarioView key={s.id} scenario={s} />
        ))}
      </div>
    </div>
  );
}
