import { TROPHY } from "@/components/Icons";
// import { Button } from "@/components/ui/button";
// import { useNavigate } from "react-router-dom";
import useUIStore from "@/hooks/useUIStore";

interface EmptyResultsProps {
  gameFilters: string[];
}

const EmptyResults = ({ gameFilters }: EmptyResultsProps) => {
  // const navigate = useNavigate();
  const { getGameName } = useUIStore();
  return (
    <div className="col-span-3 flex flex-col items-center justify-center gap-6 py-20">
      <div className="flex flex-col items-center gap-4">
        <span className="text-brand-muted opacity-50 w-20 h-20">
          <TROPHY />
        </span>
        <h3 className="text-2xl font-brand text-center">
          No Tournaments Found
        </h3>
        <p className="text-brand-muted text-center max-w-md">
          {gameFilters.length > 0
            ? `No tournaments currently available for ${gameFilters
                .map((f) => getGameName(f))
                .join(", ")}.`
            : "No tournaments currently available."}
        </p>
      </div>

      {/* <Button
        onClick={() => navigate("/create-tournament")}
        className="flex items-center gap-2"
      >
        <TROPHY_LINE />
        Create Tournament
      </Button> */}
    </div>
  );
};

export default EmptyResults;
