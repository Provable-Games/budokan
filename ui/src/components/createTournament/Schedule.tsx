import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FormLabel, FormDescription } from "@/components/ui/form";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { INFO } from "@/components/Icons";
import { StepProps } from "@/containers/CreateTournament";
import ScheduleSlider from "@/components/createTournament/ScheduleSlider";
import TournamentTimeline from "@/components/TournamentTimeline";
import { SECONDS_IN_DAY } from "@/lib/constants";
import { useAccount } from "@starknet-react/core";
import { indexAddress } from "@/lib/utils";

// Privileged addresses that can set submission period < 1 day
const PRIVILEGED_ADDRESSES = [
  "0x077b8Ed8356a7C1F0903Fc4bA6E15F9b09CF437ce04f21B2cBf32dC2790183d0", // Realms World address
  // Add more addresses here as needed
];

const Schedule = ({ form }: StepProps) => {
  const { address } = useAccount();

  // Check if current account is privileged (can set submission period < 1 day)
  const isPrivileged =
    address &&
    PRIVILEGED_ADDRESSES.some(
      (privilegedAddr) =>
        indexAddress(privilegedAddr).toLowerCase() === indexAddress(address)
    );

  const [enableRegistration, setEnableRegistration] = useState(false);
  const [registrationStartTime, setRegistrationStartTime] = useState<
    Date | undefined
  >(undefined);
  const [registrationEndTime, setRegistrationEndTime] = useState<
    Date | undefined
  >(undefined);
  const [hasInitializedFixedMode, setHasInitializedFixedMode] = useState(false);
  const [minStartTime, setMinStartTime] = useState<Date>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    return now;
  });
  const [minEndTime, setMinEndTime] = useState<Date>(() => {
    const startTime = form.watch("startTime");
    startTime.setHours(startTime.getHours() + 1); // Minimum 1 hour duration
    return startTime;
  });

  const PREDEFINED_DURATIONS = [
    { value: 86400, label: "1 Day" },
    { value: 259200, label: "3 Days" },
    { value: 604800, label: "1 Week" },
    { value: 1209600, label: "2 Weeks" },
  ];

  const DURATION_TO_DEFAULT_SUBMISSION = {
    "1 Day": 86400, // 1 day -> 1 day (24 hours)
    "3 Days": 86400, // 3 days -> 1 day (24 hours)
    "1 Week": 86400, // 1 week -> 1 day (24 hours)
    "2 Weeks": 172800, // 2 weeks -> 2 days (48 hours)
  } as const;

  // Updated function to disable dates before the minimum start time
  const disablePastStartDates = (date: Date) => {
    const minDate = new Date(minStartTime);
    minDate.setHours(0, 0, 0, 0);
    return date < minDate;
  };

  const disablePastEndDates = (date: Date) => {
    const minDate = new Date(minEndTime);
    minDate.setHours(0, 0, 0, 0);
    return date < minDate;
  };

  const registrationType = form.watch("type");

  // Sync enableRegistration state with form's registration type
  useEffect(() => {
    const isFixed = registrationType === "fixed";
    setEnableRegistration(isFixed);

    // Reset initialization flag when switching away from fixed
    if (!isFixed) {
      setHasInitializedFixedMode(false);
    }
  }, [registrationType]);

  // Effect to update start time when registration type changes to "fixed" (only once)
  useEffect(() => {
    if (registrationType === "fixed" && !hasInitializedFixedMode) {
      // Get current time
      const now = new Date();

      // Calculate minutes to the next 5-minute interval
      const currentMinutes = now.getMinutes();
      const remainder = currentMinutes % 5;
      const minutesToAdd = remainder === 0 ? 15 : 5 - remainder + 15;

      // Create new date with rounded minutes plus 15 minutes
      const roundedFifteenMinutesFromNow = new Date(now);
      roundedFifteenMinutesFromNow.setMinutes(now.getMinutes() + minutesToAdd);
      roundedFifteenMinutesFromNow.setSeconds(0);
      roundedFifteenMinutesFromNow.setMilliseconds(0);

      // Set tournament start to 1 day from now (matching registration end default)
      const oneDayFromNow = new Date(now);
      oneDayFromNow.setTime(now.getTime() + 24 * 60 * 60 * 1000);
      oneDayFromNow.setSeconds(0);
      oneDayFromNow.setMilliseconds(0);

      // Update the form's start time to 1 day from now
      form.setValue("startTime", oneDayFromNow);

      // Update the minimum start time
      setMinStartTime(roundedFifteenMinutesFromNow);

      // Initialize registration times if not already set
      if (!registrationStartTime) {
        setRegistrationStartTime(now);
        form.setValue("registrationStartTime", now);
      }
      if (!registrationEndTime) {
        setRegistrationEndTime(oneDayFromNow);
        form.setValue("registrationEndTime", oneDayFromNow);
      }

      // Mark as initialized
      setHasInitializedFixedMode(true);
    }
  }, [
    registrationType,
    hasInitializedFixedMode,
    form,
    registrationStartTime,
    registrationEndTime,
  ]);

  const startTime = form.watch("startTime");

  useEffect(() => {
    // Get current end time from form
    const currentEndTime = form.watch("endTime");

    // Calculate minimum required end time (start time + 1 hour)
    const minRequiredEndTime = new Date(startTime);
    minRequiredEndTime.setHours(startTime.getHours() + 1);
    minRequiredEndTime.setSeconds(0);
    minRequiredEndTime.setMilliseconds(0);

    // Update minEndTime for the calendar validation
    setMinEndTime(minRequiredEndTime);

    // Only update the end time if it's before the minimum required time
    if (!currentEndTime || currentEndTime < minRequiredEndTime) {
      // Set default end time to EXACTLY 1 day ahead
      const oneDayFromStartTime = new Date(startTime);

      // Set to exactly 24 hours (1 day) later
      oneDayFromStartTime.setTime(startTime.getTime() + 24 * 60 * 60 * 1000);

      // Ensure seconds and milliseconds are zero
      oneDayFromStartTime.setSeconds(0);
      oneDayFromStartTime.setMilliseconds(0);

      // Update the form's end time
      form.setValue("endTime", oneDayFromStartTime);
    }
  }, [startTime, form]);

  // Update duration based on start and end times
  useEffect(() => {
    const startTime = form.watch("startTime");
    const endTime = form.watch("endTime");

    if (startTime && endTime && endTime > startTime) {
      // Calculate duration in seconds
      const durationInSeconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000
      );

      // Only update if it's a valid duration (at least 1 hour)
      if (durationInSeconds >= 3600) {
        form.setValue("duration", durationInSeconds);

        // Enforce minimum 24-hour submission period only for non-privileged accounts
        if (!isPrivileged) {
          const currentSubmissionPeriod = form.watch("submissionPeriod");
          if (currentSubmissionPeriod < SECONDS_IN_DAY) {
            form.setValue("submissionPeriod", SECONDS_IN_DAY);
          }
        }
      }
    }
  }, [form.watch("endTime"), form, isPrivileged]);

  useEffect(() => {
    const startTime = form.watch("startTime");
    const duration = form.watch("duration");

    if (startTime && duration) {
      // Calculate new end time based on start time + duration
      const newEndTime = new Date(startTime.getTime() + duration * 1000);

      // Update the form's end time
      form.setValue("endTime", newEndTime);
    }
  }, [form.watch("duration"), form]);

  return (
    <>
      <div className="flex flex-col gap-5 lg:p-2 2xl:p-4 overflow-visible">
        <div className="flex flex-col">
          <span className="font-brand text-lg sm:text-xl lg:text-2xl 2xl:text-3xl 3xl:text-4xl font-bold">
            Schedule
          </span>
          <div className="w-full h-0.5 bg-brand/25" />
        </div>

        {/* Interactive Schedule Slider */}
        <div className="px-4 overflow-visible">
          {/* Controls Section - Bordered Boxes */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            {/* Duration Box */}
            <div className="flex-1 border-2 border-brand-muted rounded-lg p-4 bg-black/20">
              <div className="flex flex-col gap-3">
                <div className="flex flex-row items-center gap-2">
                  <FormLabel className="font-brand text-base xl:text-lg">
                    Duration
                  </FormLabel>
                  <FormDescription className="text-xs xl:text-sm">
                    - How long the tournament will run
                  </FormDescription>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {PREDEFINED_DURATIONS.map(({ value, label }) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={
                        form.watch("duration") === value ? "default" : "outline"
                      }
                      onClick={() => {
                        form.setValue("duration", value);

                        const selectedDuration = PREDEFINED_DURATIONS.find(
                          (d) => d.value === value
                        );
                        const durationLabel = selectedDuration?.label;

                        if (
                          durationLabel &&
                          DURATION_TO_DEFAULT_SUBMISSION[
                            durationLabel as keyof typeof DURATION_TO_DEFAULT_SUBMISSION
                          ]
                        ) {
                          form.setValue(
                            "submissionPeriod",
                            DURATION_TO_DEFAULT_SUBMISSION[
                              durationLabel as keyof typeof DURATION_TO_DEFAULT_SUBMISSION
                            ]
                          );
                        } else {
                          form.setValue("submissionPeriod", SECONDS_IN_DAY);
                        }
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Registration Period Box */}
            <div className="flex-1 border-2 border-brand-muted rounded-lg p-4 bg-black/20">
              <div className="flex flex-col gap-3">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-row items-center gap-2 flex-1">
                    <FormLabel className="font-brand text-base xl:text-lg">
                      Registration Period
                    </FormLabel>
                    <FormDescription className="text-xs xl:text-sm">
                      - Control when users can register
                    </FormDescription>
                    <HoverCard openDelay={50} closeDelay={0}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="w-4 h-4 text-neutral hover:text-brand transition-colors cursor-pointer flex-shrink-0"
                        >
                          <INFO />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="bottom"
                        align="end"
                        className="w-80 xl:w-96 p-4 text-sm z-[9999] whitespace-normal"
                      >
                        <div className="flex flex-col gap-3">
                          <h4 className="text-base font-semibold whitespace-normal break-words">
                            Registration Period
                          </h4>
                          <p className="text-sm text-neutral leading-relaxed whitespace-normal break-words">
                            <span className="font-medium text-brand">
                              Off (Open):
                            </span>{" "}
                            Users can register anytime during the tournament
                          </p>
                          <p className="text-sm text-neutral leading-relaxed whitespace-normal break-words">
                            <span className="font-medium text-brand">
                              On (Pre-register):
                            </span>{" "}
                            Set a specific registration window before the tournament
                            with capped entries
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <Switch
                    id="registration-period"
                    checked={registrationType === "fixed"}
                    onCheckedChange={(checked: boolean) =>
                      form.setValue("type", checked ? "fixed" : "open")
                    }
                  />
                </div>

                {/* Registration Period Presets (only shown when enabled) */}
                {registrationType === "fixed" && enableRegistration && (
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    {PREDEFINED_DURATIONS.map(({ value, label }) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={
                          registrationStartTime &&
                          registrationEndTime &&
                          Math.floor(
                            (registrationEndTime.getTime() -
                              registrationStartTime.getTime()) /
                              1000
                          ) === value
                            ? "default"
                            : "outline"
                        }
                        onClick={() => {
                          if (registrationStartTime) {
                            const newRegEndTime = new Date(
                              registrationStartTime.getTime() + value * 1000
                            );
                            setRegistrationEndTime(newRegEndTime);

                            // Also update tournament start to match new registration end
                            form.setValue("startTime", newRegEndTime);

                            // Update tournament end to maintain current duration
                            const currentDuration = form.watch("duration");
                            const newTournamentEndTime = new Date(
                              newRegEndTime.getTime() + currentDuration * 1000
                            );
                            form.setValue("endTime", newTournamentEndTime);
                          }
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="w-full h-0.5 bg-brand/25 mb-6" />

          {/* Timeline Header */}
          <div className="flex flex-row items-center justify-between gap-4 mb-4">
            <div className="flex flex-row items-center gap-4">
              <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                Timeline
              </FormLabel>
              <FormDescription className="hidden lg:block sm:text-xs xl:text-sm 3xl:text-base">
                Drag the timeline points or click icons to adjust dates
              </FormDescription>
            </div>

            {/* Reset Button */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const currentMinutes = now.getMinutes();
                const remainder = currentMinutes % 5;
                const minutesToAdd = remainder === 0 ? 15 : 5 - remainder + 15;

                const roundedFifteenMinutesFromNow = new Date(now);
                roundedFifteenMinutesFromNow.setMinutes(
                  now.getMinutes() + minutesToAdd
                );
                roundedFifteenMinutesFromNow.setSeconds(0);
                roundedFifteenMinutesFromNow.setMilliseconds(0);

                let tournamentStartTime;
                let tournamentEndTime;

                if (registrationType === "fixed") {
                  // For fixed registration, tournament starts 1 day from now
                  const oneDayFromNow = new Date(now);
                  oneDayFromNow.setTime(now.getTime() + 24 * 60 * 60 * 1000);
                  oneDayFromNow.setSeconds(0);
                  oneDayFromNow.setMilliseconds(0);

                  tournamentStartTime = oneDayFromNow;
                  tournamentEndTime = new Date(
                    oneDayFromNow.getTime() + 24 * 60 * 60 * 1000
                  );

                  // Reset registration times
                  setRegistrationStartTime(now);
                  setRegistrationEndTime(oneDayFromNow);
                } else {
                  // For open tournaments, start 15 minutes from now
                  tournamentStartTime = roundedFifteenMinutesFromNow;
                  tournamentEndTime = new Date(
                    roundedFifteenMinutesFromNow.getTime() + 24 * 60 * 60 * 1000
                  );
                }

                // Reset all times to defaults
                form.setValue("startTime", tournamentStartTime);
                form.setValue("endTime", tournamentEndTime);
                form.setValue("duration", SECONDS_IN_DAY);
                form.setValue("submissionPeriod", SECONDS_IN_DAY);

                setMinStartTime(roundedFifteenMinutesFromNow);
                setMinEndTime(tournamentEndTime);

                // Reset the initialization flag so fixed mode can re-initialize if needed
                setHasInitializedFixedMode(false);
              }}
            >
              Reset
            </Button>
          </div>

          {/* Visual Slider - Desktop only (hidden on mobile) */}
          <div className="hidden lg:block">
            <ScheduleSlider
              startTime={form.watch("startTime")}
              endTime={form.watch("endTime")}
              submissionPeriod={form.watch("submissionPeriod")}
              enableRegistration={enableRegistration}
              registrationType={form.watch("type")}
              registrationStartTime={registrationStartTime}
              registrationEndTime={registrationEndTime}
              onStartTimeChange={(date) => form.setValue("startTime", date)}
              onEndTimeChange={(date) => form.setValue("endTime", date)}
              onSubmissionPeriodChange={(seconds) =>
                form.setValue("submissionPeriod", seconds)
              }
              onRegistrationStartTimeChange={(date) => {
                setRegistrationStartTime(date);
                form.setValue("registrationStartTime", date);
              }}
              onRegistrationEndTimeChange={(date) => {
                setRegistrationEndTime(date);
                form.setValue("registrationEndTime", date);
              }}
              minStartTime={minStartTime}
              minEndTime={minEndTime}
              disablePastStartDates={disablePastStartDates}
              disablePastEndDates={disablePastEndDates}
              allowShortSubmissionPeriod={isPrivileged}
            />
          </div>

          {/* Timeline - Mobile only (visible on mobile) */}
          <div className="lg:hidden flex justify-center py-4">
            {form.watch("startTime") && form.watch("endTime") && (
              <TournamentTimeline
                type={form.watch("type")}
                createdTime={
                  registrationStartTime
                    ? Math.floor(registrationStartTime.getTime() / 1000)
                    : Math.floor(Date.now() / 1000)
                }
                startTime={Math.floor(form.watch("startTime").getTime() / 1000)}
                duration={Math.floor(
                  (form.watch("endTime").getTime() -
                    form.watch("startTime").getTime()) /
                    1000
                )}
                submissionPeriod={form.watch("submissionPeriod")}
                registrationEndTime={
                  registrationEndTime
                    ? Math.floor(registrationEndTime.getTime() / 1000)
                    : undefined
                }
                pulse={false}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Schedule;
