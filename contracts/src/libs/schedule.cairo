use budokan::models::schedule::{Schedule, Period, Phase};
use budokan::constants::{
    MIN_REGISTRATION_PERIOD, MAX_REGISTRATION_PERIOD, MIN_TOURNAMENT_LENGTH, MAX_TOURNAMENT_LENGTH,
    MIN_SUBMISSION_PERIOD, MAX_SUBMISSION_PERIOD,
};

#[generate_trait]
pub impl ScheduleImpl of ScheduleTrait {
    fn current_phase(self: Schedule, current_time: u64) -> Phase {
        // if no registration period was provided, use 0 as start and end
        let registration_period = self.registration.unwrap_or(Period { start: 0, end: 0 });

        if current_time < registration_period.start {
            Phase::Scheduled
        } else if current_time < registration_period.end {
            Phase::Registration
        } else if current_time < self.game.start {
            Phase::Staging
        } else if current_time < self.game.end {
            Phase::Live
        } else if current_time < self.game.end + self.submission_duration {
            Phase::Submission
        } else {
            Phase::Finalized
        }
    }

    /// @notice Validates all aspects of a tournament schedule
    /// @return bool indicating if the schedule is valid
    fn is_valid(self: Schedule) -> bool {
        let game_valid = self.game.is_valid_game_schedule();
        let submission_valid = self.is_valid_submission_duration();
        let registration_valid = if let Option::Some(_) = self.registration {
            self.is_valid_registration_schedule()
        } else {
            true
        };

        game_valid && submission_valid && registration_valid
    }

    /// @notice Validates the game period schedule
    fn is_valid_game_schedule(self: Period) -> bool {
        self.ends_after_start() && self.is_min_duration() && self.is_max_duration()
    }

    /// @notice Checks if the submission duration is valid
    fn is_valid_submission_duration(self: Schedule) -> bool {
        self.submission_duration >= MIN_SUBMISSION_PERIOD.into()
            && self.submission_duration <= MAX_SUBMISSION_PERIOD.into()
    }

    /// @notice Validates the registration period schedule
    /// @dev This should only be called if registration exists
    fn is_valid_registration_schedule(self: Schedule) -> bool {
        let registration = self.registration.unwrap();
        registration.is_min_registration_period()
            && registration.is_less_than_max_registration_period()
            && registration.is_registration_starts_before_tournament_starts(self.game.start)
            && registration.is_registration_ends_before_tournament_ends(self.game.end)
    }

    /// @notice Checks if the registration period meets minimum duration
    fn is_min_registration_period(self: Period) -> bool {
        self.end - self.start >= MIN_REGISTRATION_PERIOD.into()
    }

    /// @notice Checks if the registration period doesn't exceed maximum duration
    fn is_less_than_max_registration_period(self: Period) -> bool {
        self.end - self.start <= MAX_REGISTRATION_PERIOD.into()
    }

    /// @notice Checks if registration starts before the tournament
    fn is_registration_starts_before_tournament_starts(
        self: Period, tournament_start: u64,
    ) -> bool {
        self.start < tournament_start
    }

    /// @notice Checks if registration ends before the tournament ends
    fn is_registration_ends_before_tournament_ends(self: Period, tournament_end: u64) -> bool {
        self.end < tournament_end
    }

    /// @notice Checks if registration ends before the game period starts
    fn is_registration_ends_before_game_starts(self: Period, game_start: u64) -> bool {
        self.end <= game_start
    }

    /// @notice Checks if the tournament meets minimum duration
    fn is_min_duration(self: Period) -> bool {
        self.end - self.start >= MIN_TOURNAMENT_LENGTH.into()
    }

    /// @notice Checks if the tournament doesn't exceed maximum duration
    fn is_max_duration(self: Period) -> bool {
        self.end - self.start <= MAX_TOURNAMENT_LENGTH.into()
    }

    /// @notice Checks if the tournament is finalized
    fn is_tournament_finalized(self: Schedule, current_time: u64) -> bool {
        self.current_phase(current_time) == Phase::Finalized
    }

