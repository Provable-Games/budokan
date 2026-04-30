import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ExternalLink, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import EntryRequirements from "@/components/tournament/EntryRequirements";
import {
  ARROW_LEFT,
  TROPHY,
  MONEY,
  GIFT,
  SPACE_INVADER_SOLID,
  QUESTION,
} from "@/components/Icons";
import { cn } from "@/lib/utils";
import type { Tournament } from "@provable-games/budokan-sdk";

type TournamentStatus =
  | "upcoming"
  | "registration"
  | "preparation"
  | "live"
  | "submission"
  | "finalized";

interface HeroToken {
  symbol: string;
  logoUrl?: string;
}

interface TournamentDetailHeaderProps {
  tournamentModel: Tournament;
  name: string;
  status: TournamentStatus;
  gameAddress?: string;
  gameName?: string;
  gameImage?: string;
  creatorAddress: string | null;
  creatorUsername?: string;
  blockExplorerUrl?: string;
  totalPrizeUsd: number;
  uniquePrizeTokens: HeroToken[];
  paidPlaces: number;
  tournamentsData: Tournament[];
  isStarted: boolean;
  isEnded: boolean;
  isSubmitted: boolean;
  isInPreparationPeriod: boolean;
  registrationType: "open" | "fixed";
  allSubmitted: boolean;
  allClaimed: boolean;
  claimablePrizesCount: number;
  onBack: () => void;
  onSettings: () => void;
  onAddPrizes: () => void;
  onEnter: () => void;
  onSubmitScores: () => void;
  onClaim: () => void;
  timelineSlot?: React.ReactNode;
}

