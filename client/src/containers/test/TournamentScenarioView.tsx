/**
 * Renders a full Tournament detail layout using scenario fixture data.
 *
 * Reuses the real presentation components (Header, Hero, Info, Timeline,
 * Description) and inlines a mock entrants table + mock My Entries strip so
 * we don't touch any SDK hooks.
 */

import { useState } from "react";
import TournamentTimeline from "@/components/TournamentTimeline";
import TournamentDetailHeader from "@/components/tournament-detail/TournamentDetailHeader";
import TournamentDetailInfo from "@/components/tournament-detail/TournamentDetailInfo";
import TournamentDescription from "@/components/tournament-detail/TournamentDescription";
import type { PositionPrizeDisplay } from "@/components/tournament-detail/EntrantsTable";
import type { Tournament } from "@provable-games/budokan-sdk";

import { USER, REFRESH, VERIFIED, TROPHY } from "@/components/Icons";
import {
  Ban as BanIcon,
  TableProperties,
  Info,
  ChevronDown,
} from "lucide-react";
import { cn, getOrdinalSuffix } from "@/lib/utils";

import type { ScenarioData, MockEntrant, MockMyEntry } from "./tournamentScenarios";

interface Props {
  scenario: ScenarioData;
}

const formatUSDCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
};

const positionLabel = (pos0: number) => {
  if (pos0 === 0) return "🥇";
  if (pos0 === 1) return "🥈";
  if (pos0 === 2) return "🥉";
  const pos = pos0 + 1;
  return `${pos}${getOrdinalSuffix(pos)}`;
};