    /// @notice Checks if registration is currently open for the tournament
    fn is_registration_open(self: Schedule, current_time: u64) -> bool {
        match self.registration {
            Option::Some(_) => self.current_phase(current_time) == Phase::Registration,
            // if registration period is None, then registration is always open
            Option::None => true,
        }
    }

    /// @notice Checks if the tournament is still active
    fn is_active(self: Period, current_time: u64) -> bool {
        self.end > current_time
    }

    fn ends_after_start(self: Period) -> bool {
        self.end > self.start
    }
}

#[generate_trait]
pub impl ScheduleAssertionsImpl of ScheduleAssertionsTrait {
    /// @notice Asserts that all aspects of a tournament schedule are valid
    fn assert_is_valid(self: Schedule) {
        // Validate game schedule
        self.game.assert_valid_game_schedule();

        // Validate submission duration
        self.assert_valid_submission_duration();

        // Validate registration if present
        if let Option::Some(_) = self.registration {
            self.assert_valid_registration_schedule();
        }
    }

    fn assert_valid_game_schedule(self: Period) {
        self.assert_ends_after_start();
        self.assert_min_duration();
        self.assert_max_duration();
    }

    fn assert_ends_after_start(self: Period) {
        assert!(self.ends_after_start(), "Schedule: Tournament end time must be after start time");
    }

    fn assert_valid_submission_duration(self: Schedule) {
        assert!(
            self.is_valid_submission_duration(),
            "Schedule: Submission duration must be between {} and {}",
            MIN_SUBMISSION_PERIOD,
            MAX_SUBMISSION_PERIOD,
        );
    }

    /// @notice Asserts that the registration schedule is valid
    /// @dev This should only be called if registration exists
    fn assert_valid_registration_schedule(self: Schedule) {
        let registration = self.registration.unwrap();
        registration.assert_min_registration_period();
        registration.assert_less_than_max_registration_period();
        registration.assert_registration_starts_before_tournament_starts(self.game.start);
        registration.assert_registration_ends_before_tournament_ends(self.game.end);
    }

    fn assert_min_registration_period(self: Period) {
        assert!(
            self.is_min_registration_period(),
            "Schedule: Registration period less than minimum of {}",
            MIN_REGISTRATION_PERIOD,
        );
    }

    fn assert_less_than_max_registration_period(self: Period) {
        assert!(
            self.is_less_than_max_registration_period(),
            "Schedule: Registration period greater than maximum of {}",
            MAX_REGISTRATION_PERIOD,
        );
    }

    fn assert_registration_starts_before_tournament_starts(self: Period, tournament_start: u64) {
        assert!(
            self.is_registration_starts_before_tournament_starts(tournament_start),
            "Schedule: Registration start time {} is after tournament start time {}",
            self.start,
            tournament_start,
        );
    }

    fn assert_registration_ends_before_tournament_ends(self: Period, tournament_end: u64) {
        assert!(
            self.is_registration_ends_before_tournament_ends(tournament_end),
            "Schedule: Registration end time {} is after tournament end time {}",
            self.end,
            tournament_end,
        );
    }

    fn assert_registration_ends_before_game_starts(self: Period, game_start: u64) {
        assert!(
            self.is_registration_ends_before_game_starts(game_start),
            "Schedule: Registration end time {} is after game start time {}",
            self.end,
            game_start,
        );
    }

    /// @notice Asserts that a registration period exists and ends before game starts
    /// @dev This is used when a registration_only extension requires a gap between registration and
    /// game
    fn assert_has_registration_period_before_game_start(self: Schedule) {
        assert!(
            self.registration.is_some(),
            "Schedule: Extension requires a registration period but none was provided",
        );
        let registration = self.registration.unwrap();
        assert!(
            registration.end < self.game.start,
            "Schedule: Extension requires registration to end before game starts. Registration ends at {}, game starts at {}",
            registration.end,
            self.game.start,
        );
    }

    fn assert_min_duration(self: Period) {
        assert!(
            self.is_min_duration(),
            "Schedule: Tournament duration less than minimum of {}",
            MIN_TOURNAMENT_LENGTH,
        );
    }

    fn assert_max_duration(self: Period) {
        assert!(
            self.is_max_duration(),
            "Schedule: Tournament duration greater than maximum of {}",
            MAX_TOURNAMENT_LENGTH,
        );
    }

