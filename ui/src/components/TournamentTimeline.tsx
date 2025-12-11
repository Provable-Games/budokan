import {
  START_FLAG,
  END_FLAG,
  LEADERBOARD,
  REGISTER,
} from "@/components/Icons";
import TimelineCard from "@/components/TimelineCard";

interface TournamentTimelineProps {
  type: string;
  createdTime: number;
  startTime: number;
  duration: number;
  submissionPeriod: number;
  registrationStartTime?: number;
  registrationEndTime?: number;
  pulse?: boolean;
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

  // Gap between registration end and tournament start
  const hasGap = registrationEndTime && registrationEndTime < startTime;

  const now = Number(BigInt(new Date().getTime()) / BigInt(1000));
  const isRegistrationEnded = effectiveRegistrationEndTime < now;
  const isStarted = startTime < now;
  const isEnded = startTime + duration < now;
  const isSubmissionEnded = startTime + duration + submissionPeriod < now;

  return (
    <div className="flex flex-row items-center justify-center gap-10 sm:gap-20 3xl:gap-[100px] mt-4">
      {type === "fixed" && (
        <TimelineCard
          icon={
            <span className="w-6 sm:w-8 3xl:w-10">
              <REGISTER />
            </span>
          }
          date={registrationStartDate}
          duraton={registrationPeriod}
          label="Registration"
          showConnector
          active={pulse ? !isRegistrationEnded : false}
          completed={isRegistrationEnded}
        />
      )}
      {type === "fixed" && hasGap && (
        <>
          <TimelineCard
            icon={
              <span className="w-4 sm:w-6 3xl:w-8">
                <REGISTER />
              </span>
            }
            date={registrationEndDate}
            active={pulse ? isRegistrationEnded && !isStarted : false}
            completed={isStarted}
          />
          <div className="-mx-8 sm:-mx-16 3xl:-mx-20" />
        </>
      )}
      <TimelineCard
        icon={
          <span className="w-4 sm:w-6 3xl:w-8">
            <START_FLAG />
          </span>
        }
        date={startDate}
        duraton={duration}
        label="Tournament"
        showConnector
        active={pulse ? isStarted && !isEnded : false}
        completed={isStarted}
      />
      <TimelineCard
        icon={
          <span className="w-4 sm:w-6 3xl:w-8">
            <END_FLAG />
          </span>
        }
        date={endDate}
        duraton={submissionPeriod}
        label="Submission"
        showConnector
        active={pulse ? isEnded && !isSubmissionEnded : false}
        completed={isEnded}
      />
      <TimelineCard
        icon={
          <span className="w-6 sm:w-8 3xl:w-10">
            <LEADERBOARD />
          </span>
        }
        date={submissionEndDate}
        completed={isSubmissionEnded}
      />
    </div>
  );
};

export default TournamentTimeline;
