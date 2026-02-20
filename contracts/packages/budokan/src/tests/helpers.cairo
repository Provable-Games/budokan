use budokan::models::budokan::{GameConfig, Metadata, Tournament};
use budokan::models::constants::{
    MAX_REGISTRATION_PERIOD, MAX_TOURNAMENT_LENGTH, MIN_REGISTRATION_PERIOD,
};
use budokan::models::schedule::{Period, Schedule};
use budokan::tests::constants::{
    OWNER, TEST_END_TIME, TEST_REGISTRATION_END_TIME, TEST_REGISTRATION_START_TIME, TEST_START_TIME,
    TOURNAMENT_DESCRIPTION, TOURNAMENT_NAME,
};
use budokan_interfaces::budokan::{IBudokanDispatcher, IBudokanDispatcherTrait};
use starknet::ContractAddress;

//
// Test Helpers
//
pub fn test_metadata() -> Metadata {
    Metadata { name: TOURNAMENT_NAME(), description: TOURNAMENT_DESCRIPTION() }
}

pub fn test_game_config(game_address: ContractAddress) -> GameConfig {
    GameConfig { address: game_address, settings_id: 1, soulbound: false, play_url: "" }
}

pub fn test_schedule() -> Schedule {
    Schedule { registration: Option::Some(test_registration_period()), game: test_game_period() }
}

pub fn test_season_schedule() -> Schedule {
    Schedule { registration: Option::None, game: test_game_period() }
}

pub fn custom_schedule(registration: Option<Period>, game: Period) -> Schedule {
    Schedule { registration, game }
}

pub fn start_time_too_soon() -> Period {
    Period { start: 0, end: TEST_REGISTRATION_END_TIME().into() }
}

pub fn tournament_too_long() -> Schedule {
    custom_schedule(
        Option::None,
        Period {
            start: TEST_REGISTRATION_START_TIME().into(),
            end: TEST_REGISTRATION_START_TIME().into() + MAX_TOURNAMENT_LENGTH.into() + 1,
        },
    )
}

pub fn registration_period_too_short() -> Period {
    Period {
        start: TEST_REGISTRATION_START_TIME().into(),
        end: TEST_REGISTRATION_START_TIME().into() + MIN_REGISTRATION_PERIOD.into() - 1,
    }
}

pub fn registration_period_too_long() -> Period {
    Period {
        start: TEST_REGISTRATION_START_TIME().into(),
        end: TEST_REGISTRATION_START_TIME().into() + MAX_REGISTRATION_PERIOD.into() + 1,
    }
}

pub fn test_registration_period() -> Period {
    Period {
        start: TEST_REGISTRATION_START_TIME().into(), end: TEST_REGISTRATION_END_TIME().into(),
    }
}

pub fn test_game_period() -> Period {
    Period { start: TEST_START_TIME().into(), end: TEST_END_TIME().into() }
}

pub fn registration_open_beyond_tournament_end() -> Schedule {
    let tournament_period = Period { start: TEST_START_TIME().into(), end: TEST_END_TIME().into() };

    let registration_period = Period {
        start: TEST_REGISTRATION_START_TIME().into(), end: TEST_END_TIME().into() + 1,
    };

    custom_schedule(Option::Some(registration_period), tournament_period)
}

pub fn create_basic_tournament(budokan: IBudokanDispatcher, game: ContractAddress) -> Tournament {
    budokan
        .create_tournament(
            OWNER,
            test_metadata(),
            test_schedule(),
            test_game_config(game),
            Option::None,
            Option::None,
        )
}

/// Finalizes the leaderboard for a tournament by advancing time and submitting sorted token_ids.
pub fn finalize_leaderboard(
    budokan: IBudokanDispatcher,
    tournament_id: u64,
    sorted_token_ids: Span<felt252>,
    finalized_time: u64,
) {
    snforge_std::start_cheat_block_timestamp(budokan.contract_address, finalized_time);
    budokan.finalize_leaderboard_batch(tournament_id, sorted_token_ids);
}
