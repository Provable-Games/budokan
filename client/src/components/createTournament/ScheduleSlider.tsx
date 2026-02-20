import { useState, useEffect, useRef } from "react";
import { Calendar } from "@/components/ui/calendar";
import { CALENDAR, START_FLAG, END_FLAG, LEADERBOARD, REGISTER } from "@/components/Icons";
import { SECONDS_IN_DAY, SECONDS_IN_HOUR } from "@/lib/constants";
import TimelineMarker from "./TimelineMarker";

const SECONDS_IN_15_MINUTES = 15 * 60;

interface ScheduleSliderProps {
  startTime: Date;
  endTime: Date;
  submissionPeriod: number;
  enableRegistration: boolean;
  registrationType: "open" | "fixed";
  registrationStartTime?: Date;
  registrationEndTime?: Date;
  onStartTimeChange: (date: Date) => void;
  onEndTimeChange: (date: Date) => void;
  onSubmissionPeriodChange: (seconds: number) => void;
  onRegistrationStartTimeChange?: (date: Date | undefined) => void;
  onRegistrationEndTimeChange?: (date: Date | undefined) => void;
  minStartTime: Date;
  minEndTime: Date;
  disablePastStartDates: (date: Date) => boolean;
  disablePastEndDates: (date: Date) => boolean;
  allowShortSubmissionPeriod?: boolean;
}

