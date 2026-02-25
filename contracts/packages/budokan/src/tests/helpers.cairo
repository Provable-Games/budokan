use budokan::structs::budokan::{GameConfig, LeaderboardConfig, Metadata, Tournament};
use budokan::structs::constants::{
    MIN_REGISTRATION_PERIOD, MIN_SUBMISSION_PERIOD, MIN_TOURNAMENT_LENGTH,
};
use budokan::structs::schedule::Schedule;
use budokan::tests::constants::{
    OWNER, TEST_GAME_END_DELAY, TEST_GAME_START_DELAY, TEST_REGISTRATION_END_DELAY,
    TEST_REGISTRATION_START_DELAY, TEST_SUBMISSION_DURATION, TOURNAMENT_DESCRIPTION,
    TOURNAMENT_NAME,
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
    GameConfig {
        game_address,
        settings_id: 1,
        soulbound: false,
        paymaster: false,
        client_url: Option::None,
        renderer: Option::None,
    }
}

pub fn test_schedule() -> Schedule {
    Schedule {
        registration_start_delay: TEST_REGISTRATION_START_DELAY(),
        registration_end_delay: TEST_REGISTRATION_END_DELAY(),
        game_start_delay: TEST_GAME_START_DELAY(),
        game_end_delay: TEST_GAME_END_DELAY(),
        submission_duration: TEST_SUBMISSION_DURATION(),
    }
}

pub fn test_season_schedule() -> Schedule {
    Schedule {
        registration_start_delay: 0,
        registration_end_delay: 0,
        game_start_delay: 0,
        game_end_delay: MIN_TOURNAMENT_LENGTH,
        submission_duration: MIN_SUBMISSION_PERIOD,
    }
}

pub fn test_leaderboard_config() -> LeaderboardConfig {
    LeaderboardConfig { ascending: false, game_must_be_over: false }
}

pub fn create_basic_tournament(budokan: IBudokanDispatcher, game: ContractAddress) -> Tournament {
    create_basic_tournament_with_salt(budokan, game, 0)
}

pub fn create_basic_tournament_with_salt(
    budokan: IBudokanDispatcher, game: ContractAddress, salt: u16,
) -> Tournament {
    budokan
        .create_tournament(
            OWNER,
            test_metadata(),
            test_schedule(),
            test_game_config(game),
            Option::None,
            Option::None,
            test_leaderboard_config(),
            salt,
            0,
        )
}
