import { Ban as BanIcon } from "lucide-react";
import { BigNumberish } from "starknet";
import { useTokenRank } from "@provable-games/denshokan-sdk/react";
import { Button } from "@/components/ui/button";
import { getPlayUrl } from "@/assets/games";
import useUIStore from "@/hooks/useUIStore";
import { cn, formatScore, getOrdinalSuffix, padAddress } from "@/lib/utils";
import { GameTokenData } from "@/lib/types";
import type { Tournament } from "@provable-games/budokan-sdk";
import type { PositionPrizeDisplay } from "@/components/tournament/EntrantsTable";

interface EntryCardProps {
  gameAddress: string;
  game: GameTokenData;
  tournamentModel: Tournament;
  tournamentId: BigNumberish;
  tournamentAddress: string;
  registration: any;
  isStarted: boolean;
  isEnded: boolean;
  prizesByPosition?: Map<number, PositionPrizeDisplay>;
  /** Used when `game.playerName` is missing (e.g. brand-new entry not yet
   *  indexed by denshokan). Typically the controller username or address. */
  fallbackName?: string;
}

const formatUSDCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
};

const EntryCard = ({
  gameAddress,
  game,
  tournamentModel: _tournamentModel,
  tournamentId,
  tournamentAddress,
  registration,
  isStarted,
  isEnded,
  prizesByPosition,
  fallbackName,
}: EntryCardProps) => {
  const { getGameName } = useUIStore();
  const gameOver = !!game?.gameOver;
  const isActive = isStarted && !isEnded;
  const entryNumber = registration?.entryNumber;
  const isBanned = !!registration?.isBanned;

  const gameName = getGameName(gameAddress);
  const playUrl = getPlayUrl(gameAddress, gameName);

  // Fetch this token's rank within the tournament's leaderboard.
  // Only meaningful once the tournament is live (scores exist).
  const { data: tokenRank } = useTokenRank(
    isStarted && !isBanned ? game.tokenId?.toString() : undefined,
    {
      contextId: Number(tournamentId),
      minterAddress: padAddress(tournamentAddress),
      live: isStarted && !isEnded,
    },
  );

  if (!entryNumber) return null;

  // Prize the entry is currently in line for at its rank
  const prizeAtRank =
    isStarted && !isBanned && tokenRank && prizesByPosition
      ? prizesByPosition.get(tokenRank.rank)
      : undefined;

  const borderClass = isBanned
    ? "border-destructive/40 bg-destructive/5"
    : gameOver
      ? "border-success/40 bg-success/5"
      : isActive
        ? "border-brand/30 bg-brand/5"
        : "border-brand-muted/30 bg-brand-muted/5";

  const statusLabel = isBanned
    ? "Banned"
    : gameOver
      ? "Done"
      : isActive
        ? "Active"
        : isEnded
          ? "Ended"
          : "Not Started";

  const statusColor = isBanned
    ? "text-destructive"
    : gameOver
      ? "text-success"
      : isActive
        ? "text-brand"
        : "text-brand-muted";

  return (
    <div
      className={cn(
        "relative min-w-[110px] w-[110px] rounded border p-2 flex flex-col items-center gap-1 flex-shrink-0 group",
        borderClass,
      )}
    >
      <div className="flex flex-row items-center justify-between w-full">
        <span className="font-brand text-[10px] text-brand-muted">
          #{Number(entryNumber)}
        </span>
        {isStarted && tokenRank && (
          <span className="font-brand text-[10px] text-brand">
            {tokenRank.rank}
            {getOrdinalSuffix(tokenRank.rank)}
          </span>
        )}
        {isBanned && <BanIcon className="w-3 h-3 text-destructive" />}
      </div>

      <span className="text-xs text-neutral truncate max-w-full">
        {game.playerName || fallbackName || "Unnamed"}
      </span>

      {isStarted && (
        <span className="font-brand text-base text-brand">
          {formatScore(Number(game.score ?? 0))}
        </span>
      )}

      {prizeAtRank && (
        <div className="flex flex-row items-center gap-1">
          {prizeAtRank.tokenLogo && (
            <img
              src={prizeAtRank.tokenLogo}
              alt=""
              className="w-3 h-3 rounded-full"
            />
          )}
          {prizeAtRank.usd != null ? (
            <span className="font-brand font-bold text-[11px] text-brand">
              {formatUSDCompact(prizeAtRank.usd)}
            </span>
          ) : (
            <span className="font-brand text-[11px] text-brand-muted">
              {prizeAtRank.tokenAmountDisplay ??
                prizeAtRank.tokenSymbol ??
                "?"}
            </span>
          )}
        </div>
      )}

      <span
        className={cn(
          "text-[10px] uppercase tracking-wider font-semibold",
          statusColor,
        )}
      >
        {statusLabel}
      </span>

      {isActive && !gameOver && !isBanned && playUrl && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/70 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded">
          <Button
            size="sm"
            onClick={() => {
              const tokenId = game.tokenId?.toString() ?? "0";
              const hexTokenId = tokenId.startsWith("0x")
                ? tokenId
                : "0x" + BigInt(tokenId).toString(16);
              const url = playUrl.includes("{tokenId}")
                ? playUrl.replace("{tokenId}", hexTokenId)
                : `${playUrl}${hexTokenId}`;
              window.open(url, "_blank");
            }}
          >
            PLAY
          </Button>
        </div>
      )}
    </div>
  );
};

export default EntryCard;