function ExplorerLink({
  address,
  blockExplorerUrl,
  ariaLabel,
}: {
  address: string;
  blockExplorerUrl?: string;
  ariaLabel: string;
}) {
  if (!blockExplorerUrl) return null;
  return (
    <a
      href={`${blockExplorerUrl}/contract/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-brand-muted hover:text-brand transition-colors"
      aria-label={ariaLabel}
    >
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

const STATUS_STYLES: Record<
  TournamentStatus,
  { label: string; className: string }
> = {
  upcoming: {
    label: "Upcoming",
    className: "bg-neutral/10 text-neutral border-neutral/30",
  },
  registration: {
    label: "Registration",
    className: "bg-brand/10 text-brand border-brand/30",
  },
  preparation: {
    label: "Preparation",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  live: {
    label: "Live",
    className: "bg-success/15 text-success border-success/40",
  },
  submission: {
    label: "Submission",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  finalized: {
    label: "Finalized",
    className: "bg-brand-muted/15 text-brand-muted border-brand-muted/30",
  },
};

const formatUSDCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
};

const TournamentDetailHeader = ({
  tournamentModel,
  name,
  status,
  gameAddress,
  gameName,
  gameImage,
  creatorAddress,
  creatorUsername,
  blockExplorerUrl,
  totalPrizeUsd,
  uniquePrizeTokens,
  paidPlaces,
  tournamentsData,
  isStarted,
  isEnded,
  isSubmitted,
  isInPreparationPeriod,
  registrationType,
  allSubmitted,
  allClaimed,
  claimablePrizesCount,
  onBack,
  onSettings,
  onAddPrizes,
  onEnter,
  onSubmitScores,
  onClaim,
  timelineSlot,
}: TournamentDetailHeaderProps) => {
  const navigate = useNavigate();
  const [timelineDialogOpen, setTimelineDialogOpen] = useState(false);

  const shortContract = gameAddress
    ? `${gameAddress.slice(0, 6)}…${gameAddress.slice(-4)}`
    : null;
  const shortCreator = creatorAddress
    ? `${creatorAddress.slice(0, 6)}…${creatorAddress.slice(-4)}`
    : null;

  const canEnter =
    (registrationType === "fixed" && !isStarted && !isInPreparationPeriod) ||
    (registrationType === "open" && !isEnded);

  const statusStyle = STATUS_STYLES[status];
  const hasPrize = totalPrizeUsd > 0;
  const shownTokens = uniquePrizeTokens.slice(0, 4);
  const extraTokens = Math.max(0, uniquePrizeTokens.length - shownTokens.length);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
      {/* Left cluster: back + game icon + tournament identity */}
      <div className="flex flex-row items-center gap-3 min-w-0 flex-1">
        <Button
          variant="outline"
          size="sm"
          className="px-2 flex-shrink-0"
          onClick={() => (onBack ? onBack() : navigate("/"))}
        >
          <ARROW_LEFT />
        </Button>

        <button
          className="flex-shrink-0 flex items-center justify-center cursor-pointer w-8 h-8 3xl:w-10 3xl:h-10 rounded-full overflow-hidden bg-black/40 border border-brand/20 text-brand/40"
          onClick={onSettings}
          aria-label="Game settings"
        >
          {gameImage ? (
            <img
              src={gameImage}
              alt={gameName ?? "Game logo"}
              width={32}
              height={32}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="w-2/3 h-2/3">
              <QUESTION />
            </span>
          )}
        </button>

        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex flex-row items-center gap-2 min-w-0">
            <span className="font-brand text-xl sm:text-2xl xl:text-3xl 3xl:text-4xl truncate leading-none">
              {name}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider flex-shrink-0",
                statusStyle.className,
              )}
            >
              {statusStyle.label}
            </span>
          </div>
          <div className="hidden sm:flex flex-row items-center gap-2 text-[10px] text-brand-muted font-mono min-w-0">
            {gameName && (
              <span className="text-brand/80 font-semibold truncate max-w-[140px]">
                {gameName}
              </span>
            )}
            {shortContract && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="uppercase tracking-wider opacity-60">
                  Contract
                </span>
                <span>{shortContract}</span>
                <ExplorerLink
                  address={gameAddress!}
                  blockExplorerUrl={blockExplorerUrl}
                  ariaLabel="View contract on explorer"
                />
              </div>
            )}
            {shortCreator && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="uppercase tracking-wider opacity-60">
                  Creator
                </span>
                <span>{creatorUsername ?? shortCreator}</span>
                <ExplorerLink
                  address={creatorAddress!}
                  blockExplorerUrl={blockExplorerUrl}
                  ariaLabel="View creator on explorer"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right cluster: prize pool + actions */}
      <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3 justify-center sm:justify-end w-full sm:w-auto sm:flex-shrink-0">
        {/* Prize pool */}
        <div className="flex flex-row items-center gap-2 md:pr-2 md:border-r md:border-brand/15">
          <span
            className={cn(
              "w-5 h-5 md:w-6 md:h-6 transition-opacity flex-shrink-0",
              hasPrize ? "text-brand opacity-80" : "text-brand-muted opacity-30",
            )}
          >
            <TROPHY />
          </span>
          {hasPrize && shownTokens.length > 0 && (
            <div className="hidden sm:flex flex-row items-center">
              {shownTokens.map((token, i) =>
                token.logoUrl ? (
                  <img
                    key={`${token.symbol}-${i}`}
                    src={token.logoUrl}
                    alt={token.symbol}
                    className="w-7 h-7 md:w-8 md:h-8 rounded-full border-2 border-black bg-black/40"
                    style={{ marginLeft: i === 0 ? 0 : -10 }}
                  />
                ) : (
                  <div
                    key={`${token.symbol}-${i}`}
                    className="w-7 h-7 md:w-8 md:h-8 rounded-full border-2 border-black bg-brand-muted/20 flex items-center justify-center text-[10px] font-bold text-brand"
                    style={{ marginLeft: i === 0 ? 0 : -10 }}
                  >
                    {token.symbol.slice(0, 2)}
                  </div>
                ),
              )}
              {extraTokens > 0 && (
                <div
                  className="w-7 h-7 md:w-8 md:h-8 rounded-full border-2 border-black bg-neutral/20 flex items-center justify-center text-[11px] font-bold text-neutral"
                  style={{ marginLeft: -10 }}
                >
                  +{extraTokens}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col items-end leading-none">
            <span
              className={cn(
                "font-brand font-extrabold tracking-tight leading-none text-base md:text-lg xl:text-xl",
                hasPrize ? "text-brand" : "text-brand-muted/50 text-xs md:text-sm",
              )}
            >
              {hasPrize ? formatUSDCompact(totalPrizeUsd) : "No Prize"}
            </span>
            {paidPlaces > 0 && (
              <span className="hidden md:block mt-0.5 text-[9px] uppercase tracking-wider text-brand-muted">
                {paidPlaces} paid {paidPlaces === 1 ? "place" : "places"}
              </span>
            )}
          </div>
        </div>

        {timelineSlot && (
          <button
            onClick={() => setTimelineDialogOpen(true)}
            aria-label="View tournament timeline"
            className="flex items-center justify-center h-9 w-9 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        )}

        <EntryRequirements
          tournamentModel={tournamentModel}
          tournamentsData={tournamentsData}
        />

        {!isEnded && (
          <Button variant="outline" size="sm" onClick={onAddPrizes}>
            <GIFT />
            <span className="hidden sm:block">Add Prizes</span>
          </Button>
        )}

        {canEnter ? (
          <Button
            size="sm"
            className="uppercase [&_svg]:w-5 [&_svg]:h-5 overflow-visible whitespace-nowrap"
            onClick={onEnter}
          >
            <span className="hidden sm:block flex-shrink-0">
              <SPACE_INVADER_SOLID />
            </span>
            <span className="flex-shrink-0">Enter</span>
          </Button>
        ) : isEnded && !isSubmitted ? (
          <Button
            size="sm"
            className="uppercase"
            onClick={onSubmitScores}
            disabled={allSubmitted}
          >
            <TROPHY />
            {allSubmitted ? "Submitted" : "Submit Scores"}
          </Button>
        ) : isSubmitted ? (
          <Button
            size="sm"
            className="uppercase"
            onClick={onClaim}
            disabled={allClaimed || claimablePrizesCount === 0}
          >
            <MONEY />
            {allClaimed ? (
              <span className="hidden sm:block">Claimed</span>
            ) : claimablePrizesCount === 0 ? (
              <span className="hidden sm:block">No Prizes</span>
            ) : (
              <>
                <span className="hidden sm:block">Send |</span>
                <span className="font-bold">{claimablePrizesCount}</span>
              </>
            )}
          </Button>
        ) : null}
      </div>

      {timelineSlot && (
        <Dialog open={timelineDialogOpen} onOpenChange={setTimelineDialogOpen}>
          <DialogContent className="bg-black border border-brand p-6 rounded-lg max-w-[95vw] overflow-x-auto">
            <DialogTitle className="font-brand text-lg text-brand">
              Tournament Timeline
            </DialogTitle>
            <div className="pt-2">{timelineSlot}</div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default TournamentDetailHeader;

export type { TournamentStatus, HeroToken };
