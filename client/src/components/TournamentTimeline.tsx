import {
  START_FLAG,
  END_FLAG,
  LEADERBOARD,
  REGISTER,
} from "@/components/Icons";
import { Clock } from "lucide-react";
import TimelineCard from "@/components/TimelineCard";
import { cn } from "@/lib/utils";

interface TournamentTimelineProps {
  type: string;
  createdTime: number;
  startTime: number;
  duration: number;
  submissionPeriod: number;
  registrationStartTime?: number;
  registrationEndTime?: number;
  pulse?: boolean;
  inline?: boolean;
}

const TournamentTimeline = ({
  type,
  createdTime,
  startTime,
  duration,
  submissionPeriod,
  registrationStartTime,
  registrationEndTime,
  pulse = false,
  inline = false,
}: TournamentTimelineProps) => {
  const effectiveRegistrationStartTime = registrationStartTime ?? createdTime;
  const registrationStartDate = new Date(effectiveRegistrationStartTime * 1000);
  const startDate = new Date(startTime * 1000);
  const endDate = new Date((startTime + duration) * 1000);
  const submissionEndDate = new Date(
    (startTime + duration + submissionPeriod) * 1000
  );

  // Use registrationEndTime if provided, otherwise default to startTime (no gap)
  const effectiveRegistrationEndTime = registrationEndTime ?? startTime;
  const registrationEndDate = new Date(effectiveRegistrationEndTime * 1000);
  const registrationPeriod =
    effectiveRegistrationEndTime - effectiveRegistrationStartTime;

  // Gap between registration end and tournament start (preparation period)
  const hasGap = registrationEndTime && registrationEndTime < startTime;
  const gapDuration = hasGap ? startTime - effectiveRegistrationEndTime : 0;

  const now = Number(BigInt(new Date().getTime()) / BigInt(1000));
  const isRegistrationEnded = effectiveRegistrationEndTime < now;
  const isStarted = startTime < now;
  const isEnded = startTime + duration < now;
  const isSubmissionEnded = startTime + duration + submissionPeriod < now;

  // New flag: Detect if we're in the break/preparation period
  const isInPreparationPeriod = hasGap && isRegistrationEnded && !isStarted;

  return (
    <div
      className={cn(
        "overflow-x-auto",
        inline
          ? "w-fit max-w-full mx-auto border border-brand/20 rounded-lg bg-black/30 px-4 py-2"
          : "w-full",
      )}
    >
      <div
        className={cn(
          "flex flex-row items-center justify-center px-2",
          inline
            ? "mt-0 gap-6 sm:gap-10 lg:gap-12"
            : "mt-4 gap-8 sm:gap-14 lg:gap-20",
        )}
      >
      {type === "fixed" && (
        <TimelineCard
          icon={
            <span
              className={
                inline
                  ? "w-3 sm:w-4 lg:w-5 3xl:w-6"
                  : "w-4 sm:w-5 lg:w-6 3xl:w-8"
              }
            >
              <REGISTER />
            </span>
          }
          date={registrationStartDate}
          duraton={registrationPeriod}
          label="Registration"
          showConnector
          active={pulse ? !isRegistrationEnded : false}
          completed={isRegistrationEnded}
          highlighted={!isRegistrationEnded}
          compact={inline}
        />
      )}
      {type === "fixed" && hasGap && (
        <TimelineCard
          icon={
            <Clock
              className={
                inline
                  ? "w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 3xl:w-5 3xl:h-5"
                  : "w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 3xl:w-7 3xl:h-7"
              }
            />
          }
          date={registrationEndDate}
          duraton={gapDuration}
          label="Preparation"
          showConnector
          active={pulse ? !!isInPreparationPeriod : false}
          completed={isStarted}
          highlighted={!!isInPreparationPeriod}
          compact={inline}
        />
      )}
      <TimelineCard
        icon={
          <span
            className={
              inline
                ? "w-3 sm:w-3.5 lg:w-4 3xl:w-5"
                : "w-3 sm:w-4 lg:w-5 3xl:w-7"
            }
          >
            <START_FLAG />
          </span>
        }
        date={startDate}
        duraton={duration}
        label="Tournament"
        showConnector
        active={pulse ? isStarted && !isEnded : false}
        completed={isStarted}
        highlighted={isStarted && !isEnded}
        compact={inline}
      />
      <TimelineCard
        icon={
          <span
            className={
              inline
                ? "w-3 sm:w-3.5 lg:w-4 3xl:w-5"
                : "w-3 sm:w-4 lg:w-5 3xl:w-7"
            }
          >
            <END_FLAG />
          </span>
        }
        date={endDate}
        duraton={submissionPeriod}
        label="Submission"
        showConnector
        active={pulse ? isEnded && !isSubmissionEnded : false}
        completed={isEnded}
        highlighted={isEnded && !isSubmissionEnded}
        compact={inline}
      />
      <TimelineCard
        icon={
          <span
            className={
              inline
                ? "w-3 sm:w-4 lg:w-5 3xl:w-6"
                : "w-4 sm:w-5 lg:w-6 3xl:w-8"
            }
          >
            <LEADERBOARD />
          </span>
        }
        date={submissionEndDate}
        completed={isSubmissionEnded}
        compact={inline}
      />
      </div>
    </div>
  );
};

export default TournamentTimeline;
