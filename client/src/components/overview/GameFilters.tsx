import useUIStore from "@/hooks/useUIStore";
import { Skeleton } from "@/components/ui/skeleton";
import { GameButton } from "@/components/overview/gameFilters/GameButton";

const GameFilters = () => {
  const { gameFilters, setGameFilters, gameData, gameDataLoading } =
    useUIStore();

  return (
    <div className="hidden sm:flex flex-col gap-4 w-1/5 overflow-y-auto max-h-screen pr-2">
      {!gameDataLoading ? (
        gameData?.map((game) => (
          <GameButton
            key={game.contract_address}
            game={game}
            gameFilters={gameFilters}
            setGameFilters={setGameFilters}
          />
        ))
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 })?.map((_, index) => (
            <Skeleton key={index} className="h-12 3xl:h-20 w-full" />
          ))}
        </div>
      )}
    </div>
  );
};

export default GameFilters;