const ScheduleSlider = ({
  startTime,
  endTime,
  submissionPeriod,
  enableRegistration,
  registrationType,
  registrationStartTime,
  registrationEndTime,
  allowShortSubmissionPeriod = false,
  onStartTimeChange,
  onEndTimeChange,
  onSubmissionPeriodChange,
  onRegistrationStartTimeChange,
  onRegistrationEndTimeChange,
  minStartTime,
  minEndTime,
  disablePastStartDates,
  disablePastEndDates,
}: ScheduleSliderProps) => {
  // Minimum submission period: 1 hour for privileged users, 1 day for others
  const MIN_SUBMISSION_PERIOD = allowShortSubmissionPeriod ? SECONDS_IN_HOUR : SECONDS_IN_DAY;

  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);

  // Calculate total timeline duration in seconds (with safety checks)
  // Use useRef to maintain a stable "now" reference across re-renders
  const nowRef = useRef(new Date());
  const now = nowRef.current;

  // Use registrationStartTime if provided, otherwise default to now for fixed tournaments
  // For open tournaments, use tournament start time as the timeline anchor
  const effectiveRegStartTime = registrationType === "fixed" && enableRegistration
    ? (registrationStartTime || now)
    : startTime;

  // Use registrationEndTime if provided, otherwise default to startTime (no gap)
  const effectiveRegEndTime = registrationEndTime || startTime;

  // For "fixed" registration with gap support
  const registrationDuration = registrationType === "fixed" && enableRegistration && effectiveRegEndTime
    ? Math.max(0, Math.floor((effectiveRegEndTime.getTime() - effectiveRegStartTime.getTime()) / 1000))
    : 0;

  // Gap between registration end and tournament start
  const gapDuration = registrationType === "fixed" && enableRegistration && startTime && effectiveRegEndTime
    ? Math.max(0, Math.floor((startTime.getTime() - effectiveRegEndTime.getTime()) / 1000))
    : 0;

  const tournamentDuration = startTime && endTime
    ? Math.max(SECONDS_IN_15_MINUTES, Math.floor((endTime.getTime() - startTime.getTime()) / 1000))
    : SECONDS_IN_DAY;

  // For open tournaments, registration overlaps with tournament
  const totalDuration = registrationType === "open"
    ? tournamentDuration + (submissionPeriod || SECONDS_IN_DAY)
    : registrationDuration + gapDuration + tournamentDuration + (submissionPeriod || SECONDS_IN_DAY);

  // Calculate positions as percentages
  const registrationStart = 0;
  const registrationEnd = registrationType === "fixed" && enableRegistration
    ? (registrationDuration / totalDuration) * 100
    : 0;
  const gapEnd = registrationType === "fixed" && enableRegistration
    ? ((registrationDuration + gapDuration) / totalDuration) * 100
    : registrationEnd;
  const tournamentEnd = registrationType === "open"
    ? (tournamentDuration / totalDuration) * 100
    : ((registrationDuration + gapDuration + tournamentDuration) / totalDuration) * 100;
  const submissionEnd = 100;

  const handleMouseDown = (point: string, e: React.MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    setDragStartX(clickX);
    setIsDragging(point);
  };

  const handleSegmentDrag = (segment: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    setDragStartX(e.clientX - rect.left);
    setIsDragging(segment + "-segment");
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !sliderRef.current || !startTime || !endTime) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = (x / rect.width) * 100;

    // Convert percentage to duration in seconds
    const newDurationFromStart = Math.floor((percentage / 100) * totalDuration);

    if (isDragging === "registrationStart" && registrationType === "fixed" && onRegistrationStartTimeChange) {
      // Dragging registration start point (no cascade - manual adjustment)
      const targetPercentage = (newDurationFromStart / totalDuration);

      // Calculate the time range from effectiveRegStartTime to submission end
      const timelineStart = effectiveRegStartTime.getTime();
      const timelineEnd = effectiveRegStartTime.getTime() + totalDuration * 1000;
      const timeRange = timelineEnd - timelineStart;

      // Calculate new time based on percentage of timeline
      const newRegStartTime = new Date(timelineStart + targetPercentage * timeRange);

      // Ensure reg start time is after now and before registration end
      const maxRegStart = effectiveRegEndTime;
      if (newRegStartTime >= now && newRegStartTime <= maxRegStart) {
        onRegistrationStartTimeChange(newRegStartTime);
      } else if (newRegStartTime > maxRegStart) {
        // Clamp to registration end time if dragged past it
        onRegistrationStartTimeChange(maxRegStart);
      }
    } else if (isDragging === "registrationEnd" && registrationType === "fixed" && onRegistrationEndTimeChange) {
      // Dragging registration end point (no cascade - manual adjustment)
      const targetPercentage = (newDurationFromStart / totalDuration);

      // Calculate the time range from effectiveRegStartTime to submission end
      const timelineStart = effectiveRegStartTime.getTime();
      const timelineEnd = effectiveRegStartTime.getTime() + totalDuration * 1000;
      const timeRange = timelineEnd - timelineStart;

      // Calculate new time based on percentage of timeline
      const newRegEndTime = new Date(timelineStart + targetPercentage * timeRange);

      // Ensure reg end time is after registration start and before/at tournament start (can merge with start)
      if (newRegEndTime >= effectiveRegStartTime && newRegEndTime <= startTime) {
        onRegistrationEndTimeChange(newRegEndTime);
      } else if (newRegEndTime > startTime) {
        // Clamp to tournament start time if dragged past it
        onRegistrationEndTimeChange(startTime);
      }
    } else if (isDragging === "tournamentStart") {
      // Dragging tournament start point - this moves the actual tournament start time
      // For fixed tournaments with registration, this creates/adjusts the gap
      const targetPercentage = (newDurationFromStart / totalDuration);

      // Calculate the time range from effectiveRegStartTime to submission end
      const timelineStart = effectiveRegStartTime.getTime();
      const timelineEnd = effectiveRegStartTime.getTime() + totalDuration * 1000;
      const timeRange = timelineEnd - timelineStart;

      // Calculate new time based on percentage of timeline
      const newStartTime = new Date(timelineStart + targetPercentage * timeRange);

      // Ensure start time respects minimum constraint and is at/after registration end
      const minAllowedStart = registrationType === "fixed" && effectiveRegEndTime
        ? new Date(Math.max(effectiveRegEndTime.getTime(), minStartTime.getTime()))
        : minStartTime;

      if (newStartTime >= minAllowedStart) {
        handleStartTimeChange(newStartTime);
      } else if (registrationType === "fixed" && effectiveRegEndTime && newStartTime < effectiveRegEndTime) {
        // Clamp to registration end time if dragged before it (merge - no gap)
        handleStartTimeChange(effectiveRegEndTime);
      }
    } else if (isDragging === "tournamentEnd") {
      // Dragging tournament end point
      const targetPercentage = (newDurationFromStart / totalDuration);

      // Calculate the time range from effectiveRegStartTime to submission end
      const timelineStart = effectiveRegStartTime.getTime();
      const timelineEnd = effectiveRegStartTime.getTime() + totalDuration * 1000;
      const timeRange = timelineEnd - timelineStart;

      // Calculate new time based on percentage of timeline
      const newEndTime = new Date(timelineStart + targetPercentage * timeRange);

      if (newEndTime >= minEndTime && newEndTime > startTime) {
        onEndTimeChange(newEndTime);
      }
    } else if (isDragging === "submissionEnd") {
      // Dragging submission end point
      const targetPercentage = (newDurationFromStart / totalDuration);

      // Calculate the time range from effectiveRegStartTime to submission end
      const timelineStart = effectiveRegStartTime.getTime();
      const timelineEnd = effectiveRegStartTime.getTime() + totalDuration * 1000;
      const timeRange = timelineEnd - timelineStart;

      // Calculate new submission end time based on percentage of timeline
      const newSubmissionEndTime = new Date(timelineStart + targetPercentage * timeRange);

      // Calculate submission duration as the difference from tournament end
      const submissionDuration = Math.max(
        MIN_SUBMISSION_PERIOD,
        Math.floor((newSubmissionEndTime.getTime() - endTime.getTime()) / 1000)
      );
      onSubmissionPeriodChange(submissionDuration);
    } else if (isDragging === "tournament-segment") {
      // Dragging the entire tournament segment (shifts both start and end)
      const delta = x - dragStartX;
      const deltaSeconds = Math.floor((delta / rect.width) * totalDuration);

      const newStartTime = new Date(startTime.getTime() + deltaSeconds * 1000);
      const newEndTime = new Date(endTime.getTime() + deltaSeconds * 1000);

      if (newStartTime >= minStartTime && newEndTime >= minEndTime) {
        onStartTimeChange(newStartTime);
        onEndTimeChange(newEndTime);
        setDragStartX(x);
      }
    } else if (isDragging === "registration-segment") {
      // Dragging registration segment - adjusts registration duration by moving start time
      const registrationTime = Math.max(
        SECONDS_IN_15_MINUTES,
        newDurationFromStart
      );
      const newStartTime = new Date(now.getTime() + registrationTime * 1000);

      if (newStartTime >= minStartTime) {
        onStartTimeChange(newStartTime);
      }
    } else if (isDragging === "submission-segment") {
      // Dragging submission segment - adjusts submission period
      const submissionStart = registrationType === "fixed"
        ? registrationDuration + tournamentDuration
        : tournamentDuration;
      const submissionDuration = Math.max(
        MIN_SUBMISSION_PERIOD,
        newDurationFromStart - submissionStart
      );
      onSubmissionPeriodChange(submissionDuration);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(null);
    setDragStartX(0);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, totalDuration, registrationDuration, tournamentDuration]);

  // Reset drag state when times change externally (via calendar)
  useEffect(() => {
    // If we're not actively dragging, reset dragStartX when times change
    if (!isDragging) {
      setDragStartX(0);
    }
  }, [startTime, endTime, registrationStartTime, registrationEndTime, submissionPeriod]);

  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / SECONDS_IN_DAY);
    const hours = Math.floor((seconds % SECONDS_IN_DAY) / SECONDS_IN_HOUR);

    if (days > 0) {
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
    return `${hours}h`;
  };

  const submissionEndDate = endTime
    ? new Date(endTime.getTime() + submissionPeriod * 1000)
    : new Date();

  // Helper function to handle registration start time changes with cascading updates
  const handleRegistrationStartTimeChange = (newRegStartTime: Date, cascade: boolean = true) => {
    if (!onRegistrationStartTimeChange || !registrationStartTime) return;

    const oldRegStartTime = registrationStartTime;
    const timeDelta = newRegStartTime.getTime() - oldRegStartTime.getTime();

    // Ensure proper date format
    const formattedDate = new Date(newRegStartTime);
    formattedDate.setSeconds(0);
    formattedDate.setMilliseconds(0);

    onRegistrationStartTimeChange(formattedDate);

    // Cascade forward: shift all subsequent times by the same delta
    if (cascade && timeDelta !== 0) {
      // Update registration end
      if (onRegistrationEndTimeChange && registrationEndTime) {
        const newRegEndTime = new Date(registrationEndTime.getTime() + timeDelta);
        newRegEndTime.setSeconds(0);
        newRegEndTime.setMilliseconds(0);
        onRegistrationEndTimeChange(newRegEndTime);
      }

      // Update tournament start and end
      if (startTime) {
        const newTournamentStartTime = new Date(startTime.getTime() + timeDelta);
        newTournamentStartTime.setSeconds(0);
        newTournamentStartTime.setMilliseconds(0);
        onStartTimeChange(newTournamentStartTime);

        // Update tournament end
        if (endTime) {
          const newEndTime = new Date(endTime.getTime() + timeDelta);
          newEndTime.setSeconds(0);
          newEndTime.setMilliseconds(0);
          onEndTimeChange(newEndTime);
        }
      }
    }
  };

  // Helper function to handle registration end time changes with cascading updates
  const handleRegistrationEndTimeChange = (newRegEndTime: Date, cascade: boolean = true) => {
    if (!onRegistrationEndTimeChange || !registrationEndTime) return;

    const oldRegEndTime = registrationEndTime;
    const timeDelta = newRegEndTime.getTime() - oldRegEndTime.getTime();

    // Ensure proper date format
    const formattedDate = new Date(newRegEndTime);
    formattedDate.setSeconds(0);
    formattedDate.setMilliseconds(0);

    onRegistrationEndTimeChange(formattedDate);

    // Cascade forward: shift tournament start and end by the same delta
    if (cascade && timeDelta !== 0) {
      if (startTime) {
        const newTournamentStartTime = new Date(startTime.getTime() + timeDelta);
        newTournamentStartTime.setSeconds(0);
        newTournamentStartTime.setMilliseconds(0);
        onStartTimeChange(newTournamentStartTime);

        // Update tournament end
        if (endTime) {
          const newEndTime = new Date(endTime.getTime() + timeDelta);
          newEndTime.setSeconds(0);
          newEndTime.setMilliseconds(0);
          onEndTimeChange(newEndTime);
        }
      }
    }
  };

  // Helper function to handle tournament start time changes with cascading updates
  const handleStartTimeChange = (newStartTime: Date, cascade: boolean = true) => {
    const oldStartTime = startTime;
    const timeDelta = newStartTime.getTime() - oldStartTime.getTime();

    // Ensure proper date format
    const formattedDate = new Date(newStartTime);
    formattedDate.setSeconds(0);
    formattedDate.setMilliseconds(0);

    onStartTimeChange(formattedDate);

    // Cascade forward: shift tournament end by the same delta (maintains duration)
    if (cascade && endTime && timeDelta !== 0) {
      const newEndTime = new Date(endTime.getTime() + timeDelta);
      newEndTime.setSeconds(0);
      newEndTime.setMilliseconds(0);
      onEndTimeChange(newEndTime);
    }
  };

  return (
    <div className="flex flex-col gap-12 w-full">
        {/* Timeline Slider */}
        <div className="relative pt-20 pb-8" ref={sliderRef}>
        {/* Slider Track */}
        <div className="relative h-4 w-full rounded-full bg-neutral/20">
          {/* Registration Segment */}
          {registrationType === "fixed" && enableRegistration && registrationDuration > 0 && (
            <div
              className="absolute h-full bg-purple-500/60 rounded-l-full cursor-grab active:cursor-grabbing hover:bg-purple-500/80 transition-colors"
              style={{
                left: `${registrationStart}%`,
                width: `${registrationEnd - registrationStart}%`,
              }}
              onMouseDown={(e) => handleSegmentDrag("registration", e)}
              title="Drag to adjust registration period"
            />
          )}

          {/* Gap Segment (between registration and tournament) */}
          {registrationType === "fixed" && enableRegistration && gapDuration > 0 && (
            <div
              className="absolute h-full bg-neutral/40 cursor-grab active:cursor-grabbing hover:bg-neutral/60 transition-colors"
              style={{
                left: `${registrationEnd}%`,
                width: `${gapEnd - registrationEnd}%`,
              }}
              onMouseDown={(e) => handleSegmentDrag("gap", e)}
              title="Gap before tournament starts"
            />
          )}

          {/* Tournament Duration Segment */}
          <div
            className={`absolute h-full bg-brand-muted/80 cursor-grab active:cursor-grabbing hover:bg-brand-muted transition-colors ${
              registrationType === "open" || (registrationType === "fixed" && !enableRegistration) ? "rounded-l-full" : ""
            }`}
            style={{
              left: `${gapEnd}%`,
              width: `${tournamentEnd - gapEnd}%`,
            }}
            onMouseDown={(e) => handleSegmentDrag("tournament", e)}
            title="Drag to shift tournament"
          />

          {/* Submission Period Segment */}
          <div
            className="absolute h-full bg-blue-500/60 rounded-r-full cursor-grab active:cursor-grabbing hover:bg-blue-500/80 transition-colors"
            style={{
              left: `${tournamentEnd}%`,
              width: `${submissionEnd - tournamentEnd}%`,
            }}
            onMouseDown={(e) => handleSegmentDrag("submission", e)}
            title="Drag to adjust submission period"
          />

          {/* Draggable Boundary Handles with Icons */}

          {/* Registration Start Point (draggable) - When registration opens */}
          {registrationType === "fixed" && enableRegistration && (
            <TimelineMarker
              position={registrationStart}
              date={effectiveRegStartTime}
              label={registrationStartTime ? "Reg Opens" : "Now"}
              icon={<CALENDAR />}
              iconBgColor="bg-black"
              iconBorderColor="border-brand"
              iconTextColor="text-brand"
              borderColor="brand"
              isDragging={!!isDragging}
              onMouseDown={(e) => {
                e.preventDefault();
                handleMouseDown("registrationStart", e);
              }}
              calendarContent={
                <Calendar
                  selected={effectiveRegStartTime}
                  onSelect={(date) => {
                    if (date && effectiveRegStartTime && onRegistrationStartTimeChange) {
                      const newDate = new Date(date);
                      newDate.setHours(effectiveRegStartTime.getHours());
                      newDate.setMinutes(effectiveRegStartTime.getMinutes());
                      handleRegistrationStartTimeChange(newDate);
                    }
                  }}
                  selectedTime={effectiveRegStartTime}
                  onTimeChange={(hour, minute) => {
                    if (effectiveRegStartTime && onRegistrationStartTimeChange) {
                      const newDate = new Date(effectiveRegStartTime);
                      newDate.setHours(hour);
                      newDate.setMinutes(minute);
                      newDate.setSeconds(0);
                      newDate.setMilliseconds(0);
                      handleRegistrationStartTimeChange(newDate);
                    }
                  }}
                  disabled={disablePastStartDates}
                  minTime={now}
                  initialFocus
                  className="rounded-md border-4 border-brand-muted w-auto"
                />
              }
            />
          )}

          {/* Registration End Point (draggable) - Controls when registration closes */}
          {registrationType === "fixed" && enableRegistration && (
            <TimelineMarker
              position={registrationEnd}
              date={effectiveRegEndTime}
              label="Reg End"
              icon={<REGISTER />}
              iconBgColor="bg-purple-600"
              iconTextColor="text-white"
              iconSize="w-5"
              borderColor="purple-500"
              offsetPixels={!isDragging && gapDuration < 60 ? -60 : 0}
              isDragging={!!isDragging}
              onMouseDown={(e) => {
                e.preventDefault();
                handleMouseDown("registrationEnd", e);
              }}
              calendarContent={
                <Calendar
                  selected={effectiveRegEndTime}
                  onSelect={(date) => {
                    if (date && effectiveRegEndTime && onRegistrationEndTimeChange) {
                      const newDate = new Date(date);
                      newDate.setHours(effectiveRegEndTime.getHours());
                      newDate.setMinutes(effectiveRegEndTime.getMinutes());
                      handleRegistrationEndTimeChange(newDate);
                    }
                  }}
                  selectedTime={effectiveRegEndTime}
                  onTimeChange={(hour, minute) => {
                    if (effectiveRegEndTime && onRegistrationEndTimeChange) {
                      const newDate = new Date(effectiveRegEndTime);
                      newDate.setHours(hour);
                      newDate.setMinutes(minute);
                      newDate.setSeconds(0);
                      newDate.setMilliseconds(0);
                      handleRegistrationEndTimeChange(newDate);
                    }
                  }}
                  disabled={disablePastStartDates}
                  minTime={minStartTime}
                  initialFocus
                  className="rounded-md border-4 border-brand-muted w-auto"
                />
              }
            />
          )}

          {/* Tournament Start Point (draggable) */}
          <TimelineMarker
            position={gapEnd}
            date={startTime}
            label="Start"
            icon={<START_FLAG />}
            iconBgColor="bg-brand"
            iconTextColor="text-black"
            iconSize="w-5"
            zIndex="z-40"
            offsetPixels={!isDragging && registrationType === "fixed" && enableRegistration && gapDuration < 60 ? 60 : 0}
            isDragging={!!isDragging}
            onMouseDown={(e) => {
              e.preventDefault();
              handleMouseDown("tournamentStart", e);
            }}
            calendarContent={
              <Calendar
                selected={startTime}
                onSelect={(date) => {
                  if (date && startTime) {
                    const newDate = new Date(date);
                    newDate.setHours(startTime.getHours());
                    newDate.setMinutes(startTime.getMinutes());
                    handleStartTimeChange(newDate);
                  }
                }}
                selectedTime={startTime}
                onTimeChange={(hour, minute) => {
                  if (startTime) {
                    const newDate = new Date(startTime);
                    newDate.setHours(hour);
                    newDate.setMinutes(minute);
                    newDate.setSeconds(0);
                    newDate.setMilliseconds(0);
                    handleStartTimeChange(newDate);
                  }
                }}
                disabled={disablePastStartDates}
                minTime={minStartTime}
                initialFocus
                className="rounded-md border-4 border-brand-muted w-auto"
              />
            }
          />

          {/* Tournament End Point */}
          <TimelineMarker
            position={tournamentEnd}
            date={endTime}
            label="End"
            icon={<END_FLAG />}
            iconBgColor="bg-brand"
            iconTextColor="text-black"
            iconSize="w-5"
            isDragging={!!isDragging}
            onMouseDown={(e) => {
              e.preventDefault();
              handleMouseDown("tournamentEnd", e);
            }}
            calendarContent={
              <Calendar
                selected={endTime}
                onSelect={(date) => {
                  if (date && endTime) {
                    const newDate = new Date(date);
                    newDate.setHours(endTime.getHours());
                    newDate.setMinutes(endTime.getMinutes());
                    onEndTimeChange(newDate);
                  }
                }}
                selectedTime={endTime}
                onTimeChange={(hour, minute) => {
                  if (endTime) {
                    const newDate = new Date(endTime);
                    newDate.setHours(hour);
                    newDate.setMinutes(minute);
                    newDate.setSeconds(0);
                    newDate.setMilliseconds(0);
                    onEndTimeChange(newDate);
                  }
                }}
                disabled={disablePastEndDates}
                minTime={minEndTime}
                initialFocus
                className="rounded-md border-4 border-brand-muted w-auto"
              />
            }
          />

          {/* Submission End Point */}
          <TimelineMarker
            position={submissionEnd}
            date={submissionEndDate}
            label="Final"
            icon={<LEADERBOARD />}
            iconBgColor="bg-blue-600"
            borderColor="blue-500"
            isDragging={!!isDragging}
            onMouseDown={(e) => {
              e.preventDefault();
              handleMouseDown("submissionEnd", e);
            }}
            calendarContent={
              <Calendar
                selected={submissionEndDate}
                onSelect={(date) => {
                  if (date && submissionEndDate && endTime) {
                    const newDate = new Date(date);
                    newDate.setHours(submissionEndDate.getHours());
                    newDate.setMinutes(submissionEndDate.getMinutes());
                    const newSubmissionPeriod = Math.max(
                      MIN_SUBMISSION_PERIOD,
                      Math.floor((newDate.getTime() - endTime.getTime()) / 1000)
                    );
                    onSubmissionPeriodChange(newSubmissionPeriod);
                  }
                }}
                selectedTime={submissionEndDate}
                onTimeChange={(hour, minute) => {
                  if (submissionEndDate && endTime) {
                    const newDate = new Date(submissionEndDate);
                    newDate.setHours(hour);
                    newDate.setMinutes(minute);
                    newDate.setSeconds(0);
                    newDate.setMilliseconds(0);
                    const newSubmissionPeriod = Math.max(
                      MIN_SUBMISSION_PERIOD,
                      Math.floor((newDate.getTime() - endTime.getTime()) / 1000)
                    );
                    onSubmissionPeriodChange(newSubmissionPeriod);
                  }
                }}
                disabled={(date) => {
                  // Disable dates before tournament end date
                  const tournamentEndDate = new Date(endTime);
                  tournamentEndDate.setHours(0, 0, 0, 0);
                  return date < tournamentEndDate;
                }}
                minTime={endTime}
                initialFocus
                className="rounded-md border-4 border-brand-muted w-auto"
              />
            }
          />
        </div>

        {/* Duration Labels Below Track */}
        <div className="absolute top-full mt-4 w-full flex">
          {registrationType === "fixed" && enableRegistration && registrationDuration > 0 && (
            <div
              className="text-center text-xs text-purple-400 font-medium"
              style={{ width: `${registrationEnd - registrationStart}%` }}
            >
              Registration: {formatDuration(registrationDuration)}
            </div>
          )}
          {registrationType === "fixed" && enableRegistration && gapDuration > 0 && (
            <div
              className="text-center text-xs text-neutral/60 font-medium"
              style={{ width: `${gapEnd - registrationEnd}%` }}
            >
              Gap: {formatDuration(gapDuration)}
            </div>
          )}
          <div
            className="text-center text-xs text-brand-muted font-medium"
            style={{
              width: `${tournamentEnd - gapEnd}%`,
              marginLeft: 0,
            }}
          >
            {registrationType === "open" ? "Tournament (Open Registration)" : "Tournament"}: {formatDuration(tournamentDuration)}
          </div>
          <div
            className="text-center text-xs text-blue-400 font-medium"
            style={{ width: `${submissionEnd - tournamentEnd}%` }}
          >
            Submission: {formatDuration(submissionPeriod)}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-xs">
        {registrationType === "fixed" && enableRegistration && (
          <>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-500/60" />
              <span className="text-neutral">Registration Period</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-neutral/40" />
              <span className="text-neutral">Gap (Optional)</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-brand-muted/80" />
          <span className="text-neutral">Tournament</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500/60" />
          <span className="text-neutral">Submission Period</span>
        </div>
      </div>
    </div>
  );
};

export default ScheduleSlider;