    fn assert_tournament_is_finalized(self: Schedule, current_time: u64) {
        assert!(
            self.is_tournament_finalized(current_time), "Schedule: Tournament is not finalized",
        );
    }

    fn assert_registration_open(self: Schedule, current_time: u64) {
        assert!(self.is_registration_open(current_time), "Schedule: Registration is not open");
    }

    fn assert_is_active(self: Period, current_time: u64) {
        assert!(self.is_active(current_time), "Schedule: Tournament has ended");
    }
}

#[cfg(test)]
mod tests {
    use super::{ScheduleTrait, ScheduleAssertionsTrait, Schedule, Period, Phase};
    use budokan::constants::{
        MIN_REGISTRATION_PERIOD, MAX_REGISTRATION_PERIOD, MIN_TOURNAMENT_LENGTH,
        MAX_TOURNAMENT_LENGTH, MIN_SUBMISSION_PERIOD, MAX_SUBMISSION_PERIOD,
    };
    use core::num::traits::Bounded;

    #[test]
    fn current_phase() {
        // Case 1: No registration period
        let schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: 50,
        };

        assert!(
            schedule.current_phase(50) == Phase::Staging, "Should be Staging prior to game start",
        );
        assert!(schedule.current_phase(150) == Phase::Live, "Should be Live during game period");
        assert!(
            schedule.current_phase(220) == Phase::Submission, "Should be Submission after game",
        );
        assert!(
            schedule.current_phase(251) == Phase::Finalized, "Should be Finalized after submission",
        );

        // Case 2: With registration period
        let schedule_with_reg = Schedule {
            registration: Option::Some(Period { start: 50, end: 80 }),
            game: Period { start: 100, end: 200 },
            submission_duration: 50,
        };

        assert!(
            schedule_with_reg.current_phase(40) == Phase::Scheduled,
            "Should be Scheduled before registration",
        );
        assert!(
            schedule_with_reg.current_phase(60) == Phase::Registration,
            "Should be Registration during registration period",
        );
        assert!(
            schedule_with_reg.current_phase(90) == Phase::Staging,
            "Should be Staging between registration and game",
        );
        assert!(
            schedule_with_reg.current_phase(150) == Phase::Live,
            "Should be Live during game period",
        );
        assert!(
            schedule_with_reg.current_phase(220) == Phase::Submission,
            "Should be Submission during submission period",
        );
        assert!(
            schedule_with_reg.current_phase(251) == Phase::Finalized,
            "Should be Finalized after submission period",
        );

        // Case 3: Edge cases at transition points
        let edge_schedule = Schedule {
            registration: Option::Some(Period { start: 100, end: 200 }),
            game: Period { start: 300, end: 400 },
            submission_duration: 50,
        };

        assert!(
            edge_schedule.current_phase(99) == Phase::Scheduled,
            "Should be Scheduled right before registration",
        );
        assert!(
            edge_schedule.current_phase(100) == Phase::Registration,
            "Should be Registration at exact registration start",
        );
        assert!(
            edge_schedule.current_phase(200) == Phase::Staging,
            "Should be Staging at exact registration end",
        );
        assert!(
            edge_schedule.current_phase(300) == Phase::Live, "Should be Live at exact game start",
        );
        assert!(
            edge_schedule.current_phase(400) == Phase::Submission,
            "Should be Submission at exact game end",
        );
        assert!(
            edge_schedule.current_phase(450) == Phase::Finalized,
            "Should be Finalized at exact submission end",
        );

        // Case 4: Boundary conditions with u64::MAX
        let max_schedule = Schedule {
            registration: Option::Some(
                Period { start: Bounded::MAX - 100, end: Bounded::MAX - 80 },
            ),
            game: Period { start: Bounded::MAX - 50, end: Bounded::MAX - 20 },
            submission_duration: 10,
        };

