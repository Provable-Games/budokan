import { USER, VERIFIED } from "@/components/Icons";
import { HoverCardContent } from "@/components/ui/hover-card";
import { HoverCard } from "@/components/ui/hover-card";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import { PlayerDetails } from "@/components/tournament/table/PlayerCard";
import { GameTokenData } from "metagame-sdk";
import { displayAddress } from "@/lib/utils";
import { indexAddress } from "@/lib/utils";
import { Ban } from "lucide-react";

interface ScoreRowProps {
  index: number;
  colIndex: number;
  currentPage: number;
  game: GameTokenData; // Assuming game is an object with relevant properties
  registration?: any;
  usernames: Map<string, string> | undefined;
  isEnded: boolean;
  setSelectedPlayer: (player: any) => void;
  setIsMobileDialogOpen: (open: boolean) => void;
}

const ScoreRow = ({
  index,
  colIndex,
  currentPage,
  game,
  registration,
  usernames,
  isEnded,
  setSelectedPlayer,
  setIsMobileDialogOpen,
}: ScoreRowProps) => {
  const playerName = game.player_name;
  const score = game.score;
  const ownerAddress = game.owner;

  const hasSubmitted = registration?.has_submitted === 1 ? true : false;
  const isBanned = registration?.is_banned === 1 ? true : false;

  //TODO: revert after devconnect
  const username =
    usernames?.get(indexAddress(ownerAddress ?? "0x0") ?? "0x0") ||
    displayAddress(ownerAddress ?? "0x0");

  return (
    <div key={index}>
      {/* Desktop hover card (hidden on mobile) */}
      <div className="hidden sm:block">
        <HoverCard openDelay={50} closeDelay={0}>
          <HoverCardTrigger asChild>
            <div
              className={`flex flex-row items-center sm:gap-1 xl:gap-2 px-2 hover:cursor-pointer hover:bg-brand/25 hover:border-brand/30 border border-transparent rounded transition-all duration-200 3xl:text-lg relative ${
                hasSubmitted ? "pr-4" : ""
              } ${isBanned ? "opacity-60" : ""}`}
            >
              <span className="w-4 flex-none font-brand">
                {index + 1 + colIndex * 5 + currentPage * 10}.
              </span>
              <span className="w-6 3xl:w-8 flex-none">
                <USER />
              </span>
              <span className="flex-none lg:max-w-20 xl:max-w-24 2xl:max-w-28 3xl:max-w-44 group-hover:text-brand transition-colors duration-200 text-ellipsis overflow-hidden whitespace-nowrap">
                {username}
              </span>
              {isBanned && (
                <Ban className="w-3 h-3 3xl:w-4 3xl:h-4 text-destructive flex-shrink-0" />
              )}
              <p
                className="flex-1 h-[2px] bg-repeat-x"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, currentColor 1px, transparent 1px)",
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 center",
                }}
              ></p>
              <div className="flex flex-row items-center gap-2">
                <span className="flex-none text-brand font-brand">{score}</span>
              </div>
              {hasSubmitted && (
                <span className="absolute -right-2 top-1/2 transform -translate-y-1/2 w-5 h-5">
                  <VERIFIED />
                </span>
              )}
            </div>
          </HoverCardTrigger>
          <HoverCardContent
            className="py-4 px-0 text-sm z-50"
            align="center"
            side="top"
          >
            <PlayerDetails
              playerName={game.player_name ?? "Unknown Player"}
              username={username}
              metadata={game.metadata}
              isEnded={isEnded}
              hasSubmitted={hasSubmitted}
              isBanned={isBanned}
            />
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Mobile clickable row (hidden on desktop) */}
      <div
        className={`sm:hidden flex flex-row items-center sm:gap-2 hover:cursor-pointer hover:bg-brand/25 hover:border-brand/30 border border-transparent rounded transition-all duration-200 ${
          isBanned ? "opacity-60" : ""
        }`}
        onClick={() => {
          setSelectedPlayer({
            game,
            index: index + colIndex * 5,
            registration,
          });
          setIsMobileDialogOpen(true);
        }}
      >
        <span className="w-4 flex-none font-brand">
          {index + 1 + colIndex * 5 + currentPage * 10}.
        </span>
        <span className="w-6 flex-none">
          <USER />
        </span>
        <span className="flex-none max-w-16 group-hover:text-brand transition-colors duration-200 text-ellipsis overflow-hidden whitespace-nowrap">
          {playerName}
        </span>
        {isBanned && (
          <Ban className="w-3 h-3 text-destructive flex-shrink-0" />
        )}
        <p
          className="flex-1 h-[2px] bg-repeat-x"
          style={{
            backgroundImage:
              "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 center",
          }}
        ></p>
        <div className="flex flex-row items-center gap-2">
          <span className="flex-none text-brand font-brand">{score}</span>
        </div>
      </div>
    </div>
  );
};

export default ScoreRow;
