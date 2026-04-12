use budokan::structs::constants::{
    MAX_REGISTRATION_PERIOD, MAX_SUBMISSION_PERIOD, MAX_TOURNAMENT_LENGTH, MIN_REGISTRATION_PERIOD,
    MIN_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
};
use budokan::structs::schedule::{Phase, Schedule};

#[generate_trait]
pub impl ScheduleImpl of ScheduleTrait {
    /// Returns whether this schedule has a registration period.
    /// Both registration delays must be > 0 for a registration period to exist.
    #[inline(always)]
    fn has_registration(self: Schedule) -> bool {
        self.registration_start_delay > 0 || self.registration_end_delay > 0
    }

    /// Compute current phase from delay-based schedule.
    /// `created_at` is the tournament creation timestamp.
    fn current_phase(self: Schedule, created_at: u64, current_time: u64) -> Phase {
        let has_reg = self.has_registration();

        let reg_start: u64 = created_at + self.registration_start_delay.into();
        let reg_end: u64 = reg_start + self.registration_end_delay.into();
        let game_start: u64 = created_at + self.game_start_delay.into();
        let game_end: u64 = game_start + self.game_end_delay.into();
        let sub_end: u64 = game_end + self.submission_duration.into();

        if has_reg && current_time < reg_start {
            Phase::Scheduled
        } else if has_reg && current_time < reg_end {
            Phase::Registration
        } else if current_time < game_start {
            Phase::Staging
        } else if current_time < game_end {
            Phase::Live
        } else if current_time < sub_end {
            Phase::Submission
        } else {
            Phase::Finalized
        }
    }

    /// Validates all aspects of a tournament schedule
    fn is_valid(self: Schedule) -> bool {
        let game_valid = self.is_valid_game_duration();
        let submission_valid = self.is_valid_submission_duration();
        let registration_valid = if self.has_registration() {
            self.is_valid_registration_schedule()
        } else {
            true
        };

        game_valid && submission_valid && registration_valid
    }

    /// Validates the game duration (game_end_delay)
    fn is_valid_game_duration(self: Schedule) -> bool {
        self.game_end_delay >= MIN_TOURNAMENT_LENGTH && self.game_end_delay <= MAX_TOURNAMENT_LENGTH
    }

    /// Checks if the submission duration is valid
    fn is_valid_submission_duration(self: Schedule) -> bool {
        self.submission_duration >= MIN_SUBMISSION_PERIOD
            && self.submission_duration <= MAX_SUBMISSION_PERIOD
    }

    /// Validates the registration period schedule
    fn is_valid_registration_schedule(self: Schedule) -> bool {
        self.is_valid_registration_duration() && self.is_registration_ends_before_game_starts()
    }

    /// Checks if the registration period meets minimum duration
    fn is_valid_registration_duration(self: Schedule) -> bool {
        self.registration_end_delay >= MIN_REGISTRATION_PERIOD
            && self.registration_end_delay <= MAX_REGISTRATION_PERIOD
    }

    /// Checks if registration ends before game starts
    /// registration_start_delay + registration_end_delay <= game_start_delay
    fn is_registration_ends_before_game_starts(self: Schedule) -> bool {
        let reg_end_offset: u64 = self.registration_start_delay.into()
            + self.registration_end_delay.into();
        reg_end_offset <= self.game_start_delay.into()
    }

    /// Checks if the tournament is finalized
    fn is_tournament_finalized(self: Schedule, created_at: u64, current_time: u64) -> bool {
        self.current_phase(created_at, current_time) == Phase::Finalized
    }

    /// Checks if registration is currently open for the tournament
    fn is_registration_open(self: Schedule, created_at: u64, current_time: u64) -> bool {
        if !self.has_registration() {
            // if no registration period, then registration is always open
            true
        } else {
            self.current_phase(created_at, current_time) == Phase::Registration
        }
    }

    /// Checks if the game period is active (not yet ended)
    fn is_game_active(self: Schedule, created_at: u64, current_time: u64) -> bool {
        let game_end: u64 = created_at + self.game_start_delay.into() + self.game_end_delay.into();
        game_end > current_time
    }
}

#[generate_trait]
pub impl ScheduleAssertionsImpl of ScheduleAssertionsTrait {
    /// Asserts that all aspects of a tournament schedule are valid
    fn assert_is_valid(self: Schedule) {
        // Validate game duration
        self.assert_valid_game_duration();

        // Validate submission duration
        self.assert_valid_submission_duration();

        // Validate registration if present
        if self.has_registration() {
            self.assert_valid_registration_schedule();
        }
    }