const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`;

/* ------------------------------------------------------------------ */
/*  Mock entrants table                                                */
/* ------------------------------------------------------------------ */
function MockEntrantsTable({
  entrants,
  prizesByPosition,
  isStarted,
}: {
  entrants: MockEntrant[];
  prizesByPosition: Map<number, PositionPrizeDisplay>;
  isStarted: boolean;
}) {
  const displayCount = Math.max(10, entrants.length);
  const rows = Array.from({ length: Math.min(displayCount, 10) });

  return (
    <div className="flex flex-col gap-2 border border-brand/20 rounded-lg bg-black/30 p-3">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-row items-baseline gap-2">
          <h3 className="font-brand text-base text-brand">
            {isStarted ? "Scores" : "Entrants"}
          </h3>
          {entrants.length > 0 && (
            <span className="text-xs text-brand-muted">({entrants.length})</span>
          )}
        </div>
        <div className="flex flex-row items-center gap-1.5 opacity-70">
          <button
            disabled
            className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand"
          >
            <REFRESH className="h-4 w-4" />
          </button>
          <button
            disabled
            className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand"
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            disabled
            className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand"
          >
            <TableProperties className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-brand/10">
        <div className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-brand-muted/70">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">{isStarted ? "Score" : "Status"}</span>
          <span className="text-right min-w-[60px]">Prize</span>
        </div>

        {entrants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-1">
            <span className="text-sm text-brand-muted/60 font-semibold">
              No entrants yet
            </span>
            <span className="text-xs text-brand-muted/40">
              Be the first to enter this tournament
            </span>
          </div>
        ) : (
          rows.map((_, i) => {
            const entrant = entrants[i];
            const prize = prizesByPosition.get(i + 1);
            const isTopThree = i < 3;

            if (!entrant) {
              return (
                <div
                  key={`empty-${i}`}
                  className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 opacity-30"
                >
                  <span className="text-xs text-brand-muted font-brand">
                    {positionLabel(i)}
                  </span>
                  <span className="text-xs text-brand-muted">—</span>
                  <span className="text-xs text-right text-brand-muted">
                    —
                  </span>
                  <PrizeCell prize={prize} />
                </div>
              );
            }

            const displayName = entrant.playerName || truncateAddress(entrant.owner);
            const { isBanned, hasSubmitted, gameOver, score } = entrant;

            return (
              <div
                key={entrant.tokenId}
                className={cn(
                  "grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 rounded border border-transparent",
                  isBanned && "opacity-60",
                  isTopThree && "bg-brand/[0.03]",
                )}
              >
                <span
                  className={cn(
                    "font-brand text-sm",
                    isTopThree ? "text-brand" : "text-brand-muted",
                  )}
                >
                  {positionLabel(i)}
                </span>
                <div className="flex flex-row items-center gap-1.5 min-w-0">
                  <span className="w-5 h-5 flex-shrink-0 text-brand-muted">
                    <USER />
                  </span>
                  <span
                    className={cn(
                      "text-xs truncate",
                      isBanned ? "text-destructive/70" : "text-neutral",
                    )}
                  >
                    {displayName}
                  </span>
                  {isBanned && (
                    <BanIcon className="w-3 h-3 text-destructive flex-shrink-0" />
                  )}
                  {hasSubmitted && (
                    <span className="w-4 h-4 flex-shrink-0 text-success">
                      <VERIFIED />
                    </span>
                  )}
                </div>
                <div className="flex flex-row items-center justify-end gap-1 min-w-[40px]">
                  {isStarted ? (
                    <span className="font-brand text-sm text-brand">
                      {score ?? 0}
                    </span>
                  ) : gameOver ? (
                    <span className="text-[10px] uppercase tracking-wider text-success">
                      Done
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-brand-muted/60">
                      Active
                    </span>
                  )}
                </div>
                <PrizeCell prize={prize} highlight={isTopThree} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const PrizeCell = ({
  prize,
  highlight,
}: {
  prize?: PositionPrizeDisplay;
  highlight?: boolean;
}) => {
  if (!prize) {
    return (
      <span className="text-xs text-brand-muted/30 text-right min-w-[60px]">
        —
      </span>
    );
  }
  return (
    <div className="flex flex-row items-center justify-end gap-1 min-w-[60px]">
      {prize.tokenLogo && (
        <img
          src={prize.tokenLogo}
          alt=""
          className="w-3.5 h-3.5 rounded-full flex-shrink-0"
        />
      )}
      {prize.usd != null ? (
        <span
          className={cn(
            "font-brand text-xs font-bold",
            highlight ? "text-brand" : "text-brand-muted",
          )}
        >
          {formatUSDCompact(prize.usd)}
        </span>
      ) : (
        <span className="font-brand text-xs text-brand-muted">
          {prize.tokenAmountDisplay ?? prize.tokenSymbol ?? "?"}
        </span>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Mock My Entries                                                    */
/* ------------------------------------------------------------------ */
function MockMyEntries({
  entries,
  isStarted,
  isEnded,
  prizesByPosition,
}: {
  entries: MockMyEntry[];
  isStarted: boolean;
  isEnded: boolean;
  prizesByPosition: Map<number, PositionPrizeDisplay>;
}) {
  const hasEntries = entries.length > 0;
  const bestRank = hasEntries
    ? entries
        .filter((e) => e.rank != null)
        .reduce<number | null>(
          (best, e) => (best == null ? e.rank! : Math.min(best, e.rank!)),
          null,
        )
    : null;

  return (
    <div className="flex flex-col gap-2 border border-brand/20 rounded-lg bg-black/30 p-3">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-row items-baseline gap-2">
          <h3 className="font-brand text-base text-brand">My Entries</h3>
          {hasEntries && (
            <span className="text-xs text-brand-muted">({entries.length})</span>
          )}
        </div>
        <div className="flex flex-row items-center gap-1.5 opacity-80">
          {bestRank != null && (
            <div className="flex flex-col items-center justify-center px-2 py-0.5 rounded-md border border-brand/10 bg-brand/5">
              <div className="flex flex-row items-center gap-1">
                <span className="w-3 h-3 text-brand opacity-70">
                  <TROPHY />
                </span>
                <span className="font-brand font-bold text-xs text-brand">
                  {bestRank}
                  {getOrdinalSuffix(bestRank)}
                </span>
              </div>
              <span className="text-[8px] uppercase tracking-wider text-brand-muted">
                Best Rank
              </span>
            </div>
          )}
          {hasEntries && (
            <>
              {/* Sort pill (static — design-only) */}
              <button
                disabled
                className="hidden sm:flex flex-row items-center gap-1.5 h-8 px-2.5 rounded-md border border-brand/30 bg-black text-brand"
              >
                <span className="text-[9px] uppercase tracking-wider text-brand-muted">
                  Sort
                </span>
                <span className="font-brand text-xs">
                  {isStarted ? "Score" : "Entry #"}
                </span>
                <ChevronDown className="h-3 w-3 text-brand-muted" />
              </button>
              <button
                disabled
                className="hidden sm:flex flex-row items-center gap-1.5 h-8 px-2.5 rounded-md border border-brand/30 bg-black text-brand"
              >
                <span className="text-[9px] uppercase tracking-wider text-brand-muted">
                  Show
                </span>
                <span className="font-brand text-xs">All</span>
                <ChevronDown className="h-3 w-3 text-brand-muted" />
              </button>
              <button
                disabled
                className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand"
              >
                <REFRESH className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {!hasEntries ? (
        <p className="text-xs text-brand-muted/60 italic py-3">
          You have no entries in this tournament.
        </p>
      ) : (
        <div className="flex flex-row gap-2 overflow-x-auto pb-1">
          {entries.map((entry) => {
            const isActive = isStarted && !isEnded;
            const borderClass = entry.gameOver
              ? "border-success/40 bg-success/5"
              : isActive
                ? "border-brand/30 bg-brand/5"
                : "border-brand-muted/30 bg-brand-muted/5";
            const statusLabel = entry.gameOver
              ? "Done"
              : isActive
                ? "Active"
                : isEnded
                  ? "Ended"
                  : "Not Started";
            const statusColor = entry.gameOver
              ? "text-success"
              : isActive
                ? "text-brand"
                : "text-brand-muted";

            const prizeAtRank =
              isStarted && entry.rank
                ? prizesByPosition.get(entry.rank)
                : undefined;

            return (
              <div
                key={entry.tokenId}
                className={cn(
                  "relative min-w-[110px] w-[110px] rounded border p-2 flex flex-col items-center gap-1 flex-shrink-0",
                  borderClass,
                )}
              >
                <div className="flex flex-row items-center justify-between w-full">
                  <span className="font-brand text-[10px] text-brand-muted">
                    #{entry.entryNumber}
                  </span>
                  {isStarted && entry.rank != null && (
                    <span className="font-brand text-[10px] text-brand">
                      {entry.rank}
                      {getOrdinalSuffix(entry.rank)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral truncate max-w-full">
                  {entry.playerName}
                </span>
                {isStarted && (
                  <span className="font-brand text-base text-brand">
                    {entry.score}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold",
                    statusColor,
                  )}
                >
                  {entry.hasSubmitted ? "Submitted" : statusLabel}
                </span>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scenario view                                                      */
/* ------------------------------------------------------------------ */
export default function TournamentScenarioView({ scenario }: Props) {
  const [, setSettingsDialogOpen] = useState(false);

  const prizesByPositionMap = new Map(scenario.prizesByPosition);

  // Derive countdown target from scenario phase flags
  const { countdownTarget, countdownLabel } = (() => {
    const t = scenario.timeline;
    if (scenario.isSubmitted)
      return { countdownTarget: null as number | null, countdownLabel: "" };
    if (scenario.isEnded)
      return {
        countdownTarget: t.startTime + t.duration + t.submissionPeriod,
        countdownLabel: "Submission Ends",
      };
    if (scenario.isStarted)
      return {
        countdownTarget: t.startTime + t.duration,
        countdownLabel: "Ends In",
      };
    if (scenario.isInPreparationPeriod)
      return {
        countdownTarget: t.startTime,
        countdownLabel: "Starts In",
      };
    if (
      scenario.registrationType === "fixed" &&
      t.registrationEndTime > Math.floor(Date.now() / 1000)
    )
      return {
        countdownTarget: t.registrationEndTime,
        countdownLabel: "Registration Ends",
      };
    return {
      countdownTarget: t.startTime,
      countdownLabel: "Starts In",
    };
  })();

  // Minimal Tournament-shaped object for Header's EntryRequirements + settings icon.
  // EntryRequirements returns null when entryRequirement is undefined.
  const tournamentModel = {
    id: scenario.id,
    name: scenario.name,
    gameAddress: scenario.gameAddress,
  } as unknown as Tournament;

  const headerActions = {
    onBack: () => {},
    onSettings: () => setSettingsDialogOpen((v) => !v),
    onAddPrizes: () => {},
    onEnter: () => {},
    onSubmitScores: () => {},
    onClaim: () => {},
  };

  return (
    <div className="lg:w-[87.5%] xl:w-5/6 2xl:w-3/4 sm:mx-auto flex flex-col gap-4">
      <TournamentDetailHeader
        tournamentModel={tournamentModel}
        name={scenario.name}
        status={scenario.status}
        gameAddress={scenario.gameAddress}
        gameName={scenario.gameName}
        gameImage={scenario.gameImage}
        creatorAddress={scenario.creatorAddress}
        creatorUsername={scenario.creatorUsername}
        blockExplorerUrl="https://voyager.online"
        totalPrizeUsd={scenario.totalPrizeUsd}
        uniquePrizeTokens={scenario.uniquePrizeTokens}
        paidPlaces={scenario.paidPlaces}
        tournamentsData={[]}
        isStarted={scenario.isStarted}
        isEnded={scenario.isEnded}
        isSubmitted={scenario.isSubmitted}
        isInPreparationPeriod={scenario.isInPreparationPeriod}
        registrationType={scenario.registrationType}
        allSubmitted={scenario.allSubmitted}
        allClaimed={scenario.allClaimed}
        claimablePrizesCount={scenario.claimablePrizesCount}
        {...headerActions}
        timelineSlot={
          <TournamentTimeline
            type={scenario.registrationType}
            createdTime={scenario.timeline.createdTime}
            startTime={scenario.timeline.startTime}
            duration={scenario.timeline.duration}
            submissionPeriod={scenario.timeline.submissionPeriod}
            registrationStartTime={scenario.timeline.registrationStartTime}
            registrationEndTime={scenario.timeline.registrationEndTime}
            pulse
            inline
          />
        }
      />

      <div className="flex flex-col gap-4">
        <TournamentDetailInfo
          settingsName={scenario.settingsName}
          registrationType={scenario.registrationType}
          entryCount={scenario.entryCount}
          entryFeeInfo={scenario.entryFeeInfo}
          entryFeeTokenLogo={scenario.entryFeeTokenLogo}
          refundBps={scenario.refundBps}
          countdownTarget={countdownTarget}
          countdownLabel={countdownLabel}
          onSettingsClick={() => setSettingsDialogOpen((v) => !v)}
        />

        <div className="h-px bg-brand/15 w-full" />

        <div className="flex flex-col-reverse md:flex-row gap-5">
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            <TournamentDescription
              tournamentName={scenario.name}
              description={scenario.description}
            />
            <MockMyEntries
              entries={scenario.myEntries}
              isStarted={scenario.isStarted}
              isEnded={scenario.isEnded}
              prizesByPosition={prizesByPositionMap}
            />
          </div>
          <div className="w-full md:w-[440px] flex-shrink-0">
            <MockEntrantsTable
              entrants={scenario.entrants}
              prizesByPosition={prizesByPositionMap}
              isStarted={scenario.isStarted}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
