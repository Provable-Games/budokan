use budokan::models::lifecycle::Lifecycle;

#[generate_trait]
pub impl LifecycleImpl of LifecycleTrait {
    /// @title Has Expired
    /// @notice Whether the game has expired
    /// @dev If no end time is set, the game will never expire
    /// @return True if the game has expired, false otherwise
    #[inline(always)]
    fn has_expired(self: @Lifecycle, current_time: u64) -> bool {
        match self.end {
            Option::Some(end) => current_time >= *end,
            Option::None => false,
        }
    }

    /// @title Can Start
    /// @notice Whether the game can be started
    /// @dev If no start time is set, the game can be started immediately
    /// @return True if the game can be started, false otherwise
    #[inline(always)]
    fn can_start(self: @Lifecycle, current_time: u64) -> bool {
        match self.start {
            Option::Some(start) => current_time >= *start,
            Option::None => true,
        }
    }

    /// @title Is Available
    /// @notice Whether the game is available to be played
    /// @dev If no delay or time limit is set, the game is available to be played immediately
    /// @return True if the game is available to be played, false otherwise
    #[inline(always)]
    fn is_playable(self: @Lifecycle, current_time: u64) -> bool {
        self.can_start(current_time) && !self.has_expired(current_time)
    }
}

#[generate_trait]
pub impl LifecycleAssertionsImpl of LifecycleAssertionsTrait {
    #[inline(always)]
    fn assert_not_expired(self: @Lifecycle, game_id: u64, current_time: u64) {
        // safe to unwrap because game cannot be expired if it does not have an end time
        assert!(
            !self.has_expired(current_time), "Game {} expired at {}", game_id, (*self.end).unwrap(),
        );
    }

    #[inline(always)]
    fn assert_can_start(self: @Lifecycle, game_id: u64, current_time: u64) {
        // safe to unwrap because only games with a start time can not be started
        assert!(
            self.can_start(current_time),
            "Game {} cannot start until {}",
            game_id,
            (*self.start).unwrap(),
        );
    }

    #[inline(always)]
    fn assert_is_playable(self: @Lifecycle, game_id: u64, current_time: u64) {
        self.assert_can_start(game_id, current_time);
        self.assert_not_expired(game_id, current_time);
    }
}

#[cfg(test)]
mod tests {
    use budokan::models::lifecycle::Lifecycle;
    use core::num::traits::Bounded;
    use super::{LifecycleAssertionsTrait, LifecycleTrait};

    #[test]
    fn can_start() {
        // Case 1: With explicit start time
        let lifecycle = @Lifecycle { mint: 100, start: Option::Some(120), end: Option::None };
        assert!(!lifecycle.can_start(119), "Should not start before time");
        assert!(lifecycle.can_start(120), "Should start at exact time");
        assert!(lifecycle.can_start(121), "Should start after time");

        // Case 2: No start time (immediate start)
        let no_delay = @Lifecycle { mint: 100, start: Option::None, end: Option::None };
        assert!(no_delay.can_start(100), "Should start immediately");
    }

    #[test]
    fn has_expired() {
        // Case 1: With end time
        let lifecycle = @Lifecycle { mint: 100, start: Option::None, end: Option::Some(150) };
        assert!(!lifecycle.has_expired(149), "Should not be expired before time");
        assert!(lifecycle.has_expired(150), "Should be expired at exact time");
        assert!(lifecycle.has_expired(151), "Should be expired after time");

        // Case 2: No end time (never expires)
        let no_limit = @Lifecycle { mint: 100, start: Option::None, end: Option::None };
        assert!(!no_limit.has_expired(Bounded::MAX - 1), "Should never expire");
    }

    #[test]
    fn is_playable() {
        // Case 1: No restrictions
        let no_restrictions = @Lifecycle { mint: 100, start: Option::None, end: Option::None };
        assert!(no_restrictions.is_playable(150), "Should be playable without restrictions");

        // Case 2: Before start time
        let not_started = @Lifecycle { mint: 100, start: Option::Some(200), end: Option::None };
        assert!(!not_started.is_playable(150), "Should not be playable before start");

        // Case 3: After end time
        let expired = @Lifecycle { mint: 100, start: Option::None, end: Option::Some(140) };
        assert!(!expired.is_playable(150), "Should not be playable after expiry");

        // Case 4: Within valid window
        let valid = @Lifecycle { mint: 100, start: Option::Some(120), end: Option::Some(160) };
        assert!(!valid.is_playable(110), "Should not be playable before start");
        assert!(valid.is_playable(130), "Should be playable in valid window");
        assert!(!valid.is_playable(170), "Should not be playable after end");
    }

    #[test]
    #[should_panic(expected: "Game 1 cannot start until 120")]
    fn assert_can_start() {
        let lifecycle = @Lifecycle { mint: 100, start: Option::Some(120), end: Option::None };
        lifecycle.assert_can_start(1, 110);
    }

    #[test]
    #[should_panic(expected: "Game 1 expired at 150")]
    fn assert_not_expired() {
        let lifecycle = @Lifecycle { mint: 100, start: Option::None, end: Option::Some(150) };
        lifecycle.assert_not_expired(1, 151);
    }

    #[test]
    #[should_panic(expected: "Game 1 cannot start until 120")]
    fn assert_is_playable() {
        let lifecycle = @Lifecycle { mint: 100, start: Option::Some(120), end: Option::Some(150) };
        lifecycle.assert_is_playable(1, 110);
    }

    #[test]
    fn boundary_conditions() {
        // Test u64 boundaries
        let max_time = @Lifecycle { mint: 0, start: Option::Some(Bounded::MAX), end: Option::None };
        assert!(!max_time.can_start(Bounded::MAX - 1), "Should not start before max time");
        assert!(max_time.can_start(Bounded::MAX), "Should start at max time");

        // Test mint time at max
        let max_end = @Lifecycle {
            mint: Bounded::MAX, start: Option::None, end: Option::Some(Bounded::MAX),
        };
        assert!(
            max_end.is_playable(Bounded::MAX - 1), "Should be playable at one sec before max time",
        );
        assert!(!max_end.is_playable(Bounded::MAX), "Should not be playable at max time");
    }
}
