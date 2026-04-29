import { VERIFIED, EXTERNAL_LINK } from "@/components/Icons";
import GameIcon from "@/components/icons/GameIcon";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { GameData } from "@/hooks/useUIStore";
import { useChainConfig } from "@/context/chain";
import { cn } from "@/lib/utils";

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
  const { selectedChainConfig } = useChainConfig();
  const isDisabled = !game.existsInMetadata || game.disabled;
  const comingSoon = game.isWhitelisted && !game.existsInMetadata;
  const whitelisted = game.isWhitelisted && game.existsInMetadata;
  const isActive = gameFilters.includes(game.contract_address);

  const handleClick = () => {
    if (isDisabled) return;
    if (isActive) {
      setGameFilters(
        gameFilters.filter((f) => f !== game.contract_address),
      );
    } else {
      setGameFilters([...gameFilters, game.contract_address]);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          onClick={handleClick}
          className={cn(
            "group relative inline-flex items-center gap-2.5 h-10 w-full rounded-md border px-2.5 text-left transition-colors",
            isActive
              ? "bg-brand/15 border-brand/45 text-brand"
              : "bg-brand/[0.04] border-brand/15 text-brand-muted hover:text-brand hover:bg-brand/10 hover:border-brand/30",
            isDisabled && "opacity-50 cursor-not-allowed",
            comingSoon && "opacity-60",
          )}
        >
          <GameIcon image={game.image} size={5} />
          <span className="font-medium text-sm truncate flex-1">
            {game.name}
          </span>
          {comingSoon && (
            <span className="text-[10px] uppercase tracking-wider text-brand-muted/70 flex-shrink-0">
              Soon
            </span>
          )}
          {whitelisted && (
            <span className="w-4 h-4 text-brand/70 flex-shrink-0">
              <VERIFIED />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <a
          href={`${selectedChainConfig.blockExplorerUrl}/contract/${game.contract_address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-mono text-xs hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {game.contract_address.slice(0, 6)}...
          {game.contract_address.slice(-4)}
          <span className="w-3 h-3">
            <EXTERNAL_LINK />
          </span>
        </a>
      </TooltipContent>
    </Tooltip>
  );
};
