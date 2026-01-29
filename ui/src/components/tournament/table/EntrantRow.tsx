import { USER } from "@/components/Icons";
import { HoverCardContent } from "@/components/ui/hover-card";
import { HoverCard } from "@/components/ui/hover-card";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import { GameTokenData } from "metagame-sdk";
import { displayAddress, indexAddress } from "@/lib/utils";
import { Ban } from "lucide-react";

interface EntrantRowProps {
  game: GameTokenData;
  index: number;
  colIndex: number;
  currentPage: number;
  setSelectedPlayer: (player: any) => void;
  setIsMobileDialogOpen: (open: boolean) => void;
  usernames: Map<string, string> | undefined;
  registration?: any;
}

const EntrantRow = ({
  game,
  index,
  colIndex,
  currentPage,
  setSelectedPlayer,
  setIsMobileDialogOpen,
  usernames,
  registration,
}: EntrantRowProps) => {
  const isBanned = registration?.is_banned === 1 ? true : false;
  const renderPlayerDetails = (game: GameTokenData) => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-4">
        <div className="flex flex-row gap-2">
          <span className="text-brand-muted">Player Name:</span>
          <span>{game?.player_name}</span>
        </div>
        <div className="flex flex-row gap-2">
          <span className="text-brand-muted">Owner:</span>
          <span>
            {usernames?.get(indexAddress(game?.owner ?? "")) ||
              displayAddress(game?.owner ?? "")}
          </span>
        </div>
        {isBanned && (
          <div className="flex flex-row gap-2 items-center">
            <Ban className="w-4 h-4 text-destructive" />
            <span className="text-destructive font-medium">
              This entry has been banned
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div key={index}>
      <div className="hidden sm:block">
        <HoverCard openDelay={50} closeDelay={0}>
          <HoverCardTrigger asChild>
            <div className={`flex flex-row items-center sm:gap-2 px-2 hover:cursor-pointer hover:bg-brand/25 hover:border-brand/30 border border-transparent rounded transition-all duration-200 3xl:text-lg ${
              isBanned ? "opacity-60" : ""
            }`}>
              <span className="w-4 flex-none font-brand">
                {index + 1 + colIndex * 5 + currentPage * 10}.
              </span>
              <span className="w-6 3xl:w-8 flex-none">
                <USER />
              </span>
              <span className="flex-none max-w-20 group-hover:text-brand transition-colors duration-200">
                {game?.player_name}
              </span>
              {isBanned && (
                <Ban className="w-3 h-3 3xl:w-4 3xl:h-4 text-destructive flex-shrink-0" />
              )}
            </div>
          </HoverCardTrigger>
          <HoverCardContent
            className="py-4 px-0 text-sm z-50"
            align="center"
            side="top"
          >
            {renderPlayerDetails(game)}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Mobile clickable row (hidden on desktop) */}
      <div
        className={`sm:hidden flex flex-row items-center sm:gap-2 hover:cursor-pointer hover:bg-brand/25 hover:border-brand/30 border border-transparent rounded transition-all duration-200 ${
          isBanned ? "opacity-60" : ""
        }`}
        onClick={() => {
          setSelectedPlayer({ game, index, registration });
          setIsMobileDialogOpen(true);
        }}
      >
        <span className="w-4 flex-none font-brand">
          {index + 1 + colIndex * 5 + (currentPage - 1) * 10}.
        </span>
        <span className="w-6 flex-none">
          <USER />
        </span>
        <span className="flex-none max-w-20 3xl:max-w-44 group-hover:text-brand transition-colors duration-200">
          {game?.player_name}
        </span>
        {isBanned && (
          <Ban className="w-3 h-3 text-destructive flex-shrink-0" />
        )}
      </div>
    </div>
  );
};

export default EntrantRow;