    fn assert_valid_game_duration(self: Schedule) {
        assert!(self.game_end_delay > 0, "Budokan: Tournament end time must be after start time");
        assert!(
            self.game_end_delay >= MIN_TOURNAMENT_LENGTH,
            "Budokan: Tournament duration less than minimum of {}",
            MIN_TOURNAMENT_LENGTH,
        );
        assert!(
            self.game_end_delay <= MAX_TOURNAMENT_LENGTH,
            "Budokan: Tournament duration greater than maximum of {}",
            MAX_TOURNAMENT_LENGTH,
        );
    }

    fn assert_valid_submission_duration(self: Schedule) {
        assert!(
            self.is_valid_submission_duration(),
            "Budokan: Submission duration must be between {} and {}",
            MIN_SUBMISSION_PERIOD,
            MAX_SUBMISSION_PERIOD,
        );
    }

    /// Asserts that the registration schedule is valid
    fn assert_valid_registration_schedule(self: Schedule) {
        assert!(
            self.registration_end_delay >= MIN_REGISTRATION_PERIOD,
            "Budokan: Registration period less than minimum of {}",
            MIN_REGISTRATION_PERIOD,
        );
        assert!(
            self.registration_end_delay <= MAX_REGISTRATION_PERIOD,
            "Budokan: Registration period greater than maximum of {}",
            MAX_REGISTRATION_PERIOD,
        );
        let reg_end_offset: u64 = self.registration_start_delay.into()
            + self.registration_end_delay.into();
        assert!(
            reg_end_offset <= self.game_start_delay.into(),
            "Budokan: Registration end time {} is after game start time {}",
            reg_end_offset,
            self.game_start_delay,
        );
    }

    /// Asserts that a registration period exists and ends before game starts
    fn assert_has_registration_period_before_game_start(self: Schedule) {
        assert!(
            self.has_registration(),
            "Budokan: Extension requires a registration period but none was provided",
        );
        let reg_end_offset: u64 = self.registration_start_delay.into()
            + self.registration_end_delay.into();
        assert!(
            reg_end_offset < self.game_start_delay.into(),
            "Budokan: Extension requires registration to end before game starts. Registration ends at offset {}, game starts at offset {}",
            reg_end_offset,
            self.game_start_delay,
        );
    }

    fn assert_tournament_is_finalized(self: Schedule, created_at: u64, current_time: u64) {
        assert!(
            self.is_tournament_finalized(created_at, current_time),
            "Budokan: Tournament is not finalized",
        );
    }

    fn assert_registration_open(self: Schedule, created_at: u64, current_time: u64) {
        assert!(
            self.is_registration_open(created_at, current_time),
            "Budokan: Registration is not open",
        );
    }

    fn assert_game_is_active(self: Schedule, created_at: u64, current_time: u64) {
        assert!(self.is_game_active(created_at, current_time), "Budokan: Tournament has ended");
    }
}

#[cfg(test)]
mod tests {
    use budokan::structs::constants::{
        MAX_SUBMISSION_PERIOD, MAX_TOURNAMENT_LENGTH,
        MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
    };
    use super::{Phase, Schedule, ScheduleAssertionsTrait, ScheduleTrait};

    #[test]
    fn current_phase() {
        let created_at: u64 = 1000;

        // Case 1: No registration period
        let schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 100,
            game_end_delay: 100,
            submission_duration: 50,
        };

        assert!(
            schedule.current_phase(created_at, 1050) == Phase::Staging,
            "Should be Staging prior to game start",
        );
        assert!(
            schedule.current_phase(created_at, 1150) == Phase::Live,
            "Should be Live during game period",
        );
        assert!(
            schedule.current_phase(created_at, 1220) == Phase::Submission,
            "Should be Submission after game",
        );
        assert!(
            schedule.current_phase(created_at, 1251) == Phase::Finalized,
            "Should be Finalized after submission",
        );

        // Case 2: With registration period
        let schedule_with_reg = Schedule {
            registration_start_delay: 50, // reg starts at 1050
            registration_end_delay: 30, // reg ends at 1080
            game_start_delay: 100, // game starts at 1100
            game_end_delay: 100, // game ends at 1200
            submission_duration: 50 // submission ends at 1250
        };

        assert!(
            schedule_with_reg.current_phase(created_at, 1040) == Phase::Scheduled,
            "Should be Scheduled before registration",
        );
        assert!(
            schedule_with_reg.current_phase(created_at, 1060) == Phase::Registration,
            "Should be Registration during registration period",
        );
        assert!(
            schedule_with_reg.current_phase(created_at, 1090) == Phase::Staging,
            "Should be Staging between registration and game",
        );
        assert!(
            schedule_with_reg.current_phase(created_at, 1150) == Phase::Live,
            "Should be Live during game period",
        );
        assert!(
            schedule_with_reg.current_phase(created_at, 1220) == Phase::Submission,
            "Should be Submission during submission period",
        );
        assert!(
            schedule_with_reg.current_phase(created_at, 1251) == Phase::Finalized,
            "Should be Finalized after submission period",
        );