        assert!(
            max_schedule.current_phase(Bounded::MAX - 101) == Phase::Scheduled,
            "Should handle scheduling near u64::MAX",
        );
        assert!(
            max_schedule.current_phase(Bounded::MAX - 90) == Phase::Registration,
            "Should handle registration near u64::MAX",
        );
        assert!(
            max_schedule.current_phase(Bounded::MAX - 60) == Phase::Staging,
            "Should handle staging near u64::MAX",
        );
        assert!(
            max_schedule.current_phase(Bounded::MAX - 30) == Phase::Live,
            "Should handle live phase near u64::MAX",
        );
        assert!(
            max_schedule.current_phase(Bounded::MAX - 15) == Phase::Submission,
            "Should handle submission near u64::MAX",
        );
        assert!(
            max_schedule.current_phase(Bounded::MAX) == Phase::Finalized,
            "Should handle finalized at u64::MAX",
        );
    }

    #[test]
    fn is_valid() {
        // Case 1: All valid with registration
        let valid_schedule = Schedule {
            registration: Option::Some(Period { start: 1000, end: 2000 }),
            game: Period { start: 3000, end: 4000 },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(valid_schedule.is_valid(), "Should be valid when all conditions met");

        // Case 2: All valid without registration
        let valid_no_reg = Schedule {
            registration: Option::None,
            game: Period { start: 3000, end: 4000 },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(valid_no_reg.is_valid(), "Should be valid without registration");

        // Case 3: Invalid game period
        let invalid_game = Schedule {
            registration: Option::None,
            game: Period { start: 1000, end: 500 }, // end before start
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(!invalid_game.is_valid(), "Should be invalid with invalid game period");

        // Case 4: Invalid submission duration
        let invalid_submission = Schedule {
            registration: Option::None,
            game: Period { start: 3000, end: 4000 },
            submission_duration: MIN_SUBMISSION_PERIOD.into() - 1,
        };
        assert!(
            !invalid_submission.is_valid(), "Should be invalid with invalid submission duration",
        );
    }

    #[test]
    fn is_valid_submission_duration() {
        // Case 1: Valid submission duration at minimum
        let min_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            min_schedule.is_valid_submission_duration(),
            "Should be valid at minimum submission duration",
        );

        // Case 2: Valid submission duration at maximum
        let max_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MAX_SUBMISSION_PERIOD.into(),
        };
        assert!(
            max_schedule.is_valid_submission_duration(),
            "Should be valid at maximum submission duration",
        );

        // Case 3: Invalid submission duration below minimum
        let below_min_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MIN_SUBMISSION_PERIOD.into() - 1,
        };
        assert!(
            !below_min_schedule.is_valid_submission_duration(),
            "Should be invalid below minimum submission duration",
        );

        // Case 4: Invalid submission duration above maximum
        let above_max_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MAX_SUBMISSION_PERIOD.into() + 1,
        };
        assert!(
            !above_max_schedule.is_valid_submission_duration(),
            "Should be invalid above maximum submission duration",
        );

        // Case 5: Valid submission duration in middle of range
        let mid_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: (MIN_SUBMISSION_PERIOD.into() + MAX_SUBMISSION_PERIOD.into()) / 2,
        };
        assert!(
            mid_schedule.is_valid_submission_duration(),
            "Should be valid at middle of submission duration range",
        );
    }

    #[test]
    fn submission_duration_boundary_conditions() {
        // Case 1: Test at u64 boundaries
        let max_u64_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: Bounded::MAX,
        };
        assert!(!max_u64_schedule.is_valid_submission_duration(), "Should be invalid at u64::MAX");

        // Case 2: Test at zero
        let zero_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: 0,
        };
        assert!(!zero_schedule.is_valid_submission_duration(), "Should be invalid at zero");

        // Case 3: Test one below minimum
        let min_minus_one = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MIN_SUBMISSION_PERIOD.into() - 1,
        };
        assert!(
            !min_minus_one.is_valid_submission_duration(), "Should be invalid at one below minimum",
        );

        // Case 4: Test one above maximum
        let max_plus_one = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MAX_SUBMISSION_PERIOD.into() + 1,
        };
        assert!(
            !max_plus_one.is_valid_submission_duration(), "Should be invalid at one above maximum",
        );
    }

    #[test]
    #[should_panic(expected: ("Schedule: Submission duration must be between 900 and 604800",))]
    fn assert_valid_submission_duration_min() {
        let invalid_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MIN_SUBMISSION_PERIOD.into() - 1,
        };
        invalid_schedule.assert_valid_submission_duration();
    }

    #[test]
    #[should_panic(expected: ("Schedule: Submission duration must be between 900 and 604800",))]
    fn assert_valid_submission_duration_max() {
        let invalid_schedule = Schedule {
            registration: Option::None,
            game: Period { start: 100, end: 200 },
            submission_duration: MAX_SUBMISSION_PERIOD.into() + 1,
        };
        invalid_schedule.assert_valid_submission_duration();
    }

    #[test]
    fn is_valid_game_schedule() {
        // Case 1: Valid game schedule
        let valid_period = Period { start: 200, end: 200 + MIN_TOURNAMENT_LENGTH.into() };
        assert!(valid_period.is_valid_game_schedule(), "Should be valid with minimum duration");

        // Case 2: Invalid - end before start
        let invalid_order = Period { start: 200, end: 199 };
        assert!(!invalid_order.is_valid_game_schedule(), "Should be invalid when end before start");

        // Case 3: Invalid - duration too short
        let too_short = Period { start: 200, end: 200 + MIN_TOURNAMENT_LENGTH.into() - 1 };
        assert!(!too_short.is_valid_game_schedule(), "Should be invalid with too short duration");

        // Case 4: Invalid - duration too long
        let too_long = Period { start: 200, end: 200 + MAX_TOURNAMENT_LENGTH.into() + 1 };
        assert!(!too_long.is_valid_game_schedule(), "Should be invalid with too long duration");
    }

    #[test]
    fn is_valid_registration_schedule() {
        let game_start = 3000;
        let game_end = 4000;

        // Case 1: Valid registration
        let valid_schedule = Schedule {
            registration: Option::Some(
                Period { start: 100, end: 100 + MIN_REGISTRATION_PERIOD.into() },
            ),
            game: Period { start: game_start, end: game_end },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            valid_schedule.is_valid_registration_schedule(),
            "Should be valid with minimum registration period",
        );

        // Case 2: Invalid - registration starts too late
        let late_reg = Schedule {
            registration: Option::Some(Period { start: game_start + 1, end: game_end }),
            game: Period { start: game_start, end: game_end },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            !late_reg.is_valid_registration_schedule(),
            "Should be invalid when registration starts after game",
        );

        // Case 3: Invalid - registration period too short
        let short_reg = Schedule {
            registration: Option::Some(
                Period { start: 100, end: 100 + MIN_REGISTRATION_PERIOD.into() - 1 },
            ),
            game: Period { start: game_start, end: game_end },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            !short_reg.is_valid_registration_schedule(),
            "Should be invalid with too short registration period",
        );
    }

    #[test]
    fn is_registration_open() {
        // Case 1: No registration period (always open)
        let no_reg = Schedule {
            registration: Option::None,
            game: Period { start: 300, end: 400 },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(no_reg.is_registration_open(0), "Should be open with no registration period");
        assert!(no_reg.is_registration_open(500), "Should be open even after game end");

        // Case 2: With registration period
        let with_reg = Schedule {
            registration: Option::Some(Period { start: 100, end: 200 }),
            game: Period { start: 300, end: 400 },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(!with_reg.is_registration_open(50), "Should be closed before registration");
        assert!(with_reg.is_registration_open(150), "Should be open during registration");
        assert!(!with_reg.is_registration_open(250), "Should be closed after registration");
    }

    #[test]
    fn is_active() {
        let period = Period { start: 100, end: 200 };

        assert!(period.is_active(50), "Should be active before start");
        assert!(period.is_active(150), "Should be active during period");
        assert!(!period.is_active(200), "Should not be active at end time");
        assert!(!period.is_active(250), "Should not be active after end");
    }

    #[test]
    #[should_panic(expected: ("Schedule: Tournament has ended",))]
    fn assert_is_active() {
        let period = Period { start: 100, end: 200 };
        period.assert_is_active(200);
    }

    #[test]
    fn boundary_conditions() {
        // Test near u64::MAX
        let max_schedule = Schedule {
            registration: Option::Some(
                Period { start: Bounded::MAX - 10000, end: Bounded::MAX - 8000 },
            ),
            game: Period { start: Bounded::MAX - 5000, end: Bounded::MAX - 1000 },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };

        assert!(max_schedule.is_valid(), "Should handle scheduling near u64::MAX");
        assert!(
            max_schedule.is_registration_open(Bounded::MAX - 9000),
            "Should handle registration near u64::MAX",
        );
        assert!(
            max_schedule.game.is_active(Bounded::MAX - 2000),
            "Should handle activity check near u64::MAX",
        );
    }

    #[test]
    fn registration_period_validation() {
        let current_time = 500;
        let game_start = 3000;
        let game_end = 4000;

        // Case 1: Valid - registration ends after game start
        let reg_ends_after_game_start = Schedule {
            registration: Option::Some(
                Period { start: 100, end: game_start + 100 // Registration ends after game starts
                },
            ),
            game: Period { start: game_start, end: game_end },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            reg_ends_after_game_start.is_valid_registration_schedule(),
            "Should be valid for registration to end after game starts",
        );

        // Case 2: Invalid - registration period exceeds maximum
        let reg_too_long = Schedule {
            registration: Option::Some(
                Period { start: 100, end: 100 + MAX_REGISTRATION_PERIOD.into() + 1 },
            ),
            game: Period { start: game_start, end: game_end },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            !reg_too_long.is_valid_registration_schedule(),
            "Should be invalid when registration period exceeds maximum",
        );

        // Case 3: Valid - registration starts in the past
        let reg_in_past = Schedule {
            registration: Option::Some(
                Period {
                    start: current_time - 100, // Start in past
                    end: current_time + MIN_REGISTRATION_PERIOD.into(),
                },
            ),
            game: Period { start: game_start, end: game_end },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(
            reg_in_past.is_valid_registration_schedule(),
            "Should be valid for registration to start in the past",
        );
    }

    #[test]
    fn game_period_validation() {
        let current_time = 50;

        // Case 1: Invalid - game starts in the past
        let game_in_past = Schedule {
            registration: Option::None,
            game: Period {
                start: current_time - 1, end: current_time + MIN_TOURNAMENT_LENGTH.into(),
            },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(game_in_past.is_valid(), "Games can start in past");

        // Case 2: Invalid - game period too short
        let game_too_short = Schedule {
            registration: Option::None,
            game: Period {
                start: current_time + 100,
                end: current_time + 100 + MIN_TOURNAMENT_LENGTH.into() - 1,
            },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(!game_too_short.is_valid(), "Should be invalid when game period is too short");

        // Case 3: Invalid - game period too long
        let game_too_long = Schedule {
            registration: Option::None,
            game: Period {
                start: current_time + 100,
                end: current_time + 100 + MAX_TOURNAMENT_LENGTH.into() + 1,
            },
            submission_duration: MIN_SUBMISSION_PERIOD.into(),
        };
        assert!(!game_too_long.is_valid(), "Should be invalid when game period exceeds maximum");
    }

    #[test]
    fn phase_transitions() {
        // Test valid phase transitions with registration
        let schedule = Schedule {
            registration: Option::Some(Period { start: 100, end: 200 }),
            game: Period { start: 300, end: 400 },
            submission_duration: 50,
        };

        // Ensure proper phase sequence
        assert!(schedule.current_phase(50) == Phase::Scheduled, "Should start in Scheduled phase");
        assert!(
            schedule.current_phase(150) == Phase::Registration, "Should transition to Registration",
        );
        assert!(schedule.current_phase(250) == Phase::Staging, "Should transition to Staging");
        assert!(schedule.current_phase(350) == Phase::Live, "Should transition to Live");
        assert!(
            schedule.current_phase(420) == Phase::Submission, "Should transition to Submission",
        );
        assert!(schedule.current_phase(451) == Phase::Finalized, "Should end in Finalized phase");

        // Test no gaps between phases
        assert!(
            schedule.current_phase(199) == Phase::Registration,
            "Should be in Registration until exact end",
        );
        assert!(
            schedule.current_phase(200) == Phase::Staging,
            "Should transition to Staging at exact time",
        );
        assert!(
            schedule.current_phase(299) == Phase::Staging,
            "Should be in Staging until exact game start",
        );
        assert!(
            schedule.current_phase(300) == Phase::Live, "Should transition to Live at exact time",
        );
    }
}
