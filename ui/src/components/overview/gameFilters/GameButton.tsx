import { VERIFIED } from "@/components/Icons";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { Button } from "@/components/ui/button";
import { GameData } from "@/hooks/useUIStore";

interface GameButtonProps {
  game: GameData;
  gameFilters: string[];
  setGameFilters: (filters: string[]) => void;
}

export const GameButton = ({
  game,
  gameFilters,
  setGameFilters,
}: GameButtonProps) => {
  const isDisabled = !game.existsInMetadata || game.disabled;
  const comingSoon = game.isWhitelisted && !game.existsInMetadata;
  const whitelisted = game.isWhitelisted && game.existsInMetadata;
  return (
    <div className="relative w-full max-w-80">
      <Button
        size={"xl"}
        variant="outline"
        className={`text-lg px-2 xl:px-4 xl:text-xl 2xl:text-2xl font-brand w-full ${
          gameFilters.includes(game.contract_address) ? "bg-brand/25" : ""
        } ${comingSoon ? "opacity-50" : ""}`}
        onClick={() => {
          if (gameFilters.includes(game.contract_address)) {
            // Remove the key if it exists
            setGameFilters(
              gameFilters.filter((filter) => filter !== game.contract_address)
            );
          } else {
            // Add the key if it doesn't exist
            setGameFilters([...gameFilters, game.contract_address]);
          }
        }}
        disabled={isDisabled}
      >
        <TokenGameIcon image={game.image} />
        <span className="truncate">{game.name}</span>
      </Button>
      {comingSoon && (
        <div className="absolute top-1 right-2 flex items-center justify-center rounded-md">
          <span className="text-sm font-brand uppercase">Coming Soon</span>
        </div>
      )}
      {whitelisted && (
        <div className="absolute top-1 right-2 flex items-center justify-center rounded-md">
          <span className="w-6">
            <VERIFIED />
          </span>
        </div>
      )}
    </div>
  );
};