        // Case 3: Edge cases at transition points
        let edge_schedule = Schedule {
            registration_start_delay: 100, // reg starts at 1100
            registration_end_delay: 100, // reg ends at 1200
            game_start_delay: 300, // game starts at 1300
            game_end_delay: 100, // game ends at 1400
            submission_duration: 50 // sub ends at 1450
        };

        assert!(
            edge_schedule.current_phase(created_at, 1099) == Phase::Scheduled,
            "Should be Scheduled right before registration",
        );
        assert!(
            edge_schedule.current_phase(created_at, 1100) == Phase::Registration,
            "Should be Registration at exact registration start",
        );
        assert!(
            edge_schedule.current_phase(created_at, 1200) == Phase::Staging,
            "Should be Staging at exact registration end",
        );
        assert!(
            edge_schedule.current_phase(created_at, 1300) == Phase::Live,
            "Should be Live at exact game start",
        );
        assert!(
            edge_schedule.current_phase(created_at, 1400) == Phase::Submission,
            "Should be Submission at exact game end",
        );
        assert!(
            edge_schedule.current_phase(created_at, 1450) == Phase::Finalized,
            "Should be Finalized at exact submission end",
        );
    }

    #[test]
    fn is_valid() {
        // Case 1: All valid with registration
        let valid_schedule = Schedule {
            registration_start_delay: 100,
            registration_end_delay: MIN_REGISTRATION_PERIOD,
            game_start_delay: 100 + MIN_REGISTRATION_PERIOD + 100, // well after reg ends
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(valid_schedule.is_valid(), "Should be valid when all conditions met");

        // Case 2: All valid without registration
        let valid_no_reg = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 100,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(valid_no_reg.is_valid(), "Should be valid without registration");

        // Case 3: Invalid game duration (too short)
        let invalid_game = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 100,
            game_end_delay: MIN_TOURNAMENT_LENGTH - 1,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(!invalid_game.is_valid(), "Should be invalid with too short game duration");

        // Case 4: Invalid submission duration
        let invalid_submission = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 100,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD - 1,
        };
        assert!(
            !invalid_submission.is_valid(), "Should be invalid with invalid submission duration",
        );
    }

    #[test]
    fn is_valid_submission_duration() {
        // Case 1: Valid submission duration at minimum
        let min_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(
            min_schedule.is_valid_submission_duration(),
            "Should be valid at minimum submission duration",
        );

        // Case 2: Valid submission duration at maximum
        let max_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MAX_SUBMISSION_PERIOD,
        };
        assert!(
            max_schedule.is_valid_submission_duration(),
            "Should be valid at maximum submission duration",
        );

        // Case 3: Invalid submission duration below minimum
        let below_min_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD - 1,
        };
        assert!(
            !below_min_schedule.is_valid_submission_duration(),
            "Should be invalid below minimum submission duration",
        );

        // Case 4: Invalid submission duration above maximum
        let above_max_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MAX_SUBMISSION_PERIOD + 1,
        };
        assert!(
            !above_max_schedule.is_valid_submission_duration(),
            "Should be invalid above maximum submission duration",
        );

        // Case 5: Valid submission duration in middle of range
        let mid_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: (MIN_SUBMISSION_PERIOD + MAX_SUBMISSION_PERIOD) / 2,
        };
        assert!(
            mid_schedule.is_valid_submission_duration(),
            "Should be valid at middle of submission duration range",
        );
    }

    #[test]
    #[should_panic(expected: "Budokan: Submission duration must be between")]
    fn assert_valid_submission_duration_min() {
        let invalid_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD - 1,
        };
        invalid_schedule.assert_valid_submission_duration();
    }

    #[test]
    #[should_panic(expected: "Budokan: Submission duration must be between")]
    fn assert_valid_submission_duration_max() {
        let invalid_schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MAX_SUBMISSION_PERIOD + 1,
        };
        invalid_schedule.assert_valid_submission_duration();
    }

    #[test]
    fn is_valid_game_duration() {
        // Case 1: Valid game duration at minimum
        let valid = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(valid.is_valid_game_duration(), "Should be valid with minimum duration");

        // Case 2: Invalid - duration too short
        let too_short = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MIN_TOURNAMENT_LENGTH - 1,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(!too_short.is_valid_game_duration(), "Should be invalid with too short duration");

        // Case 3: Invalid - duration too long
        let too_long = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 0,
            game_end_delay: MAX_TOURNAMENT_LENGTH + 1,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(!too_long.is_valid_game_duration(), "Should be invalid with too long duration");
    }

    #[test]
    fn is_valid_registration_schedule() {
        // Case 1: Valid registration
        let valid_schedule = Schedule {
            registration_start_delay: 100,
            registration_end_delay: MIN_REGISTRATION_PERIOD,
            game_start_delay: 100 + MIN_REGISTRATION_PERIOD, // reg end == game start (valid)
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(
            valid_schedule.is_valid_registration_schedule(),
            "Should be valid with minimum registration period",
        );

        // Case 2: Invalid - registration period too short
        let short_reg = Schedule {
            registration_start_delay: 100,
            registration_end_delay: MIN_REGISTRATION_PERIOD - 1,
            game_start_delay: 100 + MIN_REGISTRATION_PERIOD,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(
            !short_reg.is_valid_registration_schedule(),
            "Should be invalid with too short registration period",
        );

        // Case 3: Invalid - registration ends after game starts
        let late_reg = Schedule {
            registration_start_delay: 100,
            registration_end_delay: MIN_REGISTRATION_PERIOD,
            game_start_delay: 50, // game starts before registration ends
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(
            !late_reg.is_valid_registration_schedule(),
            "Should be invalid when registration ends after game starts",
        );
    }

    #[test]
    fn is_registration_open() {
        let created_at: u64 = 1000;

        // Case 1: No registration period (always open)
        let no_reg = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 300,
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(
            no_reg.is_registration_open(created_at, 0),
            "Should be open with no registration period",
        );
        assert!(
            no_reg.is_registration_open(created_at, 5000), "Should be open even after game end",
        );

        // Case 2: With registration period
        let with_reg = Schedule {
            registration_start_delay: 100, // starts at 1100
            registration_end_delay: 100, // ends at 1200
            game_start_delay: 300, // game at 1300
            game_end_delay: MIN_TOURNAMENT_LENGTH,
            submission_duration: MIN_SUBMISSION_PERIOD,
        };
        assert!(
            !with_reg.is_registration_open(created_at, 1050),
            "Should be closed before registration",
        );
        assert!(
            with_reg.is_registration_open(created_at, 1150), "Should be open during registration",
        );
        assert!(
            !with_reg.is_registration_open(created_at, 1250), "Should be closed after registration",
        );
    }

    #[test]
    fn is_game_active() {
        let created_at: u64 = 1000;
        let schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 100,
            game_end_delay: 100,
            submission_duration: 50,
        };

        assert!(schedule.is_game_active(created_at, 1050), "Should be active before game start");
        assert!(schedule.is_game_active(created_at, 1150), "Should be active during game");
        assert!(!schedule.is_game_active(created_at, 1200), "Should not be active at game end");
        assert!(!schedule.is_game_active(created_at, 1250), "Should not be active after game end");
    }

    #[test]
    #[should_panic(expected: "Budokan: Tournament has ended")]
    fn assert_game_is_active() {
        let created_at: u64 = 1000;
        let schedule = Schedule {
            registration_start_delay: 0,
            registration_end_delay: 0,
            game_start_delay: 100,
            game_end_delay: 100,
            submission_duration: 50,
        };
        schedule.assert_game_is_active(created_at, 1200);
    }

    #[test]
    fn phase_transitions() {
        let created_at: u64 = 1000;
        // Test valid phase transitions with registration
        let schedule = Schedule {
            registration_start_delay: 100, // reg starts at 1100
            registration_end_delay: 100, // reg ends at 1200
            game_start_delay: 300, // game starts at 1300
            game_end_delay: 100, // game ends at 1400
            submission_duration: 50 // sub ends at 1450
        };

        // Ensure proper phase sequence
        assert!(
            schedule.current_phase(created_at, 1050) == Phase::Scheduled,
            "Should start in Scheduled phase",
        );
        assert!(
            schedule.current_phase(created_at, 1150) == Phase::Registration,
            "Should transition to Registration",
        );
        assert!(
            schedule.current_phase(created_at, 1250) == Phase::Staging,
            "Should transition to Staging",
        );
        assert!(
            schedule.current_phase(created_at, 1350) == Phase::Live, "Should transition to Live",
        );
        assert!(
            schedule.current_phase(created_at, 1420) == Phase::Submission,
            "Should transition to Submission",
        );
        assert!(
            schedule.current_phase(created_at, 1451) == Phase::Finalized,
            "Should end in Finalized phase",
        );

        // Test no gaps between phases
        assert!(
            schedule.current_phase(created_at, 1199) == Phase::Registration,
            "Should be in Registration until exact end",
        );
        assert!(
            schedule.current_phase(created_at, 1200) == Phase::Staging,
            "Should transition to Staging at exact time",
        );
        assert!(
            schedule.current_phase(created_at, 1299) == Phase::Staging,
            "Should be in Staging until exact game start",
        );
        assert!(
            schedule.current_phase(created_at, 1300) == Phase::Live,
            "Should transition to Live at exact time",
        );
    }
}
