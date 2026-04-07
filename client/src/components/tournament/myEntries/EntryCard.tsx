import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { HoverCardTrigger } from "@/components/ui/hover-card";
import { Card } from "@/components/ui/card";
import { HoverCard } from "@/components/ui/hover-card";
import { INFO } from "@/components/Icons";
import EntryInfo from "@/components/tournament/myEntries/EntryInfo";
import { formatScore } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getPlayUrl } from "@/assets/games";
import { TooltipContent } from "@/components/ui/tooltip";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { Tooltip } from "@/components/ui/tooltip";
import useUIStore from "@/hooks/useUIStore";
import { GameTokenData } from "@/lib/types";
import type { Tournament } from "@provable-games/budokan-sdk";

interface EntryCardProps {
  gameAddress: string;
  game: GameTokenData;
  tournamentModel: Tournament;
  registration: any;
  isStarted: boolean;
  isEnded: boolean;
}

const EntryCard = ({
  gameAddress,
  game,
  tournamentModel,
  registration,
  isStarted,
  isEnded,
}: EntryCardProps) => {
  const { getGameImage, getGameName } = useUIStore();
  const gameOver = game?.gameOver;

  const isActive = isStarted && !isEnded;

  const playUrl = getPlayUrl(gameAddress);

  const gameName = getGameName(gameAddress);
  const gameImage = getGameImage(gameAddress);

  const entryNumber = registration?.entryNumber;
  const isBanned = !!registration?.isBanned;

  if (!entryNumber) {
    return null;
  }

  return (
    <Card
      variant="outline"
      className={`flex-none flex flex-col items-center justify-between h-full w-[100px] 3xl:w-[120px] p-1 relative group ${
        isBanned ? "opacity-60 border-destructive" : ""
      }`}
    >
      {isBanned && (
        <div className="absolute inset-0 bg-destructive/10 pointer-events-none z-10 rounded-md" />
      )}
      <div className="flex flex-col items-center justify-between w-full h-full pt-2">
        <Tooltip delayDuration={50}>
          <TooltipTrigger asChild>
            <span className="hover:cursor-pointer">
              <TokenGameIcon image={gameImage} size={"sm"} />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="center"
            className="max-w-[300px] break-words"
          >
            <p className="text-sm font-medium">{gameName}</p>
          </TooltipContent>
        </Tooltip>
        <div className="absolute top-1 left-1 text-xs 3xl:text-sm z-20">
          #{Number(entryNumber)}
        </div>
        {isBanned && (
          <div className="absolute top-6 right-1 bg-destructive text-white text-[8px] px-1 py-0.5 rounded z-20 font-bold">
            BANNED
          </div>
        )}
        <HoverCard openDelay={50} closeDelay={0}>
          <HoverCardTrigger asChild>
            <div
              className={`absolute top-0 right-0 text-brand-muted hover:cursor-pointer w-5 h-5 z-20 ${
                isBanned ? "opacity-100" : ""
              }`}
            >
              <INFO />
            </div>
          </HoverCardTrigger>
          <EntryInfo
            entryNumber={entryNumber.toString()}
            tokenId={game.tokenId?.toString() ?? ""}
            tournamentModel={tournamentModel}
          />
        </HoverCard>
        <Tooltip delayDuration={50}>
          <TooltipTrigger asChild>
            <p className="text-xs truncate text-brand-muted w-full text-center cursor-pointer">
              {game.playerName}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="center"
            className="max-w-[300px] break-words"
          >
            <p className="text-sm font-medium">{game.playerName ?? ""}</p>
          </TooltipContent>
        </Tooltip>
        {isActive && !gameOver && !isBanned && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Button
              size="sm"
              onClick={() => {
                const tokenId = game.tokenId?.toString() ?? "0";
                const url = playUrl.includes("{tokenId}")
                  ? playUrl.replace("{tokenId}", tokenId.startsWith("0x") ? tokenId : "0x" + BigInt(tokenId).toString(16))
                  : `${playUrl}${Number(tokenId)}`;
                window.open(url, "_blank");
              }}
            >
              PLAY
            </Button>
          </div>
        )}
        {isStarted && (
          <div className="flex flex-row items-center justify-center gap-1 w-full px-0.5">
            <span className="text-[10px] text-neutral">Score:</span>
            <span>{formatScore(Number(game.score))}</span>
          </div>
        )}
        <div className="flex flex-row items-center justify-center w-full px-2">
          {gameOver ? (
            <>
              <p className="text-xs 3xl:text-sm text-destructive">Game Over</p>
            </>
          ) : isActive ? (
            <>
              <p className="text-xs 3xl:text-sm text-success">Active</p>
            </>
          ) : isEnded ? (
            <p className="text-xs 3xl:text-sm text-warning">Ended</p>
          ) : (
            <p className="text-xs 3xl:text-sm text-warning">Not Started</p>
          )}
        </div>
      </div>
    </Card>
  );
};

export default EntryCard;
