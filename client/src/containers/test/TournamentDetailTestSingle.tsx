import { useParams } from "react-router-dom";
import TournamentScenarioView from "./TournamentScenarioView";
import NotFound from "@/containers/NotFound";
import { scenariosById } from "./tournamentScenarios";

export default function TournamentDetailTestSingle() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const scenario = scenarioId ? scenariosById[scenarioId] : undefined;

  if (!scenario) {
    return <NotFound message={`Test scenario "${scenarioId}" not found`} />;
  }

  return (
    <div className="overflow-y-auto h-full py-4">
      <TournamentScenarioView scenario={scenario} />
    </div>
  );
}
